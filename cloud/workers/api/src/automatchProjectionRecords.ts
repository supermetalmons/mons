import {
  buildAutomatchTelegramProjection,
  mergeRatingResultFragment,
  type AutomatchTelegramProjection,
} from "../../../runtime/telegram/projectionCore.js";
import type { RawGameSessionPort } from "./gameSessionContracts.ts";
import type { HistoricalMatchDescriptor } from "./historicalMatches.ts";
import { parseAutomatchProfileGameProjectionOutbox } from "./profileGameProjectionOutbox.ts";
import type { RatingUpdateData } from "./ratingContracts.ts";
import { parseAutomatchTelegramProjectionOutbox } from "./telegramProjectionOutbox.ts";

export type AutomatchTelegramSourceSnapshot = {
  project(guestId: unknown): AutomatchTelegramProjection | null;
  fingerprint(guestId: unknown): string;
};

export type AutomatchTelegramOutboxSnapshot = {
  raw: unknown;
  value: ReturnType<typeof parseAutomatchTelegramProjectionOutbox>;
};

export type AutomatchProfileOutboxSnapshot = {
  raw: unknown;
  value: ReturnType<typeof parseAutomatchProfileGameProjectionOutbox>;
};

export type AutomatchTelegramRatingResultInput = Pick<
  RatingUpdateData,
  | "telegramDeliveryVersion"
  | "status"
  | "isEventMatch"
  | "eventOwned"
  | "eventId"
  | "inviteId"
  | "matchId"
  | "updateRatingMessage"
  | "completedAtMs"
>;

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function createAutomatchTelegramSourceSnapshot(
  inviteId: string,
  raw: unknown,
): AutomatchTelegramSourceSnapshot {
  return {
    project: (guestId) =>
      buildAutomatchTelegramProjection({
        inviteId,
        source: toRecord(raw),
        inviteData: { guestId },
      }),
    fingerprint: (guestId) =>
      JSON.stringify({ source: raw, guestId: guestId || null }),
  };
}

export function createAutomatchTelegramOutboxSnapshot(
  raw: unknown,
): AutomatchTelegramOutboxSnapshot {
  return { raw, value: parseAutomatchTelegramProjectionOutbox(raw) };
}

export function createAutomatchProfileOutboxSnapshot(
  raw: unknown,
): AutomatchProfileOutboxSnapshot {
  return { raw, value: parseAutomatchProfileGameProjectionOutbox(raw) };
}

export function createAutomatchProjectionCommands(
  raw: Pick<
    RawGameSessionPort,
    | "transactAutomatchTelegramSource"
    | "transactAutomatchTelegramOutbox"
    | "transactAutomatchProfileOutbox"
  >,
) {
  return {
    async mergeAutomatchTelegramRatingResult(
      inviteId: string,
      update: AutomatchTelegramRatingResultInput,
      signal?: AbortSignal,
    ): Promise<"inserted" | "duplicate" | "skipped"> {
      let mergeReason: "inserted" | "duplicate" | "skipped" = "skipped";
      await raw.transactAutomatchTelegramSource(
        inviteId,
        (source) => {
          const merged = mergeRatingResultFragment(source, update);
          mergeReason = merged.reason;
          return merged.changed
            ? { value: merged.source, decision: merged.reason }
            : { commit: false, decision: merged.reason };
        },
        signal,
      );
      return mergeReason;
    },
    async markAutomatchTelegramOutboxDead(
      inviteId: string,
      requestId: string,
      reason: string,
      now: () => number,
      signal?: AbortSignal,
    ): Promise<boolean> {
      const result = await raw.transactAutomatchTelegramOutbox(
        inviteId,
        (current) => {
          const record = toRecord(current);
          if (record?.requestId !== requestId) {
            return { commit: false, decision: "stale" };
          }
          return {
            value: {
              ...record,
              status: "dead",
              reason,
              updatedAtMs: null,
              deadAtMs: now(),
            },
            decision: "dead",
          };
        },
        signal,
      );
      return result.committed;
    },
    async settleAutomatchHistoricalDescriptor(
      inviteId: string,
      requestId: string,
      expected: HistoricalMatchDescriptor,
      retryNotBeforeMs?: number,
      signal?: AbortSignal,
    ): Promise<boolean> {
      const result = await raw.transactAutomatchProfileOutbox(
        inviteId,
        (current) => {
          const record = toRecord(current);
          const outbox = parseAutomatchProfileGameProjectionOutbox(current);
          if (!record || !outbox || outbox.requestId !== requestId) {
            return { commit: false, decision: "superseded" };
          }
          const historicalMatches = {
            ...(toRecord(record.historicalMatches) || {}),
          };
          const stored = outbox.historicalMatches?.find(
            ({ matchId }) => matchId === expected.matchId,
          );
          if (
            !stored ||
            stored.finalizedAtMs !== expected.finalizedAtMs ||
            stored.hostPlayerId !== expected.hostPlayerId ||
            stored.guestPlayerId !== expected.guestPlayerId ||
            stored.source !== expected.source ||
            stored.retryNotBeforeMs !== expected.retryNotBeforeMs
          ) {
            return { commit: false, decision: "changed" };
          }
          if (retryNotBeforeMs === undefined)
            delete historicalMatches[expected.matchId];
          else
            historicalMatches[expected.matchId] = {
              ...toRecord(historicalMatches[expected.matchId]),
              retryNotBeforeMs,
            };
          const next = { ...record };
          if (Object.keys(historicalMatches).length > 0) {
            next.historicalMatches = historicalMatches;
          } else {
            delete next.historicalMatches;
          }
          return {
            value: next,
            decision: retryNotBeforeMs === undefined ? "settled" : "deferred",
          };
        },
        signal,
      );
      return result.committed;
    },
  };
}

export type AutomatchProjectionCommands = ReturnType<
  typeof createAutomatchProjectionCommands
>;
