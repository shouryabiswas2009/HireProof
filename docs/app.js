/*
 * Wires the page together: load the model, react to the buttons, draw the
 * result. All the thinking lives in features.js and scorer.js; this file
 * only moves values onto the screen.
 */

import { loadPhrases } from "./features.js?v=10";
import { loadModel, score, band } from "./scorer.js?v=10";
import { annotate } from "./highlight.js?v=10";

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

// A deliberately mediocre posting for the "Load an example" button: it has
// signals pointing both ways, so the demo shows a nuanced breakdown rather
// than a cartoonish 99%.
const EXAMPLE_POSTING = `Marketing Coordinator

We are a fast-paced, dynamic company looking for a self-starter to join our growing team. This is an exciting opportunity to make an impact.

Responsibilities include supporting various marketing initiatives, assisting with campaigns, and other duties as assigned. The successful candidate will be a detail-oriented team player who can wear many hats.

Requirements: 3+ years of experience in marketing. Strong communication skills.

We offer a competitive salary and a friendly working environment. Apply today!`;

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

const elements = {
  textarea: document.getElementById("posting"),
  wordCount: document.getElementById("word-count"),
  scoreButton: document.getElementById("score-button"),
  exampleButton: document.getElementById("example-button"),
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
  annotatedText: document.getElementById("annotated-text"),
  missingWrap: document.getElementById("missing-signals-wrap"),
  missingChips: document.getElementById("missing-signals"),
};

/** Show the honest facts about which model is loaded. */
function describeModel(model) {
  elements.repoLink.href = REPO_URL;

  if (model.trained_on === "demo") {
    elements.demoBanner.hidden = false;
    elements.demoBannerText.textContent =
      "This model was trained on synthetic postings written by hand to test the " +
      "system, not on real job adverts. Scores demonstrate how the tool works; " +
      "they are not evidence about any real posting.";
  }

  const metrics = model.metrics || {};
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

/** Live word count, so it is obvious whether enough text was pasted. */
function updateWordCount() {
  const words = elements.textarea.value.trim().split(/\s+/).filter(Boolean).length;
  elements.wordCount.textContent = words === 1 ? "1 word" : `${words} words`;
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
  const text = elements.textarea.value.trim();
  if (text.length < 40) {
    // Too short to contain any of the signals, so a score would be
    // meaningless rather than merely uncertain. Shown inline rather than
    // as an alert() popup, which is jarring and blocks the page.
    elements.inputError.textContent =
      "That is too short to score. Paste at least a sentence or two of the posting.";
    elements.inputError.hidden = false;
    elements.results.hidden = true;
    elements.textarea.focus();
    return;
  }
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

async function start() {
  try {
    // Both files are needed before anything can be scored: the phrase lists
    // to build features, and the model to weigh them.
    const [phraseConfig, model] = await Promise.all([loadPhrases(), loadModel()]);
    PHRASE_CONFIG = phraseConfig;
    describeModel(model);
    elements.scoreButton.disabled = false;
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
elements.textarea.addEventListener("input", updateWordCount);
elements.exampleButton.addEventListener("click", () => {
  elements.textarea.value = EXAMPLE_POSTING;
  updateWordCount();
  handleScore();
});
elements.clearButton.addEventListener("click", () => {
  elements.textarea.value = "";
  updateWordCount();
  elements.results.hidden = true;
  elements.inputError.hidden = true;
  elements.textarea.focus();
});

elements.scoreButton.disabled = true;
updateWordCount();
start();
