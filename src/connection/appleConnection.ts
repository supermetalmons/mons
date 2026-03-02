declare global {
  interface Window {
    AppleID?: any;
  }
}

let appleScriptPromise: Promise<void> | null = null;

const APPLE_SCRIPT_SRC = "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";
const APPLE_CLIENT_ID = (process.env.REACT_APP_APPLE_CLIENT_ID || "link.mons").trim();
const APPLE_REDIRECT_URI = (process.env.REACT_APP_APPLE_REDIRECT_URI || "").trim();
const APPLE_PENDING_INTENTS_STORAGE_KEY = "appleIntentByStateV1";
const APPLE_PENDING_INTENT_MAX_ITEMS = 20;
const APPLE_PENDING_INTENT_MAX_AGE_MS = 15 * 60 * 1000;
const APPLE_DEFAULT_REDIRECT_URI = "https://mons.link";
const APPLE_STATE_ENVELOPE_PREFIX = "apple.v1.";
const APPLE_CALLBACK_PARAM_KEYS = ["state", "id_token", "error", "error_description", "code", "user"] as const;

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

type AppleStateEnvelope = {
  stateToken: string;
  intentId: string;
  consentSource: string;
  expiresAtMs: number;
};

type AppleCallbackParams = {
  state: string;
  idToken: string;
  error: string;
  errorDescription: string;
  code: string;
};

let pendingAppleRedirectResult: AppleRedirectResult | null = null;
let didConsumeInitialAppleCallbackSnapshot = false;

const initialAppleCallbackSnapshot =
  typeof window === "undefined"
    ? null
    : {
        hashRaw: window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash,
        searchRaw: window.location.search.startsWith("?") ? window.location.search.slice(1) : window.location.search,
      };

const logAppleRedirectDebug = (event: string, payload: Record<string, unknown> = {}): void => {
  try {
    console.log("apple-redirect-debug", { event, ...payload });
  } catch {}
};

const encodeStatePart = (value: string): string => {
  if (!value) {
    return "";
  }
  try {
    return encodeURIComponent(value);
  } catch {
    return "";
  }
};

const decodeStatePart = (value: string): string => {
  if (!value) {
    return "";
  }
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
};

const buildAppleStateEnvelope = (record: ApplePendingIntentRecord): string => {
  const stateTokenPart = encodeStatePart(record.state);
  const intentIdPart = encodeStatePart(record.intentId);
  const consentSourcePart = encodeStatePart(record.consentSource || "signin");
  const expiresAtMsPart = Number.isFinite(record.expiresAtMs) ? Math.floor(record.expiresAtMs).toString(36) : "";
  if (!stateTokenPart || !intentIdPart || !consentSourcePart || !expiresAtMsPart) {
    return record.state;
  }
  // Keep state compact to avoid provider-side truncation on redirect flows.
  return `${APPLE_STATE_ENVELOPE_PREFIX}${stateTokenPart}.${intentIdPart}.${expiresAtMsPart}.${consentSourcePart}`;
};

const decodeBase64Url = (value: string): string => {
  if (typeof window === "undefined" || typeof window.atob !== "function") {
    return "";
  }
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  try {
    return window.atob(normalized + padding);
  } catch {
    return "";
  }
};

const parseCompactAppleStateEnvelope = (payloadRaw: string): AppleStateEnvelope | null => {
  const parts = payloadRaw.split(".");
  if (parts.length < 4) {
    return null;
  }
  const [stateTokenRaw, intentIdRaw, expiresAtMsRaw, ...consentSourceParts] = parts;
  const stateToken = decodeStatePart(stateTokenRaw || "");
  const intentId = decodeStatePart(intentIdRaw || "");
  const consentSource = decodeStatePart(consentSourceParts.join(".")) || "signin";
  const expiresAtMs = Number.parseInt(expiresAtMsRaw || "", 36);
  if (!stateToken || !intentId || !Number.isFinite(expiresAtMs)) {
    return null;
  }
  return {
    stateToken,
    intentId,
    consentSource,
    expiresAtMs: Math.floor(expiresAtMs),
  };
};

const parseLegacyAppleStateEnvelope = (payloadRaw: string): AppleStateEnvelope | null => {
  const decoded = decodeBase64Url(payloadRaw);
  if (!decoded) {
    return null;
  }
  try {
    const parsed = JSON.parse(decoded);
    const stateToken = typeof parsed?.state === "string" ? parsed.state : "";
    const intentId = typeof parsed?.intentId === "string" ? parsed.intentId : "";
    const consentSource = typeof parsed?.consentSource === "string" ? parsed.consentSource : "signin";
    const expiresAtMs = typeof parsed?.expiresAtMs === "number" ? parsed.expiresAtMs : Number(parsed?.expiresAtMs);
    if (!stateToken || !intentId || !Number.isFinite(expiresAtMs)) {
      return null;
    }
    return {
      stateToken,
      intentId,
      consentSource,
      expiresAtMs: Math.floor(expiresAtMs),
    };
  } catch {
    return null;
  }
};

