import { storage } from "../utils/storage";

const LOGOUT_SYNC_CHANNEL = "mons-link-logout-sync";
const LOGOUT_SYNC_STORAGE_KEY = "__mons_link_logout_sync__";
const SIGN_IN_SYNC_CHANNEL = "mons-link-signin-sync";
const SIGN_IN_SYNC_STORAGE_KEY = "__mons_link_signin_sync__";
const FAST_PRE_RELOAD_CLEANUP_MS = 150;
const THOROUGH_PRE_RELOAD_CLEANUP_MS = 2500;
const SAFARI_RELOAD_FALLBACK_DELAY_MS = 180;

type LogoutSignal = {
  id: string;
  cleanupMode?: LogoutCleanupMode;
};

type SignInSignal = {
  id: string;
  tabId: string;
  profileId: string;
  loginId: string;
};

type IndexedDbFactoryWithDatabases = IDBFactory & {
  databases?: () => Promise<Array<{ name?: string }>>;
};

type LogoutCleanupMode = "fast" | "thorough";

let logoutBroadcastChannel: BroadcastChannel | null = null;
let signInBroadcastChannel: BroadcastChannel | null = null;
let didInstallListeners = false;
let lastHandledSignalId = "";
let lastHandledSignInSignalId = "";
let isHandlingSignal = false;

const createSignalId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
};

const tabId = createSignalId();

const serializeLogoutSignal = (signal: LogoutSignal): string => {
  return JSON.stringify(signal);
};

const serializeSignInSignal = (signal: SignInSignal): string => {
  return JSON.stringify(signal);
};

const parseLogoutSignal = (value: unknown): LogoutSignal | null => {
  if (typeof value !== "string" || value === "") {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as { id?: unknown; cleanupMode?: unknown } | null;
    if (!parsed || typeof parsed.id !== "string" || parsed.id === "") {
      return null;
    }
    const cleanupMode = parsed.cleanupMode === "thorough" ? "thorough" : parsed.cleanupMode === "fast" ? "fast" : undefined;
    return { id: parsed.id, cleanupMode };
  } catch {
    return null;
  }
};

const parseSignInSignal = (value: unknown): SignInSignal | null => {
  if (typeof value !== "string" || value === "") {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as { id?: unknown; tabId?: unknown; profileId?: unknown; loginId?: unknown } | null;
    if (
      !parsed ||
      typeof parsed.id !== "string" ||
      parsed.id === "" ||
      typeof parsed.tabId !== "string" ||
      parsed.tabId === "" ||
      typeof parsed.profileId !== "string" ||
      parsed.profileId === "" ||
      typeof parsed.loginId !== "string" ||
      parsed.loginId === ""
    ) {
      return null;
    }
    return {
      id: parsed.id,
      tabId: parsed.tabId,
      profileId: parsed.profileId,
      loginId: parsed.loginId,
    };
  } catch {
    return null;
  }
};

const getLocalStorageKeys = (): string[] => {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key) {
        keys.push(key);
      }
    }
    return keys;
  } catch {
    return [];
  }
};

const clearLocalStorageForLogout = () => {
  getLocalStorageKeys().forEach((key) => {
    if (key !== LOGOUT_SYNC_STORAGE_KEY) {
      localStorage.removeItem(key);
    }
  });
};

const clearSessionStorageForLogout = () => {
  try {
    sessionStorage.clear();
  } catch {}
};

const deleteIndexedDbDatabase = (name: string): Promise<void> => {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
};

const clearIndexedDbForLogout = async () => {
  if (typeof indexedDB === "undefined") {
    return;
  }
  const factory = indexedDB as IndexedDbFactoryWithDatabases;
  if (typeof factory.databases !== "function") {
    return;
  }
  try {
    const databases = await factory.databases();
    const names = databases
      .map((database) => database.name)
      .filter((name): name is string => typeof name === "string" && name.length > 0);
    await Promise.all(names.map((name) => deleteIndexedDbDatabase(name)));
  } catch {}
};

const clearCacheStorageForLogout = async () => {
  if (typeof caches === "undefined") {
    return;
  }
  try {
    const names = await caches.keys();
    await Promise.all(names.map((name) => caches.delete(name)));
  } catch {}
};

const waitFor = (ms: number): Promise<void> => {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
};

const clearCriticalClientPersistenceForLogout = () => {
  try {
    storage.signOut();
  } catch {}
  try {
    clearLocalStorageForLogout();
  } catch {}
  try {
    clearSessionStorageForLogout();
  } catch {}
  try {
    localStorage.removeItem(LOGOUT_SYNC_STORAGE_KEY);
  } catch {}
};

const clearClientPersistenceForLogout = async (cleanupMode: LogoutCleanupMode = "fast") => {
  clearCriticalClientPersistenceForLogout();
  const heavyCleanupPromise = Promise.all([
    clearIndexedDbForLogout().catch(() => {}),
    clearCacheStorageForLogout().catch(() => {}),
  ]);
  const preReloadBudgetMs = cleanupMode === "thorough" ? THOROUGH_PRE_RELOAD_CLEANUP_MS : FAST_PRE_RELOAD_CLEANUP_MS;
  // Keep reload snappy by bounding pre-reload cleanup time.
  await Promise.race([heavyCleanupPromise, waitFor(preReloadBudgetMs)]);
};

