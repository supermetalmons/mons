import * as MonsWeb from "mons-web";
import * as SVG from "../utils/svg";
import { isOnlineGame, didClickSquare, didSelectInputModifier, canChangeEmoji, sendPlayerEmojiUpdate, isWatchOnly, isGameWithBot, isWaitingForRematchResponse, showItemsAfterChangingAssetsStyle, cleanupCurrentInputs, didClickInviteBotIntoLocalGameButton } from "./gameController";
import { Highlight, HighlightKind, InputModifier, Location, Sound, Trace, ItemKind } from "../utils/gameModels";
import { colors, currentAssetsSet, AssetsSet, BoardStyleSet, getCurrentBoardStyleSet, isCustomPictureBoardEnabled, isPangchiuBoard, setCurrentAssetsSet, setCurrentBoardStyleSet } from "../content/boardStyles";
import { isDesktopSafari, defaultInputEventName } from "../utils/misc";
import { playSounds } from "../content/sounds";
import { hasNavigationPopupVisible, didNotDismissAnythingWithOutsideTapJustNow, hasBottomPopupsVisible, resetOutsideTapDismissTimeout } from "../ui/BottomControls";
import { hasMainMenuPopupsVisible } from "../ui/MainMenu";
import { hasIslandOverlayVisible } from "../ui/islandOverlayState";
import { newEmptyPlayerMetadata, getStashedPlayerEthAddress, getStashedPlayerSolAddress, getEnsNameForUid, getRatingForUid, updatePlayerMetadataWithProfile, getStashedUsername, getStashedPlayerProfile } from "../utils/playerMetadata";
import { preventTouchstartIfNeeded } from "..";
import { setTopBoardOverlayVisible, updateBoardComponentForBoardStyleChange, showRaibowAura, updateAuraForAvatarElement, updateWagerPlayerUids } from "../ui/BoardComponent";
import { storage } from "../utils/storage";
import { PlayerProfile } from "../connection/connectionModels";
import { hasProfilePopupVisible } from "../ui/ProfileSignIn";
import { showShinyCard, showsShinyCardSomewhere } from "../ui/ShinyCard";
import { getMonId, getMonsIndexes, MonType } from "../utils/namedMons";
import { instructor } from "../assets/talkingDude";
import { launchConfetti, stopConfetti } from "./confetti";
import { soundPlayer } from "../utils/SoundPlayer";
import type { MaterialName } from "../services/rocksMiningService";
import { decrementLifecycleCounter, incrementLifecycleCounter } from "../lifecycle/lifecycleDiagnostics";
import { getCurrentRouteState } from "../navigation/routeState";

let isExperimentingWithSprites = storage.getIsExperimentingWithSprites(false);
const valentinesLoaderEnabled = false;

const refreshBoardAfterStyleChange = (reloadItems: boolean) => {
  updateBoardComponentForBoardStyleChange();
  if (reloadItems) {
    void didToggleItemsStyleSet();
  }
  setManagedBoardTimeout(() => updateLayout(), 1);
};

export function setBoardStyleSet(styleSet: BoardStyleSet) {
  if (getCurrentBoardStyleSet() === styleSet) {
    return;
  }
  setCurrentBoardStyleSet(styleSet);
  refreshBoardAfterStyleChange(true);
}

export function setItemsStyleSet(set: AssetsSet, doNotStore: boolean = false) {
  const didAssetsSetChange = currentAssetsSet !== set;
  const didAnimatedSpritesChange = isExperimentingWithSprites;
  if (!didAssetsSetChange && !didAnimatedSpritesChange) {
    return;
  }
  setCurrentAssetsSet(set);
  isExperimentingWithSprites = false;
  if (!doNotStore) {
    storage.setIsExperimentingWithSprites(isExperimentingWithSprites);
  }
  refreshBoardAfterStyleChange(true);
}

export function setAnimatedMonsEnabled(enabled: boolean, doNotStore: boolean = false) {
  const didAnimatedSpritesChange = isExperimentingWithSprites !== enabled;
  if (!didAnimatedSpritesChange) {
    return;
  }
  isExperimentingWithSprites = enabled;
  if (!doNotStore) {
    storage.setIsExperimentingWithSprites(isExperimentingWithSprites);
  }
  refreshBoardAfterStyleChange(true);
}

export function toggleExperimentalMode(defaultMode: boolean, animated: boolean, pangchiu: boolean, doNotStore: boolean) {
  if (defaultMode) {
    setAnimatedMonsEnabled(false, doNotStore);
    return;
  }
  if (animated) {
    setAnimatedMonsEnabled(true, doNotStore);
    return;
  }
  if (pangchiu) {
    setItemsStyleSet(AssetsSet.Pangchiu, doNotStore);
  }
}

export let playerSideMetadata = newEmptyPlayerMetadata();
export let opponentSideMetadata = newEmptyPlayerMetadata();

function clearVoiceReactionState() {
  playerSideMetadata.voiceReactionText = "";
  playerSideMetadata.voiceReactionDate = undefined;
  opponentSideMetadata.voiceReactionText = "";
  opponentSideMetadata.voiceReactionDate = undefined;
}

export let isFlipped = false;
let traceIndex = 0;
let showsPlayerTimer = false;
let showsOpponentTimer = false;
type EndOfGameMarker = "none" | "victory" | "resign";
let playerEndOfGameMarker: EndOfGameMarker = "none";
let opponentEndOfGameMarker: EndOfGameMarker = "none";

type SmoothWaveRenderData = {
  path: SVGPathElement;
  xPoints: number[];
  yBase: number;
  scaledAmplitudes: number[];
  segments: string[];
  speed: number;
  phaseOffset: number;
};

type SmoothWaveAnimationData = {
  container: SVGGElement;
  frame: SVGGElement;
  waves: SmoothWaveRenderData[];
};

const smoothWavePointCount = 12;
const smoothWaveTaperMargin = 0.2;
const smoothWaveFrameIntervalMs = 1000 / 30;
const smoothWaveAngleStep = (2 * Math.PI) / smoothWavePointCount;
const smoothWaveCosStep = Math.cos(smoothWaveAngleStep);
const smoothWaveSinStep = Math.sin(smoothWaveAngleStep);

let countdownInterval: NodeJS.Timeout | null = null;
let monsBoardDisplayAnimationTimeout: NodeJS.Timeout | null = null;
let monsBoardDisplayAnimationRunToken = 0;
let boardInputHandler: ((event: Event) => void) | null = null;
let hasSetupBoardRuntime = false;
let didRegisterResizeHandler = false;
const wavesIntervalIds = new Set<number>();
const smoothWaveAnimations = new Set<SmoothWaveAnimationData>();
let smoothWaveTickerRafId: number | null = null;
let smoothWaveTickerTimeoutId: number | null = null;
const sparkleIntervalIds = new Set<number>();
const boardTimeoutIds = new Set<number>();
const boardRafIds = new Set<number>();
let boardRuntimeToken = 0;

const isBoardRuntimeTokenActive = (runtimeToken: number) => runtimeToken === boardRuntimeToken;

let board: HTMLElement | null;
let highlightsLayer: HTMLElement | null;
let itemsLayer: HTMLElement | null;
export let effectsLayer: HTMLElement | null;
let controlsLayer: HTMLElement | null;
let boardBackgroundLayer: HTMLElement | null;

const items: { [key: string]: SVGElement } = {};
const basesPlaceholders: { [key: string]: SVGElement } = {};
const wavesFrames: { [key: string]: SVGElement } = {};
const waveCornerLocations = [new Location(0, 0), new Location(10, 0), new Location(0, 10), new Location(10, 10)];
const opponentMoveStatusItems: SVGElement[] = [];
const playerMoveStatusItems: SVGElement[] = [];
const rotatedItemImageCache: Map<ItemKind, string> = new Map();
const minHorizontalOffset = 0.21;
let showsItemSelectionOrConfirmationOverlay = false;
let dimmingOverlay: SVGElement | undefined;
let opponentNameText: SVGElement | undefined;
let playerNameText: SVGElement | undefined;
let opponentScoreText: SVGElement | undefined;
let opponentEndOfGameIcon: SVGElement | undefined;
let inviteBotButtonContainer: SVGElement | undefined;
let inviteBotButtonElement: HTMLButtonElement | undefined;
let cleanupInviteBotButtonThemeListener: (() => void) | null = null;

let playerScoreText: SVGElement | undefined;
let playerEndOfGameIcon: SVGElement | undefined;
let opponentTimer: SVGElement | undefined;
let playerTimer: SVGElement | undefined;
let opponentAvatar: SVGElement | undefined;
let playerAvatar: SVGElement | undefined;
let opponentAvatarPlaceholder: SVGElement | undefined;
let playerAvatarPlaceholder: SVGElement | undefined;
let doNotShowPlayerAvatarPlaceholderAgain = false;
let doNotShowOpponentAvatarPlaceholderAgain = false;
let localHumanSeriesOpponentEmojiId: string | null = null;
let activeTimer: SVGElement | null = null;
let talkingDude: SVGElement | null = null;
let talkingDudeTextDiv: HTMLElement | null;
let instructionsContainerElement: SVGElement | undefined;
let instructionsCloudBg: SVGPathElement | null = null;
let talkingDudeIsTalking = true;

let assets: any;
let drainer: SVGElement;
let angel: SVGElement;
let demon: SVGElement;
let spirit: SVGElement;
let mystic: SVGElement;
let mana: SVGElement;
let drainerB: SVGElement;
let angelB: SVGElement;
let demonB: SVGElement;
let spiritB: SVGElement;
let mysticB: SVGElement;
let manaB: SVGElement;
let bombOrPotion: SVGElement;
let bomb: SVGElement;
let supermana: SVGElement;
let supermanaSimple: SVGElement;

const MATERIAL_BASE_URL = "https://assets.mons.link/rocks/materials";
const END_OF_GAME_ICON_BASE_URL = "https://assets.mons.link/icons";
const END_OF_GAME_ICON_URLS = {
  victory: `${END_OF_GAME_ICON_BASE_URL}/victory.webp`,
  resign: `${END_OF_GAME_ICON_BASE_URL}/resign_1.webp`,
} as const;
type EndOfGameIconName = keyof typeof END_OF_GAME_ICON_URLS;
const endOfGameIconPromises: Map<EndOfGameIconName, Promise<string | null>> = new Map();
const endOfGameIconResolvedUrls: Partial<Record<EndOfGameIconName, string>> = {};
const END_OF_GAME_ICON_OPACITY = 0.69;
const END_OF_GAME_ICON_SIZE_MULTIPLIER = 0.53;
const END_OF_GAME_ICON_GAP_MULTIPLIER = 0.06;
const END_OF_GAME_NAME_OFFSET_MULTIPLIER = 0.54;
const SCORE_TEXT_FONT_SIZE_MULTIPLIER = 50;
const INVITE_BOT_BUTTON_FONT_TO_SCORE_RATIO = 0.68;
const INVITE_BOT_BUTTON_X_GAP_MULTIPLIER = 0.18;
const INVITE_BOT_BUTTON_HEIGHT_TO_FONT_RATIO = 2.1;
const INVITE_BOT_BUTTON_MIN_FONT_SIZE_PX = 12;
const INVITE_BOT_BUTTON_PADDING_TO_FONT_RATIO = 0.9;
const INVITE_BOT_BUTTON_TEXT_WIDTH_TO_FONT_RATIO = 5.5;
const MAX_WAGER_PILE_ITEMS = 13;
const MAX_WAGER_WIN_PILE_ITEMS = 32;
const WAGER_PILE_SCALE = 1;
const WAGER_WIN_PILE_SCALE = 1.3333;
const WAGER_ICON_SIZE_MULTIPLIER = 0.669;
const WAGER_ICON_PADDING_FRAC = 0.15;
const WAGER_WIN_ANIM_DURATION_MS = 800;

const applyInviteBotButtonColors = (button: HTMLButtonElement, state: "default" | "hover" | "active") => {
  const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  if (dark) {
    if (state === "active") {
      button.style.backgroundColor = "var(--color-gray-55)";
    } else if (state === "hover") {
      button.style.backgroundColor = "var(--color-gray-44)";
    } else {
      button.style.backgroundColor = "var(--color-gray-33)";
    }
    button.style.color = "var(--color-blue-primary-dark)";
  } else {
    if (state === "active") {
      button.style.backgroundColor = "var(--color-gray-d0)";
    } else if (state === "hover") {
      button.style.backgroundColor = "var(--color-gray-e0)";
    } else {
      button.style.backgroundColor = "var(--color-gray-f0)";
    }
    button.style.color = "var(--color-blue-primary)";
  }
};

type InviteBotButtonLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
  fontSizePx: number;
  horizontalPaddingPx: number;
};

const getInviteBotButtonLayout = (scoreText: SVGElement, multiplicator: number, avatarSize: number): InviteBotButtonLayout => {
  const scoreX = parseFloat(scoreText.getAttribute("x") || "0") / 100;
  const scoreY = parseFloat(scoreText.getAttribute("y") || "0") / 100;
  const scoreWidth = getSvgTextWidthInBoardUnits(scoreText);
  const scoreFontBoardUnits = SCORE_TEXT_FONT_SIZE_MULTIPLIER * multiplicator / 100;
  const fontSizePx = Math.max(INVITE_BOT_BUTTON_MIN_FONT_SIZE_PX, Math.round(SCORE_TEXT_FONT_SIZE_MULTIPLIER * multiplicator * INVITE_BOT_BUTTON_FONT_TO_SCORE_RATIO));
  const fontBoardUnits = fontSizePx / 100;
  const height = Math.min(fontBoardUnits * INVITE_BOT_BUTTON_HEIGHT_TO_FONT_RATIO, avatarSize * 0.88);
  const x = scoreX + scoreWidth + INVITE_BOT_BUTTON_X_GAP_MULTIPLIER * multiplicator;
  const horizontalPaddingPx = Math.max(6, Math.round(fontSizePx * INVITE_BOT_BUTTON_PADDING_TO_FONT_RATIO));
  const width = (fontSizePx * INVITE_BOT_BUTTON_TEXT_WIDTH_TO_FONT_RATIO + 2 * horizontalPaddingPx) / 100;
  const scoreCenterY = scoreY - scoreFontBoardUnits * 0.35;
  const y = scoreCenterY - height / 2 - 0.023 * multiplicator;
  return { x, y, width, height, fontSizePx, horizontalPaddingPx };
};

const fetchCachedImageUrl = (url: string): Promise<string | null> =>
  fetch(url)
    .then((res) => {
      if (!res.ok) throw new Error("Failed to fetch image");
      return res.blob();
    })
    .then((blob) => URL.createObjectURL(blob))
    .catch(() => null);

const getEndOfGameIconCachedUrl = (name: EndOfGameIconName): Promise<string | null> => {
  if (!endOfGameIconPromises.has(name)) {
    const p = fetchCachedImageUrl(END_OF_GAME_ICON_URLS[name]).then((resolvedUrl) => {
      if (resolvedUrl) {
        endOfGameIconResolvedUrls[name] = resolvedUrl;
      } else {
        endOfGameIconPromises.delete(name);
      }
      return resolvedUrl;
    });
    endOfGameIconPromises.set(name, p);
  }
  return endOfGameIconPromises.get(name)!;
};

const preloadEndOfGameIcons = () => {
  (Object.keys(END_OF_GAME_ICON_URLS) as EndOfGameIconName[]).forEach((name) => {
    void getEndOfGameIconCachedUrl(name);
  });
};

type WagerPile = {
  positions: Array<{ u: number; v: number }>;
  frames: Array<{ x: number; y: number }>;
  material: MaterialName | null;
  materialUrl: string | null;
  count: number;
  actualCount: number;
  rect: { x: number; y: number; w: number; h: number } | null;
  iconSize: number;
};

export type WagerPileSide = "player" | "opponent";
type WagerPileRect = { x: number; y: number; w: number; h: number };
export type WagerPileAnimation = "none" | "appear" | "disappear";
export type WagerPileRenderState = {
  side: WagerPileSide | "winner";
  rect: WagerPileRect;
  iconSize: number;
  materialUrl: string;
  frames: Array<{ x: number; y: number }>;
  count: number;
  actualCount: number;
  animation: WagerPileAnimation;
  isPending: boolean;
};
export type WagerRenderState = {
  player: WagerPileRenderState | null;
  opponent: WagerPileRenderState | null;
  winner: WagerPileRenderState | null;
  winAnimationActive: boolean;
  playerDisappearing: WagerPileRenderState | null;
  opponentDisappearing: WagerPileRenderState | null;
};

let playerWagerPile: WagerPile | null = null;
let opponentWagerPile: WagerPile | null = null;
let winnerWagerPile: WagerPile | null = null;
let wagerWinAnimRaf: number | null = null;
let wagerWinAnimActive = false;
let winnerPileActive = false;
let wagerWinAnimState: {
  startTime: number;
  duration: number;
  iconSize: number;
  starts: Array<{ x: number; y: number }>;
  targets: Array<{ x: number; y: number }>;
  drifts: Array<{ x: number; y: number }>;
  delays: number[];
} | null = null;
let lastWagerWinnerIsOpponent = false;
let handleWagerRenderState: ((state: WagerRenderState) => void) | null = null;
let wagerAnimationsReady = false;
let previousPlayerPileVisible = false;
let previousOpponentPileVisible = false;
let lastVisiblePlayerPileState: WagerPileRenderState | null = null;
let lastVisibleOpponentPileState: WagerPileRenderState | null = null;
let disappearingPlayerPile: WagerPileRenderState | null = null;
let disappearingOpponentPile: WagerPileRenderState | null = null;
let disappearingPileTimers: { player: number | null; opponent: number | null } = { player: null, opponent: null };
const WAGER_DISAPPEAR_ANIMATION_MS = 280;
let playerPilePending = false;
let opponentPilePending = false;
const boardWagerDebugLogsEnabled = process.env.NODE_ENV !== "production";
let lastWagerEmitSignature = "";
const logBoardWagerDebug = (event: string, payload: Record<string, unknown> = {}) => {
  if (!boardWagerDebugLogsEnabled) {
    return;
  }
  console.log("wager-debug", { source: "board", event, ...payload });
};

preloadEndOfGameIcons();

export function setWagerRenderHandler(handler: ((state: WagerRenderState) => void) | null) {
  handleWagerRenderState = handler;
  if (handler) {
    emitWagerRenderState();
  }
}

const emojis = (await import("../content/emojis")).emojis;

let currentTextAnimation: {
  isAnimating: boolean;
  fastForwardCallback: (() => void) | null;
  timer: NodeJS.Timeout | null;
} = {
  isAnimating: false,
  fastForwardCallback: null,
  timer: null,
};

const trackBoardTimeout = (timeoutId: number) => {
  boardTimeoutIds.add(timeoutId);
  incrementLifecycleCounter("boardTimeouts");
};

const setManagedBoardTimeout = (callback: () => void, delay: number): number => {
  const timeoutId = window.setTimeout(() => {
    if (boardTimeoutIds.has(timeoutId)) {
      boardTimeoutIds.delete(timeoutId);
      decrementLifecycleCounter("boardTimeouts");
    }
    callback();
  }, delay);
  trackBoardTimeout(timeoutId);
  return timeoutId;
};

const cancelManagedBoardTimeout = (timeoutId: number | null) => {
  if (timeoutId === null) {
    return;
  }
  if (boardTimeoutIds.has(timeoutId)) {
    boardTimeoutIds.delete(timeoutId);
    decrementLifecycleCounter("boardTimeouts");
  }
  clearTimeout(timeoutId);
};

const clearTrackedBoardTimeouts = () => {
  boardTimeoutIds.forEach((timeoutId) => {
    clearTimeout(timeoutId);
    decrementLifecycleCounter("boardTimeouts");
  });
  boardTimeoutIds.clear();
};

const setManagedBoardRaf = (callback: FrameRequestCallback): number => {
  let rafId = 0;
  rafId = window.requestAnimationFrame((timestamp) => {
    if (boardRafIds.has(rafId)) {
      boardRafIds.delete(rafId);
      decrementLifecycleCounter("boardRaf");
    }
    callback(timestamp);
  });
  boardRafIds.add(rafId);
  incrementLifecycleCounter("boardRaf");
  return rafId;
};

const cancelManagedBoardRaf = (rafId: number | null) => {
  if (rafId === null) {
    return;
  }
  if (boardRafIds.has(rafId)) {
    boardRafIds.delete(rafId);
    decrementLifecycleCounter("boardRaf");
  }
  cancelAnimationFrame(rafId);
};

const clearTrackedBoardRafs = () => {
  boardRafIds.forEach((rafId) => {
    cancelAnimationFrame(rafId);
    decrementLifecycleCounter("boardRaf");
  });
  boardRafIds.clear();
};

const trackWavesInterval = (intervalId: number) => {
  wavesIntervalIds.add(intervalId);
  incrementLifecycleCounter("boardIntervals");
};

const clearSmoothWaveAnimations = () => {
  cancelManagedBoardRaf(smoothWaveTickerRafId);
  cancelManagedBoardTimeout(smoothWaveTickerTimeoutId);
  smoothWaveTickerRafId = null;
  smoothWaveTickerTimeoutId = null;
  smoothWaveAnimations.clear();
};

const isSmoothWaveAnimationVisible = (animation: SmoothWaveAnimationData) => animation.container.getAttribute("display") !== "none";

const runSmoothWaveTicker = (timestamp: number) => {
  smoothWaveTickerRafId = null;
  if (smoothWaveAnimations.size === 0) {
    return;
  }
  for (const animation of smoothWaveAnimations) {
    if (!animation.container.isConnected) {
      smoothWaveAnimations.delete(animation);
      continue;
    }
    if (!isSmoothWaveAnimationVisible(animation)) {
      continue;
    }
    for (const wave of animation.waves) {
      updateFlowingWavePathData(wave, timestamp * wave.speed + wave.phaseOffset);
    }
  }
  if (smoothWaveAnimations.size === 0) {
    return;
  }
  smoothWaveTickerTimeoutId = setManagedBoardTimeout(() => {
    smoothWaveTickerTimeoutId = null;
    smoothWaveTickerRafId = setManagedBoardRaf(runSmoothWaveTicker);
  }, smoothWaveFrameIntervalMs);
};

