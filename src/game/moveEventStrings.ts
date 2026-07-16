import * as MonsRules from "mons-rules";
import * as Board from "./board";
import { colors } from "../content/boardStyles";

export type MoveHistoryToken =
  | { type: "icon"; icon: string; alt: string }
  | { type: "text"; text: string }
  | { type: "emoji"; emoji: string; alt: string }
  | { type: "square"; color: string; alt: string }
  | {
      type: "composite";
      baseIcon: string;
      overlayIcon: string;
      alt: string;
      overlayAlt: string;
      variant: "mana" | "supermana" | "bomb";
    };

export type MoveHistorySegment = MoveHistoryToken[];

export type MoveHistoryEntry = {
  segments: MoveHistorySegment[];
  segmentRoles?: MoveHistorySegmentRole[];
  hasTurnSeparator?: boolean;
};

export type MoveHistorySegmentRole = "arrow" | "destination" | "normal";

function arrowForEvent(e: MonsRules.EventModel): {
  arrow: string;
  isRight: boolean;
} {
  const from = e.loc1;
  const to = e.loc2;
  if (!from || !to) return { arrow: "→", isRight: true };
  let di = to.i - from.i;
  let dj = to.j - from.j;
  if (Board.isFlipped) {
    di = -di;
    dj = -dj;
  }
  if (di === 0 && dj > 0) return { arrow: "→", isRight: true };
  if (di === 0 && dj < 0) return { arrow: "←", isRight: false };
  if (dj === 0 && di > 0) return { arrow: "↓", isRight: true };
  if (dj === 0 && di < 0) return { arrow: "↑", isRight: true };
  if (di < 0 && dj > 0) return { arrow: "↗", isRight: true };
  if (di > 0 && dj > 0) return { arrow: "↘", isRight: true };
  if (di > 0 && dj < 0) return { arrow: "↙", isRight: false };
  if (di < 0 && dj < 0) return { arrow: "↖", isRight: false };
  return { arrow: "→", isRight: true };
}

function addArrowToken(tokens: MoveHistoryToken[], ev: MonsRules.EventModel) {
  const { arrow, isRight } = arrowForEvent(ev);
  const arrowToken: MoveHistoryToken = { type: "text", text: arrow };
  if (isRight) {
    tokens.push(arrowToken);
  } else {
    tokens.unshift(arrowToken);
  }
}

function addActionArrowTokens(
  tokens: MoveHistoryToken[],
  ev: MonsRules.EventModel,
): boolean {
  const { arrow, isRight } = arrowForEvent(ev);
  const actionToken: MoveHistoryToken = {
    type: "emoji",
    emoji: "statusAction",
    alt: "action",
  };
  const arrowToken: MoveHistoryToken = { type: "text", text: arrow };
  if (isRight) {
    tokens.push(actionToken);
    tokens.push(arrowToken);
  } else {
    tokens.unshift(actionToken);
    tokens.unshift(arrowToken);
  }
  return isRight;
}

function compositeToken(
  base: { icon: string; alt: string },
  overlay: { icon: string; alt: string },
  variant: "mana" | "supermana" | "bomb",
): MoveHistoryToken {
  return {
    type: "composite",
    baseIcon: base.icon,
    overlayIcon: overlay.icon,
    alt: `${base.alt} carrying ${overlay.alt}`,
    overlayAlt: overlay.alt,
    variant,
  };
}

function tokensForItem(item?: MonsRules.ItemModel): MoveHistoryToken[] {
  if (!item) return [];
  const tokens: MoveHistoryToken[] = [];
  switch (item.kind) {
    case MonsRules.ItemModelKind.MonWithMana: {
      const monToken = item.mon
        ? monIconForKind(item.mon.kind, item.mon.color)
        : null;
      const manaToken = manaOverlayIconFor(item.mana);
      if (monToken) {
        tokens.push(
          compositeToken(
            monToken,
            { icon: manaToken.icon, alt: manaToken.alt },
            manaToken.variant,
          ),
        );
      } else {
        tokens.push({ type: "icon", icon: manaToken.icon, alt: manaToken.alt });
      }
      break;
    }
    case MonsRules.ItemModelKind.MonWithConsumable: {
      const monToken = item.mon
        ? monIconForKind(item.mon.kind, item.mon.color)
        : null;
      const consumableToken = consumableIconFor(item.consumable);
      if (monToken) {
        tokens.push(compositeToken(monToken, consumableToken, "bomb"));
      } else {
        tokens.push({ type: "icon", ...consumableToken });
      }
      break;
    }
    case MonsRules.ItemModelKind.Mon: {
      if (item.mon) {
        const monToken = monIconForKind(item.mon.kind, item.mon.color);
        if (monToken) tokens.push({ type: "icon", ...monToken });
      }
      break;
    }
    case MonsRules.ItemModelKind.Mana: {
      tokens.push({ type: "icon", ...manaIconFor(item.mana) });
      break;
    }
    case MonsRules.ItemModelKind.Consumable: {
      tokens.push({ type: "icon", ...consumableIconFor(item.consumable) });
      break;
    }
    default:
      break;
  }
  return tokens;
}

