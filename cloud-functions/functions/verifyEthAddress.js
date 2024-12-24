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
    // TODO: stop accessing ethAddress in realtime database when the migration is complete
    const db = admin.database();
    const ethAddressRef = db.ref(`players/${uid}/ethAddress`);
    const ethAddressSnapshot = await ethAddressRef.once("value");
    const existingEthAddress = ethAddressSnapshot.val();

    let responseAddress;
    if (existingEthAddress === null) {
      await ethAddressRef.set(address);
      responseAddress = address;
    } else {
      responseAddress = existingEthAddress;
    }

    const firestore = admin.firestore();
    const lowercaseAddress = address.toLowerCase();
    const userQuery = await firestore.collection("users").where("eth", "==", lowercaseAddress).get();
    // TODO: tune firestore indexing making sure this is quick

    if (userQuery.empty) {
      const docRef = await firestore.collection("users").add({
        eth: lowercaseAddress,
        logins: [uid],
      });
      const profileIdRef = db.ref(`players/${uid}/profile`);
      await profileIdRef.set(docRef.id);
    } else {
      const userDoc = userQuery.docs[0];
      const userData = userDoc.data();
      if (!userData.logins.includes(uid)) {
        await userDoc.ref.update({
          logins: [...userData.logins, uid],
        });
      }
    }

    return {
      ok: true,
      uid: uid,
      address: responseAddress,
    };
  } else {
    return {
      ok: false,
    };
  }
});
