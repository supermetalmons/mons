import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

const bottomControlsPort =
  await import("../src/ui/controls/bottomControlsPort.ts");
const {
  PrimaryActionType,
  bindBottomControlsApi,
  hasBottomPopupsVisible,
  hasNavigationPopupVisible,
  setAutomatchEnabled,
  setWagerPanelOutsideTapHandler,
  setWagerPanelVisibilityChecker,
  showPrimaryAction,
  unbindBottomControlsApi,
  isWagerPanelVisible,
  handleWagerPanelOutsideTap,
  resetWagerPanelApi,
} = bottomControlsPort;
const {
  dispatchGameControls,
  getGameControlsSnapshot,
  resetGameControlsPresentation,
  subscribeGameControls,
  updateGameControlsContext,
  updateGameControlsPresentation,
} = await import("../src/game/gameControlsStore.ts");
const {
  CANCEL_AUTOMATCH_REVEAL_DELAY_MS,
  NAVIGATION_PENDING_CANCEL_INTENT_TTL_MS,
  didOutsideTapDismissWindowPass,
  getCancelAutomatchRevealDeadlineMs,
  getOutsideTapDismissThresholdMs,
  getTimerEnableDelayMs,
  hasControlDeadlineElapsed,
  rewindOutsideTapDismissedAtForReset,
} = await import("../src/ui/controls/controlTiming.ts");
const {
  isMoveHistoryPopupFollowingLatest,
  setMoveHistoryPopupFollowingLatest,
  setMoveHistoryPopupState,
  subscribeMoveHistoryPopupReload,
  subscribeMoveHistoryPopupSelectionReset,
  triggerMoveHistoryPopupReload,
  triggerMoveHistoryPopupSelectionReset,
} = await import("../src/ui/controls/moveHistoryPopupStore.ts");
const {
  clearNavigationGamesRuntimeCacheScope,
  readNavigationGamesCacheSnapshot,
  resolveNavigationGamesCacheScope,
  writeNavigationGamesPersistedTopCache,
  writeNavigationGamesRuntimeCache,
} = await import("../src/services/navigationGamesCache.ts");

const timerConfig = { duration: 60, progress: 12, requestDate: 4000 };
const pureControlCommands = [
  {
    name: "showMoveHistoryButton",
    args: [true],
    presentation: { moveHistoryVisible: true },
  },
  {
    name: "showResignButton",
    gameControls: { resignVisible: true },
  },
  {
    name: "setBotGameOptionVisible",
    args: [true],
    presentation: { botGameVisible: true },
  },
  {
    name: "setPlaySamePuzzleAgainButtonVisible",
    args: [true],
    presentation: { replayPuzzleVisible: true },
  },
  {
    name: "setBrushAndNavigationButtonDimmed",
    args: [true],
    presentation: { navigationDimmed: true, appearanceDimmed: true },
  },
  {
    name: "showWaitingStateText",
    args: ["Waiting for opponent"],
    presentation: { waitingText: "Waiting for opponent" },
  },
  {
    name: "setHomeVisible",
    args: [true],
    presentation: { homeVisible: true },
  },
  {
    name: "setEndMatchVisible",
    args: [true],
    presentation: { endMatchVisible: true },
  },
  {
    name: "setEndMatchConfirmed",
    args: [true],
    presentation: { endMatchConfirmed: true },
  },
  {
    name: "setUndoVisible",
    args: [true],
    gameControls: { undo: { visible: true, enabled: false } },
  },
  {
    name: "setAutomoveActionEnabled",
    args: [false],
    gameControls: { automove: { visible: false, enabled: false } },
  },
  {
    name: "setAutomoveActionVisible",
    args: [true],
    gameControls: { automove: { visible: true, enabled: true } },
  },
  {
    name: "setWatchOnlyVisible",
    args: [true],
    presentation: { watchOnlyVisible: true },
  },
  {
    name: "setUndoEnabled",
    args: [true],
    gameControls: { undo: { visible: false, enabled: true } },
  },
  {
    name: "disableAndHideUndoResignAndTimerControls",
    prepare: () => {
      dispatchGameControls({ type: "showTimerProgress", config: timerConfig });
      dispatchGameControls({ type: "enableTimer" });
      dispatchGameControls({ type: "disableVictoryClaim" });
      dispatchGameControls({ type: "setUndoVisible", visible: true });
      dispatchGameControls({ type: "setUndoEnabled", enabled: true });
      dispatchGameControls({ type: "setAutomoveVisible", visible: true });
      dispatchGameControls({ type: "setAutomoveEnabled", enabled: false });
      dispatchGameControls({ type: "showResign" });
      dispatchGameControls({ type: "setPrimaryAction", action: "rematch" });
      dispatchGameControls({ type: "setConfirmation", confirmation: "timer" });
    },
    gameControls: {
      undo: { visible: false, enabled: false },
      automove: { visible: false, enabled: false },
      resignVisible: false,
      timer: {
        mode: "hidden",
        config: timerConfig,
        startEnabled: true,
        claimEnabled: false,
      },
      confirmation: "none",
    },
  },
  {
    name: "setIsReadyToCopyExistingInviteLink",
    presentation: { inviteReadyToCopy: true },
  },
  {
    name: "enableTimerVictoryClaim",
    gameControls: {
      timer: {
        mode: "claim",
        config: timerConfig,
        startEnabled: false,
        claimEnabled: true,
      },
    },
  },
  {
    name: "showPrimaryAction",
    args: [PrimaryActionType.Rematch],
    gameControls: { primaryAction: "rematch" },
  },
];

