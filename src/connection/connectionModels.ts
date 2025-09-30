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
}

export interface Reaction {
  uuid: string;
  variation: number;
  kind: string;
}

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
  profileMons: string | undefined;
  cardStickers: string | undefined;
  username: string | null;
  eth?: string | null;
  sol?: string | null;
  completedProblemIds: string[] | undefined;
  isTutorialCompleted: boolean | undefined;
}
