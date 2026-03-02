const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { SiweMessage } = require("siwe");
const { consumeAuthIntent, normalizeMethodValue, linkVerifiedMethod, validateSiweDomainAndUri, peekAuthOpReplay } = require("./authIdentity");

exports.verifyEthAddress = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }

  const message = typeof request.data.message === "string" ? request.data.message : "";
  const signature = typeof request.data.signature === "string" ? request.data.signature : "";
  const requestEmoji = request.data.emoji ?? 1;
  const requestAura = request.data.aura ?? null;
  const opId = request.data.opId;
  const intentId = request.data.intentId;
  if (!intentId || typeof intentId !== "string") {
    throw new HttpsError("invalid-argument", "intentId is required.");
  }
  if (!message || !signature) {
    throw new HttpsError("invalid-argument", "message and signature are required.");
  }
  const resolvedOpId = opId || (typeof intentId === "string" && intentId !== "" ? `intent:${intentId}` : undefined);
  const replay = await peekAuthOpReplay({
    opId: resolvedOpId,
    kind: "verify",
    method: "eth",
    uid: request.auth.uid,
  });
  if (replay) {
    return replay;
  }

  let siweMessage;
  try {
    siweMessage = new SiweMessage(message);
  } catch {
    throw new HttpsError("invalid-argument", "Invalid SIWE message.");
  }

  let fields;
  try {
    fields = await siweMessage.verify({ signature });
  } catch {
    return { ok: false };
  }
  const address = fields && fields.data ? fields.data.address : null;
  const uid = request.auth.uid;
  const intent = await consumeAuthIntent({
    uid,
    method: "eth",
    intentId,
  });
  const expectedNonce = intent && typeof intent.nonce === "string" ? intent.nonce : "";
  if (!expectedNonce) {
    throw new HttpsError("failed-precondition", "intent-invalid");
  }

  if (!fields.success || fields.data.nonce !== expectedNonce || fields.data.statement !== "mons ftw") {
    return { ok: false };
  }

  validateSiweDomainAndUri(fields.data);
  const normalizedEth = normalizeMethodValue("eth", address);
  const response = await linkVerifiedMethod({
    uid,
    method: "eth",
    methodValueRaw: normalizedEth,
    methodValueLookupRaw: address,
    normalizedMethodValue: normalizedEth,
    requestEmoji,
    requestAura,
    preferredAddress: normalizedEth,
    opId: resolvedOpId,
    request,
  });

  return response;
});
