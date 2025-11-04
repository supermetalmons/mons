import React, { useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { FaTimes, FaCheck } from "react-icons/fa";
import { go } from "../game/gameController";
import { markMainGameLoaded } from "../game/mainGameLoadState";
import { ColorSet, getCurrentColorSet, isCustomPictureBoardEnabled } from "../content/boardStyles";
import { isMobile } from "../utils/misc";
import { generateBoardPattern } from "../utils/boardPatternGenerator";
import { attachRainbowAura, hideRainbowAura as hideAuraDom, setRainbowAuraMask, showRainbowAura as showAuraDom } from "./rainbowAura";

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
export let showVideoReaction: (opponent: boolean, stickerId: number) => void;
export let showRaibowAura: (visible: boolean, url: string, opponent: boolean) => void;
export let updateAuraForAvatarElement: (opponent: boolean, avatarElement: SVGElement) => void;

const VIDEO_CONTAINER_HEIGHT_GRID = "12.5%";
const VIDEO_CONTAINER_HEIGHT_IMAGE = "13.5%";
const VIDEO_CONTAINER_MAX_HEIGHT = "min(20vh, 180px)";
const VIDEO_CONTAINER_ASPECT_RATIO = "1";
const VIDEO_CONTAINER_Z_INDEX = 10000;

const BoardComponent: React.FC = () => {
  const [opponentVideoId, setOpponentVideoId] = useState<number | null>(null);
  const [opponentVideoVisible, setOpponentVideoVisible] = useState(false);
  const [opponentVideoFading, setOpponentVideoFading] = useState(false);
  const [opponentVideoAppearing, setOpponentVideoAppearing] = useState(false);

  const [playerVideoId, setPlayerVideoId] = useState<number | null>(null);
  const [playerVideoVisible, setPlayerVideoVisible] = useState(false);
  const [playerVideoFading, setPlayerVideoFading] = useState(false);
  const [playerVideoAppearing, setPlayerVideoAppearing] = useState(false);
  const initializationRef = useRef(false);
  const [currentColorSet, setCurrentColorSet] = useState<ColorSet>(getCurrentColorSet());
  const [prefersDarkMode] = useState(window.matchMedia("(prefers-color-scheme: dark)").matches);
  const [isGridVisible, setIsGridVisible] = useState(!isCustomPictureBoardEnabled());
  const [shouldIncludePangchiuImage, setShouldIncludePangchiuImage] = useState(isCustomPictureBoardEnabled());
  const [overlayState, setOverlayState] = useState<{ blurry: boolean; svgElement: SVGElement | null; withConfirmAndCancelButtons: boolean; ok?: () => void; cancel?: () => void }>({ blurry: true, svgElement: null, withConfirmAndCancelButtons: false });
  const opponentAuraContainerRef = useRef<HTMLDivElement | null>(null);
  const playerAuraContainerRef = useRef<HTMLDivElement | null>(null);
  const opponentAuraRefs = useRef<{ background: HTMLDivElement; inner: HTMLDivElement } | null>(null);
  const playerAuraRefs = useRef<{ background: HTMLDivElement; inner: HTMLDivElement } | null>(null);
  const auraLayerRef = useRef<HTMLDivElement | null>(null);
  const opponentWrapperRef = useRef<HTMLDivElement | null>(null);
  const playerWrapperRef = useRef<HTMLDivElement | null>(null);

  updateAuraForAvatarElement = (opponent: boolean, avatarElement: SVGElement) => {
    const rect = avatarElement.getBoundingClientRect();
    const wrapper = opponent ? opponentWrapperRef.current : playerWrapperRef.current;
    const targets = opponent ? opponentAuraRefs : playerAuraRefs;
    const container = opponent ? opponentAuraContainerRef.current : playerAuraContainerRef.current;
    if (wrapper) {
      wrapper.style.position = "absolute";
      wrapper.style.left = `${rect.left}px`;
      wrapper.style.top = `${rect.top}px`;
      wrapper.style.width = `${rect.width}px`;
      wrapper.style.height = `${rect.height}px`;
      wrapper.style.pointerEvents = "none";
      wrapper.style.touchAction = "none";
      wrapper.style.zIndex = "10";
    }
    if (!targets.current && container) {
      targets.current = attachRainbowAura(container);
    }
    if (targets.current) {
      const isHidden = avatarElement.style.display === "none" || avatarElement.style.visibility === "hidden";
      if (isHidden) {
        hideAuraDom(targets.current.background);
      }
    }
  };

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

  showVideoReaction = (opponent: boolean, stickerId: number) => {
    if (opponent) {
      setOpponentVideoId(stickerId);
      setOpponentVideoVisible(true);
      setOpponentVideoFading(false);
      setOpponentVideoAppearing(true);
      setTimeout(() => setOpponentVideoAppearing(false), 400);
    } else {
      setPlayerVideoId(stickerId);
      setPlayerVideoVisible(true);
      setPlayerVideoFading(false);
      setPlayerVideoAppearing(true);
      setTimeout(() => setPlayerVideoAppearing(false), 400);
    }
  };

  setTopBoardOverlayVisible = (blurry: boolean, svgElement: SVGElement | null, withConfirmAndCancelButtons: boolean, ok?: () => void, cancel?: () => void) => {
    setOverlayState({ blurry, svgElement, withConfirmAndCancelButtons, ok, cancel });
  };

  showRaibowAura = (visible: boolean, url: string, opponent: boolean) => {
    const targets = opponent ? opponentAuraRefs : playerAuraRefs;
    const container = opponent ? opponentAuraContainerRef.current : playerAuraContainerRef.current;
    if (!targets.current && container) {
      targets.current = attachRainbowAura(container);
    }
    if (!targets.current) return;
    setRainbowAuraMask(targets.current.inner, url);
    if (visible) {
      showAuraDom(targets.current.background);
    } else {
      hideAuraDom(targets.current.background);
    }
  };

  useEffect(() => {
    if (!initializationRef.current) {
      initializationRef.current = true;
      const run = async () => {
        try {
          await go();
        } catch {
        } finally {
          markMainGameLoaded();
        }
      };
      run();
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
      <div ref={auraLayerRef} style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "visible" }}>
        <div ref={opponentWrapperRef} style={{ position: "absolute", left: 0, top: 0, width: 0, height: 0, pointerEvents: "none", zIndex: 10, overflow: "visible" }}>
          <div
            style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
            ref={(div) => {
              opponentAuraContainerRef.current = div;
              if (div && !opponentAuraRefs.current) {
                opponentAuraRefs.current = attachRainbowAura(div);
              }
            }}
          />
        </div>
        <div ref={playerWrapperRef} style={{ position: "absolute", left: 0, top: 0, width: 0, height: 0, pointerEvents: "none", zIndex: 10, overflow: "visible" }}>
          <div
            style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
            ref={(div) => {
              playerAuraContainerRef.current = div;
              if (div && !playerAuraRefs.current) {
                playerAuraRefs.current = attachRainbowAura(div);
              }
            }}
          />
        </div>
      </div>

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
            height: isGridVisible ? VIDEO_CONTAINER_HEIGHT_GRID : VIDEO_CONTAINER_HEIGHT_IMAGE,
            maxHeight: VIDEO_CONTAINER_MAX_HEIGHT,
            aspectRatio: VIDEO_CONTAINER_ASPECT_RATIO,
            zIndex: VIDEO_CONTAINER_Z_INDEX,
            pointerEvents: "none",
            touchAction: "none",
          }}>
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              width: "100%",
              height: "100%",
              pointerEvents: "none",
            }}
          />
          {opponentVideoVisible && opponentVideoId !== null && (
            <video
              key={opponentVideoId}
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                transform: opponentVideoAppearing ? "translate(-50%, -50%) scale(0.3) rotate(-10deg)" : opponentVideoFading ? "translate(-50%, -50%) scale(0.8) rotate(0deg)" : "translate(-50%, -50%) scale(1) rotate(0deg)",
                width: "100%",
                height: "100%",
                opacity: opponentVideoAppearing ? 0 : opponentVideoFading ? 0 : 1,
                transition: opponentVideoAppearing ? "opacity 0.3s ease-out, transform 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55)" : opponentVideoFading ? "opacity 0.2s ease-in, transform 0.2s ease-in" : "opacity 0.3s ease-out, transform 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55)",
              }}
              autoPlay
              muted
              playsInline
              onEnded={() => {
                setOpponentVideoFading(true);
                setTimeout(() => setOpponentVideoVisible(false), 200);
              }}>
              <source src={`https://assets.mons.link/swagpack/video/${opponentVideoId}.mov`} type='video/quicktime; codecs="hvc1"' />
              <source src={`https://assets.mons.link/swagpack/video/${opponentVideoId}.webm`} type="video/webm" />
            </video>
          )}
        </div>
        <div
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            top: isGridVisible ? "85.22%" : "89.65%",
            height: isGridVisible ? VIDEO_CONTAINER_HEIGHT_GRID : VIDEO_CONTAINER_HEIGHT_IMAGE,
            maxHeight: VIDEO_CONTAINER_MAX_HEIGHT,
            aspectRatio: VIDEO_CONTAINER_ASPECT_RATIO,
            zIndex: VIDEO_CONTAINER_Z_INDEX,
            pointerEvents: "none",
            touchAction: "none",
          }}>
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              width: "100%",
              height: "100%",
              pointerEvents: "none",
            }}
          />
          {playerVideoVisible && playerVideoId !== null && (
            <video
              key={playerVideoId}
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                transform: playerVideoAppearing ? "translate(-50%, -50%) scale(0.3) rotate(-10deg)" : playerVideoFading ? "translate(-50%, -50%) scale(0.8) rotate(0deg)" : "translate(-50%, -50%) scale(1) rotate(0deg)",
                width: "100%",
                height: "100%",
                opacity: playerVideoAppearing ? 0 : playerVideoFading ? 0 : 1,
                transition: playerVideoAppearing ? "opacity 0.3s ease-out, transform 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55)" : playerVideoFading ? "opacity 0.2s ease-in, transform 0.2s ease-in" : "opacity 0.3s ease-out, transform 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55)",
              }}
              autoPlay
              muted
              playsInline
              onEnded={() => {
                setPlayerVideoFading(true);
                setTimeout(() => setPlayerVideoVisible(false), 200);
              }}>
              <source src={`https://assets.mons.link/swagpack/video/${playerVideoId}.mov`} type='video/quicktime; codecs="hvc1"' />
              <source src={`https://assets.mons.link/swagpack/video/${playerVideoId}.webm`} type="video/webm" />
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
