"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

/*
 * The account control: an initial, and everything else behind it.
 *
 * Closes on Escape and on a click outside, because a menu that can only
 * be dismissed by clicking the same button again is a trap on touch.
 */
export function AccountMenu({
  email,
  children,
}: {
  email: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <div className="account" ref={ref}>
      <button
        type="button"
        className="avatar-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account: ${email}`}
        onClick={() => setOpen((v) => !v)}
      >
        {email.charAt(0).toUpperCase()}
      </button>

      {open && (
        <div className="account-menu" role="menu">
          <p className="account-email" title={email}>
            {email}
          </p>
          <Link href="/history" className="account-item" role="menuitem">
            Your history
          </Link>
          <div className="account-sep" />
          {children}
        </div>
      )}
    </div>
  );
}
