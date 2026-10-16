export type SocketChannel = "reaction" | "metadata" | "wagers" | "matches";
export type SocketRole = "host" | "guest" | "spectator";

const SOCKET_TAGS = {
  reaction: {
    channelTag: null,
    rolePrefix: "role",
    spectatorIpPrefix: "spectator-ip",
  },
  metadata: {
    channelTag: "channel:metadata",
    rolePrefix: "metadata-role",
    spectatorIpPrefix: "metadata-ip",
  },
  wagers: {
    channelTag: "channel:wagers",
    rolePrefix: "wagers-role",
    spectatorIpPrefix: "wagers-ip",
  },
  matches: {
    channelTag: "channel:matches",
    rolePrefix: "match-role",
    spectatorIpPrefix: "match-ip",
  },
} as const satisfies Record<
  SocketChannel,
  {
    channelTag: string | null;
    rolePrefix: string;
    spectatorIpPrefix: string;
  }
>;

export const PARTICIPANT_SOCKET_TAGS: readonly string[] = Object.values(
  SOCKET_TAGS,
).flatMap(({ rolePrefix }) => [`${rolePrefix}:host`, `${rolePrefix}:guest`]);

const PARTICIPANT_TAG = new RegExp(
  `^(?:${PARTICIPANT_SOCKET_TAGS.join("|")})$`,
);

export function channelSocketTag(
  channel: Exclude<SocketChannel, "reaction">,
): string {
  return SOCKET_TAGS[channel].channelTag;
}

export function roleSocketTag(
  channel: SocketChannel,
  role: SocketRole,
): string {
  return `${SOCKET_TAGS[channel].rolePrefix}:${role}`;
}

export function spectatorIpSocketTag(
  channel: SocketChannel,
  ip: string,
): string {
  return `${SOCKET_TAGS[channel].spectatorIpPrefix}:${ip}`;
}

export function admissionSocketTags(
  channel: SocketChannel,
  role: SocketRole,
  ip: string,
): string[] {
  const { channelTag } = SOCKET_TAGS[channel];
  return [
    ...(channelTag === null ? [] : [channelTag]),
    roleSocketTag(channel, role),
    ...(role === "spectator" ? [spectatorIpSocketTag(channel, ip)] : []),
  ];
}

export function isParticipantSocketTag(tag: string): boolean {
  return PARTICIPANT_TAG.test(tag);
}
