import { beginMatchSession, getCurrentSessionEpoch, getCurrentSessionId as getMatchSessionId, incrementSessionEpoch } from "../game/matchSession";
import { getLifecycleCounters } from "../lifecycle/lifecycleDiagnostics";
import { initializeNavigation, pushRoutePath, replaceRoutePath, subscribeToNavigationState } from "../navigation/appNavigation";
import { RouteState, getCurrentRouteState, getRoutePathForTarget } from "../navigation/routeState";

export type AppSessionTarget = RouteState;
type TransitionOptions = {
  replace?: boolean;
  skipNavigation?: boolean;
  resetProfileScope?: boolean;
  force?: boolean;
};
type TransitionToHomeOptions = {
  resetProfileScope?: boolean;
  forceMatchScopeReset?: boolean;
  replace?: boolean;
};
type PendingTransitionRequest = {
  target: RouteState;
  options?: TransitionOptions;
  waiters: Array<() => void>;
};

let initialized = false;
let isTransitioning = false;
let isApplyingNavigation = false;
let currentTarget: AppSessionTarget = getCurrentRouteState();
let pendingTransitionRequest: PendingTransitionRequest | null = null;

const waitForBoardRoot = async (timeoutMs = 30000) => {
  if (document.getElementById("monsboard")) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const startedAt = performance.now();
    const poll = () => {
      if (document.getElementById("monsboard")) {
        resolve();
      } else if (performance.now() - startedAt >= timeoutMs) {
        reject(new Error("monsboard-root-timeout"));
      } else {
        window.setTimeout(poll, 16);
      }
    };
    poll();
  });
};

const routeStatesMatch = (a: RouteState, b: RouteState) => {
  return a.mode === b.mode && a.path === b.path && a.inviteId === b.inviteId && a.snapshotId === b.snapshotId && a.autojoin === b.autojoin;
};

const logTransition = (from: RouteState, to: RouteState) => {
  const counters = getLifecycleCounters();
  console.log("session-transition", {
    from: from.path,
    to: to.path,
    sessionId: getMatchSessionId(),
    epoch: getCurrentSessionEpoch(),
    counters,
  });
};

const applyPathForTarget = (target: RouteState, replace = false) => {
  const nextPath = getRoutePathForTarget(target);
  if (window.location.pathname === nextPath) {
    return;
  }
  isApplyingNavigation = true;
  if (replace) {
    replaceRoutePath(nextPath);
  } else {
    pushRoutePath(nextPath);
  }
  isApplyingNavigation = false;
};

const bootstrapForRoute = async () => {
  await waitForBoardRoot();
  const gameController = await import("../game/gameController");
  await gameController.go();
  const mainGameLoadState = await import("../game/mainGameLoadState");
  mainGameLoadState.markMainGameLoaded();
};

const runTransition = async (target: RouteState, options?: TransitionOptions) => {
  if (isTransitioning) {
    return new Promise<void>((resolve) => {
      if (pendingTransitionRequest) {
        pendingTransitionRequest.target = target;
        pendingTransitionRequest.options = options;
        pendingTransitionRequest.waiters.push(resolve);
      } else {
        pendingTransitionRequest = { target, options, waiters: [resolve] };
      }
    });
  }
  const from = currentTarget;
  if (!options?.force && routeStatesMatch(from, target)) {
    return;
  }
  isTransitioning = true;
  incrementSessionEpoch();
  try {
    const lifecycleManager = await import("../lifecycle/lifecycleManager");
    lifecycleManager.teardownMatchScope();
    if (options?.resetProfileScope) {
      lifecycleManager.teardownProfileScope();
    }
    if (!options?.skipNavigation) {
      applyPathForTarget(target, options?.replace === true);
    }
    beginMatchSession();
    await bootstrapForRoute();
    currentTarget = target;
    logTransition(from, target);
  } catch (error) {
    console.error("session-transition-failed", {
      from: from.path,
      to: target.path,
      error,
    });
    try {
      const lifecycleManager = await import("../lifecycle/lifecycleManager");
      lifecycleManager.teardownMatchScope();
      beginMatchSession();
      await bootstrapForRoute();
      currentTarget = getCurrentRouteState();
    } catch (recoveryError) {
      currentTarget = getCurrentRouteState();
      console.error("session-transition-recovery-failed", {
        from: from.path,
        to: target.path,
        recoveryError,
      });
    }
  } finally {
    isTransitioning = false;
  }
  const queuedRequest = pendingTransitionRequest;
  pendingTransitionRequest = null;
  if (queuedRequest) {
    if (queuedRequest.options?.force || !routeStatesMatch(queuedRequest.target, currentTarget)) {
      await runTransition(queuedRequest.target, queuedRequest.options);
    }
    queuedRequest.waiters.forEach((resolve) => resolve());
  }
};

export const transition = async (target: RouteState, options?: TransitionOptions) => {
  await runTransition(target, options);
};

export const transitionToHome = async (options?: TransitionToHomeOptions) => {
  const homeTarget: RouteState = {
    mode: "home",
    path: "",
    inviteId: null,
    snapshotId: null,
    autojoin: false,
  };
  const shouldForceMatchScopeReset = options?.forceMatchScopeReset === true;
  const activeTarget = currentTarget;
  if (!routeStatesMatch(activeTarget, homeTarget) || shouldForceMatchScopeReset) {
    await transition(homeTarget, {
      resetProfileScope: options?.resetProfileScope,
      force: shouldForceMatchScopeReset,
      replace: options?.replace,
    });
  } else if (options?.resetProfileScope) {
    const lifecycleManager = await import("../lifecycle/lifecycleManager");
    lifecycleManager.teardownProfileScope();
  }
};

export const getCurrentTarget = (): RouteState => {
  return currentTarget;
};

export const getCurrentSessionId = () => {
  return getMatchSessionId();
};

export const initializeAppSessionManager = () => {
  if (initialized) {
    return;
  }
  initialized = true;
  initializeNavigation();
  currentTarget = getCurrentRouteState();
  subscribeToNavigationState((routeState, source) => {
    if (source !== "push" && source !== "replace" && source !== "popstate") {
      return;
    }
    if (isApplyingNavigation) {
      return;
    }
    if (!isTransitioning && routeStatesMatch(routeState, currentTarget)) {
      return;
    }
    void transition(routeState, { skipNavigation: true });
  });
  void transition(currentTarget, { skipNavigation: true, force: true });
};

