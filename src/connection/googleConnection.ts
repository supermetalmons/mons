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
const GOOGLE_DIALOG_OVERLAY_ID = "google-sign-in-overlay";

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
    cancelButton.focus();
  }, 0);

  const close = () => {
    cancelButton.removeEventListener("click", handleCancelClick);
    overlay.removeEventListener("click", handleOverlayClick);
    window.removeEventListener("keydown", handleKeyDown, true);
    if (overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
  };

  return { buttonHost, close };
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
    let closeDialog: (() => void) | null = null;
    const timeoutId = window.setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      if (closeDialog) {
        closeDialog();
        closeDialog = null;
      }
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
      if (closeDialog) {
        closeDialog();
        closeDialog = null;
      }
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
      if (closeDialog) {
        closeDialog();
        closeDialog = null;
      }
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
          finishReject(new Error("Google sign in was cancelled."));
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
}
