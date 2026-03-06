import React, { useState, useRef, useEffect, useCallback } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { flushSync } from "react-dom";
import styled, { css } from "styled-components";
import { storage } from "../utils/storage";
import { connection } from "../connection/connection";
import { didDismissSomethingWithOutsideTapJustNow } from "./BottomControls";
import { closeMenuAndInfoIfAllowedForEvent, closeMenuAndInfoIfAny } from "./MainMenu";
import { setAuthStatusGlobally } from "../connection/authentication";
import { handleLoginSuccess } from "../connection/loginSuccess";
import { preloadAppleSignInLibrary, signInWithApplePopup } from "../connection/appleConnection";
import { preloadGoogleSignInLibrary, signInWithGooglePopup } from "../connection/googleConnection";
import { formatAuthCooldownErrorMessage } from "../connection/authCooldownErrors";
import { NameEditModal } from "./NameEditModal";
import { InventoryModal } from "./InventoryModal";
import { LogoutConfirmModal } from "./LogoutConfirmModal";
import { SettingsModal } from "./SettingsModal";
import { defaultEarlyInputEventName, isMobile } from "../utils/misc";
import { hideShinyCard, showShinyCard, showsShinyCardSomewhere, updateShinyCardDisplayName } from "./ShinyCard";
import { enterProfileEditingMode } from "../index";
import { registerProfileTransientUiHandler } from "./uiSession";
import { performLogoutCleanupAndReload } from "../session/logoutOrchestrator";

const Container = styled.div`
  position: relative;
`;

const BaseButton = styled.button`
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  outline: none;
  -webkit-touch-callout: none;
  touch-action: none;
`;

type SignInButtonVisualProps = {
  $isConnected?: boolean;
};

export const signInButtonVisualStyles = css<SignInButtonVisualProps>`
  background-color: ${(props) => (props.$isConnected ? "var(--color-gray-f9de)" : "var(--profileSigninTint)")};

  padding: 8px 16px;
  font-weight: ${(props) => (props.$isConnected ? "750" : "888")};
  font-size: ${(props) => (props.$isConnected ? "0.9rem" : "0.95rem")};
  color: ${(props) => (props.$isConnected ? "var(--profileConnectedText)" : "white")};
  border-radius: 16px;
  border: none;
  cursor: pointer;

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background-color: ${(props) => (props.$isConnected ? "var(--color-gray-f5)" : "var(--bottomButtonBackgroundHover)")};
    }
  }

  @media (prefers-color-scheme: dark) {
    background-color: ${(props) => (props.$isConnected ? "var(--color-gray-25d5)" : "var(--profileSigninTintDark)")};

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background-color: ${(props) => (props.$isConnected ? "var(--color-gray-27)" : "var(--bottomButtonBackgroundHoverDark)")};
      }
    }
  }
`;

const SignInButton = styled(BaseButton)<SignInButtonVisualProps>`
  ${signInButtonVisualStyles}
`;

const ConnectButtonPopover = styled.div`
  position: absolute;
  right: 0;
  top: 100%;
  margin-top: 16px;
  z-index: 50;
  width: 135px;
`;

const ConnectButtonWrapper = styled.div`
  width: 100%;
  box-sizing: border-box;
  padding: 8px;
  background-color: var(--color-white);
  border-radius: 12px;
  box-shadow: 0 6px 20px var(--notificationBannerShadow);
  display: flex;
  flex-direction: column;
  gap: 8px;

  @media (prefers-color-scheme: dark) {
    background-color: var(--color-deep-gray);
  }
`;

const CustomConnectButton = styled(BaseButton)`
  width: 100%;
  min-width: 0;
  color: var(--color-black);
  padding: 11px 14px;
  border: none;
  border-radius: 8px;
  font-weight: bold;
  font-size: 0.81rem;
  text-align: center;
  white-space: nowrap;
  cursor: pointer;

  background-color: var(--color-gray-f9);

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background-color: var(--color-gray-f5);
    }
  }

  @media (prefers-color-scheme: dark) {
    background-color: var(--color-gray-25);
    color: var(--color-gray-f5);

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background-color: var(--color-gray-27);
      }
    }
  }
`;

const InlineAuthError = styled.div`
  width: 100%;
  box-sizing: border-box;
  border-radius: 8px;
  background: rgba(220, 53, 69, 0.08);
  color: var(--dangerButtonBackground);
  font-size: 0.74rem;
  line-height: 1.35;
  padding: 8px 9px;
  text-align: left;

  @media (prefers-color-scheme: dark) {
    background: rgba(220, 53, 69, 0.22);
    color: var(--dangerButtonBackgroundDark);
  }
`;

