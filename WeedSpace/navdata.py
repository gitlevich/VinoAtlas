"""Data for a map you navigate with your nose.

Words are the furniture. Strains are carried but never drawn: they are how a
combination of smells is located, and they are the answer if the reader asks
which ones are here.
"""
import json, logging, pathlib
import numpy as np
import pandas as pd
from scipy.stats import spearmanr
from sklearn.cross_decomposition import CCA
from sklearn.model_selection import KFold

logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger("nav")
HERE = pathlib.Path(__file__).parent
LEX = str(HERE.parent / "data" / "lexicon") + "/"
OUT = str(HERE) + "/"

fl = pd.read_parquet(LEX + "cannabis_strain_flavor.parquet")
ef = pd.read_parquet(LEX + "cannabis_strain_effect.parquet")
fl.columns = [c.replace("flavor_", "").replace("_score", "") for c in fl.columns]
fl, ef = fl.align(ef, join="inner", axis=0)
flm = fl.replace(0.0, np.nan)
# A word earns its place only if its best match with the other vocabulary beats
# a best-of-all null on shuffled data. These four do not: they name a
# distinction that makes no difference here, so they are not in the space.
DEAD = {'rose', 'sage', 'spicyHerbal', 'tobacco'}
words = [c for c in fl.columns if flm[c].notna().mean() >= 0.55 and c not in DEAD]
log.info("dropped %d words that point at nothing: %s", len(DEAD), ", ".join(sorted(DEAD)))

X = flm[words].fillna(flm[words].median()).to_numpy(float)
Y = ef.to_numpy(float)
X = (X - X.mean(0)) / X.std(0); Y = (Y - Y.mean(0)) / Y.std(0)
K = 3
ox, oy = np.zeros((len(X), K)), np.zeros((len(Y), K))
for tr, te in KFold(5, shuffle=True, random_state=0).split(X):
    m = CCA(n_components=K, max_iter=2000).fit(X[tr], Y[tr])
    ox[te], oy[te] = m.transform(X[te], Y[te])
agree = [round(abs(spearmanr(ox[:, k], oy[:, k]).statistic), 2) for k in range(K)]

m = CCA(n_components=K, max_iter=2000).fit(X, Y)
xs, ys = m.transform(X, Y)
xs = (xs - xs.mean(0)) / xs.std(0); ys = (ys - ys.mean(0)) / ys.std(0)
for k in range(K):
    if spearmanr(xs[:, k], ys[:, k]).statistic < 0: ys[:, k] = -ys[:, k]

# THE EFFECT VIEW DECIDES WHERE A STRAIN STANDS.
#
# It used to be the average of the two views, and that average was a lie the
# page told every time you looked at it: standing in the middle, a weed between
# you and CREATIVE reads as a weed that makes you creative. Under the average,
# `rainbow` sat at cos 0.99 to focused and creative while being the most aroused
# strain in the corpus -- its smells (apricot, tropical, citrus) dragged it into
# the green country its effects have nothing to do with.
#
# The two views genuinely disagree, by a median 41 degrees and more than 90 for
# 12% of strains, so the average could be read as neither. Placed by the effect
# view alone, the nearest feeling names a strain's strongest effect 38% of the
# time against 31%, is in its top three 67% against 61%, and its top five 81%
# against 74%. rainbow lands on aroused at 0.99.
#
# Nothing is given up by dropping the flavour variate. This is the effect side
# of a JOINT fit, so it is already the part of effect space the smells can
# reach: a smell word, placed at the middle of the strains it names, points at
# the feeling it leads to a median 3 degrees away -- tighter than the 5 the
# average managed. Smell navigation gets better, not worse.
P = ys
P = P / np.abs(P).max()
log.info("agreement out of fold: %s", agree)

def region(scores):
    v = scores.dropna()
    return sorted(int(fl.index.get_loc(i)) for i in v[v >= v.quantile(2/3)].index)

def bottom(scores):
    v = scores.dropna()
    return sorted(int(fl.index.get_loc(i)) for i in v[v <= v.quantile(1/3)].index)

def place(scores):
    """Where a word lies: the middle of the strains it names."""
    return P[region(scores)].mean(0)

items = []
for w in words:
    idx = region(flm[w])
    items.append({"w": w, "kind": "smell", "in": idx,
                  "on": sorted(int(fl.index.get_loc(i)) for i in flm[w].dropna().index),
                  "p": [round(float(x), 4) for x in place(flm[w])]})
