const { onCall, HttpsError } = require("firebase-functions/v2/https");
const glicko2 = require("glicko2");
const admin = require("firebase-admin");
const { batchReadWithRetry, getProfileByLoginId, updateUserRatingNonceAndManaPoints, appendAutomatchBotMessageText, getDisplayNameFromAddress } = require("./utils");
const { applyMaterialDeltas, updateFrozenMaterials, readUserMiningMaterials, updateUserMiningMaterials } = require("./wagerHelpers");

exports.updateRatings = onCall(async (request) => {
  const uid = request.auth.uid;
  const playerId = request.data.playerId;
  const inviteId = request.data.inviteId;
  const matchId = request.data.matchId;
  const opponentId = request.data.opponentId;

  const isAutomatch = inviteId.startsWith("auto_");

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
    let mining = null;
    if (playerProfile.profileId) {
      const userDoc = await admin.firestore().collection("users").doc(playerProfile.profileId).get();
      if (userDoc.exists) {
        const userData = userDoc.data() || {};
        mining = {
          lastRockDate: typeof (userData.mining && userData.mining.lastRockDate) === "string" ? userData.mining.lastRockDate : null,
          materials: applyMaterialDeltas(userData.mining && userData.mining.materials, {}),
        };
      }
    }
    return {
      ok: true,
      mining,
    };
  }

  if (!mons) {
    mons = await import("mons-rust");
  }
  let gameForScore = mons.MonsGameModel.from_fen(matchData.fen);
  if (!gameForScore.is_later_than(opponentMatchData.fen)) {
    gameForScore = mons.MonsGameModel.from_fen(opponentMatchData.fen);
  }
  if (isAutomatch) {
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
      const newPlayerManaTotal = (playerProfile.totalManaPoints ?? 0) + playerManaPoints;
      const newOpponentManaTotal = (opponentProfile.totalManaPoints ?? 0) + opponentManaPoints;
      const newNonce1 = playerProfile.nonce + 1;
      const newNonce2 = opponentProfile.nonce + 1;

      if (result === "win") {
        const [newWinnerRating, newLoserRating] = updateRating(playerProfile.rating, newNonce1, opponentProfile.rating, newNonce2);
        winnerNewRating = newWinnerRating;
        loserNewRating = newLoserRating;
        updateUserRatingNonceAndManaPoints(playerProfile.profileId, newWinnerRating, newNonce1, true, newPlayerManaTotal);
        updateUserRatingNonceAndManaPoints(opponentProfile.profileId, newLoserRating, newNonce2, false, newOpponentManaTotal);
      } else {
        const [newWinnerRating, newLoserRating] = updateRating(opponentProfile.rating, newNonce2, playerProfile.rating, newNonce1);
        winnerNewRating = newWinnerRating;
        loserNewRating = newLoserRating;
        updateUserRatingNonceAndManaPoints(playerProfile.profileId, newLoserRating, newNonce1, false, newPlayerManaTotal);
        updateUserRatingNonceAndManaPoints(opponentProfile.profileId, newWinnerRating, newNonce2, true, newOpponentManaTotal);
      }
    }

    const winnerScore = result === "win" ? playerManaPoints : opponentManaPoints;
    const loserScore = result === "win" ? opponentManaPoints : playerManaPoints;
    let suffix = ` (${winnerScore} - ${loserScore})`;
    if (matchData.status === "surrendered" || opponentMatchData.status === "surrendered") {
      suffix += " ⚐";
    } else if (matchData.timer === "gg" || opponentMatchData.timer === "gg") {
      suffix += " ⏲";
    }
    const updateRatingMessage = canUpdateRatings ? `${winnerDisplayName} ${winnerNewRating}↑ ${loserDisplayName} ${loserNewRating}↓${suffix}` : `${winnerDisplayName} ↑ ${loserDisplayName}${suffix}`;
    await appendAutomatchBotMessageText(inviteId, updateRatingMessage, true);
  }

  const wagerRef = admin.database().ref(`invites/${inviteId}/wagers/${matchId}`);
  const wagerSnap = await wagerRef.once("value");
  const wagerData = wagerSnap.val();
  if (wagerData && !wagerData.resolved) {
    if (wagerData.agreed && wagerData.agreed.material && wagerData.agreed.count) {
      const material = wagerData.agreed.material;
      const count = Math.max(0, Math.round(Number(wagerData.agreed.count)));
      if (count > 0 && playerProfile.profileId && opponentProfile.profileId) {
        const winnerId = result === "win" ? playerId : opponentId;
        const loserId = result === "win" ? opponentId : playerId;
        const winnerProfileId = winnerId === playerId ? playerProfile.profileId : opponentProfile.profileId;
        const loserProfileId = loserId === playerId ? playerProfile.profileId : opponentProfile.profileId;

        const winnerMaterials = await readUserMiningMaterials(winnerProfileId);
        const loserMaterials = await readUserMiningMaterials(loserProfileId);
        const updatedWinnerMaterials = applyMaterialDeltas(winnerMaterials, { [material]: count });
        const updatedLoserMaterials = applyMaterialDeltas(loserMaterials, { [material]: -count });
        await updateUserMiningMaterials(winnerProfileId, updatedWinnerMaterials);
        await updateUserMiningMaterials(loserProfileId, updatedLoserMaterials);
        await updateFrozenMaterials(winnerId, { [material]: -count });
        await updateFrozenMaterials(loserId, { [material]: -count });
        await wagerRef.update({
          resolved: {
            winnerId,
            loserId,
            material,
            count,
            resolvedAt: Date.now(),
          },
          proposals: null,
        });
      }
    } else if (wagerData.proposals) {
      const proposals = wagerData.proposals;
      const updateTasks = [];
      Object.keys(proposals).forEach((uid) => {
        const proposal = proposals[uid];
        if (proposal && proposal.material && proposal.count) {
          updateTasks.push(updateFrozenMaterials(uid, { [proposal.material]: -proposal.count }));
        }
      });
      if (updateTasks.length > 0) {
        await Promise.all(updateTasks);
      }
      await wagerRef.update({
        proposals: null,
      });
    }
  }

  let mining = null;
  if (playerProfile.profileId) {
    const userDoc = await admin.firestore().collection("users").doc(playerProfile.profileId).get();
    if (userDoc.exists) {
      const userData = userDoc.data() || {};
      mining = {
        lastRockDate: typeof (userData.mining && userData.mining.lastRockDate) === "string" ? userData.mining.lastRockDate : null,
        materials: applyMaterialDeltas(userData.mining && userData.mining.materials, {}),
      };
    }
  }
  return {
    ok: true,
    mining,
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
