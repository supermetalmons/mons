import { MatchWagerState } from "../connection/connectionModels";

type WagerStateListener = (state: MatchWagerState | null) => void;

let currentMatchId: string | null = null;
let currentState: MatchWagerState | null = null;

const listeners = new Set<WagerStateListener>();

const notify = () => {
  const snapshot = currentState;
  listeners.forEach((listener) => listener(snapshot));
};

export const setCurrentWagerMatch = (matchId: string | null) => {
  if (currentMatchId === matchId) return;
  currentMatchId = matchId;
  currentState = null;
  notify();
};

export const setWagerState = (matchId: string | null, state: MatchWagerState | null) => {
  if (!matchId || (currentMatchId && matchId !== currentMatchId)) {
    return;
  }
  currentState = state;
  notify();
};

export const getWagerState = () => currentState;

export const subscribeToWagerState = (listener: WagerStateListener) => {
  listeners.add(listener);
  listener(currentState);
  return () => {
    listeners.delete(listener);
  };
};
