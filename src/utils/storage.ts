import { AssetsSet } from "../content/boardStyles";

const STORAGE_KEYS = {
  IS_MUTED: "isMuted",

  PREFERRED_ASSETS_SET: "preferredAssetsSet",
  BOARD_COLOR_SET: "boardColorSet",
  IS_EXPERIMENTING_WITH_SPRITES: "isExperimentingWithSprites",

  PLAYER_EMOJI_ID: "playerEmojiId",
  LOGIN_ID: "loginId",
  PROFILE_ID: "profileId",
  ETH_ADDRESS: "ethAddress",
  SOL_ADDRESS: "solAddress",
  USERNAME: "username",
} as const;

type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

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
  localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
}

export const storage = {
  getIsMuted: (defaultValue: boolean): boolean => {
    return getItem(STORAGE_KEYS.IS_MUTED, defaultValue);
  },

  setIsMuted: (value: boolean): void => {
    setItem(STORAGE_KEYS.IS_MUTED, value);
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

  getProfileId: (defaultValue: string): string => {
    return getItem(STORAGE_KEYS.PROFILE_ID, defaultValue);
  },

  setProfileId: (value: string): void => {
    setItem(STORAGE_KEYS.PROFILE_ID, value);
  },

  getLoginId: (defaultValue: string): string => {
    return getItem(STORAGE_KEYS.LOGIN_ID, defaultValue);
  },

  setLoginId: (value: string): void => {
    setItem(STORAGE_KEYS.LOGIN_ID, value);
  },

  getEthAddress: (defaultValue: string): string => {
    return getItem(STORAGE_KEYS.ETH_ADDRESS, defaultValue);
  },

  setEthAddress: (value: string): void => {
    setItem(STORAGE_KEYS.ETH_ADDRESS, value);
  },

  getSolAddress: (defaultValue: string): string => {
    return getItem(STORAGE_KEYS.SOL_ADDRESS, defaultValue);
  },

  setSolAddress: (value: string): void => {
    setItem(STORAGE_KEYS.SOL_ADDRESS, value);
  },

  getUsername: (defaultValue: string): string => {
    return getItem(STORAGE_KEYS.USERNAME, defaultValue);
  },

  setUsername: (value: string): void => {
    setItem(STORAGE_KEYS.USERNAME, value);
  },

  signOut: (): void => {
    localStorage.removeItem(STORAGE_KEYS.PLAYER_EMOJI_ID);
    localStorage.removeItem(STORAGE_KEYS.LOGIN_ID);
    localStorage.removeItem(STORAGE_KEYS.PROFILE_ID);
    localStorage.removeItem(STORAGE_KEYS.ETH_ADDRESS);
    localStorage.removeItem(STORAGE_KEYS.SOL_ADDRESS);
    localStorage.removeItem(STORAGE_KEYS.USERNAME);
  },
};
