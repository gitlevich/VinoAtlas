"""Every claim the Atlas makes about the shop, checked against the shop.

The arrangement is worked out once by atlas.py and then shipped as numbers, so
nothing here trusts that file: the catalogue is read again and the whole space is
rebuilt from it by a second route. Where a claim is a matter of arithmetic the
two must agree to the last digit the page carries; where it is a matter of choice
-- which way is up, which words are let in -- the choice is stated as a property
and the property is what is tested.

    .venv/bin/python -m pytest WineAtlas/test_atlas.py -q
"""
import collections
import json
import math
import pathlib
import re
import urllib.parse

import numpy as np
import pytest

HERE = pathlib.Path(__file__).parent
NEAR, FAR = 2.6, 11.0
NECK = 2.2                       # the page's, and the field must start beyond it


@pytest.fixture(scope='session')
def src():
    return json.loads((HERE / 'app_data.json').read_text())


@pytest.fixture(scope='session')
def out():
    return json.loads((HERE / 'atlas_data.json').read_text())


@pytest.fixture(scope='session')
def rebuilt(src):
    """The whole space again, from the catalogue, by a second route."""
    axes, wines = src['axes'], src['wines']
    X = np.array([[w[a] for a in axes] for w in wines], float)
    Xc = X - X.mean(0)
    _, s, Vt = np.linalg.svd(Xc, full_matrices=False)
    var = s ** 2 / (s ** 2).sum()
    scores = Xc @ Vt[:3].T

    bear = np.array([Vt[:3, i] / np.linalg.norm(Vt[:3, i]) for i in range(len(axes))])
    _, vec = np.linalg.eigh(bear.T @ bear)
    up = vec[:, 0]
    if up @ Vt[:3, axes.index('maturity')] < 0:
        up = -up
    a, b = vec[:, 1], vec[:, 2]
    fwd = a if (scores @ a).std() >= (scores @ b).std() else b
    if fwd @ -Vt[:3, axes.index('weight')] < 0:
        fwd = -fwd
    B = np.column_stack([fwd, up, np.cross(fwd, up)])
    pos = scores @ B
    pos = pos / np.abs(pos).max()
    rad = np.linalg.norm(pos, axis=1)
    return {'axes': axes, 'var': var, 'dir': Vt[:3].T @ B, 'raw': pos,
            'rad': rad, 'lean': rad / rad.max()}


# ---------------------------------------------------------------- the space
def test_three_dimensions_hold_what_the_page_says_they_hold(rebuilt, out):
    assert round(float(rebuilt['var'][:3].sum()), 4) == out['kept3']
    assert 0.88 < out['kept3'] < 0.89, 'the page states 88.8%'


def test_a_measure_magnitude_is_the_share_of_it_the_three_dimensions_keep(rebuilt, out):
    for i, a in enumerate(rebuilt['axes']):
        keep = float(np.linalg.norm(rebuilt['dir'][i]))
        for pole in out['poles']:
            if pole['ax'] == a:
                assert pole['str'] == round(keep, 3)
        assert 0 < keep <= 1


def test_no_measure_survives_whole_except_age(out):
    keep = {p['ax']: p['str'] for p in out['poles']}
    assert keep['maturity'] > 0.97
    assert all(v < 0.9 for k, v in keep.items() if k != 'maturity')


def test_up_is_where_the_measures_point_least(out):
    """The claim is not that age happens to be vertical. It is that up was CHOSEN
    to be the direction the five named measures use least, and age is what came
    out. So: no other direction has the measures pointing along it less."""
    d = np.array([p['dir'] for p in out['poles'][::2]])      # one of each pair
    got = float((d[:, 1] ** 2).sum())
    rng = np.random.default_rng(7)
    for _ in range(4000):
        u = rng.normal(size=3)
        u /= np.linalg.norm(u)
        assert (d @ u) @ (d @ u) >= got - 1e-9


def test_style_lies_along_the_horizon_and_age_stands_up(out):
    elev = {p['w']: math.degrees(math.asin(p['dir'][1])) for p in out['poles']}
    for w in ('light-bodied', 'full-bodied', 'low tannin', 'high tannin',
              'unoaked', 'heavily oaked', 'citrus & apple', 'dark berries'):
        assert abs(elev[w]) < 14, (w, elev[w])
    assert elev['old'] > 80, 'older is overhead'
    assert elev['young'] < -80


