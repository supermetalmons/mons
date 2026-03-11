const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const {
  getProfileByLoginId,
  getDisplayNameFromAddress,
  batchReadWithRetry,
} = require("./utils");
const { resolveMatchWinner } = require("./matchOutcome");

const CONTROLLER_VERSION = 2;
const INITIAL_FEN =
  "0 0 w 0 0 0 0 0 1 n03y0xs0xd0xa0xe0xn03/n11/n11/n04xxmn01xxmn04/n03xxmn01xxmn01xxmn03/xxQn04xxUn04xxQ/n03xxMn01xxMn01xxMn03/n04xxMn01xxMn04/n11/n11/n03E0xA0xD0xS0xY0xn03";
const EVENT_SCHEMA_VERSION = 1;
const EVENT_LOCK_TTL_MS = 30 * 1000;
const EVENT_LOCK_REFRESH_INTERVAL_MS = 10 * 1000;
const EVENT_MATCH_RESOLVE_CONCURRENCY = 12;
const MIN_STARTS_IN_MINUTES = 1;
const MAX_STARTS_IN_MINUTES = 7 * 24 * 60;
const PREFERRED_FIRST_ROUND_BYE_USERNAMES = new Set([
  "obi",
  "meinong",
  "ivan",
  "bosch",
  "monsol",
]);

const normalizeString = (value) =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : "";
const normalizeUsername = (value) => normalizeString(value).toLowerCase();
const getNowMs = () => Date.now();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const toFiniteInteger = (value, fallback = 0) => {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.floor(numeric);
};

const cloneValue = (value) => JSON.parse(JSON.stringify(value));

const buildEventDisplayName = (profile) => {
  return getDisplayNameFromAddress(
    profile.username ?? "",
    profile.eth ?? "",
    profile.sol ?? "",
    0,
    profile.emoji ?? "",
    false,
  );
};

const randomString = (length) => {
  const letters =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < length; i += 1) {
    result += letters.charAt(Math.floor(Math.random() * letters.length));
  }
  return result;
};

const generateEventId = () => randomString(11);
const generateEventInviteId = () => `auto_${randomString(11)}`;
const pickHostColor = () => (Math.random() < 0.5 ? "white" : "black");

const shuffle = (items) => {
  const next = items.slice();
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
};

const getParticipantIds = (event) => {
  const participants =
    event && event.participants && typeof event.participants === "object"
      ? event.participants
      : {};
  return Object.keys(participants).filter(
    (profileId) =>
      participants[profileId] && typeof participants[profileId] === "object",
  );
};

const buildParticipantSnapshot = (profile, loginUid, joinedAtMs) => {
  const username = normalizeString(profile.username);
  const profileId = normalizeString(profile.profileId);
  return {
    profileId,
    loginUid,
    username,
    displayName: buildEventDisplayName(profile),
    emojiId:
      typeof profile.emoji === "number"
        ? Math.floor(profile.emoji)
        : Number(profile.emoji) || 0,
    aura: normalizeString(profile.aura),
    joinedAtMs,
    state: "active",
    eliminatedRoundIndex: null,
    eliminatedByProfileId: null,
  };
};

const ensureIvanCreator = async (uid) => {
  const profile = await getProfileByLoginId(uid);
  const username = normalizeUsername(profile.username);
  const profileId = normalizeString(profile.profileId);
  if (!profileId) {
    throw new HttpsError(
      "failed-precondition",
      "Event creation requires a signed-in profile.",
    );
  }
  if (username !== "ivan") {
    throw new HttpsError(
      "permission-denied",
      "Only ivan can create pilot events.",
    );
  }
  return profile;
};

const ensureNonAnonProfile = async (uid) => {
  const profile = await getProfileByLoginId(uid);
  const profileId = normalizeString(profile.profileId);
  if (!profileId) {
    throw new HttpsError(
      "failed-precondition",
      "Please sign in to join this event.",
    );
  }
  return profile;
};

