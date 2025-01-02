const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { SiweMessage } = require("siwe");
const admin = require("firebase-admin");

exports.verifyEthAddress = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }

  const message = request.data.message;
  const signature = request.data.signature;
  let requestEmoji = request.data.emoji ?? 0;

  const siweMessage = new SiweMessage(message);
  const fields = await siweMessage.verify({ signature });
  const address = fields.data.address;
  const uid = request.auth.uid;

  if (fields.success && fields.data.nonce === uid && fields.data.statement === "mons ftw") {
    let responseAddress = address;
    let profileId = null;
    let emoji = null;

    const firestore = admin.firestore();
    const userQuery = await firestore.collection("users").where("logins", "array-contains", uid).limit(1).get();

    if (userQuery.empty) {
      const db = admin.database();
      const profileIdRef = db.ref(`players/${uid}/profile`);

      const userWithMatchingEthAddressQuery = await firestore.collection("users").where("eth", "==", address).get();
      if (userWithMatchingEthAddressQuery.empty) {
        const docRef = await firestore.collection("users").add({
          eth: address,
          logins: [uid],
          custom: {
            emoji: requestEmoji
          }
        });
        await profileIdRef.set(docRef.id);
        profileId = docRef.id;
        emoji = requestEmoji;
      } else {
        const userDoc = userWithMatchingEthAddressQuery.docs[0];
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
      responseAddress = userData.eth;
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
