import initMonsWeb, * as MonsWeb from "mons-web";
import * as Board from "./board";
import { tokensForSingleMoveEvents, MoveHistoryEntry } from "./moveEventStrings";
import { Location, Highlight, HighlightKind, AssistedInputKind, Sound, InputModifier, Trace } from "../utils/gameModels";
import { colors } from "../content/boardStyles";
import { playSounds, playReaction, newReactionOfKind } from "../content/sounds";
import { connection } from "../connection/connection";
import { showMoveHistoryButton, setWatchOnlyVisible, showResignButton, showVoiceReactionButton, setUndoEnabled, setUndoVisible, disableAndHideUndoResignAndTimerControls, hideTimerButtons, showTimerButtonProgressing, enableTimerVictoryClaim, showPrimaryAction, PrimaryActionType, setInviteLinkActionVisible, setAutomatchVisible, setHomeVisible, setBadgeVisible, setIsReadyToCopyExistingInviteLink, setAutomoveActionVisible, setAutomoveActionEnabled, setAutomatchEnabled, setAutomatchWaitingState, setBotGameOptionVisible, setEndMatchVisible, setEndMatchConfirmed, showWaitingStateText, setBrushAndNavigationButtonDimmed, setNavigationListButtonVisible, setPlaySamePuzzleAgainButtonVisible, closeNavigationAndAppearancePopupIfAny } from "../ui/BottomControls";
import { triggerMoveHistoryPopupReload } from "../ui/MoveHistoryPopup";
import { Match, MatchWagerState, HistoricalMatchPair, RematchSeriesDescriptor, RematchSeriesMatchDescriptor } from "../connection/connectionModels";
import { recalculateRatingsLocallyForUids } from "../utils/playerMetadata";
import { getNextProblem, Problem, markProblemCompleted, getTutorialCompleted, getTutorialProgress, getInitialProblem } from "../content/problems";
import { storage } from "../utils/storage";
import { showNotificationBanner, hideNotificationBanner } from "../ui/ProfileSignIn";
import { showVideoReaction } from "../ui/BoardComponent";
import { setIslandButtonDimmed } from "../index";
import { getWagerState, setCurrentWagerMatch, subscribeToWagerState } from "./wagerState";
import { transitionToHome } from "../session/AppSessionManager";
import { decrementLifecycleCounter, incrementLifecycleCounter } from "../lifecycle/lifecycleDiagnostics";
import { getSessionGuard } from "./matchSession";
import { RouteState, getCurrentRouteState } from "../navigation/routeState";
import { INVALID_SNAPSHOT_ROUTE_ERROR } from "../session/sessionErrors";

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

const watchOnlyListeners = new Set<(value: boolean) => void>();
let activeRouteState: RouteState = getCurrentRouteState();
const isCreateInviteRoute = () => activeRouteState.mode === "home";
const isSnapshotRoute = () => activeRouteState.mode === "snapshot";
const isBotsRoute = () => activeRouteState.mode === "watch";

let currentWagerState: MatchWagerState | null = null;
let wagerOutcomeShown = false;
let wagerOutcomeAnimating = false;
let wagerOutcomeAnimTimer: number | null = null;
let wagerOutcomeAnimationAllowed = false;
let didSetupWagerSubscription = false;
let unsubscribeFromWagerState: (() => void) | null = null;

let whiteProcessedMovesCount = 0;
let blackProcessedMovesCount = 0;
let didSetWhiteProcessedMovesCount = false;
let didSetBlackProcessedMovesCount = false;

let currentGameModelMatchId: string | null = null;
let whiteFlatMovesString: string | null = null;
let blackFlatMovesString: string | null = null;

let wagerMatchId: string | null = null;

let game: MonsWeb.MonsGameModel;
let flashbackMode = false;
let flashbackStateGame: MonsWeb.MonsGameModel;
let botPlayerColor: MonsWeb.Color;
let playerSideColor: MonsWeb.Color;
let resignedColor: MonsWeb.Color | undefined;
let winnerByTimerColor: MonsWeb.Color | undefined;

let lastReactionTime = 0;
const botReactionVariationsWhenPlayerScores = [17, 20, 374, 429, 465, 900999];
const botReactionVariationsWhenBotScores = [40, 63, 210, 900225];
const botScoreReactionChance = 0.2;
const botScoreReactionPlayedTurns = new Set<number>();
const minimumIntervalBetweenBotMovesMs = 777;
const botTurnComputationDelayMs = 420;
let lastBotMoveTimestamp = 0;

const processedVoiceReactions = new Set<string>();

const resetBotScoreReactionState = () => {
  botScoreReactionPlayedTurns.clear();
};

const getRandomReactionVariation = (variations: number[]): number => {
  const variationIndex = Math.floor(Math.random() * variations.length);
  return variations[variationIndex];
};

var currentInputs: Location[] = [];

let blackTimerStash: string | null = null;
let whiteTimerStash: string | null = null;
let timerStashMatchId: string | null = null;
let pendingTimerResolutionOnRestore: boolean | null = null;
const activeGameTimeoutIds = new Set<number>();
let isInviteBotIntoLocalGameUnavailable = false;
let didMakeFirstLocalPlayerMoveOnLocalBoard = false;
let viewedRematchMatchId: string | null = null;
let viewedRematchGame: MonsWeb.MonsGameModel | null = null;
let viewedRematchPair: HistoricalMatchPair | null = null;
let viewedRematchRequestToken = 0;
type BoardViewMode = "activeLive" | "waitingLive" | "historicalView";
let boardViewMode: BoardViewMode = "activeLive";
let boardRenderSessionId = 0;
const historicalMatchPairCache = new Map<string, HistoricalMatchPair | null>();
const historicalScoreCache = new Map<string, { white: number; black: number }>();
const historicalMatchPairMissUntilByMatchId = new Map<string, number>();
const historicalMatchPairMissCooldownMs = 3000;
let rematchScorePrefetchPromise: Promise<boolean> | null = null;
let rematchScorePrefetchSignature = "";
let localRematchSeriesIdSeed = 1;
let localRematchSeriesInviteId: string | null = null;
let localActiveRematchMatchId: string | null = null;
const localRematchMatchIds: string[] = [];
const localRematchSnapshotsByMatchId = new Map<string, LocalRematchSnapshot>();
const boardViewDebugLogsEnabled = process.env.NODE_ENV !== "production";
const summarizeWagerState = (state: MatchWagerState | null) => {
  const proposalKeys = Object.keys(state?.proposals || {});
  const agreed = state?.agreed
    ? {
        material: state.agreed.material,
        count: state.agreed.count,
        total: state.agreed.total,
        proposerId: state.agreed.proposerId,
        accepterId: state.agreed.accepterId,
      }
    : null;
  const resolved = state?.resolved
    ? {
        material: state.resolved.material,
        count: state.resolved.count,
        total: state.resolved.total,
        winnerId: state.resolved.winnerId,
        loserId: state.resolved.loserId,
      }
    : null;
  return {
    hasState: !!state,
    proposalKeys,
    agreed,
    resolved,
  };
};
const logWagerDebug = (event: string, payload: Record<string, unknown> = {}) => {
  if (!boardViewDebugLogsEnabled) {
    return;
  }
  console.log("wager-debug", {
    event,
    boardViewMode,
    activeMatchId: connection.getActiveMatchId(),
    viewedRematchMatchId,
    wagerMatchId,
    isWatchOnly,
    isGameOver,
    isReconnect,
    ...payload,
  });
};

export type RematchSeriesNavigatorItem = {
  matchId: string;
  index: number;
  whiteScore: number | null;
  blackScore: number | null;
  isPendingResponse: boolean;
  isActiveMatch: boolean;
  isSelected: boolean;
  playerIsWhite: boolean;
};

type LocalRematchSnapshot = {
  matchId: string;
  index: number;
  gameModel: MonsWeb.MonsGameModel;
  fen: string;
  whiteScore: number;
  blackScore: number;
  boardFlipped: boolean;
  resignedColor: "white" | "black" | null;
};

const setManagedGameTimeout = (callback: () => void, delay: number, guard?: () => boolean): number => {
  incrementLifecycleCounter("gameTimeouts");
  const timeoutId = window.setTimeout(() => {
    if (activeGameTimeoutIds.has(timeoutId)) {
      activeGameTimeoutIds.delete(timeoutId);
      decrementLifecycleCounter("gameTimeouts");
    }
    if (guard && !guard()) {
      return;
    }
    callback();
  }, delay);
  activeGameTimeoutIds.add(timeoutId);
  return timeoutId;
};

const clearManagedGameTimeout = (timeoutId: number | null) => {
  if (timeoutId === null) {
    return;
  }
  if (activeGameTimeoutIds.has(timeoutId)) {
    activeGameTimeoutIds.delete(timeoutId);
    decrementLifecycleCounter("gameTimeouts");
  }
  clearTimeout(timeoutId);
};

const clearAllManagedGameTimeouts = () => {
  activeGameTimeoutIds.forEach((timeoutId) => {
    clearTimeout(timeoutId);
    decrementLifecycleCounter("gameTimeouts");
  });
  activeGameTimeoutIds.clear();
};

const resetTimerStateForMatch = (matchId: string | null) => {
  timerStashMatchId = matchId;
  blackTimerStash = null;
  whiteTimerStash = null;
  pendingTimerResolutionOnRestore = null;
};

const isFirstLocalRematchSeriesMatchActive = () => {
  if (!canTrackLocalRematchSeries()) {
    return true;
  }
  ensureLocalRematchSeriesInitialized();
  if (!localRematchSeriesInviteId || !localActiveRematchMatchId) {
    return true;
  }
  return localActiveRematchMatchId === localRematchMatchIdForIndex(localRematchSeriesInviteId, 0);
};

const shouldShowInviteBotIntoLocalGameButton = () => {
  if (
    isInviteBotIntoLocalGameUnavailable ||
    isOnlineGame ||
    isGameWithBot ||
    isWatchOnly ||
    puzzleMode ||
    isGameOver ||
    !didStartLocalGame ||
    !isCreateInviteRoute()
  ) {
    return false;
  }
  if (!didMakeFirstLocalPlayerMoveOnLocalBoard) {
    return false;
  }
  if (!isFirstLocalRematchSeriesMatchActive()) {
    return false;
  }
  return game.turn_number() <= 2;
};

const syncInviteBotIntoLocalGameButton = () => {
  Board.setInviteBotButtonVisible(shouldShowInviteBotIntoLocalGameButton());
};

export function getCurrentGameFen(): string {
  return game.fen();
}

export const isMatchOver = () => {
  return isGameOver;
};

const setWatchOnlyState = (value: boolean) => {
  if (isWatchOnly === value) {
    return;
  }
  isWatchOnly = value;
  watchOnlyListeners.forEach((listener) => listener(value));
};

export const subscribeToWatchOnly = (listener: (value: boolean) => void) => {
  watchOnlyListeners.add(listener);
  listener(isWatchOnly);
  return () => {
    watchOnlyListeners.delete(listener);
  };
};

export function didSyncTutorialProgress() {
  if (getTutorialCompleted()) {
    dismissBadgeAndNotificationBannerIfNeeded();
  }
  // TODO: update banner numbers if needed
}

function clearViewedRematchState() {
  viewedRematchRequestToken += 1;
  viewedRematchMatchId = null;
  viewedRematchGame = null;
  viewedRematchPair = null;
}

function nextBoardRenderSession(): number {
  boardRenderSessionId += 1;
  return boardRenderSessionId;
}

function isBoardRenderSessionActive(sessionId: number): boolean {
  return sessionId === boardRenderSessionId;
}

function applyBoardUiForCurrentView() {
  if (boardViewMode === "historicalView") {
    Board.stopMonsBoardAsDisplayAnimations();
    Board.showBoardPlayersInfo();
    showWaitingStateText("");
    if (!isWatchOnly && isOnlineGame && connection.rematchSeriesEndIsIndicated()) {
      setEndMatchVisible(true);
      setEndMatchConfirmed(true);
    } else if (!isWatchOnly && isOnlineGame && (isGameOver || isWaitingForRematchResponse)) {
      setEndMatchVisible(true);
    } else {
      setEndMatchVisible(false);
    }
    showVoiceReactionButton(false);
    disableAndHideUndoResignAndTimerControls();
    hideTimerButtons();
    Board.hideTimerCountdownDigits();
    Board.hideAllMoveStatuses();
    return;
  }
  if (boardViewMode === "waitingLive") {
    Board.stopMonsBoardAsDisplayAnimations();
    Board.runMonsBoardAsDisplayWaitingAnimation();
    Board.hideBoardPlayersInfo();
    setEndMatchVisible(true);
    showWaitingStateText("");
    showVoiceReactionButton(false);
    setAutomoveActionVisible(false);
    setUndoVisible(false);
    setUndoEnabled(false);
    hideTimerButtons();
    Board.hideTimerCountdownDigits();
    Board.hideAllMoveStatuses();
    return;
  }
  Board.stopMonsBoardAsDisplayAnimations();
  Board.showBoardPlayersInfo();
  showWaitingStateText("");
  if (!isWatchOnly && isOnlineGame && !isGameOver && !connection.rematchSeriesEndIsIndicated()) {
    showVoiceReactionButton(true);
  } else if (isOnlineGame) {
    showVoiceReactionButton(false);
  }
  ensureBoardViewInvariants("applyBoardUiForCurrentView");
}

