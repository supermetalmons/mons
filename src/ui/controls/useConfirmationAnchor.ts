import { useCallback, useEffect, useState, type RefObject } from "react";

export const useConfirmationAnchor = ({
  isOpen,
  triggerRef,
  containerRef,
}: {
  isOpen: boolean;
  triggerRef: RefObject<HTMLButtonElement | null>;
  containerRef: RefObject<HTMLDivElement | null>;
}) => {
  const [left, setLeft] = useState<number | null>(null);
  const updatePosition = useCallback(() => {
    if (!triggerRef.current || !containerRef.current) return;
    const buttonRect = triggerRef.current.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();
    const center = buttonRect.left + buttonRect.width / 2 - containerRect.left;
    const padding = 16;
    const clampedCenter = Math.min(
      containerRect.width - padding,
      Math.max(padding, center),
    );
    setLeft(clampedCenter);
  }, [containerRef, triggerRef]);

  useEffect(() => {
    if (!isOpen) return;
    const frame = requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", updatePosition);
    };
  }, [isOpen, updatePosition]);

  return { left, updatePosition };
};
