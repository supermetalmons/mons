import React, {
  useCallback,
  useEffect,
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
  width: ${(p) => p.$w}px;
  height: ${(p) => p.$h}px;
  cursor: default;
  transform: scale(${(p) => p.$scale});
  transform-origin: center center;
`;

const ConnectorSvg = styled.svg`
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

const MatchCard = styled.button<{
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
  min-height: ${BRACKET_MATCH_H}px;
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

const getBracketMatchTop = (roundIndex: number, matchIndex: number): number => {
  const slotSpan = BRACKET_SLOT_PITCH * Math.pow(2, roundIndex);
  return Math.round((slotSpan - BRACKET_MATCH_H) / 2 + matchIndex * slotSpan);
};

type BracketMatchPosition = {
  x: number;
  y: number;
  key: string;
  match: EventMatch;
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
): {
  width: number;
  height: number;
  positions: BracketMatchPosition[];
  connectors: string[];
} | null => {
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

  const positions: BracketMatchPosition[] = [];
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

const EventModal: React.FC = () => {
  const [modalState, setModalState] = useState(() => getEventModalState());
  const [eventRecord, setEventRecord] = useState<EventRecord | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [viewportSize, setViewportSize] = useState(getViewportSize);
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

  const participants = useMemo(
    () => getSortedParticipants(eventRecord),
    [eventRecord],
  );
  const rounds = useMemo(() => getSortedRounds(eventRecord), [eventRecord]);
  const currentProfileId = storage.getProfileId("");
  const eventUiState = useMemo(
    () => getCurrentUiState(eventRecord, currentProfileId),
    [currentProfileId, eventRecord],
  );
  const currentRoute = getCurrentRouteState();

  const bracketLayout = useMemo(() => {
    if (rounds.length === 0) return null;
    if (!canRenderSymmetricalBracket(rounds)) {
      return null;
    }
    return computeSymmetricalBracket(rounds);
  }, [rounds]);

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
    if (!bracketLayout) return 1;
    const padX = 48;
    const padY = 160;
    const availW = Math.max(1, viewportSize.width - padX);
    const availH = Math.max(1, viewportSize.height - padY);
    const sx = availW / bracketLayout.width;
    const sy = availH / bracketLayout.height;
    const scale = Math.min(1, sx, sy);
    return Number.isFinite(scale) ? Math.max(0, scale) : 1;
  }, [bracketLayout, viewportSize.height, viewportSize.width]);

  const isJoinWindowOpen =
    !!eventRecord &&
    eventRecord.status === "scheduled" &&
    nowMs < eventRecord.startAtMs;

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
    [],
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

  if (!modalState.isOpen || !modalState.eventId) {
    return null;
  }

  const hasBracket =
    (eventRecord?.status === "active" || eventRecord?.status === "ended") &&
    bracketLayout !== null;
  const isBracketStatus =
    eventRecord?.status === "active" || eventRecord?.status === "ended";
  const showBracketFallbackGrid =
    isBracketStatus && !hasBracket && bracketFallbackRounds.length > 0;
  const showParticipantsPanel = !!eventRecord && !isBracketStatus;
  const overlayStatusText = !eventRecord
    ? isLoading
      ? "LOADING"
      : null
    : !hasBracket && !showBracketFallbackGrid
      ? eventRecord.status === "active"
        ? "building bracket..."
        : eventRecord.status === "ended"
          ? "no bracket yet"
          : null
      : null;

  return (
    <Overlay
      onMouseDown={handleBackdropPointerDown}
      onTouchStart={handleBackdropPointerDown}
      onClick={handleBackdropClick}
    >
      <TopBar>
        <TopBarTitle>{formatRelativeStart(eventRecord, nowMs)}</TopBarTitle>
      </TopBar>

      {overlayStatusText && <OverlayStatus>{overlayStatusText}</OverlayStatus>}

      {hasBracket && bracketLayout && (
        <BracketContainer
          $w={bracketLayout.width}
          $h={bracketLayout.height}
          $scale={bracketScale}
        >
          {bracketLayout.positions.map((mp) => {
            const isByeMatch = mp.match.status === "bye";
            const byeParticipantIsHost =
              !!mp.match.hostProfileId ||
              !!mp.match.hostDisplayName ||
              mp.match.hostEmojiId !== null;
            return (
              <MatchCard
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
              </MatchCard>
            );
          })}
          <ConnectorSvg
            width={bracketLayout.width}
            height={bracketLayout.height}
            viewBox={`0 0 ${bracketLayout.width} ${bracketLayout.height}`}
          >
            {bracketLayout.connectors.map((d, i) => (
              <path key={i} d={d} />
            ))}
          </ConnectorSvg>
        </BracketContainer>
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
                          size={BRACKET_AVATAR_PX}
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
                            size={BRACKET_AVATAR_PX}
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

      <BottomBar>
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

          {eventUiState.isJoined && eventRecord?.status === "scheduled" && (
            <>
              <FooterButton type="button" $primary={true} disabled={true}>
                Play
              </FooterButton>
              {nowMs >= eventRecord.startAtMs && (
                <FooterNote>waiting for more players</FooterNote>
              )}
            </>
          )}

          {eventRecord?.status === "active" && eventUiState.playableMatch && (
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

          {eventRecord?.status === "active" &&
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
            eventRecord?.status === "scheduled" &&
            !isJoinWindowOpen && (
              <FooterNote>
                {Object.keys(eventRecord.participants ?? {}).length < 2
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
