"""Draw public/favicon.ico from the geometry of public/favicon.svg.

Run from the repo root, after a change to the mark:

    PYTHONUTF8=1 python scripts/favicon.py

Needs Pillow. The .ico holds 16, 32 and 48 px images for browsers and
tools that do not read the SVG.
"""

from pathlib import Path

from PIL import Image, ImageDraw

INK = (0x1D, 0x1A, 0x16, 255)
PAPER = (0xF5, 0xF1, 0xE8, 255)
BAND = (0xE8, 0x74, 0x2C, 255)

# x, y, width, height on a 32-unit grid, as in favicon.svg.
ROWS = [(7, 8, 18, 4, PAPER), (7, 14, 18, 4, BAND), (7, 20, 11, 4, PAPER)]
SCALE = 16  # drawn at 512 px, then reduced, so the corners are smooth


def draw() -> Image.Image:
    size = 32 * SCALE
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    pen = ImageDraw.Draw(image)
    pen.rounded_rectangle((0, 0, size - 1, size - 1), radius=6 * SCALE, fill=INK)
    for x, y, width, height, colour in ROWS:
        pen.rectangle(
            (x * SCALE, y * SCALE, (x + width) * SCALE - 1, (y + height) * SCALE - 1),
            fill=colour,
        )
    return image


if __name__ == "__main__":
    target = Path("public/favicon.ico")
    draw().save(target, format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])
    print(f"wrote {target} ({target.stat().st_size} bytes)")
