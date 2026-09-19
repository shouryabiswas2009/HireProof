# HireProof &mdash; Architecture and Design Decisions

This document explains how the system is put together, why it was built
this way, and what its real weaknesses are. The last section is a set of
likely interview questions with answers.

---

## 1. The system in one picture

There are three programs. Two run on my laptop; one runs in a visitor's
browser. They communicate through files, not network calls.

```
   ON MY LAPTOP                              ON A VISITOR'S DEVICE
   ------------------------------            -------------------------

   [ labeler/app.py ]
   Local Flask page. I paste
   postings and tag them.
            |
            v
   data/labeled_postings.csv
   (gitignored: postings are the
    companies' copyrighted text)
            |
            v
   [ train.py ]
   - ghostjob/features.py   text -> 11 numbers
   - ghostjob/logreg.py     gradient descent
   - honest evaluation report
            |
            v
   docs/model.json  ------- git push ------>  [ the web page ]
   (11 weights, 1 bias,                       docs/features.js  text -> 11 numbers
    means, stds, metrics)                     docs/scorer.js    applies the weights
   docs/phrases.json                          docs/app.js       draws the result
   (copied from shared/)                              |
                                                      v
                                              probability + breakdown
```

The key idea: **a trained logistic regression is just a short list of
numbers.** Eleven weights and a bias, about 3 KB of JSON. That means the
model can be shipped to the browser as a static file and applied there,
with no server anywhere in the system.

---

## 2. How a piece of text becomes a score

Five steps. Steps 1&ndash;3 happen in both Python (for training) and
JavaScript (for live scoring), and must produce identical results.

### Step 1: Normalize

Lowercase, and collapse all runs of whitespace into single spaces.

```
"WE ARE A FAST-PACED,\r\n   DYNAMIC   ENVIRONMENT."
  -> "we are a fast-paced, dynamic environment."
```

Pasted text is messy. A phrase like "wear many hats" often arrives split
across a line break, and we still need to find it.

### Step 2: Extract 11 features

Count phrase matches and run a few regexes, producing 11 numbers. Full
reasoning for each is in section 4.

```
has_salary_range           0.0
vague_pay_phrase           1.0
log_word_count             4.42
buzzword_density          13.25
concrete_duty_density      0.00
...
```

### Step 3: Standardize

Each feature is rescaled using the mean and standard deviation from the
training data:

```
standardized = (value - mean) / standard_deviation
```

**Why:** the raw features live on wildly different scales.
`log_word_count` is around 4&ndash;8, `buzzword_density` ranges 0&ndash;15,
and the yes/no features are 0 or 1. Gradient descent uses one learning rate
for all weights, so a step size that suits the big feature is far too large
for the small ones, and training zigzags or diverges. Rescaling puts them
on equal footing.

It has a second benefit that this project depends on: after standardizing,
the weights are **directly comparable**, so a bigger weight really does mean
a more influential feature. That is what makes the breakdown honest.

### Step 4: Weighted sum, then squash

```
z = bias + (w1 x1) + (w2 x2) + ... + (w11 x11)

probability = sigmoid(z) = 1 / (1 + e^-z)
```

`z` can be any number. The sigmoid squashes it into 0&ndash;1 so it can be
read as a probability: 0.5 means "no idea", values near 1 mean "strongly
resembles the ghost group".

### Step 5: Explain

Each term `w_j * x_j` in that sum is one feature's **contribution**. They
are independent and additive, so the breakdown shown to the user is not an
approximation or a story told after the fact &mdash; it is literally the
arithmetic that produced the number. `tests/test_parity_predictions.py`
asserts the contributions plus the bias sum exactly to `z`.

---

## 3. The main design decisions

### 3.1 Static site, scoring in the browser

**Decision:** no backend. Train on a laptop, publish the weights, score in
JavaScript on the visitor's device.

**Alternatives considered:**

| Option | Why not |
|---|---|
| Flask server on Render | Free tier sleeps after 15 min, so a LinkedIn visitor waits ~1 min for a cold start. Conflicting reports on whether a card is required. |
| Streamlit Community Cloud | One language, no duplicated code &mdash; genuinely tempting. But apps sleep after 12 hours idle, and it hides the web layer, which is the part worth learning. |
| PythonAnywhere | The free web app must be manually renewed every month or it goes offline. |

