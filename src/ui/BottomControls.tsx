import React, { useRef, useEffect, useState, useCallback } from "react";
import styled from "styled-components";
import { FaUndo, FaFlag, FaCommentAlt, FaTrophy, FaHome, FaRobot, FaPaintBrush, FaStar, FaEnvelope, FaLink, FaShareAlt, FaQuestion } from "react-icons/fa";
import { IoSparklesSharp } from "react-icons/io5";
import AnimatedHourglassButton from "./AnimatedHourglassButton";
import { canHandleUndo, didClickUndoButton, didClickStartTimerButton, didClickClaimVictoryByTimerButton, didClickPrimaryActionButton, didClickHomeButton, didClickInviteActionButtonBeforeThereIsInviteReady, didClickAutomoveButton, didClickAttestVictoryButton, didClickAutomatchButton, didClickStartBotGameButton, didClickEndMatchButton, didClickConfirmResignButton, isGameWithBot, puzzleMode, playSameCompletedPuzzleAgain, showPuzzleInstructions } from "../game/gameController";
import { didClickInviteButton, sendVoiceReaction } from "../connection/connection";
import { updateBoardComponentForBoardStyleChange } from "./BoardComponent";
import { defaultEarlyInputEventName, isMobile } from "../utils/misc";
import { soundPlayer } from "../utils/SoundPlayer";
import { playReaction } from "../content/sounds";
import { newReactionOfKind } from "../content/sounds";
import { setBoardDimmed, showVoiceReactionText } from "../game/board";
import { toggleBoardStyle } from "../content/boardStyles";
import { hasFullScreenAlertVisible, hideFullScreenAlert } from "..";

export enum PrimaryActionType {
  None = "none",
  JoinGame = "joinGame",
  Rematch = "rematch",
}

let latestModalOutsideTapDismissDate = Date.now();

export function didDismissSomethingWithOutsideTapJustNow() {
  latestModalOutsideTapDismissDate = Date.now();
}

export function didNotDismissAnythingWithOutsideTapJustNow(): boolean {
  let delta = Date.now() - latestModalOutsideTapDismissDate;
  return delta >= 42;
}

const ControlsContainer = styled.div`
  position: fixed;
  bottom: 10px;
  right: 10px;
  left: 49px;
  display: flex;
  gap: 8px;
  justify-content: flex-end;

  @media screen and (orientation: portrait) {
    right: 8px;
  }

  @media screen and (max-width: 430px) {
    gap: 6px;
  }

  @media screen and (max-width: 360px) {
    gap: 6px;
    right: 6px;
    left: 6px;
  }

  @media screen and (max-width: 320px) {
    gap: 4px;
  }
`;

export const AppearanceToggleButton = styled.button<{ disabled?: boolean; dimmed?: boolean }>`
  position: fixed;
  bottom: 10px;
  left: 9px;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  opacity: ${(props) => (props.dimmed ? 0.77 : 1)};
  background-color: #f9f9f9;
  border: none;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  outline: none;
  -webkit-touch-callout: none;
  touch-action: none;

  @media screen and (orientation: portrait) {
    left: 8px;
  }

  @media screen and (max-width: 360px) {
    left: 6px;
  }

  @media screen and (max-width: 320px) {
    width: 27px;
  }

  svg {
    width: 12px;
    height: 12px;
    color: #76778788;
  }

  @media (hover: hover) and (pointer: fine) {
    &:hover svg {
      color: #767787af;
    }
  }

  @media (prefers-color-scheme: dark) {
    background-color: #242424;
    svg {
      color: #767787a9;
    }

    @media (hover: hover) and (pointer: fine) {
      &:hover svg {
        color: #767787f0;
      }
    }
  }
`;

