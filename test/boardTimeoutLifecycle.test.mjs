import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import ts from "typescript";

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
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (url.endsWith("/src/lifecycle/lifecycleDiagnostics.ts")) {
      return {
        ...result,
        source: String(result.source).replace("import.meta.env.DEV", "false"),
      };
    }
    return result;
  },
});

const scheduler = await import("../src/game/boardRuntimeScheduler.ts");
const wagerModels = await import("../src/game/boardWagerModels.ts");
const diagnostics = await import("../src/lifecycle/lifecycleDiagnostics.ts");
const source = ts.createSourceFile(
  "board.ts",
  readFileSync(
    process.env.MONS_BOARD_SOURCE ??
      new URL("../src/game/board.ts", import.meta.url),
    "utf8",
  ),
  ts.ScriptTarget.Latest,
  true,
);
const declarations = [
  "currentTextAnimation",
  "disappearingPileTimers",
  "WAGER_DISAPPEAR_ANIMATION_MS",
  "startTextAnimation",
  "fastForwardInstructionsIfNeeded",
  "toggleFromTalkingToIdle",
  "ensureWagerPile",
  "updateWagerLayout",
  "clearDisappearingPile",
  "emitWagerRenderState",
  "cancelWagerWinAnimation",
  "resetWagerPile",
  "resetWagerAnimationState",
  "markWagerInitialStateReceived",
  "clearWagerPiles",
  "clearWagerPilesForNewMatch",
  "setWagerPiles",
  "disposeBoardRuntime",
].map((name) => {
  const declaration = source.statements.find(
    (node) =>
      (ts.isFunctionDeclaration(node) && node.name?.text === name) ||
      (ts.isVariableStatement(node) &&
        node.declarationList.declarations.some(
          (item) => item.name.getText(source) === name,
        )),
  );
  assert.ok(declaration, name);
  return declaration.getText(source).replace(/^export /, "");
});

