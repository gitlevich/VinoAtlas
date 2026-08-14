# Weed space

You stand inside a space and turn your head. Every smell word and every effect
word is a direction. Weeds are objects in it. You find the state you want, face
it, and see which strains lie that way.

Live at [agent.farm/VinoAtlas/weed/](https://agent.farm/VinoAtlas/weed/).

## A sky and a field

The words are the **sky**. A word is a bearing and nothing else, so it hangs at
an unreachable remove, fixed, unmoved by anything you do. How sharply it marks
its bearing is its **magnitude**: a vague word is a faint star, not a distant
one. Nothing in the sky ever shifts, and that is what makes it usable as a
frame.

The weeds are a **field you stand in**. A weed has a direction *and* a radius —
the radius says how far its strongest effect stands above its own floor, so a
weed near the middle commits to nothing. Two fingers look around; a pinch moves
you through it.

The pair is the instrument, and it only works because **your eye is not on the
pivot**. A camera turning about its own optical centre gives no depth at any
radius — every point sweeps by the same angle, which is why a panorama stitches
from one. A head is not that camera: the eye rides forward of the neck, so
turning is a rotation *and* a small translation. Turning 2.3°, the near third of
the field slides 19.0px against the far third's 14.4 and the sky's 10.7.

`NECK` is that offset. It has a hard ceiling — it must stay shorter than the
nearest weed, or turning would swing your eye through your own data. The field
starts at 2.59, so 2.2 is as long as a neck can honestly be.

You cannot walk out, and what is bounded is the **eye**, which swings to
`STAND + NECK`. The emptiest direction holds 97 weeds with the eye at 2.2, 81 at
3.0, 65 at 3.8, and 27 at 5.2 — where 536 of 563 are behind you. Past about 3.8
the field has stopped surrounding you and become a clump you are looking at,
which is where first person ends.

The list on the left wears the sky's colours — a smell there and the same smell
out in the field are one thing, so it is recognised rather than read, and the
list also shows at a glance which smells lie together and which lie apart.

**A gesture that does not paint did not happen.** The first version of this
deferred drawing to the animation loop, which only runs while something glides
or coasts — so two fingers changed the state perfectly and the screen never
moved. Every handler paints directly now, and `acceptance_tests.js` has a
`settle()` that refuses to draw for the page, so a dead gesture fails loudly.

## Build

```bash
.venv/bin/python WeedSpace/navdata.py        # corpus  -> navdata.json
.venv/bin/python WeedSpace/build_horizon.py  # navdata -> horizon.html
cp WeedSpace/horizon.html docs/weed/index.html
```

`navdata.py` reads `data/lexicon/cannabis_strain_{flavor,effect}.parquet`, which
are not in the repo. It is deterministic: the same corpus gives a byte-identical
`navdata.json`, and that is what the tests rest on.

## Tests

```bash
.venv/bin/python -m pytest WeedSpace
```

53 tests over the data. `test_pipeline.py` checks navdata.json against the
parquet — which words are admitted, where each one sits, what each strain does.
`test_page.py` checks horizon.html against navdata.json — that direction
survives the move into the world, that colour follows direction, that a weed
wears the colour of the ground it stands on.

The other 30 are in `acceptance_tests.js` and need the page running, because
they are about moving through it:

```bash
python3 -m http.server 8787 --directory WeedSpace
```

then paste `acceptance_tests.js` into the console at
`localhost:8787/horizon.html`. They hold the claims a still image cannot: that
nothing appears or disappears as you turn, that labels are nailed to their
points, that the bars in a hover are the same spokes the sigil is drawn from.

Every test is named for the criterion it holds. The data is fixed, so a test
that passes today passes forever, and a change in the corpus is the only thing
that should ever break one.

## Where a weed stands is where its effects are

A weed used to sit at the *average* of the smell view and the effect view, and
that average was a lie the page told every time you looked at it: standing in
the middle, a weed between you and CREATIVE reads as a weed that makes you
creative. Under the average, `rainbow` sat at cos 0.99 to focused and creative
while being the most aroused strain in the corpus — its smells (apricot,
tropical, citrus) dragged it into green country its effects have nothing to do
with. The two views genuinely disagree, by a median 41°, so the average could be
read as neither.

Placed by the **effect view alone**:

| positioned by | top effect | top 3 | top 5 | smell→feeling hue gap |
|---|---|---|---|---|
| the average, as shipped | 31% | 61% | 74% | 5° |
| **the effect view** | **38%** | **67%** | **81%** | **3°** |
| chance | 8% | 23% | 38% | — |

Nothing is given up. This is the effect side of a *joint* fit, so it is already
the part of effect space the smells can reach — smell navigation gets tighter,
not looser. `rainbow` now stands on `aroused` at 0.99.

`test_a_weed_standing_nowhere_has_no_colour_to_be_given` names the 44 weeds that
sit square-on to every feeling. The blend that colours a weed weighs feelings by
how close they are; with nothing close, it returns the average of the whole
colour wheel — a fixed colour that says nothing about that weed. It is the
argmax bug in its other form: not a coin toss between two, but a mean of
everything.
