import { createEventGameplayRepository } from "../eventRepository.ts";
import { createGameplayRepository } from "../gameplayRepository.ts";
import { createRatingRepository } from "../ratingRepository.ts";
import type { TelegramProjectionTask } from "../telegramProjectionTasks.ts";
import {
  enqueueInitialTelegramDelivery,
  type InitialTelegramDelivery,
} from "../telegramDeliveryTasks.ts";
import {
  createD1TelegramAnnouncementRepository,
  createD1TelegramRepository,
} from "../telegramD1.ts";
import { processEventProjectionTask } from "../eventTelegramProjection.ts";
import { processAutomatchTask, processRatingTask } from "./processing.ts";
import type { ProjectionDependencies } from "./types.ts";

type TelegramProjectionTaskOutcome = Awaited<
  ReturnType<
    | typeof processAutomatchTask
    | typeof processEventProjectionTask
    | typeof processRatingTask
  >
>;

export function createTelegramProjectionTaskRunner(
  env: Env,
  dependencies: ProjectionDependencies,
  now: () => number,
): (task: TelegramProjectionTask) => Promise<TelegramProjectionTaskOutcome> {
  const createStateRepository =
    dependencies.createStateRepository ||
    ((workerEnv: Env) => createEventGameplayRepository(workerEnv));
  const enqueueDelivery =
    dependencies.enqueueDelivery ||
    ((input: InitialTelegramDelivery) =>
      enqueueInitialTelegramDelivery(env, input));
  return async (task) => {
    const state = createStateRepository(env);
    const createRating =
      dependencies.createRating ||
      ((workerEnv: Env) =>
        createRatingRepository(
          workerEnv.PROFILE_DB,
          createGameplayRepository(workerEnv),
          state,
        ));
    const telegram = dependencies.createTelegram
      ? dependencies.createTelegram(env)
      : createD1TelegramRepository(env.TELEGRAM_DB, { now });
    let status: TelegramProjectionTaskOutcome;
    if (task.kind === "automatch-telegram-projection") {
      status = await processAutomatchTask(
        task,
        state,
        enqueueDelivery,
        now,
        telegram,
      );
    } else if (task.kind === "event-telegram-projection") {
      status = await processEventProjectionTask(
        task,
        state,
        createRating(env),
        enqueueDelivery,
        now,
        telegram,
        {
          repository: dependencies.createAnnouncements
            ? dependencies.createAnnouncements(env)
            : createD1TelegramAnnouncementRepository(env.TELEGRAM_DB),
          chatId: env.TELEGRAM_EXTRA_CHAT_ID.trim(),
        },
      );
    } else {
      status = await processRatingTask(
        task,
        state,
        createRating(env),
        enqueueDelivery,
        now,
        telegram,
      );
    }
    return status;
  };
}

export function createTelegramProjectionBatchDependencies(
  env: Env,
): ProjectionDependencies {
  const state = createEventGameplayRepository(env);
  const rating = createRatingRepository(env.PROFILE_DB, state, state);
  return {
    createStateRepository: () => state,
    createRating: () => rating,
  };
}
