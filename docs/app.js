/*
 * Wires the page together: load the model, score as the visitor types,
 * draw the result. All the thinking lives in features.js and scorer.js;
 * this file only moves values onto the screen.
 *
 * EVERY NUMBER ON THIS PAGE COMES FROM model.json. There is not a single
 * hardcoded percentage in the markup or in here - sample size, accuracy,
 * baseline, precision, recall and the label-evidence breakdown are all
 * read from the file train.py writes. Retraining updates the page. That
 * is deliberate: a figure typed into HTML is a figure that goes stale
 * silently, and the one thing this site cannot afford is to overstate
 * what the model can do.
 */

import { loadPhrases } from "./features.js?v=62";
import { loadModel, score, band, sigmoid, THRESHOLD_LOW, THRESHOLD_HIGH } from "./scorer.js?v=62";
import { annotateWithContributions } from "./highlight.js?v=62";
import { checkInput, MIN_WORDS } from "./validate.js?v=62";
import { EXAMPLES } from "./examples.js?v=62";

const REPO_URL = "https://github.com/shouryabiswas2009/HireProof";

// Contributions smaller than this are rounding noise: the posting sits
// essentially at the training average for that signal, so showing a bar
// would imply a factor that did not really apply.
const MEANINGFUL = 0.005;

// Typing is the input method, so scoring has to wait for a pause rather
// than run on every keystroke. 220ms is long enough that a fast typist
// does not trigger it mid-word and short enough to feel immediate.
const DEBOUNCE_MS = 220;

let MODEL = null;
let PHRASES = null;

const el = (id) => document.getElementById(id);
const pct = (x) => `${Math.round((x ?? 0) * 100)}%`;

/* ===================================================== Theme and motion */

const THEME_KEY = "hireproof:theme";

/*
 * DARK IS THE DEFAULT, deliberately, and not "whatever the OS says".
 *
 * The page is drawn for the dark palette: the warm charcoal surfaces and
 * the cream ink are the design, and the paper theme is the alternative.
 * Following prefers-color-scheme would mean most visitors never see the
 * intended version, so an unset preference resolves to dark here and the
 * stylesheet's `color-scheme: dark` agrees with it.
 *
 * The attribute is always written, never deleted, so the CSS and this
 * function can never disagree about which theme is showing.
 */
function applyTheme(choice) {
  const theme = choice === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = theme;

  // The button says what it will DO, not what is currently showing.
  const dark = theme === "dark";
  el("theme-label").textContent = dark ? "Light" : "Dark";
  el("theme-btn").setAttribute("aria-pressed", String(dark));
}

function setUpTheme() {
  let saved = null;
  try {
    saved = localStorage.getItem(THEME_KEY);
  } catch {
    // Private browsing throws on storage. Falling back to the default
    // theme is the right answer, not a crash.
  }
  applyTheme(saved);

  el("theme-btn").addEventListener("click", () => {
    const dark = el("theme-btn").getAttribute("aria-pressed") === "true";
    const next = dark ? "light" : "dark";
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Can't persist it; still honour the choice for this page view.
    }
    applyTheme(next);
  });
}

/* ======================================================= The two views */

/*
 * Edit and Highlights are the same text, rendered twice.
 *
 * Not a textarea with marks drawn over it: that needs a mirrored element
 * kept in perfect sync with the textarea's scroll position and metrics,
 * and it breaks the moment a font loads late or a line wraps differently.
 * Two plain views and a toggle are duller and always correct.
 */
function showView(which) {
  const marks = which === "marks";
  el("view-edit").hidden = marks;
  el("view-marks").hidden = !marks;
  el("view-edit-btn").setAttribute("aria-selected", String(!marks));
  el("view-marks-btn").setAttribute("aria-selected", String(marks));
}

function setUpViews() {
  el("view-edit-btn").addEventListener("click", () => showView("edit"));
  el("view-marks-btn").addEventListener("click", () => showView("marks"));
}

/* ============================================================= The result */

