const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { SiweMessage } = require("siwe");
const admin = require("firebase-admin");

exports.verifyEthAddress = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }

  const message = request.data.message;
  const signature = request.data.signature;

  const siweMessage = new SiweMessage(message);
  const fields = await siweMessage.verify({ signature });
  const address = fields.data.address;
  const uid = request.auth.uid;

  if (fields.success && fields.data.nonce === uid && fields.data.statement === "mons ftw") {
    let responseAddress = address;
    let profileId = null;

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
        });
        await profileIdRef.set(docRef.id);
        profileId = docRef.id;
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
      }
    } else {
      const userDoc = userQuery.docs[0];
      const userData = userDoc.data();
      responseAddress = userData.eth;
      profileId = userDoc.id;
    }

    return {
      ok: true,
      uid: uid,
      address: responseAddress,
      profileId: profileId,
    };
  } else {
    return {
      ok: false,
    };
  }
});
