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