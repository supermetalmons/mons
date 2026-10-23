import assert from "node:assert/strict";
import { appendFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      context.parentURL?.endsWith(".ts") &&
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      !/\.[^/]+$/.test(specifier)
    ) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const { createBoardWagerRuntime } = await import(
  process.env.MONS_WAGER_RUNTIME_MODULE ?? "../src/game/boardWagerRuntime.ts"
);

const layouts = {
  player: {
    pile: { x: 1, y: 10, w: 2, h: 1 },
    winner: { x: 0, y: 10, w: 4, h: 2 },
  },
  opponent: {
    pile: { x: 1, y: 0.5, w: 2, h: 1 },
    winner: { x: 0, y: 0, w: 4, h: 2 },
  },
};
const player = { material: "dust", count: 2, pending: true };
const opponent = { material: "dust", count: 3, pending: false };
const empty = {
  player: null,
  opponent: null,
  winner: null,
  winAnimationActive: false,
  playerDisappearing: null,
  opponentDisappearing: null,
};

function assertFrame(frame, expected) {
  for (const axis of ["x", "y"]) {
    assert.ok(
      Math.abs(frame[axis] - expected[axis]) < 1e-10,
      `${axis}: expected ${expected[axis]}, received ${frame[axis]}`,
    );
  }
}

function harness(t, { commit = true } = {}) {
  let now = 0;
  let nextId = 1;
  let randomSeed = 17;
  let canLayout = true;
  let avatarSize = 1;
  let flipped = false;
  let onRender = () => {};
  const timers = new Map();
  const rafs = new Map();
  const renders = [];
  const scheduled = [];
  const random = () => {
    randomSeed = (Math.imul(randomSeed, 1664525) + 1013904223) >>> 0;
    return randomSeed / 4294967296;
  };
  t.mock.method(Math, "random", random);
  const runtime = createBoardWagerRuntime({
    canLayout: () => canLayout,
    getAvatarSize: () => avatarSize,
    getDisplaySlot: (opponent) =>
      opponent !== flipped ? "opponent" : "player",
    getFallbackRect: (opponent, scale) => ({
      x: 1,
      y: opponent !== flipped ? 0.5 : 10,
      w: 2 * scale,
      h: scale,
    }),
    setTimeout(callback, delay) {
      const id = nextId++;
      timers.set(id, { callback, due: now + delay });
      scheduled.push(["timeout", id, now, delay]);
      return id;
    },
    cancelTimeout(id) {
      if (id === null) return;
      timers.delete(id);
      scheduled.push(["cancelTimeout", id, now]);
    },
    requestAnimationFrame(callback) {
      const id = nextId++;
      rafs.set(id, callback);
      scheduled.push(["raf", id, now]);
      return id;
    },
    cancelAnimationFrame(id) {
      if (id === null) return;
      rafs.delete(id);
      scheduled.push(["cancelRaf", id, now]);
    },
    now: () => now,
    random,
    log: () => {},
  });
  const handler = (state) => {
    renders.push(structuredClone(state));
    onRender(state);
  };
  runtime.setWagerRenderHandler(handler);
  if (commit) runtime.setWagerSlotLayouts(structuredClone(layouts), 0);
  t.after(() => {
    if (process.env.MONS_WAGER_TRACE_PATH) {
      appendFileSync(
        process.env.MONS_WAGER_TRACE_PATH,
        `${JSON.stringify({ name: t.name, renders, scheduled, randomSeed })}\n`,
      );
    }
    runtime.setWagerRenderHandler(null);
    runtime.dispose();
    assert.equal(timers.size, 0, "wager timers leaked after disposal");
    assert.equal(rafs.size, 0, "wager frames leaked after disposal");
  });
  const advance = (milliseconds) => {
    const until = now + milliseconds;
    let iterations = 0;
    while (true) {
      const next = [...timers.entries()]
        .filter(([, timer]) => timer.due <= until)
        .sort((a, b) => a[1].due - b[1].due || a[0] - b[0])[0];
      if (!next) break;
      assert.ok(iterations++ < 1000, "timer loop did not settle");
      const [id, timer] = next;
      timers.delete(id);
      now = timer.due;
      timer.callback();
    }
    now = until;
  };
  return {
    ...runtime,
    renders,
    latest: () => renders.at(-1),
    pending: () => ({ timers: timers.size, rafs: rafs.size }),
    onRender: (callback) => (onRender = callback),
    rebind: () => runtime.setWagerRenderHandler(handler),
    setCanLayout: (value) => (canLayout = value),
    setAvatarSize: (value) => (avatarSize = value),
    flip: () => (flipped = !flipped),
    advance,
    frameAt(time) {
      assert.ok(time >= now);
      advance(time - now);
      for (const [id, callback] of [...rafs]) {
        if (!rafs.has(id)) continue;
        rafs.delete(id);
        callback(now);
      }
    },
  };
}