function locationsEqual(
  a?: MonsRules.Location,
  b?: MonsRules.Location,
): boolean {
  if (!a || !b) return false;
  return a.i === b.i && a.j === b.j;
}

function targetTokensFromActionEvents(
  events: MonsRules.EventModel[],
  startIndex: number,
  targetLoc?: MonsRules.Location,
): MoveHistoryToken[] {
  if (!targetLoc) return [];
  let targetMon: MonsRules.Mon | null = null;
  let sawBombExplosion = false;
  let manaOverlay: {
    icon: string;
    alt: string;
    variant: "mana" | "supermana";
  } | null = null;
  let supermanaTokens: MoveHistoryToken[] | null = null;
  let manaTokens: MoveHistoryToken[] | null = null;

  for (let i = startIndex + 1; i < events.length; i++) {
    const next = events[i];
    switch (next.kind) {
      case MonsRules.EventModelKind.MonFainted:
        if (
          locationsEqual(next.loc1, targetLoc) ||
          locationsEqual(next.loc2, targetLoc)
        ) {
          if (next.mon) {
            targetMon = next.mon;
          }
        }
        break;
      case MonsRules.EventModelKind.ManaDropped:
        if (locationsEqual(next.loc1, targetLoc) && next.mana) {
          manaTokens = [{ type: "icon", ...manaIconFor(next.mana) }];
          const overlay = manaOverlayIconFor(next.mana);
          manaOverlay = {
            icon: overlay.icon,
            alt: overlay.alt,
            variant: overlay.variant,
          };
        }
        break;
      case MonsRules.EventModelKind.SupermanaBackToBase:
        if (locationsEqual(next.loc1, targetLoc)) {
          supermanaTokens = [
            { type: "icon", icon: "supermana", alt: "supermana" },
          ];
          manaOverlay = {
            icon: "supermanaSimple",
            alt: "supermana",
            variant: "supermana",
          };
        }
        break;
      case MonsRules.EventModelKind.BombExplosion:
        if (locationsEqual(next.loc1, targetLoc)) {
          sawBombExplosion = true;
        }
        break;
      default:
        break;
    }
    if (targetMon && sawBombExplosion) break;
  }

  if (targetMon) {
    const monToken = monIconForKind(targetMon.kind, targetMon.color);
    if (monToken) {
      if (manaOverlay) {
        return [
          compositeToken(
            monToken,
            { icon: manaOverlay.icon, alt: manaOverlay.alt },
            manaOverlay.variant,
          ),
        ];
      }
      if (sawBombExplosion) {
        const bombToken = consumableIconFor(MonsRules.Consumable.Bomb);
        return [compositeToken(monToken, bombToken, "bomb")];
      }
      return [{ type: "icon", ...monToken }];
    }
  }

  return supermanaTokens ?? manaTokens ?? [];
}

function monIconForKind(
  kind: MonsRules.MonKind | undefined,
  color?: MonsRules.Color,
): { icon: string; alt: string } | null {
  if (kind === undefined || kind === null) return null;
  const isBlack = color === MonsRules.Color.Black;
  switch (kind) {
    case MonsRules.MonKind.Demon:
      return {
        icon: isBlack ? "demonB" : "demon",
        alt: isBlack ? "black demon" : "demon",
      };
    case MonsRules.MonKind.Drainer:
      return {
        icon: isBlack ? "drainerB" : "drainer",
        alt: isBlack ? "black drainer" : "drainer",
      };
    case MonsRules.MonKind.Angel:
      return {
        icon: isBlack ? "angelB" : "angel",
        alt: isBlack ? "black angel" : "angel",
      };
    case MonsRules.MonKind.Spirit:
      return {
        icon: isBlack ? "spiritB" : "spirit",
        alt: isBlack ? "black spirit" : "spirit",
      };
    case MonsRules.MonKind.Mystic:
      return {
        icon: isBlack ? "mysticB" : "mystic",
        alt: isBlack ? "black mystic" : "mystic",
      };
    default:
      return null;
  }
}

