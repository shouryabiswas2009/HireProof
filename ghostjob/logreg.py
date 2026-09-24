"""
Logistic regression, written from scratch. No scikit-learn, no numpy: just
Python lists and the math module, so every step is visible and explainable.

THE MATH, IN ORDER
------------------
1. A weighted sum. Each feature x_j gets a weight w_j, and we add a bias b:

       z = w1*x1 + w2*x2 + ... + wn*xn + b

   z can be any number, from minus infinity to plus infinity. A positive z
   leans "ghost", a negative z leans "legit".

2. The sigmoid squashes z into a probability between 0 and 1:

       sigma(z) = 1 / (1 + e^-z)

   sigma(0) = 0.5 (no idea), large positive z approaches 1 (confident
   ghost), large negative z approaches 0 (confident legit). We need a
   probability because "72% likely" is far more honest than a bare yes/no.

3. Log loss (also called binary cross-entropy) measures how wrong we are:

       loss = -(1/n) * sum over examples of [ y*ln(p) + (1-y)*ln(1-p) ]

   where y is the true label (1 = ghost, 0 = legit) and p is our predicted
   probability. If the truth is y=1 and we said p=0.99, then ln(0.99) is
   about -0.01, so the loss is tiny. If we said p=0.01, ln(0.01) is about
   -4.6: a big penalty. WHY NOT just count mistakes? Because a count is
   flat: it can't tell "barely wrong" from "confidently wrong", so there is
   no slope to follow downhill. Log loss punishes confident mistakes
   harshly, which is exactly the gradient we need.

4. Gradient descent. The derivative of log loss with respect to weight w_j
   works out to a remarkably clean expression:

       gradient_j = (1/n) * sum over examples of (p_i - y_i) * x_ij

   In words: the error (prediction minus truth), multiplied by the feature
   value. If we over-predicted ghost, the gradient is positive, and we
   nudge that weight down. We step downhill repeatedly:

       w_j := w_j - learning_rate * gradient_j

5. L2 regularization adds a penalty for large weights:

       penalty = (lambda / 2n) * sum of w_j^2

   WHY: with only a couple hundred examples, the model can latch onto a
   coincidence in the data and give one feature a huge weight. Pulling
   weights toward zero keeps it humble. The bias is left out of the penalty
   because it just sets the baseline rate, and shrinking it would bias the
   model toward 50/50 for no good reason.
"""

import math
import random

# How many standard deviations a feature is allowed to be from the training
# mean before we stop believing the number.
#
# THIS EXISTS BECAUSE OF A REAL FAILURE, and it is worth understanding.
#
# The demo model was trained on hand-written postings of about 60 words, so
# log_word_count had mean 4.10 and a standard deviation of only 0.11 - every
# synthetic posting was nearly the same length. A real job advert runs to
# roughly 900 words, which is log_word_count 6.8, or TWENTY-FIVE standard
# deviations above the training mean.
#
# Standardizing multiplies that gap by the weight, so one feature produced a
# contribution of -8.0 while every other feature was worth less than 0.7
# combined. The sigmoid of -8 is 0.0003, so the site confidently reported
# "0% ghost" for every real posting pasted into it, including the obvious
# ghost ones. Nothing errored: the arithmetic was correct and the answer was
# garbage.
#
# The underlying mistake is asking a linear model to EXTRAPOLATE. Within the
# range it has seen, "one more standard deviation means this much more
# log-odds" is a fitted, testable claim. Twenty-five deviations out it is an
# unchecked guess, and a model that has never seen a 900-word posting has no
# basis for one. Clamping says so: past this point we treat the feature as
# "off the end of the scale we measured" rather than inventing a magnitude.
#
# Four is the usual choice, since ~99.99% of a normal distribution sits
# inside four deviations, so anything further out is genuinely unlike the
# training data rather than merely at the edge of it.
#
# The clamp is applied during TRAINING as well as scoring. If it were only
# applied at scoring time, the weights would have been learned from numbers
# the scorer never produces, which is the same train/serve mismatch in a
# different place. scorer.js reads this value out of model.json rather than
# hard-coding its own copy.
CLAMP_SIGMAS = 4.0


def sigmoid(z):
    """Squash any number into a probability between 0 and 1.

    Written in two branches for numerical stability. The textbook form
    1/(1+e^-z) overflows for very negative z (e.g. e^1000 is too big for a
    float and Python raises OverflowError). The algebraically identical
    form e^z/(1+e^z) is safe there, so we pick whichever is safe.
    """
    if z >= 0:
        return 1.0 / (1.0 + math.exp(-z))
    exp_z = math.exp(z)
    return exp_z / (1.0 + exp_z)


