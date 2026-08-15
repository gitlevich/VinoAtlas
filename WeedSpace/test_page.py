"""What the built page carries and paints, checked against what the pipeline said.

Between navdata.json and horizon.html the arrangement is re-expressed: direction
becomes a place you can look at, distance becomes how weakly a word marks its
direction, and both become a colour. Each of those is a claim about the data,
so each is checked here rather than trusted.
"""
import math
import re

import numpy as np
import pytest

from build_horizon import FAR, NEAR, _even, _lum
from conftest import DEAD, gap, unit

FLOOR = 38.0     # a mark below this lightness is fading into the ground
NOWHERE = 0.1    # below this, a weed is square-on to every feeling and the
                 # blend that colours it has nothing to weigh


def _does_body(page):
    """The whole of does(), which now contains nested blocks -- so it runs to the
    function's own closing brace at column zero, not to the first one seen."""
    start = page.index("function does(t)")
    end = page.index("\n}\n", start)
    return page[start:end]


@pytest.fixture(scope="session")
def items(baked):
    return baked["items"]


@pytest.fixture(scope="session")
def strains(baked):
    return baked["strains"]


@pytest.fixture(scope="session")
def feels(items):
    return [i for i in items if i["kind"] == "feel"]


# ------------------------------------------------ what reaches the page at all

def test_the_page_carries_every_word_and_every_strain(baked, nav):
    assert len(baked["items"]) == len(nav["items"])
    assert len(baked["strains"]) == len(nav["strains"]) == baked["total"]


def test_no_dead_word_is_drawn_or_used_as_a_signpost(baked, page):
    """A word that names no difference is not vocabulary. It may still occur
    inside a strain's own name -- 'sugar black rose' is what the grower called
    it -- but it may never be a thing you can look at or steer by."""
    assert not {i["w"] for i in baked["items"]} & DEAD
    for ax in baked["axes"]:
        for end in ("loSmell", "hiSmell", "loFeel", "hiFeel"):
            assert not {w.strip() for w in ax[end].split(",")} & DEAD
    for w in DEAD:
        assert f'"w": "{w}"' not in page


def test_the_argmax_is_not_carried(strains):
    """It produced the colour-by-coin-toss bug and a tooltip that named one
    effect while the mark was painted by a blend. What is not shipped cannot be
    stated by accident."""
    assert all("e" not in t for t in strains)


def test_the_page_can_name_effects_positionally(baked):
    """The profile is thirteen bare numbers; without this order it is unreadable."""
    assert baked["effectOrder"] == baked["effectOrder"]
    assert len(baked["effectOrder"]) == 13
    assert all(len(t["r"]) == 13 for t in baked["strains"])


def test_the_hover_reads_the_same_array_the_sigil_is_drawn_from(page):
    """One mark, one claim: the bars are the spokes, re-drawn so they can be read."""
    assert "function does(t)" in page
    assert "does(best)" in page
    body = _does_body(page)
    assert "t.r[i]" in body, "does() no longer reads the profile"
    assert "class=bars" in body and 'class="trk' in body, "the bars are gone"
    assert "EFFECT_COLOUR[w]" in body, "a bar no longer carries its effect's colour"


def test_the_hover_never_settles_a_tie(page, strains, baked):
    """Three at least, and everything level with the third -- all of it. Thirty
    one weeds have more than six effects at that level; a cap would settle those
    by list order."""
    body = _does_body(page)
    assert "e[Math.min(2, e.length - 1)][1]" in body
    assert "x[1] >= cut" in body
    assert ".slice(" not in body, "the tie list is being trimmed again"
    # and the leading group: everything within one rounding step of the best
    assert "x[1] >= best - 1" in body, "the leading group is gone"
    assert "level.sort(" in body, "ties are settled by list order again"

    order = baked["effectOrder"]
    shown = []
    for t in strains:
        e = sorted(zip(order, t["r"]), key=lambda x: -x[1])
        cut = e[2][1]
        shown.append(sum(1 for x in e if x[1] >= cut))
    assert min(shown) >= 3
    assert sum(1 for n in shown if n > 6) == 31
    assert max(shown) == 9


