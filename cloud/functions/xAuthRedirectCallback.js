const admin = require("firebase-admin");
const { onRequest } = require("firebase-functions/v2/https");
const { normalizeMethodValue } = require("./authIdentity");
const {
  X_REDIRECT_FLOW_COLLECTION,
  X_REDIRECT_FLOW_TTL_MS,
  toCleanString,
  normalizeConsentSource,
  buildXRedirectCallbackUriFromHttpRequest,
  getXOauthClientId,
  getXOauthClientSecret,
  buildXBasicAuthorizationHeader,
  buildReturnUrlWithXRedirectStatus,
} = require("./xRedirectFlow");

const setNoStoreHeaders = (response) => {
  response.set("Cache-Control", "no-store, no-cache, must-revalidate");
  response.set("Pragma", "no-cache");
  response.set("Expires", "0");
};

const redirectToResultPage = ({ response, returnUrl, flowId, status, errorCode, consentSource }) => {
  const targetUrl = buildReturnUrlWithXRedirectStatus({
    returnUrl,
    flowId,
    status,
    errorCode,
    consentSource,
  });
  setNoStoreHeaders(response);
  response.redirect(302, targetUrl);
};

const exchangeXCodeForAccessToken = async ({ code, callbackUri, codeVerifier }) => {
  const clientId = getXOauthClientId();
  const clientSecret = getXOauthClientSecret();
  const body = new URLSearchParams({
    code,
    grant_type: "authorization_code",
    redirect_uri: callbackUri,
    code_verifier: codeVerifier,
    client_id: clientId,
  });
  const tokenResponse = await fetch("https://api.x.com/2/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: buildXBasicAuthorizationHeader({ clientId, clientSecret }),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const tokenPayload = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok) {
    const providerError = toCleanString(tokenPayload && (tokenPayload.error_description || tokenPayload.error));
    if (providerError) {
      throw new Error(`x-token-exchange-${providerError.replace(/\s+/g, "-").toLowerCase()}`);
    }
    throw new Error("x-token-exchange-failed");
  }
  const accessToken = toCleanString(tokenPayload && tokenPayload.access_token);
  if (!accessToken) {
    throw new Error("x-token-missing-access-token");
  }
  return accessToken;
};

const fetchAuthenticatedXUser = async ({ accessToken }) => {
  const response = await fetch("https://api.x.com/2/users/me?user.fields=username", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const providerError = toCleanString(payload && (payload.title || payload.detail || payload.error));
    if (providerError) {
      throw new Error(`x-user-lookup-${providerError.replace(/\s+/g, "-").toLowerCase()}`);
    }
    throw new Error("x-user-lookup-failed");
  }
  const userData = payload && typeof payload.data === "object" ? payload.data : null;
  const xUserId = normalizeMethodValue("x", userData && userData.id);
  const xUsername = toCleanString(userData && userData.username);
  if (!xUserId) {
    throw new Error("x-user-lookup-missing-id");
  }
  return {
    xUserId,
    xUsername,
  };
};

exports.xAuthRedirectCallback = onRequest({ invoker: "public" }, async (request, response) => {
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
  const flowRef = firestore.collection(X_REDIRECT_FLOW_COLLECTION).doc(flowId);
  const flowSnapshot = await flowRef.get();
  if (!flowSnapshot.exists) {
    setNoStoreHeaders(response);
    response.status(400).send("X auth session not found.");
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
      errorCode: toCleanString(flowData.errorCode) || "x-redirect-failed",
      consentSource,
    });
    return;
  }

  const expiresAtMs = Number(flowData.expiresAtMs) || 0;
  const createdAtMs = Number(flowData.createdAtMs) || 0;
  if (expiresAtMs <= 0 || expiresAtMs < nowMs || (createdAtMs > 0 && nowMs - createdAtMs > X_REDIRECT_FLOW_TTL_MS * 2)) {
    await flowRef.set(
      {
        status: "failed",
        errorCode: "x-redirect-expired",
        updatedAtMs: nowMs,
      },
      { merge: true }
    );
    redirectToResultPage({
      response,
      returnUrl,
      flowId,
      status: "failed",
      errorCode: "x-redirect-expired",
      consentSource,
    });
    return;
  }

  const oauthError = toCleanString(request.query && request.query.error);
  if (oauthError) {
    const normalizedError = `x-oauth-${oauthError}`;
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
        errorCode: "x-oauth-missing-code",
        updatedAtMs: nowMs,
      },
      { merge: true }
    );
    redirectToResultPage({
      response,
      returnUrl,
      flowId,
      status: "failed",
      errorCode: "x-oauth-missing-code",
      consentSource,
    });
    return;
  }

  try {
    const callbackUri = toCleanString(flowData.callbackUri) || buildXRedirectCallbackUriFromHttpRequest(request);
    const accessToken = await exchangeXCodeForAccessToken({
      code,
      callbackUri,
      codeVerifier: toCleanString(flowData.codeVerifier),
    });
    const authenticatedUser = await fetchAuthenticatedXUser({
      accessToken,
    });
    await flowRef.set(
      {
        status: "verified",
        xUserId: authenticatedUser.xUserId,
        xUsername: authenticatedUser.xUsername || null,
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
    const errorCode = errorCodeRaw ? errorCodeRaw.slice(0, 120) : "x-redirect-verify-failed";
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
