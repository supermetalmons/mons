import { useState, useEffect } from "react";

let emojisCache: any = null;
let loadingPromise: Promise<any> | null = null;

const loadEmojis = async (): Promise<any> => {
  if (emojisCache) {
    return emojisCache;
  }

  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = (async () => {
    try {
      const emojis = (await import("../content/emojis")).emojis;
      emojisCache = emojis;
      return emojis;
    } catch (error) {
      console.error("Failed to load emojis:", error);
      return null;
    } finally {
      loadingPromise = null;
    }
  })();

  return loadingPromise;
};

export const getEmojis = async (): Promise<any> => {
  return loadEmojis();
};

export const getCachedEmojis = (): any => {
  return emojisCache;
};

export const useEmojis = () => {
  const [emojis, setEmojis] = useState<any>(emojisCache);
  const [isLoading, setIsLoading] = useState(!emojisCache);

  useEffect(() => {
    if (emojisCache) {
      setEmojis(emojisCache);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    loadEmojis().then((loadedEmojis) => {
      setEmojis(loadedEmojis);
      setIsLoading(false);
    });
  }, []);

  return { emojis, isLoading };
};
