import { connection } from "../connection/connection";
import { storage } from "../utils/storage";
import { VALID_REACTION_IDS } from "@mons/shared/nfts";
import { shuffle } from "@mons/shared/ids";

const USE_STUB_RESPONSE = false;

const inFlightRequests: Map<string, Promise<any>> = new Map();
const responseCache: Map<string, any> = new Map();
let cacheGeneration = 0;

function buildKey(sol: string, eth: string): string {
  const safeSol = sol || "";
  const safeEth = eth || "";
  return `${safeSol}|${safeEth}`;
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

async function fetchNftsByAddresses(sol: string, eth: string): Promise<any> {
  if (USE_STUB_RESPONSE) {
    return generateStubResponse();
  }

  const key = buildKey(sol, eth);
  if (responseCache.has(key)) {
    return responseCache.get(key);
  }
  const existing = inFlightRequests.get(key);
  if (existing) {
    return existing;
  }
  const requestGeneration = cacheGeneration;
  const request = connection
    .getNfts(sol, eth)
    .then((data) => {
      if (requestGeneration === cacheGeneration) {
        responseCache.set(key, data);
      }
      inFlightRequests.delete(key);
      return data;
    })
    .catch((error) => {
      inFlightRequests.delete(key);
      throw error;
    });
  inFlightRequests.set(key, request);
  return request;
}

export async function fetchNftsForStoredAddresses(): Promise<any> {
  const sol = storage.getSolAddress("");
  const eth = storage.getEthAddress("");
  if (!sol && !eth) {
    return null;
  }
  return fetchNftsByAddresses(sol, eth);
}

export function resetNftCache() {
  cacheGeneration += 1;
  inFlightRequests.clear();
  responseCache.clear();
}
