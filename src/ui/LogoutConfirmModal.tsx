import React, { useEffect, useRef } from "react";
import styled from "styled-components";
import {
  ModalOverlay,
  ModalPopup,
  ModalTitle,
  ButtonsContainer,
  CancelButton,
  DangerButton,
  handleModalKeyDown,
} from "./SharedModalComponents";

const LogoutPopup = styled(ModalPopup)`
  padding: 20px;
  outline: none;
`;

const LogoutTitle = styled(ModalTitle)`
  margin-bottom: 26px;
  text-align: left;
`;

interface LogoutConfirmModalProps {
  onConfirm: () => void;
  onCancel: () => void;
}

export const LogoutConfirmModal: React.FC<LogoutConfirmModalProps> = ({
  onConfirm,
  onCancel,
}) => {
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (popupRef.current) {
      popupRef.current.focus();
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    handleModalKeyDown(e, popupRef.current, onCancel);
  };

  return (
    <ModalOverlay onClick={onCancel}>
      <LogoutPopup
        ref={popupRef}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="dialog"
        aria-modal="true"
        aria-labelledby="logout-dialog-title"
      >
        <LogoutTitle id="logout-dialog-title">Log Out?</LogoutTitle>
        <ButtonsContainer>
          <CancelButton onClick={onCancel}>Cancel</CancelButton>
          <DangerButton onClick={onConfirm}>Log Out</DangerButton>
        </ButtonsContainer>
      </LogoutPopup>
    </ModalOverlay>
  );
};
