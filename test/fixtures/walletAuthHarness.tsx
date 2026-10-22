import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import ProfileSignIn from "/src/ui/identity/ProfileSignInView";
import { SettingsModal } from "/src/ui/identity/SettingsModalView";
import {
  closeTransientUi,
  registerBoardTransientUiHandler,
  registerBottomControlsTransientUiHandler,
  registerMainMenuTransientUiHandler,
} from "/src/ui/uiSession";
import {
  environment,
  publishXAuthUiFeedback,
  setEventModalState,
  setPendingXRedirectResult,
} from "./walletAuthEnvironment";

const params = new URLSearchParams(location.search);
const screen = params.get("screen");
if (params.has("pendingTransientCleanup")) {
  const noop = () => {};
  registerBoardTransientUiHandler(noop);
  registerBottomControlsTransientUiHandler(noop);
  registerMainMenuTransientUiHandler(noop);
  closeTransientUi();
}
const root = createRoot(document.getElementById("root")!);
const dispose = () => flushSync(() => root.unmount());
const harness = {
  environment,
  dispose,
  publishXAuthUiFeedback,
  setEventModalState,
  setPendingXRedirectResult,
  resolveXIntent(index: number) {
    environment.xIntentCalls[index].resolve({ intentId: `x-intent-${index}` });
  },
  rejectXIntent(index: number, message: string, details?: object) {
    environment.xIntentCalls[index].reject(
      Object.assign(new Error(message), { details }),
    );
  },
  rejectXRedirect(index: number, message: string) {
    environment.xRedirectCalls[index].reject(new Error(message));
  },
  setVisibilityState(state: "hidden" | "visible") {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: state,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  },
  resolveConnection(index: number) {
    const call = environment.connectCalls[index];
    call.resolve({
      message: "signed-message",
      publicKey: "public-key",
      signature: "signature",
      intentId: `${call.method}-intent`,
    });
  },
  rejectConnection(index: number, message: string) {
    environment.connectCalls[index].reject(new Error(message));
  },
  resolveVerification(index: number, ok = true) {
    const call = environment.verificationCalls[index];
    if (ok) environment.linkedMethods[call.method as "eth" | "sol"] = true;
    call.resolve({ ok, profileId: "profile", username: "Player" });
  },
  rejectVerification(index: number) {
    environment.verificationCalls[index].reject(
      new Error("verification failed"),
    );
  },
  advanceTimers(delay?: number) {
    const timers = [...environment.timers.entries()].filter(
      ([, timer]) => delay === undefined || timer.delay === delay,
    );
    timers.forEach(([id, { callback }]) => {
      environment.timers.delete(id);
      callback();
    });
  },
};
(window as any).harness = harness;
flushSync(() =>
  root.render(
    <React.StrictMode>
      {screen === "settings" ? (
        <SettingsModal onClose={dispose} />
      ) : (
        <ProfileSignIn
          authState={{
            authStatus: "unauthenticated",
            profileId: "",
            ethAddress: "",
            solAddress: "",
          }}
        />
      )}
    </React.StrictMode>,
  ),
);
