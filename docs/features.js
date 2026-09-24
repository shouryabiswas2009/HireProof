/*
 * Turns a job posting's text into numbers, in the visitor's browser.
 *
 * This is a deliberate mirror of ghostjob/features.py. The training code is
 * Python; the website is JavaScript; both must produce IDENTICAL numbers for
 * the same posting. If they ever disagree, the model is fed inputs it was
 * never trained on and the scores quietly become nonsense. That failure is
 * called train/serve skew, and it is the main risk in this design.
 *
 * Three things keep the two in step:
 *   1. Every word list and regex lives in one shared file (phrases.json),
 *      which train.py copies next to this script. Neither copy owns them.
 *   2. tests/fixtures/feature_cases.json holds postings with expected
 *      numbers, and BOTH test suites run them.
 *   3. The logic below is kept deliberately plain, so there is little room
 *      for the two languages to behave differently.
 *
 * Why do the scoring here at all, rather than on a server? No server means
 * no hosting cost and nothing that can be billed, and the posting text never
 * leaves the visitor's computer. For a tool people paste job applications
 * into, that privacy is a real benefit, not just a convenience.
 */

// Filled in by loadPhrases() before any scoring happens.
let PHRASES = null;
let PATTERNS = null;
let THRESHOLDS = null;

// The feature order. Everything refers to features by NAME rather than
// position, so this list is only for display ordering.
const FEATURE_NAMES = [
  "has_salary_range",
  "vague_pay_phrase",
  "log_word_count",
  "buzzword_density",
  "concrete_duty_density",
  "names_reporting_line",
  "has_contact_email",
  "evergreen_language",
  "multiple_openings_language",
  "has_deadline_or_start_date",
  "experience_mismatch",
];

/**
 * Set up the word lists and compile the regexes from an already-parsed
 * config object.
 *
 * Kept separate from loadPhrases() because the browser gets the file over
 * HTTP while the Node test suite reads it straight off disk. Both end up
 * here, so both are configured identically.
 */
function initPhrases(config) {
  PHRASES = config.phrase_lists;
  THRESHOLDS = config.thresholds;

  // Build the regexes once rather than on every keystroke. The "i" flag
  // matches Python's re.IGNORECASE; "g" is needed to find every match of
  // the years pattern, not just the first.
  PATTERNS = {};
  for (const [name, spec] of Object.entries(config.patterns)) {
    if (name.startsWith("_")) continue;
    PATTERNS[name] = {
      single: new RegExp(spec.regex, "i"),
      all: new RegExp(spec.regex, "gi"),
    };
  }
  return config;
}

/**
 * Fetch the shared word lists over HTTP, then set them up.
 *
 * cache: "no-cache" for the same reason as the model file: train.py
 * refreshes this copy on every run, and scoring with last week's word
 * lists but this week's weights would be silently wrong. The browser
 * still caches; it just revalidates first.
 */
async function loadPhrases(url = "phrases.json") {
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`Could not load ${url} (HTTP ${response.status})`);
  }
  return initPhrases(await response.json());
}

/**
 * Lowercase and collapse all whitespace, matching Python's
 * " ".join(text.lower().split()).
 *
 * The filter(Boolean) matters: in JavaScript "  a".split(/\s+/) produces a
 * leading empty string, whereas Python's .split() drops it. Without the
 * filter the word count would be one too high on any text starting with a
 * space, and every density feature would be slightly wrong.
 */
function normalize(text) {
  return text.toLowerCase().split(/\s+/).filter(Boolean).join(" ");
}

/** Count how many phrases from the list appear (each phrase once only). */
function countPhrases(normalizedText, phraseList) {
  let count = 0;
  for (const phrase of phraseList) {
    if (normalizedText.includes(phrase)) count += 1;
  }
  return count;
}

/** The largest "N years experience" figure in the text, or 0. */
function maxYearsRequired(normalizedText) {
  let largest = 0;
  // matchAll needs a fresh lastIndex; using a "g" regex repeatedly without
  // resetting is a classic JavaScript bug, so we rebuild the iterator here.
  PATTERNS.years_required.all.lastIndex = 0;
  for (const match of normalizedText.matchAll(PATTERNS.years_required.all)) {
    const years = parseInt(match[1], 10);
    if (!Number.isNaN(years) && years > largest) largest = years;
  }
  return largest;
}

/**
 * Turn raw posting text into { featureName: number }.
 * Mirrors extract_features() in ghostjob/features.py line for line.
 */
function extractFeatures(text) {
  const normalized = normalize(text);
  // Python's "".split() returns an empty list, but JavaScript's
  // "".split(" ") returns [""], so an empty posting would count as 1 word.
  const wordCount = normalized === "" ? 0 : normalized.split(" ").length;

  // Densities are per 100 words so that a long posting isn't automatically
  // "more buzzwordy" simply for being long. max(...,1) avoids dividing by
  // zero on empty input.
  const per100Words = 100.0 / Math.max(wordCount, 1);

  const buzzwordHits = countPhrases(normalized, PHRASES.buzzwords);
  const concreteHits = countPhrases(normalized, PHRASES.concrete_duty);
  // NOTE: "immediate start" and "as soon as possible" were removed from
  // the deadline_or_start list; see shared/phrases.json for why.
  const hasDate = countPhrases(normalized, PHRASES.deadline_or_start) > 0;

  const isEntryLevel = countPhrases(normalized, PHRASES.entry_level) > 0;
  const demandsExperience =
    maxYearsRequired(normalized) >= THRESHOLDS.experience_mismatch_years;

  return {
    has_salary_range: PATTERNS.salary_amount.single.test(normalized) ? 1.0 : 0.0,
    vague_pay_phrase: countPhrases(normalized, PHRASES.vague_pay) ? 1.0 : 0.0,
    log_word_count: Math.log(1 + wordCount),
    buzzword_density: buzzwordHits * per100Words,
    concrete_duty_density: concreteHits * per100Words,
    names_reporting_line: countPhrases(normalized, PHRASES.reporting_line) ? 1.0 : 0.0,
    has_contact_email: PATTERNS.contact_email.single.test(normalized) ? 1.0 : 0.0,
    evergreen_language: countPhrases(normalized, PHRASES.evergreen) ? 1.0 : 0.0,
    multiple_openings_language: countPhrases(normalized, PHRASES.multiple_openings) ? 1.0 : 0.0,
    has_deadline_or_start_date: hasDate ? 1.0 : 0.0,
    experience_mismatch: isEntryLevel && demandsExperience ? 1.0 : 0.0,
  };
}

// Exported for the browser (via window) and for the Node test runner
// (via export), so the same file serves both without duplication.
if (typeof window !== "undefined") {
  window.GhostFeatures = { loadPhrases, normalize, extractFeatures, FEATURE_NAMES };
}
export {
  initPhrases, loadPhrases, normalize, countPhrases,
  maxYearsRequired, extractFeatures, FEATURE_NAMES,
};