**Why static hosting won:** GitHub Pages is free for public repos with no
payment method on the account at all, so there is no mechanism by which it
could ever charge. It never sleeps and never expires. This app makes no
outbound API calls and stores nothing, so it does not need a server.

**Three consequences, two good and one bad:**

- Good: **privacy**. The posting text never leaves the visitor's device.
  For a tool people paste job applications into, that is a real feature.
- Good: **speed**. Scoring is instant; there is no network round trip.
- Bad: **the feature extractor exists twice** (see 3.2).

### 3.2 The duplicated feature extractor, and how it is contained

This is the biggest weakness in the design, and it is deliberate. Training
is in Python and scoring is in JavaScript, so `extract_features()` exists in
both languages. If they ever disagree, the model receives inputs it was never
trained on. Nothing crashes; the scores just quietly become wrong. This
problem has a name: **train/serve skew**.

Three defences:

1. **One source of truth for the data.** Every word list and regex lives in
   `shared/phrases.json`. Neither language owns them. `train.py` copies that
   file to `docs/phrases.json` at training time, so the site always uses the
   exact lists the model was trained with.
2. **Shared test fixtures.** `tests/fixtures/feature_cases.json` holds
   postings with expected feature values. The Python suite and the Node
   suite both run them. A change to one extractor that breaks parity fails
   both.
3. **End-to-end parity test.** `tests/test_parity_predictions.py` runs the
   real JavaScript through Node and asserts that the final probabilities and
   every individual contribution match Python to 9 decimal places.

Regexes are written to a restricted subset valid in both languages: no
lookbehind, no named groups, which differ between Python and JavaScript.

### 3.3 Logistic regression rather than something more powerful

**Decision:** logistic regression, implemented from scratch.

**Reasons, in order of importance:**

1. **Interpretability is the product.** The whole point is showing *why* a
   posting scored the way it did. In logistic regression the explanation is
   the model: the contributions are the actual terms of the sum. A random
   forest or gradient-boosted tree would need a separate explanation method
   (like SHAP) bolted on, producing an approximation of the model rather than
   the model itself.
2. **The dataset is tiny.** With a couple of hundred examples and 11
   features, a more flexible model would fit noise. Logistic regression is a
   straight line through feature space; there is not much for it to overfit
   to.
3. **Convex loss.** Log loss for logistic regression is bowl-shaped, so there
   is exactly one best answer and gradient descent will find it. Weights can
   start at zero and training is fully reproducible. Neural networks need
   random initialization precisely because they lack this guarantee.
4. **It is small enough to ship.** 11 weights is 3 KB of JSON. A forest of
   200 trees is not something to send to a browser.

**What was given up:** logistic regression can only learn that "more
buzzwords means more ghost-like", monotonically. It cannot learn an
interaction such as "buzzwords only matter when no salary is given". A tree
model learns those automatically. With this much data, that trade is worth
making.

### 3.4 Pure Python, no numpy

`logreg.py` uses only `math` and lists. At 200 examples by 11 features the
performance difference is irrelevant, and every step stays visible. It also
means the training side has exactly one dependency (Flask, for the labeling
tool only).

### 3.5 Labeling tool as a local web page

Pasting a multi-paragraph posting into a terminal on Windows is painful; a
textarea is not. The tool is deliberately bound to `127.0.0.1` and runs with
Flask's debug mode off, so it is not reachable from the network.

Storage is a single CSV rather than SQLite, because it can be opened in
Excel to inspect, and at ~200 rows a database adds concepts without adding
value. Writes are **atomic**: `save_postings` writes a `.tmp` file and then
swaps it into place, so a crash mid-write cannot corrupt weeks of labeling.

### 3.6 Evidence checkboxes: the label-quality problem

This is the most important design decision in the project, and it is not a
technical one.

**The problem:** nobody can *know* a posting is a ghost job by reading it.
If I label postings "ghost" because they are full of buzzwords, and then
train a model whose features are buzzword counts, the model has learned
nothing except to reproduce my own gut feeling. That is circular, and a
model built that way can look accurate while being worthless.