for e in ef.columns:
    idx = region(ef[e])
    items.append({"w": e, "kind": "feel", "in": idx,
                  "p": [round(float(x), 4) for x in place(ef[e])]})

# name each axis by the words at its ends -- these are the only signposts, so
# they carry both a smell and a feeling
# NOT normalised. Twelve of the thirteen feelings lean the same way, which
# leaves one side of the sphere thin. Projecting that shared direction out does
# spread them by the numbers -- mean resultant 0.628 to 0.139 -- but it flattens
# the arrangement onto a great circle, and from the middle that reads as every
# word strung along a single line. The lean is the shape of the thing; the price
# of keeping it is that some directions are emptier than others.

axes = []
for k in range(K):
    sm = pd.Series({i["w"]: i["p"][k] for i in items if i["kind"] == "smell"}).sort_values()
    fe = pd.Series({i["w"]: i["p"][k] for i in items if i["kind"] == "feel"}).sort_values()
    axes.append({"loSmell": ", ".join(sm.head(3).index), "hiSmell": ", ".join(sm.tail(3)[::-1].index),
                 "loFeel": ", ".join(fe.head(2).index), "hiFeel": ", ".join(fe.tail(2)[::-1].index),
                 "agree": agree[k]})
    log.info("axis %d (agree %.2f)\n    %s | %s\n    %s | %s", k + 1, agree[k],
             axes[k]["loSmell"], axes[k]["loFeel"], axes[k]["hiSmell"], axes[k]["hiFeel"])

# word positions sit in a small blob at the middle, because every region is
# wide and their means barely separate. The map is of the words, so it is
# scaled to the words -- strains get the SAME transform, keeping "you are here"
# in register with the labels. Width is reported as a number, not as scale.
WP = np.array([i["p"] for i in items])
k = float(np.abs(WP).max())
for i in items:
    i["p"] = [round(float(x) / k, 4) for x in i["p"]]
SP = P / k
log.info("word positions scaled up %.1fx to fill the frame; strains follow the same transform", 1/k)

# A mark's colour comes from the WHOLE profile, not from whichever effect ranks
# first: 27% of strains have their top two within 0.15, so an argmax colours a
# quarter of them on a coin toss. Blend every positive effect by weight instead.
ez_ = (ef - ef.mean()) / ef.std()
dom = {i: ez_.loc[n].idxmax() for i, n in enumerate(fl.index)}
rank = ef.rank(pct=True)
prof = {i: [int(round(9 * rank.loc[n, e])) for e in ef.columns]
        for i, n in enumerate(fl.index)}

import math as _m
_ehue = {}
for e in ef.columns:
    v = ef[e]
    idx = [fl.index.get_loc(i) for i in v[v >= v.quantile(2/3)].index]
    q = P[idx].mean(0)
    _ehue[e] = _m.atan2(q[1], q[0])          # same axis order the page uses
blend = {}
for i, n in enumerate(fl.index):
    vx = vy = 0.0
    for e in ef.columns:
        w = max(0.0, float(ez_.loc[n, e]))
        vx += w * _m.cos(_ehue[e]); vy += w * _m.sin(_ehue[e])
    blend[i] = round(_m.degrees(_m.atan2(vy, vx)) % 360, 1) if (vx or vy) else 0.0

json.dump({"axes": axes,
           "items": items,
           "strains": [{"n": str(n), "p": [round(float(x), 4) for x in SP[i]],
                        "e": dom[i], "r": prof[i], "bh": blend[i]}
                       for i, n in enumerate(fl.index)],
           "spread": [round(float(np.ptp(P[:, q])), 4) for q in range(K)],
           "total": len(fl),
           "effectOrder": list(ef.columns),
           "chance": {e: round(100 * len(region(ef[e])) / len(fl)) for e in ef.columns}},
          open(OUT + "navdata.json", "w"))

import numpy as _np
_U = _np.array([i["p"] for i in items if i["kind"] == "feel"], float)
_U = _U / _np.linalg.norm(_U, axis=1, keepdims=True)
log.info("feelings now spread: mean resultant %.3f (was 0.628; 0 = even over the sphere)",
         float(_np.linalg.norm(_U.mean(0))))
_pw = [_np.degrees(_np.arccos(_np.clip(_U[a] @ _U[b], -1, 1)))
       for a in range(len(_U)) for b in range(a + 1, len(_U))]
log.info("pairwise angles between feelings: min %.0f, median %.0f, max %.0f deg",
         min(_pw), _np.median(_pw), max(_pw))
log.info("\nwrote navdata.json, %d words, %d strains carried but not drawn",
         len(items), len(fl))
