import React from "react";
import styled from "styled-components";
import { getVerboseTrackingEntities, didSelectVerboseTrackingEntity, didDismissMoveHistoryPopup } from "../game/gameController";

let moveHistoryReloadCallback: (() => void) | null = null;
export function triggerMoveHistoryPopupReload() {
  if (moveHistoryReloadCallback) moveHistoryReloadCallback();
}

const ITEM_HEIGHT = 32;
const VISIBLE_ITEMS = 5;
const PICKER_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;

const MoveHistoryPopupContainer = styled.div`
  position: fixed;
  bottom: max(50px, calc(env(safe-area-inset-bottom) + 44px));
  right: 8px;
  width: 150pt;
  height: ${PICKER_HEIGHT}px;
  display: flex;
  flex-direction: column;
  background-color: var(--panel-light-90);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
  border-radius: 7pt;
  z-index: 7;
  overflow: hidden;

  @media (prefers-color-scheme: dark) {
    background-color: var(--panel-dark-90);
  }

  @media screen and (max-height: 453px) {
    bottom: max(44px, calc(env(safe-area-inset-bottom) + 38px));
  }
`;

const WheelContainer = styled.div`
  position: relative;
  height: 100%;
  overflow: hidden;
`;

const SelectionIndicator = styled.div`
  position: absolute;
  top: 50%;
  left: 8px;
  right: 8px;
  height: ${ITEM_HEIGHT}px;
  transform: translateY(-50%);
  background-color: rgba(120, 120, 128, 0.12);
  border-radius: 6px;
  pointer-events: none;
  z-index: 1;

  @media (prefers-color-scheme: dark) {
    background-color: rgba(120, 120, 128, 0.24);
  }
`;

const ScrollWheel = styled.div`
  height: 100%;
  overflow-y: scroll;
  scroll-snap-type: y mandatory;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  -ms-overflow-style: none;
  overscroll-behavior: contain;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const WheelItem = styled.div<{ $isSelected: boolean; $distance: number }>`
  height: ${ITEM_HEIGHT}px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  scroll-snap-align: center;
  font-size: 14px;
  padding: 0 12px;
  cursor: pointer;
  user-select: none;
  transition: opacity 0.15s ease, transform 0.15s ease;
  color: var(--color-gray-33);
  opacity: ${(props) => {
    if (props.$isSelected) return 1;
    if (props.$distance === 1) return 0.6;
    return 0.3;
  }};
  transform: ${(props) => {
    const scale = props.$isSelected ? 1 : props.$distance === 1 ? 0.95 : 0.9;
    return `scale(${scale})`;
  }};
  font-weight: ${(props) => (props.$isSelected ? 500 : 400)};

  @media (prefers-color-scheme: dark) {
    color: var(--color-gray-f0);
  }
`;

const Spacer = styled.div`
  height: ${(PICKER_HEIGHT - ITEM_HEIGHT) / 2}px;
  flex-shrink: 0;
  scroll-snap-align: none;
`;

const MoveHistoryPopup = React.forwardRef<HTMLDivElement>((_, ref) => {
  let items: string[] = [];
  try {
    items = getVerboseTrackingEntities();
  } catch {}

  const [version, setVersion] = React.useState(0);
  const [selectedIndex, setSelectedIndex] = React.useState(items.length - 1);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const isDraggingRef = React.useRef(false);
  const startYRef = React.useRef(0);
  const startScrollTopRef = React.useRef(0);

  // Scroll to selected index
  const scrollToIndex = React.useCallback((index: number, smooth = true) => {
    const el = scrollRef.current;
    if (!el) return;
    const targetScroll = index * ITEM_HEIGHT;
    el.scrollTo({
      top: targetScroll,
      behavior: smooth ? "smooth" : "auto",
    });
  }, []);

  // Initialize scroll position to the last item
  React.useEffect(() => {
    if (items.length > 0) {
      const newIndex = items.length - 1;
      setSelectedIndex(newIndex);
      // Use timeout to ensure DOM is ready
      setTimeout(() => scrollToIndex(newIndex, false), 0);
    }
  }, [items.length, scrollToIndex]);

  // Handle scroll to update selection continuously
  const handleScroll = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    const scrollTop = el.scrollTop;
    const newIndex = Math.round(scrollTop / ITEM_HEIGHT);
    const clampedIndex = Math.max(0, Math.min(items.length - 1, newIndex));

    if (clampedIndex !== selectedIndex) {
      setSelectedIndex(clampedIndex);
      didSelectVerboseTrackingEntity(clampedIndex);
    }
  }, [items.length, selectedIndex]);

  // Mouse drag support for desktop
  const handleMouseDown = React.useCallback((e: React.MouseEvent) => {
    isDraggingRef.current = true;
    startYRef.current = e.clientY;
    startScrollTopRef.current = scrollRef.current?.scrollTop || 0;
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
  }, []);

  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || !scrollRef.current) return;
      const deltaY = startYRef.current - e.clientY;
      scrollRef.current.scrollTop = startScrollTopRef.current + deltaY;
    };

    const handleMouseUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  // Click on item to select it
  const handleItemClick = React.useCallback(
    (index: number) => {
      if (!isDraggingRef.current) {
        setSelectedIndex(index);
        scrollToIndex(index);
        didSelectVerboseTrackingEntity(index);
      }
    },
    [scrollToIndex]
  );

  // Reload callback
  React.useEffect(() => {
    moveHistoryReloadCallback = () => setVersion((v) => v + 1);
    return () => {
      moveHistoryReloadCallback = null;
      try {
        didDismissMoveHistoryPopup();
      } catch {}
    };
  }, []);

  // Calculate distance from selected for styling
  const getDistance = (index: number) => Math.abs(index - selectedIndex);

  return (
    <MoveHistoryPopupContainer ref={ref}>
      <WheelContainer>
        <SelectionIndicator />
        <ScrollWheel ref={scrollRef} onScroll={handleScroll} onMouseDown={handleMouseDown}>
          <Spacer />
          {items.map((text, index) => (
            <WheelItem
              key={index}
              $isSelected={index === selectedIndex}
              $distance={getDistance(index)}
              onClick={() => handleItemClick(index)}
            >
              {index}. {text}
            </WheelItem>
          ))}
          <Spacer />
        </ScrollWheel>
      </WheelContainer>
    </MoveHistoryPopupContainer>
  );
});

export default MoveHistoryPopup;
