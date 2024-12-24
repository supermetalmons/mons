const {
  TransactionInstruction,
  Keypair,
  PublicKey,
  Transaction,
} = require("@solana/web3.js");
const { Buffer } = require("buffer");
const { BN } = require("bn.js");
const bs58 = require("bs58");

async function gameResult(request) {
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "The function must be called while authenticated."
    );
  }
  const signatureType = request.data.signature;
  if (signatureType != "ed25519") {
    throw new HttpsError("invalid-argument", "Unsupported signature type");
  }

  const uid = request.auth.uid;
  const id = request.data.id;

  const matchRef = admin.database().ref(`players/${uid}/matches/${id}`);
  const matchSnapshot = await matchRef.once("value");
  const matchData = matchSnapshot.val();

  const inviteRef = admin.database().ref(`invites/${id}`);
  const inviteSnapshot = await inviteRef.once("value");
  const inviteData = inviteSnapshot.val();

  const opponentId =
    inviteData.guestId === uid ? inviteData.hostId : inviteData.guestId;

  const opponentMatchRef = admin
    .database()
    .ref(`players/${opponentId}/matches/${id}`);
  const opponentMatchSnapshot = await opponentMatchRef.once("value");
  const opponentMatchData = opponentMatchSnapshot.val();

  var result = "none"; // gg / win / none / draw
  if (matchData.status == "surrendered") {
    result = "gg";
  } else if (opponentMatchData.status == "surrendered") {
    result = "win";
  } else {
    const color = matchData.color;
    const opponentColor = opponentMatchData.color;
    const mons = await import("mons-rust");
    var winnerColorFen = "";
    if (color == "white") {
      winnerColorFen = mons.winner(
        matchData.fen,
        opponentMatchData.fen,
        matchData.flatMovesString,
        opponentMatchData.flatMovesString
      );
    } else {
      winnerColorFen = mons.winner(
        opponentMatchData.fen,
        matchData.fen,
        opponentMatchData.flatMovesString,
        matchData.flatMovesString
      );
    }
    if (winnerColorFen != "") {
      // TODO: process "x" doing a split

      var winnerColor = "none";
      if (winnerColorFen == "w") {
        winnerColor = "white";
      } else if (winnerColorFen == "b") {
        winnerColor = "black";
      }

      if (winnerColor == color) {
        result = "win";
      } else if (winnerColor == opponentColor) {
        result = "gg";
      }
    }
  }

  if (result === "win") {
    const name = `projects/${process.env.GCLOUD_PROJECT}/secrets/solana-private-key/versions/latest`;
    const [version] = await client.accessSecretVersion({ name });
    const privateKeyBase58 = version.payload.data.toString("utf8");
    const privateKeyUint8 = bs58.decode(privateKeyBase58);
    const keyPair = Keypair.fromSecretKey(privateKeyUint8);
    const transaction = new Transaction({
      recentBlockhash: request.data.params.recentBlockhash,
      feePayer: new PublicKey(request.data.params.caller),
    });

    const gameID = convertBase62StringToBN(id);
    const seeds = [
      Buffer.from("game"),
      Buffer.from(new BN(gameID).toArrayLike(Buffer, "le", 8)),
    ];
    const [gamePDA, bump] = await PublicKey.findProgramAddress(
      seeds,
      new PublicKey(request.data.params.pid)
    );

    const endGameIx = new TransactionInstruction({
      keys: [
        { pubkey: gamePDA, isSigner: false, isWritable: true },
        {
          pubkey: new PublicKey(request.data.params.caller),
          isSigner: true,
          isWritable: true,
        },
        { pubkey: keyPair.publicKey, isSigner: true, isWritable: false },
      ],
      programId: new PublicKey(request.data.params.pid),
      data: Buffer.from("e087f56343af79fc", "hex"),
    });

    transaction.add(endGameIx);
    transaction.partialSign(keyPair);
    const serializedTransaction = transaction.serialize({
      requireAllSignatures: false,
    });

    return {
      result: result,
      signed: serializedTransaction.toString("base64"),
    };
  } else {
    return {
      result: result,
    };
  }
}

function convertBase62StringToBN(str) {
  const base62 =
    "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let result = new BN(0);

  for (let char of str) {
    const value = base62.indexOf(char);
    if (value === -1) {
      throw new Error(`Invalid character in string: ${char}`);
    }
    result = result.mul(new BN(62)).add(new BN(value));
  }

  return result;
}
