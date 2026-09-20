r"""
Sets the cache-busting ?v= number across every file that references one.

WHY THIS SCRIPT EXISTS: GitHub Pages lets browsers hold assets for about
ten minutes, so after a deploy a returning visitor can run a fresh
index.html against a stale script. Adding ?v=N to a URL makes it a NEW
url, which forces a fresh fetch and keeps the files in step.

The catch is that ES module imports need it too. index.html loads
app.js?v=9, but if app.js then imports "./scorer.js" with no version, the
browser happily reuses its cached copy — and you get new calling code
against an old module, which fails as undefined values rather than an
error. That bug is what prompted this script.

So the number has to appear in five places at once, and setting them by
hand is exactly the sort of thing that gets half-done. Run:

    .venv\Scripts\python.exe bump_version.py 10

tests/test_versions.py fails the build if they ever disagree.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent

# Each entry: the file, and the patterns whose ?v= number must be updated.
TARGETS = {
    "docs/index.html": [r'(style\.css\?v=)(\d+)', r'(app\.js\?v=)(\d+)'],
    "docs/app.js": [
        r'(\./features\.js\?v=)(\d+)',
        r'(\./scorer\.js\?v=)(\d+)',
        r'(\./highlight\.js\?v=)(\d+)',
        r'(\./tabs\.js\?v=)(\d+)',
    ],
    "docs/scorer.js": [r'(\./features\.js\?v=)(\d+)'],
    "tests/js/test_features.mjs": [r'(features\.js\?v=)(\d+)'],
    "tests/js/predict.mjs": [r'(features\.js\?v=)(\d+)', r'(scorer\.js\?v=)(\d+)'],
    "tests/js/test_highlight.mjs": [r'(features\.js\?v=)(\d+)'],
}


def current_versions():
    """Every ?v= number found, per file. Used by the test and by --check."""
    found = {}
    for rel, patterns in TARGETS.items():
        text = (ROOT / rel).read_text(encoding="utf-8")
        nums = []
        for pattern in patterns:
            nums += [int(m.group(2)) for m in re.finditer(pattern, text)]
        found[rel] = nums
    return found


def main():
    if len(sys.argv) != 2 or not sys.argv[1].isdigit():
        versions = current_versions()
        for rel, nums in versions.items():
            print(f"{rel}: {nums}")
        print("\nUsage: python bump_version.py <number>")
        return

    new = sys.argv[1]
    for rel, patterns in TARGETS.items():
        path = ROOT / rel
        text = path.read_text(encoding="utf-8")
        for pattern in patterns:
            text = re.sub(pattern, lambda m: m.group(1) + new, text)
        path.write_text(text, encoding="utf-8")
        print(f"  {rel} -> v={new}")
    print(f"\nAll asset URLs set to v={new}.")


if __name__ == "__main__":
    main()
