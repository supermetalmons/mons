const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { unlinkMethodForUid } = require("./authIdentity");

exports.unlinkAuthMethod = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }
  const requestData = request && request.data && typeof request.data === "object" ? request.data : {};
  const method = typeof requestData.method === "string" ? requestData.method.trim().toLowerCase() : "";
  if (!method) {
    throw new HttpsError("invalid-argument", "method is required.");
  }
  if (!["eth", "sol", "apple"].includes(method)) {
    throw new HttpsError("invalid-argument", "Unsupported auth method.");
  }
  const opId = requestData.opId;
  return unlinkMethodForUid({
    uid: request.auth.uid,
    method,
    opId,
    request,
  });
});