test("bottom controls port preserves current binding ownership for effects and presentation", () => {
  const events = [];
  resetGameControlsPresentation(timerConfig);
  const first = {
    setAutomatchEnabled: (enabled) => events.push(["first", enabled]),
  };
  const second = {
    setAutomatchEnabled: (enabled) => events.push(["second", enabled]),
    hasBottomPopupsVisible: () => true,
    hasNavigationPopupVisible: () => true,
  };

  bindBottomControlsApi(first);
  bindBottomControlsApi(second);
  unbindBottomControlsApi(first);
  setAutomatchEnabled(false);
  showPrimaryAction(PrimaryActionType.Rematch);

  assert.deepEqual(events, [["second", false]]);
  assert.equal(
    getGameControlsSnapshot().presentation.gameControls.primaryAction,
    PrimaryActionType.Rematch,
  );
  assert.equal(hasBottomPopupsVisible(), true);
  assert.equal(hasNavigationPopupVisible(), true);

  unbindBottomControlsApi(second);
  assert.equal(hasBottomPopupsVisible(), false);
  assert.equal(hasNavigationPopupVisible(), false);
  assert.doesNotThrow(() => setAutomatchEnabled(true));
});

test("all pure control commands update only their intended state while bound", () => {
  const owner = bindBottomControlsApi({});
  try {
    for (const command of pureControlCommands) {
      resetGameControlsPresentation(timerConfig);
      updateGameControlsContext({ sessionId: 6, isOnlineGame: true });
      updateGameControlsPresentation({
        inviteLinkVisible: true,
        voiceReactionVisible: true,
        navigationVisible: true,
      });
      command.prepare?.();
      const before = getGameControlsSnapshot();
      let notifications = 0;
      const unsubscribe = subscribeGameControls(() => notifications++);
      try {
        bottomControlsPort[command.name](...(command.args ?? []));
        const after = getGameControlsSnapshot();
        assert.equal(after.context, before.context, command.name);
        assert.deepEqual(
          after.presentation,
          {
            ...before.presentation,
            ...command.presentation,
            gameControls: {
              ...before.presentation.gameControls,
              ...command.gameControls,
            },
          },
          command.name,
        );
        assert.equal(
          after.presentation.gameControls.timer.config,
          before.presentation.gameControls.timer.config,
          command.name,
        );
        assert.equal(notifications, 1, command.name);
        bottomControlsPort[command.name](...(command.args ?? []));
        assert.equal(getGameControlsSnapshot(), after, command.name);
        assert.equal(notifications, 1, command.name);
      } finally {
        unsubscribe();
      }
    }
  } finally {
    unbindBottomControlsApi(owner);
  }
});

