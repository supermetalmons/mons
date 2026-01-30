import React from "react";
import styled from "styled-components";
import { getVerboseTrackingEntities, didSelectVerboseTrackingEntity, didDismissMoveHistoryPopup } from "../game/gameController";
import { useGameAssets } from "../hooks/useGameAssets";
import { useEmojis } from "../hooks/useEmojis";
import type { MoveHistoryEntry, MoveHistorySegment, MoveHistoryToken } from "../game/moveEventStrings";

let moveHistoryReloadCallback: (() => void) | null = null;
export function triggerMoveHistoryPopupReload() {
  if (moveHistoryReloadCallback) moveHistoryReloadCallback();
}

const ITEM_HEIGHT = 24;
const VISIBLE_ITEMS = 7;
const PADDING_ITEMS = Math.floor(VISIBLE_ITEMS / 2);
const PICKER_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;
const PLACEHOLDER_LABEL = "—";
const PADDING_INDICES = Array.from({ length: PADDING_ITEMS }, (_, index) => index);

const MoveHistoryPopupContainer = styled.div`
  position: fixed;
  bottom: max(50px, calc(env(safe-area-inset-bottom) + 44px));
  right: 8px;
  width: 150px;
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

const WheelItem = styled.div<{ $isSelected: boolean; $distance: number; $isPlaceholder?: boolean }>`
  height: ${ITEM_HEIGHT}px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  position: relative;
  min-width: 0;
  scroll-snap-align: ${(props) => (props.$isPlaceholder ? "none" : "center")};
  font-size: 12px;
  padding: 0 10px;
  cursor: ${(props) => (props.$isPlaceholder ? "default" : "pointer")};
  pointer-events: ${(props) => (props.$isPlaceholder ? "none" : "auto")};
  user-select: none;
  transition: opacity 0.15s ease, transform 0.15s ease;
  color: var(--color-gray-33);
  opacity: ${(props) => {
    let opacity = 0.15;
    if (props.$isSelected) opacity = 1;
    else if (props.$distance === 1) opacity = 0.7;
    else if (props.$distance === 2) opacity = 0.45;
    else if (props.$distance === 3) opacity = 0.25;
    return props.$isPlaceholder ? opacity * 0.85 : opacity;
  }};
  transform: ${(props) => {
    if (props.$isSelected) return "scale(1)";
    if (props.$distance === 1) return "scale(0.96)";
    if (props.$distance === 2) return "scale(0.92)";
    if (props.$distance === 3) return "scale(0.88)";
    return "scale(0.85)";
  }};
  font-weight: ${(props) => (props.$isSelected ? 500 : 400)};

  @media (prefers-color-scheme: dark) {
    color: var(--color-gray-f0);
  }
`;

const ItemContent = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  width: 100%;
`;

const IndexLabel = styled.span`
  flex-shrink: 0;
  min-width: 20px;
  text-align: right;
`;

const EventRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow: visible;
  white-space: nowrap;
`;

const EventSegment = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
`;

const EventIcon = styled.img`
  width: 21px;
  height: 21px;
  flex-shrink: 0;
`;

const EmojiIcon = styled.img`
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  margin-left: -2px;
  margin-right: -2px;
`;

const CompositeIcon = styled.span`
  position: relative;
  width: 21px;
  height: 21px;
  flex-shrink: 0;
  overflow: visible;
`;

const CompositeBase = styled.img`
  width: 100%;
  height: 100%;
  display: block;
`;

const CompositeOverlay = styled.img`
  position: absolute;
  width: var(--overlay-size, 80%);
  height: var(--overlay-size, 80%);
  left: var(--overlay-left, 30%);
  top: var(--overlay-top, 20%);
`;

const EventText = styled.span`
  line-height: 1;
`;

const TurnSeparator = styled.div`
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: 0;
  height: 1px;
  background-color: rgba(120, 120, 128, 0.18);
  pointer-events: none;
  z-index: 0;

  @media (prefers-color-scheme: dark) {
    background-color: rgba(120, 120, 128, 0.32);
  }
`;

