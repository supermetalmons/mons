import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { isMobile } from "../utils/misc";
import styled, { keyframes } from "styled-components";
import { didDismissSomethingWithOutsideTapJustNow } from "./BottomControls";
import { closeAllKindsOfPopups } from "./MainMenu";
import IslandRock, { IslandRockHandle } from "./IslandRock";
import { soundPlayer } from "../utils/SoundPlayer";
import { playSounds, playRockSound, RockSound } from "../content/sounds";
import { idle as islandMonsIdle, miningJumpingPetsIdleAndWalking as islandMonsMining, shadow as islandMonsShadow } from "../assets/islandMons";
import { getOwnDrainerId } from "../utils/namedMons";
import { Sound } from "../utils/gameModels";

const SHOW_DEBUG_ISLAND_BOUNDS = false;
const FEATURE_GLOWS_ON_HOTSPOT = true;
const FEATURE_FULL_OVERLAY_ON_HOTSPOT = true;
const STARS_URL = "https://assets.mons.link/rocks/underground/stars.webp";
const TOUCH_EDGE_DEADZONE_PX = 5;

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
  @media (prefers-color-scheme: dark) and (hover: none) and (pointer: coarse) {
    background: rgba(15, 15, 15, 0.11);
  }
  @media (prefers-color-scheme: light) {
    background: rgba(0, 0, 0, 0.01);
  }
`;

const SafeBarRow = styled.div`
  position: fixed;
  left: 0;
  right: 0;
  bottom: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 90001;
`;

const SafeHitbox = styled.div<{ $debug: boolean; $active: boolean }>`
  display: inline-flex;
  pointer-events: ${(p) => (p.$active ? "auto" : "none")};
  padding: 20px 25px;
  margin: -20px 0;
  background: ${(p) => (p.$debug ? "rgba(0,200,0,0.12)" : "transparent")};
  outline: ${(p) => (p.$debug ? "1px solid rgba(0,180,0,0.85)" : "none")};
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

const HotspotOverlay = styled.div`
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 100000;
`;

const fadePulse = keyframes`
  0% { opacity: 0; transform: scale(0.8); }
  10% { opacity: 1; transform: scale(1); }
  70% { opacity: 1; }
  100% { opacity: 0; transform: scale(1.05); }
`;

const HotspotCircle = styled.div<{ $visible: boolean }>`
  position: absolute;
  border-radius: 50%;
  box-sizing: border-box;
  touch-action: none;
  pointer-events: none;
  background: radial-gradient(circle at 50% 50%, rgba(0, 200, 255, 0.9) 0%, rgba(0, 200, 255, 0.45) 40%, rgba(0, 200, 255, 0.2) 60%, rgba(0, 0, 0, 0) 70%);
  box-shadow: 0 0 14px rgba(0, 200, 255, 0.7), 0 0 28px rgba(0, 200, 255, 0.35), inset 0 0 22px rgba(0, 200, 255, 0.5);
  opacity: ${(p) => (p.$visible ? 0 : 0)};
  animation: ${(p) => (p.$visible ? fadePulse : "none")} 520ms ease-out;
  &::before {
    content: "";
    position: absolute;
    inset: 16%;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(255, 255, 255, 0.85) 0%, rgba(0, 200, 255, 0) 70%);
    filter: blur(6px);
    opacity: 0.8;
    pointer-events: none;
  }
`;

const overlayFlash = keyframes`
  0% { opacity: 0; }
  10% { opacity: 1; }
  70% { opacity: 1; }
  100% { opacity: 0; }
`;

const HotspotFullImage = styled.img<{ $visible: boolean }>`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
  z-index: 1;
  filter: brightness(1.35) saturate(1.15) contrast(1.08);
  opacity: ${(p) => (p.$visible ? 0 : 0)};
  animation: ${(p) => (p.$visible ? overlayFlash : "none")} 520ms ease-out;
`;

const StarsOverlayImage = styled.img<{ $visible: boolean; $hold: boolean }>`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
  z-index: 3;
  filter: brightness(1.7) saturate(1.25) contrast(1.2);
  opacity: ${(p) => (p.$hold ? 1 : 0)};
  animation: ${(p) => (p.$hold ? "none" : p.$visible ? overlayFlash : "none")} 520ms ease-out;
`;

const MaskedArea = styled.div<{ $cx: number; $cy: number; $visible: boolean }>`
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 2;
  -webkit-mask-image: radial-gradient(circle at ${(p) => p.$cx}% ${(p) => p.$cy}%, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 1) 7%, rgba(0, 0, 0, 0) 12%);
  mask-image: radial-gradient(circle at ${(p) => p.$cx}% ${(p) => p.$cy}%, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 1) 7%, rgba(0, 0, 0, 0) 12%);
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
`;

type IslandHotspot = { cxPct: number; cyPct: number; dPct: number };

const ISLAND_HOTSPOTS: IslandHotspot[] = [
  { cxPct: 0.2267901200343747, cyPct: 0.4402455174645712, dPct: 0.0852713178294574 },
  { cxPct: 0.1408001429826479, cyPct: 0.4011414993640988, dPct: 0.0867806613609959 },
  { cxPct: 0.2303384803038283, cyPct: 0.5319767441860465, dPct: 0.0929130855394721 },
  { cxPct: 0.1434036537022149, cyPct: 0.486757145371548, dPct: 0.0845797097419015 },
  { cxPct: 0.2285643001691015, cyPct: 0.623062015503876, dPct: 0.0883856918681502 },
  { cxPct: 0.3438860089263438, cyPct: 0.6941214864568193, dPct: 0.1009076145131653 },
  { cxPct: 0.3845540733282993, cyPct: 0.81524926686217, dPct: 0.1389820732761389 },
  { cxPct: 0.2498544617858232, cyPct: 0.7180232558139535, dPct: 0.0950205478459788 },
  { cxPct: 0.3228039265039013, cyPct: 0.4941348973607038, dPct: 0.0965006757489889 },
  { cxPct: 0.1482926420001678, cyPct: 0.5733137829912024, dPct: 0.0805273150244885 },
  { cxPct: 0.3254887154962665, cyPct: 0.5967741935483871, dPct: 0.1046383272819784 },
];

