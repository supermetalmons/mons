declare global {
  interface Window {
    AppleID?: any;
  }
}

let appleScriptPromise: Promise<void> | null = null;

const APPLE_SCRIPT_SRC = "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";

const loadAppleScript = async (): Promise<void> => {
  if (typeof window === "undefined") {
    throw new Error("Apple sign in is unavailable in this environment");
  }
  if (window.AppleID && window.AppleID.auth) {
    return;
  }
  if (!appleScriptPromise) {
    appleScriptPromise = new Promise<void>((resolve, reject) => {
      const existing = document.querySelector(`script[src="${APPLE_SCRIPT_SRC}"]`) as HTMLScriptElement | null;
      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error("Failed to load Apple auth script")), { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = APPLE_SCRIPT_SRC;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load Apple auth script"));
      document.head.appendChild(script);
    });
  }
  await appleScriptPromise;
  if (!window.AppleID || !window.AppleID.auth) {
    throw new Error("Apple auth library unavailable");
  }
};

const getAppleClientId = (): string => {
  const clientId = (process.env.REACT_APP_APPLE_CLIENT_ID || "").trim();
  if (!clientId) {
    throw new Error("Missing REACT_APP_APPLE_CLIENT_ID");
  }
  return clientId;
};

const getAppleRedirectUri = (): string => {
  const configured = (process.env.REACT_APP_APPLE_REDIRECT_URI || "").trim();
  if (configured) {
    return configured;
  }
  return window.location.origin;
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
  const responseState = authorization && typeof authorization.state === "string" ? authorization.state : "";
  if (!idToken) {
    throw new Error("Apple sign in did not return id_token");
  }
  if (responseState && responseState !== state) {
    throw new Error("Apple sign in state mismatch");
  }
  return { idToken };
}