const MoveHistoryPopup = React.forwardRef<HTMLDivElement>((_, ref) => {
  const { assets } = useGameAssets();
  const { emojis } = useEmojis();
  const [version, setVersion] = React.useState(0);
  const items = React.useMemo<MoveHistoryEntry[]>(() => {
    try {
      return getVerboseTrackingEntities();
    } catch {
      return [{ segments: [] }];
    }
  }, [version]);
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

  const getIconImage = React.useCallback(
    (iconName: string) => {
      if (!assets || !assets[iconName]) {
        return "data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='10' cy='10' r='8' fill='%23cccccc' fill-opacity='0.5'/%3E%3C/svg%3E";
      }
      return `data:image/png;base64,${assets[iconName]}`;
    },
    [assets]
  );

  const renderToken = React.useCallback(
    (token: MoveHistoryToken, tokenIndex: number) => {
      if (token.type === "icon") {
        return <EventIcon key={`icon-${tokenIndex}`} src={getIconImage(token.icon)} alt={token.alt} />;
      }
      if (token.type === "emoji") {
        const src = emojis?.[token.emoji]
          ? `data:image/png;base64,${emojis[token.emoji]}`
          : "data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='10' cy='10' r='8' fill='%23cccccc' fill-opacity='0.5'/%3E%3C/svg%3E";
        return <EmojiIcon key={`emoji-${tokenIndex}`} src={src} alt={token.alt} />;
      }
      if (token.type === "composite") {
        const overlayStyle =
          token.variant === "supermana"
            ? ({
                "--overlay-left": "14%",
                "--overlay-top": "-11%",
                "--overlay-size": "72%",
              } as React.CSSProperties)
            : ({
                "--overlay-left": "35%",
                "--overlay-top": "27%",
                "--overlay-size": "93%",
              } as React.CSSProperties);
        return (
          <CompositeIcon key={`composite-${tokenIndex}`} style={overlayStyle} aria-label={token.alt}>
            <CompositeBase src={getIconImage(token.baseIcon)} alt={token.alt} />
            <CompositeOverlay src={getIconImage(token.overlayIcon)} alt={token.overlayAlt} />
          </CompositeIcon>
        );
      }
      return (
        <EventText key={`text-${tokenIndex}`}>
          {token.text}
        </EventText>
      );
    },
    [getIconImage, emojis]
  );

  const renderSegment = React.useCallback(
    (segment: MoveHistorySegment, segmentIndex: number) => (
      <EventSegment key={`segment-${segmentIndex}`}>{segment.map(renderToken)}</EventSegment>
    ),
    [renderToken]
  );

  return (
    <MoveHistoryPopupContainer ref={ref}>
      <WheelContainer>
        <SelectionIndicator />
        <ScrollWheel ref={scrollRef} onScroll={handleScroll} onMouseDown={handleMouseDown}>
          {PADDING_INDICES.map((offset) => {
            const virtualIndex = offset - PADDING_ITEMS;
            return (
              <WheelItem
                key={`placeholder-top-${offset}`}
                $isSelected={false}
                $distance={getDistance(virtualIndex)}
                $isPlaceholder
                aria-hidden="true"
              >
                {PLACEHOLDER_LABEL}
              </WheelItem>
            );
          })}
          {items.map((entry, index) => (
            <WheelItem
              key={index}
              $isSelected={index === selectedIndex}
              $distance={getDistance(index)}
              onClick={() => handleItemClick(index)}
            >
              <ItemContent>
                <IndexLabel>{index}.</IndexLabel>
                <EventRow>
                  {entry.segments.length > 0 ? entry.segments.map(renderSegment) : <EventText>{PLACEHOLDER_LABEL}</EventText>}
                </EventRow>
              </ItemContent>
              {entry.hasTurnSeparator && index < items.length - 1 && <TurnSeparator aria-hidden="true" />}
            </WheelItem>
          ))}
          {PADDING_INDICES.map((offset) => {
            const virtualIndex = items.length + offset;
            return (
              <WheelItem
                key={`placeholder-bottom-${offset}`}
                $isSelected={false}
                $distance={getDistance(virtualIndex)}
                $isPlaceholder
                aria-hidden="true"
              >
                {PLACEHOLDER_LABEL}
              </WheelItem>
            );
          })}
        </ScrollWheel>
      </WheelContainer>
    </MoveHistoryPopupContainer>
  );
});

export default MoveHistoryPopup;
