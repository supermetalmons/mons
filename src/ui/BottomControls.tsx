import React, { useRef, useEffect, useState, useCallback } from "react";
import { FaUndo, FaFlag, FaCommentAlt, FaTrophy, FaHome, FaRobot, FaStar, FaEnvelope, FaLink, FaShareAlt, FaPaintBrush, FaScroll, FaHourglassHalf } from "react-icons/fa";
import { IoSparklesSharp } from "react-icons/io5";
import styled from "styled-components";
import AnimatedHourglassButton from "./AnimatedHourglassButton";
import { canHandleUndo, didClickUndoButton, didClickStartTimerButton, didClickClaimVictoryByTimerButton, didClickPrimaryActionButton, didClickHomeButton, didClickInviteActionButtonBeforeThereIsInviteReady, didClickAutomoveButton, didClickAutomatchButton, didClickStartBotGameButton, didClickEndMatchButton, didClickConfirmResignButton, isGameWithBot, puzzleMode, playSameCompletedPuzzleAgain, isOnlineGame, isWatchOnly, isMatchOver, getRematchSeriesNavigatorItems, didSelectRematchSeriesMatch, preloadRematchSeriesScores } from "../game/gameController";
import type { RematchSeriesNavigatorItem } from "../game/gameController";
import { connection } from "../connection/connection";
import { defaultEarlyInputEventName, isMobile } from "../utils/misc";
import { soundPlayer } from "../utils/SoundPlayer";
import { playReaction, playSounds } from "../content/sounds";
import { newReactionOfKind, newStickerReaction } from "../content/sounds";
import { showVoiceReactionText, opponentSideMetadata, playerSideMetadata } from "../game/board";
import NavigationPicker from "./NavigationPicker";
import { ControlsContainer, BrushButton, NavigationListButton, NavigationBadge, ControlButton, BottomPillButton, ResignButton, ResignConfirmation, ReactionPillsContainer, ReactionPill, StickerPill, WagerBetButton, WagerMaterialsGrid, WagerMaterialItem, WagerMaterialIcon, WagerMaterialAmount, WagerButtonBadge, WagerButtonIcon, WagerButtonAmount } from "./BottomControlsStyles";
import { fetchNftsForStoredAddresses } from "../services/nftService";
import { closeMenuAndInfoIfAny } from "./MainMenu";
import { showVideoReaction } from "./BoardComponent";
import BoardStylePickerComponent, { preloadPangchiuBoardPreview } from "./BoardStylePicker";
import { Sound } from "../utils/gameModels";
import MoveHistoryPopup, { subscribeMoveHistoryPopupReload, triggerMoveHistoryPopupSelectionReset } from "./MoveHistoryPopup";
import { MATERIALS, MaterialName, rocksMiningService } from "../services/rocksMiningService";
import { MatchWagerState } from "../connection/connectionModels";
import { subscribeToWagerState } from "../game/wagerState";
import { computeAvailableMaterials, getFrozenMaterials, subscribeToFrozenMaterials } from "../services/wagerMaterialsService";
import { getStashedPlayerProfile } from "../utils/playerMetadata";
import { storage } from "../utils/storage";
import { transitionToHome } from "../session/AppSessionManager";
import { registerBottomControlsTransientUiHandler } from "./uiSession";
import { decrementLifecycleCounter, incrementLifecycleCounter } from "../lifecycle/lifecycleDiagnostics";

const deltaTimeOutsideTap = isMobile ? 42 : 420;

export enum PrimaryActionType {
  None = "none",
  JoinGame = "joinGame",
  Rematch = "rematch",
}

let latestModalOutsideTapDismissDate = Date.now();

export function didDismissSomethingWithOutsideTapJustNow() {
  latestModalOutsideTapDismissDate = Date.now();
}

let closeNavigationAndAppearancePopupIfAnyImpl: () => void = () => {};
let setNavigationListButtonVisibleImpl: (visible: boolean) => void = () => {};

export const closeNavigationAndAppearancePopupIfAny = () => {
  closeNavigationAndAppearancePopupIfAnyImpl();
};

export const setNavigationListButtonVisible = (visible: boolean) => {
  setNavigationListButtonVisibleImpl(visible);
};

export function resetOutsideTapDismissTimeout() {
  if (!isMobile) {
    latestModalOutsideTapDismissDate -= 1000;
  }
}

export function didNotDismissAnythingWithOutsideTapJustNow(): boolean {
  let delta = Date.now() - latestModalOutsideTapDismissDate;
  return delta >= deltaTimeOutsideTap;
}

let isWagerPanelVisible: () => boolean = () => false;
let handleWagerPanelOutsideTap: ((event: TouchEvent | MouseEvent) => boolean) | null = null;

export function setWagerPanelVisibilityChecker(checker: () => boolean) {
  isWagerPanelVisible = checker;
}

export function setWagerPanelOutsideTapHandler(handler: ((event: TouchEvent | MouseEvent) => boolean) | null) {
  handleWagerPanelOutsideTap = handler;
}

export function hasNavigationPopupVisible(): boolean {
  return getIsNavigationPopupOpen();
}

let getIsNavigationPopupOpen: () => boolean = () => false;

let hasBottomPopupsVisible: () => boolean = () => false;
let showVoiceReactionButton: (show: boolean) => void = () => {};
let showMoveHistoryButton: (show: boolean) => void = () => {};
let showResignButton: () => void = () => {};
let setInviteLinkActionVisible: (visible: boolean) => void = () => {};
let setAutomatchEnabled: (enabled: boolean) => void = () => {};
let setAutomatchVisible: (visible: boolean) => void = () => {};
let setBotGameOptionVisible: (visible: boolean) => void = () => {};
let setPlaySamePuzzleAgainButtonVisible: (visible: boolean) => void = () => {};
let setAutomatchWaitingState: (waiting: boolean) => void = () => {};
let setBrushAndNavigationButtonDimmed: (dimmed: boolean) => void = () => {};
let setBadgeVisible: (visible: boolean) => void = () => {};

let showWaitingStateText: (text: string) => void = () => {};
let setHomeVisible: (visible: boolean) => void = () => {};
let setEndMatchVisible: (visible: boolean) => void = () => {};
let setEndMatchConfirmed: (confirmed: boolean) => void = () => {};
let setUndoVisible: (visible: boolean) => void = () => {};
let setAutomoveActionEnabled: (enabled: boolean) => void = () => {};
let setAutomoveActionVisible: (visible: boolean) => void = () => {};
let setWatchOnlyVisible: (visible: boolean) => void = () => {};
let setUndoEnabled: (enabled: boolean) => void = () => {};
let disableAndHideUndoResignAndTimerControls: () => void = () => {};
let setIsReadyToCopyExistingInviteLink: () => void = () => {};
let hideTimerButtons: () => void = () => {};
let showTimerButtonProgressing: (currentProgress: number, target: number, enableWhenTargetReached: boolean) => void = () => {};
let toggleReactionPicker: () => void = () => {};
let enableTimerVictoryClaim: () => void = () => {};
let showPrimaryAction: (action: PrimaryActionType) => void = () => {};

const STICKER_ID_WHITELIST: number[] = [9, 17, 20, 26, 30, 31, 40, 50, 54, 61, 63, 74, 101, 109, 132, 146, 148, 163, 168, 173, 180, 189, 209, 210, 217, 224, 225, 228, 232, 236, 243, 245, 246, 250, 256, 257, 258, 267, 271, 281, 283, 289, 302, 303, 313, 316, 318, 325, 328, 338, 347, 356, 374, 382, 389, 393, 396, 401, 403, 405, 407, 429, 430, 444, 465, 466, 900316, 900101, 900393, 90063, 900109, 900228, 900245, 900267, 900374, 900347, 900382, 900429, 900225, 900999, 900189];
const FIXED_STICKER_IDS: number[] = [900316, 900101, 900393, 90063, 900109, 900228, 900245, 900189, 900267, 900374, 900347, 900382, 900429, 900225, 900999];
const MATERIAL_IMAGE_BASE_URL = "https://assets.mons.link/rocks/materials";
const STICKER_IMAGE_BASE_URL = "https://assets.mons.link/swagpack/64";
const STATUS_ICON_BASE_URL = "https://assets.mons.link/icons";
const STATUS_ICON_URLS = {
  cloud: `${STATUS_ICON_BASE_URL}/cloud.webp`,
  spectating: `${STATUS_ICON_BASE_URL}/spectating.webp`,
  automatch: `${STATUS_ICON_BASE_URL}/automatch_1.webp`,
  finish: `${STATUS_ICON_BASE_URL}/finish.webp`,
} as const;
type StatusIconName = keyof typeof STATUS_ICON_URLS;
const materialImagePromises: Map<MaterialName, Promise<string | null>> = new Map();
const stickerImagePromises: Map<number, Promise<string | null>> = new Map();
const statusIconPromises: Map<StatusIconName, Promise<string | null>> = new Map();

