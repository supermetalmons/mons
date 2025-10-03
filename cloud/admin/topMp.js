#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");
const { initAdmin } = require("./_admin");
const { getDisplayNameFromAddress, sendBotMessage } = require("../functions/utils");

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

async function logTopMp(limit = 10) {
  const initialized = initAdmin();
  if (initialized) {
    try {
      const firestore = admin.firestore();
      const snap = await firestore.collection("users").orderBy("totalManaPoints", "desc").limit(limit).get();
      let output = "<b>top 10 mp</b>\n\n";
      let rank = 1;
      for (const doc of snap.docs) {
        const data = doc.data();
        const username = data.username || "";
        const eth = data.eth || "";
        const sol = data.sol || "";
        const mp = data.totalManaPoints || 0;
        const name = getDisplayNameFromAddress(username, eth, sol, 0);
        output += `${rank}. ${name} ${mp}\n`;
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
  await logTopMp(10);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
