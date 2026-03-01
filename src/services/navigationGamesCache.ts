import { NavigationGameItem, NavigationGameStatus } from "../connection/connectionModels";

type NavigationGamesScopeKind = "profile" | "login";

export interface NavigationGamesCacheScope {
  kind: NavigationGamesScopeKind;
  scopeId: string;
  scopeKey: string;
}

interface NavigationGamesRuntimeEntry {
  topGames: NavigationGameItem[];
  pagedGames: NavigationGameItem[];
}

interface PersistedTopGamesPayload {
  version: number;
  updatedAtMs: number;
  topGames: NavigationGameItem[];
}

export interface NavigationGamesCacheSnapshot {
  topGames: NavigationGameItem[];
  pagedGames: NavigationGameItem[];
}

export const NAVIGATION_GAMES_PERSISTED_TOP_CACHE_TTL_MS = 365 * 24 * 60 * 60 * 1000;
const NAVIGATION_GAMES_PERSISTED_TOP_CACHE_VERSION = 1;
const NAVIGATION_GAMES_PERSISTED_TOP_CACHE_KEY_PREFIX = "navigationGamesTopCache:v1:";
const NAVIGATION_GAMES_MAX_RUNTIME_ITEMS_PER_SECTION = 500;

const runtimeCacheByScope = new Map<string, NavigationGamesRuntimeEntry>();

const NAVIGATION_GAME_STATUS_VALUES: NavigationGameStatus[] = ["pending", "waiting", "active", "ended"];

const isNavigationGameStatus = (value: unknown): value is NavigationGameStatus => {
  return typeof value === "string" && NAVIGATION_GAME_STATUS_VALUES.includes(value as NavigationGameStatus);
};

const getNormalizedStringOrNull = (value: unknown): string | null => {
  return typeof value === "string" ? value : null;
};

const getNormalizedNumberOrNull = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.floor(value);
  }
  return null;
};

const getNormalizedBooleanOrUndefined = (value: unknown): boolean | undefined => {
  if (typeof value === "boolean") {
    return value;
  }
  return undefined;
};

const sanitizeNavigationGameItem = (value: unknown): NavigationGameItem | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const inviteId = typeof raw.inviteId === "string" ? raw.inviteId : "";
  if (inviteId === "") {
    return null;
  }

  const kind = raw.kind === "auto" || raw.kind === "direct" ? raw.kind : null;
  if (!kind) {
    return null;
  }

  const status = isNavigationGameStatus(raw.status) ? raw.status : null;
  if (!status) {
    return null;
  }

  const sortBucket = typeof raw.sortBucket === "number" && Number.isFinite(raw.sortBucket) ? Math.floor(raw.sortBucket) : 0;
  const listSortAtMs = typeof raw.listSortAtMs === "number" && Number.isFinite(raw.listSortAtMs) ? Math.floor(raw.listSortAtMs) : 0;
  const opponentEmoji = getNormalizedNumberOrNull(raw.opponentEmoji);
  const rawAutomatchHint = raw.automatchStateHint;
  const automatchStateHint = rawAutomatchHint === "pending" || rawAutomatchHint === "matched" || rawAutomatchHint === "canceled" ? rawAutomatchHint : null;

  return {
    inviteId,
    kind,
    status,
    sortBucket,
    listSortAtMs,
    hostLoginId: getNormalizedStringOrNull(raw.hostLoginId),
    guestLoginId: getNormalizedStringOrNull(raw.guestLoginId),
    opponentProfileId: getNormalizedStringOrNull(raw.opponentProfileId),
    opponentName: getNormalizedStringOrNull(raw.opponentName),
    opponentEmoji,
    automatchStateHint,
    isPendingAutomatch: typeof raw.isPendingAutomatch === "boolean" ? raw.isPendingAutomatch : status === "pending",
    isFallback: getNormalizedBooleanOrUndefined(raw.isFallback),
    isOptimistic: getNormalizedBooleanOrUndefined(raw.isOptimistic),
  };
};

const sanitizeNavigationGames = (games: unknown, options?: { maxItems?: number; excludeOptimistic?: boolean }): NavigationGameItem[] => {
  if (!Array.isArray(games)) {
    return [];
  }
  const maxItems = options?.maxItems ?? Number.MAX_SAFE_INTEGER;
  const excludeOptimistic = options?.excludeOptimistic ?? false;
  const uniqueByInviteId = new Map<string, NavigationGameItem>();

  for (const item of games) {
    const normalizedItem = sanitizeNavigationGameItem(item);
    if (!normalizedItem) {
      continue;
    }
    if (excludeOptimistic && normalizedItem.isOptimistic) {
      continue;
    }
    if (!uniqueByInviteId.has(normalizedItem.inviteId)) {
      uniqueByInviteId.set(normalizedItem.inviteId, normalizedItem);
    }
    if (uniqueByInviteId.size >= maxItems) {
      break;
    }
  }

  return Array.from(uniqueByInviteId.values());
};

