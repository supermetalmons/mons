import React, { useEffect, useRef } from "react";
import styled from "styled-components";
import { ModalOverlay, ModalPopup, ModalTitle, ButtonsContainer, SaveButton, Subtitle } from "./SharedModalComponents";
import { getBuildInfo } from "../utils/misc";

const SettingsPopup = styled(ModalPopup)`
  padding: 20px;
  outline: none;
`;

const SettingsTitle = styled(ModalTitle)`
  margin-bottom: 24px;
  text-align: left;
`;

const NonItalicSubtitle = styled(Subtitle)`
  font-style: normal;
`;

export interface SettingsModalProps {
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (popupRef.current) {
      popupRef.current.focus();
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === "Escape") {
      e.stopPropagation();
      onClose();
    }
  };

  return (
    <ModalOverlay onClick={onClose}>
      <SettingsPopup ref={popupRef} onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown} tabIndex={0}>
        <SettingsTitle>Settings</SettingsTitle>
        <NonItalicSubtitle>{getBuildInfo()}</NonItalicSubtitle>
        <ButtonsContainer>
          <SaveButton disabled={false} onClick={onClose}>
            OK
          </SaveButton>
        </ButtonsContainer>
      </SettingsPopup>
    </ModalOverlay>
  );
};

export default SettingsModal;
