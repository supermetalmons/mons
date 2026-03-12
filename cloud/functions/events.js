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
const EVENT_SCHEMA_VERSION = 2;
const EVENT_LOCK_TTL_MS = 30 * 1000;
const EVENT_LOCK_REFRESH_INTERVAL_MS = 10 * 1000;
const EVENT_MATCH_RESOLVE_CONCURRENCY = 12;
const MIN_STARTS_IN_MINUTES = 1;
const MAX_STARTS_IN_MINUTES = 7 * 24 * 60;
const MAX_EVENT_PARTICIPANTS = 32;
const PILOT_EVENT_CREATOR_USERNAMES = new Set([
  "ivan",
  "meinong",
  "obi",
  "bosch",
  "monsol",
  "bosch2",
]);

const normalizeString = (value) =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : "";
const normalizeStringOrNull = (value) => normalizeString(value) || null;
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

const ensurePilotEventCreator = async (uid) => {
  const profile = await getProfileByLoginId(uid);
  const username = normalizeUsername(profile.username);
  const profileId = normalizeString(profile.profileId);
  if (!profileId) {
    throw new HttpsError(
      "failed-precondition",
      "Event creation requires a signed-in profile.",
    );
  }
  if (!PILOT_EVENT_CREATOR_USERNAMES.has(username)) {
    throw new HttpsError(
      "permission-denied",
      "Only approved pilot users can create pilot events.",
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

const createMatchRecord = (color, emojiId, aura) => ({
  version: CONTROLLER_VERSION,
  color,
  emojiId: typeof emojiId === "number" ? Math.floor(emojiId) : 0,
  aura: normalizeString(aura) || null,
  fen: INITIAL_FEN,
  status: "",
  flatMovesString: "",
  timer: "",
});

const getMatchKey = (roundIndex, matchIndex) => `${roundIndex}_${matchIndex}`;
const getMatchIndexFromKey = (matchKey) => {
  const parts = normalizeString(matchKey).split("_");
  return toFiniteInteger(parts[1], 0);
};

const getBracketSize = (participantCount) => {
  let bracketSize = 2;
  while (
    bracketSize < participantCount &&
    bracketSize < MAX_EVENT_PARTICIPANTS
  ) {
    bracketSize *= 2;
  }
  return bracketSize;
};

const buildSeedOrder = (bracketSize) => {
  if (bracketSize <= 1) {
    return [1];
  }
  const previous = buildSeedOrder(bracketSize / 2);
  const next = [];
  for (const seed of previous) {
    next.push(seed);
    next.push(bracketSize + 1 - seed);
  }
  return next;
};

const createEmptyEventMatch = (matchKey) => ({
  matchKey,
  inviteId: null,
  status: "upcoming",
  resolvedAtMs: null,
  winnerProfileId: null,
  loserProfileId: null,
  hostProfileId: null,
  hostLoginUid: null,
  hostDisplayName: null,
  hostEmojiId: null,
  hostAura: null,
  guestProfileId: null,
  guestLoginUid: null,
  guestDisplayName: null,
  guestEmojiId: null,
  guestAura: null,
});

const setMatchSlotParticipant = (match, slot, participant) => {
  const prefix = slot === "guest" ? "guest" : "host";
  const nextProfileId = participant ? participant.profileId : null;
  const nextLoginUid = participant ? participant.loginUid : null;
  const nextDisplayName = participant ? participant.displayName : null;
  const nextEmojiId = participant ? participant.emojiId : null;
  const nextAura = participant ? participant.aura || null : null;
  let didChange = false;

  if (match[`${prefix}ProfileId`] !== nextProfileId) {
    match[`${prefix}ProfileId`] = nextProfileId;
    didChange = true;
  }
  if (match[`${prefix}LoginUid`] !== nextLoginUid) {
    match[`${prefix}LoginUid`] = nextLoginUid;
    didChange = true;
  }
  if (match[`${prefix}DisplayName`] !== nextDisplayName) {
    match[`${prefix}DisplayName`] = nextDisplayName;
    didChange = true;
  }
  if (match[`${prefix}EmojiId`] !== nextEmojiId) {
    match[`${prefix}EmojiId`] = nextEmojiId;
    didChange = true;
  }
  if (match[`${prefix}Aura`] !== nextAura) {
    match[`${prefix}Aura`] = nextAura;
    didChange = true;
  }

  return didChange;
};

const applyMatchResolution = (match, resolved, nowMs) => {
  if (!match || !resolved) {
    return false;
  }
  let didChange = false;

  if (match.status !== resolved.status) {
    match.status = resolved.status;
    didChange = true;
  }
  if (
    normalizeStringOrNull(match.winnerProfileId) !== resolved.winnerProfileId
  ) {
    match.winnerProfileId = resolved.winnerProfileId;
    didChange = true;
  }
  if (normalizeStringOrNull(match.loserProfileId) !== resolved.loserProfileId) {
    match.loserProfileId = resolved.loserProfileId;
    didChange = true;
  }
  if (typeof match.resolvedAtMs !== "number") {
    match.resolvedAtMs = nowMs;
    didChange = true;
  }

  return didChange;
};

const assignWinnerToNextRound = ({
  rounds,
  roundIndex,
  matchIndex,
  winnerProfileId,
  participantsById,
}) => {
  const normalizedWinnerProfileId = normalizeString(winnerProfileId);
  if (!normalizedWinnerProfileId) {
    return false;
  }

  const nextRound = rounds[String(roundIndex + 1)];
  if (
    !nextRound ||
    !nextRound.matches ||
    typeof nextRound.matches !== "object"
  ) {
    return false;
  }

  const nextMatchIndex = Math.floor(matchIndex / 2);
  const nextMatchKey = getMatchKey(roundIndex + 1, nextMatchIndex);
  const nextMatch = nextRound.matches[nextMatchKey];
  if (!nextMatch) {
    return false;
  }

  const slot = matchIndex % 2 === 0 ? "host" : "guest";
  return setMatchSlotParticipant(
    nextMatch,
    slot,
    participantsById[normalizedWinnerProfileId] || null,
  );
};

const createInviteForMatch = ({
  eventId,
  roundIndex,
  matchKey,
  match,
  inviteUpdates,
}) => {
  const hostLoginUid = normalizeString(match.hostLoginUid);
  const guestLoginUid = normalizeString(match.guestLoginUid);
  if (!hostLoginUid || !guestLoginUid || normalizeString(match.inviteId)) {
    return false;
  }

  const inviteId = generateEventInviteId();
  const hostColor = pickHostColor();
  const guestColor = hostColor === "white" ? "black" : "white";

  match.inviteId = inviteId;
  match.status = "pending";

  inviteUpdates[`invites/${inviteId}`] = {
    version: CONTROLLER_VERSION,
    hostId: hostLoginUid,
    hostColor,
    guestId: guestLoginUid,
    eventId,
    eventRoundIndex: roundIndex,
    eventMatchKey: matchKey,
    eventOwned: true,
  };
  inviteUpdates[`players/${hostLoginUid}/matches/${inviteId}`] =
    createMatchRecord(hostColor, match.hostEmojiId, match.hostAura);
  inviteUpdates[`players/${guestLoginUid}/matches/${inviteId}`] =
    createMatchRecord(guestColor, match.guestEmojiId, match.guestAura);

  return true;
};

const activateRound = ({
  eventId,
  roundIndex,
  rounds,
  nowMs,
  participantsById,
  inviteUpdates,
}) => {
  const roundKey = String(roundIndex);
  const round = rounds[roundKey];
  if (!round || !round.matches || typeof round.matches !== "object") {
    return false;
  }

  let didChange = false;
  if (round.status !== "active") {
    round.status = "active";
    round.completedAtMs = null;
    didChange = true;
  }

  const matchKeys = Object.keys(round.matches).sort(
    (left, right) => getMatchIndexFromKey(left) - getMatchIndexFromKey(right),
  );

  for (const matchKey of matchKeys) {
    const match = round.matches[matchKey];
    if (!match || typeof match !== "object") {
      continue;
    }

    const hostProfileId = normalizeString(match.hostProfileId);
    const guestProfileId = normalizeString(match.guestProfileId);
    const status = normalizeString(match.status);

    if (status === "host" || status === "guest" || status === "bye") {
      continue;
    }

    if (hostProfileId && guestProfileId) {
      if (
        createInviteForMatch({
          eventId,
          roundIndex,
          matchKey,
          match,
          inviteUpdates,
        })
      ) {
        didChange = true;
      }
      continue;
    }

    if (hostProfileId || guestProfileId) {
      const winnerProfileId = hostProfileId || guestProfileId;
      if (
        applyMatchResolution(
          match,
          {
            status: "bye",
            winnerProfileId,
            loserProfileId: null,
          },
          nowMs,
        )
      ) {
        didChange = true;
      }
      if (
        assignWinnerToNextRound({
          rounds,
          roundIndex,
          matchIndex: getMatchIndexFromKey(matchKey),
          winnerProfileId,
          participantsById,
        })
      ) {
        didChange = true;
      }
      continue;
    }

    if (status !== "upcoming") {
      match.status = "upcoming";
      didChange = true;
    }
  }

  return didChange;
};

const buildFixedBracketState = ({
  eventId,
  participantIds,
  participantsById,
  nowMs,
}) => {
  const orderedParticipantIds = shuffle(participantIds);
  const bracketSize = getBracketSize(orderedParticipantIds.length);
  const roundCount = Math.max(1, Math.round(Math.log2(bracketSize)));
  const seedOrder = buildSeedOrder(bracketSize);
  const inviteUpdates = {};
  const rounds = {};
  const seedToProfileId = new Map();

  orderedParticipantIds.forEach((profileId, index) => {
    seedToProfileId.set(index + 1, profileId);
  });

  for (let roundIndex = 0; roundIndex < roundCount; roundIndex += 1) {
    const round = {
      roundIndex,
      status: roundIndex === 0 ? "active" : "upcoming",
      createdAtMs: nowMs,
      completedAtMs: null,
      matches: {},
    };
    const matchCount = bracketSize / Math.pow(2, roundIndex + 1);

    for (let matchIndex = 0; matchIndex < matchCount; matchIndex += 1) {
      const matchKey = getMatchKey(roundIndex, matchIndex);
      const match = createEmptyEventMatch(matchKey);

      if (roundIndex === 0) {
        const hostSeed = seedOrder[matchIndex * 2];
        const guestSeed = seedOrder[matchIndex * 2 + 1];
        const hostProfileId = seedToProfileId.get(hostSeed) || null;
        const guestProfileId = seedToProfileId.get(guestSeed) || null;

        setMatchSlotParticipant(
          match,
          "host",
          participantsById[hostProfileId] || null,
        );
        setMatchSlotParticipant(
          match,
          "guest",
          participantsById[guestProfileId] || null,
        );

        if (hostProfileId && guestProfileId) {
          createInviteForMatch({
            eventId,
            roundIndex,
            matchKey,
            match,
            inviteUpdates,
          });
        } else if (hostProfileId || guestProfileId) {
          applyMatchResolution(
            match,
            {
              status: "bye",
              winnerProfileId: hostProfileId || guestProfileId,
              loserProfileId: null,
            },
            nowMs,
          );
        }
      }

      round.matches[matchKey] = match;
    }

    rounds[String(roundIndex)] = round;
  }

  for (let roundIndex = 0; roundIndex < roundCount - 1; roundIndex += 1) {
    const round = rounds[String(roundIndex)];
    const matchKeys = Object.keys(round.matches).sort(
      (left, right) => getMatchIndexFromKey(left) - getMatchIndexFromKey(right),
    );
    for (const matchKey of matchKeys) {
      const match = round.matches[matchKey];
      const winnerProfileId = normalizeString(match.winnerProfileId);
      if (!winnerProfileId) {
        continue;
      }
      assignWinnerToNextRound({
        rounds,
        roundIndex,
        matchIndex: getMatchIndexFromKey(matchKey),
        winnerProfileId,
        participantsById,
      });
    }
  }

  return {
    bracketSize,
    roundCount,
    rounds,
    inviteUpdates,
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
    const bracket = buildFixedBracketState({
      eventId,
      participantIds,
      participantsById,
      nowMs,
    });

    event.status = "active";
    event.startedAtMs = nowMs;
    event.updatedAtMs = nowMs;
    event.currentRoundIndex = 0;
    event.bracketSize = bracket.bracketSize;
    event.roundCount = bracket.roundCount;

    return {
      didChange: true,
      updates: {
        ...bracket.inviteUpdates,
        [`events/${eventId}/status`]: event.status,
        [`events/${eventId}/startedAtMs`]: event.startedAtMs,
        [`events/${eventId}/updatedAtMs`]: event.updatedAtMs,
        [`events/${eventId}/currentRoundIndex`]: event.currentRoundIndex,
        [`events/${eventId}/bracketSize`]: event.bracketSize,
        [`events/${eventId}/roundCount`]: event.roundCount,
        [`events/${eventId}/rounds`]: bracket.rounds,
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

  const existingStatus = normalizeString(matchRecord.status);
  if (existingStatus === "bye") {
    const winnerProfileId = normalizeString(matchRecord.winnerProfileId);
    if (!winnerProfileId) {
      return null;
    }
    return {
      status: "bye",
      winnerProfileId,
      loserProfileId: null,
    };
  }

  if (existingStatus === "host" || existingStatus === "guest") {
    const winnerProfileId =
      normalizeString(matchRecord.winnerProfileId) ||
      (existingStatus === "host"
        ? normalizeString(matchRecord.hostProfileId)
        : normalizeString(matchRecord.guestProfileId));
    const loserProfileId =
      normalizeString(matchRecord.loserProfileId) ||
      (existingStatus === "host"
        ? normalizeString(matchRecord.guestProfileId)
        : normalizeString(matchRecord.hostProfileId));
    if (!winnerProfileId) {
      return null;
    }
    return {
      status: existingStatus,
      winnerProfileId,
      loserProfileId: loserProfileId || null,
    };
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
      loserProfileId: normalizeStringOrNull(matchRecord.guestProfileId),
    };
  }
  if (outcome.winner === "opponent") {
    return {
      status: "guest",
      winnerProfileId: normalizeString(matchRecord.guestProfileId),
      loserProfileId: normalizeStringOrNull(matchRecord.hostProfileId),
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
    bracketSize: 0,
    roundCount: 0,
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

  const creatorProfile = await ensurePilotEventCreator(request.auth.uid);
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
    const currentParticipantCount = getParticipantIds(event).length;
    if (
      !existingParticipant &&
      currentParticipantCount >= MAX_EVENT_PARTICIPANTS
    ) {
      throw new HttpsError(
        "failed-precondition",
        `This event is full (${MAX_EVENT_PARTICIPANTS} players max).`,
      );
    }

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
      const originalCurrentRoundIndex = toFiniteInteger(
        event.currentRoundIndex,
        -1,
      );
      let currentRoundIndex = originalCurrentRoundIndex;
      const rounds = cloneValue(
        event.rounds && typeof event.rounds === "object" ? event.rounds : {},
      );
      const participants = cloneValue(
        event.participants && typeof event.participants === "object"
          ? event.participants
          : {},
      );
      const inviteUpdates = {};
      let roundsChanged = false;
      let participantsChanged = false;
      let eventChanged = false;
      let shouldContinue = currentRoundIndex >= 0;

      while (shouldContinue) {
        shouldContinue = false;
        const roundKey = String(currentRoundIndex);
        const currentRound = rounds[roundKey];
        if (
          !currentRound ||
          !currentRound.matches ||
          typeof currentRound.matches !== "object"
        ) {
          break;
        }

        const resolvedEntries = await resolveRoundMatchesWithConcurrency(
          currentRound.matches,
        );
        let allResolved = true;
        let roundChanged = false;
        const roundWinners = [];

        for (const entry of resolvedEntries) {
          const { matchKey, matchRecord, resolved } = entry;
          if (!resolved) {
            allResolved = false;
            continue;
          }

          roundWinners.push(resolved.winnerProfileId);
          if (applyMatchResolution(matchRecord, resolved, nowMs)) {
            roundChanged = true;
          }
          if (
            assignWinnerToNextRound({
              rounds,
              roundIndex: currentRoundIndex,
              matchIndex: getMatchIndexFromKey(matchKey),
              winnerProfileId: resolved.winnerProfileId,
              participantsById: participants,
            })
          ) {
            roundsChanged = true;
          }

          const loserProfileId = normalizeString(resolved.loserProfileId);
          const loserParticipant = participants[loserProfileId];
          if (loserParticipant && loserParticipant.state !== "eliminated") {
            participants[loserProfileId] = {
              ...loserParticipant,
              state: "eliminated",
              eliminatedRoundIndex: currentRoundIndex,
              eliminatedByProfileId: resolved.winnerProfileId,
            };
            participantsChanged = true;
          }
        }

        if (roundChanged) {
          roundsChanged = true;
        }

        if (!allResolved) {
          break;
        }

        currentRound.status = "completed";
        currentRound.completedAtMs = nowMs;
        roundsChanged = true;

        const uniqueWinnerIds = Array.from(
          new Set(
            roundWinners.filter((value) => normalizeString(value) !== ""),
          ),
        );

        if (uniqueWinnerIds.length <= 1) {
          const winnerProfileId = uniqueWinnerIds[0] || null;
          const winnerParticipant = winnerProfileId
            ? participants[winnerProfileId]
            : null;
          if (
            winnerProfileId &&
            winnerParticipant &&
            winnerParticipant.state !== "winner"
          ) {
            participants[winnerProfileId] = {
              ...winnerParticipant,
              state: "winner",
            };
            participantsChanged = true;
          }
          event.status = "ended";
          event.endedAtMs = nowMs;
          event.winnerProfileId = winnerProfileId;
          event.winnerDisplayName = winnerParticipant
            ? winnerParticipant.displayName
            : null;
          eventChanged = true;
          break;
        }

        const nextRoundIndex = currentRoundIndex + 1;
        if (
          activateRound({
            eventId,
            roundIndex: nextRoundIndex,
            rounds,
            nowMs,
            participantsById: participants,
            inviteUpdates,
          })
        ) {
          roundsChanged = true;
        }
        if (currentRoundIndex !== nextRoundIndex) {
          currentRoundIndex = nextRoundIndex;
          event.currentRoundIndex = nextRoundIndex;
          eventChanged = true;
        }
        shouldContinue = true;
      }

      if (roundsChanged) {
        updates[`events/${eventId}/rounds`] = rounds;
      }
      if (participantsChanged) {
        updates[`events/${eventId}/participants`] = participants;
      }
      if (Object.keys(inviteUpdates).length > 0) {
        Object.assign(updates, inviteUpdates);
      }
      if (eventChanged) {
        if (event.status === "ended") {
          updates[`events/${eventId}/status`] = "ended";
          updates[`events/${eventId}/endedAtMs`] = event.endedAtMs;
          updates[`events/${eventId}/winnerProfileId`] = event.winnerProfileId;
          updates[`events/${eventId}/winnerDisplayName`] =
            event.winnerDisplayName;
        }
        if (event.currentRoundIndex !== originalCurrentRoundIndex) {
          updates[`events/${eventId}/currentRoundIndex`] =
            event.currentRoundIndex;
        }
      }
      if (
        roundsChanged ||
        participantsChanged ||
        Object.keys(inviteUpdates).length > 0 ||
        eventChanged
      ) {
        updates[`events/${eventId}/updatedAtMs`] = nowMs;
        didChange = true;
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
