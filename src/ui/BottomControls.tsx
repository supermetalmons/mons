import React, { useRef, useEffect, useState, useCallback } from "react";
import { FaUndo, FaFlag, FaCommentAlt, FaTrophy, FaHome, FaRobot, FaStar, FaEnvelope, FaLink, FaShareAlt, FaList, FaPaintBrush, FaQuestionCircle } from "react-icons/fa";
import { IoSparklesSharp } from "react-icons/io5";
import AnimatedHourglassButton from "./AnimatedHourglassButton";
import { canHandleUndo, didClickUndoButton, didClickStartTimerButton, didClickClaimVictoryByTimerButton, didClickPrimaryActionButton, didClickHomeButton, didClickInviteActionButtonBeforeThereIsInviteReady, didClickAutomoveButton, didClickAutomatchButton, didClickStartBotGameButton, didClickEndMatchButton, didClickConfirmResignButton, isGameWithBot, puzzleMode, playSameCompletedPuzzleAgain, showPuzzleInstructions } from "../game/gameController";
import { didClickInviteButton, sendVoiceReaction } from "../connection/connection";
import { defaultEarlyInputEventName, isMobile } from "../utils/misc";
import { soundPlayer } from "../utils/SoundPlayer";
import { playReaction } from "../content/sounds";
import { newReactionOfKind } from "../content/sounds";
import { setBoardDimmed, showVoiceReactionText } from "../game/board";
import { hasFullScreenAlertVisible, hideFullScreenAlert } from "..";
import NavigationPicker from "./NavigationPicker";
import { updateBoardComponentForBoardStyleChange } from "./BoardComponent";
import { toggleBoardStyle } from "../content/boardStyles";
import { ControlsContainer, BrushButton, NavigationListButton, ControlButton, BottomPillButton, ReactionButton, ReactionPicker, ResignButton, ResignConfirmation } from "./BottomControlsStyles";
import { closeMenuAndInfoIfAny } from "./MainMenu";

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

export let closeNavigationPopupIfAny: () => void = () => {};
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

export function hasNavigationPopupVisible(): boolean {
  return getIsNavigationPopupOpen();
}

let getIsNavigationPopupOpen: () => boolean = () => false;

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
let setBrushAndNavigationButtonDimmed: (dimmed: boolean) => void;

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
let hideReactionPicker: () => void;
let toggleReactionPicker: () => void;
let enableTimerVictoryClaim: () => void;
let showPrimaryAction: (action: PrimaryActionType) => void;

const BottomControls: React.FC = () => {
  const [isEndMatchButtonVisible, setIsEndMatchButtonVisible] = useState(false);
  const [isEndMatchConfirmed, setIsEndMatchConfirmed] = useState(false);
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
  const [isNavigationButtonDimmed, setIsNavigationButtonDimmed] = useState(false);
  const [isBrushButtonDimmed, setIsBrushButtonDimmed] = useState(false);
  const [isNavigationListButtonVisible, setIsNavigationListButtonVisible] = useState(false);
  const [isNavigationPopupVisible, setIsNavigationPopupVisible] = useState(false);

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
  const navigationPopupRef = useRef<HTMLDivElement>(null);
  const navigationButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: TouchEvent | MouseEvent) => {
      event.stopPropagation();
      if ((pickerRef.current && !pickerRef.current.contains(event.target as Node) && !voiceReactionButtonRef.current?.contains(event.target as Node)) || (resignConfirmRef.current && !resignConfirmRef.current.contains(event.target as Node) && !resignButtonRef.current?.contains(event.target as Node))) {
        didDismissSomethingWithOutsideTapJustNow();
        setIsReactionPickerVisible(false);
        setIsResignConfirmVisible(false);
      }

      if (navigationPopupRef.current && !navigationPopupRef.current.contains(event.target as Node) && !navigationButtonRef.current?.contains(event.target as Node)) {
        didDismissSomethingWithOutsideTapJustNow();
        setIsNavigationPopupVisible(false);
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

  closeNavigationPopupIfAny = () => {
    setIsNavigationPopupVisible(false);
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

  getIsNavigationPopupOpen = () => isNavigationPopupVisible;

  setNavigationListButtonVisible = (visible: boolean) => {
    setIsNavigationListButtonVisible(visible);
    if (!visible) {
      setIsNavigationPopupVisible(false);
    }
  };

  setBrushAndNavigationButtonDimmed = (dimmed: boolean) => {
    setIsNavigationButtonDimmed(dimmed);
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
      closeMenuAndInfoIfAny();
      setIsResignConfirmVisible(false);
    }
    setIsReactionPickerVisible((prev) => !prev);
  };

  const handleBrushClick = (event: React.MouseEvent<HTMLButtonElement> | React.TouchEvent<HTMLButtonElement>) => {
    toggleBoardStyle();
    updateBoardComponentForBoardStyleChange();
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
      <BrushButton dimmed={isBrushButtonDimmed} onClick={!isMobile ? handleBrushClick : undefined} onTouchStart={isMobile ? handleBrushClick : undefined} aria-label="Appearance">
        <FaPaintBrush />
      </BrushButton>
      {isNavigationPopupVisible && (
        <div ref={navigationPopupRef}>
          <NavigationPicker />
        </div>
      )}
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
            <FaQuestionCircle />
          </ControlButton>
        )}
        {isHomeButtonVisible && (
          <ControlButton onClick={handleHomeClick} aria-label="Home">
            <FaHome />
          </ControlButton>
        )}
        {isNavigationListButtonVisible && (
          <NavigationListButton ref={navigationButtonRef} dimmed={isNavigationButtonDimmed} onClick={!isMobile ? handleNavigationButtonClick : undefined} onTouchStart={isMobile ? handleNavigationButtonClick : undefined} aria-label="Navigation">
            <FaList />
          </NavigationListButton>
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

export { BottomControls as default, setInstructionsToggleButtonVisible, setBrushAndNavigationButtonDimmed, setPlaySamePuzzleAgainButtonVisible, showWaitingStateText, setEndMatchConfirmed, setEndMatchVisible, setBotGameOptionVisible, setAutomatchWaitingState, setAutomatchEnabled, hasBottomPopupsVisible, setWatchOnlyVisible, setAutomoveActionEnabled, setAutomoveActionVisible, setIsReadyToCopyExistingInviteLink, showVoiceReactionButton, setInviteLinkActionVisible, setAutomatchVisible, showResignButton, setUndoEnabled, setUndoVisible, setHomeVisible, hideTimerButtons, showTimerButtonProgressing, disableAndHideUndoResignAndTimerControls, hideReactionPicker, enableTimerVictoryClaim, showPrimaryAction };
