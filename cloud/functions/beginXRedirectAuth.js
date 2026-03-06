const admin = require("firebase-admin");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const {
  X_REDIRECT_FLOW_COLLECTION,
  X_REDIRECT_FLOW_TTL_MS,
  toCleanString,
  normalizeConsentSource,
  createXRedirectFlowId,
  createXCodeVerifier,
  buildXCodeChallenge,
  buildXRedirectCallbackUriFromCallable,
  resolveSafeReturnUrl,
  getXOauthClientId,
  buildXOauthUrl,
} = require("./xRedirectFlow");

exports.beginXRedirectAuth = onCall({ invoker: "public" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }
  const xDisabledValue = `${process.env.AUTH_DISABLE_X_VERIFY || ""}`.trim().toLowerCase();
  if (xDisabledValue === "1" || xDisabledValue === "true" || xDisabledValue === "yes") {
    throw new HttpsError("failed-precondition", "x-auth-disabled");
  }

  const requestData = request && request.data && typeof request.data === "object" ? request.data : {};
  const intentId = toCleanString(requestData.intentId);
  if (!intentId) {
    throw new HttpsError("invalid-argument", "intentId is required.");
  }

  const rawRequest = request.rawRequest || null;
  const consentSource = normalizeConsentSource(requestData.consentSource);
  const returnUrl = resolveSafeReturnUrl({
    rawReturnUrl: requestData.returnUrl,
    rawRequest,
  });
  const callbackUri = buildXRedirectCallbackUriFromCallable(request);
  const clientId = getXOauthClientId();
  const flowId = createXRedirectFlowId();
  const codeVerifier = createXCodeVerifier();
  const codeChallenge = buildXCodeChallenge(codeVerifier);
  const nowMs = Date.now();
  const expiresAtMs = nowMs + X_REDIRECT_FLOW_TTL_MS;

  const firestore = admin.firestore();
  const intentSnapshot = await firestore.collection("authIntents").doc(intentId).get();
  if (!intentSnapshot.exists) {
    throw new HttpsError("failed-precondition", "x-intent-invalid");
  }
  const intentData = intentSnapshot.data() || {};
  if (toCleanString(intentData.uid) !== request.auth.uid) {
    throw new HttpsError("permission-denied", "x-intent-user-mismatch");
  }
  if (toCleanString(intentData.method) !== "x") {
    throw new HttpsError("failed-precondition", "x-intent-method-mismatch");
  }
  if (Number(intentData.expiresAtMs) <= nowMs || Number(intentData.consumedAtMs) > 0) {
    throw new HttpsError("failed-precondition", "x-intent-invalid");
  }

  const flowDoc = {
    flowId,
    uid: request.auth.uid,
    method: "x",
    intentId,
    consentSource,
    returnUrl,
    callbackUri,
    codeVerifier,
    codeChallenge,
    status: "created",
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
    expiresAtMs,
    xUserId: null,
    xUsername: null,
    errorCode: null,
  };

  await firestore.collection(X_REDIRECT_FLOW_COLLECTION).doc(flowId).set(flowDoc, { merge: false });

  const authUrl = buildXOauthUrl({
    clientId,
    callbackUri,
    flowId,
    codeChallenge,
  });

  return {
    ok: true,
    flowId,
    authUrl,
    expiresAtMs,
  };
});