const pickPreferredFirstRoundBye = (participantsById, participantIds) => {
  const shuffled = shuffle(participantIds);
  const preferred = shuffled.find((profileId) => {
    const participant = participantsById[profileId];
    if (!participant) {
      return false;
    }
    const username = normalizeUsername(participant.username);
    const displayName = normalizeUsername(participant.displayName);
    return (
      PREFERRED_FIRST_ROUND_BYE_USERNAMES.has(username) ||
      PREFERRED_FIRST_ROUND_BYE_USERNAMES.has(displayName)
    );
  });
  if (preferred) {
    return {
      byeProfileId: preferred,
      byeReason: "preferred",
      orderedParticipantIds: shuffled.filter(
        (profileId) => profileId !== preferred,
      ),
    };
  }
  const [randomByeProfileId, ...rest] = shuffled;
  return {
    byeProfileId: randomByeProfileId || null,
    byeReason: randomByeProfileId ? "random" : null,
    orderedParticipantIds: rest,
  };
};

const pickRoundBye = (participantIds, participantsById, isFirstRound) => {
  if (participantIds.length % 2 === 0) {
    return {
      byeProfileId: null,
      byeReason: null,
      orderedParticipantIds: shuffle(participantIds),
    };
  }

  if (isFirstRound) {
    return pickPreferredFirstRoundBye(participantsById, participantIds);
  }

  const shuffled = shuffle(participantIds);
  const [byeProfileId, ...rest] = shuffled;
  return {
    byeProfileId: byeProfileId || null,
    byeReason: byeProfileId ? "random" : null,
    orderedParticipantIds: rest,
  };
};

const createMatchRecord = (color, emojiId, aura) => ({
  version: CONTROLLER_VERSION,
  color,
  emojiId,
  aura: aura || null,
  fen: INITIAL_FEN,
  status: "",
  flatMovesString: "",
  timer: "",
});

const buildRoundState = ({
  eventId,
  roundIndex,
  participantIds,
  participantsById,
  nowMs,
  isFirstRound,
}) => {
  const roundKey = String(roundIndex);
  const { byeProfileId, byeReason, orderedParticipantIds } = pickRoundBye(
    participantIds,
    participantsById,
    isFirstRound,
  );
  const round = {
    roundIndex,
    status: "active",
    createdAtMs: nowMs,
    completedAtMs: null,
    byeProfileId,
    byeReason,
    matches: {},
  };
  const updates = {};

  for (let index = 0; index < orderedParticipantIds.length; index += 2) {
    const hostProfileId = orderedParticipantIds[index];
    const guestProfileId = orderedParticipantIds[index + 1];
    const hostParticipant = participantsById[hostProfileId];
    const guestParticipant = participantsById[guestProfileId];
    if (!hostParticipant || !guestParticipant) {
      continue;
    }

    const inviteId = generateEventInviteId();
    const matchKey = `${roundIndex}_${Math.floor(index / 2)}`;
    const hostColor = pickHostColor();
    const guestColor = hostColor === "white" ? "black" : "white";

    round.matches[matchKey] = {
      matchKey,
      inviteId,
      status: "pending",
      resolvedAtMs: null,
      winnerProfileId: null,
      loserProfileId: null,
      hostProfileId,
      hostLoginUid: hostParticipant.loginUid,
      hostDisplayName: hostParticipant.displayName,
      hostEmojiId: hostParticipant.emojiId,
      hostAura: hostParticipant.aura || "",
      guestProfileId,
      guestLoginUid: guestParticipant.loginUid,
      guestDisplayName: guestParticipant.displayName,
      guestEmojiId: guestParticipant.emojiId,
      guestAura: guestParticipant.aura || "",
    };

    updates[`invites/${inviteId}`] = {
      version: CONTROLLER_VERSION,
      hostId: hostParticipant.loginUid,
      hostColor,
      guestId: guestParticipant.loginUid,
      eventId,
      eventRoundIndex: roundIndex,
      eventMatchKey: matchKey,
      eventOwned: true,
    };
    updates[`players/${hostParticipant.loginUid}/matches/${inviteId}`] =
      createMatchRecord(
        hostColor,
        hostParticipant.emojiId,
        hostParticipant.aura,
      );
    updates[`players/${guestParticipant.loginUid}/matches/${inviteId}`] =
      createMatchRecord(
        guestColor,
        guestParticipant.emojiId,
        guestParticipant.aura,
      );
  }

  updates[`events/${eventId}/rounds/${roundKey}`] = round;
  return {
    round,
    updates,
  };
};

