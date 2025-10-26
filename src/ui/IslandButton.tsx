import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { isMobile } from "../utils/misc";
import styled, { keyframes } from "styled-components";
import { didDismissSomethingWithOutsideTapJustNow } from "./BottomControls";
import { closeAllKindsOfPopups } from "./MainMenu";
import IslandRock, { IslandRockHandle } from "./IslandRock";
import { soundPlayer } from "../utils/SoundPlayer";
import { playSounds, playRockSound, RockSound } from "../content/sounds";
import { idle as islandMonsIdle, miningWalkingAndPets as islandMonsMining, shadow as islandMonsShadow } from "../assets/islandMons";
import { getOwnDrainerId } from "../utils/namedMons";
import { Sound } from "../utils/gameModels";

const SHOW_DEBUG_ISLAND_BOUNDS = false;

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

type IslandHotspot = { cxPct: number; cyPct: number; dPct: number };

const ISLAND_HOTSPOTS: IslandHotspot[] = [
  { cxPct: 0.2261515227787566, cyPct: 0.4472140762463343, dPct: 0.08 },
  { cxPct: 0.13486869703834214, cyPct: 0.4002932551319648, dPct: 0.08 },
  { cxPct: 0.2180971558016611, cyPct: 0.532258064516129, dPct: 0.08 },
  { cxPct: 0.13755348603070727, cyPct: 0.48240469208211145, dPct: 0.08 },
  { cxPct: 0.23689067874821712, cyPct: 0.6231671554252199, dPct: 0.06742292487979099 },
  { cxPct: 0.336227871465727, cyPct: 0.6906158357771262, dPct: 0.09416723194367455 },
  { cxPct: 0.38455407332829933, cyPct: 0.81524926686217, dPct: 0.13898207327613887 },
  { cxPct: 0.25836899068713814, cyPct: 0.7140762463343108, dPct: 0.10575325775475168 },
  { cxPct: 0.32280392650390133, cyPct: 0.4941348973607038, dPct: 0.09650067574898895 },
  { cxPct: 0.14829264200016778, cyPct: 0.5733137829912024, dPct: 0.07145010836833869 },
  { cxPct: 0.32548871549626646, cyPct: 0.5967741935483871, dPct: 0.10463832728197837 },
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
const WALKING_FRAME_MS = 120;

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
  const [monTeleporting, setMonTeleporting] = useState(false);
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
  const materialDropsRef = useRef<Array<{ el: HTMLImageElement; shadow: HTMLElement; name: MaterialName }>>([]);

  const walkPoints = WALK_POLYGON;

  const [heroSize, setHeroSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  const editorOverlayRef = useRef<HTMLDivElement | null>(null);
  const isPointerDownRef = useRef<boolean>(false);
  const lastInsideRef = useRef<Set<number>>(new Set());
  const circlesGestureActiveRef = useRef<boolean>(false);
  const [hotspotVisible, setHotspotVisible] = useState<boolean[]>(() => new Array(ISLAND_HOTSPOTS.length).fill(false));
  const hotspotTimersRef = useRef<number[]>(new Array(ISLAND_HOTSPOTS.length).fill(0));
  const lastTouchAtRef = useRef<number>(0);

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
    const flashEntries = (indices: Set<number>) => {
      if (indices.size === 0) return;
      indices.forEach((i) => {
        const originalLabel = HOTSPOT_LABELS[i] ?? i + 1;
        let sound: RockSound | null = null;
        if (originalLabel === 11) sound = RockSound.S1A;
        else if (originalLabel === 10) sound = RockSound.S1B;
        else if (originalLabel === 9) sound = RockSound.S2A;
        else if (originalLabel === 8) sound = RockSound.S2B;
        else if (originalLabel === 7) sound = RockSound.S3;
        else if (originalLabel === 6) sound = RockSound.S4A;
        else if (originalLabel === 5) sound = RockSound.S4B;
        else if (originalLabel === 4) sound = RockSound.S5A;
        else if (originalLabel === 3) sound = RockSound.S6A;
        else if (originalLabel === 2) sound = RockSound.S7A;
        else if (originalLabel === 1) sound = RockSound.S8A;
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
    const onDown = (ev: MouseEvent | TouchEvent) => {
      const now = performance.now();
      isPointerDownRef.current = true;
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
    };
    const onUp = () => {
      isPointerDownRef.current = false;
      lastInsideRef.current = new Set();
      circlesGestureActiveRef.current = false;
    };
    const onMoveMouse = (ev: MouseEvent) => {
      const now = performance.now();
      if (now - lastTouchAtRef.current < 600) return;
      if (!isPointerDownRef.current) return;
      const inside = getInsideSet(ev.clientX, ev.clientY);
      const prev = lastInsideRef.current;
      const entrants = new Set<number>();
      inside.forEach((i) => {
        if (!prev.has(i)) entrants.add(i);
      });
      if (entrants.size) flashEntries(entrants);
      lastInsideRef.current = inside;
    };
    const onMoveTouch = (ev: TouchEvent) => {
      if (!isPointerDownRef.current) return;
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
  }, []);

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
  const [walkingPlaying, setWalkingPlaying] = useState(false);
  const [pettingPlaying, setPettingPlaying] = useState(false);
  const walkingAnimRef = useRef<{ start: number; raf: number | null; lastFrame: number } | null>(null);
  const pettingAnimRef = useRef<{ start: number; raf: number | null; lastFrame: number } | null>(null);
  const walkStopAfterLoopRef = useRef<boolean>(false);

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
      const cx = x + MON_BOUNDS_X_SHIFT;
      const bottomY = y + MON_BASELINE_Y_OFFSET;
      if (isInside(cx, bottomY)) {
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
    const centroidCandidate = { x: cx - MON_BOUNDS_X_SHIFT, y: cy - MON_BASELINE_Y_OFFSET };
    const centroidInside = isInside(cx, cy);
    const defaultCandidate = { x: MON_REL_X, y: MON_REL_Y };
    const defaultCx = defaultCandidate.x + MON_BOUNDS_X_SHIFT;
    const defaultBottomY = defaultCandidate.y + MON_BASELINE_Y_OFFSET;
    const defaultInside = isInside(defaultCx, defaultBottomY);
    const fallback = centroidInside ? centroidCandidate : defaultInside ? defaultCandidate : { x: cx, y: cy };
    initialMonPosRef.current = fallback;
    return fallback;
  }, [walkPoints]);

  useEffect(() => {
    let mounted = true;
    if (!islandOverlayVisible) return;
    const candidate = persistentMonPosRef || pickRandomPointInWalkArea();
    const baseCx = candidate.x + MON_BOUNDS_X_SHIFT;
    const baseBottomY = candidate.y + MON_BASELINE_Y_OFFSET;
    const isInside = (x: number, y: number) => {
      const poly = walkPoints;
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
    const valid = isInside(baseCx, baseBottomY);
    const pt = valid ? candidate : pickRandomPointInWalkArea();
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
  }, [islandOverlayVisible, pickRandomPointInWalkArea, walkPoints]);

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
    async (name: MaterialName, delay: number, common?: { duration1: number; spread: number; lift: number; fall: number; start: number }): Promise<MaterialName> => {
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
      el.style.height = "13%";
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
      const angle = (Math.random() - 0.5) * Math.PI * 0.5;
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
      const anim = miningAnimRef.current;
      if (anim && anim.raf) cancelAnimationFrame(anim.raf);
      miningAnimRef.current = null;
      setMiningPlaying(false);
      const wAnim = walkingAnimRef.current;
      if (wAnim && wAnim.raf) cancelAnimationFrame(wAnim.raf);
      walkingAnimRef.current = null;
      setWalkingPlaying(false);
      const pAnim2 = pettingAnimRef.current;
      if (pAnim2 && pAnim2.raf) cancelAnimationFrame(pAnim2.raf);
      pettingAnimRef.current = null;
      setPettingPlaying(false);
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

  const computeOverlapArea = useCallback((a: { left: number; top: number; right: number; bottom: number }, b: { left: number; top: number; right: number; bottom: number }) => {
    const ix = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const iy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    return ix * iy;
  }, []);

  const getDudeBounds = useCallback(() => {
    const widthFrac = Math.max(0.001, Math.min(1, DUDE_BOUNDS_WIDTH_FRAC));
    const heightFrac = Math.max(0.001, Math.min(1, DUDE_BOUNDS_HEIGHT_FRAC));
    const cx = latestDudePosRef.current.x;
    const bottomY = latestDudePosRef.current.y;
    const left = cx - widthFrac * 0.5;
    const right = cx + widthFrac * 0.5;
    const top = bottomY - heightFrac;
    const bottom = bottomY;
    return { left, top, right, bottom, area: Math.max(0, right - left) * Math.max(0, bottom - top) };
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
      const dudeB = getDudeBounds();
      const poly = walkPoints;
      let attempts = 0;
      let chosen: { x: number; y: number } | null = null;
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
      const inside = (x: number, y: number) => pointInPolygon(x, y, poly);
      const widthFrac = Math.max(0.001, Math.min(1, getMonBoundsWidthFrac(latestMonKeyRef.current ?? monKey)));
      const heightFrac = Math.max(0.001, Math.min(1, MON_HEIGHT_FRAC));
      while (attempts < 600 && !chosen) {
        attempts++;
        const x = minX + Math.random() * (maxX - minX);
        const y = minY + Math.random() * (maxY - minY);
        const cx = x + MON_BOUNDS_X_SHIFT;
        const bottomY = y + MON_BASELINE_Y_OFFSET;
        if (!inside(cx, bottomY)) continue;
        const left = cx - widthFrac * 0.5;
        const right = cx + widthFrac * 0.5;
        const top = bottomY - heightFrac;
        const bottom = bottomY;
        const monB = { left, top, right, bottom, area: widthFrac * heightFrac };
        const overlap = computeOverlapArea(dudeB, monB);
        const overlapFracOfMon = monB.area > 0 ? overlap / monB.area : 0;
        if (overlapFracOfMon <= 0.42) {
          chosen = { x, y };
          break;
        }
      }
      if (!chosen) {
        const x = Math.max(minX, Math.min(maxX, latestDudePosRef.current.x + 0.2));
        const y = Math.max(minY, Math.min(maxY, latestDudePosRef.current.y));
        const cx = x + MON_BOUNDS_X_SHIFT;
        const bottomY = y + MON_BASELINE_Y_OFFSET;
        if (inside(cx, bottomY)) chosen = { x, y };
      }
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
  }, [getDudeBounds, pointInPolygon, walkPoints, monKey, monPos, computeOverlapArea, teleportFXStart, spawnTeleportSparkles, prepareTeleportAppear, animateTeleportAppear]);

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
    const wAnim = walkingAnimRef.current;
    if (wAnim) {
      const lf = wAnim.lastFrame;
      if (dragModeRef.current !== "none" && (lf === 2 || lf === 3)) {
        walkStopAfterLoopRef.current = true;
        return;
      }
      if (wAnim.raf) cancelAnimationFrame(wAnim.raf);
      walkingAnimRef.current = null;
    }
    walkStopAfterLoopRef.current = false;
    setWalkingPlaying(false);
  }, [checkAndTeleportMonIfOverlapped]);

  const latestDudePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const moveTargetMetaRef = useRef<{ x: number; y: number; facingLeft: boolean; onArrive?: () => void } | null>(null);
  const dragModeRef = useRef<"none" | "polygon" | "ellipse">("none");
  const safeSlideEdgeRef = useRef<{ edgeIndex: number | null } | null>({ edgeIndex: null });
  const lastFacingFlipAtRef = useRef<number>(0);
  const lastFacingDirRef = useRef<boolean>(false);
  const lastEllipsePointerRef = useRef<{ x: number; y: number }>({ x: -1, y: -1 });
  const lastPointerRef = useRef<{ x: number; y: number }>({ x: -1, y: -1 });
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
    try {
      const w = walkingAnimRef.current;
      if (w && w.raf) cancelAnimationFrame(w.raf);
      walkingAnimRef.current = null;
      setWalkingPlaying(false);
      const p = pettingAnimRef.current;
      if (p && p.raf) cancelAnimationFrame(p.raf);
      pettingAnimRef.current = null;
      setPettingPlaying(false);
    } catch {}
    setMiningPlaying(true);
    let initAttempts = 0;
    const initMining = () => {
      const sheetImg = miningImageRef.current;
      const wrap = dudeWrapRef.current;
      const frameWrap = miningFrameWrapRef.current;
      const stripImg = miningStripImgRef.current;
      if (!sheetImg || !wrap || !frameWrap || !stripImg) {
        initAttempts += 1;
        if (initAttempts <= 5) {
          requestAnimationFrame(initMining);
          return;
        }
        setMiningPlaying(false);
        return;
      }
      const wrapBox = wrap.getBoundingClientRect();
      const frameCount = 4;
      const rows = 3;
      const frameWidth = Math.floor(sheetImg.naturalWidth / frameCount) || 1;
      const singleRowHeight = Math.floor((sheetImg.naturalHeight || 1) / rows) || 1;
      const targetHeight = Math.max(1, Math.round(wrapBox.height));
      const targetWidth = Math.max(1, Math.round((targetHeight * frameWidth) / singleRowHeight));

      frameWrap.style.width = `${targetWidth}px`;
      frameWrap.style.height = `${targetHeight}px`;
      stripImg.style.height = `${targetHeight * rows}px`;
      stripImg.style.width = `${targetWidth * frameCount}px`;
      stripImg.style.transform = `translate(0px, 0px)`;

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
          stripImg.style.transform = `translate(${tx}px, 0px)`;
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
    };
    requestAnimationFrame(initMining);
  }, [miningPlaying]);

  const startWalkingAnimation = useCallback(() => {
    if (!dudeWrapRef.current) return;
    if (!miningImageRef.current) return;
    if (pettingPlaying) {
      const p = pettingAnimRef.current;
      if (p && p.raf) cancelAnimationFrame(p.raf);
      pettingAnimRef.current = null;
      setPettingPlaying(false);
    }
    const m = miningAnimRef.current;
    if (m && m.raf) cancelAnimationFrame(m.raf);
    miningAnimRef.current = null;
    setMiningPlaying(false);
    if (walkingAnimRef.current && walkingAnimRef.current.raf !== null) return;
    if (walkingAnimRef.current && walkingAnimRef.current.raf === null) {
      walkingAnimRef.current = null;
    }
    walkStopAfterLoopRef.current = false;
    setWalkingPlaying(true);
    let initAttempts = 0;
    const initWalk = () => {
      const sheetImg = miningImageRef.current;
      const wrap = dudeWrapRef.current;
      const frameWrap = miningFrameWrapRef.current;
      const stripImg = miningStripImgRef.current;
      if (!sheetImg || !wrap || !frameWrap || !stripImg) {
        initAttempts += 1;
        if (initAttempts <= 5) {
          requestAnimationFrame(initWalk);
          return;
        }
        setWalkingPlaying(false);
        return;
      }
      const wrapBox = wrap.getBoundingClientRect();
      const frameCount = 4;
      const rows = 3;
      const frameWidth = Math.floor(sheetImg.naturalWidth / frameCount) || 1;
      const singleRowHeight = Math.floor((sheetImg.naturalHeight || 1) / rows) || 1;
      const targetHeight = Math.max(1, Math.round(wrapBox.height));
      const targetWidth = Math.max(1, Math.round((targetHeight * frameWidth) / singleRowHeight));

      frameWrap.style.width = `${targetWidth}px`;
      frameWrap.style.height = `${targetHeight}px`;
      stripImg.style.height = `${targetHeight * rows}px`;
      stripImg.style.width = `${targetWidth * frameCount}px`;
      const rowIndex = 1;
      const tyConst = -rowIndex * targetHeight;
      stripImg.style.transform = `translate(0px, ${tyConst}px)`;

      walkingAnimRef.current = { start: performance.now(), raf: null, lastFrame: -1 };
      const step = () => {
        const anim = walkingAnimRef.current;
        if (!anim) return;
        const elapsed = performance.now() - anim.start;
        const rawFrame = Math.floor(elapsed / WALKING_FRAME_MS);
        const frame = ((rawFrame % frameCount) + frameCount) % frameCount;
        const didWrap = anim.lastFrame !== -1 && frame < anim.lastFrame;
        if (walkStopAfterLoopRef.current && !moveAnimRef.current && didWrap) {
          setWalkingPlaying(false);
          if (anim.raf) cancelAnimationFrame(anim.raf);
          walkingAnimRef.current = null;
          walkStopAfterLoopRef.current = false;
          return;
        }
        if (frame !== anim.lastFrame) {
          anim.lastFrame = frame;
          const offset = frame * targetWidth;
          const tx = -offset;
          stripImg.style.transform = `translate(${tx}px, ${tyConst}px)`;
        }
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
        anim.raf = requestAnimationFrame(step);
      };
      walkingAnimRef.current.raf = requestAnimationFrame(step);
    };
    requestAnimationFrame(initWalk);
  }, [pettingPlaying, computeOverlapArea, getDudeBounds, pullMaterialToBar]);

  const startPettingAnimation = useCallback(() => {
    if (!dudeWrapRef.current) return;
    if (!miningImageRef.current) return;
    if (pettingPlaying) return;
    setPettingPlaying(true);
    setWalkingPlaying(false);
    const wAnim = walkingAnimRef.current;
    if (wAnim && wAnim.raf) cancelAnimationFrame(wAnim.raf);
    walkingAnimRef.current = null;
    requestAnimationFrame(() => {
      const sheetImg = miningImageRef.current;
      const wrap = dudeWrapRef.current;
      const frameWrap = miningFrameWrapRef.current;
      const stripImg = miningStripImgRef.current;
      if (!sheetImg || !wrap || !frameWrap || !stripImg) {
        setPettingPlaying(false);
        return;
      }
      const wrapBox = wrap.getBoundingClientRect();
      const frameCount = 4;
      const rows = 3;
      const frameWidth = Math.floor(sheetImg.naturalWidth / frameCount) || 1;
      const singleRowHeight = Math.floor((sheetImg.naturalHeight || 1) / rows) || 1;
      const targetHeight = Math.max(1, Math.round(wrapBox.height));
      const targetWidth = Math.max(1, Math.round((targetHeight * frameWidth) / singleRowHeight));

      frameWrap.style.width = `${targetWidth}px`;
      frameWrap.style.height = `${targetHeight}px`;
      stripImg.style.height = `${targetHeight * rows}px`;
      stripImg.style.width = `${targetWidth * frameCount}px`;
      const rowIndex = 2;
      stripImg.style.transform = `translate(0px, ${-rowIndex * targetHeight}px)`;

      pettingAnimRef.current = { start: performance.now(), raf: null, lastFrame: -1 };
      const step = () => {
        const anim = pettingAnimRef.current;
        if (!anim) return;
        const elapsed = performance.now() - anim.start;
        const rawFrame = Math.floor(elapsed / MINING_FRAME_MS);
        const frame = Math.min(frameCount - 1, Math.max(0, rawFrame));
        if (frame !== anim.lastFrame) anim.lastFrame = frame;
        const offset = frame * targetWidth;
        const tx = -offset;
        const ty = -rowIndex * targetHeight;
        stripImg.style.transform = `translate(${tx}px, ${ty}px)`;
        if (elapsed < frameCount * MINING_FRAME_MS) {
          anim.raf = requestAnimationFrame(step);
        } else {
          setPettingPlaying(false);
          pettingAnimRef.current = null;
        }
      };
      pettingAnimRef.current.raf = requestAnimationFrame(step);
    });
  }, [pettingPlaying]);

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
      walkStopAfterLoopRef.current = false;
      if (!walkingAnimRef.current) startWalkingAnimation();
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
            latestDudePosRef.current = { x: nextX, y: nextY };
            stopMoveAnim();
          }
        };
        rafRef.current = requestAnimationFrame(step);
      }
    },
    [heroSize.w, heroSize.h, stopMoveAnim, syncDudePosFromOriginal, decideFacingWithHysteresis, startWalkingAnimation]
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
      walkStopAfterLoopRef.current = false;
      if (!walkingAnimRef.current) startWalkingAnimation();
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
          }
        };
        rafRef.current = requestAnimationFrame(step);
      }
    },
    [heroSize.h, heroSize.w, stopMoveAnim, decideFacingWithHysteresis, startWalkingAnimation]
  );

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
      if (circlesGestureActiveRef.current) {
        return;
      }
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
        lastPointerRef.current = { x: nx, y: ny };

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
          if (dragModeRef.current === "polygon") {
            const lp = lastPointerRef.current;
            const dxp = nxx - lp.x;
            const dyp = nyy - lp.y;
            if (dxp * dxp + dyp * dyp < SAFE_POINTER_MOVE_EPS * SAFE_POINTER_MOVE_EPS) {
              if ("preventDefault" in e) e.preventDefault();
              return;
            }
          }
          if (insidePolyMove) {
            updateMoveTarget(nxx, nyy);
          } else if (isInsideEllipse(nxx, nyy)) {
            const stop = computeBoundaryStopPoint(latestDudePosRef.current, { x: nxx, y: nyy }, walkPoints);
            updateMoveTarget(stop.x, stop.y);
            dragModeRef.current = "ellipse";
          }
          if (dragModeRef.current === "polygon") {
            lastPointerRef.current = { x: nxx, y: nyy };
          }
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
          dragModeRef.current = "none";
          if (safeSlideEdgeRef.current) safeSlideEdgeRef.current.edgeIndex = null;
          lastEllipsePointerRef.current = { x: -1, y: -1 };
          window.removeEventListener("mousemove", handleMove as any);
          window.removeEventListener("mouseup", handleEnd as any);
          window.removeEventListener("touchmove", handleMove as any);
          window.removeEventListener("touchend", handleEnd as any);
          window.removeEventListener("touchcancel", handleEnd as any);
          window.removeEventListener("blur", handleEnd as any);
          document.removeEventListener("visibilitychange", handleVisibilityChange as any);
          if (!moveAnimRef.current) {
            const wAnim = walkingAnimRef.current;
            if (wAnim && wAnim.raf) cancelAnimationFrame(wAnim.raf);
            walkingAnimRef.current = null;
            walkStopAfterLoopRef.current = false;
            setWalkingPlaying(false);
            checkAndTeleportMonIfOverlapped();
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
    [handleIslandClose, drawHeroIntoHitCanvas, pointInPolygon, walkPoints, startMoveTo, updateMoveTarget, rockIsBroken, rockReady, dudePos, startMiningAnimation, syncDudePosFromOriginal, monKey, monPos, petMon, checkAndTeleportMonIfOverlapped]
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
                {islandOverlayVisible && !islandClosing && (
                  <HotspotOverlay ref={editorOverlayRef}>
                    {ISLAND_HOTSPOTS.map((c, i) => {
                      const left = (c.cxPct - c.dPct / 2) * 100;
                      const top = (c.cyPct - c.dPct / 2) * 100;
                      const size = c.dPct * 100;
                      return <HotspotCircle key={i} $visible={hotspotVisible[i]} style={{ left: `${left}%`, top: `${top}%`, width: `${size}%`, height: `${size}%` }} />;
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
                  <DudeSpriteImg $facingLeft={dudeFacingLeft} src={`data:image/png;base64,${islandMonsIdle}`} alt="" draggable={false} style={{ visibility: miningPlaying || walkingPlaying || pettingPlaying ? "hidden" : "visible" }} />
                  {(miningPlaying || walkingPlaying || pettingPlaying) && (
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
                          const common = { duration1: 520, spread: 56, lift: 22, fall: 12 + fallBase, start: now + 30 } as const;
                          const promises = picks.map((n: MaterialName) => spawnMaterialDrop(n, 0, common as any));
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