/*
 * Count the score up to its value instead of snapping to it.
 *
 * WHY BOTHER: the number changes on every keystroke once a posting is
 * long enough to score, and a figure that teleports between values is
 * genuinely harder to read than one that travels - you lose track of
 * whether it went up or down. The count gives the change a direction.
 *
 * The easing is computed per MILLISECOND, not per frame. A per-frame
 * factor silently runs at a different speed on a 120Hz screen than on a
 * throttled background tab, which is a bug this project has already hit
 * once; elapsed time is the only thing that behaves the same everywhere.
 *
 * Anyone who has asked for less motion gets the final value immediately.
 */
const COUNT_MS = 420;
let countFrame = null;

function countTo(node, target) {
  if (countFrame) cancelAnimationFrame(countFrame);

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const from = parseInt(node.textContent, 10);
  if (reduced || !Number.isFinite(from)) {
    node.textContent = `${target}%`;
    return;
  }

  const started = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - started) / COUNT_MS);
    // easeOutCubic: quick off the mark, settles gently on the value.
    const eased = 1 - Math.pow(1 - t, 3);
    node.textContent = `${Math.round(from + (target - from) * eased)}%`;
    countFrame = t < 1 ? requestAnimationFrame(step) : null;
  };
  countFrame = requestAnimationFrame(step);
}

function renderResult(text, result) {
  const verdict = band(result.probability);
  const percent = Math.round(result.probability * 100);

  el("empty-state").hidden = true;
  el("result").hidden = false;

  countTo(el("score-value"), percent);
  el("verdict-title").textContent = verdict.title;
  el("verdict-note").textContent = verdict.blurb;

  // scaleX rather than width: a transform composites, a width change
  // relayouts the bar on every frame of the ease.
  el("bar-fill").style.transform = `scaleX(${result.probability})`;

  /*
   * Mark the two band edges, and SAY WHAT THEY ARE.
   *
   * These previously rendered as a bare "40" and "70" sitting under the
   * bar with nothing identifying them - a reader had no way to tell a
   * threshold from a scale marking from an axis label. Each tick now
   * carries its own name, so the bar explains itself without the
   * surrounding prose having to.
   */
  el("bar-ticks").innerHTML = [
    [THRESHOLD_LOW, "genuine below"],
    [THRESHOLD_HIGH, "ghost above"],
  ]
    .map(
      ([t, name]) =>
        `<span class="bar-tick" style="left:${t * 100}%">${Math.round(
          t * 100
        )}%<b>${name}</b></span>`
    )
    .join("");

  const ood = el("ood-note");
  if (result.outOfDistribution) {
    const names = result.contributions
      .filter((c) => c.clamped)
      .map((c) => c.neutralLabel.toLowerCase());
    ood.textContent =
      `Treat this with extra caution: ${names.join(" and ")} ` +
      `${names.length === 1 ? "is" : "are"} outside the range of the postings ` +
      `this model was trained on, so the number is an extrapolation rather ` +
      `than a reading.`;
    ood.hidden = false;
  } else {
    ood.hidden = true;
  }

  const m = MODEL.metrics;
  el("model-line").textContent =
    `${pct(m.cv_accuracy)} accuracy against a ${pct(m.baseline_accuracy)} ` +
    `baseline (${m.cv_folds}-fold cross-validation) on ${MODEL.n_examples} ` +
    `hand-labelled postings.`;

  // The number and what it means. Putting aria-live on the whole panel
  // would read the entire breakdown and the annotated posting out again
  // on every keystroke.
  el("announce").textContent = `${percent} percent. ${verdict.title}.`;

  renderBreakdown(result);
  renderAnnotated(text, result);
}

function renderBreakdown(result) {
  const rows = result.contributions.filter(
    (c) => Math.abs(c.contribution) > MEANINGFUL
  );
  const largest = rows.length ? Math.abs(rows[0].contribution) : 1;

  el("breakdown").innerHTML = result.contributions
    .map((c) => {
      const ghost = c.contribution > 0;
      const width = (Math.abs(c.contribution) / largest) * 50; // half-axis
      const dir = ghost ? "toward-ghost" : "toward-real";
      const points = c.points >= 0 ? `+${c.points.toFixed(1)}` : c.points.toFixed(1);
      return `
        <li class="brow">
          <div>
            <div class="brow-name">${c.label}</div>
            <div class="brow-axis">
              <span class="brow-bar ${dir}" style="width:${width}%"></span>
            </div>
          </div>
          <div class="brow-meta">
            <span class="brow-sign ${dir}-ink">${ghost ? "+" : "−"}</span>
            ${points} pts
          </div>
        </li>`;
    })
    .join("");

  el("breakdown-panel").hidden = false;
}

