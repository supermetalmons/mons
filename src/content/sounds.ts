import { Sound } from "../utils/gameModels";
import { getIsMuted } from "../index";
import { Reaction } from "../connection/connectionModels";
import { soundPlayer } from "../utils/SoundPlayer";

export function directlyPlaySoundNamed(name: string, volumeMultiplier: number = 1) {
  if (getIsMuted()) {
    return;
  }
  soundPlayer.playSound("https://assets.mons.link/sounds/" + name + ".mp3", volumeMultiplier);
}

function playSound(path: string, volumeMultiplier: number = 1) {
  soundPlayer.playSound("https://assets.mons.link/" + path, volumeMultiplier);
}

type ResolvedSound = {
  name: string;
  volumeMultiplier: number;
};

const soundVolumeMultipliers: Partial<Record<Sound, number>> = {
  [Sound.Timer]: 0.6,
  [Sound.Chip]: 0.8,
};

function resolveSoundName(sound: Sound): ResolvedSound | null {
  const volumeMultiplier = soundVolumeMultipliers[sound] ?? 1;
  switch (sound) {
    case Sound.Bomb:
      return { name: "bomb", volumeMultiplier };
    case Sound.Click:
      return { name: "click", volumeMultiplier };
    case Sound.DemonAbility:
      return { name: "demonAbility", volumeMultiplier };
    case Sound.ManaPickUp:
      return { name: "manaPickUp", volumeMultiplier };
    case Sound.Move:
      return { name: "move", volumeMultiplier };
    case Sound.EndTurn:
      return { name: "endTurn", volumeMultiplier };
    case Sound.MysticAbility:
      return { name: "mysticAbility", volumeMultiplier };
    case Sound.PickupPotion:
      return { name: "pickupPotion", volumeMultiplier };
    case Sound.PickupBomb:
      return { name: "pickupBomb", volumeMultiplier };
    case Sound.ChoosePickup:
      return { name: "choosePickup", volumeMultiplier };
    case Sound.ScoreMana:
      return { name: "scoreMana", volumeMultiplier };
    case Sound.ScoreSupermana:
      return { name: "scoreSuperMana", volumeMultiplier };
    case Sound.SpiritAbility:
      return { name: "spiritAbility", volumeMultiplier };
    case Sound.Victory:
      return { name: "victory", volumeMultiplier };
    case Sound.Defeat:
      return { name: ["defeat", "defeat1", "defeat2"][Math.floor(Math.random() * 3)], volumeMultiplier };
    case Sound.DidConnect:
      return { name: "didConnect", volumeMultiplier };
    case Sound.Undo:
      return { name: "undo", volumeMultiplier };
    case Sound.EmoteSent:
      return { name: "emotePop8", volumeMultiplier };
    case Sound.EmoteReceived:
      return { name: "emotePop5", volumeMultiplier };
    case Sound.PickaxeHit:
      return { name: "pickaxeHit", volumeMultiplier };
    case Sound.PickaxeMiss:
      return { name: "pickaxeMiss", volumeMultiplier };
    case Sound.RockOpen:
      return { name: "rockOpen", volumeMultiplier };
    case Sound.UsePotion:
      return { name: "popSharp", volumeMultiplier };
    case Sound.ConfirmEarlyEndTurn:
      return { name: "thud", volumeMultiplier };
    case Sound.IslandShowUp:
      return { name: "open", volumeMultiplier };
    case Sound.WalkToRock:
      return { name: "thud", volumeMultiplier };
    case Sound.CollectingMaterials:
      return { name: "gather", volumeMultiplier };
    case Sound.Timer:
      return { name: "timer", volumeMultiplier };
    case Sound.Chip:
      return { name: "chip", volumeMultiplier };
    case Sound.HappyMon:
      return { name: "happy", volumeMultiplier };
    case Sound.SadMon:
      return { name: "sad", volumeMultiplier };
    case Sound.DownChip:
      return { name: "down chip", volumeMultiplier };
    default:
      return null;
  }
}

export async function playReaction(reaction: Reaction) {
  if (getIsMuted()) {
    return;
  }

  const path = `reactions/${reaction.kind}${reaction.variation}.mp3`;
  playSound(path);
}

