/*
 * Wires the page together: load the model, react to the buttons, draw the
 * result. All the thinking lives in features.js and scorer.js; this file
 * only moves values onto the screen.
 */

import { loadPhrases } from "./features.js?v=20";
import { loadModel, score, band } from "./scorer.js?v=20";
import { annotate } from "./highlight.js?v=20";
import { setUpTabs } from "./tabs.js?v=20";
import { checkInput, MIN_WORDS } from "./validate.js?v=20";

// Change this if you fork the project.
const REPO_URL = "https://github.com/shouryabiswas2009/hireproof";

// Contributions smaller than this are rounding noise: the posting sits
// essentially at the training average for that signal, so drawing a bar
// for it would imply a factor that did not really apply.
const MEANINGFUL = 0.01;

// How many signals the chart shows. The rest stay in the table view below,
// so nothing is hidden — but a chart of eleven near-identical bars buries
// the two or three that actually decided the answer.
const TOP_N = 5;

/*
 * Three examples, so a visitor can see the range without pasting anything.
 *
 * The borderline one is the important one. A demo that only ever shows
 * confident answers misrepresents how the tool behaves on real postings,
 * most of which sit somewhere in the middle. All three are written for
 * this page rather than copied from real adverts.
 */
const EXAMPLES = {
  ghost: `Join Our Talent Community

We are always looking for passionate, driven individuals to join our growing team. This is an exciting opportunity to make an impact at a company that is changing the industry.

We are a fast-paced, dynamic environment where no two days are the same and you will wear many hats. The successful candidate will be a self-starter and team player who can hit the ground running.

There is no specific opening at this time, but we will keep your resume on file for future opportunities across various locations.

Competitive salary and benefits for the right candidate. Apply today!`,

  genuine: `Backend Engineer, Payments Team

Salary: $98,000 - $118,000 per year, depending on experience.

You will report to Priya Raman, who leads our six-person payments team. In this role you will own the refunds service end to end, write Go and Postgres, and take part in the on-call rotation one week in six.

Our stack is Go, Postgres and Kubernetes. In your first 90 days you will ship a change to production and take over the weekly release checklist.

We require 3+ years of backend experience. Applications close on 14 March and the anticipated start date is 5 May.

Questions about the role? Email priya.raman@example.com and she will answer directly.`,

  /*
   * Chosen by testing, not by eye. The first attempt at a "borderline"
   * example read as mixed to a human but scored 92%, because it had
   * buzzwords AND no salary AND no deadline AND no named manager. This
   * one keeps the buzzwords but adds a real pay range and a closing date,
   * which pulls it into the middle band where it belongs.
   */
  borderline: `Operations Associate

We are a fast-paced, growing team and this is an exciting opportunity to make an impact. The successful candidate will be a detail-oriented team player who can wear many hats.

Responsibilities include supporting various operational initiatives and other duties as assigned.

Salary: $52,000 - $58,000 per year. Applications close on 30 April.`,
};

// Icons for the score badge. A status colour must never carry meaning on
// its own, so each band ships an icon and words alongside the colour.
const BAND_ICONS = {
  low: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  medium: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="13"/><line x1="12" y1="16.5" x2="12" y2="16.5"/></svg>`,
  high: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><line x1="12" y1="9" x2="12" y2="13.5"/><line x1="12" y1="17" x2="12" y2="17"/></svg>`,
};

const BAND_COLORS = {
  low: "var(--status-good)",
  medium: "var(--status-warn)",
  high: "var(--status-bad)",
};

// Tell the stylesheet JavaScript is running. Animations that start an
// element invisible are scoped to .js, so with JS disabled (or if this
// script fails to load) everything renders plainly and visibly instead of
// staying blank forever.
document.documentElement.classList.add("js");

// ---------------------------------------------------------------- Motion
// Whether animation runs depends on two things: what the operating system
// asks for, and whether the visitor overrode it with the footer toggle.
// The system preference is the default; the toggle only wins when someone
// deliberately sets it.
//
// This matters more than it sounds. Plenty of people switch Windows
// animations off for speed rather than because motion bothers them, and
// browsers report that as prefers-reduced-motion, so they were getting a
// completely static page with no way to ask for anything else.
const MOTION_KEY = "hireproof:motion";
const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

/** The visitor's saved choice: "on", "off", or null for "follow the OS". */
function savedMotionChoice() {
  try {
    return localStorage.getItem(MOTION_KEY);
  } catch {
    // Private browsing and blocked storage both throw here. Falling back
    // to the system preference is the right answer, not a crash.
    return null;
  }
}

function motionEnabled() {
  const choice = savedMotionChoice();
  if (choice === "on") return true;
  if (choice === "off") return false;
  return !motionQuery.matches;
}

/** Stamp the decision onto <html> so the stylesheet can act on it. */
function applyMotionSetting() {
  const on = motionEnabled();
  document.documentElement.dataset.motion = on ? "on" : "off";

  const button = document.getElementById("motion-toggle");
  if (button) {
    button.setAttribute("aria-pressed", String(on));
    document.getElementById("motion-label").textContent =
      on ? "Animations on" : "Animations off";
    button.title = on
      ? "Turn the background animation off"
      : "Turn the background animation on";
  }
}

