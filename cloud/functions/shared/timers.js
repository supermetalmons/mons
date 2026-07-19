"use strict";

const MATCH_TIMER_DURATION_MS = 90000;
const MATCH_TIMER_DURATION_SECONDS = MATCH_TIMER_DURATION_MS / 1000;
const MATCH_TIMER_TERMINAL = "gg";

const formatMatchTimer = (turnNumber, targetTimestamp) =>
  `${turnNumber};${targetTimestamp}`;

const parseMatchTimer = (value) => {
  if (typeof value !== "string") {
    return null;
  }
  const [turnNumber, targetTimestamp] = value.split(";").map(Number);
  if (
    typeof turnNumber !== "number" ||
    Number.isNaN(turnNumber) ||
    typeof targetTimestamp !== "number" ||
    Number.isNaN(targetTimestamp)
  ) {
    return null;
  }
  return {
    turnNumber,
    targetTimestamp,
  };
};

const isMatchTimerTerminal = (value) => value === MATCH_TIMER_TERMINAL;

module.exports = {
  MATCH_TIMER_DURATION_MS,
  MATCH_TIMER_DURATION_SECONDS,
  MATCH_TIMER_TERMINAL,
  formatMatchTimer,
  parseMatchTimer,
  isMatchTimerTerminal,
};