function enterWaitingLiveView() {
  nextBoardRenderSession();
  boardViewMode = "waitingLive";
  clearViewedRematchState();
  connection.setWagerViewMatchId(null);
  flashbackMode = false;
  currentInputs = [];
  Board.removeHighlights();
  Board.hideItemSelectionOrConfirmationOverlay();
  Board.setBoardFlipped(activeBoardShouldBeFlipped());
  applyBoardUiForCurrentView();
  if (boardViewDebugLogsEnabled) {
    console.log("[board-view] entered waitingLive");
  }
  triggerMoveHistoryPopupReload();
}

function restoreLiveBoardView() {
  nextBoardRenderSession();
  boardViewMode = isWaitingForRematchResponse ? "waitingLive" : "activeLive";
  clearViewedRematchState();
  connection.setWagerViewMatchId(null);
  flashbackMode = false;
  currentInputs = [];
  Board.removeHighlights();
  Board.hideItemSelectionOrConfirmationOverlay();
  Board.setBoardFlipped(activeBoardShouldBeFlipped());
  applyBoardUiForCurrentView();
  if (boardViewMode === "activeLive") {
    setNewBoard(false);
    applyTimerStateFromStashes(pendingTimerResolutionOnRestore ?? isReconnect);
    pendingTimerResolutionOnRestore = null;
    applyWagerState();
    Board.markWagerInitialStateReceived();
    updateUndoButtonBasedOnGameState();
    if (!isWatchOnly && !isGameOver && game.winner_color() === undefined) {
      if (isOnlineGame) {
        showResignButton();
        showMoveHistoryButton(true);
        if (isPlayerSideTurn()) {
          hideTimerButtons();
          setUndoVisible(true);
          setAutomoveActionVisible(true);
        } else {
          showTimerButtonProgressing(0, 90, true);
        }
      } else if (didStartLocalGame) {
        if (!puzzleMode) {
          showResignButton();
        }
        showMoveHistoryButton(true);
        setUndoVisible(true);
        setAutomoveActionVisible(true);
        if (isGameWithBot) {
          showVoiceReactionButton(true);
          setAutomoveActionEnabled(isPlayerSideTurn());
        } else {
          showVoiceReactionButton(false);
          setAutomoveActionEnabled(true);
        }
      }
    }
  }
  if (boardViewDebugLogsEnabled) {
    console.log(`[board-view] restored ${boardViewMode}`);
  }
  triggerMoveHistoryPopupReload();
}

function prepareForNewLocalLiveMatch() {
  nextBoardRenderSession();
  boardViewMode = "activeLive";
  clearViewedRematchState();
  connection.setWagerViewMatchId(null);
  flashbackMode = false;
  currentInputs = [];
  Board.removeHighlights();
  Board.hideItemSelectionOrConfirmationOverlay();
  Board.setBoardFlipped(activeBoardShouldBeFlipped());
  applyBoardUiForCurrentView();
}

function enterHistoricalView(matchId: string, pair: HistoricalMatchPair, historicalGame: MonsWeb.MonsGameModel, sessionId: number): boolean {
  if (!isBoardRenderSessionActive(sessionId)) {
    return false;
  }
  boardViewMode = "historicalView";
  viewedRematchMatchId = matchId;
  connection.setWagerViewMatchId(matchId);
  viewedRematchGame = historicalGame;
  viewedRematchPair = pair;
  Board.setBoardFlipped(getViewedMatchBoardFlipped(matchId, pair));
  flashbackMode = true;
  flashbackStateGame = historicalGame;
  currentInputs = [];
  Board.removeHighlights();
  Board.hideItemSelectionOrConfirmationOverlay();
  applyBoardUiForCurrentView();
  applyWagerState();
  ensureBoardViewInvariants("enterHistoricalView");
  setNewBoard(true);
  if (boardViewDebugLogsEnabled) {
    console.log(`[board-view] entered historicalView for ${matchId}`);
  }
  triggerMoveHistoryPopupReload();
  return true;
}

function ensureBoardViewInvariants(source: string) {
  if (boardViewMode === "historicalView" && Board.hasMonsBoardDisplayAnimationRunning()) {
    Board.stopMonsBoardAsDisplayAnimations();
    if (boardViewDebugLogsEnabled) {
      console.warn(`[board-view] waiting animation stopped during historical view: ${source}`);
    }
  }
}

function shouldPreserveHistoricalViewForCurrentInvite(): boolean {
  if (boardViewMode !== "historicalView" || !viewedRematchMatchId) {
    return false;
  }
  return connection.matchBelongsToCurrentInvite(viewedRematchMatchId);
}

function clearRematchHistoryCaches() {
  historicalMatchPairCache.clear();
  historicalScoreCache.clear();
  historicalMatchPairMissUntilByMatchId.clear();
  rematchScorePrefetchSignature = "";
  rematchScorePrefetchPromise = null;
  resetLocalRematchSeriesState();
}

function canTrackLocalRematchSeries(): boolean {
  if (isOnlineGame || isWatchOnly || puzzleMode) {
    return false;
  }
  return isCreateInviteRoute() || isGameWithBot;
}

function localRematchMatchIdForIndex(inviteId: string, index: number): string {
  return index === 0 ? inviteId : `${inviteId}${index}`;
}

function ensureLocalRematchSeriesInitialized() {
  if (!canTrackLocalRematchSeries()) {
    return;
  }
  if (localRematchSeriesInviteId && localActiveRematchMatchId && localRematchMatchIds.length > 0) {
    return;
  }
  const nextSeriesId = localRematchSeriesIdSeed++;
  const inviteId = `local-${nextSeriesId}`;
  const initialMatchId = localRematchMatchIdForIndex(inviteId, 0);
  localRematchSeriesInviteId = inviteId;
  localActiveRematchMatchId = initialMatchId;
  localRematchMatchIds.length = 0;
  localRematchMatchIds.push(initialMatchId);
}

function resetLocalRematchSeriesState() {
  localRematchSeriesInviteId = null;
  localActiveRematchMatchId = null;
  localRematchMatchIds.length = 0;
  localRematchSnapshotsByMatchId.clear();
  Board.resetLocalHumanSeriesOpponentAvatar();
}

function getLocalRematchSnapshot(matchId: string): LocalRematchSnapshot | null {
  return localRematchSnapshotsByMatchId.get(matchId) ?? null;
}

function getLocalRematchSeriesDescriptor(): RematchSeriesDescriptor | null {
  if (!canTrackLocalRematchSeries()) {
    return null;
  }
  ensureLocalRematchSeriesInitialized();
  if (!localRematchSeriesInviteId || !localActiveRematchMatchId || localRematchMatchIds.length === 0) {
    return null;
  }
  const matches: RematchSeriesMatchDescriptor[] = localRematchMatchIds.map((matchId, index) => ({
    index,
    matchId,
    isActiveMatch: matchId === localActiveRematchMatchId,
    isPendingResponse: false,
  }));
  return {
    inviteId: localRematchSeriesInviteId,
    activeMatchId: localActiveRematchMatchId,
    hasSeries: matches.length > 1,
    matches,
  };
}

function getActiveRematchSeriesDescriptor(): RematchSeriesDescriptor | null {
  if (isOnlineGame) {
    return connection.getRematchSeriesDescriptor();
  }
  return getLocalRematchSeriesDescriptor();
}

function localColorFromMonsColor(color: MonsWeb.Color | undefined): "white" | "black" | null {
  if (color === MonsWeb.Color.White) {
    return "white";
  }
  if (color === MonsWeb.Color.Black) {
    return "black";
  }
  return null;
}

function buildLocalHistoricalPair(snapshot: LocalRematchSnapshot): HistoricalMatchPair {
  const resignedColor = snapshot.resignedColor;
  const hostMatch: Match = {
    version: 1,
    color: resignedColor ?? "white",
    emojiId: 0,
    fen: snapshot.fen,
    status: resignedColor ? "surrendered" : "finished",
    flatMovesString: "",
    timer: "",
  };
  return {
    matchId: snapshot.matchId,
    hostPlayerId: Board.playerSideMetadata.uid || "local",
    guestPlayerId: null,
    hostMatch,
    guestMatch: null,
  };
}

function snapshotCurrentLocalMatchForHistory() {
  if (!canTrackLocalRematchSeries()) {
    return;
  }
  ensureLocalRematchSeriesInitialized();
  if (!localActiveRematchMatchId) {
    return;
  }
  const matchIndex = localRematchMatchIds.indexOf(localActiveRematchMatchId);
  if (matchIndex < 0) {
    return;
  }
  const snapshot: LocalRematchSnapshot = {
    matchId: localActiveRematchMatchId,
    index: matchIndex,
    gameModel: game,
    fen: game.fen(),
    whiteScore: game.white_score(),
    blackScore: game.black_score(),
    boardFlipped: activeBoardShouldBeFlipped(),
    resignedColor: localColorFromMonsColor(resignedColor),
  };
  localRematchSnapshotsByMatchId.set(snapshot.matchId, snapshot);
  historicalScoreCache.set(snapshot.matchId, { white: snapshot.whiteScore, black: snapshot.blackScore });
}

function advanceLocalRematchSeriesToNextMatch() {
  if (!canTrackLocalRematchSeries()) {
    return;
  }
  ensureLocalRematchSeriesInitialized();
  if (!localRematchSeriesInviteId || !localActiveRematchMatchId) {
    return;
  }
  snapshotCurrentLocalMatchForHistory();
  const nextIndex = localRematchMatchIds.length;
  const nextMatchId = localRematchMatchIdForIndex(localRematchSeriesInviteId, nextIndex);
  localActiveRematchMatchId = nextMatchId;
  localRematchMatchIds.push(nextMatchId);
  historicalScoreCache.delete(nextMatchId);
}

function activeBoardShouldBeFlipped(): boolean {
  return playerSideColor === MonsWeb.Color.Black;
}

function canHandleLiveBoardInput(): boolean {
  return boardViewMode === "activeLive" && !flashbackMode;
}

function getMoveHistorySourceGame(): MonsWeb.MonsGameModel {
  return viewedRematchGame ?? game;
}

function getViewedMatchPlayerColor(matchId: string, pair: HistoricalMatchPair): "white" | "black" | null {
  if (isWatchOnly) {
    return null;
  }
  const localPlayerUid = Board.playerSideMetadata.uid || connection.getSameProfilePlayerUid();
  if (localPlayerUid) {
    const hostColorBySeries = connection.getHostColorForMatch(matchId);
    if (hostColorBySeries) {
      if (pair.hostPlayerId === localPlayerUid) {
        return hostColorBySeries;
      }
      if (pair.guestPlayerId === localPlayerUid) {
        return hostColorBySeries === "white" ? "black" : "white";
      }
    }
  }
  const colorBySeries = connection.getSameProfileColorForMatch(matchId);
  if (colorBySeries) {
    return colorBySeries;
  }
  if (!localPlayerUid) {
    return null;
  }
  if (pair.hostPlayerId === localPlayerUid) {
    if (pair.hostMatch?.color === "white" || pair.hostMatch?.color === "black") {
      return pair.hostMatch.color;
    }
    return null;
  }
  if (pair.guestPlayerId === localPlayerUid) {
    if (pair.guestMatch?.color === "white" || pair.guestMatch?.color === "black") {
      return pair.guestMatch.color;
    }
    return null;
  }
  return null;
}

function getRematchIndexByMatchId(matchId: string): number | null {
  const descriptor = getActiveRematchSeriesDescriptor();
  if (!descriptor) {
    return null;
  }
  const item = descriptor.matches.find((candidate) => candidate.matchId === matchId);
  if (!item) {
    return null;
  }
  return item.index;
}

function getViewedMatchBoardFlipped(matchId: string, pair: HistoricalMatchPair): boolean {
  const localSnapshot = getLocalRematchSnapshot(matchId);
  if (localSnapshot) {
    return localSnapshot.boardFlipped;
  }
  const targetIndex = getRematchIndexByMatchId(matchId);
  const activeDescriptor = getActiveRematchSeriesDescriptor();
  const activeMatchId = activeDescriptor?.activeMatchId ?? connection.getActiveMatchId();
  const activeIndex = activeMatchId ? getRematchIndexByMatchId(activeMatchId) : null;
  if (targetIndex !== null && activeIndex !== null) {
    const flipParityChanged = Math.abs(targetIndex - activeIndex) % 2 === 1;
    return flipParityChanged ? !activeBoardShouldBeFlipped() : activeBoardShouldBeFlipped();
  }
  const viewedPlayerColor = getViewedMatchPlayerColor(matchId, pair);
  if (viewedPlayerColor) {
    return viewedPlayerColor === "black";
  }
  return activeBoardShouldBeFlipped();
}

function getPreferredMatchFromHistoricalPair(pair: HistoricalMatchPair): Match | null {
  const hostMatch = pair.hostMatch;
  const guestMatch = pair.guestMatch;
  if (hostMatch && !guestMatch) {
    return hostMatch;
  }
  if (!hostMatch && guestMatch) {
    return guestMatch;
  }
  if (!hostMatch || !guestMatch) {
    return null;
  }
  const hostGame = MonsWeb.MonsGameModel.from_fen(hostMatch.fen);
  const guestGame = MonsWeb.MonsGameModel.from_fen(guestMatch.fen);
  if (hostGame && !guestGame) {
    return hostMatch;
  }
  if (!hostGame && guestGame) {
    return guestMatch;
  }
  if (hostGame && guestGame) {
    if (hostGame.is_later_than(guestMatch.fen)) {
      return hostMatch;
    }
    if (guestGame.is_later_than(hostMatch.fen)) {
      return guestMatch;
    }
  }
  const localPlayerUid = Board.playerSideMetadata.uid || connection.getSameProfilePlayerUid();
  if (localPlayerUid) {
    if (pair.hostPlayerId === localPlayerUid) {
      return hostMatch;
    }
    if (pair.guestPlayerId === localPlayerUid) {
      return guestMatch;
    }
  }
  const hostMovesLength = hostMatch.flatMovesString?.length ?? 0;
  const guestMovesLength = guestMatch.flatMovesString?.length ?? 0;
  if (guestMovesLength > hostMovesLength) {
    return guestMatch;
  }
  return hostMatch;
}

