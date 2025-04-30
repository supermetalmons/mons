import React, { useRef } from "react";
import styled from "styled-components";
import { isMobile } from "../utils/misc";

const InventoryOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.3);
  display: flex;
  justify-content: center;
  align-items: ${isMobile ? "flex-start" : "center"};
  padding-top: ${isMobile ? "59px" : "0"};
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

  @media (prefers-color-scheme: dark) {
    color: #d0d0d0;
  }
`;

export interface InventoryModalProps {
  onCancel: () => void;
}

export const InventoryModal: React.FC<InventoryModalProps> = ({ onCancel }) => {
  const popupRef = useRef<HTMLDivElement>(null);

  return (
    <InventoryOverlay onClick={onCancel}>
      <InventoryPopup ref={popupRef} onClick={(e) => e.stopPropagation()}>
        <Title>swagpack</Title>
        <Content>soon</Content>
      </InventoryPopup>
    </InventoryOverlay>
  );
};

export default InventoryModal;