const scheduleSmoothWaveTickerNow = () => {
  if (smoothWaveAnimations.size === 0 || smoothWaveTickerRafId !== null || smoothWaveTickerTimeoutId !== null) {
    return;
  }
  smoothWaveTickerRafId = setManagedBoardRaf(runSmoothWaveTicker);
};

const ensureSmoothWaveTicker = () => {
  scheduleSmoothWaveTickerNow();
};

const clearWavesIntervals = () => {
  wavesIntervalIds.forEach((intervalId) => {
    clearInterval(intervalId);
    decrementLifecycleCounter("boardIntervals");
  });
  wavesIntervalIds.clear();
  clearSmoothWaveAnimations();
};

const refreshWaves = () => {
  clearWavesIntervals();
  if (!board) {
    return;
  }
  const waveElements = board.querySelectorAll('[data-board-wave="true"]');
  waveElements.forEach((element) => {
    element.remove();
  });
  for (const location of waveCornerLocations) {
    addWaves(location);
  }
};

const trackSparkleInterval = (intervalId: number) => {
  sparkleIntervalIds.add(intervalId);
  incrementLifecycleCounter("boardIntervals");
};

const clearTrackedSparkleInterval = (intervalId: number) => {
  if (!sparkleIntervalIds.has(intervalId)) {
    return;
  }
  sparkleIntervalIds.delete(intervalId);
  clearInterval(intervalId);
  decrementLifecycleCounter("boardIntervals");
};

const clearSparkleIntervals = () => {
  sparkleIntervalIds.forEach((intervalId) => {
    clearInterval(intervalId);
    decrementLifecycleCounter("boardIntervals");
  });
  sparkleIntervalIds.clear();
};

export function fastForwardInstructionsIfNeeded() {
  if (!currentTextAnimation.isAnimating || !currentTextAnimation.fastForwardCallback) {
    return false;
  }

  currentTextAnimation.fastForwardCallback();
  return true;
}

function generateCloudPath(x: number, y: number, w: number, h: number): string {
  const padX = -2;
  const padY = -2;
  const l = x - padX;
  const r = x + w + padX;
  const t = y - padY;
  const b = y + h + padY;

  const totalW = r - l;
  const totalH = b - t;
  const cr = Math.min(totalH * 0.28, totalW * 0.03);
  const bumpH = totalH * 0.12;
  const bumpW = totalH * 0.10;

  const topN = 5;
  const topLen = totalW - 2 * cr;
  const topSeg = topLen / topN;
  const sideN = 1;
  const sideLen = totalH - 2 * cr;
  const sideSeg = sideLen / sideN;

  const topAmps = [0.9, 1.2, 0.8, 1.15, 0.95];
  const bottomAmps = [1.0, 0.85, 1.1, 0.9, 1.05];

  let d = `M ${l + cr} ${t}`;

  for (let i = 0; i < topN; i++) {
    const sx = l + cr + i * topSeg;
    const ex = sx + topSeg;
    const mx = (sx + ex) / 2;
    d += ` Q ${mx} ${t - bumpH * topAmps[i]} ${ex} ${t}`;
  }

  d += ` Q ${r} ${t} ${r} ${t + cr}`;

  for (let i = 0; i < sideN; i++) {
    const sy = t + cr + i * sideSeg;
    const ey = sy + sideSeg;
    const my = (sy + ey) / 2;
    d += ` Q ${r + bumpW} ${my} ${r} ${ey}`;
  }

  d += ` Q ${r} ${b} ${r - cr} ${b}`;

  for (let i = 0; i < topN; i++) {
    const sx = r - cr - i * topSeg;
    const ex = sx - topSeg;
    const mx = (sx + ex) / 2;
    d += ` Q ${mx} ${b + bumpH * bottomAmps[i]} ${ex} ${b}`;
  }

  d += ` Q ${l} ${b} ${l} ${b - cr}`;

  for (let i = 0; i < sideN; i++) {
    const sy = b - cr - i * sideSeg;
    const ey = sy - sideSeg;
    const my = (sy + ey) / 2;
    d += ` Q ${l - bumpW} ${my} ${l} ${ey}`;
  }

  d += ` Q ${l} ${t} ${l + cr} ${t}`;
  d += ` Z`;
  return d;
}

export function showInstructionsText(text: string) {
  showTalkingDude(true);

  if (!talkingDudeTextDiv) {
    const containerGroup = document.createElementNS(SVG.ns, "g");

    const foreignObject = document.createElementNS(SVG.ns, "foreignObject");
    instructionsContainerElement = foreignObject;
    foreignObject.setAttribute("overflow", "visible");

    const textDiv = document.createElement("div");
    textDiv.style.width = "100%";
    textDiv.style.height = "100%";
    textDiv.style.display = "flex";
    textDiv.style.alignItems = "left";
    textDiv.style.justifyContent = "left";
    textDiv.style.padding = "0.4em 0.8em";
    textDiv.style.boxSizing = "border-box";
    textDiv.style.color = "var(--instruction-text-color)";
    textDiv.style.fontFamily = "system-ui, -apple-system, sans-serif";
    textDiv.style.fontSize = "1.55em";
    textDiv.style.fontWeight = "500";
    textDiv.style.textAlign = "left";
    textDiv.style.lineHeight = "1.2";
    textDiv.style.overflow = "visible";
    textDiv.style.pointerEvents = "none";
    textDiv.style.touchAction = "none";

    const cloudPath = document.createElementNS(SVG.ns, "path") as SVGPathElement;
    cloudPath.setAttribute("fill", "var(--instruction-bubble-bg)");
    cloudPath.setAttribute("stroke", "var(--instruction-bubble-stroke)");
    cloudPath.setAttribute("stroke-width", "1.5");
    cloudPath.style.filter = "drop-shadow(0px 2px 10px var(--instruction-bubble-shadow))";
    cloudPath.style.pointerEvents = "none";
    containerGroup.appendChild(cloudPath);
    instructionsCloudBg = cloudPath;

    foreignObject.appendChild(textDiv);
    containerGroup.appendChild(foreignObject);

    controlsLayer?.appendChild(containerGroup);
    talkingDudeTextDiv = textDiv;
    updateLayout();
  }

  startTextAnimation(text);

  if (opponentAvatar && opponentAvatarPlaceholder && opponentScoreText && opponentNameText) {
    SVG.setHidden(opponentAvatar, true);
    SVG.setHidden(opponentAvatarPlaceholder, true);
    SVG.setHidden(opponentScoreText, true);
    SVG.setHidden(opponentNameText, true);
  }
  setInviteBotButtonVisible(false);
}

function startTextAnimation(text: string) {
  if (!talkingDudeTextDiv) return;

  if (currentTextAnimation.timer) {
    clearTimeout(currentTextAnimation.timer);
    decrementLifecycleCounter("boardTimeouts");
    currentTextAnimation.timer = null;
  }

  const chars = Array.from(text);
  let currentIndex = 0;
  let isFastForwarding = false;
  talkingDudeTextDiv.textContent = "";
  currentTextAnimation.isAnimating = true;
  currentTextAnimation.fastForwardCallback = () => {
    if (currentTextAnimation.timer) {
      clearTimeout(currentTextAnimation.timer);
      decrementLifecycleCounter("boardTimeouts");
      currentTextAnimation.timer = null;
    }
    isFastForwarding = true;
    if (talkingDudeTextDiv) {
      talkingDudeTextDiv.textContent = text;
    }
    currentTextAnimation.isAnimating = false;
    currentTextAnimation.fastForwardCallback = null;
    toggleFromTalkingToIdle();
  };

  const animateStep = () => {
    if (isFastForwarding) return;
    const visibleText = chars.slice(0, currentIndex).join("");
    if (talkingDudeTextDiv) {
      talkingDudeTextDiv.textContent = visibleText;
    }

    if (currentIndex < chars.length) {
      const currentChar = chars[currentIndex];
      const delay = currentChar === " " ? 55 : 23;
      currentIndex += 1;

      currentTextAnimation.timer = setTimeout(() => {
        currentTextAnimation.timer = null;
        decrementLifecycleCounter("boardTimeouts");
        animateStep();
      }, delay);
      incrementLifecycleCounter("boardTimeouts");
    } else {
      currentTextAnimation.isAnimating = false;
      currentTextAnimation.fastForwardCallback = null;
      currentTextAnimation.timer = null;
      toggleFromTalkingToIdle();
    }
  };

  animateStep();
}

async function toggleFromTalkingToIdle() {
  talkingDudeIsTalking = false;
}

async function showTalkingDude(show: boolean) {
  if (show && talkingDude) {
    talkingDudeIsTalking = true;
    return;
  } else if (!show && talkingDude) {
    removeItemAndCleanUpAnimation(talkingDude);
    talkingDude = null;
    talkingDudeIsTalking = true;
    return;
  } else if (show) {
    const sprite = instructor;
    const img = loadImage(sprite, "talkingDude", true);

    controlsLayer?.appendChild(img);
    talkingDude = img;
    updateLayout();
    startAnimation(img, false);
  }
}

export function flashPuzzleSuccess() {
  launchConfetti();
}

export function flashPuzzleFailure() {
  setBoardDimmed(true, "#94165135");
  setManagedBoardTimeout(() => {
    setBoardDimmed(false);
  }, 333);
}

function setBoardDimmed(dimmed: boolean, color: string = "#00000023") {
  if (dimmingOverlay && !dimmed) {
    dimmingOverlay.remove();
    dimmingOverlay = undefined;
    return;
  } else if (dimmed && dimmingOverlay) {
    dimmingOverlay.remove();
  }

  const overlay = document.createElementNS(SVG.ns, "g");
  dimmingOverlay = overlay;

  const background = createFullBoardBackgroundElement();
  SVG.setFill(background, color);
  overlay.appendChild(background);

  itemsLayer?.appendChild(overlay);

  if (showsItemSelectionOrConfirmationOverlay) {
    hideItemSelectionOrConfirmationOverlay();
    cleanupCurrentInputs();
  }
}

function createFullBoardBackgroundElement(): SVGElement {
  const background = document.createElementNS(SVG.ns, "rect");
  if (isPangchiuBoard()) {
    SVG.setOrigin(background, -0.83, -0.84);
    background.style.transform = `scale(${1 / 0.85892388})`;
    SVG.setSizeStr(background, "100%", "1163.5");
  } else {
    SVG.setOrigin(background, 0, 0);
    SVG.setSizeStr(background, "100%", "1100");
  }
  SVG.setFill(background, "transparent");
  return background;
}

export async function didUpdateIdCardMons() {
  if (!isWatchOnly && isExperimentingWithSprites) {
    didToggleItemsStyleSet(true);
  }
}

async function initializeAssets(onStart: boolean, isProfileMonsChange: boolean) {
  assets = (await import(`../assets/gameAssets${currentAssetsSet}`)).gameAssets;

  if (isExperimentingWithSprites) {
    const monsSprites = await import(`../assets/monsSprites`);
    const getRandomSpriteOfType = monsSprites.getRandomSpriteOfType;
    const getSpriteByKey = monsSprites.getSpriteByKey;

    // TODO: set correct mons for both sides

    if (storage.getProfileId("") && getCurrentRouteState().mode !== "watch") {
      const [demonIndex, angelIndex, drainerIndex, spiritIndex, mysticIndex] = getMonsIndexes(false, null);
      drainer = loadImage(getSpriteByKey(getMonId(MonType.DRAINER, drainerIndex)), "drainer", true);
      angel = loadImage(getSpriteByKey(getMonId(MonType.ANGEL, angelIndex)), "angel", true);
      demon = loadImage(getSpriteByKey(getMonId(MonType.DEMON, demonIndex)), "demon", true);
      spirit = loadImage(getSpriteByKey(getMonId(MonType.SPIRIT, spiritIndex)), "spirit", true);
      mystic = loadImage(getSpriteByKey(getMonId(MonType.MYSTIC, mysticIndex)), "mystic", true);
    } else {
      drainer = loadImage(getRandomSpriteOfType("drainer"), "drainer", true);
      angel = loadImage(getRandomSpriteOfType("angel"), "angel", true);
      demon = loadImage(getRandomSpriteOfType("demon"), "demon", true);
      spirit = loadImage(getRandomSpriteOfType("spirit"), "spirit", true);
      mystic = loadImage(getRandomSpriteOfType("mystic"), "mystic", true);
    }

    if (!isProfileMonsChange) {
      drainerB = loadImage(getRandomSpriteOfType("drainer"), "drainerB", true);
      angelB = loadImage(getRandomSpriteOfType("angel"), "angelB", true);
      demonB = loadImage(getRandomSpriteOfType("demon"), "demonB", true);
      spiritB = loadImage(getRandomSpriteOfType("spirit"), "spiritB", true);
      mysticB = loadImage(getRandomSpriteOfType("mystic"), "mysticB", true);
    }
  } else {
    drainer = loadImage(assets.drainer, "drainer");
    angel = loadImage(assets.angel, "angel");
    demon = loadImage(assets.demon, "demon");
    spirit = loadImage(assets.spirit, "spirit");
    mystic = loadImage(assets.mystic, "mystic");

    drainerB = loadImage(assets.drainerB, "drainerB");
    angelB = loadImage(assets.angelB, "angelB");
    demonB = loadImage(assets.demonB, "demonB");
    spiritB = loadImage(assets.spiritB, "spiritB");
    mysticB = loadImage(assets.mysticB, "mysticB");
  }

  mana = loadImage(assets.mana, "mana");
  manaB = loadImage(assets.manaB, "manaB");
  bombOrPotion = loadImage(assets.bombOrPotion, "bombOrPotion");
  bomb = loadImage(assets.bomb, "bomb");
  supermana = loadImage(assets.supermana, "supermana");
  supermanaSimple = loadImage(assets.supermanaSimple, "supermanaSimple");

  if (onStart) {
    Object.values(AssetsSet)
      .filter((set) => set !== currentAssetsSet)
      .forEach((set) => {
        import(`../assets/gameAssets${set}`).catch(() => {});
      });
    if (!isExperimentingWithSprites) {
      import(`../assets/monsSprites`).catch(() => {});
    }
  }
}

await initializeAssets(true, false);

export async function didToggleItemsStyleSet(isProfileMonsChange: boolean = false) {
  await initializeAssets(false, isProfileMonsChange);

  removeHighlights();
  cleanAllPixels();
  refreshWaves();
  hideItemSelectionOrConfirmationOverlay();
  rotatedItemImageCache.clear();

  if (!monsBoardDisplayAnimationTimeout) {
    showItemsAfterChangingAssetsStyle();
  }

  const allGridBoardOnlyElements = [...(board?.querySelectorAll('[data-grid-board-only="true"]') ?? [])];
  allGridBoardOnlyElements.forEach((element) => {
    SVG.setHidden(element as SVGElement, isCustomPictureBoardEnabled());
  });
}

function loadImage(data: string, assetType: string, isSpriteSheet: boolean = false): SVGElement {
  if (assetType !== "nonGame" && assetType !== "statusMoveEmoji") {
    return loadBoardAssetImage(data, assetType, isSpriteSheet);
  }
  const image = document.createElementNS(SVG.ns, "image");
  SVG.setImage(image, data);
  SVG.setSize(image, 1, 1);
  image.setAttribute("class", "item");
  image.setAttribute("data-asset-type", assetType);
  return image;
}

function loadBoardAssetImage(data: string, assetType: string, isSpriteSheet: boolean = false): SVGElement {
  const isTalkingDude = assetType === "talkingDude";
  const foreignObject = document.createElementNS(SVG.ns, "foreignObject");
  SVG.setSize(foreignObject, 1, 1);
  foreignObject.setAttribute("class", "item");
  foreignObject.setAttribute("data-asset-type", assetType);

  const div = document.createElement("div");
  div.style.width = "100%";
  div.style.height = "100%";
  div.style.backgroundImage = `url(data:image/webp;base64,${data})`;
  div.style.backgroundSize = "100%";
  div.style.backgroundRepeat = "no-repeat";

  if (currentAssetsSet === AssetsSet.Pixel || isSpriteSheet || isTalkingDude) {
    div.style.imageRendering = "pixelated";
  }

  foreignObject.appendChild(div);

  if (isSpriteSheet) {
    foreignObject.setAttribute("data-is-sprite-sheet", "true");
    foreignObject.setAttribute("data-total-frames", isTalkingDude ? "5" : "4");
    foreignObject.setAttribute("data-frame-duration", "169");
    foreignObject.setAttribute("data-frame-width", isTalkingDude ? "1.4" : "1");
    foreignObject.setAttribute("data-frame-height", isTalkingDude ? "2.8" : "1");
    const totalFrames = parseInt(foreignObject.getAttribute("data-total-frames") || "1", 10);
    const frameWidth = parseFloat(foreignObject.getAttribute("data-frame-width") || "1");
    const frameHeight = parseFloat(foreignObject.getAttribute("data-frame-height") || "1");
    SVG.setSize(foreignObject, frameWidth * totalFrames, frameHeight);
  }

  return foreignObject;
}

function setSpriteSheetClipRect(rect: SVGElement, image: SVGElement, frameWidth: number, frameHeight: number, isTalkingDude: boolean) {
  const baseX = parseFloat(image.getAttribute("data-base-x") || image.getAttribute("x") || "0");
  const baseY = parseFloat(image.getAttribute("data-base-y") || image.getAttribute("y") || "0");
  rect.setAttribute("x", baseX.toString());
  rect.setAttribute("y", baseY.toString());
  rect.setAttribute("width", (frameWidth * 100).toString());
  rect.setAttribute("height", (frameHeight * (isTalkingDude ? 50 : 100)).toString());
}

function updateSpriteSheetClipRect(image: SVGElement) {
  const clipPathId = image.getAttribute("data-clip-path-id");
  if (!clipPathId) return;
  const svgRoot = image.ownerSVGElement;
  if (!svgRoot) return;
  const clipPath = svgRoot.querySelector(`#${clipPathId}`) as SVGElement | null;
  const rect = clipPath?.querySelector("rect") as SVGElement | null;
  if (!rect) return;
  const frameWidth = parseFloat(image.getAttribute("data-frame-width") || "1");
  const frameHeight = parseFloat(image.getAttribute("data-frame-height") || "1");
  const totalFrames = parseInt(image.getAttribute("data-total-frames") || "1", 10);
  const isTalkingDude = totalFrames === 5;
  setSpriteSheetClipRect(rect, image, frameWidth, frameHeight, isTalkingDude);
}

function startAnimation(image: SVGElement, keepStatic: boolean = false, isFainted: boolean = false): void {
  if (image.getAttribute("data-is-sprite-sheet") === "true") {
    const totalFrames = parseInt(image.getAttribute("data-total-frames") || "1", 10);
    const frameDuration = parseInt(image.getAttribute("data-frame-duration") || "169", 10);
    const frameWidth = parseFloat(image.getAttribute("data-frame-width") || "1");
    const frameHeight = parseFloat(image.getAttribute("data-frame-height") || "1");

    if (isFainted) {
      SVG.setSize(image, frameWidth, frameHeight * totalFrames);
    }

    const isTalkingDude = totalFrames === 5;

    const initialX = parseFloat(image.getAttribute("data-base-x") || image.getAttribute("x") || "0");
    const initialY = parseFloat(image.getAttribute("data-base-y") || image.getAttribute("y") || "0");
    const clipPathId = `clip-path-${Math.random().toString(36).slice(2, 11)}`;
    const clipPath = document.createElementNS(SVG.ns, "clipPath");
    clipPath.setAttribute("id", clipPathId);

    const rect = document.createElementNS(SVG.ns, "rect");
    setSpriteSheetClipRect(rect, image, frameWidth, frameHeight, isTalkingDude);
    clipPath.appendChild(rect);

    const svgRoot = image.ownerSVGElement;
    if (svgRoot) {
      let defs = svgRoot.querySelector("defs");
      if (!defs) {
        defs = document.createElementNS(SVG.ns, "defs");
        svgRoot.insertBefore(defs, svgRoot.firstChild);
      }
      defs.appendChild(clipPath);
    } else {
      console.error("SVG root element not found.");
      return;
    }

    image.setAttribute("clip-path", `url(#${clipPathId})`);
    image.setAttribute("data-clip-path-id", clipPathId);

    if (!keepStatic) {
      let currentFrame = 0;
      let lastUpdateTime = Date.now();
      (image as any).__isAnimating = true;

      function animate(_timestamp: number) {
        if (!(image as any).__isAnimating || !image.isConnected) {
          return;
        }

        const now = Date.now();
        if (now - lastUpdateTime >= frameDuration) {
          const baseX = parseFloat(image.getAttribute("data-base-x") || initialX.toString());
          const baseY = parseFloat(image.getAttribute("data-base-y") || initialY.toString());
          const x = baseX - currentFrame * frameWidth * 100;
          const y = isTalkingDude && talkingDudeIsTalking ? baseY - 140 : baseY;
          image.setAttribute("x", x.toString());
          image.setAttribute("y", y.toString());

          currentFrame = (currentFrame + 1) % totalFrames;
          lastUpdateTime = now;
        }
        setManagedBoardRaf(animate);
      }

      setManagedBoardRaf(animate);
    }
  }
}

function removeItemAndCleanUpAnimation(item: SVGElement): void {
  let spriteSheetItem: SVGElement | null = null;
  if (item.getAttribute("data-is-sprite-sheet") === "true") {
    spriteSheetItem = item;
  } else if (item.tagName === "g") {
    const spriteChild = Array.from(item.children).find((child) => child.getAttribute("data-is-sprite-sheet") === "true");
    if (spriteChild) {
      spriteSheetItem = spriteChild as SVGElement;
    }
  }

  if (spriteSheetItem) {
    (spriteSheetItem as any).__isAnimating = false;

    const clipPathId = spriteSheetItem.getAttribute("data-clip-path-id");
    if (clipPathId) {
      const svgRoot = spriteSheetItem.ownerSVGElement;
      if (svgRoot) {
        const clipPath = svgRoot.querySelector(`#${clipPathId}`);
        if (clipPath && clipPath.parentNode) {
          clipPath.parentNode.removeChild(clipPath);
        }
      }
    }
  }

  if (item.parentNode) {
    item.parentNode.removeChild(item);
  }
}

function initializeBoardElements() {
  board = document.getElementById("monsboard");
  highlightsLayer = document.getElementById("highlightsLayer");
  itemsLayer = document.getElementById("itemsLayer");
  effectsLayer = document.getElementById("effectsLayer");
  controlsLayer = document.getElementById("controlsLayer");
  boardBackgroundLayer = document.getElementById("boardBackgroundLayer");
}

