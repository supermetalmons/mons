import React, { useState, useRef, useEffect } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import styled from "styled-components";

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
  min-width: 300px;
  padding: 16px;
  background-color: white;
  border-radius: 12px;
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);

  @media (prefers-color-scheme: dark) {
    background-color: #1f1f1f;
  }
`;

export const ProfileSignIn: React.FC = () => {
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

  return (
    <Container ref={popoverRef}>
      <SignInButton onClick={() => setIsOpen(!isOpen)}>Sign In</SignInButton>

      {isOpen && (
        <ConnectButtonPopover>
          <ConnectButtonWrapper>
            <ConnectButton
              showBalance={false}
              chainStatus="none"
              accountStatus={{
                smallScreen: "avatar",
                largeScreen: "full",
              }}
            />
          </ConnectButtonWrapper>
        </ConnectButtonPopover>
      )}
    </Container>
  );
};

export default ProfileSignIn;
