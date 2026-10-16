import assert from "node:assert/strict";
import test from "node:test";
import {
  withProfileGameProjectionLock,
  type ProfileGameProjectionLock,
  type ProfileGameProjectionLockStore,
} from "../src/profileGameProjectionLocksD1.ts";

const lock: ProfileGameProjectionLock = {
  scope: "invite",
  resourceId: "invite-1",
  requestId: "request-1",
};

test("projection lock returns the original result after release completes", async () => {
  const events: string[] = [];
  const releasing = Promise.withResolvers<void>();
  const finishRelease = Promise.withResolvers<void>();
  const result = { status: "projected" };
  const locks: Pick<ProfileGameProjectionLockStore, "acquire" | "release"> = {
    async acquire(acquiredLock, ownerId, nowMs) {
      assert.equal(this, locks);
      assert.equal(acquiredLock, lock);
      assert.equal(ownerId, "owner-1");
      assert.equal(nowMs, 123);
      events.push("acquire");
    },
    async release(releasedLock, ownerId) {
      assert.equal(this, locks);
      assert.equal(releasedLock, lock);
      assert.equal(ownerId, "owner-1");
      events.push("release-start");
      releasing.resolve();
      await finishRelease.promise;
      events.push("release-finish");
    },
  };
  let finished = false;
  const projection = withProfileGameProjectionLock(
    locks,
    lock,
    "owner-1",
    123,
    async () => {
      events.push("work");
      return result;
    },
  ).then((value) => {
    finished = true;
    return value;
  });
  await releasing.promise;
  assert.equal(finished, false);
  assert.deepEqual(events, ["acquire", "work", "release-start"]);
  finishRelease.resolve();
  assert.equal(await projection, result);
  assert.deepEqual(events, [
    "acquire",
    "work",
    "release-start",
    "release-finish",
  ]);
});

test("projection lock acquisition failure runs neither work nor release", async () => {
  const failure = new Error("acquisition-failed");
  await assert.rejects(
    withProfileGameProjectionLock(
      {
        async acquire() {
          throw failure;
        },
        async release() {
          assert.fail("unexpected-release");
        },
      },
      lock,
      "owner-1",
      123,
      async () => assert.fail("unexpected-work"),
    ),
    (error) => error === failure,
  );
});

test("projection lock releases after work fails and preserves the failure", async () => {
  const failure = new Error("work-failed");
  const events: string[] = [];
  await assert.rejects(
    withProfileGameProjectionLock(
      {
        async acquire() {
          events.push("acquire");
        },
        async release() {
          events.push("release");
        },
      },
      lock,
      "owner-1",
      123,
      () => {
        events.push("work");
        throw failure;
      },
    ),
    (error) => error === failure,
  );
  assert.deepEqual(events, ["acquire", "work", "release"]);
});

test("projection lock release failure overrides success and work failure", async () => {
  for (const failWork of [false, true]) {
    const failure = new Error("release-failed");
    let releases = 0;
    await assert.rejects(
      withProfileGameProjectionLock(
        {
          async acquire() {},
          async release() {
            releases++;
            throw failure;
          },
        },
        lock,
        "owner-1",
        123,
        async () => {
          if (failWork) throw new Error("work-failed");
          return "projected";
        },
      ),
      (error) => error === failure,
    );
    assert.equal(releases, 1);
  }
});
