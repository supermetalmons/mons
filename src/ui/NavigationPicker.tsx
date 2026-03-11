import React, { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import styled from "styled-components";
import { problems, getCompletedProblemIds } from "../content/problems";
import { useGameAssets } from "../hooks/useGameAssets";
import { FaCheck, FaCircle } from "react-icons/fa";
import {
  NavigationGameItem,
  NavigationGameStatus,
  NavigationItem,
  NavigationEventItem,
} from "../connection/connectionModels";
import { emojis } from "../content/emojis";

interface NavigationPickerProps {
  showsHomeNavigation: boolean;
  navigateHome?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  topGames?: NavigationItem[];
  pagedGames?: NavigationItem[];
  selectedProblemId?: string | null;
  selectedNavigationItemId?: string | null;
  isGamesLoading?: boolean;
  isLoadingMoreGames?: boolean;
  hasMoreGames?: boolean;
  onSelectGame?: (
    item: NavigationItem,
    options?: { status?: NavigationGameStatus },
  ) => void;
  onRemoveGame?: (inviteId: string) => void;
  removingGameInviteIds?: Set<string>;
  onSelectProblem: (problemId: string) => void;
  onLoadMoreGames?: () => void;
}

const NavigationPickerContainer = styled.div`
  position: fixed;
  bottom: max(50px, calc(env(safe-area-inset-bottom) + 44px));
  right: 8px;
  height: 480px;
  max-height: calc(100dvh - 120px - env(safe-area-inset-bottom));
  width: 148pt;
  display: flex;
  flex-direction: column;
  background-color: var(--panel-light-90);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
  border-radius: 7pt;
  overflow: hidden;
  padding: 0;
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
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
  flex-grow: 1;
  padding: 6px 0 8px;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const SectionSeparator = styled.div`
  height: 1px;
  background-color: var(--navigationTextMuted);
  opacity: 0.12;
  margin: 0;

  @media (prefers-color-scheme: dark) {
    background-color: var(--color-gray-a0);
    opacity: 0.15;
  }
`;

const NavigationPickerButton = styled.button<{ $isSelected?: boolean }>`
  background: ${(props) =>
    props.$isSelected ? "rgba(117, 187, 255, 0.22)" : "transparent"};
  border-radius: 0;
  font-size: 0.8rem;
  border: none;
  padding: 6px 12px;
  cursor: pointer;
  text-align: left;
  color: var(--color-gray-33);
  width: 100%;
  display: flex;
  align-items: center;
  gap: 5px;
  font-weight: ${(props) => (props.$isSelected ? 550 : 400)};

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background-color: ${(props) =>
        props.$isSelected
          ? "rgba(117, 187, 255, 0.30)"
          : "var(--interactiveHoverBackgroundLight)"};
    }
  }

  &:active {
    background-color: ${(props) =>
      props.$isSelected
        ? "rgba(117, 187, 255, 0.38)"
        : "var(--interactiveActiveBackgroundLight)"};
  }

  @media (prefers-color-scheme: dark) {
    color: var(--color-gray-f0);
    background: ${(props) =>
      props.$isSelected ? "rgba(75, 150, 255, 0.24)" : "transparent"};

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background-color: ${(props) =>
          props.$isSelected
            ? "rgba(75, 150, 255, 0.34)"
            : "var(--interactiveHoverBackgroundDark)"};
      }
    }

    &:active {
      background-color: ${(props) =>
        props.$isSelected
          ? "rgba(75, 150, 255, 0.42)"
          : "var(--interactiveActiveBackgroundDark)"};
    }
  }
`;

const GameRow = styled(NavigationPickerButton)<{
  $hasTrailingAction?: boolean;
}>`
  width: 100%;
  min-width: 0;
  padding-right: ${(props) => (props.$hasTrailingAction ? "32px" : "12px")};
`;

const EventRow = styled(GameRow)`
  && {
    background: transparent;
  }

  @media (hover: hover) and (pointer: fine) {
    &&:hover {
      background-color: transparent;
    }
  }

  &&:active {
    background-color: transparent;
  }

  @media (prefers-color-scheme: dark) {
    && {
      background: transparent;
    }

    @media (hover: hover) and (pointer: fine) {
      &&:hover {
        background-color: transparent;
      }
    }

    &&:active {
      background-color: transparent;
    }
  }
