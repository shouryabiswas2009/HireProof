"use client";

import { useEffect, useRef, useState } from "react";
import type { Contribution, ScoreResult, Band, ModelFile } from "@/lib/scoring/use-scorer";

/*
 * The result panel from the static site, rebuilt as a component.
 *
 * It keeps the class names from hireproof.css rather than inventing new
 * ones, so the gauge, the diverging bars and their stagger all come from
 * the stylesheet that already describes them. The only logic here is what
 * app.js did: rotate the needle, count the number up, and decide which
 * signals are worth a bar.
 */

const BAND_ICON: Record<Band["key"], string> = {
  low: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  medium: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="13"/><line x1="12" y1="16.5" x2="12" y2="16.5"/></svg>`,
  high: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><line x1="12" y1="9" x2="12" y2="13.5"/><line x1="12" y1="17" x2="12" y2="17"/></svg>`,
};

const BAND_COLOR: Record<Band["key"], string> = {
  low: "var(--status-good)",
  medium: "var(--status-warn)",
  high: "var(--status-bad)",
};

// Contributions smaller than this are rounding noise: the posting sits
// essentially at the training average, so a bar would imply a factor that
// did not really apply.
const MEANINGFUL = 0.01;
const TOP_N = 5;

/** Count the headline number up, the way the static site did. */
function useCountUp(target: number, run: boolean) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!run) {
      setValue(target);
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }
    let frame = 0;
    const started = performance.now();
    const tick = (now: number) => {
      // Ease out, so it decelerates into the final value instead of
      // stopping dead on it.
      const t = Math.min((now - started) / 900, 1);
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, run]);
  return value;
}

function ContributionRow({
  item,
  largest,
  index,
}: {
  item: Contribution;
  largest: number;
  index: number;
}) {
  const towardGhost = item.contribution > 0;
  const width = largest > 0 ? (Math.abs(item.contribution) / largest) * 100 : 0;
  const bar = (
    <span
      className={towardGhost ? "bar bar-raise" : "bar bar-lower"}
      style={{ width: `${width}%` }}
    >
      {/*
        A + or MINUS at the data end of the bar. Direction is already
        carried by which side of the zero line it sits on, but that is a
        spatial cue and the colours are what a reader looks at first. A
        glyph means the direction survives colour blindness, a greyscale
        print and a screenshot pasted into a document.
      */}
      <span className="bar-sign">{towardGhost ? "+" : "−"}</span>
    </span>
  );

  return (
    <li
      className="crow"
      data-signal={item.name}
      // The stylesheet turns this into an animation-delay, so the bars
      // arrive one after another down the list rather than all at once.
      style={{ "--i": index } as React.CSSProperties}
      title={`${item.label}: ${towardGhost ? "+" : ""}${item.contribution.toFixed(3)}`}
    >
      <span className="crow-name">{item.label}</span>
      <span className="crow-chart">
        <span className="crow-half crow-left">{!towardGhost && bar}</span>
        <span className="crow-axis" />
        <span className="crow-half crow-right">{towardGhost && bar}</span>
      </span>
      <span className="crow-meta">
        <span className={`crow-strength strength-${item.strength}`}>
          {item.strength}
        </span>
        <span className="crow-points">
          {item.points >= 0 ? "+" : "−"}
          {Math.abs(item.points).toFixed(1)} pts
        </span>
      </span>
    </li>
  );
}

