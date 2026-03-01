const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

const normalizeString = (value) => (typeof value === "string" && value.trim() !== "" ? value.trim() : null);

const resolveProfileIdForLogin = async (loginUid) => {
  const normalizedLoginUid = normalizeString(loginUid);
  if (!normalizedLoginUid) {
    return null;
  }

  try {
    const profileSnapshot = await admin.database().ref(`players/${normalizedLoginUid}/profile`).once("value");
    const profileId = normalizeString(profileSnapshot.val());
    if (profileId) {
      return profileId;
    }
  } catch (error) {
    console.error("removeNavigationGame:profile-resolve:rtdb-read-failed", {
      loginUid: normalizedLoginUid,
      error: error && error.message ? error.message : error,
    });
  }

  try {
    const usersSnapshot = await admin
      .firestore()
      .collection("users")
      .where("logins", "array-contains", normalizedLoginUid)
      .limit(1)
      .get();
    if (!usersSnapshot.empty) {
      return usersSnapshot.docs[0].id;
    }
  } catch (error) {
    console.error("removeNavigationGame:profile-resolve:firestore-read-failed", {
      loginUid: normalizedLoginUid,
      error: error && error.message ? error.message : error,
    });
  }

  return null;
};

const getAutomatchStateHint = (inviteId, inviteData, automatchData) => {
  if (!inviteId.startsWith("auto_")) {
    return null;
  }
  if (automatchData) {
    return "pending";
  }
  if (normalizeString(inviteData ? inviteData.guestId : null)) {
    return "matched";
  }
  const marker = normalizeString(inviteData ? inviteData.automatchStateHint : null);
  if (marker === "pending" || marker === "matched" || marker === "canceled") {
    return marker;
  }
  const canceledAt = inviteData ? inviteData.automatchCanceledAt : null;
  if (typeof canceledAt === "number" && Number.isFinite(canceledAt) && canceledAt > 0) {
    return "canceled";
  }
  return "canceled";
};

exports.removeNavigationGame = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }

  const inviteId = normalizeString(request.data ? request.data.inviteId : null);
  if (!inviteId) {
    throw new HttpsError("invalid-argument", "inviteId is required.");
  }

  const loginUid = normalizeString(request.auth.uid);
  if (!loginUid) {
    throw new HttpsError("unauthenticated", "Login id is missing.");
  }

  const profileId = await resolveProfileIdForLogin(loginUid);
  if (!profileId) {
    return {
      ok: true,
      skipped: true,
      reason: "profile-unresolved",
      inviteId,
    };
  }

  const [inviteSnapshot, automatchSnapshot] = await Promise.all([
    admin.database().ref(`invites/${inviteId}`).once("value"),
    admin.database().ref(`automatch/${inviteId}`).once("value"),
  ]);

  if (!inviteSnapshot.exists()) {
    return {
      ok: true,
      skipped: true,
      reason: "invite-missing",
      inviteId,
    };
  }

  const inviteData = inviteSnapshot.val() || {};
  const guestId = normalizeString(inviteData.guestId);
  if (guestId) {
    return {
      ok: true,
      skipped: true,
      reason: "invite-active",
      inviteId,
    };
  }

  const automatchData = automatchSnapshot.exists() ? automatchSnapshot.val() : null;
  const automatchStateHint = getAutomatchStateHint(inviteId, inviteData, automatchData);
  if (automatchStateHint === "pending") {
    return {
      ok: true,
      skipped: true,
      reason: "pending-automatch",
      inviteId,
    };
  }

  const gameDocRef = admin.firestore().collection("users").doc(profileId).collection("games").doc(inviteId);

  let deleted = false;
  let skipReason = "not-found";

  await admin.firestore().runTransaction(async (transaction) => {
    const gameDocSnapshot = await transaction.get(gameDocRef);
    if (!gameDocSnapshot.exists) {
      skipReason = "not-found";
      return;
    }

    const statusValue = gameDocSnapshot.get("status");
    const status = typeof statusValue === "string" ? statusValue : null;
    if (status !== "waiting") {
      skipReason = status ? `status-${status}` : "status-missing";
      return;
    }

    transaction.delete(gameDocRef);
    deleted = true;
    skipReason = null;
  });

  return {
    ok: true,
    skipped: !deleted,
    deleted,
    reason: deleted ? null : skipReason,
    inviteId,
  };
});
