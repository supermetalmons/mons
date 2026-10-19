import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { defaultEarlyInputEventName } from "../../utils/misc";
import { didDismissSomethingWithOutsideTapJustNow } from "./outsideTapState";

export type TopRightPopoverName = "info" | "more" | "music" | "inventory";

const FOCUS_CLAIMING_TARGET_SELECTOR =
  "a[href], area[href], button:not([disabled]), input:not([disabled]), " +
  "select:not([disabled]), textarea:not([disabled]), summary, iframe, " +
  "audio[controls], video[controls], label, [tabindex], " +
  "[contenteditable]:not([contenteditable='false'])";

interface UseTopRightPopoverOptions {
  isVisible: boolean;
  isAuthenticated: boolean;
  onBeforeOpen: () => void;
}

const getVisibleTopRightPopover = (
  activePopover: TopRightPopoverName | null,
  isVisible: boolean,
  isAuthenticated: boolean,
): TopRightPopoverName | null => {
  if (!isVisible) {
    return null;
  }
  if (activePopover === "music") {
    return "music";
  }
  if (activePopover === "inventory") {
    return "inventory";
  }
  if (activePopover === "more" && isAuthenticated) {
    return "more";
  }
  if (activePopover === "info" && !isAuthenticated) {
    return "info";
  }
  return null;
};

export const useTopRightPopover = ({
  isVisible,
  isAuthenticated,
  onBeforeOpen,
}: UseTopRightPopoverOptions) => {
  const [activePopover, setActivePopover] =
    useState<TopRightPopoverName | null>(null);
  const visiblePopover = getVisibleTopRightPopover(
    activePopover,
    isVisible,
    isAuthenticated,
  );
  const visiblePopoverRef = useRef(visiblePopover);
  const primaryButtonRef = useRef<HTMLButtonElement>(null);
  const musicButtonRef = useRef<HTMLButtonElement>(null);
  const gemButtonRef = useRef<HTMLButtonElement>(null);
  const infoRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const musicRef = useRef<HTMLDivElement>(null);
  const inventoryRef = useRef<HTMLDivElement>(null);
  const musicFirstControlRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    visiblePopoverRef.current = visiblePopover;
  }, [visiblePopover]);

  const updateActivePopover = useCallback(
    (nextPopover: TopRightPopoverName | null) => {
      visiblePopoverRef.current = getVisibleTopRightPopover(
        nextPopover,
        isVisible,
        isAuthenticated,
      );
      setActivePopover(nextPopover);
    },
    [isAuthenticated, isVisible],
  );

  const closePopover = useCallback(() => {
    updateActivePopover(null);
  }, [updateActivePopover]);

  const hasVisiblePopover = useCallback(
    () => visiblePopoverRef.current !== null,
    [],
  );

  useEffect(() => {
    if (activePopover !== null && visiblePopover === null) {
      updateActivePopover(null);
    }
  }, [activePopover, updateActivePopover, visiblePopover]);

  useEffect(() => {
    if (visiblePopover === null) {
      return;
    }
    let focusTarget: HTMLElement | null;
    if (visiblePopover === "info") {
      focusTarget = infoRef.current;
    } else if (visiblePopover === "more") {
      focusTarget = moreRef.current;
    } else if (visiblePopover === "inventory") {
      focusTarget = inventoryRef.current;
    } else {
      focusTarget = musicFirstControlRef.current;
    }
    if (!focusTarget) {
      return;
    }
    const animationFrame = window.requestAnimationFrame(() => {
      focusTarget.focus({ preventScroll: true });
    });
    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [visiblePopover]);

  useEffect(() => {
    if (visiblePopover === null) {
      return;
    }
    const openPopover = visiblePopover;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      updateActivePopover(null);
      window.requestAnimationFrame(() => {
        const trigger =
          openPopover === "music"
            ? musicButtonRef.current
            : openPopover === "inventory"
              ? gemButtonRef.current
              : primaryButtonRef.current;
        trigger?.focus({ preventScroll: true });
      });
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [updateActivePopover, visiblePopover]);

  useEffect(() => {
    if (visiblePopover === null) {
      return;
    }
    const openPopover = visiblePopover;
    const handleTapOutside = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      const targetElement =
        target instanceof Element ? target : target.parentElement;
      if (
        openPopover === "inventory" &&
        targetElement?.closest('[data-inventory-item-preview="true"]')
      ) {
        return;
      }
      const popover =
        openPopover === "info"
          ? infoRef.current
          : openPopover === "more"
            ? moreRef.current
            : openPopover === "inventory"
              ? inventoryRef.current
              : musicRef.current;
      const trigger =
        openPopover === "music"
          ? musicButtonRef.current
          : openPopover === "inventory"
            ? gemButtonRef.current
            : primaryButtonRef.current;
      if (popover && !popover.contains(target) && !trigger?.contains(target)) {
        const targetClaimsFocus =
          target instanceof Element &&
          target.closest(FOCUS_CLAIMING_TARGET_SELECTOR) !== null;
        const hadPopoverFocus = popover.contains(document.activeElement);
        didDismissSomethingWithOutsideTapJustNow();
        updateActivePopover(null);
        if (hadPopoverFocus) {
          window.requestAnimationFrame(() => {
            const activeElement = document.activeElement;
            if (
              (event.defaultPrevented || !targetClaimsFocus) &&
              (activeElement === null ||
                activeElement === document.body ||
                popover.contains(activeElement)) &&
              trigger?.isConnected
            ) {
              trigger.focus({ preventScroll: true });
            }
          });
        }
      }
    };

    document.addEventListener(defaultEarlyInputEventName, handleTapOutside);
    return () => {
      document.removeEventListener(
        defaultEarlyInputEventName,
        handleTapOutside,
      );
    };
  }, [updateActivePopover, visiblePopover]);

  const togglePopover = (
    popover: TopRightPopoverName,
    event: MouseEvent<HTMLButtonElement>,
  ) => {
    event.stopPropagation();
    if (visiblePopover === popover) {
      updateActivePopover(null);
      return;
    }
    onBeforeOpen();
    updateActivePopover(popover);
  };

  const dismissInventory = () => {
    didDismissSomethingWithOutsideTapJustNow();
    updateActivePopover(null);
    window.requestAnimationFrame(() => {
      gemButtonRef.current?.focus({ preventScroll: true });
    });
  };

  return {
    visiblePopover,
    primaryButtonRef,
    musicButtonRef,
    gemButtonRef,
    infoRef,
    moreRef,
    musicRef,
    inventoryRef,
    musicFirstControlRef,
    togglePopover,
    closePopover,
    dismissInventory,
    hasVisiblePopover,
  };
};
