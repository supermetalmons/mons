import type {
  RatingEventProgressRepository,
  RatingGameplayReader,
  RatingProfileGameProjectionRepository,
  RatingProjectionRepository,
} from "./ratingContracts.ts";
import {
  type CanonicalRepositoryOptions,
  retryCount,
} from "./gameplayRepositoryPolicy.ts";
import { createRatingOperations } from "./ratingCanonical/operations.ts";
import { createFebruaryChallengeReplay } from "./ratingCanonical/february.ts";
import { createRatingProjections } from "./ratingCanonical/projections.ts";

type CanonicalRatingRepository = RatingProjectionRepository &
  RatingEventProgressRepository &
  RatingProfileGameProjectionRepository;

export function createCanonicalRatingRepository(
  db: D1Database,
  gameplay: RatingGameplayReader,
  options: CanonicalRepositoryOptions,
): Omit<CanonicalRatingRepository, "putEventProgressOutbox"> {
  const attempts = retryCount(options.maxAttempts);
  return {
    readInviteMetadata: gameplay.readInviteMetadata,
    readMatchRecord: gameplay.readMatchRecord,
    readMatchPair: gameplay.readMatchPair,
    readProfileOwnershipSnapshot: gameplay.readProfileOwnershipSnapshot,
    ...createRatingOperations(db, options, attempts),
    applyFebruaryChallengeReplay: createFebruaryChallengeReplay(
      db,
      options,
      attempts,
    ),
    ...createRatingProjections(db, attempts),
  };
}
