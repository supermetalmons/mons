const admin = require("firebase-admin");
const {
  onValueCreated,
  onValueUpdated,
} = require("firebase-functions/v2/database");
const { customTelegramEmojis, getTelegramEmojiTag } = require("./utils");

const EVENT_TELEGRAM_STATE_ROOT = "eventTelegramMessages";
const EVENT_TELEGRAM_LOCK_ROOT = "eventTelegramLocks";
const EVENT_TELEGRAM_STARTED_SENT_ROOT = "eventTelegramStartedSent";
const EVENT_TELEGRAM_LOCK_TTL_MS = 2 * 60 * 1000;
const EVENT_TELEGRAM_LOCK_ATTEMPTS = 3;
const EVENT_TELEGRAM_LOCK_RETRY_DELAY_MS = 120;
const EVENT_TELEGRAM_TRIGGER_BASE_OPTIONS = {
  maxInstances: 5,
  concurrency: 20,
  memory: "256MiB",
  cpu: 1,
};
const EVENT_TELEGRAM_CREATED_OPTIONS = {
  ...EVENT_TELEGRAM_TRIGGER_BASE_OPTIONS,
  ref: "/events/{eventId}",
};
const EVENT_TELEGRAM_UPDATED_OPTIONS = {
  ...EVENT_TELEGRAM_TRIGGER_BASE_OPTIONS,
  ref: "/events/{eventId}",
};
const EVENT_URL_ROOT = "https://mons.link/event";
const TELEGRAM_API_URL = "https://api.telegram.org";

const EVENT_STATUS_SCHEDULED = "scheduled";
const EVENT_STATUS_ACTIVE = "active";
const EVENT_STATUS_ENDED = "ended";
const EVENT_STATUS_DISMISSED = "dismissed";

const normalizeString = (value) =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : "";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeNumberOrNull = (value) => {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return Math.floor(numeric);
};

const normalizePositiveNumberOrNull = (value) => {
  const numeric = normalizeNumberOrNull(value);
  if (numeric === null || numeric <= 0) {
    return null;
  }
  return numeric;
};

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const toUtcDayKey = (timestampMs) => {
  const date = new Date(timestampMs);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
};

const shouldIncludeUtcDateLine = (startAtMs, nowMs = Date.now()) =>
  toUtcDayKey(startAtMs) !== toUtcDayKey(nowMs);

const formatUtcDateLine = (startAtMs) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(startAtMs));

const formatTimeInZone = (startAtMs, timeZone) => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const parts = formatter.formatToParts(new Date(startAtMs));
  let hour = "";
  let minute = "";
  let dayPeriod = "";
  for (const part of parts) {
    if (part.type === "hour") {
      hour = part.value;
    } else if (part.type === "minute") {
      minute = part.value;
    } else if (part.type === "dayPeriod") {
      dayPeriod = part.value.toUpperCase();
    }
  }
  if (!hour || !dayPeriod) {
    const fallback = formatter.format(new Date(startAtMs));
    return fallback.toUpperCase();
  }
  if (!minute || minute === "00") {
    return `${hour} ${dayPeriod}`;
  }
  return `${hour}:${minute} ${dayPeriod}`;
};

const formatPtEtUtcLine = (startAtMs) => {
  const pt = formatTimeInZone(startAtMs, "America/Los_Angeles");
  const et = formatTimeInZone(startAtMs, "America/New_York");
  const utc = formatTimeInZone(startAtMs, "UTC");
  return `${pt} PT / ${et} ET / ${utc} UTC`;
};

const getParticipantRecords = (eventData) => {
  const participants =
    eventData &&
    eventData.participants &&
    typeof eventData.participants === "object"
      ? eventData.participants
      : {};
  return Object.entries(participants)
    .filter(
      ([profileId, participant]) =>
        typeof profileId === "string" &&
        profileId.trim() !== "" &&
        participant &&
        typeof participant === "object",
    )
    .map(([profileId, participant]) => ({
      profileId,
      participant,
    }))
    .sort((left, right) => {
      const leftJoined = normalizePositiveNumberOrNull(
        left.participant.joinedAtMs,
      );
      const rightJoined = normalizePositiveNumberOrNull(
        right.participant.joinedAtMs,
      );
      const leftJoinedValue = leftJoined === null ? 0 : leftJoined;
      const rightJoinedValue = rightJoined === null ? 0 : rightJoined;
      if (leftJoinedValue !== rightJoinedValue) {
        return leftJoinedValue - rightJoinedValue;
      }
      return left.profileId.localeCompare(right.profileId);
    });
};