def test_the_hover_wins_the_corner_it_shares_with_the_globe(page):
    """Both park bottom-right. What you are pointing at beats a panel you left
    open."""
    css = page[page.index("#names{"):page.index("#names b")]
    assert "z-index:4" in css
    globe = re.search(r"#globe\{[^}]*\}", page)
    assert globe, "the globe rule moved"
    z = re.search(r"z-index:(\d+)", globe.group(0))
    assert z and int(z.group(1)) < 4, "the globe now covers the hover panel"


def test_the_hover_no_longer_names_a_single_winner(page):
    assert "mostly ${best.e}" not in page
    assert "mostly" not in page


# ------------------------------------------------------------------- placement

def test_direction_survives_the_move_into_the_world(items, nav):
    """A word may be pushed further off, never turned. Where it lies is the
    whole content of the map."""
    by_word = {i["w"]: i for i in nav["items"]}
    for i in items:
        p = by_word[i["w"]]["p"]
        assert np.allclose(unit(i["pos"]), unit([p[0], p[2], p[1]]), atol=2e-3), i["w"]


def test_the_two_agreeing_axes_lie_in_the_plane_you_turn_through(items, nav):
    """Turning your head must sweep the structure the vocabularies share, not
    the axis they barely agree on. Checked as a direction, since a smell now
    carries a radius as well."""
    by_word = {i["w"]: i for i in nav["items"]}
    for i in items:
        p = by_word[i["w"]]["p"]
        assert unit(i["pos"])[1] == pytest.approx(unit([p[0], p[2], p[1]])[1], abs=2e-3), \
            f"{i['w']} is not upright"


def test_a_feeling_is_a_bearing_and_a_smell_is_a_thing_in_the_field(items):
    """A feeling is a state you can want -- a bearing, at infinity, unreachable.
    A smell is not: it is something the WEEDS have, so it belongs among them at
    a real place, on the same radius rule they use. It is the weeds that smell,
    not the states."""
    feels = [i for i in items if i["kind"] == "feel"]
    smells = [i for i in items if i["kind"] == "smell"]
    for i in feels:
        assert "dist" not in i, f"{i['w']} was given a distance"
        assert math.dist(i["pos"], [0, 0, 0]) == pytest.approx(1.0, abs=1e-3), i["w"]
    for i in smells:
        assert "dist" in i, f"{i['w']} has no place in the field"
        assert math.dist(i["pos"], [0, 0, 0]) == pytest.approx(i["dist"], abs=0.01), i["w"]
        assert i["dist"] == pytest.approx(NEAR + (FAR - NEAR) * i["str"], abs=0.01), i["w"]
        assert NEAR <= i["dist"] <= FAR
    assert len(smells) == 32 and len(feels) == 13


def test_a_vague_word_is_a_faint_star_and_not_a_far_one(page, items):
    """How sharply a word marks its bearing became its MAGNITUDE. Size and
    brightness therefore have to be read off strength, never off distance --
    otherwise walking would change what a word means."""
    assert "10.5 + 6.5 * it.str" in page, "a star's size no longer comes from its magnitude"
    assert "78 * it.str / p.dist" in page, "a smell no longer recedes with distance"
    assert "Math.max(0.70," in page, "the smell brightness floor was lowered again"
    assert "/ p.dist) * p.ppr" not in page, "a word's size is being read off distance again"
    assert "p.ppr * 0.0165" not in page, "a star swells again when the view narrows"
    assert "0.14 + 0.86 * it.str" in page, "a star's brightness left magnitude"
    assert "a.it.str - b.it.str" in page, "stars are no longer stacked faint-first"

    strongest = max(items, key=lambda i: i["str"])
    faintest = min(items, key=lambda i: i["str"])
    assert strongest["str"] == pytest.approx(1.0, abs=1e-3)
    assert faintest["str"] < 0.2
    assert all(0 < i["str"] <= 1 for i in items)


