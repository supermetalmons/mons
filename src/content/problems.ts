export type Problem = {
  id: string;
  label: string;
  fen: string;
  description: string;
};

export const problems: Problem[] = [
  { id: "mana", label: "Mana 101", description: "Move mana into the pool.", fen: "4 0 w 0 0 0 0 0 21 n03y0xs0xd0xa0xe0xn03/n11/n11/n04xxmn01xxmn04/n03xxmn01xxmn01xxmn03/xxQn09S0B/n03xxMn07/n04xxMn06/n11/n01xxMn09/n03E0xA0xn02Y0xn02D0x" },
  { id: "drainer", label: "Drainer 101", description: "Carry mana into the pool with Drainer.", fen: "4 0 w 0 0 0 0 0 9 n03y0xn01d0xa0xe0xn03/n11/n05s0xn05/n04xxmn01xxmn04/n03xxmn03xxmn03/xxQn09xxQ/n03xxMn01xxMn05/n04xxMn03D0Mn02/n07xxMn03/n11/n03E0xA0xn01S0xY0xn03" },
  { id: "demon", label: "Demon 101", description: "1. Attack with Demon to free up the pool.\n2. Carry mana into the pool with Drainer.", fen: "4 0 w 0 0 0 0 0 15 y0xn04d0xa0xe0xn03/n02xxmn08/D0Mn02xxmE0xn06/n06xxmn01xxmn02/n11/xxQn01s0xn07xxQ/n05xxMn01xxMn03/n04xxMn01xxMn04/n11/n11/n04A0xn01S0xY0xn03" },
  { id: "spirit", label: "Spirit 101", description: "1. Use Spirit action to move Drainer to the mana.\n2. Carry mana into the pool with Drainer.", fen: "4 1 w 0 0 0 0 0 19 n03y0xs0xn01a0xe0xn03/n11/n03xxmn03xxmd0Un02/n04xxmn06/n03xxmn07/xxQn09xxQ/n05xxMn05/n06D0xn04/n11/n06S0xn04/n03E0xA0xn02Y0xn03" },
  { id: "mystic", label: "Mystic 101", description: "1. Attack with Mystic.\n2. Carry dropped mana into the pool with Drainer.", fen: "4 0 w 0 0 0 0 0 17 n01xxmn01y0xn03e0xn03/xxmn01xxmn02a0xn05/n05xxmn03E0xn01/n07S0xn03/n07xxmn03/xxQn02s0xn06xxQ/n11/n01D0xn06xxMn02/d0Mn03Y0xn02xxMn03/n05A0xn05/n11" },
  { id: "items", label: "Items 101", description: "1. Pick up a bomb or a potion to free up the pool.\n2. Move mana into the pool.", fen: "4 0 w 0 0 0 0 0 13 s0xn02y0xn02a0xe0xn02D0x/n03S0xn07/n01xxmn01d0mn07/n06xxmn04/n05xxmn05/xxQn10/n05xxMn01xxMn03/n02xxMn08/n03xxMn07/n09xxMn01/n03E0xA0xn02Y0xn02xxQ" },
  { id: "bomb", label: "Bomb 101", description: "1. Pick up a bomb.\n2. Attack Drainer with a bomb.\n3. Move dropped mana into the pool.", fen: "4 0 w 0 0 0 0 0 21 n08D0xs0xn01/n01d0Mn05y0xa0xe0xn01/n11/n04xxmn06/n03xxmn01xxmn01xxmn03/xxQn09xxQ/n03xxMA0xxxMn05/n04xxMn01xxMn03Y0x/n11/n11/n03E0xn02S0xn04" },
  { id: "potion", label: "Potion 101", description: "1. Pick up a potion for an extra action.\n2. Use Spirit action twice to move the mana.\n3. Move mana into the pool.", fen: "4 0 w 0 0 0 0 0 7 n05d0xn01e0xn02D0x/n04s0xn02a0xn03/n11/n04xxmn01xxmn04/n01y0xn01xxmn01xxmn05/xxQn09xxQ/n03xxMn01xxMn05/n04xxMn03xxMn02/n07xxMn03/n07S0xn03/n03E0xA0xn02Y0xn03" },
  { id: "angel", label: "Angel 101", description: "1. Attack protecting Angel.\n2. Free up the pool.\n3. Move mana into the pool.", fen: "4 0 w 0 0 0 1 0 15 D0xn02y0xs0xd0xn05/n11/n06xxmxxmxxmn02/n11/n05xxmn05/S0xn09xxQ/n04xxMxxMn05/n05xxMxxMn04/n11/n08Y0xxxMa0x/n03E0xA0xn05e0x" },
  { id: "supermana", label: "Supermana 101", description: "Bring supermana into the pool to score 2 points.", fen: "3 0 w 0 0 0 0 0 11 y0xn05a0xn03e0x/n05s0xn02xxmn01d0m/n11/n02xxmn01xxmn01xxmn04/n11/xxQn04xxUn04xxQ/n05xxMD0xn04/n03xxMn07/n11/n06S0xn04/n03E0xA0xn02Y0xn03" },
  { id: "manab", label: "Mana 102", description: "Bring opponent's mana into the pool to score 2 points.", fen: "3 0 w 0 0 0 0 0 23 n06a0xn04/n02y0xn01s0xn02e0xxxmn02/n01xxmn01xxmn01d0xn05/n02xxmn08/n11/xxQn09xxQ/n03xxMn01xxMn05/n06xxMn02xxmn01/n08D0Mn02/n11/n03E0xA0xn01S1xY0xn03" },
];

export function getNextProblem(id: string): Problem | null {
  const currentIndex = problems.findIndex(problem => problem.id === id);
  if (currentIndex === -1 || currentIndex === problems.length - 1) {
    return null;
  }
  return problems[currentIndex + 1];
}
