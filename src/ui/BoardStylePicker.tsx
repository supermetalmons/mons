import React, { useState } from "react";
import styled from "styled-components";
import { isMobile } from "../utils/misc";
import { ColorSetKey, setBoardColorSet, getCurrentColorSetKey } from "../content/boardStyles";
import { updateBoardComponentForBoardStyleChange } from "./BoardComponent";

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
  background: ${(props) => (props.colorSet === "light" ? "linear-gradient(45deg, #E8E8E8 50%, #BEBEBE 50%)" : "linear-gradient(45deg, #4A4A4A 50%, #181818 50%)")};
  position: relative;
  -webkit-tap-highlight-color: transparent;
  outline: none;

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      border-color: ${(props) => (props.isSelected ? "#0056b3" : "#007aff")};
      border-width: ${(props) => (props.isSelected ? "3px" : "2px")};
    }
  }

  &:active {
    transform: scale(0.95);
  }

  @media (prefers-color-scheme: dark) {
    border-color: ${(props) => (props.isSelected ? "#0b84ff" : "#555")};

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        border-color: ${(props) => (props.isSelected ? "#299fff" : "#0b84ff")};
        border-width: ${(props) => (props.isSelected ? "3px" : "2px")};
      }
    }
  }
`;

const BoardStylePickerComponent: React.FC = () => {
  const [currentColorSetKey, setCurrentColorSetKey] = useState<ColorSetKey>(getCurrentColorSetKey());

  const handleColorSetChange = (colorSetKey: ColorSetKey) => {
    setBoardColorSet(colorSetKey);
    updateBoardComponentForBoardStyleChange();
    setCurrentColorSetKey(colorSetKey);
  };

  return (
    <BoardStylePicker>
      <ColorSquare colorSet="light" isSelected={currentColorSetKey === "default"} onClick={!isMobile ? () => handleColorSetChange("default") : undefined} onTouchStart={isMobile ? () => handleColorSetChange("default") : undefined} aria-label="Light board theme" />
      <ColorSquare colorSet="dark" isSelected={currentColorSetKey === "darkAndYellow"} onClick={!isMobile ? () => handleColorSetChange("darkAndYellow") : undefined} onTouchStart={isMobile ? () => handleColorSetChange("darkAndYellow") : undefined} aria-label="Dark board theme" />
    </BoardStylePicker>
  );
};

export default BoardStylePickerComponent;
