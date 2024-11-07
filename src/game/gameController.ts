import initMonsWeb, * as MonsWeb from "mons-web";
import { playerSideMetadata, opponentSideMetadata, showVoiceReactionText, setupPlayerId, hideAllMoveStatuses, hideTimerCountdownDigits, showTimer } from "./board";
import * as Board from "./board";
import { Location, Highlight, HighlightKind, AssistedInputKind, Sound, InputModifier, Trace } from "../utils/gameModels";
import { colors } from "../content/colors";
import { playSounds, playReaction } from "../content/sounds";
import { sendResignStatus, prepareOnchainVictoryTx, sendMove, isCreateNewInviteFlow, sendEmojiUpdate, setupConnection, startTimer, claimVictoryByTimer, sendRematchProposal, sendAutomatchRequest } from "../connection/connection";
import { setAttestVictoryVisible, setWatchOnlyVisible, showResignButton, showVoiceReactionButton, setUndoEnabled, setUndoVisible, disableAndHideUndoResignAndTimerControls, hideTimerButtons, showTimerButtonProgressing, enableTimerVictoryClaim, showPrimaryAction, PrimaryActionType, setInviteLinkActionVisible, setAutomatchVisible, setHomeVisible, setIsReadyToCopyExistingInviteLink, setAutomoveActionVisible, setAutomoveActionEnabled, setAttestVictoryEnabled } from "../ui/BottomControls";
import { Match } from "../connection/connectionModels";

const experimentalDrawingDevMode = false;

export let initialFen = "";
export let isWatchOnly = false;
export let isOnlineGame = false;

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
let victoryTx: any;

let game: MonsWeb.MonsGameModel;
let playerSideColor: MonsWeb.Color;
let resignedColor: MonsWeb.Color;
let winnerByTimerColor: MonsWeb.Color;

let lastReactionTime = 0;

const processedVoiceReactions = new Set<string>();

var currentInputs: Location[] = [];

let blackTimerStash: string | null = null;
let whiteTimerStash: string | null = null;

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

  if (isCreateNewInviteFlow) {
    game.locations_with_content().forEach((loc) => {
      const location = new Location(loc.i, loc.j);
      updateLocation(location);
    });
    setInviteLinkActionVisible(true);
    setAutomatchVisible(true);
  } else {
    isOnlineGame = true;
    setHomeVisible(true);
  }

  Board.setupGameInfoElements(!isCreateNewInviteFlow);
}

export function didFindYourOwnInviteThatNobodyJoined() {
  setInviteLinkActionVisible(true);
  setIsReadyToCopyExistingInviteLink();
  Board.runMonsBoardAsDisplayWaitingAnimation();
}

export function didFindInviteThatCanBeJoined() {
  showPrimaryAction(PrimaryActionType.JoinGame);
  Board.runMonsBoardAsDisplayWaitingAnimation();
}

let didSendTmpDevAutomatchRequest = false; // TODO: remove dev tmp

export function didClickAutomatchButton() {
  if (!didSendTmpDevAutomatchRequest) {
    didSendTmpDevAutomatchRequest = true;
    sendAutomatchRequest();
  }
}

function showRematchInterface() {
  if (isWatchOnly) {
    return;
  }
  showPrimaryAction(PrimaryActionType.Rematch);
}

function automove() {
  let output = game.smart_automove();
  applyOutput(output, true, AssistedInputKind.None);
  setAutomoveActionEnabled(true);
}

function didConfirmRematchProposal() {
  Board.runMonsBoardAsDisplayWaitingAnimation();
  sendRematchProposal();
  // TODO: implement
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
  // TODO: might need different navigation depending on the current game state
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
  } else if (isOnlineGame) {
    return game.can_takeback(playerSideColor);
  } else {
    return game.can_takeback(game.active_color());
  }
}

export function didClickUndoButton() {
  if (canHandleUndo()) {
    const output = game.takeback();
    applyOutput(output, false, AssistedInputKind.None);
  }
}

export function canChangeEmoji(opponents: boolean): boolean {
  if (isOnlineGame) {
    return opponents ? false : !isWatchOnly;
  } else {
    return isPlayerSideTurn() ? !opponents : opponents;
  }
}

export function updateEmoji(newId: number) {
  if (isOnlineGame && !isWatchOnly) {
    sendEmojiUpdate(newId);
  }
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
  if ((isOnlineGame && !didConnect) || isWatchOnly || isGameOver || isWaitingForInviteToGetAccepted) {
    return;
  }
  processInput(AssistedInputKind.None, InputModifier.None, location);
}

