const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

exports.editUsername = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }

  const newUsername = request.data.username;
  if (!newUsername || typeof newUsername !== "string") {
    return { ok: false };
  }

  const uid = request.auth.uid;
  const firestore = admin.firestore();
  const userQuery = await firestore.collection("users").where("logins", "array-contains", uid).limit(1).get();

  if (userQuery.empty) {
    return { ok: false };
  }

  const userDoc = userQuery.docs[0];
  const userData = userDoc.data();
  const usernameBefore = userData.username;

  if (usernameBefore === newUsername) {
    return { ok: true };
  }

  const takenNameError = "That name has been taken. Please choose another.";

  const usernameQuery = await firestore.collection("users").where("username", "==", newUsername).limit(1).get();
  if (!usernameQuery.empty) {
    return {
      ok: false,
      validationError: takenNameError,
    };
  }

  const result = await firestore.runTransaction(async (transaction) => {
    const usernameCheckSnapshot = await transaction.get(firestore.collection("users").where("username", "==", newUsername).limit(1));
    if (!usernameCheckSnapshot.empty) {
      return {
        ok: false,
        validationError: takenNameError,
      };
    }

    const userRef = firestore.collection("users").doc(userDoc.id);
    transaction.update(userRef, { username: newUsername });
    return { ok: true };
  });

  return result;
});