test("all pure control commands remain no-ops before binding and after unbinding", () => {
  resetGameControlsPresentation(timerConfig);
  let notifications = 0;
  const unsubscribe = subscribeGameControls(() => notifications++);
  const assertUnmountedCommandsDoNothing = () => {
    for (const command of pureControlCommands) {
      resetGameControlsPresentation(timerConfig);
      command.prepare?.();
      const before = getGameControlsSnapshot();
      const notificationsBefore = notifications;
      bottomControlsPort[command.name](...(command.args ?? []));
      assert.equal(getGameControlsSnapshot(), before, command.name);
      assert.equal(notifications, notificationsBefore, command.name);
    }
    const before = getGameControlsSnapshot();
    const notificationsBefore = notifications;
    bottomControlsPort.showTimerButtonProgressing(10, 20, true);
    assert.equal(getGameControlsSnapshot(), before);
    assert.equal(notifications, notificationsBefore);
  };
  try {
    assertUnmountedCommandsDoNothing();
    notifications = 0;
    const owner = bindBottomControlsApi({});
    showPrimaryAction(PrimaryActionType.JoinGame);
    assert.equal(notifications, 1);
    unbindBottomControlsApi(owner);
    assertUnmountedCommandsDoNothing();
  } finally {
    unsubscribe();
  }
});

test("wager outside-tap registration remains independently replaceable", () => {
  resetWagerPanelApi();
  assert.equal(isWagerPanelVisible(), false);
  assert.equal(handleWagerPanelOutsideTap({}), false);

  let handled = 0;
  setWagerPanelVisibilityChecker(() => true);
  setWagerPanelOutsideTapHandler(() => {
    handled += 1;
    return true;
  });
  assert.equal(isWagerPanelVisible(), true);
  assert.equal(handleWagerPanelOutsideTap({}), true);
  assert.equal(handled, 1);

  setWagerPanelOutsideTapHandler(null);
  assert.equal(isWagerPanelVisible(), true);
  assert.equal(handleWagerPanelOutsideTap({}), false);
  resetWagerPanelApi();
});

test("control deadlines retain exact timer, cancellation, and outside-tap timing", () => {
  assert.equal(getTimerEnableDelayMs(3.25, 7), 3750);
  assert.equal(getTimerEnableDelayMs(8, 7), 0);
  assert.equal(hasControlDeadlineElapsed(null, 100), false);
  assert.equal(hasControlDeadlineElapsed(101, 100), false);
  assert.equal(hasControlDeadlineElapsed(100, 100), true);
  assert.equal(
    getCancelAutomatchRevealDeadlineMs(null, 500),
    500 + CANCEL_AUTOMATCH_REVEAL_DELAY_MS,
  );
  assert.equal(getCancelAutomatchRevealDeadlineMs(777, 500), 777);
  assert.equal(NAVIGATION_PENDING_CANCEL_INTENT_TTL_MS, 60000);

  assert.equal(getOutsideTapDismissThresholdMs(true), 42);
  assert.equal(getOutsideTapDismissThresholdMs(false), 420);
  assert.equal(didOutsideTapDismissWindowPass(1000, 1041, true), false);
  assert.equal(didOutsideTapDismissWindowPass(1000, 1042, true), true);
  assert.equal(didOutsideTapDismissWindowPass(1000, 1419, false), false);
  assert.equal(didOutsideTapDismissWindowPass(1000, 1420, false), true);
  assert.equal(rewindOutsideTapDismissedAtForReset(1000, true), 1000);
  assert.equal(rewindOutsideTapDismissedAtForReset(1000, false), 0);
});

