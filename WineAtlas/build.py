"""Assemble Cellar Compass from its parts into one self-contained page.

app_head.html (style) + app_body.html (markup) + app.js (all logic, with the
catalogue substituted for __DATA__ and the Atlas tab folded in at __ATLAS__)
-> cellar_compass.html, plus a standalone wrapped copy, which is both the file
you open from disk and the page that is served: it is written to
docs/wine/index.html, which is what GitHub Pages publishes. The asserts are the
build's own guards: one script block, no <line> elements, and no banned
vocabulary in anything the reader can see.

The Atlas carries its own arrangement, written by atlas.py; run that first if
the catalogue has changed.
"""
import hashlib
import pathlib
import sys
import urllib.parse

# the rasteriser is shared with the weed space and with the landing page
sys.path.append(str(pathlib.Path(__file__).resolve().parent.parent / 'scripts'))

# ---- the glass ------------------------------------------------------------
# The tab icon is the shop's own glass, at the shop's own proportions: these are
# the numbers atlas.js draws every wine with, and test_atlas.py holds them to it,
# so the icon cannot drift into being a drawing OF the mark rather than the mark.
# Fractions of R, the glass's own radius.
GLASS = dict(rw=0.50,          # half the bowl's width
             top=-0.84, bot=0.12,   # the rim and the base of the bowl
             waist=0.66, tuck=0.44,  # where the bowl's curve turns
             fill=0.42,        # where the wine is poured to
             stem=0.72, foot=0.74, footR=0.34, wire=0.085)
# A red at the middle of what pour() spans -- maturity and weight both at a half,
# which is 348+32m, 74-6m for the hue and saturation. Its lightness sits between
# the two the page uses, because a tab strip follows the reader's system and not
# the page's theme: the icon has to hold on both. An icon stands for the shop, so
# it is the middle of the range and not any wine in it.
WINE = 'hsl(4,71%,45%)'
# The bowl, the stem and the foot take the colour of the ground a glass stands
# on, which is a thing one wine has and the shop as a whole does not. So: a
# neutral that reads on a light strip and a dark one alike.
VESSEL = '#8e8e96'


GLASS_W = 2 * GLASS['rw']                                  # the bowl at its rim
GLASS_H = GLASS['foot'] + GLASS['wire'] - GLASS['top']     # rim down to the foot


WINE_RAMP = [(0, (4, 65, 58)), (.35, (4, 71, 45)), (1, (8, 75, 31))]
VESSEL_HSL = (240, 4, 57)          # the neutral above, as the rasteriser wants it


def glass_parts(R, cx, cy):
    """WHERE THE GLASS IS, and nothing about how to draw it: the bowl as the
    two cubics atlas.js writes, the line the wine is poured to, the streak of
    light down the left, the stem and the foot. Both renderers read this, so
    the icon in the tab and the icon in the page are one glass."""
    g = GLASS
    y = cy - (g['top'] + g['foot'] + g['wire']) / 2 * R
    rw, top, bot = g['rw'] * R, y + g['top'] * R, y + g['bot'] * R
    dep = bot - top
    return dict(
        bowl=[('M', (cx - rw, top)),
              ('C', (cx - rw, top + dep * g['waist']), (cx - rw * g['tuck'], bot), (cx, bot)),
              ('C', (cx + rw * g['tuck'], bot), (cx + rw, top + dep * g['waist']), (cx + rw, top))],
        rim=(cx - rw, top, rw * 2, dep),                 # the bowl's bounding box
        line=top + dep * g['fill'],                      # where the wine stands
        gleam=(cx - rw * 0.86, top + dep * 0.14, max(1.1, R * 0.07), dep * 0.60),
        stem=((cx, bot), (cx, y + g['stem'] * R), max(1.2, R * g['wire'])),
        foot=((cx - g['footR'] * R, y + g['foot'] * R),
              (cx + g['footR'] * R, y + g['foot'] * R), max(1.2, R * g['wire'] * 1.6)),
        edge=max(1.1, R * 0.05), bot=bot, top=top)


