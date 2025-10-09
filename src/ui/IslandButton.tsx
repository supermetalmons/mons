import React, { useCallback, useEffect, useRef, useState } from "react";
import { isMobile } from "../utils/misc";
import styled from "styled-components";
import { didDismissSomethingWithOutsideTapJustNow } from "./BottomControls";
import IslandRock from "./IslandRock";
import { soundPlayer } from "../utils/SoundPlayer";

const ButtonEl = styled.button<{ $hidden: boolean }>`
  border: none;
  cursor: pointer;
  height: 32px;
  width: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: transparent;
  margin-right: 8px;
  -webkit-tap-highlight-color: transparent;
  outline: none;
  -webkit-touch-callout: none;
  touch-action: none;
  overflow: hidden;
  position: relative;
  z-index: 1;
  visibility: ${(p) => (p.$hidden ? "hidden" : "visible")};
  & > img {
    max-height: 100%;
    max-width: 100%;
    height: auto;
    width: auto;
    display: block;
    transform: translateY(1px) scale(1.3);
  }
`;

const Overlay = styled.div<{ $visible: boolean; $opening: boolean; $closing: boolean }>`
  position: fixed;
  inset: 0;
  cursor: pointer;
  background: rgba(0, 0, 0, 0.1);
  opacity: ${(p) => (p.$visible ? 1 : 0)};
  transition: ${(p) => (p.$opening ? "opacity 380ms cubic-bezier(0.16, 1, 0.3, 1) 100ms" : p.$closing ? "opacity 320ms ease-out 50ms" : "opacity 320ms ease-in")};
  pointer-events: ${(p) => (p.$visible ? "auto" : "none")};
  z-index: ${(p) => (p.$visible || p.$opening || p.$closing ? 90000 : 0)};
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  @media (prefers-color-scheme: light) {
    background: rgba(0, 0, 0, 0.01);
  }
`;

const Layer = styled.div<{ $visible: boolean; $opening: boolean; $closing: boolean }>`
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: ${(p) => (p.$visible || p.$opening || p.$closing ? 90001 : 0)};
  pointer-events: ${(p) => (p.$visible || p.$opening || p.$closing ? "auto" : "none")};
  cursor: pointer;
`;

const Animator = styled.div<{ $tx: number; $ty: number; $sx: number; $sy: number }>`
  pointer-events: auto;
  transition: transform 300ms ease;
  transform: translate(${(p) => p.$tx}px, ${(p) => p.$ty}px) scale(${(p) => p.$sx}, ${(p) => p.$sy});
`;

const Hero = styled.img`
  max-height: 50dvh;
  max-width: 92dvw;
  width: auto;
  height: auto;
  display: block;
  cursor: pointer;
`;

const Rock = styled(IslandRock)`
  height: 100%;
`;

const RockLayer = styled.div<{ $visible: boolean }>`
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  top: 6%;
  height: 20%;
  pointer-events: auto;
  transition: opacity 300ms ease;
  opacity: ${(p) => (p.$visible ? 1 : 0)};
`;

type Props = {
  imageUrl?: string;
};

const DEFAULT_URL = "https://assets.mons.link/rocks/island.webp";

let islandImagePromise: Promise<string | null> | null = null;

const getIslandImageUrl = () => {
  if (!islandImagePromise) {
    islandImagePromise = fetch(DEFAULT_URL)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch image");
        return res.blob();
      })
      .then((blob) => URL.createObjectURL(blob))
      .catch(() => null);
  }
  return islandImagePromise;
};

