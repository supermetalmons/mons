const mons = require("mons-rust");

const LEGACY_DEFAULT_GAME_VARIANT = "Classic";

function getAllGameVariantNames() {
  const variants = Object.keys(mons.GameVariant).filter((key) => {
    if (/^\d+$/.test(key)) {
      return false;
    }
    return typeof mons.GameVariant[key] === "number";
  });
  return variants.length > 0 ? variants : [LEGACY_DEFAULT_GAME_VARIANT];
}

function normalizeStoredGameVariant(value) {
  if (typeof value !== "string") {
    return LEGACY_DEFAULT_GAME_VARIANT;
  }
  const normalized = value.trim();
  return getAllGameVariantNames().includes(normalized)
    ? normalized
    : LEGACY_DEFAULT_GAME_VARIANT;
}

function getStoredGameVariantForPersistence(value) {
  if (typeof value !== "string") {
    return LEGACY_DEFAULT_GAME_VARIANT;
  }
  const normalized = value.trim();
  return normalized !== "" ? normalized : LEGACY_DEFAULT_GAME_VARIANT;
}

function buildGameSeedForStoredVariant(value) {
  const gameVariant = normalizeStoredGameVariant(value);
  const game = mons.MonsGameModel.new(mons.GameVariant[gameVariant]);
  return {
    gameVariant,
    fen: game.fen(),
  };
}

function buildRandomGameSeed(random = Math.random) {
  const variants = getAllGameVariantNames();
  const variantIndex =
    variants.length <= 1 ? 0 : Math.floor(random() * variants.length);
  return buildGameSeedForStoredVariant(
    variants[variantIndex] || LEGACY_DEFAULT_GAME_VARIANT,
  );
}

module.exports = {
  LEGACY_DEFAULT_GAME_VARIANT,
  getAllGameVariantNames,
  getStoredGameVariantForPersistence,
  normalizeStoredGameVariant,
  buildGameSeedForStoredVariant,
  buildRandomGameSeed,
};
