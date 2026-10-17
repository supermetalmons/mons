import assert from "node:assert/strict";
import test from "node:test";
import { decodeCanonicalInviteParticipants } from "../src/canonicalInviteParticipants.ts";

const paired = { hostId: "host-login", guestId: "guest-login" };

test("canonical participants distinguish missing sources from invalid records", () => {
  for (const value of [null, undefined]) {
    assert.deepEqual(decodeCanonicalInviteParticipants(value), {
      status: "missing",
    });
  }
  for (const value of [false, 0, "invite", [], {}, [paired]]) {
    assert.deepEqual(decodeCanonicalInviteParticipants(value), {
      status: "invalid",
    });
  }
});

test("canonical participants reject malformed IDs without trimming or coercion", () => {
  for (const field of ["hostId", "guestId"]) {
    for (const value of [
      "",
      " login ",
      "invalid/login",
      "x".repeat(129),
      "\ud800",
      1,
      false,
      ["login"],
      { uid: "login" },
    ]) {
      assert.deepEqual(
        decodeCanonicalInviteParticipants({ ...paired, [field]: value }),
        { status: "invalid" },
      );
    }
  }
  assert.deepEqual(
    decodeCanonicalInviteParticipants({ ...paired, guestId: paired.hostId }),
    { status: "invalid" },
  );
});

test("canonical participants preserve source identity, fields, and valid IDs", () => {
  const source = Object.freeze({
    hostId: "Høst-login",
    guestId: "Guest-login",
    hostColor: 7,
    hostRematches: false,
    guestRematches: ["1"],
    eventId: { malformed: true },
    automatchStateHint: "future-state",
    custom: Object.freeze({ retained: [1, null, false] }),
  });
  const before = structuredClone(source);
  const result = decodeCanonicalInviteParticipants(source);
  assert.equal(result.status, "ok");
  if (result.status !== "ok") return;
  assert.equal(result.source, source);
  assert.equal(result.source.custom, source.custom);
  assert.equal(result.hostId, source.hostId);
  assert.equal(result.guestId, source.guestId);
  assert.equal(result.passwordProtected, false);
  assert.deepEqual(source, before);
});

test("pending participants expose null guests without changing stored presence", () => {
  for (const source of [
    { hostId: paired.hostId },
    { hostId: paired.hostId, guestId: undefined },
    { hostId: paired.hostId, guestId: null },
  ]) {
    const before = structuredClone(source);
    const result = decodeCanonicalInviteParticipants(source);
    assert.equal(result.status, "ok");
    if (result.status !== "ok") continue;
    assert.equal(result.guestId, null);
    assert.equal(result.source, source);
    assert.deepEqual(source, before);
  }
});

test("any own password property protects an invite regardless of its value", () => {
  for (const password of [undefined, null, false, "", "private"]) {
    const source = { ...paired, password };
    const result = decodeCanonicalInviteParticipants(source);
    assert.equal(result.status, "ok");
    if (result.status !== "ok") continue;
    assert.equal(result.passwordProtected, true);
    assert.equal(result.source, source);
    assert.equal(result.source.password, password);
  }
});

test("participants preserve accepted prototype fields without inheriting password protection", () => {
  const source = Object.create({ ...paired, password: "inherited" });
  const result = decodeCanonicalInviteParticipants(source);
  assert.equal(result.status, "ok");
  if (result.status !== "ok") return;
  assert.equal(result.source, source);
  assert.equal(result.hostId, paired.hostId);
  assert.equal(result.guestId, paired.guestId);
  assert.equal(result.passwordProtected, false);
  assert.deepEqual(Object.keys(source), []);
});
