export interface Match {
  version: number;
  color: string;
  emojiId: number;
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
  nonce: number;
  rating: number;
  win: boolean;
  emoji: number;
  eth?: string | null;
}
