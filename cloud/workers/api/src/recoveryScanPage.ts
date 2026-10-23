import { MAX_RECORD_KEY_BYTES } from "./recordKeys.ts";

export type RecoveryScanPage<T> = {
  entries: T;
  scannedIdentities: readonly (string | null)[];
};

const MAX_SCAN_EXCLUSIONS = 10;
const MAX_SCAN_IDENTITY_BYTES = 32 * 1024;
const identityPattern = new RegExp(
  `^(text|blob):(?:[0-9A-F]{2}){0,${MAX_RECORD_KEY_BYTES}}$`,
);

export function recoveryScanIdentitySql(key: string): string {
  return `(CASE WHEN typeof(${key}) IN ('text', 'blob')
    AND length(CAST(${key} AS BLOB)) <= ${MAX_RECORD_KEY_BYTES}
    THEN typeof(${key}) || ':' || hex(CAST(${key} AS BLOB)) END)`;
}

export function recoveryScanExclusionSql(
  key: string,
  identities: readonly string[],
  firstParameter: number,
): string {
  if (
    !Number.isSafeInteger(firstParameter) ||
    firstParameter < 1 ||
    identities.length > MAX_SCAN_EXCLUSIONS ||
    new Set(identities).size !== identities.length ||
    identities.some((identity) => !identityPattern.test(identity)) ||
    identities.reduce((total, identity) => total + identity.length, 0) >
      MAX_SCAN_IDENTITY_BYTES
  ) {
    throw new TypeError("invalid-recovery-scan-exclusions");
  }
  if (!identities.length) return "";
  const identity = recoveryScanIdentitySql(key);
  const parameters = identities.map((_, index) => `?${firstParameter + index}`);
  return ` AND (${identity} IS NULL OR ${identity} NOT IN (${parameters.join(", ")}))`;
}

export function readRecoveryScanIdentities(
  rows: readonly { recovery_scan_identity?: unknown }[],
): (string | null)[] {
  return rows.map(({ recovery_scan_identity: identity }) => {
    if (identity === null) return null;
    if (typeof identity !== "string" || !identityPattern.test(identity)) {
      throw new TypeError("invalid-recovery-scan-identity");
    }
    return identity;
  });
}
