export type Problem = {
  id: string;
  label: string;
  fen: string;
  description: string;
};

export const problems: Problem[] = [
  { id: "drainer", label: "Moving & Scoring", description: "Move your drainer onto the same tile as a mana to pick it up, then carry it to a mana pool in any corner to score.", fen: "4 0 w 0 0 0 0 0 15 n11/n11/n11/n11/n11/n11/n11/n02xxMn02D0xn05/n04xxMn02xxMn03/n11/n11" },
  { id: "mana", label: "Mana Moves", description: "You can move one mana once per turn (except for white's very first turn) entirely on its own, but this immediately ends your turn so save it until you're ready! ", fen: "4 0 w 0 0 0 0 0 21 n11/n11/n11/n11/n11/n11/n03xxMn07/n04xxMn06/n11/n01xxMn09/n10D0x" },
  { id: "spirit", label: "Spirits", description: "It is also possible to move mana using your spirit's active ability, which has a target range of exactly 2 tiles away.", fen: "4 0 w 0 0 5 0 0 13 n11/n11/n11/n11/n11/n11/n03xxMn02xxMn04/n11/n02xxMn01S0xn06/n11/n11" },
  { id: "spirit2", label: "Spirits 2", description: "The spirit can move any piece on the board — mana, items, or other mons. You can use this to get a little extra boost.", fen: "4 1 w 0 0 0 0 0 19 n11/n11/n11/n11/n11/n11/n05xxMn05/n06D0xn04/n11/n06S0xn04/n11" },
  { id: "demon", label: "Demons", description: "Faint any opposing mons in your way with a demon attack, which has a target range of exactly 2 tiles away up, down, left, or right.", fen: "4 0 w 0 0 0 0 0 15 y0xn04d0xn05/n11/D0Mn03E0xn06/n11/n11/n11/n11/n11/n11/n11/n11" },
  { id: "mystic", label: "Mystics", description: "The mystic attack also faints opposing mons, but has a target range of exactly 2 tiles away diagonally. Unlike the demon, it can also shoot over other pieces.", fen: "4 0 w 0 0 0 0 0 17 n01xxmn01y0xn03e0xn03/xxmn01xxmn02a0xn05/n05xxmn03E0xn01/n07S0xn03/n07xxmn03/xxQn02s0xn06xxQ/n11/n01D0xn06xxMn02/d0Mn03Y0xn02xxMn03/n05A0xn05/n11" },
  { id: "manab", label: "Stealing Mana", description: "If you manage to score one of your opponent's color mana for yourself, it is worth 2 points. Whoever moves the mana into the pool gets the points.", fen: "3 0 w 0 0 0 0 0 23 n06a0xn04/n02y0xn01s0xn02e0xxxmn02/n01xxmn01xxmn01d0xn05/n02xxmn08/n11/xxQn09xxQ/n03xxMn01xxMn05/n06xxMn02xxmn01/n08D0Mn02/n11/n03E0xA0xn01S1xY0xn03" },
  { id: "items", label: "Items", description: "Pick up a bomb or a potion to free up the pool. Move mana into the pool.", fen: "4 0 w 0 0 0 0 0 13 s0xn02y0xn02a0xe0xn02D0x/n03S0xn07/n01xxmn01d0mn07/n06xxmn04/n05xxmn05/xxQn10/n05xxMn01xxMn03/n02xxMn08/n03xxMn07/n09xxMn01/n03E0xA0xn02Y0xn02xxQ" },
  { id: "bomb", label: "Bombs", description: "The enemy drainer has run off with one of your mana! Neither of your attackers can quite reach, but any mon can use a bomb to faint a mon from up to 3 tiles away.", fen: "4 0 w 0 0 0 0 0 21 n08D0xs0xn01/n01d0Mn05y0xa0xe0xn01/n11/n04xxmn06/n03xxmn01xxmn01xxmn03/xxQn09xxQ/n03xxMA0xxxMn05/n04xxMn01xxMn03Y0x/n11/n11/n03E0xn02S0xn04" },
  { id: "potion", label: "Potions", description: "Between the spirit, mystic, and demon you can normally only use one active ability per turn. But by using a potion, you get one more. This gives you some extra distance or firepower in a pinch.", fen: "4 0 w 0 0 0 0 0 7 n05d0xn01e0xn02D0x/n04s0xn02a0xn03/n11/n04xxmn01xxmn04/n01y0xn01xxmn01xxmn05/xxQn09xxQ/n03xxMn01xxMn05/n04xxMn03xxMn02/n07xxMn03/n07S0xn03/n03E0xA0xn02Y0xn03" },
  { id: "angel", label: "Angels", description: "Angels will protect any adjacent friendly mons from demon or mystic attacks, but are not immune to attack themselves.", fen: "4 0 w 0 0 0 1 0 15 D0xn02y0xs0xd0xn05/n11/n06xxmxxmxxmn02/n11/n05xxmn05/S0xn09xxQ/n04xxMxxMn05/n05xxMxxMn04/n11/n08Y0xxxMa0x/n03E0xA0xn05e0x" },
  { id: "supermana", label: "Super Mana", description: "The super mana is worth 2 points all the time — a lucrative prize indeed!", fen: "3 0 w 0 0 0 0 0 11 y0xn05a0xn03e0x/n05s0xn02xxmn01d0m/n11/n02xxmn01xxmn01xxmn04/n11/xxQn04xxUn04xxQ/n05xxMD0xn04/n03xxMn07/n11/n06S0xn04/n03E0xA0xn02Y0xn03" },
  { id: "supermana2", label: "Super Mana 2", description: "It can be risky grabbing the super mana though, as if a drainer is fainted while holding it, it will automatically return to the central tile.", fen: "3 0 w 0 0 0 0 0 13 n03y0xs0xn01a0xn04/n01d0Un05xxmn03/n09e0xn01/n02xxmY0xxxmn04xxmn01/n05xxmn05/xxQn04D0xn04xxQ/n05xxMn01xxMn03/n11/n11/n06S0xn04/n03E0xA0xn06" },
];

export function getNextProblem(id: string): Problem | null {
  const currentIndex = problems.findIndex((problem) => problem.id === id);
  if (currentIndex === -1 || currentIndex === problems.length - 1) {
    return null;
  }
  return problems[currentIndex + 1];
}
