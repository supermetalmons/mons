#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");
const { initAdmin } = require("./_admin");
const { getDisplayNameFromAddress, sendBotMessage, customTelegramEmojis } = require("../functions/utils");

try {
  const envPath = path.resolve(__dirname, "../functions/.env");
  if (fs.existsSync(envPath)) {
    const raw = fs.readFileSync(envPath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      let value = trimmed.slice(idx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  }
} catch {}

function getEmojiTag(data) {
  if (!data || typeof data.custom !== "object" || data.custom === null) return "";
  const emojiNumber = Number(data.custom.emoji);
  if (!Number.isInteger(emojiNumber)) return "";
  const emojiId = customTelegramEmojis[emojiNumber];
  if (!emojiId) return "";
  return `<tg-emoji emoji-id="${emojiId}">&#11088;</tg-emoji> `;
}

async function logTopGpWithEmojis(limit = 15) {
  const initialized = initAdmin();
  if (initialized) {
    try {
      const firestore = admin.firestore();
      const snap = await firestore.collection("users").orderBy("nonce", "desc").limit(limit).get();
      let output = "<b>top 15 gp</b>\n\n";
      let rank = 1;
      for (const doc of snap.docs) {
        const data = doc.data();
        const username = data.username || "";
        const eth = data.eth || "";
        const sol = data.sol || "";
        const gp = data.nonce + 1;
        const name = getDisplayNameFromAddress(username, eth, sol, 0);
        const emojiTag = getEmojiTag(data);
        output += `${rank}. ${emojiTag} ${name} ${gp}\n\n`;
        rank += 1;
      }
      console.log(output);
      await sendBotMessage(output, false, true);
      return;
    } catch (e) {
      try {
        await admin.app().delete();
      } catch {}
    }
  }
  throw new Error("Failed to initialize Admin SDK with Application Default Credentials. Run gcloud auth application-default login.");
}

async function main() {
  await logTopGpWithEmojis(15);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