function movesArrayFromFlatString(flatMovesString: string | null): string[] {
  if (!flatMovesString || flatMovesString === "") {
    return [];
  }
  return flatMovesString.split("-").filter((move) => move !== "");
}

function buildGameFromMoveStreams(whiteMovesString: string, blackMovesString: string): MonsWeb.MonsGameModel | null {
  const gameFromMoves = MonsWeb.MonsGameModel.new();
  const whiteMoves = movesArrayFromFlatString(whiteMovesString);
  const blackMoves = movesArrayFromFlatString(blackMovesString);
  let whiteIndex = 0;
  let blackIndex = 0;
  while (whiteIndex < whiteMoves.length || blackIndex < blackMoves.length) {
    const activeColor = gameFromMoves.active_color();
    if (activeColor === MonsWeb.Color.White) {
      if (whiteIndex >= whiteMoves.length) {
        return null;
      }
      const output = gameFromMoves.process_input_fen(whiteMoves[whiteIndex]);
      if (output.kind === MonsWeb.OutputModelKind.InvalidInput) {
        return null;
      }
      whiteIndex += 1;
    } else if (activeColor === MonsWeb.Color.Black) {
      if (blackIndex >= blackMoves.length) {
        return null;
      }
      const output = gameFromMoves.process_input_fen(blackMoves[blackIndex]);
      if (output.kind === MonsWeb.OutputModelKind.InvalidInput) {
        return null;
      }
      blackIndex += 1;
    } else {
      return null;
    }
  }
  return gameFromMoves;
}

function getReconstructedGameFromPair(matchId: string, pair: HistoricalMatchPair): MonsWeb.MonsGameModel | null {
  const { whiteMoves, blackMoves } = getMatchMovesByColor(matchId, pair);
  if (whiteMoves === null || blackMoves === null) {
    return null;
  }
  return buildGameFromMoveStreams(whiteMoves, blackMoves);
}

function getBestHistoricalGameModel(matchId: string, pair: HistoricalMatchPair): MonsWeb.MonsGameModel | null {
  const preferredMatch = getPreferredMatchFromHistoricalPair(pair);
  if (preferredMatch) {
    const baseGame = MonsWeb.MonsGameModel.from_fen(preferredMatch.fen);
    const { whiteMoves, blackMoves } = getMatchMovesByColor(matchId, pair);
    if (whiteMoves !== null && blackMoves !== null) {
      const verifiedGame = MonsWeb.MonsGameModel.from_fen(preferredMatch.fen);
      if (verifiedGame && verifiedGame.verify_moves(whiteMoves, blackMoves)) {
        return verifiedGame;
      }
    }
    if (baseGame) {
      return baseGame;
    }
  }
  const reconstructedGame = getReconstructedGameFromPair(matchId, pair);
  if (reconstructedGame) {
    return reconstructedGame;
  }
  return null;
}

function getScoreFromHistoricalPair(matchId: string, pair: HistoricalMatchPair): { white: number; black: number } | null {
  const historicalGame = getBestHistoricalGameModel(matchId, pair);
  if (!historicalGame) {
    return null;
  }
  return {
    white: historicalGame.white_score(),
    black: historicalGame.black_score(),
  };
}

function cacheHistoricalScore(matchId: string, pair: HistoricalMatchPair): boolean {
  const score = getScoreFromHistoricalPair(matchId, pair);
  if (!score) {
    return false;
  }
  const previous = historicalScoreCache.get(matchId);
  if (previous && previous.white === score.white && previous.black === score.black) {
    return false;
  }
  historicalScoreCache.set(matchId, score);
  return true;
}

async function ensureHistoricalMatchPair(matchId: string): Promise<HistoricalMatchPair | null> {
  if (historicalMatchPairCache.has(matchId)) {
    return historicalMatchPairCache.get(matchId) ?? null;
  }
  const now = Date.now();
  const missUntil = historicalMatchPairMissUntilByMatchId.get(matchId);
  if (missUntil !== undefined) {
    if (missUntil > now) {
      return null;
    }
    historicalMatchPairMissUntilByMatchId.delete(matchId);
  }
  let pair: HistoricalMatchPair | null = null;
  try {
    pair = await connection.loadHistoricalMatchPair(matchId);
  } catch {
    pair = null;
  }
  if (pair) {
    historicalMatchPairCache.set(matchId, pair);
    historicalMatchPairMissUntilByMatchId.delete(matchId);
    cacheHistoricalScore(matchId, pair);
  } else {
    historicalMatchPairMissUntilByMatchId.set(matchId, Date.now() + historicalMatchPairMissCooldownMs);
  }
  return pair;
}

function getMatchMovesByColor(matchId: string, pair: HistoricalMatchPair): { whiteMoves: string | null; blackMoves: string | null } {
  let whiteMoves: string | null = null;
  let blackMoves: string | null = null;
  const movesFromMatch = (match: Match | null): string => match?.flatMovesString ?? "";
  const assignMovesByStoredColor = (match: Match | null) => {
    if (!match) {
      return;
    }
    if (match.color === "white" && whiteMoves === null) {
      whiteMoves = match.flatMovesString ?? "";
    } else if (match.color === "black" && blackMoves === null) {
      blackMoves = match.flatMovesString ?? "";
    }
  };
  assignMovesByStoredColor(pair.hostMatch);
  assignMovesByStoredColor(pair.guestMatch);
  if (whiteMoves === null || blackMoves === null) {
    const hostColorBySeries = connection.getHostColorForMatch(matchId);
    if (hostColorBySeries === "white") {
      if (whiteMoves === null) {
        whiteMoves = movesFromMatch(pair.hostMatch);
      }
      if (blackMoves === null) {
        blackMoves = movesFromMatch(pair.guestMatch);
      }
    } else if (hostColorBySeries === "black") {
      if (whiteMoves === null) {
        whiteMoves = movesFromMatch(pair.guestMatch);
      }
      if (blackMoves === null) {
        blackMoves = movesFromMatch(pair.hostMatch);
      }
    }
  }
  return {
    whiteMoves,
    blackMoves,
  };
}

function buildHistoricalGameModel(matchId: string, pair: HistoricalMatchPair): MonsWeb.MonsGameModel | null {
  return getBestHistoricalGameModel(matchId, pair);
}

function toMonsColor(color: string | null | undefined): MonsWeb.Color | undefined {
  if (color === "white") {
    return MonsWeb.Color.White;
  }
  if (color === "black") {
    return MonsWeb.Color.Black;
  }
  return undefined;
}

function oppositeMonsColor(color: MonsWeb.Color | undefined): MonsWeb.Color | undefined {
  if (color === MonsWeb.Color.White) {
    return MonsWeb.Color.Black;
  }
  if (color === MonsWeb.Color.Black) {
    return MonsWeb.Color.White;
  }
  return undefined;
}

function getHistoricalResignedColor(matchId: string, pair: HistoricalMatchPair): MonsWeb.Color | undefined {
  const hostMatchResigned = pair.hostMatch?.status === "surrendered";
  const guestMatchResigned = pair.guestMatch?.status === "surrendered";
  if (!hostMatchResigned && !guestMatchResigned) {
    return undefined;
  }
  const hostStoredColor = hostMatchResigned ? toMonsColor(pair.hostMatch?.color) : undefined;
  const guestStoredColor = guestMatchResigned ? toMonsColor(pair.guestMatch?.color) : undefined;
  if (hostStoredColor !== undefined && guestStoredColor === undefined) {
    return hostStoredColor;
  }
  if (guestStoredColor !== undefined && hostStoredColor === undefined) {
    return guestStoredColor;
  }
  if (hostStoredColor !== undefined && guestStoredColor !== undefined) {
    if (hostStoredColor === guestStoredColor) {
      return hostStoredColor;
    }
  }
  const hostSeriesColor = toMonsColor(connection.getHostColorForMatch(matchId));
  if (hostSeriesColor !== undefined) {
    if (hostMatchResigned && !guestMatchResigned) {
      return hostSeriesColor;
    }
    if (guestMatchResigned && !hostMatchResigned) {
      return oppositeMonsColor(hostSeriesColor);
    }
  }
  return hostStoredColor ?? guestStoredColor;
}

function getDisplayResignedColor(inFlashbackMode: boolean): MonsWeb.Color | undefined {
  if (boardViewMode === "historicalView" && inFlashbackMode && viewedRematchMatchId) {
    const localSnapshot = getLocalRematchSnapshot(viewedRematchMatchId);
    if (localSnapshot?.resignedColor === "white") {
      return MonsWeb.Color.White;
    }
    if (localSnapshot?.resignedColor === "black") {
      return MonsWeb.Color.Black;
    }
    if (viewedRematchPair) {
      return getHistoricalResignedColor(viewedRematchMatchId, viewedRematchPair);
    }
  }
  return resignedColor;
}

function getDisplayWinnerByTimerColor(inFlashbackMode: boolean): MonsWeb.Color | undefined {
  if (boardViewMode === "historicalView" && inFlashbackMode) {
    return undefined;
  }
  return winnerByTimerColor;
}

function shouldShowTerminalIndicators(inFlashbackMode: boolean, displayGame: MonsWeb.MonsGameModel): boolean {
  if (!flashbackMode || !inFlashbackMode) {
    return true;
  }
  return displayGame.fen() === getMoveHistorySourceGame().fen();
}

export function getRematchSeriesNavigatorItems(): RematchSeriesNavigatorItem[] {
  const descriptor = getActiveRematchSeriesDescriptor();
  if (!descriptor || !descriptor.hasSeries) {
    return [];
  }
  const activeMatchId = descriptor.activeMatchId;
  const selectedMatchId = viewedRematchMatchId ?? activeMatchId;
  const activeMatchDescriptor = descriptor.matches.find((m: RematchSeriesMatchDescriptor) => m.isActiveMatch);
  const activeMatchIndex = activeMatchDescriptor ? activeMatchDescriptor.index : 0;
  const activePlayerIsWhite = playerSideColor !== MonsWeb.Color.Black;
  return descriptor.matches.map((descriptorItem: RematchSeriesMatchDescriptor) => {
    let whiteScore: number | null = null;
    let blackScore: number | null = null;
    if (descriptorItem.matchId === activeMatchId) {
      whiteScore = game.white_score();
      blackScore = game.black_score();
    } else {
      const localSnapshot = getLocalRematchSnapshot(descriptorItem.matchId);
      if (localSnapshot) {
        whiteScore = localSnapshot.whiteScore;
        blackScore = localSnapshot.blackScore;
      }
      const cachedScore = historicalScoreCache.get(descriptorItem.matchId);
      if (!localSnapshot && cachedScore) {
        whiteScore = cachedScore.white;
        blackScore = cachedScore.black;
      }
    }
    const indexDiff = Math.abs(descriptorItem.index - activeMatchIndex);
    const playerIsWhite = indexDiff % 2 === 0 ? activePlayerIsWhite : !activePlayerIsWhite;
    return {
      matchId: descriptorItem.matchId,
      index: descriptorItem.index,
      whiteScore,
      blackScore,
      isPendingResponse: descriptorItem.isPendingResponse,
      isActiveMatch: descriptorItem.isActiveMatch,
      isSelected: selectedMatchId === descriptorItem.matchId,
      playerIsWhite,
    };
  });
}

export async function preloadRematchSeriesScores(): Promise<boolean> {
  if (!isOnlineGame) {
    return false;
  }
  const descriptor = connection.getRematchSeriesDescriptor();
  if (!descriptor || !descriptor.hasSeries) {
    return false;
  }
  const targetMatchIds = descriptor.matches
    .filter((descriptorItem) => descriptorItem.matchId !== descriptor.activeMatchId)
    .map((descriptorItem) => descriptorItem.matchId);
  const signature = `${descriptor.activeMatchId ?? ""}|${targetMatchIds.join("|")}`;
  if (rematchScorePrefetchPromise && rematchScorePrefetchSignature === signature) {
    return rematchScorePrefetchPromise;
  }
  rematchScorePrefetchSignature = signature;
  rematchScorePrefetchPromise = (async () => {
    let didChange = false;
    const pendingMatchIds = targetMatchIds.filter((matchId) => !historicalScoreCache.has(matchId));
    if (pendingMatchIds.length === 0) {
      return false;
    }
    let nextIndex = 0;
    const worker = async () => {
      while (nextIndex < pendingMatchIds.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        const matchId = pendingMatchIds[currentIndex];
        if (!matchId || historicalScoreCache.has(matchId)) {
          continue;
        }
        const hadScoreBefore = historicalScoreCache.has(matchId);
        const pair = await ensureHistoricalMatchPair(matchId);
        if (!pair) {
          continue;
        }
        const hasScoreAfterEnsure = historicalScoreCache.has(matchId);
        const didChangeScore = cacheHistoricalScore(matchId, pair);
        if ((!hadScoreBefore && hasScoreAfterEnsure) || didChangeScore) {
          didChange = true;
          triggerMoveHistoryPopupReload();
        }
      }
    };
    await Promise.all([worker(), worker()]);
    return didChange;
  })();
  try {
    return await rematchScorePrefetchPromise;
  } finally {
    rematchScorePrefetchPromise = null;
  }
}

