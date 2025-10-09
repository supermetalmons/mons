import React, { useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import { playSounds } from "../content/sounds";
import { Sound } from "../utils/gameModels";

const Container = styled.div<{ $visible: boolean }>`
  position: relative;
  display: inline-block;
  opacity: ${(p) => (p.$visible ? 1 : 0)};
  transition: opacity 260ms ease;
`;

const RockImg = styled.img<{ $heightPct?: number }>`
  display: block;
  width: auto;
  height: ${(p) => (p.$heightPct ? `${p.$heightPct}%` : "auto")};
  user-select: none;
  -webkit-user-drag: none;
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
  const hitsRef = useRef(0);
  const lastClickRef = useRef<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imgElRef = useRef<HTMLImageElement | null>(null);
  const originRef = useRef<{ x: number; y: number }>({ x: 50, y: 50 });
  const unitRef = useRef<number>(15);

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
      const img = imgElRef.current;
      if (!container || !img) return;
      const cr = container.getBoundingClientRect();
      const ir = img.getBoundingClientRect();
      if (cr.width === 0 || cr.height === 0) return;
      const cx = ((ir.left - cr.left + ir.width / 2) / cr.width) * 100;
      const cy = ((ir.top - cr.top + ir.height / 2) / cr.height) * 100;
      originRef.current = { x: cx, y: cy };
      unitRef.current = (ir.height / cr.height) * 100;
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
      playSounds([Sound.RockOpen]);
      setVisible(false);
      setTimeout(() => {
        onBroken?.();
      }, 200);
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
        const size = 0.08 + Math.random() * (0.14 - 0.08);
        g.setAttribute("data-s", size.toString());
        return g;
      },
      (g, t, i) => {
        const ease = Math.pow(t, 0.33);
        const angle = randAng(i, 14);
        const unit = unitRef.current;
        const { x: ox, y: oy } = originRef.current;
        const maxDist = 1.0 * unit;
        const dist = ease * maxDist;
        const x = ox + Math.cos(angle) * dist;
        const y = oy + Math.sin(angle) * dist;
        g.setAttribute("transform", `translate(${x} ${y}) rotate(${(angle * 180) / Math.PI})`);
        const line = g.firstChild as SVGLineElement;
        const size = parseFloat(g.getAttribute("data-s") || "0.1");
        const len = size * unit * 1.2;
        line.setAttribute("x1", "0");
        line.setAttribute("y1", "0");
        line.setAttribute("x2", len.toString());
        line.setAttribute("y2", "0");
        line.setAttribute("stroke-width", Math.max(0.6, (0.02 * unit + size * unit * 0.05) * (1 - t * 0.3)).toString());
        line.setAttribute("opacity", (0.95 * (1 - t)).toString());
        const glow = g.lastChild as SVGCircleElement;
        glow.setAttribute("cx", len.toString());
        glow.setAttribute("cy", "0");
        glow.setAttribute("r", (size * 0.45 * unit).toString());
        glow.setAttribute("opacity", Math.max(0, 0.75 * (1 - t)).toString());
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
        const size = 0.06 + Math.random() * (0.11 - 0.06);
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
        const cx = ox + Math.cos(angle) * dist;
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
      8,
      320,
      () => {
        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        const star = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        star.setAttribute("fill", "#FFD54F");
        star.setAttribute("stroke", "#FFB300");
        star.setAttribute("stroke-width", "2");
        star.setAttribute("stroke-linejoin", "round");
        g.appendChild(star);

        const angle = Math.random() * Math.PI * 2;
        const size = 0.32 + Math.random() * (0.55 - 0.32);
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
        (g as any).__spread = (2.3 + Math.random() * 0.5) * unitRef.current;
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
        const tx = ox + Math.cos(angle) * (progress * spread);
        const ty = oy + Math.sin(angle) * (progress * spread);
        const rot = baseRot + spin * t;

        const growthThreshold = 0.15;
        const growthMultiplier = 3;
        const currentSize = size * (t < growthThreshold ? 1 + t * growthMultiplier : 1);
        const scale = currentSize / size;

        const fadeOutStrength = 0.92;
        const opacity = 1 - Math.pow(t, 2) * fadeOutStrength;

        g.setAttribute("transform", `translate(${tx} ${ty}) rotate(${rot}) scale(${scale})`);
        g.setAttribute("opacity", Math.min(1, opacity * 1.05).toString());
      }
    );
  }

  return (
    <Container
      ref={containerRef}
      className={className}
      $visible={visible}
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.stopPropagation();
        onTap();
      }}
      onTouchStart={(e) => {
        e.stopPropagation();
        onTap();
      }}>
      {rockUrl && <RockImg ref={imgElRef} src={rockUrl} alt="" draggable={false} $heightPct={heightPct} />}
      <svg ref={svgRef} viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", overflow: "visible" }} />
    </Container>
  );
}

export default IslandRock;
