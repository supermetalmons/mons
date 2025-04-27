import React, { useState, useRef, useEffect } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import styled from "styled-components";
import { storage } from "../utils/storage";
import { forceTokenRefresh, signOut, verifySolanaAddress } from "../connection/connection";
import { didDismissSomethingWithOutsideTapJustNow } from "./BottomControls";
import { closeMenuAndInfoIfAny } from "./MainMenu";
import { setupLoggedInPlayerProfile, updateEmojiIfNeeded } from "../game/board";
import { setAuthStatusGlobally } from "../connection/authentication";
import { handleFreshlySignedInProfileInGameIfNeeded, isWatchOnly } from "../game/gameController";
import { NameEditModal } from "./NameEditModal";
import { defaultEarlyInputEventName } from "../utils/misc";
import { hideShinyCard, showShinyCard } from "./ShinyCard";

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
  --color-tint: #0e76fd;
  --color-dark-tint: #3898ff;

  --color-default: ${(props) => (props.isConnected ? "#f9f9f9de" : "#0e76fd")};
  --color-default-hover: ${(props) => (props.isConnected ? "#f5f5f5" : "#0069d9")};

  --color-dark-default: ${(props) => (props.isConnected ? "#252525d5" : "#3898ff")};
  --color-dark-default-hover: ${(props) => (props.isConnected ? "#272727" : "#1a91ff")};

  background-color: var(--color-default);

  padding: 8px 16px;
  font-weight: ${(props) => (props.isConnected ? "750" : "888")};
  font-size: ${(props) => (props.isConnected ? "0.9rem" : "0.95rem")};
  color: ${(props) => (props.isConnected ? "#767787c9" : "white")};
  border-radius: ${(props) => (props.isConnected ? "12px" : "8px")};
  border: none;
  cursor: pointer;

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background-color: var(--color-default-hover);
    }
  }

  @media (prefers-color-scheme: dark) {
    background-color: var(--color-dark-default);

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background-color: var(--color-dark-default-hover);
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
  background-color: white;
  border-radius: 12px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
  display: flex;
  flex-direction: column;
  gap: 8px;

  @media (prefers-color-scheme: dark) {
    background-color: #131313;
  }
`;

const CustomConnectButton = styled(BaseButton)`
  min-width: 130px;
  color: #000;
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-weight: bold;
  font-size: 0.81rem;
  cursor: pointer;

  background-color: #f9f9f9;

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background-color: #f5f5f5;
    }
  }

  @media (prefers-color-scheme: dark) {
    background-color: #252525;
    color: #f5f5f5;

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background-color: #272727;
      }
    }
  }
`;

const LogoutButton = styled(CustomConnectButton)`
  background-color: #ff4136;
  color: white;

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background-color: #e60000;
    }
  }

  @media (prefers-color-scheme: dark) {
    background-color: #cc0000;

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background-color: #b30000;
      }
    }
  }
