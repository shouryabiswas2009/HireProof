r"""
Generates docs/og.png, the preview image shown when the link is shared.

Run it only when the wording or look changes:

    .venv\Scripts\python.exe -m pip install Pillow
    .venv\Scripts\python.exe tools/make_og_image.py

WHY A GENERATED PNG rather than an SVG or a screenshot:

  * SVG does not work. Most social scrapers refuse it outright, so an
    og:image pointing at one produces no preview at all.
  * A screenshot goes stale the moment the design changes, and nobody
    remembers to retake it.
  * Drawing it here keeps the colours in one place with the site, and
    regenerating is one command.

This file went stale anyway, which is worth recording rather than quietly
fixing: it kept the old indigo-on-near-black look for weeks after the site
moved to warm charcoal, and because nothing on the page links to it, the
only place the mismatch showed was in other people's chat windows.

Pillow is a DEVELOPMENT dependency only. It is not in requirements.txt
and the site never loads it: the output is a committed PNG file.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "og.png"

# Facebook, LinkedIn and X all expect 1200x630. Anything else gets
# cropped unpredictably depending on the platform.
W, H = 1200, 630

# The site's dark palette, taken from the tokens in docs/style.css so the
# card and the page agree. Warm charcoal and warm cream, never pure black
# or pure white.
BG = (0x15, 0x13, 0x0F)         # --paper
PANEL = (0x1C, 0x19, 0x15)      # --surface
INK = (0xEC, 0xE4, 0xD6)        # --ink
INK_SOFT = (0xB3, 0xAA, 0x9A)   # --ink-soft
RULE = (0x30, 0x2B, 0x23)       # --rule
ACCENT = (0x9D, 0xB4, 0xCE)     # --accent
GHOST = (0xE0, 0x8A, 0x7C)      # --toward-ghost
REAL = (0x7F, 0xAE, 0xDC)       # --toward-real


def load_font(size, serif=False, bold=False):
    """A real system font, falling back to Pillow's bitmap default.

    The site's headline face is Fraunces, but it ships as woff2 and
    Pillow cannot read that container. Georgia is the closest thing
    present on a stock Windows machine - a warm, bookish serif - so the
    card reads in the same voice without adding a second copy of the font
    to the repo in a different format.

    The fallback keeps the script producing a valid image on a machine
    without these fonts, rather than crashing at the last step.
    """
    if serif:
        candidates = ["georgiab.ttf", "georgia.ttf"] if bold else ["georgia.ttf"]
    else:
        candidates = (
            ["segoeuib.ttf", "seguisb.ttf", "arialbd.ttf"]
            if bold
            else ["segoeui.ttf", "arial.ttf"]
        )
    for name in candidates:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def main():
    image = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(image)

    # NO GLOWS. The previous version pasted two radial blobs into the
    # corners to match a design that no longer exists. Flat warm charcoal
    # is the design now, and a flat background also survives the heavy
    # recompression most platforms apply to preview images.

    headline = load_font(66, serif=True, bold=True)
    wordmark = load_font(27, bold=True)
    subtitle = load_font(29)
    small = load_font(22)

    x = 84

    # Wordmark, matching the page: "Hire" steps back, "Proof" carries the
    # accent. Two channels, weight and hue, so it reads in greyscale too.
    draw.text((x, 76), "Hire", font=wordmark, fill=INK_SOFT)
    hire_w = draw.textlength("Hire", font=wordmark)
    draw.text((x + hire_w, 76), "Proof", font=wordmark, fill=ACCENT)

    # The headline, one colour across both lines. The old card put the
    # second line in the accent, which is the split-colour headline the
    # redesign deliberately dropped.
    draw.text((x, 168), "Is this job posting", font=headline, fill=INK)
    draw.text((x, 246), "worth your time?", font=headline, fill=INK)

    draw.text((x, 356),
              "Paste a posting and see how closely its wording",
              font=subtitle, fill=INK_SOFT)
    draw.text((x, 396),
              "matches postings labelled as ghost jobs.",
              font=subtitle, fill=INK_SOFT)

    # A miniature of the diverging breakdown: the thing that makes the
    # project recognisable at a glance, and the one place colour is used
    # to mean something rather than to decorate.
    bar_y = 482
    centre = x + 232
    for width, colour, direction in [
        (150, GHOST, 1), (96, REAL, -1), (124, GHOST, 1), (58, REAL, -1),
    ]:
        left = centre if direction > 0 else centre - width
        draw.rounded_rectangle((left, bar_y, left + width, bar_y + 13),
                               radius=6, fill=colour)
        bar_y += 24
    draw.line((centre, 476, centre, bar_y - 6), fill=RULE, width=2)

    draw.text((x + 430, 488),
              "Logistic regression, written from scratch.",
              font=small, fill=INK_SOFT)
    draw.text((x + 430, 522),
              "No libraries. No server. Runs in your browser.",
              font=small, fill=INK_SOFT)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    image.save(OUT, "PNG", optimize=True)
    print(f"Wrote {OUT.relative_to(ROOT)}  ({OUT.stat().st_size // 1024} KB, {W}x{H})")


if __name__ == "__main__":
    main()
