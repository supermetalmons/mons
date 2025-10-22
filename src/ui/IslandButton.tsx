import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { isMobile } from "../utils/misc";
import styled from "styled-components";
import { didDismissSomethingWithOutsideTapJustNow } from "./BottomControls";
import { closeAllKindsOfPopups } from "./MainMenu";
import IslandRock, { IslandRockHandle } from "./IslandRock";
import { soundPlayer } from "../utils/SoundPlayer";
import { playSounds } from "../content/sounds";
import { idle as islandMonsIdle, mining as islandMonsMining, shadow as islandMonsShadow } from "../assets/islandMons";
import { getOwnDrainerId } from "../utils/namedMons";
import { Sound } from "../utils/gameModels";

const ButtonEl = styled.button<{ $hidden: boolean; $dimmed: boolean }>`
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
    transform: translateY(1px) scale(${(p) => (p.$dimmed ? 1 : 1.3)});
    filter: ${(p) => (p.$dimmed ? "grayscale(1) brightness(0.96)" : "none")};
    opacity: ${(p) => (p.$dimmed ? 0.78 : 1)};
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
  font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, "Liberation Mono", "Courier New", monospace;
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
  transition: opacity 260ms ease;
  opacity: ${(p) => (p.$visible ? 1 : 0)};
  -webkit-tap-highlight-color: transparent;
  -webkit-touch-callout: none;
  user-select: none;
  touch-action: none;
  -webkit-user-select: none;
`;

const DudeLayer = styled.div<{ $visible: boolean }>`
  position: absolute;
  left: 40%;
  transform: translateX(-50%);
  top: 11%;
  height: 20%;
  pointer-events: none;
  transition: opacity 260ms ease;
  opacity: ${(p) => (p.$visible ? 1 : 0)};
  -webkit-tap-highlight-color: transparent;
  -webkit-touch-callout: none;
  user-select: none;
  touch-action: none;
  -webkit-user-select: none;
`;

const DudeImg = styled.img`
  position: absolute;
  bottom: 0;
  right: calc(100% + 4%);
  height: 85%;
  width: auto;
  display: block;
  pointer-events: none;
  transform: scale(2.25);
  transform-origin: bottom right;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
`;

const HeroWrap = styled.div`
  position: relative;
  display: inline-block;
`;

const WalkOverlay = styled.div`
  position: absolute;
  inset: 0;
  pointer-events: none;
`;

const ShadowImg = styled.img`
  position: absolute;
  left: 50%;
  top: 0;
  width: auto;
  height: auto;
  transform: translate(-50%, -50%);
  pointer-events: none;
  opacity: 0.23;
  transition: opacity 260ms ease;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
`;

const DUDE_ANCHOR_FRAC = 0.77;
const INITIAL_DUDE_Y_SHIFT = -0.645;
const INITIAL_DUDE_X_SHIFT = -0.1;
const INITIAL_DUDE_FACING_LEFT = false;
const ALTERNATE_DUDE_X_SHIFT = 0.3;
const ROCK_BOX_INSET_LEFT_FRAC = 0.0;
const ROCK_BOX_INSET_RIGHT_FRAC = 0.0;
const ROCK_BOX_INSET_TOP_FRAC = 0.02;
const ROCK_BOX_INSET_BOTTOM_FRAC = 0.24;
const SHOW_DEBUG_ISLAND_BOUNDS = false;
const SAFE_POINT_AREA_ELLIPSE_CENTER_OFFSET_X = 0.0;
const SAFE_POINT_AREA_ELLIPSE_CENTER_OFFSET_Y = 0.042;
const DUDE_BOUNDS_WIDTH_FRAC = 0.12;
const DUDE_BOUNDS_HEIGHT_FRAC = 0.22;
const SAFE_POINT_AREA_ELLIPSE_RADIUS_FRAC_X = 0.63;
const SAFE_POINT_AREA_ELLIPSE_RADIUS_FRAC_Y = 0.36;
const SAFE_POINT_EDGE_INSET = 0.003;
const SAFE_POINT_SLIDE_MIN_DIST = 0.012;
const SAFE_POINT_EDGE_SWITCH_HYST2 = 0.00002;
const SAFE_POINT_VERTEX_T_EPS = 0.01;
const SAFE_POINTER_MOVE_EPS = 0.0009;
const FACING_DX_EPS = 0.006;
const FACING_FLIP_HYST_MS = 160;
const DudeSpriteWrap = styled.div`
  position: absolute;
  width: auto;
  height: 45%;
  transform: translate(-50%, -${DUDE_ANCHOR_FRAC * 100}%);
  pointer-events: none;
  transition: opacity 260ms ease;
`;

const DudeSpriteImg = styled.img<{ $facingLeft: boolean }>`
  width: auto;
  height: 100%;
  transform: scaleX(${(p) => (p.$facingLeft ? -1 : 1)});
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  pointer-events: none;
`;

const DudeSpriteFrame = styled.div<{ $facingLeft: boolean }>`
  position: absolute;
  left: 0;
  top: 0;
  width: auto;
  height: 100%;
  overflow: hidden;
  transform: scaleX(${(p) => (p.$facingLeft ? -1 : 1)});
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  pointer-events: none;
`;

const DudeSpriteStrip = styled.img`
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  width: auto;
  will-change: transform;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  pointer-events: none;
`;

const MON_REL_X = 0.63;
const MON_REL_Y = 0.275;
const MON_HEIGHT_FRAC = 0.15;
const MON_BASELINE_Y_OFFSET = 0.03;
const MON_BOUNDS_WIDTH_FRAC = 0.115;
const MON_BOUNDS_X_SHIFT = 0.0675;

const MON_BOUNDS_WIDTH_FRAC_OVERRIDES: Record<string, number> = {
  royal_aguapwoshi_drainer: 0.09,
  omom_drainer: 0.1,
  supermetaldrop_drainer: 0.1,
  deino_drainer: 0.09,
};
const getMonBoundsWidthFrac = (monIdOrKey: string | null) => {
  if (!monIdOrKey) return MON_BOUNDS_WIDTH_FRAC;
  return MON_BOUNDS_WIDTH_FRAC_OVERRIDES[monIdOrKey] ?? MON_BOUNDS_WIDTH_FRAC;
};

const MonLayer = styled.div<{ $visible: boolean }>`
  position: absolute;
  inset: 0;
  pointer-events: none;
  transition: opacity 260ms ease;
  opacity: ${(p) => (p.$visible ? 1 : 0)};
`;

const MonSpriteWrap = styled.div`
  position: absolute;
  width: auto;
  height: ${MON_HEIGHT_FRAC * 100}%;
  transform: translate(-50%, -${DUDE_ANCHOR_FRAC * 100}%);
  pointer-events: none;
  transition: opacity 260ms ease;
`;

const MonSpriteFrame = styled.div<{ $facingLeft: boolean }>`
  position: absolute;
  left: 0;
  top: 0;
  width: auto;
  height: 100%;
  overflow: hidden;
  transform: scaleX(${(p) => (p.$facingLeft ? -1 : 1)});
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  pointer-events: none;
`;

const MonSpriteStrip = styled.img`
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  width: auto;
  will-change: transform;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  pointer-events: none;
`;

type Props = {
  imageUrl?: string;
  dimmed?: boolean;
};

const DEFAULT_URL = "https://assets.mons.link/rocks/island.webp";

const MINING_FRAME_MS = 175;

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
const pickWeightedMaterial = (): MaterialName => {
  const r = Math.random() * 100;
  if (r < 30) return "dust";
  if (r < 55) return "slime";
  if (r < 75) return "gum";
  if (r < 90) return "metal";
  return "ice";
};

const materialImagePromises: Map<MaterialName, Promise<string | null>> = new Map();

export let hasIslandOverlayVisible: () => boolean = () => false;

const WALK_POLYGON: Array<{ x: number; y: number }> = [
  { x: 0.6124, y: 0.0808 },
  { x: 0.7692, y: 0.1099 },
  { x: 0.8934, y: 0.2132 },
  { x: 0.7162, y: 0.3836 },
  { x: 0.6509, y: 0.3586 },
  { x: 0.5186, y: 0.4519 },
  { x: 0.4201, y: 0.3845 },
  { x: 0.3077, y: 0.3942 },
  { x: 0.1007, y: 0.2229 },
  { x: 0.1805, y: 0.1389 },
  { x: 0.3018, y: 0.084 },
  { x: 0.4113, y: 0.0743 },
  { x: 0.4882, y: 0.0775 },
];

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