def test_every_measure_is_named_at_both_ends_and_the_ends_are_opposite(src, out):
    assert len(out['poles']) == 2 * len(src['axes'])
    for a in src['axes']:
        lo, hi = [p for p in out['poles'] if p['ax'] == a]
        assert [lo['w'], hi['w']] == src['ends'][a]
        assert np.allclose(np.array(lo['dir']), -np.array(hi['dir']), atol=1e-4)
        assert lo['str'] == hi['str']


def test_a_pole_wears_a_colour_wine_comes_in(out):
    """Straw, gold, garnet, leather, amber, tawny, purple -- not the Find tab's
    slider swatches, which are muted for a pale card and turn to orange and
    magenta when they are lifted enough to carry on a black ball."""
    ends = {'weight': ['#e2c9a4', '#7d1f2b'], 'grip': ['#dcc57e', '#7c4a24'],
            'oak': ['#cfd0a6', '#b9762c'], 'fruit': ['#adbf5a', '#5d1c46'],
            'maturity': ['#a8265a', '#9a5a2c']}
    for p in out['poles']:
        assert p['col'] == ends[p['ax']][p['end']]


def test_nothing_is_shipped_that_the_page_does_not_read(out):
    """The five measures were once drawn as arcs across the sky and are not any
    more -- they read as a starburst over the shop. The arcs are gone, so their
    field goes with them: a carried field is eventually stated by accident."""
    assert 'lines' not in out
    assert set(out) == {'axes', 'poles', 'terms', 'near', 'far', 'kept3', 'var',
                        'pos', 'lean', 'col', 'fizz', 'acc', 'dist'}


# ---------------------------------------------------------------- the wines
def test_a_wine_stands_where_its_five_measures_put_it(rebuilt, out):
    """Direction is the whole claim: the reduction may scale but it may not turn.
    Checked as an angle, so a change of units cannot hide a change of place."""
    got = np.array(out['pos'])
    want = rebuilt['raw']
    n1 = np.linalg.norm(got, axis=1)
    n2 = np.linalg.norm(want, axis=1)
    live = (n1 > 1e-6) & (n2 > 1e-6)
    cos = (got[live] * want[live]).sum(1) / (n1[live] * n2[live])
    assert cos.min() > 0.9995, cos.min()


def test_how_far_out_a_wine_stands_is_how_far_from_middling_it_is(rebuilt, out):
    lean = np.array(out['lean'])
    assert np.abs(lean - rebuilt['lean']).max() < 1e-3
    want = NEAR + (FAR - NEAR) * lean
    assert np.abs(np.array(out['dist']) - want).max() < 0.01
    assert np.abs(np.linalg.norm(np.array(out['pos']), axis=1)
                  - np.array(out['dist'])).max() < 0.02


def test_the_shop_begins_beyond_arms_reach(out):
    """The eye rides a neck ahead of where you stand, so a wine nearer than the
    neck would swing through your own head as you turned."""
    assert min(out['dist']) > NECK + 0.3
    assert max(out['dist']) == pytest.approx(FAR, abs=0.01)


def test_the_middling_wine_is_the_near_one_and_the_committed_one_is_far(src, out):
    """Position and commitment are one variable here, so this must hold or the
    page's reading of nearness is wrong."""
    lean = np.array(out['lean'])
    dist = np.array(out['dist'])
    assert np.corrcoef(lean, dist)[0, 1] > 0.999


def test_every_shipped_field_is_one_per_wine_and_in_the_catalogue_order(src, out):
    n = len(src['wines'])
    for k in ('pos', 'lean', 'col', 'acc', 'dist', 'fizz'):
        assert len(out[k]) == n, k
    # order: the reddest and the palest wine in the catalogue must land on the
    # colour the same index carries
    reds = [i for i, c in enumerate(out['col']) if c == 'red']
    assert src['wines'][reds[0]]['fruit'] >= 0
    whites = [i for i, c in enumerate(out['col']) if c == 'white']
    assert np.mean([src['wines'][i]['weight'] for i in whites]) \
         < np.mean([src['wines'][i]['weight'] for i in reds]), \
        'whites are lighter than reds, so the index alignment holds'


# --------------------------------------------------------------- the colour
WHITE_GRAPES = ('chardonnay', 'sauvignon blanc', 'chenin blanc', 'riesling',
                'semillon', 'sémillon', 'pinot gris', 'pinot grigio', 'glera',
                'viognier', 'gewurztraminer', 'gewürztraminer', 'albarino',
                'albariño', 'verdicchio', 'vermentino', 'grüner', 'gruner',
                'muscat', 'moscato', 'furmint', 'assyrtiko', 'garganega',
                'trebbiano', 'marsanne', 'roussanne', 'melon de bourgogne',
                'colombard', 'bordeaux blend white', 'white blend', 'blanc de blancs')


