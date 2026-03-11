const crypto = require("crypto");
const admin = require("firebase-admin");
const { HttpsError } = require("firebase-functions/v2/https");

const AUTO_NAME_MAX_ATTEMPTS = 30;
const USERNAME_ALLOWED_RE = /^[a-zA-Z0-9]+$/;
const AUTO_UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const AUTO_LOWER = "abcdefghijklmnopqrstuvwxyz";
const USERNAME_LOOKUP_KEY_FIELD = "usernameLookupKey";

const toCleanString = (value) =>
  typeof value === "string" ? value.trim() : "";
const buildUsernameLookupKey = (username) =>
  toCleanString(username).toLowerCase();
const isAlphanumericUsername = (username) =>
  USERNAME_ALLOWED_RE.test(toCleanString(username));
const isReservedExplicitUsername = (name) =>
  buildUsernameLookupKey(name) === "anon";
const isSafeFirestoreDocIdSegment = (value) => {
  const cleaned = toCleanString(value);
  if (!cleaned || cleaned === "." || cleaned === "..") {
    return false;
  }
  return !cleaned.includes("/");
};

const getUsernameIndexDocIds = (username) => {
  const cleaned = toCleanString(username);
  if (!cleaned) {
    return [];
  }
  const canonical = buildUsernameLookupKey(cleaned);
  if (!isSafeFirestoreDocIdSegment(canonical)) {
    return [];
  }
  if (canonical === cleaned) {
    return [canonical];
  }
  if (!isSafeFirestoreDocIdSegment(cleaned)) {
    return [canonical];
  }
  return [canonical, cleaned];
};

const isUsernameOwnedByProfileForKey = (username, profileId, expectedKey) => {
  const cleanedProfileId = toCleanString(profileId);
  if (!cleanedProfileId) {
    return false;
  }
  const normalizedUsernameKey = buildUsernameLookupKey(username);
  return normalizedUsernameKey !== "" && normalizedUsernameKey === expectedKey;
};

const buildRandomAutoUsername = () => {
  const firstUpper = AUTO_UPPER[crypto.randomInt(AUTO_UPPER.length)];
  let nextLower = "";
  for (let index = 0; index < 3; index += 1) {
    nextLower += AUTO_LOWER[crypto.randomInt(AUTO_LOWER.length)];
  }
  const suffix = `${crypto.randomInt(1000)}`.padStart(3, "0");
  return `${firstUpper}${nextLower}${suffix}`;
};

