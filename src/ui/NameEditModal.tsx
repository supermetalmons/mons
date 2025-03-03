import React, { useState } from "react";
import styled from "styled-components";

const NameEditOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.3);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 100;

  @media (prefers-color-scheme: dark) {
    background-color: rgba(0, 0, 0, 0.5);
  }
`;

const NameEditPopup = styled.div`
  background-color: white;
  padding: 24px;
  border-radius: 12px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
  width: 90%;
  max-width: 400px;

  @media (prefers-color-scheme: dark) {
    background-color: #1a1a1a;
  }
`;

const NameInput = styled.input`
  width: calc(100% - 24px);
  padding: 12px;
  border-radius: 8px;
  border: 1px solid #ddd;
  font-size: 1rem;
  margin-bottom: 16px;

  @media (prefers-color-scheme: dark) {
    background-color: #333;
    color: #f5f5f5;
    border-color: #444;
  }
`;

const ButtonsContainer = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 12px;
`;

const Button = styled.button`
  min-width: 130px;
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-weight: bold;
  font-size: 0.81rem;
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  outline: none;
  touch-action: none;
`;

const CancelButton = styled(Button)`
  background-color: #f0f0f0;
  color: #000;

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background-color: #e0e0e0;
    }
  }

  @media (prefers-color-scheme: dark) {
    background-color: #333;
    color: #f5f5f5;

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background-color: #444;
      }
    }
  }
`;

const SaveButton = styled(Button)`
  --color-default: #007aff;
  --color-default-hover: #0069d9;
  --color-default-active: #0056b3;

  --color-dark-default: #0b84ff;
  --color-dark-default-hover: #1a91ff;
  --color-dark-default-active: #299fff;

  background-color: var(--color-default);
  color: white;

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

export interface NameEditModalProps {
  initialName: string;
  onSave: (name: string) => void;
  onCancel: () => void;
}

export const NameEditModal: React.FC<NameEditModalProps> = ({ initialName, onSave, onCancel }) => {
  const [customDisplayName, setCustomDisplayName] = useState(initialName);

  const handleSave = () => {
    if (customDisplayName.trim()) {
      onSave(customDisplayName.trim());
    }
  };

  return (
    <NameEditOverlay>
      <NameEditPopup>
        <NameInput type="text" value={customDisplayName} onChange={(e) => setCustomDisplayName(e.target.value)} placeholder="Enter name" autoFocus />
        <ButtonsContainer>
          <CancelButton onClick={onCancel}>Cancel</CancelButton>
          <SaveButton onClick={handleSave}>Save</SaveButton>
        </ButtonsContainer>
      </NameEditPopup>
    </NameEditOverlay>
  );
};

export default NameEditModal;
