import * as SVG from "../utils/svg";
import { Location } from "../utils/gameModels";
import { isFlipped, effectsLayer } from "./board";

type ParticleConfig = {
  numParticles: number;
  duration: number;
  maxDistance: number;
  minParticleSize: number;
  maxParticleSize: number;
  createParticle: (
    centerX: number,
    centerY: number,
    size: number,
    angle: number,
    defs: SVGDefsElement,
    i: number,
    now: number
  ) => {
    main: SVGElement;
    extra?: SVGElement;
    update: (x: number, y: number, size: number, opacity: number, t: number) => void;
    cleanup?: () => void;
  };
  fadeOutStrength?: number;
  sizeGrowthThreshold?: number;
  sizeGrowthMultiplier?: number;
  extraOpacityBoost?: number;
  ease?: (t: number) => number;
};

function inBoardCoordinates(location: Location): Location {
  if (isFlipped) {
    return new Location(10 - location.i, 10 - location.j);
  } else {
    return new Location(location.i, location.j);
  }
}

function spawnParticlesAt(at: Location, config: ParticleConfig, insertAtBeginning: boolean) {
  const location = inBoardCoordinates(at);

  const group = document.createElementNS(SVG.ns, "g");
  group.style.pointerEvents = "none";
  if (insertAtBeginning && effectsLayer?.firstChild) {
    effectsLayer.insertBefore(group, effectsLayer.firstChild);
  } else {
    effectsLayer?.appendChild(group);
  }

  const centerX = location.j + 0.5;
  const centerY = location.i + 0.5;

  const defs = document.createElementNS(SVG.ns, "defs");
  group.appendChild(defs);

  const particles: Array<{
    main: SVGElement;
    extra?: SVGElement;
    angle: number;
    maxDistance: number;
    size: number;
    startTime: number;
    finished: boolean;
    update: (x: number, y: number, size: number, opacity: number, t: number) => void;
    cleanup?: () => void;
  }> = [];

  const now = performance.now();

  for (let i = 0; i < config.numParticles; i++) {
    const angle = (2 * Math.PI * i) / config.numParticles + Math.random() * (Math.PI / config.numParticles);
    const distance = config.maxDistance * (0.8 + Math.random() * 0.4);
    const size = config.minParticleSize + Math.random() * (config.maxParticleSize - config.minParticleSize);

    const { main, extra, update, cleanup } = config.createParticle(centerX, centerY, size, angle, defs, i, now);

    group.appendChild(main);
    if (extra) group.appendChild(extra);

    particles.push({
      main,
      extra,
      angle,
      maxDistance: distance,
      size,
      startTime: now,
      finished: false,
      update,
      cleanup,
    });
  }

  function animateAllParticles(now: number) {
    let activeParticles = 0;
    for (const particle of particles) {
      if (particle.finished) continue;
      const elapsed = now - particle.startTime;
      const t = Math.min(elapsed / config.duration, 1);
      if (t >= 1) {
        if (particle.main.parentNode) {
          particle.main.parentNode.removeChild(particle.main);
        }
        if (particle.extra && particle.extra.parentNode) {
          particle.extra.parentNode.removeChild(particle.extra);
        }
        if (particle.cleanup) particle.cleanup();
        particle.finished = true;
      } else {
        const ease = config.ease || ((t: number) => 1 - Math.pow(1 - t, 4));
        const currentDistance = particle.maxDistance * ease(t);
        const x = centerX + Math.cos(particle.angle) * currentDistance;
        const y = centerY + Math.sin(particle.angle) * currentDistance;
        const fadeEase = Math.pow(t, 2);
        const opacity = 1 - fadeEase * (config.fadeOutStrength ?? 0.7);
        const sizeGrowth = config.sizeGrowthThreshold && config.sizeGrowthMultiplier && t < config.sizeGrowthThreshold ? t * config.sizeGrowthMultiplier : 1;
        const currentSize = particle.size * sizeGrowth;
        particle.update(x, y, currentSize, opacity, t);
        activeParticles++;
      }
    }

    if (activeParticles > 0) {
      requestAnimationFrame(animateAllParticles);
    } else {
      if (group.parentNode) {
        group.parentNode.removeChild(group);
      }
    }
  }

  requestAnimationFrame(animateAllParticles);
}

