import initMonsWeb, * as MonsWeb from "mons-web";
import { playerSideMetadata, opponentSideMetadata, showVoiceReactionText, setupPlayerId, hideAllMoveStatuses, hideTimerCountdownDigits, showTimer, showPuzzleTitle } from "./board";
import * as Board from "./board";
import { Location, Highlight, HighlightKind, AssistedInputKind, Sound, InputModifier, Trace } from "../utils/gameModels";
import { colors } from "../content/boardStyles";
import { playSounds, playReaction } from "../content/sounds";
import { isAutomatch, sendResignStatus, sendMove, isCreateNewInviteFlow, sendEmojiUpdate, setupConnection, startTimer, claimVictoryByTimer, sendRematchProposal, sendAutomatchRequest, connectToAutomatch, sendEndMatchIndicator, rematchSeriesEndIsIndicated, connectToGame, updateRatings, seeIfFreshlySignedInProfileIsOneOfThePlayers, isBoardSnapshotFlow, getSnapshotIdAndClearPathIfNeeded, isBotsLoopMode } from "../connection/connection";
import { setWatchOnlyVisible, showResignButton, showVoiceReactionButton, setUndoEnabled, setUndoVisible, disableAndHideUndoResignAndTimerControls, hideTimerButtons, showTimerButtonProgressing, enableTimerVictoryClaim, showPrimaryAction, PrimaryActionType, setInviteLinkActionVisible, setAutomatchVisible, setHomeVisible, setIsReadyToCopyExistingInviteLink, setAutomoveActionVisible, setAutomoveActionEnabled, setAutomatchEnabled, setAutomatchWaitingState, setBotGameOptionVisible, setEndMatchVisible, setEndMatchConfirmed, showWaitingStateText, setBrushAndNavigationButtonDimmed, setNavigationListButtonVisible, setPlaySamePuzzleAgainButtonVisible, setInstructionsToggleButtonVisible, closeNavigationAndAppearancePopupIfAny } from "../ui/BottomControls";
import { Match } from "../connection/connectionModels";
import { recalculateRatingsLocallyForUids } from "../utils/playerMetadata";
import { getNextProblem, Problem } from "../content/problems";
import { hasFullScreenAlertVisible, hideFullScreenAlert, showFullScreenAlert } from "..";
import { storage } from "../utils/storage";

const experimentalDrawingDevMode = false;

export let initialFen = "";
export let isWatchOnly = false;
export let isOnlineGame = false;
export let isGameWithBot = false;
export let isWaitingForRematchResponse = false;

export let puzzleMode = false;
let selectedProblem: Problem | null = null;
let didStartLocalGame = false;
let isGameOver = false;
let isReconnect = false;
let didConnect = false;
let isWaitingForInviteToGetAccepted = false;

let whiteProcessedMovesCount = 0;
let blackProcessedMovesCount = 0;
let didSetWhiteProcessedMovesCount = false;
let didSetBlackProcessedMovesCount = false;

let currentGameModelMatchId: string | null = null;
let whiteFlatMovesString: string | null = null;
let blackFlatMovesString: string | null = null;

let game: MonsWeb.MonsGameModel;
let botPlayerColor: MonsWeb.Color;
let playerSideColor: MonsWeb.Color;
let resignedColor: MonsWeb.Color | undefined;
let winnerByTimerColor: MonsWeb.Color | undefined;

let lastReactionTime = 0;

const processedVoiceReactions = new Set<string>();

var currentInputs: Location[] = [];

let blackTimerStash: string | null = null;
let whiteTimerStash: string | null = null;

export function getCurrentGameFen(): string {
  return game.fen();
}

export async function go() {
  setupConnection(false);

  Board.setupBoard();

  await initMonsWeb();

  playerSideColor = MonsWeb.Color.White;
  game = MonsWeb.MonsGameModel.new();
  initialFen = game.fen();

  if (experimentalDrawingDevMode) {
    isOnlineGame = true;
    Board.runExperimentalMonsBoardAsDisplayAnimation();
    return;
  }

  if (isBotsLoopMode) {
    Board.toggleExperimentalMode(false, true, false, true);

    game.locations_with_content().forEach((loc) => {
      const location = new Location(loc.i, loc.j);
      updateLocation(location);
    });

    didStartLocalGame = true;
    setHomeVisible(true);
    setBrushAndNavigationButtonDimmed(true);
    setInviteLinkActionVisible(false);
    setAutomatchVisible(false);
    setBotGameOptionVisible(false);
    setNavigationListButtonVisible(false);

    isWatchOnly = true;
    automove();
  } else if (isBoardSnapshotFlow) {
    const snapshot = decodeURIComponent(getSnapshotIdAndClearPathIfNeeded() || "");
    const gameFromFen = MonsWeb.MonsGameModel.from_fen(snapshot);
    if (!gameFromFen) return;
    game = gameFromFen;
    game.locations_with_content().forEach((loc) => {
      const location = new Location(loc.i, loc.j);
      updateLocation(location);
    });
    didStartLocalGame = true;
    setHomeVisible(true);
    setBrushAndNavigationButtonDimmed(true);
    setUndoVisible(true);
    setInviteLinkActionVisible(false);
    setAutomatchVisible(false);
    setBotGameOptionVisible(false);
    setNavigationListButtonVisible(false);
    setAutomoveActionVisible(true);
  } else if (isCreateNewInviteFlow) {
    game.locations_with_content().forEach((loc) => {
      const location = new Location(loc.i, loc.j);
      updateLocation(location);
    });
    setInviteLinkActionVisible(true);
    setAutomatchVisible(true);
    setBotGameOptionVisible(true);
    setNavigationListButtonVisible(true);
  } else {
    isOnlineGame = true;
    setHomeVisible(true);
    setBrushAndNavigationButtonDimmed(true);
    setNavigationListButtonVisible(false);
  }

  Board.setupGameInfoElements(!isCreateNewInviteFlow && !isBoardSnapshotFlow && !isBotsLoopMode);
  if (isBoardSnapshotFlow || isBotsLoopMode) {
    updateBoardMoveStatuses();
    Board.updateScore(game.white_score(), game.black_score(), game.winner_color(), resignedColor, winnerByTimerColor);
  }

  if (isBotsLoopMode) {
    Board.showRandomEmojisForLoopMode();
  }
}

