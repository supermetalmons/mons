declare global {
  interface Window {
    AppleID?: any;
  }
}

let appleScriptPromise: Promise<void> | null = null;

const APPLE_SCRIPT_SRC = "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";
const APPLE_CLIENT_ID = "link.mons";
const APPLE_REDIRECT_URI = "https://mons.link";

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

export async function signInWithApplePopup({ nonce, state }: { nonce: string; state: string }): Promise<{ idToken: string }> {
  await loadAppleScript();
  const clientId = getAppleClientId();
  const redirectURI = getAppleRedirectUri();

  window.AppleID.auth.init({
    clientId,
    scope: "name email",
    redirectURI,
    state,
    nonce,
    usePopup: true,
    responseType: "id_token",
    responseMode: "fragment",
  });

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
  return { idToken };
}
