/*
 * Finds, inside the visitor's original text, the exact phrases that made
 * each signal fire — and reports which signals fired by being ABSENT.
 *
 * THE HARD PART: offsets.
 *
 * features.js does its matching against NORMALISED text (lowercased, all
 * whitespace collapsed to single spaces). That text has different
 * character positions from what the visitor pasted: "WE ARE\n\n   fast-paced"
 * becomes "we are fast-paced", and the match at normalised index 7 sits at
 * original index 11.
 *
 * Highlighting the wrong characters would be worse than not highlighting
 * at all, so this module rebuilds the normalised string while recording,
 * for every normalised character, which original character it came from.
 * Matches are then translated straight back through that map.
 *
 * The alternative — searching the original text case-insensitively — would
 * quietly disagree with the model whenever a phrase was split across a line
 * break, which is common in pasted postings. This way the highlights show
 * exactly what the model matched, not an approximation of it.
 */

// Which phrase list belongs to which feature. Used to colour a highlight
// by the direction its feature pushed the score.
const LIST_TO_FEATURE = {
  buzzwords: "buzzword_density",
  concrete_duty: "concrete_duty_density",
  reporting_line: "names_reporting_line",
  vague_pay: "vague_pay_phrase",
  evergreen: "evergreen_language",
  multiple_openings: "multiple_openings_language",
  deadline_or_start: "has_deadline_or_start_date",
  entry_level: "experience_mismatch",
};

const PATTERN_TO_FEATURE = {
  salary_amount: "has_salary_range",
  contact_email: "has_contact_email",
  years_required: "experience_mismatch",
};

/**
 * Normalise exactly as features.js does, but also return a map from each
 * normalised character index back to its index in the original string.
 */
function normalizeWithMap(text) {
  const chars = [];
  const map = [];
  let pendingSpace = false;
  let started = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      // Remember that a gap happened, but don't emit anything yet: runs of
      // whitespace collapse to one space, and trailing whitespace vanishes.
      if (started) pendingSpace = true;
      continue;
    }
    if (pendingSpace) {
      // The separating space maps to the start of the word that follows,
      // so a highlight spanning it covers the original line break too.
      chars.push(" ");
      map.push(i);
      pendingSpace = false;
    }
    // Lowercasing can produce more than one character for some letters
    // (Turkish dotted I, for instance), so push a map entry per character
    // produced rather than assuming one-to-one.
    for (const lowered of ch.toLowerCase()) {
      chars.push(lowered);
      map.push(i);
    }
    started = true;
  }
  return { normalized: chars.join(""), map };
}

/** Every occurrence of `needle` in `haystack`, as [start, end) pairs. */
function findAll(haystack, needle) {
  const spans = [];
  if (!needle) return spans;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return spans;
    spans.push([at, at + needle.length]);
    // Step past the start, not the whole match, so overlapping phrases
    // are all found; the overlap resolver below sorts them out.
    from = at + 1;
  }
}

/**
 * Collect every phrase and pattern match, tagged with its feature.
 * Returns spans in ORIGINAL-text coordinates.
 */
function findMatches(text, config) {
  const { normalized, map } = normalizeWithMap(text);
  const toOriginal = (start, end) => {
    if (start >= map.length) return null;
    const last = Math.min(end, map.length) - 1;
    // +1 because map holds the index of the character itself, and the end
    // of a span is exclusive.
    return [map[start], map[last] + 1];
  };

  const raw = [];

  for (const [listName, feature] of Object.entries(LIST_TO_FEATURE)) {
    for (const phrase of config.phrase_lists[listName] || []) {
      for (const [s, e] of findAll(normalized, phrase)) {
        const span = toOriginal(s, e);
        if (span) raw.push({ feature, start: span[0], end: span[1], phrase });
      }
    }
  }

  for (const [patternName, feature] of Object.entries(PATTERN_TO_FEATURE)) {
    const spec = config.patterns[patternName];
    if (!spec) continue;
    const re = new RegExp(spec.regex, "gi");
    for (const m of normalized.matchAll(re)) {
      const span = toOriginal(m.index, m.index + m[0].length);
      if (span) raw.push({ feature, start: span[0], end: span[1], phrase: m[0] });
    }
  }

  // Resolve overlaps. Longest match wins, so "wear many hats" beats a
  // shorter phrase sitting inside it; without this the rendered HTML would
  // have interleaved, unclosable tags.
  raw.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const kept = [];
  let lastEnd = -1;
  for (const m of raw) {
    if (m.start >= lastEnd) {
      kept.push(m);
      lastEnd = m.end;
    }
  }
  return kept;
}

