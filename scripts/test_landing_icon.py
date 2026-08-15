"""The landing page's icon is the two tools' own marks, and nothing else.

    .venv/bin/python -m pytest scripts/test_landing_icon.py -q
"""
import pathlib
import re
import urllib.parse

import landing_icon

ROOT = pathlib.Path(__file__).resolve().parent.parent
PAGE = ROOT / 'docs' / 'index.html'


def svg():
    return urllib.parse.unquote(landing_icon.icon().split(',', 1)[1])


def test_it_is_both_marks_and_neither_is_invented_here():
    """Every shape in it comes out of the module that draws that shape for real,
    verbatim -- so it is the glass and the leaf, not a likeness of them. If this
    file knew what a leaf looked like there would be a third leaf in the repo,
    drifting from the two that are drawn."""
    import build as wine
    import build_horizon as weed

    got = svg()
    glass, leaf = landing_icon.place()
    assert wine.glass_svg(*glass) in got, 'the glass in it is not the shop\'s glass'
    assert weed.leaf_svg(*leaf) in got, 'the leaf in it is not the field\'s leaf'
    src = (ROOT / 'scripts' / 'landing_icon.py').read_text()
    for shape in ('bezierCurve', 'sin(', 'tooth', 'ANG', 'LEN', 'stop-color'):
        assert shape not in src, f'the landing icon draws its own {shape}'


def test_the_two_marks_come_out_the_same_height():
    """Which is what makes them read as a pair rather than as a big thing beside
    a small one. Measured from the placement the icon actually used."""
    import build as wine
    import build_horizon as weed

    (Rg, xg, _), (Rl, xl, _) = landing_icon.place()
    hg, hl = Rg * wine.GLASS_H, Rl * weed.LEAF_H
    assert abs(hg - hl) < 0.01, (hg, hl)
    assert hg <= landing_icon.BOX - 2 * landing_icon.PAD + 1e-9, 'it overflows the box'
    assert 'width="32" height="32"' in svg()


def test_neither_mark_stands_on_the_other():
    """Side by side, with a gap between them and inside the box. Their ids must
    not collide either -- one document, three gradients, and a clash would paint
    one mark with another's colours."""
    import build as wine
    import build_horizon as weed

    (Rg, xg, _), (Rl, xl, _) = landing_icon.place()
    right = xg + Rg * wine.GLASS_W / 2          # the glass's right edge
    left = xl - Rl * weed.LEAF_W / 2            # the leaf's left edge
    assert left - right >= landing_icon.GAP - 1e-9, (right, left)
    assert xg - Rg * wine.GLASS_W / 2 >= landing_icon.PAD - 1e-9
    assert xl + Rl * weed.LEAF_W / 2 <= landing_icon.BOX - landing_icon.PAD + 1e-9
    ids = re.findall(r'id="([^"]+)"', svg())
    assert len(ids) == len(set(ids)), ids


def test_both_marks_are_in_the_pixels_too_and_on_their_own_sides():
    """Safari's copy has to be the same picture, not a simpler one: red ink in
    the left half where the glass stands, green in the right half where the
    crown does, and neither straying into the other's side."""
    import raster

    box = landing_icon.BOX
    canvas = raster.Canvas(box)
    (Rg, xg, yg), (Rl, xl, yl) = landing_icon.place()
    import build as wine
    import build_horizon as weed
    wine.glass_raster(canvas, Rg, xg, yg)
    weed.leaf_raster(canvas, Rl, xl, yl)
    px = canvas.pixels().astype(int)

    def ink(half):
        rows, cols = px.shape[0], px.shape[1]
        band = px[:, :cols // 2] if half == 'left' else px[:, cols // 2:]
        on = band[..., 3] > 128
        return band[..., 0][on], band[..., 1][on]

    lr, lg = ink('left')
    rr, rg = ink('right')
    assert len(lr) and len(rr), 'one side of the icon is empty'
    assert (lr > lg).mean() > 0.4, 'no wine on the glass side'
    assert (rg > rr).mean() > 0.9, 'the crown side is not green'


def test_the_page_carries_exactly_the_icon_this_writes():
    """And exactly one pair of them: run the writer twice and the second run is
    a no-op, so a rebuild cannot stack links."""
    html = PAGE.read_text()
    links = re.findall(r'<link rel="icon"[^>]*>', html)
    assert len(links) == 2, f'{len(links)} icon links on the landing page'
    assert links[0] == f'<link rel="icon" href="{landing_icon.icon_png()}" sizes="32x32">'
    assert links[1] == f'<link rel="icon" type="image/svg+xml" href="{landing_icon.icon()}">'
    assert html.index('image/png;base64') < html.index('image/svg+xml'), \
        'the SVG is offered first, which is the order Safari loses on'
    landing_icon.write()
    assert PAGE.read_text() == html, 'writing it again changed the page'


def test_it_travels_in_the_page_and_fetches_nothing():
    got = svg()
    assert landing_icon.icon().startswith('data:image/svg+xml,')
    assert landing_icon.icon_png().startswith('data:image/png;base64,')
    assert 'http' not in got.replace('http://www.w3.org/2000/svg', ''), 'it reaches out'
    assert got.count('<svg') == 1 and got.endswith('</svg>')
