"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  decodeAutomatchEntry,
  decodeAutomatchEntries,
  emptyAutomatchEntryFields,
} = require("../runtime/automatchRecords");
const { getDisplayNameFromAddress } = require("../runtime/telegramDisplay");
const {
  createProfileGamesProjectionCore,
} = require("../runtime/profileGamesProjectionCore");

test("entry reads retain stored strings and normalize only numeric values", () => {
  const raw = {
    uid: " host ",
    timestamp: "123.75",
    rating: "1450.5",
    hostColor: " white ",
    password: " secret ",
    gameVariant: " classic ",
    telegramDeliveryVersion: 2,
    username: " name ",
    ethAddress: "0x1234",
    solAddress: "",
    emojiId: "1",
    extra: { retained: true },
  };
  const before = structuredClone(raw);
  const decoded = decodeAutomatchEntry(raw);
  assert.deepEqual(decoded, {
    isNull: false,
    isTruthy: true,
    record: {
      uid: " host ",
      timestamp: 123.75,
      numericTimestamp: null,
      rating: 1450.5,
      hostColor: " white ",
      password: " secret ",
      gameVariant: " classic ",
      telegramDeliveryVersion: 2,
      display: {
        username: " name ",
        ethAddress: "0x1234",
        solAddress: "",
        rating: "1450.5",
        emojiId: "1",
      },
    },
  });
  assert.equal(decoded.record.uid.trim(), "host");
  assert.equal(Math.floor(decoded.record.timestamp), 123);
  assert.deepEqual(raw, before);
});

test("entry reads retain exact null and truthiness independently of record shape", () => {
  for (const raw of [null, undefined, false, 0, "", true, 1, "malformed", []]) {
    assert.deepEqual(decodeAutomatchEntry(raw), {
      isNull: raw === null,
      isTruthy: Boolean(raw),
      record: null,
    });
  }
  const empty = decodeAutomatchEntry({});
  assert.equal(empty.isNull, false);
  assert.equal(empty.isTruthy, true);
  assert.equal(empty.record.uid, "");
  assert.equal(empty.record.timestamp, 0);
  assert.equal(empty.record.numericTimestamp, null);
  assert.equal(empty.record.rating, 0);
});

test("entry reads preserve numeric fallbacks and strict Telegram version checks", () => {
  for (const raw of [
    null,
    undefined,
    false,
    true,
    {},
    [],
    "invalid",
    "Infinity",
  ]) {
    const record = decodeAutomatchEntry({
      uid: raw,
      timestamp: raw,
      rating: raw,
      hostColor: raw,
      password: raw,
      gameVariant: raw,
      telegramDeliveryVersion: raw,
    }).record;
    assert.equal(record.timestamp, 0);
    assert.equal(record.numericTimestamp, null);
    assert.equal(record.rating, 0);
    assert.equal(record.telegramDeliveryVersion, null);
    assert.equal(record.uid, typeof raw === "string" ? raw : "");
    assert.equal(record.hostColor, typeof raw === "string" ? raw : "");
    assert.equal(record.password, typeof raw === "string" ? raw : "");
    assert.equal(record.gameVariant, typeof raw === "string" ? raw : "");
  }
  assert.equal(
    decodeAutomatchEntry({ telegramDeliveryVersion: "2" }).record
      .telegramDeliveryVersion,
    null,
  );
  assert.equal(
    decodeAutomatchEntry({ timestamp: -1.25 }).record.timestamp,
    -1.25,
  );
  assert.equal(
    decodeAutomatchEntry({ timestamp: -1.25 }).record.numericTimestamp,
    -1.25,
  );
  assert.equal(decodeAutomatchEntry({ timestamp: "  " }).record.timestamp, 0);
  assert.equal(decodeAutomatchEntry({ rating: "0x10" }).record.rating, 16);
});