export function failedToCreateRematchProposal() {
  setEndMatchVisible(true);
  showPrimaryAction(PrimaryActionType.Rematch);
}

function rematchInLoopMode() {
  isGameOver = false;
  game = MonsWeb.MonsGameModel.new();
  Board.toggleBoardFlipped();
  playerSideColor = playerSideColor === MonsWeb.Color.White ? MonsWeb.Color.Black : MonsWeb.Color.White;
  Board.resetForNewGame();
  Board.didToggleItemsStyleSet(false);
  Board.showRandomEmojisForLoopMode();
  setNewBoard();
  automove();
}

export function didJustCreateRematchProposalSuccessfully(inviteId: string) {
  setEndMatchVisible(true);
  showWaitingStateText("Ready to Play");

  isGameOver = false;
  isReconnect = false;
  didConnect = false;
  isWaitingForInviteToGetAccepted = false;
  isWaitingForRematchResponse = true;
  whiteProcessedMovesCount = 0;
  blackProcessedMovesCount = 0;
  didSetWhiteProcessedMovesCount = false;
  didSetBlackProcessedMovesCount = false;
  currentGameModelMatchId = null;
  whiteFlatMovesString = null;
  blackFlatMovesString = null;
  playerSideColor = MonsWeb.Color.White;
  game = MonsWeb.MonsGameModel.new();

  resignedColor = undefined;
  winnerByTimerColor = undefined;

  lastReactionTime = 0;
  currentInputs = [];
  blackTimerStash = null;
  whiteTimerStash = null;

  connectToGame(inviteId, true);
}

export function didDiscoverExistingRematchProposalWaitingForResponse() {
  Board.runMonsBoardAsDisplayWaitingAnimation();
  setEndMatchVisible(true);
  showWaitingStateText("Ready to Play");
}

export function didFindYourOwnInviteThatNobodyJoined(isAutomatch: boolean) {
  if (!isAutomatch) {
    setInviteLinkActionVisible(true);
    setIsReadyToCopyExistingInviteLink();
    Board.runMonsBoardAsDisplayWaitingAnimation();
  } else if (!isCreateNewInviteFlow) {
    setAutomatchWaitingState(true);
    Board.runMonsBoardAsDisplayWaitingAnimation();
  }
}

export function didClickStartBotGameButton() {
  didStartLocalGame = true;
  setHomeVisible(true);
  setUndoVisible(true);
  setBrushAndNavigationButtonDimmed(true);
  setInviteLinkActionVisible(false);
  setAutomatchVisible(false);
  setBotGameOptionVisible(false);
  setNavigationListButtonVisible(false);
  setAutomoveActionVisible(true);
  showResignButton();
  Board.setBoardFlipped(true);
  Board.showOpponentAsBotPlayer();
  Board.resetForNewGame();
  setNewBoard();
  botPlayerColor = MonsWeb.Color.White;
  playerSideColor = MonsWeb.Color.Black;
  isGameWithBot = true;
  showVoiceReactionButton(true);
  automove();
}

export function handleFreshlySignedInProfileInGameIfNeeded(profileId: string) {
  if (isWatchOnly) {
    seeIfFreshlySignedInProfileIsOneOfThePlayers(profileId);
  }
}

export function didFindInviteThatCanBeJoined() {
  showPrimaryAction(PrimaryActionType.JoinGame);
  Board.runMonsBoardAsDisplayWaitingAnimation();
}

export function didClickAutomatchButton() {
  setHomeVisible(true);
  setBrushAndNavigationButtonDimmed(true);
  setAutomoveActionVisible(false);
  setInviteLinkActionVisible(false);
  setBotGameOptionVisible(false);
  setNavigationListButtonVisible(false);
  Board.hideBoardPlayersInfo();
  Board.removeHighlights();
  hideAllMoveStatuses();
  isWaitingForInviteToGetAccepted = true;
  Board.runMonsBoardAsDisplayWaitingAnimation();

  sendAutomatchRequest()
    .then((response) => {
      const automatchInviteId = response.inviteId;
      if (automatchInviteId) {
        connectToAutomatch(automatchInviteId);
      }
    })
    .catch(() => {
      setAutomatchEnabled(true);
    });
}

function showRematchInterface() {
  if (isWatchOnly) {
    return;
  }
  if (rematchSeriesEndIsIndicated()) {
    didReceiveRematchesSeriesEndIndicator();
  } else {
    showPrimaryAction(PrimaryActionType.Rematch);
    if (isOnlineGame) {
      setEndMatchVisible(true);
    }
  }
}

export function showItemsAfterChangingAssetsStyle() {
  game.locations_with_content().forEach((loc) => {
    const location = new Location(loc.i, loc.j);
    updateLocation(location);
  });

  const inputsToReapply = currentInputs;
  currentInputs = [];
  for (const input of inputsToReapply) {
    didClickSquare(input);
  }
}

export function didReceiveRematchesSeriesEndIndicator() {
  if (isWatchOnly) return;
  showPrimaryAction(PrimaryActionType.None);
  setEndMatchVisible(true);
  setEndMatchConfirmed(true);
  showVoiceReactionButton(false);
  showWaitingStateText("");
  Board.stopMonsBoardAsDisplayAnimations();
}

function automove() {
  if (puzzleMode && hasFullScreenAlertVisible()) {
    hideFullScreenAlert();
    setAutomoveActionEnabled(true);
    return;
  }

  let output = game.smart_automove();
  applyOutput("", output, false, true, AssistedInputKind.None);
  Board.hideItemSelectionOrConfirmationOverlay();

  if (isBotsLoopMode) {
    return;
  }

  if (!isGameWithBot || isPlayerSideTurn()) {
    setAutomoveActionEnabled(true);
  } else {
    setAutomoveActionEnabled(false);
  }
}

