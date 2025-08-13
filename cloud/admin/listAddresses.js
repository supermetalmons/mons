#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

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

function initAdmin() {
  if (admin.apps.length > 0) return true;
  const projectId = getProjectIdFromArgsEnvOrRc();
  try {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId,
    });
    return true;
  } catch {}
  return false;
}

async function listUniqueAddresses({ outEth, outSol }) {
  const initialized = initAdmin();
  if (initialized) {
    try {
      const firestore = admin.firestore();
      const ethSet = new Set();
      const solSet = new Set();
      const pageSize = 1000;
      let lastDoc = null;
      let totalDocs = 0;
      while (true) {
        let q = firestore.collection("users").orderBy(admin.firestore.FieldPath.documentId()).limit(pageSize);
        if (lastDoc) q = q.startAfter(lastDoc);
        const snap = await q.get();
        if (snap.empty) break;
        for (const doc of snap.docs) {
          totalDocs += 1;
          const data = doc.data();
          const eth = (data.eth || "").trim();
          const sol = (data.sol || "").trim();
          if (eth) ethSet.add(eth.toLowerCase());
          if (sol) solSet.add(sol);
        }
        lastDoc = snap.docs[snap.docs.length - 1];
        if (snap.size < pageSize) break;
      }
      const ethList = Array.from(ethSet).sort();
      const solList = Array.from(solSet).sort();
      if (outEth) {
        fs.writeFileSync(outEth, ethList.join("\n") + "\n");
        console.log(`Wrote ${ethList.length} unique ETH addresses from ${totalDocs} user docs to ${outEth}`);
      }
      if (outSol) {
        fs.writeFileSync(outSol, solList.join("\n") + "\n");
        console.log(`Wrote ${solList.length} unique SOL addresses from ${totalDocs} user docs to ${outSol}`);
      }
      if (!outEth && !outSol) {
        console.log(`ETH (${ethList.length})`);
        console.log(ethList.join("\n"));
        console.log(`SOL (${solList.length})`);
        console.log(solList.join("\n"));
      }
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
  const args = process.argv.slice(2);
  const outEthIdx = args.indexOf("--out-eth");
  const outSolIdx = args.indexOf("--out-sol");
  const outEth = outEthIdx !== -1 ? args[outEthIdx + 1] : null;
  const outSol = outSolIdx !== -1 ? args[outSolIdx + 1] : null;
  await listUniqueAddresses({ outEth, outSol });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