**The mitigation:** every label records *why* I believe it &mdash; the
posting has been up 30+ days, it keeps being reposted, I applied and never
heard back, the company has announced layoffs, or **"I judged it from the
wording alone"**. Those fields are never used as model features. They exist
so `train.py` can report what fraction of labels are circular and warn when
it exceeds half the dataset.

The strongest real-world ghost-job signals (how long a posting has been up,
whether it was reposted) are not available from pasted text at all. They
inform the *labels*; the model works from wording only. The site says so.

### 3.7 Honest evaluation, built into the tooling

`train.py` will not let its own results be read optimistically:

- **Cross-validation, not a single split.** With ~200 postings a 20% holdout
  is only ~40 examples, so accuracy swings wildly with the luck of the draw.
  5-fold CV tests every posting exactly once and averages.
- **Standardization inside each fold.** Computing means over the whole
  dataset first would leak information about the test fold into training and
  inflate the score. This mistake is called **data leakage**.
- **Always compared to a baseline.** If 70% of postings are legit, always
  answering "legit" scores 70%. Accuracy quoted without that comparison is
  meaningless, so the report always prints both.
- **Precision and recall, not just accuracy.** For this tool, false
  positives are the costly error: wrongly flagging a real job could talk
  someone out of applying.
- **It warns when a score is too good.** A cross-validated accuracy above
  98% triggers a warning, because on a problem this noisy that almost always
  means the data is too cleanly separated rather than the model being
  excellent. The current demo model scores 100% and is flagged accordingly.

---

## 4. The 11 features, and why each was chosen

These are **hypotheses**, drawn from commonly reported reasons ghost
postings exist: building a resume pipeline, appearing to grow, a posting
nobody closed, or a role already filled internally. Training on real data
decides which actually carry signal. A weight near zero is a legitimate
finding, not a failure.

| # | Feature | Reasoning |
|---|---|---|
| 1 | `has_salary_range` | A budgeted, approved role usually has a number attached. Several US states now legally require a pay range, which makes its absence more meaningful than it used to be. |
| 2 | `vague_pay_phrase` | "Competitive salary" is what gets written when the pay band has not been decided &mdash; which can mean the role is not really approved. |
| 3 | `log_word_count` | Very short and very long postings both look off. **Log**, not raw count: 50 vs 200 words is meaningful, 2000 vs 2150 is noise. |
| 4 | `buzzword_density` | Filler language ("fast-paced", "wear many hats", "rockstar") fills space when there is no specific job to describe. |
| 5 | `concrete_duty_density` | The counterweight. Someone who knows what the person will actually do writes specifics, because real work is waiting. |
| 6 | `names_reporting_line` | A named manager or team suggests a specific human owns the role. |
| 7 | `has_contact_email` | A direct contact suggests a live process rather than a form feeding a database. |
| 8 | `evergreen_language` | The clearest case: the posting openly says it is collecting resumes for the future. My strongest hypothesis. |
| 9 | `multiple_openings_language` | Weaker and genuinely uncertain &mdash; large legitimate employers post this way too. Included to let the data decide. |
| 10 | `has_deadline_or_start_date` | An active search has a timeline; a posting left open indefinitely usually does not mention one. |
| 11 | `experience_mismatch` | "Entry level" demanding 5+ years: a posting nobody can fill stays open forever. |

**Two measurement choices worth defending:**

- **Density, not raw count** (features 4 and 5). A long posting mentions
  more of everything, so a raw count would partly just measure length &mdash;
  which feature 3 already captures. Dividing by word count asks "how
  buzzword-y is the writing", independent of length.
- **Each distinct phrase counts once.** A posting saying "fast-paced" five
  times is not five times more suspicious than one saying it once.

**Why 11 and not 50?** A rough rule of thumb is 10+ training examples per
feature. At a target of 200 labeled postings, 11 features is comfortable;
50 would invite memorization of noise.

---

## 5. Known weaknesses

Worth stating plainly, because being able to name them is more impressive
than pretending they do not exist.

1. **The labels are educated guesses.** No ground truth exists. See 3.6.
2. **The current public model is trained on synthetic data** I wrote by
   hand, and its 100% accuracy is an artifact of my writing the two groups
   too far apart. The site says this prominently.
