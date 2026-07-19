import {
  applyMaterialDeltas,
  computeAvailableMaterials as computeSharedAvailableMaterials,
  createEmptyMaterials as createSharedEmptyMaterials,
  normalizeMaterials as normalizeSharedMaterials,
} from "@mons/shared/mining";
import type { MaterialName } from "./rocksMiningService";

type FrozenMaterials = Record<MaterialName, number>;

type FrozenListener = (materials: FrozenMaterials) => void;

const createEmptyMaterials = (): FrozenMaterials =>
  createSharedEmptyMaterials();

const normalizeMaterials = (
  source?: Partial<Record<MaterialName, number>> | null,
): FrozenMaterials => normalizeSharedMaterials(source);

let frozenMaterials = createEmptyMaterials();

const listeners = new Set<FrozenListener>();

const notify = () => {
  const snapshot = getFrozenMaterials();
  listeners.forEach((listener) => listener(snapshot));
};

export const getFrozenMaterials = (): FrozenMaterials => {
  return { ...frozenMaterials };
};

export const setFrozenMaterials = (
  source?: Partial<Record<MaterialName, number>> | null,
): void => {
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

export const applyFrozenMaterialsDelta = (
  deltas?: Partial<Record<MaterialName, number>> | null,
): FrozenMaterials => {
  const next = applyMaterialDeltas(getFrozenMaterials(), deltas);
  setFrozenMaterials(next);
  return getFrozenMaterials();
};

export const computeAvailableMaterials = (
  total: FrozenMaterials,
  frozen: FrozenMaterials,
): FrozenMaterials => computeSharedAvailableMaterials(total, frozen);

export const resetWagerMaterialsState = () => {
  frozenMaterials = createEmptyMaterials();
  notify();
};
