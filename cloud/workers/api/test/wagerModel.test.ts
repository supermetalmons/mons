import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeWager,
  lineageFingerprint,
  readStoredSettlement,
  readWagerCount,
  readWagerProposal,
  wagerReferencesReservationOperation,
} from "../src/wagerModel.ts";
import {
  acceptProposalDecision,
  claimSettlementDecision,
  completeSettlementDecision,
  removeProposalDecision,
  sendProposalDecision,
  type AcceptWagerProposalCommand,
  type SendWagerProposalCommand,
} from "../src/wagerStateCommands.ts";

const operationId = "a".repeat(64);
const reservationOperationId = "b".repeat(64);
const opponentOperationId = "c".repeat(64);
const opponentReservationOperationId = "d".repeat(64);

const send: SendWagerProposalCommand = {
  playerUid: "host",
  opponentUid: "guest",
  material: "dust",
  now: 100,
  operationId,
  reservationOperationId,
  selfAdjustmentOperationId: "e".repeat(64),
  opponentAdjustmentOperationId: "f".repeat(64),
  opponentProposal: {
    material: "dust",
    count: 2,
    operationId: opponentOperationId,
    reservationOperationId: opponentReservationOperationId,
  },
  reservedCount: 2,
};

const accept: AcceptWagerProposalCommand = {
  playerUid: "host",
  opponentUid: "guest",
  operationId,
  material: "dust",
  proposedCount: 2,
  opponentProposalOperationId: opponentOperationId,
  opponentReservationOperationId,
  hasOwnProposal: false,
  ownMaterial: "",
  ownCount: 0,
  ownProposalOperationId: "",
  ownReservationOperationId: "",
  acceptedCount: 2,
  now: 100,
  proposerAdjustmentOperationId: "e".repeat(64),
  reservationOperationId,
};

function pendingSettlement() {
  return {
    version: 2,
    state: "pending",
    kind: "proposals",
    operationId,
    fingerprint: "retained-fingerprint",
    claimedAtMs: 10,
    completedAtMs: null,
    releases: [
      {
        uid: " host ",
        reservationOperationIds: [` ${reservationOperationId} `],
      },
    ],
    extension: { retained: null },
  };
}

test("decoding retains nonrecord payloads without presenting them as records", () => {
  assert.equal(decodeWager(null), null);
  assert.equal(decodeWager(undefined), null);
  for (const raw of [false, 0, "retained", ["retained", null]]) {
    const decoded = decodeWager(raw);
    assert.ok(decoded);
    assert.strictEqual(decoded.raw, raw);
    assert.equal(decoded.record, null);
    assert.deepEqual(
      claimSettlementDecision(decoded, {
        resolution: {
          winnerUid: "host",
          loserUid: "guest",
          winnerProfileId: "profile-host",
          loserProfileId: "profile-guest",
        },
        operationId,
        now: 100,
        acceptReservationOperationIdByUid: {},
      }),
      { commit: false, decision: "no-wager" },
    );
  }
});

test("settlement views distinguish missing, null, malformed, and valid data without throwing", () => {
  assert.equal(decodeWager({})?.settlement.kind, "absent");
  assert.equal(decodeWager({ settlement: null })?.settlement.kind, "null");
  for (const settlement of [
    false,
    "pending",
    { version: 2, state: "pending" },
  ]) {
    const decoded = decodeWager({ settlement });
    assert.equal(decoded?.settlement.kind, "malformed");
    assert.strictEqual(decoded?.settlement.raw, settlement);
    assert.equal(decoded?.settlement.value, null);
    assert.throws(
      () => readStoredSettlement(decoded),
      /wager-settlement-malformed/,
    );
  }
  const raw = pendingSettlement();
  const decoded = decodeWager({ settlement: raw });
  assert.equal(decoded?.settlement.kind, "valid");
  assert.strictEqual(decoded?.settlement.raw, raw);
  assert.deepEqual(decoded?.settlement.value?.releases, [
    { uid: "host", reservationOperationIds: [reservationOperationId] },
  ]);
  assert.equal(raw.releases[0].uid, " host ");
});

