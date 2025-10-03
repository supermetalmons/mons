export const ns = "http://www.w3.org/2000/svg";

export function setFrame(element: SVGElement, x: number, y: number, width: number, height: number): void {
  setFrameStr(element, (x * 100).toString(), (y * 100).toString(), (width * 100).toString(), (height * 100).toString());
}

export function setX(element: SVGElement, x: number): void {
  element.setAttribute("x", (x * 100).toString());
}

export function offsetX(element: SVGElement | undefined, delta: number): void {
  if (!element) return;
  element.setAttribute("x", (parseFloat(element.getAttribute("x") || "0") + delta * 100).toString());
}

export function setOrigin(element: SVGElement, x: number, y: number): void {
  setOriginStr(element, (x * 100).toString(), (y * 100).toString());
}

export function setSize(element: SVGElement, width: number, height: number): void {
  setSizeStr(element, (width * 100).toString(), (height * 100).toString());
}

export function setFrameStr(element: SVGElement, x: string, y: string, width: string, height: string): void {
  setOriginStr(element, x, y);
  setSizeStr(element, width, height);
}

export function setSizeStr(element: SVGElement, width: string, height: string): void {
  element.setAttribute("width", width);
  element.setAttribute("height", height);
}

export function setOriginStr(element: SVGElement, x: string, y: string): void {
  element.setAttribute("x", x);
  element.setAttribute("y", y);
}

export function circle(centerX: number, centerY: number, radius: number): SVGElement {
  const circle = document.createElementNS(ns, "circle");
  circle.setAttribute("cx", (centerX * 100).toString());
  circle.setAttribute("cy", (centerY * 100).toString());
  circle.setAttribute("r", (radius * 100).toString());
  return circle;
}

export function updateCircle(element: SVGElement, centerX: number, centerY: number, radius: number): void {
  element.setAttribute("cx", (centerX * 100).toString());
  element.setAttribute("cy", (centerY * 100).toString());
  element.setAttribute("r", (radius * 100).toString());
}

export function setOpacity(element: SVGElement, opacity: number) {
  element.setAttribute("opacity", opacity.toString());
}

export function setFill(element: SVGElement, fill: string = "white") {
  element.setAttribute("fill", fill);
}

export function setImage(element: SVGElement, data: string) {
  element.setAttributeNS("http://www.w3.org/1999/xlink", "href", `data:image/webp;base64,${data}`);
}

export async function setImageUrl(element: SVGElement, url: string) {
  element.setAttributeNS("http://www.w3.org/1999/xlink", "href", url);
}

export function setHidden(element: SVGElement, isHidden: boolean) {
  element.setAttribute("display", isHidden ? "none" : "");
}
