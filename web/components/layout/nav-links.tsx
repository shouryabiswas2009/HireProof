"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const navLinks = [
  { href: "/check", label: "Check" },
  { href: "/compare", label: "Compare" },
  { href: "/history", label: "History" },
  { href: "/model", label: "Model" },
  { href: "/how", label: "How it works" },
];

/**
 * A segmented control with a pill that slides between items.
 *
 * MEASURED, NOT GUESSED. The pill's position comes from
 * getBoundingClientRect on the active link rather than from index times
 * an assumed item width, because the labels are different lengths and any
 * width-based guess drifts. It also has to be measured after the fonts
 * land: a pill placed while the fallback face is still showing ends up a
 * few pixels off once the real one swaps in.
 *
 * aria-current stays the source of truth for which route is active - the
 * pill is decoration, so it is hidden from the accessibility tree and a
 * screen reader reads the attribute instead.
 */
export function NavLinks() {
  const pathname = usePathname();
  const listRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const place = () => {
      const active = list.querySelector<HTMLElement>('[aria-current="page"]');
      if (!active) {
        setPill(null);
        return;
      }
      const a = active.getBoundingClientRect();
      const parent = list.getBoundingClientRect();
      setPill({ left: a.left - parent.left, width: a.width });
    };

    place();
    // Re-place when the box changes size, and once the webfont has
    // actually swapped in.
    const observer = new ResizeObserver(place);
    observer.observe(list);
    document.fonts?.ready.then(place).catch(() => {});
    return () => observer.disconnect();
  }, [pathname]);

  return (
    <nav className="navpills" ref={listRef} aria-label="Sections">
      {pill && (
        <span
          className="navpill"
          aria-hidden="true"
          style={{ transform: `translateX(${pill.left}px)`, width: pill.width }}
        />
      )}
      {navLinks.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="navlink"
          aria-current={pathname === link.href ? "page" : undefined}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
