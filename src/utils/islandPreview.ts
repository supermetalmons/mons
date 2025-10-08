import { storage } from "./storage";

type Listener = (value: boolean) => void;

let islandPreviewEnabled = storage.getIslandPreviewEnabled(false);
const listeners: Listener[] = [];

export function getIslandPreviewEnabled(): boolean {
  return islandPreviewEnabled;
}

export function setIslandPreviewEnabled(value: boolean): void {
  islandPreviewEnabled = value;
  storage.setIslandPreviewEnabled(value);
  listeners.forEach((cb) => cb(value));
}

export function subscribeIslandPreview(cb: Listener): () => void {
  listeners.push(cb);
  return () => {
    const idx = listeners.indexOf(cb);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}


