import {
  MATERIAL_KEYS,
  cloneMaterials as cloneSharedMaterials,
  createDropsForMiningEvent,
  createDropsFromRandom,
  createEmptyMaterials as createSharedEmptyMaterials,
  formatMiningDateLocal,
  normalizeMaterials as normalizeSharedMaterials,
  normalizeMiningSnapshot as normalizeSharedMiningSnapshot,
} from "@mons/shared/mining";
import { computeHash32 } from "@mons/shared/ids";
import { connection } from "../connection/connection";
import {
  MiningMaterialName,
  PlayerMiningData,
  PlayerMiningMaterials,
} from "../connection/connectionModels";
import { storage } from "../utils/storage";

const ROCK_VARIANT_COUNT = 27;

const DROP_TESTING_MODE = false;

const getActiveProfileId = (): string => {
  return storage.getProfileId("");
};

const isAnonymousProfile = (profileId: string): boolean => {
  return profileId === "";
};

type MiningListener = (snapshot: PlayerMiningData) => void;

type DidBreakRockResult = {
  drops: MiningMaterialName[];
  delta: PlayerMiningMaterials;
  date: string;
};

export type MaterialName = MiningMaterialName;

export const MATERIALS = MATERIAL_KEYS;

const createEmptyMaterials = (): PlayerMiningMaterials =>
  createSharedEmptyMaterials();

const cloneMaterials = (source: PlayerMiningMaterials): PlayerMiningMaterials =>
  cloneSharedMaterials(source);

const normalizeMaterials = (
  source?: Partial<PlayerMiningMaterials> | null,
): PlayerMiningMaterials => normalizeSharedMaterials(source);

const normalizeSnapshot = (
  source?: PlayerMiningData | null,
): PlayerMiningData => normalizeSharedMiningSnapshot(source);

const formatMiningDate = formatMiningDateLocal;

const loadInitialSnapshot = (profileId: string): PlayerMiningData => {
  const materials = isAnonymousProfile(profileId)
    ? createEmptyMaterials()
    : normalizeMaterials(storage.getMiningMaterials(createEmptyMaterials()));
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

const setSnapshot = (
  next: PlayerMiningData,
  persist: boolean,
  notifyListeners: boolean = true,
) => {
  const profileId = getActiveProfileId();
  const isAnon = isAnonymousProfile(profileId);
  const materials = isAnon
    ? createEmptyMaterials()
    : cloneMaterials(next.materials);
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

const createDrops = (
  profileId: string,
  date: string,
  currentSnapshot: PlayerMiningData,
): { drops: MiningMaterialName[]; delta: PlayerMiningMaterials } =>
  createDropsForMiningEvent(profileId, date, currentSnapshot);

const createTestingDrops = (): {
  drops: MiningMaterialName[];
  delta: PlayerMiningMaterials;
} => createDropsFromRandom(Math.random);

type MiningSubscription = () => void;

export const rocksMiningService = {
  MATERIALS,
  getSnapshot,
  subscribe,
  setFromServer,
  didBreakRock,
  formatMiningDate,
  shouldShowRock,
  getRockImageUrl,
  resetProfileMiningState,
};

function getSnapshot(): PlayerMiningData {
  const profileId = getActiveProfileId();
  const isAnon = isAnonymousProfile(profileId);
  return {
    lastRockDate: snapshot.lastRockDate,
    materials: isAnon
      ? createEmptyMaterials()
      : cloneMaterials(snapshot.materials),
  };
}

function subscribe(listener: MiningListener): MiningSubscription {
  listeners.add(listener);
  listener(getSnapshot());
  return () => {
    listeners.delete(listener);
  };
}

function setFromServer(
  data?: PlayerMiningData | null,
  options?: { persist?: boolean; notify?: boolean },
): void {
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
    : createDrops(profileId, date, snapshot);
  const { drops, delta } = dropsData;
  const baseMaterials = isAnon
    ? createEmptyMaterials()
    : cloneMaterials(snapshot.materials);
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
    const profileIdAtRequest = profileId;
    const sessionGuard = connection.createSessionGuard();
    connection
      .mineRock(payload.date, payload.materials)
      .then((response) => {
        if (!sessionGuard() || getActiveProfileId() !== profileIdAtRequest) {
          return;
        }
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
  return `https://cdn.lil.org/mons/rocks/gan/${index}.webp`;
}

export function resetProfileMiningState() {
  const profileId = getActiveProfileId();
  const initial = loadInitialSnapshot(profileId);
  snapshot = {
    lastRockDate: initial.lastRockDate,
    materials: cloneMaterials(initial.materials),
  };
  serverSnapshotLoaded = isAnonymousProfile(profileId);
  notify();
}
