import React, { useState, useEffect, useRef } from "react";
import styled from "styled-components";
import { isMobile } from "../utils/misc";

const NameEditOverlay = styled.div`
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
  z-index: 100;

  @media (prefers-color-scheme: dark) {
    background-color: rgba(0, 0, 0, 0.5);
  }
`;

const NameEditPopup = styled.div`
  background-color: white;
  padding: 20px;
  border-radius: 16px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
  width: 85%;
  max-width: 320px;

  @media (prefers-color-scheme: dark) {
    background-color: #1a1a1a;
  }
`;

const Title = styled.h3`
  margin-top: 0;
  margin-bottom: 16px;
  font-size: 1.1rem;
  color: #333;

  @media (prefers-color-scheme: dark) {
    color: #f0f0f0;
  }
`;

const NameInput = styled.input<{ isValid: boolean }>`
  width: 100%;
  padding: 12px;
  border-radius: 8px;
  border: 1px solid ${(props) => (props.isValid ? "#ddd" : "#ff3b30")};
  font-size: 1rem;
  margin-bottom: 4px;
  box-sizing: border-box;
  spellcheck: false;
  autocorrect: off;
  autocapitalize: off;

  &:focus {
    border-color: ${(props) => (props.isValid ? "#007aff" : "#ff3b30")};
    outline: none;
  }

  @media (prefers-color-scheme: dark) {
    background-color: #333;
    color: #f5f5f5;
    border-color: ${(props) => (props.isValid ? "#444" : "#ff453a")};

    &:focus {
      border-color: ${(props) => (props.isValid ? "#0b84ff" : "#ff453a")};
    }
  }
`;

const ErrorMessage = styled.div`
  color: #ff3b30;
  font-size: 0.8rem;
  margin-bottom: ${(props) => (props.children ? "16px" : "12px")};
  height: ${(props) => (props.children ? "1rem" : "0")};
  display: flex;
  align-items: center;

  @media (prefers-color-scheme: dark) {
    color: #ff453a;
  }
`;

const ButtonsContainer = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
`;

const Button = styled.button`
  padding: 10px 16px;
  border: none;
  border-radius: 8px;
  font-weight: bold;
  font-size: 0.9rem;
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  outline: none;
  touch-action: none;
  transition: background-color 0.2s ease;
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

const SaveButton = styled(Button)<{ disabled: boolean }>`
  --color-default: #007aff;
  --color-default-hover: #0069d9;
  --color-default-active: #0056b3;
  --color-disabled: #a0a0a0;

  --color-dark-default: #0b84ff;
  --color-dark-default-hover: #1a91ff;
  --color-dark-default-active: #299fff;
  --color-dark-disabled: #555555;

  background-color: ${(props) => (props.disabled ? "var(--color-disabled)" : "var(--color-default)")};
  color: white;
  min-width: 80px;
  opacity: ${(props) => (props.disabled ? 0.7 : 1)};

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background-color: ${(props) => (props.disabled ? "var(--color-disabled)" : "var(--color-default-hover)")};
    }
  }

  &:active {
    background-color: ${(props) => (props.disabled ? "var(--color-disabled)" : "var(--color-default-active)")};
  }

  @media (prefers-color-scheme: dark) {
    background-color: ${(props) => (props.disabled ? "var(--color-dark-disabled)" : "var(--color-dark-default)")};

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background-color: ${(props) => (props.disabled ? "var(--color-dark-disabled)" : "var(--color-dark-default-hover)")};
      }
    }

    &:active {
      background-color: ${(props) => (props.disabled ? "var(--color-dark-disabled)" : "var(--color-dark-default-active)")};
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

      // TODO: call cloud function

      setTimeout(() => {
        const isSuccess = Math.random() > 1; // TODO: dev tmp placeholder
        if (isSuccess) {
          onSave(trimmed);
        } else {
          const didReceiveValidationErrorResponse = false;
          if (didReceiveValidationErrorResponse) {
            const placeholderError = "Server validation failed. Try again."; // TODO: use actual received string
            setErrorMessage(placeholderError);
            setIsValid(false);
          } else {
            setErrorMessage("Something went wrong. Try again.");
            setIsValid(true);
          }
        }
        setIsSubmitting(false);

        setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.focus();
          }
        }, 10);
      }, 3000);
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
        <Title>Edit Name</Title>
        <NameInput ref={inputRef} type="text" value={customDisplayName} onChange={(e) => setCustomDisplayName(e.target.value)} placeholder="Enter name" autoFocus onKeyDown={handleKeyDown} spellCheck="false" autoCorrect="off" autoCapitalize="off" isValid={isValid} disabled={isSubmitting} />
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
