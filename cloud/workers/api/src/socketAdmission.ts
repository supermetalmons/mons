import { isCanonicalLoginUid } from "./recordKeys.ts";
import { readSocketSession, type SocketSession } from "./socketSession.ts";
import type { SocketRole } from "./socketTags.ts";

type SocketAdmission = {
  role: SocketRole;
  ip: string;
  revision: number;
  passwordProtected: boolean;
  session: SocketSession;
};

export function readSocketAdmission(
  request: Request,
  options: {
    headerPrefix: "Match" | "Metadata" | "Wagers";
    protocol: string;
    actorUid: string | null;
  },
):
  | { status: "ok"; admission: SocketAdmission }
  | { status: "invalid" }
  | { status: "expired" } {
  const header = (field: string) =>
    request.headers.get(`X-Mons-${options.headerPrefix}-${field}`);
  const role = header("Role");
  const ip = header("IP") || "unknown";
  const revision = header("Revision");
  const protectedHeader = header("Protected");
  const authenticated = header("Authenticated");
  if (
    request.headers.get("Sec-WebSocket-Protocol") !== options.protocol ||
    (role !== "host" && role !== "guest" && role !== "spectator") ||
    ip.length > 64 ||
    !revision ||
    !/^[1-9]\d*$/.test(revision) ||
    !Number.isSafeInteger(Number(revision)) ||
    (protectedHeader !== "0" && protectedHeader !== "1") ||
    (authenticated !== "0" && authenticated !== "1") ||
    (role === "spectator"
      ? options.actorUid !== null
      : !isCanonicalLoginUid(options.actorUid))
  )
    return { status: "invalid" };
  const session = readSocketSession(request, authenticated === "1");
  if (!session) return { status: "expired" };
  return {
    status: "ok",
    admission: {
      role,
      ip,
      revision: Number(revision),
      passwordProtected: protectedHeader === "1",
      session,
    },
  };
}
