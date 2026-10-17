import { useCallback, useEffect, useRef } from "react";
import {
  decrementLifecycleCounter,
  incrementLifecycleCounter,
} from "../../lifecycle/lifecycleDiagnostics";
import type { GameControlsAction } from "./bottomControlsState";
import {
  getTimerEnableDelayMs,
  hasControlDeadlineElapsed,
} from "./controlTiming";

export const useMatchControlTimers = ({
  isStartTimerVisible,
  isTimerButtonDisabled,
  dispatchGameControls,
}: {
  isStartTimerVisible: boolean;
  isTimerButtonDisabled: boolean;
  dispatchGameControls: (action: GameControlsAction) => void;
}) => {
  const hourglassEnableTimeoutRef = useRef<number | null>(null);
  const hourglassEnableDeadlineRef = useRef<number | null>(null);
  const isTimerButtonDisabledRef = useRef(true);
  const isStartTimerVisibleRef = useRef(false);
  const matchScopedTimeoutIdsRef = useRef<Set<number>>(new Set());

  const clearTrackedMatchScopedTimeout = useCallback(
    (timeoutId: number | null) => {
      if (timeoutId === null) {
        return;
      }
      if (matchScopedTimeoutIdsRef.current.has(timeoutId)) {
        matchScopedTimeoutIdsRef.current.delete(timeoutId);
        decrementLifecycleCounter("uiTimeouts");
      }
      clearTimeout(timeoutId);
    },
    [],
  );

  const setMatchScopedTimeout = useCallback(
    (callback: () => void, delay: number, guard?: () => boolean): number => {
      const timeoutId = window.setTimeout(() => {
        if (matchScopedTimeoutIdsRef.current.has(timeoutId)) {
          matchScopedTimeoutIdsRef.current.delete(timeoutId);
          decrementLifecycleCounter("uiTimeouts");
        }
        if (guard && !guard()) {
          return;
        }
        callback();
      }, delay);
      matchScopedTimeoutIdsRef.current.add(timeoutId);
      incrementLifecycleCounter("uiTimeouts");
      return timeoutId;
    },
    [],
  );

  const clearMatchScopedTimeouts = useCallback(() => {
    matchScopedTimeoutIdsRef.current.forEach((timeoutId) => {
      clearTimeout(timeoutId);
      decrementLifecycleCounter("uiTimeouts");
    });
    matchScopedTimeoutIdsRef.current.clear();
    hourglassEnableTimeoutRef.current = null;
    hourglassEnableDeadlineRef.current = null;
  }, []);

  useEffect(() => {
    isTimerButtonDisabledRef.current = isTimerButtonDisabled;
  }, [isTimerButtonDisabled]);

  useEffect(() => {
    isStartTimerVisibleRef.current = isStartTimerVisible;
  }, [isStartTimerVisible]);

  const tryEnableTimerButtonFromDeadline = useCallback(() => {
    const deadline = hourglassEnableDeadlineRef.current;
    if (!hasControlDeadlineElapsed(deadline, Date.now())) {
      return;
    }
    if (hourglassEnableTimeoutRef.current !== null) {
      clearTrackedMatchScopedTimeout(hourglassEnableTimeoutRef.current);
      hourglassEnableTimeoutRef.current = null;
    }
    hourglassEnableDeadlineRef.current = null;
    if (isStartTimerVisibleRef.current && isTimerButtonDisabledRef.current) {
      dispatchGameControls({ type: "enableTimer" });
    }
  }, [clearTrackedMatchScopedTimeout, dispatchGameControls]);

  useEffect(() => {
    const handleTimerDeadlineCheck = () => {
      if (document.visibilityState === "hidden") {
        return;
      }
      tryEnableTimerButtonFromDeadline();
    };
    handleTimerDeadlineCheck();
    document.addEventListener("visibilitychange", handleTimerDeadlineCheck);
    window.addEventListener("focus", handleTimerDeadlineCheck);
    window.addEventListener("pageshow", handleTimerDeadlineCheck);
    return () => {
      document.removeEventListener(
        "visibilitychange",
        handleTimerDeadlineCheck,
      );
      window.removeEventListener("focus", handleTimerDeadlineCheck);
      window.removeEventListener("pageshow", handleTimerDeadlineCheck);
    };
  }, [tryEnableTimerButtonFromDeadline]);

  const hideTimerButtons = useCallback(() => {
    if (hourglassEnableTimeoutRef.current) {
      clearTrackedMatchScopedTimeout(hourglassEnableTimeoutRef.current);
      hourglassEnableTimeoutRef.current = null;
    }
    hourglassEnableDeadlineRef.current = null;
    dispatchGameControls({ type: "hideTimers" });
  }, [clearTrackedMatchScopedTimeout, dispatchGameControls]);

  const showTimerButtonProgressing = useCallback(
    (
      currentProgress: number,
      target: number,
      enableWhenTargetReached: boolean,
    ) => {
      if (hourglassEnableTimeoutRef.current) {
        clearTrackedMatchScopedTimeout(hourglassEnableTimeoutRef.current);
        hourglassEnableTimeoutRef.current = null;
      }
      hourglassEnableDeadlineRef.current = null;

      dispatchGameControls({
        type: "showTimerProgress",
        config: {
          duration: target,
          progress: currentProgress,
          requestDate: Date.now(),
        },
      });

      if (enableWhenTargetReached) {
        const timeUntilTarget = getTimerEnableDelayMs(currentProgress, target);
        if (timeUntilTarget <= 0) {
          dispatchGameControls({ type: "enableTimer" });
          return;
        }
        hourglassEnableDeadlineRef.current = Date.now() + timeUntilTarget;
        hourglassEnableTimeoutRef.current = setMatchScopedTimeout(() => {
          dispatchGameControls({ type: "enableTimer" });
          hourglassEnableTimeoutRef.current = null;
          hourglassEnableDeadlineRef.current = null;
        }, timeUntilTarget);
        tryEnableTimerButtonFromDeadline();
      }
    },
    [
      clearTrackedMatchScopedTimeout,
      dispatchGameControls,
      setMatchScopedTimeout,
      tryEnableTimerButtonFromDeadline,
    ],
  );

  return {
    setMatchScopedTimeout,
    clearTrackedMatchScopedTimeout,
    clearMatchScopedTimeouts,
    hideTimerButtons,
    showTimerButtonProgressing,
  };
};