function monIconForEvent(
  ev: MonsRules.EventModel,
  fallbackKind?: MonsRules.MonKind,
): { icon: string; alt: string } | null {
  const mon = ev.item?.mon ?? ev.mon;
  if (mon) {
    return monIconForKind(mon.kind, mon.color);
  }
  if (fallbackKind !== undefined) {
    return monIconForKind(fallbackKind, ev.color);
  }
  return null;
}

function manaIconFor(mana?: MonsRules.ManaModel | null): {
  icon: string;
  alt: string;
} {
  if (!mana) {
    return { icon: "mana", alt: "mana" };
  }
  if (mana.kind === MonsRules.ManaKind.Supermana) {
    return { icon: "supermana", alt: "supermana" };
  }
  const isBlack = mana.color === MonsRules.Color.Black;
  return {
    icon: isBlack ? "manaB" : "mana",
    alt: isBlack ? "black mana" : "mana",
  };
}

function manaOverlayIconFor(mana?: MonsRules.ManaModel | null): {
  icon: string;
  alt: string;
  variant: "mana" | "supermana";
} {
  if (!mana) {
    return { icon: "mana", alt: "mana", variant: "mana" };
  }
  if (mana.kind === MonsRules.ManaKind.Supermana) {
    return { icon: "supermanaSimple", alt: "supermana", variant: "supermana" };
  }
  const isBlack = mana.color === MonsRules.Color.Black;
  return {
    icon: isBlack ? "manaB" : "mana",
    alt: isBlack ? "black mana" : "mana",
    variant: "mana",
  };
}

function consumableIconFor(consumable?: MonsRules.Consumable | null): {
  icon: string;
  alt: string;
} {
  switch (consumable) {
    case MonsRules.Consumable.Potion:
      return { icon: "potion", alt: "potion" };
    case MonsRules.Consumable.Bomb:
      return { icon: "bomb", alt: "bomb" };
    case MonsRules.Consumable.BombOrPotion:
      return { icon: "bombOrPotion", alt: "bomb or potion" };
    default:
      return { icon: "bombOrPotion", alt: "consumable" };
  }
}

