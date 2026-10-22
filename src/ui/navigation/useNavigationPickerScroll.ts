import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type UIEvent,
} from "react";

const MIN_AUTO_LOAD_NEXT_PAGE_THRESHOLD_PX = 640;
const SELECTED_ITEM_VISIBILITY_MARGIN_PX = 8;

type NavigationPickerScrollOptions = {
  topGamesCount: number;
  pagedGamesCount: number;
  isGamesLoading: boolean;
  isLoadingMoreGames: boolean;
  hasMoreGames: boolean;
  onLoadMoreGames?: () => void;
};

export function useNavigationPickerScroll({
  topGamesCount,
  pagedGamesCount,
  isGamesLoading,
  isLoadingMoreGames,
  hasMoreGames,
  onLoadMoreGames,
}: NavigationPickerScrollOptions) {
  const scrollableListRef = useRef<HTMLDivElement>(null);
  const isAutoLoadPendingRef = useRef(false);
  const hasUserScrolledRef = useRef(false);
  const canRunOneFollowUpLoadRef = useRef(false);
  const hasResolvedInitialScrollPositionRef = useRef(false);
  const isIgnoringInitialProgrammaticScrollRef = useRef(false);

  const maybeLoadMoreGames = useCallback(
    (container: HTMLDivElement | null, source: "scroll" | "effect") => {
      if (
        !container ||
        !onLoadMoreGames ||
        !hasMoreGames ||
        isGamesLoading ||
        isLoadingMoreGames ||
        isAutoLoadPendingRef.current
      ) {
        return;
      }

      const isScrollable = container.scrollHeight > container.clientHeight + 1;
      if (!hasUserScrolledRef.current && isScrollable) {
        return;
      }

      if (
        hasUserScrolledRef.current &&
        source === "effect" &&
        !canRunOneFollowUpLoadRef.current
      ) {
        return;
      }

      const thresholdPx = Math.max(
        MIN_AUTO_LOAD_NEXT_PAGE_THRESHOLD_PX,
        container.clientHeight * 2,
      );
      const remainingScroll =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      if (remainingScroll > thresholdPx) {
        return;
      }

      if (source === "scroll" && hasUserScrolledRef.current) {
        canRunOneFollowUpLoadRef.current = true;
      } else if (source === "effect") {
        canRunOneFollowUpLoadRef.current = false;
      }

      isAutoLoadPendingRef.current = true;
      onLoadMoreGames();
    },
    [hasMoreGames, isGamesLoading, isLoadingMoreGames, onLoadMoreGames],
  );

  const handleScrollableListScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      if (isIgnoringInitialProgrammaticScrollRef.current) {
        isIgnoringInitialProgrammaticScrollRef.current = false;
        return;
      }

      if (event.currentTarget.scrollTop > 0) {
        hasUserScrolledRef.current = true;
      }
      maybeLoadMoreGames(event.currentTarget, "scroll");
    },
    [maybeLoadMoreGames],
  );

  useEffect(() => {
    if (!isLoadingMoreGames) {
      isAutoLoadPendingRef.current = false;
      maybeLoadMoreGames(scrollableListRef.current, "effect");
    }
  }, [isLoadingMoreGames, maybeLoadMoreGames]);

  useEffect(() => {
    maybeLoadMoreGames(scrollableListRef.current, "effect");
  }, [maybeLoadMoreGames, topGamesCount, pagedGamesCount]);

  useLayoutEffect(() => {
    if (hasResolvedInitialScrollPositionRef.current) {
      return;
    }

    hasResolvedInitialScrollPositionRef.current = true;

    const container = scrollableListRef.current;
    if (!container) {
      return;
    }

    const selectedElement =
      container.querySelector<HTMLElement>(
        "[data-navigation-selected-primary='true']",
      ) ??
      container.querySelector<HTMLElement>("[data-navigation-active='true']") ??
      container.querySelector<HTMLElement>("[data-navigation-selected='true']");
    if (!selectedElement) {
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const selectedRect = selectedElement.getBoundingClientRect();

    let nextScrollTop = container.scrollTop;
    const topLimit = containerRect.top + SELECTED_ITEM_VISIBILITY_MARGIN_PX;
    const bottomLimit =
      containerRect.bottom - SELECTED_ITEM_VISIBILITY_MARGIN_PX;

    if (selectedRect.top < topLimit) {
      nextScrollTop -= topLimit - selectedRect.top;
    } else if (selectedRect.bottom > bottomLimit) {
      nextScrollTop += selectedRect.bottom - bottomLimit;
    } else {
      return;
    }

    const maxScrollTop = Math.max(
      0,
      container.scrollHeight - container.clientHeight,
    );
    const clampedScrollTop = Math.max(0, Math.min(nextScrollTop, maxScrollTop));
    if (Math.abs(clampedScrollTop - container.scrollTop) < 1) {
      return;
    }

    isIgnoringInitialProgrammaticScrollRef.current = true;
    container.scrollTop = clampedScrollTop;

    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        isIgnoringInitialProgrammaticScrollRef.current = false;
      });
    } else {
      isIgnoringInitialProgrammaticScrollRef.current = false;
    }
  }, []);

  return { scrollableListRef, onScroll: handleScrollableListScroll };
}
