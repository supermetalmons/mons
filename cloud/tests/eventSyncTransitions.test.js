"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createEventBracketRuntime,
  createEmptyEventMatch,
  setMatchSlotParticipant,
} = require("../runtime/events/bracket");
const {
  buildActiveEventSyncPlan,
  buildEndedEventSyncPlan,
} = require("../runtime/events/syncTransitions");
const { getEventField } = require("../runtime/eventCommands");

const nowMs = 1_000;
const participants = Object.fromEntries(
  ["p1", "p2", "p3", "p4"].map((profileId, index) => [
    profileId,
    {
      profileId,
      loginUid: `${profileId}-login`,
      displayName: profileId.toUpperCase(),
      emojiId: index,
      aura: null,
      joinedAtMs: index,
      state: "active",
    },
  ]),
);
const ownershipSnapshot = {
  canonicalProfileIdByProfileId: new Map(
    Object.keys(participants).map((id) => [id, id]),
  ),
  loginOwnerByUid: new Map(
    Object.keys(participants).map((id) => [
      `${id}-login`,
      { profileId: id, revision: 1 },
    ]),
  ),
  loginUidsByProfileId: new Map(
    Object.keys(participants).map((id) => [id, [`${id}-login`]]),
  ),
  profileById: new Map(),
};

function completedMatch(key, host, guest) {
  const match = createEmptyEventMatch(key);
  setMatchSlotParticipant(match, "host", participants[host]);
  setMatchSlotParticipant(match, "guest", participants[guest]);
  return {
    ...match,
    inviteId: `invite-${key}`,
    status: "host",
    winnerProfileId: host,
    loserProfileId: guest,
    resolvedAtMs: 500,
  };
}

function semifinalEvent(status) {
  return {
    eventId: "event-sync",
    status,
    currentRoundIndex: 0,
    endedAtMs: status === "ended" ? 500 : null,
    winnerProfileId: status === "ended" ? "p1" : null,
    winnerDisplayName: status === "ended" ? "P1" : null,
    participants: structuredClone(participants),
    supportsThirdPlaceMatch: true,
    thirdPlaceMatch: createEmptyEventMatch("third_place"),
    rounds: {
      0: {
        status: "active",
        completedAtMs: null,
        matches: {
          "0_0": completedMatch("0_0", "p1", "p2"),
          "0_1": completedMatch("0_1", "p3", "p4"),
        },
      },
      1: {
        status: "upcoming",
        completedAtMs: null,
        matches: { "1_0": createEmptyEventMatch("1_0") },
      },
    },
  };
}

function runtime(overrides = {}) {
  return createEventBracketRuntime({
    state: {
      transactProfileEventPrize: () => assert.fail("planner cannot project"),
    },
    readEventPrizeWithdrawals: () => assert.fail("planner cannot clean up"),
    readMatchPair: () => assert.fail("unexpected single match read"),
    readMatchPairs: () => assert.fail("unexpected match batch read"),
    buildRandomGameSeed: () => assert.fail("unexpected invite creation"),
    ...overrides,
  });
}

function input(event) {
  return {
    eventId: event.eventId,
    event,
    nowMs,
    ownershipSnapshot,
    prizeSelections: { p1: "1514", p2: "1092" },
  };
}

test("active plans prepare final and third-place invites without replacing projection snapshots", async () => {
  const event = semifinalEvent("active");
  const original = structuredClone(event);
  let seeds = 0;
  const plan = await buildActiveEventSyncPlan(
    input(event),
    runtime({
      buildRandomGameSeed: async () => {
        seeds += 1;
        return { gameVariant: "Classic", fen: "start-fen" };
      },
    }),
  );
  const commands = plan.updates;
  assert.equal(seeds, 2);
  assert.equal(plan.didChange, true);
  assert.deepEqual(
    commands.map((command) => command.field ?? command.kind),
    [
      "currentRoundIndex",
      "thirdPlaceMatch",
      "rounds",
      "participants",
      "invite",
      "match-creation",
      "match-creation",
      "invite",
      "match-creation",
      "match-creation",
      "updatedAtMs",
    ],
  );
  const rounds = getEventField(commands, event.eventId, "rounds");
  const thirdPlace = getEventField(commands, event.eventId, "thirdPlaceMatch");
  assert.equal(rounds[1].matches["1_0"].status, "pending");
  assert.equal(thirdPlace.status, "pending");
  assert.equal(thirdPlace.hostProfileId, "p2");
  assert.equal(thirdPlace.guestProfileId, "p4");
  assert.equal(plan.eventForProjection, event);
  assert.equal(event.currentRoundIndex, 1);
  assert.deepEqual(event.rounds, original.rounds);
  assert.deepEqual(event.participants, original.participants);
  assert.deepEqual(event.thirdPlaceMatch, original.thirdPlaceMatch);
  assert.equal(plan.prizeAssignmentsForProjection, null);
});

