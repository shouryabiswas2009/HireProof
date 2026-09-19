"""
Tests for ghostjob/features.py.

Most cases live in tests/fixtures/feature_cases.json, which the JavaScript
tests read too. If a change here breaks the site's copy, both test suites fail.
"""

import json
import math
import unittest
from pathlib import Path

from ghostjob import features

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "feature_cases.json"
with open(FIXTURE_PATH, encoding="utf-8") as f:
    FIXTURES = json.load(f)


class SharedFixtureTests(unittest.TestCase):
    """Run every shared case and check the expected numbers."""

    def test_shared_cases(self):
        for case in FIXTURES["cases"]:
            # subTest means one failing case doesn't hide the others.
            with self.subTest(case=case["name"]):
                actual = features.extract_features(case["text"])
                for name, expected in case["expected"].items():
                    # Keys starting with "_" are notes for humans (e.g. the
                    # arithmetic behind a number), not features to check.
                    if name.startswith("_"):
                        continue
                    self.assertAlmostEqual(
                        actual[name],
                        expected,
                        delta=FIXTURES["tolerance"],
                        msg=f"{case['name']}: feature '{name}'",
                    )


class FeatureShapeTests(unittest.TestCase):
    """Checks about the feature set itself, not any single posting."""

    def test_every_feature_has_a_label(self):
        # A missing label would crash the site's breakdown, so catch it here.
        self.assertEqual(
            set(features.FEATURE_NAMES), set(features.FEATURE_LABELS.keys())
        )

    def test_every_feature_has_both_state_labels(self):
        # The breakdown needs wording for a feature being present AND for it
        # being absent, because absence moves the score too.
        self.assertEqual(
            set(features.FEATURE_NAMES), set(features.FEATURE_STATE_LABELS.keys())
        )
        for name, states in features.FEATURE_STATE_LABELS.items():
            self.assertIn("on", states, name)
            self.assertIn("off", states, name)
            # The two must differ, or the row would read the same either way.
            self.assertNotEqual(states["on"], states["off"], name)

    def test_extract_returns_exactly_the_named_features(self):
        result = features.extract_features("Some short posting text here.")
        self.assertEqual(set(result.keys()), set(features.FEATURE_NAMES))

    def test_features_as_list_matches_name_order(self):
        text = "Salary $80,000 and you will build things. Reports to Sam."
        as_dict = features.extract_features(text)
        as_list = features.features_as_list(text)
        self.assertEqual(as_list, [as_dict[n] for n in features.FEATURE_NAMES])

    def test_all_values_are_finite_numbers(self):
        # Infinity or NaN would poison training in a way that is very hard to
        # debug later, so we check the extractor can never produce one.
        for case in FIXTURES["cases"]:
            for name, value in features.extract_features(case["text"]).items():
                self.assertTrue(
                    math.isfinite(value), f"{case['name']}/{name} was {value}"
                )


class NormalizeTests(unittest.TestCase):
    def test_collapses_whitespace_and_lowercases(self):
        self.assertEqual(features.normalize("  A\r\n B\t\tC  "), "a b c")


class YearsTests(unittest.TestCase):
    def test_picks_the_largest_number_of_years(self):
        text = features.normalize("2 years experience, ideally 7 years of experience")
        self.assertEqual(features.max_years_required(text), 7)

    def test_no_years_mentioned(self):
        self.assertEqual(features.max_years_required("no numbers here"), 0)

    def test_range_form(self):
        text = features.normalize("3-5 years of relevant experience required")
        self.assertEqual(features.max_years_required(text), 3)


if __name__ == "__main__":
    unittest.main()
