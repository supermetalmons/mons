import React from "react";
import { ColorSet } from "../content/boardStyles";

export interface BoardPatternProps {
  colorSet: ColorSet;
  size: number;
  cellSize: number;
  offsetY?: number;
  keyPrefix?: string;
}

export const generateBoardPattern = ({ colorSet, size, cellSize, offsetY = 0, keyPrefix = "square" }: BoardPatternProps): React.JSX.Element[] => {
  const elements: React.JSX.Element[] = [];

  elements.push(<rect key={`${keyPrefix}-background`} y={offsetY} width={size} height={size} fill={colorSet.lightSquare} />);

  for (let row = 0; row < 11; row++) {
    for (let col = 0; col < 11; col++) {
      if ((row + col) % 2 === 1) {
        const x = col * cellSize;
        const y = row * cellSize + offsetY;
        elements.push(<rect key={`${keyPrefix}-${row}-${col}`} x={x} y={y} width={cellSize} height={cellSize} fill={colorSet.darkSquare} />);
      }
    }
  }

  const manaPoolPositions = [
    [5, 5],
    [0, 0],
    [10, 10],
    [10, 0],
    [0, 10],
  ];

  manaPoolPositions.forEach(([col, row], i) => {
    const x = col * cellSize;
    const y = row * cellSize + offsetY;
    elements.push(<rect key={`${keyPrefix}-mana-pool-${i}`} x={x} y={y} width={cellSize} height={cellSize} fill={colorSet.manaPool} />);
  });

  const pickupPositions = [
    [0, 5],
    [10, 5],
  ];

  pickupPositions.forEach(([col, row], i) => {
    const x = col * cellSize;
    const y = row * cellSize + offsetY;
    elements.push(<rect key={`${keyPrefix}-pickup-${i}`} x={x} y={y} width={cellSize} height={cellSize} fill={colorSet.pickupItemSquare} />);
  });

  const simpleManaPositions = [
    [4, 3],
    [6, 3],
    [4, 7],
    [6, 7],
    [3, 4],
    [5, 4],
    [7, 4],
    [3, 6],
    [5, 6],
    [7, 6],
  ];

  simpleManaPositions.forEach(([col, row], i) => {
    const x = col * cellSize;
    const y = row * cellSize + offsetY;
    elements.push(<rect key={`${keyPrefix}-simple-mana-${i}`} x={x} y={y} width={cellSize} height={cellSize} fill={colorSet.simpleManaSquare} />);
  });

  return elements;
};

export const generateBoardPatternGroup = (props: BoardPatternProps): React.JSX.Element => {
  return <g>{generateBoardPattern(props)}</g>;
};
