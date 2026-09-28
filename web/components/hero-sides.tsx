"use client";

/*
 * The two clusters flanking the hero.
 *
 * WHAT THEY SAY IS REAL. The four labels are signals this model actually
 * reads - evergreen wording, a missing salary figure, vague duties - and
 * the percentage is in the band a ghost-like posting lands in. They are
 * decoration in the sense that the page works without them, but they are
 * not lorem: someone who reads them and then uses the tool sees the same
 * vocabulary, rather than discovering the marketing was made up.
 *
 * They are aria-hidden all the same. A screen reader reaching a floating
 * card that says "Ghost match 72%" with no posting attached would
 * reasonably think it was a result.
 *
 * DELIBERATELY NOT MIRRORED. The two sides carry different counts and
 * different offsets, because a perfectly symmetrical frame reads as a
 * template. Every animation here is transform and opacity only, and the
 * whole thing is skipped below 960px.
 */

type Card = {
  label: string;
  meta: string;
  /** Percent of the side column: where the card sits. */
  top: number;
  left: number;
  rotate: number;
  /** Smaller = further away. Drives scale, opacity and blur. */
  depth: number;
  delay: number;
};

const LEFT: Card[] = [
  { label: "Evergreen posting", meta: "talent pool wording", top: 16, left: 26, rotate: -5, depth: 1, delay: 0 },
  { label: "No salary range", meta: "no pay figure given", top: 45, left: 6, rotate: -2.5, depth: 0.82, delay: 1.6 },
  { label: "Vague role description", meta: "few concrete duties", top: 72, left: 30, rotate: -7, depth: 0.66, delay: 3.1 },
];

const RIGHT: Card[] = [
  { label: "Ghost match 72%", meta: "reads ghost-like", top: 24, left: 20, rotate: 5, depth: 1, delay: 0.8 },
  { label: "Named hiring manager", meta: "lowers risk", top: 58, left: 36, rotate: 3, depth: 0.74, delay: 2.4 },
];

function Cluster({ cards, side }: { cards: Card[]; side: "left" | "right" }) {
  return (
    <div className={`hero-side hero-side-${side}`} aria-hidden="true">
      {/* A soft amber wash, so the edges read as lit rather than black. */}
      <span className="hero-side-glow" />

      {/* Dotted curves running from the cards toward the centre. Drawn in
          one SVG so the strokes share a gradient that fades as it goes. */}
      <svg className="hero-side-threads" viewBox="0 0 200 400" preserveAspectRatio="none">
        <defs>
          <linearGradient
            id={`thread-${side}`}
            x1={side === "left" ? "0" : "1"}
            y1="0"
            x2={side === "left" ? "1" : "0"}
            y2="0"
          >
            <stop offset="0%" stopColor="var(--hp-accent)" stopOpacity="0" />
            <stop offset="100%" stopColor="var(--hp-accent)" stopOpacity="0.5" />
          </linearGradient>
        </defs>
        {cards.map((c, i) => (
          <path
            key={i}
            d={
              side === "left"
                ? `M ${c.left * 2} ${c.top * 4} C 120 ${c.top * 4}, 150 200, 200 200`
                : `M ${200 - c.left * 2} ${c.top * 4} C 80 ${c.top * 4}, 50 200, 0 200`
            }
            fill="none"
            stroke={`url(#thread-${side})`}
            strokeWidth="1"
            strokeDasharray="2 6"
            strokeLinecap="round"
          />
        ))}
      </svg>

      {/* Tick marks down the outer edge. */}
      <span className="hero-side-ticks">
        {Array.from({ length: 9 }, (_, i) => (
          <span key={i} style={{ opacity: 0.12 + (i % 3) * 0.1 }} />
        ))}
      </span>

      {cards.map((c, i) => (
        <span
          key={c.label}
          className="hero-card"
          data-depth={c.depth < 0.75 ? "far" : c.depth < 0.95 ? "mid" : "near"}
          style={
            {
              top: `${c.top}%`,
              left: `${c.left}%`,
              "--rot": `${c.rotate}deg`,
              "--depth": c.depth,
              animationDelay: `${c.delay}s`,
              // The third card on each side is the first to go when the
              // viewport narrows.
              "--order": i,
            } as React.CSSProperties
          }
        >
          <span className="hero-card-dot" />
          <span className="hero-card-label">{c.label}</span>
          <span className="hero-card-meta">{c.meta}</span>
        </span>
      ))}
    </div>
  );
}

export function HeroSides() {
  return (
    <>
      <Cluster cards={LEFT} side="left" />
      <Cluster cards={RIGHT} side="right" />
    </>
  );
}