def test_a_white_grape_makes_a_white_wine(src, out):
    for w, c in zip(src['wines'], out['col']):
        v = (w.get('variety') or '').lower()
        txt = ' '.join(str(w.get(k) or '') for k in ('name', 'variety', 'region'))
        if not v or re.search(r'\b(ros[ée]|rosato|rosado|chiaretto|blush)\b', txt, re.I):
            continue
        assert c == ('white' if any(g in v for g in WHITE_GRAPES) else 'red'), (v, c)


def test_a_wine_is_pink_when_it_says_it_is(src, out):
    pink = [w for w, c in zip(src['wines'], out['col']) if c == 'rose']
    assert 20 < len(pink) < 60, len(pink)
    for w in pink:
        txt = ' '.join(str(w.get(k) or '') for k in ('name', 'variety', 'region'))
        assert re.search(r'\b(ros[ée]|rosato|rosado|chiaretto|blush)\b', txt, re.I), w['name']
    # and the word must not be caught inside another: Gruaud Larose is a red
    assert not any('Larose' in w['name'] or 'Montrose' in w['name'] for w in pink)


def test_the_catalogues_sparkling_flag_is_not_what_decides_a_flute(src, out):
    """It marks Chateau Cheval Blanc 1928, Haut Brion 1937 and Ausone 2005 as
    sparkling. It is right about Prosecco and Cava and wrong about first-growth
    Bordeaux, and nothing in the flag says which kind of answer you are holding.
    So a wine sparkles here when its own name, grape or region says so, and every
    one of those can be checked by reading it."""
    flag = {w['name'] for w in src['wines'] if w.get('sparkling')}
    fizz = {w['name'] for w, f in zip(src['wines'], out['fizz']) if f}
    for wrong in ('Chateau Cheval Blanc 1928', 'Chateau Haut Brion 1937'):
        assert wrong in flag, 'the flag really does say this'
        assert wrong not in fizz, 'and the page really does not'
    assert 40 < len(fizz) < 110, len(fizz)
    for name in fizz:
        assert re.search(r'champagne|prosecco|cava|cr[ée]mant|franciacorta|spumante|'
                         r'frizzante|p[ée]tillant|pet[-\s]?nat|sparkling|blanc de |brut|'
                         r'sekt|lambrusco|asti|bubbles|spritz|glera|champenoise|classico',
                         name + ' ' + ' '.join(
                             str(w.get(k) or '') for w in src['wines'] if w['name'] == name
                             for k in ('variety', 'region')), re.I), name
    # every Prosecco in the shop is one, because Glera is only made sparkling
    proseccos = {w['name'] for w in src['wines']
                 if re.search(r'prosecco|glera', w['name'] + ' ' + (w.get('variety') or ''), re.I)}
    assert proseccos <= fizz, proseccos - fizz


def test_the_measures_are_asked_only_when_no_grape_is_named(src, out):
    named = [c for w, c in zip(src['wines'], out['col']) if w.get('variety')]
    assert len(named) > 0.9 * len(src['wines']), 'the grape decides nearly always'


def test_the_ground_under_a_wine_is_the_colour_of_the_poles_it_faces(out):
    """The stem carries the blend of the pole colours weighted by how nearly the
    wine lies toward each.

    What that can be asked to prove is bounded by the shop. Four of these poles
    lie within fourteen degrees of one another, so a wine standing under
    "heavily oaked" stands nearly as squarely under "full-bodied" and the blend
    is entitled to come out between them -- that is the arrangement speaking, not
    a fault. What must hold is the thing the colour is for: a wine standing under
    a pole takes a colour nearer that pole's than its opposite's. It is NOT true
    that it lands nearest its own -- the wine standing most squarely under
    "heavily oaked" comes out at rgb(198,104,78), which is a shade redder than
    that pole because it stands nearly as squarely under "full-bodied" too. So
    this colour says which part of the shop, not which measure, and the tests
    below say only that.
    """
    poles = out['poles']
    rgb = {p['w']: np.array([int(p['col'][i:i + 2], 16) for i in (1, 3, 5)], float)
           for p in poles}
    mean = np.mean(list(rgb.values()), axis=0)
    pos = np.array(out['pos'])
    tested = 0
    for p in poles:
        cos = pos @ np.array(p['dir']) / np.linalg.norm(pos, axis=1)
        i = int(cos.argmax())
        if cos[i] < 0.985:
            continue                    # nothing stands that squarely under it
        other = next(q['w'] for q in poles if q['ax'] == p['ax'] and q is not p)
        got = np.array([int(out['acc'][i][j:j + 2], 16) for j in (1, 3, 5)], float)
        mine = np.linalg.norm(got - rgb[p['w']])
        assert mine < np.linalg.norm(got - rgb[other]), p['w']
        tested += 1
    assert tested >= 8, 'most poles have something standing under them'
    assert np.linalg.norm(mean) > 0


