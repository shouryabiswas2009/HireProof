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

import { extractFeatures } from "./features.js";

let MODEL = null;

/** Use an already-parsed model object (the browser and tests share this). */
function initModel(model) {
  MODEL = model;
  return MODEL;
}

/** Load the trained weights produced by train.py. */
async function loadModel(url = "model.json") {
  const response = await fetch(url);
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

  contributions.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  return { probability: sigmoid(z), z, contributions, rawFeatures };
}

/**
 * Turn a probability into a hedged, human label.
 *
 * The wording avoids claiming the posting IS a ghost job. The model only
 * knows whether a posting's wording resembles those in a small,
 * hand-labeled training set, so the language says exactly that.
 */
function band(probability) {
  if (probability >= 0.65) {
    return {
      key: "high",
      title: "Reads like the ghost postings in the training data",
      blurb:
        "Several of the signals this model watches for are present. That is a reason to ask questions, not a reason to skip applying.",
    };
  }
  if (probability >= 0.35) {
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

export { initModel, loadModel, score, band, sigmoid };