const buildScheduledEventDueUpdates = ({ eventId, event, nowMs }) => {
  if (!event || event.status !== "scheduled") {
    return { didChange: false, updates: {} };
  }
  if (typeof event.startAtMs !== "number" || nowMs < event.startAtMs) {
    return { didChange: false, updates: {} };
  }

  const participantIds = getParticipantIds(event);
  if (participantIds.length >= 2) {
    const participantsById = event.participants || {};
    const { updates: roundUpdates } = buildRoundState({
      eventId,
      roundIndex: 0,
      participantIds,
      participantsById,
      nowMs,
      isFirstRound: true,
    });
    event.status = "active";
    event.startedAtMs = nowMs;
    event.updatedAtMs = nowMs;
    event.currentRoundIndex = 0;
    return {
      didChange: true,
      updates: {
        ...roundUpdates,
        [`events/${eventId}/status`]: event.status,
        [`events/${eventId}/startedAtMs`]: event.startedAtMs,
        [`events/${eventId}/updatedAtMs`]: event.updatedAtMs,
        [`events/${eventId}/currentRoundIndex`]: event.currentRoundIndex,
      },
    };
  }

  event.status = "dismissed";
  event.endedAtMs = nowMs;
  event.updatedAtMs = nowMs;
  event.winnerProfileId = null;
  event.winnerDisplayName = null;
  return {
    didChange: true,
    updates: {
      [`events/${eventId}/status`]: event.status,
      [`events/${eventId}/endedAtMs`]: event.endedAtMs,
      [`events/${eventId}/updatedAtMs`]: event.updatedAtMs,
      [`events/${eventId}/winnerProfileId`]: null,
      [`events/${eventId}/winnerDisplayName`]: null,
    },
  };
};

const resolveRoundMatchState = async (matchRecord) => {
  if (!matchRecord || typeof matchRecord !== "object") {
    return null;
  }
  const hostLoginUid = normalizeString(matchRecord.hostLoginUid);
  const guestLoginUid = normalizeString(matchRecord.guestLoginUid);
  const inviteId = normalizeString(matchRecord.inviteId);
  if (!hostLoginUid || !guestLoginUid || !inviteId) {
    return null;
  }

  const [hostSnapshot, guestSnapshot] = await batchReadWithRetry([
    admin.database().ref(`players/${hostLoginUid}/matches/${inviteId}`),
    admin.database().ref(`players/${guestLoginUid}/matches/${inviteId}`),
  ]);
  const hostMatch = hostSnapshot.val();
  const guestMatch = guestSnapshot.val();
  const outcome = await resolveMatchWinner(hostMatch, guestMatch);
  if (outcome.winner === "player") {
    return {
      status: "host",
      winnerProfileId: normalizeString(matchRecord.hostProfileId),
      loserProfileId: normalizeString(matchRecord.guestProfileId),
    };
  }
  if (outcome.winner === "opponent") {
    return {
      status: "guest",
      winnerProfileId: normalizeString(matchRecord.guestProfileId),
      loserProfileId: normalizeString(matchRecord.hostProfileId),
    };
  }
  return null;
};

const resolveRoundMatchesWithConcurrency = async (matchesByKey) => {
  const entries = Object.entries(matchesByKey || {});
  if (entries.length <= 0) {
    return [];
  }

  const results = new Array(entries.length);
  const concurrency = Math.max(
    1,
    Math.min(EVENT_MATCH_RESOLVE_CONCURRENCY, entries.length),
  );
  let nextIndex = 0;

  const worker = async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= entries.length) {
        return;
      }
      const [matchKey, matchRecord] = entries[index];
      const resolved = await resolveRoundMatchState(matchRecord);
      results[index] = {
        matchKey,
        matchRecord,
        resolved,
      };
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
};

const createBaseEventRecord = ({
  eventId,
  creatorProfile,
  creatorUid,
  startAtMs,
  createdAtMs,
}) => {
  const creatorParticipant = buildParticipantSnapshot(
    creatorProfile,
    creatorUid,
    createdAtMs,
  );
  return {
    schemaVersion: EVENT_SCHEMA_VERSION,
    eventId,
    status: "scheduled",
    createdAtMs,
    updatedAtMs: createdAtMs,
    startAtMs,
    startedAtMs: null,
    endedAtMs: null,
    createdByProfileId: creatorParticipant.profileId,
    createdByLoginUid: creatorUid,
    createdByUsername: creatorParticipant.username,
    winnerProfileId: null,
    winnerDisplayName: null,
    currentRoundIndex: null,
    participants: {
      [creatorParticipant.profileId]: creatorParticipant,
    },
    rounds: {},
  };
};

