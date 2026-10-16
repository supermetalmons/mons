import { Buffer } from "node:buffer";
import {
  CanonicalProfileCorruption,
  type RatingRow,
} from "./profileCanonical/types.ts";
import {
  nonempty,
  nullableSafeInteger,
  safeInteger,
} from "./profileCanonical/validation.ts";
import type {
  PendingRatingEventProgress,
  PendingRatingProfileGameProjection,
  PendingRatingTelegramProjection,
} from "./ratingContracts.ts";

type RatingRecoveryRow = Pick<RatingRow, "operation_id" | "revision">;

type RatingGameRecoveryRow = RatingRecoveryRow &
  Pick<RatingRow, "invite_id" | "match_id"> & { version: number | null };

type RatingEventRecoveryRow = RatingGameRecoveryRow & {
  event_id_hex: string | null;
};

function parseRatingRecoveryRow(
  row: RatingRecoveryRow,
): PendingRatingTelegramProjection {
  return {
    operationId: nonempty(row.operation_id),
    revision: safeInteger(row.revision, 1),
  };
}

function parseRatingGameRecoveryRow(
  row: RatingGameRecoveryRow,
): PendingRatingProfileGameProjection {
  return {
    ...parseRatingRecoveryRow(row),
    inviteId: nonempty(row.invite_id),
    matchId: nonempty(row.match_id),
    version: nullableSafeInteger(row.version) ?? 0,
  };
}

function parseRatingEventId(hex: string | null): string {
  if (hex === null) return "";
  try {
    return new TextDecoder("utf-8", { fatal: true })
      .decode(Buffer.from(hex, "hex"))
      .trim();
  } catch {
    throw new CanonicalProfileCorruption();
  }
}

async function listDueRatings<Row>(
  db: D1Database,
  query: string,
  updatedBeforeMs: number,
  limit: number,
): Promise<Row[]> {
  if (
    !Number.isSafeInteger(updatedBeforeMs) ||
    updatedBeforeMs < 0 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  ) {
    throw new TypeError("invalid-rating-projection-list");
  }
  const result = await db
    .prepare(query)
    .bind(updatedBeforeMs, limit)
    .all<Row>();
  return result.results;
}

export async function listDueRatingEventProgress(
  db: D1Database,
  updatedBeforeMs: number,
  limit: number,
): Promise<PendingRatingEventProgress[]> {
  return (
    await listDueRatings<RatingEventRecoveryRow>(
      db,
      `SELECT operation_id, revision, invite_id, match_id,
                  event_progress_version AS version,
                  (SELECT CASE WHEN type = 'text' THEN hex(atom) ELSE NULL END
                   FROM json_each(rating_updates.payload_json)
                   WHERE key = 'eventId'
                   ORDER BY id DESC LIMIT 1) AS event_id_hex
           FROM rating_updates
           WHERE event_progress_state = 'pending' AND event_progress_updated_at_ms <= ?
           ORDER BY event_progress_updated_at_ms ASC, operation_id ASC
           LIMIT ?`,
      updatedBeforeMs,
      limit,
    )
  ).map((row) => ({
    ...parseRatingGameRecoveryRow(row),
    eventId: parseRatingEventId(row.event_id_hex),
  }));
}

export async function listDueRatingProfileGameProjections(
  db: D1Database,
  updatedBeforeMs: number,
  limit: number,
): Promise<PendingRatingProfileGameProjection[]> {
  return (
    await listDueRatings<RatingGameRecoveryRow>(
      db,
      `SELECT operation_id, revision, invite_id, match_id,
                  profile_game_projection_version AS version
           FROM rating_updates
           WHERE profile_game_projection_state = 'pending' AND profile_game_projection_updated_at_ms <= ?
           ORDER BY profile_game_projection_updated_at_ms ASC, operation_id ASC
           LIMIT ?`,
      updatedBeforeMs,
      limit,
    )
  ).map(parseRatingGameRecoveryRow);
}

export async function listDueRatingTelegramProjections(
  db: D1Database,
  updatedBeforeMs: number,
  limit: number,
): Promise<PendingRatingTelegramProjection[]> {
  return (
    await listDueRatings<RatingRecoveryRow>(
      db,
      `SELECT operation_id, revision
           FROM rating_updates
           WHERE telegram_projection_state = 'pending' AND telegram_projection_updated_at_ms <= ?
           ORDER BY telegram_projection_updated_at_ms ASC, operation_id ASC
           LIMIT ?`,
      updatedBeforeMs,
      limit,
    )
  ).map(parseRatingRecoveryRow);
}
