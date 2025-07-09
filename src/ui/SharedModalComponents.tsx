import styled from "styled-components";

export const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--modalOverlayBackground);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1023;

  @media (prefers-color-scheme: dark) {
    background-color: var(--modalOverlayBackgroundDark);
  }
`;

export const ModalPopup = styled.div`
  background-color: var(--modalBackground);
  padding: 24px;
  border-radius: 16px;
  box-shadow: 0 6px 20px var(--standardBoxShadow);
  width: 85%;
  max-width: 320px;

  @media (prefers-color-scheme: dark) {
    background-color: var(--modalBackgroundDark);
  }
`;

export const ModalTitle = styled.h3`
  margin-top: 0;
  margin-bottom: 16px;
  cursor: default;
  font-size: 1.1rem;
  color: var(--primaryTextColor);

  @media (prefers-color-scheme: dark) {
    color: var(--primaryTextColorDark);
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
  border-radius: 20px;
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
  background-color: var(--cancelButtonBackground);
  color: var(--blackTextColor);

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background-color: var(--cancelButtonBackgroundHover);
    }
  }

  @media (prefers-color-scheme: dark) {
    background-color: var(--cancelButtonBackgroundDark);
    color: var(--lightTextColor);

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background-color: var(--cancelButtonBackgroundHoverDark);
      }
    }
  }
`;

export const SaveButton = styled(Button)<{ disabled: boolean }>`
  --color-default: var(--bottomButtonBackground);
  --color-default-hover: var(--bottomButtonBackgroundHover);
  --color-default-active: var(--bottomButtonBackgroundActive);
  --color-disabled: var(--buttonBackgroundDisabled);

  --color-dark-default: var(--bottomButtonBackgroundDark);
  --color-dark-default-hover: var(--bottomButtonBackgroundHoverDark);
  --color-dark-default-active: var(--bottomButtonBackgroundActiveDark);
  --color-dark-disabled: var(--buttonBackgroundDisabledDark);

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
  --color-default: var(--dangerButtonBackground);
  --color-default-hover: var(--dangerButtonBackgroundHover);
  --color-default-active: var(--dangerButtonBackgroundActive);
  --color-disabled: var(--buttonBackgroundDisabled);

  --color-dark-default: var(--dangerButtonBackgroundDark);
  --color-dark-default-hover: var(--dangerButtonBackgroundHoverDark);
  --color-dark-default-active: var(--dangerButtonBackgroundActiveDark);
  --color-dark-disabled: var(--buttonBackgroundDisabledDark);

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
  color: var(--secondaryTextColor);
  font-size: 0.95rem;
  line-height: 1.4;
  cursor: default;
  font-style: italic;
  opacity: 0.8;

  @media (prefers-color-scheme: dark) {
    color: var(--secondaryTextColorDark);
  }
`;
