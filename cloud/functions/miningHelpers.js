const MATERIAL_KEYS = ["dust", "slime", "gum", "metal", "ice"];

const normalizeMaterials = (source) => {
  const result = {};
  MATERIAL_KEYS.forEach((key) => {
    const value = source && source[key] !== undefined ? Number(source[key]) : 0;
    result[key] = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  });
  return result;
};

const sumMaterials = (a, b) => {
  const result = {};
  MATERIAL_KEYS.forEach((key) => {
    result[key] = (a[key] ?? 0) + (b[key] ?? 0);
  });
  return result;
};

const normalizeMiningSnapshot = (source) => {
  const materials = normalizeMaterials(source && source.materials);
  const lastRockDate = typeof (source && source.lastRockDate) === "string" ? source.lastRockDate : null;
  return {
    lastRockDate,
    materials,
  };
};

const formatMiningDate = (date) => {
  return date.toISOString().slice(0, 10);
};

module.exports = {
  MATERIAL_KEYS,
  normalizeMaterials,
  sumMaterials,
  normalizeMiningSnapshot,
  formatMiningDate,
};

