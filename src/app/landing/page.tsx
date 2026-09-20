"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Calendar,
  Check,
  Clock,
  Copy,
  FileText,
  GraduationCap,
  Sparkles,
  Undo2,
} from "lucide-react";

/**
 * Marketing landing at /landing — dark cinematic one-pager (Huly/Apple style)
 * in Semester's own night palette. Ported from the standalone landing draft:
 * three.js particle-grid backdrop, CSS-3D timetable tilt, scroll reveals.
 * Scoped under `.lp` so nothing leaks into the app shell.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const LP_CSS = `
.lp {
  --lp-bg: #100e09; --lp-bg2: #14110b; --lp-panel: #1b1812; --lp-panel2: #211d15;
  --lp-line: #322c20; --lp-line-soft: #282317; --lp-ink: #ede7d7; --lp-soft: #a89f8a;
  --lp-faint: #7a7260; --lp-accent: #8fb99a; --lp-amber: #d9b95c; --lp-marker: #e08a63;
  --lp-radius: 18px;
  background: var(--lp-bg); color: var(--lp-ink);
  font-family: var(--font-instrument), system-ui, sans-serif;
  font-size: 16px; line-height: 1.6;
  -webkit-font-smoothing: antialiased; overflow-x: clip;
  min-height: 100dvh;
}
.lp ::selection { background: var(--lp-accent); color: #17150f; }
html:has(.lp) { scroll-behavior: smooth; }
.lp .wrap { max-width: 1180px; margin: 0 auto; padding: 0 28px; }
.lp .display { font-family: var(--font-fraunces), Georgia, serif; font-weight: 550; letter-spacing: -0.02em; line-height: 1.04; }
.lp .mono { font-family: var(--font-plex), monospace; }
.lp a { color: inherit; }

/* film grain */
.lp .grain {
  position: fixed; inset: 0; z-index: 90; pointer-events: none; opacity: .05;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E");
}

