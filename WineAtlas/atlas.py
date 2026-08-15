"""Turn the five measures into a place you can stand in.

The Find tab reads a wine as five numbers. Five numbers is not somewhere you can
be, so this reduces them to three and hands back a space: the shop laid out by
what its wines are like, with the reader in the middle of it.

Three things live there, and they are three different kinds of thing.

A POLE is a bearing and nothing else -- "older", "more oaked" is a direction you
face, never a place you arrive at -- so the ten poles hang at infinity, fixed,
unmoved by anything the reader does. Each measure is a straight line through the
middle of the shop, so its trace on the sky is one great circle running from its
low pole to its high one, and all five cross where the middle is.

An AROMA is not a bearing. Cedar is something wines have, not a quality you can
ask for on a slider, so it belongs among them at a real place -- the middle of
the wines that smell that way.

A WINE is a thing at a place. Its direction is what it is like and its radius is
how far it stands from the middle of the shop, so a wine near the centre is
middling in everything, which is the true thing to say about it.

Written to atlas_data.json, which build.py folds into the page.
"""
import collections
import json
import math
import pathlib
import re

import numpy as np

HERE = pathlib.Path(__file__).parent
SRC = json.loads((HERE / 'app_data.json').read_text())

AXES = SRC['axes']
WINES = SRC['wines']

# how far the field runs: the nearest wine must sit further off than the neck is
# long, or turning your head would swing your eye through the shop
NEAR, FAR = 2.6, 11.0
SEED = 20260815          # the screen is a random test; it must give one answer
MIN_WINES = 18           # below this a centroid is noise wearing a word
TRIALS = 400


# ---------------------------------------------------------------- the space
def space(wines):
    """Three dimensions out of five, by the amount each carries.

    Nothing is chosen by hand. The three come out in order of how much the shop
    varies along them, and how much of each named measure survives the drop from
    five to three becomes that measure's magnitude in the sky.

    WHICH WAY IS UP is chosen, though, and by a rule. Inside three dimensions the
    view may be turned any way at all, so up goes where the five named measures
    point LEAST -- the smallest direction of the scatter of their own bearings.
    That way turning your head sweeps the measures rather than pushing them off
    the top and bottom of the view, which is what the plain order of the three
    did: every measure sat between nineteen and forty-seven degrees above the
    horizon and the sky was mostly out of sight.

    What comes out is age. Body, tannin, oak and fruit move together, so any
    plane holding the four of them leaves age nearly square to it: the four sit
    within fourteen degrees of the horizon and age stands at eighty-two, old
    overhead. Turning your head runs through style; looking up and down is age.
    """
    X = np.array([[w[a] for a in AXES] for w in wines], float)
    mid = X.mean(0)
    U, s, Vt = np.linalg.svd(X - mid, full_matrices=False)
    var = s ** 2 / (s ** 2).sum()
    scores = (X - mid) @ Vt[:3].T

    bear = np.array([Vt[:3, i] / np.linalg.norm(Vt[:3, i]) for i in range(len(AXES))])
    _, vec = np.linalg.eigh(bear.T @ bear)          # ascending: least-used first
    up = vec[:, 0]
    if up @ (Vt[:3, AXES.index('maturity')]) < 0:
        up = -up                                    # older is overhead
    # of the two that are left, the one the shop spreads along most becomes the
    # direction you face, so a turn of the head is the widest sweep available
    a, b = vec[:, 1], vec[:, 2]
    fwd = a if (scores @ a).std() >= (scores @ b).std() else b
    if fwd @ (-Vt[:3, AXES.index('weight')]) < 0:
        fwd = -fwd                                  # light-bodied ahead at rest
    side = np.cross(fwd, up)
    B = np.column_stack([fwd, up, side])
    return scores @ B, Vt[:3].T @ B, var, mid


POS, VT3, VAR, MID = space(WINES)
SCALE = float(np.abs(POS).max())
POS = POS / SCALE
RAD = np.linalg.norm(POS, axis=1)
LEAN = RAD / RAD.max()


def bearing(a):
    """Where a measure points, in the space, and how much of it got there."""
    d = VT3[AXES.index(a)]
    n = float(np.linalg.norm(d))
    return d / n, n            # n is the share of the measure the 3-space keeps


# ---------------------------------------------------------------- the poles
# Each measure is one line through the middle with a name at each end. The
# colours are the page's own: the ends of the slider the reader already drags.
ENDC = {'weight': ['#d98f97', '#c4485e'], 'grip': ['#c9b183', '#b0702f'],
        'oak': ['#b8ab94', '#c98a3e'], 'fruit': ['#9ebf3b', '#c9538f'],
        'maturity': ['#87a733', '#96502a']}

