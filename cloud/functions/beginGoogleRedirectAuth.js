const admin = require("firebase-admin");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const {
  GOOGLE_REDIRECT_FLOW_COLLECTION,
  GOOGLE_REDIRECT_FLOW_TTL_MS,
  toCleanString,
  normalizeConsentSource,
  createGoogleRedirectFlowId,
  buildGoogleRedirectCallbackUriFromCallable,
  resolveSafeReturnUrl,
  getGoogleOauthClientId,
  buildGoogleOauthUrl,
} = require("./googleRedirectFlow");

exports.beginGoogleRedirectAuth = onCall({ invoker: "public" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }
  const requestData = request && request.data && typeof request.data === "object" ? request.data : {};
  const intentId = toCleanString(requestData.intentId);
  const nonce = toCleanString(requestData.nonce);
  if (!intentId) {
    throw new HttpsError("invalid-argument", "intentId is required.");
  }
  if (!nonce) {
    throw new HttpsError("invalid-argument", "nonce is required.");
  }

  const rawRequest = request.rawRequest || null;
  const consentSource = normalizeConsentSource(requestData.consentSource);
  const returnUrl = resolveSafeReturnUrl({
    rawReturnUrl: requestData.returnUrl,
    rawRequest,
  });
  const callbackUri = buildGoogleRedirectCallbackUriFromCallable(request);
  const clientId = getGoogleOauthClientId();
  const flowId = createGoogleRedirectFlowId();
  const nowMs = Date.now();
  const expiresAtMs = nowMs + GOOGLE_REDIRECT_FLOW_TTL_MS;

  const firestore = admin.firestore();
  const intentSnapshot = await firestore.collection("authIntents").doc(intentId).get();
  if (!intentSnapshot.exists) {
    throw new HttpsError("failed-precondition", "google-intent-invalid");
  }
  const intentData = intentSnapshot.data() || {};
  if (toCleanString(intentData.uid) !== request.auth.uid) {
    throw new HttpsError("permission-denied", "google-intent-user-mismatch");
  }
  if (toCleanString(intentData.method) !== "google") {
    throw new HttpsError("failed-precondition", "google-intent-method-mismatch");
  }
  if (Number(intentData.expiresAtMs) <= nowMs || Number(intentData.consumedAtMs) > 0) {
    throw new HttpsError("failed-precondition", "google-intent-invalid");
  }
  if (toCleanString(intentData.nonce) !== nonce) {
    throw new HttpsError("permission-denied", "google-intent-nonce-mismatch");
  }

  const flowDoc = {
    flowId,
    uid: request.auth.uid,
    method: "google",
    intentId,
    nonce,
    consentSource,
    returnUrl,
    callbackUri,
    status: "created",
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
    expiresAtMs,
    googleSub: null,
    googleEmailMasked: null,
    errorCode: null,
  };

  await firestore.collection(GOOGLE_REDIRECT_FLOW_COLLECTION).doc(flowId).set(flowDoc, { merge: false });

  const authUrl = buildGoogleOauthUrl({
    clientId,
    callbackUri,
    flowId,
    nonce,
  });

  return {
    ok: true,
    flowId,
    authUrl,
    expiresAtMs,
  };
});