function didConfirmRematchProposal() {
  if (puzzleMode) {
    const nextProblem = getNextProblem(selectedProblem!.id);
    if (nextProblem) {
      showNextProblem(nextProblem);
      return;
    }
  }

  if (!isOnlineGame) {
    window.location.href = "/";
    return;
  }

  setEndMatchVisible(false);
  Board.runMonsBoardAsDisplayWaitingAnimation();
  sendRematchProposal();
  Board.hideBoardPlayersInfo();
  showVoiceReactionButton(false);
}

export function didClickEndMatchButton() {
  showPrimaryAction(PrimaryActionType.None);
  setEndMatchConfirmed(true);
  showVoiceReactionButton(false);
  sendEndMatchIndicator();
  showWaitingStateText("");
  Board.stopMonsBoardAsDisplayAnimations();
}

export function didClickPrimaryActionButton(action: PrimaryActionType) {
  switch (action) {
    case PrimaryActionType.JoinGame:
      setupConnection(true);
      break;
    case PrimaryActionType.Rematch:
      didConfirmRematchProposal();
      break;
    default:
      break;
  }
}

export function didClickClaimVictoryByTimerButton() {
  if (isOnlineGame && !isWatchOnly) {
    claimVictoryByTimer()
      .then((res) => {
        if (res.ok) {
          handleVictoryByTimer(false, playerSideColor === MonsWeb.Color.White ? "white" : "black", true);
        }
      })
      .catch(() => {});
  }
}

export function didClickHomeButton() {
  window.location.href = "/";
}

export function didClickStartTimerButton() {
  if (isOnlineGame && !isWatchOnly && !isPlayerSideTurn()) {
    startTimer()
      .then((res) => {
        if (res.ok) {
          showTimerCountdown(false, res.timer, playerSideColor === MonsWeb.Color.White ? "white" : "black", res.duration);
        }
      })
      .catch(() => {});
  }
}

export function didClickConfirmResignButton() {
  sendResignStatus();
  handleResignStatus(false, "");
}

export function canHandleUndo(): boolean {
  if (isWatchOnly || isGameOver) {
    return false;
  } else if (isOnlineGame || isGameWithBot) {
    return game.can_takeback(playerSideColor);
  } else {
    return game.can_takeback(game.active_color());
  }
}

export function didClickUndoButton() {
  if (canHandleUndo()) {
    const output = game.takeback();
    applyOutput("", output, false, false, AssistedInputKind.None);
  }
}

export function canChangeEmoji(opponents: boolean): boolean {
  if (storage.getLoginId("") || isBotsLoopMode) {
    return false;
  }
  if (isOnlineGame || isGameWithBot) {
    return opponents ? false : !isWatchOnly;
  } else {
    return isPlayerSideTurn() ? !opponents : opponents;
  }
}

export function sendPlayerEmojiUpdate(newId: number) {
  sendEmojiUpdate(newId, false);
}

export function isPlayerSideTurn(): boolean {
  return game.active_color() === playerSideColor;
}

export function didSelectInputModifier(inputModifier: InputModifier) {
  if ((isOnlineGame && !didConnect) || isWatchOnly || isGameOver || isWaitingForInviteToGetAccepted) {
    return;
  }
  processInput(AssistedInputKind.None, inputModifier);
}

export function didClickSquare(location: Location) {
  if (puzzleMode && hasFullScreenAlertVisible()) {
    hideFullScreenAlert();
    return;
  }

  if ((isOnlineGame && !didConnect) || isWatchOnly || isGameOver || isWaitingForInviteToGetAccepted) {
    return;
  }
  processInput(AssistedInputKind.None, InputModifier.None, location);
}

function turnShouldBeConfirmedForOutputEvents(events: MonsWeb.EventModel[], fenBeforeMove: string): boolean {
  const wasFirstTurn = game.turn_number() === 2;
  const hasNextTurn = events.some((e) => e.kind === MonsWeb.EventModelKind.NextTurn);
  const hasGameOver = events.some((e) => e.kind === MonsWeb.EventModelKind.GameOver);

  if (wasFirstTurn || hasGameOver || !hasNextTurn) {
    return false;
  }

  const gameBeforeMove = MonsWeb.MonsGameModel.from_fen(fenBeforeMove)!;
  const moveKinds = gameBeforeMove.available_move_kinds();
  const monMoves = moveKinds[0];
  return monMoves > 0;
}

