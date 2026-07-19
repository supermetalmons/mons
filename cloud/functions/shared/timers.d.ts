export const MATCH_TIMER_DURATION_MS: 90000;
export const MATCH_TIMER_DURATION_SECONDS: 90;
export const MATCH_TIMER_TERMINAL: "gg";

export interface ParsedMatchTimer {
  turnNumber: number;
  targetTimestamp: number;
}

export function formatMatchTimer(
  turnNumber: number,
  targetTimestamp: number,
): string;
export function parseMatchTimer(value: unknown): ParsedMatchTimer | null;
export function isMatchTimerTerminal(
  value: unknown,
): value is typeof MATCH_TIMER_TERMINAL;