export function indicateElectricHit(at: Location) {
  spawnParticlesAt(
    at,
    {
      numParticles: 12,
      duration: 250,
      maxDistance: 1.0,
      minParticleSize: 0.3,
      maxParticleSize: 0.7,
      fadeOutStrength: 0.9,
      ease: (t: number) => {
        const outward = Math.pow(t, 0.4);
        const crackling = Math.sin(t * 25) * 0.05 * (1 - t);
        return outward + crackling;
      },
      createParticle: (centerX, centerY, size, angle, defs, i, now) => {
        const electricGradientId = `electric-gradient-${i}-${now}`;
        const gradient = document.createElementNS(SVG.ns, "linearGradient");
        gradient.setAttribute("id", electricGradientId);
        gradient.setAttribute("x1", "0%");
        gradient.setAttribute("y1", "0%");
        gradient.setAttribute("x2", "100%");
        gradient.setAttribute("y2", "0%");

        const coreStop = document.createElementNS(SVG.ns, "stop");
        coreStop.setAttribute("offset", "0%");
        coreStop.setAttribute("stop-color", "#FFFFFF");
        coreStop.setAttribute("stop-opacity", "1.0");
        gradient.appendChild(coreStop);

        const midStop = document.createElementNS(SVG.ns, "stop");
        midStop.setAttribute("offset", "30%");
        midStop.setAttribute("stop-color", "#FFFF99");
        midStop.setAttribute("stop-opacity", "0.95");
        gradient.appendChild(midStop);

        const electricStop = document.createElementNS(SVG.ns, "stop");
        electricStop.setAttribute("offset", "70%");
        electricStop.setAttribute("stop-color", "#FFD700");
        electricStop.setAttribute("stop-opacity", "0.85");
        gradient.appendChild(electricStop);

        const tipStop = document.createElementNS(SVG.ns, "stop");
        tipStop.setAttribute("offset", "100%");
        tipStop.setAttribute("stop-color", "#FFA500");
        tipStop.setAttribute("stop-opacity", "0.7");
        gradient.appendChild(tipStop);

        defs.appendChild(gradient);

        const container = document.createElementNS(SVG.ns, "g");
        container.style.pointerEvents = "none";
        container.style.overflow = "visible";

        const boltLength = 50 + Math.random() * 30;
        const segments = 6 + Math.floor(Math.random() * 4);
        const zigzagAmplitude = 12 + Math.random() * 10;
        const branchProbability = 0.4;
        const maxBranches = 2 + Math.floor(Math.random() * 3);

        let mainPath = `M 0 0`;
        const mainPoints: Array<{ x: number; y: number }> = [{ x: 0, y: 0 }];

        for (let j = 1; j <= segments; j++) {
          const progress = j / segments;
          const x = progress * boltLength;
          const deviation = (Math.random() - 0.5) * 2;
          const y = Math.sin(progress * Math.PI * 3 + deviation) * zigzagAmplitude * (1 - progress * 0.3);
          mainPoints.push({ x, y });

          if (j === 1) {
            mainPath += ` L ${x} ${y}`;
          } else {
            const prevPoint = mainPoints[j - 1];
            const controlX = prevPoint.x + (x - prevPoint.x) * 0.6 + (Math.random() - 0.5) * 15;
            const controlY = prevPoint.y + (y - prevPoint.y) * 0.6 + (Math.random() - 0.5) * 15;
            mainPath += ` Q ${controlX} ${controlY} ${x} ${y}`;
          }
        }

        const mainBolt = document.createElementNS(SVG.ns, "path");
        mainBolt.setAttribute("d", mainPath);
        mainBolt.setAttribute("stroke", `url(#${electricGradientId})`);
        mainBolt.setAttribute("stroke-width", (2 + Math.random() * 2).toString());
        mainBolt.setAttribute("stroke-linecap", "round");
        mainBolt.setAttribute("fill", "none");
        container.appendChild(mainBolt);

        let branchCount = 0;
        for (let j = 2; j < segments - 2 && branchCount < maxBranches; j++) {
          if (Math.random() < branchProbability) {
            const branchPoint = mainPoints[j];
            const branchLength = (30 + Math.random() * 40) * (1 - j / segments);
            const branchAngle = (Math.random() - 0.5) * Math.PI * 0.8;
            const branchSegments = 3 + Math.floor(Math.random() * 3);

            let branchPath = `M ${branchPoint.x} ${branchPoint.y}`;
            for (let k = 1; k <= branchSegments; k++) {
              const branchProgress = k / branchSegments;
              const branchX = branchPoint.x + Math.cos(branchAngle) * branchLength * branchProgress;
              const branchY = branchPoint.y + Math.sin(branchAngle) * branchLength * branchProgress + (Math.random() - 0.5) * 10 * branchProgress;
              branchPath += ` L ${branchX} ${branchY}`;
            }

            const branch = document.createElementNS(SVG.ns, "path");
            branch.setAttribute("d", branchPath);
            branch.setAttribute("stroke", `url(#${electricGradientId})`);
            branch.setAttribute("stroke-width", (1 + Math.random()).toString());
            branch.setAttribute("stroke-linecap", "round");
            branch.setAttribute("fill", "none");
            branch.setAttribute("opacity", "0.8");
            container.appendChild(branch);
            branchCount++;
          }
        }

        const glow = document.createElementNS(SVG.ns, "path");
        glow.setAttribute("d", mainPath);
        glow.setAttribute("stroke", "#FFFF99");
        glow.setAttribute("stroke-width", (3 + Math.random() * 2).toString());
        glow.setAttribute("stroke-linecap", "round");
        glow.setAttribute("fill", "none");
        glow.setAttribute("opacity", "0.3");
        glow.style.filter = "blur(1px)";
        container.insertBefore(glow, mainBolt);

        container.setAttribute("transform", `translate(${centerX * 100}, ${centerY * 100}) rotate(${(angle * 180) / Math.PI})`);

        const crackleFrequency = 50 + Math.random() * 20;
        const intensityVariation = 0.6 + Math.random() * 0.4;
        const flickerOffset = Math.random() * Math.PI * 2;

        return {
          main: container,
          update: (x, y, currentSize, opacity, t) => {
            const crackle = 1 + Math.sin(t * crackleFrequency + flickerOffset) * intensityVariation;
            const secondary = 1 + Math.sin(t * (crackleFrequency * 1.7) + flickerOffset + Math.PI) * 0.3;
            const flicker = crackle * secondary;
            const spike = Math.random() < 0.1 ? 1.5 + Math.random() * 0.5 : 1;
            const electricOpacity = opacity * flicker * spike;
            const jitterX = (Math.random() - 0.5) * 3 * (1 - t);
            const jitterY = (Math.random() - 0.5) * 3 * (1 - t);
            container.setAttribute("transform", `translate(${x * 100 + jitterX}, ${y * 100 + jitterY}) rotate(${(angle * 180) / Math.PI})`);
            container.style.opacity = Math.max(0, Math.min(1, electricOpacity)).toString();
            glow.setAttribute("opacity", (0.3 * flicker * opacity).toString());
          },
        };
      },
    },
    false
  );
}

