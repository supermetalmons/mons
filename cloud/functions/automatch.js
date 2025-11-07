const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { getProfileByLoginId, replaceAutomatchBotMessageByDeletingOriginal, getDisplayNameFromAddress, sendAutomatchBotMessage, getTelegramEmojiTag } = require("./utils");

exports.automatch = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }

  const uid = request.auth.uid;
  console.log("auto:fn:start", { uid });
  const profile = await getProfileByLoginId(uid);
  const ethAddress = profile.eth ?? "";
  const solAddress = profile.sol ?? "";
  const profileId = profile.profileId;
  const username = profile.username ?? "";
  const rating = profile.rating ?? 0;
  const emojiId = request.data.emojiId;
  const name = getDisplayNameFromAddress(username, ethAddress, solAddress, rating, emojiId);
  const aura = request.data.aura || null;

  console.log("auto:fn:params", { rating, profileId, name, emojiId, aura: aura ? true : false });
  const automatchAttemptResult = await attemptAutomatch(uid, rating, username, ethAddress, solAddress, profileId, name, emojiId, aura, 0);
  console.log("auto:fn:result", automatchAttemptResult);
  return automatchAttemptResult;
});

async function attemptAutomatch(uid, rating, username, ethAddress, solAddress, profileId, name, emojiId, aura, retryCount) {
  const maxRetryCount = 3;
  if (retryCount > maxRetryCount) {
    return { ok: false };
  }

  const automatchRef = admin.database().ref("automatch").limitToFirst(1);
  const snapshot = await automatchRef.once("value");
  console.log("auto:attempt:snapshot", { exists: snapshot.exists() });

  if (snapshot.exists()) {
    const firstAutomatchId = Object.keys(snapshot.val())[0];
    const existingAutomatchData = snapshot.val()[firstAutomatchId];
    if (existingAutomatchData.uid !== uid && (profileId === "" || profileId !== existingAutomatchData.profileId)) {
      console.log("auto:attempt:foundExisting", { inviteId: firstAutomatchId, existingUid: existingAutomatchData.uid, hostColor: existingAutomatchData.hostColor });
      const existingPlayerName = getDisplayNameFromAddress(existingAutomatchData.username, existingAutomatchData.ethAddress, existingAutomatchData.solAddress, existingAutomatchData.rating, existingAutomatchData.emojiId);

      const invite = {
        version: controllerVersion,
        hostId: existingAutomatchData.uid,
        hostColor: existingAutomatchData.hostColor,
        guestId: uid,
        password: existingAutomatchData.password,
      };

      const match = {
        version: controllerVersion,
        color: existingAutomatchData.hostColor === "white" ? "black" : "white",
        emojiId: emojiId,
        aura: aura,
        fen: initialFen,
        status: "",
        flatMovesString: "",
        timer: "",
      };

      try {
        const success = await acceptInvite(firstAutomatchId, invite, match, uid);
        console.log("auto:accept:done", { inviteId: firstAutomatchId, success });
        if (success) {
          const matchMessage = `${existingPlayerName} vs. ${name} https://mons.link/${firstAutomatchId}`;
          try {
            console.log("auto:edit:trigger", { inviteId: firstAutomatchId });
            replaceAutomatchBotMessageByDeletingOriginal(firstAutomatchId, matchMessage, true);
          } catch (e) {
            console.error("auto:edit:trigger:error", { inviteId: firstAutomatchId, error: e && e.message ? e.message : e });
          }
        } else {
          return await attemptAutomatch(uid, username, ethAddress, solAddress, profileId, name, emojiId, aura, retryCount + 1);
        }
      } catch (error) {
        console.error("auto:accept:error", { inviteId: firstAutomatchId, error: error && error.message ? error.message : error });
        return await attemptAutomatch(uid, username, ethAddress, solAddress, profileId, name, emojiId, aura, retryCount + 1);
      }
    }
    return {
      ok: true,
      inviteId: firstAutomatchId,
    };
  } else {
    console.log("auto:attempt:createInvite");
    const inviteId = generateInviteId();
    const password = generateRandomString(15);

    const invite = {
      version: controllerVersion,
      hostId: uid,
      hostColor: hostColor,
      guestId: null,
      password: password,
    };

    const match = {
      version: controllerVersion,
      color: hostColor,
      emojiId: emojiId,
      aura: aura,
      fen: initialFen,
      status: "",
      flatMovesString: "",
      timer: "",
    };

    const updates = {};
    updates[`players/${uid}/matches/${inviteId}`] = match;
    updates[`automatch/${inviteId}`] = { uid: uid, rating: rating, timestamp: admin.database.ServerValue.TIMESTAMP, username: username, ethAddress: ethAddress, solAddress: solAddress, profileId: profileId, hostColor: hostColor, password: password, emojiId: emojiId };
    updates[`invites/${inviteId}`] = invite;
    await admin.database().ref().update(updates);
    console.log("auto:create:db:ok", { inviteId });

    const linkHref = "https://mons.link";
    let linkName = name || "";
    let emojiPrefix = "";
    if (linkName.startsWith("<tg-emoji")) {
      const closeIndex = linkName.indexOf("</tg-emoji>");
      if (closeIndex !== -1) {
        const emojiEndIndex = closeIndex + "</tg-emoji>".length;
        emojiPrefix = linkName.slice(0, emojiEndIndex);
        linkName = linkName.slice(emojiEndIndex);
      }
    }
    const emojiSuffix = getTelegramEmojiTag("5355002036817525409");
    const message = `${emojiPrefix}<a href="${linkHref}">${linkName} is looking for a match</a> ${emojiSuffix}`;
    try {
      console.log("auto:send:trigger", { inviteId });
      sendAutomatchBotMessage(inviteId, message, false, true, name);
    } catch (e) {
      console.error("auto:send:trigger:error", { inviteId, error: e && e.message ? e.message : e });
    }

    return {
      ok: true,
      inviteId: inviteId,
    };
  }
}

async function acceptInvite(firstAutomatchId, invite, match, uid) {
  const updates = {};
  updates[`automatch/${firstAutomatchId}`] = null;
  updates[`invites/${firstAutomatchId}`] = invite;
  updates[`players/${uid}/matches/${firstAutomatchId}`] = match;
  await admin.database().ref().update(updates);
  const guestIdRef = admin.database().ref(`invites/${firstAutomatchId}/guestId`);
  const guestIdSnapshot = await guestIdRef.once("value");
  const finalGuestId = guestIdSnapshot.val();
  return finalGuestId === uid;
}

function generateRandomString(length) {
  const letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += letters.charAt(Math.floor(Math.random() * letters.length));
  }
  return result;
}

function generateInviteId() {
  return "auto_" + generateRandomString(11);
}

const hostColor = Math.random() < 0.5 ? "white" : "black";
const controllerVersion = 2;
const initialFen = "0 0 w 0 0 0 0 0 1 n03y0xs0xd0xa0xe0xn03/n11/n11/n04xxmn01xxmn04/n03xxmn01xxmn01xxmn03/xxQn04xxUn04xxQ/n03xxMn01xxMn01xxMn03/n04xxMn01xxMn04/n11/n11/n03E0xA0xD0xS0xY0xn03";