test("initial piles stay still until readiness and later appearances retain pending state", (t) => {
  const h = harness(t);
  assert.deepEqual(h.latest(), empty);
  h.setWagerPiles({ player, opponent });
  assert.equal(h.latest().player.animation, "none");
  assert.equal(h.latest().opponent.animation, "none");
  assert.equal(h.latest().player.isPending, true);
  assert.equal(h.latest().opponent.isPending, false);
  h.setWagerPiles({});
  assert.deepEqual(h.latest(), empty);
  assert.deepEqual(h.pending(), { timers: 0, rafs: 0 });
  h.markWagerInitialStateReceived();
  h.setWagerPiles({ player, opponent });
  assert.equal(h.latest().player.animation, "appear");
  assert.equal(h.latest().opponent.animation, "appear");
  h.updateLayout();
  assert.equal(h.latest().player.animation, "none");
});

test("both disappearance snapshots last exactly 280 ms and stop pulsing", (t) => {
  const h = harness(t);
  h.setWagerPiles({ player, opponent });
  const initial = h.latest();
  h.markWagerInitialStateReceived();
  h.setWagerPiles({});
  assert.deepEqual(h.latest().playerDisappearing, {
    ...initial.player,
    animation: "disappear",
    isPending: false,
  });
  assert.deepEqual(h.latest().opponentDisappearing, {
    ...initial.opponent,
    animation: "disappear",
    isPending: false,
  });
  h.advance(279);
  assert.equal(h.latest().playerDisappearing.count, 2);
  assert.equal(h.latest().opponentDisappearing.count, 3);
  assert.deepEqual(h.pending(), { timers: 2, rafs: 0 });
  h.advance(1);
  assert.deepEqual(h.latest(), empty);
  assert.deepEqual(h.pending(), { timers: 0, rafs: 0 });
});

test("reappearance cancels only its own timer and a replacement receives a full delay", (t) => {
  const h = harness(t);
  h.setWagerPiles({ player, opponent });
  h.markWagerInitialStateReceived();
  h.setWagerPiles({});
  h.advance(100);
  h.setWagerPiles({ player });
  assert.equal(h.latest().playerDisappearing, null);
  assert.equal(h.latest().opponentDisappearing.count, 3);
  assert.equal(h.pending().timers, 1);
  h.advance(180);
  assert.equal(h.latest().opponentDisappearing, null);
  h.setWagerPiles({});
  h.advance(120);
  h.setWagerPiles({ player: { ...player, count: 5 } });
  h.setWagerPiles({});
  h.advance(160);
  assert.equal(h.latest().playerDisappearing.count, 5);
  h.advance(120);
  assert.equal(h.latest().playerDisappearing, null);
  assert.equal(h.pending().timers, 0);
});

test("transition suppression is consumed once and layout hiding is not disappearance", (t) => {
  const h = harness(t);
  h.markWagerInitialStateReceived();
  h.setWagerPiles({ player, opponent });
  h.suppressWagerPileTransition();
  h.setWagerPiles({});
  assert.deepEqual(h.latest(), empty);
  assert.equal(h.pending().timers, 0);
  h.setWagerPiles({ player, opponent });
  assert.equal(h.latest().player.animation, "appear");
  const hidden = structuredClone(layouts);
  hidden.player.pile.w = 0;
  hidden.player.pile.h = 0;
  h.setWagerSlotLayouts(hidden, 0);
  assert.equal(h.latest().player, null);
  assert.equal(h.latest().playerDisappearing, null);
  assert.equal(h.pending().timers, 0);
  assert.equal(h.latest().opponent.count, 3);
  h.setWagerSlotLayouts(layouts, 0);
  assert.equal(h.latest().player.animation, "appear");
});

