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
  nothing the reader does moves them. The globe carries the ones behind you.
- An **aroma** is not a bearing: cedar is something wines have. The 54 words that
  survive the screen stand among the glasses, at the middle of the wines the
  catalogue describes that way.
- A **wine** is a glass at a place. What is in the bowl is the colour of the
  wine — reds purple through ruby to brick as they age, whites pale straw to
  amber, rosés salmon to onion skin — and a sparkling wine is a flute, because
  half of those are white and half are red and a colour cannot say both. The stem
  takes the colour of the ground it stands on. How far out it stands is how far
  it is from middling, so the middle of the shop is where the unremarkable wines
  are and you are standing in it.

**On moving.** Turning is measured in fields, not in pixels: a drag across the
pane turns you by one and a half of whatever you can see, which is 7.8° per
hundred pixels at rest and 0.9° at the closest the view goes. A fixed
radians-per-pixel made the same drag sweep eight times further leaned in than
leaned out. Walking glides — a pinch sets where you are heading and the view
eases there, so the motion is made of time rather than of the wheel's event
stream. The rim is 3.8 from the middle and the field closes to 9°.

**The sommelier can do all of it.** Parity: `{"atlas": {...}}` turns the head
(`face` a pole, a word or a wine; `faceTo` a bearing), sets how close he is
looking (`zoom` 0 to 1), `walk`s him forward or back, `tick`s and `unticks`
words, `point`s at a bottle and opens its card, folds either panel, and fills the
screen. It cannot mark a wine right or wrong — that is his, everywhere on this
page. `{"tour": true}` stands him at each of his ten orders in turn, oldest to
newest, saying what moved between each and what it adds up to; it is offered as a
chip in the sommelier whenever the Atlas is open.

**On the crowd.** 1,652 glasses is a lot to be standing among, and three things
answer it. The view **opens at 74°** rather than the 120° a head takes in, which
is two and a half times fewer marks at once and a quarter more size on each — and
size is where the colour of the wine lives. **Fill the screen** (top left, or F)
puts the same shop in the whole window. And **ticking a word lights the wines
described that way and quiets the rest**: cedar leaves 173 lit out of 1,652. The
quiet ones do not go away — a shop you cannot see past is still the shop.

**What is not drawn.** The five measures were once arcs across the sky, each
carrying its own name, all five crossing where the middle of the shop is. True,
well founded, and it read as a starburst laid over the thing it was framing. Gone,
and its data with it.

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

Every test name states an acceptance criterion. **104 of 104 pass**; the four that
do not are the open design question below, not defects.

The Atlas also has a pipeline suite, which rebuilds the whole arrangement from
the catalogue by a second route and checks every claim the page makes about it:

    .venv/bin/python -m pytest WineAtlas/test_atlas.py -q      # 29 pass

## Settled

With taste as a range there is no separate point, so a request naming a single
value used to land silently on any measure left wide open. It now takes the width
of his own bottles in the type that is open — the same span the reset button uses
— and centres that on the named value, so nothing is invented and no width is
chosen by us. A measure already narrowed keeps the width he gave it.
