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

The strip along the bottom names what lies the way you are facing, and it names
smells and feelings in one breath. Each word carries the mark it already wears
out in the world — three rising waves, or a nebula — because until it did, the
only things telling the two apart were a wider gap and their colour, and colour
here means *direction*, not kind. Two words the same shade can be different
kinds of thing entirely: read the line and you could not tell whether you were
being told the jar smells of honey or that the weed will make you giggly.

The glyph says kind and nothing else. Out there a wave's waver says how weakly a
word holds its bearing and a nebula's heart says how sharply; at fourteen pixels
that is noise. Two proportions are opened out from the sky's for the same reason
the page draws a far-off weed with three leaflets instead of seven: below a size,
holding the ratio costs the shape.

The list on the left wears the sky's colours — a smell there and the same smell
out in the field are one thing, so it is recognised rather than read, and the
list also shows at a glance which smells lie together and which lie apart.

## The globe

The corner carries the sphere you are standing inside, seen from outside, with
your heading always at the centre of the disc — so dragging it is the same act
as turning your head, and double-clicking a place on it turns you to face there.
It is the only view that shows what is behind you, which is the whole reason to
keep one.

**It is a wireframe, and the cage is neutral.** Painted solid it was a mood:
thirteen regions averaged into a wash over two thirds of its panel, eleven times
brighter than the world beside it, and nothing on it could be pointed at. A cage
says the two things a globe is for. It is a *sphere* — the meridians crowd at
the silhouette and the parallels bow, which no flat disc does — and it has a
*front and a back*, so a feeling you are turned away from is shown as being
behind you rather than left off. Twelve meridians, right the way round; a
meridian covers one longitude, so half of them leaves half the ball bare. The
equator is the horizon.

**The colour lives on thirteen little spheres and nowhere else.** Facing you:
filled, ringed, lit from the upper left. Round the back: the same sphere at two
fifths, which is what you see of something through a globe rather than in front
of it. **The name comes on hover**, one at a time, and says when what you are
pointing at is behind you — thirteen labels nailed to a postage-stamp ball
covered the thing they were labelling.

**What you can see is a window cut in the ball**, not a circle floating in the
middle of it. The bearings inside your field are a cap *of* the sphere, so the
ground outside is veiled — you are not looking there — and the edge carries a
soft band either side of a crisp line, the way the rim of a lens does.

This is the Wine Atlas globe, ported. Both spaces are the same instrument, and
the reader who has learned one should not have to learn the other.

## A weed you already know

The rest of the panel runs one way — from what is in the jar, or from the state
you want, out to the weeds that lie that way. Naming one runs the other way. You
arrive holding the name and what you lack is the place, so typing it turns you
to face it and leaves it ringed, and from there it is read like any other place:
what it stands near, what country it is in, what else lies that way.

It is a **rotation and nothing else**. Walking would change what stands in front
of what, and the question a name asks is a bearing from where you already are.
The mark then stays until you clear it, because the thing you came for is not
which one it is — you knew that — but what is around it, and that is asked by
turning away and coming back.

The ring is drawn in no colour this space uses. Every part of how a weed is
drawn already carries a claim — green that it is a weed, lightness how far it
commits, the accent the ground it stands on — so a mark made from any of them
would say something false about the weed in order to say something true about
your search. The ring belongs to you, not to it. Its name is drawn at any width,
where every other strain name has to earn its place by your leaning in: a weed
you asked for by name and cannot see the name of has not been found.

`every weed in the field can be found by its own name` runs all 563 rather than
a sample, because the corpus is fixed and a name that finds nothing is a weed
with no route to it but knowing already where it stands.

**A gesture that does not paint did not happen.** The first version of this
deferred drawing to the animation loop, which only runs while something glides
or coasts — so two fingers changed the state perfectly and the screen never
moved. Every handler paints directly now, and `acceptance_tests.js` has a
`settle()` that refuses to draw for the page, so a dead gesture fails loudly.

## One witness, at a level the crowd does not report from

`reports.jsonl` is a separate record, and it is not more of the same data.

The field is built from a crowd, and a crowd reports **outcomes** — happy,
hungry, sleepy, things that happened to it. Thirteen words, all of them passive.
What this record holds is **how much temporal coherence survives**: whether
there is enough narrative left standing to hold a thread. That is not a
fourteenth outcome. It is the frame the outcomes occur inside, reported from a
level of control the crowd does not operate at — which is why it is recorded as
the report's content and not as a residue left over after the thirteen have
taken what they can use.

**It is not an axis, because there is no other end.** All weed contracts the
horizon; there is no time-like weed. What varies is how much survives the
contraction, so this is a magnitude with a low ceiling:

