import { connection } from "./connection";

declare global {
  interface Window {
    google?: any;
  }
}

let googleScriptPromise: Promise<void> | null = null;
type GoogleSignInRejectReason = "cancelled" | "timeout" | "aborted";
type GoogleSignInErrorCode =
  "google-sign-in-cancelled" |
  "google-sign-in-timeout" |
  "google-sign-in-aborted" |
  "google-sign-in-redirect-started";

type ActiveGoogleSignInHandle = {
  abort: (reason: GoogleSignInRejectReason) => void;
  cleanupDom: () => void;
};

let activeGoogleSignInHandle: ActiveGoogleSignInHandle | null = null;

const GOOGLE_SCRIPT_SRC = "https://accounts.google.com/gsi/client";
const GOOGLE_SIGN_IN_TIMEOUT_MS = 60 * 1000;
const GOOGLE_SCRIPT_LOAD_TIMEOUT_MS = 20 * 1000;
const GOOGLE_SCRIPT_LOAD_MAX_ATTEMPTS = 2;
const GOOGLE_SCRIPT_RETRY_DELAY_MS = 400;
const GOOGLE_CLIENT_ID = "390871694056-dbt5ip4d7b7ehnlfq49cu9b5fe6drhnf.apps.googleusercontent.com";
const GOOGLE_DIALOG_OVERLAY_ID = "google-sign-in-overlay";
const GOOGLE_SCRIPT_SELECTOR = `script[src="${GOOGLE_SCRIPT_SRC}"],script[src^="${GOOGLE_SCRIPT_SRC}?"]`;
const GOOGLE_REDIRECT_PARAM_FLOW = "google_auth_flow";
const GOOGLE_REDIRECT_PARAM_STATUS = "google_auth_status";
const GOOGLE_REDIRECT_PARAM_ERROR = "google_auth_error";
const GOOGLE_REDIRECT_PARAM_CONSENT_SOURCE = "google_auth_consent";
const GOOGLE_REDIRECT_CALLBACK_PARAM_KEYS = [
  GOOGLE_REDIRECT_PARAM_FLOW,
  GOOGLE_REDIRECT_PARAM_STATUS,
  GOOGLE_REDIRECT_PARAM_ERROR,
  GOOGLE_REDIRECT_PARAM_CONSENT_SOURCE,
] as const;

type GoogleRedirectStatus = "ready" | "failed";
type GoogleRedirectResult = {
  flowId: string;
  status: GoogleRedirectStatus;
  errorCode: string;
  consentSource: "signin" | "settings";
};

let pendingGoogleRedirectResult: GoogleRedirectResult | null = null;
let didConsumeInitialGoogleRedirectSnapshot = false;

const initialGoogleRedirectSnapshot =
  typeof window === "undefined"
    ? null
    : {
        hashRaw: window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash,
        searchRaw: window.location.search.startsWith("?") ? window.location.search.slice(1) : window.location.search,
      };

const GOOGLE_SIGN_IN_ERROR_BY_REASON: Record<GoogleSignInRejectReason, { code: GoogleSignInErrorCode; message: string }> = {
  cancelled: {
    code: "google-sign-in-cancelled",
    message: "Google sign in was cancelled.",
  },
  timeout: {
    code: "google-sign-in-timeout",
    message: "Google sign in timed out. Please try again.",
  },
  aborted: {
    code: "google-sign-in-aborted",
    message: "Google sign in was cancelled.",
  },
};

const buildGoogleSignInError = (reason: GoogleSignInRejectReason): Error => {
  const config = GOOGLE_SIGN_IN_ERROR_BY_REASON[reason];
  const error = new Error(config.message);
  (error as Error & { code?: GoogleSignInErrorCode }).code = config.code;
  return error;
};

export const isGoogleSignInCancelledError = (value: unknown): boolean => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const code = (value as { code?: unknown }).code;
  return code === "google-sign-in-cancelled" || code === "google-sign-in-aborted" || code === "google-sign-in-redirect-started";
};

const normalizeGoogleConsentSource = (value: unknown): "signin" | "settings" => {
  return value === "settings" ? "settings" : "signin";
};