3. **Feature extraction is duplicated** across two languages. Mitigated by
   tests (3.2), not eliminated.
4. **Keyword matching is brittle.** A posting that says "we move quickly"
   instead of "fast-paced" scores differently despite meaning the same
   thing. Embeddings would handle that, but would break the "no external AI
   services" constraint and destroy interpretability.
5. **English-only, and biased toward the postings I happened to label.**
   Other countries, industries and languages may score oddly.
6. **No interaction effects.** See 3.3.
7. **The 0.5 decision threshold is arbitrary.** Given that false positives
   are the costly error here, a higher threshold for "ghost" would arguably
   be better. The site shows the probability rather than a hard verdict,
   which side-steps the choice.

---

## 6. Likely interview questions

### On the machine learning

**Q: Explain logistic regression to someone who does not know it.**
- It draws a line (a weighted sum) through the features, producing a score
  `z` that can be any number.
- The sigmoid squashes `z` into 0&ndash;1 so it reads as a probability.
- Training finds the weights that make the predicted probabilities match the
  training labels as closely as possible.
- "Logistic" refers to the sigmoid (logistic) function; despite "regression"
  in the name, it is used for classification.

**Q: Why log loss and not just counting mistakes?**
- Counting mistakes is flat: it cannot distinguish "barely wrong" from
  "confidently wrong", so there is no slope for gradient descent to follow.
- Log loss punishes confident mistakes harshly: predicting 0.01 when the
  truth is 1 gives a loss of about 4.6; predicting 0.4 gives about 0.9.
- It is also differentiable everywhere, which is what makes gradient descent
  possible.

**Q: Write the gradient descent update.**
- Prediction error for one example: `error = predicted - actual`.
- Gradient for weight *j*: the average of `error * feature_j` across examples.
- Update: `w_j = w_j - learning_rate * gradient_j`.
- The elegance is that the derivative of log loss composed with sigmoid
  simplifies to exactly `(p - y) * x`. The sigmoid's own derivative cancels out.
- I verified my derivation with a numerical gradient check in
  `tests/test_logreg.py`: comparing my formula against
  `(loss(w+h) - loss(w-h)) / 2h`.

**Q: What is regularization and why use it?**
- L2 adds a penalty proportional to the sum of squared weights.
- With only a couple of hundred examples, the model can latch onto a
  coincidence and assign one feature a huge weight. The penalty pulls weights
  toward zero, keeping the model humble.
- The bias is deliberately excluded, since it only sets the baseline rate and
  shrinking it would push predictions toward 50/50 for no reason.

**Q: Why did you standardize the features?**
- The features are on very different scales (0&ndash;1 binaries versus
  densities up to 15). One learning rate cannot suit all of them, so training
  zigzags.
- It also makes weights comparable, which the interpretability feature
  depends on.
- Critically, the means and standard deviations are computed on **training
  data only** and shipped with the model, so live scoring applies the exact
  same transformation.

**Q: Why cross-validation instead of a train/test split?**
- With ~200 examples, a 20% test set is ~40 examples, so the accuracy
  estimate depends heavily on which 40 were drawn.
- 5-fold CV tests every example exactly once and averages, giving a much
  steadier estimate. The cost is training 5 times, which is trivial here.

**Q: What is data leakage and where could it have bitten you?**
- Leakage is when information from the test set influences training,
  inflating the score.
- My specific risk: standardizing over the whole dataset before splitting
  would let the test fold's values influence the means. I standardize inside
  each fold instead.
- A second guard: the labeling tool rejects duplicate postings by hashing the
  normalized text, so the same posting cannot land in both training and test.

**Q: Your model reports 100% accuracy. Is that good?**
- No, it is a warning sign, and `train.py` flags it automatically.
- It is trained on synthetic postings I wrote, where I unintentionally made
  the two groups far more separable than real postings ever are.
- Real data will score much lower, and that number will be worth more.

**Q: Accuracy is 85%. Is the model good?**
- Not knowable from that number alone. First question: what does always
  guessing the commonest label score? If the data is 85% legit, 85% accuracy
  is worthless.
- Then look at precision and recall separately. For this tool, false
  positives matter most, since wrongly flagging a real job could cost someone
  an opportunity.

