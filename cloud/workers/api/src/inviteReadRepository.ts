import { readInviteMetadata } from "./automatchReadD1.ts";
import type { InviteAccessRepository } from "./gameplayContracts.ts";
import { createD1ProfileOwnershipReader } from "./profileOwnershipD1.ts";

export type InviteReadRepository = InviteAccessRepository;

export function createInviteReadRepository(
  env: Pick<Env, "PROFILE_DB" | "PROFILE_GAMES_DB">,
): InviteReadRepository {
  const inviteDb = env.PROFILE_GAMES_DB;
  return {
    ...createD1ProfileOwnershipReader(env.PROFILE_DB),
    readInviteMetadata: (inviteId, signal) =>
      readInviteMetadata(inviteDb, inviteId, signal),
  };
}
