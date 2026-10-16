import {
  commitCanonicalPlan,
  CanonicalProfileConflict,
  type CanonicalExpectation,
  type CanonicalMutation,
} from "../profileCanonicalD1.ts";
import { readCanonicalProfileIdMap } from "../profileCanonical/auth.ts";
import {
  patchCanonicalProfile,
  readCanonicalChallengeReplayProfiles,
} from "../profileMutationD1.ts";
import type { RatingRepository } from "../ratingContracts.ts";
import type { CanonicalRepositoryOptions } from "../gameplayRepositoryPolicy.ts";
import { mapFailure } from "./operations.ts";

async function canonicalProfileIds(
  db: D1Database,
  profileIds: readonly string[],
): Promise<Array<string | null>> {
  const canonicalIds = await readCanonicalProfileIdMap(db, profileIds);
  return profileIds.map((profileId) => canonicalIds.get(profileId) ?? null);
}

export function createFebruaryChallengeReplay(
  db: D1Database,
  options: CanonicalRepositoryOptions,
  attempts: number,
): RatingRepository["applyFebruaryChallengeReplay"] {
  return async function applyFebruaryChallengeReplay(
    playerProfileId,
    opponentProfileId,
  ) {
    if (!playerProfileId || !opponentProfileId) {
      return;
    }
    let lastConflict: CanonicalProfileConflict | undefined;
    for (let attempt = 0; attempt < attempts; attempt++) {
      let resolvedProfileIds: Array<string | null>;
      try {
        resolvedProfileIds = await canonicalProfileIds(db, [
          playerProfileId,
          opponentProfileId,
        ]);
      } catch (error) {
        mapFailure(
          error,
          options.createFailure,
          "applyFebruaryChallengeReplay",
        );
      }
      const [resolvedPlayerProfileId, resolvedOpponentProfileId] =
        resolvedProfileIds;
      if (
        !resolvedPlayerProfileId ||
        !resolvedOpponentProfileId ||
        resolvedPlayerProfileId === resolvedOpponentProfileId
      ) {
        return;
      }
      const { player, opponent } = await readCanonicalChallengeReplayProfiles(
        db,
        {
          playerProfileId: resolvedPlayerProfileId,
          opponentProfileId: resolvedOpponentProfileId,
        },
      );
      if (
        player.profile?.state !== "active" ||
        player.profile.profileId !== resolvedPlayerProfileId ||
        opponent.profile?.state !== "active" ||
        opponent.profile.profileId !== resolvedOpponentProfileId
      ) {
        continue;
      }
      const storedOpponentProfileIds = Array.from(
        new Set([
          ...player.februaryOpponentProfileIds,
          ...opponent.februaryOpponentProfileIds,
        ]),
      );
      let resolvedStoredOpponentProfileIds: Array<string | null>;
      try {
        resolvedStoredOpponentProfileIds = await canonicalProfileIds(
          db,
          storedOpponentProfileIds,
        );
      } catch (error) {
        mapFailure(
          error,
          options.createFailure,
          "applyFebruaryChallengeReplay",
        );
      }
      const canonicalOpponentByStoredId = new Map(
        storedOpponentProfileIds.map((storedProfileId, index) => [
          storedProfileId,
          resolvedStoredOpponentProfileIds[index] || storedProfileId,
        ]),
      );
      const changes = [
        [player, resolvedOpponentProfileId],
        [opponent, resolvedPlayerProfileId],
      ] as const;
      const expectations: CanonicalExpectation[] = [];
      const mutations: CanonicalMutation[] = [];
      for (const [aggregate, otherProfileId] of changes) {
        const snapshot = aggregate.profile;
        const canonicalOpponentProfileIds = new Set(
          aggregate.februaryOpponentProfileIds
            .map(
              (storedProfileId) =>
                canonicalOpponentByStoredId.get(storedProfileId) ||
                storedProfileId,
            )
            .filter((profileId) => profileId !== snapshot?.profileId),
        );
        if (!snapshot || canonicalOpponentProfileIds.has(otherProfileId)) {
          continue;
        }
        expectations.push({
          kind: "profile-revision",
          profileId: snapshot.profileId,
          revision: snapshot.revision,
        });
        expectations.push({
          kind: "february-opponent-absent",
          profileId: snapshot.profileId,
          opponentProfileId: otherProfileId,
        });
        expectations.push({
          kind: "canonical-february-opponent-absent",
          profileId: snapshot.profileId,
          opponentProfileId: otherProfileId,
        });
        mutations.push(
          {
            kind: "insert-february-opponent",
            profileId: snapshot.profileId,
            opponentProfileId: otherProfileId,
            recordedAtMs: options.now(),
          },
          {
            kind: "patch-active-profile",
            current: snapshot,
            value: patchCanonicalProfile(
              snapshot,
              {
                feb2026UniqueOpponentsCount:
                  aggregate.februaryOpponentProfileIds.length + 1,
              },
              options.now(),
            ),
          },
        );
      }
      if (mutations.length === 0) return;
      try {
        await commitCanonicalPlan(db, { expectations, mutations });
        return;
      } catch (error) {
        if (!(error instanceof CanonicalProfileConflict)) {
          mapFailure(
            error,
            options.createFailure,
            "applyFebruaryChallengeReplay",
          );
        }
        lastConflict = error;
      }
    }
    throw options.createFailure("applyFebruaryChallengeReplay", {
      cause: lastConflict,
    });
  };
}
