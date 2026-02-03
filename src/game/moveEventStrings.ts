import * as MonsWeb from "mons-web";
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

export function arrowForEvent(e: MonsWeb.EventModel): { arrow: string; isRight: boolean } {
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

function addArrowToken(tokens: MoveHistoryToken[], ev: MonsWeb.EventModel) {
  const { arrow, isRight } = arrowForEvent(ev);
  const arrowToken: MoveHistoryToken = { type: "text", text: arrow };
  if (isRight) {
    tokens.push(arrowToken);
  } else {
    tokens.unshift(arrowToken);
  }
}

function addActionArrowTokens(tokens: MoveHistoryToken[], ev: MonsWeb.EventModel): boolean {
  const { arrow, isRight } = arrowForEvent(ev);
  const actionToken: MoveHistoryToken = { type: "emoji", emoji: "statusAction", alt: "action" };
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

function tokensForMon(mon: MonsWeb.Mon | undefined): MoveHistoryToken[] {
  if (!mon) return [];
  const monToken = monIconForKind(mon.kind, mon.color);
  return monToken ? [{ type: "icon", ...monToken }] : [];
}

function compositeToken(
  base: { icon: string; alt: string },
  overlay: { icon: string; alt: string },
  variant: "mana" | "supermana" | "bomb"
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

function tokensForItem(item?: MonsWeb.ItemModel): MoveHistoryToken[] {
  if (!item) return [];
  const tokens: MoveHistoryToken[] = [];
  switch (item.kind) {
    case MonsWeb.ItemModelKind.MonWithMana: {
      const monToken = item.mon ? monIconForKind(item.mon.kind, item.mon.color) : null;
      const manaToken = manaOverlayIconFor(item.mana);
      if (monToken) {
        tokens.push(compositeToken(monToken, { icon: manaToken.icon, alt: manaToken.alt }, manaToken.variant));
      } else {
        tokens.push({ type: "icon", icon: manaToken.icon, alt: manaToken.alt });
      }
      break;
    }
    case MonsWeb.ItemModelKind.MonWithConsumable: {
      const monToken = item.mon ? monIconForKind(item.mon.kind, item.mon.color) : null;
      const consumableToken = consumableIconFor(item.consumable);
      if (monToken) {
        tokens.push(compositeToken(monToken, consumableToken, "bomb"));
      } else {
        tokens.push({ type: "icon", ...consumableToken });
      }
      break;
    }
    case MonsWeb.ItemModelKind.Mon: {
      if (item.mon) {
        const monToken = monIconForKind(item.mon.kind, item.mon.color);
        if (monToken) tokens.push({ type: "icon", ...monToken });
      }
      break;
    }
    case MonsWeb.ItemModelKind.Mana: {
      tokens.push({ type: "icon", ...manaIconFor(item.mana) });
      break;
    }
    case MonsWeb.ItemModelKind.Consumable: {
      tokens.push({ type: "icon", ...consumableIconFor(item.consumable) });
      break;
    }
    default:
      break;
  }
  return tokens;
}

function locationsEqual(a?: MonsWeb.Location, b?: MonsWeb.Location): boolean {
  if (!a || !b) return false;
  return a.i === b.i && a.j === b.j;
}

function targetTokensFromActionEvents(
  events: MonsWeb.EventModel[],
  startIndex: number,
  targetLoc?: MonsWeb.Location
): MoveHistoryToken[] {
  if (!targetLoc) return [];
  let targetMon: MonsWeb.Mon | null = null;
  let sawBombExplosion = false;
  let manaOverlay: { icon: string; alt: string; variant: "mana" | "supermana" } | null = null;
  let supermanaTokens: MoveHistoryToken[] | null = null;
  let manaTokens: MoveHistoryToken[] | null = null;

  for (let i = startIndex + 1; i < events.length; i++) {
    const next = events[i];
    switch (next.kind) {
      case MonsWeb.EventModelKind.MonFainted:
        if (locationsEqual(next.loc1, targetLoc) || locationsEqual(next.loc2, targetLoc)) {
          if (next.mon) {
            targetMon = next.mon;
          }
        }
        break;
      case MonsWeb.EventModelKind.ManaDropped:
        if (locationsEqual(next.loc1, targetLoc) && next.mana) {
          manaTokens = [{ type: "icon", ...manaIconFor(next.mana) }];
          const overlay = manaOverlayIconFor(next.mana);
          manaOverlay = { icon: overlay.icon, alt: overlay.alt, variant: overlay.variant };
        }
        break;
      case MonsWeb.EventModelKind.SupermanaBackToBase:
        if (locationsEqual(next.loc1, targetLoc)) {
          supermanaTokens = [{ type: "icon", icon: "supermana", alt: "supermana" }];
          manaOverlay = { icon: "supermanaSimple", alt: "supermana", variant: "supermana" };
        }
        break;
      case MonsWeb.EventModelKind.BombExplosion:
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
        return [compositeToken(monToken, { icon: manaOverlay.icon, alt: manaOverlay.alt }, manaOverlay.variant)];
      }
      if (sawBombExplosion) {
        const bombToken = consumableIconFor(MonsWeb.Consumable.Bomb);
        return [compositeToken(monToken, bombToken, "bomb")];
      }
      return [{ type: "icon", ...monToken }];
    }
  }

  return supermanaTokens ?? manaTokens ?? [];
}

function monIconForKind(kind: MonsWeb.MonKind | undefined, color?: MonsWeb.Color): { icon: string; alt: string } | null {
  if (kind === undefined || kind === null) return null;
  const isBlack = color === MonsWeb.Color.Black;
  switch (kind) {
    case MonsWeb.MonKind.Demon:
      return { icon: isBlack ? "demonB" : "demon", alt: isBlack ? "black demon" : "demon" };
    case MonsWeb.MonKind.Drainer:
      return { icon: isBlack ? "drainerB" : "drainer", alt: isBlack ? "black drainer" : "drainer" };
    case MonsWeb.MonKind.Angel:
      return { icon: isBlack ? "angelB" : "angel", alt: isBlack ? "black angel" : "angel" };
    case MonsWeb.MonKind.Spirit:
      return { icon: isBlack ? "spiritB" : "spirit", alt: isBlack ? "black spirit" : "spirit" };
    case MonsWeb.MonKind.Mystic:
      return { icon: isBlack ? "mysticB" : "mystic", alt: isBlack ? "black mystic" : "mystic" };
    default:
      return null;
  }
}

function monIconForEvent(ev: MonsWeb.EventModel, fallbackKind?: MonsWeb.MonKind): { icon: string; alt: string } | null {
  const mon = ev.item?.mon ?? ev.mon;
  if (mon) {
    return monIconForKind(mon.kind, mon.color);
  }
  if (fallbackKind !== undefined) {
    return monIconForKind(fallbackKind, ev.color);
  }
  return null;
}

function manaIconFor(mana?: MonsWeb.ManaModel | null): { icon: string; alt: string } {
  if (!mana) {
    return { icon: "mana", alt: "mana" };
  }
  if (mana.kind === MonsWeb.ManaKind.Supermana) {
    return { icon: "supermana", alt: "supermana" };
  }
  const isBlack = mana.color === MonsWeb.Color.Black;
  return { icon: isBlack ? "manaB" : "mana", alt: isBlack ? "black mana" : "mana" };
}

function manaOverlayIconFor(mana?: MonsWeb.ManaModel | null): { icon: string; alt: string; variant: "mana" | "supermana" } {
  if (!mana) {
    return { icon: "mana", alt: "mana", variant: "mana" };
  }
  if (mana.kind === MonsWeb.ManaKind.Supermana) {
    return { icon: "supermanaSimple", alt: "supermana", variant: "supermana" };
  }
  const isBlack = mana.color === MonsWeb.Color.Black;
  return { icon: isBlack ? "manaB" : "mana", alt: isBlack ? "black mana" : "mana", variant: "mana" };
}

function consumableIconFor(consumable?: MonsWeb.Consumable | null): { icon: string; alt: string } {
  switch (consumable) {
    case MonsWeb.Consumable.Potion:
      return { icon: "potion", alt: "potion" };
    case MonsWeb.Consumable.Bomb:
      return { icon: "bomb", alt: "bomb" };
    case MonsWeb.Consumable.BombOrPotion:
      return { icon: "bombOrPotion", alt: "bomb or potion" };
    default:
      return { icon: "bombOrPotion", alt: "consumable" };
  }
}

export function tokensForSingleMoveEvents(events: MonsWeb.EventModel[], activeColor?: MonsWeb.Color): MoveHistoryEntry {
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
    const potionToken: MoveHistoryToken = { type: "emoji", emoji: "statusPotion", alt: "potion status" };
    const actionIndex = segment.findIndex((token) => token.type === "emoji" && token.emoji === "statusAction");
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
      case MonsWeb.EventModelKind.MonMove: {
        const monToken = monIconForEvent(ev);
        if (ev.item?.kind === MonsWeb.ItemModelKind.MonWithMana) {
          const manaToken = manaOverlayIconFor(ev.item?.mana ?? ev.mana);
          if (monToken) {
            tokens.push(compositeToken(monToken, { icon: manaToken.icon, alt: manaToken.alt }, manaToken.variant));
          } else {
            tokens.push({ type: "icon", icon: manaToken.icon, alt: manaToken.alt });
          }
        } else if (ev.item?.kind === MonsWeb.ItemModelKind.MonWithConsumable) {
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
      case MonsWeb.EventModelKind.ManaMove: {
        const manaToken = manaIconFor(ev.mana ?? ev.item?.mana);
        tokens.push({ type: "icon", ...manaToken });
        addArrowToken(tokens, ev);
        arrowIsRight = arrowForEvent(ev).isRight;
        segmentRole = "arrow";
        break;
      }
      case MonsWeb.EventModelKind.MysticAction: {
        const monToken = monIconForEvent(ev, MonsWeb.MonKind.Mystic);
        let actorToken: MoveHistoryToken | null = null;
        if (monToken) {
          actorToken = { type: "icon", ...monToken };
          tokens.push(actorToken);
        }
        arrowIsRight = addActionArrowTokens(tokens, ev);
        segmentRole = "arrow";
        const targetTokens = targetTokensFromActionEvents(events, index, ev.loc2);
        if (targetTokens.length > 0) extraDestinationTokens = targetTokens;
        break;
      }
      case MonsWeb.EventModelKind.DemonAction: {
        const monToken = monIconForEvent(ev, MonsWeb.MonKind.Demon);
        let actorToken: MoveHistoryToken | null = null;
        if (monToken) {
          actorToken = { type: "icon", ...monToken };
          tokens.push(actorToken);
        }
        arrowIsRight = addActionArrowTokens(tokens, ev);
        segmentRole = "arrow";
        const targetTokens = targetTokensFromActionEvents(events, index, ev.loc2);
        if (targetTokens.length > 0) extraDestinationTokens = targetTokens;
        break;
      }
      case MonsWeb.EventModelKind.SpiritTargetMove: {
        const targetTokens = tokensForItem(ev.item);
        const spiritToken = monIconForKind(MonsWeb.MonKind.Spirit, activeColor ?? MonsWeb.Color.White);
        const actionToken: MoveHistoryToken = { type: "emoji", emoji: "statusAction", alt: "action" };
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
      case MonsWeb.EventModelKind.BombAttack: {
        if (ev.mon) {
          const monToken = monIconForKind(ev.mon.kind, ev.mon.color);
          const bombToken = consumableIconFor(MonsWeb.Consumable.Bomb);
          if (monToken) {
            tokens.push(compositeToken(monToken, bombToken, "bomb"));
          } else {
            tokens.push({ type: "icon", ...bombToken });
          }
        } else {
          tokens.push({ type: "icon", ...consumableIconFor(MonsWeb.Consumable.Bomb) });
        }
        addArrowToken(tokens, ev);
        arrowIsRight = arrowForEvent(ev).isRight;
        segmentRole = "arrow";
        const targetTokens = targetTokensFromActionEvents(events, index, ev.loc2);
        if (targetTokens.length > 0) extraDestinationTokens = targetTokens;
        break;
      }
      case MonsWeb.EventModelKind.ManaScored: {
        tokens.push({ type: "square", color: colors.manaPool, alt: "score" });
        segmentRole = "destination";
        break;
      }
      case MonsWeb.EventModelKind.PickupBomb: {
        tokens.push({ type: "icon", ...consumableIconFor(MonsWeb.Consumable.Bomb) });
        segmentRole = "destination";
        break;
      }
      case MonsWeb.EventModelKind.PickupPotion: {
        tokens.push({ type: "icon", ...consumableIconFor(MonsWeb.Consumable.Potion) });
        segmentRole = "destination";
        break;
      }
      case MonsWeb.EventModelKind.PickupMana: {
        const manaToken = manaIconFor(ev.mana ?? ev.item?.mana);
        tokens.push({ type: "icon", ...manaToken });
        segmentRole = "destination";
        break;
      }
      case MonsWeb.EventModelKind.BombExplosion:
        // TODO: explosion indicator when there is a swagpacked one
        break;
      case MonsWeb.EventModelKind.GameOver:
        // TODO: add game ended indicator depending on the reason game ended
        break;
      case MonsWeb.EventModelKind.UsePotion:
        if (lastActionSegment) {
          insertPotionIntoActionSegment(lastActionSegment);
          segmentRole = "skip";
        } else {
          tokens.push({ type: "emoji", emoji: "statusPotion", alt: "potion status" });
        }
        break;
      case MonsWeb.EventModelKind.NextTurn:
        hasTurnSeparator = true;
        segmentRole = "skip";
        break;
      case MonsWeb.EventModelKind.MonFainted:
      case MonsWeb.EventModelKind.ManaDropped:
      case MonsWeb.EventModelKind.MonAwake:
      case MonsWeb.EventModelKind.Takeback:
      case MonsWeb.EventModelKind.SupermanaBackToBase:
      case MonsWeb.EventModelKind.DemonAdditionalStep:
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
        ev.kind === MonsWeb.EventModelKind.MysticAction ||
        ev.kind === MonsWeb.EventModelKind.DemonAction ||
        ev.kind === MonsWeb.EventModelKind.SpiritTargetMove
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