export function hideBoardPlayersInfo() {
  clearVoiceReactionState();
  if (opponentAvatar && playerAvatar) {
    SVG.setHidden(opponentAvatar, true);
    SVG.setHidden(playerAvatar, true);
    try {
      const opponentUrl = emojis.getEmojiUrl(opponentSideMetadata.emojiId) || "";
      const playerUrl = emojis.getEmojiUrl(playerSideMetadata.emojiId) || "";
      if (opponentUrl) showRaibowAura(false, opponentUrl, true);
      if (playerUrl) showRaibowAura(false, playerUrl, false);
    } catch {}
  }

  if (playerAvatarPlaceholder && opponentAvatarPlaceholder) {
    SVG.setHidden(playerAvatarPlaceholder, true);
    SVG.setHidden(opponentAvatarPlaceholder, true);
  }

  if (playerScoreText && opponentScoreText) {
    playerScoreText.textContent = "";
    opponentScoreText.textContent = "";
  }
  playerEndOfGameMarker = "none";
  opponentEndOfGameMarker = "none";
  if (playerEndOfGameIcon) {
    SVG.setHidden(playerEndOfGameIcon, true);
  }
  if (opponentEndOfGameIcon) {
    SVG.setHidden(opponentEndOfGameIcon, true);
  }

  if (playerNameText && opponentNameText) {
    playerNameText.textContent = "";
    opponentNameText.textContent = "";
  }
  setInviteBotButtonVisible(false);
}

function syncAvatarForCurrentMetadata(opponent: boolean, revealIfPossible: boolean = false) {
  const avatar = opponent ? opponentAvatar : playerAvatar;
  const placeholder = opponent ? opponentAvatarPlaceholder : playerAvatarPlaceholder;
  const metadata = opponent ? opponentSideMetadata : playerSideMetadata;
  if (!avatar) {
    return;
  }
  const getAvatarHref = (target: SVGElement) => {
    const hrefByNamespace = target.getAttributeNS("http://www.w3.org/1999/xlink", "href");
    if (hrefByNamespace !== null) {
      return hrefByNamespace;
    }
    return target.getAttribute("href") ?? "";
  };
  const setAvatarUrlIfNeeded = (target: SVGElement, url: string) => {
    if (getAvatarHref(target) === url) {
      return false;
    }
    SVG.setImageUrl(target, url);
    return true;
  };
  const setAvatarBotIfNeeded = (target: SVGElement) => {
    const nextHref = `data:image/webp;base64,${emojis.pc}`;
    if (getAvatarHref(target) === nextHref) {
      return false;
    }
    SVG.setImage(target, emojis.pc);
    return true;
  };
  const setHiddenIfNeeded = (target: SVGElement | undefined, hidden: boolean) => {
    if (!target) {
      return false;
    }
    const isHidden = target.getAttribute("display") === "none";
    if (isHidden === hidden) {
      return false;
    }
    SVG.setHidden(target, hidden);
    return true;
  };
  const setAuraVisibilityIfNeeded = (target: SVGElement, auraVisible: boolean) => {
    const nextValue = auraVisible ? "1" : "0";
    const currentValue = target.getAttribute("data-aura-visible") ?? "";
    if (currentValue === nextValue) {
      return false;
    }
    target.setAttribute("data-aura-visible", nextValue);
    return true;
  };
  const avatarIsHidden = avatar.getAttribute("display") === "none";
  const placeholderIsHidden = placeholder ? placeholder.getAttribute("display") === "none" : true;
  const keepHiddenState = !revealIfPossible && avatarIsHidden && placeholderIsHidden;
  if (opponent && isGameWithBot) {
    const didSetBotImage = setAvatarBotIfNeeded(avatar);
    let didChangeVisibility = false;
    if (!keepHiddenState) {
      didChangeVisibility = setHiddenIfNeeded(avatar, false);
      if (placeholder) {
        didChangeVisibility = setHiddenIfNeeded(placeholder, true) || didChangeVisibility;
      }
    }
    const didUpdateAuraVisibility = setAuraVisibilityIfNeeded(avatar, false);
    if (didSetBotImage || didChangeVisibility || didUpdateAuraVisibility) {
      showRaibowAura(false, emojis.pc, true);
      try {
        updateAuraForAvatarElement(true, avatar);
      } catch {}
    }
    return;
  }

  let emojiId = metadata.emojiId ?? "";
  let aura = opponent ? metadata.aura ?? "" : metadata.aura ?? storage.getPlayerEmojiAura("");
  if (!opponent && !isWatchOnly && emojiId === "") {
    const storedEmojiId = storage.getPlayerEmojiId("");
    if (storedEmojiId !== "") {
      emojiId = storedEmojiId;
      metadata.emojiId = storedEmojiId;
    }
    if (aura === "") {
      aura = storage.getPlayerEmojiAura("");
      metadata.aura = aura;
    }
  }
  if (opponent && !isOnlineGame && !isGameWithBot && emojiId === "") {
    if (!localHumanSeriesOpponentEmojiId) {
      const [fallbackEmojiId] = emojis.getRandomEmojiUrlOtherThan(playerSideMetadata.emojiId, true);
      localHumanSeriesOpponentEmojiId = fallbackEmojiId;
    }
    emojiId = localHumanSeriesOpponentEmojiId;
    metadata.emojiId = localHumanSeriesOpponentEmojiId;
  }
  if (opponent && !isOnlineGame && !isGameWithBot && emojiId !== "") {
    localHumanSeriesOpponentEmojiId = emojiId;
  }

  const emojiUrl = emojiId !== "" ? emojis.getEmojiUrl(emojiId) || "" : "";
  if (emojiUrl !== "") {
    const didSetEmojiImage = setAvatarUrlIfNeeded(avatar, emojiUrl);
    let didChangeVisibility = false;
    if (!keepHiddenState) {
      didChangeVisibility = setHiddenIfNeeded(avatar, false);
      if (placeholder) {
        didChangeVisibility = setHiddenIfNeeded(placeholder, true) || didChangeVisibility;
      }
    }
    const didUpdateAuraVisibility = setAuraVisibilityIfNeeded(avatar, aura === "rainbow");
    if (didSetEmojiImage || didChangeVisibility || didUpdateAuraVisibility) {
      showRaibowAura(aura === "rainbow", emojiUrl, opponent);
      try {
        updateAuraForAvatarElement(opponent, avatar);
      } catch {}
    }
    return;
  }

  const didClearAvatarImage = setAvatarUrlIfNeeded(avatar, "");
  let didChangeVisibility = false;
  if (!keepHiddenState) {
    didChangeVisibility = setHiddenIfNeeded(avatar, true);
    if (placeholder) {
      didChangeVisibility = setHiddenIfNeeded(placeholder, false) || didChangeVisibility;
    }
  }
  const didUpdateAuraVisibility = setAuraVisibilityIfNeeded(avatar, false);
  if (didClearAvatarImage || didChangeVisibility || didUpdateAuraVisibility) {
    showRaibowAura(false, "", opponent);
    try {
      updateAuraForAvatarElement(opponent, avatar);
    } catch {}
  }
}

export function showBoardPlayersInfo() {
  syncAvatarForCurrentMetadata(false, true);
  syncAvatarForCurrentMetadata(true, true);
  renderPlayersNamesLabels();
}

export function resetLocalHumanSeriesOpponentAvatar() {
  localHumanSeriesOpponentEmojiId = null;
}

export function resetPlayersMetadataForSession() {
  clearVoiceReactionState();
  const nextPlayerMetadata = newEmptyPlayerMetadata();
  nextPlayerMetadata.emojiId = storage.getPlayerEmojiId("");
  nextPlayerMetadata.aura = storage.getPlayerEmojiAura("");
  playerSideMetadata = nextPlayerMetadata;
  opponentSideMetadata = newEmptyPlayerMetadata();
  updateWagerPlayerUids("", "");
  syncAvatarForCurrentMetadata(false);
  syncAvatarForCurrentMetadata(true);
  renderPlayersNamesLabels();
}

export function resetForNewGame() {
  playerEndOfGameMarker = "none";
  opponentEndOfGameMarker = "none";
  if (playerEndOfGameIcon) {
    SVG.setHidden(playerEndOfGameIcon, true);
  }
  if (opponentEndOfGameIcon) {
    SVG.setHidden(opponentEndOfGameIcon, true);
  }
  clearVoiceReactionState();
  if (isWatchOnly) {
    playerSideMetadata = newEmptyPlayerMetadata();
  }
  opponentSideMetadata = newEmptyPlayerMetadata();
  renderPlayersNamesLabels();
  setInviteBotButtonVisible(false);

  if (opponentAvatar && playerAvatar) {
    SVG.setHidden(opponentAvatar, false);
    SVG.setHidden(playerAvatar, false);
    try {
      const playerUrl = emojis.getEmojiUrl(playerSideMetadata.emojiId) || "";
      const opponentUrl = emojis.getEmojiUrl(opponentSideMetadata.emojiId) || "";
      const playerAuraVisible = (playerSideMetadata.aura ?? storage.getPlayerEmojiAura("")) === "rainbow";
      const opponentAuraVisible = (opponentSideMetadata.aura ?? "") === "rainbow";
      if (playerUrl) showRaibowAura(playerAuraVisible, playerUrl, false);
      if (opponentUrl) showRaibowAura(opponentAuraVisible, opponentUrl, true);
      updateAuraForAvatarElement(false, playerAvatar);
      updateAuraForAvatarElement(true, opponentAvatar);
    } catch {}
  }

  if (playerAvatarPlaceholder && opponentAvatarPlaceholder) {
    if (!doNotShowPlayerAvatarPlaceholderAgain) {
      SVG.setHidden(playerAvatarPlaceholder, false);
    }

    if (!doNotShowOpponentAvatarPlaceholderAgain) {
      SVG.setHidden(opponentAvatarPlaceholder, false);
    }
  }

  removeHighlights();
  cleanAllPixels();
  clearWagerPilesForNewMatch();
}

export function updateEmojiAndAuraIfNeeded(newEmojiId: string, aura: string | undefined, isOpponentSide: boolean) {
  const targetMetadata = isOpponentSide ? opponentSideMetadata : playerSideMetadata;
  const currentId = targetMetadata.emojiId ?? "";
  const nextId = newEmojiId ?? "";
  const newAura = isOpponentSide ? aura ?? "" : aura ?? storage.getPlayerEmojiAura("");
  const currentAura = targetMetadata.aura ?? "";
  if (currentId === nextId && currentAura === newAura) {
    syncAvatarForCurrentMetadata(isOpponentSide);
    return;
  }
  targetMetadata.emojiId = nextId;
  targetMetadata.aura = newAura;
  syncAvatarForCurrentMetadata(isOpponentSide);
}

export function showRandomEmojisForLoopMode() {
  if (!opponentAvatar || !playerAvatar) return;
  const [, playerUrl] = emojis.getRandomEmojiUrl(true);
  const [, opponentUrl] = emojis.getRandomEmojiUrl(true);
  SVG.setImageUrl(playerAvatar, playerUrl);
  SVG.setImageUrl(opponentAvatar, opponentUrl);
  showRaibowAura((playerSideMetadata.aura ?? "") === "rainbow", playerUrl, false);
  showRaibowAura((opponentSideMetadata.aura ?? "") === "rainbow", opponentUrl, true);
}

export function showOpponentAsBotPlayer() {
  syncAvatarForCurrentMetadata(true, true);
}

export function getPlayersEmojiId(): number {
  return parseInt(playerSideMetadata.emojiId !== "" ? playerSideMetadata.emojiId : "1");
}

export function toggleBoardFlipped() {
  isFlipped = !isFlipped;
}

export function setBoardFlipped(flipped: boolean) {
  isFlipped = flipped;
}

function setupInviteBotButton() {
  if (!controlsLayer) {
    return;
  }
  if (cleanupInviteBotButtonThemeListener) {
    cleanupInviteBotButtonThemeListener();
    cleanupInviteBotButtonThemeListener = null;
  }
  const container = document.createElementNS(SVG.ns, "foreignObject");
  container.setAttribute("overflow", "visible");
  container.style.pointerEvents = "auto";
  const button = document.createElementNS("http://www.w3.org/1999/xhtml", "button") as HTMLButtonElement;
  button.type = "button";
  button.style.width = "fit-content";
  button.style.height = "100%";
  button.style.display = "flex";
  button.style.alignItems = "center";
  button.style.justifyContent = "center";
  button.style.margin = "0";
  button.style.padding = "0 16px";
  button.style.boxSizing = "border-box";
  button.style.border = "none";
  button.style.cursor = "pointer";
  button.style.userSelect = "none";
  button.style.touchAction = "manipulation";
  button.style.whiteSpace = "nowrap";
  button.style.fontWeight = "600";
  button.style.lineHeight = "1";
  button.style.outline = "none";
  applyInviteBotButtonColors(button, "default");

  const label = document.createElementNS("http://www.w3.org/1999/xhtml", "span");
  label.textContent = "Invite a Bot";

  button.appendChild(label);

  let pressed = false;
  let hovered = false;
  const refreshColors = () => {
    if (pressed) {
      applyInviteBotButtonColors(button, "active");
    } else if (hovered) {
      applyInviteBotButtonColors(button, "hover");
    } else {
      applyInviteBotButtonColors(button, "default");
    }
  };
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const handleThemeChange = () => {
    refreshColors();
  };
  if (typeof mediaQuery.addEventListener === "function") {
    mediaQuery.addEventListener("change", handleThemeChange);
    cleanupInviteBotButtonThemeListener = () => {
      mediaQuery.removeEventListener("change", handleThemeChange);
    };
  } else if (typeof mediaQuery.addListener === "function") {
    mediaQuery.addListener(handleThemeChange);
    cleanupInviteBotButtonThemeListener = () => {
      mediaQuery.removeListener(handleThemeChange);
    };
  }

  button.addEventListener("mouseenter", () => {
    hovered = true;
    refreshColors();
  });
  button.addEventListener("mouseleave", () => {
    hovered = false;
    pressed = false;
    refreshColors();
  });
  button.addEventListener("mousedown", () => {
    pressed = true;
    refreshColors();
  });
  button.addEventListener("mouseup", () => {
    pressed = false;
    refreshColors();
  });
  button.addEventListener("touchstart", () => {
    pressed = true;
    refreshColors();
  });
  button.addEventListener("touchend", () => {
    pressed = false;
    refreshColors();
  });
  button.addEventListener("touchcancel", () => {
    pressed = false;
    refreshColors();
  });

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    didClickInviteBotIntoLocalGameButton();
  });

  container.appendChild(button);
  controlsLayer.appendChild(container);
  inviteBotButtonContainer = container;
  inviteBotButtonElement = button;
  setInviteBotButtonVisible(false);
}

export function setInviteBotButtonVisible(visible: boolean) {
  if (inviteBotButtonContainer) {
    SVG.setHidden(inviteBotButtonContainer, !visible);
  }
  if (inviteBotButtonElement) {
    inviteBotButtonElement.disabled = !visible;
    inviteBotButtonElement.style.pointerEvents = visible ? "auto" : "none";
  }
}

export function runMonsBoardAsDisplayWaitingHeartsAnimation() {
  if (monsBoardDisplayAnimationTimeout) return;
  const runToken = ++monsBoardDisplayAnimationRunToken;
  incrementLifecycleCounter("boardTimeouts");

  const frames: [number, number][][] = [
    // Frame 0: empty
    [],
    // Frame 1: center dot
    [[5, 5]],
    // Frame 2: tiny heart seed
    [
      [4, 4], [4, 6],
      [5, 5],
      [6, 5],
    ],
    // Frame 3: small heart
    [
      [3, 4], [3, 6],
      [4, 3], [4, 5], [4, 7],
      [5, 4], [5, 6],
      [6, 5],
    ],
    // Frame 4: medium heart
    [
      [2, 3], [2, 4], [2, 6], [2, 7],
      [3, 2], [3, 5], [3, 8],
      [4, 2], [4, 8],
      [5, 3], [5, 7],
      [6, 4], [6, 6],
      [7, 5],
    ],
    // Frame 5: large heart
    [
      [1, 2], [1, 3], [1, 7], [1, 8],
      [2, 1], [2, 4], [2, 6], [2, 9],
      [3, 1], [3, 5], [3, 9],
      [4, 1], [4, 9],
      [5, 2], [5, 8],
      [6, 3], [6, 7],
      [7, 4], [7, 6],
      [8, 5],
    ],
    // Frame 6: full heart
    [
      [0, 2], [0, 3], [0, 7], [0, 8],
      [1, 1], [1, 4], [1, 6], [1, 9],
      [2, 0], [2, 5], [2, 10],
      [3, 0], [3, 10],
      [4, 0], [4, 10],
      [5, 0], [5, 10],
      [6, 1], [6, 9],
      [7, 2], [7, 8],
      [8, 3], [8, 7],
      [9, 4], [9, 6],
      [10, 5],
    ],
  ];

  let frameIndex = 0;
  let isWhite = true;

  function animate() {
    if (runToken !== monsBoardDisplayAnimationRunToken) {
      return;
    }
    cleanAllPixels();
    for (const [x, y] of frames[frameIndex]) {
      colorPixel(new Location(x, y), isWhite);
    }
    frameIndex = (frameIndex + 1) % frames.length;
    if (frameIndex === 0) {
      isWhite = !isWhite;
    }
    monsBoardDisplayAnimationTimeout = setTimeout(() => {
      if (runToken !== monsBoardDisplayAnimationRunToken) {
        return;
      }
      animate();
    }, 323);
  }

  animate();
}

export function runMonsBoardAsDisplayWaitingAnimation() {
  if (valentinesLoaderEnabled) {
    runMonsBoardAsDisplayWaitingHeartsAnimation();
    return;
  }

  if (monsBoardDisplayAnimationTimeout) return;
  const runToken = ++monsBoardDisplayAnimationRunToken;
  incrementLifecycleCounter("boardTimeouts");

  let radius = 0;
  const maxRadius = 5;

  function animate() {
    if (runToken !== monsBoardDisplayAnimationRunToken) {
      return;
    }
    cleanAllPixels();
    drawCircle(radius);
    radius = radius >= maxRadius ? 0 : radius + 0.5;
    monsBoardDisplayAnimationTimeout = setTimeout(() => {
      if (runToken !== monsBoardDisplayAnimationRunToken) {
        return;
      }
      animate();
    }, 200);
  }

  function drawCircle(radius: number) {
    const minRadius = radius - 0.5;
    const maxRadius = radius + 0.5;
    const minRadiusSquared = minRadius * minRadius;
    const maxRadiusSquared = maxRadius * maxRadius;

    for (let x = 0; x <= 10; x++) {
      for (let y = 0; y <= 10; y++) {
        const dx = x - 5;
        const dy = y - 5;
        const distanceSquared = dx * dx + dy * dy;

        if (distanceSquared >= minRadiusSquared && distanceSquared <= maxRadiusSquared) {
          colorPixel(new Location(x, y), true);
        }
      }
    }
  }

  animate();
}

export function stopMonsBoardAsDisplayAnimations() {
  monsBoardDisplayAnimationRunToken += 1;
  if (monsBoardDisplayAnimationTimeout) {
    clearTimeout(monsBoardDisplayAnimationTimeout);
    monsBoardDisplayAnimationTimeout = null;
    decrementLifecycleCounter("boardTimeouts");
    cleanAllPixels();
  }
}

export function hasMonsBoardDisplayAnimationRunning() {
  return monsBoardDisplayAnimationTimeout !== null;
}

function colorPixel(location: Location, white: boolean) {
  const flippedLocation = new Location(isFlipped ? 10 - location.i : location.i, location.j);
  const useValentines = valentinesLoaderEnabled;
  const item = white
    ? (useValentines ? angel : mana)
    : (useValentines ? angelB : manaB);
  const kind = white
    ? (useValentines ? ItemKind.Angel : ItemKind.Mana)
    : (useValentines ? ItemKind.AngelBlack : ItemKind.ManaBlack);
  placeItem(item, flippedLocation, kind, false);
}

function cleanAllPixels() {
  for (const key in items) {
    const element = items[key];
    removeItemAndCleanUpAnimation(element);
    delete items[key];
  }

  for (const key in basesPlaceholders) {
    const element = basesPlaceholders[key];
    removeItemAndCleanUpAnimation(element);
    delete basesPlaceholders[key];
  }
}

export function didGetPlayerProfile(profile: PlayerProfile, loginId: string, own: boolean) {
  updatePlayerMetadataWithProfile(profile, loginId, own, () => {
    recalculateDisplayNames();
  });
  recalculateDisplayNames();

  try {
    const emojiId = profile.emoji?.toString();
    const aura = profile.aura;
    if (emojiId) {
      const isOpponent = loginId === opponentSideMetadata.uid;
      const isPlayer = loginId === playerSideMetadata.uid || (playerSideMetadata.uid === "" && own);
      if (isOpponent) {
        updateEmojiAndAuraIfNeeded(emojiId, aura, true);
      } else if (isPlayer) {
        updateEmojiAndAuraIfNeeded(emojiId, aura, false);
      }
    }
  } catch {}
}

function renderPlayersNamesLabels() {
  if (!playerNameText || !opponentNameText || isWaitingForRematchResponse || playerScoreText?.textContent === "") return;
  let playerNameString = "";
  let opponentNameString = "";

  if ((!isOnlineGame || opponentSideMetadata.uid === "") && !isGameWithBot) {
  } else {
    const placeholderName = "anon";

    if (!isGameWithBot) {
      playerNameString = playerSideMetadata.displayName === undefined ? placeholderName : playerSideMetadata.displayName;
      opponentNameString = opponentSideMetadata.displayName === undefined ? placeholderName : opponentSideMetadata.displayName;

      const ratingPrefix = " • ";
      if (playerSideMetadata.rating !== undefined) {
        playerNameString += ratingPrefix + `${playerSideMetadata.rating}`;
      }
      if (opponentSideMetadata.rating !== undefined) {
        opponentNameString += ratingPrefix + `${opponentSideMetadata.rating}`;
      }
    }
  }

  const currentTime = Date.now();
  const thresholdDelta = 2500;
  const prefix = " ~ ";

  if (playerSideMetadata.voiceReactionDate !== undefined && currentTime - playerSideMetadata.voiceReactionDate < thresholdDelta) {
    playerNameString += prefix + playerSideMetadata.voiceReactionText;
  }

  if (opponentSideMetadata.voiceReactionDate !== undefined && currentTime - opponentSideMetadata.voiceReactionDate < thresholdDelta) {
    opponentNameString += prefix + opponentSideMetadata.voiceReactionText;
  }

  playerNameText.textContent = playerNameString;
  opponentNameText.textContent = opponentNameString;
}

