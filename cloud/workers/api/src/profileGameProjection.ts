import * as queue from "./profileGameProjection/queue.ts";
import * as recovery from "./profileGameProjection/recovery.ts";
import type {
  AutomatchRecoveryDependencies,
  ProfileGameProjectionDependencies,
  ProfileGameProjectionRecoveryDependencies,
  ProfileGameProjectionSweepResult,
} from "./profileGameProjection/types.ts";

export type {
  ProfileGameProjectionDependencies,
  ProfileGameProjectionSweepResult,
} from "./profileGameProjection/types.ts";
export {
  MAX_PROFILE_GAME_PROJECTION_RETRY_DELAY_SECONDS,
  PROFILE_GAME_PROJECTION_SWEEP_CONCURRENCY,
  PROFILE_GAME_PROJECTION_RECOVERY_DELAY_MS,
  PROFILE_GAME_PROJECTION_SWEEP_LIMIT,
  profileGameProjectionRetryDelaySeconds,
} from "./profileGameProjection/policy.ts";
export {
  settleAutomatchProfileGameProjectionOutbox,
  processAutomatchProfileGameProjection,
  settleEventProfileGameProjectionOutbox,
  processEventProfileGameProjection,
  processProfileLinkProfileGameProjection,
  processRatingProfileGameProjection,
  validRatingProjectionRecord,
} from "./profileGameProjection/processing.ts";
export {
  handleProfileGameProjectionQueue,
  handleEventProfileGameProjectionQueue,
} from "./profileGameProjection/queue.ts";
export {
  automatchSweepEntries,
  claimAutomatchSweepCandidate,
  claimEventSweepCandidate,
  eventSweepEntries,
  repairInvalidEventSweepEntry,
  salvageEventCleanupOwnerProfileIds,
  repairInvalidAutomatchSweepEntry,
  sendProfileGameProjectionTasks,
  handleProfileGameProjectionSweep,
} from "./profileGameProjection/recovery.ts";

export function handleProfileGameProjectionMessage(
  message: Message<unknown>,
  env: Env,
  dependencies: ProfileGameProjectionDependencies = {},
): Promise<void> {
  return queue.handleProfileGameProjectionMessage(message, env, dependencies);
}

export function sweepRatingProfileGameProjections(
  env: Env,
  dependencies: ProfileGameProjectionDependencies = {},
): Promise<number> {
  return recovery.sweepRatingProfileGameProjections(env, dependencies);
}

export function sweepAutomatchProfileGameProjections(
  env: Env,
  dependencies: AutomatchRecoveryDependencies = {},
): Promise<number> {
  return recovery.sweepAutomatchProfileGameProjections(env, dependencies);
}

export function sweepEventProfileGameProjections(
  env: Env,
  dependencies: ProfileGameProjectionDependencies = {},
): Promise<number> {
  return recovery.sweepEventProfileGameProjections(env, dependencies);
}

export function sweepProfileLinkProfileGameProjections(
  env: Env,
  dependencies: ProfileGameProjectionDependencies = {},
): Promise<number> {
  return recovery.sweepProfileLinkProfileGameProjections(env, dependencies);
}

export function sweepProfileGameProjections(
  env: Env,
  dependencies: ProfileGameProjectionRecoveryDependencies = {},
): Promise<ProfileGameProjectionSweepResult> {
  return recovery.sweepProfileGameProjections(env, dependencies);
}