`;

const GameRowContainer = styled.div`
  position: relative;
  width: 100%;
  min-width: 0;
`;

const GameEmojiImage = styled.img`
  width: 20px;
  height: 20px;
  border-radius: 2px;
  flex-shrink: 0;
`;

const GameEmojiPlaceholder = styled.div`
  width: 20px;
  height: 20px;
  border-radius: 2px;
  background: rgba(128, 128, 128, 0.22);
  flex-shrink: 0;
`;

type QueueManaSlot = "top" | "right" | "bottom" | "left";

const QueueManaCluster = styled.span`
  position: relative;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
`;

const QueueManaIcon = styled.img<{ $slot: QueueManaSlot }>`
  position: absolute;
  width: 11px;
  height: 11px;
  object-fit: contain;
  left: ${(props) => {
    if (props.$slot === "left") {
      return "27%";
    }
    if (props.$slot === "right") {
      return "73%";
    }
    return "50%";
  }};
  top: ${(props) => {
    if (props.$slot === "top") {
      return "27%";
    }
    if (props.$slot === "bottom") {
      return "73%";
    }
    return "50%";
  }};
  transform: translate(-50%, -50%);
  pointer-events: none;
`;

const GameText = styled.span`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const FightCloudWrap = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-left: 2px;
`;

const EventAvatarImage = styled(GameEmojiImage)``;
const EventAvatarPlaceholder = styled(GameEmojiPlaceholder)`
  background: transparent;
`;
const EventAvatarQuestionSlot = styled(EventAvatarPlaceholder)`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  margin-left: 2px;
  border-radius: 999px;
  background: rgba(120, 120, 120, 0.18);
  color: rgba(74, 74, 74, 0.58);

  &::before {
    content: "+";
    font-size: 10px;
    font-weight: 500;
    line-height: 1;
  }

  @media (prefers-color-scheme: dark) {
    background: rgba(255, 255, 255, 0.1);
    color: rgba(220, 220, 220, 0.56);
  }
`;

const FightCloudCanvas = styled.svg`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  overflow: visible;
  pointer-events: none;
`;

const CloudShape = styled.path`
  fill: currentColor;
  fill-opacity: 0.05;
  stroke: currentColor;
  stroke-opacity: 0.09;
  stroke-width: 0.6;
  transition:
    fill-opacity 0.12s,
    stroke-opacity 0.12s;

  @media (hover: hover) and (pointer: fine) {
    button:hover & {
      fill-opacity: 0.1;
      stroke-opacity: 0.15;
    }
  }

  button:active & {
    fill-opacity: 0.14;
    stroke-opacity: 0.19;
  }

  @media (prefers-color-scheme: dark) {
    fill-opacity: 0.07;
    stroke-opacity: 0.12;

    @media (hover: hover) and (pointer: fine) {
      button:hover & {
        fill-opacity: 0.12;
        stroke-opacity: 0.17;
      }
    }

    button:active & {
      fill-opacity: 0.16;
      stroke-opacity: 0.21;
    }
  }
`;

const FightCloudInner = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  gap: 1px;
  z-index: 1;
`;

const FightCloudBadge = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  min-width: 18px;
  height: 18px;
  padding: 0 3px;
  border-radius: 9px;
  font-size: 0.55rem;
  font-weight: 600;
  color: var(--navigationTextMuted);
  flex-shrink: 0;
  letter-spacing: -0.02em;
  white-space: nowrap;
  background: rgba(128, 128, 128, 0.08);

  @media (prefers-color-scheme: dark) {
    background: rgba(255, 255, 255, 0.06);
  }
`;

const QueuePrimaryContent = styled.span`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 0.75rem;
  font-weight: inherit;
  letter-spacing: 0.01em;
  color: var(--navigationTextMuted);
`;

const GameStatus = styled.span<{ $isSelected?: boolean }>`
  margin-left: auto;
  font-size: 0.52rem;
  color: ${(props) =>
    props.$isSelected
      ? "var(--color-blue-primary)"
      : "var(--navigationTextMuted)"};
  text-transform: uppercase;

  @media (prefers-color-scheme: dark) {
    color: ${(props) =>
      props.$isSelected
        ? "var(--color-blue-primary-dark)"
        : "var(--navigationTextMuted)"};
  }
