const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { updateFrozenMaterials } = require("./wagerHelpers");

exports.cancelWagerProposal = onCall(async (request) => {
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
    throw new HttpsError("permission-denied", "You don't have permission to cancel this wager proposal.");
  }

  let removedProposal = null;
  const wagerRef = admin.database().ref(`invites/${inviteId}/wagers/${matchId}`);
  const txn = await wagerRef.transaction((current) => {
    const data = current || {};
    if (data.resolved || data.agreed) {
      return;
    }
    const proposals = data.proposals || {};
    const proposal = proposals[uid];
    if (!proposal) {
      return;
    }
    removedProposal = proposal;
    delete proposals[uid];
    data.proposals = proposals;
    return data;
  });

  if (!txn.committed || !removedProposal) {
    return { ok: false, reason: "proposal-missing" };
  }

  await updateFrozenMaterials(uid, { [removedProposal.material]: -removedProposal.count });
  return { ok: true };
});
