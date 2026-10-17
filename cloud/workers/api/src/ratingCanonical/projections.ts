import {
  commitCanonicalPlan,
  CanonicalProfileConflict,
} from "../profileCanonicalD1.ts";
import {
  canonicalRatingProjectionFields,
  buildCanonicalRatingProjectionMutation,
  readCanonicalRatingProjectionSnapshot,
} from "../profileCanonical/accounting.ts";
import type { CanonicalRatingProjectionKind } from "../profileCanonical/types.ts";
import type {
  RatingEventProgressRepository,
  RatingProfileGameProjectionRepository,
  RatingProjectionRepository,
} from "../ratingContracts.ts";
import {
  scanDueRatingEventProgress,
  scanDueRatingProfileGameProjections,
  scanDueRatingTelegramProjections,
  quarantineRatingRecoveryEntry,
} from "../ratingProjectionD1.ts";
import { mergedRatingValue } from "./codec.ts";

async function claimProjection(
  db: D1Database,
  operationId: string,
  expectedRevision: number,
  claimedAtMs: number,
  projection: CanonicalRatingProjectionKind,
): Promise<boolean> {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1)
    return false;
  const stored = await readCanonicalRatingProjectionSnapshot(db, operationId);
  if (!stored || stored.snapshot.revision !== expectedRevision) return false;
  const { snapshot, payloadJson } = stored;
  const fields = canonicalRatingProjectionFields(projection);
  try {
    await commitCanonicalPlan(db, {
      expectations: [
        {
          kind: "rating-update-revision",
          operationId,
          revision: expectedRevision,
        },
      ],
      mutations: [
        buildCanonicalRatingProjectionMutation(
          snapshot,
          mergedRatingValue(snapshot, { [fields.updated]: claimedAtMs }),
          projection,
          payloadJson,
        ),
      ],
    });
    return true;
  } catch (error) {
    if (error instanceof CanonicalProfileConflict) return false;
    throw error;
  }
}

async function markProjection(
  db: D1Database,
  operationId: string,
  state: "dead" | "done",
  updatedAtMs: number,
  reason: string | undefined,
  projection: CanonicalRatingProjectionKind,
  attempts: number,
): Promise<void> {
  const fields = canonicalRatingProjectionFields(projection);
  for (let attempt = 0; attempt < attempts; attempt++) {
    const stored = await readCanonicalRatingProjectionSnapshot(db, operationId);
    if (!stored) throw new TypeError("rating-operation-missing");
    const { snapshot, payloadJson } = stored;
    try {
      await commitCanonicalPlan(db, {
        expectations: [
          {
            kind: "rating-update-revision",
            operationId,
            revision: snapshot.revision,
          },
        ],
        mutations: [
          buildCanonicalRatingProjectionMutation(
            snapshot,
            mergedRatingValue(snapshot, {
              [fields.state]: state,
              [fields.updated]: updatedAtMs,
              [fields.reason]: reason?.trim() || null,
            }),
            projection,
            payloadJson,
          ),
        ],
      });
      return;
    } catch (error) {
      if (!(error instanceof CanonicalProfileConflict)) throw error;
    }
  }
  throw new CanonicalProfileConflict();
}

export function createRatingProjections(
  db: D1Database,
  attempts: number,
): Pick<
  RatingEventProgressRepository &
    RatingProfileGameProjectionRepository &
    RatingProjectionRepository,
  | "claimRatingEventProgress"
  | "claimRatingProfileGameProjection"
  | "claimRatingTelegramProjection"
  | "scanDueRatingEventProgress"
  | "scanDueRatingProfileGameProjections"
  | "scanDueRatingTelegramProjections"
  | "quarantineRatingRecoveryEntry"
  | "markRatingEventProgress"
  | "markRatingProfileGameProjection"
  | "markRatingTelegramProjection"
> {
  return {
    quarantineRatingRecoveryEntry: (entry, nowMs) =>
      quarantineRatingRecoveryEntry(db, entry, nowMs),
    async claimRatingEventProgress(operationId, expectedRevision, claimedAtMs) {
      return claimProjection(
        db,
        operationId,
        expectedRevision,
        claimedAtMs,
        "event-progress",
      );
    },

    async claimRatingProfileGameProjection(
      operationId,
      expectedRevision,
      claimedAtMs,
    ) {
      return claimProjection(
        db,
        operationId,
        expectedRevision,
        claimedAtMs,
        "profile-game",
      );
    },

    async claimRatingTelegramProjection(
      operationId,
      expectedRevision,
      claimedAtMs,
    ) {
      return claimProjection(
        db,
        operationId,
        expectedRevision,
        claimedAtMs,
        "telegram",
      );
    },

    async scanDueRatingEventProgress(updatedBeforeMs, limit) {
      return scanDueRatingEventProgress(db, updatedBeforeMs, limit);
    },
    async scanDueRatingProfileGameProjections(updatedBeforeMs, limit) {
      return scanDueRatingProfileGameProjections(db, updatedBeforeMs, limit);
    },
    async scanDueRatingTelegramProjections(updatedBeforeMs, limit) {
      return scanDueRatingTelegramProjections(db, updatedBeforeMs, limit);
    },
    async markRatingEventProgress(operationId, state, updatedAtMs, reason) {
      return markProjection(
        db,
        operationId,
        state,
        updatedAtMs,
        reason,
        "event-progress",
        attempts,
      );
    },

    async markRatingProfileGameProjection(
      operationId,
      state,
      updatedAtMs,
      reason,
    ) {
      return markProjection(
        db,
        operationId,
        state,
        updatedAtMs,
        reason,
        "profile-game",
        attempts,
      );
    },

    async markRatingTelegramProjection(
      operationId,
      state,
      updatedAtMs,
      reason,
    ) {
      return markProjection(
        db,
        operationId,
        state,
        updatedAtMs,
        reason,
        "telegram",
        attempts,
      );
    },
  };
}