const parseGoogleRedirectParamsFromRaw = (raw: string): GoogleRedirectResult | null => {
  if (!raw) {
    return null;
  }
  const params = new URLSearchParams(raw);
  const flowId = (params.get(GOOGLE_REDIRECT_PARAM_FLOW) || "").trim();
  const statusRaw = (params.get(GOOGLE_REDIRECT_PARAM_STATUS) || "").trim().toLowerCase();
  if (!flowId || (statusRaw !== "ready" && statusRaw !== "failed")) {
    return null;
  }
  const status = statusRaw as GoogleRedirectStatus;
  const errorCode = (params.get(GOOGLE_REDIRECT_PARAM_ERROR) || "").trim();
  const consentSource = normalizeGoogleConsentSource(params.get(GOOGLE_REDIRECT_PARAM_CONSENT_SOURCE));
  return {
    flowId,
    status,
    errorCode,
    consentSource,
  };
};

const readGoogleRedirectParams = (): GoogleRedirectResult | null => {
  if (typeof window === "undefined") {
    return null;
  }
  const searchRaw = window.location.search.startsWith("?") ? window.location.search.slice(1) : window.location.search;
  const hashRaw = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  const fromSearch = parseGoogleRedirectParamsFromRaw(searchRaw);
  if (fromSearch) {
    return fromSearch;
  }
  const fromHash = parseGoogleRedirectParamsFromRaw(hashRaw);
  if (fromHash) {
    return fromHash;
  }
  if (!didConsumeInitialGoogleRedirectSnapshot && initialGoogleRedirectSnapshot) {
    didConsumeInitialGoogleRedirectSnapshot = true;
    const fromInitialSearch = parseGoogleRedirectParamsFromRaw(initialGoogleRedirectSnapshot.searchRaw);
    if (fromInitialSearch) {
      return fromInitialSearch;
    }
    const fromInitialHash = parseGoogleRedirectParamsFromRaw(initialGoogleRedirectSnapshot.hashRaw);
    if (fromInitialHash) {
      return fromInitialHash;
    }
  }
  return null;
};

