export const CONTROLLER_VERSION: 2;

export type MatchSeedRecord<TGameVariant extends string = string> = {
  gameVariant: TGameVariant;
  fen: string;
};

export type FreshMatchRecord<
  TEmojiId = unknown,
  TAura = unknown,
  TGameVariant extends string = string,
> = {
  version: typeof CONTROLLER_VERSION;
  color: string;
  emojiId: TEmojiId;
  aura: TAura;
  gameVariant: TGameVariant;
  fen: string;
  status: "";
  flatMovesString: "";
  timer: "";
};

export function buildFreshMatchRecord<
  TEmojiId,
  TAura,
  TGameVariant extends string,
>(options: {
  color: string;
  emojiId: TEmojiId;
  aura: TAura;
  seed: MatchSeedRecord<TGameVariant>;
}): FreshMatchRecord<TEmojiId, TAura, TGameVariant>;
