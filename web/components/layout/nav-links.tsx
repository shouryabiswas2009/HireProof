"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ScanLine,
  GitCompareArrows,
  History,
  ChartNoAxesColumn,
  BookOpen,
} from "lucide-react";

export const NAV_LINKS = [
  { href: "/check", label: "Check", Icon: ScanLine },
  { href: "/compare", label: "Compare", Icon: GitCompareArrows },
  { href: "/history", label: "History", Icon: History },
  { href: "/model", label: "Model", Icon: ChartNoAxesColumn },
  { href: "/how", label: "How it works", Icon: BookOpen },
];

/**
 * The pill nav: a glass track with one amber pill that slides.
 *
 * MEASURED, NOT GUESSED. The pill's position comes from
 * getBoundingClientRect on the target link rather than index times an
 * assumed item width, because the labels are different lengths and any
 * width-based guess drifts. It is re-measured once the webfont swaps in,
 * since a pill placed against the fallback face lands a few pixels off.
 *
 * The pill follows the POINTER as well as the route, and returns to the
 * active tab when the pointer leaves - so hovering previews where you are
 * about to go. aria-current stays the source of truth for which route is
 * actually active; the pill is decoration and is hidden from the
 * accessibility tree.
 */
export function NavLinks() {
  const pathname = usePathname();
  const trackRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);

  const moveTo = (el: HTMLElement | null) => {
    const track = trackRef.current;
    if (!track || !el) return;
    const a = el.getBoundingClientRect();
    const parent = track.getBoundingClientRect();
    setPill({ left: a.left - parent.left, width: a.width });
  };

  const settle = () =>
    moveTo(trackRef.current?.querySelector<HTMLElement>('[aria-current="page"]') ?? null);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    settle();
    const observer = new ResizeObserver(settle);
    observer.observe(track);
    document.fonts?.ready.then(settle).catch(() => {});
    return () => observer.disconnect();
  }, [pathname]);

  return (
    <nav
      className="navpills"
      ref={trackRef}
      aria-label="Sections"
      onPointerLeave={settle}
    >
      {pill && (
        <span
          className="navpill"
          aria-hidden="true"
          style={{ transform: `translateX(${pill.left}px)`, width: pill.width }}
        />
      )}
      {NAV_LINKS.map(({ href, label, Icon }) => (
        <Link
          key={href}
          href={href}
          className="navlink"
          aria-current={pathname === href ? "page" : undefined}
          onPointerEnter={(e) => moveTo(e.currentTarget)}
          onFocus={(e) => moveTo(e.currentTarget)}
          onBlur={settle}
        >
          <Icon className="navlink-icon" aria-hidden="true" />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}
