// Generated from src/automatchRecords.ts. Run npm run generate:runtime.
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emptyAutomatchEntryFields = emptyAutomatchEntryFields;
exports.decodeAutomatchEntry = decodeAutomatchEntry;
exports.decodeAutomatchEntries = decodeAutomatchEntries;
function storedString(value) {
  return typeof value === "string" ? value : "";
}
function finiteNumber(value) {
  const parsed =
    typeof value === "number" || typeof value === "string" ? Number(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}
function emptyAutomatchEntryFields() {
  return {
    uid: "",
    timestamp: 0,
    numericTimestamp: null,
    rating: 0,
    hostColor: "",
    password: "",
    gameVariant: "",
    telegramDeliveryVersion: null,
    display: {},
  };
}
function decodeAutomatchEntry(value) {
  const result = {
    isNull: value === null,
    isTruthy: Boolean(value),
    record: null,
  };
  if (!value || typeof value !== "object" || Array.isArray(value))
    return result;
  const entry = value;
  result.record = {
    uid: storedString(entry.uid),
    timestamp: finiteNumber(entry.timestamp),
    numericTimestamp:
      typeof entry.timestamp === "number" && Number.isFinite(entry.timestamp)
        ? entry.timestamp
        : null,
    rating: finiteNumber(entry.rating),
    hostColor: storedString(entry.hostColor),
    password: storedString(entry.password),
    gameVariant: storedString(entry.gameVariant),
    telegramDeliveryVersion: entry.telegramDeliveryVersion === 2 ? 2 : null,
    display: {
      username: entry.username,
      ethAddress: entry.ethAddress,
      solAddress: entry.solAddress,
      rating: entry.rating,
      emojiId: entry.emojiId,
    },
  };
  return result;
}
function decodeAutomatchEntries(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return Object.fromEntries(
    Object.entries(value).map(([inviteId, entry]) => [
      inviteId,
      decodeAutomatchEntry(entry),
    ]),
  );
}