export async function didSelectRematchSeriesMatch(matchId: string): Promise<boolean> {
  const descriptor = getActiveRematchSeriesDescriptor();
  const activeMatchId = descriptor?.activeMatchId ?? null;
  if (!activeMatchId) {
    return false;
  }
  if (boardViewMode === "historicalView" && viewedRematchMatchId === matchId) {
    return false;
  }
  if (matchId === activeMatchId) {
    const didHaveHistoricalSelection = boardViewMode === "historicalView" || viewedRematchMatchId !== null || flashbackMode;
    if (!didHaveHistoricalSelection) {
      return false;
    }
    restoreLiveBoardView();
    return didHaveHistoricalSelection;
  }
  const requestToken = ++viewedRematchRequestToken;
  const renderSessionId = nextBoardRenderSession();
  if (isOnlineGame) {
    const pair = await ensureHistoricalMatchPair(matchId);
    if (requestToken !== viewedRematchRequestToken || !isBoardRenderSessionActive(renderSessionId) || !pair) {
      return false;
    }
    const historicalGame = buildHistoricalGameModel(matchId, pair);
    if (!historicalGame || !isBoardRenderSessionActive(renderSessionId)) {
      return false;
    }
    return enterHistoricalView(matchId, pair, historicalGame, renderSessionId);
  }
  const localSnapshot = getLocalRematchSnapshot(matchId);
  if (requestToken !== viewedRematchRequestToken || !isBoardRenderSessionActive(renderSessionId) || !localSnapshot) {
    return false;
  }
  const historicalGame = localSnapshot.gameModel;
  if (!historicalGame || !isBoardRenderSessionActive(renderSessionId)) {
    return false;
  }
  const pair = buildLocalHistoricalPair(localSnapshot);
  return enterHistoricalView(matchId, pair, historicalGame, renderSessionId);
}

export function getVerboseTrackingEntities(): MoveHistoryEntry[] {
  const entities = getMoveHistorySourceGame().verbose_tracking_entities();
  if (entities.length === 0) {
    return [{ segments: [], hasTurnSeparator: false }];
  }
  return entities.map((entity) => {
    const events = entity.events();
    return tokensForSingleMoveEvents(events, entity.color());
  });
}

export function didSelectVerboseTrackingEntity(index: number) {
  const entities = getMoveHistorySourceGame().verbose_tracking_entities();
  if (index < 0 || index >= entities.length) {
    return;
  }
  const entity = entities[index];
  const eventsFen = String(entity.events_fen());
  console.log(eventsFen);

  flashbackMode = true;
  const gameFen = entity.fen();
  flashbackStateGame = MonsWeb.MonsGameModel.from_fen(gameFen)!;
  currentInputs = [];
  Board.removeHighlights();
  Board.hideItemSelectionOrConfirmationOverlay();
  setNewBoard(true);
}

export function didDismissMoveHistoryPopup() {
  if (boardViewMode === "historicalView") {
    if (viewedRematchGame) {
      flashbackMode = true;
      flashbackStateGame = viewedRematchGame;
      currentInputs = [];
      Board.removeHighlights();
      Board.hideItemSelectionOrConfirmationOverlay();
      setNewBoard(true);
    }
    return;
  }
  clearViewedRematchState();
  if (flashbackMode) {
    flashbackMode = false;
    Board.setBoardFlipped(activeBoardShouldBeFlipped());
    setNewBoard(false);
  }
}

function dismissBadgeAndNotificationBannerIfNeeded() {
  setBadgeVisible(false);
  hideNotificationBanner();
}

const notificationBannerIsDisabledUntilItsMadeLessAnnoying = true;

export function didAttemptAuthentication() {
  if (!isOnlineGame && !didStartLocalGame && isCreateInviteRoute() && !isWaitingForInviteToGetAccepted && !didConnect) {
    if (!getTutorialCompleted()) {
      setBadgeVisible(true);
      if (storage.isFirstLaunch()) {
        storage.trackFirstLaunch();
      } else if (!notificationBannerIsDisabledUntilItsMadeLessAnnoying) {
        const [completed, total] = getTutorialProgress();
        showNotificationBanner("Play Mons 101", `${completed} / ${total} lessons completed`, "104", resumeTutorialFromBanner);
      }
    }
  }
}

export async function go(routeStateOverride?: RouteState) {
  const routeState = routeStateOverride ?? getCurrentRouteState();
  activeRouteState = routeState;
  clearAllManagedGameTimeouts();
  resetBotScoreReactionState();
  isGameWithBot = false;
  nextBoardRenderSession();
  boardViewMode = "activeLive";
  clearViewedRematchState();
  clearRematchHistoryCaches();
  Board.resetPlayersMetadataForSession();
  Board.setBoardFlipped(false);
  setIslandButtonDimmed(false);
  isOnlineGame = false;
  isGameWithBot = false;
  isWaitingForRematchResponse = false;
  puzzleMode = false;
  didStartLocalGame = false;
  isGameOver = false;
  isReconnect = false;
  didConnect = false;
  isWaitingForInviteToGetAccepted = false;
  isInviteBotIntoLocalGameUnavailable = false;
  didMakeFirstLocalPlayerMoveOnLocalBoard = false;
  flashbackMode = false;
  resignedColor = undefined;
  winnerByTimerColor = undefined;
  currentInputs = [];
  setCurrentWagerMatch(null);
  connection.setWagerViewMatchId(null);
  setWatchOnlyState(false);
  resetTimerStateForMatch(null);
  triggerMoveHistoryPopupReload();
  if (!didSetupWagerSubscription) {
    didSetupWagerSubscription = true;
    unsubscribeFromWagerState = subscribeToWagerState((state) => {
      currentWagerState = state;
      logWagerDebug("subscription:update", { state: summarizeWagerState(state) });
      applyWagerState();
      if (isGameOver) {
        const outcomeState = syncWagerOutcome();
        logWagerDebug("subscription:sync-on-gameover", { outcomeState });
      }
    });
  }
  connection.setupConnection(false, routeState);
  Board.setupBoard();
  await initMonsWeb();

  playerSideColor = MonsWeb.Color.White;
  game = MonsWeb.MonsGameModel.new();
  initialFen = game.fen();

  if (isBotsRoute()) {
    game.locations_with_content().forEach((loc) => {
      const location = new Location(loc.i, loc.j);
      updateLocation(location);
    });

    didStartLocalGame = true;
    setHomeVisible(true);
    setIslandButtonDimmed(true);

    setBrushAndNavigationButtonDimmed(true);
    setInviteLinkActionVisible(false);
    setAutomatchVisible(false);
    setBotGameOptionVisible(false);
    setNavigationListButtonVisible(false);

    setWatchOnlyState(true);
    lastBotMoveTimestamp = 0;
    automove();
  } else if (isSnapshotRoute()) {
    const snapshot = routeState.snapshotId ?? "";
    const gameFromFen = MonsWeb.MonsGameModel.from_fen(snapshot);
    if (!gameFromFen) {
      throw new Error(INVALID_SNAPSHOT_ROUTE_ERROR);
    }
    game = gameFromFen;
    game.locations_with_content().forEach((loc) => {
      const location = new Location(loc.i, loc.j);
      updateLocation(location);
    });
    didStartLocalGame = true;
    setHomeVisible(true);
    setIslandButtonDimmed(true);

    setBrushAndNavigationButtonDimmed(true);
    setUndoVisible(true);
    setInviteLinkActionVisible(false);
    setAutomatchVisible(false);
    setBotGameOptionVisible(false);
    setNavigationListButtonVisible(false);
    setAutomoveActionVisible(true);
    showMoveHistoryButton(true);
  } else if (isCreateInviteRoute()) {
    ensureLocalRematchSeriesInitialized();
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
    setIslandButtonDimmed(true);

    setBrushAndNavigationButtonDimmed(true);
    setNavigationListButtonVisible(false);
  }

  Board.setupGameInfoElements(!isCreateInviteRoute() && !isSnapshotRoute() && !isBotsRoute());
  if (isSnapshotRoute() || isBotsRoute()) {
    updateBoardMoveStatuses();
    Board.updateScore(game.white_score(), game.black_score(), game.winner_color(), resignedColor, winnerByTimerColor);
  }

  if (isBotsRoute()) {
    Board.showRandomEmojisForLoopMode();
  }
  syncInviteBotIntoLocalGameButton();
}

export function disposeGameSession() {
  clearAllManagedGameTimeouts();
  resetBotScoreReactionState();
  isGameWithBot = false;
  nextBoardRenderSession();
  boardViewMode = "activeLive";
  clearViewedRematchState();
  clearRematchHistoryCaches();
  Board.resetPlayersMetadataForSession();
  Board.setBoardFlipped(false);
  setIslandButtonDimmed(false);
  if (unsubscribeFromWagerState) {
    unsubscribeFromWagerState();
    unsubscribeFromWagerState = null;
  }
  didSetupWagerSubscription = false;
  if (wagerOutcomeAnimTimer !== null) {
    clearManagedGameTimeout(wagerOutcomeAnimTimer);
    wagerOutcomeAnimTimer = null;
  }
  isOnlineGame = false;
  isGameWithBot = false;
  isWaitingForRematchResponse = false;
  puzzleMode = false;
  selectedProblem = null;
  didStartLocalGame = false;
  isGameOver = false;
  isReconnect = false;
  didConnect = false;
  isWaitingForInviteToGetAccepted = false;
  isInviteBotIntoLocalGameUnavailable = false;
  didMakeFirstLocalPlayerMoveOnLocalBoard = false;
  setWatchOnlyState(false);
  currentWagerState = null;
  wagerOutcomeShown = false;
  wagerOutcomeAnimating = false;
  wagerOutcomeAnimationAllowed = false;
  whiteProcessedMovesCount = 0;
  blackProcessedMovesCount = 0;
  didSetWhiteProcessedMovesCount = false;
  didSetBlackProcessedMovesCount = false;
  currentGameModelMatchId = null;
  whiteFlatMovesString = null;
  blackFlatMovesString = null;
  wagerMatchId = null;
  flashbackMode = false;
  resignedColor = undefined;
  winnerByTimerColor = undefined;
  lastReactionTime = 0;
  lastBotMoveTimestamp = 0;
  processedVoiceReactions.clear();
  currentInputs = [];
  resetTimerStateForMatch(null);
  setCurrentWagerMatch(null);
  connection.setWagerViewMatchId(null);
  setHomeVisible(false);
  setInviteLinkActionVisible(false);
  setAutomatchVisible(false);
  setBotGameOptionVisible(false);
  setNavigationListButtonVisible(false);
  setPlaySamePuzzleAgainButtonVisible(false);
  setAutomatchWaitingState(false);
  setAutomatchEnabled(true);
  setBrushAndNavigationButtonDimmed(false);
  setUndoVisible(false);
  setAutomoveActionVisible(false);
  setAutomoveActionEnabled(true);
  setUndoEnabled(false);
  setWatchOnlyVisible(false);
  showVoiceReactionButton(false);
  showMoveHistoryButton(false);
  hideTimerButtons();
  disableAndHideUndoResignAndTimerControls();
  setEndMatchVisible(false);
  setEndMatchConfirmed(false);
  showWaitingStateText("");
  showPrimaryAction(PrimaryActionType.None);
  Board.stopMonsBoardAsDisplayAnimations();
  Board.hideTimerCountdownDigits();
  Board.hideAllMoveStatuses();
  Board.setInviteBotButtonVisible(false);
  Board.removeHighlights();
  Board.hideItemSelectionOrConfirmationOverlay();
  triggerMoveHistoryPopupReload();
}

export function failedToCreateRematchProposal() {
  isWaitingForRematchResponse = false;
  boardViewMode = "activeLive";
  nextBoardRenderSession();
  applyBoardUiForCurrentView();
  setNewBoard(false);
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
  setNewBoard(false);
  lastBotMoveTimestamp = 0;
  automove();
}

function startFreshLocalMatch() {
  ensureLocalRematchSeriesInitialized();
  const activeLocalMatchIndex = localActiveRematchMatchId ? localRematchMatchIds.indexOf(localActiveRematchMatchId) : -1;
  const playerStartsAsBlackInThisMatch = activeLocalMatchIndex >= 0 && activeLocalMatchIndex % 2 === 1;
  playerSideColor = playerStartsAsBlackInThisMatch ? MonsWeb.Color.Black : MonsWeb.Color.White;
  prepareForNewLocalLiveMatch();
  resetBotScoreReactionState();
  isGameOver = false;
  isReconnect = false;
  didConnect = false;
  isWaitingForInviteToGetAccepted = false;
  isWaitingForRematchResponse = false;
  flashbackMode = false;
  resignedColor = undefined;
  winnerByTimerColor = undefined;
  isInviteBotIntoLocalGameUnavailable = false;
  didMakeFirstLocalPlayerMoveOnLocalBoard = false;
  didStartLocalGame = true;
  isGameWithBot = false;
  whiteProcessedMovesCount = 0;
  blackProcessedMovesCount = 0;
  didSetWhiteProcessedMovesCount = false;
  didSetBlackProcessedMovesCount = false;
  currentGameModelMatchId = null;
  whiteFlatMovesString = null;
  blackFlatMovesString = null;
  currentInputs = [];
  resetTimerStateForMatch(null);
  setHomeVisible(true);
  setIslandButtonDimmed(true);
  setUndoVisible(true);
  setBrushAndNavigationButtonDimmed(true);
  setInviteLinkActionVisible(false);
  setAutomatchVisible(false);
  setBotGameOptionVisible(false);
  setNavigationListButtonVisible(false);
  setAutomoveActionVisible(true);
  setAutomoveActionEnabled(true);
  showMoveHistoryButton(true);
  showResignButton();
  showVoiceReactionButton(false);
  setEndMatchVisible(false);
  setEndMatchConfirmed(false);
  showWaitingStateText("");
  Board.setBoardFlipped(activeBoardShouldBeFlipped());
  Board.resetForNewGame();
  game = MonsWeb.MonsGameModel.new();
  setNewBoard(false);
  updateUndoButtonBasedOnGameState();
  syncInviteBotIntoLocalGameButton();
  triggerMoveHistoryPopupReload();
}

