import assert from "node:assert/strict";
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

const { createGameControlsStore } =
  await import("../src/game/gameControlsStore.ts");
const { deriveGameControlsView } =
  await import("../src/game/gameControlsModel.ts");
const { deriveBoardViewControls } =
  await import("../src/game/boardViewPolicy.ts");

const config = { duration: 60, progress: 0, requestDate: 1000 };

test("snapshots retain identity until state changes and unsubscribe does not reset state", () => {
  const store = createGameControlsStore(config);
  const initial = store.getSnapshot();
  assert.equal(store.getSnapshot(), initial);
  const snapshots = [];
  const stop = store.subscribe(() => snapshots.push(store.getSnapshot()));
  store.updateContext({ isOnlineGame: false });
  store.updatePresentation({ endMatchVisible: false });
  assert.equal(store.getSnapshot(), initial);
  assert.equal(snapshots.length, 0);
  store.updateContext({ isOnlineGame: true, sessionId: 2 });
  store.updatePresentation({ endMatchVisible: true, endMatchConfirmed: true });
  assert.equal(snapshots.length, 2);
  assert.equal(initial.context.isOnlineGame, false);
  assert.equal(initial.presentation.endMatchVisible, false);
  const retained = store.getSnapshot();
  stop();
  const stopAgain = store.subscribe(() => {});
  assert.equal(store.getSnapshot(), retained);
  store.updateContext({ isOnlineGame: false });
  assert.equal(snapshots.length, 2);
  stopAgain();
});

test("synchronous presentation updates expose current context and preserve unrelated retained controls", () => {
  const store = createGameControlsStore(config);
  const observed = [];
  store.updatePresentation({ endMatchConfirmed: true, homeVisible: true });
  store.subscribe(() => observed.push(store.getSnapshot()));
  store.updateContext({ isWatchOnly: true, isOnlineGame: true });
  store.updatePresentation({ watchOnlyVisible: true });
  store.updateContext({ isWatchOnly: false, isGameWithBot: true });
  store.updatePresentation({ voiceReactionVisible: true });
  const context = observed.at(-1).context;
  assert.equal(context.isWatchOnly, false);
  assert.equal(context.isGameWithBot, true);
  assert.equal(observed.at(-1).presentation.endMatchConfirmed, true);
  assert.equal(observed.at(-1).presentation.homeVisible, true);
});

test("sequential control dispatches read the latest state and preserve unrelated presentation", () => {
  const store = createGameControlsStore(config);
  store.updateContext({ sessionId: 4, isOnlineGame: true });
  store.updatePresentation({ endMatchConfirmed: true, waitingText: "waiting" });
  const before = store.getSnapshot();
  const observed = [];
  store.subscribe(() => observed.push(store.getSnapshot()));

  store.dispatchGameControls({ type: "setUndoVisible", visible: true });
  store.dispatchGameControls({ type: "setUndoEnabled", enabled: true });
  store.dispatchGameControls({ type: "setAutomoveEnabled", enabled: false });
  store.dispatchGameControls({ type: "setPrimaryAction", action: "rematch" });

  const snapshot = store.getSnapshot();
  assert.equal(observed.length, 4);
  assert.equal(observed.at(-1), snapshot);
  assert.equal(snapshot.context, before.context);
  assert.equal(snapshot.presentation.endMatchConfirmed, true);
  assert.equal(snapshot.presentation.waitingText, "waiting");
  assert.deepEqual(snapshot.presentation.gameControls.undo, {
    visible: true,
    enabled: true,
  });
  assert.equal(snapshot.presentation.gameControls.automove.enabled, false);
  assert.equal(snapshot.presentation.gameControls.primaryAction, "rematch");
  assert.equal(
    snapshot.presentation.gameControls.timer,
    before.presentation.gameControls.timer,
  );
  assert.deepEqual(before.presentation.gameControls.undo, {
    visible: false,
    enabled: false,
  });
  assert.equal(observed[0].presentation.gameControls.undo.enabled, false);
});

test("no-op control dispatches retain the snapshot and do not notify subscribers", () => {
  const store = createGameControlsStore(config);
  let notifications = 0;
  store.subscribe(() => notifications++);
  const initial = store.getSnapshot();
  store.dispatchGameControls({ type: "setUndoVisible", visible: false });
  store.dispatchGameControls({ type: "enableTimer" });
  store.dispatchGameControls({ type: "hideGameControls" });
  assert.equal(store.getSnapshot(), initial);
  assert.equal(notifications, 0);

  store.dispatchGameControls({ type: "showResign" });
  const changed = store.getSnapshot();
  store.dispatchGameControls({ type: "showResign" });
  assert.notEqual(changed, initial);
  assert.equal(store.getSnapshot(), changed);
  assert.equal(notifications, 1);
});

