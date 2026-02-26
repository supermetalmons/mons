const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { markCanceledAutomatchBotMessage } = require("./utils");

exports.cancelAutomatch = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }

  const uid = request.auth.uid;
  console.log("auto:cancel:start", { uid });

  const userAutomatchQuery = admin.database().ref("automatch").orderByChild("uid").equalTo(uid).limitToFirst(1);
  const automatchSnapshot = await userAutomatchQuery.once("value");
  console.log("auto:cancel:snapshot", { exists: automatchSnapshot.exists() });

  if (!automatchSnapshot.exists()) {
    return { ok: false };
  }

  const inviteId = Object.keys(automatchSnapshot.val())[0];
  console.log("auto:cancel:inviteId", { inviteId });

  const guestIdRef = admin.database().ref(`invites/${inviteId}/guestId`);
  const guestIdSnapshot = await guestIdRef.once("value");
  const guestId = guestIdSnapshot.val();
  console.log("auto:cancel:guestCheck", { inviteId, guestId: !!guestId });
  if (guestId) {
    return { ok: false };
  }

  try {
    const updates = {};
    updates[`automatch/${inviteId}`] = null;
    updates[`invites/${inviteId}/automatchStateHint`] = "canceled";
    updates[`invites/${inviteId}/automatchCanceledAt`] = admin.database.ServerValue.TIMESTAMP;
    await admin.database().ref().update(updates);
    console.log("auto:cancel:db:ok", { inviteId });
  } catch (e) {
    console.error("auto:cancel:db:error", { inviteId, error: e && e.message ? e.message : e });
    return { ok: false };
  }

  const guestIdSnapshotAfter = await guestIdRef.once("value");
  const guestIdAfter = guestIdSnapshotAfter.val();
  console.log("auto:cancel:guestRecheck", { inviteId, guestId: !!guestIdAfter });
  if (guestIdAfter) {
    const matchedUpdates = {};
    matchedUpdates[`invites/${inviteId}/automatchStateHint`] = "matched";
    matchedUpdates[`invites/${inviteId}/automatchCanceledAt`] = null;
    await admin.database().ref().update(matchedUpdates);
    return { ok: false };
  }

  try {
    console.log("auto:cancel:markMessage", { inviteId });
    await markCanceledAutomatchBotMessage(inviteId);
  } catch (e) {
    console.error("auto:cancel:markMessage:error", { inviteId, error: e && e.message ? e.message : e });
  }

  return { ok: true };
});
