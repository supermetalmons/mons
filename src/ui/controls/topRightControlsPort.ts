export type TopRightControlsApi = {
  close(): void;
  hasVisiblePopover(): boolean;
};

let api: TopRightControlsApi | null = null;

export const registerTopRightControlsApi = (
  nextApi: TopRightControlsApi,
): (() => void) => {
  api = nextApi;
  return () => {
    if (api === nextApi) {
      api = null;
    }
  };
};

export const closeTopRightPopover = (): void => {
  api?.close();
};

export const hasTopRightPopoverVisible = (): boolean =>
  api?.hasVisiblePopover() ?? false;