function startBotMatch(botColor: MonsWeb.Color) {
  ensureLocalRematchSeriesInitialized();
  prepareForNewLocalLiveMatch();
  resetBotScoreReactionState();
  isGameOver = false;
  isReconnect = false;
  didConnect = false;
  isWaitingForInviteToGetAccepted = false;
  isWaitingForRematchResponse = false;
  flashbackMode = false;
  resignedColor = undefined;
  winnerByTimerColor = undefined;
  isInviteBotIntoLocalGameUnavailable = true;
  didMakeFirstLocalPlayerMoveOnLocalBoard = false;
  didStartLocalGame = true;
  isGameWithBot = true;
  whiteProcessedMovesCount = 0;
  blackProcessedMovesCount = 0;
  didSetWhiteProcessedMovesCount = false;
  didSetBlackProcessedMovesCount = false;
  currentGameModelMatchId = null;
  whiteFlatMovesString = null;
  blackFlatMovesString = null;
  currentInputs = [];
  resetTimerStateForMatch(null);
  setHomeVisible(true);
  setIslandButtonDimmed(true);
  setUndoVisible(true);
  setBrushAndNavigationButtonDimmed(true);
  setInviteLinkActionVisible(false);
  setAutomatchVisible(false);
  setBotGameOptionVisible(false);
  setNavigationListButtonVisible(false);
  setAutomoveActionVisible(true);
  setAutomoveActionEnabled(true);
  showMoveHistoryButton(true);
  showResignButton();
  Board.setBoardFlipped(botColor === MonsWeb.Color.White);
  Board.showOpponentAsBotPlayer();
  Board.resetForNewGame();
  game = MonsWeb.MonsGameModel.new();
  setNewBoard(false);
  botPlayerColor = botColor;
  playerSideColor = botColor === MonsWeb.Color.White ? MonsWeb.Color.Black : MonsWeb.Color.White;
  showVoiceReactionButton(true);
  lastBotMoveTimestamp = 0;
  updateUndoButtonBasedOnGameState();
  syncInviteBotIntoLocalGameButton();
  if (game.active_color() === botPlayerColor) {
    automove();
  }
}

export function didJustCreateRematchProposalSuccessfully(inviteId: string) {
  if (boardViewMode !== "historicalView") {
    clearViewedRematchState();
  }
  clearRematchHistoryCaches();
  resetBotScoreReactionState();
  setEndMatchVisible(true);
  showWaitingStateText("");

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
  resetTimerStateForMatch(null);

  if (boardViewMode !== "historicalView") {
    enterWaitingLiveView();
  }
  connection.signInIfNeededAndConnectToGame(inviteId, true);
  triggerMoveHistoryPopupReload();
}

export function didDiscoverExistingRematchProposalWaitingForResponse() {
  isWaitingForRematchResponse = true;
  if (boardViewMode !== "historicalView") {
    enterWaitingLiveView();
  }
  triggerMoveHistoryPopupReload();
}

export function didFindYourOwnInviteThatNobodyJoined(isAutomatch: boolean) {
  Board.setupPlayerId("", true);
  if (!isAutomatch) {
    setInviteLinkActionVisible(true);
    setIsReadyToCopyExistingInviteLink();
    Board.runMonsBoardAsDisplayWaitingAnimation();
  } else if (!isCreateInviteRoute()) {
    setAutomatchWaitingState(true);
    Board.runMonsBoardAsDisplayWaitingAnimation();
  }
}

export function didClickStartBotGameButton() {
  dismissBadgeAndNotificationBannerIfNeeded();
  startBotMatch(MonsWeb.Color.White);
}

export function didClickInviteBotIntoLocalGameButton() {
  if (
    isOnlineGame ||
    isWatchOnly ||
    isGameWithBot ||
    puzzleMode ||
    isGameOver ||
    !didStartLocalGame ||
    isInviteBotIntoLocalGameUnavailable ||
    !isCreateInviteRoute() ||
    !didMakeFirstLocalPlayerMoveOnLocalBoard ||
    !isFirstLocalRematchSeriesMatchActive() ||
    game.turn_number() > 2
  ) {
    return;
  }
  const shouldSendInviteYoReaction = game.active_color() === MonsWeb.Color.White && game.turn_number() === 1;
  resetBotScoreReactionState();
  isInviteBotIntoLocalGameUnavailable = true;
  isGameWithBot = true;
  botPlayerColor = MonsWeb.Color.Black;
  playerSideColor = MonsWeb.Color.White;
  Board.setBoardFlipped(false);
  Board.showOpponentAsBotPlayer();
  showResignButton();
  showVoiceReactionButton(true);
  setAutomoveActionVisible(true);
  setAutomoveActionEnabled(isPlayerSideTurn());
  updateUndoButtonBasedOnGameState();
  syncInviteBotIntoLocalGameButton();
  if (shouldSendInviteYoReaction) {
    const inviteReactionGuard = getSessionGuard();
    setManagedGameTimeout(() => {
      if (!isGameWithBot || isGameOver) {
        return;
      }
      const reaction = newReactionOfKind("yo");
      playReaction(reaction);
      Board.showVoiceReactionText("yo", true);
    }, 500, inviteReactionGuard);
  }
  lastBotMoveTimestamp = 0;
  if (game.active_color() === botPlayerColor) {
    automove();
  }
}

export function handleFreshlySignedInProfileInGameIfNeeded(profileId: string) {
  if (isWatchOnly) {
    connection.seeIfFreshlySignedInProfileIsOneOfThePlayers(profileId);
  }
}

export function didFindInviteThatCanBeJoined() {
  showPrimaryAction(PrimaryActionType.JoinGame);
  Board.runMonsBoardAsDisplayWaitingAnimation();
}

export function didClickAutomatchButton() {
  setHomeVisible(true);
  setIslandButtonDimmed(true);

  setBrushAndNavigationButtonDimmed(true);
  setAutomoveActionVisible(false);
  showMoveHistoryButton(false);
  setInviteLinkActionVisible(false);
  setBotGameOptionVisible(false);
  dismissBadgeAndNotificationBannerIfNeeded();
  setNavigationListButtonVisible(false);
  Board.hideBoardPlayersInfo();
  Board.removeHighlights();
  Board.hideAllMoveStatuses();
  isWaitingForInviteToGetAccepted = true;
  Board.runMonsBoardAsDisplayWaitingAnimation();
  const sessionGuard = getSessionGuard();

  connection
    .automatch()
    .then((response) => {
      if (!sessionGuard()) {
        return;
      }
      const automatchInviteId = response.inviteId;
      if (automatchInviteId) {
        connection.connectToAutomatch(automatchInviteId);
      }
    })
    .catch(() => {
      if (!sessionGuard()) {
        return;
      }
      setAutomatchEnabled(true);
    });
}

function showRematchInterface() {
  showVoiceReactionButton(false);
  if (isWatchOnly) {
    return;
  }
  if (connection.rematchSeriesEndIsIndicated()) {
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
    updateLocation(location, flashbackMode);
  });

  const inputsToReapply = currentInputs;
  currentInputs = [];
  for (const input of inputsToReapply) {
    didClickSquare(input);
  }
}

export function didReceiveRematchesSeriesEndIndicator() {
  if (isWatchOnly) return;
  isWaitingForRematchResponse = false;
  showPrimaryAction(PrimaryActionType.None);
  setEndMatchVisible(true);
  setEndMatchConfirmed(true);
  showVoiceReactionButton(false);
  if (boardViewMode === "waitingLive") {
    boardViewMode = "activeLive";
    nextBoardRenderSession();
  }
  applyBoardUiForCurrentView();
  triggerMoveHistoryPopupReload();
}

export function didUpdateRematchSeriesMetadata() {
  triggerMoveHistoryPopupReload();
}

function automove(onAutomoveButtonClick: boolean = false) {
  const sessionGuard = getSessionGuard();
  const preference = onAutomoveButtonClick ? "fast" : "normal";
  const shouldEnforceBotMovePacing = isBotsRoute() || (isGameWithBot && game.active_color() === botPlayerColor);
  const fenBeforeAutomove = game.fen();
  const inputColorBeforeAutomove = game.active_color();
  const syncAutomoveActionState = () => {
    if (isBotsRoute()) {
      return;
    }
    if (!isGameWithBot || isPlayerSideTurn()) {
      setAutomoveActionEnabled(true);
    } else {
      setAutomoveActionEnabled(false);
    }
  };
  game
    .smartAutomoveAsync(preference)
    .then((output: MonsWeb.OutputModel) => {
      if (!sessionGuard()) {
        return;
      }
      if (output.kind === MonsWeb.OutputModelKind.Events) {
        const applyOutputWhenReady = () => {
          if (!sessionGuard()) {
            return;
          }
          if (!isGameOver && game.fen() === fenBeforeAutomove) {
            if (shouldEnforceBotMovePacing) {
              lastBotMoveTimestamp = Date.now();
            }
            const appliedOutput = game.process_input_fen(output.input_fen());
            applyOutput([], "", appliedOutput, false, true, AssistedInputKind.None, undefined, inputColorBeforeAutomove);
          }
          syncAutomoveActionState();
        };
        const delayBeforeApplyMs = shouldEnforceBotMovePacing ? Math.max(0, lastBotMoveTimestamp + minimumIntervalBetweenBotMovesMs - Date.now()) : 0;
        if (delayBeforeApplyMs > 0) {
          setManagedGameTimeout(applyOutputWhenReady, delayBeforeApplyMs, sessionGuard);
        } else {
          applyOutputWhenReady();
        }
      } else {
        syncAutomoveActionState();
      }

      Board.hideItemSelectionOrConfirmationOverlay();
    })
    .catch((e: unknown) => {
      if (String(e).includes("smart automove already in progress")) {
        return;
      }
      throw e;
    });
}

function didConfirmRematchProposal() {
  if (puzzleMode) {
    const nextProblem = getNextProblem(selectedProblem!.id);
    if (nextProblem) {
      showNextProblem(nextProblem);
      return;
    }
  }

  if (isGameWithBot) {
    advanceLocalRematchSeriesToNextMatch();
    const nextBotColor = botPlayerColor === MonsWeb.Color.White ? MonsWeb.Color.Black : MonsWeb.Color.White;
    startBotMatch(nextBotColor);
    return;
  }

  if (!isOnlineGame) {
    if (canTrackLocalRematchSeries()) {
      advanceLocalRematchSeriesToNextMatch();
      startFreshLocalMatch();
      return;
    }
    void transitionToHome({ forceMatchScopeReset: true });
    return;
  }

  setEndMatchVisible(false);
  Board.runMonsBoardAsDisplayWaitingAnimation();
  connection.sendRematchProposal();
  Board.hideBoardPlayersInfo();
  showVoiceReactionButton(false);
}

export function didClickEndMatchButton() {
  showPrimaryAction(PrimaryActionType.None);
  setEndMatchConfirmed(true);
  showVoiceReactionButton(false);
  connection.sendEndMatchIndicator();
  showWaitingStateText("");
  Board.stopMonsBoardAsDisplayAnimations();
}

export function didClickPrimaryActionButton(action: PrimaryActionType) {
  switch (action) {
    case PrimaryActionType.JoinGame:
      connection.setupConnection(true);
      break;
    case PrimaryActionType.Rematch:
      didConfirmRematchProposal();
      break;
    default:
      break;
  }
}

export function didClickClaimVictoryByTimerButton() {
  if (!canHandleLiveBoardInput()) {
    return;
  }
  if (isOnlineGame && !isWatchOnly) {
    const sessionGuard = getSessionGuard();
    connection
      .claimVictoryByTimer()
      .then((res) => {
        if (!sessionGuard()) {
          return;
        }
        if (res.ok) {
          handleVictoryByTimer(false, playerSideColor === MonsWeb.Color.White ? "white" : "black", true);
        }
      })
      .catch(() => {});
  }
}

export function didClickHomeButton() {
  void transitionToHome({ forceMatchScopeReset: true });
}

export function didClickStartTimerButton() {
  if (!canHandleLiveBoardInput()) {
    return;
  }
  if (isOnlineGame && !isWatchOnly && !isPlayerSideTurn()) {
    const sessionGuard = getSessionGuard();
    connection
      .startTimer()
      .then((res) => {
        if (!sessionGuard()) {
          return;
        }
        if (res.ok) {
          showTimerCountdown(false, res.timer, playerSideColor === MonsWeb.Color.White ? "white" : "black", res.duration);
        }
      })
      .catch(() => {});
  }
}

