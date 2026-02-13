import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import styled from "styled-components";
import { FaTimes, FaCheck } from "react-icons/fa";
import { isWatchOnly, subscribeToWatchOnly } from "../game/gameController";
import { getCurrentTarget, transition } from "../session/AppSessionManager";
import { ColorSet, getCurrentColorSet, isCustomPictureBoardEnabled } from "../content/boardStyles";
import { defaultInputEventName, isMobile } from "../utils/misc";
import { generateBoardPattern } from "../utils/boardPatternGenerator";
import { attachRainbowAura, hideRainbowAura as hideAuraDom, setRainbowAuraMask, showRainbowAura as showAuraDom } from "./rainbowAura";
import { playerSideMetadata, opponentSideMetadata, setWagerRenderHandler, WagerPileSide, WagerRenderState, WagerPileRenderState } from "../game/board";
import { setWagerPanelOutsideTapHandler, setWagerPanelVisibilityChecker } from "./BottomControls";
import { connection } from "../connection/connection";
import { MatchWagerState } from "../connection/connectionModels";
import { subscribeToWagerState } from "../game/wagerState";
import { rocksMiningService } from "../services/rocksMiningService";
import { computeAvailableMaterials, getFrozenMaterials, subscribeToFrozenMaterials } from "../services/wagerMaterialsService";

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

export let setTopBoardOverlayVisible: (blurry: boolean, svgElement: SVGElement | null, withConfirmAndCancelButtons: boolean, ok?: () => void, cancel?: () => void) => void = () => {};
export let showVideoReaction: (opponent: boolean, stickerId: number) => void = () => {};
export let showRaibowAura: (visible: boolean, url: string, opponent: boolean) => void = () => {};
export let updateAuraForAvatarElement: (opponent: boolean, avatarElement: SVGElement) => void = () => {};
export let updateWagerPlayerUids: (playerUid: string, opponentUid: string) => void = () => {};
export let clearBoardTransientUi: (fadeOutVideos?: boolean) => void = () => {};

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
const WAGER_PANEL_BUTTON_GAP_PX = 8;
const WAGER_PANEL_PILE_GAP_FRAC = 0.2;
const WAGER_PANEL_MIN_PADDING_PX = 12;
const WAGER_PANEL_MIN_BUTTON_HEIGHT_PX = 34;
const WAGER_PANEL_MIN_DECLINE_BUTTON_WIDTH_PX = 80;
const WAGER_PANEL_MIN_ACCEPT_BUTTON_WIDTH_PX = 110;
const WAGER_PANEL_MIN_PLAYER_BUTTON_WIDTH_PX = 150;
const WAGER_PANEL_BUTTON_PADDING_X_PX = 16;
const WAGER_PANEL_COUNT_GAP_FRAC = 0.06;
const WAGER_PANEL_COUNT_MIN_GAP_PX = 4;
const WAGER_PANEL_COUNT_MIN_WIDTH_PX = 32;
const WAGER_PANEL_COUNT_Y_OFFSET_FRAC = 0.04;

const PENDING_PULSE_KEYFRAMES_NAME = "wagerPilePendingPulse";
const PENDING_PULSE_ANIMATION = `${PENDING_PULSE_KEYFRAMES_NAME} 1.4s ease-in-out infinite`;

