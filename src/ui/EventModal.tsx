import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import styled from "styled-components";
import { FaLink } from "react-icons/fa";
import { connection } from "../connection/connection";
import {
  EventMatch,
  EventParticipant,
  EventRecord,
  EventRound,
} from "../connection/connectionModels";
import {
  closeEventModal,
  EVENT_MODAL_Z_INDEX,
  getEventModalState,
  subscribeToEventModalState,
} from "./eventModalController";
import { emojis } from "../content/emojis";
import { storage } from "../utils/storage";
import { openProfileSignInPopup } from "./ProfileSignIn";
import { getCurrentRouteState } from "../navigation/routeState";
import {
  didDismissSomethingWithOutsideTapJustNow,
  didNotDismissAnythingWithOutsideTapJustNow,
} from "./BottomControls";
import { showShinyCard, showsShinyCardSomewhere } from "./ShinyCard";
import { getStashedPlayerProfile } from "../utils/playerMetadata";

const BRACKET_MATCH_W = 72;
const BRACKET_MATCH_H = 40;
const BRACKET_AVATAR_PX = 28;
const BRACKET_SLOT_PITCH = 88;
const BRACKET_CONNECTOR_W = 40;
const BRACKET_COL_STEP = BRACKET_MATCH_W + BRACKET_CONNECTOR_W;
const BRACKET_EDGE_PADDING_X = 24;
const BRACKET_EDGE_PADDING_Y = 16;

const PYRAMID_BASE_W = 72;
const PYRAMID_BASE_H = 40;
const PYRAMID_BASE_AVATAR = 28;
const PYRAMID_H_GAP_RATIO = 0.18;
const PYRAMID_V_GAP = 52;
const PYRAMID_EDGE_PAD_X = 20;
const PYRAMID_EDGE_PAD_Y = 16;
const FALLBACK_MATCH_H = 40;
const FALLBACK_AVATAR_PX = 28;

const getViewportSize = (): { width: number; height: number } => {
  if (typeof window === "undefined") {
    return { width: 1024, height: 768 };
  }
  return { width: window.innerWidth, height: window.innerHeight };
};

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: ${EVENT_MODAL_Z_INDEX};
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;

  @media (prefers-color-scheme: dark) and (hover: none) and (pointer: coarse) {
    background: rgba(15, 15, 15, 0.11);
  }

  @media (prefers-color-scheme: light) {
    background: rgba(0, 0, 0, 0.01);
  }
`;

const TopBar = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px 20px;
  pointer-events: none;
  z-index: ${EVENT_MODAL_Z_INDEX + 1};

  & > * {
    pointer-events: auto;
    cursor: default;
  }
`;

const TopBarTitle = styled.div`
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  text-align: center;
  color: var(--color-gray-33);

  @media (prefers-color-scheme: dark) {
    color: var(--color-gray-f0);
  }
`;

const DevBracketHelper = styled.div`
  position: fixed;
  top: 12px;
  left: 12px;
  z-index: ${EVENT_MODAL_Z_INDEX + 2};
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const DevHelperToggle = styled.button`
  width: 18px;
  height: 18px;
  padding: 0;
  border-radius: 999px;
  border: none;
  background: transparent;
  color: rgba(0, 0, 0, 0.28);
  font-size: 0.95rem;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  opacity: 0.72;

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      opacity: 1;
    }
  }

  @media (prefers-color-scheme: dark) {
    color: rgba(255, 255, 255, 0.42);

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        opacity: 1;
      }
    }
  }
`;

const DevHelperPanel = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.92);

  @media (prefers-color-scheme: dark) {
    background: rgba(20, 20, 20, 0.92);
  }
`;

const DevHelperSelect = styled.select`
  height: 28px;
  border: none;
  border-radius: 8px;
  padding: 0 8px;
  font-size: 0.78rem;
  background: var(--color-gray-f0);
  color: var(--color-gray-25);

  @media (prefers-color-scheme: dark) {
    background: var(--color-gray-33);
    color: var(--color-gray-f0);
  }
`;

const DevHelperAction = styled.button`
  height: 28px;
  padding: 0 10px;
  border: none;
  border-radius: 8px;
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
  background: var(--color-blue-primary);
  color: white;

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background: var(--bottomButtonBackgroundHover);
    }
  }

  @media (prefers-color-scheme: dark) {
    background: var(--color-blue-primary-dark);

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background: var(--bottomButtonBackgroundHoverDark);
      }
    }
  }
`;

const ContentArea = styled.div`
  width: min(400px, calc(100vw - 48px));
  max-height: min(560px, calc(100vh - 96px));
  max-height: min(560px, calc(100dvh - 96px));
  overflow-y: auto;
  padding: 16px;
  border-radius: 16px;
  background: var(--color-white);
  cursor: default;

  @media (prefers-color-scheme: dark) {
    background: var(--color-deep-gray);
  }
`;

const ParticipantsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const ParticipantRow = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  width: 100%;
  border: none;
  background: transparent;
  padding: 6px 8px;
  border-radius: 10px;
  text-align: left;
  cursor: pointer;

  &:disabled {
    cursor: default;
    opacity: 0.72;
  }

  @media (hover: hover) and (pointer: fine) {
    &:hover:not(:disabled) {
      background: rgba(0, 0, 0, 0.04);
    }
  }

  @media (prefers-color-scheme: dark) {
    @media (hover: hover) and (pointer: fine) {
      &:hover:not(:disabled) {
        background: rgba(255, 255, 255, 0.06);
      }
    }
  }
`;

const Avatar = styled.img<{ $size?: number }>`
  width: ${(props) => props.$size ?? 24}px;
  height: ${(props) => props.$size ?? 24}px;
  border-radius: ${(props) =>
    Math.max(4, Math.round((props.$size ?? 24) / 4))}px;
  flex-shrink: 0;
`;

const AvatarFallback = styled.div<{ $size?: number }>`
  width: ${(props) => props.$size ?? 24}px;
  height: ${(props) => props.$size ?? 24}px;
  border-radius: ${(props) =>
    Math.max(4, Math.round((props.$size ?? 24) / 4))}px;
  background: rgba(128, 128, 128, 0.18);
  flex-shrink: 0;
`;

const ParticipantName = styled.div`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-gray-25);

  @media (prefers-color-scheme: dark) {
    color: var(--color-gray-f5);
  }
`;

const ParticipantState = styled.div`
  margin-left: auto;
  font-size: 0.7rem;
  text-transform: uppercase;
  color: var(--navigationTextMuted);
`;

const BracketContainer = styled.div<{
  $w: number;
  $h: number;
  $scale: number;
}>`
  position: relative;
  flex: 0 0 auto;
  width: ${(p) => p.$w}px;
  height: ${(p) => p.$h}px;
  cursor: default;
  transform: scale(${(p) => p.$scale});
  transform-origin: center center;
`;

const BracketPlacement = styled.div<{ $offsetY: number }>`
  position: relative;
  transform: translateY(${(p) => p.$offsetY}px);
`;

const ClassicConnectorSvg = styled.svg`
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
  z-index: 1;

  path {
    fill: none;
    stroke: #999999;
    stroke-width: 2.5;
  }

  @media (prefers-color-scheme: dark) {
    path {
      stroke: #777777;
    }
  }
`;

const PyramidConnectorSvg = styled.svg`
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;

  path {
    fill: none;
    stroke: rgba(160, 160, 160, 0.5);
    stroke-width: 2;
    stroke-linecap: round;
  }

  @media (prefers-color-scheme: dark) {
    path {
      stroke: rgba(140, 140, 140, 0.4);
    }
  }
`;

const ClassicMatchCard = styled.button<{
  $x: number;
  $y: number;
}>`
  position: absolute;
  left: ${(p) => p.$x}px;
  top: ${(p) => p.$y}px;
  width: ${BRACKET_MATCH_W}px;
  height: ${BRACKET_MATCH_H}px;
  border: none;
  border-radius: 12px;
  padding: 0;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  background: var(--color-gray-f0);
  transition: background-color 0.15s ease;

  &:disabled {
    cursor: default;
  }

  @media (hover: hover) and (pointer: fine) {
    &:hover:not(:disabled) {
      background: var(--color-gray-e0);
    }
  }

  @media (prefers-color-scheme: dark) {
    background: var(--color-gray-27);

    @media (hover: hover) and (pointer: fine) {
      &:hover:not(:disabled) {
        background: var(--color-gray-33);
      }
    }
  }
