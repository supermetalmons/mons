import type { EventOutboxReads } from "../src/eventOutboxReadRepository.ts";
import type { EventStore } from "../src/eventStoreContracts.ts";
import type {
  EventProjectionRecoveryKind,
  EventProjectionRecoveryStore,
  EventProjectionRecoveryWriter,
} from "../src/eventProjectionRecoveryD1.ts";

function recoveryFixture(
  kind: EventProjectionRecoveryKind,
  listDue: (
    beforeMs: number,
    limit: number,
  ) => Promise<Array<{ eventId: string; record: unknown }>>,
  writer: EventProjectionRecoveryWriter,
): EventProjectionRecoveryStore {
  return {
    async listDue(beforeMs, limit) {
      return (await listDue(beforeMs, limit)).map(({ eventId, record }) => ({
        kind,
        eventId,
        record,
        recordJson: JSON.stringify(record) ?? "null",
      }));
    },
    withAdmission: (work) => work(writer),
  };
}

export function profileGameProjectionRecoveryFixture(
  source: Pick<
    EventStore,
    | "claimEventProfileGameProjectionOutbox"
    | "transactEventProfileGameProjectionOutbox"
  > &
    Pick<EventOutboxReads, "listDueEventProfileGameProjectionOutboxes">,
): EventProjectionRecoveryStore {
  return recoveryFixture(
    "profile-game",
    (beforeMs, limit) =>
      source.listDueEventProfileGameProjectionOutboxes(beforeMs, limit),
    {
      claim: (snapshot, requestId, expected, nowMs, signal) =>
        source.claimEventProfileGameProjectionOutbox(
          snapshot.eventId,
          requestId,
          expected,
          nowMs,
          signal,
        ),
      transact: (...args) =>
        source.transactEventProfileGameProjectionOutbox(...args),
    },
  );
}

export function telegramProjectionRecoveryFixture(
  source: Pick<
    EventStore,
    | "claimEventTelegramProjectionOutbox"
    | "transactEventTelegramProjectionOutbox"
  > &
    Pick<EventOutboxReads, "listDueEventTelegramProjectionOutboxes">,
): EventProjectionRecoveryStore {
  return recoveryFixture(
    "telegram",
    (beforeMs, limit) =>
      source.listDueEventTelegramProjectionOutboxes(beforeMs, limit),
    {
      claim: (snapshot, requestId, expected, nowMs, signal) =>
        source.claimEventTelegramProjectionOutbox(
          snapshot.eventId,
          requestId,
          expected,
          nowMs,
          signal,
        ),
      transact: (...args) =>
        source.transactEventTelegramProjectionOutbox(...args),
    },
  );
}
