import React, { useCallback, useEffect, useRef, useState } from "react";
import { isMobile } from "../utils/misc";
import styled from "styled-components";
import { didDismissSomethingWithOutsideTapJustNow } from "./BottomControls";
import { closeAllKindsOfPopups } from "./MainMenu";
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
  user-select: none;
  -webkit-user-select: none;
  & > img {
    max-height: 100%;
    max-width: 100%;
    height: auto;
    width: auto;
    display: block;
    transform: translateY(1px) scale(1.3);
    -webkit-tap-highlight-color: transparent;
    -webkit-touch-callout: none;
    user-select: none;
    -webkit-user-select: none;
  }
`;

const MaterialsBar = styled.div<{ $visible: boolean }>`
  position: fixed;
  bottom: 14px;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 0 12px;
  box-sizing: border-box;
  opacity: ${(p) => (p.$visible ? 1 : 0)};
  transition: opacity 220ms ease;
  pointer-events: ${(p) => (p.$visible ? "auto" : "none")};
  z-index: 90002;
  @media (min-width: 480px) {
    gap: 14px;
  }
  @media (min-width: 768px) {
    gap: 18px;
  }
`;

const MaterialItem = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 2px;
  background: var(--interactiveHoverBackgroundLight);
  border-radius: 999px;
  padding: 0 8px 0 4px;
  -webkit-tap-highlight-color: transparent;
  -webkit-touch-callout: none;
  user-select: none;
  -webkit-user-select: none;
  @media (prefers-color-scheme: dark) {
    background: var(--panel-dark-90);
  }
`;

const MaterialIcon = styled.img`
  width: 33px;
  height: 33px;
  display: block;
`;

const MaterialAmount = styled.span`
  font-size: 12px;
  line-height: 1;
  color: var(--instruction-text-color);
  font-weight: 600;
  letter-spacing: 0.2px;
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
  -webkit-tap-highlight-color: transparent;
  -webkit-touch-callout: none;
  user-select: none;
  -webkit-user-select: none;
`;

const Animator = styled.div<{ $tx: number; $ty: number; $sx: number; $sy: number }>`
  pointer-events: auto;
  transition: transform 300ms ease;
  transform: translate(${(p) => p.$tx}px, ${(p) => p.$ty}px) scale(${(p) => p.$sx}, ${(p) => p.$sy});
  -webkit-tap-highlight-color: transparent;
  -webkit-touch-callout: none;
  user-select: none;
  -webkit-user-select: none;
`;

const Hero = styled.img`
  max-height: 50dvh;
  max-width: 92dvw;
  width: auto;
  height: auto;
  display: block;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  -webkit-touch-callout: none;
  user-select: none;
  -webkit-user-select: none;
`;

const Rock = styled(IslandRock)`
  height: 100%;
`;

