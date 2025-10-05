const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { markCanceledAutomatchBotMessage } = require("./utils");

exports.cancelAutomatch = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }

  const uid = request.auth.uid;

  const userAutomatchQuery = admin.database().ref("automatch").orderByChild("uid").equalTo(uid).limitToFirst(1);
  const automatchSnapshot = await userAutomatchQuery.once("value");

  if (!automatchSnapshot.exists()) {
    return { ok: false };
  }

  const inviteId = Object.keys(automatchSnapshot.val())[0];

  const guestIdRef = admin.database().ref(`invites/${inviteId}/guestId`);
  const guestIdSnapshot = await guestIdRef.once("value");
  const guestId = guestIdSnapshot.val();
  if (guestId) {
    return { ok: false };
  }

  try {
    const updates = {};
    updates[`automatch/${inviteId}`] = null;
    await admin.database().ref().update(updates);
  } catch (e) {
    return { ok: false };
  }

  const guestIdSnapshotAfter = await guestIdRef.once("value");
  const guestIdAfter = guestIdSnapshotAfter.val();
  if (guestIdAfter) {
    return { ok: false };
  }

  try {
    markCanceledAutomatchBotMessage(inviteId);
  } catch (e) {}

  return { ok: true };
});
