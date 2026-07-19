export interface GlickoSettings {
  tau: number;
  rating: number;
  rd: number;
  vol: number;
}

export const GLICKO_SETTINGS: Readonly<GlickoSettings>;
export const RATING_VOLATILITY: 0.06;

export function getRatingDeviation(gamesCount: number): number;

export interface RatingPlayerLike {
  getRating(): number;
}

export interface RatingCalculatorLike<
  TPlayer extends RatingPlayerLike = RatingPlayerLike,
> {
  makePlayer(rating: number, rd: number, volatility: number): TPlayer;
  updateRatings(matches: [TPlayer, TPlayer, number][]): void;
}

export type RatingCalculatorConstructor<
  TPlayer extends RatingPlayerLike = RatingPlayerLike,
> = new (settings: GlickoSettings) => RatingCalculatorLike<TPlayer>;

export type RatingUpdater = (
  winRating: number,
  winPlayerGamesCount: number,
  lossRating: number,
  lossPlayerGamesCount: number,
) => [number, number];

export function createRatingUpdater<TPlayer extends RatingPlayerLike>(
  Glicko2: RatingCalculatorConstructor<TPlayer>,
): RatingUpdater;