const reloadAfterLogout = () => {
  window.location.reload();
  // Safari can occasionally ignore reload() when called from async cleanup chains.
  // If unload has not started shortly after, force same-url navigation.
  window.setTimeout(() => {
    try {
      window.location.replace(window.location.href);
    } catch {}
  }, SAFARI_RELOAD_FALLBACK_DELAY_MS);
};

const handleLogoutSignal = (signal: LogoutSignal) => {
  if (!signal.id || signal.id === lastHandledSignalId || isHandlingSignal) {
    return;
  }
  isHandlingSignal = true;
  lastHandledSignalId = signal.id;
  void clearClientPersistenceForLogout(signal.cleanupMode ?? "fast").finally(() => {
    try {
      reloadAfterLogout();
    } finally {
      // If navigation fails, allow later logout signals to retry cleanup/reload.
      isHandlingSignal = false;
    }
  });
};

const handleSignInSignal = (signal: SignInSignal) => {
  if (!signal.id || signal.tabId === tabId || signal.id === lastHandledSignInSignalId) {
    return;
  }
  lastHandledSignInSignalId = signal.id;
  reloadAfterLogout();
};

const getLogoutBroadcastChannel = (): BroadcastChannel | null => {
  if (logoutBroadcastChannel) {
    return logoutBroadcastChannel;
  }
  if (typeof BroadcastChannel === "undefined") {
    return null;
  }
  logoutBroadcastChannel = new BroadcastChannel(LOGOUT_SYNC_CHANNEL);
  return logoutBroadcastChannel;
};

const getSignInBroadcastChannel = (): BroadcastChannel | null => {
  if (signInBroadcastChannel) {
    return signInBroadcastChannel;
  }
  if (typeof BroadcastChannel === "undefined") {
    return null;
  }
  signInBroadcastChannel = new BroadcastChannel(SIGN_IN_SYNC_CHANNEL);
  return signInBroadcastChannel;
};

const broadcastLogoutSignal = (signalId: string, cleanupMode: LogoutCleanupMode) => {
  const payload = serializeLogoutSignal({ id: signalId, cleanupMode });
  try {
    localStorage.setItem(LOGOUT_SYNC_STORAGE_KEY, payload);
  } catch {}
  const channel = getLogoutBroadcastChannel();
  if (channel) {
    try {
      channel.postMessage(payload);
    } catch {}
  }
};

const broadcastSignInSignal = (signal: SignInSignal) => {
  const payload = serializeSignInSignal(signal);
  try {
    localStorage.setItem(SIGN_IN_SYNC_STORAGE_KEY, payload);
  } catch {}
  const channel = getSignInBroadcastChannel();
  if (channel) {
    try {
      channel.postMessage(payload);
    } catch {}
  }
};

export const installLogoutSync = () => {
  if (didInstallListeners) {
    return;
  }
  didInstallListeners = true;

  window.addEventListener("storage", (event) => {
    if (!event.newValue) {
      return;
    }
    if (event.key === LOGOUT_SYNC_STORAGE_KEY) {
      const signal = parseLogoutSignal(event.newValue);
      if (!signal) {
        return;
      }
      handleLogoutSignal(signal);
      return;
    }
    if (event.key === SIGN_IN_SYNC_STORAGE_KEY) {
      const signal = parseSignInSignal(event.newValue);
      if (!signal) {
        return;
      }
      handleSignInSignal(signal);
    }
  });

  const logoutChannel = getLogoutBroadcastChannel();
  if (logoutChannel) {
    logoutChannel.onmessage = (event: MessageEvent) => {
      const signal = parseLogoutSignal(event.data);
      if (!signal) {
        return;
      }
      handleLogoutSignal(signal);
    };
  }
  const signInChannel = getSignInBroadcastChannel();
  if (signInChannel) {
    signInChannel.onmessage = (event: MessageEvent) => {
      const signal = parseSignInSignal(event.data);
      if (!signal) {
        return;
      }
      handleSignInSignal(signal);
    };
  }
};

export const performLogoutCleanupAndReload = async (options?: { cleanupMode?: LogoutCleanupMode }) => {
  const cleanupMode = options?.cleanupMode ?? "fast";
  const signalId = createSignalId();
  lastHandledSignalId = signalId;
  broadcastLogoutSignal(signalId, cleanupMode);
  try {
    await clearClientPersistenceForLogout(cleanupMode);
  } finally {
    reloadAfterLogout();
  }
};

export const notifyOtherTabsAboutSignIn = (profileId: string, loginId: string) => {
  if (!profileId || !loginId) {
    return;
  }
  const signal: SignInSignal = {
    id: createSignalId(),
    tabId,
    profileId,
    loginId,
  };
  lastHandledSignInSignalId = signal.id;
  broadcastSignInSignal(signal);
};