function applyOutput(fenBeforeMove: string, output: MonsWeb.OutputModel, isRemoteInput: boolean, isBotInput: boolean, assistedInputKind: AssistedInputKind, inputLocation?: Location) {
  switch (output.kind) {
    case MonsWeb.OutputModelKind.InvalidInput:
      const shouldTryToReselect = assistedInputKind === AssistedInputKind.None && currentInputs.length > 1 && inputLocation && !currentInputs[0].equals(inputLocation);
      const shouldHelpFindOptions = assistedInputKind === AssistedInputKind.None && currentInputs.length === 1;
      currentInputs = [];
      Board.removeHighlights();
      if (shouldTryToReselect) {
        processInput(AssistedInputKind.ReselectLastInvalidInput, InputModifier.None, inputLocation);
      } else if (shouldHelpFindOptions) {
        processInput(AssistedInputKind.FindStartLocationsAfterInvalidInput, InputModifier.None);
      }
      break;
    case MonsWeb.OutputModelKind.LocationsToStartFrom:
      const startFromHighlights: Highlight[] = output.locations().map((loc) => new Highlight(new Location(loc.i, loc.j), HighlightKind.StartFromSuggestion, colors.startFromSuggestion));
      Board.removeHighlights();
      Board.applyHighlights(startFromHighlights);
      break;
    case MonsWeb.OutputModelKind.NextInputOptions:
      const nextInputs = output.next_inputs();

      if (nextInputs[0].kind === MonsWeb.NextInputKind.SelectConsumable) {
        Board.removeHighlights();
        playSounds([Sound.ChoosePickup]);
        Board.showItemSelection();
        return;
      }

      const nextInputHighlights = nextInputs.flatMap((input) => {
        if (!input.location) return [];
        const location = new Location(input.location.i, input.location.j);
        let color: string;
        let highlightKind: HighlightKind;
        switch (input.kind) {
          case MonsWeb.NextInputKind.MonMove:
            highlightKind = hasItemAt(location) || Board.hasBasePlaceholder(location) ? HighlightKind.TargetSuggestion : HighlightKind.EmptySquare;
            color = colors.destination;
            break;
          case MonsWeb.NextInputKind.ManaMove:
            highlightKind = hasItemAt(location) ? HighlightKind.TargetSuggestion : HighlightKind.EmptySquare;
            color = colors.destination;
            break;
          case MonsWeb.NextInputKind.MysticAction:
            highlightKind = HighlightKind.TargetSuggestion;
            color = colors.attackTarget;
            break;
          case MonsWeb.NextInputKind.DemonAction:
            highlightKind = HighlightKind.TargetSuggestion;
            color = colors.attackTarget;
            break;
          case MonsWeb.NextInputKind.DemonAdditionalStep:
            highlightKind = Board.hasBasePlaceholder(location) ? HighlightKind.TargetSuggestion : HighlightKind.EmptySquare;
            color = colors.attackTarget;
            break;
          case MonsWeb.NextInputKind.SpiritTargetCapture:
            highlightKind = HighlightKind.TargetSuggestion;
            color = colors.spiritTarget;
            break;
          case MonsWeb.NextInputKind.SpiritTargetMove:
            highlightKind = hasItemAt(location) || Board.hasBasePlaceholder(location) ? HighlightKind.TargetSuggestion : HighlightKind.EmptySquare;
            color = colors.spiritTarget;
            break;
          case MonsWeb.NextInputKind.SelectConsumable:
            highlightKind = HighlightKind.TargetSuggestion;
            color = colors.selectedItem;
            break;
          case MonsWeb.NextInputKind.BombAttack:
            highlightKind = HighlightKind.TargetSuggestion;
            color = colors.attackTarget;
            break;
        }
        return new Highlight(location, highlightKind, color);
      });

      const selectedItemsHighlights = currentInputs.map((input, index) => {
        let color: string;
        if (index > 0) {
          switch (nextInputs[nextInputs.length - 1].kind) {
            case MonsWeb.NextInputKind.DemonAdditionalStep:
              color = colors.attackTarget;
              break;
            case MonsWeb.NextInputKind.SpiritTargetMove:
              color = colors.spiritTarget;
              break;
            default:
              color = colors.selectedItem;
              break;
          }
        } else {
          color = colors.selectedItem;
        }
        return new Highlight(input, HighlightKind.Selected, color);
      });

      Board.removeHighlights();
      Board.applyHighlights([...selectedItemsHighlights, ...nextInputHighlights]);
      break;
    case MonsWeb.OutputModelKind.Events:
      const moveFen = output.input_fen();
      const gameFen = game.fen();

      const events = output.events();

      if (!isRemoteInput && fenBeforeMove !== "" && turnShouldBeConfirmedForOutputEvents(events, fenBeforeMove)) {
        game = MonsWeb.MonsGameModel.from_fen(fenBeforeMove)!;
        Board.showEndTurnConfirmationOverlay(
          game.active_color() === MonsWeb.Color.Black,
          () => {
            game = MonsWeb.MonsGameModel.from_fen(gameFen)!;
            applyOutput("", output, isRemoteInput, isBotInput, assistedInputKind, inputLocation);
          },
          () => {
            currentInputs = [];
            Board.removeHighlights();
          }
        );
        return;
      }

      if (isOnlineGame && !isRemoteInput) {
        sendMove(moveFen, gameFen);
      }

      if (!isOnlineGame && !didStartLocalGame) {
        didStartLocalGame = true;
        setHomeVisible(true);
        setBrushAndNavigationButtonDimmed(true);
        setUndoVisible(true);
        setInviteLinkActionVisible(false);
        setAutomatchVisible(false);
        setBotGameOptionVisible(false);
        if (!puzzleMode) {
          setNavigationListButtonVisible(false);
        }
        setAutomoveActionVisible(true);
      }

      currentInputs = [];

      let locationsToUpdate: Location[] = [];
      let mightKeepHighlightOnLocation: Location | undefined;
      let mustReleaseHighlight = isRemoteInput || isBotInput;
      let sounds: Sound[] = [];
      let traces: Trace[] = [];
      let popOpponentsEmoji = false;

      for (const event of events) {
        const from = event.loc1 ? location(event.loc1) : undefined;
        const to = event.loc2 ? location(event.loc2) : undefined;
        switch (event.kind) {
          case MonsWeb.EventModelKind.MonMove:
            if (!from || !to) break;
            sounds.push(Sound.Move);
            locationsToUpdate.push(from);
            locationsToUpdate.push(to);
            mightKeepHighlightOnLocation = to;
            traces.push(new Trace(from, to));
            break;
          case MonsWeb.EventModelKind.ManaMove:
            if (!from || !to) break;
            locationsToUpdate.push(from);
            locationsToUpdate.push(to);
            traces.push(new Trace(from, to));
            break;
          case MonsWeb.EventModelKind.ManaScored:
            if (!from || !event.mana) break;
            if (event.mana.kind === MonsWeb.ManaKind.Supermana) {
              sounds.push(Sound.ScoreSupermana);
            } else {
              sounds.push(Sound.ScoreMana);
            }
            locationsToUpdate.push(from);
            mustReleaseHighlight = true;
            Board.updateScore(game.white_score(), game.black_score(), game.winner_color(), resignedColor, winnerByTimerColor);
            break;
          case MonsWeb.EventModelKind.MysticAction:
            if (!from || !to) break;
            sounds.push(Sound.MysticAbility);
            locationsToUpdate.push(from);
            locationsToUpdate.push(to);
            traces.push(new Trace(from, to));
            break;
          case MonsWeb.EventModelKind.DemonAction:
            if (!from || !to) break;
            sounds.push(Sound.DemonAbility);
            locationsToUpdate.push(from);
            locationsToUpdate.push(to);
            traces.push(new Trace(from, to));
            break;
          case MonsWeb.EventModelKind.DemonAdditionalStep:
            if (!from || !to) break;
            locationsToUpdate.push(from);
            locationsToUpdate.push(to);
            traces.push(new Trace(from, to));
            break;
          case MonsWeb.EventModelKind.SpiritTargetMove:
            if (!from || !to) break;
            sounds.push(Sound.SpiritAbility);
            locationsToUpdate.push(from);
            locationsToUpdate.push(to);
            traces.push(new Trace(from, to));
            break;
          case MonsWeb.EventModelKind.PickupBomb:
            if (!from) break;
            sounds.push(Sound.PickupBomb);
            locationsToUpdate.push(from);
            mustReleaseHighlight = true;
            break;
          case MonsWeb.EventModelKind.UsePotion:
            if (from) {
              Board.indicatePotionUsage(from);
            }
            break;
          case MonsWeb.EventModelKind.PickupPotion:
            if (!from) break;
            sounds.push(Sound.PickupPotion);
            locationsToUpdate.push(from);
            mustReleaseHighlight = true;
            break;
          case MonsWeb.EventModelKind.PickupMana:
            if (!from) break;
            sounds.push(Sound.ManaPickUp);
            locationsToUpdate.push(from);
            break;
          case MonsWeb.EventModelKind.MonFainted:
            if (!from || !to) break;
            locationsToUpdate.push(from);
            locationsToUpdate.push(to);
            break;
          case MonsWeb.EventModelKind.ManaDropped:
            if (!from) break;
            locationsToUpdate.push(from);
            break;
          case MonsWeb.EventModelKind.SupermanaBackToBase:
            if (!from || !to) break;
            locationsToUpdate.push(from);
            locationsToUpdate.push(to);
            break;
          case MonsWeb.EventModelKind.BombAttack:
            if (!from || !to) break;
            sounds.push(Sound.Bomb);
            locationsToUpdate.push(from);
            locationsToUpdate.push(to);
            traces.push(new Trace(from, to));
            break;
          case MonsWeb.EventModelKind.MonAwake:
            if (from) {
              locationsToUpdate.push(from);
            }
            break;
          case MonsWeb.EventModelKind.BombExplosion:
            sounds.push(Sound.Bomb);
            if (from) {
              locationsToUpdate.push(from);
            }
            break;
          case MonsWeb.EventModelKind.NextTurn:
            if (puzzleMode && game.winner_color() === undefined) {
              resetToTheStartOfThePuzzle();
              Board.flashPuzzleFailure();
              return;
            }

            sounds.push(Sound.EndTurn);
            if ((!isWatchOnly && isOnlineGame) || isGameWithBot) {
              const playerTurn = isPlayerSideTurn();
              if (playerTurn) {
                popOpponentsEmoji = true;
              }
              if (isOnlineGame) {
                if (playerTurn) {
                  hideTimerButtons();
                  setUndoVisible(true);
                  setAutomoveActionVisible(true);
                } else {
                  showTimerButtonProgressing(0, 90, true);
                }
              }
            }
            hideTimerCountdownDigits();
            break;
          case MonsWeb.EventModelKind.Takeback:
            setNewBoard();
            playSounds([Sound.Undo]);
            Board.removeHighlights();
            Board.hideItemSelectionOrConfirmationOverlay();
            updateUndoButtonBasedOnGameState();
            return;
          case MonsWeb.EventModelKind.GameOver:
            const isVictory = !isOnlineGame || event.color === playerSideColor;

            if (isVictory) {
              sounds.push(Sound.Victory);
            } else {
              sounds.push(Sound.Defeat);
            }

            if (!isWatchOnly && hasBothEthOrSolAddresses()) {
              if (isVictory) {
                updateRatingsAndSuggestSavingOnchainRating();
              } else {
                updateRatingsLocally(false);
              }
            }

            isGameOver = true;
            disableAndHideUndoResignAndTimerControls();
            hideTimerCountdownDigits();
            showRematchInterface();

            if (puzzleMode) {
              Board.flashPuzzleSuccess();
              setPlaySamePuzzleAgainButtonVisible(true);
            }

            if (didStartLocalGame) {
              setAutomoveActionVisible(false);
            }

            break;
        }
      }

      Board.removeHighlights();

      const didUpdate = new Set<string>();
      for (const location of locationsToUpdate) {
        const key = location.toString();
        if (!didUpdate.has(key)) {
          didUpdate.add(key);
          updateLocation(location);
        }
      }

      if (game.winner_color() !== undefined || resignedColor !== undefined) {
        hideAllMoveStatuses();
      } else {
        updateBoardMoveStatuses();
      }

      if (isRemoteInput || isBotInput) {
        for (const trace of traces) {
          Board.drawTrace(trace);
        }
      }

      playSounds(sounds);

      if (popOpponentsEmoji) {
        Board.popOpponentsEmoji();
      }

      if (mightKeepHighlightOnLocation !== undefined && !mustReleaseHighlight) {
        processInput(AssistedInputKind.KeepSelectionAfterMove, InputModifier.None, mightKeepHighlightOnLocation);
      }

      if (((isGameWithBot && game.active_color() === botPlayerColor) || isBotsLoopMode) && !isGameOver) {
        setTimeout(() => automove(), isBotsLoopMode ? 142 : 777);
      }

      if (isGameWithBot && !isPlayerSideTurn()) {
        setAutomoveActionEnabled(false);
      }

      if (isBotsLoopMode && isGameOver) {
        setTimeout(() => rematchInLoopMode(), 1150);
      }

      updateUndoButtonBasedOnGameState();

      break;
  }
}

