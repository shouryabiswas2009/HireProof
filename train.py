"""
Trains the ghost-job model and writes web/model.json for the website.

Run it from the repo root:

    .venv\\Scripts\\python.exe train.py           # uses your labeled postings
    .venv\\Scripts\\python.exe train.py --demo    # uses the synthetic demo set

The script's other job, just as important as training, is to tell you the
truth about how good the result is. It is easy to print a big accuracy
number and believe it. So this script always compares the model against the
dumbest possible baseline, always cross-validates rather than scoring
itself on data it trained on, and prints warnings when your dataset is too
small, too lopsided, or too circular to trust.
"""

import argparse
import json
import sys
from datetime import date
from pathlib import Path

from ghostjob import dataset, features, logreg

REPO_ROOT = Path(__file__).resolve().parent
MODEL_OUTPUT = REPO_ROOT / "web" / "model.json"
DEMO_DATA = REPO_ROOT / "data" / "demo_postings.json"

# Below this many postings, cross-validation results bounce around so much
# that they are not worth quoting. This is a judgement call, not a law.
MIN_USABLE = 60
# The number we are aiming for. Roughly 10+ examples per feature (we have
# 11 features) is a common rule of thumb for not overfitting.
TARGET = 200


def load_real_data():
    """Read your labeled postings from the CSV."""
    rows = dataset.load_postings()
    if not rows:
        print("No labeled postings found in data/labeled_postings.csv.")
        print("Run the labeling tool first:")
        print("    .venv\\Scripts\\python.exe -m labeler.app")
        print("Or try the synthetic demo data:")
        print("    .venv\\Scripts\\python.exe train.py --demo")
        sys.exit(1)
    texts = [r["text"] for r in rows]
    labels = [1 if r["label"] == "ghost" else 0 for r in rows]
    # Kept so we can warn about circular labels (see report_warnings).
    evidence = [r.get("evidence", "").split(";") for r in rows]
    return texts, labels, evidence, "real"


def load_demo_data():
    """Read the synthetic placeholder postings."""
    with open(DEMO_DATA, encoding="utf-8") as f:
        postings = json.load(f)["postings"]
    texts = [p["text"] for p in postings]
    labels = [1 if p["label"] == "ghost" else 0 for p in postings]
    evidence = [[] for _ in postings]
    return texts, labels, evidence, "demo"


def collect_warnings(labels, evidence, kind, cv_accuracy=None):
    """Everything about this dataset that should make you distrust the model."""
    warnings = []
    n = len(labels)
    n_ghost = sum(labels)
    n_legit = n - n_ghost

    if kind == "demo":
        warnings.append(
            "This model was trained on SYNTHETIC postings written by hand for "
            "this repo, not on real job adverts. It reflects the author's "
            "assumptions about ghost-job wording, nothing more. Treat the "
            "scores as a demonstration of the plumbing, not as evidence."
        )

    if n < MIN_USABLE:
        warnings.append(
            f"Only {n} labeled postings. Below about {MIN_USABLE} the accuracy "
            f"estimate swings wildly depending on which examples land in which "
            f"fold, so do not read much into it. Aim for {TARGET}."
        )
    elif n < TARGET:
        warnings.append(
            f"{n} labeled postings is workable but thin, with 11 features to "
            f"fit. {TARGET} would be more comfortable."
        )

    minority = min(n_ghost, n_legit)
    if n and minority / n < 0.3:
        rarer = "ghost" if n_ghost < n_legit else "legit"
        warnings.append(
            f"The dataset is lopsided: only {minority} of {n} are '{rarer}'. "
            f"Accuracy is flattering on lopsided data. Look at precision and "
            f"recall instead, and go find more '{rarer}' examples."
        )

    # A near-perfect score is almost always bad news, not good news. Real
    # job postings are messy and human judgement about them is inconsistent,
    # so a model that never misses has usually been handed a task that is
    # too easy: examples written to opposite extremes, near-duplicate
    # postings split across folds, or a giveaway phrase that happens to
    # track the label. Saying this out loud is the honest thing to do.
    if cv_accuracy is not None and cv_accuracy >= 0.98 and n < 500:
        warnings.append(
            f"Cross-validated accuracy is {cv_accuracy:.0%}, which is "
            f"implausibly high for this problem. That usually means the two "
            f"groups in the dataset are far more cleanly separated than real "
            f"postings ever are, not that the model is excellent. Expect a "
            f"much lower and more believable number once real, ambiguous "
            f"postings replace this data."
        )

    text_only = sum(1 for e in evidence if "text_only" in e)
    if n and text_only / n > 0.5:
        warnings.append(
            f"{text_only} of {n} labels were judged from the wording alone, "
            f"with no outside evidence. The model's features are also drawn "
            f"from the wording, so it is largely learning to reproduce your "
            f"own gut feeling rather than detecting ghost jobs. Label more "
            f"postings using evidence such as repostings or long-open dates."
        )

    return warnings