export function setupLoggedInPlayerProfile(profile: PlayerProfile, loginId: string) {
  if (!isWatchOnly) {
    setupPlayerId(loginId, false);
    didGetPlayerProfile(profile, loginId, true);
  }
}

export function recalculateDisplayNames() {
  if (playerSideMetadata.displayName === undefined) {
    const username = getStashedUsername(playerSideMetadata.uid);
    const ethAddress = getStashedPlayerEthAddress(playerSideMetadata.uid);
    const solAddress = getStashedPlayerSolAddress(playerSideMetadata.uid);
    if (ethAddress) {
      const cropped = ethAddress.slice(0, 4) + "..." + ethAddress.slice(-4);
      playerSideMetadata.displayName = cropped;
      playerSideMetadata.ethAddress = ethAddress;
    } else if (solAddress) {
      const cropped = solAddress.slice(0, 4) + "..." + solAddress.slice(-4);
      playerSideMetadata.displayName = cropped;
      playerSideMetadata.solAddress = solAddress;
    }

    if (username) {
      playerSideMetadata.username = username;
      playerSideMetadata.displayName = username;
    }
  }

  if (opponentSideMetadata.displayName === undefined) {
    const username = getStashedUsername(opponentSideMetadata.uid);
    const ethAddress = getStashedPlayerEthAddress(opponentSideMetadata.uid);
    const solAddress = getStashedPlayerSolAddress(opponentSideMetadata.uid);
    if (ethAddress) {
      const cropped = ethAddress.slice(0, 4) + "..." + ethAddress.slice(-4);
      opponentSideMetadata.displayName = cropped;
      opponentSideMetadata.ethAddress = ethAddress;
    } else if (solAddress) {
      const cropped = solAddress.slice(0, 4) + "..." + solAddress.slice(-4);
      opponentSideMetadata.displayName = cropped;
      opponentSideMetadata.solAddress = solAddress;
    }

    if (username) {
      opponentSideMetadata.username = username;
      opponentSideMetadata.displayName = username;
    }
  }

  if (playerSideMetadata.ens === undefined && playerSideMetadata.username === undefined) {
    const ens = getEnsNameForUid(playerSideMetadata.uid);
    if (ens !== undefined) {
      playerSideMetadata.ens = ens;
      playerSideMetadata.displayName = ens;
    }
  }

  if (opponentSideMetadata.ens === undefined && opponentSideMetadata.username === undefined) {
    const ens = getEnsNameForUid(opponentSideMetadata.uid);
    if (ens !== undefined) {
      opponentSideMetadata.ens = ens;
      opponentSideMetadata.displayName = ens;
    }
  }

  const playerRating = getRatingForUid(playerSideMetadata.uid);
  if (playerRating !== undefined) {
    playerSideMetadata.rating = playerRating;
  }

  const opponentRating = getRatingForUid(opponentSideMetadata.uid);
  if (opponentRating !== undefined) {
    opponentSideMetadata.rating = opponentRating;
  }

  renderPlayersNamesLabels();
}

export function showVoiceReactionText(reactionText: string, opponents: boolean) {
  const currentTime = Date.now();

  if (opponents) {
    opponentSideMetadata.voiceReactionText = reactionText;
    opponentSideMetadata.voiceReactionDate = currentTime;
  } else {
    playerSideMetadata.voiceReactionText = reactionText;
    playerSideMetadata.voiceReactionDate = currentTime;
  }

  renderPlayersNamesLabels();
  const voiceReactionTimeout = window.setTimeout(() => {
    boardTimeoutIds.delete(voiceReactionTimeout);
    decrementLifecycleCounter("boardTimeouts");
    renderPlayersNamesLabels();
  }, 3000);
  trackBoardTimeout(voiceReactionTimeout);
}

export function setupPlayerId(uid: string, opponent: boolean) {
  const metadata = opponent ? opponentSideMetadata : playerSideMetadata;
  if (metadata.uid !== uid) {
    const previousEmojiUrl = emojis.getEmojiUrl(metadata.emojiId) || "";
    metadata.uid = uid;
    metadata.displayName = undefined;
    metadata.username = undefined;
    metadata.ethAddress = undefined;
    metadata.solAddress = undefined;
    metadata.ens = undefined;
    metadata.voiceReactionText = "";
    metadata.voiceReactionDate = undefined;
    metadata.rating = undefined;
    metadata.profile = null;
    metadata.emojiId = "";
    metadata.aura = "";
    showRaibowAura(false, previousEmojiUrl, opponent);
  } else {
    metadata.uid = uid;
  }
  recalculateDisplayNames();
  syncAvatarForCurrentMetadata(opponent);
  updateWagerPlayerUids(playerSideMetadata.uid, opponentSideMetadata.uid);
}

function canRedirectToExplorer(opponent: boolean) {
  let ethAddress = opponent ? opponentSideMetadata.ethAddress : playerSideMetadata.ethAddress;
  let solAddress = opponent ? opponentSideMetadata.solAddress : playerSideMetadata.solAddress;
  return ethAddress !== undefined || solAddress !== undefined;
}

function redirectToAddressOnExplorer(opponent: boolean) {
  const metadata = opponent ? opponentSideMetadata : playerSideMetadata;
  const displayName = metadata.displayName;
  if (displayName !== undefined) {
    const profile = getStashedPlayerProfile(metadata.uid);
    if (profile) {
      profile.emoji = parseInt(metadata.emojiId, 10);
    }
    showShinyCard(profile ?? null, displayName, true);
  }
}

export function removeItemsNotPresentIn(locations: Location[]) {
  const locationSet = new Set(locations.map((location) => inBoardCoordinates(location).toString()));

  for (const key in items) {
    if (!locationSet.has(key)) {
      const element = items[key];
      removeItemAndCleanUpAnimation(element);
      delete items[key];
    }
  }

  for (const key in basesPlaceholders) {
    if (!locationSet.has(key)) {
      const element = basesPlaceholders[key];
      removeItemAndCleanUpAnimation(element);
      delete basesPlaceholders[key];
    }
  }
}

export function hideAllMoveStatuses() {
  const allMoveStatusItems = [...opponentMoveStatusItems, ...playerMoveStatusItems];
  allMoveStatusItems.forEach((item) => SVG.setHidden(item, true));
}

export function updateMoveStatuses(color: MonsWeb.Color, moveKinds: Int32Array, otherPlayerStatuses: Int32Array) {
  const playerSideActive = isFlipped ? color === MonsWeb.Color.White : color === MonsWeb.Color.Black;
  const otherItemsToSetup = playerSideActive ? playerMoveStatusItems : opponentMoveStatusItems;
  const itemsToSetup = playerSideActive ? opponentMoveStatusItems : playerMoveStatusItems;
  updateStatusElements(itemsToSetup, moveKinds);
  updateStatusElements(otherItemsToSetup, otherPlayerStatuses);
}

function updateStatusElements(itemsToSetup: SVGElement[], moveKinds: Int32Array) {
  const monMoves = moveKinds[0];
  let manaMoves = moveKinds[1];
  let actions = moveKinds[2];
  let potions = moveKinds[3];
  const total = monMoves + manaMoves + actions + potions;
  for (const [index, item] of itemsToSetup.entries()) {
    if (index < total) {
      SVG.setHidden(item, false);
      if (manaMoves > 0) {
        SVG.setImage(item, emojis.statusMana);
        manaMoves -= 1;
      } else if (potions > 0) {
        SVG.setImage(item, emojis.statusPotion);
        potions -= 1;
      } else if (actions > 0) {
        SVG.setImage(item, emojis.statusAction);
        actions -= 1;
      } else {
        SVG.setImage(item, emojis.statusMove);
      }
    } else {
      SVG.setHidden(item, true);
    }
  }
}

export function removeItem(location: Location) {
  location = inBoardCoordinates(location);
  const locationKey = location.toString();
  const toRemove = items[locationKey];
  if (toRemove !== undefined) {
    removeItemAndCleanUpAnimation(toRemove);
    delete items[locationKey];
  }
}

export function showTimer(color: string, remainingSeconds: number) {
  const playerSideTimer = isFlipped ? color === "white" : color === "black";
  const timerElement = playerSideTimer ? playerTimer : opponentTimer;
  if (!timerElement) return;

  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
    decrementLifecycleCounter("boardIntervals");
  }

  if (activeTimer && activeTimer !== timerElement) {
    SVG.setHidden(activeTimer, true);
    if (playerSideTimer) {
      showsOpponentTimer = false;
    } else {
      showsPlayerTimer = false;
    }
  }

  activeTimer = timerElement;
  updateTimerDisplay(timerElement, remainingSeconds);
  SVG.setHidden(timerElement, false);

  if (playerSideTimer) {
    showsPlayerTimer = true;
  } else {
    showsOpponentTimer = true;
  }

  const endTime = Date.now() + remainingSeconds * 1000;

  countdownInterval = setInterval(() => {
    const currentTime = Date.now();
    remainingSeconds = Math.max(0, Math.round((endTime - currentTime) / 1000));
    if (remainingSeconds <= 0) {
      clearInterval(countdownInterval!);
      countdownInterval = null;
      decrementLifecycleCounter("boardIntervals");
    }
    updateTimerDisplay(timerElement, remainingSeconds);
  }, 1000);
  incrementLifecycleCounter("boardIntervals");

  updateNamesX();
}

function updateTimerDisplay(timerElement: SVGElement, seconds: number) {
  const displayValue = Math.max(0, seconds);
  if (displayValue <= 10) {
    SVG.setFill(timerElement, "red");
  } else if (displayValue <= 30) {
    SVG.setFill(timerElement, "orange");
  } else {
    SVG.setFill(timerElement, "green");
  }
  timerElement.textContent = `${displayValue}s`;
}

export function hideTimerCountdownDigits() {
  showsPlayerTimer = false;
  showsOpponentTimer = false;

  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
    decrementLifecycleCounter("boardIntervals");
  }
  if (playerTimer && opponentTimer) {
    SVG.setHidden(playerTimer, true);
    SVG.setHidden(opponentTimer, true);
  }
  activeTimer = null;
  updateNamesX();
}

export function updateScore(white: number, black: number, winnerColor?: MonsWeb.Color, resignedColor?: MonsWeb.Color, winByTimerColor?: MonsWeb.Color) {
  let whiteMarker: EndOfGameMarker = "none";
  let blackMarker: EndOfGameMarker = "none";

  if (winnerColor !== null && winnerColor !== undefined) {
    if (winnerColor === MonsWeb.Color.Black) {
      blackMarker = "victory";
    } else {
      whiteMarker = "victory";
    }
  } else if (winByTimerColor !== null && winByTimerColor !== undefined) {
    if (winByTimerColor === MonsWeb.Color.Black) {
      blackMarker = "victory";
    } else {
      whiteMarker = "victory";
    }
  } else if (resignedColor !== null && resignedColor !== undefined) {
    if (resignedColor === MonsWeb.Color.Black) {
      blackMarker = "resign";
    } else {
      whiteMarker = "resign";
    }
  }

  const playerScore = isFlipped ? black : white;
  const opponentScore = isFlipped ? white : black;

  const playerMarker = isFlipped ? blackMarker : whiteMarker;
  const opponentMarker = isFlipped ? whiteMarker : blackMarker;

  if (playerScoreText && opponentScoreText) {
    playerScoreText.textContent = playerScore.toString();
    opponentScoreText.textContent = opponentScore.toString();
  }

  playerEndOfGameMarker = playerMarker;
  opponentEndOfGameMarker = opponentMarker;
  updateNamesX();
  renderPlayersNamesLabels();
}

export function hideItemSelectionOrConfirmationOverlay() {
  if (showsItemSelectionOrConfirmationOverlay) {
    showsItemSelectionOrConfirmationOverlay = false;
    setTopBoardOverlayVisible(false, null, false);
    removeHighlights();
  }
}

export function showEndTurnConfirmationOverlay(isBlack: boolean, finishLocation: Location, ok: () => void, cancel: () => void): void {
  showEndOfTurnHighlight(finishLocation);
  const overlay = document.createElementNS(SVG.ns, "g");
  const background = createFullBoardBackgroundElement();
  overlay.appendChild(background);

  const onCancel = () => {
    setTopBoardOverlayVisible(false, null, false);
    cancel();
  };

  const onOk = () => {
    setTopBoardOverlayVisible(false, null, false);
    ok();
  };

  background.addEventListener(defaultInputEventName, (event) => {
    preventTouchstartIfNeeded(event);
    event.stopPropagation();
    onCancel();
  });

  createItemButton(overlay, 392.5, 365, true, isBlack ? assets.manaB : assets.mana, () => onCancel());
  showsItemSelectionOrConfirmationOverlay = true;

  setTopBoardOverlayVisible(true, overlay, true, onOk, onCancel);
}

function createItemButton(overlay: SVGElement, x: number, y: number, wiggle: boolean, asset: string, completion: () => void): void {
  const button = document.createElementNS(SVG.ns, "foreignObject");
  button.setAttribute("x", x.toString());
  button.setAttribute("y", y.toString());
  button.setAttribute("width", "315");
  button.setAttribute("height", "315");
  button.setAttribute("class", "item");
  button.style.overflow = "visible";

  let animationId: number | null = null;

  if (wiggle) {
    const wigglePause = 1500;
    const wiggleDuration = 600;
    const wiggleOscillations = 2;
    const wiggleAmplitude = 8;

    const originalX = parseFloat(button.getAttribute("x") || "0");
    let lastPhase = "wiggle";
    let phaseStartTime: number | null = null;

    function animateWiggle(timestamp: number) {
      if (phaseStartTime === null) phaseStartTime = timestamp;
      const phaseElapsed = timestamp - phaseStartTime;

      if (lastPhase === "pause") {
        button.setAttribute("x", originalX.toString());
        if (phaseElapsed >= wigglePause) {
          lastPhase = "wiggle";
          phaseStartTime = timestamp;
        }
      } else if (lastPhase === "wiggle") {
        const progress = Math.min(phaseElapsed / wiggleDuration, 1);
        const angle = progress * wiggleOscillations * 2 * Math.PI;
        const offsetX = Math.sin(angle) * wiggleAmplitude * (1 - progress * 0.3);
        button.setAttribute("x", (originalX + offsetX).toString());
        if (phaseElapsed >= wiggleDuration) {
          lastPhase = "pause";
          phaseStartTime = timestamp;
          button.setAttribute("x", originalX.toString());
        }
      }

      if (button.parentNode && animationId !== null) {
        animationId = setManagedBoardRaf(animateWiggle);
      }
    }

    animationId = setManagedBoardRaf(animateWiggle);
    (button as any).__stopWiggle = () => {
      if (animationId !== null) {
        cancelManagedBoardRaf(animationId);
        animationId = null;
      }
      button.setAttribute("x", originalX.toString());
    };
  }

  const div = document.createElementNS("http://www.w3.org/1999/xhtml", "div") as HTMLDivElement;
  div.style.width = "100%";
  div.style.height = "100%";
  div.style.display = "block";
  div.style.margin = "0";
  div.style.padding = "0";
  div.style.backgroundImage = `url(data:image/webp;base64,${asset})`;
  div.style.backgroundSize = "contain";
  div.style.backgroundPosition = "center";
  div.style.backgroundRepeat = "no-repeat";
  if (currentAssetsSet === AssetsSet.Pixel) {
    div.style.imageRendering = "pixelated";
  }

  button.appendChild(div);
  overlay.appendChild(button);

  const touchTarget = document.createElementNS(SVG.ns, "rect");
  touchTarget.setAttribute("x", x.toString());
  touchTarget.setAttribute("y", y.toString());
  touchTarget.setAttribute("width", "315");
  touchTarget.setAttribute("height", "315");
  SVG.setFill(touchTarget, "transparent");
  touchTarget.addEventListener(defaultInputEventName, (event) => {
    preventTouchstartIfNeeded(event);
    event.stopPropagation();
    if ((button as any).__stopWiggle) {
      (button as any).__stopWiggle();
    }

    completion();
    setTopBoardOverlayVisible(false, null, false);
  });
  overlay.appendChild(touchTarget);
}

export function showItemSelection(): void {
  const overlay = document.createElementNS(SVG.ns, "g");
  const background = createFullBoardBackgroundElement();
  overlay.appendChild(background);

  createItemButton(overlay, 220, 365, false, assets.bomb, () => didSelectInputModifier(InputModifier.Bomb));
  createItemButton(overlay, 565, 365, false, assets.potion, () => didSelectInputModifier(InputModifier.Potion));

  background.addEventListener(defaultInputEventName, (event) => {
    preventTouchstartIfNeeded(event);
    event.stopPropagation();
    didSelectInputModifier(InputModifier.Cancel);
    setTopBoardOverlayVisible(false, null, false);
  });

  showsItemSelectionOrConfirmationOverlay = true;
  setTopBoardOverlayVisible(true, overlay, false);
}

export function addElementToItemsLayer(element: SVGElement, depth: number) {
  if (!itemsLayer) return;

  if (isPangchiuBoard()) {
    const children = Array.from(itemsLayer.children);
    const insertionIndex = children.findIndex((child) => {
      const childDepth = Number(child.getAttribute("data-depth") || 0);
      return childDepth > depth;
    });

    element.setAttribute("data-depth", depth.toString());

    if (insertionIndex === -1) {
      itemsLayer.appendChild(element);
    } else {
      itemsLayer.insertBefore(element, children[insertionIndex]);
    }
  } else {
    itemsLayer.appendChild(element);
  }
}

export function putItem(item: MonsWeb.ItemModel, location: Location) {
  switch (item.kind) {
    case MonsWeb.ItemModelKind.Mon:
      const isBlack = item.mon?.color === MonsWeb.Color.Black;
      const isFainted = item.mon?.is_fainted();
      switch (item.mon?.kind) {
        case MonsWeb.MonKind.Demon:
          placeItem(isBlack ? demonB : demon, location, isBlack ? ItemKind.DemonBlack : ItemKind.Demon, isFainted);
          break;
        case MonsWeb.MonKind.Drainer:
          placeItem(isBlack ? drainerB : drainer, location, isBlack ? ItemKind.DrainerBlack : ItemKind.Drainer, isFainted);
          break;
        case MonsWeb.MonKind.Angel:
          placeItem(isBlack ? angelB : angel, location, isBlack ? ItemKind.AngelBlack : ItemKind.Angel, isFainted);
          break;
        case MonsWeb.MonKind.Spirit:
          placeItem(isBlack ? spiritB : spirit, location, isBlack ? ItemKind.SpiritBlack : ItemKind.Spirit, isFainted);
          break;
        case MonsWeb.MonKind.Mystic:
          placeItem(isBlack ? mysticB : mystic, location, isBlack ? ItemKind.MysticBlack : ItemKind.Mystic, isFainted);
          break;
      }
      break;
    case MonsWeb.ItemModelKind.Mana:
      switch (item.mana?.kind) {
        case MonsWeb.ManaKind.Regular:
          const isBlack = item.mana.color === MonsWeb.Color.Black;
          placeItem(isBlack ? manaB : mana, location, isBlack ? ItemKind.ManaBlack : ItemKind.Mana);
          break;
        case MonsWeb.ManaKind.Supermana:
          placeItem(supermana, location, ItemKind.Supermana);
          break;
      }
      break;
    case MonsWeb.ItemModelKind.MonWithMana:
      const isBlackDrainer = item.mon?.color === MonsWeb.Color.Black;
      const isSupermana = item.mana?.kind === MonsWeb.ManaKind.Supermana;
      if (isSupermana) {
        placeMonWithSupermana(isBlackDrainer ? drainerB : drainer, location, isBlackDrainer ? ItemKind.DrainerBlack : ItemKind.Drainer);
      } else {
        const isBlackMana = item.mana?.color === MonsWeb.Color.Black;
        placeMonWithMana(isBlackDrainer ? drainerB : drainer, isBlackMana ? manaB : mana, location, isBlackDrainer ? ItemKind.DrainerBlack : ItemKind.Drainer);
      }
      break;
    case MonsWeb.ItemModelKind.MonWithConsumable:
      const isBlackWithConsumable = item.mon?.color === MonsWeb.Color.Black;
      switch (item.mon?.kind) {
        case MonsWeb.MonKind.Demon:
          placeMonWithBomb(isBlackWithConsumable ? demonB : demon, location, isBlackWithConsumable ? ItemKind.DemonBlack : ItemKind.Demon);
          break;
        case MonsWeb.MonKind.Drainer:
          placeMonWithBomb(isBlackWithConsumable ? drainerB : drainer, location, isBlackWithConsumable ? ItemKind.DrainerBlack : ItemKind.Drainer);
          break;
        case MonsWeb.MonKind.Angel:
          placeMonWithBomb(isBlackWithConsumable ? angelB : angel, location, isBlackWithConsumable ? ItemKind.AngelBlack : ItemKind.Angel);
          break;
        case MonsWeb.MonKind.Spirit:
          placeMonWithBomb(isBlackWithConsumable ? spiritB : spirit, location, isBlackWithConsumable ? ItemKind.SpiritBlack : ItemKind.Spirit);
          break;
        case MonsWeb.MonKind.Mystic:
          placeMonWithBomb(isBlackWithConsumable ? mysticB : mystic, location, isBlackWithConsumable ? ItemKind.MysticBlack : ItemKind.Mystic);
          break;
      }
      break;
    case MonsWeb.ItemModelKind.Consumable:
      placeItem(bombOrPotion, location, ItemKind.Consumable, false, true);
      break;
  }
}

export function setupSquare(square: MonsWeb.SquareModel, location: Location) {
  if (square.kind === MonsWeb.SquareModelKind.MonBase) {
    const isBlack = square.color === MonsWeb.Color.Black;
    switch (square.mon_kind) {
      case MonsWeb.MonKind.Demon:
        setBase(isBlack ? demonB : demon, location);
        break;
      case MonsWeb.MonKind.Drainer:
        setBase(isBlack ? drainerB : drainer, location);
        break;
      case MonsWeb.MonKind.Angel:
        setBase(isBlack ? angelB : angel, location);
        break;
      case MonsWeb.MonKind.Spirit:
        setBase(isBlack ? spiritB : spirit, location);
        break;
      case MonsWeb.MonKind.Mystic:
        setBase(isBlack ? mysticB : mystic, location);
        break;
    }
  }
}

