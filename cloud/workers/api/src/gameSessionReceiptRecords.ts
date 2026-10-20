import {
  isCreateInviteResponse,
  isEndRematchResponse,
  isEnsureMatchResponse,
  isJoinInviteResponse,
  isProposeRematchResponse,
} from "@mons/shared/game-sessions";
import { isStartAutomatchResponse } from "@mons/shared/navigation";
import type {
  AutomatchReceiptView,
  GameSessionMutationReceiptView,
} from "../../../runtime/automatchRecords.js";
import { isSafeRecordKey } from "./recordKeys.ts";

export type ReceiptRead<T> =
  { kind: "missing" } | { kind: "invalid" } | { kind: "valid"; value: T };

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function parseAutomatchReceipt(
  value: unknown,
): AutomatchReceiptView | null {
  const receipt = toRecord(value);
  const response = receipt?.response;
  const profileProjectionRequestId =
    receipt?.profileProjectionRequestId ?? null;
  if (
    receipt?.schemaVersion !== 1 ||
    receipt.kind !== "automatch-start" ||
    typeof receipt.completedAtMs !== "number" ||
    !Number.isFinite(receipt.completedAtMs) ||
    typeof receipt.emojiId !== "number" ||
    !Number.isSafeInteger(receipt.emojiId) ||
    typeof receipt.aura !== "string" ||
    typeof receipt.operationId !== "string" ||
    !isSafeRecordKey(receipt.operationId) ||
    typeof receipt.requesterUid !== "string" ||
    !receipt.requesterUid ||
    typeof receipt.inviteId !== "string" ||
    !isSafeRecordKey(receipt.inviteId) ||
    !(
      profileProjectionRequestId === null ||
      (typeof profileProjectionRequestId === "string" &&
        isSafeRecordKey(profileProjectionRequestId))
    ) ||
    typeof receipt.telegramProjection !== "boolean" ||
    !isStartAutomatchResponse(response) ||
    !response.ok ||
    response.inviteId !== receipt.inviteId
  ) {
    return null;
  }
  return {
    schemaVersion: 1,
    aura: receipt.aura,
    completedAtMs: Math.floor(receipt.completedAtMs),
    emojiId: receipt.emojiId,
    inviteId: receipt.inviteId,
    kind: "automatch-start",
    operationId: receipt.operationId,
    profileProjectionRequestId,
    requesterUid: receipt.requesterUid,
    response,
    telegramProjection: receipt.telegramProjection,
  };
}

export function parseGameSessionMutationReceipt(
  value: unknown,
): GameSessionMutationReceiptView | null {
  const record = toRecord(value);
  const response = record?.response;
  if (
    record?.schemaVersion !== 1 ||
    typeof record.completedAtMs !== "number" ||
    !Number.isFinite(record.completedAtMs) ||
    typeof record.fingerprint !== "string" ||
    typeof record.inviteId !== "string" ||
    typeof record.kind !== "string" ||
    typeof record.operationId !== "string" ||
    typeof record.requesterUid !== "string" ||
    !record.requesterUid ||
    !(
      record.projectionRequestId === null ||
      typeof record.projectionRequestId === "string"
    ) ||
    !(
      isCreateInviteResponse(response) ||
      isJoinInviteResponse(response) ||
      isProposeRematchResponse(response) ||
      isEndRematchResponse(response) ||
      isEnsureMatchResponse(response)
    )
  ) {
    return null;
  }
  return {
    schemaVersion: 1,
    completedAtMs: Math.floor(record.completedAtMs),
    fingerprint: record.fingerprint,
    inviteId: record.inviteId,
    kind: record.kind,
    operationId: record.operationId,
    projectionRequestId: record.projectionRequestId,
    requesterUid: record.requesterUid,
    response,
  };
}

function decodeReceipt<T>(
  raw: unknown,
  parse: (value: unknown) => T | null,
): ReceiptRead<T> {
  if (raw === null || raw === undefined) return { kind: "missing" };
  const value = parse(raw);
  return value === null ? { kind: "invalid" } : { kind: "valid", value };
}

export function decodeAutomatchReceipt(
  raw: unknown,
): ReceiptRead<AutomatchReceiptView> {
  return decodeReceipt(raw, parseAutomatchReceipt);
}

export function decodeGameSessionMutationReceipt(
  raw: unknown,
): ReceiptRead<GameSessionMutationReceiptView> {
  return decodeReceipt(raw, parseGameSessionMutationReceipt);
}
