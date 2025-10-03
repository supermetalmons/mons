#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { sendBotMessage } = require("../functions/utils");

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

async function main() {
  const isoTime = new Date().toISOString();
  const raHoursTotal = Math.random() * 24;
  const raH = Math.floor(raHoursTotal);
  const raMFloat = (raHoursTotal - raH) * 60;
  let raM = Math.floor(raMFloat);
  let raS = (raMFloat - raM) * 60;
  if (raS >= 59.995) {
    raS = 0;
    raM += 1;
  }
  if (raM >= 60) {
    raM = 0;
  }
  const raStr = `${String(raH).padStart(2, "0")}h ${String(raM).padStart(2, "0")}m ${raS.toFixed(2).padStart(5, "0")}s`;
  const decTotal = Math.random() * 180 - 90;
  const decSign = decTotal >= 0 ? "+" : "-";
  const absDec = Math.abs(decTotal);
  const decD = Math.floor(absDec);
  const decMFloat = (absDec - decD) * 60;
  let decM = Math.floor(decMFloat);
  let decS = (decMFloat - decM) * 60;
  if (decS >= 59.995) {
    decS = 0;
    decM += 1;
  }
  if (decM >= 60) {
    decM = 0;
  }
  const decStr = `${decSign}${String(decD).padStart(2, "0")}° ${String(decM).padStart(2, "0")}' ${decS.toFixed(2).padStart(5, "0")}"`;
  const message = `🌠 shooting star alert https://mons.link\n\n${isoTime}\n\nRA ${raStr} • Dec ${decStr}`;
  await sendBotMessage(message, true, false);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