export function tokensForSingleMoveEvents(
  events: MonsRules.EventModel[],
  activeColor?: MonsRules.Color,
): MoveHistoryEntry {
  const segments: MoveHistorySegment[] = [];
  const segmentRoles: MoveHistorySegmentRole[] = [];
  let hasTurnSeparator = false;
  let lastArrowIndex: number | null = null;
  let lastArrowIsRight = true;
  let rightInsertIndex = 0;
  let lastActionSegment: MoveHistorySegment | null = null;

  const insertDestinationSegment = (segment: MoveHistorySegment) => {
    if (lastArrowIndex === null) {
      segments.push(segment);
      segmentRoles.push("destination");
    } else if (lastArrowIsRight) {
      segments.splice(rightInsertIndex, 0, segment);
      segmentRoles.splice(rightInsertIndex, 0, "destination");
      rightInsertIndex += 1;
    } else {
      segments.splice(lastArrowIndex, 0, segment);
      segmentRoles.splice(lastArrowIndex, 0, "destination");
      lastArrowIndex += 1;
      rightInsertIndex = lastArrowIndex + 1;
    }
  };

  const insertPotionIntoActionSegment = (segment: MoveHistorySegment) => {
    const potionToken: MoveHistoryToken = {
      type: "emoji",
      emoji: "statusPotion",
      alt: "potion status",
    };
    const actionIndex = segment.findIndex(
      (token) => token.type === "emoji" && token.emoji === "statusAction",
    );
    const existingPotionIndices: number[] = [];
    segment.forEach((token, index) => {
      if (token.type === "emoji" && token.emoji === "statusPotion") {
        existingPotionIndices.push(index);
      }
    });
    if (actionIndex === -1) {
      if (existingPotionIndices.length === 0) {
        segment.push(potionToken);
      }
      return;
    }
    segment[actionIndex] = potionToken;
    for (let i = existingPotionIndices.length - 1; i >= 0; i--) {
      const index = existingPotionIndices[i];
      if (index !== actionIndex) {
        segment.splice(index, 1);
      }
    }
  };

  for (let index = 0; index < events.length; index++) {
    const ev = events[index];
    const tokens: MoveHistoryToken[] = [];
    let segmentRole: "arrow" | "destination" | "normal" | "skip" = "normal";
    let arrowIsRight = true;
    let extraDestinationTokens: MoveHistorySegment | null = null;
    switch (ev.kind) {
      case MonsRules.EventModelKind.MonMove: {
        const monToken = monIconForEvent(ev);
        if (ev.item?.kind === MonsRules.ItemModelKind.MonWithMana) {
          const manaToken = manaOverlayIconFor(ev.item?.mana ?? ev.mana);
          if (monToken) {
            tokens.push(
              compositeToken(
                monToken,
                { icon: manaToken.icon, alt: manaToken.alt },
                manaToken.variant,
              ),
            );
          } else {
            tokens.push({
              type: "icon",
              icon: manaToken.icon,
              alt: manaToken.alt,
            });
          }
        } else if (
          ev.item?.kind === MonsRules.ItemModelKind.MonWithConsumable
        ) {
          const consumableToken = consumableIconFor(ev.item?.consumable);
          if (monToken) {
            tokens.push(compositeToken(monToken, consumableToken, "bomb"));
          } else {
            tokens.push({ type: "icon", ...consumableToken });
          }
        } else {
          if (monToken) tokens.push({ type: "icon", ...monToken });
        }

        addArrowToken(tokens, ev);
        arrowIsRight = arrowForEvent(ev).isRight;
        segmentRole = "arrow";
        break;
      }
      case MonsRules.EventModelKind.ManaMove: {
        const manaToken = manaIconFor(ev.mana ?? ev.item?.mana);
        tokens.push({ type: "icon", ...manaToken });
        addArrowToken(tokens, ev);
        arrowIsRight = arrowForEvent(ev).isRight;
        segmentRole = "arrow";
        break;
      }
      case MonsRules.EventModelKind.MysticAction: {
        const monToken = monIconForEvent(ev, MonsRules.MonKind.Mystic);
        let actorToken: MoveHistoryToken | null = null;
        if (monToken) {
          actorToken = { type: "icon", ...monToken };
          tokens.push(actorToken);
        }
        arrowIsRight = addActionArrowTokens(tokens, ev);
        segmentRole = "arrow";
        const targetTokens = targetTokensFromActionEvents(
          events,
          index,
          ev.loc2,
        );
        if (targetTokens.length > 0) extraDestinationTokens = targetTokens;
        break;
      }
      case MonsRules.EventModelKind.DemonAction: {
        const monToken = monIconForEvent(ev, MonsRules.MonKind.Demon);
        let actorToken: MoveHistoryToken | null = null;
        if (monToken) {
          actorToken = { type: "icon", ...monToken };
          tokens.push(actorToken);
        }
        arrowIsRight = addActionArrowTokens(tokens, ev);
        segmentRole = "arrow";
        const targetTokens = targetTokensFromActionEvents(
          events,
          index,
          ev.loc2,
        );
        if (targetTokens.length > 0) extraDestinationTokens = targetTokens;
        break;
      }
      case MonsRules.EventModelKind.SpiritTargetMove: {
        const targetTokens = tokensForItem(ev.item);
        const spiritToken = monIconForKind(
          MonsRules.MonKind.Spirit,
          activeColor ?? MonsRules.Color.White,
        );
        const actionToken: MoveHistoryToken = {
          type: "emoji",
          emoji: "statusAction",
          alt: "action",
        };
        const { arrow, isRight } = arrowForEvent(ev);
        const arrowToken: MoveHistoryToken = { type: "text", text: arrow };
        let actorToken: MoveHistoryToken | null = null;
        if (spiritToken) {
          actorToken = { type: "icon", ...spiritToken };
        }
        if (isRight) {
          if (actorToken) tokens.push(actorToken);
          tokens.push(actionToken);
          if (targetTokens.length > 0) tokens.push(...targetTokens);
          tokens.push(arrowToken);
        } else {
          tokens.push(arrowToken);
          if (targetTokens.length > 0) tokens.push(...targetTokens);
          tokens.push(actionToken);
          if (actorToken) tokens.push(actorToken);
        }
        arrowIsRight = isRight;
        segmentRole = "arrow";
        break;
      }
      case MonsRules.EventModelKind.BombAttack: {
        if (ev.mon) {
          const monToken = monIconForKind(ev.mon.kind, ev.mon.color);
          const bombToken = consumableIconFor(MonsRules.Consumable.Bomb);
          if (monToken) {
            tokens.push(compositeToken(monToken, bombToken, "bomb"));
          } else {
            tokens.push({ type: "icon", ...bombToken });
          }
        } else {
          tokens.push({
            type: "icon",
            ...consumableIconFor(MonsRules.Consumable.Bomb),
          });
        }
        addArrowToken(tokens, ev);
        arrowIsRight = arrowForEvent(ev).isRight;
        segmentRole = "arrow";
        const targetTokens = targetTokensFromActionEvents(
          events,
          index,
          ev.loc2,
        );
        if (targetTokens.length > 0) extraDestinationTokens = targetTokens;
        break;
      }
      case MonsRules.EventModelKind.ManaScored: {
        tokens.push({ type: "square", color: colors.manaPool, alt: "score" });
        segmentRole = "destination";
        break;
      }
      case MonsRules.EventModelKind.PickupBomb: {
        tokens.push({
          type: "icon",
          ...consumableIconFor(MonsRules.Consumable.Bomb),
        });
        segmentRole = "destination";
        break;
      }
      case MonsRules.EventModelKind.PickupPotion: {
        tokens.push({
          type: "icon",
          ...consumableIconFor(MonsRules.Consumable.Potion),
        });
        segmentRole = "destination";
        break;
      }
      case MonsRules.EventModelKind.PickupMana: {
        const prevKind = index > 0 ? events[index - 1].kind : undefined;
        const cameFromManaMove =
          prevKind === MonsRules.EventModelKind.ManaMove ||
          prevKind === MonsRules.EventModelKind.SpiritTargetMove;
        if (cameFromManaMove && ev.mon) {
          const monToken = monIconForKind(ev.mon.kind, ev.mon.color);
          if (monToken) {
            tokens.push({ type: "icon", ...monToken });
          }
        } else {
          const manaToken = manaIconFor(ev.mana ?? ev.item?.mana);
          tokens.push({ type: "icon", ...manaToken });
        }
        segmentRole = "destination";
        break;
      }
      case MonsRules.EventModelKind.BombExplosion:
        // TODO: explosion indicator when there is a swagpacked one
        break;
      case MonsRules.EventModelKind.GameOver:
        // TODO: add game ended indicator depending on the reason game ended
        break;
      case MonsRules.EventModelKind.UsePotion:
        if (lastActionSegment) {
          insertPotionIntoActionSegment(lastActionSegment);
          segmentRole = "skip";
        } else {
          tokens.push({
            type: "emoji",
            emoji: "statusPotion",
            alt: "potion status",
          });
        }
        break;
      case MonsRules.EventModelKind.NextTurn:
        hasTurnSeparator = true;
        segmentRole = "skip";
        break;
      case MonsRules.EventModelKind.MonFainted:
      case MonsRules.EventModelKind.ManaDropped:
      case MonsRules.EventModelKind.MonAwake:
      case MonsRules.EventModelKind.Takeback:
      case MonsRules.EventModelKind.SupermanaBackToBase:
      case MonsRules.EventModelKind.DemonAdditionalStep:
        break;
      default:
        break;
    }

    if (tokens.length === 0 || segmentRole === "skip") {
      continue;
    }

    if (segmentRole === "arrow") {
      segments.push(tokens);
      segmentRoles.push("arrow");
      lastArrowIndex = segments.length - 1;
      lastArrowIsRight = arrowIsRight;
      rightInsertIndex = lastArrowIndex + 1;
      if (
        ev.kind === MonsRules.EventModelKind.MysticAction ||
        ev.kind === MonsRules.EventModelKind.DemonAction ||
        ev.kind === MonsRules.EventModelKind.SpiritTargetMove
      ) {
        lastActionSegment = tokens;
      } else {
        lastActionSegment = null;
      }
    } else if (segmentRole === "destination") {
      insertDestinationSegment(tokens);
    } else {
      segments.push(tokens);
      segmentRoles.push("normal");
      lastArrowIndex = null;
      rightInsertIndex = segments.length;
      lastActionSegment = null;
    }

    if (extraDestinationTokens) {
      insertDestinationSegment(extraDestinationTokens);
    }
  }

  return { segments, segmentRoles, hasTurnSeparator };
}
