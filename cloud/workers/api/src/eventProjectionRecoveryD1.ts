import {
  listDueProjectionOutboxSnapshots,
  type ProjectionOutboxKind,
  type ProjectionOutboxSnapshot,
} from "./eventD1/reads.ts";
import { claimEventProjectionOutboxSnapshot } from "./eventD1/projectionOutboxes.ts";
import {
  transactEventProfileGameProjectionOutbox,
  transactEventTelegramProjectionOutbox,
} from "./eventD1/transactions.ts";
import { EventD1Failure, type EventD1Connection } from "./eventD1/types.ts";
import type { EventRecordTransaction } from "./eventStoreContracts.ts";
import { withEventWriteAdmission } from "./eventWriteAdmission.ts";

export type EventProjectionRecoveryKind = ProjectionOutboxKind;
export type EventProjectionRecoverySnapshot = ProjectionOutboxSnapshot;

export type EventProjectionRecoveryWriter = {
  claim(
    snapshot: EventProjectionRecoverySnapshot,
    requestId: string,
    expectedTimestamp: number,
    nowMs: number,
    signal?: AbortSignal,
  ): Promise<boolean>;
  transact: EventRecordTransaction;
};

export type EventProjectionRecoveryStore = {
  listDue(
    beforeMs: number,
    limit: number,
  ): Promise<EventProjectionRecoverySnapshot[]>;
  withAdmission<T>(
    work: (writer: EventProjectionRecoveryWriter) => Promise<T>,
  ): Promise<T>;
};

export function createEventProjectionRecoveryStore(
  db: EventD1Connection,
  kind: EventProjectionRecoveryKind,
): EventProjectionRecoveryStore {
  const transact =
    kind === "profile-game"
      ? transactEventProfileGameProjectionOutbox
      : transactEventTelegramProjectionOutbox;
  return {
    listDue: (beforeMs, limit) =>
      listDueProjectionOutboxSnapshots(db, kind, beforeMs, limit),
    withAdmission: (work) =>
      withEventWriteAdmission(
        db,
        { kind: "mutation", context: "event-path-transaction" },
        (admission) =>
          work({
            claim(snapshot, requestId, expectedTimestamp, nowMs, signal) {
              if (snapshot.kind !== kind) {
                return Promise.reject(
                  new EventD1Failure("event-projection-recovery-kind-mismatch"),
                );
              }
              return claimEventProjectionOutboxSnapshot(
                db,
                snapshot,
                requestId,
                expectedTimestamp,
                nowMs,
                { admission, signal },
              );
            },
            transact: (eventId, updater, signal) =>
              transact(db, eventId, updater, { admission, signal }),
          }),
      ),
  };
}
