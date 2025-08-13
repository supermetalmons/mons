import { connection } from "../connection/connection";
import { storage } from "../utils/storage";

const inFlightRequests: Map<string, Promise<any>> = new Map();
const responseCache: Map<string, any> = new Map();

function buildKey(sol: string, eth: string): string {
  const safeSol = sol || "";
  const safeEth = eth || "";
  return `${safeSol}|${safeEth}`;
}

export async function fetchNftsByAddresses(sol: string, eth: string): Promise<any> {
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