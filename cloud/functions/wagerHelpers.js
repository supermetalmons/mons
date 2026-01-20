const admin = require("firebase-admin");
const { HttpsError } = require("firebase-functions/v2/https");
const { MATERIAL_KEYS, normalizeMaterials } = require("./miningHelpers");
const { getProfileByLoginId } = require("./utils");

const isMaterialName = (value) => MATERIAL_KEYS.includes(value);

const normalizeCount = (value) => {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : 0;
};

const computeAvailableCount = (total, frozen, material) => {
  return Math.max(0, (total && total[material] ? total[material] : 0) - (frozen && frozen[material] ? frozen[material] : 0));
};

const applyMaterialDeltas = (source, deltas) => {
  const result = normalizeMaterials(source);
  MATERIAL_KEYS.forEach((key) => {
    const delta = deltas && deltas[key] ? Number(deltas[key]) : 0;
    const next = (result[key] ?? 0) + (Number.isFinite(delta) ? delta : 0);
    result[key] = Math.max(0, Math.round(next));
  });
  return result;
};

const applyMaterialDeltasWithCap = (source, deltas, totalMaterials) => {
  const result = normalizeMaterials(source);
  const caps = totalMaterials ? normalizeMaterials(totalMaterials) : null;
  MATERIAL_KEYS.forEach((key) => {
    const delta = deltas && deltas[key] ? Number(deltas[key]) : 0;
    let next = (result[key] ?? 0) + (Number.isFinite(delta) ? delta : 0);
    next = Math.max(0, Math.round(next));
    if (caps) {
      next = Math.min(next, caps[key] ?? 0);
    }
    result[key] = next;
  });
  return result;
};

const updateFrozenMaterials = async (uid, deltas) => {
  const frozenRef = admin.database().ref(`players/${uid}/mining/frozen`);
  await frozenRef.transaction((current) => {
    return applyMaterialDeltas(current, deltas);
  });
};

const updateFrozenMaterialsWithCap = async (uid, deltas, totalMaterials) => {
  const frozenRef = admin.database().ref(`players/${uid}/mining/frozen`);
  await frozenRef.transaction((current) => {
    return applyMaterialDeltasWithCap(current, deltas, totalMaterials);
  });
};

const reserveFrozenMaterials = async (uid, material, count, totalMaterials) => {
  let reservedCount = 0;
  const frozenRef = admin.database().ref(`players/${uid}/mining/frozen`);
  const result = await frozenRef.transaction((current) => {
    const normalized = normalizeMaterials(current);
    const available = computeAvailableCount(totalMaterials, normalized, material);
    const nextCount = Math.min(count, available);
    if (nextCount <= 0) {
      reservedCount = 0;
      return;
    }
    reservedCount = nextCount;
    normalized[material] = (normalized[material] ?? 0) + nextCount;
    return normalized;
  });
  if (!result.committed) {
    reservedCount = 0;
  }
  return reservedCount;
};

const reserveAcceptedMaterials = async (uid, material, proposedCount, ownProposal, totalMaterials) => {
  let acceptedCount = 0;
  let appliedDelta = null;
  const frozenRef = admin.database().ref(`players/${uid}/mining/frozen`);
  const caps = normalizeMaterials(totalMaterials);
  const ownMaterial = ownProposal && ownProposal.material ? ownProposal.material : null;
  const ownCount = ownProposal ? normalizeCount(ownProposal.count) : 0;
  const result = await frozenRef.transaction((current) => {
    const normalized = normalizeMaterials(current);
    const next = { ...normalized };
    if (ownMaterial) {
      next[ownMaterial] = Math.max(0, (next[ownMaterial] ?? 0) - ownCount);
    }
    const baseFrozen = next[material] ?? 0;
    const available = Math.max(0, (caps[material] ?? 0) - baseFrozen);
    const nextAccepted = Math.min(proposedCount, available);
    if (nextAccepted <= 0) {
      acceptedCount = 0;
      return;
    }
    acceptedCount = nextAccepted;
    next[material] = Math.min(caps[material] ?? 0, baseFrozen + nextAccepted);
    appliedDelta = MATERIAL_KEYS.reduce((acc, key) => {
      const diff = (next[key] ?? 0) - (normalized[key] ?? 0);
      if (diff !== 0) {
        acc[key] = diff;
      }
      return acc;
    }, {});
    return next;
  });
  if (!result.committed) {
    acceptedCount = 0;
    appliedDelta = null;
  }
  return { acceptedCount, appliedDelta };
};