export function playSameCompletedPuzzleAgain() {
  if (selectedProblem) {
    didSelectPuzzle(selectedProblem, true);
  }
}

export function resetToTheStartOfThePuzzle() {
  const gameFromFen = MonsWeb.MonsGameModel.from_fen(selectedProblem!.fen);
  if (!gameFromFen) return;
  game = gameFromFen;
  setNewBoard();
  playSounds([Sound.Undo]);
  Board.removeHighlights();
  Board.hideItemSelectionOrConfirmationOverlay();
  updateUndoButtonBasedOnGameState();
}

export function didClickAutomoveButton() {
  if (isGameOver) return;
  automove();
}

function hasBothEthOrSolAddresses(): boolean {
  const playerSide = playerSideMetadata.ethAddress ?? playerSideMetadata.solAddress;
  const opponentSide = opponentSideMetadata.ethAddress ?? opponentSideMetadata.solAddress;
  return playerSide !== undefined && opponentSide !== undefined && playerSide !== opponentSide;
}

function verifyMovesIfNeeded(matchId: string, flatMovesString: string, color: string) {
  if (currentGameModelMatchId === matchId && game.is_moves_verified()) {
    return;
  }

  if (currentGameModelMatchId !== matchId) {
    currentGameModelMatchId = matchId;
    whiteFlatMovesString = null;
    blackFlatMovesString = null;
  }

  if (color === "white") {
    whiteFlatMovesString = flatMovesString;
  } else {
    blackFlatMovesString = flatMovesString;
  }

  if (whiteFlatMovesString !== null && blackFlatMovesString !== null) {
    let result = game.verify_moves(whiteFlatMovesString, blackFlatMovesString);
    if (result) {
      whiteFlatMovesString = null;
      blackFlatMovesString = null;
    }
  }
}

