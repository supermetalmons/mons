import React, { useState, useRef } from "react";
import styled from "styled-components";
import { FaLock } from "react-icons/fa";
import { ColorSetKey, setBoardColorSet, getCurrentColorSetKey, colorSets, isPangchiuBoard } from "../content/boardStyles";
import { getTutorialCompleted } from "../content/problems";
import { generateBoardPattern } from "../utils/boardPatternGenerator";
import { isMobile } from "../utils/misc";
import { toggleExperimentalMode } from "../game/board";

export const BoardStylePicker = styled.div`
  position: fixed;
  bottom: max(50px, calc(env(safe-area-inset-bottom) + 44px));
  left: 8px;
  background-color: var(--panel-light-90);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
  border-radius: 10px;
  padding: 16px;
  display: flex;
  gap: 18px;
  touch-action: manipulation;
  user-select: none;
  -webkit-user-select: none;

  @media screen and (max-height: 453px) {
    bottom: max(44px, calc(env(safe-area-inset-bottom) + 38px));
  }

  @media (prefers-color-scheme: dark) {
    background-color: var(--panel-dark-90);
  }
`;

export const TooltipMessage = styled.div<{ isVisible: boolean }>`
  position: fixed;
  bottom: max(132px, calc(env(safe-area-inset-bottom) + 126px));
  left: 8px;
  background-color: var(--panel-light-90);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 13px;
  color: var(--color-text-primary);
  white-space: nowrap;
  opacity: ${(props) => (props.isVisible ? "1" : "0")};
  transform: translateY(${(props) => (props.isVisible ? "0" : "4px")});
  transition: opacity 0.3s ease, transform 0.3s ease;
  pointer-events: none;
  z-index: 1000;

  @media screen and (max-height: 453px) {
    bottom: max(128px, calc(env(safe-area-inset-bottom) + 122px));
  }

  @media (prefers-color-scheme: dark) {
    background-color: var(--panel-dark-90);
    color: var(--color-text-primary-dark);
  }
`;

export const ColorSquare = styled.button<{ isSelected?: boolean; colorSet: "light" | "dark" }>`
  width: 44px;
  height: 44px;
  min-width: 44px;
  min-height: 44px;
  border-radius: 10px;
  border: 4px solid transparent;
  outline: none;
  cursor: pointer;
  position: relative;
  -webkit-tap-highlight-color: transparent;
  padding: 0;
  overflow: hidden;
  background: transparent;
  transition: all 0.15s ease;
  touch-action: manipulation;

  ${(props) =>
    props.isSelected &&
    `
    border-color: var(--color-blue-primary);
    box-shadow: 0 0 0 3px var(--selectedBorderShadowColor);
  `}

  @media (prefers-color-scheme: dark) {
    ${(props) =>
      props.isSelected &&
      `
      border-color: var(--color-blue-primary-dark);
      box-shadow: 0 0 0 3px var(--selectedBorderShadowColorDark);
    `}
  }

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      ${(props) =>
        !props.isSelected &&
        `
        border-color: var(--focusBorderColor);
        box-shadow: 0 0 0 2px var(--focusShadowColor);
        
        @media (prefers-color-scheme: dark) {
          border-color: var(--focusBorderColorDark);
          box-shadow: 0 0 0 2px var(--focusShadowColorDark);
        }
      `}
    }
  }

  &:active {
    transform: scale(0.94);
    transition: transform 0.08s ease;
  }

  @media (hover: none) and (pointer: coarse) {
    &:active {
      ${(props) =>
        !props.isSelected &&
        `
        border-color: var(--focusBorderColor);
        box-shadow: 0 0 0 2px var(--focusShadowColor);
        
        @media (prefers-color-scheme: dark) {
          border-color: var(--focusBorderColorDark);
          box-shadow: 0 0 0 2px var(--focusShadowColorDark);
        }
      `}
    }
  }

  svg {
    position: absolute;
    top: 0;
    left: 0;
    width: 102%;
    height: 102%;
    transform: translate(-1%, -1%);
    border-radius: 6px;
    pointer-events: none;
  }
`;

export const LockedStyleItem = styled.div`
  width: 36px;
  height: 38px;
  min-width: 36px;
  min-height: 38px;
  border-radius: 6px;
  margin-top: 3px;
  margin-bottom: 3px;
  position: relative;
  overflow: hidden;
  background-color: var(--color-gray-d0);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;

  @media (prefers-color-scheme: dark) {
    background-color: var(--color-gray-a0);
  }

  &:active {
    transform: scale(0.94);
    transition: transform 0.08s ease;
  }
`;

