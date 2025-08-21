import { colors } from "../content/boardStyles";

export const RAINBOW_AURA_SCALE = 1.27;
export const RAINBOW_AURA_OFFSET_PERCENT = -13.5;
export const RAINBOW_AURA_BLUR_PX = 2;
export const RAINBOW_AURA_OPACITY = 0.99;

export function getRainbowAuraGradient(): string {
  const r: Record<string, string> = colors.rainbow as any;
  return `conic-gradient(${r[7]} 0deg, #0066ff 45deg, ${r[6]} 90deg, ${r[5]} 135deg, ${r[4]} 180deg, ${r[3]} 225deg, ${r[2]} 270deg, ${r[1]} 315deg, ${r[7]} 360deg)`;
}

export const RAINBOW_MASK_CSS_BASE = `-webkit-mask-size:100% 100%;mask-size:100% 100%;-webkit-mask-position:50% 50%;mask-position:50% 50%;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;`;

export function buildRainbowMaskImageCss(url: string): string {
  return `-webkit-mask-image:url(${url});mask-image:url(${url});`;
}

export function createRainbowAuraElements(): { background: HTMLDivElement; inner: HTMLDivElement } {
  const background = document.createElement("div");
  background.style.cssText = `position:absolute;z-index:1;width:${RAINBOW_AURA_SCALE * 100}%;height:${RAINBOW_AURA_SCALE * 100}%;top:${RAINBOW_AURA_OFFSET_PERCENT}%;left:${RAINBOW_AURA_OFFSET_PERCENT}%;filter:blur(${RAINBOW_AURA_BLUR_PX}px);opacity:${RAINBOW_AURA_OPACITY};pointer-events:none;visibility:hidden;overflow:visible;`;

  const inner = document.createElement("div");
  inner.style.cssText = `position:absolute;inset:0;background:${getRainbowAuraGradient()};${RAINBOW_MASK_CSS_BASE}pointer-events:none;overflow:visible;`;

  background.appendChild(inner);
  return { background, inner };
}

export function attachRainbowAura(container: HTMLElement): { background: HTMLDivElement; inner: HTMLDivElement } {
  const { background, inner } = createRainbowAuraElements();
  container.appendChild(background);
  return { background, inner };
}

export function setRainbowAuraMask(inner: HTMLElement, src: string): void {
  inner.style.setProperty("-webkit-mask-image", `url(${src})`);
  inner.style.setProperty("mask-image", `url(${src})`);
}

export function showRainbowAura(background: HTMLElement): void {
  background.style.visibility = "visible";
}

export function hideRainbowAura(background: HTMLElement): void {
  background.style.visibility = "hidden";
}