let getIsProfilePopupOpen: () => boolean = () => false;
let getIsEditingPopupOpen: () => boolean = () => false;
let getIsInventoryPopupOpen: () => boolean = () => false;
let getIsLogoutConfirmPopupOpen: () => boolean = () => false;
let getIsSettingsPopupOpen: () => boolean = () => false;
let closeProfilePopupIfAnyImpl: () => void = () => {};
let handleEditDisplayNameImpl: () => void = () => {};
let showInventoryImpl: () => void = () => {};
let handleLogoutImpl: () => void = () => {};
let showSettingsImpl: () => void = () => {};
let hideNotificationBannerImpl: () => void = () => {};
let showNotificationBannerImpl: (title: string, subtitle: string, emojiId: string, successHandler: () => void) => void = () => {};
let setSignInInlineAuthErrorImpl: (message: string | null) => void = () => {};
let openProfileSignInPopupImpl: () => void = () => {};

export const closeProfilePopupIfAny = () => {
  closeProfilePopupIfAnyImpl();
};

export const handleEditDisplayName = () => {
  handleEditDisplayNameImpl();
};

export const showInventory = () => {
  showInventoryImpl();
};

export const handleLogout = () => {
  handleLogoutImpl();
};

export const showSettings = () => {
  showSettingsImpl();
};

export const hideNotificationBanner = () => {
  hideNotificationBannerImpl();
};

export const showNotificationBanner = (title: string, subtitle: string, emojiId: string, successHandler: () => void) => {
  showNotificationBannerImpl(title, subtitle, emojiId, successHandler);
};

export const setSignInInlineAuthError = (message: string | null) => {
  setSignInInlineAuthErrorImpl(message);
};

export const openProfileSignInPopup = () => {
  openProfileSignInPopupImpl();
};

export function hasProfilePopupVisible(): boolean {
  return getIsProfilePopupOpen() || getIsEditingPopupOpen() || getIsInventoryPopupOpen() || getIsLogoutConfirmPopupOpen() || getIsSettingsPopupOpen();
}

let setProfileDisplayNameGlobal: ((name: string) => void) | null = null;
let pendingUsername: string | null = null;
let pendingEthAddress: string | null = null;
let pendingSolAddress: string | null = null;
const LOGOUT_UI_RECOVERY_TIMEOUT_MS = 5000;
const LOGOUT_SIGN_OUT_FALLBACK_DELAY_MS = 700;
const LOGOUT_UI_LAST_RESORT_UNLOCK_TIMEOUT_MS = 12000;
let logoutUiRecoveryTimeoutId: number | null = null;
let logoutUiLastResortUnlockTimeoutId: number | null = null;
let latestLogoutAttemptId = 0;
let finalizedLogoutAttemptId: number | null = null;
let isLogoutUiLockedGlobal = false;
const logoutUiLockListeners = new Set<(isLocked: boolean) => void>();

const setLogoutUiLocked = (isLocked: boolean) => {
  if (isLogoutUiLockedGlobal === isLocked) {
    return;
  }
  isLogoutUiLockedGlobal = isLocked;
  logoutUiLockListeners.forEach((listener) => {
    try {
      listener(isLocked);
    } catch {}
  });
};

export const isLogoutUiLocked = (): boolean => {
  return isLogoutUiLockedGlobal;
};

export const subscribeToLogoutUiLock = (listener: (isLocked: boolean) => void): (() => void) => {
  logoutUiLockListeners.add(listener);
  return () => {
    logoutUiLockListeners.delete(listener);
  };
};

const clearLogoutUiRecoveryTimeout = () => {
  if (logoutUiRecoveryTimeoutId !== null) {
    window.clearTimeout(logoutUiRecoveryTimeoutId);
    logoutUiRecoveryTimeoutId = null;
  }
};

const clearLogoutUiLastResortUnlockTimeout = () => {
  if (logoutUiLastResortUnlockTimeoutId !== null) {
    window.clearTimeout(logoutUiLastResortUnlockTimeoutId);
    logoutUiLastResortUnlockTimeoutId = null;
  }
};

const beginLogoutAttempt = (): number => {
  clearLogoutUiRecoveryTimeout();
  clearLogoutUiLastResortUnlockTimeout();
  latestLogoutAttemptId += 1;
  finalizedLogoutAttemptId = null;
  setLogoutUiLocked(true);
  return latestLogoutAttemptId;
};

