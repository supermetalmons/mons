import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import styled from "styled-components";
import { FaTimes, FaCheck } from "react-icons/fa";
import { go } from "../game/gameController";
import { markMainGameLoaded } from "../game/mainGameLoadState";
import { ColorSet, getCurrentColorSet, isCustomPictureBoardEnabled } from "../content/boardStyles";
import { defaultInputEventName, isMobile } from "../utils/misc";
import { generateBoardPattern } from "../utils/boardPatternGenerator";
import { attachRainbowAura, hideRainbowAura as hideAuraDom, setRainbowAuraMask, showRainbowAura as showAuraDom } from "./rainbowAura";
import { setWagerRenderHandler, WagerPileSide, WagerRenderState } from "../game/board";
import { setWagerPanelOutsideTapHandler, setWagerPanelVisibilityChecker } from "./BottomControls";

const CircularButton = styled.button`
  width: 50%;
  aspect-ratio: 1;
  border-radius: 50%;
  background-color: var(--boardCircularButtonBackground);
  color: var(--color-blue-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  outline: none;
  border: none;
  min-width: 0;
  min-height: 0;
  box-sizing: border-box;
  overflow: visible;

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background-color: var(--boardCircularButtonBackgroundHover);
    }
  }

  &:active {
    background-color: var(--boardCircularButtonBackgroundActive);
  }

  @media (prefers-color-scheme: dark) {
    background-color: var(--boardCircularButtonBackgroundDark);
    color: var(--color-blue-primary-dark);

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background-color: var(--boardCircularButtonBackgroundHoverDark);
      }
    }

    &:active {
      background-color: var(--boardCircularButtonBackgroundActiveDark);
    }
  }

  svg {
    width: 55.5%;
    height: 55.5%;
    min-width: 5px;
    min-height: 5px;
    overflow: visible;
  }
`;

const listeners: Array<() => void> = [];

export const subscribeToBoardStyleChanges = (listener: () => void) => {
  listeners.push(listener);
  return () => {
    const index = listeners.indexOf(listener);
    if (index > -1) {
      listeners.splice(index, 1);
    }
  };
};

export const updateBoardComponentForBoardStyleChange = () => {
  listeners.forEach((listener) => listener());
};

export let setTopBoardOverlayVisible: (blurry: boolean, svgElement: SVGElement | null, withConfirmAndCancelButtons: boolean, ok?: () => void, cancel?: () => void) => void;
export let showVideoReaction: (opponent: boolean, stickerId: number) => void;
export let showRaibowAura: (visible: boolean, url: string, opponent: boolean) => void;
export let updateAuraForAvatarElement: (opponent: boolean, avatarElement: SVGElement) => void;

const VIDEO_CONTAINER_HEIGHT_GRID = "12.5%";
const VIDEO_CONTAINER_HEIGHT_IMAGE = "13.5%";
const VIDEO_CONTAINER_MAX_HEIGHT = "min(20vh, 180px)";
const VIDEO_CONTAINER_ASPECT_RATIO = "1";
const VIDEO_CONTAINER_Z_INDEX = 10000;
const BOARD_WIDTH_UNITS = 11;
const BOARD_HEIGHT_UNITS = 14.1;
const WAGER_PANEL_PADDING_X_FRAC = 0.2;
const WAGER_PANEL_PADDING_Y_FRAC = 0.2;
const WAGER_PANEL_BUTTON_HEIGHT_FRAC = 0.4;
const WAGER_PANEL_BUTTON_GAP_FRAC = 0.14;
const WAGER_PANEL_PILE_GAP_FRAC = 0.2;
const WAGER_PANEL_BUTTON_WIDTH_FRAC = 1;
const WAGER_PANEL_MIN_PADDING_PX = 12;
const WAGER_PANEL_MIN_BUTTON_HEIGHT_PX = 34;
const WAGER_PANEL_MIN_BUTTON_GAP_PX = 10;
const WAGER_PANEL_MIN_OPPONENT_BUTTON_WIDTH_PX = 96;
const WAGER_PANEL_MIN_PLAYER_BUTTON_WIDTH_PX = 170;
const WAGER_PANEL_COUNT_GAP_FRAC = 0.06;
const WAGER_PANEL_COUNT_MIN_GAP_PX = 4;
const WAGER_PANEL_COUNT_MIN_WIDTH_PX = 32;
const WAGER_PANEL_COUNT_Y_OFFSET_FRAC = 0.04;

type WagerPileElements = {
  player: HTMLDivElement;
  opponent: HTMLDivElement;
  winner: HTMLDivElement;
  playerIcons: HTMLImageElement[];
  opponentIcons: HTMLImageElement[];
  winnerIcons: HTMLImageElement[];
};

const toPercentX = (value: number) => (value / BOARD_WIDTH_UNITS) * 100;
const toPercentY = (value: number) => (value / BOARD_HEIGHT_UNITS) * 100;

