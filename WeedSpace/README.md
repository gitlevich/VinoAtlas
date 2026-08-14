# Weed space

You stand at the centre of a space and turn your head. Every smell word and
every effect word is a direction. Weeds are objects in it. You find the state
you want, face it, and see which strains lie that way.

Live at [agent.farm/VinoAtlas/weed/](https://agent.farm/VinoAtlas/weed/).

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

49 tests over the data. `test_pipeline.py` checks navdata.json against the
parquet — which words are admitted, where each one sits, what each strain does.
`test_page.py` checks horizon.html against navdata.json — that direction
survives the move into the world, that colour follows direction, that a weed
wears the colour of the ground it stands on.

The other 18 are in `acceptance_tests.js` and need the page running, because
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
