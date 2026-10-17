export type InviteRole = "host" | "guest" | "watch";

export type MatchRuntimeContext = Readonly<{
  contextId: number;
  sessionEpoch: number;
  inviteId: string;
  matchId: string;
  loginUid: string;
  actorUid: string | null;
  role: InviteRole;
  canWrite: boolean;
  createdAtMs: number;
}>;

export type WritableMatchRuntimeContext = MatchRuntimeContext & {
  actorUid: string;
  canWrite: true;
};
