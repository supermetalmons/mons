declare global {
  interface Window {
    AppleID?: any;
  }
}

let appleScriptPromise: Promise<void> | null = null;

const APPLE_SCRIPT_SRC = "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";
const APPLE_CLIENT_ID = "link.mons";
const APPLE_REDIRECT_URI = "https://mons.link";
const APPLE_PENDING_INTENTS_STORAGE_KEY = "appleIntentByStateV1";
const APPLE_PENDING_INTENT_MAX_ITEMS = 20;
const APPLE_PENDING_INTENT_MAX_AGE_MS = 15 * 60 * 1000;

type ApplePendingIntentRecord = {
  state: string;
  intentId: string;
  consentSource: string;
  createdAtMs: number;
  expiresAtMs: number;
};

type AppleRedirectResult = {
  idToken: string;
  intentId: string;
  consentSource: string;
};

let pendingAppleRedirectResult: AppleRedirectResult | null = null;

const loadAppleScript = async (): Promise<void> => {
  if (typeof window === "undefined") {
    throw new Error("Apple sign in is unavailable in this environment");
  }
  if (window.AppleID && window.AppleID.auth) {
    return;
  }
  if (!appleScriptPromise) {
    appleScriptPromise = new Promise<void>((resolve, reject) => {
      const existingScript = document.querySelector(`script[src="${APPLE_SCRIPT_SRC}"]`) as HTMLScriptElement | null;
      if (existingScript) {
        const didLoad = existingScript.getAttribute("data-loaded") === "true";
        const didFail = existingScript.getAttribute("data-load-failed") === "true";
        const readyState = (existingScript as any).readyState;
        if (didLoad && (!window.AppleID || !window.AppleID.auth)) {
          existingScript.remove();
        } else if (didLoad || (window.AppleID && window.AppleID.auth)) {
          resolve();
          return;
        }
        if (didFail || readyState === "complete") {
          existingScript.remove();
        } else {
          existingScript.addEventListener(
            "load",
            () => {
              existingScript.setAttribute("data-loaded", "true");
              existingScript.removeAttribute("data-load-failed");
              resolve();
            },
            { once: true }
          );
          existingScript.addEventListener(
            "error",
            () => {
              existingScript.setAttribute("data-load-failed", "true");
              reject(new Error("Failed to load Apple auth script"));
            },
            { once: true }
          );
          return;
        }
      }
      const script = document.createElement("script");
      script.src = APPLE_SCRIPT_SRC;
      script.async = true;
      script.onload = () => {
        script.setAttribute("data-loaded", "true");
        script.removeAttribute("data-load-failed");
        resolve();
      };
      script.onerror = () => {
        script.setAttribute("data-load-failed", "true");
        reject(new Error("Failed to load Apple auth script"));
      };
      document.head.appendChild(script);
    });
  }
  try {
    await appleScriptPromise;
  } catch (error) {
    appleScriptPromise = null;
    throw error;
  }
  if (!window.AppleID || !window.AppleID.auth) {
    const scripts = document.querySelectorAll(`script[src="${APPLE_SCRIPT_SRC}"]`);
    scripts.forEach((script) => script.remove());
    appleScriptPromise = null;
    throw new Error("Apple auth library unavailable");
  }
};

export async function preloadAppleSignInLibrary(): Promise<void> {
  await loadAppleScript();
}

const getAppleClientId = (): string => {
  return APPLE_CLIENT_ID;
};

const getAppleRedirectUri = (): string => {
  return APPLE_REDIRECT_URI;
};

const getPendingAppleIntentStores = (): Storage[] => {
  if (typeof window === "undefined") {
    return [];
  }
  const stores: Storage[] = [];
  try {
    if (window.sessionStorage) {
      stores.push(window.sessionStorage);
    }
  } catch {}
  try {
    if (window.localStorage) {
      stores.push(window.localStorage);
    }
  } catch {}
  return stores;
};