function updateRatingsAndSuggestSavingOnchainRating() {
  if (!isAutomatch()) {
    return;
  }

  updateRatings();
  updateRatingsLocally(true);
}

function updateRatingsLocally(isWin: boolean) {
  if (!isAutomatch()) {
    return;
  }

  const playerSide = playerSideMetadata.uid;
  const opponentSide = opponentSideMetadata.uid;

  const victoryUid = isWin ? playerSide : opponentSide;
  const defeatUid = isWin ? opponentSide : playerSide;

  if (victoryUid && defeatUid) {
    recalculateRatingsLocallyForUids(victoryUid, defeatUid);
    Board.recalculateDisplayNames();
  }
}

function processInput(assistedInputKind: AssistedInputKind, inputModifier: InputModifier, inputLocation?: Location) {
  if (isBotsLoopMode) {
    return;
  }

  if (isOnlineGame || isGameWithBot) {
    if (game.active_color() !== playerSideColor) {
      return;
    }
  }

  if (inputLocation) {
    currentInputs.push(inputLocation);
  }

  const gameInput = currentInputs.map((input) => new MonsWeb.Location(input.i, input.j));
  const fenBeforeMove = game.fen();
  let output: MonsWeb.OutputModel;
  if (inputModifier !== InputModifier.None) {
    let modifier: MonsWeb.Modifier;
    switch (inputModifier) {
      case InputModifier.Bomb:
        modifier = MonsWeb.Modifier.SelectBomb;
        break;
      case InputModifier.Potion:
        modifier = MonsWeb.Modifier.SelectPotion;
        break;
      case InputModifier.Cancel:
        currentInputs = [];
        return;
    }
    output = game.process_input(gameInput, modifier);
  } else {
    output = game.process_input(gameInput);
  }
  applyOutput(fenBeforeMove, output, false, false, assistedInputKind, inputLocation);
}

function updateLocation(location: Location) {
  Board.removeItem(location);
  const item = game.item(new MonsWeb.Location(location.i, location.j));
  if (item !== undefined) {
    Board.putItem(item, location);
  } else {
    const square = game.square(new MonsWeb.Location(location.i, location.j));
    if (square !== undefined) {
      Board.setupSquare(square, location);
    }
  }
}

function location(locationModel: MonsWeb.Location): Location {
  return new Location(locationModel.i, locationModel.j);
}

function hasItemAt(location: Location): boolean {
  const item = game.item(new MonsWeb.Location(location.i, location.j));
  if (item !== undefined) {
    return true;
  } else {
    return false;
  }
}

function didConnectTo(match: Match, matchPlayerUid: string, matchId: string) {
  Board.resetForNewGame();
  isOnlineGame = true;
  currentInputs = [];

  if (!isWatchOnly) {
    showVoiceReactionButton(true);
  }

  Board.updateEmojiIfNeeded(match.emojiId.toString(), isWatchOnly ? match.color === "black" : true);

  if (isWatchOnly) {
    playerSideColor = MonsWeb.Color.White;
    setupPlayerId(matchPlayerUid, match.color === "black");
  } else {
    playerSideColor = match.color === "white" ? MonsWeb.Color.Black : MonsWeb.Color.White;
    setupPlayerId(matchPlayerUid, true);
  }

  if (!isWatchOnly) {
    Board.setBoardFlipped(match.color === "white");
  }

  if (!isReconnect || (isReconnect && !game.is_later_than(match.fen)) || isWatchOnly) {
    const gameFromFen = MonsWeb.MonsGameModel.from_fen(match.fen);
    if (!gameFromFen) return;
    game = gameFromFen;
    if (game.winner_color() !== undefined) {
      disableAndHideUndoResignAndTimerControls();
      hideTimerCountdownDigits();
    }
  }

  verifyMovesIfNeeded(matchId, match.flatMovesString, match.color);

  if (isReconnect || isWatchOnly) {
    const movesCount = movesCountOfMatch(match);
    setProcessedMovesCountForColor(match.color, movesCount);
  }

  if (match.reaction && match.reaction.uuid) {
    processedVoiceReactions.add(match.reaction.uuid);
  }

  setNewBoard();
  updateUndoButtonBasedOnGameState();
  const thereIsWinner = game.winner_color() !== undefined;

  if (match.status === "surrendered") {
    handleResignStatus(true, match.color);
  } else if (!isWatchOnly && !isGameOver && !thereIsWinner) {
    showResignButton();
    if (isPlayerSideTurn()) {
      hideTimerButtons();
      setUndoVisible(true);
      setAutomoveActionVisible(true);
    } else {
      showTimerButtonProgressing(0, 90, true);
    }
  }

  updateDisplayedTimerIfNeeded(true, match);
}

function updateDisplayedTimerIfNeeded(onConnect: boolean, match: Match) {
  if (match.color === "white") {
    whiteTimerStash = match.timer;
  } else {
    blackTimerStash = match.timer;
  }

  if (isReconnect || isWatchOnly) {
    if (blackTimerStash === null || whiteTimerStash === null) {
      return;
    }
  }

  let timer: string | null = "";
  let timerColor = "";
  const activeColor = game.active_color();
  if (activeColor === MonsWeb.Color.Black) {
    timer = whiteTimerStash;
    timerColor = "white";
  } else if (activeColor === MonsWeb.Color.White) {
    timer = blackTimerStash;
    timerColor = "black";
  } else {
    return;
  }

  showTimerCountdown(onConnect, timer, timerColor);
}