const buildParticipantRenderKey = (eventData) =>
  getParticipantRecords(eventData)
    .map(({ profileId, participant }) => {
      const emojiId = normalizePositiveNumberOrNull(participant.emojiId);
      const joinedAtMs = normalizePositiveNumberOrNull(participant.joinedAtMs);
      const username = normalizeString(participant.username);
      const displayName = normalizeString(participant.displayName);
      return [
        profileId,
        username,
        displayName,
        emojiId === null ? "" : String(emojiId),
        joinedAtMs === null ? "" : String(joinedAtMs),
      ].join("|");
    })
    .join(";");

const resolveParticipantName = (participant, fallbackDisplayName = "") => {
  const username = normalizeString(participant && participant.username);
  if (username) {
    return username;
  }
  const displayName = normalizeString(participant && participant.displayName);
  if (displayName) {
    return displayName;
  }
  const fallback = normalizeString(fallbackDisplayName);
  return fallback || "anon";
};

const resolveParticipantToken = (participant, fallbackDisplayName = "") => {
  const emoji = normalizePositiveNumberOrNull(
    participant && participant.emojiId,
  );
  const customEmojiId =
    emoji === null ? "" : normalizeString(customTelegramEmojis[emoji]);
  const emojiTag = customEmojiId ? getTelegramEmojiTag(customEmojiId) : "";
  const name = escapeHtml(
    resolveParticipantName(participant, fallbackDisplayName),
  );
  return emojiTag ? `${emojiTag} ${name}` : name;
};

const getParticipantsByProfileId = (eventData) => {
  const map = new Map();
  for (const { profileId, participant } of getParticipantRecords(eventData)) {
    map.set(profileId, participant);
  }
  return map;
};

const toMatchIndex = (matchKey) => {
  const normalized = normalizeString(matchKey);
  const parts = normalized.split("_");
  if (parts.length !== 2) {
    return Number.MAX_SAFE_INTEGER;
  }
  const index = normalizeNumberOrNull(parts[1]);
  return index === null || index < 0 ? Number.MAX_SAFE_INTEGER : index;
};

const collectActiveMatchEntries = (eventData) => {
  const rounds =
    eventData && eventData.rounds && typeof eventData.rounds === "object"
      ? eventData.rounds
      : {};
  const entries = [];
  for (const roundKey of Object.keys(rounds)) {
    const round = rounds[roundKey];
    if (!round || typeof round !== "object") {
      continue;
    }
    const roundIndex =
      normalizeNumberOrNull(round.roundIndex) ??
      normalizeNumberOrNull(roundKey) ??
      Number.MAX_SAFE_INTEGER;
    const matches =
      round.matches && typeof round.matches === "object" ? round.matches : {};
    const sortedMatchKeys = Object.keys(matches).sort(
      (left, right) => toMatchIndex(left) - toMatchIndex(right),
    );
    for (const matchKey of sortedMatchKeys) {
      const match = matches[matchKey];
      if (!match || typeof match !== "object") {
        continue;
      }
      const inviteId = normalizeString(match.inviteId);
      if (!inviteId) {
        continue;
      }
      entries.push({
        key: `round:${roundIndex}:${matchKey}`,
        match,
        sortRank: roundIndex,
        sortIndex: toMatchIndex(matchKey),
      });
    }
  }
  const thirdPlaceMatch =
    eventData &&
    eventData.thirdPlaceMatch &&
    typeof eventData.thirdPlaceMatch === "object"
      ? eventData.thirdPlaceMatch
      : null;
  if (thirdPlaceMatch && normalizeString(thirdPlaceMatch.inviteId)) {
    entries.push({
      key: "third_place",
      match: thirdPlaceMatch,
      sortRank: Number.MAX_SAFE_INTEGER - 1,
      sortIndex: 0,
    });
  }
  return entries.sort((left, right) => {
    if (left.sortRank !== right.sortRank) {
      return left.sortRank - right.sortRank;
    }
    if (left.sortIndex !== right.sortIndex) {
      return left.sortIndex - right.sortIndex;
    }
    return left.key.localeCompare(right.key);
  });
};

