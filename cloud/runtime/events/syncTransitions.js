// Generated from src/events/syncTransitions.ts. Run npm run generate:runtime.
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildActiveEventSyncPlan = buildActiveEventSyncPlan;
exports.buildEndedEventSyncPlan = buildEndedEventSyncPlan;
const event_prizes_1 = require("@mons/shared/event-prizes");
const eventCommands_js_1 = require("../eventCommands.js");
const normalizeString = (value) =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : "";
const normalizeStringOrNull = (value) => normalizeString(value) || null;
const toFiniteInteger = (value, fallback = 0) => {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? Math.floor(numeric) : fallback;
};
const cloneValue = (value) => JSON.parse(JSON.stringify(value));
async function resolveEventMatches(
  rounds,
  thirdPlaceMatch,
  nowMs,
  {
    getSortedRoundIndexes,
    resolveRoundMatchesWithConcurrency,
    resolveRoundMatchState,
    applyMatchResolution,
  },
) {
  let roundsChanged = false;
  let thirdPlaceMatchChanged = false;
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
  if (thirdPlaceMatch) {
    const resolvedThirdPlace = await resolveRoundMatchState(thirdPlaceMatch);
    if (
      resolvedThirdPlace &&
      applyMatchResolution(thirdPlaceMatch, resolvedThirdPlace, nowMs)
    ) {
      thirdPlaceMatchChanged = true;
    }
  }
  return { roundsChanged, thirdPlaceMatchChanged };
}
async function buildActiveEventSyncPlan(
  { eventId, event, nowMs, ownershipSnapshot, prizeSelections },
  dependencies,
) {
  const {
    hasThirdPlaceMatchField,
    reconcileBracketMatchReadiness,
    reconcileThirdPlaceMatchReadiness,
    recomputeRoundStatuses,
    isMatchResolved,
    rebuildParticipantStatesFromRounds,
    resolveEventPrizeAssignments,
    addEventPrizeAssignmentUpdates,
  } = dependencies;
  const updates = [];
  let didChange = false;
  let eventPrizeAssignmentsForProjectionCleanup = null;
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
  const originalWinnerProfileId = normalizeStringOrNull(event.winnerProfileId);
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
  const supportsThirdPlaceMatch = hasThirdPlaceMatchField(event);
  let thirdPlaceMatch =
    supportsThirdPlaceMatch &&
    event.thirdPlaceMatch &&
    typeof event.thirdPlaceMatch === "object"
      ? cloneValue(event.thirdPlaceMatch)
      : null;
  const inviteUpdates = [];
  let participantsChanged = false;
  let { roundsChanged, thirdPlaceMatchChanged } = await resolveEventMatches(
    rounds,
    thirdPlaceMatch,
    nowMs,
    dependencies,
  );
  if (
    await reconcileBracketMatchReadiness({
      eventId,
      rounds,
      nowMs,
      participantsById: participants,
      inviteUpdates,
      ownershipSnapshot,
    })
  ) {
    roundsChanged = true;
  }
  if (supportsThirdPlaceMatch) {
    const thirdPlaceResult = await reconcileThirdPlaceMatchReadiness({
      eventId,
      rounds,
      nowMs,
      participantsById: participants,
      inviteUpdates,
      thirdPlaceMatch,
      ownershipSnapshot,
    });
    thirdPlaceMatch = thirdPlaceResult.thirdPlaceMatch;
    if (thirdPlaceResult.didChange) {
      thirdPlaceMatchChanged = true;
    }
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
  const thirdPlaceResolved =
    !supportsThirdPlaceMatch ||
    !thirdPlaceMatch ||
    isMatchResolved(thirdPlaceMatch);
  const eventShouldEnd = finalRoundCompleted && thirdPlaceResolved;
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
    if ((0, event_prizes_1.isEventPrizeEvent)(eventId)) {
      if (typeof event.prizeSelectionsLockedAtMs !== "number") {
        event.prizeSelectionsLockedAtMs = nowMs;
        updates.push(
          (0, eventCommands_js_1.eventField)(
            eventId,
            "prizeSelectionsLockedAtMs",
            nowMs,
          ),
        );
      }
      const prizeAssignmentResult = await resolveEventPrizeAssignments({
        eventId,
        event,
        rounds,
        participantsById: participants,
        thirdPlaceMatch,
        assignedAtMs: event.endedAtMs,
        ownershipSnapshot,
        prizeSelections,
      });
      if (Object.keys(prizeAssignmentResult.assignments).length > 0) {
        eventPrizeAssignmentsForProjectionCleanup =
          prizeAssignmentResult.assignments;
        event.prizeAssignments = prizeAssignmentResult.assignments;
        await addEventPrizeAssignmentUpdates({
          updates,
          eventId,
          assignments: prizeAssignmentResult.assignments,
          includeEventAssignments: true,
        });
      }
    }
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
    updates.push(
      (0, eventCommands_js_1.eventField)(
        eventId,
        "currentRoundIndex",
        normalizedCurrentRoundIndex,
      ),
    );
    eventChanged = true;
  }
  const normalizedStatus = normalizeString(event.status) || "active";
  if (normalizedStatus !== originalStatus) {
    updates.push(
      (0, eventCommands_js_1.eventField)(eventId, "status", normalizedStatus),
    );
    eventChanged = true;
  }
  const normalizedEndedAtMs =
    typeof event.endedAtMs === "number" ? Math.floor(event.endedAtMs) : null;
  if (normalizedEndedAtMs !== originalEndedAtMs) {
    updates.push(
      (0, eventCommands_js_1.eventField)(
        eventId,
        "endedAtMs",
        normalizedEndedAtMs,
      ),
    );
    eventChanged = true;
  }
  const normalizedWinnerProfileId = normalizeStringOrNull(
    event.winnerProfileId,
  );
  if (normalizedWinnerProfileId !== originalWinnerProfileId) {
    updates.push(
      (0, eventCommands_js_1.eventField)(
        eventId,
        "winnerProfileId",
        normalizedWinnerProfileId,
      ),
    );
    eventChanged = true;
  }
  const normalizedWinnerDisplayName = normalizeStringOrNull(
    event.winnerDisplayName,
  );
  if (normalizedWinnerDisplayName !== originalWinnerDisplayName) {
    updates.push(
      (0, eventCommands_js_1.eventField)(
        eventId,
        "winnerDisplayName",
        normalizedWinnerDisplayName,
      ),
    );
    eventChanged = true;
  }
  if (supportsThirdPlaceMatch && thirdPlaceMatchChanged) {
    updates.push(
      (0, eventCommands_js_1.eventField)(
        eventId,
        "thirdPlaceMatch",
        thirdPlaceMatch,
      ),
    );
    eventChanged = true;
  }
  if (roundsChanged) {
    updates.push((0, eventCommands_js_1.eventField)(eventId, "rounds", rounds));
  }
  if (participantsChanged) {
    updates.push(
      (0, eventCommands_js_1.eventField)(eventId, "participants", participants),
    );
  }
  if (inviteUpdates.length > 0) {
    updates.push(...inviteUpdates);
  }
  if (
    roundsChanged ||
    participantsChanged ||
    inviteUpdates.length > 0 ||
    eventChanged
  ) {
    updates.push(
      (0, eventCommands_js_1.eventField)(eventId, "updatedAtMs", nowMs),
    );
    didChange = true;
  }
  return {
    updates,
    didChange,
    eventForProjection: event,
    prizeAssignmentsForProjection: eventPrizeAssignmentsForProjectionCleanup,
  };
}
async function buildEndedEventSyncPlan(
  { eventId, event, nowMs, ownershipSnapshot, prizeSelections },
  dependencies,
) {
  const {
    hasThirdPlaceMatchField,
    reconcileThirdPlaceMatchReadiness,
    resolveEventPrizeAssignments,
    addEventPrizeAssignmentUpdates,
  } = dependencies;
  const updates = [];
  let didChange = false;
  let eventPrizeAssignmentsForProjectionCleanup = null;
  const rounds = cloneValue(
    event.rounds && typeof event.rounds === "object" ? event.rounds : {},
  );
  const supportsThirdPlaceMatch = hasThirdPlaceMatchField(event);
  let thirdPlaceMatch =
    supportsThirdPlaceMatch &&
    event.thirdPlaceMatch &&
    typeof event.thirdPlaceMatch === "object"
      ? cloneValue(event.thirdPlaceMatch)
      : null;
  let prizeStateChanged = false;
  let { roundsChanged, thirdPlaceMatchChanged } = await resolveEventMatches(
    rounds,
    thirdPlaceMatch,
    nowMs,
    dependencies,
  );
  if (supportsThirdPlaceMatch) {
    const thirdPlaceResult = await reconcileThirdPlaceMatchReadiness({
      eventId,
      rounds,
      nowMs,
      participantsById:
        event.participants && typeof event.participants === "object"
          ? event.participants
          : {},
      inviteUpdates: [],
      thirdPlaceMatch,
      allowInviteCreation: false,
    });
    thirdPlaceMatch = thirdPlaceResult.thirdPlaceMatch;
    if (thirdPlaceResult.didChange) {
      thirdPlaceMatchChanged = true;
    }
  }
  if ((0, event_prizes_1.isEventPrizeEvent)(eventId)) {
    if (typeof event.prizeSelectionsLockedAtMs !== "number") {
      updates.push(
        (0, eventCommands_js_1.eventField)(
          eventId,
          "prizeSelectionsLockedAtMs",
          typeof event.endedAtMs === "number" ? event.endedAtMs : nowMs,
        ),
      );
      prizeStateChanged = true;
    }
    const prizeAssignmentResult = await resolveEventPrizeAssignments({
      eventId,
      event,
      rounds,
      participantsById:
        event.participants && typeof event.participants === "object"
          ? event.participants
          : {},
      thirdPlaceMatch,
      assignedAtMs:
        typeof event.endedAtMs === "number" ? event.endedAtMs : nowMs,
      ownershipSnapshot,
      prizeSelections,
    });
    if (Object.keys(prizeAssignmentResult.assignments).length > 0) {
      eventPrizeAssignmentsForProjectionCleanup =
        prizeAssignmentResult.assignments;
      if (prizeAssignmentResult.didCreate) {
        await addEventPrizeAssignmentUpdates({
          updates,
          eventId,
          assignments: prizeAssignmentResult.assignments,
          includeEventAssignments: true,
        });
        prizeStateChanged = true;
      }
    }
  }
  if (roundsChanged || thirdPlaceMatchChanged) {
    updates.push((0, eventCommands_js_1.eventField)(eventId, "rounds", rounds));
    if (supportsThirdPlaceMatch) {
      updates.push(
        (0, eventCommands_js_1.eventField)(
          eventId,
          "thirdPlaceMatch",
          thirdPlaceMatch,
        ),
      );
    }
  }
  if (roundsChanged || thirdPlaceMatchChanged || prizeStateChanged) {
    updates.push(
      (0, eventCommands_js_1.eventField)(eventId, "updatedAtMs", nowMs),
    );
    didChange = true;
  }
  return {
    updates,
    didChange,
    eventForProjection: event,
    prizeAssignmentsForProjection: eventPrizeAssignmentsForProjectionCleanup,
  };
}
