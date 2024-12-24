const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

exports.automatch = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }

  const uid = request.auth.uid;
  const ethAddress = await getPlayerEthAddress(uid);
  const name = getDisplayNameFromAddress(ethAddress);
  const emojiId = request.data.emojiId;

  const automatchAttemptResult = await attemptAutomatch(uid, ethAddress, name, emojiId, 0);
  return automatchAttemptResult;
});

async function attemptAutomatch(uid, ethAddress, name, emojiId, retryCount) {
  const maxRetryCount = 3;
  if (retryCount > maxRetryCount) {
    return { ok: false };
  }

  const automatchRef = admin.database().ref("automatch").limitToFirst(1);
  const snapshot = await automatchRef.once("value");

  if (snapshot.exists()) {
    const firstAutomatchId = Object.keys(snapshot.val())[0];
    const existingAutomatchData = snapshot.val()[firstAutomatchId];
    if (existingAutomatchData.uid !== uid) {
      const existingPlayerName = getDisplayNameFromAddress(existingAutomatchData.ethAddress);

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
        fen: initialFen,
        status: "",
        flatMovesString: "",
        timer: "",
      };

      try {
        const success = await acceptInvite(firstAutomatchId, invite, match, uid);
        if (success) {
          sendTelegramMessage(`${existingPlayerName} automatched with ${name} https://mons.link/${firstAutomatchId}`).catch(console.error);
        } else {
          return await attemptAutomatch(uid, ethAddress, name, emojiId, retryCount + 1);
        }
      } catch (error) {
        return await attemptAutomatch(uid, ethAddress, name, emojiId, retryCount + 1);
      }
    }
    return {
      ok: true,
      inviteId: firstAutomatchId,
    };
  } else {
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
      fen: initialFen,
      status: "",
      flatMovesString: "",
      timer: "",
    };

    const updates = {};
    updates[`players/${uid}/matches/${inviteId}`] = match;
    updates[`automatch/${inviteId}`] = { uid: uid, timestamp: admin.database.ServerValue.TIMESTAMP, ethAddress: ethAddress, hostColor: hostColor, password: password };
    updates[`invites/${inviteId}`] = invite;
    await admin.database().ref().update(updates);

    const message = `${name} is looking for a match 👉 https://mons.link`;
    sendTelegramMessage(message).catch(console.error);

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

async function sendTelegramMessage(message) {
  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
  const telegramChatId = process.env.TELEGRAM_CHAT_ID;

  try {
    fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: telegramChatId,
        text: message,
        disable_web_page_preview: true,
      }),
    });
  } catch (error) {
    console.error("Error sending Telegram message:", error);
  }
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

async function getPlayerEthAddress(uid) {
  try {
    const playerEthAddressRef = admin.database().ref(`players/${uid}/ethAddress`);
    const playerEthAddressSnapshot = await playerEthAddressRef.once("value");
    if (playerEthAddressSnapshot && playerEthAddressSnapshot.val()) {
      return playerEthAddressSnapshot.val();
    }
  } catch (error) {
    console.error("Error getting player ETH address:", error);
  }
  return "";
}

function matchKnownAddress(address) {
  if (!address) return null;

  const knownAddresses = {
    "0xe26067c76fdbe877f48b0a8400cf5db8b47af0fe": "ivan",
    "0x2bb97367ff26b701a60aedc213640c34f469cf38": "meinong",
    "0xe4790dd79c334e3f848904975272ec17f9f70366": "bosch",
  };

  const lowerAddress = address.toLowerCase();
  return knownAddresses[lowerAddress] || null;
}

function getDisplayNameFromAddress(address) {
  if (!address) return "anon";

  const knownName = matchKnownAddress(address);
  if (knownName) return knownName;

  return address.slice(2, 6) + "..." + address.slice(-4);
}

const hostColor = Math.random() < 0.5 ? "white" : "black";
const controllerVersion = 2;
const initialFen = "0 0 w 0 0 0 0 0 1 n03y0xs0xd0xa0xe0xn03/n11/n11/n04xxmn01xxmn04/n03xxmn01xxmn01xxmn03/xxQn04xxUn04xxQ/n03xxMn01xxMn01xxMn03/n04xxMn01xxMn04/n11/n11/n03E0xA0xD0xS0xY0xn03";
