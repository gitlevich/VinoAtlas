"""The tab icon for the landing page: the two marks, side by side.

The landing page is not a tool. It is the place the two tools are reached from,
so its icon is not a third mark invented for it -- it is a glass and a leaf,
each drawn by the module that draws it for real. Nothing here knows what a leaf
or a glass looks like; it only decides where the two stand.

They interlock rather than sit in a row. A glass is tall and narrow with its
mass at the top; a crown is wide and short with its mass at the bottom. Set the
glass a little low and the leaf a little high and each fills the corner the
other leaves empty, which buys both of them size in a box that is only sixteen
pixels across when it matters.

    .venv/bin/python scripts/landing_icon.py

Writes the icon into docs/index.html in place. Idempotent: run it twice and the
second run changes nothing.
"""
import pathlib
import re
import sys
import urllib.parse

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path[:0] = [str(ROOT / 'WeedSpace'), str(ROOT / 'WineAtlas')]

import build as wine                      # noqa: E402  the glass
import build_horizon as weed              # noqa: E402  the leaf

BOX = 32
PAD = 0.5
GAP = 0.6                                 # they stand beside each other, not on
LEAN = 0.11                               # how far each leaves the other's corner


def place(box=BOX, pad=PAD):
    """Where each mark stands, and how big: (R, cx, cy) for the glass and for
    the leaf.

    The width is split so the two come out the same HEIGHT, which is what makes
    them read as a pair rather than as a big thing beside a small one. Then each
    leans out of the other's way -- the glass down, whose mass is its bowl at
    the top; the leaf up, whose mass is its fan at the bottom."""
    room = box - 2 * pad - GAP
    ag, al = wine.GLASS_H / wine.GLASS_W, weed.LEAF_H / weed.LEAF_W
    wl = room / (1 + al / ag)             # the leaf is the wider of the two
    wg = room - wl
    if wg * ag > box - 2 * pad:           # neither may be taller than the box
        shrink = (box - 2 * pad) / (wg * ag)
        wg, wl = wg * shrink, wl * shrink
    lean = LEAN * (box - 2 * pad)
    return ((wg / wine.GLASS_W, pad + wg / 2, box / 2 + lean),
            (wl / weed.LEAF_W, box - pad - wl / 2, box / 2 - lean))


def icon(box=BOX, pad=PAD):
    """One picture: a glass on the left, a crown on the right."""
    glass, leaf = place(box, pad)
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{box}" height="{box}"'
           f' viewBox="0 0 {box} {box}">'
           + wine.glass_svg(*glass) + weed.leaf_svg(*leaf) + '</svg>')
    return 'data:image/svg+xml,' + urllib.parse.quote(svg)


def icon_png(box=BOX, pad=PAD):
    """The same picture in pixels, for Safari. Same placement, same two marks,
    the other renderer."""
    import raster

    glass, leaf = place(box, pad)
    canvas = raster.Canvas(box)
    wine.glass_raster(canvas, *glass)
    weed.leaf_raster(canvas, *leaf)
    return canvas.uri()


LINK = re.compile(r'<link rel="icon"[^>]*>\n?')
# The PNG stands first and the SVG second, which is the order that gets both:
# Safari takes the PNG because it does not know what to do with an SVG icon,
# and every other browser prefers the SVG and stays sharp at any size.
AFTER = '<meta name="robots" content="noindex,nofollow,noarchive">\n'


def write(page=None):
    page = page or ROOT / 'docs' / 'index.html'
    html = LINK.sub('', page.read_text())
    tag = (f'<link rel="icon" href="{icon_png()}" sizes="32x32">\n'
           f'<link rel="icon" type="image/svg+xml" href="{icon()}">\n')
    assert AFTER in html, 'the landing page has changed shape; nothing to hang it on'
    page.write_text(html.replace(AFTER, AFTER + tag, 1))
    return page, len(tag)


if __name__ == '__main__':
    where, n = write()
    print('wrote', n, 'bytes of icon into', where)
