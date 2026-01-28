import React, { useRef, useEffect, useState, useCallback } from "react";
import { FaUndo, FaFlag, FaCommentAlt, FaTrophy, FaHome, FaRobot, FaStar, FaEnvelope, FaLink, FaShareAlt, FaPaintBrush, FaScroll } from "react-icons/fa";
import { IoSparklesSharp } from "react-icons/io5";
import AnimatedHourglassButton from "./AnimatedHourglassButton";
import { canHandleUndo, didClickUndoButton, didClickStartTimerButton, didClickClaimVictoryByTimerButton, didClickPrimaryActionButton, didClickHomeButton, didClickInviteActionButtonBeforeThereIsInviteReady, didClickAutomoveButton, didClickAutomatchButton, didClickStartBotGameButton, didClickEndMatchButton, didClickConfirmResignButton, isGameWithBot, puzzleMode, playSameCompletedPuzzleAgain, isOnlineGame, isWatchOnly, isMatchOver } from "../game/gameController";
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
import BoardStylePickerComponent from "./BoardStylePicker";
import { Sound } from "../utils/gameModels";
import MoveHistoryPopup from "./MoveHistoryPopup";
import { MATERIALS, MaterialName, rocksMiningService } from "../services/rocksMiningService";
import { MatchWagerState } from "../connection/connectionModels";
import { subscribeToWagerState } from "../game/wagerState";
import { computeAvailableMaterials, getFrozenMaterials, subscribeToFrozenMaterials } from "../services/wagerMaterialsService";
import { getStashedPlayerProfile } from "../utils/playerMetadata";
import { storage } from "../utils/storage";

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

export let closeNavigationAndAppearancePopupIfAny: () => void = () => {};
export let setNavigationListButtonVisible: (visible: boolean) => void;

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

let hasBottomPopupsVisible: () => boolean;
let showVoiceReactionButton: (show: boolean) => void;
let showMoveHistoryButton: (show: boolean) => void;
let showResignButton: () => void;
let setInviteLinkActionVisible: (visible: boolean) => void;
let setAutomatchEnabled: (enabled: boolean) => void;
let setAutomatchVisible: (visible: boolean) => void;
let setBotGameOptionVisible: (visible: boolean) => void;
let setPlaySamePuzzleAgainButtonVisible: (visible: boolean) => void;
let setAutomatchWaitingState: (waiting: boolean) => void;
let setBrushAndNavigationButtonDimmed: (dimmed: boolean) => void;
let setBadgeVisible: (visible: boolean) => void;

let showWaitingStateText: (text: string) => void;
let setHomeVisible: (visible: boolean) => void;
let setEndMatchVisible: (visible: boolean) => void;
let setEndMatchConfirmed: (confirmed: boolean) => void;
let setUndoVisible: (visible: boolean) => void;
let setAutomoveActionEnabled: (enabled: boolean) => void;
let setAutomoveActionVisible: (visible: boolean) => void;
let setWatchOnlyVisible: (visible: boolean) => void;
let setUndoEnabled: (enabled: boolean) => void;
let disableAndHideUndoResignAndTimerControls: () => void;
let setIsReadyToCopyExistingInviteLink: () => void;
let hideTimerButtons: () => void;
let showTimerButtonProgressing: (currentProgress: number, target: number, enableWhenTargetReached: boolean) => void;
let toggleReactionPicker: () => void;
let enableTimerVictoryClaim: () => void;
let showPrimaryAction: (action: PrimaryActionType) => void;