`;

const GameRemoveButton = styled.button<{ $isDisabled?: boolean }>`
  position: absolute;
  top: 50%;
  right: 6px;
  transform: translateY(-50%);
  z-index: 1;
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  font-size: 0.7rem;
  line-height: 1;
  border: none;
  padding: 0;
  background: transparent;
  color: var(--navigationTextMuted);
  opacity: ${(props) => (props.$isDisabled ? 0.55 : 0.9)};
  cursor: ${(props) => (props.$isDisabled ? "default" : "pointer")};
  user-select: none;
  flex-shrink: 0;

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background-color: ${(props) =>
        props.$isDisabled
          ? "transparent"
          : "var(--interactiveHoverBackgroundLight)"};
      color: var(--color-gray-33);
    }
  }

  &:active {
    background-color: ${(props) =>
      props.$isDisabled
        ? "transparent"
        : "var(--interactiveActiveBackgroundLight)"};
  }

  @media (prefers-color-scheme: dark) {
    color: var(--navigationTextMuted);

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background-color: ${(props) =>
          props.$isDisabled
            ? "transparent"
            : "var(--interactiveHoverBackgroundDark)"};
        color: var(--color-gray-f0);
      }
    }

    &:active {
      background-color: ${(props) =>
        props.$isDisabled
          ? "transparent"
          : "var(--interactiveActiveBackgroundDark)"};
    }
  }
`;

const CompletedIcon = styled(FaCheck)`
  color: var(--navigationTextMuted);
  font-size: 0.5rem;
  margin-left: auto;
  flex-shrink: 0;
  padding-left: 4px;
`;

const UncompletedIcon = styled(FaCircle)`
  color: var(--color-blue-primary);
  font-size: 0.4rem;
  margin-left: auto;
  flex-shrink: 0;
  padding-left: 4px;
  overflow: visible;
`;

const PlaceholderImage = styled.img`
  width: 20px;
  height: 20px;
  flex-shrink: 0;
`;

const HomeBoardButton = styled.button<{ $withTopBorder?: boolean }>`
  position: sticky;
  bottom: 0;
  background-color: var(--color-blue-primary);
  color: white;
  border-radius: 21px;
  padding: 8px 16px;
  height: 42px;
  font-size: 0.777rem;
  font-weight: bold;
  border: none;
  cursor: pointer;
  text-align: center;
  width: calc(100% - 12px);
  margin: ${(props) => (props.$withTopBorder ? "8px" : "0")} 6px 8px;
  -webkit-user-select: none;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  outline: none;
  z-index: 2;

  &:active {
    background-color: var(--bottomButtonBackgroundActive);
  }

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background-color: var(--bottomButtonBackgroundHover);
    }
  }

  @media (prefers-color-scheme: dark) {
    background-color: var(--color-blue-primary-dark);

    &:active {
      background-color: var(--bottomButtonBackgroundActiveDark);
    }

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background-color: var(--bottomButtonBackgroundHoverDark);
      }
    }
  }
