import styled from "styled-components";

export const ModalOverlay = styled.div`
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

  @media (prefers-color-scheme: dark) {
    background-color: rgba(0, 0, 0, 0.5);
  }
`;

export const ModalPopup = styled.div`
  background-color: white;
  padding: 24px;
  border-radius: 16px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
  width: 85%;
  max-width: 320px;

  @media (prefers-color-scheme: dark) {
    background-color: #1a1a1a;
  }
`;

export const ModalTitle = styled.h3`
  margin-top: 0;
  margin-bottom: 16px;
  cursor: default;
  font-size: 1.1rem;
  color: #333;

  @media (prefers-color-scheme: dark) {
    color: #f0f0f0;
  }
`;

export const ButtonsContainer = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
`;

export const Button = styled.button`
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

export const CancelButton = styled(Button)`
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

export const SaveButton = styled(Button)<{ disabled: boolean }>`
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

export const DangerButton = styled(Button)<{ disabled?: boolean }>`
  --color-default: #ff3b30;
  --color-default-hover: #ff2d1b;
  --color-default-active: #e5281d;
  --color-disabled: #a0a0a0;

  --color-dark-default: #ff453a;
  --color-dark-default-hover: #ff6159;
  --color-dark-default-active: #ff7a72;
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

export const Subtitle = styled.p`
  margin: 0 0 24px 0;
  color: #696969;
  font-size: 0.95rem;
  line-height: 1.4;
  cursor: default;
  font-style: italic;
  opacity: 0.8;

  @media (prefers-color-scheme: dark) {
    color: #b0b0b0;
  }
`;
