const { onCall, HttpsError } = require("firebase-functions/v2/https");
const glicko2 = require("glicko2");
const admin = require("firebase-admin");
const { batchReadWithRetry } = require("./utils");

exports.updateRatings = onCall(async (request) => {
  const uid = request.auth.uid;
  const inviteId = request.data.inviteId;
  const matchId = request.data.matchId;
  const opponentId = request.data.opponentId;

  if (!inviteId.startsWith("auto_")) {
    return { ok: false };
  }

  const matchRef = admin.database().ref(`players/${uid}/matches/${matchId}`);
  const inviteRef = admin.database().ref(`invites/${inviteId}`);
  const opponentMatchRef = admin.database().ref(`players/${opponentId}/matches/${matchId}`);
  const playerEthAddressRef = admin.database().ref(`players/${uid}/ethAddress`);
  const opponentEthAddressRef = admin.database().ref(`players/${opponentId}/ethAddress`);

  const [matchSnapshot, inviteSnapshot, opponentMatchSnapshot, playerEthAddressSnapshot, opponentEthAddressSnapshot] = await batchReadWithRetry([matchRef, inviteRef, opponentMatchRef, playerEthAddressRef, opponentEthAddressRef]);

  const matchData = matchSnapshot.val();
  const inviteData = inviteSnapshot.val();
  const opponentMatchData = opponentMatchSnapshot.val();
  const playerEthAddress = playerEthAddressSnapshot.val();
  const opponentEthAddress = opponentEthAddressSnapshot.val();

  if (!((inviteData.hostId === uid && inviteData.guestId === opponentId) || (inviteData.hostId === opponentId && inviteData.guestId === uid))) {
    throw new HttpsError("permission-denied", "Players don't match invite data");
  }

  if (!playerEthAddress) {
    throw new HttpsError("failed-precondition", "Player's Ethereum address not found.");
  }

  if (!opponentEthAddress) {
    throw new HttpsError("failed-precondition", "Opponent's Ethereum address not found.");
  }

  var result = "none";
  if (matchData.status == "surrendered" || opponentMatchData.timer == "gg") {
    result = "gg";
  } else if (opponentMatchData.status == "surrendered" || matchData.timer == "gg") {
    result = "win";
  } else {
    const color = matchData.color;
    const opponentColor = opponentMatchData.color;
    const mons = await import("mons-rust");
    var winnerColorFen = "";
    if (color == "white") {
      winnerColorFen = mons.winner(matchData.fen, opponentMatchData.fen, matchData.flatMovesString, opponentMatchData.flatMovesString);
    } else {
      winnerColorFen = mons.winner(opponentMatchData.fen, matchData.fen, opponentMatchData.flatMovesString, matchData.flatMovesString);
    }
    if (winnerColorFen != "") {
      if (winnerColorFen === "x") {
        // TODO: explore corrupted game data to see if there was cheating
      }

      var winnerColor = "none";
      if (winnerColorFen == "w") {
        winnerColor = "white";
      } else if (winnerColorFen == "b") {
        winnerColor = "black";
      }

      if (winnerColor == color) {
        result = "win";
      } else if (winnerColor == opponentColor) {
        result = "gg";
      }
    }
  }

  if (result !== "win" || result !== "gg") {
    throw new HttpsError("internal", "Cound not confirm match result.");
  }

  const recipient1 = playerEthAddress;
  const recipient2 = opponentEthAddress;

  // TODO: get nonces and current ratings

  const nonceRef = admin.database().ref(`players/${uid}/nonces/${matchId}`);
  const nonceSnapshot = await nonceRef.once("value");
  if (!nonceSnapshot.exists()) {
    await nonceRef.set(nonce1);
  } else if (nonceSnapshot.val() !== nonce1) {
    throw new HttpsError("internal", "Can not attest that game anymore");
  }

  const [newRating1, newRating2] = updateRating(targetAttestation1.rating, nonce1, targetAttestation2.rating, nonce2);

  // TODO: save updated ratings
  // TODO: make sure updated ratings are saved once for a match

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
