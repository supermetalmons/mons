const { onCall, HttpsError } = require("firebase-functions/v2/https");
const glicko2 = require("glicko2");
const admin = require("firebase-admin");
const { batchReadWithRetry, getProfileByLoginId, updateUserRatingNonceAndManaPoints, appendAutomatchBotMessageText, getDisplayNameFromAddress, getTelegramEmojiTag } = require("./utils");

const materialTelegramEmojiIds = {
  dust: "5235835141238063097",
  slime: "5235497595463303384",
  gum: "5233425978117621609",
  metal: "5235794850149863190",
  ice: "5233743994676086020",
};

const matchStatusTelegramEmojiIds = {
  timer: "5229098317530568280",
  whiteFlag: "5228702136862282659",
};

const FEB_CHALLENGE_START_UTC = Date.UTC(2026, 1, 1);
const FEB_CHALLENGE_END_UTC = Date.UTC(2026, 2, 1);

const isFebruaryChallengeActive = () => {
  const now = Date.now();
  return now >= FEB_CHALLENGE_START_UTC && now < FEB_CHALLENGE_END_UTC;
};

const updateFebruaryUniqueOpponents = async (profileId, opponentProfileId) => {
  if (!profileId || !opponentProfileId || profileId === opponentProfileId) {
    return;
  }

  try {
    const firestore = admin.firestore();
    const userRef = firestore.collection("users").doc(profileId);
    await firestore.runTransaction(async (transaction) => {
      const snap = await transaction.get(userRef);
      if (!snap.exists) {
        return;
      }
      const data = snap.data() || {};
      const existingOpponents = Array.isArray(data.feb2026UniqueOpponents) ? data.feb2026UniqueOpponents : [];
      if (existingOpponents.includes(opponentProfileId)) {
        return;
      }
      const updatedOpponents = [...existingOpponents, opponentProfileId];
      transaction.update(userRef, {
        feb2026UniqueOpponents: updatedOpponents,
        feb2026UniqueOpponentsCount: updatedOpponents.length,
      });
    });
  } catch (error) {
    console.error("Error updating February unique opponents:", error);
  }
};

