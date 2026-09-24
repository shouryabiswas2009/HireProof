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

It refuses to write in two cases, leaving the deployed model untouched:

- **Before training**, when a class is empty or has fewer than 5 examples.
  There is nothing to learn from, and the resulting all-zero model would
  report a meaningless 100%.
- **After training**, when cross-validated accuracy does not beat the
  baseline. Such a model has found no usable pattern, and shipping it would
  put a confident percentage and a per-signal breakdown on the site with
  nothing but noise underneath. `--write-anyway` overrides this.

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

The first attempt at training on real labels (20 postings, 5 of them ghost)
produced 70% cross-validated accuracy against a 75% baseline, and learned
relationships that are backwards from the hypotheses in `features.py`:
naming a manager and giving a deadline both pushed a posting *toward* ghost.
That is what fitting five examples looks like. The guard above refused to
deploy it, which is the tooling working rather than a setback. The dataset
needs to grow, especially the ghost side.


## Why this isn't production-ready

Worth stating plainly, because the gap between "this works" and "this can
be trusted" is the interesting part of the project.

**The training set is small, and one person built it.** A few hundred
postings labelled by one person is enough to demonstrate a pipeline, not
enough to make a claim about job postings in general. Every label carries
that person's assumptions, so the model inherits their blind spots along
with their reasoning. A second labeller disagreeing with the first would be
the single most useful thing to add.

**The labels are guesses, not ground truth.** Nobody can *know* a posting
is a ghost job by reading it. The only honest evidence is outside the text
— the posting sat open for months, the same role kept reappearing, an
application went unanswered — and even that is circumstantial. The
labelling tool records which evidence backed each label, and the training
script warns when too many were judged from the wording alone, because
those are circular: the model's features come from the wording too, so it
would just be learning to agree with one person's hunch.

**Logistic regression cannot learn interactions.** It weighs each signal
independently and adds them up. It can learn "no salary pushes toward
ghost", but not "no salary matters *only when* the posting is also vague
about the team" — which is closer to how a person actually reads these. A
tree-based model gets that for free. Given the dataset size, the trade was
worth making for an explanation that is the arithmetic itself rather than
an approximation of it, but it is a real ceiling.

**The probabilities are not calibrated.** When the model says 70%, that
does not mean 70 out of 100 such postings are ghost jobs. Calibration needs
far more data than this has. The score is a ranking, not a measurement.

**It only knows English, mostly about office work.** The phrase lists are
English, and most labelled postings are software and administrative roles.
Trades, healthcare, hospitality and academia phrase things differently and
are barely represented.

**What would change that:** several hundred postings labelled by more than
one person, with disagreements measured rather than averaged away; a
held-out test set that is only touched once; a calibration check; and a
comparison against a model that *can* capture interactions, to find out how
much the simple one is leaving on the table.

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