test("layout availability gates rendering while handlers can detach and replay current state", (t) => {
  const h = harness(t);
  h.setCanLayout(false);
  h.setWagerPiles({ player });
  assert.deepEqual(h.latest(), empty);
  h.setCanLayout(true);
  h.updateLayout();
  assert.equal(h.latest().player.count, 2);
  h.setWagerRenderHandler(null);
  const renderCount = h.renders.length;
  h.setWagerPiles({ opponent });
  h.updateLayout({ emitWithoutHandler: false });
  assert.equal(h.renders.length, renderCount);
  h.rebind();
  assert.equal(h.latest().player, null);
  assert.equal(h.latest().opponent.count, 3);
});

for (const winnerIsOpponent of [false, true]) {
  test(`${winnerIsOpponent ? "opponent" : "player"} win retains anchored starts and completes at 800 ms`, (t) => {
    const h = harness(t);
    h.setWagerPiles({ player, opponent: { ...opponent, count: 2 } });
    const source = h.latest()[winnerIsOpponent ? "opponent" : "player"];
    h.showResolvedWager(winnerIsOpponent, "dust", 2, true);
    const initial = h.latest();
    assert.equal(initial.player, null);
    assert.equal(initial.opponent, null);
    assert.equal(initial.winner.count, 4);
    assert.equal(initial.winner.actualCount, 4);
    assert.deepEqual(initial.winner.frames.slice(0, 2), source.frames);
    assert.equal(h.isWagerWinAnimationPendingOrActive(), true);
    assert.deepEqual(h.pending(), { timers: 0, rafs: 1 });
    h.frameAt(400);
    const midpoint = h.latest();
    assert.notDeepEqual(
      midpoint.winner.frames.slice(2),
      initial.winner.frames.slice(2),
    );
    assertFrame(
      midpoint.winner.frames[2],
      winnerIsOpponent
        ? { x: 2.5797686311846375, y: 2.742252388277858 }
        : { x: 2.2079276634688396, y: 9.696215109312476 },
    );
    assert.equal(midpoint.winAnimationActive, true);
    h.frameAt(799);
    assert.equal(h.latest().winAnimationActive, true);
    h.frameAt(800);
    assert.equal(h.latest().winAnimationActive, false);
    assert.equal(h.isWagerWinAnimationPendingOrActive(), false);
    assert.deepEqual(
      h.latest().winner.rect,
      layouts[winnerIsOpponent ? "opponent" : "player"].winner,
    );
    assertFrame(h.latest().winner.frames[2], {
      x: 2.520976,
      y: winnerIsOpponent ? 1.29888 : 11.29888,
    });
    assert.deepEqual(h.pending(), { timers: 0, rafs: 0 });
    const settled = h.latest();
    h.frameAt(1000);
    assert.equal(h.latest(), settled);
  });
}

test("normal and winner caps preserve existing displayed and actual totals", (t) => {
  const h = harness(t);
  h.setWagerPiles({ player: { ...player, count: 40 }, opponent });
  assert.equal(h.latest().player.count, 13);
  assert.equal(h.latest().player.actualCount, 40);
  assert.equal(h.latest().player.frames.length, 13);
  h.showResolvedWager(false, "dust", 40, false);
  assert.equal(h.latest().winner.count, 32);
  assert.equal(h.latest().winner.actualCount, 80);
  assert.equal(h.pending().rafs, 0);
  h.showResolvedWager(true, "dust", 40, true);
  assert.equal(h.latest().winner.count, 32);
  assert.equal(h.latest().winner.actualCount, 32);
  assert.equal(h.latest().winner.frames.length, 32);
  h.frameAt(400);
  h.frameAt(800);
  assert.equal(h.latest().winner.count, 32);
  assert.equal(h.latest().winner.actualCount, 32);
});

