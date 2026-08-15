"""Emit the view from inside, as an environment rather than a projection.

A SKY and a FIELD, and they are different kinds of thing.

A word is a bearing and nothing else, so it goes to the sky: fixed, at an
unreachable remove, unmoved by anything the reader does. How sharply it marks
its bearing is its magnitude -- a vague word is a faint star, not a far one.

A weed is a thing at a place. Its direction is where it leans and its radius is
how far its strongest effect stands above its own floor, so a weed near the
middle commits to nothing. The reader stands among them and can walk.

The pair is the instrument. A camera pivoting on its own optical centre yields
no depth at all: every point sweeps by the same angle whatever its distance,
which is why a panorama can be stitched from one. A head is not that camera --
the eye rides forward of the neck, so turning is also a small translation, and
near things slide past far ones against a sky that does not move. That sliding
is the only thing in the view that can say what is near and what is behind.
"""
import json
import math
import pathlib

HERE = pathlib.Path(__file__).parent
D = json.loads((HERE / 'navdata.json').read_text())

def _rgb(h, sat, lit):
    h = h % 360; sat /= 100; lit /= 100
    c = (1 - abs(2*lit - 1)) * sat
    x = c * (1 - abs((h/60) % 2 - 1)); m = lit - c/2
    r, g, b = ((c,x,0),(x,c,0),(0,c,x),(0,x,c),(x,0,c),(c,0,x))[int(h//60) % 6]
    return (r+m), (g+m), (b+m)

def _lum(h, sat=70, lit=55):
    """What the eye actually gets. Magenta and blue at a given HSL lightness are
    far dimmer than yellow or green at the same number, which is why one side of
    this space read fine on black and the other suffocated."""
    r, g, b = _rgb(h, sat, lit)
    return 0.2126*r + 0.7152*g + 0.0722*b

def _even(h, lit):
    """Lift a hue until it carries the same weight on black as a mid green."""
    ref = _lum(100)
    gap = ref - _lum(h, 70, lit)
    return round(max(38, min(82, lit + gap * 58)), 1)

NEAR, FAR = 2.0, 11.0

mx = max(math.dist(i['p'], [0, 0, 0]) for i in D['items'])
for i in D['items']:
    n = math.dist(i['p'], [0, 0, 0])
    d = [x / n for x in i['p']] if n else [0, 0, 1]
    strength = n / mx
    # the two axes the vocabularies agree on most go into the horizontal plane,
    # so turning your head sweeps the real structure; the weak third axis becomes
    # up and down, where looking is deliberate and rare.
    #
    # A star has no distance. Its position is a bearing and nothing else, and how
    # sharply it marks that bearing becomes its MAGNITUDE -- a vague word is a
    # faint star, not a far one. Distance is left entirely to the weeds, which is
    # what stops the two competing over what "far" means.
    # A FEELING is a bearing and nothing else, so it goes to the sky at unit
    # distance and its strength becomes magnitude. A SMELL is not: it is
    # something the weeds have, not a state you can want, so it belongs among
    # them at a real place -- same radius rule the weeds use, so it parallaxes
    # with them and sits where the weeds that smell that way sit.
    if i['kind'] == 'feel':
        i['pos'] = [round(d[0], 4), round(d[2], 4), round(d[1], 4)]
    else:
        dist = NEAR + (FAR - NEAR) * strength
        i['pos'] = [round(d[0] * dist, 3), round(d[2] * dist, 3), round(d[1] * dist, 3)]
        i['dist'] = round(dist, 2)
    i['str'] = round(strength, 3)
    del i['p']
DATA = {k: D[k] for k in ('axes', 'items', 'chance', 'total', 'effectOrder')}
# The argmax ('e' in navdata) is deliberately NOT carried. It was the source of
# the colour-by-coin-toss bug and of a tooltip that named one effect while the
# mark was painted by a blend. What the page can state, it states from 'r'.
# Neither the argmax nor any colour is carried. The argmax produced the
# coin-toss bug; the colours became dead the moment a weed was drawn as a green
# leaf, and a page that ships a field it does not use will eventually state it
# by accident. The arrangement's colour geometry is still real and still tested
# in test_pipeline.py -- it is simply not a thing this page says any more.
DATA['strains'] = [{'n': t['n'], 'r': t['r'],
                    'p': [t['p'][0], t['p'][2], t['p'][1]]}
                   for t in D['strains']]   # 'a', the accent hue, is added below
# Hue follows the direction a word lies in, so words sitting together get
# neighbouring colours and words sitting apart get separated ones. Nothing is
# assigned by hand: the arrangement does it.
for i in D['items']:
    x, y, z = i['pos']
    ang = math.degrees(math.atan2(z, x)) % 360
    lift = y / math.dist(i['pos'], [0, 0, 0])          # how high it sits
    i['hue'] = round(ang, 1)
    i['lit'] = _even(ang, (70 if i['kind'] == 'feel' else 71) + 14 * lift)
    i['sat'] = 74 if i['kind'] == 'feel' else 58
HUE = {i['w']: (i['hue'], i['lit']) for i in D['items'] if i['kind'] == 'feel'}
# A weed is a GREEN LEAF WITH AN ACCENT. The body is green so it is recognisable
# without being read; the edge and the stem carry the colour of the ground it
# stands on -- the same blend of nearby feeling regions the globe paints with --
# so it still says which country it is in. Recognisable and located, which is
# what a flat green leaf gave up and a fully-coloured mark never had.
def _unit(v):
    n = math.dist(v, [0, 0, 0]) or 1
    return [c / n for c in v]

FEELPOS = [(_unit(i['pos']), i['hue']) for i in D['items'] if i['kind'] == 'feel']
BLEND = 11
for t in DATA['strains']:
    d = _unit(t['p'])
    cosines = [sum(a * b for a, b in zip(d, fd)) for fd, _ in FEELPOS]
    best = max(cosines)
    vx = vy = 0.0
    for (fd, hue), cos in zip(FEELPOS, cosines):
        w = math.exp((cos - best) * BLEND)
        th = math.radians(hue)
        vx += w * math.cos(th); vy += w * math.sin(th)
    t['a'] = round(math.degrees(math.atan2(vy, vx)) % 360, 1)   # the accent
# Weeds fill the body of the sphere, and you move through them. A word is a
# bearing with no location at all, so it goes to the sky: fixed, unreachable,
# unmoved by anything you do. A weed is a thing at a place, and its place has a
# radius as well as a direction -- the radius tracks how far its strongest
# effect stands above its own floor. A weed near the middle commits to nothing
# and is within reach of every feeling, which is the true thing to say about it,
# and the old scheme, which pushed every weed out onto a surface, could not say
# it at all.
#
# The pair is what makes the space readable: the sky is the given and never
# shifts, so a weed sliding against it as you move is what tells you how far off
# it is and what stands behind what. Parallax is the instrument; the fixed stars
# are what it measures against.
smx = max(math.dist(t['p'], [0, 0, 0]) for t in DATA['strains'])
for t in DATA['strains']:
    n = math.dist(t['p'], [0, 0, 0]) or 1e-9
    d = [x / n for x in t['p']]
    lean = n / smx
    dist = NEAR + (FAR - NEAR) * lean
    t['pos'] = [round(x * dist, 3) for x in d]
    t['dist'] = round(dist, 2)
    t['lean'] = round(lean, 3)
    del t['p']

DATA['near'], DATA['far'] = NEAR, FAR
print('effect hues:', {i['w']: i['hue'] for i in D['items'] if i['kind'] == 'feel'})


PAGE = """<title>From Where You Stand</title>
<style>
:root{
  --ground:#000; --panel:#0e0e0e; --line:#282828;
  --ink:#f5f5f5; --ink-2:#ababab; --ink-3:#7c7c7c;
  --smell:#e5a44e; --feel:#2fd2e4;
}
*{box-sizing:border-box}
/* Nothing here is text to be read off and copied: every word is a place you
   look at or a thing you tick. Dragging the view is the main gesture, and a drag
   that selects the legend behind it turns half the screen blue. */
body{margin:0;background:var(--ground);color:var(--ink);overflow:hidden;
  -webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;
  font:13px/1.5 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
::selection{background:transparent}
#wrap{position:fixed;inset:0;display:grid;grid-template-columns:206px 1fr;gap:1px;
  background:var(--line)}
.col{background:var(--ground);display:flex;flex-direction:column;overflow:hidden}
#view{position:relative;background:var(--ground);cursor:grab;touch-action:none}
#view.drag{cursor:grabbing}
canvas{display:block;width:100%;height:100%}
h1{margin:0;padding:14px 14px 3px;font-size:13.5px;font-weight:600}
.lede{margin:0;padding:0 14px 11px;color:var(--ink-3);font-size:11.5px;line-height:1.5}
.grp{color:var(--ink-3);font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;
  padding:10px 14px 5px;border-top:1px solid var(--line)}
.scroll{flex:1;overflow-y:auto;padding-bottom:10px}
.s{display:flex;align-items:center;gap:8px;padding:3px 14px;cursor:pointer;
  color:var(--ink-2);font-size:12.5px}
.s:hover{background:#171717;color:var(--ink)}
.s i{width:11px;height:11px;border-radius:3px;border:1.5px solid;flex:none;opacity:.85}
.s[aria-checked=yes]{color:var(--ink);font-weight:600}
/* the fill is the word's own colour, set where the row is built */
button{background:var(--panel);color:var(--ink-2);border:1px solid var(--line);
  border-radius:6px;padding:5px 10px;font:inherit;font-size:11.5px;cursor:pointer}
button:hover{color:var(--ink);border-color:#414141}
button:focus-visible{outline:2px solid var(--feel);outline-offset:2px}
#foot{padding:9px 14px 12px;border-top:1px solid var(--line);display:flex;gap:6px;
  flex-wrap:wrap;flex:none}
#globe{position:absolute;right:18px;bottom:18px;width:248px;background:#0b0b0b;
  border:1px solid #2e2e2e;border-radius:10px;z-index:3;overflow:hidden;
  box-shadow:0 6px 26px rgba(0,0,0,.65)}
#gbar{height:22px;display:flex;align-items:center;justify-content:flex-end;
  padding:0 4px 0 8px;cursor:grab;background:#141414;border-bottom:1px solid #262626}
#gbar.drag{cursor:grabbing}
#gx{background:none;border:0;color:#8a8a8a;font:inherit;font-size:14px;line-height:1;
  padding:2px 5px;cursor:pointer;border-radius:4px}
#gx:hover{color:#fff;background:#242424}
#gx:focus-visible{outline:2px solid var(--feel);outline-offset:1px}
#mini{display:block;width:248px;height:248px;cursor:grab;touch-action:none}
#mini.drag{cursor:grabbing}
#facing{position:absolute;left:0;right:0;bottom:18px;text-align:center;
  pointer-events:none;padding:0 252px 0 26px;transition:padding .2s}
#facing.wide{padding:0 26px}
#facing .lead{color:var(--ink-3);font-size:11px;letter-spacing:.09em;text-transform:uppercase}
#facing .set{font-size:15px;margin-top:3px;line-height:1.55}
#facing .odds{color:var(--ink-3);font-size:12px;margin-top:6px}
#cues{position:absolute;right:16px;top:14px;text-align:right;pointer-events:none;
  font-size:11.5px;color:var(--ink-3);line-height:1.65;max-width:238px}
#cues b{color:var(--ink);font-weight:600}
#cues .key{color:var(--ink-3);font-size:11px}
#cues .sw{display:inline-block;width:9px;height:9px;border-radius:50%;
  margin-left:6px;vertical-align:middle}
/* Above the globe, which parks in this same corner. What you are pointing at
   has to win against a panel you left open. */
#names{position:absolute;right:16px;bottom:16px;width:212px;max-height:38vh;z-index:4;
  overflow-y:auto;background:var(--panel);border:1px solid var(--line);border-radius:8px;
  padding:10px 12px;font-size:12px;display:none;color:var(--ink-2)}
#names b{display:block;color:var(--ink);margin-bottom:5px}
/* What a weed does, drawn rather than asserted: one bar per effect, as long as
   that effect is strong, in that effect's own colour. Three at least, so a
   near-tie shows as a near-tie instead of being settled by a rounding step. */
#names .bars{display:grid;grid-template-columns:74px auto;gap:4px 8px;
  align-items:center;margin-top:6px}
#names .trk{height:9px;background:#1d1d1d;border-radius:2px;overflow:hidden}
#names .trk i{display:block;height:100%;border-radius:2px}
#names .nm{font-size:11px;color:var(--ink);white-space:nowrap;letter-spacing:.02em}
/* Below the leading group: present, but genuinely lesser. */
#names .nm.less{color:var(--ink-3)}
#names .trk.less{height:6px;opacity:.5}
</style>

<div id=wrap>
  <div class=col>
    <h1>What do you smell?</h1>
    <p class=lede>Tick what is in the jar and you will be turned to face it.
      Or drag the view and look around.</p>
    <div class=grp>Smells</div>
    <div class=scroll id=list></div>
    <div id=foot>
      <button id=bClear>clear</button>
      <button id=bWide style="display:none">step back</button>
    </div>
  </div>
  <div class=col id=view>
    <canvas id=c></canvas>
    <div id=cues>
      <b>You are in the weed space.</b><br>
      Look around. Find the state you want.<br>
      Point at it, zoom in, and see what<br>
      strains will get you there.<br><br>
    </div>
    <div id=facing></div>
    <div id=globe>
      <div id=gbar><button id=gx aria-label="close the globe">&times;</button></div>
      <canvas id=mini width=248 height=248></canvas>
    </div>
    <div id=names></div>
  </div>
</div>

<script>
const D = __DATA__;
const EFFECT_ORDER = D.effectOrder;
const ITEMS = D.items, ST = D.strains;
const SMELLS = ITEMS.filter(i => i.kind === 'smell');
const FEELS = ITEMS.filter(i => i.kind === 'feel');

/* What a weed does, read off the same profile its spokes are drawn from, and
   shown as bars rather than as a word. Three effects at least, plus any level
   with the third: a single winner is a claim the data often cannot support,
   since a quarter of these strains have their top two within a rounding step
   of each other. Each bar carries its own effect's colour, so you can hold the
   bars against the ground the weed is standing on and see for yourself whether
   the place agrees with the effect. */
const EFFECT_COLOUR = Object.fromEntries(FEELS.map(f => [f.w, f]));
function does(t) {
  const e = EFFECT_ORDER.map((w, i) => [w, t.r[i]]).sort((a, b) => b[1] - a[1]);
  const cut = e[Math.min(2, e.length - 1)][1];
  /* No cap. Thirty-one of these weeds have more than six effects sitting level
     with the third, and one has nine. Trimming that list would settle a tie by
     list order, which is the thing this whole panel exists to stop. When a weed
     shows nine bars of equal length, that IS the reading: it does nothing in
     particular. The panel scrolls. */
  const show = e.filter(x => x[1] >= cut);

  /* THE LEADING GROUP, and why there is one.

     A bar is round(9 x percentile), so a one-step lead can be a thousandth of a
     percentile -- nothing. 47% of these weeds have no single longest bar at all
     and 85% lead by a step or less, so printing them in order, longest first,
     invents a winner the data does not have. That is the argmax bug in a third
     costume: it was a coin toss between two, then a mean of everything, and
     here it is a sorted list read from the top.

     So everything within a step of the best is one group, level, and inside
     that group the order is settled by which feeling the weed actually stands
     nearest -- real information, not list order. The top bar is then the star
     it sits under 77% of the time, against 36% for a hard argmax. What follows
     the group is drawn quieter, because it is genuinely lesser. */
  const best = show[0][1];
  const level = show.filter(x => x[1] >= best - 1);
  const rest = show.filter(x => x[1] < best - 1);
  const d = unit(t.pos);
  level.sort((a, b) => dot(d, unit(EFFECT_COLOUR[b[0]].pos))
                     - dot(d, unit(EFFECT_COLOUR[a[0]].pos)));
  const led = level.length;
  const ordered = level.concat(rest);
  return '<div class=bars>' + ordered.map(([w, v], i) => {
    const f = EFFECT_COLOUR[w];
    const on = i < led;
    return `<div class="trk${on ? '' : ' less'}"><i style="width:${Math.max(4, 100 * v / 9)}%;`
      + `background:hsl(${f.hue},${f.sat}%,${f.lit}%)"></i></div>`
      + `<span class="nm${on ? '' : ' less'}">${w}</span>`;
  }).join('') + '</div>';
}
const state = new Set();
let yaw = 0, pitch = 0, W = 0, H = 0;
let vYaw = 0, vPitch = 0, target = null, showNames = false;

const WIDE = 120 * Math.PI / 180; // binocular human field, near enough
let FOV = WIDE, fovWant = WIDE;   // narrows as you lean in, eased not snapped
const ATTEND = 0.84;              // what counts as looked-at rather than merely seen
const c = document.getElementById('c'), g = c.getContext('2d');
const size = () => {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  W = c.clientWidth; H = c.clientHeight;
  c.width = W * dpr; c.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
};
const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const len = a => Math.hypot(a[0], a[1], a[2]);

function frame() {
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  return { f: [cp*cy, sp, cp*sy], r: [-sy, 0, cy], u: [-sp*cy, cp, -sp*sy] };
}

/* A flat pinhole cannot carry 120 degrees -- it stretches the edges into the
   thing that felt wrong. This maps ANGLE to screen instead, the way a panorama
   does, so a degree turned is the same number of pixels wherever you look.
   Apparent size still comes from true distance, so nothing swells as you turn. */
function place(P, F) {
  const fwd = dot(P, F.f), rgt = dot(P, F.r), up = dot(P, F.u);
  const th = Math.atan2(rgt, fwd);
  if (Math.abs(th) > FOV / 2 + 0.05) return null;
  const ph = Math.atan2(up, Math.hypot(rgt, fwd));
  const ppr = W / FOV;                                  // pixels per radian
  const y = H/2 - ph * ppr;
  if (y < -60 || y > H + 60) return null;
  /* attention falls off toward the edge of vision, as it does in a head */
  const off = Math.abs(th) / (FOV / 2);
  return { x: W/2 + th * ppr, y, ppr, dist: len(P),
           edge: 1 - 0.55 * Math.pow(Math.max(0, off - 0.35) / 0.65, 1.6) };
}

/* WHERE YOU ARE, as distinct from where you are looking. Turning your head
   changes nothing about the arrangement; walking does. A word is projected
   straight, because a star is at infinity and no amount of walking shifts it. A
   weed is projected from the eye, so it slides against that fixed sky by an
   amount that says how near it is. That sliding is the only depth cue rotation
   can never give you: from a point, a ball and a shell look the same. */
/* Anything that changes what you would see paints, here and now.

   The first attempt set a flag for the animation loop to notice. That is the
   tidier design and it is wrong: the loop only runs while something is gliding
   or coasting, and where it is throttled or stopped -- a background tab, an
   embedded pane -- the flag is set, the state is perfect, and the screen never
   changes. That is precisely the bug that shipped. A gesture that does not
   paint did not happen. */
const nudge = () => { draw(); readout(); drawMini(); };

/* YOUR EYE IS NOT ON THE PIVOT. A camera turning about its own optical centre
   gives no parallax at all: every point sweeps by the same angle whatever its
   distance, which is precisely why a panorama can be stitched from one. A head
   does not work that way. The eye sits forward of the axis the neck turns
   about, so turning your head is a rotation AND a small translation, and near
   things really do slide past far ones. That is the depth cue you get for free
   in a room, and it is what standing at a bare origin threw away.

   NECK is that offset, and it has a real ceiling: it must stay shorter than the
   nearest weed, or turning would swing your eye through your own data. The
   field starts at 2.59, so 2.2 is as long as a neck can honestly be. It is also
   where the sweep becomes legible -- turning 2.3 degrees, the near third of the
   field slides 19.0px against the far third's 14.4 and the sky's 10.7. At the
   0.9 a real head would scale to, those numbers are 13.4 and 12.3: present in
   the arithmetic, invisible on the screen. */
const NECK = 2.2;
let STAND = [0, 0, 0];              // where you are standing
let EYE = [0, 0, 0];                // where you are looking FROM, a neck ahead of it

function eyeAt(F) {
  EYE = [STAND[0] + F.f[0]*NECK, STAND[1] + F.f[1]*NECK, STAND[2] + F.f[2]*NECK];
}
const here = P => [P[0] - EYE[0], P[1] - EYE[1], P[2] - EYE[2]];

/* How far you may go is not a matter of taste: it is the radius past which the
   field stops surrounding you and becomes a clump you are looking at. What has
   to be bounded is the EYE, which swings out to STAND + NECK as you turn.
   Counting weeds per thirty-degree sector around the standing point rather
   than marks in view: the emptiest sector holds 22 at the centre, 27 at radius
   1 -- stepping off centre briefly improves it -- 18 at 2, 7 at 3, 2 at 5 and
   0 by 6. So the field is smaller than it looks and there is genuinely not far
   to go while staying inside it.

   The rim was at 3.4, which left 1.2 to walk once the neck took its 2.2. That
   is too short to be worth doing. Moved to 5.0, which buys 2.8 -- more than
   twice the walk -- and the price is stated rather than hidden: past about 3.4
   the field thins, and at the far end the sparsest direction holds two or three
   weeds instead of twenty. You can get somewhere sparse now. You still cannot
   get outside. */
const REACH = 5.0;
const ROAM = REACH - NECK;

/* THE APPROACH, and what it is for.

   A thing attracts attention; attention moves toward it; what stays in frame
   through that movement is what was really there. That is recognition, and it
   cannot be done from a chart -- it needs a viewpoint that can move, and marks
   that can either hold or fail to hold.

   So: point at something and you are carried toward it. Everything in the field
   is watched for the whole way. A mark that is still in view when you arrive
   HELD; one that slid out of frame did not. Held marks stay lit afterwards and
   the rest go quiet, until you move again and the question is asked afresh.

   Only the field is tested. The sky cannot fail this -- a star never moves --
   which is exactly why it is the thing the test is made against. */
let held = null;                       // Set of marks that survived the last approach
let approaching = 0;                   // frames left in the current approach
let watch = null;

function beginApproach() {
  if (len(STAND) > REACH - NECK - 0.05) return;   // nowhere left to go
  watch = new Map();
  for (const t of ST) watch.set(t, 0);
  for (const i of SMELLS) watch.set(i, 0);
  approaching = 22;
  held = null;
  nudge();
}

function stepApproach() {
  walk(0.13);
  let n = 0;
  for (const [m, c] of watch) {
    const inFrame = m.node ? !!m.node : !!m.hit;
    if (inFrame) { watch.set(m, c + 1); n++; }
  }
  if (--approaching > 0) return;
  /* held = in frame on every step from the moment the approach began */
  const total = 22 - approaching;
  held = new Set();
  for (const [m, c] of watch) if (c >= total - 1) held.add(m);
  readout();
}

function walk(step) {
  const F = frame();
  const p = [STAND[0] + F.f[0]*step, STAND[1] + F.f[1]*step, STAND[2] + F.f[2]*step];
  const n = len(p);
  /* the field closes around you rather than ending: press on at the rim and you
     slide along it instead of stepping outside and looking in */
  if (n > ROAM) for (let i = 0; i < 3; i++) p[i] *= ROAM / n;
  STAND = p;
  nudge();
}

function ground(F) {
  /* A ring of ticks at eye level, far off. Turning slides them past, which is
     the cue that says a head turned rather than a chart deformed. */
  const R = 26;
  /* Lifted from .07. With 3.5% of pixels painted and almost all of that above
     half luminance, the scene was binary -- bright specks on absolute black,
     nothing in between -- and the eye adapts to the black. These rings are the
     only midtone in the view, so they are what makes the rest sit comfortably. */
  g.strokeStyle = 'rgba(255,255,255,.15)'; g.lineWidth = 1;
  let started = false;
  g.beginPath();
  for (let a = 0; a <= 360; a += 3) {
    const t = a * Math.PI / 180;
    const p = place([Math.cos(t) * R, 0, Math.sin(t) * R], F);
    if (!p) { started = false; continue; }
    if (!started) { g.moveTo(p.x, p.y); started = true; } else g.lineTo(p.x, p.y);
  }
  g.stroke();
  for (let a = 0; a < 360; a += 10) {
    const t = a * Math.PI / 180;
    const big = a % 30 === 0;
    const p = place([Math.cos(t) * R, 0, Math.sin(t) * R], F);
    if (!p) continue;
    g.strokeStyle = `rgba(255,255,255,${(big ? .17 : .08) * p.edge})`;
    g.lineWidth = big ? 1.4 : 1;
    g.beginPath(); g.moveTo(p.x, p.y - (big ? 9 : 5)); g.lineTo(p.x, p.y + (big ? 9 : 5)); g.stroke();
  }
  /* a floor, low and wide enough to read as a floor rather than a lid */
  g.strokeStyle = 'rgba(255,255,255,.04)'; g.lineWidth = 1;
  for (const r of [9, 17, 30]) {
    started = false; g.beginPath();
    for (let a = 0; a <= 360; a += 6) {
      const t = a * Math.PI / 180;
      const p = place([Math.cos(t) * r, -6.5, Math.sin(t) * r], F);
      if (!p) { started = false; continue; }
      if (!started) { g.moveTo(p.x, p.y); started = true; } else g.lineTo(p.x, p.y);
    }
    g.stroke();
  }
}

function draw() {
  const F = frame();
  eyeAt(F);                    // the eye rides a neck ahead of where you stand
  g.clearRect(0, 0, W, H);
  ground(F);

  g.strokeStyle = 'rgba(255,255,255,.16)'; g.lineWidth = 1;
  g.beginPath(); g.arc(W/2, H/2, 38, 0, 6.284); g.stroke();
  g.beginPath();
  g.moveTo(W/2 - 7, H/2); g.lineTo(W/2 + 7, H/2);
  g.moveTo(W/2, H/2 - 7); g.lineTo(W/2, H/2 + 7);
  g.strokeStyle = 'rgba(255,255,255,.3)'; g.stroke();

  /* Weeds are simply IN the space, all of them, all the time. Nothing is gated
     on what you happen to be aiming at, because a thing that blinks out when
     you turn your head is not a thing in a place. What changes as you turn is
     only how plainly you can make it out: near the middle of your view it is
     drawn in full, toward the edge it fades, and it goes on fading past the
     edge rather than being cut. */
  for (const t of ST) t.node = null;
  const strains = [];
  for (let k = 0; k < ST.length; k++) {
    const t = ST[k], q = place(here(t.pos), F);       // from the eye, so it parallaxes
    if (!q) continue;
    const off = Math.hypot(q.x - W/2, q.y - H/2) / (Math.min(W, H) * 0.62);
    const attend = 1 / (1 + off * off * 1.5);          // smooth, never a cliff
    /* A weed that commits to nothing is a SMALLER THING, not merely a distant
       one. Once weeds fill the body of the sphere, the uncommitted ones sit
       near the middle and so near you -- and plain 1/distance would make the
       blandest weed in the corpus the biggest and brightest object in the
       view. Its own size carries its commitment, and distance then does what
       distance does. The two nearly cancel, which is correct: how much a weed
       commits is not a function of where you happen to be standing. */
    /* Measured against the words in the same view: the weeds were sitting at a
       median 0.21 of screen luminance against the words' 0.38, and the darkest
       fell to 0.179, below even the dimmest word. Most were pinned on the
       floor. A weed must not outshine the sky -- the sky is the frame -- but it
       has to be plainly there, so the floor rises and the gain with it. */
    let a = Math.max(0.72, Math.min(1, 13 * t.lean / q.dist) * q.edge * attend);
    if (held && !held.has(t)) a *= 0.34;          // it slid out of frame on the way
    strains.push({ t, q, a,
                   R: Math.max(3.2, (118 * t.lean / q.dist) * (WIDE / FOV) ** 0.5) * q.edge });
  }
  strains.sort((x, y) => y.q.dist - x.q.dist);
  for (const { t, q, a, R } of strains) {
    if (R < 5) {
      /* far off, a weed is a hard little chip -- never a soft dot, which would
         read as a smell */
      g.beginPath();
      for (let k = 0; k < 5; k++) {
        const th = k / 5 * 6.2832 - 1.5708, rr = Math.max(1.5, R * 0.85);
        const x = q.x + Math.cos(th) * rr, y = q.y + Math.sin(th) * rr;
        k ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.closePath();
      /* Far off, still a leaf: three points and a stem, filled green. What
         separates it from a smell out here is that a leaf is solid and squat
         and a smell is an open upright curl. */
      const lit3 = 48 + 20 * t.lean;
      g.beginPath();
      for (const th of [-1.5708, -1.5708 - 0.95, -1.5708 + 0.95]) {
        g.moveTo(q.x, q.y);
        g.lineTo(q.x + Math.cos(th - 0.2) * R * 0.55, q.y + Math.sin(th - 0.2) * R * 0.55);
        g.lineTo(q.x + Math.cos(th) * R * 1.25, q.y + Math.sin(th) * R * 1.25);
        g.lineTo(q.x + Math.cos(th + 0.2) * R * 0.55, q.y + Math.sin(th + 0.2) * R * 0.55);
        g.lineTo(q.x, q.y);
      }
      g.closePath();
      g.fillStyle = `hsla(112,66%,${lit3}%,${a})`; g.fill();
      g.strokeStyle = `hsla(112,72%,${lit3 + 14}%,${a})`; g.lineWidth = 1; g.stroke();
      g.beginPath(); g.arc(q.x, q.y, Math.max(1.2, R * 0.24), 0, 6.2832);
      g.fillStyle = `hsla(${t.a},90%,${lit3 + 22}%,${a})`; g.fill();
    } else {
      /* THE CANNABIS LEAF, drawn as the thing people already know.

         Seven leaflets, not thirteen. Serrated edges, because the sawtooth is
         most of what makes it recognisable. The centre one longest and vertical,
         the pairs shortening and sweeping outward until the last pair sits below
         horizontal. And GREEN -- flatly, deliberately green.

         What that costs, stated plainly: a weed's colour no longer tells you
         which country it stands in. Position still does, and the leaf now tells
         you at a glance that it is a weed. Lightness still tracks how much the
         weed commits, so the field does not flatten into one mass. The profile
         is no longer legible from the outline; the hover panel carries it. */
      const ANG = [0, -0.66, 0.66, -1.26, 1.26, -1.82, 1.82];
      const LEN = [1.0, 0.87, 0.87, 0.64, 0.64, 0.42, 0.42];
      const lit2 = 46 + 20 * t.lean;
      g.beginPath();
      for (let k = 0; k < 7; k++) {
        const th = -1.5708 + ANG[k], L = R * LEN[k], w = R * 0.115 * (1 - 0.22 * Math.abs(ANG[k]));
        const ux = Math.cos(th), uy = Math.sin(th), px = -uy, py = ux;
        const wid = u => w * Math.sin(Math.pow(u, 0.5) * 3.1416);
        const S = 7;
        g.moveTo(q.x, q.y);
        for (let i = 1; i <= S; i++) {
          const u = i / S, tooth = i % 2 ? 1 : 0.58, d = wid(u) * tooth;
          g.lineTo(q.x + ux*L*u + px*d, q.y + uy*L*u + py*d);
        }
        for (let i = S; i >= 1; i--) {
          const u = i / S, tooth = i % 2 ? 1 : 0.58, d = wid(u) * tooth;
          g.lineTo(q.x + ux*L*u - px*d, q.y + uy*L*u - py*d);
        }
        g.lineTo(q.x, q.y);
      }
      g.closePath();
      g.fillStyle = `hsla(112,66%,${lit2}%,${a})`; g.fill();
      /* Outlined in its own green, NOT in the accent. A seven-leaflet serrated
         star has an enormous perimeter for the area it encloses, so an accent
         stroke does not accent it -- measured, the stroke took 968 of 1304
         pixels against the fill's 167 and the leaf came out pink. The accent
         goes on the stem and the node instead, which are bounded. */
      g.strokeStyle = `hsla(112,72%,${lit2 + 14}%,${a})`;
      g.lineWidth = Math.max(1, R * 0.045); g.stroke();
      g.beginPath();
      g.moveTo(q.x, q.y);
      g.lineTo(q.x, q.y + R * 0.52);
      /* the ground it stands on, held where it can be seen without swamping */
      g.strokeStyle = `hsla(${t.a},88%,${lit2 + 20}%,${a})`;
      g.lineWidth = Math.max(1.6, R * 0.13); g.stroke();
      g.beginPath(); g.arc(q.x, q.y, Math.max(1.4, R * 0.15), 0, 6.2832);
      g.fillStyle = `hsla(${t.a},90%,${lit2 + 24}%,${a})`; g.fill();
    }
    t.node = [q.x, q.y, R, a];
  }

  /* The SKY is projected straight -- a feeling is at infinity and no amount of
     walking shifts it. A SMELL is in the FIELD, projected from the eye like the
     weeds, because it is a thing the weeds have and it must drift with them.
     Stars stack faint-first; smells stack far-first, as depth requires. */
  const seen = [];
  for (const it of ITEMS) {
    const sky = it.kind === 'feel';
    const p = place(sky ? it.pos : here(it.pos), F);
    it.hit = null;
    if (p) seen.push({ it, p, sky });
  }
  seen.sort((a, b) => (a.sky !== b.sky) ? (a.sky ? -1 : 1)
                    : a.sky ? a.it.str - b.it.str : b.p.dist - a.p.dist);

  const drawn = [
    [W / 2, H - 30, W, 86],          // the readout strip along the bottom
    [W - 130, H - 130, 262, 262],    // the globe in the corner
    [W - 124, 74, 260, 168],         // the note in the top corner
  ];
  for (const { it, p } of seen) {
    const feel = it.kind === 'feel';
    const said = state.has(it.w);
    /* Magnitude, not distance and not size: a word that marks its bearing
       sharply is a BRIGHT star, one that marks almost nothing is a faint one.

       A star holds a fixed size on the screen. It is infinitely far, so nothing
       you do resolves it into a disc -- narrowing the view gathers the field and
       leaves the sky exactly as it was. Scaling these with pixels-per-radian was
       wrong twice over: it made distant things swell as you squinted, and it
       put letters two hundred pixels tall on objects that are meant to read as
       unreachable. */
    /* A star holds a fixed size: infinitely far, nothing resolves it into a
       disc. A smell is a thing at a distance and so it recedes, by the same
       rule the weeds obey -- its own sharpness over how far off it is. */
    /* The multiplier here used to be 40, against a str/dist that never exceeds
       0.24 -- so the max(8.5, ...) floor caught every single smell and they all
       drew at one size, near and far alike. A distance encoding that is entirely
       clamped is not an encoding. */
    const sz = feel ? 10.5 + 6.5 * it.str
                    : Math.max(11, Math.min(28, 108 * it.str / p.dist)) + 7;
    let a = feel ? Math.max(0.52, Math.min(1, 0.30 + 0.70 * it.str) * p.edge)
                 : Math.max(0.70, Math.min(1, 12 * it.str / p.dist) * p.edge);
    if (!feel && held && !held.has(it)) a *= 0.34;   // it slid out of frame on the way

    const label = feel ? it.w.toUpperCase() : it.w;
    g.font = `${said ? '600 ' : feel ? '500 ' : ''}${sz.toFixed(1)}px ui-sans-serif,sans-serif`;
    const track = feel ? sz * 0.13 : 0;
    const w = Math.max(g.measureText(label).width + track * (label.length - 1), sz * 2.2);
    const face = sz * (feel ? 1.5 : 1.15);

    /* THE NAME ON TOP, THE GLYPH BENEATH IT.

       The glyph used to sit above the word and the two overlapped every time --
       not marginally, but by construction: the nose reaches 0.74 of its radius
       below its own centre, and the gap allowed for it was smaller than that at
       every size. Flipped, and the clearance is now computed from how far each
       glyph actually hangs below its centre rather than from one shared guess,
       because a ring, a nose and a leaf do not extend alike. */
    /* THE GLYPH ON TOP, THE NAME UNDER IT -- which is where it was asked to be.
       The overlap that forced the swap is gone for a different reason: the
       clearance is now computed from how far each glyph actually reaches from
       its own centre, per kind, rather than from one shared guess. A ring, a
       leaf and three rising waves do not extend alike. */
    const reach = feel ? face * 1.15 : face * 0.95;
    const my = p.y - sz * 0.86 - reach;             // its centre, clear above the text

    drawn.push([p.x, (p.y + my) / 2, w, sz + reach * 2.4]);

    if (feel) {
      /* A NEBULA, NOT A STAR.

         A star is a point, and a feeling is not one. The region a word actually
         picks out spans 0.83 to 1.04 of the whole cloud -- naming it shifts
         where you land without narrowing it -- so a hard little ring claimed a
         precision the measurement does not have. A diffuse extended thing says
         what is true: a broad region lies that way.

         The extent is real too. How sharply a word marks its bearing sets how
         CONCENTRATED the nebula is, not how big: a sharp feeling holds a tight
         bright heart, a vague one is the same size and smeared. Three offset
         lobes rather than one disc, so it reads as a cloud and not as a blur. */
      const NR = face * 2.15;
      const conc = 0.16 + 0.30 * it.str;
      for (const [ox, oy, rr] of [[0, 0, 1.0], [0.32, -0.22, 0.74], [-0.30, 0.20, 0.66]]) {
        const cx = p.x + ox * NR, cy = my + oy * NR, R2 = NR * rr;
        const gd = g.createRadialGradient(cx, cy, 0, cx, cy, R2);
        gd.addColorStop(0,    `hsla(${it.hue},92%,${Math.min(90, it.lit + 12)}%,${a * 0.34})`);
        gd.addColorStop(conc, `hsla(${it.hue},86%,${it.lit}%,${a * 0.17})`);
        gd.addColorStop(1,    `hsla(${it.hue},80%,${it.lit}%,0)`);
        g.fillStyle = gd;
        g.beginPath(); g.arc(cx, cy, R2, 0, 6.2832); g.fill();
      }
      /* the heart, which is what keeps it a place rather than a haze */
      const hr = NR * 0.26;
      const gh = g.createRadialGradient(p.x, my, 0, p.x, my, hr);
      gh.addColorStop(0,   `hsla(${it.hue},96%,${Math.min(96, it.lit + 28)}%,${a})`);
      gh.addColorStop(0.45, `hsla(${it.hue},92%,${Math.min(92, it.lit + 14)}%,${a * 0.55})`);
      gh.addColorStop(1,   `hsla(${it.hue},90%,${it.lit}%,0)`);
      g.fillStyle = gh;
      g.beginPath(); g.arc(p.x, my, hr, 0, 6.2832); g.fill();
    } else {
      /* A SMELL IS RISING WAVES. The nose was worse than the thing it replaced,
         so it is gone and only the waves are left -- stood upright, because
         rising is what a smell does and lying flat is what a line does.

         Two tones, as before: the middle wave carries the word's own colour so
         a smell still tells you its direction, and the outer pair are a pale
         tint of it. How far they waver is how weakly the word holds its
         bearing -- a sharp smell rises almost straight, a vague one wanders. */
      const R = face * 0.92;
      const wig = 0.42 + 1.05 * (1 - it.str);
      g.lineCap = 'round';
      g.lineWidth = Math.max(1.5, R * 0.17);
      for (let k = -1; k <= 1; k++) {
        const xx = p.x + k * R * 0.40;
        g.strokeStyle = k === 0
          ? `hsla(${it.hue},${it.sat + 10}%,${it.lit}%,${a})`
          : `hsla(${it.hue},${Math.max(20, it.sat - 26)}%,${Math.min(92, it.lit + 24)}%,${a * 0.8})`;
        g.beginPath();
        g.moveTo(xx, my + R * 1.0);
        g.bezierCurveTo(xx + R * 0.34 * wig, my + R * 0.34,
                        xx - R * 0.34 * wig, my - R * 0.34,
                        xx, my - R * 1.0);
        g.stroke();
      }
    }

    if (said) {
      g.fillStyle = 'rgba(229,164,78,.13)';
      g.beginPath();
      g.roundRect(p.x - w/2 - 8, p.y - sz*0.78 - face, w + 16, sz * 1.2 + face, 6);
      g.fill();
    }

    g.fillStyle = `hsla(${it.hue},${it.sat}%,${it.lit}%,${a})`;
    if (feel) {
      let cx = p.x - w / 2 + (w - (g.measureText(label).width + track * (label.length - 1))) / 2;
      g.textAlign = 'left';
      for (const ch of label) { g.fillText(ch, cx, p.y); cx += g.measureText(ch).width + track; }
    } else {
      g.textAlign = 'center';
      g.fillText(label, p.x, p.y);
    }
    it.hit = [p.x, p.y, w, sz + face];
  }

  /* Strain names, once the words have taken what they need. Leaning in spreads
     the nodes apart, so more names fit -- the labels arrive by themselves. */
  if (FOV < WIDE * 0.80) {
    const lit = ST.filter(t => t.node).sort((a, b) => b.node[2] - a.node[2]);
    const fs = Math.max(9, Math.min(13, 10 * (WIDE / FOV) ** 0.45));
    g.font = `${fs.toFixed(1)}px ui-sans-serif,sans-serif`;
    g.textAlign = 'left';
    for (const t of lit) {
      const [x, y, r] = t.node;
      const tw = g.measureText(t.n).width;
      const bx = x + r + 4, by = y - fs / 2;
      if (drawn.some(b => bx < b[0] + b[2] / 2 + 4 && bx + tw > b[0] - b[2] / 2 - 4
                       && by < b[1] + b[3] / 2 + 3 && by + fs > b[1] - b[3] / 2 - 3)) continue;
      drawn.push([bx + tw / 2, y, tw, fs]);
      g.fillStyle = `hsla(${t.h},58%,${t.l}%,.72)`;
      g.fillText(t.n, bx, y + fs / 3);
    }
  }
}

function bundle(F) {
  /* Something is always ahead. If nothing sits straight in front the cone opens
     until it finds the nearest things and says how far round they are: a space
     has no dead ends, only sparser country. */
  const all = ITEMS.map(i => ({ i, c: dot(i.pos, F.f) / len(i.pos) }))
    .sort((a, b) => b.c - a.c);
  let near = all.filter(o => o.c > ATTEND), wide = false;
  if (near.length < 2) { near = all.slice(0, 7); wide = true; }
  const off = wide && near.length
    ? Math.round(Math.acos(Math.max(-1, Math.min(1, near[0].c))) * 57.3) : 0;
  return { smells: near.filter(o => o.i.kind === 'smell').map(o => o.i).slice(0, 5),
           feels: near.filter(o => o.i.kind === 'feel').map(o => o.i).slice(0, 4),
           wide, off };
}

function readout() {
  const { smells, feels, wide, off } = bundle(frame());
  const box = document.getElementById('facing');
  let odds = '';
  if (state.size) {
    let keep = new Set(ST.keys()), scored = new Set(ST.keys());
    for (const w of state) {
      const it = SMELLS.find(i => i.w === w);
      const s = new Set(it.in), o = new Set(it.on);
      keep = new Set([...keep].filter(i => s.has(i)));
      scored = new Set([...scored].filter(i => o.has(i)));   // judged on these only
    }
    const idx = [...keep], base = [...scored];
    if (idx.length >= 8) {
      const rows = FEELS.map(f => {
        const s = new Set(f.in);
        const got = Math.round(100 * idx.filter(i => s.has(i)).length / idx.length);
        const ch = Math.round(100 * base.filter(i => s.has(i)).length / base.length);
        return { w: f.w, got, ch, lift: got - ch };
      }).filter(r => r.lift > 8).sort((a, b) => b.lift - a.lift).slice(0, 3);
      odds = rows.length
        ? `<div class=odds>of the ${idx.length} that smell this way: `
          + rows.map(r => `<b style="color:var(--feel)">${r.w}</b> ${r.got}%`
              + ` <span style="opacity:.7">(${r.ch}% among the same strains)</span>`).join(' &middot; ') + `</div>`
        : `<div class=odds>${idx.length} strains smell this way, and no effect is`
          + ` more than 8 points above chance &mdash; which is where chance itself lands</div>`;
    } else if (idx.length) {
      odds = `<div class=odds>only ${idx.length} strains smell exactly this way &mdash; too few to say</div>`;
    }
  }
  box.innerHTML = (smells.length || feels.length)
    ? `<div class=lead>${wide ? `open country &mdash; nearest is ${off}&deg; round`
                              : 'this way'}</div><div class=set>`
      + smells.map(s => `<span style="color:hsl(${s.hue},${s.sat}%,${s.lit}%)">${s.w}</span>`).join(' &nbsp;')
      + (feels.length ? ' &nbsp;&nbsp;' + feels.map(f =>
          `<span style="color:hsl(${f.hue},${f.sat}%,${f.lit}%)">${f.w}</span>`).join(' &nbsp;') : '')
      + `</div>` + odds
    : `<div class=lead>open country</div>`
      + `<div class=set style="color:var(--ink-3)">keep turning</div>` + odds;
}

function faceTo(d) {
  const n = len(d) || 1;
  target = [Math.atan2(d[2] / n, d[0] / n), Math.asin(Math.max(-1, Math.min(1, d[1] / n)))];
}

const list = document.getElementById('list');
for (const s of SMELLS) {
  const row = document.createElement('div');
  row.className = 's'; row.setAttribute('aria-checked', 'off');
  /* The list wears the sky's colours. A smell here and the same smell out there
     are one thing, so it is recognised rather than read -- and because colour
     means direction, the list also shows at a glance which smells lie together
     and which lie apart. */
  const col = `hsl(${s.hue},${s.sat}%,${s.lit}%)`;
  row.innerHTML = `<i style="border-color:${col}"></i>`
    + `<span style="color:${col}">${s.w}</span>`;
  const chip = row.querySelector('i');
  row.onclick = () => {
    if (state.has(s.w)) { state.delete(s.w); row.setAttribute('aria-checked', 'off'); }
    else { state.add(s.w); row.setAttribute('aria-checked', 'yes'); }
    chip.style.background = state.has(s.w) ? col : '';
    if (state.size) {
      const v = [0, 0, 0];
      for (const w of state) {
        const p = SMELLS.find(i => i.w === w).pos, n = len(p);
        v[0] += p[0]/n; v[1] += p[1]/n; v[2] += p[2]/n;
      }
      faceTo(v);
    }
    draw(); readout();
  };
  list.append(row);
}

const view = document.getElementById('view');
let down = false, lx = 0, ly = 0, moved = 0;
view.addEventListener('pointerdown', e => {
  down = true; moved = 0; lx = e.clientX; ly = e.clientY;
  view.classList.add('drag'); view.setPointerCapture(e.pointerId);
  target = null; vYaw = vPitch = 0;
});
view.addEventListener('pointermove', e => {
  if (!down) return;
  const dx = e.clientX - lx, dy = e.clientY - ly;
  moved += Math.abs(dx) + Math.abs(dy);
  vYaw = -dx * 0.0032; vPitch = dy * 0.0032;      // carried on after release
  yaw += vYaw; pitch = Math.max(-1.1, Math.min(1.1, pitch + vPitch));
  lx = e.clientX; ly = e.clientY;
});
view.addEventListener('pointermove', e => {
  if (down) return;
  const r = c.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
  /* A leaf is hoverable over the whole leaf. The node is where the stem meets
     the blades -- a point at the bottom of the mark -- so a fixed nine-pixel
     radius around it caught only the accent and missed everything green above
     it. The reach is the leaf's own drawn size. */
  let best = null, bd = Infinity;
  for (const t of ST) {
    if (!t.node) continue;
    const rr = Math.max(10, t.node[2] * 1.25);
    const d = (t.node[0] - mx) ** 2 + (t.node[1] - my - t.node[2] * 0.45) ** 2;
    if (d < rr * rr && d < bd) { bd = d; best = t; }
  }
  const box = document.getElementById('names');
  if (best) {
    box.style.display = 'block';
    box.style.left = Math.min(mx + 14, W - 226) + 'px';
    box.style.top = Math.max(my - 8, 8) + 'px';
    box.style.right = 'auto'; box.style.bottom = 'auto';
    box.innerHTML = `<b>${best.n}</b>` + does(best);
  } else if (!showNames) box.style.display = 'none';
});
view.addEventListener('pointerup', e => {
  down = false; view.classList.remove('drag');
  if (moved > 5) return;
  vYaw = vPitch = 0;
  const r = c.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
  for (const it of ITEMS) {
    if (!it.hit) continue;
    const [x, y, w, s] = it.hit;
    if (Math.abs(mx - x) < w/2 + 8 && Math.abs(my - y) < s) { faceTo(it.pos); beginApproach(); return; }
  }
});

function lean(factor, towardX, towardY) {
  const before = fovWant;
  fovWant = Math.max(WIDE * 0.14, Math.min(WIDE, fovWant * factor));
  if (towardX !== undefined && fovWant < before) {
    /* turn toward what was clicked, so leaning in also steps toward it */
    const ppr = W / before;
    const th = (towardX - W / 2) / ppr, ph = (H / 2 - towardY) / ppr;
    const F = frame();
    const d = [
      F.f[0] * Math.cos(th) * Math.cos(ph) + F.r[0] * Math.sin(th) + F.u[0] * Math.sin(ph),
      F.f[1] * Math.cos(th) * Math.cos(ph) + F.r[1] * Math.sin(th) + F.u[1] * Math.sin(ph),
      F.f[2] * Math.cos(th) * Math.cos(ph) + F.r[2] * Math.sin(th) + F.u[2] * Math.sin(ph)];
    faceTo(d);
  }
  document.getElementById('bWide').style.display = fovWant < WIDE * 0.99 ? '' : 'none';
}
view.addEventListener('dblclick', e => {
  const r = c.getBoundingClientRect();
  lean(e.shiftKey ? 1 / 0.62 : 0.62, e.clientX - r.left, e.clientY - r.top);
});
/* Two fingers LOOK AROUND -- the same act as dragging, at the same sense and
   scale, because scrolling is how a trackpad turns a view. A pinch MOVES YOU
   through the field: in a space with depth, going in is what zooming is, and
   it is what makes the sky hold still while the weeds stream past.

   Both arrive as wheel events; a trackpad pinch is a wheel with ctrlKey set. */
view.addEventListener('wheel', e => {
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) {
    /* One gesture, and it must undo itself. Pinching in walks you forward until
       the rim, and only then narrows the view; pinching out widens the view
       first, and only then walks you back. That is last-in-first-out, so the
       two directions retrace the same path -- and, more to the point, zooming
       out always does SOMETHING. When pinch only ever walked, a view narrowed
       by a double-click could not be widened by the gesture that ought to widen
       it, and the zoom appeared to be broken. */
    const out = e.deltaY > 0;
    if (out) {
      if (fovWant < WIDE * 0.995) lean(1.09); else walk(-0.16);
    } else {
      if (len(STAND) >= ROAM - 1e-6) lean(0.92); else walk(0.16);
    }
  }
  else if (e.shiftKey) { lean(e.deltaY > 0 ? 1.07 : 0.935); }
  else {
    /* Sideways was right and up-down was inverted -- reported from the
       trackpad, which is the only place this can be judged. The two axes do not
       share a sign here because a trackpad's horizontal and vertical deltas do
       not share one either once "natural" scrolling is in play. Do not tidy
       these into one sign; that is what made it wrong. */
    target = null; vYaw = vPitch = 0;
    yaw -= e.deltaX * 0.0032;
    pitch = Math.max(-1.1, Math.min(1.1, pitch + e.deltaY * 0.0032));
  }
  nudge();
}, { passive: false });
document.getElementById('bWide').onclick = () => lean(WIDE / fovWant);
addEventListener('keydown', e => {
  if (e.key === 'w' || e.key === 'ArrowUp') walk(0.3);
  else if (e.key === 's' || e.key === 'ArrowDown') walk(-0.3);
  else return;
});

document.getElementById('bClear').onclick = () => {
  state.clear();
  [...list.children].forEach(r => {
    r.setAttribute('aria-checked', 'off');
    r.querySelector('i').style.background = '';
  });
  draw(); readout();
};
/* ---- the globe -----------------------------------------------------------
   The sphere you stand inside, seen from outside, painted solid: every patch
   takes the colour of the nearest feeling, so the surface IS the arrangement
   rather than a diagram of it. Your heading is always the centre of the disc,
   which makes dragging the globe the same act as turning your head. */
const globe = document.getElementById('globe');
const mini = document.getElementById('mini'), mg = mini.getContext('2d');
const GS = 248, GR = 113, GC = 124;
let showMini = true;
const gimg = mg.createImageData(GS, GS);
const BLEND = 11;                       // lower is softer at the borders

function unit(v) { const n = len(v) || 1; return [v[0]/n, v[1]/n, v[2]/n]; }
function hsl2rgb(h, s, l) {
  h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
  const c = (1 - Math.abs(2*l - 1)) * s, x = c * (1 - Math.abs((h/60) % 2 - 1)), m = l - c/2;
  let r, g2, b;
  if (h < 60) [r, g2, b] = [c, x, 0]; else if (h < 120) [r, g2, b] = [x, c, 0];
  else if (h < 180) [r, g2, b] = [0, c, x]; else if (h < 240) [r, g2, b] = [0, x, c];
  else if (h < 300) [r, g2, b] = [x, 0, c]; else [r, g2, b] = [c, 0, x];
  return [(r+m)*255, (g2+m)*255, (b+m)*255];
}
const FEELDIR = FEELS.map(f => ({ w: f.w, d: unit(f.pos), hue: f.hue, sat: f.sat, lit: f.lit,
                                  rgb: hsl2rgb(f.hue, f.sat, f.lit) }));

function drawMini() {
  if (!showMini) return;
  const F = frame(), fwd = unit(F.f);
  /* the disc is centred on where you look, so up on the globe is up in the world */
  const gr = unit(F.r), gu = unit(F.u);
  const px = gimg.data;
  for (let j = 0; j < GS; j++) {
    const v = (GC - j) / GR;
    for (let i = 0; i < GS; i++) {
      const u = (i - GC) / GR, k = (j * GS + i) * 4;
      const rr = u*u + v*v;
      if (rr > 1) { px[k+3] = 0; continue; }
      const w = Math.sqrt(1 - rr);
      const d0 = gr[0]*u + gu[0]*v + fwd[0]*w;
      const d1 = gr[1]*u + gu[1]*v + fwd[1]*w;
      const d2 = gr[2]*u + gu[2]*v + fwd[2]*w;
      /* a place is not one feeling or another at a hard line; weight every
         region by how nearly you face it, so borders shade into each other */
      let bs = -2;
      for (let q = 0; q < FEELDIR.length; q++) {
        const e = FEELDIR[q].d, sdot = d0*e[0] + d1*e[1] + d2*e[2];
        FEELDIR[q].t = sdot;
        if (sdot > bs) bs = sdot;
      }
      let r = 0, g2 = 0, b2 = 0, tot = 0;
      for (let q = 0; q < FEELDIR.length; q++) {
        const wq = Math.exp((FEELDIR[q].t - bs) * BLEND);
        if (wq < 0.012) continue;
        const c = FEELDIR[q].rgb;
        r += c[0]*wq; g2 += c[1]*wq; b2 += c[2]*wq; tot += wq;
      }
      const edge = Math.cos(FOV / 2);
      const vis = w >= edge ? 1 : Math.max(0, 1 - (edge - w) / 0.10);
      /* Measured against the world beside it: the globe painted at mean
         luminance 0.297 over 65% of its panel, the world at 0.026 over 3.5% of
         its own -- an eleven-fold outlier sitting in the corner of a nearly
         black field. It is a reference, not the subject. Halved, and the near
         face no longer runs to full strength. */
      const shade = 0.52 * (0.30 + 0.58 * w) * (0.40 + 0.60 * vis) / tot;
      px[k] = r * shade; px[k+1] = g2 * shade; px[k+2] = b2 * shade;
      px[k+3] = 255;
    }
  }
  mg.clearRect(0, 0, GS, GS);
  mg.putImageData(gimg, 0, 0);

  /* Every region on the near face keeps its name. A name that would land on
     another is pushed outward along its own radius until it is clear and given
     a leader back to its ground, because a label that blinks out as you turn is
     worse than one that has moved a little. */
  mg.textAlign = 'center'; mg.textBaseline = 'middle';
  const FS = 12.5;
  mg.font = `600 ${FS}px system-ui,-apple-system,"Segoe UI",sans-serif`;
  const cand = [];
  for (const f of FEELDIR) {
    f.gHit = null;
    const c = f.d[0]*fwd[0] + f.d[1]*fwd[1] + f.d[2]*fwd[2];
    if (c <= 0.04) continue;                        // genuinely round the back
    cand.push({ f, c,
      ax: GC + (f.d[0]*gr[0] + f.d[1]*gr[1] + f.d[2]*gr[2]) * GR,
      ay: GC - (f.d[0]*gu[0] + f.d[1]*gu[1] + f.d[2]*gu[2]) * GR });
  }
  cand.sort((a, b) => b.c - a.c);
  const put = [];
  for (const q of cand) {
    const tw = mg.measureText(q.f.w).width, bw = tw + 12, bh = FS + 7;
    const x = q.ax, y = q.ay;                       // nailed to its own region
    put.push([x, y, bw, bh]);
    const a = Math.min(1, Math.max(0.35, (q.c - 0.04) / 0.16));

    mg.fillStyle = `rgba(6,6,6,${a * 0.82})`;
    mg.beginPath(); mg.roundRect(x - bw/2, y - bh/2, bw, bh, 5); mg.fill();
    mg.strokeStyle = `hsla(${q.f.hue},${q.f.sat}%,${q.f.lit}%,${a * 0.85})`;
    mg.lineWidth = 1.2;
    mg.beginPath(); mg.roundRect(x - bw/2, y - bh/2, bw, bh, 5); mg.stroke();
    mg.fillStyle = `rgba(255,255,255,${a})`;
    mg.fillText(q.f.w, x, y + 0.5);
    q.f.gHit = [x, y];
  }
  mg.textBaseline = 'alphabetic';

  /* the rim of what you can see: the lit ground inside it is your field */
  mg.beginPath();
  mg.arc(GC, GC, GR * Math.sin(FOV / 2), 0, 6.2832);
  mg.strokeStyle = 'rgba(255,255,255,.55)'; mg.lineWidth = 1.4; mg.stroke();
}

/* dragging the globe IS turning your head -- identical to dragging the view */
let gDown = false, glx = 0, gly = 0, gMoved = 0;
mini.addEventListener('pointerdown', e => {
  gDown = true; gMoved = 0; glx = e.clientX; gly = e.clientY;
  mini.classList.add('drag'); mini.setPointerCapture(e.pointerId);
  target = null; vYaw = vPitch = 0;
  e.stopPropagation();
});
mini.addEventListener('pointermove', e => {
  if (!gDown) return;
  const dx = e.clientX - glx, dy = e.clientY - gly;
  gMoved += Math.abs(dx) + Math.abs(dy);
  vYaw = -dx * 0.0032; vPitch = dy * 0.0032;
  yaw += vYaw; pitch = Math.max(-1.35, Math.min(1.35, pitch + vPitch));
  glx = e.clientX; gly = e.clientY;
  draw(); readout(); drawMini();
  e.stopPropagation();
});
mini.addEventListener('pointerup', e => {
  gDown = false; mini.classList.remove('drag'); e.stopPropagation();
  if (gMoved > 5) return;
  const r = mini.getBoundingClientRect();
  const mx = (e.clientX - r.left) * GS / r.width, my = (e.clientY - r.top) * GS / r.height;
  let best = null, bd = 220;
  for (const f of FEELDIR) {
    if (!f.gHit) continue;
    const d = (f.gHit[0] - mx) ** 2 + (f.gHit[1] - my) ** 2;
    if (d < bd) { bd = d; best = f; }
  }
  if (best) faceTo(ITEMS.find(i => i.w === best.w).pos);
});
mini.addEventListener('dblclick', e => e.stopPropagation());

/* the window can be put wherever it is not in the way */
const gbar = document.getElementById('gbar');
let wDown = false, wx = 0, wy = 0;
gbar.addEventListener('pointerdown', e => {
  /* The close button lives inside the drag handle, and this listener calls
     setPointerCapture -- which retargets the pointerup to the bar, so down and
     up land on different elements and the browser never synthesises a click on
     the button. The X did nothing, and a synthetic click could not show it
     because a synthetic click skips the capture entirely.

     And the propagation must still be stopped. #view is the element the globe
     sits inside and it captures the pointer too, so simply declining to drag
     here handed the same problem one level up: the pointerup went to #view and
     the button still never saw a click. */
  if (e.target.closest('#gx')) { e.stopPropagation(); return; }
  wDown = true; wx = e.clientX; wy = e.clientY;
  const r = globe.getBoundingClientRect(), p = globe.parentElement.getBoundingClientRect();
  globe.style.left = (r.left - p.left) + 'px';
  globe.style.top = (r.top - p.top) + 'px';
  globe.style.right = 'auto'; globe.style.bottom = 'auto';
  gbar.classList.add('drag'); gbar.setPointerCapture(e.pointerId);
  e.stopPropagation();
});
gbar.addEventListener('pointermove', e => {
  if (!wDown) return;
  globe.style.left = (parseFloat(globe.style.left) + e.clientX - wx) + 'px';
  globe.style.top = (parseFloat(globe.style.top) + e.clientY - wy) + 'px';
  wx = e.clientX; wy = e.clientY;
  e.stopPropagation();
});
gbar.addEventListener('pointerup', e => { wDown = false; gbar.classList.remove('drag'); e.stopPropagation(); });

function toggleGlobe(on) {
  showMini = on === undefined ? !showMini : on;
  globe.style.display = showMini ? '' : 'none';
  document.getElementById('facing').classList.toggle('wide', !showMini);
  if (showMini) drawMini();
}
document.getElementById('gx').onclick = e => { e.stopPropagation(); toggleGlobe(false); };
addEventListener('keydown', e => {
  if (e.key === 'g' || e.key === 'G') {
    if (/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) return;
    toggleGlobe();
  }
});

const refit = () => { size(); draw(); readout(); drawMini(); };
addEventListener('resize', refit);
new ResizeObserver(refit).observe(view);

/* one loop: glide toward a target, or coast to a stop after a drag */
(function loop() {
  let moving = false;
  if (Math.abs(fovWant - FOV) > 0.0004) {
    FOV += (fovWant - FOV) * 0.16;
    moving = true;
  } else if (FOV !== fovWant) {
    FOV = fovWant; moving = true;
  }
  if (target) {
    let dy = target[0] - yaw;
    while (dy > Math.PI) dy -= 2 * Math.PI;
    while (dy < -Math.PI) dy += 2 * Math.PI;
    const dp = target[1] - pitch;
    if (Math.abs(dy) < 0.0015 && Math.abs(dp) < 0.0015) target = null;
    else { yaw += dy * 0.16; pitch += dp * 0.16; moving = true; }
  } else if (down) {
    moving = true;
  } else if (Math.abs(vYaw) > 0.00004 || Math.abs(vPitch) > 0.00004) {
    yaw += vYaw; pitch = Math.max(-1.1, Math.min(1.1, pitch + vPitch));
    vYaw *= 0.92; vPitch *= 0.92; moving = true;
  }
  if (approaching > 0) { stepApproach(); moving = true; }
  if (moving) { draw(); readout(); drawMini(); }
  requestAnimationFrame(loop);
})();
refit();
</script>
"""

out = HERE / 'horizon.html'
out.write_text(PAGE.replace('__DATA__', json.dumps(DATA)))
print('wrote', out, out.stat().st_size, 'bytes')
print('sky: magnitudes run', min(i['str'] for i in DATA['items']),
      'to', max(i['str'] for i in DATA['items']))
print('field: weeds run', min(t['dist'] for t in DATA['strains']),
      'to', max(t['dist'] for t in DATA['strains']), 'deep')
