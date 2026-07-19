const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { unlinkMethodForUid } = require("./authIdentity");
const { normalizeAuthMethod } = require("@mons/shared/auth");

exports.unlinkAuthMethod = onCall({ invoker: "public" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "The function must be called while authenticated.",
    );
  }
  const requestData =
    request && request.data && typeof request.data === "object"
      ? request.data
      : {};
  const rawMethod =
    typeof requestData.method === "string"
      ? requestData.method.trim().toLowerCase()
      : "";
  if (!rawMethod) {
    throw new HttpsError("invalid-argument", "method is required.");
  }
  const method = normalizeAuthMethod(rawMethod);
  if (!method) {
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
