"""
Generates docs/og.png, the preview image shown when the link is shared.

Run it only when the wording or look changes:

    .venv\\Scripts\\python.exe -m pip install Pillow
    .venv\\Scripts\\python.exe tools/make_og_image.py

WHY A GENERATED PNG rather than an SVG or a screenshot:

  * SVG does not work. Most social scrapers refuse it outright, so an
    og:image pointing at one produces no preview at all.
  * A screenshot goes stale the moment the design changes, and nobody
    remembers to retake it.
  * Drawing it here keeps the colours in one place with the site, and
    regenerating is one command.

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

# The site's dark palette, so the card and the page match.
BG = (11, 12, 16)
INK = (242, 243, 247)
INK_SOFT = (165, 170, 185)
ACCENT = (129, 140, 248)
RAISE = (230, 103, 103)
LOWER = (57, 135, 229)


def load_font(size, bold=False):
    """A real system font, falling back to Pillow's bitmap default.

    The fallback is ugly but the script still produces a valid image on a
    machine without these fonts, rather than crashing at the last step.
    """
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


def radial_glow(size, colour, strength):
    """One soft colour blob, matching the page's background.

    Built by drawing concentric circles of increasing alpha rather than
    with a blur filter: a real Gaussian blur over a 1200x630 canvas is
    slow, and this only needs to look soft, not be mathematically right.
    """
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    steps = 60
    for i in range(steps, 0, -1):
        radius = size / 2 * (i / steps)
        alpha = int(strength * (1 - i / steps) ** 2)
        box = (size / 2 - radius, size / 2 - radius,
               size / 2 + radius, size / 2 + radius)
        draw.ellipse(box, fill=(*colour, alpha))
    return layer


def main():
    image = Image.new("RGB", (W, H), BG)

    # Two glows in the corners, echoing the page.
    image.paste(radial_glow(900, (99, 102, 241), 70),
                (-220, -300), radial_glow(900, (99, 102, 241), 70))
    image.paste(radial_glow(760, (190, 70, 90), 55),
                (760, -180), radial_glow(760, (190, 70, 90), 55))

    draw = ImageDraw.Draw(image)

    title = load_font(74, bold=True)
    subtitle = load_font(31)
    label = load_font(25, bold=True)
    small = load_font(23)

    x = 84

    # Wordmark
    draw.rounded_rectangle((x, 74, x + 46, 120), radius=13,
                           fill=(30, 31, 58), outline=(60, 64, 120), width=2)
    draw.ellipse((x + 13, 90, x + 21, 98), fill=ACCENT)
    draw.ellipse((x + 26, 90, x + 34, 98), fill=ACCENT)
    draw.text((x + 62, 82), "HireProof", font=label, fill=INK)

    # Headline, in two lines so the accent colour lands on the question.
    draw.text((x, 176), "Is this job posting", font=title, fill=INK)
    draw.text((x, 262), "actually real?", font=title, fill=ACCENT)

    draw.text((x, 372),
              "Paste a job posting and see how closely its wording matches",
              font=subtitle, fill=INK_SOFT)
    draw.text((x, 412),
              "postings labelled as ghost jobs.",
              font=subtitle, fill=INK_SOFT)

    # A miniature of the diverging chart: the thing that makes the project
    # recognisable at a glance.
    bar_y = 486
    centre = x + 232
    for width, colour, direction in [
        (150, RAISE, 1), (96, LOWER, -1), (124, RAISE, 1), (58, LOWER, -1),
    ]:
        left = centre if direction > 0 else centre - width
        draw.rounded_rectangle((left, bar_y, left + width, bar_y + 13),
                               radius=6, fill=colour)
        bar_y += 24
    draw.line((centre, 480, centre, bar_y - 6), fill=(70, 74, 90), width=2)

    draw.text((x + 430, 492),
              "Logistic regression, written from scratch.",
              font=small, fill=INK_SOFT)
    draw.text((x + 430, 526),
              "No libraries. No server. Runs in your browser.",
              font=small, fill=INK_SOFT)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    image.save(OUT, "PNG", optimize=True)
    print(f"Wrote {OUT.relative_to(ROOT)}  ({OUT.stat().st_size // 1024} KB, {W}x{H})")


if __name__ == "__main__":
    main()
