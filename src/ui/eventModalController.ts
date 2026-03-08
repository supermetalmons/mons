export type EventModalState = {
  isOpen: boolean;
  eventId: string | null;
  restoreHomeOnClose: boolean;
};

type EventModalListener = (state: EventModalState) => void;

let state: EventModalState = {
  isOpen: false,
  eventId: null,
  restoreHomeOnClose: false,
};

const listeners = new Set<EventModalListener>();

const emit = () => {
  listeners.forEach((listener) => {
    try {
      listener(state);
    } catch {}
  });
};

export const getEventModalState = (): EventModalState => {
  return state;
};

export const subscribeToEventModalState = (listener: EventModalListener): (() => void) => {
  listeners.add(listener);
  listener(state);
  return () => {
    listeners.delete(listener);
  };
};

export const openEventModal = (eventId: string, options?: { restoreHomeOnClose?: boolean }): void => {
  const normalizedEventId = typeof eventId === "string" ? eventId.trim() : "";
  if (!normalizedEventId) {
    return;
  }
  state = {
    isOpen: true,
    eventId: normalizedEventId,
    restoreHomeOnClose: options?.restoreHomeOnClose === true,
  };
  emit();
};

export const closeEventModal = async (options?: { skipHomeTransition?: boolean }): Promise<void> => {
  const shouldRestoreHome = state.isOpen && state.restoreHomeOnClose && options?.skipHomeTransition !== true;
  state = {
    isOpen: false,
    eventId: null,
    restoreHomeOnClose: false,
  };
  emit();
  if (!shouldRestoreHome) {
    return;
  }
  const appSessionManager = await import("../session/AppSessionManager");
  await appSessionManager.transitionToHome();
};

export const hasEventModalVisible = (): boolean => {
  return state.isOpen && !!state.eventId;
};
