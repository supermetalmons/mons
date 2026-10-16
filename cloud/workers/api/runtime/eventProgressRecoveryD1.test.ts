import { applyD1Migrations, type D1Migration } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  acquireEventWriteAdmission,
  commitEventMutations,
  listDueEventProgressOutboxes,
  releaseEventWriteAdmission,
} from "../src/eventD1.ts";
import { buildEventProgressPlan } from "../src/eventProgressCodec.ts";
import {
  createEventProgressRecoveryStore,
  type EventProgressRecoveryStore,
} from "../src/eventProgressRecoveryD1.ts";
import { applyEventTestMigrations } from "./eventTestMigrations.ts";
import { observeD1FailureDatabase } from "./d1FailureTestUtils.ts";

const testEnv = env as Env & { TEST_EVENT_D1_MIGRATIONS: D1Migration[] };
const eventId = "recovery-deadline-event";

async function seedEvent(id = eventId) {
  const admission = await acquireEventWriteAdmission(testEnv.EVENT_DB);
  try {
    await commitEventMutations(
      testEnv.EVENT_DB,
      [
        {
          kind: "event",
          eventId: id,
          value: {
            schemaVersion: 2,
            eventId: id,
            status: "scheduled",
            createdAtMs: 100,
            updatedAtMs: 100,
            startAtMs: 20_000_000,
            createdByProfileId: "profile-one",
            createdByLoginUid: "login-one",
            createdByUsername: "ivan",
            participants: {},
            rounds: {},
          },
        },
      ],
      { admission },
    );
  } finally {
    await releaseEventWriteAdmission(testEnv.EVENT_DB, admission);
  }
}

async function seedOutbox(sourceKey = "scheduled:first", queuedAtMs = 100) {
  const plan = await buildEventProgressPlan(
    {
      eventId,
      reason: "scheduled-start-reconciliation",
      sourceKey,
      runAtMs: 20_000_000,
    },
    queuedAtMs,
  );
  await testEnv.EVENT_DB.prepare(
    `INSERT INTO event_progress_outboxes (
       status, outbox_id, event_id, run_at_ms, last_queued_at_ms, record_json
     ) VALUES ('pending', ?, ?, ?, ?, ?)`,
  )
    .bind(
      plan.outboxId,
      eventId,
      plan.outbox.runAtMs,
      plan.outbox.lastQueuedAtMs,
      JSON.stringify(plan.outbox),
    )
    .run();
  return plan;
}

async function withStore(
  work: (store: EventProgressRecoveryStore) => Promise<void>,
) {
  const admission = await acquireEventWriteAdmission(testEnv.EVENT_DB);
  try {
    await work(createEventProgressRecoveryStore(testEnv.EVENT_DB, admission));
  } finally {
    await releaseEventWriteAdmission(testEnv.EVENT_DB, admission);
  }
}

async function seedMalformedOutbox(record: Record<string, unknown>) {
  const plan = await seedOutbox();
  await testEnv.EVENT_DB.prepare(
    "UPDATE event_progress_outboxes SET record_json = ? WHERE status = 'pending' AND outbox_id = ?",
  )
    .bind(JSON.stringify(record, null, 2), plan.outboxId)
    .run();
  return plan;
}

async function storedOutboxes() {
  return (
    await testEnv.EVENT_DB.prepare(
      "SELECT * FROM event_progress_outboxes ORDER BY status, outbox_id",
    ).all<Record<string, unknown>>()
  ).results;
}

async function seedDeadOutbox(outboxId: string) {
  await testEnv.EVENT_DB.prepare(
    `INSERT INTO event_progress_outboxes (
       status, outbox_id, event_id, run_at_ms, last_queued_at_ms, record_json
     ) VALUES ('dead', ?, NULL, NULL, 50, ?)`,
  )
    .bind(outboxId, '{ "originalRecord": {"previous":true}, "deadAtMs":50 }')
    .run();
}

