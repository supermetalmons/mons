import { isAutomatchQueueSelectionConflict } from "../automatchQueueD1.ts";
import type { GameSessionChange } from "../gameSessionContracts.ts";
import {
  GameSessionMutationLeaseReleaseFailure,
  withGameSessionMutationLease,
} from "../gameSessionMutationRunner.ts";
import type {
  AutomatchDependencies,
  SuccessfulStartAutomatchResponse,
} from "./types.ts";

type AutomatchCommitPlan = {
  response: SuccessfulStartAutomatchResponse;
  changes: GameSessionChange[];
};

export async function commitAutomatchWithLease(
  input: {
    inviteId: string;
    leaseOperationId: string;
    prepare: () => Promise<AutomatchCommitPlan | null>;
    commit: (changes: GameSessionChange[]) => Promise<void>;
    reconcile: (response: SuccessfulStartAutomatchResponse) => Promise<boolean>;
    selectionConflict: "rethrow" | "reconcile";
  },
  dependencies: Pick<
    AutomatchDependencies,
    "mutationLocks" | "assertMutationAllowed"
  >,
): Promise<SuccessfulStartAutomatchResponse | null> {
  const state: { plan: AutomatchCommitPlan | null; attempted: boolean } = {
    plan: null,
    attempted: false,
  };
  try {
    return await withGameSessionMutationLease(
      input.inviteId,
      input.leaseOperationId,
      dependencies.mutationLocks,
      async () => {
        const plan = await input.prepare();
        if (!plan) return null;
        state.plan = plan;
        await dependencies.assertMutationAllowed?.();
        state.attempted = true;
        await input.commit(plan.changes);
        return plan.response;
      },
    );
  } catch (error) {
    if (
      input.selectionConflict === "rethrow" &&
      isAutomatchQueueSelectionConflict(error)
    )
      throw error;
    if (!state.plan || !state.attempted) throw error;
    if (
      (error instanceof GameSessionMutationLeaseReleaseFailure &&
        error.workCompleted) ||
      (await input.reconcile(state.plan.response))
    )
      return state.plan.response;
    throw error;
  }
}
