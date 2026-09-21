"""
Sanity checks on the published files themselves.

These exist because of a real failure. A scripted edit meant to prepend a
comment before one CSS rule matched TWO places (Python's str.replace hits
every occurrence, not just the first), spliced a comment into the middle of
a selector, and left a stray closing brace. The browser's CSS parser is
deliberately forgiving, so nothing errored anywhere: the page simply lost
a chunk of its styling, silently, and stayed that way through a deploy.

Nothing in the browser tools flags a malformed stylesheet either, so these
checks are the only place it gets caught.
"""

import re
import unittest
from pathlib import Path

DOCS = Path(__file__).resolve().parent.parent / "docs"


def strip_comments(css):
    return re.sub(r"/\*.*?\*/", "", css, flags=re.S)


class StylesheetTests(unittest.TestCase):
    def setUp(self):
        self.raw = (DOCS / "style.css").read_text(encoding="utf-8")
        self.css = strip_comments(self.raw)

    def test_braces_are_balanced(self):
        depth = 0
        for index, ch in enumerate(self.css):
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth < 0:
                    line = self.css[:index].count("\n") + 1
                    self.fail(f"unmatched closing brace near line {line}")
        self.assertEqual(depth, 0, f"{depth} unclosed block(s) at end of file")

    def test_no_comment_spliced_into_a_selector(self):
        # The exact shape of the bug: a rule's selector interrupted by a
        # comment and then continuing on the next line into another rule.
        for match in re.finditer(r"/\*.*?\*/", self.raw, flags=re.S):
            before = self.raw[: match.start()].rsplit("\n", 1)[-1].strip()
            # A comment at the end of a line is fine after a declaration
            # (ends in ; or }) or on its own; not after a bare selector.
            if before and not before.endswith((";", "{", "}", ",")):
                self.fail(
                    f"comment appears mid-selector, after: {before!r}"
                )

    def test_every_custom_property_used_is_defined_or_supplied(self):
        """A var() must resolve to something at runtime.

        Three ways that can be true: the token is defined in the
        stylesheet, the var() call carries a fallback, or JavaScript sets
        it with setProperty. The last case is the interesting one, since
        it is a contract between two files that nothing else checks: the
        score gauge's colour and the chart's stagger index are both set
        from app.js and exist nowhere in the CSS.
        """
        defined = set(re.findall(r"(--[\w-]+)\s*:", self.css))
        # A var() with a comma has a fallback, so it cannot resolve to nothing.
        with_fallback = set(re.findall(r"var\((--[\w-]+)\s*,", self.css))
        used = set(re.findall(r"var\((--[\w-]+)", self.css))

        js = "\n".join(
            path.read_text(encoding="utf-8") for path in DOCS.glob("*.js")
        )
        set_from_js = set(re.findall(r"""setProperty\(\s*["'](--[\w-]+)""", js))

        missing = used - defined - with_fallback - set_from_js
        self.assertFalse(
            missing,
            f"var() refers to tokens that are never defined, given a "
            f"fallback, or set from JS: {sorted(missing)}",
        )

    def test_stylesheet_is_not_suspiciously_short(self):
        # A truncating write would leave a valid but tiny file.
        rules = self.css.count("{")
        self.assertGreater(rules, 150, f"only {rules} rules; file may be truncated")


class SourceCharacterTests(unittest.TestCase):
    """No stray non-Latin characters in shipped source.

    A scripted edit once dropped two Chinese characters into the middle of
    an English code comment. Nothing broke and nothing warned: it sat in a
    comment, so neither the parser nor any test noticed. A reviewer would
    have, which is exactly the kind of thing worth automating instead.

    The allowlist is the typography actually used on purpose - curly
    quotes, dashes, the real minus sign, the ellipsis.
    """

    ALLOWED = set("‐‑‒–—‘’“”"
                  "…•· ½−×÷"
                  "éèêüöäçñ")

    def test_no_unexpected_characters(self):
        offenders = []
        files = list(DOCS.glob("*.js")) + [DOCS / "index.html", DOCS / "style.css"]
        for path in files:
            text = path.read_text(encoding="utf-8")
            for number, line in enumerate(text.splitlines(), 1):
                for ch in line:
                    if ord(ch) < 128 or ch in self.ALLOWED:
                        continue
                    offenders.append(
                        f"{path.name}:{number}: U+{ord(ch):04X} ({ch!r})"
                    )
        self.assertFalse(
            offenders,
            "unexpected characters in shipped source: " + "; ".join(offenders[:20]),
        )


class MarkupTests(unittest.TestCase):
    def setUp(self):
        self.html = (DOCS / "index.html").read_text(encoding="utf-8")

    def test_every_referenced_local_file_exists(self):
        for ref in re.findall(r'(?:src|href)="([^":#]+?)(?:\?v=\d+)?"', self.html):
            if ref.startswith(("http", "data:", "mailto:")):
                continue
            with self.subTest(file=ref):
                self.assertTrue((DOCS / ref).exists(), f"{ref} is referenced but missing")

    def test_each_tab_has_a_matching_panel(self):
        tabs = re.findall(r'id="tab-([\w-]+)"', self.html)
        panels = re.findall(r'id="panel-([\w-]+)"', self.html)
        self.assertTrue(tabs, "no tabs found")
        self.assertEqual(sorted(tabs), sorted(panels))

    def test_tab_controls_point_at_real_panels(self):
        for controls in re.findall(r'aria-controls="([\w-]+)"', self.html):
            with self.subTest(panel=controls):
                self.assertIn(f'id="{controls}"', self.html)

    def test_exactly_one_tab_starts_selected(self):
        self.assertEqual(self.html.count('aria-selected="true"'), 1)


if __name__ == "__main__":
    unittest.main()
