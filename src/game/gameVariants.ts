import * as MonsRules from "mons-rules";
import {
  createGameVariantHelpers,
  type GameSeed as SharedGameSeed,
  type StoredGameVariant as SharedStoredGameVariant,
} from "@mons/shared/game-variants";

export type StoredGameVariant = SharedStoredGameVariant<
  typeof MonsRules.GameVariant
>;
export type GameSeed = SharedGameSeed<StoredGameVariant>;

const gameVariantHelpers = createGameVariantHelpers(MonsRules);

export const {
  buildDeterministicGameSeed,
  buildGameSeedForStoredVariant,
  buildRandomGameSeed,
  createGameModelForStoredVariant,
  getAllGameVariantNames,
  getStoredGameVariantForPersistence,
  legacyDefaultGameVariant,
  normalizeStoredGameVariant,
} = gameVariantHelpers;