const armLogoutUiLastResortUnlockTimeout = (logoutAttemptId: number) => {
  clearLogoutUiLastResortUnlockTimeout();
  logoutUiLastResortUnlockTimeoutId = window.setTimeout(() => {
    logoutUiLastResortUnlockTimeoutId = null;
    if (latestLogoutAttemptId !== logoutAttemptId) {
      return;
    }
    setLogoutUiLocked(false);
    // Last resort only: if navigation keeps failing, restore controls so user is not trapped.
    setAuthStatusGlobally("unauthenticated");
  }, LOGOUT_UI_LAST_RESORT_UNLOCK_TIMEOUT_MS);
};

const armLogoutUiRecoveryTimeout = (logoutAttemptId: number) => {
  clearLogoutUiRecoveryTimeout();
  logoutUiRecoveryTimeoutId = window.setTimeout(() => {
    logoutUiRecoveryTimeoutId = null;
    if (latestLogoutAttemptId !== logoutAttemptId) {
      return;
    }
    if (finalizedLogoutAttemptId !== logoutAttemptId) {
      finalizedLogoutAttemptId = logoutAttemptId;
    }
    // Keep auth controls hidden while forcing a heavier retry.
    setAuthStatusGlobally("loading");
    // If sign out is stalled or reload failed, still force canonical logout cleanup + reload.
    armLogoutUiLastResortUnlockTimeout(logoutAttemptId);
    void performLogoutCleanupAndReload({ cleanupMode: "thorough" });
  }, LOGOUT_UI_RECOVERY_TIMEOUT_MS);
};

const isLatestLogoutAttempt = (logoutAttemptId: number): boolean => {
  return latestLogoutAttemptId === logoutAttemptId;
};

const didFinalizeLogoutAttempt = (logoutAttemptId: number): boolean => {
  return finalizedLogoutAttemptId === logoutAttemptId;
};

const formatDisplayName = (username: string | null, ethAddress: string | null, solAddress: string | null): string => {
  if (username) {
    return username;
  } else if (ethAddress) {
    return ethAddress.slice(0, 4) + "..." + ethAddress.slice(-4);
  } else if (solAddress) {
    return solAddress.slice(0, 4) + "..." + solAddress.slice(-4);
  }
  pendingUsername = null;
  pendingEthAddress = null;
  pendingSolAddress = null;
  return "anon";
};

export const updateProfileDisplayName = (username: string | null, ethAddress: string | null, solAddress: string | null) => {
  if (!setProfileDisplayNameGlobal) {
    pendingUsername = username ?? null;
    pendingEthAddress = ethAddress ?? null;
    pendingSolAddress = solAddress ?? null;
    return;
  }
  const newDisplayName = formatDisplayName(username, ethAddress, solAddress);
  setProfileDisplayNameGlobal(newDisplayName);
  updateShinyCardDisplayName(newDisplayName);
};

interface NotificationState {
  title: string;
  subtitle: string;
  emojiId: string;
  successHandler: () => void;
}

type AuthIntentResponse = {
  ok: boolean;
  intentId: string;
  nonce: string;
  state: string;
  expiresAtMs: number;
};

const APPLE_INTENT_REFRESH_BUFFER_MS = 30 * 1000;
const GOOGLE_INTENT_REFRESH_BUFFER_MS = 30 * 1000;

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

const isGoogleIntentUsable = (intent: AuthIntentResponse | null): intent is AuthIntentResponse => {
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
    intent.expiresAtMs - Date.now() > GOOGLE_INTENT_REFRESH_BUFFER_MS;
};

type AppleButtonUiState = "idle" | "preparing" | "confirm" | "connecting" | "verifying";
type GoogleButtonUiState = "idle" | "connecting" | "verifying";

const getAppleButtonLabel = (state: AppleButtonUiState): string => {
  if (state === "preparing") {
    return "Preparing...";
  }
  if (state === "confirm") {
    return "Apple";
  }
  if (state === "connecting") {
    return "Apple";
  }
  if (state === "verifying") {
    return "Verifying...";
  }
  return "Apple";
};

const getGoogleButtonLabel = (state: GoogleButtonUiState): string => {
  if (state === "connecting") {
    return "Google";
  }
  if (state === "verifying") {
    return "Verifying...";
  }
  return "Google";
};