const claimOrSetUsernameForProfile = async ({
  profileId,
  username,
  rejectIfDifferentExplicitCurrent,
  unchangedStatus,
}) => {
  const resolvedProfileId = toCleanString(profileId);
  const resolvedUsername = toCleanString(username);
  const usernameKey = buildUsernameLookupKey(resolvedUsername);

  if (!resolvedProfileId || !resolvedUsername) {
    throw new HttpsError(
      "invalid-argument",
      "profileId and username are required.",
    );
  }
  if (!isAlphanumericUsername(resolvedUsername)) {
    throw new HttpsError(
      "invalid-argument",
      "username must contain only letters and numbers.",
    );
  }
  if (isReservedExplicitUsername(resolvedUsername)) {
    throw new HttpsError("invalid-argument", "username is reserved.");
  }

  const firestore = admin.firestore();
  const usersRef = firestore.collection("users");
  const profileRef = usersRef.doc(resolvedProfileId);
  const canonicalIndexRef = firestore
    .collection("usernameIndex")
    .doc(usernameKey);
  const legacyIndexRef =
    usernameKey === resolvedUsername
      ? null
      : firestore.collection("usernameIndex").doc(resolvedUsername);

  let result = {
    status: "taken",
    username: null,
  };
  const nowMs = Date.now();

  await firestore.runTransaction(async (transaction) => {
    const snapshots = await Promise.all([
      transaction.get(profileRef),
      transaction.get(canonicalIndexRef),
      legacyIndexRef ? transaction.get(legacyIndexRef) : Promise.resolve(null),
    ]);
    const profileSnapshot = snapshots[0];
    const canonicalIndexSnapshot = snapshots[1];
    const legacyIndexSnapshot = snapshots[2];

    if (!profileSnapshot.exists) {
      throw new HttpsError("not-found", "profile-not-found");
    }

    const profileData = profileSnapshot.data() || {};
    const currentUsername = toCleanString(profileData.username);
    const currentUsernameKey = buildUsernameLookupKey(currentUsername);
    const hasExplicitCurrentUsername =
      currentUsername !== "" && !isReservedExplicitUsername(currentUsername);

    if (
      rejectIfDifferentExplicitCurrent &&
      hasExplicitCurrentUsername &&
      currentUsername !== resolvedUsername
    ) {
      result = {
        status: "already-has-username",
        username: currentUsername,
      };
      return;
    }

    if (currentUsername === resolvedUsername) {
      transaction.set(
        canonicalIndexRef,
        {
          profileId: resolvedProfileId,
          username: resolvedUsername,
          lookupKey: usernameKey,
          updatedAtMs: nowMs,
        },
        { merge: true },
      );
      transaction.set(
        profileRef,
        {
          [USERNAME_LOOKUP_KEY_FIELD]: usernameKey,
        },
        { merge: true },
      );

      if (legacyIndexRef && legacyIndexSnapshot && legacyIndexSnapshot.exists) {
        const legacyData = legacyIndexSnapshot.data() || {};
        if (toCleanString(legacyData.profileId) === resolvedProfileId) {
          transaction.delete(legacyIndexRef);
        }
      }

      result = {
        status: unchangedStatus,
        username: resolvedUsername,
      };
      return;
    }

    let takenByDifferentProfile = false;
    const staleIndexRefPaths = new Set();

    const evaluateIndexOwnership = async (indexSnapshot, indexRef) => {
      if (!indexSnapshot || !indexSnapshot.exists) {
        return;
      }
      const indexData = indexSnapshot.data() || {};
      const indexedProfileId = toCleanString(indexData.profileId);
      if (!indexedProfileId || indexedProfileId === resolvedProfileId) {
        return;
      }
      const indexedProfileSnapshot = await transaction.get(
        usersRef.doc(indexedProfileId),
      );
      if (!indexedProfileSnapshot.exists) {
        return;
      }
      const indexedProfileData = indexedProfileSnapshot.data() || {};
      if (
        isUsernameOwnedByProfileForKey(
          indexedProfileData.username,
          indexedProfileId,
          usernameKey,
        )
      ) {
        takenByDifferentProfile = true;
        return;
      }

      const indexedUsername = toCleanString(indexedProfileData.username);
      if (!indexedUsername) {
        staleIndexRefPaths.add(indexRef.path);
      }
    };

    await evaluateIndexOwnership(canonicalIndexSnapshot, canonicalIndexRef);
    if (!takenByDifferentProfile && legacyIndexRef) {
      await evaluateIndexOwnership(legacyIndexSnapshot, legacyIndexRef);
    }

    if (!takenByDifferentProfile) {
      const lookupKeySnapshot = await transaction.get(
        usersRef.where(USERNAME_LOOKUP_KEY_FIELD, "==", usernameKey),
      );
      if (!lookupKeySnapshot.empty) {
        lookupKeySnapshot.docs.forEach((doc) => {
          if (takenByDifferentProfile || doc.id === resolvedProfileId) {
            return;
          }
          const docUsernameKey = buildUsernameLookupKey(
            (doc.data() || {}).username,
          );
          if (docUsernameKey === usernameKey) {
            takenByDifferentProfile = true;
          }
        });
      }
    }

    if (!takenByDifferentProfile) {
      const exactMatchSnapshot = await transaction.get(
        usersRef.where("username", "==", resolvedUsername).limit(2),
      );
      if (exactMatchSnapshot.size > 1) {
        takenByDifferentProfile = true;
      } else if (!exactMatchSnapshot.empty) {
        const doc = exactMatchSnapshot.docs[0];
        if (doc.id !== resolvedProfileId) {
          takenByDifferentProfile = true;
        }
      }
    }

    if (!takenByDifferentProfile && usernameKey !== resolvedUsername) {
      const lowercaseMatchSnapshot = await transaction.get(
        usersRef.where("username", "==", usernameKey).limit(2),
      );
      if (lowercaseMatchSnapshot.size > 1) {
        takenByDifferentProfile = true;
      } else if (!lowercaseMatchSnapshot.empty) {
        const doc = lowercaseMatchSnapshot.docs[0];
        if (doc.id !== resolvedProfileId) {
          takenByDifferentProfile = true;
        }
      }
    }

    if (takenByDifferentProfile) {
      result = {
        status: "taken",
        username: null,
      };
      return;
    }

    const refsToDelete = [];
    if (
      currentUsername &&
      currentUsernameKey &&
      currentUsernameKey !== usernameKey &&
      isSafeFirestoreDocIdSegment(currentUsernameKey)
    ) {
      refsToDelete.push(
        firestore.collection("usernameIndex").doc(currentUsernameKey),
      );
    }
    if (
      currentUsername &&
      currentUsername !== currentUsernameKey &&
      currentUsername !== resolvedUsername &&
      isSafeFirestoreDocIdSegment(currentUsername)
    ) {
      refsToDelete.push(
        firestore.collection("usernameIndex").doc(currentUsername),
      );
    }
    if (legacyIndexRef) {
      refsToDelete.push(legacyIndexRef);
    }

    const uniqueDeleteRefs = new Map();
    refsToDelete.forEach((ref) => {
      uniqueDeleteRefs.set(ref.path, ref);
    });
    staleIndexRefPaths.forEach((path) => {
      uniqueDeleteRefs.set(path, firestore.doc(path));
    });

    const deleteRefs = Array.from(uniqueDeleteRefs.values());
    const deleteSnapshots =
      deleteRefs.length > 0
        ? await Promise.all(deleteRefs.map((ref) => transaction.get(ref)))
        : [];
    deleteSnapshots.forEach((snapshot, index) => {
      const ref = deleteRefs[index];
      if (!snapshot.exists) {
        return;
      }
      if (staleIndexRefPaths.has(ref.path)) {
        transaction.delete(ref);
        return;
      }
      const data = snapshot.data() || {};
      if (toCleanString(data.profileId) === resolvedProfileId) {
        transaction.delete(ref);
      }
    });

    transaction.set(
      canonicalIndexRef,
      {
        profileId: resolvedProfileId,
        username: resolvedUsername,
        lookupKey: usernameKey,
        updatedAtMs: nowMs,
      },
      { merge: true },
    );
    transaction.update(profileRef, {
      username: resolvedUsername,
      [USERNAME_LOOKUP_KEY_FIELD]: usernameKey,
    });

    result = {
      status: "claimed",
      username: resolvedUsername,
    };
  });

  return result;
};

