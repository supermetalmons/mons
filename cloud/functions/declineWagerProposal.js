const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { updateFrozenMaterials, resolveWagerParticipants, removeWagerProposalWithRetry } = require("./wagerHelpers");

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

  const removal = await removeWagerProposalWithRetry(inviteId, matchId, opponentUid);
  if (!removal.ok || !removal.removedProposal) {
    return { ok: false, reason: "proposal-missing", debug: { ...resolvedDebug, removalDebug: removal.debug } };
  }

  if (removal.canUnfreeze) {
    await updateFrozenMaterials(opponentUid, { [removal.removedProposal.material]: -removal.removedProposal.count });
  }
  return { ok: true, debug: { ...resolvedDebug, removedProposal: removal.removedProposal, removalDebug: removal.debug, canUnfreeze: removal.canUnfreeze } };
});
