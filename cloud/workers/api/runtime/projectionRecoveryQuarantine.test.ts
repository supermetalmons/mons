import { env } from "cloudflare:workers";
import type { D1Migration } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createProfileLinkCatchupStore,
  type ProfileLinkCatchupInvalidEntry,
} from "../src/profileLinkCatchupD1.ts";
import {
  quarantineRatingRecoveryEntry,
  scanDueRatingEventProgress,
  scanDueRatingProfileGameProjections,
  scanDueRatingTelegramProjections,
} from "../src/ratingProjectionD1.ts";
import { createRatingProjections } from "../src/ratingCanonical/projections.ts";
import type {
  InvalidRatingRecoveryEntry,
  RatingRecoveryProjectionKind,
} from "../src/ratingContracts.ts";
import { applyRetiredProfileMigrations } from "./profileTestMigrations.ts";

const testEnv = env as Env & { TEST_PROFILE_D1_MIGRATIONS: D1Migration[] };
const db = testEnv.PROFILE_DB;
const profileLinks = createProfileLinkCatchupStore(db);
const ratingScans = {
  "event-progress": scanDueRatingEventProgress,
  "profile-game": scanDueRatingProfileGameProjections,
  telegram: scanDueRatingTelegramProjections,
} as const;
const projectionKinds = Object.keys(
  ratingScans,
) as RatingRecoveryProjectionKind[];
const projectionPrefixes = {
  "event-progress": "event_progress",
  "profile-game": "profile_game_projection",
  telegram: "telegram_projection",
} as const;

async function seedProfileLink(loginUid = "login", cleanup = "[1]") {
  await db
    .prepare(
      `INSERT INTO profile_link_catchup_jobs (
       login_uid, request_id, profile_id, cleanup_profile_ids_json, match_cursor,
       source_updated_at_ms, last_queued_at_ms, revision
     ) VALUES (?, 'request', 'profile', ?, 'saved-cursor', 100, 0, 1)`,
    )
    .bind(loginUid, cleanup)
    .run();
}

