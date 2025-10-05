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
    console.log("tg:sendBotMessage:start", { silent, isHtml, length: message ? message.length : 0 });
    await sendTelegramMessage(message, silent, isHtml);
    console.log("tg:sendBotMessage:done");
  } catch (e) {
    console.error("tg:sendBotMessage:error", e && e.message ? e.message : e);
  }
}

function sendTelegramMessage(message, silent = false, isHtml = false) {
  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
  const telegramExtraChatId = process.env.TELEGRAM_EXTRA_CHAT_ID;
  console.log("tg:send:start", { hasToken: !!telegramBotToken, chatId: telegramExtraChatId, silent, isHtml, length: message ? message.length : 0 });
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
  })
    .then(async (res) => {
      const status = res.status;
      let data = null;
      try {
        data = await res.json();
      } catch (_) {}
      console.log("tg:send:response", { status, ok: data && data.ok, messageId: data && data.result && data.result.message_id, description: data && data.description });
      return res;
    })
    .catch((error) => {
      console.error("tg:send:error", error && error.message ? error.message : error);
    });
}

async function sendTelegramMessageAndReturnId(message, silent = false, isHtml = false) {
  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
  const telegramExtraChatId = process.env.TELEGRAM_EXTRA_CHAT_ID;
  try {
    console.log("tg:sendAndReturnId:start", { hasToken: !!telegramBotToken, chatId: telegramExtraChatId, silent, isHtml, length: message ? message.length : 0 });
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
    console.log("tg:sendAndReturnId:response", { status: res.status, ok: data && data.ok, messageId: data && data.result && data.result.message_id, description: data && data.description });
    if (data && data.result && data.result.message_id) {
      return data.result.message_id;
    }
  } catch (error) {
    console.error("tg:sendAndReturnId:error", error && error.message ? error.message : error);
  }
  return null;
}

async function sendAutomatchBotMessage(inviteId, message, silent = false, isHtml = false, name = null) {
  try {
    console.log("auto:send:start", { inviteId, silent, isHtml, name, length: message ? message.length : 0 });
    sendTelegramMessageAndReturnId(message, silent, isHtml)
      .then((messageId) => {
        console.log("auto:send:sent", { inviteId, messageId });
        if (messageId) {
          const payload = { telegramMessageId: messageId, name: name ? name : null, text: message };
          console.log("auto:send:db:set", { path: `automatchMessages/${inviteId}`, payload });
          admin
            .database()
            .ref(`automatchMessages/${inviteId}`)
            .set(payload)
            .then(() => console.log("auto:send:db:ok", { inviteId }))
            .catch((err) => console.error("auto:send:db:error", { inviteId, error: err && err.message ? err.message : err }));
        } else {
          console.warn("auto:send:noMessageId", { inviteId });
        }
      })
      .catch((err) => console.error("auto:send:sendError", { inviteId, error: err && err.message ? err.message : err }));
  } catch (e) {
    console.error("auto:send:error", { inviteId, error: e && e.message ? e.message : e });
  }
}

async function replaceAutomatchBotMessageText(inviteId, newText, isHtml = false) {
  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
  const telegramExtraChatId = process.env.TELEGRAM_EXTRA_CHAT_ID;
  try {
    console.log("auto:edit:start", { inviteId, isHtml, length: newText ? newText.length : 0 });
    const snap = await admin.database().ref(`automatchMessages/${inviteId}`).once("value");
    const val = snap.val();
    const messageId = val && val.telegramMessageId ? val.telegramMessageId : null;
    if (!messageId) {
      console.warn("auto:edit:noMessageId", { inviteId });
      return;
    }
    try {
      const body = {
        chat_id: telegramExtraChatId,
        message_id: messageId,
        text: newText,
        disable_web_page_preview: true,
      };
      if (isHtml) body.parse_mode = "HTML";
      console.log("auto:edit:request", { inviteId, body });
      const res = await fetch(`https://api.telegram.org/bot${telegramBotToken}/editMessageText`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      let data = null;
      try {
        data = await res.json();
      } catch (_) {}
      console.log("auto:edit:response", { inviteId, status: res.status, ok: data && data.ok, description: data && data.description });
      try {
        await admin.database().ref(`automatchMessages/${inviteId}/text`).set(newText);
        console.log("auto:edit:db:ok", { inviteId });
      } catch (e) {
        console.error("auto:edit:db:error", { inviteId, error: e && e.message ? e.message : e });
      }
    } catch (e) {
      console.error("auto:edit:error", { inviteId, error: e && e.message ? e.message : e });
    }
  } catch (e) {
    console.error("auto:edit:outerError", { inviteId, error: e && e.message ? e.message : e });
  }
}

async function appendAutomatchBotMessageText(inviteId, appendText, isHtml = false) {
  try {
    console.log("auto:append:start", { inviteId, isHtml, length: appendText ? appendText.length : 0 });
    const snap = await admin.database().ref(`automatchMessages/${inviteId}`).once("value");
    const val = snap.val();
    const currentText = val && val.text ? val.text : "";
    const combinedText = currentText ? `${currentText}\n\n${appendText}` : appendText;
    console.log("auto:append:computed", { inviteId, currentLength: currentText.length, newLength: combinedText ? combinedText.length : 0 });
    await replaceAutomatchBotMessageText(inviteId, combinedText, isHtml);
  } catch (e) {
    console.error("auto:append:error", { inviteId, error: e && e.message ? e.message : e });
  }
}

async function markCanceledAutomatchBotMessage(inviteId) {
  try {
    console.log("auto:cancelMark:start", { inviteId });
    const snap = await admin.database().ref(`automatchMessages/${inviteId}`).once("value");
    const val = snap.val();
    const name = val && val.name ? val.name : null;
    let editedTextBase = name ? `<i>${name} canceled an automatch` : `<i>there was an invite`;
    const suffix = "";
    const editedText = `${editedTextBase}</i>${suffix}`;
    console.log("auto:cancelMark:computed", { inviteId, length: editedText.length });
    await replaceAutomatchBotMessageText(inviteId, editedText, true);
  } catch (e) {
    console.error("auto:cancelMark:error", { inviteId, error: e && e.message ? e.message : e });
  }
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
  appendAutomatchBotMessageText,
  replaceAutomatchBotMessageText,
  markCanceledAutomatchBotMessage,
};