function harness(t) {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const timers = new Map();
  let now = 0;
  let nextId = 1;
  const setTimeout = (callback, delay = 0) => {
    const id = nextId++;
    timers.set(id, { callback, due: now + delay });
    return id;
  };
  const clearTimeout = (id) => timers.delete(id);
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { setTimeout, clearTimeout },
  });
  globalThis.setTimeout = setTimeout;
  globalThis.clearTimeout = clearTimeout;
  const initialCounters = diagnostics.getLifecycleCounters();
  const renders = [];
  const noop = () => {};
  const rect = { x: 0, y: 0, w: 2, h: 1 };
  const dependencies = {
    ...scheduler,
    ...wagerModels,
    ...diagnostics,
    updateWagerPileLayout: (pile, layout) =>
      wagerModels.updateWagerPileLayout(pile, layout, 1),
    getWagerPileRect: () => rect,
    getWagerWinnerRect: () => rect,
    handleWagerRenderState: (state) => renders.push(structuredClone(state)),
    logBoardWagerDebug: noop,
    stopMonsBoardAsDisplayAnimations: noop,
    hideTimerCountdownDigits: noop,
    stopConfetti: noop,
    removeItemAndCleanUpAnimation: noop,
    clearWavesIntervals: noop,
    clearSparkleIntervals: noop,
    removeHighlights: noop,
    cleanAllPixels: noop,
    hideItemSelectionOrConfirmationOverlay: noop,
    setEndOfGameMarkers: noop,
    emitBoardPlayerInfoOverlayState: noop,
  };
  const initial = {
    talkingDudeTextDiv: { textContent: "" },
    talkingDude: null,
    talkingDudeIsTalking: true,
    instructionsContainerElement: undefined,
    instructionsCloudBg: null,
    playerWagerPile: null,
    opponentWagerPile: null,
    winnerWagerPile: null,
    wagerWinAnimRaf: null,
    wagerWinAnimActive: false,
    wagerWinAnimState: null,
    winnerPileActive: false,
    lastWagerWinnerIsOpponent: false,
    wagerAnimationsReady: false,
    suppressNextWagerPileTransition: false,
    previousPlayerPileVisible: false,
    previousOpponentPileVisible: false,
    lastVisiblePlayerPileState: null,
    lastVisibleOpponentPileState: null,
    disappearingPlayerPile: null,
    disappearingOpponentPile: null,
    playerPilePending: false,
    opponentPilePending: false,
    deferredResolvedWager: null,
    lastWagerEmitSignature: "",
    boardRuntimeToken: 1,
    preserveDisplayAnimation: false,
    cleanupInviteBotButtonThemeListener: null,
    didRegisterResizeHandler: false,
    boardInputHandler: null,
    hasSetupBoardRuntime: true,
    dimmingOverlay: undefined,
    board: null,
    controlsLayer: { innerHTML: "" },
    boardBackgroundLayer: {},
    itemsLayer: null,
    avatarLayer: null,
    effectsLayer: null,
    highlightsLayer: null,
    opponentMoveStatusItems: [],
    playerMoveStatusItems: [],
    doNotShowPlayerAvatarPlaceholderAgain: false,
    doNotShowOpponentAvatarPlaceholderAgain: false,
    opponentAvatar: undefined,
    playerAvatar: undefined,
    opponentAvatarPlaceholder: undefined,
    playerAvatarPlaceholder: undefined,
    inviteBotButtonContainer: undefined,
    inviteBotButtonElement: undefined,
    botStrengthControlVisible: false,
    playerScoreDisplayText: "",
    opponentScoreDisplayText: "",
    playerTimerDisplayText: "",
    opponentTimerDisplayText: "",
    playerTimerColor: "green",
    opponentTimerColor: "green",
    playerInfoPlayerVisible: false,
    playerInfoOpponentVisible: false,
    playerInfoPlayerNameVisible: false,
    playerInfoOpponentNameVisible: false,
  };
  const body = ts.transpileModule(
    `
      const { ${Object.keys(dependencies).join(", ")} } = dependencies;
      let { ${Object.keys(initial).join(", ")} } = initial;
      ${declarations.join("\n")}
      return {
        startTextAnimation,
        fastForwardInstructionsIfNeeded,
        setWagerPiles,
        markWagerInitialStateReceived,
        disposeBoardRuntime,
        state: () => ({
          textElement: talkingDudeTextDiv,
          isAnimating: currentTextAnimation.isAnimating,
          textTimer: currentTextAnimation.timer,
          talkingDudeIsTalking,
          pileTimers: { ...disappearingPileTimers },
        }),
        attachPresentation: () => {
          talkingDudeTextDiv = { textContent: "" };
          controlsLayer = { innerHTML: "" };
          boardBackgroundLayer = {};
        },
      };
    `,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const api = new Function("dependencies", "initial", body)(
    dependencies,
    initial,
  );
  t.after(() => {
    try {
      api.disposeBoardRuntime();
      scheduler.clearTrackedBoardTimeouts();
      scheduler.clearTrackedBoardRafs();
      assert.equal(timers.size, 0);
      assert.deepEqual(diagnostics.getLifecycleCounters(), initialCounters);
    } finally {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
      if (originalWindow) {
        Object.defineProperty(globalThis, "window", originalWindow);
      } else {
        delete globalThis.window;
      }
    }
  });
  return {
    ...api,
    renders,
    latestRender: () => renders.at(-1),
    pending: () => timers.size,
    counter: () =>
      diagnostics.getLifecycleCounters().boardTimeouts -
      initialCounters.boardTimeouts,
    advance(milliseconds) {
      const until = now + milliseconds;
      let callbacks = 0;
      while (true) {
        const next = [...timers.entries()]
          .filter(([, timer]) => timer.due <= until)
          .sort((a, b) => a[1].due - b[1].due || a[0] - b[0])[0];
        if (!next) break;
        assert.ok(callbacks++ < 1000, "timer loop did not settle");
        const [id, timer] = next;
        timers.delete(id);
        now = timer.due;
        timer.callback();
      }
      now = until;
    },
  };
}

const player = { material: "dust", count: 2 };
const opponent = { material: "dust", count: 3 };

function startDisappearingPiles(h) {
  h.setWagerPiles({ player, opponent });
  h.markWagerInitialStateReceived();
  h.setWagerPiles({});
}

test("tutorial typing preserves Unicode characters and character delays", (t) => {
  const h = harness(t);
  h.startTextAnimation("A🪨 B");
  const text = h.state().textElement;
  assert.equal(text.textContent, "");
  assert.equal(h.counter(), 1);
  h.advance(22);
  assert.equal(text.textContent, "");
  h.advance(1);
  assert.equal(text.textContent, "A");
  h.advance(23);
  assert.equal(text.textContent, "A🪨");
  h.advance(54);
  assert.equal(text.textContent, "A🪨");
  h.advance(1);
  assert.equal(text.textContent, "A🪨 ");
  h.advance(23);
  assert.equal(text.textContent, "A🪨 B");
  assert.equal(h.state().isAnimating, false);
  assert.equal(h.state().talkingDudeIsTalking, false);
  assert.equal(h.state().textTimer, null);
  assert.equal(h.pending(), 0);
  assert.equal(h.counter(), 0);
});

