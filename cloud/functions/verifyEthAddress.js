const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { SiweMessage } = require("siwe");
const {
  consumeAuthIntent,
  normalizeMethodValue,
  linkVerifiedMethod,
  validateSiweDomainAndUri,
  peekAuthOpReplay,
} = require("./authIdentity");

exports.verifyEthAddress = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "The function must be called while authenticated.",
    );
  }

  const requestData =
    request && request.data && typeof request.data === "object"
      ? request.data
      : {};
  const message =
    typeof requestData.message === "string" ? requestData.message : "";
  const signature =
    typeof requestData.signature === "string" ? requestData.signature : "";
  const requestEmoji = requestData.emoji ?? 1;
  const requestAura = requestData.aura ?? null;
  const opId = requestData.opId;
  const intentId =
    typeof requestData.intentId === "string" ? requestData.intentId : "";
  if (!message || !signature) {
    throw new HttpsError(
      "invalid-argument",
      "message and signature are required.",
    );
  }
  if (!intentId) {
    throw new HttpsError("invalid-argument", "intentId is required.");
  }
  const resolvedOpId = opId || (intentId ? `intent:${intentId}` : undefined);
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
  const expectedNonce =
    intent && typeof intent.nonce === "string" ? intent.nonce : "";
  if (!expectedNonce) {
    throw new HttpsError("failed-precondition", "intent-invalid");
  }

  if (
    !fields.success ||
    fields.data.nonce !== expectedNonce ||
    fields.data.statement !== "mons ftw"
  ) {
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
