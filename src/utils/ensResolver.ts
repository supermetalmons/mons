type ENSCache = {
  [address: string]: string | null;
};

export let ensCache: ENSCache = {};
let cacheGeneration = 0;

export async function resolveENS(address: string): Promise<string | null> {
  const requestGeneration = cacheGeneration;
  if (address in ensCache) {
    return ensCache[address];
  }

  try {
    const response = await fetch(`https://api.ensideas.com/ens/resolve/${address}`);
    if (!response.ok) {
      if (requestGeneration === cacheGeneration) {
        ensCache[address] = null;
      }
      return null;
    }

    const data = await response.json();
    const name = data.name || null;
    if (requestGeneration === cacheGeneration) {
      ensCache[address] = name;
    }
    return name;
  } catch (error) {
    console.error("Failed to resolve ENS:", error);
    if (requestGeneration === cacheGeneration) {
      ensCache[address] = null;
    }
    return null;
  }
}

export function resetEnsCache() {
  cacheGeneration += 1;
  ensCache = {};
}
