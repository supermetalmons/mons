export class Location {
  i: number;
  j: number;

  constructor(i: number, j: number) {
    this.i = i;
    this.j = j;
  }

  toString(): string {
    return `${this.i}-${this.j}`;
  }

  equals(other: Location): boolean {
    return this.i === other.i && this.j === other.j;
  }
}

export class Highlight {
  location: Location;
  kind: HighlightKind;
  color: string;

  constructor(location: Location, kind: HighlightKind, color: string) {
    this.location = location;
    this.kind = kind;
    this.color = color;
  }
}

export enum HighlightKind {
  Selected,
  EmptySquare,
  TargetSuggestion,
  StartFromSuggestion,
}

export enum AssistedInputKind {
  KeepSelectionAfterMove,
  FindStartLocationsAfterInvalidInput,
  ReselectLastInvalidInput,
  None,
}

export enum Sound {
  Bomb,
  Click,
  DemonAbility,
  ManaPickUp,
  Move,
  EndTurn,
  MysticAbility,
  PickupPotion,
  PickupBomb,
  ChoosePickup,
  ScoreMana,
  ScoreSupermana,
  SpiritAbility,
  Victory,
  Defeat,
  DidConnect,
  Undo,
  EmoteReceived,
  EmoteSent,
  PickaxeHit,
  PickaxeMiss,
  RockOpen,
  UsePotion,
  ConfirmEarlyEndTurn,
  IslandShowUp,
  WalkToRock,
  CollectingMaterials,
  Timer,
  IslandClosing,
  MaterialButtonClick,
}

export enum InputModifier {
  None,
  Bomb,
  Potion,
  Cancel,
}

export class Trace {
  from: Location;
  to: Location;

  constructor(from: Location, to: Location) {
    this.from = from;
    this.to = to;
  }
}

export enum ItemKind {
  Mana,
  ManaBlack,
  Supermana,
  Demon,
  DemonBlack,
  Drainer,
  DrainerBlack,
  Angel,
  AngelBlack,
  Spirit,
  SpiritBlack,
  Mystic,
  MysticBlack,
  Consumable,
}
