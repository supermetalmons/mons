const admin = require("firebase-admin");
const { onValueCreated, onValueWritten } = require("firebase-functions/v2/database");

const SORT_BUCKETS = {
  active: 20,
  pending: 30,
  waiting: 40,
  ended: 50,
};

const PROFILE_LINK_CATCHUP_MAX_INVITES = 300;
const PROFILE_LINK_CATCHUP_CONCURRENCY = 20;
const PROFILE_LINK_CATCHUP_TIMEOUT_MS = 50000;

const PROJECTOR_SCHEMA_VERSION = 2;

const loginToProfileCache = new Map();
const profileSummaryCache = new Map();

const normalizeString = (value) => (typeof value === "string" && value.trim() !== "" ? value.trim() : null);

const toTimestamp = (millis) => {
  const normalized = Number.isFinite(millis) ? Math.floor(Number(millis)) : Date.now();
  return admin.firestore.Timestamp.fromMillis(Math.max(1, normalized));
};

const readTimestampMillis = (value) => {
  if (!value) {
    return null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.floor(value);
  }
  if (typeof value.toMillis === "function") {
    try {
      const millis = value.toMillis();
      return Number.isFinite(millis) ? Math.floor(millis) : null;
    } catch {
      return null;
    }
  }
  if (typeof value === "object" && Number.isFinite(value._seconds)) {
    const nanos = Number.isFinite(value._nanoseconds) ? Number(value._nanoseconds) : 0;
    return Math.floor(Number(value._seconds) * 1000 + nanos / 1e6);
  }
  return null;
};

const parseRematchIndices = (rawValue) => {
  if (typeof rawValue !== "string" || rawValue === "") {
    return [];
  }
  const normalized = rawValue.replace(/x+$/, "");
  if (normalized === "") {
    return [];
  }
  return normalized
    .split(";")
    .map((token) => Number.parseInt(token, 10))
    .filter((value) => Number.isFinite(value) && value > 0);
};

const rematchSeriesEnded = (inviteData) => {
  if (!inviteData || typeof inviteData !== "object") {
    return false;
  }
  const hostRematches = typeof inviteData.hostRematches === "string" ? inviteData.hostRematches : "";
  const guestRematches = typeof inviteData.guestRematches === "string" ? inviteData.guestRematches : "";
  return hostRematches.endsWith("x") || guestRematches.endsWith("x");
};

const truncateAddress = (address) => {
  if (typeof address !== "string" || address.length < 8) {
    return "anon";
  }
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
};

const getProfileDisplayName = (profileData) => {
  if (!profileData || typeof profileData !== "object") {
    return "anon";
  }
  if (typeof profileData.username === "string" && profileData.username.trim() !== "") {
    return profileData.username.trim();
  }
  if (typeof profileData.eth === "string" && profileData.eth.trim() !== "") {
    return truncateAddress(profileData.eth.trim());
  }
  if (typeof profileData.sol === "string" && profileData.sol.trim() !== "") {
    return truncateAddress(profileData.sol.trim());
  }
  return "anon";
};

const getProfileEmoji = (profileData) => {
  if (!profileData || typeof profileData !== "object") {
    return null;
  }
  const customEmoji = profileData.custom && typeof profileData.custom === "object" ? profileData.custom.emoji : undefined;
  const fallbackEmoji = profileData.emoji;
  const source = customEmoji !== undefined ? customEmoji : fallbackEmoji;
  if (typeof source === "number" && Number.isFinite(source)) {
    return Math.floor(source);
  }
  if (typeof source === "string" && source.trim() !== "") {
    const parsed = Number(source);
    if (Number.isFinite(parsed)) {
      return Math.floor(parsed);
    }
  }
  return null;
};

const createInviteCandidatesFromMatchId = (matchId) => {
  const candidates = [];
  for (let splitIndex = matchId.length - 1; splitIndex > 0; splitIndex -= 1) {
    const suffix = matchId.slice(splitIndex);
    if (!/^\d+$/.test(suffix)) {
      continue;
    }
    const prefix = matchId.slice(0, splitIndex);
    if (!candidates.includes(prefix)) {
      candidates.push(prefix);
    }
  }
  return candidates;
};

