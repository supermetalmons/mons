import React, { useState } from "react";
import styled from "styled-components";
import { ColorSetKey, setBoardColorSet, getCurrentColorSetKey, colorSets } from "../content/boardStyles";
import { updateBoardComponentForBoardStyleChange } from "./BoardComponent";
import { generateBoardPattern } from "../utils/boardPatternGenerator";

export const BoardStylePicker = styled.div`
  position: fixed;
  bottom: max(50px, calc(env(safe-area-inset-bottom) + 44px));
  left: 8px;
  background-color: rgba(249, 249, 249, 0.9);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
  border-radius: 8px;
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
    background-color: rgba(36, 36, 36, 0.9);
  }
`;

export const ColorSquare = styled.button<{ isSelected?: boolean; colorSet: "light" | "dark" }>`
  width: 44px;
  height: 44px;
  min-width: 44px;
  min-height: 44px;
  border-radius: 8px;
  border: 2px solid transparent;
  outline: none;
  cursor: pointer;
  position: relative;
  -webkit-tap-highlight-color: transparent;
  padding: 3px;
  overflow: hidden;
  background: transparent;
  transition: all 0.15s ease;
  touch-action: manipulation;

  ${(props) =>
    props.isSelected &&
    `
    border-color: #007aff;
    box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.3);
  `}

  @media (prefers-color-scheme: dark) {
    ${(props) =>
      props.isSelected &&
      `
      border-color: #0b84ff;
      box-shadow: 0 0 0 3px rgba(11, 132, 255, 0.3);
    `}
  }

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      ${(props) =>
        !props.isSelected &&
        `
        border-color: rgba(0, 122, 255, 0.6);
        box-shadow: 0 0 0 2px rgba(0, 122, 255, 0.15);
        
        @media (prefers-color-scheme: dark) {
          border-color: rgba(11, 132, 255, 0.6);
          box-shadow: 0 0 0 2px rgba(11, 132, 255, 0.15);
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
        border-color: rgba(0, 122, 255, 0.6);
        box-shadow: 0 0 0 2px rgba(0, 122, 255, 0.15);
        
        @media (prefers-color-scheme: dark) {
          border-color: rgba(11, 132, 255, 0.6);
          box-shadow: 0 0 0 2px rgba(11, 132, 255, 0.15);
        }
      `}
    }
  }

  svg {
    width: 100%;
    height: 100%;
    border-radius: 4px;
    pointer-events: none;
  }
`;

const BoardStylePickerComponent: React.FC = () => {
  const [currentColorSetKey, setCurrentColorSetKey] = useState<ColorSetKey>(getCurrentColorSetKey());

  const handleColorSetChange = (colorSetKey: ColorSetKey) => {
    setBoardColorSet(colorSetKey);
    updateBoardComponentForBoardStyleChange();
    setCurrentColorSetKey(colorSetKey);
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
    <BoardStylePicker>
      <ColorSquare colorSet="light" isSelected={currentColorSetKey === "default"} onClick={() => handleColorSetChange("default")} aria-label="Light board theme">
        {renderColorSquares("light")}
      </ColorSquare>
      <ColorSquare colorSet="dark" isSelected={currentColorSetKey === "darkAndYellow"} onClick={() => handleColorSetChange("darkAndYellow")} aria-label="Dark board theme">
        {renderColorSquares("dark")}
      </ColorSquare>
    </BoardStylePicker>
  );
};

export default BoardStylePickerComponent;
