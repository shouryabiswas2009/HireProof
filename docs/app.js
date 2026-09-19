/*
 * Wires the page together: load the model, react to the button, draw the
 * result. All the thinking lives in features.js and scorer.js; this file
 * only moves values onto the screen.
 */

import { loadPhrases } from "./features.js";
import { loadModel, score, band } from "./scorer.js";

// Change this if you fork the project.
const REPO_URL = "https://github.com/shouryabiswas2009/ghost-job-detector";

// A deliberately mediocre posting for the "Load an example" button: it has
// signals pointing both ways, so the demo shows a nuanced breakdown rather
// than a cartoonish 99%.
const EXAMPLE_POSTING = `Marketing Coordinator

We are a fast-paced, dynamic company looking for a self-starter to join our growing team. This is an exciting opportunity to make an impact.

Responsibilities include supporting various marketing initiatives, assisting with campaigns, and other duties as assigned. The successful candidate will be a detail-oriented team player who can wear many hats.

Requirements: 3+ years of experience in marketing. Strong communication skills.

We offer a competitive salary and a friendly working environment. Apply today!`;

const elements = {
  textarea: document.getElementById("posting"),
  scoreButton: document.getElementById("score-button"),
  exampleButton: document.getElementById("example-button"),
  clearButton: document.getElementById("clear-button"),
  results: document.getElementById("results"),
  gaugeFill: document.getElementById("gauge-fill"),
  scoreValue: document.getElementById("score-value"),
  verdict: document.getElementById("verdict"),
  verdictTitle: document.getElementById("verdict-title"),
  verdictBlurb: document.getElementById("verdict-blurb"),
  contributions: document.getElementById("contributions"),
  rawTableBody: document.querySelector("#raw-table tbody"),
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
  const accuracy = (metrics.cv_accuracy * 100).toFixed(0);
  const baseline = (metrics.baseline_accuracy * 100).toFixed(0);
  elements.modelFacts.textContent =
    `Current model: trained ${model.trained_date} on ${model.n_examples} ` +
    `postings (${model.n_ghost} ghost, ${model.n_legit} legit). ` +
    `Cross-validated accuracy ${accuracy}%, against ${baseline}% for always ` +
    `guessing the commonest answer.`;
}

/** Draw one contribution row with a bar showing its size and direction. */
function contributionRow(item, largest) {
  const li = document.createElement("li");
  li.className = "contribution";

  const towardGhost = item.contribution > 0;
  // Bar width is relative to the biggest contributor, so the largest bar
  // always fills the row and the rest are visually comparable to it.
  const width = largest > 0 ? (Math.abs(item.contribution) / largest) * 100 : 0;

  const name = document.createElement("span");
  name.className = "contribution-name";
  name.textContent = item.label;

  const barWrap = document.createElement("span");
  barWrap.className = "bar-wrap";
  const bar = document.createElement("span");
  bar.className = `bar ${towardGhost ? "bar-ghost" : "bar-legit"}`;
  bar.style.width = `${width}%`;
  barWrap.appendChild(bar);

  const direction = document.createElement("span");
  direction.className = `direction ${towardGhost ? "toward-ghost" : "toward-legit"}`;
  direction.textContent = towardGhost ? "raises risk" : "lowers risk";

  li.append(name, barWrap, direction);
  return li;
}

function render(result) {
  const percent = Math.round(result.probability * 100);
  const verdict = band(result.probability);

  elements.scoreValue.textContent = `${percent}%`;
  elements.gaugeFill.style.width = `${percent}%`;
  elements.verdict.className = `verdict verdict-${verdict.key}`;
  elements.verdictTitle.textContent = verdict.title;
  elements.verdictBlurb.textContent = verdict.blurb;

  // Only show contributions that actually moved the needle. A feature whose
  // value equals the training average contributes almost exactly zero, and
  // listing it as a "factor" would be noise.
  const meaningful = result.contributions.filter(
    (item) => Math.abs(item.contribution) > 0.01
  );
  const largest = meaningful.length ? Math.abs(meaningful[0].contribution) : 0;

  elements.contributions.replaceChildren();
  if (meaningful.length === 0) {
    const li = document.createElement("li");
    li.className = "hint";
    li.textContent =
      "No signal stood out: this posting sits close to the training average on every feature.";
    elements.contributions.appendChild(li);
  } else {
    for (const item of meaningful.slice(0, 6)) {
      elements.contributions.appendChild(contributionRow(item, largest));
    }
  }

  // The full table, including the features that did nothing.
  elements.rawTableBody.replaceChildren();
  for (const item of result.contributions) {
    const tr = document.createElement("tr");
    const value = Number.isInteger(item.rawValue)
      ? String(item.rawValue)
      : item.rawValue.toFixed(2);
    // The table uses the neutral feature name, since it shows the raw
    // value next to it; the bars above use the state-aware wording.
    for (const text of [item.neutralLabel, value, item.contribution.toFixed(3)]) {
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
  render(score(text));
}

async function start() {
  try {
    // Both files are needed before anything can be scored: the phrase lists
    // to build features, and the model to weigh them.
    const [, model] = await Promise.all([loadPhrases(), loadModel()]);
    describeModel(model);
    elements.scoreButton.disabled = false;
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
elements.exampleButton.addEventListener("click", () => {
  elements.textarea.value = EXAMPLE_POSTING;
  handleScore();
});
elements.clearButton.addEventListener("click", () => {
  elements.textarea.value = "";
  elements.results.hidden = true;
  elements.inputError.hidden = true;
  elements.textarea.focus();
});

elements.scoreButton.disabled = true;
start();