const buildStartedThreadMatchKey = (eventData) =>
  collectActiveMatchEntries(eventData)
    .map((entry) => entry.key)
    .join(";");

const buildEventSignature = (eventData, nowMs = Date.now()) => {
  if (!eventData || eventData.announceOnTelegram !== true) {
    return "skip";
  }
  const status = normalizeString(eventData.status) || EVENT_STATUS_SCHEDULED;
  if (status === EVENT_STATUS_ENDED || status === EVENT_STATUS_DISMISSED) {
    return "skip";
  }
  const startAtMs = normalizePositiveNumberOrNull(eventData.startAtMs);
  const participantRenderKey = buildParticipantRenderKey(eventData);
  const upcomingSignature =
    status === EVENT_STATUS_SCHEDULED && startAtMs
      ? {
          ptEtUtcLine: formatPtEtUtcLine(startAtMs),
          includeDateLine: shouldIncludeUtcDateLine(startAtMs, nowMs),
          dateLine: shouldIncludeUtcDateLine(startAtMs, nowMs)
            ? formatUtcDateLine(startAtMs)
            : "",
          participantRenderKey,
        }
      : null;
  return JSON.stringify({
    announceOnTelegram: true,
    status,
    startAtMs: startAtMs || null,
    upcoming: upcomingSignature,
    startedMatchKey: buildStartedThreadMatchKey(eventData),
  });
};

const renderUpcomingMessage = (eventId, eventData, nowMs = Date.now()) => {
  const status = normalizeString(eventData && eventData.status);
  const startAtMs = normalizePositiveNumberOrNull(
    eventData && eventData.startAtMs,
  );
  if (status !== EVENT_STATUS_SCHEDULED || !startAtMs) {
    return null;
  }
  const lines = [
    "upcoming event alert",
    "",
    `${EVENT_URL_ROOT}/${eventId}`,
    "",
    formatPtEtUtcLine(startAtMs),
  ];
  if (shouldIncludeUtcDateLine(startAtMs, nowMs)) {
    lines.push("", formatUtcDateLine(startAtMs));
  }
  const participants = getParticipantRecords(eventData);
  if (participants.length >= 2) {
    const participantLine = participants
      .map(({ participant }) => resolveParticipantToken(participant))
      .join(" ");
    if (participantLine) {
      lines.push("", participantLine);
    }
  }
  return lines.join("\n");
};

const renderStartedMessage = (eventId, matchLines) => {
  const lines = ["event started", "", `${EVENT_URL_ROOT}/${eventId}`];
  if (Array.isArray(matchLines) && matchLines.length > 0) {
    lines.push("", ...matchLines);
  }
  return lines.join("\n");
};

const markStartedAnnouncementSentIfFirst = async (eventId, nowMs) => {
  const normalizedEventId = normalizeString(eventId);
  if (!normalizedEventId) {
    return false;
  }
  const sentRef = admin
    .database()
    .ref(`${EVENT_TELEGRAM_STARTED_SENT_ROOT}/${normalizedEventId}`);
  const result = await sentRef.transaction((current) => {
    const currentValue = current && typeof current === "object" ? current : null;
    const sentAtMs =
      currentValue && typeof currentValue.sentAtMs === "number"
        ? currentValue.sentAtMs
        : 0;
    if (sentAtMs > 0) {
      return;
    }
    return { sentAtMs: nowMs };
  });
  return result && result.committed === true;
};

const sendStartedStatusAnnouncementIfNeeded = async ({
  eventId,
  eventData,
  nowMs = Date.now(),
}) => {
  if (!eventId || !eventData || eventData.announceOnTelegram !== true) {
    return;
  }
  if (normalizeString(eventData.status) !== EVENT_STATUS_ACTIVE) {
    return;
  }
  const chatId = normalizeString(process.env.TELEGRAM_CHAT_ID_IVAN);
  if (!chatId) {
    return;
  }
  const didMark = await markStartedAnnouncementSentIfFirst(eventId, nowMs);
  if (!didMark) {
    return;
  }
  await sendTelegramHtmlMessage(chatId, renderStartedMessage(eventId, []));
};

