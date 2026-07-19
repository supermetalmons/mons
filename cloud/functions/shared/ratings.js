const RATING_VOLATILITY = 0.06;

const GLICKO_SETTINGS = Object.freeze({
  tau: 0.75,
  rating: 1500,
  rd: 100,
  vol: RATING_VOLATILITY,
});

const getRatingDeviation = (gamesCount) => Math.max(60, 350 - gamesCount);

const createRatingUpdater =
  (Glicko2) =>
  (winRating, winPlayerGamesCount, lossRating, lossPlayerGamesCount) => {
    const ranking = new Glicko2({ ...GLICKO_SETTINGS });
    const winner = ranking.makePlayer(
      winRating,
      getRatingDeviation(winPlayerGamesCount),
      RATING_VOLATILITY,
    );
    const loser = ranking.makePlayer(
      lossRating,
      getRatingDeviation(lossPlayerGamesCount),
      RATING_VOLATILITY,
    );
    const matches = [[winner, loser, 1]];
    ranking.updateRatings(matches);

    const newWinRating = Math.round(winner.getRating());
    const newLossRating = Math.round(loser.getRating());

    return [newWinRating, newLossRating];
  };

module.exports = {
  GLICKO_SETTINGS,
  RATING_VOLATILITY,
  createRatingUpdater,
  getRatingDeviation,
};
