import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import { Color } from "mons-rules";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      context.parentURL?.endsWith(".ts") &&
      specifier.startsWith("./") &&
      !/\.[^/]+$/.test(specifier)
    ) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const { createRematchViewing } = await import("../src/game/rematchViewing.ts");

const online = { online: true, localPlayerUid: null };
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const flush = () => new Promise((resolve) => setImmediate(resolve));
const game = (historyCount = 2, turnNumber = 1, fen = "game") => ({
  trackingEntries: Array.from({ length: historyCount }, () => ({})),
  turnNumber,
  scores: { [Color.White]: 3, [Color.Black]: 4 },
  toFen: () => fen,
});
const pair = (matchId = "a", model = game(), emojiId = 1) => ({
  matchId,
  model,
  recordedMoves: 2,
  hostPlayerId: "host",
  guestPlayerId: "guest",
  hostMatch: {
    version: 1,
    color: "white",
    emojiId,
    aura: `aura-${emojiId}`,
    fen: "host-fen",
    status: "surrendered",
    flatMovesString: "move",
    timer: "",
  },
  guestMatch: {
    version: 1,
    color: "black",
    emojiId: 2,
    aura: "guest-aura",
    fen: "guest-fen",
    status: "",
    flatMovesString: "move",
    timer: "",
  },
});

