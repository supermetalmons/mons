import React from "react";
import styled from "styled-components";
import { getVerboseTrackingEntities, didSelectVerboseTrackingEntity, didDismissMoveHistoryPopup } from "../game/gameController";

let moveHistoryReloadCallback: (() => void) | null = null;
export function triggerMoveHistoryPopupReload() {
  if (moveHistoryReloadCallback) moveHistoryReloadCallback();
}

const MoveHistoryPopupContainer = styled.div`
  position: fixed;
  bottom: max(50px, calc(env(safe-area-inset-bottom) + 44px));
  right: 8px;
  min-height: 23px;
  max-height: calc(100dvh - 120px - env(safe-area-inset-bottom));
  max-width: 150pt;
  display: flex;
  flex-direction: column;
  background-color: var(--panel-light-90);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
  border-radius: 7pt;
  padding: 8px;
  gap: 0;
  z-index: 7;

  @media (prefers-color-scheme: dark) {
    background-color: var(--panel-dark-90);
  }

  @media screen and (max-height: 453px) {
    bottom: max(44px, calc(env(safe-area-inset-bottom) + 38px));
  }
`;

const ScrollableList = styled.div`
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  flex-grow: 1;
  scrollbar-width: none;
  -ms-overflow-style: none;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const ItemButton = styled.button`
  background: none;
  font-size: 12px;
  border: none;
  padding: 4px 10px 4px 0;
  cursor: pointer;
  text-align: left;
  color: var(--color-gray-33);
  width: 100%;
  display: flex;
  align-items: center;
  gap: 4px;
  line-height: 1.15;

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

const MoveHistoryPopup = React.forwardRef<HTMLDivElement>((_, ref) => {
  const preventScroll = (e: React.TouchEvent) => {
    e.preventDefault();
  };

  let items: string[] = [];
  try {
    items = getVerboseTrackingEntities();
  } catch {}

  const [version, setVersion] = React.useState(0);
  const listRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [version, items.length]);

  React.useEffect(() => {
    moveHistoryReloadCallback = () => setVersion((v) => v + 1);
    return () => {
      moveHistoryReloadCallback = null;
      try {
        didDismissMoveHistoryPopup();
      } catch {}
    };
  }, []);

  return (
    <MoveHistoryPopupContainer ref={ref} onTouchMove={preventScroll}>
      <ScrollableList ref={listRef}>
        {items.map((text, index) => (
          <ItemButton key={index} onClick={() => didSelectVerboseTrackingEntity(index)}>
            {text}
          </ItemButton>
        ))}
      </ScrollableList>
    </MoveHistoryPopupContainer>
  );
});

export default MoveHistoryPopup;