export function didClickConfirmResignButton() {
  if (!canHandleLiveBoardInput()) {
    return;
  }
  if (!isOnlineGame && !isGameWithBot) {
    const activeColor = game.active_color();
    let activeColorString = "";
    if (activeColor === MonsWeb.Color.White) {
      activeColorString = "white";
    } else if (activeColor === MonsWeb.Color.Black) {
      activeColorString = "black";
    }
    handleResignStatus(false, activeColorString);
    return;
  }
  connection.surrender();
  handleResignStatus(false, "");
}

export function canHandleUndo(): boolean {
  if (!canHandleLiveBoardInput() || isWatchOnly || isGameOver) {
    return false;
  } else if (isOnlineGame || isGameWithBot) {
    return game.can_takeback(playerSideColor);
  } else {
    return game.can_takeback(game.active_color());
  }
}

export function didClickUndoButton() {
  if (!canHandleLiveBoardInput()) {
    return;
  }
  if (canHandleUndo()) {
    const output = game.takeback();
    applyOutput([], "", output, false, false, AssistedInputKind.None);
  }
}

export function canChangeEmoji(opponents: boolean): boolean {
  if ((storage.getLoginId("") && !opponents) || isBotsRoute()) {
    return false;
  }
  if (isOnlineGame || isGameWithBot) {
    return opponents ? false : !isWatchOnly;
  } else {
    return true;
  }
}

export function sendPlayerEmojiUpdate(newId: number, aura?: string) {
  const auraToSend = aura ?? storage.getPlayerEmojiAura("");
  connection.updateEmoji(newId, false, auraToSend);
}

export function isPlayerSideTurn(): boolean {
  return game.active_color() === playerSideColor;
}

export function didSelectInputModifier(inputModifier: InputModifier) {
  if (!canHandleLiveBoardInput() || (isOnlineGame && !didConnect) || isWatchOnly || isGameOver || isWaitingForInviteToGetAccepted) {
    return;
  }
  processInput(AssistedInputKind.None, inputModifier);
}

export function didClickSquare(location: Location) {
  if (puzzleMode) {
    const didFastForward = Board.fastForwardInstructionsIfNeeded();
    if (didFastForward && location.i === -1 && location.j === -1) {
      return;
    }
  }
  if (!canHandleLiveBoardInput() || (isOnlineGame && !didConnect) || isWatchOnly || isGameOver || isWaitingForInviteToGetAccepted) {
    return;
  }
  processInput(AssistedInputKind.None, InputModifier.None, location);
}

function turnShouldBeConfirmedForOutputEvents(events: MonsWeb.EventModel[], fenBeforeMove: string): boolean {
  const wasFirstTurn = game.turn_number() === 2;
  const hasNextTurn = events.some((e) => e.kind === MonsWeb.EventModelKind.NextTurn);
  const hasGameOver = events.some((e) => e.kind === MonsWeb.EventModelKind.GameOver);
  const hasManaMove = events.some((e) => e.kind === MonsWeb.EventModelKind.ManaMove);

  if (wasFirstTurn || hasGameOver || !hasNextTurn || !hasManaMove) {
    return false;
  }

  const gameBeforeMove = MonsWeb.MonsGameModel.from_fen(fenBeforeMove)!;
  const moveKinds = gameBeforeMove.available_move_kinds();
  const monMovesCount = moveKinds[0];
  const actionsCount = moveKinds[2];
  const hasMoves = monMovesCount > 0;
  let actuallyHasPossibleAction = false;
  if (!hasMoves && actionsCount > 0) {
    const output = gameBeforeMove.process_input([]);
    if (output.kind === MonsWeb.OutputModelKind.LocationsToStartFrom) {
      const startLocations = output.locations();
      for (const loc of startLocations) {
        const nextOutput = gameBeforeMove.process_input([loc]);
        if (nextOutput.kind === MonsWeb.OutputModelKind.NextInputOptions) {
          const nextInputs = nextOutput.next_inputs();
          if (nextInputs.some((input) => input.kind === MonsWeb.NextInputKind.MysticAction || input.kind === MonsWeb.NextInputKind.DemonAction || input.kind === MonsWeb.NextInputKind.SpiritTargetCapture)) {
            actuallyHasPossibleAction = true;
            break;
          }
        }
      }
    }
  }
  return hasMoves || actuallyHasPossibleAction;
}

function applyOutput(
  takebackFensBeforeMove: string[],
  fenBeforeMove: string,
  output: MonsWeb.OutputModel,
  isRemoteInput: boolean,
  isBotInput: boolean,
  assistedInputKind: AssistedInputKind,
  inputLocation?: Location,
  inputColorBeforeMove?: MonsWeb.Color
) {
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
        const targetGameToConfirm = game;
        game = game.without_last_turn(takebackFensBeforeMove)!;
        const latestLocation = currentInputs[currentInputs.length - 1];

        playSounds([Sound.ConfirmEarlyEndTurn]);

        Board.showEndTurnConfirmationOverlay(
          game.active_color() === MonsWeb.Color.Black,
          latestLocation,
          () => {
            game = targetGameToConfirm;
            applyOutput([], "", output, isRemoteInput, isBotInput, assistedInputKind, inputLocation, inputColorBeforeMove);
          },
          () => {
            currentInputs = [];
            Board.removeHighlights();
          }
        );
        return;
      }

      if (isOnlineGame && !isRemoteInput) {
        connection.sendMove(moveFen, gameFen);
      }

      if (!isOnlineGame && !didStartLocalGame) {
        ensureLocalRematchSeriesInitialized();
        dismissBadgeAndNotificationBannerIfNeeded();
        didStartLocalGame = true;
        setHomeVisible(true);
        setIslandButtonDimmed(true);

        setBrushAndNavigationButtonDimmed(true);
        setUndoVisible(true);
        setInviteLinkActionVisible(false);
        setAutomatchVisible(false);
        setBotGameOptionVisible(false);
        if (!puzzleMode) {
          setNavigationListButtonVisible(false);
        }
        setAutomoveActionVisible(true);
        showMoveHistoryButton(true);
        if (!puzzleMode) {
          showResignButton();
        }
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
            if (!flashbackMode) {
              Board.indicateWaterSplash(from);
              Board.updateScore(game.white_score(), game.black_score(), game.winner_color(), resignedColor, winnerByTimerColor);
              if (isGameWithBot && inputColorBeforeMove !== undefined) {
                const currentTurnNumber = game.turn_number();
                if (!botScoreReactionPlayedTurns.has(currentTurnNumber)) {
                  const isBotScoring = inputColorBeforeMove === botPlayerColor;
                  const reactionVariations = isBotScoring ? botReactionVariationsWhenBotScores : botReactionVariationsWhenPlayerScores;
                  botScoreReactionPlayedTurns.add(currentTurnNumber);
                  if (Math.random() < botScoreReactionChance) {
                    playSounds([Sound.EmoteReceived]);
                    showVideoReaction(true, getRandomReactionVariation(reactionVariations));
                  }
                }
              }
            }
            mustReleaseHighlight = true;
            break;
          case MonsWeb.EventModelKind.MysticAction:
            if (!from || !to) break;
            sounds.push(Sound.MysticAbility);
            locationsToUpdate.push(from);
            locationsToUpdate.push(to);
            if (!flashbackMode) {
              Board.indicateElectricHit(to);
            }
            traces.push(new Trace(from, to));
            break;
          case MonsWeb.EventModelKind.DemonAction:
            if (!from || !to) break;
            sounds.push(Sound.DemonAbility);
            locationsToUpdate.push(from);
            locationsToUpdate.push(to);
            if (!flashbackMode) {
              Board.indicateFlameGround(to);
            }
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
            if (!flashbackMode) {
              Board.indicateSpiritAction(to);
            }
            traces.push(new Trace(from, to));
            break;
          case MonsWeb.EventModelKind.PickupBomb:
            if (!from) break;
            sounds.push(Sound.PickupBomb);
            locationsToUpdate.push(from);
            mustReleaseHighlight = true;
            break;
          case MonsWeb.EventModelKind.UsePotion:
            if (from && !flashbackMode) {
              Board.indicatePotionUsage(from, !isPlayerSideTurn());
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
            if (!flashbackMode) {
              Board.indicateBombExplosion(to);
            }
            traces.push(new Trace(from, to));
            break;
          case MonsWeb.EventModelKind.MonAwake:
            if (from) {
              locationsToUpdate.push(from);
            }
            break;
          case MonsWeb.EventModelKind.BombExplosion:
            sounds.push(Sound.Bomb);
            if (from && !flashbackMode) {
              Board.indicateBombExplosion(from);
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
                  showMoveHistoryButton(true);
                } else {
                  showTimerButtonProgressing(0, 90, true);
                }
              }
            }
            Board.hideTimerCountdownDigits();
            break;
          case MonsWeb.EventModelKind.Takeback:
            setNewBoard(false);
            playSounds([Sound.Undo]);
            Board.removeHighlights();
            Board.hideItemSelectionOrConfirmationOverlay();
            updateUndoButtonBasedOnGameState();
            syncInviteBotIntoLocalGameButton();
            triggerMoveHistoryPopupReload();
            return;
          case MonsWeb.EventModelKind.GameOver:
            const isVictory = !isOnlineGame || event.color === playerSideColor;

            if (isVictory) {
              sounds.push(Sound.Victory);
            } else {
              sounds.push(Sound.Defeat);
            }

            if (!isWatchOnly) {
              updateRatings(isVictory);
            }

            isGameOver = true;
            wagerOutcomeAnimationAllowed = !isWatchOnly;
            disableAndHideUndoResignAndTimerControls();
            Board.hideTimerCountdownDigits();
            showRematchInterface();
            syncWagerOutcome();

            if (puzzleMode) {
              Board.flashPuzzleSuccess();
              setPlaySamePuzzleAgainButtonVisible(true);

              if (selectedProblem) {
                markProblemCompleted(selectedProblem.id);
              }
            }

            if (didStartLocalGame) {
              setAutomoveActionVisible(false);
            }

            break;
        }
      }

      if (
        !isRemoteInput &&
        !isOnlineGame &&
        !isGameWithBot &&
        isCreateInviteRoute() &&
        inputColorBeforeMove === MonsWeb.Color.White &&
        game.turn_number() <= 2
      ) {
        didMakeFirstLocalPlayerMoveOnLocalBoard = true;
      }

      if (
        !isRemoteInput &&
        !isOnlineGame &&
        !isGameWithBot &&
        isCreateInviteRoute() &&
        inputColorBeforeMove === MonsWeb.Color.Black &&
        game.turn_number() > 2
      ) {
        isInviteBotIntoLocalGameUnavailable = true;
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

      if (!flashbackMode) {
        if (game.winner_color() !== undefined || resignedColor !== undefined) {
          Board.hideAllMoveStatuses();
        } else {
          updateBoardMoveStatuses();
        }
      }

      if (!flashbackMode && (isRemoteInput || isBotInput)) {
        for (const trace of traces) {
          Board.drawTrace(trace);
        }
      }

      playSounds(sounds);

      if (!flashbackMode && popOpponentsEmoji) {
        Board.popOpponentsEmoji();
      }

      if (mightKeepHighlightOnLocation !== undefined && !mustReleaseHighlight) {
        processInput(AssistedInputKind.KeepSelectionAfterMove, InputModifier.None, mightKeepHighlightOnLocation);
      }

      if (!isGameOver) {
        if (isGameWithBot && game.active_color() === botPlayerColor) {
          const botTurnGuard = getSessionGuard();
          setManagedGameTimeout(() => {
            if (isGameOver || !isGameWithBot || game.active_color() !== botPlayerColor) {
              return;
            }
            automove();
          }, botTurnComputationDelayMs, botTurnGuard);
        } else if (isBotsRoute()) {
          automove();
        }
      }

      if (isGameWithBot && !isPlayerSideTurn()) {
        setAutomoveActionEnabled(false);
      }

      if (isBotsRoute() && isGameOver) {
        const rematchGuard = getSessionGuard();
        setManagedGameTimeout(() => rematchInLoopMode(), 1150, rematchGuard);
      }

      updateUndoButtonBasedOnGameState();
      syncInviteBotIntoLocalGameButton();

      triggerMoveHistoryPopupReload();

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
  setNewBoard(false);
  playSounds([Sound.Undo]);
  Board.removeHighlights();
  Board.hideItemSelectionOrConfirmationOverlay();
  updateUndoButtonBasedOnGameState();
}

export function didClickAutomoveButton() {
  if (!canHandleLiveBoardInput()) return;
  if (isGameOver) return;
  automove(true);
}

function hasBothEthOrSolAddresses(): boolean {
  const playerSide = Board.playerSideMetadata.ethAddress ?? Board.playerSideMetadata.solAddress;
  const opponentSide = Board.opponentSideMetadata.ethAddress ?? Board.opponentSideMetadata.solAddress;
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
      showMoveHistoryButton(true);
    }
  }
}

function updateRatings(isWin: boolean) {
  if (!isOnlineGame) {
    return;
  }

  connection.resolveWagerOutcome(isWin);

  if (!connection.isAutomatch()) {
    return;
  }

  connection.updateRatings();

  if (!hasBothEthOrSolAddresses()) {
    return;
  }

  const playerSide = Board.playerSideMetadata.uid;
  const opponentSide = Board.opponentSideMetadata.uid;
  const victoryUid = isWin ? playerSide : opponentSide;
  const defeatUid = isWin ? opponentSide : playerSide;

  if (victoryUid && defeatUid) {
    recalculateRatingsLocallyForUids(victoryUid, defeatUid);
    Board.recalculateDisplayNames();
  }
}