function seeIfShouldOffsetFromBorders(): boolean {
  return window.innerWidth / window.innerHeight < 0.72;
}

function getOuterElementsMultiplicator(): number {
  return Math.min(420 / boardBackgroundLayer!.getBoundingClientRect().width, 1);
}

function getAvatarSize(): number {
  return 0.777 * getOuterElementsMultiplicator();
}

function getWagerMaterialUrl(name: MaterialName): string {
  return `${MATERIAL_BASE_URL}/${name}.webp`;
}

function getWagerVisibleScale(): number {
  return Math.max(0.1, 1 - WAGER_ICON_PADDING_FRAC * 2);
}

function getWagerRectForScale(isOpponent: boolean, scale: number): { x: number; y: number; w: number; h: number } {
  const avatarSize = getAvatarSize();
  const baseY = isOpponent ? 1 - avatarSize * 1.203 : isPangchiuBoard() ? 12.75 : 12.16;
  const baseH = avatarSize;
  const baseW = avatarSize * 2;
  const h = baseH * scale;
  const w = baseW * scale;
  const x = 5.5 - w / 2;
  const y = isOpponent ? baseY + baseH - h : baseY;
  return { x, y, w, h };
}

function createWagerPile(): WagerPile | null {
  const pile: WagerPile = {
    positions: [],
    frames: [],
    material: null,
    materialUrl: null,
    count: 0,
    actualCount: 0,
    rect: null,
    iconSize: 0,
  };
  return pile;
}

function ensureWagerPile(isOpponent: boolean): WagerPile | null {
  if (isOpponent) {
    if (!opponentWagerPile) {
      opponentWagerPile = createWagerPile();
    }
    return opponentWagerPile;
  }
  if (!playerWagerPile) {
    playerWagerPile = createWagerPile();
  }
  return playerWagerPile;
}

function ensureWinnerWagerPile(): WagerPile | null {
  if (!winnerWagerPile) {
    winnerWagerPile = createWagerPile();
  }
  return winnerWagerPile;
}

function generateWagerPositions(count: number): Array<{ u: number; v: number }> {
  if (count <= 0) return [];
  const grid = Math.max(1, Math.ceil(Math.sqrt(count)));
  const cell = 1 / grid;
  const positions: Array<{ u: number; v: number }> = [];
  for (let row = 0; row < grid; row += 1) {
    for (let col = 0; col < grid; col += 1) {
      const jitterX = 0.2 + Math.random() * 0.6;
      const jitterY = 0.2 + Math.random() * 0.6;
      positions.push({ u: (col + jitterX) * cell, v: (row + jitterY) * cell });
    }
  }
  for (let i = positions.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = positions[i];
    positions[i] = positions[j];
    positions[j] = temp;
  }
  return positions.slice(0, count);
}

function syncWagerPileIcons(pile: WagerPile, material: MaterialName, count: number, materialUrl?: string | null, maxItems = MAX_WAGER_PILE_ITEMS) {
  const visibleCount = Math.max(0, Math.min(maxItems, count));
  const nextUrl = materialUrl || getWagerMaterialUrl(material);
  const sameMaterial = pile.material === material;
  const sameVisibleCount = pile.count === visibleCount;
  const reusePositions = sameMaterial && sameVisibleCount && pile.positions.length === visibleCount;
  pile.material = material;
  pile.materialUrl = nextUrl;
  pile.count = visibleCount;
  pile.actualCount = count;
  if (!reusePositions) {
    if (visibleCount <= 0) {
      pile.positions = [];
    } else if (sameMaterial && pile.positions.length > 0) {
      const nextPositions = pile.positions.slice(0, visibleCount);
      if (nextPositions.length < visibleCount) {
        nextPositions.push(...generateWagerPositions(visibleCount - nextPositions.length));
      }
      pile.positions = nextPositions;
    } else {
      pile.positions = generateWagerPositions(visibleCount);
    }
  }
  pile.frames = [];
}

function getWagerPileRect(isOpponent: boolean): { x: number; y: number; w: number; h: number } {
  return getWagerRectForScale(isOpponent, WAGER_PILE_SCALE);
}

function getWagerWinnerRect(isOpponent: boolean): { x: number; y: number; w: number; h: number } {
  return getWagerRectForScale(isOpponent, WAGER_WIN_PILE_SCALE);
}

function getWagerIconLayout(
  rect: { x: number; y: number; w: number; h: number },
  iconSizeOverride?: number
): { iconSize: number; padding: number; maxX: number; maxY: number } {
  const visibleScale = getWagerVisibleScale();
  const rawIconSize = getAvatarSize() * WAGER_ICON_SIZE_MULTIPLIER;
  const maxIconSize = Math.min(rect.w, rect.h) / visibleScale;
  const iconSize = Math.min(iconSizeOverride ?? rawIconSize, maxIconSize);
  const padding = iconSize * WAGER_ICON_PADDING_FRAC;
  const visibleSize = iconSize * visibleScale;
  const maxX = Math.max(0, rect.w - visibleSize);
  const maxY = Math.max(0, rect.h - visibleSize);
  return { iconSize, padding, maxX, maxY };
}

function updateWagerPileLayout(pile: WagerPile, rect: { x: number; y: number; w: number; h: number }) {
  const layout = getWagerIconLayout(rect);
  pile.rect = rect;
  pile.iconSize = layout.iconSize;
  pile.frames = [];
  for (let i = 0; i < pile.count; i += 1) {
    const pos = pile.positions[i] ?? { u: 0.5, v: 0.5 };
    const ix = rect.x - layout.padding + pos.u * layout.maxX;
    const iy = rect.y - layout.padding + pos.v * layout.maxY;
    pile.frames.push({ x: ix, y: iy });
  }
}

function updateWagerLayout() {
  if (!playerWagerPile && !opponentWagerPile && !winnerWagerPile) {
    return;
  }
  if (!controlsLayer) {
    return;
  }
  if (!boardBackgroundLayer) {
    return;
  }
  if (playerWagerPile) {
    updateWagerPileLayout(playerWagerPile, getWagerPileRect(false));
  }
  if (opponentWagerPile) {
    updateWagerPileLayout(opponentWagerPile, getWagerPileRect(true));
  }
  if (winnerWagerPile && winnerPileActive && !wagerWinAnimActive) {
    updateWagerPileLayout(winnerWagerPile, getWagerWinnerRect(lastWagerWinnerIsOpponent));
  }
  emitWagerRenderState();
}

function buildWagerRenderState(pile: WagerPile | null, side: WagerPileSide | "winner", animation: WagerPileAnimation, isPending: boolean): WagerPileRenderState | null {
  if (!pile || pile.count === 0 || !pile.rect) {
    return null;
  }
  const materialUrl = pile.materialUrl || (pile.material ? getWagerMaterialUrl(pile.material) : "");
  if (!materialUrl) {
    return null;
  }
  return {
    side,
    rect: { ...pile.rect },
    iconSize: pile.iconSize,
    materialUrl,
    frames: pile.frames.map((f) => ({ ...f })),
    count: pile.count,
    actualCount: pile.actualCount,
    animation,
    isPending,
  };
}

function clearDisappearingPile(side: "player" | "opponent") {
  if (side === "player") {
    if (disappearingPileTimers.player !== null) {
      window.clearTimeout(disappearingPileTimers.player);
      decrementLifecycleCounter("boardTimeouts");
      disappearingPileTimers.player = null;
    }
    disappearingPlayerPile = null;
  } else {
    if (disappearingPileTimers.opponent !== null) {
      window.clearTimeout(disappearingPileTimers.opponent);
      decrementLifecycleCounter("boardTimeouts");
      disappearingPileTimers.opponent = null;
    }
    disappearingOpponentPile = null;
  }
}

function emitWagerRenderState() {
  const showWinner = Boolean(winnerPileActive && winnerWagerPile && winnerWagerPile.count > 0 && winnerWagerPile.rect);

  const currentPlayerState = showWinner ? null : buildWagerRenderState(playerWagerPile, "player", "none", playerPilePending);
  const currentOpponentState = showWinner ? null : buildWagerRenderState(opponentWagerPile, "opponent", "none", opponentPilePending);
  const currentPlayerVisible = !!currentPlayerState;
  const currentOpponentVisible = !!currentOpponentState;

  let playerAnimation: WagerPileAnimation = "none";
  let opponentAnimation: WagerPileAnimation = "none";

  if (wagerAnimationsReady && !wagerWinAnimActive && !showWinner) {
    if (currentPlayerVisible && !previousPlayerPileVisible) {
      playerAnimation = "appear";
      clearDisappearingPile("player");
    } else if (!currentPlayerVisible && previousPlayerPileVisible && lastVisiblePlayerPileState) {
      clearDisappearingPile("player");
      incrementLifecycleCounter("boardTimeouts");
      disappearingPlayerPile = { ...lastVisiblePlayerPileState, animation: "disappear", isPending: false };
      disappearingPileTimers.player = window.setTimeout(() => {
        decrementLifecycleCounter("boardTimeouts");
        disappearingPlayerPile = null;
        disappearingPileTimers.player = null;
        emitWagerRenderState();
      }, WAGER_DISAPPEAR_ANIMATION_MS);
    }

    if (currentOpponentVisible && !previousOpponentPileVisible) {
      opponentAnimation = "appear";
      clearDisappearingPile("opponent");
    } else if (!currentOpponentVisible && previousOpponentPileVisible && lastVisibleOpponentPileState) {
      clearDisappearingPile("opponent");
      incrementLifecycleCounter("boardTimeouts");
      disappearingOpponentPile = { ...lastVisibleOpponentPileState, animation: "disappear", isPending: false };
      disappearingPileTimers.opponent = window.setTimeout(() => {
        decrementLifecycleCounter("boardTimeouts");
        disappearingOpponentPile = null;
        disappearingPileTimers.opponent = null;
        emitWagerRenderState();
      }, WAGER_DISAPPEAR_ANIMATION_MS);
    }
  }

  previousPlayerPileVisible = currentPlayerVisible;
  previousOpponentPileVisible = currentOpponentVisible;

  if (currentPlayerState) {
    lastVisiblePlayerPileState = currentPlayerState;
  }
  if (currentOpponentState) {
    lastVisibleOpponentPileState = currentOpponentState;
  }

  if (!handleWagerRenderState) {
    return;
  }

  const playerRenderState = currentPlayerState ? { ...currentPlayerState, animation: playerAnimation } : null;
  const opponentRenderState = currentOpponentState ? { ...currentOpponentState, animation: opponentAnimation } : null;
  const winnerRenderState = showWinner ? buildWagerRenderState(winnerWagerPile, "winner", "none", false) : null;

  const state: WagerRenderState = {
    player: playerRenderState,
    opponent: opponentRenderState,
    winner: winnerRenderState,
    winAnimationActive: wagerWinAnimActive,
    playerDisappearing: disappearingPlayerPile,
    opponentDisappearing: disappearingOpponentPile,
  };
  const signature = [
    state.player ? `${state.player.count}:${state.player.isPending ? 1 : 0}:${state.player.animation}` : "none",
    state.opponent ? `${state.opponent.count}:${state.opponent.isPending ? 1 : 0}:${state.opponent.animation}` : "none",
    state.winner ? `${state.winner.count}` : "none",
    state.playerDisappearing ? `${state.playerDisappearing.count}` : "none",
    state.opponentDisappearing ? `${state.opponentDisappearing.count}` : "none",
    state.winAnimationActive ? "1" : "0",
  ].join("|");
  if (signature !== lastWagerEmitSignature) {
    lastWagerEmitSignature = signature;
    logBoardWagerDebug("emit-render-state", {
      showWinner,
      signature,
      playerRect: state.player?.rect ?? null,
      opponentRect: state.opponent?.rect ?? null,
      winnerRect: state.winner?.rect ?? null,
    });
  }
  handleWagerRenderState(state);
}

function cancelWagerWinAnimation() {
  if (wagerWinAnimRaf !== null) {
    cancelManagedBoardRaf(wagerWinAnimRaf);
    wagerWinAnimRaf = null;
  }
  wagerWinAnimActive = false;
  wagerWinAnimState = null;
}

function getWagerIconFrame(
  rect: { x: number; y: number; w: number; h: number },
  layout: { iconSize: number; padding: number; maxX: number; maxY: number },
  pos: { u: number; v: number }
): { x: number; y: number } {
  return {
    x: rect.x - layout.padding + pos.u * layout.maxX,
    y: rect.y - layout.padding + pos.v * layout.maxY,
  };
}

function buildWagerFrames(
  rect: { x: number; y: number; w: number; h: number },
  layout: { iconSize: number; padding: number; maxX: number; maxY: number },
  positions: Array<{ u: number; v: number }>,
  count: number
): Array<{ x: number; y: number }> {
  const frames: Array<{ x: number; y: number }> = [];
  const initialCount = Math.min(count, positions.length);
  for (let i = 0; i < initialCount; i += 1) {
    frames.push(getWagerIconFrame(rect, layout, positions[i]));
  }
  while (frames.length < count) {
    frames.push(getWagerIconFrame(rect, layout, { u: Math.random(), v: Math.random() }));
  }
  return frames;
}

function startWagerWinAnimation(winnerIsOpponent: boolean): boolean {
  if (!playerWagerPile || !opponentWagerPile) {
    return false;
  }
  const winnerSource = winnerIsOpponent ? opponentWagerPile : playerWagerPile;
  const loserSource = winnerIsOpponent ? playerWagerPile : opponentWagerPile;
  const material = winnerSource.material || loserSource.material;
  if (!material) {
    return false;
  }
  const winnerCount = Math.max(0, winnerSource.actualCount || winnerSource.count);
  const loserCount = Math.max(0, loserSource.actualCount || loserSource.count);
  const totalCount = winnerCount + loserCount;
  if (totalCount <= 0) {
    return false;
  }
  const winnerPile = ensureWinnerWagerPile();
  if (!winnerPile) {
    return false;
  }

  cancelWagerWinAnimation();

  const materialUrl = winnerSource.materialUrl || loserSource.materialUrl || null;
  const displayWinnerCount = Math.min(winnerSource.count, MAX_WAGER_WIN_PILE_ITEMS);
  const displayTotal = Math.min(MAX_WAGER_WIN_PILE_ITEMS, displayWinnerCount + loserCount);
  syncWagerPileIcons(winnerPile, material, displayTotal, materialUrl, MAX_WAGER_WIN_PILE_ITEMS);

  const visibleCount = winnerPile.count;
  if (visibleCount === 0) {
    return false;
  }
  winnerPileActive = true;

  const winnerVisible = Math.min(visibleCount, displayWinnerCount);
  const loserVisible = visibleCount - winnerVisible;

  const winnerSourceRect = getWagerPileRect(winnerIsOpponent);
  const loserRect = getWagerPileRect(!winnerIsOpponent);
  const winnerRect = getWagerWinnerRect(winnerIsOpponent);

  const iconSize = getWagerIconLayout(winnerSourceRect).iconSize;
  const winnerLayout = getWagerIconLayout(winnerRect, iconSize);
  const winnerSourceLayout = getWagerIconLayout(winnerSourceRect, iconSize);
  const loserLayout = getWagerIconLayout(loserRect, iconSize);

  const winnerAnchoredCount = Math.min(winnerVisible, winnerSource.positions.length);
  const winnerAnchoredStarts = buildWagerFrames(winnerSourceRect, winnerSourceLayout, winnerSource.positions, winnerAnchoredCount);
  const winnerExtraCount = winnerVisible - winnerAnchoredCount;
  const extraPositions = generateWagerPositions(winnerExtraCount + loserVisible);
  const winnerExtraPositions = extraPositions.slice(0, winnerExtraCount);
  const loserPositions = extraPositions.slice(winnerExtraCount, winnerExtraCount + loserVisible);

  const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
  const winnerAnchoredPositions = winnerAnchoredStarts.map((frame) => {
    const u = winnerLayout.maxX > 0 ? (frame.x - winnerRect.x + winnerLayout.padding) / winnerLayout.maxX : 0.5;
    const v = winnerLayout.maxY > 0 ? (frame.y - winnerRect.y + winnerLayout.padding) / winnerLayout.maxY : 0.5;
    return { u: clamp01(u), v: clamp01(v) };
  });

  const winnerPositions = winnerAnchoredPositions.concat(winnerExtraPositions);
  winnerPile.positions = winnerPositions.concat(loserPositions);

  const targets = winnerPile.positions.map((pos) => getWagerIconFrame(winnerRect, winnerLayout, pos));
  const winnerExtraStarts = winnerExtraPositions.map((pos) => getWagerIconFrame(winnerRect, winnerLayout, pos));
  const loserStarts = buildWagerFrames(loserRect, loserLayout, loserSource.positions, loserVisible);
  const starts = winnerAnchoredStarts.concat(winnerExtraStarts, loserStarts);

  winnerPile.rect = winnerRect;
  winnerPile.iconSize = iconSize;
  winnerPile.frames = starts.map((frame) => ({ x: frame.x, y: frame.y }));

  const drifts = starts.map((start, index) => {
    if (index < winnerVisible) {
      return { x: 0, y: 0 };
    }
    const target = targets[index] || start;
    const dx = target.x - start.x;
    const dy = target.y - start.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const amp = 0.12 + Math.random() * 0.28;
    const dir = Math.random() < 0.5 ? -1 : 1;
    return { x: nx * amp * dir, y: ny * amp * dir };
  });

  const delays = starts.map((_, index) => (index < winnerVisible ? 0 : Math.random() * 0.1));

  clearDisappearingPile("player");
  clearDisappearingPile("opponent");
  wagerWinAnimActive = true;
  lastWagerWinnerIsOpponent = winnerIsOpponent;
  emitWagerRenderState();
  const startTime = performance.now();
  wagerWinAnimState = {
    startTime,
    duration: WAGER_WIN_ANIM_DURATION_MS,
    iconSize,
    starts,
    targets,
    drifts,
    delays,
  };

  const animate = (time: number) => {
    if (!wagerWinAnimState || !winnerWagerPile) {
      wagerWinAnimActive = false;
      wagerWinAnimRaf = null;
      return;
    }
    const { startTime, duration, iconSize, starts, targets, drifts, delays } = wagerWinAnimState;
    const progress = Math.max(0, Math.min(1, (time - startTime) / duration));
    for (let i = 0; i < winnerWagerPile.count; i += 1) {
      const delay = delays[i] || 0;
      const denom = 1 - delay;
      const local = denom > 0 ? Math.max(0, Math.min(1, (progress - delay) / denom)) : progress;
      const eased = 1 - Math.pow(1 - local, 3);
      const driftScale = Math.sin(local * Math.PI);
      const start = starts[i] || targets[i];
      const target = targets[i] || start;
      if (!start || !target) continue;
      const drift = drifts[i] || { x: 0, y: 0 };
      const x = start.x + (target.x - start.x) * eased + drift.x * driftScale;
      const y = start.y + (target.y - start.y) * eased + drift.y * driftScale;
      if (!winnerWagerPile.frames[i]) {
        winnerWagerPile.frames[i] = { x, y };
      } else {
        winnerWagerPile.frames[i].x = x;
        winnerWagerPile.frames[i].y = y;
      }
    }
    winnerWagerPile.iconSize = iconSize;
    emitWagerRenderState();

    if (progress < 1) {
      wagerWinAnimRaf = setManagedBoardRaf(animate);
    } else {
      for (let i = 0; i < winnerWagerPile.count; i += 1) {
        const target = targets[i];
        if (!target) continue;
        if (!winnerWagerPile.frames[i]) {
          winnerWagerPile.frames[i] = { x: target.x, y: target.y };
        } else {
          winnerWagerPile.frames[i].x = target.x;
          winnerWagerPile.frames[i].y = target.y;
        }
      }
      wagerWinAnimActive = false;
      wagerWinAnimState = null;
      wagerWinAnimRaf = null;
      emitWagerRenderState();
    }
  };

  wagerWinAnimRaf = setManagedBoardRaf(animate);
  return true;
}


function getSvgTextWidthInBoardUnits(element: SVGElement | undefined): number {
  if (!element) {
    return 0;
  }
  try {
    const textElement = element as unknown as SVGTextContentElement;
    const width = textElement.getComputedTextLength ? textElement.getComputedTextLength() : 0;
    if (Number.isFinite(width) && width > 0) {
      return width / 100;
    }
  } catch {}
  try {
    const graphicElement = element as unknown as SVGGraphicsElement;
    const bbox = graphicElement.getBBox ? graphicElement.getBBox() : null;
    if (bbox && Number.isFinite(bbox.width) && bbox.width > 0) {
      return bbox.width / 100;
    }
  } catch {}
  return 0;
}

function getDynamicNameDelta(
  initialX: number,
  scoreText: SVGElement | undefined,
  timerText: SVGElement | undefined,
  showsTimer: boolean,
  endOfGameIcon: SVGElement | undefined,
  showsEndOfGameMarker: boolean,
  multiplicator: number
): number {
  if (!scoreText) {
    return 0;
  }
  const spacing = 0.14 * multiplicator;
  const scoreX = parseFloat(scoreText.getAttribute("x") || "0") / 100;
  const scoreRight = scoreX + getSvgTextWidthInBoardUnits(scoreText);
  let minNameX = scoreRight + spacing;
  if (showsEndOfGameMarker && endOfGameIcon) {
    const iconX = parseFloat(endOfGameIcon.getAttribute("x") || "0") / 100;
    const measuredIconWidth = parseFloat(endOfGameIcon.getAttribute("width") || "0") / 100;
    const fallbackIconWidth = END_OF_GAME_ICON_SIZE_MULTIPLIER * multiplicator;
    const iconWidth = Number.isFinite(measuredIconWidth) && measuredIconWidth > 0 ? measuredIconWidth : fallbackIconWidth;
    const iconHidden = endOfGameIcon.getAttribute("display") === "none";
    const iconRight = !iconHidden || iconX > 0 ? iconX + iconWidth : scoreRight + END_OF_GAME_ICON_GAP_MULTIPLIER * multiplicator + iconWidth;
    minNameX = Math.max(minNameX, iconRight + spacing);
  } else if (showsEndOfGameMarker) {
    minNameX = Math.max(minNameX, scoreRight + END_OF_GAME_ICON_GAP_MULTIPLIER * multiplicator + END_OF_GAME_ICON_SIZE_MULTIPLIER * multiplicator + spacing);
  }
  if (showsTimer && timerText) {
    const timerX = parseFloat(timerText.getAttribute("x") || "0") / 100;
    const timerRight = timerX + getSvgTextWidthInBoardUnits(timerText);
    minNameX = Math.max(minNameX, timerRight + spacing);
  }
  return Math.max(0, minNameX - initialX);
}

