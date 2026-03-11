import { storage } from "../utils/storage";

export const isDesktopSafari = (() => {
  const userAgent = window.navigator.userAgent;
  const isSafari = /^((?!chrome|android).)*safari/i.test(userAgent);
  const isIos = /iPad|iPhone|iPod/.test(userAgent);
  return isSafari && !isIos;
})();

const userAgent = navigator.userAgent;
// const isSurface = /Surface/i.test(userAgent) || (/Windows/i.test(userAgent) && (navigator as any).maxTouchPoints > 0);
// TODO: make inputs work properly on devices with both touch and mouse inputs like surface
export const isMobile =
  /iPhone|iPad|iPod|Android|Windows Phone|IEMobile|Mobile|Opera Mini/i.test(
    userAgent,
  );
export const isMobileOrVision = isMobile || /visionOS/i.test(userAgent);
export const defaultInputEventName = isMobile ? "touchstart" : "click";
export const defaultEarlyInputEventName = isMobile ? "touchstart" : "mousedown";

export function generateNewInviteId(): string {
  const letters =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let id = "";
  for (let i = 0; i < 11; i++) {
    id += letters.charAt(Math.floor(Math.random() * letters.length));
  }
  return id;
}

export function getStableRandomIdForOwnProfile(totalIdsCount: number): number {
  const profileId = storage.getProfileId("");
  return getStableRandomIdForProfileId(profileId, totalIdsCount);
}

export function getStableRandomIdForProfileId(
  profileId: string,
  totalIdsCount: number,
): number {
  let hash = 0;
  for (let i = 0; i < profileId.length; i++) {
    hash += profileId.charCodeAt(i);
  }
  const index = hash % totalIdsCount;
  return index;
}

export function getBuildInfo(): string {
  return process.env.REACT_APP_BUILD_DATETIME
    ? (() => {
        const date = new Date(
          Number(process.env.REACT_APP_BUILD_DATETIME) * 1000,
        );
        const weekDays = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
        const day = weekDays[date.getDay()];
        const hours = date.getHours().toString().padStart(2, "0");
        const minutes = date.getMinutes().toString().padStart(2, "0");
        return `build ${day} (${hours}:${minutes})`;
      })()
    : "local dev";
}