function showTimerCountdown(onConnect: boolean, timer: any, timerColor: string, duration?: number) {
  if (timer === "gg") {
    handleVictoryByTimer(onConnect, timerColor, false);
  } else if (timer && typeof timer === "string" && !isGameOver) {
    const [turnNumber, targetTimestamp] = timer.split(";").map(Number);
    if (!isNaN(turnNumber) && !isNaN(targetTimestamp)) {
      if (game.turn_number() === turnNumber) {
        let delta = Math.max(0, Math.floor((targetTimestamp - Date.now()) / 1000));
        if (duration !== undefined && duration !== null) {
          delta = Math.min(Math.floor(duration / 1000), delta);
        }
        showTimer(timerColor, delta);
        if (!isWatchOnly && !isPlayerSideTurn()) {
          const target = 90;
          showTimerButtonProgressing(target - delta, target, false);
          setTimeout(() => {
            if (game.turn_number() === turnNumber) {
              enableTimerVictoryClaim();
            }
          }, delta * 1000);
        }
      }
    }
  }
}

function updateUndoButtonBasedOnGameState() {
  setUndoEnabled(canHandleUndo());
}

function updateBoardMoveStatuses() {
  Board.updateMoveStatuses(game.active_color(), game.available_move_kinds(), game.inactive_player_items_counters());
}

function setNewBoard() {
  Board.updateScore(game.white_score(), game.black_score(), game.winner_color(), resignedColor, winnerByTimerColor);
  if (game.winner_color() !== undefined || resignedColor !== undefined) {
    hideAllMoveStatuses();
    disableAndHideUndoResignAndTimerControls();
    showRematchInterface();
  } else {
    updateBoardMoveStatuses();
  }
  const locationsWithContent = game.locations_with_content().map((loc) => new Location(loc.i, loc.j));
  Board.removeItemsNotPresentIn(locationsWithContent);
  locationsWithContent.forEach((loc) => {
    const location = new Location(loc.i, loc.j);
    updateLocation(location);
  });
}

function getProcessedMovesCount(color: string): number {
  return color === "white" ? whiteProcessedMovesCount : blackProcessedMovesCount;
}

function setProcessedMovesCountForColor(color: string, count: number) {
  if (color === "white") {
    whiteProcessedMovesCount = count;
    didSetWhiteProcessedMovesCount = true;
  } else {
    blackProcessedMovesCount = count;
    didSetBlackProcessedMovesCount = true;
  }
}

function handleVictoryByTimer(onConnect: boolean, winnerColor: string, justClaimedByYourself: boolean) {
  if (isGameOver) {
    return;
  }

  isGameOver = true;

  hideTimerCountdownDigits();
  disableAndHideUndoResignAndTimerControls();
  hideAllMoveStatuses();

  Board.removeHighlights();
  Board.hideItemSelectionOrConfirmationOverlay();

  winnerByTimerColor = winnerColor === "white" ? MonsWeb.Color.White : MonsWeb.Color.Black;
  Board.updateScore(game.white_score(), game.black_score(), game.winner_color(), resignedColor, winnerByTimerColor);
  showRematchInterface();

  if (justClaimedByYourself) {
    playSounds([Sound.Victory]);
    if (hasBothEthOrSolAddresses()) {
      updateRatingsAndSuggestSavingOnchainRating();
    }
  } else if (!onConnect) {
    if (!isWatchOnly) {
      playSounds([Sound.Defeat]);
      updateRatingsLocally(false);
    }
  }
}

function handleResignStatus(onConnect: boolean, resignSenderColor: string) {
  if (isGameOver) {
    return;
  }

  const justConfirmedResignYourself = resignSenderColor === "";
  isGameOver = true;

  if (justConfirmedResignYourself) {
    resignedColor = playerSideColor;
    playSounds([Sound.Defeat]);
    updateRatingsLocally(false);
  } else {
    resignedColor = resignSenderColor === "white" ? MonsWeb.Color.White : MonsWeb.Color.Black;
  }

  if (!onConnect && !justConfirmedResignYourself) {
    playSounds([Sound.Victory]);
    if (!isWatchOnly && hasBothEthOrSolAddresses()) {
      updateRatingsAndSuggestSavingOnchainRating();
    }
  }

  hideTimerCountdownDigits();
  disableAndHideUndoResignAndTimerControls();
  hideAllMoveStatuses();

  Board.removeHighlights();
  Board.hideItemSelectionOrConfirmationOverlay();

  if (!onConnect || (didSetWhiteProcessedMovesCount && didSetBlackProcessedMovesCount)) {
    Board.updateScore(game.white_score(), game.black_score(), game.winner_color(), resignedColor, winnerByTimerColor);
  }
  showRematchInterface();
}

export function didClickInviteActionButtonBeforeThereIsInviteReady() {
  if (!isCreateNewInviteFlow) return;
  setHomeVisible(true);
  setBrushAndNavigationButtonDimmed(true);
  setAutomatchVisible(false);
  setBotGameOptionVisible(false);
  setNavigationListButtonVisible(false);
  setAutomoveActionVisible(false);
  Board.hideBoardPlayersInfo();
  Board.removeHighlights();
  hideAllMoveStatuses();
  isWaitingForInviteToGetAccepted = true;
  Board.runMonsBoardAsDisplayWaitingAnimation();
}

export function showPuzzleInstructions() {
  const text = selectedProblem!.description;
  setTimeout(() => {
    showFullScreenAlert(text, "");
  }, 1);
}

export function cleanupCurrentInputs() {
  currentInputs = [];
}