const fetchImageUrl = (url: string): Promise<string | null> =>
  fetch(url)
    .then((res) => {
      if (!res.ok) throw new Error("Failed to fetch image");
      return res.blob();
    })
    .then((blob) => URL.createObjectURL(blob))
    .catch(() => null);

const getCachedImageUrl = <T extends string | number>(cache: Map<T, Promise<string | null>>, key: T, url: string) => {
  if (!cache.has(key)) {
    cache.set(key, fetchImageUrl(url));
  }
  return cache.get(key)!;
};

const getMaterialImageUrl = (name: MaterialName) => getCachedImageUrl(materialImagePromises, name, `${MATERIAL_IMAGE_BASE_URL}/${name}.webp`);
const getStickerImageUrl = (id: number) => getCachedImageUrl(stickerImagePromises, id, `${STICKER_IMAGE_BASE_URL}/${id}.webp`);
const getStatusIconUrl = (name: StatusIconName) => getCachedImageUrl(statusIconPromises, name, STATUS_ICON_URLS[name]);

const mergeStickerIds = (base: number[], extra: number[]): number[] => {
  if (!extra.length) return base.slice();
  const seen = new Set<number>(base);
  const merged = base.slice();
  for (const id of extra) {
    if (!seen.has(id)) {
      seen.add(id);
      merged.push(id);
    }
  }
  return merged;
};

const normalizeStickerIds = (value: unknown): number[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is number => typeof id === "number");
};

const getSwagpackReactionStickerIds = (value: unknown): number[] => {
  if (!Array.isArray(value)) return [];
  const ids = value.map((item) => (item as { id?: unknown }).id);
  return normalizeStickerIds(ids);
};

const areStickerIdArraysEqual = (left: number[], right: number[]): boolean => {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return false;
  }
  return true;
};

const getInitialStickerIds = (): number[] => {
  const cachedExtraIds = normalizeStickerIds(storage.getReactionExtraStickerIds([]));
  return mergeStickerIds(FIXED_STICKER_IDS, cachedExtraIds);
};

const BottomPillInlineIcon = styled.img`
  width: 1.42em;
  height: 1.42em;
  margin-left: -4px;
  margin-right: 4px;
  flex-shrink: 0;
  -webkit-user-drag: none;
  user-drag: none;

  @media screen and (max-width: 359px) {
    margin-left: -3px;
    margin-right: 3px;
  }
`;

const RematchSeriesInlineControl = styled.div`
  flex: 1 1 0;
  min-width: 0;
  height: 32px;
  display: flex;
  align-items: center;
  padding: 0;
  overflow: hidden;
  mask-image: linear-gradient(to left, transparent 0px, black 6px);
  -webkit-mask-image: linear-gradient(to left, transparent 0px, black 6px);
`;

const RematchSeriesScroll = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: row;
  align-items: center;
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  -ms-overflow-style: none;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const RematchSeriesTrack = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  background: rgba(120, 120, 128, 0.1);
  border-radius: 16px;
  height: 32px;
  flex-shrink: 0;
  padding: 0 1px;

  @media (prefers-color-scheme: dark) {
    background: rgba(120, 120, 128, 0.2);
  }
`;

const RematchSeriesChip = styled.button<{ $isSelected: boolean }>`
  border: none;
  border-radius: 15px;
  height: 30px;
  min-width: 26px;
  padding: 0 7px;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  flex-shrink: 0;
  cursor: pointer;
  background: ${(props) => (props.$isSelected ? "rgba(10, 132, 255, 0.18)" : "transparent")};

  @media (prefers-color-scheme: dark) {
    background: ${(props) => (props.$isSelected ? "rgba(10, 132, 255, 0.3)" : "transparent")};
  }

  &:disabled {
    cursor: default;
    opacity: 0.6;
  }
`;

const RematchScoreOpponent = styled.span<{ $isSelected: boolean }>`
  font-size: 10px;
  line-height: 1;
  font-weight: 400;
  font-variant-numeric: tabular-nums;
  color: ${(props) => (props.$isSelected ? "var(--color-blue-primary)" : "rgba(60, 60, 67, 0.45)")};

  @media (prefers-color-scheme: dark) {
    color: ${(props) => (props.$isSelected ? "rgba(100, 175, 255, 0.7)" : "rgba(235, 235, 245, 0.35)")};
  }
`;

const RematchScorePlayer = styled.span<{ $isSelected: boolean }>`
  font-size: 11px;
  line-height: 1;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: ${(props) => (props.$isSelected ? "var(--color-blue-primary)" : "var(--color-gray-33)")};

  @media (prefers-color-scheme: dark) {
    color: ${(props) => (props.$isSelected ? "var(--color-blue-primary-dark)" : "var(--color-gray-f0)")};
  }
`;

const RematchSeriesSeparator = styled.div<{ $hidden: boolean }>`
  width: 0.5px;
  height: 16px;
  background: rgba(120, 120, 128, 0.25);
  flex-shrink: 0;
  opacity: ${(props) => (props.$hidden ? 0 : 1)};
  transition: opacity 0.15s ease;

  @media (prefers-color-scheme: dark) {
    background: rgba(120, 120, 128, 0.35);
  }
`;

const RematchWaitingIcon = styled.span<{ $isSelected: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: ${(props) => (props.$isSelected ? "var(--color-blue-primary)" : "rgba(60, 60, 67, 0.4)")};

  @media (prefers-color-scheme: dark) {
    color: ${(props) => (props.$isSelected ? "var(--color-blue-primary-dark)" : "rgba(235, 235, 245, 0.35)")};
  }
`;

const RematchLoadingDots = styled.span<{ $isSelected: boolean }>`
  font-size: 11px;
  line-height: 1;
  letter-spacing: 1px;
  color: ${(props) => (props.$isSelected ? "var(--color-blue-primary)" : "rgba(60, 60, 67, 0.35)")};

  @media (prefers-color-scheme: dark) {
    color: ${(props) => (props.$isSelected ? "var(--color-blue-primary-dark)" : "rgba(235, 235, 245, 0.3)")};
  }
`;

