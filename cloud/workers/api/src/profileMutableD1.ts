import { parseCanonicalLoginOwnerRow } from "./profileCanonical/auth.ts";
import { CANONICAL_OWNED_PROFILE_FROM } from "./profileCanonical/ownedProfile.ts";
import {
  materializeCanonicalProfile,
  materializeCanonicalProfileFields,
  resolveCanonicalProfilesUsing,
} from "./profileCanonical/profiles.ts";
import {
  mutableProfileColumns,
  mutableProfileValue,
  parseMutableProfileRow,
} from "./profileCanonical/mutableProfiles.ts";
import {
  CanonicalProfileCorruption,
  type CanonicalLoginOwnerSnapshot,
  type CanonicalMutableProfileSnapshot,
  type CanonicalMutation,
  type CanonicalSortKey,
} from "./profileCanonical/types.ts";

export type { CanonicalMutableProfileSnapshot } from "./profileCanonical/types.ts";

export type CanonicalOwnedMutableProfileSnapshot = {
  owner: CanonicalLoginOwnerSnapshot;
  profile: CanonicalMutableProfileSnapshot;
};

export type MutableProfileUpdateOptions = {
  sortUpdates?: Partial<Record<CanonicalSortKey, number>>;
  winPresent?: boolean;
  emojiPresent?: boolean;
  gameplayEmoji?: string | number;
};

export type MutableProfileMutation = Extract<
  CanonicalMutation,
  { kind: "patch-profile-fields" | "patch-active-profile" }
>;

function mutableOwnedProfileStatement(
  db: D1Database,
  loginUid: string,
): D1PreparedStatement {
  return db
    .prepare(
      `SELECT ${mutableProfileColumns("profile")},
         owner.login_uid AS canonical_owner_login_uid,
         owner.profile_id AS canonical_owner_profile_id,
         owner.revision AS canonical_owner_revision,
         owner.created_at_ms AS canonical_owner_created_at_ms,
         owner.updated_at_ms AS canonical_owner_updated_at_ms,
         mapping.source_profile_id AS canonical_merge_source_profile_id
       ${CANONICAL_OWNED_PROFILE_FROM}
       WHERE owner.login_uid = ?`,
    )
    .bind(loginUid);
}

function parseMutableOwnedProfileRow(
  row: Record<string, unknown> | null | undefined,
  loginUid: string,
): CanonicalOwnedMutableProfileSnapshot | null {
  if (!row) return null;
  const owner = parseCanonicalLoginOwnerRow({
    login_uid: row.canonical_owner_login_uid,
    profile_id: row.canonical_owner_profile_id,
    revision: row.canonical_owner_revision,
    created_at_ms: row.canonical_owner_created_at_ms,
    updated_at_ms: row.canonical_owner_updated_at_ms,
  });
  const profile = parseMutableProfileRow(row);
  if (
    owner.loginUid !== loginUid ||
    owner.profileId !== profile.profileId ||
    profile.state !== "active" ||
    row.canonical_merge_source_profile_id !== null
  ) {
    throw new CanonicalProfileCorruption();
  }
  return { owner, profile };
}

export async function readMutableProfileMutationByLogin(
  db: D1Database,
  loginUid: string,
): Promise<CanonicalOwnedMutableProfileSnapshot | null> {
  const row = await mutableOwnedProfileStatement(db, loginUid).first<
    Record<string, unknown>
  >();
  return parseMutableOwnedProfileRow(row, loginUid);
}

export async function readMutableRatingProfiles(
  db: D1Database,
  {
    playerLoginUid,
    opponentLoginUid,
  }: { playerLoginUid: string; opponentLoginUid: string },
): Promise<{
  player: CanonicalOwnedMutableProfileSnapshot | null;
  opponent: CanonicalOwnedMutableProfileSnapshot | null;
}> {
  const [player, opponent] = await db.batch<Record<string, unknown>>(
    [playerLoginUid, opponentLoginUid].map((loginUid) =>
      mutableOwnedProfileStatement(db, loginUid),
    ),
  );
  return {
    player: parseMutableOwnedProfileRow(player.results[0], playerLoginUid),
    opponent: parseMutableOwnedProfileRow(
      opponent.results[0],
      opponentLoginUid,
    ),
  };
}

export function resolveMutableProfiles(
  db: D1Database,
  profileIds: readonly string[],
): Promise<Array<CanonicalMutableProfileSnapshot | null>> {
  return resolveCanonicalProfilesUsing(
    db,
    profileIds,
    {
      plain: mutableProfileColumns(),
      qualified: mutableProfileColumns("profile"),
    },
    parseMutableProfileRow,
  );
}

export function buildMutableProfileMutation(
  snapshot: CanonicalMutableProfileSnapshot,
  profile: CanonicalMutableProfileSnapshot["profile"],
  updatedAtMs: number,
  {
    sortUpdates = {},
    winPresent = snapshot.winPresent,
    emojiPresent = snapshot.emojiPresent,
    gameplayEmoji = snapshot.gameplayEmoji,
  }: MutableProfileUpdateOptions = {},
): MutableProfileMutation {
  const input = {
    profile,
    createdAtMs: snapshot.createdAtMs,
    updatedAtMs,
    mergedAtMs: snapshot.mergedAtMs,
    mergedIntoProfileId: snapshot.mergedIntoProfileId,
    state: snapshot.state,
    sortPresence: {
      ...snapshot.sortPresence,
      ...Object.fromEntries(Object.keys(sortUpdates).map((key) => [key, true])),
    },
    sortValues: { ...snapshot.sortValues, ...sortUpdates },
    winPresent,
    emojiPresent,
    gameplayEmoji,
  };
  if (snapshot.storageShape === "full") {
    return {
      kind: "patch-active-profile",
      current: snapshot,
      value: materializeCanonicalProfile({
        ...input,
        legacyFields: snapshot.legacyFields,
      }),
    };
  }
  return {
    kind: "patch-profile-fields",
    current: snapshot,
    value: mutableProfileValue(materializeCanonicalProfileFields(input)),
  };
}