test("resolution waits for a current layout and identical geometry still commits it", (t) => {
  const h = harness(t, { commit: false });
  h.setWagerPiles({ player, opponent });
  h.invalidateLayout();
  h.showResolvedWager(false, "dust", 3, true);
  const pending = h.latest();
  assert.equal(h.isWagerWinAnimationPendingOrActive(), true);
  assert.equal(pending.winAnimationActive, false);
  h.setWagerSlotLayouts(layouts, 0);
  assert.equal(h.latest(), pending);
  assert.equal(h.pending().rafs, 0);
  h.setWagerSlotLayouts(layouts, h.getLayoutRevision());
  assert.equal(h.latest().winAnimationActive, true);
  h.frameAt(800);
  h.invalidateLayout();
  h.showResolvedWager(true, "gold", 5, false);
  const beforeCommit = h.latest();
  assert.equal(beforeCommit.winner.count, 6);
  h.setWagerSlotLayouts(structuredClone(layouts), h.getLayoutRevision());
  assert.notEqual(h.latest(), beforeCommit);
  assert.equal(h.latest().winner.count, 10);
  assert.match(h.latest().winner.materialUrl, /\/gold\.webp$/);
  assert.deepEqual(h.latest().winner.rect, layouts.opponent.winner);
});

for (const cancellation of ["piles", "clear", "newMatch", "dispose"]) {
  test(`${cancellation} cancels a resolution deferred across layout invalidation`, (t) => {
    const h = harness(t);
    h.invalidateLayout();
    h.showResolvedWager(false, "dust", 3, true);
    assert.equal(h.isWagerWinAnimationPendingOrActive(), true);
    if (cancellation === "piles") h.setWagerPiles({ player });
    if (cancellation === "clear") h.clearWagerPiles();
    if (cancellation === "newMatch") h.clearWagerPilesForNewMatch();
    if (cancellation === "dispose") h.dispose();
    assert.equal(h.isWagerWinAnimationPendingOrActive(), false);
    h.setWagerSlotLayouts(layouts, h.getLayoutRevision());
    assert.equal(h.latest().winner, null);
    assert.equal(h.latest().winAnimationActive, false);
    assert.equal(h.pending().rafs, 0);
  });
}

test("a newer layout invalidation keeps a deferred result pending until its own commit", (t) => {
  const h = harness(t);
  h.invalidateLayout();
  h.showResolvedWager(false, "dust", 3, true);
  h.invalidateLayout();
  h.setWagerSlotLayouts(layouts, 1);
  assert.equal(h.pending().rafs, 0);
  assert.equal(h.isWagerWinAnimationPendingOrActive(), true);
  h.setWagerSlotLayouts(layouts, 2);
  assert.equal(h.pending().rafs, 1);
  h.frameAt(800);
  h.setWagerSlotLayouts(null);
  h.showResolvedWager(true, "dust", 4, false);
  assert.equal(h.latest().winner.count, 6);
  h.setWagerSlotLayouts(layouts, 2);
  assert.equal(h.latest().winner.count, 8);
});

test("resize and flipped display slots retarget an active win without restarting its clock", (t) => {
  const h = harness(t);
  h.showResolvedWager(false, "dust", 3, true);
  h.frameAt(400);
  const beforeResize = h.latest().winner;
  h.setAvatarSize(0.75);
  h.flip();
  const resized = structuredClone(layouts);
  for (const slot of Object.values(resized)) {
    for (const rect of Object.values(slot)) {
      rect.x += 0.25;
      rect.y += 0.5;
      rect.w *= 0.75;
      rect.h *= 0.75;
    }
  }
  h.invalidateLayout();
  h.setWagerSlotLayouts(resized, h.getLayoutRevision());
  assert.deepEqual(h.latest().winner.rect, resized.opponent.winner);
  assert.ok(h.latest().winner.iconSize < beforeResize.iconSize);
  assert.notDeepEqual(h.latest().winner.frames, beforeResize.frames);
  assert.equal(h.pending().rafs, 1);
  h.frameAt(799);
  assert.equal(h.latest().winAnimationActive, true);
  h.frameAt(800);
  assert.equal(h.latest().winAnimationActive, false);
  assert.deepEqual(h.latest().winner.rect, resized.opponent.winner);
  assertFrame(h.latest().winner.frames[3], { x: 2.140732, y: 1.47416 });
  h.setWagerPiles({ player, opponent });
  assert.deepEqual(h.latest().player.rect, resized.opponent.pile);
  assert.deepEqual(h.latest().opponent.rect, resized.player.pile);
});