export function Result({
  result,
  verdict,
  model,
}: {
  result: ScoreResult;
  verdict: Band;
  model: ModelFile | null;
}) {
  const percent = Math.round(result.probability * 100);
  const shown = useCountUp(percent, true);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [result]);

  const meaningful = result.contributions.filter(
    (c) => Math.abs(c.contribution) > MEANINGFUL
  );
  const largest = meaningful.length ? Math.abs(meaningful[0].contribution) : 0;
  const hidden = Math.max(0, meaningful.length - TOP_N);

  const clamped = result.contributions.filter((c) => c.clamped);

  return (
    <section className="card card-result" ref={ref}>
      <div
        className="verdict"
        style={{ "--meter-color": BAND_COLOR[verdict.key] } as React.CSSProperties}
      >
        <p className="score-label">Resemblance to ghost postings</p>

        {/* The three zones are fixed arcs so the THRESHOLDS are visible:
            you can see where 40% and 70% fall, rather than only learning
            which bucket you landed in. Semicircle, centre (100,96),
            radius 78 - a score of f maps to f*180 degrees of rotation. */}
        <svg className="gauge" viewBox="0 0 200 112" role="img" aria-labelledby="gauge-title" focusable="false">
          <title id="gauge-title">Score gauge</title>
          <path className="zone zone-low" d="M 22.00 96.00 A 78 78 0 0 1 73.35 22.69" />
          <path className="zone zone-mid" d="M 78.47 21.03 A 78 78 0 0 1 143.64 31.35" />
          <path className="zone zone-high" d="M 148.00 34.52 A 78 78 0 0 1 178.00 96.00" />
          <line className="tick" x1="79.6" y1="33.2" x2="81.5" y2="38.9" />
          <text className="tick-label" x="84.9" y="49.4">40</text>
          <line className="tick" x1="138.8" y1="42.6" x2="135.3" y2="47.5" />
          <text className="tick-label" x="128.8" y="56.4">70</text>
          <g
            className="needle"
            transform={`rotate(${result.probability * 180} 100 96)`}
          >
            <path d="M 100 96 L 26 93.4 L 26 98.6 Z" />
          </g>
          <circle className="hub" cx="100" cy="96" r="6" />
        </svg>

        <p className="score-number">
          <span>{shown}%</span>
        </p>
        <p className="band">
          <span
            className="band-icon"
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: BAND_ICON[verdict.key] }}
          />
          <span className="band-title">{verdict.title}</span>
        </p>
        <p className="verdict-blurb">{verdict.blurb}</p>
      </div>

      {/* Announce the outcome briefly. Putting aria-live on the whole card
          would read out the gauge, every bar and the table, which is
          unusable. */}
      <p className="visually-hidden" aria-live="polite">
        {percent} percent. {verdict.title}.
        {meaningful[0] ? ` Biggest factor: ${meaningful[0].label}.` : ""}
      </p>

      {result.outOfDistribution && (
        <p className="ood-note">
          Treat this score with extra caution:{" "}
          {clamped.map((c) => c.neutralLabel.toLowerCase()).join(" and ")}{" "}
          {clamped.length === 1 ? "is" : "are"} outside the range of the
          postings this model was trained on, so the number is an
          extrapolation rather than a reading.
        </p>
      )}

      {model && (
        <p className="model-line">
          This model scores {Math.round((model.metrics.cv_accuracy ?? 0) * 100)}%
          accuracy against a{" "}
          {Math.round((model.metrics.baseline_accuracy ?? 0) * 100)}% baseline
          ({model.metrics.cv_folds ?? 5}-fold cross-validation), trained on{" "}
          {model.n_examples} hand-labelled postings.
        </p>
      )}

      <div className="divider" aria-hidden="true" />

      <div className="breakdown-head">
        <h2>What drove this score</h2>
        <p className="legend">
          <span className="legend-item">
            <span className="swatch swatch-lower" />
            Lowers risk
          </span>
          <span className="legend-item">
            <span className="swatch swatch-raise" />
            Raises risk
          </span>
        </p>
      </div>
      <p className="hint">
        The signals that moved this posting&rsquo;s score the most.{" "}
        <strong>Strength</strong> ranks the signals against each other;{" "}
        <strong>points</strong> is how far the score would move if this posting
        were merely average on that one signal. Points don&rsquo;t sum to the
        total &mdash; the scale is compressed near 0% and 100%.
      </p>

      <ul className="contributions">
        {meaningful.length === 0 ? (
          <li className="crow-empty">
            No signal stood out: this posting sits close to the training
            average on every one.
          </li>
        ) : (
          <>
            {meaningful.slice(0, TOP_N).map((item, i) => (
              <ContributionRow key={item.name} item={item} largest={largest} index={i} />
            ))}
            {hidden > 0 && (
              <li className="crow-more">
                {hidden} more signal{hidden === 1 ? "" : "s"} moved the score by
                less. All eleven are in the table below.
              </li>
            )}
          </>
        )}
      </ul>

      <details className="drawer">
        <summary>Every signal, with its raw value</summary>
        <table className="raw-table">
          <thead>
            <tr>
              <th>Signal</th>
              <th>Value</th>
              <th>Effect on z</th>
            </tr>
          </thead>
          <tbody>
            {result.contributions.map((c) => (
              <tr key={c.name}>
                <td>{c.neutralLabel}</td>
                <td>
                  {Number.isInteger(c.rawValue)
                    ? String(c.rawValue)
                    : c.rawValue.toFixed(2)}
                </td>
                <td>
                  {c.contribution >= 0 ? "+" : ""}
                  {c.contribution.toFixed(3)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