/* buttons */
.lp .btn {
  display: inline-flex; align-items: center; gap: 8px;
  border-radius: 12px; padding: 13px 24px;
  font-size: 15px; font-weight: 500; text-decoration: none; border: 1px solid transparent;
  transition: background .2s ease, border-color .2s ease, transform .12s ease, color .2s ease;
}
.lp .btn:active { transform: translateY(1px) scale(.99); }
.lp .btn-primary { background: var(--lp-ink); color: #17150f; }
.lp .btn-primary:hover { background: var(--lp-accent); }
.lp .btn-ghost { border-color: var(--lp-line); color: var(--lp-ink); background: rgba(255,255,255,.02); }
.lp .btn-ghost:hover { border-color: var(--lp-accent); color: var(--lp-accent); }

/* nav */
.lp .nav {
  position: fixed; top: 0; left: 0; right: 0; z-index: 50;
  background: color-mix(in srgb, var(--lp-bg) 72%, transparent);
  backdrop-filter: blur(14px) saturate(140%);
  -webkit-backdrop-filter: blur(14px) saturate(140%);
  border-bottom: 1px solid var(--lp-line-soft);
}
.lp .nav-inner { display: flex; align-items: center; gap: 28px; height: 66px; }
.lp .brand { display: flex; align-items: center; gap: 10px; text-decoration: none; font-family: var(--font-fraunces), Georgia, serif; font-weight: 600; font-size: 20px; letter-spacing: -0.02em; }
.lp .brand img { width: 26px; height: 26px; border-radius: 7px; }
.lp .nav-links { display: flex; align-items: center; gap: 24px; margin-left: auto; }
.lp .nav-links a:not(.nav-cta) { text-decoration: none; font-size: 14px; color: var(--lp-soft); transition: color .15s ease; }
.lp .nav-links a:not(.nav-cta):hover { color: var(--lp-ink); }
.lp .nav-cta { margin-left: 6px; padding: 9px 18px; font-size: 14px; }
@media (max-width: 720px) { .lp .nav-links a:not(.nav-cta) { display: none; } }

/* hero */
.lp .hero { position: relative; min-height: 100dvh; display: flex; align-items: center; padding: 120px 0 80px; overflow: hidden; }
.lp .hero::before {
  content: ""; position: absolute; inset: 0; pointer-events: none;
  background:
    radial-gradient(52% 42% at 78% 30%, rgba(143,185,154,.13), transparent 70%),
    radial-gradient(40% 34% at 18% 72%, rgba(217,185,92,.07), transparent 70%),
    radial-gradient(70% 55% at 50% 118%, rgba(49,99,63,.20), transparent 72%);
}
.lp .hero canvas#gl { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.lp .hero-grid { position: relative; z-index: 2; display: grid; grid-template-columns: 10fr 11fr; gap: 48px; align-items: center; width: 100%; }
.lp .hero h1 { font-size: clamp(38px, 4.6vw, 62px); }
.lp .hero h1 em { font-style: italic; font-weight: 500; color: var(--lp-accent); }
.lp .hero .lede { margin: 22px 0 32px; max-width: 44ch; font-size: 17px; color: var(--lp-soft); }
.lp .hero-ctas { display: flex; gap: 12px; flex-wrap: wrap; }
@media (max-width: 920px) {
  .lp .hero { padding-top: 108px; }
  .lp .hero-grid { grid-template-columns: 1fr; gap: 56px; }
}

/* 3D timetable */
.lp .stage { perspective: 1400px; display: flex; justify-content: center; padding: 10px 0 30px; }
.lp .tt3d {
  position: relative; width: min(480px, 100%); transform-style: preserve-3d;
  transform: rotateX(var(--rx, 10deg)) rotateY(var(--ry, -9deg)); will-change: transform;
}
.lp .tt3d .shadow {
  position: absolute; left: 8%; right: 8%; bottom: -42px; height: 90px;
  background: radial-gradient(50% 50% at 50% 50%, rgba(143,185,154,.22), transparent 70%);
  filter: blur(28px); transform: translateZ(-80px);
}
.lp .tt-card {
  background: linear-gradient(160deg, rgba(33,29,21,.92), rgba(20,17,11,.96));
  border: 1px solid var(--lp-line); border-radius: 20px; padding: 22px 22px 18px;
  box-shadow: inset 0 1px 0 rgba(237,231,215,.07), 0 40px 80px -40px rgba(0,0,0,.75);
  backdrop-filter: blur(6px);
}
.lp .tt-card .head { display: flex; align-items: baseline; justify-content: space-between; transform: translateZ(26px); }
.lp .tt-card .hello { font-family: var(--font-fraunces), Georgia, serif; font-size: 19px; font-weight: 550; }
.lp .tt-card .date { font-family: var(--font-plex), monospace; font-size: 10px; color: var(--lp-soft); letter-spacing: .14em; text-transform: uppercase; }
.lp .tt-grid { margin-top: 14px; border: 1px solid var(--lp-line); border-radius: 13px; overflow: hidden; background: rgba(16,14,9,.65); font-size: 11px; transform: translateZ(12px); }
.lp .tt-grid .row { display: grid; grid-template-columns: 26px 1fr 1fr 1fr; }
.lp .tt-grid .row > div { padding: 8px 9px; border-top: 1px solid var(--lp-line-soft); min-height: 38px; }
.lp .tt-grid .row.head > div { border-top: 0; font-family: var(--font-plex), monospace; font-size: 9px; letter-spacing: .1em; color: var(--lp-soft); text-transform: uppercase; background: rgba(35,30,20,.7); }
.lp .tt-grid .pd { font-family: var(--font-plex), monospace; color: var(--lp-faint); text-align: center; }
.lp .tt-grid .less b { display: block; font-size: 11.5px; }
.lp .tt-grid .less span { font-family: var(--font-plex), monospace; font-size: 9px; color: var(--lp-soft); }
.lp .tt-grid .cancelled { background: rgba(224,138,99,.09); }
.lp .tt-grid .cancelled b { text-decoration: line-through; text-decoration-color: var(--lp-marker); }
.lp .tt-grid .substituted { background: rgba(217,185,92,.09); }
.lp .chip { display: inline-block; margin-top: 3px; padding: 1.5px 7px; border-radius: 99px; font-family: var(--font-plex), monospace; font-size: 8.5px; border: 1px solid; }
.lp .chip.red { color: var(--lp-marker); border-color: rgba(224,138,99,.4); background: rgba(224,138,99,.1); }
.lp .chip.amb { color: var(--lp-amber); border-color: rgba(217,185,92,.4); background: rgba(217,185,92,.1); }
.lp .float-pane {
  position: absolute; padding: 11px 14px;
  background: linear-gradient(160deg, rgba(33,29,21,.96), rgba(20,17,11,.98));
  border: 1px solid var(--lp-line); border-radius: 13px;
  box-shadow: 0 24px 50px -24px rgba(0,0,0,.8), inset 0 1px 0 rgba(237,231,215,.06);
  backdrop-filter: blur(8px); font-size: 11.5px;
}
.lp .float-pane .k { display: block; font-family: var(--font-plex), monospace; font-size: 8.5px; letter-spacing: .12em; text-transform: uppercase; color: var(--lp-faint); margin-bottom: 3px; }
.lp .float-pane b { font-family: var(--font-fraunces), Georgia, serif; font-weight: 550; font-size: 15px; }
.lp .fp-stats { left: -34px; top: -30px; transform: translateZ(90px); display: flex; gap: 18px; }
.lp .fp-sub { right: -26px; bottom: -26px; transform: translateZ(70px); }
.lp .fp-sub b { color: var(--lp-amber); }
@media (max-width: 560px) { .lp .fp-stats { left: 0; top: -26px; } .lp .fp-sub { right: 0; bottom: -22px; } }
@media (prefers-reduced-motion: no-preference) {
  .lp .float-pane { animation: lp-bob 6s ease-in-out infinite; }
  .lp .fp-sub { animation-delay: -3s; }
  @keyframes lp-bob { 0%, 100% { translate: 0 0; } 50% { translate: 0 -8px; } }
}

/* sections */
.lp section { position: relative; padding: 110px 0; }
.lp .section-head { max-width: 58ch; margin-bottom: 52px; }
.lp .section-head h2 { font-size: clamp(30px, 3.6vw, 46px); margin-bottom: 14px; }
.lp .section-head p { color: var(--lp-soft); font-size: 16.5px; }
.lp .kicker { display: inline-block; margin-bottom: 16px; font-family: var(--font-plex), monospace; font-size: 11px; letter-spacing: .22em; text-transform: uppercase; color: var(--lp-accent); }

@media (prefers-reduced-motion: no-preference) {
  .lp .reveal { opacity: 0; transform: translateY(22px); transition: opacity .8s cubic-bezier(.16,1,.3,1), transform .8s cubic-bezier(.16,1,.3,1); transition-delay: var(--d, 0s); }
  .lp .reveal.in { opacity: 1; transform: none; }
}

/* screenshots */
.lp .shot-frame {
  border: 1px solid var(--lp-line); border-radius: 18px; overflow: hidden;
  background: linear-gradient(160deg, var(--lp-panel2), var(--lp-bg2));
  box-shadow: inset 0 1px 0 rgba(237,231,215,.07), 0 50px 100px -50px rgba(0,0,0,.85);
}
.lp .shot-frame img { display: block; width: 100%; height: auto; }
.lp .desk-shot { position: relative; }
.lp .desk-shot::before {
  content: ""; position: absolute; inset: -1px; pointer-events: none;
  background: radial-gradient(60% 55% at 50% 0%, rgba(143,185,154,.18), transparent 70%);
}

/* bento */
.lp .bento { display: grid; grid-template-columns: repeat(12, 1fr); gap: 16px; }
.lp .bento .cell {
  grid-column: span 4;
  background: linear-gradient(165deg, var(--lp-panel), var(--lp-bg2));
  border: 1px solid var(--lp-line); border-radius: var(--lp-radius);
  padding: 26px; display: flex; flex-direction: column; gap: 10px;
  position: relative; overflow: hidden;
  transition: border-color .25s ease, transform .25s ease;
}
.lp .bento .cell:hover { border-color: color-mix(in srgb, var(--lp-accent) 45%, var(--lp-line)); transform: translateY(-3px); }
.lp .cell.span7 { grid-column: span 7; }
.lp .cell.span5 { grid-column: span 5; }
.lp .cell.span12 { grid-column: span 12; flex-direction: row; align-items: center; justify-content: space-between; gap: 36px; }
.lp .cell .glow-top { position: absolute; inset: 0 0 auto 0; height: 1px; background: linear-gradient(90deg, transparent, rgba(143,185,154,.5), transparent); }
@media (max-width: 920px) {
  .lp .cell, .lp .cell.span7, .lp .cell.span5, .lp .cell.span12 { grid-column: span 12; }
  .lp .cell.span12 { flex-direction: column; align-items: stretch; }
}
.lp .cell .icon { width: 36px; height: 36px; border-radius: 10px; background: rgba(143,185,154,.1); border: 1px solid rgba(143,185,154,.22); display: grid; place-items: center; color: var(--lp-accent); }
.lp .cell h3 { font-family: var(--font-fraunces), Georgia, serif; font-weight: 550; font-size: 20px; margin-top: 4px; }
.lp .cell p { font-size: 14px; color: var(--lp-soft); }
.lp .grade-demo { margin-top: auto; display: flex; align-items: center; gap: 12px; border: 1px solid var(--lp-line); border-radius: 13px; background: rgba(16,14,9,.6); padding: 13px 15px; }
.lp .grade-demo .g { font-family: var(--font-plex), monospace; font-weight: 500; font-size: 16px; color: var(--lp-accent); }
.lp .grade-demo .bar { flex: 1; height: 4px; border-radius: 99px; background: linear-gradient(90deg, var(--lp-accent), var(--lp-amber), var(--lp-marker)); position: relative; }
.lp .grade-demo .bar i { position: absolute; top: -4.5px; left: 62%; width: 2.5px; height: 13px; border-radius: 2px; background: var(--lp-ink); }
.lp .grade-demo .pts { font-family: var(--font-plex), monospace; font-size: 10.5px; color: var(--lp-soft); }

/* sticky stack */
.lp .system { padding-bottom: 40px; }
.lp .stack { display: grid; gap: 28px; }
.lp .stack-card {
  position: sticky; top: 96px;
  background: linear-gradient(165deg, var(--lp-panel2), var(--lp-bg2));
  border: 1px solid var(--lp-line); border-radius: 22px; padding: 44px 48px;
  display: grid; grid-template-columns: 1fr auto; gap: 40px; align-items: center; min-height: 300px;
  box-shadow: 0 -18px 50px -30px rgba(0,0,0,.8);
}
.lp .stack-card:nth-child(2) { top: 118px; }
.lp .stack-card:nth-child(3) { top: 140px; }
.lp .stack-card .num { font-family: var(--font-plex), monospace; font-size: 12px; color: var(--lp-faint); letter-spacing: .18em; }
.lp .stack-card h3 { font-family: var(--font-fraunces), Georgia, serif; font-weight: 550; font-size: clamp(24px, 2.8vw, 34px); margin: 8px 0 12px; }
.lp .stack-card p { color: var(--lp-soft); font-size: 15.5px; max-width: 52ch; }
.lp .stack-card .glyph { width: 92px; height: 92px; border-radius: 24px; display: grid; place-items: center; color: var(--lp-accent); background: rgba(143,185,154,.07); border: 1px solid rgba(143,185,154,.2); }
.lp .stack-card.alt .glyph { color: var(--lp-amber); background: rgba(217,185,92,.07); border-color: rgba(217,185,92,.2); }
@media (max-width: 780px) {
  .lp .stack-card { grid-template-columns: 1fr; padding: 30px 26px; min-height: 240px; }
  .lp .stack-card .glyph { width: 64px; height: 64px; border-radius: 18px; }
}

/* CTA + footer */
.lp .cta { padding: 90px 0 110px; }
.lp .cta-box {
  position: relative; overflow: hidden; border-radius: 26px; padding: 64px 56px;
  background: radial-gradient(80% 120% at 85% -10%, rgba(143,185,154,.25), transparent 60%), linear-gradient(160deg, #1d2b20, #10130d);
  border: 1px solid rgba(143,185,154,.25);
  display: flex; align-items: center; justify-content: space-between; gap: 36px; flex-wrap: wrap;
}
.lp .cta-box h2 { font-family: var(--font-fraunces), Georgia, serif; font-weight: 550; font-size: clamp(28px, 3.4vw, 42px); color: var(--lp-ink); letter-spacing: -0.02em; }
.lp .cta-box p { color: var(--lp-soft); font-size: 15.5px; margin-top: 8px; max-width: 50ch; }
.lp .cta-box .btn-ghost { border-color: rgba(237,231,215,.3); background: transparent; }
.lp .cta-box .btn-ghost:hover { border-color: var(--lp-ink); color: var(--lp-ink); }
@media (max-width: 780px) { .lp .cta-box { padding: 44px 30px; } }
.lp .footer { border-top: 1px solid var(--lp-line-soft); padding: 30px 0 44px; color: var(--lp-soft); font-size: 13px; }
.lp .foot-inner { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; }
.lp .foot-inner .brand { font-size: 16px; }
.lp .foot-right { margin-left: auto; display: flex; gap: 20px; }
.lp .foot-inner a { text-decoration: none; }
.lp .foot-inner a:hover { color: var(--lp-ink); }
`;

type ThreeLike = {
  WebGLRenderer: new (opts: Record<string, unknown>) => {
    setPixelRatio: (v: number) => void;
    setSize: (w: number, h: number, updateStyle?: boolean) => void;
    setAnimationLoop: (fn: (() => void) | null) => void;
    render: (scene: unknown, camera: unknown) => void;
    dispose: () => void;
  };
  Scene: new () => unknown;
  FogExp2: new (color: number, density: number) => unknown;
  PerspectiveCamera: new (fov: number, aspect: number, near: number, far: number) => {
    aspect: number;
    position: { set: (x: number, y: number, z: number) => void };
    updateProjectionMatrix: () => void;
    lookAt: (x: number, y: number, z: number) => void;
  };
  Group: new () => { rotation: { x: number; y: number; z: number }; add: (o: unknown) => void };
  Points: new (geo: unknown, mat: unknown) => unknown;
  BufferGeometry: new () => { setAttribute: (k: string, v: unknown) => void };
  BufferAttribute: new (arr: Float32Array, size: number) => unknown;
  PointsMaterial: new (opts: Record<string, unknown>) => unknown;
  CanvasTexture: new (canvas: HTMLCanvasElement) => unknown;
  Clock: new () => { getElapsedTime: () => number };
  AdditiveBlending: number;
};

export default function LandingPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const ttRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  /* scroll reveals */
  useEffect(() => {
    const els = document.querySelectorAll(".lp .reveal");
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      els.forEach((el) => el.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.15 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  /* 3D timetable tilt */
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!matchMedia("(pointer: fine)").matches) return;
    const hero = heroRef.current;
    const tt = ttRef.current;
    if (!hero || !tt) return;
    let tx = 10, ty = -9, cx = 10, cy = -9;
    let raf: number | null = null;
    const tick = () => {
      cx += (tx - cx) * 0.07;
      cy += (ty - cy) * 0.07;
      tt.style.setProperty("--rx", cx.toFixed(2) + "deg");
      tt.style.setProperty("--ry", cy.toFixed(2) + "deg");
      if (Math.abs(tx - cx) > 0.01 || Math.abs(ty - cy) > 0.01) raf = requestAnimationFrame(tick);
      else raf = null;
    };
    const kick = () => {
      if (raf === null) raf = requestAnimationFrame(tick);
    };
    const move = (e: MouseEvent) => {
      const r = hero.getBoundingClientRect();
      tx = 10 - ((e.clientY - r.top) / r.height - 0.5) * 14;
      ty = -9 + ((e.clientX - r.left) / r.width - 0.5) * 16;
      kick();
    };
    const leave = () => {
      tx = 10;
      ty = -9;
      kick();
    };
    hero.addEventListener("mousemove", move);
    hero.addEventListener("mouseleave", leave);
    return () => {
      hero.removeEventListener("mousemove", move);
      hero.removeEventListener("mouseleave", leave);
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, []);

  /* WebGL particle-grid backdrop (three.js, UMD from CDN, graceful fallback) */
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    const cleanups: Array<() => void> = [];

    const start = (THREE: any) => {
      if (disposed) return;
      const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      const scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0x100e09, 0.045);
      const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 60);
      camera.position.set(0, 1.6, 7);

      const group = new THREE.Group();
      scene.add(group);

      const dotCanvas = document.createElement("canvas");
      dotCanvas.width = dotCanvas.height = 64;
      const dctx = dotCanvas.getContext("2d");
      if (!dctx) return;
      const grad = dctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, "rgba(255,255,255,1)");
      grad.addColorStop(0.35, "rgba(255,255,255,.55)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      dctx.fillStyle = grad;
      dctx.fillRect(0, 0, 64, 64);
      const dot = new THREE.CanvasTexture(dotCanvas);

      const cols = 90, rows = 34;
      const pos = new Float32Array(cols * rows * 3);
      let i = 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = (c / (cols - 1) - 0.5) * 30;
          const z = (r / (rows - 1) - 0.5) * 16;
          const y = -1.6 + Math.sin(x * 0.32) * 0.5 + Math.cos(z * 0.45) * 0.35;
          pos[i++] = x; pos[i++] = y; pos[i++] = z;
        }
      }
      const gridGeo = new THREE.BufferGeometry();
      gridGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      group.add(new THREE.Points(gridGeo, new THREE.PointsMaterial({
        color: 0x8fb99a, size: 0.07, map: dot, transparent: true, opacity: 0.55,
        blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
      })));

      const starN = 130;
      const starPos = new Float32Array(starN * 3);
      for (let s = 0; s < starN; s++) {
        starPos[s * 3] = (Math.random() - 0.5) * 26;
        starPos[s * 3 + 1] = Math.random() * 5.5 - 0.5;
        starPos[s * 3 + 2] = (Math.random() - 0.5) * 14;
      }
      const starGeo = new THREE.BufferGeometry();
      starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
      group.add(new THREE.Points(starGeo, new THREE.PointsMaterial({
        color: 0xd9b95c, size: 0.16, map: dot, transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
      })));

      const resize = () => {
        const w = canvas.clientWidth, h = canvas.clientHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      resize();
      addEventListener("resize", resize);

      let px = 0, py = 0;
      const onMouse = (e: MouseEvent) => {
        px = (e.clientX / innerWidth - 0.5) * 2;
        py = (e.clientY / innerHeight - 0.5) * 2;
      };
      addEventListener("mousemove", onMouse, { passive: true });

      let visible = true;
      const vio = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
      vio.observe(canvas);

      const clock = new THREE.Clock();
      renderer.setAnimationLoop(() => {
        if (!visible) return;
        const t = clock.getElapsedTime();
        group.rotation.y = t * 0.03 + px * 0.12;
        group.rotation.x = Math.sin(t * 0.1) * 0.02 + py * 0.05;
        camera.position.x += (px * 0.7 - camera.position.x) * 0.04;
        camera.position.y += (1.6 - py * 0.5 - camera.position.y) * 0.04;
        camera.lookAt(0, -0.4, 0);
        renderer.render(scene, camera);
      });

      cleanups.push(() => {
        renderer.setAnimationLoop(null);
        removeEventListener("resize", resize);
        removeEventListener("mousemove", onMouse);
        vio.disconnect();
        renderer.dispose();
      });
    };

    const w = window as unknown as { THREE?: any };
    if (w.THREE) {
      start(w.THREE);
    } else {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js";
      s.async = true;
      s.onload = () => start((window as unknown as { THREE?: any }).THREE);
      document.head.appendChild(s);
      cleanups.push(() => s.remove());
    }

    return () => {
      disposed = true;
      cleanups.forEach((fn) => fn());
    };
  }, []);

  const brand = (
    <img
      src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'%3E%3Crect width='512' height='512' rx='96' fill='%2331633f'/%3E%3Cg stroke='%23f5f2ea' stroke-width='34' stroke-linecap='round'%3E%3Cline x1='256' y1='128' x2='256' y2='384'/%3E%3Cline x1='143.6' y1='192' x2='368.4' y2='320'/%3E%3Cline x1='143.6' y1='320' x2='368.4' y2='192'/%3E%3C/g%3E%3Ccircle cx='256' cy='256' r='40' fill='%23f5f2ea'/%3E%3C/svg%3E"
      alt=""
    />
  );

  return (
    <div className="lp">
      <style dangerouslySetInnerHTML={{ __html: LP_CSS }} />
      <div className="grain" aria-hidden="true" />

      <nav className="nav">
        <div className="wrap nav-inner">
          <a className="brand" href="/landing">
            {brand}
            Semester.
          </a>
          <div className="nav-links">
            <a href="/landing#features">Features</a>
            <a href="/landing#system">How it works</a>
            <Link className="btn btn-primary nav-cta" href="/">
              Open the app
            </Link>
          </div>
        </div>
      </nav>

      <header className="hero" ref={heroRef}>
        <canvas id="gl" ref={canvasRef} aria-hidden="true" />
        <div className="wrap hero-grid">
          <div>
            <h1 className="display">
              Your whole school term,
              <br />
              <em>on one desk.</em>
            </h1>
            <p className="lede">
              Grades, tasks, homework, timetable and study material on one desk.
              Web and phone, always in sync.
            </p>
            <div className="hero-ctas">
              <Link className="btn btn-primary" href="/">
                Open your desk
              </Link>
              <a
                className="btn btn-ghost"
                href="https://github.com/Nefnief-tech/study/releases/tag/v0.1"
              >
                Download for Android
              </a>
            </div>
          </div>

          <div className="stage">
            <div className="tt3d" ref={ttRef}>
              <div className="shadow" />
              <div
                className="tt-card"
                role="img"
                aria-label="Preview of the Semester timetable with a cancelled and a substituted lesson"
              >
                <div className="head">
                  <span className="hello">This week</span>
                  <span className="date">Sun · 20.09.</span>
                </div>
                <div className="tt-grid">
                  <div className="row head"><div>Pd</div><div>Mon</div><div>Wed</div><div>Fri</div></div>
                  <div className="row">
                    <div className="pd">1</div>
                    <div className="less"><b>Mathe</b><span>B1</span></div>
                    <div className="less"><b>Sport</b><span>Gym</span></div>
                    <div className="less cancelled"><b>Englisch</b><span className="chip red">cancelled</span></div>
                  </div>
                  <div className="row">
                    <div className="pd">3</div>
                    <div className="less"><b>Physik</b><span>Lab</span></div>
                    <div className="less substituted"><b>Sport</b><span className="chip amb">Fr. Lauf</span></div>
                    <div className="less"><b>Musik</b><span>112</span></div>
                  </div>
                  <div className="row">
                    <div className="pd">5</div>
                    <div className="less"><b>Deutsch</b><span>B2</span></div>
                    <div className="less"><b>Mathe</b><span>B1</span></div>
                    <div className="less"><b>Bio</b><span>Lab 2</span></div>
                  </div>
                </div>
              </div>
              <div className="float-pane fp-stats">
                <span><span className="k">open tasks</span><b>7</b></span>
                <span><span className="k">avg. grade</span><b>2,3</b></span>
              </div>
              <div className="float-pane fp-sub">
                <span className="k">tomorrow, 3rd pd.</span>
                <b>Sport → Fr. Lauf</b>
              </div>
            </div>
          </div>
        </div>
      </header>

      <section id="desk-shot">
        <div className="wrap">
          <div className="section-head reveal">
            <h2 className="display">The desk itself.</h2>
            <p>
              One overview with everything that matters today: open tasks, due
              dates, your grade average and the week ahead.
            </p>
          </div>
          <div className="desk-shot shot-frame reveal">
            <img src="/shots/desk.png" alt="The Semester overview: greeting, task stats, subject grades and the next 7 days" width={2560} height={1720} />
          </div>
        </div>
      </section>

      <section id="features">
        <div className="wrap">
          <div className="section-head reveal">
            <h2 className="display">Everything a school week throws at you.</h2>
            <p>Six tools that share one set of subjects, one timetable and one database. No export-import dances between apps.</p>
          </div>

          <div className="bento">
            <div className="cell span7 reveal">
              <div className="glow-top" />
              <div className="icon"><GraduationCap size={17} /></div>
              <h3>Tasks &amp; homework</h3>
              <p>Due dates with times, priorities, subject tags and notes. Filters, sorting and overdue highlighting keep the pile honest.</p>
            </div>

            <div className="cell span5 reveal" style={{ "--d": ".08s" } as React.CSSProperties}>
              <div className="icon"><Copy size={17} /></div>
              <h3>Grades</h3>
              <p>Weighted per-subject averages in the Punkte system, shown as the German Note scale.</p>
              <div className="grade-demo">
                <span className="g">2,3</span>
                <span className="bar"><i /></span>
                <span className="pts">12 P</span>
              </div>
            </div>

            <div className="cell span12 reveal" style={{ "--d": ".05s" } as React.CSSProperties}>
              <div style={{ maxWidth: "46ch" }}>
                <div className="icon"><Clock size={17} /></div>
                <h3>Timetable with live substitutions</h3>
                <p>Import your weekly grid once, then see cancellations and substitutes from your school portal directly in the grid. Double periods included.</p>
              </div>
              <div className="shot-frame" style={{ width: "min(480px, 100%)" }}>
                <img src="/shots/timetable.png" alt="Semester timetable in dark mode with a cancelled and a substituted lesson marked" width={1720} height={1160} />
              </div>
            </div>

            <div className="cell span4 reveal">
              <div className="icon"><Calendar size={17} /></div>
              <h3>Calendar</h3>
              <p>Month and week views that combine events, exams, deadlines and task due dates in one place.</p>
            </div>

            <div className="cell span4 reveal" style={{ "--d": ".08s" } as React.CSSProperties}>
              <div className="icon"><Undo2 size={17} /></div>
              <h3>Daily digest</h3>
              <p>Every afternoon, a push with tomorrow&apos;s classes, overdue homework and upcoming exams.</p>
            </div>

            <div className="cell span4 reveal" style={{ "--d": ".16s" } as React.CSSProperties}>
              <div className="glow-top" />
              <div className="icon"><Sparkles size={17} /></div>
              <h3>AI study room</h3>
              <p>Chat with grounded answers that cite your documents, and auto-build flashcard decks.</p>
            </div>

            <div className="cell span12 reveal" style={{ "--d": ".05s" } as React.CSSProperties}>
              <div style={{ maxWidth: "46ch" }}>
                <div className="icon"><FileText size={17} /></div>
                <h3>Your documents, answered.</h3>
                <p>Upload PDFs, slides or notes and ask away. Answers are grounded in your material and cite the exact page.</p>
              </div>
              <div className="shot-frame" style={{ width: "min(480px, 100%)" }}>
                <img src="/shots/room.png" alt="AI study room chat answering with a citation from an uploaded document" width={1720} height={1160} />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="system" id="system">
        <div className="wrap">
          <div className="section-head reveal">
            <h2 className="display">Built like a system, not a toy.</h2>
            <p>Semester was built for real school weeks: flaky WLAN, double lessons, plans that change at 7:45. The boring parts are the feature.</p>
          </div>

          <div className="stack">
            <div className="stack-card reveal">
              <div>
                <span className="num">AUTOSAVE</span>
                <h3>No save buttons, anywhere.</h3>
                <p>Forms have no save button. Every edit commits as you type and closing a form can never lose input, on web and Android alike.</p>
              </div>
              <div className="glyph"><Check size={34} /></div>
            </div>
            <div className="stack-card alt reveal">
              <div>
                <span className="num">SYNC</span>
                <h3>Offline first, always agreeing.</h3>
                <p>Edits live locally first and win over the cloud until their push lands. Structured rows with deterministic ids mean web and phone agree without coordination.</p>
              </div>
              <div className="glyph"><Undo2 size={34} /></div>
            </div>
            <div className="stack-card reveal">
              <div>
                <span className="num">PRIVACY</span>
                <h3>Credentials stay put.</h3>
                <p>Portal logins never leave your device except to your own server for the fetch. Sign out and your data stays with you.</p>
              </div>
              <div className="glyph"><BookOpen size={34} /></div>
            </div>
          </div>
        </div>
      </section>

      <section className="cta">
        <div className="wrap">
          <div className="cta-box reveal">
            <div>
              <h2>Set up your desk in one afternoon.</h2>
              <p>Paste your timetable as JSON, connect your school portal, install the app. Everything else follows.</p>
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Link className="btn btn-primary" href="/">
                Open your desk
              </Link>
              <a className="btn btn-ghost" href="https://github.com/Nefnief-tech/study#readme">
                Read the docs
              </a>
            </div>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="wrap foot-inner">
          <a className="brand" href="/landing">
            {brand}
            Semester.
          </a>
          <span>Open source and self-hostable.</span>
          <div className="foot-right">
            <a href="https://github.com/Nefnief-tech/study">GitHub</a>
            <a href="https://github.com/Nefnief-tech/study/releases">Releases</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
