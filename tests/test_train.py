"""
Tests for train.py, focused on the honesty checks rather than on training
(which test_logreg.py already covers). If these warnings silently stop
firing, the script starts overstating how good the model is, which is the
worst way for this project to fail.
"""

import json
import unittest
from pathlib import Path

import train
from ghostjob import features

REPO_ROOT = Path(__file__).resolve().parent.parent


class WarningTests(unittest.TestCase):
    def warnings_for(self, labels, evidence=None, kind="real", cv_accuracy=None):
        evidence = evidence if evidence is not None else [[] for _ in labels]
        return " ".join(train.collect_warnings(labels, evidence, kind, cv_accuracy))

    def test_small_dataset_is_flagged(self):
        self.assertIn("swings wildly", self.warnings_for([1, 0] * 10))

    def test_thin_but_usable_dataset_is_flagged_more_gently(self):
        text = self.warnings_for([1, 0] * 50)  # 100 examples
        self.assertIn("thin", text)
        self.assertNotIn("swings wildly", text)

    def test_large_balanced_dataset_has_no_size_warning(self):
        text = self.warnings_for([1, 0] * 110)  # 220 examples
        self.assertNotIn("thin", text)
        self.assertNotIn("swings wildly", text)

    def test_imbalance_is_flagged(self):
        labels = [1] * 10 + [0] * 90
        self.assertIn("lopsided", self.warnings_for(labels))

    def test_balanced_data_is_not_flagged_as_lopsided(self):
        self.assertNotIn("lopsided", self.warnings_for([1, 0] * 50))

    def test_circular_labels_are_flagged(self):
        labels = [1, 0] * 50
        evidence = [["text_only"] for _ in labels]
        self.assertIn("gut feeling", self.warnings_for(labels, evidence))

    def test_evidence_backed_labels_are_not_flagged_as_circular(self):
        labels = [1, 0] * 50
        evidence = [["reposted", "no_reply"] for _ in labels]
        self.assertNotIn("gut feeling", self.warnings_for(labels, evidence))

    def test_demo_data_is_always_flagged(self):
        self.assertIn("SYNTHETIC", self.warnings_for([1, 0] * 50, kind="demo"))

    def test_real_data_is_not_called_synthetic(self):
        self.assertNotIn("SYNTHETIC", self.warnings_for([1, 0] * 50, kind="real"))

    def test_suspiciously_perfect_accuracy_is_flagged(self):
        text = self.warnings_for([1, 0] * 50, cv_accuracy=1.0)
        self.assertIn("implausibly high", text)

    def test_believable_accuracy_is_not_flagged(self):
        text = self.warnings_for([1, 0] * 50, cv_accuracy=0.74)
        self.assertNotIn("implausibly high", text)


class UntrainableGuardTests(unittest.TestCase):
    """train.py must refuse rather than write a meaningless model.

    The case that prompted this: three postings, all labelled ghost. Every
    weight trained to exactly 0.000, and cross-validation reported 100%
    accuracy because "always say ghost" is right when everything is ghost.
    It looked like a success and would have overwritten a working model
    with one that scores every posting identically.
    """

    def assert_refuses(self, labels):
        with self.assertRaises(SystemExit) as caught:
            train.refuse_if_untrainable(labels)
        self.assertEqual(caught.exception.code, 1)

    def test_refuses_when_every_posting_is_ghost(self):
        self.assert_refuses([1, 1, 1])

    def test_refuses_when_every_posting_is_legit(self):
        self.assert_refuses([0] * 40)

    def test_refuses_when_one_class_is_too_small_to_validate(self):
        # Plenty of data overall, but too few of the rarer class for any
        # fold to contain one.
        self.assert_refuses([1] * 50 + [0] * (train.MIN_PER_CLASS - 1))

    def test_allows_a_small_but_balanced_dataset(self):
        # Should not raise: thin, but both classes are represented enough
        # to learn and validate. The warnings cover the "thin" part.
        train.refuse_if_untrainable([1] * train.MIN_PER_CLASS + [0] * train.MIN_PER_CLASS)

    def test_allows_a_healthy_dataset(self):
        train.refuse_if_untrainable([1] * 60 + [0] * 55)


class BeatsGuessingGuardTests(unittest.TestCase):
    """A model that loses to guessing must not overwrite the deployed one.

    The case that prompted this: the first run on real data gave 70%
    cross-validated accuracy against a 75% baseline, from 20 postings with
    only 5 ghost among them. It also learned relationships that are
    backwards from the hypotheses in features.py - naming a manager and
    giving a deadline both pushed toward ghost - which is what fitting five
    examples looks like. The report said so clearly, but docs/model.json had
    already been overwritten by then.
    """

    def assert_refuses(self, cv_accuracy, baseline):
        with self.assertRaises(SystemExit) as caught:
            train.refuse_if_worse_than_guessing(cv_accuracy, baseline, False)
        self.assertEqual(caught.exception.code, 1)

    def test_refuses_when_below_the_baseline(self):
        self.assert_refuses(0.70, 0.75)

    def test_refuses_when_merely_equal_to_the_baseline(self):
        # Matching the baseline means the features added nothing at all.
        self.assert_refuses(0.75, 0.75)

    def test_allows_a_model_that_beats_the_baseline(self):
        train.refuse_if_worse_than_guessing(0.78, 0.75, False)

    def test_write_anyway_overrides_it(self):
        # The escape hatch has to work, or the only way past the guard is
        # editing the source, which is how guards end up deleted.
        train.refuse_if_worse_than_guessing(0.10, 0.75, True)


class DemoDataTests(unittest.TestCase):
    def test_demo_data_loads_and_is_balanced(self):
        texts, labels, evidence, kind = train.load_demo_data()
        self.assertEqual(kind, "demo")
        self.assertEqual(len(texts), len(labels))
        self.assertGreaterEqual(len(texts), 20)
        # Roughly balanced, so the baseline comparison stays meaningful.
        share_ghost = sum(labels) / len(labels)
        self.assertGreater(share_ghost, 0.35)
        self.assertLess(share_ghost, 0.65)

    def test_demo_postings_are_distinct(self):
        texts, _, _, _ = train.load_demo_data()
        self.assertEqual(len(set(texts)), len(texts))


class ModelFileTests(unittest.TestCase):
    """The saved model must contain everything the website needs."""

    def setUp(self):
        path = REPO_ROOT / "docs" / "model.json"
        if not path.exists():
            self.skipTest("docs/model.json not built yet; run train.py --demo")
        with open(path, encoding="utf-8") as f:
            self.model = json.load(f)

    def test_has_every_field_the_site_needs(self):
        for key in (
            "feature_names", "feature_labels", "weights", "bias",
            "means", "stds", "metrics", "warnings", "trained_on",
        ):
            self.assertIn(key, self.model)

    def test_arrays_line_up_with_the_feature_list(self):
        n = len(features.FEATURE_NAMES)
        self.assertEqual(self.model["feature_names"], features.FEATURE_NAMES)
        self.assertEqual(len(self.model["weights"]), n)
        self.assertEqual(len(self.model["means"]), n)
        self.assertEqual(len(self.model["stds"]), n)

    def test_no_posting_text_is_published(self):
        # The model file ships to a public website, so it must carry only
        # aggregate numbers, never anyone's posting text.
        blob = json.dumps(self.model)
        self.assertNotIn("text", self.model)
        self.assertLess(len(blob), 20000)

    def test_no_zero_standard_deviations(self):
        # A zero here would mean dividing by zero in the browser.
        self.assertTrue(all(s > 0 for s in self.model["stds"]))


if __name__ == "__main__":
    unittest.main()
