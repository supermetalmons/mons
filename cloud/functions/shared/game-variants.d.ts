export type StoredGameVariant<
  TGameVariantEnum extends object = Record<string, number>,
> = Extract<
  {
    [TKey in keyof TGameVariantEnum]: TGameVariantEnum[TKey] extends number
      ? TKey
      : never;
  }[keyof TGameVariantEnum],
  string
>;

export type GameSeed<TGameVariant extends string = string> = {
  gameVariant: TGameVariant;
  fen: string;
};

export interface GameModelWithFen {
  fen(): string;
}

export const legacyDefaultGameVariant: "Classic";

export type GameVariantHelpers<
  TGameVariant extends string = string,
  TGameModel extends GameModelWithFen = GameModelWithFen,
> = {
  legacyDefaultGameVariant: TGameVariant;
  getAllGameVariantNames(): TGameVariant[];
  normalizeStoredGameVariant(value: unknown): TGameVariant;
  getStoredGameVariantForPersistence(value: unknown): string;
  createGameModelForStoredVariant(value: unknown): TGameModel;
  buildGameSeedForStoredVariant(value: unknown): GameSeed<TGameVariant>;
  buildRandomGameSeed(random?: () => number): GameSeed<TGameVariant>;
  buildDeterministicGameSeed(seedValue: string): GameSeed<TGameVariant>;
};

export function createGameVariantHelpers<
  TGameVariantEnum extends { Classic: number },
  TGameModel extends GameModelWithFen,
>(monsRules: {
  GameVariant: TGameVariantEnum;
  MonsGameModel: {
    new: (
      variant: Extract<TGameVariantEnum[keyof TGameVariantEnum], number>,
    ) => TGameModel;
  };
}): GameVariantHelpers<StoredGameVariant<TGameVariantEnum>, TGameModel>;
