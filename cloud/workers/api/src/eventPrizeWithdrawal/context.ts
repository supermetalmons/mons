import { resolveProfileMergeTargetPath } from "../../../../runtime/profileMergeTargets.js";
import { isMatchingProfileEventPrizeAssignment } from "../../../../runtime/eventPrizeWithdrawalState.js";
import { EventPrizeWithdrawalError } from "../../../../runtime/eventPrizes/errors.js";
import {
  createEventGameplayRepository,
  type EventGameplayRepository,
} from "../eventRepository.ts";
import {
  createD1EventPrizeWithdrawalStore,
  readEventPrizeWithdrawalStorageMode,
  type EventPrizeWithdrawalStore,
} from "../eventPrizeWithdrawalD1.ts";
import { readCanonicalMergeTarget } from "../profileCanonicalD1.ts";
import {
  getCanonicalProfileId,
  getLoginProfileId,
  profileOwnershipUnavailable,
  requireProfileOwnershipSnapshot,
  type ProfileOwnershipReader,
} from "../profileOwnership.ts";

export type EventPrizeContext = {
  withdrawals: EventPrizeWithdrawalStore;
  readProfileEventPrizeAssignment: EventGameplayRepository["readProfileEventPrizeAssignment"];
  now(): number;
  readWithdrawal(
    eventId: string,
    prizeId: string,
  ): Promise<Record<string, unknown> | null>;
  readProfileByLoginUid(uid: string): Promise<{ id: string } | null>;
  readProfileOwnershipSnapshot: ProfileOwnershipReader["readProfileOwnershipSnapshot"];
  removeMatchingProfileEventPrizeAssignment(input: {
    profileId: string;
    eventId: string;
    prizeId: string;
  }): Promise<boolean>;
  resolveWithdrawalProfileId(profileId: string): Promise<string>;
  resolveCanonicalProfilePath(profileId: string): Promise<string[]>;
};

export type EventPrizeStatusDependencies = Pick<
  EventPrizeContext,
  | "readWithdrawal"
  | "readProfileOwnershipSnapshot"
  | "readProfileEventPrizeAssignment"
>;

export type EventPrizeRequestDependencies = EventPrizeStatusDependencies &
  Pick<
    EventPrizeContext,
    "removeMatchingProfileEventPrizeAssignment" | "resolveCanonicalProfilePath"
  > & {
    withdrawals: Pick<EventPrizeWithdrawalStore, "record">;
  };

export type EventPrizeGameplayRepository = Pick<
  EventGameplayRepository,
  | "readProfileOwnershipSnapshot"
  | "readProfileEventPrizeAssignment"
  | "transactProfileEventPrize"
>;

export type RuntimeOptions = {
  now?: () => number;
  profileDb?: D1Database;
  repository?: EventPrizeGameplayRepository;
  withdrawalStore?: EventPrizeWithdrawalStore;
};

export async function createEventPrizeContext(
  env: Env,
  {
    allowFrozen = false,
    now = Date.now,
    profileDb = env.PROFILE_DB,
    repository = createEventGameplayRepository(env),
    withdrawalStore: withdrawalStoreOverride,
  }: RuntimeOptions & { allowFrozen?: boolean } = {},
): Promise<EventPrizeContext> {
  const storageMode = await readEventPrizeWithdrawalStorageMode(
    env.EVENT_PRIZE_WITHDRAWALS_DB,
  );
  if (storageMode === "frozen" && !allowFrozen) {
    throw new EventPrizeWithdrawalError(
      "unavailable",
      "Prize withdrawals are temporarily unavailable.",
    );
  }
  const withdrawalStore =
    withdrawalStoreOverride ||
    createD1EventPrizeWithdrawalStore(env.EVENT_PRIZE_WITHDRAWALS_DB, { now });
  const readProfileByLoginUid = async (uid: string) => {
    const ownership = await requireProfileOwnershipSnapshot(repository, {
      loginUids: [uid],
      profileIds: [],
    });
    const profileId = getLoginProfileId(ownership, uid);
    return profileId ? { id: profileId } : null;
  };
  const resolveCanonicalProfilePath = async (profileId: string) => {
    try {
      return await resolveProfileMergeTargetPath({
        profileId,
        readMergeTarget: async (candidateProfileId: string) => {
          const target = await readCanonicalMergeTarget(
            profileDb,
            candidateProfileId,
          );
          return target ? { targetProfileId: target.targetProfileId } : null;
        },
      });
    } catch {
      throw profileOwnershipUnavailable();
    }
  };
  return {
    withdrawals: withdrawalStore,
    readProfileEventPrizeAssignment: (profileId, eventId, signal) =>
      repository.readProfileEventPrizeAssignment(profileId, eventId, signal),
    now,
    readWithdrawal: withdrawalStore.get,
    readProfileByLoginUid,
    readProfileOwnershipSnapshot: repository.readProfileOwnershipSnapshot,
    async removeMatchingProfileEventPrizeAssignment({
      profileId,
      eventId,
      prizeId,
    }) {
      const result = await repository.transactProfileEventPrize(
        profileId,
        eventId,
        (currentAssignment) =>
          isMatchingProfileEventPrizeAssignment(
            currentAssignment,
            eventId,
            prizeId,
          )
            ? { value: null }
            : { value: currentAssignment ?? null },
      );
      return result.committed && result.value === null;
    },
    async resolveWithdrawalProfileId(profileId) {
      const ownership = await requireProfileOwnershipSnapshot(repository, {
        loginUids: [],
        profileIds: [profileId],
      });
      return getCanonicalProfileId(ownership, profileId) || "";
    },
    resolveCanonicalProfilePath,
  };
}
