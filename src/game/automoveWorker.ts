/// <reference lib="webworker" />

import initMonsWeb, * as MonsWeb from "mons-web";
import type {
  WorkerAutomoveRequest,
  WorkerAutomoveResponse,
  WorkerAutomoveResult,
} from "./automoveWorkerProtocol";

declare const self: DedicatedWorkerGlobalScope;

let initPromise: Promise<void> | null = null;

const ensureMonsWebInitialized = async (): Promise<void> => {
  if (!initPromise) {
    initPromise = initMonsWeb().then(() => undefined);
  }
  try {
    await initPromise;
  } catch (error) {
    initPromise = null;
    throw error;
  }
};

const resolveWorkerAutomove = async (
  fen: string,
  preference: WorkerAutomoveRequest["preference"],
): Promise<WorkerAutomoveResult> => {
  const gameFromFen = MonsWeb.MonsGameModel.from_fen(fen);
  if (!gameFromFen) {
    throw new Error("failed to deserialize automove fen in worker");
  }

  let output: MonsWeb.OutputModel | null = null;
  try {
    output = (await gameFromFen.smartAutomoveAsync(
      preference,
    )) as MonsWeb.OutputModel;
    if (output.kind === MonsWeb.OutputModelKind.Events) {
      return {
        kind: "events",
        inputFen: output.input_fen(),
      };
    }
    return { kind: "other" };
  } finally {
    output?.free();
    gameFromFen.free();
  }
};

const postResponse = (response: WorkerAutomoveResponse): void => {
  self.postMessage(response);
};

self.onmessage = (event: MessageEvent<WorkerAutomoveRequest>) => {
  const request = event.data;
  void (async () => {
    try {
      await ensureMonsWebInitialized();
      const result = await resolveWorkerAutomove(
        request.fen,
        request.preference,
      );
      postResponse({
        type: "result",
        id: request.id,
        result,
      });
    } catch (error) {
      postResponse({
        type: "error",
        id: request.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  })();
};

export {};
