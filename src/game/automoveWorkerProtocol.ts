export type WorkerAutomovePreference = "fast" | "normal" | "pro";

export type WorkerAutomoveResult =
  | {
      kind: "events";
      inputFen: string;
    }
  | {
      kind: "other";
    };

export type WorkerAutomoveRequest = {
  id: number;
  fen: string;
  preference: WorkerAutomovePreference;
};

export type WorkerAutomoveResponse =
  | {
      type: "result";
      id: number;
      result: WorkerAutomoveResult;
    }
  | {
      type: "error";
      id: number;
      message: string;
    };
