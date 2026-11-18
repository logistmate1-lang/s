import { useEffect, useRef } from 'react';
import {
  getChamomileMetrics,
  sampleChamomileTargets,
  sampleEnvelopeTargets,
  sampleNameTargets,
  type TargetPoint,
} from '../utils/particleShapes';

export type ExperienceStage = 'envelope' | 'opening' | 'circulating' | 'name' | 'flower';

interface SpaceParticleCanvasProps {
  stage: ExperienceStage;
  replayNonce: number;
  onOpenEnvelope: () => void;
  onFlowerInteract?: () => void;
}

interface StarDot {
  x: number;
  y: number;
  z: number;
  prevZ: number;
  speed: number;
  size: number;
  tint: 'white' | 'blue' | 'warm';
  twinkleOffset: number;
}

interface MorphParticle {
  x: number;
  y: number;
  z: number;
  prevX: number;
  prevY: number;
  startX: number;
  startY: number;
  startZ: number;
  r: number;
  g: number;
  b: number;
  startR: number;
  startG: number;
  startB: number;
  size: number;
  startSize: number;
  depthShade: number;
  /** Polar state for circulating vortex */
  orbitRadius: number;
  orbitTargetRadius: number;
  orbitAngle: number;
  orbitStartAngle: number;
  orbitTargetAngle: number;
  orbitSpinOffset: number;
  orbitSpeed: number;
  orbitWaveOffset: number;
  twinklePhase: number;
  jitterAmp: number;
}

interface PollenMote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  size: number;
  phase: number;
}

const PARTICLE_COUNT = 4800;
const STAR_COUNT = 480;
const POLLEN_COUNT = 72;

function easeInOutCubic(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

function easeOutQuart(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - c, 4);
}

