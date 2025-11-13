const MATERIAL_KEYS = ["dust", "slime", "gum", "metal", "ice"];

const createEmptyMaterials = () => {
  const result = {};
  MATERIAL_KEYS.forEach((key) => {
    result[key] = 0;
  });
  return result;
};

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

const computeHash32 = (value) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
};

const createSeededRandom = (profileId, date) => {
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

const pickWeightedMaterial = (random) => {
  const r = random() * 100;
  if (r < 30) return "dust";
  if (r < 55) return "slime";
  if (r < 75) return "gum";
  if (r < 90) return "metal";
  return "ice";
};

const createDeterministicDrops = (profileId, date) => {
  const random = createSeededRandom(profileId, date);
  const count = 2 + Math.floor(random() * 4);
  const drops = [];
  const delta = createEmptyMaterials();
  for (let i = 0; i < count; i += 1) {
    const material = pickWeightedMaterial(random);
    drops.push(material);
    delta[material] += 1;
  }
  return { drops, delta };
};

module.exports = {
  MATERIAL_KEYS,
  normalizeMaterials,
  sumMaterials,
  normalizeMiningSnapshot,
  formatMiningDate,
  createDeterministicDrops,
};