const BottomControls: React.FC = () => {
  const [isEndMatchButtonVisible, setIsEndMatchButtonVisible] = useState(false);
  const [isEndMatchConfirmed, setIsEndMatchConfirmed] = useState(false);
  const [isInviteLinkButtonVisible, setIsInviteLinkButtonVisible] = useState(false);
  const [isBotGameButtonVisible, setIsBotGameButtonVisible] = useState(false);
  const [isAutomatchButtonVisible, setIsAutomatchButtonVisible] = useState(false);
  const [isAutomatchButtonEnabled, setIsAutomatchButtonEnabled] = useState(true);
  const [isWatchOnlyIndicatorVisible, setIsWatchOnlyIndicatorVisible] = useState(false);
  const [isDeepHomeButtonVisible, setIsDeepHomeButtonVisible] = useState(false);
  const [isInviteLoading, setIsInviteLoading] = useState(false);
  const [didCreateInvite, setDidCreateInvite] = useState(false);
  const [automatchButtonTmpState, setAutomatchButtonTmpState] = useState(false);
  const [inviteCopiedTmpState, setInviteCopiedTmpState] = useState(false);
  const [isVoiceReactionDisabled, setIsVoiceReactionDisabled] = useState(false);
  const [isNavigationButtonDimmed, setIsNavigationButtonDimmed] = useState(false);
  const [isBrushButtonDimmed, setIsBrushButtonDimmed] = useState(false);
  const [isNavigationListButtonVisible, setIsNavigationListButtonVisible] = useState(false);
  const [isNavigationPopupVisible, setIsNavigationPopupVisible] = useState(false);
  const [isBoardStylePickerVisible, setIsBoardStylePickerVisible] = useState(false);
  const [isBadgeVisible, setIsBadgeVisible] = useState(false);

  const [isUndoDisabled, setIsUndoDisabled] = useState(true);
  const [waitingStateText, setWaitingStateText] = useState("");
  const [isStartTimerVisible, setIsStartTimerVisible] = useState(false);
  const [primaryAction, setPrimaryAction] = useState<PrimaryActionType>(PrimaryActionType.None);
  const [isUndoButtonVisible, setIsUndoButtonVisible] = useState(false);
  const [isAutomoveButtonEnabled, setIsAutomoveButtonEnabled] = useState(true);
  const [isAutomoveButtonVisible, setIsAutomoveButtonVisible] = useState(false);
  const [isResignButtonVisible, setIsResignButtonVisible] = useState(false);
  const [isVoiceReactionButtonVisible, setIsVoiceReactionButtonVisible] = useState(false);
  const [isReactionPickerVisible, setIsReactionPickerVisible] = useState(false);
  const [isMoveHistoryButtonVisible, setIsMoveHistoryButtonVisible] = useState(false);
  const [isMoveHistoryPopupVisible, setIsMoveHistoryPopupVisible] = useState(false);
  const [isRematchSeriesSelectionInFlight, setIsRematchSeriesSelectionInFlight] = useState(false);
  const [historyUiVersion, setHistoryUiVersion] = useState(0);
  const [isResignConfirmVisible, setIsResignConfirmVisible] = useState(false);
  const [isTimerConfirmVisible, setIsTimerConfirmVisible] = useState(false);
  const [isClaimVictoryConfirmVisible, setIsClaimVictoryConfirmVisible] = useState(false);
  const [isTimerButtonDisabled, setIsTimerButtonDisabled] = useState(true);
  const [isClaimVictoryVisible, setIsClaimVictoryVisible] = useState(false);
  const [isSamePuzzleAgainVisible, setIsSamePuzzleAgainVisible] = useState(false);

  const [isCancelAutomatchVisible, setIsCancelAutomatchVisible] = useState(false);
  const [isCancelAutomatchDisabled, setIsCancelAutomatchDisabled] = useState(false);

  const [isClaimVictoryButtonDisabled, setIsClaimVictoryButtonDisabled] = useState(false);
  const [timerConfig, setTimerConfig] = useState({ duration: 90, progress: 0, requestDate: Date.now() });
  const [stickerIds, setStickerIds] = useState<number[]>(() => getInitialStickerIds());
  const [pickerMaxHeight, setPickerMaxHeight] = useState<number | undefined>(undefined);
  const [timerConfirmLeft, setTimerConfirmLeft] = useState<number | null>(null);
  const [claimVictoryConfirmLeft, setClaimVictoryConfirmLeft] = useState<number | null>(null);

  const [isWagerMode, setIsWagerMode] = useState(false);
  const [wagerSelection, setWagerSelection] = useState<{ name: MaterialName | null; count: number }>({ name: null, count: 0 });
  const [materialUrls, setMaterialUrls] = useState<Record<MaterialName, string | null>>(() => {
    const initial: Partial<Record<MaterialName, string | null>> = {};
    MATERIALS.forEach((n) => (initial[n] = null));
    return initial as Record<MaterialName, string | null>;
  });
  const [materialAmounts, setMaterialAmounts] = useState<Record<MaterialName, number>>(() => {
    const initial: Partial<Record<MaterialName, number>> = {};
    MATERIALS.forEach((n) => (initial[n] = 0));
    return initial as Record<MaterialName, number>;
  });
  const [statusIconUrls, setStatusIconUrls] = useState<Record<StatusIconName, string | null>>({
    cloud: null,
    spectating: null,
    automatch: null,
    finish: null,
  });
  const [stickerUrls, setStickerUrls] = useState<Record<number, string | null>>({});
  const [wagerState, setWagerState] = useState<MatchWagerState | null>(null);
  const frozenMaterialsRef = useRef<Record<MaterialName, number>>(getFrozenMaterials());
  const latestServiceMaterialsRef = useRef<Record<MaterialName, number>>({ dust: 0, slime: 0, gum: 0, metal: 0, ice: 0 });

  const pickerRef = useRef<HTMLDivElement>(null);
  const controlsContainerRef = useRef<HTMLDivElement>(null);
  const voiceReactionButtonRef = useRef<HTMLButtonElement>(null);
  const moveHistoryButtonRef = useRef<HTMLButtonElement>(null);
  const resignButtonRef = useRef<HTMLButtonElement>(null);
  const resignConfirmRef = useRef<HTMLDivElement>(null);
  const timerButtonRef = useRef<HTMLButtonElement>(null);
  const timerConfirmRef = useRef<HTMLDivElement>(null);
  const claimVictoryButtonRef = useRef<HTMLButtonElement>(null);
  const claimVictoryConfirmRef = useRef<HTMLDivElement>(null);
  const hourglassEnableTimeoutRef = useRef<number | null>(null);
  const hourglassEnableDeadlineRef = useRef<number | null>(null);
  const isTimerButtonDisabledRef = useRef(true);
  const isStartTimerVisibleRef = useRef(false);
  const cancelAutomatchRevealTimeoutRef = useRef<number | null>(null);
  const matchScopedTimeoutIdsRef = useRef<Set<number>>(new Set());
  const navigationPopupRef = useRef<HTMLDivElement>(null);
  const navigationButtonRef = useRef<HTMLButtonElement>(null);
  const boardStylePickerRef = useRef<HTMLDivElement>(null);
  const brushButtonRef = useRef<HTMLButtonElement>(null);
  const moveHistoryPopupRef = useRef<HTMLDivElement>(null);
  const rematchSeriesSelectionLockRef = useRef(false);

  const clearTrackedMatchScopedTimeout = useCallback((timeoutId: number | null) => {
    if (timeoutId === null) {
      return;
    }
    if (matchScopedTimeoutIdsRef.current.has(timeoutId)) {
      matchScopedTimeoutIdsRef.current.delete(timeoutId);
      decrementLifecycleCounter("uiTimeouts");
    }
    clearTimeout(timeoutId);
  }, []);

  const setMatchScopedTimeout = useCallback((callback: () => void, delay: number, guard?: () => boolean): number => {
    const timeoutId = window.setTimeout(() => {
      if (matchScopedTimeoutIdsRef.current.has(timeoutId)) {
        matchScopedTimeoutIdsRef.current.delete(timeoutId);
        decrementLifecycleCounter("uiTimeouts");
      }
      if (guard && !guard()) {
        return;
      }
      callback();
    }, delay);
    matchScopedTimeoutIdsRef.current.add(timeoutId);
    incrementLifecycleCounter("uiTimeouts");
    return timeoutId;
  }, []);

  const clearAllMatchScopedTimeouts = useCallback(() => {
    matchScopedTimeoutIdsRef.current.forEach((timeoutId) => {
      clearTimeout(timeoutId);
      decrementLifecycleCounter("uiTimeouts");
    });
    matchScopedTimeoutIdsRef.current.clear();
    hourglassEnableTimeoutRef.current = null;
    hourglassEnableDeadlineRef.current = null;
    cancelAutomatchRevealTimeoutRef.current = null;
  }, []);

  useEffect(() => {
    isTimerButtonDisabledRef.current = isTimerButtonDisabled;
  }, [isTimerButtonDisabled]);

  useEffect(() => {
    isStartTimerVisibleRef.current = isStartTimerVisible;
  }, [isStartTimerVisible]);

  const tryEnableTimerButtonFromDeadline = useCallback(() => {
    const deadline = hourglassEnableDeadlineRef.current;
    if (deadline === null || Date.now() < deadline) {
      return;
    }
    if (hourglassEnableTimeoutRef.current !== null) {
      clearTrackedMatchScopedTimeout(hourglassEnableTimeoutRef.current);
      hourglassEnableTimeoutRef.current = null;
    }
    hourglassEnableDeadlineRef.current = null;
    if (isStartTimerVisibleRef.current && isTimerButtonDisabledRef.current) {
      setIsTimerButtonDisabled(false);
    }
  }, [clearTrackedMatchScopedTimeout]);

  useEffect(() => {
    const handleTimerDeadlineCheck = () => {
      if (document.visibilityState === "hidden") {
        return;
      }
      tryEnableTimerButtonFromDeadline();
    };
    handleTimerDeadlineCheck();
    document.addEventListener("visibilitychange", handleTimerDeadlineCheck);
    window.addEventListener("focus", handleTimerDeadlineCheck);
    window.addEventListener("pageshow", handleTimerDeadlineCheck);
    return () => {
      document.removeEventListener("visibilitychange", handleTimerDeadlineCheck);
      window.removeEventListener("focus", handleTimerDeadlineCheck);
      window.removeEventListener("pageshow", handleTimerDeadlineCheck);
    };
  }, [tryEnableTimerButtonFromDeadline]);

  useEffect(() => {
    const handleClickOutside = (event: TouchEvent | MouseEvent) => {
      event.stopPropagation();
      if (
        (pickerRef.current && !pickerRef.current.contains(event.target as Node) && !voiceReactionButtonRef.current?.contains(event.target as Node)) ||
        (resignConfirmRef.current && !resignConfirmRef.current.contains(event.target as Node) && !resignButtonRef.current?.contains(event.target as Node)) ||
        (timerConfirmRef.current && !timerConfirmRef.current.contains(event.target as Node) && !timerButtonRef.current?.contains(event.target as Node)) ||
        (claimVictoryConfirmRef.current && !claimVictoryConfirmRef.current.contains(event.target as Node) && !claimVictoryButtonRef.current?.contains(event.target as Node))
      ) {
        didDismissSomethingWithOutsideTapJustNow();
        setIsReactionPickerVisible(false);
        setIsResignConfirmVisible(false);
        setIsTimerConfirmVisible(false);
        setIsClaimVictoryConfirmVisible(false);
      }

      if (moveHistoryPopupRef.current && !moveHistoryPopupRef.current.contains(event.target as Node) && !moveHistoryButtonRef.current?.contains(event.target as Node)) {
        didDismissSomethingWithOutsideTapJustNow();
        setIsMoveHistoryPopupVisible(false);
      }

      if (navigationPopupRef.current && !navigationPopupRef.current.contains(event.target as Node) && !navigationButtonRef.current?.contains(event.target as Node)) {
        didDismissSomethingWithOutsideTapJustNow();
        setIsNavigationPopupVisible(false);
      }

      if (boardStylePickerRef.current && !boardStylePickerRef.current.contains(event.target as Node) && !brushButtonRef.current?.contains(event.target as Node)) {
        didDismissSomethingWithOutsideTapJustNow();
        setIsBoardStylePickerVisible(false);
      }

      if (handleWagerPanelOutsideTap && handleWagerPanelOutsideTap(event)) {
        didDismissSomethingWithOutsideTapJustNow();
      }
    };

    document.addEventListener(defaultEarlyInputEventName, handleClickOutside);
    return () => {
      document.removeEventListener(defaultEarlyInputEventName, handleClickOutside);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const win: any = typeof window !== "undefined" ? (window as any) : null;
    const schedule = (fn: () => void) => {
      if (!win) {
        const t = setTimeout(() => {
          if (!cancelled) fn();
        }, 200);
        return () => clearTimeout(t);
      }
      if (typeof win.requestIdleCallback === "function") {
        const id = win.requestIdleCallback(() => {
          if (!cancelled) fn();
        });
        return () => {
          if (typeof win.cancelIdleCallback === "function") win.cancelIdleCallback(id);
        };
      }
      const t = setTimeout(() => {
        if (!cancelled) fn();
      }, 200);
      return () => clearTimeout(t);
    };

    const cleanup = schedule(() => {
      preloadPangchiuBoardPreview();
    });

    return () => {
      cancelled = true;
      if (cleanup) cleanup();
    };
  }, []);

  useEffect(() => {
    if (!isReactionPickerVisible) return;
    const nextStickerIds = getInitialStickerIds();
    setStickerIds((prev) => (areStickerIdArraysEqual(prev, nextStickerIds) ? prev : nextStickerIds));
  }, [isReactionPickerVisible]);

  useEffect(() => {
    if (!isReactionPickerVisible) {
      setPickerMaxHeight(undefined);
      return;
    }
    if (pickerRef.current) {
      const el = pickerRef.current;
      requestAnimationFrame(() => {
        setPickerMaxHeight(el.scrollHeight);
      });
    }
  }, [isReactionPickerVisible]);

  useEffect(() => {
    if (!isReactionPickerVisible) return;
    if (!pickerRef.current) return;
    const el = pickerRef.current;
    requestAnimationFrame(() => {
      setPickerMaxHeight(el.scrollHeight);
    });
  }, [stickerIds, isReactionPickerVisible, isWagerMode, wagerSelection]);

  const updateTimerConfirmPosition = useCallback(() => {
    if (!timerButtonRef.current || !controlsContainerRef.current) return;
    const buttonRect = timerButtonRef.current.getBoundingClientRect();
    const containerRect = controlsContainerRef.current.getBoundingClientRect();
    const center = buttonRect.left + buttonRect.width / 2 - containerRect.left;
    const padding = 16;
    const clampedCenter = Math.min(containerRect.width - padding, Math.max(padding, center));
    setTimerConfirmLeft(clampedCenter);
  }, []);

  const updateClaimVictoryConfirmPosition = useCallback(() => {
    if (!claimVictoryButtonRef.current || !controlsContainerRef.current) return;
    const buttonRect = claimVictoryButtonRef.current.getBoundingClientRect();
    const containerRect = controlsContainerRef.current.getBoundingClientRect();
    const center = buttonRect.left + buttonRect.width / 2 - containerRect.left;
    const padding = 16;
    const clampedCenter = Math.min(containerRect.width - padding, Math.max(padding, center));
    setClaimVictoryConfirmLeft(clampedCenter);
  }, []);

  useEffect(() => {
    if (!isTimerConfirmVisible) return;
    const raf = requestAnimationFrame(updateTimerConfirmPosition);
    window.addEventListener("resize", updateTimerConfirmPosition);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", updateTimerConfirmPosition);
    };
  }, [isTimerConfirmVisible, updateTimerConfirmPosition]);

  useEffect(() => {
    if (!isClaimVictoryConfirmVisible) return;
    const raf = requestAnimationFrame(updateClaimVictoryConfirmPosition);
    window.addEventListener("resize", updateClaimVictoryConfirmPosition);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", updateClaimVictoryConfirmPosition);
    };
  }, [isClaimVictoryConfirmVisible, updateClaimVictoryConfirmPosition]);

  useEffect(() => {
    if (!isReactionPickerVisible) return;
    let isCancelled = false;
    const fetchReactions = async () => {
      try {
        const data = await fetchNftsForStoredAddresses();
        const extraIds = getSwagpackReactionStickerIds(data?.swagpack_reactions);
        if (isCancelled) return;
        const nextStickerIds = mergeStickerIds(FIXED_STICKER_IDS, extraIds);
        setStickerIds((prev) => (areStickerIdArraysEqual(prev, nextStickerIds) ? prev : nextStickerIds));
        const cachedExtraIds = normalizeStickerIds(storage.getReactionExtraStickerIds([]));
        if (!areStickerIdArraysEqual(cachedExtraIds, extraIds)) {
          storage.setReactionExtraStickerIds(extraIds);
        }
      } catch (_) {}
    };
    fetchReactions();
    return () => {
      isCancelled = true;
    };
  }, [isReactionPickerVisible]);

  useEffect(() => {
    if (!isReactionPickerVisible) {
      setIsWagerMode(false);
      setWagerSelection({ name: null, count: 0 });
    }
  }, [isReactionPickerVisible]);

  useEffect(() => {
    const unsubscribe = subscribeToWagerState((state) => {
      setWagerState(state);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = rocksMiningService.subscribe((snapshot) => {
      const next = { ...snapshot.materials };
      latestServiceMaterialsRef.current = next;
      const available = computeAvailableMaterials(next, frozenMaterialsRef.current);
      setMaterialAmounts(available);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToFrozenMaterials((materials) => {
      frozenMaterialsRef.current = materials;
      const available = computeAvailableMaterials(latestServiceMaterialsRef.current, materials);
      setMaterialAmounts(available);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!isReactionPickerVisible || !stickerIds.length) return;
    let mounted = true;
    stickerIds.forEach((id) => {
      getStickerImageUrl(id).then((url) => {
        if (!mounted) return;
        setStickerUrls((prev) => {
          if (prev[id] === url) return prev;
          return { ...prev, [id]: url };
        });
      });
    });
    return () => {
      mounted = false;
    };
  }, [isReactionPickerVisible, stickerIds]);

  useEffect(() => {
    let mounted = true;
    MATERIALS.forEach((name) => {
      getMaterialImageUrl(name).then((url) => {
        if (!mounted) return;
        setMaterialUrls((prev) => ({ ...prev, [name]: url }));
      });
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    (Object.keys(STATUS_ICON_URLS) as StatusIconName[]).forEach((name) => {
      getStatusIconUrl(name).then((url) => {
        if (!mounted) return;
        setStatusIconUrls((prev) => {
          if (prev[name] === url) return prev;
          return { ...prev, [name]: url };
        });
      });
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      clearAllMatchScopedTimeouts();
      hourglassEnableTimeoutRef.current = null;
      hourglassEnableDeadlineRef.current = null;
      cancelAutomatchRevealTimeoutRef.current = null;
    };
  }, [clearAllMatchScopedTimeouts]);

  useEffect(() => {
    if (cancelAutomatchRevealTimeoutRef.current) {
      clearTrackedMatchScopedTimeout(cancelAutomatchRevealTimeoutRef.current);
      cancelAutomatchRevealTimeoutRef.current = null;
    }
    if (automatchButtonTmpState && isAutomatchButtonVisible) {
      setIsCancelAutomatchVisible(false);
      setIsCancelAutomatchDisabled(false);
      cancelAutomatchRevealTimeoutRef.current = setMatchScopedTimeout(() => {
        setIsCancelAutomatchVisible(true);
      }, 10000);
    } else {
      setIsCancelAutomatchVisible(false);
      setIsCancelAutomatchDisabled(false);
    }
    return () => {
      if (cancelAutomatchRevealTimeoutRef.current) {
        clearTrackedMatchScopedTimeout(cancelAutomatchRevealTimeoutRef.current);
        cancelAutomatchRevealTimeoutRef.current = null;
      }
    };
  }, [automatchButtonTmpState, clearTrackedMatchScopedTimeout, isAutomatchButtonVisible, setMatchScopedTimeout]);

  useEffect(() => {
    return subscribeMoveHistoryPopupReload(() => {
      setHistoryUiVersion((value) => value + 1);
    });
  }, []);

  const rematchSeriesItems: RematchSeriesNavigatorItem[] = (() => {
    void historyUiVersion;
    try {
      return getRematchSeriesNavigatorItems();
    } catch {
      return [];
    }
  })();

  const hasRematchSeriesNavigation = rematchSeriesItems.length > 0;
  const rematchSeriesMatchesKey = rematchSeriesItems.map((item) => item.matchId).join("|");

  useEffect(() => {
    if (rematchSeriesMatchesKey === "") {
      return;
    }
    let isDisposed = false;
    let retryTimeoutId: number | null = null;
    let retryCount = 0;

    const hasMissingHistoricalScores = (items: RematchSeriesNavigatorItem[]) =>
      items.some((item) => !item.isActiveMatch && !item.isPendingResponse && (item.whiteScore === null || item.blackScore === null));

    const runPreload = async () => {
      let didChange = false;
      try {
        didChange = await preloadRematchSeriesScores();
      } catch {
        didChange = false;
      }
      if (isDisposed) {
        return;
      }
      if (didChange) {
        setHistoryUiVersion((value) => value + 1);
      }
      let latestItems: RematchSeriesNavigatorItem[] = [];
      try {
        latestItems = getRematchSeriesNavigatorItems();
      } catch {
        latestItems = [];
      }
      if (!hasMissingHistoricalScores(latestItems)) {
        return;
      }
      if (retryCount >= 8) {
        return;
      }
      retryCount += 1;
      retryTimeoutId = setMatchScopedTimeout(() => {
        void runPreload();
      }, 650);
    };

    void runPreload();

    return () => {
      isDisposed = true;
      if (retryTimeoutId !== null) {
        clearTrackedMatchScopedTimeout(retryTimeoutId);
      }
    };
  }, [clearTrackedMatchScopedTimeout, rematchSeriesMatchesKey, setMatchScopedTimeout]);

  const closeNavigationAndAppearancePopupIfAnyHandler = useCallback(() => {
    setIsNavigationPopupVisible(false);
    setIsBoardStylePickerVisible(false);
    setIsMoveHistoryPopupVisible(false);
    setIsReactionPickerVisible(false);
    setIsResignConfirmVisible(false);
    setIsTimerConfirmVisible(false);
    setIsClaimVictoryConfirmVisible(false);
    setIsWagerMode(false);
    if (cancelAutomatchRevealTimeoutRef.current !== null) {
      clearTrackedMatchScopedTimeout(cancelAutomatchRevealTimeoutRef.current);
      cancelAutomatchRevealTimeoutRef.current = null;
    }
    setIsCancelAutomatchVisible(false);
    setIsCancelAutomatchDisabled(false);
  }, [clearTrackedMatchScopedTimeout]);

  closeNavigationAndAppearancePopupIfAnyImpl = closeNavigationAndAppearancePopupIfAnyHandler;

  useEffect(() => {
    return registerBottomControlsTransientUiHandler(closeNavigationAndAppearancePopupIfAnyHandler, clearAllMatchScopedTimeouts);
  }, [clearAllMatchScopedTimeouts, closeNavigationAndAppearancePopupIfAnyHandler]);

  useEffect(() => {
    return () => {
      closeNavigationAndAppearancePopupIfAnyImpl = () => {};
      setNavigationListButtonVisibleImpl = () => {};
      getIsNavigationPopupOpen = () => false;
      hasBottomPopupsVisible = () => false;
      showVoiceReactionButton = () => {};
      showMoveHistoryButton = () => {};
      showResignButton = () => {};
      setInviteLinkActionVisible = () => {};
      setAutomatchEnabled = () => {};
      setAutomatchVisible = () => {};
      setBotGameOptionVisible = () => {};
      setPlaySamePuzzleAgainButtonVisible = () => {};
      setAutomatchWaitingState = () => {};
      setBrushAndNavigationButtonDimmed = () => {};
      setBadgeVisible = () => {};
      showWaitingStateText = () => {};
      setHomeVisible = () => {};
      setEndMatchVisible = () => {};
      setEndMatchConfirmed = () => {};
      setUndoVisible = () => {};
      setAutomoveActionEnabled = () => {};
      setAutomoveActionVisible = () => {};
      setWatchOnlyVisible = () => {};
      setUndoEnabled = () => {};
      disableAndHideUndoResignAndTimerControls = () => {};
      setIsReadyToCopyExistingInviteLink = () => {};
      hideTimerButtons = () => {};
      showTimerButtonProgressing = () => {};
      toggleReactionPicker = () => {};
      enableTimerVictoryClaim = () => {};
      showPrimaryAction = () => {};
      isWagerPanelVisible = () => false;
      handleWagerPanelOutsideTap = null;
    };
  }, []);

  const handleInviteClick = () => {
    soundPlayer.initializeOnUserInteraction(false);
    if (!didCreateInvite) {
      didClickInviteActionButtonBeforeThereIsInviteReady();
    }
    setIsInviteLoading(true);
    connection.didClickInviteButton((result: boolean) => {
      if (result) {
        const sessionGuard = connection.createSessionGuard();
        if (didCreateInvite) {
          setInviteCopiedTmpState(true);
          setMatchScopedTimeout(() => {
            if (!sessionGuard()) {
              return;
            }
            setInviteCopiedTmpState(false);
          }, 699);
        }
        setIsInviteLoading(false);
        setDidCreateInvite(true);
      } else {
        setIsInviteLoading(false);
      }
    });
  };

  getIsNavigationPopupOpen = () => isNavigationPopupVisible;

  setNavigationListButtonVisibleImpl = (visible: boolean) => {
    setIsNavigationListButtonVisible(visible);
    if (!visible) {
      setIsNavigationPopupVisible(false);
    }
  };

  setBadgeVisible = (visible: boolean) => {
    setIsBadgeVisible(visible);
  };

  setBrushAndNavigationButtonDimmed = (dimmed: boolean) => {
    setIsNavigationButtonDimmed(dimmed);
    setIsBrushButtonDimmed(dimmed);
  };

  showVoiceReactionButton = (show: boolean) => {
    setIsVoiceReactionButtonVisible(show);
    if (!show) {
      setIsVoiceReactionDisabled(false);
    }
  };

  showMoveHistoryButton = (show: boolean) => {
    setIsMoveHistoryButtonVisible(show);
  };

  showResignButton = () => {
    setIsResignButtonVisible(true);
  };

  showWaitingStateText = (text: string) => {
    setWaitingStateText(text);
  };

  setIsReadyToCopyExistingInviteLink = () => {
    setDidCreateInvite(true);
  };

  hideTimerButtons = () => {
    if (hourglassEnableTimeoutRef.current) {
      clearTrackedMatchScopedTimeout(hourglassEnableTimeoutRef.current);
      hourglassEnableTimeoutRef.current = null;
    }
    hourglassEnableDeadlineRef.current = null;
    setIsTimerButtonDisabled(true);
    setIsStartTimerVisible(false);
    setIsClaimVictoryVisible(false);
    setIsTimerConfirmVisible(false);
    setIsClaimVictoryConfirmVisible(false);
  };

  showTimerButtonProgressing = (currentProgress: number, target: number, enableWhenTargetReached: boolean) => {
    if (hourglassEnableTimeoutRef.current) {
      clearTrackedMatchScopedTimeout(hourglassEnableTimeoutRef.current);
      hourglassEnableTimeoutRef.current = null;
    }
    hourglassEnableDeadlineRef.current = null;

    setIsTimerButtonDisabled(true);
    setIsStartTimerVisible(true);
    setIsAutomoveButtonVisible(false);
    setIsUndoButtonVisible(false);
    setIsClaimVictoryVisible(false);
    setIsTimerConfirmVisible(false);
    setIsClaimVictoryConfirmVisible(false);
    setTimerConfig({ duration: target, progress: currentProgress, requestDate: Date.now() });

    if (enableWhenTargetReached) {
      const timeUntilTarget = Math.max(0, (target - currentProgress) * 1000);
      hourglassEnableDeadlineRef.current = Date.now() + timeUntilTarget;
      hourglassEnableTimeoutRef.current = setMatchScopedTimeout(() => {
        setIsTimerButtonDisabled(false);
        hourglassEnableTimeoutRef.current = null;
        hourglassEnableDeadlineRef.current = null;
      }, timeUntilTarget);
      tryEnableTimerButtonFromDeadline();
    }
  };

  hasBottomPopupsVisible = () => {
    return isReactionPickerVisible || isMoveHistoryPopupVisible || isResignConfirmVisible || isTimerConfirmVisible || isClaimVictoryConfirmVisible || isBoardStylePickerVisible || isWagerPanelVisible();
  };

  enableTimerVictoryClaim = () => {
    setIsClaimVictoryVisible(true);
    setIsUndoButtonVisible(false);
    setIsAutomoveButtonVisible(false);
    setIsStartTimerVisible(false);
    setIsClaimVictoryButtonDisabled(false);
    setIsTimerConfirmVisible(false);
    setIsClaimVictoryConfirmVisible(false);
  };

  setPlaySamePuzzleAgainButtonVisible = (visible: boolean) => {
    setIsSamePuzzleAgainVisible(visible);
  };

  setEndMatchVisible = (visible: boolean) => {
    setIsEndMatchButtonVisible(visible);
  };

  setEndMatchConfirmed = (confirmed: boolean) => {
    setIsEndMatchConfirmed(confirmed);
  };

  setBotGameOptionVisible = (visible: boolean) => {
    setIsBotGameButtonVisible(visible);
  };

  setInviteLinkActionVisible = (visible: boolean) => {
    setIsInviteLinkButtonVisible(visible);
    if (!visible) {
      setIsInviteLoading(false);
      setDidCreateInvite(false);
      setInviteCopiedTmpState(false);
    }
  };

  setAutomatchWaitingState = (waiting: boolean) => {
    if (waiting) {
      setAutomatchVisible(true);
      setAutomatchEnabled(false);
      setAutomatchButtonTmpState(true);
    }
  };

  setAutomatchEnabled = (enabled: boolean) => {
    setAutomatchButtonTmpState(false);
    setIsAutomatchButtonEnabled(enabled);
  };

  setAutomatchVisible = (visible: boolean) => {
    setIsAutomatchButtonVisible(visible);
  };

  setHomeVisible = (visible: boolean) => {
    setIsDeepHomeButtonVisible(visible);
  };

  setAutomoveActionEnabled = (enabled: boolean) => {
    setIsAutomoveButtonEnabled(enabled);
  };

  setAutomoveActionVisible = (visible: boolean) => {
    setIsAutomoveButtonVisible(visible);
  };

  setUndoVisible = (visible: boolean) => {
    setIsUndoButtonVisible(visible);
  };

  setWatchOnlyVisible = (visible: boolean) => {
    setIsWatchOnlyIndicatorVisible(visible);
  };

  setUndoEnabled = (enabled: boolean) => {
    setIsUndoDisabled(!enabled);
  };

  showPrimaryAction = (action: PrimaryActionType) => {
    setPrimaryAction(action);
  };

  disableAndHideUndoResignAndTimerControls = () => {
    setIsUndoDisabled(true);
    setIsUndoButtonVisible(false);
    setIsAutomoveButtonVisible(false);
    setIsResignButtonVisible(false);
    setIsStartTimerVisible(false);
    setIsClaimVictoryVisible(false);
    setIsResignConfirmVisible(false);
    setIsTimerConfirmVisible(false);
    setIsClaimVictoryConfirmVisible(false);
  };

  toggleReactionPicker = () => {
    if (!isReactionPickerVisible) {
      if (isVoiceReactionDisabled) {
        return;
      }
      closeMenuAndInfoIfAny();
      setIsResignConfirmVisible(false);
      setIsTimerConfirmVisible(false);
      setIsClaimVictoryConfirmVisible(false);
      setIsMoveHistoryPopupVisible(false);
    }
    setIsReactionPickerVisible((prev) => !prev);
  };

  const toggleMoveHistoryPopup = (event: React.MouseEvent<HTMLButtonElement> | React.TouchEvent<HTMLButtonElement>) => {
    if (!isMoveHistoryPopupVisible) {
      closeMenuAndInfoIfAny();
      setIsResignConfirmVisible(false);
      setIsTimerConfirmVisible(false);
      setIsClaimVictoryConfirmVisible(false);
      setIsReactionPickerVisible(false);
      setIsNavigationPopupVisible(false);
    }
    setIsMoveHistoryPopupVisible((prev) => !prev);
  };

  const handleRematchSeriesChipClick = useCallback(async (matchId: string) => {
    if (rematchSeriesSelectionLockRef.current) {
      return;
    }
    rematchSeriesSelectionLockRef.current = true;
    setIsRematchSeriesSelectionInFlight(true);
    try {
      const didSwitch = await didSelectRematchSeriesMatch(matchId);
      if (didSwitch) {
        triggerMoveHistoryPopupSelectionReset();
      }
    } finally {
      rematchSeriesSelectionLockRef.current = false;
      setIsRematchSeriesSelectionInFlight(false);
    }
  }, []);

  const renderRematchSeriesChipContent = useCallback((item: RematchSeriesNavigatorItem) => {
    if (item.isPendingResponse) {
      return (
        <RematchWaitingIcon $isSelected={item.isSelected}>
          <FaHourglassHalf />
        </RematchWaitingIcon>
      );
    }
    if (item.whiteScore !== null && item.blackScore !== null) {
      const opponentScore = item.playerIsWhite ? item.blackScore : item.whiteScore;
      const playerScore = item.playerIsWhite ? item.whiteScore : item.blackScore;
      return (
        <>
          <RematchScoreOpponent $isSelected={item.isSelected}>{opponentScore}</RematchScoreOpponent>
          <RematchScorePlayer $isSelected={item.isSelected}>{playerScore}</RematchScorePlayer>
        </>
      );
    }
    return <RematchLoadingDots $isSelected={item.isSelected}>···</RematchLoadingDots>;
  }, []);

  const handleBrushClick = (event: React.MouseEvent<HTMLButtonElement> | React.TouchEvent<HTMLButtonElement>) => {
    if (!isBoardStylePickerVisible) {
      closeMenuAndInfoIfAny();
      setIsResignConfirmVisible(false);
      setIsTimerConfirmVisible(false);
      setIsClaimVictoryConfirmVisible(false);
      setIsReactionPickerVisible(false);
      setIsNavigationPopupVisible(false);
    }
    setIsBoardStylePickerVisible(!isBoardStylePickerVisible);
  };

  const handleResignClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!isResignConfirmVisible) {
      closeMenuAndInfoIfAny();
    }
    setIsTimerConfirmVisible(false);
    setIsClaimVictoryConfirmVisible(false);
    setIsResignConfirmVisible(!isResignConfirmVisible);
  };

  const handleTimerClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!isTimerConfirmVisible) {
      closeMenuAndInfoIfAny();
      updateTimerConfirmPosition();
    }
    setIsResignConfirmVisible(false);
    setIsClaimVictoryConfirmVisible(false);
    setIsTimerConfirmVisible(!isTimerConfirmVisible);
  };

  const handleHomeClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    didClickHomeButton();
  };

  const handleAutomoveClick = (event: React.MouseEvent<HTMLButtonElement> | React.TouchEvent<HTMLButtonElement>) => {
    if (!isAutomoveButtonEnabled) return;
    setAutomoveActionEnabled(false);
    didClickAutomoveButton();
  };

  const handleClaimVictoryClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!isClaimVictoryConfirmVisible) {
      closeMenuAndInfoIfAny();
      updateClaimVictoryConfirmPosition();
    }
    setIsResignConfirmVisible(false);
    setIsTimerConfirmVisible(false);
    setIsClaimVictoryConfirmVisible(!isClaimVictoryConfirmVisible);
  };

  const handleConfirmStartTimer = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setIsTimerConfirmVisible(false);
    didClickStartTimerButton();
    setIsTimerButtonDisabled(true);
  };

  const handleConfirmClaimVictory = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setIsClaimVictoryConfirmVisible(false);
    didClickClaimVictoryByTimerButton();
    setIsClaimVictoryButtonDisabled(true);
  };

  const handleEndMatchClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    didClickEndMatchButton();
  };

  const handleStickerSelect = useCallback((stickerId: number) => {
    setIsReactionPickerVisible(false);
    showVideoReaction(false, stickerId);
    playSounds([Sound.EmoteSent]);
    if (isGameWithBot) {
      const sessionGuard = connection.createSessionGuard();
      const responseStickerId = STICKER_ID_WHITELIST[Math.floor(Math.random() * STICKER_ID_WHITELIST.length)];
      setMatchScopedTimeout(() => {
        if (!sessionGuard()) {
          return;
        }
        showVideoReaction(true, responseStickerId);
        playSounds([Sound.EmoteReceived]);
      }, 5000);
    } else if (!puzzleMode) {
      const sessionGuard = connection.createSessionGuard();
      connection.sendVoiceReaction(newStickerReaction(stickerId));
      setIsVoiceReactionDisabled(true);
      setMatchScopedTimeout(() => {
        if (!sessionGuard()) {
          return;
        }
        setIsVoiceReactionDisabled(false);
      }, 9999);
    }
  }, [setMatchScopedTimeout]);

  const handleReactionSelect = useCallback((reaction: string) => {
    setIsReactionPickerVisible(false);
    const reactionObj = newReactionOfKind(reaction);
    playReaction(reactionObj);
    showVoiceReactionText(reaction, false);

    if (isGameWithBot) {
      const sessionGuard = connection.createSessionGuard();
      const responseReaction = reaction;
      const responseReactionObj = newReactionOfKind(responseReaction);
      setMatchScopedTimeout(() => {
        if (!sessionGuard()) {
          return;
        }
        playReaction(responseReactionObj);
        showVoiceReactionText(reaction, true);
      }, 2000);
    } else if (!puzzleMode) {
      const sessionGuard = connection.createSessionGuard();
      connection.sendVoiceReaction(reactionObj);
      setIsVoiceReactionDisabled(true);
      setMatchScopedTimeout(() => {
        if (!sessionGuard()) {
          return;
        }
        setIsVoiceReactionDisabled(false);
      }, 9999);
    }
  }, [setMatchScopedTimeout]);

  const playerUid = playerSideMetadata.uid;
  const opponentUid = opponentSideMetadata.uid;
  const opponentProfile = opponentUid ? getStashedPlayerProfile(opponentUid) : undefined;
  const playerHasProfile = storage.getProfileId("") !== "";
  const opponentHasProfile = !!(opponentProfile && opponentProfile.id);
  const hasAgreedWager = !!wagerState?.agreed;
  const hasResolvedWager = !!wagerState?.resolved;
  const playerHasProposed = !!(playerUid && wagerState?.proposedBy && wagerState.proposedBy[playerUid]) || !!(playerUid && wagerState?.proposals && wagerState.proposals[playerUid]);
  const hasPlayers = !!playerUid && !!opponentUid;
  const isEligibleForWager = isOnlineGame && !isWatchOnly && !isGameWithBot && !isMatchOver() && playerHasProfile && opponentHasProfile && hasPlayers;
  const isWatchOnlyMatchFinished = isWatchOnly && isMatchOver();
  const isEndMatchPillVisible = isEndMatchButtonVisible || isWatchOnlyMatchFinished;
  const isEndMatchPillFinished = isEndMatchConfirmed || isWatchOnlyMatchFinished;
  const canSubmitWager = isEligibleForWager && !hasAgreedWager && !hasResolvedWager && !playerHasProposed;
  const wagerMaterial = wagerSelection.name;
  const wagerCount = wagerSelection.count;
  const wagerReady = canSubmitWager && !!wagerMaterial && wagerCount > 0;

  const handleWagerModeToggle = useCallback(() => {
    setIsWagerMode(true);
  }, []);

  const handleMaterialSelect = useCallback((name: MaterialName) => {
    const total = materialAmounts[name] ?? 0;
    if (total <= 0) return;
    setWagerSelection((prev) => {
      if (prev.name === name) {
        const nextCount = Math.min(total, prev.count + 1);
        if (nextCount === prev.count) return prev;
        return { name, count: nextCount };
      }
      return { name, count: 1 };
    });
  }, [materialAmounts]);

  const handleWagerSubmit = useCallback(() => {
    if (!wagerMaterial || wagerCount === 0 || !canSubmitWager) {
      return;
    }
    setIsReactionPickerVisible(false);
    const material = wagerMaterial;
    const count = wagerCount;
    connection.sendWagerProposal(material, count).catch(() => {});
  }, [canSubmitWager, wagerCount, wagerMaterial]);

  const handleUndo = (event: React.MouseEvent<HTMLButtonElement> | React.TouchEvent<HTMLButtonElement>) => {
    if ((event.target as HTMLButtonElement).disabled) return;
    didClickUndoButton();
    setIsUndoDisabled(!canHandleUndo());
  };

  const handleConfirmResign = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setIsResignConfirmVisible(false);
    didClickConfirmResignButton();
  };

  const handleSamePuzzleAgainClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    playSameCompletedPuzzleAgain();
  };

  const handlePrimaryActionClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    soundPlayer.initializeOnUserInteraction(false);
    didClickPrimaryActionButton(primaryAction);
    setPrimaryAction(PrimaryActionType.None);
  };

  const handleBotGameClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    soundPlayer.initializeOnUserInteraction(false);
    didClickStartBotGameButton();
  };

  const handleAutomatchClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    soundPlayer.initializeOnUserInteraction(false);
    didClickAutomatchButton();
    setAutomatchEnabled(false);
    setAutomatchButtonTmpState(true);
  };

  const handleCancelAutomatchClick = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (isCancelAutomatchDisabled) return;
    const sessionGuard = connection.createSessionGuard();
    setIsCancelAutomatchDisabled(true);
    try {
      const result = await connection.cancelAutomatch();
      if (!sessionGuard()) {
        return;
      }
      if (result && result.ok) {
        await transitionToHome({ forceMatchScopeReset: true });
      } else {
        setIsCancelAutomatchDisabled(false);
      }
    } catch (_) {
      if (!sessionGuard()) {
        return;
      }
      setIsCancelAutomatchDisabled(false);
    }
  };

  const getPrimaryActionButtonText = () => {
    switch (primaryAction) {
      case PrimaryActionType.JoinGame:
        return "Join Game";
      case PrimaryActionType.Rematch:
        return puzzleMode ? "Next Lesson" : "Play Again";
      default:
        return "";
    }
  };

  const handleNavigationButtonClick = (event: React.MouseEvent<HTMLButtonElement> | React.TouchEvent<HTMLButtonElement>) => {
    if (!isNavigationPopupVisible) {
      closeMenuAndInfoIfAny();
    }
    setIsNavigationPopupVisible(!isNavigationPopupVisible);
  };

  const handleShare = async () => {
    try {
      await navigator.share({
        url: window.location.href,
        title: "Play Mons",
      });
    } catch (_) {}
  };

  return (
    <>
      <BrushButton ref={brushButtonRef} dimmed={isBrushButtonDimmed} onClick={!isMobile ? handleBrushClick : undefined} onTouchStart={isMobile ? handleBrushClick : undefined} aria-label="Appearance">
        <FaPaintBrush />
      </BrushButton>
      {isBoardStylePickerVisible && (
        <div ref={boardStylePickerRef}>
          <BoardStylePickerComponent />
        </div>
      )}
      {isNavigationPopupVisible && (
        <div ref={navigationPopupRef}>
          <NavigationPicker showsPuzzles={isNavigationListButtonVisible} showsHomeNavigation={isDeepHomeButtonVisible} navigateHome={handleHomeClick} />
        </div>
      )}
      {isMoveHistoryPopupVisible && <MoveHistoryPopup ref={moveHistoryPopupRef} />}
      <ControlsContainer ref={controlsContainerRef}>
        {hasRematchSeriesNavigation && (
          <RematchSeriesInlineControl>
            <RematchSeriesScroll>
              <RematchSeriesTrack>
                {rematchSeriesItems.map((seriesItem, idx, arr) => (
                  <React.Fragment key={seriesItem.matchId}>
                    <RematchSeriesChip
                      $isSelected={seriesItem.isSelected}
                      disabled={isRematchSeriesSelectionInFlight}
                      onClick={() => void handleRematchSeriesChipClick(seriesItem.matchId)}
                    >
                      {renderRematchSeriesChipContent(seriesItem)}
                    </RematchSeriesChip>
                    {idx < arr.length - 1 && <RematchSeriesSeparator $hidden={seriesItem.isSelected || arr[idx + 1].isSelected} />}
                  </React.Fragment>
                ))}
              </RematchSeriesTrack>
            </RematchSeriesScroll>
          </RematchSeriesInlineControl>
        )}
        {isEndMatchPillVisible && (
          <BottomPillButton onClick={!isEndMatchPillFinished ? handleEndMatchClick : undefined} isBlue={!isEndMatchPillFinished} disabled={isEndMatchPillFinished} isViewOnly={isEndMatchPillFinished}>
            {isEndMatchPillFinished ? (
              <>
                {statusIconUrls.cloud ? <BottomPillInlineIcon src={statusIconUrls.cloud} alt="" draggable={false} /> : "💨 "}
                {"Finished"}
              </>
            ) : (
              <>
                {statusIconUrls.finish ? <BottomPillInlineIcon src={statusIconUrls.finish} alt="" draggable={false} /> : "🏁 "}
                {"End Match"}
              </>
            )}
          </BottomPillButton>
        )}
        {isWatchOnlyIndicatorVisible && !isWatchOnlyMatchFinished && (
          <BottomPillButton isViewOnly={true} disabled={true}>
            <>
              {statusIconUrls.spectating ? <BottomPillInlineIcon src={statusIconUrls.spectating} alt="" draggable={false} /> : "📺 "}
              {"Watching"}
            </>
          </BottomPillButton>
        )}
        {isInviteLinkButtonVisible && !didCreateInvite && (
          <BottomPillButton onClick={handleInviteClick} isBlue={true} disabled={isInviteLoading}>
            {isInviteLoading ? (
              "Creating a Link..."
            ) : (
              <>
                <FaEnvelope style={{ marginRight: "6px", fontSize: "0.9em" }} />
                {"New Link Game"}
              </>
            )}
          </BottomPillButton>
        )}
        {isAutomatchButtonVisible && (
          <BottomPillButton onClick={handleAutomatchClick} isBlue={true} isViewOnly={automatchButtonTmpState} disabled={!isAutomatchButtonEnabled}>
            {automatchButtonTmpState ? (
              <>
                {statusIconUrls.automatch ? <BottomPillInlineIcon src={statusIconUrls.automatch} alt="" draggable={false} /> : "🥁 "}
                {"Automatching..."}
              </>
            ) : (
              <>
                <FaStar style={{ marginRight: "6px", fontSize: "0.9em" }} />
                {"Automatch"}
              </>
            )}
          </BottomPillButton>
        )}
        {isCancelAutomatchVisible && (
          <BottomPillButton onClick={handleCancelAutomatchClick} isBlue={true} disabled={isCancelAutomatchDisabled} isViewOnly={isCancelAutomatchDisabled}>
            {isCancelAutomatchDisabled ? "Canceling..." : "Cancel"}
          </BottomPillButton>
        )}
        {isBotGameButtonVisible && (
          <BottomPillButton onClick={handleBotGameClick} isBlue={true}>
            <FaRobot style={{ marginRight: "6px", fontSize: "0.9em" }} />
            {"Bot Game"}
          </BottomPillButton>
        )}
        {isInviteLinkButtonVisible && didCreateInvite && (
          <>
            <BottomPillButton onClick={handleInviteClick} isBlue={true}>
              {inviteCopiedTmpState ? (
                "Link is copied"
              ) : (
                <>
                  <FaLink style={{ marginRight: "6px", fontSize: "0.9em" }} />
                  {"Copy Link"}
                </>
              )}
            </BottomPillButton>
            <BottomPillButton onClick={handleShare} isBlue={true}>
              <FaShareAlt style={{ marginRight: "6px", fontSize: "0.9em" }} />
              {"Share"}
            </BottomPillButton>
          </>
        )}
        {primaryAction !== PrimaryActionType.None && (
          <BottomPillButton isBlue={true} onClick={handlePrimaryActionClick}>
            {getPrimaryActionButtonText()}
          </BottomPillButton>
        )}
        {isSamePuzzleAgainVisible && (
          <BottomPillButton onClick={handleSamePuzzleAgainClick} isBlue={true}>
            {"Victory Lap"}
          </BottomPillButton>
        )}
        {waitingStateText !== "" && (
          <BottomPillButton disabled={true} isViewOnly={true}>
            {waitingStateText}
          </BottomPillButton>
        )}
        {isClaimVictoryVisible && (
          <ControlButton ref={claimVictoryButtonRef} onClick={handleClaimVictoryClick} aria-label="Claim Victory" disabled={isClaimVictoryButtonDisabled}>
            <FaTrophy />
          </ControlButton>
        )}
        {isStartTimerVisible && <AnimatedHourglassButton ref={timerButtonRef} config={timerConfig} onClick={handleTimerClick} disabled={isTimerButtonDisabled} />}
        {isUndoButtonVisible && (
          <ControlButton onClick={!isMobile ? handleUndo : undefined} onTouchStart={isMobile ? handleUndo : undefined} aria-label="Undo" disabled={isUndoDisabled}>
            <FaUndo />
          </ControlButton>
        )}
        {isAutomoveButtonVisible && (
          <ControlButton onClick={!isMobile ? handleAutomoveClick : undefined} onTouchStart={isMobile ? handleAutomoveClick : undefined} aria-label="Bot" disabled={!isAutomoveButtonEnabled}>
            <IoSparklesSharp />
          </ControlButton>
        )}
        {isMoveHistoryButtonVisible && (
          <ControlButton onClick={!isMobile ? toggleMoveHistoryPopup : undefined} onTouchStart={isMobile ? toggleMoveHistoryPopup : undefined} aria-label="Move History" ref={moveHistoryButtonRef}>
            <FaScroll />
          </ControlButton>
        )}
        {isVoiceReactionButtonVisible && (
          <ControlButton onClick={!isMobile ? toggleReactionPicker : undefined} onTouchStart={isMobile ? toggleReactionPicker : undefined} aria-label="Voice Reaction" ref={voiceReactionButtonRef} disabled={isVoiceReactionDisabled}>
            <FaCommentAlt />
          </ControlButton>
        )}
        {isResignButtonVisible && (
          <ControlButton onClick={handleResignClick} aria-label="Resign" ref={resignButtonRef} disabled={false}>
            <FaFlag />
          </ControlButton>
        )}
        <NavigationListButton ref={navigationButtonRef} dimmed={isNavigationButtonDimmed} onClick={!isMobile ? handleNavigationButtonClick : undefined} onTouchStart={isMobile ? handleNavigationButtonClick : undefined} aria-label="Navigation">
          {isBadgeVisible && <NavigationBadge />}
          <FaHome />
        </NavigationListButton>
        {isReactionPickerVisible && (
          <ReactionPillsContainer ref={pickerRef} animatedMaxHeight={pickerMaxHeight}>
            {isWagerMode ? (
              <>
                <WagerBetButton
                  $ready={wagerReady}
                  onClick={wagerReady && !isMobile ? handleWagerSubmit : undefined}
                  onTouchStart={wagerReady && isMobile ? handleWagerSubmit : undefined}
                  disabled={!wagerReady}
                  style={{ cursor: wagerReady ? "pointer" : "default", opacity: wagerReady ? 1 : 0.6 }}>
                  {wagerMaterial && wagerCount > 0 ? (
                    <>
                      <span>Propose</span>
                      <WagerButtonBadge>
                        {materialUrls[wagerMaterial] && <WagerButtonIcon src={materialUrls[wagerMaterial] || ""} alt="" draggable={false} />}
                        <WagerButtonAmount>{wagerCount}</WagerButtonAmount>
                      </WagerButtonBadge>
                    </>
                  ) : (
                    "Select a Material"
                  )}
                </WagerBetButton>
                <WagerMaterialsGrid>
                  {MATERIALS.map((name) => (
                    <WagerMaterialItem key={name} onClick={!isMobile ? () => handleMaterialSelect(name) : undefined} onTouchStart={isMobile ? () => handleMaterialSelect(name) : undefined} disabled={materialAmounts[name] <= 0} style={{ opacity: materialAmounts[name] > 0 ? 1 : 0.4 }}>
                      {materialUrls[name] && <WagerMaterialIcon src={materialUrls[name] || ""} alt="" draggable={false} />}
                      <WagerMaterialAmount>{materialAmounts[name]}</WagerMaterialAmount>
                    </WagerMaterialItem>
                  ))}
                </WagerMaterialsGrid>
              </>
            ) : (
              <>
                {canSubmitWager && (
                  <WagerBetButton $ready={true} onClick={!isMobile ? handleWagerModeToggle : undefined} onTouchStart={isMobile ? handleWagerModeToggle : undefined}>
                    Propose a Wager
                  </WagerBetButton>
                )}
                <ReactionPill onClick={() => handleReactionSelect("yo")}>yo</ReactionPill>
                <ReactionPill onClick={() => handleReactionSelect("wahoo")}>wahoo</ReactionPill>
                <ReactionPill onClick={() => handleReactionSelect("drop")}>drop</ReactionPill>
                <ReactionPill onClick={() => handleReactionSelect("slurp")}>slurp</ReactionPill>
                <ReactionPill onClick={() => handleReactionSelect("gg")}>gg</ReactionPill>
                {stickerIds.map((id) => (
                  <StickerPill key={id} onClick={() => handleStickerSelect(id)} aria-label={`Sticker ${id}`}>
                    <img src={stickerUrls[id] || `${STICKER_IMAGE_BASE_URL}/${id}.webp`} alt="" loading="lazy" />
                  </StickerPill>
                ))}
              </>
            )}
          </ReactionPillsContainer>
        )}
        {isTimerConfirmVisible && (
          <ResignConfirmation
            ref={timerConfirmRef}
            style={timerConfirmLeft !== null ? { left: `${timerConfirmLeft}px`, right: "auto", transform: "translateX(-50%)" } : undefined}
          >
            <ReactionPill onClick={handleConfirmStartTimer}>Start a Timer</ReactionPill>
          </ResignConfirmation>
        )}
        {isClaimVictoryConfirmVisible && (
          <ResignConfirmation
            ref={claimVictoryConfirmRef}
            style={claimVictoryConfirmLeft !== null ? { left: `${claimVictoryConfirmLeft}px`, right: "auto", transform: "translateX(-50%)" } : undefined}
          >
            <ReactionPill onClick={handleConfirmClaimVictory}>Claim Victory</ReactionPill>
          </ResignConfirmation>
        )}
        {isResignConfirmVisible && (
          <ResignConfirmation ref={resignConfirmRef}>
            <ResignButton onClick={handleConfirmResign}>Resign</ResignButton>
          </ResignConfirmation>
        )}
      </ControlsContainer>
    </>
  );
};

export { BottomControls as default, setBrushAndNavigationButtonDimmed, setPlaySamePuzzleAgainButtonVisible, showWaitingStateText, setEndMatchConfirmed, setEndMatchVisible, setBotGameOptionVisible, setAutomatchWaitingState, setAutomatchEnabled, hasBottomPopupsVisible, setWatchOnlyVisible, setAutomoveActionEnabled, setAutomoveActionVisible, setIsReadyToCopyExistingInviteLink, showVoiceReactionButton, showMoveHistoryButton, setInviteLinkActionVisible, setAutomatchVisible, showResignButton, setUndoEnabled, setUndoVisible, setHomeVisible, hideTimerButtons, showTimerButtonProgressing, disableAndHideUndoResignAndTimerControls, enableTimerVictoryClaim, showPrimaryAction, setBadgeVisible };
