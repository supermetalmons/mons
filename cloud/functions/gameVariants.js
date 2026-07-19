const monsRules = require("mons-rules");
const { createGameVariantHelpers } = require("@mons/shared/game-variants");

const { buildGameSeedForStoredVariant, buildRandomGameSeed } =
  createGameVariantHelpers(monsRules);

module.exports = {
  buildGameSeedForStoredVariant,
  buildRandomGameSeed,
};
