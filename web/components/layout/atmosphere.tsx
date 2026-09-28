"use client";

import { useEffect, useRef, useState } from "react";
import { motionEnabled } from "@/components/layout/motion-toggle";

const EMBERS = 18;

/*
 * The two background layers that need JavaScript: drifting embers and a
 * light that follows the cursor.
 *
 * Both are decoration and both are disposable - with motion off, or on a
 * touch device, they simply are not rendered. Neither carries meaning, so
 * losing them costs the page nothing.
 */
export function Atmosphere() {
  const spotRef = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);
  const [fine, setFine] = useState(false);

  useEffect(() => {
    const sync = () => {
      setEnabled(motionEnabled());
      setFine(window.matchMedia("(pointer: fine)").matches);
    };
    sync();
    window.addEventListener("hireproof:motion", sync);
    return () => window.removeEventListener("hireproof:motion", sync);
  }, []);

  useEffect(() => {
    const spot = spotRef.current;
    if (!spot || !enabled || !fine) return;

    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight * 0.4;
    let x = targetX;
    let y = targetY;
    let raf = 0;
    let running = false;

    /* The listener only records coordinates; the move happens in a frame
       callback. However often the mouse fires, the DOM is touched once
       per frame - and the light EASES toward the pointer rather than
       being pinned to it, because pinned reads as a stuck decal and
       trailing slightly reads as light. */
    const frame = () => {
      x += (targetX - x) * 0.09;
      y += (targetY - y) * 0.09;
      spot.style.setProperty("--spot-x", `${x}px`);
      spot.style.setProperty("--spot-y", `${y}px`);
      if (Math.abs(targetX - x) > 0.5 || Math.abs(targetY - y) > 0.5) {
        raf = requestAnimationFrame(frame);
      } else {
        running = false;
      }
    };

    const onMove = (event: PointerEvent) => {
      targetX = event.clientX;
      targetY = event.clientY;
      spot.classList.add("on");
      if (!running) {
        running = true;
        raf = requestAnimationFrame(frame);
      }
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, [enabled, fine]);

  if (!enabled) return null;

  return (
    <>
      <div className="embers" aria-hidden="true">
        {Array.from({ length: EMBERS }, (_, i) => (
          <span
            key={i}
            className="ember"
            style={{
              left: `${(i * 97) % 100}%`,
              animationDuration: `${16 + (i % 7) * 4}s`,
              animationDelay: `${-(i * 2.3)}s`,
            }}
          />
        ))}
      </div>
      {fine && <div className="spotlight" ref={spotRef} aria-hidden="true" />}
    </>
  );
}
