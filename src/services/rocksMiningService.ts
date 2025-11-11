import { connection } from "../connection/connection";
import { MINING_MATERIAL_NAMES, MiningMaterialName, PlayerMiningData, PlayerMiningMaterials } from "../connection/connectionModels";
import { storage } from "../utils/storage";

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
  return date.toISOString().slice(0, 10);
};

const loadInitialSnapshot = (): PlayerMiningData => {
  const materials = normalizeMaterials(storage.getMiningMaterials(createEmptyMaterials()));
  const lastRockDateRaw = storage.getMiningLastRockDate(null);
  return {
    lastRockDate: typeof lastRockDateRaw === "string" ? lastRockDateRaw : null,
    materials,
  };
};

const initialSnapshot = loadInitialSnapshot();

let snapshot: PlayerMiningData = {
  lastRockDate: initialSnapshot.lastRockDate,
  materials: cloneMaterials(initialSnapshot.materials),
};

const listeners = new Set<MiningListener>();

const notify = () => {
  const current = getSnapshot();
  listeners.forEach((listener) => listener(current));
};

const setSnapshot = (next: PlayerMiningData, persist: boolean, notifyListeners: boolean = true) => {
  snapshot = {
    lastRockDate: next.lastRockDate,
    materials: cloneMaterials(next.materials),
  };
  if (persist) {
    storage.setMiningLastRockDate(snapshot.lastRockDate);
    storage.setMiningMaterials(snapshot.materials);
  }
  if (notifyListeners) {
    notify();
  }
};

const pickWeightedMaterial = (): MiningMaterialName => {
  const r = Math.random() * 100;
  if (r < 30) return "dust";
  if (r < 55) return "slime";
  if (r < 75) return "gum";
  if (r < 90) return "metal";
  return "ice";
};

const createDrops = (): { drops: MiningMaterialName[]; delta: PlayerMiningMaterials } => {
  const count = 2 + Math.floor(Math.random() * 4);
  const drops: MiningMaterialName[] = [];
  const delta = createEmptyMaterials();
  for (let i = 0; i < count; i += 1) {
    const material = pickWeightedMaterial();
    drops.push(material);
    delta[material] += 1;
  }
  return { drops, delta };
};

export type MiningSubscription = () => void;

export const rocksMiningService = {
  MATERIALS,
  getSnapshot,
  subscribe,
  setFromServer,
  didBreakRock,
  formatMiningDate,
};

function getSnapshot(): PlayerMiningData {
  return {
    lastRockDate: snapshot.lastRockDate,
    materials: cloneMaterials(snapshot.materials),
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
  const shouldNotify = options?.notify !== false;
  setSnapshot(normalized, options?.persist !== false, shouldNotify);
}

function didBreakRock(): DidBreakRockResult {
  const { drops, delta } = createDrops();
  const date = formatMiningDate(new Date());
  const payload = {
    date,
    materials: cloneMaterials(delta),
  };
  connection
    .mineRock(payload.date, payload.materials)
    .then((response) => {
      if (response && response.ok && response.mining) {
        setSnapshot(normalizeSnapshot(response.mining), true, false);
      }
    })
    .catch(() => {});
  return { drops, delta, date };
}
