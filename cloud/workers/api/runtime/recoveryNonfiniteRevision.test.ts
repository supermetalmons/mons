import { env } from "cloudflare:workers";
import type { D1Migration } from "cloudflare:test";
import { beforeAll, beforeEach, expect, it } from "vitest";
import {
  createProfileLinkCatchupStore,
  type ProfileLinkCatchupInvalidEntry,
} from "../src/profileLinkCatchupD1.ts";
import type { InvalidRatingRecoveryEntry } from "../src/ratingContracts.ts";
import {
  quarantineRatingRecoveryEntry,
  scanDueRatingEventProgress,
  scanDueRatingProfileGameProjections,
  scanDueRatingTelegramProjections,
} from "../src/ratingProjectionD1.ts";
import {
  parseRecoveryObservation,
  recoveryObservationGuard,
} from "../src/recoveryObservation.ts";
import { applyRetiredProfileMigrations } from "./profileTestMigrations.ts";

const testEnv = env as Env & { TEST_PROFILE_D1_MIGRATIONS: D1Migration[] };
const db = testEnv.PROFILE_DB;
const profileLinks = createProfileLinkCatchupStore(db);
const lanes = [
  "profile-link",
  "event-progress",
  "profile-game",
  "telegram",
] as const;
type Lane = (typeof lanes)[number];
const ratingScans = {
  "event-progress": scanDueRatingEventProgress,
  "profile-game": scanDueRatingProfileGameProjections,
  telegram: scanDueRatingTelegramProjections,
};

function source(lane: Lane) {
  return lane === "profile-link"
    ? {
        table: "profile_link_catchup_jobs",
        key: "login_uid",
        quarantine: "profile_link_catchup_quarantine",
      }
    : {
        table: "rating_updates",
        key: "operation_id",
        quarantine: "rating_projection_recovery_quarantine",
      };
}

async function seed(lane: Lane, key: string, revision: "1" | "1.5" | "9e999") {
  if (lane === "profile-link") {
    await db
      .prepare(
        `INSERT INTO profile_link_catchup_jobs (
         login_uid, request_id, profile_id, cleanup_profile_ids_json, match_cursor,
         source_updated_at_ms, last_queued_at_ms, revision
       ) VALUES (?, 'request', 'profile', '[]', 'saved-cursor', 100, 0, ${revision})`,
      )
      .bind(key)
      .run();
    return;
  }
  await db
    .prepare(
      `INSERT INTO rating_updates (
       operation_id, payload_json, status, invite_id, match_id, player_id,
       opponent_id, owner_uid, owner_token, started_at_ms, updated_at_ms,
       lease_expires_at_ms, completed_at_ms, telegram_projection_state,
       telegram_projection_updated_at_ms, telegram_projection_version,
       profile_game_projection_state, profile_game_projection_updated_at_ms,
       profile_game_projection_version, event_progress_state,
       event_progress_updated_at_ms, event_progress_version, revision
     ) VALUES (?, '{"eventId":"event","retained":"evidence"}', 'done', 'invite',
       'match', 'player', 'opponent', 'owner', 'token', 100, 100, 100, 100,
       'pending', 0, 1, 'pending', 0, 1, 'pending', 0, 1, ${revision})`,
    )
    .bind(key)
    .run();
}

function scan(lane: Lane, limit = 1) {
  return lane === "profile-link"
    ? profileLinks.scanDue(1_000, limit)
    : ratingScans[lane](db, 1_000, limit);
}

function quarantine(
  entry: ProfileLinkCatchupInvalidEntry | InvalidRatingRecoveryEntry,
) {
  return "projectionKind" in entry
    ? quarantineRatingRecoveryEntry(db, entry, 2_000)
    : profileLinks.quarantineInvalidEntry(entry, 2_000);
}

async function invalidEntry(lane: Lane) {
  const entries = await scan(lane);
  expect(entries).toHaveLength(1);
  const entry = entries[0];
  expect(entry.kind).toBe("invalid");
  if (entry.kind !== "invalid") throw new Error("invalid-entry-missing");
  return entry;
}

