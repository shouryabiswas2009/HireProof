"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navLinks = [
  { href: "/check", label: "Check a posting" },
  { href: "/compare", label: "Compare" },
  { href: "/history", label: "History" },
  { href: "/model", label: "The model" },
  { href: "/how", label: "How it works" },
];

/**
 * The nav, with the tab strip's behaviour kept.
 *
 * aria-current is the source of truth for which route is active, and the
 * stylesheet reads that attribute directly rather than a parallel class
 * that could fall out of step with it. Screen readers get the same signal
 * the underline gives everyone else.
 */
export function NavLinks() {
  const pathname = usePathname();

  return (
    <nav className="hidden items-center gap-6 text-sm lg:flex">
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