test("move-history state follows the latest entry only while its popup is open", () => {
  let reloads = 0;
  let resets = 0;
  const unsubscribeReload = subscribeMoveHistoryPopupReload(() => {
    reloads += 1;
  });
  const unsubscribeReset = subscribeMoveHistoryPopupSelectionReset(() => {
    resets += 1;
  });

  setMoveHistoryPopupState(true, true);
  assert.equal(isMoveHistoryPopupFollowingLatest(), true);
  setMoveHistoryPopupFollowingLatest(false);
  assert.equal(isMoveHistoryPopupFollowingLatest(), false);
  triggerMoveHistoryPopupReload();
  triggerMoveHistoryPopupSelectionReset();
  assert.deepEqual([reloads, resets], [1, 1]);

  unsubscribeReload();
  unsubscribeReset();
  triggerMoveHistoryPopupReload();
  triggerMoveHistoryPopupSelectionReset();
  assert.deepEqual([reloads, resets], [1, 1]);
  setMoveHistoryPopupState(false, true);
  assert.equal(isMoveHistoryPopupFollowingLatest(), false);
});

test("navigation cache stays profile-scoped, sanitized, cloned, and bounded", () => {
  const previousLocalStorage = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage",
  );
  const values = new Map();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
  });

  const scope = resolveNavigationGamesCacheScope("profile-1");
  assert.deepEqual(scope, {
    kind: "profile",
    scopeId: "profile-1",
    scopeKey: "profile:profile-1",
  });
  assert.equal(resolveNavigationGamesCacheScope("") ?? null, null);
  assert.deepEqual(readNavigationGamesCacheSnapshot(null), {
    topGames: [],
    pagedGames: [],
  });

  const game = {
    id: "game-1",
    entityType: "game",
    inviteId: "invite-1",
    kind: "direct",
    status: "waiting",
    sortBucket: 30,
    listSortAtMs: 9,
  };
  const fallbackGame = {
    ...game,
    id: "fallback-game",
    inviteId: "fallback-invite",
    isFallback: true,
  };
  try {
    writeNavigationGamesRuntimeCache(
      scope,
      [game, game, fallbackGame, { id: "invalid" }],
      [],
    );
    const runtimeSnapshot = readNavigationGamesCacheSnapshot(scope);
    assert.equal(runtimeSnapshot.topGames.length, 1);
    assert.equal("isFallback" in runtimeSnapshot.topGames[0], false);
    runtimeSnapshot.topGames.length = 0;
    assert.equal(readNavigationGamesCacheSnapshot(scope).topGames.length, 1);

    writeNavigationGamesPersistedTopCache(
      scope,
      [game, { ...game, id: "optimistic", isOptimistic: true }],
      1,
    );
    clearNavigationGamesRuntimeCacheScope(scope.scopeKey);
    const persistedSnapshot = readNavigationGamesCacheSnapshot(scope);
    assert.deepEqual(
      persistedSnapshot.topGames.map(({ id }) => id),
      ["game-1"],
    );

    values.set(
      "navigationGamesTopCache:v3:profile:profile-1",
      JSON.stringify({
        version: 3,
        updatedAtMs: Date.now(),
        topGames: [fallbackGame, game],
      }),
    );
    const legacySnapshot = readNavigationGamesCacheSnapshot(scope);
    assert.deepEqual(
      legacySnapshot.topGames.map(({ id }) => id),
      ["game-1"],
    );
  } finally {
    clearNavigationGamesRuntimeCacheScope(scope.scopeKey);
    if (previousLocalStorage) {
      Object.defineProperty(globalThis, "localStorage", previousLocalStorage);
    } else {
      delete globalThis.localStorage;
    }
  }
});

