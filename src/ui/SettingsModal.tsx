import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import styled from "styled-components";
import { ModalOverlay, ModalPopup, ModalTitle, ButtonsContainer, SaveButton } from "./SharedModalComponents";
import { connection } from "../connection/connection";
import { storage } from "../utils/storage";
import { updateProfileDisplayName } from "./ProfileSignIn";
import { handleLoginSuccess, AddressKind } from "../connection/loginSuccess";
import { clearEthIntentState, setAuthStatusGlobally } from "../connection/authentication";
import { clearAppleSignInTransientState, preloadAppleSignInLibrary, signInWithApplePopup } from "../connection/appleConnection";
import { isMobile } from "../utils/misc";

const SettingsPopup = styled(ModalPopup)`
  padding: 20px;
  outline: none;
  max-width: 360px;
`;

const SettingsTitle = styled(ModalTitle)`
  margin-bottom: 8px;
  text-align: left;
`;

const MethodsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 14px;
`;

const MethodRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 10px 10px 12px;
  border-radius: 10px;
  background: var(--color-gray-f5);

  @media (prefers-color-scheme: dark) {
    background: var(--color-gray-25);
  }
`;

const MethodMeta = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
`;

const MethodName = styled.div`
  font-size: 0.92rem;
  font-weight: 700;
  color: var(--color-gray-33);

  @media (prefers-color-scheme: dark) {
    color: var(--color-gray-f5);
  }
`;

const ActionButton = styled.button<{ danger?: boolean }>`
  border: none;
  border-radius: 14px;
  padding: 7px 10px;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  color: white;
  background: ${(props) => (props.danger ? "var(--dangerButtonBackground)" : "var(--color-blue-primary)")};
  width: 112px;
  min-width: 112px;
  text-align: center;
  white-space: nowrap;

  &:disabled {
    opacity: 0.45;
    cursor: default;
  }

  @media (prefers-color-scheme: dark) {
    background: ${(props) => (props.danger ? "var(--dangerButtonBackgroundDark)" : "var(--color-blue-primary-dark)")};
  }