def test_two_wines_standing_apart_stand_on_different_ground(out):
    """Which is the whole of what the stem colour is worth: it has to move with
    the place. If it did not, it would be a field nothing reads."""
    pos = np.array(out['pos'])
    pos = pos / np.linalg.norm(pos, axis=1, keepdims=True)
    acc = np.array([[int(a[i:i + 2], 16) for i in (1, 3, 5)] for a in out['acc']], float)
    rng = np.random.default_rng(3)
    i, j = rng.integers(0, len(pos), 4000), rng.integers(0, len(pos), 4000)
    apart = np.arccos(np.clip((pos[i] * pos[j]).sum(1), -1, 1))
    differ = np.linalg.norm(acc[i] - acc[j], axis=1)
    assert np.corrcoef(apart, differ)[0, 1] > 0.6
    assert differ.max() > 90, 'the two furthest grounds are plainly different colours'


def test_a_ground_colour_is_a_blend_and_never_a_colour_of_its_own(out):
    """It has to stay inside the box the ten pole colours span, or it is saying
    something the arrangement never said."""
    rgb = np.array([[int(p['col'][i:i + 2], 16) for i in (1, 3, 5)] for p in out['poles']], float)
    acc = np.array([[int(a[i:i + 2], 16) for i in (1, 3, 5)] for a in out['acc']], float)
    assert (acc >= rgb.min(0) - 1).all() and (acc <= rgb.max(0) + 1).all()


# ---------------------------------------------------------------- the aromas
def raw_terms(src):
    """What the catalogue actually writes, before anything is merged."""
    seen = collections.defaultdict(set)
    for k, w in enumerate(src['wines']):
        for field in ('nose', 'palate'):
            for piece in (w.get(field) or '').split(','):
                t = piece.strip().lower().strip(' .;:')
                if t:
                    seen[t].add(k)
    return seen


def test_an_aroma_carries_exactly_the_wines_the_catalogue_gives_it(src, out):
    raw = raw_terms(src)
    n = len(src['wines'])
    for t in out['terms']:
        held = set(t['in'])
        assert len(held) == t['n'] == len(t['in']), t['w']
        assert t['in'] == sorted(t['in']), t['w']
        assert held <= set(range(n)), t['w']
        # a wine can only carry a word if the catalogue wrote it something
        for i in held:
            w = src['wines'][i]
            assert (w.get('nose') or w.get('palate')), (t['w'], w['name'])
        # where the word survives the merge unchanged, every wine the catalogue
        # spells it on must be in the set
        if t['w'] in raw:
            assert raw[t['w']] <= held, t['w']
    assert raw, 'the catalogue does write tasting words'


def test_spellings_are_merged_before_anything_is_decided(src, out):
    """"spice" and "spices" are one word, and merging them is not a judgement
    about meaning -- it happens first, and separately from the screen, which is
    the part that decides anything. If the merge stopped, both spellings would
    appear and each would carry half the wines."""
    names = {t['w']: t for t in out['terms']}
    raw = raw_terms(src)
    for gone, kept, extra in [('spices', 'spice', ['spice']),
                              ('earth', 'earthy', ['earthy', 'earthy notes']),
                              ('minerality', 'mineral', ['mineral']),
                              ('cassis', 'blackcurrant', ['blackcurrant', 'black currant']),
                              ('dark fruits', 'dark berries', ['dark fruit', 'dark berries'])]:
        assert gone not in names, gone + ' should have been merged away'
        assert kept in names, kept
        want = set().union(*(raw.get(v, set()) for v in [gone] + extra))
        assert want <= set(names[kept]['in']), kept
        assert names[kept]['n'] >= len(raw.get(gone, ())) + 1


def test_the_reader_is_never_shown_a_word_the_page_has_banned(out):
    for t in out['terms']:
        assert 'dark fruit' not in t['w']
        assert not re.search(r'\b(notes?|undertones?|hints?)\b', t['w'])
    assert 'dark berries' in [t['w'] for t in out['terms']], \
        'his own word for that end survived the merge'


