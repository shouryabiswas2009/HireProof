/*
 * Wires the page together: load the model, react to the buttons, draw the
 * result. All the thinking lives in features.js and scorer.js; this file
 * only moves values onto the screen.
 */

import { loadPhrases } from "./features.js";
import { loadModel, score, band } from "./scorer.js";

// Change this if you fork the project.
const REPO_URL = "https://github.com/shouryabiswas2009/hireproof";

// Contributions smaller than this are rounding noise: the posting sits
// essentially at the training average for that signal, so drawing a bar
// for it would imply a factor that did not really apply.
const MEANINGFUL = 0.01;

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

// Honour the OS "reduce motion" setting in JS too. CSS handles the
// declarative animations; this covers the ones we drive by hand, like the
// counting score, which CSS cannot switch off.
const prefersReducedMotion =
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const elements = {
  textarea: document.getElementById("posting"),
  wordCount: document.getElementById("word-count"),
  scoreButton: document.getElementById("score-button"),
  exampleButton: document.getElementById("example-button"),
  clearButton: document.getElementById("clear-button"),
  results: document.getElementById("results"),
  meterFill: document.getElementById("meter-fill"),
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

  chart.append(left, axis, right);
  li.append(name, chart);
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
  if (prefersReducedMotion) {
    elements.scoreValue.textContent = `${target}%`;
    return;
  }
  const duration = 700;
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
  elements.meterFill.style.width = `${percent}%`;
  // One custom property drives the meter fill, its track and the badge icon.
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
    meaningful.forEach((item, index) => {
      elements.contributions.appendChild(contributionRow(item, largest, index));
    });
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

  elements.results.hidden = false;
  elements.results.scrollIntoView({ behavior: "smooth", block: "start" });
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
  if (prefersReducedMotion || !("IntersectionObserver" in window)) return;

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
  if (!spotlight || prefersReducedMotion) return;
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
    const [, model] = await Promise.all([loadPhrases(), loadModel()]);
    describeModel(model);
    elements.scoreButton.disabled = false;
    setUpScrollReveal();
    setUpSpotlight();
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
