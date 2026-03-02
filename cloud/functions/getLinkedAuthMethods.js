const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getLinkedMethodsForUid } = require("./authIdentity");

exports.getLinkedAuthMethods = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }
  return getLinkedMethodsForUid(request.auth.uid);
});
