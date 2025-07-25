import styled from "styled-components";

export const ControlsContainer = styled.div`
  position: fixed;
  bottom: max(10px, env(safe-area-inset-bottom));
  right: 10px;
  left: 46px;
  display: flex;
  gap: 8px;
  justify-content: flex-end;

  @media screen and (max-height: 453px) {
    bottom: max(6px, env(safe-area-inset-bottom));
  }

  @media screen and (orientation: portrait) {
    right: 8px;
  }

  @media screen and (max-width: 435px) {
    gap: 6px;
  }

  @media screen and (max-width: 387px) {
    right: 6px;
    left: 38px;
    gap: 5px;
  }

  @media screen and (max-width: 359px) {
    gap: 4px;
  }

  @media screen and (max-width: 320px) {
    gap: 3px;
  }
`;

export const BrushButton = styled.button<{ disabled?: boolean; dimmed?: boolean }>`
  position: fixed;
  bottom: max(10px, env(safe-area-inset-bottom));
  left: 9px;
  width: 32px;
  height: 32px;
  border-radius: 16px;
  opacity: ${(props) => (props.dimmed ? 0.77 : 1)};
  background-color: var(--color-gray-f9);
  border: none;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  outline: none;
  -webkit-touch-callout: none;
  touch-action: none;
  overflow: visible;

  @media screen and (max-height: 453px) {
    bottom: max(6px, env(safe-area-inset-bottom));
  }

  @media screen and (orientation: portrait) {
    left: 8px;
  }

  @media screen and (max-width: 387px) {
    width: 27px;
    left: 6px;
  }

  svg {
    width: 12px;
    height: 12px;
    color: var(--mutedTextColor);
    overflow: visible;
  }

  @media (hover: hover) and (pointer: fine) {
    &:hover svg {
      color: var(--mutedTextColorHover);
    }
  }

  @media (prefers-color-scheme: dark) {
    background-color: var(--primaryContainerBackgroundDark);
    svg {
      color: var(--mutedTextColorDark);
    }

    @media (hover: hover) and (pointer: fine) {
      &:hover svg {
        color: var(--mutedTextColorHoverDark);
      }
    }
  }
`;

export const BottomPillButton = styled.button<{ isPink?: boolean; isBlue?: boolean; isViewOnly?: boolean; disabled?: boolean }>`
  height: 32px;
  font-weight: 888;
  font-size: 0.88rem;
  border-radius: 16px;
  padding: 0px 16px;

  svg {
    width: 0.9em;
    height: 0.9em;
    margin-right: 6px;
    flex-shrink: 0;
  }

  @media screen and (max-width: 520px) {
    font-size: 0.81rem;
    font-weight: 750;
  }

  @media screen and (max-width: 491px) {
    padding: 0px 12px;
    font-size: 0.77rem;
  }

  @media screen and (max-width: 468px) {
    padding: 0px 10px;
    font-size: 0.75rem;
    font-weight: 700;
  }

  @media screen and (max-width: 430px) {
    padding: 0px 8px;
    font-size: 0.69rem;
  }

  @media screen and (max-width: 399px) {
    font-size: 0.65rem;
  }

  @media screen and (max-width: 375px) {
    padding: 0px 7px;
    font-size: 0.62rem;
  }

  @media screen and (max-width: 359px) {
    svg {
      margin-right: 3px !important;
    }
  }

  @media screen and (max-width: 345px) {
    font-size: 0.59rem;
  }

  @media screen and (max-width: 331px) {
    font-size: 0.55rem;
  }

  @media screen and (max-width: 316px) {
    font-size: 0.5rem;
  }

  @media screen and (max-width: 300px) {
    font-size: 0.42rem;
  }

  @media screen and (max-width: 275px) {
    font-size: 0.35rem;
  }

  @media screen and (max-width: 235px) {
    font-size: 0.3rem;
  }

  cursor: ${(props) => (props.isViewOnly || (props.isPink && props.disabled) ? "default" : "pointer")};
  transition: background-color 0.3s ease;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;

  background-color: ${(props) => (props.isViewOnly ? "var(--color-gray-f0)" : props.isBlue ? "var(--color-gray-f0)" : props.isPink && props.disabled ? "var(--pinkButtonBackgroundDisabled)" : props.isPink ? "var(--color-pink-light)" : "var(--color-blue-primary)")};
  color: ${(props) => (props.isPink && props.disabled ? "var(--color-white)" : props.isViewOnly ? "var(--viewOnlyButtonTextColor)" : props.isBlue ? "var(--color-blue-primary)" : "var(--color-white)")};
  border: none;

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background-color: ${(props) => (props.isViewOnly ? "var(--color-gray-f0)" : props.isBlue ? "var(--color-gray-e0)" : props.isPink && props.disabled ? "var(--pinkButtonBackgroundDisabled)" : props.isPink ? "var(--color-pink-mid)" : "var(--bottomButtonBackgroundHover)")};
    }
  }

  &:active {
    background-color: ${(props) => (props.isViewOnly ? "var(--color-gray-f0)" : props.isBlue ? "var(--color-gray-d0)" : props.isPink && props.disabled ? "var(--pinkButtonBackgroundDisabled)" : props.isPink ? "var(--pinkButtonBackgroundActive)" : "var(--bottomButtonBackgroundActive)")};
  }

  @media (prefers-color-scheme: dark) {
    color: ${(props) => (props.isPink && props.disabled ? "var(--color-text-on-pink-disabled)" : props.isViewOnly ? "var(--color-gray-77)" : props.isBlue ? "var(--color-blue-primary-dark)" : "var(--color-white)")};

    background-color: ${(props) => (props.isViewOnly ? "var(--color-gray-33)" : props.isBlue ? "var(--color-gray-33)" : props.isPink && props.disabled ? "var(--pinkButtonBackgroundDisabledDark)" : props.isPink ? "var(--color-pink-mid)" : "var(--color-blue-primary-dark)")};

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background-color: ${(props) => (props.isViewOnly ? "var(--color-gray-33)" : props.isBlue ? "var(--color-gray-44)" : props.isPink && props.disabled ? "var(--pinkButtonBackgroundDisabledDark)" : props.isPink ? "var(--color-pink-light)" : "var(--bottomButtonBackgroundHoverDark)")};
      }
    }

    &:active {
      background-color: ${(props) => (props.isViewOnly ? "var(--color-gray-33)" : props.isBlue ? "var(--color-gray-55)" : props.isPink && props.disabled ? "var(--pinkButtonBackgroundDisabledDark)" : props.isPink ? "var(--pinkButtonBackgroundActiveDark)" : "var(--bottomButtonBackgroundActiveDark)")};
    }
  }
`;

