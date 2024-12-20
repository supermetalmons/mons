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

if ((navigator as any).userAgentData && (navigator as any).userAgentData.platform) {
  const platform = (navigator as any).userAgentData.platform.toLowerCase();
  const isMobileBasedOnPlatform = platform.includes("android") || platform.includes("ios") || platform.includes("iphone") || platform.includes("ipad") || platform.includes("ipod");
  if (isMobileBasedOnPlatform) {
    isMobileBasedOnUserAgentData = true;
  }
}

const isTouchDevice: boolean = (() => {
  const hasTouchSupport = "ontouchstart" in window || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) || ((navigator as any).msMaxTouchPoints && (navigator as any).msMaxTouchPoints > 0);
  return Boolean(hasTouchSupport);
})();

export const isMobile = isMobileBasedOnUserAgentData || isTouchDevice || /iPhone|iPad|iPod|Android|Windows Phone|IEMobile|Mobile|Opera Mini/i.test(navigator.userAgent);
export const isMobileOrVision = isMobileBasedOnUserAgentData || isTouchDevice || /iPhone|iPad|iPod|Android|Windows Phone|IEMobile|Mobile|Opera Mini|visionOS/i.test(navigator.userAgent);

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
