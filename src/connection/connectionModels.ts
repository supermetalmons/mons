export interface Match {
  version: number;
  color: string;
  emojiId: number;
  aura?: string;
  fen: string;
  status: string;
  flatMovesString: string;
  timer: string;
  reaction?: Reaction;
}

export interface Invite {
  version: number;
  hostId: string;
  hostColor: string;
  guestId?: string | null;
  hostRematches?: string | null;
  guestRematches?: string | null;
  automatchStateHint?: "pending" | "matched" | "canceled" | null;
  automatchCanceledAt?: number | null;
  eventId?: string | null;
  eventRoundIndex?: number | null;
  eventMatchKey?: string | null;
  eventOwned?: boolean | null;
  wagers?: Record<string, MatchWagerState> | null;
  reactions?: Record<string, InviteReaction> | null;
}

export interface RematchSeriesMatchDescriptor {
  index: number;
  matchId: string;
  isActiveMatch: boolean;
  isPendingResponse: boolean;
}

export interface RematchSeriesDescriptor {
  inviteId: string;
  activeMatchId: string | null;
  hasSeries: boolean;
  matches: RematchSeriesMatchDescriptor[];
}

export interface HistoricalMatchPair {
  matchId: string;
  hostPlayerId: string;
  guestPlayerId: string | null;
  hostMatch: Match | null;
  guestMatch: Match | null;
}

export type NavigationItemStatus =
  | "pending"
  | "waiting"
  | "active"
  | "ended"
  | "dismissed";
export type NavigationGameStatus = "pending" | "waiting" | "active" | "ended";
export type NavigationEventStatus =
  | "waiting"
  | "active"
  | "ended"
  | "dismissed";
export type EventStatus = "scheduled" | "active" | "ended" | "dismissed";
export type EventParticipantState = "active" | "eliminated" | "winner";
export type EventMatchStatus =
  | "upcoming"
  | "pending"
  | "host"
  | "guest"
  | "bye";
export type EventRoundStatus = "upcoming" | "active" | "completed";

export interface NavigationGameItem {
  id: string;
  entityType: "game";
  inviteId: string;
  kind: "auto" | "direct";
  status: NavigationGameStatus;
  sortBucket: number;
  listSortAtMs: number;
  hostLoginId: string | null;
  guestLoginId: string | null;
  opponentProfileId: string | null;
  opponentName: string | null;
  opponentEmoji: number | null;
  automatchStateHint: "pending" | "matched" | "canceled" | null;
  isPendingAutomatch: boolean;
  isFallback?: boolean;
  isOptimistic?: boolean;
}

export interface EventNavigationPreviewParticipant {
  profileId: string | null;
  displayName: string | null;
  emojiId: number | null;
  aura: string | null;
}

export interface NavigationEventItem {
  id: string;
  entityType: "event";
  eventId: string;
  status: NavigationEventStatus;
  sortBucket: number;
  listSortAtMs: number;
  startAtMs: number | null;
  updatedAtMs: number | null;
  endedAtMs: number | null;
  participantCount: number;
  participantPreview: EventNavigationPreviewParticipant[];
  winnerDisplayName: string | null;
  isFallback?: boolean;
  isOptimistic?: boolean;
}

export type NavigationItem = NavigationGameItem | NavigationEventItem;

export interface EventParticipant {
  profileId: string;
  loginUid: string;
  username: string;
  displayName: string;
  emojiId: number;
  aura: string;
  joinedAtMs: number;
  state: EventParticipantState;
  eliminatedRoundIndex: number | null;
  eliminatedByProfileId: string | null;
}

export interface EventMatch {
  matchKey: string;
  inviteId: string | null;
  status: EventMatchStatus;
  resolvedAtMs: number | null;
  winnerProfileId: string | null;
  loserProfileId: string | null;
  hostProfileId: string | null;
  hostLoginUid: string | null;
  hostDisplayName: string | null;
  hostEmojiId: number | null;
  hostAura: string | null;
  guestProfileId: string | null;
  guestLoginUid: string | null;
  guestDisplayName: string | null;
  guestEmojiId: number | null;
  guestAura: string | null;
}

export interface EventRound {
  roundIndex: number;
  status: EventRoundStatus;
  createdAtMs: number;
  completedAtMs: number | null;
  matches: Record<string, EventMatch>;
}

export interface EventRecord {
  schemaVersion: number;
  eventId: string;
  status: EventStatus;
  createdAtMs: number;
  updatedAtMs: number;
  startAtMs: number;
  startedAtMs: number | null;
  endedAtMs: number | null;
  createdByProfileId: string;
  createdByLoginUid: string;
  createdByUsername: string;
  winnerProfileId: string | null;
  winnerDisplayName: string | null;
  currentRoundIndex: number | null;
  bracketSize: number;
  roundCount: number;
  participants: Record<string, EventParticipant>;
  rounds: Record<string, EventRound>;
}

export interface Reaction {
  uuid: string;
  variation: number;
  kind: string;
}

export interface InviteReaction extends Reaction {
  matchId: string;
}

export const MINING_MATERIAL_NAMES = [
  "dust",
  "slime",
  "gum",
  "metal",
  "ice",
] as const;

export type MiningMaterialName = (typeof MINING_MATERIAL_NAMES)[number];

export type PlayerMiningMaterials = Record<MiningMaterialName, number>;

export interface PlayerMiningData {
  lastRockDate: string | null;
  materials: PlayerMiningMaterials;
}

export type WagerProposal = {
  material: MiningMaterialName;
  count: number;
  createdAt?: number;
};

export type WagerAgreement = {
  material: MiningMaterialName;
  count: number;
  total?: number;
  proposerId: string;
  accepterId: string;
  acceptedAt?: number;
};

export type WagerResolution = {
  winnerId: string;
  loserId: string;
  material: MiningMaterialName;
  count: number;
  total?: number;
  resolvedAt?: number;
};

export type MatchWagerState = {
  proposals?: Record<string, WagerProposal>;
  proposedBy?: Record<string, boolean>;
  agreed?: WagerAgreement;
  resolved?: WagerResolution;
};

export interface PlayerProfile {
  id: string;
  nonce: number | undefined;
  rating: number | undefined;
  totalManaPoints?: number | undefined;
  win: boolean | undefined;
  emoji: number;
  aura?: string;
  cardBackgroundId: number | undefined;
  cardSubtitleId: number | undefined;
  profileCounter: string | undefined;
  profileMons: string | undefined;
  cardStickers: string | undefined;
  username: string | null;
  eth?: string | null;
  sol?: string | null;
  feb2026UniqueOpponentsCount?: number;
  completedProblemIds: string[] | undefined;
  isTutorialCompleted: boolean | undefined;
  mining?: PlayerMiningData;
}
