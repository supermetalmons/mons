const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { isReservedExplicitUsername, setExplicitUsernameForProfile, clearUsernameForProfile } = require("./usernameRegistry");

exports.editUsername = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }

  const newUsername = request.data.username;
  if (typeof newUsername !== "string") {
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
  const usernameBefore = typeof userData.username === "string" ? userData.username.trim() : "";
  const trimmedUsername = newUsername.trim();

  if (isReservedExplicitUsername(trimmedUsername)) {
    return {
      ok: false,
      validationError: "This name is reserved.",
    };
  }

  if (usernameBefore === trimmedUsername) {
    return { ok: true };
  }

  if (trimmedUsername === "") {
    const hasApple = typeof userData.appleSub === "string" && userData.appleSub.trim() !== "";
    const hasX = typeof userData.xUserId === "string" && userData.xUserId.trim() !== "";
    const hasEth = typeof userData.eth === "string" && userData.eth.trim() !== "";
    const hasSol = typeof userData.sol === "string" && userData.sol.trim() !== "";
    if ((hasApple || hasX) && !hasEth && !hasSol) {
      return {
        ok: false,
        validationError: "Can't be empty.",
      };
    }
    await clearUsernameForProfile({ profileId: userDoc.id });
    return { ok: true };
  }

  if (trimmedUsername.length > 14) {
    return {
      ok: false,
      validationError: "Must be shorter than 15 characters.",
    };
  }

  if (!/^[a-zA-Z0-9]+$/.test(trimmedUsername)) {
    return {
      ok: false,
      validationError: "Use only letters and numbers.",
    };
  }

  const takenNameError = "That name has been taken. Choose another.";
  const claimResult = await setExplicitUsernameForProfile({
    profileId: userDoc.id,
    username: trimmedUsername,
  });
  if (claimResult.status === "taken") {
    return {
      ok: false,
      validationError: takenNameError,
    };
  }

  return { ok: true };
});
