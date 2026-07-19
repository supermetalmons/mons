const AUTH_METHODS = Object.freeze(["eth", "sol", "apple", "x"]);
const AUTH_METHOD_FIELD_BY_TYPE = Object.freeze({
  eth: "eth",
  sol: "sol",
  apple: "appleSub",
  x: "xUserId",
});
const AUTH_METHOD_LABELS = Object.freeze({
  eth: "Ethereum",
  sol: "Solana",
  apple: "Apple",
  x: "X",
});
const AUTH_METHOD_REUSE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const AUTH_COOLDOWN_REASONS = Object.freeze({
  method: "method-reuse-cooldown",
  profileMethod: "profile-method-cooldown",
});

const cleanString = (value) =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : "";

const normalizeAuthMethod = (value) => {
  const method = cleanString(value).toLowerCase();
  return Object.prototype.hasOwnProperty.call(AUTH_METHOD_FIELD_BY_TYPE, method)
    ? method
    : null;
};

const normalizeAuthCooldownReason = (value) => {
  const reason = cleanString(value);
  if (
    reason === AUTH_COOLDOWN_REASONS.method ||
    reason === AUTH_COOLDOWN_REASONS.profileMethod
  ) {
    return reason;
  }
  return null;
};

const getAuthCooldownScope = (reason) =>
  reason === AUTH_COOLDOWN_REASONS.profileMethod ? "profile-method" : "method";

module.exports = {
  AUTH_METHODS,
  AUTH_METHOD_FIELD_BY_TYPE,
  AUTH_METHOD_LABELS,
  AUTH_METHOD_REUSE_COOLDOWN_MS,
  AUTH_COOLDOWN_REASONS,
  normalizeAuthMethod,
  normalizeAuthCooldownReason,
  getAuthCooldownScope,
};