function updateEndOfGameIcons(multiplicator: number) {
  const iconSize = END_OF_GAME_ICON_SIZE_MULTIPLIER * multiplicator;
  const iconGap = END_OF_GAME_ICON_GAP_MULTIPLIER * multiplicator;
  const updateSingleIcon = (scoreText: SVGElement | undefined, icon: SVGElement | undefined, marker: EndOfGameMarker) => {
    if (!scoreText || !icon || marker === "none" || (scoreText.textContent ?? "") === "") {
      if (icon) {
        SVG.setHidden(icon, true);
      }
      return;
    }
    const iconName: EndOfGameIconName = marker === "victory" ? "victory" : "resign";
    const resolvedUrl = endOfGameIconResolvedUrls[iconName];
    if (icon.getAttribute("data-marker") !== marker) {
      icon.setAttribute("data-marker", marker);
      void SVG.setImageUrl(icon, resolvedUrl || END_OF_GAME_ICON_URLS[iconName]);
    }
    if (!resolvedUrl) {
      void getEndOfGameIconCachedUrl(iconName).then((url) => {
        if (!url) {
          return;
        }
        if (icon.getAttribute("data-marker") === marker) {
          void SVG.setImageUrl(icon, url);
        }
      });
    }
    const scoreX = parseFloat(scoreText.getAttribute("x") || "0") / 100;
    const scoreWidth = getSvgTextWidthInBoardUnits(scoreText);
    const iconX = scoreX + scoreWidth + iconGap;
    let iconY = parseFloat(scoreText.getAttribute("y") || "0") / 100 - iconSize * 0.8;
    try {
      const scoreBounds = (scoreText as unknown as SVGGraphicsElement).getBBox ? (scoreText as unknown as SVGGraphicsElement).getBBox() : null;
      if (scoreBounds && Number.isFinite(scoreBounds.y) && Number.isFinite(scoreBounds.height)) {
        iconY = scoreBounds.y / 100 + (scoreBounds.height / 100 - iconSize) / 2;
      }
    } catch {}
    SVG.setFrame(icon, iconX, iconY, iconSize, iconSize);
    SVG.setHidden(icon, false);
  };

  updateSingleIcon(playerScoreText, playerEndOfGameIcon, playerEndOfGameMarker);
  updateSingleIcon(opponentScoreText, opponentEndOfGameIcon, opponentEndOfGameMarker);
}

function updateNamesX() {
  if (playerNameText === undefined || opponentNameText === undefined) {
    return;
  }
  const multiplicator = getOuterElementsMultiplicator();
  updateEndOfGameIcons(multiplicator);
  const offsetX = seeIfShouldOffsetFromBorders() ? minHorizontalOffset : 0;
  const initialX = offsetX + 1.45 * multiplicator + 0.1;
  const timerDelta = 0.95 * multiplicator;
  const statusDelta = END_OF_GAME_NAME_OFFSET_MULTIPLIER * multiplicator;
  const playerHasEndOfGameMarker = playerEndOfGameMarker !== "none";
  const opponentHasEndOfGameMarker = opponentEndOfGameMarker !== "none";

  const playerStaticDelta = (playerHasEndOfGameMarker ? statusDelta : 0) + (showsPlayerTimer ? timerDelta : 0);
  const opponentStaticDelta = (opponentHasEndOfGameMarker ? statusDelta : 0) + (showsOpponentTimer ? timerDelta : 0);
  const playerDynamicDelta = getDynamicNameDelta(
    initialX,
    playerScoreText,
    playerTimer,
    showsPlayerTimer,
    playerEndOfGameIcon,
    playerHasEndOfGameMarker,
    multiplicator
  );
  const opponentDynamicDelta = getDynamicNameDelta(
    initialX,
    opponentScoreText,
    opponentTimer,
    showsOpponentTimer,
    opponentEndOfGameIcon,
    opponentHasEndOfGameMarker,
    multiplicator
  );

  SVG.setX(playerNameText, initialX + Math.max(playerStaticDelta, playerDynamicDelta));
  SVG.setX(opponentNameText, initialX + Math.max(opponentStaticDelta, opponentDynamicDelta));
}

const updateLayout = () => {
  if (
    !hasSetupBoardRuntime ||
    !opponentScoreText ||
    !playerScoreText ||
    !opponentTimer ||
    !playerTimer ||
    !opponentNameText ||
    !playerNameText ||
    !opponentAvatar ||
    !playerAvatar ||
    !opponentAvatarPlaceholder ||
    !playerAvatarPlaceholder ||
    opponentMoveStatusItems.length < 9 ||
    playerMoveStatusItems.length < 9
  ) {
    return;
  }
  const multiplicator = getOuterElementsMultiplicator();
  const scoreFontSize = SCORE_TEXT_FONT_SIZE_MULTIPLIER * multiplicator;

  let shouldOffsetFromBorders = seeIfShouldOffsetFromBorders();
  const offsetX = shouldOffsetFromBorders ? minHorizontalOffset : 0;

  for (const isOpponent of [true, false]) {
    const avatarSize = getAvatarSize();
    const numberText = isOpponent ? opponentScoreText : playerScoreText;
    const timerText = isOpponent ? opponentTimer : playerTimer;
    const nameText = isOpponent ? opponentNameText : playerNameText;

    const y = isOpponent ? 1 - avatarSize * 1.203 : isPangchiuBoard() ? 12.75 : 12.16;

    SVG.setOrigin(numberText, offsetX + avatarSize * 1.21, y + avatarSize * 0.73);
    SVG.setOrigin(timerText, offsetX + avatarSize * 1.85, y + avatarSize * 0.73);
    SVG.setOrigin(nameText, 0, y + avatarSize * 0.65);

    numberText.setAttribute("font-size", scoreFontSize.toString());
    timerText.setAttribute("font-size", scoreFontSize.toString());
    nameText.setAttribute("font-size", (32 * multiplicator).toString());

    const statusItemsOffsetX = shouldOffsetFromBorders ? 0.21 * multiplicator : 0;
    const statusItemsY = y + avatarSize * (isOpponent ? 0.23 : 0.1);
    const statusItemSize = 0.5 * multiplicator;

    for (let x = 0; x < 9; x++) {
      const img = isOpponent ? opponentMoveStatusItems[x] : playerMoveStatusItems[x];
      SVG.setFrame(img, 11 - (1.15 * x + 1) * statusItemSize - statusItemsOffsetX, statusItemsY, statusItemSize, statusItemSize);
    }

    const avatar = isOpponent ? opponentAvatar : playerAvatar;
    SVG.setFrame(avatar, offsetX, y, avatarSize, avatarSize);
    try {
      updateAuraForAvatarElement(isOpponent, avatar);
    } catch {}

    const placeholder = isOpponent ? opponentAvatarPlaceholder : playerAvatarPlaceholder;
    SVG.updateCircle(placeholder, offsetX + avatarSize / 2, y + avatarSize / 2, avatarSize / 3);
  }

  if (inviteBotButtonContainer && inviteBotButtonElement && opponentScoreText) {
    const avatarSize = getAvatarSize();
    const layout = getInviteBotButtonLayout(opponentScoreText, multiplicator, avatarSize);
    SVG.setFrame(inviteBotButtonContainer, layout.x, layout.y, layout.width, layout.height);
    inviteBotButtonElement.style.fontSize = `${layout.fontSizePx}px`;
    inviteBotButtonElement.style.borderRadius = "999px";
    inviteBotButtonElement.style.paddingLeft = `${layout.horizontalPaddingPx}px`;
    inviteBotButtonElement.style.paddingRight = `${layout.horizontalPaddingPx}px`;
  }

  if (instructionsContainerElement && talkingDude) {
    const dudeBaseI = -0.3;
    const dudeBaseJ = -0.23;
    const narrowShiftFactor = 0.5;
    const narrowRightShift = shouldOffsetFromBorders ? narrowShiftFactor * minHorizontalOffset : 0;
    const location = new Location(dudeBaseI, dudeBaseJ + narrowRightShift);
    setCenterTranformOrigin(talkingDude, location);
    SVG.setOrigin(talkingDude, location.j, location.i);
    talkingDude.setAttribute("data-base-x", (location.j * 100).toString());
    talkingDude.setAttribute("data-base-y", (location.i * 100).toString());

    const instructionsRightMargin = shouldOffsetFromBorders ? 0.28 * multiplicator : 0;
    const instructionsWidth = 10 - narrowRightShift - instructionsRightMargin;
    SVG.setFrame(instructionsContainerElement, 11 - instructionsWidth - instructionsRightMargin, 0, instructionsWidth, 0.85);

    if (instructionsCloudBg) {
      const cloudX = (11 - instructionsWidth - instructionsRightMargin) * 100;
      const cloudY = 2.3;
      const cloudW = instructionsWidth * 100;
      const cloudH = 0.77 * 100;
      instructionsCloudBg.setAttribute("d", generateCloudPath(cloudX, cloudY, cloudW, cloudH));
    }

    updateSpriteSheetClipRect(talkingDude);
  }

  updateWagerLayout();
  updateNamesX();
};

export function showDebugWagerPiles(material: MaterialName, count: number, materialUrl?: string | null) {
  cancelWagerWinAnimation();
  winnerPileActive = false;
  const playerPile = ensureWagerPile(false);
  const opponentPile = ensureWagerPile(true);
  if (!playerPile || !opponentPile) {
    return;
  }
  if (winnerWagerPile) {
    winnerWagerPile.count = 0;
    winnerWagerPile.actualCount = 0;
    winnerWagerPile.frames = [];
    winnerWagerPile.rect = null;
  }
  syncWagerPileIcons(playerPile, material, count, materialUrl);
  syncWagerPileIcons(opponentPile, material, count, materialUrl);
  updateWagerLayout();
}

function resetWagerPile(pile: WagerPile | null) {
  if (!pile) {
    return;
  }
  pile.positions = [];
  pile.frames = [];
  pile.material = null;
  pile.materialUrl = null;
  pile.count = 0;
  pile.actualCount = 0;
  pile.rect = null;
  pile.iconSize = 0;
}

export function resetWagerAnimationState() {
  wagerAnimationsReady = false;
  previousPlayerPileVisible = false;
  previousOpponentPileVisible = false;
  lastVisiblePlayerPileState = null;
  lastVisibleOpponentPileState = null;
  clearDisappearingPile("player");
  clearDisappearingPile("opponent");
}

export function markWagerInitialStateReceived() {
  wagerAnimationsReady = true;
}

export function clearWagerPiles() {
  cancelWagerWinAnimation();
  winnerPileActive = false;
  playerPilePending = false;
  opponentPilePending = false;
  resetWagerPile(playerWagerPile);
  resetWagerPile(opponentWagerPile);
  resetWagerPile(winnerWagerPile);
  emitWagerRenderState();
}

export function clearWagerPilesForNewMatch() {
  resetWagerAnimationState();
  clearWagerPiles();
}

export function setWagerPiles(state: {
  player?: { material: MaterialName; count: number; pending?: boolean } | null;
  opponent?: { material: MaterialName; count: number; pending?: boolean } | null;
}) {
  cancelWagerWinAnimation();
  winnerPileActive = false;
  if (state.player) {
    const playerPile = ensureWagerPile(false);
    if (playerPile) {
      syncWagerPileIcons(playerPile, state.player.material, state.player.count);
    }
    playerPilePending = state.player.pending ?? false;
  } else {
    resetWagerPile(playerWagerPile);
    playerPilePending = false;
  }
  if (state.opponent) {
    const opponentPile = ensureWagerPile(true);
    if (opponentPile) {
      syncWagerPileIcons(opponentPile, state.opponent.material, state.opponent.count);
    }
    opponentPilePending = state.opponent.pending ?? false;
  } else {
    resetWagerPile(opponentWagerPile);
    opponentPilePending = false;
  }
  resetWagerPile(winnerWagerPile);
  updateWagerLayout();
}

export function showResolvedWager(winnerIsOpponent: boolean, material: MaterialName, countPerSide: number, animate: boolean) {
  logBoardWagerDebug("show-resolved:start", { winnerIsOpponent, material, countPerSide, animate });
  const playerPile = ensureWagerPile(false);
  const opponentPile = ensureWagerPile(true);
  if (!playerPile || !opponentPile) {
    logBoardWagerDebug("show-resolved:skip-no-piles");
    return;
  }
  cancelWagerWinAnimation();
  winnerPileActive = false;
  syncWagerPileIcons(playerPile, material, countPerSide);
  syncWagerPileIcons(opponentPile, material, countPerSide);
  updateWagerLayout();
  lastWagerWinnerIsOpponent = winnerIsOpponent;
  if (animate && startWagerWinAnimation(winnerIsOpponent)) {
    logBoardWagerDebug("show-resolved:started-win-animation");
    return;
  }
  const winnerPile = ensureWinnerWagerPile();
  if (!winnerPile) {
    logBoardWagerDebug("show-resolved:skip-no-winner-pile");
    return;
  }
  const total = Math.max(0, countPerSide * 2);
  syncWagerPileIcons(winnerPile, material, total, null, MAX_WAGER_WIN_PILE_ITEMS);
  winnerPileActive = true;
  logBoardWagerDebug("show-resolved:show-winner-pile", { winnerCount: winnerPile.count, total });
  updateWagerLayout();
}

function doNotShowAvatarPlaceholderAgain(opponent: boolean) {
  if (opponent) {
    doNotShowOpponentAvatarPlaceholderAgain = true;
  } else {
    doNotShowPlayerAvatarPlaceholderAgain = true;
  }
}

export async function setupGameInfoElements(allHiddenInitially: boolean) {
  const runtimeToken = boardRuntimeToken;
  const statusMove = loadImage(emojis.statusMove, "statusMoveEmoji");
  preloadEndOfGameIcons();
  if (!didRegisterResizeHandler) {
    window.addEventListener("resize", updateLayout);
    didRegisterResizeHandler = true;
    incrementLifecycleCounter("boardDomListeners");
  }

  let playerEmojiId = storage.getPlayerEmojiId("");
  if (playerEmojiId === "") {
    playerEmojiId = emojis.getRandomEmojiId();
    storage.setPlayerEmojiId(playerEmojiId);
  }

  const playerEmojiUrl = emojis.getEmojiUrl(playerEmojiId);
  const [opponentEmojiId, opponentEmojiUrl] = emojis.getRandomEmojiUrlOtherThan(playerEmojiId, true);

  playerSideMetadata.emojiId = playerEmojiId;
  opponentSideMetadata.emojiId = opponentEmojiId;

  for (const isOpponent of [true, false]) {
    const numberText = document.createElementNS(SVG.ns, "text");
    SVG.setFill(numberText, colors.scoreText);
    SVG.setOpacity(numberText, 0.69);
    numberText.setAttribute("font-weight", "600");
    numberText.setAttribute("overflow", "visible");
    numberText.textContent = allHiddenInitially ? "" : "0";
    controlsLayer?.append(numberText);
    if (isOpponent) {
      opponentScoreText = numberText;
    } else {
      playerScoreText = numberText;
    }

    const endOfGameIcon = document.createElementNS(SVG.ns, "image");
    SVG.setHidden(endOfGameIcon, true);
    SVG.setOpacity(endOfGameIcon, END_OF_GAME_ICON_OPACITY);
    endOfGameIcon.setAttribute("overflow", "visible");
    endOfGameIcon.setAttribute("pointer-events", "none");
    controlsLayer?.append(endOfGameIcon);
    if (isOpponent) {
      opponentEndOfGameIcon = endOfGameIcon;
    } else {
      playerEndOfGameIcon = endOfGameIcon;
    }

    const timerText = document.createElementNS(SVG.ns, "text");
    SVG.setFill(timerText, "green");
    SVG.setOpacity(timerText, 0.69);
    timerText.setAttribute("font-weight", "600");
    timerText.textContent = "";
    timerText.setAttribute("overflow", "visible");
    controlsLayer?.append(timerText);
    if (isOpponent) {
      opponentTimer = timerText;
    } else {
      playerTimer = timerText;
    }

    const nameText = document.createElementNS(SVG.ns, "text");
    SVG.setFill(nameText, colors.scoreText);
    SVG.setOpacity(nameText, 0.69);
    nameText.setAttribute("font-weight", "270");
    nameText.setAttribute("font-style", "italic");
    nameText.style.cursor = "pointer";
    nameText.setAttribute("overflow", "visible");
    controlsLayer?.append(nameText);

    nameText.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!isOpponent && !isWatchOnly) {
        return;
      }

      if (canRedirectToExplorer(isOpponent) && didNotDismissAnythingWithOutsideTapJustNow()) {
        redirectToAddressOnExplorer(isOpponent);
        SVG.setFill(nameText, colors.scoreText);
      }
    });

    nameText.addEventListener("mouseenter", () => {
      if (!isOpponent && !isWatchOnly) {
        return;
      }

      if (canRedirectToExplorer(isOpponent)) {
        SVG.setFill(nameText, "#0071F9");
      }
    });

    nameText.addEventListener("mouseleave", () => {
      SVG.setFill(nameText, colors.scoreText);
    });

    nameText.addEventListener("touchend", () => {
      setManagedBoardTimeout(() => {
        SVG.setFill(nameText, colors.scoreText);
      }, 100);
    });

    if (isOpponent) {
      opponentNameText = nameText;
    } else {
      playerNameText = nameText;
    }

    for (let x = 0; x < 9; x++) {
      const img = statusMove.cloneNode() as SVGElement;
      controlsLayer?.appendChild(img);

      if (isOpponent) {
        opponentMoveStatusItems.push(img);
      } else {
        playerMoveStatusItems.push(img);
      }

      const isActiveSide = isFlipped ? isOpponent : !isOpponent;
      if (isActiveSide) {
        if (allHiddenInitially || x > 4) {
          SVG.setHidden(img, true);
        }
      } else {
        SVG.setHidden(img, true);
      }
    }

    const avatar = loadImage("", "nonGame");
    const placeholder = SVG.circle(0, 0, 1);
    SVG.setFill(placeholder, colors.scoreText);
    SVG.setOpacity(placeholder, 0.23);
    const emojiUrl = isOpponent ? opponentEmojiUrl : playerEmojiUrl;
    SVG.setImageUrl(avatar, emojiUrl);
    if (isOpponent) {
      opponentSideMetadata.aura = opponentSideMetadata.aura ?? "";
    } else {
      playerSideMetadata.aura = storage.getPlayerEmojiAura("") ?? "";
    }
    const shouldShowAura = (isOpponent ? opponentSideMetadata.aura : playerSideMetadata.aura) === "rainbow";
    showRaibowAura(shouldShowAura, emojiUrl, isOpponent);
    try {
      updateAuraForAvatarElement(isOpponent, avatar);
    } catch {}
    avatar.onload = () => {
      if (!isBoardRuntimeTokenActive(runtimeToken) || !avatar.isConnected) {
        return;
      }
      SVG.setHidden(placeholder, true);
      doNotShowAvatarPlaceholderAgain(isOpponent);
    };
    avatar.style.pointerEvents = "auto";
    controlsLayer?.append(placeholder);
    controlsLayer?.append(avatar);
    if (isOpponent) {
      opponentAvatar = avatar;
      opponentAvatarPlaceholder = placeholder;
    } else {
      playerAvatar = avatar;
      playerAvatarPlaceholder = placeholder;
    }

    if (allHiddenInitially) {
      SVG.setHidden(avatar, true);
      SVG.setHidden(placeholder, true);
    }

    avatar.addEventListener(defaultInputEventName, (event) => {
      soundPlayer.initializeOnUserInteraction(false);
      event.stopPropagation();
      preventTouchstartIfNeeded(event);
      playSounds([Sound.Click]);
      const shouldChangeEmoji = canChangeEmoji(isOpponent);

      if (isOpponent) {
        if (shouldChangeEmoji) {
          pickAndDisplayDifferentEmoji(avatar, isOpponent);
        }

        popOpponentsEmoji();
      } else {
        if (shouldChangeEmoji) {
          pickAndDisplayDifferentEmoji(avatar, isOpponent);
        }

        if (isDesktopSafari) {
          const scale = 1.8;
          const sizeString = (getAvatarSize() * 100).toString();
          const newSizeString = (getAvatarSize() * 100 * scale).toString();

          avatar.animate(
            [
              {
                width: sizeString,
                height: sizeString,
                transform: "translate(0, 0)",
                easing: "ease-out",
              },
              {
                width: newSizeString,
                height: newSizeString,
                transform: `translate(0px, -${getAvatarSize() * 100}pt)`,
                easing: "ease-in-out",
              },
              {
                width: sizeString,
                height: sizeString,
                transform: "translate(0, 0)",
                easing: "ease-in",
              },
            ],
            {
              duration: 420,
              fill: "forwards",
            }
          );
        } else {
          avatar.style.transformOrigin = `0px ${isPangchiuBoard() ? 1369 : 1300}px`;
          avatar.style.transform = "scale(1.8)";
          avatar.style.transition = "transform 0.3s";
          setManagedBoardTimeout(() => {
            avatar.style.transform = "scale(1)";
          }, 300);
        }
      }
    });
  }

  setupInviteBotButton();
  updateLayout();

  if (!allHiddenInitially) {
    renderPlayersNamesLabels();
  }
}

function pickAndDisplayDifferentEmoji(avatar: SVGElement, isOpponent: boolean) {
  if (isOpponent) {
    const [newId, newEmojiUrl] = emojis.getRandomEmojiUrlOtherThan(opponentSideMetadata.emojiId, true);
    opponentSideMetadata.emojiId = newId;
    SVG.setImageUrl(avatar, newEmojiUrl);
    const visible = (opponentSideMetadata.aura ?? "") === "rainbow";
    showRaibowAura(visible, newEmojiUrl, true);
  } else {
    const [newId, newEmojiUrl] = emojis.getRandomEmojiUrlOtherThan(playerSideMetadata.emojiId, false);
    didClickAndChangePlayerEmoji(newId, newEmojiUrl);
  }
}

