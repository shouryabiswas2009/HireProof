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

import { loadPhrases } from "./features.js?v=60";
import { loadModel, score, band, sigmoid, THRESHOLD_LOW, THRESHOLD_HIGH } from "./scorer.js?v=60";
import { annotateWithContributions } from "./highlight.js?v=60";
import { checkInput, MIN_WORDS } from "./validate.js?v=60";
import { EXAMPLES } from "./examples.js?v=60";

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

function applyTheme(choice) {
  const root = document.documentElement;
  if (choice === "light" || choice === "dark") root.dataset.theme = choice;
  else delete root.dataset.theme;

  const dark =
    choice === "dark" ||
    (!choice && window.matchMedia("(prefers-color-scheme: dark)").matches);
  el("theme-label").textContent = dark ? "Light" : "Dark";
  el("theme-btn").setAttribute("aria-pressed", String(dark));
}

function setUpTheme() {
  let saved = null;
  try {
    saved = localStorage.getItem(THEME_KEY);
  } catch {
    // Private browsing throws on storage. Following the OS is the right
    // fallback, not a crash.
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

/* ============================================================= The result */

function renderResult(text, result) {
  const verdict = band(result.probability);
  const percent = Math.round(result.probability * 100);

  el("empty-state").hidden = true;
  el("result").hidden = false;

  el("score-value").textContent = `${percent}%`;
  el("verdict-title").textContent = verdict.title;
  el("verdict-note").textContent = verdict.blurb;

  // scaleX rather than width: a transform composites, a width change
  // relayouts the bar on every frame of the ease.
  el("bar-fill").style.transform = `scaleX(${result.probability})`;

  // Mark the two band edges, so a reader can see where 40 and 70 fall
  // rather than only learning which band they landed in.
  el("bar-ticks").innerHTML = [THRESHOLD_LOW, THRESHOLD_HIGH]
    .map(
      (t) =>
        `<span class="bar-tick" style="left:${t * 100}%">${Math.round(t * 100)}</span>`
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

  el("annotated-panel").hidden = false;
}

function clearResult() {
  el("result").hidden = true;
  el("breakdown-panel").hidden = true;
  el("annotated-panel").hidden = true;
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
  if (!MODEL || !text.trim()) {
    steps.innerHTML = "";
    return;
  }

  let result;
  try {
    result = score(text);
  } catch {
    steps.innerHTML = "";
    return;
  }

  const top = result.contributions[0];
  const bias = MODEL.bias;

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

  if (MODEL.n_examples < 100) {
    cautions.push(
      `Trained on ${MODEL.n_examples} postings. Below about 100 the accuracy ` +
        `estimate swings widely depending on which examples land in which ` +
        `fold, so treat ${pct(m.cv_accuracy)} as a rough hint rather than a ` +
        `measurement.`
    );
  }

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

async function start() {
  setUpTheme();

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