export function indicatePotionUsage(at: Location) {
  spawnParticlesAt(
    at,
    {
      numParticles: 10,
      duration: 300,
      maxDistance: 1.5,
      minParticleSize: 0.15,
      maxParticleSize: 0.42,
      fadeOutStrength: 0.7,
      sizeGrowthThreshold: 0.2,
      sizeGrowthMultiplier: 5,
      extraOpacityBoost: 1.1,
      createParticle: (centerX, centerY, size, angle, defs, i, now) => {
        const bubbleStops = [
          { offset: "0%", color: "#FFF0FA", opacity: "1.0" },
          { offset: "30%", color: "#F7B6E6", opacity: "0.98" },
          { offset: "70%", color: "#E6A3D7", opacity: "0.92" },
          { offset: "100%", color: "#D47FC2", opacity: "0.85" },
        ];
        const strokeColor = "#D47FC2";
        const glareColor = "#FFF0FA";
        const particleStrokeWidth = 1;
        const particleStrokeOpacity = 0.8;
        const glareSizeRatio = 0.3;
        const glareOffsetXRatio = 0.15;
        const glareOffsetYRatio = -0.1;
        const glareOpacity = 0.95;
        const glareOpacityBoost = 1.1;

        const particleId = `bubble-${i}-${now}`;

        const gradient = document.createElementNS(SVG.ns, "radialGradient");
        gradient.setAttribute("id", `gradient-${particleId}`);
        gradient.setAttribute("cx", "30%");
        gradient.setAttribute("cy", "25%");
        gradient.setAttribute("r", "70%");

        for (const stopDef of bubbleStops) {
          const stop = document.createElementNS(SVG.ns, "stop");
          stop.setAttribute("offset", stopDef.offset);
          stop.setAttribute("stop-color", stopDef.color);
          stop.setAttribute("stop-opacity", stopDef.opacity);
          gradient.appendChild(stop);
        }
        defs.appendChild(gradient);

        const particle = document.createElementNS(SVG.ns, "circle");
        particle.setAttribute("r", ((size / 2) * 100).toString());
        particle.setAttribute("cx", (centerX * 100).toString());
        particle.setAttribute("cy", (centerY * 100).toString());
        particle.setAttribute("fill", `url(#gradient-${particleId})`);
        particle.setAttribute("stroke", strokeColor);
        particle.setAttribute("stroke-width", particleStrokeWidth.toString());
        particle.setAttribute("stroke-opacity", particleStrokeOpacity.toString());
        particle.style.pointerEvents = "none";
        particle.style.overflow = "visible";

        const glare = document.createElementNS(SVG.ns, "ellipse");
        const glareSize = size * glareSizeRatio;
        glare.setAttribute("rx", ((glareSize / 2) * 100).toString());
        glare.setAttribute("ry", ((glareSize / 3) * 100).toString());
        glare.setAttribute("cx", ((centerX + size * glareOffsetXRatio) * 100).toString());
        glare.setAttribute("cy", ((centerY + size * glareOffsetYRatio) * 100).toString());
        SVG.setFill(glare, glareColor);
        glare.setAttribute("opacity", glareOpacity.toString());
        glare.style.pointerEvents = "none";
        glare.style.overflow = "visible";

        return {
          main: particle,
          extra: glare,
          update: (x, y, currentSize, opacity, t) => {
            particle.setAttribute("cx", (x * 100).toString());
            particle.setAttribute("cy", (y * 100).toString());
            particle.setAttribute("r", ((currentSize / 2) * 100).toString());
            particle.style.opacity = opacity.toString();
            const glareSize = currentSize * glareSizeRatio;
            const glareOpacityCurrent = Math.min(1, opacity * glareOpacityBoost);
            glare.setAttribute("cx", ((x + currentSize * glareOffsetXRatio) * 100).toString());
            glare.setAttribute("cy", ((y + currentSize * glareOffsetYRatio) * 100).toString());
            glare.setAttribute("rx", ((glareSize / 2) * 100).toString());
            glare.setAttribute("ry", ((glareSize / 3) * 100).toString());
            glare.style.opacity = glareOpacityCurrent.toString();
          },
        };
      },
    },
    true
  );
}

