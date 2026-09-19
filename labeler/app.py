"""
The labeling tool: a small web page, running ONLY on your own computer,
where you paste a job posting and tag it as ghost or legit.

Run it from the repo root with:
    .venv\\Scripts\\python.exe -m labeler.app
then open http://127.0.0.1:5000 in your browser.

This tool is never deployed. Only the finished model is published.
"""

from flask import Flask, flash, redirect, render_template, request, url_for

from ghostjob import dataset

# How many labeled postings we're aiming for. Just a progress goal for the
# page; nothing else depends on this number.
TARGET_POSTINGS = 200

app = Flask(__name__)
# Flask needs a secret key to use flash() messages (they're stored in a
# signed cookie). This app only ever runs on your own machine, so a fixed
# key is fine here. A public app would need a real secret.
app.secret_key = "local-labeling-tool-only"


def empty_form():
    """Blank values for the form (also used to refill it after an error)."""
    return {"text": "", "label": "", "confidence": "sure", "evidence": [], "notes": ""}


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


@app.route("/")
def index():
    stats = dataset.summarize(dataset.load_postings())
    return render_template(
        "index.html",
        values=empty_form(),
        stats=stats,
        target=TARGET_POSTINGS,
        warning=balance_warning(stats),
        evidence_options=dataset.EVIDENCE_OPTIONS,
        error=None,
    )


@app.route("/add", methods=["POST"])
def add():
    values = {
        "text": request.form.get("text", ""),
        "label": request.form.get("label", ""),
        "confidence": request.form.get("confidence", ""),
        "evidence": request.form.getlist("evidence"),
        "notes": request.form.get("notes", ""),
    }
    try:
        dataset.add_posting(
            text=values["text"],
            label=values["label"],
            confidence=values["confidence"],
            evidence=values["evidence"],
            notes=values["notes"],
        )
    except ValueError as problem:
        # Show the form again WITH what you typed, so a mistake doesn't
        # make you re-paste a whole posting.
        stats = dataset.summarize(dataset.load_postings())
        return render_template(
            "index.html",
            values=values,
            stats=stats,
            target=TARGET_POSTINGS,
            warning=balance_warning(stats),
            evidence_options=dataset.EVIDENCE_OPTIONS,
            error=str(problem),
        )
    except PermissionError:
        # On Windows, Excel locks a CSV while it is open, so we can't save.
        stats = dataset.summarize(dataset.load_postings())
        return render_template(
            "index.html",
            values=values,
            stats=stats,
            target=TARGET_POSTINGS,
            warning=balance_warning(stats),
            evidence_options=dataset.EVIDENCE_OPTIONS,
            error="Couldn't save. Is labeled_postings.csv open in Excel? Close it and try again.",
        )

    flash("Saved.")
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
        return redirect(url_for("postings"))
    flash("Deleted." if removed else "That posting was already gone.")
    return redirect(url_for("postings"))


if __name__ == "__main__":
    # 127.0.0.1 means "only this computer can connect", so nobody else on
    # your Wi-Fi can reach the tool. debug is off because Flask's debug mode
    # lets anyone who can reach the page run code on your machine.
    app.run(host="127.0.0.1", port=5000, debug=False)