test("navigation toolbar delegates its data and preserves picker wiring", () => {
  const source = readFileSync(
    new URL("../src/ui/BottomControls.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /useNavigationGames\(\{\s*profileId,\s*authStatus,\s*isOpen: isNavigationPopupVisible,\s*client: connection,\s*\}\)/,
  );
  assert.match(source, /loadMore: handleNavigationLoadMoreGames/);
  assert.match(source, /removeWaitingGame: handleNavigationGameRemove/);
  assert.match(source, /onRemoveGame=\{handleNavigationGameRemove\}/);
  assert.match(source, /onLoadMoreGames=\{handleNavigationLoadMoreGames\}/);
  assert.doesNotMatch(source, /connection\.subscribeProfileGames/);
  assert.doesNotMatch(source, /connection\.getProfileGamesPage/);
  assert.doesNotMatch(source, /writeNavigationGamesRuntimeCache/);
});

test("toolbar delegates automatch state, deadlines, and requests to its feature hook", () => {
  const source = readFileSync(
    new URL("../src/ui/BottomControls.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /useAutomatchControls\(/);
  assert.match(source, /onClick=\{handleAutomatchClick\}/);
  assert.match(source, /onClick=\{handleCancelAutomatchClick\}/);
  assert.doesNotMatch(
    source,
    /dispatchAutomatchControls|automatchControlsReducer/,
  );
  assert.doesNotMatch(
    source,
    /connection\.cancelAutomatch|didClickAutomatchButton/,
  );
  assert.doesNotMatch(
    source,
    /pendingImmediateCancelAutomatch|pendingDelayedCancelAutomatch/,
  );
  assert.doesNotMatch(
    source,
    /cancelAutomatchRevealTimeoutRef|cancelAutomatchRevealDeadlineRef/,
  );
});

test("control domains use neutral ports and contain no disabled badge path", () => {
  const readSource = (path) =>
    readFileSync(new URL(path, import.meta.url), "utf8");
  const controller = readSource("../src/game/gameController.ts");
  const board = readSource("../src/game/board.ts");
  const bottomControls = readSource("../src/ui/BottomControls.tsx");
  const bottomControlsStyles = readSource("../src/ui/BottomControlsStyles.tsx");
  const boardComponent = readSource("../src/ui/BoardComponent.tsx");
  const mainMenu = readSource("../src/ui/MainMenu.tsx");
  const app = readSource("../src/index.tsx");
  const topRightControls = readSource("../src/ui/TopRightControls.tsx");
  const problems = readSource("../src/content/problems.ts");

  assert.doesNotMatch(
    controller,
    /ui\/(BottomControls|MoveHistoryPopup|BoardComponent)["']/,
  );
  assert.doesNotMatch(board, /ui\/(BottomControls|MainMenu)["']/);
  assert.doesNotMatch(
    bottomControls,
    /(?:game\/board|\.\/MainMenu|\.\/BoardComponent)["']/,
  );
  assert.doesNotMatch(boardComponent, /\.\/BottomControls["']/);
  assert.doesNotMatch(mainMenu, /\.\/BottomControls["']/);
  assert.match(mainMenu, /from ["']\.\/controls\/topRightControlsPort["']/);
  assert.match(
    topRightControls,
    /from ["']\.\/controls\/topRightControlsPort["']/,
  );
  assert.match(topRightControls, /registerTopRightControlsApi\(/);
  assert.match(
    app,
    /import\s+\{\s*TopRightControls\s*\}\s+from ["']\.\/ui\/TopRightControls["']/,
  );
  assert.match(
    app,
    /import\s+\{\s*closeAllKindsOfPopups\s*\}\s+from ["']\.\/ui\/controls\/menuPort["']/,
  );
  assert.match(app, /import MainMenu from ["']\.\/ui\/MainMenu["']/);
  assert.doesNotMatch(problems, /game\/gameController["']/);
  assert.match(
    bottomControls,
    /useLayoutEffect\(\(\) => \{\s*const boundApi = bindBottomControlsApi\([\s\S]*?return \(\) => unbindBottomControlsApi\(boundApi\);\s*\}\);/,
  );
  assert.doesNotMatch(bottomControls, /bottomControlsApiRef/);

  for (const source of [controller, bottomControls, bottomControlsStyles]) {
    assert.doesNotMatch(
      source,
      /HOME_NAVIGATION_BADGE_ENABLED|NavigationBadge|setBadgeVisible|isBadgeVisible/,
    );
  }
});
