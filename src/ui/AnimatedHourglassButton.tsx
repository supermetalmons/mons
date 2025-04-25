// AnimatedHourglassButton.tsx

import React, { useState, useEffect } from "react";
import { ControlButton } from "./BottomControlsStyles";

interface HourglassConfig {
  duration: number; // Total duration in seconds
  progress: number; // Initial progress in seconds
  requestDate: number;
}

interface AnimatedHourglassIconProps {
  config: HourglassConfig;
}

const AnimatedHourglassIcon: React.FC<AnimatedHourglassIconProps> = ({ config }) => {
  const { duration, progress, requestDate } = config;
  const [elapsedTime, setElapsedTime] = useState<number>(progress);

  useEffect(() => {
    let animationFrameId: number;
    const startTime = Date.now();

    const updateElapsedTime = () => {
      const currentTime = Date.now();
      const timeElapsed = progress + (currentTime - startTime) / 1000; // in seconds
      const clampedTime = Math.min(timeElapsed, duration);
      setElapsedTime(clampedTime);

      if (clampedTime < duration) {
        animationFrameId = requestAnimationFrame(updateElapsedTime);
      }
    };

    updateElapsedTime();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [duration, progress, requestDate]);

  // Calculate the progress ratio (0 to 1)
  const progressRatio = elapsedTime / duration;

  // For the top bulb sand
  const topSandHeight = 24 * (1 - progressRatio); // Decreases from 24 to 0
  const topSandY = 8 + 24 * progressRatio; // Moves down from y=8 to y=32

  // For the bottom bulb sand
  const bottomSandHeight = 24 * progressRatio; // Increases from 0 to 24
  const bottomSandY = 56 - bottomSandHeight; // Moves up from y=56 to y=32

  return (
    <svg width="64" height="64" viewBox="0 0 64 64" style={{ display: "block" }}>
      {/* Hourglass outline */}
      <path
        d="
          M16,8 H48
          M16,56 H48
          M16,8 L16,20 L32,32 L16,44 L16,56
          M48,8 L48,20 L32,32 L48,44 L48,56
        "
        stroke="currentColor"
        strokeWidth="4"
        fill="none"
      />

      {/* Top bulb sand */}
      <path d="M16,8 L48,8 L32,32 Z" fill="currentColor" clipPath="url(#top-sand-clip)" />
      {/* Clip path for top bulb sand */}
      <clipPath id="top-sand-clip">
        <rect x="0" y={topSandY} width="64" height={topSandHeight} />
      </clipPath>

      {/* Bottom bulb sand */}
      <path d="M16,56 L48,56 L32,32 Z" fill="currentColor" clipPath="url(#bottom-sand-clip)" />
      {/* Clip path for bottom bulb sand */}
      <clipPath id="bottom-sand-clip">
        <rect x="0" y={bottomSandY} width="64" height={bottomSandHeight} />
      </clipPath>
    </svg>
  );
};

interface AnimatedHourglassButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  config: HourglassConfig;
}

const AnimatedHourglassButton: React.FC<AnimatedHourglassButtonProps> = ({ config, onClick, ...props }) => {
  return (
    <ControlButton onClick={onClick} aria-label="Timer" {...props}>
      <AnimatedHourglassIcon config={config} />
    </ControlButton>
  );
};

export default AnimatedHourglassButton;
