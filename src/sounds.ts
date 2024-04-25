import { Sound } from "./models";

export function playSounds(sounds: Sound[]) {
  const maxSoundPriority = Math.max(...sounds.map((sound) => getSoundPriority(sound)));
  sounds = sounds.filter((sound) => getSoundPriority(sound) === maxSoundPriority || sound === Sound.EndTurn);

  for (const sound of sounds) {
    let name: string;
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
        name = "scoreSupermana";
        break;
      case Sound.SpiritAbility:
        name = "spiritAbility";
        break;
      case Sound.Victory:
        name = "victory";
        break;
      case Sound.Defeat:
        name = "defeat";
        break;
      case Sound.DidConnect:
        name = "didConnect";
        break;
    }
    const audio = new Audio(`./assets/sounds/${name}.wav`);
    audio.play();
  }
}

const getSoundPriority = (sound: Sound) => {
  switch (sound) {
    case Sound.Click:
    case Sound.EndTurn:
    case Sound.Move:
    case Sound.DidConnect:
      return 0;
    case Sound.ManaPickUp:
    case Sound.ChoosePickup:
    case Sound.MysticAbility:
    case Sound.SpiritAbility:
    case Sound.DemonAbility:
    case Sound.Bomb:
    case Sound.PickupBomb:
    case Sound.PickupPotion:
      return 1;
    case Sound.ScoreMana:
    case Sound.ScoreSupermana:
    case Sound.Victory:
    case Sound.Defeat:
      return 2;
  }
};