async function seedRating(operationId = "operation") {
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
       'pending', 0, 1, 'pending', 0, 1, 'pending', 0, 1, 1)`,
    )
    .bind(operationId)
    .run();
}

async function invalidProfile(): Promise<ProfileLinkCatchupInvalidEntry> {
  const entries = await profileLinks.scanDue(1_000, 100);
  const entry = entries.find((value) => value.kind === "invalid");
  if (!entry || entry.kind !== "invalid")
    throw new Error("invalid-profile-entry-missing");
  return entry;
}

async function invalidRating(
  projectionKind: RatingRecoveryProjectionKind = "event-progress",
): Promise<InvalidRatingRecoveryEntry> {
  const entries = await ratingScans[projectionKind](db, 1_000, 100);
  const entry = entries.find((value) => value.kind === "invalid");
  if (!entry || entry.kind !== "invalid")
    throw new Error("invalid-rating-entry-missing");
  return entry;
}

async function readSources() {
  const results = await db.batch([
    db.prepare(`SELECT typeof(login_uid) AS key_type, hex(login_uid) AS key_hex,
      hex(request_id) AS request_hex, hex(profile_id) AS profile_hex,
      hex(cleanup_profile_ids_json) AS cleanup_hex, typeof(match_cursor) AS cursor_type,
      hex(match_cursor) AS cursor_hex, source_updated_at_ms, last_queued_at_ms,
      typeof(revision) AS revision_type, hex(revision) AS revision_hex
      FROM profile_link_catchup_jobs ORDER BY hex(login_uid)`),
    db.prepare(`SELECT typeof(operation_id) AS key_type, hex(operation_id) AS key_hex,
      hex(payload_json) AS payload_hex, telegram_projection_state,
      telegram_projection_updated_at_ms, profile_game_projection_state,
      profile_game_projection_updated_at_ms, event_progress_state,
      event_progress_updated_at_ms, typeof(revision) AS revision_type,
      hex(revision) AS revision_hex FROM rating_updates ORDER BY hex(operation_id)`),
  ]);
  return results.map((result) => result.results);
}

function withScanRows(
  map: (
    rows: Record<string, unknown>[],
  ) => Record<string, unknown>[] | Promise<Record<string, unknown>[]>,
  queries: string[] = [],
): D1Database {
  const wrap = (statement: D1PreparedStatement): D1PreparedStatement =>
    new Proxy(statement, {
      get(target, property) {
        if (property === "bind")
          return (...values: unknown[]) => wrap(target.bind(...values));
        if (property === "all")
          return async () => {
            const result = await target.all<Record<string, unknown>>();
            return { ...result, results: await map(result.results) };
          };
        const member = Reflect.get(target, property, target);
        return typeof member === "function" ? member.bind(target) : member;
      },
    });
  return new Proxy(db, {
    get(target, property) {
      if (property === "prepare")
        return (query: string) => {
          queries.push(query);
          return wrap(target.prepare(query));
        };
      const member = Reflect.get(target, property, target);
      return typeof member === "function" ? member.bind(target) : member;
    },
  });
}

beforeAll(async () => {
  await applyRetiredProfileMigrations(
    db,
    testEnv.TEST_PROFILE_D1_MIGRATIONS,
    "a".repeat(64),
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

describe("profile-link recovery quarantine", () => {
  it("uses the existing due index for the actual bounded scan", async () => {
    await seedProfileLink("healthy", "[]");
    const queries: string[] = [];
    const observed = withScanRows((rows) => rows, queries);
    await createProfileLinkCatchupStore(observed).scanDue(1_000, 10);
    expect(queries).toHaveLength(1);
    const plan = await db
      .prepare(`EXPLAIN QUERY PLAN ${queries[0]}`)
      .bind(1_000, 10)
      .all<{ detail: string }>();
    const details = plan.results.map((row) => row.detail).join("\n");
    expect(details).toContain("USING INDEX idx_profile_link_catchup_jobs_due");
    expect(details).not.toContain("USE TEMP B-TREE FOR ORDER BY");
  });

  it("isolates malformed records, preserves source data, and advances a bounded page", async () => {
    for (let index = 0; index < 10; index++)
      await seedProfileLink(`bad-${index}`);
    await seedProfileLink("healthy", "[]");
    const before = await readSources();
    const page = await profileLinks.scanDue(1_000, 10);
    expect(page).toHaveLength(10);
    for (const entry of page) {
      expect(entry.kind).toBe("invalid");
      if (entry.kind === "invalid") {
        expect(
          await profileLinks.quarantineInvalidEntry(entry, 2_000),
        ).toMatchObject({
          reason: "invalid-record",
          revisionHex: "31",
        });
      }
    }
    expect(await readSources()).toEqual(before);
    expect(await profileLinks.scanDue(1_000, 10)).toMatchObject([
      { kind: "candidate", value: { loginUid: "healthy" } },
    ]);
  });

  it("quarantines once, reconsiders new revisions, and cascades deleted jobs", async () => {
    await seedProfileLink();
    const entry = await invalidProfile();
    expect(
      await profileLinks.quarantineInvalidEntry(entry, 2_000),
    ).not.toBeNull();
    expect(await profileLinks.quarantineInvalidEntry(entry, 3_000)).toBeNull();
    await db
      .prepare(
        "UPDATE profile_link_catchup_jobs SET cleanup_profile_ids_json = '[]'",
      )
      .run();
    expect(await profileLinks.scanDue(1_000, 100)).toEqual([]);
    await db
      .prepare("UPDATE profile_link_catchup_jobs SET revision = revision + 1")
      .run();
    expect(await profileLinks.scanDue(1_000, 100)).toMatchObject([
      { kind: "candidate" },
    ]);
    await db.prepare("DELETE FROM profile_link_catchup_jobs").run();
    expect(
      (await db.prepare("SELECT * FROM profile_link_catchup_quarantine").all())
        .results,
    ).toEqual([]);
    await seedProfileLink("login", "[]");
    expect(await profileLinks.scanDue(1_000, 100)).toMatchObject([
      { kind: "candidate" },
    ]);
  });

  it("replaces a malformed revision marker and retains it on same-revision retries", async () => {
    await seedProfileLink();
    const original = await invalidProfile();
    expect(
      await profileLinks.quarantineInvalidEntry(
        { ...original, reason: "invalid-login-uid" },
        2_000,
      ),
    ).not.toBeNull();
    expect(
      await db.prepare("SELECT * FROM profile_link_catchup_quarantine").first(),
    ).toMatchObject({
      revision_token: "1",
      reason: "invalid-login-uid",
      quarantined_at_ms: 2_000,
    });
    await db
      .prepare("UPDATE profile_link_catchup_jobs SET revision = 1.5")
      .run();
    const replacement = await invalidProfile();
    const before = await readSources();
    expect(
      await profileLinks.quarantineInvalidEntry(replacement, 3_000),
    ).toEqual({
      loginUidHex: "6c6f67696e",
      revisionHex: replacement.observation.revisionHex,
      reason: "invalid-record",
    });
    const marker = await db
      .prepare("SELECT * FROM profile_link_catchup_quarantine")
      .first();
    expect(marker).toEqual({
      login_uid: "login",
      revision_token: "1.5",
      reason: "invalid-record",
      quarantined_at_ms: 3_000,
    });
    expect(
      await profileLinks.quarantineInvalidEntry(
        { ...replacement, reason: "invalid-login-uid" },
        4_000,
      ),
    ).toBeNull();
    expect(
      await db.prepare("SELECT * FROM profile_link_catchup_quarantine").first(),
    ).toEqual(marker);
    expect(await profileLinks.scanDue(1_000, 100)).toEqual([]);
    expect(await readSources()).toEqual(before);
  });

  it.each(["same-revision", "new-revision", "recreated", "frozen"] as const)(
    "preserves a %s change after observation",
    async (change) => {
      await seedProfileLink();
      const entry = await invalidProfile();
      if (change === "frozen") {
        await db
          .prepare(
            "UPDATE profile_canonical_control SET state = 'frozen' WHERE singleton = 1",
          )
          .run();
      } else if (change === "recreated") {
        await db.prepare("DELETE FROM profile_link_catchup_jobs").run();
        await seedProfileLink("login", "[]");
      } else {
        await db
          .prepare(
            `UPDATE profile_link_catchup_jobs SET cleanup_profile_ids_json = '[]'
          ${change === "new-revision" ? ", revision = revision + 1" : ""}`,
          )
          .run();
      }
      const before = await readSources();
      expect(
        await profileLinks.quarantineInvalidEntry(entry, 2_000),
      ).toBeNull();
      expect(await readSources()).toEqual(before);
      expect(
        (
          await db
            .prepare("SELECT * FROM profile_link_catchup_quarantine")
            .all()
        ).results,
      ).toEqual([]);
    },
  );

  it.each(["1.5", "9223372036854775807", "'invalid'", "x'ff'"])(
    "retains the exact invalid revision %s",
    async (revision) => {
      await seedProfileLink("login", "[]");
      await db
        .prepare(`UPDATE profile_link_catchup_jobs SET revision = ${revision}`)
        .run();
      const before = await readSources();
      const entry = await invalidProfile();
      expect(
        await profileLinks.quarantineInvalidEntry(entry, 2_000),
      ).not.toBeNull();
      expect(await profileLinks.scanDue(1_000, 100)).toEqual([]);
      expect(await readSources()).toEqual(before);
    },
  );

  it("does not confuse a BLOB cursor with matching hex text", async () => {
    await seedProfileLink("login", "[]");
    await db
      .prepare("UPDATE profile_link_catchup_jobs SET match_cursor = x'6162'")
      .run();
    const entry = await invalidProfile();
    await db
      .prepare("UPDATE profile_link_catchup_jobs SET match_cursor = '6162'")
      .run();
    expect(await profileLinks.quarantineInvalidEntry(entry, 2_000)).toBeNull();
    expect(await profileLinks.scanDue(1_000, 100)).toMatchObject([
      { kind: "candidate" },
    ]);
  });
});

describe("rating recovery quarantine", () => {
  it.each(
    projectionKinds.flatMap((projectionKind) =>
      ["1.5", "9223372036854775807", "'invalid'"].map((revision) => ({
        projectionKind,
        revision,
      })),
    ),
  )(
    "preserves the SQL revision token for $projectionKind revision $revision",
    async ({ projectionKind, revision }) => {
      await seedRating();
      await db
        .prepare(`UPDATE rating_updates SET revision = ${revision}`)
        .run();
      const before = await readSources();
      const revisionHex = await db
        .prepare(
          "SELECT hex(CAST(revision AS TEXT)) AS token FROM rating_updates",
        )
        .first("token");
      const entry = await invalidRating(projectionKind);
      expect(entry.observation.revisionHex).toBe(revisionHex);
      expect(
        await quarantineRatingRecoveryEntry(db, entry, 2_000),
      ).toMatchObject({ revisionHex });
      expect(await ratingScans[projectionKind](db, 1_000, 100)).toEqual([]);
      expect(
        await db
          .prepare(
            "SELECT hex(revision_token) AS token FROM rating_projection_recovery_quarantine",
          )
          .first("token"),
      ).toBe(revisionHex);
      expect(await readSources()).toEqual(before);
    },
  );

  it.each(projectionKinds)(
    "isolates and bounds malformed %s pages independently",
    async (projectionKind) => {
      for (let index = 0; index < 10; index++) await seedRating(`bad-${index}`);
      await db.prepare("UPDATE rating_updates SET revision = 1.5").run();
      await seedRating("healthy");
      const before = await readSources();
      const page = await ratingScans[projectionKind](db, 1_000, 10);
      for (const entry of page) {
        expect(entry.kind).toBe("invalid");
        if (entry.kind === "invalid") {
          expect(
            await quarantineRatingRecoveryEntry(db, entry, 2_000),
          ).toMatchObject({ projectionKind });
        }
      }
      expect(await readSources()).toEqual(before);
      expect(await ratingScans[projectionKind](db, 1_000, 10)).toMatchObject([
        { kind: "candidate", value: { operationId: "healthy" } },
      ]);
      for (const other of projectionKinds.filter(
        (kind) => kind !== projectionKind,
      )) {
        expect(await ratingScans[other](db, 1_000, 10)).toHaveLength(10);
      }
    },
  );

  it("preserves all source fields, quarantines once, and follows revision/deletion changes", async () => {
    await seedRating();
    await db.prepare("UPDATE rating_updates SET revision = x'ff'").run();
    const before = await readSources();
    const entry = await invalidRating();
    expect(await quarantineRatingRecoveryEntry(db, entry, 2_000)).toMatchObject(
      { revisionHex: "FF" },
    );
    expect(await quarantineRatingRecoveryEntry(db, entry, 3_000)).toBeNull();
    expect(await readSources()).toEqual(before);
    await db.prepare("UPDATE rating_updates SET revision = 2").run();
    expect(await scanDueRatingEventProgress(db, 1_000, 100)).toMatchObject([
      { kind: "candidate" },
    ]);
    await db.prepare("DELETE FROM rating_updates").run();
    expect(
      (
        await db
          .prepare("SELECT * FROM rating_projection_recovery_quarantine")
          .all()
      ).results,
    ).toEqual([]);
    await seedRating();
    expect(await scanDueRatingEventProgress(db, 1_000, 100)).toMatchObject([
      { kind: "candidate" },
    ]);
  });

  it.each(
    projectionKinds.flatMap((projectionKind) =>
      (
        [
          "same-revision",
          "new-revision",
          "recreated",
          "completed",
          "claimed",
          "frozen",
        ] as const
      ).map((change) => ({ projectionKind, change })),
    ),
  )(
    "does not quarantine a $projectionKind $change change after observation",
    async ({ projectionKind, change }) => {
      await seedRating();
      const prefix = projectionPrefixes[projectionKind];
      const malformed =
        projectionKind === "telegram"
          ? "operation_id = CAST(operation_id AS BLOB)"
          : `${prefix}_version = 1.5`;
      await db.prepare(`UPDATE rating_updates SET ${malformed}`).run();
      const entry = await invalidRating(projectionKind);
      if (change === "frozen") {
        await db
          .prepare(
            "UPDATE profile_canonical_control SET state = 'frozen' WHERE singleton = 1",
          )
          .run();
      } else if (change === "recreated") {
        await db.prepare("DELETE FROM rating_updates").run();
        await seedRating();
      } else {
        const repaired =
          projectionKind === "telegram"
            ? "operation_id = CAST(operation_id AS TEXT)"
            : `${prefix}_version = 1`;
        const changes = {
          "same-revision": repaired,
          "new-revision": `${repaired}, revision = revision + 1`,
          completed: `${prefix}_state = 'done'`,
          claimed: `${prefix}_updated_at_ms = 2000`,
        };
        await db.prepare(`UPDATE rating_updates SET ${changes[change]}`).run();
      }
      const before = await readSources();
      expect(await quarantineRatingRecoveryEntry(db, entry, 2_000)).toBeNull();
      expect(await readSources()).toEqual(before);
      expect(
        (
          await db
            .prepare("SELECT * FROM rating_projection_recovery_quarantine")
            .all()
        ).results,
      ).toEqual([]);
    },
  );

  it.each(projectionKinds)(
    "distinguishes adjacent REAL revisions for %s",
    async (projectionKind) => {
      await seedRating();
      await db
        .prepare("UPDATE rating_updates SET revision = ?")
        .bind(1.0000000000000002)
        .run();
      const stale = await invalidRating(projectionKind);
      await db
        .prepare("UPDATE rating_updates SET revision = ?")
        .bind(1.0000000000000004)
        .run();
      const current = await invalidRating(projectionKind);
      const before = await readSources();
      expect(await quarantineRatingRecoveryEntry(db, stale, 2_000)).toBeNull();
      expect(
        (
          await db
            .prepare("SELECT * FROM rating_projection_recovery_quarantine")
            .all()
        ).results,
      ).toEqual([]);
      expect(
        await quarantineRatingRecoveryEntry(db, current, 2_000),
      ).toMatchObject({
        projectionKind,
        revisionHex: current.observation.revisionHex,
      });
      expect(
        await db
          .prepare(
            "SELECT hex(revision_token) AS revision_hex FROM rating_projection_recovery_quarantine",
          )
          .first("revision_hex"),
      ).toBe(current.observation.revisionHex);
      expect(await readSources()).toEqual(before);
    },
  );

  it.each(projectionKinds)(
    "replaces a malformed %s revision marker and retains it on same-revision retries",
    async (projectionKind) => {
      await seedRating();
      await db.prepare("UPDATE rating_updates SET revision = 1.5").run();
      const original = await invalidRating(projectionKind);
      expect(
        await quarantineRatingRecoveryEntry(
          db,
          { ...original, reason: "invalid-operation-id" },
          2_000,
        ),
      ).not.toBeNull();
      expect(
        await db
          .prepare("SELECT * FROM rating_projection_recovery_quarantine")
          .first(),
      ).toMatchObject({
        revision_token: "1.5",
        reason: "invalid-operation-id",
        quarantined_at_ms: 2_000,
      });
      await db.prepare("UPDATE rating_updates SET revision = 2.5").run();
      const replacement = await invalidRating(projectionKind);
      const before = await readSources();
      expect(
        await quarantineRatingRecoveryEntry(db, replacement, 3_000),
      ).toEqual({
        operationIdHex: "6f7065726174696f6e",
        projectionKind,
        revisionHex: replacement.observation.revisionHex,
        reason: "invalid-record",
      });
      const marker = await db
        .prepare("SELECT * FROM rating_projection_recovery_quarantine")
        .first();
      expect(marker).toEqual({
        operation_id: "operation",
        projection_kind: projectionKind,
        revision_token: "2.5",
        reason: "invalid-record",
        quarantined_at_ms: 3_000,
      });
      expect(
        await quarantineRatingRecoveryEntry(
          db,
          { ...replacement, reason: "invalid-operation-id" },
          4_000,
        ),
      ).toBeNull();
      expect(
        await db
          .prepare("SELECT * FROM rating_projection_recovery_quarantine")
          .first(),
      ).toEqual(marker);
      expect(await ratingScans[projectionKind](db, 1_000, 100)).toEqual([]);
      expect(await readSources()).toEqual(before);
    },
  );

  it("isolates invalid Unicode event IDs and preserves a same-revision JSON repair", async () => {
    await seedRating();
    await db
      .prepare("UPDATE rating_updates SET payload_json = ?")
      .bind('{"eventId":"\\ud800"}')
      .run();
    const entry = await invalidRating();
    expect(entry.reason).toBe("invalid-record");
    await db
      .prepare("UPDATE rating_updates SET payload_json = ?")
      .bind('{"eventId":"fixed"}')
      .run();
    expect(await quarantineRatingRecoveryEntry(db, entry, 2_000)).toBeNull();
    expect(await scanDueRatingEventProgress(db, 1_000, 100)).toMatchObject([
      { kind: "candidate", value: { eventId: "fixed" } },
    ]);
  });
});

describe("raw recovery identity", () => {
  it("preserves leading BOMs in a rating repaired before its raw reread", async () => {
    const inviteId = "\ufeffinvite";
    const operationId = `${inviteId}__match`;
    await seedRating(operationId);
    await db
      .prepare(
        `UPDATE rating_updates SET invite_id = ?, event_progress_version = 1.5,
         payload_json = ? WHERE operation_id = ?`,
      )
      .bind(
        inviteId,
        JSON.stringify({
          eventId: "event",
          inviteId,
          matchId: "match",
          status: "done",
          playerId: "player",
          opponentId: "opponent",
          ownerUid: "owner",
          ownerToken: "token",
          startedAtMs: 100,
          updatedAtMs: 100,
          leaseExpiresAtMs: 100,
          completedAtMs: 100,
          eventProgressState: "pending",
          eventProgressUpdatedAtMs: 0,
          eventProgressVersion: 1.5,
        }),
        operationId,
      )
      .run();
    const observed = withScanRows(async (rows) => {
      await db
        .prepare(
          `UPDATE rating_updates SET event_progress_version = 1, revision = 2,
           payload_json = json_set(payload_json, '$.eventProgressVersion', 1)
           WHERE operation_id = ?`,
        )
        .bind(operationId)
        .run();
      return rows;
    });
    expect(await scanDueRatingEventProgress(observed, 1_000, 100)).toEqual([
      {
        kind: "candidate",
        value: {
          operationId,
          revision: 2,
          inviteId,
          matchId: "match",
          version: 1,
          eventId: "event",
        },
      },
    ]);
    expect(
      (
        await db
          .prepare("SELECT * FROM rating_projection_recovery_quarantine")
          .all()
      ).results,
    ).toEqual([]);
    expect(
      await createRatingProjections(db, 3).claimRatingEventProgress(
        operationId,
        2,
        2_000,
      ),
    ).toBe(true);
  });

  it("preserves leading BOMs in repaired profile-link fields", async () => {
    const requestId = "\ufeffrequest";
    const profileId = "\ufeffprofile";
    const matchCursor = "\ufeffcursor";
    await seedProfileLink();
    await db
      .prepare(
        `UPDATE profile_link_catchup_jobs SET request_id = ?, profile_id = ?,
         match_cursor = ? WHERE login_uid = 'login'`,
      )
      .bind(requestId, profileId, matchCursor)
      .run();
    const observed = withScanRows(async (rows) => {
      await db
        .prepare(
          `UPDATE profile_link_catchup_jobs SET cleanup_profile_ids_json = '[]',
           revision = 2 WHERE login_uid = 'login'`,
        )
        .run();
      return rows;
    });
    expect(
      await createProfileLinkCatchupStore(observed).scanDue(1_000, 100),
    ).toEqual([
      {
        kind: "candidate",
        value: {
          loginUid: "login",
          requestId,
          profileId,
          cleanupProfileIds: [],
          matchCursor,
          sourceUpdatedAtMs: 100,
          lastQueuedAtMs: 0,
          revision: 2,
        },
      },
    ]);
    expect(
      (await db.prepare("SELECT * FROM profile_link_catchup_quarantine").all())
        .results,
    ).toEqual([]);
    expect(await profileLinks.claimDispatch("login", requestId, 0, 2_000)).toBe(
      true,
    );
  });

  it("does not quarantine BLOB keys repaired to TEXT with identical bytes", async () => {
    await seedProfileLink("login", "[]");
    await seedRating();
    await db.batch([
      db.prepare(
        "UPDATE profile_link_catchup_jobs SET login_uid = CAST(login_uid AS BLOB)",
      ),
      db.prepare(
        "UPDATE rating_updates SET operation_id = CAST(operation_id AS BLOB)",
      ),
    ]);
    const profile = await invalidProfile();
    const rating = await invalidRating();
    await db.batch([
      db.prepare(
        "UPDATE profile_link_catchup_jobs SET login_uid = CAST(login_uid AS TEXT)",
      ),
      db.prepare(
        "UPDATE rating_updates SET operation_id = CAST(operation_id AS TEXT)",
      ),
    ]);
    expect(
      await profileLinks.quarantineInvalidEntry(profile, 2_000),
    ).toBeNull();
    expect(await quarantineRatingRecoveryEntry(db, rating, 2_000)).toBeNull();
    expect(await profileLinks.scanDue(1_000, 100)).toMatchObject([
      { kind: "candidate" },
    ]);
    expect(await scanDueRatingEventProgress(db, 1_000, 100)).toMatchObject([
      { kind: "candidate" },
    ]);
  });

  it("keeps inspection failures per row and transport failures outside quarantine", async () => {
    await seedProfileLink("first", "[]");
    await seedProfileLink("second", "[]");
    await seedRating("first");
    await seedRating("second");
    const unreadable = withScanRows((rows) =>
      rows.map((row, index) =>
        index === 0 ? { ...row, recovery_key_bytes: null } : row,
      ),
    );
    const profileEntries = await createProfileLinkCatchupStore(
      unreadable,
    ).scanDue(1_000, 100);
    expect(profileEntries).toMatchObject([
      { kind: "failure", error: expect.any(Error) },
      { kind: "candidate", value: { loginUid: "second" } },
    ]);
    for (const scan of Object.values(ratingScans)) {
      expect(await scan(unreadable, 1_000, 100)).toMatchObject([
        { kind: "failure", error: expect.any(Error) },
        { kind: "candidate", value: { operationId: "second" } },
      ]);
    }
    const failure = new Error("transport-unavailable");
    const unavailable = withScanRows(() => {
      throw failure;
    });
    await expect(
      createProfileLinkCatchupStore(unavailable).scanDue(1_000, 100),
    ).rejects.toBe(failure);
    for (const scan of Object.values(ratingScans)) {
      await expect(scan(unavailable, 1_000, 100)).rejects.toBe(failure);
    }
    expect(
      (await db.prepare("SELECT * FROM profile_link_catchup_quarantine").all())
        .results,
    ).toEqual([]);
    expect(
      (
        await db
          .prepare("SELECT * FROM rating_projection_recovery_quarantine")
          .all()
      ).results,
    ).toEqual([]);
  });

  it.each(["blob", "text"] as const)(
    "retains %s identifiers without targeting decoded replacements",
    async (storage) => {
      await seedProfileLink("login", "[]");
      await seedRating("operation");
      const rawKey =
        storage === "blob" ? "x'6b6579ff'" : "CAST(x'6b6579ff' AS TEXT)";
      await db.batch([
        db.prepare(
          `UPDATE profile_link_catchup_jobs SET login_uid = ${rawKey}`,
        ),
        db.prepare(`UPDATE rating_updates SET operation_id = ${rawKey}`),
      ]);
      await seedProfileLink("key\ufffd", "[]");
      await seedRating("key\ufffd");
      const before = await readSources();
      const profile = await invalidProfile();
      const rating = await invalidRating();
      expect(profile.reason).toBe("invalid-login-uid");
      expect(rating.reason).toBe("invalid-operation-id");
      expect(
        await profileLinks.quarantineInvalidEntry(profile, 2_000),
      ).toMatchObject({ loginUidHex: "6b6579ff" });
      expect(
        await quarantineRatingRecoveryEntry(db, rating, 2_000),
      ).toMatchObject({ operationIdHex: "6b6579ff" });
      expect(await readSources()).toEqual(before);
      expect(await profileLinks.scanDue(1_000, 100)).toMatchObject([
        { kind: "candidate", value: { loginUid: "key\ufffd" } },
      ]);
      expect(await scanDueRatingEventProgress(db, 1_000, 100)).toMatchObject([
        { kind: "candidate", value: { operationId: "key\ufffd" } },
      ]);
      expect(
        (await db.prepare("PRAGMA foreign_key_check").all()).results,
      ).toEqual([]);
    },
  );
});
