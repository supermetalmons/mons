const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { batchReadWithRetry, getProfileByLoginId } = require("./utils");
const { applyMaterialDeltas, updateFrozenMaterials, readUserMiningMaterials, updateUserMiningMaterials } = require("./wagerHelpers");
const { resolveMatchResult } = require("./matchResult");

exports.resolveWagerOutcome = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }

  const uid = request.auth.uid;
  const playerId = request.data.playerId;
  const inviteId = request.data.inviteId;
  const matchId = request.data.matchId;
  const opponentId = request.data.opponentId;

  if (typeof playerId !== "string" || typeof inviteId !== "string" || typeof matchId !== "string" || typeof opponentId !== "string") {
    return { ok: false, reason: "invalid-argument" };
  }

  const matchRef = admin.database().ref(`players/${playerId}/matches/${matchId}`);
  const inviteRef = admin.database().ref(`invites/${inviteId}`);
  const opponentMatchRef = admin.database().ref(`players/${opponentId}/matches/${matchId}`);

  const [matchSnapshot, inviteSnapshot, opponentMatchSnapshot] = await batchReadWithRetry([matchRef, inviteRef, opponentMatchRef]);
  const matchData = matchSnapshot.val();
  const inviteData = inviteSnapshot.val();
  const opponentMatchData = opponentMatchSnapshot.val();

  if (!matchData || !inviteData || !opponentMatchData) {
    return { ok: false, reason: "match-not-found" };
  }

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

  const matchResult = await resolveMatchResult(matchData, opponentMatchData);
  const result = matchResult.result;

  if (result !== "win" && result !== "gg") {
    throw new HttpsError("internal", "Could not confirm victory.");
  }

  const wagerRef = admin.database().ref(`invites/${inviteId}/wagers/${matchId}`);
  const wagerSnap = await wagerRef.once("value");
  const wagerData = wagerSnap.val();
  if (!wagerData) {
    return { ok: true, reason: "no-wager" };
  }

  const wagerResolutionFlagRef = admin.database().ref(`invites/${inviteId}/matchesWagerResolutions/${matchId}`);
  const txnResult = await wagerResolutionFlagRef.transaction((current) => {
    if (current === true) {
      return;
    }
    return true;
  });
  if (!txnResult.committed) {
    return { ok: true, reason: "already-resolved" };
  }

  if (!wagerData.resolved) {
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
            total: count * 2,
            resolvedAt: Date.now(),
          },
          proposals: null,
        });
      }
    } else if (wagerData.proposals) {
      const proposals = wagerData.proposals;
      const updateTasks = [];
      Object.keys(proposals).forEach((proposalUid) => {
        const proposal = proposals[proposalUid];
        if (proposal && proposal.material && proposal.count) {
          updateTasks.push(updateFrozenMaterials(proposalUid, { [proposal.material]: -proposal.count }));
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
