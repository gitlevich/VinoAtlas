"""Assemble Cellar Compass from its parts into one self-contained page.

app_head.html (style) + app_body.html (markup) + app.js (all logic, with the
catalogue substituted for __DATA__) -> cellar_compass.html, plus a standalone
wrapped copy for opening from disk. The asserts are the build's own guards:
one script block, no <line> elements (the artifact viewer strips them), and no
banned vocabulary in anything the reader can see.
"""
import pathlib

BANNED = ['dark fruit', 'heaviness', 'readiness', 'percentile', 'shipment', 'sigil', 'invariant']

def build(src=pathlib.Path(__file__).parent, out=None):
    out = out or src.parent
    head = (src / 'app_head.html').read_text()
    body = (src / 'app_body.html').read_text()
    js = (src / 'app.js').read_text()
    data = (src / 'app_data.json').read_text()

    for bad in BANNED:
        hits = [l.strip()[:80] for l in (head + body + js).splitlines() if bad in l.lower()]
        assert not hits, (bad, hits)

    page = head + body + js.replace('__DATA__', data)
    assert page.count('<script') == 1, 'exactly one script block'
    assert '<line' not in page, 'the artifact viewer strips <line> elements'

    (out / 'cellar_compass.html').write_text(page)
    (out / 'cellar_compass_standalone.html').write_text(
        '<!doctype html><html><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        '<title>Cellar Compass</title></head><body>' + page + '</body></html>')
    return len(page)

if __name__ == '__main__':
    print('built', build(), 'bytes')
