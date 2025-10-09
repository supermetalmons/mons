import { forwardRef } from "react";
import styled from "styled-components";
import { useGameAssets } from "../hooks/useGameAssets";
import { useEmojis } from "../hooks/useEmojis";

const StyledInfoPopover = styled.div<{ isOpen: boolean }>`
  position: fixed;
  top: 56px;
  right: 9pt;
  font-size: 12px;
  background-color: var(--overlay-light-95);
  max-height: calc(100dvh - 113px - env(safe-area-inset-bottom));
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
  border-radius: 7pt;
  padding-top: 8px;
  padding-right: 12px;
  padding-bottom: 8px;
  padding-left: 12px;
  width: min(277px, 85dvw);
  box-shadow: none;
  z-index: 80030;
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
    background-color: var(--overlay-dark-95);
    color: var(--color-gray-f5);
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

  img {
    vertical-align: middle;
    margin-right: 4px;
  }

  .icon-image {
    width: 20px;
    height: 20px;
  }

  .emoji-image {
    width: 16px;
    height: 16px;
  }
`;

interface InfoPopoverProps {
  isOpen: boolean;
}

export const InfoPopover = forwardRef<HTMLDivElement, InfoPopoverProps>(({ isOpen }, ref) => {
  const { assets } = useGameAssets();
  const { emojis } = useEmojis();

  const getIconImage = (iconName: string) => {
    if (!assets || !assets[iconName]) {
      return "data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='10' cy='10' r='8' fill='%23cccccc' fill-opacity='0.5'/%3E%3C/svg%3E";
    }
    return `data:image/png;base64,${assets[iconName]}`;
  };

  const getEmojiImage = (emojiName: string) => {
    if (!emojis || !emojis[emojiName]) {
      return "data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='10' cy='10' r='8' fill='%23cccccc' fill-opacity='0.5'/%3E%3C/svg%3E";
    }
    return `data:image/png;base64,${emojis[emojiName]}`;
  };

  return (
    <StyledInfoPopover ref={ref} isOpen={isOpen}>
      <img className="icon-image" src={getIconImage("drainer")} alt="drainer" /> Carry mana with the drainer.
      <br />
      <img className="icon-image" src={getIconImage("manaB")} alt="manaB" /> Bring mana to the corners to score.
      <br />
      <img className="icon-image" src={getIconImage("mana")} alt="mana" /> Score 5 points to win.
      <br />
      <span style={{ opacity: 0.95 }}>⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯⋯</span>
      <br />
      <img className="emoji-image" src={getEmojiImage("statusMove")} alt="move" /> Move your mons up to a total of 5 spaces.
      <br />
      <img className="emoji-image" src={getEmojiImage("statusAction")} alt="action" /> Use one action: demon, spirit, or mystic.
      <br />
      <img className="emoji-image" src={getEmojiImage("statusMana")} alt="mana" /> Use your one mana move to end your turn.
    </StyledInfoPopover>
  );
});

InfoPopover.displayName = "InfoPopover";
