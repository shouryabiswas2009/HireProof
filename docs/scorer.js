/*
 * Applies the trained model to a posting, in the browser.
 *
 * This is the other half of the from-scratch logistic regression. Python's
 * logreg.py did the hard part (learning the weights by gradient descent).
 * Using those weights is just arithmetic: multiply, add, squash.
 *
 *     z = bias + sum over features of (weight * standardized value)
 *     probability = 1 / (1 + e^-z)
 *
 * The interesting part is that each term in that sum is an independent,
 * readable number: "no salary figure added +0.7 toward ghost". That is why
 * the model is logistic regression and not something more powerful. A
 * random forest or neural network might score a little better, but it could
 * not hand back a per-feature breakdown this directly, and being able to
 * show a visitor WHY matters more here than squeezing out accuracy from a
 * couple of hundred training examples.
 */

import { extractFeatures } from "./features.js?v=10";

let MODEL = null;

/** Use an already-parsed model object (the browser and tests share this). */
function initModel(model) {
  MODEL = model;
  return MODEL;
}

/**
 * Load the trained weights produced by train.py.
 *
 * cache: "no-cache" forces the browser to check with the server before
 * reusing its copy. WHY: GitHub Pages tells browsers they may keep a file
 * for about ten minutes, and this is the file that changes every time the
 * model is retrained. Without this, someone who visited recently would be
 * scored by the previous model with no sign anything was stale. It is not
 * "no-store": the browser still caches, it just revalidates first, so the
 * usual answer is a tiny 304 rather than a fresh download.
 */
async function loadModel(url = "model.json") {
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`Could not load ${url} (HTTP ${response.status})`);
  }
  return initModel(await response.json());
}

/** The same sigmoid as ghostjob/logreg.py, including the overflow guard. */
function sigmoid(z) {
  if (z >= 0) return 1 / (1 + Math.exp(-z));
  const expZ = Math.exp(z);
  return expZ / (1 + expZ);
}

/**
 * Score one posting.
 *
 * Returns the probability plus a per-feature breakdown, sorted by how much
 * each feature actually moved the result.
 */
function score(text) {
  if (!MODEL) throw new Error("Model not loaded yet.");

  const rawFeatures = extractFeatures(text);
  const contributions = [];
  let z = MODEL.bias;

  MODEL.feature_names.forEach((name, index) => {
    // Standardize exactly as training did, using the means and standard
    // deviations saved alongside the weights. Skipping this step would feed
    // the model numbers on a completely different scale, and the output
    // would be confidently wrong rather than obviously broken.
    const standardized =
      (rawFeatures[name] - MODEL.means[index]) / MODEL.stds[index];
    // This feature's push on the final answer. Positive means "toward
    // ghost". Because the features were standardized, these numbers are
    // directly comparable to one another.
    const contribution = MODEL.weights[index] * standardized;
    z += contribution;

    // Describe what this posting actually says, not just the feature's
    // name. A missing salary figure must read "No pay figure given", since
    // labelling that row "Pay figure given" would state the opposite of the
    // truth. Above the training average counts as "on", below as "off".
    const states = (MODEL.feature_state_labels || {})[name];
    const stateLabel = states
      ? (standardized > 0 ? states.on : states.off)
      : MODEL.feature_labels[name] || name;

    contributions.push({
      name,
      label: stateLabel,
      neutralLabel: MODEL.feature_labels[name] || name,
      rawValue: rawFeatures[name],
      contribution,
    });
  });

  const probability = sigmoid(z);

  /*
   * Turn each contribution into PERCENTAGE POINTS, which is the only unit
   * a reader can actually use.
   *
   * The raw contribution is in log-odds. "+0.912" is meaningless to a
   * visitor, and it cannot be converted to a fixed number of points,
   * because the same log-odds step moves the score a lot in the middle of
   * the range and barely at all near 0% or 100%.
   *
   * So instead of converting the units, we answer a question: "what would
   * the score have been if this posting were merely AVERAGE on this one
   * signal?" That is sigmoid(z - contribution). The gap between that and
   * the real score is this signal's effect, in points.
   *
   * IMPORTANT CAVEAT, and worth understanding rather than hiding: these
   * deltas do NOT add up to the total. The sigmoid is a curve, not a
   * straight line, so removing two signals together is not the same as
   * the sum of removing each alone. Each number is a correct answer to
   * "what does this one signal cost?" and that is all it claims.
   */
  for (const item of contributions) {
    const withoutIt = sigmoid(z - item.contribution);
    item.points = (probability - withoutIt) * 100;

    /*
     * A strength word, graded on the LOG-ODDS rather than the points.
     *
     * Why both? Because the points figure collapses at the extremes. A
     * posting already sitting at 98% cannot be pushed much higher by
     * anything, so every signal shows as "+2 points" even when one of
     * them is doing far more work than the others. Log-odds does not
     * flatten like that, so it is the fair way to rank signals against
     * each other; points remain the honest answer to "what did this cost
     * me on the actual score".
     */
    const size = Math.abs(item.contribution);
    item.strength = size >= 0.6 ? "strong" : size >= 0.3 ? "moderate" : "slight";
  }

  contributions.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  return { probability, z, contributions, rawFeatures };
}

/**
 * Turn a probability into a hedged, human label.
 *
 * The wording avoids claiming the posting IS a ghost job. The model only
 * knows whether a posting's wording resembles those in a small,
 * hand-labeled training set, so the language says exactly that.
 */
/*
 * THE THRESHOLDS.
 *
 * These are judgement calls, not learned values, and worth saying so.
 *
 * Why not a single cut at 0.50? Because that forces a verdict the model
 * cannot support: a posting at 0.51 would flip from "genuine" to "ghost"
 * on a hair. The middle band is an explicit "not sure", which is the
 * honest answer for most real postings.
 *
 * Why is the band asymmetric (0.40 / 0.70) rather than 0.35 / 0.65? The
 * two mistakes do not cost the same. Missing a ghost posting wastes an
 * application. Wrongly flagging a REAL job could talk someone out of an
 * opportunity, which is worse. So the bar for calling something ghost is
 * set deliberately higher than the bar for calling it genuine.
 *
 * One caveat to state plainly: these probabilities are not calibrated. On
 * a dataset this small, "70%" does not mean 70 out of 100 such postings
 * are really ghost jobs. The bands are a rough reading, not a measurement.
 */
const THRESHOLD_LOW = 0.40;   // below this: reads genuine
const THRESHOLD_HIGH = 0.70;  // above this: reads ghost

function band(probability) {
  if (probability >= THRESHOLD_HIGH) {
    return {
      key: "high",
      title: "Reads like the ghost postings in the training data",
      blurb:
        "Several of the signals this model watches for are present. That is a reason to ask questions, not a reason to skip applying.",
    };
  }
  if (probability >= THRESHOLD_LOW) {
    return {
      key: "medium",
      title: "Mixed signals",
      blurb:
        "This posting has some features of each group. The model cannot tell them apart confidently here.",
    };
  }
  return {
    key: "low",
    title: "Reads like the genuine postings in the training data",
    blurb:
      "The signals this model associates with ghost postings are mostly absent. That is not a guarantee the role is real.",
  };
}

export { initModel, loadModel, score, band, sigmoid, THRESHOLD_LOW, THRESHOLD_HIGH };
