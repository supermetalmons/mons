import { forwardRef } from "react";
import styled from "styled-components";

const StyledInfoPopover = styled.div<{ isOpen: boolean }>`
  position: fixed;
  top: 56px;
  right: 9pt;
  font-size: 12px;
  background-color: rgba(250, 250, 250, 0.95);
  max-height: calc(100dvh - 113px - env(safe-area-inset-bottom));
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
  border-radius: 7pt;
  padding-top: 8px;
  padding-right: 12px;
  padding-bottom: 8px;
  padding-left: 12px;
  width: min(269px, 85dvw);
  box-shadow: none;
  z-index: 5;
  opacity: ${(props) => (props.isOpen ? 1 : 0)};
  pointer-events: ${(props) => (props.isOpen ? "auto" : "none")};
  white-space: pre-wrap;
  text-align: left;
  cursor: default;
  line-height: 2.1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  flex-grow: 1;

  @media (prefers-color-scheme: dark) {
    background-color: rgba(35, 35, 35, 0.95);
    color: #f5f5f5;
  }

  @media screen and (max-height: 500px) {
    top: 53px;
  }

  @media screen and (max-height: 453px) {
    top: 50px;
  }

  @media screen and (max-width: 420px) {
    right: 8px;
  }

  @media screen and (max-width: 387px) {
    right: 6px;
  }
`;

interface InfoPopoverProps {
  isOpen: boolean;
}

export const InfoPopover = forwardRef<HTMLDivElement, InfoPopoverProps>(({ isOpen }, ref) => {
  return (
    <StyledInfoPopover ref={ref} isOpen={isOpen}>
      🐻 Carry mana with the drainer (central mon).
      <br />
      💦 Bring mana to the corners to score.
      <br />
      🏆 Score 5 points to win.
      <br />
      <span style={{ opacity: 0.95 }}>⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯</span>
      <br />
      👟 Move your mons up to a total of 5 spaces.
      <br />
      🌟 Use one action: demon, spirit, or mystic.
      <br />
      💧 Use your one mana move to end your turn.
    </StyledInfoPopover>
  );
});

InfoPopover.displayName = "InfoPopover";
