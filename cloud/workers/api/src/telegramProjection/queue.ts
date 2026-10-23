import { ackQueueMessage, retryQueueMessage } from "../queueMessage.ts";
import { parseTelegramProjectionTask } from "../telegramProjectionTasks.ts";
import { readTelegramStorageMode } from "../telegramD1.ts";
import { projectionRetryDelaySeconds } from "./policy.ts";
import type { ProjectionDependencies } from "./types.ts";
import {
  createTelegramProjectionBatchDependencies,
  createTelegramProjectionTaskRunner,
} from "./taskRunner.ts";

export async function handleTelegramProjectionMessage(
  message: Message<unknown>,
  env: Env,
  dependencies: ProjectionDependencies = {},
): Promise<void> {
  const logger = dependencies.logger || console;
  const now = dependencies.now || Date.now;
  const task = parseTelegramProjectionTask(message.body);
  if (!task) {
    ackQueueMessage(message, {
      entry: { event: "telegram_projection_queue_invalid_message" },
      level: "error",
      logger,
    });
    return;
  }
  const runTask = createTelegramProjectionTaskRunner(env, dependencies, now);
  try {
    const storageMode = await (
      dependencies.readStorageMode || readTelegramStorageMode
    )(env.TELEGRAM_DB);
    if (storageMode === "frozen") {
      retryQueueMessage(message, 60, {
        entry: { event: "telegram_projection_queue_frozen" },
        level: "info",
        logger,
      });
      return;
    }
    const status = await runTask(task);
    ackQueueMessage(message, {
      entry: {
        event: "telegram_projection_queue_processed",
        kind: task.kind,
        status,
      },
      level: "info",
      logger,
    });
  } catch (error) {
    retryQueueMessage(message, projectionRetryDelaySeconds(message.attempts), {
      entry: {
        event: "telegram_projection_queue_failed",
        kind: task.kind,
        code: error instanceof Error ? error.message : "unknown",
      },
      level: "error",
      logger,
    });
  }
}

export async function handleTelegramProjectionQueue(
  batch: MessageBatch<unknown>,
  env: Env,
): Promise<void> {
  const dependencies = createTelegramProjectionBatchDependencies(env);
  for (const message of batch.messages) {
    await handleTelegramProjectionMessage(message, env, dependencies);
  }
}
