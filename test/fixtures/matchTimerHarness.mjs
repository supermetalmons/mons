import { createMatchTimerController } from "../../src/game/matchTimerController.ts";

export function createMatchTimerHarness(
  overrides = {},
  readContext = () => ({}),
  onEvent = () => {},
) {
  let now = 1_000;
  let session = 1;
  let nextTimer = 0;
  let allowedMatchIds = null;
  const timers = new Map();
  const events = [];
  const emit = (event) => {
    events.push(event);
    onEvent(event);
  };
  const context = {
    isOnlineGame: true,
    isReconnect: false,
    didConnect: true,
    isWatchOnly: false,
    isGameOver: false,
    hasWinner: false,
    hasTimerWinner: false,
    isPlayerSideTurn: false,
    boardViewMode: "activeLive",
    turnNumber: 4,
    activeColor: "black",
    activeMatchId: "match",
    fallbackMatchId: null,
    ...overrides,
  };
  const controller = createMatchTimerController({
    getContext: () => ({ ...context, ...readContext() }),
    matchBelongsToCurrentInvite: (id) =>
      allowedMatchIds === null || allowedMatchIds.has(id),
    now: () => now,
    createSessionGuard: () => {
      const expected = session;
      return () => session === expected;
    },
    setTimeout(callback, delay, guard) {
      const id = ++nextTimer;
      timers.set(id, {
        delay,
        run() {
          timers.delete(id);
          if (!guard || guard()) callback();
        },
      });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    showCountdown: (...args) => emit(["countdown", ...args]),
    hideCountdown: () => emit(["hideCountdown"]),
    hideButtons: () => emit(["hideButtons"]),
    showProgress: (...args) => emit(["progress", ...args]),
    enableVictoryClaim: () => emit(["claim"]),
    onTerminal: (...args) => emit(["terminal", ...args]),
  });
  return {
    controller,
    context,
    timers,
    events,
    advance: (milliseconds) => (now += milliseconds),
    setNow: (milliseconds) => (now = milliseconds),
    invalidateSession: () => session++,
    allowMatches: (...ids) => (allowedMatchIds = new Set(ids)),
  };
}
