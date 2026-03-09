import React, { useCallback, useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import { FaCopy, FaTimes } from "react-icons/fa";
import { connection } from "../connection/connection";
import { EventMatch, EventParticipant, EventRecord, EventRound } from "../connection/connectionModels";
import { closeEventModal, EVENT_MODAL_Z_INDEX, getEventModalState, subscribeToEventModalState } from "./eventModalController";
import { emojis } from "../content/emojis";
import { storage } from "../utils/storage";
import { openProfileSignInPopup } from "./ProfileSignIn";
import { getCurrentRouteState } from "../navigation/routeState";

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: ${EVENT_MODAL_Z_INDEX};
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(18, 24, 33, 0.28);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);

  @media (prefers-color-scheme: dark) {
    background: rgba(5, 8, 13, 0.54);
  }
`;

const ModalCard = styled.div`
  width: min(540px, calc(100vw - 24px));
  max-height: min(760px, calc(100vh - 24px));
  overflow: hidden;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 30px 80px rgba(16, 24, 40, 0.24);
  border: 1px solid rgba(255, 255, 255, 0.35);

  @media (prefers-color-scheme: dark) {
    background: rgba(30, 34, 41, 0.92);
    border-color: rgba(255, 255, 255, 0.08);
  }
`;

const ModalScroll = styled.div`
  max-height: inherit;
  overflow-y: auto;
  padding: 18px 18px 20px;
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
  font-size: 1.08rem;
  line-height: 1.15;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-gray-25);

  @media (prefers-color-scheme: dark) {
    color: var(--color-gray-f5);
  }
`;

const Subtitle = styled.div`
  margin-top: 6px;
  font-size: 0.82rem;
  color: var(--navigationTextMuted);
`;

const HeaderButtons = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
`;

const HeaderIconButton = styled.button`
  width: 34px;
  height: 34px;
  border-radius: 999px;
  border: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(99, 114, 130, 0.12);
  color: var(--color-gray-33);
  cursor: pointer;

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background: rgba(99, 114, 130, 0.18);
    }
  }

  @media (prefers-color-scheme: dark) {
    background: rgba(255, 255, 255, 0.08);
    color: var(--color-gray-f0);

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background: rgba(255, 255, 255, 0.14);
      }
    }
  }
`;

const CardSection = styled.div`
  padding: 14px;
  border-radius: 16px;
  background: rgba(111, 126, 141, 0.09);

  @media (prefers-color-scheme: dark) {
    background: rgba(255, 255, 255, 0.06);
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

const ParticipantRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
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
  border: 1px solid ${(props) => (props.$highlighted ? "rgba(47, 127, 255, 0.48)" : "rgba(111, 126, 141, 0.18)")};
  border-radius: 14px;
  background: ${(props) => (props.$highlighted ? "rgba(61, 133, 255, 0.14)" : "rgba(255, 255, 255, 0.52)")};
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  text-align: left;
  cursor: pointer;

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background: ${(props) => (props.$highlighted ? "rgba(61, 133, 255, 0.19)" : "rgba(255, 255, 255, 0.74)")};
    }
  }

  @media (prefers-color-scheme: dark) {
    background: ${(props) => (props.$highlighted ? "rgba(61, 133, 255, 0.18)" : "rgba(255, 255, 255, 0.04)")};
    border-color: ${(props) => (props.$highlighted ? "rgba(89, 159, 255, 0.5)" : "rgba(255, 255, 255, 0.08)")};

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background: ${(props) => (props.$highlighted ? "rgba(61, 133, 255, 0.24)" : "rgba(255, 255, 255, 0.07)")};
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

const ByeBadge = styled.div`
  font-size: 0.76rem;
  color: var(--navigationTextMuted);