function setUpMotionToggle() {
  const button = document.getElementById("motion-toggle");
  if (!button) return;

  button.addEventListener("click", () => {
    const next = motionEnabled() ? "off" : "on";
    try {
      localStorage.setItem(MOTION_KEY, next);
    } catch {
      // Can't persist it; still honour the choice for this page view.
    }
    applyMotionSetting();
  });

  // If the visitor has made no explicit choice, follow the system when it
  // changes rather than staying on a stale decision.
  motionQuery.addEventListener("change", () => {
    if (savedMotionChoice() === null) applyMotionSetting();
  });
}

// ----------------------------------------------------------------- Theme
// Three states, not two: light, dark, or follow the operating system.
// "System" has to be a real option rather than just the starting value,
// otherwise someone who tries the switch can never get back to having the
// page track their OS when it flips at sunset.
//
// The stylesheet does the actual work through light-dark(), so all this
// has to do is set `color-scheme` via a data-theme attribute.
const THEME_KEY = "hireproof:theme";
const THEMES = ["system", "light", "dark"];

const THEME_ICONS = {
  system: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="4" width="19" height="13" rx="2"/><line x1="8" y1="20.5" x2="16" y2="20.5"/></svg>`,
  light: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`,
  dark: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/></svg>`,
};

function savedTheme() {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return THEMES.includes(value) ? value : "system";
  } catch {
    return "system";
  }
}

function applyTheme() {
  const theme = savedTheme();
  // Removing the attribute (rather than setting "system") lets the
  // stylesheet's `color-scheme: light dark` fall back to the OS.
  if (theme === "system") {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = theme;
  }
  const icon = document.getElementById("theme-icon");
  const label = document.getElementById("theme-label");
  if (icon) icon.innerHTML = THEME_ICONS[theme];
  if (label) label.textContent = `Theme: ${theme}`;
}

function setUpThemeToggle() {
  const button = document.getElementById("theme-toggle");
  if (!button) return;
  button.addEventListener("click", () => {
    const next = THEMES[(THEMES.indexOf(savedTheme()) + 1) % THEMES.length];
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Can't persist; still honour it for this page view.
    }
    applyTheme();
  });
}

// Decide before anything renders, so there is no flash of animation for
// someone who has asked not to see it.
applyTheme();
setUpThemeToggle();
applyMotionSetting();
setUpMotionToggle();

let PHRASE_CONFIG = null;
let MODEL_READY = false;

const elements = {
  textarea: document.getElementById("posting"),
  wordCount: document.getElementById("word-count"),
  scoreButton: document.getElementById("score-button"),
  clearButton: document.getElementById("clear-button"),
  results: document.getElementById("results"),
  needle: document.getElementById("gauge-needle"),
  scoreValue: document.getElementById("score-value"),
  verdict: document.querySelector(".verdict"),
  verdictTitle: document.getElementById("verdict-title"),
  verdictBlurb: document.getElementById("verdict-blurb"),
  bandIcon: document.getElementById("band-icon"),
  contributions: document.getElementById("contributions"),
  rawTableBody: document.querySelector("#raw-table tbody"),
  signalList: document.getElementById("signal-list"),
  demoBanner: document.getElementById("demo-banner"),
  demoBannerText: document.getElementById("demo-banner-text"),
  modelFacts: document.getElementById("model-facts"),
  repoLink: document.getElementById("repo-link"),
  inputError: document.getElementById("input-error"),
  inputHint: document.getElementById("input-hint"),
  announcement: document.getElementById("score-announcement"),
  annotatedText: document.getElementById("annotated-text"),
  missingWrap: document.getElementById("missing-signals-wrap"),
  missingChips: document.getElementById("missing-signals"),
};

/** Show the honest facts about which model is loaded. */
function describeModel(model) {
  elements.repoLink.href = REPO_URL;
  const repoLink2 = document.getElementById("repo-link-2");
  if (repoLink2) repoLink2.href = REPO_URL;

  if (model.trained_on === "demo") {
    elements.demoBanner.hidden = false;
    elements.demoBannerText.textContent =
      "This model was trained on synthetic postings written by hand to test the " +
      "system, not on real job adverts. Scores demonstrate how the tool works; " +
      "they are not evidence about any real posting.";
  }

  const metrics = model.metrics || {};

  // A one-line version of the model's record, sitting with the score
  // rather than on another tab. Someone reading a result should not have
  // to go looking for how much the number is worth.
  const line = document.getElementById("model-line");
  if (line) {
    const folds = metrics.cv_folds || 5;
    const kind = model.trained_on === "demo" ? "synthetic" : "hand-labelled";
    line.textContent =
      `This model scores ${(metrics.cv_accuracy * 100).toFixed(0)}% accuracy ` +
      `against a ${(metrics.baseline_accuracy * 100).toFixed(0)}% baseline ` +
      `(${folds}-fold cross-validation), trained on ${model.n_examples} ` +
      `${kind} postings.`;
  }

  elements.modelFacts.textContent =
    `Current model: trained ${model.trained_date} on ${model.n_examples} ` +
    `postings (${model.n_ghost} ghost, ${model.n_legit} legit). ` +
    `Cross-validated accuracy ${(metrics.cv_accuracy * 100).toFixed(0)}%, ` +
    `against ${(metrics.baseline_accuracy * 100).toFixed(0)}% for always ` +
    `guessing the commonest answer.`;

  // List the signals the model reads, straight from the model file, so this
  // section can never fall out of step with what was actually trained.
  elements.signalList.replaceChildren();
  for (const name of model.feature_names) {
    const li = document.createElement("li");
    li.textContent = model.feature_labels[name] || name;
    elements.signalList.appendChild(li);
  }
}


/* ------------------------------------------------------- The model tab
 * Everything here is read out of model.json rather than written by hand,
 * so the page always describes the model the site is actually running. If
 * someone retrains and pushes new weights, this updates itself.
 */

/** One labelled number. */
function statTile(label, value, note) {
  const tile = document.createElement("div");
  tile.className = "stat";
  tile.innerHTML =
    `<span class="stat-value"></span>` +
    `<span class="stat-label"></span>` +
    (note ? `<span class="stat-note"></span>` : "");
  // textContent rather than template interpolation: these values come from
  // a JSON file, and building HTML out of them would be an injection route
  // the moment that file is ever generated from posting text.
  tile.querySelector(".stat-value").textContent = value;
  tile.querySelector(".stat-label").textContent = label;
  if (note) tile.querySelector(".stat-note").textContent = note;
  return tile;
}

function renderModelTab(model) {
  const metrics = model.metrics || {};
  const pct = (x) => `${Math.round((x || 0) * 100)}%`;

  // --- Training data -------------------------------------------------
  const stats = document.getElementById("model-stats");
  if (stats) {
    stats.replaceChildren(
      statTile("Postings labelled", String(model.n_examples), `trained ${model.trained_date}`),
      statTile("Ghost", String(model.n_ghost), share(model.n_ghost, model.n_examples)),
      statTile("Genuine", String(model.n_legit), share(model.n_legit, model.n_examples)),
      statTile("Signals used", String(model.feature_names.length), "per posting")
    );
  }

  // --- Performance ----------------------------------------------------
  const metricRow = document.getElementById("model-metrics");
  if (metricRow) {
    const lift = (metrics.cv_accuracy || 0) - (metrics.baseline_accuracy || 0);
    metricRow.replaceChildren(
      statTile("Accuracy", pct(metrics.cv_accuracy), "cross-validated"),
      statTile("Baseline", pct(metrics.baseline_accuracy), "always guess the commonest"),
      statTile("Beats baseline by", (lift >= 0 ? "+" : "−") + pct(Math.abs(lift)),
               lift <= 0.01 ? "no real edge" : "the number that matters"),
      statTile("Precision", pct(metrics.cv_precision), "of those called ghost, this share were"),
      statTile("Recall", pct(metrics.cv_recall), "of real ghost postings, this share caught")
    );
  }

  // --- Learned weights, as a diverging chart --------------------------
  const list = document.getElementById("model-weights");
  if (list) {
    const rows = model.feature_names
      .map((name, i) => ({
        name,
        label: model.feature_labels[name] || name,
        weight: model.weights[i],
      }))
      .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));

    const largest = Math.abs(rows[0]?.weight || 0);
    list.replaceChildren();
    rows.forEach((row, index) => {
      list.appendChild(
        weightRow(row, largest, index)
      );
    });
  }

  // --- Whatever the training run complained about ---------------------
  const card = document.getElementById("model-warnings-card");
  const warnings = document.getElementById("model-warnings");
  if (card && warnings && (model.warnings || []).length) {
    warnings.replaceChildren();
    for (const text of model.warnings) {
      const li = document.createElement("li");
      li.textContent = text;
      warnings.appendChild(li);
    }
    card.hidden = false;
  }

  const banner = document.getElementById("model-banner");
  if (banner && model.trained_on === "demo") {
    document.getElementById("model-banner-text").textContent =
      "These numbers come from synthetic postings written by hand to test the " +
      "system. They show the pipeline working; they are not a real result.";
    banner.hidden = false;
  }
}

function share(part, whole) {
  if (!whole) return "";
  return `${Math.round((part / whole) * 100)}% of the set`;
}

/** A row of the learned-weights chart; same shape as the score breakdown. */
function weightRow(row, largest, index) {
  const towardGhost = row.weight > 0;
  const width = largest > 0 ? (Math.abs(row.weight) / largest) * 100 : 0;

  const li = document.createElement("li");
  li.className = "crow";
  li.style.setProperty("--i", index);
  li.title = `${row.label}: ${towardGhost ? "+" : ""}${row.weight.toFixed(3)}`;

  const name = document.createElement("span");
  name.className = "crow-name";
  name.textContent = row.label;

  const chart = document.createElement("span");
  chart.className = "crow-chart";
  const left = document.createElement("span");
  left.className = "crow-half crow-left";
  const axis = document.createElement("span");
  axis.className = "crow-axis";
  const right = document.createElement("span");
  right.className = "crow-half crow-right";

  const bar = document.createElement("span");
  bar.className = towardGhost ? "bar bar-raise" : "bar bar-lower";
  bar.style.width = `${width}%`;
  (towardGhost ? right : left).appendChild(bar);

  const amount = document.createElement("span");
  amount.className = "crow-amount";
  const points = document.createElement("span");
  points.className = "points";
  points.textContent = (row.weight >= 0 ? "+" : "−") + Math.abs(row.weight).toFixed(2);
  amount.appendChild(points);

  chart.append(left, axis, right);
  li.append(name, chart, amount);
  return li;
}

/**
 * Re-check the input and reflect it in the UI.
 *
 * The button is disabled until the text is scoreable, and the reason sits
 * right underneath it. A greyed-out button with no explanation is a dead
 * end: the reader can see something is wrong but not what.
 */
function refreshInputState() {
  const verdict = checkInput(elements.textarea.value);

  elements.wordCount.textContent =
    verdict.words === 1 ? "1 word" : `${verdict.words} words`;

  elements.scoreButton.disabled = !verdict.ok || !MODEL_READY;

  if (!MODEL_READY) {
    elements.inputHint.textContent = "Loading the model…";
  } else {
    // An empty box is the normal starting state, not a mistake, so it
    // gets the neutral prompt rather than a complaint.
    elements.inputHint.textContent = verdict.ok ? "" : verdict.message;
  }
  elements.inputHint.hidden = elements.inputHint.textContent === "";
  elements.inputHint.classList.toggle(
    "input-hint-warn", !verdict.ok && verdict.code !== "empty"
  );

  return verdict;
}

/**
 * Build one row of the diverging chart.
 *
 * Both arms are scaled against the SAME largest value, so bar lengths are
 * comparable across rows. Scaling each row to its own maximum would make
 * every row look equally important.
 */
function contributionRow(item, largest, index) {
  const towardGhost = item.contribution > 0;
  const width = largest > 0 ? (Math.abs(item.contribution) / largest) * 100 : 0;

  const li = document.createElement("li");
  li.className = "crow";
  li.dataset.signal = item.name;
  // The stylesheet turns this into an animation-delay, so the bars appear
  // one after another down the list rather than all at once.
  li.style.setProperty("--i", index);
  // Native tooltip with the exact number. The table view below carries the
  // same values, so nothing is only reachable by hovering.
  li.title = `${item.label}: ${towardGhost ? "+" : ""}${item.contribution.toFixed(3)}`;

  const name = document.createElement("span");
  name.className = "crow-name";
  name.textContent = item.label;

  const chart = document.createElement("span");
  chart.className = "crow-chart";

  const left = document.createElement("span");
  left.className = "crow-half crow-left";
  const axis = document.createElement("span");
  axis.className = "crow-axis";
  const right = document.createElement("span");
  right.className = "crow-half crow-right";

  const bar = document.createElement("span");
  bar.className = towardGhost ? "bar bar-raise" : "bar bar-lower";
  bar.style.width = `${width}%`;
  (towardGhost ? right : left).appendChild(bar);

  /*
   * A + or MINUS at the data end of the bar.
   *
   * Direction is already carried by which side of the zero line the bar
   * sits on, but that is a spatial cue, and the two colours are the
   * obvious thing a reader looks at. A glyph means the direction survives
   * colour blindness, a greyscale print and a screenshot pasted into a
   * document, none of which keep hue reliable.
   */
  const signGlyph = document.createElement("span");
  signGlyph.className = "bar-sign";
  signGlyph.setAttribute("aria-hidden", "true");   // the row text says it too
  signGlyph.textContent = towardGhost ? "+" : "−";
  (towardGhost ? right : left).appendChild(signGlyph);

  // The amount, in the reader's units. Strength ranks signals against one
  // another; points say what it cost on the actual score.
  const amount = document.createElement("span");
  amount.className = "crow-amount";
  const sign = item.points >= 0 ? "+" : "−";   // real minus sign
  amount.innerHTML =
    `<span class="strength strength-${item.strength}">${item.strength}</span>` +
    `<span class="points">${sign}${Math.abs(item.points).toFixed(1)} pts</span>`;

  chart.append(left, axis, right);
  li.append(name, chart, amount);
  return li;
}

/**
 * Count the score up from zero.
 *
 * Worth the few lines: a number that climbs makes the reader watch it and
 * gives the meter beside it something to move with. It is capped at a
 * short duration so it never delays reading the actual answer, and it is
 * skipped entirely under reduced motion.
 */
function animateScore(target) {
  if (!motionEnabled()) {
    elements.scoreValue.textContent = `${target}%`;
    return;
  }
  const duration = 1200;
  const start = performance.now();

  // Cancel any run still in flight, or two overlapping loops fight over
  // the same element and the number visibly jitters.
  if (animateScore.frame) cancelAnimationFrame(animateScore.frame);

  function step(now) {
    const t = Math.min((now - start) / duration, 1);
    // Ease-out cubic: fast at first, settling at the end.
    const eased = 1 - Math.pow(1 - t, 3);
    elements.scoreValue.textContent = `${Math.round(eased * target)}%`;
    if (t < 1) animateScore.frame = requestAnimationFrame(step);
  }
  animateScore.frame = requestAnimationFrame(step);
}

function render(result) {
  const percent = Math.round(result.probability * 100);
  const verdict = band(result.probability);

  animateScore(percent);

  // Point the needle. The gauge is a semicircle, so a probability of p maps
  // to p * 180 degrees of rotation: 0% points hard left, 100% hard right.
  // The needle is drawn pointing left at rest, so the rotation IS the
  // score with no offset to remember.
  elements.needle.setAttribute(
    "transform",
    `rotate(${result.probability * 180} 100 96)`
  );

  // Drives the badge icon colour. The gauge zones are always all three
  // colours, so only the badge follows the band.
  elements.verdict.style.setProperty("--meter-color", BAND_COLORS[verdict.key]);
  elements.bandIcon.innerHTML = BAND_ICONS[verdict.key];
  elements.verdictTitle.textContent = verdict.title;
  elements.verdictBlurb.textContent = verdict.blurb;

  const meaningful = result.contributions.filter(
    (item) => Math.abs(item.contribution) > MEANINGFUL
  );
  const largest = meaningful.length ? Math.abs(meaningful[0].contribution) : 0;

  elements.contributions.replaceChildren();
  if (meaningful.length === 0) {
    const li = document.createElement("li");
    li.className = "crow-empty";
    li.textContent =
      "No signal stood out: this posting sits close to the training average on every one.";
    elements.contributions.appendChild(li);
  } else {
    const shown = meaningful.slice(0, TOP_N);
    shown.forEach((item, index) => {
      elements.contributions.appendChild(contributionRow(item, largest, index));
    });

    // Say what was left out, rather than quietly truncating.
    const hidden = meaningful.length - shown.length;
    if (hidden > 0) {
      const li = document.createElement("li");
      li.className = "crow-more";
      li.textContent =
        `${hidden} more signal${hidden === 1 ? "" : "s"} moved the score by less. ` +
        `All eleven are in the table below.`;
      elements.contributions.appendChild(li);
    }
  }

  // The table view: every feature, including the ones that did nothing.
  elements.rawTableBody.replaceChildren();
  for (const item of result.contributions) {
    const tr = document.createElement("tr");
    const value = Number.isInteger(item.rawValue)
      ? String(item.rawValue)
      : item.rawValue.toFixed(2);
    const effect = `${item.contribution >= 0 ? "+" : ""}${item.contribution.toFixed(3)}`;
    // The table uses the neutral signal name, since the raw value sits
    // beside it; the chart above uses the state-aware wording.
    for (const text of [item.neutralLabel, value, effect]) {
      const td = document.createElement("td");
      td.textContent = text;
      tr.appendChild(td);
    }
    elements.rawTableBody.appendChild(tr);
  }

  renderAnnotatedText(result);

  /*
   * Announce the outcome, briefly.
   *
   * The two facts worth hearing are the number and what it means, plus
   * the single biggest driver. Putting aria-live on the result card
   * instead would read out the gauge, all five bars, the table and the
   * whole annotated posting, which is unusable.
   */
  const topFactor = meaningful[0];
  elements.announcement.textContent =
    `${percent} percent. ${verdict.title}.` +
    (topFactor ? ` Biggest factor: ${topFactor.label}.` : "");

  elements.results.hidden = false;
  elements.results.scrollIntoView({
    behavior: motionEnabled() ? "smooth" : "auto",
    block: "start",
  });
}

/**
 * Mark up the posting with the phrases that fired, and list the signals
 * that fired by being ABSENT.
 *
 * The absent ones need their own treatment rather than a highlight,
 * because there is nothing in the text to point at — and they are often
 * the strongest drivers. "No pay figure given" was the second biggest
 * factor on the example posting, and highlighting can say nothing about
 * it. Listing them as chips is the honest way to show a missing thing.
 */
function renderAnnotatedText(result) {
  if (!PHRASE_CONFIG) return;

  // Colour each highlight by what its feature did to THIS posting, rather
  // than by a fixed opinion about the phrase.
  const direction = {};
  for (const item of result.contributions) {
    direction[item.name] = item.contribution >= 0 ? 1 : -1;
  }

  // rawFeatures gates the highlights: a pattern can match words for a
  // feature that never actually fired (see annotate()).
  const { html } = annotate(
    elements.textarea.value, PHRASE_CONFIG, direction, result.rawFeatures
  );
  elements.annotatedText.innerHTML = html;

  /*
   * An "absent" signal is one whose raw value is 0 (the thing simply is
   * not there) and which pushed the score UP by being missing. Density
   * features are excluded: "fewer buzzwords than average" is not a
   * missing thing, it is a low count.
   */
  const missing = result.contributions.filter(
    (item) =>
      item.rawValue === 0 &&
      item.contribution > 0.01 &&
      !item.name.endsWith("_density") &&
      item.name !== "log_word_count"
  );

  elements.missingChips.replaceChildren();
  for (const item of missing) {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.dataset.signal = item.name;
    chip.textContent = item.label;
    elements.missingChips.appendChild(chip);
  }
  elements.missingWrap.hidden = missing.length === 0;
}

/**
 * Hovering a bar dims every highlight except that signal's, so you can see
 * exactly which words produced it. Done with one listener on the list
 * rather than one per row: fewer listeners, and it keeps working when the
 * rows are replaced on the next score.
 */
function setUpSignalFocus() {
  const block = document.querySelector(".annotated-block");
  if (!block) return;

  const focus = (signal) => {
    if (signal) block.dataset.focus = signal;
    else delete block.dataset.focus;
  };

  elements.contributions.addEventListener("pointerover", (event) => {
    const row = event.target.closest(".crow");
    focus(row ? row.dataset.signal : null);
  });
  elements.contributions.addEventListener("pointerleave", () => focus(null));

  // Keyboard users get the same thing by tabbing, since the rows are
  // focusable via the table view; this covers the pointer case only.
  elements.contributions.addEventListener("focusin", (event) => {
    const row = event.target.closest(".crow");
    if (row) focus(row.dataset.signal);
  });
  elements.contributions.addEventListener("focusout", () => focus(null));
}

function handleScore() {
  // One source of truth for whether the text is scoreable: the same check
  // that drives the button's disabled state.
  const verdict = refreshInputState();
  if (!verdict.ok) {
    elements.inputError.textContent = verdict.message;
    elements.inputError.hidden = false;
    elements.results.hidden = true;
    elements.textarea.focus();
    return;
  }
  const text = elements.textarea.value.trim();
  elements.inputError.hidden = true;

  // If rendering throws, say so plainly instead of leaving a half-drawn
  // result on screen. The realistic cause is a stale cached script running
  // against newer HTML after a deploy, which a reload fixes, so the message
  // says that rather than showing a raw error.
  try {
    render(score(text));
  } catch (error) {
    elements.results.hidden = true;
    elements.inputError.textContent =
      "Something went wrong displaying the result. Please reload the page " +
      `(your browser may be holding an old copy of this site). Details: ${error.message}`;
    elements.inputError.hidden = false;
  }
}

/**
 * Fade sections in as they scroll into view.
 *
 * IntersectionObserver rather than a scroll listener: the browser reports
 * visibility itself instead of us recalculating positions on every scroll
 * frame, which is both simpler and much cheaper.
 *
 * Each element is unobserved once shown, so the effect plays once and
 * content never fades back out while scrolling up.
 */
function setUpScrollReveal() {
  // #results is excluded: it is hidden until a posting is scored and has
  // its own entrance animation. Giving it opacity:0 from .reveal as well
  // would race with that and could leave it blank.
  const targets = document.querySelectorAll("main > .card:not(#results)");
  if (!("IntersectionObserver" in window)) return;

  targets.forEach((el) => el.classList.add("reveal"));

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("in-view");
        observer.unobserve(entry.target);
      }
    },
    // Trigger slightly before the element's top edge reaches the viewport
    // bottom, so it has finished appearing by the time it is read.
    { rootMargin: "0px 0px -40px 0px", threshold: 0.05 }
  );

  targets.forEach((el) => observer.observe(el));
}

/**
 * A soft glow that follows the cursor.
 *
 * Two details that make it feel right rather than cheap:
 *
 * 1. It EASES toward the pointer instead of being pinned to it. Locking it
 *    to the exact cursor position reads as a stuck decal; trailing very
 *    slightly behind reads as light.
 * 2. The mousemove handler only records coordinates. The actual move
 *    happens in a requestAnimationFrame loop, so however often the mouse
 *    fires we touch the DOM at most once per frame.
 *
 * Skipped entirely for touch input and for reduced motion.
 */
function setUpSpotlight() {
  const spotlight = document.getElementById("spotlight");
  if (!spotlight) return;
  // A coarse pointer means touch, where there is no cursor to follow.
  if (!window.matchMedia("(pointer: fine)").matches) return;

  let targetX = window.innerWidth / 2;
  let targetY = window.innerHeight / 2;
  let x = targetX;
  let y = targetY;
  let running = false;

  function frame() {
    // Move a fraction of the remaining distance each frame: fast when far
    // away, slowing as it arrives.
    x += (targetX - x) * 0.12;
    y += (targetY - y) * 0.12;
    spotlight.style.transform = `translate3d(${x}px, ${y}px, 0)`;

    // Stop the loop once it has essentially caught up, so an idle page
    // isn't burning a frame callback forever.
    if (Math.abs(targetX - x) > 0.5 || Math.abs(targetY - y) > 0.5) {
      requestAnimationFrame(frame);
    } else {
      running = false;
    }
  }

  window.addEventListener("pointermove", (event) => {
    // Checked per event rather than once at setup, so flipping the toggle
    // takes effect immediately instead of needing a reload.
    if (!motionEnabled()) return;
    targetX = event.clientX;
    targetY = event.clientY;
    spotlight.classList.add("on");
    if (!running) {
      running = true;
      requestAnimationFrame(frame);
    }
  }, { passive: true });
}


/* ==================================================== Compare two postings
 *
 * This reuses score() from scorer.js rather than reimplementing anything:
 * both sides go through the exact same model, features and standardisation
 * as the single-posting view. If the scoring changes, this changes with it.
 *
 * The interesting output is not the two numbers side by side — it is which
 * signals DIFFER. Two postings can reach a similar score for completely
 * different reasons, and the gap per signal is what tells you where they
 * actually part company.
 */

const compare = {
  a: document.getElementById("compare-a"),
  b: document.getElementById("compare-b"),
  aWords: document.getElementById("compare-a-words"),
  bWords: document.getElementById("compare-b-words"),
  aResult: document.getElementById("compare-a-result"),
  bResult: document.getElementById("compare-b-result"),
  button: document.getElementById("compare-button"),
  hint: document.getElementById("compare-hint"),
  verdict: document.getElementById("compare-verdict"),
  headline: document.getElementById("compare-headline"),
  summary: document.getElementById("compare-summary"),
  diff: document.getElementById("compare-diff"),
  announcement: document.getElementById("compare-announcement"),
};

function refreshCompareState() {
  if (!compare.a || !compare.b) return { ok: false };
  const first = checkInput(compare.a.value);
  const second = checkInput(compare.b.value);

  compare.aWords.textContent =
    first.words === 1 ? "1 word" : `${first.words} words`;
  compare.bWords.textContent =
    second.words === 1 ? "1 word" : `${second.words} words`;

  const ok = first.ok && second.ok && MODEL_READY;
  compare.button.disabled = !ok;

  // Name which side is the problem. "Paste at least 30 words" is unhelpful
  // when one of the two boxes is already full.
  let message = "";
  if (!MODEL_READY) message = "Loading the model…";
  else if (!first.ok && !second.ok) message = `Both postings: ${first.message}`;
  else if (!first.ok) message = `Posting A: ${first.message}`;
  else if (!second.ok) message = `Posting B: ${second.message}`;

  compare.hint.textContent = message;
  compare.hint.hidden = message === "";
  compare.hint.classList.toggle("input-hint-warn", message !== "" && MODEL_READY);
  return { ok, first, second };
}

/** A compact score readout under each textarea. */
function renderCompareSide(container, result, letter) {
  const verdict = band(result.probability);
  const percent = Math.round(result.probability * 100);
  container.replaceChildren();
  container.className = `compare-result compare-${verdict.key}`;

  const value = document.createElement("span");
  value.className = "compare-score";
  value.textContent = `${percent}%`;

  const label = document.createElement("span");
  label.className = "compare-band";
  label.textContent =
    verdict.key === "high" ? "reads ghost-like"
      : verdict.key === "medium" ? "mixed signals"
        : "reads genuine";

  container.append(value, label);
  container.hidden = false;
  container.setAttribute(
    "aria-label",
    `Posting ${letter}: ${percent} percent, ${label.textContent}`
  );
}

/** One row of the difference chart. */
function diffRow(item, largest, index) {
  const favoursA = item.gap > 0;   // this signal pushed A's score higher
  const width = largest > 0 ? (Math.abs(item.gap) / largest) * 100 : 0;

  const li = document.createElement("li");
  li.className = "crow";
  li.style.setProperty("--i", index);
  li.title =
    `${item.label}: A ${item.a >= 0 ? "+" : ""}${item.a.toFixed(2)}, ` +
    `B ${item.b >= 0 ? "+" : ""}${item.b.toFixed(2)}`;

  const name = document.createElement("span");
  name.className = "crow-name";
  name.textContent = item.label;

  const chart = document.createElement("span");
  chart.className = "crow-chart";
  const left = document.createElement("span");
  left.className = "crow-half crow-left";
  const axis = document.createElement("span");
  axis.className = "crow-axis";
  const right = document.createElement("span");
  right.className = "crow-half crow-right";

  const bar = document.createElement("span");
  bar.className = favoursA ? "bar bar-raise" : "bar bar-lower";
  bar.style.width = `${width}%`;
  (favoursA ? right : left).appendChild(bar);

  // A letter rather than a plus sign here: the two directions mean
  // "worse for A" and "worse for B", which a sign cannot express.
  const glyph = document.createElement("span");
  glyph.className = "bar-sign";
  glyph.setAttribute("aria-hidden", "true");
  glyph.textContent = favoursA ? "A" : "B";
  (favoursA ? right : left).appendChild(glyph);

  const amount = document.createElement("span");
  amount.className = "crow-amount";
  const points = document.createElement("span");
  points.className = "points";
  points.textContent = `worse for ${favoursA ? "A" : "B"}`;
  amount.appendChild(points);

  chart.append(left, axis, right);
  li.append(name, chart, amount);
  return li;
}

function handleCompare() {
  const state = refreshCompareState();
  if (!state.ok) return;

  // The same scoring path as the single-posting view.
  const a = score(compare.a.value);
  const b = score(compare.b.value);

  renderCompareSide(compare.aResult, a, "A");
  renderCompareSide(compare.bResult, b, "B");

  const aPct = Math.round(a.probability * 100);
  const bPct = Math.round(b.probability * 100);
  const spread = Math.abs(aPct - bPct);

  /*
   * Refuse to name a winner on a small gap.
   *
   * These probabilities are not calibrated, so a few points between two
   * postings is well inside the noise. Declaring one better on that
   * basis would be the kind of false confidence the rest of the site works to
   * avoid.
   */
  let headline;
  if (spread < 5) {
    headline = "Too close to call";
    compare.summary.textContent =
      `A scores ${aPct}% and B scores ${bPct}%. That gap is small enough to ` +
      `be noise on a model this size, so treat them as equivalent.`;
  } else {
    const higher = aPct > bPct ? "A" : "B";
    const lower = aPct > bPct ? "B" : "A";
    headline = `Posting ${lower} reads more genuine`;
    compare.summary.textContent =
      `A scores ${aPct}% and B scores ${bPct}%, a ${spread}-point gap. ` +
      `Posting ${higher} carries more of the signals this model associates ` +
      `with ghost postings — a reason to ask questions about it, not a ` +
      `reason to rule it out.`;
  }
  compare.headline.textContent = headline;

  /*
   * The per-signal gap. Both sides already carry a contribution for every
   * feature, so lining them up by name gives the difference directly —
   * no re-scoring and no second code path to keep in step.
   */
  const byName = new Map(b.contributions.map((item) => [item.name, item]));
  const diffs = a.contributions
    .map((item) => {
      const other = byName.get(item.name);
      const otherValue = other ? other.contribution : 0;
      return {
        label: item.neutralLabel,
        a: item.contribution,
        b: otherValue,
        gap: item.contribution - otherValue,
      };
    })
    .filter((item) => Math.abs(item.gap) > MEANINGFUL)
    .sort((x, y) => Math.abs(y.gap) - Math.abs(x.gap));

  compare.diff.replaceChildren();
  if (diffs.length === 0) {
    const li = document.createElement("li");
    li.className = "crow-empty";
    li.textContent = "These two score the same on every signal the model reads.";
    compare.diff.appendChild(li);
  } else {
    const largest = Math.abs(diffs[0].gap);
    diffs.slice(0, TOP_N).forEach((item, index) => {
      compare.diff.appendChild(diffRow(item, largest, index));
    });
  }

  compare.announcement.textContent =
    `Posting A ${aPct} percent, posting B ${bPct} percent. ${headline}.`;
  compare.verdict.hidden = false;
}

function setUpCompare() {
  if (!compare.a || !compare.b) return;
  compare.a.addEventListener("input", refreshCompareState);
  compare.b.addEventListener("input", refreshCompareState);
  compare.button.addEventListener("click", handleCompare);

  document.getElementById("compare-example")?.addEventListener("click", () => {
    compare.a.value = EXAMPLES.ghost;
    compare.b.value = EXAMPLES.genuine;
    refreshCompareState();
    handleCompare();
  });
  document.getElementById("compare-clear")?.addEventListener("click", () => {
    compare.a.value = "";
    compare.b.value = "";
    compare.verdict.hidden = true;
    compare.aResult.hidden = true;
    compare.bResult.hidden = true;
    refreshCompareState();
    compare.a.focus();
  });

  refreshCompareState();
}

async function start() {
  try {
    // Both files are needed before anything can be scored: the phrase lists
    // to build features, and the model to weigh them.
    const [phraseConfig, model] = await Promise.all([loadPhrases(), loadModel()]);
    PHRASE_CONFIG = phraseConfig;
    describeModel(model);
    renderModelTab(model);
    MODEL_READY = true;
    refreshInputState();
    refreshCompareState();
    setUpScrollReveal();
    setUpSpotlight();
    setUpSignalFocus();
  } catch (error) {
    // Fail loudly and honestly rather than showing a broken page.
    elements.scoreButton.disabled = true;
    elements.demoBanner.hidden = false;
    elements.demoBanner.className = "banner banner-error";
    elements.demoBannerText.textContent =
      `Could not load the model (${error.message}). The scorer is unavailable.`;
  }
}

elements.scoreButton.addEventListener("click", handleScore);
elements.textarea.addEventListener("input", refreshInputState);
// One listener on the row rather than three, so adding a fourth example
// needs only the markup and an entry in EXAMPLES.
document.querySelector(".examples")?.addEventListener("click", (event) => {
  const chip = event.target.closest("[data-example]");
  if (!chip) return;
  elements.textarea.value = EXAMPLES[chip.dataset.example] || "";
  refreshInputState();
  handleScore();
});
elements.clearButton.addEventListener("click", () => {
  elements.textarea.value = "";
  refreshInputState();
  elements.results.hidden = true;
  elements.inputError.hidden = true;
  elements.textarea.focus();
});

refreshInputState();   // starts disabled: no text yet, and no model yet
setUpTabs();
setUpCompare();
start();
