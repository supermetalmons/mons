import {
  isMaterialName,
  normalizeCount,
  type MiningMaterialName,
} from "@mons/shared/mining";
import { isWagerAgreement, type WagerAgreement } from "@mons/shared/wagers";

export type RawWagerRecord = Record<string, unknown>;
export type WagerField<T> =
  | { kind: "absent"; raw: undefined; value: null }
  | { kind: "null"; raw: null; value: null }
  | { kind: "malformed"; raw: unknown; value: null; error?: unknown }
  | { kind: "valid"; raw: RawWagerRecord; value: T };

export type WagerCount =
  { kind: "valid"; value: number } | { kind: "malformed"; error: unknown };

function decodeCount(value: unknown): WagerCount {
  try {
    return { kind: "valid", value: normalizeCount(value) };
  } catch (error) {
    return { kind: "malformed", error };
  }
}

export function readWagerCount(
  view: { count: WagerCount } | null | undefined,
): number {
  if (!view) return 0;
  if (view.count.kind === "malformed") throw view.count.error;
  return view.count.value;
}

export type WagerProposal = {
  raw: RawWagerRecord;
  material: string;
  count: WagerCount;
  operationId: string;
  reservationOperationId: string;
};
export type WagerAgreementView = {
  raw: RawWagerRecord;
  material: string;
  count: WagerCount;
  proposerId: string;
  accepterId: string;
  agreement: WagerAgreement | null;
};
export type WagerAgreementOperation = {
  raw: RawWagerRecord;
  id: string;
  proposerOperationId: string;
  proposerReservedCount: number | null;
  reservationLineageVersion: number | null;
  reservationLineageReady: boolean;
  proposerReservationOperationIds: string[] | null;
  accepterReservationOperationIds: string[] | null;
};
export type WagerRemovalReceipt = {
  raw: RawWagerRecord;
  proposalOperationId: string;
  reservationOperationId: string;
};
export type WagerResolution = {
  raw: RawWagerRecord;
  winnerId: string;
  loserId: string;
  material: string;
  count: WagerCount;
};
export type WagerEntries<T> = {
  raw: RawWagerRecord;
  entries: Record<string, WagerField<T>>;
};
export type DecodedWager = {
  raw: unknown;
  record: RawWagerRecord | null;
  proposals: WagerField<WagerEntries<WagerProposal>>;
  proposedBy: WagerField<RawWagerRecord>;
  agreed: WagerField<WagerAgreementView>;
  agreementOperation: WagerField<WagerAgreementOperation>;
  proposalRemovalOperations: WagerField<WagerEntries<WagerRemovalReceipt>>;
  settlement: WagerField<WagerSettlement>;
  resolved: WagerField<WagerResolution>;
};

function toRecord(value: unknown): RawWagerRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RawWagerRecord)
    : null;
}
function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
function safeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value)
    ? value
    : null;
}
function decodeField<T>(
  value: unknown,
  parse: (value: unknown) => T | null,
): WagerField<T> {
  if (value === undefined)
    return { kind: "absent", raw: undefined, value: null };
  if (value === null) return { kind: "null", raw: null, value: null };
  const raw = toRecord(value);
  try {
    const parsed = raw ? parse(raw) : null;
    return parsed === null || !raw
      ? { kind: "malformed", raw: value, value: null }
      : { kind: "valid", raw, value: parsed };
  } catch (error) {
    return { kind: "malformed", raw: value, value: null, error };
  }
}
function recordView<T>(
  read: (raw: RawWagerRecord) => T,
): (value: unknown) => T | null {
  return (value) => {
    const raw = toRecord(value);
    return raw ? read(raw) : null;
  };
}
function recordFields<T>(
  read: (raw: RawWagerRecord) => T,
): (value: unknown) => WagerEntries<T> | null {
  return recordView((raw) => ({
    raw,
    entries: Object.fromEntries(
      Object.entries(raw).map(([key, value]) => [
        key,
        decodeField(value, recordView(read)),
      ]),
    ),
  }));
}
function proposalView(raw: RawWagerRecord): WagerProposal {
  return {
    raw,
    material: normalizeString(raw.material),
    count: decodeCount(raw.count),
    operationId: normalizeString(raw.operationId),
    reservationOperationId: normalizeString(raw.reservationOperationId),
  };
}
function agreementView(raw: RawWagerRecord): WagerAgreementView {
  return {
    raw,
    material: normalizeString(raw.material),
    count: decodeCount(raw.count),
    proposerId: normalizeString(raw.proposerId),
    accepterId: normalizeString(raw.accepterId),
    agreement: isWagerAgreement(raw) ? raw : null,
  };
}
function agreementOperationView(raw: RawWagerRecord): WagerAgreementOperation {
  return {
    raw,
    id: normalizeString(raw.id),
    proposerOperationId: normalizeString(raw.proposerOperationId),
    proposerReservedCount: safeInteger(raw.proposerReservedCount),
    reservationLineageVersion: safeInteger(raw.reservationLineageVersion),
    reservationLineageReady: raw.reservationLineageReady === true,
    proposerReservationOperationIds: parseReservationOperationIds(
      raw.proposerReservationOperationIds,
    ),
    accepterReservationOperationIds: parseReservationOperationIds(
      raw.accepterReservationOperationIds,
    ),
  };
}
function removalView(raw: RawWagerRecord): WagerRemovalReceipt {
  return {
    raw,
    proposalOperationId: normalizeString(raw.proposalOperationId),
    reservationOperationId: normalizeString(raw.reservationOperationId),
  };
}
function resolutionView(raw: RawWagerRecord): WagerResolution {
  return {
    raw,
    winnerId: normalizeString(raw.winnerId),
    loserId: normalizeString(raw.loserId),
    material: normalizeString(raw.material),
    count: decodeCount(raw.count),
  };
}

