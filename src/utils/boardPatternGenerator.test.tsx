import { generateBoardPattern } from "./boardPatternGenerator";
import { createBoardSquareTypeGrid } from "../game/boardSquareTypes";

const testColorSet = {
  darkSquare: "#BEBEBE",
  lightSquare: "#E8E8E8",
  manaPool: "#030DF4",
  pickupItemSquare: "#4F4F4F",
  simpleManaSquare: "#88A8F8",
  simpleManaSquareOnLightTile: "#D0E0FF",
  wave1: "#6666FF",
  wave2: "#00FCFF",
};

const createSquareTypes = () => createBoardSquareTypeGrid();

const getFillFor = (
  elements: ReturnType<typeof generateBoardPattern>,
  keyPrefix: string,
  row: number,
  col: number,
) => {
  const cell = elements.find(
    (element) => element.key === `${keyPrefix}-${row}-${col}`,
  );

  expect(cell).toBeDefined();
  return cell!.props.fill;
};

describe("generateBoardPattern", () => {
  test("uses the supplied square types for mana-base coloring", () => {
    const classicSquareTypes = createSquareTypes();
    classicSquareTypes[3][4] = "manaBase";
    classicSquareTypes[4][4] = "regular";

    const nonClassicSquareTypes = createSquareTypes();
    nonClassicSquareTypes[3][4] = "regular";
    nonClassicSquareTypes[4][4] = "regular";

    const classicPattern = generateBoardPattern({
      colorSet: testColorSet,
      size: 11,
      cellSize: 1,
      keyPrefix: "classic",
      squareTypes: classicSquareTypes,
    });
    const nonClassicPattern = generateBoardPattern({
      colorSet: testColorSet,
      size: 11,
      cellSize: 1,
      keyPrefix: "non-classic",
      squareTypes: nonClassicSquareTypes,
    });

    expect(getFillFor(classicPattern, "classic", 3, 4)).toBe(
      testColorSet.simpleManaSquare,
    );
    expect(getFillFor(classicPattern, "classic", 4, 4)).toBe(
      testColorSet.lightSquare,
    );
    expect(getFillFor(nonClassicPattern, "non-classic", 3, 4)).toBe(
      testColorSet.darkSquare,
    );
    expect(getFillFor(nonClassicPattern, "non-classic", 4, 4)).toBe(
      testColorSet.lightSquare,
    );
  });

  test("maps special square types to the expected palette colors", () => {
    const squareTypes = createSquareTypes();
    squareTypes[5][5] = "supermanaBase";
    squareTypes[0][0] = "manaPool";
    squareTypes[5][0] = "consumableBase";
    squareTypes[1][2] = "monBase";

    const pattern = generateBoardPattern({
      colorSet: testColorSet,
      size: 11,
      cellSize: 1,
      keyPrefix: "specials",
      squareTypes,
    });

    expect(getFillFor(pattern, "specials", 5, 5)).toBe(testColorSet.manaPool);
    expect(getFillFor(pattern, "specials", 0, 0)).toBe(testColorSet.manaPool);
    expect(getFillFor(pattern, "specials", 5, 0)).toBe(
      testColorSet.pickupItemSquare,
    );
    expect(getFillFor(pattern, "specials", 1, 2)).toBe(testColorSet.darkSquare);
  });

  test("uses the lighter mana-base shade on light tiles when enabled", () => {
    const squareTypes = createSquareTypes();
    squareTypes[4][4] = "manaBase";
    squareTypes[3][4] = "manaBase";

    const pattern = generateBoardPattern({
      colorSet: testColorSet,
      size: 11,
      cellSize: 1,
      keyPrefix: "light-tiles",
      squareTypes,
      useLightTileManaBaseShade: true,
    });

    expect(getFillFor(pattern, "light-tiles", 4, 4)).toBe(
      testColorSet.simpleManaSquareOnLightTile,
    );
    expect(getFillFor(pattern, "light-tiles", 3, 4)).toBe(
      testColorSet.simpleManaSquare,
    );
  });

  test("falls back to the classic preview layout when square types are omitted", () => {
    const pattern = generateBoardPattern({
      colorSet: testColorSet,
      size: 11,
      cellSize: 1,
      keyPrefix: "legacy",
    });

    expect(getFillFor(pattern, "legacy", 0, 0)).toBe(testColorSet.manaPool);
    expect(getFillFor(pattern, "legacy", 5, 5)).toBe(testColorSet.manaPool);
    expect(getFillFor(pattern, "legacy", 5, 0)).toBe(
      testColorSet.pickupItemSquare,
    );
    expect(getFillFor(pattern, "legacy", 3, 4)).toBe(
      testColorSet.simpleManaSquare,
    );
    expect(getFillFor(pattern, "legacy", 3, 3)).toBe(testColorSet.lightSquare);
  });
});
