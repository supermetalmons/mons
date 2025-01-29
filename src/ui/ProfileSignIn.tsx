import React, { useState, useRef, useEffect } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import styled from "styled-components";
import { storage } from "../utils/storage";
import { signOut } from "../connection/connection";

const Container = styled.div`
  position: relative;
`;

const SignInButton = styled.button`
  --color-tint: #007aff;
  --color-dark-tint: #0b84ff;

  --color-default: #007aff;
  --color-default-hover: #0069d9;
  --color-default-active: #0056b3;
  --color-dark-default: #0b84ff;
  --color-dark-default-hover: #1a91ff;
  --color-dark-default-active: #299fff;

  background-color: var(--color-default);

  padding: 8px 16px;
  font-weight: 888;
  color: white;
  border-radius: 8px;
  transition: background-color 0.2s;
  border: none;
  cursor: pointer;

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background-color: var(--color-default-hover);
    }
  }

  &:active {
    background-color: var(--color-default-active);
  }

  @media (prefers-color-scheme: dark) {
    background-color: var(--color-dark-default);

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background-color: var(--color-dark-default-hover);
      }
    }

    &:active {
      background-color: var(--color-dark-default-active);
    }
  }
`;

const ConnectButtonPopover = styled.div`
  position: absolute;
  right: 0;
  top: 100%;
  margin-top: 8px;
  z-index: 50;
`;

const ConnectButtonWrapper = styled.div`
  padding: 16px;
  background-color: white;
  border-radius: 12px;
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
  display: flex;
  flex-direction: column;
  gap: 8px;

  @media (prefers-color-scheme: dark) {
    background-color: #1f1f1f;
  }
`;

const CustomConnectButton = styled.button`
  background-color: #627eea;
  color: white;
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-weight: bold;
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    background-color: #4c63bc;
  }

  &:active {
    background-color: #405291;
  }
`;

const SolanaButton = styled(CustomConnectButton)`
  background-color: #9945ff;
  opacity: 0.5;
  cursor: not-allowed;

  &:hover {
    background-color: #9945ff;
  }

  &:active {
    background-color: #9945ff;
  }
`;

const LogoutButton = styled(CustomConnectButton)`
  min-width: 100px;
  background-color: #dc3545;

  &:hover {
    background-color: #c82333;
  }

  &:active {
    background-color: #bd2130;
  }
`;

export const ProfileSignIn: React.FC<{ authStatus?: string }> = ({ authStatus }) => {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = () => {
    storage.signOut();
    signOut()
      .then(() => window.location.reload())
      .catch(() => window.location.reload());
    setIsOpen(false);
  };

  return (
    <Container ref={popoverRef}>
      <SignInButton onClick={() => setIsOpen(!isOpen)}>{authStatus === "authenticated" ? "Connected" : "Sign In"}</SignInButton>

      {isOpen && (
        <ConnectButtonPopover>
          <ConnectButtonWrapper>
            {authStatus === "authenticated" ? (
              <LogoutButton onClick={handleLogout}>Log Out</LogoutButton>
            ) : (
              <>
                <ConnectButton.Custom>{({ openConnectModal }) => <CustomConnectButton onClick={openConnectModal}>Ethereum</CustomConnectButton>}</ConnectButton.Custom>
                <SolanaButton disabled>Solana</SolanaButton>
              </>
            )}
          </ConnectButtonWrapper>
        </ConnectButtonPopover>
      )}
    </Container>
  );
};

export default ProfileSignIn;
