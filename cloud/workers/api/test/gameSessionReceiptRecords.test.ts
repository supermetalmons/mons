import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAutomatchReceiptChanges,
  parseAutomatchReceipt,
} from "../src/automatch/receipts.ts";
import {
  decodeAutomatchReceipt,
  decodeGameSessionMutationReceipt,
  parseGameSessionMutationReceipt,
} from "../src/gameSessionReceiptRecords.ts";

const automatchReceipt = {
  schemaVersion: 1,
  kind: "automatch-start",
  completedAtMs: 42.75,
  emojiId: 1,
  aura: "",
  operationId: "operation",
  requesterUid: "login",
  inviteId: "invite",
  profileProjectionRequestId: "projection",
  telegramProjection: true,
  response: {
    ok: true,
    inviteId: "invite",
    mode: "pending",
    matchedImmediately: false,
  },
};

const sessionReceipt = {
  schemaVersion: 1,
  kind: "invite-create",
  completedAtMs: 42.75,
  fingerprint: "fingerprint",
  inviteId: "invite",
  operationId: "operation",
  projectionRequestId: "projection",
  requesterUid: "login",
  response: {
    ok: true,
    inviteId: "invite",
    hostId: "login",
    matchId: "invite",
  },
};

test("automatch receipt parsing preserves defaults, flooring and raw input", () => {
  const raw = {
    ...automatchReceipt,
    completedAtMs: -0.25,
    profileProjectionRequestId: undefined,
    extension: { kept: true },
  };
  const before = structuredClone(raw);
  const parsed = parseAutomatchReceipt(raw);
  assert.ok(parsed);
  assert.equal(parsed.completedAtMs, -1);
  assert.equal(parsed.profileProjectionRequestId, null);
  assert.equal(Object.hasOwn(parsed, "extension"), false);
  assert.equal(parsed.response, raw.response);
  assert.deepEqual(raw, before);
  const { profileProjectionRequestId: _omitted, ...legacy } = automatchReceipt;
  assert.equal(parseAutomatchReceipt(legacy)?.profileProjectionRequestId, null);
});

test("automatch receipt parsing rejects malformed identity and response fields", () => {
  for (const patch of [
    { kind: "invite-create" },
    { schemaVersion: 2 },
    { operationId: "operation/unsafe" },
    { inviteId: "invite/unsafe" },
    { profileProjectionRequestId: "" },
    { requesterUid: "" },
    { emojiId: 1.5 },
    { completedAtMs: Number.NaN },
    { completedAtMs: Number.POSITIVE_INFINITY },
    { response: { ...automatchReceipt.response, inviteId: "other" } },
    { response: { ...automatchReceipt.response, extra: true } },
    { response: { ok: false } },
  ]) {
    assert.equal(
      parseAutomatchReceipt({ ...automatchReceipt, ...patch }),
      null,
    );
  }
});

test("receipt reads distinguish missing records from malformed and other receipt families", () => {
  for (const decode of [
    decodeAutomatchReceipt,
    decodeGameSessionMutationReceipt,
  ]) {
    for (const missing of [null, undefined]) {
      assert.deepEqual(decode(missing), { kind: "missing" });
    }
    for (const invalid of [false, true, 0, "", "receipt", [], {}, [{}]]) {
      assert.deepEqual(decode(invalid), { kind: "invalid" });
    }
  }
  assert.deepEqual(decodeAutomatchReceipt(sessionReceipt), { kind: "invalid" });
  assert.deepEqual(decodeGameSessionMutationReceipt(automatchReceipt), {
    kind: "invalid",
  });
  assert.deepEqual(decodeAutomatchReceipt(automatchReceipt), {
    kind: "valid",
    value: { ...automatchReceipt, completedAtMs: 42 },
  });
  assert.deepEqual(decodeGameSessionMutationReceipt(sessionReceipt), {
    kind: "valid",
    value: { ...sessionReceipt, completedAtMs: 42 },
  });
});