export function IslandButton({ imageUrl = DEFAULT_URL, dimmed = false }: Props) {
  const [islandImgLoaded, setIslandImgLoaded] = useState(false);
  const [islandNatural, setIslandNatural] = useState<{ w: number; h: number } | null>(null);
  const islandButtonImgRef = useRef<HTMLImageElement | null>(null);
  const islandButtonRef = useRef<HTMLButtonElement | null>(null);
  const islandHeroImgRef = useRef<HTMLImageElement | null>(null);
  const [islandOverlayShown, setIslandOverlayShown] = useState(false);
  const [islandOverlayVisible, setIslandOverlayVisible] = useState(false);
  const [walkReady, setWalkReady] = useState(false);
  const [islandActive, setIslandActive] = useState(false);
  const [islandAnimating, setIslandAnimating] = useState(false);
  const [islandClosing, setIslandClosing] = useState(false);
  const [islandOpening, setIslandOpening] = useState(false);
  const [islandTranslate, setIslandTranslate] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [islandScale, setIslandScale] = useState<{ x: number; y: number }>({ x: 1, y: 1 });
  const overlayJustOpenedAtRef = useRef<number>(0);
  const [resolvedUrl, setResolvedUrl] = useState<string>(imageUrl);
  const heroHitCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayActiveRef = useRef<boolean>(false);
  const [decorVisible, setDecorVisible] = useState(false);
  const [materialAmounts, setMaterialAmounts] = useState<Record<MaterialName, number>>(() => {
    const entries = MATERIALS.map((n) => [n, 0] as const);
    return Object.fromEntries(entries) as Record<MaterialName, number>;
  });
  const [materialUrls, setMaterialUrls] = useState<Record<MaterialName, string | null>>(() => {
    const initial: Partial<Record<MaterialName, string | null>> = {};
    MATERIALS.forEach((n) => (initial[n] = null));
    return initial as Record<MaterialName, string | null>;
  });
  const [dudeVisible, setDudeVisible] = useState(false);
  const [monVisible, setMonVisible] = useState(false);
  const materialItemRefs = useRef<Record<MaterialName, HTMLDivElement | null>>({ dust: null, slime: null, gum: null, metal: null, ice: null });
  const rockLayerRef = useRef<HTMLDivElement | null>(null);
  const rockRef = useRef<IslandRockHandle | null>(null);
  const fxContainerRef = useRef<HTMLDivElement | null>(null);
  const lastRockRectRef = useRef<DOMRect | null>(null);
  const [rockIsBroken, setRockIsBroken] = useState(false);
  const walkSuppressedUntilRef = useRef<number>(0);
  const [rockReady, setRockReady] = useState(false);
  const rockBoxRef = useRef<{ left: number; top: number; right: number; bottom: number } | null>(null);
  const [rockBottomY, setRockBottomY] = useState<number>(1);

  const walkPoints = WALK_POLYGON;

  const [heroSize, setHeroSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  const [dudePos, setDudePos] = useState<{ x: number; y: number }>({ x: 0.4 + INITIAL_DUDE_X_SHIFT, y: 0.78 + INITIAL_DUDE_Y_SHIFT });
  const [dudeFacingLeft, setDudeFacingLeft] = useState<boolean>(false);

  const origDudeImgRef = useRef<HTMLImageElement | null>(null);
  const hasSyncedDudeRef = useRef<boolean>(false);
  const initialDudePosRef = useRef<{ x: number; y: number } | null>({ x: 0.4 + INITIAL_DUDE_X_SHIFT, y: 0.78 + INITIAL_DUDE_Y_SHIFT });
  const dudeWrapRef = useRef<HTMLDivElement | null>(null);

  const moveAnimRef = useRef<{ start: number; from: { x: number; y: number }; to: { x: number; y: number }; duration: number } | null>(null);
  const rafRef = useRef<number | null>(null);

  const [miningPlaying, setMiningPlaying] = useState(false);
  const miningFrameWrapRef = useRef<HTMLDivElement | null>(null);
  const miningStripImgRef = useRef<HTMLImageElement | null>(null);
  const miningImageRef = useRef<HTMLImageElement | null>(null);
  const miningAnimRef = useRef<{ start: number; raf: number | null; lastFrame: number } | null>(null);

  const [monPos, setMonPos] = useState<{ x: number; y: number } | null>(null);
  const [monFacingLeft, setMonFacingLeft] = useState<boolean>(false);
  const [monSpriteData, setMonSpriteData] = useState<string>("");
  const [monKey, setMonKey] = useState<string | null>(null);

  const monWrapRef = useRef<HTMLDivElement | null>(null);
  const monFrameWrapRef = useRef<HTMLDivElement | null>(null);
  const monStripImgRef = useRef<HTMLImageElement | null>(null);
  const monAnimRef = useRef<{ start: number; raf: number | null; lastFrame: number } | null>(null);
  const monNaturalSizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const monResizeObserverRef = useRef<ResizeObserver | null>(null);
  const monFrameWidthRef = useRef<number>(0);
  const monFlipTimerRef = useRef<number | null>(null);
  const monPetTimerRef = useRef<number | null>(null);
  const initialMonPosRef = useRef<{ x: number; y: number } | null>(null);

  const updateMonStripSizing = useCallback(() => {
    const wrap = monWrapRef.current as HTMLDivElement | null;
    const frameWrap = monFrameWrapRef.current as HTMLDivElement | null;
    const stripImg = monStripImgRef.current as HTMLImageElement | null;
    const nat = monNaturalSizeRef.current;
    if (!wrap || !frameWrap || !stripImg || !nat.w || !nat.h) return;
    const frameCount = 4;
    if (!heroSize.h) return;
    const frameWidth = Math.floor(nat.w / frameCount) || 1;
    const targetHeight = Math.max(1, Math.round(heroSize.h * MON_HEIGHT_FRAC));
    const targetWidth = Math.max(1, Math.round((targetHeight * frameWidth) / nat.h));
    frameWrap.style.width = `${targetWidth}px`;
    frameWrap.style.height = `${targetHeight}px`;
    stripImg.style.height = `${targetHeight}px`;
    stripImg.style.width = `${targetWidth * frameCount}px`;
    monFrameWidthRef.current = targetWidth;
    const currentFrameIndex = Math.max(0, monAnimRef.current?.lastFrame ?? 0);
    const offset = currentFrameIndex * targetWidth;
    stripImg.style.transform = `translateX(${-offset}px)`;
  }, [heroSize.h]);

  hasIslandOverlayVisible = () => {
    return islandOverlayVisible || islandClosing || islandOpening;
  };

  useEffect(() => {
    const img = new Image();
    img.src = `data:image/png;base64,${islandMonsMining}`;
    miningImageRef.current = img;
  }, []);

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
    overlayActiveRef.current = islandOverlayVisible || islandOpening || islandClosing;
  }, [islandOverlayVisible, islandOpening, islandClosing]);

  useEffect(() => {
    let timer: number | null = null;
    if (islandOverlayVisible && !islandClosing) {
      timer = window.setTimeout(() => {
        setDecorVisible(true);
        requestAnimationFrame(() => setDudeVisible(true));
      }, 120);
    } else {
      setDecorVisible(false);
      setDudeVisible(false);
      setMonVisible(false);
    }
    return () => {
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [islandOverlayVisible, islandClosing]);

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
    setHeroSize({ w: Math.max(1, Math.round(rect.width)), h: Math.max(1, Math.round(rect.height)) });
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

  useEffect(() => {
    const onResize = () => {
      const hero = islandHeroImgRef.current;
      if (!hero) return;
      const rect = hero.getBoundingClientRect();
      setHeroSize({ w: Math.max(1, Math.round(rect.width)), h: Math.max(1, Math.round(rect.height)) });
    };
    if (islandOverlayVisible) {
      window.addEventListener("resize", onResize);
      onResize();
    }
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, [islandOverlayVisible]);

  const syncDudePosFromOriginal = useCallback(() => {
    if (hasSyncedDudeRef.current) return;
    const hero = islandHeroImgRef.current;
    const origDude = origDudeImgRef.current;
    if (!hero || !origDude) return;
    const hbox = hero.getBoundingClientRect();
    const db = origDude.getBoundingClientRect();
    const cxCenter = (db.left + db.width / 2 - hbox.left) / hbox.width;
    const cx = cxCenter + INITIAL_DUDE_X_SHIFT;
    const cyBottom = (db.bottom - hbox.top) / hbox.height;
    const cy = cyBottom + INITIAL_DUDE_Y_SHIFT;
    if (isFinite(cx) && isFinite(cy)) {
      const clampedX = Math.max(0, Math.min(1, cx));
      const clampedY = Math.max(0, Math.min(1, cy));
      setDudePos({ x: clampedX, y: clampedY });
      initialDudePosRef.current = { x: clampedX, y: clampedY };
      hasSyncedDudeRef.current = true;
    }
  }, []);

  useLayoutEffect(() => {
    if (!islandOverlayVisible) return;
    if (hasSyncedDudeRef.current) return;
    const cx = 0.4 + INITIAL_DUDE_X_SHIFT;
    const cy = 0.78 + INITIAL_DUDE_Y_SHIFT;
    const clampedX = Math.max(0, Math.min(1, cx));
    const clampedY = Math.max(0, Math.min(1, cy));
    setDudePos({ x: clampedX, y: clampedY });
    initialDudePosRef.current = { x: clampedX, y: clampedY };
    hasSyncedDudeRef.current = true;
  }, [islandOverlayVisible]);

  const initializeWalkPolygonIfNeeded = useCallback(() => {}, []);

  useEffect(() => {
    if (!islandOverlayVisible || islandOpening || islandClosing) return;
    if (!heroSize.w || !heroSize.h) return;
    if (walkReady) return;
    initializeWalkPolygonIfNeeded();
  }, [islandOverlayVisible, islandOpening, islandClosing, heroSize.w, heroSize.h, walkReady, initializeWalkPolygonIfNeeded]);

  const pickRandomPointInWalkArea = useCallback(() => {
    if (initialMonPosRef.current) return initialMonPosRef.current;
    const poly = walkPoints;
    let minX = 1;
    let maxX = 0;
    let minY = 1;
    let maxY = 0;
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const isInside = (x: number, y: number) => {
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x;
        const yi = poly[i].y;
        const xj = poly[j].x;
        const yj = poly[j].y;
        const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
        if (intersect) inside = !inside;
      }
      return inside;
    };
    for (let k = 0; k < 500; k++) {
      const x = minX + Math.random() * (maxX - minX);
      const y = minY + Math.random() * (maxY - minY);
      if (isInside(x, y)) {
        const pt = { x, y };
        initialMonPosRef.current = pt;
        return pt;
      }
    }
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < poly.length; i++) {
      cx += poly[i].x;
      cy += poly[i].y;
    }
    cx /= Math.max(1, poly.length);
    cy /= Math.max(1, poly.length);
    const fallback = isInside(cx, cy) ? { x: cx, y: cy } : { x: MON_REL_X, y: MON_REL_Y };
    initialMonPosRef.current = fallback;
    return fallback;
  }, [walkPoints]);

  useEffect(() => {
    let mounted = true;
    if (!islandOverlayVisible) return;
    const pt = pickRandomPointInWalkArea();
    setMonPos(pt);
    setMonFacingLeft(Math.random() < 0.5);
    (async () => {
      const { getSpriteByKey } = await import("../assets/monsSprites");
      const key = getOwnDrainerId();
      const data = getSpriteByKey(key);
      if (!mounted) return;
      setMonSpriteData(data);
      setMonKey(key);
    })();
    return () => {
      mounted = false;
    };
  }, [islandOverlayVisible, pickRandomPointInWalkArea]);

  useEffect(() => {
    if (!decorVisible || islandClosing || !islandOverlayVisible) return;
    if (!monSpriteData || !monPos) return;
    const tick = () => {
      if (!overlayActiveRef.current) return;
      if (Math.random() < 0.5) setMonFacingLeft((prev) => !prev);
    };
    monFlipTimerRef.current = window.setInterval(tick, 15000);
    return () => {
      if (monFlipTimerRef.current !== null) {
        clearInterval(monFlipTimerRef.current);
        monFlipTimerRef.current = null;
      }
    };
  }, [decorVisible, islandClosing, islandOverlayVisible, monSpriteData, monPos]);

  const petMon = useCallback(() => {
    const frame = monFrameWrapRef.current;
    if (!frame) return;
    const baseX = monFacingLeft ? -1 : 1;
    try {
      frame.style.transformOrigin = "50% 100%";
      frame.style.transition = "transform 80ms ease-out";
      frame.style.transform = `scale(${baseX * 1.06}, 0.86)`;
    } catch {}
    if (monPetTimerRef.current !== null) {
      clearTimeout(monPetTimerRef.current);
      monPetTimerRef.current = null;
    }
    monPetTimerRef.current = window.setTimeout(() => {
      try {
        frame.style.transition = "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)";
        frame.style.transform = `scale(${baseX}, 1)`;
      } catch {}
      if (monPetTimerRef.current !== null) {
        clearTimeout(monPetTimerRef.current);
        monPetTimerRef.current = null;
      }
      monPetTimerRef.current = window.setTimeout(() => {
        try {
          frame.style.removeProperty("transform");
          frame.style.removeProperty("transition");
          frame.style.removeProperty("transform-origin");
        } catch {}
        monPetTimerRef.current = null;
      }, 230);
    }, 100);
  }, [monFacingLeft]);

  useEffect(() => {
    return () => {
      if (monPetTimerRef.current !== null) {
        clearTimeout(monPetTimerRef.current);
        monPetTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!decorVisible || islandClosing) return;
    if (!monSpriteData || !monPos) return;

    requestAnimationFrame(() => {
      const wrap = monWrapRef.current;
      const frameWrap = monFrameWrapRef.current;
      const stripImg = monStripImgRef.current;
      if (!wrap || !frameWrap || !stripImg) return;
      const img = new Image();
      img.src = `data:image/webp;base64,${monSpriteData}`;
      const startAnim = () => {
        const frameCount = 4;
        monNaturalSizeRef.current = { w: img.naturalWidth || 1, h: img.naturalHeight || 1 };
        stripImg.style.visibility = "hidden";
        updateMonStripSizing();
        stripImg.style.transform = `translateX(0px)`;
        monAnimRef.current = { start: performance.now(), raf: null, lastFrame: -1 };
        const MON_FRAME_MS = 220;
        setTimeout(() => {
          if (!monAnimRef.current) return;
          const step = () => {
            const anim = monAnimRef.current;
            if (!anim) return;
            if (!overlayActiveRef.current) {
              monAnimRef.current = null;
              setMonVisible(false);
              return;
            }
            const elapsed = performance.now() - anim.start;
            const rawFrame = Math.floor(elapsed / MON_FRAME_MS);
            const frame = ((rawFrame % frameCount) + frameCount) % frameCount;
            if (frame !== anim.lastFrame) anim.lastFrame = frame;
            const currentWidth = Math.max(0, Math.round(monFrameWidthRef.current || 0));
            const offset = frame * currentWidth;
            stripImg.style.transform = `translateX(${-offset}px)`;
            if (stripImg.style.visibility !== "visible") {
              stripImg.style.visibility = "visible";
              setMonVisible(true);
            }

            anim.raf = requestAnimationFrame(step);
          };
          monAnimRef.current.raf = requestAnimationFrame(step);
        }, 260);

        try {
          if (typeof ResizeObserver !== "undefined" && wrap) {
            const ro = new ResizeObserver(() => updateMonStripSizing());
            monResizeObserverRef.current = ro;
            ro.observe(wrap);
          }
        } catch {}
      };
      if (img.complete) startAnim();
      else img.onload = () => startAnim();
    });
    const cleanupWrap = monWrapRef.current;
    return () => {
      const anim = monAnimRef.current;
      if (anim && anim.raf) cancelAnimationFrame(anim.raf);
      monAnimRef.current = null;
      try {
        const ro = monResizeObserverRef.current;
        if (ro && cleanupWrap) ro.unobserve(cleanupWrap);
      } catch {}
      monResizeObserverRef.current = null;
      setMonVisible(false);
    };
  }, [decorVisible, islandClosing, monSpriteData, monPos, updateMonStripSizing]);

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

  const measureHeroSize = useCallback(() => {
    const hero = islandHeroImgRef.current;
    if (!hero) return;
    const rect = hero.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    setHeroSize({ w, h });
  }, []);

  const updateRockBox = useCallback(() => {
    if (!rockReady) return;
    const hero = islandHeroImgRef.current;
    const rockEl = rockLayerRef.current;
    if (!hero || !rockEl) return;
    const h = hero.getBoundingClientRect();
    const r = rockEl.getBoundingClientRect();
    if (h.width <= 0 || h.height <= 0) return;
    const rawLeft = (r.left - h.left) / h.width;
    const rawTop = (r.top - h.top) / h.height;
    const rawRight = (r.right - h.left) / h.width;
    const rawBottom = (r.bottom - h.top) / h.height;
    const w = Math.max(0, rawRight - rawLeft);
    const hh = Math.max(0, rawBottom - rawTop);
    let left = rawLeft + ROCK_BOX_INSET_LEFT_FRAC * w;
    let right = rawRight - ROCK_BOX_INSET_RIGHT_FRAC * w;
    let top = rawTop + ROCK_BOX_INSET_TOP_FRAC * hh;
    let bottom = rawBottom - ROCK_BOX_INSET_BOTTOM_FRAC * hh;
    left = Math.max(0, Math.min(1, left));
    right = Math.max(0, Math.min(1, right));
    top = Math.max(0, Math.min(1, top));
    bottom = Math.max(0, Math.min(1, bottom));
    if (right < left) right = left;
    if (bottom < top) bottom = top;

    rockBoxRef.current = { left, top, right, bottom };
    setRockBottomY(bottom);
  }, [rockReady]);

  useEffect(() => {
    if (!islandOverlayVisible) return;
    updateRockBox();
    const onResize = () => updateRockBox();
    window.addEventListener("resize", onResize);
    let ro: ResizeObserver | null = null;
    const node = rockLayerRef.current;
    try {
      if (node && typeof ResizeObserver !== "undefined") {
        ro = new ResizeObserver(() => updateRockBox());
        ro.observe(node);
      }
    } catch {}
    return () => {
      window.removeEventListener("resize", onResize);
      try {
        if (ro && node) ro.unobserve(node);
      } catch {}
    };
  }, [islandOverlayVisible, updateRockBox]);

  useEffect(() => {
    if (!islandOverlayVisible || !decorVisible) return;
    updateRockBox();
  }, [decorVisible, islandOverlayVisible, updateRockBox]);

  useEffect(() => {
    if (!islandOverlayVisible) return;
    try {
      requestAnimationFrame(() => updateRockBox());
    } catch {}
  }, [resolvedUrl, islandOverlayVisible, updateRockBox]);

  const handleIslandOpen = useCallback(
    (event: React.MouseEvent<HTMLButtonElement> | React.TouchEvent<HTMLButtonElement>) => {
      soundPlayer.initializeOnUserInteraction(true).then(() => {
        playSounds([Sound.IslandShowUp]);
      });
      closeAllKindsOfPopups();
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
      setRockIsBroken(false);
      setRockReady(false);
      try {
        rockBoxRef.current = null;
        setRockBottomY(1);
      } catch {}
      setIslandTranslate({ x: deltaX, y: deltaY });
      setIslandScale({ x: uniformScale, y: uniformScale });
      requestAnimationFrame(() => {
        setIslandActive(true);
        setIslandTranslate({ x: 0, y: 0 });
        setIslandScale({ x: 1, y: 1 });
        setIslandOverlayVisible(true);
        setWalkReady(false);
        try {
          updateRockBox();
        } catch {}
      });
    },
    [islandImgLoaded, islandNatural, updateRockBox]
  );

  const handleIslandClose = useCallback(
    (event?: React.MouseEvent | React.TouchEvent) => {
      if (isMobile && Date.now() - overlayJustOpenedAtRef.current < 250) {
        return;
      }
      didDismissSomethingWithOutsideTapJustNow();
      try {
        const container = fxContainerRef.current;
        if (container && container.parentNode) {
          container.parentNode.removeChild(container);
        }
      } catch {}
      playSounds([Sound.IslandClosing]);
      fxContainerRef.current = null;
      const anim = miningAnimRef.current;
      if (anim && anim.raf) cancelAnimationFrame(anim.raf);
      miningAnimRef.current = null;
      setMiningPlaying(false);
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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        handleIslandClose();
      }
    };
    if (islandOverlayVisible || islandOpening || islandClosing) {
      document.addEventListener("keydown", handleKeyDown, true);
      return () => {
        document.removeEventListener("keydown", handleKeyDown, true);
      };
    }
  }, [islandOverlayVisible, islandOpening, islandClosing, handleIslandClose]);

  const handleIslandTransitionEnd = useCallback(
    (e: React.TransitionEvent) => {
      if (e.propertyName !== "transform") return;
      if (islandActive) {
        setIslandAnimating(false);
        setIslandOpening(false);
        try {
          requestAnimationFrame(() => {
            measureHeroSize();
            requestAnimationFrame(() => {
              initializeWalkPolygonIfNeeded();
              setWalkReady(true);
            });
          });
        } catch {}
        return;
      }
      setIslandAnimating(false);
    },
    [islandActive, initializeWalkPolygonIfNeeded, measureHeroSize]
  );

  const handleOverlayTransitionEnd = useCallback(
    (e: React.TransitionEvent<HTMLDivElement>) => {
      if (e.propertyName !== "opacity") return;
      if (!islandOverlayVisible) {
        const container = fxContainerRef.current;
        if (container && container.parentNode) {
          try {
            container.parentNode.removeChild(container);
          } catch {}
        }
        fxContainerRef.current = null;
        setIslandOverlayShown(false);
        setIslandClosing(false);
        setIslandTranslate({ x: 0, y: 0 });
        setIslandScale({ x: 1, y: 1 });
        const anim = monAnimRef.current;
        if (anim && anim.raf) cancelAnimationFrame(anim.raf);
        monAnimRef.current = null;
        setMonSpriteData("");
        setMonPos(null);
        setMonKey(null);
      }
      try {
        updateRockBox();
      } catch {}
    },
    [islandOverlayVisible, updateRockBox]
  );

  const pointInPolygon = useCallback((x: number, y: number, poly: Array<{ x: number; y: number }>) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x;
      const yi = poly[i].y;
      const xj = poly[j].x;
      const yj = poly[j].y;
      const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }, []);

  const stopMoveAnim = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    moveAnimRef.current = null;
  }, []);

  const latestDudePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const moveTargetMetaRef = useRef<{ x: number; y: number; facingLeft: boolean; onArrive?: () => void } | null>(null);
  const dragModeRef = useRef<"none" | "polygon" | "ellipse">("none");
  const safeSlideEdgeRef = useRef<{ edgeIndex: number | null } | null>({ edgeIndex: null });
  const lastFacingFlipAtRef = useRef<number>(0);
  const lastFacingDirRef = useRef<boolean>(false);
  const lastEllipsePointerRef = useRef<{ x: number; y: number }>({ x: -1, y: -1 });
  useEffect(() => {
    latestDudePosRef.current = dudePos;
  }, [dudePos]);
  const decideFacingWithHysteresis = useCallback((from: { x: number; y: number }, to: { x: number; y: number }) => {
    const dx = to.x - from.x;
    if (Math.abs(dx) < FACING_DX_EPS) {
      return lastFacingDirRef.current;
    }
    const desiredLeft = dx < 0;
    if (desiredLeft !== lastFacingDirRef.current) {
      const now = performance.now();
      if (now - lastFacingFlipAtRef.current >= FACING_FLIP_HYST_MS) {
        lastFacingFlipAtRef.current = now;
        lastFacingDirRef.current = desiredLeft;
      }
    }
    return lastFacingDirRef.current;
  }, []);

  const startMiningAnimation = useCallback(() => {
    if (!dudeWrapRef.current) return;
    if (!miningImageRef.current) return;
    if (miningPlaying) return;
    setMiningPlaying(true);
    requestAnimationFrame(() => {
      const sheetImg = miningImageRef.current;
      const wrap = dudeWrapRef.current;
      const frameWrap = miningFrameWrapRef.current;
      const stripImg = miningStripImgRef.current;
      if (!sheetImg || !wrap || !frameWrap || !stripImg) {
        setMiningPlaying(false);
        return;
      }
      const wrapBox = wrap.getBoundingClientRect();
      const frameCount = 4;
      const frameWidth = Math.floor(sheetImg.naturalWidth / frameCount) || 1;
      const frameHeight = sheetImg.naturalHeight || 1;
      const targetHeight = Math.max(1, Math.round(wrapBox.height));
      const targetWidth = Math.max(1, Math.round((targetHeight * frameWidth) / frameHeight));

      frameWrap.style.width = `${targetWidth}px`;
      frameWrap.style.height = `${targetHeight}px`;
      stripImg.style.height = `${targetHeight}px`;
      stripImg.style.width = `${targetWidth * frameCount}px`;
      stripImg.style.transform = `translateX(0px)`;

      miningAnimRef.current = { start: performance.now(), raf: null, lastFrame: -1 };
      const step = () => {
        const anim = miningAnimRef.current;
        if (!anim) return;
        const elapsed = performance.now() - anim.start;
        const rawFrame = Math.floor(elapsed / MINING_FRAME_MS);
        const frame = Math.min(frameCount - 1, Math.max(0, rawFrame));
        if (frame !== anim.lastFrame) {
          const offset = frame * targetWidth;
          const tx = -offset;
          stripImg.style.transform = `translateX(${tx}px)`;
          anim.lastFrame = frame;
        }
        if (elapsed < frameCount * MINING_FRAME_MS) {
          anim.raf = requestAnimationFrame(step);
        } else {
          setMiningPlaying(false);
          miningAnimRef.current = null;
        }
      };
      miningAnimRef.current.raf = requestAnimationFrame(step);
    });
  }, [miningPlaying]);

  const startMoveTo = useCallback(
    (tx: number, ty: number) => {
      syncDudePosFromOriginal();
      const now = performance.now();
      let currentX = latestDudePosRef.current.x;
      let currentY = latestDudePosRef.current.y;
      const anim = moveAnimRef.current;
      if (anim) {
        const t = Math.min(1, (now - anim.start) / anim.duration);
        const ease = 1 - Math.pow(1 - t, 3);
        currentX = anim.from.x + (anim.to.x - anim.from.x) * ease;
        currentY = anim.from.y + (anim.to.y - anim.from.y) * ease;
      }
      const from = { x: currentX, y: currentY };
      const to = { x: tx, y: ty };
      setDudeFacingLeft(decideFacingWithHysteresis(from, to));
      const w = heroSize.w;
      const h = heroSize.h;
      const dx = (to.x - from.x) * w;
      const dy = (to.y - from.y) * h;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const speed = Math.max(60, Math.min(220, h * 0.45));
      const duration = (dist / speed) * 1000;
      moveAnimRef.current = { start: now, from, to, duration: Math.max(200, duration) };
      if (!rafRef.current) {
        const step = () => {
          if (!moveAnimRef.current) return;
          const n = performance.now();
          const t2 = Math.min(1, (n - moveAnimRef.current.start) / moveAnimRef.current.duration);
          const e2 = 1 - Math.pow(1 - t2, 3);
          const nx = moveAnimRef.current.from.x + (moveAnimRef.current.to.x - moveAnimRef.current.from.x) * e2;
          const ny = moveAnimRef.current.from.y + (moveAnimRef.current.to.y - moveAnimRef.current.from.y) * e2;
          let nextX = nx;
          let nextY = ny;
          setDudePos({ x: nextX, y: nextY });
          if (t2 < 1) {
            rafRef.current = requestAnimationFrame(step);
          } else {
            const targetMeta = moveTargetMetaRef.current;
            if (targetMeta) {
              const closeEnough = Math.hypot(nextX - targetMeta.x, nextY - targetMeta.y) < 0.012;
              if (closeEnough) {
                setDudeFacingLeft(targetMeta.facingLeft);
                try {
                  if (targetMeta.onArrive) targetMeta.onArrive();
                } catch {}
                moveTargetMetaRef.current = null;
              }
            } else {
              const initial = initialDudePosRef.current;
              if (initial) {
                const closeEnough = Math.hypot(nextX - initial.x, nextY - initial.y) < 0.012;
                if (closeEnough) setDudeFacingLeft(INITIAL_DUDE_FACING_LEFT);
              }
            }
            stopMoveAnim();
          }
        };
        rafRef.current = requestAnimationFrame(step);
      }
    },
    [heroSize.w, heroSize.h, stopMoveAnim, syncDudePosFromOriginal, decideFacingWithHysteresis]
  );

  const updateMoveTarget = useCallback(
    (tx: number, ty: number) => {
      const now = performance.now();
      const anim = moveAnimRef.current;
      let currentX = latestDudePosRef.current.x;
      let currentY = latestDudePosRef.current.y;
      if (anim) {
        const t = Math.min(1, (now - anim.start) / anim.duration);
        const ease = 1 - Math.pow(1 - t, 3);
        currentX = anim.from.x + (anim.to.x - anim.from.x) * ease;
        currentY = anim.from.y + (anim.to.y - anim.from.y) * ease;
      }
      const from = { x: currentX, y: currentY };
      const to = { x: tx, y: ty };
      setDudeFacingLeft(decideFacingWithHysteresis(from, to));
      const w = heroSize.w;
      const h = heroSize.h;
      const dx = (to.x - from.x) * w;
      const dy = (to.y - from.y) * h;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const speed = Math.max(60, Math.min(220, h * 0.45));
      const duration = (dist / speed) * 1000;
      moveAnimRef.current = { start: now, from, to, duration: Math.max(200, duration) };
      if (!rafRef.current) {
        const step = () => {
          if (!moveAnimRef.current) return;
          const n = performance.now();
          const tt = Math.min(1, (n - moveAnimRef.current.start) / moveAnimRef.current.duration);
          const e = 1 - Math.pow(1 - tt, 3);
          const nx = moveAnimRef.current.from.x + (moveAnimRef.current.to.x - moveAnimRef.current.from.x) * e;
          const ny = moveAnimRef.current.from.y + (moveAnimRef.current.to.y - moveAnimRef.current.from.y) * e;
          let nextX = nx;
          let nextY = ny;
          setDudePos({ x: nextX, y: nextY });
          if (tt < 1) {
            rafRef.current = requestAnimationFrame(step);
          } else {
            stopMoveAnim();
          }
        };
        rafRef.current = requestAnimationFrame(step);
      }
    },
    [heroSize.h, heroSize.w, stopMoveAnim, decideFacingWithHysteresis]
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
      walkSuppressedUntilRef.current = Math.max(walkSuppressedUntilRef.current, performance.now() + 777);
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
      el.setAttribute("data-fx", "material-drop");
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
          if (!overlayActiveRef.current) {
            el.remove();
            resolve(name);
            return;
          }
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
              if (!overlayActiveRef.current) {
                el.remove();
                resolve(name);
                return;
              }
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
    setRockIsBroken(true);
    setRockReady(false);
    const count = 2 + Math.floor(Math.random() * 4);
    const picks: MaterialName[] = [];
    for (let i = 0; i < count; i++) picks.push(pickWeightedMaterial());
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
    let fxContainer = fxContainerRef.current as HTMLDivElement | null;
    if (!fxContainer) {
      fxContainer = document.createElement("div");
      fxContainer.style.position = "fixed";
      fxContainer.style.left = "0";
      fxContainer.style.top = "0";
      fxContainer.style.right = "0";
      fxContainer.style.bottom = "0";
      fxContainer.style.pointerEvents = "none";
      fxContainer.style.zIndex = "90005";
      fxContainer.style.contain = "paint";
      fxContainer.style.isolation = "isolate";
      fxContainerRef.current = fxContainer;
      document.body.appendChild(fxContainer);
    }
    for (let i = 0; i < numParticles; i++) {
      const el = document.createElement("img");
      el.src = src;
      el.draggable = false;
      el.style.position = "absolute";
      el.style.left = "0";
      el.style.top = "0";
      el.style.width = `${baseSize}px`;
      el.style.height = `${baseSize}px`;
      el.style.pointerEvents = "none";
      el.style.zIndex = "90003";
      el.style.willChange = "transform, opacity";
      el.style.transform = `translate3d(${startX - baseSize / 2}px, ${startY - baseSize / 2}px, 0) scale(1)`;
      el.style.opacity = "1";
      el.setAttribute("data-fx", "icon-particle");
      fxContainer.appendChild(el);
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
      playSounds([Sound.MaterialButtonClick]);
      if (!url) return;
      const currentTarget = event.currentTarget as HTMLDivElement;
      const img = currentTarget.querySelector("img");
      if (!img) return;
      spawnIconParticles(img as HTMLImageElement, url);
    },
    [spawnIconParticles]
  );

  const isDraggingRef = useRef(false);

  const handlePointerStart = useCallback(
    (event: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
      const shouldSkipCloseForMaterialTarget = () => {
        const targetNode = (event.target as Node) || null;
        if (!targetNode) return false;
        const refs = materialItemRefs.current;
        for (const key in refs) {
          const el = refs[key as MaterialName];
          if (el && (el === targetNode || el.contains(targetNode))) {
            return true;
          }
        }
        return false;
      };
      const isInsideRockBox = (nx: number, ny: number) => {
        if (rockIsBroken) return false;
        const box = rockBoxRef.current;
        if (!rockReady || !box) return false;
        return nx >= box.left && nx <= box.right && ny >= box.top && ny <= box.bottom;
      };
      const isInsideMonBox = (nx: number, ny: number) => {
        if (!monPos) return false;
        const widthFrac = Math.max(0.001, Math.min(1, getMonBoundsWidthFrac(monKey)));
        const heightFrac = Math.max(0.001, Math.min(1, MON_HEIGHT_FRAC));
        const cx = (monPos.x ?? MON_REL_X) + MON_BOUNDS_X_SHIFT;
        const bottomY = (monPos.y ?? MON_REL_Y) + MON_BASELINE_Y_OFFSET;
        const left = cx - widthFrac * 0.5;
        const right = cx + widthFrac * 0.5;
        const top = bottomY - heightFrac;
        const bottom = bottomY;
        return nx >= left && nx <= right && ny >= top && ny <= bottom;
      };
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
      const getEllipseParamsEarly = () => {
        const box = rockBoxRef.current;
        if (!box) return null;
        const cx = (box.left + box.right) / 2 + SAFE_POINT_AREA_ELLIPSE_CENTER_OFFSET_X;
        const cy = (box.top + box.bottom) / 2 + SAFE_POINT_AREA_ELLIPSE_CENTER_OFFSET_Y;
        const rx = SAFE_POINT_AREA_ELLIPSE_RADIUS_FRAC_X;
        const ry = SAFE_POINT_AREA_ELLIPSE_RADIUS_FRAC_Y;
        return { cx, cy, rx, ry };
      };
      const nxxEarly = (clientX - rect.left) / Math.max(1, rect.width);
      const nyyEarly = (clientY - rect.top) / Math.max(1, rect.height);
      const isInsideEllipseEarly = (() => {
        const p = getEllipseParamsEarly();
        if (!p) return false;
        const dx = (nxxEarly - p.cx) / p.rx;
        const dy = (nyyEarly - p.cy) / p.ry;
        return dx * dx + dy * dy <= 1;
      })();
      const inside = clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
      if (!inside && !isInsideEllipseEarly) {
        if (shouldSkipCloseForMaterialTarget()) return;
        handleIslandClose(event as unknown as React.MouseEvent | React.TouchEvent);
        return;
      }
      const rx = Math.floor(clientX - rect.left);
      const ry = Math.floor(clientY - rect.top);
      const nx = rx / Math.max(1, rect.width);
      const ny = ry / Math.max(1, rect.height);

      if (isInsideRockBox(nx, ny)) {
        syncDudePosFromOriginal();
        const initial = initialDudePosRef.current || latestDudePosRef.current;
        const alternate = { x: initial.x + ALTERNATE_DUDE_X_SHIFT - INITIAL_DUDE_X_SHIFT, y: initial.y };
        const distToInitial = Math.hypot(dudePos.x - initial.x, dudePos.y - initial.y);
        const distToAlternate = Math.hypot(dudePos.x - alternate.x, dudePos.y - alternate.y);
        const targetPos = distToAlternate < distToInitial ? alternate : initial;
        const isAlternate = targetPos === alternate;
        const atTarget = Math.hypot(dudePos.x - targetPos.x, dudePos.y - targetPos.y) < 0.015;
        if (!atTarget) {
          startMiningAnimation();
          moveTargetMetaRef.current = { x: targetPos.x, y: targetPos.y, facingLeft: isAlternate ? !INITIAL_DUDE_FACING_LEFT : INITIAL_DUDE_FACING_LEFT };
          startMoveTo(targetPos.x, targetPos.y);
          playSounds([Sound.WalkToRock]);
        } else {
          try {
            rockRef.current?.tap();
          } catch {}
        }
        if ((event as any).preventDefault) (event as any).preventDefault();
        return;
      }
      const getEllipseParams = () => {
        const box = rockBoxRef.current;
        if (!box) return null;
        const cx = (box.left + box.right) / 2 + SAFE_POINT_AREA_ELLIPSE_CENTER_OFFSET_X;
        const cy = (box.top + box.bottom) / 2 + SAFE_POINT_AREA_ELLIPSE_CENTER_OFFSET_Y;
        const rx = SAFE_POINT_AREA_ELLIPSE_RADIUS_FRAC_X;
        const ry = SAFE_POINT_AREA_ELLIPSE_RADIUS_FRAC_Y;
        return { cx, cy, rx, ry };
      };
      const isInsideEllipse = (x: number, y: number) => {
        const p = getEllipseParams();
        if (!p) return false;
        const dx = (x - p.cx) / p.rx;
        const dy = (y - p.cy) / p.ry;
        return dx * dx + dy * dy <= 1;
      };
      const cross = (ax: number, ay: number, bx: number, by: number) => ax * by + 0 - ay * bx;
      const segmentIntersectionT = (p0: { x: number; y: number }, p1: { x: number; y: number }, q0: { x: number; y: number }, q1: { x: number; y: number }) => {
        const r = { x: p1.x - p0.x, y: p1.y - p0.y };
        const s = { x: q1.x - q0.x, y: q1.y - q0.y };
        const denom = cross(r.x, r.y, s.x, s.y);
        if (Math.abs(denom) < 1e-9) return null;
        const qp = { x: q0.x - p0.x, y: q0.y - p0.y };
        const t = cross(qp.x, qp.y, s.x, s.y) / denom;
        const u = cross(qp.x, qp.y, r.x, r.y) / denom;
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return t;
        return null;
      };
      const computeBoundaryStopPoint = (from: { x: number; y: number }, to: { x: number; y: number }, poly: Array<{ x: number; y: number }>) => {
        if (pointInPolygon(to.x, to.y, poly)) return to;
        let bestT: number | null = null;
        let bestEdge: { a: { x: number; y: number }; b: { x: number; y: number } } | null = null;
        let bestI: number | null = null;
        let bestJ: number | null = null;
        const n = poly.length;
        for (let i = 0, j = n - 1; i < n; j = i++) {
          const a = poly[j];
          const b = poly[i];
          const t = segmentIntersectionT(from, to, a, b);
          if (t === null) continue;
          if (t >= SAFE_POINT_VERTEX_T_EPS && t <= 1 - SAFE_POINT_VERTEX_T_EPS && (bestT === null || t + SAFE_POINT_EDGE_SWITCH_HYST2 < bestT)) {
            bestT = t;
            bestEdge = { a, b };
            bestI = i;
            bestJ = j;
          }
        }
        if (bestT === null) {
          for (let i = 0, j = n - 1; i < n; j = i++) {
            const a = poly[j];
            const b = poly[i];
            const t = segmentIntersectionT(from, to, a, b);
            if (t === null) continue;
            if (t >= 0 && t <= 1 && (bestT === null || t + SAFE_POINT_EDGE_SWITCH_HYST2 < bestT)) {
              bestT = t;
              bestEdge = { a, b };
              bestI = i;
              bestJ = j;
            }
          }
        }
        const eps = SAFE_POINT_EDGE_INSET;
        if (bestT !== null && bestEdge) {
          const tInside = Math.max(0, bestT - eps);
          const stop = { x: from.x + (to.x - from.x) * tInside, y: from.y + (to.y - from.y) * tInside };
          const closeToFrom = Math.hypot(stop.x - from.x, stop.y - from.y) < SAFE_POINT_SLIDE_MIN_DIST;
          if (!closeToFrom) return stop;
          let bestProj: { x: number; y: number; d2: number } | null = null;
          if (bestI !== null && bestJ !== null) {
            const idxs = [
              [bestJ, bestI],
              [bestI, (bestI + 1) % n],
              [(bestJ - 1 + n) % n, bestJ],
            ];
            for (let k = 0; k < idxs.length; k++) {
              const a = poly[idxs[k][0]];
              const b = poly[idxs[k][1]];
              const ex = b.x - a.x;
              const ey = b.y - a.y;
              const elen2 = ex * ex + ey * ey || 1;
              let tProj = ((to.x - a.x) * ex + (to.y - a.y) * ey) / elen2;
              if (tProj < 0) tProj = 0;
              else if (tProj > 1) tProj = 1;
              const sx = a.x + ex * tProj;
              const sy = a.y + ey * tProj;
              const dx = to.x - sx;
              const dy = to.y - sy;
              const d2 = dx * dx + dy * dy;
              if (!bestProj || d2 < bestProj.d2) bestProj = { x: sx, y: sy, d2 };
            }
          }
          if (!bestProj) return stop;
          const ddx = to.x - from.x;
          const ddy = to.y - from.y;
          const dFrom2 = ddx * ddx + ddy * ddy;
          if (!(bestProj.d2 + 1e-8 < dFrom2)) return stop;
          let sx = bestProj.x;
          let sy = bestProj.y;
          let cx = 0;
          let cy = 0;
          for (let k = 0; k < poly.length; k++) {
            cx += poly[k].x;
            cy += poly[k].y;
          }
          cx /= Math.max(1, poly.length);
          cy /= Math.max(1, poly.length);
          const nx = cx - sx;
          const ny = cy - sy;
          const nlen = Math.hypot(nx, ny) || 1;
          sx += (nx / nlen) * eps;
          sy += (ny / nlen) * eps;
          if (!pointInPolygon(sx, sy, poly)) return stop;
          return { x: sx, y: sy };
        }

        return from;
      };

      if (isInsideMonBox(nx, ny)) {
        if (!monPos) return;
        const widthFrac = Math.max(0.001, Math.min(1, getMonBoundsWidthFrac(monKey)));
        const heightFrac = Math.max(0.001, Math.min(1, MON_HEIGHT_FRAC));
        const cx = (monPos.x ?? MON_REL_X) + MON_BOUNDS_X_SHIFT;
        const bottomY = (monPos.y ?? MON_REL_Y) + MON_BASELINE_Y_OFFSET;
        const topY = bottomY - heightFrac;
        const expandedW = Math.max(0.001, Math.min(1, widthFrac + DUDE_BOUNDS_WIDTH_FRAC * 1.4));
        const expandedH = Math.max(0.001, Math.min(1, heightFrac + DUDE_BOUNDS_HEIGHT_FRAC));
        const leftX = cx - expandedW * 0.5;
        const rightX = cx + expandedW * 0.5;
        const top = topY;
        const bottom = top + expandedH;
        const clampedY = Math.max(top, Math.min(bottom, dudePos.y));
        const candidates = [
          { x: leftX, y: clampedY },
          { x: rightX, y: clampedY },
        ];
        let best = candidates[0];
        let bestDist = Math.hypot(dudePos.x - best.x, dudePos.y - best.y);
        for (let i = 1; i < candidates.length; i++) {
          const d = Math.hypot(dudePos.x - candidates[i].x, dudePos.y - candidates[i].y);
          if (d < bestDist) {
            best = candidates[i];
            bestDist = d;
          }
        }
        const insidePoly = pointInPolygon(best.x, best.y, walkPoints);
        const target = insidePoly ? best : computeBoundaryStopPoint(latestDudePosRef.current, best, walkPoints);
        const onLeftSide = Math.abs(best.x - leftX) <= Math.abs(best.x - rightX);
        const facingLeft = onLeftSide ? false : true;
        const atTarget = Math.hypot(dudePos.x - target.x, dudePos.y - target.y) < 0.015;
        if (!atTarget) {
          moveTargetMetaRef.current = { x: target.x, y: target.y, facingLeft };
          startMoveTo(target.x, target.y);
        } else {
          petMon();
        }
        if ((event as any).preventDefault) (event as any).preventDefault();
        return;
      }

      if (pointInPolygon(nx, ny, walkPoints) || isInsideEllipse(nx, ny)) {
        if (performance.now() < walkSuppressedUntilRef.current) {
          return;
        }
        const insidePoly = pointInPolygon(nx, ny, walkPoints);
        dragModeRef.current = isInsideEllipse(nx, ny) && !insidePoly ? "ellipse" : "polygon";
        const target = insidePoly ? { x: nx, y: ny } : computeBoundaryStopPoint(latestDudePosRef.current, { x: nx, y: ny }, walkPoints);
        moveTargetMetaRef.current = null;
        startMoveTo(target.x, target.y);
        isDraggingRef.current = true;

        const handleMove = (e: MouseEvent | TouchEvent) => {
          if (!isDraggingRef.current) return;
          let cx = 0;
          let cy = 0;
          if ("touches" in e && e.touches[0]) {
            cx = e.touches[0].clientX;
            cy = e.touches[0].clientY;
          } else if ("clientX" in e) {
            cx = (e as MouseEvent).clientX;
            cy = (e as MouseEvent).clientY;
          }
          const insideMove = cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom;
          if (!insideMove) return;
          const rxx = Math.floor(cx - rect.left);
          const ryy = Math.floor(cy - rect.top);
          const nxx = rxx / Math.max(1, rect.width);
          const nyy = ryy / Math.max(1, rect.height);
          if (dragModeRef.current === "ellipse") {
            const lp = lastEllipsePointerRef.current;
            const dxp = nxx - lp.x;
            const dyp = nyy - lp.y;
            if (dxp * dxp + dyp * dyp < SAFE_POINTER_MOVE_EPS * SAFE_POINTER_MOVE_EPS) {
              if ("preventDefault" in e) e.preventDefault();
              return;
            }
            lastEllipsePointerRef.current = { x: nxx, y: nyy };
          }
          const insidePolyMove = pointInPolygon(nxx, nyy, walkPoints);
          if (insidePolyMove) {
            updateMoveTarget(nxx, nyy);
          } else if (isInsideEllipse(nxx, nyy)) {
            const stop = computeBoundaryStopPoint(latestDudePosRef.current, { x: nxx, y: nyy }, walkPoints);
            updateMoveTarget(stop.x, stop.y);
            dragModeRef.current = "ellipse";
          }
          if ("preventDefault" in e) {
            e.preventDefault();
          }
        };

        const handleEnd = () => {
          isDraggingRef.current = false;
          dragModeRef.current = "none";
          if (safeSlideEdgeRef.current) safeSlideEdgeRef.current.edgeIndex = null;
          lastEllipsePointerRef.current = { x: -1, y: -1 };
          window.removeEventListener("mousemove", handleMove as any);
          window.removeEventListener("mouseup", handleEnd as any);
          window.removeEventListener("touchmove", handleMove as any);
          window.removeEventListener("touchend", handleEnd as any);
          window.removeEventListener("touchcancel", handleEnd as any);
        };

        window.addEventListener("mousemove", handleMove as any, { passive: false });
        window.addEventListener("mouseup", handleEnd as any);
        window.addEventListener("touchmove", handleMove as any, { passive: false });
        window.addEventListener("touchend", handleEnd as any);
        window.addEventListener("touchcancel", handleEnd as any);

        if ("preventDefault" in event) {
          event.preventDefault();
        }
        return;
      }
      const drew = drawHeroIntoHitCanvas();
      if (!drew) {
        return;
      }
      const canvas = heroHitCanvasRef.current;
      if (!canvas) {
        return;
      }
      const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | null;
      if (!ctx) {
        return;
      }
      let alpha = 255;
      try {
        const data = ctx.getImageData(rx, ry, 1, 1).data;
        alpha = data[3];
      } catch {}
      if (alpha < 16) {
        if (shouldSkipCloseForMaterialTarget()) return;
        handleIslandClose(event as unknown as React.MouseEvent | React.TouchEvent);
        return;
      }
    },
    [handleIslandClose, drawHeroIntoHitCanvas, pointInPolygon, walkPoints, startMoveTo, updateMoveTarget, rockIsBroken, rockReady, dudePos, startMiningAnimation, syncDudePosFromOriginal, monKey, monPos, petMon]
  );

  return (
    <>
      {islandImgLoaded && (
        <ButtonEl ref={islandButtonRef} $hidden={islandOverlayShown} $dimmed={dimmed} onClick={!isMobile ? handleIslandOpen : undefined} onTouchStart={isMobile ? handleIslandOpen : undefined} aria-label="Island">
          <img ref={islandButtonImgRef} src={resolvedUrl} alt="" draggable={false} />
        </ButtonEl>
      )}
      {(islandOverlayShown || islandAnimating) && (
        <>
          <Overlay $visible={islandOverlayVisible} $opening={islandOpening} $closing={islandClosing} onClick={!isMobile ? handleIslandClose : undefined} onTouchStart={isMobile ? handleIslandClose : undefined} onTransitionEnd={handleOverlayTransitionEnd} />
          <Layer $visible={islandOverlayVisible} $opening={islandOpening} $closing={islandClosing} onMouseDown={!isMobile ? handlePointerStart : undefined} onTouchStart={isMobile ? handlePointerStart : undefined}>
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
              <HeroWrap>
                <Hero ref={islandHeroImgRef} src={resolvedUrl} alt="" draggable={false} />
                <WalkOverlay />
                {SHOW_DEBUG_ISLAND_BOUNDS && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      pointerEvents: "none",
                      zIndex: 10,
                    }}>
                    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}>
                      {rockReady && rockBoxRef.current && (
                        <>
                          {(() => {
                            const box = rockBoxRef.current!;
                            const cx = ((box.left + box.right) / 2 + SAFE_POINT_AREA_ELLIPSE_CENTER_OFFSET_X) * 100;
                            const cy = ((box.top + box.bottom) / 2 + SAFE_POINT_AREA_ELLIPSE_CENTER_OFFSET_Y) * 100;
                            const rw = SAFE_POINT_AREA_ELLIPSE_RADIUS_FRAC_X * 100;
                            const rh = SAFE_POINT_AREA_ELLIPSE_RADIUS_FRAC_Y * 100;
                            return <ellipse cx={cx} cy={cy} rx={rw} ry={rh} fill="rgba(0,200,0,0.12)" stroke="rgba(0,180,0,0.85)" strokeWidth={0.9} />;
                          })()}
                          <rect x={Math.max(0, Math.min(1, rockBoxRef.current.left)) * 100} y={Math.max(0, Math.min(1, rockBoxRef.current.top)) * 100} width={Math.max(0, Math.min(1, rockBoxRef.current.right - rockBoxRef.current.left)) * 100} height={Math.max(0, Math.min(1, rockBoxRef.current.bottom - rockBoxRef.current.top)) * 100} fill="none" stroke="rgba(255,0,0,0.8)" strokeWidth={1.6} />
                          <line x1={0} x2={100} y1={Math.max(0, Math.min(1, rockBottomY)) * 100} y2={Math.max(0, Math.min(1, rockBottomY)) * 100} stroke="rgba(255,0,0,0.6)" strokeDasharray="4 3" strokeWidth={1} />
                        </>
                      )}
                      {(() => {
                        const widthFrac = Math.max(0.001, Math.min(1, DUDE_BOUNDS_WIDTH_FRAC));
                        const heightFrac = Math.max(0.001, Math.min(1, DUDE_BOUNDS_HEIGHT_FRAC));
                        const cx = dudePos.x;
                        const bottomY = dudePos.y;
                        const cxPct = cx * 100;
                        const yPct = bottomY * 100;
                        const half = widthFrac * 0.5 * 100;
                        const leftX = cx - widthFrac * 0.5;
                        const ww = widthFrac * 100;
                        const hh = heightFrac * 100;
                        const x = leftX * 100;
                        const y = (bottomY - heightFrac) * 100;
                        return (
                          <>
                            <line x1={cxPct - half} x2={cxPct + half} y1={yPct} y2={yPct} stroke="rgba(0,128,255,0.9)" strokeDasharray="3 3" strokeWidth={1.4} />
                            <rect x={x} y={y} width={ww} height={hh} fill="rgba(0,128,255,0.08)" stroke="rgba(0,128,255,0.9)" strokeWidth={0.9} />
                          </>
                        );
                      })()}
                      {monPos &&
                        (() => {
                          const widthFrac = Math.max(0.001, Math.min(1, getMonBoundsWidthFrac(monKey)));
                          const cx = (monPos.x ?? MON_REL_X) + MON_BOUNDS_X_SHIFT;
                          const bottomY = (monPos.y ?? MON_REL_Y) + MON_BASELINE_Y_OFFSET;
                          const cxPct = Math.max(0, Math.min(100, cx * 100));
                          const yPct = Math.max(0, Math.min(100, bottomY * 100));
                          const half = widthFrac * 0.5 * 100;
                          return <line x1={cxPct - half} x2={cxPct + half} y1={yPct} y2={yPct} stroke="#000" strokeDasharray="3 3" strokeWidth={1.4} />;
                        })()}
                      {monPos &&
                        (() => {
                          const widthFrac = Math.max(0.001, Math.min(1, getMonBoundsWidthFrac(monKey)));
                          const heightFrac = Math.max(0.001, Math.min(1, MON_HEIGHT_FRAC));
                          const cx = (monPos.x ?? MON_REL_X) + MON_BOUNDS_X_SHIFT;
                          const bottomY = (monPos.y ?? MON_REL_Y) + MON_BASELINE_Y_OFFSET;
                          const leftX = cx - widthFrac * 0.5;
                          const topY = bottomY - heightFrac;
                          const x = Math.max(0, Math.min(100, leftX * 100));
                          const y = Math.max(0, Math.min(100, topY * 100));
                          const ww = Math.max(0.001, Math.min(100, widthFrac * 100));
                          const hh = Math.max(0.001, Math.min(100, heightFrac * 100));
                          const expandedWFrac = Math.max(0.001, Math.min(1, widthFrac + DUDE_BOUNDS_WIDTH_FRAC * 1.4));
                          const expandedHFrac = Math.max(0.001, Math.min(1, heightFrac + DUDE_BOUNDS_HEIGHT_FRAC));
                          const leftX2 = cx - expandedWFrac * 0.5;
                          const topY2 = topY;
                          const x2 = Math.max(0, Math.min(100, leftX2 * 100));
                          const y2 = Math.max(0, Math.min(100, topY2 * 100));
                          const ww2 = Math.max(0.001, Math.min(100, expandedWFrac * 100));
                          const hh2 = Math.max(0.001, Math.min(100, expandedHFrac * 100));
                          return (
                            <>
                              <rect x={x} y={y} width={ww} height={hh} fill="rgba(0,0,0,0.06)" stroke="#000" strokeWidth={0.9} />
                              <rect x={x2} y={y2} width={ww2} height={hh2} fill="none" stroke="rgba(0,0,0,0.7)" strokeDasharray="4 3" strokeWidth={0.9} />
                            </>
                          );
                        })()}
                      <polygon points={WALK_POLYGON.map((p) => `${p.x * 100},${p.y * 100}`).join(" ")} fill="rgba(0,128,255,0.08)" stroke="rgba(0,128,255,0.8)" strokeWidth={0.8} />
                    </svg>
                  </div>
                )}
                {!islandClosing && (
                  <DudeLayer $visible={!islandClosing} style={{ visibility: "hidden", opacity: 0 }}>
                    <DudeImg ref={origDudeImgRef} src={`data:image/png;base64,${islandMonsIdle}`} alt="" draggable={false} />
                  </DudeLayer>
                )}
                {(() => {
                  const widthPct = DUDE_BOUNDS_WIDTH_FRAC * 1.3 * 100;
                  const topOffsetFrac = 0.0135;
                  const topFrac = Math.max(0, Math.min(1, dudePos.y - topOffsetFrac));
                  return <ShadowImg src={`data:image/png;base64,${islandMonsShadow}`} alt="" draggable={false} style={{ left: `${dudePos.x * 100}%`, top: `${topFrac * 100}%`, width: `${widthPct}%`, height: "auto", opacity: dudeVisible ? 0.23 : 0 }} />;
                })()}
                <DudeSpriteWrap
                  ref={dudeWrapRef}
                  style={{
                    left: `${dudePos.x * 100}%`,
                    top: `${dudePos.y * 100}%`,
                    opacity: dudeVisible ? 1 : 0,
                    zIndex: (() => {
                      const dudeBaselineY = dudePos.y;
                      const base = Math.round(dudeBaselineY * 100);
                      if (!rockReady) return 600 + base;
                      const inFrontOfRock = dudeBaselineY >= rockBottomY;
                      return inFrontOfRock ? 700 + base : 300 + base;
                    })(),
                  }}>
                  <DudeSpriteImg $facingLeft={dudeFacingLeft} src={`data:image/png;base64,${islandMonsIdle}`} alt="" draggable={false} style={{ visibility: miningPlaying ? "hidden" : "visible" }} />
                  {miningPlaying && (
                    <DudeSpriteFrame $facingLeft={dudeFacingLeft} ref={miningFrameWrapRef as any}>
                      <DudeSpriteStrip ref={miningStripImgRef as any} src={`data:image/png;base64,${islandMonsMining}`} alt="" draggable={false} />
                    </DudeSpriteFrame>
                  )}
                </DudeSpriteWrap>
                {decorVisible && (
                  <>
                    {monPos && monSpriteData && (
                      <MonLayer
                        $visible={decorVisible && !islandClosing}
                        style={{
                          zIndex: (() => {
                            const monBaselineY = (monPos ? monPos.y : MON_REL_Y) + MON_BASELINE_Y_OFFSET;
                            const base = Math.round(monBaselineY * 100);
                            if (!rockReady) return 600 + base;
                            const inFrontOfRock = monBaselineY >= rockBottomY;
                            return inFrontOfRock ? 700 + base : 300 + base;
                          })(),
                        }}>
                        {(() => {
                          const widthPct = getMonBoundsWidthFrac(monKey) * 1.3 * 100;
                          const cx = ((monPos?.x ?? MON_REL_X) + MON_BOUNDS_X_SHIFT) * 100;
                          const bottomY = (monPos?.y ?? MON_REL_Y) + MON_BASELINE_Y_OFFSET;
                          const topOffsetFrac = 0.0075;
                          const topFrac = Math.max(0, Math.min(1, bottomY - topOffsetFrac));
                          return <ShadowImg src={`data:image/png;base64,${islandMonsShadow}`} alt="" draggable={false} style={{ left: `${cx}%`, top: `${topFrac * 100}%`, width: `${widthPct}%`, height: "auto", opacity: monVisible ? 0.23 : 0 }} />;
                        })()}
                        <MonSpriteWrap
                          ref={monWrapRef}
                          style={{
                            left: `${(monPos?.x ?? MON_REL_X) * 100}%`,
                            top: `${(monPos?.y ?? MON_REL_Y) * 100}%`,
                            opacity: monVisible ? 1 : 0,
                            zIndex: (() => {
                              const monBaselineY = (monPos ? monPos.y : MON_REL_Y) + MON_BASELINE_Y_OFFSET;
                              const base = Math.round(monBaselineY * 100);
                              if (!rockReady) return 600 + base;
                              const inFrontOfRock = monBaselineY >= rockBottomY;
                              return inFrontOfRock ? 700 + base : 300 + base;
                            })(),
                          }}>
                          <MonSpriteFrame $facingLeft={monFacingLeft} ref={monFrameWrapRef as any}>
                            <MonSpriteStrip ref={monStripImgRef as any} src={`data:image/webp;base64,${monSpriteData}`} alt="" draggable={false} />
                          </MonSpriteFrame>
                        </MonSpriteWrap>
                      </MonLayer>
                    )}
                    <RockLayer ref={rockLayerRef} $visible={decorVisible} style={{ zIndex: 500 }}>
                      <Rock
                        ref={rockRef as any}
                        heightPct={75}
                        onOpened={() => {
                          setRockReady(true);
                          updateRockBox();
                        }}
                        onHit={startMiningAnimation}
                        onBroken={handleRockBroken}
                      />
                    </RockLayer>
                  </>
                )}
              </HeroWrap>
            </Animator>
          </Layer>
        </>
      )}
    </>
  );
}

export default IslandButton;