function renderAnnotated(text, result) {
  const { html, count } = annotateWithContributions(
    text,
    PHRASES,
    result.contributions
  );
  el("annotated").innerHTML = html;
  el("match-count").textContent =
    `${count} phrase${count === 1 ? "" : "s"} matched`;

  // Signals that fired by being ABSENT need their own treatment: there is
  // nothing in the text to point at, and they are often the strongest
  // drivers. "No pay figure given" cannot be highlighted.
  const missing = result.contributions
    .filter((c) => c.rawValue === 0 && Math.abs(c.contribution) > MEANINGFUL)
    .map((c) => `<li>${c.label}</li>`)
    .join("");
  el("missing").innerHTML = missing;

  // The toggle only exists once there is something to highlight.
  el("view-toggle").hidden = false;
}

function clearResult() {
  el("result").hidden = true;
  el("breakdown-panel").hidden = true;
  // Nothing to highlight any more, so the toggle goes and the panel
  // returns to the editor - otherwise clearing the box would leave the
  // reader stranded on an empty Highlights view with no way back.
  el("view-toggle").hidden = true;
  showView("edit");
  el("empty-state").hidden = false;
  el("announce").textContent = "";
}

/* ======================================================== Live scoring */

let timer = 0;

function onInput() {
  const text = el("posting").value;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  el("word-count").textContent = `${words} word${words === 1 ? "" : "s"}`;

  clearTimeout(timer);
  timer = setTimeout(() => {
    if (!MODEL) return;
    const check = checkInput(text);
    if (!check.ok) {
      el("input-hint").textContent = text.trim()
        ? check.message || `Paste at least ${MIN_WORDS} words.`
        : "";
      el("result-state").textContent = "";
      clearResult();
      return;
    }
    el("input-hint").textContent = "";
    el("result-state").textContent = "live";
    // Wrapped, because a render bug must not take the whole page down -
    // see ARCHITECTURE section 3.3.
    try {
      renderResult(text, score(text));
    } catch (error) {
      el("result-state").textContent = "error";
      el("empty-state").innerHTML =
        `<p>Something went wrong scoring that posting. ` +
        `<a href="${REPO_URL}/issues">Report it</a> and it gets fixed.</p>`;
      clearResult();
      console.error(error);
    }
  }, DEBOUNCE_MS);
}

/* ================================================== How it works, live */

function renderHow() {
  const text = el("how-input").value;
  const steps = el("how-steps");
  // Clearing the steps must clear the caution with them, or an emptied
  // box leaves a warning on screen about text that is no longer there.
  if (!MODEL || !text.trim()) {
    steps.innerHTML = "";
    el("how-ood").hidden = true;
    return;
  }

  let result;
  try {
    result = score(text);
  } catch {
    steps.innerHTML = "";
    el("how-ood").hidden = true;
    return;
  }

  const top = result.contributions[0];
  const bias = MODEL.bias;

  /*
   * The demo runs the real scorer, so it can land outside the training
   * range just as easily as the main tool - a two-word line sits about
   * ten standard deviations below the mean word count. Showing that
   * arithmetic without the caution the main panel gives would present an
   * extrapolation as if it were a reading.
   */
  const howOod = el("how-ood");
  if (result.outOfDistribution) {
    const names = result.contributions
      .filter((c) => c.clamped)
      .map((c) => c.neutralLabel.toLowerCase());
    howOod.textContent =
      `This text is outside the training range on ${names.join(" and ")}, ` +
      `so the numbers below are clamped at the edge of what the model has ` +
      `seen. The arithmetic is real; the answer is an extrapolation.`;
    howOod.hidden = false;
  } else {
    howOod.hidden = true;
  }

  // The same five stages scorer.js runs, with this text's real numbers.
  const stages = [
    [
      "Normalise",
      "Lowercase the text and collapse all whitespace, so a phrase split across a line break is still found.",
      `"${text.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 72)}…"`,
    ],
    [
      "Extract 11 signals",
      "Each becomes one number. Nothing else about the posting is used.",
      MODEL.feature_names
        .slice(0, 4)
        .map((n) => `${n} = ${result.rawFeatures[n].toFixed(2)}`)
        .join("   "),
    ],
    [
      "Standardise",
      "Rescale each signal using the mean and spread from training, so one learning rate suits them all and the weights stay comparable.",
      `${top.neutralLabel}: ${top.rawValue.toFixed(2)} -> ${(
        (top.rawValue - MODEL.means[MODEL.feature_names.indexOf(top.name)]) /
        MODEL.stds[MODEL.feature_names.indexOf(top.name)]
      ).toFixed(2)} standard deviations`,
    ],
    [
      "Add them up",
      "Each standardised signal times its learned weight, summed, starting from a constant called the bias.",
      `z = ${bias.toFixed(3)} + … = ${result.z.toFixed(3)}`,
    ],
    [
      "Squash it",
      "That sum can be any number at all, so the sigmoid folds it into the 0–100% range.",
      `1 ÷ (1 + e^−${result.z.toFixed(3)}) = ${(result.probability * 100).toFixed(1)}%`,
    ],
  ];

  steps.innerHTML = stages
    .map(
      ([title, body, figure]) => `
      <li class="step">
        <div>
          <h3>${title}</h3>
          <p>${body}</p>
          <div class="step-figure">${figure}</div>
        </div>
      </li>`
    )
    .join("");
}

