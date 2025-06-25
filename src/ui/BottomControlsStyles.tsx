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
  background-color: #f9f9f9;
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
    color: #76778788;
    overflow: visible;
  }

  @media (hover: hover) and (pointer: fine) {
    &:hover svg {
      color: #767787af;
    }
  }

  @media (prefers-color-scheme: dark) {
    background-color: #242424;
    svg {
      color: #767787a9;
    }

    @media (hover: hover) and (pointer: fine) {
      &:hover svg {
        color: #767787f0;
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

  --color-white: white;
  --color-text-on-pink-disabled: rgba(204, 204, 204, 0.77);

  --color-tint: #007aff;
  --color-dark-tint: #0b84ff;

  --color-default: #007aff;
  --color-default-hover: #0069d9;
  --color-default-active: #0056b3;

  --color-blue: #f0f0f0;
  --color-blue-hover: #e0e0e0;
  --color-blue-active: #d0d0d0;

  --color-pink: #ff69b4;
  --color-pink-hover: #ff4da6;
  --color-pink-active: #d1477b;
  --color-pink-disabled: #ffd1dc;

  --color-view-only: #f0f0f0;
  --color-view-only-text: #aaa;

  --color-dark-default: #0b84ff;
  --color-dark-default-hover: #1a91ff;
  --color-dark-default-active: #299fff;

  --color-dark-blue: #333;
  --color-dark-blue-hover: #444;
  --color-dark-blue-active: #555;

  --color-dark-pink: #ff4da6;
  --color-dark-pink-hover: #ff69b4;
  --color-dark-pink-active: #ff85c0;
  --color-dark-pink-disabled: #664d57;

  --color-dark-view-only: #333;
  --color-dark-view-only-text: #777;

  background-color: ${(props) => (props.isViewOnly ? "var(--color-view-only)" : props.isBlue ? "var(--color-blue)" : props.isPink && props.disabled ? "var(--color-pink-disabled)" : props.isPink ? "var(--color-pink)" : "var(--color-default)")};
  color: ${(props) => (props.isPink && props.disabled ? "var(--color-white)" : props.isViewOnly ? "var(--color-view-only-text)" : props.isBlue ? "var(--color-tint)" : "var(--color-white)")};
  border: none;

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background-color: ${(props) => (props.isViewOnly ? "var(--color-view-only)" : props.isBlue ? "var(--color-blue-hover)" : props.isPink && props.disabled ? "var(--color-pink-disabled)" : props.isPink ? "var(--color-pink-hover)" : "var(--color-default-hover)")};
    }
  }

  &:active {
    background-color: ${(props) => (props.isViewOnly ? "var(--color-view-only)" : props.isBlue ? "var(--color-blue-active)" : props.isPink && props.disabled ? "var(--color-pink-disabled)" : props.isPink ? "var(--color-pink-active)" : "var(--color-default-active)")};
  }

  @media (prefers-color-scheme: dark) {
    color: ${(props) => (props.isPink && props.disabled ? "var(--color-text-on-pink-disabled)" : props.isViewOnly ? "var(--color-dark-view-only-text)" : props.isBlue ? "var(--color-dark-tint)" : "var(--color-white)")};

    background-color: ${(props) => (props.isViewOnly ? "var(--color-dark-view-only)" : props.isBlue ? "var(--color-dark-blue)" : props.isPink && props.disabled ? "var(--color-dark-pink-disabled)" : props.isPink ? "var(--color-dark-pink)" : "var(--color-dark-default)")};

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background-color: ${(props) => (props.isViewOnly ? "var(--color-dark-view-only)" : props.isBlue ? "var(--color-dark-blue-hover)" : props.isPink && props.disabled ? "var(--color-dark-pink-disabled)" : props.isPink ? "var(--color-dark-pink-hover)" : "var(--color-dark-default-hover)")};
      }
    }

    &:active {
      background-color: ${(props) => (props.isViewOnly ? "var(--color-dark-view-only)" : props.isBlue ? "var(--color-dark-blue-active)" : props.isPink && props.disabled ? "var(--color-dark-pink-disabled)" : props.isPink ? "var(--color-dark-pink-active)" : "var(--color-dark-default-active)")};
    }
  }
`;

export const NavigationListButton = styled.button<{ disabled?: boolean; dimmed?: boolean }>`
  width: 32px;
  height: 32px;
  border-radius: ${(props) => (props.dimmed ? "16px" : "16px")};
  background-color: #f0f0f0;
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
    color: ${(props) => (props.dimmed ? "#333" : "#007aff")};
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
      background-color: #e0e0e0;
    }
  }

  @media (prefers-color-scheme: dark) {
    background-color: #333;
    svg {
      color: ${(props) => (props.dimmed ? "#f0f0f0" : "#0b84ff")};
    }

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background-color: #444;
      }
    }
  }
`;

export const ControlButton = styled.button<{ disabled?: boolean }>`
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background-color: #f0f0f0;
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
      background-color: ${(props) => (props.disabled ? "#f0f0f0" : "#e0e0e0")};
    }
  }

  &:active {
    background-color: ${(props) => (props.disabled ? "#f0f0f0" : "#d0d0d0")};
  }

  svg {
    width: 16px;
    height: 16px;
    color: ${(props) => (props.disabled ? "#aaa" : "#333")};
    overflow: visible;
  }

  @media (prefers-color-scheme: dark) {
    background-color: #333;

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background-color: ${(props) => (props.disabled ? "#333" : "#444")};
      }
    }

    &:active {
      background-color: ${(props) => (props.disabled ? "#333" : "#555")};
    }

    svg {
      color: ${(props) => (props.disabled ? "#777" : "#f0f0f0")};
    }
  }
`;

export const ReactionPicker = styled.div<{ offsetToTheRight?: boolean }>`
  position: absolute;
  bottom: 40px;
  right: ${(props) => (props.offsetToTheRight ? "22px" : "64px")};
  background-color: rgba(249, 249, 249, 0.9);
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
    background-color: rgba(36, 36, 36, 0.9);
  }
`;

export const ReactionButton = styled.button`
  background: none;
  border: none;
  padding: 4px 8px;
  cursor: pointer;
  text-align: left;
  color: #333;

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background-color: rgba(232, 232, 232, 0.5);
    }
  }

  &:active {
    background-color: rgba(224, 224, 224, 0.6);
  }

  @media (prefers-color-scheme: dark) {
    color: #f0f0f0;

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background-color: rgba(70, 70, 70, 0.4);
      }
    }

    &:active {
      background-color: rgba(80, 80, 80, 0.5);
    }
  }
`;

export const ResignConfirmation = styled(ReactionPicker)`
  right: 10px;
  padding: 12px;
`;

export const ResignButton = styled(ReactionButton)`
  background-color: #ff4136;
  color: white;
  border-radius: 4px;
  padding: 8px 16px;
  font-weight: bold;

  &:active {
    background-color: #d30000;
  }

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background-color: #e60000;
    }
  }

  @media (prefers-color-scheme: dark) {
    background-color: #cc0000;

    &:active {
      background-color: #990000;
    }

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background-color: #b30000;
      }
    }
  }
`;
