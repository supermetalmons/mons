#!/usr/bin/env node
const { initAdmin, admin } = require("./_admin");

const DEFAULT_AUTH_METHOD_COOLDOWN_MS = 24 * 60 * 60 * 1000;

const parseNumber = (value, fallback = 0) => {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? Math.floor(numeric) : fallback;
};

const resolveRetryAtMs = (docData) => {
  const retryAtMs = parseNumber(docData && docData.retryAtMs, 0);
  if (retryAtMs > 0) {
    return retryAtMs;
  }
  const expiresAtMs = parseNumber(docData && docData.expiresAtMs, 0);
  if (expiresAtMs > 0) {
    return expiresAtMs;
  }
  const startedAtMs = Math.max(
    parseNumber(docData && docData.startedAtMs, 0),
    parseNumber(docData && docData.revokedAtMs, 0),
    parseNumber(docData && docData.createdAtMs, 0),
    parseNumber(docData && docData.updatedAtMs, 0)
  );
  const cooldownMs = parseNumber(docData && docData.cooldownMs, DEFAULT_AUTH_METHOD_COOLDOWN_MS);
  if (startedAtMs > 0 && cooldownMs > 0) {
    return startedAtMs + cooldownMs;
  }
  return 0;
};

async function main() {
  if (!initAdmin()) {
    throw new Error("Failed to initialize Admin SDK.");
  }

  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const firestore = admin.firestore();
  const pageSize = 400;

  let scanned = 0;
  let expired = 0;
  let deleted = 0;
  let activeSkipped = 0;
  let unknownSkipped = 0;
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
    const nowMs = Date.now();
    const docsToDelete = [];
    snapshot.docs.forEach((doc) => {
      const data = doc.data() || {};
      const retryAtMs = resolveRetryAtMs(data);
      if (retryAtMs <= 0) {
        unknownSkipped += 1;
        return;
      }
      if (retryAtMs > nowMs) {
        activeSkipped += 1;
        return;
      }
      docsToDelete.push(doc);
    });

    expired += docsToDelete.length;

    if (!dryRun && docsToDelete.length > 0) {
      const batch = firestore.batch();
      docsToDelete.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
      deleted += docsToDelete.length;
    }

    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    if (snapshot.size < pageSize) {
      break;
    }
  }

  if (dryRun) {
    deleted = expired;
  }

  console.log("Auth method revocation cleanup summary:");
  console.log(
    JSON.stringify(
      {
        dryRun,
        scanned,
        expired,
        deleted,
        activeSkipped,
        unknownSkipped,
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