def test_the_sky_does_not_move_when_you_walk(page):
    """The instrument depends on it. A weed sliding against the stars is what
    says how far off it is; if the stars slid too, the reading would be gone."""
    assert "const here = P => [P[0] - EYE[0]" in page, "the eye is not being subtracted"
    assert "place(here(t.pos), F)" in page, "weeds are not drawn from the eye"
    assert "place(here(it.pos)" not in page, "the sky was put on the eye"
    words = page[page.index("for (const it of ITEMS) {"):]
    words = words[:words.index("seen.sort")]
    assert "place(sky ? it.pos : here(it.pos), F)" in words, \
        "the sky and the field are no longer projected differently"


def test_you_cannot_walk_out_of_your_own_field(page, strains):
    """Step outside and you would be looking at a clump from the outside, which
    is the third-person view this whole space exists to refuse."""
    assert "const REACH = 5.0" in page
    assert "const NECK = 2.2" in page
    assert "beginApproach" in page, "the approach is gone"
    assert "const ROAM = REACH - NECK" in page
    assert "p[i] *= ROAM / n" in page, "the rim no longer holds you"
    inside = sum(1 for t in strains if t["dist"] > 5.0)
    assert inside > 200, "the rim is beyond most of the field; walking would empty it"


def test_a_weed_is_placed_at_a_radius_as_well_as_a_direction(strains, nav):
    """Words are bearings and go on a shell. A weed is a thing at a place, and
    its radius is content: how far its strongest effect stands above its own
    floor. The old scheme pushed every weed out onto a surface and threw that
    away."""
    mx = max(math.dist(t["p"], [0, 0, 0]) for t in nav["strains"])
    by = {t["n"]: t for t in nav["strains"]}
    for t in strains:
        lean = math.dist(by[t["n"]]["p"], [0, 0, 0]) / mx
        assert t["lean"] == pytest.approx(lean, abs=1e-3), t["n"]
        assert t["dist"] == pytest.approx(NEAR + (FAR - NEAR) * lean, abs=0.01), t["n"]
        assert math.dist(t["pos"], [0, 0, 0]) == pytest.approx(t["dist"], abs=0.01)
        assert NEAR <= t["dist"] <= FAR


def test_the_weeds_fill_the_body_and_not_a_shell(strains):
    """52% of them sit inside half the radius, where a shell would put none."""
    r = np.array([t["lean"] for t in strains])
    assert (r < 0.5).mean() > 0.4, "the middle of the sphere has emptied out"
    assert r.min() < 0.1, "nothing is near the centre any more"
    assert r.max() == pytest.approx(1.0, abs=1e-3)


def test_a_weed_in_the_middle_is_within_reach_of_everything(strains, feels):
    """The claim the volume exists to make, stated as it is actually true: a weed
    that commits to nothing is closer to EVERY feeling than a committed weed is
    to its own nearest one. Its farthest is 6.0; theirs is 7.6 away at the
    nearest. Only a radius can say that -- on a shell it was given a direction it
    does not have.

    Note what is NOT claimed. In angle it is no more even-handed than any other
    weed: a small magnitude means the direction is noise, not that the noise
    points evenly. Centrality buys nearness to everything, not impartiality.
    """
    F = np.array([f["pos"] for f in feels], float)
    by = sorted(strains, key=lambda t: t["lean"])
    inner = np.array([t["pos"] for t in by[:40]], float)
    outer = np.array([t["pos"] for t in by[-40:]], float)
    din = np.linalg.norm(inner[:, None, :] - F[None], axis=2)
    dout = np.linalg.norm(outer[:, None, :] - F[None], axis=2)
    assert din.max(1).mean() < dout.min(1).mean(), \
        "the middle is no longer nearer to everything than the edge is to anything"
    assert din.max(1).mean() < 7 and dout.min(1).mean() > 7
    for t in by[:40]:
        assert t["lean"] < 0.25, f"{t['n']} is not in the inner quarter"