function applyOutput(output: MonsWeb.OutputModel, isRemoteInput: boolean, assistedInputKind: AssistedInputKind, inputLocation?: Location) {
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

      if (isOnlineGame && !isRemoteInput) {
        sendMove(moveFen, gameFen);
      }

      if (!isOnlineGame && !didStartLocalGame) {
        didStartLocalGame = true;
        setHomeVisible(true);
        setUndoVisible(true);
        setInviteLinkActionVisible(false);
        setAutomatchVisible(false);
        setAutomoveActionVisible(true);
      }

      currentInputs = [];
      const events = output.events();
      let locationsToUpdate: Location[] = [];
      let mightKeepHighlightOnLocation: Location | undefined;
      let mustReleaseHighlight = isRemoteInput;
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
            sounds.push(Sound.EndTurn);
            if (!isWatchOnly && isOnlineGame) {
              const playerTurn = isPlayerSideTurn();
              if (playerTurn) {
                popOpponentsEmoji = true;
              }
              if (playerTurn) {
                hideTimerButtons();
                setUndoVisible(true);
              } else {
                showTimerButtonProgressing(0, 90, true);
              }
            }
            hideTimerCountdownDigits();
            break;
          case MonsWeb.EventModelKind.Takeback:
            setNewBoard();
            playSounds([Sound.Undo]);
            Board.removeHighlights();
            Board.hideItemSelection();
            updateUndoButtonBasedOnGameState();
            return;
          case MonsWeb.EventModelKind.GameOver:
            const isVictory = !isOnlineGame || event.color === playerSideColor;

            if (isVictory) {
              sounds.push(Sound.Victory);
            } else {
              sounds.push(Sound.Defeat);
            }

            if (isVictory && !isWatchOnly && hasBothEthAddresses()) {
              setTimeout(() => {
                suggestSavingOnchainRating();
              }, 420);
            }

            isGameOver = true;
            disableAndHideUndoResignAndTimerControls();
            hideTimerCountdownDigits();
            showRematchInterface();

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

      if (isRemoteInput) {
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

      updateUndoButtonBasedOnGameState();

      break;
  }
}

export function didClickAutomoveButton() {
  if (isOnlineGame || isGameOver) return;
  automove();
}

function hasBothEthAddresses(): boolean {
  const playerSide = playerSideMetadata.ethAddress;
  const opponentSide = opponentSideMetadata.ethAddress;
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

export function didClickAttestVictoryButton() {
  if (victoryTx) {
    saveOnchainRating(victoryTx);
    return;
  }

  prepareOnchainVictoryTx()
    .then((res) => {
      if (res && res.schema) {
        victoryTx = res;
      }
      saveOnchainRating(res);
    })
    .catch(() => {
      setAttestVictoryEnabled(true);
    });
}

function suggestSavingOnchainRating() {
  setAttestVictoryVisible(true);
}

async function saveOnchainRating(txData: any) {
  const { sendEasTx } = await import("../connection/eas");
  try {
    const txHash = await sendEasTx(txData);
    console.log(txHash);
    // TODO: view tx button
  } catch {
    setAttestVictoryEnabled(true);
  }
}

function processInput(assistedInputKind: AssistedInputKind, inputModifier: InputModifier, inputLocation?: Location) {
  if (isOnlineGame) {
    if (game.active_color() !== playerSideColor) {
      return;
    }
  }

  if (inputLocation) {
    currentInputs.push(inputLocation);
  }

  const gameInput = currentInputs.map((input) => new MonsWeb.Location(input.i, input.j));
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
  applyOutput(output, false, assistedInputKind, inputLocation);
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
    showVoiceReactionButton();
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
  Board.hideItemSelection();

  winnerByTimerColor = winnerColor === "white" ? MonsWeb.Color.White : MonsWeb.Color.Black;
  Board.updateScore(game.white_score(), game.black_score(), game.winner_color(), resignedColor, winnerByTimerColor);
  showRematchInterface();

  if (justClaimedByYourself) {
    playSounds([Sound.Victory]);
    if (hasBothEthAddresses()) {
      setTimeout(() => {
        suggestSavingOnchainRating();
      }, 420);
    }
  } else if (!onConnect) {
    if (!isWatchOnly) {
      playSounds([Sound.Defeat]);
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
  } else {
    resignedColor = resignSenderColor === "white" ? MonsWeb.Color.White : MonsWeb.Color.Black;
  }

  if (!onConnect && !justConfirmedResignYourself) {
    playSounds([Sound.Victory]);
    if (!isWatchOnly && hasBothEthAddresses()) {
      suggestSavingOnchainRating();
    }
  }

  hideTimerCountdownDigits();
  disableAndHideUndoResignAndTimerControls();
  hideAllMoveStatuses();

  Board.removeHighlights();
  Board.hideItemSelection();
  Board.updateScore(game.white_score(), game.black_score(), game.winner_color(), resignedColor, winnerByTimerColor);
  showRematchInterface();
}

export function didClickInviteActionButtonBeforeThereIsInviteReady() {
  if (!isCreateNewInviteFlow) return;
  setHomeVisible(true);
  setAutomatchVisible(false);
  Board.hideBoardPlayersInfo();
  Board.removeHighlights();
  hideAllMoveStatuses();
  isWaitingForInviteToGetAccepted = true;
  Board.runMonsBoardAsDisplayWaitingAnimation();
}

export function didReceiveMatchUpdate(match: Match, matchPlayerUid: string, matchId: string) {
  if (!didConnect) {
    Board.stopMonsBoardAsDisplayAnimations();
    isWaitingForInviteToGetAccepted = false;
    setInviteLinkActionVisible(false);
    didConnectTo(match, matchPlayerUid, matchId);
    didConnect = true;
    if (!isReconnect && !isGameOver && !isWatchOnly) {
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

  if (isGameOver) {
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
      applyOutput(output, true, AssistedInputKind.None);
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
