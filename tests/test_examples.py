"""The three built-in examples must still say what the page claims they say.

WHY THIS FILE EXISTS. The examples used to be about 100 words each, written
against a demo model trained on 60-word synthetic postings. When the model
was retrained on real adverts averaging 640 words, every example fell
outside the training range on at least one feature, and the one labelled
"genuine" scored 91% ghost. Nothing failed. The page simply showed a visitor
the tool getting the easiest possible case backwards, on the first button
they were invited to press.

Examples are content, so nothing else checks them: the JavaScript parses,
the model loads, the tests pass. But they are content the model has an
opinion about, and that opinion changes every time train.py runs. So this
re-derives it from the CURRENT docs/model.json rather than trusting a
number someone wrote in a comment once.
"""

import json
import re
import unittest
from pathlib import Path

from ghostjob import features, logreg

REPO_ROOT = Path(__file__).resolve().parent.parent
APP_JS = REPO_ROOT / "docs" / "app.js"
MODEL_PATH = REPO_ROOT / "docs" / "model.json"

# Must match THRESHOLD_LOW / THRESHOLD_HIGH in docs/scorer.js.
THRESHOLD_LOW = 0.40
THRESHOLD_HIGH = 0.70

# What each example is there to demonstrate.
EXPECTED_BAND = {
    "ghost": "high",
    "genuine": "low",
    "borderline": "medium",
}


def parse_examples():
    """Pull the EXAMPLES object out of app.js.

    Read rather than duplicated, so the test cannot pass against a copy of
    the text while the page ships something else.
    """
    source = APP_JS.read_text(encoding="utf-8")
    block = source[source.index("const EXAMPLES = {"):]
    block = block[: block.index("\n};")]
    found = {}
    for key in EXPECTED_BAND:
        match = re.search(rf"\b{key}:\s*`(.*?)`", block, flags=re.S)
        if match:
            found[key] = match.group(1)
    return found


def band(probability):
    if probability >= THRESHOLD_HIGH:
        return "high"
    if probability >= THRESHOLD_LOW:
        return "medium"
    return "low"


class ExampleTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not MODEL_PATH.exists():
            raise unittest.SkipTest("docs/model.json not built; run train.py")
        cls.model = json.loads(MODEL_PATH.read_text(encoding="utf-8"))
        cls.examples = parse_examples()

    def score(self, text):
        raw = features.features_as_list(text)
        standardized = logreg.standardize_apply(
            [raw], self.model["means"], self.model["stds"]
        )[0]
        return logreg.predict_probability(
            standardized, self.model["weights"], self.model["bias"]
        )

    def test_all_three_examples_were_found(self):
        self.assertEqual(sorted(self.examples), sorted(EXPECTED_BAND))

    def test_each_example_lands_in_the_band_it_demonstrates(self):
        for key, expected in EXPECTED_BAND.items():
            with self.subTest(example=key):
                probability = self.score(self.examples[key])
                self.assertEqual(
                    band(probability),
                    expected,
                    f"the {key!r} example scores {probability:.0%}, which reads "
                    f"as {band(probability)!r} and not {expected!r}. Either "
                    f"reword it or retire it - a demo that contradicts its own "
                    f"button is worse than no demo.",
                )

    def test_no_example_is_outside_the_training_range(self):
        """Nothing should trip the clamp.

        An example that does is, by definition, unlike anything the model
        learned from, so the site correctly shows a caution box next to it.
        Three cautioned examples is the tool announcing that its own demos
        are unrepresentative, which they should not be.
        """
        clamp = self.model.get("standardize_clamp", logreg.CLAMP_SIGMAS)
        for key, text in self.examples.items():
            raw = features.extract_features(text)
            for index, name in enumerate(self.model["feature_names"]):
                unclamped = (
                    raw[name] - self.model["means"][index]
                ) / self.model["stds"][index]
                with self.subTest(example=key, feature=name):
                    self.assertLessEqual(
                        abs(unclamped),
                        clamp,
                        f"{key}: {name} is {unclamped:.1f} standard deviations "
                        f"from the training mean",
                    )

    def test_examples_are_a_realistic_length(self):
        # The original failure in one number: the examples were a fifth the
        # length of the postings the model was trained on.
        for key, text in self.examples.items():
            with self.subTest(example=key):
                self.assertGreater(len(text.split()), 300, f"{key} is too short")


if __name__ == "__main__":
    unittest.main()