const buildStartedState = (eventId, eventData, state) => {
  const participantsByProfileId = getParticipantsByProfileId(eventData);
  const activeMatchEntries = collectActiveMatchEntries(eventData);
  const previousOrder = Array.isArray(state.startedMatchKeys)
    ? state.startedMatchKeys.filter(
        (key) => typeof key === "string" && key.trim() !== "",
      )
    : [];
  const previousLinesByKey =
    state.startedMatchLinesByKey &&
    typeof state.startedMatchLinesByKey === "object"
      ? state.startedMatchLinesByKey
      : {};

  const nextOrder = [];
  const nextOrderSet = new Set();
  for (const key of previousOrder) {
    if (nextOrderSet.has(key)) {
      continue;
    }
    nextOrderSet.add(key);
    nextOrder.push(key);
  }

  const nextLinesByKey = {};
  for (const [key, value] of Object.entries(previousLinesByKey)) {
    if (!nextOrderSet.has(key) || typeof value !== "string" || value === "") {
      continue;
    }
    nextLinesByKey[key] = value;
  }

  let appendedCount = 0;
  for (const entry of activeMatchEntries) {
    const hostProfileId = normalizeString(entry.match.hostProfileId);
    const guestProfileId = normalizeString(entry.match.guestProfileId);
    const hostParticipant = participantsByProfileId.get(hostProfileId) || null;
    const guestParticipant =
      participantsByProfileId.get(guestProfileId) || null;
    const line = `${resolveParticipantToken(hostParticipant, entry.match.hostDisplayName)} vs. ${resolveParticipantToken(guestParticipant, entry.match.guestDisplayName)}`;
    if (nextOrderSet.has(entry.key)) {
      if (!nextLinesByKey[entry.key]) {
        nextLinesByKey[entry.key] = line;
      }
      continue;
    }
    nextOrder.push(entry.key);
    nextOrderSet.add(entry.key);
    nextLinesByKey[entry.key] = line;
    appendedCount += 1;
  }

  const lines = nextOrder
    .map((key) => nextLinesByKey[key])
    .filter((line) => typeof line === "string" && line !== "");

  return {
    text: lines.length > 0 ? renderStartedMessage(eventId, lines) : null,
    startedMatchKeys: nextOrder,
    startedMatchLinesByKey: nextLinesByKey,
    appendedCount,
  };
};

const parseState = (raw) => {
  const value = raw && typeof raw === "object" ? raw : {};
  const upcomingMessageId = normalizePositiveNumberOrNull(
    value.upcomingMessageId,
  );
  const startedMessageId = normalizePositiveNumberOrNull(
    value.startedMessageId,
  );
  const lastAppliedSignature = normalizeString(value.lastAppliedSignature);
  const startedMatchKeys = Array.isArray(value.startedMatchKeys)
    ? value.startedMatchKeys.filter(
        (key) => typeof key === "string" && key.trim() !== "",
      )
    : [];
  const startedMatchLinesByKey =
    value.startedMatchLinesByKey &&
    typeof value.startedMatchLinesByKey === "object"
      ? value.startedMatchLinesByKey
      : {};
  return {
    upcomingMessageId,
    upcomingText: normalizeString(value.upcomingText),
    startedMessageId,
    startedText: normalizeString(value.startedText),
    startedMatchKeys,
    startedMatchLinesByKey,
    lastAppliedSignature,
  };
};

