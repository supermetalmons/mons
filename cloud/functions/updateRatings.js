const { onCall, HttpsError } = require("firebase-functions/v2/https");
const glicko2 = require("glicko2");
const admin = require("firebase-admin");
const { batchReadWithRetry, getProfileByLoginId, updateUserRatingAndNonce, sendBotMessage, getDisplayNameFromAddress } = require("./utils");

exports.updateRatings = onCall(async (request) => {
  const uid = request.auth.uid;
  const playerId = request.data.playerId;
  const inviteId = request.data.inviteId;
  const matchId = request.data.matchId;
  const opponentId = request.data.opponentId;

  if (!inviteId.startsWith("auto_")) {
    return { ok: false };
  }

  const matchRef = admin.database().ref(`players/${playerId}/matches/${matchId}`);
  const inviteRef = admin.database().ref(`invites/${inviteId}`);
  const opponentMatchRef = admin.database().ref(`players/${opponentId}/matches/${matchId}`);

  const [matchSnapshot, inviteSnapshot, opponentMatchSnapshot] = await batchReadWithRetry([matchRef, inviteRef, opponentMatchRef]);

  const matchData = matchSnapshot.val();
  const inviteData = inviteSnapshot.val();
  const opponentMatchData = opponentMatchSnapshot.val();

  const playerProfile = await getProfileByLoginId(playerId);
  const opponentProfile = await getProfileByLoginId(opponentId);

  if (!((inviteData.hostId === playerId && inviteData.guestId === opponentId) || (inviteData.hostId === opponentId && inviteData.guestId === playerId))) {
    throw new HttpsError("permission-denied", "Players don't match invite data");
  }

  if (playerProfile.profileId === "") {
    throw new HttpsError("failed-precondition", "Player's profile id not found.");
  }

  if (uid !== playerId) {
    const customClaims = request.auth.token || {};
    if (!customClaims.profileId || customClaims.profileId !== playerProfile.profileId) {
      throw new HttpsError("permission-denied", "You don't have permission to perform this action for this player.");
    }
  }

  if (opponentProfile.profileId === "") {
    throw new HttpsError("failed-precondition", "Opponent's profile id not found.");
  }

  var result = "none";
  if (matchData.status === "surrendered" || opponentMatchData.timer === "gg") {
    result = "gg";
  } else if (opponentMatchData.status === "surrendered" || matchData.timer === "gg") {
    result = "win";
  } else {
    const color = matchData.color;
    const opponentColor = opponentMatchData.color;
    const mons = await import("mons-rust");
    var winnerColorFen = "";
    if (color === "white") {
      winnerColorFen = mons.winner(matchData.fen, opponentMatchData.fen, matchData.flatMovesString, opponentMatchData.flatMovesString);
    } else {
      winnerColorFen = mons.winner(opponentMatchData.fen, matchData.fen, opponentMatchData.flatMovesString, matchData.flatMovesString);
    }
    if (winnerColorFen !== "") {
      if (winnerColorFen === "x") {
        // TODO: explore corrupted game data to see if there was cheating
      }

      var winnerColor = "none";
      if (winnerColorFen === "w") {
        winnerColor = "white";
      } else if (winnerColorFen === "b") {
        winnerColor = "black";
      }

      if (winnerColor === color) {
        result = "win";
      } else if (winnerColor === opponentColor) {
        result = "gg";
      }
    }
  }

  if (result !== "win" && result !== "gg") {
    throw new HttpsError("internal", "Could not confirm victory.");
  }

  const ratingUpdateFlagRef = admin.database().ref(`invites/${inviteId}/matchesRatingUpdates/${matchId}`);
  const txnResult = await ratingUpdateFlagRef.transaction((current) => {
    if (current === true) {
      return;
    }
    return true;
  });
  if (!txnResult.committed) {
    return {
      ok: true,
    };
  }

  const newNonce1 = playerProfile.nonce + 1;
  const newNonce2 = opponentProfile.nonce + 1;

  let newRatingPlayer = 0;
  let newRatingOpponent = 0;
  let winnerDisplayName = "";
  let winnerNewRating = 0;
  let loserDisplayName = "";
  let loserNewRating = 0;

  const playerProfileDisplayName = getDisplayNameFromAddress(playerProfile.username, playerProfile.eth, playerProfile.sol, 0);
  const opponentProfileDisplayName = getDisplayNameFromAddress(opponentProfile.username, opponentProfile.eth, opponentProfile.sol, 0);

  if (result === "win") {
    const [newWinnerRating, newLoserRating] = updateRating(playerProfile.rating, newNonce1, opponentProfile.rating, newNonce2);
    newRatingPlayer = newWinnerRating;
    newRatingOpponent = newLoserRating;
    winnerDisplayName = playerProfileDisplayName;
    winnerNewRating = newWinnerRating;
    loserDisplayName = opponentProfileDisplayName;
    loserNewRating = newLoserRating;
    updateUserRatingAndNonce(playerProfile.profileId, newRatingPlayer, newNonce1, true);
    updateUserRatingAndNonce(opponentProfile.profileId, newRatingOpponent, newNonce2, false);
  } else {
    const [newWinnerRating, newLoserRating] = updateRating(opponentProfile.rating, newNonce2, playerProfile.rating, newNonce1);
    newRatingPlayer = newLoserRating;
    newRatingOpponent = newWinnerRating;
    winnerDisplayName = opponentProfileDisplayName;
    winnerNewRating = newWinnerRating;
    loserDisplayName = playerProfileDisplayName;
    loserNewRating = newLoserRating;
    updateUserRatingAndNonce(playerProfile.profileId, newRatingPlayer, newNonce1, false);
    updateUserRatingAndNonce(opponentProfile.profileId, newRatingOpponent, newNonce2, true);
  }

  const updateRatingMessage = `${winnerDisplayName} ${winnerNewRating}↑ ${loserDisplayName} ${loserNewRating}↓`;
  sendBotMessage(updateRatingMessage, true);

  return {
    ok: true,
  };
});

const updateRating = (winRating, winPlayerGamesCount, lossRating, lossPlayerGamesCount) => {
  const settings = {
    tau: 0.75,
    rating: 1500,
    rd: 100,
    vol: 0.06,
  };

  const ranking = new glicko2.Glicko2(settings);
  const adjustRd = (gamesCount) => Math.max(60, 350 - gamesCount);
  const winner = ranking.makePlayer(winRating, adjustRd(winPlayerGamesCount), 0.06);
  const loser = ranking.makePlayer(lossRating, adjustRd(lossPlayerGamesCount), 0.06);
  const matches = [[winner, loser, 1]];
  ranking.updateRatings(matches);

  const newWinRating = Math.round(winner.getRating());
  const newLossRating = Math.round(loser.getRating());

  return [newWinRating, newLossRating];
};