/* ============================================================ Model card */

function renderModelCard() {
  const m = MODEL.metrics;
  const ev = MODEL.evidence || {};

  const stats = [
    [MODEL.n_examples, "Labelled postings", `${MODEL.n_ghost} ghost, ${MODEL.n_legit} genuine`],
    [pct(m.cv_accuracy), "Accuracy", `${m.cv_folds}-fold cross-validation`],
    [pct(m.baseline_accuracy), "Baseline", "always guess the commonest label"],
    [pct(m.cv_precision), "Precision", "of those called ghost, this share were"],
    [pct(m.cv_recall), "Recall", "of real ghost postings, this share caught"],
  ];
  el("model-stats").innerHTML = stats
    .map(
      ([value, label, note]) => `
      <li class="stat">
        <div class="stat-value mono">${value}</div>
        <div class="stat-label">${label}</div>
        <div class="stat-note">${note}</div>
      </li>`
    )
    .join("");

  /* THE CAUTIONS, all computed rather than written.
     A demo model, a small sample and an implausibly high score each get
     said out loud, because each one means the headline figure above is
     worth less than it looks. */
  const cautions = [];

  if (MODEL.trained_on === "demo") {
    cautions.push(
      "This model was trained on synthetic postings written by hand to test " +
        "the pipeline, not on real adverts. The scores demonstrate that the " +
        "plumbing works; they are not evidence about any real posting."
    );
  }

  /* There is deliberately NO small-sample caution computed here.
     train.py already owns that judgement - MIN_USABLE and TARGET live in
     one place there, and the warning it writes into model.json is
     replayed verbatim further down. This function used to carry a second
     threshold of its own ("below about 100"), which meant the card could
     show two cautions quoting two different numbers for the same idea. */

  if (m.cv_accuracy > 0.98) {
    cautions.push(
      `${pct(m.cv_accuracy)} cross-validated accuracy is implausibly high for ` +
        `this problem. That usually means the two groups are far more cleanly ` +
        `separated than real postings ever are - a warning sign, not an ` +
        `achievement.`
    );
  }

  const textOnly = ev.text_only ?? 0;
  if (textOnly > 0) {
    cautions.push(
      `${textOnly} of ${MODEL.n_examples} labels were judged from the wording ` +
        `alone. The features are drawn from the wording too, so those labels ` +
        `teach the model to reproduce a reader's instinct rather than to ` +
        `detect anything.`
    );
  }

  /*
   * HOW MANY SIGNALS LEARNED THE OPPOSITE OF WHAT WAS EXPECTED.
   *
   * features.py records a hypothesis per signal - whether the author
   * expected it to point toward ghost or toward legit. On a small sample
   * the fitted weights frequently come out the other way, and the feature
   * table below shows those directions as plain fact without saying so.
   *
   * This counts the disagreements from model.json rather than stating a
   * number, so it corrects itself on every retrain and disappears on its
   * own once the weights settle. It is not a claim that the model is
   * broken: it is the reason not to read the table as findings.
   */
  const hypotheses = MODEL.feature_hypothesis || {};
  let agreed = 0;
  let against = 0;
  MODEL.feature_names.forEach((name, i) => {
    const expected = hypotheses[name];
    if (expected !== "ghost" && expected !== "legit") return;
    const learned = MODEL.weights[i] > 0 ? "ghost" : "legit";
    if (learned === expected) agreed += 1;
    else against += 1;
  });
  if (against > agreed) {
    cautions.push(
      `${against} of ${agreed + against} signals learned the OPPOSITE ` +
        `direction from the one expected when they were written. With this ` +
        `little data that is close to a coin flip, so read the weights below ` +
        `as what this particular sample produced, not as findings about job ` +
        `postings.`
    );
  }

  // Whatever the training run itself flagged, verbatim.
  for (const w of MODEL.warnings || []) cautions.push(w);

  el("model-cautions").innerHTML = cautions
    .map((c) => `<p class="caution">${c}</p>`)
    .join("");

  // The evidence breakdown: what the labels rest on.
  const evidenceRows = Object.entries(ev)
    .filter(([k, v]) => k !== "confidence" && v > 0)
    .map(([k, v]) => `${v} ${k.replace(/_/g, " ")}`)
    .join(", ");
  if (evidenceRows) {
    el("model-cautions").insertAdjacentHTML(
      "beforeend",
      `<p class="section-lede" style="font-size:0.86rem">
         <strong>What the labels rest on:</strong> ${evidenceRows}.
         ${ev.confidence
           ? `${ev.confidence.sure} marked sure, ${ev.confidence.unsure} unsure.`
           : ""}
       </p>`
    );
  }

  el("feature-rows").innerHTML = MODEL.feature_names
    .map((name, i) => {
      const w = MODEL.weights[i];
      const ghost = w > 0;
      return `
        <tr>
          <td>${MODEL.feature_labels[name] || name}</td>
          <td class="num">${ghost ? "+" : "−"}${Math.abs(w).toFixed(3)}</td>
          <td class="${ghost ? "toward-ghost-ink" : "toward-real-ink"}">
            ${ghost ? "toward ghost" : "toward real"}
          </td>
        </tr>`;
    })
    .join("");
}

