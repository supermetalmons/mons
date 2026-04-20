import { getRoutePathForTarget, parseRouteState } from "./routeState";

describe("routeState snapshots", () => {
  test("parses snapshot ids from the path", () => {
    const route = parseRouteState("/snapshot/swapped-fen");

    expect(route.mode).toBe("snapshot");
    expect(route.snapshotId).toBe("swapped-fen");
  });

  test("builds snapshot paths without query parameters", () => {
    const path = getRoutePathForTarget({
      mode: "snapshot",
      path: "snapshot/swapped-fen",
      inviteId: null,
      snapshotId: "swapped-fen",
      eventId: null,
      autojoin: false,
    });

    expect(path).toBe("/snapshot/swapped-fen");
  });
});
