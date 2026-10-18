import type {
  GameplayRepository,
  WagerWriteRepository,
} from "../src/gameplayRepository.ts";
import type { WagerFrozenStore } from "../src/wagerFrozenStore.ts";
import type { ensureWagerAgreementLineageReady } from "../src/wagerAgreementLineage.ts";
import type {
  classifyWagerSettlementRetry,
  resolveWagerOutcome,
  resumeWagerSettlement,
} from "../src/wagerOutcome.ts";
import type {
  acceptWagerProposal,
  removeWagerProposal,
  resolveWagerParticipantProfiles,
  resolveWagerParticipantUids,
  sendWagerProposal,
} from "../src/wagerProposal.ts";
import type {
  consumeWagerReservationOperation,
  readFrozenOperationForUid,
  recoverUnreferencedWagerReservation,
  releaseUnreferencedWagerReservation,
  reserveAcceptedMaterialsOnce,
  reserveFrozenMaterialsOnce,
  updateFrozenMaterialsOnce,
} from "../src/wagerReservationOperations.ts";
import type { WagerReservationRuntime } from "../src/wagerReservationRuntime.ts";

type Assert<Value extends true> = Value;
type AssertFalse<Value extends false> = Value;
type Assignable<Source, Target> = [Source] extends [Target] ? true : false;

type AdmittedRepository = Parameters<
  Parameters<WagerReservationRuntime["run"]>[1]
>[0];

type MutationRepositories = {
  send: Parameters<typeof sendWagerProposal>[2];
  accept: Parameters<typeof acceptWagerProposal>[2];
  remove: Parameters<typeof removeWagerProposal>[3];
  outcome: Parameters<typeof resolveWagerOutcome>[2];
  resume: Parameters<typeof resumeWagerSettlement>[1];
  lineage: Parameters<typeof ensureWagerAgreementLineageReady>[0];
  consume: Parameters<typeof consumeWagerReservationOperation>[0];
  recover: Parameters<typeof recoverUnreferencedWagerReservation>[0];
  release: Parameters<typeof releaseUnreferencedWagerReservation>[0];
  reserve: Parameters<typeof reserveFrozenMaterialsOnce>[0];
  acceptReservation: Parameters<typeof reserveAcceptedMaterialsOnce>[0];
  updateFrozen: Parameters<typeof updateFrozenMaterialsOnce>[0];
};

type AcceptsMutations<Repository> = {
  [Operation in keyof MutationRepositories]: Assignable<
    Repository,
    MutationRepositories[Operation]
  >;
}[keyof MutationRepositories];

type FrozenReader = { wagerFrozen: Pick<WagerFrozenStore, "read"> };

export type WagerCapabilityAssertions = [
  Assert<
    Assignable<
      Extract<keyof GameplayRepository, "wagerWriter" | "wagerFrozen">,
      never
    >
  >,
  AssertFalse<Assignable<GameplayRepository, WagerWriteRepository>>,
  AssertFalse<AcceptsMutations<GameplayRepository>>,
  AssertFalse<AcceptsMutations<FrozenReader>>,
  Assert<Assignable<AdmittedRepository, WagerWriteRepository>>,
  Assert<AcceptsMutations<AdmittedRepository>>,
  Assert<
    Assignable<
      Pick<WagerWriteRepository, "wagerFrozen">,
      Parameters<typeof consumeWagerReservationOperation>[0]
    >
  >,
  Assert<
    Assignable<
      Pick<WagerWriteRepository, "wagers" | "wagerFrozen" | "wagerWriter">,
      Parameters<typeof ensureWagerAgreementLineageReady>[0]
    >
  >,
  Assert<
    Assignable<
      Pick<GameplayRepository, "wagers">,
      Parameters<typeof classifyWagerSettlementRetry>[1]
    >
  >,
  Assert<
    Assignable<FrozenReader, Parameters<typeof readFrozenOperationForUid>[0]>
  >,
  Assert<
    Assignable<
      Pick<
        GameplayRepository,
        "readInviteMetadata" | "readProfileOwnershipSnapshot"
      >,
      Parameters<typeof resolveWagerParticipantUids>[2]
    >
  >,
  Assert<
    Assignable<
      Pick<GameplayRepository, "readProfileOwnershipSnapshot">,
      Parameters<typeof resolveWagerParticipantProfiles>[1]
    >
  >,
];
