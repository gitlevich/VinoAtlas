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

The weeds are a **field you move through**. A weed has a direction *and* a
radius — the radius says how far its strongest effect stands above its own
floor, so a weed near the middle commits to nothing and is within reach of every
feeling. Two fingers walk you through it; a pinch narrows the view.

The pair is the instrument. From a fixed point a ball and a shell look
identical — rotation gives no depth at any radius. It is the **parallax**, a
weed sliding against a sky that does not, that says how near it is and what
stands behind what. Measured: walking 1.2 units moves the stars 0.000px while
near weeds sweep 45px and far ones 26px.

You cannot walk out. Past a radius of 3 the field stops surrounding you and
becomes a clump you are looking at — the emptiest direction holds 123 weeds at
radius 2, 86 at 3, and 11 at 6.4, by which point 536 of 563 are behind you. The
rim is where first person ends.

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

The other 23 are in `acceptance_tests.js` and need the page running, because
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

## Two tests that hold a defect rather than a promise

`test_position_is_a_compromise_not_a_statement_of_effect` locks the agreement
between where a weed stands and what it does at 31%. A weed sits at the average
of the smell view and the effect view, and those two disagree by a median 41
degrees. The number is well above the 8% you would get by chance and nowhere
near a claim, so it is pinned: if it moves, someone changed what the page says
about place, and they meant to.

`test_a_weed_standing_nowhere_has_no_colour_to_be_given` names the 67 weeds that
sit square-on to every feeling. The blend that colours a weed weighs feelings by
how close they are; with nothing close, it returns the average of the whole
colour wheel — a fixed colour that says nothing about that weed. It is the
argmax bug in its other form: not a coin toss between two, but a mean of
everything.