`;
const EditNameButton = styled(CustomConnectButton)``;

let getIsProfilePopupOpen: () => boolean = () => false;
let getIsEditingPopupOpen: () => boolean = () => false;
export let closeProfilePopupIfAny: () => void = () => {};

export function hasProfilePopupVisible(): boolean {
  return getIsProfilePopupOpen() || getIsEditingPopupOpen();
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
  setProfileDisplayNameGlobal(formatDisplayName(username, ethAddress, solAddress));
};

export const ProfileSignIn: React.FC<{ authStatus?: string }> = ({ authStatus }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [solanaText, setSolanaText] = useState("Solana");
  const [isSolanaConnecting, setIsSolanaConnecting] = useState(false);
  const [profileDisplayName, setProfileDisplayName] = useState(() => formatDisplayName(pendingUsername, pendingEthAddress, pendingSolAddress));
  const [isEditingName, setIsEditingName] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  getIsEditingPopupOpen = () => isEditingName;
  getIsProfilePopupOpen = () => isOpen;
  setProfileDisplayNameGlobal = setProfileDisplayName;

  useEffect(() => {
    const handleClickOutside = (event: TouchEvent | MouseEvent) => {
      event.stopPropagation();
      const shinyCardElement = document.querySelector('[data-shiny-card="true"]');
      const isInsidePopover = popoverRef.current?.contains(event.target as Node) || false;
      const isInsideShinyCard = shinyCardElement?.contains(event.target as Node) || false;
      if (isOpen && !isInsidePopover && !isInsideShinyCard) {
        setIsOpen(false);
        didDismissSomethingWithOutsideTapJustNow();
        hideShinyCard();
      }
    };

    document.addEventListener(defaultEarlyInputEventName, handleClickOutside);
    return () => document.removeEventListener(defaultEarlyInputEventName, handleClickOutside);
  });

  const handleLogout = () => {
    storage.signOut();
    signOut()
      .then(() => window.location.reload())
      .catch(() => window.location.reload());
    setIsOpen(false);
  };

  closeProfilePopupIfAny = () => {
    setIsOpen(false);
    hideShinyCard();
  };

  const handleSignInClick = () => {
    if (authStatus === "authenticated") {
      if (isOpen) {
        hideShinyCard();
      } else {
        showShinyCard();
      }
    }

    if (!isOpen) {
      closeMenuAndInfoIfAny();
    }

    setIsOpen(!isOpen);
  };

  const handleEditDisplayName = () => {
    setIsEditingName(true);
    setIsOpen(false);
  };

  const handleSaveDisplayName = (newName: string) => {
    updateProfileDisplayName(newName, storage.getEthAddress(""), storage.getSolAddress(""));
    storage.setUsername(newName);
    setIsEditingName(false);
  };

  const handleCancelEditName = () => {
    didDismissSomethingWithOutsideTapJustNow();
    setIsEditingName(false);
  };

  const handleSolanaClick = async () => {
    if (isSolanaConnecting) {
      return;
    }

    setIsSolanaConnecting(true);
    try {
      const { connectToSolana } = await import("../connection/solanaConnection");
      const { publicKey, signature } = await connectToSolana();
      setSolanaText("Verifying...");
      const res = await verifySolanaAddress(publicKey, signature);
      if (res && res.ok === true) {
        const emoji = res.emoji;
        const profileId = res.profileId;
        const profile = {
          id: profileId,
          username: res.username,
          sol: res.address,
          rating: undefined,
          nonce: undefined,
          win: undefined,
          emoji: emoji,
        };
        setupLoggedInPlayerProfile(profile, res.uid);
        storage.setSolAddress(res.address);
        storage.setUsername(res.username);
        storage.setPlayerEmojiId(emoji.toString());
        storage.setProfileId(profileId);
        forceTokenRefresh();
        storage.setLoginId(res.uid);
        updateProfileDisplayName(res.username, null, res.address);
        if (!isWatchOnly) {
          updateEmojiIfNeeded(emoji, false);
        }
        setAuthStatusGlobally("authenticated");
        setIsOpen(false);
        handleFreshlySignedInProfileInGameIfNeeded(profileId);
      }
      setSolanaText("Solana");
    } catch (error) {
      if ((error as Error).message === "not found") {
        setSolanaText("Not Found");
        setTimeout(() => {
          setSolanaText("Solana");
        }, 500);
      } else {
        setSolanaText("Solana");
      }
    } finally {
      setIsSolanaConnecting(false);
    }
  };

  return (
    <Container ref={popoverRef}>
      <SignInButton onClick={handleSignInClick} isConnected={authStatus === "authenticated"}>
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
      {isEditingName && <NameEditModal initialName={storage.getUsername("")} onSave={handleSaveDisplayName} onCancel={handleCancelEditName} />}
    </Container>
  );
};

export default ProfileSignIn;
