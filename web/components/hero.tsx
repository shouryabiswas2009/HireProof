"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import { createHeroField } from "@/lib/scoring/hero-field.js";
import { motionEnabled } from "@/components/layout/motion-toggle";

/**
 * The hero from the static site: the horizon arc drawn in CSS, and the
 * ghost above it made of particles sampled from the wordmark's own path.
 *
 * The canvas module is the same file the static site runs, unchanged. All
 * this component does is own its lifetime and hand it resolved colours,
 * which is the one thing a canvas cannot read from a CSS variable: the
 * tokens are written with light-dark(), and reading one back gives the
 * literal text "light-dark(#a, #b)" rather than a colour. The browser
 * resolves it on a throwaway element instead.
 */
function resolvedColour(token: string, fallback: string): string {
  const probe = document.createElement("span");
  probe.style.cssText = "position:absolute;left:-9999px;visibility:hidden";
  probe.style.color = `var(${token})`;
  document.body.appendChild(probe);
  const value = getComputedStyle(probe).color;
  probe.remove();
  return value || fallback;
}

type Field = {
  setColours: (c: { body: string; core: string }) => void;
  refreshMotion: () => void;
} | null;

export function Hero({ children }: { children?: React.ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fieldRef = useRef<Field>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (!canvasRef.current) return;
    const field = createHeroField(canvasRef.current, {
      // The resolved setting - OS preference plus the footer override -
      // not the raw media query.
      motionOn: motionEnabled,
      colours: {
        body: resolvedColour("--hp-accent", "#eda059"),
        core: resolvedColour("--glow-rim-solid", "#ffd8ae"),
      },
    });
    fieldRef.current = field;
    if (field) document.documentElement.classList.add("has-field");
    return () => {
      document.documentElement.classList.remove("has-field");
    };
  }, []);

  // The toggle fires this, because a canvas cannot read data-motion.
  useEffect(() => {
    const onToggle = () => fieldRef.current?.refreshMotion();
    window.addEventListener("hireproof:motion", onToggle);
    return () => window.removeEventListener("hireproof:motion", onToggle);
  }, []);

  // Light and dark have different palettes, and the canvas holds resolved
  // rgb() strings rather than variables, so it has to be told.
  useEffect(() => {
    fieldRef.current?.setColours({
      body: resolvedColour("--hp-accent", "#eda059"),
      core: resolvedColour("--glow-rim-solid", "#ffd8ae"),
    });
  }, [resolvedTheme]);

  return (
    <div className="hero">
      {/* The stage reserves its own height, so nothing below it moves when
          the canvas and the arc finish setting themselves up. */}
      <div className="hero-stage">
        <svg
          className="hero-arc"
          viewBox="0 0 1200 320"
          preserveAspectRatio="xMidYMax meet"
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            {/* Transparent at both ends, so the arc dissolves into the
                page rather than being cut off at the viewport edge. */}
            <linearGradient id="arcStroke" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--hp-accent)" stopOpacity="0" />
              <stop offset="22%" stopColor="var(--hp-accent)" stopOpacity="0.55" />
              <stop offset="50%" stopColor="var(--glow-rim-solid)" stopOpacity="1" />
              <stop offset="78%" stopColor="var(--hp-accent)" stopOpacity="0.55" />
              <stop offset="100%" stopColor="var(--hp-accent)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="arcSweep" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#fff" stopOpacity="0" />
              <stop offset="50%" stopColor="#fff" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
            <filter id="arcBloom" x="-20%" y="-200%" width="140%" height="500%">
              <feGaussianBlur stdDeviation="14" />
            </filter>
            {/* The sweep is masked to the arc itself, so the travelling
                light rides the curve instead of crossing the box. */}
            <mask id="arcMask">
              <path d="M -40 320 Q 600 40 1240 320" fill="none" stroke="#fff" strokeWidth="3" />
            </mask>
          </defs>

          <path
            className="arc-bloom"
            d="M -40 320 Q 600 40 1240 320"
            fill="none"
            stroke="url(#arcStroke)"
            strokeWidth="6"
            filter="url(#arcBloom)"
          />
          <path
            className="arc-line"
            d="M -40 320 Q 600 40 1240 320"
            fill="none"
            stroke="url(#arcStroke)"
            strokeWidth="2"
          />
          {/* A slow light travelling the curve. Only its transform moves. */}
          <g mask="url(#arcMask)">
            <rect
              className="arc-sweep"
              x="-420"
              y="0"
              width="420"
              height="320"
              fill="url(#arcSweep)"
            />
          </g>
        </svg>

        <canvas className="hero-field" ref={canvasRef} aria-hidden="true" />
      </div>

      {children}
    </div>
  );
}
