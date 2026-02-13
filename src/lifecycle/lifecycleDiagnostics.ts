export type LifecycleCounterName =
  | "connectionObservers"
  | "connectionAuthSubscribers"
  | "boardDomListeners"
  | "boardIntervals"
  | "boardTimeouts"
  | "boardRaf"
  | "gameTimeouts";

type LifecycleCounters = Record<LifecycleCounterName, number>;

const counters: LifecycleCounters = {
  connectionObservers: 0,
  connectionAuthSubscribers: 0,
  boardDomListeners: 0,
  boardIntervals: 0,
  boardTimeouts: 0,
  boardRaf: 0,
  gameTimeouts: 0,
};

const clamp = (value: number) => {
  return value < 0 ? 0 : value;
};

export const incrementLifecycleCounter = (counter: LifecycleCounterName, amount = 1) => {
  counters[counter] = clamp(counters[counter] + amount);
};

export const decrementLifecycleCounter = (counter: LifecycleCounterName, amount = 1) => {
  counters[counter] = clamp(counters[counter] - amount);
};

export const setLifecycleCounter = (counter: LifecycleCounterName, value: number) => {
  counters[counter] = clamp(value);
};

export const resetLifecycleCounters = () => {
  (Object.keys(counters) as LifecycleCounterName[]).forEach((counter) => {
    counters[counter] = 0;
  });
};

export const getLifecycleCounters = (): LifecycleCounters => {
  return { ...counters };
};

