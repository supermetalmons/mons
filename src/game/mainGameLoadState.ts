type Listener = () => void;

let loaded = false;
const listeners: Listener[] = [];

export function isMainGameLoaded() {
  return loaded;
}

export function markMainGameLoaded() {
  if (loaded) {
    return;
  }
  loaded = true;
  const pending = listeners.slice();
  listeners.length = 0;
  for (const listener of pending) {
    listener();
  }
}

export function onMainGameLoaded(listener: Listener) {
  if (loaded) {
    listener();
    return () => {};
  }
  listeners.push(listener);
  return () => {
    const index = listeners.indexOf(listener);
    if (index !== -1) {
      listeners.splice(index, 1);
    }
  };
}

