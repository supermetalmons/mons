// Generated from src/telegram/deliveryRecovery.ts. Run npm run generate:runtime.
import type { TelegramDeliveryControl } from "./deliveryControl.js";
import { type ProofInput, type RawRecord } from "./deliveryState.js";
import type { TelegramRepository } from "./deliveryTypes.js";
type RateLimitProofRecoveryInput = {
  messageKey: string;
  proof: RawRecord;
  requestedRevision: string;
  nowMs: number;
  target:
    | {
        kind: "desired";
      }
    | {
        kind: "pending-delete";
        requestedPendingDeleteId?: string;
      };
};
export declare function createTelegramDeliveryRecovery({
  repository,
  now,
  control,
}: {
  repository: TelegramRepository;
  now: () => number;
  control: Pick<
    TelegramDeliveryControl,
    | "transact"
    | "scheduleExactRetry"
    | "applyRateLimitBarrierProof"
    | "clearAppliedRateLimitProofMarker"
  >;
}): {
  applySafeRetryProof: (
    messageKey: string,
    {
      requestedRevision,
      safeRejectedAttemptId,
      retryStartedAtMs,
      retryDeadlineAtMs,
      retryAtMs,
      retrySequence,
    }: ProofInput,
  ) => Promise<{
    applied: boolean;
  }>;
  applyDesiredRetryWindowProof: (
    messageKey: string,
    {
      requestedRevision,
      safeRejectedAttemptId,
      retryStartedAtMs,
      retryDeadlineAtMs,
      retryAtMs,
      retrySequence,
      retryProofLeaseOwner,
      apiGateReclaimOwner,
    }: ProofInput,
  ) => Promise<{
    applied: boolean;
  }>;
  applyManualRecovery: (messageKey: string) => Promise<{
    processed: boolean;
    action: string;
    apiGateReleaseOwner: string;
    shouldContinue: boolean;
  }>;
  settleManualApiGateRelease: (
    messageKey: string,
    ownerInput: unknown,
  ) => Promise<void>;
  applyPendingDeleteRetryWindowProof: (
    messageKey: string,
    {
      pendingDeleteId,
      retryStartedAtMs,
      retryDeadlineAtMs,
      retryAtMs,
      retrySequence,
      retryProofLeaseOwner,
      apiGateReclaimOwner,
    }: ProofInput,
  ) => Promise<{
    applied: boolean;
  }>;
  resumeRateLimitProof: ({
    messageKey,
    proof,
    requestedRevision,
    nowMs,
    target,
  }: RateLimitProofRecoveryInput) => Promise<void>;
};
export type TelegramDeliveryRecovery = ReturnType<
  typeof createTelegramDeliveryRecovery
>;
export {};
