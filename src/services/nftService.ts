import { connection } from "../connection/connection";
import { VALID_REACTION_IDS } from "@mons/shared/nfts";
import { shuffle } from "@mons/shared/ids";
import type { AuthState } from "../connection/authentication";
import type { AuthIdentity } from "../utils/storage";

const USE_STUB_RESPONSE = false;
export const NFT_CACHE_TTL_MS = 5 * 60 * 1000;

export type NftFetchSnapshot = {
  data: any;
  expiresAtMs: number;
};

const inFlightRequests: Map<string, Promise<NftFetchSnapshot>> = new Map();
const responseCache: Map<string, NftFetchSnapshot> = new Map();
let cacheGeneration = 0;

function getEmptyNftCollection() {
  return {
    ok: true,
    specials: [],
    swagpack_avatars: [],
    swagpack_reactions: [],
  };
}

export function getNftIdentityKey({
  profileId,
  solAddress,
  ethAddress,
}: AuthIdentity): string | null {
  if (!profileId) {
    return null;
  }
  return JSON.stringify([profileId, solAddress || "", ethAddress || ""]);
}

function isLegacyMissingAddressError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const { code, message } = error as { code?: unknown; message?: unknown };
  return (
    (code === "functions/invalid-argument" || code === "invalid-argument") &&
    message === "Some address is required."
  );
}

function generateStubResponse() {
  const validReactionIds = Array.from(VALID_REACTION_IDS);
  const validAvatarIds = Array.from({ length: 467 }, (_, i) => i);
  const randomInt = (min: number, max: number) =>
    Math.floor(Math.random() * (max - min + 1)) + min;
  const reactionCount = randomInt(1, Math.min(50, validReactionIds.length));
  const selectedReactionIds = shuffle(validReactionIds).slice(0, reactionCount);
  const swagpack_reactions = selectedReactionIds.map((id) => ({
    id,
    count: randomInt(1, 10),
  }));

  const usedIds = new Set(selectedReactionIds);
  const maxExtraAvatars = 50 - swagpack_reactions.length;
  const extraAvatarCount =
    maxExtraAvatars > 0 ? randomInt(0, maxExtraAvatars) : 0;
  const availableAvatarOnlyIds = shuffle(
    validAvatarIds.filter((id) => !usedIds.has(id)),
  ).slice(0, extraAvatarCount);
  const swagpack_avatars = [
    ...swagpack_reactions.map((x) => ({ id: x.id, count: x.count })),
    ...availableAvatarOnlyIds.map((id) => ({ id, count: randomInt(1, 10) })),
  ];
  const specials = [
    { id: 0, count: 1 },
    { id: 1, count: 2 },
    { id: 2, count: 3 },
  ];

  return { ok: true, specials, swagpack_avatars, swagpack_reactions };
}

async function fetchNftsByIdentity(
  key: string,
  sol: string,
  eth: string,
): Promise<NftFetchSnapshot> {
  if (USE_STUB_RESPONSE) {
    return {
      data: generateStubResponse(),
      expiresAtMs: Date.now() + NFT_CACHE_TTL_MS,
    };
  }

  const cachedResponse = responseCache.get(key);
  if (cachedResponse && cachedResponse.expiresAtMs > Date.now()) {
    return cachedResponse;
  }
  if (cachedResponse) {
    responseCache.delete(key);
  }
  const existing = inFlightRequests.get(key);
  if (existing) {
    return existing;
  }
  const requestGeneration = cacheGeneration;
  const request = connection
    .getNfts(sol, eth)
    .then((data) => {
      const isCurrentGeneration = requestGeneration === cacheGeneration;
      const snapshot: NftFetchSnapshot = {
        data,
        expiresAtMs:
          isCurrentGeneration && data?.ok === true
            ? Date.now() + NFT_CACHE_TTL_MS
            : 0,
      };
      if (snapshot.expiresAtMs > 0) {
        responseCache.set(key, snapshot);
      }
      return snapshot;
    })
    .catch((error) => {
      if (!sol && !eth && isLegacyMissingAddressError(error)) {
        const snapshot: NftFetchSnapshot = {
          data: getEmptyNftCollection(),
          expiresAtMs:
            requestGeneration === cacheGeneration
              ? Date.now() + NFT_CACHE_TTL_MS
              : 0,
        };
        if (snapshot.expiresAtMs > 0) {
          responseCache.set(key, snapshot);
        }
        return snapshot;
      }
      throw error;
    });
  inFlightRequests.set(key, request);
  const clearInFlightRequest = () => {
    if (inFlightRequests.get(key) === request) {
      inFlightRequests.delete(key);
    }
  };
  void request.then(clearInFlightRequest, clearInFlightRequest);
  return request;
}

export async function fetchNftsForIdentity(
  identity: AuthState,
): Promise<NftFetchSnapshot> {
  if (identity.authStatus !== "authenticated") {
    return {
      data: getEmptyNftCollection(),
      expiresAtMs: Date.now() + NFT_CACHE_TTL_MS,
    };
  }
  const key = getNftIdentityKey(identity);
  if (!key) {
    return { data: { ok: false }, expiresAtMs: 0 };
  }
  return fetchNftsByIdentity(key, identity.solAddress, identity.ethAddress);
}

export function resetNftCache() {
  cacheGeneration += 1;
  inFlightRequests.clear();
  responseCache.clear();
}
