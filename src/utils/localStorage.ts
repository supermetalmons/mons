const STORAGE_KEYS = {
  IS_MUTED: 'isMuted',
  ETH_ADDRESS: 'ethAddress_',
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
  }
}; 