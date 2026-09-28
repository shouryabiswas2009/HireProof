import Link from "next/link";

/*
 * The logomark: a rounded-square badge with the ghost inside it, and a
 * wordmark that pairs the body sans with the headline's serif.
 *
 * The two halves of the name are weighted differently on purpose - "Hire"
 * light, "Proof" in the display serif - so the mark reads as one designed
 * thing rather than an icon sitting next to some text. The whole lockup
 * is one link to home.
 */
export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="HireProof, home">
      <span className="brand-badge" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="16" height="16" focusable="false">
          <path
            fill="currentColor"
            d="M12 1.8A8.2 8.2 0 0 0 3.8 10v10.3c0 1 1.1 1.5 1.9 1l1.9-1.4c.35-.26.83-.26 1.18 0l1.55 1.15c.35.26.83.26 1.18 0l1.55-1.15c.35-.26.83-.26 1.18 0l1.9 1.4c.8.58 1.86.03 1.86-1V10A8.2 8.2 0 0 0 12 1.8Z"
          />
          <circle className="brand-eye" cx="9.1" cy="9.9" r="1.35" />
          <circle className="brand-eye" cx="14.9" cy="9.9" r="1.35" />
        </svg>
      </span>
      <span className="brand-name">
        <span className="brand-hire">Hire</span>
        <span className="brand-proof">Proof</span>
      </span>
    </Link>
  );
}
