import { storage } from "../utils/storage";
import { connection } from "../connection/connection";

export type Problem = {
  id: string;
  icon: string;
  label: string;
  fen: string;
  description: string;
};

export const problems: Problem[] = [
  { id: "drainer", icon: "drainer", label: "Moving & Scoring", description: "Move your drainer onto the same tile as a mana to pick it up, then carry it to a mana pool in any corner to score.", fen: "4 0 w 0 0 0 0 0 15 n11/n11/n11/n11/n11/n11/n11/n02xxMn02D0xn05/n04xxMn02xxMn03/n11/n11" },
  { id: "mana", icon: "mana", label: "Mana Moves", description: "You can move one mana once per turn (except for white's very first turn) entirely on its own, but this immediately ends your turn so save it until you're ready! ", fen: "4 0 w 0 0 0 0 0 21 n11/n11/n11/n11/n11/n11/n03xxMn07/n04xxMn06/n11/n01xxMn09/n10D0x" },
  { id: "spirit", icon: "spirit", label: "Spirits", description: "It is also possible to move mana using your spirit's active ability, which has a target range of exactly 2 tiles away.", fen: "4 0 w 0 0 5 0 0 13 n11/n11/n11/n11/n11/n11/n03xxMn02xxMn04/n11/n02xxMn01S0xn06/n11/n11" },
  { id: "spirit2", icon: "spirit", label: "Spirits 2", description: "The spirit can move any piece on the board — mana, items, or other mons. You can use this to get a little extra boost.", fen: "4 1 w 0 0 0 0 0 19 n11/n11/n11/n11/n11/n11/n05xxMn05/n06D0xn04/n11/n06S0xn04/n11" },
  { id: "demon", icon: "demon", label: "Demons", description: "Faint any opposing mons in your way with a demon attack, which has a target range of exactly 2 tiles away up, down, left, or right.", fen: "4 0 w 0 0 0 0 0 15 y0xn10/n11/D0Mn03E0xn06/n11/n11/n11/n07xxMn03/n11/n11/n11/n11" },
  { id: "mystic", icon: "mystic", label: "Mystics", description: "The mystic attack also faints opposing mons, but has a target range of exactly 2 tiles away diagonally. Unlike the demon, it can also shoot over other pieces.", fen: "4 0 w 0 0 0 0 0 17 n11/n11/n11/n11/n11/n11/n11/n01D0xn06xxMn02/d0Mn03Y0xn06/n11/n11" },
  { id: "manab", icon: "manaB", label: "Stealing Mana", description: "If you manage to score one of your opponent's color mana for yourself, it is worth 2 points. Whoever moves the mana into the pool gets the points.", fen: "3 0 w 0 0 0 0 0 23 n11/n11/n11/n11/n11/n11/n03xxMn07/n09xxmn01/n08D0Mn02/n11/n11" },
  { id: "items", icon: "bombOrPotion", label: "Items", description: "Pick up a bomb or a potion to free up the pool. Move mana into the pool.", fen: "4 0 w 0 0 0 0 0 13 n11/n11/n11/n11/n11/n11/n11/n02xxMn08/n11/n09xxMn01/n07Y0xn02xxQ" },
  { id: "bomb", icon: "bomb", label: "Bombs", description: "The enemy drainer has run off with one of your mana! Neither of your attackers can quite reach, but any mon can use a bomb to faint a mon from up to 3 tiles away.", fen: "4 0 w 0 0 0 0 0 21 n11/n01d0Mn09/n11/n11/n11/xxQn10/n04A0xn06/n06xxMn04/n11/n11/n11" },
  { id: "potion", icon: "potion", label: "Potions", description: "Between the spirit, mystic, and demon you can normally only use one active ability per turn. But by using a potion, you get one more. This gives you some extra distance or firepower in a pinch.", fen: "4 0 w 0 0 0 0 0 7 n11/n11/n11/n11/n11/n10xxQ/n11/n08xxMn02/n07xxMn03/n07S0xn03/n11" },
  { id: "angel", icon: "angel", label: "Angels", description: "Angels will protect any adjacent friendly mons from demon or mystic attacks, but are not immune to attack themselves.", fen: "4 0 w 0 0 0 1 0 15 n11/n11/n11/n11/n11/n11/n11/n05xxMn05/n11/n08Y0xxxMa0x/n10e0x" },
  { id: "supermana", icon: "supermana", label: "Super Mana", description: "The super mana is worth 2 points all the time — a lucrative prize indeed!", fen: "3 0 w 0 0 0 0 0 11 n11/n11/n11/n11/n11/n05xxUn05/n06D0xn04/n03xxMn07/n11/n06S0xn04/n11" },
  { id: "supermana2", icon: "supermana", label: "Super Mana 2", description: "It can be risky grabbing the super mana though, as if a drainer is fainted while holding it, it will automatically return to the central tile.", fen: "3 0 w 0 0 0 0 0 13 n11/n01d0Un09/n11/n03Y0xn07/n11/n05D0xn05/n05xxMn01xxMn03/n11/n11/n11/n11" },
];

export function getNextProblem(id: string): Problem | null {
  const completedSet = getCompletedProblemIds();
  const currentIndex = problems.findIndex((p) => p.id === id);
  if (currentIndex === -1) return null;
  for (let i = currentIndex + 1; i < problems.length; i++) {
    const candidate = problems[i];
    if (!completedSet.has(candidate.id)) {
      return candidate;
    }
  }
  return null;
}

export function getCompletedProblemIds(): Set<string> {
  return new Set(storage.getCompletedProblemIds([]));
}

export function getTutorialCompleted(): boolean {
  return storage.getTutorialCompleted(false);
}

export function markProblemCompleted(id: string): void {
  const completed = getCompletedProblemIds();
  if (!completed.has(id)) {
    completed.add(id);
    const allCompleted = Array.from(completed);
    storage.setCompletedProblemIds(allCompleted);
    connection.updateCompletedProblems(allCompleted);

    if (allCompleted.length === problems.length && !getTutorialCompleted()) {
      storage.setTutorialCompleted(true);
      connection.updateTutorialCompleted(true);
    }
  }
}

export function syncTutorialProgress(remoteCompletedProblemIds: string[], remoteTutorialCompleted: boolean) {
  const localTutorialCompleted = getTutorialCompleted();
  const localCompleted = getCompletedProblemIds();

  if (localTutorialCompleted && remoteTutorialCompleted && localCompleted.size === problems.length && remoteCompletedProblemIds.length === problems.length) {
    return;
  }

  const merged = new Set([...localCompleted, ...remoteCompletedProblemIds]);

  const mergedArray = Array.from(merged);
  const newTutorialCompleted = localTutorialCompleted || remoteTutorialCompleted || merged.size === problems.length;

  storage.setCompletedProblemIds(mergedArray);
  storage.setTutorialCompleted(newTutorialCompleted);

  if (merged.size !== remoteCompletedProblemIds.length) {
    connection.updateCompletedProblems(mergedArray);
  }
  if (newTutorialCompleted !== remoteTutorialCompleted) {
    connection.updateTutorialCompleted(newTutorialCompleted);
  }
}
