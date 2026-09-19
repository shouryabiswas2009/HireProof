"""
Tests for ghostjob/dataset.py.
Run from the repo root with:  .venv\\Scripts\\python.exe -m unittest discover -v
(unittest ships with Python, so there is nothing extra to install.)
"""

import tempfile
import unittest
from pathlib import Path

from ghostjob import dataset

# A stand-in posting that is long enough to pass the minimum-length check.
SAMPLE = "We are hiring a Software Engineer to build backend services. " * 3


class DatasetTests(unittest.TestCase):
    def setUp(self):
        # A fresh temporary folder for every test, so tests never touch your
        # real data/labeled_postings.csv.
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.path = Path(self._tmp.name) / "labeled.csv"

    def add(self, text=SAMPLE, label="legit", confidence="sure", evidence=(),
            source_url=""):
        return dataset.add_posting(
            text, label, confidence, list(evidence),
            source_url=source_url, path=self.path,
        )

    def test_missing_file_loads_as_empty_list(self):
        self.assertEqual(dataset.load_postings(self.path), [])

    def test_roundtrip_keeps_tricky_text_intact(self):
        # Commas, quotes, line breaks, and non-English characters are exactly
        # what breaks naive CSV handling, so we check they survive.
        tricky = 'Café role, "fast-paced" team.\nLine two — with a dash.\n' + SAMPLE
        self.add(text=tricky, evidence=["got_reply", "reposted"])
        loaded = dataset.load_postings(self.path)
        self.assertEqual(len(loaded), 1)
        self.assertEqual(loaded[0]["text"], tricky.strip())
        self.assertEqual(loaded[0]["evidence"], "got_reply;reposted")

    def test_windows_line_breaks_are_normalized(self):
        self.add(text=SAMPLE + "\r\nSecond line")
        self.assertNotIn("\r", dataset.load_postings(self.path)[0]["text"])

    def test_duplicate_is_rejected_even_with_different_spacing(self):
        self.add()
        with self.assertRaises(ValueError):
            self.add(text=SAMPLE.upper().replace(" ", "   "))
        self.assertEqual(len(dataset.load_postings(self.path)), 1)

    def test_too_short_is_rejected(self):
        with self.assertRaises(ValueError):
            self.add(text="too short")

    def test_bad_label_confidence_and_evidence_are_rejected(self):
        with self.assertRaises(ValueError):
            self.add(label="maybe")
        with self.assertRaises(ValueError):
            self.add(confidence="very")
        with self.assertRaises(ValueError):
            self.add(evidence=["made_up_reason"])

    def test_source_url_is_saved(self):
        self.add(source_url="https://example.com/jobs/123")
        loaded = dataset.load_postings(self.path)
        self.assertEqual(loaded[0]["source_url"], "https://example.com/jobs/123")

    def test_old_file_without_source_url_still_loads(self):
        # A dataset written before source_url existed must keep working
        # rather than raising KeyError once the column was added.
        legacy = "id,added_at,label,confidence,evidence,notes,text\n"
        legacy += "abc123,2026-01-01T00:00:00,ghost,sure,reposted,,Some posting text\n"
        self.path.write_text(legacy, encoding="utf-8")
        loaded = dataset.load_postings(self.path)
        self.assertEqual(len(loaded), 1)
        self.assertEqual(loaded[0]["source_url"], "")
        self.assertEqual(loaded[0]["label"], "ghost")
        # And summarize must not choke on the older row either.
        self.assertEqual(dataset.summarize(loaded)["ghost"], 1)

    def test_delete(self):
        posting_id = self.add()
        self.assertTrue(dataset.delete_posting(posting_id, path=self.path))
        self.assertEqual(dataset.load_postings(self.path), [])
        self.assertFalse(dataset.delete_posting(posting_id, path=self.path))

    def test_summarize(self):
        self.add(text=SAMPLE + "a", label="ghost", evidence=["text_only"])
        self.add(text=SAMPLE + "b", label="legit", confidence="unsure")
        self.add(text=SAMPLE + "c", label="legit")
        stats = dataset.summarize(dataset.load_postings(self.path))
        self.assertEqual(
            stats, {"total": 3, "ghost": 1, "legit": 2, "unsure": 1, "text_only": 1}
        )


if __name__ == "__main__":
    unittest.main()