async function readSources(lane: Lane) {
  const { table, key } = source(lane);
  return (
    await db
      .prepare(
        `SELECT *, typeof(revision) AS revision_type, hex(CAST(revision AS TEXT)) AS revision_hex
     FROM ${table} ORDER BY ${key}`,
      )
      .all()
  ).results;
}

beforeAll(async () => {
  await applyRetiredProfileMigrations(
    db,
    testEnv.TEST_PROFILE_D1_MIGRATIONS,
    "b".repeat(64),
  );
});

beforeEach(async () => {
  await db.batch([
    db.prepare("DELETE FROM profile_link_catchup_jobs"),
    db.prepare("DELETE FROM rating_updates"),
    db.prepare(
      "UPDATE profile_canonical_control SET state = 'active' WHERE singleton = 1",
    ),
  ]);
});

it.each(lanes)(
  "quarantines an infinite %s revision and reaches its healthy neighbour",
  async (lane) => {
    await seed(lane, "bad", "9e999");
    await seed(lane, "healthy", "1");
    const before = await readSources(lane);
    const entry = await invalidEntry(lane);
    expect(entry.reason).toBe("invalid-record");
    expect(await quarantine(entry)).toMatchObject({
      reason: "invalid-record",
      revisionHex: "496E66",
    });
    expect(await readSources(lane)).toEqual(before);
    const remaining = await scan(lane);
    expect(remaining).toMatchObject([
      {
        kind: "candidate",
        value:
          lane === "profile-link"
            ? { loginUid: "healthy" }
            : { operationId: "healthy" },
      },
    ]);
    const { table, key } = source(lane);
    await db
      .prepare(`UPDATE ${table} SET revision = 2 WHERE ${key} = 'bad'`)
      .run();
    expect(await scan(lane, 2)).toMatchObject([
      { kind: "candidate", value: { revision: 2 } },
      { kind: "candidate", value: { revision: 1 } },
    ]);
  },
);

it.each(
  lanes.flatMap((lane) => [
    { lane, from: "1.5" as const, to: "9e999" as const },
    { lane, from: "9e999" as const, to: "1.5" as const },
  ]),
)(
  "preserves a stale $lane observation changed from $from to $to",
  async ({ lane, from, to }) => {
    await seed(lane, "bad", from);
    const entry = await invalidEntry(lane);
    const { table, key, quarantine: quarantineTable } = source(lane);
    await db
      .prepare(`UPDATE ${table} SET revision = ${to} WHERE ${key} = 'bad'`)
      .run();
    const before = await readSources(lane);
    expect(await quarantine(entry)).toBeNull();
    expect(await readSources(lane)).toEqual(before);
    expect(
      (await db.prepare(`SELECT * FROM ${quarantineTable}`).all()).results,
    ).toEqual([]);
    expect(await quarantine(await invalidEntry(lane))).not.toBeNull();
  },
);

it.each(["Inf", "-Inf"])(
  "keeps the serialized %s REAL invalid without binding a nonfinite number",
  (encoded) => {
    const keyBytes = Array.from(new TextEncoder().encode("key"));
    const raw = Array.from(new TextEncoder().encode(encoded));
    const { observation, value } = parseRecoveryObservation(
      {
        recovery_type_0: "text",
        recovery_bytes_0: keyBytes,
        recovery_real_0: null,
        recovery_type_1: "real",
        recovery_bytes_1: raw,
        recovery_real_1: null,
        recovery_revision_bytes: raw,
      },
      ["key", "revision"],
      1,
    );
    expect(value.revision).toBe(encoded === "Inf" ? Infinity : -Infinity);
    const guard = recoveryObservationGuard(["key", "revision"], observation);
    expect(guard.sql).toContain("CAST(revision AS BLOB) IS ?");
    expect(
      guard.bindings
        .filter((binding) => typeof binding === "number")
        .every(Number.isFinite),
    ).toBe(true);
    expect(guard.bindings.at(-1)).toEqual(Uint8Array.from(raw));
  },
);