POLES = []
for a in AXES:
    d, keep = bearing(a)
    for side in (0, 1):
        POLES.append({
            'w': SRC['ends'][a][side],
            'ax': a,
            'end': side,
            'dir': [round(float(x) * (1 if side else -1), 4) for x in d],
            'str': round(keep, 3),
            'col': ENDC[a][side],
        })
AXIS_LINE = [{'ax': a, 'dir': [round(float(x), 4) for x in bearing(a)[0]],
              'str': round(bearing(a)[1], 3),
              'lo': ENDC[a][0], 'hi': ENDC[a][1]} for a in AXES]


# ---------------------------------------------------------------- the aromas
# The catalogue writes the same smell a dozen ways. Merging spellings is not a
# judgement about meaning -- "spices" and "spice" are one word -- so it is done
# first and separately from the screen, which is the part that decides anything.
DROP_TAIL = re.compile(r'\s+(notes?|undertones?|nuances?|hints?|aromas?|flavou?rs?|character)$')
LEAD = re.compile(r'^(and|with|a|of|the|some|hints? of|notes? of)\s+')
SPELLING = {
    'spices': 'spice', 'plums': 'plum', 'cherries': 'cherry',
    'blackberries': 'blackberry', 'raspberries': 'raspberry',
    'strawberries': 'strawberry', 'herb': 'herbs', 'flower': 'floral',
    'flowers': 'floral', 'flowery': 'floral', 'earth': 'earthy',
    'minerality': 'mineral', 'minerals': 'mineral', 'black currant': 'blackcurrant',
    'cassis': 'blackcurrant', 'black currants': 'blackcurrant',
    'red fruit': 'red fruits', 'black fruit': 'black fruits',
    'berry': 'berries', 'red berry': 'red berries', 'dark berry': 'dark berries',
    # the page never says "dark fruit"; the reader's word for that end is the
    # one printed under his own slider
    'dark fruit': 'dark berries', 'dark fruits': 'dark berries',
    'apples': 'apple', 'pears': 'pear', 'peaches': 'peach', 'apricots': 'apricot',
    'lemons': 'lemon', 'violets': 'violet', 'roses': 'rose', 'nuts': 'nutty',
    'smoky': 'smoke', 'toasty': 'toast', 'oaky': 'oak', 'leathery': 'leather',
    'chocolatey': 'chocolate', 'liquorice': 'licorice', 'pepper': 'pepper',
    'peppery': 'pepper', 'white flower': 'white flowers', 'stone fruits': 'stone fruit',
}


def aromas(w):
    out = set()
    for field in ('nose', 'palate'):
        for piece in (w.get(field) or '').split(','):
            t = piece.strip().lower().strip(' .;:')
            t = LEAD.sub('', t)
            t = DROP_TAIL.sub('', t).strip()
            t = SPELLING.get(t, t)
            if t and len(t) > 2:
                out.add(t)
    return out


CARRIES = collections.defaultdict(list)
for k, w in enumerate(WINES):
    for t in aromas(w):
        CARRIES[t].append(k)


def screen():
    """Which aroma words point somewhere, and which attach to everything.

    A word earns a place if the wines carrying it sit off-centre by further than
    the same number of wines drawn at random would. That is the whole test, and
    it is the reason the page does not have to decide by hand that "rich" is not
    a smell: a word that lands anywhere lands nowhere in particular, and its own
    wines say so.
    """
    rng = np.random.default_rng(SEED)
    kept, cut = [], []
    for t, idx in sorted(CARRIES.items()):
        if len(idx) < MIN_WINES:
            continue
        c = POS[idx].mean(0)
        got = float(np.linalg.norm(c))
        null = np.linalg.norm(
            POS[rng.integers(0, len(POS), size=(TRIALS, len(idx)))].mean(1), axis=1)
        p = float((null >= got).mean())
        row = {'w': t, 'n': len(idx), 'off': got, 'p': p,
               'lift': got / float(np.percentile(null, 95))}
        (kept if p < 0.05 else cut).append(row)
    return kept, cut


KEPT, CUT = screen()
KEPT.sort(key=lambda r: -r['off'])
TOP = max(r['off'] for r in KEPT)

