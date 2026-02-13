export type LifecycleCounterName =
  | "connectionObservers"
  | "connectionAuthSubscribers"
  | "boardDomListeners"
  | "boardIntervals"
  | "boardTimeouts"
  | "boardRaf"
  | "gameTimeouts"
  | "uiTimeouts";

type LifecycleCounters = Record<LifecycleCounterName, number>;

const counters: LifecycleCounters = {
  connectionObservers: 0,
  connectionAuthSubscribers: 0,
  boardDomListeners: 0,
  boardIntervals: 0,
  boardTimeouts: 0,
  boardRaf: 0,
  gameTimeouts: 0,
  uiTimeouts: 0,
};

export const incrementLifecycleCounter = (counter: LifecycleCounterName, amount = 1) => {
  counters[counter] += amount;
};

export const decrementLifecycleCounter = (counter: LifecycleCounterName, amount = 1) => {
  counters[counter] -= amount;
  if (process.env.NODE_ENV !== "production" && counters[counter] < 0) {
    console.warn("lifecycle-counter-negative", {
      counter,
      value: counters[counter],
    });
  }
};

export const setLifecycleCounter = (counter: LifecycleCounterName, value: number) => {
  counters[counter] = value;
};

export const resetLifecycleCounters = () => {
  (Object.keys(counters) as LifecycleCounterName[]).forEach((counter) => {
    counters[counter] = 0;
  });
};

export const getLifecycleCounters = (): LifecycleCounters => {
  return { ...counters };
};