export const ControlButton = styled.button<{ disabled?: boolean }>`
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background-color: #f0f0f0;
  border: none;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: ${(props) => (props.disabled ? "default" : "pointer")};
  transition: background-color 0.3s ease;
  -webkit-tap-highlight-color: transparent;

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background-color: ${(props) => (props.disabled ? "#f0f0f0" : "#e0e0e0")};
    }
  }

  &:active {
    background-color: ${(props) => (props.disabled ? "#f0f0f0" : "#d0d0d0")};
  }

  svg {
    width: 16px;
    height: 16px;
    color: ${(props) => (props.disabled ? "#aaa" : "#333")};
  }

  @media (prefers-color-scheme: dark) {
    background-color: #333;

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background-color: ${(props) => (props.disabled ? "#333" : "#444")};
      }
    }

    &:active {
      background-color: ${(props) => (props.disabled ? "#333" : "#555")};
    }

    svg {
      color: ${(props) => (props.disabled ? "#777" : "#f0f0f0")};
    }
  }
`;

const BottomPillButton = styled.button<{ isPink?: boolean; isBlue?: boolean; isViewOnly?: boolean; disabled?: boolean }>`
  /* Base colors */

  --color-white: white;
  --color-text-on-pink-disabled: rgba(204, 204, 204, 0.77);

  --color-tint: #007aff;
  --color-dark-tint: #0b84ff;

  --color-default: #007aff;
  --color-default-hover: #0069d9;
  --color-default-active: #0056b3;

  --color-blue: #f0f0f0;
  --color-blue-hover: #e0e0e0;
  --color-blue-active: #d0d0d0;

  --color-pink: #ff69b4;
  --color-pink-hover: #ff4da6;
  --color-pink-active: #d1477b;
  --color-pink-disabled: #ffd1dc;

  --color-view-only: #f0f0f0;
  --color-view-only-text: #aaa;

  /* Dark mode colors */

  --color-dark-default: #0b84ff;
  --color-dark-default-hover: #1a91ff;
  --color-dark-default-active: #299fff;

  --color-dark-blue: #333;
  --color-dark-blue-hover: #444;
  --color-dark-blue-active: #555;

  --color-dark-pink: #ff4da6;
  --color-dark-pink-hover: #ff69b4;
  --color-dark-pink-active: #ff85c0;
  --color-dark-pink-disabled: #664d57;

  --color-dark-view-only: #333;
  --color-dark-view-only-text: #777;

  background-color: ${(props) => (props.isViewOnly ? "var(--color-view-only)" : props.isBlue ? "var(--color-blue)" : props.isPink && props.disabled ? "var(--color-pink-disabled)" : props.isPink ? "var(--color-pink)" : "var(--color-default)")};
  height: 32px;
  font-weight: 888;
  font-size: 0.88rem;
  color: ${(props) => (props.isPink && props.disabled ? "var(--color-white)" : props.isViewOnly ? "var(--color-view-only-text)" : props.isBlue ? "var(--color-tint)" : "var(--color-white)")};
  border: none;
  border-radius: 10px;
  padding: 0px 16px;
  @media screen and (max-width: 300pt) {
    padding: 0px 10px;
  }
  @media screen and (max-width: 500px) {
    font-size: 0.81rem;
    font-weight: 750;
  }
  @media screen and (max-width: 468px) {
    font-size: 0.77rem;
    font-weight: 700;
  }
  @media screen and (max-width: 433px) {
    padding: 0px 10px;
  }
  @media screen and (max-width: 295pt) {
    padding: 0px 8px;
  }
  @media screen and (max-width: 381px) {
    font-size: 0.72rem;
    font-weight: 720;
  }
  @media screen and (max-width: 365px) {
    font-size: 0.69rem;
  }
  @media screen and (max-width: 320px) {
    font-size: 0.63rem;
  }
  cursor: ${(props) => (props.isViewOnly || (props.isPink && props.disabled) ? "default" : "pointer")};
  transition: background-color 0.3s ease;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background-color: ${(props) => (props.isViewOnly ? "var(--color-view-only)" : props.isBlue ? "var(--color-blue-hover)" : props.isPink && props.disabled ? "var(--color-pink-disabled)" : props.isPink ? "var(--color-pink-hover)" : "var(--color-default-hover)")};
    }
  }

  &:active {
    background-color: ${(props) => (props.isViewOnly ? "var(--color-view-only)" : props.isBlue ? "var(--color-blue-active)" : props.isPink && props.disabled ? "var(--color-pink-disabled)" : props.isPink ? "var(--color-pink-active)" : "var(--color-default-active)")};
  }

  @media (prefers-color-scheme: dark) {
    color: ${(props) => (props.isPink && props.disabled ? "var(--color-text-on-pink-disabled)" : props.isViewOnly ? "var(--color-dark-view-only-text)" : props.isBlue ? "var(--color-dark-tint)" : "var(--color-white)")};

    background-color: ${(props) => (props.isViewOnly ? "var(--color-dark-view-only)" : props.isBlue ? "var(--color-dark-blue)" : props.isPink && props.disabled ? "var(--color-dark-pink-disabled)" : props.isPink ? "var(--color-dark-pink)" : "var(--color-dark-default)")};

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background-color: ${(props) => (props.isViewOnly ? "var(--color-dark-view-only)" : props.isBlue ? "var(--color-dark-blue-hover)" : props.isPink && props.disabled ? "var(--color-dark-pink-disabled)" : props.isPink ? "var(--color-dark-pink-hover)" : "var(--color-dark-default-hover)")};
      }
    }

    &:active {
      background-color: ${(props) => (props.isViewOnly ? "var(--color-dark-view-only)" : props.isBlue ? "var(--color-dark-blue-active)" : props.isPink && props.disabled ? "var(--color-dark-pink-disabled)" : props.isPink ? "var(--color-dark-pink-active)" : "var(--color-dark-default-active)")};
    }
  }

  svg {
    width: 0.9em;
    height: 0.9em;
    margin-right: 6px;
    flex-shrink: 0;
  }
`;
const ReactionPicker = styled.div<{ offsetToTheRight?: boolean }>`
  position: absolute;
  bottom: 40px;
  right: ${(props) => (props.offsetToTheRight ? "22px" : "64px")};
  background-color: #f0f0f0;
  border-radius: 8px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;

  @media (prefers-color-scheme: dark) {
    background-color: #333;
  }
`;

