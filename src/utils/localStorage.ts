const STORAGE_KEYS = {
  IS_MUTED: 'isMuted',
} as const;

type StorageKey = typeof STORAGE_KEYS[keyof typeof STORAGE_KEYS];

function getItem<T>(key: StorageKey, defaultValue: T): T {
  const item = localStorage.getItem(key);
  if (item === null) return defaultValue;
  try {
    return JSON.parse(item) as T;
  } catch {
    return defaultValue;
  }
}

function setItem<T>(key: StorageKey, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export const storage = {
  getIsMuted: (defaultValue: boolean): boolean => {
    return getItem(STORAGE_KEYS.IS_MUTED, defaultValue);
  },
  
  setIsMuted: (value: boolean): void => {
    setItem(STORAGE_KEYS.IS_MUTED, value);
  }
}; 