export function indicateBombExplosion(at: Location) {
  spawnParticlesAt(
    at,
    {
      numParticles: 18,
      duration: 340,
      maxDistance: 2.1,
      minParticleSize: 0.18,
      maxParticleSize: 0.38,
      fadeOutStrength: 0.85,
      sizeGrowthThreshold: 0.12,
      sizeGrowthMultiplier: 7,
      ease: (t: number) => {
        return 1 - Math.pow(1 - t, 2.5);
      },
      createParticle: (centerX, centerY, size, angle, defs, i, now) => {
        const sparkColors = ["#FFF7B2", "#FFD966", "#FFB347", "#FF6F3C", "#FF3C3C", "#FFFFFF"];
        const color = sparkColors[i % sparkColors.length];
        const strokeColor = "#FFB347";
        const strokeWidth = 0.07 + Math.random() * 0.09;
        const initialLength = 0.18 + Math.random() * 0.22;
        const finalLength = 0.45 + Math.random() * 0.35;
        const initialWidth = 0.09 + Math.random() * 0.08;

        const spark = document.createElementNS(SVG.ns, "rect");
        spark.setAttribute("x", ((centerX - initialWidth / 2) * 100).toString());
        spark.setAttribute("y", ((centerY - initialLength / 2) * 100).toString());
        spark.setAttribute("width", (initialWidth * 100).toString());
        spark.setAttribute("height", (initialLength * 100).toString());
        spark.setAttribute("rx", (initialWidth * 40).toString());
        spark.setAttribute("fill", color);
        spark.setAttribute("stroke", strokeColor);
        spark.setAttribute("stroke-width", (strokeWidth * 100).toString());
        spark.setAttribute("stroke-opacity", "0.7");
        spark.style.pointerEvents = "none";
        spark.style.overflow = "visible";
        spark.setAttribute("transform", `rotate(${(angle * 180) / Math.PI},${centerX * 100},${centerY * 100})`);

        const flash = document.createElementNS(SVG.ns, "circle");
        flash.setAttribute("r", ((size / 2) * 100).toString());
        flash.setAttribute("cx", (centerX * 100).toString());
        flash.setAttribute("cy", (centerY * 100).toString());
        flash.setAttribute("fill", "#FFF7B2");
        flash.setAttribute("opacity", "0.85");
        flash.style.pointerEvents = "none";
        flash.style.overflow = "visible";

        return {
          main: spark,
          extra: flash,
          update: (x, y, currentSize, opacity, t) => {
            const length = initialLength + (finalLength - initialLength) * t;
            const width = initialWidth * (1 - t * 0.5);
            spark.setAttribute("x", ((x - width / 2) * 100).toString());
            spark.setAttribute("y", ((y - length / 2) * 100).toString());
            spark.setAttribute("width", (width * 100).toString());
            spark.setAttribute("height", (length * 100).toString());
            spark.setAttribute("rx", (width * 40).toString());
            spark.setAttribute("transform", `rotate(${(angle * 180) / Math.PI},${x * 100},${y * 100})`);
            spark.style.opacity = (opacity * 0.95 + 0.05).toString();

            const tipX = x + Math.cos(angle) * (length / 2);
            const tipY = y + Math.sin(angle) * (length / 2);
            flash.setAttribute("cx", (tipX * 100).toString());
            flash.setAttribute("cy", (tipY * 100).toString());
            flash.setAttribute("r", ((currentSize / 2 + 0.07 * (1 - t)) * 100).toString());
            flash.setAttribute("opacity", (opacity * 0.85).toString());
          },
        };
      },
    },
    false
  );
}

