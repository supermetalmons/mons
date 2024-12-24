const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { SecretManagerServiceClient } = require("@google-cloud/secret-manager");
const { EAS, SchemaEncoder, EIP712Proxy } = require("@ethereum-attestation-service/eas-sdk");
const { ethers } = require("ethers");
const glicko2 = require("glicko2");
const admin = require("firebase-admin");
const { batchReadWithRetry } = require("./utils");

const secretManagerServiceClient = new SecretManagerServiceClient();

exports.attestMatchVictory = onCall(async (request) => {
  const easAddress = "0x4200000000000000000000000000000000000021";

  const proxyAddress = "0x6D132b7cDC2b5A5F7C4DFd6C84C0A776062C58Ae";
  const schema = "0x5c6e798cbb817442fa075e01b65d5d65d3ac35c2b05c1306e8771a1c8a3adb32";

  const uid = request.auth.uid;
  const inviteId = request.data.inviteId;
  const matchId = request.data.matchId;
  const opponentId = request.data.opponentId;

  if (!inviteId.startsWith("auto_")) {
    return { ok: false };
  }

  const matchRef = admin.database().ref(`players/${uid}/matches/${matchId}`);
  const inviteRef = admin.database().ref(`invites/${inviteId}`);
  const opponentMatchRef = admin.database().ref(`players/${opponentId}/matches/${matchId}`);
  const playerEthAddressRef = admin.database().ref(`players/${uid}/ethAddress`);
  const opponentEthAddressRef = admin.database().ref(`players/${opponentId}/ethAddress`);

  const [matchSnapshot, inviteSnapshot, opponentMatchSnapshot, playerEthAddressSnapshot, opponentEthAddressSnapshot] = 
    await batchReadWithRetry([
      matchRef, 
      inviteRef, 
      opponentMatchRef, 
      playerEthAddressRef, 
      opponentEthAddressRef
    ]);

  const matchData = matchSnapshot.val();
  const inviteData = inviteSnapshot.val();
  const opponentMatchData = opponentMatchSnapshot.val();
  const playerEthAddress = playerEthAddressSnapshot.val();
  const opponentEthAddress = opponentEthAddressSnapshot.val();

  if (!((inviteData.hostId === uid && inviteData.guestId === opponentId) || (inviteData.hostId === opponentId && inviteData.guestId === uid))) {
    throw new HttpsError("permission-denied", "Players don't match invite data");
  }

  if (!playerEthAddress) {
    throw new HttpsError("failed-precondition", "Player's Ethereum address not found.");
  }

  if (!opponentEthAddress) {
    throw new HttpsError("failed-precondition", "Opponent's Ethereum address not found.");
  }

  var result = "none";
  if (matchData.status == "surrendered" || opponentMatchData.timer == "gg") {
    result = "gg";
  } else if (opponentMatchData.status == "surrendered" || matchData.timer == "gg") {
    result = "win";
  } else {
    const color = matchData.color;
    const opponentColor = opponentMatchData.color;
    const mons = await import("mons-rust");
    var winnerColorFen = "";
    if (color == "white") {
      winnerColorFen = mons.winner(matchData.fen, opponentMatchData.fen, matchData.flatMovesString, opponentMatchData.flatMovesString);
    } else {
      winnerColorFen = mons.winner(opponentMatchData.fen, matchData.fen, opponentMatchData.flatMovesString, matchData.flatMovesString);
    }
    if (winnerColorFen != "") {
      if (winnerColorFen === "x") {
        // TODO: explore corrupted game data to see if there was cheating
      }

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

  if (result !== "win") {
    throw new HttpsError("internal", "Cound not confirm victory.");
  }

  const recipient1 = playerEthAddress;
  const recipient2 = opponentEthAddress;

  const [targetAttestation1, targetAttestation2] = await getLatestAttestations(schema, proxyAddress, recipient1, recipient2);
  const refUID1 = targetAttestation1.id;
  const refUID2 = targetAttestation2.id;
  const nonce1 = targetAttestation1.nonce;
  const nonce2 = targetAttestation2.nonce;

  const nonceRef = admin.database().ref(`players/${uid}/nonces/${matchId}`);
  const nonceSnapshot = await nonceRef.once("value");
  if (!nonceSnapshot.exists()) {
    await nonceRef.set(nonce1);
  } else if (nonceSnapshot.val() !== nonce1) {
    throw new HttpsError("internal", "Can not attest that game anymore");
  }

  const [newRating1, newRating2] = updateRating(targetAttestation1.rating, nonce1, targetAttestation2.rating, nonce2);

  const name = `projects/${process.env.GCLOUD_PROJECT}/secrets/mons-attester/versions/latest`;
  const [version] = await secretManagerServiceClient.accessSecretVersion({
    name,
  });
  const privateKey = version.payload.data.toString("utf8");
  const provider = new ethers.JsonRpcProvider("https://mainnet.base.org");
  const signer = new ethers.Wallet(privateKey, provider);

  const newProxy = new EIP712Proxy(proxyAddress, { signer: signer });
  const eas = new EAS(easAddress, {
    proxy: newProxy,
    signer: signer,
  });
  const proxy = await eas.getEIP712Proxy();
  const delegated = await proxy?.getDelegated();

  const schemaEncoder = new SchemaEncoder("uint32 nonce, uint16 newRating, bool win");

  const encodedData1 = schemaEncoder.encodeData([
    { name: "nonce", value: nonce1, type: "uint32" },
    { name: "newRating", value: newRating1, type: "uint16" },
    { name: "win", value: true, type: "bool" },
  ]);
  const encodedData2 = schemaEncoder.encodeData([
    { name: "nonce", value: nonce2, type: "uint32" },
    { name: "newRating", value: newRating2, type: "uint16" },
    { name: "win", value: false, type: "bool" },
  ]);

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 123);

  try {
    const response1 = await delegated.signDelegatedProxyAttestation(
      {
        schema: schema,
        recipient: recipient1,
        expirationTime: 0n,
        revocable: false,
        refUID: refUID1,
        value: 0n,
        data: encodedData1,
        deadline: deadline,
      },
      signer
    );
    const signature1 = response1.signature;

    const response2 = await delegated.signDelegatedProxyAttestation(
      {
        schema: schema,
        recipient: recipient2,
        expirationTime: 0n,
        revocable: false,
        refUID: refUID2,
        value: 0n,
        data: encodedData2,
        deadline: deadline,
      },
      signer
    );
    const signature2 = response2.signature;

    const signatures = [
      {
        r: signature1.r,
        s: signature1.s,
        v: signature1.v,
      },
      {
        r: signature2.r,
        s: signature2.s,
        v: signature2.v,
      },
    ];

    const attester = await signer.getAddress();

    return {
      easAddress: easAddress,
      proxyAddress: proxyAddress,
      schema: schema,
      attester: attester,
      recipient1: recipient1,
      recipient2: recipient2,
      refUID1: refUID1,
      refUID2: refUID2,
      encodedData1: encodedData1,
      encodedData2: encodedData2,
      signatures: signatures,
      deadline: deadline.toString(),
      ok: true,
    };
  } catch (error) {
    console.error("Error in attestVictory:", error);
    throw new HttpsError("internal", "An error occurred while processing the attestation.");
  }
});

const updateRating = (winRating, winPlayerGamesCount, lossRating, lossPlayerGamesCount) => {
  const settings = {
    tau: 0.75,
    rating: 1500,
    rd: 100,
    vol: 0.06,
  };

  const ranking = new glicko2.Glicko2(settings);
  const adjustRd = (gamesCount) => Math.max(60, 350 - gamesCount);
  const winner = ranking.makePlayer(winRating, adjustRd(winPlayerGamesCount), 0.06);
  const loser = ranking.makePlayer(lossRating, adjustRd(lossPlayerGamesCount), 0.06);
  const matches = [[winner, loser, 1]];
  ranking.updateRatings(matches);

  const newWinRating = Math.round(winner.getRating());
  const newLossRating = Math.round(loser.getRating());

  return [newWinRating, newLossRating];
};

const getLatestAttestations = async (schema, proxyAddress, recipient1, recipient2) => {
  const easQuery = `
    query Attestation {
      firstRecipientAttestations: attestations(
        take: 10,
        skip: 0,
        orderBy: { data: desc },
        where: { 
          schemaId: { equals: "${schema}" }, 
          attester: { equals: "${proxyAddress}" },
          recipient: { equals: "${recipient1}" },
          revoked: { equals: false },
        },
      ) {
        decodedDataJson
        id
        time
      }

      secondRecipientAttestations: attestations(
        take: 10,
        skip: 0,
        orderBy: { data: desc },
        where: { 
          schemaId: { equals: "${schema}" }, 
          attester: { equals: "${proxyAddress}" },
          recipient: { equals: "${recipient2}" },
          revoked: { equals: false },
        },
      ) {
        decodedDataJson
        id
        time
      }
    }
  `;

  const easResponse = await fetch("https://base.easscan.org/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: easQuery,
      variables: {},
    }),
  });

  if (!easResponse.ok) {
    throw new HttpsError("internal", "Failed to fetch attestations");
  }

  const easResponseJson = await easResponse.json();
  const targetAttestation1 = processAllRawAttestations(easResponseJson.data.firstRecipientAttestations);
  const targetAttestation2 = processAllRawAttestations(easResponseJson.data.secondRecipientAttestations);
  return [targetAttestation1, targetAttestation2];
};