describe("event progress recovery checkpoints", () => {
  let legacyBefore: Record<string, unknown> | null;
  let legacyAfter: Record<string, unknown> | null;

  beforeAll(async () => {
    const migrationIndex = testEnv.TEST_EVENT_D1_MIGRATIONS.findIndex((entry) =>
      entry.name.startsWith("0006_"),
    );
    expect(migrationIndex).toBeGreaterThan(0);
    await applyEventTestMigrations(
      testEnv.EVENT_DB,
      testEnv.TEST_EVENT_D1_MIGRATIONS.slice(0, migrationIndex),
    );
    await seedEvent();
    const plan = await seedOutbox();
    legacyBefore = await testEnv.EVENT_DB.prepare(
      "SELECT * FROM event_progress_outboxes WHERE outbox_id = ?",
    )
      .bind(plan.outboxId)
      .first();
    await applyD1Migrations(
      testEnv.EVENT_DB,
      testEnv.TEST_EVENT_D1_MIGRATIONS.slice(migrationIndex),
    );
    legacyAfter = await testEnv.EVENT_DB.prepare(
      "SELECT * FROM event_progress_outboxes WHERE outbox_id = ?",
    )
      .bind(plan.outboxId)
      .first();
  });

  beforeEach(async () => {
    await testEnv.EVENT_DB.batch([
      testEnv.EVENT_DB.prepare("DELETE FROM event_progress_outboxes"),
      testEnv.EVENT_DB.prepare("DELETE FROM event_write_admissions"),
      testEnv.EVENT_DB.prepare("DELETE FROM event_records"),
      testEnv.EVENT_DB.prepare(
        "UPDATE event_runtime_control SET storage_mode = 'd1' WHERE singleton = 1",
      ),
    ]);
    await seedEvent();
  });

  it("adds an immediately eligible checkpoint without rewriting historical payloads", () => {
    expect(legacyAfter).toEqual({ ...legacyBefore, next_reconcile_at_ms: 0 });
  });

  it("keeps metadata separate from JSON, queued time, and old readers", async () => {
    const plan = await seedOutbox();
    await withStore(async (store) => {
      const original = await store.read(plan.outboxId);
      expect(original?.nextReconcileAtMs).toBe(0);
      expect(await store.listDue(100, 10)).toEqual([original]);
      expect(await store.checkpoint(original!, 3_600_000)).toBe(true);
      expect(await store.listDue(3_599_999, 10)).toEqual([]);
      expect(await store.listDue(3_600_000, 10)).toEqual([
        { ...original, nextReconcileAtMs: 3_600_000 },
      ]);
      expect(await listDueEventProgressOutboxes(testEnv.EVENT_DB, 100)).toEqual(
        [{ outboxId: plan.outboxId, record: plan.outbox }],
      );
      expect(
        await testEnv.EVENT_DB.prepare(
          "SELECT record_json, last_queued_at_ms FROM event_progress_outboxes WHERE outbox_id = ?",
        )
          .bind(plan.outboxId)
          .first(),
      ).toEqual({
        record_json: original!.recordJson,
        last_queued_at_ms: 100,
      });
    });
  });

  it("uses the due index and preserves bounded timestamp ordering", async () => {
    const first = await seedOutbox("first", 200);
    const second = await seedOutbox("second", 100);
    const third = await seedOutbox("third", 300);
    await withStore(async (store) => {
      expect((await store.listDue(0, 1)).map((row) => row.outboxId)).toEqual([
        second.outboxId,
      ]);
      await store.checkpoint((await store.read(second.outboxId))!, 100);
      await store.checkpoint((await store.read(first.outboxId))!, 500);
      expect((await store.listDue(100, 10)).map((row) => row.outboxId)).toEqual(
        [third.outboxId, second.outboxId],
      );
      const explained = await testEnv.EVENT_DB.prepare(
        `EXPLAIN QUERY PLAN SELECT outbox_id, record_json, next_reconcile_at_ms
         FROM event_progress_outboxes
         WHERE status = 'pending' AND next_reconcile_at_ms <= ?
         ORDER BY next_reconcile_at_ms, last_queued_at_ms, outbox_id LIMIT ?`,
      )
        .bind(100, 10)
        .all<{ detail: string }>();
      const details = explained.results.map((row) => row.detail).join("\n");
      expect(details).toContain("idx_event_progress_outboxes_reconcile");
      expect(details).not.toContain("TEMP B-TREE");
    });
  });

  it("allows concurrent shortening but rejects stale extension", async () => {
    const plan = await seedOutbox();
    await withStore(async (store) => {
      const observed = (await store.read(plan.outboxId))!;
      expect(await store.checkpoint(observed, 3_600_000)).toBe(true);
      expect(await store.checkpoint(observed, 300_000)).toBe(true);
      expect(await store.checkpoint(observed, 3_600_000)).toBe(false);
      const fresh = (await store.read(plan.outboxId))!;
      expect(fresh.nextReconcileAtMs).toBe(300_000);
      expect(await store.checkpoint(fresh, 3_900_000)).toBe(true);
    });
  });

  it("ignores checkpoints and removals for replaced or deleted payloads", async () => {
    const plan = await seedOutbox();
    await withStore(async (store) => {
      const observed = (await store.read(plan.outboxId))!;
      await testEnv.EVENT_DB.prepare(
        "UPDATE event_progress_outboxes SET record_json = ? WHERE outbox_id = ?",
      )
        .bind(
          JSON.stringify({ ...plan.outbox, firstQueuedAtMs: 200 }),
          plan.outboxId,
        )
        .run();
      expect(await store.checkpoint(observed, 3_600_000)).toBe(false);
      expect(await store.remove(observed)).toBe(false);
      expect((await store.read(plan.outboxId))?.nextReconcileAtMs).toBe(0);
      const fresh = (await store.read(plan.outboxId))!;
      expect(await store.remove(fresh)).toBe(true);
      expect(await store.checkpoint(fresh, 3_600_000)).toBe(false);
      expect(await store.remove(fresh)).toBe(false);
      expect(await store.read(plan.outboxId)).toBeNull();
    });
  });

  it.each([
    "valid",
    "malformed",
    "reformatted",
    "reordered",
    "deleted",
  ] as const)(
    "does not quarantine a snapshot concurrently %s or overwrite its archive",
    async (replacement) => {
      const malformed = { schemaVersion: 2, eventId };
      const plan = await seedMalformedOutbox(malformed);
      await seedDeadOutbox(plan.outboxId);
      const previousDead = (await storedOutboxes())[0];
      const admission = await acquireEventWriteAdmission(testEnv.EVENT_DB);
      const recordJson =
        replacement === "valid"
          ? JSON.stringify(plan.outbox)
          : replacement === "malformed"
            ? JSON.stringify({ ...malformed, replaced: true })
            : replacement === "reordered"
              ? JSON.stringify({ eventId, schemaVersion: 2 })
              : JSON.stringify(malformed);
      try {
        const observed = observeD1FailureDatabase(testEnv.EVENT_DB, {
          async beforeWriteBatch() {
            await testEnv.EVENT_DB.prepare(
              replacement === "deleted"
                ? "DELETE FROM event_progress_outboxes WHERE status = 'pending' AND outbox_id = ?"
                : "UPDATE event_progress_outboxes SET record_json = ? WHERE status = 'pending' AND outbox_id = ?",
            )
              .bind(
                ...(replacement === "deleted"
                  ? [plan.outboxId]
                  : [recordJson, plan.outboxId]),
              )
              .run();
          },
        });
        const store = createEventProgressRecoveryStore(
          observed.database,
          admission,
        );
        const snapshot = (await store.read(plan.outboxId))!;
        expect(snapshot.recordJson).toBe(JSON.stringify(malformed, null, 2));
        expect(await store.deadLetter(snapshot, 500)).toBe(false);
        expect(observed.writeBatches).toHaveLength(1);
        const rows = await storedOutboxes();
        expect(rows[0]).toEqual(previousDead);
        if (replacement === "deleted") {
          expect(rows).toHaveLength(1);
        } else {
          expect(rows).toHaveLength(2);
          expect(rows[1].record_json).toBe(recordJson);
        }
      } finally {
        await releaseEventWriteAdmission(testEnv.EVENT_DB, admission);
      }
    },
  );

  it.each([false, true])(
    "quarantines an exact snapshot atomically with an existing archive: %s",
    async (existingArchive) => {
      const originalRecord = { schemaVersion: 2, eventId, retained: "value" };
      const plan = await seedMalformedOutbox(originalRecord);
      if (existingArchive) {
        await seedDeadOutbox(plan.outboxId);
        await testEnv.EVENT_DB.prepare(
          "UPDATE event_progress_outboxes SET next_reconcile_at_ms = 3_600_000 WHERE status = 'dead' AND outbox_id = ?",
        )
          .bind(plan.outboxId)
          .run();
      }
      await withStore(async (store) => {
        const snapshot = (await store.read(plan.outboxId))!;
        expect(await store.deadLetter(snapshot, 500)).toBe(true);
        expect(await store.read(plan.outboxId)).toBeNull();
        const [archived] = await storedOutboxes();
        expect(archived).toEqual({
          outbox_id: plan.outboxId,
          event_id: eventId,
          status: "dead",
          run_at_ms: null,
          last_queued_at_ms: 500,
          record_json: JSON.stringify({
            deadAtMs: 500,
            originalRecord,
            reason: "invalid-event-progress-outbox",
          }),
          next_reconcile_at_ms: 0,
        });
        expect(await store.deadLetter(snapshot, 600)).toBe(false);
        expect(await storedOutboxes()).toEqual([archived]);
      });
    },
  );

  it.each([
    { eventId: "other-event", expectedEventId: "other-event" },
    { eventId: "missing-event", expectedEventId: null },
    { eventId: " bad-event ", expectedEventId: null },
    { eventId: undefined, expectedEventId: null },
  ])(
    "retains the legacy archive association for payload event $eventId",
    async ({ eventId: originalEventId, expectedEventId }) => {
      await seedEvent("other-event");
      const originalRecord = {
        schemaVersion: 2,
        ...(originalEventId === undefined ? {} : { eventId: originalEventId }),
      };
      const plan = await seedMalformedOutbox(originalRecord);
      await withStore(async (store) => {
        expect(
          await store.deadLetter((await store.read(plan.outboxId))!, 500),
        ).toBe(true);
      });
      expect((await storedOutboxes())[0].event_id).toBe(expectedEventId);
    },
  );

  it.each([" padded-id ", "bad#key", "bad\nkey"])(
    "rejects malformed outbox ID %j without changing or normalizing it",
    async (outboxId) => {
      const plan = await seedMalformedOutbox({ schemaVersion: 2 });
      await testEnv.EVENT_DB.prepare(
        "UPDATE event_progress_outboxes SET outbox_id = ? WHERE outbox_id = ?",
      )
        .bind(outboxId, plan.outboxId)
        .run();
      const before = await storedOutboxes();
      await withStore(async (store) => {
        const [snapshot] = await store.listDue(0, 1);
        expect(snapshot.outboxId).toBe(outboxId);
        await expect(store.deadLetter(snapshot, 500)).rejects.toThrow(
          "invalid-event-path",
        );
      });
      expect(await storedOutboxes()).toEqual(before);
    },
  );

  it("rolls back archive replacement when pending deletion fails", async () => {
    const plan = await seedMalformedOutbox({ schemaVersion: 2 });
    await seedDeadOutbox(plan.outboxId);
    const before = await storedOutboxes();
    await testEnv.EVENT_DB.prepare(
      `CREATE TRIGGER reject_progress_quarantine_delete
       BEFORE DELETE ON event_progress_outboxes
       WHEN OLD.status = 'pending'
       BEGIN SELECT RAISE(ABORT, 'test-quarantine-delete-failed'); END`,
    ).run();
    try {
      await withStore(async (store) => {
        await expect(
          store.deadLetter((await store.read(plan.outboxId))!, 500),
        ).rejects.toThrow("test-quarantine-delete-failed");
      });
      expect(await storedOutboxes()).toEqual(before);
    } finally {
      await testEnv.EVENT_DB.prepare(
        "DROP TRIGGER reject_progress_quarantine_delete",
      ).run();
    }
  });

  it.each([
    ["event_id", "another-event"],
    ["status", "dead"],
    ["run_at_ms", 30_000_000],
    ["last_queued_at_ms", 200],
    ["record_json", '{"schemaVersion":2}'],
  ] as const)(
    "old writers changing %s invalidate the checkpoint",
    async (column, value) => {
      await seedEvent("another-event");
      const plan = await seedOutbox();
      await withStore(async (store) => {
        await store.checkpoint((await store.read(plan.outboxId))!, 3_600_000);
        await testEnv.EVENT_DB.prepare(
          `UPDATE event_progress_outboxes SET ${column} = ? WHERE outbox_id = ?`,
        )
          .bind(value, plan.outboxId)
          .run();
        expect(
          await testEnv.EVENT_DB.prepare(
            "SELECT next_reconcile_at_ms FROM event_progress_outboxes WHERE outbox_id = ?",
          )
            .bind(plan.outboxId)
            .first("next_reconcile_at_ms"),
        ).toBe(0);
      });
    },
  );

  it("identical old producer upserts preserve a confirmed checkpoint and acknowledgment deletes it", async () => {
    const plan = await seedOutbox();
    await withStore(async (store) => {
      await store.checkpoint((await store.read(plan.outboxId))!, 3_600_000);
      const admission = await acquireEventWriteAdmission(testEnv.EVENT_DB);
      try {
        await commitEventMutations(
          testEnv.EVENT_DB,
          [
            {
              kind: "progress-outbox",
              outboxId: plan.outboxId,
              value: plan.outbox,
            },
          ],
          { admission },
        );
        expect((await store.read(plan.outboxId))?.nextReconcileAtMs).toBe(
          3_600_000,
        );
        await commitEventMutations(
          testEnv.EVENT_DB,
          [{ kind: "progress-outbox", outboxId: plan.outboxId, value: null }],
          { admission },
        );
        expect(await store.read(plan.outboxId)).toBeNull();
      } finally {
        await releaseEventWriteAdmission(testEnv.EVENT_DB, admission);
      }
    });
  });

  it("rejects recovery writes after the admission is released", async () => {
    const plan = await seedOutbox();
    const admission = await acquireEventWriteAdmission(testEnv.EVENT_DB);
    const store = createEventProgressRecoveryStore(testEnv.EVENT_DB, admission);
    const observed = (await store.read(plan.outboxId))!;
    await releaseEventWriteAdmission(testEnv.EVENT_DB, admission);
    await expect(store.checkpoint(observed, 3_600_000)).rejects.toThrow();
    await expect(store.remove(observed)).rejects.toThrow();
    await expect(store.deadLetter(observed, 500)).rejects.toThrow();
    expect(await store.read(plan.outboxId)).toEqual(observed);
  });

  it("rejects stale recovery writes after the event store freezes", async () => {
    const plan = await seedOutbox();
    const admission = await acquireEventWriteAdmission(testEnv.EVENT_DB);
    const store = createEventProgressRecoveryStore(testEnv.EVENT_DB, admission);
    const observed = (await store.read(plan.outboxId))!;
    await releaseEventWriteAdmission(testEnv.EVENT_DB, admission);
    await testEnv.EVENT_DB.prepare(
      `UPDATE event_runtime_control
       SET storage_mode = 'frozen', freeze_generation = freeze_generation + 1
       WHERE singleton = 1`,
    ).run();
    await expect(store.checkpoint(observed, 3_600_000)).rejects.toThrow();
    await expect(store.remove(observed)).rejects.toThrow();
    await expect(store.deadLetter(observed, 500)).rejects.toThrow();
    expect(await store.read(plan.outboxId)).toEqual(observed);
  });

  it("rejects quarantine after its admission expires", async () => {
    const plan = await seedMalformedOutbox({ schemaVersion: 2 });
    const admission = await acquireEventWriteAdmission(testEnv.EVENT_DB, {
      nowMs: 0,
      ttlMs: 1,
    });
    const store = createEventProgressRecoveryStore(testEnv.EVENT_DB, admission);
    const snapshot = (await store.read(plan.outboxId))!;
    const before = await storedOutboxes();
    try {
      await expect(store.deadLetter(snapshot, 500)).rejects.toThrow();
      expect(await storedOutboxes()).toEqual(before);
    } finally {
      await releaseEventWriteAdmission(testEnv.EVENT_DB, admission);
    }
  });
});
