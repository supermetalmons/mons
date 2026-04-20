import { storage } from "../utils/storage";

type BoardPatternSettingsListener = (
  useLightTileManaBaseShade: boolean,
) => void;

const listeners = new Set<BoardPatternSettingsListener>();

let useLightTileManaBaseShade = storage.getUseLightTileManaBaseShade(false);

const notifyListeners = () => {
  const snapshot = useLightTileManaBaseShade;
  listeners.forEach((listener) => listener(snapshot));
};

export const getUseLightTileManaBaseShade = () => useLightTileManaBaseShade;

export const setUseLightTileManaBaseShade = (enabled: boolean) => {
  if (useLightTileManaBaseShade === enabled) {
    return;
  }
  useLightTileManaBaseShade = enabled;
  storage.setUseLightTileManaBaseShade(enabled);
  notifyListeners();
};

export const subscribeToBoardPatternSettings = (
  listener: BoardPatternSettingsListener,
) => {
  listeners.add(listener);
  listener(useLightTileManaBaseShade);
  return () => {
    listeners.delete(listener);
  };
};