| band | what it is |
|---|---|
| `no narrative` | cannot attend to a narrative. The sentence is lost mid-way, and the tiniest distraction ends it. |
| `one specific` | enough to hold a single small thread. Where exploring and building happen — **and the top of the range.** |

A test holds that ceiling shut, because a band above `one specific` would be a
claim the data cannot support and he has never made.

Each report keeps four things, and they are not equal. `said` is verbatim and is
never normalised away. `coherence` is the band. `own` is his terms the thirteen
have no place for. `crowd` is a *reading* of `said` into the thirteen — mine,
revisable, and there only to find neighbours in the field.

```bash
.venv/bin/python WeedSpace/reports.py
```

The claim being accumulated toward is precise: **coherence earns its place only
if it separates weeds the field puts together.** If every pair that differs in
coherence is also far apart in the thirteen, it is a relabelling of what the
crowd already measures. `separates()` decides that, and until there are readings
at two different bands it returns nothing and says why — an empty list would
read as a finding of no difference, which is not the same as having no evidence.

## The tab icon

The leaf, again — not a drawing of it. `ANG` and `LEN` and the sawtooth are
written once in `build_horizon.py`; the page's canvas leaf takes them by
substitution and `_favicon()` walks the same construction into an SVG path, so
the two cannot drift apart. It travels in the page as a data URI: no second
file, no request.

Two departures, both stated: the blades only, because the stem is a third of the
height and under a pixel wide in a tab — and it is the part that carries the
accent, which is the ground one weed stands on and not something an icon for the
whole space can wear. And round joins, because at sixteen pixels a mitred
sawtooth is aliasing rather than teeth. The green is the field's own, at the
middle of the range a weed's commitment moves it through.

It is drawn twice, because **Safari does not take an SVG icon** — and it will
not take a declared one at all while the *host* has a `favicon.ico` of its own.
`agent.farm` serves an orange star for everything under it, and that star is
what the tab showed. So the page offers `icon.png` first, as a real file
standing beside it, and the SVG second, inline, for every browser that reads
one. Only the PNG leaves the page; the SVG still travels inside it.

Drawing a mark twice is the thing all of this was arranged to avoid, so nothing
is redrawn — `leaf_parts()` hands over the points and the colours, and
`leaf_svg()` and `leaf_raster()` are two readings of them. Move a leaflet and
both move. The rasteriser is `scripts/raster.py`, shared with the shop and the
landing page.

`leaf_parts()` places the crown at any size anywhere, which is also how the
landing page sets one beside the shop's glass — `scripts/landing_icon.py`.
Importing this module no longer writes the page; running it does.

## Build

```bash
.venv/bin/python WeedSpace/navdata.py        # corpus  -> navdata.json
.venv/bin/python WeedSpace/build_horizon.py  # navdata -> horizon.html
cp WeedSpace/horizon.html docs/weed/index.html
cp WeedSpace/icon.png docs/weed/icon.png     # the tab icon travels beside it
```

`navdata.py` reads `data/lexicon/cannabis_strain_{flavor,effect}.parquet`, which
are not in the repo. It is deterministic: the same corpus gives a byte-identical
`navdata.json`, and that is what the tests rest on.

## Tests

```bash
.venv/bin/python -m pytest WeedSpace
```

72 tests over the data. `test_pipeline.py` checks navdata.json against the
parquet — which words are admitted, where each one sits, what each strain does.
`test_page.py` checks horizon.html against navdata.json — that direction
survives the move into the world, that colour follows direction, that a weed
wears the colour of the ground it stands on.

The other 61 are in `acceptance_tests.js` and need the page running, because
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

## The leading group

A bar is `round(9 × percentile)`, so a one-step lead can be a thousandth of a
percentile. **47% of weeds have no single longest bar at all**, and 85% lead by a
step or less. Printing them longest-first therefore invents a winner the data
does not have — the argmax bug in a third costume: a coin toss between two, then
a mean of everything, and finally a sorted list read from the top.

So everything within one step of the best is **one level group**, and inside it
the order is settled by which feeling the weed actually stands nearest — real
information, not list order. The top bar is then the star it sits under **77%**
of the time, against 36% for a hard argmax. What follows the group is drawn
quieter, because it genuinely is lesser.

The residue is real and visible: `dr who` leads clearly on `relaxed` and stands
under `euphoric`. Thirteen effects will not fit faithfully in three dimensions,
and placement improves the more a weed commits — where the top bar leads by
three steps or more, the nearest star is it 54% of the time with median rank 1.

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
