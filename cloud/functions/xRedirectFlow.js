const crypto = require("crypto");
const { HttpsError } = require("firebase-functions/v2/https");

const X_REDIRECT_FLOW_COLLECTION = "xAuthRedirectFlows";
const X_REDIRECT_FLOW_TTL_MS = 10 * 60 * 1000;
const X_REDIRECT_CALLBACK_PATH = "/xAuthRedirectCallback";
const X_REDIRECT_RESULT_PARAMS = {
  flowId: "x_auth_flow",
  status: "x_auth_status",
  error: "x_auth_error",
  consentSource: "x_auth_consent",
};
const X_OAUTH_SCOPES = "tweet.read users.read";

const DEFAULT_ALLOWED_RETURN_ORIGINS = [
  "https://mons.link",
  "https://www.mons.link",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

const toCleanString = (value) => {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
};

const parseOriginOrEmpty = (value) => {
  const raw = toCleanString(value);
  if (!raw) {
    return "";
  }
  try {
    return new URL(raw).origin;
  } catch {
    return "";
  }
};

const normalizeConsentSource = (value) => {
  const normalized = toCleanString(value).toLowerCase();
  return normalized === "settings" ? "settings" : "signin";
};

const createXRedirectFlowId = () => crypto.randomBytes(18).toString("base64url");

const createXCodeVerifier = () => crypto.randomBytes(48).toString("base64url");

const buildXCodeChallenge = (codeVerifier) => {
  const verifier = toCleanString(codeVerifier);
  if (!verifier) {
    throw new HttpsError("invalid-argument", "codeVerifier is required.");
  }
  return crypto.createHash("sha256").update(verifier).digest("base64url");
};

const buildOriginFromHeaders = ({ headers, protocolHint }) => {
  const host = toCleanString(headers && headers.host);
  if (!host) {
    throw new HttpsError("internal", "x-redirect-host-missing");
  }
  const forwardedProtoRaw = toCleanString(headers && headers["x-forwarded-proto"]);
  const forwardedProto = forwardedProtoRaw ? forwardedProtoRaw.split(",")[0].trim() : "";
  const protocolCandidate = forwardedProto || toCleanString(protocolHint) || "https";
  const protocol = protocolCandidate === "http" ? "http" : "https";
  return `${protocol}://${host}`;
};

const buildXRedirectCallbackUriFromCallable = (request) => {
  if (!request || !request.rawRequest) {
    throw new HttpsError("internal", "x-redirect-request-missing");
  }
  const configured = toCleanString(process.env.X_OAUTH_REDIRECT_URI);
  if (configured) {
    return configured;
  }
  const origin = buildOriginFromHeaders({
    headers: request.rawRequest.headers || {},
    protocolHint: request.rawRequest.protocol,
  });
  return `${origin}${X_REDIRECT_CALLBACK_PATH}`;
};

const buildXRedirectCallbackUriFromHttpRequest = (request) => {
  const configured = toCleanString(process.env.X_OAUTH_REDIRECT_URI);
  if (configured) {
    return configured;
  }
  const origin = buildOriginFromHeaders({
    headers: request && request.headers ? request.headers : {},
    protocolHint: request ? request.protocol : "",
  });
  return `${origin}${X_REDIRECT_CALLBACK_PATH}`;
};

const getAllowedReturnOrigins = (rawRequest) => {
  const envConfigured = toCleanString(process.env.X_REDIRECT_ALLOWED_ORIGINS);
  const configuredOrigins = envConfigured
    ? envConfigured
        .split(",")
        .map((value) => toCleanString(value))
        .filter((value) => value !== "")
    : DEFAULT_ALLOWED_RETURN_ORIGINS;
  const allowed = new Set(
    configuredOrigins
      .map((value) => parseOriginOrEmpty(value))
      .filter((value) => value !== "")
  );

  const callerOrigin = parseOriginOrEmpty(rawRequest && rawRequest.headers && rawRequest.headers.origin);
  if (callerOrigin) {
    allowed.add(callerOrigin);
  }
  const callerRefererOrigin = parseOriginOrEmpty(rawRequest && rawRequest.headers && rawRequest.headers.referer);
  if (callerRefererOrigin) {
    allowed.add(callerRefererOrigin);
  }
  return allowed;
};

const resolveSafeReturnUrl = ({ rawReturnUrl, rawRequest }) => {
  const allowedOrigins = getAllowedReturnOrigins(rawRequest);
  const fallbackOrigin = Array.from(allowedOrigins)[0] || "https://mons.link";
  const fallbackUrl = `${fallbackOrigin}/`;
  const candidate = toCleanString(rawReturnUrl);
  if (!candidate) {
    return fallbackUrl;
  }
  let parsed = null;
  try {
    parsed = new URL(candidate);
  } catch {
    return fallbackUrl;
  }
  if (!allowedOrigins.has(parsed.origin)) {
    return fallbackUrl;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return fallbackUrl;
  }
  return parsed.toString();
};

const getXOauthClientId = () => {
  const clientId = toCleanString(process.env.X_CLIENT_ID);
  if (!clientId) {
    throw new HttpsError("failed-precondition", "X_CLIENT_ID is required.");
  }
  return clientId;
};

const getXOauthClientSecret = () => {
  const clientSecret = toCleanString(process.env.X_CLIENT_SECRET);
  if (!clientSecret) {
    throw new HttpsError("failed-precondition", "X_CLIENT_SECRET is required.");
  }
  return clientSecret;
};

const buildXOauthUrl = ({ clientId, callbackUri, flowId, codeChallenge }) => {
  const authUrl = new URL("https://x.com/i/oauth2/authorize");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", callbackUri);
  authUrl.searchParams.set("scope", X_OAUTH_SCOPES);
  authUrl.searchParams.set("state", flowId);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  return authUrl.toString();
};

const buildXBasicAuthorizationHeader = ({ clientId, clientSecret }) => {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64");
  return `Basic ${credentials}`;
};

const buildReturnUrlWithXRedirectStatus = ({
  returnUrl,
  flowId,
  status,
  errorCode,
  consentSource,
}) => {
  const nextUrl = new URL(returnUrl);
  nextUrl.searchParams.set(X_REDIRECT_RESULT_PARAMS.flowId, flowId);
  nextUrl.searchParams.set(X_REDIRECT_RESULT_PARAMS.status, status);
  if (errorCode) {
    nextUrl.searchParams.set(X_REDIRECT_RESULT_PARAMS.error, errorCode);
  } else {
    nextUrl.searchParams.delete(X_REDIRECT_RESULT_PARAMS.error);
  }
  nextUrl.searchParams.set(X_REDIRECT_RESULT_PARAMS.consentSource, normalizeConsentSource(consentSource));
  return nextUrl.toString();
};

module.exports = {
  X_REDIRECT_FLOW_COLLECTION,
  X_REDIRECT_FLOW_TTL_MS,
  X_REDIRECT_RESULT_PARAMS,
  X_OAUTH_SCOPES,
  toCleanString,
  normalizeConsentSource,
  createXRedirectFlowId,
  createXCodeVerifier,
  buildXCodeChallenge,
  buildXRedirectCallbackUriFromCallable,
  buildXRedirectCallbackUriFromHttpRequest,
  resolveSafeReturnUrl,
  getXOauthClientId,
  getXOauthClientSecret,
  buildXOauthUrl,
  buildXBasicAuthorizationHeader,
  buildReturnUrlWithXRedirectStatus,
};
