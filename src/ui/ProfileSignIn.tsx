import React, { useState, useRef, useEffect } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import styled from "styled-components";
import { storage } from "../utils/storage";
import { connection } from "../connection/connection";
import { didDismissSomethingWithOutsideTapJustNow } from "./BottomControls";
import { closeMenuAndInfoIfAllowedForEvent, closeMenuAndInfoIfAny } from "./MainMenu";
import { setAuthStatusGlobally } from "../connection/authentication";
import { handleLoginSuccess } from "../connection/loginSuccess";
import { NameEditModal } from "./NameEditModal";
import { InventoryModal } from "./InventoryModal";
import { LogoutConfirmModal } from "./LogoutConfirmModal";
import { SettingsModal } from "./SettingsModal";
import { defaultEarlyInputEventName, isMobile } from "../utils/misc";
import { hideShinyCard, showShinyCard, showsShinyCardSomewhere, updateShinyCardDisplayName } from "./ShinyCard";
import { enterProfileEditingMode } from "../index";

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

const SignInButton = styled(BaseButton)<{ isConnected?: boolean }>`
  background-color: ${(props) => (props.isConnected ? "var(--color-gray-f9de)" : "var(--profileSigninTint)")};

  padding: 8px 16px;
  font-weight: ${(props) => (props.isConnected ? "750" : "888")};
  font-size: ${(props) => (props.isConnected ? "0.9rem" : "0.95rem")};
  color: ${(props) => (props.isConnected ? "var(--profileConnectedText)" : "white")};
  border-radius: ${(props) => (props.isConnected ? "16px" : "16px")};
  border: none;
  cursor: pointer;

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background-color: ${(props) => (props.isConnected ? "var(--color-gray-f5)" : "var(--bottomButtonBackgroundHover)")};
    }
  }

  @media (prefers-color-scheme: dark) {
    background-color: ${(props) => (props.isConnected ? "var(--color-gray-25d5)" : "var(--profileSigninTintDark)")};

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background-color: ${(props) => (props.isConnected ? "var(--color-gray-27)" : "var(--bottomButtonBackgroundHoverDark)")};
      }
    }
  }
`;

const ConnectButtonPopover = styled.div`
  position: absolute;
  right: 0;
  top: 100%;
  margin-top: 16px;
  z-index: 50;
`;