function harness({ load = async (matchId) => pair(matchId), wait } = {}) {
  let session = 1;
  let render = 1;
  let now = 1000;
  let nextTimerId = 0;
  const reads = [];
  const waits = [];
  const timers = new Map();
  const viewer = createRematchViewing({
    loadMatchPair: (matchId) => {
      reads.push(matchId);
      return load(matchId);
    },
    buildHistoricalGame: (_matchId, value) => value.model,
    countRecordedMoves: (_matchId, value) => value.recordedMoves,
    createSessionGuard: () => {
      const expected = session;
      return () => expected === session;
    },
    setTimeout: (callback, delay) => {
      const id = ++nextTimerId;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    wait: async (delay) => {
      waits.push(delay);
      await wait?.(delay);
    },
    now: () => now,
  });
  const begin = () => {
    const expected = ++render;
    return viewer.beginSelection(() => expected === render);
  };
  const select = async (matchId) => {
    const request = begin();
    const selection = await viewer.loadSelection(request, matchId, online);
    return selection && viewer.commitSelection(request, selection);
  };
  return {
    viewer,
    begin,
    select,
    reads,
    waits,
    timers,
    invalidateSession: () => session++,
    invalidateRender: () => render++,
    advance: (ms) => (now += ms),
    runTimer: async () => {
      const [id, timer] = timers.entries().next().value;
      timers.delete(id);
      timer.callback();
      await flush();
    },
  };
}

test("selection loading leaves the displayed match unchanged until a guarded commit", async () => {
  const pending = deferred();
  const h = harness({ load: () => pending.promise });
  const request = h.begin();
  const loading = h.viewer.loadSelection(request, "a", online);
  assert.equal(h.viewer.getSelection(), null);
  const loaded = pair();
  pending.resolve(loaded);
  const selection = await loading;
  assert.equal(h.viewer.getSelection(), null);
  assert.equal(selection.game, loaded.model);
  assert.equal(h.viewer.commitSelection(request, selection), true);
  assert.equal(h.viewer.getSelection(), selection);
  assert.equal(h.viewer.getCachedSelection("a").pair, loaded);
  assert.deepEqual(h.viewer.getScore("a"), { white: 3, black: 4 });
  assert.deepEqual(h.reads, ["a"]);
});

test("a slower earlier navigation cannot load or commit over the latest selection", async () => {
  const pending = deferred();
  const h = harness({
    load: async (matchId) =>
      matchId === "a" ? pending.promise : pair(matchId),
  });
  const first = h.begin();
  const loading = h.viewer.loadSelection(first, "a", online);
  assert.equal(await h.select("b"), true);
  pending.resolve(pair("a"));
  assert.equal(await loading, null);
  assert.equal(
    h.viewer.commitSelection(first, {
      matchId: "a",
      pair: pair(),
      game: game(),
    }),
    false,
  );
  assert.equal(h.viewer.getSelection().matchId, "b");
});

test("session, render, and explicit selection clearing reject a prepared commit", async (t) => {
  for (const invalidate of [
    (h) => h.invalidateSession(),
    (h) => h.invalidateRender(),
    (h) => h.viewer.clearSelection(),
  ]) {
    await t.test(invalidate.toString(), async () => {
      const h = harness();
      const request = h.begin();
      const prepared = await h.viewer.loadSelection(request, "a", online);
      invalidate(h);
      assert.equal(h.viewer.commitSelection(request, prepared), false);
      assert.equal(h.viewer.getSelection(), null);
    });
  }
});

test("failed navigation preserves the displayed selection and its archive refresh", async () => {
  let archived = null;
  const h = harness({
    load: async (matchId) => (matchId === "a" ? archived : null),
  });
  const provisional = pair();
  h.viewer.seedProvisional(provisional);
  assert.equal(await h.select("a"), true);
  const displayedGame = h.viewer.getSelection().game;
  let refreshed = 0;
  h.viewer.refreshSelectedArchive(
    () => true,
    () => refreshed++,
    assert.fail,
  );
  assert.equal(await h.select("missing"), null);
  assert.equal(h.viewer.getSelection().matchId, "a");
  archived = pair("a", game(), 9);
  await h.runTimer();
  assert.equal(refreshed, 1);
  assert.equal(h.viewer.getSelection().pair.hostMatch.emojiId, 9);
  assert.equal(h.viewer.getSelection().game, displayedGame);
});

test("successful replacement and returning to the same match invalidate old archive refreshes", async (t) => {
  for (const returnToSameMatch of [false, true]) {
    await t.test(String(returnToSameMatch), async () => {
      const archive = deferred();
      let archivePending = false;
      const h = harness({
        load: async (matchId) =>
          matchId === "a"
            ? archivePending
              ? archive.promise
              : null
            : pair(matchId),
      });
      h.viewer.seedProvisional(pair());
      await h.select("a");
      let refreshed = 0;
      h.viewer.refreshSelectedArchive(
        () => true,
        () => refreshed++,
        assert.fail,
      );
      archivePending = true;
      await h.runTimer();
      if (returnToSameMatch) {
        h.viewer.clearSelection();
        const request = h.begin();
        const cached = h.viewer.getCachedSelection("a");
        assert.equal(h.viewer.commitSelection(request, cached), true);
      } else {
        await h.select("b");
      }
      archive.resolve(pair("a", game(), 9));
      await flush();
      assert.equal(refreshed, 0);
      assert.equal(
        h.viewer.getSelection().matchId,
        returnToSameMatch ? "a" : "b",
      );
      assert.equal(h.viewer.getSelection().pair.hostMatch.emojiId, 1);
    });
  }
});

test("equal short history refreshes actor cosmetics without replacing gameplay", async () => {
  const original = pair("a", game(1, 4), 1);
  const refreshed = {
    ...pair("a", game(1, 4), 9),
    hostPlayerId: "guest",
    guestPlayerId: "host",
    hostMatch: { ...original.guestMatch, emojiId: 8, aura: "guest-new" },
    guestMatch: {
      ...original.hostMatch,
      emojiId: 7,
      aura: "host-new",
      fen: "different-fen",
      status: "",
    },
  };
  let reads = 0;
  const h = harness({
    load: async () => (++reads === 1 ? original : refreshed),
  });
  await h.select("a");
  const selected = h.viewer.getSelection();
  assert.equal(selected.game, original.model);
  assert.equal(selected.pair.hostMatch.emojiId, 7);
  assert.equal(selected.pair.guestMatch.emojiId, 8);
  assert.equal(selected.pair.hostMatch.aura, "host-new");
  assert.equal(selected.pair.hostMatch.fen, original.hostMatch.fen);
  assert.equal(selected.pair.hostMatch.status, "surrendered");
  assert.deepEqual(h.waits, [250]);
});

test("short-history refresh prefers tracking length, then turn, then recorded moves", async (t) => {
  for (const [model, recordedMoves] of [
    [game(2, 1), 2],
    [game(1, 5), 2],
    [game(1, 4), 3],
  ]) {
    await t.test(
      `${model.trackingEntries.length}/${model.turnNumber}/${recordedMoves}`,
      async () => {
        const original = pair("a", game(1, 4));
        const refreshed = { ...pair("a", model, 9), recordedMoves };
        let reads = 0;
        const h = harness({
          load: async () => (++reads === 1 ? original : refreshed),
        });
        await h.select("a");
        assert.equal(h.viewer.getSelection().game, model);
        assert.equal(h.viewer.getSelection().pair, refreshed);
      },
    );
  }
});

test("invalidation during the short-history wait prevents the forced archive read", async () => {
  const pause = deferred();
  const h = harness({
    load: async () => pair("a", game(1)),
    wait: () => pause.promise,
  });
  const request = h.begin();
  const pending = h.viewer.loadSelection(request, "a", online);
  await flush();
  h.viewer.clearSelection();
  pause.resolve();
  assert.equal(await pending, null);
  assert.deepEqual(h.reads, ["a"]);
});

test("missing history retries once and respects the existing miss cooldown", async () => {
  const h = harness({ load: async () => null });
  assert.equal(await h.select("a"), null);
  assert.deepEqual(h.reads, ["a", "a"]);
  assert.equal(await h.select("a"), null);
  assert.deepEqual(h.reads, ["a", "a"]);
  h.advance(3000);
  assert.equal(await h.select("a"), null);
  assert.deepEqual(h.reads, ["a", "a", "a", "a"]);
});

test("reset rejects pending data and cancels archive timers without retaining selection or scores", async () => {
  const pending = deferred();
  const h = harness({ load: () => pending.promise });
  h.viewer.seedProvisional(pair());
  const request = h.begin();
  const cached = h.viewer.getCachedSelection("a");
  h.viewer.commitSelection(request, cached);
  h.viewer.refreshSelectedArchive(() => true, assert.fail, assert.fail);
  h.viewer.setScore("a", { white: 7, black: 2 });
  const loading = h.viewer.loadSelection(request, "a", online);
  h.viewer.reset();
  pending.resolve(pair());
  assert.equal(await loading, null);
  assert.equal(h.viewer.getSelection(), null);
  assert.equal(h.viewer.getCachedSelection("a"), null);
  assert.equal(h.viewer.getScore("a"), undefined);
  assert.equal(h.timers.size, 0);
});

test("local series snapshots preserve game, variant, scores, orientation, and resignation", async () => {
  const h = harness();
  h.viewer.ensureLocalSeries();
  const first = h.viewer.getLocalSeriesDescriptor();
  assert.equal(first.inviteId, "local-1");
  assert.equal(first.activeMatchId, "local-1");
  assert.equal(first.hasSeries, false);
  const firstGame = game(3, 8, "local-fen");
  h.viewer.advanceLocalSeries({
    gameVariant: "variant",
    gameModel: firstGame,
    boardFlipped: true,
    resignedColor: "black",
  });
  const descriptor = h.viewer.getLocalSeriesDescriptor();
  assert.equal(descriptor.activeMatchId, "local-11");
  assert.equal(descriptor.hasSeries, true);
  assert.deepEqual(
    descriptor.matches.map((match) => [match.index, match.isActiveMatch]),
    [
      [0, false],
      [1, true],
    ],
  );
  const snapshot = h.viewer.getLocalSnapshot("local-1");
  assert.equal(snapshot.gameModel, firstGame);
  assert.equal(snapshot.gameVariant, "variant");
  assert.equal(snapshot.boardFlipped, true);
  assert.equal(snapshot.resignedColor, "black");
  assert.deepEqual(h.viewer.getScore("local-1"), { white: 3, black: 4 });
  assert.equal(h.viewer.getScore("local-11"), undefined);
  const request = h.begin();
  const selected = await h.viewer.loadSelection(request, "local-1", {
    online: false,
    localPlayerUid: "signed-in",
  });
  assert.equal(selected.game, firstGame);
  assert.equal(selected.pair.hostPlayerId, "signed-in");
  assert.equal(selected.pair.hostMatch.gameVariant, "variant");
  assert.equal(selected.pair.hostMatch.fen, "local-fen");
  assert.equal(selected.pair.hostMatch.color, "black");
  assert.equal(selected.pair.hostMatch.status, "surrendered");
  assert.equal(h.viewer.commitSelection(request, selected), true);
  assert.deepEqual(h.reads, []);
});

test("local reset preserves the monotonic series seed and clears old snapshots", () => {
  const h = harness();
  h.viewer.advanceLocalSeries({
    gameVariant: "variant",
    gameModel: game(),
    boardFlipped: false,
    resignedColor: null,
  });
  h.viewer.resetLocalSeries();
  assert.equal(h.viewer.getLocalSnapshot("local-1"), null);
  assert.equal(h.viewer.getLocalSeriesDescriptor(), null);
  h.viewer.ensureLocalSeries();
  assert.equal(h.viewer.getLocalSeriesDescriptor().inviteId, "local-2");
  h.viewer.reset();
  h.viewer.ensureLocalSeries();
  assert.equal(h.viewer.getLocalSeriesDescriptor().inviteId, "local-3");
});

test("score prefetch uses the shared history cache and publishes actual score changes", async () => {
  const h = harness();
  let changes = 0;
  assert.equal(
    await h.viewer.prefetchScores("live", ["a", "b"], () => changes++),
    true,
  );
  assert.equal(changes, 2);
  assert.deepEqual(h.viewer.getScore("b"), { white: 3, black: 4 });
  await h.select("a");
  assert.deepEqual(h.reads, ["a", "b"]);
});