export const ProfileSignIn: React.FC<{ authStatus?: string }> = ({ authStatus }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [solanaText, setSolanaText] = useState("Solana");
  const [inlineAuthError, setInlineAuthError] = useState("");
  const [appleButtonState, setAppleButtonState] = useState<AppleButtonUiState>("idle");
  const [googleButtonState, setGoogleButtonState] = useState<GoogleButtonUiState>("idle");
  const [isSolanaConnecting, setIsSolanaConnecting] = useState(false);
  const [profileDisplayName, setProfileDisplayName] = useState(() => formatDisplayName(pendingUsername, pendingEthAddress, pendingSolAddress));
  const [isEditingName, setIsEditingName] = useState(false);
  const [isInventoryOpen, setIsInventoryOpen] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [NotificationComponent, setNotificationComponent] = useState<React.ComponentType<any> | null>(null);
  const [isNotificationVisible, setIsNotificationVisible] = useState(false);
  const [notificationState, setNotificationState] = useState<NotificationState | null>(null);
  const [isNotificationMounted, setIsNotificationMounted] = useState(false);
  const [notificationDismissType, setNotificationDismissType] = useState<"click" | "close" | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const notificationTimeoutRef = useRef<number | null>(null);
  const appleIntentRef = useRef<AuthIntentResponse | null>(null);
  const appleIntentPromiseRef = useRef<Promise<AuthIntentResponse> | null>(null);
  const googleIntentRef = useRef<AuthIntentResponse | null>(null);
  const googleIntentPromiseRef = useRef<Promise<AuthIntentResponse> | null>(null);
  const appleConfirmExpiryTimeoutRef = useRef<number | null>(null);
  const ethereumConnectModalRef = useRef<(() => void) | null>(null);
  const ethereumConnectRetryTimeoutRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);
  const isOpenRef = useRef(isOpen);
  const authStatusRef = useRef(authStatus);
  const latestAppleActionRef = useRef(0);

  const appleText = getAppleButtonLabel(appleButtonState);
  const googleText = getGoogleButtonLabel(googleButtonState);
  const isAppleBusy = appleButtonState === "preparing" || appleButtonState === "connecting" || appleButtonState === "verifying";
  const isGoogleBusy = googleButtonState === "connecting" || googleButtonState === "verifying";

  const clearAppleConfirmExpiryTimeout = useCallback(() => {
    if (appleConfirmExpiryTimeoutRef.current) {
      window.clearTimeout(appleConfirmExpiryTimeoutRef.current);
      appleConfirmExpiryTimeoutRef.current = null;
    }
  }, []);

  const clearEthereumConnectRetryTimeout = useCallback(() => {
    if (ethereumConnectRetryTimeoutRef.current !== null) {
      window.clearTimeout(ethereumConnectRetryTimeoutRef.current);
      ethereumConnectRetryTimeoutRef.current = null;
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

  getIsInventoryPopupOpen = () => isInventoryOpen;
  getIsEditingPopupOpen = () => isEditingName;
  getIsProfilePopupOpen = () => isOpen;
  getIsLogoutConfirmPopupOpen = () => isLogoutConfirmOpen;
  getIsSettingsPopupOpen = () => isSettingsOpen;
  setProfileDisplayNameGlobal = setProfileDisplayName;

  useEffect(() => {
    const handleClickOutside = (event: TouchEvent | MouseEvent) => {
      event.stopPropagation();
      const target = event.target as Node;
      const shinyCardElement = document.querySelector('[data-shiny-card="true"]');
      const isInsidePopover = popoverRef.current?.contains(target) || false;
      const isInsideShinyCard = shinyCardElement?.contains(target) || false;

      if (target instanceof Element && target.closest(".info-button, .sound-button, .music-button, tr, .shiny-card-done-button")) {
        return;
      }

      if ((isOpen || showsShinyCardSomewhere) && !isInsidePopover && !isInsideShinyCard) {
        didDismissSomethingWithOutsideTapJustNow();
        setIsOpen(false);
        hideShinyCard();
        enterProfileEditingMode(false);
        if (!isMobile) {
          closeMenuAndInfoIfAllowedForEvent(event);
        }
      }
    };

    document.addEventListener(defaultEarlyInputEventName, handleClickOutside);
    return () => document.removeEventListener(defaultEarlyInputEventName, handleClickOutside);
  });

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      clearEthereumConnectRetryTimeout();
      clearAppleConfirmExpiryTimeout();
      googleIntentRef.current = null;
      googleIntentPromiseRef.current = null;
      if (notificationTimeoutRef.current) {
        clearTimeout(notificationTimeoutRef.current);
      }
    };
  }, [clearAppleConfirmExpiryTimeout, clearEthereumConnectRetryTimeout]);

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    authStatusRef.current = authStatus;
  }, [authStatus]);

  useEffect(() => {
    if (isOpen) {
      return;
    }
    ethereumConnectModalRef.current = null;
    clearEthereumConnectRetryTimeout();
  }, [isOpen, clearEthereumConnectRetryTimeout]);

  useEffect(() => {
    if (authStatus === "authenticated" && appleButtonState !== "idle") {
      setAppleButtonState("idle");
      return;
    }
    if (authStatus === "authenticated" || !isOpen || appleButtonState !== "confirm") {
      return;
    }
    if (!isAppleIntentUsable(appleIntentRef.current)) {
      setAppleButtonState("idle");
    }
  }, [authStatus, isOpen, appleButtonState]);

  useEffect(() => {
    if (authStatus === "authenticated" && googleButtonState !== "idle") {
      setGoogleButtonState("idle");
    }
  }, [authStatus, googleButtonState]);

  useEffect(() => {
    if (appleButtonState !== "confirm") {
      clearAppleConfirmExpiryTimeout();
      return;
    }
    scheduleAppleConfirmExpiryTimeout();
    return clearAppleConfirmExpiryTimeout;
  }, [appleButtonState, clearAppleConfirmExpiryTimeout, scheduleAppleConfirmExpiryTimeout]);

  useEffect(() => {
    if (authStatus === "loading") {
      return;
    }
    clearLogoutUiRecoveryTimeout();
    clearLogoutUiLastResortUnlockTimeout();
    setLogoutUiLocked(false);
  }, [authStatus]);

  const beginImmediateLogoutUiCleanup = useCallback(() => {
    setLogoutUiLocked(true);
    setIsOpen(false);
    setIsInventoryOpen(false);
    setIsLogoutConfirmOpen(false);
    setIsSettingsOpen(false);
    setIsEditingName(false);
    hideShinyCard();
    enterProfileEditingMode(false);
    // Keep auth controls hidden until the hard reload lands to avoid flicker.
    setAuthStatusGlobally("loading");
  }, []);

  const showNotificationBannerInternal = async (title: string, subtitle: string, emojiId: string, successHandler: () => void) => {
    if (notificationTimeoutRef.current) {
      clearTimeout(notificationTimeoutRef.current);
      notificationTimeoutRef.current = null;
    }

    try {
      const { NotificationBannerComponent } = await import("./NotificationBanner");
      setNotificationComponent(() => NotificationBannerComponent);
      setNotificationState({ title, subtitle, emojiId, successHandler });
      setNotificationDismissType(null);
      setIsNotificationMounted(true);

      requestAnimationFrame(() => {
        setIsNotificationVisible(true);
      });
    } catch (error) {
      console.error("Failed to load notification component:", error);
    }
  };

  const hideNotificationBannerInternal = useCallback(() => {
    if (notificationTimeoutRef.current) {
      clearTimeout(notificationTimeoutRef.current);
      notificationTimeoutRef.current = null;
    }

    setIsNotificationVisible(false);

    notificationTimeoutRef.current = window.setTimeout(() => {
      setIsNotificationMounted(false);
      setNotificationState(null);
      setNotificationDismissType(null);
      notificationTimeoutRef.current = null;
    }, 400);
  }, []);

  hideNotificationBannerImpl = hideNotificationBannerInternal;
  showNotificationBannerImpl = showNotificationBannerInternal;

  const performLogout = () => {
    const logoutAttemptId = beginLogoutAttempt();
    beginImmediateLogoutUiCleanup();
    armLogoutUiRecoveryTimeout(logoutAttemptId);
    let didStartFinalReset = false;
    const finalizeLogout = () => {
      if (didStartFinalReset) {
        return;
      }
      if (!isLatestLogoutAttempt(logoutAttemptId)) {
        return;
      }
      if (didFinalizeLogoutAttempt(logoutAttemptId)) {
        return;
      }
      finalizedLogoutAttemptId = logoutAttemptId;
      didStartFinalReset = true;
      void performLogoutCleanupAndReload();
    };
    const fallbackTimeoutId = window.setTimeout(() => {
      finalizeLogout();
    }, LOGOUT_SIGN_OUT_FALLBACK_DELAY_MS);
    connection
      .signOut()
      .catch(() => {})
      .finally(() => {
        window.clearTimeout(fallbackTimeoutId);
        finalizeLogout();
      });
  };

  const closeProfilePopupInternal = useCallback(() => {
    didDismissSomethingWithOutsideTapJustNow();
    setIsOpen(false);
    setIsInventoryOpen(false);
    setIsLogoutConfirmOpen(false);
    setIsSettingsOpen(false);
    setIsEditingName(false);
    hideShinyCard();
    enterProfileEditingMode(false);
  }, []);

  useEffect(() => {
    return registerProfileTransientUiHandler(hideNotificationBannerInternal, closeProfilePopupInternal);
  }, [closeProfilePopupInternal, hideNotificationBannerInternal]);

  handleLogoutImpl = () => {
    setIsLogoutConfirmOpen(true);
  };

  showSettingsImpl = () => {
    setIsSettingsOpen(true);
  };

  const openProfileSignInPopupInternal = useCallback(() => {
    if (authStatus === "authenticated" || isOpen) {
      return;
    }
    closeMenuAndInfoIfAny();
    setIsOpen(true);
  }, [authStatus, isOpen]);

  closeProfilePopupIfAnyImpl = closeProfilePopupInternal;
  openProfileSignInPopupImpl = openProfileSignInPopupInternal;

  useEffect(() => {
    return () => {
      closeProfilePopupIfAnyImpl = () => {};
      handleEditDisplayNameImpl = () => {};
      showInventoryImpl = () => {};
      handleLogoutImpl = () => {};
      showSettingsImpl = () => {};
      hideNotificationBannerImpl = () => {};
      showNotificationBannerImpl = () => {};
      setSignInInlineAuthErrorImpl = () => {};
      openProfileSignInPopupImpl = () => {};
    };
  }, []);

  useEffect(() => {
    setSignInInlineAuthErrorImpl = (message) => {
      if (!isMountedRef.current) {
        return;
      }
      setInlineAuthError(typeof message === "string" ? message : "");
    };
    return () => {
      setSignInInlineAuthErrorImpl = () => {};
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      return;
    }
    setInlineAuthError("");
  }, [isOpen]);

  const handleSignInClick = () => {
    if (authStatus === "authenticated") {
      if (isOpen) {
        hideShinyCard();
        enterProfileEditingMode(false);
      } else {
        showShinyCard(null, profileDisplayName, false);
        enterProfileEditingMode(true);
      }
    }

    if (!isOpen) {
      closeMenuAndInfoIfAny();
    }

    setIsOpen(!isOpen);
  };

  showInventoryImpl = () => {
    setIsInventoryOpen(true);
  };

  handleEditDisplayNameImpl = () => {
    setIsEditingName(true);
  };

  const handleSaveDisplayName = (newName: string) => {
    updateProfileDisplayName(newName, storage.getEthAddress(""), storage.getSolAddress(""));
    storage.setUsername(newName);
    setIsEditingName(false);
  };

  const handleDismissInventory = () => {
    didDismissSomethingWithOutsideTapJustNow();
    setIsInventoryOpen(false);
  };

  const handleCancelEditName = () => {
    didDismissSomethingWithOutsideTapJustNow();
    setIsEditingName(false);
  };

  const handleConfirmLogout = () => {
    performLogout();
  };

  const handleCancelLogout = () => {
    didDismissSomethingWithOutsideTapJustNow();
    setIsLogoutConfirmOpen(false);
  };

  const handleCloseSettings = () => {
    didDismissSomethingWithOutsideTapJustNow();
    setIsSettingsOpen(false);
  };

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

  const ensurePreparedGoogleIntent = useCallback(async (): Promise<AuthIntentResponse> => {
    if (isGoogleIntentUsable(googleIntentRef.current)) {
      return googleIntentRef.current;
    }
    if (!googleIntentPromiseRef.current) {
      const pendingIntentPromise = connection
        .beginAuthIntent("google")
        .then((intent) => {
          if (googleIntentPromiseRef.current === pendingIntentPromise) {
            googleIntentRef.current = intent;
          }
          return intent;
        })
        .finally(() => {
          if (googleIntentPromiseRef.current === pendingIntentPromise) {
            googleIntentPromiseRef.current = null;
          }
        });
      googleIntentPromiseRef.current = pendingIntentPromise;
    }
    return googleIntentPromiseRef.current;
  }, []);

  const takePreparedGoogleIntent = useCallback((): AuthIntentResponse | null => {
    if (!isGoogleIntentUsable(googleIntentRef.current)) {
      googleIntentRef.current = null;
      return null;
    }
    const intent = googleIntentRef.current;
    googleIntentRef.current = null;
    return intent;
  }, []);

  useEffect(() => {
    if (!isOpen || authStatus === "authenticated") {
      return;
    }
    void import("../connection/solanaConnection").catch(() => {});
    void preloadAppleSignInLibrary().catch(() => {});
    void preloadGoogleSignInLibrary().catch(() => {});
    void ensurePreparedGoogleIntent().catch(() => {});
    void ensurePreparedAppleIntent().catch(() => {});
  }, [isOpen, authStatus, ensurePreparedAppleIntent, ensurePreparedGoogleIntent]);

  const handleGoogleClick = async () => {
    if (isGoogleBusy) {
      return;
    }
    setInlineAuthError("");
    setGoogleButtonState("connecting");
    try {
      const intent = takePreparedGoogleIntent() || await connection.beginAuthIntent("google");
      const signInResult = await signInWithGooglePopup({ nonce: intent.nonce });
      setGoogleButtonState("verifying");
      const res = await connection.verifyGoogleToken(intent.intentId, signInResult.idToken, "signin");
      if (res && res.ok === true) {
        setInlineAuthError("");
        handleLoginSuccess(res, "google");
        setGoogleButtonState("idle");
        setAuthStatusGlobally("authenticated");
        setIsOpen(false);
        hideShinyCard();
        enterProfileEditingMode(false);
        return;
      }
      setGoogleButtonState("idle");
    } catch (error) {
      const cooldownMessage = formatAuthCooldownErrorMessage(error);
      if (cooldownMessage) {
        setInlineAuthError(cooldownMessage);
      } else if (error instanceof Error && error.message.trim() !== "") {
        setInlineAuthError(error.message);
      } else {
        setInlineAuthError("Google sign in failed. Please try again.");
      }
      setGoogleButtonState("idle");
      if (isOpenRef.current && authStatusRef.current !== "authenticated") {
        void ensurePreparedGoogleIntent().catch(() => {});
      }
    }
  };

  const handleSolanaClick = async () => {
    if (isSolanaConnecting) return;

    setInlineAuthError("");
    setIsSolanaConnecting(true);
    try {
      const { connectToSolana } = await import("../connection/solanaConnection");
      const { publicKey, signature, intentId } = await connectToSolana();
      setSolanaText("Verifying...");

      const res = await connection.verifySolanaAddress(publicKey, signature, intentId);
      if (res && res.ok === true) {
        setInlineAuthError("");
        handleLoginSuccess(res, "sol");
        setAuthStatusGlobally("authenticated");
        setIsOpen(false);
        hideShinyCard();
        enterProfileEditingMode(false);
      }

      setSolanaText("Solana");
    } catch (error) {
      const cooldownMessage = formatAuthCooldownErrorMessage(error);
      if (cooldownMessage) {
        setInlineAuthError(cooldownMessage);
      }
      if ((error as Error).message === "not found") {
        setSolanaText("Not Found");
        setTimeout(() => setSolanaText("Solana"), 500);
      } else {
        setSolanaText("Solana");
      }
    } finally {
      setIsSolanaConnecting(false);
    }
  };

  const handleAppleClick = async () => {
    if (isAppleBusy) {
      return;
    }

    setInlineAuthError("");
    const actionId = latestAppleActionRef.current + 1;
    latestAppleActionRef.current = actionId;
    const isActionCurrent = () => latestAppleActionRef.current === actionId;
    const setAppleStateIfMounted = (nextState: AppleButtonUiState) => {
      if (isMountedRef.current && isActionCurrent()) {
        setAppleButtonState(nextState);
      }
    };
    try {
      const intent = takePreparedAppleIntent();
      if (!intent) {
        setAppleStateIfMounted("preparing");
        await Promise.all([preloadAppleSignInLibrary(), ensurePreparedAppleIntent()]);
        if (!isActionCurrent()) {
          return;
        }
        if (!isAppleIntentUsable(appleIntentRef.current)) {
          setAppleStateIfMounted("idle");
          return;
        }
        if (isMountedRef.current) {
          if (isOpenRef.current && authStatusRef.current !== "authenticated") {
            setAppleButtonState("confirm");
          } else {
            setAppleButtonState("idle");
          }
        }
        return;
      }
      if (isMountedRef.current && isActionCurrent()) {
        flushSync(() => {
          setAppleButtonState("connecting");
        });
      }
      const signInResult = await signInWithApplePopup({
        nonce: intent.nonce,
        state: intent.state,
        intentId: intent.intentId,
        expiresAtMs: intent.expiresAtMs,
        consentSource: "signin",
      });
      if (!signInResult) {
        setAppleStateIfMounted("idle");
        return;
      }
      if (!isActionCurrent()) {
        return;
      }
      const { idToken } = signInResult;
      setAppleStateIfMounted("verifying");
      const res = await connection.verifyAppleToken(intent.intentId, idToken, "signin");
      if (!isActionCurrent()) {
        return;
      }
      if (res && res.ok === true) {
        setInlineAuthError("");
        handleLoginSuccess(res, "apple");
        setAppleStateIfMounted("idle");
        setAuthStatusGlobally("authenticated");
        setIsOpen(false);
        hideShinyCard();
        enterProfileEditingMode(false);
        return;
      }
      setAppleStateIfMounted("idle");
    } catch (error) {
      console.error("Apple sign in error:", error);
      const cooldownMessage = formatAuthCooldownErrorMessage(error);
      if (cooldownMessage) {
        setInlineAuthError(cooldownMessage);
      }
      setAppleStateIfMounted("idle");
    }
  };

  const handleEthereumClick = useCallback(() => {
    setInlineAuthError("");
    const openConnectModal = ethereumConnectModalRef.current;
    if (openConnectModal) {
      clearEthereumConnectRetryTimeout();
      openConnectModal();
      return;
    }

    clearEthereumConnectRetryTimeout();
    const startedAtMs = Date.now();
    const tryOpenConnectModal = () => {
      if (!isMountedRef.current || !isOpenRef.current || authStatusRef.current === "authenticated") {
        clearEthereumConnectRetryTimeout();
        return;
      }
      const modalOpener = ethereumConnectModalRef.current;
      if (modalOpener) {
        clearEthereumConnectRetryTimeout();
        modalOpener();
        return;
      }
      if (Date.now() - startedAtMs >= 1000) {
        clearEthereumConnectRetryTimeout();
        return;
      }
      ethereumConnectRetryTimeoutRef.current = window.setTimeout(tryOpenConnectModal, 40);
    };

    ethereumConnectRetryTimeoutRef.current = window.setTimeout(tryOpenConnectModal, 0);
  }, [clearEthereumConnectRetryTimeout]);

  const handleNotificationClick = () => {
    if (notificationState?.successHandler) {
      notificationState.successHandler();
    }
    setNotificationDismissType("click");
    setIsNotificationVisible(false);
  };

  const handleNotificationClose = () => {
    setNotificationDismissType("close");
    setIsNotificationVisible(false);
  };

  return (
    <Container ref={popoverRef}>
      <SignInButton onClick={!isMobile ? handleSignInClick : undefined} onTouchStart={isMobile ? handleSignInClick : undefined} $isConnected={authStatus === "authenticated"}>
        {authStatus === "authenticated" ? profileDisplayName || "Connected" : "Sign In"}
      </SignInButton>
      {isOpen && authStatus !== "authenticated" && (
        <ConnectButtonPopover>
          <ConnectButtonWrapper>
            <>
              <ConnectButton.Custom>
                {({ openConnectModal }) => {
                  ethereumConnectModalRef.current = openConnectModal ?? null;
                  return <CustomConnectButton onClick={!isMobile ? handleEthereumClick : undefined} onTouchStart={isMobile ? handleEthereumClick : undefined}>Ethereum</CustomConnectButton>;
                }}
              </ConnectButton.Custom>
              <CustomConnectButton onClick={!isMobile ? handleSolanaClick : undefined} onTouchStart={isMobile ? handleSolanaClick : undefined}>
                {solanaText}
              </CustomConnectButton>
              <CustomConnectButton onClick={!isMobile ? handleGoogleClick : undefined} onTouchStart={isMobile ? handleGoogleClick : undefined}>
                {googleText}
              </CustomConnectButton>
              <CustomConnectButton onClick={handleAppleClick}>
                {appleText}
              </CustomConnectButton>
              {inlineAuthError ? <InlineAuthError>{inlineAuthError}</InlineAuthError> : null}
            </>
          </ConnectButtonWrapper>
        </ConnectButtonPopover>
      )}
      {NotificationComponent && isNotificationMounted && notificationState && <NotificationComponent isVisible={isNotificationVisible} onClose={handleNotificationClose} onClick={handleNotificationClick} title={notificationState.title} subtitle={notificationState.subtitle} emojiId={notificationState.emojiId} dismissType={notificationDismissType} />}
      {isEditingName && <NameEditModal initialName={storage.getUsername("")} onSave={handleSaveDisplayName} onCancel={handleCancelEditName} />}
      {isInventoryOpen && <InventoryModal onCancel={handleDismissInventory} />}
      {isLogoutConfirmOpen && <LogoutConfirmModal onConfirm={handleConfirmLogout} onCancel={handleCancelLogout} />}
      {isSettingsOpen && <SettingsModal onClose={handleCloseSettings} />}
    </Container>
  );
};

export default ProfileSignIn;