const acquireEventLock = async (eventId, ownerUid) => {
  const lockRef = admin.database().ref(`eventLocks/${eventId}`);
  const lockId = randomString(16);
  const result = await lockRef.transaction((current) => {
    const nowMs = getNowMs();
    if (
      current &&
      typeof current.expiresAtMs === "number" &&
      current.expiresAtMs > nowMs
    ) {
      return;
    }
    return {
      lockId,
      ownerUid,
      expiresAtMs: nowMs + EVENT_LOCK_TTL_MS,
      acquiredAtMs: nowMs,
      refreshedAtMs: nowMs,
    };
  });
  if (!result.committed) {
    return null;
  }
  return {
    ref: lockRef,
    lockId,
    ownerUid,
  };
};

const acquireEventLockWithRetry = async (eventId, ownerUid, options = {}) => {
  const attempts = Math.max(1, toFiniteInteger(options.attempts, 1));
  const delayMs = Math.max(25, toFiniteInteger(options.delayMs, 100));

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const lockHandle = await acquireEventLock(eventId, ownerUid);
    if (lockHandle) {
      return lockHandle;
    }
    if (attempt < attempts - 1) {
      await sleep(delayMs);
    }
  }

  return null;
};

const isEventLockStillOwned = async (lockHandle) => {
  if (!lockHandle) {
    return false;
  }
  const snapshot = await lockHandle.ref.once("value");
  const current = snapshot.val();
  const nowMs = getNowMs();
  return !!(
    current &&
    current.ownerUid === lockHandle.ownerUid &&
    current.lockId === lockHandle.lockId &&
    typeof current.expiresAtMs === "number" &&
    current.expiresAtMs > nowMs
  );
};

const startEventLockHeartbeat = (lockHandle) => {
  if (!lockHandle) {
    return () => {};
  }
  let isDisposed = false;
  const heartbeatInterval = setInterval(() => {
    if (isDisposed) {
      return;
    }
    const refreshedAtMs = getNowMs();
    void lockHandle.ref
      .transaction((current) => {
        if (
          !current ||
          current.ownerUid !== lockHandle.ownerUid ||
          current.lockId !== lockHandle.lockId
        ) {
          return;
        }
        return {
          ...current,
          expiresAtMs: refreshedAtMs + EVENT_LOCK_TTL_MS,
          refreshedAtMs,
        };
      })
      .catch((error) => {
        console.error(
          "event:lock:heartbeat:error",
          error && error.message ? error.message : error,
        );
      });
  }, EVENT_LOCK_REFRESH_INTERVAL_MS);

  if (typeof heartbeatInterval.unref === "function") {
    heartbeatInterval.unref();
  }

  return () => {
    isDisposed = true;
    clearInterval(heartbeatInterval);
  };
};

const releaseEventLock = async (lockHandle) => {
  if (!lockHandle) {
    return;
  }
  try {
    const snapshot = await lockHandle.ref.once("value");
    const current = snapshot.val();
    if (
      current &&
      current.ownerUid === lockHandle.ownerUid &&
      current.lockId === lockHandle.lockId
    ) {
      await lockHandle.ref.remove();
    }
  } catch (error) {
    console.error(
      "event:lock:release:error",
      error && error.message ? error.message : error,
    );
  }
};

exports.createEvent = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "The function must be called while authenticated.",
    );
  }

  const creatorProfile = await ensureIvanCreator(request.auth.uid);
  const rawStartsInMinutes = toFiniteInteger(
    request.data && request.data.startsInMinutes,
    0,
  );
  if (rawStartsInMinutes < MIN_STARTS_IN_MINUTES) {
    throw new HttpsError(
      "invalid-argument",
      `Event must start at least ${MIN_STARTS_IN_MINUTES} minute from now.`,
    );
  }
  const startsInMinutes = Math.min(MAX_STARTS_IN_MINUTES, rawStartsInMinutes);
  const createdAtMs = getNowMs();
  const startAtMs = createdAtMs + startsInMinutes * 60 * 1000;
  const eventId = generateEventId();
  const event = createBaseEventRecord({
    eventId,
    creatorProfile,
    creatorUid: request.auth.uid,
    startAtMs,
    createdAtMs,
  });

  await admin.database().ref(`events/${eventId}`).set(event);

  return {
    ok: true,
    eventId,
    event,
  };
});