def test_a_word_earns_its_place_by_landing_somewhere_a_shuffle_would_not(src, out):
    """The admission rule, run again. A word is let in when the wines carrying it
    sit further off centre than the same number of wines drawn at random do. The
    test is what keeps the page from having to decide by hand that "balanced" is
    not a smell -- a word that lands anywhere lands nowhere in particular."""
    pos = np.array([p for p in np.array(out['pos'])])
    pos = pos / np.linalg.norm(pos, axis=1, keepdims=True) * np.array(out['lean'])[:, None]
    rng = np.random.default_rng(11)
    for t in out['terms']:
        idx = t['in']
        got = np.linalg.norm(pos[idx].mean(0))
        null = np.linalg.norm(pos[rng.integers(0, len(pos), size=(300, len(idx)))].mean(1), axis=1)
        assert (null >= got).mean() < 0.06, (t['w'], (null >= got).mean())


def test_the_words_that_point_nowhere_are_the_ones_that_praise(out):
    kept = {t['w'] for t in out['terms']}
    for w in ('balanced', 'elegant', 'forest floor', 'red fruits'):
        assert w not in kept, w + ' has no bearing in this shop'
    for w in ('tobacco', 'cedar', 'citrus', 'leather', 'blackcurrant', 'truffle'):
        assert w in kept, w


def test_an_aroma_stands_at_the_middle_of_the_wines_that_smell_that_way(out):
    pos = np.array(out['pos'])
    pos = pos / np.linalg.norm(pos, axis=1, keepdims=True) * np.array(out['lean'])[:, None]
    for t in out['terms']:
        c = pos[t['in']].mean(0)
        d = np.array(t['pos'])
        cos = c @ d / (np.linalg.norm(c) * np.linalg.norm(d))
        assert cos > 0.9995, t['w']


def test_how_sharply_a_word_marks_its_bearing_is_how_far_out_it_stands(out):
    strong = max(out['terms'], key=lambda t: t['str'])
    weak = min(out['terms'], key=lambda t: t['str'])
    assert strong['str'] == 1.0 and strong['dist'] == pytest.approx(FAR, abs=0.01)
    assert weak['dist'] < strong['dist']
    for t in out['terms']:
        assert t['dist'] == pytest.approx(NEAR + (FAR - NEAR) * t['str'], abs=0.01)
        assert np.linalg.norm(np.array(t['pos'])) == pytest.approx(t['dist'], abs=0.02)


def test_an_aroma_is_never_estimated_from_a_handful_of_wines(out):
    assert min(t['n'] for t in out['terms']) >= 18


# ----------------------------------------------------------------- the whole
def test_the_arrangement_reproduces_from_the_catalogue_byte_for_byte(tmp_path):
    """Everything above rests on this: run the pipeline again and the same
    numbers come out, so a test that passes today is a test of the page and not
    of the day it ran."""
    import subprocess
    import sys
    before = (HERE / 'atlas_data.json').read_bytes()
    subprocess.run([sys.executable, str(HERE / 'atlas.py')], check=True,
                   capture_output=True)
    assert (HERE / 'atlas_data.json').read_bytes() == before


def test_the_tab_icon_is_the_glass_the_shop_is_drawn_with():
    """The favicon is built from GLASS in build.py, which is a copy of the
    numbers glass() draws every wine with. A copy drifts unless something holds
    it, so this is what holds it: change the glass and this fails, naming the
    ratio that moved. The icon is then a drawing OF the mark until it is fixed.
    """
    import build

    js = (HERE / 'atlas.js').read_text()
    glass = js[js.index('function glass('):js.index('/* ---- the paint')]
    # the ratio, and the line of atlas.js it has to still be sitting in
    for name, ratio, where in [
        ('rw', 0.50, 'R*(fz ? 0.30 : 0.50)'),
        ('top', 0.84, 'y - R*(fz ? 0.98 : 0.84)'),
        ('bot', 0.12, 'y + R*(fz ? 0.20 : 0.12)'),
        ('waist', 0.66, 'dep*(fizz ? 0.90 : 0.66)'),
        ('tuck', 0.44, 'rw*0.44'),
        ('fill', 0.42, 'dep*(fizz ? 0.22 : 0.42)'),
        ('stem', 0.72, 'y + R*0.72'),
        ('foot', 0.74, 'y + R*0.74'),
        ('footR', 0.34, 'R*0.34'),
        ('wire', 0.085, 'R*0.085'),
    ]:
        assert abs(build.GLASS[name]) == ratio, (name, build.GLASS[name], ratio)
        assert where in glass, (
            f'the glass no longer draws {name} at {ratio}; the tab icon still does')


