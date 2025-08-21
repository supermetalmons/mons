const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { SiweMessage } = require("siwe");
const admin = require("firebase-admin");

exports.verifyEthAddress = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }

  const message = request.data.message;
  const signature = request.data.signature;
  let requestEmoji = request.data.emoji ?? 1;

  const siweMessage = new SiweMessage(message);
  const fields = await siweMessage.verify({ signature });
  const address = fields.data.address;
  const uid = request.auth.uid;

  if (fields.success && fields.data.nonce === uid && fields.data.statement === "mons ftw") {
    let responseAddress = address;
    let profileId = null;
    let emoji = null;
    let username = null;
    let rating = null;
    let nonce = null;
    let cardBackgroundId = null;
    let cardStickers = null;
    let cardSubtitleId = null;
    let profileMons = null;
    let completedProblems = null;
    let tutorialCompleted = null;

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
            emoji: requestEmoji,
          },
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
        // TODO: add aura
        rating = userData.rating || null;
        nonce = userData.nonce || null;
        cardBackgroundId = userData.custom?.cardBackgroundId || null;
        cardStickers = userData.custom?.cardStickers || null;
        cardSubtitleId = userData.custom?.cardSubtitleId || null;
        profileMons = userData.custom?.profileMons || null;
        completedProblems = userData.custom?.completedProblems || null;
        tutorialCompleted = userData.custom?.tutorialCompleted || null;
        username = userData.username || null;
      }
    } else {
      const userDoc = userQuery.docs[0];
      const userData = userDoc.data();
      responseAddress = userData.eth;
      profileId = userDoc.id;
      emoji = userData.custom?.emoji ?? requestEmoji;
      // TODO: add aura
      rating = userData.rating || null;
      nonce = userData.nonce || null;
      cardBackgroundId = userData.custom?.cardBackgroundId || null;
      cardStickers = userData.custom?.cardStickers || null;
      cardSubtitleId = userData.custom?.cardSubtitleId || null;
      profileMons = userData.custom?.profileMons || null;
      completedProblems = userData.custom?.completedProblems || null;
      tutorialCompleted = userData.custom?.tutorialCompleted || null;
      username = userData.username || null;
    }

    await admin.auth().setCustomUserClaims(uid, {
      profileId: profileId,
    });

    return {
      ok: true,
      uid: uid,
      address: responseAddress,
      profileId: profileId,
      emoji: emoji,
      // TODO: add aura
      username: username,
      rating: rating,
      nonce: nonce,
      cardBackgroundId: cardBackgroundId,
      cardStickers: cardStickers,
      cardSubtitleId: cardSubtitleId,
      profileMons: profileMons,
      completedProblems: completedProblems,
      tutorialCompleted: tutorialCompleted,
    };
  } else {
    return {
      ok: false,
    };
  }
});
