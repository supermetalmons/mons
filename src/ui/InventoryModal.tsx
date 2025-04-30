import React, { useRef, useEffect, useState } from "react";
import styled from "styled-components";
import { ButtonsContainer, SaveButton } from "./NameEditModal";
import { storage } from "../utils/storage";

const InventoryOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.3);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1023;
  user-select: none;

  @media (prefers-color-scheme: dark) {
    background-color: rgba(0, 0, 0, 0.5);
  }
`;

const InventoryPopup = styled.div`
  background-color: #fffffffa;
  padding: 20px;
  border-radius: 16px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
  width: 85%;
  max-width: 320px;
  user-select: none;
  outline: none;

  @media (prefers-color-scheme: dark) {
    background-color: #1a1a1afa;
  }
`;

const Title = styled.h3`
  margin-top: 0;
  margin-bottom: 16px;
  font-size: 1.1rem;
  color: #333;
  user-select: none;
  cursor: default;

  @media (prefers-color-scheme: dark) {
    color: #f0f0f0;
  }
`;

const Content = styled.div`
  color: #555;
  font-size: 0.9rem;
  margin-bottom: 16px;
  user-select: none;
  cursor: default;
  word-break: break-word;
  overflow-wrap: break-word;
  max-width: 100%;

  @media (prefers-color-scheme: dark) {
    color: #d0d0d0;
  }
`;

export interface InventoryModalProps {
  onCancel: () => void;
}

export const InventoryModal: React.FC<InventoryModalProps> = ({ onCancel }) => {
  const popupRef = useRef<HTMLDivElement>(null);
  const [balanceInfo, setBalanceInfo] = useState<string | null>(null);

  useEffect(() => {
    if (popupRef.current) {
      popupRef.current.focus();
    }

    const storedSolAddress = storage.getSolAddress("");

    if (storedSolAddress) {
      const fetchSolBalance = async () => {
        try {
          setBalanceInfo(storedSolAddress);
        } catch {}
      };

      fetchSolBalance();
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.stopPropagation();
      onCancel();
    } else if (e.key === "Escape") {
      e.stopPropagation();
      onCancel();
    }
  };

  return (
    <InventoryOverlay onClick={onCancel}>
      <InventoryPopup ref={popupRef} onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown} tabIndex={0} autoFocus>
        <Title>swagpack</Title>
        <Content>
          soon
          {balanceInfo && (
            <>
              <br />
              <br />
              {balanceInfo}
            </>
          )}
        </Content>
        <ButtonsContainer>
          <SaveButton onClick={onCancel} disabled={false}>
            OK
          </SaveButton>
        </ButtonsContainer>
      </InventoryPopup>
    </InventoryOverlay>
  );
};

export default InventoryModal;