const ReactionButton = styled.button`
  background: none;
  border: none;
  padding: 4px 8px;
  cursor: pointer;
  text-align: left;
  color: #333;

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background-color: #e8e8e8;
    }
  }

  &:active {
    background-color: #e0e0e0;
  }

  @media (prefers-color-scheme: dark) {
    color: #f0f0f0;

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background-color: #3a3a3a;
      }
    }

    &:active {
      background-color: #484848;
    }
  }
`;

const ResignConfirmation = styled(ReactionPicker)`
  right: 10px;
  bottom: 40px;
  padding: 12px;
`;

const ResignButton = styled(ReactionButton)`
  background-color: #ff4136;
  color: white;
  border-radius: 4px;
  padding: 8px 16px;
  font-weight: bold;

  &:active {
    background-color: #d30000;
  }

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background-color: #e60000;
    }
  }

  @media (prefers-color-scheme: dark) {
    background-color: #cc0000;

    &:active {
      background-color: #990000;
    }

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background-color: #b30000;
      }
    }
  }
`;

let hasBottomPopupsVisible: () => boolean;
let showVoiceReactionButton: (show: boolean) => void;
let showResignButton: () => void;
let setInviteLinkActionVisible: (visible: boolean) => void;
let setAutomatchEnabled: (enabled: boolean) => void;
let setAutomatchVisible: (visible: boolean) => void;
let setBotGameOptionVisible: (visible: boolean) => void;
let setPlaySamePuzzleAgainButtonVisible: (visible: boolean) => void;
let setAutomatchWaitingState: (waiting: boolean) => void;
let setInstructionsToggleButtonVisible: (visible: boolean) => void;

let setAttestVictoryEnabled: (enabled: boolean) => void;
let setAttestVictoryVisible: (visible: boolean) => void;
let setBrushButtonDimmed: (dimmed: boolean) => void;

let showWaitingStateText: (text: string) => void;
let showButtonForTx: (hash: string) => void;
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
let hideReactionPicker: () => void;
let toggleReactionPicker: () => void;
let enableTimerVictoryClaim: () => void;
let showPrimaryAction: (action: PrimaryActionType) => void;

