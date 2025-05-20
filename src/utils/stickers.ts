export interface Sticker {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export const STICKER_PATHS: Record<string, Sticker[]> = {
  "type-logo": [
    { name: "spirit", x: 0, y: 0, w: 0, h: 0 },
    { name: "mystic", x: 0, y: 0, w: 0, h: 0 },
    { name: "drainer", x: 0, y: 0, w: 0, h: 0 },
    { name: "demon", x: 0, y: 0, w: 0, h: 0 },
    { name: "angel", x: 0, y: 0, w: 0, h: 0 },
  ],
  "mini-logo": [
    { name: "super-mana", x: 0, y: 0, w: 0, h: 0 },
    { name: "potion", x: 0, y: 0, w: 0, h: 0 },
    { name: "mana", x: 0, y: 0, w: 0, h: 0 },
    { name: "bomb", x: 0, y: 0, w: 0, h: 0 },
  ],
  "middle-right": [
    { name: "swag-coin", x: 0, y: 0, w: 0, h: 0 },
    { name: "metal-mana-pog", x: 0, y: 0, w: 0, h: 0 },
    { name: "glitter-rock", x: 0, y: 0, w: 0, h: 0 },
  ],
  "middle-left": [
    { name: "super-mana-piece", x: 0, y: 0, w: 0, h: 0 },
    { name: "super-mana-piece-2", x: 0, y: 0, w: 0, h: 0 },
  ],
  mana: [
    { name: "metal-mana", x: 0, y: 0, w: 0, h: 0 },
    { name: "blue-mana", x: 0, y: 0, w: 0, h: 0 },
  ],
  "bottom-right": [
    { name: "star", x: 0, y: 0, w: 0, h: 0 },
    { name: "cursor", x: 0, y: 0, w: 0, h: 0 },
  ],
  "bottom-left": [
    { name: "rock", x: 0, y: 0, w: 0, h: 0 },
    { name: "heart", x: 0, y: 0, w: 0, h: 0 },
  ],
  "big-mon-top-right": [
    { name: "zemred", x: 0, y: 0, w: 0, h: 0 },
    { name: "speklmic", x: 0, y: 0, w: 0, h: 0 },
    { name: "omom", x: 0, y: 0, w: 0, h: 0 },
    { name: "omom-2", x: 0, y: 0, w: 0, h: 0 },
    { name: "omom-3", x: 0, y: 0, w: 0, h: 0 },
    { name: "omom-4", x: 0, y: 0, w: 0, h: 0 },
    { name: "omen-statue", x: 0, y: 0, w: 0, h: 0 },
    { name: "melmut", x: 0, y: 0, w: 0, h: 0 },
    { name: "lord-idgecreist", x: 0, y: 0, w: 0, h: 0 },
    { name: "king-snowbie", x: 0, y: 0, w: 0, h: 0 },
    { name: "hatchat", x: 0, y: 0, w: 0, h: 0 },
    { name: "gummy-deino", x: 0, y: 0, w: 0, h: 0 },
    { name: "gerp", x: 0, y: 0, w: 0, h: 0 },
    { name: "estalibur", x: 0, y: 0, w: 0, h: 0 },
    { name: "crystal-owg", x: 0, y: 0, w: 0, h: 0 },
    { name: "crystal-gummy-deino", x: 0, y: 0, w: 0, h: 0 },
    { name: "crystal-cloud-gabber", x: 0, y: 0, w: 0, h: 0 },
    { name: "armored-gummoskullj", x: 0, y: 0, w: 0, h: 0 },
    { name: "applecreme", x: 0, y: 0, w: 0, h: 0 },
    { name: "super-mana-piece-3", x: 0, y: 0, w: 0, h: 0 },
  ],
};

export function getRandomStickers(): string {
  const selectedStickers: Record<string, string> = {};

  for (const [path, options] of Object.entries(STICKER_PATHS)) {
    const randomSticker = options[Math.floor(Math.random() * options.length)];
    selectedStickers[path] = randomSticker.name;
  }

  return JSON.stringify(selectedStickers);
}
