import React, { useEffect, useRef } from "react";
import styled from "styled-components";
import { ModalOverlay, ModalPopup, ModalTitle, ButtonsContainer, CancelButton, DangerButton } from "./SharedModalComponents";

const LogoutPopup = styled(ModalPopup)`
  padding: 20px;
  outline: none;
`;

const LogoutTitle = styled(ModalTitle)`
  margin-bottom: 26px;
  text-align: left;
`;

export interface LogoutConfirmModalProps {
  onConfirm: () => void;
  onCancel: () => void;
}

export const LogoutConfirmModal: React.FC<LogoutConfirmModalProps> = ({ onConfirm, onCancel }) => {
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (popupRef.current) {
      popupRef.current.focus();
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.stopPropagation();
      onConfirm();
    } else if (e.key === "Escape") {
      e.stopPropagation();
      onCancel();
    }
  };

  return (
    <ModalOverlay onClick={onCancel}>
      <LogoutPopup ref={popupRef} onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown} tabIndex={0}>
        <LogoutTitle>Log Out?</LogoutTitle>
        <ButtonsContainer>
          <CancelButton onClick={onCancel}>Cancel</CancelButton>
          <DangerButton onClick={onConfirm}>Log Out</DangerButton>
        </ButtonsContainer>
      </LogoutPopup>
    </ModalOverlay>
  );
};

export default LogoutConfirmModal;
