type IslandOverlayState = {
  visible: boolean;
  opening: boolean;
  closing: boolean;
};

let state: IslandOverlayState = {
  visible: false,
  opening: false,
  closing: false,
};

export function setIslandOverlayState(next: IslandOverlayState) {
  state = next;
}

export function resetIslandOverlayState() {
  state = {
    visible: false,
    opening: false,
    closing: false,
  };
}

export function hasIslandOverlayVisible() {
  return state.visible || state.opening || state.closing;
}

