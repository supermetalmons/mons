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
  wagers?: Record<string, MatchWagerState> | null;
}

export interface Reaction {
  uuid: string;
  variation: number;
  kind: string;
}

export const MINING_MATERIAL_NAMES = ["dust", "slime", "gum", "metal", "ice"] as const;

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
