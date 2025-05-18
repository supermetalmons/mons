export const STICKER_PATHS = {
  "type-logo": ["spirit", "mystic", "drainer", "demon", "angel"],
  "mini-logo": ["super-mana", "potion", "mana", "bomb"],
  "middle-right": ["swag-coin", "metal-mana-pog", "glitter-rock"],
  "middle-left": ["super-mana-piece", "super-mana-piece-2"],
  mana: ["metal-mana", "blue-mana"],
  "bottom-right": ["star", "cursor"],
  "bottom-left": ["rock", "heart"],
  "big-mon-top-right": ["zemred", "speklmic", "omom", "omom-2", "omom-3", "omom-4", "omen-statue", "melmut", "lord-idgecreist", "king-snowbie", "hatchat", "gummy-deino", "gerp", "estalibur", "crystal-owg", "crystal-gummy-deino", "crystal-cloud-gabber", "armored-gummoskullj", "applecreme", "super-mana-piece-3"],
};

export function getRandomStickers(): string {
  const selectedStickers: Record<string, string> = {};

  for (const [path, options] of Object.entries(STICKER_PATHS)) {
    const randomSticker = options[Math.floor(Math.random() * options.length)];
    selectedStickers[path] = randomSticker;
  }

  return JSON.stringify(selectedStickers);
}
