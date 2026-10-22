const noop = () => {};
const subscribe = () => noop;
const params = new URLSearchParams(location.search);

type XRedirectResult = {
  flowId: string;
  status: "ready" | "failed";
  errorCode: string;
  consentSource: "signin" | "settings";
};
export type XAuthUiFeedback = {
  target: "signin" | "settings";
  kind: "error" | "success";
  message: string;
};
type EventModalState = { isOpen: boolean; eventId: string | null };

export const environment = {
  connectCalls: [] as any[],
  verificationCalls: [] as any[],
  logins: [] as any[],
  authStatuses: [] as string[],
  linkedReads: 0,
  linkedMethods: { eth: false, sol: false, apple: false, x: false },
  hiddenCards: 0,
  providerReads: 0,
  xIntentCalls: [] as any[],
  xRedirectCalls: [] as any[],
  xPending: params.has("xPendingSource")
    ? ({
        flowId: "pending-flow",
        status: "ready",
        errorCode: "",
        consentSource: params.get("xPendingSource"),
      } as XRedirectResult)
    : null,
  xPendingListeners: new Set<(result: XRedirectResult | null) => void>(),
  xFeedback: params.has("xFeedbackTarget")
    ? ({
        target: params.get("xFeedbackTarget"),
        kind: params.get("xFeedbackKind") || "error",
        message: params.get("xFeedbackMessage") || "X callback failed.",
      } as XAuthUiFeedback)
    : null,
  xFeedbackListeners: new Set<(feedback: XAuthUiFeedback) => void>(),
  xFeedbackConsumed: 0,
  xFeedbackDeliveries: 0,
  xClearedResults: 0,
  eventModal: {
    isOpen: params.has("eventOpen"),
    eventId: params.has("eventOpen") ? "event-id" : null,
  } as EventModalState,
  eventModalListeners: new Set<(state: EventModalState) => void>(),
  wallets: [
    {
      info: { uuid: "one", rdns: "wallet.one", name: "Wallet One", icon: "" },
      provider: {},
    },
    {
      info: { uuid: "two", rdns: "wallet.two", name: "Wallet Two", icon: "" },
      provider: {},
    },
  ],
  timers: new Map<number, { callback: () => void; delay: number }>(),
};

const timeout = window.setTimeout.bind(window);
const clearTimeout = window.clearTimeout.bind(window);
let nextTimer = -1;
window.setTimeout = ((
  callback: TimerHandler,
  delay?: number,
  ...args: any[]
) => {
  if (
    [500, 650, 1500, 20_000].includes(delay ?? 0) &&
    typeof callback === "function"
  ) {
    const id = nextTimer--;
    environment.timers.set(id, {
      callback: () => callback(...args),
      delay: delay!,
    });
    return id;
  }
  return timeout(callback, delay, ...args);
}) as typeof window.setTimeout;
window.clearTimeout = (id) => {
  if (id !== undefined && id < 0) environment.timers.delete(id);
  else clearTimeout(id);
};

function defer(calls: any[], data: object) {
  return new Promise<any>((resolve, reject) =>
    calls.push({ ...data, resolve, reject }),
  );
}

export const connectToEthereumAndSign = (wallet: any) =>
  defer(environment.connectCalls, { method: "eth", wallet: wallet?.info.name });
export const connectToSolana = () =>
  defer(environment.connectCalls, { method: "sol" });
export const connection = {
  beginAuthIntent: (method: string) =>
    defer(environment.xIntentCalls, { method }),
  verifyEthAddress: (...args: any[]) =>
    defer(environment.verificationCalls, { method: "eth", args }),
  verifySolanaAddress: (...args: any[]) =>
    defer(environment.verificationCalls, { method: "sol", args }),
  getLinkedAuthMethods: async () => {
    environment.linkedReads += 1;
    return { linkedMethods: { ...environment.linkedMethods } };
  },
  isCurrentAuthUser: () => true,
};
export const handleLoginSuccess = (result: unknown) => {
  environment.logins.push(result);
  return true;
};
export const setAuthStatusGlobally = (status: string) =>
  environment.authStatuses.push(status);
export const storage = {
  getLoginId: () => "viewer",
  getProfileId: () => "profile",
  getUsername: () => "Player",
  getEthAddress: () => "",
  getSolAddress: () => "",
};
export const primeInjectedEthereumProviderDiscovery = noop;
export const listInjectedEthereumProviders = async () => {
  environment.providerReads += 1;
  return environment.wallets;
};
export const getInjectedWalletIconSrc = () => null;
export const useAppleAuthFlow = () => ({
  state: "idle",
  start: noop,
  resetUi: noop,
  invalidateAction: noop,
  clearIntent: noop,
});
export const clearAppleSignInTransientState = noop;
export const setPendingXRedirectResult = (result: XRedirectResult | null) => {
  environment.xPending = result;
  environment.xPendingListeners.forEach((listener) => listener(result));
};
export const clearConsumedXRedirectResult = () => {
  environment.xClearedResults += 1;
  setPendingXRedirectResult(null);
};
export const isXRedirectStartedError = (error: unknown) =>
  error instanceof Error && error.message === "x-redirect-started";
export const peekXRedirectResult = () => environment.xPending;
export const startXRedirectAuth = (options: object) =>
  defer(environment.xRedirectCalls, options);
export const subscribeToPendingXRedirectResult = (
  listener: (result: XRedirectResult | null) => void,
) => {
  environment.xPendingListeners.add(listener);
  listener(environment.xPending);
  return () => environment.xPendingListeners.delete(listener);
};
export const consumePendingXAuthUiFeedback = () => {
  const feedback = environment.xFeedback;
  environment.xFeedback = null;
  if (feedback) environment.xFeedbackConsumed += 1;
  return feedback;
};
export const subscribeToXAuthUiFeedback = (
  listener: (feedback: XAuthUiFeedback) => void,
) => {
  environment.xFeedbackListeners.add(listener);
  return () => environment.xFeedbackListeners.delete(listener);
};
export const publishXAuthUiFeedback = (feedback: XAuthUiFeedback) => {
  environment.xFeedback = feedback;
  if (environment.xFeedbackListeners.size === 0) return;
  environment.xFeedbackListeners.forEach((listener) => {
    environment.xFeedbackDeliveries += 1;
    listener(feedback);
  });
  environment.xFeedback = null;
};
export const markAuthNameCommitted = subscribe;
export const notifyVerifiedProfileNameCommitted = subscribe;
export const performLogoutCleanupAndReload = async () => {};
export const reloadAfterLogout = noop;
export const notifyOtherTabsAboutSignIn = noop;
export const resetNftCache = noop;
export const NameEditModal = () => null;
export const LogoutConfirmModal = () => null;
export const isMobile = new URLSearchParams(location.search).has("mobile");
export const defaultEarlyInputEventName = isMobile ? "touchstart" : "mousedown";
export const hideShinyCard = () => (environment.hiddenCards += 1);
export const showShinyCard = noop;
export const showsShinyCardSomewhere = false;
export const updateShinyCardDisplayName = noop;

export const EVENT_MODAL_AUTH_Z_INDEX = 100101;
export const getEventModalState = () => environment.eventModal;
export const subscribeToEventModalState = (
  listener: (state: EventModalState) => void,
) => {
  environment.eventModalListeners.add(listener);
  return () => environment.eventModalListeners.delete(listener);
};
export const setEventModalState = (isOpen: boolean) => {
  environment.eventModal = { isOpen, eventId: isOpen ? "event-id" : null };
  environment.eventModalListeners.forEach((listener) =>
    listener(environment.eventModal),
  );
};
