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
        self.assertIn(b"Saved.", response.data)
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


if __name__ == "__main__":
    unittest.main()
