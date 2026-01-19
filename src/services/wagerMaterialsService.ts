import { MATERIALS, MaterialName } from "./rocksMiningService";

export type FrozenMaterials = Record<MaterialName, number>;

type FrozenListener = (materials: FrozenMaterials) => void;

const createEmptyMaterials = (): FrozenMaterials => {
  const result = {} as FrozenMaterials;
  MATERIALS.forEach((name) => {
    result[name] = 0;
  });
  return result;
};

const normalizeMaterials = (source?: Partial<Record<MaterialName, number>> | null): FrozenMaterials => {
  const result = createEmptyMaterials();
  MATERIALS.forEach((name) => {
    const raw = source ? (source as Record<string, unknown>)[name] : undefined;
    const numeric = typeof raw === "number" ? raw : Number(raw);
    result[name] = Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : 0;
  });
  return result;
};

let frozenMaterials = createEmptyMaterials();

const listeners = new Set<FrozenListener>();

const notify = () => {
  const snapshot = getFrozenMaterials();
  listeners.forEach((listener) => listener(snapshot));
};

export const getFrozenMaterials = (): FrozenMaterials => {
  return { ...frozenMaterials };
};

export const setFrozenMaterials = (source?: Partial<Record<MaterialName, number>> | null): void => {
  frozenMaterials = normalizeMaterials(source);
  notify();
};

export const subscribeToFrozenMaterials = (listener: FrozenListener) => {
  listeners.add(listener);
  listener(getFrozenMaterials());
  return () => {
    listeners.delete(listener);
  };
};

export const computeAvailableMaterials = (total: FrozenMaterials, frozen: FrozenMaterials): FrozenMaterials => {
  const result = createEmptyMaterials();
  MATERIALS.forEach((name) => {
    result[name] = Math.max(0, (total[name] ?? 0) - (frozen[name] ?? 0));
  });
  return result;
};
