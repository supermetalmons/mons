#!/usr/bin/env node
const admin = require("firebase-admin");
const { initAdmin } = require("./_admin");
const { getDisplayNameFromAddress } = require("../functions/utils");

async function logTopMp(limit = 10) {
  const initialized = initAdmin();
  if (initialized) {
    try {
      const firestore = admin.firestore();
      const snap = await firestore.collection("users").orderBy("totalManaPoints", "desc").limit(limit).get();
      const lines = [];
      let rank = 1;
      for (const doc of snap.docs) {
        const data = doc.data();
        const username = data.username || "";
        const eth = data.eth || "";
        const sol = data.sol || "";
        const mp = data.totalManaPoints || 0;
        const name = getDisplayNameFromAddress(username, eth, sol, 0);
        lines.push(`${rank}. ${name} ${mp}`);
        rank += 1;
      }
      console.log(lines.join("\n"));
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


