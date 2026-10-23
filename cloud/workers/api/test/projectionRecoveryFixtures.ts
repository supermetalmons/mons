import type { RecoveryScanPage } from "../src/recoveryScanPage.ts";
import { MAX_RECORD_KEY_BYTES } from "../src/recordKeys.ts";
import { recoveryScanIdentityFixture } from "./recoveryScanPageFixture.ts";

export { recoveryScanIdentityFixture as projectionRecoveryIdentity } from "./recoveryScanPageFixture.ts";

export function projectionRecoveryEntryIdentity(
  entry:
    | {
        kind: "candidate";
        value: { operationId?: string; loginUid?: string };
      }
    | {
        kind: "invalid";
        observation: { keyType: string; keyBytes: Uint8Array };
      }
    | { kind: "failure" },
): string | null {
  if (entry.kind === "failure") return null;
  if (entry.kind === "invalid") {
    if (entry.observation.keyBytes.byteLength > MAX_RECORD_KEY_BYTES)
      return null;
    return `${entry.observation.keyType}:${Buffer.from(entry.observation.keyBytes).toString("hex").toUpperCase()}`;
  }
  return recoveryScanIdentityFixture(
    entry.value.operationId ?? entry.value.loginUid ?? "missing",
  );
}

export function projectionRecoveryPage<T>(
  entries: readonly T[],
  identity: (entry: T, index: number) => string | null,
  excludedIdentities: readonly string[] = [],
  limit = 10,
): RecoveryScanPage<T[]> {
  const rows = entries
    .map((entry, index) => ({ entry, identity: identity(entry, index) }))
    .filter(
      (row) =>
        row.identity === null || !excludedIdentities.includes(row.identity),
    )
    .slice(0, limit);
  return {
    entries: rows.map(({ entry }) => entry),
    scannedIdentities: rows.map(({ identity }) => identity),
  };
}
