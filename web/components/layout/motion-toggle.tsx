"use client";

import { useEffect, useState } from "react";
import { Sparkles, SparkleIcon } from "lucide-react";

/*
 * Whether animation runs depends on TWO things: what the operating system
 * asks for, and whether the visitor overrode it here.
 *
 * This matters more than it sounds, and it is why a toggle exists at all
 * rather than just obeying the media query. Plenty of people switch
 * Windows animations off for speed rather than because motion bothers
 * them, and the browser reports that as prefers-reduced-motion. Obeying it
 * blindly hands those people a completely static page with no way to ask
 * for anything else - which is exactly what happened when this toggle was
 * left out of the port.
 *
 * The decision is stamped on <html> as data-motion, because the
 * stylesheet needs to read it: every animation is written against
 * html[data-motion="off"] rather than the raw media query, so the
 * override actually has teeth.
 */
const KEY = "hireproof:motion";

/** The saved choice: "on", "off", or null for "follow the OS". */
function savedChoice(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    // Private browsing and blocked storage both throw here. Falling back
    // to the system preference is the right answer, not a crash.
    return null;
  }
}

export function motionEnabled(): boolean {
  const choice = savedChoice();
  if (choice === "on") return true;
  if (choice === "off") return false;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function apply(): boolean {
  const on = motionEnabled();
  document.documentElement.dataset.motion = on ? "on" : "off";
  return on;
}

export function MotionToggle() {
  const [on, setOn] = useState(true);

  useEffect(() => {
    setOn(apply());
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    // If no explicit choice has been made, follow the system when it
    // changes rather than staying on a stale decision.
    const onChange = () => {
      if (savedChoice() === null) setOn(apply());
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return (
    <button
      type="button"
      className="pill-btn"
      aria-pressed={on}
      title={on ? "Turn animation off" : "Turn animation on"}
      onClick={() => {
        const next = on ? "off" : "on";
        try {
          localStorage.setItem(KEY, next);
        } catch {
          // Can't persist it; still honour the choice for this page view.
        }
        setOn(apply());
        // The canvas is not styled by CSS, so data-motion means nothing
        // to it. It listens for this instead.
        window.dispatchEvent(new CustomEvent("hireproof:motion"));
      }}
    >
      {on ? <Sparkles className="size-4" /> : <SparkleIcon className="size-4" />}
      <span>{on ? "Animations on" : "Animations off"}</span>
    </button>
  );
}