export const PlaceholderImage = styled.img<{ blurred?: boolean }>`
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: ${(props) => (props.blurred ? "blur(1px)" : "none")};
  transform: scale(1.01);
`;

export const LockIconOverlay = styled.div`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: var(--color-white);
  font-size: 15px;
  z-index: 2;
  text-shadow: 0 1px 3px var(--textShadowLight);

  @media (prefers-color-scheme: dark) {
    text-shadow: 0 1px 3px var(--textShadowDark);
  }
`;

const BoardStylePickerComponent: React.FC = () => {
  const [currentColorSetKey, setCurrentColorSetKey] = useState<ColorSetKey>(getCurrentColorSetKey());
  const [isPangchiuBoardSelected, setIsPangchiuBoardSelected] = useState<boolean>(isPangchiuBoard());
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const isTutorialCompleted = getTutorialCompleted();

  const handleColorSetChange = (colorSetKey: ColorSetKey) => (event: React.MouseEvent<HTMLButtonElement> | React.TouchEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setBoardColorSet(colorSetKey);
    toggleExperimentalMode(true, false, false, false);
    setCurrentColorSetKey(colorSetKey);
    setIsPangchiuBoardSelected(false);
  };

  const handlePangchiuBoardSelected = (event: React.MouseEvent<HTMLButtonElement> | React.TouchEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    toggleExperimentalMode(false, false, true, false);
    setIsPangchiuBoardSelected(true);
  };

  const handleLockedStyleClick = (event: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    event.stopPropagation();

    if (tooltipTimerRef.current) {
      clearTimeout(tooltipTimerRef.current);
    }

    setShowTooltip(true);
    tooltipTimerRef.current = setTimeout(() => {
      setShowTooltip(false);
      tooltipTimerRef.current = null;
    }, 2300);
  };

  const handleImageError = () => {
    setImageLoadFailed(true);
  };

  const renderColorSquares = (colorSet: "light" | "dark") => {
    const colors = colorSet === "light" ? colorSets.default : colorSets.darkAndYellow;
    const boardSize = 11;
    const cellSize = 38 / boardSize;

    return (
      <svg viewBox="0 0 38 38" width="38" height="38">
        {generateBoardPattern({
          colorSet: colors,
          size: 38,
          cellSize: cellSize,
          offsetY: 0,
          keyPrefix: `preview-${colorSet}`,
        })}
      </svg>
    );
  };

  return (
    <>
      <TooltipMessage isVisible={showTooltip}>Complete all lessons in 🏡 menu</TooltipMessage>
      <BoardStylePicker>
        <ColorSquare colorSet="light" isSelected={!isPangchiuBoardSelected && currentColorSetKey === "default"} onClick={!isMobile ? handleColorSetChange("default") : undefined} onTouchStart={isMobile ? handleColorSetChange("default") : undefined} aria-label="Light board theme">
          {renderColorSquares("light")}
        </ColorSquare>
        <ColorSquare colorSet="dark" isSelected={!isPangchiuBoardSelected && currentColorSetKey === "darkAndYellow"} onClick={!isMobile ? handleColorSetChange("darkAndYellow") : undefined} onTouchStart={isMobile ? handleColorSetChange("darkAndYellow") : undefined} aria-label="Dark board theme">
          {renderColorSquares("dark")}
        </ColorSquare>
        {isTutorialCompleted ? (
          <ColorSquare colorSet="light" isSelected={isPangchiuBoardSelected} onClick={!isMobile ? handlePangchiuBoardSelected : undefined} onTouchStart={isMobile ? handlePangchiuBoardSelected : undefined} aria-label="Pangchiu board theme">
            {!imageLoadFailed && <PlaceholderImage src="/assets/bg/thumb/Pangchiu.jpg" alt="Pangchiu theme preview" loading="lazy" onError={handleImageError} blurred={false} />}
          </ColorSquare>
        ) : (
          <LockedStyleItem aria-label="Locked board theme" onClick={!isMobile ? handleLockedStyleClick : undefined} onTouchStart={isMobile ? handleLockedStyleClick : undefined}>
            {!imageLoadFailed && <PlaceholderImage src="/assets/bg/thumb/Pangchiu.jpg" alt="Locked theme preview" loading="lazy" onError={handleImageError} blurred={true} />}
            <LockIconOverlay>
              <FaLock />
            </LockIconOverlay>
          </LockedStyleItem>
        )}
      </BoardStylePicker>
    </>
  );
};

export default BoardStylePickerComponent;