const claimUsernameForProfile = async ({ profileId, username }) => {
  return claimOrSetUsernameForProfile({
    profileId,
    username,
    rejectIfDifferentExplicitCurrent: true,
    unchangedStatus: "claimed",
  });
};

const assignRandomUsernameIfNeededForWalletlessProfile = async ({
  profileId,
  maxAttempts = AUTO_NAME_MAX_ATTEMPTS,
  preferredUsername = null,
}) => {
  const resolvedProfileId = toCleanString(profileId);
  if (!resolvedProfileId) {
    throw new HttpsError("invalid-argument", "profileId is required.");
  }

  const firestore = admin.firestore();
  const profileRef = firestore.collection("users").doc(resolvedProfileId);
  const profileSnapshot = await profileRef.get();
  if (!profileSnapshot.exists) {
    throw new HttpsError("not-found", "profile-not-found");
  }

  const profileData = profileSnapshot.data() || {};
  const currentUsername = toCleanString(profileData.username);
  const hasExplicitUsername =
    currentUsername !== "" && !isReservedExplicitUsername(currentUsername);
  const hasEth = toCleanString(profileData.eth) !== "";
  const hasSol = toCleanString(profileData.sol) !== "";
  if (hasExplicitUsername || hasEth || hasSol) {
    return profileSnapshot;
  }

  const attemptLimit =
    Number.isInteger(maxAttempts) && maxAttempts > 0
      ? maxAttempts
      : AUTO_NAME_MAX_ATTEMPTS;
  const cleanedPreferredUsername = toCleanString(preferredUsername);
  const shouldTryPreferredUsername =
    isAlphanumericUsername(cleanedPreferredUsername) &&
    !isReservedExplicitUsername(cleanedPreferredUsername);
  const totalAttempts = attemptLimit + (shouldTryPreferredUsername ? 1 : 0);

  for (let attempt = 0; attempt < totalAttempts; attempt += 1) {
    const candidate =
      attempt === 0 && shouldTryPreferredUsername
        ? cleanedPreferredUsername
        : buildRandomAutoUsername();
    const claimResult = await claimUsernameForProfile({
      profileId: resolvedProfileId,
      username: candidate,
    });
    if (
      claimResult.status === "claimed" ||
      claimResult.status === "already-has-username"
    ) {
      const refreshedSnapshot = await profileRef.get();
      if (!refreshedSnapshot.exists) {
        throw new HttpsError(
          "internal",
          "profile-missing-after-username-claim",
        );
      }
      return refreshedSnapshot;
    }
  }

  throw new HttpsError("aborted", "username-generation-exhausted");
};