const processAllRawAttestations = (rawAttestations) => {
  let targetAttestation = processAttestation(rawAttestations.length > 0 ? rawAttestations[0] : null);
  const maxNonce = targetAttestation.nonce;
  let requireAtLeastOneWithLowerNonce = false;

  for (let i = 1; i < rawAttestations.length; i++) {
    const attestation = processAttestation(rawAttestations[i]);
    if (attestation.nonce > maxNonce) {
      throw new HttpsError("internal", "Unexpected order of attestations");
    } else if (attestation.nonce === maxNonce) {
      if (attestation.time < targetAttestation.time) {
        targetAttestation = attestation;
      }
      requireAtLeastOneWithLowerNonce = true;
    } else if (attestation.nonce < maxNonce) {
      return targetAttestation;
    }
  }

  if (requireAtLeastOneWithLowerNonce && maxNonce > 0) {
    throw new HttpsError("internal", "Could not find the earliest attestation with max nonce");
  }
  return targetAttestation;
};

const processAttestation = (targetAttestation) => {
  const result = {
    id: "0x0000000000000000000000000000000000000000000000000000000000000000",
    nonce: 0,
    rating: 1500,
    time: 0,
  };

  if (targetAttestation) {
    result.id = targetAttestation.id;
    result.time = targetAttestation.time;

    const decodedData = JSON.parse(targetAttestation.decodedDataJson);

    const nonceItem = decodedData.find((item) => item.name === "nonce");
    if (nonceItem && typeof nonceItem.value.value === "number") {
      result.nonce = nonceItem.value.value + 1;
    } else {
      throw new HttpsError("internal", "Invalid nonce value in previous attestation");
    }

    const ratingItem = decodedData.find((item) => item.name === "newRating");
    if (ratingItem && typeof ratingItem.value.value === "number") {
      result.rating = ratingItem.value.value;
    } else {
      throw new HttpsError("internal", "Invalid rating value in previous attestation");
    }
  }

  return result;
};