/* ================================================================ Start */

/*
 * The header's hairline appears only once something is scrolled under it.
 *
 * A permanent border is furniture; a border that arrives when it starts
 * doing a job reads as intentional. passive:true because this listener
 * never calls preventDefault, and saying so lets the browser scroll
 * without waiting to find out.
 */
function setUpStickyHeader() {
  const header = document.querySelector(".site-header");
  const update = () =>
    header.classList.toggle("is-stuck", window.scrollY > 4);
  window.addEventListener("scroll", update, { passive: true });
  update();
}

async function start() {
  setUpTheme();
  setUpStickyHeader();
  setUpViews();

  el("posting").addEventListener("input", onInput);
  el("clear-btn").addEventListener("click", () => {
    el("posting").value = "";
    onInput();
    el("posting").focus();
  });

  for (const chip of document.querySelectorAll("[data-example]")) {
    chip.addEventListener("click", () => {
      el("posting").value = EXAMPLES[chip.dataset.example];
      onInput();
      el("posting").focus();
      // Setting .value then focusing leaves the caret at the end, which
      // scrolls the box to the last line - so the example appears to
      // start in the middle of nowhere. Put it back at the top.
      el("posting").setSelectionRange(0, 0);
      el("posting").scrollTop = 0;
    });
  }

  el("how-input").addEventListener("input", renderHow);

  try {
    const [phrases, model] = await Promise.all([loadPhrases(), loadModel()]);
    PHRASES = phrases;
    MODEL = model;
    renderModelCard();
    el("how-input").value = EXAMPLES.ambiguous.split("\n")[0];
    renderHow();
    onInput();
  } catch (error) {
    el("empty-state").innerHTML =
      `<p>Could not load the model. The page cannot score anything without ` +
      `it. <a href="${REPO_URL}">Source on GitHub</a>.</p>`;
    console.error(error);
  }
}

start();
