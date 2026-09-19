"""
The labeling tool: a small web page, running ONLY on your own computer,
where you paste a job posting and tag it as ghost or legit.

Run it from the repo root with:
    .venv\\Scripts\\python.exe -m labeler.app
or just double-click label.ps1.

Then open http://127.0.0.1:5000.

This tool is never deployed. Only the finished model is published.

A note on one deliberate omission: the page does NOT show you what the
current model predicts BEFORE you label. Seeing a guess first would anchor
your judgement and quietly turn your dataset into a copy of the model's
existing opinions. The prediction is shown AFTER you save instead, purely
as feedback on where you and the model disagree.
"""

import json
from pathlib import Path

from flask import Flask, flash, redirect, render_template, request, url_for

from ghostjob import dataset, features, logreg

# How many labeled postings we're aiming for. Just a progress goal for the
# page; nothing else depends on this number.
TARGET_POSTINGS = 200

REPO_ROOT = Path(__file__).resolve().parent.parent
MODEL_PATH = REPO_ROOT / "docs" / "model.json"

app = Flask(__name__)
# Flask needs a secret key to use flash() messages (they're stored in a
# signed cookie). This app only ever runs on your own machine, so a fixed
# key is fine here. A public app would need a real secret.
app.secret_key = "local-labeling-tool-only"


def load_model():
    """The currently trained model, or None if train.py hasn't run yet."""
    if not MODEL_PATH.exists():
        return None
    try:
        with open(MODEL_PATH, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        # Feedback is a nice-to-have; never let it break saving a posting.
        return None


def model_probability(text, model):
    """What the current model would say about this posting, 0..1."""
    raw = features.features_as_list(text)
    standardized = logreg.standardize_apply([raw], model["means"], model["stds"])[0]
    return logreg.predict_probability(standardized, model["weights"], model["bias"])


def agreement_note(text, your_label):
    """A short line comparing your label with the current model's guess.

    Shown only AFTER saving, so it cannot influence the label itself. The
    point is calibration: if you and the model disagree often, that is worth
    knowing, and it is usually the model that is wrong early on.
    """
    model = load_model()
    if not model:
        return ""
    try:
        probability = model_probability(text, model)
    except (KeyError, ValueError, ZeroDivisionError):
        return ""

    model_says = "ghost" if probability >= 0.5 else "legit"
    verdict = "agrees" if model_says == your_label else "DISAGREES"
    source = " (demo model)" if model.get("trained_on") == "demo" else ""
    return f"Current model{source} said {probability:.0%} ghost, so it {verdict}."


def empty_form():
    """Blank values for the form (also used to refill it after an error)."""
    return {
        "text": "", "label": "", "confidence": "sure",
        "evidence": [], "notes": "", "source_url": "",
    }


def balance_warning(stats):
    """Warn if one class is much rarer than the other.

    A model trained on, say, 95% legit postings can score 95% accuracy by
    always answering "legit", which teaches us nothing. So we nudge you
    to keep the two classes reasonably balanced while you collect data.
    """
    if stats["total"] < 20:
        return None
    minority = min(stats["ghost"], stats["legit"])
    if minority / stats["total"] < 0.3:
        rarer = "ghost" if stats["ghost"] < stats["legit"] else "legit"
        return (
            f"Your dataset is lopsided: only {minority} of {stats['total']} "
            f"are '{rarer}'. Try to find more '{rarer}' examples."
        )
    return None


def render_form(values, error=None):
    """Draw the add-posting page. Shared by the normal and error paths."""
    postings = dataset.load_postings()
    stats = dataset.summarize(postings)
    return render_template(
        "index.html",
        values=values,
        stats=stats,
        target=TARGET_POSTINGS,
        warning=balance_warning(stats),
        evidence_options=dataset.EVIDENCE_OPTIONS,
        last_id=postings[-1]["id"] if postings else None,
        error=error,
    )


@app.route("/")
def index():
    return render_form(empty_form())


@app.route("/add", methods=["POST"])
def add():
    values = {
        "text": request.form.get("text", ""),
        "label": request.form.get("label", ""),
        "confidence": request.form.get("confidence", ""),
        "evidence": request.form.getlist("evidence"),
        "notes": request.form.get("notes", ""),
        "source_url": request.form.get("source_url", ""),
    }
    try:
        dataset.add_posting(
            text=values["text"],
            label=values["label"],
            confidence=values["confidence"],
            evidence=values["evidence"],
            notes=values["notes"],
            source_url=values["source_url"],
        )
    except ValueError as problem:
        # Show the form again WITH what you typed, so a mistake doesn't
        # make you re-paste a whole posting.
        return render_form(values, error=str(problem))
    except PermissionError:
        # On Windows, Excel locks a CSV while it is open, so we can't save.
        return render_form(
            values,
            error="Couldn't save. Is labeled_postings.csv open in Excel? "
                  "Close it and try again.",
        )

    note = agreement_note(values["text"], values["label"])
    flash(f"Saved as {values['label']}. {note}".strip())
    # Redirect after a successful POST (instead of re-rendering) so that
    # refreshing the page doesn't re-submit the form.
    return redirect(url_for("index"))


@app.route("/postings")
def postings():
    all_postings = dataset.load_postings()
    # Newest first, since you're most likely to want to fix a recent mistake.
    all_postings.reverse()
    return render_template(
        "postings.html",
        postings=all_postings,
        stats=dataset.summarize(all_postings),
        evidence_options=dataset.EVIDENCE_OPTIONS,
    )


@app.route("/delete/<posting_id>", methods=["POST"])
def delete(posting_id):
    try:
        removed = dataset.delete_posting(posting_id)
    except PermissionError:
        flash("Couldn't delete. Is labeled_postings.csv open in Excel?")
        return redirect(request.form.get("back") or url_for("postings"))
    flash("Deleted." if removed else "That posting was already gone.")
    return redirect(request.form.get("back") or url_for("postings"))


if __name__ == "__main__":
    # 127.0.0.1 means "only this computer can connect", so nobody else on
    # your Wi-Fi can reach the tool. debug is off because Flask's debug mode
    # lets anyone who can reach the page run code on your machine.
    app.run(host="127.0.0.1", port=5000, debug=False)
