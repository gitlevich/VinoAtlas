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

    python3 app/build.py

## Tests

Serve the standalone copy and evaluate `acceptance_tests.js` in the page:

    python3 -m http.server 8471
    # in the page console:
    fetch('/acceptance_tests.js').then(r => r.text()).then(src => eval(src))

Every test name states an acceptance criterion.
