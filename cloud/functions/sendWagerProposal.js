const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { getProfileByLoginId } = require("./utils");
const { isMaterialName, normalizeCount, reserveFrozenMaterials, updateFrozenMaterials, readUserMiningMaterials } = require("./wagerHelpers");

exports.sendWagerProposal = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }

  const uid = request.auth.uid;
  const inviteId = request.data && request.data.inviteId;
  const matchId = request.data && request.data.matchId;
  const material = request.data && request.data.material;
  const requestedCount = normalizeCount(request.data && request.data.count);

  if (typeof inviteId !== "string" || typeof matchId !== "string" || !isMaterialName(material) || requestedCount <= 0) {
    return { ok: false, reason: "invalid-argument" };
  }
  if (inviteId.startsWith("auto_")) {
    return { ok: false, reason: "automatch-disabled" };
  }

  const inviteSnap = await admin.database().ref(`invites/${inviteId}`).once("value");
  const inviteData = inviteSnap.val();
  if (!inviteData) {
    return { ok: false, reason: "invite-not-found" };
  }
  const hostId = inviteData.hostId;
  const guestId = inviteData.guestId;
  if (uid !== hostId && uid !== guestId) {
    throw new HttpsError("permission-denied", "You don't have permission to send this wager proposal.");
  }
  if (!guestId) {
    return { ok: false, reason: "missing-opponent" };
  }
  const opponentId = uid === hostId ? guestId : hostId;

  const playerProfile = await getProfileByLoginId(uid);
  const opponentProfile = await getProfileByLoginId(opponentId);
  if (!playerProfile.profileId || !opponentProfile.profileId) {
    return { ok: false, reason: "profile-not-found" };
  }

  const totalMaterials = await readUserMiningMaterials(playerProfile.profileId);
  const reservedCount = await reserveFrozenMaterials(uid, material, requestedCount, totalMaterials);
  if (reservedCount <= 0) {
    return { ok: false, reason: "insufficient-materials" };
  }

  const wagerRef = admin.database().ref(`invites/${inviteId}/wagers/${matchId}`);
  const now = Date.now();
  const txn = await wagerRef.transaction((current) => {
    const data = current || {};
    if (data.resolved || data.agreed) {
      return;
    }
    const proposals = data.proposals || {};
    const proposedBy = data.proposedBy || {};
    if (proposals[uid] || proposedBy[uid]) {
      return;
    }
    proposals[uid] = { material, count: reservedCount, createdAt: now };
    proposedBy[uid] = true;
    data.proposals = proposals;
    data.proposedBy = proposedBy;
    return data;
  });

  if (!txn.committed) {
    await updateFrozenMaterials(uid, { [material]: -reservedCount });
    return { ok: false, reason: "proposal-unavailable" };
  }

  return { ok: true, count: reservedCount };
});
