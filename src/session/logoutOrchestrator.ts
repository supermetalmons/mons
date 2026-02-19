import { storage } from "../utils/storage";

const LOGOUT_SYNC_CHANNEL = "mons-link-logout-sync";
const LOGOUT_SYNC_STORAGE_KEY = "__mons_link_logout_sync__";

type LogoutSignal = {
  id: string;
};

type IndexedDbFactoryWithDatabases = IDBFactory & {
  databases?: () => Promise<Array<{ name?: string }>>;
};

let broadcastChannel: BroadcastChannel | null = null;
let didInstallListeners = false;
let lastHandledSignalId = "";
let isHandlingSignal = false;

const createSignalId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
};

const serializeLogoutSignal = (signal: LogoutSignal): string => {
  return JSON.stringify(signal);
};

const parseLogoutSignal = (value: unknown): LogoutSignal | null => {
  if (typeof value !== "string" || value === "") {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as { id?: unknown } | null;
    if (!parsed || typeof parsed.id !== "string" || parsed.id === "") {
      return null;
    }
    return { id: parsed.id };
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

const clearClientPersistenceForLogout = async () => {
  try {
    storage.signOut();
  } catch {}
  try {
    clearLocalStorageForLogout();
  } catch {}
  try {
    clearSessionStorageForLogout();
  } catch {}
  await Promise.all([
    clearIndexedDbForLogout().catch(() => {}),
    clearCacheStorageForLogout().catch(() => {}),
  ]);
  try {
    localStorage.removeItem(LOGOUT_SYNC_STORAGE_KEY);
  } catch {}
};

const reloadAfterLogout = () => {
  window.location.reload();
};

const handleLogoutSignal = (signalId: string) => {
  if (!signalId || signalId === lastHandledSignalId || isHandlingSignal) {
    return;
  }
  isHandlingSignal = true;
  lastHandledSignalId = signalId;
  void clearClientPersistenceForLogout().finally(() => {
    reloadAfterLogout();
  });
};

const getBroadcastChannel = (): BroadcastChannel | null => {
  if (broadcastChannel) {
    return broadcastChannel;
  }
  if (typeof BroadcastChannel === "undefined") {
    return null;
  }
  broadcastChannel = new BroadcastChannel(LOGOUT_SYNC_CHANNEL);
  return broadcastChannel;
};

const broadcastLogoutSignal = (signalId: string) => {
  const payload = serializeLogoutSignal({ id: signalId });
  try {
    localStorage.setItem(LOGOUT_SYNC_STORAGE_KEY, payload);
  } catch {}
  const channel = getBroadcastChannel();
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
    if (event.key !== LOGOUT_SYNC_STORAGE_KEY || !event.newValue) {
      return;
    }
    const signal = parseLogoutSignal(event.newValue);
    if (!signal) {
      return;
    }
    handleLogoutSignal(signal.id);
  });

  const channel = getBroadcastChannel();
  if (channel) {
    channel.onmessage = (event: MessageEvent) => {
      const signal = parseLogoutSignal(event.data);
      if (!signal) {
        return;
      }
      handleLogoutSignal(signal.id);
    };
  }
};

export const performLogoutCleanupAndReload = async () => {
  const signalId = createSignalId();
  lastHandledSignalId = signalId;
  broadcastLogoutSignal(signalId);
  try {
    await clearClientPersistenceForLogout();
  } finally {
    reloadAfterLogout();
  }
};
