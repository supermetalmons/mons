import { storage } from "../utils/storage";

export const isDesktopSafari = (() => {
  const userAgent = window.navigator.userAgent;
  const isSafari = /^((?!chrome|android).)*safari/i.test(userAgent);
  const isIos = /iPad|iPhone|iPod/.test(userAgent);
  return isSafari && !isIos;
})();

export const isMobile = /iPhone|iPad|iPod|Android|Windows Phone|IEMobile|Mobile|Opera Mini/i.test(navigator.userAgent);
export const isMobileOrVision = /iPhone|iPad|iPod|Android|Windows Phone|IEMobile|Mobile|Opera Mini|visionOS/i.test(navigator.userAgent);
export const defaultInputEventName = isMobile ? "touchstart" : "click";
export const defaultEarlyInputEventName = isMobile ? "touchstart" : "mousedown";

export function generateNewInviteId(): string {
  const letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
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

export function getStableRandomIdForProfileId(profileId: string, totalIdsCount: number): number {
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
        const date = new Date(Number(process.env.REACT_APP_BUILD_DATETIME) * 1000);
        const year = date.getUTCFullYear().toString().slice(-2);
        const month = (date.getUTCMonth() + 1).toString().padStart(2, "0");
        const day = date.getUTCDate().toString().padStart(2, "0");
        const hours = date.getUTCHours().toString().padStart(2, "0");
        const minutes = date.getUTCMinutes().toString().padStart(2, "0");
        return `build ${year}.${month}.${day} (${hours}.${minutes})`;
      })()
    : "local dev";
}