def glass_svg(R, cx, cy, ink='g'):
    """A glass: wine poured to the line, the bowl drawn around it, stem and foot
    under it. The one highlight down the left of the bowl is what makes it read
    as glass rather than as a filled shape, and the wine is a gradient rather
    than a flat fill for the page's own reason -- wine in a bowl is lighter
    where the surface meets the air and deepest at the base. Liquid, not paint.
    """
    m = glass_parts(R, cx, cy)
    x, top, w, dep = m['rim']
    line, bot = m['line'], m['bot']
    def seg(s):
        if s[0] == 'M':
            return f'M{s[1][0]:.2f} {s[1][1]:.2f}'
        c1, c2, end = s[1], s[2], s[3]
        return (f'C{c1[0]:.2f} {c1[1]:.2f} {c2[0]:.2f} {c2[1]:.2f}'
                f' {end[0]:.2f} {end[1]:.2f}')

    bowl = ''.join(seg(s) for s in m['bowl'])
    stops = ''.join(f'<stop offset="{o}" stop-color="hsl({h},{s}%,{l}%)"/>'
                    for o, (h, s, l) in WINE_RAMP)
    (sx, sy), (ex, ey), sw = m['stem']
    (fx, fy), (gx, gy), fw = m['foot']
    return (
      f'<linearGradient id="{ink}w" gradientUnits="userSpaceOnUse"'
      f' x1="0" y1="{line:.2f}" x2="0" y2="{bot:.2f}">{stops}</linearGradient>'
      f'<clipPath id="{ink}b"><path d="{bowl}Z"/></clipPath>'
      f'<g clip-path="url(#{ink}b)">'
      f'<rect x="{x:.2f}" y="{top:.2f}" width="{w:.2f}" height="{line - top:.2f}"'
      f' fill="{VESSEL}" fill-opacity=".16"/>'
      f'<rect x="{x:.2f}" y="{line:.2f}" width="{w:.2f}" height="{bot - line:.2f}"'
      f' fill="url(#{ink}w)"/>'
      f'<rect x="{m["gleam"][0]:.2f}" y="{m["gleam"][1]:.2f}"'
      f' width="{m["gleam"][2]:.2f}" height="{m["gleam"][3]:.2f}"'
      f' fill="#fff" fill-opacity=".34"/></g>'
      f'<path d="{bowl}" fill="none" stroke="{VESSEL}"'
      f' stroke-width="{m["edge"]:.2f}" stroke-linecap="round"/>'
      f'<path d="M{sx:.2f} {sy:.2f}L{ex:.2f} {ey:.2f}"'
      f' stroke="{VESSEL}" stroke-width="{sw:.2f}"/>'
      f'<path d="M{fx:.2f} {fy:.2f}L{gx:.2f} {gy:.2f}"'
      f' stroke="{VESSEL}" stroke-width="{fw:.2f}" stroke-linecap="round"/>')


def glass_raster(canvas, R, cx, cy):
    """The same glass, in pixels, laid in the order the page lays it: what is
    in the bowl first and clipped to it, then the bowl around that, then what
    holds it up."""
    import raster

    m = glass_parts(R, cx, cy)
    x, top, w, dep = m['rim']
    line, bot = m['line'], m['bot']
    outline = raster.flatten(m['bowl'])
    inside = canvas.cover([outline])                     # the bowl, as a clip
    vessel = raster.hsl(*VESSEL_HSL)

    def slab(x0, y0, w0, h0):
        return [[(x0, y0), (x0 + w0, y0), (x0 + w0, y0 + h0), (x0, y0 + h0)]]

    canvas.fill(slab(x, top, w, line - top), raster.Flat(vessel, .16), clip=inside)
    canvas.fill(slab(x, line, w, bot - line),
                raster.Linear(line, bot, [(o, raster.hsl(*c)) for o, c in WINE_RAMP]),
                clip=inside)
    canvas.fill(slab(*m['gleam']), raster.Flat((1, 1, 1), .34), clip=inside)
    canvas.stroke(outline, m['edge'], raster.Flat(vessel))
    for (a, b, width) in (m['stem'], m['foot']):
        canvas.stroke([a, b], width, raster.Flat(vessel))


