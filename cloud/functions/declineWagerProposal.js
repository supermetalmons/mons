const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { updateFrozenMaterials, resolveWagerParticipants } = require("./wagerHelpers");

exports.declineWagerProposal = onCall(async (request) => {
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
  const { opponentUid } = resolved;
  const resolvedDebug = { ...inviteDebug, opponentUid };

  let removedProposal = null;
  let txnDebug = null;
  const wagerRef = admin.database().ref(`invites/${inviteId}/wagers/${matchId}`);
  const txn = await wagerRef.transaction((current) => {
    const data = current || {};
    if (!current) {
      txnDebug = { step: "missing-data" };
    }
    if (data.resolved || data.agreed) {
      txnDebug = { step: "already-resolved", resolved: !!data.resolved, agreed: !!data.agreed };
      return;
    }
    const proposals = data.proposals || {};
    const proposal = proposals[opponentUid];
    if (!proposal) {
      txnDebug = { step: "proposal-missing", proposalKeys: Object.keys(proposals) };
      return;
    }
    removedProposal = proposal;
    delete proposals[opponentUid];
    data.proposals = proposals;
    return data;
  });

  if (!txn.committed || !removedProposal) {
    const latestSnap = await wagerRef.once("value");
    const latestData = latestSnap.val() || {};
    const latestProposals = latestData.proposals || {};
    return {
      ok: false,
      reason: "proposal-missing",
      debug: {
        ...resolvedDebug,
        txnDebug,
        latestProposalKeys: Object.keys(latestProposals),
        latestAgreed: !!latestData.agreed,
        latestResolved: !!latestData.resolved,
      },
    };
  }

  await updateFrozenMaterials(opponentUid, { [removedProposal.material]: -removedProposal.count });
  return { ok: true, debug: { ...resolvedDebug, removedProposal } };
});
