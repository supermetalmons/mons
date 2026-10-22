import type * as MonsRules from "mons-rules";
import type { Match } from "../connection/connectionModels";
import {
  movesArrayForHistoryVerification,
  normalizePersistedMoveHistory,
} from "./historicalMatchModels";

interface RemoteMoveSyncDependencies {
  getGame: () => MonsRules.Game;
  getActiveMatchId: () => string | null;
  createSessionGuard: () => () => boolean;
  isGameOver: () => boolean;
  onReplayOutput: (output: MonsRules.InputResolution) => void;
}

type RemoteMoveHistory = {
  match: Match;
  moves: readonly string[];
  flatMovesString: string;
};

export const createRemoteMoveSyncController = (
  deps: RemoteMoveSyncDependencies,
) => {
  const histories = new Map<string, RemoteMoveHistory>();
  let historiesMatchId: string | null = null;
  let whiteProcessedMovesCount = 0;
  let blackProcessedMovesCount = 0;
  let didSetWhiteProcessedMovesCount = false;
  let didSetBlackProcessedMovesCount = false;
  let currentGameModelMatchId: string | null = null;
  let whiteFlatMovesString: string | null = null;
  let blackFlatMovesString: string | null = null;

  const clearHistories = (): void => {
    histories.clear();
    historiesMatchId = null;
  };

  const resetProgress = (): void => {
    whiteProcessedMovesCount = 0;
    blackProcessedMovesCount = 0;
    didSetWhiteProcessedMovesCount = false;
    didSetBlackProcessedMovesCount = false;
    currentGameModelMatchId = null;
    whiteFlatMovesString = null;
    blackFlatMovesString = null;
  };

  const getProcessedCount = (color: string): number =>
    color === "white" ? whiteProcessedMovesCount : blackProcessedMovesCount;

  const setProcessedCount = (color: string, count: number): void => {
    if (color === "white") {
      whiteProcessedMovesCount = count;
      didSetWhiteProcessedMovesCount = true;
    } else {
      blackProcessedMovesCount = count;
      didSetBlackProcessedMovesCount = true;
    }
  };

  const setProcessedCounts = (
    whiteMovesCount: number,
    blackMovesCount: number,
  ): void => {
    whiteProcessedMovesCount = whiteMovesCount;
    blackProcessedMovesCount = blackMovesCount;
    didSetWhiteProcessedMovesCount = true;
    didSetBlackProcessedMovesCount = true;
  };

  const hasInitializedBothSides = (): boolean =>
    didSetWhiteProcessedMovesCount && didSetBlackProcessedMovesCount;

  const bindVerifiedGame = (matchId: string): void => {
    currentGameModelMatchId = matchId;
    whiteFlatMovesString = null;
    blackFlatMovesString = null;
  };

  const verifyHistory = (
    game: MonsRules.Game,
    matchId: string,
    flatMovesString: unknown,
    color: string,
  ): boolean => {
    if (currentGameModelMatchId === matchId && game.historyVerified) {
      return false;
    }
    const normalizedMoves = normalizePersistedMoveHistory(flatMovesString);
    if (normalizedMoves === null) {
      return false;
    }
    if (currentGameModelMatchId !== matchId) {
      currentGameModelMatchId = matchId;
      whiteFlatMovesString = null;
      blackFlatMovesString = null;
    }
    if (color === "white") {
      whiteFlatMovesString = normalizedMoves;
    } else {
      blackFlatMovesString = normalizedMoves;
    }
    if (whiteFlatMovesString !== null && blackFlatMovesString !== null) {
      const result = game.verifyHistory({
        white: movesArrayForHistoryVerification(whiteFlatMovesString),
        black: movesArrayForHistoryVerification(blackFlatMovesString),
      });
      if (result) {
        bindVerifiedGame(matchId);
        return true;
      }
    }
    return false;
  };

  const remember = (match: Match, matchId: string): boolean => {
    const flatMovesString = normalizePersistedMoveHistory(
      match.flatMovesString,
    );
    if (
      flatMovesString === null ||
      (match.color !== "white" && match.color !== "black")
    ) {
      return false;
    }
    if (historiesMatchId !== matchId) {
      clearHistories();
      historiesMatchId = matchId;
    }
    const previous = histories.get(match.color);
    if (
      previous &&
      previous.flatMovesString !== "" &&
      flatMovesString !== previous.flatMovesString &&
      !flatMovesString.startsWith(`${previous.flatMovesString}-`)
    ) {
      return false;
    }
    histories.set(match.color, {
      match:
        previous?.match.status === "surrendered"
          ? { ...match, status: "surrendered" }
          : { ...match },
      flatMovesString,
      moves:
        previous?.flatMovesString === flatMovesString
          ? previous.moves
          : movesArrayForHistoryVerification(flatMovesString),
    });
    return true;
  };

  const hasPendingMoves = (): boolean =>
    [...histories.entries()].some(
      ([color, history]) => getProcessedCount(color) < history.moves.length,
    );

  const getSurrenderedMatchWhenDrained = (): Match | undefined =>
    !hasPendingMoves()
      ? [...histories.values()].find(
          (history) => history.match.status === "surrendered",
        )?.match
      : undefined;

  const drain = (matchId: string, shouldRenderLiveBoard: boolean): boolean => {
    const sessionGuard = deps.createSessionGuard();
    const activeGame = deps.getGame();
    const remainingMoves = [...histories.entries()].reduce(
      (total, [color, history]) =>
        total + Math.max(0, history.moves.length - getProcessedCount(color)),
      0,
    );
    let didMutate = false;
    for (let step = 0; step < remainingMoves; step++) {
      if (
        !sessionGuard() ||
        deps.getActiveMatchId() !== matchId ||
        deps.getGame() !== activeGame ||
        deps.isGameOver() ||
        activeGame.winner !== undefined
      ) {
        break;
      }
      const color = activeGame.activeColor;
      const processedMovesCount = getProcessedCount(color);
      const moveFen = histories.get(color)?.moves[processedMovesCount];
      if (moveFen === undefined) {
        break;
      }
      const output = activeGame.playFen(moveFen);
      if (output.kind !== "complete") {
        break;
      }
      setProcessedCount(color, processedMovesCount + 1);
      didMutate = true;
      if (shouldRenderLiveBoard) {
        deps.onReplayOutput(output);
      }
    }
    return didMutate;
  };

  return {
    clearHistories,
    resetProgress,
    getProcessedCount,
    setProcessedCount,
    setProcessedCounts,
    hasInitializedBothSides,
    bindVerifiedGame,
    verifyHistory,
    remember,
    hasPendingMoves,
    getSurrenderedMatchWhenDrained,
    drain,
  };
};
