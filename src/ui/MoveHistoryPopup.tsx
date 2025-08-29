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

const placeholderMoves = [
  { id: "m1", label: "Move 1: e4" },
  { id: "m2", label: "Move 2: e5" },
  { id: "m3", label: "Move 3: Nf3" },
  { id: "m4", label: "Move 4: Nc6" },
  { id: "m5", label: "Move 5: Bb5" },
  { id: "m6", label: "Move 6: a6" },
  { id: "m7", label: "Move 7: Ba4" },
  { id: "m8", label: "Move 8: Nf6" },
  { id: "m9", label: "Move 9: O-O" },
  { id: "m10", label: "Move 10: Be7" },
  { id: "m11", label: "Move 11: Re1" },
  { id: "m12", label: "Move 12: b5" },
  { id: "m13", label: "Move 13: Bb3" },
  { id: "m14", label: "Move 14: d6" },
  { id: "m15", label: "Move 15: c3" },
  { id: "m16", label: "Move 16: O-O" },
  { id: "m17", label: "Move 17: h3" },
  { id: "m18", label: "Move 18: Nb8" },
  { id: "m19", label: "Move 19: d4" },
  { id: "m20", label: "Move 20: Nbd7" },
  { id: "m21", label: "Move 21: c4" },
  { id: "m22", label: "Move 22: c6" },
  { id: "m23", label: "Move 23: Nc3" },
  { id: "m24", label: "Move 24: Qc7" },
  { id: "m25", label: "Move 25: Be3" },
  { id: "m26", label: "Move 26: Bb7" },
  { id: "m27", label: "Move 27: Rc1" },
  { id: "m28", label: "Move 28: Rfe8" },
  { id: "m29", label: "Move 29: a3" },
  { id: "m30", label: "Move 30: Bf8" },
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
            {item.label}
          </ItemButton>
        ))}
      </ScrollableList>
    </MoveHistoryPopupContainer>
  );
});

export default MoveHistoryPopup;