**Q: Why not a neural network / random forest / an LLM?**
- Interpretability is the product; logistic regression's explanation *is* the
  model, not an approximation of it.
- A couple of hundred examples cannot support a high-capacity model.
- An LLM call would break the zero-cost constraint, add a runtime dependency,
  and provide no auditable reason for a score.
- The honest trade-off: a tree model would capture feature interactions that
  mine cannot.

### On the engineering

**Q: Why no backend?**
- The trained model is 11 weights and a bias, about 3 KB, so it can be
  shipped as a static file and applied in the browser.
- That makes hosting free with no possibility of charges, removes cold
  starts, and means the posting text never leaves the user's device.

**Q: What is the biggest risk in your architecture?**
- Train/serve skew. Feature extraction exists in Python for training and in
  JavaScript for serving. If they drift, the model silently receives inputs it
  never saw in training, and nothing crashes.
- Mitigations: one shared JSON file for all word lists and patterns; shared
  test fixtures run by both suites; and an end-to-end test that runs the real
  JavaScript through Node and asserts identical probabilities to 9 decimal
  places.

**Q: How do you know your two implementations agree?**
- `tests/test_parity_predictions.py` runs the actual browser JavaScript under
  Node against the same postings and compares final probabilities and every
  individual feature contribution.
- It also asserts the contributions plus bias sum exactly to `z`, which is the
  claim the UI makes to users.

**Q: Walk me through a bug you found.**
- The score breakdown originally labelled each row with the feature's name.
  A posting with no salary showed "Pay figure given &mdash; raises risk".
- The arithmetic was correct (absence of a salary pushes toward ghost), but
  the wording told the reader the exact opposite of the truth.
- The fix: each feature carries wording for both states, and the site picks
  based on whether the posting is above or below the training average.
- The lesson: a correct model can still produce a misleading interface, and
  the interface is what the user actually experiences.

**Q: Why is the labeled data not in the repo?**
- Job postings are the companies' copyrighted text, and the repo is public.
  `data/*.csv` is gitignored.
- The published `model.json` contains only aggregate numbers &mdash; weights,
  means, standard deviations &mdash; and no posting text. A test asserts this.

### On the judgement calls

**Q: How do you know a posting is really a ghost job?**
- I do not, and that is the honest core weakness of the project.
- This is why every label records the evidence behind it, and why
  "judged from the wording alone" is a tracked category: those labels are
  circular, since the model's features are also drawn from wording.
- `train.py` warns when more than half the labels are of that kind.
- The site is worded as "resembles postings labelled ghost", never "is a
  ghost job".

**Q: What would you do with more time?**
- Collect real labels with outside evidence, which is the actual bottleneck.
- Add a proper held-out test set once the dataset is large enough, since
  repeated cross-validation while tuning slowly leaks information.
- Calibration check: when the model says 70%, are 70% of those actually
  ghost postings?
- Try a small decision tree purely to test whether interaction effects
  matter, and compare honestly.
- Let users report whether a score seemed right, to gather better labels.

**Q: What would you do differently?**
- Decide the label definition before writing any code. I built features
  before fully confronting how weak the labels are, and the evidence-tracking
  design was a retrofit.
- Possibly use Streamlit to avoid duplicating feature extraction, accepting
  the 12-hour sleep in exchange for a single language.

---

## 7. File map

| Path | Role |
|---|---|
| `labeler/app.py` | Local Flask labeling tool. Never deployed. |
| `ghostjob/dataset.py` | Reads/writes the labeled CSV; validation, dedupe, atomic saves. |
| `ghostjob/features.py` | Text to 11 numbers (Python side). |
| `ghostjob/logreg.py` | Sigmoid, log loss, gradient descent, standardization, k-fold CV. |
| `shared/phrases.json` | All word lists and regexes. Single source of truth. |
| `train.py` | Trains, reports honestly, writes `docs/model.json`. |
| `docs/features.js` | Text to 11 numbers (JavaScript side; mirrors `features.py`). |
| `docs/scorer.js` | Applies weights, computes contributions. |
| `docs/app.js` | Page wiring and rendering. |
| `tests/fixtures/feature_cases.json` | Shared fixtures run by both test suites. |
| `tests/test_parity_predictions.py` | End-to-end Python/JavaScript agreement. |
