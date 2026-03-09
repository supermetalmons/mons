import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import { FaCheck, FaCopy, FaTimes } from "react-icons/fa";
import { connection } from "../connection/connection";
import { EventMatch, EventParticipant, EventRecord, EventRound } from "../connection/connectionModels";
import { closeEventModal, EVENT_MODAL_Z_INDEX, getEventModalState, subscribeToEventModalState } from "./eventModalController";
import { emojis } from "../content/emojis";
import { storage } from "../utils/storage";
import { openProfileSignInPopup } from "./ProfileSignIn";
import { getCurrentRouteState } from "../navigation/routeState";
import { didNotDismissAnythingWithOutsideTapJustNow } from "./BottomControls";
import { showShinyCard, showsShinyCardSomewhere } from "./ShinyCard";
import { getStashedPlayerProfile } from "../utils/playerMetadata";

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: ${EVENT_MODAL_Z_INDEX};
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: var(--modalOverlayBackground);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);

  @media (prefers-color-scheme: dark) {
    background: var(--modalOverlayBackgroundDark);
  }
`;

const ModalCard = styled.div`
  width: min(540px, calc(100vw - 24px));
  max-height: min(720px, calc(100vh - 24px));
  overflow: hidden;
  border-radius: 16px;
  background: var(--color-white);
  box-shadow: 0 6px 20px var(--standardBoxShadow);

  @media (prefers-color-scheme: dark) {
    background: var(--color-deep-gray);
  }
`;

const ModalScroll = styled.div`
  max-height: inherit;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const HeaderRow = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
`;

const HeaderText = styled.div`
  min-width: 0;
`;

const Title = styled.h2`
  margin: 0;
  font-size: 1.1rem;
  line-height: 1.15;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-gray-33);

  @media (prefers-color-scheme: dark) {
    color: var(--color-gray-f0);
  }
`;

const Subtitle = styled.div`
  margin-top: 4px;
  font-size: 0.82rem;
  color: var(--color-gray-69);

  @media (prefers-color-scheme: dark) {
    color: var(--color-gray-a0);
  }
`;

const HeaderButtons = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
`;

const HeaderIconButton = styled.button`
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--color-gray-f0);
  color: var(--color-gray-33);
  cursor: pointer;
  transition: background-color 0.2s ease;
  -webkit-tap-highlight-color: transparent;

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background: var(--color-gray-e0);
    }
  }

  &:active {
    background: var(--color-gray-d0);
  }

  @media (prefers-color-scheme: dark) {
    background: var(--color-gray-33);
    color: var(--color-gray-f0);

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background: var(--color-gray-44);
      }
    }

    &:active {
      background: var(--color-gray-55);
    }
  }
`;

const CardSection = styled.div`
  padding: 14px;
  border-radius: 12px;
  background: var(--color-gray-f9);

  @media (prefers-color-scheme: dark) {
    background: var(--color-gray-27);
  }
`;

const SectionTitle = styled.div`
  margin-bottom: 10px;
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--navigationTextMuted);
`;

const ParticipantsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const ParticipantRow = styled.button`
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  width: 100%;
  border: none;
  background: transparent;
  padding: 6px 4px;
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

const Avatar = styled.img`
  width: 24px;
  height: 24px;
  border-radius: 6px;
  flex-shrink: 0;
`;

const AvatarFallback = styled.div`
  width: 24px;
  height: 24px;
  border-radius: 6px;
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

const RoundsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const RoundCard = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const RoundTitle = styled.div`
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--color-gray-33);

  @media (prefers-color-scheme: dark) {
    color: var(--color-gray-f0);
  }
`;

const MatchButton = styled.button<{ $highlighted?: boolean }>`
  border: none;
  border-radius: 12px;
  background: ${(props) => (props.$highlighted ? "rgba(0, 122, 255, 0.06)" : "var(--color-white)")};
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.15s ease;

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background: ${(props) => (props.$highlighted ? "rgba(0, 122, 255, 0.1)" : "var(--color-gray-f5)")};
    }
  }

  @media (prefers-color-scheme: dark) {
    background: ${(props) => (props.$highlighted ? "rgba(11, 132, 255, 0.12)" : "var(--color-gray-23)")};
    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background: ${(props) => (props.$highlighted ? "rgba(11, 132, 255, 0.18)" : "var(--color-gray-33)")};
      }
    }
  }
`;

const MatchPlayerLine = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
`;

const MatchPlayerName = styled.div`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-gray-25);

  @media (prefers-color-scheme: dark) {
    color: var(--color-gray-f5);
  }
`;

const MatchMeta = styled.div`
  font-size: 0.72rem;
  color: var(--navigationTextMuted);