test("ended repair fills third-place slots without creating invites or changing terminal state", async () => {
  const event = semifinalEvent("ended");
  const original = structuredClone(event);
  const plan = await buildEndedEventSyncPlan(input(event), runtime());
  assert.equal(plan.didChange, true);
  assert.deepEqual(
    plan.updates.map((command) => command.field),
    ["rounds", "thirdPlaceMatch", "updatedAtMs"],
  );
  const thirdPlace = getEventField(
    plan.updates,
    event.eventId,
    "thirdPlaceMatch",
  );
  assert.equal(thirdPlace.hostProfileId, "p2");
  assert.equal(thirdPlace.guestProfileId, "p4");
  assert.equal(thirdPlace.inviteId, null);
  assert.equal(thirdPlace.status, "upcoming");
  assert.deepEqual(
    getEventField(plan.updates, event.eventId, "rounds"),
    original.rounds,
  );
  assert.equal(plan.eventForProjection, event);
  assert.deepEqual(event, original);
});

function pendingMatch(inviteId) {
  return {
    status: "active",
    inviteId,
    hostLoginUid: "p1-login",
    guestLoginUid: "p2-login",
    hostProfileId: "p1",
    guestProfileId: "p2",
  };
}

for (const [status, buildPlan] of [
  ["active", buildActiveEventSyncPlan],
  ["ended", buildEndedEventSyncPlan],
]) {
  test(`${status} plans read rounds in order before the separate third-place match`, async () => {
    const calls = [];
    const event = {
      eventId: "event-sync",
      status,
      participants: {},
      rounds: {
        2: { matches: { "2_0": pendingMatch("last") } },
        1: {},
        0: {
          matches: {
            "0_0": pendingMatch("first-a"),
            "0_1": pendingMatch("first-b"),
          },
        },
      },
      thirdPlaceMatch: pendingMatch("third"),
    };
    await buildPlan(
      input(event),
      runtime({
        readMatchPairs: async (requests) => {
          calls.push(["batch", ...requests.map((request) => request.inviteId)]);
          return requests.map(() => [{}, {}]);
        },
        readMatchPair: async (request) => {
          calls.push(["single", request.inviteId]);
          return [{}, {}];
        },
      }),
    );
    assert.deepEqual(calls, [
      ["batch", "first-a", "first-b"],
      ["batch", "last"],
      ["single", "third"],
    ]);
  });

  test(`${status} planner stops on a failed round read before third-place work`, async () => {
    const failure = new Error("match-state-source-changed");
    const event = {
      eventId: "event-sync",
      status,
      rounds: { 0: { matches: { "0_0": pendingMatch("final") } } },
      thirdPlaceMatch: pendingMatch("third"),
    };
    const original = structuredClone(event);
    await assert.rejects(
      buildPlan(
        input(event),
        runtime({
          readMatchPairs: async () => {
            throw failure;
          },
        }),
      ),
      failure,
    );
    assert.deepEqual(event, original);
  });
}

function finalEvent(status, eventId = "NN3eRzoZo80") {
  return {
    eventId,
    status,
    currentRoundIndex: 0,
    endedAtMs: status === "ended" ? 500 : null,
    prizeSelectionsLockedAtMs: null,
    participants: {
      p1: structuredClone(participants.p1),
      p2: structuredClone(participants.p2),
    },
    rounds: {
      0: {
        status: "completed",
        completedAtMs: 500,
        matches: { "0_0": completedMatch("0_0", "p1", "p2") },
      },
    },
  };
}

test("active completion keeps the projection event mutations distinct from its planned nested records", async () => {
  const event = finalEvent("active");
  const original = structuredClone(event);
  const plan = await buildActiveEventSyncPlan(input(event), runtime());
  assert.equal(plan.eventForProjection, event);
  assert.equal(event.status, "ended");
  assert.equal(event.endedAtMs, nowMs);
  assert.equal(event.winnerProfileId, "p1");
  assert.equal(event.prizeSelectionsLockedAtMs, nowMs);
  assert.equal(event.prizeAssignments, plan.prizeAssignmentsForProjection);
  assert.deepEqual(event.rounds, original.rounds);
  assert.deepEqual(event.participants, original.participants);
  assert.notDeepEqual(
    getEventField(plan.updates, event.eventId, "participants"),
    event.participants,
  );
  assert.equal(Object.hasOwn(event, "thirdPlaceMatch"), false);
  assert.equal(
    plan.updates.some((command) => command.field === "thirdPlaceMatch"),
    false,
  );
});

test("ended prize repair plans assignments without mutating its projection event", async () => {
  const event = finalEvent("ended");
  const original = structuredClone(event);
  const plan = await buildEndedEventSyncPlan(input(event), runtime());
  assert.deepEqual(
    plan.updates.map((command) => command.field),
    ["prizeSelectionsLockedAtMs", "prizeAssignments", "updatedAtMs"],
  );
  assert.equal(plan.prizeAssignmentsForProjection[1].assignedAtMs, 500);
  assert.equal(plan.prizeAssignmentsForProjection[1].prizeId, "1514");
  assert.equal(plan.eventForProjection, event);
  assert.deepEqual(event, original);
});

test("ended plans return stored assignments for projection without a canonical write", async () => {
  const event = finalEvent("ended");
  const initial = await buildEndedEventSyncPlan(input(event), runtime());
  event.prizeAssignments = initial.prizeAssignmentsForProjection;
  event.prizeSelectionsLockedAtMs = 500;
  const plan = await buildEndedEventSyncPlan(input(event), runtime());
  assert.equal(plan.didChange, false);
  assert.deepEqual(plan.updates, []);
  assert.deepEqual(plan.prizeAssignmentsForProjection, event.prizeAssignments);
});