const ConnectButtonWrapper = styled.div`
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
  min-width: 130px;
  color: var(--color-black);
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-weight: bold;
  font-size: 0.81rem;
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

let getIsProfilePopupOpen: () => boolean = () => false;
let getIsEditingPopupOpen: () => boolean = () => false;
let getIsInventoryPopupOpen: () => boolean = () => false;
let getIsLogoutConfirmPopupOpen: () => boolean = () => false;
let getIsSettingsPopupOpen: () => boolean = () => false;
export let closeProfilePopupIfAny: () => void = () => {};
export let handleEditDisplayName: () => void;
export let showInventory: () => void;
export let handleLogout: () => void;
export let showSettings: () => void;
export let hideNotificationBanner: () => void = () => {};
export let showNotificationBanner: (title: string, subtitle: string, emojiId: string, successHandler: () => void) => void = () => {};

export function hasProfilePopupVisible(): boolean {
  return getIsProfilePopupOpen() || getIsEditingPopupOpen() || getIsInventoryPopupOpen() || getIsLogoutConfirmPopupOpen() || getIsSettingsPopupOpen();
}

let setProfileDisplayNameGlobal: ((name: string) => void) | null = null;
let pendingUsername: string | null = null;
let pendingEthAddress: string | null = null;
let pendingSolAddress: string | null = null;

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
  return "";
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

export const ProfileSignIn: React.FC<{ authStatus?: string }> = ({ authStatus }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [solanaText, setSolanaText] = useState("Solana");
  const [isSolanaConnecting, setIsSolanaConnecting] = useState(false);
  const [profileDisplayName, setProfileDisplayName] = useState(() => formatDisplayName(pendingUsername, pendingEthAddress, pendingSolAddress));
  const [isEditingName, setIsEditingName] = useState(false);
  const [isInventoryOpen, setIsInventoryOpen] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [NotificationComponent, setNotificationComponent] = useState<React.ComponentType<any> | null>(null);
  const [isNotificationVisible, setIsNotificationVisible] = useState(false);
  const [notificationState, setNotificationState] = useState<NotificationState | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

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

  const showNotificationBannerInternal = async (title: string, subtitle: string, emojiId: string, successHandler: () => void) => {
    try {
      const { NotificationBannerComponent } = await import("./NotificationBanner");
      setNotificationComponent(() => NotificationBannerComponent);
      setNotificationState({ title, subtitle, emojiId, successHandler });
      setIsNotificationVisible(true);
    } catch (error) {
      console.error("Failed to load notification component:", error);
    }
  };

  const hideNotificationBannerInternal = () => {
    setIsNotificationVisible(false);
    setNotificationState(null);
  };

  hideNotificationBanner = hideNotificationBannerInternal;
  showNotificationBanner = showNotificationBannerInternal;

  const performLogout = () => {
    storage.signOut();
    connection
      .signOut()
      .then(() => window.location.reload())
      .catch(() => window.location.reload());
  };

  handleLogout = () => {
    setIsLogoutConfirmOpen(true);
  };

  showSettings = () => {
    setIsSettingsOpen(true);
  };

  closeProfilePopupIfAny = () => {
    didDismissSomethingWithOutsideTapJustNow();
    setIsOpen(false);
    hideShinyCard();
    enterProfileEditingMode(false);
  };

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

  showInventory = () => {
    setIsInventoryOpen(true);
  };

  handleEditDisplayName = () => {
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
    setIsLogoutConfirmOpen(false);
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

  const handleSolanaClick = async () => {
    if (isSolanaConnecting) return;

    setIsSolanaConnecting(true);
    try {
      const { connectToSolana } = await import("../connection/solanaConnection");
      const { publicKey, signature } = await connectToSolana();
      setSolanaText("Verifying...");

      const res = await connection.verifySolanaAddress(publicKey, signature);
      if (res && res.ok === true) {
        handleLoginSuccess(res, "sol");
        setAuthStatusGlobally("authenticated");
        setIsOpen(false);
        hideShinyCard();
        enterProfileEditingMode(false);
      }

      setSolanaText("Solana");
    } catch (error) {
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

  const handleNotificationClick = () => {
    if (notificationState?.successHandler) {
      notificationState.successHandler();
    }
    setIsNotificationVisible(false);
  };

  const handleNotificationClose = () => {
    setIsNotificationVisible(false);
  };

  return (
    <Container ref={popoverRef}>
      <SignInButton onClick={!isMobile ? handleSignInClick : undefined} onTouchStart={isMobile ? handleSignInClick : undefined} isConnected={authStatus === "authenticated"}>
        {authStatus === "authenticated" ? profileDisplayName || "Connected" : "Sign In"}
      </SignInButton>
      {isOpen && authStatus !== "authenticated" && (
        <ConnectButtonPopover>
          <ConnectButtonWrapper>
            <>
              <ConnectButton.Custom>{({ openConnectModal }) => <CustomConnectButton onClick={openConnectModal}>Ethereum</CustomConnectButton>}</ConnectButton.Custom>
              <CustomConnectButton onClick={handleSolanaClick}>{solanaText}</CustomConnectButton>
            </>
          </ConnectButtonWrapper>
        </ConnectButtonPopover>
      )}
      {NotificationComponent && isNotificationVisible && notificationState && <NotificationComponent isVisible={isNotificationVisible} onClose={handleNotificationClose} onClick={handleNotificationClick} title={notificationState.title} subtitle={notificationState.subtitle} emojiId={notificationState.emojiId} />}
      {isEditingName && <NameEditModal initialName={storage.getUsername("")} onSave={handleSaveDisplayName} onCancel={handleCancelEditName} />}
      {isInventoryOpen && <InventoryModal onCancel={handleDismissInventory} />}
      {isLogoutConfirmOpen && <LogoutConfirmModal onConfirm={handleConfirmLogout} onCancel={handleCancelLogout} />}
      {isSettingsOpen && <SettingsModal onClose={handleCloseSettings} />}
    </Container>
  );
};

export default ProfileSignIn;
