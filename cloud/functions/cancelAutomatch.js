const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const {
  markCanceledAutomatchBotMessage,
  getProfileByLoginId,
} = require("./utils");

const normalizeString = (value) =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : "";

const toFiniteTimestamp = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.floor(value);
  }
  if (
    typeof value === "string" &&
    value !== "" &&
    Number.isFinite(Number(value))
  ) {
    return Math.floor(Number(value));
  }
  return 0;
};

const getQueuedInviteCandidatesFromSnapshot = (snapshot) => {
  if (!snapshot || !snapshot.exists()) {
    return [];
  }
  const value = snapshot.val();
  if (!value || typeof value !== "object") {
    return [];
  }
  return Object.entries(value)
    .reduce((acc, [inviteId, data]) => {
      if (!inviteId || typeof inviteId !== "string") {
        return acc;
      }
      const payload = data && typeof data === "object" ? data : {};
      acc.push({
        inviteId,
        uid: normalizeString(payload.uid),
        profileId: normalizeString(payload.profileId),
        timestamp: toFiniteTimestamp(payload.timestamp),
      });
      return acc;
    }, [])
    .sort((a, b) => b.timestamp - a.timestamp);
};

async function resolveProfileIdForRequester(uid, tokenProfileId) {
  try {
    const snapshot = await admin
      .database()
      .ref(`players/${uid}/profile`)
      .once("value");
    const linkedProfileId = normalizeString(snapshot.val());
    if (linkedProfileId) {
      return linkedProfileId;
    }
  } catch (error) {
    console.error("auto:cancel:profile-resolve:error", {
      uid,
      error: error && error.message ? error.message : error,
    });
  }
  try {
    const profile = await getProfileByLoginId(uid);
    const profileId = normalizeString(profile && profile.profileId);
    if (profileId) {
      return profileId;
    }
  } catch (error) {
    console.error("auto:cancel:profile-resolve:firestore:error", {
      uid,
      error: error && error.message ? error.message : error,
    });
  }
  const tokenValue = normalizeString(tokenProfileId);
  if (tokenValue) {
    return tokenValue;
  }
  return "";
}

async function inviteHostMatchesProfile(inviteId, profileId) {
  const normalizedInviteId = normalizeString(inviteId);
  const normalizedProfileId = normalizeString(profileId);
  if (!normalizedInviteId || !normalizedProfileId) {
    return false;
  }
  try {
    const inviteSnapshot = await admin
      .database()
      .ref(`invites/${normalizedInviteId}`)
      .once("value");
    if (!inviteSnapshot.exists()) {
      return false;
    }
    const inviteData = inviteSnapshot.val();
    const hostUid = normalizeString(inviteData && inviteData.hostId);
    if (!hostUid) {
      return false;
    }
    const hostProfileSnapshot = await admin
      .database()
      .ref(`players/${hostUid}/profile`)
      .once("value");
    const hostProfileId = normalizeString(hostProfileSnapshot.val());
    return hostProfileId !== "" && hostProfileId === normalizedProfileId;
  } catch (error) {
    console.error("auto:cancel:invite-host-profile-check:error", {
      inviteId: normalizedInviteId,
      error: error && error.message ? error.message : error,
    });
    return false;
  }
}

async function resolveQueuedAutomatchInviteId(uid, profileId) {
  const normalizedUid = normalizeString(uid);
  const normalizedProfileId = normalizeString(profileId);

  const userAutomatchQuery = admin
    .database()
    .ref("automatch")
    .orderByChild("uid")
    .equalTo(normalizedUid);
  const byUidSnapshot = await userAutomatchQuery.once("value");
  const byUidCandidates = getQueuedInviteCandidatesFromSnapshot(byUidSnapshot);
  if (byUidCandidates.length > 0) {
    return { inviteId: byUidCandidates[0].inviteId, lookup: "uid" };
  }

  if (!normalizedProfileId) {
    return { inviteId: null, lookup: "uid" };
  }

  const profileAutomatchQuery = admin
    .database()
    .ref("automatch")
    .orderByChild("profileId")
    .equalTo(normalizedProfileId);
  const byProfileSnapshot = await profileAutomatchQuery.once("value");
  const byProfileCandidates =
    getQueuedInviteCandidatesFromSnapshot(byProfileSnapshot);
  for (const candidate of byProfileCandidates) {
    if (
      await inviteHostMatchesProfile(candidate.inviteId, normalizedProfileId)
    ) {
      return { inviteId: candidate.inviteId, lookup: "profileId" };
    }
  }
  return {
    inviteId: null,
    lookup:
      byProfileCandidates.length > 0 ? "profileId-unverified" : "profileId",
  };
}

exports.cancelAutomatch = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "The function must be called while authenticated.",
    );
  }

  const uid = request.auth.uid;
  const profileId = await resolveProfileIdForRequester(
    uid,
    request.auth.token && request.auth.token.profileId,
  );
  console.log("auto:cancel:start", { uid, hasProfileId: !!profileId });

  const queuedInvite = await resolveQueuedAutomatchInviteId(uid, profileId);
  if (!queuedInvite.inviteId) {
    console.log("auto:cancel:snapshot", {
      exists: false,
      lookup: queuedInvite.lookup,
    });
    return { ok: false };
  }

  const inviteId = queuedInvite.inviteId;
  console.log("auto:cancel:inviteId", {
    inviteId,
    lookup: queuedInvite.lookup,
  });

  const guestIdRef = admin.database().ref(`invites/${inviteId}/guestId`);
  const guestIdSnapshot = await guestIdRef.once("value");
  const guestId = guestIdSnapshot.val();
  console.log("auto:cancel:guestCheck", { inviteId, guestId: !!guestId });
  if (guestId) {
    return { ok: false };
  }

  try {
    const updates = {};
    updates[`automatch/${inviteId}`] = null;
    updates[`invites/${inviteId}/automatchStateHint`] = "canceled";
    updates[`invites/${inviteId}/automatchCanceledAt`] =
      admin.database.ServerValue.TIMESTAMP;
    await admin.database().ref().update(updates);
    console.log("auto:cancel:db:ok", { inviteId });
  } catch (e) {
    console.error("auto:cancel:db:error", {
      inviteId,
      error: e && e.message ? e.message : e,
    });
    return { ok: false };
  }

  const guestIdSnapshotAfter = await guestIdRef.once("value");
  const guestIdAfter = guestIdSnapshotAfter.val();
  console.log("auto:cancel:guestRecheck", {
    inviteId,
    guestId: !!guestIdAfter,
  });
  if (guestIdAfter) {
    const matchedUpdates = {};
    matchedUpdates[`invites/${inviteId}/automatchStateHint`] = "matched";
    matchedUpdates[`invites/${inviteId}/automatchCanceledAt`] = null;
    await admin.database().ref().update(matchedUpdates);
    return { ok: false };
  }

  try {
    console.log("auto:cancel:markMessage", { inviteId });
    await markCanceledAutomatchBotMessage(inviteId);
  } catch (e) {
    console.error("auto:cancel:markMessage:error", {
      inviteId,
      error: e && e.message ? e.message : e,
    });
  }

  return { ok: true };
});