export function decodeWager(raw: unknown): DecodedWager | null {
  if (raw === null || raw === undefined) return null;
  const record = toRecord(raw);
  return {
    raw,
    record,
    proposals: decodeField(record?.proposals, recordFields(proposalView)),
    proposedBy: decodeField(record?.proposedBy, toRecord),
    agreed: decodeField(record?.agreed, recordView(agreementView)),
    agreementOperation: decodeField(
      record?.agreementOperation,
      recordView(agreementOperationView),
    ),
    proposalRemovalOperations: decodeField(
      record?.proposalRemovalOperations,
      recordFields(removalView),
    ),
    settlement: decodeField(record?.settlement, parseSettlement),
    resolved: decodeField(record?.resolved, recordView(resolutionView)),
  };
}
export function readWagerProposal(
  wager: DecodedWager | null,
  uid: string,
): WagerProposal | null {
  return wager?.proposals.value?.entries[uid]?.value ?? null;
}
export function readWagerRemovalReceipt(
  wager: DecodedWager | null,
  operationId: string,
): WagerRemovalReceipt | null {
  return (
    wager?.proposalRemovalOperations.value?.entries[operationId]?.value ?? null
  );
}
export function readStoredSettlement(
  wager: DecodedWager | null,
): WagerSettlement | null {
  if (wager?.settlement.kind === "malformed") {
    if ("error" in wager.settlement) throw wager.settlement.error;
    throw new Error("wager-settlement-malformed");
  }
  return wager?.settlement.value ?? null;
}
export function lineageFingerprint(wager: DecodedWager | null): string {
  const { reservationLineageReady: _ready, ...operation } =
    wager?.agreementOperation.value?.raw || {};
  return JSON.stringify([wager?.agreed.raw, operation]);
}

const SETTLEMENT_VERSION = 2;
export const WAGER_SETTLEMENT_INSUFFICIENT_MATERIALS_REASON =
  "insufficient-materials";

type WagerSettlementFailureReason =
  typeof WAGER_SETTLEMENT_INSUFFICIENT_MATERIALS_REASON;

export type SettlementRelease = {
  reservationOperationIds: string[];
  uid: string;
};

type SettlementBase = {
  claimedAtMs: number;
  completedAtMs: number | null;
  failureReason: WagerSettlementFailureReason | null;
  fingerprint: string;
  operationId: string;
  state: "completed" | "pending";
  version: typeof SETTLEMENT_VERSION;
};

type AgreedSettlement = SettlementBase & {
  count: number;
  kind: "agreed";
  loserProfileId: string;
  loserUid: string;
  material: MiningMaterialName;
  releases: SettlementRelease[];
  winnerProfileId: string;
  winnerUid: string;
};

type ProposalSettlement = SettlementBase & {
  kind: "proposals";
  releases: SettlementRelease[];
};

export type WagerSettlement = AgreedSettlement | ProposalSettlement;

function parseReservationOperationIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const operationIds = value.map(normalizeString);
  return operationIds.length > 0 &&
    operationIds.every(
      (operationId, index) =>
        /^[a-f0-9]{64}$/.test(operationId) &&
        operationIds.indexOf(operationId) === index,
    )
    ? operationIds
    : null;
}

