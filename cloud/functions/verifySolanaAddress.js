const { onCall, HttpsError } = require("firebase-functions/v2/https");
const nacl = require("tweetnacl");
const bs58 = require("bs58");
const { consumeAuthIntent, normalizeMethodValue, linkVerifiedMethod } = require("./authIdentity");

exports.verifySolanaAddress = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }

  const address = typeof request.data.address === "string" ? request.data.address : "";
  const signatureStr = typeof request.data.signature === "string" ? request.data.signature : "";
  const requestEmoji = request.data.emoji ?? 1;
  const requestAura = request.data.aura ?? null;
  const intentId = request.data.intentId;
  const opId = request.data.opId;
  if (!intentId || typeof intentId !== "string") {
    throw new HttpsError("invalid-argument", "intentId is required.");
  }
  if (!address || !signatureStr) {
    throw new HttpsError("invalid-argument", "address and signature are required.");
  }
  const resolvedOpId = opId || (typeof intentId === "string" && intentId !== "" ? `intent:${intentId}` : undefined);
  const uid = request.auth.uid;
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