TERMS = []
for r in KEPT:
    c = POS[CARRIES[r['w']]].mean(0)
    d = c / (np.linalg.norm(c) or 1)
    strength = r['off'] / TOP
    dist = NEAR + (FAR - NEAR) * strength
    TERMS.append({
        'w': r['w'], 'n': r['n'],
        'pos': [round(float(x) * dist, 3) for x in d],
        'dist': round(dist, 2),
        'str': round(strength, 3),
        'in': sorted(CARRIES[r['w']]),
    })


# ------------------------------------------------------------- what a wine is
# A wine is a GLASS, and what is in the glass is the colour of the wine. That is
# the one thing about a bottle everybody already reads, so it is what the mark
# says first. Where it stands is said by the stem, which takes the colour of the
# ground under it -- the same blend of pole regions the globe is painted with.
WHITE_GRAPES = ('chardonnay', 'sauvignon blanc', 'chenin blanc', 'riesling',
                'semillon', 'sémillon', 'pinot gris', 'pinot grigio', 'glera',
                'viognier', 'gewurztraminer', 'gewürztraminer', 'albarino',
                'albariño', 'verdicchio', 'vermentino', 'grüner', 'gruner',
                'muscat', 'moscato', 'furmint', 'assyrtiko', 'garganega',
                'trebbiano', 'marsanne', 'roussanne', 'melon de bourgogne',
                'colombard', 'bordeaux blend white', 'white blend', 'blanc de blancs')
ROSE_HINT = ('rosé', 'rose blend', 'rosato', 'provence rosé')


def colour(w):
    """white, rose or red, read off the grape and checked against the measures."""
    v = (w.get('variety') or '').lower()
    if any(h in v for h in ROSE_HINT):
        return 'rose'
    if v:
        white = any(g in v for g in WHITE_GRAPES)
        if white:
            return 'white'
        return 'red'
    # no grape named: the measures still separate them cleanly, since a white in
    # this catalogue is light and low on the fruit scale
    return 'white' if (w['weight'] < 0.55 and w['fruit'] < 0.45) else 'red'


COLOUR = [colour(w) for w in WINES]


def accent(p):
    """The colour of the ground a wine stands on: the poles it faces, blended.

    Weighted by how nearly the wine lies toward each pole, so a border shades
    into its neighbour instead of snapping. Blended in RGB because the ten pole
    colours are the reader's own hexes, not points on a wheel.
    """
    d = p / (np.linalg.norm(p) or 1)
    cos = np.array([float(np.dot(d, q['dir'])) for q in POLES])
    wgt = np.exp((cos - cos.max()) * 11)
    rgb = np.array([[int(q['col'][i:i+2], 16) for i in (1, 3, 5)] for q in POLES], float)
    mix = (rgb * wgt[:, None]).sum(0) / wgt.sum()
    return '#%02x%02x%02x' % tuple(int(round(x)) for x in mix)


DATA = {
    'axes': AXES,
    'poles': POLES,
    'lines': AXIS_LINE,
    'terms': TERMS,
    'near': NEAR, 'far': FAR,
    'kept3': round(float(VAR[:3].sum()), 4),
    'var': [round(float(x), 4) for x in VAR],
    'pos': [[round(float(x), 3) for x in p] for p in POS * 0 + POS],
    'lean': [round(float(x), 3) for x in LEAN],
    'col': COLOUR,
    'acc': [accent(p) for p in POS],
}
# the wines fill the body of the ball rather than its surface, so the reader can
# stand in the middle and be within reach of everything
DATA['pos'] = [[round(float(x * (NEAR + (FAR - NEAR) * l) / (r or 1e-9)), 3)
                for x in p]
               for p, r, l in zip(POS, RAD, LEAN)]
DATA['dist'] = [round(NEAR + (FAR - NEAR) * l, 2) for l in LEAN]

if __name__ == '__main__':
    out = HERE / 'atlas_data.json'
    out.write_text(json.dumps(DATA))
    print(f'three dimensions hold {VAR[:3].sum():.1%} of the five')
    print('each measure keeps:',
          {a: round(bearing(a)[1], 2) for a in AXES})
    print(f'aroma words: {len(KEPT)} point somewhere, {len(CUT)} do not')
    print('  strongest:', ', '.join(f"{r['w']}" for r in KEPT[:12]))
    print('  cut:      ', ', '.join(f"{r['w']}" for r in sorted(CUT, key=lambda r: -r['n'])[:14]))
    print('colours:', dict(collections.Counter(COLOUR)))
    print('wines run', min(DATA['dist']), 'to', max(DATA['dist']), 'deep')
    print('wrote', out, out.stat().st_size, 'bytes')
