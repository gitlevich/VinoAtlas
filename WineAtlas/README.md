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

**The sommelier can do all of it.** Parity: the `atlas` tool turns the head
(`face` a pole, a word or a wine; `faceTo` a bearing), sets how close he is
looking (`zoom` 0 to 1), `walk`s him forward or back, `tick`s and `unticks`
words, `point`s at a bottle and opens its card, folds either panel, and fills the
screen. It cannot mark a wine right or wrong — that is his, everywhere on this
page. The `tour` tool stands him at each of his ten orders in turn, oldest to
newest, saying what moved between each and what it adds up to; it is offered as a
chip in the sommelier whenever the Atlas is open.

It used to answer with a blob of hand-written JSON carrying both its sentence and
its move, and nothing checked the blob: `atlas` was documented at the top level
and read one level down, so it said it was turning the Atlas and the Atlas did
not turn. Not an error — silence. Saying and doing were one act, so there was
nothing to disagree with. They are real tool calls now, and the turn is a loop:
it calls a control, the page answers with what it then shows, and only when it
stops calling does it have the last word. A move it merely described is not
possible, because there is nothing to describe until the call has been made.

**Both panels come with it.** The words are what the view is written in and the
sommelier can drive every control in it, so neither is left behind on the full
screen: each becomes a drawer on the side it holds on the page, and both stand
the same height. The globe stands aside for the sommelier rather than being sat
on, unless the reader has dragged it somewhere himself.

**A panel folds the same way wherever it stands.** The chevron in its own head
closes it, and the rail it leaves behind — the full height of the drawer, at the
edge it folded into, carrying its name — opens it again. Both were at first
replaced on the full screen by a toggle in the bar, and both replacements failed
in the same way: first the question was how to fold anything at all, then that
they would not come back. A 26-pixel button in the corner of a very large
picture is easy to say and easy to miss. The bar toggles stay as well, each
carrying that same chevron and pointing the way its panel is about to go — away
while it is open, out from the edge while it is shut — because a button that
says only its own name reads as something to do, not as something that is on or
off. Against the shop, which is black, the rail carries its own ground; a
panel-coloured strip on black is a way back nobody finds.

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

The wrapped copies carry a tab icon: the shop's own glass, poured to the line,
built by `favicon()` from the same ratios `glass()` draws every wine with. The
ratios are copied into `GLASS` in build.py rather than shared — atlas.js is
handed to the browser, not to Python — so `test_the_tab_icon_is_the_glass_the_
shop_is_drawn_with` holds the copy against the original and names the ratio if
one moves. It is an SVG in the page itself, so there is no second file to lose
and no request to make. The two things a glass takes from where it stands — the
wine's own colour and the ground under it — an icon for the whole shop cannot
have, so it wears a red from the middle of the range `pour()` spans and a
neutral for the vessel.

It is drawn twice, because **Safari does not take an SVG icon** — and will not
take a declared one at all while the *host* has a `favicon.ico` of its own, which
`agent.farm` does. So the page offers `icon.png` first, written beside it by the
build, and the SVG second, inline. Nothing is drawn twice by hand — `glass_parts()` hands over the bowl's two
cubics, the line the wine stands at, the streak of light, the stem and the foot,
and `glass_svg()` and `glass_raster()` are two readings of the same numbers.

`glass_parts()` places one at any size anywhere, which is how the landing page
sets a glass beside the weed space's leaf — `scripts/landing_icon.py`, tested in
`scripts/test_landing_icon.py`. The rasteriser itself is `scripts/raster.py`:
fills, strokes, clips, gradients and a PNG writer, about two hundred lines and
no new dependency, held by `scripts/test_raster.py`.

## Publish

    python3 WineAtlas/build.py && git add docs && git commit && git push

The page carries a build stamp: `const BUILD=` is a hash of its own bytes, so a
served page can be asked which build it is holding — in the console,
`document.documentElement.dataset.build`.

## The page