test("entry display fields retain raw JSON without eager display formatting", () => {
  const raw = {
    username: { legacy: ["name"] },
    ethAddress: ["address"],
    solAddress: false,
    rating: true,
    emojiId: { legacy: 1 },
  };
  const record = decodeAutomatchEntry(raw).record;
  assert.deepEqual(record.display, raw);
  assert.equal(record.rating, 0);
  assert.equal(record.display.username, raw.username);
  assert.equal(record.display.ethAddress, raw.ethAddress);
  assert.equal(
    getDisplayNameFromAddress("name", "", "", record.rating, null),
    "name",
  );
  assert.equal(
    getDisplayNameFromAddress("name", "", "", record.display.rating, null),
    "name (1)",
  );
  const malformedAddress = decodeAutomatchEntry({ ethAddress: 1 }).record;
  assert.throws(
    () =>
      getDisplayNameFromAddress(
        malformedAddress.display.username,
        malformedAddress.display.ethAddress,
        malformedAddress.display.solAddress,
        malformedAddress.display.rating,
        malformedAddress.display.emojiId,
      ),
    TypeError,
  );
});

test("entry collections retain ordering, malformed heads, and null collections", () => {
  const raw = {
    10: { uid: "ten" },
    2: null,
    malformed: "entry",
    valid: { uid: "host" },
  };
  const decoded = decodeAutomatchEntries(raw);
  assert.deepEqual(Object.keys(decoded), Object.keys(raw));
  assert.deepEqual(decoded["2"], {
    isNull: true,
    isTruthy: false,
    record: null,
  });
  assert.deepEqual(decoded.malformed, {
    isNull: false,
    isTruthy: true,
    record: null,
  });
  assert.equal(decoded.valid.record.uid, "host");
  for (const malformed of [null, undefined, false, 0, "", true, 1, "entry", []])
    assert.equal(decodeAutomatchEntries(malformed), null);
  assert.deepEqual(decodeAutomatchEntries({}), {});
});

test("malformed head fallback creates independent empty field objects", () => {
  const decoded = decodeAutomatchEntries({
    malformed: false,
    valid: { uid: "host" },
  });
  const [inviteId, entry] = Object.entries(decoded)[0];
  const fields = entry.record || emptyAutomatchEntryFields();
  assert.equal(inviteId, "malformed");
  assert.deepEqual(fields, {
    uid: "",
    timestamp: 0,
    numericTimestamp: null,
    rating: 0,
    hostColor: "",
    password: "",
    gameVariant: "",
    telegramDeliveryVersion: null,
    display: {},
  });
  fields.display.username = "changed";
  assert.deepEqual(emptyAutomatchEntryFields().display, {});
});

test("profile projections retain malformed queue truthiness and numeric timestamp rules", async () => {
  const inviteId = "auto_abcdefghijk";
  for (const [raw, expectedSort] of [
    [null, null],
    [false, null],
    [0, null],
    ["", null],
    [true, 100],
    ["malformed", 100],
    [[], 100],
    [{}, 100],
    [{ timestamp: "123.75" }, 100],
    [{ timestamp: 123.75 }, 123],
  ]) {
    const writes = [];
    const core = createProfileGamesProjectionCore({
      repository: {
        commitProjectionWrites: async (next) => writes.push(...next),
        getProjections: async () => new Map(),
        readInviteMetadata: async () => ({
          hostId: "host-login",
          automatchStateHint: "canceled",
        }),
        readAutomatchEntry: async () => decodeAutomatchEntry(raw),
        hasCompletedRatingUpdate: async () => false,
        readProfileOwnershipSnapshot: async () => ({
          profileDataById: new Map([
            ["host-profile", { username: "host", emoji: 1 }],
          ]),
          profileIdByLoginUid: new Map([["host-login", "host-profile"]]),
        }),
      },
    });
    const result = await core.recomputeInviteProjection(inviteId, "test", {
      eventTimestampMs: 100,
    });
    assert.equal(result.shouldProject, Boolean(raw));
    if (expectedSort === null) {
      assert.deepEqual(writes, []);
    } else {
      assert.equal(writes.length, 1);
      assert.equal(writes[0].data.status, "pending");
      assert.equal(writes[0].data.listSortAt, expectedSort);
    }
  }
});
