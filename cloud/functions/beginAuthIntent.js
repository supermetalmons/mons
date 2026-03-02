const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { beginAuthIntent } = require("./authIdentity");

exports.beginAuthIntent = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }
  return beginAuthIntent(request);
});
