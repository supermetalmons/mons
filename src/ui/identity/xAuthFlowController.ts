import type { AuthStatus } from "../../connection/authModels";
import type { XAuthUiFeedback } from "../../connection/xAuthUiFeedback";
import type { XButtonUiState } from "./authFlowState";

type XConsentSource = "signin" | "settings";
type PendingXRedirectResult = { consentSource: XConsentSource } | null;

export type XAuthFlowSnapshot = {
  buttonState: XButtonUiState;
  pendingSignIn: "none" | "waiting" | "stale";
};

export type XAuthFlowOptions = {
  authStatus?: AuthStatus;
  canStart: () => boolean;
  onStart: () => void;
  onError: (message: string, error?: unknown) => void;
  onRedirectStarted?: () => void;
  onSettled?: (result: { redirectAttempted: boolean }) => void | Promise<void>;
  onPendingSignIn?: () => void;
  onSettingsReturn?: () => void;
  onFeedback?: (feedback: XAuthUiFeedback) => void;
};

type XAuthFlowDependencies = {
  beginIntent: () => Promise<{ intentId: string }>;
  startRedirect: (params: {
    intentId: string;
    consentSource: XConsentSource;
  }) => Promise<unknown>;
  isRedirectStartedError: (error: unknown) => boolean;
  formatError: (error: unknown, consentSource: XConsentSource) => string;
  peekPendingResult: () => PendingXRedirectResult;
  subscribePendingResult: (
    listener: (result: PendingXRedirectResult) => void,
  ) => () => void;
  clearPendingResult: () => void;
  consumeFeedback: () => XAuthUiFeedback | null;
  subscribeFeedback: (
    listener: (feedback: XAuthUiFeedback) => void,
  ) => () => void;
  isVisible: () => boolean;
  subscribeVisibility: (listener: () => void) => () => void;
  setTimeout?: typeof setTimeout;
  clearTimeout?: typeof clearTimeout;
};

const NAVIGATION_FALLBACK_DELAY_MS = 1500;
const PENDING_SIGNIN_STALE_DELAY_MS = 20 * 1000;