def favicon(box=32, pad=0.5):
    """The shop's glass, fitted to a tab."""
    R = (box - 2 * pad) / max(GLASS_W, GLASS_H)
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{box}" height="{box}"'
           f' viewBox="0 0 {box} {box}">'
           + glass_svg(R, box / 2, box / 2) + '</svg>')
    return 'data:image/svg+xml,' + urllib.parse.quote(svg)


def favicon_bytes(box=32, pad=0.5):
    """The same glass in pixels, for Safari, which takes neither an SVG icon nor
    a declared one that a host favicon.ico can outrank."""
    import raster

    canvas = raster.Canvas(box)
    glass_raster(canvas, (box - 2 * pad) / max(GLASS_W, GLASS_H), box / 2, box / 2)
    return canvas.png()

# words that must never reach the reader. The first group is banned anywhere in
# the copy; the second are our research words, banned in what the page renders
# but allowed as code identifiers.
BANNED_COPY = ['dark fruit', 'heaviness', 'readiness', 'shipment']
BANNED_RESEARCH = ['sigil', 'invariant', 'percentile']

def build(src=pathlib.Path(__file__).parent, out=None):
    out = out or src.parent
    head = (src / 'app_head.html').read_text()
    body = (src / 'app_body.html').read_text()
    js = (src / 'app.js').read_text()
    data = (src / 'app_data.json').read_text()
    # the Atlas is written apart and folded in here, so it is checked by the same
    # guards as everything else rather than smuggled past them
    assert '__ATLAS__' in js, 'the atlas placeholder went missing'
    js = js.replace('__ATLAS__', (src / 'atlas.js').read_text())
    atlas_data = (src / 'atlas_data.json').read_text()

    import re
    nocomment = re.sub(r'/\*.*?\*/', '', head + body + js, flags=re.S)
    code = '\n'.join(l for l in nocomment.splitlines() if not l.strip().startswith('//'))
    for bad in BANNED_COPY:
        assert bad not in code.lower(), bad
    # what the page actually renders: markup text nodes, with tags stripped
    rendered = re.sub(r'<[^>]*>', ' ', re.sub(r'/\*.*?\*/', '', body, flags=re.S))
    for bad in BANNED_RESEARCH:
        assert bad not in rendered.lower(), (bad, rendered.lower().split(bad)[0][-60:])

    page = head + body + js.replace('__ATLASDATA__', atlas_data).replace('__DATA__', data)
    assert page.count('<script') == 1, 'exactly one script block'
    assert '<line' not in page, 'the artifact viewer strips <line> elements'
    # the stamp names the bytes themselves, so a browser can be asked which build
    # it is holding instead of guessed at. Hashed before substitution, so the same
    # parts always yield the same stamp.
    assert '__BUILD__' in page, 'the build stamp placeholder went missing'
    page = page.replace('__BUILD__', hashlib.sha256(page.encode()).hexdigest()[:8])

    (out / 'cellar_compass.html').write_text(page)
    # the copy that stands on its own: opened from disk, and served from the web.
    # It carries one reader's buying, so it is kept out of search engines.
    standalone = ('<!doctype html><html><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        '<meta name="robots" content="noindex,nofollow,noarchive">'
        '<link rel="icon" href="icon.png" sizes="32x32">'
        '<link rel="icon" type="image/svg+xml" href="' + favicon() + '">'
        '<title>Cellar Compass</title></head><body>' + page + '</body></html>')
    (out / 'cellar_compass_standalone.html').write_text(standalone)
    published = out / 'docs' / 'wine' / 'index.html'   # what agent.farm/VinoAtlas/wine serves
    published.parent.mkdir(parents=True, exist_ok=True)
    published.write_text(standalone)
    # THE ONE THING THAT CANNOT TRAVEL INSIDE THE PAGE. Safari will not use an
    # icon a page declares while the HOST has a favicon.ico of its own, and
    # agent.farm serves an orange star for everything under it. A declared icon
    # has to be a real file at a real address to outrank that. The SVG still
    # travels inline for every browser that takes one; this is the sibling
    # Safari needs, and it stands beside the page it belongs to.
    (published.parent / 'icon.png').write_bytes(favicon_bytes())
    return len(page)

if __name__ == '__main__':
    print('built', build(), 'bytes')
