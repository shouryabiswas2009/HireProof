# HireProof

Paste the text of a job posting and get a risk score for whether it reads
like a **ghost job** &mdash; a listing posted with no real intent to hire.

The score comes from a logistic regression model written from scratch (no
scikit-learn, no numpy, no external AI services), trained on postings
labelled by hand. Every score comes with a breakdown of which signals drove
it, because a number on its own is not much use.

**Live site: https://shouryabiswas2009.github.io/HireProof/**
(the capital H and P matter &mdash; GitHub Pages URLs are case-sensitive)

## How it works, in one paragraph

Training runs on a laptop in Python and produces a small file of numbers
(`docs/model.json`): one weight per feature, plus a bias. The website loads
those numbers and does the scoring **in the visitor's browser** in
JavaScript. There is no backend, which means hosting is genuinely free and
the pasted posting never leaves the visitor's device.

## Setup (Windows, PowerShell)

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

## The three parts

### 1. Label postings (local only)

```powershell
.\.venv\Scripts\python.exe -m labeler.app
```

Open http://127.0.0.1:5000, paste a posting, tag it ghost or legit, and
record what evidence the label is based on. Saved to
`data/labeled_postings.csv`, which is gitignored because job postings are
the companies' copyrighted text.

### 2. Train the model

```powershell
.\.venv\Scripts\python.exe train.py
```

Prints an honest report: cross-validated accuracy, how that compares to
simply guessing the commonest answer, what each feature learned, and
warnings when the dataset is too small, too lopsided, or too circular to
trust. Writes `docs/model.json`.

To try it before you have labelled anything, use the synthetic demo data:

```powershell
.\.venv\Scripts\python.exe train.py --demo
```

### 3. The public site

Everything in `docs/` is the published website. To preview it locally:

```powershell
.\.venv\Scripts\python.exe -m http.server 5055 --directory docs
```

Then open http://localhost:5055.

### 4. Publish an updated model

After retraining, the site updates by pushing the new weights:

```powershell
git add docs/model.json docs/phrases.json
git commit -m "Retrain on latest labelled data"
git push
```

GitHub Pages redeploys automatically, usually within a minute.

## Tests

```powershell
.\run_tests.ps1
```

Runs the Python suite and the JavaScript suite. Both must pass: feature
extraction exists in both languages, and the tests check they agree.

## Current status

The public model is trained on **synthetic placeholder postings** written by
hand (`data/demo_postings.json`), because the real labelled dataset is still
being collected. It scores 100% in cross-validation, which is a warning sign
rather than an achievement: those examples are far more cleanly separated
than real postings ever are. Both the training report and the website say so.

## Layout

```
labeler/          local Flask app for building the training set
ghostjob/
  dataset.py      reads and writes the labelled CSV
  features.py     text -> numbers (Python, used for training)
  logreg.py       logistic regression from scratch
shared/
  phrases.json    word lists and patterns, shared by both languages
train.py          trains the model, writes docs/model.json
docs/             the published website (GitHub Pages serves this folder)
  features.js     text -> numbers (JavaScript, mirrors features.py)
  scorer.js       applies the trained weights
tests/            Python tests, plus JavaScript tests in tests/js/
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for the design decisions and why
each one was made.
