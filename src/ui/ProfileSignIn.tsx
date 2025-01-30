import React, { useState, useRef, useEffect } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import styled from "styled-components";
import { storage } from "../utils/storage";
import { signOut } from "../connection/connection";
import { didDismissSomethingWithOutsideTapJustNow } from "./BottomControls";
import { closeMenuAndInfoIfAny } from "./MainMenu";

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

const LogoutButton = styled(CustomConnectButton)``;

let getIsProfilePopupOpen: () => boolean = () => false;
export let closeProfilePopupIfAny: () => void = () => {};

export function hasProfilePopupVisible(): boolean {
  return getIsProfilePopupOpen();
}

export const ProfileSignIn: React.FC<{ authStatus?: string }> = ({ authStatus }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [solanaText, setSolanaText] = useState("Solana");
  const popoverRef = useRef<HTMLDivElement>(null);

  getIsProfilePopupOpen = () => isOpen;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      event.stopPropagation();
      if (isOpen && popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        didDismissSomethingWithOutsideTapJustNow();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
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
  };

  const handleSignInClick = () => {
    if (!isOpen) {
      closeMenuAndInfoIfAny();
    }
    setIsOpen(!isOpen);
  };

  const handleSolanaClick = async () => {
    setSolanaText("Soon"); // TODO: remove dev tmp
    setTimeout(() => {
      setSolanaText("Solana");
    }, 500);

    try {
      const { connectToSolana } = await import("../connection/solanaConnection");
      setIsOpen(false);
      const publicKey = await connectToSolana();
      console.log("Connected to Solana wallet:", publicKey);
      // TODO: more handling
    } catch (error) {
      console.error("Failed to connect Solana wallet:", error);
      // TODO: more handling
    }
  };

  return (
    <Container ref={popoverRef}>
      <SignInButton onClick={handleSignInClick} isConnected={authStatus === "authenticated"}>
        {authStatus === "authenticated" ? "Connected" : "Sign In"}
      </SignInButton>

      {isOpen && (
        <ConnectButtonPopover>
          <ConnectButtonWrapper>
            {authStatus === "authenticated" ? (
              <LogoutButton onClick={handleLogout}>Sign Out</LogoutButton>
            ) : (
              <>
                <ConnectButton.Custom>{({ openConnectModal }) => <CustomConnectButton onClick={openConnectModal}>Ethereum</CustomConnectButton>}</ConnectButton.Custom>
                <CustomConnectButton onClick={handleSolanaClick}>{solanaText}</CustomConnectButton>
              </>
            )}
          </ConnectButtonWrapper>
        </ConnectButtonPopover>
      )}
    </Container>
  );
};

export default ProfileSignIn;