exports.joinEvent = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "The function must be called while authenticated.",
    );
  }

  const eventId = normalizeString(request.data && request.data.eventId);
  if (!eventId) {
    throw new HttpsError("invalid-argument", "eventId is required.");
  }

  const profile = await ensureNonAnonProfile(request.auth.uid);
  const profileId = normalizeString(profile.profileId);
  const lockHandle = await acquireEventLockWithRetry(
    eventId,
    request.auth.uid,
    {
      attempts: 40,
      delayMs: 100,
    },
  );
  if (!lockHandle) {
    throw new HttpsError(
      "unavailable",
      "Event is busy. Please try joining again.",
    );
  }
  const stopLockHeartbeat = startEventLockHeartbeat(lockHandle);

  try {
    const eventRef = admin.database().ref(`events/${eventId}`);
    const eventSnapshot = await eventRef.once("value");
    if (!eventSnapshot.exists()) {
      throw new HttpsError("not-found", "Event not found.");
    }

    const event = cloneValue(eventSnapshot.val() || {});
    const nowMs = getNowMs();
    if (event.status !== "scheduled") {
      throw new HttpsError(
        "failed-precondition",
        "This event has already started.",
      );
    }
    if (typeof event.startAtMs === "number" && nowMs >= event.startAtMs) {
      const dueTransition = buildScheduledEventDueUpdates({
        eventId,
        event,
        nowMs,
      });
      if (dueTransition.didChange) {
        await admin.database().ref().update(dueTransition.updates);
      }
      throw new HttpsError(
        "failed-precondition",
        "This event is no longer accepting participants.",
      );
    }

    const existingParticipant =
      event.participants && event.participants[profileId]
        ? event.participants[profileId]
        : null;
    const participant = buildParticipantSnapshot(
      profile,
      request.auth.uid,
      existingParticipant && typeof existingParticipant.joinedAtMs === "number"
        ? existingParticipant.joinedAtMs
        : nowMs,
    );
    const nextParticipants =
      event.participants && typeof event.participants === "object"
        ? event.participants
        : {};
    nextParticipants[profileId] = participant;
    event.participants = nextParticipants;
    event.updatedAtMs = nowMs;
    const updates = {
      [`events/${eventId}/participants/${profileId}`]: participant,
      [`events/${eventId}/updatedAtMs`]: nowMs,
    };
    const settleNowMs = getNowMs();
    const dueTransition = buildScheduledEventDueUpdates({
      eventId,
      event,
      nowMs: settleNowMs,
    });
    if (dueTransition.didChange) {
      Object.assign(updates, dueTransition.updates);
    }
    const lockOwned = await isEventLockStillOwned(lockHandle);
    if (!lockOwned) {
      throw new HttpsError(
        "unavailable",
        "Event is busy. Please try joining again.",
      );
    }
    await admin.database().ref().update(updates);

    return {
      ok: true,
      eventId,
      participant,
    };
  } finally {
    stopLockHeartbeat();
    await releaseEventLock(lockHandle);
  }
});

