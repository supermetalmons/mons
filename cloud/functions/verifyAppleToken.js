const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { consumeAuthIntent, verifyAppleIdToken, normalizeMethodValue, linkVerifiedMethod, peekAuthOpReplay } = require("./authIdentity");

exports.verifyAppleToken = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }
  const appleDisabledValue = `${process.env.AUTH_DISABLE_APPLE_VERIFY || ""}`.trim().toLowerCase();
  if (appleDisabledValue === "1" || appleDisabledValue === "true" || appleDisabledValue === "yes") {
    throw new HttpsError("failed-precondition", "apple-auth-disabled");
  }

  const uid = request.auth.uid;
  const idToken = typeof request.data.idToken === "string" ? request.data.idToken : "";
  const intentId = typeof request.data.intentId === "string" ? request.data.intentId : "";
  const requestEmoji = request.data.emoji ?? 1;
  const requestAura = request.data.aura ?? null;
  const opId = request.data.opId;
  const resolvedOpId = opId || (intentId ? `intent:${intentId}` : undefined);
  const consentSource = typeof request.data.consentSource === "string" ? request.data.consentSource : "signin";

  if (!idToken) {
    throw new HttpsError("invalid-argument", "idToken is required.");
  }
  if (!intentId) {
    throw new HttpsError("invalid-argument", "intentId is required.");
  }
  const replay = await peekAuthOpReplay({
    opId: resolvedOpId,
    kind: "verify",
    method: "apple",
    uid,
  });
  if (replay) {
    return replay;
  }

  const intent = await consumeAuthIntent({
    uid,
    method: "apple",
    intentId,
  });
  if (!intent || typeof intent.nonce !== "string" || intent.nonce === "") {
    throw new HttpsError("failed-precondition", "apple-intent-invalid");
  }

  const tokenPayload = await verifyAppleIdToken({
    idToken,
    expectedNonce: intent.nonce,
  });
  const normalizedAppleSub = normalizeMethodValue("apple", tokenPayload.sub);

  const response = await linkVerifiedMethod({
    uid,
    method: "apple",
    methodValueRaw: tokenPayload.sub,
    normalizedMethodValue: normalizedAppleSub,
    requestEmoji,
    requestAura,
    appleEmailMasked: tokenPayload.emailMasked || null,
    consentSource,
    preferredAddress: null,
    opId: resolvedOpId,
    request,
  });

  return response;
});
