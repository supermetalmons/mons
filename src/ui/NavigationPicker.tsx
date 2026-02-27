import React, { useMemo, useRef } from "react";
import styled from "styled-components";
import { problems, getCompletedProblemIds } from "../content/problems";
import { didSelectPuzzle } from "../game/gameController";
import { useGameAssets } from "../hooks/useGameAssets";
import { FaCheck, FaCircle } from "react-icons/fa";
import { NavigationGameItem } from "../connection/connectionModels";
import { emojis } from "../content/emojis";

interface NavigationPickerProps {
  showsHomeNavigation: boolean;
  navigateHome?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  games?: NavigationGameItem[];
  selectedProblemId?: string | null;
  selectedGameInviteId?: string | null;
  isGamesLoading?: boolean;
  isLoadingMoreGames?: boolean;
  hasMoreGames?: boolean;
  isUsingFallbackScope?: boolean;
  onSelectGame?: (inviteId: string) => void;
  onLoadMoreGames?: () => void;
}

const NavigationPickerContainer = styled.div`
  position: fixed;
  bottom: max(50px, calc(env(safe-area-inset-bottom) + 44px));
  right: 8px;
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
  -webkit-overflow-scrolling: touch;
  flex-grow: 1;
`;

const SectionTitle = styled.div`
  font-size: 0.55rem;
  font-weight: bold;
  color: var(--navigationTextMuted);
  text-align: left;
  padding: 1px 0 2pt;
  cursor: pointer;

  @media (prefers-color-scheme: dark) {
    color: var(--color-gray-a0);
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
  padding: 7px 8px 7px 0;
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

const EmptyRow = styled.div`
  font-size: 0.7rem;
  color: var(--navigationTextMuted);
  padding: 4px 0 8px;
`;

const LoadMoreGamesButton = styled(NavigationPickerButton)`
  font-size: 0.72rem;
  padding: 4px 8px 8px 0;
  color: var(--color-blue-primary);
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

const NavigationPicker: React.FC<NavigationPickerProps> = ({
  showsHomeNavigation,
  navigateHome,
  games = [],
  selectedProblemId = null,
  selectedGameInviteId = null,
  isGamesLoading = false,
  isLoadingMoreGames = false,
  hasMoreGames = false,
  isUsingFallbackScope = false,
  onSelectGame,
  onLoadMoreGames,
}) => {
  const navigationPickerRef = useRef<HTMLDivElement>(null);
  const { assets } = useGameAssets();

  const gamesForDisplay = useMemo(() => {
    const getStatusPriority = (status: NavigationGameItem["status"]): number => {
      if (status === "pending") {
        return 0;
      }
      if (status === "waiting") {
        return 1;
      }
      if (status === "active") {
        return 2;
      }
      return 3;
    };

    return games.slice().sort((left, right) => {
      const leftPriority = getStatusPriority(left.status);
      const rightPriority = getStatusPriority(right.status);
      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }
      if (left.listSortAtMs !== right.listSortAtMs) {
        return right.listSortAtMs - left.listSortAtMs;
      }
      return left.inviteId.localeCompare(right.inviteId);
    });
  }, [games]);

  const handleNavigationSelect = (id: string) => {
    const selectedItem = problems.find((item) => item.id === id);
    if (selectedItem) {
      didSelectPuzzle(selectedItem);
    }
  };

  const preventScroll = (e: React.TouchEvent) => {
    e.preventDefault();
  };

  const handleHomeClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    navigateHome?.(e);
  };

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
  const hasIncompleteTutorial = firstUncompletedIndex !== -1;

  const shouldRenderGamesSection = true;
  const shouldRenderLearnSection = true;
  const showTopLearn = shouldRenderLearnSection && hasIncompleteTutorial;
  const showBottomLearn = shouldRenderLearnSection && !hasIncompleteTutorial;
  const hasScrollableContent = showTopLearn || showBottomLearn || shouldRenderGamesSection;

  const renderLearnSection = () => (
    <>
      <SectionTitle>LEARN</SectionTitle>
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
        <ScrollableList>
          {showTopLearn && renderLearnSection()}

          {shouldRenderGamesSection && (
            <>
              <SectionTitle>GAMES</SectionTitle>
              {isGamesLoading && <EmptyRow>Loading games...</EmptyRow>}
              {!isGamesLoading && isUsingFallbackScope && <EmptyRow>Showing games for current login only</EmptyRow>}
              {!isGamesLoading && games.length === 0 && <EmptyRow>No games yet</EmptyRow>}
              {!isGamesLoading &&
                gamesForDisplay.map((game) => {
                  const isSelected = selectedGameInviteId === game.inviteId;
                  return (
                    <GameRow key={game.inviteId} $isSelected={isSelected} onClick={() => onSelectGame?.(game.inviteId)}>
                      {typeof game.opponentEmoji === "number" ? (
                        <GameEmojiImage src={emojis.getEmojiUrl(game.opponentEmoji.toString())} alt="" />
                      ) : (
                        <GameEmojiPlaceholder />
                      )}
                      <GameText>{game.opponentName && game.opponentName !== "" ? game.opponentName : "anon"}</GameText>
                      <GameStatus $isSelected={isSelected}>{getGameStatusLabel(game)}</GameStatus>
                    </GameRow>
                  );
                })}
              {!isGamesLoading && hasMoreGames && !isLoadingMoreGames && <LoadMoreGamesButton onClick={() => onLoadMoreGames?.()}>Load more games</LoadMoreGamesButton>}
              {!isGamesLoading && isLoadingMoreGames && <EmptyRow>Loading more games...</EmptyRow>}
            </>
          )}

          {showBottomLearn && renderLearnSection()}
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