const setExplicitUsernameForProfile = async ({ profileId, username }) => {
  return claimOrSetUsernameForProfile({
    profileId,
    username,
    rejectIfDifferentExplicitCurrent: false,
    unchangedStatus: "unchanged",
  });
};

const clearUsernameForProfile = async ({ profileId }) => {
  const resolvedProfileId = toCleanString(profileId);
  if (!resolvedProfileId) {
    throw new HttpsError("invalid-argument", "profileId is required.");
  }

  const firestore = admin.firestore();
  const profileRef = firestore.collection("users").doc(resolvedProfileId);
  let result = {
    status: "cleared",
  };

  await firestore.runTransaction(async (transaction) => {
    const profileSnapshot = await transaction.get(profileRef);
    if (!profileSnapshot.exists) {
      throw new HttpsError("not-found", "profile-not-found");
    }

    const profileData = profileSnapshot.data() || {};
    const currentUsername = toCleanString(profileData.username);
    const currentLookupKey = toCleanString(
      profileData[USERNAME_LOOKUP_KEY_FIELD],
    );
    if (currentUsername === "") {
      if (currentLookupKey) {
        transaction.update(profileRef, {
          [USERNAME_LOOKUP_KEY_FIELD]: admin.firestore.FieldValue.delete(),
        });
        result = {
          status: "cleared",
        };
        return;
      }
      result = {
        status: "unchanged",
      };
      return;
    }

    const refsToDelete = getUsernameIndexDocIds(currentUsername).map((docId) =>
      firestore.collection("usernameIndex").doc(docId),
    );
    const deleteSnapshots =
      refsToDelete.length > 0
        ? await Promise.all(refsToDelete.map((ref) => transaction.get(ref)))
        : [];
    deleteSnapshots.forEach((snapshot, index) => {
      if (!snapshot.exists) {
        return;
      }
      const data = snapshot.data() || {};
      if (toCleanString(data.profileId) === resolvedProfileId) {
        transaction.delete(refsToDelete[index]);
      }
    });

    transaction.update(profileRef, {
      username: "",
      [USERNAME_LOOKUP_KEY_FIELD]: admin.firestore.FieldValue.delete(),
    });
    result = {
      status: "cleared",
    };
  });

  return result;
};

module.exports = {
  AUTO_NAME_MAX_ATTEMPTS,
  buildUsernameLookupKey,
  isAlphanumericUsername,
  isReservedExplicitUsername,
  buildRandomAutoUsername,
  claimUsernameForProfile,
  assignRandomUsernameIfNeededForWalletlessProfile,
  setExplicitUsernameForProfile,
  clearUsernameForProfile,
};