const createLockOwnerToken = () =>
  `tg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

const acquireEventAnnouncementLock = async (eventId) => {
  const normalizedEventId = normalizeString(eventId);
  if (!normalizedEventId) {
    return null;
  }
  const nowMs = Date.now();
  const ownerToken = createLockOwnerToken();
  const lockRef = admin
    .database()
    .ref(`${EVENT_TELEGRAM_LOCK_ROOT}/${normalizedEventId}`);
  const result = await lockRef.transaction((current) => {
    const currentValue = current && typeof current === "object" ? current : null;
    const leaseExpiresAtMs =
      currentValue && typeof currentValue.leaseExpiresAtMs === "number"
        ? currentValue.leaseExpiresAtMs
        : 0;
    if (currentValue && leaseExpiresAtMs > nowMs) {
      return;
    }
    return {
      ownerToken,
      acquiredAtMs: nowMs,
      leaseExpiresAtMs: nowMs + EVENT_TELEGRAM_LOCK_TTL_MS,
    };
  });
  if (!result.committed) {
    return null;
  }
  const nextValue =
    result.snapshot && typeof result.snapshot.val === "function"
      ? result.snapshot.val()
      : null;
  if (
    !nextValue ||
    typeof nextValue !== "object" ||
    normalizeString(nextValue.ownerToken) !== ownerToken
  ) {
    return null;
  }
  return {
    eventId: normalizedEventId,
    ownerToken,
    ref: lockRef,
  };
};

const acquireEventAnnouncementLockWithRetry = async (
  eventId,
  {
    attempts = EVENT_TELEGRAM_LOCK_ATTEMPTS,
    delayMs = EVENT_TELEGRAM_LOCK_RETRY_DELAY_MS,
  } = {},
) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const lockHandle = await acquireEventAnnouncementLock(eventId);
    if (lockHandle) {
      return lockHandle;
    }
    if (attempt < attempts - 1 && delayMs > 0) {
      await sleep(delayMs);
    }
  }
  return null;
};

const releaseEventAnnouncementLock = async (lockHandle) => {
  if (!lockHandle) {
    return;
  }
  try {
    await lockHandle.ref.transaction((current) => {
      const currentValue = current && typeof current === "object" ? current : null;
      if (
        !currentValue ||
        normalizeString(currentValue.ownerToken) !== lockHandle.ownerToken
      ) {
        return;
      }
      return null;
    });
  } catch (error) {
    console.error("event:tg:lock:release:error", {
      eventId: lockHandle.eventId,
      error: error && error.message ? error.message : error,
    });
  }
};

const buildTelegramFailureResult = (result) => {
  const description = normalizeString(
    result && result.description,
  ).toLowerCase();
  if (description.includes("message is not modified")) {
    return "not-modified";
  }
  if (description.includes("message to edit not found")) {
    return "message-not-found";
  }
  return "failed";
};

const telegramRequest = async (method, body) => {
  const token = normalizeString(process.env.TELEGRAM_BOT_TOKEN);
  if (!token) {
    return {
      ok: false,
      description: "missing token",
    };
  }
  try {
    const response = await fetch(`${TELEGRAM_API_URL}/bot${token}/${method}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    let data = null;
    try {
      data = await response.json();
    } catch (_) {}
    if (response.ok && data && data.ok === true) {
      return {
        ok: true,
        data,
      };
    }
    return {
      ok: false,
      description:
        (data && typeof data.description === "string"
          ? data.description
          : "") || `http-${response.status}`,
    };
  } catch (error) {
    console.error("event:tg:request:error", {
      method,
      error: error && error.message ? error.message : error,
    });
    return {
      ok: false,
      description: "request error",
    };
  }
};

const sendTelegramHtmlMessage = async (chatId, text) => {
  const result = await telegramRequest("sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
    disable_notification: false,
    parse_mode: "HTML",
  });
  if (!result || result.ok !== true) {
    return null;
  }
  const data = result.data;
  const messageId =
    data && data.result
      ? normalizePositiveNumberOrNull(data.result.message_id)
      : null;
  return messageId;
};

const editTelegramHtmlMessage = async (chatId, messageId, text) => {
  const result = await telegramRequest("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    disable_web_page_preview: true,
    parse_mode: "HTML",
  });
  if (result && result.ok === true) {
    return "edited";
  }
  return buildTelegramFailureResult(result);
};

const upsertTelegramMessage = async ({
  chatId,
  desiredText,
  currentMessageId,
  currentText,
}) => {
  if (!desiredText) {
    return {
      messageId: currentMessageId,
      text: currentText,
    };
  }
  if (desiredText === currentText && currentMessageId) {
    return {
      messageId: currentMessageId,
      text: currentText,
    };
  }
  if (currentMessageId) {
    const editResult = await editTelegramHtmlMessage(
      chatId,
      currentMessageId,
      desiredText,
    );
    if (editResult === "edited" || editResult === "not-modified") {
      return {
        messageId: currentMessageId,
        text: desiredText,
      };
    }
    if (editResult !== "message-not-found") {
      return {
        messageId: currentMessageId,
        text: currentText,
      };
    }
  }
  const nextMessageId = await sendTelegramHtmlMessage(chatId, desiredText);
  if (nextMessageId) {
    return {
      messageId: nextMessageId,
      text: desiredText,
    };
  }
  return {
    messageId: currentMessageId,
    text: currentText,
  };
};

