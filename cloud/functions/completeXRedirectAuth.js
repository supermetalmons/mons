const admin = require("firebase-admin");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { consumeAuthIntent, normalizeMethodValue, linkVerifiedMethod, peekAuthOpReplay } = require("./authIdentity");
const {
  X_REDIRECT_FLOW_COLLECTION,
  X_REDIRECT_FLOW_TTL_MS,
  toCleanString,
  normalizeConsentSource,
} = require("./xRedirectFlow");

const isFlowExpired = (flowData, nowMs) => {
  const expiresAtMs = Number(flowData && flowData.expiresAtMs);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= 0) {
    return true;
  }
  if (expiresAtMs < nowMs) {
    return true;
  }
  const createdAtMs = Number(flowData && flowData.createdAtMs);
  if (Number.isFinite(createdAtMs) && createdAtMs > 0 && nowMs - createdAtMs > X_REDIRECT_FLOW_TTL_MS * 2) {
    return true;
  }
  return false;
};

exports.completeXRedirectAuth = onCall({ invoker: "public" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }
  const xDisabledValue = `${process.env.AUTH_DISABLE_X_VERIFY || ""}`.trim().toLowerCase();
  if (xDisabledValue === "1" || xDisabledValue === "true" || xDisabledValue === "yes") {
    throw new HttpsError("failed-precondition", "x-auth-disabled");
  }

  const requestData = request && request.data && typeof request.data === "object" ? request.data : {};
  const flowId = toCleanString(requestData.flowId);
  if (!flowId) {
    throw new HttpsError("invalid-argument", "flowId is required.");
  }

  const firestore = admin.firestore();
  const flowRef = firestore.collection(X_REDIRECT_FLOW_COLLECTION).doc(flowId);
  const flowSnapshot = await flowRef.get();
  if (!flowSnapshot.exists) {
    throw new HttpsError("failed-precondition", "x-redirect-flow-not-found");
  }
  const flowData = flowSnapshot.data() || {};
  const nowMs = Date.now();
  if (toCleanString(flowData.uid) !== request.auth.uid) {
    throw new HttpsError("permission-denied", "x-redirect-flow-user-mismatch");
  }
  const flowStatus = toCleanString(flowData.status);
  if (flowStatus === "completed" && flowData.result && typeof flowData.result === "object") {
    return flowData.result;
  }
  if (flowStatus === "failed") {
    const flowErrorCode = toCleanString(flowData.errorCode) || "x-redirect-failed";
    throw new HttpsError("failed-precondition", flowErrorCode);
  }
  if (isFlowExpired(flowData, nowMs)) {
    await flowRef.set(
      {
        status: "failed",
        errorCode: "x-redirect-flow-expired",
        updatedAtMs: nowMs,
      },
      { merge: true }
    );
    throw new HttpsError("deadline-exceeded", "x-redirect-flow-expired");
  }
  if (flowStatus !== "verified") {
    throw new HttpsError("failed-precondition", "x-redirect-not-ready");
  }

  const intentId = toCleanString(flowData.intentId);
  const xUserId = toCleanString(flowData.xUserId);
  if (!intentId || !xUserId) {
    throw new HttpsError("failed-precondition", "x-redirect-missing-verified-data");
  }

  const opId = `x-redirect:${flowId}`;
  const replay = await peekAuthOpReplay({
    opId,
    kind: "verify",
    method: "x",
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

  try {
    await consumeAuthIntent({
      uid: request.auth.uid,
      method: "x",
      intentId,
    });
  } catch (error) {
    const errorCode = toCleanString(error && error.message);
    if (errorCode === "intent-expired") {
      await flowRef.set(
        {
          status: "failed",
          errorCode: "x-redirect-flow-expired",
          updatedAtMs: Date.now(),
        },
        { merge: true }
      );
      throw new HttpsError("deadline-exceeded", "x-redirect-flow-expired");
    }
    throw error;
  }

  const requestEmoji = requestData.emoji ?? 1;
  const requestAura = requestData.aura ?? null;
  const consentSource = normalizeConsentSource(flowData.consentSource);
  const normalizedXUserId = normalizeMethodValue("x", xUserId);

  const response = await linkVerifiedMethod({
    uid: request.auth.uid,
    method: "x",
    methodValueRaw: xUserId,
    methodValueLookupRaw: xUserId,
    normalizedMethodValue: normalizedXUserId,
    requestEmoji,
    requestAura,
    xUsername: toCleanString(flowData.xUsername) || null,
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
