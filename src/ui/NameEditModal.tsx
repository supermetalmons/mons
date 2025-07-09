import React, { useState, useEffect, useRef } from "react";
import styled from "styled-components";
import { isMobile } from "../utils/misc";
import { ModalOverlay, ModalPopup, ModalTitle, ButtonsContainer, CancelButton, SaveButton } from "./SharedModalComponents";
import { connection } from "../connection/connection";

const NameEditOverlay = styled(ModalOverlay)`
  align-items: ${isMobile ? "flex-start" : "center"};
  padding-top: ${isMobile ? "59px" : "0"};
`;

const NameEditPopup = styled(ModalPopup)`
  padding: 20px;
`;

const NameInput = styled.input<{ isValid: boolean }>`
  width: 100%;
  padding: 12px;
  border-radius: 8px;
  border: 1px solid ${(props) => (props.isValid ? "var(--inputBorderColor)" : "var(--dangerButtonBackground)")};
  font-size: 1rem;
  margin-bottom: 4px;
  box-sizing: border-box;

  &:focus {
    border-color: ${(props) => (props.isValid ? "var(--bottomButtonBackground)" : "var(--dangerButtonBackground)")};
    outline: none;
  }

  @media (prefers-color-scheme: dark) {
    background-color: var(--cancelButtonBackgroundDark);
    color: var(--lightTextColor);
    border-color: ${(props) => (props.isValid ? "var(--cancelButtonBackgroundHoverDark)" : "var(--dangerButtonBackgroundDark)")};

    &:focus {
      border-color: ${(props) => (props.isValid ? "var(--bottomButtonBackgroundDark)" : "var(--dangerButtonBackgroundDark)")};
    }
  }
`;

const ErrorMessage = styled.div`
  color: var(--dangerButtonBackground);
  font-size: 0.8rem;
  margin-bottom: ${(props) => (props.children ? "16px" : "12px")};
  height: ${(props) => (props.children ? "1rem" : "0")};
  display: flex;
  align-items: center;

  @media (prefers-color-scheme: dark) {
    color: var(--dangerButtonBackgroundDark);
  }
`;

export interface NameEditModalProps {
  initialName: string;
  onSave: (name: string) => void;
  onCancel: () => void;
}

export const NameEditModal: React.FC<NameEditModalProps> = ({ initialName, onSave, onCancel }) => {
  const [customDisplayName, setCustomDisplayName] = useState(initialName);
  const [errorMessage, setErrorMessage] = useState("");
  const [isValid, setIsValid] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    validateName(customDisplayName);
  }, [customDisplayName]);

  const validateName = (name: string) => {
    if (name.length === 0) {
      setErrorMessage("");
      setIsValid(true);
      return;
    }

    if (name.length > 14) {
      setErrorMessage("Must be shorter than 15 characters.");
      setIsValid(false);
      return;
    }

    if (!/^[a-zA-Z0-9]+$/.test(name)) {
      setErrorMessage("Use only letters and numbers.");
      setIsValid(false);
      return;
    }

    setErrorMessage("");
    setIsValid(true);
  };

  const handleSave = () => {
    const trimmed = customDisplayName.trim();

    if (isValid && !isSubmitting) {
      setIsSubmitting(true);

      connection
        .editUsername(trimmed)
        .then((response) => {
          if (response.ok) {
            onSave(trimmed);
          } else {
            if (response.validationError) {
              setErrorMessage(response.validationError);
              setIsValid(false);
            } else {
              setErrorMessage("Something went wrong. Try again.");
              setIsValid(true);
            }
          }
        })
        .catch((error) => {
          console.error("Error editing username:", error);
          setErrorMessage("Something went wrong. Try again.");
          setIsValid(true);
        })
        .finally(() => {
          setIsSubmitting(false);

          setTimeout(() => {
            if (inputRef.current) {
              inputRef.current.focus();
            }
          }, 10);
        });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && isValid && !isSubmitting) {
      e.stopPropagation();
      handleSave();
    } else if (e.key === "Escape") {
      e.stopPropagation();
      onCancel();
    }
  };

  return (
    <NameEditOverlay onClick={onCancel}>
      <NameEditPopup onClick={(e) => e.stopPropagation()}>
        <ModalTitle>{initialName ? "Edit Name" : "Set Name"}</ModalTitle>
        <NameInput ref={inputRef} type="text" value={customDisplayName} onChange={(e) => setCustomDisplayName(e.target.value)} placeholder="Enter name" autoFocus onKeyDown={handleKeyDown} spellCheck="false" autoCorrect="off" autoCapitalize="off" autoComplete="off" data-form-type="other" data-lpignore="true" inputMode="text" enterKeyHint="done" aria-autocomplete="none" aria-haspopup="false" aria-expanded="false" isValid={isValid} disabled={isSubmitting} />
        <ErrorMessage>{errorMessage}</ErrorMessage>
        <ButtonsContainer>
          <CancelButton onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </CancelButton>
          <SaveButton disabled={!isValid || isSubmitting} onClick={handleSave}>
            {isSubmitting ? "Saving..." : "Save"}
          </SaveButton>
        </ButtonsContainer>
      </NameEditPopup>
    </NameEditOverlay>
  );
};

export default NameEditModal;
