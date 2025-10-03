#!/usr/bin/env node
const fs = require("fs");
const admin = require("firebase-admin");
const { initAdmin } = require("./_admin");

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


