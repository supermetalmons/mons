import {
  createLegacyBoardSquareTypeGrid,
  getDisplayedBoardSquareType,
} from "./boardSquareTypes";

describe("getDisplayedBoardSquareType", () => {
  test("keeps mana bases highlighted for the classic variant", () => {
    expect(getDisplayedBoardSquareType("manaBase", true)).toBe("manaBase");
  });

  test("treats mana bases as regular tiles for non-classic variants", () => {
    expect(getDisplayedBoardSquareType("manaBase", false)).toBe("regular");
  });

  test("preserves non-mana-base square types across variants", () => {
    expect(getDisplayedBoardSquareType("manaPool", false)).toBe("manaPool");
    expect(getDisplayedBoardSquareType("consumableBase", false)).toBe(
      "consumableBase",
    );
  });
});

describe("createLegacyBoardSquareTypeGrid", () => {
  test("recreates the original fixed special-tile layout", () => {
    const grid = createLegacyBoardSquareTypeGrid();

    expect(grid).toHaveLength(11);
    expect(grid[0]).toHaveLength(11);
    expect(grid[0][0]).toBe("manaPool");
    expect(grid[5][5]).toBe("supermanaBase");
    expect(grid[5][0]).toBe("consumableBase");
    expect(grid[3][4]).toBe("manaBase");
    expect(grid[4][4]).toBe("regular");
  });
});