function resetWagerStateForMatch(matchId: string | null) {
  if (wagerMatchId === matchId) {
    return;
  }
  wagerMatchId = matchId;
  wagerOutcomeShown = false;
  wagerOutcomeAnimating = false;
  wagerOutcomeAnimationAllowed = false;
  if (wagerOutcomeAnimTimer !== null) {
    clearManagedGameTimeout(wagerOutcomeAnimTimer);
    wagerOutcomeAnimTimer = null;
  }
  setCurrentWagerMatch(matchId);
  currentWagerState = getWagerState();
  Board.clearWagerPilesForNewMatch();
}

function normalizeWagerStakeCount(countValue: unknown, totalValue: unknown): number {
  const count = Math.round(Number(countValue));
  if (Number.isFinite(count) && count > 0) {
    return count;
  }
  const total = Math.round(Number(totalValue));
  if (Number.isFinite(total) && total > 0) {
    return Math.max(0, Math.round(total / 2));
  }
  return 0;
}

function applyWagerState() {
  logWagerDebug("apply:start", { state: summarizeWagerState(currentWagerState) });
  if (boardViewMode === "waitingLive") {
    logWagerDebug("apply:clear-waiting-live");
    Board.clearWagerPilesForNewMatch();
    return;
  }
  if (boardViewMode !== "activeLive" && boardViewMode !== "historicalView") {
    logWagerDebug("apply:clear-non-live-view");
    Board.clearWagerPilesForNewMatch();
    return;
  }
  const isHistoricalView = boardViewMode === "historicalView";
  if (!currentWagerState) {
    logWagerDebug("apply:clear-no-state");
    Board.clearWagerPiles();
    return;
  }

  if (currentWagerState.resolved) {
    if (isGameOver || isReconnect || isWatchOnly || isHistoricalView) {
      const outcomeState = syncWagerOutcome();
      logWagerDebug("apply:resolved-branch", { outcomeState });
      if (outcomeState === "shown" || outcomeState === "deferred") {
        return;
      }
    } else {
      logWagerDebug("apply:resolved-skipped-not-eligible");
      return;
    }
  }

  if (currentWagerState.agreed && currentWagerState.agreed.material) {
    const stakeCount = normalizeWagerStakeCount(currentWagerState.agreed.count, currentWagerState.agreed.total);
    if (stakeCount > 0) {
      logWagerDebug("apply:show-agreed", { material: currentWagerState.agreed.material, stakeCount });
      Board.setWagerPiles({
        player: { material: currentWagerState.agreed.material, count: stakeCount, pending: false },
        opponent: { material: currentWagerState.agreed.material, count: stakeCount, pending: false },
      });
      return;
    }
  }
  if (isHistoricalView) {
    logWagerDebug("apply:clear-historical-non-settled");
    Board.clearWagerPiles();
    return;
  }

  const proposals = currentWagerState.proposals || {};
  const playerUid = Board.playerSideMetadata.uid;
  const opponentUid = Board.opponentSideMetadata.uid;
  const playerProposal = playerUid && proposals[playerUid] ? proposals[playerUid] : null;
  const opponentProposal = opponentUid && proposals[opponentUid] ? proposals[opponentUid] : null;
  if (!playerProposal && !opponentProposal) {
    logWagerDebug("apply:clear-no-proposals");
    Board.clearWagerPiles();
    return;
  }
  logWagerDebug("apply:show-proposals", {
    playerProposal: playerProposal ? { material: playerProposal.material, count: playerProposal.count } : null,
    opponentProposal: opponentProposal ? { material: opponentProposal.material, count: opponentProposal.count } : null,
    playerUid,
    opponentUid,
  });
  Board.setWagerPiles({
    player: playerProposal ? { material: playerProposal.material, count: playerProposal.count, pending: true } : null,
    opponent: opponentProposal ? { material: opponentProposal.material, count: opponentProposal.count, pending: true } : null,
  });
}

function syncWagerOutcome(): "shown" | "deferred" | "invalid" {
  if (!currentWagerState || !currentWagerState.resolved) {
    logWagerDebug("sync:invalid-missing-resolved");
    return "invalid";
  }
  const resolved = currentWagerState.resolved;
  const material = resolved.material || currentWagerState.agreed?.material || null;
  if (!material) {
    logWagerDebug("sync:invalid-missing-material", { resolved: summarizeWagerState(currentWagerState).resolved });
    return "invalid";
  }
  const stakeCount = normalizeWagerStakeCount(resolved.count, resolved.total ?? currentWagerState.agreed?.total);
  if (!stakeCount) {
    logWagerDebug("sync:invalid-zero-stake", { resolved: summarizeWagerState(currentWagerState).resolved });
    return "invalid";
  }
  const winnerIsOpponent = resolved.winnerId === Board.opponentSideMetadata.uid;
  const shouldAnimate = isGameOver && wagerOutcomeAnimationAllowed && !isWatchOnly && !wagerOutcomeShown;
  logWagerDebug("sync:computed", {
    material,
    stakeCount,
    winnerIsOpponent,
    shouldAnimate,
    winnerId: resolved.winnerId,
    boardOpponentUid: Board.opponentSideMetadata.uid,
    boardPlayerUid: Board.playerSideMetadata.uid,
    wagerOutcomeShown,
    wagerOutcomeAnimating,
    wagerOutcomeAnimationAllowed,
  });
  if (shouldAnimate) {
    if (wagerOutcomeAnimating) {
      logWagerDebug("sync:deferred-animating");
      return "deferred";
    }
    wagerOutcomeAnimating = true;
    if (wagerOutcomeAnimTimer !== null) {
      clearManagedGameTimeout(wagerOutcomeAnimTimer);
    }
    Board.showResolvedWager(winnerIsOpponent, material, stakeCount, true);
    wagerOutcomeShown = true;
    const wagerOutcomeGuard = getSessionGuard();
    wagerOutcomeAnimTimer = setManagedGameTimeout(() => {
      wagerOutcomeAnimating = false;
      wagerOutcomeAnimTimer = null;
    }, 900, wagerOutcomeGuard);
    logWagerDebug("sync:shown-animated");
    return "shown";
  }
  if (wagerOutcomeAnimating) {
    logWagerDebug("sync:deferred-existing-animation");
    return "deferred";
  }
  Board.showResolvedWager(winnerIsOpponent, material, stakeCount, false);
  logWagerDebug("sync:shown-static");
  return "shown";
}