const injectPendingPulseKeyframes = (() => {
  let injected = false;
  return () => {
    if (injected) return;
    injected = true;
    const style = document.createElement("style");
    style.textContent = `
      @keyframes ${PENDING_PULSE_KEYFRAMES_NAME} {
        0%, 100% { opacity: 1; }
        15% { opacity: 1; }
        40% { opacity: 0.2; }
        60% { opacity: 0.2; }
        85% { opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  };
})();

type WagerPileElements = {
  player: HTMLDivElement;
  opponent: HTMLDivElement;
  winner: HTMLDivElement;
  playerDisappearing: HTMLDivElement;
  opponentDisappearing: HTMLDivElement;
  playerIcons: HTMLImageElement[];
  opponentIcons: HTMLImageElement[];
  winnerIcons: HTMLImageElement[];
  playerDisappearingIcons: HTMLImageElement[];
  opponentDisappearingIcons: HTMLImageElement[];
};

const toPercentX = (value: number) => (value / BOARD_WIDTH_UNITS) * 100;
const toPercentY = (value: number) => (value / BOARD_HEIGHT_UNITS) * 100;

const getWagerPanelLayout = (
  rect: { x: number; y: number; w: number; h: number },
  isOpponent: boolean,
  boardPixelSize: { width: number; height: number } | null,
  hasActions: boolean
): {
  x: number;
  y: number;
  width: number;
  height: number;
  gridRows: string;
  paddingXPx: number;
  pileRow: number;
  buttonRow: number;
  buttonGapPx: number;
  declineButtonMinWidthPx: number;
  acceptButtonMinWidthPx: number;
  playerButtonMinWidthPx: number;
  buttonPaddingXPx: number;
  countGap: number;
} => {
  const pxPerUnitX = boardPixelSize ? boardPixelSize.width / BOARD_WIDTH_UNITS : null;
  const pxPerUnitY = boardPixelSize ? boardPixelSize.height / BOARD_HEIGHT_UNITS : null;
  const minPaddingX = pxPerUnitX ? WAGER_PANEL_MIN_PADDING_PX / pxPerUnitX : 0;
  const minPaddingY = pxPerUnitY ? WAGER_PANEL_MIN_PADDING_PX / pxPerUnitY : 0;
  const paddingX = Math.max(rect.w * WAGER_PANEL_PADDING_X_FRAC, minPaddingX);
  const paddingY = Math.max(rect.h * WAGER_PANEL_PADDING_Y_FRAC, minPaddingY);
  const minButtonHeight = pxPerUnitY ? WAGER_PANEL_MIN_BUTTON_HEIGHT_PX / pxPerUnitY : 0;
  const buttonHeight = hasActions ? Math.max(rect.h * WAGER_PANEL_BUTTON_HEIGHT_FRAC, minButtonHeight) : 0;
  const minCountGap = pxPerUnitX ? WAGER_PANEL_COUNT_MIN_GAP_PX / pxPerUnitX : 0;
  const countGap = Math.max(rect.w * WAGER_PANEL_COUNT_GAP_FRAC, minCountGap);
  const minCountWidth = pxPerUnitX ? WAGER_PANEL_COUNT_MIN_WIDTH_PX / pxPerUnitX : 0;
  const pileGap = hasActions ? rect.h * WAGER_PANEL_PILE_GAP_FRAC : 0;
  const borderAndBufferPx = 4;
  const opponentButtonsMinWidthPx = WAGER_PANEL_MIN_DECLINE_BUTTON_WIDTH_PX + WAGER_PANEL_MIN_ACCEPT_BUTTON_WIDTH_PX + WAGER_PANEL_BUTTON_GAP_PX + borderAndBufferPx;
  const playerButtonMinWidthPx = WAGER_PANEL_MIN_PLAYER_BUTTON_WIDTH_PX + borderAndBufferPx;
  const buttonRowMinWidthPx = isOpponent ? opponentButtonsMinWidthPx : playerButtonMinWidthPx;
  const buttonRowMinWidthUnits = pxPerUnitX ? buttonRowMinWidthPx / pxPerUnitX : 0;
  const minPanelContentWidth = rect.w + countGap + minCountWidth;
  const buttonRowWidth = hasActions ? Math.max(rect.w, buttonRowMinWidthUnits, minPanelContentWidth) : minPanelContentWidth;
  const panelWidth = buttonRowWidth + paddingX * 2;
  const panelHeight = rect.h + paddingY * 2 + pileGap + buttonHeight;
  const centerX = rect.x + rect.w / 2;
  const panelX = centerX - panelWidth / 2;
  const panelY = isOpponent ? rect.y - paddingY : rect.y - (panelHeight - rect.h - paddingY);
  const rowValues = hasActions
    ? isOpponent
      ? [paddingY, rect.h, pileGap, buttonHeight, paddingY]
      : [paddingY, buttonHeight, pileGap, rect.h, paddingY]
    : [paddingY, rect.h, paddingY];
  const gridRows = rowValues.map((value) => `${(value / panelHeight) * 100}%`).join(" ");
  const paddingXPx = pxPerUnitX ? paddingX * pxPerUnitX : WAGER_PANEL_MIN_PADDING_PX;
  const pileRow = hasActions ? (isOpponent ? 2 : 4) : 2;
  const buttonRow = hasActions ? (isOpponent ? 4 : 2) : 0;

  return {
    x: panelX,
    y: panelY,
    width: panelWidth,
    height: panelHeight,
    gridRows,
    paddingXPx,
    pileRow,
    buttonRow,
    buttonGapPx: WAGER_PANEL_BUTTON_GAP_PX,
    declineButtonMinWidthPx: WAGER_PANEL_MIN_DECLINE_BUTTON_WIDTH_PX,
    acceptButtonMinWidthPx: WAGER_PANEL_MIN_ACCEPT_BUTTON_WIDTH_PX,
    playerButtonMinWidthPx: WAGER_PANEL_MIN_PLAYER_BUTTON_WIDTH_PX,
    buttonPaddingXPx: WAGER_PANEL_BUTTON_PADDING_X_PX,
    countGap,
  };
};

const BoardComponent: React.FC = () => {
  injectPendingPulseKeyframes();

  const [opponentVideoId, setOpponentVideoId] = useState<number | null>(null);
  const [opponentVideoVisible, setOpponentVideoVisible] = useState(false);
  const [opponentVideoFading, setOpponentVideoFading] = useState(false);
  const [opponentVideoAppearing, setOpponentVideoAppearing] = useState(false);

  const [playerVideoId, setPlayerVideoId] = useState<number | null>(null);
  const [playerVideoVisible, setPlayerVideoVisible] = useState(false);
  const [playerVideoFading, setPlayerVideoFading] = useState(false);
  const [playerVideoAppearing, setPlayerVideoAppearing] = useState(false);
  const opponentVideoDismissTimeoutRef = useRef<number | null>(null);
  const playerVideoDismissTimeoutRef = useRef<number | null>(null);
  const [currentColorSet, setCurrentColorSet] = useState<ColorSet>(getCurrentColorSet());
  const [prefersDarkMode] = useState(window.matchMedia("(prefers-color-scheme: dark)").matches);
  const [isGridVisible, setIsGridVisible] = useState(!isCustomPictureBoardEnabled());
  const [shouldIncludePangchiuImage, setShouldIncludePangchiuImage] = useState(isCustomPictureBoardEnabled());
  const [overlayState, setOverlayState] = useState<{ blurry: boolean; svgElement: SVGElement | null; withConfirmAndCancelButtons: boolean; ok?: () => void; cancel?: () => void }>({ blurry: true, svgElement: null, withConfirmAndCancelButtons: false });
  const [wagerState, setWagerState] = useState<MatchWagerState | null>(null);
  const [miningMaterials, setMiningMaterials] = useState(rocksMiningService.getSnapshot().materials);
  const [frozenMaterials, setFrozenMaterialsState] = useState(getFrozenMaterials());
  const [watchOnlySnapshot, setWatchOnlySnapshot] = useState(isWatchOnly);
  const [playerUidSnapshot, setPlayerUidSnapshot] = useState(playerSideMetadata.uid);
  const [opponentUidSnapshot, setOpponentUidSnapshot] = useState(opponentSideMetadata.uid);
  const [activeWagerPanelSide, setActiveWagerPanelSide] = useState<WagerPileSide | "winner" | null>(null);
  const [activeWagerPanelRect, setActiveWagerPanelRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [activeWagerPanelCount, setActiveWagerPanelCount] = useState<number | null>(null);
  const [boardPixelSize, setBoardPixelSize] = useState<{ width: number; height: number } | null>(null);
  const wagerPilesLayerRef = useRef<HTMLDivElement | null>(null);
  const wagerPileElementsRef = useRef<WagerPileElements | null>(null);
  const wagerRenderStateRef = useRef<WagerRenderState | null>(null);
  const activeWagerPanelSideRef = useRef<WagerPileSide | "winner" | null>(null);
  const activeWagerPanelRectRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const activeWagerPanelCountRef = useRef<number | null>(null);
  const disappearingAnimationStartedRef = useRef<{ player: boolean; opponent: boolean }>({ player: false, opponent: false });
  const pendingBlinkDelayTimersRef = useRef<{ player: number | null; opponent: number | null }>({ player: null, opponent: null });
  const pendingBlinkEnabledRef = useRef<{ player: boolean; opponent: boolean }>({ player: false, opponent: false });
  const previousMaterialUrlRef = useRef<{ player: string | null; opponent: string | null }>({ player: null, opponent: null });
  const materialChangeOldIconsRef = useRef<{ player: HTMLImageElement[]; opponent: HTMLImageElement[] }>({ player: [], opponent: [] });
  const wagerPanelStateRef = useRef<{ actionsLocked: boolean; playerHasProposal: boolean; opponentHasProposal: boolean }>({
    actionsLocked: true,
    playerHasProposal: false,
    opponentHasProposal: false,
  });
  const opponentAuraContainerRef = useRef<HTMLDivElement | null>(null);
  const playerAuraContainerRef = useRef<HTMLDivElement | null>(null);
  const opponentAuraRefs = useRef<{ background: HTMLDivElement; inner: HTMLDivElement } | null>(null);
  const playerAuraRefs = useRef<{ background: HTMLDivElement; inner: HTMLDivElement } | null>(null);
  const auraLayerRef = useRef<HTMLDivElement | null>(null);
  const opponentWrapperRef = useRef<HTMLDivElement | null>(null);
  const playerWrapperRef = useRef<HTMLDivElement | null>(null);

  updateWagerPlayerUids = (nextPlayerUid: string, nextOpponentUid: string) => {
    setPlayerUidSnapshot((prev) => (prev === nextPlayerUid ? prev : nextPlayerUid));
    setOpponentUidSnapshot((prev) => (prev === nextOpponentUid ? prev : nextOpponentUid));
  };

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

  const clearOpponentVideoDismissTimeout = useCallback(() => {
    if (opponentVideoDismissTimeoutRef.current !== null) {
      window.clearTimeout(opponentVideoDismissTimeoutRef.current);
      opponentVideoDismissTimeoutRef.current = null;
    }
  }, []);

  const clearPlayerVideoDismissTimeout = useCallback(() => {
    if (playerVideoDismissTimeoutRef.current !== null) {
      window.clearTimeout(playerVideoDismissTimeoutRef.current);
      playerVideoDismissTimeoutRef.current = null;
    }
  }, []);

  const dismissOpponentVideo = useCallback((durationMs: number) => {
    clearOpponentVideoDismissTimeout();
    setOpponentVideoAppearing(false);
    setOpponentVideoFading(true);
    opponentVideoDismissTimeoutRef.current = window.setTimeout(() => {
      setOpponentVideoVisible(false);
      setOpponentVideoFading(false);
      setOpponentVideoId(null);
      opponentVideoDismissTimeoutRef.current = null;
    }, durationMs);
  }, [clearOpponentVideoDismissTimeout]);

  const dismissPlayerVideo = useCallback((durationMs: number) => {
    clearPlayerVideoDismissTimeout();
    setPlayerVideoAppearing(false);
    setPlayerVideoFading(true);
    playerVideoDismissTimeoutRef.current = window.setTimeout(() => {
      setPlayerVideoVisible(false);
      setPlayerVideoFading(false);
      setPlayerVideoId(null);
      playerVideoDismissTimeoutRef.current = null;
    }, durationMs);
  }, [clearPlayerVideoDismissTimeout]);

  const clearVideoReactionsNow = useCallback(() => {
    clearOpponentVideoDismissTimeout();
    clearPlayerVideoDismissTimeout();
    setOpponentVideoVisible(false);
    setOpponentVideoFading(false);
    setOpponentVideoAppearing(false);
    setOpponentVideoId(null);
    setPlayerVideoVisible(false);
    setPlayerVideoFading(false);
    setPlayerVideoAppearing(false);
    setPlayerVideoId(null);
  }, [clearOpponentVideoDismissTimeout, clearPlayerVideoDismissTimeout]);

  showVideoReaction = (opponent: boolean, stickerId: number) => {
    if (opponent) {
      clearOpponentVideoDismissTimeout();
      setOpponentVideoId(stickerId);
      setOpponentVideoVisible(true);
      setOpponentVideoFading(false);
      setOpponentVideoAppearing(true);
      setTimeout(() => setOpponentVideoAppearing(false), 400);
    } else {
      clearPlayerVideoDismissTimeout();
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
    return () => {
      clearOpponentVideoDismissTimeout();
      clearPlayerVideoDismissTimeout();
      setTopBoardOverlayVisible = () => {};
      showVideoReaction = () => {};
      showRaibowAura = () => {};
      updateAuraForAvatarElement = () => {};
      updateWagerPlayerUids = () => {};
      clearBoardTransientUi = () => {};
    };
  }, [clearOpponentVideoDismissTimeout, clearPlayerVideoDismissTimeout]);

  const proposals = wagerState?.proposals || {};
  const playerUid = playerUidSnapshot;
  const opponentUid = opponentUidSnapshot;
  const playerProposal = playerUid && proposals[playerUid] ? proposals[playerUid] : null;
  const opponentProposal = opponentUid && proposals[opponentUid] ? proposals[opponentUid] : null;
  const wagerAgreement = wagerState?.agreed ?? null;
  const wagerResolved = wagerState?.resolved ?? null;
  const wagerActionsLocked = watchOnlySnapshot || !!wagerAgreement || !!wagerResolved;
  const availableMaterials = computeAvailableMaterials(miningMaterials, frozenMaterials);
  const opponentMaterial = opponentProposal?.material ?? null;
  const opponentCount = opponentProposal?.count ?? 0;
  const extraAvailable = playerProposal && opponentMaterial && playerProposal.material === opponentMaterial ? playerProposal.count : 0;
  const acceptCount = opponentMaterial ? Math.min(opponentCount, (availableMaterials[opponentMaterial] ?? 0) + extraAvailable) : 0;
  const acceptLabel = acceptCount > 0 && acceptCount < opponentCount ? `Accept (${acceptCount})` : "Accept";
  const canAccept = acceptCount > 0;
  const showOpponentActions = !wagerActionsLocked && activeWagerPanelSide === "opponent" && !!opponentProposal;
  const showPlayerActions = !wagerActionsLocked && activeWagerPanelSide === "player" && !!playerProposal;
  const wagerPanelHasActions = showOpponentActions || showPlayerActions;

  useEffect(() => {
    void transition(getCurrentTarget(), { skipNavigation: true, force: true });
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToWagerState((state) => {
      setWagerState(state);
      setWatchOnlySnapshot(isWatchOnly);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToWatchOnly((value) => {
      setWatchOnlySnapshot(value);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const unsubscribe = rocksMiningService.subscribe((snapshot) => {
      setMiningMaterials(snapshot.materials);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToFrozenMaterials((materials) => {
      setFrozenMaterialsState(materials);
    });
    return () => {
      unsubscribe();
    };
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

  useEffect(() => {
    wagerPanelStateRef.current = {
      actionsLocked: wagerActionsLocked,
      playerHasProposal: !!playerProposal,
      opponentHasProposal: !!opponentProposal,
    };
  }, [opponentProposal, playerProposal, wagerActionsLocked]);

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

  clearBoardTransientUi = (fadeOutVideos: boolean = true) => {
    clearWagerPanel();
    setOverlayState({ blurry: true, svgElement: null, withConfirmAndCancelButtons: false });
    if (opponentAuraRefs.current) {
      hideAuraDom(opponentAuraRefs.current.background);
    }
    if (playerAuraRefs.current) {
      hideAuraDom(playerAuraRefs.current.background);
    }
    if (!fadeOutVideos) {
      clearVideoReactionsNow();
      return;
    }
    if (opponentVideoVisible) {
      dismissOpponentVideo(120);
    } else {
      setOpponentVideoVisible(false);
      setOpponentVideoFading(false);
      setOpponentVideoAppearing(false);
      setOpponentVideoId(null);
    }
    if (playerVideoVisible) {
      dismissPlayerVideo(120);
    } else {
      setPlayerVideoVisible(false);
      setPlayerVideoFading(false);
      setPlayerVideoAppearing(false);
      setPlayerVideoId(null);
    }
  };

  const openWagerPanelForSide = useCallback(
    (side: WagerPileSide | "winner") => {
      const state = wagerRenderStateRef.current;
      if (!state || state.winAnimationActive) {
        clearWagerPanel();
        return;
      }
      const pileState = side === "winner" ? state.winner : side === "opponent" ? state.opponent : state.player;
      if (!pileState) {
        clearWagerPanel();
        return;
      }
      activeWagerPanelSideRef.current = side;
      activeWagerPanelRectRef.current = pileState.rect;
      activeWagerPanelCountRef.current = pileState.actualCount ?? pileState.count;
      setActiveWagerPanelSide(side);
      setActiveWagerPanelRect(pileState.rect);
      setActiveWagerPanelCount(pileState.actualCount ?? pileState.count);
    },
    [clearWagerPanel]
  );

  const handleWagerCancel = useCallback(
    (event?: React.SyntheticEvent) => {
      if (event) {
        event.stopPropagation();
        if (event.cancelable) {
          event.preventDefault();
        }
      }
      if (wagerActionsLocked || !playerProposal) {
        clearWagerPanel();
        return;
      }
      clearWagerPanel();
      connection.cancelWagerProposal().catch(() => {});
    },
    [clearWagerPanel, playerProposal, wagerActionsLocked]
  );

  const handleWagerDecline = useCallback(
    (event?: React.SyntheticEvent) => {
      if (event) {
        event.stopPropagation();
        if (event.cancelable) {
          event.preventDefault();
        }
      }
      if (wagerActionsLocked || !opponentProposal) {
        clearWagerPanel();
        return;
      }
      clearWagerPanel();
      connection.declineWagerProposal().catch(() => {});
    },
    [clearWagerPanel, opponentProposal, wagerActionsLocked]
  );

  const handleWagerAccept = useCallback(
    (event?: React.SyntheticEvent) => {
      if (event) {
        event.stopPropagation();
        if (event.cancelable) {
          event.preventDefault();
        }
      }
      if (wagerActionsLocked || !opponentProposal || !canAccept) {
        clearWagerPanel();
        return;
      }
      clearWagerPanel();
      connection.acceptWagerProposal().catch(() => {});
    },
    [canAccept, clearWagerPanel, opponentProposal, wagerActionsLocked]
  );

  useEffect(() => {
    if (activeWagerPanelSideRef.current === "opponent" && !opponentProposal) {
      clearWagerPanel();
      return;
    }
    if (activeWagerPanelSideRef.current === "player" && !playerProposal) {
      clearWagerPanel();
    }
  }, [clearWagerPanel, opponentProposal, playerProposal]);

  const ensureWagerPileElements = useCallback((): WagerPileElements | null => {
    const layer = wagerPilesLayerRef.current;
    if (!layer) {
      return null;
    }
    const existing = wagerPileElementsRef.current;
    if (
      existing &&
      layer.contains(existing.player) &&
      layer.contains(existing.opponent) &&
      layer.contains(existing.winner) &&
      layer.contains(existing.playerDisappearing) &&
      layer.contains(existing.opponentDisappearing)
    ) {
      return existing;
    }
    layer.innerHTML = "";

    const createPileContainer = (side: WagerPileSide | "winner", isInteractive: boolean) => {
      const container = document.createElement("div");
      container.dataset.wagerPile = side;
      container.style.position = "absolute";
      container.style.left = "0";
      container.style.top = "0";
      container.style.width = "0";
      container.style.height = "0";
      container.style.display = "block";
      container.style.opacity = "0";
      container.style.pointerEvents = isInteractive ? "auto" : "none";
      container.style.touchAction = "none";
      container.style.userSelect = "none";
      container.style.zIndex = isInteractive ? "3" : "2";
      container.style.overflow = "visible";
      container.style.cursor = isInteractive ? "pointer" : "default";
      if (isInteractive) {
        container.addEventListener(defaultInputEventName, (event) => {
          event.stopPropagation();
          if (event.cancelable) {
            event.preventDefault();
          }
          const config = wagerPanelStateRef.current;
          if (!config.actionsLocked) {
            if (side === "player" && !config.playerHasProposal) {
              clearWagerPanel();
              return;
            }
            if (side === "opponent" && !config.opponentHasProposal) {
              clearWagerPanel();
              return;
            }
          }
          if (activeWagerPanelSideRef.current === side) {
            clearWagerPanel();
            return;
          }
          openWagerPanelForSide(side);
        });
      }
      return container;
    };

    const playerDisappearing = createPileContainer("player", false);
    const opponentDisappearing = createPileContainer("opponent", false);
    const player = createPileContainer("player", true);
    const opponent = createPileContainer("opponent", true);
    const winner = createPileContainer("winner", true);
    layer.append(playerDisappearing, opponentDisappearing, player, opponent, winner);
    const elements: WagerPileElements = {
      player,
      opponent,
      winner,
      playerDisappearing,
      opponentDisappearing,
      playerIcons: [],
      opponentIcons: [],
      winnerIcons: [],
      playerDisappearingIcons: [],
      opponentDisappearingIcons: [],
    };
    wagerPileElementsRef.current = elements;
    return elements;
  }, [clearWagerPanel, openWagerPanelForSide]);

  const applyWagerRenderState = useCallback(
    (state: WagerRenderState) => {
      wagerRenderStateRef.current = state;
      const elements = ensureWagerPileElements();
      if (!elements) {
        return;
      }

      const APPEAR_ANIMATION_DURATION_MS = 320;
      const APPEAR_ANIMATION_OFFSET_PCT = 35;

      const PENDING_BLINK_DELAY_MS = 1300;

      const MATERIAL_CHANGE_FADE_MS = 280;

      const updatePile = (
        container: HTMLDivElement,
        icons: HTMLImageElement[],
        pileState: WagerPileRenderState | null,
        isOpponentSide: boolean,
        side: WagerPileSide | "winner"
      ) => {
        const sideKey = side === "player" || side === "opponent" ? side : null;

        if (!pileState || pileState.count <= 0 || pileState.frames.length === 0) {
          container.style.opacity = "0";
          container.style.pointerEvents = "none";
          container.style.animation = "none";
          if (sideKey) {
            if (pendingBlinkDelayTimersRef.current[sideKey] !== null) {
              window.clearTimeout(pendingBlinkDelayTimersRef.current[sideKey]!);
              pendingBlinkDelayTimersRef.current[sideKey] = null;
            }
            pendingBlinkEnabledRef.current[sideKey] = false;
            previousMaterialUrlRef.current[sideKey] = null;
            materialChangeOldIconsRef.current[sideKey].forEach((icon) => icon.remove());
            materialChangeOldIconsRef.current[sideKey] = [];
          }
          while (icons.length > 0) {
            const icon = icons.pop();
            if (icon) {
              icon.remove();
            }
          }
          return;
        }
        const rect = pileState.rect;
        if (rect.w === 0 || rect.h === 0) {
          container.style.opacity = "0";
          container.style.pointerEvents = "none";
          container.style.animation = "none";
          if (sideKey) {
            if (pendingBlinkDelayTimersRef.current[sideKey] !== null) {
              window.clearTimeout(pendingBlinkDelayTimersRef.current[sideKey]!);
              pendingBlinkDelayTimersRef.current[sideKey] = null;
            }
            pendingBlinkEnabledRef.current[sideKey] = false;
            previousMaterialUrlRef.current[sideKey] = null;
            materialChangeOldIconsRef.current[sideKey].forEach((icon) => icon.remove());
            materialChangeOldIconsRef.current[sideKey] = [];
          }
          while (icons.length > 0) {
            const icon = icons.pop();
            if (icon) {
              icon.remove();
            }
          }
          return;
        }
        container.style.opacity = "1";
        container.style.pointerEvents = "auto";

        if (sideKey && pileState.isPending) {
          if (pileState.animation === "appear") {
            pendingBlinkEnabledRef.current[sideKey] = false;
            if (pendingBlinkDelayTimersRef.current[sideKey] !== null) {
              window.clearTimeout(pendingBlinkDelayTimersRef.current[sideKey]!);
            }
            pendingBlinkDelayTimersRef.current[sideKey] = window.setTimeout(() => {
              pendingBlinkDelayTimersRef.current[sideKey] = null;
              pendingBlinkEnabledRef.current[sideKey] = true;
              container.style.animation = PENDING_PULSE_ANIMATION;
            }, PENDING_BLINK_DELAY_MS);
            container.style.animation = "none";
          } else {
            if (!pendingBlinkEnabledRef.current[sideKey] && pendingBlinkDelayTimersRef.current[sideKey] === null) {
              pendingBlinkEnabledRef.current[sideKey] = true;
            }
            container.style.animation = pendingBlinkEnabledRef.current[sideKey] ? PENDING_PULSE_ANIMATION : "none";
          }
        } else if (sideKey) {
          if (pendingBlinkDelayTimersRef.current[sideKey] !== null) {
            window.clearTimeout(pendingBlinkDelayTimersRef.current[sideKey]!);
            pendingBlinkDelayTimersRef.current[sideKey] = null;
          }
          pendingBlinkEnabledRef.current[sideKey] = false;
          container.style.animation = "none";
        } else {
          container.style.animation = "none";
        }
        container.style.left = `${toPercentX(rect.x)}%`;
        container.style.top = `${toPercentY(rect.y)}%`;
        container.style.width = `${toPercentX(rect.w)}%`;
        container.style.height = `${toPercentY(rect.h)}%`;

        const materialUrl = pileState.materialUrl;
        const iconSize = pileState.iconSize;
        const sizePctW = (iconSize / rect.w) * 100;
        const sizePctH = (iconSize / rect.h) * 100;
        const visibleCount = Math.min(pileState.count, pileState.frames.length);
        const animationOffsetY = isOpponentSide ? -APPEAR_ANIMATION_OFFSET_PCT : APPEAR_ANIMATION_OFFSET_PCT;

        const prevMaterial = sideKey ? previousMaterialUrlRef.current[sideKey] : null;
        const materialChanged = sideKey && prevMaterial !== null && prevMaterial !== materialUrl && icons.length > 0;
        const shouldAnimate = pileState.animation === "appear" || materialChanged;

        if (materialChanged && sideKey) {
          const oldIcons = [...icons];
          oldIcons.forEach((icon) => {
            icon.style.transition = `opacity ${MATERIAL_CHANGE_FADE_MS}ms ease-out`;
            icon.style.opacity = "0";
          });
          materialChangeOldIconsRef.current[sideKey].forEach((icon) => icon.remove());
          materialChangeOldIconsRef.current[sideKey] = oldIcons;
          setTimeout(() => {
            oldIcons.forEach((icon) => icon.remove());
            if (materialChangeOldIconsRef.current[sideKey] === oldIcons) {
              materialChangeOldIconsRef.current[sideKey] = [];
            }
          }, MATERIAL_CHANGE_FADE_MS);
          icons.length = 0;
        }

        if (sideKey) {
          previousMaterialUrlRef.current[sideKey] = materialUrl;
        }

        while (icons.length > visibleCount) {
          const icon = icons.pop();
          if (icon) {
            icon.remove();
          }
        }

        const newIconsStartIndex = icons.length;

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
          if (shouldAnimate) {
            icon.style.opacity = "0";
            icon.style.transform = `translateY(${animationOffsetY}%)`;
          }
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

        if (shouldAnimate && newIconsStartIndex < visibleCount) {
          const triggerAnimation = () => {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                for (let i = newIconsStartIndex; i < visibleCount; i += 1) {
                  const icon = icons[i];
                  if (icon) {
                    const delay = (i - newIconsStartIndex) * 25;
                    icon.style.transition = `opacity ${APPEAR_ANIMATION_DURATION_MS}ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms, transform ${APPEAR_ANIMATION_DURATION_MS}ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms`;
                    icon.style.opacity = "1";
                    icon.style.transform = "translateY(0)";
                  }
                }
              });
            });
          };

          const firstNewIcon = icons[newIconsStartIndex];
          if (firstNewIcon && firstNewIcon.complete && firstNewIcon.naturalWidth > 0) {
            triggerAnimation();
          } else if (firstNewIcon) {
            const onLoad = () => {
              firstNewIcon.removeEventListener("load", onLoad);
              firstNewIcon.removeEventListener("error", onLoad);
              triggerAnimation();
            };
            firstNewIcon.addEventListener("load", onLoad);
            firstNewIcon.addEventListener("error", onLoad);
          }
        }
      };

      const DISAPPEAR_ANIMATION_DURATION_MS = 280;

      const updateDisappearingPile = (
        container: HTMLDivElement,
        icons: HTMLImageElement[],
        disappearingState: WagerPileRenderState | null,
        side: "player" | "opponent",
        startingOpacity: string
      ) => {
        if (!disappearingState || disappearingState.count <= 0 || disappearingState.frames.length === 0) {
          container.style.transition = "none";
          container.style.opacity = "0";
          container.style.pointerEvents = "none";
          disappearingAnimationStartedRef.current[side] = false;
          while (icons.length > 0) {
            const icon = icons.pop();
            if (icon) icon.remove();
          }
          return;
        }

        if (disappearingAnimationStartedRef.current[side]) {
          return;
        }

        const rect = disappearingState.rect;
        if (rect.w === 0 || rect.h === 0) {
          container.style.transition = "none";
          container.style.opacity = "0";
          container.style.pointerEvents = "none";
          return;
        }

        container.style.left = `${toPercentX(rect.x)}%`;
        container.style.top = `${toPercentY(rect.y)}%`;
        container.style.width = `${toPercentX(rect.w)}%`;
        container.style.height = `${toPercentY(rect.h)}%`;
        container.style.pointerEvents = "none";
        container.style.transition = "none";
        container.style.animation = "none";
        container.style.opacity = startingOpacity;

        const materialUrl = disappearingState.materialUrl;
        const iconSize = disappearingState.iconSize;
        const sizePctW = (iconSize / rect.w) * 100;
        const sizePctH = (iconSize / rect.h) * 100;
        const visibleCount = Math.min(disappearingState.count, disappearingState.frames.length);

        while (icons.length > visibleCount) {
          const icon = icons.pop();
          if (icon) icon.remove();
        }
        while (icons.length < visibleCount) {
          const icon = document.createElement("img");
          icon.alt = "";
          icon.draggable = false;
          icon.style.position = "absolute";
          icon.style.pointerEvents = "none";
          icon.style.userSelect = "none";
          icon.style.objectFit = "contain";
          container.appendChild(icon);
          icons.push(icon);
        }

        for (let i = 0; i < visibleCount; i += 1) {
          const frame = disappearingState.frames[i];
          if (!frame) continue;
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

        disappearingAnimationStartedRef.current[side] = true;

        const triggerFade = () => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              container.style.transition = `opacity ${DISAPPEAR_ANIMATION_DURATION_MS}ms ease-out`;
              container.style.opacity = "0";
            });
          });
        };

        const firstIcon = icons[0];
        if (firstIcon && firstIcon.complete && firstIcon.naturalWidth > 0) {
          triggerFade();
        } else if (firstIcon) {
          const onLoad = () => {
            firstIcon.removeEventListener("load", onLoad);
            firstIcon.removeEventListener("error", onLoad);
            triggerFade();
          };
          firstIcon.addEventListener("load", onLoad);
          firstIcon.addEventListener("error", onLoad);
        } else {
          triggerFade();
        }
      };

      const opponentCurrentOpacity = state.opponentDisappearing ? window.getComputedStyle(elements.opponent).opacity : "1";
      const playerCurrentOpacity = state.playerDisappearing ? window.getComputedStyle(elements.player).opacity : "1";

      updatePile(elements.opponent, elements.opponentIcons, state.opponent, true, "opponent");
      updatePile(elements.player, elements.playerIcons, state.player, false, "player");
      updatePile(elements.winner, elements.winnerIcons, state.winner, false, "winner");

      updateDisappearingPile(elements.opponentDisappearing, elements.opponentDisappearingIcons, state.opponentDisappearing, "opponent", opponentCurrentOpacity);
      updateDisappearingPile(elements.playerDisappearing, elements.playerDisappearingIcons, state.playerDisappearing, "player", playerCurrentOpacity);

      const activeSide = activeWagerPanelSideRef.current;
      if (activeSide) {
        if (state.winAnimationActive) {
          clearWagerPanel();
        } else if (state.winner && activeSide !== "winner") {
          clearWagerPanel();
        } else {
          const pileState = activeSide === "winner" ? state.winner : activeSide === "opponent" ? state.opponent : state.player;
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
  const isOpponentPanel =
    activeWagerPanelSide === "opponent"
      ? true
      : activeWagerPanelSide === "player"
        ? false
        : activeWagerPileRect
          ? activeWagerPileRect.y < BOARD_HEIGHT_UNITS * 0.5
          : false;
  const wagerPanelLayout =
    activeWagerPanelSide && activeWagerPileRect ? getWagerPanelLayout(activeWagerPileRect, isOpponentPanel, boardPixelSize, wagerPanelHasActions) : null;
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
                paddingLeft: `${wagerPanelLayout.paddingXPx}px`,
                paddingRight: `${wagerPanelLayout.paddingXPx}px`,
                boxSizing: "border-box",
                background: wagerPanelTheme.background,
                border: `1px solid ${wagerPanelTheme.border}`,
                boxShadow: wagerPanelTheme.shadow,
                borderRadius: "16px",
                backdropFilter: "blur(6px)",
                WebkitBackdropFilter: "blur(6px)",
                overflow: "visible",
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
              {wagerPanelHasActions && (
                <div
                  data-wager-panel="true"
                  style={{
                    gridRow: wagerPanelLayout.buttonRow,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: `${wagerPanelLayout.buttonGapPx}px`,
                    height: "100%",
                    width: "100%",
                    overflow: "visible",
                  }}>
                  {showOpponentActions && (
                    <>
                      <button
                        data-wager-panel="true"
                        type="button"
                        onClick={!isMobile ? handleWagerDecline : undefined}
                        onTouchStart={isMobile ? handleWagerDecline : undefined}
                        style={{
                          ...wagerPanelButtonStyle,
                          flex: "1 0 auto",
                          minWidth: `${wagerPanelLayout.declineButtonMinWidthPx}px`,
                          paddingLeft: `${wagerPanelLayout.buttonPaddingXPx}px`,
                          paddingRight: `${wagerPanelLayout.buttonPaddingXPx}px`,
                        }}>
                        Decline
                      </button>
                      <button
                        data-wager-panel="true"
                        type="button"
                        disabled={!canAccept}
                        onClick={!isMobile ? handleWagerAccept : undefined}
                        onTouchStart={isMobile ? handleWagerAccept : undefined}
                        style={{
                          ...wagerPanelButtonStyle,
                          flex: "1 0 auto",
                          minWidth: `${wagerPanelLayout.acceptButtonMinWidthPx}px`,
                          paddingLeft: `${wagerPanelLayout.buttonPaddingXPx}px`,
                          paddingRight: `${wagerPanelLayout.buttonPaddingXPx}px`,
                          opacity: canAccept ? 1 : 0.5,
                          cursor: "pointer",
                        }}>
                        {acceptLabel}
                      </button>
                    </>
                  )}
                  {showPlayerActions && (
                    <button
                      data-wager-panel="true"
                      type="button"
                      onClick={!isMobile ? handleWagerCancel : undefined}
                      onTouchStart={isMobile ? handleWagerCancel : undefined}
                      style={{
                        ...wagerPanelButtonStyle,
                        flexShrink: 0,
                        minWidth: `${wagerPanelLayout.playerButtonMinWidthPx}px`,
                        paddingLeft: `${wagerPanelLayout.buttonPaddingXPx}px`,
                        paddingRight: `${wagerPanelLayout.buttonPaddingXPx}px`,
                      }}>
                      Cancel Proposal
                    </button>
                  )}
                </div>
              )}
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
                dismissOpponentVideo(200);
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
                dismissPlayerVideo(200);
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
