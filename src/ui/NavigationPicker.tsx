import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
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

const EventAvatarImage = styled(GameEmojiImage)``;

const EventOverflowBadge = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  min-width: 18px;
  height: 18px;
  padding: 0 3px;
  border-radius: 9px;
  margin-left: 0;
  background: rgba(128, 128, 128, 0.09);
  font-size: 0.55rem;
  font-weight: 600;
  color: var(--navigationTextMuted);
  flex-shrink: 0;
  letter-spacing: -0.02em;
  white-space: nowrap;

  @media (prefers-color-scheme: dark) {
    background: rgba(255, 255, 255, 0.07);
  }
`;

const FightCloudWrapper = styled.div`
  position: relative;
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  margin-left: 2px;
`;

const FightCloudSvgElement = styled.svg`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
  overflow: visible;
`;

const FightCloudPuff = styled.ellipse`
  fill: rgba(160, 174, 200, 0.19);

  @media (prefers-color-scheme: dark) {
    fill: rgba(148, 168, 204, 0.13);
  }
`;

const FightCloudSparkle = styled.path`
  fill: rgba(140, 155, 185, 0.40);

  @media (prefers-color-scheme: dark) {
    fill: rgba(165, 182, 214, 0.26);
  }
`;

const FightCloudMotionLine = styled.line`
  stroke: rgba(140, 155, 185, 0.30);
  stroke-width: 1;
  stroke-linecap: round;

  @media (prefers-color-scheme: dark) {
    stroke: rgba(165, 182, 214, 0.20);
  }
`;

const FightCloudContentLayer = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  gap: 1px;
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
  color: var(--completedPuzzleIconColor);
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

const FIGHT_CLOUD_SPARKLE_ANCHORS = [
  { dx: 0.92, dy: 0.08, s: 3.2 },
  { dx: 0.05, dy: 0.88, s: 2.5 },
  { dx: 0.72, dy: 0.94, s: 2.2 },
];

const FIGHT_CLOUD_LINE_ANCHORS = [
  { x1: 0.03, y1: 0.28, x2: -0.03, y2: 0.12 },
  { x1: 0.97, y1: 0.68, x2: 1.04, y2: 0.82 },
];

const fightCloudSparklePath = (cx: number, cy: number, s: number): string => {
  const a = s * 0.28;
  return `M${cx},${cy - s}L${cx + a},${cy - a}L${cx + s},${cy}L${cx + a},${cy + a}L${cx},${cy + s}L${cx - a},${cy + a}L${cx - s},${cy}L${cx - a},${cy - a}Z`;
};

const FightCloudBackground = React.memo(({ avatarCount, hasBadge }: { avatarCount: number; hasBadge: boolean }) => {
  const layout = useMemo(() => {
    const badgeW = hasBadge ? 20 : 0;
    const gaps = Math.max(0, avatarCount - 1 + (hasBadge ? 1 : 0));
    const innerW = avatarCount * 20 + gaps + badgeW;
    const padX = 8;
    const w = innerW + padX * 2;
    const h = 30;
    const midY = h / 2;

    const n = Math.max(3, Math.round(w / 18));
    const puffs: Array<{ cx: number; cy: number; rx: number; ry: number }> = [];
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      puffs.push({
        cx: 7 + t * (w - 14),
        cy: midY + Math.sin(i * 2.3 + 0.5) * 2,
        rx: 12 + Math.sin(i * 1.1 + 0.3) * 3,
        ry: 10 + Math.cos(i * 1.7) * 2,
      });
    }
    puffs.push({ cx: w / 2, cy: midY, rx: w * 0.36, ry: h * 0.32 });

    const sparkles = FIGHT_CLOUD_SPARKLE_ANCHORS.map(({ dx, dy, s }) =>
      fightCloudSparklePath(dx * w, dy * h, s)
    );

    const lines = FIGHT_CLOUD_LINE_ANCHORS.map(({ x1, y1, x2, y2 }) => ({
      x1: x1 * w, y1: y1 * h, x2: x2 * w, y2: y2 * h,
    }));

    return { w, h, puffs, sparkles, lines };
  }, [avatarCount, hasBadge]);

  return (
    <FightCloudSvgElement
      width={layout.w}
      height={layout.h}
      viewBox={`0 0 ${layout.w} ${layout.h}`}
      aria-hidden="true"
    >
      {layout.puffs.map((p, i) => (
        <FightCloudPuff key={i} cx={p.cx} cy={p.cy} rx={p.rx} ry={p.ry} />
      ))}
      {layout.sparkles.map((d, i) => (
        <FightCloudSparkle key={i} d={d} />
      ))}
      {layout.lines.map((l, i) => (
        <FightCloudMotionLine key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} />
      ))}
    </FightCloudSvgElement>
  );
});

const MIN_AUTO_LOAD_NEXT_PAGE_THRESHOLD_PX = 640;
const MIN_REASONABLE_EPOCH_MS = Date.UTC(2000, 0, 1);
const SELECTED_ITEM_VISIBILITY_MARGIN_PX = 8;
const QUEUE_MANA_SLOTS: QueueManaSlot[] = ["top", "right", "bottom", "left"];

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
    const validParticipants = event.participantPreview.filter(
      (participant) => typeof participant.emojiId === "number",
    );
    const showBadge = event.participantCount > 6;
    const maxVisible = showBadge ? 5 : 6;
    const preview = validParticipants.slice(0, maxVisible);
    const overflow = event.participantCount - preview.length;
    const hasBadge = showBadge && overflow > 0;
    return (
      <FightCloudWrapper>
        <FightCloudBackground
          avatarCount={preview.length}
          hasBadge={hasBadge}
        />
        <FightCloudContentLayer>
          {preview.map((participant, index) => (
            <EventAvatarImage
              key={`${participant.profileId ?? participant.displayName ?? "participant"}_${index}`}
              src={emojis.getEmojiUrl(participant.emojiId!.toString())}
              alt=""
            />
          ))}
          {hasBadge && (
            <EventOverflowBadge>+{overflow}</EventOverflowBadge>
          )}
        </FightCloudContentLayer>
      </FightCloudWrapper>
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
        return (
          <GameRowContainer key={item.id}>
            <GameRow
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
            </GameRow>
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
