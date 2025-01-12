import { AssetsSet } from "../content/boardStyles";

const STORAGE_KEYS = {
  IS_MUTED: 'isMuted',
  ETH_ADDRESS: 'ethAddress_',
  PREFERRED_ASSETS_SET: 'preferredAssetsSet',
  BOARD_COLOR_SET: 'boardColorSet',
  IS_EXPERIMENTING_WITH_SPRITES: 'isExperimentingWithSprites',
  PLAYER_EMOJI_ID: 'playerEmojiId',
} as const;

type StorageKey = typeof STORAGE_KEYS[keyof typeof STORAGE_KEYS];

function getItem<T>(key: StorageKey | string, defaultValue: T): T {
  const item = localStorage.getItem(key);
  if (item === null) return defaultValue;
  try {
    return JSON.parse(item) as T;
  } catch {
    return item as unknown as T;
  }
}

function setItem<T>(key: StorageKey | string, value: T): void {
  localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
}

export const storage = {
  getIsMuted: (defaultValue: boolean): boolean => {
    return getItem(STORAGE_KEYS.IS_MUTED, defaultValue);
  },
  
  setIsMuted: (value: boolean): void => {
    setItem(STORAGE_KEYS.IS_MUTED, value);
  },

  saveEthAddress: (uid: string, address: string): void => {
    setItem(`${STORAGE_KEYS.ETH_ADDRESS}${uid}`, address);
  },

  getStoredEthAddress: (uid: string): string | null => {
    return getItem(`${STORAGE_KEYS.ETH_ADDRESS}${uid}`, null);
  },

  getPreferredAssetsSet: (defaultValue: AssetsSet): AssetsSet => {
    return getItem(STORAGE_KEYS.PREFERRED_ASSETS_SET, defaultValue);
  },

  setPreferredAssetsSet: (value: AssetsSet): void => {
    setItem(STORAGE_KEYS.PREFERRED_ASSETS_SET, value);
  },

  getBoardColorSet: (defaultValue: string): string => {
    return getItem(STORAGE_KEYS.BOARD_COLOR_SET, defaultValue);
  },

  setBoardColorSet: (value: string): void => {
    setItem(STORAGE_KEYS.BOARD_COLOR_SET, value);
  },

  getIsExperimentingWithSprites: (defaultValue: boolean): boolean => {
    return getItem(STORAGE_KEYS.IS_EXPERIMENTING_WITH_SPRITES, defaultValue);
  },

  setIsExperimentingWithSprites: (value: boolean): void => {
    setItem(STORAGE_KEYS.IS_EXPERIMENTING_WITH_SPRITES, value);
  },

  getPlayerEmojiId: (defaultValue: string): string => {
    return getItem(STORAGE_KEYS.PLAYER_EMOJI_ID, defaultValue);
  },

  setPlayerEmojiId: (value: string): void => {
    setItem(STORAGE_KEYS.PLAYER_EMOJI_ID, value);
  },
}; 