test("context changes never recreate timer configuration or reset disabled requests", () => {
  const store = createGameControlsStore(config);
  const dispatch = store.dispatchGameControls;
  const timer = { duration: 60, progress: 15, requestDate: 5000 };
  dispatch({ type: "showTimerProgress", config: timer });
  dispatch({ type: "enableTimer" });
  dispatch({ type: "disableTimer" });
  const gameControls = store.getSnapshot().presentation.gameControls;
  store.updateContext({ isOnlineGame: true, boardViewMode: "historicalView" });
  store.updateContext({ boardViewMode: "activeLive" });
  assert.equal(store.getSnapshot().presentation.gameControls, gameControls);
  assert.deepEqual(gameControls.timer.config, timer);
  assert.equal(gameControls.timer.startEnabled, false);
  dispatch({ type: "showTimerProgress", config: timer });
  assert.notEqual(store.getSnapshot().presentation.gameControls, gameControls);
});

test("waiting and historical policy retain explicit confirmation and local live reaction state", () => {
  const store = createGameControlsStore(config);
  store.updatePresentation({
    endMatchVisible: true,
    endMatchConfirmed: true,
    voiceReactionVisible: true,
  });
  const applyPolicy = (context) => {
    const controls = deriveBoardViewControls({
      mode: "activeLive",
      isOnlineGame: false,
      isWatchOnly: false,
      isGameWithBot: false,
      isGameOver: false,
      isWaitingForRematchResponse: false,
      isSeriesEnded: false,
      ...context,
    });
    store.updatePresentation(
      Object.fromEntries(
        ["endMatchVisible", "endMatchConfirmed", "voiceReactionVisible"]
          .map((key) => [key, controls[key]])
          .filter(([, value]) => value !== null),
      ),
    );
  };
  applyPolicy({});
  assert.equal(store.getSnapshot().presentation.voiceReactionVisible, true);
  assert.equal(store.getSnapshot().presentation.endMatchConfirmed, true);
  applyPolicy({ mode: "waitingLive", isOnlineGame: true });
  applyPolicy({ mode: "historicalView", isOnlineGame: true });
  assert.equal(store.getSnapshot().presentation.endMatchVisible, false);
  assert.equal(store.getSnapshot().presentation.endMatchConfirmed, true);
  applyPolicy({});
  assert.equal(store.getSnapshot().presentation.endMatchVisible, false);
  assert.equal(store.getSnapshot().presentation.endMatchConfirmed, true);
  assert.equal(store.getSnapshot().presentation.voiceReactionVisible, true);
  for (const key of [
    "hideGameControls",
    "automoveVisible",
    "undoVisible",
    "undoEnabled",
    "hideTimers",
  ]) {
    assert.equal(Object.hasOwn(store.getSnapshot().presentation, key), false);
  }
});

test("view selectors use published role, completion, series and puzzle facts", () => {
  const store = createGameControlsStore(config);
  store.updateContext({ isOnlineGame: true });
  assert.equal(
    deriveGameControlsView(store.getSnapshot()).canWagerInCurrentGame,
    true,
  );
  store.updateContext({
    isWatchOnly: true,
    isGameOver: true,
    isSeriesEnded: true,
  });
  let view = deriveGameControlsView(store.getSnapshot());
  assert.equal(view.canWagerInCurrentGame, false);
  assert.equal(view.isWatchOnlyMatchFinished, true);
  store.dispatchGameControls({
    type: "setPrimaryAction",
    action: "rematch",
  });
  store.updateContext({ puzzleMode: true, selectedPuzzleId: "lesson" });
  view = deriveGameControlsView(store.getSnapshot());
  assert.equal(view.primaryActionText, "Next Lesson");
});

test("explicit presentation reset keeps the current context and caller's timer timestamp", () => {
  const store = createGameControlsStore(config);
  store.updateContext({ isOnlineGame: true, sessionId: 7 });
  store.updatePresentation({ endMatchConfirmed: true, waitingText: "waiting" });
  const context = store.getSnapshot().context;
  const resetConfig = { ...config, requestDate: 9000 };
  store.resetPresentation(resetConfig);
  assert.equal(store.getSnapshot().context, context);
  assert.equal(store.getSnapshot().presentation.endMatchConfirmed, false);
  assert.equal(store.getSnapshot().presentation.waitingText, "");
  assert.deepEqual(
    store.getSnapshot().presentation.gameControls.timer.config,
    resetConfig,
  );
});
