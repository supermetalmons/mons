import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import styled, { css } from "styled-components";
import { FaLink, FaShareAlt } from "react-icons/fa";
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
import { BottomPillButton } from "./BottomControlsStyles";

const BRACKET_MATCH_W = 72;
const BRACKET_MATCH_H = 40;
const BRACKET_AVATAR_PX = 28;
const BRACKET_SLOT_PITCH = 88;
const BRACKET_CONNECTOR_W = 40;
const BRACKET_COMPACT_CONNECTOR_W = 18;
const BRACKET_EDGE_PADDING_X = 24;
const BRACKET_EDGE_PADDING_Y = 16;
const BRACKET_CORNER_R = 10;

const FALLBACK_MATCH_H = 40;
const FALLBACK_AVATAR_PX = 28;

type BracketCardInteraction = "none" | "game" | "participant";

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

  img {
    user-select: none;
    -webkit-user-select: none;
    -ms-user-select: none;
    -webkit-user-drag: none;
    pointer-events: none;
  }

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
  color: rgba(0, 0, 0, 0.16);
  font-size: 0.95rem;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  opacity: 0;

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      opacity: 0;
    }
  }

  @media (prefers-color-scheme: dark) {
    color: rgba(255, 255, 255, 0.24);
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

const Avatar = styled.img.attrs({
  draggable: false,
})<{ $size?: number }>`
  user-select: none;
  -webkit-user-select: none;
  -ms-user-select: none;
  -webkit-user-drag: none;
  pointer-events: none;
  width: ${(props) => props.$size ?? 24}px;
  height: ${(props) => props.$size ?? 24}px;
  border-radius: ${(props) =>
    Math.max(4, Math.round((props.$size ?? 24) / 4))}px;
  flex-shrink: 0;
`;

const AvatarFallback = styled.div<{ $size?: number }>`
  width: ${(props) => Math.round((props.$size ?? 24) * 0.7)}px;
  height: ${(props) => Math.round((props.$size ?? 24) * 0.7)}px;
  border-radius: 50%;
  background: rgba(128, 128, 128, 0.13);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: ${(props) => Math.round((props.$size ?? 24) * 0.38)}px;
  font-weight: 600;
  color: rgba(128, 128, 128, 0.55);
  line-height: 1;
  user-select: none;

  @media (prefers-color-scheme: dark) {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.3);
  }
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
    stroke: rgba(160, 160, 160, 0.5);
    stroke-width: 2;
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
  $w: number;
  $h: number;
  $interaction: BracketCardInteraction;
}>`
  position: absolute;
  left: ${(p) => p.$x}px;
  top: ${(p) => p.$y}px;
  width: ${(p) => p.$w}px;
  height: ${(p) => p.$h}px;
  border: none;
  border-radius: ${(p) => Math.round(Math.min(p.$w, p.$h) / 2)}px;
  padding: 4px;
  box-sizing: border-box;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: ${(p) => (p.$interaction === "none" ? "default" : "pointer")};
  -webkit-tap-highlight-color: transparent;
  background: var(--color-gray-f0);
  transition: background-color 0.15s ease;
  overflow: visible;

  @media (hover: hover) and (pointer: fine) {
    ${(p) =>
      p.$interaction === "game"
        ? css`
            &:hover:not(:disabled) {
              background: var(--color-gray-e0);
            }
          `
        : ""}

    ${(p) =>
      p.$interaction === "participant"
        ? css`
            &:hover [data-avatar-slot][data-single-known="true"] {
              transform: scale(1.08);
            }
          `
        : ""}
  }

  @media (prefers-color-scheme: dark) {
    background: var(--color-gray-27);

    @media (hover: hover) and (pointer: fine) {
      ${(p) =>
        p.$interaction === "game"
          ? css`
              &:hover:not(:disabled) {
                background: var(--color-gray-33);
              }
            `
          : ""}

      ${(p) =>
        p.$interaction === "participant"
          ? css`
              &:hover [data-avatar-slot][data-single-known="true"] {
                transform: scale(1.08);
              }
            `
          : ""}
    }
  }
`;

const MatchAvatarSlot = styled.div`
  line-height: 0;
  transition: transform 0.15s ease;
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

const BracketFallbackMatchCard = styled.button<{
  $interaction: BracketCardInteraction;
}>`
  min-height: ${FALLBACK_MATCH_H}px;
  border: none;
  border-radius: ${FALLBACK_MATCH_H / 2}px;
  padding: 6px;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: ${(p) => (p.$interaction === "none" ? "default" : "pointer")};
  -webkit-tap-highlight-color: transparent;
  background: var(--color-gray-f0);
  transition: background-color 0.15s ease;
  overflow: visible;

  @media (hover: hover) and (pointer: fine) {
    ${(p) =>
      p.$interaction === "game"
        ? css`
            &:hover:not(:disabled) {
              background: var(--color-gray-e0);
            }
          `
        : ""}

    ${(p) =>
      p.$interaction === "participant"
        ? css`
            &:hover [data-avatar-slot][data-single-known="true"] {
              transform: scale(1.08);
            }
          `
        : ""}
  }

  @media (prefers-color-scheme: dark) {
    background: var(--color-gray-27);

    @media (hover: hover) and (pointer: fine) {
      ${(p) =>
        p.$interaction === "game"
          ? css`
              &:hover:not(:disabled) {
                background: var(--color-gray-33);
              }
            `
          : ""}

      ${(p) =>
        p.$interaction === "participant"
          ? css`
              &:hover [data-avatar-slot][data-single-known="true"] {
                transform: scale(1.08);
              }
            `
          : ""}
    }
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
  gap: 8px;
  flex-wrap: wrap;
  max-width: min(560px, calc(100vw - 40px));
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
  border: none;
  pointer-events: none;
  text-align: center;

  @media (prefers-color-scheme: dark) {
    background: rgba(12, 12, 12, 0.82);
    border-color: rgba(255, 255, 255, 0.12);
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
const JOIN_SIGN_IN_LABEL_TIMEOUT_MS = 1200;
const EVENT_SYNC_RETRY_DELAYS_MS = [500, 1500, 3000];

const formatRelativeStart = (
  event: EventRecord | null,
  nowMs: number,
): string => {
  if (!event) {
    return "";
  }
  if (event.status === "dismissed") {
    return "";
  }
  if (event.status === "ended") {
    return event.winnerDisplayName ? "" : "event ended";
  }
  if (event.status === "active") {
    return "";
  }
  const deltaMs = event.startAtMs - nowMs;
  if (deltaMs <= 0) {
    const participantCount = Object.keys(event.participants).length;
    return participantCount < 2 ? "" : "starting now";
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

type MatchSide = "host" | "guest";

type MatchSideData = {
  profileId: string | null;
  loginUid: string | null;
  displayName: string | null;
  emojiId: number | null;
  aura: string | null;
};

type BracketMatchAction =
  | { kind: "none" }
  | { kind: "game"; inviteId: string }
  | {
      kind: "participant";
      participant: EventParticipant;
      side: MatchSide;
    };

const getMatchSideData = (
  match: EventMatch,
  side: MatchSide,
): MatchSideData => {
  if (side === "host") {
    return {
      profileId: match.hostProfileId,
      loginUid: match.hostLoginUid,
      displayName: match.hostDisplayName,
      emojiId: match.hostEmojiId,
      aura: match.hostAura,
    };
  }
  return {
    profileId: match.guestProfileId,
    loginUid: match.guestLoginUid,
    displayName: match.guestDisplayName,
    emojiId: match.guestEmojiId,
    aura: match.guestAura,
  };
};

const isKnownMatchSide = (side: MatchSideData): boolean => {
  const displayName = side.displayName?.trim();
  return (
    !!side.profileId ||
    !!side.loginUid ||
    !!displayName ||
    (typeof side.emojiId === "number" && Number.isFinite(side.emojiId))
  );
};

const getSingleKnownMatchSide = (match: EventMatch): MatchSide | null => {
  const hostKnown = isKnownMatchSide(getMatchSideData(match, "host"));
  const guestKnown = isKnownMatchSide(getMatchSideData(match, "guest"));
  if (hostKnown === guestKnown) {
    return null;
  }
  return hostKnown ? "host" : "guest";
};

const getDisplayedByeSide = (match: EventMatch): MatchSide => {
  return isKnownMatchSide(getMatchSideData(match, "host")) ? "host" : "guest";
};

const buildParticipantFromMatchSide = (
  match: EventMatch,
  side: MatchSide,
  participantsById: Record<string, EventParticipant>,
): EventParticipant | null => {
  const sideData = getMatchSideData(match, side);
  const sideProfileId = sideData.profileId?.trim() ?? "";
  if (sideProfileId) {
    const participant = participantsById[sideProfileId];
    if (participant) {
      const participantLoginUid = participant.loginUid?.trim() ?? "";
      if (participantLoginUid) {
        return participant;
      }
      const sideLoginUid = sideData.loginUid?.trim() ?? "";
      if (sideLoginUid) {
        return {
          ...participant,
          loginUid: sideLoginUid,
        };
      }
    }
  }

  const loginUid = sideData.loginUid?.trim() ?? "";
  if (!loginUid) {
    return null;
  }

  const displayName = sideData.displayName?.trim() ?? "";
  const emojiId =
    typeof sideData.emojiId === "number" && Number.isFinite(sideData.emojiId)
      ? sideData.emojiId
      : 0;

  return {
    profileId: sideProfileId || loginUid,
    loginUid,
    username: displayName,
    displayName,
    emojiId,
    aura: sideData.aura ?? "",
    joinedAtMs: 0,
    state: "active",
    eliminatedRoundIndex: null,
    eliminatedByProfileId: null,
  };
};

const getBracketMatchAction = (
  match: EventMatch,
  participantsById: Record<string, EventParticipant>,
): BracketMatchAction => {
  const inviteId = match.inviteId?.trim() ?? "";
  if (inviteId) {
    return {
      kind: "game",
      inviteId,
    };
  }

  const singleKnownSide = getSingleKnownMatchSide(match);
  if (!singleKnownSide) {
    return { kind: "none" };
  }

  const participant = buildParticipantFromMatchSide(
    match,
    singleKnownSide,
    participantsById,
  );
  if (!participant) {
    return { kind: "none" };
  }

  return {
    kind: "participant",
    participant,
    side: singleKnownSide,
  };
};

type IndexedEventMatch = {
  roundIndex: number;
  matchIndex: number;
  match: EventMatch;
};

const getEventMatchInviteId = (match: EventMatch): string => {
  return match.inviteId?.trim() ?? "";
};

const isResolvedEventMatch = (match: EventMatch): boolean => {
  return (
    match.status === "host" || match.status === "guest" || match.status === "bye"
  );
};

const isPendingInviteEventMatch = (match: EventMatch): boolean => {
  return match.status === "pending" && getEventMatchInviteId(match) !== "";
};

const getIndexedMatchesForRound = (round: EventRound): IndexedEventMatch[] => {
  return getSortedMatches(round).map((match, sortedIndex) => ({
    roundIndex: round.roundIndex,
    matchIndex: parseBracketMatchKey(match.matchKey)?.matchIndex ?? sortedIndex,
    match,
  }));
};

const getFirstPendingInviteMatch = (event: EventRecord | null): EventMatch | null => {
  if (!event) {
    return null;
  }
  const rounds = getSortedRounds(event);
  for (const round of rounds) {
    const indexedMatches = getIndexedMatchesForRound(round);
    for (const indexedMatch of indexedMatches) {
      if (isPendingInviteEventMatch(indexedMatch.match)) {
        return indexedMatch.match;
      }
    }
  }
  return null;
};

const getRoundMatchByIndex = (
  round: EventRound,
  matchIndex: number,
): EventMatch | null => {
  const directMatch = round.matches[`${round.roundIndex}_${matchIndex}`];
  if (directMatch) {
    return directMatch;
  }
  const fallbackMatch =
    getSortedMatches(round).find((candidate) => {
      const parsed = parseBracketMatchKey(candidate.matchKey);
      return parsed?.matchIndex === matchIndex;
    }) ?? null;
  return fallbackMatch;
};

const findPendingInviteMatchInBranch = (
  roundsByIndex: Map<number, EventRound>,
  roundIndex: number,
  matchIndex: number,
): EventMatch | null => {
  if (roundIndex < 0 || !Number.isFinite(matchIndex) || matchIndex < 0) {
    return null;
  }
  const round = roundsByIndex.get(roundIndex);
  if (!round) {
    return null;
  }
  const match = getRoundMatchByIndex(round, matchIndex);
  if (!match) {
    return null;
  }
  if (isPendingInviteEventMatch(match)) {
    return match;
  }
  if (isResolvedEventMatch(match) || roundIndex === 0) {
    return null;
  }
  const leftBranchMatch = findPendingInviteMatchInBranch(
    roundsByIndex,
    roundIndex - 1,
    matchIndex * 2,
  );
  if (leftBranchMatch) {
    return leftBranchMatch;
  }
  return findPendingInviteMatchInBranch(
    roundsByIndex,
    roundIndex - 1,
    matchIndex * 2 + 1,
  );
};

const getAwaitedPendingInviteMatchForParticipant = (
  event: EventRecord | null,
  profileId: string,
): EventMatch | null => {
  if (!event || !profileId) {
    return null;
  }
  const rounds = getSortedRounds(event);
  const roundsByIndex = new Map<number, EventRound>();
  for (const round of rounds) {
    roundsByIndex.set(round.roundIndex, round);
  }

  for (const round of rounds) {
    const indexedMatches = getIndexedMatchesForRound(round);
    for (const indexedMatch of indexedMatches) {
      const match = indexedMatch.match;
      const participantSide: MatchSide | null =
        match.hostProfileId === profileId
          ? "host"
          : match.guestProfileId === profileId
            ? "guest"
            : null;
      if (!participantSide) {
        continue;
      }
      if (isResolvedEventMatch(match) || isPendingInviteEventMatch(match)) {
        continue;
      }
      if (indexedMatch.roundIndex <= 0) {
        continue;
      }
      const awaitedMatchIndex =
        indexedMatch.matchIndex * 2 + (participantSide === "host" ? 1 : 0);
      const awaitedMatch = findPendingInviteMatchInBranch(
        roundsByIndex,
        indexedMatch.roundIndex - 1,
        awaitedMatchIndex,
      );
      if (awaitedMatch) {
        return awaitedMatch;
      }
    }
  }
  return null;
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

const getWatchableMatch = (
  event: EventRecord | null,
  profileId: string,
  eventUiState: EventUiState,
): EventMatch | null => {
  if (!event || event.status !== "active" || eventUiState.playableMatch) {
    return null;
  }
  if (
    eventUiState.isJoined &&
    !eventUiState.isEliminated &&
    eventUiState.waitingForNext
  ) {
    const awaitedMatch = getAwaitedPendingInviteMatchForParticipant(
      event,
      profileId,
    );
    if (awaitedMatch) {
      return awaitedMatch;
    }
  }
  return getFirstPendingInviteMatch(event);
};

type ClassicBracketMatchPosition = {
  x: number;
  y: number;
  key: string;
  match: EventMatch;
  width: number;
  height: number;
};

type ClassicBracketLayout = {
  width: number;
  height: number;
  positions: ClassicBracketMatchPosition[];
  connectors: string[];
};

type BracketMatchLayout = {
  width: number;
  height: number;
  useCompactEntry: boolean;
};

const getBracketMatchLayout = (
  roundIndex: number,
  totalRounds: number,
): BracketMatchLayout => {
  return {
    width: BRACKET_MATCH_W,
    height: BRACKET_MATCH_H,
    useCompactEntry: roundIndex < totalRounds - 1,
  };
};

const getBracketMatchTop = (
  depthIndex: number,
  matchIndex: number,
  matchHeight: number,
): number => {
  const slotSpan = BRACKET_SLOT_PITCH * Math.pow(2, depthIndex);
  return Math.round((slotSpan - matchHeight) / 2 + matchIndex * slotSpan);
};

const getBracketMatchCenterY = (
  depthIndex: number,
  matchIndex: number,
  matchHeight: number,
): number => {
  return (
    getBracketMatchTop(depthIndex, matchIndex, matchHeight) + matchHeight / 2
  );
};

const getClassicConnectorMidX = (x1: number, x2: number): number => {
  return x1 + (x2 - x1) / 2;
};

const buildClassicElbowConnectorPath = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): string => {
  const direction = x2 >= x1 ? 1 : -1;
  const mx = getClassicConnectorMidX(x1, x2);
  const dy = y2 - y1;
  if (Math.abs(dy) < 1) {
    return `M${x1},${y1}H${x2}`;
  }
  const signY = dy > 0 ? 1 : -1;
  const r = Math.min(
    BRACKET_CORNER_R,
    Math.abs(dy) / 2,
    Math.abs(mx - x1),
    Math.abs(x2 - mx),
  );
  if (r < 1) {
    return `M${x1},${y1}H${mx}V${y2}H${x2}`;
  }
  return [
    `M${x1},${y1}`,
    `H${mx - direction * r}`,
    `Q${mx},${y1} ${mx},${y1 + signY * r}`,
    `V${y2 - signY * r}`,
    `Q${mx},${y2} ${mx + direction * r},${y2}`,
    `H${x2}`,
  ].join("");
};

const buildClassicTopBottomEntryConnectorPath = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): string => {
  const direction = x2 >= x1 ? 1 : -1;
  const dy = y2 - y1;
  if (Math.abs(dy) < 1) {
    return `M${x1},${y1}H${x2}`;
  }
  const signY = dy > 0 ? 1 : -1;
  const r = Math.min(BRACKET_CORNER_R, Math.abs(dy), Math.abs(x2 - x1));
  if (r < 1) {
    return `M${x1},${y1}H${x2}V${y2}`;
  }
  return [
    `M${x1},${y1}`,
    `H${x2 - direction * r}`,
    `Q${x2},${y1} ${x2},${y1 + signY * r}`,
    `V${y2}`,
  ].join("");
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
  const roundLayouts = rounds.map((_, roundIndex) =>
    getBracketMatchLayout(roundIndex, totalRounds),
  );
  const finalLayout = roundLayouts[totalRounds - 1];

  if (sideRounds === 0) {
    const match = getSortedMatches(rounds[0])[0];
    if (!match) return null;
    return {
      width: finalLayout.width,
      height: finalLayout.height,
      positions: [
        {
          x: 0,
          y: 0,
          key: "FINAL",
          match,
          width: finalLayout.width,
          height: finalLayout.height,
        },
      ],
      connectors: [],
    };
  }

  const totalCols = 2 * sideRounds + 1;
  const columnRoundIndices = [
    ...Array.from({ length: sideRounds }, (_, roundIndex) => roundIndex),
    totalRounds - 1,
    ...Array.from(
      { length: sideRounds },
      (_, offset) => sideRounds - 1 - offset,
    ),
  ];
  const columnWidths = [
    ...roundLayouts.slice(0, sideRounds).map((layout) => layout.width),
    finalLayout.width,
    ...roundLayouts
      .slice(0, sideRounds)
      .reverse()
      .map((layout) => layout.width),
  ];
  const gapAfterColumn = Array.from(
    { length: Math.max(0, totalCols - 1) },
    (_, colIndex) => {
      const inwardColumnIndex = colIndex < sideRounds ? colIndex + 1 : colIndex;
      if (inwardColumnIndex === sideRounds) {
        return BRACKET_CONNECTOR_W;
      }
      const inwardRoundIndex = columnRoundIndices[inwardColumnIndex];
      return roundLayouts[inwardRoundIndex]?.useCompactEntry
        ? BRACKET_COMPACT_CONNECTOR_W
        : BRACKET_CONNECTOR_W;
    },
  );
  const columnX: number[] = [];
  let currentX = 0;
  for (let i = 0; i < totalCols; i += 1) {
    columnX.push(currentX);
    currentX += columnWidths[i] + (gapAfterColumn[i] ?? 0);
  }
  const width =
    totalCols === 0 ? 0 : columnX[totalCols - 1] + columnWidths[totalCols - 1];

  const positions: ClassicBracketMatchPosition[] = [];
  const connectors: string[] = [];
  let maxBottom = 0;

  const colX = (col: number): number => columnX[col] ?? 0;
  const pushPosition = (
    x: number,
    y: number,
    key: string,
    match: EventMatch,
    layout: BracketMatchLayout,
  ): void => {
    positions.push({
      x,
      y,
      key,
      match,
      width: layout.width,
      height: layout.height,
    });
    maxBottom = Math.max(maxBottom, y + layout.height);
  };

  // Left side: columns 0 to sideRounds-1
  for (let r = 0; r < sideRounds; r++) {
    const layout = roundLayouts[r];
    const x = colX(r);
    const roundMatches = getSortedMatches(rounds[r]);
    const perSideCount = Math.ceil(roundMatches.length / 2);

    for (let m = 0; m < perSideCount; m++) {
      const match = roundMatches[m];
      const y = getBracketMatchTop(r, m, layout.height);
      pushPosition(x, y, `L${r}_${m}`, match, layout);
    }

    // Connectors from this round to the next (inward)
    if (r < sideRounds - 1) {
      const nextX = colX(r + 1);
      const nextLayout = roundLayouts[r + 1];
      const nextPerSideCount = Math.ceil(
        getSortedMatches(rounds[r + 1]).length / 2,
      );
      for (let j = 0; j < nextPerSideCount; j++) {
        const srcA = 2 * j;
        const srcB = 2 * j + 1;
        if (srcA >= perSideCount) {
          continue;
        }
        const y1 = getBracketMatchCenterY(r, srcA, layout.height);
        const nextMatchTop = getBracketMatchTop(r + 1, j, nextLayout.height);
        const sx = x + layout.width;
        if (nextLayout.useCompactEntry) {
          const entryX = nextX + nextLayout.width / 2;
          connectors.push(
            buildClassicTopBottomEntryConnectorPath(
              sx,
              y1,
              entryX,
              nextMatchTop,
            ),
          );
          if (srcB < perSideCount) {
            const y2 = getBracketMatchCenterY(r, srcB, layout.height);
            connectors.push(
              buildClassicTopBottomEntryConnectorPath(
                sx,
                y2,
                entryX,
                nextMatchTop + nextLayout.height,
              ),
            );
          }
        }
      }
    }

    // Connector from last side round to center final
    if (r === sideRounds - 1) {
      const y = getBracketMatchCenterY(r, 0, layout.height);
      const sx = x + layout.width;
      const ex = colX(sideRounds);
      const finalY = getBracketMatchCenterY(r, 0, finalLayout.height);
      connectors.push(buildClassicElbowConnectorPath(sx, y, ex, finalY));
    }
  }

  // Final: center column
  {
    const x = colX(sideRounds);
    const finalRound = rounds[totalRounds - 1];
    const finalMatches = getSortedMatches(finalRound);
    const match = finalMatches[0];
    if (match) {
      const y = getBracketMatchTop(sideRounds - 1, 0, finalLayout.height);
      pushPosition(x, y, "FINAL", match, finalLayout);
    }
  }

  // Right side: columns sideRounds+1 to 2*sideRounds
  for (let r = 0; r < sideRounds; r++) {
    const layout = roundLayouts[r];
    const col = 2 * sideRounds - r;
    const x = colX(col);
    const roundMatches = getSortedMatches(rounds[r]);
    const totalCount = roundMatches.length;
    const perSideCount = Math.ceil(totalCount / 2);
    const offset = perSideCount;

    for (let m = 0; m < totalCount - perSideCount; m++) {
      const match = roundMatches[offset + m];
      const y = getBracketMatchTop(r, m, layout.height);
      pushPosition(x, y, `R${r}_${m}`, match, layout);
    }

    // Connectors (going leftward toward center)
    if (r < sideRounds - 1) {
      const innerCol = 2 * sideRounds - (r + 1);
      const innerX = colX(innerCol);
      const nextLayout = roundLayouts[r + 1];
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
        const y1 = getBracketMatchCenterY(r, srcA, layout.height);
        const nextMatchTop = getBracketMatchTop(r + 1, j, nextLayout.height);
        const sx = x;
        if (nextLayout.useCompactEntry) {
          const entryX = innerX + nextLayout.width / 2;
          connectors.push(
            buildClassicTopBottomEntryConnectorPath(
              sx,
              y1,
              entryX,
              nextMatchTop,
            ),
          );
          if (srcB < currentSideCount) {
            const y2 = getBracketMatchCenterY(r, srcB, layout.height);
            connectors.push(
              buildClassicTopBottomEntryConnectorPath(
                sx,
                y2,
                entryX,
                nextMatchTop + nextLayout.height,
              ),
            );
          }
        }
      }
    }

    // Connector from right semi to center final
    if (r === sideRounds - 1) {
      const y = getBracketMatchCenterY(r, 0, layout.height);
      const sx = x;
      const ex = colX(sideRounds) + finalLayout.width;
      const finalY = getBracketMatchCenterY(r, 0, finalLayout.height);
      connectors.push(buildClassicElbowConnectorPath(sx, y, ex, finalY));
    }
  }

  return {
    width,
    height: Math.max(maxBottom, finalLayout.height),
    positions,
    connectors,
  };
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
  return (
    <AvatarFallback $size={size} aria-hidden="true">
      ?
    </AvatarFallback>
  );
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
  const [isLoading, setIsLoading] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [joinButtonState, setJoinButtonState] = useState<"idle" | "sign_in">(
    "idle",
  );
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
  const copyResetTimeoutRef = useRef<number | null>(null);
  const joinButtonResetTimeoutRef = useRef<number | null>(null);
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
  }, [modalState.eventId, modalState.isOpen]);

  useEffect(() => {
    if (!modalState.isOpen || !modalState.eventId) {
      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current);
        copyResetTimeoutRef.current = null;
      }
      if (joinButtonResetTimeoutRef.current !== null) {
        window.clearTimeout(joinButtonResetTimeoutRef.current);
        joinButtonResetTimeoutRef.current = null;
      }
      setEventRecord(null);
      setCopyState("idle");
      setJoinButtonState("idle");
      setIsLoading(false);
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
    return () => {
      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current);
        copyResetTimeoutRef.current = null;
      }
      if (joinButtonResetTimeoutRef.current !== null) {
        window.clearTimeout(joinButtonResetTimeoutRef.current);
        joinButtonResetTimeoutRef.current = null;
      }
    };
  }, []);

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
        setJoinButtonState("idle");
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
      if (joinButtonResetTimeoutRef.current !== null) {
        window.clearTimeout(joinButtonResetTimeoutRef.current);
        joinButtonResetTimeoutRef.current = null;
      }
      setJoinButtonState("idle");
      setIsLoading(true);
      void connection
        .joinEvent(eventId)
        .catch(() => {})
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
  const participantsById = displayedEventRecord?.participants ?? {};
  const participants = useMemo(
    () => getSortedParticipants(displayedEventRecord),
    [displayedEventRecord],
  );
  const rounds = useMemo(
    () => getSortedRounds(displayedEventRecord),
    [displayedEventRecord],
  );
  const currentProfileId = storage.getProfileId("");
  const joinButtonLabel =
    joinButtonState === "sign_in" ? "Please Sign In" : "Join";
  const eventUiState = useMemo(
    () => getCurrentUiState(displayedEventRecord, currentProfileId),
    [currentProfileId, displayedEventRecord],
  );
  const watchableMatch = useMemo(
    () => getWatchableMatch(displayedEventRecord, currentProfileId, eventUiState),
    [currentProfileId, displayedEventRecord, eventUiState],
  );
  const currentRoute = getCurrentRouteState();

  useEffect(() => {
    if (displayedEventRecord?.status === "dismissed") {
      setShowDevHelperPanel(false);
    }
  }, [displayedEventRecord]);

  const canRenderBracket = useMemo(
    () => canRenderSymmetricalBracket(rounds),
    [rounds],
  );
  const bracketLayout = useMemo(() => {
    if (!canRenderBracket) {
      return null;
    }
    return computeSymmetricalBracket(rounds);
  }, [canRenderBracket, rounds]);

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

    const reservedTop = bracketInsets.top + BRACKET_EDGE_PADDING_Y;
    const reservedBottom = bracketInsets.bottom + BRACKET_EDGE_PADDING_Y;
    const availW = Math.max(1, viewportSize.width - BRACKET_EDGE_PADDING_X * 2);
    const availH = Math.max(
      1,
      viewportSize.height - reservedTop - reservedBottom,
    );
    const sx = availW / bracketLayout.width;
    const sy = availH / bracketLayout.height;
    const scale = Math.min(1, sx, sy);
    return Number.isFinite(scale) ? Math.max(0, scale) : 1;
  }, [
    bracketLayout,
    bracketInsets.bottom,
    bracketInsets.top,
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

  const copyEventLinkToClipboard = useCallback(() => {
    if (!modalState.eventId || typeof window === "undefined") {
      return;
    }
    connection.writeEventLinkToClipboard(modalState.eventId);
    setCopyState("copied");
    if (copyResetTimeoutRef.current !== null) {
      window.clearTimeout(copyResetTimeoutRef.current);
    }
    copyResetTimeoutRef.current = window.setTimeout(() => {
      copyResetTimeoutRef.current = null;
      setCopyState("idle");
    }, 1200);
  }, [modalState.eventId]);

  const handleCopyClick = useCallback(() => {
    copyEventLinkToClipboard();
  }, [copyEventLinkToClipboard]);

  const handleShareClick = useCallback(async () => {
    if (!modalState.eventId || typeof window === "undefined") {
      return;
    }
    const link = `${window.location.origin}/event/${modalState.eventId}`;
    const shareData = {
      url: link,
      title: "Play Mons",
    };
    if (typeof navigator.share !== "function") {
      copyEventLinkToClipboard();
      return;
    }
    if (typeof navigator.canShare === "function") {
      let canShareData = false;
      try {
        canShareData = navigator.canShare(shareData);
      } catch {
        canShareData = false;
      }
      if (!canShareData) {
        copyEventLinkToClipboard();
        return;
      }
    }
    try {
      await navigator.share(shareData);
    } catch (error) {
      const errorName =
        typeof error === "object" &&
        error !== null &&
        "name" in error &&
        typeof (error as { name?: unknown }).name === "string"
          ? (error as { name: string }).name
          : "";
      if (errorName === "AbortError") {
        return;
      }
      copyEventLinkToClipboard();
    }
  }, [copyEventLinkToClipboard, modalState.eventId]);

  const handleJoinClick = useCallback(() => {
    if (!modalState.eventId) {
      return;
    }
    if (storage.getProfileId("") === "") {
      setPendingJoinEventId(modalState.eventId);
      setPendingJoinRequestedAtMs(Date.now());
      setJoinButtonState("sign_in");
      if (joinButtonResetTimeoutRef.current !== null) {
        window.clearTimeout(joinButtonResetTimeoutRef.current);
      }
      joinButtonResetTimeoutRef.current = window.setTimeout(() => {
        joinButtonResetTimeoutRef.current = null;
        setJoinButtonState("idle");
      }, JOIN_SIGN_IN_LABEL_TIMEOUT_MS);
      openProfileSignInPopup();
      return;
    }
    if (joinButtonResetTimeoutRef.current !== null) {
      window.clearTimeout(joinButtonResetTimeoutRef.current);
      joinButtonResetTimeoutRef.current = null;
    }
    setJoinButtonState("idle");
    setPendingJoinEventId(null);
    setPendingJoinRequestedAtMs(0);
    setIsLoading(true);
    void connection
      .joinEvent(modalState.eventId)
      .catch(() => {})
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
      try {
        const profile = await resolveParticipantProfile(participant);
        if (participantLookupSessionRef.current !== lookupSession) {
          return;
        }
        if (!profile) {
          return;
        }
        await showShinyCard(
          profile,
          getParticipantDisplayName(participant),
          true,
        );
      } catch {
        if (participantLookupSessionRef.current !== lookupSession) {
          return;
        }
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

  const handleBracketMatchAction = useCallback(
    (action: BracketMatchAction) => {
      if (action.kind === "game") {
        void openMatch(action.inviteId);
        return;
      }
      if (action.kind === "participant") {
        void handleParticipantClick(action.participant);
      }
    },
    [handleParticipantClick, openMatch],
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

  if (!modalState.isOpen) {
    return null;
  }

  const hasBracket =
    (displayedEventRecord?.status === "active" ||
      displayedEventRecord?.status === "ended") &&
    bracketLayout !== null;
  const isDismissedState = displayedEventRecord?.status === "dismissed";
  const displayedParticipantCount = displayedEventRecord
    ? Object.keys(displayedEventRecord.participants ?? {}).length
    : 0;
  const isPendingDismissState =
    displayedEventRecord?.status === "scheduled" &&
    Date.now() >= displayedEventRecord.startAtMs &&
    displayedParticipantCount < 2;
  const isBracketStatus =
    displayedEventRecord?.status === "active" ||
    displayedEventRecord?.status === "ended";
  const showBracketFallbackGrid =
    isBracketStatus && !hasBracket && bracketFallbackRounds.length > 0;
  const showParticipantsPanel =
    !!displayedEventRecord &&
    !isBracketStatus &&
    !isDismissedState &&
    !isPendingDismissState;
  const pendingCreateStatusText =
    modalState.isPendingCreate && !modalState.eventId
      ? modalState.pendingCreateError || "CREATING"
      : null;
  const overlayStatusText = pendingCreateStatusText
    ? pendingCreateStatusText
    : isDismissedState
      ? "EVENT DISMISSED"
    : isPendingDismissState
      ? "LOADING"
    : !displayedEventRecord
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
      {modalState.eventId && !isDismissedState && (
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
              {devStubRecord && (
                <DevHelperAction type="button" onClick={handleResetStubBracket}>
                  Live
                </DevHelperAction>
              )}
            </DevHelperPanel>
          )}
        </DevBracketHelper>
      )}

      {!isDismissedState && (
        <TopBar ref={topBarRef}>
          <TopBarTitle>
            {devStubRecord
              ? ""
              : formatRelativeStart(displayedEventRecord, nowMs)}
          </TopBarTitle>
        </TopBar>
      )}

      {overlayStatusText && <OverlayStatus>{overlayStatusText}</OverlayStatus>}

      {hasBracket && bracketLayout && (
        <BracketPlacement $offsetY={bracketOffsetY}>
          <BracketContainer
            $w={bracketLayout.width}
            $h={bracketLayout.height}
            $scale={bracketScale}
          >
            {bracketLayout.positions.map((mp) => {
              const action = getBracketMatchAction(mp.match, participantsById);
              const interaction: BracketCardInteraction =
                action.kind === "game"
                  ? "game"
                  : action.kind === "participant"
                    ? "participant"
                    : "none";
              const hostSideData = getMatchSideData(mp.match, "host");
              const guestSideData = getMatchSideData(mp.match, "guest");
              const displayedSides: MatchSide[] =
                mp.match.status === "bye"
                  ? [getDisplayedByeSide(mp.match)]
                  : ["host", "guest"];
              return (
                <ClassicMatchCard
                  key={mp.key}
                  type="button"
                  $x={mp.x}
                  $y={mp.y}
                  $w={mp.width}
                  $h={mp.height}
                  $interaction={interaction}
                  disabled={action.kind === "none"}
                  onClick={() => handleBracketMatchAction(action)}
                >
                  {displayedSides.map((side) => {
                    const sideData = side === "host" ? hostSideData : guestSideData;
                    return (
                      <MatchAvatarSlot
                        key={side}
                        data-avatar-slot
                        data-single-known={
                          action.kind === "participant" && action.side === side
                            ? "true"
                            : undefined
                        }
                      >
                        <EventAvatar
                          size={BRACKET_AVATAR_PX}
                          emojiId={sideData.emojiId}
                          displayName={sideData.displayName}
                        />
                      </MatchAvatarSlot>
                    );
                  })}
                </ClassicMatchCard>
              );
            })}
            <ClassicConnectorSvg
              width={bracketLayout.width}
              height={bracketLayout.height}
              viewBox={`0 0 ${bracketLayout.width} ${bracketLayout.height}`}
            >
              {bracketLayout.connectors.map((d, i) => (
                <path key={i} d={d} />
              ))}
            </ClassicConnectorSvg>
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
                  const action = getBracketMatchAction(match, participantsById);
                  const interaction: BracketCardInteraction =
                    action.kind === "game"
                      ? "game"
                      : action.kind === "participant"
                        ? "participant"
                        : "none";
                  const hostSideData = getMatchSideData(match, "host");
                  const guestSideData = getMatchSideData(match, "guest");
                  const displayedSides: MatchSide[] =
                    match.status === "bye"
                      ? [getDisplayedByeSide(match)]
                      : ["host", "guest"];
                  return (
                    <BracketFallbackMatchCard
                      key={`${round.key}_${match.matchKey}_${index}`}
                      type="button"
                      $interaction={interaction}
                      disabled={action.kind === "none"}
                      onClick={() => handleBracketMatchAction(action)}
                    >
                      {displayedSides.map((side) => {
                        const sideData =
                          side === "host" ? hostSideData : guestSideData;
                        return (
                          <MatchAvatarSlot
                            key={side}
                            data-avatar-slot
                            data-single-known={
                              action.kind === "participant" && action.side === side
                                ? "true"
                                : undefined
                            }
                          >
                            <EventAvatar
                              size={FALLBACK_AVATAR_PX}
                              emojiId={sideData.emojiId}
                              displayName={sideData.displayName}
                            />
                          </MatchAvatarSlot>
                        );
                      })}
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
                  {participant.state === "winner"
                    ? "winner"
                    : participant.state === "eliminated"
                      ? "out"
                      : ""}
                </ParticipantState>
              </ParticipantRow>
            ))}
          </ParticipantsList>
        </ContentArea>
      )}

      {modalState.eventId && !isDismissedState && (
        <BottomBar ref={bottomBarRef}>
          <ButtonRow>
            <BottomPillButton
              type="button"
              isBlue={true}
              onClick={handleCopyClick}
            >
              {copyState !== "copied" && <FaLink />}
              {copyState === "copied" ? "Link is copied" : "Copy Link"}
            </BottomPillButton>
            <BottomPillButton
              type="button"
              isBlue={true}
              onClick={handleShareClick}
            >
              <FaShareAlt />
              Share
            </BottomPillButton>

            {!eventUiState.isJoined && isJoinWindowOpen && (
              <BottomPillButton
                type="button"
                onClick={handleJoinClick}
                disabled={isLoading}
                isViewOnly={isLoading}
              >
                {joinButtonLabel}
              </BottomPillButton>
            )}

            {displayedEventRecord?.status === "active" &&
              eventUiState.playableMatch && (
                <BottomPillButton
                  type="button"
                  onClick={() =>
                    void openMatch(
                      eventUiState.playableMatch!.inviteId as string,
                    )
                  }
                >
                  Play
                </BottomPillButton>
              )}

            {displayedEventRecord?.status === "active" &&
              !eventUiState.playableMatch &&
              watchableMatch && (
                <BottomPillButton
                  type="button"
                  onClick={() => void openMatch(getEventMatchInviteId(watchableMatch))}
                >
                  Watch
                </BottomPillButton>
              )}
          </ButtonRow>
        </BottomBar>
      )}
    </Overlay>
  );
};

export default EventModal;
