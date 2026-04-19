import * as MonsWeb from "mons-web";

export type StoredGameVariant = keyof typeof MonsWeb.GameVariant;

export type GameSeed = {
  gameVariant: StoredGameVariant;
  fen: string;
};

export const legacyDefaultGameVariant: StoredGameVariant = "Classic";

export function getAllGameVariantNames(): StoredGameVariant[] {
  const variants = Object.keys(MonsWeb.GameVariant).filter((key) => {
    if (/^\d+$/.test(key)) {
      return false;
    }
    return typeof MonsWeb.GameVariant[key as StoredGameVariant] === "number";
  }) as StoredGameVariant[];
  return variants.length > 0 ? variants : [legacyDefaultGameVariant];
}

export function normalizeStoredGameVariant(value: unknown): StoredGameVariant {
  if (typeof value !== "string") {
    return legacyDefaultGameVariant;
  }
  const normalized = value.trim();
  return getAllGameVariantNames().includes(normalized as StoredGameVariant)
    ? (normalized as StoredGameVariant)
    : legacyDefaultGameVariant;
}

export function getStoredGameVariantForPersistence(value: unknown): string {
  if (typeof value !== "string") {
    return legacyDefaultGameVariant;
  }
  const normalized = value.trim();
  return normalized !== "" ? normalized : legacyDefaultGameVariant;
}

const computeHash32 = (value: string): number => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
};

const createSeededRandom = (seedValue: string): (() => number) => {
  let state = computeHash32(seedValue) || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export function runtimeGameVariantFromStoredValue(
  value: unknown,
): MonsWeb.GameVariant {
  return MonsWeb.GameVariant[normalizeStoredGameVariant(value)];
}

export function createGameModelForStoredVariant(
  value: unknown,
): MonsWeb.MonsGameModel {
  return MonsWeb.MonsGameModel.new(runtimeGameVariantFromStoredValue(value));
}

export function buildGameSeedForStoredVariant(value: unknown): GameSeed {
  const gameVariant = normalizeStoredGameVariant(value);
  return {
    gameVariant,
    fen: createGameModelForStoredVariant(gameVariant).fen(),
  };
}

export function buildRandomGameSeed(
  random: () => number = Math.random,
): GameSeed {
  const variants = getAllGameVariantNames();
  const variantIndex =
    variants.length <= 1 ? 0 : Math.floor(random() * variants.length);
  return buildGameSeedForStoredVariant(
    variants[variantIndex] ?? legacyDefaultGameVariant,
  );
}

export function buildDeterministicGameSeed(seedValue: string): GameSeed {
  return buildRandomGameSeed(createSeededRandom(seedValue));
}