export function didClickAndChangePlayerEmoji(newId: string, newEmojiUrl: string, aura?: string) {
  storage.setPlayerEmojiId(newId);
  if (aura !== undefined) {
    storage.setPlayerEmojiAura(aura);
  }
  sendPlayerEmojiUpdate(parseInt(newId), aura);

  if (!isWatchOnly) {
    playerSideMetadata.emojiId = newId;
    if (aura !== undefined) {
      playerSideMetadata.aura = aura;
    }
    if (playerAvatar) {
      SVG.setImageUrl(playerAvatar, newEmojiUrl);
      const visible = (aura ?? storage.getPlayerEmojiAura("") ?? "") === "rainbow";
      showRaibowAura(visible, newEmojiUrl, false);
      try {
        updateAuraForAvatarElement(false, playerAvatar);
      } catch {}
    }
  }
}

export function setupBoard() {
  if (hasSetupBoardRuntime) {
    disposeBoardRuntime();
  }
  boardRuntimeToken += 1;
  clearVoiceReactionState();
  opponentSideMetadata.emojiId = "";
  opponentSideMetadata.aura = "";
  initializeBoardElements();
  boardInputHandler = (event: Event) => {
    const hasVisiblePopups = hasIslandOverlayVisible() || hasMainMenuPopupsVisible() || hasBottomPopupsVisible() || hasProfilePopupVisible() || hasNavigationPopupVisible() || showsShinyCardSomewhere;
    const didDismissSmth = !didNotDismissAnythingWithOutsideTapJustNow();
    if (didDismissSmth || hasVisiblePopups) {
      if (!hasVisiblePopups && didDismissSmth) {
        resetOutsideTapDismissTimeout();
      }
      return;
    }

    const target = event.target as SVGElement;
    if (target && target.nodeName === "rect" && target.classList.contains("board-rect")) {
      const rawX = parseInt(target.getAttribute("x") || "-100") / 100;
      const rawY = parseInt(target.getAttribute("y") || "-100") / 100;

      const x = isFlipped ? 10 - rawX : rawX;
      const y = isFlipped ? 10 - rawY : rawY;

      didClickSquare(new Location(y, x));
      event.preventDefault();
      event.stopPropagation();
    } else if (!target.closest("a, button, select, [data-notification-banner='true']")) {
      hideItemSelectionOrConfirmationOverlay();
      didClickSquare(new Location(-1, -1));
      event.preventDefault();
      event.stopPropagation();
    }
  };
  document.addEventListener(defaultInputEventName, boardInputHandler);
  incrementLifecycleCounter("boardDomListeners");
  hasSetupBoardRuntime = true;

  for (let y = 0; y < 11; y++) {
    for (let x = 0; x < 11; x++) {
      const rect = document.createElementNS(SVG.ns, "rect");
      SVG.setFrame(rect, x, y, 1, 1);
      SVG.setFill(rect, "transparent");
      rect.classList.add("board-rect");
      itemsLayer?.appendChild(rect);
    }
  }

  refreshWaves();

  const preloadTimeout = window.setTimeout(() => {
    boardTimeoutIds.delete(preloadTimeout);
    decrementLifecycleCounter("boardTimeouts");
    preloadParticleEffects().catch(console.error);
  }, 100);
  trackBoardTimeout(preloadTimeout);
}

export function disposeBoardRuntime() {
  boardRuntimeToken += 1;
  stopMonsBoardAsDisplayAnimations();
  hideTimerCountdownDigits();
  cancelWagerWinAnimation();
  stopConfetti();
  if (talkingDude) {
    removeItemAndCleanUpAnimation(talkingDude);
    talkingDude = null;
  }
  talkingDudeTextDiv = null;
  instructionsContainerElement = undefined;
  instructionsCloudBg = null;
  talkingDudeIsTalking = true;
  currentTextAnimation.isAnimating = false;
  currentTextAnimation.fastForwardCallback = null;
  clearWagerPilesForNewMatch();
  clearWavesIntervals();
  clearSparkleIntervals();
  clearTrackedBoardTimeouts();
  clearTrackedBoardRafs();
  if (currentTextAnimation.timer) {
    clearTimeout(currentTextAnimation.timer);
    currentTextAnimation.timer = null;
    decrementLifecycleCounter("boardTimeouts");
  }
  if (disappearingPileTimers.player !== null) {
    clearTimeout(disappearingPileTimers.player);
    disappearingPileTimers.player = null;
    decrementLifecycleCounter("boardTimeouts");
  }
  if (disappearingPileTimers.opponent !== null) {
    clearTimeout(disappearingPileTimers.opponent);
    disappearingPileTimers.opponent = null;
    decrementLifecycleCounter("boardTimeouts");
  }
  if (cleanupInviteBotButtonThemeListener) {
    cleanupInviteBotButtonThemeListener();
    cleanupInviteBotButtonThemeListener = null;
  }
  if (didRegisterResizeHandler) {
    window.removeEventListener("resize", updateLayout);
    didRegisterResizeHandler = false;
    decrementLifecycleCounter("boardDomListeners");
  }
  if (boardInputHandler) {
    document.removeEventListener(defaultInputEventName, boardInputHandler);
    boardInputHandler = null;
    decrementLifecycleCounter("boardDomListeners");
  }
  hasSetupBoardRuntime = false;
  removeHighlights();
  cleanAllPixels();
  if (dimmingOverlay) {
    dimmingOverlay.remove();
    dimmingOverlay = undefined;
  }
  hideItemSelectionOrConfirmationOverlay();
  if (itemsLayer) {
    itemsLayer.innerHTML = "";
  }
  if (controlsLayer) {
    controlsLayer.innerHTML = "";
  }
  if (effectsLayer) {
    effectsLayer.innerHTML = "";
  }
  if (highlightsLayer) {
    highlightsLayer.innerHTML = "";
  }
  if (board) {
    const overlays = Array.from(board.querySelectorAll('[data-wager-pile], [data-wager-win-pile], [data-grid-board-only]'));
    overlays.forEach((element) => element.remove());
  }
  opponentMoveStatusItems.length = 0;
  playerMoveStatusItems.length = 0;
  doNotShowPlayerAvatarPlaceholderAgain = false;
  doNotShowOpponentAvatarPlaceholderAgain = false;
  opponentAvatar = undefined;
  playerAvatar = undefined;
  opponentAvatarPlaceholder = undefined;
  playerAvatarPlaceholder = undefined;
  opponentScoreText = undefined;
  inviteBotButtonContainer = undefined;
  inviteBotButtonElement = undefined;
  playerScoreText = undefined;
  opponentEndOfGameIcon = undefined;
  playerEndOfGameIcon = undefined;
  opponentEndOfGameMarker = "none";
  playerEndOfGameMarker = "none";
  opponentNameText = undefined;
  playerNameText = undefined;
  opponentTimer = undefined;
  playerTimer = undefined;
  controlsLayer = null;
  itemsLayer = null;
  effectsLayer = null;
  highlightsLayer = null;
  boardBackgroundLayer = null;
  board = null;
}

export function removeHighlights() {
  while (highlightsLayer?.firstChild) {
    highlightsLayer.removeChild(highlightsLayer.firstChild);
  }
}

export function applyHighlights(highlights: Highlight[]) {
  highlights.forEach((highlight) => {
    switch (highlight.kind) {
      case HighlightKind.Selected:
        highlightSelectedItem(highlight.location, highlight.color);
        break;
      case HighlightKind.EmptySquare:
        highlightEmptyDestination(highlight.location, highlight.color, false);
        break;
      case HighlightKind.TargetSuggestion:
        highlightDestinationItem(highlight.location, highlight.color, false);
        break;
      case HighlightKind.StartFromSuggestion:
        highlightStartFromSuggestion(highlight.location, highlight.color);
        break;
    }
  });
}

export function popOpponentsEmoji() {
  if (!opponentAvatar) {
    return;
  }

  opponentAvatar.style.transition = "transform 0.3s";
  opponentAvatar.style.transform = "scale(1.8)";
  setManagedBoardTimeout(() => {
    if (!opponentAvatar) return;
    opponentAvatar.style.transform = "scale(1)";
  }, 300);
}

export function drawTrace(trace: Trace) {
  const from = inBoardCoordinates(trace.from);
  const to = inBoardCoordinates(trace.to);

  const gradient = document.createElementNS(SVG.ns, "linearGradient");
  gradient.setAttribute("id", `trace-gradient-${from.toString()}-${to.toString()}`);
  const colors = getTraceColors();

  const stop1 = document.createElementNS(SVG.ns, "stop");
  stop1.setAttribute("offset", "0%");
  stop1.setAttribute("stop-color", colors[1]);
  gradient.appendChild(stop1);

  const stop2 = document.createElementNS(SVG.ns, "stop");
  stop2.setAttribute("offset", "100%");
  stop2.setAttribute("stop-color", colors[0]);
  gradient.appendChild(stop2);
  board?.appendChild(gradient);

  const rect = document.createElementNS(SVG.ns, "rect");
  const fromCenter = { x: from.j + 0.5, y: from.i + 0.5 };
  const toCenter = { x: to.j + 0.5, y: to.i + 0.5 };
  const dx = toCenter.x - fromCenter.x;
  const dy = toCenter.y - fromCenter.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const transform = `translate(${fromCenter.x * 100},${fromCenter.y * 100}) rotate(${angle})`;

  SVG.setFrame(rect, 0, -0.1, length, isPangchiuBoard() ? 0.23 : 0.2);
  rect.setAttribute("transform", transform);

  SVG.setFill(rect, `url(#trace-gradient-${from.toString()}-${to.toString()})`);
  board?.append(rect);

  const fadeOut = rect.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration: 2000,
    easing: isPangchiuBoard() ? "ease-in" : "ease-out",
  });

  fadeOut.onfinish = () => {
    rect.remove();
    gradient.remove();
  };
}

export function hasBasePlaceholder(location: Location): boolean {
  location = inBoardCoordinates(location);
  const key = location.toString();
  return basesPlaceholders.hasOwnProperty(key);
}

function placeMonWithBomb(item: SVGElement, location: Location, baseItemKind: ItemKind) {
  location = inBoardCoordinates(location);
  const img = item.cloneNode(true) as SVGElement;
  SVG.setOrigin(img, location.j, location.i);

  const carriedBomb = bomb.cloneNode(true) as SVGElement;
  SVG.setFrame(carriedBomb, location.j + 0.54, location.i + 0.52, 0.5, 0.5);

  const container = document.createElementNS(SVG.ns, "g");
  container.appendChild(img);
  container.appendChild(carriedBomb);

  addElementToItemsLayer(container, location.i);
  items[location.toString()] = container;
  startAnimation(img);
}

function placeMonWithSupermana(item: SVGElement, location: Location, baseItemKind: ItemKind) {
  location = inBoardCoordinates(location);
  const img = item.cloneNode(true) as SVGElement;
  SVG.setOrigin(img, location.j, location.i);

  const carriedMana = supermanaSimple.cloneNode(true) as SVGElement;
  if (item.getAttribute("data-is-sprite-sheet") === "true") {
    SVG.setFrame(carriedMana, location.j + 0.13, location.i - 0.11, 0.74, 0.74);
  } else {
    SVG.setFrame(carriedMana, location.j + 0.14, location.i - 0.11, 0.72, 0.72);
  }

  const container = document.createElementNS(SVG.ns, "g");
  container.appendChild(img);
  container.appendChild(carriedMana);

  addElementToItemsLayer(container, location.i);
  items[location.toString()] = container;
  startAnimation(img);

  if (isPangchiuBoard()) {
    SVG.setFrame(carriedMana, location.j + 0.06, location.i - 0.33, 0.88, 0.88);
  }
}

function placeMonWithMana(item: SVGElement, mana: SVGElement, location: Location, baseItemKind: ItemKind) {
  location = inBoardCoordinates(location);
  const img = item.cloneNode(true) as SVGElement;
  SVG.setOrigin(img, location.j, location.i);

  const carriedMana = mana.cloneNode(true) as SVGElement;
  SVG.setFrame(carriedMana, location.j + 0.35, location.i + 0.27, 0.93, 0.93);

  const container = document.createElementNS(SVG.ns, "g");
  container.appendChild(img);
  container.appendChild(carriedMana);

  addElementToItemsLayer(container, location.i);
  items[location.toString()] = container;
  startAnimation(img);

  if (isPangchiuBoard()) {
    SVG.setFrame(carriedMana, location.j + 0.35, location.i + 0.27, 1, 1);
  }
}

function setCenterTranformOrigin(item: SVGElement, location: Location) {
  const centerX = location.j * 100 + 50;
  const centerY = location.i * 100 + 50;
  item.style.transformOrigin = `${centerX}px ${centerY}px`;
}

function placeItem(item: SVGElement, location: Location, kind: ItemKind, fainted = false, sparkles = false) {
  const logicalLocation = location;
  location = inBoardCoordinates(location);
  const key = location.toString();
  if (hasBasePlaceholder(logicalLocation)) {
    SVG.setHidden(basesPlaceholders[key], true);
  }
  const img = item.cloneNode(true) as SVGElement;
  setCenterTranformOrigin(img, location);

  if (fainted) {
    SVG.setOrigin(img, location.j, location.i);
    const div = img.firstChild as HTMLDivElement;
    const bgUrl = div.style.backgroundImage.slice(4, -1).replace(/"/g, "");
    const cachedRotated = rotatedItemImageCache.get(kind);
    if (cachedRotated) {
      div.style.backgroundImage = `url(${cachedRotated})`;
    } else {
      div.style.backgroundImage = "none";
      const imgElem = new Image();
      imgElem.src = bgUrl;
      imgElem.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = imgElem.height;
        canvas.height = imgElem.width;
        const ctx = canvas.getContext("2d");
        ctx!.translate(canvas.width / 2, canvas.height / 2);
        ctx!.rotate((90 * Math.PI) / 180);
        ctx!.drawImage(imgElem, -imgElem.width / 2, -imgElem.height / 2);
        const rotatedData = canvas.toDataURL("image/webp");
        rotatedItemImageCache.set(kind, rotatedData);
        div.style.backgroundImage = `url(${rotatedData})`;
      };
    }
    addElementToItemsLayer(img, location.i);
    items[key] = img;
  } else if (sparkles) {
    const container = document.createElementNS(SVG.ns, "g");
    const sparkles = createSparklingContainer(location);
    SVG.setOrigin(img, location.j, location.i);
    container.appendChild(sparkles);
    container.appendChild(img);
    addElementToItemsLayer(container, location.i);
    items[key] = container;
  } else {
    SVG.setOrigin(img, location.j, location.i);
    addElementToItemsLayer(img, location.i);
    items[key] = img;
  }
  startAnimation(img, fainted, fainted);
}

function createSparklingContainer(location: Location): SVGElement {
  const container = document.createElementNS(SVG.ns, "g");
  container.setAttribute("class", "item");
  container.setAttribute("data-grid-board-only", "true");
  SVG.setHidden(container, isCustomPictureBoardEnabled());

  const mask = document.createElementNS(SVG.ns, "mask");
  mask.setAttribute("id", `mask-square-${location.toString()}`);

  const rect = document.createElementNS(SVG.ns, "rect");
  SVG.setFrame(rect, location.j, location.i, 1, 1);
  SVG.setFill(rect);

  mask.appendChild(rect);
  container.appendChild(mask);
  container.setAttribute("mask", `url(#mask-square-${location.toString()})`);

  if (currentAssetsSet === AssetsSet.Pixel) {
    const intervalId = window.setInterval(() => {
      if (!container.parentNode?.parentNode) {
        clearTrackedSparkleInterval(intervalId);
        return;
      }
      createSparkleParticle(location, container);
    }, 230);
    trackSparkleInterval(intervalId);
  } else {
    for (let i = 0; i < 2; i++) {
      createSmoothSparkleParticle(location, container);
    }
    const intervalId = window.setInterval(() => {
      if (!container.parentNode?.parentNode) {
        clearTrackedSparkleInterval(intervalId);
        return;
      }
      createSmoothSparkleParticle(location, container);
    }, 230);
    trackSparkleInterval(intervalId);
  }

  return container;
}

function createSmoothSparkleParticle(location: Location, container: SVGElement) {
  const particle = smoothSparkle.cloneNode(true) as SVGElement;
  const y = location.i + Math.random();
  const size = Math.random() * 0.05 + 0.075;
  const opacity = 0.45 + 0.4 * Math.random();
  SVG.setFrame(particle, location.j + Math.random(), y, size, size);
  SVG.setOpacity(particle, opacity);
  container.appendChild(particle);

  const velocity = (4 + 2 * Math.random()) * 0.01;
  const duration = Math.random() * 1000 + 2500;
  animateSparkleParticle(container, particle, y, opacity, velocity, duration);
}

function createSparkleParticle(location: Location, container: SVGElement, animating: boolean = true) {
  const particle = sparkle.cloneNode(true) as SVGElement;
  const y = location.i + Math.random();
  const size = Math.random() * 0.05 + 0.075;
  const opacity = 0.3 + 0.42 * Math.random();
  SVG.setFrame(particle, location.j + Math.random(), y, size, size);
  SVG.setOpacity(particle, opacity);
  container.appendChild(particle);

  if (!animating) {
    return;
  }

  const velocity = (4 + 2 * Math.random()) * 0.01;
  const duration = Math.random() * 1000 + 2500;
  animateSparkleParticle(container, particle, y, opacity, velocity, duration);
}

function animateSparkleParticle(container: SVGElement, particle: SVGElement, y: number, opacity: number, velocity: number, duration: number) {
  let startTime: number | null = null;

  function animateParticle(time: number) {
    if (!startTime) {
      startTime = time;
    }

    let timeDelta = time - startTime;
    let progress = timeDelta / duration;
    if (progress > 1) {
      if (particle.parentNode === container) {
        container.removeChild(particle);
      }
      return;
    }

    particle.setAttribute("y", ((y - (velocity * timeDelta) / 1000) * 100).toString());
    SVG.setOpacity(particle, Math.max(0, opacity - (0.15 * timeDelta) / 1000));
    setManagedBoardRaf(animateParticle);
  }

  setManagedBoardRaf(animateParticle);
}

function setBase(item: SVGElement, location: Location) {
  const logicalLocation = location;
  location = inBoardCoordinates(location);
  const key = location.toString();
  const isSpriteSheet = item.getAttribute("data-is-sprite-sheet") === "true";
  const sourceChild = item.children[0] as HTMLElement | undefined;
  const sourceBackgroundImage = sourceChild?.style.backgroundImage ?? "";
  const baseSignature = [
    sourceBackgroundImage,
    isSpriteSheet ? "sprite" : "static",
    item.getAttribute("data-total-frames") ?? "",
    item.getAttribute("data-frame-duration") ?? "",
  ].join("|");
  if (hasBasePlaceholder(logicalLocation)) {
    const existing = basesPlaceholders[key];
    const existingSignature = existing?.getAttribute("data-base-signature") ?? "";
    if (existing && existingSignature === baseSignature) {
      SVG.setHidden(existing, false);
      return;
    }
    if (existing) {
      removeItemAndCleanUpAnimation(existing);
      delete basesPlaceholders[key];
    }
  }
  if (!hasBasePlaceholder(logicalLocation)) {
    let img: SVGElement;
    if (!isCustomPictureBoardEnabled()) {
      img = item.cloneNode(true) as SVGElement;
      const firstChild = img.children[0] as HTMLElement;
      firstChild.style.backgroundBlendMode = "saturation";
      firstChild.style.backgroundColor = ((location.i + location.j) % 2 === 0 ? colors.lightSquare : colors.darkSquare) + "85";
    } else {
      img = document.createElementNS(SVG.ns, "image");
      SVG.setOpacity(img, 0.5);
      if (currentAssetsSet === AssetsSet.Pixel || isSpriteSheet) {
        img.style.imageRendering = "pixelated";
      }
      const firstChild = item.children[0] as HTMLElement;
      img.setAttribute("href", firstChild.style.backgroundImage.slice(5, -2));

      if (isSpriteSheet) {
        img.setAttribute("data-is-sprite-sheet", "true");
        img.setAttribute("data-total-frames", item.getAttribute("data-total-frames") || "4");
        img.setAttribute("data-frame-duration", item.getAttribute("data-frame-duration") || "169");
      }
    }

    if (isSpriteSheet) {
      img.setAttribute("data-frame-width", "0.6");
      img.setAttribute("data-frame-height", "0.6");
      SVG.setFrame(img, location.j + 0.2, location.i + 0.2, 0.6 * 4, 0.6);
    } else {
      SVG.setFrame(img, location.j + 0.2, location.i + 0.2, 0.6, 0.6);
    }

    img.setAttribute("data-base-signature", baseSignature);
    board?.appendChild(img);
    basesPlaceholders[key] = img;

    if (isSpriteSheet) {
      startAnimation(img, true);
    }
  } else {
    SVG.setHidden(basesPlaceholders[key], false);
  }
}

function startBlinking(element: SVGElement) {
  const fadeDuration = 450;
  const delayBetween = 450;
  element.style.opacity = "0";
  element.style.transition = `opacity ${fadeDuration}ms`;

  function blinkCycle() {
    if (!element.parentNode) return;
    setManagedBoardRaf(() => {
      element.style.opacity = "1";
    });

    setManagedBoardTimeout(() => {
      if (!element.parentNode) return;
      element.style.transition = "";
      element.style.opacity = "0";
      element.style.transition = `opacity ${fadeDuration}ms`;
      setManagedBoardTimeout(() => {
        if (!element.parentNode) return;
        blinkCycle();
      }, delayBetween);
    }, fadeDuration);
  }
  setManagedBoardTimeout(() => {
    blinkCycle();
  }, 0);
}

function highlightEmptyDestination(location: Location, color: string, blinking: boolean) {
  location = inBoardCoordinates(location);
  let highlight: SVGElement;

  if (isPangchiuBoard()) {
    highlight = document.createElementNS(SVG.ns, "rect");
    const side = 0.27;
    const originOffset = (1 - side) * 0.5;
    SVG.setFrame(highlight, location.j + originOffset, location.i + originOffset, side, side);
    highlight.setAttribute("rx", "7");
    highlight.setAttribute("ry", "7");
    if (!blinking) {
      setHighlightBlendMode(highlight);
    }
  } else {
    highlight = SVG.circle(location.j + 0.5, location.i + 0.5, 0.15);
  }

  highlight.style.pointerEvents = "none";
  SVG.setFill(highlight, color);
  highlightsLayer?.append(highlight);

  if (blinking) {
    startBlinking(highlight);
  }
}

