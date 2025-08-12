import React, { useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { FaTimes, FaCheck } from "react-icons/fa";
import { go } from "../game/gameController";
import { ColorSet, getCurrentColorSet, isCustomPictureBoardEnabled } from "../content/boardStyles";
import { isMobile } from "../utils/misc";
import { generateBoardPattern } from "../utils/boardPatternGenerator";

const CircularButton = styled.button`
  width: 50%;
  aspect-ratio: 1;
  border-radius: 50%;
  background-color: var(--boardCircularButtonBackground);
  color: var(--color-blue-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  outline: none;
  border: none;
  min-width: 0;
  min-height: 0;
  box-sizing: border-box;
  overflow: visible;

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background-color: var(--boardCircularButtonBackgroundHover);
    }
  }

  &:active {
    background-color: var(--boardCircularButtonBackgroundActive);
  }

  @media (prefers-color-scheme: dark) {
    background-color: var(--boardCircularButtonBackgroundDark);
    color: var(--color-blue-primary-dark);

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background-color: var(--boardCircularButtonBackgroundHoverDark);
      }
    }

    &:active {
      background-color: var(--boardCircularButtonBackgroundActiveDark);
    }
  }

  svg {
    width: 55.5%;
    height: 55.5%;
    min-width: 5px;
    min-height: 5px;
    overflow: visible;
  }
`;

const listeners: Array<() => void> = [];

export const subscribeToBoardStyleChanges = (listener: () => void) => {
  listeners.push(listener);
  return () => {
    const index = listeners.indexOf(listener);
    if (index > -1) {
      listeners.splice(index, 1);
    }
  };
};

export const updateBoardComponentForBoardStyleChange = () => {
  listeners.forEach((listener) => listener());
};

export let setTopBoardOverlayVisible: (blurry: boolean, svgElement: SVGElement | null, withConfirmAndCancelButtons: boolean, ok?: () => void, cancel?: () => void) => void;
export let showVideoReaction: (opponent: boolean) => void;

const BoardComponent: React.FC = () => {
  const [opponentSideVideo, setOpponentSideVideo] = useState(false);
  const [showTestVideo, setShowTestVideo] = useState(false);
  const [videoFading, setVideoFading] = useState(false);
  const [videoAppearing, setVideoAppearing] = useState(false);
  const initializationRef = useRef(false);
  const [currentColorSet, setCurrentColorSet] = useState<ColorSet>(getCurrentColorSet());
  const [prefersDarkMode] = useState(window.matchMedia("(prefers-color-scheme: dark)").matches);
  const [isGridVisible, setIsGridVisible] = useState(!isCustomPictureBoardEnabled());
  const [shouldIncludePangchiuImage, setShouldIncludePangchiuImage] = useState(isCustomPictureBoardEnabled());
  const [overlayState, setOverlayState] = useState<{ blurry: boolean; svgElement: SVGElement | null; withConfirmAndCancelButtons: boolean; ok?: () => void; cancel?: () => void }>({ blurry: true, svgElement: null, withConfirmAndCancelButtons: false });

  const handleConfirmClick = () => {
    if (overlayState.ok) {
      overlayState.ok();
    }
  };

  const handleCancelClick = () => {
    if (overlayState.cancel) {
      overlayState.cancel();
    }
  };

  showVideoReaction = (opponent: boolean) => {
    setOpponentSideVideo(opponent);
    setShowTestVideo(true);
    setVideoFading(false);
    setVideoAppearing(true);
    setTimeout(() => setVideoAppearing(false), 400);
  };

  setTopBoardOverlayVisible = (blurry: boolean, svgElement: SVGElement | null, withConfirmAndCancelButtons: boolean, ok?: () => void, cancel?: () => void) => {
    setOverlayState({ blurry, svgElement, withConfirmAndCancelButtons, ok, cancel });
  };

  useEffect(() => {
    if (!initializationRef.current) {
      go();
      initializationRef.current = true;
    }
  }, []);

  useEffect(() => {
    const updateColorSetAndGrid = () => {
      setCurrentColorSet(getCurrentColorSet());
      const newIsGridVisible = !isCustomPictureBoardEnabled();
      setIsGridVisible(newIsGridVisible);
      if (!newIsGridVisible) {
        setShouldIncludePangchiuImage(true);
      }
    };

    const unsubscribe = subscribeToBoardStyleChanges(updateColorSetAndGrid);
    return () => {
      unsubscribe();
    };
  }, []);

  const standardBoardTransform = "translate(0,100)";
  const pangchiuBoardTransform = "translate(83,184) scale(0.85892388)";

  return (
    <>
      <svg xmlns="http://www.w3.org/2000/svg" className={`board-svg ${isGridVisible ? "grid-visible" : "grid-hidden"}`} viewBox="0 0 1100 1410" shapeRendering="crispEdges" overflow="visible">
        {isGridVisible ? (
          <g id="boardBackgroundLayer">
            {generateBoardPattern({
              colorSet: currentColorSet,
              size: 1100,
              cellSize: 100,
              offsetY: 100,
              keyPrefix: "board",
            })}
          </g>
        ) : (
          <g id="boardBackgroundLayer">
            <rect x="1" y="101" height="1161" width="1098" fill={prefersDarkMode ? "var(--color-gray-23)" : "var(--boardBackgroundLight)"} />
            {shouldIncludePangchiuImage && (
              <image
                href="https://assets.mons.link/board/bg/Pangchiu.jpg"
                x="0"
                y="100"
                width="1100"
                style={{
                  backgroundColor: prefersDarkMode ? "var(--color-gray-23)" : "var(--boardBackgroundLight)",
                  display: isGridVisible ? "none" : "block",
                }}
              />
            )}
          </g>
        )}
        <g id="monsboard" transform={isGridVisible ? standardBoardTransform : pangchiuBoardTransform}></g>
        <g id="highlightsLayer" transform={isGridVisible ? standardBoardTransform : pangchiuBoardTransform}></g>
        <g id="itemsLayer" transform={isGridVisible ? standardBoardTransform : pangchiuBoardTransform}></g>
        <g id="controlsLayer"></g>
        <g id="effectsLayer" transform={isGridVisible ? standardBoardTransform : pangchiuBoardTransform}></g>
      </svg>

      <div
        className={`board-svg ${isGridVisible ? "grid-visible" : "grid-hidden"}`}
        style={{
          aspectRatio: "110 / 141",
          pointerEvents: "none",
        }}>
        <div
          style={{
            position: "absolute",
            left: "50%",
            transform: "translate(-50%, -100%)",
            top: isGridVisible ? "7.02%" : "7.05%",
            height: "9%",
            aspectRatio: "1",
            zIndex: 10,
            pointerEvents: "none",
            touchAction: "none",
          }}>
          {showTestVideo && !opponentSideVideo && (
            <video
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                transform: videoAppearing ? "translate(-50%, -50%) scale(0.3) rotate(-10deg)" : videoFading ? "translate(-50%, -50%) scale(0.8) rotate(5deg)" : "translate(-50%, -50%) scale(1) rotate(0deg)",
                width: "100%",
                height: "100%",
                opacity: videoAppearing ? 0 : videoFading ? 0 : 1,
                transition: videoAppearing ? "opacity 0.3s ease-out, transform 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55)" : videoFading ? "opacity 0.2s ease-in, transform 0.2s ease-in" : "opacity 0.3s ease-out, transform 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55)",
              }}
              autoPlay
              muted
              playsInline
              onEnded={() => {
                setVideoFading(true);
                setTimeout(() => setShowTestVideo(false), 200);
              }}>
              <source src="https://assets.mons.link/swagpack/video/258.mov" type='video/quicktime; codecs="hvc1"' />
              <source src="https://assets.mons.link/swagpack/video/258.webm" type="video/webm" />
            </video>
          )}
        </div>
        <div
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            top: isGridVisible ? "85.22%" : "89.65%",
            height: "9%",
            aspectRatio: "1",
            zIndex: 10,
            pointerEvents: "none",
            touchAction: "none",
          }}>
          {showTestVideo && opponentSideVideo && (
            <video
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                transform: videoAppearing ? "translate(-50%, -50%) scale(0.3) rotate(-10deg)" : videoFading ? "translate(-50%, -50%) scale(0.8) rotate(5deg)" : "translate(-50%, -50%) scale(1) rotate(0deg)",
                width: "100%",
                height: "100%",
                opacity: videoAppearing ? 0 : videoFading ? 0 : 1,
                transition: videoAppearing ? "opacity 0.3s ease-out, transform 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55)" : videoFading ? "opacity 0.2s ease-in, transform 0.2s ease-in" : "opacity 0.3s ease-out, transform 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55)",
              }}
              autoPlay
              muted
              playsInline
              onEnded={() => {
                setVideoFading(true);
                setTimeout(() => setShowTestVideo(false), 200);
              }}>
              <source src="https://assets.mons.link/swagpack/video/303.mov" type='video/quicktime; codecs="hvc1"' />
              <source src="https://assets.mons.link/swagpack/video/303.webm" type="video/webm" />
            </video>
          )}
        </div>
        {overlayState.svgElement && (
          <div
            style={{
              position: "absolute",
              left: "50%",
              transform: "translateX(-50%)",
              top: isGridVisible ? "7.02%" : "7.05%",
              pointerEvents: "all",
              height: isGridVisible ? "78.2%" : "82.6%",
              aspectRatio: isGridVisible ? "1" : "1524/1612",
              ...(overlayState.blurry
                ? {
                    backdropFilter: "blur(3px)",
                    WebkitBackdropFilter: "blur(3px)",
                  }
                : {}),
              overflow: "hidden",
              border: "none",
            }}
            ref={(div) => {
              if (div && overlayState.svgElement) {
                div.innerHTML = "";
                const wrapperSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                wrapperSvg.style.position = "absolute";
                wrapperSvg.style.top = "0";
                wrapperSvg.style.left = "0";
                wrapperSvg.style.width = "100%";
                wrapperSvg.style.height = "100%";
                wrapperSvg.setAttribute("viewBox", "0 0 1100 1100");
                wrapperSvg.setAttribute("preserveAspectRatio", "xMidYMid meet");
                wrapperSvg.appendChild(overlayState.svgElement);
                div.appendChild(wrapperSvg);
              }
            }}
          />
        )}
        {overlayState.withConfirmAndCancelButtons && (
          <div
            style={{
              position: "absolute",
              bottom: "30.5%",
              left: "50%",
              transform: "translateX(-50%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "27%",
              height: "10.8%",
              aspectRatio: "3.75",
              pointerEvents: "all",
            }}>
            <CircularButton onClick={!isMobile ? handleCancelClick : undefined} onTouchStart={isMobile ? handleCancelClick : undefined}>
              <FaTimes />
            </CircularButton>
            <CircularButton onClick={!isMobile ? handleConfirmClick : undefined} onTouchStart={isMobile ? handleConfirmClick : undefined}>
              <FaCheck />
            </CircularButton>
          </div>
        )}
      </div>
    </>
  );
};

export default BoardComponent;