function parseRelease(value: unknown): SettlementRelease | null {
  const release = toRecord(value);
  const uid = normalizeString(release?.uid);
  const operationIds = parseReservationOperationIds(
    release?.reservationOperationIds,
  );
  return release &&
    Object.keys(release).length === 2 &&
    Object.hasOwn(release, "uid") &&
    Object.hasOwn(release, "reservationOperationIds") &&
    uid &&
    operationIds
    ? { uid, reservationOperationIds: operationIds }
    : null;
}

function parseSettlement(value: unknown): WagerSettlement | null {
  const settlement = toRecord(value);
  const state = settlement?.state;
  const completedAtMs = settlement?.completedAtMs;
  const failureReason = settlement?.failureReason;
  if (
    settlement?.version !== SETTLEMENT_VERSION ||
    (state !== "pending" && state !== "completed") ||
    typeof settlement.fingerprint !== "string" ||
    !settlement.fingerprint ||
    typeof settlement.operationId !== "string" ||
    !settlement.operationId ||
    !Number.isSafeInteger(settlement.claimedAtMs) ||
    (completedAtMs !== undefined &&
      completedAtMs !== null &&
      !Number.isSafeInteger(completedAtMs)) ||
    (failureReason !== undefined &&
      failureReason !== null &&
      failureReason !== WAGER_SETTLEMENT_INSUFFICIENT_MATERIALS_REASON) ||
    (state === "pending" &&
      failureReason !== undefined &&
      failureReason !== null) ||
    (state === "completed" && !Number.isSafeInteger(completedAtMs))
  ) {
    return null;
  }
  const base: SettlementBase = {
    version: SETTLEMENT_VERSION,
    state,
    fingerprint: settlement.fingerprint,
    operationId: settlement.operationId,
    claimedAtMs: Number(settlement.claimedAtMs),
    completedAtMs: Number.isSafeInteger(completedAtMs)
      ? Number(completedAtMs)
      : null,
    failureReason:
      failureReason === WAGER_SETTLEMENT_INSUFFICIENT_MATERIALS_REASON
        ? failureReason
        : null,
  };
  if (settlement.kind === "agreed") {
    const winnerUid = normalizeString(settlement.winnerUid);
    const loserUid = normalizeString(settlement.loserUid);
    const winnerProfileId = normalizeString(settlement.winnerProfileId);
    const loserProfileId = normalizeString(settlement.loserProfileId);
    const material = normalizeString(settlement.material);
    const count = normalizeCount(settlement.count);
    const storedReleases = settlement.releases;
    const releases = Array.isArray(storedReleases)
      ? storedReleases.map(parseRelease)
      : [null];
    return winnerUid &&
      loserUid &&
      winnerProfileId &&
      loserProfileId &&
      isMaterialName(material) &&
      count > 0 &&
      releases.length === 2 &&
      releases.every((release) => release !== null)
      ? {
          ...base,
          kind: "agreed",
          winnerUid,
          loserUid,
          winnerProfileId,
          loserProfileId,
          material,
          count,
          releases: releases.filter(
            (release): release is SettlementRelease => release !== null,
          ),
        }
      : null;
  }
  const storedReleases = settlement.releases ?? [];
  if (
    settlement.kind !== "proposals" ||
    !Array.isArray(storedReleases) ||
    base.failureReason
  ) {
    return null;
  }
  const releases = storedReleases.map(parseRelease);
  if (releases.some((release) => release === null)) {
    return null;
  }
  return {
    ...base,
    kind: "proposals",
    releases: releases.filter(
      (release): release is SettlementRelease => release !== null,
    ),
  };
}

function referencedOperationIds(value: unknown): string[] {
  return Array.isArray(value) ? value.map(normalizeString).filter(Boolean) : [];
}
export function wagerReferencesReservationOperation(
  wager: DecodedWager | null,
  playerUid: string,
  reservationOperationId: string,
): boolean {
  const proposal = readWagerProposal(wager, playerUid);
  const operation = wager?.agreementOperation.value;
  const settlement = toRecord(wager?.settlement.raw);
  const settlementReferences =
    Array.isArray(settlement?.releases) &&
    settlement.releases.some((value) => {
      const release = toRecord(value);
      return (
        normalizeString(release?.uid) === playerUid &&
        referencedOperationIds(release?.reservationOperationIds).includes(
          reservationOperationId,
        )
      );
    });
  return Boolean(
    proposal?.reservationOperationId === reservationOperationId ||
    referencedOperationIds(
      operation?.raw.accepterReservationOperationIds,
    ).includes(reservationOperationId) ||
    referencedOperationIds(
      operation?.raw.proposerReservationOperationIds,
    ).includes(reservationOperationId) ||
    settlementReferences,
  );
}
