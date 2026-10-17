import type { ProfileLinkCatchupInvalidEntry } from "../src/profileLinkCatchupD1.ts";
import type {
  InvalidRatingRecoveryEntry,
  RatingRecoveryProjectionKind,
} from "../src/ratingContracts.ts";

export function recoveryCandidates<T>(
  values: readonly T[],
): Array<{ kind: "candidate"; value: T }> {
  return values.map((value) => ({ kind: "candidate", value }));
}

export function invalidRatingRecoveryEntry(
  projectionKind: RatingRecoveryProjectionKind,
): InvalidRatingRecoveryEntry {
  return {
    kind: "invalid",
    projectionKind,
    reason: "invalid-operation-id",
    observation: {
      keyBytes: Uint8Array.of(255),
      keyType: "text",
      revisionHex: "31",
      fields: [
        {
          storageType: "text",
          bytes: new TextEncoder().encode("private"),
          realValue: null,
        },
      ],
    },
  };
}

export function invalidProfileLinkRecoveryEntry(): ProfileLinkCatchupInvalidEntry {
  return {
    kind: "invalid",
    reason: "invalid-login-uid",
    observation: {
      keyBytes: Uint8Array.of(255),
      keyType: "text",
      revisionHex: "31",
      fields: [
        {
          storageType: "text",
          bytes: new TextEncoder().encode("private"),
          realValue: null,
        },
      ],
    },
  };
}
