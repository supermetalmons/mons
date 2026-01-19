const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { getProfileByLoginId } = require("./utils");
const { normalizeCount, readUserMiningMaterials, reserveAcceptedMaterials, updateFrozenMaterials, updateFrozenMaterialsWithCap } = require("./wagerHelpers");

exports.acceptWagerProposal = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }

  const uid = request.auth.uid;
  const inviteId = request.data && request.data.inviteId;
  const matchId = request.data && request.data.matchId;

  if (typeof inviteId !== "string" || typeof matchId !== "string") {
    return { ok: false, reason: "invalid-argument" };
  }
  if (inviteId.startsWith("auto_")) {
    return { ok: false, reason: "automatch-disabled" };
  }

  const inviteSnap = await admin.database().ref(`invites/${inviteId}`).once("value");
  const inviteData = inviteSnap.val();
  if (!inviteData) {
    return { ok: false, reason: "invite-not-found" };
  }
  const hostId = inviteData.hostId;
  const guestId = inviteData.guestId;
  if (uid !== hostId && uid !== guestId) {
    throw new HttpsError("permission-denied", "You don't have permission to accept this wager proposal.");
  }
  if (!guestId) {
    return { ok: false, reason: "missing-opponent" };
  }
  const opponentId = uid === hostId ? guestId : hostId;

  const playerProfile = await getProfileByLoginId(uid);
  const opponentProfile = await getProfileByLoginId(opponentId);
  if (!playerProfile.profileId || !opponentProfile.profileId) {
    return { ok: false, reason: "profile-not-found" };
  }

  const wagerSnap = await admin.database().ref(`invites/${inviteId}/wagers/${matchId}`).once("value");
  const wagerData = wagerSnap.val();
  if (!wagerData || wagerData.resolved || wagerData.agreed) {
    return { ok: false, reason: "proposal-missing" };
  }
  const proposals = wagerData.proposals || {};
  const opponentProposal = proposals[opponentId];
  if (!opponentProposal) {
    return { ok: false, reason: "proposal-missing" };
  }
  const ownProposal = proposals[uid] || null;
  const material = opponentProposal.material;
  const proposedCount = Number(opponentProposal.count) || 0;

  const totalMaterials = await readUserMiningMaterials(playerProfile.profileId);
  const acceptReserve = await reserveAcceptedMaterials(uid, material, proposedCount, ownProposal, totalMaterials);
  const acceptedCount = acceptReserve.acceptedCount;
  const appliedDelta = acceptReserve.appliedDelta;
  if (acceptedCount <= 0 || !appliedDelta) {
    return { ok: false, reason: "insufficient-materials" };
  }

  const wagerRef = admin.database().ref(`invites/${inviteId}/wagers/${matchId}`);
  const now = Date.now();
  const txn = await wagerRef.transaction((current) => {
    const data = current || {};
    if (data.resolved || data.agreed) {
      return;
    }
    const currentProposals = data.proposals || {};
    const currentOpponentProposal = currentProposals[opponentId];
    if (!currentOpponentProposal || currentOpponentProposal.material !== material || Number(currentOpponentProposal.count) !== proposedCount) {
      return;
    }
    data.agreed = {
      material,
      count: acceptedCount,
      total: acceptedCount * 2,
      proposerId: opponentId,
      accepterId: uid,
      acceptedAt: now,
    };
    data.proposals = {};
    return data;
  });

  if (!txn.committed) {
    const rollback = Object.keys(appliedDelta).reduce((acc, key) => {
      acc[key] = -appliedDelta[key];
      return acc;
    }, {});
    if (Object.keys(rollback).length > 0) {
      await updateFrozenMaterialsWithCap(uid, rollback, totalMaterials);
    }
    return { ok: false, reason: "proposal-unavailable" };
  }

  const proposerDelta = {};
  proposerDelta[material] = acceptedCount - normalizeCount(proposedCount);
  await updateFrozenMaterials(opponentId, proposerDelta);

  return { ok: true, count: acceptedCount };
});
