"""Assemble Cellar Compass from its parts into one self-contained page.

app_head.html (style) + app_body.html (markup) + app.js (all logic, with the
catalogue substituted for __DATA__) -> cellar_compass.html, plus a standalone
wrapped copy for opening from disk. The asserts are the build's own guards:
one script block, no <line> elements (the artifact viewer strips them), and no
banned vocabulary in anything the reader can see.
"""
import hashlib
import pathlib

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

    import re
    nocomment = re.sub(r'/\*.*?\*/', '', head + body + js, flags=re.S)
    code = '\n'.join(l for l in nocomment.splitlines() if not l.strip().startswith('//'))
    for bad in BANNED_COPY:
        assert bad not in code.lower(), bad
    # what the page actually renders: markup text nodes, with tags stripped
    rendered = re.sub(r'<[^>]*>', ' ', re.sub(r'/\*.*?\*/', '', body, flags=re.S))
    for bad in BANNED_RESEARCH:
        assert bad not in rendered.lower(), (bad, rendered.lower().split(bad)[0][-60:])

    page = head + body + js.replace('__DATA__', data)
    assert page.count('<script') == 1, 'exactly one script block'
    assert '<line' not in page, 'the artifact viewer strips <line> elements'
    # the stamp names the bytes themselves, so a browser can be asked which build
    # it is holding instead of guessed at. Hashed before substitution, so the same
    # parts always yield the same stamp.
    assert '__BUILD__' in page, 'the build stamp placeholder went missing'
    page = page.replace('__BUILD__', hashlib.sha256(page.encode()).hexdigest()[:8])

    (out / 'cellar_compass.html').write_text(page)
    (out / 'cellar_compass_standalone.html').write_text(
        '<!doctype html><html><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        '<title>Cellar Compass</title></head><body>' + page + '</body></html>')
    return len(page)

if __name__ == '__main__':
    print('built', build(), 'bytes')
