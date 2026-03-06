export type AuthMethodKey = "eth" | "sol" | "apple" | "google";
export type AuthCooldownReason = "method-reuse-cooldown" | "profile-method-cooldown";
export type AuthCooldownScope = "method" | "profile-method";

export interface AuthCooldownErrorDetails {
  reason: AuthCooldownReason;
  scope: AuthCooldownScope;
  method: AuthMethodKey | null;
  retryAtMs: number | null;
  cooldownMs: number | null;
  profileId: string | null;
}

const FALLBACK_COOLDOWN_MS = 24 * 60 * 60 * 1000;

const toCleanString = (value: unknown): string => {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : "";
};

const parseFiniteNumber = (value: unknown): number | null => {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? Math.floor(numeric) : null;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const normalizeMethodKey = (value: unknown): AuthMethodKey | null => {
  const method = toCleanString(value).toLowerCase();
  if (method === "eth" || method === "sol" || method === "apple" || method === "google") {
    return method;
  }
  return null;
};

const normalizeCooldownReason = (value: unknown): AuthCooldownReason | null => {
  const reason = toCleanString(value);
  if (reason === "method-reuse-cooldown" || reason === "profile-method-cooldown") {
    return reason;
  }
  return null;
};

const normalizeCooldownScope = (value: unknown, reason: AuthCooldownReason): AuthCooldownScope => {
  const scope = toCleanString(value);
  if (scope === "method" || scope === "profile-method") {
    return scope;
  }
  return reason === "profile-method-cooldown" ? "profile-method" : "method";
};

const parseDetailsObject = (value: unknown): AuthCooldownErrorDetails | null => {
  if (!isRecord(value)) {
    return null;
  }
  const reason = normalizeCooldownReason(value.reason);
  if (!reason) {
    return null;
  }
  const retryAtMs = parseFiniteNumber(value.retryAtMs);
  const cooldownMs = parseFiniteNumber(value.cooldownMs);
  const profileId = toCleanString(value.profileId) || null;
  return {
    reason,
    scope: normalizeCooldownScope(value.scope, reason),
    method: normalizeMethodKey(value.method),
    retryAtMs,
    cooldownMs,
    profileId,
  };
};

const parseFallbackFromMessage = (message: string): AuthCooldownErrorDetails | null => {
  const lowerMessage = message.toLowerCase();
  const reason = lowerMessage.includes("profile-method-cooldown")
    ? "profile-method-cooldown"
    : lowerMessage.includes("method-reuse-cooldown")
      ? "method-reuse-cooldown"
      : null;
  if (!reason) {
    return null;
  }
  const method =
    lowerMessage.includes("apple") ? "apple"
    : lowerMessage.includes("google") ? "google"
    : lowerMessage.includes("sol") ? "sol"
    : lowerMessage.includes("eth") || lowerMessage.includes("ethereum") ? "eth"
    : null;
  return {
    reason,
    scope: reason === "profile-method-cooldown" ? "profile-method" : "method",
    method,
    retryAtMs: null,
    cooldownMs: FALLBACK_COOLDOWN_MS,
    profileId: null,
  };
};

const getMethodLabel = (method: AuthMethodKey | null): string => {
  if (method === "eth") {
    return "Ethereum";
  }
  if (method === "sol") {
    return "Solana";
  }
  if (method === "apple") {
    return "Apple";
  }
  if (method === "google") {
    return "Google";
  }
  return "this sign-in method";
};

const formatRetryAt = (retryAtMs: number | null): string | null => {
  if (!retryAtMs || !Number.isFinite(retryAtMs) || retryAtMs <= 0) {
    return null;
  }
  const date = new Date(retryAtMs);
  if (!Number.isFinite(date.getTime())) {
    return null;
  }
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

export const parseAuthCooldownError = (error: unknown): AuthCooldownErrorDetails | null => {
  if (!isRecord(error)) {
    return null;
  }
  const customData = isRecord(error.customData) ? error.customData : null;
  const cause = isRecord(error.cause) ? error.cause : null;
  const detailsCandidates = [
    error.details,
    customData ? customData.details : undefined,
    cause ? cause.details : undefined,
  ];
  for (const candidate of detailsCandidates) {
    const parsed = parseDetailsObject(candidate);
    if (parsed) {
      return parsed;
    }
  }
  const message = toCleanString(error.message);
  if (!message) {
    return null;
  }
  return parseFallbackFromMessage(message);
};

export const formatAuthCooldownErrorMessage = (error: unknown): string | null => {
  const details = parseAuthCooldownError(error);
  if (!details) {
    return null;
  }
  const methodLabel = getMethodLabel(details.method);
  const retryAtText = formatRetryAt(details.retryAtMs);
  if (details.reason === "method-reuse-cooldown") {
    const methodSignInLabel = details.method ? `${methodLabel} sign-in` : "sign-in method";
    if (retryAtText) {
      return `This ${methodSignInLabel} was recently unlinked. Try again after ${retryAtText}.`;
    }
    return `This ${methodSignInLabel} was recently unlinked. Try again in up to 24 hours.`;
  }
  const profileMethodLabel = details.method ? methodLabel : "this method type";
  if (retryAtText) {
    return `You recently unlinked ${profileMethodLabel} on this profile. You can link it again after ${retryAtText}.`;
  }
  return `You recently unlinked ${profileMethodLabel} on this profile. You can link it again in up to 24 hours.`;
};