test("decoding does not accept an unsupported legacy settlement version", () => {
  const raw = { settlement: { ...pendingSettlement(), version: 1 } };
  const decoded = decodeWager(raw);
  assert.equal(decoded?.settlement.kind, "malformed");
  assert.strictEqual(decoded?.raw, raw);
  assert.throws(
    () => readStoredSettlement(decoded),
    /wager-settlement-malformed/,
  );
});

test("incomplete settlement data still blocks proposal cancellation without parsing failure", () => {
  const wager = decodeWager({
    proposals: {
      host: { material: "dust", count: 2, operationId, reservationOperationId },
    },
    settlement: { version: 2, state: "pending" },
  });
  assert.deepEqual(
    removeProposalDecision(wager, {
      proposalUid: "host",
      operationId: "remove",
      expectedReservationOperationId: reservationOperationId,
    }),
    { commit: false, decision: "proposal-missing" },
  );
});

test("proposal admission preserves truthiness of malformed blocking fields", () => {
  for (const field of ["agreed", "resolved", "settlement"]) {
    for (const value of [undefined, null, false, 0, ""]) {
      assert.ok(
        "value" in sendProposalDecision(decodeWager({ [field]: value }), send),
      );
    }
    for (const value of [true, 1, "retained", [], {}]) {
      assert.deepEqual(
        sendProposalDecision(decodeWager({ [field]: value }), send),
        { commit: false, decision: "unavailable" },
      );
    }
  }
});

test("send replay and opponent matching continue to require exact stored operation IDs", () => {
  assert.deepEqual(
    sendProposalDecision(
      decodeWager({ proposals: { host: { operationId: ` ${operationId} ` } } }),
      send,
    ),
    { commit: false, decision: "unavailable" },
  );
  for (const field of ["operationId", "reservationOperationId"] as const) {
    const proposal = {
      material: "dust",
      count: 2,
      operationId: opponentOperationId,
      reservationOperationId: opponentReservationOperationId,
    };
    proposal[field] = ` ${proposal[field]} `;
    assert.deepEqual(
      sendProposalDecision(
        decodeWager({ proposals: { guest: proposal } }),
        send,
      ),
      { commit: false, decision: "unavailable" },
    );
  }
});

test("accept preserves normalized ID matching and exact material matching", () => {
  const proposal = {
    material: "dust",
    count: 2,
    operationId: ` ${opponentOperationId} `,
    reservationOperationId: ` ${opponentReservationOperationId} `,
  };
  const accepted = acceptProposalDecision(
    decodeWager({ proposals: { guest: proposal } }),
    accept,
  );
  assert.ok("value" in accepted);
  assert.deepEqual(accepted.value?.agreed, {
    material: "dust",
    count: 2,
    total: 4,
    proposerId: "guest",
    accepterId: "host",
    acceptedAt: 100,
  });
  assert.deepEqual(
    acceptProposalDecision(
      decodeWager({
        proposals: { guest: { ...proposal, material: " dust " } },
      }),
      accept,
    ),
    { commit: false, decision: "proposal-unavailable" },
  );
});

test("completion preserves raw extensions and normalized settlement values never rewrite retained fields", () => {
  const raw = {
    retained: { ids: ["first", "second"] },
    proposals: { host: { material: "dust", count: 2 } },
    settlement: pendingSettlement(),
  };
  const decoded = decodeWager(raw);
  const settlement = readStoredSettlement(decoded);
  assert.ok(settlement);
  const completed = completeSettlementDecision(decoded, {
    settlement,
    completedAtMs: 200,
    insufficientMaterials: false,
  });
  assert.ok("value" in completed);
  assert.deepEqual(completed.value, {
    retained: raw.retained,
    settlement: { ...raw.settlement, state: "completed", completedAtMs: 200 },
  });
  assert.equal(raw.settlement.state, "pending");
  assert.equal(raw.settlement.releases[0].uid, " host ");
  assert.ok(raw.proposals);
});