const STICKER_ID_WHITELIST: number[] = [9, 17, 20, 26, 30, 31, 40, 50, 54, 61, 63, 74, 101, 109, 132, 146, 148, 163, 168, 173, 180, 189, 209, 210, 217, 224, 225, 228, 232, 236, 243, 245, 246, 250, 256, 257, 258, 267, 271, 281, 283, 289, 302, 303, 313, 316, 318, 325, 328, 338, 347, 356, 374, 382, 389, 393, 396, 401, 403, 405, 407, 429, 430, 444, 465, 466, 900316, 900101, 900393, 90063, 900109, 900228, 900245, 900267, 900374, 900347, 900382, 900429, 900225, 900999, 900189];
const FIXED_STICKER_IDS: number[] = [900316, 900101, 900393, 90063, 900109, 900228, 900245, 900189, 900267, 900374, 900347, 900382, 900429, 900225, 900999];

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
  const [isResignConfirmVisible, setIsResignConfirmVisible] = useState(false);
  const [isTimerButtonDisabled, setIsTimerButtonDisabled] = useState(true);
  const [isClaimVictoryVisible, setIsClaimVictoryVisible] = useState(false);
  const [isSamePuzzleAgainVisible, setIsSamePuzzleAgainVisible] = useState(false);

  const [isCancelAutomatchVisible, setIsCancelAutomatchVisible] = useState(false);
  const [isCancelAutomatchDisabled, setIsCancelAutomatchDisabled] = useState(false);

  const [isClaimVictoryButtonDisabled, setIsClaimVictoryButtonDisabled] = useState(false);
  const [timerConfig, setTimerConfig] = useState({ duration: 90, progress: 0, requestDate: Date.now() });
  const [stickerIds, setStickerIds] = useState<number[]>([]);
  const [pickerMaxHeight, setPickerMaxHeight] = useState<number | undefined>(undefined);

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
  const [wagerState, setWagerState] = useState<MatchWagerState | null>(null);
  const frozenMaterialsRef = useRef<Record<MaterialName, number>>(getFrozenMaterials());
  const latestServiceMaterialsRef = useRef<Record<MaterialName, number>>({ dust: 0, slime: 0, gum: 0, metal: 0, ice: 0 });

  const pickerRef = useRef<HTMLDivElement>(null);
  const voiceReactionButtonRef = useRef<HTMLButtonElement>(null);
  const moveHistoryButtonRef = useRef<HTMLButtonElement>(null);
  const resignButtonRef = useRef<HTMLButtonElement>(null);
  const resignConfirmRef = useRef<HTMLDivElement>(null);
  const hourglassEnableTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const cancelAutomatchRevealTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const navigationPopupRef = useRef<HTMLDivElement>(null);
  const navigationButtonRef = useRef<HTMLButtonElement>(null);
  const boardStylePickerRef = useRef<HTMLDivElement>(null);
  const brushButtonRef = useRef<HTMLButtonElement>(null);
  const moveHistoryPopupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: TouchEvent | MouseEvent) => {
      event.stopPropagation();
      if ((pickerRef.current && !pickerRef.current.contains(event.target as Node) && !voiceReactionButtonRef.current?.contains(event.target as Node)) || (resignConfirmRef.current && !resignConfirmRef.current.contains(event.target as Node) && !resignButtonRef.current?.contains(event.target as Node))) {
        didDismissSomethingWithOutsideTapJustNow();
        setIsReactionPickerVisible(false);
        setIsResignConfirmVisible(false);
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
    if (isReactionPickerVisible) {
      const cachedExtraIds = normalizeStickerIds(storage.getReactionExtraStickerIds([]));
      setStickerIds(mergeStickerIds(FIXED_STICKER_IDS, cachedExtraIds));
    }
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

  useEffect(() => {
    if (!isReactionPickerVisible) return;
    let isCancelled = false;
    const fetchReactions = async () => {
      try {
        const data = await fetchNftsForStoredAddresses();
        const extraIds = getSwagpackReactionStickerIds(data?.swagpack_reactions);
        if (isCancelled) return;
        const nextStickerIds = mergeStickerIds(FIXED_STICKER_IDS, extraIds);
        setStickerIds(nextStickerIds);
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
    let mounted = true;
    const materialImagePromises: Map<MaterialName, Promise<string | null>> = new Map();
    const getMaterialImageUrl = (name: MaterialName) => {
      if (!materialImagePromises.has(name)) {
        const url = `https://assets.mons.link/rocks/materials/${name}.webp`;
        const p = fetch(url)
          .then((res) => {
            if (!res.ok) throw new Error("Failed to fetch image");
            return res.blob();
          })
          .then((blob) => URL.createObjectURL(blob))
          .catch(() => null);
        materialImagePromises.set(name, p);
      }
      return materialImagePromises.get(name)!;
    };
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
    return () => {
      if (hourglassEnableTimeoutRef.current) {
        clearTimeout(hourglassEnableTimeoutRef.current);
      }
      if (cancelAutomatchRevealTimeoutRef.current) {
        clearTimeout(cancelAutomatchRevealTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (cancelAutomatchRevealTimeoutRef.current) {
      clearTimeout(cancelAutomatchRevealTimeoutRef.current);
      cancelAutomatchRevealTimeoutRef.current = null;
    }
    if (automatchButtonTmpState && isAutomatchButtonVisible) {
      setIsCancelAutomatchVisible(false);
      setIsCancelAutomatchDisabled(false);
      cancelAutomatchRevealTimeoutRef.current = setTimeout(() => {
        setIsCancelAutomatchVisible(true);
      }, 10000);
    } else {
      setIsCancelAutomatchVisible(false);
      setIsCancelAutomatchDisabled(false);
    }
    return () => {
      if (cancelAutomatchRevealTimeoutRef.current) {
        clearTimeout(cancelAutomatchRevealTimeoutRef.current);
        cancelAutomatchRevealTimeoutRef.current = null;
      }
    };
  }, [automatchButtonTmpState, isAutomatchButtonVisible]);

  closeNavigationAndAppearancePopupIfAny = () => {
    setIsNavigationPopupVisible(false);
    setIsBoardStylePickerVisible(false);
  };

  const handleInviteClick = () => {
    soundPlayer.initializeOnUserInteraction(false);
    if (!didCreateInvite) {
      didClickInviteActionButtonBeforeThereIsInviteReady();
    }
    setIsInviteLoading(true);
    connection.didClickInviteButton((result: boolean) => {
      if (result) {
        if (didCreateInvite) {
          setInviteCopiedTmpState(true);
          setTimeout(() => {
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

  setNavigationListButtonVisible = (visible: boolean) => {
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
      clearTimeout(hourglassEnableTimeoutRef.current);
      hourglassEnableTimeoutRef.current = null;
    }
    setIsTimerButtonDisabled(true);
    setIsStartTimerVisible(false);
    setIsClaimVictoryVisible(false);
  };

  showTimerButtonProgressing = (currentProgress: number, target: number, enableWhenTargetReached: boolean) => {
    if (hourglassEnableTimeoutRef.current) {
      clearTimeout(hourglassEnableTimeoutRef.current);
      hourglassEnableTimeoutRef.current = null;
    }

    setIsTimerButtonDisabled(true);
    setIsStartTimerVisible(true);
    setIsAutomoveButtonVisible(false);
    setIsUndoButtonVisible(false);
    setIsClaimVictoryVisible(false);
    setTimerConfig({ duration: target, progress: currentProgress, requestDate: Date.now() });

    if (enableWhenTargetReached) {
      const timeUntilTarget = (target - currentProgress) * 1000;
      hourglassEnableTimeoutRef.current = setTimeout(() => {
        setIsTimerButtonDisabled(false);
        hourglassEnableTimeoutRef.current = null;
      }, timeUntilTarget);
    }
  };

  hasBottomPopupsVisible = () => {
    return isReactionPickerVisible || isMoveHistoryPopupVisible || isResignConfirmVisible || isBoardStylePickerVisible || isWagerPanelVisible();
  };

  enableTimerVictoryClaim = () => {
    setIsClaimVictoryVisible(true);
    setIsUndoButtonVisible(false);
    setIsAutomoveButtonVisible(false);
    setIsStartTimerVisible(false);
    setIsClaimVictoryButtonDisabled(false);
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
  };

  toggleReactionPicker = () => {
    if (!isReactionPickerVisible) {
      if (isVoiceReactionDisabled) {
        return;
      }
      closeMenuAndInfoIfAny();
      setIsResignConfirmVisible(false);
      setIsMoveHistoryPopupVisible(false);
    }
    setIsReactionPickerVisible((prev) => !prev);
  };

  const toggleMoveHistoryPopup = (event: React.MouseEvent<HTMLButtonElement> | React.TouchEvent<HTMLButtonElement>) => {
    if (!isMoveHistoryPopupVisible) {
      closeMenuAndInfoIfAny();
      setIsResignConfirmVisible(false);
      setIsReactionPickerVisible(false);
      setIsNavigationPopupVisible(false);
    }
    setIsMoveHistoryPopupVisible((prev) => !prev);
  };

  const handleBrushClick = (event: React.MouseEvent<HTMLButtonElement> | React.TouchEvent<HTMLButtonElement>) => {
    if (!isBoardStylePickerVisible) {
      closeMenuAndInfoIfAny();
      setIsResignConfirmVisible(false);
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
    setIsResignConfirmVisible(!isResignConfirmVisible);
  };

  const handleTimerClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    didClickStartTimerButton();
    setIsTimerButtonDisabled(true);
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
      const responseStickerId = STICKER_ID_WHITELIST[Math.floor(Math.random() * STICKER_ID_WHITELIST.length)];
      setTimeout(() => {
        showVideoReaction(true, responseStickerId);
        playSounds([Sound.EmoteReceived]);
      }, 5000);
    } else if (!puzzleMode) {
      connection.sendVoiceReaction(newStickerReaction(stickerId));
      setIsVoiceReactionDisabled(true);
      setTimeout(() => {
        setIsVoiceReactionDisabled(false);
      }, 9999);
    }
  }, []);

  const handleReactionSelect = useCallback((reaction: string) => {
    setIsReactionPickerVisible(false);
    const reactionObj = newReactionOfKind(reaction);
    playReaction(reactionObj);
    showVoiceReactionText(reaction, false);

    if (isGameWithBot) {
      const responseReaction = reaction;
      const responseReactionObj = newReactionOfKind(responseReaction);
      setTimeout(() => {
        playReaction(responseReactionObj);
        showVoiceReactionText(reaction, true);
      }, 2000);
    } else if (!puzzleMode) {
      connection.sendVoiceReaction(reactionObj);
      setIsVoiceReactionDisabled(true);
      setTimeout(() => {
        setIsVoiceReactionDisabled(false);
      }, 9999);
    }
  }, []);

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
    setIsCancelAutomatchDisabled(true);
    try {
      const result = await connection.cancelAutomatch();
      if (result && result.ok) {
        window.location.href = "/";
      } else {
        setIsCancelAutomatchDisabled(false);
      }
    } catch (_) {
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
      <ControlsContainer>
        {isEndMatchButtonVisible && (
          <BottomPillButton onClick={handleEndMatchClick} isBlue={!isEndMatchConfirmed} disabled={isEndMatchConfirmed} isViewOnly={isEndMatchConfirmed}>
            {isEndMatchConfirmed ? "💨 Finished" : "🏁 End Match"}
          </BottomPillButton>
        )}
        {isWatchOnlyIndicatorVisible && (
          <BottomPillButton isViewOnly={true} disabled={true}>
            {"📺 Spectating"}
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
              "🥁 Automatching..."
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
          <ControlButton onClick={handleClaimVictoryClick} aria-label="Claim Victory" disabled={isClaimVictoryButtonDisabled}>
            <FaTrophy />
          </ControlButton>
        )}
        {isStartTimerVisible && <AnimatedHourglassButton config={timerConfig} onClick={handleTimerClick} disabled={isTimerButtonDisabled} />}
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
                  onClick={wagerReady ? handleWagerSubmit : undefined}
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
                    <WagerMaterialItem key={name} onClick={() => handleMaterialSelect(name)} disabled={materialAmounts[name] <= 0} style={{ opacity: materialAmounts[name] > 0 ? 1 : 0.4 }}>
                      {materialUrls[name] && <WagerMaterialIcon src={materialUrls[name] || ""} alt="" draggable={false} />}
                      <WagerMaterialAmount>{materialAmounts[name]}</WagerMaterialAmount>
                    </WagerMaterialItem>
                  ))}
                </WagerMaterialsGrid>
              </>
            ) : (
              <>
                {canSubmitWager && (
                  <WagerBetButton $ready={true} onClick={handleWagerModeToggle}>
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
                    <img src={`https://assets.mons.link/swagpack/64/${id}.webp`} alt="" loading="lazy" />
                  </StickerPill>
                ))}
              </>
            )}
          </ReactionPillsContainer>
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