export const NavigationListButton = styled.button<{ disabled?: boolean; dimmed?: boolean }>`
  position: relative;
  width: 32px;
  height: 32px;
  border-radius: ${(props) => (props.dimmed ? "16px" : "16px")};
  background-color: var(--color-gray-f0);
  border: none;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  outline: none;
  -webkit-touch-callout: none;
  touch-action: none;
  overflow: visible;

  svg {
    width: ${(props) => (props.dimmed ? "16px" : "13px")};
    height: ${(props) => (props.dimmed ? "16px" : "13px")};
    color: ${(props) => (props.dimmed ? "var(--color-gray-33)" : "var(--color-blue-primary)")};
    overflow: visible;
  }

  @media screen and (max-width: 387px) {
    width: ${(props) => (props.dimmed ? "32px" : "27px")};

    svg {
      width: ${(props) => (props.dimmed ? "16px" : "10px")};
      height: ${(props) => (props.dimmed ? "16px" : "10px")};
    }
  }

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background-color: var(--color-gray-e0);
    }
  }

  @media (prefers-color-scheme: dark) {
    background-color: var(--color-gray-33);
    svg {
      color: ${(props) => (props.dimmed ? "var(--color-gray-f0)" : "var(--color-blue-primary-dark)")};
    }

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background-color: var(--color-gray-44);
      }
    }
  }
`;

export const NavigationBadge = styled.div`
  position: absolute;
  top: -3px;
  right: 1px;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background-color: var(--badgeBackgroundColor);
  pointer-events: none;
`;

export const ControlButton = styled.button<{ disabled?: boolean }>`
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background-color: var(--color-gray-f0);
  border: none;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: ${(props) => (props.disabled ? "default" : "pointer")};
  transition: background-color 0.3s ease;
  -webkit-tap-highlight-color: transparent;
  overflow: visible;

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background-color: ${(props) => (props.disabled ? "var(--color-gray-f0)" : "var(--color-gray-e0)")};
    }
  }

  &:active {
    background-color: ${(props) => (props.disabled ? "var(--color-gray-f0)" : "var(--color-gray-d0)")};
  }

  svg {
    width: 16px;
    height: 16px;
    color: ${(props) => (props.disabled ? "var(--lightDisabledTextColor2)" : "var(--color-gray-33)")};
    overflow: visible;
  }

  @media (prefers-color-scheme: dark) {
    background-color: var(--color-gray-33);

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background-color: ${(props) => (props.disabled ? "var(--color-gray-33)" : "var(--color-gray-44)")};
      }
    }

    &:active {
      background-color: ${(props) => (props.disabled ? "var(--color-gray-33)" : "var(--color-gray-55)")};
    }

    svg {
      color: ${(props) => (props.disabled ? "var(--color-gray-77)" : "var(--color-gray-f0)")};
    }
  }
`;

export const ReactionPicker = styled.div<{ offsetToTheRight?: boolean }>`
  position: absolute;
  bottom: 40px;
  right: ${(props) => (props.offsetToTheRight ? "22px" : "64px")};
  background-color: var(--panel-light-90);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
  border-radius: 8px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;

  @media screen and (max-height: 453px) {
    bottom: 38px;
  }

  @media (prefers-color-scheme: dark) {
    background-color: var(--panel-dark-90);
  }
`;

export const ReactionButton = styled.button`
  background: none;
  border: none;
  padding: 4px 8px;
  cursor: pointer;
  text-align: left;
  color: var(--color-gray-33);

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background-color: var(--interactiveHoverBackgroundLight);
    }
  }

  &:active {
    background-color: var(--interactiveActiveBackgroundLight);
  }

  @media (prefers-color-scheme: dark) {
    color: var(--color-gray-f0);

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background-color: var(--interactiveHoverBackgroundDark);
      }
    }

    &:active {
      background-color: var(--interactiveActiveBackgroundDark);
    }
  }
`;

export const ResignConfirmation = styled(ReactionPicker)`
  right: 10px;
  padding: 12px;
`;

export const ResignButton = styled(ReactionButton)`
  background-color: var(--resignButtonBackground);
  color: var(--color-white);
  border-radius: 16px;
  padding: 8px 16px;
  font-weight: bold;

  &:active {
    background-color: var(--resignButtonBackgroundActive);
  }

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background-color: var(--resignButtonBackgroundHover);
    }
  }

  @media (prefers-color-scheme: dark) {
    background-color: var(--resignButtonBackgroundDark);

    &:active {
      background-color: var(--resignButtonBackgroundActiveDark);
    }

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background-color: var(--resignButtonBackgroundHoverDark);
      }
    }
  }
`;