def test_the_tab_icon_pours_a_red_from_the_range_the_shop_pours():
    """Not any colour: the hue and saturation are what pour() gives a red at
    middling maturity, and the lightness sits between the two themes' -- a tab
    strip follows the reader's system, not the page's."""
    import build

    js = (HERE / 'atlas.js').read_text()
    assert '[348 + 32 * m, 74 - 6 * m,' in js, 'the reds are no longer poured this way'
    h, s, ln = (float(v.rstrip('%')) for v in
                build.WINE[4:-1].split(','))
    assert h == 348 + 32 * 0.5 - 360, h        # 4, the wheel come round
    assert s == 74 - 6 * 0.5, s                # 71
    light, dark = 32 + 9 * 0.5 + 4 * 0.5, 46 + 9 * 0.5 + 4 * 0.5
    assert light < ln < dark, (light, ln, dark)


def test_the_tab_icon_is_one_self_contained_picture():
    """The SVG travels in the page itself: no request, nothing to lose. What is
    checked is what a BUILD emits, not the file in docs/ -- that file is written
    by whoever last ran the build, and a test that reads it is testing when
    someone else ran a command rather than what this code does."""
    import build

    icon = build.favicon()
    assert icon.startswith('data:image/svg+xml,')
    svg = urllib.parse.unquote(icon.split(',', 1)[1])
    assert 'http' not in svg.replace('http://www.w3.org/2000/svg', ''), 'it reaches out'
    assert svg.count('<svg') == 1 and svg.endswith('</svg>')


def test_the_page_carries_a_glass_safari_can_also_read(tmp_path):
    """Safari takes neither an SVG icon nor a declared one that the HOST's own
    favicon.ico can outrank -- agent.farm serves an orange star for everything
    under it, and that star is what the tab showed. So the PNG is a real file
    standing beside the page and declared first, and the SVG stays inline for
    everyone else. Built into a fresh directory, so what is held is the build.
    """
    import build

    build.build(out=tmp_path)
    published = tmp_path / 'docs' / 'wine' / 'index.html'
    html = published.read_text()
    assert '<link rel="icon" href="icon.png" sizes="32x32">' in html
    assert f'<link rel="icon" type="image/svg+xml" href="{build.favicon()}">' in html
    assert html.index('icon.png') < html.index('image/svg+xml'), \
        'the SVG is offered first, which is the order Safari loses on'

    beside = published.parent / 'icon.png'
    assert beside.exists(), 'the page declares an icon the build does not write'
    assert beside.read_bytes() == build.favicon_bytes(), \
        'the glass beside the page is not the glass this build draws'
    assert beside.read_bytes()[:8] == b'\x89PNG\r\n\x1a\n'


def test_the_glass_in_pixels_is_the_glass_the_vectors_draw():
    """Not a second drawing of it: the same points through the other renderer.
    So the wine has to be red below the line it is poured to, the bowl has to be
    empty above that line, the stem has to be there, and outside the glass has
    to be nothing at all."""
    import raster

    import build

    box, pad = 32, 0.5
    R = (box - 2 * pad) / max(build.GLASS_W, build.GLASS_H)
    canvas = raster.Canvas(box)
    build.glass_raster(canvas, R, box / 2, box / 2)
    px = canvas.pixels()
    m = build.glass_parts(R, box / 2, box / 2)
    mid = int(box / 2)

    below = px[int(m['line']) + 2, mid]
    assert below[3] == 255 and below[0] > below[1] and below[0] > below[2], \
        f'what is in the bowl is not wine: {tuple(below)}'

    above = px[int(m['top']) + 2, mid]
    assert above[0] <= above[2] + 12, f'the empty half of the bowl is red: {tuple(above)}'

    (sx, sy), (ex, ey), _ = m['stem']
    assert px[int((sy + ey) / 2), int(sx), 3] > 0, 'the glass has no stem'

    assert px[0, 0, 3] == 0 and px[box - 1, 0, 3] == 0, 'it fills the corners'
    # beside the bowl at its widest, where a glass is not
    beside = int(m['rim'][0]) - 2
    assert px[int((m['top'] + m['line']) / 2), beside, 3] == 0, 'it spills past the bowl'