function processInput(assistedInputKind: AssistedInputKind, inputModifier: InputModifier, inputLocation?: Location) {
  if (!canHandleLiveBoardInput()) {
    return;
  }
  if (isBotsRoute()) {
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
  const inputColorBeforeMove = game.active_color();
  const fenBeforeMove = game.fen();
  const takebacksBeforeMove = game.takeback_fens();
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
  applyOutput(takebacksBeforeMove, fenBeforeMove, output, false, false, assistedInputKind, inputLocation, inputColorBeforeMove);
}

function updateLocation(location: Location, inFlashbackMode: boolean = false) {
  if (boardViewMode === "historicalView" && !inFlashbackMode) {
    if (boardViewDebugLogsEnabled) {
      console.warn("[board-view] blocked live location repaint during historicalView");
    }
    return;
  }
  if (flashbackMode && !inFlashbackMode) {
    return;
  }
  if (boardViewMode === "waitingLive" && !inFlashbackMode) {
    return;
  }

  const displayGame = flashbackMode ? flashbackStateGame : game;

  Board.removeItem(location);
  const item = displayGame.item(new MonsWeb.Location(location.i, location.j));
  if (item !== undefined) {
    Board.putItem(item, location);
  } else {
    const square = displayGame.square(new MonsWeb.Location(location.i, location.j));
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
  ensureBoardViewInvariants("didConnectTo:before");
  const shouldRenderLiveBoard = !shouldPreserveHistoricalViewForCurrentInvite();
  if (shouldRenderLiveBoard) {
    clearViewedRematchState();
    boardViewMode = "activeLive";
    nextBoardRenderSession();
    applyBoardUiForCurrentView();
  }
  resetWagerStateForMatch(matchId);
  resetBotScoreReactionState();
  resetLocalRematchSeriesState();
  isOnlineGame = true;
  currentInputs = [];
  if (shouldRenderLiveBoard) {
    applyBoardUiForCurrentView();
    Board.resetForNewGame();
  }

  if (shouldRenderLiveBoard && isOnlineGame) {
    if (!isWatchOnly && !isGameOver && !connection.rematchSeriesEndIsIndicated()) {
      showVoiceReactionButton(true);
    } else {
      showVoiceReactionButton(false);
    }
  }

  if (isWatchOnly) {
    playerSideColor = MonsWeb.Color.White;
    if (shouldRenderLiveBoard) {
      Board.setupPlayerId(matchPlayerUid, match.color === "black");
    }
  } else {
    playerSideColor = match.color === "white" ? MonsWeb.Color.Black : MonsWeb.Color.White;
    if (shouldRenderLiveBoard) {
      Board.setupPlayerId(matchPlayerUid, true);
    }
  }

  if (!isWatchOnly && shouldRenderLiveBoard) {
    Board.setBoardFlipped(match.color === "white");
  }

  if (shouldRenderLiveBoard) {
    Board.updateEmojiAndAuraIfNeeded(match.emojiId.toString(), match.aura, isWatchOnly ? match.color === "black" : true);
    applyWagerState();
    Board.markWagerInitialStateReceived();
  }

  if (!isReconnect || (isReconnect && !game.is_later_than(match.fen)) || isWatchOnly) {
    const gameFromFen = MonsWeb.MonsGameModel.from_fen(match.fen);
    if (!gameFromFen) return;
    game = gameFromFen;
    if (game.winner_color() !== undefined) {
      disableAndHideUndoResignAndTimerControls();
      Board.hideTimerCountdownDigits();
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

  if (shouldRenderLiveBoard) {
    setNewBoard(false);
    updateUndoButtonBasedOnGameState();
    const thereIsWinner = game.winner_color() !== undefined;

    if (match.status === "surrendered") {
      handleResignStatus(true, match.color);
    } else if (!isWatchOnly && !isGameOver && !thereIsWinner) {
      showResignButton();
      showMoveHistoryButton(true);
      if (isPlayerSideTurn()) {
        hideTimerButtons();
        setUndoVisible(true);
        setAutomoveActionVisible(true);
      } else {
        showTimerButtonProgressing(0, 90, true);
      }
    }
  }
  if (!shouldRenderLiveBoard && match.status === "surrendered") {
    handleResignStatusWithoutRender(true, match.color);
  }

  updateDisplayedTimerIfNeeded(true, match, matchId);
  ensureBoardViewInvariants("didConnectTo:after");
  void preloadRematchSeriesScores();
  triggerMoveHistoryPopupReload();
}

function getTimerStateFromStashes(): { timer: string | null; timerColor: string } | null {
  if (isReconnect || isWatchOnly) {
    if (blackTimerStash === null || whiteTimerStash === null) {
      return null;
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
    return null;
  }
  return { timer, timerColor };
}

function applyTimerStateFromStashes(onConnect: boolean) {
  if (boardViewMode !== "activeLive") {
    return;
  }
  const timerState = getTimerStateFromStashes();
  if (!timerState) {
    return;
  }
  showTimerCountdown(onConnect, timerState.timer, timerState.timerColor);
}

function updateDisplayedTimerIfNeeded(onConnect: boolean, match: Match, matchId: string) {
  if (timerStashMatchId !== matchId) {
    resetTimerStateForMatch(matchId);
  }
  if (match.color === "white") {
    whiteTimerStash = match.timer;
  } else {
    blackTimerStash = match.timer;
  }
  const timerState = getTimerStateFromStashes();
  if (!timerState) {
    return;
  }
  if (boardViewMode !== "activeLive") {
    if (timerState.timer === "gg") {
      pendingTimerResolutionOnRestore = onConnect;
    }
    return;
  }
  pendingTimerResolutionOnRestore = null;
  showTimerCountdown(onConnect, timerState.timer, timerState.timerColor);
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
        Board.showTimer(timerColor, delta);
        if (!isWatchOnly && !isPlayerSideTurn()) {
          const target = 90;
          showTimerButtonProgressing(target - delta, target, false);
          const timerClaimGuard = getSessionGuard();
          const timerClaimMatchId = connection.getActiveMatchId();
          setManagedGameTimeout(() => {
            if (timerClaimMatchId !== null && connection.getActiveMatchId() !== timerClaimMatchId) {
              return;
            }
            if (game.turn_number() === turnNumber) {
              enableTimerVictoryClaim();
            }
          }, delta * 1000, timerClaimGuard);
        }
      }
    }
  }
}

function updateUndoButtonBasedOnGameState() {
  setUndoEnabled(canHandleUndo());
}

function updateBoardMoveStatuses(gameModel: MonsWeb.MonsGameModel = game) {
  if (boardViewMode === "waitingLive") {
    Board.hideAllMoveStatuses();
    return;
  }
  Board.updateMoveStatuses(gameModel.active_color(), gameModel.available_move_kinds(), gameModel.inactive_player_items_counters());
}

function setNewBoard(inFlashbackMode: boolean) {
  if (boardViewMode === "historicalView" && !inFlashbackMode) {
    if (boardViewDebugLogsEnabled) {
      console.warn("[board-view] blocked live board repaint during historicalView");
    }
    return;
  }
  if (flashbackMode && !inFlashbackMode) {
    return;
  }
  if (boardViewMode === "waitingLive" && !inFlashbackMode) {
    return;
  }

  const displayGame = flashbackMode ? flashbackStateGame : game;
  const showTerminalIndicators = shouldShowTerminalIndicators(inFlashbackMode, displayGame);
  const displayResignedColor = showTerminalIndicators ? getDisplayResignedColor(inFlashbackMode) : undefined;
  const displayWinnerByTimerColor = showTerminalIndicators ? getDisplayWinnerByTimerColor(inFlashbackMode) : undefined;
  Board.updateScore(displayGame.white_score(), displayGame.black_score(), displayGame.winner_color(), displayResignedColor, displayWinnerByTimerColor);
  if (!flashbackMode && (displayGame.winner_color() !== undefined || resignedColor !== undefined)) {
    Board.hideAllMoveStatuses();
    disableAndHideUndoResignAndTimerControls();
    showRematchInterface();
  } else {
    updateBoardMoveStatuses(displayGame);
  }
  const locationsWithContent = displayGame.locations_with_content().map((loc) => new Location(loc.i, loc.j));
  Board.removeItemsNotPresentIn(locationsWithContent);
  locationsWithContent.forEach((loc) => {
    const location = new Location(loc.i, loc.j);
    updateLocation(location, inFlashbackMode);
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
  wagerOutcomeAnimationAllowed = !onConnect;

  Board.hideTimerCountdownDigits();
  disableAndHideUndoResignAndTimerControls();
  Board.hideAllMoveStatuses();

  Board.removeHighlights();
  Board.hideItemSelectionOrConfirmationOverlay();

  winnerByTimerColor = winnerColor === "white" ? MonsWeb.Color.White : MonsWeb.Color.Black;
  Board.updateScore(game.white_score(), game.black_score(), game.winner_color(), resignedColor, winnerByTimerColor);
  showRematchInterface();
  syncWagerOutcome();

  if (justClaimedByYourself) {
    playSounds([Sound.Victory]);
    updateRatings(true);
  } else if (!onConnect) {
    if (!isWatchOnly) {
      playSounds([Sound.Defeat]);
      updateRatings(false);
    }
  }
}

function handleResignStatusWithoutRender(onConnect: boolean, resignSenderColor: string) {
  if (isGameOver) {
    return;
  }
  if (game.winner_color() !== undefined || winnerByTimerColor !== undefined) {
    isGameOver = true;
    syncInviteBotIntoLocalGameButton();
    resignedColor = undefined;
    return;
  }
  const justConfirmedResignYourself = resignSenderColor === "";
  isGameOver = true;
  syncInviteBotIntoLocalGameButton();
  wagerOutcomeAnimationAllowed = !onConnect;
  if (justConfirmedResignYourself) {
    resignedColor = playerSideColor;
    playSounds([Sound.Defeat]);
    updateRatings(false);
  } else {
    resignedColor = resignSenderColor === "white" ? MonsWeb.Color.White : MonsWeb.Color.Black;
  }
  if (!onConnect && !justConfirmedResignYourself) {
    playSounds([Sound.Victory]);
    if (!isWatchOnly) {
      updateRatings(true);
    }
  }
}

function handleResignStatus(onConnect: boolean, resignSenderColor: string) {
  if (isGameOver) {
    return;
  }
  if (game.winner_color() !== undefined || winnerByTimerColor !== undefined) {
    isGameOver = true;
    syncInviteBotIntoLocalGameButton();
    resignedColor = undefined;
    return;
  }

  const justConfirmedResignYourself = resignSenderColor === "";
  isGameOver = true;
  syncInviteBotIntoLocalGameButton();
  wagerOutcomeAnimationAllowed = !onConnect;

  if (justConfirmedResignYourself) {
    resignedColor = playerSideColor;
    playSounds([Sound.Defeat]);
    updateRatings(false);
  } else {
    resignedColor = resignSenderColor === "white" ? MonsWeb.Color.White : MonsWeb.Color.Black;
  }

  if (!onConnect && !justConfirmedResignYourself) {
    playSounds([Sound.Victory]);
    if (!isWatchOnly) {
      updateRatings(true);
    }
  }

  Board.hideTimerCountdownDigits();
  disableAndHideUndoResignAndTimerControls();
  Board.hideAllMoveStatuses();

  Board.removeHighlights();
  Board.hideItemSelectionOrConfirmationOverlay();

  if (!onConnect || (didSetWhiteProcessedMovesCount && didSetBlackProcessedMovesCount)) {
    Board.updateScore(game.white_score(), game.black_score(), game.winner_color(), resignedColor, winnerByTimerColor);
  }
  showRematchInterface();
  syncWagerOutcome();
}

export function didClickInviteActionButtonBeforeThereIsInviteReady() {
  if (!isCreateInviteRoute()) return;
  setHomeVisible(true);
  setIslandButtonDimmed(true);

  setBrushAndNavigationButtonDimmed(true);
  setAutomatchVisible(false);
  setBotGameOptionVisible(false);
  dismissBadgeAndNotificationBannerIfNeeded();
  setNavigationListButtonVisible(false);
  setAutomoveActionVisible(false);
  showMoveHistoryButton(false);
  Board.hideBoardPlayersInfo();
  Board.removeHighlights();
  Board.hideAllMoveStatuses();
  isWaitingForInviteToGetAccepted = true;
  Board.runMonsBoardAsDisplayWaitingAnimation();
}

export function showPuzzleInstructions() {
  const text = selectedProblem!.description;
  Board.showInstructionsText(text);
}

export function cleanupCurrentInputs() {
  currentInputs = [];
}

export function resumeTutorialFromBanner() {
  didSelectPuzzle(getInitialProblem());
}

export function didSelectPuzzle(problem: Problem, skipInstructions: boolean = false) {
  dismissBadgeAndNotificationBannerIfNeeded();
  showPrimaryAction(PrimaryActionType.None);
  setPlaySamePuzzleAgainButtonVisible(false);
  isGameOver = false;
  currentInputs = [];

  const gameFromFen = MonsWeb.MonsGameModel.from_fen(problem.fen);
  if (!gameFromFen) return;
  game = gameFromFen;
  didStartLocalGame = true;
  setHomeVisible(true);
  setIslandButtonDimmed(true);

  setBrushAndNavigationButtonDimmed(true);
  setUndoVisible(true);
  setInviteLinkActionVisible(false);
  setAutomatchVisible(false);
  setBotGameOptionVisible(false);
  showVoiceReactionButton(true);
  closeNavigationAndAppearancePopupIfAny();

  setNewBoard(false);

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
  const activeMatchId = connection.getActiveMatchId();
  if (!activeMatchId || activeMatchId !== matchId) {
    return;
  }
  ensureBoardViewInvariants("didReceiveMatchUpdate:start");
  if (!didConnect) {
    isWaitingForInviteToGetAccepted = false;
    if (boardViewMode !== "historicalView") {
      Board.stopMonsBoardAsDisplayAnimations();
      showWaitingStateText("");
      setEndMatchVisible(false);
      setAutomoveActionVisible(false);
      showMoveHistoryButton(false);
      setInviteLinkActionVisible(false);
      setAutomatchVisible(false);
      setBotGameOptionVisible(false);
      setNavigationListButtonVisible(false);
      setEndMatchVisible(false);
      showPrimaryAction(PrimaryActionType.None);
    }
    const wasWaitingForRematchResponse = isWaitingForRematchResponse;
    isWaitingForRematchResponse = false;
    didConnectTo(match, matchPlayerUid, matchId);
    didConnect = true;
    if ((!isReconnect || wasWaitingForRematchResponse) && !isGameOver && !isWatchOnly) {
      playSounds([Sound.DidConnect]);
    }
    return;
  }

  const shouldRenderLiveBoard = boardViewMode !== "historicalView";
  let didMutateLiveGameWithoutRender = false;
  const isOpponentSide = isWatchOnly ? match.color === "black" : true;
  if (shouldRenderLiveBoard) {
    Board.setupPlayerId(matchPlayerUid, isOpponentSide);
    Board.updateEmojiAndAuraIfNeeded(match.emojiId.toString(), match.aura, isOpponentSide);
    applyWagerState();
    if (isGameOver) {
      syncWagerOutcome();
    }
  }

  if (match.reaction && match.reaction.uuid && !processedVoiceReactions.has(match.reaction.uuid)) {
    processedVoiceReactions.add(match.reaction.uuid);
    if (shouldRenderLiveBoard) {
      const currentTime = Date.now();
      const watchOnlyAllowed = isWatchOnly ? didSetWhiteProcessedMovesCount && didSetBlackProcessedMovesCount : false;
      const regularAllowed = isWatchOnly ? false : currentTime - lastReactionTime > 5000;
      if (watchOnlyAllowed || regularAllowed) {
        const showReactionAtOpponentSide = isWatchOnly ? isOpponentSide : true;
        if (match.reaction.kind === "sticker") {
          playSounds([Sound.EmoteReceived]);
          showVideoReaction(showReactionAtOpponentSide, match.reaction.variation);
        } else {
          Board.showVoiceReactionText(match.reaction.kind, showReactionAtOpponentSide);
          playReaction(match.reaction);
        }
        lastReactionTime = currentTime;
      }
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
        Board.hideTimerCountdownDigits();
      }
      setNewBoard(false);
    }

    verifyMovesIfNeeded(matchId, match.flatMovesString, match.color);
    setProcessedMovesCountForColor(match.color, movesCount);
  }

  const processedMovesCount = getProcessedMovesCount(match.color);
  if (movesCount > processedMovesCount) {
    const movesFens = movesFensArray(match);
    let nextProcessedMovesCount = processedMovesCount;
    if (shouldRenderLiveBoard) {
      for (let i = processedMovesCount; i < movesCount; i++) {
        const moveFen = movesFens[i];
        const output = game.process_input_fen(moveFen);
        applyOutput([], "", output, true, false, AssistedInputKind.None);
        nextProcessedMovesCount = i + 1;
      }
    } else {
      didMutateLiveGameWithoutRender = true;
      for (let i = processedMovesCount; i < movesCount; i++) {
        const moveFen = movesFens[i];
        const output = game.process_input_fen(moveFen);
        if (output.kind === MonsWeb.OutputModelKind.InvalidInput) {
          const gameFromFen = MonsWeb.MonsGameModel.from_fen(match.fen);
          if (gameFromFen) {
            game = gameFromFen;
            nextProcessedMovesCount = movesCount;
          }
          break;
        }
        nextProcessedMovesCount = i + 1;
      }
    }

    setProcessedMovesCountForColor(match.color, nextProcessedMovesCount);

    if (match.fen !== game.fen()) {
      console.log("fens do not match");
    }
    if (!shouldRenderLiveBoard && game.winner_color() !== undefined) {
      isGameOver = true;
    }
  }

  if (match.status === "surrendered") {
    if (shouldRenderLiveBoard) {
      handleResignStatus(didNotHaveBothMatchesSetupBeforeThisUpdate, match.color);
    } else {
      didMutateLiveGameWithoutRender = true;
      handleResignStatusWithoutRender(didNotHaveBothMatchesSetupBeforeThisUpdate, match.color);
    }
  }

  if (didMutateLiveGameWithoutRender) {
    triggerMoveHistoryPopupReload();
  }
  updateDisplayedTimerIfNeeded(didNotHaveBothMatchesSetupBeforeThisUpdate, match, matchId);
}

export function didRecoverMyMatch(match: Match, matchId: string) {
  const activeMatchId = connection.getActiveMatchId();
  if (!activeMatchId || activeMatchId !== matchId) {
    return;
  }
  ensureBoardViewInvariants("didRecoverMyMatch:before");
  const shouldRenderLiveBoard = !shouldPreserveHistoricalViewForCurrentInvite();
  if (shouldRenderLiveBoard) {
    clearViewedRematchState();
    boardViewMode = "activeLive";
    nextBoardRenderSession();
  }
  setWatchOnlyState(false);
  setWatchOnlyVisible(false);
  isReconnect = true;
  resetWagerStateForMatch(matchId);
  resetBotScoreReactionState();

  playerSideColor = match.color === "white" ? MonsWeb.Color.White : MonsWeb.Color.Black;
  const gameFromFen = MonsWeb.MonsGameModel.from_fen(match.fen);
  if (!gameFromFen) return;
  game = gameFromFen;
  if (game.winner_color() !== undefined) {
    disableAndHideUndoResignAndTimerControls();
    Board.hideTimerCountdownDigits();
  }
  verifyMovesIfNeeded(matchId, match.flatMovesString, match.color);
  const movesCount = movesCountOfMatch(match);
  setProcessedMovesCountForColor(match.color, movesCount);
  if (shouldRenderLiveBoard) {
    Board.updateEmojiAndAuraIfNeeded(match.emojiId.toString(), match.aura, false);
    applyWagerState();
    Board.markWagerInitialStateReceived();
  }

  if (match.status === "surrendered") {
    if (shouldRenderLiveBoard) {
      handleResignStatus(true, match.color);
    } else {
      handleResignStatusWithoutRender(true, match.color);
    }
  }

  updateDisplayedTimerIfNeeded(true, match, matchId);
  ensureBoardViewInvariants("didRecoverMyMatch:after");
  void preloadRematchSeriesScores();
}

export function enterWatchOnlyMode() {
  setWatchOnlyState(true);
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