const applyEventAnnouncement = async ({
  eventId,
  eventData,
  signature,
  nowMs = Date.now(),
}) => {
  if (!eventId || !eventData || eventData.announceOnTelegram !== true) {
    return;
  }
  const chatId = normalizeString(process.env.TELEGRAM_CHAT_ID_IVAN);
  if (!chatId) {
    return;
  }
  const lockHandle = await acquireEventAnnouncementLockWithRetry(eventId);
  if (!lockHandle) {
    console.log("event:tg:lock:busy", {
      eventId,
    });
    return;
  }

  try {
    const stateRef = admin
      .database()
      .ref(`${EVENT_TELEGRAM_STATE_ROOT}/${eventId}`);
    const stateSnapshot = await stateRef.once("value");
    const state = parseState(stateSnapshot.val());

    if (state.lastAppliedSignature && state.lastAppliedSignature === signature) {
      return;
    }

    const upcomingText = renderUpcomingMessage(eventId, eventData, nowMs);
    const nextStartedState = buildStartedState(eventId, eventData, state);

    const nextUpcomingMessage = await upsertTelegramMessage({
      chatId,
      desiredText: upcomingText,
      currentMessageId: state.upcomingMessageId,
      currentText: state.upcomingText,
    });
    const nextStartedMessage = await upsertTelegramMessage({
      chatId,
      desiredText: nextStartedState.text,
      currentMessageId: state.startedMessageId,
      currentText: state.startedText,
    });

    await stateRef.set({
      upcomingMessageId: nextUpcomingMessage.messageId || null,
      upcomingText: nextUpcomingMessage.text || "",
      startedMessageId: nextStartedMessage.messageId || null,
      startedText: nextStartedMessage.text || "",
      startedMatchKeys: nextStartedState.startedMatchKeys,
      startedMatchLinesByKey: nextStartedState.startedMatchLinesByKey,
      lastAppliedSignature: signature,
      updatedAtMs: nowMs,
    });
  } finally {
    await releaseEventAnnouncementLock(lockHandle);
  }
};

const onEventTelegramCreated = onValueCreated(
  EVENT_TELEGRAM_CREATED_OPTIONS,
  async (event) => {
    const eventId = normalizeString(event.params.eventId);
    const eventData =
      event.data && typeof event.data.val === "function"
        ? event.data.val()
        : null;
    if (!eventId || !eventData || eventData.announceOnTelegram !== true) {
      return;
    }
    const nowMs = Date.now();
    const signature = buildEventSignature(eventData, nowMs);
    if (signature === "skip") {
      return;
    }
    try {
      await applyEventAnnouncement({
        eventId,
        eventData,
        signature,
        nowMs,
      });
    } catch (error) {
      console.error("event:tg:create:error", {
        eventId,
        error: error && error.message ? error.message : error,
      });
    }
  },
);

const onEventTelegramUpdated = onValueUpdated(
  EVENT_TELEGRAM_UPDATED_OPTIONS,
  async (event) => {
    const eventId = normalizeString(event.params.eventId);
    const beforeData = event.data.before.exists()
      ? event.data.before.val()
      : null;
    const afterData = event.data.after.exists() ? event.data.after.val() : null;
    if (!eventId || !afterData) {
      return;
    }
    const nowMs = Date.now();
    const beforeStatus =
      normalizeString(beforeData && beforeData.status) || EVENT_STATUS_SCHEDULED;
    const afterStatus =
      normalizeString(afterData.status) || EVENT_STATUS_SCHEDULED;
    if (
      beforeStatus === EVENT_STATUS_SCHEDULED &&
      afterStatus === EVENT_STATUS_ACTIVE
    ) {
      try {
        await sendStartedStatusAnnouncementIfNeeded({
          eventId,
          eventData: afterData,
          nowMs,
        });
      } catch (error) {
        console.error("event:tg:start-status:error", {
          eventId,
          error: error && error.message ? error.message : error,
        });
      }
    }
    const beforeSignature = buildEventSignature(beforeData, nowMs);
    const afterSignature = buildEventSignature(afterData, nowMs);
    if (beforeSignature === afterSignature) {
      return;
    }
    if (afterSignature === "skip") {
      return;
    }
    try {
      await applyEventAnnouncement({
        eventId,
        eventData: afterData,
        signature: afterSignature,
        nowMs,
      });
    } catch (error) {
      console.error("event:tg:update:error", {
        eventId,
        error: error && error.message ? error.message : error,
      });
    }
  },
);

module.exports = {
  onEventTelegramCreated,
  onEventTelegramUpdated,
};
