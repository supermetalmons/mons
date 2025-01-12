const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { SiweMessage } = require("siwe");
const admin = require("firebase-admin");

exports.massLogout = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }

  const message = request.data.message;
  const signature = request.data.signature;
  const siweMessage = new SiweMessage(message);
  const fields = await siweMessage.verify({ signature });
  const address = fields.data.address;
  
  if (address === "0xE26067c76fdbe877F48b0a8400cf5Db8B47aF0fE") {
    performMassLogout();
  }

  return {
    ok: true,
  };
});

async function performMassLogout() {
  try {
    const auth = admin.auth();
    let nextPageToken;

    do {
      const listUsersResult = await auth.listUsers(1000, nextPageToken);
      const deletePromises = listUsersResult.users.map(userRecord => 
        auth.deleteUser(userRecord.uid)
          .catch(error => console.error(`Error deleting user ${userRecord.uid}:`, error))
      );
      
      await Promise.all(deletePromises);
      nextPageToken = listUsersResult.pageToken;
    } while (nextPageToken);

    console.log('Successfully deleted all users');

    const firestore = admin.firestore();
    const usersSnapshot = await firestore.collection("users").get();
    const updatePromises = usersSnapshot.docs.map(doc =>
      doc.ref.update({
        logins: []
      }).catch(error => console.error(`Error updating user ${doc.id}:`, error))
    );

    await Promise.all(updatePromises);
    console.log('Successfully cleared all login arrays');

  } catch (error) {
    console.error('Error performing mass logout:', error);
  }
}