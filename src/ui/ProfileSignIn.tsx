import React, { useState, useRef, useEffect } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import styled from "styled-components";

const Container = styled.div`
  position: relative;
`;

const SignInButton = styled.button`
  padding: 8px 16px;
  background-color: #4f46e5;
  color: white;
  border-radius: 8px;
  font-weight: 500;
  transition: background-color 0.2s;
  border: none;
  cursor: pointer;

  &:hover {
    background-color: #4338ca;
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