const getPersistedTopCacheStorageKey = (scope: NavigationGamesCacheScope): string => {
  return `${NAVIGATION_GAMES_PERSISTED_TOP_CACHE_KEY_PREFIX}${scope.scopeKey}`;
};

export const resolveNavigationGamesCacheScope = (profileId: string, loginId: string): NavigationGamesCacheScope | null => {
  if (typeof profileId === "string" && profileId !== "") {
    return {
      kind: "profile",
      scopeId: profileId,
      scopeKey: `profile:${profileId}`,
    };
  }

  if (typeof loginId === "string" && loginId !== "") {
    return {
      kind: "login",
      scopeId: loginId,
      scopeKey: `login:${loginId}`,
    };
  }

  return null;
};

const readPersistedTopCache = (scope: NavigationGamesCacheScope): NavigationGameItem[] => {
  const storageKey = getPersistedTopCacheStorageKey(scope);
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as PersistedTopGamesPayload;
    if (!parsed || typeof parsed !== "object") {
      localStorage.removeItem(storageKey);
      return [];
    }

    if (parsed.version !== NAVIGATION_GAMES_PERSISTED_TOP_CACHE_VERSION) {
      localStorage.removeItem(storageKey);
      return [];
    }

    const updatedAtMs = typeof parsed.updatedAtMs === "number" && Number.isFinite(parsed.updatedAtMs) ? Math.floor(parsed.updatedAtMs) : 0;
    if (updatedAtMs <= 0 || Date.now() - updatedAtMs > NAVIGATION_GAMES_PERSISTED_TOP_CACHE_TTL_MS) {
      localStorage.removeItem(storageKey);
      return [];
    }

    return sanitizeNavigationGames(parsed.topGames, {
      maxItems: Number.MAX_SAFE_INTEGER,
      excludeOptimistic: true,
    });
  } catch {
    try {
      localStorage.removeItem(storageKey);
    } catch {}
    return [];
  }
};

export const readNavigationGamesCacheSnapshot = (scope: NavigationGamesCacheScope | null): NavigationGamesCacheSnapshot => {
  if (!scope) {
    return {
      topGames: [],
      pagedGames: [],
    };
  }

  const runtimeEntry = runtimeCacheByScope.get(scope.scopeKey);
  if (runtimeEntry) {
    return {
      topGames: runtimeEntry.topGames.slice(),
      pagedGames: runtimeEntry.pagedGames.slice(),
    };
  }

  return {
    topGames: readPersistedTopCache(scope),
    pagedGames: [],
  };
};

export const writeNavigationGamesRuntimeCache = (
  scope: NavigationGamesCacheScope | null,
  topGames: NavigationGameItem[],
  pagedGames: NavigationGameItem[]
): void => {
  if (!scope) {
    return;
  }
  runtimeCacheByScope.set(scope.scopeKey, {
    topGames: sanitizeNavigationGames(topGames, { maxItems: NAVIGATION_GAMES_MAX_RUNTIME_ITEMS_PER_SECTION }),
    pagedGames: sanitizeNavigationGames(pagedGames, { maxItems: NAVIGATION_GAMES_MAX_RUNTIME_ITEMS_PER_SECTION }),
  });
};

export const writeNavigationGamesPersistedTopCache = (scope: NavigationGamesCacheScope | null, topGames: NavigationGameItem[], maxItems: number): void => {
  if (!scope) {
    return;
  }

  const boundedMaxItems = Number.isFinite(maxItems) && maxItems > 0 ? Math.floor(maxItems) : 80;
  const payload: PersistedTopGamesPayload = {
    version: NAVIGATION_GAMES_PERSISTED_TOP_CACHE_VERSION,
    updatedAtMs: Date.now(),
    topGames: sanitizeNavigationGames(topGames, {
      maxItems: boundedMaxItems,
      excludeOptimistic: true,
    }),
  };

  try {
    localStorage.setItem(getPersistedTopCacheStorageKey(scope), JSON.stringify(payload));
  } catch {}
};

export const clearNavigationGamesRuntimeCacheScope = (scopeKey: string): void => {
  if (scopeKey === "") {
    return;
  }
  runtimeCacheByScope.delete(scopeKey);
};
