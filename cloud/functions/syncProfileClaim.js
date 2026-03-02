const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { syncProfileClaimForUid } = require("./authIdentity");

exports.syncProfileClaim = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }
  return syncProfileClaimForUid(request.auth.uid);
});