const clearGoogleRedirectParams = (): void => {
  if (typeof window === "undefined") {
    return;
  }
  const currentUrl = new URL(window.location.href);
  let didChange = false;
  GOOGLE_REDIRECT_CALLBACK_PARAM_KEYS.forEach((key) => {
    if (currentUrl.searchParams.has(key)) {
      didChange = true;
      currentUrl.searchParams.delete(key);
    }
  });
  if (currentUrl.hash) {
    const hashRaw = currentUrl.hash.startsWith("#") ? currentUrl.hash.slice(1) : currentUrl.hash;
    const hashParams = new URLSearchParams(hashRaw);
    let hashChanged = false;
    GOOGLE_REDIRECT_CALLBACK_PARAM_KEYS.forEach((key) => {
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

const isGoogleScriptLoadFailure = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return message.includes("failed to load google auth script") || message.includes("google auth library unavailable");
};

const isPhantomInAppBrowser = (): boolean => {
  if (typeof navigator === "undefined") {
    return false;
  }
  const userAgent = navigator.userAgent || "";
  return /phantom/i.test(userAgent);
};

const waitForGoogleLibrary = (timeoutMs: number): Promise<void> => {
  return new Promise((resolve, reject) => {
    const startedAtMs = Date.now();
    const poll = () => {
      if (window.google?.accounts?.id) {
        resolve();
        return;
      }
      if (Date.now() - startedAtMs >= timeoutMs) {
        reject(new Error("Google auth library unavailable"));
        return;
      }
      window.setTimeout(poll, 50);
    };
    poll();
  });
};

const waitForScriptReady = (script: HTMLScriptElement): Promise<void> => {
  return new Promise((resolve, reject) => {
    let settled = false;
    let pollTimer: number | null = null;
    const timeoutId = window.setTimeout(() => {
      finishReject(new Error("Failed to load Google auth script"));
    }, GOOGLE_SCRIPT_LOAD_TIMEOUT_MS);

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      if (pollTimer !== null) {
        window.clearTimeout(pollTimer);
        pollTimer = null;
      }
      script.removeEventListener("load", onLoad);
      script.removeEventListener("error", onError);
    };

    const finishResolve = () => {
      if (settled) {
        return;
      }
      settled = true;
      script.setAttribute("data-loaded", "true");
      script.removeAttribute("data-load-failed");
      cleanup();
      resolve();
    };

    const finishReject = (error: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      script.setAttribute("data-load-failed", "true");
      cleanup();
      reject(error);
    };

    const pollForLibrary = () => {
      if (settled) {
        return;
      }
      if (window.google?.accounts?.id) {
        finishResolve();
        return;
      }
      pollTimer = window.setTimeout(pollForLibrary, 50);
    };

    const onLoad = () => {
      void waitForGoogleLibrary(2500)
        .then(finishResolve)
        .catch(() => {
          // Keep waiting; the main poll+timeout path owns final failure.
        });
    };
    const onError = () => {
      finishReject(new Error("Failed to load Google auth script"));
    };

    script.addEventListener("load", onLoad);
    script.addEventListener("error", onError);
    pollForLibrary();
  });
};

const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
};

const findGoogleScriptElement = (): HTMLScriptElement | null => {
  return document.querySelector(GOOGLE_SCRIPT_SELECTOR) as HTMLScriptElement | null;
};

const removeGoogleScriptElements = (): void => {
  const scripts = document.querySelectorAll(GOOGLE_SCRIPT_SELECTOR);
  scripts.forEach((script) => {
    if (script.parentNode) {
      script.parentNode.removeChild(script);
    }
  });
};

const loadGoogleScriptOnce = async (attemptIndex: number): Promise<void> => {
  const existingScript = findGoogleScriptElement();
  if (existingScript) {
    const didFail = existingScript.getAttribute("data-load-failed") === "true";
    if (didFail) {
      existingScript.remove();
    } else {
      await waitForScriptReady(existingScript);
      return;
    }
  }
  const script = document.createElement("script");
  const cacheBustSuffix = attemptIndex > 0 ? `?cb=${Date.now()}-${attemptIndex}` : "";
  script.src = `${GOOGLE_SCRIPT_SRC}${cacheBustSuffix}`;
  script.async = true;
  script.defer = true;
  const waitPromise = waitForScriptReady(script);
  const scriptParent = document.head || document.body || document.documentElement;
  if (!scriptParent) {
    throw new Error("Google auth library unavailable");
  }
  scriptParent.appendChild(script);
  await waitPromise;
};

const loadGoogleScript = async (): Promise<void> => {
  if (typeof window === "undefined") {
    throw new Error("Google sign in is unavailable in this environment");
  }
  if (window.google && window.google.accounts && window.google.accounts.id) {
    return;
  }
  if (!googleScriptPromise) {
    googleScriptPromise = (async () => {
      let lastError: unknown = null;
      for (let attemptIndex = 0; attemptIndex < GOOGLE_SCRIPT_LOAD_MAX_ATTEMPTS; attemptIndex += 1) {
        try {
          await loadGoogleScriptOnce(attemptIndex);
          return;
        } catch (error) {
          lastError = error;
          removeGoogleScriptElements();
          if (window.google?.accounts?.id) {
            return;
          }
          if (attemptIndex + 1 < GOOGLE_SCRIPT_LOAD_MAX_ATTEMPTS) {
            await sleep(GOOGLE_SCRIPT_RETRY_DELAY_MS * (attemptIndex + 1));
          }
        }
      }
      throw lastError instanceof Error ? lastError : new Error("Failed to load Google auth script");
    })();
  }
  try {
    await googleScriptPromise;
  } catch (error) {
    googleScriptPromise = null;
    throw error;
  }
  if (!window.google || !window.google.accounts || !window.google.accounts.id) {
    googleScriptPromise = null;
    throw new Error("Google auth library unavailable");
  }
};

const getGoogleClientId = (): string => {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error("Google sign in is not configured.");
  }
  return GOOGLE_CLIENT_ID;
};

