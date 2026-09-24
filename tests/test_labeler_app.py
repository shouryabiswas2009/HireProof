"""
Tests for the labeling web app, using Flask's built-in test client (it calls
the app's routes directly, with no real server or browser needed).
"""

import tempfile
import unittest
from pathlib import Path
from unittest import mock

from ghostjob import dataset
from labeler.app import app

SAMPLE = "We are hiring a Software Engineer to build backend services. " * 3


class LabelerAppTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        # Point the app at a temp file instead of your real dataset.
        patcher = mock.patch.object(
            dataset, "DEFAULT_PATH", Path(self._tmp.name) / "labeled.csv"
        )
        patcher.start()
        self.addCleanup(patcher.stop)
        self.client = app.test_client()

    def test_pages_load(self):
        self.assertEqual(self.client.get("/").status_code, 200)
        self.assertEqual(self.client.get("/postings").status_code, 200)

    def test_adding_a_posting_saves_it_and_shows_in_list(self):
        response = self.client.post(
            "/add",
            data={"text": SAMPLE, "label": "ghost", "confidence": "sure",
                  "evidence": ["reposted", "no_reply"], "notes": "seen 3 times"},
            follow_redirects=True,
        )
        self.assertIn(b"Saved as ghost", response.data)
        saved = dataset.load_postings()
        self.assertEqual(len(saved), 1)
        self.assertEqual(saved[0]["label"], "ghost")
        self.assertIn(b"seen 3 times", self.client.get("/postings").data)

    def test_error_keeps_what_you_typed(self):
        response = self.client.post(
            "/add",
            data={"text": "too short", "label": "legit", "confidence": "sure"},
        )
        self.assertIn(b"too short", response.data)  # text is still in the form
        self.assertIn(b"at least", response.data)   # and the error is shown
        self.assertEqual(dataset.load_postings(), [])

    def test_delete_route(self):
        posting_id = dataset.add_posting(SAMPLE, "legit", "sure", [])
        self.client.post(f"/delete/{posting_id}")
        self.assertEqual(dataset.load_postings(), [])

    def test_no_nested_forms_on_the_add_page(self):
        # A <form> inside another <form> is invalid HTML: the parser drops
        # the inner one, so its button would silently submit the outer form.
        # The undo button uses form="undo-form" to stay outside instead.
        dataset.add_posting(SAMPLE, "legit", "sure", [])
        page = self.client.get("/").data.decode()
        first = page.index("<form")
        second = page.index("<form", first + 1)
        self.assertLess(page.index("</form>"), second,
                        "a second <form> opens before the first one closes")

    def test_source_url_is_stored(self):
        self.client.post(
            "/add",
            data={"text": SAMPLE, "label": "legit", "confidence": "sure",
                  "source_url": "https://example.com/job/7"},
        )
        self.assertEqual(
            dataset.load_postings()[0]["source_url"], "https://example.com/job/7"
        )

    def test_posting_age_is_stored(self):
        self.client.post(
            "/add",
            data={"text": SAMPLE, "label": "ghost", "confidence": "sure",
                  "posting_age": "6m_plus"},
        )
        self.assertEqual(dataset.load_postings()[0]["posting_age"], "6m_plus")

    def test_posting_age_defaults_to_unknown_rather_than_a_guess(self):
        # Submitting the form without touching the age buttons must record
        # "I don't know", never a made-up bucket.
        self.client.post(
            "/add",
            data={"text": SAMPLE, "label": "ghost", "confidence": "sure"},
        )
        self.assertEqual(dataset.load_postings()[0]["posting_age"], "")

    def test_add_page_offers_every_posting_age(self):
        page = self.client.get("/").get_data(as_text=True)
        for key in dataset.POSTING_AGES:
            self.assertIn(f'name="posting_age" value="{key}"', page)

    def test_saving_reports_what_the_model_would_have_said(self):
        # The comparison is feedback only, and must appear AFTER saving so it
        # cannot anchor the label. Here we just check it is reported at all.
        response = self.client.post(
            "/add",
            data={"text": SAMPLE, "label": "legit", "confidence": "sure"},
            follow_redirects=True,
        )
        self.assertIn(b"Saved as legit", response.data)
        self.assertIn(b"Current model", response.data)

    def test_add_page_never_reveals_a_prediction_before_labelling(self):
        # Guards the core design decision: seeing the model's guess first
        # would bias the dataset toward the model's existing opinions.
        page = self.client.get("/").data
        self.assertNotIn(b"Current model", page)
        self.assertNotIn(b"ghost probability", page.lower())


if __name__ == "__main__":
    unittest.main()
