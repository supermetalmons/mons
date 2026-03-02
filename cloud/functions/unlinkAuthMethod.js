const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { unlinkMethodForUid } = require("./authIdentity");

exports.unlinkAuthMethod = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }
  const method = typeof request.data.method === "string" ? request.data.method : "";
  if (!method) {
    throw new HttpsError("invalid-argument", "method is required.");
  }
  const opId = request.data.opId;
  return unlinkMethodForUid({
    uid: request.auth.uid,
    method,
    opId,
    request,
  });
});