`;

const InlineError = styled.div`
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(220, 53, 69, 0.08);
  color: var(--dangerButtonBackground);
  font-size: 0.74rem;
  line-height: 1.35;

  @media (prefers-color-scheme: dark) {
    background: rgba(220, 53, 69, 0.22);
    color: var(--dangerButtonBackgroundDark);
  }
`;

const Footer = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
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
  background: ${(props) => (props.$primary ? "var(--color-blue-primary)" : "var(--color-gray-f0)")};
  color: ${(props) => (props.$primary ? "white" : "var(--color-gray-33)")};
  opacity: ${(props) => (props.disabled ? 0.56 : 1)};

  @media (hover: hover) and (pointer: fine) {
    &:hover:not(:disabled) {
      background: ${(props) => (props.$primary ? "var(--bottomButtonBackgroundHover)" : "var(--color-gray-e0)")};
    }
  }

  &:active:not(:disabled) {
    background: ${(props) => (props.$primary ? "var(--bottomButtonBackgroundActive)" : "var(--color-gray-d0)")};
  }

  @media (prefers-color-scheme: dark) {
    background: ${(props) => (props.$primary ? "var(--color-blue-primary-dark)" : "var(--color-gray-33)")};
    color: ${(props) => (props.$primary ? "white" : "var(--color-gray-f0)")};

    @media (hover: hover) and (pointer: fine) {
      &:hover:not(:disabled) {
        background: ${(props) => (props.$primary ? "var(--bottomButtonBackgroundHoverDark)" : "var(--color-gray-44)")};
      }
    }

    &:active:not(:disabled) {
      background: ${(props) => (props.$primary ? "var(--bottomButtonBackgroundActiveDark)" : "var(--color-gray-55)")};
    }
  }
`;

const FooterNote = styled.div`
  font-size: 0.8rem;
  color: var(--navigationTextMuted);
`;

type EventUiState = {
  isJoined: boolean;
  isEliminated: boolean;
  playableMatch: EventMatch | null;
  waitingForNext: boolean;
};

const PENDING_JOIN_POLL_INTERVAL_MS = 350;
const PENDING_JOIN_POLL_TIMEOUT_MS = 60_000;

const formatEventDateTitle = (startAtMs: number): string => {
  if (!Number.isFinite(startAtMs) || startAtMs <= 0) {
    return "EVENT";
  }
  return new Date(startAtMs)
    .toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
    .replace(",", "")
    .toUpperCase();
};

