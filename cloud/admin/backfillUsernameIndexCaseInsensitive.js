#!/usr/bin/env node
const { initAdmin, admin } = require("./_admin");

const toCleanString = (value) =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : "";
const toUsernameLookupKey = (username) => toCleanString(username).toLowerCase();
const isSafeFirestoreDocIdSegment = (value) => {
  const cleaned = toCleanString(value);
  if (!cleaned || cleaned === "." || cleaned === "..") {
    return false;
  }
  return !cleaned.includes("/");
};

async function main() {
  if (!initAdmin()) {
    throw new Error("Failed to initialize Admin SDK.");
  }

  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const dryRun = !write || args.includes("--dry-run");
  const firestore = admin.firestore();
  const pageSize = 400;

  let scannedProfiles = 0;
  let profilesWithUsername = 0;
  let malformedUsernames = 0;
  let repairedProfileLookupKeys = 0;
  let clearedProfileLookupKeys = 0;

  const uniqueOwnerByKey = new Map();
  const collisionsByKey = new Map();
  const malformedEntries = [];

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
      const username = toCleanString(data.username);
      const existingLookupKey = toCleanString(data.usernameLookupKey);
      if (!username) {
        if (existingLookupKey) {
          clearedProfileLookupKeys += 1;
          if (!dryRun) {
            await doc.ref.set(
              {
                usernameLookupKey: admin.firestore.FieldValue.delete(),
              },
              { merge: true },
            );
          }
        }
        continue;
      }

      const usernameKey = toUsernameLookupKey(username);
      if (!usernameKey || !isSafeFirestoreDocIdSegment(usernameKey)) {
        malformedUsernames += 1;
        malformedEntries.push({
          profileId,
          username,
          usernameKey,
          reason: "invalid-username-key-doc-id",
        });
        continue;
      }

      if (existingLookupKey !== usernameKey) {
        repairedProfileLookupKeys += 1;
        if (!dryRun) {
          await doc.ref.set(
            {
              usernameLookupKey: usernameKey,
            },
            { merge: true },
          );
        }
      }

      profilesWithUsername += 1;
      const existingOwner = uniqueOwnerByKey.get(usernameKey);
      if (!existingOwner) {
        uniqueOwnerByKey.set(usernameKey, {
          profileId,
          username,
        });
        continue;
      }

      if (existingOwner.profileId === profileId) {
        continue;
      }

      const collision = collisionsByKey.get(usernameKey) || {
        key: usernameKey,
        profiles: [existingOwner],
      };
      collision.profiles.push({ profileId, username });
      collisionsByKey.set(usernameKey, collision);
    }

    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    if (snapshot.size < pageSize) {
      break;
    }
  }

  collisionsByKey.forEach((collision, key) => {
    uniqueOwnerByKey.delete(key);
  });

  let createdIndexes = 0;
  let repairedIndexes = 0;
  let deletedLegacyIndexes = 0;
  let skippedDueToConflicts = collisionsByKey.size;
  const indexConflicts = [];

  const uniqueEntries = Array.from(uniqueOwnerByKey.entries());
  for (const [usernameKey, owner] of uniqueEntries) {
    const indexRef = firestore.collection("usernameIndex").doc(usernameKey);
    const indexSnapshot = await indexRef.get();

    let needsWrite = false;
    if (!indexSnapshot.exists) {
      createdIndexes += 1;
      needsWrite = true;
    } else {
      const indexData = indexSnapshot.data() || {};
      const indexedProfileId = toCleanString(indexData.profileId);
      const indexedUsername = toCleanString(indexData.username);
      const indexedLookupKey = toCleanString(indexData.lookupKey);
      if (!indexedProfileId || indexedProfileId === owner.profileId) {
        if (
          !indexedProfileId ||
          indexedUsername !== owner.username ||
          indexedLookupKey !== usernameKey
        ) {
          repairedIndexes += 1;
          needsWrite = true;
        }
      } else {
        const indexedProfileSnapshot = await firestore
          .collection("users")
          .doc(indexedProfileId)
          .get();
        const indexedProfileData = indexedProfileSnapshot.exists
          ? indexedProfileSnapshot.data() || {}
          : {};
        const indexedUsernameKey = toUsernameLookupKey(
          indexedProfileData.username,
        );
        if (indexedUsernameKey === usernameKey) {
          indexConflicts.push({
            key: usernameKey,
            expectedProfileId: owner.profileId,
            indexedProfileId,
          });
          skippedDueToConflicts += 1;
          continue;
        }
        repairedIndexes += 1;
        needsWrite = true;
      }
    }

    if (needsWrite && !dryRun) {
      await indexRef.set(
        {
          profileId: owner.profileId,
          username: owner.username,
          lookupKey: usernameKey,
          updatedAtMs: Date.now(),
        },
        { merge: true },
      );
    }

    const legacyDocId = toCleanString(owner.username);
    if (
      legacyDocId &&
      legacyDocId !== usernameKey &&
      isSafeFirestoreDocIdSegment(legacyDocId)
    ) {
      const legacyRef = firestore.collection("usernameIndex").doc(legacyDocId);
      const legacySnapshot = await legacyRef.get();
      if (legacySnapshot.exists) {
        const legacyData = legacySnapshot.data() || {};
        if (toCleanString(legacyData.profileId) === owner.profileId) {
          deletedLegacyIndexes += 1;
          if (!dryRun) {
            await legacyRef.delete();
          }
        }
      }
    }
  }

  const summary = {
    dryRun,
    scannedProfiles,
    profilesWithUsername,
    malformedUsernames,
    repairedProfileLookupKeys,
    clearedProfileLookupKeys,
    uniqueLowercaseUsernames: uniqueEntries.length,
    collisionKeys: collisionsByKey.size,
    createdIndexes,
    repairedIndexes,
    deletedLegacyIndexes,
    indexConflicts: indexConflicts.length,
    skippedDueToConflicts,
    strictUniquenessReady:
      collisionsByKey.size === 0 &&
      indexConflicts.length === 0 &&
      malformedUsernames === 0,
  };

  console.log("Username index case-insensitive backfill summary:");
  console.log(JSON.stringify(summary, null, 2));

  if (collisionsByKey.size > 0) {
    console.log("Username lowercase collisions:");
    collisionsByKey.forEach((collision) => {
      console.log(JSON.stringify(collision));
    });
  }

  if (indexConflicts.length > 0) {
    console.log("Username index ownership conflicts:");
    indexConflicts.forEach((conflict) => {
      console.log(JSON.stringify(conflict));
    });
  }

  if (malformedEntries.length > 0) {
    console.log("Malformed usernames (cannot be indexed safely):");
    malformedEntries.forEach((entry) => {
      console.log(JSON.stringify(entry));
    });
  }

  if (
    !dryRun &&
    (collisionsByKey.size > 0 ||
      indexConflicts.length > 0 ||
      malformedUsernames > 0)
  ) {
    throw new Error(
      "Backfill completed with unresolved username collisions/conflicts/malformed entries. Resolve them before enabling strict case-insensitive uniqueness.",
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
