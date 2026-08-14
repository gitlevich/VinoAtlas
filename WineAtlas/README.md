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

## Build

    python3 WineAtlas/build.py

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

Every test name states an acceptance criterion.