const readInviteExists = async (inviteId, inviteExistenceCache) => {
  if (!inviteId) {
    return false;
  }
  if (inviteExistenceCache && inviteExistenceCache.has(inviteId)) {
    const cached = inviteExistenceCache.get(inviteId);
    if (typeof cached === "boolean") {
      return cached;
    }
    return await cached;
  }
  const promise = admin
    .database()
    .ref(`invites/${inviteId}`)
    .once("value")
    .then((snapshot) => snapshot.exists())
    .catch((error) => {
      console.error("projector:invite-exists-read-failed", { inviteId, error: error && error.message ? error.message : error });
      return false;
    });
  if (inviteExistenceCache) {
    inviteExistenceCache.set(inviteId, promise);
  }
  const exists = await promise;
  if (inviteExistenceCache) {
    inviteExistenceCache.set(inviteId, exists);
  }
  return exists;
};

async function resolveInviteIdFromMatchId(matchId, options = {}) {
  const normalizedMatchId = normalizeString(matchId);
  if (!normalizedMatchId) {
    return null;
  }

  const inviteExistenceCache = options.inviteExistenceCache;

  if (await readInviteExists(normalizedMatchId, inviteExistenceCache)) {
    return normalizedMatchId;
  }

  const candidates = createInviteCandidatesFromMatchId(normalizedMatchId);
  if (candidates.length === 0) {
    return null;
  }

  const existingCandidates = [];
  for (const candidate of candidates) {
    if (await readInviteExists(candidate, inviteExistenceCache)) {
      existingCandidates.push(candidate);
    }
  }

  if (existingCandidates.length === 0) {
    return null;
  }

  if (existingCandidates.length > 1) {
    console.log("projector:match-resolver:multiple-candidates", {
      matchId: normalizedMatchId,
      candidates: existingCandidates,
      resolution: "rejected-ambiguous",
    });
    return null;
  }

  return existingCandidates[0];
}