const createGoogleSignInDialog = ({
  onCancel,
}: {
  onCancel: () => void;
}): { buttonHost: HTMLDivElement; close: () => void } => {
  const existing = document.getElementById(GOOGLE_DIALOG_OVERLAY_ID);
  if (existing && existing.parentNode) {
    existing.parentNode.removeChild(existing);
  }

  const overlay = document.createElement("div");
  overlay.id = GOOGLE_DIALOG_OVERLAY_ID;
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.zIndex = "2147483647";
  overlay.style.background = "rgba(17, 24, 39, 0.62)";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.padding = "16px";

  const panel = document.createElement("div");
  panel.style.width = "100%";
  panel.style.maxWidth = "360px";
  panel.style.borderRadius = "12px";
  panel.style.background = "#ffffff";
  panel.style.boxShadow = "0 16px 38px rgba(0, 0, 0, 0.25)";
  panel.style.padding = "18px";
  panel.style.boxSizing = "border-box";
  panel.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif";
  panel.style.color = "#111827";

  const heading = document.createElement("div");
  heading.textContent = "Continue with Google";
  heading.style.fontSize = "17px";
  heading.style.fontWeight = "650";
  heading.style.marginBottom = "8px";

  const subheading = document.createElement("div");
  subheading.textContent = "Use your Google account to sign in.";
  subheading.style.fontSize = "13px";
  subheading.style.color = "#4b5563";
  subheading.style.marginBottom = "14px";

  const buttonHost = document.createElement("div");
  buttonHost.style.display = "flex";
  buttonHost.style.justifyContent = "center";
  buttonHost.style.marginBottom = "12px";

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.textContent = "Cancel";
  cancelButton.style.width = "100%";
  cancelButton.style.border = "none";
  cancelButton.style.borderRadius = "8px";
  cancelButton.style.background = "#f3f4f6";
  cancelButton.style.color = "#111827";
  cancelButton.style.fontWeight = "600";
  cancelButton.style.fontSize = "13px";
  cancelButton.style.padding = "10px 12px";
  cancelButton.style.cursor = "pointer";

  const handleOverlayClick = (event: MouseEvent) => {
    if (event.target === overlay) {
      onCancel();
    }
  };
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  };
  const handleCancelClick = () => {
    onCancel();
  };

  const close = () => {
    cancelButton.removeEventListener("click", handleCancelClick);
    overlay.removeEventListener("click", handleOverlayClick);
    window.removeEventListener("keydown", handleKeyDown, true);
    if (overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
  };

  try {
    cancelButton.addEventListener("click", handleCancelClick);
    overlay.addEventListener("click", handleOverlayClick);
    window.addEventListener("keydown", handleKeyDown, true);

    panel.appendChild(heading);
    panel.appendChild(subheading);
    panel.appendChild(buttonHost);
    panel.appendChild(cancelButton);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    window.setTimeout(() => {
      if (document.body.contains(cancelButton)) {
        cancelButton.focus();
      }
    }, 0);
  } catch (error) {
    close();
    throw error;
  }

  return { buttonHost, close };
};

export async function preloadGoogleSignInLibrary(): Promise<void> {
  await loadGoogleScript();
}

export const consumeGoogleRedirectResult = (): GoogleRedirectResult | null => {
  if (typeof window === "undefined") {
    return null;
  }
  if (pendingGoogleRedirectResult) {
    return pendingGoogleRedirectResult;
  }
  const parsed = readGoogleRedirectParams();
  if (!parsed) {
    return null;
  }
  clearGoogleRedirectParams();
  pendingGoogleRedirectResult = parsed;
  return pendingGoogleRedirectResult;
};

export const clearConsumedGoogleRedirectResult = (): void => {
  pendingGoogleRedirectResult = null;
};

const startGoogleRedirectFallback = async ({
  intentId,
  nonce,
  consentSource,
}: {
  intentId: string;
  nonce: string;
  consentSource: "signin" | "settings";
}): Promise<never> => {
  const response = await connection.beginGoogleRedirectAuth({
    intentId,
    nonce,
    consentSource,
    returnUrl: window.location.href,
  });
  const authUrl = typeof response?.authUrl === "string" ? response.authUrl : "";
  if (!authUrl) {
    throw new Error("Google redirect sign in is unavailable.");
  }
  window.location.assign(authUrl);
  const redirectError = new Error("Google redirect sign in started.");
  (redirectError as Error & { code?: GoogleSignInErrorCode }).code = "google-sign-in-redirect-started";
  throw redirectError;
};

export function clearGoogleSignInTransientState(): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    activeGoogleSignInHandle = null;
    return;
  }
  const activeHandle = activeGoogleSignInHandle;
  activeGoogleSignInHandle = null;
  if (activeHandle) {
    try {
      activeHandle.abort("aborted");
    } catch {}
    try {
      activeHandle.cleanupDom();
    } catch {}
  }
  const existing = document.getElementById(GOOGLE_DIALOG_OVERLAY_ID);
  if (existing && existing.parentNode) {
    existing.parentNode.removeChild(existing);
  }
  try {
    window.google?.accounts?.id?.cancel?.();
  } catch {}
  clearConsumedGoogleRedirectResult();
  clearGoogleRedirectParams();
}

