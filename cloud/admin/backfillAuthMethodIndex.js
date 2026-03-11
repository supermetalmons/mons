#!/usr/bin/env node
const { initAdmin, admin } = require("./_admin");

const toCleanString = (value) =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : "";

const normalizeEth = (value) => {
  const normalized = toCleanString(value).toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(normalized) ? normalized : "";
};

const normalizeSol = (value) => {
  const normalized = toCleanString(value);
  if (normalized.length < 20 || normalized.length > 64) {
    return "";
  }
  return normalized;
};

const normalizeAppleSub = (value) => {
  const normalized = toCleanString(value);
  return normalized.length >= 6 ? normalized : "";
};

const normalizeXUserId = (value) => {
  const normalized = toCleanString(value);
  return /^\d+$/.test(normalized) ? normalized : "";
};

const methodKey = (method, normalizedValue) => {
  return `${method}:${Buffer.from(normalizedValue, "utf8").toString("base64url")}`;
};

async function main() {
  if (!initAdmin()) {
    throw new Error("Failed to initialize Admin SDK.");
  }

  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const firestore = admin.firestore();
  const pageSize = 400;

  let scannedProfiles = 0;
  let createdIndexes = 0;
  let repairedIndexes = 0;
  const conflicts = [];
  const malformed = [];

  let lastDoc = null;
  while (true) {
    let query = firestore
      .collection("users")
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(pageSize);
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }
    const snapshot = await query.get();
    if (snapshot.empty) {
      break;
    }

    for (const doc of snapshot.docs) {
      scannedProfiles += 1;
      const profileId = doc.id;
      const data = doc.data() || {};
      const entries = [
        { method: "eth", normalizedValue: normalizeEth(data.eth) },
        { method: "sol", normalizedValue: normalizeSol(data.sol) },
        { method: "apple", normalizedValue: normalizeAppleSub(data.appleSub) },
        { method: "x", normalizedValue: normalizeXUserId(data.xUserId) },
      ];

      for (const entry of entries) {
        if (!entry.normalizedValue) {
          const fieldName =
            entry.method === "apple"
              ? "appleSub"
              : entry.method === "x"
                ? "xUserId"
                : entry.method;
          const rawValue = toCleanString(data[fieldName]);
          if (rawValue) {
            malformed.push({
              profileId,
              method: entry.method,
              value: rawValue,
            });
          }
          continue;
        }
        const indexRef = firestore
          .collection("authMethodIndex")
          .doc(methodKey(entry.method, entry.normalizedValue));
        const indexSnapshot = await indexRef.get();
        if (!indexSnapshot.exists) {
          createdIndexes += 1;
          if (!dryRun) {
            await indexRef.set({
              profileId,
              method: entry.method,
              normalizedValue: entry.normalizedValue,
              updatedAtMs: Date.now(),
            });
          }
          continue;
        }
        const indexData = indexSnapshot.data() || {};
        const indexedProfileId = toCleanString(indexData.profileId);
        if (!indexedProfileId || indexedProfileId === profileId) {
          if (!indexedProfileId) {
            repairedIndexes += 1;
            if (!dryRun) {
              await indexRef.set(
                { profileId, updatedAtMs: Date.now() },
                { merge: true },
              );
            }
          }
          continue;
        }
        conflicts.push({
          method: entry.method,
          normalizedValue: entry.normalizedValue,
          profileId,
          indexedProfileId,
        });
      }
    }

    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    if (snapshot.size < pageSize) {
      break;
    }
  }

  const summary = {
    dryRun,
    scannedProfiles,
    createdIndexes,
    repairedIndexes,
    malformedCount: malformed.length,
    conflictsCount: conflicts.length,
  };
  console.log("Auth method index backfill summary:");
  console.log(JSON.stringify(summary, null, 2));

  if (malformed.length > 0) {
    console.log("Malformed method entries:");
    malformed.forEach((item) => {
      console.log(JSON.stringify(item));
    });
  }
  if (conflicts.length > 0) {
    console.log("Conflicting index ownership:");
    conflicts.forEach((item) => {
      console.log(JSON.stringify(item));
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