export function SpaceParticleCanvas({
  stage,
  replayNonce,
  onOpenEnvelope,
  onFlowerInteract,
}: SpaceParticleCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<ExperienceStage>(stage);
  const onOpenRef = useRef(onOpenEnvelope);
  const onFlowerInteractRef = useRef(onFlowerInteract);

  const particlesRef = useRef<MorphParticle[]>([]);
  const targetsRef = useRef<{
    envelope: TargetPoint[];
    envelopeFillCount: number;
    name: TargetPoint[];
    flower: TargetPoint[];
  } | null>(null);
  const starsRef = useRef<StarDot[]>([]);
  const pollenRef = useRef<PollenMote[]>([]);
  const drawOrderRef = useRef<Int32Array>(new Int32Array(PARTICLE_COUNT));
  const projZRef = useRef<Float32Array>(new Float32Array(PARTICLE_COUNT));
  const sizeRef = useRef({ width: 1280, height: 720 });
  const stageStartedAtRef = useRef<number>(performance.now());
  const pointerRef = useRef<{ x: number; y: number; active: boolean }>({
    x: 0,
    y: 0,
    active: false,
  });
  const hoveredEnvelopeRef = useRef(false);
  const flower3DRef = useRef({
    rotX: 0.38,
    rotY: -0.14,
    velX: 0,
    velY: 0,
    hoverTiltX: 0,
    hoverTiltY: 0,
    zoom: 1,
    isDragging: false,
    lastX: 0,
    lastY: 0,
    touchRipple: 0,
  });

  useEffect(() => {
    onOpenRef.current = onOpenEnvelope;
  }, [onOpenEnvelope]);

  useEffect(() => {
    onFlowerInteractRef.current = onFlowerInteract;
  }, [onFlowerInteract]);

  // Scatter particles across space when replaying from the beginning
  useEffect(() => {
    if (replayNonce === 0) return;
    const particles = particlesRef.current;
    const { width, height } = sizeRef.current;
    const cx = width / 2;
    const cy = height * 0.42;
    const spread = Math.max(width, height) * 0.72;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.sqrt(Math.random()) * spread;
      p.x = cx + Math.cos(angle) * dist;
      p.y = cy + Math.sin(angle) * dist;
      p.prevX = p.x;
      p.prevY = p.y;
      p.startX = p.x;
      p.startY = p.y;
      p.r = 225;
      p.g = 232;
      p.b = 248;
      p.startR = 225;
      p.startG = 232;
      p.startB = 248;
      p.size = 0.9 + Math.random() * 0.9;
      p.startSize = p.size;
    }
    stageStartedAtRef.current = performance.now();
  }, [replayNonce]);

  // Synchronize particle starting snapshots whenever `stage` changes
  useEffect(() => {
    stageRef.current = stage;
    stageStartedAtRef.current = performance.now();

    const particles = particlesRef.current;
    const { width, height } = sizeRef.current;
    const cx = width / 2;
    const cy = height * 0.45;

    if (particles.length === 0) return;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.startX = p.x;
      p.startY = p.y;
      p.startZ = p.z;
      p.startR = p.r;
      p.startG = p.g;
      p.startB = p.b;
      p.startSize = p.size;

      if (stage === 'circulating') {
        const dx = p.x - cx;
        const dy = p.y - cy;
        const currentR = Math.max(12, Math.hypot(dx, dy));
        p.orbitRadius = currentR;

        // Distribute particles evenly across 6 concentric celestial rings with full 360-degree coverage
        const bandCount = 6;
        const bandIdx = i % bandCount;
        const slotIdx = Math.floor(i / bandCount);
        const slotsPerBand = Math.ceil(PARTICLE_COUNT / bandCount);

        const baseMinR = Math.min(width, height) * 0.11;
        const baseMaxR = Math.min(width, height) * 0.34;
        const bandFrac = bandIdx / (bandCount - 1);
        const radialFeather = ((((i * 73) % 100) / 100) - 0.5) * 18;
        p.orbitTargetRadius = Math.max(26, baseMinR + (baseMaxR - baseMinR) * bandFrac + radialFeather);

        const startA = Math.atan2(dy, dx);
        const targetBaseA =
          ((slotIdx + (bandIdx * 0.37)) / slotsPerBand) * Math.PI * 2 +
          ((((i * 29) % 100) / 100) - 0.5) * 0.04;
        // Pick shortest wrapped angular path so every particle flows naturally into its even slot
        let diffA = (targetBaseA - startA) % (Math.PI * 2);
        if (diffA > Math.PI) diffA -= Math.PI * 2;
        if (diffA < -Math.PI) diffA += Math.PI * 2;

        p.orbitStartAngle = startA;
        p.orbitTargetAngle = startA + diffA;
        p.orbitSpinOffset = 0;
        p.orbitAngle = startA;
        // Uniform band speed keeps full 360° density evenly balanced while inner rings gently shear ahead
        p.orbitSpeed = 2.9 + (1 - bandFrac) * 1.15;
      } else if (stage === 'flower' || stage === 'envelope') {
        flower3DRef.current = {
          rotX: 0.38,
          rotY: -0.14,
          velX: 0,
          velY: 0,
          hoverTiltX: 0,
          hoverTiltY: 0,
          zoom: 1,
          isDragging: false,
          lastX: 0,
          lastY: 0,
          touchRipple: 0,
        };
      }
    }
  }, [stage]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let animationFrameId = 0;
    let isDisposed = false;

    const initStars = (w: number, h: number) => {
      const stars: StarDot[] = [];
      for (let i = 0; i < STAR_COUNT; i++) {
        const tintRoll = Math.random();
        stars.push({
          x: (Math.random() - 0.5) * w * 2.2,
          y: (Math.random() - 0.5) * h * 2.2,
          z: Math.random(),
          prevZ: 1,
          speed: 0.0014 + Math.random() * 0.0032,
          size: 0.7 + Math.random() * 1.6,
          tint: tintRoll < 0.65 ? 'white' : tintRoll < 0.85 ? 'blue' : 'warm',
          twinkleOffset: Math.random() * Math.PI * 2,
        });
        stars[i].prevZ = stars[i].z;
      }
      starsRef.current = stars;
    };

    const initPollen = (w: number, h: number) => {
      const motes: PollenMote[] = [];
      for (let i = 0; i < POLLEN_COUNT; i++) {
        motes.push({
          x: w * 0.25 + Math.random() * w * 0.5,
          y: h * 0.25 + Math.random() * h * 0.5,
          vx: (Math.random() - 0.5) * 0.25,
          vy: -0.22 - Math.random() * 0.38,
          alpha: 0.2 + Math.random() * 0.55,
          size: 1 + Math.random() * 1.8,
          phase: Math.random() * Math.PI * 2,
        });
      }
      pollenRef.current = motes;
    };

    const rebuildTargets = (w: number, h: number) => {
      const envelope = sampleEnvelopeTargets(w, h, PARTICLE_COUNT);
      const envelopeFillCount = envelope.reduce(
        (acc, pt) => (pt.role === 'envelopeFill' ? acc + 1 : acc),
        0,
      );
      const name = sampleNameTargets('Hamidabonu', w, h, PARTICLE_COUNT);
      const flower = sampleChamomileTargets(w, h, PARTICLE_COUNT);
      targetsRef.current = { envelope, envelopeFillCount, name, flower };

      if (particlesRef.current.length === 0) {
        const initial: MorphParticle[] = [];
        const cx = w / 2;
        const cy = h * 0.42;
        const spread = Math.max(w, h) * 0.72;

        for (let i = 0; i < PARTICLE_COUNT; i++) {
          // Spawn particles scattered across space so they travel inward to form the envelope
          const angle = Math.random() * Math.PI * 2;
          const dist = Math.sqrt(Math.random()) * spread;
          const sx = cx + Math.cos(angle) * dist;
          const sy = cy + Math.sin(angle) * dist;
          const starTint = i % 3 === 0 ? { r: 215, g: 228, b: 255 } : { r: 245, g: 244, b: 252 };
          const sSize = 0.85 + Math.random() * 0.95;

          initial.push({
            x: sx,
            y: sy,
            z: 0,
            prevX: sx,
            prevY: sy,
            startX: sx,
            startY: sy,
            startZ: 0,
            r: starTint.r,
            g: starTint.g,
            b: starTint.b,
            startR: starTint.r,
            startG: starTint.g,
            startB: starTint.b,
            size: sSize,
            startSize: sSize,
            depthShade: 1,
            orbitRadius: 80,
            orbitTargetRadius: 120,
            orbitAngle: (i / PARTICLE_COUNT) * Math.PI * 2,
            orbitStartAngle: (i / PARTICLE_COUNT) * Math.PI * 2,
            orbitTargetAngle: (i / PARTICLE_COUNT) * Math.PI * 2,
            orbitSpinOffset: 0,
            orbitSpeed: 2.5,
            orbitWaveOffset: Math.random() * Math.PI * 2,
            twinklePhase: Math.random() * Math.PI * 2,
            jitterAmp: 0.45 + Math.random() * 0.85,
          });
          drawOrderRef.current[i] = i;
        }
        particlesRef.current = initial;
      }
    };

    const handleResize = () => {
      const w = Math.max(1, window.innerWidth);
      const h = Math.max(1, window.innerHeight);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sizeRef.current = { width: w, height: h };

      if (starsRef.current.length === 0) initStars(w, h);
      if (pollenRef.current.length === 0) initPollen(w, h);
      rebuildTargets(w, h);
    };

    handleResize();

    // Re-sample name particles once Google Font finishes loading so "Hamidabonu" renders in Cormorant Garamond
    if (document.fonts && document.fonts.ready) {
      void document.fonts.ready.then(() => {
        if (!isDisposed) {
          const { width, height } = sizeRef.current;
          const name = sampleNameTargets('Hamidabonu', width, height, PARTICLE_COUNT);
          if (targetsRef.current) {
            targetsRef.current.name = name;
          }
        }
      });
    }

    const onWindowPointerMove = (e: PointerEvent) => {
      pointerRef.current = {
        x: e.clientX,
        y: e.clientY + (window.scrollY || 0),
        active: true,
      };
    };

    const onWindowPointerOut = (e: MouseEvent) => {
      if (!e.relatedTarget) {
        pointerRef.current.active = false;
        hoveredEnvelopeRef.current = false;
      }
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('pointermove', onWindowPointerMove, { passive: true });
    window.addEventListener('mouseout', onWindowPointerOut, { passive: true });

    let lastTime = performance.now();

    const renderFrame = (now: number) => {
      if (isDisposed) return;
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      const timeSec = now / 1000;

      const { width, height } = sizeRef.current;
      const cx = width / 2;
      const cy = height * 0.45;
      const scrollY = typeof window !== 'undefined' ? window.scrollY || 0 : 0;
      const activeStage = stageRef.current;
      const elapsedStage = Math.max(0, (now - stageStartedAtRef.current) / 1000);

      // 1. Deep space backdrop gradient
      const bgGrad = ctx.createRadialGradient(cx, cy, 20, cx, cy, Math.max(width, height) * 0.85);
      bgGrad.addColorStop(0, '#0c1022');
      bgGrad.addColorStop(0.55, '#070913');
      bgGrad.addColorStop(1, '#04050a');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // Subtle atmospheric aura behind active centerpiece (scrolls with Hero)
      ctx.save();
      ctx.translate(0, -scrollY);
      if (activeStage === 'envelope') {
        const heartGlow = ctx.createRadialGradient(cx, height * 0.41, 6, cx, height * 0.41, 240);
        heartGlow.addColorStop(0, hoveredEnvelopeRef.current ? 'rgba(244, 63, 94, 0.22)' : 'rgba(244, 63, 94, 0.15)');
        heartGlow.addColorStop(0.55, 'rgba(225, 29, 72, 0.06)');
        heartGlow.addColorStop(1, 'rgba(244, 63, 94, 0)');
        ctx.fillStyle = heartGlow;
        ctx.fillRect(0, 0, width, height);
      } else if (activeStage === 'opening') {
        const openGlowT = Math.min(1, elapsedStage / 0.9);
        const envW = Math.min(width * 0.72, 340);
        const envH = envW * 0.64;
        const bodySettle = easeInOutCubic(Math.min(1, elapsedStage / 0.55));
        const envCenterY = height * 0.40 + bodySettle * 24;
        const envTopY = envCenterY - envH / 2;

        const innerLight = ctx.createRadialGradient(cx, envTopY + 14, 6, cx, envTopY - 28, 280);
        innerLight.addColorStop(0, `rgba(255, 224, 178, ${0.08 + openGlowT * 0.18})`);
        innerLight.addColorStop(0.42, `rgba(244, 63, 94, ${0.14 - openGlowT * 0.04})`);
        innerLight.addColorStop(1, 'rgba(244, 63, 94, 0)');
        ctx.fillStyle = innerLight;
        ctx.fillRect(0, 0, width, height);

        // Delicate click-unlock shockwave ring around the heart wax seal
        if (elapsedStage < 0.85 && !prefersReducedMotion) {
          const ringT = easeOutQuart(elapsedStage / 0.85);
          const ringR = Math.max(0.5, 14 + ringT * (envW * 0.42));
          const ringAlpha = Math.max(0, (1 - ringT) * 0.42);
          ctx.beginPath();
          ctx.arc(cx, envCenterY + envH * 0.05, ringR, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255, 136, 162, ${ringAlpha})`;
          ctx.lineWidth = 1.6;
          ctx.stroke();
        }
      } else if (activeStage === 'circulating') {
        const vortexGlow = ctx.createRadialGradient(cx, cy, 10, cx, cy, 270);
        vortexGlow.addColorStop(0, 'rgba(244, 63, 94, 0.20)');
        vortexGlow.addColorStop(0.55, 'rgba(225, 29, 72, 0.07)');
        vortexGlow.addColorStop(1, 'rgba(225, 29, 72, 0)');
        ctx.fillStyle = vortexGlow;
        ctx.fillRect(0, 0, width, height);
      } else if (activeStage === 'name') {
        const nameGlow = ctx.createRadialGradient(cx, height * 0.47, 12, cx, height * 0.47, 320);
        nameGlow.addColorStop(0, 'rgba(244, 63, 94, 0.18)');
        nameGlow.addColorStop(0.55, 'rgba(225, 29, 72, 0.06)');
        nameGlow.addColorStop(1, 'rgba(225, 29, 72, 0)');
        ctx.fillStyle = nameGlow;
        ctx.fillRect(0, 0, width, height);
      } else if (activeStage === 'flower') {
        const bloomGlow = ctx.createRadialGradient(cx, height * 0.36, 8, cx, height * 0.36, 250);
        bloomGlow.addColorStop(0, 'rgba(255, 212, 59, 0.16)');
        bloomGlow.addColorStop(0.38, 'rgba(255, 250, 232, 0.06)');
        bloomGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = bloomGlow;
        ctx.fillRect(0, 0, width, height);
      }
      ctx.restore();

      // 2. Travelling space dots (3D starfield rush)
      const stars = starsRef.current;
      const parallaxX = pointerRef.current.active ? (pointerRef.current.x - cx) * 0.045 : 0;
      const parallaxY = pointerRef.current.active ? (pointerRef.current.y - cy) * 0.045 : 0;
      const warpBoost = activeStage === 'circulating' ? 2.2 : 1.0;

      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        s.prevZ = s.z;
        const speedMul = prefersReducedMotion ? 0.25 : warpBoost;
        s.z -= s.speed * speedMul * (dt * 60);

        if (s.z <= 0.03) {
          s.x = (Math.random() - 0.5) * width * 2.2;
          s.y = (Math.random() - 0.5) * height * 2.2;
          s.z = 1;
          s.prevZ = 1;
        }

        const projX = cx + (s.x / s.z) * 0.45 - parallaxX * (1 - s.z);
        const projY = cy + (s.y / s.z) * 0.45 - parallaxY * (1 - s.z);
        const prevProjX = cx + (s.x / s.prevZ) * 0.45 - parallaxX * (1 - s.prevZ);
        const prevProjY = cy + (s.y / s.prevZ) * 0.45 - parallaxY * (1 - s.prevZ);

        if (projX < -20 || projX > width + 20 || projY < -20 || projY > height + 20) {
          continue;
        }

        const depthAlpha = Math.min(0.9, (1 - s.z) * 0.95 + 0.08);
        const twinkle = 0.78 + 0.22 * Math.sin(timeSec * 2.2 + s.twinkleOffset);
        const alpha = depthAlpha * twinkle;
        const radius = Math.max(0.45, (1 - s.z) * s.size * 1.45);

        let rgb = '226, 232, 240';
        if (s.tint === 'blue') rgb = '186, 214, 255';
        if (s.tint === 'warm') rgb = '255, 238, 214';

        // Draw subtle motion trail streak for travelling stars
        if (!prefersReducedMotion && s.z < 0.75) {
          ctx.beginPath();
          ctx.moveTo(prevProjX, prevProjY);
          ctx.lineTo(projX, projY);
          ctx.strokeStyle = `rgba(${rgb}, ${alpha * 0.45})`;
          ctx.lineWidth = radius * 1.1;
          ctx.stroke();
        }

        ctx.beginPath();
        ctx.arc(projX, projY, radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${rgb}, ${alpha})`;
        ctx.fill();
      }

      // 3. Morphing foreground particles
      const targets = targetsRef.current;
      const particles = particlesRef.current;

      if (targets && particles.length > 0) {
        // Gentle heartbeat curve for the red heart on the envelope
        const beatCycle = (timeSec * 1.15) % 1;
        const heartbeat =
          beatCycle < 0.14
            ? Math.sin((beatCycle / 0.14) * Math.PI) * 0.065
            : beatCycle > 0.20 && beatCycle < 0.36
              ? Math.sin(((beatCycle - 0.20) / 0.16) * Math.PI) * 0.042
              : 0;

        // Gentle botanical breeze sway once chamomile has formed
        const flowerSettled = activeStage === 'flower' ? Math.max(0, Math.min(1, (elapsedStage - 1.5) / 1.0)) : 0;
        const swayAngle = Math.sin(timeSec * 1.05) * 0.025 * flowerSettled;

        // Update 3D interactive flower rotation & inertia
        const f3d = flower3DRef.current;
        if (activeStage === 'flower') {
          if (!f3d.isDragging) {
            f3d.rotY += f3d.velY;
            f3d.rotX = Math.max(-1.15, Math.min(1.15, f3d.rotX + f3d.velX));
            const damping = Math.pow(0.035, dt);
            f3d.velX *= damping;
            f3d.velY *= damping;
            // Subtle gentle hover tilt when moving mouse or resting
            const targetHoverY =
              pointerRef.current.active && !prefersReducedMotion
                ? ((pointerRef.current.x - cx) / Math.max(1, width * 0.5)) * 0.24
                : Math.sin(timeSec * 0.55) * 0.08 * flowerSettled;
            const targetHoverX =
              pointerRef.current.active && !prefersReducedMotion
                ? ((pointerRef.current.y - height * 0.37) / Math.max(1, height * 0.5)) * 0.18
                : 0;
            const lerpHover = 1 - Math.pow(0.015, dt);
            f3d.hoverTiltY += (targetHoverY - f3d.hoverTiltY) * lerpHover;
            f3d.hoverTiltX += (targetHoverX - f3d.hoverTiltX) * lerpHover;
          }
          f3d.touchRipple *= Math.pow(0.04, dt);
        }

        const effectiveRotY = f3d.rotY + (f3d.isDragging ? 0 : f3d.hoverTiltY);
        const effectiveRotX = Math.max(
          -1.25,
          Math.min(1.25, f3d.rotX + (f3d.isDragging ? 0 : f3d.hoverTiltX)),
        );
        const cosRotY = Math.cos(effectiveRotY);
        const sinRotY = Math.sin(effectiveRotY);
        const cosRotX = Math.cos(effectiveRotX);
        const sinRotX = Math.sin(effectiveRotX);
        const focalLength = 540;

        const projZArr = projZRef.current;
        const drawOrder = drawOrderRef.current;
        let envFillCounter = 0;

        // Precompute shared 3D parameters for opening stage (used for both particles & front pocket occluder)
        const openEnvW = Math.min(width * 0.72, 340);
        const openEnvH = openEnvW * 0.64;
        const openEnvCY = height * 0.40;
        const openEnvTopY = openEnvCY - openEnvH / 2;
        const openBodySettle = easeInOutCubic(Math.min(1, elapsedStage / 0.55));
        const openHandoffT = easeInOutCubic(Math.max(0, Math.min(1, (elapsedStage - 1.88) / 0.62)));
        const openBodyOffsetY = openBodySettle * 24 - openHandoffT * 10;
        const openCenterY = openEnvCY + openBodyOffsetY;
        const openHingeY = openEnvTopY + openBodyOffsetY;
        const openPitchX = prefersReducedMotion
          ? 0
          : Math.sin(Math.min(1, elapsedStage / 2.2) * Math.PI) * -0.15;
        const cosOpenPitch = Math.cos(openPitchX);
        const sinOpenPitch = Math.sin(openPitchX);
        const openFocal = 560;
        const openDepthRamp = Math.min(1, elapsedStage / 0.18);
        const openFlapT = prefersReducedMotion
          ? 1
          : easeInOutCubic(Math.max(0, Math.min(1, (elapsedStage - 0.16) / 0.90)));
        const openLetterT = prefersReducedMotion
          ? 1
          : easeOutQuart(Math.max(0, Math.min(1, (elapsedStage - 0.62) / 1.18)));

        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];
          p.prevX = p.x;
          p.prevY = p.y;
          p.depthShade = 1;

          if (activeStage === 'envelope') {
            const tgt = targets.envelope[i];
            const morphDur = prefersReducedMotion ? 0.5 : 2.1;
            const delay = tgt.phase * 0.42;
            const localT = Math.max(0, Math.min(1, (elapsedStage - delay) / (morphDur - 0.42)));
            const eased = easeInOutCubic(localT);

            let tx = tgt.x;
            let ty = tgt.y;

            if (tgt.role === 'heart') {
              const heartCenterY = height * 0.40 + Math.min(width * 0.72, 340) * 0.64 * 0.05;
              const boost = 1 + heartbeat + (hoveredEnvelopeRef.current ? 0.05 : 0);
              tx = cx + (tx - cx) * boost;
              ty = heartCenterY + (ty - heartCenterY) * boost;
            } else if (hoveredEnvelopeRef.current) {
              ty -= 4;
            }

            const gatherSwirl = Math.sin(localT * Math.PI) * 26 * (i % 2 === 0 ? 1 : -1);
            const breatheX = Math.cos(timeSec * 1.3 + p.twinklePhase) * p.jitterAmp * 0.6;
            const breatheY = Math.sin(timeSec * 1.5 + p.twinklePhase) * p.jitterAmp * 0.6;

            p.x = p.startX + (tx + breatheX - p.startX) * eased + gatherSwirl * (1 - localT);
            p.y = p.startY + (ty + breatheY - p.startY) * eased;
            p.z = 0;
            p.r = p.startR + (tgt.r - p.startR) * eased;
            p.g = p.startG + (tgt.g - p.startG) * eased;
            p.b = p.startB + (tgt.b - p.startB) * eased;
            p.size = p.startSize + (tgt.size - p.startSize) * eased;
          } else if (activeStage === 'opening') {
            const tgt = targets.envelope[i];

            let localX = tgt.x;
            let localY = tgt.y + openBodyOffsetY;
            let localZ = 0;
            let tr = tgt.r;
            let tg = tgt.g;
            let tb = tgt.b;
            let tSize = tgt.size;

            if (tgt.role === 'envelope') {
              // Back top lip sits behind emerging letter; front V-pocket walls sit cleanly in front
              const isTopLip = tgt.y <= openEnvTopY + 5;
              localZ = (isTopLip ? -3.5 : 4.5) * openDepthRamp;
            } else if (tgt.role === 'flap') {
              // Hinge strictly along (x, openHingeY, 0) so corners stay 100% locked; swing 0 -> 187 deg to rest behind letter
              const theta = openFlapT * Math.PI * 1.04;
              const dyFromHinge = Math.max(0, tgt.y - openEnvTopY);
              const hingeBlend = Math.min(1, dyFromHinge / 10);

              localX = tgt.x;
              localY = openHingeY + dyFromHinge * Math.cos(theta);
              localZ =
                (dyFromHinge * Math.sin(theta) +
                  ((1 - openFlapT) * 4.8 - openFlapT * 2.5) * hingeBlend) *
                openDepthRamp *
                (1 - openHandoffT);

              // Warm light sheen across crest + gentle dim once folded behind letter
              const crestLight = Math.max(0, Math.sin(theta));
              const flapDim = 1 - 0.48 * openLetterT;
              tr = Math.min(255, (tgt.r + crestLight * 26) * flapDim);
              tg = Math.min(255, (tgt.g + crestLight * 115) * flapDim);
              tb = Math.min(255, (tgt.b + crestLight * 95) * flapDim);
              tSize = tgt.size * (1 + crestLight * 0.16) * (1 - 0.15 * openLetterT);
            } else if (tgt.role === 'heart') {
              // Unified wax-seal pulse followed by graceful upward rose-gold ember plume
              const heartCenterY = openCenterY + openEnvH * 0.05;
              const pulseT = Math.min(1, elapsedStage / 0.30);
              const normY = Math.max(
                0,
                Math.min(1, (tgt.y - (openEnvCY - openEnvH * 0.25)) / Math.max(1, openEnvH * 0.45)),
              );
              const unlockT = easeOutQuart(
                Math.max(0, Math.min(1, (elapsedStage - (0.18 + normY * 0.16)) / 1.15)),
              );
              const pulseBoost = 1 + Math.sin(pulseT * Math.PI) * 0.16;
              const relX = (tgt.x - cx) * (pulseBoost + unlockT * 0.18);
              const relY = (tgt.y + openBodyOffsetY - heartCenterY) * pulseBoost;

              const driftX = Math.sin(unlockT * Math.PI * 1.4 + tgt.phase * 6.0) * 14 * unlockT;
              const riseY = unlockT * (openEnvH * 0.88 + normY * 18);

              localX = cx + relX + driftX;
              localY = heartCenterY + relY - riseY;
              localZ = (6 + Math.sin(pulseT * Math.PI) * 9 + unlockT * 8) * openDepthRamp;

              tr = tgt.r + (255 - tgt.r) * unlockT * 0.65;
              tg = tgt.g + (208 - tgt.g) * unlockT * 0.72;
              tb = tgt.b + (202 - tgt.b) * unlockT * 0.68;
              tSize = tgt.size * (1 + Math.sin(pulseT * Math.PI) * 0.12 - unlockT * 0.34);
            } else if (tgt.role === 'envelopeFill') {
              // Crisp rounded-corner love letter card with mini heart crest & 3 cursive script lines
              const fillIdx = envFillCounter++;
              const fillTotal = Math.max(1, targets.envelopeFillCount);
              const u = fillIdx / Math.max(1, fillTotal - 1);

              const cardW = openEnvW * 0.74;
              const cardH = openEnvH * 0.88;
              const cardCX = cx;
              const cardRestCY = openCenterY + openEnvH * 0.04;

              let cardX = cardCX;
              let cardY = cardRestCY;
              let targetR = 255;
              let targetG = 245;
              let targetB = 224;
              let targetDotSize = 1.25;

              if (u < 0.44) {
                // Crisp rounded-rectangle letter border
                const pFrac = u / 0.44;
                const halfW = cardW * 0.5;
                const halfH = cardH * 0.5;
                const perim = 2 * (cardW + cardH);
                const d = pFrac * perim;
                if (d < cardW) {
                  cardX = cardCX - halfW + d;
                  cardY = cardRestCY - halfH;
                } else if (d < cardW + cardH) {
                  cardX = cardCX + halfW;
                  cardY = cardRestCY - halfH + (d - cardW);
                } else if (d < 2 * cardW + cardH) {
                  cardX = cardCX + halfW - (d - cardW - cardH);
                  cardY = cardRestCY + halfH;
                } else {
                  cardX = cardCX - halfW;
                  cardY = cardRestCY + halfH - (d - 2 * cardW - cardH);
                }
                // Soft rounded corner chamfer
                const cornerX = Math.max(0, Math.abs(cardX - cardCX) - (halfW - 10));
                const cornerY = Math.max(0, Math.abs(cardY - cardRestCY) - (halfH - 10));
                if (cornerX > 0 && cornerY > 0) {
                  const cr = Math.hypot(cornerX, cornerY);
                  if (cr > 0.001) {
                    cardX =
                      cardCX +
                      Math.sign(cardX - cardCX) * (halfW - 10 + (cornerX / cr) * 10);
                    cardY =
                      cardRestCY +
                      Math.sign(cardY - cardRestCY) * (halfH - 10 + (cornerY / cr) * 10);
                  }
                }
                targetR = 255;
                targetG = 246;
                targetB = 226;
                targetDotSize = 1.32;
              } else if (u < 0.60) {
                // Tiny glowing rose-red heart emblem centered near the top of the letter
                const hFrac = (u - 0.44) / 0.16;
                const ht = hFrac * Math.PI * 2;
                const hScale = openEnvW * 0.0023;
                const hx = 16 * Math.pow(Math.sin(ht), 3);
                const hy = -(
                  13 * Math.cos(ht) -
                  5 * Math.cos(2 * ht) -
                  2 * Math.cos(3 * ht) -
                  Math.cos(4 * ht)
                );
                cardX = cardCX + hx * hScale;
                cardY = cardRestCY - cardH * 0.23 + hy * hScale;
                targetR = 255;
                targetG = 78;
                targetB = 108;
                targetDotSize = 1.25;
              } else if (u < 0.86) {
                // Three graceful calligraphic script lines below the mini-heart
                const sFrac = (u - 0.60) / 0.26;
                const lineIdx = Math.min(2, Math.floor(sFrac * 3));
                const lineT = (sFrac * 3) - lineIdx;
                const spans = [0.62, 0.54, 0.36];
                const spanW = cardW * spans[lineIdx];
                const waveY =
                  Math.sin(lineT * 17 + lineIdx * 1.4) * 2.1 +
                  Math.cos(lineT * 7.5) * 0.9;
                cardX = cardCX + (lineT - 0.5) * spanW;
                cardY = cardRestCY + (-0.01 + lineIdx * 0.12) * cardH + waveY;
                targetR = 255;
                targetG = 224;
                targetB = 176;
                targetDotSize = 1.18;
              } else {
                // Subtle warm parchment shimmer inside the card
                const gFrac = (u - 0.86) / 0.14;
                const gx = (((fillIdx * 37) % 100) / 100 - 0.5) * cardW * 0.82;
                const gy = (gFrac - 0.5) * cardH * 0.78;
                cardX = cardCX + gx;
                cardY = cardRestCY + gy;
                targetR = 255;
                targetG = 240;
                targetB = 214;
                targetDotSize = 0.92;
              }

              const liftY = openLetterT * (openEnvH * 0.66);
              localX = tgt.x + (cardX - tgt.x) * openLetterT;
              localY =
                tgt.y + openBodyOffsetY + (cardY - liftY - (tgt.y + openBodyOffsetY)) * openLetterT;
              localZ = 1.0 * openDepthRamp;

              tr = tgt.r + (targetR - tgt.r) * openLetterT;
              tg = tgt.g + (targetG - tgt.g) * openLetterT;
              tb = tgt.b + (targetB - tgt.b) * openLetterT;
              tSize = tgt.size + (targetDotSize - tgt.size) * openLetterT;
            }

            // Apply gentle 3D envelope pitch around (cx, openCenterY, 0) + perspective
            const relLY = localY - openCenterY;
            const rotY3D = relLY * cosOpenPitch - localZ * sinOpenPitch;
            const rotZ3D = relLY * sinOpenPitch + localZ * cosOpenPitch;

            // Smooth spiral dissolve at handoffT (1.88s..2.50s) directly into circulating vortex
            let handoffX = localX;
            let handoffY = openCenterY + rotY3D;
            if (openHandoffT > 0) {
              const dxH = handoffX - cx;
              const dyH = handoffY - openCenterY;
              const swirlA = openHandoffT * openHandoffT * 1.15;
              const cosH = Math.cos(swirlA);
              const sinH = Math.sin(swirlA);
              const radBoost = 1 + openHandoffT * 0.22;
              handoffX = cx + (dxH * cosH - dyH * sinH) * radBoost;
              handoffY = openCenterY + (dxH * sinH + dyH * cosH) * radBoost - openHandoffT * 12;

              tr = tr + (255 - tr) * openHandoffT * 0.8;
              tg = tg + (76 - tg) * openHandoffT * 0.8;
              tb = tb + (98 - tb) * openHandoffT * 0.8;
            }

            const persp = openFocal / (openFocal - Math.min(openFocal * 0.65, rotZ3D));
            const projX = cx + (handoffX - cx) * persp;
            const projY = openCenterY + (handoffY - openCenterY) * persp;

            const shimmerX = Math.cos(timeSec * 1.8 + p.twinklePhase) * 0.32;
            const shimmerY = Math.sin(timeSec * 1.8 + p.twinklePhase) * 0.32;

            p.x = projX + shimmerX;
            p.y = projY + shimmerY;
            p.z = rotZ3D;
            p.r = tr;
            p.g = tg;
            p.b = tb;
            p.size = tSize * persp;
            p.depthShade = Math.max(0.78, Math.min(1.12, 0.95 + (rotZ3D / 90) * 0.16));
            // Sort by structural envelope layer Z so pitched bottom pocket never mis-sorts behind top of letter
            projZArr[i] = localZ;
          } else if (activeStage === 'circulating') {
            const swirlFactor = prefersReducedMotion ? 0.35 : 1;
            const accel = Math.min(1, elapsedStage / 0.40);
            p.orbitSpinOffset += p.orbitSpeed * accel * swirlFactor * dt;

            // Smoothly disperse particles into exact 360-degree uniform orbital slots
            const slotBlend = easeInOutCubic(Math.min(1, elapsedStage / 0.68));
            const baseAngle =
              p.orbitStartAngle + (p.orbitTargetAngle - p.orbitStartAngle) * slotBlend;
            p.orbitAngle = baseAngle + p.orbitSpinOffset;

            const radiusEase = Math.min(1, elapsedStage / 0.95);
            const baseR =
              p.orbitRadius + (p.orbitTargetRadius - p.orbitRadius) * easeInOutCubic(radiusEase);
            const breathingR = baseR + Math.sin(timeSec * 3.2 + p.orbitWaveOffset) * 8;

            p.x = cx + Math.cos(p.orbitAngle) * breathingR;
            p.y = cy + Math.sin(p.orbitAngle) * breathingR * 0.78;
            p.z = 0;

            const colorT = Math.min(1, elapsedStage / 0.85);
            const targetR = 255;
            const targetG = 66 + Math.sin(p.orbitAngle * 2 + i * 0.05) * 30;
            const targetB = 92 + Math.cos(p.orbitAngle * 2 + i * 0.05) * 32;
            p.r = p.startR + (targetR - p.startR) * colorT;
            p.g = p.startG + (targetG - p.startG) * colorT;
            p.b = p.startB + (targetB - p.startB) * colorT;
            p.size = p.startSize + (1.62 - p.startSize) * colorT;
          } else if (activeStage === 'name') {
            const tgt = targets.name[i];
            const totalMorph = prefersReducedMotion ? 0.5 : 1.75;
            const delay = tgt.phase * 0.38;
            const localT = Math.max(0, Math.min(1, (elapsedStage - delay) / (totalMorph - 0.38)));
            const eased = easeInOutCubic(localT);

            const swirlArc = Math.sin(localT * Math.PI) * 28 * (i % 2 === 0 ? 1 : -1);
            const shimmerX = Math.cos(timeSec * 1.4 + p.twinklePhase) * 0.35 * eased;
            const shimmerY = Math.sin(timeSec * 1.6 + p.twinklePhase) * 0.35 * eased;

            p.x = p.startX + (tgt.x - p.startX) * eased + swirlArc * (1 - localT) + shimmerX;
            p.y = p.startY + (tgt.y - p.startY) * eased + shimmerY;
            p.z = 0;
            p.r = p.startR + (tgt.r - p.startR) * eased;
            p.g = p.startG + (tgt.g - p.startG) * eased;
            p.b = p.startB + (tgt.b - p.startB) * eased;
            p.size = p.startSize + (tgt.size - p.startSize) * eased;
          } else if (activeStage === 'flower') {
            const tgt = targets.flower[i];
            const { scale, flowerCY, stemStartY, stemEndY, pivotY } = getChamomileMetrics(
              width,
              height,
            );

            // Gentle botanical sway once bloom finishes
            const dxSway = tgt.x - cx;
            const dySway = tgt.y - pivotY;
            const cosS = Math.cos(swayAngle);
            const sinS = Math.sin(swayAngle);
            const swayedX = cx + dxSway * cosS - dySway * sinS;
            const swayedY = pivotY + dxSway * sinS + dySway * cosS;
            const targetZ = tgt.z ?? 0;

            let desiredX = swayedX;
            let desiredY = swayedY;
            let desiredZ = targetZ;
            let desiredR = tgt.r;
            let desiredG = tgt.g;
            let desiredB = tgt.b;
            let desiredSize = tgt.size;

            if (!prefersReducedMotion && elapsedStage < 3.4) {
              const growInfo = tgt.grow;
              const stemRiseProgress = easeInOutCubic(
                Math.max(0, Math.min(1, (elapsedStage - 0.30) / 1.25)),
              );
              const tipY = stemEndY - stemRiseProgress * (stemEndY - stemStartY);
              const tipX =
                cx +
                Math.sin((1 - stemRiseProgress) * Math.PI * 1.15) * (scale * 0.085);

              if (growInfo?.kind === 'stem') {
                const sp = growInfo.stemProgress ?? 0;
                if (stemRiseProgress < sp) {
                  desiredX = tipX + (tgt.x - cx) * 0.25;
                  desiredY = tipY;
                  desiredZ = targetZ * 0.25;
                  desiredSize = tgt.size * 0.9;
                } else {
                  const lockT = Math.max(
                    0,
                    Math.min(1, (elapsedStage - (0.30 + sp * 1.15)) / 0.35),
                  );
                  desiredX = tipX + (swayedX - tipX) * lockT;
                  desiredY = tipY + (swayedY - tipY) * lockT;
                  desiredZ = targetZ * lockT;
                }
              } else if (growInfo?.kind === 'leaf') {
                const nodeH = growInfo.stemProgress ?? 0.5;
                const ax = growInfo.attachX ?? cx;
                const ay = growInfo.attachY ?? stemEndY;
                if (stemRiseProgress < nodeH) {
                  desiredX = tipX;
                  desiredY = tipY;
                  desiredZ = -10;
                  desiredSize = tgt.size * 0.75;
                } else {
                  const leafGrowT = easeOutQuart(
                    Math.max(0, Math.min(1, (elapsedStage - (0.30 + nodeH * 1.15)) / 0.75)),
                  );
                  desiredX = ax + (swayedX - ax) * leafGrowT;
                  desiredY = ay + (swayedY - ay) * leafGrowT;
                  desiredZ = -10 + (targetZ + 10) * leafGrowT;
                }
              } else if (growInfo?.kind === 'center') {
                const budT = easeOutQuart(
                  Math.max(0, Math.min(1, (elapsedStage - 1.10) / 1.0)),
                );
                const budScale = 0.16 + 0.84 * budT;
                const headY = elapsedStage < 1.55 ? tipY : flowerCY;
                const headX = elapsedStage < 1.55 ? tipX : cx;
                desiredX = headX + (swayedX - cx) * budScale;
                desiredY = headY + (swayedY - flowerCY) * budScale;
                desiredZ = targetZ * budScale;
                desiredR = 165 + (tgt.r - 165) * budT;
                desiredG = 215 + (tgt.g - 215) * budT;
                desiredB = 95 + (tgt.b - 95) * budT;
              } else if (growInfo?.kind === 'petal') {
                const pIdx = growInfo.petalIndex ?? 0;
                const petalDelay = 1.48 + (pIdx % 6) * 0.045;
                const bloomT = easeInOutCubic(
                  Math.max(0, Math.min(1, (elapsedStage - petalDelay) / 1.35)),
                );
                const targetAngle = growInfo.petalAngle ?? 0;
                let deltaA = targetAngle - -Math.PI / 2;
                while (deltaA > Math.PI) deltaA -= Math.PI * 2;
                while (deltaA < -Math.PI) deltaA += Math.PI * 2;
                const currentAngle = -Math.PI / 2 + deltaA * bloomT;

                const headY = elapsedStage < 1.55 ? tipY : flowerCY;
                const headX = elapsedStage < 1.55 ? tipX : cx;
                const radialExtend = 0.14 + 0.86 * bloomT;

                const relX = swayedX - cx;
                const relY = swayedY - flowerCY;
                const rDist = Math.hypot(relX, relY) * radialExtend;
                const rotDiff = currentAngle - targetAngle;
                const finalAngle = Math.atan2(relY, relX) + rotDiff;

                desiredX = headX + Math.cos(finalAngle) * rDist;
                desiredY = headY + Math.sin(finalAngle) * rDist;
                // Folded bud sticks subtly forward before blooming outward into 3D arch
                desiredZ = (1 - bloomT) * 14 + targetZ * bloomT;
                desiredSize = tgt.size * (0.65 + 0.35 * bloomT);
              }
            }

            // Apply 3D rotation around the blossom center (cx, flowerCY, 0) + zoom & touch ripple
            const rippleLift = f3d.touchRipple * 8 * Math.sin((tgt.phase || 0) * Math.PI);
            const lx = (desiredX - cx) * f3d.zoom;
            const ly = (desiredY - flowerCY) * f3d.zoom;
            const lz = (desiredZ + rippleLift) * f3d.zoom;

            // Rotate around Y then X
            const rx1 = lx * cosRotY + lz * sinRotY;
            const rz1 = -lx * sinRotY + lz * cosRotY;
            const ry2 = ly * cosRotX - rz1 * sinRotX;
            const rz2 = ly * sinRotX + rz1 * cosRotX;

            const clampedZ = Math.min(focalLength * 0.72, rz2);
            const persp = focalLength / (focalLength - clampedZ);
            const projX = cx + rx1 * persp;
            const projY = flowerCY + ry2 * persp;

            const introBlend = prefersReducedMotion
              ? easeInOutCubic(Math.min(1, elapsedStage / 0.6))
              : easeInOutCubic(Math.min(1, elapsedStage / 0.72));
            const swirlArc = Math.sin(introBlend * Math.PI) * 18 * (i % 2 === 0 ? 1 : -1);
            const shimmerX = Math.cos(timeSec * 1.2 + p.twinklePhase) * 0.5;
            const shimmerY = Math.sin(timeSec * 1.4 + p.twinklePhase) * 0.5;

            p.x = p.startX + (projX - p.startX) * introBlend + swirlArc * (1 - introBlend) + shimmerX;
            p.y = p.startY + (projY - p.startY) * introBlend + shimmerY;
            p.z = p.startZ + (clampedZ - p.startZ) * introBlend;
            p.r = p.startR + (desiredR - p.startR) * introBlend;
            p.g = p.startG + (desiredG - p.startG) * introBlend;
            p.b = p.startB + (desiredB - p.startB) * introBlend;
            p.size = p.startSize + (desiredSize * persp - p.startSize) * introBlend;
            p.depthShade = Math.max(0.65, Math.min(1.08, 0.88 + (clampedZ / 160) * 0.25));
            projZArr[i] = p.z;
          }

          // Pointer gentle ripple when hovering or touching near particles
          if (pointerRef.current.active && activeStage !== 'circulating' && !f3d.isDragging) {
            const pdx = p.x - pointerRef.current.x;
            const pdy = p.y - pointerRef.current.y;
            const distSq = pdx * pdx + pdy * pdy;
            const hitRadius = activeStage === 'flower' ? 78 : 62;
            if (distSq < hitRadius * hitRadius && distSq > 1) {
              const dist = Math.sqrt(distSq);
              const push = (1 - dist / hitRadius) * (activeStage === 'flower' ? 9.5 : 5.0);
              p.x += (pdx / dist) * push;
              p.y += (pdy / dist) * push;
            }
          }
        }

        // Back-to-front depth sort in 3D opening & flower modes for authentic occlusion
        if (activeStage === 'flower' || activeStage === 'opening') {
          drawOrder.sort((a, b) => projZArr[a] - projZArr[b]);
        }

        const isGatheringEnvelope = activeStage === 'envelope' && elapsedStage < 2.2;
        const isOpeningEnvelope = activeStage === 'opening';
        const isGrowingFlower = activeStage === 'flower' && elapsedStage < 3.0;
        let pocketOccluded = false;

        const projectPocketPoint = (lx: number, ly: number, lz: number) => {
          const relY = ly - openCenterY;
          const ry = relY * cosOpenPitch - lz * sinOpenPitch;
          const rz = relY * sinOpenPitch + lz * cosOpenPitch;
          const pr = openFocal / (openFocal - Math.min(openFocal * 0.65, rz));
          return {
            x: cx + (lx - cx) * pr,
            y: openCenterY + ry * pr,
          };
        };

        ctx.save();
        ctx.translate(0, -scrollY);

        for (let k = 0; k < particles.length; k++) {
          const i = activeStage === 'flower' || activeStage === 'opening' ? drawOrder[k] : k;
          const p = particles[i];

          // Draw dark velvet front-pocket occluder cleanly between letter (z ~ 1) and front pocket walls (z ~ 4.5)
          if (isOpeningEnvelope && !pocketOccluded && projZArr[i] >= 3.2 * openDepthRamp && openHandoffT < 0.92) {
            pocketOccluded = true;
            const halfW = openEnvW * 0.5;
            const bottomY = openCenterY + openEnvH * 0.5;
            const notchY = openCenterY + openEnvH * 0.04;
            const pTL = projectPocketPoint(cx - halfW, openHingeY, 3.6 * openDepthRamp);
            const pV = projectPocketPoint(cx, notchY, 3.6 * openDepthRamp);
            const pTR = projectPocketPoint(cx + halfW, openHingeY, 3.6 * openDepthRamp);
            const pBR = projectPocketPoint(cx + halfW, bottomY, 3.6 * openDepthRamp);
            const pBL = projectPocketPoint(cx - halfW, bottomY, 3.6 * openDepthRamp);

            ctx.beginPath();
            ctx.moveTo(pTL.x, pTL.y);
            ctx.lineTo(pV.x, pV.y);
            ctx.lineTo(pTR.x, pTR.y);
            ctx.lineTo(pBR.x, pBR.y);
            ctx.lineTo(pBL.x, pBL.y);
            ctx.closePath();
            ctx.fillStyle = `rgba(9, 11, 22, ${0.92 * (1 - openHandoffT)})`;
            ctx.fill();
          }

          const twinkle = 0.78 + 0.22 * Math.sin(timeSec * 2.6 + p.twinklePhase);
          const shade = p.depthShade;
          const pr = Math.min(255, Math.round(p.r * shade));
          const pg = Math.min(255, Math.round(p.g * shade));
          const pb = Math.min(255, Math.round(p.b * shade));

          const drawSize = Math.max(0.05, p.size);

          // Draw silky velocity trail while circulating, gathering/opening envelope, or sprouting flower
          if ((activeStage === 'circulating' || isGatheringEnvelope || isOpeningEnvelope || isGrowingFlower) && !prefersReducedMotion) {
            ctx.beginPath();
            ctx.moveTo(p.prevX, p.prevY);
            ctx.lineTo(p.x, p.y);
            ctx.strokeStyle = `rgba(${pr}, ${pg}, ${pb}, ${(activeStage === 'circulating' ? 0.4 : isOpeningEnvelope ? 0.18 : 0.24) * twinkle})`;
            ctx.lineWidth = isOpeningEnvelope ? drawSize * 0.9 : drawSize * 1.2;
            ctx.stroke();
          }

          // Soft red glowing halo around envelope, circulating circle, and slender Hamidabonu particles
          if (activeStage !== 'flower' && i % (activeStage === 'name' ? 6 : 4) === 0) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, drawSize * (activeStage === 'name' ? 2.4 : 3.1), 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 52, 86, ${(activeStage === 'name' ? 0.08 : activeStage === 'circulating' ? 0.14 : 0.11) * twinkle})`;
            ctx.fill();
          }

          ctx.beginPath();
          ctx.arc(p.x, p.y, drawSize, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${pr}, ${pg}, ${pb}, ${0.94 * twinkle})`;
          ctx.fill();
        }
        ctx.restore();
      }

      // 4. Floating golden pollen sparkles during the chamomile flower bloom
      if (activeStage === 'flower' && elapsedStage > 2.1) {
        ctx.save();
        ctx.translate(0, -scrollY);
        const pollenAlphaScale = Math.min(1, (elapsedStage - 2.1) / 1.2);
        const pollen = pollenRef.current;
        for (let i = 0; i < pollen.length; i++) {
          const m = pollen[i];
          m.x += m.vx + Math.sin(timeSec + m.phase) * 0.18;
          m.y += m.vy;
          if (m.y < height * 0.14) {
            m.y = height * 0.56;
            m.x = cx + (Math.random() - 0.5) * 260;
          }
          const glow = (0.5 + 0.5 * Math.sin(timeSec * 2.4 + m.phase)) * m.alpha * pollenAlphaScale;
          ctx.beginPath();
          ctx.arc(m.x, m.y, Math.max(0.05, m.size), 0, Math.PI * 2);
          ctx.fillStyle = `rgba(253, 224, 71, ${glow})`;
          ctx.fill();
        }
        ctx.restore();
      }

      animationFrameId = requestAnimationFrame(renderFrame);
    };

    animationFrameId = requestAnimationFrame(renderFrame);

    return () => {
      isDisposed = true;
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('pointermove', onWindowPointerMove);
      window.removeEventListener('mouseout', onWindowPointerOut);
    };
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        aria-label="Interactive space particle canvas"
        className="pointer-events-none fixed inset-0 z-0 block h-full w-full"
      />

      {/* Hero-scoped interactive hitboxes so page scroll works seamlessly outside the centerpiece */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[100svh]">
        {stage === 'envelope' && (
          <button
            type="button"
            aria-label="Open the envelope"
            onClick={() => onOpenRef.current()}
            onPointerEnter={() => {
              hoveredEnvelopeRef.current = true;
            }}
            onPointerLeave={() => {
              hoveredEnvelopeRef.current = false;
            }}
            className="pointer-events-auto absolute left-1/2 top-[40%] h-[min(46vw,230px)] w-[min(78vw,360px)] -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-2xl bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/60"
          />
        )}

        {stage === 'flower' && (
          <div
            aria-label="Interactive 3D chamomile flower"
            style={{ touchAction: 'none' }}
            className="pointer-events-auto absolute left-1/2 top-[6%] h-[56%] w-[min(86vw,390px)] -translate-x-1/2 cursor-grab active:cursor-grabbing"
            onPointerDown={(e) => {
              const f3d = flower3DRef.current;
              f3d.isDragging = true;
              f3d.lastX = e.clientX;
              f3d.lastY = e.clientY;
              f3d.velX = 0;
              f3d.velY = 0;
              f3d.touchRipple = 1;
              try {
                e.currentTarget.setPointerCapture(e.pointerId);
              } catch {
                // Ignore capture errors on synthetic events
              }
              onFlowerInteractRef.current?.();
            }}
            onPointerMove={(e) => {
              const f3d = flower3DRef.current;
              if (!f3d.isDragging) return;
              const dx = e.clientX - f3d.lastX;
              const dy = e.clientY - f3d.lastY;
              f3d.lastX = e.clientX;
              f3d.lastY = e.clientY;
              f3d.rotY += dx * 0.0095;
              f3d.rotX = Math.max(-1.15, Math.min(1.15, f3d.rotX + dy * 0.0085));
              f3d.velY = dx * 0.0095;
              f3d.velX = dy * 0.0085;
            }}
            onPointerUp={(e) => {
              const f3d = flower3DRef.current;
              if (f3d.isDragging) {
                f3d.isDragging = false;
                try {
                  if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                    e.currentTarget.releasePointerCapture(e.pointerId);
                  }
                } catch {
                  // Ignore release errors
                }
              }
            }}
            onPointerCancel={() => {
              flower3DRef.current.isDragging = false;
            }}
          />
        )}
      </div>
    </>
  );
}
