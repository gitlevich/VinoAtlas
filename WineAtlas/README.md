# Cellar Compass

One page for one reader: Mark's account at Royal Wine Merchants (1,652 wines in
the shop, 232 on his account), read through the five measures a tasting panel
ranks the same way — body, tannin grip, oak, fruit character, age.

## The model

His taste is **a range, per type of wine**. His buying splits into four types;
for each, along each measure, his bottles occupy a span. That span is his taste
in that type. Nothing is averaged anywhere — an average across types describes
a wine he has never bought.

The chart draws the range; the sliders hold the same range; they are one thing
seen twice. The list is ordered by nearness to the middle of the ranges, and
only wines inside every range are shown.

## The Atlas tab

The same shop as a place you stand in. The five measures are reduced to three
dimensions — which holds 88.8% of them — and the reader is put in the middle.

Three kinds of thing live there, and the difference between them is the design.

- A **pole** is a bearing and nothing else. "Older", "more oaked" is a direction
  you face, never a place you arrive at, so the ten of them hang at infinity and
  nothing the reader does moves them. Each measure is one straight line through
  the middle of the shop, drawn in the gradient of its own slider and carrying
  its own name along it, so a line you can see is a line you can read.
- An **aroma** is not a bearing: cedar is something wines have. The 54 words that
  survive the screen stand among the glasses, at the middle of the wines the
  catalogue describes that way.
- A **wine** is a glass at a place. What is in the bowl is the colour of the
  wine; the stem takes the colour of the ground it stands on. How far out it
  stands is how far it is from middling, so the middle of the shop is where the
  unremarkable wines are and you are standing in it.

**Which way is up is chosen, and by a rule**: up goes where the five measures
point least. What comes out is age — body, tannin, oak and fruit move together,
so any plane holding those four leaves age square to it. Turning your head runs
through style; looking up and down is age, old overhead.

**A word earns its place** by landing somewhere a shuffle would not: the wines
carrying it must sit further off centre than the same number drawn at random.
That is what keeps "balanced", "elegant" and "forest floor" out without anyone
having to rule on them, and it is why "red fruits" is out too — in a shop that is
four fifths red, red fruit is the default and carries no direction at all.

**The eye rides a neck ahead of where you stand.** A camera turning on its own
optical centre gives no depth: every point sweeps by the same angle whatever its
distance. Offset it and near glasses slide past far ones while the sky holds
still. Over a 2.3 degree turn a glass at 4.0 slides 42.3 pixels, one at 11.0
slides 25.8, and the sky slides 20.4; take the neck away and all three read
20.436.

## Build

    .venv/bin/python WineAtlas/atlas.py     # only when the catalogue changes
    .venv/bin/python WineAtlas/build.py

Writes three copies of the same page: `cellar_compass.html` (bare),
`cellar_compass_standalone.html` (wrapped, for opening from disk), and
`docs/wine/index.html` — the one GitHub Pages serves at
`agent.farm/VinoAtlas/wine`. The first two are ignored by git; the published
one is committed, because Pages serves what is in the repo.

## Publish

    python3 WineAtlas/build.py && git add docs && git commit && git push

The page carries a build stamp: `const BUILD=` is a hash of its own bytes, so a
served page can be asked which build it is holding — in the console,
`document.documentElement.dataset.build`.

## Tests

Serve the repo root and evaluate `acceptance_tests.js` in the page:

    python3 -m http.server 8471
    # open http://127.0.0.1:8471/cellar_compass_standalone.html, then in its console:
    fetch('/WineAtlas/acceptance_tests.js').then(r => r.text()).then(src => eval(src))

Every test name states an acceptance criterion. **80 of 84 pass**; the four that
do not are the open design question below, not defects.

The Atlas also has a pipeline suite, which rebuilds the whole arrangement from
the catalogue by a second route and checks every claim the page makes about it:

    .venv/bin/python -m pytest WineAtlas/test_atlas.py -q      # 27 pass

## Open

With taste as a range there is no separate point, so a request naming a single
value has nothing to move. Four acceptance tests fail on exactly this and it
needs a ruling, not a fix.
