import * as MonsWeb from "mons-web";
import * as Board from "./board";

export function arrowForEvent(e: MonsWeb.EventModel): { arrow: string; isRight: boolean } {
  const from = e.loc1;
  const to = e.loc2;
  if (!from || !to) return { arrow: "➡️", isRight: true };
  let di = to.i - from.i;
  let dj = to.j - from.j;
  if (Board.isFlipped) {
    di = -di;
    dj = -dj;
  }
  if (di === 0 && dj > 0) return { arrow: "➡️", isRight: true };
  if (di === 0 && dj < 0) return { arrow: "⬅️", isRight: false };
  if (dj === 0 && di > 0) return { arrow: "⬇️", isRight: true };
  if (dj === 0 && di < 0) return { arrow: "⬆️", isRight: true };
  if (di < 0 && dj > 0) return { arrow: "↗️", isRight: true };
  if (di > 0 && dj > 0) return { arrow: "↘️", isRight: true };
  if (di > 0 && dj < 0) return { arrow: "↙️", isRight: false };
  if (di < 0 && dj < 0) return { arrow: "↖️", isRight: false };
  return { arrow: "➡️", isRight: true };
}

export function stringForSingleMoveEvents(events: MonsWeb.EventModel[]): string {
  let out = "";

  let actor = "";
  let action = "";
  let arrow = "";
  let target = "";

  let moveDirection: boolean | null = null;
  for (const ev of events) {
    let s = "";
    switch (ev.kind) {
      case MonsWeb.EventModelKind.MonMove:
        const monMoveArrow = arrowForEvent(ev);
        s = monMoveArrow.arrow;
        moveDirection = monMoveArrow.isRight;
        break;
      case MonsWeb.EventModelKind.ManaMove:
        const manaMoveArrow = arrowForEvent(ev);
        s = "💧" + manaMoveArrow.arrow;
        moveDirection = manaMoveArrow.isRight;
        break;
      case MonsWeb.EventModelKind.ManaScored:
        s = ev.mana && ev.mana.kind === MonsWeb.ManaKind.Supermana ? "👑✅" : "💧✅";
        break;
      case MonsWeb.EventModelKind.MysticAction:
        s = "🧙⚡️";
        // TODO: move direction
        break;
      case MonsWeb.EventModelKind.DemonAction:
        // TODO: move direction
        s = "😈🔥";
        break;
      case MonsWeb.EventModelKind.SpiritTargetMove:
        const spiritMoveArrow = arrowForEvent(ev);
        s = "👻" + spiritMoveArrow.arrow;
        moveDirection = spiritMoveArrow.isRight;
        break;
      case MonsWeb.EventModelKind.PickupBomb:
        s = "💣";
        break;
      case MonsWeb.EventModelKind.PickupPotion:
        s = "🧪";
        break;
      case MonsWeb.EventModelKind.PickupMana:
        s = "💧";
        break;
      case MonsWeb.EventModelKind.BombAttack:
        const bombAttackArrow = arrowForEvent(ev);
        s = "💣" + bombAttackArrow.arrow;
        moveDirection = bombAttackArrow.isRight;
        break;
      case MonsWeb.EventModelKind.BombExplosion:
        s = "💥";
        break;
      case MonsWeb.EventModelKind.NextTurn:
        s = "⏭️";
        break;
      case MonsWeb.EventModelKind.GameOver:
        s = "🏆";
        break;
      case MonsWeb.EventModelKind.UsePotion:
        s = "🧪🫧";
        break;
      case MonsWeb.EventModelKind.MonFainted:
      case MonsWeb.EventModelKind.ManaDropped:
      case MonsWeb.EventModelKind.MonAwake:
      case MonsWeb.EventModelKind.Takeback:
      case MonsWeb.EventModelKind.SupermanaBackToBase:
      case MonsWeb.EventModelKind.DemonAdditionalStep:
        s = "";
        break;
      default:
        s = "";
    }
    if (s === "") continue;
    if (out !== "") out += " ";
    out += s;
  }

  if (moveDirection !== null) {
    if (moveDirection) {
      // TODO: actor before arrow
    } else {
      // TODO: actor after arrow
    }
  }

  // TODO: build output with actor / arrow / action / target

  return out === "" ? "—" : out;
}
