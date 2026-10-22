import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import { connection } from "../../connection/connection";
import { formatAuthCooldownErrorMessage } from "../../connection/authCooldownErrors";
import { formatXAuthErrorMessage } from "../../connection/xAuthErrors";
import {
  consumePendingXAuthUiFeedback,
  subscribeToXAuthUiFeedback,
} from "../../connection/xAuthUiFeedback";
import {
  clearConsumedXRedirectResult,
  isXRedirectStartedError,
  peekXRedirectResult,
  startXRedirectAuth,
  subscribeToPendingXRedirectResult,
} from "../../connection/xConnection";
import {
  createXAuthFlowController,
  type XAuthFlowOptions,
} from "./xAuthFlowController";

export const useXAuthFlow = ({
  consentSource,
  ...options
}: XAuthFlowOptions & { consentSource: "signin" | "settings" }) => {
  const controller = useMemo(
    () =>
      createXAuthFlowController({
        consentSource,
        dependencies: {
          beginIntent: () => connection.beginAuthIntent("x"),
          startRedirect: startXRedirectAuth,
          isRedirectStartedError: isXRedirectStartedError,
          formatError: (error, source) =>
            formatAuthCooldownErrorMessage(error) ??
            formatXAuthErrorMessage(
              error,
              source === "settings" ? "link" : "signin",
            ),
          peekPendingResult: peekXRedirectResult,
          subscribePendingResult: subscribeToPendingXRedirectResult,
          clearPendingResult: clearConsumedXRedirectResult,
          consumeFeedback: consumePendingXAuthUiFeedback,
          subscribeFeedback: subscribeToXAuthUiFeedback,
          isVisible: () => document.visibilityState === "visible",
          subscribeVisibility: (listener) => {
            document.addEventListener("visibilitychange", listener);
            return () =>
              document.removeEventListener("visibilitychange", listener);
          },
        },
      }),
    [consentSource],
  );
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
  );

  useLayoutEffect(() => controller.setOptions(options));
  useEffect(() => {
    controller.attach();
    return controller.detach;
  }, [controller]);

  return {
    ...snapshot,
    isBusy: snapshot.buttonState === "connecting",
    start: controller.start,
    retryPendingSignIn: controller.retryPendingSignIn,
  };
};