test("session receipt parsing retains permissive fields for contextual replay checks", () => {
  const raw = {
    ...sessionReceipt,
    kind: "legacy-or-unknown-kind",
    completedAtMs: -0.25,
    fingerprint: "",
    inviteId: "different/legacy-invite",
    operationId: "",
    projectionRequestId: "",
    requesterUid: " ",
    extension: { kept: true },
  };
  const before = structuredClone(raw);
  const parsed = parseGameSessionMutationReceipt(raw);
  assert.ok(parsed);
  assert.equal(parsed.completedAtMs, -1);
  assert.equal(parsed.kind, "legacy-or-unknown-kind");
  assert.equal(parsed.inviteId, "different/legacy-invite");
  assert.equal(parsed.operationId, "");
  assert.equal(parsed.fingerprint, "");
  assert.equal(parsed.projectionRequestId, "");
  assert.equal(parsed.requesterUid, " ");
  assert.equal(Object.hasOwn(parsed, "extension"), false);
  assert.equal(parsed.response, raw.response);
  assert.deepEqual(raw, before);
});

test("session receipts require their projection field and a valid response", () => {
  assert.equal(
    parseGameSessionMutationReceipt({
      ...sessionReceipt,
      projectionRequestId: null,
    })?.projectionRequestId,
    null,
  );
  const { projectionRequestId: _omitted, ...legacy } = sessionReceipt;
  assert.deepEqual(decodeGameSessionMutationReceipt(legacy), {
    kind: "invalid",
  });
  for (const patch of [
    { schemaVersion: 2 },
    { kind: 1 },
    { completedAtMs: "42" },
    { completedAtMs: Number.NaN },
    { completedAtMs: Number.POSITIVE_INFINITY },
    { fingerprint: null },
    { requesterUid: "" },
    { projectionRequestId: undefined },
    { projectionRequestId: false },
    { response: { ...sessionReceipt.response, extra: true } },
    { response: { ...sessionReceipt.response, matchId: "other" } },
    { response: { ok: false } },
  ]) {
    assert.deepEqual(
      decodeGameSessionMutationReceipt({ ...sessionReceipt, ...patch }),
      { kind: "invalid" },
    );
  }
});

test("receipt decoders leave legacy numeric acceptance and response variants unchanged", () => {
  for (const emojiId of [0, -1]) {
    const parsed = parseAutomatchReceipt({
      ...automatchReceipt,
      emojiId,
      requesterUid: " ",
    });
    assert.equal(parsed?.emojiId, emojiId);
    assert.equal(parsed?.requesterUid, " ");
  }
  for (const response of [
    sessionReceipt.response,
    {
      ok: true,
      inviteId: "invite",
      guestId: null,
      joined: false,
      matchId: null,
    },
    {
      ok: true,
      inviteId: "invite",
      actorUid: "login",
      rematches: "x",
    },
  ]) {
    assert.equal(
      parseGameSessionMutationReceipt({ ...sessionReceipt, response })
        ?.response,
      response,
    );
  }
});

test("automatch receipt writes retain their serialized payload and timestamp markers", () => {
  const response = {
    ok: true,
    inviteId: "invite",
    mode: "pending",
    matchedImmediately: false,
  } as const;
  const changes = buildAutomatchReceiptChanges(
    "login",
    { operationId: "operation", emojiId: 1, aura: "" },
    response,
    "projection",
    true,
  );
  assert.equal(
    JSON.stringify(changes),
    '[{"kind":"mutation-receipt","operationId":"operation","value":{"schemaVersion":1,"aura":"","completedAtMs":{".sv":"timestamp"},"emojiId":1,"inviteId":"invite","kind":"automatch-start","operationId":"operation","profileProjectionRequestId":"projection","requesterUid":"login","response":{"ok":true,"inviteId":"invite","mode":"pending","matchedImmediately":false},"telegramProjection":true},"expiration":{"completedAtMs":{".sv":"timestamp"}}}]',
  );
});
