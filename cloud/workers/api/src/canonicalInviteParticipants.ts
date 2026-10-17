import { isCanonicalLoginUid } from "./recordKeys.ts";

export type CanonicalInviteParticipantsReadResult =
  | { status: "missing" }
  | { status: "invalid" }
  | {
      status: "ok";
      source: Record<string, unknown>;
      hostId: string;
      guestId: string | null;
      passwordProtected: boolean;
    };

export function decodeCanonicalInviteParticipants(
  value: unknown,
): CanonicalInviteParticipantsReadResult {
  if (value === null || value === undefined) return { status: "missing" };
  if (typeof value !== "object" || Array.isArray(value)) {
    return { status: "invalid" };
  }
  const source = value as Record<string, unknown>;
  const hostId = source.hostId;
  const guestId = source.guestId ?? null;
  if (
    !isCanonicalLoginUid(hostId) ||
    (guestId !== null && (!isCanonicalLoginUid(guestId) || guestId === hostId))
  ) {
    return { status: "invalid" };
  }
  return {
    status: "ok",
    source,
    hostId,
    guestId,
    passwordProtected: Object.hasOwn(source, "password"),
  };
}
