const { onCall, HttpsError } = require("firebase-functions/v2/https");
const nacl = require("tweetnacl");
const bs58 = require("bs58");
const { consumeAuthIntent, normalizeMethodValue, linkVerifiedMethod, peekAuthOpReplay } = require("./authIdentity");

exports.verifySolanaAddress = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }

  const requestData = request && request.data && typeof request.data === "object" ? request.data : {};
  const address = typeof requestData.address === "string" ? requestData.address : "";
  const signatureStr = typeof requestData.signature === "string" ? requestData.signature : "";
  const requestEmoji = requestData.emoji ?? 1;
  const requestAura = requestData.aura ?? null;
  const intentId = typeof requestData.intentId === "string" ? requestData.intentId : "";
  const opId = requestData.opId;
  if (!address || !signatureStr) {
    throw new HttpsError("invalid-argument", "address and signature are required.");
  }
  if (!intentId) {
    throw new HttpsError("invalid-argument", "intentId is required.");
  }
  const resolvedOpId = opId || (intentId ? `intent:${intentId}` : undefined);
  const uid = request.auth.uid;
  const replay = await peekAuthOpReplay({
    opId: resolvedOpId,
    kind: "verify",
    method: "sol",
    uid,
  });
  if (replay) {
    return replay;
  }
  const intent = await consumeAuthIntent({
    uid,
    method: "sol",
    intentId,
  });
  const expectedNonce = intent && typeof intent.nonce === "string" ? intent.nonce : "";
  if (!expectedNonce) {
    throw new HttpsError("failed-precondition", "intent-invalid");
  }
  const targetMessage = `Sign in mons.link with Solana nonce ${expectedNonce}`;

  const signatureBytes = new Uint8Array(Buffer.from(signatureStr, "base64"));
  let publicKeyBytes;
  try {
    publicKeyBytes = bs58.default.decode(address);
  } catch {
    throw new HttpsError("invalid-argument", "Invalid Solana address.");
  }
  const messageBytes = new TextEncoder().encode(targetMessage);
  const matchingSignature = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);

  if (!matchingSignature) {
    return { ok: false };
  }

  const normalizedSol = normalizeMethodValue("sol", address);
  const response = await linkVerifiedMethod({
    uid,
    method: "sol",
    methodValueRaw: address,
    normalizedMethodValue: normalizedSol,
    requestEmoji,
    requestAura,
    preferredAddress: address,
    opId: resolvedOpId,
    request,
  });

  return response;
});