const parsePendingAppleIntentRecordsFromStorage = (store: Storage): ApplePendingIntentRecord[] => {
  try {
    const raw = store.getItem(APPLE_PENDING_INTENTS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    const nowMs = Date.now();
    return parsed
      .map((item) => {
        const state = typeof item?.state === "string" ? item.state : "";
        const intentId = typeof item?.intentId === "string" ? item.intentId : "";
        const consentSource = typeof item?.consentSource === "string" ? item.consentSource : "signin";
        const createdAtMs = typeof item?.createdAtMs === "number" ? item.createdAtMs : Number(item?.createdAtMs);
        const expiresAtMs = typeof item?.expiresAtMs === "number" ? item.expiresAtMs : Number(item?.expiresAtMs);
        if (!state || !intentId || !Number.isFinite(createdAtMs) || !Number.isFinite(expiresAtMs)) {
          return null;
        }
        if (nowMs - createdAtMs > APPLE_PENDING_INTENT_MAX_AGE_MS) {
          return null;
        }
        if (expiresAtMs <= nowMs) {
          return null;
        }
        return {
          state,
          intentId,
          consentSource,
          createdAtMs: Math.floor(createdAtMs),
          expiresAtMs: Math.floor(expiresAtMs),
        };
      })
      .filter((record): record is ApplePendingIntentRecord => !!record);
  } catch {
    return [];
  }
};

const normalizePendingAppleIntentRecords = (records: ApplePendingIntentRecord[]): ApplePendingIntentRecord[] => {
  const nowMs = Date.now();
  const byState = new Map<string, ApplePendingIntentRecord>();
  records.forEach((record) => {
    if (!record.state || !record.intentId) {
      return;
    }
    if (record.expiresAtMs <= nowMs || nowMs - record.createdAtMs > APPLE_PENDING_INTENT_MAX_AGE_MS) {
      return;
    }
    const existing = byState.get(record.state);
    if (!existing || record.createdAtMs >= existing.createdAtMs) {
      byState.set(record.state, record);
    }
  });
  return Array.from(byState.values())
    .sort((left, right) => left.createdAtMs - right.createdAtMs)
    .slice(-APPLE_PENDING_INTENT_MAX_ITEMS);
};

const readPendingAppleIntentRecords = (): ApplePendingIntentRecord[] => {
  const stores = getPendingAppleIntentStores();
  if (stores.length === 0) {
    return [];
  }
  const combined = stores.flatMap((store) => parsePendingAppleIntentRecordsFromStorage(store));
  const normalized = normalizePendingAppleIntentRecords(combined);
  writePendingAppleIntentRecords(normalized);
  return normalized;
};

const writePendingAppleIntentRecords = (records: ApplePendingIntentRecord[]): void => {
  const stores = getPendingAppleIntentStores();
  if (stores.length === 0) {
    return;
  }
  const normalized = normalizePendingAppleIntentRecords(records);
  stores.forEach((store) => {
    try {
      if (normalized.length === 0) {
        store.removeItem(APPLE_PENDING_INTENTS_STORAGE_KEY);
      } else {
        store.setItem(APPLE_PENDING_INTENTS_STORAGE_KEY, JSON.stringify(normalized));
      }
    } catch {}
  });
};

const storePendingAppleIntentRecord = (record: ApplePendingIntentRecord): void => {
  const nowMs = Date.now();
  const deduped = readPendingAppleIntentRecords().filter((item) => item.state !== record.state);
  deduped.push(record);
  const next = deduped
    .filter((item) => item.expiresAtMs > nowMs && nowMs - item.createdAtMs <= APPLE_PENDING_INTENT_MAX_AGE_MS)
    .sort((left, right) => left.createdAtMs - right.createdAtMs)
    .slice(-APPLE_PENDING_INTENT_MAX_ITEMS);
  writePendingAppleIntentRecords(next);
};

const takePendingAppleIntentRecord = (state: string): ApplePendingIntentRecord | null => {
  if (!state) {
    return null;
  }
  const records = readPendingAppleIntentRecords();
  const index = records.findIndex((item) => item.state === state);
  if (index === -1) {
    return null;
  }
  const [record] = records.splice(index, 1);
  writePendingAppleIntentRecords(records);
  if (!record) {
    return null;
  }
  if (record.expiresAtMs <= Date.now()) {
    return null;
  }
  return record;
};

const shouldUseRedirectFlow = (): boolean => {
  if (typeof window === "undefined") {
    return false;
  }
  const ua = window.navigator.userAgent || "";
  const platform = window.navigator.platform || "";
  const maxTouchPoints = Number.isFinite(window.navigator.maxTouchPoints) ? window.navigator.maxTouchPoints : 0;
  return /iP(hone|ad|od)/.test(ua) || (platform === "MacIntel" && maxTouchPoints > 1);
};

const clearAppleCallbackHash = (): void => {
  if (typeof window === "undefined") {
    return;
  }
  if (!window.location.hash) {
    return;
  }
  const cleanUrl = `${window.location.pathname}${window.location.search}`;
  window.history.replaceState({}, document.title, cleanUrl);
};

export const consumeAppleRedirectResult = (): AppleRedirectResult | null => {
  if (typeof window === "undefined") {
    return null;
  }
  if (pendingAppleRedirectResult) {
    return pendingAppleRedirectResult;
  }
  const hashRaw = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  if (!hashRaw) {
    return null;
  }
  const params = new URLSearchParams(hashRaw);
  const state = (params.get("state") || "").trim();
  const idToken = (params.get("id_token") || "").trim();
  const error = (params.get("error") || "").trim();
  const errorDescription = (params.get("error_description") || "").trim();
  const looksLikeAppleResponse = idToken !== "" || error !== "";
  if (!looksLikeAppleResponse) {
    return null;
  }
  clearAppleCallbackHash();
  if (!state) {
    throw new Error("Apple sign in returned without state. Please try again.");
  }
  const pending = takePendingAppleIntentRecord(state);
  if (error) {
    const details = errorDescription ? ` (${errorDescription})` : "";
    throw new Error(`Apple sign in failed: ${error}${details}`);
  }
  if (!pending) {
    throw new Error("Apple sign in session expired. Please try again.");
  }
  if (!idToken) {
    throw new Error("Apple sign in did not return id_token.");
  }
  pendingAppleRedirectResult = {
    idToken,
    intentId: pending.intentId,
    consentSource: pending.consentSource,
  };
  return pendingAppleRedirectResult;
};

export const clearConsumedAppleRedirectResult = (): void => {
  pendingAppleRedirectResult = null;
};

export async function signInWithApplePopup({
  nonce,
  state,
  intentId,
  expiresAtMs,
  consentSource,
}: {
  nonce: string;
  state: string;
  intentId: string;
  expiresAtMs: number;
  consentSource: string;
}): Promise<{ idToken: string } | null> {
  await loadAppleScript();
  const clientId = getAppleClientId();
  const redirectURI = getAppleRedirectUri();

  storePendingAppleIntentRecord({
    state,
    intentId,
    consentSource,
    createdAtMs: Date.now(),
    expiresAtMs: Number.isFinite(expiresAtMs) ? Math.floor(expiresAtMs) : Date.now() + APPLE_PENDING_INTENT_MAX_AGE_MS,
  });

  const useRedirect = shouldUseRedirectFlow();

  window.AppleID.auth.init({
    clientId,
    scope: "name email",
    redirectURI,
    state,
    nonce,
    usePopup: !useRedirect,
    ...(useRedirect
      ? {
          responseType: "id_token",
          responseMode: "fragment",
        }
      : {}),
  });

  if (useRedirect) {
    await window.AppleID.auth.signIn();
    return null;
  }

  const response = await window.AppleID.auth.signIn();
  const authorization = response && response.authorization ? response.authorization : null;
  const idToken = authorization && typeof authorization.id_token === "string" ? authorization.id_token : "";
  const responseStateFromAuthorization = authorization && typeof authorization.state === "string" ? authorization.state : "";
  const responseStateFromRoot = response && typeof response.state === "string" ? response.state : "";
  const stateCandidates = [responseStateFromAuthorization, responseStateFromRoot].filter((value) => value !== "");
  const hasMatchingState = stateCandidates.includes(state);
  if (!idToken) {
    throw new Error("Apple sign in did not return id_token");
  }
  if (!hasMatchingState) {
    throw new Error("Apple sign in state mismatch");
  }
  takePendingAppleIntentRecord(state);
  return { idToken };
}
