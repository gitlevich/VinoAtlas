"""Every claim navdata.json makes about the corpus, checked against the corpus.

The geometry is recomputed here from the parquet rather than imported from
navdata.py, so these are two independent statements of the same thing. A shared
helper would only prove the code equals itself.
"""
import math

import numpy as np
import pandas as pd
import pytest
from scipy.stats import spearmanr
from sklearn.cross_decomposition import CCA

from conftest import COVERAGE, DEAD, region, unit

K = 3


@pytest.fixture(scope="session")
def space(tables):
    """The arrangement, rebuilt from scratch: word list, strain positions, scale."""
    fl, ef = tables
    flm = fl.replace(0.0, np.nan)
    words = [c for c in fl.columns
             if flm[c].notna().mean() >= COVERAGE and c not in DEAD]

    X = flm[words].fillna(flm[words].median()).to_numpy(float)
    Y = ef.to_numpy(float)
    X = (X - X.mean(0)) / X.std(0)
    Y = (Y - Y.mean(0)) / Y.std(0)
    m = CCA(n_components=K, max_iter=2000).fit(X, Y)
    xs, ys = m.transform(X, Y)
    xs = (xs - xs.mean(0)) / xs.std(0)
    ys = (ys - ys.mean(0)) / ys.std(0)
    for k in range(K):
        if spearmanr(xs[:, k], ys[:, k]).statistic < 0:
            ys[:, k] = -ys[:, k]
    P = (xs + ys) / 2
    P = P / np.abs(P).max()

    def place(scores):
        return P[region(scores, fl.index)].mean(0)

    # The scale comes off the word positions as they are WRITTEN -- rounded to
    # four places -- so it is reproduced that way here. Getting this wrong moves
    # every strain by a couple of ten-thousandths, which is exactly the size of
    # error a register test exists to catch.
    WP = np.round([place(flm[w]) for w in words]
                  + [place(ef[e]) for e in ef.columns], 4)
    k = float(np.abs(WP).max())
    return dict(fl=fl, ef=ef, flm=flm, words=words, P=P, k=k,
                xs=xs, ys=ys, place=place)


# ---------------------------------------------------------------- vocabulary

def test_every_drawn_word_is_a_column_of_the_source_tables(nav, tables):
    """Nothing in the space was invented; each word is a measured score."""
    fl, ef = tables
    known = set(fl.columns) | set(ef.columns)
    for i in nav["items"]:
        assert i["w"] in known, f"{i['w']} is drawn but was never measured"


def test_no_dead_word_reaches_the_space(nav):
    """rose, sage, spicyHerbal and tobacco fail the bearing test and are out."""
    drawn = {i["w"] for i in nav["items"]}
    assert not (drawn & DEAD)


def test_every_smell_is_scored_on_enough_strains(nav, space):
    """Below the coverage floor a word describes too few strains to place."""
    for i in nav["items"]:
        if i["kind"] == "smell":
            assert space["flm"][i["w"]].notna().mean() >= COVERAGE


def test_the_word_list_is_exactly_what_the_rule_admits(nav, space):
    """No extras, no omissions: the filter is the whole of the selection."""
    drawn_smells = {i["w"] for i in nav["items"] if i["kind"] == "smell"}
    drawn_feels = {i["w"] for i in nav["items"] if i["kind"] == "feel"}
    assert drawn_smells == set(space["words"])
    assert drawn_feels == set(space["ef"].columns)


def test_the_space_holds_thirty_two_smells_and_thirteen_feelings(nav):
    """The shape of the vocabulary, locked. A change here is a change of corpus."""
    kinds = pd.Series([i["kind"] for i in nav["items"]]).value_counts()
    assert kinds["smell"] == 32
    assert kinds["feel"] == 13


def test_effect_order_names_every_effect_once(nav, tables):
    """The profile is read positionally, so this order is load-bearing."""
    _, ef = tables
    assert nav["effectOrder"] == list(ef.columns)
    assert len(set(nav["effectOrder"])) == len(nav["effectOrder"])


# ------------------------------------------------------------------ geometry

def test_a_word_sits_at_the_middle_of_the_strains_it_names(nav, space):
    """The claim the whole map rests on: position is the region's centre."""
    scores = {**{w: space["flm"][w] for w in space["words"]},
              **{e: space["ef"][e] for e in space["ef"].columns}}
    for i in nav["items"]:
        want = space["place"](scores[i["w"]]) / space["k"]
        assert np.allclose(i["p"], want, atol=2e-4), i["w"]


def test_a_region_is_the_top_third(nav, space):
    """Not a hand-picked set: everything at or above the two-thirds quantile."""
    fl = space["fl"]
    for i in nav["items"]:
        if i["kind"] != "feel":
            continue
        v = space["ef"][i["w"]]
        assert i["in"] == region(v, fl.index)
        assert 0.30 <= len(i["in"]) / len(fl) <= 0.40


def test_strains_and_words_share_one_transform(nav, space):
    """'You are here' must be in register with the labels, or the map lies."""
    want = space["P"] / space["k"]
    got = np.array([t["p"] for t in nav["strains"]])
    assert np.allclose(got, want, atol=2e-4)


def test_the_reported_spread_is_the_spread(nav, space):
    for q in range(K):
        assert nav["spread"][q] == pytest.approx(
            float(np.ptp(space["P"][:, q])), abs=2e-4)


