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

async function getProfile(uid) {
  try {
    const firestore = admin.firestore();
    const userQuery = await firestore.collection("users").where("logins", "array-contains", uid).limit(1).get();
    if (!userQuery.empty) {
      const userDoc = userQuery.docs[0];
      const userData = userDoc.data();
      return { eth: userData.eth, profileId: userDoc.id };
    }
  } catch (error) {
    console.error("Error getting player ETH address:", error);
  }
  return { eth: "", profileId: "" };
}

async function getPlayerEthAddress(uid) {
  const profile = await getProfile(uid);
  return profile.eth;
}

module.exports = {
  batchReadWithRetry,
  getPlayerEthAddress,
  getProfile,
};
