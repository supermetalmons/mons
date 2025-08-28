import React from "react";
import styled from "styled-components";

const MoveHistoryPopupContainer = styled.div`
  position: fixed;
  bottom: max(50px, calc(env(safe-area-inset-bottom) + 44px));
  right: 8px;
  min-height: 100px;
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
  text-transform: lowercase;

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

const PlaceholderImage = styled.img`
  width: 16px;
  height: 16px;
  flex-shrink: 0;
`;

const placeholderIcon = "data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Crect x='2' y='2' width='16' height='16' rx='3' fill='%23cccccc' fill-opacity='0.6'/%3E%3C/svg%3E";

const placeholderMoves = [
  { id: "m1", label: "Move 1: e4", completed: true },
  { id: "m2", label: "Move 2: e5", completed: true },
  { id: "m3", label: "Move 3: Nf3", completed: true },
  { id: "m4", label: "Move 4: Nc6", completed: false },
  { id: "m5", label: "Move 5: Bb5", completed: false },
];

const MoveHistoryPopup = React.forwardRef<HTMLDivElement>((_, ref) => {
  const preventScroll = (e: React.TouchEvent) => {
    e.preventDefault();
  };

  return (
    <MoveHistoryPopupContainer ref={ref} onTouchMove={preventScroll}>
      <ScrollableList>
        {placeholderMoves.map((item, index) => (
          <ItemButton key={item.id} onClick={() => {}}>
            <PlaceholderImage src={placeholderIcon} alt="" />
            {item.label}
          </ItemButton>
        ))}
      </ScrollableList>
    </MoveHistoryPopupContainer>
  );
});

export default MoveHistoryPopup;
