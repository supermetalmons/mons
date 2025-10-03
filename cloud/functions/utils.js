const admin = require("firebase-admin");

const batchReadWithRetry = async (refs) => {
  const initialSnapshots = await Promise.all(
    refs.map((ref) =>
      ref.once("value").catch((error) => {
        console.error("Error in initial batch read:", error);
        return null;
      })
    )
  );

  const finalSnapshots = await Promise.all(
    initialSnapshots.map(async (snapshot, index) => {
      if (snapshot === null) {
        return refs[index].once("value");
      }
      return snapshot;
    })
  );

  return finalSnapshots;
};

async function sendBotMessage(message, silent = false, isHtml = false) {
  try {
    await sendTelegramMessage(message, silent, isHtml);
  } catch (e) {}
}

function sendTelegramMessage(message, silent = false, isHtml = false) {
  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
  const telegramExtraChatId = process.env.TELEGRAM_EXTRA_CHAT_ID;
  const body = {
    chat_id: telegramExtraChatId,
    text: message,
    disable_web_page_preview: true,
    disable_notification: silent,
  };
  if (isHtml) body.parse_mode = "HTML";
  return fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }).catch((error) => {
    console.error("Error sending Telegram message:", error);
  });
}

 

async function sendTelegramMessageAndReturnId(message, silent = false, isHtml = false) {
  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
  const telegramExtraChatId = process.env.TELEGRAM_EXTRA_CHAT_ID;
  try {
    const body = {
      chat_id: telegramExtraChatId,
      text: message,
      disable_web_page_preview: true,
      disable_notification: silent,
    };
    if (isHtml) body.parse_mode = "HTML";
    const res = await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data && data.result && data.result.message_id) {
      return data.result.message_id;
    }
  } catch (error) {}
  return null;
}

async function sendAutomatchBotMessage(inviteId, message, silent = false, isHtml = false) {
  try {
    
  } catch (e) {}
  try {
    sendTelegramMessageAndReturnId(message, silent, isHtml)
      .then((messageId) => {
        if (messageId) {
          admin
            .database()
            .ref(`automatchMessages/${inviteId}`)
            .set({ telegramMessageId: messageId })
            .catch(() => {});
        }
      })
      .catch(() => {});
  } catch (e) {}
}

async function deleteAutomatchBotMessage(inviteId) {
  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
  const telegramExtraChatId = process.env.TELEGRAM_EXTRA_CHAT_ID;
  try {
    const snap = await admin.database().ref(`automatchMessages/${inviteId}`).once("value");
    const val = snap.val();
    const messageId = val && val.telegramMessageId ? val.telegramMessageId : null;
    if (!messageId) {
      return;
    }
    try {
      await fetch(`https://api.telegram.org/bot${telegramBotToken}/deleteMessage`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: telegramExtraChatId,
          message_id: messageId,
        }),
      });
    } catch (e) {}
    try {
      await admin.database().ref(`automatchMessages/${inviteId}`).remove();
    } catch (e) {}
  } catch (e) {}
}

function getDisplayNameFromAddress(username, ethAddress, solAddress, rating) {
  const ratingSuffix = rating === 0 ? "" : ` (${rating})`;
  if (username && username !== "") {
    return username + ratingSuffix;
  } else if (ethAddress && ethAddress !== "") {
    return ethAddress.slice(0, 4) + "..." + ethAddress.slice(-4) + ratingSuffix;
  } else if (solAddress && solAddress !== "") {
    return solAddress.slice(0, 4) + "..." + solAddress.slice(-4) + ratingSuffix;
  } else {
    return "anon";
  }
}

async function getProfileByLoginId(uid) {
  try {
    const firestore = admin.firestore();
    const userQuery = await firestore.collection("users").where("logins", "array-contains", uid).limit(1).get();
    if (!userQuery.empty) {
      const userDoc = userQuery.docs[0];
      const userData = userDoc.data();
      return { nonce: userData.nonce === undefined ? -1 : userData.nonce, rating: userData.rating ?? 1500, eth: userData.eth ?? "", sol: userData.sol ?? "", username: userData.username ?? "", totalManaPoints: userData.totalManaPoints ?? 0, profileId: userDoc.id };
    }
  } catch (error) {
    console.error("Error getting player profile:", error);
  }
  return { eth: "", sol: "", profileId: "", nonce: 0, rating: 0, username: "", totalManaPoints: 0 };
}

async function updateUserRatingNonceAndManaPoints(profileId, newRating, newNonce, isWin, newManaPoints) {
  try {
    const firestore = admin.firestore();
    const userRef = firestore.collection("users").doc(profileId);
    await userRef.update({
      rating: newRating,
      nonce: newNonce,
      win: isWin,
      totalManaPoints: newManaPoints,
    });
    return true;
  } catch (error) {
    console.error("Error updating user rating and nonce:", error);
    return false;
  }
}

async function getPlayerEthAddress(uid) {
  const profile = await getProfileByLoginId(uid);
  return profile.eth;
}

module.exports = {
  batchReadWithRetry,
  getPlayerEthAddress,
  getProfileByLoginId,
  updateUserRatingNonceAndManaPoints,
  sendBotMessage,
  getDisplayNameFromAddress,
  sendAutomatchBotMessage,
  deleteAutomatchBotMessage,
};