test("replacing and fast-forwarding tutorial text cancel the pending step", (t) => {
  const h = harness(t);
  h.startTextAnimation("OLD");
  h.advance(23);
  h.startTextAnimation("NEW 🪨");
  assert.equal(h.pending(), 1);
  assert.equal(h.counter(), 1);
  h.advance(23);
  assert.equal(h.state().textElement.textContent, "N");
  assert.equal(h.fastForwardInstructionsIfNeeded(), true);
  assert.equal(h.fastForwardInstructionsIfNeeded(), false);
  assert.equal(h.state().textElement.textContent, "NEW 🪨");
  assert.equal(h.state().textTimer, null);
  assert.equal(h.pending(), 0);
  assert.equal(h.counter(), 0);
  h.advance(1000);
  assert.equal(h.state().textElement.textContent, "NEW 🪨");
});

test("both wager disappearance timers retain their snapshots for 280 ms", (t) => {
  const h = harness(t);
  startDisappearingPiles(h);
  assert.equal(h.pending(), 2);
  assert.equal(h.counter(), 2);
  assert.equal(h.latestRender().playerDisappearing.count, player.count);
  assert.equal(h.latestRender().opponentDisappearing.count, opponent.count);
  h.advance(279);
  assert.equal(h.latestRender().playerDisappearing.animation, "disappear");
  assert.equal(h.latestRender().opponentDisappearing.animation, "disappear");
  h.advance(1);
  assert.equal(h.latestRender().playerDisappearing, null);
  assert.equal(h.latestRender().opponentDisappearing, null);
  assert.deepEqual(h.state().pileTimers, { player: null, opponent: null });
  assert.equal(h.pending(), 0);
  assert.equal(h.counter(), 0);
});

test("wager reappearance cancels only its own disappearance and can restart", (t) => {
  const h = harness(t);
  startDisappearingPiles(h);
  h.advance(100);
  h.setWagerPiles({ player });
  assert.equal(h.latestRender().playerDisappearing, null);
  assert.equal(h.latestRender().opponentDisappearing.count, opponent.count);
  assert.equal(h.pending(), 1);
  assert.equal(h.counter(), 1);
  h.advance(180);
  assert.equal(h.latestRender().player.count, player.count);
  assert.equal(h.latestRender().opponentDisappearing, null);
  assert.equal(h.counter(), 0);

  h.setWagerPiles({});
  h.advance(120);
  h.setWagerPiles({ player: { ...player, count: 5 } });
  h.setWagerPiles({});
  h.advance(160);
  assert.equal(h.latestRender().playerDisappearing.count, 5);
  assert.equal(h.pending(), 1);
  assert.equal(h.counter(), 1);
  h.advance(120);
  assert.equal(h.latestRender().playerDisappearing, null);
  assert.equal(h.counter(), 0);
});

test("board disposal cancels all three owners once and allows new timers", (t) => {
  const h = harness(t);
  h.startTextAnimation("unfinished instructions");
  const detachedText = h.state().textElement;
  startDisappearingPiles(h);
  assert.equal(h.pending(), 3);
  assert.equal(h.counter(), 3);
  h.disposeBoardRuntime();
  h.disposeBoardRuntime();
  const renderCount = h.renders.length;
  assert.equal(h.state().textElement, null);
  assert.equal(h.state().textTimer, null);
  assert.deepEqual(h.state().pileTimers, { player: null, opponent: null });
  assert.equal(h.pending(), 0);
  assert.equal(h.counter(), 0);
  h.advance(1000);
  assert.equal(detachedText.textContent, "");
  assert.equal(h.renders.length, renderCount);

  h.attachPresentation();
  h.startTextAnimation("Z");
  startDisappearingPiles(h);
  assert.equal(h.pending(), 3);
  assert.equal(h.counter(), 3);
  h.advance(280);
  assert.equal(h.state().textElement.textContent, "Z");
  assert.equal(h.latestRender().playerDisappearing, null);
  assert.equal(h.latestRender().opponentDisappearing, null);
  assert.equal(h.pending(), 0);
  assert.equal(h.counter(), 0);
});
