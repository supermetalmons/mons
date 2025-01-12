import * as Board from "../game/board";
import { storage } from "../utils/localStorage";

export enum AssetsSet {
  Pixel = "Pixel",
  Original = "Original",
  Pangchiu = "Pangchiu",
}

export let currentAssetsSet: AssetsSet = storage.getPreferredAssetsSet(AssetsSet.Pixel);

export function setCurrentAssetsSet(set: AssetsSet) {
  currentAssetsSet = set;
  storage.setPreferredAssetsSet(set);
}

export const isPangchiuBoard = () => currentAssetsSet === AssetsSet.Pangchiu;
export const isCustomPictureBoardEnabled = () => isPangchiuBoard();

export const colors = {
  attackTarget: "#941651",
  destination: isPangchiuBoard() ? "#00BC00" : "#009500",
  spiritTarget: "#FF84FF",
  startFromSuggestion: "#FEFB00",
  selectedItem: "#00F900",
  rainbow: {
    1: "#FF2F92", // Pink
    2: "#FFD478", // Orange
    3: "#FFFB78", // Yellow
    4: "#72FA78", // Green
    5: "#73FDFF", // Cyan
    6: "#75D5FF", // Light Blue
    7: "#D783FF", // Purple
  } as { [key: string]: string },

  pangchiuBoardRainbow: {
    1: "#E01B75", // Pink
    2: "#FFB23D", // Orange
    3: "#FFE83D", // Yellow
    4: "#47D14D", // Green
    5: "#33F2FF", // Cyan
    6: "#29B8FF", // Light Blue
    7: "#B347FF", // Purple
  } as { [key: string]: string },

  getRainbow: function (index: string) {
    return isPangchiuBoard() ? this.pangchiuBoardRainbow[index] : this.rainbow[index];
  },
  itemSelectionBackground: "rgba(0, 0, 0, 0.5)",
  scoreText: "gray",

  get wave1() {
    return colorSets[currentColorSetKey].wave1;
  },
  get wave2() {
    return colorSets[currentColorSetKey].wave2;
  },
  get manaPool() {
    return colorSets[currentColorSetKey].manaPool;
  },
  get lightSquare() {
    return colorSets[currentColorSetKey].lightSquare;
  },
  get darkSquare() {
    return colorSets[currentColorSetKey].darkSquare;
  },

  sparkleLight: "#FEFEFE",
  sparkleDark: "#000",
  startFromStroke: "#fbbf24",
};

export type ColorSet = {
  darkSquare: string;
  lightSquare: string;
  manaPool: string;
  pickupItemSquare: string;
  simpleManaSquare: string;
  wave1: string;
  wave2: string;
};

export const colorSets = {
  default: {
    darkSquare: "#BEBEBE",
    lightSquare: "#E8E8E8",
    manaPool: "#030DF4",
    pickupItemSquare: "#4F4F4F",
    simpleManaSquare: "#88A8F8",
    wave1: "#6666FF",
    wave2: "#00FCFF",
  },
  darkAndYellow: {
    darkSquare: "#181818",
    lightSquare: "#4A4A4A",
    manaPool: "#FDF30B",
    pickupItemSquare: "#BAB8B9",
    simpleManaSquare: "#816306",
    wave1: "#D39F00",
    wave2: "#DBCF03",
  },
} as const;

export type ColorSetKey = keyof typeof colorSets;

let currentColorSetKey: ColorSetKey = (() => {
  const stored = storage.getBoardColorSet("default");
  return stored in colorSets ? (stored as ColorSetKey) : "default";
})();

export const toggleBoardStyle = () => {
  const keys = Object.keys(colorSets) as ColorSetKey[];
  const currentIndex = keys.indexOf(currentColorSetKey);
  currentColorSetKey = keys[(currentIndex + 1) % keys.length];
  storage.setBoardColorSet(currentColorSetKey);
  Board.didToggleBoardColors();
};

export const getCurrentColorSet = () => colorSets[currentColorSetKey];