const parseAppleStateEnvelope = (state: string): AppleStateEnvelope | null => {
  if (!state || !state.startsWith(APPLE_STATE_ENVELOPE_PREFIX)) {
    return null;
  }
  const payloadRaw = state.slice(APPLE_STATE_ENVELOPE_PREFIX.length);
  if (!payloadRaw) {
    return null;
  }
  return parseCompactAppleStateEnvelope(payloadRaw) || parseLegacyAppleStateEnvelope(payloadRaw);
};

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

const getAppleRedirectUri = (isRedirectFlow: boolean): string => {
  if (APPLE_REDIRECT_URI !== "") {
    return APPLE_REDIRECT_URI;
  }
  if (isRedirectFlow && typeof window !== "undefined" && window.location && window.location.origin) {
    try {
      const originUrl = new URL(window.location.origin);
      const hostname = (originUrl.hostname || "").toLowerCase();
      const isHttps = originUrl.protocol === "https:";
      const isMonsHost = hostname === "mons.link" || hostname.endsWith(".mons.link");
      if (isHttps && isMonsHost) {
        return originUrl.origin;
      }
    } catch {}
  }
  return APPLE_DEFAULT_REDIRECT_URI;
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

const hasPendingAppleIntentRecord = (state: string): boolean => {
  if (!state) {
    return false;
  }
  return readPendingAppleIntentRecords().some((item) => item.state === state);
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

const parseAppleCallbackParamsFromRaw = (raw: string): AppleCallbackParams | null => {
  if (!raw) {
    return null;
  }
  const params = new URLSearchParams(raw);
  const state = (params.get("state") || "").trim();
  const idToken = (params.get("id_token") || "").trim();
  const error = (params.get("error") || "").trim();
  const errorDescription = (params.get("error_description") || "").trim();
  const code = (params.get("code") || "").trim();
  const hasState = state !== "";
  const hasKnownAppleState = state.startsWith(APPLE_STATE_ENVELOPE_PREFIX) || hasPendingAppleIntentRecord(state);
  const hasCodeForKnownAppleState = code !== "" && hasKnownAppleState;
  const hasUserForKnownAppleState = params.has("user") && hasKnownAppleState;
  const hasAppleSignal = hasState && (idToken !== "" || error !== "" || hasCodeForKnownAppleState || hasUserForKnownAppleState);
  if (!hasAppleSignal) {
    return null;
  }
  return {
    state,
    idToken,
    error,
    errorDescription,
    code,
  };
};

const readAppleCallbackParams = (): AppleCallbackParams | null => {
  if (typeof window === "undefined") {
    return null;
  }
  const hashRaw = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  const fromHash = parseAppleCallbackParamsFromRaw(hashRaw);
  if (fromHash) {
    return fromHash;
  }
  const searchRaw = window.location.search.startsWith("?") ? window.location.search.slice(1) : window.location.search;
  const fromSearch = parseAppleCallbackParamsFromRaw(searchRaw);
  if (fromSearch) {
    return fromSearch;
  }
  if (!didConsumeInitialAppleCallbackSnapshot && initialAppleCallbackSnapshot) {
    const fromInitialHash = parseAppleCallbackParamsFromRaw(initialAppleCallbackSnapshot.hashRaw);
    if (fromInitialHash) {
      didConsumeInitialAppleCallbackSnapshot = true;
      return fromInitialHash;
    }
    const fromInitialSearch = parseAppleCallbackParamsFromRaw(initialAppleCallbackSnapshot.searchRaw);
    if (fromInitialSearch) {
      didConsumeInitialAppleCallbackSnapshot = true;
      return fromInitialSearch;
    }
  }
  return null;
};

const clearAppleCallbackParams = (): void => {
  if (typeof window === "undefined") {
    return;
  }
  const currentUrl = new URL(window.location.href);
  let didChange = false;
  APPLE_CALLBACK_PARAM_KEYS.forEach((key) => {
    if (currentUrl.searchParams.has(key)) {
      didChange = true;
      currentUrl.searchParams.delete(key);
    }
  });

  if (currentUrl.hash) {
    const hashRaw = currentUrl.hash.startsWith("#") ? currentUrl.hash.slice(1) : currentUrl.hash;
    const hashParams = new URLSearchParams(hashRaw);
    let hashChanged = false;
    APPLE_CALLBACK_PARAM_KEYS.forEach((key) => {
      if (hashParams.has(key)) {
        hashChanged = true;
        hashParams.delete(key);
      }
    });
    if (hashChanged) {
      didChange = true;
      const nextHash = hashParams.toString();
      currentUrl.hash = nextHash ? `#${nextHash}` : "";
    }
  }

  if (!didChange) {
    return;
  }
  const cleanUrl = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;
  window.history.replaceState({}, document.title, cleanUrl);
};

export const consumeAppleRedirectResult = (): AppleRedirectResult | null => {
  if (typeof window === "undefined") {
    return null;
  }
  if (pendingAppleRedirectResult) {
    return pendingAppleRedirectResult;
  }
  const callback = readAppleCallbackParams();
  if (!callback) {
    logAppleRedirectDebug("callback-missing", {
      hasHash: window.location.hash !== "",
      hasSearch: window.location.search !== "",
    });
    return null;
  }
  clearAppleCallbackParams();
  const { state, idToken, error, errorDescription, code } = callback;
  logAppleRedirectDebug("callback-detected", {
    statePrefix: state.slice(0, APPLE_STATE_ENVELOPE_PREFIX.length),
    stateLength: state.length,
    hasIdToken: idToken !== "",
    hasCode: code !== "",
    hasError: error !== "",
  });
  if (!state) {
    throw new Error("Apple sign in returned without state. Please try again.");
  }
  const pending = takePendingAppleIntentRecord(state);
  const stateEnvelope = parseAppleStateEnvelope(state);
  const resolvedIntentId = pending?.intentId || stateEnvelope?.intentId || "";
  const resolvedConsentSource = pending?.consentSource || stateEnvelope?.consentSource || "signin";
  logAppleRedirectDebug("callback-resolved", {
    hasPending: !!pending,
    hasEnvelope: !!stateEnvelope,
    hasResolvedIntentId: resolvedIntentId !== "",
    resolvedConsentSource,
  });
  if (error) {
    const details = errorDescription ? ` (${errorDescription})` : "";
    throw new Error(`Apple sign in failed: ${error}${details}`);
  }
  if (!resolvedIntentId) {
    throw new Error("Apple sign in session expired. Please try again.");
  }
  if (stateEnvelope && stateEnvelope.expiresAtMs <= Date.now()) {
    throw new Error("Apple sign in session expired. Please try again.");
  }
  if (!idToken) {
    if (code) {
      throw new Error("Apple sign in returned code without id_token.");
    }
    throw new Error("Apple sign in did not return id_token.");
  }
  pendingAppleRedirectResult = {
    idToken,
    intentId: resolvedIntentId,
    consentSource: resolvedConsentSource,
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
  const useRedirect = shouldUseRedirectFlow();
  const clientId = getAppleClientId();
  const redirectURI = getAppleRedirectUri(useRedirect);
  const nowMs = Date.now();
  const pendingRecord: ApplePendingIntentRecord = {
    state,
    intentId,
    consentSource,
    createdAtMs: nowMs,
    expiresAtMs: Number.isFinite(expiresAtMs) ? Math.floor(expiresAtMs) : nowMs + APPLE_PENDING_INTENT_MAX_AGE_MS,
  };
  const resolvedState = useRedirect ? buildAppleStateEnvelope(pendingRecord) : state;
  logAppleRedirectDebug("signin-init", {
    useRedirect,
    redirectURI,
    stateLength: resolvedState.length,
    statePrefix: resolvedState.slice(0, APPLE_STATE_ENVELOPE_PREFIX.length),
  });

  storePendingAppleIntentRecord({
    ...pendingRecord,
    state: resolvedState,
  });
  if (resolvedState !== state) {
    storePendingAppleIntentRecord({
      ...pendingRecord,
      state,
    });
  }

  window.AppleID.auth.init({
    clientId,
    redirectURI,
    state: resolvedState,
    nonce,
    usePopup: !useRedirect,
    responseType: "code id_token",
    responseMode: "fragment",
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
  const hasMatchingState = stateCandidates.includes(resolvedState) || stateCandidates.includes(state);
  if (!idToken) {
    throw new Error("Apple sign in did not return id_token");
  }
  if (!hasMatchingState) {
    throw new Error("Apple sign in state mismatch");
  }
  takePendingAppleIntentRecord(resolvedState);
  if (resolvedState !== state) {
    takePendingAppleIntentRecord(state);
  }
  return { idToken };
}