export async function signInWithGooglePopup({
  nonce,
  intentId,
  consentSource = "signin",
}: {
  nonce: string;
  intentId?: string;
  consentSource?: "signin" | "settings";
}): Promise<{ idToken: string }> {
  if (!nonce) {
    throw new Error("Google sign in nonce is required.");
  }
  const normalizedConsentSource = normalizeGoogleConsentSource(consentSource);
  const normalizedIntentId = typeof intentId === "string" ? intentId.trim() : "";
  const canUseRedirectFallback = normalizedIntentId !== "";
  if (canUseRedirectFallback && isPhantomInAppBrowser()) {
    await startGoogleRedirectFallback({
      intentId: normalizedIntentId,
      nonce,
      consentSource: normalizedConsentSource,
    });
  }
  try {
    await loadGoogleScript();
  } catch (error) {
    if (canUseRedirectFallback && isGoogleScriptLoadFailure(error)) {
      await startGoogleRedirectFallback({
        intentId: normalizedIntentId,
        nonce,
        consentSource: normalizedConsentSource,
      });
    }
    throw error;
  }
  const clientId = getGoogleClientId();
  const googleId = window.google?.accounts?.id;
  if (!googleId) {
    if (canUseRedirectFallback) {
      await startGoogleRedirectFallback({
        intentId: normalizedIntentId,
        nonce,
        consentSource: normalizedConsentSource,
      });
    }
    throw new Error("Google auth library unavailable");
  }
  clearGoogleSignInTransientState();

  const popupPromise = new Promise<{ idToken: string }>((resolve, reject) => {
    let settled = false;
    let closeDialog: (() => void) | null = null;
    let timeoutId: number | null = null;
    let handleRef: ActiveGoogleSignInHandle | null = null;

    const clearActiveHandle = () => {
      if (activeGoogleSignInHandle === handleRef) {
        activeGoogleSignInHandle = null;
      }
    };

    const cleanup = () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (closeDialog) {
        closeDialog();
        closeDialog = null;
      }
      try {
        googleId.cancel();
      } catch {}
      clearActiveHandle();
    };

    const abortActiveAttempt = (reason: GoogleSignInRejectReason) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(buildGoogleSignInError(reason));
    };

    handleRef = {
      abort: abortActiveAttempt,
      cleanupDom: () => {
        if (closeDialog) {
          closeDialog();
          closeDialog = null;
        }
      },
    };
    activeGoogleSignInHandle = handleRef;
    timeoutId = window.setTimeout(() => {
      abortActiveAttempt("timeout");
    }, GOOGLE_SIGN_IN_TIMEOUT_MS);

    const finishResolve = (idToken: string) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve({ idToken });
    };

    const finishReject = (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    try {
      googleId.cancel();
    } catch {}

    try {
      googleId.initialize({
        client_id: clientId,
        nonce,
        auto_select: false,
        itp_support: true,
        ux_mode: "popup",
        callback: (response: any) => {
          const idToken = typeof response?.credential === "string" ? response.credential : "";
          if (!idToken) {
            finishReject(new Error("Google sign in did not return credential."));
            return;
          }
          finishResolve(idToken);
        },
      });
    } catch (error) {
      finishReject(error);
      return;
    }

    try {
      const dialog = createGoogleSignInDialog({
        onCancel: () => {
          abortActiveAttempt("cancelled");
        },
      });
      closeDialog = dialog.close;
      googleId.renderButton(dialog.buttonHost, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "pill",
        width: 280,
      });
    } catch (error) {
      finishReject(error);
    }
  });
  try {
    return await popupPromise;
  } catch (error) {
    const code = error && typeof error === "object" ? (error as { code?: unknown }).code : undefined;
    const canFallbackAfterPopupFailure = code === "google-sign-in-timeout" || isGoogleScriptLoadFailure(error);
    if (canUseRedirectFallback && canFallbackAfterPopupFailure) {
      await startGoogleRedirectFallback({
        intentId: normalizedIntentId,
        nonce,
        consentSource: normalizedConsentSource,
      });
    }
    throw error;
  }
}
