import { getStableRandomIdForProfileId } from "../utils/misc";

export enum MonType {
  DEMON = "demon",
  ANGEL = "angel",
  DRAINER = "drainer",
  SPIRIT = "spirit",
  MYSTIC = "mystic",
}

export const demonTypes = ["borgalo", "notchur"];
export const angelTypes = ["applecreme", "gerp", "goxfold", "mowch", "mummyfly"];
export const drainerTypes = ["deino", "greenseech", "omom", "supermetaldrop", "zwubbi"];
export const spiritTypes = ["melmut", "omenstatue", "owg"];
export const mysticTypes = ["chamgot", "dart", "estalibur"];

export function getMonId(type: MonType, index: number): string {
  switch (type) {
    case MonType.DEMON:
      return demonTypes[index] + "_" + type;
    case MonType.ANGEL:
      return angelTypes[index] + "_" + type;
    case MonType.DRAINER:
      return drainerTypes[index] + "_" + type;
    case MonType.SPIRIT:
      return spiritTypes[index] + "_" + type;
    case MonType.MYSTIC:
      return mysticTypes[index] + "_" + type;
  }
}

export function getDefaultMonId(type: MonType, profileId: string): number {
  switch (type) {
    case MonType.DEMON:
      return getStableRandomIdForProfileId(profileId, demonTypes.length);
    case MonType.ANGEL:
      return getStableRandomIdForProfileId(profileId, angelTypes.length);
    case MonType.DRAINER:
      return getStableRandomIdForProfileId(profileId, drainerTypes.length);
    case MonType.SPIRIT:
      return getStableRandomIdForProfileId(profileId, spiritTypes.length);
    case MonType.MYSTIC:
      return getStableRandomIdForProfileId(profileId, mysticTypes.length);
  }
}
