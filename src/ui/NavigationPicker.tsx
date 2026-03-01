import React, { useCallback, useEffect, useRef } from "react";
import styled from "styled-components";
import { problems, getCompletedProblemIds } from "../content/problems";
import { useGameAssets } from "../hooks/useGameAssets";
import { FaCheck, FaCircle } from "react-icons/fa";
import { NavigationGameItem } from "../connection/connectionModels";
import { emojis } from "../content/emojis";

interface NavigationPickerProps {
  showsHomeNavigation: boolean;
  navigateHome?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  topGames?: NavigationGameItem[];
  pagedGames?: NavigationGameItem[];
  selectedProblemId?: string | null;
  selectedGameInviteId?: string | null;
  isGamesLoading?: boolean;
  isLoadingMoreGames?: boolean;
  hasMoreGames?: boolean;
  onSelectGame?: (inviteId: string) => void;
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
  max-width: 168pt;
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
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
  flex-grow: 1;
`;

const SectionSeparator = styled.div`
  height: 1px;
  background-color: var(--navigationTextMuted);
  opacity: 0.12;
  margin: 6px -8px;

  @media (prefers-color-scheme: dark) {
    background-color: var(--color-gray-a0);
    opacity: 0.15;
  }
`;

const NavigationPickerButton = styled.button<{ $isSelected?: boolean }>`
  background: ${(props) => (props.$isSelected ? "rgba(117, 187, 255, 0.28)" : "transparent")};
  box-shadow: ${(props) => (props.$isSelected ? "inset 0 0 0 1px rgba(73, 156, 255, 0.44)" : "none")};
  border-radius: 6px;
  font-size: 15px;
  border: none;
  padding: 6px 15px 6px 0;
  cursor: pointer;
  text-align: left;
  color: var(--color-gray-33);
  width: 100%;
  display: flex;
  align-items: center;
  gap: 5px;
  font-weight: ${(props) => (props.$isSelected ? 600 : 400)};

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background-color: ${(props) => (props.$isSelected ? "rgba(117, 187, 255, 0.36)" : "var(--interactiveHoverBackgroundLight)")};
    }
  }

  &:active {
    background-color: ${(props) => (props.$isSelected ? "rgba(117, 187, 255, 0.46)" : "var(--interactiveActiveBackgroundLight)")};
  }

  @media (prefers-color-scheme: dark) {
    color: var(--color-gray-f0);
    background: ${(props) => (props.$isSelected ? "rgba(75, 150, 255, 0.3)" : "transparent")};
    box-shadow: ${(props) => (props.$isSelected ? "inset 0 0 0 1px rgba(104, 181, 255, 0.52)" : "none")};

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background-color: ${(props) => (props.$isSelected ? "rgba(75, 150, 255, 0.4)" : "var(--interactiveHoverBackgroundDark)")};
      }
    }

    &:active {
      background-color: ${(props) => (props.$isSelected ? "rgba(75, 150, 255, 0.5)" : "var(--interactiveActiveBackgroundDark)")};
    }
  }
`;

const GameRow = styled(NavigationPickerButton)`
  font-size: 0.8rem;
  flex: 1;
  min-width: 0;
  padding: 7px 8px 7px 0;
`;

const GameRowContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
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

const GameText = styled.span`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const GameStatus = styled.span<{ $isSelected?: boolean }>`
  margin-left: auto;
  font-size: 0.52rem;
  color: ${(props) => (props.$isSelected ? "var(--color-blue-primary)" : "var(--navigationTextMuted)")};
  text-transform: uppercase;

  @media (prefers-color-scheme: dark) {
    color: ${(props) => (props.$isSelected ? "var(--color-blue-primary-dark)" : "var(--navigationTextMuted)")};
  }
`;

const GameRemoveButton = styled.button<{ $isDisabled?: boolean }>`
  margin-left: 2px;
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
      background-color: ${(props) => (props.$isDisabled ? "transparent" : "var(--interactiveHoverBackgroundLight)")};
      color: var(--color-gray-33);
    }
  }

  &:active {
    background-color: ${(props) => (props.$isDisabled ? "transparent" : "var(--interactiveActiveBackgroundLight)")};
  }

  @media (prefers-color-scheme: dark) {
    color: var(--navigationTextMuted);

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background-color: ${(props) => (props.$isDisabled ? "transparent" : "var(--interactiveHoverBackgroundDark)")};
        color: var(--color-gray-f0);
      }
    }

    &:active {
      background-color: ${(props) => (props.$isDisabled ? "transparent" : "var(--interactiveActiveBackgroundDark)")};
    }
  }
`;

const CompletedIcon = styled(FaCheck)`
  color: var(--completedPuzzleIconColor);
  font-size: 0.5rem;
  margin-left: auto;
  flex-shrink: 0;
  padding-left: 4pt;
`;

const UncompletedIcon = styled(FaCircle)`
  color: var(--color-blue-primary);
  font-size: 0.4rem;
  margin-left: auto;
  flex-shrink: 0;
  padding-left: 7pt;
  overflow: visible;
`;

