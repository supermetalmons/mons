import React, { useEffect, useRef, useState } from "react";
import { isMobile } from "../utils/misc";
import type { BotStrengthControlOverlayState } from "./boardPlayerInfoLayout";

const BOT_STRENGTH_IGNORE_MOUSE_AFTER_TOUCH_MS = 700;

type BotStrengthControlProps = {
  overlay: BotStrengthControlOverlayState;
  prefersDarkMode: boolean;
  onActivate: () => void;
};

export const BotStrengthControl = ({
  overlay,
  prefersDarkMode,
  onActivate,
}: BotStrengthControlProps) => {
  const [botStrengthHovered, setBotStrengthHovered] = useState(false);
  const [botStrengthPressed, setBotStrengthPressed] = useState(false);
  const botStrengthIgnoreMouseUntilRef = useRef(0);

  useEffect(() => {
    if (!botStrengthPressed) {
      return;
    }
    const clearPressed = () => {
      setBotStrengthPressed(false);
    };
    window.addEventListener("touchend", clearPressed, { passive: true });
    window.addEventListener("touchcancel", clearPressed, { passive: true });
    window.addEventListener("mouseup", clearPressed);
    window.addEventListener("blur", clearPressed);
    return () => {
      window.removeEventListener("touchend", clearPressed);
      window.removeEventListener("touchcancel", clearPressed);
      window.removeEventListener("mouseup", clearPressed);
      window.removeEventListener("blur", clearPressed);
    };
  }, [botStrengthPressed]);

  useEffect(() => {
    if (!overlay.visible) {
      setBotStrengthHovered(false);
      setBotStrengthPressed(false);
    }
  }, [overlay.visible]);

  const botStrengthModeLabel =
    overlay.mode === "fast"
      ? "Fast"
      : overlay.mode === "pro"
        ? "Pro"
        : "Normal";
  const botStrengthVisibleGyrusCount =
    overlay.mode === "fast" ? 1 : overlay.mode === "normal" ? 2 : 3;
  const botStrengthSizePx = overlay.size * 100;
  const botStrengthXpx = overlay.x * 100;
  const botStrengthYpx = overlay.y * 100;
  const botStrengthIconSizePx = botStrengthSizePx * 0.75;
  const botStrengthIconOffsetPx =
    (botStrengthSizePx - botStrengthIconSizePx) / 2;
  const botStrengthIconScale = botStrengthIconSizePx / 24;
  const botStrengthStroke = Math.max(
    0.8,
    Math.min(1.5, botStrengthSizePx * 0.042),
  );
  const isBotStrengthDark = prefersDarkMode;
  const canUseFinePointerHover = window.matchMedia(
    "(hover: hover) and (pointer: fine)",
  ).matches;
  const shouldShowBotStrengthInteractionFill = !isMobile;
  const showBotStrengthHover =
    shouldShowBotStrengthInteractionFill &&
    canUseFinePointerHover &&
    botStrengthHovered;
  const showBotStrengthPressed =
    shouldShowBotStrengthInteractionFill && botStrengthPressed;
  const botStrengthFill = isBotStrengthDark
    ? showBotStrengthPressed
      ? "var(--color-gray-55)"
      : showBotStrengthHover
        ? "var(--color-gray-44)"
        : "var(--color-gray-33)"
    : showBotStrengthPressed
      ? "var(--color-gray-d0)"
      : showBotStrengthHover
        ? "var(--color-gray-e0)"
        : "var(--color-gray-f0)";
  const botStrengthColor = isBotStrengthDark
    ? "var(--color-blue-primary-dark)"
    : "var(--color-blue-primary)";
  const markBotStrengthTouchInteraction = () => {
    botStrengthIgnoreMouseUntilRef.current =
      Date.now() + BOT_STRENGTH_IGNORE_MOUSE_AFTER_TOUCH_MS;
  };
  const shouldIgnoreBotStrengthMouseEvent = () =>
    Date.now() < botStrengthIgnoreMouseUntilRef.current;
  const handleBotStrengthMouseEnter = () => {
    if (!canUseFinePointerHover) {
      return;
    }
    if (shouldIgnoreBotStrengthMouseEvent()) {
      return;
    }
    setBotStrengthHovered(true);
  };
  const handleBotStrengthPointerDown = (event: React.SyntheticEvent) => {
    event.stopPropagation();
    if (event.type === "touchstart") {
      markBotStrengthTouchInteraction();
      setBotStrengthHovered(false);
      setBotStrengthPressed(false);
      return;
    } else if (event.type === "mousedown" && !canUseFinePointerHover) {
      return;
    } else if (
      event.type === "mousedown" &&
      shouldIgnoreBotStrengthMouseEvent()
    ) {
      return;
    }
    setBotStrengthPressed(true);
  };
  const handleBotStrengthPointerUp = (event: React.SyntheticEvent) => {
    event.stopPropagation();
    if (event.type === "touchend") {
      markBotStrengthTouchInteraction();
      setBotStrengthHovered(false);
      setBotStrengthPressed(false);
      return;
    } else if (event.type === "mouseup" && !canUseFinePointerHover) {
      return;
    } else if (
      event.type === "mouseup" &&
      shouldIgnoreBotStrengthMouseEvent()
    ) {
      return;
    }
    setBotStrengthPressed(false);
  };
  const handleBotStrengthPointerLeave = () => {
    setBotStrengthHovered(false);
    setBotStrengthPressed(false);
  };
  const handleBotStrengthTouchCancel = () => {
    markBotStrengthTouchInteraction();
    handleBotStrengthPointerLeave();
  };
  const handleBotStrengthControlClick = (event: React.SyntheticEvent) => {
    event.stopPropagation();
    if (event.cancelable) {
      event.preventDefault();
    }
    onActivate();
  };

  const isVisible = overlay.visible && overlay.size > 0;
  if (!isVisible) {
    return null;
  }

  return (
    <g
      transform={`translate(${botStrengthXpx} ${botStrengthYpx})`}
      style={{ pointerEvents: "all", cursor: "pointer" }}
      role="button"
      aria-label={`Bot strength: ${botStrengthModeLabel}`}
      onMouseEnter={handleBotStrengthMouseEnter}
      onMouseLeave={handleBotStrengthPointerLeave}
      onMouseDown={handleBotStrengthPointerDown}
      onMouseUp={handleBotStrengthPointerUp}
      onTouchStart={handleBotStrengthPointerDown}
      onTouchEnd={handleBotStrengthPointerUp}
      onTouchCancel={handleBotStrengthTouchCancel}
      onClick={!isMobile ? handleBotStrengthControlClick : undefined}
      onTouchEndCapture={isMobile ? handleBotStrengthControlClick : undefined}
    >
      <rect
        x={0}
        y={0}
        width={botStrengthSizePx}
        height={botStrengthSizePx}
        rx={botStrengthSizePx / 2}
        ry={botStrengthSizePx / 2}
        fill={botStrengthFill}
        stroke="none"
      />
      <g
        transform={`translate(${botStrengthIconOffsetPx} ${botStrengthIconOffsetPx}) scale(${botStrengthIconScale})`}
        fill="none"
        stroke={botStrengthColor}
        strokeWidth={botStrengthStroke}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 5v13" />
        <path d="M17.6 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.6 1.5" />
        <path d="M18 5.1a4 4 0 0 1 2.5 5.8" />
        <path d="M18 18a4 4 0 0 0 2-7.5" />
        <path d="M6 5.1a4 4 0 0 0-2.5 5.8" />
        <path d="M6 18a4 4 0 0 1-2-7.5" />
        <path d="M20 17.5A4 4 0 1 1 12 18a4 4 0 1 1-8-.5" />
        {botStrengthVisibleGyrusCount >= 1 && (
          <path d="M12 8c1.5-1 3.5-1 5 0 M12 12.5c-1.5.8-3.5.8-5 0" />
        )}
        {botStrengthVisibleGyrusCount >= 2 && (
          <path d="M12 9.5c-1.5-.8-3.5-.8-5 0 M12 14c2 .8 4 .8 5.5 0" />
        )}
        {botStrengthVisibleGyrusCount >= 3 && (
          <path d="M12 11c2-.7 4-.7 5.5 0 M12 15.5c-1.5.7-3 .7-4.5 0" />
        )}
      </g>
    </g>
  );
};
