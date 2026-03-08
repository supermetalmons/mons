let monsPromise = null;

const loadMons = async () => {
  if (!monsPromise) {
    monsPromise = import("mons-rust");
  }
  return monsPromise;
};

const isNonEmptyString = (value) => typeof value === "string" && value !== "";
const normalizeColor = (value) => (value === "white" || value === "black" ? value : null);

async function resolveMatchWinner(matchData, opponentMatchData) {
  if (!matchData || !opponentMatchData) {
    return { winner: null, reason: "missing-match" };
  }

  if (matchData.status === "surrendered" || opponentMatchData.timer === "gg") {
    return { winner: "opponent", reason: "surrender-or-timer" };
  }

  if (opponentMatchData.status === "surrendered" || matchData.timer === "gg") {
    return { winner: "player", reason: "surrender-or-timer" };
  }

  const playerColor = normalizeColor(matchData.color);
  const opponentColor = normalizeColor(opponentMatchData.color);
  if (!playerColor || !opponentColor) {
    return { winner: null, reason: "missing-color" };
  }

  if (!isNonEmptyString(matchData.fen) || !isNonEmptyString(opponentMatchData.fen)) {
    return { winner: null, reason: "missing-fen" };
  }

  const mons = await loadMons();
  let winnerColorFen = "";

  if (playerColor === "white") {
    winnerColorFen = mons.winner(matchData.fen, opponentMatchData.fen, matchData.flatMovesString || "", opponentMatchData.flatMovesString || "");
  } else {
    winnerColorFen = mons.winner(opponentMatchData.fen, matchData.fen, opponentMatchData.flatMovesString || "", matchData.flatMovesString || "");
  }

  if (winnerColorFen === "w") {
    return {
      winner: playerColor === "white" ? "player" : opponentColor === "white" ? "opponent" : null,
      reason: "winner-color",
    };
  }

  if (winnerColorFen === "b") {
    return {
      winner: playerColor === "black" ? "player" : opponentColor === "black" ? "opponent" : null,
      reason: "winner-color",
    };
  }

  return { winner: null, reason: winnerColorFen === "x" ? "invalid-game" : "pending" };
}

module.exports = {
  resolveMatchWinner,
};
