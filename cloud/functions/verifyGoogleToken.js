const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { consumeAuthIntent, verifyGoogleIdToken, normalizeMethodValue, linkVerifiedMethod, peekAuthOpReplay } = require("./authIdentity");

exports.verifyGoogleToken = onCall({ invoker: "public" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }
  const googleDisabledValue = `${process.env.AUTH_DISABLE_GOOGLE_VERIFY || ""}`.trim().toLowerCase();
  if (googleDisabledValue === "1" || googleDisabledValue === "true" || googleDisabledValue === "yes") {
    throw new HttpsError("failed-precondition", "google-auth-disabled");
  }

  const uid = request.auth.uid;
  const requestData = request && request.data && typeof request.data === "object" ? request.data : {};
  const idToken = typeof requestData.idToken === "string" ? requestData.idToken : "";
  const intentId = typeof requestData.intentId === "string" ? requestData.intentId : "";
  const requestEmoji = requestData.emoji ?? 1;
  const requestAura = requestData.aura ?? null;
  const opId = requestData.opId;
  const resolvedOpId = opId || (intentId ? `intent:${intentId}` : undefined);
  const consentSource = typeof requestData.consentSource === "string" ? requestData.consentSource : "signin";

  if (!idToken) {
    throw new HttpsError("invalid-argument", "idToken is required.");
  }
  if (!intentId) {
    throw new HttpsError("invalid-argument", "intentId is required.");
  }
  const replay = await peekAuthOpReplay({
    opId: resolvedOpId,
    kind: "verify",
    method: "google",
    uid,
  });
  if (replay) {
    return replay;
  }

  const intent = await consumeAuthIntent({
    uid,
    method: "google",
    intentId,
  });
  if (!intent || typeof intent.nonce !== "string" || intent.nonce === "") {
    throw new HttpsError("failed-precondition", "google-intent-invalid");
  }

  const tokenPayload = await verifyGoogleIdToken({
    idToken,
    expectedNonce: intent.nonce,
  });
  const normalizedGoogleSub = normalizeMethodValue("google", tokenPayload.sub);

  const response = await linkVerifiedMethod({
    uid,
    method: "google",
    methodValueRaw: tokenPayload.sub,
    normalizedMethodValue: normalizedGoogleSub,
    requestEmoji,
    requestAura,
    googleEmailMasked: tokenPayload.emailMasked || null,
    consentSource,
    preferredAddress: null,
    opId: resolvedOpId,
    request,
  });

  return response;
});