def predict_probability(features, weights, bias):
    """One posting's features -> probability it is a ghost job."""
    z = bias
    for value, weight in zip(features, weights):
        z += value * weight
    return sigmoid(z)


def log_loss(rows, labels, weights, bias):
    """Average log loss over a dataset. Lower is better."""
    if not rows:
        return 0.0
    total = 0.0
    for features, y in zip(rows, labels):
        p = predict_probability(features, weights, bias)
        # Clamp away from exactly 0 and 1: ln(0) is negative infinity, which
        # would make the loss meaningless. This is standard practice.
        p = min(max(p, 1e-12), 1 - 1e-12)
        total += y * math.log(p) + (1 - y) * math.log(1 - p)
    return -total / len(rows)


def standardize_fit(rows):
    """Work out each feature's mean and standard deviation.

    WHY THIS IS NEEDED: our features live on wildly different scales.
    log_word_count is around 5 to 8, buzzword_density can be 0 to 15, and
    the yes/no features are just 0 or 1. Gradient descent with a single
    learning rate handles that badly: a step size suited to the big feature
    is far too large for the small ones, so training zigzags or diverges.
    Rescaling every feature to roughly mean 0 and spread 1 puts them on
    equal footing, so one learning rate works for all of them.

    It also makes the weights comparable: after scaling, a bigger weight
    really does mean a more influential feature, which is what the
    breakdown on the website relies on.
    """
    if not rows:
        return [], []
    n_features = len(rows[0])
    means, stds = [], []
    for j in range(n_features):
        column = [row[j] for row in rows]
        mean = sum(column) / len(column)
        variance = sum((value - mean) ** 2 for value in column) / len(column)
        std = math.sqrt(variance)
        # A feature that never varies (e.g. no posting in your data has a
        # contact email) has std 0, and dividing by it would be a crash.
        # Using 1.0 leaves the column as all-zeros after centring, which
        # correctly means "this feature tells us nothing here".
        means.append(mean)
        stds.append(std if std > 1e-12 else 1.0)
    return means, stds


def standardize_apply(rows, means, stds, clamp=CLAMP_SIGMAS):
    """Rescale rows using means and stds already computed, then clamp.

    See CLAMP_SIGMAS for why the clamp exists. Pass clamp=None to switch it
    off, which is only useful for showing the unclamped value in tests.
    """
    return [
        [standardize_value(value, mean, std, clamp)
         for value, mean, std in zip(row, means, stds)]
        for row in rows
    ]


def standardize_value(value, mean, std, clamp=CLAMP_SIGMAS):
    """Standardize one number. Mirrored exactly by scorer.js."""
    z = (value - mean) / std
    if clamp is None:
        return z
    return max(-clamp, min(clamp, z))


def train(rows, labels, learning_rate=0.1, epochs=2000, l2=1.0, verbose=False):
    """Fit weights and bias by gradient descent.

    rows   : list of feature lists, ALREADY standardized
    labels : list of 1 (ghost) or 0 (legit)
    returns: (weights, bias, history of the loss)
    """
    if not rows:
        raise ValueError("No training data.")

    n_samples = len(rows)
    n_features = len(rows[0])

    # Start every weight at zero. For logistic regression this is fine and
    # fully reproducible: the loss surface is bowl-shaped (convex), so there
    # is a single best answer and no risk of getting stuck in a bad local
    # minimum depending on where we started. Neural networks need random
    # starts precisely because they lack that guarantee.
    weights = [0.0] * n_features
    bias = 0.0
    history = []

    for epoch in range(epochs):
        # --- Forward pass: predict every example with the current weights.
        predictions = [predict_probability(row, weights, bias) for row in rows]

        # --- Backward pass: how should each weight change?
        # errors[i] = prediction - truth. Positive means we leaned too far
        # toward "ghost" for that posting.
        errors = [p - y for p, y in zip(predictions, labels)]

        weight_gradients = [0.0] * n_features
        for row, error in zip(rows, errors):
            for j in range(n_features):
                weight_gradients[j] += error * row[j]

        for j in range(n_features):
            weight_gradients[j] /= n_samples
            # The L2 penalty's derivative: pulls each weight toward zero.
            weight_gradients[j] += (l2 / n_samples) * weights[j]

        bias_gradient = sum(errors) / n_samples  # not regularized, see notes

        # --- Step downhill.
        for j in range(n_features):
            weights[j] -= learning_rate * weight_gradients[j]
        bias -= learning_rate * bias_gradient

        # Record the loss occasionally so we can confirm it is going down.
        # If it isn't, the learning rate is too high.
        if epoch % 100 == 0 or epoch == epochs - 1:
            history.append((epoch, log_loss(rows, labels, weights, bias)))
            if verbose:
                print(f"    epoch {epoch:>5}  loss {history[-1][1]:.4f}")

    return weights, bias, history