`;

const PyramidMatchCard = styled.button<{
  $x: number;
  $y: number;
  $w: number;
  $h: number;
  $r: number;
}>`
  position: absolute;
  left: ${(p) => p.$x}px;
  top: ${(p) => p.$y}px;
  width: ${(p) => p.$w}px;
  height: ${(p) => p.$h}px;
  border: none;
  border-radius: ${(p) => p.$r}px;
  padding: 0;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  background: var(--color-gray-f0);
  transition: background-color 0.15s ease;
  z-index: 1;

  &:disabled {
    cursor: default;
  }

  @media (hover: hover) and (pointer: fine) {
    &:hover:not(:disabled) {
      background: var(--color-gray-e0);
    }
  }

  @media (prefers-color-scheme: dark) {
    background: var(--color-gray-27);

    @media (hover: hover) and (pointer: fine) {
      &:hover:not(:disabled) {
        background: var(--color-gray-33);
      }
    }
  }
`;

const MatchAvatarSlot = styled.div`
  line-height: 0;
`;

const BracketFallbackPanel = styled(ContentArea)`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const BracketFallbackRound = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const BracketFallbackRoundTitle = styled.div`
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--navigationTextMuted);
`;

const BracketFallbackGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(82px, 1fr));
  gap: 8px;
`;

const BracketFallbackMatchCard = styled.button`
  min-height: ${FALLBACK_MATCH_H}px;
  border: none;
  border-radius: 12px;
  padding: 6px;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  background: var(--color-gray-f0);
  transition: background-color 0.15s ease;

  &:disabled {
    cursor: default;
  }

  @media (hover: hover) and (pointer: fine) {
    &:hover:not(:disabled) {
      background: var(--color-gray-e0);
    }
  }

  @media (prefers-color-scheme: dark) {
    background: var(--color-gray-27);

    @media (hover: hover) and (pointer: fine) {
      &:hover:not(:disabled) {
        background: var(--color-gray-33);
      }
    }
  }
`;

const InlineError = styled.div`
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(220, 53, 69, 0.08);
  color: var(--dangerButtonBackground);
  font-size: 0.75rem;
  line-height: 1.35;

  @media (prefers-color-scheme: dark) {
    background: rgba(220, 53, 69, 0.22);
    color: var(--dangerButtonBackgroundDark);
  }
`;

const BottomBar = styled.div`
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px 20px;
  pointer-events: none;
  z-index: ${EVENT_MODAL_Z_INDEX + 1};

  & > * {
    pointer-events: auto;
    cursor: default;
  }
`;

const ButtonRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
  max-width: min(560px, calc(100vw - 40px));
`;

const FooterButton = styled.button<{ $primary?: boolean }>`
  height: 42px;
  padding: 0 20px;
  border-radius: 20px;
  border: none;
  cursor: pointer;
  font-weight: 700;
  font-size: 0.9rem;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  transition: background-color 0.2s ease;
  background: ${(props) =>
    props.$primary ? "var(--color-blue-primary)" : "var(--color-gray-f0)"};
  color: ${(props) => (props.$primary ? "white" : "var(--color-gray-33)")};
  opacity: ${(props) => (props.disabled ? 0.56 : 1)};

  @media (hover: hover) and (pointer: fine) {
    &:hover:not(:disabled) {
      background: ${(props) =>
        props.$primary
          ? "var(--bottomButtonBackgroundHover)"
          : "var(--color-gray-e0)"};
    }
  }

  &:active:not(:disabled) {
    background: ${(props) =>
      props.$primary
        ? "var(--bottomButtonBackgroundActive)"
        : "var(--color-gray-d0)"};
  }

  @media (prefers-color-scheme: dark) {
    background: ${(props) =>
      props.$primary
        ? "var(--color-blue-primary-dark)"
        : "var(--color-gray-33)"};
    color: ${(props) => (props.$primary ? "white" : "var(--color-gray-f0)")};

    @media (hover: hover) and (pointer: fine) {
      &:hover:not(:disabled) {
        background: ${(props) =>
          props.$primary
            ? "var(--bottomButtonBackgroundHoverDark)"
            : "var(--color-gray-44)"};
      }
    }

    &:active:not(:disabled) {
      background: ${(props) =>
        props.$primary
          ? "var(--bottomButtonBackgroundActiveDark)"
          : "var(--color-gray-55)"};
    }
  }
`;

const FooterNote = styled.div`
  font-size: 0.8rem;
  color: var(--navigationTextMuted);
`;

const OverlayStatus = styled.div`
  position: fixed;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--navigationTextMuted);
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid rgba(0, 0, 0, 0.06);
  pointer-events: none;
  text-align: center;

  @media (prefers-color-scheme: dark) {
    background: rgba(12, 12, 12, 0.82);
    border-color: rgba(255, 255, 255, 0.12);
  }
`;

const FooterButtonContent = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;

  svg {
    width: 12px;
    height: 12px;
    flex-shrink: 0;
  }