export function indicateFlameGround(at: Location) {
  spawnParticlesAt(
    at,
    {
      numParticles: 15,
      duration: 380,
      maxDistance: 1.8,
      minParticleSize: 0.22,
      maxParticleSize: 0.42,
      fadeOutStrength: 0.9,
      sizeGrowthThreshold: 0.3,
      sizeGrowthMultiplier: 2.5,
      ease: (t: number) => {
        const outward = Math.pow(t, 0.5);
        const wiggle = Math.sin(t * 8) * 0.1 * (1 - t);
        return outward + wiggle;
      },
      createParticle: (centerX, centerY, size, angle, defs, i, now) => {
        const flameColors = ["#FF4500", "#FF6347", "#FF8C00", "#FFD700", "#FFA500", "#DC143C", "#FF2500", "#FF4000", "#FF6600"];
        const coreColor = flameColors[i % flameColors.length];
        const outerColor = i % 3 === 0 ? "#FF4500" : "#FF8C00";

        const flameGradientId = `flame-gradient-${i}-${now}`;
        const gradient = document.createElementNS(SVG.ns, "radialGradient");
        gradient.setAttribute("id", flameGradientId);
        gradient.setAttribute("cx", "50%");
        gradient.setAttribute("cy", "70%");
        gradient.setAttribute("r", "80%");

        const coreStop = document.createElementNS(SVG.ns, "stop");
        coreStop.setAttribute("offset", "0%");
        coreStop.setAttribute("stop-color", "#FFFF00");
        coreStop.setAttribute("stop-opacity", "0.9");
        gradient.appendChild(coreStop);

        const midStop = document.createElementNS(SVG.ns, "stop");
        midStop.setAttribute("offset", "40%");
        midStop.setAttribute("stop-color", coreColor);
        midStop.setAttribute("stop-opacity", "0.8");
        gradient.appendChild(midStop);

        const outerStop = document.createElementNS(SVG.ns, "stop");
        outerStop.setAttribute("offset", "100%");
        outerStop.setAttribute("stop-color", outerColor);
        outerStop.setAttribute("stop-opacity", "0.3");
        gradient.appendChild(outerStop);

        defs.appendChild(gradient);
        const flame = document.createElementNS(SVG.ns, "path");
        const flameWidth = size * 1.2;
        const flameHeight = size * 1.6;
        const asymmetryFactor = (Math.random() - 0.5) * 0.4;
        const tipVariation = (Math.random() - 0.5) * 0.3;
        const baseVariation = (Math.random() - 0.5) * 0.2;
        const leftCurve = 0.5 + (Math.random() - 0.5) * 0.6;
        const rightCurve = 0.5 + (Math.random() - 0.5) * 0.6;
        const midBulge = 0.8 + (Math.random() - 0.5) * 0.4;
        const leftCtrl1 = 0.2 + (Math.random() - 0.5) * 0.15;
        const leftCtrl2 = 0.6 + (Math.random() - 0.5) * 0.2;
        const leftCtrl3 = 0.9 + (Math.random() - 0.5) * 0.15;
        const rightCtrl1 = 0.2 + (Math.random() - 0.5) * 0.15;
        const rightCtrl2 = 0.6 + (Math.random() - 0.5) * 0.2;
        const rightCtrl3 = 0.9 + (Math.random() - 0.5) * 0.15;
        const halfWidth = flameWidth / 2;
        const tipX = centerX + tipVariation * halfWidth;
        const tipY = centerY - flameHeight / 2.2;

        const pathData = `M ${tipX * 100} ${tipY * 100} 
                        C ${(centerX - halfWidth * leftCtrl1 + asymmetryFactor * halfWidth) * 100} ${(centerY - flameHeight / (2.5 + Math.random() * 0.5)) * 100}, 
                          ${(centerX - halfWidth * leftCtrl2 * leftCurve + asymmetryFactor * halfWidth) * 100} ${(centerY - flameHeight / (4 + Math.random() * 0.5)) * 100}, 
                          ${(centerX - halfWidth * leftCtrl3 * midBulge + asymmetryFactor * halfWidth) * 100} ${(centerY - flameHeight / (8 + Math.random() * 0.3)) * 100}
                        C ${(centerX - halfWidth * (1.1 + Math.random() * 0.2) * midBulge + asymmetryFactor * halfWidth) * 100} ${(centerY + flameHeight / (8 + Math.random() * 0.3)) * 100},
                          ${(centerX - halfWidth * (0.8 + Math.random() * 0.2) + asymmetryFactor * halfWidth) * 100} ${(centerY + flameHeight / (3 + Math.random() * 0.4)) * 100},
                          ${(centerX - halfWidth * (0.5 + baseVariation) + asymmetryFactor * halfWidth) * 100} ${(centerY + flameHeight / (2.2 + Math.random() * 0.3)) * 100}
                        C ${(centerX - halfWidth * (0.1 + Math.random() * 0.1) + asymmetryFactor * halfWidth) * 100} ${(centerY + flameHeight / (2 + Math.random() * 0.2)) * 100},
                          ${(centerX + halfWidth * (0.1 + Math.random() * 0.1) + asymmetryFactor * halfWidth) * 100} ${(centerY + flameHeight / (2 + Math.random() * 0.2)) * 100},
                          ${(centerX + halfWidth * (0.5 + baseVariation) + asymmetryFactor * halfWidth) * 100} ${(centerY + flameHeight / (2.2 + Math.random() * 0.3)) * 100}
                        C ${(centerX + halfWidth * (0.8 + Math.random() * 0.2) + asymmetryFactor * halfWidth) * 100} ${(centerY + flameHeight / (3 + Math.random() * 0.4)) * 100},
                          ${(centerX + halfWidth * (1.1 + Math.random() * 0.2) * midBulge + asymmetryFactor * halfWidth) * 100} ${(centerY + flameHeight / (8 + Math.random() * 0.3)) * 100},
                          ${(centerX + halfWidth * rightCtrl3 * midBulge + asymmetryFactor * halfWidth) * 100} ${(centerY - flameHeight / (8 + Math.random() * 0.3)) * 100}
                        C ${(centerX + halfWidth * rightCtrl2 * rightCurve + asymmetryFactor * halfWidth) * 100} ${(centerY - flameHeight / (4 + Math.random() * 0.5)) * 100}, 
                          ${(centerX + halfWidth * rightCtrl1 + asymmetryFactor * halfWidth) * 100} ${(centerY - flameHeight / (2.5 + Math.random() * 0.5)) * 100}, 
                          ${tipX * 100} ${tipY * 100} Z`;

        flame.setAttribute("d", pathData);
        flame.setAttribute("fill", `url(#${flameGradientId})`);
        flame.style.pointerEvents = "none";
        flame.style.overflow = "visible";
        const flickerOffset = Math.random() * Math.PI * 2;
        const flickerSpeed = 12 + Math.random() * 8;
        const lateralDrift = (Math.random() - 0.5) * 0.3;

        return {
          main: flame,
          update: (x, y, currentSize, opacity, t) => {
            const flicker = 1 + Math.sin(t * flickerSpeed + flickerOffset) * 0.15;
            const lateralOffset = Math.sin(t * 12 + flickerOffset) * lateralDrift * (1 - t * 0.5);
            const flameX = x + lateralOffset * 0.3;
            const flameY = y;

            const flickerSize = currentSize * flicker;
            const flameWidth = flickerSize * 1.2;
            const flameHeight = flickerSize * 1.6 * (1 + t * 0.3);
            const halfWidth = flameWidth / 2;
            const animTipX = flameX + tipVariation * halfWidth;
            const animTipY = flameY - flameHeight / 2.2;
            const windEffect = Math.sin(t * 6 + flickerOffset) * 0.1 * (1 - t * 0.7);

            const pathData = `M ${animTipX * 100} ${animTipY * 100} 
                            C ${(flameX - halfWidth * leftCtrl1 + asymmetryFactor * halfWidth + windEffect) * 100} ${(flameY - flameHeight / 2.5) * 100}, 
                              ${(flameX - halfWidth * leftCtrl2 * leftCurve + asymmetryFactor * halfWidth + windEffect * 0.7) * 100} ${(flameY - flameHeight / 4) * 100}, 
                              ${(flameX - halfWidth * leftCtrl3 * midBulge + asymmetryFactor * halfWidth + windEffect * 0.5) * 100} ${(flameY - flameHeight / 8) * 100}
                            C ${(flameX - halfWidth * 1.1 * midBulge + asymmetryFactor * halfWidth + windEffect * 0.3) * 100} ${(flameY + flameHeight / 8) * 100},
                              ${(flameX - halfWidth * 0.8 + asymmetryFactor * halfWidth + windEffect * 0.2) * 100} ${(flameY + flameHeight / 3) * 100},
                              ${(flameX - halfWidth * (0.5 + baseVariation) + asymmetryFactor * halfWidth) * 100} ${(flameY + flameHeight / 2.2) * 100}
                            C ${(flameX - halfWidth * 0.1 + asymmetryFactor * halfWidth) * 100} ${(flameY + flameHeight / 2) * 100},
                              ${(flameX + halfWidth * 0.1 + asymmetryFactor * halfWidth) * 100} ${(flameY + flameHeight / 2) * 100},
                              ${(flameX + halfWidth * (0.5 + baseVariation) + asymmetryFactor * halfWidth) * 100} ${(flameY + flameHeight / 2.2) * 100}
                            C ${(flameX + halfWidth * 0.8 + asymmetryFactor * halfWidth + windEffect * 0.2) * 100} ${(flameY + flameHeight / 3) * 100},
                              ${(flameX + halfWidth * 1.1 * midBulge + asymmetryFactor * halfWidth + windEffect * 0.3) * 100} ${(flameY + flameHeight / 8) * 100},
                              ${(flameX + halfWidth * rightCtrl3 * midBulge + asymmetryFactor * halfWidth + windEffect * 0.5) * 100} ${(flameY - flameHeight / 8) * 100}
                            C ${(flameX + halfWidth * rightCtrl2 * rightCurve + asymmetryFactor * halfWidth + windEffect * 0.7) * 100} ${(flameY - flameHeight / 4) * 100}, 
                              ${(flameX + halfWidth * rightCtrl1 + asymmetryFactor * halfWidth + windEffect) * 100} ${(flameY - flameHeight / 2.5) * 100}, 
                              ${animTipX * 100} ${animTipY * 100} Z`;
            flame.setAttribute("d", pathData);
            const flickerOpacity = opacity * (0.7 + 0.3 * flicker);
            flame.style.opacity = Math.max(0, Math.min(1, flickerOpacity)).toString();
          },
        };
      },
    },
    false
  );
}