def print_report(kind, labels, cv, baseline_accuracy, weights, means, stds, warnings):
    """Print the honest summary."""
    n = len(labels)
    n_ghost = sum(labels)

    print()
    print("=" * 68)
    print(f"  TRAINING REPORT  ({kind} data)")
    print("=" * 68)
    print(f"  Postings:  {n}   ({n_ghost} ghost, {n - n_ghost} legit)")
    print()

    print("  HOW WELL DOES IT DO?")
    print("  (5-fold cross-validation: the model is always scored on postings")
    print("   it did not train on, which is the only honest way to measure.)")
    print()
    mean = cv["mean"]
    fold_accuracies = [f["accuracy"] for f in cv["folds"]]
    spread = max(fold_accuracies) - min(fold_accuracies) if fold_accuracies else 0.0
    print(f"    Accuracy      {mean['accuracy']:.1%}   (folds ranged {min(fold_accuracies):.0%} to {max(fold_accuracies):.0%})")
    print(f"    Precision     {mean['precision']:.1%}   of postings it called ghost, this share really were")
    print(f"    Recall        {mean['recall']:.1%}   of the real ghost postings, this share were caught")
    print(f"    F1            {mean['f1']:.1%}   the two above, balanced")
    print()

    # The comparison that matters most. A model that cannot beat "always
    # guess the commonest answer" has learned nothing at all.
    print(f"    Always guessing the commonest label would score {baseline_accuracy:.1%}.")
    improvement = mean["accuracy"] - baseline_accuracy
    if improvement <= 0.01:
        print("    >> The model is NO BETTER than that. It has not learned a")
        print("       usable pattern yet. More and better-labeled data is the fix.")
    elif improvement < 0.10:
        print(f"    >> The model beats it by {improvement:.1%}. That is a weak edge.")
    else:
        print(f"    >> The model beats it by {improvement:.1%}.")
    if spread > 0.25:
        print(f"    >> Fold-to-fold spread is {spread:.0%}, which is large. The single")
        print("       accuracy figure above is not stable; treat it as a rough hint.")
    print()

    print("  WHAT THE MODEL LEARNED")
    print("  (Weights apply to standardized features, so they are directly")
    print("   comparable. Positive pushes a posting toward 'ghost'.)")
    print()
    ranked = sorted(
        zip(features.FEATURE_NAMES, weights), key=lambda pair: -abs(pair[1])
    )
    for name, weight in ranked:
        direction = "ghost" if weight > 0 else "legit"
        bar = "#" * min(int(abs(weight) * 12), 30)
        print(f"    {name:<28} {weight:>+7.3f}  -> {direction:<5} {bar}")
    print()

    near_zero = [name for name, w in ranked if abs(w) < 0.05]
    if near_zero:
        print(f"    Near zero (no signal in this data): {', '.join(near_zero)}")
        print()

    if warnings:
        print("  WARNINGS")
        for warning in warnings:
            # Wrap long warnings by hand to keep the report readable.
            words = warning.split()
            line = "    - "
            for word in words:
                if len(line) + len(word) > 70:
                    print(line)
                    line = "      "
                line += word + " "
            print(line.rstrip())
        print()
    print("=" * 68)


def main():
    parser = argparse.ArgumentParser(description="Train the ghost-job model.")
    parser.add_argument(
        "--demo",
        action="store_true",
        help="train on the synthetic demo postings instead of your labeled data",
    )
    parser.add_argument("--epochs", type=int, default=3000)
    parser.add_argument("--learning-rate", type=float, default=0.1)
    parser.add_argument(
        "--l2",
        type=float,
        default=1.0,
        help="strength of the penalty on large weights (higher = humbler model)",
    )
    args = parser.parse_args()

    texts, labels, evidence, kind = load_demo_data() if args.demo else load_real_data()

    # Text -> numbers. This is the only place the raw postings are used.
    rows = [features.features_as_list(text) for text in texts]

    # How good is the laziest possible model? If 60% of postings are legit,
    # always answering "legit" scores 60%. Our model has to beat that to be
    # worth anything, and quoting accuracy without this comparison is how
    # people fool themselves.
    n_ghost = sum(labels)
    baseline_accuracy = max(n_ghost, len(labels) - n_ghost) / len(labels)

    # Honest performance estimate, standardizing inside each fold.
    cv = logreg.cross_validate(
        rows,
        labels,
        k=5,
        epochs=args.epochs,
        learning_rate=args.learning_rate,
        l2=args.l2,
    )

    # The model we actually ship is trained on ALL the data: having measured
    # performance honestly above, there is no reason to throw away a fifth
    # of the examples when building the final weights.
    means, stds = logreg.standardize_fit(rows)
    weights, bias, _ = logreg.train(
        logreg.standardize_apply(rows, means, stds),
        labels,
        epochs=args.epochs,
        learning_rate=args.learning_rate,
        l2=args.l2,
    )

    warnings = collect_warnings(labels, evidence, kind, cv["mean"]["accuracy"])
    print_report(kind, labels, cv, baseline_accuracy, weights, means, stds, warnings)

    # Write everything the website needs. It contains no posting text, only
    # aggregate numbers, so publishing it does not publish anyone's data.
    model = {
        "_readme": "Written by train.py. Do not edit by hand. The website reads this file and scores postings in the visitor's browser.",
        "trained_on": kind,
        "trained_date": date.today().isoformat(),
        "n_examples": len(labels),
        "n_ghost": n_ghost,
        "n_legit": len(labels) - n_ghost,
        "feature_names": features.FEATURE_NAMES,
        "feature_labels": features.FEATURE_LABELS,
        "weights": weights,
        "bias": bias,
        # The site must standardize incoming postings exactly as training
        # did, so these travel with the weights.
        "means": means,
        "stds": stds,
        "metrics": {
            "cv_accuracy": cv["mean"]["accuracy"],
            "cv_precision": cv["mean"]["precision"],
            "cv_recall": cv["mean"]["recall"],
            "cv_f1": cv["mean"]["f1"],
            "baseline_accuracy": baseline_accuracy,
        },
        "warnings": warnings,
        "hyperparameters": {
            "learning_rate": args.learning_rate,
            "epochs": args.epochs,
            "l2": args.l2,
        },
    }
    MODEL_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with open(MODEL_OUTPUT, "w", encoding="utf-8") as f:
        json.dump(model, f, indent=2)
    print(f"  Wrote {MODEL_OUTPUT.relative_to(REPO_ROOT)}")
    print()


if __name__ == "__main__":
    main()
