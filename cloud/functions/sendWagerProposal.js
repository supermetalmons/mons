const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { isMaterialName, normalizeCount, reserveFrozenMaterials, updateFrozenMaterials, readUserMiningMaterials, resolveWagerParticipants } = require("./wagerHelpers");

exports.sendWagerProposal = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }

  const authUid = request.auth.uid;
  const authProfileId = request.auth.token && request.auth.token.profileId ? request.auth.token.profileId : null;
  const inviteId = request.data && request.data.inviteId;
  const matchId = request.data && request.data.matchId;
  const material = request.data && request.data.material;
  const requestedCount = normalizeCount(request.data && request.data.count);
  const baseDebug = { authUid, authProfileId, inviteId, matchId, material, requestedCount };

  if (typeof inviteId !== "string" || typeof matchId !== "string" || !isMaterialName(material) || requestedCount <= 0) {
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
  const { playerUid, playerProfile } = resolved;
  const playerDebug = { ...inviteDebug, playerUid };

  const totalMaterials = await readUserMiningMaterials(playerProfile.profileId);
  const reservedCount = await reserveFrozenMaterials(playerUid, material, requestedCount, totalMaterials);
  if (reservedCount <= 0) {
    return { ok: false, reason: "insufficient-materials", debug: { ...playerDebug, reservedCount } };
  }

  const wagerRef = admin.database().ref(`invites/${inviteId}/wagers/${matchId}`);
  const now = Date.now();
  const txn = await wagerRef.transaction((current) => {
    const data = current || {};
    if (data.resolved || data.agreed) {
      return;
    }
    const proposals = data.proposals || {};
    const proposedBy = data.proposedBy || {};
    if (proposals[playerUid] || proposedBy[playerUid]) {
      return;
    }
    proposals[playerUid] = { material, count: reservedCount, createdAt: now };
    proposedBy[playerUid] = true;
    data.proposals = proposals;
    data.proposedBy = proposedBy;
    return data;
  });

  if (!txn.committed) {
    await updateFrozenMaterials(playerUid, { [material]: -reservedCount });
    const latestSnap = await wagerRef.once("value");
    const latestData = latestSnap.val() || {};
    const latestProposals = latestData.proposals || {};
    return {
      ok: false,
      reason: "proposal-unavailable",
      debug: {
        ...playerDebug,
        reservedCount,
        latestAgreed: !!latestData.agreed,
        latestResolved: !!latestData.resolved,
        latestProposalKeys: Object.keys(latestProposals),
      },
    };
  }

  return { ok: true, count: reservedCount, debug: { ...playerDebug, reservedCount } };
});