const BottomControls: React.FC = () => {
  const [isAttestVictoryButtonEnabled, setIsAttestVictoryButtonEnabled] = useState(true);
  const [isEndMatchButtonVisible, setIsEndMatchButtonVisible] = useState(false);
  const [isEndMatchConfirmed, setIsEndMatchConfirmed] = useState(false);
  const [isAttestVictoryButtonVisible, setIsAttestVictoryButtonVisible] = useState(false);
  const [isInviteLinkButtonVisible, setIsInviteLinkButtonVisible] = useState(false);
  const [isBotGameButtonVisible, setIsBotGameButtonVisible] = useState(false);
  const [isAutomatchButtonVisible, setIsAutomatchButtonVisible] = useState(false);
  const [isAutomatchButtonEnabled, setIsAutomatchButtonEnabled] = useState(true);
  const [isWatchOnlyIndicatorVisible, setIsWatchOnlyIndicatorVisible] = useState(false);
  const [isHomeButtonVisible, setIsHomeButtonVisible] = useState(false);
  const [isInviteLoading, setIsInviteLoading] = useState(false);
  const [didCreateInvite, setDidCreateInvite] = useState(false);
  const [automatchButtonTmpState, setAutomatchButtonTmpState] = useState(false);
  const [inviteCopiedTmpState, setInviteCopiedTmpState] = useState(false);
  const [isVoiceReactionDisabled, setIsVoiceReactionDisabled] = useState(false);
  const [isBrushButtonDimmed, setIsBrushButtonDimmed] = useState(false);

  const [txHash, setTxHash] = useState("");
  const [isUndoDisabled, setIsUndoDisabled] = useState(true);
  const [waitingStateText, setWaitingStateText] = useState("");
  const [isStartTimerVisible, setIsStartTimerVisible] = useState(false);
  const [primaryAction, setPrimaryAction] = useState<PrimaryActionType>(PrimaryActionType.None);
  const [isUndoButtonVisible, setIsUndoButtonVisible] = useState(false);
  const [isAutomoveButtonEnabled, setIsAutomoveButtonEnabled] = useState(true);
  const [isAutomoveButtonVisible, setIsAutomoveButtonVisible] = useState(false);
  const [isInstructionsButtonVisible, setIsInstructionsButtonVisible] = useState(false);
  const [isResignButtonVisible, setIsResignButtonVisible] = useState(false);
  const [isVoiceReactionButtonVisible, setIsVoiceReactionButtonVisible] = useState(false);
  const [isReactionPickerVisible, setIsReactionPickerVisible] = useState(false);
  const [isResignConfirmVisible, setIsResignConfirmVisible] = useState(false);
  const [isTimerButtonDisabled, setIsTimerButtonDisabled] = useState(true);
  const [isClaimVictoryVisible, setIsClaimVictoryVisible] = useState(false);
  const [isSamePuzzleAgainVisible, setIsSamePuzzleAgainVisible] = useState(false);

  const [isClaimVictoryButtonDisabled, setIsClaimVictoryButtonDisabled] = useState(false);
  const [timerConfig, setTimerConfig] = useState({ duration: 90, progress: 0, requestDate: Date.now() });

  const pickerRef = useRef<HTMLDivElement>(null);
  const voiceReactionButtonRef = useRef<HTMLButtonElement>(null);
  const resignButtonRef = useRef<HTMLButtonElement>(null);
  const resignConfirmRef = useRef<HTMLDivElement>(null);
  const hourglassEnableTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    const handleClickOutside = (event: TouchEvent | MouseEvent) => {
      event.stopPropagation();
      if ((pickerRef.current && !pickerRef.current.contains(event.target as Node) && !voiceReactionButtonRef.current?.contains(event.target as Node)) || (resignConfirmRef.current && !resignConfirmRef.current.contains(event.target as Node) && !resignButtonRef.current?.contains(event.target as Node))) {
        didDismissSomethingWithOutsideTapJustNow();
        setIsReactionPickerVisible(false);
        setIsResignConfirmVisible(false);
      }
    };

    document.addEventListener(defaultEarlyInputEventName, handleClickOutside);
    return () => {
      document.removeEventListener(defaultEarlyInputEventName, handleClickOutside);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (hourglassEnableTimeoutRef.current) {
        clearTimeout(hourglassEnableTimeoutRef.current);
      }
    };
  }, []);

  const handleAttestVictoryClick = () => {
    if (!isAttestVictoryButtonEnabled) return;
    setIsAttestVictoryButtonEnabled(false);
    didClickAttestVictoryButton();
  };

  const didClickTxHashButton = () => {
    window.open(`https://basescan.org/tx/${txHash}`, "_blank", "noopener,noreferrer");
  };

  const handleInviteClick = () => {
    soundPlayer.initialize(false);
    if (!didCreateInvite) {
      didClickInviteActionButtonBeforeThereIsInviteReady();
    }
    setIsInviteLoading(true);
    didClickInviteButton((result: boolean) => {
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

  setBrushButtonDimmed = (dimmed: boolean) => {
    setIsBrushButtonDimmed(dimmed);
  };

  showVoiceReactionButton = (show: boolean) => {
    setIsVoiceReactionButtonVisible(show);
  };

  showResignButton = () => {
    setIsResignButtonVisible(true);
  };

  showWaitingStateText = (text: string) => {
    setWaitingStateText(text);
  };

  showButtonForTx = (hash: string) => {
    setTxHash(hash);
  };

  setIsReadyToCopyExistingInviteLink = () => {
    setDidCreateInvite(true);
  };

  hideTimerButtons = () => {
    if (hourglassEnableTimeoutRef.current) {
      clearTimeout(hourglassEnableTimeoutRef.current);
      hourglassEnableTimeoutRef.current = undefined;
    }
    setIsTimerButtonDisabled(true);
    setIsStartTimerVisible(false);
    setIsClaimVictoryVisible(false);
  };

  showTimerButtonProgressing = (currentProgress: number, target: number, enableWhenTargetReached: boolean) => {
    if (hourglassEnableTimeoutRef.current) {
      clearTimeout(hourglassEnableTimeoutRef.current);
      hourglassEnableTimeoutRef.current = undefined;
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
        hourglassEnableTimeoutRef.current = undefined;
      }, timeUntilTarget);
    }
  };

  hasBottomPopupsVisible = () => {
    return isReactionPickerVisible || isResignConfirmVisible;
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

  setInstructionsToggleButtonVisible = (visible: boolean) => {
    setIsInstructionsButtonVisible(visible);
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

  setAttestVictoryVisible = (visible: boolean) => {
    setIsAttestVictoryButtonVisible(visible);
  };

  setAttestVictoryEnabled = (enabled: boolean) => {
    setIsAttestVictoryButtonEnabled(enabled);
  };

  setAutomatchEnabled = (enabled: boolean) => {
    setAutomatchButtonTmpState(false);
    setIsAutomatchButtonEnabled(enabled);
  };

  setAutomatchVisible = (visible: boolean) => {
    setIsAutomatchButtonVisible(visible);
  };

  setHomeVisible = (visible: boolean) => {
    setIsHomeButtonVisible(visible);
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

  hideReactionPicker = () => {
    setIsReactionPickerVisible(false);
  };

  toggleReactionPicker = () => {
    if (!isReactionPickerVisible) {
      if (isVoiceReactionDisabled) {
        return;
      }
      setIsResignConfirmVisible(false);
    }
    setIsReactionPickerVisible((prev) => !prev);
  };

  const handleInstructionsClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (hasFullScreenAlertVisible()) {
      hideFullScreenAlert();
      setBoardDimmed(false);
    } else {
      showPuzzleInstructions();
    }
  };

  const handleResignClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
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

  const handleReactionSelect = useCallback((reaction: string) => {
    hideReactionPicker();
    const reactionObj = newReactionOfKind(reaction);
    playReaction(reactionObj);
    showVoiceReactionText(reaction, false);
    if (!isGameWithBot) {
      sendVoiceReaction(reactionObj);
      setIsVoiceReactionDisabled(true);
      setTimeout(() => {
        setIsVoiceReactionDisabled(false);
      }, 9999);
    } else {
      const responseReaction = reaction;
      const responseReactionObj = newReactionOfKind(responseReaction);
      setTimeout(() => {
        playReaction(responseReactionObj);
        showVoiceReactionText(reaction, true);
      }, 2000);
    }
  }, []);

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
    soundPlayer.initialize(false);
    didClickPrimaryActionButton(primaryAction);
    setPrimaryAction(PrimaryActionType.None);
  };

  const handleBotGameClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    soundPlayer.initialize(false);
    didClickStartBotGameButton();
  };

  const handleAutomatchClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    soundPlayer.initialize(false);
    didClickAutomatchButton();
    setAutomatchEnabled(false);
    setAutomatchButtonTmpState(true);
  };

  const getPrimaryActionButtonText = () => {
    switch (primaryAction) {
      case PrimaryActionType.JoinGame:
        return "Join Game";
      case PrimaryActionType.Rematch:
        return puzzleMode ? "Play Next" : "Play Again";
      default:
        return "";
    }
  };

  const handleBrushClick = (event: React.MouseEvent<HTMLButtonElement> | React.TouchEvent<HTMLButtonElement>) => {
    toggleBoardStyle();
    updateBoardComponentForBoardStyleChange();
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
      <AppearanceToggleButton dimmed={isBrushButtonDimmed} onClick={!isMobile ? handleBrushClick : undefined} onTouchStart={isMobile ? handleBrushClick : undefined} aria-label="Appearance">
        <FaPaintBrush />
      </AppearanceToggleButton>
      <ControlsContainer>
        {isEndMatchButtonVisible && (
          <BottomPillButton onClick={handleEndMatchClick} isBlue={!isEndMatchConfirmed} disabled={isEndMatchConfirmed} isViewOnly={isEndMatchConfirmed}>
            {isEndMatchConfirmed ? "💨 Finished" : "🏁 End Match"}
          </BottomPillButton>
        )}
        {txHash !== "" && (
          <BottomPillButton onClick={didClickTxHashButton} isBlue={true}>
            {"↗️ View on Explorer"}
          </BottomPillButton>
        )}
        {isAttestVictoryButtonVisible && (
          <BottomPillButton onClick={handleAttestVictoryClick} isPink={true} disabled={!isAttestVictoryButtonEnabled}>
            {"🎉 Attest Victory"}
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
        {isInstructionsButtonVisible && (
          <ControlButton onClick={handleInstructionsClick} aria-label="Help" disabled={false}>
            <FaQuestion />
          </ControlButton>
        )}
        {isHomeButtonVisible && (
          <ControlButton onClick={handleHomeClick} aria-label="Home">
            <FaHome />
          </ControlButton>
        )}
        {isReactionPickerVisible && (
          <ReactionPicker ref={pickerRef} offsetToTheRight={!isResignButtonVisible}>
            <ReactionButton onClick={() => handleReactionSelect("yo")}>yo</ReactionButton>
            <ReactionButton onClick={() => handleReactionSelect("wahoo")}>wahoo</ReactionButton>
            <ReactionButton onClick={() => handleReactionSelect("drop")}>drop</ReactionButton>
            <ReactionButton onClick={() => handleReactionSelect("slurp")}>slurp</ReactionButton>
            <ReactionButton onClick={() => handleReactionSelect("gg")}>gg</ReactionButton>
          </ReactionPicker>
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

export { BottomControls as default, setInstructionsToggleButtonVisible, setBrushButtonDimmed, setPlaySamePuzzleAgainButtonVisible, showWaitingStateText, setEndMatchConfirmed, setEndMatchVisible, setBotGameOptionVisible, setAutomatchWaitingState, showButtonForTx, setAttestVictoryEnabled, setAutomatchEnabled, setAttestVictoryVisible, hasBottomPopupsVisible, setWatchOnlyVisible, setAutomoveActionEnabled, setAutomoveActionVisible, setIsReadyToCopyExistingInviteLink, showVoiceReactionButton, setInviteLinkActionVisible, setAutomatchVisible, showResignButton, setUndoEnabled, setUndoVisible, setHomeVisible, hideTimerButtons, showTimerButtonProgressing, disableAndHideUndoResignAndTimerControls, hideReactionPicker, enableTimerVictoryClaim, showPrimaryAction };
