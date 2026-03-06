const admin = require("firebase-admin");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { consumeAuthIntent, normalizeMethodValue, linkVerifiedMethod, peekAuthOpReplay } = require("./authIdentity");
const {
  GOOGLE_REDIRECT_FLOW_COLLECTION,
  GOOGLE_REDIRECT_FLOW_TTL_MS,
  toCleanString,
  normalizeConsentSource,
} = require("./googleRedirectFlow");

const isFlowExpired = (flowData, nowMs) => {
  const expiresAtMs = Number(flowData && flowData.expiresAtMs);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= 0) {
    return true;
  }
  if (expiresAtMs < nowMs) {
    return true;
  }
  const createdAtMs = Number(flowData && flowData.createdAtMs);
  if (Number.isFinite(createdAtMs) && createdAtMs > 0 && nowMs - createdAtMs > GOOGLE_REDIRECT_FLOW_TTL_MS * 2) {
    return true;
  }
  return false;
};

exports.completeGoogleRedirectAuth = onCall({ invoker: "public" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }
  const requestData = request && request.data && typeof request.data === "object" ? request.data : {};
  const flowId = toCleanString(requestData.flowId);
  if (!flowId) {
    throw new HttpsError("invalid-argument", "flowId is required.");
  }

  const firestore = admin.firestore();
  const flowRef = firestore.collection(GOOGLE_REDIRECT_FLOW_COLLECTION).doc(flowId);
  const flowSnapshot = await flowRef.get();
  if (!flowSnapshot.exists) {
    throw new HttpsError("failed-precondition", "google-redirect-flow-not-found");
  }
  const flowData = flowSnapshot.data() || {};
  const nowMs = Date.now();
  if (toCleanString(flowData.uid) !== request.auth.uid) {
    throw new HttpsError("permission-denied", "google-redirect-flow-user-mismatch");
  }
  if (isFlowExpired(flowData, nowMs)) {
    throw new HttpsError("deadline-exceeded", "google-redirect-flow-expired");
  }

  const flowStatus = toCleanString(flowData.status);
  if (flowStatus === "completed" && flowData.result && typeof flowData.result === "object") {
    return flowData.result;
  }
  if (flowStatus === "failed") {
    const flowErrorCode = toCleanString(flowData.errorCode) || "google-redirect-failed";
    throw new HttpsError("failed-precondition", flowErrorCode);
  }
  if (flowStatus !== "verified") {
    throw new HttpsError("failed-precondition", "google-redirect-not-ready");
  }

  const intentId = toCleanString(flowData.intentId);
  const googleSub = toCleanString(flowData.googleSub);
  if (!intentId || !googleSub) {
    throw new HttpsError("failed-precondition", "google-redirect-missing-verified-data");
  }

  const opId = `google-redirect:${flowId}`;
  const replay = await peekAuthOpReplay({
    opId,
    kind: "verify",
    method: "google",
    uid: request.auth.uid,
  });
  if (replay) {
    await flowRef.set(
      {
        status: "completed",
        result: replay,
        completedAtMs: Date.now(),
        updatedAtMs: Date.now(),
        errorCode: null,
      },
      { merge: true }
    );
    return replay;
  }

  await consumeAuthIntent({
    uid: request.auth.uid,
    method: "google",
    intentId,
  });

  const requestEmoji = requestData.emoji ?? 1;
  const requestAura = requestData.aura ?? null;
  const consentSource = normalizeConsentSource(flowData.consentSource);
  const normalizedGoogleSub = normalizeMethodValue("google", googleSub);
  if (!normalizedGoogleSub) {
    throw new HttpsError("failed-precondition", "google-redirect-invalid-subject");
  }

  const response = await linkVerifiedMethod({
    uid: request.auth.uid,
    method: "google",
    methodValueRaw: googleSub,
    normalizedMethodValue: normalizedGoogleSub,
    requestEmoji,
    requestAura,
    googleEmailMasked: toCleanString(flowData.googleEmailMasked) || null,
    consentSource,
    preferredAddress: null,
    opId,
    request,
  });

  await flowRef.set(
    {
      status: "completed",
      result: response,
      completedAtMs: Date.now(),
      updatedAtMs: Date.now(),
      errorCode: null,
    },
    { merge: true }
  );

  return response;
});
