const admin = require("firebase-admin");
const { HttpsError } = require("firebase-functions/v2/https");
const {
  applyMaterialDeltas,
  applyMaterialDeltasWithCap,
  computeAcceptedReservation,
  computeAvailableCount,
  isMaterialName,
  normalizeCount,
  normalizeMaterials,
} = require("@mons/shared/mining");
const { getProfileByLoginId } = require("./utils");

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
    const available = computeAvailableCount(
      totalMaterials,
      normalized,
      material,
    );
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

const reserveAcceptedMaterials = async (
  uid,
  material,
  proposedCount,
  ownProposal,
  totalMaterials,
) => {
  let acceptedCount = 0;
  let appliedDelta = null;
  const frozenRef = admin.database().ref(`players/${uid}/mining/frozen`);
  const result = await frozenRef.transaction((current) => {
    const reservation = computeAcceptedReservation(
      current,
      material,
      proposedCount,
      ownProposal,
      totalMaterials,
    );
    acceptedCount = reservation.acceptedCount;
    appliedDelta = reservation.appliedDelta;
    if (!reservation.materials) {
      return;
    }
    return reservation.materials;
  });
  if (!result.committed) {
    acceptedCount = 0;
    appliedDelta = null;
  }
  return { acceptedCount, appliedDelta };
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
  const hasProfileClaim =
    typeof authProfileId === "string" && authProfileId !== "";
  const isHost =
    authUid === hostId ||
    (hasProfileClaim && authProfileId === hostProfile.profileId);
  const isGuest =
    authUid === guestId ||
    (hasProfileClaim && authProfileId === guestProfile.profileId);
  if (!isHost && !isGuest) {
    throw new HttpsError(
      "permission-denied",
      "You don't have permission to manage this wager.",
    );
  }
  return {
    playerUid: isHost ? hostId : guestId,
    opponentUid: isHost ? guestId : hostId,
    playerProfile: isHost ? hostProfile : guestProfile,
    opponentProfile: isHost ? guestProfile : hostProfile,
  };
};

const removeWagerProposalWithRetry = async (
  inviteId,
  matchId,
  proposalUid,
  attempts = 2,
) => {
  const wagerRef = admin
    .database()
    .ref(`invites/${inviteId}/wagers/${matchId}`);
  let lastDebug = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const beforeSnap = await wagerRef.once("value");
    const beforeData = beforeSnap.val() || {};
    if (!beforeSnap.exists()) {
      lastDebug = { attempt, step: "missing-data" };
      return { ok: false, debug: lastDebug };
    }
    if (beforeData.resolved || beforeData.agreed) {
      lastDebug = {
        attempt,
        step: "already-resolved",
        resolved: !!beforeData.resolved,
        agreed: !!beforeData.agreed,
      };
      return { ok: false, debug: lastDebug };
    }
    const proposals = beforeData.proposals || {};
    const proposal = proposals[proposalUid];
    if (!proposal) {
      lastDebug = {
        attempt,
        step: "proposal-missing",
        proposalKeys: Object.keys(proposals),
      };
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
      return {
        ok: true,
        removedProposal: proposal,
        canUnfreeze,
        debug: lastDebug,
      };
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
  applyMaterialDeltas,
  updateFrozenMaterials,
  updateFrozenMaterialsWithCap,
  reserveFrozenMaterials,
  reserveAcceptedMaterials,
  readUserMiningMaterials,
  updateUserMiningMaterials,
  resolveWagerParticipants,
  removeWagerProposalWithRetry,
};