test("hidden target layout cancels a running win and prevents another frame", (t) => {
  const h = harness(t);
  h.showResolvedWager(false, "dust", 3, true);
  h.frameAt(200);
  const hidden = structuredClone(layouts);
  hidden.player.winner.w = 0;
  h.setWagerSlotLayouts(hidden, 0);
  assert.equal(h.latest().winner, null);
  assert.equal(h.latest().winAnimationActive, false);
  assert.equal(h.pending().rafs, 0);
  h.frameAt(800);
  assert.equal(h.latest().winner, null);
});

for (const duringFrame of [false, true]) {
  test(`a render callback can clear ${duringFrame ? "during a frame" : "at animation start"} without rescheduling`, (t) => {
    const h = harness(t);
    let armed = !duringFrame;
    h.onRender((state) => {
      if (!armed || !state.winAnimationActive) return;
      armed = false;
      h.clearWagerPilesForNewMatch();
    });
    h.showResolvedWager(false, "dust", 3, true);
    if (duringFrame) {
      armed = true;
      h.frameAt(400);
    }
    assert.deepEqual(h.latest(), empty);
    assert.equal(h.isWagerWinAnimationPendingOrActive(), false);
    assert.deepEqual(h.pending(), { timers: 0, rafs: 0 });
    const renderCount = h.renders.length;
    h.frameAt(1000);
    assert.equal(h.renders.length, renderCount);
  });
}

test("a render callback can replace a win without letting the previous frame claim it", (t) => {
  const h = harness(t);
  h.showResolvedWager(false, "dust", 3, true);
  let replace = true;
  h.onRender((state) => {
    if (!replace || !state.winAnimationActive) return;
    replace = false;
    h.showResolvedWager(true, "gold", 4, true);
  });
  h.frameAt(400);
  assert.equal(h.pending().rafs, 1);
  assert.equal(h.latest().winner.count, 8);
  assert.match(h.latest().winner.materialUrl, /\/gold\.webp$/);
  assert.deepEqual(h.latest().winner.rect, layouts.opponent.winner);
  h.frameAt(800);
  assert.equal(h.latest().winAnimationActive, true);
  h.frameAt(1200);
  assert.equal(h.latest().winAnimationActive, false);
  assert.equal(h.pending().rafs, 0);
});

test("repeated disposal cancels work and permits reuse with the same handler and layout revision", (t) => {
  const h = harness(t);
  h.invalidateLayout();
  h.setWagerSlotLayouts(layouts, 1);
  h.setWagerPiles({ player, opponent });
  h.markWagerInitialStateReceived();
  h.setWagerPiles({});
  assert.equal(h.pending().timers, 2);
  h.dispose();
  h.dispose();
  assert.equal(h.getLayoutRevision(), 1);
  assert.deepEqual(h.pending(), { timers: 0, rafs: 0 });
  assert.deepEqual(h.latest(), empty);
  const renderCount = h.renders.length;
  h.advance(1000);
  assert.equal(h.renders.length, renderCount);
  h.setWagerPiles({ player });
  assert.equal(h.latest().player.animation, "none");
  assert.deepEqual(h.latest().player.rect, layouts.player.pile);
  h.showResolvedWager(true, "dust", 3, true);
  assert.equal(h.latest().winAnimationActive, true);
  assert.equal(h.pending().rafs, 1);
  h.dispose();
  h.dispose();
  assert.equal(h.getLayoutRevision(), 1);
  assert.deepEqual(h.pending(), { timers: 0, rafs: 0 });
  h.showResolvedWager(false, "gold", 2, false);
  assert.equal(h.latest().winner.count, 4);
  assert.equal(h.latest().winAnimationActive, false);
});