The page is the window. It was capped at 1400 and centred, which on a wide screen
spent a quarter of the glass on margin either side while the shop inside it was
cramped. Reading measure is held where reading happens and only there — the one
tab that is all prose fills the width by standing its cards side by side, each
column its own readable width, rather than by running a line of body text
eighteen hundred pixels across. The Atlas takes the rest of the window's height
too: what stands above it is measured rather than guessed at, because the lede
rewraps with the width and no constant survives that.

Two things broke on the way. A chart whose `viewBox` was a constant is scaled by
the browser to whatever width its row has, so on a wide window every numeral in
it came out three and a half times too big, drawn across the labels beside it;
it is measured first now, and one unit is one pixel. And an id selector beats
`section[hidden]`, so the tab styled by its id never closed and stood under every
other one.

**The panels are equal, and the reader sets them.** They opened at 280 and 330,
which were not chosen so much as written down in that order. Both grids that
have a shop between two panels now open equal, and a grip stands in the gap
either side: drag it, or nudge it with the arrow keys, and the width is
remembered per grid. The sommelier is one element that moves between the Find
tab's grid and the Atlas's, so its grip asks which grid it is standing in at the
moment it is dragged — each keeps its own width.

## The sommelier's setup

Two houses, Anthropic and OpenAI, chosen from a dropdown that says which of them
already holds a key. **Each keeps its own key and its own model**; switching
between them switches between two saved settings and touches neither. There was
one slot for both, and pasting an OpenAI key to try ChatGPT wrote over the
Anthropic one — which reads as neither of them working.

Forgetting a key takes two clicks. The × sits dimmed; the first click arms it
red — red means armed and nothing else — and the second, while it is red,
forgets it. Moving off the row forgives it, and so does Escape. Nothing
destructive here acts on one click.

A refusal carries what the other end said. `HTTP 400` alone made a model that
cannot take tools, a context overrun and a wrong key read alike, and none could
be acted on.

## Inhabiting it

The sommelier in the panel and a driver standing outside the page are the same
kind of visitor: both want to know what is on the screen and to press what the
reader can press. They are given one surface, not two. The catalogue below is
the catalogue sent to the model; the runner is the runner its calls go through;
the observation is the observation it reads. A tool that works here works there,
and a tool that rots here rots there, visibly.

There is no sidecar to poll — this page is one file and is served as one file —
so the transport is the page itself. Evaluate against the global:

    inhabit.guide()              // what this is, and every tool with its schema
    inhabit.observe()            // what the reader is looking at, in words
    inhabit.call(name, input)    // press one, and read back what the page shows
    inhabit.ask(text)            // put words to the sommelier and let it drive

`guide()` is the front door: it names the tools and their schemas out of the
live catalogue, so it cannot drift from what the model is actually offered.
Marking a wine right or wrong, and Reset, have no tool. His marks are the
measurement.

Every call answers with the page's own observation, so the result and the new
state are one thing. The reading of the Atlas is of where he is *being taken* —
turning, walking and the field are eased over frames, and a reading taken the
instant a move is asked for is a reading of the move before it.

## Tests

Serve the repo root and evaluate `acceptance_tests.js` in the page:

    python3 -m http.server 8471
    # open http://127.0.0.1:8471/cellar_compass_standalone.html, then in its console:
    fetch('/WineAtlas/acceptance_tests.js').then(r => r.text()).then(src => eval(src))

Every test name states an acceptance criterion. **121 of 121 pass.**

The Atlas also has a pipeline suite, which rebuilds the whole arrangement from
the catalogue by a second route and checks every claim the page makes about it:

    .venv/bin/python -m pytest WineAtlas/test_atlas.py -q      # 34 pass

## Settled

With taste as a range there is no separate point, so a request naming a single
value used to land silently on any measure left wide open. It now takes the width
of his own bottles in the type that is open — the same span the reset button uses
— and centres that on the named value, so nothing is invented and no width is
chosen by us. A measure already narrowed keeps the width he gave it.