export function didSelectPuzzle(problem: Problem, skipInstructions: boolean = false) {
  setInstructionsToggleButtonVisible(true);
  showPrimaryAction(PrimaryActionType.None);
  setPlaySamePuzzleAgainButtonVisible(false);
  isGameOver = false;
  currentInputs = [];
  Board.showOpponentAsTutorialPlayer();
  showPuzzleTitle(problem.label);

  const gameFromFen = MonsWeb.MonsGameModel.from_fen(problem.fen);
  if (!gameFromFen) return;
  game = gameFromFen;
  didStartLocalGame = true;
  setHomeVisible(true);
  setBrushAndNavigationButtonDimmed(true);
  setUndoVisible(true);
  setInviteLinkActionVisible(false);
  setAutomatchVisible(false);
  setBotGameOptionVisible(false);
  closeNavigationAndAppearancePopupIfAny();
  setAutomoveActionVisible(true);

  setNewBoard();

  puzzleMode = true;
  selectedProblem = problem;

  if (!skipInstructions) {
    showPuzzleInstructions();
  }
  Board.removeHighlights();
  Board.hideItemSelectionOrConfirmationOverlay();
  updateUndoButtonBasedOnGameState();
}

export function showNextProblem(problem: Problem) {
  didSelectPuzzle(problem);
}

export function didReceiveMatchUpdate(match: Match, matchPlayerUid: string, matchId: string) {
  if (!didConnect) {
    Board.stopMonsBoardAsDisplayAnimations();
    showWaitingStateText("");
    setEndMatchVisible(false);
    isWaitingForInviteToGetAccepted = false;
    setAutomoveActionVisible(false);
    setInviteLinkActionVisible(false);
    setAutomatchVisible(false);
    setBotGameOptionVisible(false);
    setNavigationListButtonVisible(false);
    setEndMatchVisible(false);
    showPrimaryAction(PrimaryActionType.None);
    const wasWaitingForRematchResponse = isWaitingForRematchResponse;
    isWaitingForRematchResponse = false;
    didConnectTo(match, matchPlayerUid, matchId);
    didConnect = true;
    if ((!isReconnect || wasWaitingForRematchResponse) && !isGameOver && !isWatchOnly) {
      playSounds([Sound.DidConnect]);
    }
    return;
  }

  const isOpponentSide = !isWatchOnly || match.color === "black";
  Board.updateEmojiIfNeeded(match.emojiId.toString(), isOpponentSide);
  setupPlayerId(matchPlayerUid, isOpponentSide);

  if (!isWatchOnly && match.reaction && match.reaction.uuid && !processedVoiceReactions.has(match.reaction.uuid)) {
    processedVoiceReactions.add(match.reaction.uuid);
    const currentTime = Date.now();
    if (currentTime - lastReactionTime > 5000) {
      showVoiceReactionText(match.reaction.kind, true);
      playReaction(match.reaction);
      lastReactionTime = currentTime;
    }
  }

  if (isGameOver && !(isWatchOnly && (!didSetWhiteProcessedMovesCount || !didSetBlackProcessedMovesCount))) {
    return;
  }

  let didNotHaveBothMatchesSetupBeforeThisUpdate = false;
  const movesCount = movesCountOfMatch(match);
  if (isWatchOnly && (!didSetWhiteProcessedMovesCount || !didSetBlackProcessedMovesCount)) {
    didNotHaveBothMatchesSetupBeforeThisUpdate = true;
    if (!game.is_later_than(match.fen)) {
      const gameFromFen = MonsWeb.MonsGameModel.from_fen(match.fen);
      if (!gameFromFen) return;
      game = gameFromFen;
      if (game.winner_color() !== undefined) {
        disableAndHideUndoResignAndTimerControls();
        hideTimerCountdownDigits();
      }
      setNewBoard();
    }

    verifyMovesIfNeeded(matchId, match.flatMovesString, match.color);
    setProcessedMovesCountForColor(match.color, movesCount);
  }

  const processedMovesCount = getProcessedMovesCount(match.color);
  if (movesCount > processedMovesCount) {
    const movesFens = movesFensArray(match);
    for (let i = processedMovesCount; i < movesCount; i++) {
      const moveFen = movesFens[i];
      const output = game.process_input_fen(moveFen);
      applyOutput("", output, true, false, AssistedInputKind.None);
    }

    setProcessedMovesCountForColor(match.color, movesCount);

    if (match.fen !== game.fen()) {
      // TODO: handle corrupted game data event
      console.log("fens do not match");
    }
  }

  if (match.status === "surrendered") {
    handleResignStatus(didNotHaveBothMatchesSetupBeforeThisUpdate, match.color);
  }

  updateDisplayedTimerIfNeeded(didNotHaveBothMatchesSetupBeforeThisUpdate, match);
}

export function didRecoverMyMatch(match: Match, matchId: string) {
  isReconnect = true;

  playerSideColor = match.color === "white" ? MonsWeb.Color.White : MonsWeb.Color.Black;
  const gameFromFen = MonsWeb.MonsGameModel.from_fen(match.fen);
  if (!gameFromFen) return;
  game = gameFromFen;
  if (game.winner_color() !== undefined) {
    disableAndHideUndoResignAndTimerControls();
    hideTimerCountdownDigits();
  }
  verifyMovesIfNeeded(matchId, match.flatMovesString, match.color);
  const movesCount = movesCountOfMatch(match);
  setProcessedMovesCountForColor(match.color, movesCount);
  Board.updateEmojiIfNeeded(match.emojiId.toString(), false);

  if (match.status === "surrendered") {
    handleResignStatus(true, match.color);
  }

  updateDisplayedTimerIfNeeded(true, match);
}

export function enterWatchOnlyMode() {
  isWatchOnly = true;
  setWatchOnlyVisible(true);
}

function movesFensArray(match: Match): string[] {
  const flatMovesString = match.flatMovesString;
  if (!flatMovesString || flatMovesString === "") {
    return [];
  }
  return flatMovesString.split("-");
}

function movesCountOfMatch(match: Match): number {
  const flatMovesString = match.flatMovesString;
  if (!flatMovesString || flatMovesString === "") {
    return 0;
  }
  let count = 1;
  for (let i = 0; i < flatMovesString.length; i++) {
    if (flatMovesString[i] === "-") {
      count++;
    }
  }
  return count;
}