const PlaceholderImage = styled.img`
  width: 23px;
  height: 23px;
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
  width: 100%;
  margin-top: ${(props) => (props.$withTopBorder ? "8px" : "0")};
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

const NavigationPicker: React.FC<NavigationPickerProps> = ({
  showsHomeNavigation,
  navigateHome,
  topGames = [],
  pagedGames = [],
  selectedProblemId = null,
  selectedGameInviteId = null,
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

  const maybeLoadMoreGames = useCallback((container: HTMLDivElement | null, source: "scroll" | "effect") => {
    if (!container || !onLoadMoreGames || !hasMoreGames || isGamesLoading || isLoadingMoreGames || isAutoLoadPendingRef.current) {
      return;
    }

    const isScrollable = container.scrollHeight > container.clientHeight + 1;
    if (!hasUserScrolledRef.current && isScrollable) {
      return;
    }

    if (hasUserScrolledRef.current && source === "effect" && !canRunOneFollowUpLoadRef.current) {
      return;
    }

    const thresholdPx = Math.max(MIN_AUTO_LOAD_NEXT_PAGE_THRESHOLD_PX, container.clientHeight * 2);
    const remainingScroll = container.scrollHeight - container.scrollTop - container.clientHeight;
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
  }, [hasMoreGames, isGamesLoading, isLoadingMoreGames, onLoadMoreGames]);

  const handleScrollableListScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    if (event.currentTarget.scrollTop > 0) {
      hasUserScrolledRef.current = true;
    }
    maybeLoadMoreGames(event.currentTarget, "scroll");
  }, [maybeLoadMoreGames]);

  useEffect(() => {
    if (!isLoadingMoreGames) {
      isAutoLoadPendingRef.current = false;
      maybeLoadMoreGames(scrollableListRef.current, "effect");
    }
  }, [isLoadingMoreGames, maybeLoadMoreGames]);

  useEffect(() => {
    maybeLoadMoreGames(scrollableListRef.current, "effect");
  }, [maybeLoadMoreGames, topGames.length, pagedGames.length]);

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
      return "ended";
    }
    return "waiting";
  };

  const completedProblemsSet = getCompletedProblemIds();
  const firstUncompletedIndex = problems.findIndex((problem) => !completedProblemsSet.has(problem.id));

  const shouldRenderTopGamesSection = !isGamesLoading && topGames.length > 0;
  const shouldRenderPagedGamesSection = !isGamesLoading && pagedGames.length > 0;
  const shouldRenderLearnSection = true;
  const hasScrollableContent = shouldRenderLearnSection || shouldRenderTopGamesSection || shouldRenderPagedGamesSection;

  const renderGameRows = (gamesToRender: NavigationGameItem[]) => (
    <>
      {gamesToRender.map((game) => {
        const isSelected = selectedGameInviteId === game.inviteId;
        const canRemove = game.status === "waiting" && !!onRemoveGame;
        const isRemoving = !!removingGameInviteIds?.has(game.inviteId);
        const handleRemoveClick = (event: React.MouseEvent<HTMLButtonElement>) => {
          event.preventDefault();
          event.stopPropagation();
          if (!isRemoving) {
            onRemoveGame?.(game.inviteId);
          }
        };
        return (
          <GameRowContainer key={game.inviteId}>
            <GameRow $isSelected={isSelected} onClick={() => onSelectGame?.(game.inviteId)}>
              {typeof game.opponentEmoji === "number" ? (
                <GameEmojiImage src={emojis.getEmojiUrl(game.opponentEmoji.toString())} alt="" />
              ) : (
                <GameEmojiPlaceholder />
              )}
              <GameText>{game.opponentName && game.opponentName !== "" ? game.opponentName : "anon"}</GameText>
              <GameStatus $isSelected={isSelected}>{getGameStatusLabel(game)}</GameStatus>
            </GameRow>
            {canRemove && (
              <GameRemoveButton
                type="button"
                aria-label="Remove waiting game"
                $isDisabled={isRemoving}
                disabled={isRemoving}
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
          <NavigationPickerButton key={item.id} $isSelected={isSelected} onClick={() => handleNavigationSelect(item.id)}>
            <PlaceholderImage src={getIconImage(item.icon)} alt="" />
            {item.label}
            {completedProblemsSet.has(item.id) && <CompletedIcon />}
            {!completedProblemsSet.has(item.id) && index === firstUncompletedIndex && <UncompletedIcon />}
          </NavigationPickerButton>
        );
      })}
    </>
  );

  return (
    <NavigationPickerContainer ref={navigationPickerRef} onTouchMove={preventScroll}>
      {hasScrollableContent && (
        <ScrollableList ref={scrollableListRef} onScroll={handleScrollableListScroll}>
          {shouldRenderTopGamesSection && renderGameRows(topGames)}
          {shouldRenderLearnSection && shouldRenderTopGamesSection && <SectionSeparator />}
          {shouldRenderLearnSection && renderLearnSection()}
          {shouldRenderLearnSection && shouldRenderPagedGamesSection && <SectionSeparator />}
          {shouldRenderPagedGamesSection && renderGameRows(pagedGames)}
        </ScrollableList>
      )}
      {showsHomeNavigation && (
        <HomeBoardButton onClick={handleHomeClick} $withTopBorder={hasScrollableContent}>
          Home Board →
        </HomeBoardButton>
      )}
    </NavigationPickerContainer>
  );
};

export default NavigationPicker;
