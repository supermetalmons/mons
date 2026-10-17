import { registerHooks } from "node:module";

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

const { WagerClient } = await import("../src/connection/wagerClient.ts");
const { createUserBoundAuthTokenProvider } =
  await import("../src/services/authApi.ts");
const { FrozenMaterialsPoller } =
  await import("../src/connection/frozenMaterialsPoller.ts");
const { computeAvailableMaterials, applyMaterialDeltas } =
  await import("@mons/shared/mining");

export const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
export const flush = () => new Promise(setImmediate);
export const emptyMaterials = { dust: 0, slime: 0, gum: 0, metal: 0, ice: 0 };

export function createWagerClientHarness(overrides = {}) {
  const session = {
    activeContext: {
      contextId: 1,
      sessionEpoch: 1,
      inviteId: "invite",
      matchId: "finished",
      loginUid: "login",
      actorUid: "actor",
      role: "host",
      canWrite: true,
      createdAtMs: 0,
    },
    epoch: 1,
    actorUid: "actor",
    profileId: "profile",
    auth: {
      currentUser: { uid: "login", getIdToken: async () => "token" },
      getTokenRemainingMs: () => 60_000,
    },
  };
  const events = {
    states: [],
    frozen: [],
    inventory: [],
    banners: [],
    initial: [],
    refreshes: 0,
    observers: 0,
    channels: [],
    pollers: [],
    flushes: [],
  };
  let state = null;
  let selectedMatchId = null;
  let frozen = { ...emptyMaterials };
  let frozenStatus = "idle";
  const timers = new Map();
  let timerId = 0;
  const dependencies = {
    auth: session.auth,
    getActiveContext: () => session.activeContext,
    getSessionEpoch: () => session.epoch,
    getSameProfilePlayerUid: () => session.actorUid,
    getProfileId: () => session.profileId,
    requireWritableContext: () =>
      session.activeContext?.canWrite && session.activeContext.actorUid
        ? session.activeContext
        : null,
    ensureAuthenticated: async () => {},
    getUserBoundAuthTokenProvider: (uid) => {
      const user = session.auth.currentUser;
      if (!user || (uid && user.uid !== uid))
        throw new Error("authentication-changed");
      return createUserBoundAuthTokenProvider(
        user,
        () => session.auth.currentUser,
      );
    },
    createSessionGuard: () => {
      const epoch = session.epoch;
      return () => epoch === session.epoch;
    },
    createMatchContextGuard: (inviteId, matchId) => {
      const epoch = session.epoch;
      const contextId = session.activeContext?.contextId;
      return () =>
        session.epoch === epoch &&
        session.activeContext?.contextId === contextId &&
        session.activeContext?.inviteId === inviteId &&
        session.activeContext?.matchId === matchId;
    },
    isContextActive: (id, epoch) =>
      session.epoch === epoch && session.activeContext?.contextId === id,
    isCurrentAuthUser: (uid) => session.auth.currentUser?.uid === uid,
    isSessionEpochActive: (epoch) => session.epoch === epoch,
    getOpponentId: () => "opponent",
    flushPendingMoves: async (context, options) => {
      events.flushes.push({ context, options });
    },
    registerObserverCleanup: () => true,
    unregisterObserverCleanup: () => {},
    changeObserverCount: (delta) => {
      events.observers += delta;
    },
    wagerStore: {
      getWagerState: () => state,
      setWagerState: (matchId, value) => {
        if (selectedMatchId && matchId !== selectedMatchId) return;
        state = value;
        events.states.push({ matchId, state: value });
      },
      setCurrentWagerMatch: (matchId) => {
        selectedMatchId = matchId;
        state = null;
      },
      syncCurrentWagerMatchState: (matchId, value, confirmed) => {
        selectedMatchId = matchId;
        state = value;
        events.states.push({ matchId, state: value, confirmed });
      },
    },
    materialStore: {
      getFrozenMaterials: () => ({ ...frozen }),
      getFrozenMaterialsStatus: () => frozenStatus,
      setFrozenMaterials: (value, status = frozenStatus) => {
        frozen = { ...emptyMaterials, ...value };
        frozenStatus = status;
        events.frozen.push({ materials: { ...frozen }, status });
      },
      setFrozenMaterialsStatus: (status) => {
        frozenStatus = status;
      },
      applyFrozenMaterialsDelta: (delta) => {
        frozen = applyMaterialDeltas(frozen, delta);
        return { ...frozen };
      },
      computeAvailableMaterials,
    },
    mining: {
      getSnapshot: () => ({
        materials: { ...emptyMaterials, dust: 8 },
        lastRockDate: null,
      }),
      setFromServer: (value) => events.inventory.push(value),
    },
    api: {
      readInviteWagersViaApi: async (inviteId) => ({
        ok: true,
        snapshot: { inviteId, revision: 1, wagers: {} },
      }),
      readWagerFrozenViaApi: async ({ playerUid }) => ({
        ok: true,
        playerUid,
        revision: 1,
        frozen: { ...emptyMaterials },
      }),
      sendWagerProposalViaApi: async () => ({ ok: true, count: 3 }),
      cancelWagerProposalViaApi: async () => ({ ok: true }),
      declineWagerProposalViaApi: async () => ({ ok: true }),
      acceptWagerProposalViaApi: async () => ({ ok: true, count: 3 }),
      resolveWagerOutcomeViaApi: async () => ({ ok: true, reason: "no-wager" }),
    },
    onInitialWagers: () => events.initial.push(true),
    onReloadRequired: () => events.banners.push(true),
    now: () => 100,
    setTimer: (callback, ms) => {
      const id = ++timerId;
      timers.set(id, { callback, ms });
      if ([160, 180, 320, 360].includes(ms))
        queueMicrotask(() => {
          if (timers.delete(id)) callback();
        });
      return id;
    },
    clearTimer: (id) => timers.delete(id),
    createSocket: () => {
      throw new Error("unexpected-socket");
    },
    isOnline: () => true,
    isVisible: () => true,
    addWakeListener: () => () => {},
    addVisibilityListener: () => () => {},
    addOnlineListener: () => () => {},
    random: () => 0.5,
    log: () => {},
    logError: () => {},
    debug: false,
    createWagerChannel: (options) => {
      const channel = {
        options,
        stops: 0,
        refreshes: 0,
        stop() {
          this.stops++;
        },
        requestRefresh() {
          this.refreshes++;
        },
        emit(
          snapshot,
          source = "http",
          requestGeneration = options.captureGeneration(),
        ) {
          options.onSnapshot(snapshot, { source, requestGeneration });
        },
      };
      events.channels.push(channel);
      return channel;
    },
    createFrozenPoller: (options) => {
      const poller = new FrozenMaterialsPoller(options);
      const refresh = poller.refresh.bind(poller);
      poller.refresh = () => {
        events.refreshes++;
        refresh();
      };
      events.pollers.push(poller);
      return poller;
    },
    ...overrides,
  };
  const client = new WagerClient(dependencies);
  if (dependencies.getActiveContext())
    client.bindContext(dependencies.getActiveContext());
  return {
    client,
    dependencies,
    session,
    events,
    timers,
    observe: (wagers = {}, revision = 1) => {
      client.observeWagers();
      events.channels.at(-1).emit({
        inviteId: dependencies.getActiveContext().inviteId,
        revision,
        wagers,
      });
    },
    stop: () => {
      client.resetMatch();
      client.resetProfile();
    },
  };
}

