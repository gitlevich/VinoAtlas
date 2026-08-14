"""Emit the view from the middle, as an environment rather than a projection.

Every word is placed at a real position: its direction is where it lies, and
its distance is how weakly it marks that direction. A word that strongly picks
out its direction stands close and large. A word that distinguishes almost
nothing stands far off, small and dim, near the horizon.

Apparent size and brightness therefore come from distance alone and do not
change when the reader turns -- which is the whole difference between looking
around a place and watching a chart deform.
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
    dist = NEAR + (FAR - NEAR) * (1 - strength) ** 1.5
    # the two axes the vocabularies agree on most go into the horizontal plane,
    # so turning your head sweeps the real structure; the weak third axis becomes
    # up and down, where looking is deliberate and rare
    i['pos'] = [round(d[0] * dist, 3), round(d[2] * dist, 3), round(d[1] * dist, 3)]
    i['dist'] = round(dist, 2)
    i['str'] = round(strength, 3)
    del i['p']
DATA = {k: D[k] for k in ('axes', 'items', 'chance', 'total', 'effectOrder')}
# The argmax ('e' in navdata) is deliberately NOT carried. It was the source of
# the colour-by-coin-toss bug and of a tooltip that named one effect while the
# mark was painted by a blend. What the page can state, it states from 'r'.
DATA['strains'] = [{'n': t['n'], 'r': t['r'], 'bh': t['bh'],
                    'p': [t['p'][0], t['p'][2], t['p'][1]]}
                   for t in D['strains']]
# Hue follows the direction a word lies in, so words sitting together get
# neighbouring colours and words sitting apart get separated ones. Nothing is
# assigned by hand: the arrangement does it.
for i in D['items']:
    x, y, z = i['pos']
    ang = math.degrees(math.atan2(z, x)) % 360
    lift = y / math.dist(i['pos'], [0, 0, 0])          # how high it sits
    i['hue'] = round(ang, 1)
    i['lit'] = _even(ang, (58 if i['kind'] == 'feel' else 63) + 14 * lift)
    i['sat'] = 74 if i['kind'] == 'feel' else 48
HUE = {i['w']: (i['hue'], i['lit']) for i in D['items'] if i['kind'] == 'feel'}
# A weed takes the colour of the ground it stands on: the same blend of nearby
# feeling regions the globe paints with. So its colour is always a colour some
# feeling actually has, it always agrees with where it sits, and the globe and
# the world say the same thing about the same place.
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
    t['h'] = round(math.degrees(math.atan2(vy, vx)) % 360, 1)
    t['l'] = _even(t['h'], 56 + 12 * d[1])
# strains are placed the same way words are: direction is where, distance is how
# weakly they mark it
smx = max(math.dist(t['p'], [0, 0, 0]) for t in DATA['strains'])
for t in DATA['strains']:
    n = math.dist(t['p'], [0, 0, 0]) or 1e-9
    d = [x / n for x in t['p']]
    dist = NEAR + (FAR - NEAR) * (1 - n / smx) ** 1.5
    t['pos'] = [round(x * dist, 3) for x in d]
    t['dist'] = round(dist, 2)
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
body{margin:0;background:var(--ground);color:var(--ink);overflow:hidden;
  font:13px/1.5 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
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
.s i{width:11px;height:11px;border-radius:3px;border:1.5px solid #4a4a4a;flex:none}
.s[aria-checked=yes]{color:var(--ink);font-weight:600}
.s[aria-checked=yes] i{background:var(--smell);border-color:var(--smell)}
button{background:var(--panel);color:var(--ink-2);border:1px solid var(--line);
  border-radius:6px;padding:5px 10px;font:inherit;font-size:11.5px;cursor:pointer}
button:hover{color:var(--ink);border-color:#414141}
button:focus-visible{outline:2px solid var(--feel);outline-offset:2px}
#foot{padding:9px 14px 12px;border-top:1px solid var(--line);display:flex;gap:6px}
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
  return '<div class=bars>' + show.map(([w, v]) => {
    const f = EFFECT_COLOUR[w];
    return `<div class=trk><i style="width:${Math.max(4, 100 * v / 9)}%;`
      + `background:hsl(${f.hue},${f.sat}%,${f.lit}%)"></i></div>`
      + `<span class=nm>${w}</span>`;
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

function ground(F) {
  /* A ring of ticks at eye level, far off. Turning slides them past, which is
     the cue that says a head turned rather than a chart deformed. */
  const R = 26;
  g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 1;
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
    const t = ST[k], q = place(t.pos, F);
    if (!q) continue;
    const off = Math.hypot(q.x - W/2, q.y - H/2) / (Math.min(W, H) * 0.62);
    const attend = 1 / (1 + off * off * 1.5);          // smooth, never a cliff
    const a = Math.max(0.30, Math.min(0.95, 2.6 / q.dist) * q.edge * attend);
    strains.push({ t, q, a, R: Math.max(1.6, (20 / q.dist) * (WIDE / FOV) ** 0.5) * q.edge });
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
      g.fillStyle = `hsla(${t.h},62%,${t.l - 14}%,${a * 0.5})`; g.fill();
      g.strokeStyle = `hsla(${t.h},75%,${t.l}%,${a})`; g.lineWidth = 1; g.stroke();
    } else {
      /* the profile itself: one spoke per feeling, so two strains that do the
         same thing carry the same shape */
      g.beginPath();
      for (let i = 0; i < t.r.length; i++) {
        const th = (i / t.r.length) * 6.2832 - 1.5708;
        const rr = R * (0.24 + 0.76 * t.r[i] / 9);
        const x = q.x + Math.cos(th) * rr, y = q.y + Math.sin(th) * rr;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.closePath();
      g.fillStyle = `hsla(${t.h},68%,${t.l}%,${a * 0.30})`; g.fill();
      g.strokeStyle = `hsla(${t.h},72%,${t.l}%,${a})`;
      g.lineWidth = Math.max(1, R * 0.07); g.stroke();
      g.beginPath(); g.arc(q.x, q.y, Math.max(1, R * 0.1), 0, 6.284);
      g.fillStyle = `hsla(${t.h},75%,${t.l + 12}%,${a})`; g.fill();
    }
    t.node = [q.x, q.y, R];
  }

  const seen = [];
  for (const it of ITEMS) {
    const p = place(it.pos, F);
    it.hit = null;
    if (p) seen.push({ it, p });
  }
  seen.sort((a, b) => b.p.dist - a.p.dist);           // far things first

  const drawn = [
    [W / 2, H - 30, W, 86],          // the readout strip along the bottom
    [W - 130, H - 130, 262, 262],    // the globe in the corner
    [W - 124, 74, 260, 168],         // the note in the top corner
  ];
  for (const { it, p } of seen) {
    const feel = it.kind === 'feel';
    const said = state.has(it.w);
    const sz = ((feel ? 4.2 : 3.8) / p.dist) * p.ppr * 0.0165 + 7;
    /* strength decides how present a landmark is; the edge of vision dims it.
       Distance is already carried by size, so it is not doubled up here. */
    const a = Math.max(0.42, Math.min(1, 0.22 + 0.78 * it.str) * p.edge);

    const label = feel ? it.w.toUpperCase() : it.w;
    g.font = `${said ? '600 ' : feel ? '500 ' : ''}${sz.toFixed(1)}px ui-sans-serif,sans-serif`;
    const track = feel ? sz * 0.13 : 0;
    const w = Math.max(g.measureText(label).width + track * (label.length - 1), sz * 2.2);
    const face = sz * (feel ? 1.5 : 1.15);          // room the mark needs above the word

    drawn.push([p.x, p.y, w, sz + face]);

    const my = p.y - sz * 0.75 - face * 0.42;       // where the face sits

    if (feel) {
      /* a beacon: a lit ring with a soft core. Something you head toward. */
      const R = face * 0.46;
      const glow = g.createRadialGradient(p.x, my, 0, p.x, my, R * 1.9);
      glow.addColorStop(0, `hsla(${it.hue},85%,${it.lit + 14}%,${a * 0.42})`);
      glow.addColorStop(1, `hsla(${it.hue},85%,${it.lit}%,0)`);
      g.fillStyle = glow;
      g.beginPath(); g.arc(p.x, my, R * 1.9, 0, 6.2832); g.fill();
      g.strokeStyle = `hsla(${it.hue},${it.sat + 6}%,${it.lit + 16}%,${a})`;
      g.lineWidth = Math.max(1.1, R * 0.17);
      g.beginPath(); g.arc(p.x, my, R, 0, 6.2832); g.stroke();
      g.beginPath(); g.arc(p.x, my, R * 0.24, 0, 6.2832);
      g.fillStyle = `hsla(${it.hue},90%,${it.lit + 26}%,${a})`; g.fill();
    } else {
      /* a breath: a low soft lens, wider than tall, drifting off to one side */
      const R = face * 0.44;
      g.strokeStyle = `hsla(${it.hue},${it.sat}%,${it.lit}%,${a * 0.9})`;
      g.lineWidth = Math.max(0.9, R * 0.13);
      g.beginPath(); g.ellipse(p.x, my, R * 1.35, R * 0.52, -0.18, 0, 6.2832); g.stroke();
      g.beginPath(); g.ellipse(p.x + R * 0.55, my - R * 0.34, R * 0.62, R * 0.26, -0.34, 0, 6.2832);
      g.strokeStyle = `hsla(${it.hue},${it.sat}%,${it.lit}%,${a * 0.5})`; g.stroke();
      g.fillStyle = `hsla(${it.hue},${it.sat}%,${it.lit}%,${a * 0.13})`;
      g.beginPath(); g.ellipse(p.x, my, R * 1.35, R * 0.52, -0.18, 0, 6.2832); g.fill();
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
  row.innerHTML = `<i></i><span>${s.w}</span>`;
  row.onclick = () => {
    if (state.has(s.w)) { state.delete(s.w); row.setAttribute('aria-checked', 'off'); }
    else { state.add(s.w); row.setAttribute('aria-checked', 'yes'); }
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
  let best = null, bd = 90;
  for (const t of ST) {
    if (!t.node) continue;
    const d = (t.node[0] - mx) ** 2 + (t.node[1] - my) ** 2;
    if (d < bd) { bd = d; best = t; }
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
    if (Math.abs(mx - x) < w/2 + 8 && Math.abs(my - y) < s) { faceTo(it.pos); return; }
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
view.addEventListener('wheel', e => {
  e.preventDefault();
  lean(e.deltaY > 0 ? 1.07 : 0.935);
}, { passive: false });
document.getElementById('bWide').onclick = () => lean(WIDE / fovWant);

document.getElementById('bClear').onclick = () => {
  state.clear();
  [...list.children].forEach(r => r.setAttribute('aria-checked', 'off'));
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
      const shade = (0.34 + 0.66 * w) * (0.40 + 0.60 * vis) / tot;
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
  if (moving) { draw(); readout(); }
  if (moving) drawMini();
  requestAnimationFrame(loop);
})();
refit();
</script>
"""

out = HERE / 'horizon.html'
out.write_text(PAGE.replace('__DATA__', json.dumps(DATA)))
print('wrote', out, out.stat().st_size, 'bytes')
print('distances run', min(i['dist'] for i in DATA['items']),
      'to', max(i['dist'] for i in DATA['items']))