const getWagerPanelLayout = (
  rect: { x: number; y: number; w: number; h: number },
  isOpponent: boolean,
  boardPixelSize: { width: number; height: number } | null
): {
  x: number;
  y: number;
  width: number;
  height: number;
  gridRows: string;
  paddingXPct: number;
  pileRow: number;
  buttonRow: number;
  buttonGapPct: number;
  singleButtonWidthPct: number;
  countGap: number;
} => {
  const pxPerUnitX = boardPixelSize ? boardPixelSize.width / BOARD_WIDTH_UNITS : null;
  const pxPerUnitY = boardPixelSize ? boardPixelSize.height / BOARD_HEIGHT_UNITS : null;
  const minPaddingX = pxPerUnitX ? WAGER_PANEL_MIN_PADDING_PX / pxPerUnitX : 0;
  const minPaddingY = pxPerUnitY ? WAGER_PANEL_MIN_PADDING_PX / pxPerUnitY : 0;
  const paddingX = Math.max(rect.w * WAGER_PANEL_PADDING_X_FRAC, minPaddingX);
  const paddingY = Math.max(rect.h * WAGER_PANEL_PADDING_Y_FRAC, minPaddingY);
  const minButtonHeight = pxPerUnitY ? WAGER_PANEL_MIN_BUTTON_HEIGHT_PX / pxPerUnitY : 0;
  const buttonHeight = Math.max(rect.h * WAGER_PANEL_BUTTON_HEIGHT_FRAC, minButtonHeight);
  const minButtonGap = pxPerUnitX ? WAGER_PANEL_MIN_BUTTON_GAP_PX / pxPerUnitX : 0;
  const buttonGap = Math.max(rect.w * WAGER_PANEL_BUTTON_GAP_FRAC, minButtonGap);
  const minCountGap = pxPerUnitX ? WAGER_PANEL_COUNT_MIN_GAP_PX / pxPerUnitX : 0;
  const countGap = Math.max(rect.w * WAGER_PANEL_COUNT_GAP_FRAC, minCountGap);
  const minCountWidth = pxPerUnitX ? WAGER_PANEL_COUNT_MIN_WIDTH_PX / pxPerUnitX : 0;
  const pileGap = rect.h * WAGER_PANEL_PILE_GAP_FRAC;
  const minButtonRowWidth = pxPerUnitX
    ? (isOpponent ? WAGER_PANEL_MIN_OPPONENT_BUTTON_WIDTH_PX * 2 + WAGER_PANEL_MIN_BUTTON_GAP_PX : WAGER_PANEL_MIN_PLAYER_BUTTON_WIDTH_PX) / pxPerUnitX
    : 0;
  const minPanelContentWidth = rect.w + countGap + minCountWidth;
  const buttonRowWidth = Math.max(rect.w, minButtonRowWidth, minPanelContentWidth);
  const panelWidth = buttonRowWidth + paddingX * 2;
  const panelHeight = rect.h + paddingY * 2 + pileGap + buttonHeight;
  const centerX = rect.x + rect.w / 2;
  const panelX = centerX - panelWidth / 2;
  const panelY = isOpponent ? rect.y - paddingY : rect.y - (panelHeight - rect.h - paddingY);
  const rowValues = isOpponent ? [paddingY, rect.h, pileGap, buttonHeight, paddingY] : [paddingY, buttonHeight, pileGap, rect.h, paddingY];
  const gridRows = rowValues.map((value) => `${(value / panelHeight) * 100}%`).join(" ");
  const paddingXPct = (paddingX / panelWidth) * 100;
  const buttonGapPct = buttonRowWidth > 0 ? (buttonGap / buttonRowWidth) * 100 : 0;
  const singleButtonWidthPct = WAGER_PANEL_BUTTON_WIDTH_FRAC * 100;
  const pileRow = isOpponent ? 2 : 4;
  const buttonRow = isOpponent ? 4 : 2;

  return {
    x: panelX,
    y: panelY,
    width: panelWidth,
    height: panelHeight,
    gridRows,
    paddingXPct,
    pileRow,
    buttonRow,
    buttonGapPct,
    singleButtonWidthPct,
    countGap,
  };
};

