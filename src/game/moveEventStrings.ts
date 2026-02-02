import * as MonsWeb from "mons-web";
import * as Board from "./board";
import { colors } from "../content/boardStyles";

export type MoveHistoryToken =
  | { type: "icon"; icon: string; alt: string }
  | { type: "text"; text: string }
  | { type: "emoji"; emoji: string; alt: string }
  | { type: "square"; color: string; alt: string }
  | { type: "composite"; baseIcon: string; overlayIcon: string; alt: string; overlayAlt: string; variant: "mana" | "supermana" };

export type MoveHistorySegment = MoveHistoryToken[];

export type MoveHistoryEntry = {
  segments: MoveHistorySegment[];
  hasTurnSeparator?: boolean;
};

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

export function tokensForSingleMoveEvents(events: MonsWeb.EventModel[]): MoveHistoryEntry {
  const segments: MoveHistorySegment[] = [];
  let hasTurnSeparator = false;
  let lastArrowIndex: number | null = null;
  let lastArrowIsRight = true;
  let rightInsertIndex = 0;

  for (const ev of events) {
    const tokens: MoveHistoryToken[] = [];
    let segmentRole: "arrow" | "destination" | "normal" | "skip" = "normal";
    let arrowIsRight = true;
    switch (ev.kind) {
      case MonsWeb.EventModelKind.MonMove: {
        const monToken = monIconForEvent(ev);
        if (ev.item?.kind === MonsWeb.ItemModelKind.MonWithMana) {
          const manaToken = manaOverlayIconFor(ev.item?.mana ?? ev.mana);
          if (monToken) {
            tokens.push({
              type: "composite",
              baseIcon: monToken.icon,
              overlayIcon: manaToken.icon,
              alt: `${monToken.alt} carrying ${manaToken.alt}`,
              overlayAlt: manaToken.alt,
              variant: manaToken.variant,
            });
          } else {
            tokens.push({ type: "icon", icon: manaToken.icon, alt: manaToken.alt });
          }
        } else {
          if (monToken) tokens.push({ type: "icon", ...monToken });
          if (ev.item?.kind === MonsWeb.ItemModelKind.MonWithConsumable) {
            const consumableToken = consumableIconFor(ev.item?.consumable);
            tokens.push({ type: "icon", ...consumableToken });
          }
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
        if (monToken) tokens.push({ type: "icon", ...monToken });
        tokens.push({ type: "emoji", emoji: "statusAction", alt: "action" });
        addArrowToken(tokens, ev);
        arrowIsRight = arrowForEvent(ev).isRight;
        segmentRole = "arrow";
        break;
      }
      case MonsWeb.EventModelKind.DemonAction: {
        const monToken = monIconForEvent(ev, MonsWeb.MonKind.Demon);
        if (monToken) tokens.push({ type: "icon", ...monToken });
        tokens.push({ type: "emoji", emoji: "statusAction", alt: "action" });
        addArrowToken(tokens, ev);
        arrowIsRight = arrowForEvent(ev).isRight;
        segmentRole = "arrow";
        break;
      }
      case MonsWeb.EventModelKind.SpiritTargetMove: {
        const monToken = monIconForEvent(ev, MonsWeb.MonKind.Spirit);
        if (monToken) tokens.push({ type: "icon", ...monToken });
        addArrowToken(tokens, ev);
        arrowIsRight = arrowForEvent(ev).isRight;
        segmentRole = "arrow";
        break;
      }
      case MonsWeb.EventModelKind.BombAttack: {
        tokens.push({ type: "icon", ...consumableIconFor(MonsWeb.Consumable.Bomb) });
        addArrowToken(tokens, ev);
        arrowIsRight = arrowForEvent(ev).isRight;
        segmentRole = "arrow";
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
        tokens.push({ type: "emoji", emoji: "statusPotion", alt: "potion status" });
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

    if (tokens.length === 0) {
      continue;
    }

    if (segmentRole === "arrow") {
      segments.push(tokens);
      lastArrowIndex = segments.length - 1;
      lastArrowIsRight = arrowIsRight;
      rightInsertIndex = lastArrowIndex + 1;
      continue;
    }

    if (segmentRole === "destination") {
      if (lastArrowIndex === null) {
        segments.push(tokens);
      } else if (lastArrowIsRight) {
        segments.splice(rightInsertIndex, 0, tokens);
        rightInsertIndex += 1;
      } else {
        segments.splice(lastArrowIndex, 0, tokens);
        lastArrowIndex += 1;
        rightInsertIndex = lastArrowIndex + 1;
      }
      continue;
    }

    if (segmentRole === "skip") {
      continue;
    }

    segments.push(tokens);
    lastArrowIndex = null;
    rightInsertIndex = segments.length;
  }

  return { segments, hasTurnSeparator };
}
