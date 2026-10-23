import assert from "node:assert/strict";
import test from "node:test";
import { validateCurrentSocketAdmission } from "../src/socketAdmission.ts";
import type { SocketSession } from "../src/socketSession.ts";
import { SOCKET_TEST_SESSION_ID } from "./socketTestSession.ts";

for (const channel of ["matches", "metadata", "wagers"] as const) {
  const changedMessage =
    channel === "matches"
      ? "Match admission changed"
      : `Invite ${channel} changed`;
  const name =
    channel === "matches"
      ? "Match"
      : channel === "metadata"
        ? "Metadata"
        : "Wagers";

  test(`${channel} final admission preserves failure precedence and short circuits later checks`, async () => {
    const cases = [
      {
        name: "changed revision outranks expiry, access and capacity",
        revision: 2,
        expired: true,
        denied: true,
        full: true,
        status: 409,
        message: changedMessage,
        calls: [],
      },
      {
        name: "changed privacy outranks expiry, access and capacity",
        passwordProtected: true,
        expired: true,
        denied: true,
        full: true,
        status: 409,
        message: changedMessage,
        calls: [],
      },
      {
        name: "expired and denied retains channel precedence",
        expired: true,
        denied: true,
        full: true,
        status: channel === "matches" ? 401 : 403,
        message:
          channel === "matches" ? "Session expired" : "Invite access denied",
        calls: channel === "matches" ? [] : ["access"],
      },
      {
        name: "expired admission skips capacity",
        expired: true,
        full: true,
        status: 401,
        message: "Session expired",
        calls: channel === "matches" ? [] : ["access"],
      },
      {
        name: "denied admission skips capacity",
        denied: true,
        full: true,
        status: 403,
        message: "Invite access denied",
        calls: ["access"],
      },
      {
        name: "full admission preserves retry response",
        full: true,
        status: 429,
        message: `${name} room is full`,
        calls: ["access", "capacity"],
      },
    ];
    for (const scenario of cases) {
      const calls: string[] = [];
      const response = validateCurrentSocketAdmission({
        channel,
        admission: {
          revision: 1,
          passwordProtected: false,
          session: {
            authenticated: true,
            sid: SOCKET_TEST_SESSION_ID,
            authExpiresAtMs: scenario.expired ? 0 : Number.MAX_SAFE_INTEGER,
          },
        },
        current: {
          revision: scenario.revision ?? 1,
          passwordProtected: scenario.passwordProtected ?? false,
        },
        canReceive: () => {
          calls.push("access");
          return !scenario.denied;
        },
        capacityFull: () => {
          calls.push("capacity");
          return scenario.full ?? false;
        },
      });
      assert.ok(response instanceof Response, scenario.name);
      assert.equal(response.status, scenario.status, scenario.name);
      assert.equal(await response.text(), scenario.message, scenario.name);
      assert.equal(
        response.headers.get("Retry-After"),
        scenario.status === 429 ? "60" : null,
        scenario.name,
      );
      assert.deepEqual(calls, scenario.calls, scenario.name);
    }
  });

  test(`${channel} final admission accepts current authenticated and public sessions synchronously`, () => {
    const sessions: SocketSession[] = [
      { authenticated: false },
      {
        authenticated: true,
        sid: SOCKET_TEST_SESSION_ID,
        authExpiresAtMs: Number.MAX_SAFE_INTEGER,
      },
    ];
    for (const session of sessions) {
      const calls: string[] = [];
      assert.equal(
        validateCurrentSocketAdmission({
          channel,
          admission: { revision: 1, passwordProtected: false, session },
          current: { revision: 1, passwordProtected: false },
          canReceive: () => {
            calls.push("access");
            return true;
          },
          capacityFull: () => {
            calls.push("capacity");
            return false;
          },
        }),
        null,
      );
      assert.deepEqual(calls, ["access", "capacity"]);
    }
  });
}