const BoardComponent: React.FC = () => {
  const [opponentVideoId, setOpponentVideoId] = useState<number | null>(null);
  const [opponentVideoVisible, setOpponentVideoVisible] = useState(false);
  const [opponentVideoFading, setOpponentVideoFading] = useState(false);
  const [opponentVideoAppearing, setOpponentVideoAppearing] = useState(false);

  const [playerVideoId, setPlayerVideoId] = useState<number | null>(null);
  const [playerVideoVisible, setPlayerVideoVisible] = useState(false);
  const [playerVideoFading, setPlayerVideoFading] = useState(false);
  const [playerVideoAppearing, setPlayerVideoAppearing] = useState(false);
  const initializationRef = useRef(false);
  const [currentColorSet, setCurrentColorSet] = useState<ColorSet>(getCurrentColorSet());
  const [prefersDarkMode] = useState(window.matchMedia("(prefers-color-scheme: dark)").matches);
  const [isGridVisible, setIsGridVisible] = useState(!isCustomPictureBoardEnabled());
  const [shouldIncludePangchiuImage, setShouldIncludePangchiuImage] = useState(isCustomPictureBoardEnabled());
  const [overlayState, setOverlayState] = useState<{ blurry: boolean; svgElement: SVGElement | null; withConfirmAndCancelButtons: boolean; ok?: () => void; cancel?: () => void }>({ blurry: true, svgElement: null, withConfirmAndCancelButtons: false });
  const [activeWagerPanelSide, setActiveWagerPanelSide] = useState<WagerPileSide | null>(null);
  const [activeWagerPanelRect, setActiveWagerPanelRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [activeWagerPanelCount, setActiveWagerPanelCount] = useState<number | null>(null);
  const [boardPixelSize, setBoardPixelSize] = useState<{ width: number; height: number } | null>(null);
  const wagerPilesLayerRef = useRef<HTMLDivElement | null>(null);
  const wagerPileElementsRef = useRef<WagerPileElements | null>(null);
  const wagerRenderStateRef = useRef<WagerRenderState | null>(null);
  const activeWagerPanelSideRef = useRef<WagerPileSide | null>(null);
  const activeWagerPanelRectRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const activeWagerPanelCountRef = useRef<number | null>(null);
  const opponentAuraContainerRef = useRef<HTMLDivElement | null>(null);
  const playerAuraContainerRef = useRef<HTMLDivElement | null>(null);
  const opponentAuraRefs = useRef<{ background: HTMLDivElement; inner: HTMLDivElement } | null>(null);
  const playerAuraRefs = useRef<{ background: HTMLDivElement; inner: HTMLDivElement } | null>(null);
  const auraLayerRef = useRef<HTMLDivElement | null>(null);
  const opponentWrapperRef = useRef<HTMLDivElement | null>(null);
  const playerWrapperRef = useRef<HTMLDivElement | null>(null);

  updateAuraForAvatarElement = (opponent: boolean, avatarElement: SVGElement) => {
    const rect = avatarElement.getBoundingClientRect();
    const wrapper = opponent ? opponentWrapperRef.current : playerWrapperRef.current;
    const targets = opponent ? opponentAuraRefs : playerAuraRefs;
    const container = opponent ? opponentAuraContainerRef.current : playerAuraContainerRef.current;
    if (wrapper) {
      wrapper.style.position = "absolute";
      wrapper.style.left = `${rect.left}px`;
      wrapper.style.top = `${rect.top}px`;
      wrapper.style.width = `${rect.width}px`;
      wrapper.style.height = `${rect.height}px`;
      wrapper.style.pointerEvents = "none";
      wrapper.style.touchAction = "none";
      wrapper.style.zIndex = "10";
    }
    if (!targets.current && container) {
      targets.current = attachRainbowAura(container);
    }
    if (targets.current) {
      const isHidden = avatarElement.style.display === "none" || avatarElement.style.visibility === "hidden";
      if (isHidden) {
        hideAuraDom(targets.current.background);
      }
    }
  };

  const handleConfirmClick = () => {
    if (overlayState.ok) {
      overlayState.ok();
    }
  };

  const handleCancelClick = () => {
    if (overlayState.cancel) {
      overlayState.cancel();
    }
  };

  showVideoReaction = (opponent: boolean, stickerId: number) => {
    if (opponent) {
      setOpponentVideoId(stickerId);
      setOpponentVideoVisible(true);
      setOpponentVideoFading(false);
      setOpponentVideoAppearing(true);
      setTimeout(() => setOpponentVideoAppearing(false), 400);
    } else {
      setPlayerVideoId(stickerId);
      setPlayerVideoVisible(true);
      setPlayerVideoFading(false);
      setPlayerVideoAppearing(true);
      setTimeout(() => setPlayerVideoAppearing(false), 400);
    }
  };

  setTopBoardOverlayVisible = (blurry: boolean, svgElement: SVGElement | null, withConfirmAndCancelButtons: boolean, ok?: () => void, cancel?: () => void) => {
    setOverlayState({ blurry, svgElement, withConfirmAndCancelButtons, ok, cancel });
  };

  showRaibowAura = (visible: boolean, url: string, opponent: boolean) => {
    const targets = opponent ? opponentAuraRefs : playerAuraRefs;
    const container = opponent ? opponentAuraContainerRef.current : playerAuraContainerRef.current;
    if (!targets.current && container) {
      targets.current = attachRainbowAura(container);
    }
    if (!targets.current) return;
    setRainbowAuraMask(targets.current.inner, url);
    if (visible) {
      showAuraDom(targets.current.background);
    } else {
      hideAuraDom(targets.current.background);
    }
  };

  useEffect(() => {
    if (!initializationRef.current) {
      initializationRef.current = true;
      const run = async () => {
        try {
          await go();
        } catch {
        } finally {
          markMainGameLoaded();
        }
      };
      run();
    }
  }, []);

  useEffect(() => {
    const updateColorSetAndGrid = () => {
      setCurrentColorSet(getCurrentColorSet());
      const newIsGridVisible = !isCustomPictureBoardEnabled();
      setIsGridVisible(newIsGridVisible);
      if (!newIsGridVisible) {
        setShouldIncludePangchiuImage(true);
      }
    };

    const unsubscribe = subscribeToBoardStyleChanges(updateColorSetAndGrid);
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    activeWagerPanelSideRef.current = activeWagerPanelSide;
  }, [activeWagerPanelSide]);

  useEffect(() => {
    activeWagerPanelRectRef.current = activeWagerPanelRect;
  }, [activeWagerPanelRect]);

  useEffect(() => {
    activeWagerPanelCountRef.current = activeWagerPanelCount;
  }, [activeWagerPanelCount]);

  useLayoutEffect(() => {
    const updateSize = () => {
      const layer = wagerPilesLayerRef.current;
      if (!layer) {
        return;
      }
      const rect = layer.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        return;
      }
      setBoardPixelSize((prev) => {
        if (prev && prev.width === rect.width && prev.height === rect.height) {
          return prev;
        }
        return { width: rect.width, height: rect.height };
      });
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => {
      window.removeEventListener("resize", updateSize);
    };
  }, [isGridVisible]);

  const clearWagerPanel = useCallback(() => {
    activeWagerPanelSideRef.current = null;
    activeWagerPanelRectRef.current = null;
    activeWagerPanelCountRef.current = null;
    setActiveWagerPanelSide(null);
    setActiveWagerPanelRect(null);
    setActiveWagerPanelCount(null);
  }, []);

  const handleWagerPanelAction = useCallback(
    (event?: React.SyntheticEvent) => {
      if (event) {
        event.stopPropagation();
        if (event.cancelable) {
          event.preventDefault();
        }
      }
      clearWagerPanel();
    },
    [clearWagerPanel]
  );

  const ensureWagerPileElements = useCallback((): WagerPileElements | null => {
    const layer = wagerPilesLayerRef.current;
    if (!layer) {
      return null;
    }
    const existing = wagerPileElementsRef.current;
    if (existing && layer.contains(existing.player) && layer.contains(existing.opponent) && layer.contains(existing.winner)) {
      return existing;
    }
    layer.innerHTML = "";

    const createPileContainer = (side: WagerPileSide | "winner") => {
      const container = document.createElement("div");
      container.dataset.wagerPile = side;
      container.style.position = "absolute";
      container.style.left = "0";
      container.style.top = "0";
      container.style.width = "0";
      container.style.height = "0";
      container.style.display = "none";
      container.style.pointerEvents = side === "winner" ? "none" : "auto";
      container.style.touchAction = "none";
      container.style.userSelect = "none";
      container.style.zIndex = "3";
      container.style.overflow = "visible";
      if (side !== "winner") {
        container.style.cursor = "pointer";
        container.addEventListener(defaultInputEventName, (event) => {
          event.stopPropagation();
          if (event.cancelable) {
            event.preventDefault();
          }
          const state = wagerRenderStateRef.current;
          if (!state || state.winAnimationActive || state.winner) {
            clearWagerPanel();
            return;
          }
          const pileState = side === "opponent" ? state.opponent : state.player;
          if (!pileState) {
            clearWagerPanel();
            return;
          }
          if (activeWagerPanelSideRef.current === side) {
            clearWagerPanel();
            return;
          }
          activeWagerPanelSideRef.current = side;
          activeWagerPanelRectRef.current = pileState.rect;
          activeWagerPanelCountRef.current = pileState.actualCount ?? pileState.count;
          setActiveWagerPanelSide(side);
          setActiveWagerPanelRect(pileState.rect);
          setActiveWagerPanelCount(pileState.actualCount ?? pileState.count);
        });
      }
      return container;
    };

    const player = createPileContainer("player");
    const opponent = createPileContainer("opponent");
    const winner = createPileContainer("winner");
    layer.append(player, opponent, winner);
    const elements: WagerPileElements = {
      player,
      opponent,
      winner,
      playerIcons: [],
      opponentIcons: [],
      winnerIcons: [],
    };
    wagerPileElementsRef.current = elements;
    return elements;
  }, [clearWagerPanel]);

  const applyWagerRenderState = useCallback(
    (state: WagerRenderState) => {
      wagerRenderStateRef.current = state;
      const elements = ensureWagerPileElements();
      if (!elements) {
        return;
      }

      const updatePile = (container: HTMLDivElement, icons: HTMLImageElement[], pileState: WagerRenderState["player"]) => {
        if (!pileState || pileState.count <= 0 || pileState.frames.length === 0) {
          container.style.display = "none";
          return;
        }
        const rect = pileState.rect;
        if (rect.w === 0 || rect.h === 0) {
          container.style.display = "none";
          return;
        }
        container.style.display = "block";
        container.style.left = `${toPercentX(rect.x)}%`;
        container.style.top = `${toPercentY(rect.y)}%`;
        container.style.width = `${toPercentX(rect.w)}%`;
        container.style.height = `${toPercentY(rect.h)}%`;

        const materialUrl = pileState.materialUrl;
        const iconSize = pileState.iconSize;
        const sizePctW = (iconSize / rect.w) * 100;
        const sizePctH = (iconSize / rect.h) * 100;
        const visibleCount = Math.min(pileState.count, pileState.frames.length);

        while (icons.length > visibleCount) {
          const icon = icons.pop();
          if (icon) {
            icon.remove();
          }
        }
        while (icons.length < visibleCount) {
          const icon = document.createElement("img");
          icon.alt = "";
          icon.draggable = false;
          icon.style.position = "absolute";
          icon.style.left = "0";
          icon.style.top = "0";
          icon.style.width = "0";
          icon.style.height = "0";
          icon.style.pointerEvents = "none";
          icon.style.userSelect = "none";
          icon.style.objectFit = "contain";
          container.appendChild(icon);
          icons.push(icon);
        }

        for (let i = 0; i < visibleCount; i += 1) {
          const frame = pileState.frames[i];
          if (!frame) {
            continue;
          }
          const icon = icons[i];
          if (icon.dataset.src !== materialUrl) {
            icon.dataset.src = materialUrl;
            icon.src = materialUrl;
          }
          const leftPct = ((frame.x - rect.x) / rect.w) * 100;
          const topPct = ((frame.y - rect.y) / rect.h) * 100;
          icon.style.left = `${leftPct}%`;
          icon.style.top = `${topPct}%`;
          icon.style.width = `${sizePctW}%`;
          icon.style.height = `${sizePctH}%`;
        }
      };

      updatePile(elements.opponent, elements.opponentIcons, state.opponent);
      updatePile(elements.player, elements.playerIcons, state.player);
      updatePile(elements.winner, elements.winnerIcons, state.winner);

      const activeSide = activeWagerPanelSideRef.current;
      if (activeSide) {
        if (state.winAnimationActive || state.winner) {
          clearWagerPanel();
        } else {
          const pileState = activeSide === "opponent" ? state.opponent : state.player;
          if (!pileState) {
            clearWagerPanel();
          } else {
            const prevRect = activeWagerPanelRectRef.current;
            const nextRect = pileState.rect;
            const rectChanged = !prevRect || prevRect.x !== nextRect.x || prevRect.y !== nextRect.y || prevRect.w !== nextRect.w || prevRect.h !== nextRect.h;
            if (rectChanged) {
              activeWagerPanelRectRef.current = nextRect;
              setActiveWagerPanelRect(nextRect);
            }
            const nextCount = pileState.actualCount ?? pileState.count;
            if (activeWagerPanelCountRef.current !== nextCount) {
              activeWagerPanelCountRef.current = nextCount;
              setActiveWagerPanelCount(nextCount);
            }
          }
        }
      }
    },
    [clearWagerPanel, ensureWagerPileElements]
  );

  useEffect(() => {
    setWagerRenderHandler((state) => {
      applyWagerRenderState(state);
    });
    return () => {
      setWagerRenderHandler(null);
    };
  }, [applyWagerRenderState]);

  useEffect(() => {
    setWagerPanelVisibilityChecker(() => activeWagerPanelSideRef.current !== null);
    setWagerPanelOutsideTapHandler((event) => {
      if (!activeWagerPanelSideRef.current) {
        return false;
      }
      const target = event.target;
      if (target instanceof Element && target.closest('[data-wager-panel="true"], [data-wager-pile]')) {
        return false;
      }
      clearWagerPanel();
      return true;
    });
    return () => {
      setWagerPanelOutsideTapHandler(null);
      setWagerPanelVisibilityChecker(() => false);
    };
  }, [clearWagerPanel]);

  const standardBoardTransform = "translate(0,100)";
  const pangchiuBoardTransform = "translate(83,184) scale(0.85892388)";
  const activeWagerPileRect = activeWagerPanelSide ? activeWagerPanelRect : null;
  const wagerPanelLayout =
    activeWagerPanelSide && activeWagerPileRect ? getWagerPanelLayout(activeWagerPileRect, activeWagerPanelSide === "opponent", boardPixelSize) : null;
  const wagerCountLayout =
    wagerPanelLayout && activeWagerPileRect && activeWagerPanelCount !== null
      ? (() => {
          const pxPerUnitX = boardPixelSize ? boardPixelSize.width / BOARD_WIDTH_UNITS : null;
          const minGap = pxPerUnitX ? WAGER_PANEL_COUNT_MIN_GAP_PX / pxPerUnitX : 0;
          const gap = Math.max(wagerPanelLayout.countGap, minGap);
          const centerY = activeWagerPileRect.y + activeWagerPileRect.h / 2 - activeWagerPileRect.h * WAGER_PANEL_COUNT_Y_OFFSET_FRAC;
          const left = activeWagerPileRect.x + activeWagerPileRect.w + gap;
          const leftPct = ((left - wagerPanelLayout.x) / wagerPanelLayout.width) * 100;
          const topPct = ((centerY - wagerPanelLayout.y) / wagerPanelLayout.height) * 100;
          return { leftPct, topPct };
        })()
      : null;
  const wagerPanelTheme = prefersDarkMode
    ? {
        background: "rgba(28, 28, 28, 0.72)",
        border: "rgba(255, 255, 255, 0.12)",
        shadow: "0 10px 22px rgba(0, 0, 0, 0.35)",
        buttonBackground: "rgba(255, 255, 255, 0.1)",
        buttonBorder: "rgba(255, 255, 255, 0.18)",
        buttonText: "var(--color-gray-f0)",
      }
    : {
        background: "rgba(250, 250, 250, 0.78)",
        border: "rgba(0, 0, 0, 0.08)",
        shadow: "0 10px 22px rgba(0, 0, 0, 0.18)",
        buttonBackground: "rgba(0, 0, 0, 0.06)",
        buttonBorder: "rgba(0, 0, 0, 0.08)",
        buttonText: "var(--color-gray-33)",
      };
  const wagerPanelButtonStyle: React.CSSProperties = {
    height: "100%",
    alignSelf: "center",
    justifySelf: "center",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: wagerPanelTheme.buttonBackground,
    border: `1px solid ${wagerPanelTheme.buttonBorder}`,
    color: wagerPanelTheme.buttonText,
    borderRadius: "999px",
    fontWeight: 600,
    fontSize: "0.9em",
    letterSpacing: "0.01em",
    cursor: "pointer",
    whiteSpace: "nowrap",
    minWidth: 0,
    padding: 0,
    margin: 0,
    outline: "none",
    boxSizing: "border-box" as const,
  };

  return (
    <>
      <div ref={auraLayerRef} style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "visible" }}>
        <div ref={opponentWrapperRef} style={{ position: "absolute", left: 0, top: 0, width: 0, height: 0, pointerEvents: "none", zIndex: 10, overflow: "visible" }}>
          <div
            style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
            ref={(div) => {
              opponentAuraContainerRef.current = div;
              if (div && !opponentAuraRefs.current) {
                opponentAuraRefs.current = attachRainbowAura(div);
              }
            }}
          />
        </div>
        <div ref={playerWrapperRef} style={{ position: "absolute", left: 0, top: 0, width: 0, height: 0, pointerEvents: "none", zIndex: 10, overflow: "visible" }}>
          <div
            style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
            ref={(div) => {
              playerAuraContainerRef.current = div;
              if (div && !playerAuraRefs.current) {
                playerAuraRefs.current = attachRainbowAura(div);
              }
            }}
          />
        </div>
      </div>

      <svg xmlns="http://www.w3.org/2000/svg" className={`board-svg ${isGridVisible ? "grid-visible" : "grid-hidden"}`} viewBox="0 0 1100 1410" shapeRendering="crispEdges" overflow="visible">
        {isGridVisible ? (
          <g id="boardBackgroundLayer">
            {generateBoardPattern({
              colorSet: currentColorSet,
              size: 1100,
              cellSize: 100,
              offsetY: 100,
              keyPrefix: "board",
            })}
          </g>
        ) : (
          <g id="boardBackgroundLayer">
            <rect x="1" y="101" height="1161" width="1098" fill={prefersDarkMode ? "var(--color-gray-23)" : "var(--boardBackgroundLight)"} />
            {shouldIncludePangchiuImage && (
              <image
                href="https://assets.mons.link/board/bg/Pangchiu.jpg"
                x="0"
                y="100"
                width="1100"
                style={{
                  backgroundColor: prefersDarkMode ? "var(--color-gray-23)" : "var(--boardBackgroundLight)",
                  display: isGridVisible ? "none" : "block",
                }}
              />
            )}
          </g>
        )}
        <g id="monsboard" transform={isGridVisible ? standardBoardTransform : pangchiuBoardTransform}></g>
        <g id="highlightsLayer" transform={isGridVisible ? standardBoardTransform : pangchiuBoardTransform}></g>
        <g id="itemsLayer" transform={isGridVisible ? standardBoardTransform : pangchiuBoardTransform}></g>
        <g id="controlsLayer"></g>
        <g id="effectsLayer" transform={isGridVisible ? standardBoardTransform : pangchiuBoardTransform}></g>
      </svg>

      <div
        className={`board-svg ${isGridVisible ? "grid-visible" : "grid-hidden"}`}
        style={{
          aspectRatio: "110 / 141",
          pointerEvents: "none",
        }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            zIndex: 0,
          }}>
          {wagerPanelLayout && (
            <div
              data-wager-panel="true"
              style={{
                position: "absolute",
                left: `${toPercentX(wagerPanelLayout.x)}%`,
                top: `${toPercentY(wagerPanelLayout.y)}%`,
                width: `${toPercentX(wagerPanelLayout.width)}%`,
                height: `${toPercentY(wagerPanelLayout.height)}%`,
                display: "grid",
                gridTemplateRows: wagerPanelLayout.gridRows,
                paddingLeft: `${wagerPanelLayout.paddingXPct}%`,
                paddingRight: `${wagerPanelLayout.paddingXPct}%`,
                boxSizing: "border-box",
                background: wagerPanelTheme.background,
                border: `1px solid ${wagerPanelTheme.border}`,
                boxShadow: wagerPanelTheme.shadow,
                borderRadius: "16px",
                backdropFilter: "blur(6px)",
                WebkitBackdropFilter: "blur(6px)",
                overflow: "hidden",
                pointerEvents: "auto",
                userSelect: "none",
                zIndex: 2,
              }}>
              {wagerCountLayout && (
                <div
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    left: `${wagerCountLayout.leftPct}%`,
                    top: `${wagerCountLayout.topPct}%`,
                    transform: "translate(0, -50%)",
                    fontSize: "0.72em",
                    fontWeight: 500,
                    letterSpacing: "0.02em",
                    color: prefersDarkMode ? "rgba(240, 240, 240, 0.6)" : "rgba(40, 40, 40, 0.52)",
                    pointerEvents: "none",
                    userSelect: "none",
                    whiteSpace: "nowrap",
                  }}>
                  ({activeWagerPanelCount})
                </div>
              )}
              <div aria-hidden="true" style={{ gridRow: wagerPanelLayout.pileRow }} />
              <div
                data-wager-panel="true"
                style={{
                  gridRow: wagerPanelLayout.buttonRow,
                  width: "100%",
                  justifySelf: "center",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: `${wagerPanelLayout.buttonGapPct}%`,
                  height: "100%",
                }}>
                {activeWagerPanelSide === "opponent" ? (
                  <>
                    <button
                      data-wager-panel="true"
                      type="button"
                      onClick={!isMobile ? handleWagerPanelAction : undefined}
                      onTouchStart={isMobile ? handleWagerPanelAction : undefined}
                      style={{ ...wagerPanelButtonStyle, flex: "1 1 0" }}>
                      Decline
                    </button>
                    <button
                      data-wager-panel="true"
                      type="button"
                      onClick={!isMobile ? handleWagerPanelAction : undefined}
                      onTouchStart={isMobile ? handleWagerPanelAction : undefined}
                      style={{ ...wagerPanelButtonStyle, flex: "1 1 0" }}>
                      Accept
                    </button>
                  </>
                ) : (
                  <button
                    data-wager-panel="true"
                    type="button"
                    onClick={!isMobile ? handleWagerPanelAction : undefined}
                    onTouchStart={isMobile ? handleWagerPanelAction : undefined}
                    style={{ ...wagerPanelButtonStyle, width: `${wagerPanelLayout.singleButtonWidthPct}%` }}>
                    Cancel Proposal
                  </button>
                )}
              </div>
            </div>
          )}
          <div
            ref={wagerPilesLayerRef}
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              zIndex: 3,
            }}
          />
        </div>
        <div
          style={{
            position: "absolute",
            left: "50%",
            transform: "translate(-50%, -100%)",
            top: isGridVisible ? "7.02%" : "7.05%",
            height: isGridVisible ? VIDEO_CONTAINER_HEIGHT_GRID : VIDEO_CONTAINER_HEIGHT_IMAGE,
            maxHeight: VIDEO_CONTAINER_MAX_HEIGHT,
            aspectRatio: VIDEO_CONTAINER_ASPECT_RATIO,
            zIndex: VIDEO_CONTAINER_Z_INDEX,
            pointerEvents: "none",
            touchAction: "none",
          }}>
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              width: "100%",
              height: "100%",
              pointerEvents: "none",
            }}
          />
          {opponentVideoVisible && opponentVideoId !== null && (
            <video
              key={opponentVideoId}
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                transform: opponentVideoAppearing ? "translate(-50%, -50%) scale(0.3) rotate(-10deg)" : opponentVideoFading ? "translate(-50%, -50%) scale(0.8) rotate(0deg)" : "translate(-50%, -50%) scale(1) rotate(0deg)",
                width: "100%",
                height: "100%",
                opacity: opponentVideoAppearing ? 0 : opponentVideoFading ? 0 : 1,
                transition: opponentVideoAppearing ? "opacity 0.3s ease-out, transform 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55)" : opponentVideoFading ? "opacity 0.2s ease-in, transform 0.2s ease-in" : "opacity 0.3s ease-out, transform 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55)",
              }}
              autoPlay
              muted
              playsInline
              onEnded={() => {
                setOpponentVideoFading(true);
                setTimeout(() => setOpponentVideoVisible(false), 200);
              }}>
              <source src={`https://assets.mons.link/swagpack/video/${opponentVideoId}.mov`} type='video/quicktime; codecs="hvc1"' />
              <source src={`https://assets.mons.link/swagpack/video/${opponentVideoId}.webm`} type="video/webm" />
            </video>
          )}
        </div>
        <div
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            top: isGridVisible ? "85.22%" : "89.65%",
            height: isGridVisible ? VIDEO_CONTAINER_HEIGHT_GRID : VIDEO_CONTAINER_HEIGHT_IMAGE,
            maxHeight: VIDEO_CONTAINER_MAX_HEIGHT,
            aspectRatio: VIDEO_CONTAINER_ASPECT_RATIO,
            zIndex: VIDEO_CONTAINER_Z_INDEX,
            pointerEvents: "none",
            touchAction: "none",
          }}>
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              width: "100%",
              height: "100%",
              pointerEvents: "none",
            }}
          />
          {playerVideoVisible && playerVideoId !== null && (
            <video
              key={playerVideoId}
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                transform: playerVideoAppearing ? "translate(-50%, -50%) scale(0.3) rotate(-10deg)" : playerVideoFading ? "translate(-50%, -50%) scale(0.8) rotate(0deg)" : "translate(-50%, -50%) scale(1) rotate(0deg)",
                width: "100%",
                height: "100%",
                opacity: playerVideoAppearing ? 0 : playerVideoFading ? 0 : 1,
                transition: playerVideoAppearing ? "opacity 0.3s ease-out, transform 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55)" : playerVideoFading ? "opacity 0.2s ease-in, transform 0.2s ease-in" : "opacity 0.3s ease-out, transform 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55)",
              }}
              autoPlay
              muted
              playsInline
              onEnded={() => {
                setPlayerVideoFading(true);
                setTimeout(() => setPlayerVideoVisible(false), 200);
              }}>
              <source src={`https://assets.mons.link/swagpack/video/${playerVideoId}.mov`} type='video/quicktime; codecs="hvc1"' />
              <source src={`https://assets.mons.link/swagpack/video/${playerVideoId}.webm`} type="video/webm" />
            </video>
          )}
        </div>
        {overlayState.svgElement && (
          <div
            style={{
              position: "absolute",
              left: "50%",
              transform: "translateX(-50%)",
              top: isGridVisible ? "7.02%" : "7.05%",
              pointerEvents: "all",
              height: isGridVisible ? "78.2%" : "82.6%",
              aspectRatio: isGridVisible ? "1" : "1524/1612",
              ...(overlayState.blurry
                ? {
                    backdropFilter: "blur(3px)",
                    WebkitBackdropFilter: "blur(3px)",
                  }
                : {}),
              overflow: "hidden",
              border: "none",
            }}
            ref={(div) => {
              if (div && overlayState.svgElement) {
                div.innerHTML = "";
                const wrapperSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                wrapperSvg.style.position = "absolute";
                wrapperSvg.style.top = "0";
                wrapperSvg.style.left = "0";
                wrapperSvg.style.width = "100%";
                wrapperSvg.style.height = "100%";
                wrapperSvg.setAttribute("viewBox", "0 0 1100 1100");
                wrapperSvg.setAttribute("preserveAspectRatio", "xMidYMid meet");
                wrapperSvg.appendChild(overlayState.svgElement);
                div.appendChild(wrapperSvg);
              }
            }}
          />
        )}
        {overlayState.withConfirmAndCancelButtons && (
          <div
            style={{
              position: "absolute",
              bottom: "30.5%",
              left: "50%",
              transform: "translateX(-50%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "27%",
              height: "10.8%",
              aspectRatio: "3.75",
              pointerEvents: "all",
            }}>
            <CircularButton onClick={!isMobile ? handleCancelClick : undefined} onTouchStart={isMobile ? handleCancelClick : undefined}>
              <FaTimes />
            </CircularButton>
            <CircularButton onClick={!isMobile ? handleConfirmClick : undefined} onTouchStart={isMobile ? handleConfirmClick : undefined}>
              <FaCheck />
            </CircularButton>
          </div>
        )}
      </div>
    </>
  );
};

export default BoardComponent;
