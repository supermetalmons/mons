import { readCanonicalProfileOwnershipSnapshot } from "./profileCanonical/auth.ts";
import type { ProfileOwnershipReader } from "./profileOwnership.ts";
import { mapCanonicalOwnershipSnapshot } from "./profileOwnershipMapping.ts";
import {
  createGameplayRepositoryFailure,
  type CanonicalRepositoryOptions,
} from "./gameplayRepositoryPolicy.ts";

export function createD1ProfileOwnershipReader(
  db: D1Database,
  options: Pick<CanonicalRepositoryOptions, "createFailure"> = {
    createFailure: createGameplayRepositoryFailure,
  },
): ProfileOwnershipReader {
  return {
    async readProfileOwnershipSnapshot(query) {
      try {
        return mapCanonicalOwnershipSnapshot(
          await readCanonicalProfileOwnershipSnapshot(db, query),
        );
      } catch (error) {
        throw options.createFailure("readProfileOwnershipSnapshot", {
          cause: error,
        });
      }
    },
  };
}
