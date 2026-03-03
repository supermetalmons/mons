import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import { ModalOverlay, ModalPopup, ModalTitle, ButtonsContainer, SaveButton } from "./SharedModalComponents";
import { connection } from "../connection/connection";
import { storage } from "../utils/storage";
import { updateProfileDisplayName } from "./ProfileSignIn";
import { handleLoginSuccess, AddressKind } from "../connection/loginSuccess";
import { clearEthIntentState, setAuthStatusGlobally } from "../connection/authentication";
import { clearAppleSignInTransientState, preloadAppleSignInLibrary, signInWithApplePopup } from "../connection/appleConnection";

const SettingsPopup = styled(ModalPopup)`
  padding: 20px;
  outline: none;
  max-width: 360px;
`;

const SettingsTitle = styled(ModalTitle)`
  margin-bottom: 8px;
  text-align: left;
`;

const SectionTitle = styled.h4`
  margin: 8px 0 10px 0;
  font-size: 0.88rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-gray-69);

  @media (prefers-color-scheme: dark) {
    color: var(--secondaryTextColorDark);
  }
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

const MethodStatus = styled.div`
  font-size: 0.76rem;
  color: var(--color-gray-69);

  @media (prefers-color-scheme: dark) {
    color: var(--secondaryTextColorDark);
  }
`;

const ActionButton = styled.button<{ danger?: boolean }>`
  border: none;
  border-radius: 14px;
  padding: 7px 12px;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  color: white;
  background: ${(props) => (props.danger ? "var(--dangerButtonBackground)" : "var(--color-blue-primary)")};
  min-width: 84px;

  &:disabled {
    opacity: 0.45;
    cursor: default;
  }

  @media (prefers-color-scheme: dark) {
    background: ${(props) => (props.danger ? "var(--dangerButtonBackgroundDark)" : "var(--color-blue-primary-dark)")};
  }
`;

const InfoText = styled.div`
  min-height: 18px;
  font-size: 0.76rem;
  color: var(--color-gray-69);
  margin-bottom: 8px;

  @media (prefers-color-scheme: dark) {
    color: var(--secondaryTextColorDark);
  }
`;

type MethodKey = "apple" | "eth" | "sol";
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

export interface SettingsModalProps {
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const popupRef = useRef<HTMLDivElement>(null);
  const [linkedMethods, setLinkedMethods] = useState<LinkedMethods>(EMPTY_LINKED_METHODS);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [busyMethod, setBusyMethod] = useState<MethodKey | null>(null);
  const [statusText, setStatusText] = useState<string>("");
  const appleIntentRef = useRef<AuthIntentResponse | null>(null);
  const appleIntentPromiseRef = useRef<Promise<AuthIntentResponse> | null>(null);

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
      setStatusText("");
    } catch (error) {
      console.error("Failed to fetch linked methods:", error);
      setStatusText("Failed to load linked methods.");
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

  useEffect(() => {
    if (popupRef.current) {
      popupRef.current.focus();
    }
    void refreshLinkedMethods();
    void preloadAppleSignInLibrary().catch(() => {});
    void ensurePreparedAppleIntent().catch(() => {});
  }, [refreshLinkedMethods, ensurePreparedAppleIntent]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
    }
  };

  const runConnectFlow = useCallback(
    async (method: MethodKey) => {
      setBusyMethod(method);
      setStatusText(`Connecting ${method}...`);
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
          result = await connection.verifySolanaAddress(publicKey, signature, intentId);
          kind = "sol";
        } else {
          const intent = takePreparedAppleIntent();
          if (!intent) {
            setStatusText("Preparing Apple sign in...");
            void ensurePreparedAppleIntent().catch(() => {});
            return;
          }
          const signInResult = await signInWithApplePopup({
            nonce: intent.nonce,
            state: intent.state,
            intentId: intent.intentId,
            expiresAtMs: intent.expiresAtMs,
            consentSource: "settings",
          });
          if (!signInResult) {
            setStatusText("Continue in Apple sign in...");
            return;
          }
          const { idToken } = signInResult;
          result = await connection.verifyAppleToken(intent.intentId, idToken, "settings");
          kind = "apple";
        }

        if (result && result.ok === true) {
          handleLoginSuccess(result, kind);
          setAuthStatusGlobally("authenticated");
          setStatusText(`${method} connected.`);
        } else {
          setStatusText(`Failed to connect ${method}.`);
        }
      } catch (error) {
        console.error(`Failed to connect ${method}:`, error);
        setStatusText(`Failed to connect ${method}.`);
      } finally {
        setBusyMethod(null);
        await refreshLinkedMethods();
      }
    },
    [refreshLinkedMethods, takePreparedAppleIntent, ensurePreparedAppleIntent]
  );

  const runDisconnectFlow = useCallback(
    async (method: MethodKey) => {
      setBusyMethod(method);
      setStatusText(`Removing ${method}...`);
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
          setStatusText(`${method} removed.`);
        } else {
          setStatusText(`Unable to remove ${method}.`);
        }
      } catch (error) {
        console.error(`Failed to unlink ${method}:`, error);
        setStatusText(linkedCount <= 1 ? "At least one method must remain linked." : `Failed to remove ${method}.`);
      } finally {
        setBusyMethod(null);
        await refreshLinkedMethods();
      }
    },
    [linkedCount, refreshLinkedMethods]
  );

  const renderMethodRow = (method: MethodKey, label: string) => {
    const isLinked = linkedMethods[method];
    const isBusy = busyMethod === method;
    const disableConnect = isLoading || isBusy || busyMethod !== null;
    const disableDisconnect = isLoading || isBusy || busyMethod !== null || linkedCount <= 1;
    return (
      <MethodRow key={method}>
        <MethodMeta>
          <MethodName>{label}</MethodName>
          <MethodStatus>{isLinked ? "Linked" : "Not linked"}</MethodStatus>
        </MethodMeta>
        {isLinked ? (
          <ActionButton danger={true} disabled={disableDisconnect} onClick={() => void runDisconnectFlow(method)}>
            {isBusy ? "Removing..." : "Remove"}
          </ActionButton>
        ) : (
          <ActionButton disabled={disableConnect} onClick={() => void runConnectFlow(method)}>
            {isBusy ? "Connecting..." : "Connect"}
          </ActionButton>
        )}
      </MethodRow>
    );
  };

  return (
    <ModalOverlay onClick={onClose}>
      <SettingsPopup ref={popupRef} onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown} tabIndex={0}>
        <SettingsTitle>Settings</SettingsTitle>
        <SectionTitle>Sign In Methods</SectionTitle>
        <MethodsList>
          {renderMethodRow("eth", "Ethereum")}
          {renderMethodRow("sol", "Solana")}
          {renderMethodRow("apple", "Apple")}
        </MethodsList>
        <InfoText>{statusText}</InfoText>
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