exports.syncEventState = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "The function must be called while authenticated.",
    );
  }

  const eventId = normalizeString(request.data && request.data.eventId);
  if (!eventId) {
    throw new HttpsError("invalid-argument", "eventId is required.");
  }

  const lockHandle = await acquireEventLockWithRetry(
    eventId,
    request.auth.uid,
    {
      attempts: 10,
      delayMs: 100,
    },
  );
  if (!lockHandle) {
    return { ok: true, eventId, skipped: true, reason: "locked" };
  }
  const stopLockHeartbeat = startEventLockHeartbeat(lockHandle);

  try {
    const eventSnapshot = await admin
      .database()
      .ref(`events/${eventId}`)
      .once("value");
    if (!eventSnapshot.exists()) {
      throw new HttpsError("not-found", "Event not found.");
    }
    const event = cloneValue(eventSnapshot.val() || {});
    const nowMs = getNowMs();
    const updates = {};
    let didChange = false;

    if (event.status === "scheduled") {
      const dueTransition = buildScheduledEventDueUpdates({
        eventId,
        event,
        nowMs,
      });
      Object.assign(updates, dueTransition.updates);
      didChange = dueTransition.didChange;
    } else if (event.status === "active") {
      const currentRoundIndex = toFiniteInteger(event.currentRoundIndex, -1);
      const roundKey = String(currentRoundIndex);
      const rounds =
        event.rounds && typeof event.rounds === "object" ? event.rounds : {};
      const currentRound = rounds[roundKey];
      const participants =
        event.participants && typeof event.participants === "object"
          ? event.participants
          : {};

      if (
        currentRound &&
        currentRound.matches &&
        typeof currentRound.matches === "object"
      ) {
        const resolvedWinners = [];
        let allResolved = true;
        let roundChanged = false;
        const nextRound = cloneValue(currentRound);
        const resolvedEntries = await resolveRoundMatchesWithConcurrency(
          currentRound.matches,
        );

        for (const entry of resolvedEntries) {
          const { matchKey, matchRecord, resolved } = entry;
          if (!resolved) {
            allResolved = false;
            continue;
          }
          resolvedWinners.push(resolved.winnerProfileId);
          const existingStatus = normalizeString(matchRecord.status);
          if (
            existingStatus !== resolved.status ||
            normalizeString(matchRecord.winnerProfileId) !==
              resolved.winnerProfileId
          ) {
            nextRound.matches[matchKey] = {
              ...matchRecord,
              status: resolved.status,
              winnerProfileId: resolved.winnerProfileId,
              loserProfileId: resolved.loserProfileId,
              resolvedAtMs: matchRecord.resolvedAtMs || nowMs,
            };
            roundChanged = true;
          }

          const loserParticipant = participants[resolved.loserProfileId];
          if (loserParticipant && loserParticipant.state !== "eliminated") {
            participants[resolved.loserProfileId] = {
              ...loserParticipant,
              state: "eliminated",
              eliminatedRoundIndex: currentRoundIndex,
              eliminatedByProfileId: resolved.winnerProfileId,
            };
            roundChanged = true;
          }
        }

        if (currentRound.byeProfileId) {
          resolvedWinners.push(currentRound.byeProfileId);
        }

        if (roundChanged) {
          updates[`events/${eventId}/rounds/${roundKey}`] = nextRound;
          updates[`events/${eventId}/participants`] = participants;
          updates[`events/${eventId}/updatedAtMs`] = nowMs;
          didChange = true;
        }

        if (allResolved && resolvedWinners.length > 0) {
          const uniqueWinnerIds = Array.from(
            new Set(
              resolvedWinners.filter((value) => normalizeString(value) !== ""),
            ),
          );
          nextRound.status = "completed";
          nextRound.completedAtMs = nowMs;
          updates[`events/${eventId}/rounds/${roundKey}`] = nextRound;
          updates[`events/${eventId}/updatedAtMs`] = nowMs;
          didChange = true;

          if (uniqueWinnerIds.length <= 1) {
            const winnerProfileId = uniqueWinnerIds[0] || null;
            const winnerParticipant = winnerProfileId
              ? participants[winnerProfileId]
              : null;
            if (winnerProfileId && winnerParticipant) {
              participants[winnerProfileId] = {
                ...winnerParticipant,
                state: "winner",
              };
            }
            updates[`events/${eventId}/participants`] = participants;
            updates[`events/${eventId}/status`] = "ended";
            updates[`events/${eventId}/endedAtMs`] = nowMs;
            updates[`events/${eventId}/winnerProfileId`] = winnerProfileId;
            updates[`events/${eventId}/winnerDisplayName`] = winnerParticipant
              ? winnerParticipant.displayName
              : null;
            didChange = true;
          } else {
            const { updates: roundUpdates } = buildRoundState({
              eventId,
              roundIndex: currentRoundIndex + 1,
              participantIds: uniqueWinnerIds,
              participantsById: participants,
              nowMs,
              isFirstRound: false,
            });
            Object.assign(updates, roundUpdates);
            updates[`events/${eventId}/currentRoundIndex`] =
              currentRoundIndex + 1;
            didChange = true;
          }
        }
      }
    }

    if (didChange) {
      const lockOwned = await isEventLockStillOwned(lockHandle);
      if (!lockOwned) {
        const latestSnapshot = await admin
          .database()
          .ref(`events/${eventId}`)
          .once("value");
        return {
          ok: true,
          eventId,
          skipped: true,
          reason: "lock-lost",
          event: latestSnapshot.val(),
        };
      }
      await admin.database().ref().update(updates);
    }

    const refreshedSnapshot = await admin
      .database()
      .ref(`events/${eventId}`)
      .once("value");
    return {
      ok: true,
      eventId,
      didChange,
      event: refreshedSnapshot.val(),
    };
  } finally {
    stopLockHeartbeat();
    await releaseEventLock(lockHandle);
  }
});
