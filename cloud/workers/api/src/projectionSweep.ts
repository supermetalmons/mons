import { collectRecoveryItems } from "./recoveryRunner.ts";
import type { RecoveryFailureReporter } from "./recoveryReporting.ts";

export async function sendQueueTasks<T>(
  queue: Pick<Queue<T>, "sendBatch">,
  tasks: readonly T[],
): Promise<void> {
  for (let index = 0; index < tasks.length; index += 100) {
    await queue.sendBatch(
      tasks.slice(index, index + 100).map((task) => ({ body: task })),
    );
  }
}

type ProjectionRepairResult<Task> =
  { kind: "changed" } | { kind: "removed" } | { kind: "repaired"; task: Task };

export async function collectProjectionRepairs<Entry, Task = never>(
  entries: readonly Entry[],
  repair: (entry: Entry) => Promise<ProjectionRepairResult<Task> | void>,
  fallbackErrorMessage: string,
  onFailure?: RecoveryFailureReporter<Entry>,
): Promise<{
  repairedTasks: Task[];
  removedCount: number;
  failures: Error[];
}> {
  const { successes, failures } = await collectRecoveryItems(entries, repair, {
    onFailure,
  });
  return {
    repairedTasks: successes.flatMap(({ value }) =>
      value?.kind === "repaired" ? [value.task] : [],
    ),
    removedCount: successes.filter(({ value }) => value?.kind === "removed")
      .length,
    failures: failures.map(({ error }) =>
      error instanceof Error ? error : new Error(fallbackErrorMessage),
    ),
  };
}

export async function collectSuccessfulClaims<T>(
  items: readonly T[],
  claim: (item: T) => Promise<boolean>,
  fallbackErrorMessage: string,
  onFailure?: RecoveryFailureReporter<T>,
): Promise<{ claimed: T[]; failure: Error | null; failures: Error[] }> {
  const { successes, failures: itemFailures } = await collectRecoveryItems(
    items,
    claim,
    { onFailure },
  );
  const failures = itemFailures.map(({ error }) =>
    error instanceof Error ? error : new Error(fallbackErrorMessage),
  );
  return {
    claimed: successes.flatMap(({ item, value }) => (value ? [item] : [])),
    failure: failures[0] ?? null,
    failures,
  };
}

export async function claimAndEnqueueProjectionTasks<Candidate, Task>({
  candidates,
  claim,
  toTask,
  queue,
  initialTasks = [],
  fallbackErrorMessage,
  onClaimFailure,
}: {
  candidates: readonly Candidate[];
  claim: (candidate: Candidate) => Promise<boolean>;
  toTask: (candidate: Candidate) => Task;
  queue: Pick<Queue<Task>, "sendBatch">;
  initialTasks?: readonly Task[];
  fallbackErrorMessage: string;
  onClaimFailure?: RecoveryFailureReporter<Candidate>;
}): Promise<{
  sentCount: number;
  claimFailure: Error | null;
  claimFailures: Error[];
}> {
  const claims = await collectSuccessfulClaims(
    candidates,
    claim,
    fallbackErrorMessage,
    onClaimFailure,
  );
  const tasks = [...initialTasks, ...claims.claimed.map(toTask)];
  await sendQueueTasks(queue, tasks);
  return {
    sentCount: tasks.length,
    claimFailure: claims.failure,
    claimFailures: claims.failures,
  };
}
