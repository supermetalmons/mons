const admin = require("firebase-admin");

const batchReadWithRetry = async (refs) => {
  const initialSnapshots = await Promise.all(
    refs.map((ref) =>
      ref.once("value").catch((error) => {
        console.error("Error in initial batch read:", error);
        return null;
      })
    )
  );

  const finalSnapshots = await Promise.all(
    initialSnapshots.map(async (snapshot, index) => {
      if (snapshot === null) {
        return refs[index].once("value");
      }
      return snapshot;
    })
  );

  return finalSnapshots;
};

async function getProfileByLoginId(uid) {
  try {
    const firestore = admin.firestore();
    const userQuery = await firestore.collection("users").where("logins", "array-contains", uid).limit(1).get();
    if (!userQuery.empty) {
      const userDoc = userQuery.docs[0];
      const userData = userDoc.data();
      return { nonce: userData.nonce === undefined ? -1 : userData.nonce, rating: userData.rating ?? 1500, eth: userData.eth ?? "", sol: userData.sol ?? "", username: userData.username ?? "", profileId: userDoc.id };
    }
  } catch (error) {
    console.error("Error getting player profile:", error);
  }
  return { eth: "", sol: "", profileId: "", nonce: 0, rating: 0 };
}

async function updateUserRatingAndNonce(profileId, newRating, newNonce, isWin) {
  try {
    const firestore = admin.firestore();
    const userRef = firestore.collection("users").doc(profileId);
    await userRef.update({
      rating: newRating,
      nonce: newNonce,
      win: isWin,
    });
    return true;
  } catch (error) {
    console.error("Error updating user rating and nonce:", error);
    return false;
  }
}

async function getPlayerEthAddress(uid) {
  const profile = await getProfileByLoginId(uid);
  return profile.eth;
}

module.exports = {
  batchReadWithRetry,
  getPlayerEthAddress,
  getProfileByLoginId,
  updateUserRatingAndNonce,
};