def test_the_axes_are_named_by_the_words_at_their_ends(nav):
    """Signposts are read off the arrangement, never chosen."""
    for k, ax in enumerate(nav["axes"]):
        sm = pd.Series({i["w"]: i["p"][k] for i in nav["items"]
                        if i["kind"] == "smell"}).sort_values()
        fe = pd.Series({i["w"]: i["p"][k] for i in nav["items"]
                        if i["kind"] == "feel"}).sort_values()
        assert ax["loSmell"] == ", ".join(sm.head(3).index)
        assert ax["hiSmell"] == ", ".join(sm.tail(3)[::-1].index)
        assert ax["loFeel"] == ", ".join(fe.head(2).index)
        assert ax["hiFeel"] == ", ".join(fe.tail(2)[::-1].index)


def test_an_axis_carries_both_a_smell_and_a_feeling_at_each_end(nav):
    """A pole named by one vocabulary alone is not a shared distinction."""
    for ax in nav["axes"]:
        for end in ("loSmell", "hiSmell", "loFeel", "hiFeel"):
            assert ax[end].strip(), f"{end} unnamed"


# ------------------------------------------------------------------- strains

def test_the_strain_count_is_stated_correctly(nav, space):
    assert nav["total"] == len(space["fl"]) == len(nav["strains"])


def test_every_strain_is_named_once(nav):
    names = [t["n"] for t in nav["strains"]]
    assert len(set(names)) == len(names)


def test_the_profile_is_the_percentile_rank_of_each_effect(nav, space):
    """The spokes of a sigil are this array; it must be what it says it is."""
    rank = space["ef"].rank(pct=True)
    order = nav["effectOrder"]
    for t, name in zip(nav["strains"], space["fl"].index):
        want = [int(round(9 * rank.loc[name, e])) for e in order]
        assert t["r"] == want, name


def test_every_spoke_is_on_the_scale_it_is_drawn_on(nav):
    for t in nav["strains"]:
        assert len(t["r"]) == len(nav["effectOrder"])
        assert all(0 <= v <= 9 for v in t["r"])


def test_chance_is_the_share_of_strains_a_feeling_names(nav, space):
    """The readout compares against this, so it has to be the real base rate."""
    for e, pct in nav["chance"].items():
        assert pct == round(100 * len(region(space["ef"][e], space["fl"].index))
                            / len(space["fl"]))


def test_the_effect_colour_of_a_strain_comes_from_its_whole_profile(nav, space):
    """bh must be the weighted blend, never an argmax: a quarter of these
    strains have their top two within a rounding step."""
    ef, fl, P = space["ef"], space["fl"], space["P"]
    ez = (ef - ef.mean()) / ef.std()
    hue = {}
    for e in ef.columns:
        v = ef[e]
        idx = [fl.index.get_loc(i) for i in v[v >= v.quantile(2 / 3)].index]
        q = P[idx].mean(0)
        hue[e] = math.atan2(q[1], q[0])
    for t, name in zip(nav["strains"], fl.index):
        vx = vy = 0.0
        for e in ef.columns:
            w = max(0.0, float(ez.loc[name, e]))
            vx += w * math.cos(hue[e])
            vy += w * math.sin(hue[e])
        want = round(math.degrees(math.atan2(vy, vx)) % 360, 1) if (vx or vy) else 0.0
        assert t["bh"] == pytest.approx(want, abs=0.15), name


# --------------------------------------------------- the two views, and their gap

def test_the_two_views_agree_out_of_fold(nav):
    """If they did not, joining them into one space would be meaningless.

    They agree 0.71, 0.52, 0.21 on held-out strains. The two strong ones are the
    ones the page lays into the horizontal plane, so turning your head sweeps
    the structure the two vocabularies actually share; the weak third becomes up
    and down, where looking is deliberate and rare.
    """
    agree = [ax["agree"] for ax in nav["axes"]]
    assert all(a > 0 for a in agree)
    assert agree == sorted(agree, reverse=True), "axes are not in order of strength"
    assert agree[0] >= 0.65 and agree[1] >= 0.45, agree
    assert agree[2] < agree[1] / 2, "the third axis is no longer the weak one"


def test_position_is_a_compromise_not_a_statement_of_effect(space):
    """THE OPEN DEFECT, held at its measured size so it cannot quietly drift.

    A strain sits at the average of the smell view and the effect view. Those
    two disagree by a median 41 degrees, so the nearest feeling to where a
    strain stands names its strongest effect only about a third of the time --
    well above the 8% you would get by chance, and nowhere near a claim. If this
    number moves, the page has started saying something different about place
    and someone chose to make it do that.
    """
    fl, ef, P, k = space["fl"], space["ef"], space["P"], space["k"]
    feel = np.array([space["place"](ef[e]) / k for e in ef.columns])
    feel = np.array([unit(f) for f in feel])
    top = ((ef - ef.mean()) / ef.std()).to_numpy().argmax(1)
    hit = 0
    for i in range(len(fl)):
        nearest = int(np.argmax(feel @ unit(P[i] / k)))
        hit += nearest == top[i]
    rate = hit / len(fl)
    assert 0.28 <= rate <= 0.34, f"agreement moved to {rate:.0%}"


def test_the_smell_view_and_the_effect_view_genuinely_disagree(space):
    """The reason the compromise is a compromise, measured."""
    ang = []
    for a, b in zip(space["xs"], space["ys"]):
        ang.append(math.degrees(math.acos(np.clip(unit(a) @ unit(b), -1, 1))))
    assert 35 <= float(np.median(ang)) <= 47
    assert 0.08 <= float(np.mean(np.array(ang) > 90)) <= 0.16