def evaluate(rows, labels, weights, bias, threshold=0.5):
    """Score predictions against the truth.

    Accuracy alone is misleading on a lopsided dataset: if 80% of your
    postings are legit, a model that always answers "legit" scores 80% while
    being useless. So we also return the confusion matrix and the
    precision/recall pair, which expose that failure immediately.
    """
    true_positive = true_negative = false_positive = false_negative = 0
    for row, y in zip(rows, labels):
        predicted = 1 if predict_probability(row, weights, bias) >= threshold else 0
        if predicted == 1 and y == 1:
            true_positive += 1
        elif predicted == 0 and y == 0:
            true_negative += 1
        elif predicted == 1 and y == 0:
            false_positive += 1
        else:
            false_negative += 1

    total = len(labels)
    correct = true_positive + true_negative
    # Precision: of the postings we flagged as ghost, how many really were?
    # Low precision means we cry wolf, which for this tool is the costly
    # mistake: it could talk someone out of applying for a real job.
    precision = true_positive / (true_positive + false_positive) if (true_positive + false_positive) else 0.0
    # Recall: of the real ghost postings, how many did we catch?
    recall = true_positive / (true_positive + false_negative) if (true_positive + false_negative) else 0.0
    # F1 balances the two into one number (their harmonic mean).
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0

    return {
        "n": total,
        "accuracy": correct / total if total else 0.0,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "true_positive": true_positive,
        "true_negative": true_negative,
        "false_positive": false_positive,
        "false_negative": false_negative,
        "log_loss": log_loss(rows, labels, weights, bias),
    }


def k_fold_indices(n_samples, k, seed=0):
    """Split 0..n-1 into k shuffled groups, for cross-validation.

    WHY CROSS-VALIDATION instead of one train/test split: with ~200
    postings, a single 20% test set is only ~40 examples, so the accuracy
    you get swings wildly depending on which 40 you happened to hold out.
    K-fold trains k times, each time holding out a different group, then
    averages. Every posting gets tested exactly once, so the estimate is far
    steadier. The cost is training k times, which is nothing at this size.

    The seed makes the shuffle reproducible: same data in, same answer out.
    """
    indices = list(range(n_samples))
    random.Random(seed).shuffle(indices)
    return [indices[i::k] for i in range(k)]


def cross_validate(rows, labels, k=5, seed=0, **train_kwargs):
    """Run k-fold cross-validation. Returns per-fold results and the mean.

    Note the standardization happens INSIDE each fold, using only that
    fold's training data. Computing the mean and standard deviation over
    the whole dataset first would leak information about the test fold into
    training, and quietly inflate the score. This mistake is called data
    leakage and it's a classic interview question.
    """
    n_samples = len(rows)
    folds = k_fold_indices(n_samples, k, seed)
    results = []

    for fold_index, test_indices in enumerate(folds):
        test_set = set(test_indices)
        train_indices = [i for i in range(n_samples) if i not in test_set]
        if not train_indices or not test_indices:
            continue

        train_rows = [rows[i] for i in train_indices]
        train_labels = [labels[i] for i in train_indices]
        test_rows = [rows[i] for i in test_indices]
        test_labels = [labels[i] for i in test_indices]

        means, stds = standardize_fit(train_rows)
        weights, bias, _ = train(
            standardize_apply(train_rows, means, stds), train_labels, **train_kwargs
        )
        result = evaluate(
            standardize_apply(test_rows, means, stds), test_labels, weights, bias
        )
        result["fold"] = fold_index
        results.append(result)

    if not results:
        return {"folds": [], "mean": {}}

    mean = {
        metric: sum(r[metric] for r in results) / len(results)
        for metric in ("accuracy", "precision", "recall", "f1", "log_loss")
    }
    return {"folds": results, "mean": mean}
