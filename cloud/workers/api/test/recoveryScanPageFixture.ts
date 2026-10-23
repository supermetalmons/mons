import { MAX_RECORD_KEY_BYTES } from "../src/recordKeys.ts";
import type { RecoveryScanPage } from "../src/recoveryScanPage.ts";

export function recoveryScanIdentityFixture(key: string): string | null {
  const bytes = Buffer.from(key);
  return bytes.byteLength <= MAX_RECORD_KEY_BYTES
    ? `text:${bytes.toString("hex").toUpperCase()}`
    : null;
}

export function recoveryRecordPageFixture(
  records: Record<string, unknown> | null,
  limit: number,
  excludedIdentities: readonly string[],
): RecoveryScanPage<Record<string, unknown> | null> {
  const entries = Object.entries(records ?? {})
    .filter(([key]) => {
      const identity = recoveryScanIdentityFixture(key);
      return identity === null || !excludedIdentities.includes(identity);
    })
    .slice(0, limit);
  return {
    entries: entries.length ? Object.fromEntries(entries) : null,
    scannedIdentities: entries.map(([key]) => recoveryScanIdentityFixture(key)),
  };
}
