"""
Guards the cache-busting version numbers.

The site has no build step, so the ?v= number that busts browser caches is
maintained by hand (via bump_version.py). It appears in five files, and a
half-finished bump is genuinely dangerous: the browser would fetch a new
app.js but reuse a cached scorer.js, and the mismatch shows up as
undefined values on the page rather than as an error anyone would notice.

That exact bug happened once. This test makes it impossible to ship again.
"""

import unittest

import bump_version


class VersionConsistencyTests(unittest.TestCase):
    def test_every_asset_url_uses_the_same_version(self):
        versions = bump_version.current_versions()
        everything = [n for nums in versions.values() for n in nums]
        self.assertTrue(everything, "no ?v= numbers found at all")
        self.assertEqual(
            len(set(everything)), 1,
            f"asset versions disagree, so a stale module could load: {versions}",
        )

    def test_every_target_file_actually_has_a_version(self):
        # A file that quietly loses its ?v= would silently stop busting.
        for rel, nums in bump_version.current_versions().items():
            with self.subTest(file=rel):
                self.assertTrue(nums, f"{rel} has no ?v= number")

    def test_module_imports_are_versioned_not_just_the_entry_point(self):
        # The original bug: index.html was versioned but the ES module
        # imports inside app.js were not, so only the entry point refreshed.
        versions = bump_version.current_versions()
        self.assertTrue(versions["docs/app.js"], "app.js imports are unversioned")
        self.assertTrue(versions["docs/scorer.js"], "scorer.js import is unversioned")


if __name__ == "__main__":
    unittest.main()