export function indicateSpiritAction(at: Location) {
  // TODO: implement
}

export function indicateWaterSplash(at: Location) {
  spawnParticlesAt(
    at,
    {
      numParticles: 10,
      duration: 230,
      maxDistance: 0.95,
      minParticleSize: 0.1,
      maxParticleSize: 0.15,
      fadeOutStrength: 0.6,
      sizeGrowthThreshold: 0.1,
      sizeGrowthMultiplier: 1.5,
      ease: (t: number) => {
        const outward = Math.pow(t, 0.7);
        const gentleFloat = Math.sin(t * Math.PI) * 0.2;
        return outward + gentleFloat;
      },
      createParticle: (centerX, centerY, size, angle, defs, i, now) => {
        const vibrantWaterColors = ["#35D2F8", "#B2F9FD", "#6EEBFA", "#A0F3F9", "#35D2F8", "#B2F9FD"];
        const dropletColor = vibrantWaterColors[i % vibrantWaterColors.length];
        const isSpecialDroplet = size > 0.2;
        const gradientId = `water-droplet-gradient-${i}-${now}`;
        const gradient = document.createElementNS(SVG.ns, "radialGradient");
        gradient.setAttribute("id", gradientId);
        gradient.setAttribute("cx", "30%");
        gradient.setAttribute("cy", "20%");
        gradient.setAttribute("r", "70%");

        const highlightStop = document.createElementNS(SVG.ns, "stop");
        highlightStop.setAttribute("offset", "0%");
        highlightStop.setAttribute("stop-color", "#FFFFFF");
        highlightStop.setAttribute("stop-opacity", "1.0");
        gradient.appendChild(highlightStop);

        const midStop = document.createElementNS(SVG.ns, "stop");
        midStop.setAttribute("offset", "40%");
        midStop.setAttribute("stop-color", "#B2F9FD");
        midStop.setAttribute("stop-opacity", "0.95");
        gradient.appendChild(midStop);

        const colorStop = document.createElementNS(SVG.ns, "stop");
        colorStop.setAttribute("offset", "70%");
        colorStop.setAttribute("stop-color", "#35D2F8");
        colorStop.setAttribute("stop-opacity", "0.9");
        gradient.appendChild(colorStop);

        const edgeStop = document.createElementNS(SVG.ns, "stop");
        edgeStop.setAttribute("offset", "100%");
        edgeStop.setAttribute("stop-color", dropletColor);
        edgeStop.setAttribute("stop-opacity", "0.8");
        gradient.appendChild(edgeStop);

        defs.appendChild(gradient);

        const dropletWidth = size * (0.8 + Math.random() * 0.2);
        const dropletHeight = size * (1.2 + Math.random() * 0.2);
        const pathData = `M ${centerX * 100} ${(centerY - dropletHeight * 0.5) * 100}
                         C ${(centerX - dropletWidth * 0.2) * 100} ${(centerY - dropletHeight * 0.35) * 100},
                           ${(centerX - dropletWidth * 0.4) * 100} ${(centerY - dropletHeight * 0.1) * 100},
                           ${(centerX - dropletWidth * 0.45) * 100} ${(centerY + dropletHeight * 0.1) * 100}
                         C ${(centerX - dropletWidth * 0.5) * 100} ${(centerY + dropletHeight * 0.3) * 100},
                           ${(centerX - dropletWidth * 0.35) * 100} ${(centerY + dropletHeight * 0.45) * 100},
                           ${centerX * 100} ${(centerY + dropletHeight * 0.5) * 100}
                         C ${(centerX + dropletWidth * 0.35) * 100} ${(centerY + dropletHeight * 0.45) * 100},
                           ${(centerX + dropletWidth * 0.5) * 100} ${(centerY + dropletHeight * 0.3) * 100},
                           ${(centerX + dropletWidth * 0.45) * 100} ${(centerY + dropletHeight * 0.1) * 100}
                         C ${(centerX + dropletWidth * 0.4) * 100} ${(centerY - dropletHeight * 0.1) * 100},
                           ${(centerX + dropletWidth * 0.2) * 100} ${(centerY - dropletHeight * 0.35) * 100},
                           ${centerX * 100} ${(centerY - dropletHeight * 0.5) * 100} Z`;

        const droplet = document.createElementNS(SVG.ns, "path");
        droplet.setAttribute("d", pathData);
        droplet.setAttribute("fill", `url(#${gradientId})`);
        droplet.setAttribute("stroke", dropletColor);
        droplet.setAttribute("stroke-width", "1");
        droplet.setAttribute("stroke-opacity", "0.23");
        droplet.setAttribute("opacity", "0.78");
        droplet.style.pointerEvents = "none";
        droplet.style.overflow = "visible";

        let sparkle: SVGElement | undefined;
        if (isSpecialDroplet) {
          sparkle = document.createElementNS(SVG.ns, "ellipse");
          sparkle.setAttribute("rx", (size * 0.08 * 100).toString());
          sparkle.setAttribute("ry", (size * 0.05 * 100).toString());
          sparkle.setAttribute("cx", (centerX * 100).toString());
          sparkle.setAttribute("cy", (centerY * 100).toString());
          sparkle.setAttribute("fill", "#FFFFFF");
          sparkle.setAttribute("opacity", "0.6");
          sparkle.style.pointerEvents = "none";
          sparkle.style.overflow = "visible";
        }

        const velocityX = Math.cos(angle) * (0.3 + Math.random() * 0.2);
        const velocityY = Math.sin(angle) * (0.3 + Math.random() * 0.2);
        const gravity = 0.0098;
        const airResistance = 0;

        return {
          main: droplet,
          extra: sparkle,
          update: (x, y, currentSize, opacity, t) => {
            const currentVelX = velocityX * (1 - airResistance * t);
            const currentVelY = velocityY + gravity * t;
            const currentX = x + currentVelX * t;
            const currentY = y + currentVelY * t;
            const speed = Math.sqrt(currentVelX * currentVelX + currentVelY * currentVelY);
            const stretch = 1 + speed * 0.3;
            const dropletWidth = currentSize * (1.0 + Math.random() * 0.1);
            const dropletHeight = currentSize * (1.4 + Math.random() * 0.1) * stretch;
            const motionAngle = Math.atan2(currentVelY, currentVelX);
            const rotationDegrees = (motionAngle * 180) / Math.PI - 90;
            const pathData = `M ${currentX * 100} ${(currentY - dropletHeight * 0.5) * 100}
                             C ${(currentX - dropletWidth * 0.2) * 100} ${(currentY - dropletHeight * 0.35) * 100},
                               ${(currentX - dropletWidth * 0.4) * 100} ${(currentY - dropletHeight * 0.1) * 100},
                               ${(currentX - dropletWidth * 0.45) * 100} ${(currentY + dropletHeight * 0.1) * 100}
                             C ${(currentX - dropletWidth * 0.5) * 100} ${(currentY + dropletHeight * 0.3) * 100},
                               ${(currentX - dropletWidth * 0.35) * 100} ${(currentY + dropletHeight * 0.45) * 100},
                               ${currentX * 100} ${(currentY + dropletHeight * 0.5) * 100}
                             C ${(currentX + dropletWidth * 0.35) * 100} ${(currentY + dropletHeight * 0.45) * 100},
                               ${(currentX + dropletWidth * 0.5) * 100} ${(currentY + dropletHeight * 0.3) * 100},
                               ${(currentX + dropletWidth * 0.45) * 100} ${(currentY + dropletHeight * 0.1) * 100}
                             C ${(currentX + dropletWidth * 0.4) * 100} ${(currentY - dropletHeight * 0.1) * 100},
                               ${(currentX + dropletWidth * 0.2) * 100} ${(currentY - dropletHeight * 0.35) * 100},
                               ${currentX * 100} ${(currentY - dropletHeight * 0.5) * 100} Z`;

            droplet.setAttribute("d", pathData);
            droplet.setAttribute("transform", `rotate(${rotationDegrees} ${currentX * 100} ${currentY * 100})`);
            droplet.style.opacity = (opacity * 0.78).toString();

            if (sparkle) {
              const globalTime = (now + t * 350) / 1000;
              const lightFlicker = 0.8 + Math.sin(globalTime * 8) * 0.15 + Math.sin(globalTime * 23) * 0.05;
              const individualVariation = 0.95 + Math.sin(i * 2.4 + globalTime * 12) * 0.05;
              const twinkle = lightFlicker * individualVariation;
              const sparkleOffsetX = -dropletWidth * 0.15;
              const sparkleOffsetY = -dropletHeight * 0.25;
              const motionAngle = Math.atan2(currentVelY, currentVelX) - Math.PI / 2;
              const rotatedOffsetX = sparkleOffsetX * Math.cos(motionAngle) - sparkleOffsetY * Math.sin(motionAngle);
              const rotatedOffsetY = sparkleOffsetX * Math.sin(motionAngle) + sparkleOffsetY * Math.cos(motionAngle);
              const sharedBob = Math.sin(globalTime * 6) * 0.01;
              const sparkleX = currentX + rotatedOffsetX;
              const sparkleY = currentY + rotatedOffsetY + sharedBob;

              sparkle.setAttribute("cx", (sparkleX * 100).toString());
              sparkle.setAttribute("cy", (sparkleY * 100).toString());
              sparkle.setAttribute("transform", `rotate(${rotationDegrees} ${sparkleX * 100} ${sparkleY * 100})`);
              sparkle.style.opacity = Math.max(0, opacity * twinkle * 0.75).toString();
            }
          },
        };
      },
    },
    false
  );
}