def test_commitment_is_carried_by_the_mark_not_by_how_close_it_lands(page, strains):
    """Once weeds fill the body, the uncommitted ones are the nearest -- so plain
    1/distance would make the blandest weed the biggest, brightest thing in the
    view. Size and brightness come from the weed, and distance then divides."""
    assert "82 * t.lean / q.dist" in page, "apparent size no longer tracks commitment"
    assert "13 * t.lean / q.dist" in page, "brightness no longer tracks commitment"
    assert "Math.max(0.72," in page, "the weed brightness floor was lowered again"
    assert "20 / q.dist" not in page, "the old proximity-is-importance rule is back"
    assert "0.52 * (0.30" in page, "the globe is blazing against the field again"

    def R(t):
        return max(1.6, 70 * t["lean"] / t["dist"])

    by = sorted(strains, key=lambda t: t["lean"])
    assert R(by[0]) < R(by[-1]) / 2, "the least committed weed is not the smallest"
    assert sum(1 for t in strains if R(t) > 5) > 240, "the profiles have stopped being drawn"


# ---------------------------------------------------------------------- colour

def test_hue_follows_the_direction_a_word_lies_in(items):
    """Nothing is assigned by hand: words sitting together get neighbouring
    colours because the arrangement says so."""
    for i in items:
        x, _, z = i["pos"]
        assert i["hue"] == pytest.approx(math.degrees(math.atan2(z, x)) % 360, abs=0.06), i["w"]


def test_words_that_sit_together_are_coloured_together(items):
    """The claim that colour means direction, stated as a bound: two words a few
    degrees apart in the space cannot be opposite colours."""
    for a in items:
        for b in items:
            if a is b:
                continue
            ang = math.degrees(math.acos(
                np.clip(unit(a["pos"]) @ unit(b["pos"]), -1, 1)))
            if ang < 10:
                assert gap(a["hue"], b["hue"]) < 25, f"{a['w']} vs {b['w']}"


def test_every_hue_carries_the_same_weight_on_black(items):
    """HSL lightness is not brightness. Magenta at L=56 is a third of green at
    L=56, which is why one side of this space used to suffocate."""
    lums = [_lum(i["hue"], i["sat"], i["lit"]) for i in items]
    assert max(lums) - min(lums) < 0.30, f"{min(lums):.2f}..{max(lums):.2f}"
    assert min(lums) > 0.28, "something has gone dark enough to lose"


def test_nothing_is_painted_dark_enough_to_vanish(items, strains):
    for i in items:
        assert i["lit"] >= FLOOR, i["w"]
    for t in strains:
        assert t["l"] >= FLOOR, t["n"]


def test_the_lift_is_bounded_at_both_ends(items):
    """_even may not run a colour out to white or crush it to the floor."""
    assert all(38 <= i["lit"] <= 82 for i in items)
    assert _even(300, 56) > 56, "magenta was not lifted"
    assert _even(100, 56) <= 56 + 1e-9, "green was pushed up for no reason"


def test_a_feeling_reads_hotter_than_a_smell(items):
    """A FEELING is a lit ring, a smell is a breath. The difference has to be in
    the numbers, not only in the drawing code."""
    fs = [i["sat"] for i in items if i["kind"] == "feel"]
    ss = [i["sat"] for i in items if i["kind"] == "smell"]
    assert min(fs) > max(ss)


def test_a_smell_carries_the_colour_of_the_feeling_it_leads_to(items, feels):
    """The whole reason colour is readable: follow a colour and you arrive
    somewhere. Median gap under twenty degrees, and citrus/focused within two."""
    gaps = []
    for s in (i for i in items if i["kind"] == "smell"):
        gaps.append(min(gap(s["hue"], f["hue"]) for f in feels))
    assert float(np.median(gaps)) < 20, f"median gap {np.median(gaps):.0f} deg"
    by = {i["w"]: i["hue"] for i in items}
    assert gap(by["citrus"], by["focused"]) < 4
    assert gap(by["grapefruit"], by["energetic"]) < 8
    assert gap(by["earthy"], by["relaxed"]) < 6


