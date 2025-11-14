import { connection } from "../connection/connection";
import { MINING_MATERIAL_NAMES, MiningMaterialName, PlayerMiningData, PlayerMiningMaterials } from "../connection/connectionModels";
import { storage } from "../utils/storage";

const ROCK_VARIANT_COUNT = 27;

export const DROP_TESTING_MODE = false;

const getActiveProfileId = (): string => {
  return storage.getProfileId("");
};

const isAnonymousProfile = (profileId: string): boolean => {
  return profileId === "";
};

const computeHash32 = (value: string): number => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
};

const createSeededRandom = (profileId: string, date: string): (() => number) => {
  const source = profileId ? `${profileId}:${date}` : date;
  let state = computeHash32(source) || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

type MiningListener = (snapshot: PlayerMiningData) => void;

export type DidBreakRockResult = {
  drops: MiningMaterialName[];
  delta: PlayerMiningMaterials;
  date: string;
};

export type MaterialName = MiningMaterialName;
export type MiningMaterials = PlayerMiningMaterials;
export type MiningSnapshot = PlayerMiningData;

export const MATERIALS = MINING_MATERIAL_NAMES;

const createEmptyMaterials = (): PlayerMiningMaterials => ({
  dust: 0,
  slime: 0,
  gum: 0,
  metal: 0,
  ice: 0,
});

const cloneMaterials = (source: PlayerMiningMaterials): PlayerMiningMaterials => {
  const result = createEmptyMaterials();
  MATERIALS.forEach((name) => {
    result[name] = source[name];
  });
  return result;
};

const normalizeMaterials = (source?: Partial<PlayerMiningMaterials> | null): PlayerMiningMaterials => {
  const base = createEmptyMaterials();
  MATERIALS.forEach((name) => {
    const raw = source ? (source as Record<string, unknown>)[name] : undefined;
    const numeric = typeof raw === "number" ? raw : Number(raw);
    const value = Number.isFinite(numeric) ? Math.max(0, Math.round(numeric as number)) : 0;
    base[name] = value;
  });
  return base;
};

const normalizeSnapshot = (source?: PlayerMiningData | null): PlayerMiningData => {
  if (!source) {
    return {
      lastRockDate: null,
      materials: createEmptyMaterials(),
    };
  }
  return {
    lastRockDate: typeof source.lastRockDate === "string" ? source.lastRockDate : null,
    materials: normalizeMaterials(source.materials),
  };
};

const formatMiningDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const loadInitialSnapshot = (profileId: string): PlayerMiningData => {
  const materials = isAnonymousProfile(profileId) ? createEmptyMaterials() : normalizeMaterials(storage.getMiningMaterials(createEmptyMaterials()));
  const lastRockDateRaw = storage.getMiningLastRockDate(null);
  return {
    lastRockDate: typeof lastRockDateRaw === "string" ? lastRockDateRaw : null,
    materials,
  };
};

const initialProfileId = getActiveProfileId();
const initialSnapshot = loadInitialSnapshot(initialProfileId);

let snapshot: PlayerMiningData = {
  lastRockDate: initialSnapshot.lastRockDate,
  materials: cloneMaterials(initialSnapshot.materials),
};

let serverSnapshotLoaded = isAnonymousProfile(initialProfileId);

const listeners = new Set<MiningListener>();

const notify = () => {
  const current = getSnapshot();
  listeners.forEach((listener) => listener(current));
};

const setSnapshot = (next: PlayerMiningData, persist: boolean, notifyListeners: boolean = true) => {
  const profileId = getActiveProfileId();
  const isAnon = isAnonymousProfile(profileId);
  const materials = isAnon ? createEmptyMaterials() : cloneMaterials(next.materials);
  snapshot = {
    lastRockDate: next.lastRockDate,
    materials,
  };
  if (isAnon) {
    serverSnapshotLoaded = true;
  }
  if (!DROP_TESTING_MODE && persist) {
    storage.setMiningLastRockDate(snapshot.lastRockDate);
    storage.setMiningMaterials(materials);
  }
  if (notifyListeners) {
    notify();
  }
};

const pickWeightedMaterial = (random: () => number): MiningMaterialName => {
  const r = random() * 100;
  if (r < 30) return "dust";
  if (r < 55) return "slime";
  if (r < 75) return "gum";
  if (r < 90) return "metal";
  return "ice";
};

const createDropsFromRandom = (random: () => number): { drops: MiningMaterialName[]; delta: PlayerMiningMaterials } => {
  const count = 2 + Math.floor(random() * 4);
  const drops: MiningMaterialName[] = [];
  const delta = createEmptyMaterials();
  for (let i = 0; i < count; i += 1) {
    const material = pickWeightedMaterial(random);
    drops.push(material);
    delta[material] += 1;
  }
  return { drops, delta };
};

const createDrops = (profileId: string, date: string): { drops: MiningMaterialName[]; delta: PlayerMiningMaterials } => {
  return createDropsFromRandom(createSeededRandom(profileId, date));
};

const createTestingDrops = (): { drops: MiningMaterialName[]; delta: PlayerMiningMaterials } => {
  return createDropsFromRandom(Math.random);
};

export type MiningSubscription = () => void;

export const rocksMiningService = {
  MATERIALS,
  getSnapshot,
  subscribe,
  setFromServer,
  didBreakRock,
  formatMiningDate,
  shouldShowRock,
  getRockImageUrl,
};

function getSnapshot(): PlayerMiningData {
  const profileId = getActiveProfileId();
  const isAnon = isAnonymousProfile(profileId);
  return {
    lastRockDate: snapshot.lastRockDate,
    materials: isAnon ? createEmptyMaterials() : cloneMaterials(snapshot.materials),
  };
}

function subscribe(listener: MiningListener): MiningSubscription {
  listeners.add(listener);
  listener(getSnapshot());
  return () => {
    listeners.delete(listener);
  };
}

function setFromServer(data?: PlayerMiningData | null, options?: { persist?: boolean; notify?: boolean }): void {
  const normalized = normalizeSnapshot(data);
  serverSnapshotLoaded = true;
  const shouldNotify = options?.notify !== false;
  setSnapshot(normalized, options?.persist !== false, shouldNotify);
}

function didBreakRock(): DidBreakRockResult {
  const date = formatMiningDate(new Date());
  if (DROP_TESTING_MODE) {
    const { drops, delta } = createTestingDrops();
    return { drops, delta, date };
  }
  const profileId = getActiveProfileId();
  const isAnon = isAnonymousProfile(profileId);
  const dropsData = isAnon
    ? {
        drops: [] as MiningMaterialName[],
        delta: createEmptyMaterials(),
      }
    : createDrops(profileId, date);
  const { drops, delta } = dropsData;
  const baseMaterials = isAnon ? createEmptyMaterials() : cloneMaterials(snapshot.materials);
  const nextSnapshot: PlayerMiningData = {
    lastRockDate: date,
    materials: baseMaterials,
  };
  setSnapshot(nextSnapshot, true, true);
  const payload = {
    date,
    materials: cloneMaterials(delta),
  };
  if (!isAnon) {
    connection
      .mineRock(payload.date, payload.materials)
      .then((response) => {
        if (response && response.ok && response.mining) {
          setSnapshot(normalizeSnapshot(response.mining), true, false);
        }
      })
      .catch(() => {});
  }
  return { drops, delta, date };
}

function shouldShowRock(dateOverride?: string): boolean {
  if (DROP_TESTING_MODE) {
    return true;
  }
  const profileId = getActiveProfileId();
  if (!isAnonymousProfile(profileId) && !serverSnapshotLoaded) {
    return false;
  }
  const today = dateOverride ?? formatMiningDate(new Date());
  const last = snapshot.lastRockDate;
  if (!last) return true;
  return today > last;
}

function getRockImageUrl(dateOverride?: string): string {
  const today = dateOverride ?? formatMiningDate(new Date());
  const profileId = getActiveProfileId();
  const seed = profileId ? `${profileId}:${today}` : today;
  const hash = computeHash32(seed);
  const index = (hash % ROCK_VARIANT_COUNT) + 1;
  return `https://assets.mons.link/rocks/gan/${index}.webp`;
}
