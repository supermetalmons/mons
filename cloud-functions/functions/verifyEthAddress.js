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