`;

type EventUiState = {
  isJoined: boolean;
  isEliminated: boolean;
  playableMatch: EventMatch | null;
  waitingForNext: boolean;
};

type BracketStyle = "classic" | "pyramid";

const PENDING_JOIN_POLL_INTERVAL_MS = 350;
const PENDING_JOIN_POLL_TIMEOUT_MS = 60_000;
const EVENT_SYNC_RETRY_DELAYS_MS = [500, 1500, 3000];

const formatRelativeStart = (
  event: EventRecord | null,
  nowMs: number,
): string => {
  if (!event) {
    return "";
  }
  if (event.status === "dismissed") {
    return "dismissed: not enough players";
  }
  if (event.status === "ended") {
    return event.winnerDisplayName
      ? `${event.winnerDisplayName} won`
      : "event ended";
  }
  if (event.status === "active") {
    return "live";
  }
  const deltaMs = event.startAtMs - nowMs;
  if (deltaMs <= 0) {
    const participantCount = Object.keys(event.participants).length;
    return participantCount < 2 ? "not enough players yet" : "starting now";
  }
  const minutes = Math.max(1, Math.ceil(deltaMs / 60000));
  return `in ${minutes} minute${minutes === 1 ? "" : "s"}`;
};

const getSortedParticipants = (
  event: EventRecord | null,
): EventParticipant[] => {
  if (!event) {
    return [];
  }
  return Object.values(event.participants).sort(
    (left, right) => left.joinedAtMs - right.joinedAtMs,
  );
};

const getSortedRounds = (event: EventRecord | null): EventRound[] => {
  if (!event) {
    return [];
  }
  return Object.values(event.rounds).sort(
    (left, right) => left.roundIndex - right.roundIndex,
  );
};

const parseBracketMatchKey = (
  matchKey: string,
): { roundIndex: number; matchIndex: number } | null => {
  const trimmedMatchKey = matchKey.trim();
  const parts = /^(\d+)_(\d+)$/.exec(trimmedMatchKey);
  if (!parts) {
    return null;
  }
  const roundIndex = Number(parts[1]);
  const matchIndex = Number(parts[2]);
  if (!Number.isFinite(roundIndex) || !Number.isFinite(matchIndex)) {
    return null;
  }
  return { roundIndex, matchIndex };
};

const getMatchKeyIndex = (matchKey: string): number | null => {
  return parseBracketMatchKey(matchKey)?.matchIndex ?? null;
};

const getSortedMatches = (round: EventRound | null): EventMatch[] => {
  if (!round) {
    return [];
  }
  return Object.values(round.matches).sort((left, right) => {
    const leftIndex = getMatchKeyIndex(left.matchKey);
    const rightIndex = getMatchKeyIndex(right.matchKey);
    if (leftIndex !== null && rightIndex !== null) {
      return leftIndex - rightIndex;
    }
    if (leftIndex !== null) {
      return -1;
    }
    if (rightIndex !== null) {
      return 1;
    }
    return left.matchKey.localeCompare(right.matchKey);
  });
};

const getCurrentUiState = (
  event: EventRecord | null,
  profileId: string,
): EventUiState => {
  if (!event || !profileId) {
    return {
      isJoined: false,
      isEliminated: false,
      playableMatch: null,
      waitingForNext: false,
    };
  }

  const participant = event.participants[profileId];
  if (!participant) {
    return {
      isJoined: false,
      isEliminated: false,
      playableMatch: null,
      waitingForNext: false,
    };
  }

  if (participant.state === "eliminated") {
    return {
      isJoined: true,
      isEliminated: true,
      playableMatch: null,
      waitingForNext: false,
    };
  }

  const rounds = getSortedRounds(event);
  let playableMatch: EventMatch | null = null;
  for (const round of rounds) {
    const candidate =
      getSortedMatches(round).find(
        (match) =>
          match.status === "pending" &&
          match.inviteId &&
          (match.hostProfileId === profileId ||
            match.guestProfileId === profileId),
      ) ?? null;
    if (candidate) {
      playableMatch = candidate;
      break;
    }
  }

  return {
    isJoined: true,
    isEliminated: false,
    playableMatch,
    waitingForNext: event.status === "active" && !playableMatch,
  };
};

type ClassicBracketMatchPosition = {
  x: number;
  y: number;
  key: string;
  match: EventMatch;
};

type PyramidBracketMatchPosition = {
  x: number;
  y: number;
  w: number;
  h: number;
  avatarPx: number;
  borderRadius: number;
  key: string;
  match: EventMatch;
};

type ClassicBracketLayout = {
  width: number;
  height: number;
  positions: ClassicBracketMatchPosition[];
  connectors: string[];
};

type PyramidBracketLayout = {
  width: number;
  height: number;
  positions: PyramidBracketMatchPosition[];
  connectors: string[];
};

const getBracketMatchTop = (roundIndex: number, matchIndex: number): number => {
  const slotSpan = BRACKET_SLOT_PITCH * Math.pow(2, roundIndex);
  return Math.round((slotSpan - BRACKET_MATCH_H) / 2 + matchIndex * slotSpan);
};

const canRenderSymmetricalBracket = (rounds: EventRound[]): boolean => {
  if (rounds.length === 0) {
    return false;
  }

  const matchCounts = rounds.map((round) => getSortedMatches(round).length);
  if (matchCounts.some((count) => count <= 0)) {
    return false;
  }

  const hasCanonicalMatchKeys = rounds.every((round) => {
    const matches = getSortedMatches(round);
    for (let i = 0; i < matches.length; i += 1) {
      const parsed = parseBracketMatchKey(matches[i].matchKey);
      if (!parsed || parsed.roundIndex !== round.roundIndex) {
        return false;
      }
      if (parsed.matchIndex !== i) {
        return false;
      }
    }
    return true;
  });
  if (!hasCanonicalMatchKeys) {
    return false;
  }

  if (rounds.length === 1) {
    return matchCounts[0] === 1;
  }

  if (matchCounts[rounds.length - 1] !== 1) {
    return false;
  }

  for (let i = 0; i < rounds.length - 1; i += 1) {
    if (matchCounts[i] !== matchCounts[i + 1] * 2) {
      return false;
    }
  }

  return true;
};

const computeSymmetricalBracket = (
  rounds: EventRound[],
): ClassicBracketLayout | null => {
  if (rounds.length === 0) {
    return null;
  }

  const totalRounds = rounds.length;
  const sideRounds = totalRounds - 1;
  const firstRoundMatches = getSortedMatches(rounds[0]).length;

  if (sideRounds === 0) {
    const match = getSortedMatches(rounds[0])[0];
    if (!match) return null;
    return {
      width: BRACKET_MATCH_W,
      height: BRACKET_MATCH_H,
      positions: [
        {
          x: 0,
          y: 0,
          key: "FINAL",
          match,
        },
      ],
      connectors: [],
    };
  }

  const sideFirstRoundMatches = Math.ceil(firstRoundMatches / 2);
  const totalCols = 2 * sideRounds + 1;
  const width = (totalCols - 1) * BRACKET_COL_STEP + BRACKET_MATCH_W;
  const height =
    sideFirstRoundMatches <= 0
      ? BRACKET_MATCH_H
      : getBracketMatchTop(0, sideFirstRoundMatches - 1) + BRACKET_MATCH_H;

  const positions: ClassicBracketMatchPosition[] = [];
  const connectors: string[] = [];

  const colX = (col: number): number => col * BRACKET_COL_STEP;

  // Left side: columns 0 to sideRounds-1
  for (let r = 0; r < sideRounds; r++) {
    const x = colX(r);
    const roundMatches = getSortedMatches(rounds[r]);
    const perSideCount = Math.ceil(roundMatches.length / 2);

    for (let m = 0; m < perSideCount; m++) {
      const match = roundMatches[m];
      const y = getBracketMatchTop(r, m);
      positions.push({
        x,
        y,
        key: `L${r}_${m}`,
        match,
      });
    }

    // Connectors from this round to the next (inward)
    if (r < sideRounds - 1) {
      const nextX = colX(r + 1);
      const nextPerSideCount = Math.ceil(
        getSortedMatches(rounds[r + 1]).length / 2,
      );
      for (let j = 0; j < nextPerSideCount; j++) {
        const srcA = 2 * j;
        const srcB = 2 * j + 1;
        if (srcA >= perSideCount) {
          continue;
        }
        const y1 = getBracketMatchTop(r, 2 * j) + BRACKET_MATCH_H / 2;
        const yDst = getBracketMatchTop(r + 1, j) + BRACKET_MATCH_H / 2;
        const sx = x + BRACKET_MATCH_W;
        const mx = sx + BRACKET_CONNECTOR_W / 2;
        const ex = nextX;
        if (srcB < perSideCount) {
          const y2 = getBracketMatchTop(r, srcB) + BRACKET_MATCH_H / 2;
          connectors.push(
            `M${sx},${y1}H${mx}M${sx},${y2}H${mx}M${mx},${y1}V${y2}M${mx},${yDst}H${ex}`,
          );
        } else {
          connectors.push(`M${sx},${y1}H${mx}V${yDst}H${ex}`);
        }
      }
    }

    // Connector from last side round to center final
    if (r === sideRounds - 1) {
      const y = getBracketMatchTop(r, 0) + BRACKET_MATCH_H / 2;
      const sx = x + BRACKET_MATCH_W;
      const ex = colX(sideRounds);
      connectors.push(`M${sx},${y}H${ex}`);
    }
  }

  // Final: center column
  {
    const x = colX(sideRounds);
    const finalRound = rounds[totalRounds - 1];
    const finalMatches = getSortedMatches(finalRound);
    const match = finalMatches[0];
    if (match) {
      const y = getBracketMatchTop(sideRounds - 1, 0);
      positions.push({
        x,
        y,
        key: "FINAL",
        match,
      });
    }
  }

  // Right side: columns sideRounds+1 to 2*sideRounds
  for (let r = 0; r < sideRounds; r++) {
    const col = 2 * sideRounds - r;
    const x = colX(col);
    const roundMatches = getSortedMatches(rounds[r]);
    const totalCount = roundMatches.length;
    const perSideCount = Math.ceil(totalCount / 2);
    const offset = perSideCount;

    for (let m = 0; m < totalCount - perSideCount; m++) {
      const match = roundMatches[offset + m];
      const y = getBracketMatchTop(r, m);
      positions.push({
        x,
        y,
        key: `R${r}_${m}`,
        match,
      });
    }

    // Connectors (going leftward toward center)
    if (r < sideRounds - 1) {
      const innerCol = 2 * sideRounds - (r + 1);
      const innerX = colX(innerCol);
      const nextRoundMatches = getSortedMatches(rounds[r + 1]);
      const nextTotalCount = nextRoundMatches.length;
      const nextPerSide = Math.ceil(nextTotalCount / 2);
      const innerMatchCount = nextTotalCount - nextPerSide;
      const currentSideCount = totalCount - perSideCount;
      for (let j = 0; j < innerMatchCount; j++) {
        const srcA = 2 * j;
        const srcB = 2 * j + 1;
        if (srcA >= currentSideCount) {
          continue;
        }
        const y1 = getBracketMatchTop(r, srcA) + BRACKET_MATCH_H / 2;
        const yDst = getBracketMatchTop(r + 1, j) + BRACKET_MATCH_H / 2;
        const sx = x;
        const mx = sx - BRACKET_CONNECTOR_W / 2;
        const ex = innerX + BRACKET_MATCH_W;
        if (srcB < currentSideCount) {
          const y2 = getBracketMatchTop(r, srcB) + BRACKET_MATCH_H / 2;
          connectors.push(
            `M${sx},${y1}H${mx}M${sx},${y2}H${mx}M${mx},${y1}V${y2}M${mx},${yDst}H${ex}`,
          );
        } else {
          connectors.push(`M${sx},${y1}H${mx}V${yDst}H${ex}`);
        }
      }
    }

    // Connector from right semi to center final
    if (r === sideRounds - 1) {
      const y = getBracketMatchTop(r, 0) + BRACKET_MATCH_H / 2;
      const sx = x;
      const ex = colX(sideRounds) + BRACKET_MATCH_W;
      connectors.push(`M${sx},${y}H${ex}`);
    }
  }

  return { width, height, positions, connectors };
};

const computePyramidBracket = (
  rounds: EventRound[],
): PyramidBracketLayout | null => {
  const totalRounds = rounds.length;
  if (totalRounds === 0) return null;

  const growthPerRound = totalRounds <= 1 ? 0 : 0.6 / (totalRounds - 1);

  const dims = rounds.map((_, rIdx) => {
    const s = 1 + rIdx * growthPerRound;
    const w = Math.round(PYRAMID_BASE_W * s);
    const h = Math.round(PYRAMID_BASE_H * s);
    return {
      w,
      h,
      avatarPx: Math.round(PYRAMID_BASE_AVATAR * s),
      borderRadius: Math.max(8, Math.round(12 * s)),
      gap: Math.max(6, Math.round(w * PYRAMID_H_GAP_RATIO)),
    };
  });

  const matchCounts = rounds.map((r) => getSortedMatches(r).length);

  if (totalRounds === 1 && matchCounts[0] === 1) {
    const match = getSortedMatches(rounds[0])[0];
    if (!match) return null;
    const { w, h, avatarPx, borderRadius } = dims[0];
    return {
      width: w,
      height: h,
      positions: [
        { x: 0, y: 0, w, h, avatarPx, borderRadius, key: "FINAL", match },
      ],
      connectors: [],
    };
  }

  const rowWidths = matchCounts.map((count, rIdx) => {
    return count * dims[rIdx].w + Math.max(0, count - 1) * dims[rIdx].gap;
  });
  const totalWidth = Math.max(...rowWidths);

  const rowYs: number[] = new Array(totalRounds);
  let cursorY = 0;
  for (let displayRow = 0; displayRow < totalRounds; displayRow++) {
    const rIdx = totalRounds - 1 - displayRow;
    rowYs[rIdx] = cursorY;
    cursorY += dims[rIdx].h + PYRAMID_V_GAP;
  }
  const totalHeight = cursorY - PYRAMID_V_GAP;

  const positions: PyramidBracketMatchPosition[] = [];
  const centers = new Map<
    string,
    { cx: number; topY: number; bottomY: number }
  >();

  for (let rIdx = 0; rIdx < totalRounds; rIdx++) {
    const matches = getSortedMatches(rounds[rIdx]);
    const { w, h, avatarPx, borderRadius, gap } = dims[rIdx];
    const rowY = rowYs[rIdx];

    if (rIdx === 0) {
      const rowW = matches.length * w + Math.max(0, matches.length - 1) * gap;
      const startX = (totalWidth - rowW) / 2;
      matches.forEach((match, mIdx) => {
        const x = startX + mIdx * (w + gap);
        positions.push({
          x,
          y: rowY,
          w,
          h,
          avatarPx,
          borderRadius,
          key: `R0_${mIdx}`,
          match,
        });
        centers.set(`0_${mIdx}`, {
          cx: x + w / 2,
          topY: rowY,
          bottomY: rowY + h,
        });
      });
    } else {
      matches.forEach((match, mIdx) => {
        const childA = centers.get(`${rIdx - 1}_${mIdx * 2}`);
        const childB = centers.get(`${rIdx - 1}_${mIdx * 2 + 1}`);
        let cx: number;
        if (childA && childB) {
          cx = (childA.cx + childB.cx) / 2;
        } else if (childA) {
          cx = childA.cx;
        } else {
          const rowW =
            matches.length * w + Math.max(0, matches.length - 1) * gap;
          cx = (totalWidth - rowW) / 2 + mIdx * (w + gap) + w / 2;
        }

        const x = cx - w / 2;
        const isFinal = rIdx === totalRounds - 1 && matches.length === 1;
        positions.push({
          x,
          y: rowY,
          w,
          h,
          avatarPx,
          borderRadius,
          key: isFinal ? "FINAL" : `R${rIdx}_${mIdx}`,
          match,
        });
        centers.set(`${rIdx}_${mIdx}`, {
          cx,
          topY: rowY,
          bottomY: rowY + h,
        });
      });
    }
  }

  const connectors: string[] = [];
  for (let rIdx = 1; rIdx < totalRounds; rIdx++) {
    const matches = getSortedMatches(rounds[rIdx]);
    matches.forEach((_, mIdx) => {
      const parent = centers.get(`${rIdx}_${mIdx}`);
      if (!parent) return;
      [mIdx * 2, mIdx * 2 + 1].forEach((childMIdx) => {
        const child = centers.get(`${rIdx - 1}_${childMIdx}`);
        if (!child) return;
        const x1 = child.cx;
        const y1 = child.topY;
        const x2 = parent.cx;
        const y2 = parent.bottomY;
        const dy = Math.abs(y1 - y2);
        const cp = dy * 0.42;
        connectors.push(
          `M${x1},${y1}C${x1},${y1 - cp},${x2},${y2 + cp},${x2},${y2}`,
        );
      });
    });
  }

  return { width: totalWidth, height: totalHeight, positions, connectors };
};

const formatEventError = (error: unknown): string => {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    const message = (error as { message: string }).message;
    return message.replace(/^Firebase:\s*/i, "");
  }
  return "Something went wrong.";
};

const EventAvatar: React.FC<{
  emojiId?: number | null;
  displayName?: string | null;
  size?: number;
}> = ({ emojiId, displayName, size }) => {
  if (typeof emojiId === "number" && Number.isFinite(emojiId)) {
    return (
      <Avatar
        $size={size}
        src={emojis.getEmojiUrl(emojiId.toString())}
        alt={displayName ?? ""}
      />
    );
  }
  return <AvatarFallback $size={size} aria-hidden="true" />;
};

const getParticipantDisplayName = (participant: EventParticipant): string => {
  const displayName = participant.displayName?.trim();
  if (displayName) {
    return displayName;
  }
  const username = participant.username?.trim();
  if (username) {
    return username;
  }
  return "anon";
};

const DEV_STUB_MIN_PLAYERS = 2;
const DEV_STUB_MAX_PLAYERS = 32;
const DEV_STUB_DEFAULT_PLAYERS = 8;

const clampDevStubPlayerCount = (value: number): number => {
  if (!Number.isFinite(value)) {
    return DEV_STUB_MIN_PLAYERS;
  }
  return Math.min(
    DEV_STUB_MAX_PLAYERS,
    Math.max(DEV_STUB_MIN_PLAYERS, Math.round(value)),
  );
};

const getStubBracketSize = (playerCount: number): number => {
  let bracketSize = DEV_STUB_MIN_PLAYERS;
  while (bracketSize < playerCount && bracketSize < DEV_STUB_MAX_PLAYERS) {
    bracketSize *= 2;
  }
  return bracketSize;
};

const buildSeedOrder = (bracketSize: number): number[] => {
  if (bracketSize <= 1) {
    return [1];
  }
  const previous = buildSeedOrder(Math.floor(bracketSize / 2));
  const next: number[] = [];
  for (const seed of previous) {
    next.push(seed);
    next.push(bracketSize + 1 - seed);
  }
  return next;
};

const shuffleArray = <T,>(values: T[]): T[] => {
  const next = [...values];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = next[i];
    next[i] = next[j];
    next[j] = temp;
  }
  return next;
};

const createStubEventRecord = ({
  source,
  playerCount,
  fallbackEventId,
}: {
  source: EventRecord | null;
  playerCount: number;
  fallbackEventId?: string | null;
}): EventRecord => {
  const normalizedPlayerCount = clampDevStubPlayerCount(playerCount);
  const bracketSize = getStubBracketSize(normalizedPlayerCount);
  const roundCount = Math.max(1, Math.round(Math.log2(bracketSize)));
  const nowMs = Date.now();
  const participants = shuffleArray(
    Array.from({ length: normalizedPlayerCount }, (_, index) => {
      const profileId = `dev_stub_profile_${index + 1}`;
      const [emojiIdString] = emojis.getRandomEmojiUrl(true);
      const emojiId = Number(emojiIdString);
      return {
        profileId,
        loginUid: `dev_stub_login_${index + 1}`,
        username: `stub_${index + 1}`,
        displayName: `Stub ${index + 1}`,
        emojiId: Number.isFinite(emojiId) ? emojiId : 1,
        aura: "",
        joinedAtMs: nowMs - (normalizedPlayerCount - index) * 3000,
        state: "active",
        eliminatedRoundIndex: null,
        eliminatedByProfileId: null,
      } satisfies EventParticipant;
    }),
  );
  const participantsById: Record<string, EventParticipant> = {};
  for (const participant of participants) {
    participantsById[participant.profileId] = participant;
  }

  const seedOrder = buildSeedOrder(bracketSize);
  const seedToSlotIndex = new Map<number, number>();
  seedOrder.forEach((seed, slotIndex) => {
    seedToSlotIndex.set(seed, slotIndex);
  });

  let roundEntrants: Array<EventParticipant | null> = Array.from(
    { length: bracketSize },
    () => null,
  );
  for (let seed = 1; seed <= normalizedPlayerCount; seed += 1) {
    const slotIndex = seedToSlotIndex.get(seed);
    const participant = participants[seed - 1];
    if (slotIndex === undefined || !participant) {
      continue;
    }
    roundEntrants[slotIndex] = participant;
  }

  const eliminationsByProfileId: Record<
    string,
    { eliminatedRoundIndex: number; eliminatedByProfileId: string | null }
  > = {};
  const rounds: Record<string, EventRound> = {};

  for (let roundIndex = 0; roundIndex < roundCount; roundIndex += 1) {
    const matchCount = Math.max(1, Math.floor(roundEntrants.length / 2));
    const nextRoundEntrants: Array<EventParticipant | null> = Array.from(
      { length: matchCount },
      () => null,
    );
    const matches: Record<string, EventMatch> = {};

    for (let matchIndex = 0; matchIndex < matchCount; matchIndex += 1) {
      const host = roundEntrants[matchIndex * 2] ?? null;
      const guest = roundEntrants[matchIndex * 2 + 1] ?? null;
      const matchKey = `${roundIndex}_${matchIndex}`;
      let status: EventMatch["status"] = "upcoming";
      let winner: EventParticipant | null = null;
      let loser: EventParticipant | null = null;

      if (host && guest) {
        const hostWon = Math.random() >= 0.5;
        winner = hostWon ? host : guest;
        loser = hostWon ? guest : host;
        status = hostWon ? "host" : "guest";
      } else if (host || guest) {
        winner = host ?? guest;
        status = "bye";
      }

      nextRoundEntrants[matchIndex] = winner;
      if (winner && loser) {
        eliminationsByProfileId[loser.profileId] = {
          eliminatedRoundIndex: roundIndex,
          eliminatedByProfileId: winner.profileId,
        };
      }

      const resolvedAtMs =
        winner !== null
          ? nowMs - (roundCount - roundIndex) * 60_000 - matchIndex * 250
          : null;

      matches[matchKey] = {
        matchKey,
        inviteId: null,
        status,
        resolvedAtMs,
        winnerProfileId: winner?.profileId ?? null,
        loserProfileId: loser?.profileId ?? null,
        hostProfileId: host?.profileId ?? null,
        hostLoginUid: host?.loginUid ?? null,
        hostDisplayName: host?.displayName ?? null,
        hostEmojiId: host?.emojiId ?? null,
        hostAura: host?.aura ?? null,
        guestProfileId: guest?.profileId ?? null,
        guestLoginUid: guest?.loginUid ?? null,
        guestDisplayName: guest?.displayName ?? null,
        guestEmojiId: guest?.emojiId ?? null,
        guestAura: guest?.aura ?? null,
      };
    }

    rounds[String(roundIndex)] = {
      roundIndex,
      status: "completed",
      createdAtMs: nowMs - (roundCount - roundIndex + 1) * 60_000,
      completedAtMs: nowMs - (roundCount - roundIndex) * 60_000,
      matches,
    };
    roundEntrants = nextRoundEntrants;
  }

  const winner = roundEntrants[0] ?? participants[0] ?? null;
  for (const participant of participants) {
    const elimination = eliminationsByProfileId[participant.profileId];
    if (winner && participant.profileId === winner.profileId) {
      participantsById[participant.profileId] = {
        ...participant,
        state: "winner",
        eliminatedRoundIndex: null,
        eliminatedByProfileId: null,
      };
      continue;
    }
    participantsById[participant.profileId] = {
      ...participant,
      state: "eliminated",
      eliminatedRoundIndex:
        elimination?.eliminatedRoundIndex ?? Math.max(0, roundCount - 1),
      eliminatedByProfileId:
        elimination?.eliminatedByProfileId ?? winner?.profileId ?? null,
    };
  }

  const sourceCreator = participants[0] ?? winner;
  const sourceEventId = source?.eventId?.trim();
  return {
    schemaVersion: source?.schemaVersion ?? 1,
    eventId: sourceEventId || fallbackEventId?.trim() || "dev_stub_event",
    status: "ended",
    createdAtMs: source?.createdAtMs ?? nowMs - (roundCount + 3) * 60_000,
    updatedAtMs: nowMs,
    startAtMs: source?.startAtMs ?? nowMs - (roundCount + 2) * 60_000,
    startedAtMs: source?.startedAtMs ?? nowMs - (roundCount + 2) * 60_000,
    endedAtMs: nowMs - 10_000,
    createdByProfileId:
      source?.createdByProfileId ?? sourceCreator?.profileId ?? "dev_stub",
    createdByLoginUid:
      source?.createdByLoginUid ?? sourceCreator?.loginUid ?? "dev_stub",
    createdByUsername:
      source?.createdByUsername ?? sourceCreator?.username ?? "dev_stub",
    winnerProfileId: winner?.profileId ?? null,
    winnerDisplayName: winner?.displayName ?? null,
    currentRoundIndex: Math.max(0, roundCount - 1),
    bracketSize,
    roundCount,
    participants: participantsById,
    rounds,
  };
};

const EventModal: React.FC = () => {
  const [modalState, setModalState] = useState(() => getEventModalState());
  const [eventRecord, setEventRecord] = useState<EventRecord | null>(null);
  const [devStubRecord, setDevStubRecord] = useState<EventRecord | null>(null);
  const [showDevHelperPanel, setShowDevHelperPanel] = useState(false);
  const [devStubPlayerCount, setDevStubPlayerCount] = useState(
    DEV_STUB_DEFAULT_PLAYERS,
  );
  const [bracketStyle, setBracketStyle] = useState<BracketStyle>("classic");
  const [isLoading, setIsLoading] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [viewportSize, setViewportSize] = useState(getViewportSize);
  const [bracketInsets, setBracketInsets] = useState({ top: 0, bottom: 0 });
  const [pendingJoinEventId, setPendingJoinEventId] = useState<string | null>(
    null,
  );
  const [pendingJoinRequestedAtMs, setPendingJoinRequestedAtMs] = useState(0);
  const [openingParticipantId, setOpeningParticipantId] = useState<
    string | null
  >(null);
  const openingParticipantIdRef = useRef<string | null>(null);
  const participantLookupSessionRef = useRef(0);
  const ignoreNextBackdropClickRef = useRef(false);
  const topBarRef = useRef<HTMLDivElement | null>(null);
  const bottomBarRef = useRef<HTMLDivElement | null>(null);
  const measureBracketInsets = useCallback(() => {
    const nextTop = Math.round(
      topBarRef.current?.getBoundingClientRect().height ?? 0,
    );
    const nextBottom = Math.round(
      bottomBarRef.current?.getBoundingClientRect().height ?? 0,
    );
    setBracketInsets((current) =>
      current.top === nextTop && current.bottom === nextBottom
        ? current
        : { top: nextTop, bottom: nextBottom },
    );
  }, []);

  useEffect(() => {
    return subscribeToEventModalState((nextState) => {
      setModalState(nextState);
    });
  }, []);

  useEffect(() => {
    participantLookupSessionRef.current += 1;
    openingParticipantIdRef.current = null;
    setOpeningParticipantId(null);
  }, [modalState.eventId, modalState.isOpen]);

  useEffect(() => {
    setDevStubRecord(null);
    setShowDevHelperPanel(false);
    setBracketStyle("classic");
  }, [modalState.eventId, modalState.isOpen]);

  useEffect(() => {
    if (!modalState.isOpen || !modalState.eventId) {
      setEventRecord(null);
      setInlineError(null);
      setCopyState("idle");
      setPendingJoinEventId(null);
      setPendingJoinRequestedAtMs(0);
      setOpeningParticipantId(null);
      openingParticipantIdRef.current = null;
      ignoreNextBackdropClickRef.current = false;
      return;
    }

    setIsLoading(true);
    let isDisposed = false;
    let hasReceivedEvent = false;
    let retryCount = 0;
    let retryTimeoutId: number | null = null;

    const clearRetryTimeout = () => {
      if (retryTimeoutId === null) {
        return;
      }
      window.clearTimeout(retryTimeoutId);
      retryTimeoutId = null;
    };

    function scheduleSyncRetry() {
      if (isDisposed || hasReceivedEvent || retryTimeoutId !== null) {
        return;
      }
      if (retryCount >= EVENT_SYNC_RETRY_DELAYS_MS.length) {
        setIsLoading(false);
        return;
      }
      const delayMs = EVENT_SYNC_RETRY_DELAYS_MS[retryCount];
      retryCount += 1;
      retryTimeoutId = window.setTimeout(() => {
        retryTimeoutId = null;
        void attemptSync();
      }, delayMs);
    }

    async function attemptSync() {
      if (isDisposed || !modalState.eventId || hasReceivedEvent) {
        return;
      }
      try {
        await connection.syncEventState(modalState.eventId);
      } catch {
        scheduleSyncRetry();
      }
    }

    const unsubscribe = connection.subscribeToEvent(
      modalState.eventId,
      (nextEvent) => {
        hasReceivedEvent = true;
        clearRetryTimeout();
        setEventRecord(nextEvent);
        setIsLoading(false);
      },
      () => {
        scheduleSyncRetry();
      },
    );

    void attemptSync();

    return () => {
      isDisposed = true;
      clearRetryTimeout();
      unsubscribe();
    };
  }, [modalState.eventId, modalState.isOpen]);

  useEffect(() => {
    if (!modalState.isOpen) {
      return;
    }
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 30000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [modalState.isOpen]);

  useEffect(() => {
    if (!modalState.isOpen || typeof window === "undefined") {
      return;
    }

    const handleViewportResize = () => {
      const next = getViewportSize();
      setViewportSize((current) =>
        current.width === next.width && current.height === next.height
          ? current
          : next,
      );
    };

    handleViewportResize();
    window.addEventListener("resize", handleViewportResize);
    window.visualViewport?.addEventListener("resize", handleViewportResize);
    return () => {
      window.removeEventListener("resize", handleViewportResize);
      window.visualViewport?.removeEventListener(
        "resize",
        handleViewportResize,
      );
    };
  }, [modalState.isOpen]);

  useLayoutEffect(() => {
    if (!modalState.isOpen || typeof window === "undefined") {
      return;
    }
    measureBracketInsets();
  });

  useEffect(() => {
    if (!modalState.isOpen || typeof window === "undefined") {
      return;
    }

    let rafId = 0;
    const scheduleMeasureInsets = () => {
      if (rafId !== 0) {
        return;
      }
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        measureBracketInsets();
      });
    };

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            scheduleMeasureInsets();
          });

    if (resizeObserver) {
      if (topBarRef.current) {
        resizeObserver.observe(topBarRef.current);
      }
      if (bottomBarRef.current) {
        resizeObserver.observe(bottomBarRef.current);
      }
    }

    window.addEventListener("resize", scheduleMeasureInsets);
    window.visualViewport?.addEventListener("resize", scheduleMeasureInsets);

    return () => {
      if (rafId !== 0) {
        window.cancelAnimationFrame(rafId);
      }
      resizeObserver?.disconnect();
      window.removeEventListener("resize", scheduleMeasureInsets);
      window.visualViewport?.removeEventListener(
        "resize",
        scheduleMeasureInsets,
      );
    };
  }, [measureBracketInsets, modalState.isOpen]);

  useEffect(() => {
    if (
      !modalState.isOpen ||
      !modalState.eventId ||
      !eventRecord ||
      eventRecord.status !== "scheduled"
    ) {
      return;
    }
    const delayMs = Math.max(0, eventRecord.startAtMs - Date.now() + 300);
    const timeoutId = window.setTimeout(() => {
      setNowMs(Date.now());
      void connection
        .syncEventState(modalState.eventId as string)
        .catch(() => {});
    }, delayMs);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [eventRecord, modalState.eventId, modalState.isOpen]);

  useEffect(() => {
    if (
      !modalState.isOpen ||
      !modalState.eventId ||
      pendingJoinEventId !== modalState.eventId
    ) {
      return;
    }
    const requestedAtMs =
      pendingJoinRequestedAtMs > 0 ? pendingJoinRequestedAtMs : Date.now();
    const intervalId = window.setInterval(() => {
      if (Date.now() - requestedAtMs >= PENDING_JOIN_POLL_TIMEOUT_MS) {
        setPendingJoinEventId(null);
        setPendingJoinRequestedAtMs(0);
        setInlineError("Sign-in timed out. Tap Join to try again.");
        return;
      }
      if (storage.getProfileId("") === "") {
        return;
      }
      const eventId = pendingJoinEventId;
      setPendingJoinEventId(null);
      setPendingJoinRequestedAtMs(0);
      if (!eventId) {
        return;
      }
      setInlineError(null);
      setIsLoading(true);
      void connection
        .joinEvent(eventId)
        .then(() => {
          setInlineError(null);
        })
        .catch((error) => {
          setInlineError(formatEventError(error));
        })
        .finally(() => {
          setIsLoading(false);
        });
    }, PENDING_JOIN_POLL_INTERVAL_MS);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    modalState.eventId,
    modalState.isOpen,
    pendingJoinEventId,
    pendingJoinRequestedAtMs,
  ]);

  const displayedEventRecord = devStubRecord ?? eventRecord;
  const participants = useMemo(
    () => getSortedParticipants(displayedEventRecord),
    [displayedEventRecord],
  );
  const rounds = useMemo(
    () => getSortedRounds(displayedEventRecord),
    [displayedEventRecord],
  );
  const currentProfileId = storage.getProfileId("");
  const eventUiState = useMemo(
    () => getCurrentUiState(displayedEventRecord, currentProfileId),
    [currentProfileId, displayedEventRecord],
  );
  const currentRoute = getCurrentRouteState();

  const canRenderBracket = useMemo(
    () => canRenderSymmetricalBracket(rounds),
    [rounds],
  );
  const classicBracketLayout = useMemo(() => {
    if (!canRenderBracket) {
      return null;
    }
    return computeSymmetricalBracket(rounds);
  }, [canRenderBracket, rounds]);
  const pyramidBracketLayout = useMemo(() => {
    if (!canRenderBracket) {
      return null;
    }
    return computePyramidBracket(rounds);
  }, [canRenderBracket, rounds]);
  const activeBracketLayout =
    bracketStyle === "classic" ? classicBracketLayout : pyramidBracketLayout;

  const bracketFallbackRounds = useMemo(() => {
    return rounds
      .map((round, roundOffset) => {
        const matches = getSortedMatches(round);
        if (matches.length === 0) {
          return null;
        }
        const label =
          rounds.length === 1
            ? "match"
            : roundOffset === rounds.length - 1
              ? "final"
              : `round ${roundOffset + 1}`;
        return {
          key: `round_${round.roundIndex}_${roundOffset}`,
          label,
          matches,
        };
      })
      .filter(
        (
          item,
        ): item is {
          key: string;
          label: string;
          matches: EventMatch[];
        } => item !== null,
      );
  }, [rounds]);

  const bracketScale = useMemo(() => {
    if (!activeBracketLayout) return 1;

    if (bracketStyle === "classic") {
      const reservedTop = bracketInsets.top + BRACKET_EDGE_PADDING_Y;
      const reservedBottom = bracketInsets.bottom + BRACKET_EDGE_PADDING_Y;
      const availW = Math.max(
        1,
        viewportSize.width - BRACKET_EDGE_PADDING_X * 2,
      );
      const availH = Math.max(
        1,
        viewportSize.height - reservedTop - reservedBottom,
      );
      const sx = availW / activeBracketLayout.width;
      const sy = availH / activeBracketLayout.height;
      const scale = Math.min(1, sx, sy);
      return Number.isFinite(scale) ? Math.max(0, scale) : 1;
    }

    const reservedTop = bracketInsets.top + PYRAMID_EDGE_PAD_Y;
    const reservedBottom = bracketInsets.bottom + PYRAMID_EDGE_PAD_Y;
    const availW = Math.max(1, viewportSize.width - PYRAMID_EDGE_PAD_X * 2);
    const availH = Math.max(
      1,
      viewportSize.height - reservedTop - reservedBottom,
    );
    const sx = availW / activeBracketLayout.width;
    const sy = availH / activeBracketLayout.height;
    const scale = Math.min(1.6, sx, sy);
    return Number.isFinite(scale) ? Math.max(0.1, scale) : 1;
  }, [
    activeBracketLayout,
    bracketInsets.bottom,
    bracketInsets.top,
    bracketStyle,
    viewportSize.height,
    viewportSize.width,
  ]);
  const bracketOffsetY = Math.round(
    (bracketInsets.top - bracketInsets.bottom) / 2,
  );

  const isJoinWindowOpen =
    !!displayedEventRecord &&
    displayedEventRecord.status === "scheduled" &&
    nowMs < displayedEventRecord.startAtMs;

  const handleBackdropPointerDown = useCallback(
    (
      event:
        | React.MouseEvent<HTMLDivElement>
        | React.TouchEvent<HTMLDivElement>,
    ) => {
      if (event.target !== event.currentTarget) {
        return;
      }
      ignoreNextBackdropClickRef.current = showsShinyCardSomewhere;
    },
    [],
  );

  const handleBackdropClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget) {
        return;
      }
      if (showDevHelperPanel) {
        ignoreNextBackdropClickRef.current = false;
        setShowDevHelperPanel(false);
        return;
      }
      const shouldKeepVisibleForOutsideDismiss =
        ignoreNextBackdropClickRef.current ||
        showsShinyCardSomewhere ||
        !didNotDismissAnythingWithOutsideTapJustNow();
      ignoreNextBackdropClickRef.current = false;
      if (shouldKeepVisibleForOutsideDismiss) {
        return;
      }
      didDismissSomethingWithOutsideTapJustNow();
      void closeEventModal();
    },
    [showDevHelperPanel],
  );

  const handleCopyClick = useCallback(() => {
    if (!modalState.eventId) {
      return;
    }
    connection.writeEventLinkToClipboard(modalState.eventId);
    setCopyState("copied");
    window.setTimeout(() => {
      setCopyState("idle");
    }, 1200);
  }, [modalState.eventId]);

  const handleJoinClick = useCallback(() => {
    if (!modalState.eventId) {
      return;
    }
    if (storage.getProfileId("") === "") {
      setPendingJoinEventId(modalState.eventId);
      setPendingJoinRequestedAtMs(Date.now());
      setInlineError("Please sign in to join.");
      openProfileSignInPopup();
      return;
    }
    setPendingJoinEventId(null);
    setPendingJoinRequestedAtMs(0);
    setInlineError(null);
    setIsLoading(true);
    void connection
      .joinEvent(modalState.eventId)
      .then(() => {
        setInlineError(null);
      })
      .catch((error) => {
        setInlineError(formatEventError(error));
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [modalState.eventId]);

  const openMatch = useCallback(
    async (inviteId: string) => {
      if (!inviteId) {
        return;
      }
      await closeEventModal({
        skipHomeTransition: true,
        reason: "launch_game",
      });
      if (
        currentRoute.mode === "invite" &&
        currentRoute.inviteId === inviteId
      ) {
        return;
      }
      connection.connectToInvite(inviteId);
    },
    [currentRoute.inviteId, currentRoute.mode],
  );

  const resolveParticipantProfile = useCallback(
    async (participant: EventParticipant) => {
      const cachedProfile = participant.loginUid
        ? getStashedPlayerProfile(participant.loginUid)
        : undefined;
      if (cachedProfile && cachedProfile.id === participant.profileId) {
        return cachedProfile;
      }
      if (!participant.loginUid) {
        return null;
      }
      const exactProfile = await connection.getProfileByLoginId(
        participant.loginUid,
      );
      return exactProfile ?? null;
    },
    [],
  );

  const handleParticipantClick = useCallback(
    async (participant: EventParticipant) => {
      const participantKey = participant.profileId || participant.loginUid;
      if (!participantKey || openingParticipantIdRef.current) {
        return;
      }
      const lookupSession = participantLookupSessionRef.current;
      openingParticipantIdRef.current = participantKey;
      setOpeningParticipantId(participantKey);
      setInlineError(null);
      try {
        const profile = await resolveParticipantProfile(participant);
        if (participantLookupSessionRef.current !== lookupSession) {
          return;
        }
        if (!profile) {
          setInlineError("Unable to load player profile.");
          return;
        }
        await showShinyCard(
          profile,
          getParticipantDisplayName(participant),
          true,
        );
      } catch (error) {
        if (participantLookupSessionRef.current !== lookupSession) {
          return;
        }
        setInlineError(formatEventError(error));
      } finally {
        if (participantLookupSessionRef.current !== lookupSession) {
          return;
        }
        if (openingParticipantIdRef.current === participantKey) {
          openingParticipantIdRef.current = null;
        }
        setOpeningParticipantId((current) =>
          current === participantKey ? null : current,
        );
      }
    },
    [resolveParticipantProfile],
  );

  const handleCreateStubBracket = useCallback(() => {
    const normalizedPlayerCount = clampDevStubPlayerCount(devStubPlayerCount);
    setDevStubPlayerCount(normalizedPlayerCount);
    setDevStubRecord(
      createStubEventRecord({
        source: eventRecord,
        playerCount: normalizedPlayerCount,
        fallbackEventId: modalState.eventId,
      }),
    );
  }, [devStubPlayerCount, eventRecord, modalState.eventId]);

  const handleResetStubBracket = useCallback(() => {
    setDevStubRecord(null);
  }, []);

  const handleToggleBracketStyle = useCallback(() => {
    setBracketStyle((current) =>
      current === "classic" ? "pyramid" : "classic",
    );
  }, []);

  if (!modalState.isOpen || !modalState.eventId) {
    return null;
  }

  const hasBracket =
    (displayedEventRecord?.status === "active" ||
      displayedEventRecord?.status === "ended") &&
    activeBracketLayout !== null;
  const isBracketStatus =
    displayedEventRecord?.status === "active" ||
    displayedEventRecord?.status === "ended";
  const showBracketFallbackGrid =
    isBracketStatus && !hasBracket && bracketFallbackRounds.length > 0;
  const showParticipantsPanel = !!displayedEventRecord && !isBracketStatus;
  const overlayStatusText = !displayedEventRecord
    ? isLoading
      ? "LOADING"
      : null
    : !hasBracket && !showBracketFallbackGrid
      ? displayedEventRecord.status === "active"
        ? "building bracket..."
        : displayedEventRecord.status === "ended"
          ? "no bracket yet"
          : null
      : null;

  return (
    <Overlay
      onMouseDown={handleBackdropPointerDown}
      onTouchStart={handleBackdropPointerDown}
      onClick={handleBackdropClick}
    >
      <DevBracketHelper>
        <DevHelperToggle
          type="button"
          aria-label="Bracket stub helper"
          onClick={() => setShowDevHelperPanel((current) => !current)}
        >
          *
        </DevHelperToggle>
        {showDevHelperPanel && (
          <DevHelperPanel>
            <DevHelperSelect
              value={devStubPlayerCount}
              onChange={(event) =>
                setDevStubPlayerCount(
                  clampDevStubPlayerCount(Number(event.target.value)),
                )
              }
            >
              {Array.from(
                {
                  length: DEV_STUB_MAX_PLAYERS - DEV_STUB_MIN_PLAYERS + 1,
                },
                (_, index) => DEV_STUB_MIN_PLAYERS + index,
              ).map((count) => (
                <option key={count} value={count}>
                  {count} players
                </option>
              ))}
            </DevHelperSelect>
            <DevHelperAction type="button" onClick={handleCreateStubBracket}>
              Generate
            </DevHelperAction>
            <DevHelperAction type="button" onClick={handleToggleBracketStyle}>
              {bracketStyle === "classic" ? "Style: Classic" : "Style: New"}
            </DevHelperAction>
            {devStubRecord && (
              <DevHelperAction type="button" onClick={handleResetStubBracket}>
                Live
              </DevHelperAction>
            )}
          </DevHelperPanel>
        )}
      </DevBracketHelper>

      <TopBar ref={topBarRef}>
        <TopBarTitle>
          {devStubRecord
            ? "LIVE"
            : formatRelativeStart(displayedEventRecord, nowMs)}
        </TopBarTitle>
      </TopBar>

      {overlayStatusText && <OverlayStatus>{overlayStatusText}</OverlayStatus>}

      {hasBracket && activeBracketLayout && (
        <BracketPlacement $offsetY={bracketOffsetY}>
          <BracketContainer
            $w={activeBracketLayout.width}
            $h={activeBracketLayout.height}
            $scale={bracketScale}
          >
            {bracketStyle === "classic" && classicBracketLayout && (
              <>
                {classicBracketLayout.positions.map((mp) => {
                  const isByeMatch = mp.match.status === "bye";
                  const byeParticipantIsHost =
                    !!mp.match.hostProfileId ||
                    !!mp.match.hostDisplayName ||
                    mp.match.hostEmojiId !== null;
                  return (
                    <ClassicMatchCard
                      key={mp.key}
                      type="button"
                      $x={mp.x}
                      $y={mp.y}
                      disabled={!mp.match.inviteId}
                      onClick={() =>
                        mp.match.inviteId
                          ? void openMatch(mp.match.inviteId)
                          : undefined
                      }
                    >
                      <MatchAvatarSlot>
                        <EventAvatar
                          size={BRACKET_AVATAR_PX}
                          emojiId={
                            isByeMatch
                              ? byeParticipantIsHost
                                ? mp.match.hostEmojiId
                                : mp.match.guestEmojiId
                              : mp.match.hostEmojiId
                          }
                          displayName={
                            isByeMatch
                              ? byeParticipantIsHost
                                ? mp.match.hostDisplayName
                                : mp.match.guestDisplayName
                              : mp.match.hostDisplayName
                          }
                        />
                      </MatchAvatarSlot>
                      {!isByeMatch && (
                        <MatchAvatarSlot>
                          <EventAvatar
                            size={BRACKET_AVATAR_PX}
                            emojiId={mp.match.guestEmojiId}
                            displayName={mp.match.guestDisplayName}
                          />
                        </MatchAvatarSlot>
                      )}
                    </ClassicMatchCard>
                  );
                })}
                <ClassicConnectorSvg
                  width={classicBracketLayout.width}
                  height={classicBracketLayout.height}
                  viewBox={`0 0 ${classicBracketLayout.width} ${classicBracketLayout.height}`}
                >
                  {classicBracketLayout.connectors.map((d, i) => (
                    <path key={i} d={d} />
                  ))}
                </ClassicConnectorSvg>
              </>
            )}
            {bracketStyle === "pyramid" && pyramidBracketLayout && (
              <>
                <PyramidConnectorSvg
                  width={pyramidBracketLayout.width}
                  height={pyramidBracketLayout.height}
                  viewBox={`0 0 ${pyramidBracketLayout.width} ${pyramidBracketLayout.height}`}
                >
                  {pyramidBracketLayout.connectors.map((d, i) => (
                    <path key={i} d={d} />
                  ))}
                </PyramidConnectorSvg>
                {pyramidBracketLayout.positions.map((mp) => {
                  const isByeMatch = mp.match.status === "bye";
                  const byeParticipantIsHost =
                    !!mp.match.hostProfileId ||
                    !!mp.match.hostDisplayName ||
                    mp.match.hostEmojiId !== null;
                  return (
                    <PyramidMatchCard
                      key={mp.key}
                      type="button"
                      $x={mp.x}
                      $y={mp.y}
                      $w={mp.w}
                      $h={mp.h}
                      $r={mp.borderRadius}
                      disabled={!mp.match.inviteId}
                      onClick={() =>
                        mp.match.inviteId
                          ? void openMatch(mp.match.inviteId)
                          : undefined
                      }
                    >
                      <MatchAvatarSlot>
                        <EventAvatar
                          size={mp.avatarPx}
                          emojiId={
                            isByeMatch
                              ? byeParticipantIsHost
                                ? mp.match.hostEmojiId
                                : mp.match.guestEmojiId
                              : mp.match.hostEmojiId
                          }
                          displayName={
                            isByeMatch
                              ? byeParticipantIsHost
                                ? mp.match.hostDisplayName
                                : mp.match.guestDisplayName
                              : mp.match.hostDisplayName
                          }
                        />
                      </MatchAvatarSlot>
                      {!isByeMatch && (
                        <MatchAvatarSlot>
                          <EventAvatar
                            size={mp.avatarPx}
                            emojiId={mp.match.guestEmojiId}
                            displayName={mp.match.guestDisplayName}
                          />
                        </MatchAvatarSlot>
                      )}
                    </PyramidMatchCard>
                  );
                })}
              </>
            )}
          </BracketContainer>
        </BracketPlacement>
      )}

      {showBracketFallbackGrid && (
        <BracketFallbackPanel>
          {bracketFallbackRounds.map((round) => (
            <BracketFallbackRound key={round.key}>
              <BracketFallbackRoundTitle>
                {round.label}
              </BracketFallbackRoundTitle>
              <BracketFallbackGrid>
                {round.matches.map((match, index) => {
                  const isByeMatch = match.status === "bye";
                  const byeParticipantIsHost =
                    !!match.hostProfileId ||
                    !!match.hostDisplayName ||
                    match.hostEmojiId !== null;
                  return (
                    <BracketFallbackMatchCard
                      key={`${round.key}_${match.matchKey}_${index}`}
                      type="button"
                      disabled={!match.inviteId}
                      onClick={() =>
                        match.inviteId
                          ? void openMatch(match.inviteId)
                          : undefined
                      }
                    >
                      <MatchAvatarSlot>
                        <EventAvatar
                          size={FALLBACK_AVATAR_PX}
                          emojiId={
                            isByeMatch
                              ? byeParticipantIsHost
                                ? match.hostEmojiId
                                : match.guestEmojiId
                              : match.hostEmojiId
                          }
                          displayName={
                            isByeMatch
                              ? byeParticipantIsHost
                                ? match.hostDisplayName
                                : match.guestDisplayName
                              : match.hostDisplayName
                          }
                        />
                      </MatchAvatarSlot>
                      {!isByeMatch && (
                        <MatchAvatarSlot>
                          <EventAvatar
                            size={FALLBACK_AVATAR_PX}
                            emojiId={match.guestEmojiId}
                            displayName={match.guestDisplayName}
                          />
                        </MatchAvatarSlot>
                      )}
                    </BracketFallbackMatchCard>
                  );
                })}
              </BracketFallbackGrid>
            </BracketFallbackRound>
          ))}
        </BracketFallbackPanel>
      )}

      {showParticipantsPanel && (
        <ContentArea>
          <ParticipantsList>
            {participants.map((participant) => (
              <ParticipantRow
                key={participant.profileId}
                type="button"
                onClick={() => void handleParticipantClick(participant)}
                disabled={openingParticipantId !== null}
              >
                <EventAvatar
                  emojiId={participant.emojiId}
                  displayName={participant.displayName}
                />
                <ParticipantName>
                  {getParticipantDisplayName(participant)}
                </ParticipantName>
                <ParticipantState>
                  {openingParticipantId ===
                  (participant.profileId || participant.loginUid)
                    ? "loading"
                    : participant.state === "winner"
                      ? "winner"
                      : participant.state === "eliminated"
                        ? "out"
                        : ""}
                </ParticipantState>
              </ParticipantRow>
            ))}
            {!participants.length && (
              <FooterNote>
                {isLoading ? "loading players..." : "no players yet"}
              </FooterNote>
            )}
          </ParticipantsList>
        </ContentArea>
      )}

      <BottomBar ref={bottomBarRef}>
        {inlineError && <InlineError>{inlineError}</InlineError>}
        <ButtonRow>
          <FooterButton type="button" onClick={handleCopyClick}>
            <FooterButtonContent>
              {copyState !== "copied" && <FaLink />}
              {copyState === "copied" ? "Link is copied" : "Copy Link"}
            </FooterButtonContent>
          </FooterButton>

          {!eventUiState.isJoined && isJoinWindowOpen && (
            <>
              <FooterButton
                type="button"
                $primary={true}
                onClick={handleJoinClick}
                disabled={isLoading}
              >
                Join
              </FooterButton>
            </>
          )}

          {eventUiState.isJoined &&
            displayedEventRecord?.status === "scheduled" && (
              <>
                <FooterButton type="button" $primary={true} disabled={true}>
                  Play
                </FooterButton>
                {nowMs >= displayedEventRecord.startAtMs && (
                  <FooterNote>waiting for more players</FooterNote>
                )}
              </>
            )}

          {displayedEventRecord?.status === "active" &&
            eventUiState.playableMatch && (
              <FooterButton
                type="button"
                $primary={true}
                onClick={() =>
                  void openMatch(eventUiState.playableMatch!.inviteId as string)
                }
              >
                Play
              </FooterButton>
            )}

          {displayedEventRecord?.status === "active" &&
            !eventUiState.playableMatch &&
            eventUiState.waitingForNext && (
              <>
                <FooterButton type="button" $primary={true} disabled={true}>
                  Play
                </FooterButton>
                <FooterNote>waiting for your next match</FooterNote>
              </>
            )}

          {!eventUiState.isJoined &&
            displayedEventRecord?.status === "scheduled" &&
            !isJoinWindowOpen && (
              <FooterNote>
                {Object.keys(displayedEventRecord.participants ?? {}).length < 2
                  ? "waiting for more players"
                  : "event is no longer accepting players"}
              </FooterNote>
            )}
        </ButtonRow>
      </BottomBar>
    </Overlay>
  );
};

export default EventModal;
