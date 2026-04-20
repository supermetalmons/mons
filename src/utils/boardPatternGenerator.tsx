import React from "react";
import type { ColorSet } from "../content/boardStyles";
import {
  getDisplayedBoardSquareType,
  getLegacyBoardSquareType,
  type BoardSquareType,
  type BoardSquareTypeGrid,
} from "../game/boardSquareTypes";

export interface BoardPatternProps {
  colorSet: ColorSet;
  size: number;
  cellSize: number;
  offsetY?: number;
  keyPrefix?: string;
  squareTypes?: BoardSquareTypeGrid | null;
  useLightTileManaBaseShade?: boolean;
}

const getBoardPatternSquareFill = (
  row: number,
  col: number,
  colorSet: ColorSet,
  squareTypes?: BoardSquareTypeGrid | null,
  useLightTileManaBaseShade: boolean = false,
): string => {
  const isLightTile = (row + col) % 2 === 0;
  const defaultFill = isLightTile ? colorSet.lightSquare : colorSet.darkSquare;
  let squareType: BoardSquareType;
  if (squareTypes === undefined) {
    squareType = getLegacyBoardSquareType(row, col);
  } else if (squareTypes === null) {
    squareType = getDisplayedBoardSquareType(
      getLegacyBoardSquareType(row, col),
      false,
    );
  } else {
    squareType = squareTypes[row]?.[col] ?? "regular";
  }

  switch (squareType) {
    case "manaBase":
      return useLightTileManaBaseShade && isLightTile
        ? colorSet.simpleManaSquareOnLightTile
        : colorSet.simpleManaSquare;
    case "supermanaBase":
    case "manaPool":
      return colorSet.manaPool;
    case "consumableBase":
      return colorSet.pickupItemSquare;
    case "monBase":
    case "regular":
    default:
      return defaultFill;
  }
};

export const generateBoardPattern = ({
  colorSet,
  size,
  cellSize,
  offsetY = 0,
  keyPrefix = "square",
  squareTypes,
  useLightTileManaBaseShade = false,
}: BoardPatternProps): React.JSX.Element[] => {
  const elements: React.JSX.Element[] = [];
  const boardSize = Math.round(size / cellSize);

  for (let row = 0; row < boardSize; row += 1) {
    for (let col = 0; col < boardSize; col += 1) {
      const x = col * cellSize;
      const y = row * cellSize + offsetY;
      elements.push(
        <rect
          key={`${keyPrefix}-${row}-${col}`}
          x={x}
          y={y}
          width={cellSize}
          height={cellSize}
          fill={getBoardPatternSquareFill(
            row,
            col,
            colorSet,
            squareTypes,
            useLightTileManaBaseShade,
          )}
        />,
      );
    }
  }

  return elements;
};

export const generateBoardPatternGroup = (
  props: BoardPatternProps,
): React.JSX.Element => {
  return <g>{generateBoardPattern(props)}</g>;
};
