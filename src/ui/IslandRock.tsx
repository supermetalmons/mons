import React, { useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import { playSounds } from "../content/sounds";
import { Sound } from "../utils/gameModels";
import { isMobile } from "../utils/misc";

const Container = styled.div<{ $visible: boolean; $instant?: boolean; $disabled?: boolean }>`
  position: relative;
  display: inline-block;
  opacity: ${(p) => (p.$visible ? 1 : 0)};
  transition: ${(p) => (p.$instant ? "none" : "opacity 260ms ease")};
  pointer-events: ${(p) => (p.$visible && !p.$disabled ? "auto" : "none")};
  -webkit-tap-highlight-color: transparent;
  -webkit-touch-callout: none;
  user-select: none;
  -webkit-user-select: none;
`;

const RockImg = styled.img<{ $heightPct?: number; $hidden?: boolean }>`
  display: block;
  width: auto;
  height: ${(p) => (p.$heightPct ? `${p.$heightPct}%` : "auto")};
  visibility: ${(p) => (p.$hidden ? "hidden" : "visible")};
  user-select: none;
  -webkit-user-drag: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
  -webkit-touch-callout: none;
  filter: drop-shadow(0 6px 2px rgba(0, 0, 0, 0.18));
  -webkit-filter: drop-shadow(0 6px 2px rgba(0, 0, 0, 0.18));
`;

type Props = {
  className?: string;
  onOpened?: () => void;
  onBroken?: () => void;
  heightPct?: number;
};

const ROCK_BREAK_THRESHOLD = 7;
const ROCK_QUICK_WINDOW_MS = 320;
const ROCK_HEAL_GRACE_MS = 600;
const ROCK_HEAL_STEP_MS = 220;
const ROCK_MISS_BASE = 0.06;
const ROCK_MISS_SLOW_EXTRA = 0.1;

export function IslandRock({ className, onOpened, onBroken, heightPct }: Props) {
  const [visible, setVisible] = useState(false);
  const [rockUrl, setRockUrl] = useState<string>("");
  const [instantHide, setInstantHide] = useState(false);
  const [hideRock, setHideRock] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const hitsRef = useRef(0);
  const lastClickRef = useRef<number | null>(null);
  const brokenRef = useRef(false);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imgElRef = useRef<HTMLImageElement | null>(null);
  const originRef = useRef<{ x: number; y: number }>({ x: 50, y: 50 });
  const unitRef = useRef<number>(15);
  const aspectRef = useRef<number>(1);

  const src = useMemo(() => {
    const index = Math.floor(Math.random() * 27) + 1;
    return `https://assets.mons.link/rocks/gan/${index}.webp`;
  }, []);

  useEffect(() => {
    const image = new Image();
    image.onload = () => {
      setRockUrl(src);
      setVisible(true);
      onOpened?.();
    };
    image.src = src;
  }, [src, onOpened]);

  useEffect(() => {
    function updateMetrics() {
      const container = containerRef.current;
      if (!container) return;
      const cr = container.getBoundingClientRect();
      if (cr.width === 0 || cr.height === 0) return;
      originRef.current = { x: 50, y: 39.5 };
      unitRef.current = 100;
      aspectRef.current = cr.height / cr.width;
    }
    updateMetrics();
    const ro = new ResizeObserver(() => updateMetrics());
    const node = containerRef.current;
    if (node) ro.observe(node);
    window.addEventListener("resize", updateMetrics);
    return () => {
      try {
        if (node) ro.unobserve(node);
      } catch {}
      window.removeEventListener("resize", updateMetrics);
    };
  }, []);

  function onTap() {
    if (!visible || brokenRef.current) return;
    const now = Date.now();
    const last = lastClickRef.current;
    if (last !== null) {
      const since = now - last;
      if (since > ROCK_HEAL_GRACE_MS) {
        const healAmount = Math.floor((since - ROCK_HEAL_GRACE_MS) / ROCK_HEAL_STEP_MS) + 1;
        hitsRef.current = Math.max(0, hitsRef.current - healAmount);
      }
    }
    const sinceLast = last === null ? 0 : now - last;
    const isQuick = last === null || sinceLast <= ROCK_QUICK_WINDOW_MS;
    const missChance = ROCK_MISS_BASE + (isQuick ? 0 : ROCK_MISS_SLOW_EXTRA);
    const isMiss = Math.random() < missChance;
    if (isMiss) {
      playSounds([Sound.PickaxeMiss]);
      showMissParticles();
      if (hitsRef.current > 0) hitsRef.current = Math.max(0, hitsRef.current - 1);
    } else {
      playSounds([Sound.PickaxeHit]);
      showHitParticles();
      if (isQuick) hitsRef.current += 1;
    }
    lastClickRef.current = now;
    if (hitsRef.current >= ROCK_BREAK_THRESHOLD) {
      brokenRef.current = true;
      playSounds([Sound.RockOpen]);
      setInstantHide(true);
      setHideRock(true);
      setDisabled(true);
      setTimeout(() => {
        onBroken?.();
      }, 360);
      showCrashParticles();
      hitsRef.current = 0;
      lastClickRef.current = null;
    }
  }

  function animateParticles(num: number, duration: number, make: (idx: number) => SVGElement, update: (el: SVGElement, t: number, idx: number) => void) {
    const svg = svgRef.current;
    if (!svg) return;
    const parts: SVGElement[] = [];
    for (let i = 0; i < num; i++) {
      const el = make(i);
      parts.push(el);
      svg.appendChild(el);
    }
    const start = performance.now();
    function step(now: number) {
      const t = Math.min(1, (now - start) / duration);
      for (let i = 0; i < parts.length; i++) {
        update(parts[i], t, i);
      }
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        for (const el of parts) el.remove();
      }
    }
    requestAnimationFrame(step);
  }

  function randAng(i: number, n: number) {
    return (i / n) * Math.PI * 2 + Math.random() * 0.3;
  }

  function showHitParticles() {
    animateParticles(
      14,
      190,
      (i) => {
        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("stroke", Math.random() < 0.5 ? "#FFF59D" : "#FFE082");
        line.setAttribute("stroke-linecap", "round");
        g.appendChild(line);
        const glow = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        glow.setAttribute("fill", "#FFF59D");
        g.appendChild(glow);
        const size = 0.1 + Math.random() * (0.18 - 0.1);
        g.setAttribute("data-s", size.toString());
        const tail = 1.1 + Math.random() * 0.8;
        g.setAttribute("data-tail", tail.toString());
        const angle = randAng(i, 14);
        g.setAttribute("data-a", angle.toString());
        return g;
      },
      (g, t, i) => {
        const ease = Math.pow(t, 0.33);
        const angle = parseFloat(g.getAttribute("data-a") || "0");
        const unit = unitRef.current;
        const { x: ox, y: oy } = originRef.current;
        const maxDist = 1.0 * unit;
        const size = parseFloat(g.getAttribute("data-s") || "0.1");
        const r = size * 0.52 * unit;
        const baseOffset = r * 0.6;
        const dist = baseOffset + ease * maxDist;
        const x = ox + Math.cos(angle) * dist * aspectRef.current;
        const y = oy + Math.sin(angle) * dist;
        g.setAttribute("transform", `translate(${x} ${y}) rotate(${(angle * 180) / Math.PI})`);
        const line = g.firstChild as SVGLineElement;
        const tailFactor = parseFloat(g.getAttribute("data-tail") || "1");
        const len = r * tailFactor * 1.15;
        line.setAttribute("x1", (-len).toString());
        line.setAttribute("y1", "0");
        line.setAttribute("x2", "0");
        line.setAttribute("y2", "0");
        line.setAttribute("stroke-width", Math.max(0.75, (0.022 * unit + size * unit * 0.05) * (1 - t * 0.35)).toString());
        line.setAttribute("opacity", Math.max(0, 0.96 * (1 - t * 0.8)).toString());
        const glow = g.lastChild as SVGCircleElement;
        glow.setAttribute("cx", "0");
        glow.setAttribute("cy", "0");
        glow.setAttribute("r", r.toString());
        glow.setAttribute("opacity", Math.max(0, 0.85 * (1 - t * 0.7)).toString());
      }
    );
  }

  function showMissParticles() {
    animateParticles(
      10,
      220,
      () => {
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("fill", Math.random() < 0.5 ? "#A0A4AB" : "#8E949B");
        rect.setAttribute("stroke", "#6E737A");
        rect.setAttribute("stroke-width", "0.6");
        const size = 0.12 + Math.random() * (0.2 - 0.12);
        rect.setAttribute("data-s", size.toString());
        return rect;
      },
      (rect, t, i) => {
        const ease = Math.pow(t, 0.45);
        const angle = randAng(i, 10);
        const unit = unitRef.current;
        const { x: ox, y: oy } = originRef.current;
        const maxDist = 0.8 * unit;
        const dist = ease * maxDist;
        const size = parseFloat(rect.getAttribute("data-s") || "0.08");
        const w = size * unit * (1 - t * 0.6);
        const cx = ox + Math.cos(angle) * dist * aspectRef.current;
        const cy = oy + Math.sin(angle) * dist;
        rect.setAttribute("x", (cx - w / 2).toString());
        rect.setAttribute("y", (cy - w / 2).toString());
        rect.setAttribute("width", w.toString());
        rect.setAttribute("height", w.toString());
        const rot = (angle * 180) / Math.PI + (Math.random() - 0.5) * 240 * t;
        rect.setAttribute("transform", `rotate(${rot} ${cx} ${cy})`);
        rect.setAttribute("opacity", (1 - t).toString());
      }
    );
  }

  function showCrashParticles() {
    animateParticles(
      20,
      460,
      () => {
        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
        g.appendChild(defs);
        const star = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        const gid = `crash-grad-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
        const gradient = document.createElementNS("http://www.w3.org/2000/svg", "radialGradient");
        gradient.setAttribute("id", gid);
        const stop0 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
        stop0.setAttribute("offset", "0%");
        stop0.setAttribute("stop-color", "#FFFFFF");
        const stop1 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
        stop1.setAttribute("offset", "35%");
        stop1.setAttribute("stop-color", "#FFE082");
        const palettes = ["#FFF59D", "#FFE082", "#FFD54F"];
        const stop2 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
        stop2.setAttribute("offset", "100%");
        stop2.setAttribute("stop-color", palettes[Math.floor(Math.random() * palettes.length)]);
        gradient.appendChild(stop0);
        gradient.appendChild(stop1);
        gradient.appendChild(stop2);
        defs.appendChild(gradient);
        star.setAttribute("fill", `url(#${gid})`);
        star.setAttribute("stroke", "none");
        star.setAttribute("stroke-linejoin", "round");
        g.appendChild(star);

        const angle = Math.random() * Math.PI * 2;
        const size = 0.58 + Math.random() * (0.95 - 0.58);
        const longR = size * 0.95 * 50;
        const shortR = size * 0.45 * 50;
        const spikes = 6;
        const step = Math.PI / spikes;
        const points: string[] = [];
        for (let s = 0; s < spikes * 2; s++) {
          const r = s % 2 === 0 ? longR : shortR;
          const a = s * step;
          const x = Math.cos(a) * r;
          const y = Math.sin(a) * r;
          points.push(`${x},${y}`);
        }
        star.setAttribute("points", points.join(" "));

        (g as any).__angle = angle;
        (g as any).__size = size;
        (g as any).__baseRot = (angle * 180) / Math.PI + (Math.random() * 120 - 60);
        (g as any).__spin = (Math.random() - 0.5) * 120;
        (g as any).__spread = (1.7 + Math.random() * 0.6) * unitRef.current;
        return g;
      },
      (g, t) => {
        const { x: ox, y: oy } = originRef.current;
        const angle = (g as any).__angle as number;
        const size = (g as any).__size as number;
        const baseRot = (g as any).__baseRot as number;
        const spin = (g as any).__spin as number;

        const spread = (g as any).__spread as number;
        const progress = 1 - Math.pow(1 - t, 2.8);
        const tx = ox + Math.cos(angle) * (progress * spread) * aspectRef.current;
        const ty = oy + Math.sin(angle) * (progress * spread);
        const rot = baseRot + spin * t;

        const growthThreshold = 0.15;
        const growthMultiplier = 3;
        const currentSize = size * (t < growthThreshold ? 1 + t * growthMultiplier : 1);
        const scale = currentSize / size;

        const fadeStart = 0.45;
        const localT = Math.max(0, (t - fadeStart) / (1 - fadeStart));
        const smooth = localT * localT * (3 - 2 * localT);
        const opacity = 1 - smooth;
        g.setAttribute("transform", `translate(${tx} ${ty}) rotate(${rot}) scale(${scale})`);
        g.setAttribute("opacity", Math.max(0, Math.min(1, opacity)).toString());
      }
    );
  }

  return (
    <Container
      ref={containerRef}
      className={className}
      $visible={visible}
      $instant={instantHide}
      $disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={
        !isMobile
          ? (e) => {
              e.stopPropagation();
              onTap();
            }
          : undefined
      }
      onTouchStart={
        isMobile
          ? (e) => {
              e.stopPropagation();
              onTap();
            }
          : undefined
      }>
      {rockUrl && <RockImg ref={imgElRef} src={rockUrl} alt="" draggable={false} $heightPct={heightPct} $hidden={hideRock} />}
      <svg ref={svgRef} viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", overflow: "visible" }} />
    </Container>
  );
}

export default IslandRock;