export function newStickerReaction(id: number): Reaction {
  const uuid = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0,
      v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
  let variation = id;
  let kind = "sticker";
  return { uuid, variation, kind };
}

export function newReactionOfKind(kind: string): Reaction {
  const uuid = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0,
      v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
  let variation = 1;
  switch (kind) {
    case "yo":
      variation = Math.floor(Math.random() * 4) + 1;
      break;
    case "gg":
      variation = Math.floor(Math.random() * 2) + 1;
      break;
    case "wahoo":
    case "drop":
    case "slurp":
      variation = 1;
      break;
  }
  return { uuid, variation, kind };
}

export async function playSounds(sounds: Sound[]) {
  if (getIsMuted()) {
    return;
  }

  const maxSoundPriority = Math.max(...sounds.map((sound) => getSoundPriority(sound)));
  sounds = sounds.filter((sound) => getSoundPriority(sound) === maxSoundPriority || sound === Sound.EndTurn);

  for (const sound of sounds) {
    const resolved = resolveSoundName(sound);
    if (!resolved) continue;
    const path = `sounds/${resolved.name}.mp3`;
    playSound(path, resolved.volumeMultiplier);
  }
}

export async function preloadSounds(sounds: Sound[]) {
  if (getIsMuted()) {
    return;
  }
  const uniqueUrls: string[] = [];
  const seen = new Set<string>();
  for (const sound of sounds) {
    const resolved = resolveSoundName(sound);
    if (!resolved) continue;
    const url = `https://assets.mons.link/sounds/${resolved.name}.mp3`;
    if (seen.has(url)) continue;
    seen.add(url);
    uniqueUrls.push(url);
  }
  await Promise.all(uniqueUrls.map((url) => soundPlayer.preloadSound(url).catch(() => {})));
}

export enum RockSound {
  P1 = "p1",
  P2 = "p2",
  P3 = "p3",
  P4 = "p4",
  P5 = "p5",
  P6 = "p6",
  P7 = "p7",
  S1A = "s1a",
  S1B = "s1b",
  S1C = "s1c",
  S2A = "s2a",
  S2B = "s2b",
  S3 = "s3",
  S4A = "s4a",
  S4B = "s4b",
  S4C = "s4c",
  S5A = "s5a",
  S5B = "s5b",
  S5C = "s5c",
  S6A = "s6a",
  S6B = "s6b",
  S6C = "s6c",
  S7A = "s7a",
  S7B = "s7b",
  S7C = "s7c",
  S8A = "s8a",
  S8B = "s8b",
  S8C = "s8c",
  S9A = "s9a",
  S9B = "s9b",
  S9C = "s9c",
  S9D = "s9d",
  S10A = "s10a",
  S10B = "s10b",
  S10C = "s10c",
  S10D = "s10d",
  S11A = "s11a",
  S11B = "s11b",
  S11C = "s11c",
  S11D = "s11d",
}

export function playRockSound(name: RockSound) {
  if (getIsMuted()) {
    return;
  }
  const path = `sounds/rocks/${name}.mp3`;
  playSound(path);
}

const getSoundPriority = (sound: Sound) => {
  switch (sound) {
    case Sound.Click:
    case Sound.EndTurn:
    case Sound.Move:
    case Sound.DidConnect:
    case Sound.EmoteSent:
    case Sound.EmoteReceived:
    case Sound.PickaxeHit:
    case Sound.PickaxeMiss:
    case Sound.RockOpen:
    case Sound.ConfirmEarlyEndTurn:
    case Sound.IslandShowUp:
    case Sound.WalkToRock:
    case Sound.CollectingMaterials:
    case Sound.Timer:
    case Sound.Chip:
    case Sound.HappyMon:
    case Sound.SadMon:
    case Sound.DownChip:
      return 0;
    case Sound.ManaPickUp:
    case Sound.ChoosePickup:
    case Sound.MysticAbility:
    case Sound.SpiritAbility:
    case Sound.DemonAbility:
    case Sound.Bomb:
    case Sound.PickupBomb:
    case Sound.PickupPotion:
    case Sound.UsePotion:
      return 1;
    case Sound.ScoreMana:
    case Sound.ScoreSupermana:
    case Sound.Victory:
    case Sound.Defeat:
    case Sound.Undo:
      return 2;
  }
};
