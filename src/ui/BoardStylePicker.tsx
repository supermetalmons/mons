import React, { useState } from "react";
import styled from "styled-components";
import { isMobile } from "../utils/misc";
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
  padding: 12px;
  display: flex;
  gap: 12px;

  @media screen and (max-height: 453px) {
    bottom: max(44px, calc(env(safe-area-inset-bottom) + 38px));
  }

  @media (prefers-color-scheme: dark) {
    background-color: rgba(36, 36, 36, 0.9);
  }
`;

export const ColorSquare = styled.button<{ isSelected?: boolean; colorSet: "light" | "dark" }>`
  width: 40px;
  height: 40px;
  border-radius: 6px;
  border: ${(props) => (props.isSelected ? "3px solid #007aff" : "1px solid #e0e0e0")};
  cursor: pointer;
  position: relative;
  -webkit-tap-highlight-color: transparent;
  outline: none;
  padding: 0;
  overflow: hidden;
  background: #e0e0e0;

  @media (prefers-color-scheme: dark) {
    border-color: ${(props) => (props.isSelected ? "#0b84ff" : "#555")};
    background: #555;
  }

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      border-color: ${(props) => (props.isSelected ? "#0056b3" : "#007aff")};
      border-width: ${(props) => (props.isSelected ? "3px" : "2px")};
    }
  }

  &:active {
    transform: scale(0.95);
  }

  svg {
    width: 100%;
    height: 100%;
    border-radius: 4px;
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
    const cellSize = 40 / 11;

    return (
      <svg viewBox="0 0 40 40" width="40" height="40">
        {generateBoardPattern({
          colorSet: colors,
          size: 40,
          cellSize: cellSize,
          offsetY: 0,
          keyPrefix: `preview-${colorSet}`,
        })}
      </svg>
    );
  };

  return (
    <BoardStylePicker>
      <ColorSquare colorSet="light" isSelected={currentColorSetKey === "default"} onClick={!isMobile ? () => handleColorSetChange("default") : undefined} onTouchStart={isMobile ? () => handleColorSetChange("default") : undefined} aria-label="Light board theme">
        {renderColorSquares("light")}
      </ColorSquare>
      <ColorSquare colorSet="dark" isSelected={currentColorSetKey === "darkAndYellow"} onClick={!isMobile ? () => handleColorSetChange("darkAndYellow") : undefined} onTouchStart={isMobile ? () => handleColorSetChange("darkAndYellow") : undefined} aria-label="Dark board theme">
        {renderColorSquares("dark")}
      </ColorSquare>
    </BoardStylePicker>
  );
};

export default BoardStylePickerComponent;
