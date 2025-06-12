import { useState, useEffect } from "react";

let assetsCache: any = null;
let loadingPromise: Promise<any> | null = null;

const loadGameAssets = async (): Promise<any> => {
  if (assetsCache) {
    return assetsCache;
  }

  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = (async () => {
    try {
      const gameAssets = (await import("../assets/gameAssetsPixel")).gameAssets;
      assetsCache = gameAssets;
      return gameAssets;
    } catch (error) {
      console.error("Failed to load game assets:", error);
      return null;
    } finally {
      loadingPromise = null;
    }
  })();

  return loadingPromise;
};

export const useGameAssets = () => {
  const [assets, setAssets] = useState<any>(assetsCache);
  const [isLoading, setIsLoading] = useState(!assetsCache);

  useEffect(() => {
    if (assetsCache) {
      setAssets(assetsCache);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    loadGameAssets().then((loadedAssets) => {
      setAssets(loadedAssets);
      setIsLoading(false);
    });
  }, []);

  return { assets, isLoading };
};
