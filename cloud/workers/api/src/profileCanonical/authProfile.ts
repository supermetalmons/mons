import { parseCanonicalAuthMethodRow } from "./auth.ts";
import {
  CanonicalProfileCorruption,
  type CanonicalAuthMethodSnapshot,
} from "./types.ts";
import {
  CANONICAL_OWNED_PROFILE_COLUMNS,
  CANONICAL_OWNED_PROFILE_FROM,
  parseCanonicalOwnedProfileRow,
  type CanonicalOwnedProfileSnapshot,
} from "./ownedProfile.ts";

export type CanonicalAuthProfileSnapshot = CanonicalOwnedProfileSnapshot & {
  authMethods: CanonicalAuthMethodSnapshot[];
};

export async function readCanonicalAuthProfileByLogin(
  db: D1Database,
  loginUid: string,
): Promise<CanonicalAuthProfileSnapshot | null> {
  const results = await db.batch<Record<string, unknown>>([
    db
      .prepare(
        `SELECT ${CANONICAL_OWNED_PROFILE_COLUMNS}
       ${CANONICAL_OWNED_PROFILE_FROM}
       WHERE owner.login_uid = ?`,
      )
      .bind(loginUid),
    db
      .prepare(
        `SELECT method.method, method.normalized_value, method.profile_id,
              method.raw_value, method.apple_email_masked, method.x_username,
              method.linked_at_ms, method.consent_at_ms, method.consent_source,
              method.revision, method.created_at_ms, method.updated_at_ms
       FROM profile_auth_methods AS method
       JOIN profile_login_owners AS owner
         ON method.profile_id = owner.profile_id
       WHERE owner.login_uid = ?
       ORDER BY method.method ASC`,
      )
      .bind(loginUid),
  ]);
  if (
    results.length !== 2 ||
    results.some(
      (result) => !result?.success || !Array.isArray(result.results),
    ) ||
    results[0].results.length > 1
  ) {
    throw new CanonicalProfileCorruption();
  }
  const snapshot = parseCanonicalOwnedProfileRow(
    results[0].results[0],
    loginUid,
  );
  if (!snapshot) {
    if (results[1].results.length !== 0) throw new CanonicalProfileCorruption();
    return null;
  }
  const { profile } = snapshot;
  const authMethods: CanonicalAuthMethodSnapshot[] = [];
  for (const methodRow of results[1].results) {
    const method = parseCanonicalAuthMethodRow(methodRow);
    if (method.profileId !== profile.profileId) {
      throw new CanonicalProfileCorruption();
    }
    authMethods.push(method);
  }
  return {
    ...snapshot,
    authMethods,
  };
}
