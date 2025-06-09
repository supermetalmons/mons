import React, { useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { go } from "../game/gameController";
import { ColorSet, getCurrentColorSet, isCustomPictureBoardEnabled } from "../content/boardStyles";
import { isMobile } from "../utils/misc";

const CircularButton = styled.button`
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: white;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 24px;
  outline: none;
  border: none;
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

const BoardComponent: React.FC = () => {
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

  const colorDarkSquare = currentColorSet.darkSquare;
  const colorLightSquare = currentColorSet.lightSquare;
  const colorManaPool = currentColorSet.manaPool;
  const colorPickupItemSquare = currentColorSet.pickupItemSquare;
  const colorSimpleManaSquare = currentColorSet.simpleManaSquare;

  const standardBoardTransform = "translate(0,100)";
  const pangchiuBoardTransform = "translate(83,184) scale(0.85892388)";

  return (
    <>
      <svg xmlns="http://www.w3.org/2000/svg" className={`board-svg ${isGridVisible ? "grid-visible" : "grid-hidden"}`} viewBox="0 0 1100 1410" shapeRendering="crispEdges" overflow="visible">
        {isGridVisible ? (
          <g id="boardBackgroundLayer">
            <rect y="100" width="1100" height="1100" fill={colorLightSquare} />
            {Array.from({ length: 11 }, (_, row) =>
              Array.from({ length: 11 }, (_, col) => {
                const x = col * 100;
                const y = (row + 1) * 100;
                return (row + col) % 2 === 1 ? <rect key={`square-${row}-${col}`} x={x} y={y} width="100" height="100" fill={colorDarkSquare} /> : null;
              })
            )}

            {[
              [500, 600],
              [0, 100],
              [1000, 1100],
              [1000, 100],
              [0, 1100],
            ].map(([x, y], i) => (
              <rect key={`mana-pool-${i}`} x={x} y={y} width="100" height="100" fill={colorManaPool} />
            ))}

            {[
              [0, 600],
              [1000, 600],
            ].map(([x, y], i) => (
              <rect key={`pickup-${i}`} x={x} y={y} width="100" height="100" fill={colorPickupItemSquare} />
            ))}

            {[
              [400, 400],
              [600, 400],
              [400, 800],
              [600, 800],
              [300, 500],
              [500, 500],
              [700, 500],
              [300, 700],
              [500, 700],
              [700, 700],
            ].map(([x, y], i) => (
              <rect key={`simple-mana-${i}`} x={x} y={y} width="100" height="100" fill={colorSimpleManaSquare} />
            ))}
          </g>
        ) : (
          <g id="boardBackgroundLayer">
            <rect x="1" y="101" height="1161" width="1098" fill={prefersDarkMode ? "#232323" : "#FEFCF6"} />
            {shouldIncludePangchiuImage && (
              <image
                href="/assets/bg/Pangchiu.jpg"
                x="0"
                y="100"
                width="1100"
                style={{
                  backgroundColor: prefersDarkMode ? "#232323" : "#FEFCF6",
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
      {overlayState.svgElement && (
        <div
          className={`board-svg ${isGridVisible ? "grid-visible" : "grid-hidden"}`}
          style={{
            aspectRatio: "110 / 141",
          }}>
          <div
            style={{
              position: "absolute",
              left: "50%",
              transform: "translateX(-50%)",
              top: isGridVisible ? "7.02%" : "7.05%",
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
          {overlayState.withConfirmAndCancelButtons && (
            <div style={{ position: "absolute", bottom: "20%", left: "50%", transform: "translateX(-50%)", display: "flex", gap: "20px" }}>
              <CircularButton onClick={!isMobile ? handleCancelClick : undefined} onTouchStart={isMobile ? handleCancelClick : undefined}>
                ✕
              </CircularButton>
              <CircularButton onClick={!isMobile ? handleConfirmClick : undefined} onTouchStart={isMobile ? handleConfirmClick : undefined}>
                ✓
              </CircularButton>
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default BoardComponent;
