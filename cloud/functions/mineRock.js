const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

const { MATERIAL_KEYS, normalizeMaterials, sumMaterials, createDeterministicDrops, formatMiningDate } = require("./miningHelpers");

exports.mineRock = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }

  const uid = request.auth.uid;
  const materialsInput = request.data && request.data.materials;
  const date = request.data && request.data.date;

  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new HttpsError("invalid-argument", "A valid mining date is required.");
  }

  const miningDate = new Date(`${date}T00:00:00.000Z`);
  const serverDateString = formatMiningDate(new Date());
  const serverDate = new Date(`${serverDateString}T00:00:00.000Z`);
  const dayDiff = Math.abs((miningDate.getTime() - serverDate.getTime()) / 86400000);
  if (!Number.isFinite(dayDiff) || dayDiff > 2) {
    return {
      ok: false,
      reason: "date-out-of-range",
    };
  }

  const delta = normalizeMaterials(materialsInput);
  const hasAnyMaterial = MATERIAL_KEYS.some((key) => delta[key] > 0);

  if (!hasAnyMaterial) {
    throw new HttpsError("invalid-argument", "At least one material amount must be greater than zero.");
  }

  const firestore = admin.firestore();
  const userQuery = await firestore.collection("users").where("logins", "array-contains", uid).limit(1).get();

  if (userQuery.empty) {
    return {
      ok: false,
      reason: "profile-not-found",
    };
  }

  const userDoc = userQuery.docs[0];
  const userData = userDoc.data() || {};
  const profileId = userDoc.id;
  const lastRockDateRaw = userData.mining && userData.mining.lastRockDate;
  const lastRockDate = typeof lastRockDateRaw === "string" ? lastRockDateRaw : null;
  if (lastRockDate && date <= lastRockDate) {
    return {
      ok: false,
      reason: "date-not-advanced",
    };
  }
  const expected = createDeterministicDrops(profileId, date);
  const expectedDelta = expected.delta;
  const materialsMatch = MATERIAL_KEYS.every((key) => delta[key] === expectedDelta[key]);
  if (!materialsMatch) {
    return {
      ok: false,
      reason: "materials-mismatch",
    };
  }
  const currentMaterials = normalizeMaterials(userData.mining && userData.mining.materials);
  const updatedMaterials = sumMaterials(currentMaterials, expectedDelta);

  await userDoc.ref.update({
    "mining.lastRockDate": date,
    "mining.materials": updatedMaterials,
  });

  return {
    ok: true,
    mining: {
      lastRockDate: date,
      materials: updatedMaterials,
    },
  };
});