const getHintMatchIndex = (inviteId, latestMatchIdHint) => {
  const normalizedInviteId = normalizeString(inviteId);
  const normalizedHint = normalizeString(latestMatchIdHint);
  if (!normalizedInviteId || !normalizedHint || !normalizedHint.startsWith(normalizedInviteId)) {
    return 0;
  }
  const suffix = normalizedHint.slice(normalizedInviteId.length);
  if (suffix === "") {
    return 0;
  }
  if (!/^\d+$/.test(suffix)) {
    return 0;
  }
  const parsed = Number.parseInt(suffix, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const deriveLatestMatchId = (inviteId, inviteData, latestMatchIdHint) => {
  const hostIndices = parseRematchIndices(inviteData ? inviteData.hostRematches : null);
  const guestIndices = parseRematchIndices(inviteData ? inviteData.guestRematches : null);

  let maxIndex = 0;
  hostIndices.forEach((index) => {
    if (index > maxIndex) {
      maxIndex = index;
    }
  });
  guestIndices.forEach((index) => {
    if (index > maxIndex) {
      maxIndex = index;
    }
  });

  const hintedIndex = getHintMatchIndex(inviteId, latestMatchIdHint);
  if (hintedIndex > maxIndex) {
    maxIndex = hintedIndex;
  }

  return maxIndex > 0 ? `${inviteId}${maxIndex}` : inviteId;
};

const getAutomatchStateHint = (inviteId, inviteData, automatchData) => {
  if (!inviteId.startsWith("auto_")) {
    return null;
  }
  if (automatchData) {
    return "pending";
  }
  if (normalizeString(inviteData ? inviteData.guestId : null)) {
    return "matched";
  }
  const marker = normalizeString(inviteData ? inviteData.automatchStateHint : null);
  if (marker === "pending" || marker === "matched" || marker === "canceled") {
    return marker;
  }
  const canceledAt = inviteData ? inviteData.automatchCanceledAt : null;
  if (typeof canceledAt === "number" && Number.isFinite(canceledAt) && canceledAt > 0) {
    return "canceled";
  }
  return "canceled";
};

const deriveProjectionStatus = ({ inviteId, inviteData, automatchStateHint }) => {
  if (rematchSeriesEnded(inviteData)) {
    return "ended";
  }
  const hasGuest = !!normalizeString(inviteData ? inviteData.guestId : null);
  if (inviteId.startsWith("auto_") && automatchStateHint === "pending") {
    return "pending";
  }
  if (hasGuest) {
    return "active";
  }
  return "waiting";
};

const getSortBucket = (status) => {
  if (status === "active") {
    return SORT_BUCKETS.active;
  }
  if (status === "pending") {
    return SORT_BUCKETS.pending;
  }
  if (status === "ended") {
    return SORT_BUCKETS.ended;
  }
  return SORT_BUCKETS.waiting;
};

const shouldProjectInvite = ({ inviteId, inviteData, automatchStateHint }) => {
  if (!inviteData || typeof inviteData !== "object") {
    return false;
  }
  if (!inviteId.startsWith("auto_")) {
    return true;
  }
  const hasGuest = !!normalizeString(inviteData.guestId);
  if (hasGuest) {
    return true;
  }
  return automatchStateHint === "pending";
};

const fingerprintForProjection = (payload) => {
  return JSON.stringify(payload);
};

const pickListSortMillis = ({ options, status, automatchData, nowMs, existingListSortMs }) => {
  let nextSortMillis = Number.isFinite(options.listSortAtMs) ? Math.floor(options.listSortAtMs) : nowMs;

  if (!Number.isFinite(options.listSortAtMs) && status === "pending") {
    const queueTimestamp = automatchData && Number.isFinite(automatchData.timestamp) ? Math.floor(automatchData.timestamp) : null;
    if (queueTimestamp && queueTimestamp > 0) {
      nextSortMillis = queueTimestamp;
    }
  }

  if (options.preserveNewerListSortAt !== false && Number.isFinite(existingListSortMs)) {
    nextSortMillis = Math.max(nextSortMillis, existingListSortMs);
  }

  return nextSortMillis;
};

async function resolveProfileIdForLogin(loginUid) {
  const normalizedLoginUid = normalizeString(loginUid);
  if (!normalizedLoginUid) {
    return null;
  }

  if (loginToProfileCache.has(normalizedLoginUid)) {
    const cachedProfileId = loginToProfileCache.get(normalizedLoginUid);
    if (cachedProfileId) {
      return cachedProfileId;
    }
    loginToProfileCache.delete(normalizedLoginUid);
  }

  let profileId = null;

  try {
    const profileSnapshot = await admin.database().ref(`players/${normalizedLoginUid}/profile`).once("value");
    const profileValue = normalizeString(profileSnapshot.val());
    if (profileValue) {
      profileId = profileValue;
    }
  } catch (error) {
    console.error("projector:profile-resolve:rtdb-read-failed", {
      loginUid: normalizedLoginUid,
      error: error && error.message ? error.message : error,
    });
  }

  if (!profileId) {
    try {
      const usersSnapshot = await admin.firestore().collection("users").where("logins", "array-contains", normalizedLoginUid).limit(1).get();
      if (!usersSnapshot.empty) {
        profileId = usersSnapshot.docs[0].id;
      }
    } catch (error) {
      console.error("projector:profile-resolve:firestore-read-failed", {
        loginUid: normalizedLoginUid,
        error: error && error.message ? error.message : error,
      });
    }
  }

  if (profileId) {
    loginToProfileCache.set(normalizedLoginUid, profileId);
  }
  return profileId;
}

async function readProfileSummary(profileId) {
  const normalizedProfileId = normalizeString(profileId);
  if (!normalizedProfileId) {
    return null;
  }
  if (profileSummaryCache.has(normalizedProfileId)) {
    return profileSummaryCache.get(normalizedProfileId);
  }

  let summary = null;
  try {
    const profileDoc = await admin.firestore().collection("users").doc(normalizedProfileId).get();
    if (profileDoc.exists) {
      const profileData = profileDoc.data() || {};
      summary = {
        name: getProfileDisplayName(profileData),
        emoji: getProfileEmoji(profileData),
      };
    }
  } catch (error) {
    console.error("projector:profile-summary-read-failed", {
      profileId: normalizedProfileId,
      error: error && error.message ? error.message : error,
    });
  }

  profileSummaryCache.set(normalizedProfileId, summary);
  return summary;
}

const getOwnerProfileIds = (hostProfileId, guestProfileId) => {
  const owners = [];
  if (hostProfileId) {
    owners.push(hostProfileId);
  }
  if (guestProfileId && guestProfileId !== hostProfileId) {
    owners.push(guestProfileId);
  }
  return owners;
};

const getOwnerContext = ({ ownerProfileId, hostProfileId, guestProfileId, hostLoginId, guestLoginId }) => {
  if (ownerProfileId === hostProfileId) {
    return {
      ownerRole: "host",
      ownerLoginId: hostLoginId || null,
      opponentProfileId: guestProfileId || null,
      opponentLoginId: guestLoginId || null,
    };
  }
  return {
    ownerRole: "guest",
    ownerLoginId: guestLoginId || null,
    opponentProfileId: hostProfileId || null,
    opponentLoginId: hostLoginId || null,
  };
};

const readEventTimestampMs = (options) => {
  if (options && Number.isFinite(options.eventTimestampMs)) {
    return Math.floor(options.eventTimestampMs);
  }
  return Date.now();
};

async function recomputeInviteProjection(inviteId, reason, options = {}) {
  const normalizedInviteId = normalizeString(inviteId);
  if (!normalizedInviteId) {
    return {
      ok: false,
      inviteId: inviteId || null,
      reason,
      skipped: true,
      skipReason: "invalid-invite-id",
    };
  }

  const nowMs = readEventTimestampMs(options);
  const db = admin.database();
  const firestore = admin.firestore();

  const [inviteSnapshot, automatchSnapshot] = await Promise.all([
    db.ref(`invites/${normalizedInviteId}`).once("value"),
    db.ref(`automatch/${normalizedInviteId}`).once("value"),
  ]);

  const inviteData = inviteSnapshot.exists() ? inviteSnapshot.val() : null;
  const automatchData = automatchSnapshot.exists() ? automatchSnapshot.val() : null;

  const hostLoginId = normalizeString(inviteData ? inviteData.hostId : null);
  const guestLoginId = normalizeString(inviteData ? inviteData.guestId : null);

  const [hostProfileId, guestProfileId] = await Promise.all([resolveProfileIdForLogin(hostLoginId), resolveProfileIdForLogin(guestLoginId)]);

  const ownerProfileIds = getOwnerProfileIds(hostProfileId, guestProfileId);

  const automatchStateHint = getAutomatchStateHint(normalizedInviteId, inviteData, automatchData);
  const status = deriveProjectionStatus({ inviteId: normalizedInviteId, inviteData, automatchStateHint });
  const shouldProject = shouldProjectInvite({ inviteId: normalizedInviteId, inviteData, automatchStateHint });
  const sortBucket = getSortBucket(status);
  const latestMatchId = deriveLatestMatchId(normalizedInviteId, inviteData, options.latestMatchIdHint || null);

  const existingDocsByOwnerProfileId = new Map();
  const existingDocs = [];
  await Promise.all(
    ownerProfileIds.map(async (ownerProfileId) => {
      try {
        const ownerDocSnapshot = await firestore.collection("users").doc(ownerProfileId).collection("games").doc(normalizedInviteId).get();
        if (!ownerDocSnapshot.exists) {
          return;
        }
        existingDocsByOwnerProfileId.set(ownerProfileId, ownerDocSnapshot);
        existingDocs.push({ ownerProfileId, docSnapshot: ownerDocSnapshot });
      } catch (error) {
        console.error("projector:existing-doc-read-failed", {
          inviteId: normalizedInviteId,
          ownerProfileId,
          reason,
          error: error && error.message ? error.message : error,
        });
      }
    })
  );

  const ownerSet = new Set(ownerProfileIds);
  const canPruneOwners = (!hostLoginId || !!hostProfileId) && (!guestLoginId || !!guestProfileId);
  const batch = firestore.batch();

  let setCount = 0;
  let deleteCount = 0;
  let skippedCount = 0;

  for (const existing of existingDocs) {
    if (!shouldProject || (canPruneOwners && !ownerSet.has(existing.ownerProfileId))) {
      batch.delete(existing.docSnapshot.ref);
      deleteCount += 1;
    }
  }

  if (!shouldProject || ownerProfileIds.length === 0) {
    if (!options.dryRun && deleteCount > 0) {
      await batch.commit();
    }
    return {
      ok: true,
      inviteId: normalizedInviteId,
      reason,
      shouldProject,
      ownerProfileIds,
      canPruneOwners,
      writes: 0,
      deletes: deleteCount,
      skipped: 0,
      dryRun: options.dryRun === true,
    };
  }

  const commonProjection = {
    schemaVersion: PROJECTOR_SCHEMA_VERSION,
    projectorVersion: PROJECTOR_SCHEMA_VERSION,
    source: "rtdb-projector",
    entityType: "game",
    inviteId: normalizedInviteId,
    kind: normalizedInviteId.startsWith("auto_") ? "auto" : "direct",
    hostLoginId,
    guestLoginId,
    hostProfileId,
    guestProfileId,
    status,
    sortBucket,
    isPendingAutomatch: status === "pending",
    automatchStateHint,
    automatchCanceledAt: typeof (inviteData && inviteData.automatchCanceledAt) === "number" ? inviteData.automatchCanceledAt : null,
    latestMatchId,
  };

  for (const ownerProfileId of ownerProfileIds) {
    const ownerContext = getOwnerContext({
      ownerProfileId,
      hostProfileId,
      guestProfileId,
      hostLoginId,
      guestLoginId,
    });
    const opponentSummary = ownerContext.opponentProfileId ? await readProfileSummary(ownerContext.opponentProfileId) : null;

    const ownerDocRef = firestore.collection("users").doc(ownerProfileId).collection("games").doc(normalizedInviteId);
    const existingDocSnapshot = existingDocsByOwnerProfileId.get(ownerProfileId);
    const existingDocData = existingDocSnapshot ? existingDocSnapshot.data() : null;

    const projectionFingerprintPayload = {
      schemaVersion: PROJECTOR_SCHEMA_VERSION,
      inviteId: normalizedInviteId,
      ownerProfileId,
      kind: commonProjection.kind,
      hostLoginId,
      guestLoginId,
      hostProfileId,
      guestProfileId,
      status,
      sortBucket,
      isPendingAutomatch: commonProjection.isPendingAutomatch,
      automatchStateHint,
      automatchCanceledAt: commonProjection.automatchCanceledAt,
      latestMatchId,
      ownerRole: ownerContext.ownerRole,
      ownerLoginId: ownerContext.ownerLoginId,
      opponentProfileId: ownerContext.opponentProfileId,
      opponentLoginId: ownerContext.opponentLoginId,
      opponentName: opponentSummary ? opponentSummary.name : null,
      opponentEmoji: opponentSummary ? opponentSummary.emoji : null,
    };

    const nextFingerprint = fingerprintForProjection(projectionFingerprintPayload);
    const previousFingerprint = existingDocData && typeof existingDocData.lastEventFingerprint === "string" ? existingDocData.lastEventFingerprint : null;

    if (previousFingerprint && previousFingerprint === nextFingerprint) {
      skippedCount += 1;
      continue;
    }

    const existingListSortMs = existingDocData ? readTimestampMillis(existingDocData.listSortAt) : null;
    const nextListSortMs = pickListSortMillis({
      options,
      status,
      automatchData,
      nowMs,
      existingListSortMs,
    });

    const existingCreatedAt = existingDocData ? existingDocData.createdAt : null;
    const existingEndedAt = existingDocData ? existingDocData.endedAt : null;

    const projectionDocData = {
      ...commonProjection,
      ownerProfileId,
      ownerRole: ownerContext.ownerRole,
      ownerLoginId: ownerContext.ownerLoginId,
      opponentProfileId: ownerContext.opponentProfileId,
      opponentLoginId: ownerContext.opponentLoginId,
      opponentName: opponentSummary ? opponentSummary.name : null,
      opponentDisplayName: opponentSummary ? opponentSummary.name : null,
      opponentEmoji: opponentSummary ? opponentSummary.emoji : null,
      opponentEmojiId: opponentSummary ? opponentSummary.emoji : null,
      listSortAt: toTimestamp(nextListSortMs),
      createdAt: existingCreatedAt || toTimestamp(nowMs),
      updatedAt: toTimestamp(nowMs),
      endedAt: status === "ended" ? existingEndedAt || toTimestamp(nowMs) : null,
      lastEventFingerprint: nextFingerprint,
      lastEventType: normalizeString(reason) || null,
      lastEventReason: normalizeString(reason) || null,
      lastEventAt: toTimestamp(nowMs),
    };

    batch.set(ownerDocRef, projectionDocData, { merge: true });
    setCount += 1;
  }

  if (!options.dryRun && (setCount > 0 || deleteCount > 0)) {
    await batch.commit();
  }

  return {
    ok: true,
    inviteId: normalizedInviteId,
    reason,
    shouldProject,
    ownerProfileIds,
    canPruneOwners,
    writes: setCount,
    deletes: deleteCount,
    skipped: skippedCount,
    dryRun: options.dryRun === true,
  };
}

async function syncAutomatchInviteMarkerFromQueue(inviteId, queueExists) {
  const normalizedInviteId = normalizeString(inviteId);
  if (!normalizedInviteId) {
    return { ok: false, updated: false, reason: "invalid-invite-id" };
  }

  const inviteSnapshot = await admin.database().ref(`invites/${normalizedInviteId}`).once("value");
  if (!inviteSnapshot.exists()) {
    return { ok: true, updated: false, reason: "missing-invite" };
  }

  const inviteData = inviteSnapshot.val() || {};
  const guestId = normalizeString(inviteData.guestId);
  const currentHint = normalizeString(inviteData.automatchStateHint);
  const currentCanceledAt = typeof inviteData.automatchCanceledAt === "number" ? inviteData.automatchCanceledAt : null;

  const nextHint = queueExists ? "pending" : guestId ? "matched" : "canceled";
  const nextCanceledAt = nextHint === "canceled" ? Date.now() : null;

  const canceledAtChanged = nextHint === "canceled" ? currentCanceledAt === null : currentCanceledAt !== null;
  const hintChanged = currentHint !== nextHint;

  if (!hintChanged && !canceledAtChanged) {
    return { ok: true, updated: false, reason: "marker-unchanged" };
  }

  const updates = {};
  updates[`invites/${normalizedInviteId}/automatchStateHint`] = nextHint;
  updates[`invites/${normalizedInviteId}/automatchCanceledAt`] = nextCanceledAt;

  await admin.database().ref().update(updates);

  return {
    ok: true,
    updated: true,
    inviteId: normalizedInviteId,
    automatchStateHint: nextHint,
    automatchCanceledAt: nextCanceledAt,
  };
}

const hasMeaningfulValueChange = (before, after) => {
  if (before === after) {
    return false;
  }
  return true;
};

const processWithConcurrency = async (items, concurrency, worker, shouldContinue) => {
  if (items.length === 0) {
    return;
  }
  let index = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  const runners = Array.from({ length: workerCount }, async () => {
    while (true) {
      if (shouldContinue && !shouldContinue()) {
        return;
      }
      const currentIndex = index;
      index += 1;
      if (currentIndex >= items.length) {
        return;
      }
      await worker(items[currentIndex], currentIndex);
    }
  });
  await Promise.all(runners);
};

const onInviteCreated = onValueCreated("/invites/{inviteId}", async (event) => {
  const inviteId = event.params.inviteId;
  await recomputeInviteProjection(inviteId, "invite-created", {
    eventTimestampMs: Date.now(),
  });
});

const onInviteGuestIdChanged = onValueWritten("/invites/{inviteId}/guestId", async (event) => {
  const before = event.data.before.val();
  const after = event.data.after.val();
  if (!hasMeaningfulValueChange(before, after)) {
    return;
  }
  await recomputeInviteProjection(event.params.inviteId, "invite-guest-id", {
    eventTimestampMs: Date.now(),
  });
});

const onInviteHostRematchesChanged = onValueWritten("/invites/{inviteId}/hostRematches", async (event) => {
  const before = event.data.before.val();
  const after = event.data.after.val();
  if (!hasMeaningfulValueChange(before, after)) {
    return;
  }
  await recomputeInviteProjection(event.params.inviteId, "invite-host-rematches", {
    eventTimestampMs: Date.now(),
  });
});

const onInviteGuestRematchesChanged = onValueWritten("/invites/{inviteId}/guestRematches", async (event) => {
  const before = event.data.before.val();
  const after = event.data.after.val();
  if (!hasMeaningfulValueChange(before, after)) {
    return;
  }
  await recomputeInviteProjection(event.params.inviteId, "invite-guest-rematches", {
    eventTimestampMs: Date.now(),
  });
});

const onMatchCreated = onValueCreated("/players/{loginUid}/matches/{matchId}", async (event) => {
  const matchId = normalizeString(event.params.matchId);
  if (!matchId) {
    return;
  }

  const inviteId = await resolveInviteIdFromMatchId(matchId);
  if (!inviteId) {
    console.log("projector:match-created:invite-unresolved", {
      loginUid: event.params.loginUid,
      matchId,
    });
    return;
  }

  await recomputeInviteProjection(inviteId, "match-created", {
    eventTimestampMs: Date.now(),
    latestMatchIdHint: matchId,
  });
});

const onAutomatchQueueWritten = onValueWritten("/automatch/{inviteId}", async (event) => {
  const inviteId = event.params.inviteId;
  const beforeExists = event.data.before.exists();
  const afterExists = event.data.after.exists();
  const beforeVal = beforeExists ? event.data.before.val() : null;
  const afterVal = afterExists ? event.data.after.val() : null;

  if (beforeExists === afterExists && JSON.stringify(beforeVal) === JSON.stringify(afterVal)) {
    return;
  }

  await syncAutomatchInviteMarkerFromQueue(inviteId, afterExists);
  await recomputeInviteProjection(inviteId, "automatch-queue", {
    eventTimestampMs: Date.now(),
  });
});

const onProfileLinkCreated = onValueCreated("/players/{loginUid}/profile", async (event) => {
  const loginUid = normalizeString(event.params.loginUid);
  const profileId = normalizeString(event.data.val());
  if (!loginUid || !profileId) {
    return;
  }

  const startedAt = Date.now();
  const shouldContinue = () => Date.now() - startedAt < PROFILE_LINK_CATCHUP_TIMEOUT_MS;

  const matchesSnapshot = await admin.database().ref(`players/${loginUid}/matches`).once("value");
  if (!matchesSnapshot.exists()) {
    return;
  }

  const matches = matchesSnapshot.val() || {};
  const matchIds = Object.keys(matches);
  const inviteExistenceCache = new Map();
  const inviteIds = [];
  const inviteSet = new Set();

  for (const matchId of matchIds) {
    if (!shouldContinue()) {
      break;
    }
    if (inviteIds.length >= PROFILE_LINK_CATCHUP_MAX_INVITES) {
      break;
    }
    const inviteId = await resolveInviteIdFromMatchId(matchId, { inviteExistenceCache });
    if (!inviteId || inviteSet.has(inviteId)) {
      continue;
    }
    inviteSet.add(inviteId);
    inviteIds.push(inviteId);
  }

  let processed = 0;
  let failed = 0;

  await processWithConcurrency(
    inviteIds,
    PROFILE_LINK_CATCHUP_CONCURRENCY,
    async (inviteId) => {
      if (!shouldContinue()) {
        return;
      }
      try {
        await recomputeInviteProjection(inviteId, "profile-link-catchup", {
          eventTimestampMs: Date.now(),
          preserveNewerListSortAt: true,
        });
        processed += 1;
      } catch (error) {
        failed += 1;
        console.error("projector:profile-link-catchup:recompute-failed", {
          loginUid,
          profileId,
          inviteId,
          error: error && error.message ? error.message : error,
        });
      }
    },
    shouldContinue
  );

  const didTimeout = !shouldContinue();
  const didHitInviteCap = inviteIds.length >= PROFILE_LINK_CATCHUP_MAX_INVITES;

  console.log("projector:profile-link-catchup:done", {
    loginUid,
    profileId,
    matchIdsScanned: matchIds.length,
    inviteIdsResolved: inviteIds.length,
    processed,
    failed,
    didTimeout,
    didHitInviteCap,
    elapsedMs: Date.now() - startedAt,
  });
});

module.exports = {
  SORT_BUCKETS,
  PROFILE_LINK_CATCHUP_MAX_INVITES,
  PROFILE_LINK_CATCHUP_CONCURRENCY,
  PROFILE_LINK_CATCHUP_TIMEOUT_MS,
  resolveInviteIdFromMatchId,
  resolveProfileIdForLogin,
  recomputeInviteProjection,
  syncAutomatchInviteMarkerFromQueue,
  onInviteCreated,
  onInviteGuestIdChanged,
  onInviteHostRematchesChanged,
  onInviteGuestRematchesChanged,
  onMatchCreated,
  onAutomatchQueueWritten,
  onProfileLinkCreated,
};
