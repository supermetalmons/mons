import React, { useRef } from "react";
import styled from "styled-components";
import { problems } from "../content/problems";
import { didSelectPuzzle } from "../game/gameController";

interface NavigationPickerProps {
  showsPuzzles: boolean;
  showsHomeNavigation: boolean;
  navigateHome?: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

const NavigationPickerContainer = styled.div`
  position: fixed;
  bottom: auto;
  right: 8px;
  bottom: 50px;
  max-height: calc(100vh - 110px);
  max-width: 100pt;
  overflow-y: auto;
  opacity: 1;
  cursor: pointer;
  background-color: rgba(249, 249, 249, 0.9);
  border-radius: 7pt;
  padding-top: 5px;
  padding-left: 0;
  padding-right: 0pt;
  padding-bottom: 0px;
  gap: 0px;
  z-index: 5;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  touch-action: none;

  @media (prefers-color-scheme: dark) {
    background-color: rgba(36, 36, 36, 0.9);
  }

  @media screen and (max-height: 453px) {
    bottom: 44px;
    max-height: calc(100vh - 100px);
  }
`;

const SectionTitle = styled.div`
  font-size: 0.5rem;
  font-weight: bold;
  color: #767787;
  text-align: left;
  padding-top: 1px;
  padding-left: 8px;
  padding-bottom: 2pt;
  cursor: pointer;

  @media (prefers-color-scheme: dark) {
    color: #a0a0a0;
  }
`;

const NavigationPickerButton = styled.button`
  background: none;
  font-size: 13px;
  border: none;
  padding: 6px 8px;
  padding-right: 15px;
  cursor: pointer;
  text-align: left;
  color: #333;
  width: 100%;
  text-align: left;

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

const HomeBoardButton = styled.button<{ $withTopBorder?: boolean }>`
  background: none;
  font-size: 16px;
  font-weight: bold;
  border: none;
  padding: 12px 8px;
  padding-right: 15px;
  cursor: pointer;
  text-align: center;
  color: #333;
  width: 100%;
  border-top: ${(props) => (props.$withTopBorder ? "1px solid rgba(200, 200, 200, 0.3)" : "none")};
  margin-top: ${(props) => (props.$withTopBorder ? "8px" : "0")};
  padding-top: 12px;

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
    border-top-color: ${(props) => (props.$withTopBorder ? "rgba(80, 80, 80, 0.3)" : "transparent")};

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

const NavigationPicker: React.FC<NavigationPickerProps> = ({ showsPuzzles, showsHomeNavigation, navigateHome }) => {
  const navigationPickerRef = useRef<HTMLDivElement>(null);

  const handleNavigationSelect = (id: string) => {
    const selectedItem = problems.find((item) => item.id === id);
    if (selectedItem) {
      didSelectPuzzle(selectedItem);
    }
  };

  const preventScroll = (e: React.TouchEvent) => {
    e.preventDefault();
  };

  const handleHomeClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (navigateHome) {
      navigateHome(event);
    }
  };

  return (
    <NavigationPickerContainer ref={navigationPickerRef} onTouchMove={preventScroll}>
      {showsPuzzles && (
        <>
          <SectionTitle>BASICS</SectionTitle>
          {problems.map((item) => (
            <NavigationPickerButton key={item.id} onClick={() => handleNavigationSelect(item.id)}>
              {item.label}
            </NavigationPickerButton>
          ))}
        </>
      )}
      {showsHomeNavigation && (
        <HomeBoardButton onClick={handleHomeClick} $withTopBorder={showsPuzzles}>
          Home Board
        </HomeBoardButton>
      )}
    </NavigationPickerContainer>
  );
};

export default NavigationPicker;
