const fs = require("fs");
const path = require("path");
let admin;
try {
  admin = require("../functions/node_modules/firebase-admin");
} catch {
  admin = require("firebase-admin");
}

function getProjectIdFromArgsEnvOrRc() {
  const args = process.argv.slice(2);
  const pIdx = args.indexOf("--project");
  if (pIdx !== -1 && args[pIdx + 1]) return args[pIdx + 1];
  if (process.env.FIREBASE_PROJECT) return process.env.FIREBASE_PROJECT;
  if (process.env.GOOGLE_CLOUD_PROJECT) return process.env.GOOGLE_CLOUD_PROJECT;
  try {
    const rcPath = path.resolve(__dirname, "..", ".firebaserc");
    if (fs.existsSync(rcPath)) {
      const rc = JSON.parse(fs.readFileSync(rcPath, "utf8"));
      if (rc.projects && rc.projects.default) return rc.projects.default;
    }
  } catch {}
  return undefined;
}

function getDatabaseUrlFromArgsEnvOrProject(projectId) {
  const args = process.argv.slice(2);
  const dbIdx = args.indexOf("--database-url");
  if (dbIdx !== -1 && args[dbIdx + 1]) return args[dbIdx + 1];
  if (process.env.FIREBASE_DATABASE_URL) return process.env.FIREBASE_DATABASE_URL;
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (projectId) return `https://${projectId}-default-rtdb.firebaseio.com`;
  return undefined;
}

function initAdmin() {
  if (admin.apps.length > 0) return true;
  const projectId = getProjectIdFromArgsEnvOrRc();
  const databaseURL = getDatabaseUrlFromArgsEnvOrProject(projectId);
  try {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId,
      databaseURL,
    });
    return true;
  } catch {}
  return false;
}

module.exports = { initAdmin, admin };
