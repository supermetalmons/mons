const admin = require("firebase-admin");
const { MATERIAL_KEYS, normalizeMaterials } = require("./miningHelpers");

const isMaterialName = (value) => MATERIAL_KEYS.includes(value);

const normalizeCount = (value) => {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : 0;
};

const computeAvailableCount = (total, frozen, material) => {
  return Math.max(0, (total && total[material] ? total[material] : 0) - (frozen && frozen[material] ? frozen[material] : 0));
};

const applyMaterialDeltas = (source, deltas) => {
  const result = normalizeMaterials(source);
  MATERIAL_KEYS.forEach((key) => {
    const delta = deltas && deltas[key] ? Number(deltas[key]) : 0;
    const next = (result[key] ?? 0) + (Number.isFinite(delta) ? delta : 0);
    result[key] = Math.max(0, Math.round(next));
  });
  return result;
};

const applyMaterialDeltasWithCap = (source, deltas, totalMaterials) => {
  const result = normalizeMaterials(source);
  const caps = totalMaterials ? normalizeMaterials(totalMaterials) : null;
  MATERIAL_KEYS.forEach((key) => {
    const delta = deltas && deltas[key] ? Number(deltas[key]) : 0;
    let next = (result[key] ?? 0) + (Number.isFinite(delta) ? delta : 0);
    next = Math.max(0, Math.round(next));
    if (caps) {
      next = Math.min(next, caps[key] ?? 0);
    }
    result[key] = next;
  });
  return result;
};

const updateFrozenMaterials = async (uid, deltas) => {
  const frozenRef = admin.database().ref(`players/${uid}/mining/frozen`);
  await frozenRef.transaction((current) => {
    return applyMaterialDeltas(current, deltas);
  });
};

const updateFrozenMaterialsWithCap = async (uid, deltas, totalMaterials) => {
  const frozenRef = admin.database().ref(`players/${uid}/mining/frozen`);
  await frozenRef.transaction((current) => {
    return applyMaterialDeltasWithCap(current, deltas, totalMaterials);
  });
};

const reserveFrozenMaterials = async (uid, material, count, totalMaterials) => {
  let reservedCount = 0;
  const frozenRef = admin.database().ref(`players/${uid}/mining/frozen`);
  const result = await frozenRef.transaction((current) => {
    const normalized = normalizeMaterials(current);
    const available = computeAvailableCount(totalMaterials, normalized, material);
    const nextCount = Math.min(count, available);
    if (nextCount <= 0) {
      reservedCount = 0;
      return;
    }
    reservedCount = nextCount;
    normalized[material] = (normalized[material] ?? 0) + nextCount;
    return normalized;
  });
  if (!result.committed) {
    reservedCount = 0;
  }
  return reservedCount;
};

const reserveAcceptedMaterials = async (uid, material, proposedCount, ownProposal, totalMaterials) => {
  let acceptedCount = 0;
  let appliedDelta = null;
  const frozenRef = admin.database().ref(`players/${uid}/mining/frozen`);
  const caps = normalizeMaterials(totalMaterials);
  const ownMaterial = ownProposal && ownProposal.material ? ownProposal.material : null;
  const ownCount = ownProposal ? normalizeCount(ownProposal.count) : 0;
  const result = await frozenRef.transaction((current) => {
    const normalized = normalizeMaterials(current);
    const next = { ...normalized };
    if (ownMaterial) {
      next[ownMaterial] = Math.max(0, (next[ownMaterial] ?? 0) - ownCount);
    }
    const baseFrozen = next[material] ?? 0;
    const available = Math.max(0, (caps[material] ?? 0) - baseFrozen);
    const nextAccepted = Math.min(proposedCount, available);
    if (nextAccepted <= 0) {
      acceptedCount = 0;
      return;
    }
    acceptedCount = nextAccepted;
    next[material] = Math.min(caps[material] ?? 0, baseFrozen + nextAccepted);
    appliedDelta = MATERIAL_KEYS.reduce((acc, key) => {
      const diff = (next[key] ?? 0) - (normalized[key] ?? 0);
      if (diff !== 0) {
        acc[key] = diff;
      }
      return acc;
    }, {});
    return next;
  });
  if (!result.committed) {
    acceptedCount = 0;
    appliedDelta = null;
  }
  return { acceptedCount, appliedDelta };
};

const readFrozenMaterials = async (uid) => {
  const snap = await admin.database().ref(`players/${uid}/mining/frozen`).once("value");
  return normalizeMaterials(snap.val());
};

const readUserMiningMaterials = async (profileId) => {
  const doc = await admin.firestore().collection("users").doc(profileId).get();
  if (!doc.exists) {
    return normalizeMaterials();
  }
  const data = doc.data() || {};
  return normalizeMaterials(data.mining && data.mining.materials);
};

const updateUserMiningMaterials = async (profileId, materials) => {
  const userRef = admin.firestore().collection("users").doc(profileId);
  await userRef.update({
    "mining.materials": normalizeMaterials(materials),
  });
};

module.exports = {
  isMaterialName,
  normalizeCount,
  computeAvailableCount,
  applyMaterialDeltas,
  applyMaterialDeltasWithCap,
  updateFrozenMaterials,
  updateFrozenMaterialsWithCap,
  reserveFrozenMaterials,
  reserveAcceptedMaterials,
  readFrozenMaterials,
  readUserMiningMaterials,
  updateUserMiningMaterials,
};