/** Escape text so it can be dropped into innerHTML safely. */
function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Build the annotated HTML for the posting.
 *
 * `direction` maps a feature name to +1 (this feature pushed the score
 * toward ghost) or -1 (toward genuine), taken from the actual scoring
 * result — so a highlight's colour reflects what that signal did to THIS
 * posting rather than a fixed opinion about the phrase.
 */
function annotate(text, config, direction, rawValues = null) {
  let matches = findMatches(text, config);

  /*
   * Only mark phrases whose feature ACTUALLY FIRED.
   *
   * Some patterns feed a feature that needs more than one condition. The
   * "3+ years of experience" pattern feeds experience_mismatch, which
   * only counts when a JUNIOR title also appears. On a senior posting the
   * pattern still matches the words, but the feature is zero — so
   * highlighting them would point at a signal that never contributed, and
   * the reader would reasonably conclude the model had flagged it.
   *
   * Checking the feature's raw value keeps the highlights honest: they
   * show what the model used, not merely what the regex touched.
   */
  if (rawValues) {
    matches = matches.filter((m) => (rawValues[m.feature] ?? 0) !== 0);
  }
  let html = "";
  let cursor = 0;

  for (const m of matches) {
    html += escapeHtml(text.slice(cursor, m.start));
    const dir = (direction[m.feature] || 0) >= 0 ? "raise" : "lower";
    html +=
      `<mark class="hl hl-${dir}" data-signal="${m.feature}">` +
      escapeHtml(text.slice(m.start, m.end)) +
      `</mark>`;
    cursor = m.end;
  }
  html += escapeHtml(text.slice(cursor));
  return { html, matches };
}

/**
 * The same matches, tagged with what each one did to the score.
 *
 * WHY THIS LIVES HERE AND NOT IN features.js. The obvious place to return
 * match positions is the function that does the matching - but
 * extractFeatures has a twin in features.py, and two test suites exist
 * only to prove the two produce identical numbers
 * (tests/test_parity_predictions.py, and 164 checks in
 * tests/js/test_features.mjs). Touching it to carry positions would put
 * that parity at risk for a presentational feature. Nothing below can
 * change a feature value, because nothing below is read by the scorer.
 *
 * Returns spans in ORIGINAL text coordinates, each carrying the feature
 * it fed, that feature's signed contribution, and the direction word the
 * UI colours by.
 */
function matchesWithContributions(text, config, contributions) {
  const byName = new Map(contributions.map((c) => [c.name, c]));
  return findMatches(text, config)
    .map((m) => {
      const c = byName.get(m.feature);
      if (!c) return null;
      return {
        ...m,
        label: c.neutralLabel || c.label,
        contribution: c.contribution,
        points: c.points,
        // Direction comes from the contribution's sign, not from the word
        // list the phrase came from. A buzzword is only "toward ghost" if
        // the model actually learned it that way - and on this dataset
        // several features trained against their own hypothesis.
        direction: c.contribution > 0 ? "toward-ghost" : "toward-real",
      };
    })
    .filter(Boolean);
}

/**
 * Render the posting with those matches marked up.
 *
 * Escaping happens per slice, so a posting containing <script> is shown
 * as text rather than run. The title attribute is a native tooltip: no
 * layer to position, it works on keyboard focus, and assistive technology
 * reads it.
 */
function annotateWithContributions(text, config, contributions) {
  const spans = matchesWithContributions(text, config, contributions);
  let html = "";
  let cursor = 0;
  for (const span of spans) {
    if (span.start < cursor) continue;
    html += escapeHtml(text.slice(cursor, span.start));
    const points = span.points >= 0 ? `+${span.points.toFixed(1)}` : span.points.toFixed(1);
    html +=
      `<mark class="${span.direction}" tabindex="0" ` +
      `title="${escapeHtml(span.label)} — ${points} points">` +
      `${escapeHtml(text.slice(span.start, span.end))}</mark>`;
    cursor = span.end;
  }
  html += escapeHtml(text.slice(cursor));
  return { html, count: spans.length };
}

export {
  normalizeWithMap,
  findMatches,
  annotate,
  matchesWithContributions,
  annotateWithContributions,
  LIST_TO_FEATURE,
};
