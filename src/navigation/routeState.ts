export type RouteMode = "home" | "invite" | "snapshot" | "watch";

export type RouteState = {
  mode: RouteMode;
  path: string;
  inviteId: string | null;
  snapshotId: string | null;
  autojoin: boolean;
};

const normalizePath = (rawPath: string): string => {
  return rawPath.replace(/^\/|\/$/g, "");
};

const decodeSnapshotId = (snapshotPath: string): string | null => {
  if (!snapshotPath.startsWith("snapshot/")) {
    return null;
  }
  const encoded = snapshotPath.substring("snapshot/".length);
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
};

export const parseRouteState = (pathname: string): RouteState => {
  const path = normalizePath(pathname);
  if (path === "") {
    return {
      mode: "home",
      path,
      inviteId: null,
      snapshotId: null,
      autojoin: false,
    };
  }
  if (path === "watch") {
    return {
      mode: "watch",
      path,
      inviteId: null,
      snapshotId: null,
      autojoin: false,
    };
  }
  if (path.startsWith("snapshot/")) {
    return {
      mode: "snapshot",
      path,
      inviteId: null,
      snapshotId: decodeSnapshotId(path),
      autojoin: false,
    };
  }
  return {
    mode: "invite",
    path,
    inviteId: path,
    snapshotId: null,
    autojoin: path.startsWith("auto_"),
  };
};

export const getCurrentRouteState = (): RouteState => {
  return parseRouteState(window.location.pathname);
};

export const getRoutePathForTarget = (target: RouteState): string => {
  if (target.mode === "home") {
    return "/";
  }
  if (target.mode === "watch") {
    return "/watch";
  }
  if (target.mode === "snapshot") {
    const encoded = encodeURIComponent(target.snapshotId ?? "");
    return `/snapshot/${encoded}`;
  }
  return `/${target.inviteId ?? ""}`;
};

