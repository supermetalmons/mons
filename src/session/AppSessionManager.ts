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
};

let initialized = false;
let isTransitioning = false;
let isApplyingNavigation = false;
let currentTarget: AppSessionTarget = getCurrentRouteState();
let pendingTransitionRequest: { target: RouteState; options?: TransitionOptions } | null = null;

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
  const gameController = await import("../game/gameController");
  await gameController.go();
  const mainGameLoadState = await import("../game/mainGameLoadState");
  mainGameLoadState.markMainGameLoaded();
};

const runTransition = async (target: RouteState, options?: TransitionOptions) => {
  if (isTransitioning) {
    pendingTransitionRequest = { target, options };
    return;
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
    const connectionModule = await import("../connection/connection");
    connectionModule.connection.syncRouteState();
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
      const connectionModule = await import("../connection/connection");
      connectionModule.connection.syncRouteState();
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
    const queuedRequest = pendingTransitionRequest;
    pendingTransitionRequest = null;
    if (queuedRequest && (queuedRequest.options?.force || !routeStatesMatch(queuedRequest.target, currentTarget))) {
      void runTransition(queuedRequest.target, queuedRequest.options);
    }
  }
};

export const transition = async (target: RouteState, options?: TransitionOptions) => {
  await runTransition(target, options);
};

export const transitionToHome = async (options?: TransitionToHomeOptions) => {
  const target = currentTarget;
  const homeTarget: RouteState = {
    mode: "home",
    path: "",
    inviteId: null,
    snapshotId: null,
    autojoin: false,
  };
  if (!routeStatesMatch(target, homeTarget) || options?.forceMatchScopeReset) {
    await transition(homeTarget, {
      resetProfileScope: options?.resetProfileScope,
      force: options?.forceMatchScopeReset === true,
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
  beginMatchSession();
  subscribeToNavigationState((routeState, source) => {
    if (source === "push" || source === "replace") {
      if (isApplyingNavigation || isTransitioning) {
        return;
      }
      currentTarget = routeState;
      return;
    }
    if (source !== "popstate") {
      return;
    }
    if (isApplyingNavigation) {
      return;
    }
    if (isTransitioning) {
      void transition(routeState, { skipNavigation: true });
      return;
    }
    if (routeStatesMatch(routeState, currentTarget)) {
      return;
    }
    void transition(routeState, { skipNavigation: true });
  });
};