const RockLayer = styled.div<{ $visible: boolean }>`
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  top: 10%;
  height: 20%;
  pointer-events: auto;
  transition: opacity 300ms ease;
  opacity: ${(p) => (p.$visible ? 1 : 0)};
  -webkit-tap-highlight-color: transparent;
  -webkit-touch-callout: none;
  user-select: none;
  -webkit-user-select: none;
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

const MATERIALS = ["dust", "slime", "gum", "metal", "ice"] as const;
type MaterialName = (typeof MATERIALS)[number];
const MATERIAL_BASE_URL = "https://assets.mons.link/rocks/materials";

const materialImagePromises: Map<MaterialName, Promise<string | null>> = new Map();

const getMaterialImageUrl = (name: MaterialName) => {
  if (!materialImagePromises.has(name)) {
    const url = `${MATERIAL_BASE_URL}/${name}.webp`;
    const p = fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch image");
        return res.blob();
      })
      .then((blob) => URL.createObjectURL(blob))
      .catch(() => null);
    materialImagePromises.set(name, p);
  }
  return materialImagePromises.get(name)!;
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
  const heroHitCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [materialAmounts, setMaterialAmounts] = useState<Record<MaterialName, number>>(() => {
    const entries = MATERIALS.map((n) => [n, 0] as const);
    return Object.fromEntries(entries) as Record<MaterialName, number>;
  });
  const [materialUrls, setMaterialUrls] = useState<Record<MaterialName, string | null>>(() => {
    const initial: Partial<Record<MaterialName, string | null>> = {};
    MATERIALS.forEach((n) => (initial[n] = null));
    return initial as Record<MaterialName, string | null>;
  });
  const materialItemRefs = useRef<Record<MaterialName, HTMLDivElement | null>>({ dust: null, slime: null, gum: null, metal: null, ice: null });
  const rockLayerRef = useRef<HTMLDivElement | null>(null);
  const fxContainerRef = useRef<HTMLDivElement | null>(null);
  const lastRockRectRef = useRef<DOMRect | null>(null);

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

  useEffect(() => {
    let mounted = true;
    MATERIALS.forEach((name) => {
      getMaterialImageUrl(name).then((url) => {
        if (!mounted) return;
        setMaterialUrls((prev) => ({ ...prev, [name]: url }));
      });
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!islandOverlayVisible || islandClosing) return;
    const hero = islandHeroImgRef.current;
    if (!hero) return;
    const rect = hero.getBoundingClientRect();
    let canvas = heroHitCanvasRef.current;
    if (!canvas) {
      canvas = document.createElement("canvas");
      heroHitCanvasRef.current = canvas;
    }
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | null;
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    try {
      ctx.drawImage(hero, 0, 0, w, h);
    } catch {}
  }, [islandOverlayVisible, islandClosing, resolvedUrl]);

  const drawHeroIntoHitCanvas = useCallback(() => {
    const hero = islandHeroImgRef.current;
    if (!hero) return false;
    const rect = hero.getBoundingClientRect();
    let canvas = heroHitCanvasRef.current;
    if (!canvas) {
      canvas = document.createElement("canvas");
      heroHitCanvasRef.current = canvas;
    }
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | null;
    if (!ctx) return false;
    ctx.clearRect(0, 0, w, h);
    try {
      ctx.drawImage(hero, 0, 0, w, h);
      return true;
    } catch {
      return false;
    }
  }, []);

  const handleIslandOpen = useCallback(
    (event: React.MouseEvent<HTMLButtonElement> | React.TouchEvent<HTMLButtonElement>) => {
      soundPlayer.initializeOnUserInteraction(true);
      closeAllKindsOfPopups();
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

  const getFxContainer = useCallback(() => {
    let container = fxContainerRef.current;
    if (!container) {
      container = document.createElement("div");
      container.style.position = "fixed";
      container.style.left = "0";
      container.style.top = "0";
      container.style.right = "0";
      container.style.bottom = "0";
      container.style.pointerEvents = "none";
      container.style.zIndex = "90005";
      container.style.contain = "paint";
      container.style.isolation = "isolate";
      fxContainerRef.current = container;
      document.body.appendChild(container);
    }
    return container;
  }, []);

  useEffect(() => {
    return () => {
      const container = fxContainerRef.current;
      if (container && container.parentNode) {
        try {
          container.parentNode.removeChild(container);
        } catch {}
      }
      fxContainerRef.current = null;
    };
  }, []);

  const spawnMaterialDrop = useCallback(
    async (name: MaterialName, delay: number, common?: { duration1: number; spread: number; lift: number; fall: number; start: number }): Promise<MaterialName> => {
      const url = await getMaterialImageUrl(name);
      if (!url) return name;
      const rockLayer = rockLayerRef.current;
      if (!rockLayer) return name;
      const rect = rockLayer.getBoundingClientRect();
      lastRockRectRef.current = rect;
      const startX = rect.left + rect.width / 2;
      const startY = rect.top + rect.height * 0.5;
      const originOffsetX = (Math.random() - 0.5) * rect.width * 0.2;
      const originOffsetY = -rect.height * 0.12 + Math.random() * rect.height * 0.16;
      const el = document.createElement("img");
      el.src = url;
      el.draggable = false;
      el.style.position = "absolute";
      el.style.left = "0";
      el.style.top = "0";
      const targetRef = materialItemRefs.current[name];
      const targetIcon = targetRef?.querySelector("img") as HTMLImageElement | null;
      const targetIconBox = targetIcon?.getBoundingClientRect();
      const targetW = targetIconBox ? Math.max(1, Math.round(targetIconBox.width)) : 33;
      el.style.width = `${targetW}px`;
      el.style.height = "auto";
      el.style.pointerEvents = "none";
      el.style.zIndex = "1";
      el.style.willChange = "transform, opacity";
      el.style.backfaceVisibility = "hidden";
      const angle = (Math.random() - 0.5) * Math.PI * 0.5;
      const spreadLocal = common?.spread ?? 24 + Math.random() * 48;
      const liftLocal = common?.lift ?? 12 + Math.random() * 18;
      const fallLocal = common?.fall ?? 12 + Math.random() * 14 + rect.height * 0.15;

      const duration1 = common?.duration1 ?? 600 + Math.random() * 140;
      const start = (common?.start ?? performance.now()) + delay;
      const fxContainer = getFxContainer();
      fxContainer.appendChild(el);
      const containerBox = fxContainer.getBoundingClientRect();
      const imgBox = el.getBoundingClientRect();
      const halfW = imgBox.width / 2;
      const halfH = imgBox.height / 2;
      const baseX = startX + originOffsetX - containerBox.left - halfW;
      const baseY = startY + originOffsetY - containerBox.top - halfH;
      el.style.transform = `translate3d(${baseX}px, ${baseY}px, 0) scale(0.95)`;
      function easeOutQuart(t: number) {
        return 1 - Math.pow(1 - t, 4);
      }
      return new Promise<MaterialName>((resolve) => {
        function step1(now: number) {
          if (now < start) {
            requestAnimationFrame(step1);
            return;
          }
          const t = Math.min(1, (now - start) / duration1);
          const e = easeOutQuart(t);
          const dx = Math.sin(angle) * spreadLocal * e;
          const u = 1 - (2 * t - 1) * (2 * t - 1);
          const dy = -liftLocal * u + fallLocal * t * t;
          const s = 0.95 + 0.05 * e;
          el.style.transform = `translate3d(${baseX + dx}px, ${baseY + dy}px, 0) scale(${s})`;
          if (t < 1) {
            requestAnimationFrame(step1);
          } else {
            const targetEl = materialItemRefs.current[name];
            if (!targetEl) {
              el.remove();
              resolve(name);
              return;
            }
            const iconEl = targetEl.querySelector("img") as HTMLImageElement | null;
            const tr = (iconEl || targetEl).getBoundingClientRect();
            const endX = tr.left + tr.width / 2;
            const endY = tr.top + tr.height / 2;
            const from = el.getBoundingClientRect();
            const parentBox = (el.parentElement as HTMLElement).getBoundingClientRect();
            const fromX = from.left - parentBox.left;
            const fromY = from.top - parentBox.top;
            const endXLocal = endX - parentBox.left - halfW;
            const endYLocal = endY - parentBox.top - halfH;
            const duration2 = 460 + Math.random() * 140;
            const start2 = performance.now() + 420 + Math.random() * 380;
            function easeOutCubic(t: number) {
              return 1 - Math.pow(1 - t, 3);
            }
            function step2(now2: number) {
              if (now2 < start2) {
                requestAnimationFrame(step2);
                return;
              }
              const tt = Math.min(1, (now2 - start2) / duration2);
              const e2 = easeOutCubic(tt);
              const cx = fromX + (endXLocal - fromX) * e2;
              const cy = fromY + (endYLocal - fromY) * e2;
              const sc = 1;
              el.style.transform = `translate3d(${cx}px, ${cy}px, 0) scale(${sc})`;
              el.style.opacity = `${1 - tt * 0.1}`;
              if (tt < 1) {
                requestAnimationFrame(step2);
              } else {
                el.remove();
                resolve(name);
              }
            }
            requestAnimationFrame(step2);
          }
        }
        requestAnimationFrame(step1);
      });
    },
    [getFxContainer]
  );

  const handleRockBroken = useCallback(() => {
    const count = 2 + Math.floor(Math.random() * 4);
    const picks: MaterialName[] = [];
    for (let i = 0; i < count; i++) picks.push(MATERIALS[Math.floor(Math.random() * MATERIALS.length)]);
    const now = performance.now();
    const rect = lastRockRectRef.current;
    const fallBase = rect ? rect.height * 0.15 : 24;
    const common = { duration1: 520, spread: 56, lift: 22, fall: 12 + fallBase, start: now + 30 };
    const promises = picks.map((name) => spawnMaterialDrop(name, 0, common));
    Promise.all(promises).then((results) => {
      const delta: Partial<Record<MaterialName, number>> = {};
      results.forEach((n) => {
        delta[n] = (delta[n] || 0) + 1;
      });
      setMaterialAmounts((prev) => {
        const next = { ...prev };
        (Object.keys(delta) as MaterialName[]).forEach((k) => {
          next[k] = prev[k] + (delta[k] || 0);
        });
        return next;
      });
    });
  }, [spawnMaterialDrop, setMaterialAmounts]);

  const spawnIconParticles = useCallback((sourceEl: HTMLElement, src: string) => {
    const numParticles = 10;
    const durationMs = 420;
    const start = performance.now();
    const rect = sourceEl.getBoundingClientRect();
    const startX = rect.left + rect.width / 2;
    const startY = rect.top + rect.height / 2 - 12;
    const baseSize = Math.max(14, Math.min(28, rect.width * 0.7));
    const els: HTMLImageElement[] = [];
    for (let i = 0; i < numParticles; i++) {
      const el = document.createElement("img");
      el.src = src;
      el.draggable = false;
      el.style.position = "fixed";
      el.style.left = "0";
      el.style.top = "0";
      el.style.width = `${baseSize}px`;
      el.style.height = `${baseSize}px`;
      el.style.pointerEvents = "none";
      el.style.zIndex = "90003";
      el.style.willChange = "transform, opacity";
      el.style.transform = `translate3d(${startX - baseSize / 2}px, ${startY - baseSize / 2}px, 0) scale(1)`;
      el.style.opacity = "1";
      document.body.appendChild(el);
      els.push(el);
    }
    const angles = els.map((_, i) => (i / numParticles) * Math.PI * 2 + Math.random() * (Math.PI / numParticles) - Math.PI / 2);
    const distances = els.map(() => 60 + Math.random() * 80);
    const rotations = els.map(() => (Math.random() - 0.5) * 0.4);
    function easeOutCubic(t: number) {
      return 1 - Math.pow(1 - t, 3);
    }
    function step(now: number) {
      const t = Math.min(1, (now - start) / durationMs);
      const e = easeOutCubic(t);
      for (let i = 0; i < els.length; i++) {
        const dx = Math.cos(angles[i]) * distances[i] * e;
        const dy = Math.sin(angles[i]) * distances[i] * e + 0.35 * distances[i] * e * e;
        const s = 1 - 0.35 * e;
        const r = rotations[i] * 90 * e;
        els[i].style.transform = `translate3d(${startX - baseSize / 2 + dx}px, ${startY - baseSize / 2 + dy}px, 0) scale(${s}) rotate(${r}deg)`;
        els[i].style.opacity = `${1 - e}`;
      }
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        for (const el of els) el.remove();
      }
    }
    requestAnimationFrame(step);
  }, []);

  const handleMaterialItemTap = useCallback(
    (name: MaterialName, url: string | null) => (event: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
      event.stopPropagation();
      event.preventDefault();
      if (!url) return;
      const currentTarget = event.currentTarget as HTMLDivElement;
      const img = currentTarget.querySelector("img");
      if (!img) return;
      spawnIconParticles(img as HTMLImageElement, url);
    },
    [spawnIconParticles]
  );

  const handleLayerTap = useCallback(
    (event: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
      const heroEl = islandHeroImgRef.current;
      if (!heroEl) return;
      const rect = heroEl.getBoundingClientRect();
      let clientX = 0;
      let clientY = 0;
      const anyEvent = event as any;
      if (anyEvent.touches && anyEvent.touches[0]) {
        clientX = anyEvent.touches[0].clientX;
        clientY = anyEvent.touches[0].clientY;
      } else {
        clientX = (event as React.MouseEvent).clientX;
        clientY = (event as React.MouseEvent).clientY;
      }
      const inside = clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
      if (!inside) {
        handleIslandClose(event as unknown as React.MouseEvent | React.TouchEvent);
        return;
      }
      const rx = Math.floor(clientX - rect.left);
      const ry = Math.floor(clientY - rect.top);
      const drew = drawHeroIntoHitCanvas();
      if (!drew) {
        event.stopPropagation();
        event.preventDefault();
        return;
      }
      const canvas = heroHitCanvasRef.current;
      if (!canvas) {
        event.stopPropagation();
        event.preventDefault();
        return;
      }
      const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | null;
      if (!ctx) {
        event.stopPropagation();
        event.preventDefault();
        return;
      }
      let alpha = 255;
      try {
        const data = ctx.getImageData(rx, ry, 1, 1).data;
        alpha = data[3];
      } catch {}
      if (alpha < 16) {
        handleIslandClose(event as unknown as React.MouseEvent | React.TouchEvent);
        return;
      }
      event.stopPropagation();
      event.preventDefault();
    },
    [handleIslandClose, drawHeroIntoHitCanvas]
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
            <MaterialsBar $visible={islandOverlayVisible && !islandClosing}>
              {MATERIALS.map((name) => (
                <MaterialItem
                  ref={(el) => {
                    materialItemRefs.current[name] = el;
                  }}
                  key={name}
                  onClick={!isMobile ? handleMaterialItemTap(name, materialUrls[name]) : undefined}
                  onTouchStart={isMobile ? handleMaterialItemTap(name, materialUrls[name]) : undefined}>
                  {materialUrls[name] && <MaterialIcon src={materialUrls[name] || ""} alt="" draggable={false} />}
                  <MaterialAmount>{materialAmounts[name]}</MaterialAmount>
                </MaterialItem>
              ))}
            </MaterialsBar>
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
                <RockLayer ref={rockLayerRef} $visible={!islandClosing} onClick={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
                  <Rock heightPct={75} onBroken={handleRockBroken} />
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
