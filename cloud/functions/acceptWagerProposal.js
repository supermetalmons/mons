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
  const baseDebug = { authUid, authProfileId, inviteId, matchId };

  if (typeof inviteId !== "string" || typeof matchId !== "string") {
    return { ok: false, reason: "invalid-argument", debug: baseDebug };
  }
  if (inviteId.startsWith("auto_")) {
    return { ok: false, reason: "automatch-disabled", debug: baseDebug };
  }

  const inviteSnap = await admin.database().ref(`invites/${inviteId}`).once("value");
  const inviteData = inviteSnap.val();
  if (!inviteData) {
    return { ok: false, reason: "invite-not-found", debug: baseDebug };
  }
  const inviteDebug = { ...baseDebug, hostId: inviteData.hostId || null, guestId: inviteData.guestId || null };
  if (!inviteData.guestId) {
    return { ok: false, reason: "missing-opponent", debug: inviteDebug };
  }
  const resolved = await resolveWagerParticipants(inviteData, request.auth);
  if (resolved.error) {
    return { ok: false, reason: resolved.error, debug: inviteDebug };
  }
  const { playerUid, opponentUid, playerProfile } = resolved;
  const resolvedDebug = { ...inviteDebug, playerUid, opponentUid };

  const wagerSnap = await admin.database().ref(`invites/${inviteId}/wagers/${matchId}`).once("value");
  const wagerData = wagerSnap.val();
  if (!wagerData || wagerData.resolved || wagerData.agreed) {
    return { ok: false, reason: "proposal-missing", debug: { ...resolvedDebug, hasWager: !!wagerData, resolved: !!(wagerData && wagerData.resolved), agreed: !!(wagerData && wagerData.agreed) } };
  }
  const proposals = wagerData.proposals || {};
  const opponentProposal = proposals[opponentUid];
  if (!opponentProposal) {
    return { ok: false, reason: "proposal-missing", debug: { ...resolvedDebug, proposalKeys: Object.keys(proposals) } };
  }
  const ownProposal = proposals[playerUid] || null;
  const material = opponentProposal.material;
  const proposedCount = Number(opponentProposal.count) || 0;

  const totalMaterials = await readUserMiningMaterials(playerProfile.profileId);
  const acceptReserve = await reserveAcceptedMaterials(playerUid, material, proposedCount, ownProposal, totalMaterials);
  const acceptedCount = acceptReserve.acceptedCount;
  const appliedDelta = acceptReserve.appliedDelta;
  if (acceptedCount <= 0 || !appliedDelta) {
    return { ok: false, reason: "insufficient-materials", debug: { ...resolvedDebug, acceptedCount } };
  }

  const wagerRef = admin.database().ref(`invites/${inviteId}/wagers/${matchId}`);
  let txnDebug = null;
  const now = Date.now();
  const txn = await wagerRef.transaction((current) => {
    const data = current || {};
    if (!current) {
      txnDebug = { step: "missing-data" };
    }
    if (data.resolved || data.agreed) {
      txnDebug = { step: "already-resolved", resolved: !!data.resolved, agreed: !!data.agreed };
      return;
    }
    const currentProposals = data.proposals || {};
    const currentOpponentProposal = currentProposals[opponentUid];
    if (!currentOpponentProposal) {
      txnDebug = { step: "opponent-missing", proposalKeys: Object.keys(currentProposals) };
      return;
    }
    if (currentOpponentProposal.material !== material) {
      txnDebug = { step: "material-mismatch", expected: material, actual: currentOpponentProposal.material };
      return;
    }
    if (Number(currentOpponentProposal.count) !== proposedCount) {
      txnDebug = { step: "count-mismatch", expected: proposedCount, actual: currentOpponentProposal.count };
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
        ...resolvedDebug,
        proposalKeys: Object.keys(proposals),
        latestProposalKeys: Object.keys(latestProposals),
        latestAgreed: !!latestData.agreed,
        latestResolved: !!latestData.resolved,
        latestOpponentProposal: latestProposals[opponentUid] || null,
        txnDebug,
      },
    };
  }

  const proposerDelta = {};
  proposerDelta[material] = acceptedCount - normalizeCount(proposedCount);
  await updateFrozenMaterials(opponentUid, proposerDelta);

  return { ok: true, count: acceptedCount, debug: { ...resolvedDebug, acceptedCount } };
});
