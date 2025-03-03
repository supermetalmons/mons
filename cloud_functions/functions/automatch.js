const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { getProfileByLoginId } = require("./utils");

exports.automatch = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }

  const uid = request.auth.uid;
  const profile = await getProfileByLoginId(uid);
  const ethAddress = profile.eth ?? "";
  const solAddress = profile.sol ?? "";
  const profileId = profile.profileId;
  const username = profile.username ?? "";
  const name = getDisplayNameFromAddress(username, ethAddress, solAddress);
  const emojiId = request.data.emojiId;

  const automatchAttemptResult = await attemptAutomatch(uid, username, ethAddress, solAddress, profileId, name, emojiId, 0);
  return automatchAttemptResult;
});

async function attemptAutomatch(uid, username, ethAddress, solAddress, profileId, name, emojiId, retryCount) {
  const maxRetryCount = 3;
  if (retryCount > maxRetryCount) {
    return { ok: false };
  }

  const automatchRef = admin.database().ref("automatch").limitToFirst(1);
  const snapshot = await automatchRef.once("value");

  if (snapshot.exists()) {
    const firstAutomatchId = Object.keys(snapshot.val())[0];
    const existingAutomatchData = snapshot.val()[firstAutomatchId];
    if (existingAutomatchData.uid !== uid && (profileId === "" || profileId !== existingAutomatchData.profileId)) {
      const existingPlayerName = getDisplayNameFromAddress(existingAutomatchData.username, existingAutomatchData.ethAddress, existingAutomatchData.solAddress);

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
          const matchMessage = `${existingPlayerName} automatched with ${name} https://mons.link/${firstAutomatchId}`;
          sendTelegramMessage(matchMessage).catch(console.error);
          sendDiscordMessage(matchMessage).catch(console.error);
        } else {
          return await attemptAutomatch(uid, username, ethAddress, solAddress, profileId, name, emojiId, retryCount + 1);
        }
      } catch (error) {
        return await attemptAutomatch(uid, username, ethAddress, solAddress, profileId, name, emojiId, retryCount + 1);
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
    updates[`automatch/${inviteId}`] = { uid: uid, timestamp: admin.database.ServerValue.TIMESTAMP, username: username, ethAddress: ethAddress, solAddress: solAddress, profileId: profileId, hostColor: hostColor, password: password };
    updates[`invites/${inviteId}`] = invite;
    await admin.database().ref().update(updates);

    const message = `${name} is looking for a match 👉 https://mons.link`;
    sendTelegramMessage(message).catch(console.error);
    sendDiscordMessage(message).catch(console.error);

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
  const telegramExtraChatId = process.env.TELEGRAM_EXTRA_CHAT_ID;

  try {
    fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: telegramExtraChatId,
        text: message,
        disable_web_page_preview: true,
      }),
    });
  } catch (error) {
    console.error("Error sending Telegram message:", error);
  }
}

async function sendDiscordMessage(message) {
  const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL;

  if (!discordWebhookUrl) {
    console.log("Discord webhook URL not configured, skipping message");
    return;
  }

  try {
    fetch(discordWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: message,
      }),
    });
  } catch (error) {
    console.error("Error sending Discord message:", error);
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

function getDisplayNameFromAddress(username, ethAddress, solAddress) {
  if (username && username !== "") {
    return username;
  } else if (ethAddress && ethAddress !== "") {
    return ethAddress.slice(0, 4) + "..." + ethAddress.slice(-4);
  } else if (solAddress && solAddress !== "") {
    return solAddress.slice(0, 4) + "..." + solAddress.slice(-4);
  } else {
    return "anon";
  }
}

const hostColor = Math.random() < 0.5 ? "white" : "black";
const controllerVersion = 2;
const initialFen = "0 0 w 0 0 0 0 0 1 n03y0xs0xd0xa0xe0xn03/n11/n11/n04xxmn01xxmn04/n03xxmn01xxmn01xxmn03/xxQn04xxUn04xxQ/n03xxMn01xxMn01xxMn03/n04xxMn01xxMn04/n11/n11/n03E0xA0xD0xS0xY0xn03";
