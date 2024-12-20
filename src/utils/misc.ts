export const isDesktopSafari = (() => {
  const userAgent = window.navigator.userAgent;
  const isSafari = /^((?!chrome|android).)*safari/i.test(userAgent);
  const isIos = /iPad|iPhone|iPod/.test(userAgent);
  return isSafari && !isIos;
})();

let isMobileBasedOnUserAgentData = false;
if ((navigator as any).userAgentData && typeof (navigator as any).userAgentData.mobile === "boolean") {
  isMobileBasedOnUserAgentData = (navigator as any).userAgentData.mobile;
}

const isTouchDevice: boolean = (() => {
  const hasTouchSupport = "ontouchstart" in window || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) || ((navigator as any).msMaxTouchPoints && (navigator as any).msMaxTouchPoints > 0);
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  return Boolean(hasTouchSupport && coarsePointer);
})();

export const isMobile = /iPhone|iPad|iPod|Android|Windows Phone|IEMobile|Mobile|Opera Mini/i.test(navigator.userAgent) || isTouchDevice || isMobileBasedOnUserAgentData;
export const isMobileOrVision = /iPhone|iPad|iPod|Android|Windows Phone|IEMobile|Mobile|Opera Mini|visionOS/i.test(navigator.userAgent) || isTouchDevice || isMobileBasedOnUserAgentData;

export const defaultInputEventName = isMobile ? "touchstart" : "click";

export const isModernAndPowerful = (() => {
  // TODO: come up with a way to return false when needed to make the game work properly on kindle
  return true;
})();

export function generateNewInviteId(): string {
  const letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let id = "";
  for (let i = 0; i < 11; i++) {
    id += letters.charAt(Math.floor(Math.random() * letters.length));
  }
  return id;
}
