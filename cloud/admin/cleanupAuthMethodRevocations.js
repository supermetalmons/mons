#!/usr/bin/env node
const { initAdmin, admin } = require("./_admin");

async function main() {
  if (!initAdmin()) {
    throw new Error("Failed to initialize Admin SDK.");
  }

  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const firestore = admin.firestore();
  const pageSize = 400;

  let scanned = 0;
  let deleted = 0;
  let lastDoc = null;

  while (true) {
    let query = firestore.collection("authMethodRevocations").orderBy(admin.firestore.FieldPath.documentId()).limit(pageSize);
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }
    const snapshot = await query.get();
    if (snapshot.empty) {
      break;
    }

    scanned += snapshot.size;
    deleted += snapshot.size;

    if (!dryRun) {
      const batch = firestore.batch();
      snapshot.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }

    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    if (snapshot.size < pageSize) {
      break;
    }
  }

  console.log("Auth method revocation cleanup summary:");
  console.log(
    JSON.stringify(
      {
        dryRun,
        scanned,
        deleted,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