const readFrozenMaterials = async (uid) => {
  const snap = await admin.database().ref(`players/${uid}/mining/frozen`).once("value");
  return normalizeMaterials(snap.val());
};

const readUserMiningMaterials = async (profileId) => {
  const doc = await admin.firestore().collection("users").doc(profileId).get();
  if (!doc.exists) {
    return normalizeMaterials();
  }
  const data = doc.data() || {};
  return normalizeMaterials(data.mining && data.mining.materials);
};

const updateUserMiningMaterials = async (profileId, materials) => {
  const userRef = admin.firestore().collection("users").doc(profileId);
  await userRef.update({
    "mining.materials": normalizeMaterials(materials),
  });
};

const resolveWagerParticipants = async (inviteData, auth) => {
  const hostId = inviteData.hostId;
  const guestId = inviteData.guestId;
  if (!hostId || !guestId) {
    return { error: "missing-opponent" };
  }
  const hostProfile = await getProfileByLoginId(hostId);
  const guestProfile = await getProfileByLoginId(guestId);
  if (!hostProfile.profileId || !guestProfile.profileId) {
    return { error: "profile-not-found" };
  }
  const authUid = auth.uid;
  const authProfileId = auth.token && auth.token.profileId;
  const hasProfileClaim = typeof authProfileId === "string" && authProfileId !== "";
  const isHost = authUid === hostId || (hasProfileClaim && authProfileId === hostProfile.profileId);
  const isGuest = authUid === guestId || (hasProfileClaim && authProfileId === guestProfile.profileId);
  if (!isHost && !isGuest) {
    throw new HttpsError("permission-denied", "You don't have permission to manage this wager.");
  }
  return {
    playerUid: isHost ? hostId : guestId,
    opponentUid: isHost ? guestId : hostId,
    playerProfile: isHost ? hostProfile : guestProfile,
    opponentProfile: isHost ? guestProfile : hostProfile,
  };
};

const removeWagerProposalWithRetry = async (inviteId, matchId, proposalUid, attempts = 2) => {
  const wagerRef = admin.database().ref(`invites/${inviteId}/wagers/${matchId}`);
  let lastDebug = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const beforeSnap = await wagerRef.once("value");
    const beforeData = beforeSnap.val() || {};
    if (!beforeSnap.exists()) {
      lastDebug = { attempt, step: "missing-data" };
      return { ok: false, debug: lastDebug };
    }
    if (beforeData.resolved || beforeData.agreed) {
      lastDebug = { attempt, step: "already-resolved", resolved: !!beforeData.resolved, agreed: !!beforeData.agreed };
      return { ok: false, debug: lastDebug };
    }
    const proposals = beforeData.proposals || {};
    const proposal = proposals[proposalUid];
    if (!proposal) {
      lastDebug = { attempt, step: "proposal-missing", proposalKeys: Object.keys(proposals) };
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 160));
        continue;
      }
      return { ok: false, debug: lastDebug };
    }
    await wagerRef.child(`proposals/${proposalUid}`).remove();
    const afterSnap = await wagerRef.once("value");
    const afterData = afterSnap.val() || {};
    const afterProposals = afterData.proposals || {};
    const stillExists = !!afterProposals[proposalUid];
    const canUnfreeze = !afterData.agreed && !afterData.resolved;
    lastDebug = {
      attempt,
      step: stillExists ? "proposal-still-present" : "proposal-removed",
      latestProposalKeys: Object.keys(afterProposals),
      latestAgreed: !!afterData.agreed,
      latestResolved: !!afterData.resolved,
    };
    if (!stillExists) {
      return { ok: true, removedProposal: proposal, canUnfreeze, debug: lastDebug };
    }
    if (attempt < attempts) {
      await new Promise((resolve) => setTimeout(resolve, 160));
      continue;
    }
  }
  return { ok: false, debug: lastDebug };
};

module.exports = {
  isMaterialName,
  normalizeCount,
  computeAvailableCount,
  applyMaterialDeltas,
  applyMaterialDeltasWithCap,
  updateFrozenMaterials,
  updateFrozenMaterialsWithCap,
  reserveFrozenMaterials,
  reserveAcceptedMaterials,
  readFrozenMaterials,
  readUserMiningMaterials,
  updateUserMiningMaterials,
  resolveWagerParticipants,
  removeWagerProposalWithRetry,
};