function showEndOfTurnHighlight(location: Location) {
  const key = location.toString();
  const blinkingColor = "red";
  if (items[key]) {
    highlightDestinationItem(location, blinkingColor, true);
  } else {
    highlightEmptyDestination(location, blinkingColor, true);
  }
}

function highlightSelectedItem(location: Location, color: string) {
  location = inBoardCoordinates(location);
  if (isPangchiuBoard()) {
    const highlight = document.createElementNS(SVG.ns, "rect");
    highlight.style.pointerEvents = "none";
    SVG.setFill(highlight, color);
    SVG.setFrame(highlight, location.j, location.i, 1, 1);
    highlight.setAttribute("rx", "10");
    highlight.setAttribute("ry", "10");
    setHighlightBlendMode(highlight);
    highlightsLayer?.append(highlight);
  } else {
    const highlight = document.createElementNS(SVG.ns, "g");
    highlight.style.pointerEvents = "none";

    const circle = SVG.circle(location.j + 0.5, location.i + 0.5, 0.56);
    SVG.setFill(circle, color);

    const mask = document.createElementNS(SVG.ns, "mask");
    mask.setAttribute("id", `highlight-mask-${location.toString()}`);
    const maskRect = document.createElementNS(SVG.ns, "rect");
    SVG.setFrame(maskRect, location.j, location.i, 1, 1);
    SVG.setFill(maskRect);
    mask.appendChild(maskRect);
    highlight.appendChild(mask);

    circle.setAttribute("mask", `url(#highlight-mask-${location.toString()})`);
    highlight.appendChild(circle);
    highlightsLayer?.append(highlight);
  }
}

const isFirefox = navigator.userAgent.toLowerCase().indexOf("firefox") > -1;

function setHighlightBlendMode(element: SVGElement) {
  if (isFirefox) {
    element.style.opacity = "0.5";
  } else {
    element.style.mixBlendMode = "color";
  }
}

function highlightStartFromSuggestion(location: Location, color: string) {
  location = inBoardCoordinates(location);
  let highlight: SVGElement;

  if (isPangchiuBoard()) {
    highlight = document.createElementNS(SVG.ns, "rect");
    highlight.style.pointerEvents = "none";
    SVG.setFill(highlight, color);
    SVG.setFrame(highlight, location.j, location.i, 1, 1);
    highlight.setAttribute("rx", "10");
    highlight.setAttribute("ry", "10");
    highlight.setAttribute("stroke", color);
    highlight.setAttribute("stroke-width", "20");
    setHighlightBlendMode(highlight);
  } else {
    highlight = document.createElementNS(SVG.ns, "g");
    highlight.style.pointerEvents = "none";

    const circle = SVG.circle(location.j + 0.5, location.i + 0.5, 0.56);
    SVG.setFill(circle, color);

    circle.setAttribute("stroke", colors.startFromStroke);
    circle.setAttribute("stroke-width", "0.023");

    const mask = document.createElementNS(SVG.ns, "mask");
    mask.setAttribute("id", `highlight-mask-${location.toString()}`);
    const maskRect = document.createElementNS(SVG.ns, "rect");
    SVG.setFrame(maskRect, location.j, location.i, 1, 1);
    SVG.setFill(maskRect);
    mask.appendChild(maskRect);
    highlight.appendChild(mask);

    circle.setAttribute("mask", `url(#highlight-mask-${location.toString()})`);
    SVG.setOpacity(highlight, 0.69);
    highlight.appendChild(circle);
  }

  highlightsLayer?.append(highlight);

  setManagedBoardTimeout(() => {
    highlight.remove();
  }, 100);
}

function highlightDestinationItem(location: Location, color: string, blinking: boolean) {
  location = inBoardCoordinates(location);

  if (isPangchiuBoard()) {
    const highlight = document.createElementNS(SVG.ns, "g");
    highlight.style.pointerEvents = "none";

    const scale = 0.88;
    const strokeWidth = 17 * scale;
    const centerX = location.j + 0.5;
    const centerY = location.i + 0.5;

    function scaledFrame(x: any, y: any, w: any, h: any) {
      return {
        x: centerX + (x - centerX) * scale,
        y: centerY + (y - centerY) * scale,
        w: w * scale,
        h: h * scale,
      };
    }

    const rect = document.createElementNS(SVG.ns, "rect");
    let { x, y, w, h } = scaledFrame(location.j, location.i, 1, 1);
    SVG.setFrame(rect, x, y, w, h);
    rect.setAttribute("rx", (10 * scale).toString());
    rect.setAttribute("ry", (10 * scale).toString());
    rect.setAttribute("stroke", color);
    rect.setAttribute("stroke-width", strokeWidth.toString());
    if (!blinking) setHighlightBlendMode(rect);
    SVG.setFill(rect, "transparent");

    const mask = document.createElementNS(SVG.ns, "mask");
    mask.setAttribute("id", `highlight-mask-${location.toString()}`);

    const maskBg = document.createElementNS(SVG.ns, "rect");
    ({ x, y, w, h } = scaledFrame(location.j, location.i, 1, 1));
    SVG.setFrame(maskBg, x, y, w, h);
    SVG.setFill(maskBg, "white");
    maskBg.setAttribute("stroke", "white");
    maskBg.setAttribute("stroke-width", strokeWidth.toString());
    mask.appendChild(maskBg);

    let params;

    params = scaledFrame(location.j + 0.3, location.i - 0.1, 0.4, 0.2);
    const cutTop = document.createElementNS(SVG.ns, "rect");
    SVG.setFrame(cutTop, params.x, params.y, params.w, params.h);
    SVG.setFill(cutTop, "black");
    mask.appendChild(cutTop);

    params = scaledFrame(location.j + 0.9, location.i + 0.3, 0.2, 0.4);
    const cutRight = document.createElementNS(SVG.ns, "rect");
    SVG.setFrame(cutRight, params.x, params.y, params.w, params.h);
    SVG.setFill(cutRight, "black");
    mask.appendChild(cutRight);

    params = scaledFrame(location.j + 0.3, location.i + 0.9, 0.4, 0.2);
    const cutBottom = document.createElementNS(SVG.ns, "rect");
    SVG.setFrame(cutBottom, params.x, params.y, params.w, params.h);
    SVG.setFill(cutBottom, "black");
    mask.appendChild(cutBottom);

    params = scaledFrame(location.j - 0.1, location.i + 0.3, 0.2, 0.4);
    const cutLeft = document.createElementNS(SVG.ns, "rect");
    SVG.setFrame(cutLeft, params.x, params.y, params.w, params.h);
    SVG.setFill(cutLeft, "black");
    mask.appendChild(cutLeft);

    highlight.appendChild(mask);
    highlight.appendChild(rect);
    rect.setAttribute("mask", `url(#highlight-mask-${location.toString()})`);

    if (blinking) {
      startBlinking(highlight);
    }

    highlightsLayer?.append(highlight);
  } else {
    const highlight = document.createElementNS(SVG.ns, "g");
    highlight.style.pointerEvents = "none";

    const rect = document.createElementNS(SVG.ns, "rect");
    SVG.setFrame(rect, location.j, location.i, 1, 1);
    SVG.setFill(rect, color);

    const mask = document.createElementNS(SVG.ns, "mask");
    mask.setAttribute("id", `highlight-mask-${location.toString()}`);

    const maskRect = document.createElementNS(SVG.ns, "rect");
    SVG.setFrame(maskRect, location.j, location.i, 1, 1);
    SVG.setFill(maskRect);
    mask.appendChild(maskRect);

    const maskCircle = SVG.circle(location.j + 0.5, location.i + 0.5, 0.56);
    SVG.setFill(maskCircle, "black");
    mask.appendChild(maskCircle);

    highlight.appendChild(mask);
    highlight.appendChild(rect);

    rect.setAttribute("mask", `url(#highlight-mask-${location.toString()})`);

    if (blinking) {
      startBlinking(highlight);
    }

    highlightsLayer?.append(highlight);
  }
}

function getTraceColors(): string[] {
  const isGradient = !isPangchiuBoard();

  if (traceIndex === (isGradient ? 6 : 7)) {
    traceIndex = 0;
  }

  traceIndex += 1;

  const a = colors.getRainbow(traceIndex.toString());
  const b = colors.getRainbow((traceIndex + (isGradient ? 1 : 0)).toString());

  return [a, b];
}

function addWaves(location: Location) {
  location = inBoardCoordinates(location);
  const wavesSquareElement = document.createElementNS(SVG.ns, "g");
  wavesSquareElement.setAttribute("data-grid-board-only", "true");
  wavesSquareElement.setAttribute("data-board-wave", "true");
  SVG.setHidden(wavesSquareElement, isCustomPictureBoardEnabled());
  wavesSquareElement.setAttribute("transform", `translate(${location.j * 100}, ${location.i * 100})`);
  SVG.setOpacity(wavesSquareElement, 0.5);
  board?.appendChild(wavesSquareElement);

  if (currentAssetsSet !== AssetsSet.Pixel) {
    wavesSquareElement.appendChild(createSmoothWavesFrame(wavesSquareElement));
    return;
  }

  let frameIndex = 0;
  wavesSquareElement.appendChild(getWavesFrame(location, frameIndex));
  const intervalId = window.setInterval(() => {
    frameIndex = (frameIndex + 1) % 9;
    wavesSquareElement.innerHTML = "";
    wavesSquareElement.appendChild(getWavesFrame(location, frameIndex));
  }, 200);
  trackWavesInterval(intervalId);
}

function createSmoothWavesFrame(container: SVGGElement) {
  const frame = document.createElementNS(SVG.ns, "g");

  const background = document.createElementNS(SVG.ns, "rect");
  SVG.setFrame(background, 0, 0, 1, 1);
  SVG.setFill(background, colors.manaPool);
  SVG.setOpacity(background, 0.14);
  background.setAttribute("class", "poolBackground");
  frame.appendChild(background);

  const pixel = 1 / 32;
  const waves: SmoothWaveRenderData[] = [];

  for (let i = 0; i < 10; i++) {
    const width = (Math.floor(Math.random() * 4) + 3) * pixel;
    const x = Math.random() * (1 - width);
    const y = pixel * (2 + i * 3) + pixel * 0.35;
    const amplitude = pixel * (0.42 + Math.random() * 0.2);
    const opacity = 0.56 + Math.random() * 0.18;
    const isWave1 = i % 2 === 0;
    const path = document.createElementNS(SVG.ns, "path");
    path.setAttribute("class", `${isWave1 ? "wave1" : "wave2"} smooth-wave`);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", isWave1 ? colors.wave1 : colors.wave2);
    path.setAttribute("stroke-width", (pixel * 130).toString());
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    SVG.setOpacity(path, opacity);
    const speed = 0.003 + Math.random() * 0.0012;
    const phaseOffset = Math.random() * Math.PI * 2;
    const wave = buildFlowingWaveRenderData(path, x, y, width, amplitude, speed, phaseOffset);
    updateFlowingWavePathData(wave, phaseOffset);
    frame.appendChild(path);
    waves.push(wave);
  }

  const animation: SmoothWaveAnimationData = {
    container,
    frame,
    waves,
  };
  smoothWaveAnimations.add(animation);
  ensureSmoothWaveTicker();

  return frame;
}

function getSmoothWaveTaper(t: number): number {
  if (t < smoothWaveTaperMargin) {
    return 0.5 * (1 - Math.cos((Math.PI * t) / smoothWaveTaperMargin));
  }
  if (t > 1 - smoothWaveTaperMargin) {
    return 0.5 * (1 - Math.cos((Math.PI * (1 - t)) / smoothWaveTaperMargin));
  }
  return 1;
}

function buildFlowingWaveRenderData(path: SVGPathElement, x: number, y: number, width: number, amplitude: number, speed: number, phaseOffset: number): SmoothWaveRenderData {
  const xPoints = new Array<number>(smoothWavePointCount + 1);
  const scaledAmplitudes = new Array<number>(smoothWavePointCount + 1);
  for (let i = 0; i <= smoothWavePointCount; i++) {
    const t = i / smoothWavePointCount;
    xPoints[i] = (x + width * t) * 100;
    scaledAmplitudes[i] = amplitude * getSmoothWaveTaper(t) * 100;
  }
  return {
    path,
    xPoints,
    yBase: y * 100,
    scaledAmplitudes,
    segments: new Array<string>(smoothWavePointCount + 1),
    speed,
    phaseOffset,
  };
}

function updateFlowingWavePathData(wave: SmoothWaveRenderData, phase: number): void {
  let sinPhase = Math.sin(phase);
  let cosPhase = Math.cos(phase);
  for (let i = 0; i <= smoothWavePointCount; i++) {
    wave.segments[i] = (i === 0 ? "M" : "L") + wave.xPoints[i] + " " + (wave.yBase + wave.scaledAmplitudes[i] * sinPhase);
    const nextSin = sinPhase * smoothWaveCosStep + cosPhase * smoothWaveSinStep;
    const nextCos = cosPhase * smoothWaveCosStep - sinPhase * smoothWaveSinStep;
    sinPhase = nextSin;
    cosPhase = nextCos;
  }
  wave.path.setAttribute("d", wave.segments.join(" "));
}

function getWavesFrame(location: Location, frameIndex: number) {
  const pixel = 1 / 32;
  const key = location.toString() + frameIndex.toString();
  if (!wavesFrames[key]) {
    if (frameIndex === 0) {
      const frame = document.createElementNS(SVG.ns, "g");
      for (let i = 0; i < 10; i++) {
        const width = (Math.floor(Math.random() * 4) + 3) * pixel;
        const x = Math.random() * (1 - width);
        const y = pixel * (2 + i * 3);
        const baseColor = i % 2 === 0 ? colors.wave1 : colors.wave2;

        const baseBottomRect = document.createElementNS(SVG.ns, "rect");
        SVG.setFrame(baseBottomRect, x, y, width, pixel);
        SVG.setFill(baseBottomRect, baseColor);
        baseBottomRect.setAttribute("class", `wave-bottom ${i % 2 === 0 ? "wave1" : "wave2"}`);

        const slidingBottomRect = document.createElementNS(SVG.ns, "rect");
        SVG.setFrame(slidingBottomRect, x + width, y, 0, pixel);
        SVG.setFill(slidingBottomRect, colors.manaPool);
        slidingBottomRect.setAttribute("class", "wave-bottom poolBackground");

        const slidingTopRect = document.createElementNS(SVG.ns, "rect");
        SVG.setFrame(slidingTopRect, x + width, y - pixel, 0, pixel);
        SVG.setFill(slidingTopRect, baseColor);
        slidingTopRect.setAttribute("class", `wave-top ${i % 2 === 0 ? "wave1" : "wave2"}`);

        frame.appendChild(baseBottomRect);
        frame.appendChild(slidingTopRect);
        frame.appendChild(slidingBottomRect);
      }
      wavesFrames[key] = frame;
    } else {
      const prevKey = location.toString() + (frameIndex - 1).toString();
      const frame = wavesFrames[prevKey].cloneNode(true) as SVGElement;

      const baseBottomRects = frame.querySelectorAll(".wave-bottom:not(.poolBackground)");
      const slidingBottomRects = frame.querySelectorAll(".wave-bottom.poolBackground");
      const slidingTopRects = frame.querySelectorAll(".wave-top");

      for (let i = 0; i < baseBottomRects.length; i++) {
        const baseBottomRect = baseBottomRects[i];
        const slidingBottomRect = slidingBottomRects[i];
        const slidingTopRect = slidingTopRects[i];
        const baseX = parseFloat(baseBottomRect.getAttribute("x") ?? "0") / 100;
        const baseWidth = parseFloat(baseBottomRect.getAttribute("width") ?? "0") / 100;
        let sliderX = baseX + baseWidth - pixel * frameIndex;
        const attemptedWidth = Math.min(frameIndex, 3) * pixel;
        const visibleWidth = (() => {
          if (sliderX < baseX) {
            if (sliderX + attemptedWidth <= baseX) {
              return 0;
            } else {
              const visible = attemptedWidth - baseX + sliderX;
              if (visible < pixel / 2) {
                return 0;
              } else {
                sliderX = baseX;
                return visible;
              }
            }
          } else {
            return attemptedWidth;
          }
        })();
        slidingBottomRect.setAttribute("x", (sliderX * 100).toString());
        slidingTopRect.setAttribute("x", (sliderX * 100).toString());
        slidingBottomRect.setAttribute("width", (visibleWidth * 100).toString());
        slidingTopRect.setAttribute("width", (visibleWidth * 100).toString());
      }
      wavesFrames[key] = frame;
    }
  }
  return wavesFrames[key];
}

export function didToggleBoardColors() {
  const wave1Color = colors.wave1;
  const wave2Color = colors.wave2;
  const manaColor = colors.manaPool;

  const applyWaveColors = (root: ParentNode) => {
    const wave1Elements = root.querySelectorAll(".wave1");
    const wave2Elements = root.querySelectorAll(".wave2");
    const poolElements = root.querySelectorAll(".poolBackground");

    wave1Elements.forEach((element) => {
      if (element instanceof SVGElement) {
        if (element.classList.contains("smooth-wave")) {
          element.setAttribute("stroke", wave1Color);
        } else {
          SVG.setFill(element, wave1Color);
        }
      }
    });

    wave2Elements.forEach((element) => {
      if (element instanceof SVGElement) {
        if (element.classList.contains("smooth-wave")) {
          element.setAttribute("stroke", wave2Color);
        } else {
          SVG.setFill(element, wave2Color);
        }
      }
    });

    poolElements.forEach((element) => {
      if (element instanceof SVGElement) {
        SVG.setFill(element, manaColor);
      }
    });
  };

  Object.values(wavesFrames).forEach((frame) => {
    applyWaveColors(frame);
  });
  if (board) {
    applyWaveColors(board);
  }

  if (!isCustomPictureBoardEnabled()) {
    Object.entries(basesPlaceholders).forEach(([key, element]) => {
      const [i, j] = key.split("-").map(Number);
      const squareColor = ((i + j) % 2 === 0 ? colors.lightSquare : colors.darkSquare) + "85";
      const firstChild = element.children[0] as HTMLElement;
      firstChild.style.backgroundColor = squareColor;
    });
  }
}

function inBoardCoordinates(location: Location): Location {
  if (isFlipped) {
    return new Location(10 - location.i, 10 - location.j);
  } else {
    return new Location(location.i, location.j);
  }
}

const sparkle = (() => {
  const svg = document.createElementNS(SVG.ns, "svg");
  SVG.setSizeStr(svg, "3", "3");
  svg.setAttribute("viewBox", "0 0 3 3");
  SVG.setFill(svg, "transparent");

  const rect1 = document.createElementNS(SVG.ns, "rect");
  SVG.setFrameStr(rect1, "0", "1", "3", "1");
  SVG.setFill(rect1, colors.sparkleLight);
  svg.appendChild(rect1);

  const rect2 = document.createElementNS(SVG.ns, "rect");
  SVG.setFrameStr(rect2, "1", "0", "1", "3");
  SVG.setFill(rect2, colors.sparkleLight);
  svg.appendChild(rect2);

  const rect3 = document.createElementNS(SVG.ns, "rect");
  SVG.setFrameStr(rect3, "1", "1", "1", "1");
  SVG.setFill(rect3, colors.sparkleDark);
  svg.appendChild(rect3);

  return svg;
})();

const smoothSparkle = (() => {
  const svg = document.createElementNS(SVG.ns, "svg");
  SVG.setSizeStr(svg, "3", "3");
  svg.setAttribute("viewBox", "0 0 3 3");
  SVG.setFill(svg, "transparent");

  const star = document.createElementNS(SVG.ns, "path");
  star.setAttribute("d", "M1.5 0.1 Q1.62 1.38 2.9 1.5 Q1.62 1.62 1.5 2.9 Q1.38 1.62 0.1 1.5 Q1.38 1.38 1.5 0.1Z");
  star.setAttribute("fill", colors.sparkleLight);
  star.setAttribute("opacity", "0.7");
  svg.appendChild(star);

  const center = document.createElementNS(SVG.ns, "circle");
  center.setAttribute("cx", "1.5");
  center.setAttribute("cy", "1.5");
  center.setAttribute("r", "0.28");
  center.setAttribute("fill", colors.sparkleLight);
  svg.appendChild(center);

  return svg;
})();

let particleEffects: any = null;
let particleEffectsLoading: Promise<any> | null = null;

function preloadParticleEffects() {
  if (particleEffectsLoading) return particleEffectsLoading;

  particleEffectsLoading = import("./particle-effects")
    .then((module) => {
      particleEffects = module;
      return module;
    })
    .catch((error) => {
      console.error("Failed to load particle effects:", error);
      throw error;
    });

  return particleEffectsLoading;
}

async function ensureParticleEffectsLoaded() {
  if (particleEffects) return particleEffects;
  return await preloadParticleEffects();
}

export async function indicateElectricHit(at: Location) {
  const effects = await ensureParticleEffectsLoaded();
  effects.indicateElectricHit(at);
}

export async function indicatePotionUsage(at: Location, byOpponent: boolean) {
  const effects = await ensureParticleEffectsLoaded();
  const potionTimeout = window.setTimeout(() => {
    boardTimeoutIds.delete(potionTimeout);
    decrementLifecycleCounter("boardTimeouts");
    playSounds([Sound.UsePotion]);
    effects.showPurpleBubbles(at);
  }, 300);
  trackBoardTimeout(potionTimeout);
}

export async function indicateBombExplosion(at: Location) {
  const effects = await ensureParticleEffectsLoaded();
  effects.indicateBombExplosion(at);
}

export async function indicateFlameGround(at: Location) {
  const effects = await ensureParticleEffectsLoaded();
  effects.indicateFlameGround(at);
}

export async function indicateSpiritAction(at: Location) {
  const effects = await ensureParticleEffectsLoaded();
  effects.indicateSpiritAction(at);
}

export async function indicateWaterSplash(at: Location) {
  const effects = await ensureParticleEffectsLoaded();
  effects.indicateWaterSplash(at);
}