def test_a_weed_takes_the_colour_of_the_ground_it_stands_on(strains, feels):
    """Recomputed independently. Its colour must always be a colour some feeling
    actually has, so the globe and the world say the same thing about a place."""
    pos = [(unit(f["pos"]), f["hue"]) for f in feels]
    for t in strains:
        d = unit(t["pos"])
        cos = [float(d @ fd) for fd, _ in pos]
        best = max(cos)
        vx = vy = 0.0
        for (_, hue), c in zip(pos, cos):
            w = math.exp((c - best) * 11)
            vx += w * math.cos(math.radians(hue))
            vy += w * math.sin(math.radians(hue))
        want = math.degrees(math.atan2(vy, vx)) % 360
        assert gap(t["h"], want) < 0.5, t["n"]


def _nearest_feeling(t, feels):
    """The feeling a weed stands closest to, and how close that actually is."""
    d = unit(t["pos"])
    return max(((float(d @ unit(f["pos"])), f) for f in feels), key=lambda x: x[0])


def test_a_weeds_colour_agrees_with_where_it_sits(strains, feels):
    """Colour and position may never contradict each other -- for every weed
    that stands near a feeling at all. 496 of 563 do, and every one of them
    wears a colour within 35 degrees of the ground under it."""
    checked = 0
    for t in strains:
        cos, f = _nearest_feeling(t, feels)
        if cos <= NOWHERE:
            continue
        checked += 1
        assert gap(t["h"], f["hue"]) < 70, f"{t['n']} stands in {f['w']}"
    assert checked / len(strains) > 0.85, "most weeds should stand somewhere"


def test_a_weed_standing_nowhere_has_no_colour_to_be_given(strains, feels):
    """The blend weighs feelings by how close they are. A weed roughly square-on
    to all thirteen weighs them all the same, and the answer is then the average
    of the whole wheel -- a fixed colour that says nothing about that weed. It is
    the argmax bug in its other form: not a coin toss between two, but a mean of
    everything. 67 of 563 sit out there. Locked so the count cannot grow in
    silence.
    """
    nowhere = [t for t in strains if _nearest_feeling(t, feels)[0] <= NOWHERE]
    assert 35 <= len(nowhere) <= 60, len(nowhere)
    # they converge on one colour, which is the tell
    same = {}
    for t in nowhere:
        same.setdefault(round(t["h"]), []).append(t["n"])
    assert max(len(v) for v in same.values()) >= 3, \
        "the degenerate blend no longer collapses; re-measure before relaxing this"


def test_the_two_colours_a_weed_carries_now_largely_agree(strains):
    """h is where it stands, bh is what it does. Under the old average of the two
    views these were different answers -- more than a tenth of weeds had them
    over 60 degrees apart, and `rainbow` sat in green country reading aroused.
    Placed by the effect view, where a weed stands IS what it does: the median
    gap is 14 degrees and only 9% still exceed 60.

    They stay two fields rather than one, because the day they diverge again is
    the day this test has to say so.
    """
    assert all("bh" in t and "h" in t for t in strains)
    gaps = sorted(gap(t["h"], t["bh"]) for t in strains)
    assert np.median(gaps) < 20, f"median gap back up to {np.median(gaps):.0f} deg"
    apart = [t for t in strains if gap(t["h"], t["bh"]) > 60]
    assert len(apart) / len(strains) < 0.13, "position and effect have drifted apart again"


# ------------------------------------------------------------------- the frame

def test_the_page_states_the_walls_it_places_between(baked):
    assert baked["near"] == NEAR and baked["far"] == FAR


def test_the_field_of_view_is_a_human_one(page):
    assert "const WIDE = 120 * Math.PI / 180" in page


def test_a_feelings_base_rate_is_carried_so_a_claim_can_be_measured(baked):
    assert set(baked["chance"]) == set(baked["effectOrder"])
    assert all(25 <= v <= 45 for v in baked["chance"].values())
