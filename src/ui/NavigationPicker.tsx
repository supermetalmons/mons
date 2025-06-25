import React, { useRef } from "react";
import styled from "styled-components";
import { problems } from "../content/problems";
import { didSelectPuzzle } from "../game/gameController";
import { useGameAssets } from "../hooks/useGameAssets";

interface NavigationPickerProps {
  showsPuzzles: boolean;
  showsHomeNavigation: boolean;
  navigateHome?: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

const NavigationPickerContainer = styled.div`
  position: fixed;
  bottom: max(50px, calc(env(safe-area-inset-bottom) + 44px));
  right: 8px;
  max-height: calc(100dvh - 120px - env(safe-area-inset-bottom));
  max-width: 130pt;
  display: flex;
  flex-direction: column;
  background-color: rgba(249, 249, 249, 0.9);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
  border-radius: 7pt;
  padding: 8px;
  gap: 0;
  z-index: 5;

  @media (prefers-color-scheme: dark) {
    background-color: rgba(36, 36, 36, 0.9);
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
  color: #767787;
  text-align: left;
  padding: 1px 0 2pt;
  cursor: pointer;

  @media (prefers-color-scheme: dark) {
    color: #a0a0a0;
  }
`;

const NavigationPickerButton = styled.button`
  background: none;
  font-size: 15px;
  border: none;
  padding: 6px 15px 6px 0;
  cursor: pointer;
  text-align: left;
  color: #333;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 5px;

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background-color: rgba(232, 232, 232, 0.5);
    }
  }

  &:active {
    background-color: rgba(224, 224, 224, 0.6);
  }

  @media (prefers-color-scheme: dark) {
    color: #f0f0f0;

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background-color: rgba(70, 70, 70, 0.4);
      }
    }

    &:active {
      background-color: rgba(80, 80, 80, 0.5);
    }
  }
`;

const PlaceholderImage = styled.img`
  width: 23px;
  height: 23px;
  flex-shrink: 0;
`;

const HomeBoardButton = styled.button<{ $withTopBorder?: boolean }>`
  position: sticky;
  bottom: 0;
  background-color: #007aff;
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
    background-color: #0056b3;
  }

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background-color: #0069d9;
    }
  }

  @media (prefers-color-scheme: dark) {
    background-color: #0b84ff;

    &:active {
      background-color: #299fff;
    }

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background-color: #1a91ff;
      }
    }
  }
`;

const NavigationPicker: React.FC<NavigationPickerProps> = ({ showsPuzzles, showsHomeNavigation, navigateHome }) => {
  const navigationPickerRef = useRef<HTMLDivElement>(null);
  const { assets } = useGameAssets();

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

  return (
    <NavigationPickerContainer ref={navigationPickerRef} onTouchMove={preventScroll}>
      {showsPuzzles && (
        <ScrollableList>
          <SectionTitle>LEARN</SectionTitle>
          {problems.map((item) => (
            <NavigationPickerButton key={item.id} onClick={() => handleNavigationSelect(item.id)}>
              <PlaceholderImage src={getIconImage(item.icon)} alt="Puzzle icon" />
              {item.label}
            </NavigationPickerButton>
          ))}
        </ScrollableList>
      )}
      {showsHomeNavigation && (
        <HomeBoardButton onClick={handleHomeClick} $withTopBorder={showsPuzzles}>
          Home Board →
        </HomeBoardButton>
      )}
    </NavigationPickerContainer>
  );
};

export default NavigationPicker;
