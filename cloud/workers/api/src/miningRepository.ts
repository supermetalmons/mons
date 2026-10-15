import {
  MATERIAL_KEYS,
  normalizeMiningSnapshot,
  type MiningSnapshot,
} from "@mons/shared/mining";
import { CanonicalProfileConflict } from "./profileCanonicalD1.ts";
import {
  commitCanonicalProfileUpdate,
  materializeCanonicalProfileUpdate,
  readCanonicalProfileMutationByLogin,
} from "./profileMutationD1.ts";

export type MiningProfile = {
  readonly mining: MiningSnapshot;
  readonly profileId: string;
  commitMining: (mining: MiningSnapshot) => Promise<"conflict" | "updated">;
};

export type MiningRepository = {
  getOwnedProfileSnapshot: (loginUid: string) => Promise<MiningProfile | null>;
};

type MiningRepositoryDependencies = {
  d1?: D1Database;
  now?: () => number;
};

export function createMiningRepository(
  env: Env,
  { d1 = env.PROFILE_DB, now = Date.now }: MiningRepositoryDependencies = {},
): MiningRepository {
  return {
    async getOwnedProfileSnapshot(loginUid) {
      const snapshot = await readCanonicalProfileMutationByLogin(d1, loginUid);
      if (!snapshot) return null;
      const { owner, profile } = snapshot;
      return {
        profileId: profile.profileId,
        mining: normalizeMiningSnapshot(profile.profile.mining),
        async commitMining(mining) {
          const value = materializeCanonicalProfileUpdate(
            profile,
            { ...profile.profile, mining },
            now(),
            {
              sortUpdates: Object.fromEntries(
                MATERIAL_KEYS.map((key) => [key, mining.materials[key]]),
              ),
            },
          );
          try {
            await commitCanonicalProfileUpdate(d1, profile, value, { owner });
            return "updated";
          } catch (error) {
            if (error instanceof CanonicalProfileConflict) return "conflict";
            throw error;
          }
        },
      };
    },
  };
}