const HOTSPOT_LABELS: number[] = [2, 1, 5, 4, 8, 9, 11, 10, 3, 7, 6];

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
const INITIAL_DUDE_Y_SHIFT = -0.6;
const INITIAL_DUDE_X_SHIFT = -0.07;
const DEFAULT_DUDE_CENTER_X = 0.4;
const DEFAULT_DUDE_BOTTOM_Y = 0.78;
const INITIAL_DUDE_FACING_LEFT = false;
const ALTERNATE_DUDE_X_SHIFT = 0.27;
const ROCK_BOX_INSET_LEFT_FRAC = 0.0;
const ROCK_BOX_INSET_RIGHT_FRAC = 0.0;
const ROCK_BOX_INSET_TOP_FRAC = 0.02;
const ROCK_BOX_INSET_BOTTOM_FRAC = 0.24;
const SAFE_POINT_AREA_ELLIPSE_CENTER_OFFSET_X = 0.0;
const SAFE_POINT_AREA_ELLIPSE_CENTER_OFFSET_Y = 0.042;
const DUDE_BOUNDS_WIDTH_FRAC = 0.12;
const DUDE_BOUNDS_HEIGHT_FRAC = 0.22;
const SAFE_POINT_AREA_ELLIPSE_RADIUS_FRAC_X = 0.63;
const SAFE_POINT_AREA_ELLIPSE_RADIUS_FRAC_Y = 0.36;
const SAFE_POINT_EDGE_INSET = 0.003;
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
const WALKING_FRAME_MS = 120;
const STANDING_FRAME_MS = 200;

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
let persistentMonPosRef: { x: number; y: number } | null = null;
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
  const [starsVisible, setStarsVisible] = useState(false);
  const [starsMaskCenter, setStarsMaskCenter] = useState<{ xPct: number; yPct: number }>({ xPct: 50, yPct: 50 });
  const starsTimerRef = useRef<number>(0);
  const [starsHold, setStarsHold] = useState(false);
  const starsAnimActiveRef = useRef<boolean>(false);
  const wasStarsInsideRef = useRef<boolean>(false);
  const starsHoldRef = useRef<boolean>(false);
  useEffect(() => {
    starsHoldRef.current = starsHold;
  }, [starsHold]);
  const starsDismissedRef = useRef<boolean>(false);
  const starsCenterTargetRef = useRef<{ xPct: number; yPct: number } | null>(null);
  const starsCenterRafRef = useRef<number | null>(null);
  const lastStarsCenterRef = useRef<{ xPct: number; yPct: number }>(starsMaskCenter);
  const setStarsCenterImmediate = useCallback((xPct: number, yPct: number) => {
    const cx = Math.max(0, Math.min(100, xPct));
    const cy = Math.max(0, Math.min(100, yPct));
    if (starsCenterRafRef.current !== null) {
      cancelAnimationFrame(starsCenterRafRef.current);
      starsCenterRafRef.current = null;
    }
    starsCenterTargetRef.current = null;
    const next = { xPct: cx, yPct: cy };
    lastStarsCenterRef.current = next;
    setStarsMaskCenter(next);
  }, []);
  const queueStarsCenterUpdate = useCallback((xPct: number, yPct: number) => {
    const cx = Math.max(0, Math.min(100, xPct));
    const cy = Math.max(0, Math.min(100, yPct));
    const last = lastStarsCenterRef.current;
    const dx = cx - last.xPct;
    const dy = cy - last.yPct;
    if (dx * dx + dy * dy < 0.16) return;
    starsCenterTargetRef.current = { xPct: cx, yPct: cy };
    if (starsCenterRafRef.current === null) {
      starsCenterRafRef.current = requestAnimationFrame(() => {
        starsCenterRafRef.current = null;
        const t = starsCenterTargetRef.current;
        if (!t) return;
        starsCenterTargetRef.current = null;
        lastStarsCenterRef.current = t;
        setStarsMaskCenter(t);
      });
    }
  }, []);
  const cancelQueuedStarsCenterUpdate = useCallback(() => {
    if (starsCenterRafRef.current !== null) {
      cancelAnimationFrame(starsCenterRafRef.current);
      starsCenterRafRef.current = null;
    }
    starsCenterTargetRef.current = null;
  }, []);
  const starsImgRef = useRef<HTMLImageElement | null>(null);
  const heroWrapRef = useRef<HTMLDivElement | null>(null);
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
  const [monTeleporting, setMonTeleporting] = useState(false);
  const materialItemRefs = useRef<Record<MaterialName, HTMLDivElement | null>>({ dust: null, slime: null, gum: null, metal: null, ice: null });
  const isMaterialTarget = useCallback(
    (node: Node | null) => {
      if (!node) return false;
      const refs = materialItemRefs.current;
      for (const key in refs) {
        const el = refs[key as MaterialName];
        if (el && (el === node || el.contains(node))) {
          return true;
        }
      }
      return false;
    },
    [materialItemRefs]
  );
  const materialsBarRef = useRef<HTMLDivElement | null>(null);
  const rockLayerRef = useRef<HTMLDivElement | null>(null);
  const rockRef = useRef<IslandRockHandle | null>(null);
  const fxContainerRef = useRef<HTMLDivElement | null>(null);
  const lastRockRectRef = useRef<DOMRect | null>(null);
  const [rockIsBroken, setRockIsBroken] = useState(false);
  const walkSuppressedUntilRef = useRef<number>(0);
  const [rockReady, setRockReady] = useState(false);
  const rockBoxRef = useRef<{ left: number; top: number; right: number; bottom: number } | null>(null);
  const [rockBottomY, setRockBottomY] = useState<number>(1);
  const materialDropsRef = useRef<Array<{ el: HTMLImageElement; shadow: HTMLElement; name: MaterialName }>>([]);

  const [heroSize, setHeroSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  const editorOverlayRef = useRef<HTMLDivElement | null>(null);
  const isPointerDownRef = useRef<boolean>(false);
  const lastInsideRef = useRef<Set<number>>(new Set());
  const circlesGestureActiveRef = useRef<boolean>(false);
  const walkingDragActiveRef = useRef<boolean>(false);
  const lastMaterialsInsideRef = useRef<Set<MaterialName>>(new Set());
  const [hotspotVisible, setHotspotVisible] = useState<boolean[]>(() => new Array(ISLAND_HOTSPOTS.length).fill(false));
  const hotspotTimersRef = useRef<number[]>(new Array(ISLAND_HOTSPOTS.length).fill(0));
  const lastTouchAtRef = useRef<number>(0);
  const flashEntriesRef = useRef<((indices: Set<number>) => void) | null>(null);
  const spawnIconParticlesFnRef = useRef<((el: HTMLElement, src: string) => void) | null>(null);

  const DISMISS_ALLOWED_TRIANGLE_A: Array<{ x: number; y: number }> = useMemo(
    () => [
      { x: 0.0, y: 0.7287 },
      { x: 0.2087, y: 1.0 },
      { x: 0.0, y: 1.0 },
    ],
    []
  );
  const DISMISS_ALLOWED_TRIANGLE_B: Array<{ x: number; y: number }> = useMemo(
    () => [
      { x: 1.0, y: 0.5753 },
      { x: 1.0, y: 1.0 },
      { x: 0.6977, y: 1.0 },
    ],
    []
  );
  const pointInTriangle = useCallback((px: number, py: number, tri: Array<{ x: number; y: number }>) => {
    const a = tri[0];
    const b = tri[1];
    const c = tri[2];
    const s1 = (px - c.x) * (b.y - c.y) - (b.x - c.x) * (py - c.y);
    const s2 = (px - a.x) * (c.y - a.y) - (c.x - a.x) * (py - a.y);
    const s3 = (px - b.x) * (a.y - b.y) - (a.x - b.x) * (py - b.y);
    const hasNeg = s1 < 0 || s2 < 0 || s3 < 0;
    const hasPos = s1 > 0 || s2 > 0 || s3 > 0;
    return !(hasNeg && hasPos);
  }, []);

  const NO_WALK_TETRAGON: Array<{ x: number; y: number }> = useMemo(
    () => [
      { x: 0.0745, y: 0.2636 },
      { x: 0.4116, y: 0.4467 },
      { x: 0.4079, y: 0.6358 },
      { x: 0.0579, y: 0.5272 },
    ],
    []
  );

  const STAR_SHINE_PENTAGON = useMemo<Array<{ x: number; y: number }>>(
    () => [
      { x: 0.465, y: 0.9558 },
      { x: 0.6805, y: 0.4044 },
      { x: 0.9532, y: 0.2415 },
      { x: 0.8997, y: 0.497 },
      { x: 0.6474, y: 0.9014 },
    ],
    []
  );

  const STAR_SHINE_PENTAGON_BOUNDS = useMemo(() => {
    let minX = 1;
    let maxX = 0;
    let minY = 1;
    let maxY = 0;
    for (let i = 0; i < STAR_SHINE_PENTAGON.length; i++) {
      const p = STAR_SHINE_PENTAGON[i];
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    return { minX, maxX, minY, maxY };
  }, [STAR_SHINE_PENTAGON]);

  const SMALLER_SMOOTH_CYCLING_ELLIPSE = useMemo<{ cx: number; cy: number; rx: number; ryTop: number; ryBottom: number }>(
    () => ({
      cx: 0.4982,
      cy: 0.1928,
      rx: 0.3495,
      ryTop: 0.1143,
      ryBottom: 0.1492,
    }),
    []
  );

  const SMOOTH_CYCLING_ELLIPSE = useMemo<{ cx: number; cy: number; rx: number; ryTop: number; ryBottom: number }>(
    () => ({
      cx: 0.4982,
      cy: 0.1928,
      rx: 0.36,
      ryTop: 0.1143,
      ryBottom: 0.175,
    }),
    []
  );
  const smoothEllipseMetrics = useMemo(() => {
    const rx = Math.max(1e-6, SMOOTH_CYCLING_ELLIPSE.rx);
    const ryTop = Math.max(1e-6, SMOOTH_CYCLING_ELLIPSE.ryTop);
    const ryBottom = Math.max(1e-6, SMOOTH_CYCLING_ELLIPSE.ryBottom);
    const invRxSq = 1 / (rx * rx);
    const invRyTopSq = 1 / (ryTop * ryTop);
    const invRyBottomSq = 1 / (ryBottom * ryBottom);
    const ryMid = Math.max(1e-6, (ryTop + ryBottom) * 0.5);
    const invRyMidSq = 1 / (ryMid * ryMid);
    return { invRxSq, invRyTopSq, invRyBottomSq, invRyMidSq };
  }, [SMOOTH_CYCLING_ELLIPSE]);
  const pickInvRySq = useCallback(
    (dy: number) => {
      if (dy > 1e-6) return smoothEllipseMetrics.invRyBottomSq;
      if (dy < -1e-6) return smoothEllipseMetrics.invRyTopSq;
      return smoothEllipseMetrics.invRyMidSq;
    },
    [smoothEllipseMetrics]
  );
  const isInsideSmoothEllipse = useCallback(
    (x: number, y: number) => {
      const dx = x - SMOOTH_CYCLING_ELLIPSE.cx;
      const dy = y - SMOOTH_CYCLING_ELLIPSE.cy;
      const invRySq = pickInvRySq(dy);
      if (smoothEllipseMetrics.invRxSq === 0 || invRySq === 0) return false;
      return dx * dx * smoothEllipseMetrics.invRxSq + dy * dy * invRySq <= 1;
    },
    [SMOOTH_CYCLING_ELLIPSE, pickInvRySq, smoothEllipseMetrics]
  );
  const projectToSmoothEllipse = useCallback(
    (x: number, y: number) => {
      const dx = x - SMOOTH_CYCLING_ELLIPSE.cx;
      const dy = y - SMOOTH_CYCLING_ELLIPSE.cy;
      const invRySq = pickInvRySq(dy);
      if (smoothEllipseMetrics.invRxSq === 0 || invRySq === 0) {
        return { x: Math.max(0, Math.min(1, SMOOTH_CYCLING_ELLIPSE.cx)), y: Math.max(0, Math.min(1, SMOOTH_CYCLING_ELLIPSE.cy)) };
      }
      const denom = Math.sqrt(dx * dx * smoothEllipseMetrics.invRxSq + dy * dy * invRySq) || 1;
      const px = SMOOTH_CYCLING_ELLIPSE.cx + dx / denom;
      const py = SMOOTH_CYCLING_ELLIPSE.cy + dy / denom;
      const vx = px - SMOOTH_CYCLING_ELLIPSE.cx;
      const vy = py - SMOOTH_CYCLING_ELLIPSE.cy;
      const vlen = Math.hypot(vx, vy) || 1;
      const inset = SAFE_POINT_EDGE_INSET;
      const innerX = px - (vx / vlen) * inset;
      const innerY = py - (vy / vlen) * inset;
      return { x: Math.max(0, Math.min(1, innerX)), y: Math.max(0, Math.min(1, innerY)) };
    },
    [SMOOTH_CYCLING_ELLIPSE, pickInvRySq, smoothEllipseMetrics]
  );
  const smoothEllipseDebugPath = useMemo(() => {
    const cx = Math.max(0, Math.min(1, SMOOTH_CYCLING_ELLIPSE.cx)) * 100;
    const cy = Math.max(0, Math.min(1, SMOOTH_CYCLING_ELLIPSE.cy)) * 100;
    const rx = Math.max(0.5, Math.min(100, SMOOTH_CYCLING_ELLIPSE.rx * 100));
    const ryTop = Math.max(0.3, Math.min(100, SMOOTH_CYCLING_ELLIPSE.ryTop * 100));
    const ryBottom = Math.max(0.3, Math.min(100, SMOOTH_CYCLING_ELLIPSE.ryBottom * 100));
    const leftX = Math.max(0, Math.min(100, cx - rx));
    const rightX = Math.max(0, Math.min(100, cx + rx));
    const d = `M ${leftX},${cy} A ${rx} ${ryBottom} 0 1 0 ${rightX},${cy} A ${rx} ${ryTop} 0 0 0 ${leftX},${cy} Z`;
    return { d, cx, cy, rx, ryTop, ryBottom };
  }, [SMOOTH_CYCLING_ELLIPSE]);
  const THEORETICAL_ROCK_SQUARE: { cx: number; cy: number; side: number } = {
    cx: 0.5018,
    cy: 0.1773,
    side: 0.142,
  };

  const getMaterialTapSound = useCallback((name: MaterialName): RockSound | null => {
    switch (name) {
      case "dust":
        return RockSound.P4;
      case "gum":
        return RockSound.P7;
      case "slime":
        return RockSound.P3;
      case "metal":
        return RockSound.P6;
      case "ice":
        return RockSound.P5;
      default:
        return null;
    }
  }, []);

  const activateMaterial = useCallback(
    (name: MaterialName) => {
      const url = materialUrls[name];
      if (!url) return;
      const host = materialItemRefs.current[name];
      if (!host) return;
      const snd = getMaterialTapSound(name);
      if (snd) playRockSound(snd);
      const img = host.querySelector("img");
      if (!img) return;
      const f = spawnIconParticlesFnRef.current;
      if (f) f(img as HTMLImageElement, url);
    },
    [getMaterialTapSound, materialUrls]
  );

  useEffect(() => {
    const getInsideSet = (clientX: number, clientY: number) => {
      const overlay = editorOverlayRef.current;
      const set = new Set<number>();
      if (!overlay) return set;
      const rect = overlay.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const w = Math.max(1, rect.width);
      const h = Math.max(1, rect.height);
      for (let i = 0; i < ISLAND_HOTSPOTS.length; i++) {
        const c = ISLAND_HOTSPOTS[i];
        const cx = c.cxPct * w;
        const cy = c.cyPct * h;
        const r = (c.dPct * Math.min(w, h)) / 2;
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= r * r) set.add(i);
      }
      return set;
    };
    const getMaterialsInsideSet = (clientX: number, clientY: number) => {
      const set = new Set<MaterialName>();
      const refs = materialItemRefs.current;
      const names = MATERIALS as readonly MaterialName[];
      for (let i = 0; i < names.length; i++) {
        const n = names[i];
        const el = refs[n];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) set.add(n);
      }
      return set;
    };
    const tapMaterialByName = (name: MaterialName) => activateMaterial(name);
    const flashEntries = (indices: Set<number>) => {
      if (walkingDragActiveRef.current) return;
      if (indices.size === 0) return;
      indices.forEach((i) => {
        const originalLabel = HOTSPOT_LABELS[i] ?? i + 1;
        let sound: RockSound | null = null;
        const pick = (arr: RockSound[]) => arr[Math.floor(Math.random() * arr.length)];
        switch (originalLabel) {
          case 11:
            sound = pick([RockSound.S1A, RockSound.S1B]);
            break;
          case 10:
            sound = pick([RockSound.S2A, RockSound.S2B]);
            break;
          case 9:
            sound = RockSound.S3;
            break;
          case 8:
            sound = pick([RockSound.S4A, RockSound.S4B, RockSound.S4C]);
            break;
          case 7:
            sound = pick([RockSound.S5A, RockSound.S5B, RockSound.S5C]);
            break;
          case 6:
            sound = pick([RockSound.S6A, RockSound.S6B, RockSound.S6C]);
            break;
          case 5:
            sound = pick([RockSound.S7A, RockSound.S7B, RockSound.S7C]);
            break;
          case 4:
            sound = pick([RockSound.S8A, RockSound.S8B, RockSound.S8C]);
            break;
          case 3:
            sound = RockSound.S8A;
            break;
          case 2:
            sound = RockSound.S8B;
            break;
          case 1:
            sound = RockSound.S8C;
            break;
        }
        if (sound) playRockSound(sound);
      });
      setHotspotVisible((prev) => {
        const next = [...prev];
        indices.forEach((i) => {
          next[i] = false;
        });
        return next;
      });
      requestAnimationFrame(() => {
        setHotspotVisible((prev) => {
          const next = [...prev];
          indices.forEach((i) => {
            next[i] = true;
            if (hotspotTimersRef.current[i]) window.clearTimeout(hotspotTimersRef.current[i]);
            hotspotTimersRef.current[i] = window.setTimeout(() => {
              setHotspotVisible((cur) => {
                const n2 = [...cur];
                n2[i] = false;
                return n2;
              });
            }, 520);
          });
          return next;
        });
      });
    };
    flashEntriesRef.current = flashEntries;
    const onDown = (ev: MouseEvent | TouchEvent) => {
      const now = performance.now();
      isPointerDownRef.current = true;
      if (walkingDragActiveRef.current) return;
      let clientX = 0;
      let clientY = 0;
      if ((ev as TouchEvent).touches && (ev as TouchEvent).touches.length) {
        clientX = (ev as TouchEvent).touches[0].clientX;
        clientY = (ev as TouchEvent).touches[0].clientY;
        lastTouchAtRef.current = now;
      } else {
        if (now - lastTouchAtRef.current < 600) return;
        clientX = (ev as MouseEvent).clientX;
        clientY = (ev as MouseEvent).clientY;
      }
      const inside = getInsideSet(clientX, clientY);
      lastInsideRef.current = inside;
      circlesGestureActiveRef.current = inside.size > 0;
      if (inside.size) flashEntries(inside);
      const mats = getMaterialsInsideSet(clientX, clientY);
      lastMaterialsInsideRef.current = mats;
      if (mats.size) mats.forEach((n) => tapMaterialByName(n));
    };
    const onUp = () => {
      isPointerDownRef.current = false;
      lastInsideRef.current = new Set();
      circlesGestureActiveRef.current = false;
      lastMaterialsInsideRef.current = new Set();
    };
    const onMoveMouse = (ev: MouseEvent) => {
      const now = performance.now();
      if (now - lastTouchAtRef.current < 600) return;
      if (!isPointerDownRef.current) return;
      if (walkingDragActiveRef.current) return;
      const inside = getInsideSet(ev.clientX, ev.clientY);
      const prev = lastInsideRef.current;
      const entrants = new Set<number>();
      inside.forEach((i) => {
        if (!prev.has(i)) entrants.add(i);
      });
      if (entrants.size) flashEntries(entrants);
      lastInsideRef.current = inside;
      const mats = getMaterialsInsideSet(ev.clientX, ev.clientY);
      const prevMats = lastMaterialsInsideRef.current;
      const matEntrants: MaterialName[] = [];
      mats.forEach((n) => {
        if (!prevMats.has(n)) matEntrants.push(n);
      });
      if (matEntrants.length) matEntrants.forEach((n) => tapMaterialByName(n));
      lastMaterialsInsideRef.current = mats;
    };
    const onMoveTouch = (ev: TouchEvent) => {
      if (!isPointerDownRef.current) return;
      if (walkingDragActiveRef.current) return;
      const t = ev.touches && ev.touches[0];
      if (!t) return;
      const inside = getInsideSet(t.clientX, t.clientY);
      const prev = lastInsideRef.current;
      const entrants = new Set<number>();
      inside.forEach((i) => {
        if (!prev.has(i)) entrants.add(i);
      });
      if (entrants.size) flashEntries(entrants);
      lastInsideRef.current = inside;
      const mats = getMaterialsInsideSet(t.clientX, t.clientY);
      const prevMats = lastMaterialsInsideRef.current;
      const matEntrants: MaterialName[] = [];
      mats.forEach((n) => {
        if (!prevMats.has(n)) matEntrants.push(n);
      });
      if (matEntrants.length) matEntrants.forEach((n) => tapMaterialByName(n));
      lastMaterialsInsideRef.current = mats;
    };
    window.addEventListener("mousedown", onDown as any, { capture: true });
    window.addEventListener("mouseup", onUp, { capture: true });
    window.addEventListener("touchstart", onDown as any, { passive: true, capture: true });
    window.addEventListener("touchend", onUp, { capture: true });
    window.addEventListener("touchcancel", onUp, { capture: true });
    window.addEventListener("mousemove", onMoveMouse, { capture: true });
    window.addEventListener("touchmove", onMoveTouch as any, { passive: true, capture: true });
    return () => {
      window.removeEventListener("mousedown", onDown as any, { capture: true } as any);
      window.removeEventListener("mouseup", onUp, { capture: true } as any);
      window.removeEventListener("touchstart", onDown as any, { capture: true } as any);
      window.removeEventListener("touchend", onUp, { capture: true } as any);
      window.removeEventListener("touchcancel", onUp, { capture: true } as any);
      window.removeEventListener("mousemove", onMoveMouse, { capture: true } as any);
      window.removeEventListener("touchmove", onMoveTouch as any, { capture: true } as any);
    };
  }, [activateMaterial]);

  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      if (!islandOverlayVisible || islandClosing) return;
      const k = ev.key;
      let label: number | null = null;
      if (k >= "1" && k <= "9") label = 12 - parseInt(k, 10);
      else if (k === "0") label = 2;
      else if (k === "-") label = 1;
      if (!label) return;
      const idx = HOTSPOT_LABELS.indexOf(label);
      if (idx < 0) return;
      ev.preventDefault();
      const fn = flashEntriesRef.current;
      if (fn) fn(new Set([idx]));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [islandOverlayVisible, islandClosing]);

  const [dudePos, setDudePos] = useState<{ x: number; y: number }>({ x: DEFAULT_DUDE_CENTER_X + INITIAL_DUDE_X_SHIFT, y: DEFAULT_DUDE_BOTTOM_Y + INITIAL_DUDE_Y_SHIFT });
  const [dudeFacingLeft, setDudeFacingLeft] = useState<boolean>(false);

  const origDudeImgRef = useRef<HTMLImageElement | null>(null);
  const hasSyncedDudeRef = useRef<boolean>(false);
  const initialDudePosRef = useRef<{ x: number; y: number } | null>({ x: DEFAULT_DUDE_CENTER_X + INITIAL_DUDE_X_SHIFT, y: DEFAULT_DUDE_BOTTOM_Y + INITIAL_DUDE_Y_SHIFT });
  const dudeWrapRef = useRef<HTMLDivElement | null>(null);

  const moveAnimRef = useRef<{ start: number; from: { x: number; y: number }; to: { x: number; y: number }; duration: number } | null>(null);
  const rafRef = useRef<number | null>(null);

  const [miningPlaying, setMiningPlaying] = useState(false);
  const miningFrameWrapRef = useRef<HTMLDivElement | null>(null);
  const miningStripImgRef = useRef<HTMLImageElement | null>(null);
  const miningImageRef = useRef<HTMLImageElement | null>(null);
  const dudeResizeObserverRef = useRef<ResizeObserver | null>(null);
  const dudeFrameWidthRef = useRef<number>(0);
  const [walkingPlaying, setWalkingPlaying] = useState(false);
  const [pettingPlaying, setPettingPlaying] = useState(false);
  const [standingPlaying, setStandingPlaying] = useState(false);
  const sheetAnimRef = useRef<{ start: number; raf: number | null; lastFrame: number } | null>(null);
  const currentAnimKindRef = useRef<"none" | "mining" | "walking" | "petting" | "standing">("none");

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
  const startPettingAnimationRef = useRef<() => void>(() => {});
  const initialMonPosRef = useRef<{ x: number; y: number } | null>(null);
  const latestMonPosRef = useRef<{ x: number; y: number } | null>(null);
  const latestMonKeyRef = useRef<string | null>(null);

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

  const playSheetAnimation = useCallback(
    (kind: "mining" | "walking" | "petting" | "standing", opts?: { onStep?: () => void }) => {
      if (!dudeWrapRef.current) return;
      if (!miningImageRef.current) return;
      if (kind === "mining" && miningPlaying) return;
      if (kind === "walking" && currentAnimKindRef.current === "walking" && sheetAnimRef.current && sheetAnimRef.current.raf !== null) return;
      if (kind === "petting" && pettingPlaying) return;
      if (kind === "standing" && currentAnimKindRef.current === "standing" && sheetAnimRef.current && sheetAnimRef.current.raf !== null) return;

      try {
        if (sheetAnimRef.current && sheetAnimRef.current.raf) cancelAnimationFrame(sheetAnimRef.current.raf);
        sheetAnimRef.current = null;
        currentAnimKindRef.current = "none";
        setMiningPlaying(false);
        setWalkingPlaying(false);
        setPettingPlaying(false);
        setStandingPlaying(false);
      } catch {}

      if (kind === "mining") setMiningPlaying(true);
      if (kind === "walking") setWalkingPlaying(true);
      if (kind === "petting") setPettingPlaying(true);
      if (kind === "standing") setStandingPlaying(true);

      let initAttempts = 0;
      const init = () => {
        const sheetImg = miningImageRef.current;
        const wrap = dudeWrapRef.current;
        const frameWrap = miningFrameWrapRef.current;
        const stripImg = miningStripImgRef.current;
        if (!sheetImg || !wrap || !frameWrap || !stripImg) {
          initAttempts += 1;
          if (initAttempts <= 5) {
            requestAnimationFrame(init);
            return;
          }
          if (kind === "mining") setMiningPlaying(false);
          if (kind === "walking") setWalkingPlaying(false);
          if (kind === "petting") setPettingPlaying(false);
          if (kind === "standing") setStandingPlaying(false);
          return;
        }

        const wrapBox = wrap.getBoundingClientRect();
        const frameCount = 4;
        const rows = 5;
        const frameWidth = Math.floor(sheetImg.naturalWidth / frameCount) || 1;
        const singleRowHeight = Math.floor((sheetImg.naturalHeight || 1) / rows) || 1;
        const targetHeight = Math.max(1, Math.round(wrapBox.height));
        const targetWidth = Math.max(1, Math.round((targetHeight * frameWidth) / singleRowHeight));

        frameWrap.style.width = `${targetWidth}px`;
        frameWrap.style.height = `${targetHeight}px`;
        stripImg.style.height = `${targetHeight * rows}px`;
        stripImg.style.width = `${targetWidth * frameCount}px`;
        dudeFrameWidthRef.current = targetWidth;
        const rowIndex = kind === "mining" ? 0 : kind === "walking" ? 1 : kind === "petting" ? 2 : 3;
        const tyConstInit = -rowIndex * targetHeight;
        const initialTx = kind === "walking" ? -targetWidth : 0;
        stripImg.style.transform = `translate(${initialTx}px, ${tyConstInit}px)`;

        const frameMs = kind === "walking" ? WALKING_FRAME_MS : kind === "standing" ? STANDING_FRAME_MS : MINING_FRAME_MS;
        const loop = kind === "walking" || kind === "standing";

        const animObj = { start: performance.now(), raf: null as number | null, lastFrame: -1 };
        sheetAnimRef.current = animObj;
        currentAnimKindRef.current = kind;

        const step = () => {
          if (sheetAnimRef.current !== animObj) return;
          const anim = animObj;
          const elapsed = performance.now() - anim.start;
          const rawFrame = Math.floor(elapsed / frameMs);
          const baseFrame = loop ? ((rawFrame % frameCount) + frameCount) % frameCount : Math.min(frameCount - 1, Math.max(0, rawFrame));
          const frame = kind === "walking" ? (baseFrame + 1) % frameCount : baseFrame;
          if (frame !== anim.lastFrame) {
            anim.lastFrame = frame;
            const frameWrapEl = miningFrameWrapRef.current;
            const wrapBoxNow = dudeWrapRef.current ? dudeWrapRef.current.getBoundingClientRect() : null;
            const targetHeightNow = Math.max(1, Math.round(frameWrapEl?.clientHeight || wrapBoxNow?.height || 0));
            const rowIndexNow = kind === "mining" ? 0 : kind === "walking" ? 1 : kind === "petting" ? 2 : 3;
            const tyConstNow = -rowIndexNow * targetHeightNow;
            const currentWidth = Math.max(1, Math.round(dudeFrameWidthRef.current || 0));
            const offset = frame * currentWidth;
            const tx = -offset;
            stripImg.style.transform = `translate(${tx}px, ${tyConstNow}px)`;
          }
          if (opts && opts.onStep) opts.onStep();

          if (loop) {
            animObj.raf = requestAnimationFrame(step);
          } else {
            if (elapsed < frameCount * frameMs) {
              animObj.raf = requestAnimationFrame(step);
            } else {
              if (kind === "mining") setMiningPlaying(false);
              if (kind === "petting") setPettingPlaying(false);
              sheetAnimRef.current = null;
              currentAnimKindRef.current = "none";
              playSheetAnimation("standing");
            }
          }
        };
        animObj.raf = requestAnimationFrame(step);
      };
      requestAnimationFrame(init);
    },
    [miningPlaying, pettingPlaying]
  );

  const updateDudeStripSizing = useCallback(() => {
    const sheetImg = miningImageRef.current;
    const wrap = dudeWrapRef.current;
    const frameWrap = miningFrameWrapRef.current;
    const stripImg = miningStripImgRef.current;
    if (!sheetImg || !wrap || !frameWrap || !stripImg) return;
    const wrapBox = wrap.getBoundingClientRect();
    const frameCount = 4;
    const rows = 5;
    const frameWidth = Math.floor(sheetImg.naturalWidth / frameCount) || 1;
    const singleRowHeight = Math.floor((sheetImg.naturalHeight || 1) / rows) || 1;
    const targetHeight = Math.max(1, Math.round(wrapBox.height));
    const targetWidth = Math.max(1, Math.round((targetHeight * frameWidth) / singleRowHeight));

    try {
      frameWrap.style.width = `${targetWidth}px`;
      frameWrap.style.height = `${targetHeight}px`;
      stripImg.style.height = `${targetHeight * rows}px`;
      stripImg.style.width = `${targetWidth * frameCount}px`;
      dudeFrameWidthRef.current = targetWidth;
      const kind = currentAnimKindRef.current;
      const rowIndex = kind === "mining" ? 0 : kind === "walking" ? 1 : kind === "petting" ? 2 : 3;
      const tyConst = -rowIndex * targetHeight;
      const lastFrame = sheetAnimRef.current?.lastFrame ?? -1;
      const currentFrameIndex = lastFrame === -1 && kind === "walking" ? 1 : Math.max(0, lastFrame);
      const offset = currentFrameIndex * targetWidth;
      stripImg.style.transform = `translate(${-offset}px, ${tyConst}px)`;
    } catch {}
  }, []);

  useEffect(() => {
    if (!islandOverlayVisible) return;
    if (!(miningPlaying || walkingPlaying || pettingPlaying || standingPlaying)) return;
    const handler = () => {
      updateDudeStripSizing();
    };
    window.addEventListener("resize", handler);
    document.addEventListener("fullscreenchange", handler);
    const wrap = dudeWrapRef.current;
    let ro: ResizeObserver | null = null;
    try {
      if (wrap && typeof ResizeObserver !== "undefined") {
        ro = new ResizeObserver(() => updateDudeStripSizing());
        dudeResizeObserverRef.current = ro;
        ro.observe(wrap);
      }
    } catch {}
    try {
      requestAnimationFrame(handler);
    } catch {}
    return () => {
      window.removeEventListener("resize", handler);
      document.removeEventListener("fullscreenchange", handler);
      try {
        if (ro && wrap) ro.unobserve(wrap);
      } catch {}
      dudeResizeObserverRef.current = null;
    };
  }, [islandOverlayVisible, miningPlaying, walkingPlaying, pettingPlaying, standingPlaying, updateDudeStripSizing]);

  const startStandingAnimation = useCallback(() => playSheetAnimation("standing"), [playSheetAnimation]);

  useEffect(() => {
    if (!islandOverlayVisible || islandClosing) return;
    if (!dudeVisible) return;
    let raf1 = 0;
    let raf2 = 0;
    let timer: number | null = null;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        timer = window.setTimeout(() => {
          if (miningPlaying || walkingPlaying || pettingPlaying || standingPlaying) return;
          startStandingAnimation();
        }, 180);
      });
    });
    return () => {
      if (raf1) cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [islandOverlayVisible, islandClosing, dudeVisible, miningPlaying, walkingPlaying, pettingPlaying, standingPlaying, startStandingAnimation]);

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
    const cx = DEFAULT_DUDE_CENTER_X + INITIAL_DUDE_X_SHIFT;
    const cy = DEFAULT_DUDE_BOTTOM_Y + INITIAL_DUDE_Y_SHIFT;
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

  const getDudeBounds = useCallback((): { left: number; top: number; right: number; bottom: number; area: number } => {
    const widthFrac = Math.max(0.001, Math.min(1, DUDE_BOUNDS_WIDTH_FRAC));
    const heightFrac = Math.max(0.001, Math.min(1, DUDE_BOUNDS_HEIGHT_FRAC));
    const refPos = latestDudePosRef.current;
    const hasValidRefPos = refPos && isFinite(refPos.x) && isFinite(refPos.y) && !(refPos.x === 0 && refPos.y === 0);
    const fallback = initialDudePosRef.current ?? { x: DEFAULT_DUDE_CENTER_X + INITIAL_DUDE_X_SHIFT, y: DEFAULT_DUDE_BOTTOM_Y + INITIAL_DUDE_Y_SHIFT };
    const cx = hasValidRefPos ? refPos.x : fallback.x;
    const bottomY = hasValidRefPos ? refPos.y : fallback.y;
    const left = cx - widthFrac * 0.5;
    const right = cx + widthFrac * 0.5;
    const top = bottomY - heightFrac;
    const bottom = bottomY;
    return { left, top, right, bottom, area: Math.max(0, right - left) * Math.max(0, bottom - top) };
  }, []);

  const findValidMonLocation = useCallback(
    (opts: { mode: "initial" | "teleport" }) => {
      const defaultCandidate = { x: MON_REL_X, y: MON_REL_Y };
      const dudeB = getDudeBounds();
      const ellipse = SMALLER_SMOOTH_CYCLING_ELLIPSE;
      const minX = ellipse.cx - ellipse.rx - MON_BOUNDS_X_SHIFT;
      const maxX = ellipse.cx + ellipse.rx - MON_BOUNDS_X_SHIFT;
      const minY = ellipse.cy - ellipse.ryTop - MON_BASELINE_Y_OFFSET;
      const maxY = ellipse.cy + ellipse.ryBottom - MON_BASELINE_Y_OFFSET;
      const rx = ellipse.rx;
      const centerX = ellipse.cx;
      const centerY = ellipse.cy;
      const invRxSq = rx > 0 ? 1 / (rx * rx) : 0;
      const invRyTopSq = ellipse.ryTop > 0 ? 1 / (ellipse.ryTop * ellipse.ryTop) : 0;
      const invRyBottomSq = ellipse.ryBottom > 0 ? 1 / (ellipse.ryBottom * ellipse.ryBottom) : 0;
      const rangeX = maxX - minX;
      const rangeY = maxY - minY;
      const insideEllipse = (cx: number, bottomY: number) => {
        if (invRxSq === 0) return false;
        const dx = cx - centerX;
        const dy = bottomY - centerY;
        const invRySq = dy <= 0 ? invRyTopSq : invRyBottomSq;
        if (invRySq === 0) return false;
        return dx * dx * invRxSq + dy * dy * invRySq <= 1;
      };
      const widthFrac = getMonBoundsWidthFrac(latestMonKeyRef.current ?? monKey);
      const heightFrac = MON_HEIGHT_FRAC;
      const halfWidth = widthFrac * 0.5;
      const monArea = widthFrac * heightFrac;
      const DUDE_MAX_OVERLAP_FRAC = 0.055;
      const ROCK_MAX_OVERLAP_FRAC = 0.5;
      const dudeOverlapLimit = DUDE_MAX_OVERLAP_FRAC * monArea;
      const rockOverlapLimit = ROCK_MAX_OVERLAP_FRAC * monArea;
      const rockHalf = THEORETICAL_ROCK_SQUARE.side * 0.5;
      const rockB = {
        left: THEORETICAL_ROCK_SQUARE.cx - rockHalf,
        right: THEORETICAL_ROCK_SQUARE.cx + rockHalf,
        top: THEORETICAL_ROCK_SQUARE.cy - rockHalf,
        bottom: THEORETICAL_ROCK_SQUARE.cy + rockHalf,
      } as { left: number; top: number; right: number; bottom: number };
      const tryFindNonOverlappingPosition = (): { x: number; y: number } | null => {
        let attempts = 0;
        while (attempts < 777) {
          attempts++;
          const x = minX + Math.random() * rangeX;
          const y = minY + Math.random() * rangeY;
          const cx = x + MON_BOUNDS_X_SHIFT;
          const bottomY = y + MON_BASELINE_Y_OFFSET;
          if (!insideEllipse(cx, bottomY)) continue;
          const left = cx - halfWidth;
          const right = cx + halfWidth;
          const top = bottomY - heightFrac;
          const bottom = bottomY;
          let ix = Math.max(0, Math.min(rockB.right, right) - Math.max(rockB.left, left));
          if (ix > 0) {
            let iy = Math.max(0, Math.min(rockB.bottom, bottom) - Math.max(rockB.top, top));
            if (ix * iy > rockOverlapLimit) continue;
          }
          if (dudeB) {
            ix = Math.max(0, Math.min(dudeB.right, right) - Math.max(dudeB.left, left));
            if (ix > 0) {
              const iy = Math.max(0, Math.min(dudeB.bottom, bottom) - Math.max(dudeB.top, top));
              if (ix * iy > dudeOverlapLimit) continue;
            }
          }
          return { x, y };
        }
        return null;
      };
      if (opts.mode === "initial") {
        if (persistentMonPosRef) return persistentMonPosRef;
        if (initialMonPosRef.current) return initialMonPosRef.current;
        const pt = tryFindNonOverlappingPosition();
        if (pt) {
          initialMonPosRef.current = pt;
          return pt;
        }
        initialMonPosRef.current = defaultCandidate;
      }
      if (opts.mode === "teleport") {
        const tp = tryFindNonOverlappingPosition();
        if (tp) return tp;
      }
      return defaultCandidate;
    },
    [SMALLER_SMOOTH_CYCLING_ELLIPSE, monKey, getDudeBounds, THEORETICAL_ROCK_SQUARE.cx, THEORETICAL_ROCK_SQUARE.cy, THEORETICAL_ROCK_SQUARE.side]
  );

  useEffect(() => {
    let mounted = true;
    if (!islandOverlayVisible) return;
    const pt = findValidMonLocation({ mode: "initial" });
    setMonPos(pt);
    latestMonPosRef.current = pt;
    setMonFacingLeft(Math.random() < 0.5);
    (async () => {
      const { getSpriteByKey } = await import("../assets/monsSprites");
      const key = getOwnDrainerId();
      const data = getSpriteByKey(key);
      if (!mounted) return;
      setMonSpriteData(data);
      setMonKey(key);
      latestMonKeyRef.current = key;
    })();
    return () => {
      mounted = false;
    };
  }, [islandOverlayVisible, findValidMonLocation]);

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
    try {
      startPettingAnimationRef.current();
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

  const spawnIconParticles = useCallback((sourceEl: HTMLElement, src: string) => {
    const numParticles = 10;
    const durationMs = 420;
    const start = performance.now();
    const rect = sourceEl.getBoundingClientRect();
    const startX = rect.left + rect.width / 2;
    const startY = rect.top + rect.height / 2;
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
      el.style.backfaceVisibility = "hidden";
      el.style.transform = `translate(${startX - baseSize / 2}px, ${startY - baseSize / 2}px) scale(1)`;
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
        els[i].style.transform = `translate(${startX - baseSize / 2 + dx}px, ${startY - baseSize / 2 + dy}px) scale(${s}) rotate(${r}deg)`;
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

  useEffect(() => {
    spawnIconParticlesFnRef.current = spawnIconParticles;
  }, [spawnIconParticles]);

  const pullMaterialToBar = useCallback(
    (name: MaterialName, fromRect: DOMRect) => {
      const url = materialUrls[name];
      if (!url) return;
      const host = materialItemRefs.current[name];
      if (!host) return;
      const targetImg = (host.querySelector("img") as HTMLImageElement | null) || null;
      const toRect = (targetImg || host).getBoundingClientRect();

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
        fxContainerRef.current = fxContainer;
        document.body.appendChild(fxContainer);
      }

      const startX = fromRect.left + fromRect.width / 2;
      const startY = fromRect.top + fromRect.height / 2;
      const endX = toRect.left + toRect.width / 2;
      const endY = toRect.top + toRect.height / 2;
      const startW = Math.max(1, fromRect.width);
      const startH = Math.max(1, fromRect.height);
      const endW = Math.max(1, toRect.width);
      const endH = Math.max(1, toRect.height);

      const img = document.createElement("img");
      img.src = url;
      img.draggable = false;
      img.style.position = "absolute";
      img.style.left = "0";
      img.style.top = "0";
      img.style.width = `${startW}px`;
      img.style.height = `${startH}px`;
      img.style.pointerEvents = "none";
      img.style.zIndex = "90006";
      img.style.backfaceVisibility = "hidden";
      img.style.transform = `translate(${startX - startW / 2}px, ${startY - startH / 2}px) scale(1)`;
      img.style.opacity = "1";
      img.setAttribute("data-fx", "material-pull");
      fxContainer.appendChild(img);

      const durationMs = 500;
      const start = performance.now();

      const ease = (t: number) => 1 - Math.pow(1 - t, 3);

      function step(now: number) {
        const t = Math.min(1, (now - start) / durationMs);
        const e = ease(t);
        const bx = startX + (endX - startX) * e;
        const by = startY + (endY - startY) * e;
        const o = 1 - 0.1 * e;
        const w = startW + (endW - startW) * e;
        const h = startH + (endH - startH) * e;
        img.style.width = `${w}px`;
        img.style.height = `${h}px`;
        img.style.transform = `translate(${bx - w / 2}px, ${by - h / 2}px) scale(1)`;
        img.style.opacity = `${o}`;
        if (t < 1) {
          requestAnimationFrame(step);
        } else {
          img.remove();
        }
      }
      requestAnimationFrame(step);
    },
    [materialItemRefs, materialUrls]
  );

  const spawnMaterialDrop = useCallback(
    async (name: MaterialName, delay: number, common?: { duration1: number; spread: number; lift: number; fall: number; start: number; angle?: number }): Promise<MaterialName> => {
      walkSuppressedUntilRef.current = Math.max(walkSuppressedUntilRef.current, performance.now() + 777);
      const url = await getMaterialImageUrl(name);
      if (!url) return name;
      const rockLayer = rockLayerRef.current;
      const heroImg = islandHeroImgRef.current;
      if (!rockLayer || !heroImg) return name;
      const heroWrap = heroImg.parentElement as HTMLElement | null;
      if (!heroWrap) return name;
      const rect = rockLayer.getBoundingClientRect();
      lastRockRectRef.current = rect;
      const startX = rect.left + rect.width / 2;
      const startY = rect.top + rect.height * 0.5;
      const originOffsetX = (Math.random() - 0.5) * rect.width * 0.2;
      const originOffsetY = -rect.height * 0.12 + Math.random() * rect.height * 0.16;
      const wrapBox = heroWrap.getBoundingClientRect();
      const baseXPct = ((startX + originOffsetX - wrapBox.left) / Math.max(1, wrapBox.width)) * 100;
      const baseYPct = ((startY + originOffsetY - wrapBox.top) / Math.max(1, wrapBox.height)) * 100;
      const el = document.createElement("img");
      el.src = url;
      el.draggable = false;
      el.style.position = "absolute";
      el.style.left = `${baseXPct}%`;
      el.style.top = `${baseYPct}%`;
      el.style.width = "auto";
      el.style.height = "11.5%";
      el.style.pointerEvents = "none";
      el.style.willChange = "left, top, transform, opacity, z-index";
      el.style.backfaceVisibility = "hidden";
      el.style.transform = "translate(-50%, -50%) scale(0.95)";
      el.setAttribute("data-fx", "material-drop");
      heroWrap.appendChild(el);
      const shadowEl = document.createElement("div");
      shadowEl.style.position = "absolute";
      shadowEl.style.left = `${baseXPct}%`;
      shadowEl.style.top = `${baseYPct}%`;
      shadowEl.style.width = "0%";
      shadowEl.style.height = "2%";
      shadowEl.style.borderRadius = "50%";
      shadowEl.style.background = "rgba(0,0,0,0.28)";
      shadowEl.style.pointerEvents = "none";
      shadowEl.style.willChange = "left, top, width, height, filter, opacity, z-index";
      shadowEl.style.transform = "translate(-50%, -50%)";
      shadowEl.style.display = "none";
      shadowEl.setAttribute("data-fx", "material-drop-shadow");
      heroWrap.appendChild(shadowEl);
      materialDropsRef.current = materialDropsRef.current.concat([{ el, shadow: shadowEl, name }]);
      {
        const elBoxInit = el.getBoundingClientRect();
        const baselineInitFrac = Math.max(0, Math.min(1, (elBoxInit.top - wrapBox.top + elBoxInit.height * 0.8) / Math.max(1, wrapBox.height)));
        const baseInt = Math.round(baselineInitFrac * 100);
        let zBase = 600 + baseInt;
        if (rockReady) {
          const inFront = baselineInitFrac >= rockBottomY;
          zBase = (inFront ? 700 : 300) + baseInt;
        }
        el.style.zIndex = `${zBase}`;
        shadowEl.style.zIndex = `${Math.max(0, zBase - 1)}`;
      }
      const debugLine = SHOW_DEBUG_ISLAND_BOUNDS ? document.createElement("div") : null;
      if (debugLine) {
        debugLine.style.position = "absolute";
        debugLine.style.left = `${baseXPct}%`;
        debugLine.style.width = "0%";
        debugLine.style.top = `${baseYPct}%`;
        debugLine.style.height = "0";
        debugLine.style.borderTop = "2px dashed rgba(255,0,255,0.95)";
        debugLine.style.pointerEvents = "none";
        debugLine.style.zIndex = "100000";
        debugLine.setAttribute("data-debug", "material-baseline");
        heroWrap.appendChild(debugLine);
      }
      const angle = common?.angle ?? (Math.random() - 0.5) * Math.PI * 0.5;
      const spreadLocal = common?.spread ?? 24 + Math.random() * 48;
      const liftLocal = common?.lift ?? 12 + Math.random() * 18;
      const fallLocal = common?.fall ?? 12 + Math.random() * 14 + rect.height * 0.15;
      const duration1 = common?.duration1 ?? 600 + Math.random() * 140;
      const start = (common?.start ?? performance.now()) + delay;
      function easeOutQuart(t: number) {
        return 1 - Math.pow(1 - t, 4);
      }
      return new Promise<MaterialName>((resolve) => {
        function step1(now: number) {
          if (!overlayActiveRef.current || !el.isConnected) {
            el.remove();
            try {
              shadowEl.remove();
            } catch {}
            resolve(name);
            return;
          }
          if (now < start) {
            requestAnimationFrame(step1);
            return;
          }
          const t = Math.min(1, (now - start) / duration1);
          const e = easeOutQuart(t);
          const wrapEl = islandHeroImgRef.current ? (islandHeroImgRef.current.parentElement as HTMLElement | null) : null;
          if (!wrapEl) {
            el.remove();
            try {
              shadowEl.remove();
            } catch {}
            resolve(name);
            return;
          }
          const currentWrapBox = wrapEl.getBoundingClientRect();
          const dxPct = Math.sin(angle) * (spreadLocal / Math.max(1, currentWrapBox.width)) * 100 * e;
          const u = 1 - (2 * t - 1) * (2 * t - 1);
          const liftPct = (liftLocal / Math.max(1, currentWrapBox.height)) * 100;
          const fallPct = (fallLocal / Math.max(1, currentWrapBox.height)) * 100;
          const dyPct = -liftPct * u + fallPct * t * t;
          const s = 0.95 + 0.05 * e;
          const cx = baseXPct + dxPct;
          const cy = baseYPct + dyPct;
          el.style.left = `${cx}%`;
          el.style.top = `${cy}%`;
          if (t < 1) {
            const elBox = el.getBoundingClientRect();
            const widthPctItem = (elBox.width / Math.max(1, currentWrapBox.width)) * 100;
            const widthScale = 0.62 + 0.08 * e;
            const clampedWidthPct = Math.max(0, Math.min(100, widthPctItem * widthScale));
            const baselinePct = ((elBox.top - currentWrapBox.top + elBox.height * 0.8) / Math.max(1, currentWrapBox.height)) * 100;
            const maxBlurPx = Math.max(0.5, currentWrapBox.height * 0.014);
            const minBlurPx = Math.max(0.2, currentWrapBox.height * 0.004);
            const blurPx = minBlurPx + (maxBlurPx - minBlurPx) * (1 - e);
            const shadowOpacity = 0.12 + 0.16 * e;
            const shadowHeightPct = Math.max(1.0, 3.6 - 0.8 * e);
            shadowEl.style.display = "block";
            shadowEl.style.top = `${Math.max(0, Math.min(100, baselinePct + 0.04))}%`;
            shadowEl.style.left = `${cx}%`;
            shadowEl.style.width = `${clampedWidthPct}%`;
            shadowEl.style.height = `${shadowHeightPct}%`;
            shadowEl.style.filter = `blur(${blurPx}px)`;
            shadowEl.style.background = `rgba(0,0,0,${shadowOpacity.toFixed(3)})`;
          } else {
            const elBox = el.getBoundingClientRect();
            const widthPctItem = (elBox.width / Math.max(1, currentWrapBox.width)) * 100;
            const finalWidthScale = 0.62 + 0.08 * 1;
            const finalWidthPct = Math.max(0, Math.min(100, widthPctItem * finalWidthScale));
            const baselinePct = ((elBox.top - currentWrapBox.top + elBox.height * 0.8) / Math.max(1, currentWrapBox.height)) * 100;
            const minBlurPx = Math.max(0.2, currentWrapBox.height * 0.004);
            const finalBlurPx = minBlurPx;
            const finalOpacity = 0.12 + 0.16 * 1;
            const finalHeightPct = Math.max(1.0, 3.6 - 0.8 * 1);
            shadowEl.style.display = "block";
            shadowEl.style.top = `${Math.max(0, Math.min(100, baselinePct + 0.04))}%`;
            shadowEl.style.left = `${cx}%`;
            shadowEl.style.width = `${finalWidthPct}%`;
            shadowEl.style.height = `${finalHeightPct}%`;
            shadowEl.style.filter = `blur(${finalBlurPx}px)`;
            shadowEl.style.background = `rgba(0,0,0,${finalOpacity.toFixed(3)})`;
          }
          if (debugLine) {
            const elBox = el.getBoundingClientRect();
            const baselinePct = ((elBox.top - currentWrapBox.top + elBox.height * 0.8) / Math.max(1, currentWrapBox.height)) * 100;
            const widthPct = (elBox.width / Math.max(1, currentWrapBox.width)) * 100;
            const leftPct = Math.max(0, Math.min(100, cx - widthPct * 0.5));
            const clampedWidthPct = Math.max(0, Math.min(100 - leftPct, widthPct));
            debugLine.style.top = `${Math.max(0, Math.min(100, baselinePct))}%`;
            debugLine.style.left = `${leftPct}%`;
            debugLine.style.width = `${clampedWidthPct}%`;
          }
          el.style.transform = `translate(-50%, -50%) scale(${s})`;
          if (t < 1) {
            requestAnimationFrame(step1);
          } else {
            const elBoxFinal = el.getBoundingClientRect();
            const baselineFinalFrac = Math.max(0, Math.min(1, (elBoxFinal.top - currentWrapBox.top + elBoxFinal.height * 0.8) / Math.max(1, currentWrapBox.height)));
            const baseIntFinal = Math.round(baselineFinalFrac * 100);
            let zBaseFinal = 600 + baseIntFinal;
            if (rockReady) {
              const inFrontFinal = baselineFinalFrac >= rockBottomY;
              zBaseFinal = (inFrontFinal ? 700 : 300) + baseIntFinal;
            }
            el.style.zIndex = `${zBaseFinal}`;
            shadowEl.style.zIndex = `${Math.max(0, zBaseFinal - 1)}`;
            resolve(name);
          }
        }
        requestAnimationFrame(step1);
      });
    },
    [rockReady, rockBottomY]
  );

  const handleIslandClose = useCallback(
    (event?: React.MouseEvent | React.TouchEvent) => {
      if (isMobile && Date.now() - overlayJustOpenedAtRef.current < 250) {
        return;
      }
      didDismissSomethingWithOutsideTapJustNow();
      try {
        const heroImg = islandHeroImgRef.current;
        const heroWrap = heroImg ? (heroImg.parentElement as HTMLElement | null) : null;
        if (heroWrap) {
          const nodes = heroWrap.querySelectorAll('[data-fx="material-drop"], [data-fx="material-drop-shadow"]');
          nodes.forEach((n) => {
            try {
              n.parentElement?.removeChild(n);
            } catch {}
          });
          materialDropsRef.current = [];
        }
      } catch {}
      try {
        const container = fxContainerRef.current;
        if (container && container.parentNode) {
          container.parentNode.removeChild(container);
        }
      } catch {}
      playSounds([Sound.IslandClosing]);
      fxContainerRef.current = null;
      const anim = sheetAnimRef.current;
      if (anim && anim.raf) cancelAnimationFrame(anim.raf);
      sheetAnimRef.current = null;
      setMiningPlaying(false);
      currentAnimKindRef.current = "none";
      setWalkingPlaying(false);
      setPettingPlaying(false);
      setStandingPlaying(false);
      materialDropsRef.current = [];
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
  const isInsideHole = useCallback((x: number, y: number) => pointInPolygon(x, y, NO_WALK_TETRAGON), [pointInPolygon, NO_WALK_TETRAGON]);
  const holeCentroid = useMemo(() => {
    if (NO_WALK_TETRAGON.length === 0) return { x: 0.5, y: 0.5 };
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < NO_WALK_TETRAGON.length; i++) {
      sx += NO_WALK_TETRAGON[i].x;
      sy += NO_WALK_TETRAGON[i].y;
    }
    const n = NO_WALK_TETRAGON.length;
    return { x: sx / n, y: sy / n };
  }, [NO_WALK_TETRAGON]);
  const projectOutsideHole = useCallback(
    (point: { x: number; y: number }) => {
      if (NO_WALK_TETRAGON.length === 0) return null;
      let best: { x: number; y: number; d2: number } | null = null;
      for (let i = 0; i < NO_WALK_TETRAGON.length; i++) {
        const a = NO_WALK_TETRAGON[i];
        const b = NO_WALK_TETRAGON[(i + 1) % NO_WALK_TETRAGON.length];
        const vx = b.x - a.x;
        const vy = b.y - a.y;
        const len2 = vx * vx + vy * vy || 1;
        let t = ((point.x - a.x) * vx + (point.y - a.y) * vy) / len2;
        if (t < 0) t = 0;
        else if (t > 1) t = 1;
        const cx = a.x + vx * t;
        const cy = a.y + vy * t;
        const dx = point.x - cx;
        const dy = point.y - cy;
        const d2 = dx * dx + dy * dy;
        if (!best || d2 < best.d2) best = { x: cx, y: cy, d2 };
      }
      if (!best) return null;
      const dirX = best.x - holeCentroid.x;
      const dirY = best.y - holeCentroid.y;
      const len = Math.hypot(dirX, dirY) || 1;
      const step = SAFE_POINT_EDGE_INSET;
      const candidate = {
        x: Math.max(0, Math.min(1, best.x + (dirX / len) * step)),
        y: Math.max(0, Math.min(1, best.y + (dirY / len) * step)),
      };
      if (pointInPolygon(candidate.x, candidate.y, NO_WALK_TETRAGON)) {
        const candidate2 = {
          x: Math.max(0, Math.min(1, best.x + (dirX / len) * step * 4)),
          y: Math.max(0, Math.min(1, best.y + (dirY / len) * step * 4)),
        };
        if (!pointInPolygon(candidate2.x, candidate2.y, NO_WALK_TETRAGON) && isInsideSmoothEllipse(candidate2.x, candidate2.y)) {
          return candidate2;
        }
        return null;
      }
      if (!isInsideSmoothEllipse(candidate.x, candidate.y)) return null;
      return candidate;
    },
    [NO_WALK_TETRAGON, holeCentroid, isInsideSmoothEllipse, pointInPolygon]
  );
  const isInsideWalkArea = useCallback((x: number, y: number) => isInsideSmoothEllipse(x, y) && !isInsideHole(x, y), [isInsideHole, isInsideSmoothEllipse]);
  const clampWalkTarget = useCallback(
    (from: { x: number; y: number }, desired: { x: number; y: number }) => {
      if (isInsideWalkArea(desired.x, desired.y)) return { x: desired.x, y: desired.y };
      const insideEllipse = isInsideSmoothEllipse(desired.x, desired.y);
      if (isInsideHole(desired.x, desired.y)) {
        const projected = projectOutsideHole(desired);
        if (projected && !isInsideHole(projected.x, projected.y)) return projected;
        const ellipseFallback = projectToSmoothEllipse(desired.x, desired.y);
        if (!isInsideHole(ellipseFallback.x, ellipseFallback.y)) return ellipseFallback;
        return { x: from.x, y: from.y };
      }
      if (!insideEllipse) {
        const edge = projectToSmoothEllipse(desired.x, desired.y);
        if (!isInsideHole(edge.x, edge.y)) return edge;
      }
      if (insideEllipse) {
        const outsideHole = projectOutsideHole(desired);
        if (outsideHole && isInsideSmoothEllipse(outsideHole.x, outsideHole.y) && !isInsideHole(outsideHole.x, outsideHole.y)) {
          return outsideHole;
        }
      }
      const fallback = projectToSmoothEllipse(desired.x, desired.y);
      if (!isInsideHole(fallback.x, fallback.y)) return fallback;
      return { x: from.x, y: from.y };
    },
    [isInsideHole, isInsideSmoothEllipse, isInsideWalkArea, projectOutsideHole, projectToSmoothEllipse]
  );
  const getSafeAreaEllipse = useCallback((): { cx: number; cy: number; rx: number; ry: number } | null => {
    const box = rockBoxRef.current;
    if (!box) return null;
    const cx = (box.left + box.right) * 0.5 + SAFE_POINT_AREA_ELLIPSE_CENTER_OFFSET_X;
    const cy = (box.top + box.bottom) * 0.5 + SAFE_POINT_AREA_ELLIPSE_CENTER_OFFSET_Y;
    const rx = SAFE_POINT_AREA_ELLIPSE_RADIUS_FRAC_X;
    const ry = SAFE_POINT_AREA_ELLIPSE_RADIUS_FRAC_Y;
    return { cx, cy, rx, ry };
  }, []);
  const isInsideSafeArea = useCallback(
    (x: number, y: number) => {
      const ellipse = getSafeAreaEllipse();
      if (!ellipse) return false;
      const dx = (x - ellipse.cx) / ellipse.rx;
      const dy = (y - ellipse.cy) / ellipse.ry;
      return dx * dx + dy * dy <= 1;
    },
    [getSafeAreaEllipse]
  );

  const computeOverlapArea = useCallback((a: { left: number; top: number; right: number; bottom: number }, b: { left: number; top: number; right: number; bottom: number }) => {
    const ix = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const iy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    return ix * iy;
  }, []);

  const getMonBounds = useCallback(() => {
    const pos = latestMonPosRef.current || monPos;
    const key = latestMonKeyRef.current ?? monKey;
    if (!pos) return null;
    const widthFrac = Math.max(0.001, Math.min(1, getMonBoundsWidthFrac(key)));
    const heightFrac = Math.max(0.001, Math.min(1, MON_HEIGHT_FRAC));
    const cx = (pos.x ?? MON_REL_X) + MON_BOUNDS_X_SHIFT;
    const bottomY = (pos.y ?? MON_REL_Y) + MON_BASELINE_Y_OFFSET;
    const left = cx - widthFrac * 0.5;
    const right = cx + widthFrac * 0.5;
    const top = bottomY - heightFrac;
    const bottom = bottomY;
    return { left, top, right, bottom, area: Math.max(0, right - left) * Math.max(0, bottom - top) };
  }, [monKey, monPos]);

  const teleportFXStart = useCallback(() => {
    const frame = monFrameWrapRef.current;
    const strip = monStripImgRef.current;
    if (!frame || !strip) return;
    const baseX = monFacingLeft ? -1 : 1;
    try {
      frame.style.transformOrigin = "50% 100%";
      frame.style.transition = "transform 160ms ease-in";
      frame.style.transform = `scale(${baseX * 0.06}, 1.08)`;
    } catch {}
  }, [monFacingLeft]);

  const prepareTeleportAppear = useCallback(() => {
    const frame = monFrameWrapRef.current;
    const strip = monStripImgRef.current;
    if (!frame || !strip) return;
    const baseX = monFacingLeft ? -1 : 1;
    try {
      frame.style.transformOrigin = "50% 100%";
      frame.style.transition = "none";
      frame.style.transform = `scale(${baseX * 0.06}, 1.08)`;
    } catch {}
  }, [monFacingLeft]);

  const animateTeleportAppear = useCallback(() => {
    const frame = monFrameWrapRef.current;
    const strip = monStripImgRef.current;
    if (!frame || !strip) return;
    const baseX = monFacingLeft ? -1 : 1;
    try {
      requestAnimationFrame(() => {
        frame.style.transition = "transform 160ms cubic-bezier(0.22, 1, 0.36, 1)";
        frame.style.transform = `scale(${baseX}, 1)`;
        setTimeout(() => {
          try {
            frame.style.removeProperty("transition");
            frame.style.removeProperty("transform-origin");
            frame.style.removeProperty("transform");
          } catch {}
        }, 260);
      });
    } catch {}
  }, [monFacingLeft]);

  const spawnTeleportSparkles = useCallback(() => {
    const frame = monFrameWrapRef.current;
    const heroImg = islandHeroImgRef.current;
    if (!frame || !heroImg || !overlayActiveRef.current) return;
    const heroWrap = heroImg.parentElement as HTMLElement | null;
    if (!heroWrap) return;
    const frameBox = frame.getBoundingClientRect();
    const wrapBox = heroWrap.getBoundingClientRect();
    const cxPct = ((frameBox.left - wrapBox.left + frameBox.width / 2) / Math.max(1, wrapBox.width)) * 100;
    const cyPct = ((frameBox.top - wrapBox.top + frameBox.height / 2) / Math.max(1, wrapBox.height)) * 100;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.style.position = "absolute";
    svg.style.left = "0";
    svg.style.top = "0";
    svg.style.width = "100%";
    svg.style.height = "100%";
    svg.style.overflow = "visible";
    svg.style.pointerEvents = "none";
    const monBaselineY = (monPos ? monPos.y : MON_REL_Y) + MON_BASELINE_Y_OFFSET;
    const base = Math.round(monBaselineY * 100);
    let z = 600 + base;
    if (rockReady) {
      const inFrontOfRock = monBaselineY >= rockBottomY;
      z = inFrontOfRock ? 700 + base : 300 + base;
    }
    svg.style.zIndex = `${z}`;
    heroWrap.appendChild(svg);
    const num = 13;
    let remaining = num;
    const runParticle = (group: SVGGElement, c1: SVGCircleElement, c2: SVGCircleElement, start: number, duration: number, dx: number, dy: number) => {
      function step(now: number) {
        if (now < start) {
          requestAnimationFrame(step);
          return;
        }
        const t = Math.min(1, (now - start) / duration);
        const e = 1 - Math.pow(1 - t, 3);
        const x = cxPct + dx * e;
        const y = cyPct + dy * e;
        group.setAttribute("transform", `translate(${x} ${y}) scale(${0.8 + 0.3 * e})`);
        const fade = 1 - Math.pow(t, 1.6);
        c1.setAttribute("opacity", (0.9 * fade).toString());
        c2.setAttribute("opacity", (0.85 * fade).toString());
        if (t < 1) {
          requestAnimationFrame(step);
        } else {
          try {
            if (group.parentNode) group.parentNode.removeChild(group);
          } catch {}
          remaining--;
          if (remaining <= 0) {
            try {
              if (svg.parentNode) svg.parentNode.removeChild(svg);
            } catch {}
          }
        }
      }
      requestAnimationFrame(step);
    };
    for (let i = 0; i < num; i++) {
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      const c1 = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      const c2 = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      const r = 0.6 + Math.random() * 0.9;
      c1.setAttribute("r", r.toString());
      c1.setAttribute("fill", "#c6dcff");
      c1.setAttribute("opacity", "0");
      c2.setAttribute("r", (r * 0.55).toString());
      c2.setAttribute("fill", "#b8d4ff");
      c2.setAttribute("opacity", "0");
      g.appendChild(c1);
      g.appendChild(c2);
      g.setAttribute("transform", `translate(${cxPct} ${cyPct}) scale(0.8)`);
      svg.appendChild(g);
      const angle = Math.random() * Math.PI * 2;
      const dist = 6 + Math.random() * 10;
      const swirl = (Math.random() - 0.5) * 0.5;
      const dx = Math.cos(angle + swirl) * dist;
      const dy = Math.sin(angle + swirl) * dist;
      const start = performance.now() + Math.random() * 30;
      const duration = 360 + Math.random() * 140;
      runParticle(g as SVGGElement, c1 as SVGCircleElement, c2 as SVGCircleElement, start, duration, dx, dy);
    }
  }, [monPos, rockReady, rockBottomY]);

  const teleportMonToRandomNonOverlappingSpot = useCallback(() => {
    if (!monPos) return;
    teleportFXStart();
    setMonTeleporting(true);
    setTimeout(() => {
      const chosen = findValidMonLocation({ mode: "teleport" });
      if (chosen) {
        setMonFacingLeft(Math.random() < 0.5);
        setMonPos(chosen);
        latestMonPosRef.current = chosen;
        persistentMonPosRef = chosen;
      }
      setTimeout(() => {
        prepareTeleportAppear();
        setMonTeleporting(false);
        spawnTeleportSparkles();
        animateTeleportAppear();
      }, 30);
    }, 180);
  }, [findValidMonLocation, monPos, teleportFXStart, spawnTeleportSparkles, prepareTeleportAppear, animateTeleportAppear]);

  const checkAndTeleportMonIfOverlapped = useCallback(() => {
    const monB = getMonBounds();
    if (!monB) return;
    const dudeB = getDudeBounds();
    const overlap = computeOverlapArea(dudeB, monB);
    const overlapFracOfMon = monB.area > 0 ? overlap / monB.area : 0;
    if (overlapFracOfMon > 0.55) {
      teleportMonToRandomNonOverlappingSpot();
    }
  }, [getMonBounds, getDudeBounds, computeOverlapArea, teleportMonToRandomNonOverlappingSpot]);

  const stopMoveAnim = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    moveAnimRef.current = null;
    checkAndTeleportMonIfOverlapped();
    const wAnim = currentAnimKindRef.current === "walking" ? sheetAnimRef.current : null;
    if (wAnim) {
      if (wAnim.raf) cancelAnimationFrame(wAnim.raf);
      sheetAnimRef.current = null;
      currentAnimKindRef.current = "none";
    }
    setWalkingPlaying(false);
  }, [checkAndTeleportMonIfOverlapped]);

  const latestDudePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const moveTargetMetaRef = useRef<{ x: number; y: number; facingLeft: boolean; onArrive?: () => void } | null>(null);
  const dragModeRef = useRef<"none" | "free" | "edge">("none");
  const lastFacingFlipAtRef = useRef<number>(0);
  const lastFacingDirRef = useRef<boolean>(false);
  const lastEllipsePointerRef = useRef<{ x: number; y: number }>({ x: -1, y: -1 });
  const lastPointerRef = useRef<{ x: number; y: number }>({ x: -1, y: -1 });
  useEffect(() => {
    latestDudePosRef.current = dudePos;
  }, [dudePos]);
  const getReferencePos = useCallback(() => {
    const ref = latestDudePosRef.current;
    if (ref && Number.isFinite(ref.x) && Number.isFinite(ref.y) && !(ref.x === 0 && ref.y === 0)) return ref;
    return dudePos;
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

  const startMiningAnimation = useCallback(() => playSheetAnimation("mining"), [playSheetAnimation]);

  const startWalkingAnimation = useCallback(() => {
    const onStep = () => {
      if (materialDropsRef.current.length > 0) {
        try {
          const dudeB = getDudeBounds();
          const hero = islandHeroImgRef.current;
          const wrapBox = hero ? hero.getBoundingClientRect() : null;
          if (wrapBox) {
            const collected: Array<number> = [];
            for (let i = 0; i < materialDropsRef.current.length; i++) {
              const m = materialDropsRef.current[i];
              if (!m.el.isConnected) {
                collected.push(i);
                continue;
              }
              const eb = m.el.getBoundingClientRect();
              const left = (eb.left - wrapBox.left) / Math.max(1, wrapBox.width);
              const right = (eb.right - wrapBox.left) / Math.max(1, wrapBox.width);
              const top = (eb.top - wrapBox.top) / Math.max(1, wrapBox.height);
              const bottom = (eb.bottom - wrapBox.top) / Math.max(1, wrapBox.height);
              const area = Math.max(0, right - left) * Math.max(0, bottom - top);
              const overlap = computeOverlapArea(dudeB, { left, top, right, bottom });
              const frac = area > 0 ? overlap / area : 0;
              if (frac > 0.55) {
                try {
                  pullMaterialToBar(m.name, eb);
                } catch {}
                try {
                  m.el.remove();
                } catch {}
                try {
                  m.shadow.remove();
                } catch {}
                collected.push(i);
              }
            }
            if (collected.length > 0) {
              const delta: Partial<Record<MaterialName, number>> = {};
              const nextArr: typeof materialDropsRef.current = [];
              for (let i = 0; i < materialDropsRef.current.length; i++) {
                if (collected.indexOf(i) !== -1) {
                  const name = materialDropsRef.current[i].name;
                  delta[name] = (delta[name] || 0)! + 1;
                } else {
                  nextArr.push(materialDropsRef.current[i]);
                }
              }
              materialDropsRef.current = nextArr;
              setMaterialAmounts((prev) => {
                const next = { ...prev } as Record<MaterialName, number>;
                (Object.keys(delta) as MaterialName[]).forEach((k) => {
                  next[k] = (next[k] || 0) + (delta[k] || 0);
                });
                return next;
              });
              playSounds([Sound.CollectingMaterials]);
            }
          }
        } catch {}
      }
    };
    playSheetAnimation("walking", { onStep });
  }, [playSheetAnimation, computeOverlapArea, getDudeBounds, pullMaterialToBar]);

  const startPettingAnimation = useCallback(() => playSheetAnimation("petting"), [playSheetAnimation]);

  useEffect(() => {
    startPettingAnimationRef.current = startPettingAnimation;
  }, [startPettingAnimation]);

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
      if (currentAnimKindRef.current !== "walking") startWalkingAnimation();
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
            let triggeredArrival = false;
            const targetMeta = moveTargetMetaRef.current;
            if (targetMeta) {
              const closeEnough = Math.hypot(nextX - targetMeta.x, nextY - targetMeta.y) < 0.012;
              if (closeEnough) {
                setDudeFacingLeft(targetMeta.facingLeft);
                try {
                  if (targetMeta.onArrive) {
                    triggeredArrival = true;
                    targetMeta.onArrive();
                  }
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
            latestDudePosRef.current = { x: nextX, y: nextY };
            stopMoveAnim();
            if (!triggeredArrival) startStandingAnimation();
          }
        };
        rafRef.current = requestAnimationFrame(step);
      }
    },
    [heroSize.w, heroSize.h, stopMoveAnim, syncDudePosFromOriginal, decideFacingWithHysteresis, startWalkingAnimation, startStandingAnimation]
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
      if (currentAnimKindRef.current !== "walking") startWalkingAnimation();
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
            latestDudePosRef.current = { x: nextX, y: nextY };
            stopMoveAnim();
            startStandingAnimation();
          }
        };
        rafRef.current = requestAnimationFrame(step);
      }
    },
    [heroSize.h, heroSize.w, stopMoveAnim, decideFacingWithHysteresis, startWalkingAnimation, startStandingAnimation]
  );

  const handleMaterialItemTap = useCallback(
    (name: MaterialName, _url: string | null) => (_event: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
      activateMaterial(name);
    },
    [activateMaterial]
  );

  const isDraggingRef = useRef(false);

  const handlePointerStart = useCallback(
    (event: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
      const skipForMaterialTarget = isMaterialTarget((event.target as Node) || null);
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
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      const skipDueToCircleGesture = circlesGestureActiveRef.current;
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
      const nxxEarly = (clientX - rect.left) / width;
      const nyyEarly = (clientY - rect.top) / height;
      const isInsideSafeAreaEarly = isInsideSafeArea(nxxEarly, nyyEarly);
      const inside = clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
      if (!inside && !isInsideSafeAreaEarly) {
        if (!skipForMaterialTarget) {
          const vw = window.innerWidth;
          const isTouchEvent = !!(anyEvent.touches && anyEvent.touches[0]);
          const isAtScreenEdge = isTouchEvent && (clientX <= TOUCH_EDGE_DEADZONE_PX || clientX >= vw - TOUCH_EDGE_DEADZONE_PX);
          if (isAtScreenEdge) {
            return;
          }
          handleIslandClose(event as unknown as React.MouseEvent | React.TouchEvent);
          return;
        }
      }
      const rx = Math.floor(clientX - rect.left);
      const ry = Math.floor(clientY - rect.top);
      const nx = rx / width;
      const ny = ry / height;

      if (!skipForMaterialTarget && !skipDueToCircleGesture && !walkingDragActiveRef.current && isInsideRockBox(nx, ny)) {
        syncDudePosFromOriginal();
        const initial = initialDudePosRef.current || latestDudePosRef.current;
        const alternate = { x: initial.x + ALTERNATE_DUDE_X_SHIFT - INITIAL_DUDE_X_SHIFT, y: initial.y };
        const distToInitial = Math.hypot(dudePos.x - initial.x, dudePos.y - initial.y);
        const distToAlternate = Math.hypot(dudePos.x - alternate.x, dudePos.y - alternate.y);
        const targetPos = distToAlternate < distToInitial ? alternate : initial;
        const isAlternate = targetPos === alternate;
        const atTarget = Math.hypot(dudePos.x - targetPos.x, dudePos.y - targetPos.y) < 0.015;
        if (!atTarget) {
          moveTargetMetaRef.current = {
            x: targetPos.x,
            y: targetPos.y,
            facingLeft: isAlternate ? !INITIAL_DUDE_FACING_LEFT : INITIAL_DUDE_FACING_LEFT,
            onArrive: () => {
              startMiningAnimation();
            },
          };
          startMoveTo(targetPos.x, targetPos.y);
          playSounds([Sound.WalkToRock]);
        } else {
          setDudeFacingLeft(isAlternate ? !INITIAL_DUDE_FACING_LEFT : INITIAL_DUDE_FACING_LEFT);
          try {
            rockRef.current?.tap();
          } catch {}
        }
        if ((event as any).preventDefault) (event as any).preventDefault();
        return;
      }
      if (!skipForMaterialTarget && !skipDueToCircleGesture && isInsideMonBox(nx, ny)) {
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
        const fromPoint = getReferencePos();
        const insideWalk = isInsideWalkArea(best.x, best.y);
        const target = insideWalk ? best : clampWalkTarget(fromPoint, best);
        const onLeftSide = Math.abs(best.x - leftX) <= Math.abs(best.x - rightX);
        const facingLeft = onLeftSide ? false : true;
        const atTarget = Math.hypot(dudePos.x - target.x, dudePos.y - target.y) < 0.015;
        if (!atTarget) {
          moveTargetMetaRef.current = {
            x: target.x,
            y: target.y,
            facingLeft,
            onArrive: () => {
              try {
                startPettingAnimationRef.current();
              } catch {}
            },
          };
          startMoveTo(target.x, target.y);
        } else {
          setDudeFacingLeft(facingLeft);
          petMon();
          checkAndTeleportMonIfOverlapped();
        }
        if ((event as any).preventDefault) (event as any).preventDefault();
        return;
      }

      const insideSafeAreaStart = isInsideSafeArea(nx, ny);
      const insideHoleStart = isInsideHole(nx, ny);
      if (!skipForMaterialTarget && !skipDueToCircleGesture && insideHoleStart) {
        if ("preventDefault" in event) {
          event.preventDefault();
        }
        return;
      }
      if (!skipForMaterialTarget && !skipDueToCircleGesture && (isInsideSmoothEllipse(nx, ny) || insideSafeAreaStart)) {
        if (performance.now() < walkSuppressedUntilRef.current) {
          return;
        }
        const fromPointStart = getReferencePos();
        const desiredStart = { x: nx, y: ny };
        const target = clampWalkTarget(fromPointStart, desiredStart);
        if (isInsideHole(target.x, target.y)) {
          if ("preventDefault" in event) {
            event.preventDefault();
          }
          return;
        }
        moveTargetMetaRef.current = null;
        startMoveTo(target.x, target.y);
        isDraggingRef.current = true;
        const insideWalkStart = isInsideWalkArea(nx, ny);
        dragModeRef.current = insideWalkStart ? "free" : "edge";
        lastPointerRef.current = { x: nx, y: ny };
        lastEllipsePointerRef.current = { x: nx, y: ny };
        walkingDragActiveRef.current = true;

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
          const rxx = Math.floor(cx - rect.left);
          const ryy = Math.floor(cy - rect.top);
          const nxx = rxx / width;
          const nyy = ryy / height;
          if (dragModeRef.current === "edge") {
            const lp = lastEllipsePointerRef.current;
            const dxp = nxx - lp.x;
            const dyp = nyy - lp.y;
            if (dxp * dxp + dyp * dyp < SAFE_POINTER_MOVE_EPS * SAFE_POINTER_MOVE_EPS) {
              if ("preventDefault" in e) e.preventDefault();
              return;
            }
          } else {
            const lp = lastPointerRef.current;
            const dxp = nxx - lp.x;
            const dyp = nyy - lp.y;
            if (dxp * dxp + dyp * dyp < SAFE_POINTER_MOVE_EPS * SAFE_POINTER_MOVE_EPS) {
              if ("preventDefault" in e) e.preventDefault();
              return;
            }
          }
          const desiredPoint = { x: nxx, y: nyy };
          const nextTarget = clampWalkTarget(getReferencePos(), desiredPoint);
          if (isInsideWalkArea(nxx, nyy)) {
            dragModeRef.current = "free";
            lastPointerRef.current = { x: nxx, y: nyy };
            lastEllipsePointerRef.current = { x: nxx, y: nyy };
          } else {
            dragModeRef.current = "edge";
            lastEllipsePointerRef.current = { x: nxx, y: nyy };
          }
          updateMoveTarget(nextTarget.x, nextTarget.y);
          latestDudePosRef.current = moveAnimRef.current
            ? {
                x: moveAnimRef.current.from.x + (moveAnimRef.current.to.x - moveAnimRef.current.from.x) * Math.min(1, (performance.now() - moveAnimRef.current.start) / moveAnimRef.current.duration),
                y: moveAnimRef.current.from.y + (moveAnimRef.current.to.y - moveAnimRef.current.from.y) * Math.min(1, (performance.now() - moveAnimRef.current.start) / moveAnimRef.current.duration),
              }
            : latestDudePosRef.current;
          if ("preventDefault" in e) {
            e.preventDefault();
          }
        };

        const handleEnd = () => {
          isDraggingRef.current = false;
          walkingDragActiveRef.current = false;
          dragModeRef.current = "none";
          lastEllipsePointerRef.current = { x: -1, y: -1 };
          window.removeEventListener("mousemove", handleMove as any);
          window.removeEventListener("mouseup", handleEnd as any);
          window.removeEventListener("touchmove", handleMove as any);
          window.removeEventListener("touchend", handleEnd as any);
          window.removeEventListener("touchcancel", handleEnd as any);
          window.removeEventListener("blur", handleEnd as any);
          document.removeEventListener("visibilitychange", handleVisibilityChange as any);
          if (!moveAnimRef.current) {
            const wAnim = currentAnimKindRef.current === "walking" ? sheetAnimRef.current : null;
            if (wAnim && wAnim.raf) cancelAnimationFrame(wAnim.raf);
            sheetAnimRef.current = null;
            currentAnimKindRef.current = "none";
            setWalkingPlaying(false);
            checkAndTeleportMonIfOverlapped();
            startStandingAnimation();
          }
        };

        const handleVisibilityChange = () => {
          if (document.visibilityState !== "visible") {
            handleEnd();
          }
        };

        window.addEventListener("mousemove", handleMove as any, { passive: false });
        window.addEventListener("mouseup", handleEnd as any);
        window.addEventListener("touchmove", handleMove as any, { passive: false });
        window.addEventListener("touchend", handleEnd as any);
        window.addEventListener("touchcancel", handleEnd as any);
        window.addEventListener("blur", handleEnd as any);
        document.addEventListener("visibilitychange", handleVisibilityChange as any);

        if ("preventDefault" in event) {
          event.preventDefault();
        }
        return;
      }
      const inDismissTriangle = pointInTriangle(nx, ny, DISMISS_ALLOWED_TRIANGLE_A) || pointInTriangle(nx, ny, DISMISS_ALLOWED_TRIANGLE_B);
      if (!skipForMaterialTarget && !skipDueToCircleGesture && inDismissTriangle) {
        handleIslandClose(event as unknown as React.MouseEvent | React.TouchEvent);
        return;
      }
      const isInAnyHotspot = (() => {
        for (let i = 0; i < ISLAND_HOTSPOTS.length; i++) {
          const c = ISLAND_HOTSPOTS[i];
          const dx = nx - c.cxPct;
          const dy = ny - c.cyPct;
          const r = c.dPct * 0.5;
          if (dx * dx + dy * dy <= r * r) return true;
        }
        return false;
      })();
      const allowStarDrag = skipForMaterialTarget || !isInAnyHotspot || skipDueToCircleGesture;
      if (allowStarDrag) {
        const handleMove = (e: MouseEvent | TouchEvent) => {
          let cx2 = 0;
          let cy2 = 0;
          if ("touches" in e && e.touches[0]) {
            cx2 = e.touches[0].clientX;
            cy2 = e.touches[0].clientY;
          } else if ("clientX" in e) {
            cx2 = (e as MouseEvent).clientX;
            cy2 = (e as MouseEvent).clientY;
          }
          const rxx2 = Math.floor(cx2 - rect.left);
          const ryy2 = Math.floor(cy2 - rect.top);
          const nxx2 = rxx2 / Math.max(1, rect.width);
          const nyy2 = ryy2 / Math.max(1, rect.height);
          const withinBounds = nxx2 >= STAR_SHINE_PENTAGON_BOUNDS.minX && nxx2 <= STAR_SHINE_PENTAGON_BOUNDS.maxX && nyy2 >= STAR_SHINE_PENTAGON_BOUNDS.minY && nyy2 <= STAR_SHINE_PENTAGON_BOUNDS.maxY && pointInPolygon(nxx2, nyy2, STAR_SHINE_PENTAGON);
          if (withinBounds) {
            if (!starsHoldRef.current) {
              setStarsCenterImmediate(nxx2 * 100, nyy2 * 100);
              setStarsHold(true);
            } else {
              queueStarsCenterUpdate(nxx2 * 100, nyy2 * 100);
            }
            if (starsTimerRef.current) window.clearTimeout(starsTimerRef.current);
            if (starsAnimActiveRef.current) {
              setStarsVisible(false);
              starsAnimActiveRef.current = false;
            }
            wasStarsInsideRef.current = true;
            starsDismissedRef.current = false;
          } else {
            if (starsHoldRef.current) setStarsHold(false);
            if (!starsAnimActiveRef.current && !starsDismissedRef.current) {
              cancelQueuedStarsCenterUpdate();
              if (starsTimerRef.current) window.clearTimeout(starsTimerRef.current);
              setStarsVisible(false);
              starsAnimActiveRef.current = true;
              starsDismissedRef.current = true;
              requestAnimationFrame(() => {
                setStarsVisible(true);
                starsTimerRef.current = window.setTimeout(() => {
                  setStarsVisible(false);
                  starsAnimActiveRef.current = false;
                }, 520);
              });
            } else if (starsDismissedRef.current || starsAnimActiveRef.current) {
              if (starsTimerRef.current) window.clearTimeout(starsTimerRef.current);
              setStarsVisible(false);
            }
            wasStarsInsideRef.current = false;
          }
          if ("preventDefault" in e) (e as any).preventDefault();
        };
        const handleEnd = () => {
          isDraggingRef.current = false;
          if (starsHoldRef.current) setStarsHold(false);
          if (wasStarsInsideRef.current && !starsAnimActiveRef.current) {
            if (starsTimerRef.current) window.clearTimeout(starsTimerRef.current);
            cancelQueuedStarsCenterUpdate();
            starsAnimActiveRef.current = true;
            setStarsVisible(true);
            if (starsHoldRef.current) setStarsHold(false);
            starsTimerRef.current = window.setTimeout(() => {
              setStarsVisible(false);
              starsAnimActiveRef.current = false;
              starsDismissedRef.current = false;
            }, 520);
          } else {
            setStarsVisible(false);
            starsDismissedRef.current = false;
          }
          window.removeEventListener("mousemove", handleMove as any);
          window.removeEventListener("mouseup", handleEnd as any);
          window.removeEventListener("touchmove", handleMove as any);
          window.removeEventListener("touchend", handleEnd as any);
          window.removeEventListener("touchcancel", handleEnd as any);
          window.removeEventListener("blur", handleEnd as any);
          document.removeEventListener("visibilitychange", handleVisibilityChange as any);
        };
        const handleVisibilityChange = () => {
          if (document.visibilityState !== "visible") {
            handleEnd();
          }
        };
        window.addEventListener("mousemove", handleMove as any, { passive: false });
        window.addEventListener("mouseup", handleEnd as any);
        window.addEventListener("touchmove", handleMove as any, { passive: false });
        window.addEventListener("touchend", handleEnd as any);
        window.addEventListener("touchcancel", handleEnd as any);
        window.addEventListener("blur", handleEnd as any);
        document.addEventListener("visibilitychange", handleVisibilityChange as any);
        isDraggingRef.current = true;
        if (starsTimerRef.current) window.clearTimeout(starsTimerRef.current);
        cancelQueuedStarsCenterUpdate();
        starsAnimActiveRef.current = false;
        starsDismissedRef.current = false;
        wasStarsInsideRef.current = false;
        setStarsVisible(false);
        if (starsHoldRef.current) setStarsHold(false);
        const withinStart = nx >= STAR_SHINE_PENTAGON_BOUNDS.minX && nx <= STAR_SHINE_PENTAGON_BOUNDS.maxX && ny >= STAR_SHINE_PENTAGON_BOUNDS.minY && ny <= STAR_SHINE_PENTAGON_BOUNDS.maxY && pointInPolygon(nx, ny, STAR_SHINE_PENTAGON);
        if (withinStart) {
          if (starsTimerRef.current) window.clearTimeout(starsTimerRef.current);
          setStarsVisible(false);
          if (starsAnimActiveRef.current) {
            starsAnimActiveRef.current = false;
          }
          setStarsCenterImmediate(nx * 100, ny * 100);
          setStarsHold(true);
          wasStarsInsideRef.current = true;
          starsDismissedRef.current = false;
        } else {
          setStarsHold(false);
          setStarsVisible(false);
          wasStarsInsideRef.current = false;
          starsDismissedRef.current = true;
        }
        if ("preventDefault" in event) (event as any).preventDefault();
        return;
      }
    },
    [handleIslandClose, pointInPolygon, startMoveTo, updateMoveTarget, rockIsBroken, rockReady, dudePos, startMiningAnimation, startStandingAnimation, syncDudePosFromOriginal, monKey, monPos, petMon, checkAndTeleportMonIfOverlapped, pointInTriangle, DISMISS_ALLOWED_TRIANGLE_A, DISMISS_ALLOWED_TRIANGLE_B, STAR_SHINE_PENTAGON, STAR_SHINE_PENTAGON_BOUNDS, queueStarsCenterUpdate, cancelQueuedStarsCenterUpdate, setStarsCenterImmediate, isMaterialTarget, isInsideHole, isInsideSmoothEllipse, isInsideWalkArea, clampWalkTarget, isInsideSafeArea, getReferencePos]
  );

  const handleSafeHitboxPointerDown = useCallback(
    (event: React.MouseEvent | React.TouchEvent) => {
      event.stopPropagation();
      if (!isMaterialTarget((event.target as Node) || null)) {
        return;
      }
      handlePointerStart(event as React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>);
    },
    [handlePointerStart, isMaterialTarget]
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
            <SafeBarRow>
              <SafeHitbox $active={islandOverlayVisible && !islandClosing} $debug={SHOW_DEBUG_ISLAND_BOUNDS && islandOverlayVisible && !islandClosing} onMouseDown={!isMobile ? handleSafeHitboxPointerDown : undefined} onTouchStart={isMobile ? handleSafeHitboxPointerDown : undefined}>
                <MaterialsBar ref={materialsBarRef} $visible={islandOverlayVisible && !islandClosing}>
                  {MATERIALS.map((name) => (
                    <MaterialItem
                      ref={(el) => {
                        materialItemRefs.current[name] = el;
                      }}
                      key={name}
                      onMouseDown={!isMobile ? handleMaterialItemTap(name, materialUrls[name]) : undefined}
                      onTouchStart={isMobile ? handleMaterialItemTap(name, materialUrls[name]) : undefined}>
                      {materialUrls[name] && <MaterialIcon src={materialUrls[name] || ""} alt="" draggable={false} />}
                      <MaterialAmount>{materialAmounts[name]}</MaterialAmount>
                    </MaterialItem>
                  ))}
                </MaterialsBar>
              </SafeHitbox>
            </SafeBarRow>
            <Animator $tx={islandTranslate.x} $ty={islandTranslate.y} $sx={islandScale.x} $sy={islandScale.y} onTransitionEnd={handleIslandTransitionEnd}>
              <HeroWrap ref={heroWrapRef}>
                <Hero ref={islandHeroImgRef} src={resolvedUrl} alt="" draggable={false} />
                <WalkOverlay />
                {islandOverlayVisible && !islandClosing && (
                  <HotspotOverlay ref={editorOverlayRef}>
                    <MaskedArea $cx={starsMaskCenter.xPct} $cy={starsMaskCenter.yPct} $visible={starsHold || starsVisible}>
                      <StarsOverlayImage ref={starsImgRef} src={STARS_URL} alt="" draggable={false} $visible={starsVisible} $hold={starsHold} />
                    </MaskedArea>
                    {FEATURE_FULL_OVERLAY_ON_HOTSPOT &&
                      ISLAND_HOTSPOTS.map((_, i) => {
                        const label = HOTSPOT_LABELS[i] ?? i + 1;
                        const src = `https://assets.mons.link/rocks/underground/${label}.webp`;
                        return <HotspotFullImage key={`img-${i}`} src={src} alt="" draggable={false} $visible={hotspotVisible[i]} />;
                      })}
                    {FEATURE_GLOWS_ON_HOTSPOT &&
                      ISLAND_HOTSPOTS.map((c, i) => {
                        const left = (c.cxPct - c.dPct / 2) * 100;
                        const top = (c.cyPct - c.dPct / 2) * 100;
                        const size = c.dPct * 100;
                        return <HotspotCircle key={`glow-${i}`} $visible={hotspotVisible[i]} style={{ left: `${left}%`, top: `${top}%`, width: `${size}%`, height: `${size}%` }} />;
                      })}
                  </HotspotOverlay>
                )}
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
                            const ellipse = getSafeAreaEllipse();
                            if (!ellipse) return null;
                            const cx = Math.max(0, Math.min(100, ellipse.cx * 100));
                            const cy = Math.max(0, Math.min(100, ellipse.cy * 100));
                            const rx = Math.max(0.001, Math.min(100, ellipse.rx * 100));
                            const ry = Math.max(0.001, Math.min(100, ellipse.ry * 100));
                            return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="rgba(0,200,0,0.12)" stroke="rgba(0,180,0,0.85)" strokeWidth={0.9} />;
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
                      <path d={smoothEllipseDebugPath.d} fill="rgba(0,128,255,0.08)" stroke="rgba(0,128,255,0.8)" strokeWidth={0.8} />
                      {ISLAND_HOTSPOTS.map((c, i) => {
                        const cx = Math.max(0, Math.min(100, c.cxPct * 100));
                        const cy = Math.max(0, Math.min(100, c.cyPct * 100));
                        const r = Math.max(0.001, Math.min(100, (c.dPct * 100) / 2));
                        return <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,0,255,0.85)" strokeWidth={0.8} />;
                      })}
                    </svg>
                  </div>
                )}
                {SHOW_DEBUG_ISLAND_BOUNDS && (
                  <>
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        pointerEvents: "none",
                        zIndex: 100010,
                      }}>
                      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", pointerEvents: "none" }}>
                        <polygon points={DISMISS_ALLOWED_TRIANGLE_A.map((p) => `${p.x * 100},${p.y * 100}`).join(" ")} fill="rgba(0,200,0,0.12)" stroke="rgba(0,180,0,0.85)" strokeWidth={0.9} />
                        <polygon points={DISMISS_ALLOWED_TRIANGLE_B.map((p) => `${p.x * 100},${p.y * 100}`).join(" ")} fill="rgba(0,200,0,0.12)" stroke="rgba(0,180,0,0.85)" strokeWidth={0.9} />
                        <polygon points={NO_WALK_TETRAGON.map((p) => `${p.x * 100},${p.y * 100}`).join(" ")} fill="rgba(255,165,0,0.12)" stroke="rgba(255,140,0,0.9)" strokeWidth={0.9} />
                        <polygon points={STAR_SHINE_PENTAGON.map((p) => `${p.x * 100},${p.y * 100}`).join(" ")} fill="rgba(255,215,0,0.12)" stroke="rgba(218,165,32,0.95)" strokeWidth={0.9} />
                        <path d={smoothEllipseDebugPath.d} fill="rgba(64,224,208,0.12)" stroke="rgba(64,224,208,0.95)" strokeWidth={0.9} />
                        {(() => {
                          const cx = Math.max(0, Math.min(1, THEORETICAL_ROCK_SQUARE.cx)) * 100;
                          const cy = Math.max(0, Math.min(1, THEORETICAL_ROCK_SQUARE.cy)) * 100;
                          const side = Math.max(0.6, Math.min(100, THEORETICAL_ROCK_SQUARE.side * 100));
                          const x = cx - side / 2;
                          const y = cy - side / 2;
                          return <rect x={x} y={y} width={side} height={side} fill="rgba(70,130,180,0.10)" stroke="rgba(70,130,180,0.95)" strokeWidth={0.9} />;
                        })()}
                      </svg>
                    </div>
                  </>
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
                  <DudeSpriteImg $facingLeft={dudeFacingLeft} src={`data:image/png;base64,${islandMonsIdle}`} alt="" draggable={false} style={{ visibility: miningPlaying || walkingPlaying || pettingPlaying || standingPlaying ? "hidden" : "visible" }} />
                  {(miningPlaying || walkingPlaying || pettingPlaying || standingPlaying) && (
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
                        {monVisible &&
                          !monTeleporting &&
                          (() => {
                            const widthPct = getMonBoundsWidthFrac(monKey) * 1.3 * 100;
                            const cx = ((monPos?.x ?? MON_REL_X) + MON_BOUNDS_X_SHIFT) * 100;
                            const bottomY = (monPos?.y ?? MON_REL_Y) + MON_BASELINE_Y_OFFSET;
                            const topOffsetFrac = 0.0075;
                            const topFrac = Math.max(0, Math.min(1, bottomY - topOffsetFrac));
                            return <ShadowImg src={`data:image/png;base64,${islandMonsShadow}`} alt="" draggable={false} style={{ left: `${cx}%`, top: `${topFrac * 100}%`, width: `${widthPct}%`, height: "auto", opacity: 0.23 }} />;
                          })()}
                        <MonSpriteWrap
                          ref={monWrapRef}
                          style={{
                            left: `${(monPos?.x ?? MON_REL_X) * 100}%`,
                            top: `${(monPos?.y ?? MON_REL_Y) * 100}%`,
                            opacity: monVisible && !monTeleporting ? 1 : 0,
                            transition: "opacity 180ms ease-out",
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
                        onBroken={() => {
                          setRockIsBroken(true);
                          setRockReady(false);
                          const count = 2 + Math.floor(Math.random() * 4);
                          const picks: MaterialName[] = [];
                          for (let i = 0; i < count; i++) picks.push(pickWeightedMaterial());
                          const now = performance.now();
                          const rect = lastRockRectRef.current;
                          const fallBase = rect ? rect.height * 0.15 : 24;
                          const baseCommon = { duration1: 520, spread: 56, lift: 22, fall: 12 + fallBase, start: now + 30 } as const;
                          const angleSpan = Math.PI * 0.5;
                          const promises = picks.map((n: MaterialName, i: number) => {
                            const t = count > 1 ? i / (count - 1) : 0.5;
                            const baseAngle = -angleSpan / 2 + t * angleSpan;
                            const jitter = (Math.random() - 0.5) * (Math.PI * 0.06);
                            const angle = baseAngle + jitter;
                            return spawnMaterialDrop(n, 0, { ...baseCommon, angle } as any);
                          });
                          Promise.all(promises).then(() => {});
                        }}
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
