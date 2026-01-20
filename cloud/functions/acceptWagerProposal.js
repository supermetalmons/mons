const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { normalizeCount, readUserMiningMaterials, reserveAcceptedMaterials, updateFrozenMaterials, updateFrozenMaterialsWithCap, resolveWagerParticipants } = require("./wagerHelpers");

exports.acceptWagerProposal = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }

  const authUid = request.auth.uid;
  const authProfileId = request.auth.token && request.auth.token.profileId ? request.auth.token.profileId : null;
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
  if (!inviteData.guestId) {
    return { ok: false, reason: "missing-opponent" };
  }
  const resolved = await resolveWagerParticipants(inviteData, request.auth);
  if (resolved.error) {
    return { ok: false, reason: resolved.error };
  }
  const { playerUid, opponentUid, playerProfile } = resolved;

  const wagerSnap = await admin.database().ref(`invites/${inviteId}/wagers/${matchId}`).once("value");
  const wagerData = wagerSnap.val();
  if (!wagerData || wagerData.resolved || wagerData.agreed) {
    return { ok: false, reason: "proposal-missing" };
  }
  const proposals = wagerData.proposals || {};
  const opponentProposal = proposals[opponentUid];
  if (!opponentProposal) {
    return { ok: false, reason: "proposal-missing", debug: { authUid, authProfileId, hostId: inviteData.hostId || null, guestId: inviteData.guestId || null, playerUid, opponentUid, proposalKeys: Object.keys(proposals) } };
  }
  const ownProposal = proposals[playerUid] || null;
  const material = opponentProposal.material;
  const proposedCount = Number(opponentProposal.count) || 0;

  const totalMaterials = await readUserMiningMaterials(playerProfile.profileId);
  const acceptReserve = await reserveAcceptedMaterials(playerUid, material, proposedCount, ownProposal, totalMaterials);
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
    const currentOpponentProposal = currentProposals[opponentUid];
    if (!currentOpponentProposal || currentOpponentProposal.material !== material || Number(currentOpponentProposal.count) !== proposedCount) {
      return;
    }
    data.agreed = {
      material,
      count: acceptedCount,
      total: acceptedCount * 2,
      proposerId: opponentUid,
      accepterId: playerUid,
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
      await updateFrozenMaterialsWithCap(playerUid, rollback, totalMaterials);
    }
    const latestSnap = await wagerRef.once("value");
    const latestData = latestSnap.val() || {};
    const latestProposals = latestData.proposals || {};
    return {
      ok: false,
      reason: "proposal-unavailable",
      debug: {
        authUid,
        authProfileId,
        hostId: inviteData.hostId || null,
        guestId: inviteData.guestId || null,
        playerUid,
        opponentUid,
        proposalKeys: Object.keys(proposals),
        latestProposalKeys: Object.keys(latestProposals),
        latestAgreed: !!latestData.agreed,
        latestResolved: !!latestData.resolved,
        latestOpponentProposal: latestProposals[opponentUid] || null,
      },
    };
  }

  const proposerDelta = {};
  proposerDelta[material] = acceptedCount - normalizeCount(proposedCount);
  await updateFrozenMaterials(opponentUid, proposerDelta);

  return { ok: true, count: acceptedCount };
});
