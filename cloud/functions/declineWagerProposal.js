const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { updateFrozenMaterials, resolveWagerParticipants } = require("./wagerHelpers");

exports.declineWagerProposal = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }

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
  const { opponentUid } = resolved;

  let removedProposal = null;
  const wagerRef = admin.database().ref(`invites/${inviteId}/wagers/${matchId}`);
  const txn = await wagerRef.transaction((current) => {
    const data = current || {};
    if (data.resolved || data.agreed) {
      return;
    }
    const proposals = data.proposals || {};
    const proposal = proposals[opponentUid];
    if (!proposal) {
      return;
    }
    removedProposal = proposal;
    delete proposals[opponentUid];
    data.proposals = proposals;
    return data;
  });

  if (!txn.committed || !removedProposal) {
    return { ok: false, reason: "proposal-missing" };
  }

  await updateFrozenMaterials(opponentUid, { [removedProposal.material]: -removedProposal.count });
  return { ok: true };
});