export function createConnectionWagerClientHarness(connection, overrides = {}) {
  return createWagerClientHarness({
    auth: connection.auth,
    getActiveContext: () => connection.activeContext,
    getSessionEpoch: () => connection.sessionEpoch,
    getSameProfilePlayerUid: () =>
      ("sameProfilePlayerUid" in connection
        ? connection.sameProfilePlayerUid
        : connection.activeContext?.actorUid) ?? null,
    requireWritableContext: (...args) =>
      connection.requireWritableContext
        ? connection.requireWritableContext(...args)
        : connection.activeContext?.canWrite
          ? connection.activeContext
          : null,
    ensureAuthenticated: () =>
      connection.ensureAuthenticated?.() ?? Promise.resolve(),
    getUserBoundAuthTokenProvider: (uid) =>
      connection.getUserBoundAuthTokenProvider(uid),
    createSessionGuard: () => {
      const epoch = connection.sessionEpoch;
      return () => epoch === connection.sessionEpoch;
    },
    createMatchContextGuard: (inviteId, matchId) => {
      const epoch = connection.sessionEpoch;
      const contextId = connection.activeContext?.contextId;
      return () =>
        epoch === connection.sessionEpoch &&
        contextId === connection.activeContext?.contextId &&
        inviteId === connection.activeContext?.inviteId &&
        matchId === connection.activeContext?.matchId;
    },
    isContextActive: (contextId, epoch) =>
      connection.activeContext?.contextId === contextId &&
      connection.sessionEpoch === epoch,
    isCurrentAuthUser: (uid) => connection.auth.currentUser?.uid === uid,
    isSessionEpochActive: (epoch) => connection.sessionEpoch === epoch,
    getOpponentId: (...args) =>
      connection.getOpponentId?.(...args) ?? "opponent",
    flushPendingMoves: (...args) => connection.flushPendingMoves(...args),
    registerObserverCleanup: (...args) =>
      connection.registerObserverCleanup?.(...args) ?? true,
    unregisterObserverCleanup: (...args) =>
      connection.unregisterObserverCleanup?.(...args),
    ...overrides,
  });
}