const getWagerSuffix = (inviteData, matchId) => {
  const wagerData = inviteData && inviteData.wagers && inviteData.wagers[matchId] ? inviteData.wagers[matchId] : null;
  const agreed = wagerData && wagerData.agreed ? wagerData.agreed : null;
  if (!agreed || !agreed.material || agreed.count === undefined || agreed.count === null) {
    return "";
  }
  const material = typeof agreed.material === "string" ? agreed.material : "";
  const emojiId = materialTelegramEmojiIds[material] || "";
  const icon = getTelegramEmojiTag(emojiId);
  if (!icon) {
    return "";
  }
  const normalizedCount = Math.round(Number(agreed.count));
  if (!Number.isFinite(normalizedCount) || normalizedCount <= 0) {
    return "";
  }
  return `${icon} ${normalizedCount}`;
};

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
  let mons;

  const playerProfile = await getProfileByLoginId(playerId);
  const opponentProfile = await getProfileByLoginId(opponentId);

  if (!((inviteData.hostId === playerId && inviteData.guestId === opponentId) || (inviteData.hostId === opponentId && inviteData.guestId === playerId))) {
    throw new HttpsError("permission-denied", "Players don't match invite data");
  }

  if (uid !== playerId) {
    const customClaims = request.auth.token || {};
    if (playerProfile.profileId && (!customClaims.profileId || customClaims.profileId !== playerProfile.profileId)) {
      throw new HttpsError("permission-denied", "You don't have permission to perform this action for this player.");
    }
  }

  var result = "none";
  if (matchData.status === "surrendered" || opponentMatchData.timer === "gg") {
    result = "gg";
  } else if (opponentMatchData.status === "surrendered" || matchData.timer === "gg") {
    result = "win";
  } else {
    const color = matchData.color;
    const opponentColor = opponentMatchData.color;
    mons = await import("mons-rust");
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

  if (!mons) {
    mons = await import("mons-rust");
  }
  let gameForScore = mons.MonsGameModel.from_fen(matchData.fen);
  if (!gameForScore.is_later_than(opponentMatchData.fen)) {
    gameForScore = mons.MonsGameModel.from_fen(opponentMatchData.fen);
  }
  const playerManaPoints = matchData.color === "white" ? gameForScore.white_score() : gameForScore.black_score();
  const opponentManaPoints = opponentMatchData.color === "white" ? gameForScore.white_score() : gameForScore.black_score();
  const playerHasProfile = playerProfile.profileId !== "";
  const opponentHasProfile = opponentProfile.profileId !== "";
  const canUpdateRatings = playerHasProfile && opponentHasProfile;

  const playerEmoji = playerProfile.emoji === "" ? matchData.emojiId : playerProfile.emoji;
  const opponentEmoji = opponentProfile.emoji === "" ? opponentMatchData.emojiId : opponentProfile.emoji;
  const playerProfileDisplayName = getDisplayNameFromAddress(playerProfile.username, playerProfile.eth, playerProfile.sol, 0, playerEmoji, false);
  const opponentProfileDisplayName = getDisplayNameFromAddress(opponentProfile.username, opponentProfile.eth, opponentProfile.sol, 0, opponentEmoji, false);

  let winnerDisplayName = result === "win" ? playerProfileDisplayName : opponentProfileDisplayName;
  let loserDisplayName = result === "win" ? opponentProfileDisplayName : playerProfileDisplayName;

  let winnerNewRating = 0;
  let loserNewRating = 0;

  if (canUpdateRatings) {
    const hasMoves = (data) => typeof data.flatMovesString === "string" && data.flatMovesString.length > 0;
    const bothPlayersMoved = hasMoves(matchData) && hasMoves(opponentMatchData);
    const newPlayerManaTotal = (playerProfile.totalManaPoints ?? 0) + playerManaPoints;
    const newOpponentManaTotal = (opponentProfile.totalManaPoints ?? 0) + opponentManaPoints;
    const newNonce1 = playerProfile.nonce + 1;
    const newNonce2 = opponentProfile.nonce + 1;
    const updatedPlayerNonce = bothPlayersMoved ? newNonce1 : playerProfile.nonce;
    const updatedOpponentNonce = bothPlayersMoved ? newNonce2 : opponentProfile.nonce;
    const shouldUpdateFebruaryChallenge = bothPlayersMoved && isFebruaryChallengeActive();

    if (result === "win") {
      const [newWinnerRating, newLoserRating] = updateRating(playerProfile.rating, newNonce1, opponentProfile.rating, newNonce2);
      winnerNewRating = newWinnerRating;
      loserNewRating = newLoserRating;
      void updateUserRatingNonceAndManaPoints(playerProfile.profileId, newWinnerRating, updatedPlayerNonce, true, newPlayerManaTotal);
      void updateUserRatingNonceAndManaPoints(opponentProfile.profileId, newLoserRating, updatedOpponentNonce, false, newOpponentManaTotal);
    } else {
      const [newWinnerRating, newLoserRating] = updateRating(opponentProfile.rating, newNonce2, playerProfile.rating, newNonce1);
      winnerNewRating = newWinnerRating;
      loserNewRating = newLoserRating;
      void updateUserRatingNonceAndManaPoints(playerProfile.profileId, newLoserRating, updatedPlayerNonce, false, newPlayerManaTotal);
      void updateUserRatingNonceAndManaPoints(opponentProfile.profileId, newWinnerRating, updatedOpponentNonce, true, newOpponentManaTotal);
    }

    if (shouldUpdateFebruaryChallenge) {
      void updateFebruaryUniqueOpponents(playerProfile.profileId, opponentProfile.profileId);
      void updateFebruaryUniqueOpponents(opponentProfile.profileId, playerProfile.profileId);
    }
  }

  const winnerScore = result === "win" ? playerManaPoints : opponentManaPoints;
  const loserScore = result === "win" ? opponentManaPoints : playerManaPoints;
  let suffix = ` (${winnerScore} - ${loserScore})`;
  if (matchData.status === "surrendered" || opponentMatchData.status === "surrendered") {
    const icon = getTelegramEmojiTag(matchStatusTelegramEmojiIds.whiteFlag);
    if (icon) suffix += ` ${icon}`;
  } else if (matchData.timer === "gg" || opponentMatchData.timer === "gg") {
    const icon = getTelegramEmojiTag(matchStatusTelegramEmojiIds.timer);
    if (icon) suffix += ` ${icon}`;
  }
  const wagerSuffix = getWagerSuffix(inviteData, matchId);
  if (wagerSuffix) {
    suffix += ` ${wagerSuffix}`;
  }
  const updateRatingMessage = canUpdateRatings ? `${winnerDisplayName} ${winnerNewRating}↑ ${loserDisplayName} ${loserNewRating}↓${suffix}` : `${winnerDisplayName} ↑ ${loserDisplayName}${suffix}`;
  await appendAutomatchBotMessageText(inviteId, updateRatingMessage, true);
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
