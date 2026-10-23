import type { MiningMaterialName } from "@mons/shared/mining";
import {
  buildMutableProfileMutation,
  type CanonicalMutableProfileSnapshot,
} from "./profileMutableD1.ts";
import { prepareCanonicalGameplayProfileUpdate } from "./profileMutationD1.ts";

export function buildMutableGameplayProfileMutation(
  snapshot: CanonicalMutableProfileSnapshot,
  patch: Parameters<typeof prepareCanonicalGameplayProfileUpdate>[1],
  updatedAtMs: number,
  miningSortKeys?: readonly MiningMaterialName[],
) {
  const prepared = prepareCanonicalGameplayProfileUpdate(
    snapshot,
    patch,
    updatedAtMs,
    miningSortKeys,
  );
  return buildMutableProfileMutation(
    snapshot,
    prepared.profile,
    prepared.updatedAtMs,
    { sortUpdates: prepared.sortUpdates, winPresent: prepared.winPresent },
  );
}
