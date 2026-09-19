"""
End-to-end parity: does the WEBSITE produce the same score as PYTHON?

tests/js/test_features.mjs already checks the two feature extractors agree.
This goes one step further and compares the final probabilities, which also
covers the standardization and the weighted sum done in the browser. If
these ever disagree, the number a visitor sees is not the number the model
was trained to produce.

It works by running the real JavaScript through Node and comparing against
Python's answer for the same postings.
"""

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from ghostjob import features, logreg

REPO_ROOT = Path(__file__).resolve().parent.parent
MODEL_PATH = REPO_ROOT / "docs" / "model.json"
PREDICT_SCRIPT = REPO_ROOT / "tests" / "js" / "predict.mjs"

# Postings chosen to exercise different parts of the model: heavy ghost
# signals, heavy legitimate signals, a mixture, and awkward input.
SAMPLE_TEXTS = [
    "Join our talent pool! We are always looking for passionate self-starters "
    "to join our fast-paced, dynamic growing team. Competitive salary. No "
    "specific opening at this time but we will keep your resume on file.",

    "Backend Engineer. Salary $95,000 - $115,000. You will report to Dana "
    "Okafor and own the billing service. In your first 90 days you will ship "
    "to production. Applications close 14 March. Email dana@example.com.",

    "Marketing Coordinator. We are a fast-paced company seeking a detail-"
    "oriented team player. Responsibilities include various tasks as assigned. "
    "3+ years experience required. Start date is 1 June.",

    "Entry level junior developer wanted, must have 8+ years of professional "
    "experience. Competitive compensation. Multiple positions available "
    "nationwide. Apply today to join our growing team!",

    "Line Cook, $21.00/hr plus tips. You will work alongside our sous chef "
    "Marco in a kitchen of seven. Day-to-day you will run the grill station. "
    "Immediate start. Ask for Marco or email kitchen@example.com.",

    # Deliberately awkward: punctuation, accents, odd spacing, line breaks.
    "Café Manager\r\n\r\n  Salary: $52,000–58,000.   You'll report to "
    "the owner, Renée.\n\nDay-to-day you will open the café at 6am.",
]


@unittest.skipUnless(shutil.which("node"), "Node.js is not installed")
class PredictionParityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not MODEL_PATH.exists():
            raise unittest.SkipTest("docs/model.json not built; run train.py --demo")
        with open(MODEL_PATH, encoding="utf-8") as f:
            cls.model = json.load(f)

        # Ask the real JavaScript for its answers.
        with tempfile.NamedTemporaryFile(
            "w", suffix=".json", delete=False, encoding="utf-8"
        ) as tmp:
            json.dump(SAMPLE_TEXTS, tmp)
            texts_path = tmp.name
        try:
            completed = subprocess.run(
                ["node", str(PREDICT_SCRIPT), texts_path],
                capture_output=True,
                text=True,
                cwd=REPO_ROOT,
                timeout=60,
            )
        finally:
            Path(texts_path).unlink(missing_ok=True)

        if completed.returncode != 0:
            raise AssertionError(f"Node failed:\n{completed.stderr}")
        cls.js_results = json.loads(completed.stdout)

    def python_probability(self, text):
        """Score a posting the same way the browser does, but in Python."""
        raw = features.features_as_list(text)
        standardized = logreg.standardize_apply(
            [raw], self.model["means"], self.model["stds"]
        )[0]
        return logreg.predict_probability(
            standardized, self.model["weights"], self.model["bias"]
        )

    def test_probabilities_match(self):
        for text, js in zip(SAMPLE_TEXTS, self.js_results):
            with self.subTest(text=text[:45]):
                self.assertAlmostEqual(
                    self.python_probability(text), js["probability"], places=9
                )

    def test_per_feature_contributions_match(self):
        # Not just the total: each individual contribution must agree, or the
        # breakdown shown to visitors is wrong even when the score is right.
        for text, js in zip(SAMPLE_TEXTS, self.js_results):
            raw = features.extract_features(text)
            for index, name in enumerate(self.model["feature_names"]):
                standardized = (
                    raw[name] - self.model["means"][index]
                ) / self.model["stds"][index]
                expected = self.model["weights"][index] * standardized
                with self.subTest(text=text[:30], feature=name):
                    self.assertAlmostEqual(
                        expected, js["contributions"][name], places=9
                    )

    def test_contributions_and_bias_sum_to_z(self):
        # The claim the website makes to visitors: these factors add up to
        # the score. If that is not arithmetically true, the explanation is
        # decorative rather than real.
        for js in self.js_results:
            total = self.model["bias"] + sum(js["contributions"].values())
            self.assertAlmostEqual(total, js["z"], places=9)


if __name__ == "__main__":
    unittest.main()
