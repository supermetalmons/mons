type XAuthAction = "signin" | "link";

const toCleanString = (value: unknown): string => {
  return typeof value === "string" ? value.trim() : "";
};

const extractErrorCode = (value: unknown): string => {
  if (!value) {
    return "";
  }
  if (typeof value === "string") {
    return value.trim().toLowerCase();
  }
  if (value instanceof Error) {
    const details = toCleanString((value as Error & { details?: unknown }).details);
    if (details) {
      return details.toLowerCase();
    }
    return value.message.trim().toLowerCase();
  }
  if (typeof value === "object") {
    const maybeDetails = toCleanString((value as { details?: unknown }).details);
    if (maybeDetails) {
      return maybeDetails.toLowerCase();
    }
    const maybeMessage = toCleanString((value as { message?: unknown }).message);
    if (maybeMessage) {
      return maybeMessage.toLowerCase();
    }
    const maybeCode = toCleanString((value as { code?: unknown }).code);
    if (maybeCode) {
      return maybeCode.toLowerCase();
    }
  }
  return "";
};

const getActionLabel = (action: XAuthAction): string => {
  return action === "link" ? "Linking X" : "X sign in";
};

const getCanceledMessage = (action: XAuthAction): string => {
  return action === "link" ? "Linking X was canceled." : "X sign in was canceled.";
};

const getUnavailableMessage = (action: XAuthAction): string => {
  return action === "link" ? "Linking X is temporarily unavailable." : "X sign in is temporarily unavailable.";
};

const getSameSessionMessage = (action: XAuthAction): string => {
  return `${getActionLabel(action)} has to finish in the same browser session that started it.`;
};

const getTimeoutMessage = (action: XAuthAction): string => {
  return `${getActionLabel(action)} took too long. Please try again.`;
};

const getLostSessionMessage = (action: XAuthAction): string => {
  return `${getActionLabel(action)} session was lost. Please try again.`;
};

const getFallbackMessage = (action: XAuthAction): string => {
  return action === "link" ? "X link failed. Please try again." : "X sign in failed. Please try again.";
};

export const formatXAuthErrorMessage = (value: unknown, action: XAuthAction): string => {
  const code = extractErrorCode(value);
  if (!code) {
    return getFallbackMessage(action);
  }
  if (code === "x-oauth-access_denied") {
    return getCanceledMessage(action);
  }
  if (
    code === "x-redirect-complete-timeout" ||
    code === "x-redirect-expired" ||
    code === "x-redirect-flow-expired" ||
    code === "intent-expired" ||
    code === "x-oauth-missing-code"
  ) {
    return getTimeoutMessage(action);
  }
  if (code === "x-auth-disabled") {
    return getUnavailableMessage(action);
  }
  if (code === "x-redirect-flow-user-mismatch" || code === "op-context-mismatch") {
    return getSameSessionMessage(action);
  }
  if (code === "x-redirect-flow-not-found") {
    return getLostSessionMessage(action);
  }
  if (code === "x-redirect-not-ready") {
    return "X is still finishing the sign-in check. Please try again.";
  }
  if (
    code.startsWith("x-oauth-") ||
    code.startsWith("x-token-exchange-") ||
    code.startsWith("x-user-lookup-") ||
    code.startsWith("x-redirect-verify-")
  ) {
    return getFallbackMessage(action);
  }
  return getFallbackMessage(action);
};
