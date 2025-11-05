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

function resolveSoundName(sound: Sound): ResolvedSound | null {
  let volumeMultiplier = 1;
  let name: string | null = null;

  switch (sound) {
    case Sound.Bomb:
      name = "bomb";
      break;
    case Sound.Click:
      name = "click";
      break;
    case Sound.DemonAbility:
      name = "demonAbility";
      break;
    case Sound.ManaPickUp:
      name = "manaPickUp";
      break;
    case Sound.Move:
      name = "move";
      break;
    case Sound.EndTurn:
      name = "endTurn";
      break;
    case Sound.MysticAbility:
      name = "mysticAbility";
      break;
    case Sound.PickupPotion:
      name = "pickupPotion";
      break;
    case Sound.PickupBomb:
      name = "pickupBomb";
      break;
    case Sound.ChoosePickup:
      name = "choosePickup";
      break;
    case Sound.ScoreMana:
      name = "scoreMana";
      break;
    case Sound.ScoreSupermana:
      name = "scoreSuperMana";
      break;
    case Sound.SpiritAbility:
      name = "spiritAbility";
      break;
    case Sound.Victory:
      name = "victory";
      break;
    case Sound.Defeat:
      name = ["defeat", "defeat1", "defeat2"][Math.floor(Math.random() * 3)];
      break;
    case Sound.DidConnect:
      name = "didConnect";
      break;
    case Sound.Undo:
      name = "undo";
      break;
    case Sound.EmoteSent:
      name = "emotePop8";
      break;
    case Sound.EmoteReceived:
      name = "emotePop5";
      break;
    case Sound.PickaxeHit:
      name = "pickaxeHit";
      volumeMultiplier = 0.85;
      break;
    case Sound.PickaxeMiss:
      name = "pickaxeMiss";
      volumeMultiplier = 0.85;
      break;
    case Sound.RockOpen:
      name = "rockOpen";
      volumeMultiplier = 0.95;
      break;
    case Sound.UsePotion:
      name = "popSharp";
      break;
    case Sound.ConfirmEarlyEndTurn:
      name = "thud";
      break;
    case Sound.IslandShowUp:
      // name = "rocks/s1a";
      // volumeMultiplier = 0.23;
      break;
    case Sound.WalkToRock:
      name = "cute click 2";
      volumeMultiplier = 0.05;
      break;
    case Sound.CollectingMaterials:
      name = "rocks/p3";
      volumeMultiplier = 0.13;
      break;
    case Sound.Timer:
      name = "timer";
      volumeMultiplier = 0.6;
      break;
    case Sound.Chip:
      name = "chip";
      volumeMultiplier = 0.8;
      break;
    case Sound.HappyMon:
      name = "happy";
      break;
    case Sound.WalkToMon:
      name = "chip";
      volumeMultiplier = 0.05;
      break;
    case Sound.PetMon:
      name = "pet";
      volumeMultiplier = 0.042;
      break;
    case Sound.SadMon:
      name = "sad";
      break;
    case Sound.DownChip:
      name = "down chip";
      break;
  }

  if (!name) {
    return null;
  }

  return { name, volumeMultiplier };
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
  playSound(path, 0.23);
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
    case Sound.WalkToMon:
    case Sound.PetMon:
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