export const createXAuthFlowController = ({
  consentSource,
  dependencies,
}: {
  consentSource: XConsentSource;
  dependencies: XAuthFlowDependencies;
}) => {
  const scheduleTimeout = dependencies.setTimeout ?? setTimeout;
  const cancelTimeout = dependencies.clearTimeout ?? clearTimeout;
  const initialPending =
    consentSource === "signin" ? dependencies.peekPendingResult() : null;
  const listeners = new Set<() => void>();
  let snapshot: XAuthFlowSnapshot = {
    buttonState: "idle",
    pendingSignIn:
      initialPending?.consentSource === "signin" ? "waiting" : "none",
  };
  let options: XAuthFlowOptions | null = null;
  let mounted = false;
  let latestAction = 0;
  let runningAction: number | null = null;
  let navigationRecoveryId = 0;
  let pendingTimerId = 0;
  let navigationTimeout: ReturnType<typeof setTimeout> | null = null;
  let pendingTimeout: ReturnType<typeof setTimeout> | null = null;
  let unsubscribeVisibility: (() => void) | null = null;
  let unsubscribePending: (() => void) | null = null;
  let unsubscribeFeedback: (() => void) | null = null;
  let shouldReopenSettings = initialPending?.consentSource === "settings";

  const updateSnapshot = (patch: Partial<XAuthFlowSnapshot>) => {
    const next = { ...snapshot, ...patch };
    if (
      next.buttonState === snapshot.buttonState &&
      next.pendingSignIn === snapshot.pendingSignIn
    ) {
      return;
    }
    snapshot = next;
    if (mounted) listeners.forEach((listener) => listener());
  };

  const clearNavigationRecovery = () => {
    navigationRecoveryId += 1;
    if (navigationTimeout !== null) {
      cancelTimeout(navigationTimeout);
      navigationTimeout = null;
    }
    unsubscribeVisibility?.();
    unsubscribeVisibility = null;
  };

  const clearPendingTimeout = () => {
    pendingTimerId += 1;
    if (pendingTimeout !== null) {
      cancelTimeout(pendingTimeout);
      pendingTimeout = null;
    }
  };

  const scheduleNavigationRecovery = () => {
    clearNavigationRecovery();
    const recoveryId = navigationRecoveryId;
    const recover = () => {
      if (!mounted || recoveryId !== navigationRecoveryId) return;
      clearNavigationRecovery();
      if (
        options?.authStatus === "authenticated" ||
        dependencies.peekPendingResult()?.consentSource === "signin"
      ) {
        return;
      }
      updateSnapshot({ buttonState: "idle" });
    };
    navigationTimeout = scheduleTimeout(() => {
      if (!mounted || recoveryId !== navigationRecoveryId) return;
      navigationTimeout = null;
      if (dependencies.isVisible()) {
        recover();
      } else {
        unsubscribeVisibility = dependencies.subscribeVisibility(() => {
          if (dependencies.isVisible()) recover();
        });
      }
    }, NAVIGATION_FALLBACK_DELAY_MS);
  };

  const applyPendingResult = (result: PendingXRedirectResult) => {
    if (!mounted) return;
    clearPendingTimeout();
    if (result?.consentSource === "signin") {
      updateSnapshot({ pendingSignIn: "waiting" });
      const timerId = pendingTimerId;
      pendingTimeout = scheduleTimeout(() => {
        if (
          !mounted ||
          timerId !== pendingTimerId ||
          dependencies.peekPendingResult()?.consentSource !== "signin"
        ) {
          return;
        }
        pendingTimeout = null;
        updateSnapshot({ pendingSignIn: "stale" });
      }, PENDING_SIGNIN_STALE_DELAY_MS);
      options?.onPendingSignIn?.();
      return;
    }
    updateSnapshot({ pendingSignIn: "none" });
    if (result?.consentSource === "settings") {
      shouldReopenSettings = true;
    } else if (shouldReopenSettings) {
      shouldReopenSettings = false;
      options?.onSettingsReturn?.();
    }
  };

  const applyFeedback = (feedback: XAuthUiFeedback) => {
    if (mounted) options?.onFeedback?.(feedback);
  };

  const start = async (): Promise<void> => {
    if (
      !mounted ||
      runningAction !== null ||
      snapshot.buttonState === "connecting" ||
      !options?.canStart()
    ) {
      return;
    }
    const callbacks = options;
    const action = ++latestAction;
    const isCurrent = () => mounted && action === latestAction;
    let redirectAttempted = false;
    let redirectStarted = false;
    runningAction = action;
    clearNavigationRecovery();
    updateSnapshot({ buttonState: "connecting" });
    try {
      callbacks.onStart();
      const intent = await dependencies.beginIntent();
      redirectAttempted = true;
      await dependencies.startRedirect({
        intentId: intent.intentId,
        consentSource,
      });
    } catch (error) {
      if (!isCurrent()) return;
      if (dependencies.isRedirectStartedError(error)) {
        redirectStarted = true;
        callbacks.onRedirectStarted?.();
        if (consentSource === "signin") scheduleNavigationRecovery();
      } else {
        callbacks.onError(
          dependencies.formatError(error, consentSource),
          error,
        );
      }
    } finally {
      if (runningAction === action) runningAction = null;
      if (isCurrent()) {
        if (consentSource === "settings" || !redirectStarted) {
          clearNavigationRecovery();
          updateSnapshot({ buttonState: "idle" });
        }
        await callbacks.onSettled?.({ redirectAttempted });
      }
    }
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setOptions: (nextOptions: XAuthFlowOptions) => {
      options = nextOptions;
      if (
        consentSource === "signin" &&
        options.authStatus === "authenticated"
      ) {
        latestAction += 1;
        runningAction = null;
        clearNavigationRecovery();
        updateSnapshot({ buttonState: "idle" });
      }
    },
    attach: () => {
      if (mounted) return;
      mounted = true;
      if (consentSource !== "signin") return;
      unsubscribePending =
        dependencies.subscribePendingResult(applyPendingResult);
      const feedback = dependencies.consumeFeedback();
      if (feedback) applyFeedback(feedback);
      unsubscribeFeedback = dependencies.subscribeFeedback(applyFeedback);
    },
    detach: () => {
      mounted = false;
      latestAction += 1;
      runningAction = null;
      clearNavigationRecovery();
      clearPendingTimeout();
      unsubscribePending?.();
      unsubscribePending = null;
      unsubscribeFeedback?.();
      unsubscribeFeedback = null;
      updateSnapshot({ buttonState: "idle" });
    },
    start,
    retryPendingSignIn: () => {
      if (!mounted || snapshot.pendingSignIn !== "stale") return;
      clearPendingTimeout();
      dependencies.clearPendingResult();
      updateSnapshot({ pendingSignIn: "none" });
      options?.onError(
        dependencies.formatError("x-redirect-complete-timeout", "signin"),
      );
    },
  };
};