test("lineage fingerprints preserve raw key order, extensions, and null values", () => {
  const raw = {
    agreed: { count: 2, material: "dust", extension: null },
    agreementOperation: {
      retained: { ids: ["second", "first"] },
      reservationLineageReady: true,
      id: operationId,
    },
  };
  const expected = JSON.stringify([
    raw.agreed,
    { retained: raw.agreementOperation.retained, id: operationId },
  ]);
  assert.equal(lineageFingerprint(decodeWager(raw)), expected);
  assert.equal(
    lineageFingerprint(
      decodeWager({
        ...raw,
        agreementOperation: {
          ...raw.agreementOperation,
          reservationLineageReady: false,
        },
      }),
    ),
    expected,
  );
});

test("malformed settlement releases still retain conservative reservation references", () => {
  const raw = {
    settlement: {
      version: 1,
      releases: [
        {
          uid: " host ",
          reservationOperationIds: [
            ` ${reservationOperationId} `,
            reservationOperationId,
          ],
          retained: true,
        },
      ],
    },
  };
  const decoded = decodeWager(raw);
  assert.equal(decoded?.settlement.kind, "malformed");
  assert.equal(
    wagerReferencesReservationOperation(
      decoded,
      "host",
      reservationOperationId,
    ),
    true,
  );
  assert.equal(
    wagerReferencesReservationOperation(
      decoded,
      "guest",
      reservationOperationId,
    ),
    false,
  );
});

test("resolved wagers do not coerce unread proposal counts", () => {
  const raw = {
    resolved: true,
    proposals: { host: { count: { toString: 1 } } },
  };
  const decoded = decodeWager(raw);
  assert.strictEqual(decoded?.raw, raw);
  assert.deepEqual(
    claimSettlementDecision(decoded, {
      resolution: {
        winnerUid: "host",
        loserUid: "guest",
        winnerProfileId: "profile-host",
        loserProfileId: "profile-guest",
      },
      operationId,
      now: 100,
      acceptReservationOperationIdByUid: {},
    }),
    { commit: false, decision: "already-resolved" },
  );
  assert.throws(
    () => readWagerCount(readWagerProposal(decoded, "host")),
    TypeError,
  );
});

test("cancelling a proposal preserves unrelated uncoercible counts", () => {
  const retainedProposal = { count: { toString: false } };
  const raw = {
    proposals: {
      host: { count: 2, operationId, reservationOperationId },
      guest: retainedProposal,
    },
  };
  const result = removeProposalDecision(decodeWager(raw), {
    proposalUid: "host",
    operationId: "remove",
    expectedReservationOperationId: reservationOperationId,
  });
  assert.ok("value" in result);
  assert.deepEqual(result.value?.proposals, { guest: retainedProposal });
  assert.strictEqual(raw.proposals.guest, retainedProposal);
});

test("accept only raises stored count coercion failures after the material guard matches", () => {
  const proposal = {
    material: "slime",
    count: { toString: 1 },
    operationId: opponentOperationId,
    reservationOperationId: opponentReservationOperationId,
  };
  assert.deepEqual(
    acceptProposalDecision(
      decodeWager({ proposals: { guest: proposal } }),
      accept,
    ),
    { commit: false, decision: "proposal-unavailable" },
  );
  const matching = decodeWager({
    proposals: { guest: { ...proposal, material: "dust" } },
  });
  assert.throws(() => acceptProposalDecision(matching, accept), TypeError);
});

test("uncoercible settlement counts are retained until settlement is consumed", () => {
  const raw = {
    settlement: {
      ...pendingSettlement(),
      kind: "agreed",
      winnerUid: "host",
      loserUid: "guest",
      winnerProfileId: "profile-host",
      loserProfileId: "profile-guest",
      material: "dust",
      count: { toString: false },
      releases: [
        { uid: "host", reservationOperationIds: [reservationOperationId] },
        {
          uid: "guest",
          reservationOperationIds: [opponentReservationOperationId],
        },
      ],
    },
  };
  const decoded = decodeWager(raw);
  assert.strictEqual(decoded?.raw, raw);
  assert.equal(decoded?.settlement.kind, "malformed");
  assert.throws(() => readStoredSettlement(decoded), TypeError);
  assert.deepEqual(
    removeProposalDecision(decoded, {
      proposalUid: "host",
      operationId: "remove",
      expectedReservationOperationId: reservationOperationId,
    }),
    { commit: false, decision: "proposal-missing" },
  );
});
