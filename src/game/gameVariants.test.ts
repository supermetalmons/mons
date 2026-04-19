jest.mock("mons-web", () => {
  const GameVariant = Object.freeze({
    Classic: 0,
    0: "Classic",
    SwappedManaRows: 1,
    1: "SwappedManaRows",
  });
  class MonsGameModel {
    static new(variant: number) {
      return {
        fen: () => (variant === 0 ? "classic-fen" : "swapped-fen"),
      };
    }
  }

  return {
    __esModule: true,
    default: jest.fn(() => Promise.resolve(undefined)),
    GameVariant,
    MonsGameModel,
  };
});

const {
  buildDeterministicGameSeed,
  buildGameSeedForStoredVariant,
  buildRandomGameSeed,
  createGameModelForStoredVariant,
  getStoredGameVariantForPersistence,
  getAllGameVariantNames,
  legacyDefaultGameVariant,
  normalizeStoredGameVariant,
} = require("./gameVariants") as typeof import("./gameVariants");

describe("gameVariants helpers", () => {
  test("enumerates runtime variant names without reverse enum keys", () => {
    const variants = getAllGameVariantNames();

    expect(variants).toContain("Classic");
    expect(variants).toContain("SwappedManaRows");
    expect(variants.some((variant) => /^\d+$/.test(variant))).toBe(false);
  });

  test("normalizes missing and unknown stored variants to Classic", () => {
    expect(normalizeStoredGameVariant(undefined)).toBe(
      legacyDefaultGameVariant,
    );
    expect(normalizeStoredGameVariant("")).toBe(legacyDefaultGameVariant);
    expect(normalizeStoredGameVariant("NotARealVariant")).toBe(
      legacyDefaultGameVariant,
    );
  });

  test("preserves unknown stored variants when copying them back to storage", () => {
    expect(getStoredGameVariantForPersistence("FutureVariant")).toBe(
      "FutureVariant",
    );
    expect(getStoredGameVariantForPersistence("  FutureVariant  ")).toBe(
      "FutureVariant",
    );
    expect(getStoredGameVariantForPersistence(undefined)).toBe(
      legacyDefaultGameVariant,
    );
  });

  test("builds deterministic seeds from stored variants", () => {
    const classicSeed = buildGameSeedForStoredVariant("Classic");
    const swappedSeed = buildGameSeedForStoredVariant("SwappedManaRows");

    expect(classicSeed.gameVariant).toBe("Classic");
    expect(swappedSeed.gameVariant).toBe("SwappedManaRows");
    expect(classicSeed.fen).toBe("classic-fen");
    expect(swappedSeed.fen).toBe("swapped-fen");
    expect(swappedSeed.fen).not.toBe(classicSeed.fen);
  });

  test("picks random variants from the full runtime enum list", () => {
    const variants = getAllGameVariantNames();
    const firstSeed = buildRandomGameSeed(() => 0);
    const lastSeed = buildRandomGameSeed(() => 0.999999);

    expect(firstSeed.gameVariant).toBe(variants[0]);
    expect(lastSeed.gameVariant).toBe(variants[variants.length - 1]);
  });

  test("builds stable pseudo-random seeds from match ids", () => {
    const firstSeed = buildDeterministicGameSeed("invite-1");
    const repeatedSeed = buildDeterministicGameSeed("invite-1");
    const secondSeed = buildDeterministicGameSeed("invite-2");

    expect(repeatedSeed).toEqual(firstSeed);
    expect(firstSeed.gameVariant).toBe("Classic");
    expect(firstSeed.fen).toBe("classic-fen");
    expect(secondSeed.gameVariant).toBe("SwappedManaRows");
    expect(secondSeed.fen).toBe("swapped-fen");
  });

  test("creates a Classic model for legacy records without gameVariant", () => {
    const gameFromLegacyVariant = createGameModelForStoredVariant(undefined);

    expect(gameFromLegacyVariant.fen()).toBe("classic-fen");
  });
});