`;

const InlineError = styled.div`
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(220, 53, 69, 0.09);
  color: var(--dangerButtonBackground);
  font-size: 0.8rem;
  line-height: 1.35;

  @media (prefers-color-scheme: dark) {
    background: rgba(220, 53, 69, 0.2);
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
  padding: 0 16px;
  border-radius: 999px;
  border: none;
  cursor: pointer;
  font-weight: 700;
  background: ${(props) => (props.$primary ? "var(--color-blue-primary)" : "rgba(111, 126, 141, 0.16)")};
  color: ${(props) => (props.$primary ? "white" : "var(--color-gray-33)")};
  opacity: ${(props) => (props.disabled ? 0.56 : 1)};

  @media (prefers-color-scheme: dark) {
    background: ${(props) => (props.$primary ? "var(--color-blue-primary-dark)" : "rgba(255, 255, 255, 0.08)")};
    color: ${(props) => (props.$primary ? "white" : "var(--color-gray-f0)")};
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
    return event.winnerDisplayName ? `${event.winnerDisplayName} won the event` : "event ended";
  }
  if (event.status === "active") {
    return "event is live";
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

const EventModal: React.FC = () => {
  const [modalState, setModalState] = useState(() => getEventModalState());
  const [eventRecord, setEventRecord] = useState<EventRecord | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [pendingJoinEventId, setPendingJoinEventId] = useState<string | null>(null);
  const [pendingJoinRequestedAtMs, setPendingJoinRequestedAtMs] = useState(0);

  useEffect(() => {
    return subscribeToEventModalState((nextState) => {
      setModalState(nextState);
    });
  }, []);

  useEffect(() => {
    if (!modalState.isOpen || !modalState.eventId) {
      setEventRecord(null);
      setInlineError(null);
      setCopyState("idle");
      setPendingJoinEventId(null);
      setPendingJoinRequestedAtMs(0);
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

  const handleBackdropClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget) {
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

  if (!modalState.isOpen || !modalState.eventId) {
    return null;
  }

  return (
    <Overlay onClick={handleBackdropClick}>
      <ModalCard onClick={(event) => event.stopPropagation()}>
        <ModalScroll>
          <HeaderRow>
            <HeaderText>
              <Title>{eventRecord ? formatEventDateTitle(eventRecord.startAtMs) : "EVENT"}</Title>
              <Subtitle>{formatRelativeStart(eventRecord, nowMs)}</Subtitle>
            </HeaderText>
            <HeaderButtons>
              <HeaderIconButton type="button" onClick={handleCopyClick} aria-label="Copy event link">
                <FaCopy />
              </HeaderIconButton>
              <HeaderIconButton type="button" onClick={() => void closeEventModal()} aria-label="Close event">
                <FaTimes />
              </HeaderIconButton>
            </HeaderButtons>
          </HeaderRow>

          {copyState === "copied" && <FooterNote>event link copied</FooterNote>}
          {inlineError && <InlineError>{inlineError}</InlineError>}

          <CardSection>
            <SectionTitle>Participants</SectionTitle>
            <ParticipantsList>
              {participants.map((participant) => (
                <ParticipantRow key={participant.profileId}>
                  <EventAvatar emojiId={participant.emojiId} displayName={participant.displayName} />
                  <ParticipantName>{participant.displayName || "anon"}</ParticipantName>
                  <ParticipantState>{participant.state === "winner" ? "winner" : participant.state === "eliminated" ? "out" : ""}</ParticipantState>
                </ParticipantRow>
              ))}
              {!participants.length && <FooterNote>{isLoading ? "loading participants..." : "no participants yet"}</FooterNote>}
            </ParticipantsList>
          </CardSection>

          {(eventRecord?.status === "active" || eventRecord?.status === "ended") && (
            <CardSection>
              <SectionTitle>Bracket</SectionTitle>
              <RoundsList>
                {rounds.map((round) => (
                  <RoundCard key={round.roundIndex}>
                    <RoundTitle>{`Round ${round.roundIndex + 1}`}</RoundTitle>
                    {round.byeProfileId && (
                      <ByeBadge>
                        bye: {eventRecord.participants[round.byeProfileId]?.displayName ?? "unknown"}
                      </ByeBadge>
                    )}
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
                          <MatchMeta>
                            {match.status === "pending"
                              ? isPlayable
                                ? "your game"
                                : "open game"
                              : `winner: ${
                                  match.winnerProfileId
                                    ? eventRecord.participants[match.winnerProfileId]?.displayName ?? "unknown"
                                    : "unknown"
                                }`}
                          </MatchMeta>
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
                <FooterNote>{nowMs >= eventRecord.startAtMs ? "waiting for more players" : "not started yet"}</FooterNote>
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
                {Object.keys(eventRecord.participants ?? {}).length < 2 ? "waiting for more players" : "event is no longer accepting new participants"}
              </FooterNote>
            )}

            {eventRecord?.status === "dismissed" && <FooterNote>dismissed: not enough players</FooterNote>}
            {eventRecord?.status === "ended" && eventRecord?.winnerDisplayName && <FooterNote>{`${eventRecord.winnerDisplayName} won the event`}</FooterNote>}
            {eventUiState.isEliminated && <FooterNote>you are out, but you can still spectate</FooterNote>}
          </Footer>
        </ModalScroll>
      </ModalCard>
    </Overlay>
  );
};

export default EventModal;
