const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

exports.editUsername = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }

  const newUsername = request.data.username;
  const uid = request.auth.uid;
  const firestore = admin.firestore();
  const userQuery = await firestore.collection("users").where("logins", "array-contains", uid).limit(1).get();

  if (userQuery.empty) {
    return { ok: false };
  } else {
    const userDoc = userQuery.docs[0];
    const userData = userDoc.data();
    const usernameBefore = userData.username;

    const takenUsernameError = "That name has been taken. Please choose another."; // TODO: respond with it when username is taken by another user

    return { ok: true }; // TODO: return false when could not update username
  }
});