export function IslandButton({ imageUrl = DEFAULT_URL }: Props) {
  const [islandImgLoaded, setIslandImgLoaded] = useState(false);
  const [islandNatural, setIslandNatural] = useState<{ w: number; h: number } | null>(null);
  const islandButtonImgRef = useRef<HTMLImageElement | null>(null);
  const islandButtonRef = useRef<HTMLButtonElement | null>(null);
  const islandHeroImgRef = useRef<HTMLImageElement | null>(null);
  const [islandOverlayShown, setIslandOverlayShown] = useState(false);
  const [islandOverlayVisible, setIslandOverlayVisible] = useState(false);
  const [islandActive, setIslandActive] = useState(false);
  const [islandAnimating, setIslandAnimating] = useState(false);
  const [islandClosing, setIslandClosing] = useState(false);
  const [islandOpening, setIslandOpening] = useState(false);
  const [islandTranslate, setIslandTranslate] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [islandScale, setIslandScale] = useState<{ x: number; y: number }>({ x: 1, y: 1 });
  const overlayJustOpenedAtRef = useRef<number>(0);
  const [resolvedUrl, setResolvedUrl] = useState<string>(imageUrl);

  useEffect(() => {
    const shouldBeMarkedOpen = islandOverlayShown || islandOpening || islandClosing;
    if (shouldBeMarkedOpen) {
      document.body.classList.add("island-overlay-open");
    } else {
      document.body.classList.remove("island-overlay-open");
    }
    return () => {
      document.body.classList.remove("island-overlay-open");
    };
  }, [islandOverlayShown, islandOpening, islandClosing]);

  useEffect(() => {
    let mounted = true;
    if (imageUrl === DEFAULT_URL) {
      getIslandImageUrl().then((url) => {
        if (!mounted) return;
        setResolvedUrl(url || imageUrl);
      });
    } else {
      setResolvedUrl(imageUrl);
    }
    return () => {
      mounted = false;
    };
  }, [imageUrl]);

  useEffect(() => {
    if (!resolvedUrl) return;
    const img = new Image();
    img.src = resolvedUrl;
    if (img.complete) {
      setIslandNatural({ w: img.naturalWidth, h: img.naturalHeight });
      setIslandImgLoaded(true);
    } else {
      img.onload = () => {
        setIslandNatural({ w: img.naturalWidth, h: img.naturalHeight });
        setIslandImgLoaded(true);
      };
    }
  }, [resolvedUrl]);

  const handleIslandOpen = useCallback(
    (event: React.MouseEvent<HTMLButtonElement> | React.TouchEvent<HTMLButtonElement>) => {
      soundPlayer.initializeOnUserInteraction(true);
      event.stopPropagation();
      event.preventDefault();
      if (!islandImgLoaded || !islandNatural) return;
      const imgEl = islandButtonImgRef.current;
      if (!imgEl) return;
      const rect = imgEl.getBoundingClientRect();
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      const ratio = islandNatural.w / islandNatural.h;
      const restH = Math.min(vh * 0.5, (vw * 0.92) / ratio);
      const cx = vw / 2;
      const cy = vh / 2;
      const bx = rect.left + rect.width / 2;
      const by = rect.top + rect.height / 2;
      const deltaX = bx - cx;
      const deltaY = by - cy;
      const displayedH = rect.height;
      const uniformScale = displayedH / restH;
      overlayJustOpenedAtRef.current = Date.now();
      setIslandOverlayShown(true);
      setIslandOverlayVisible(false);
      setIslandAnimating(true);
      setIslandClosing(false);
      setIslandOpening(true);
      setIslandActive(false);
      setIslandTranslate({ x: deltaX, y: deltaY });
      setIslandScale({ x: uniformScale, y: uniformScale });
      requestAnimationFrame(() => {
        setIslandActive(true);
        setIslandTranslate({ x: 0, y: 0 });
        setIslandScale({ x: 1, y: 1 });
        setIslandOverlayVisible(true);
      });
    },
    [islandImgLoaded, islandNatural]
  );

  const handleIslandClose = useCallback(
    (event?: React.MouseEvent | React.TouchEvent) => {
      if (event) {
        event.stopPropagation();
        event.preventDefault();
      }
      if (isMobile && Date.now() - overlayJustOpenedAtRef.current < 250) {
        return;
      }
      didDismissSomethingWithOutsideTapJustNow();
      const imgEl = islandButtonImgRef.current;
      if (!imgEl || !islandNatural) {
        setIslandActive(false);
        setIslandOverlayVisible(false);
        setIslandOverlayShown(false);
        setIslandAnimating(false);
        setIslandClosing(false);
        setIslandTranslate({ x: 0, y: 0 });
        setIslandScale({ x: 1, y: 1 });
        return;
      }
      const rect = imgEl.getBoundingClientRect();
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      const ratio = islandNatural.w / islandNatural.h;
      const restH = Math.min(vh * 0.5, (vw * 0.92) / ratio);
      const cx = vw / 2;
      const cy = vh / 2;
      const bx = rect.left + rect.width / 2;
      const by = rect.top + rect.height / 2;
      const deltaX = bx - cx;
      const deltaY = by - cy;
      const displayedH = rect.height;
      const uniformScale = displayedH / restH;
      setIslandActive(false);
      setIslandAnimating(true);
      setIslandClosing(true);
      setIslandOverlayVisible(false);
      requestAnimationFrame(() => {
        setIslandTranslate({ x: deltaX, y: deltaY });
        setIslandScale({ x: uniformScale, y: uniformScale });
      });
    },
    [islandNatural]
  );

  const handleIslandTransitionEnd = useCallback(
    (e: React.TransitionEvent) => {
      if (e.propertyName !== "transform") return;
      if (islandActive) {
        setIslandAnimating(false);
        setIslandOpening(false);
        return;
      }
      setIslandAnimating(false);
    },
    [islandActive]
  );

  const handleOverlayTransitionEnd = useCallback(
    (e: React.TransitionEvent<HTMLDivElement>) => {
      if (e.propertyName !== "opacity") return;
      if (!islandOverlayVisible) {
        setIslandOverlayShown(false);
        setIslandClosing(false);
        setIslandTranslate({ x: 0, y: 0 });
        setIslandScale({ x: 1, y: 1 });
      }
    },
    [islandOverlayVisible]
  );

  const handleLayerTap = useCallback(
    (event: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
      const heroEl = islandHeroImgRef.current;
      if (!heroEl) return;
      const target = event.target as Node;
      if (heroEl.contains(target)) {
        event.stopPropagation();
        event.preventDefault();
        return;
      }
      handleIslandClose(event as unknown as React.MouseEvent | React.TouchEvent);
    },
    [handleIslandClose]
  );

  return (
    <>
      {islandImgLoaded && (
        <ButtonEl ref={islandButtonRef} $hidden={islandOverlayShown} onClick={!isMobile ? handleIslandOpen : undefined} onTouchStart={isMobile ? handleIslandOpen : undefined} aria-label="Island">
          <img ref={islandButtonImgRef} src={resolvedUrl} alt="" draggable={false} />
        </ButtonEl>
      )}
      {(islandOverlayShown || islandAnimating) && (
        <>
          <Overlay $visible={islandOverlayVisible} $opening={islandOpening} $closing={islandClosing} onClick={!isMobile ? handleIslandClose : undefined} onTouchStart={isMobile ? handleIslandClose : undefined} onTransitionEnd={handleOverlayTransitionEnd} />
          <Layer $visible={islandOverlayVisible} $opening={islandOpening} $closing={islandClosing} onClick={!isMobile ? handleLayerTap : undefined} onTouchStart={isMobile ? handleLayerTap : undefined}>
            <Animator $tx={islandTranslate.x} $ty={islandTranslate.y} $sx={islandScale.x} $sy={islandScale.y} onTransitionEnd={handleIslandTransitionEnd}>
              <Hero ref={islandHeroImgRef} src={resolvedUrl} alt="" draggable={false} />
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  pointerEvents: "none",
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "center",
                }}>
                <RockLayer $visible={!islandClosing} onClick={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
                  <Rock heightPct={100} />
                </RockLayer>
              </div>
            </Animator>
          </Layer>
        </>
      )}
    </>
  );
}

export default IslandButton;
