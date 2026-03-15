const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onValueWritten } = require("firebase-functions/v2/database");
const { onTaskDispatched } = require("firebase-functions/v2/tasks");
const admin = require("firebase-admin");
const {
  getProfileByLoginId,
  getDisplayNameFromAddress,
  batchReadWithRetry,
} = require("./utils");
const { resolveMatchWinner } = require("./matchOutcome");
const { enqueueEventProgressTask } = require("./eventProgressTasks");

const CONTROLLER_VERSION = 2;
const INITIAL_FEN =
  "0 0 w 0 0 0 0 0 1 n03y0xs0xd0xa0xe0xn03/n11/n11/n04xxmn01xxmn04/n03xxmn01xxmn01xxmn03/xxQn04xxUn04xxQ/n03xxMn01xxMn01xxMn03/n04xxMn01xxMn04/n11/n11/n03E0xA0xD0xS0xY0xn03";
const EVENT_SCHEMA_VERSION = 2;
const EVENT_LOCK_TTL_MS = 30 * 1000;
const EVENT_LOCK_REFRESH_INTERVAL_MS = 10 * 1000;
const EVENT_MATCH_RESOLVE_CONCURRENCY = 4;
const EVENT_SYNC_THROTTLE_WINDOW_MS = 500;
const MIN_STARTS_IN_MINUTES = 1;
const MAX_STARTS_IN_MINUTES = 7 * 24 * 60;
const MAX_EVENT_PARTICIPANTS = 32;
const EVENT_PROGRESS_WORKER_UID = "event-progress-worker";
const MONS_LINK_ADMINS = new Set([
  "ivan",
  "meinong",
  "obi",
  "bosch",
  "monsol",
  "bosch2",
  "trinket",
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

const resolveRequesterParticipation = (event, auth) => {
  const participants =
    event && event.participants && typeof event.participants === "object"
      ? event.participants
      : {};
  const requesterUid = normalizeString(auth && auth.uid);
  const claimedProfileId = normalizeString(
    auth && auth.token ? auth.token.profileId : "",
  );
  if (
    claimedProfileId &&
    participants[claimedProfileId] &&
    typeof participants[claimedProfileId] === "object"
  ) {
    return {
      isParticipant: true,
      profileId: claimedProfileId,
    };
  }
  for (const [profileId, participant] of Object.entries(participants)) {
    if (!participant || typeof participant !== "object") {
      continue;
    }
    if (
      claimedProfileId &&
      normalizeString(participant.profileId) === claimedProfileId
    ) {
      return {
        isParticipant: true,
        profileId,
      };
    }
    if (normalizeString(participant.loginUid) === requesterUid) {
      return {
        isParticipant: true,
        profileId,
      };
    }
  }
  if (normalizeString(event && event.createdByLoginUid) === requesterUid) {
    return {
      isParticipant: true,
      profileId: normalizeString(event && event.createdByProfileId) || null,
    };
  }
  return {
    isParticipant: false,
    profileId: null,
  };
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
  if (!MONS_LINK_ADMINS.has(username)) {
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
const parseMatchKey = (matchKey) => {
  const parts = normalizeString(matchKey).split("_");
  if (parts.length !== 2) {
    return null;
  }
  if (!/^\d+$/.test(parts[0]) || !/^\d+$/.test(parts[1])) {
    return null;
  }
  const roundIndex = toFiniteInteger(parts[0], NaN);
  const matchIndex = toFiniteInteger(parts[1], NaN);
  if (
    !Number.isFinite(roundIndex) ||
    roundIndex < 0 ||
    !Number.isFinite(matchIndex) ||
    matchIndex < 0
  ) {
    return null;
  }
  return {
    roundIndex,
    matchIndex,
  };
};
const getMatchIndexFromKey = (matchKey) =>
  parseMatchKey(matchKey)?.matchIndex ?? 0;
const getSortedMatchKeys = (matchesByKey) =>
  Object.keys(matchesByKey || {}).sort(
    (left, right) => getMatchIndexFromKey(left) - getMatchIndexFromKey(right),
  );
const getSortedRoundIndexes = (roundsByKey) => {
  return Array.from(
    new Set(
      Object.keys(roundsByKey || {})
        .map((roundKey) => toFiniteInteger(roundKey, NaN))
        .filter(
          (roundIndex) =>
            Number.isFinite(roundIndex) && Math.floor(roundIndex) >= 0,
        )
        .map((roundIndex) => Math.floor(roundIndex)),
    ),
  ).sort((left, right) => left - right);
};
const isResolvedMatchStatus = (status) =>
  status === "host" || status === "guest" || status === "bye";
const isMatchResolved = (match) => {
  if (isMatchWinnerDisqualified(match)) {
    return true;
  }
  const status = normalizeString(match && match.status);
  if (status === "bye") {
    return true;
  }
  return (
    (status === "host" || status === "guest") &&
    normalizeString(match && match.winnerProfileId) !== ""
  );
};
const isMatchWinnerDisqualified = (match) =>
  !!(match && match.winnerDisqualified === true);
const isMatchSlotBlocked = (match, slot) => {
  if (!match) {
    return false;
  }
  return slot === "guest"
    ? match.guestSlotBlocked === true
    : match.hostSlotBlocked === true;
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

const getFirstRoundByeSeeds = (participantCount, bracketSize, seedOrder) => {
  if (participantCount <= 0 || participantCount >= bracketSize) {
    return [];
  }

  const byeSeeds = [];
  const firstRoundMatchCount = bracketSize / 2;
  for (let matchIndex = 0; matchIndex < firstRoundMatchCount; matchIndex += 1) {
    const hostSeed = seedOrder[matchIndex * 2];
    const guestSeed = seedOrder[matchIndex * 2 + 1];
    const hostHasParticipant = hostSeed <= participantCount;
    const guestHasParticipant = guestSeed <= participantCount;
    if (hostHasParticipant === guestHasParticipant) {
      continue;
    }
    byeSeeds.push(hostHasParticipant ? hostSeed : guestSeed);
  }
  return byeSeeds;
};

const buildSeedToProfileId = ({
  participantIds,
  participantsById,
  bracketSize,
  seedOrder,
}) => {
  const participantCount = participantIds.length;
  const adminParticipantIds = [];
  const nonAdminParticipantIds = [];

  for (const profileId of participantIds) {
    const participant = participantsById[profileId];
    const username = normalizeUsername(participant && participant.username);
    if (MONS_LINK_ADMINS.has(username)) {
      adminParticipantIds.push(profileId);
    } else {
      nonAdminParticipantIds.push(profileId);
    }
  }

  const shuffledAdminParticipantIds = shuffle(adminParticipantIds);
  const shuffledNonAdminParticipantIds = shuffle(nonAdminParticipantIds);
  const byeSeeds = shuffle(
    getFirstRoundByeSeeds(participantCount, bracketSize, seedOrder),
  );
  const seedToProfileId = new Map();

  while (byeSeeds.length > 0 && shuffledAdminParticipantIds.length > 0) {
    const byeSeed = byeSeeds.pop();
    const profileId = shuffledAdminParticipantIds.pop();
    if (!byeSeed || !profileId) {
      break;
    }
    seedToProfileId.set(byeSeed, profileId);
  }

  const remainingProfileIds = shuffle([
    ...shuffledAdminParticipantIds,
    ...shuffledNonAdminParticipantIds,
  ]);
  let remainingIndex = 0;
  for (let seed = 1; seed <= participantCount; seed += 1) {
    if (seedToProfileId.has(seed)) {
      continue;
    }
    const profileId = remainingProfileIds[remainingIndex];
    remainingIndex += 1;
    if (!profileId) {
      break;
    }
    seedToProfileId.set(seed, profileId);
  }

  return seedToProfileId;
};

const createEmptyEventMatch = (matchKey) => ({
  matchKey,
  inviteId: null,
  status: "upcoming",
  resolvedAtMs: null,
  winnerDisqualified: false,
  winnerProfileId: null,
  loserProfileId: null,
  hostSlotBlocked: false,
  hostProfileId: null,
  hostLoginUid: null,
  hostDisplayName: null,
  hostEmojiId: null,
  hostAura: null,
  guestSlotBlocked: false,
  guestProfileId: null,
  guestLoginUid: null,
  guestDisplayName: null,
  guestEmojiId: null,
  guestAura: null,
});

const setMatchSlotBlocked = (match, slot, blocked) => {
  const field = slot === "guest" ? "guestSlotBlocked" : "hostSlotBlocked";
  const nextValue = blocked === true;
  if (match[field] === nextValue) {
    return false;
  }
  match[field] = nextValue;
  return true;
};

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
  if (participant && setMatchSlotBlocked(match, slot, false)) {
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
  winnerDisqualified = false,
}) => {
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
  if (winnerDisqualified) {
    const didClearParticipant = setMatchSlotParticipant(nextMatch, slot, null);
    const didSetBlocked = setMatchSlotBlocked(nextMatch, slot, true);
    return didClearParticipant || didSetBlocked;
  }

  const normalizedWinnerProfileId = normalizeString(winnerProfileId);
  if (!normalizedWinnerProfileId) {
    const didClearParticipant = setMatchSlotParticipant(nextMatch, slot, null);
    const didClearBlocked = setMatchSlotBlocked(nextMatch, slot, false);
    return didClearParticipant || didClearBlocked;
  }

  const didSetParticipant = setMatchSlotParticipant(
    nextMatch,
    slot,
    participantsById[normalizedWinnerProfileId] || null,
  );
  const didClearBlocked = setMatchSlotBlocked(nextMatch, slot, false);
  return didSetParticipant || didClearBlocked;
};

const createInviteForMatch = ({
  eventId,
  roundIndex,
  matchKey,
  match,
  inviteUpdates,
}) => {
  if (isMatchSlotBlocked(match, "host") || isMatchSlotBlocked(match, "guest")) {
    return false;
  }
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

const reconcileBracketMatchReadiness = ({
  eventId,
  rounds,
  nowMs,
  participantsById,
  inviteUpdates,
}) => {
  const sortedRoundIndexes = getSortedRoundIndexes(rounds);
  if (sortedRoundIndexes.length <= 0) {
    return false;
  }

  let didChange = false;
  let passChanged = true;
  let passCount = 0;

  while (passChanged && passCount < 32) {
    passChanged = false;
    passCount += 1;

    for (const roundIndex of sortedRoundIndexes) {
      const round = rounds[String(roundIndex)];
      if (!round || !round.matches || typeof round.matches !== "object") {
        continue;
      }
      const matchKeys = getSortedMatchKeys(round.matches);

      for (const matchKey of matchKeys) {
        const match = round.matches[matchKey];
        if (!match || typeof match !== "object") {
          continue;
        }

        const status = normalizeString(match.status);
        const hostProfileId = normalizeString(match.hostProfileId);
        const guestProfileId = normalizeString(match.guestProfileId);
        const winnerDisqualified = isMatchWinnerDisqualified(match);
        const hostSlotBlocked = isMatchSlotBlocked(match, "host");
        const guestSlotBlocked = isMatchSlotBlocked(match, "guest");
        const matchIndex = getMatchIndexFromKey(matchKey);

        if (winnerDisqualified && !isResolvedMatchStatus(status)) {
          if (
            assignWinnerToNextRound({
              rounds,
              roundIndex,
              matchIndex,
              winnerProfileId: null,
              participantsById,
              winnerDisqualified: true,
            })
          ) {
            didChange = true;
            passChanged = true;
          }
          continue;
        }

        if (isResolvedMatchStatus(status)) {
          const resolvedWinnerProfileId = normalizeString(match.winnerProfileId);
          const shouldBlockDownstream =
            winnerDisqualified || resolvedWinnerProfileId === "";
          if (
            assignWinnerToNextRound({
              rounds,
              roundIndex,
              matchIndex,
              winnerProfileId: resolvedWinnerProfileId,
              participantsById,
              winnerDisqualified: shouldBlockDownstream,
            })
          ) {
            didChange = true;
            passChanged = true;
          }
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
            passChanged = true;
          }
          continue;
        }

        const hasSingleParticipant = !!hostProfileId !== !!guestProfileId;
        if (
          hasSingleParticipant &&
          (roundIndex === 0 || hostSlotBlocked || guestSlotBlocked)
        ) {
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
            passChanged = true;
          }
          if (
            assignWinnerToNextRound({
              rounds,
              roundIndex,
              matchIndex,
              winnerProfileId,
              participantsById,
              winnerDisqualified,
            })
          ) {
            didChange = true;
            passChanged = true;
          }
          continue;
        }

        if (
          !hostProfileId &&
          !guestProfileId &&
          hostSlotBlocked &&
          guestSlotBlocked
        ) {
          if (
            applyMatchResolution(
              match,
              {
                status: "bye",
                winnerProfileId: null,
                loserProfileId: null,
              },
              nowMs,
            )
          ) {
            didChange = true;
            passChanged = true;
          }
          if (
            assignWinnerToNextRound({
              rounds,
              roundIndex,
              matchIndex,
              winnerProfileId: null,
              participantsById,
              winnerDisqualified: true,
            })
          ) {
            didChange = true;
            passChanged = true;
          }
          continue;
        }

        if (status !== "upcoming") {
          match.status = "upcoming";
          didChange = true;
          passChanged = true;
        }
      }
    }
  }

  return didChange;
};

const recomputeRoundStatuses = ({ rounds, nowMs }) => {
  const sortedRoundIndexes = getSortedRoundIndexes(rounds);
  const finalRoundIndex =
    sortedRoundIndexes.length > 0
      ? sortedRoundIndexes[sortedRoundIndexes.length - 1]
      : null;
  let earliestUnresolvedRoundIndex = null;
  let finalRoundWinnerProfileId = null;
  let didChange = false;

  for (const roundIndex of sortedRoundIndexes) {
    const round = rounds[String(roundIndex)];
    if (!round || !round.matches || typeof round.matches !== "object") {
      continue;
    }

    const matchKeys = getSortedMatchKeys(round.matches);
    const roundWinnerProfileIds = new Set();
    let allResolved = matchKeys.length > 0;
    let hasStarted = false;

    for (const matchKey of matchKeys) {
      const match = round.matches[matchKey];
      if (!match || typeof match !== "object") {
        allResolved = false;
        continue;
      }

      const status = normalizeString(match.status);
      const hostProfileId = normalizeString(match.hostProfileId);
      const guestProfileId = normalizeString(match.guestProfileId);
      if (
        status !== "upcoming" ||
        hostProfileId ||
        guestProfileId ||
        isMatchSlotBlocked(match, "host") ||
        isMatchSlotBlocked(match, "guest")
      ) {
        hasStarted = true;
      }

      if (!isMatchResolved(match)) {
        allResolved = false;
        continue;
      }
      const winnerProfileId = normalizeString(match.winnerProfileId);
      if (winnerProfileId && !isMatchWinnerDisqualified(match)) {
        roundWinnerProfileIds.add(winnerProfileId);
      }
    }

    const nextStatus = allResolved
      ? "completed"
      : hasStarted
        ? "active"
        : "upcoming";
    if (round.status !== nextStatus) {
      round.status = nextStatus;
      didChange = true;
    }

    if (nextStatus === "completed") {
      if (typeof round.completedAtMs !== "number") {
        round.completedAtMs = nowMs;
        didChange = true;
      }
    } else if (round.completedAtMs !== null) {
      round.completedAtMs = null;
      didChange = true;
    }

    if (!allResolved && earliestUnresolvedRoundIndex === null) {
      earliestUnresolvedRoundIndex = roundIndex;
    }

    if (
      finalRoundIndex !== null &&
      roundIndex === finalRoundIndex &&
      allResolved
    ) {
      const winners = Array.from(roundWinnerProfileIds);
      if (winners.length === 1) {
        finalRoundWinnerProfileId = winners[0];
      }
    }
  }

  return {
    didChange,
    finalRoundIndex,
    earliestUnresolvedRoundIndex,
    finalRoundWinnerProfileId,
  };
};

const rebuildParticipantStatesFromRounds = ({
  participantsById,
  rounds,
  winnerProfileId,
  eventEnded,
}) => {
  const eliminationsByProfileId = {};
  const sortedRoundIndexes = getSortedRoundIndexes(rounds);
  for (const roundIndex of sortedRoundIndexes) {
    const round = rounds[String(roundIndex)];
    if (!round || !round.matches || typeof round.matches !== "object") {
      continue;
    }
    const matchKeys = getSortedMatchKeys(round.matches);
    for (const matchKey of matchKeys) {
      const match = round.matches[matchKey];
      if (!match || typeof match !== "object") {
        continue;
      }

      if (!isMatchResolved(match)) {
        continue;
      }
      const loserProfileId = normalizeString(match && match.loserProfileId);
      if (!loserProfileId || eliminationsByProfileId[loserProfileId]) {
        continue;
      }
      eliminationsByProfileId[loserProfileId] = {
        eliminatedRoundIndex: roundIndex,
        eliminatedByProfileId:
          normalizeString(match && match.winnerProfileId) || null,
      };
    }
  }

  const normalizedWinnerProfileId = normalizeStringOrNull(winnerProfileId);
  const nextParticipants = {};
  let didChange = false;
  for (const [profileId, participant] of Object.entries(
    participantsById || {},
  )) {
    if (!participant || typeof participant !== "object") {
      nextParticipants[profileId] = participant;
      continue;
    }

    const elimination = eliminationsByProfileId[profileId] || null;
    let state = "active";
    let eliminatedRoundIndex = null;
    let eliminatedByProfileId = null;

    if (
      eventEnded &&
      normalizedWinnerProfileId &&
      profileId === normalizedWinnerProfileId
    ) {
      state = "winner";
    } else if (elimination) {
      state = "eliminated";
      eliminatedRoundIndex = elimination.eliminatedRoundIndex;
      eliminatedByProfileId = elimination.eliminatedByProfileId;
    }

    const normalizedCurrentEliminatedRoundIndex =
      typeof participant.eliminatedRoundIndex === "number"
        ? Math.floor(participant.eliminatedRoundIndex)
        : null;
    const normalizedCurrentEliminatedByProfileId = normalizeStringOrNull(
      participant.eliminatedByProfileId,
    );
    if (
      participant.state !== state ||
      normalizedCurrentEliminatedRoundIndex !== eliminatedRoundIndex ||
      normalizedCurrentEliminatedByProfileId !== eliminatedByProfileId
    ) {
      didChange = true;
    }

    nextParticipants[profileId] = {
      ...participant,
      state,
      eliminatedRoundIndex,
      eliminatedByProfileId,
    };
  }

  return {
    didChange,
    participantsById: nextParticipants,
  };
};

const buildFixedBracketState = ({
  eventId,
  participantIds,
  participantsById,
  nowMs,
}) => {
  const bracketSize = getBracketSize(participantIds.length);
  const roundCount = Math.max(1, Math.round(Math.log2(bracketSize)));
  const seedOrder = buildSeedOrder(bracketSize);
  const inviteUpdates = {};
  const rounds = {};
  const seedToProfileId = buildSeedToProfileId({
    participantIds,
    participantsById,
    bracketSize,
    seedOrder,
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

  reconcileBracketMatchReadiness({
    eventId,
    rounds,
    nowMs,
    participantsById,
    inviteUpdates,
  });

  const { earliestUnresolvedRoundIndex } = recomputeRoundStatuses({
    rounds,
    nowMs,
  });

  return {
    bracketSize,
    roundCount,
    currentRoundIndex:
      earliestUnresolvedRoundIndex === null ? 0 : earliestUnresolvedRoundIndex,
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
    event.currentRoundIndex = bracket.currentRoundIndex;
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

const tryAcquireEventSyncThrottle = async (eventId, ownerUid) => {
  const throttleRef = admin.database().ref(`eventSyncThrottles/${eventId}`);
  const nowMs = getNowMs();
  const token = randomString(10);
  const result = await throttleRef.transaction((current) => {
    const lastStartedAtMs =
      current && typeof current.startedAtMs === "number"
        ? Math.floor(current.startedAtMs)
        : 0;
    if (
      lastStartedAtMs > 0 &&
      nowMs - lastStartedAtMs < EVENT_SYNC_THROTTLE_WINDOW_MS
    ) {
      return;
    }
    return {
      startedAtMs: nowMs,
      ownerUid,
      token,
    };
  });
  if (!result.committed) {
    return null;
  }
  return {
    startedAtMs: nowMs,
    ownerUid,
    token,
  };
};

const logSyncEventStateResult = (payload) => {
  try {
    console.log("event:sync:result", payload);
  } catch (error) {
    console.error(
      "event:sync:result:log:error",
      error && error.message ? error.message : error,
    );
  }
};

const createSyncLog = ({ eventId, requesterUid, mode }) => ({
  mode,
  eventId,
  requesterUid: requesterUid || null,
  requesterProfileId: null,
  skipped: false,
  reason: null,
  didChange: false,
  durationMs: 0,
});

const clearEventProgressFallbackSignal = async (eventId, signalId) => {
  const normalizedEventId = normalizeString(eventId);
  const normalizedSignalId = normalizeString(signalId);
  if (!normalizedEventId || !normalizedSignalId) {
    return;
  }
  try {
    await admin
      .database()
      .ref(`eventProgressFallback/${normalizedEventId}/${normalizedSignalId}`)
      .remove();
  } catch (error) {
    console.error("event:progress:fallback:clear:error", {
      eventId: normalizedEventId,
      signalId: normalizedSignalId,
      error: error && error.message ? error.message : error,
    });
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

  try {
    await enqueueEventProgressTask({
      eventId,
      sourceKey: `start:${eventId}`,
      reason: "scheduled-start",
      scheduleTimeMs: startAtMs,
    });
  } catch (error) {
    console.error("event:progress:enqueue:error", {
      eventId,
      sourceKey: `start:${eventId}`,
      reason: "scheduled-start",
      error: error && error.message ? error.message : error,
    });
    throw new HttpsError(
      "unavailable",
      "Could not schedule event start. Please try again.",
    );
  }

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

exports.disqualifyEventMatchWinners = onCall(async (request) => {
  const startedAtMs = getNowMs();
  const eventId = normalizeString(request.data && request.data.eventId);
  const matchKeyInput = normalizeString(request.data && request.data.matchKey);
  const syncLog = createSyncLog({
    eventId: eventId || null,
    requesterUid: request && request.auth ? request.auth.uid : null,
    mode: "callable-disqualify",
  });
  syncLog.targetMatchKey = matchKeyInput || null;
  let lockHandle = null;
  let stopLockHeartbeat = () => {};

  try {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "The function must be called while authenticated.",
      );
    }
    await ensurePilotEventCreator(request.auth.uid);

    if (!eventId) {
      throw new HttpsError("invalid-argument", "eventId is required.");
    }
    const parsedMatchKey = parseMatchKey(matchKeyInput);
    if (!parsedMatchKey) {
      throw new HttpsError("invalid-argument", "matchKey is invalid.");
    }

    lockHandle = await acquireEventLockWithRetry(eventId, request.auth.uid, {
      attempts: 40,
      delayMs: 100,
    });
    if (!lockHandle) {
      throw new HttpsError(
        "unavailable",
        "Event is busy. Please try disqualifying again.",
      );
    }
    stopLockHeartbeat = startEventLockHeartbeat(lockHandle);

    let didDisqualify = false;
    let resolvedMatchKey = matchKeyInput;
    try {
      const eventSnapshot = await admin
        .database()
        .ref(`events/${eventId}`)
        .once("value");
      if (!eventSnapshot.exists()) {
        throw new HttpsError("not-found", "Event not found.");
      }
      const event = cloneValue(eventSnapshot.val() || {});
      if (normalizeString(event.status) !== "active") {
        throw new HttpsError(
          "failed-precondition",
          "Only active events can be updated.",
        );
      }

      const round =
        event.rounds && typeof event.rounds === "object"
          ? event.rounds[String(parsedMatchKey.roundIndex)]
          : null;
      if (!round || !round.matches || typeof round.matches !== "object") {
        throw new HttpsError("failed-precondition", "Selected match not found.");
      }

      let targetMatch = round.matches[resolvedMatchKey];
      if (!targetMatch || typeof targetMatch !== "object") {
        const fallbackEntry =
          Object.entries(round.matches).find(([candidateMatchKey]) => {
            const parsedCandidate = parseMatchKey(candidateMatchKey);
            return parsedCandidate?.matchIndex === parsedMatchKey.matchIndex;
          }) || null;
        if (fallbackEntry) {
          [resolvedMatchKey, targetMatch] = fallbackEntry;
        }
      }
      if (!targetMatch || typeof targetMatch !== "object") {
        throw new HttpsError("failed-precondition", "Selected match not found.");
      }

      if (
        normalizeString(targetMatch.status) !== "pending" ||
        !normalizeString(targetMatch.inviteId)
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Only active matches can be disqualified.",
        );
      }
      if (
        !normalizeString(targetMatch.hostProfileId) ||
        !normalizeString(targetMatch.guestProfileId)
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Selected match must have two participants.",
        );
      }

      didDisqualify = !isMatchWinnerDisqualified(targetMatch);
      if (didDisqualify) {
        const lockOwned = await isEventLockStillOwned(lockHandle);
        if (!lockOwned) {
          throw new HttpsError(
            "unavailable",
            "Event is busy. Please try disqualifying again.",
          );
        }
        await admin.database().ref().update({
          [`events/${eventId}/rounds/${parsedMatchKey.roundIndex}/matches/${resolvedMatchKey}/winnerDisqualified`]:
            true,
          [`events/${eventId}/updatedAtMs`]: getNowMs(),
        });
      }
    } finally {
      stopLockHeartbeat();
      stopLockHeartbeat = () => {};
      await releaseEventLock(lockHandle);
      lockHandle = null;
    }

    let syncResult = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      syncLog.skipped = false;
      syncLog.reason = null;
      syncResult = await runEventSyncState({
        eventId,
        requesterUid: request.auth.uid,
        auth: request.auth,
        enforceParticipantGate: false,
        enforceThrottle: false,
        syncLog,
      });
      if (!(syncResult && syncResult.skipped && syncResult.reason === "locked")) {
        break;
      }
      await sleep(80);
    }

    return {
      ...syncResult,
      didDisqualify,
      matchKey: resolvedMatchKey,
    };
  } finally {
    stopLockHeartbeat();
    if (lockHandle) {
      await releaseEventLock(lockHandle);
    }
    syncLog.durationMs = getNowMs() - startedAtMs;
    logSyncEventStateResult(syncLog);
  }
});

const buildSkippedSyncResponse = ({ eventId, reason, event }) => ({
  ok: true,
  eventId,
  skipped: true,
  reason,
  ...(event !== undefined ? { event } : {}),
});

const runEventSyncState = async ({
  eventId,
  requesterUid,
  auth,
  enforceParticipantGate,
  enforceThrottle,
  syncLog,
}) => {
  let lockHandle = null;
  let stopLockHeartbeat = () => {};

  try {
    const eventSnapshot = await admin
      .database()
      .ref(`events/${eventId}`)
      .once("value");
    if (!eventSnapshot.exists()) {
      throw new HttpsError("not-found", "Event not found.");
    }
    const initialEvent = cloneValue(eventSnapshot.val() || {});

    if (enforceParticipantGate) {
      const requesterParticipation = resolveRequesterParticipation(
        initialEvent,
        auth,
      );
      syncLog.requesterProfileId = requesterParticipation.profileId;
      if (!requesterParticipation.isParticipant) {
        syncLog.skipped = true;
        syncLog.reason = "not-participant";
        return buildSkippedSyncResponse({
          eventId,
          reason: "not-participant",
        });
      }
    }

    if (enforceThrottle) {
      const syncThrottle = await tryAcquireEventSyncThrottle(
        eventId,
        requesterUid,
      );
      if (!syncThrottle) {
        syncLog.skipped = true;
        syncLog.reason = "rate-limited";
        return buildSkippedSyncResponse({
          eventId,
          reason: "rate-limited",
        });
      }
    }

    lockHandle = await acquireEventLockWithRetry(eventId, requesterUid, {
      attempts: 10,
      delayMs: 100,
    });
    if (!lockHandle) {
      syncLog.skipped = true;
      syncLog.reason = "locked";
      return buildSkippedSyncResponse({
        eventId,
        reason: "locked",
      });
    }
    stopLockHeartbeat = startEventLockHeartbeat(lockHandle);

    const lockedEventSnapshot = await admin
      .database()
      .ref(`events/${eventId}`)
      .once("value");
    if (!lockedEventSnapshot.exists()) {
      throw new HttpsError("not-found", "Event not found.");
    }
    const event = cloneValue(lockedEventSnapshot.val() || {});
    if (enforceParticipantGate) {
      const lockedRequesterParticipation = resolveRequesterParticipation(
        event,
        auth,
      );
      syncLog.requesterProfileId = lockedRequesterParticipation.profileId;
      if (!lockedRequesterParticipation.isParticipant) {
        syncLog.skipped = true;
        syncLog.reason = "not-participant";
        return buildSkippedSyncResponse({
          eventId,
          reason: "not-participant",
        });
      }
    }
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
      const normalizedOriginalCurrentRoundIndex = toFiniteInteger(
        event.currentRoundIndex,
        NaN,
      );
      const originalCurrentRoundIndex = Number.isFinite(
        normalizedOriginalCurrentRoundIndex,
      )
        ? normalizedOriginalCurrentRoundIndex
        : null;
      const originalStatus = normalizeString(event.status) || "active";
      const originalEndedAtMs =
        typeof event.endedAtMs === "number" ? Math.floor(event.endedAtMs) : null;
      const originalWinnerProfileId = normalizeStringOrNull(
        event.winnerProfileId,
      );
      const originalWinnerDisplayName = normalizeStringOrNull(
        event.winnerDisplayName,
      );
      const rounds = cloneValue(
        event.rounds && typeof event.rounds === "object" ? event.rounds : {},
      );
      let participants = cloneValue(
        event.participants && typeof event.participants === "object"
          ? event.participants
          : {},
      );
      const inviteUpdates = {};
      let roundsChanged = false;
      let participantsChanged = false;
      const sortedRoundIndexes = getSortedRoundIndexes(rounds);
      for (const roundIndex of sortedRoundIndexes) {
        const round = rounds[String(roundIndex)];
        if (!round || !round.matches || typeof round.matches !== "object") {
          continue;
        }
        const resolvedEntries = await resolveRoundMatchesWithConcurrency(
          round.matches,
        );
        for (const entry of resolvedEntries) {
          const { matchRecord, resolved } = entry;
          if (!resolved) {
            continue;
          }
          if (applyMatchResolution(matchRecord, resolved, nowMs)) {
            roundsChanged = true;
          }
        }
      }

      if (
        reconcileBracketMatchReadiness({
          eventId,
          rounds,
          nowMs,
          participantsById: participants,
          inviteUpdates,
        })
      ) {
        roundsChanged = true;
      }

      const {
        didChange: roundStatusChanged,
        finalRoundIndex,
        earliestUnresolvedRoundIndex,
        finalRoundWinnerProfileId,
      } = recomputeRoundStatuses({
        rounds,
        nowMs,
      });
      if (roundStatusChanged) {
        roundsChanged = true;
      }

      const finalRoundCompleted =
        finalRoundIndex !== null && earliestUnresolvedRoundIndex === null;
      const eventShouldEnd = finalRoundCompleted;
      const winnerProfileId = normalizeString(finalRoundWinnerProfileId) || null;
      const nextCurrentRoundIndex =
        earliestUnresolvedRoundIndex !== null
          ? earliestUnresolvedRoundIndex
          : finalRoundIndex;
      event.currentRoundIndex = nextCurrentRoundIndex;

      const participantStateResult = rebuildParticipantStatesFromRounds({
        participantsById: participants,
        rounds,
        winnerProfileId,
        eventEnded: eventShouldEnd,
      });
      if (participantStateResult.didChange) {
        participants = participantStateResult.participantsById;
        participantsChanged = true;
      }

      if (eventShouldEnd) {
        const winnerParticipant =
          (winnerProfileId && participants[winnerProfileId]) || null;
        event.status = "ended";
        if (typeof event.endedAtMs !== "number") {
          event.endedAtMs = nowMs;
        }
        event.winnerProfileId = winnerProfileId;
        event.winnerDisplayName = winnerParticipant
          ? winnerParticipant.displayName
          : null;
      } else {
        event.status = "active";
        event.endedAtMs = null;
        event.winnerProfileId = null;
        event.winnerDisplayName = null;
      }

      let eventChanged = false;
      const normalizedCurrentRoundIndex =
        typeof event.currentRoundIndex === "number"
          ? Math.floor(event.currentRoundIndex)
          : null;
      if (normalizedCurrentRoundIndex !== originalCurrentRoundIndex) {
        updates[`events/${eventId}/currentRoundIndex`] =
          normalizedCurrentRoundIndex;
        eventChanged = true;
      }

      const normalizedStatus = normalizeString(event.status) || "active";
      if (normalizedStatus !== originalStatus) {
        updates[`events/${eventId}/status`] = normalizedStatus;
        eventChanged = true;
      }

      const normalizedEndedAtMs =
        typeof event.endedAtMs === "number" ? Math.floor(event.endedAtMs) : null;
      if (normalizedEndedAtMs !== originalEndedAtMs) {
        updates[`events/${eventId}/endedAtMs`] = normalizedEndedAtMs;
        eventChanged = true;
      }

      const normalizedWinnerProfileId = normalizeStringOrNull(
        event.winnerProfileId,
      );
      if (normalizedWinnerProfileId !== originalWinnerProfileId) {
        updates[`events/${eventId}/winnerProfileId`] = normalizedWinnerProfileId;
        eventChanged = true;
      }

      const normalizedWinnerDisplayName = normalizeStringOrNull(
        event.winnerDisplayName,
      );
      if (normalizedWinnerDisplayName !== originalWinnerDisplayName) {
        updates[`events/${eventId}/winnerDisplayName`] =
          normalizedWinnerDisplayName;
        eventChanged = true;
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
      if (
        roundsChanged ||
        participantsChanged ||
        Object.keys(inviteUpdates).length > 0 ||
        eventChanged
      ) {
        updates[`events/${eventId}/updatedAtMs`] = nowMs;
        didChange = true;
      }
    } else if (event.status === "ended") {
      const rounds = cloneValue(
        event.rounds && typeof event.rounds === "object" ? event.rounds : {},
      );
      let roundsChanged = false;
      const sortedRoundIndexes = getSortedRoundIndexes(rounds);
      for (const roundIndex of sortedRoundIndexes) {
        const round = rounds[String(roundIndex)];
        if (!round || !round.matches || typeof round.matches !== "object") {
          continue;
        }
        const resolvedEntries = await resolveRoundMatchesWithConcurrency(
          round.matches,
        );
        for (const entry of resolvedEntries) {
          const { matchRecord, resolved } = entry;
          if (!resolved) {
            continue;
          }
          if (applyMatchResolution(matchRecord, resolved, nowMs)) {
            roundsChanged = true;
          }
        }
      }
      if (roundsChanged) {
        updates[`events/${eventId}/rounds`] = rounds;
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
        syncLog.skipped = true;
        syncLog.reason = "locked";
        return buildSkippedSyncResponse({
          eventId,
          reason: "locked",
          event: latestSnapshot.val(),
        });
      }
      await admin.database().ref().update(updates);
    }

    const refreshedSnapshot = await admin
      .database()
      .ref(`events/${eventId}`)
      .once("value");
    syncLog.didChange = didChange;
    return {
      ok: true,
      eventId,
      didChange,
      event: refreshedSnapshot.val(),
    };
  } catch (error) {
    if (!syncLog.reason) {
      syncLog.reason =
        error && typeof error === "object" && "code" in error
          ? String(error.code)
          : "error";
    }
    throw error;
  } finally {
    if (lockHandle) {
      stopLockHeartbeat();
      await releaseEventLock(lockHandle);
    }
  }
};

exports.syncEventState = onCall(
  {
    maxInstances: 20,
    concurrency: 20,
    memory: "512MiB",
    timeoutSeconds: 30,
  },
  async (request) => {
    const startedAtMs = getNowMs();
    const eventId = normalizeString(request.data && request.data.eventId);
    const syncLog = createSyncLog({
      eventId: eventId || null,
      requesterUid: request && request.auth ? request.auth.uid : null,
      mode: "callable",
    });
    try {
      if (!request.auth) {
        throw new HttpsError(
          "unauthenticated",
          "The function must be called while authenticated.",
        );
      }
      if (!eventId) {
        throw new HttpsError("invalid-argument", "eventId is required.");
      }
      return await runEventSyncState({
        eventId,
        requesterUid: request.auth.uid,
        auth: request.auth,
        enforceParticipantGate: true,
        enforceThrottle: true,
        syncLog,
      });
    } finally {
      syncLog.durationMs = getNowMs() - startedAtMs;
      logSyncEventStateResult(syncLog);
    }
  },
);

exports.processEventProgress = onTaskDispatched(
  {
    maxInstances: 20,
    concurrency: 20,
    memory: "512MiB",
    timeoutSeconds: 30,
    retryConfig: {
      maxAttempts: 12,
      minBackoffSeconds: 1,
      maxBackoffSeconds: 30,
      maxDoublings: 5,
    },
  },
  async (request) => {
    const payload = request && request.data ? request.data : {};
    const eventId = normalizeString(payload.eventId);
    const sourceKey = normalizeString(payload.sourceKey);
    const reason = normalizeString(payload.reason) || "progress";
    if (!eventId) {
      console.error("event:progress:task:invalid-payload", {
        sourceKey,
        reason,
      });
      return;
    }

    const startedAtMs = getNowMs();
    const syncLog = createSyncLog({
      eventId,
      requesterUid: EVENT_PROGRESS_WORKER_UID,
      mode: "worker",
    });
    syncLog.sourceKey = sourceKey || null;
    syncLog.triggerReason = reason;
    syncLog.taskId = request && request.id ? request.id : null;

    try {
      const result = await runEventSyncState({
        eventId,
        requesterUid: EVENT_PROGRESS_WORKER_UID,
        auth: null,
        enforceParticipantGate: false,
        enforceThrottle: false,
        syncLog,
      });
      if (result && result.skipped && result.reason === "locked") {
        const lockedError = new Error("locked");
        lockedError.code = "locked";
        throw lockedError;
      }
    } catch (error) {
      const errorCode =
        error && typeof error === "object" && "code" in error
          ? String(error.code)
          : "error";
      syncLog.reason = syncLog.reason || errorCode;
      if (errorCode === "not-found") {
        syncLog.skipped = true;
        return;
      }
      throw error;
    } finally {
      syncLog.durationMs = getNowMs() - startedAtMs;
      logSyncEventStateResult(syncLog);
    }
  },
);

exports.processEventProgressFallback = onValueWritten(
  {
    ref: "/eventProgressFallback/{eventId}/{signalId}",
    maxInstances: 20,
    concurrency: 20,
    memory: "512MiB",
    timeoutSeconds: 30,
    retry: true,
  },
  async (event) => {
    const eventId = normalizeString(event.params.eventId);
    const signalId = normalizeString(event.params.signalId);
    if (!eventId || !signalId || !event.data.after.exists()) {
      return;
    }

    const signalRef = admin
      .database()
      .ref(`eventProgressFallback/${eventId}/${signalId}`);
    const liveSignalSnapshot = await signalRef.once("value");
    if (!liveSignalSnapshot.exists()) {
      return;
    }
    const payload =
      liveSignalSnapshot.val() && typeof liveSignalSnapshot.val() === "object"
        ? liveSignalSnapshot.val()
        : {};
    const sourceKey = normalizeString(payload.sourceKey) || signalId;
    const reason = normalizeString(payload.reason) || "fallback";

    const startedAtMs = getNowMs();
    const syncLog = createSyncLog({
      eventId,
      requesterUid: `${EVENT_PROGRESS_WORKER_UID}-fallback`,
      mode: "worker-fallback",
    });
    syncLog.sourceKey = sourceKey;
    syncLog.triggerReason = reason;
    syncLog.signalId = signalId;

    try {
      const result = await runEventSyncState({
        eventId,
        requesterUid: `${EVENT_PROGRESS_WORKER_UID}-fallback`,
        auth: null,
        enforceParticipantGate: false,
        enforceThrottle: false,
        syncLog,
      });
      if (result && result.skipped && result.reason === "locked") {
        const lockedError = new Error("locked");
        lockedError.code = "locked";
        throw lockedError;
      }
      await clearEventProgressFallbackSignal(eventId, signalId);
    } catch (error) {
      const errorCode =
        error && typeof error === "object" && "code" in error
          ? String(error.code)
          : "error";
      syncLog.reason = syncLog.reason || errorCode;
      if (errorCode === "not-found") {
        syncLog.skipped = true;
        await clearEventProgressFallbackSignal(eventId, signalId);
        return;
      }
      throw error;
    } finally {
      syncLog.durationMs = getNowMs() - startedAtMs;
      logSyncEventStateResult(syncLog);
    }
  },
);
