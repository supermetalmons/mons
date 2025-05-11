export const demonTypes = ["borgalo", "notchur"];
export const angelTypes = ["applecreme", "gerp", "goxfold", "mowch", "mummyfly"];
export const drainerTypes = ["deino", "greenseech", "omom", "supermetaldrop", "zwubbi"];
export const spiritTypes = ["melmut", "omenstatue", "owg"];
export const mysticTypes = ["chamgot", "dart", "estalibur"];

export function getDemonId(index: number): string {
  return demonTypes[index] + "_demon";
}

export function getAngelId(index: number): string {
  return angelTypes[index] + "_angel";
}

export function getDrainerId(index: number): string {
  return drainerTypes[index] + "_drainer";
}

export function getSpiritId(index: number): string {
  return spiritTypes[index] + "_spirit";
}

export function getMysticId(index: number): string {
  return mysticTypes[index] + "_mystic";
}
