const crypto = require("crypto");
const { HttpsError } = require("firebase-functions/v2/https");

const GOOGLE_REDIRECT_FLOW_COLLECTION = "googleAuthRedirectFlows";
const GOOGLE_REDIRECT_FLOW_TTL_MS = 10 * 60 * 1000;
const GOOGLE_REDIRECT_CALLBACK_PATH = "/googleAuthRedirectCallback";
const GOOGLE_REDIRECT_RESULT_PARAMS = {
  flowId: "google_auth_flow",
  status: "google_auth_status",
  error: "google_auth_error",
  consentSource: "google_auth_consent",
};

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
  if (normalized === "settings") {
    return "settings";
  }
  return "signin";
};

const createGoogleRedirectFlowId = () => {
  return crypto.randomBytes(18).toString("base64url");
};

const buildOriginFromHeaders = ({ headers, protocolHint }) => {
  const host = toCleanString(headers && headers.host);
  if (!host) {
    throw new HttpsError("internal", "google-redirect-host-missing");
  }
  const forwardedProtoRaw = toCleanString(headers && headers["x-forwarded-proto"]);
  const forwardedProto = forwardedProtoRaw ? forwardedProtoRaw.split(",")[0].trim() : "";
  const protocolCandidate = forwardedProto || toCleanString(protocolHint) || "https";
  const protocol = protocolCandidate === "http" ? "http" : "https";
  return `${protocol}://${host}`;
};

const buildGoogleRedirectCallbackUriFromCallable = (request) => {
  if (!request || !request.rawRequest) {
    throw new HttpsError("internal", "google-redirect-request-missing");
  }
  const rawRequest = request.rawRequest;
  const configured = toCleanString(process.env.GOOGLE_OAUTH_REDIRECT_URI);
  if (configured) {
    return configured;
  }
  const origin = buildOriginFromHeaders({
    headers: rawRequest.headers || {},
    protocolHint: rawRequest.protocol,
  });
  return `${origin}${GOOGLE_REDIRECT_CALLBACK_PATH}`;
};

const buildGoogleRedirectCallbackUriFromHttpRequest = (request) => {
  const configured = toCleanString(process.env.GOOGLE_OAUTH_REDIRECT_URI);
  if (configured) {
    return configured;
  }
  const origin = buildOriginFromHeaders({
    headers: request && request.headers ? request.headers : {},
    protocolHint: request ? request.protocol : "",
  });
  return `${origin}${GOOGLE_REDIRECT_CALLBACK_PATH}`;
};

const getAllowedReturnOrigins = (rawRequest) => {
  const envConfigured = toCleanString(process.env.GOOGLE_REDIRECT_ALLOWED_ORIGINS);
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

const getGoogleOauthClientId = () => {
  const directClientId = toCleanString(process.env.GOOGLE_CLIENT_ID);
  if (directClientId) {
    return directClientId;
  }
  const audiencesRaw = toCleanString(process.env.GOOGLE_AUDIENCES);
  if (audiencesRaw) {
    const firstAudience = audiencesRaw
      .split(",")
      .map((value) => toCleanString(value))
      .find((value) => value !== "");
    if (firstAudience) {
      return firstAudience;
    }
  }
  throw new HttpsError("failed-precondition", "GOOGLE_CLIENT_ID or GOOGLE_AUDIENCES is required.");
};

const getGoogleOauthClientSecret = () => {
  const secret = toCleanString(process.env.GOOGLE_CLIENT_SECRET);
  if (!secret) {
    throw new HttpsError("failed-precondition", "GOOGLE_CLIENT_SECRET is required.");
  }
  return secret;
};

const buildGoogleOauthUrl = ({ clientId, callbackUri, flowId, nonce }) => {
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", callbackUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", flowId);
  authUrl.searchParams.set("nonce", nonce);
  authUrl.searchParams.set("prompt", "select_account");
  authUrl.searchParams.set("include_granted_scopes", "true");
  return authUrl.toString();
};

const buildReturnUrlWithGoogleRedirectStatus = ({
  returnUrl,
  flowId,
  status,
  errorCode,
  consentSource,
}) => {
  const nextUrl = new URL(returnUrl);
  nextUrl.searchParams.set(GOOGLE_REDIRECT_RESULT_PARAMS.flowId, flowId);
  nextUrl.searchParams.set(GOOGLE_REDIRECT_RESULT_PARAMS.status, status);
  if (errorCode) {
    nextUrl.searchParams.set(GOOGLE_REDIRECT_RESULT_PARAMS.error, errorCode);
  } else {
    nextUrl.searchParams.delete(GOOGLE_REDIRECT_RESULT_PARAMS.error);
  }
  nextUrl.searchParams.set(GOOGLE_REDIRECT_RESULT_PARAMS.consentSource, normalizeConsentSource(consentSource));
  return nextUrl.toString();
};

module.exports = {
  GOOGLE_REDIRECT_FLOW_COLLECTION,
  GOOGLE_REDIRECT_FLOW_TTL_MS,
  GOOGLE_REDIRECT_RESULT_PARAMS,
  toCleanString,
  normalizeConsentSource,
  createGoogleRedirectFlowId,
  buildGoogleRedirectCallbackUriFromCallable,
  buildGoogleRedirectCallbackUriFromHttpRequest,
  resolveSafeReturnUrl,
  getGoogleOauthClientId,
  getGoogleOauthClientSecret,
  buildGoogleOauthUrl,
  buildReturnUrlWithGoogleRedirectStatus,
};
