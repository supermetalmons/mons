import {
  readRecoveryScanIdentities,
  type RecoveryScanPage,
} from "./recoveryScanPage.ts";

export const PROJECTION_RECOVERY_PAGE_SIZE = 10;
export const PROJECTION_RECOVERY_MAX_PAGES = 2;
const MAX_RETAINED_IDENTITY_BYTES = 32 * 1024;

export async function* projectionRecoveryPages<T>(
  readPage: (
    excludedIdentities: readonly string[],
  ) => Promise<RecoveryScanPage<T>>,
): AsyncGenerator<{ entries: T; itemOffset: number }> {
  let excludedIdentities: string[] = [];
  for (let index = 0; index < PROJECTION_RECOVERY_MAX_PAGES; index++) {
    const page = await readPage(excludedIdentities);
    const identities = readRecoveryScanIdentities(
      page.scannedIdentities.map((identity) => ({
        recovery_scan_identity: identity,
      })),
    );
    if (
      identities.length > PROJECTION_RECOVERY_PAGE_SIZE ||
      identities.some(
        (identity) =>
          identity !== null && excludedIdentities.includes(identity),
      )
    ) {
      throw new TypeError("invalid-projection-recovery-page");
    }
    yield {
      entries: page.entries,
      itemOffset: index * PROJECTION_RECOVERY_PAGE_SIZE,
    };
    if (
      identities.length < PROJECTION_RECOVERY_PAGE_SIZE ||
      identities.some((identity) => identity === null)
    ) {
      return;
    }
    const nextIdentities = identities.filter(
      (identity): identity is string => identity !== null,
    );
    if (
      new Set(nextIdentities).size !== nextIdentities.length ||
      nextIdentities.reduce((total, identity) => total + identity.length, 0) >
        MAX_RETAINED_IDENTITY_BYTES
    ) {
      return;
    }
    excludedIdentities = nextIdentities;
  }
}