`;

const MIN_AUTO_LOAD_NEXT_PAGE_THRESHOLD_PX = 640;
const MIN_REASONABLE_EPOCH_MS = Date.UTC(2000, 0, 1);
const SELECTED_ITEM_VISIBILITY_MARGIN_PX = 8;
const QUEUE_MANA_SLOTS: QueueManaSlot[] = ["top", "right", "bottom", "left"];

function buildFightCloudPath(w: number, h: number): string {
  const cx = w / 2;
  const cy = h / 2;
  const rx = w / 2 - 1;
  const ry = h / 2 - 2;
  const halfH = h / 2;
  const n = Math.max(7, Math.min(10, Math.round(w / 10)));
  const step = (Math.PI * 2) / n;
  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = i * step;
    const aM = a + step / 2;
    const aE = a + step;
    const x0 = cx + rx * Math.cos(a);
    const y0 = cy + ry * Math.sin(a);
    const baseBump = 4.5 + 2.5 * Math.sin(i * 3.7 + 1.2);
    const sinAbs = Math.abs(Math.sin(aM));
    const vertMax = sinAbs > 0.01 ? (halfH + 1) / sinAbs - ry : baseBump;
    const bump = Math.min(baseBump, Math.max(0, vertMax));
    const cpx = cx + (rx + bump) * Math.cos(aM);
    const cpy = cy + (ry + bump) * Math.sin(aM);
    const x1 = cx + rx * Math.cos(aE);
    const y1 = cy + ry * Math.sin(aE);
    if (i === 0) parts.push(`M${x0.toFixed(1)},${y0.toFixed(1)}`);
    parts.push(
      `Q${cpx.toFixed(1)},${cpy.toFixed(1)},${x1.toFixed(1)},${y1.toFixed(1)}`,
    );
  }
  parts.push("Z");
  return parts.join("");
}

const fightCloudCache = new Map<string, string>();
function getFightCloudPath(w: number, h: number) {
  const k = `${w}|${h}`;
  let v = fightCloudCache.get(k);
  if (!v) {
    v = buildFightCloudPath(w, h);
    fightCloudCache.set(k, v);
  }
  return v;
}

const FIGHT_CLOUD_PAD_X = 10;
const FIGHT_CLOUD_H = 32;

const NavigationPicker: React.FC<NavigationPickerProps> = ({
  showsHomeNavigation,
  navigateHome,
  topGames = [],
  pagedGames = [],
  selectedProblemId = null,
  selectedNavigationItemId = null,
  isGamesLoading = false,
  isLoadingMoreGames = false,
  hasMoreGames = false,
  onSelectGame,
  onRemoveGame,
  removingGameInviteIds,
  onSelectProblem,
  onLoadMoreGames,
}) => {
  const navigationPickerRef = useRef<HTMLDivElement>(null);
  const scrollableListRef = useRef<HTMLDivElement>(null);
  const isAutoLoadPendingRef = useRef(false);
  const hasUserScrolledRef = useRef(false);
  const canRunOneFollowUpLoadRef = useRef(false);
  const hasResolvedInitialScrollPositionRef = useRef(false);
  const isIgnoringInitialProgrammaticScrollRef = useRef(false);
  const { assets } = useGameAssets();

  const handleNavigationSelect = (id: string) => {
    onSelectProblem(id);
  };

  const preventScroll = (e: React.TouchEvent) => {
    e.preventDefault();
  };

  const handleHomeClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    navigateHome?.(e);
  };

  const maybeLoadMoreGames = useCallback(
    (container: HTMLDivElement | null, source: "scroll" | "effect") => {
      if (
        !container ||
        !onLoadMoreGames ||
        !hasMoreGames ||
        isGamesLoading ||
        isLoadingMoreGames ||
        isAutoLoadPendingRef.current
      ) {
        return;
      }

      const isScrollable = container.scrollHeight > container.clientHeight + 1;
      if (!hasUserScrolledRef.current && isScrollable) {
        return;
      }

      if (
        hasUserScrolledRef.current &&
        source === "effect" &&
        !canRunOneFollowUpLoadRef.current
      ) {
        return;
      }

      const thresholdPx = Math.max(
        MIN_AUTO_LOAD_NEXT_PAGE_THRESHOLD_PX,
        container.clientHeight * 2,
      );
      const remainingScroll =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      if (remainingScroll > thresholdPx) {
        return;
      }

      if (source === "scroll" && hasUserScrolledRef.current) {
        canRunOneFollowUpLoadRef.current = true;
      } else if (source === "effect") {
        canRunOneFollowUpLoadRef.current = false;
      }

      isAutoLoadPendingRef.current = true;
      onLoadMoreGames();
    },
    [hasMoreGames, isGamesLoading, isLoadingMoreGames, onLoadMoreGames],
  );

  const handleScrollableListScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      if (isIgnoringInitialProgrammaticScrollRef.current) {
        isIgnoringInitialProgrammaticScrollRef.current = false;
        return;
      }

      if (event.currentTarget.scrollTop > 0) {
        hasUserScrolledRef.current = true;
      }
      maybeLoadMoreGames(event.currentTarget, "scroll");
    },
    [maybeLoadMoreGames],
  );

  useEffect(() => {
    if (!isLoadingMoreGames) {
      isAutoLoadPendingRef.current = false;
      maybeLoadMoreGames(scrollableListRef.current, "effect");
    }
  }, [isLoadingMoreGames, maybeLoadMoreGames]);

  useEffect(() => {
    maybeLoadMoreGames(scrollableListRef.current, "effect");
  }, [maybeLoadMoreGames, topGames.length, pagedGames.length]);

  useLayoutEffect(() => {
    if (hasResolvedInitialScrollPositionRef.current) {
      return;
    }

    hasResolvedInitialScrollPositionRef.current = true;

    const container = scrollableListRef.current;
    if (!container) {
      return;
    }

    const selectedElement =
      container.querySelector<HTMLElement>(
        "[data-navigation-selected-primary='true']",
      ) ??
      container.querySelector<HTMLElement>("[data-navigation-active='true']") ??
      container.querySelector<HTMLElement>("[data-navigation-selected='true']");
    if (!selectedElement) {
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const selectedRect = selectedElement.getBoundingClientRect();

    let nextScrollTop = container.scrollTop;
    const topLimit = containerRect.top + SELECTED_ITEM_VISIBILITY_MARGIN_PX;
    const bottomLimit =
      containerRect.bottom - SELECTED_ITEM_VISIBILITY_MARGIN_PX;

    if (selectedRect.top < topLimit) {
      nextScrollTop -= topLimit - selectedRect.top;
    } else if (selectedRect.bottom > bottomLimit) {
      nextScrollTop += selectedRect.bottom - bottomLimit;
    } else {
      return;
    }

    const maxScrollTop = Math.max(
      0,
      container.scrollHeight - container.clientHeight,
    );
    const clampedScrollTop = Math.max(0, Math.min(nextScrollTop, maxScrollTop));
    if (Math.abs(clampedScrollTop - container.scrollTop) < 1) {
      return;
    }

    isIgnoringInitialProgrammaticScrollRef.current = true;
    container.scrollTop = clampedScrollTop;

    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        isIgnoringInitialProgrammaticScrollRef.current = false;
      });
    } else {
      isIgnoringInitialProgrammaticScrollRef.current = false;
    }
  }, []);

  const getIconImage = (iconName: string) => {
    if (!assets || !assets[iconName]) {
      return "data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='10' cy='10' r='8' fill='%23cccccc' fill-opacity='0.5'/%3E%3C/svg%3E";
    }
    return `data:image/png;base64,${assets[iconName]}`;
  };

  const getGameStatusLabel = (game: NavigationGameItem): string => {
    if (game.status === "pending") {
      return "pending";
    }
    if (game.status === "active") {
      return "active";
    }
    if (game.status === "ended") {
      const lastUpdateMs = Number.isFinite(game.listSortAtMs)
        ? Math.floor(game.listSortAtMs)
        : 0;
      if (lastUpdateMs < MIN_REASONABLE_EPOCH_MS) {
        return "long ago";
      }
      const date = new Date(lastUpdateMs);
      if (Number.isNaN(date.getTime())) {
        return "long ago";
      }
      const now = new Date();
      const includeYear = date.getFullYear() !== now.getFullYear();
      return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        ...(includeYear ? { year: "numeric" } : {}),
      });
    }
    return "waiting";
  };

  const getQueuePrimaryLabel = (game: NavigationGameItem): string => {
    if (game.status === "pending") {
      return "Automatching...";
    }
    return "Waiting for opponent";
  };

  const queueManaImage = getIconImage("mana");

  const getEventStatusLabel = (event: NavigationEventItem): string => {
    if (event.status === "ended" || event.status === "dismissed") {
      const sourceMs =
        event.endedAtMs ?? event.updatedAtMs ?? event.listSortAtMs;
      if (!Number.isFinite(sourceMs) || sourceMs < MIN_REASONABLE_EPOCH_MS) {
        return "long ago";
      }

      const date = new Date(sourceMs);
      if (Number.isNaN(date.getTime())) {
        return "long ago";
      }

      const now = new Date();
      const includeYear = date.getFullYear() !== now.getFullYear();
      return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        ...(includeYear ? { year: "numeric" } : {}),
      });
    }
    if (event.status === "waiting") {
      return "SOON";
    }

    return event.status;
  };

  const completedProblemsSet = getCompletedProblemIds();
  const firstUncompletedIndex = problems.findIndex(
    (problem) => !completedProblemsSet.has(problem.id),
  );

  const visibleTopGames = topGames.filter(
    (item) => !(item.entityType === "event" && item.status === "dismissed"),
  );
  const visiblePagedGames = pagedGames.filter(
    (item) => !(item.entityType === "event" && item.status === "dismissed"),
  );

  const shouldRenderTopGamesSection = visibleTopGames.length > 0;
  const shouldRenderPagedGamesSection = visiblePagedGames.length > 0;
  const shouldRenderLearnSection = true;
  const hasScrollableContent =
    shouldRenderLearnSection ||
    shouldRenderTopGamesSection ||
    shouldRenderPagedGamesSection;

  const renderEventPreview = (event: NavigationEventItem) => {
    const normalizedParticipantCount = Number.isFinite(event.participantCount)
      ? Math.max(0, Math.trunc(event.participantCount))
      : 0;
    const showBadge = normalizedParticipantCount > 6;
    const maxVisible = showBadge ? 5 : 6;
    const participantSlots = Math.min(normalizedParticipantCount, maxVisible);
    const shouldShowUnknownOpponentSlot =
      event.status === "waiting" && normalizedParticipantCount === 1;
    const renderedParticipantSlots = shouldShowUnknownOpponentSlot
      ? Math.max(2, participantSlots)
      : participantSlots;
    const preview = event.participantPreview.slice(0, participantSlots);
    const overflow = Math.max(0, normalizedParticipantCount - participantSlots);
    const hasBadge = overflow > 0;
    const itemCount = renderedParticipantSlots + (hasBadge ? 1 : 0);

    if (itemCount === 0) return null;

    const contentW = itemCount * 21 - 1;
    const cloudW = contentW + FIGHT_CLOUD_PAD_X * 2;
    const cloud = getFightCloudPath(cloudW, FIGHT_CLOUD_H);

    return (
      <FightCloudWrap>
        <FightCloudCanvas
          width={cloudW}
          height={FIGHT_CLOUD_H}
          viewBox={`0 0 ${cloudW} ${FIGHT_CLOUD_H}`}
          aria-hidden="true"
        >
          <CloudShape d={cloud} />
        </FightCloudCanvas>
        <FightCloudInner>
          {Array.from({ length: renderedParticipantSlots }, (_, index) => {
            if (shouldShowUnknownOpponentSlot && index === participantSlots) {
              return (
                <EventAvatarQuestionSlot key={`slot_${index}`} aria-hidden="true" />
              );
            }
            const participant = preview[index];
            if (!participant) {
              return (
                <EventAvatarPlaceholder
                  key={`slot_${index}`}
                  aria-hidden="true"
                />
              );
            }
            const normalizedEmojiId =
              participant.emojiId == null ? NaN : Number(participant.emojiId);
            if (Number.isFinite(normalizedEmojiId) && normalizedEmojiId > 0) {
              return (
                <EventAvatarImage
                  key={`slot_${index}`}
                  src={emojis.getEmojiUrl(
                    Math.trunc(normalizedEmojiId).toString(),
                  )}
                  alt=""
                />
              );
            }
            return (
              <EventAvatarPlaceholder
                key={`slot_${index}`}
                aria-hidden="true"
              />
            );
          })}
          {hasBadge && <FightCloudBadge>+{overflow}</FightCloudBadge>}
        </FightCloudInner>
      </FightCloudWrap>
    );
  };

  const renderGameRows = (gamesToRender: NavigationItem[]) => (
    <>
      {gamesToRender.map((item) => {
        const isGame = item.entityType === "game";
        const isActiveItem = selectedNavigationItemId === item.id;
        const isSelected = isGame && isActiveItem;
        const game = isGame ? item : null;
        const event = item.entityType === "event" ? item : null;
        const isQueueStatus =
          !!game && (game.status === "waiting" || game.status === "pending");
        const canRemove = !!game && game.status === "waiting" && !!onRemoveGame;
        const isRemoving =
          !!game && !!removingGameInviteIds?.has(game.inviteId);
        const handleRemoveClick = (
          event: React.MouseEvent<HTMLButtonElement>,
        ) => {
          event.preventDefault();
          event.stopPropagation();
          if (!isRemoving && game) {
            onRemoveGame?.(game.inviteId);
          }
        };
        const Row = event ? EventRow : GameRow;
        return (
          <GameRowContainer key={item.id}>
            <Row
              $isSelected={isSelected}
              $hasTrailingAction={canRemove}
              data-navigation-active={isActiveItem ? "true" : undefined}
              data-navigation-selected={isSelected ? "true" : undefined}
              data-navigation-selected-primary={isSelected ? "true" : undefined}
              onClick={() =>
                onSelectGame?.(
                  item,
                  isGame ? { status: item.status } : undefined,
                )
              }
            >
              {isQueueStatus && game ? (
                <>
                  <QueueManaCluster aria-hidden="true">
                    {QUEUE_MANA_SLOTS.map((slot) => (
                      <QueueManaIcon
                        key={slot}
                        $slot={slot}
                        src={queueManaImage}
                        alt=""
                      />
                    ))}
                  </QueueManaCluster>
                  <QueuePrimaryContent>
                    {getQueuePrimaryLabel(game)}
                  </QueuePrimaryContent>
                </>
              ) : event ? (
                <>
                  {renderEventPreview(event)}
                  {event.status === "active" ? (
                    <UncompletedIcon />
                  ) : (
                    <GameStatus $isSelected={isSelected}>
                      {getEventStatusLabel(event)}
                    </GameStatus>
                  )}
                </>
              ) : game ? (
                <>
                  {typeof game.opponentEmoji === "number" ? (
                    <GameEmojiImage
                      src={emojis.getEmojiUrl(game.opponentEmoji.toString())}
                      alt=""
                    />
                  ) : (
                    <GameEmojiPlaceholder />
                  )}
                  <GameText>
                    {game.opponentName && game.opponentName !== ""
                      ? game.opponentName
                      : "anon"}
                  </GameText>
                  {game.status === "active" ? (
                    <UncompletedIcon />
                  ) : (
                    <GameStatus $isSelected={isSelected}>
                      {getGameStatusLabel(game)}
                    </GameStatus>
                  )}
                </>
              ) : null}
            </Row>
            {canRemove && (
              <GameRemoveButton
                type="button"
                aria-label="Remove waiting game"
                $isDisabled={!!isRemoving}
                disabled={!!isRemoving}
                onClick={handleRemoveClick}
              >
                ×
              </GameRemoveButton>
            )}
          </GameRowContainer>
        );
      })}
    </>
  );

  const renderLearnSection = () => (
    <>
      {problems.map((item, index) => {
        const isSelected = selectedProblemId === item.id;
        return (
          <NavigationPickerButton
            key={item.id}
            $isSelected={isSelected}
            data-navigation-selected={isSelected ? "true" : undefined}
            data-navigation-selected-primary={
              !selectedNavigationItemId && isSelected ? "true" : undefined
            }
            onClick={() => handleNavigationSelect(item.id)}
          >
            <PlaceholderImage src={getIconImage(item.icon)} alt="" />
            {item.label}
            {completedProblemsSet.has(item.id) && <CompletedIcon />}
            {!completedProblemsSet.has(item.id) &&
              index === firstUncompletedIndex && <UncompletedIcon />}
          </NavigationPickerButton>
        );
      })}
    </>
  );

  return (
    <NavigationPickerContainer
      ref={navigationPickerRef}
      onTouchMove={preventScroll}
    >
      {hasScrollableContent && (
        <ScrollableList
          ref={scrollableListRef}
          onScroll={handleScrollableListScroll}
        >
          {shouldRenderTopGamesSection && renderGameRows(visibleTopGames)}
          {shouldRenderLearnSection && shouldRenderTopGamesSection && (
            <SectionSeparator />
          )}
          {shouldRenderLearnSection && renderLearnSection()}
          {shouldRenderLearnSection && shouldRenderPagedGamesSection && (
            <SectionSeparator />
          )}
          {shouldRenderPagedGamesSection && renderGameRows(visiblePagedGames)}
        </ScrollableList>
      )}
      {showsHomeNavigation && (
        <HomeBoardButton
          onClick={handleHomeClick}
          $withTopBorder={hasScrollableContent}
        >
          Home Board →
        </HomeBoardButton>
      )}
    </NavigationPickerContainer>
  );
};

export default NavigationPicker;
