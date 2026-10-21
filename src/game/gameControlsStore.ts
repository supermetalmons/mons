import { MATCH_TIMER_DURATION_SECONDS } from "@mons/shared/timers";
import {
  createGameControlsState,
  gameControlsReducer,
  type GameControlsAction,
  type TimerConfig,
} from "../ui/controls/bottomControlsState";
import {
  createGameControlsContext,
  createGameControlsPresentation,
  type GameControlsContext,
  type GameControlsPresentation,
  type GameControlsSnapshot,
} from "./gameControlsModel";

const hasChanges = <T extends object>(current: T, updates: Partial<T>) =>
  (Object.keys(updates) as Array<keyof T>).some(
    (key) => !Object.is(current[key], updates[key]),
  );

export function createGameControlsStore(initialTimerConfig: TimerConfig) {
  let snapshot: GameControlsSnapshot = {
    context: createGameControlsContext(),
    presentation: createGameControlsPresentation(
      createGameControlsState(initialTimerConfig),
    ),
  };
  const listeners = new Set<() => void>();
  let batchDepth = 0;
  let notificationPending = false;
  const notify = () => {
    if (batchDepth > 0) {
      notificationPending = true;
      return;
    }
    listeners.forEach((listener) => listener());
  };
  const batchUpdates = (callback: () => void): void => {
    batchDepth += 1;
    try {
      callback();
    } finally {
      batchDepth -= 1;
      if (batchDepth === 0 && notificationPending) {
        notificationPending = false;
        notify();
      }
    }
  };
  const updatePresentation = (updates: Partial<GameControlsPresentation>) => {
    if (!hasChanges(snapshot.presentation, updates)) return;
    snapshot = {
      ...snapshot,
      presentation: { ...snapshot.presentation, ...updates },
    };
    notify();
  };
  return {
    batchUpdates,
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    updateContext: (updates: Partial<GameControlsContext>) => {
      if (!hasChanges(snapshot.context, updates)) return;
      snapshot = { ...snapshot, context: { ...snapshot.context, ...updates } };
      notify();
    },
    updatePresentation,
    dispatchGameControls: (action: GameControlsAction) => {
      updatePresentation({
        gameControls: gameControlsReducer(
          snapshot.presentation.gameControls,
          action,
        ),
      });
    },
    resetPresentation: (timerConfig: TimerConfig) => {
      snapshot = {
        ...snapshot,
        presentation: createGameControlsPresentation(
          createGameControlsState(timerConfig),
        ),
      };
      notify();
    },
  };
}

const gameControlsStore = createGameControlsStore({
  duration: MATCH_TIMER_DURATION_SECONDS,
  progress: 0,
  requestDate: Date.now(),
});

export const getGameControlsSnapshot = gameControlsStore.getSnapshot;
export const batchGameControlsUpdates = gameControlsStore.batchUpdates;
export const subscribeGameControls = gameControlsStore.subscribe;
export const updateGameControlsContext = gameControlsStore.updateContext;
export const updateGameControlsPresentation =
  gameControlsStore.updatePresentation;
export const dispatchGameControls = gameControlsStore.dispatchGameControls;
export const resetGameControlsPresentation =
  gameControlsStore.resetPresentation;
