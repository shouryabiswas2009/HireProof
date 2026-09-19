"""
Reads and writes the labeled-postings file (data/labeled_postings.csv).

Both the labeling app (which writes the file) and train.py (which reads it)
go through this module. That way the file format is defined in exactly one
place, and the two programs can't drift out of sync.
"""

import csv
import hashlib
import os
from datetime import datetime
from pathlib import Path

# The repo root is the folder above ghostjob/ (this file lives in ghostjob/).
REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_PATH = REPO_ROOT / "data" / "labeled_postings.csv"

# Column order in the CSV.
FIELDS = ["id", "added_at", "label", "confidence", "evidence", "notes", "text"]

LABELS = ("ghost", "legit")
CONFIDENCES = ("sure", "unsure")

# Why do you believe this label? Each key is stored in the CSV; the sentence
# is what the labeling page shows next to the checkbox.
#
# This matters because nobody can KNOW a posting is a ghost job. If a label
# comes only from reading the text ("text_only"), then a model trained on it
# just learns to copy your own gut feeling. Recording the evidence lets
# train.py later report how many labels are that kind of circular label.
EVIDENCE_OPTIONS = {
    "posted_long": "The posting has been up for 30+ days",
    "reposted": "The same role keeps getting reposted or relisted",
    "no_reply": "I applied and never heard back",
    "layoffs": "The company has layoffs or a hiring freeze in the news",
    "got_reply": "I (or someone I know) got a real reply or interview",
    "text_only": "I judged it from the wording alone (no outside evidence)",
}

# Anything shorter than this is almost certainly a paste mistake, and would
# give the model nothing useful to learn from.
MIN_TEXT_CHARS = 100


def normalize_text(text):
    """Clean up pasted text before saving it."""
    # Browsers send line breaks from a textarea as "\r\n" (Windows style).
    # Converting to "\n" means the same posting always produces the same
    # text (and the same ID) no matter how it was pasted.
    return text.replace("\r\n", "\n").replace("\r", "\n").strip()


def make_id(text):
    """A short ID that is the same for the same posting.

    We lowercase and collapse all whitespace first, so pasting the same
    posting twice (with different spacing or line breaks) gives the same ID.
    That is how we catch duplicates.
    """
    squashed = " ".join(text.lower().split())
    return hashlib.sha1(squashed.encode("utf-8")).hexdigest()[:10]


def load_postings(path=None):
    """Return all labeled postings as a list of dicts (empty if no file yet)."""
    path = Path(path) if path else DEFAULT_PATH
    if not path.exists():
        return []
    # "utf-8-sig" so a file re-saved by Excel (which adds an invisible marker
    # at the start) still loads correctly. newline="" is required by the
    # csv module so that line breaks INSIDE a posting are kept intact.
    with open(path, newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def save_postings(postings, path=None):
    """Write the whole list of postings to disk."""
    path = Path(path) if path else DEFAULT_PATH
    path.parent.mkdir(parents=True, exist_ok=True)

    # Write to a temporary file first, then swap it into place. If the
    # program crashes halfway through writing, the temp file is the broken
    # one and your real dataset (weeks of work) is untouched.
    # "utf-8-sig" so Excel shows accents and symbols correctly when you open
    # the file.
    tmp_path = path.with_suffix(".tmp")
    with open(tmp_path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(postings)
    os.replace(tmp_path, path)


def add_posting(text, label, confidence, evidence, notes="", path=None):
    """Validate and save one new labeled posting. Returns its ID.

    Raises ValueError with a readable message if something is wrong, so the
    labeling page can show that message to you.
    """
    text = normalize_text(text)
    if len(text) < MIN_TEXT_CHARS:
        raise ValueError(
            f"That looks too short to be a full posting "
            f"(need at least {MIN_TEXT_CHARS} characters)."
        )
    if label not in LABELS:
        raise ValueError("Pick a label: ghost or legit.")
    if confidence not in CONFIDENCES:
        raise ValueError("Pick a confidence: sure or unsure.")
    for key in evidence:
        if key not in EVIDENCE_OPTIONS:
            raise ValueError(f"Unknown evidence option: {key}")

    postings = load_postings(path)
    posting_id = make_id(text)
    if any(p["id"] == posting_id for p in postings):
        raise ValueError("You already added this posting.")

    postings.append(
        {
            "id": posting_id,
            "added_at": datetime.now().isoformat(timespec="seconds"),
            "label": label,
            "confidence": confidence,
            # A list can't go in one CSV cell, so join the keys with ";".
            "evidence": ";".join(evidence),
            "notes": notes.strip(),
            "text": text,
        }
    )
    save_postings(postings, path)
    return posting_id


def delete_posting(posting_id, path=None):
    """Remove a posting by ID. Returns True if something was removed."""
    postings = load_postings(path)
    kept = [p for p in postings if p["id"] != posting_id]
    if len(kept) == len(postings):
        return False
    save_postings(kept, path)
    return True


def summarize(postings):
    """Counts shown on the labeling page (and useful in train.py later)."""
    return {
        "total": len(postings),
        "ghost": sum(1 for p in postings if p["label"] == "ghost"),
        "legit": sum(1 for p in postings if p["label"] == "legit"),
        "unsure": sum(1 for p in postings if p["confidence"] == "unsure"),
        "text_only": sum(
            1 for p in postings if "text_only" in p["evidence"].split(";")
        ),
    }