const formatRelativeStart = (event: EventRecord | null, nowMs: number): string => {
  if (!event) {
    return "loading";
  }
  if (event.status === "dismissed") {
    return "dismissed: not enough players";
  }
  if (event.status === "ended") {
    return event.winnerDisplayName ? `${event.winnerDisplayName} won` : "event ended";
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
  return `starting in ${minutes} minute${minutes === 1 ? "" : "s"}`;
};

const getSortedParticipants = (event: EventRecord | null): EventParticipant[] => {
  if (!event) {
    return [];
  }
  return Object.values(event.participants).sort((left, right) => left.joinedAtMs - right.joinedAtMs);
};

const getSortedRounds = (event: EventRecord | null): EventRound[] => {
  if (!event) {
    return [];
  }
  return Object.values(event.rounds).sort((left, right) => left.roundIndex - right.roundIndex);
};

const getCurrentUiState = (event: EventRecord | null, profileId: string): EventUiState => {
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

  const roundKey = event.currentRoundIndex !== null ? String(event.currentRoundIndex) : null;
  const currentRound = roundKey ? event.rounds[roundKey] : null;
  const matches = currentRound ? Object.values(currentRound.matches) : [];
  const playableMatch = matches.find((match) => match.status === "pending" && (match.hostProfileId === profileId || match.guestProfileId === profileId)) ?? null;
  const hasBye = currentRound?.byeProfileId === profileId;
  const hasWonCurrentRound = matches.some((match) => match.winnerProfileId === profileId);

  return {
    isJoined: true,
    isEliminated: false,
    playableMatch,
    waitingForNext: event.status === "active" && !playableMatch && (hasBye || hasWonCurrentRound),
  };
};

const formatEventError = (error: unknown): string => {
  if (error && typeof error === "object" && "message" in error && typeof (error as { message?: unknown }).message === "string") {
    const message = (error as { message: string }).message;
    return message.replace(/^Firebase:\s*/i, "");
  }
  return "Something went wrong.";
};

const EventAvatar: React.FC<{ emojiId?: number | null; displayName?: string | null }> = ({ emojiId, displayName }) => {
  if (typeof emojiId === "number" && Number.isFinite(emojiId)) {
    return <Avatar src={emojis.getEmojiUrl(emojiId.toString())} alt={displayName ?? ""} />;
  }
  return <AvatarFallback aria-hidden="true" />;
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
  const [pendingJoinEventId, setPendingJoinEventId] = useState<string | null>(null);
  const [pendingJoinRequestedAtMs, setPendingJoinRequestedAtMs] = useState(0);
  const [openingParticipantId, setOpeningParticipantId] = useState<string | null>(null);
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
    const unsubscribe = connection.subscribeToEvent(
      modalState.eventId,
      (nextEvent) => {
        setEventRecord(nextEvent);
        setIsLoading(false);
      },
      () => {
        setIsLoading(false);
      }
    );

    void connection.syncEventState(modalState.eventId).catch(() => {});

    return unsubscribe;
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
    if (!modalState.isOpen || !modalState.eventId || !eventRecord || eventRecord.status !== "scheduled") {
      return;
    }
    const delayMs = Math.max(0, eventRecord.startAtMs - Date.now() + 300);
    const timeoutId = window.setTimeout(() => {
      setNowMs(Date.now());
      void connection.syncEventState(modalState.eventId as string).catch(() => {});
    }, delayMs);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [eventRecord, modalState.eventId, modalState.isOpen]);

  useEffect(() => {
    if (!modalState.isOpen || !modalState.eventId || pendingJoinEventId !== modalState.eventId) {
      return;
    }
    const requestedAtMs = pendingJoinRequestedAtMs > 0 ? pendingJoinRequestedAtMs : Date.now();
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
  }, [modalState.eventId, modalState.isOpen, pendingJoinEventId, pendingJoinRequestedAtMs]);

  const participants = useMemo(() => getSortedParticipants(eventRecord), [eventRecord]);
  const rounds = useMemo(() => getSortedRounds(eventRecord), [eventRecord]);
  const currentProfileId = storage.getProfileId("");
  const eventUiState = useMemo(() => getCurrentUiState(eventRecord, currentProfileId), [currentProfileId, eventRecord]);
  const currentRoute = getCurrentRouteState();
  const isJoinWindowOpen = !!eventRecord && eventRecord.status === "scheduled" && nowMs < eventRecord.startAtMs;

  const handleBackdropPointerDown = useCallback((event: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) {
      return;
    }
    ignoreNextBackdropClickRef.current = showsShinyCardSomewhere;
  }, []);

  const handleBackdropClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget) {
        return;
      }
      const shouldKeepVisibleForOutsideDismiss = ignoreNextBackdropClickRef.current || showsShinyCardSomewhere || !didNotDismissAnythingWithOutsideTapJustNow();
      ignoreNextBackdropClickRef.current = false;
      if (shouldKeepVisibleForOutsideDismiss) {
        return;
      }
      void closeEventModal();
    },
    []
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

  const openMatch = useCallback(async (inviteId: string) => {
    if (!inviteId) {
      return;
    }
    await closeEventModal({ skipHomeTransition: true });
    if (currentRoute.mode === "invite" && currentRoute.inviteId === inviteId) {
      return;
    }
    connection.connectToInvite(inviteId);
  }, [currentRoute.inviteId, currentRoute.mode]);

  const resolveParticipantProfile = useCallback(async (participant: EventParticipant) => {
    const cachedProfile = participant.loginUid ? getStashedPlayerProfile(participant.loginUid) : undefined;
    if (cachedProfile && cachedProfile.id === participant.profileId) {
      return cachedProfile;
    }
    if (!participant.loginUid) {
      return null;
    }
    const exactProfile = await connection.getProfileByLoginId(participant.loginUid);
    return exactProfile ?? null;
  }, []);

  const handleParticipantClick = useCallback(async (participant: EventParticipant) => {
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
      await showShinyCard(profile, getParticipantDisplayName(participant), true);
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
      setOpeningParticipantId((current) => (current === participantKey ? null : current));
    }
  }, [resolveParticipantProfile]);

  if (!modalState.isOpen || !modalState.eventId) {
    return null;
  }

  return (
    <Overlay onMouseDown={handleBackdropPointerDown} onTouchStart={handleBackdropPointerDown} onClick={handleBackdropClick}>
      <ModalCard onClick={(event) => event.stopPropagation()}>
        <ModalScroll>
          <HeaderRow>
            <HeaderText>
              <Title>{eventRecord ? formatEventDateTitle(eventRecord.startAtMs) : "EVENT"}</Title>
              <Subtitle>{formatRelativeStart(eventRecord, nowMs)}</Subtitle>
            </HeaderText>
            <HeaderButtons>
              <HeaderIconButton type="button" onClick={handleCopyClick} aria-label="Copy event link">
                {copyState === "copied" ? <FaCheck /> : <FaCopy />}
              </HeaderIconButton>
              <HeaderIconButton type="button" onClick={() => void closeEventModal()} aria-label="Close event">
                <FaTimes />
              </HeaderIconButton>
            </HeaderButtons>
          </HeaderRow>

          {inlineError && <InlineError>{inlineError}</InlineError>}

          {eventRecord?.status !== "active" && eventRecord?.status !== "ended" && (
            <CardSection>
              <SectionTitle>Players</SectionTitle>
              <ParticipantsList>
                {participants.map((participant) => (
                  <ParticipantRow
                    key={participant.profileId}
                    type="button"
                    onClick={() => void handleParticipantClick(participant)}
                    disabled={openingParticipantId !== null}
                  >
                    <EventAvatar emojiId={participant.emojiId} displayName={participant.displayName} />
                    <ParticipantName>{getParticipantDisplayName(participant)}</ParticipantName>
                    <ParticipantState>
                      {openingParticipantId === (participant.profileId || participant.loginUid)
                        ? "loading"
                        : participant.state === "winner"
                          ? "winner"
                          : participant.state === "eliminated"
                            ? "out"
                            : ""}
                    </ParticipantState>
                  </ParticipantRow>
                ))}
                {!participants.length && <FooterNote>{isLoading ? "loading players..." : "no players yet"}</FooterNote>}
              </ParticipantsList>
            </CardSection>
          )}

          {(eventRecord?.status === "active" || eventRecord?.status === "ended") && (
            <CardSection>
              <RoundsList>
                {rounds.map((round) => (
                  <RoundCard key={round.roundIndex}>
                    <RoundTitle>{`Round ${round.roundIndex + 1}`}</RoundTitle>
                    {Object.values(round.matches).map((match) => {
                      const isPlayable = eventUiState.playableMatch?.inviteId === match.inviteId;
                      return (
                        <MatchButton key={match.matchKey} type="button" $highlighted={isPlayable || currentRoute.inviteId === match.inviteId} onClick={() => void openMatch(match.inviteId)}>
                          <MatchPlayerLine>
                            <EventAvatar emojiId={match.hostEmojiId} displayName={match.hostDisplayName} />
                            <MatchPlayerName>{match.hostDisplayName || "anon"}</MatchPlayerName>
                          </MatchPlayerLine>
                          <MatchPlayerLine>
                            <EventAvatar emojiId={match.guestEmojiId} displayName={match.guestDisplayName} />
                            <MatchPlayerName>{match.guestDisplayName || "anon"}</MatchPlayerName>
                          </MatchPlayerLine>
                          {isPlayable && <MatchMeta>your match</MatchMeta>}
                          {match.status !== "pending" && match.winnerProfileId && (
                            <MatchMeta>{eventRecord.participants[match.winnerProfileId]?.displayName ?? "unknown"} won</MatchMeta>
                          )}
                        </MatchButton>
                      );
                    })}
                  </RoundCard>
                ))}
                {!rounds.length && <FooterNote>{eventRecord?.status === "active" ? "building bracket..." : "no bracket yet"}</FooterNote>}
              </RoundsList>
            </CardSection>
          )}

          <Footer>
            {!eventUiState.isJoined && isJoinWindowOpen && (
              <>
                <FooterButton type="button" $primary={true} onClick={handleJoinClick} disabled={isLoading}>
                  Join
                </FooterButton>
                <FooterButton type="button" onClick={() => void closeEventModal()}>
                  Skip
                </FooterButton>
              </>
            )}

            {eventUiState.isJoined && eventRecord?.status === "scheduled" && (
              <>
                <FooterButton type="button" $primary={true} disabled={true}>
                  Play
                </FooterButton>
{nowMs >= eventRecord.startAtMs && <FooterNote>waiting for more players</FooterNote>}
              </>
            )}

            {eventRecord?.status === "active" && eventUiState.playableMatch && (
              <FooterButton type="button" $primary={true} onClick={() => void openMatch(eventUiState.playableMatch!.inviteId)}>
                Play
              </FooterButton>
            )}

            {eventRecord?.status === "active" && !eventUiState.playableMatch && eventUiState.waitingForNext && (
              <>
                <FooterButton type="button" $primary={true} disabled={true}>
                  Play Next
                </FooterButton>
                <FooterNote>waiting for the next round</FooterNote>
              </>
            )}

            {!eventUiState.isJoined && eventRecord?.status === "scheduled" && !isJoinWindowOpen && (
              <FooterNote>
                {Object.keys(eventRecord.participants ?? {}).length < 2 ? "waiting for more players" : "event is no longer accepting players"}
              </FooterNote>
            )}

          </Footer>
        </ModalScroll>
      </ModalCard>
    </Overlay>
  );
};

export default EventModal;
