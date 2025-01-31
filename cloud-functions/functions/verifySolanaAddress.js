const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

exports.verifySolanaAddress = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }

  const address = request.data.address;
  const signature = request.data.signature;
  let requestEmoji = request.data.emoji ?? 1;
  const uid = request.auth.uid;
  const targetMessage = `Sign in mons.link with Solana nonce ${uid}`;

  const matchingSignature = false; // TODO: implement signature verification

  if (matchingSignature) {
    let responseAddress = address;
    let profileId = null;
    let emoji = null;

    const firestore = admin.firestore();
    const userQuery = await firestore.collection("users").where("logins", "array-contains", uid).limit(1).get();

    if (userQuery.empty) {
      const db = admin.database();
      const profileIdRef = db.ref(`players/${uid}/profile`);

      const userWithMatchingSolAddressQuery = await firestore.collection("users").where("sol", "==", address).get();
      if (userWithMatchingSolAddressQuery.empty) {
        const docRef = await firestore.collection("users").add({
          sol: address,
          logins: [uid],
          custom: {
            emoji: requestEmoji,
          },
        });
        await profileIdRef.set(docRef.id);
        profileId = docRef.id;
        emoji = requestEmoji;
      } else {
        const userDoc = userWithMatchingSolAddressQuery.docs[0];
        const userData = userDoc.data();
        if (!userData.logins.includes(uid)) {
          await userDoc.ref.update({
            logins: [...userData.logins, uid],
          });
          await profileIdRef.set(userDoc.id);
        }
        profileId = userDoc.id;
        emoji = userData.custom?.emoji ?? requestEmoji;
      }
    } else {
      const userDoc = userQuery.docs[0];
      const userData = userDoc.data();
      responseAddress = userData.sol;
      profileId = userDoc.id;
      emoji = userData.custom?.emoji ?? requestEmoji;
    }

    return {
      ok: true,
      uid: uid,
      address: responseAddress,
      profileId: profileId,
      emoji: emoji,
    };
  } else {
    return {
      ok: false,
    };
  }
});
