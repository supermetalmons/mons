import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import ts from "typescript";
import { createMatchTimerHarness } from "./fixtures/matchTimerHarness.mjs";
import { createRematchViewingHarness } from "./fixtures/rematchViewingHarness.mjs";

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
const { createSessionControlsPresenter } =
  await import("../src/game/sessionControls.ts");
const { createRemoteMoveSyncController } =
  await import("../src/game/remoteMoveSyncController.ts");

const source = ts.createSourceFile(
  "gameController.ts",
  readFileSync(
    new URL("../src/game/gameController.ts", import.meta.url),
    "utf8",
  ),
  ts.ScriptTarget.Latest,
  true,
);
const declarations = [
  "publishGameControlsContext",
  "go",
  "disposeGameSession",
  "cancelSessionPreload",
  "resetSessionBoardState",
  "resetSessionFlags",
  "resetSessionState",
  "resetBotScoreReactionState",
  "nextBoardRenderSession",
  "resetOnlineReconnectRequestState",
  "setWatchOnlyState",
  "isCreateInviteRoute",
  "isSnapshotRoute",
  "isBotsRoute",
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

const home = { mode: "home", path: "", autojoin: false };
const invite = (inviteId = "next", autojoin = false) => ({
  mode: "invite",
  path: inviteId,
  inviteId,
  autojoin,
});

function harness({
  pendingAutomatch = false,
  route = home,
  waiting = false,
  snapshotValid = true,
} = {}) {
  const events = [];
  const ui = {};
  const subscriptions = new Set();
  const pendingTimeouts = new Set([1, 2]);
  let api;
  let wagerMatch = "old";
  let wagerSnapshot = { agreed: "old" };
  const contexts = [];
  const initial = {
    activeRouteState: route,
    initialWagersMatchId: "old",
    cancelRematchScoresPreload: () =>
      events.push(["preload-cancel", api.state().initialWagersMatchId]),
    isOnlineGame: true,
    isGameWithBot: true,
    isWaitingForRematchResponse: true,
    pendingRematchNavigationToLiveBoard: true,
    puzzleMode: true,
    selectedProblem: "old-problem",
    didStartLocalGame: true,
    isGameOver: true,
    isReconnect: true,
    didConnect: true,
    isWaitingForInviteToGetAccepted: true,
    pendingAutomatchTransition: pendingAutomatch,
    isInviteBotIntoLocalGameUnavailable: true,
    didMakeFirstLocalPlayerMoveOnLocalBoard: true,
    isWatchOnly: true,
    watchOnlyListeners: new Set(),
    boardViewMode: "historicalView",
    boardRenderSessionId: 4,
    moveHistoryFlipOverrideEnabled: true,
    moveHistoryFlipOverrideSessionId: 4,
    moveHistoryFlipOverrideBaseBoardFlipped: true,
    botScoreReactionPlayedTurns: new Set([1]),
    pendingOnlineReconnectInviteId: "old",
    lastOnlineReconnectRequestedAtMs: 123,
    flashbackMode: true,
    resignedColor: "white",
    winnerByTimerColor: "black",
    currentInputs: ["old-selection"],
    wagerOutcomeAnimTimer: 2,
    didSetupWagerSubscription: false,
    unsubscribeFromWagerState: null,
    currentWagerState: wagerSnapshot,
    wagerOutcomeShown: true,
    wagerOutcomeAnimating: true,
    wagerOutcomeAnimationAllowed: true,
    wagerMatchId: "old",
    lastObservedMatchSideFallbackWarningKey: "old",
    lastReactionTime: 123,
    lastBotMoveTimestamp: 123,
    consecutiveWatchAutomoveWorkerFailures: 3,
    processedVoiceReactions: new Set(["old"]),
    playerSideColor: "black",
    currentGameVariant: "old",
    isMoveHistoryPopupOpen: true,
    game: {
      contentPositions: () => [],
      winner: undefined,
      scores: { white: 0, black: 0 },
    },
  };
  const controlsStore = createGameControlsStore({
    duration: 60,
    progress: 15,
    requestDate: 1000,
  });
  controlsStore.updateContext({
    ...Object.fromEntries(
      Object.keys(controlsStore.getSnapshot().context)
        .filter((key) => Object.hasOwn(initial, key))
        .map((key) => [key, initial[key]]),
    ),
    sessionId: 1,
  });
  const observedSnapshots = [];
  const observerSnapshots = [];
  controlsStore.subscribe(() =>
    observedSnapshots.push(controlsStore.getSnapshot()),
  );
  const remoteMoveSync = createRemoteMoveSyncController({
    getGame: () => api?.state().game ?? initial.game,
    getActiveMatchId: () => "old",
    createSessionGuard: () => () => true,
    isGameOver: () => api?.state().isGameOver ?? initial.isGameOver,
    onReplayOutput: () => assert.fail("unexpected replay during reset"),
  });
  remoteMoveSync.setProcessedCounts(5, 4);
  remoteMoveSync.remember(
    { color: "white", flatMovesString: Array(6).fill("old").join("-") },
    "old",
  );
  remoteMoveSync.verifyHistory(
    { historyVerified: false },
    "old",
    "old-white",
    "white",
  );
  const rematchViewing = createRematchViewingHarness({
    selection: { matchId: "old", pair: {}, game: {} },
  });
  const timerHarness = createMatchTimerHarness({ activeMatchId: null }, () => {
    const state = api?.state() ?? initial;
    return {
      isOnlineGame: state.isOnlineGame,
      isReconnect: state.isReconnect,
      isWatchOnly: state.isWatchOnly,
      boardViewMode: state.boardViewMode,
      isGameOver: state.isGameOver,
    };
  });
  timerHarness.controller.setStash("old", "white", "old-white");
  timerHarness.controller.setStash("old", "black", "old-black");
  timerHarness.controller.startCooldown("old");
  const capture = (name) => {
    observerSnapshots.push({
      name,
      snapshot: controlsStore.getSnapshot(),
      notifications: observedSnapshots.length,
    });
    events.push([
      name,
      {
        watchOnly: api.state().isWatchOnly,
        flashback: api.state().flashbackMode,
        inputs: [...api.state().currentInputs],
        timer: timerHarness.controller.getMatchId(),
        wager: api.state().currentWagerState,
        selectedProblem: api.state().selectedProblem,
        waiting: api.state().isWaitingForInviteToGetAccepted,
      },
    ]);
  };
  initial.watchOnlyListeners.add(() => capture("watcher"));
  const noop = () => {};
  const setterNames = [
    "setIslandButtonDimmed",
    "setHomeVisible",
    "setBrushAndNavigationButtonDimmed",
    "setNavigationListButtonVisible",
    "setAutomatchWaitingState",
    "setInviteLinkActionVisible",
    "setAutomatchVisible",
    "setBotGameOptionVisible",
    "setPlaySamePuzzleAgainButtonVisible",
    "setAutomatchEnabled",
    "setUndoVisible",
    "setAutomoveActionVisible",
    "setAutomoveActionEnabled",
    "setUndoEnabled",
    "setWatchOnlyVisible",
    "showVoiceReactionButton",
    "showMoveHistoryButton",
    "setEndMatchVisible",
    "setEndMatchConfirmed",
    "showWaitingStateText",
    "showPrimaryAction",
    "setDisplayedBoardSquareTypes",
  ];
  const boardMethods = [
    "setBoardMetadataDisplaySwapped",
    "resetPlayersMetadataForSession",
    "resetLocalHumanSeriesOpponentAvatar",
    "setBoardFlipped",
    "setBotStrengthControlVisible",
    "setBotStrengthControlMode",
    "setupGameInfoElements",
    "hideTimerCountdownDigits",
    "hideAllMoveStatuses",
    "setInviteBotButtonVisible",
    "removeHighlights",
    "hideItemSelectionOrConfirmationOverlay",
    "updateScore",
    "showRandomEmojisForLoopMode",
  ];
  const dependencies = {
    remoteMoveSync,
    rematchViewing,
    matchTimers: timerHarness.controller,
    getCurrentSessionId: () => 1,
    isGameConnectionBound: () => false,
    batchGameControlsUpdates: controlsStore.batchUpdates,
    updateGameControlsContext: (context) => {
      controlsStore.updateContext(context);
      contexts.push(context);
      events.push(["context", context]);
    },
    initial,
    MonsRules: { Color: { White: "white", Black: "black" } },
    INVALID_SNAPSHOT_ROUTE_ERROR: "invalid-snapshot-route",
    PrimaryActionType: { None: "none" },
    legacyDefaultGameVariant: "Classic",
    botAutomoveMode: "normal",
    getCurrentRouteState: () => route,
    clearManagedGameTimeouts: () => {
      events.push(["timeouts-clear"]);
      pendingTimeouts.clear();
    },
    clearManagedGameTimeout: (id) => pendingTimeouts.delete(id),
    setCurrentWagerMatch: (matchId) => {
      events.push(["wager-match", matchId]);
      if (wagerMatch === matchId) return;
      wagerMatch = matchId;
      wagerSnapshot = null;
      subscriptions.forEach((listener) => listener(wagerSnapshot));
    },
    subscribeToWagerState: (listener) => {
      events.push(["subscribe"]);
      subscriptions.add(listener);
      listener(wagerSnapshot);
      return () => {
        events.push(["unsubscribe"]);
        subscriptions.delete(listener);
      };
    },
    applyWagerState: () => capture("wager-notify"),
    summarizeWagerState: (state) => state,
    logWagerDebug: noop,
    shouldDeferWagerStateForUninstalledMatch: () => false,
    syncWagerOutcome: noop,
    connection: {
      setWagerViewMatchId: (id) => {
        events.push(["wager-view", id]);
        subscriptions.forEach((listener) => listener(wagerSnapshot));
      },
      setupConnection: (reconnect, target) =>
        events.push(["setup-connection", reconnect, target]),
      hasPendingInviteCreationFor: (id) => id === "next",
    },
    Board: {
      ...Object.fromEntries(
        boardMethods.map((name) => [
          name,
          (...args) => {
            ui[name] = args[0];
            events.push(["board", name, ...args]);
          },
        ]),
      ),
      setupBoard: () => events.push(["setup-board", ui.preserveAnimation]),
      hasMonsBoardDisplayAnimationRunning: () => waiting,
      setPreserveDisplayAnimation: (value) => {
        ui.preserveAnimation = value;
        events.push(["preserve-animation", value]);
      },
      stopMonsBoardAsDisplayAnimations: () => {
        events.push(["stop-animation"]);
        if (!ui.preserveAnimation) waiting = false;
      },
      runMonsBoardAsDisplayWaitingAnimation: () => {
        waiting = true;
        events.push(["waiting-animation"]);
      },
    },
    ...Object.fromEntries(
      setterNames.map((name) => [
        name,
        (...args) => {
          ui[name] = args[0];
          events.push(["control", name, ...args]);
        },
      ]),
    ),
    triggerMoveHistoryPopupReload: () => events.push(["reload-history"]),
    buildInitialRouteGameSeed: () => ({}),
    applyGameSeedToCurrentGame: () => events.push(["apply-seed"]),
    loadCurrentGameFromFen: (fen) => {
      events.push(["load-snapshot", fen]);
      return snapshotValid;
    },
    scheduleWatchAutomove: () => events.push(["schedule-watch"]),
    updateBoardMoveStatuses: () => events.push(["update-move-statuses"]),
    ensureLocalRematchSeriesInitialized: noop,
    updateDisplayedBoardSquareTypes: () =>
      events.push(["display-square-types"]),
    syncInviteBotIntoLocalGameButton: noop,
    markMainGameContentReady: (interactive) =>
      events.push(["content-ready", interactive]),
    hideTimerButtons: () => events.push(["control", "hideTimerButtons"]),
    disableAndHideUndoResignAndTimerControls: () =>
      events.push(["control", "disableAndHideUndoResignAndTimerControls"]),
    createLegacyBoardSquareTypeGrid: () => "legacy-grid",
  };
  for (const [name, key] of Object.entries({
    setHomeVisible: "homeVisible",
    setNavigationListButtonVisible: "navigationVisible",
    setBotGameOptionVisible: "botGameVisible",
    setPlaySamePuzzleAgainButtonVisible: "replayPuzzleVisible",
    setWatchOnlyVisible: "watchOnlyVisible",
    showVoiceReactionButton: "voiceReactionVisible",
    showMoveHistoryButton: "moveHistoryVisible",
    setEndMatchVisible: "endMatchVisible",
    setEndMatchConfirmed: "endMatchConfirmed",
    showWaitingStateText: "waitingText",
  })) {
    const command = dependencies[name];
    dependencies[name] = (value) => {
      controlsStore.updatePresentation({ [key]: value });
      command(value);
    };
  }
  for (const [name, action] of Object.entries({
    setUndoVisible: (visible) => ({ type: "setUndoVisible", visible }),
    setUndoEnabled: (enabled) => ({ type: "setUndoEnabled", enabled }),
    setAutomoveActionVisible: (visible) => ({
      type: "setAutomoveVisible",
      visible,
    }),
    setAutomoveActionEnabled: (enabled) => ({
      type: "setAutomoveEnabled",
      enabled,
    }),
    showPrimaryAction: (action) => ({ type: "setPrimaryAction", action }),
    hideTimerButtons: () => ({ type: "hideTimers" }),
    disableAndHideUndoResignAndTimerControls: () => ({
      type: "hideGameControls",
    }),
  })) {
    const command = dependencies[name];
    dependencies[name] = (...args) => {
      controlsStore.dispatchGameControls(action(...args));
      command(...args);
    };
  }
  for (const [name, presentation] of Object.entries({
    setBrushAndNavigationButtonDimmed: (dimmed) => ({
      navigationDimmed: dimmed,
      appearanceDimmed: dimmed,
    }),
    setInviteLinkActionVisible: (visible) => ({
      inviteLinkVisible: visible,
      ...(!visible ? { inviteReadyToCopy: false } : {}),
    }),
  })) {
    const command = dependencies[name];
    dependencies[name] = (value) => {
      controlsStore.updatePresentation(presentation(value));
      command(value);
    };
  }
  Object.assign(dependencies, createSessionControlsPresenter(dependencies));
  const keys = Object.keys(initial);
  const { outputText } = ts.transpileModule(
    `
    ${keys.map((key) => `let ${key} = initial.${key};`).join("\n")}
    ${declarations.join("\n")}
    return {
      go, disposeGameSession,
      state: () => ({ ${keys.join(",")}, selection: rematchViewing.getSelection() }),
      setState: (values) => { ${keys.map((key) => `if (Object.hasOwn(values, "${key}")) ${key} = values.${key};`).join("\n")} }
    };
  `,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  );
  api = new Function(...Object.keys(dependencies), outputText)(
    ...Object.values(dependencies),
  );
  return {
    ...api,
    remoteMoveSync,
    controlsStore,
    observedSnapshots,
    observerSnapshots,
    contexts,
    events,
    ui,
    subscriptions,
    pendingTimeouts,
    timerHarness,
    publishWager: (state) => {
      wagerMatch = "old";
      wagerSnapshot = state;
      subscriptions.forEach((listener) => listener(state));
    },
  };
}

for (const action of ["go", "disposeGameSession"]) {
  test(`${action} clears the dirty session baseline and cancels old work`, async () => {
    const h = harness();
    await h[action](home);
    const state = h.state();
    assert.deepEqual(h.observedSnapshots, [h.controlsStore.getSnapshot()]);
    assert.deepEqual(h.contexts.at(-1), {
      sessionId: 1,
      isOnlineGame: false,
      isWatchOnly: false,
      isGameWithBot: false,
      puzzleMode: false,
      isGameOver: false,
      boardViewMode: "activeLive",
      isSeriesEnded: false,
      selectedPuzzleId: null,
    });
    assert.deepEqual(h.events.slice(0, 2), [
      ["preload-cancel", null],
      ["timeouts-clear"],
    ]);
    assert.equal(h.pendingTimeouts.size, 0);
    for (const flag of [
      "isOnlineGame",
      "isGameWithBot",
      "isWaitingForRematchResponse",
      "pendingRematchNavigationToLiveBoard",
      "puzzleMode",
      "didStartLocalGame",
      "isGameOver",
      "isReconnect",
      "didConnect",
      "isWatchOnly",
      "flashbackMode",
    ]) {
      assert.equal(state[flag], false, flag);
    }
    assert.equal(state.boardViewMode, "activeLive");
    assert.equal(state.boardRenderSessionId, 5);
    assert.equal(state.selection, null);
    assert.equal(state.moveHistoryFlipOverrideEnabled, false);
    assert.equal(state.botScoreReactionPlayedTurns.size, 0);
    assert.equal(state.pendingOnlineReconnectInviteId, null);
    assert.deepEqual(state.currentInputs, []);
    assert.equal(state.resignedColor, undefined);
    assert.equal(state.winnerByTimerColor, undefined);
    assert.equal(h.timerHarness.controller.getMatchId(), null);
    assert.equal(h.timerHarness.controller.restore(), false);
    assert.equal(state.cancelRematchScoresPreload, null);
    assert.equal(h.ui.setBoardFlipped, false);
    assert.equal(state.selectedProblem, action === "go" ? "old-problem" : null);
  });
}

test("wager subscriptions survive repeated startup and are replaced once after disposal", async () => {
  const h = harness();
  await h.go(home);
  await h.go(home);
  assert.equal(h.subscriptions.size, 1);
  assert.equal(h.events.filter(([name]) => name === "subscribe").length, 1);
  h.disposeGameSession(home);
  h.disposeGameSession(home);
  assert.equal(h.subscriptions.size, 0);
  assert.equal(h.events.filter(([name]) => name === "unsubscribe").length, 1);
  assert.equal(
    h.events.filter(([name]) => name === "preload-cancel").length,
    1,
  );
  assert.equal(h.pendingTimeouts.size, 0);
  assert.equal(h.remoteMoveSync.hasPendingMoves(), false);
  assert.equal(h.remoteMoveSync.getProcessedCount("white"), 0);
  assert.equal(h.remoteMoveSync.getProcessedCount("black"), 0);
  assert.equal(h.remoteMoveSync.hasInitializedBothSides(), false);
  assert.equal(h.state().processedVoiceReactions.size, 0);
  h.remoteMoveSync.verifyHistory(
    {
      historyVerified: false,
      verifyHistory: () => assert.fail("disposed history was retained"),
    },
    "old",
    "new-black",
    "black",
  );
  await h.go(home);
  assert.equal(h.subscriptions.size, 1);
  assert.equal(h.events.filter(([name]) => name === "subscribe").length, 2);
});

test("startup retains move progress until the disposal lifecycle resets it", async () => {
  const h = harness();
  await h.go(home);
  assert.equal(h.remoteMoveSync.getProcessedCount("white"), 5);
  assert.equal(h.remoteMoveSync.getProcessedCount("black"), 4);
  assert.equal(h.remoteMoveSync.hasInitializedBothSides(), true);
  const histories = [];
  h.remoteMoveSync.verifyHistory(
    {
      historyVerified: false,
      verifyHistory: (value) => {
        histories.push(value);
        return false;
      },
    },
    "old",
    "new-black",
    "black",
  );
  assert.deepEqual(histories, [
    { white: ["old", "white"], black: ["new", "black"] },
  ]);
  h.disposeGameSession(home);
  await h.go(home);
  assert.equal(h.remoteMoveSync.getProcessedCount("white"), 0);
  assert.equal(h.remoteMoveSync.getProcessedCount("black"), 0);
  assert.equal(h.remoteMoveSync.hasInitializedBothSides(), false);
});

for (const [action, pendingAutomatch] of [
  ["go", false],
  ["go", true],
  ["disposeGameSession", false],
  ["disposeGameSession", true],
]) {
  test(`${action} preserves synchronous wager and watch-only notification ordering with pending automatch ${pendingAutomatch}`, async () => {
    const h = harness();
    await h.go(home);
    const wager = { agreed: "old" };
    h.publishWager(wager);
    h.timerHarness.controller.setStash("old", "white", "old-white");
    h.setState({
      pendingAutomatchTransition: pendingAutomatch,
      isWatchOnly: true,
      flashbackMode: true,
      currentInputs: ["old-selection"],
      selectedProblem: "old-problem",
    });
    h.controlsStore.updateContext({ isWatchOnly: true });
    h.observedSnapshots.length = 0;
    h.observerSnapshots.length = 0;
    h.events.length = 0;
    await h[action](home);
    assert.deepEqual(h.observedSnapshots, [h.controlsStore.getSnapshot()]);
    assert.ok(
      h.observerSnapshots.every(({ notifications }) => notifications === 0),
    );
    assert.deepEqual(
      h.observerSnapshots.map(({ name, snapshot }) => [
        name,
        snapshot.context.isWatchOnly,
      ]),
      action === "go"
        ? [
            ["wager-notify", true],
            ["wager-notify", true],
            ["watcher", false],
          ]
        : [["watcher", false]],
    );
    const meaningful = h.events.filter(([name]) =>
      [
        "unsubscribe",
        "wager-match",
        "wager-view",
        "wager-notify",
        "watcher",
      ].includes(name),
    );
    if (action === "go") {
      assert.deepEqual(meaningful, [
        ["wager-match", null],
        [
          "wager-notify",
          {
            watchOnly: true,
            flashback: false,
            inputs: [],
            timer: "old",
            wager: null,
            selectedProblem: "old-problem",
            waiting: false,
          },
        ],
        ["wager-view", null],
        [
          "wager-notify",
          {
            watchOnly: true,
            flashback: false,
            inputs: [],
            timer: "old",
            wager: null,
            selectedProblem: "old-problem",
            waiting: false,
          },
        ],
        [
          "watcher",
          {
            watchOnly: false,
            flashback: false,
            inputs: [],
            timer: "old",
            wager: null,
            selectedProblem: "old-problem",
            waiting: false,
          },
        ],
      ]);
    } else {
      assert.deepEqual(meaningful, [
        ["unsubscribe"],
        [
          "watcher",
          {
            watchOnly: false,
            flashback: true,
            inputs: ["old-selection"],
            timer: "old",
            wager,
            selectedProblem: null,
            waiting: pendingAutomatch,
          },
        ],
        ["wager-match", null],
        ["wager-view", null],
      ]);
    }
  });
}

test("automatch waiting survives disposal and is consumed by startup once", async () => {
  const h = harness({ pendingAutomatch: true });
  h.disposeGameSession(invite());
  assert.equal(h.state().pendingAutomatchTransition, true);
  assert.equal(h.state().isWaitingForInviteToGetAccepted, true);
  assert.equal(h.ui.preserveAnimation, true);
  assert.equal(h.ui.setHomeVisible, true);
  assert.equal(h.ui.setIslandButtonDimmed, true);
  assert.equal(Object.hasOwn(h.ui, "setAutomatchWaitingState"), false);
  assert.equal(Object.hasOwn(h.ui, "setAutomatchVisible"), false);
  await h.go(invite());
  assert.deepEqual(
    h.events.find(([name]) => name === "setup-board"),
    ["setup-board", true],
  );
  assert.equal(h.ui.preserveAnimation, false);
  assert.equal(h.state().pendingAutomatchTransition, false);
  assert.equal(h.state().isWaitingForInviteToGetAccepted, true);
  assert.equal(h.ui.setAutomatchWaitingState, true);
  const animationStarts = h.events.filter(
    ([name]) => name === "waiting-animation",
  ).length;
  assert.ok(animationStarts > 0);
  h.disposeGameSession(home);
  assert.equal(h.ui.setAutomatchWaitingState, false);
  await h.go(home);
  assert.equal(h.state().isWaitingForInviteToGetAccepted, false);
  assert.equal(
    h.events.filter(([name]) => name === "waiting-animation").length,
    animationStarts,
  );
});

test("manual invite animation is preserved only for a matching pending creation from the lobby", async () => {
  const cases = [
    { route: home, waiting: true, next: invite(), preserve: true },
    { route: home, waiting: true, next: invite("next", true), preserve: false },
    { route: home, waiting: true, next: invite("other"), preserve: false },
    { route: home, waiting: false, next: invite(), preserve: false },
    { route: invite("old"), waiting: true, next: invite(), preserve: false },
    { route: home, waiting: true, next: home, preserve: false },
    { route: home, waiting: true, next: undefined, preserve: false },
  ];
  for (const scenario of cases) {
    const h = harness(scenario);
    h.disposeGameSession(scenario.next);
    assert.equal(
      h.ui.preserveAnimation,
      scenario.preserve,
      JSON.stringify(scenario),
    );
    assert.equal(h.state().isWaitingForInviteToGetAccepted, false);
    assert.equal(h.ui.setAutomatchWaitingState, false);
    assert.equal(
      Object.hasOwn(h.ui, "setDisplayedBoardSquareTypes"),
      !scenario.preserve,
    );
    if (scenario.preserve) {
      await h.go(scenario.next);
      assert.deepEqual(
        h.events.find(([name]) => name === "setup-board"),
        ["setup-board", true],
      );
      assert.equal(h.ui.preserveAnimation, false);
    }
  }
});

const controlCalls = (events) =>
  events.filter(([name]) => name === "control").map(([, ...call]) => call);

const lobbyControls = [
  ["setInviteLinkActionVisible", true],
  ["setAutomatchVisible", true],
  ["setBotGameOptionVisible", true],
  ["setNavigationListButtonVisible", true],
];
const inviteControls = [
  ["setHomeVisible", true],
  ["setIslandButtonDimmed", true],
  ["setBrushAndNavigationButtonDimmed", true],
  ["setNavigationListButtonVisible", false],
];
const automatchControls = [
  ...inviteControls,
  ["setAutomatchWaitingState", true],
];
const routeCases = [
  { name: "home", route: home, controls: lobbyControls, local: true },
  {
    name: "event",
    route: { mode: "event", path: "event/party", eventId: "party" },
    controls: lobbyControls,
    local: true,
  },
  {
    name: "watch",
    route: { mode: "watch", path: "watch" },
    controls: [
      ["setHomeVisible", true],
      ["setIslandButtonDimmed", true],
      ["setBrushAndNavigationButtonDimmed", true],
      ["setInviteLinkActionVisible", false],
      ["setAutomatchVisible", false],
      ["setBotGameOptionVisible", false],
      ["setNavigationListButtonVisible", false],
    ],
    local: true,
  },
  {
    name: "snapshot",
    route: { mode: "snapshot", path: "snapshot/saved", snapshotId: "saved" },
    controls: [
      ["setHomeVisible", true],
      ["setIslandButtonDimmed", true],
      ["setBrushAndNavigationButtonDimmed", true],
      ["setUndoVisible", true],
      ["setInviteLinkActionVisible", false],
      ["setAutomatchVisible", false],
      ["setBotGameOptionVisible", false],
      ["setNavigationListButtonVisible", false],
      ["setAutomoveActionVisible", true],
      ["showMoveHistoryButton", true],
    ],
    local: true,
  },
  { name: "invite", route: invite(), controls: inviteControls, local: false },
];

for (const scenario of routeCases) {
  test(`${scenario.name} startup preserves ordered controls and unrelated dirty presentation on repeated calls`, async () => {
    const h = harness({ route: scenario.route });
    for (let iteration = 0; iteration < 2; iteration += 1) {
      h.events.length = 0;
      Object.assign(h.ui, {
        setEndMatchVisible: true,
        setEndMatchConfirmed: true,
        setAutomoveActionEnabled: false,
        setUndoEnabled: true,
        setAutomatchEnabled: false,
        showWaitingStateText: "retained",
        showPrimaryAction: "rematch",
      });
      h.controlsStore.updatePresentation({
        endMatchVisible: true,
        endMatchConfirmed: true,
        waitingText: "retained",
      });
      h.controlsStore.dispatchGameControls({
        type: "setAutomoveEnabled",
        enabled: false,
      });
      h.controlsStore.dispatchGameControls({
        type: "setUndoEnabled",
        enabled: true,
      });
      h.controlsStore.dispatchGameControls({
        type: "setPrimaryAction",
        action: "rematch",
      });
      h.observedSnapshots.length = 0;
      const before = h.controlsStore.getSnapshot();
      await h.go(scenario.route);
      const after = h.controlsStore.getSnapshot();
      assert.deepEqual(h.observedSnapshots, after === before ? [] : [after]);
      assert.deepEqual(after.context, h.contexts.at(-1));
      assert.equal(after.presentation.endMatchVisible, true);
      assert.equal(after.presentation.endMatchConfirmed, true);
      assert.equal(after.presentation.waitingText, "retained");
      assert.equal(after.presentation.gameControls.automove.enabled, false);
      assert.equal(after.presentation.gameControls.undo.enabled, true);
      assert.equal(after.presentation.gameControls.primaryAction, "rematch");
      assert.equal(
        after.presentation.gameControls.timer.config,
        before.presentation.gameControls.timer.config,
      );
      assert.deepEqual(controlCalls(h.events), [
        ["setIslandButtonDimmed", false],
        ...scenario.controls,
      ]);
      assert.equal(h.ui.setEndMatchVisible, true);
      assert.equal(h.ui.setEndMatchConfirmed, true);
      assert.equal(h.ui.setAutomoveActionEnabled, false);
      assert.equal(h.ui.setUndoEnabled, true);
      assert.equal(h.ui.setAutomatchEnabled, false);
      assert.equal(h.ui.showWaitingStateText, "retained");
      assert.equal(h.ui.showPrimaryAction, "rematch");
      const setup = h.events.findIndex(([name]) => name === "setup-connection");
      const firstControl = h.events.findIndex(
        ([name], index) => index > setup && name === "control",
      );
      const lastControl = h.events.findLastIndex(
        ([name]) => name === "control",
      );
      const info = h.events.findIndex(
        ([name, method]) =>
          name === "board" && method === "setupGameInfoElements",
      );
      assert.ok(setup < firstControl);
      assert.ok(lastControl < info);
      if (scenario.local) {
        const squares = h.events.findIndex(
          ([name]) => name === "display-square-types",
        );
        assert.ok(setup < squares && squares < firstControl);
      } else {
        const squares = h.events.findIndex(
          ([name]) => name === "display-square-types",
        );
        assert.ok(lastControl < squares && squares < info);
      }
      if (scenario.name === "watch") {
        const watchNotification = h.events.findLastIndex(
          ([name]) => name === "watcher",
        );
        const schedule = h.events.findIndex(
          ([name]) => name === "schedule-watch",
        );
        assert.ok(
          lastControl < watchNotification && watchNotification < schedule,
        );
        assert.equal(h.state().isWatchOnly, true);
      }
      if (scenario.name === "snapshot") {
        const load = h.events.findIndex(([name]) => name === "load-snapshot");
        assert.ok(setup < load && load < firstControl);
      }
    }
  });
}

test("invalid snapshot startup throws before route controls and board completion", async () => {
  const route = { mode: "snapshot", path: "snapshot/bad", snapshotId: "bad" };
  const h = harness({ route, snapshotValid: false });
  await assert.rejects(h.go(route), /invalid-snapshot-route/);
  assert.deepEqual(h.observedSnapshots, [h.controlsStore.getSnapshot()]);
  assert.deepEqual(controlCalls(h.events), [["setIslandButtonDimmed", false]]);
  assert.deepEqual(h.events.at(-1), ["load-snapshot", "bad"]);
  assert.equal(
    h.events.some(
      ([name, method]) =>
        name === "board" && method === "setupGameInfoElements",
    ),
    false,
  );
  assert.equal(
    h.events.some(([name]) => name === "content-ready"),
    false,
  );
  h.observedSnapshots.length = 0;
  await h.go(home);
  assert.deepEqual(h.observedSnapshots, [h.controlsStore.getSnapshot()]);
  assert.equal(
    h.controlsStore.getSnapshot().presentation.inviteLinkVisible,
    true,
  );
});

test("automatch invite startup retains both waiting commands and their animation boundaries", async () => {
  const h = harness({ route: invite(), pendingAutomatch: true });
  await h.go(invite());
  assert.deepEqual(controlCalls(h.events), [
    ["setIslandButtonDimmed", false],
    ...automatchControls,
    ...inviteControls,
    ["setAutomatchWaitingState", true],
  ]);
  const connection = h.events.findIndex(
    ([name]) => name === "setup-connection",
  );
  const controlsAndAnimations = h.events
    .slice(connection + 1)
    .filter(([name]) => name === "control" || name === "waiting-animation");
  assert.deepEqual(controlsAndAnimations, [
    ...automatchControls.map((call) => ["control", ...call]),
    ["waiting-animation"],
    ...inviteControls.map((call) => ["control", ...call]),
    ["control", "setAutomatchWaitingState", true],
    ["waiting-animation"],
  ]);
  const contexts = h.events
    .slice(connection + 1)
    .filter(([name]) => name === "context");
  assert.equal(contexts.length, 2);
  assert.ok(contexts.every(([, context]) => context.isOnlineGame));
  assert.equal(h.state().pendingAutomatchTransition, false);
  h.events.length = 0;
  await h.go(invite());
  assert.deepEqual(controlCalls(h.events), [
    ["setIslandButtonDimmed", false],
    ...inviteControls,
  ]);
  assert.equal(
    h.events.some(([name]) => name === "waiting-animation"),
    false,
  );
});

for (const preserve of [false, true]) {
  test(`disposal preserves command order and cleanup boundaries with automatch preservation ${preserve}`, async () => {
    const h = harness({ pendingAutomatch: preserve });
    await h.go(home);
    for (let iteration = 0; iteration < 2; iteration += 1) {
      h.setState({ pendingAutomatchTransition: preserve, isWatchOnly: true });
      Object.assign(h.ui, {
        setAutomatchVisible: true,
        setAutomatchWaitingState: true,
        setAutomatchEnabled: false,
        setUndoVisible: true,
        setAutomoveActionVisible: true,
        setAutomoveActionEnabled: false,
        setUndoEnabled: true,
        setWatchOnlyVisible: true,
        showVoiceReactionButton: true,
        showMoveHistoryButton: true,
        setEndMatchVisible: true,
        setEndMatchConfirmed: true,
        showWaitingStateText: "old",
        showPrimaryAction: "rematch",
      });
      h.controlsStore.updateContext({ isWatchOnly: true });
      h.controlsStore.updatePresentation({
        watchOnlyVisible: true,
        voiceReactionVisible: true,
        moveHistoryVisible: true,
        endMatchVisible: true,
        endMatchConfirmed: true,
        waitingText: "old",
      });
      h.controlsStore.dispatchGameControls({
        type: "setUndoVisible",
        visible: true,
      });
      h.controlsStore.dispatchGameControls({
        type: "setUndoEnabled",
        enabled: true,
      });
      h.controlsStore.dispatchGameControls({
        type: "setAutomoveVisible",
        visible: true,
      });
      h.controlsStore.dispatchGameControls({
        type: "setAutomoveEnabled",
        enabled: false,
      });
      h.controlsStore.dispatchGameControls({
        type: "setPrimaryAction",
        action: "rematch",
      });
      h.observedSnapshots.length = 0;
      h.events.length = 0;
      h.disposeGameSession(invite());
      assert.deepEqual(h.observedSnapshots, [h.controlsStore.getSnapshot()]);
      const { presentation } = h.controlsStore.getSnapshot();
      assert.equal(presentation.watchOnlyVisible, false);
      assert.equal(presentation.voiceReactionVisible, false);
      assert.equal(presentation.moveHistoryVisible, false);
      assert.equal(presentation.endMatchVisible, false);
      assert.equal(presentation.endMatchConfirmed, false);
      assert.equal(presentation.waitingText, "");
      assert.deepEqual(presentation.gameControls.undo, {
        visible: false,
        enabled: false,
      });
      assert.deepEqual(presentation.gameControls.automove, {
        visible: false,
        enabled: true,
      });
      assert.equal(presentation.gameControls.primaryAction, "none");
      assert.deepEqual(controlCalls(h.events), [
        ["setIslandButtonDimmed", preserve],
        ["setHomeVisible", preserve],
        ["setInviteLinkActionVisible", false],
        ...(!preserve ? [["setAutomatchVisible", false]] : []),
        ["setBotGameOptionVisible", false],
        ["setNavigationListButtonVisible", false],
        ["setPlaySamePuzzleAgainButtonVisible", false],
        ...(!preserve
          ? [
              ["setAutomatchWaitingState", false],
              ["setAutomatchEnabled", true],
            ]
          : []),
        ["setBrushAndNavigationButtonDimmed", preserve],
        ["setUndoVisible", false],
        ["setAutomoveActionVisible", false],
        ["setAutomoveActionEnabled", true],
        ["setUndoEnabled", false],
        ["setWatchOnlyVisible", false],
        ["showVoiceReactionButton", false],
        ["showMoveHistoryButton", false],
        ["hideTimerButtons"],
        ["disableAndHideUndoResignAndTimerControls"],
        ["setEndMatchVisible", false],
        ["setEndMatchConfirmed", false],
        ["showWaitingStateText", ""],
        ["showPrimaryAction", "none"],
        ...(!preserve ? [["setDisplayedBoardSquareTypes", null]] : []),
      ]);
      assert.equal(h.ui.setAutomatchVisible, preserve);
      assert.equal(h.ui.setAutomatchWaitingState, preserve);
      assert.equal(h.ui.setAutomatchEnabled, !preserve);
      const notifications = h.events.findLastIndex(
        ([name]) => name === "watcher" || name === "wager-view",
      );
      const controls = h.events.findIndex(
        ([name, method]) => name === "control" && method === "setHomeVisible",
      );
      const clearedPrimary = h.events.findIndex(
        ([name, method]) =>
          name === "control" && method === "showPrimaryAction",
      );
      const animation = h.events.findIndex(
        ([name]) => name === "preserve-animation",
      );
      const cleanup = h.events.findIndex(
        ([name, method]) =>
          name === "board" && method === "hideTimerCountdownDigits",
      );
      assert.ok(notifications < controls);
      assert.ok(clearedPrimary < animation && animation < cleanup);
      assert.deepEqual(h.events.at(-1), ["reload-history"]);
    }
  });
}