`;

type MethodKey = "apple" | "eth" | "sol";
type NonAppleMethodKey = Exclude<MethodKey, "apple">;
type LinkedMethods = Record<MethodKey, boolean>;

const EMPTY_LINKED_METHODS: LinkedMethods = {
  apple: false,
  eth: false,
  sol: false,
};

type AuthIntentResponse = {
  ok: boolean;
  intentId: string;
  nonce: string;
  state: string;
  expiresAtMs: number;
};

type AppleButtonUiState = "idle" | "preparing" | "confirm" | "connecting" | "verifying";

const APPLE_INTENT_REFRESH_BUFFER_MS = 30 * 1000;

const isAppleIntentUsable = (intent: AuthIntentResponse | null): intent is AuthIntentResponse => {
  if (!intent) {
    return false;
  }
  return typeof intent.intentId === "string" &&
    intent.intentId !== "" &&
    typeof intent.nonce === "string" &&
    intent.nonce !== "" &&
    typeof intent.state === "string" &&
    intent.state !== "" &&
    typeof intent.expiresAtMs === "number" &&
    Number.isFinite(intent.expiresAtMs) &&
    intent.expiresAtMs - Date.now() > APPLE_INTENT_REFRESH_BUFFER_MS;
};

const getAppleButtonLabel = (state: AppleButtonUiState): string => {
  if (state === "preparing") {
    return "Preparing...";
  }
  if (state === "confirm") {
    return "Connect";
  }
  if (state === "connecting") {
    return "Connect";
  }
  if (state === "verifying") {
    return "Verifying...";
  }
  return "Connect";
};

let isSettingsAppleFlowInProgress = false;
const settingsAppleFlowListeners = new Set<(inProgress: boolean) => void>();

const setSettingsAppleFlowInProgress = (inProgress: boolean): void => {
  if (isSettingsAppleFlowInProgress === inProgress) {
    return;
  }
  isSettingsAppleFlowInProgress = inProgress;
  settingsAppleFlowListeners.forEach((listener) => {
    try {
      listener(inProgress);
    } catch {}
  });
};

const subscribeSettingsAppleFlowProgress = (listener: (inProgress: boolean) => void): (() => void) => {
  settingsAppleFlowListeners.add(listener);
  return () => {
    settingsAppleFlowListeners.delete(listener);
  };
};

export interface SettingsModalProps {
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const popupRef = useRef<HTMLDivElement>(null);
  const [linkedMethods, setLinkedMethods] = useState<LinkedMethods>(EMPTY_LINKED_METHODS);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [busyMethod, setBusyMethod] = useState<MethodKey | null>(null);
  const [appleButtonState, setAppleButtonState] = useState<AppleButtonUiState>("idle");
  const [solanaConnectText, setSolanaConnectText] = useState<string>("Connect");
  const [isGlobalAppleFlowInProgress, setIsGlobalAppleFlowInProgress] = useState<boolean>(() => isSettingsAppleFlowInProgress);
  const appleIntentRef = useRef<AuthIntentResponse | null>(null);
  const appleIntentPromiseRef = useRef<Promise<AuthIntentResponse> | null>(null);
  const isMountedRef = useRef(true);
  const latestAppleActionRef = useRef(0);
  const previousGlobalAppleFlowRef = useRef(isSettingsAppleFlowInProgress);
  const appleConfirmExpiryTimeoutRef = useRef<number | null>(null);
  const solanaNotFoundTimeoutRef = useRef<number | null>(null);
  const shouldRefreshAfterAppleFlowLoadRef = useRef(false);

  const linkedCount = useMemo(() => {
    return Object.values(linkedMethods).filter(Boolean).length;
  }, [linkedMethods]);

  const refreshLinkedMethods = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await connection.getLinkedAuthMethods();
      const linked = data && data.linkedMethods ? data.linkedMethods : EMPTY_LINKED_METHODS;
      setLinkedMethods({
        apple: !!linked.apple,
        eth: !!linked.eth,
        sol: !!linked.sol,
      });
    } catch (error) {
      console.error("Failed to fetch linked methods:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const ensurePreparedAppleIntent = useCallback(async (): Promise<AuthIntentResponse> => {
    if (isAppleIntentUsable(appleIntentRef.current)) {
      return appleIntentRef.current;
    }
    if (!appleIntentPromiseRef.current) {
      const pendingIntentPromise = connection
        .beginAuthIntent("apple")
        .then((intent) => {
          if (appleIntentPromiseRef.current === pendingIntentPromise) {
            appleIntentRef.current = intent;
          }
          return intent;
        })
        .finally(() => {
          if (appleIntentPromiseRef.current === pendingIntentPromise) {
            appleIntentPromiseRef.current = null;
          }
        });
      appleIntentPromiseRef.current = pendingIntentPromise;
    }
    return appleIntentPromiseRef.current;
  }, []);

  const takePreparedAppleIntent = useCallback((): AuthIntentResponse | null => {
    if (!isAppleIntentUsable(appleIntentRef.current)) {
      return null;
    }
    const intent = appleIntentRef.current;
    appleIntentRef.current = null;
    return intent;
  }, []);

  const clearAppleConfirmExpiryTimeout = useCallback(() => {
    if (appleConfirmExpiryTimeoutRef.current) {
      window.clearTimeout(appleConfirmExpiryTimeoutRef.current);
      appleConfirmExpiryTimeoutRef.current = null;
    }
  }, []);

  const clearSolanaNotFoundTimeout = useCallback(() => {
    if (solanaNotFoundTimeoutRef.current !== null) {
      window.clearTimeout(solanaNotFoundTimeoutRef.current);
      solanaNotFoundTimeoutRef.current = null;
    }
  }, []);

  const scheduleAppleConfirmExpiryTimeout = useCallback(() => {
    clearAppleConfirmExpiryTimeout();
    const intent = appleIntentRef.current;
    if (!intent) {
      return;
    }
    const msUntilIntentIsStale = intent.expiresAtMs - Date.now() - APPLE_INTENT_REFRESH_BUFFER_MS;
    if (msUntilIntentIsStale <= 0) {
      if (isMountedRef.current) {
        setAppleButtonState((current) => (current === "confirm" ? "idle" : current));
      }
      return;
    }
    appleConfirmExpiryTimeoutRef.current = window.setTimeout(() => {
      appleConfirmExpiryTimeoutRef.current = null;
      if (!isMountedRef.current) {
        return;
      }
      if (!isAppleIntentUsable(appleIntentRef.current)) {
        setAppleButtonState((current) => (current === "confirm" ? "idle" : current));
      }
    }, msUntilIntentIsStale + 50);
  }, [clearAppleConfirmExpiryTimeout]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      clearAppleConfirmExpiryTimeout();
      clearSolanaNotFoundTimeout();
    };
  }, [clearAppleConfirmExpiryTimeout, clearSolanaNotFoundTimeout]);

  useEffect(() => {
    return subscribeSettingsAppleFlowProgress((inProgress) => {
      if (isMountedRef.current) {
        setIsGlobalAppleFlowInProgress(inProgress);
      }
    });
  }, []);

  useEffect(() => {
    if (popupRef.current) {
      popupRef.current.focus();
    }
    void refreshLinkedMethods();
  }, [refreshLinkedMethods]);

  useEffect(() => {
    if (isLoading || linkedMethods.apple) {
      return;
    }
    void preloadAppleSignInLibrary().catch(() => {});
    void ensurePreparedAppleIntent().catch(() => {});
  }, [isLoading, linkedMethods.apple, ensurePreparedAppleIntent]);

  useEffect(() => {
    if (isLoading) {
      return;
    }
    if (!linkedMethods.eth) {
      void import("../connection/ethereumConnection").catch(() => {});
    }
    if (!linkedMethods.sol) {
      void import("../connection/solanaConnection").catch(() => {});
    }
  }, [isLoading, linkedMethods.eth, linkedMethods.sol]);

  useEffect(() => {
    if (!linkedMethods.apple) {
      return;
    }
    latestAppleActionRef.current += 1;
    clearAppleConfirmExpiryTimeout();
    setAppleButtonState("idle");
  }, [clearAppleConfirmExpiryTimeout, linkedMethods.apple]);

  useEffect(() => {
    if (appleButtonState !== "confirm") {
      clearAppleConfirmExpiryTimeout();
      return;
    }
    scheduleAppleConfirmExpiryTimeout();
    return clearAppleConfirmExpiryTimeout;
  }, [appleButtonState, clearAppleConfirmExpiryTimeout, scheduleAppleConfirmExpiryTimeout]);

  useEffect(() => {
    const wasInProgress = previousGlobalAppleFlowRef.current;
    previousGlobalAppleFlowRef.current = isGlobalAppleFlowInProgress;
    if (!wasInProgress || isGlobalAppleFlowInProgress || busyMethod === "apple") {
      return;
    }
    if (isLoading) {
      shouldRefreshAfterAppleFlowLoadRef.current = true;
      return;
    }
    void refreshLinkedMethods();
  }, [busyMethod, isGlobalAppleFlowInProgress, isLoading, refreshLinkedMethods]);

  useEffect(() => {
    if (isLoading || !shouldRefreshAfterAppleFlowLoadRef.current) {
      return;
    }
    shouldRefreshAfterAppleFlowLoadRef.current = false;
    void refreshLinkedMethods();
  }, [isLoading, refreshLinkedMethods]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
    }
  };

  const runConnectFlow = useCallback(
    async (method: NonAppleMethodKey) => {
      setBusyMethod(method);
      try {
        let result: any = null;
        let kind: AddressKind = method;
        if (method === "eth") {
          const { connectToEthereumAndSign } = await import("../connection/ethereumConnection");
          const { message, signature, intentId } = await connectToEthereumAndSign();
          result = await connection.verifyEthAddress(message, signature, intentId);
          kind = "eth";
        } else if (method === "sol") {
          const { connectToSolana } = await import("../connection/solanaConnection");
          const { publicKey, signature, intentId } = await connectToSolana();
          clearSolanaNotFoundTimeout();
          setSolanaConnectText("Verifying...");
          result = await connection.verifySolanaAddress(publicKey, signature, intentId);
          kind = "sol";
        }

        if (result && result.ok === true) {
          handleLoginSuccess(result, kind);
          setAuthStatusGlobally("authenticated");
        }
        if (method === "sol") {
          setSolanaConnectText("Connect");
        }
      } catch (error) {
        console.error(`Failed to connect ${method}:`, error);
        if (method === "sol") {
          const errorMessage = error instanceof Error ? error.message : "";
          if (errorMessage === "not found") {
            setSolanaConnectText("Not Found");
            clearSolanaNotFoundTimeout();
            solanaNotFoundTimeoutRef.current = window.setTimeout(() => {
              solanaNotFoundTimeoutRef.current = null;
              if (isMountedRef.current) {
                setSolanaConnectText("Connect");
              }
            }, 500);
          } else {
            setSolanaConnectText("Connect");
          }
        }
      } finally {
        setBusyMethod(null);
        await refreshLinkedMethods();
      }
    },
    [clearSolanaNotFoundTimeout, refreshLinkedMethods]
  );

  const runAppleConnectFlow = useCallback(async () => {
    if (isLoading || busyMethod !== null) {
      return;
    }
    if (isSettingsAppleFlowInProgress) {
      return;
    }

    const actionId = latestAppleActionRef.current + 1;
    latestAppleActionRef.current = actionId;
    const isActionCurrent = () => latestAppleActionRef.current === actionId;
    const setAppleUiIfMounted = (nextState: AppleButtonUiState) => {
      if (!isMountedRef.current || !isActionCurrent()) {
        return;
      }
      setAppleButtonState(nextState);
    };

    const intent = takePreparedAppleIntent();
    if (!intent) {
      setAppleUiIfMounted("preparing");
      try {
        await Promise.all([preloadAppleSignInLibrary(), ensurePreparedAppleIntent()]);
        if (!isActionCurrent()) {
          return;
        }
        if (!isAppleIntentUsable(appleIntentRef.current)) {
          setAppleUiIfMounted("idle");
          return;
        }
        if (isMountedRef.current && isActionCurrent()) {
          setAppleButtonState("confirm");
        }
      } catch (error) {
        console.error("Failed to prepare apple sign in:", error);
        setAppleUiIfMounted("idle");
      }
      return;
    }

    setSettingsAppleFlowInProgress(true);
    if (isMountedRef.current && isActionCurrent()) {
      flushSync(() => {
        setBusyMethod("apple");
        setAppleButtonState("connecting");
      });
    }
    try {
      const signInResult = await signInWithApplePopup({
        nonce: intent.nonce,
        state: intent.state,
        intentId: intent.intentId,
        expiresAtMs: intent.expiresAtMs,
        consentSource: "settings",
      });
      if (!isActionCurrent()) {
        return;
      }
      if (!signInResult) {
        setAppleUiIfMounted("idle");
        return;
      }
      const { idToken } = signInResult;
      setAppleUiIfMounted("verifying");
      const result = await connection.verifyAppleToken(intent.intentId, idToken, "settings");
      if (!isActionCurrent()) {
        return;
      }
      if (result && result.ok === true) {
        handleLoginSuccess(result, "apple");
        setAuthStatusGlobally("authenticated");
      }
    } catch (error) {
      console.error("Failed to connect apple:", error);
    } finally {
      setSettingsAppleFlowInProgress(false);
      if (!isActionCurrent()) {
        return;
      }
      if (isMountedRef.current) {
        setBusyMethod((current) => (current === "apple" ? null : current));
        setAppleButtonState("idle");
        await refreshLinkedMethods();
      }
    }
  }, [busyMethod, ensurePreparedAppleIntent, isLoading, refreshLinkedMethods, takePreparedAppleIntent]);

  const handleConnectClick = useCallback(
    (method: MethodKey) => {
      if (method === "apple") {
        void runAppleConnectFlow();
        return;
      }
      void runConnectFlow(method);
    },
    [runAppleConnectFlow, runConnectFlow]
  );

  const runDisconnectFlow = useCallback(
    async (method: MethodKey) => {
      setBusyMethod(method);
      try {
        const result = await connection.unlinkAuthMethod(method);
        if (result && result.ok === true) {
          if (method === "eth") {
            storage.setEthAddress("");
            clearEthIntentState();
          }
          if (method === "sol") {
            storage.setSolAddress("");
          }
          if (method === "apple") {
            clearAppleSignInTransientState();
            appleIntentRef.current = null;
            appleIntentPromiseRef.current = null;
          }
          updateProfileDisplayName(storage.getUsername(""), storage.getEthAddress(""), storage.getSolAddress(""));
        }
      } catch (error) {
        console.error(`Failed to unlink ${method}:`, error);
      } finally {
        setBusyMethod(null);
        await refreshLinkedMethods();
      }
    },
    [refreshLinkedMethods]
  );

  const renderMethodRow = (method: MethodKey, label: string) => {
    const isLinked = linkedMethods[method];
    const isBusy = busyMethod === method;
    const isAppleMethod = method === "apple";
    const isOtherMethodBusy = busyMethod !== null && busyMethod !== method;
    const isApplePreparing = appleButtonState === "preparing";
    const isAppleBusyState = isGlobalAppleFlowInProgress || appleButtonState === "connecting" || appleButtonState === "verifying";
    const disableConnect = isAppleMethod
      ? isLoading || isBusy || isOtherMethodBusy || isApplePreparing || isAppleBusyState
      : isLoading || isBusy || busyMethod !== null;
    const disableDisconnect = isLoading || isBusy || busyMethod !== null || linkedCount <= 1;
    const connectText = isAppleMethod
      ? getAppleButtonLabel(appleButtonState)
      : method === "sol"
        ? solanaConnectText
        : "Connect";
    const handleConnectPress = () => {
      if (disableConnect) {
        return;
      }
      handleConnectClick(method);
    };
    const handleDisconnectPress = () => {
      if (disableDisconnect) {
        return;
      }
      void runDisconnectFlow(method);
    };
    const connectOnClick = isAppleMethod ? handleConnectPress : !isMobile ? handleConnectPress : undefined;
    const connectOnTouchEnd = !isAppleMethod && isMobile ? handleConnectPress : undefined;
    return (
      <MethodRow key={method}>
        <MethodMeta>
          <MethodName>{label}</MethodName>
        </MethodMeta>
        {isLinked ? (
          <ActionButton
            danger={true}
            disabled={disableDisconnect}
            onClick={!isMobile ? handleDisconnectPress : undefined}
            onTouchEnd={isMobile ? handleDisconnectPress : undefined}>
            {isBusy ? "Removing..." : "Remove"}
          </ActionButton>
        ) : (
          <ActionButton disabled={disableConnect} onClick={connectOnClick} onTouchEnd={connectOnTouchEnd}>
            {connectText}
          </ActionButton>
        )}
      </MethodRow>
    );
  };

  return (
    <ModalOverlay onClick={onClose}>
      <SettingsPopup ref={popupRef} onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown} tabIndex={0}>
        <SettingsTitle>Settings</SettingsTitle>
        <MethodsList>
          {renderMethodRow("eth", "Ethereum")}
          {renderMethodRow("sol", "Solana")}
          {renderMethodRow("apple", "Apple")}
        </MethodsList>
        <ButtonsContainer>
          <SaveButton disabled={false} onClick={onClose}>
            OK
          </SaveButton>
        </ButtonsContainer>
      </SettingsPopup>
    </ModalOverlay>
  );
};

export default SettingsModal;
