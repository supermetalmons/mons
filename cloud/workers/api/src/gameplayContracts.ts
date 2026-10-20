import type { AutomatchPersistence } from "./automatchPersistence.ts";
import type { GameSessionPort } from "./gameSessionContracts.ts";
import type { ProfileOwnershipReader } from "./profileOwnership.ts";
import type { MatchStatePort } from "./repositoryContracts.ts";

export type InviteAccessRepository = ProfileOwnershipReader &
  Pick<GameSessionPort, "readInviteMetadata">;

export type GameSessionRepository = InviteAccessRepository &
  Pick<
    GameSessionPort,
    | "readAutomatchEntry"
    | "readGameSessionMutationReceipt"
    | "commitSessionChanges"
  > &
  Pick<MatchStatePort, "readMatchRecord" | "readMatchRecords">;

export type AutomatchRepository = ProfileOwnershipReader &
  Pick<
    GameSessionPort,
    | "readInviteMetadata"
    | "readAutomatchEntry"
    | "listAutomatchEntriesByLogin"
    | "readFirstAutomatchEntry"
    | "readAutomatchReceipt"
    | "commitSessionChanges"
    | "readAutomatchProfileOutbox"
  > & {
    automatchPersistence: Pick<
      AutomatchPersistence,
      "readQueuedByLogins" | "recoverLogins"
    >;
  };
