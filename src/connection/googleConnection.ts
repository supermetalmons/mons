declare global {
  interface Window {
    google?: any;
  }
}

let googleScriptPromise: Promise<void> | null = null;

const GOOGLE_SCRIPT_SRC = "https://accounts.google.com/gsi/client";
const GOOGLE_SIGN_IN_TIMEOUT_MS = 60 * 1000;
const GOOGLE_SCRIPT_LOAD_TIMEOUT_MS = 15 * 1000;
const GOOGLE_CLIENT_ID = "390871694056-dbt5ip4d7b7ehnlfq49cu9b5fe6drhnf.apps.googleusercontent.com";

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

const loadGoogleScript = async (): Promise<void> => {
  if (typeof window === "undefined") {
    throw new Error("Google sign in is unavailable in this environment");
  }
  if (window.google && window.google.accounts && window.google.accounts.id) {
    return;
  }
  if (!googleScriptPromise) {
    googleScriptPromise = new Promise<void>((resolve, reject) => {
      const existingScript = document.querySelector(`script[src="${GOOGLE_SCRIPT_SRC}"]`) as HTMLScriptElement | null;
      if (existingScript) {
        const didFail = existingScript.getAttribute("data-load-failed") === "true";
        if (didFail) {
          existingScript.remove();
        } else {
          void waitForScriptReady(existingScript).then(resolve).catch(reject);
          return;
        }
      }
      const script = document.createElement("script");
      script.src = GOOGLE_SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      void waitForScriptReady(script).then(resolve).catch(reject);
      document.head.appendChild(script);
    });
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
  return GOOGLE_CLIENT_ID;
};

const readMomentState = (notification: any, predicateName: string): boolean => {
  try {
    const predicate = notification && typeof notification[predicateName] === "function" ? notification[predicateName] : null;
    if (!predicate) {
      return false;
    }
    return !!predicate.call(notification);
  } catch {
    return false;
  }
};

const readMomentReason = (notification: any, getterName: string): string => {
  try {
    const getter = notification && typeof notification[getterName] === "function" ? notification[getterName] : null;
    if (!getter) {
      return "";
    }
    const value = getter.call(notification);
    return typeof value === "string" ? value : "";
  } catch {
    return "";
  }
};

export async function preloadGoogleSignInLibrary(): Promise<void> {
  await loadGoogleScript();
}

export async function signInWithGooglePopup({ nonce }: { nonce: string }): Promise<{ idToken: string }> {
  if (!nonce) {
    throw new Error("Google sign in nonce is required.");
  }
  await loadGoogleScript();
  const clientId = getGoogleClientId();
  const googleId = window.google?.accounts?.id;
  if (!googleId) {
    throw new Error("Google auth library unavailable");
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const timeoutId = window.setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      try {
        googleId.cancel();
      } catch {}
      reject(new Error("Google sign in timed out"));
    }, GOOGLE_SIGN_IN_TIMEOUT_MS);

    const finishResolve = (idToken: string) => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timeoutId);
      try {
        googleId.cancel();
      } catch {}
      resolve({ idToken });
    };

    const finishReject = (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timeoutId);
      try {
        googleId.cancel();
      } catch {}
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
        use_fedcm_for_prompt: true,
        cancel_on_tap_outside: true,
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
      googleId.prompt((notification: any) => {
        if (settled || !notification) {
          return;
        }
        const isNotDisplayed = readMomentState(notification, "isNotDisplayed");
        if (isNotDisplayed) {
          const reason = readMomentReason(notification, "getNotDisplayedReason");
          finishReject(new Error(reason ? `Google sign in unavailable: ${reason}` : "Google sign in unavailable."));
          return;
        }
        const isSkipped = readMomentState(notification, "isSkippedMoment");
        if (isSkipped) {
          const reason = readMomentReason(notification, "getSkippedReason");
          if (reason && reason !== "credential_returned") {
            finishReject(new Error(reason === "user_cancel" ? "Google sign in was cancelled." : `Google sign in skipped: ${reason}`));
            return;
          }
        }
        const isDismissed = readMomentState(notification, "isDismissedMoment");
        if (isDismissed) {
          const reason = readMomentReason(notification, "getDismissedReason");
          if (reason && reason !== "credential_returned") {
            finishReject(new Error(`Google sign in dismissed: ${reason}`));
          }
        }
      });
    } catch (error) {
      finishReject(error);
    }
  });
}
