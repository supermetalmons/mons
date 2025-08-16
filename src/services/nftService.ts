import { connection } from "../connection/connection";
import { storage } from "../utils/storage";

const USE_STUB_RESPONSE = false; // TODO: dev tmp

const inFlightRequests: Map<string, Promise<any>> = new Map();
const responseCache: Map<string, any> = new Map();

function buildKey(sol: string, eth: string): string {
  const safeSol = sol || "";
  const safeEth = eth || "";
  return `${safeSol}|${safeEth}`;
}

function generateStubResponse() {
  const validReactionIds = [9, 17, 20, 26, 30, 31, 40, 50, 54, 61, 63, 74, 101, 109, 132, 146, 148, 163, 168, 173, 180, 189, 209, 210, 217, 224, 225, 228, 232, 236, 243, 245, 246, 250, 256, 257, 258, 267, 271, 281, 283, 289, 302, 303, 313, 316, 318, 325, 328, 338, 347, 356, 374, 382, 389, 393, 396, 401, 403, 405, 407, 429, 430, 444, 465, 466];
  const validAvatarIds = Array.from({ length: 467 }, (_, i) => i);
  const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
  const shuffled = (arr: number[]) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  };

  const reactionCount = randomInt(1, Math.min(50, validReactionIds.length));
  const selectedReactionIds = shuffled(validReactionIds).slice(0, reactionCount);
  const swagpack_reactions = selectedReactionIds.map((id) => ({ id, count: randomInt(1, 10) }));

  const usedIds = new Set(selectedReactionIds);
  const maxExtraAvatars = 50 - swagpack_reactions.length;
  const extraAvatarCount = maxExtraAvatars > 0 ? randomInt(0, maxExtraAvatars) : 0;
  const availableAvatarOnlyIds = shuffled(validAvatarIds.filter((id) => !usedIds.has(id))).slice(0, extraAvatarCount);
  const swagpack_avatars = [...swagpack_reactions.map((x) => ({ id: x.id, count: x.count })), ...availableAvatarOnlyIds.map((id) => ({ id, count: randomInt(1, 10) }))];

  return { ok: true, swagpack_avatars, swagpack_reactions };
}

export async function fetchNftsByAddresses(sol: string, eth: string): Promise<any> {
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
  const request = connection
    .getNfts(sol, eth)
    .then((data) => {
      responseCache.set(key, data);
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
