const admin = require("firebase-admin");
const { onRequest } = require("firebase-functions/v2/https");
const { verifyGoogleIdToken } = require("./authIdentity");
const {
  GOOGLE_REDIRECT_FLOW_COLLECTION,
  GOOGLE_REDIRECT_FLOW_TTL_MS,
  toCleanString,
  normalizeConsentSource,
  buildGoogleRedirectCallbackUriFromHttpRequest,
  getGoogleOauthClientId,
  getGoogleOauthClientSecret,
  buildReturnUrlWithGoogleRedirectStatus,
} = require("./googleRedirectFlow");

const setNoStoreHeaders = (response) => {
  response.set("Cache-Control", "no-store, no-cache, must-revalidate");
  response.set("Pragma", "no-cache");
  response.set("Expires", "0");
};

const redirectToResultPage = ({ response, returnUrl, flowId, status, errorCode, consentSource }) => {
  const targetUrl = buildReturnUrlWithGoogleRedirectStatus({
    returnUrl,
    flowId,
    status,
    errorCode,
    consentSource,
  });
  setNoStoreHeaders(response);
  response.redirect(302, targetUrl);
};

const exchangeGoogleCodeForIdToken = async ({
  code,
  callbackUri,
}) => {
  const clientId = getGoogleOauthClientId();
  const clientSecret = getGoogleOauthClientSecret();
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: callbackUri,
    grant_type: "authorization_code",
  });
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const tokenPayload = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok) {
    const providerError = toCleanString(tokenPayload && tokenPayload.error);
    if (providerError) {
      throw new Error(`google-token-exchange-${providerError}`);
    }
    throw new Error("google-token-exchange-failed");
  }
  const idToken = toCleanString(tokenPayload && tokenPayload.id_token);
  if (!idToken) {
    throw new Error("google-token-missing-id-token");
  }
  return idToken;
};

exports.googleAuthRedirectCallback = onRequest({ invoker: "public" }, async (request, response) => {
  if (request.method !== "GET") {
    setNoStoreHeaders(response);
    response.status(405).send("Method Not Allowed");
    return;
  }
  const flowId = toCleanString(request.query && request.query.state);
  if (!flowId) {
    setNoStoreHeaders(response);
    response.status(400).send("Missing state.");
    return;
  }

  const firestore = admin.firestore();
  const flowRef = firestore.collection(GOOGLE_REDIRECT_FLOW_COLLECTION).doc(flowId);
  const flowSnapshot = await flowRef.get();
  if (!flowSnapshot.exists) {
    setNoStoreHeaders(response);
    response.status(400).send("Google auth session not found.");
    return;
  }
  const flowData = flowSnapshot.data() || {};
  const nowMs = Date.now();
  const returnUrl = toCleanString(flowData.returnUrl) || "https://mons.link/";
  const consentSource = normalizeConsentSource(flowData.consentSource);
  const existingStatus = toCleanString(flowData.status);
  if (existingStatus === "completed" || existingStatus === "verified") {
    redirectToResultPage({
      response,
      returnUrl,
      flowId,
      status: "ready",
      errorCode: "",
      consentSource,
    });
    return;
  }
  if (existingStatus === "failed") {
    redirectToResultPage({
      response,
      returnUrl,
      flowId,
      status: "failed",
      errorCode: toCleanString(flowData.errorCode) || "google-redirect-failed",
      consentSource,
    });
    return;
  }
  const expiresAtMs = Number(flowData.expiresAtMs) || 0;
  if (expiresAtMs <= 0 || expiresAtMs < nowMs || nowMs - Number(flowData.createdAtMs || 0) > GOOGLE_REDIRECT_FLOW_TTL_MS * 2) {
    await flowRef.set(
      {
        status: "failed",
        errorCode: "google-redirect-expired",
        updatedAtMs: nowMs,
      },
      { merge: true }
    );
    redirectToResultPage({
      response,
      returnUrl,
      flowId,
      status: "failed",
      errorCode: "google-redirect-expired",
      consentSource,
    });
    return;
  }

  const oauthError = toCleanString(request.query && request.query.error);
  if (oauthError) {
    const normalizedError = `google-oauth-${oauthError}`;
    await flowRef.set(
      {
        status: "failed",
        errorCode: normalizedError,
        updatedAtMs: nowMs,
      },
      { merge: true }
    );
    redirectToResultPage({
      response,
      returnUrl,
      flowId,
      status: "failed",
      errorCode: normalizedError,
      consentSource,
    });
    return;
  }

  const code = toCleanString(request.query && request.query.code);
  if (!code) {
    await flowRef.set(
      {
        status: "failed",
        errorCode: "google-oauth-missing-code",
        updatedAtMs: nowMs,
      },
      { merge: true }
    );
    redirectToResultPage({
      response,
      returnUrl,
      flowId,
      status: "failed",
      errorCode: "google-oauth-missing-code",
      consentSource,
    });
    return;
  }

  try {
    const callbackUri = toCleanString(flowData.callbackUri) || buildGoogleRedirectCallbackUriFromHttpRequest(request);
    const idToken = await exchangeGoogleCodeForIdToken({
      code,
      callbackUri,
    });
    const verifiedPayload = await verifyGoogleIdToken({
      idToken,
      expectedNonce: toCleanString(flowData.nonce),
    });
    await flowRef.set(
      {
        status: "verified",
        googleSub: toCleanString(verifiedPayload.sub),
        googleEmailMasked: toCleanString(verifiedPayload.emailMasked) || null,
        errorCode: null,
        updatedAtMs: Date.now(),
      },
      { merge: true }
    );
    redirectToResultPage({
      response,
      returnUrl,
      flowId,
      status: "ready",
      errorCode: "",
      consentSource,
    });
  } catch (error) {
    const errorCodeRaw = toCleanString(error && error.message);
    const errorCode = errorCodeRaw ? errorCodeRaw.slice(0, 120) : "google-redirect-verify-failed";
    await flowRef.set(
      {
        status: "failed",
        errorCode,
        updatedAtMs: Date.now(),
      },
      { merge: true }
    );
    redirectToResultPage({
      response,
      returnUrl,
      flowId,
      status: "failed",
      errorCode,
      consentSource,
    });
  }
});
