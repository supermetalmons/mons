import type { AssetsSet } from "../content/boardStyles";

type GameAssetsModule = {
  gameAssets: typeof import("./gameAssetsPixel").gameAssets;
};

type GameAssetsLoader = () => Promise<GameAssetsModule>;

const gameAssetsLoaders: Record<AssetsSet, GameAssetsLoader> = {
  Pixel: () => import("./gameAssetsPixel"),
  Original: () => import("./gameAssetsOriginal"),
  Pangchiu: () => import("./gameAssetsPangchiu"),
};

export function loadGameAssets(set: AssetsSet): Promise<GameAssetsModule> {
  const loader = gameAssetsLoaders[set];
  if (!loader) {
    return Promise.reject(new Error(`Unsupported game assets set: ${set}`));
  }
  return loader();
}
