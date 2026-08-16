/* ---------- atlas ----------------------------------------------------------

   The shop as a place, with the reader standing in it.

   Everything else on this page reads a wine as five numbers. Five numbers is
   not somewhere you can be, so here they are three, and the shop is laid out by
   what its wines are like.

   Three kinds of thing live in it, and the difference between them is the whole
   design. A POLE -- "older", "more oaked" -- is a bearing and nothing else, a
   direction you face and never arrive at, so the ten of them hang at infinity
   and nothing the reader does moves them. Each measure is one straight line
   through the middle of the shop, so its trace on the sky is a single arc from
   its low name to its high one, and all five arcs cross where the middle is. An
   AROMA is not a bearing: cedar is something wines have, so it stands among
   them, at the middle of the wines described that way. A WINE is a thing at a
   place, and how far out it stands is how far it is from middling.

   The pair of them is the instrument. A camera pivoting on its own optical
   centre yields no depth at all -- every point sweeps by the same angle whatever
   its distance, which is exactly why a panorama can be stitched from one. A head
   is not that camera: the eye rides forward of the neck, so turning is also a
   small translation, and near glasses slide past far ones against a sky that
   holds still. That sliding is the only thing in the view that can say what is
   near and what is behind. */
const ATLAS = (function () {
const D = __ATLASDATA__;
const POLES = D.poles, TERMS = D.terms;
const WPOS = D.pos, WLEAN = D.lean, WCOL = D.col, WACC = D.acc, WDIST = D.dist;
const FIZZ = D.fizz;
const N = WPOS.length;
const MINE = S.wines.map(w => OWNED.has(w.id));
/* which of the ten orders a bottle came in -- 45 of them came in more than one */
const ORDERS = S.wines.map(w => (S.orders || [])
  .map((o, k) => (o.ids || []).includes(w.id) ? k + 1 : 0).filter(Boolean));

const cv = el('atlasCanvas'), g = cv.getContext('2d');
const mini = el('atlasMini'), mg = mini.getContext('2d');
let W = 0, H = 0, live = false;

const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const len = a => Math.hypot(a[0], a[1], a[2]);
const unit = v => { const n = len(v) || 1; return [v[0]/n, v[1]/n, v[2]/n]; };
let MARKRGB = '164,140,255', RISERGB = '226,163,90';

/* ---- colour, and the two grounds this page has ---------------------------
   The rest of the page is light by day and black by night, and this view has to
   be legible on both. Hue is the reader's own -- the ten pole colours are the
   ends of the sliders he drags in the Find tab -- so nothing here changes a hue.
   What changes is lightness: a colour that reads on black is washed out on
   white, and the same colour pulled down reads on both. */
let DARK = true;
function hex2hsl(h) {
  const n = parseInt(h.slice(1), 16);
  let r = ((n >> 16) & 255) / 255, gg = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l * 100];
  const d = mx - mn, s = d / (1 - Math.abs(2 * l - 1));
  const h2 = mx === r ? ((gg - b) / d + (gg < b ? 6 : 0)) : mx === gg ? ((b - r) / d + 2) : ((r - gg) / d + 4);
  return [h2 * 60, s * 100, l * 100];
}
/* the band a hue may occupy so that it carries against the ground behind it */
const fit = l => DARK ? Math.max(52, Math.min(84, l + 12)) : Math.max(24, Math.min(52, l - 10));
const tone = (hsl, a, dl) => `hsla(${hsl[0]},${hsl[1]}%,${fit(hsl[2]) + (dl || 0)}%,${a})`;
/* A stem is a few pixels of a mark whose bowl carries the colour, so it keeps
   more of its own lightness than a name does -- pushed up into the band a label
   needs, every ground in the shop came out the same pale rose. */
const near = (hsl, a) => `hsla(${hsl[0]},${hsl[1]}%,`
  + `${DARK ? Math.max(48, Math.min(74, hsl[2] + 8)) : Math.max(26, Math.min(52, hsl[2] - 6))}%,${a})`;
/* The ten pole colours are muted by design -- they are the ends of sliders, seen
   against a card. Lifted far enough to carry as a light in the sky they lose
   their hue and every name goes white, so a mark in the sky keeps its lightness
   nearer the middle and takes back in saturation what it gives up in lift. */
const vivid = (hsl, a, dl) => `hsla(${hsl[0]},${Math.min(92, hsl[1] + 22)}%,`
  + `${DARK ? Math.max(58, Math.min(76, hsl[2] + 4)) + (dl || 0)
            : Math.max(28, Math.min(46, hsl[2] - 8)) - (dl || 0) * 0.5}%,${a})`;
const INK = a => DARK ? `rgba(255,255,255,${a})` : `rgba(24,24,28,${a})`;
const readTheme = () => {
  const gr = getComputedStyle(cv).backgroundColor.match(/[\d.]+/g) || [0, 0, 0];
  DARK = (0.2126 * gr[0] + 0.7152 * gr[1] + 0.0722 * gr[2]) < 110;
};
for (const p of POLES) p.hsl = hex2hsl(p.col);
for (const t of TERMS) t.hsl = hex2hsl(t.acc = accentAt(t.pos));

/* the colour of the ground at a bearing: the poles it faces, blended, so a
   border shades into its neighbour instead of snapping */
function accentAt(p) {
  const d = unit(p);
  let best = -2;
  const cs = POLES.map(q => { const c = dot(d, q.dir); if (c > best) best = c; return c; });
  let r = 0, gg = 0, b = 0, tot = 0;
  POLES.forEach((q, i) => {
    const wq = Math.exp((cs[i] - best) * 11);
    const n = parseInt(q.col.slice(1), 16);
    r += ((n >> 16) & 255) * wq; gg += ((n >> 8) & 255) * wq; b += (n & 255) * wq; tot += wq;
  });
  return '#' + [r, gg, b].map(x => Math.round(x / tot).toString(16).padStart(2, '0')).join('');
}

/* WHAT IS IN THE GLASS is the colour of the wine, because that is the one thing
   about a bottle everybody reads before anything else. Reds run from purple
   through ruby to brick as they age -- the sequence the maturation axis puts
   them in -- and whites from pale green-gold to deep amber. Nothing else in the
   view is allowed to use these hues, so a glass is never mistaken for a place. */
function pour(i) {
  const w = S.wines[i], m = w.maturity, body = w.weight;
  /* A LIT GLASS, NOT A PHOTOGRAPH. Red at a given HSL lightness carries far less
     luminance than gold at the same number -- red contributes a fifth of the luma
     where green contributes seven tenths -- so a claret drawn "correctly" beside a
     Chablis came out at 0.36 of the screen's range against 0.79, and four fifths
     of this shop is red. Wine backlit glows; these are lifted until they do.
     Reds stay plainly darker than whites, which is true, and stop being a stain
     on the black, which is not. */
  /* Lifted for brightness once and taken too far: at 54 to 71 per cent lightness
     a red is salmon, not wine. Back into wine's own range -- ruby through garnet
     to brick -- and the light comes from saturation and from the glasses being
     bigger, not from washing the colour out. */
  if (WCOL[i] === 'white')                     // pale straw to deep amber
    return [52 - 14 * m, 58 + 28 * m, (DARK ? 74 : 58) - 13 * m];
  if (WCOL[i] === 'rose')                      // onion skin
    return [352 + 14 * m, 62 - 6 * m, (DARK ? 68 : 54) - 6 * m];
  return [348 + 32 * m, 74 - 6 * m,            // ruby through garnet to brick
          (DARK ? 46 : 32) + 9 * (1 - body) + 4 * m];
}

/* ---- the view ---------------------------------------------------------- */
let yaw = 0, pitch = 0, vYaw = 0, vPitch = 0, target = null;
const WIDE = 120 * Math.PI / 180;          // binocular human field, near enough
/* WHAT IT OPENS AT, which is not the same question. A hundred and twenty degrees
   is what a head takes in, and cramming it into a thousand pixels puts 1,652
   wines at about nine pixels to the degree: every glass five pixels across, and
   the colour of the wine -- the first thing anyone reads about a bottle -- gone.
   Opening at 74 leaves the same shop and the same walk, with each glass a quarter
   larger and two and a half times fewer of them at once. Step back returns here;
   the full field is still there for anyone who widens past it. */
const OPEN = WIDE * 0.62;
/* how far up and down you may look. Age stands eighty-two degrees off the
   horizon here, so a sixty-three degree limit would have put both of its names
   somewhere you could never turn to face. */
const PIT = 1.45;
let FOV = OPEN, fovWant = OPEN;

function frame() {
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  return { f: [cp*cy, sp, cp*sy], r: [-sy, 0, cy], u: [-sp*cy, cp, -sp*sy] };
}

/* TURNING IS MEASURED IN FIELDS, NOT IN PIXELS. The rate was a fixed 0.0032
   radians a pixel whatever the field, and a radian is worth W/FOV pixels -- so
   leaning in from 74 degrees to 9 made the same drag sweep the scene eight times
   further, and the closer you looked the more violently it moved. A hundred
   pixels turned 18.3 degrees at either end.

   Now it is proportional to the field, set so that a drag right across the pane
   turns you by one and a half of whatever you can see: 10.4 degrees per hundred
   pixels at rest, 0.8 at the closest the view goes. Half again over grabbing the
   scene and pulling it, which is 1.0, so a swipe still gets you somewhere; and
   the coast after a flick is damped more gently to match. */
const TURN = 1.5;
const rate = () => TURN * FOV / (W || 1);

/* A flat pinhole cannot carry 120 degrees -- it stretches the edges into the
   thing that feels wrong. This maps ANGLE to screen the way a panorama does, so
   a degree turned is the same number of pixels wherever you look. Apparent size
   still comes from true distance, so nothing swells as you turn. */
function place(P, F, fv) {
  const fov = fv || FOV;                 // a caller may ask about a field not yet eased into
  const fwd = dot(P, F.f), rgt = dot(P, F.r), up = dot(P, F.u);
  const th = Math.atan2(rgt, fwd);
  if (Math.abs(th) > fov / 2 + 0.05) return null;
  const ph = Math.atan2(up, Math.hypot(rgt, fwd));
  const ppr = W / fov;
  const y = H/2 - ph * ppr;
  if (y < -60 || y > H + 60) return null;
  /* Attention falls off toward the edge of vision, as it does in a head -- and it
     stops falling at the edge. The slack in the cull above is a fixed 0.05
     radians, which is a sliver of a wide field and a third of a narrow one, so at
     nine degrees this ran past 1 and returned NEGATIVE: marks drawn at a negative
     radius, inside out. Clamped at both ends. */
  const off = Math.min(1, Math.abs(th) / (fov / 2));
  return { x: W/2 + th * ppr, y, ppr, dist: len(P),
           edge: 1 - 0.55 * Math.pow(Math.max(0, off - 0.35) / 0.65, 1.6) };
}

/* YOUR EYE IS NOT ON THE PIVOT. The eye sits forward of the axis the neck turns
   about, so turning your head is a rotation AND a small translation, and near
   things really do slide past far ones. That is the depth cue a room gives you
   for free and a bare origin throws away. The neck must stay shorter than the
   nearest glass -- 2.87 here -- or turning would swing the eye through the shop. */
/* The rim was 5.0, which left 2.8 to walk. Out to 6.0 there is a third as far
   again to go, which is most of what "let me come closer" asks for -- the rest
   is the field of view, which now closes to nine degrees instead of seventeen.

   The price, stated rather than asserted away: the shop THINS out there. Sampled
   over 1,440 headings from the rim, 1.3% of them held nothing at all at the old
   rim and 7.6% do at this one, almost all of them looking steeply up or down,
   where the shop is only its own age axis. You can get somewhere empty now. You
   still cannot get outside. */
const NECK = 2.2, REACH = 6.0, ROAM = REACH - NECK;
let STAND = [0, 0, 0], EYE = [0, 0, 0];
const eyeAt = F => { EYE = [STAND[0] + F.f[0]*NECK, STAND[1] + F.f[1]*NECK, STAND[2] + F.f[2]*NECK]; };
const here = P => [P[0] - EYE[0], P[1] - EYE[1], P[2] - EYE[2]];

/* Anything that changes what you would see paints, here and now. Setting a flag
   for the animation loop to notice is the tidier design and it is wrong: the
   loop only runs while something is gliding, so where it is stopped -- a hidden
   tab, a throttled pane -- the flag is set, the state is perfect, and the screen
   never changes. A gesture that does not paint did not happen. */
const nudge = () => { if (live) { draw(); readout(); drawMini(); } };

/* ---- the approach, and what it is for -------------------------------------
   A thing attracts attention; attention moves toward it; what stays in frame
   through that movement is what was really there. Point at something and you are
   carried toward it, and every mark in the field is watched the whole way. What
   is still in view on arrival HELD; what slid out of frame did not. Only the
   field is tested -- the sky cannot fail this, which is why it is what the test
   is made against. */
let held = null, approaching = 0, watch = null;
const STEPS = 22;
function beginApproach() {
  if (len(STAND) > ROAM - 0.05) return;
  watch = new Map();
  for (const m of MARKS) watch.set(m, 0);
  approaching = STEPS; held = null;
  nudge();
}
function stepApproach() {
  walk(0.13);
  for (const [m, c] of watch) if (m.seen) watch.set(m, c + 1);
  if (--approaching > 0) return;
  held = new Set();
  for (const [m, c] of watch) if (c >= STEPS - 1) held.add(m);
  readout();
}
function walk(step) {
  const F = frame();
  const p = [STAND[0] + F.f[0]*step, STAND[1] + F.f[1]*step, STAND[2] + F.f[2]*step];
  const n = len(p);
  /* the shop closes around you rather than ending: press on at the rim and you
     slide along it instead of stepping outside and looking in */
  if (n > ROAM) for (let i = 0; i < 3; i++) p[i] *= ROAM / n;
  STAND = p; standWant = null;
  nudge();
}

/* WALKING GLIDES. A wheel arrives as a burst of small separate events, and a
   fixed jump on each of them is a stutter however small the jump is: the motion
   is made of the event stream rather than of time. So the gesture sets where you
   are heading and the loop eases you there, the same way the field of view is
   already eased. The step the gesture asks for is halved to match, since the
   glide keeps going after the fingers stop. */
let standWant = null;
function glide(step) {
  const F = frame(), b = standWant || STAND;
  const p = [b[0] + F.f[0]*step, b[1] + F.f[1]*step, b[2] + F.f[2]*step];
  const n = len(p);
  if (n > ROAM) for (let i = 0; i < 3; i++) p[i] *= ROAM / n;
  standWant = p;
}
function easeStand() {
  if (!standWant) return false;
  const d = [standWant[0] - STAND[0], standWant[1] - STAND[1], standWant[2] - STAND[2]];
  if (len(d) < 0.0015) { STAND = standWant; standWant = null; return false; }
  STAND = [STAND[0] + d[0]*0.16, STAND[1] + d[1]*0.16, STAND[2] + d[2]*0.16];
  return true;
}
function faceTo(d) {
  const n = len(d) || 1;
  target = [Math.atan2(d[2]/n, d[0]/n), Math.asin(Math.max(-1, Math.min(1, d[1]/n)))];
}

/* every mark in the field, in one list, because the approach watches them all */
const MARKS = [];
for (let i = 0; i < N; i++) MARKS.push({ kind: 'wine', i, pos: WPOS[i], dist: WDIST[i],
                                         lean: WLEAN[i], seen: false, node: null });
for (const t of TERMS) MARKS.push({ kind: 'term', t, pos: t.pos, dist: t.dist,
                                    str: t.str, seen: false, node: null });
const WMARK = MARKS.filter(m => m.kind === 'wine');
const TMARK = MARKS.filter(m => m.kind === 'term');

/* ---- the floor ------------------------------------------------------------
   A ring of ticks at eye level, far off. Turning slides them past, which is the
   cue that says a head turned rather than a chart deformed. They are also the
   only midtone in the view: without them the scene is bright specks on an
   absolute ground, the eye adapts to the ground, and everything else sinks. */
function ground(F) {
  const R = 26;
  g.strokeStyle = INK(DARK ? 0.15 : 0.13); g.lineWidth = 1;
  let started = false;
  g.beginPath();
  for (let a = 0; a <= 360; a += 3) {
    const t = a * Math.PI / 180;
    const p = place([Math.cos(t)*R, 0, Math.sin(t)*R], F);
    if (!p) { started = false; continue; }
    if (!started) { g.moveTo(p.x, p.y); started = true; } else g.lineTo(p.x, p.y);
  }
  g.stroke();
  for (let a = 0; a < 360; a += 10) {
    const t = a * Math.PI / 180, big = a % 30 === 0;
    const p = place([Math.cos(t)*R, 0, Math.sin(t)*R], F);
    if (!p) continue;
    g.strokeStyle = INK((big ? 0.17 : 0.08) * p.edge);
    g.lineWidth = big ? 1.4 : 1;
    g.beginPath(); g.moveTo(p.x, p.y - (big ? 9 : 5)); g.lineTo(p.x, p.y + (big ? 9 : 5)); g.stroke();
  }
  g.strokeStyle = INK(0.045); g.lineWidth = 1;
  for (const r of [9, 17, 30]) {
    started = false; g.beginPath();
    for (let a = 0; a <= 360; a += 6) {
      const t = a * Math.PI / 180;
      const p = place([Math.cos(t)*r, -6.5, Math.sin(t)*r], F);
      if (!p) { started = false; continue; }
      if (!started) { g.moveTo(p.x, p.y); started = true; } else g.lineTo(p.x, p.y);
    }
    g.stroke();
  }
}

/* THE FIVE MEASURES USED TO BE DRAWN AS LINES, and are not any more.

   Each measure is a straight line through the middle of the shop, so its image
   from a point off it is half a great circle from one pole to the other, and all
   five cross where the middle is. It was true, it was well founded, and it read
   as a starburst laid over the shop -- five bright arcs converging on a point in
   the middle of the view, competing with the thing they were meant to frame. The
   weed space has nothing of the kind and does not miss it.

   What they were carrying was the measure NAMES, since four of the ten poles lie
   within fourteen degrees of each other and only one or two are ever in view.
   The globe carries that instead: it shows every name on the near face, and it
   is the only view that shows what is behind you. */

/* ---- a wine is a glass ----------------------------------------------------
   Drawn as the thing everyone already knows: bowl, stem, foot, and wine in it to
   about half. The bowl says what colour the wine is; the stem takes the colour
   of the ground it stands on -- the same blend of pole regions the globe is
   painted with -- so a glass says what it is AND where it is without being read.
   Bottles on the reader's own account carry a ring behind them, in the purple
   this page uses for him everywhere else. */
/* WHAT HE BOUGHT IS A BOTTLE; WHAT THE SHOP HAS IS A GLASS.
   Three badges were tried against the glass and all three failed. A halo at six
   pixels is a smudge. A ring reads, being an edge, but says only "this one". A
   tick reads too, and it lay across the bowl, and it says "done", not "bought" --
   and at a distance it stopped looking like a glass at all.
   No badge, then. A bottle is the thing you buy and a glass is the thing you are
   offered, so the mark changes rather than being decorated: no overlay, nothing
   distorted, the wine's own colour kept in both, and the two silhouettes -- a
   tall shouldered thing against a cup on a stem -- separate at three pixels. */
function bottle(x, y, R, i, a) {
  /* A BORDEAUX BOTTLE. The first one was as wide at the neck as half its body
     and had its shoulder a third of the way down: that is a sauce bottle. A wine
     bottle is a third neck, a short hard shoulder, and straight sides -- and the
     neck is barely a third of the body's width. */
  const H = R*2.3, W = R*0.60;
  const top = y - H*0.54, bot = y + H*0.46;
  const nk = W*0.165;                       // half the neck
  const sh1 = top + H*0.33, sh2 = top + H*0.46;
  const wine = pour(i);
  g.beginPath();
  g.moveTo(x - nk, top);
  g.lineTo(x + nk, top);
  g.lineTo(x + nk, sh1);
  g.bezierCurveTo(x + nk, sh1 + H*0.06, x + W/2, sh2 - H*0.07, x + W/2, sh2);
  g.lineTo(x + W/2, bot);
  g.lineTo(x - W/2, bot);
  g.lineTo(x - W/2, sh2);
  g.bezierCurveTo(x - W/2, sh2 - H*0.07, x - nk, sh1 + H*0.06, x - nk, sh1);
  g.closePath();
  const A1 = Math.min(1, a*1.3);
  const lq = g.createLinearGradient(x - W/2, 0, x + W/2, 0);
  lq.addColorStop(0,    `hsla(${wine[0]},${wine[1]+4}%,${Math.max(12, wine[2]-14)}%,${A1})`);
  lq.addColorStop(0.30, `hsla(${wine[0]},${wine[1]-8}%,${Math.min(88, wine[2]+16)}%,${A1})`);
  lq.addColorStop(0.58, `hsla(${wine[0]},${wine[1]}%,${wine[2]}%,${A1})`);
  lq.addColorStop(1,    `hsla(${wine[0]+4},${wine[1]+4}%,${Math.max(10, wine[2]-18)}%,${A1})`);
  g.fillStyle = lq;                    // glass turned to the light down one side
  g.fill();
  /* the capsule, in the colour of the ground it stands on -- the one thing the
     stem used to carry and the only place left to put it */
  g.fillStyle = near(hex2hsl(WACC[i]), a);
  g.fillRect(x - nk*1.28, top, nk*2.56, H*0.085);
  if (R >= 7) {                        // a label, once there is room for one
    g.fillStyle = INK(a * (DARK ? 0.22 : 0.16));
    g.fillRect(x - W/2, top + H*0.60, W, H*0.24);
  }
}

function glass(x, y, R, i, a, mine) {
  if (mine) return bottle(x, y, R, i, a);
  const fz = FIZZ[i];
  const rw = R*(fz ? 0.30 : 0.50), top = y - R*(fz ? 0.98 : 0.84);
  const bot = y + R*(fz ? 0.20 : 0.12), dep = bot - top;
  const wine = pour(i);
  /* Most of the shop is drawn a handful of pixels across, and at that size a
     white rim and a highlight take more of the mark than the wine does -- which
     is how a field of clarets came out looking like a field of pale pink. So the
     vessel is only drawn where there is room for it: small, the bowl is FULL and
     the mark is its colour; big, it is poured to a level and the glass appears
     around it. Nothing changes shape between the two, only how much is there. */
  const fine = R >= 6.5;
  /* A SPARKLING WINE IS A FLUTE. Narrow, tall, filled higher, with the bubbles
     drawn once there is room for them -- a silhouette anyone tells from a bowl
     across a room, which a colour cannot do because half of these are white and
     half are red.

     The catalogue's own sparkling flag is not what decides this: it marks Cheval
     Blanc 1928 and Haut Brion 1937 as sparkling. A wine is a flute here when its
     own name, grape or region says so, and every one of those can be checked by
     reading it. */
  const fizz = fz;

  const bowl = () => {
    g.beginPath();
    g.moveTo(x - rw, top);
    g.bezierCurveTo(x - rw, top + dep*(fizz ? 0.90 : 0.66), x - rw*0.44, bot, x, bot);
    g.bezierCurveTo(x + rw*0.44, bot, x + rw, top + dep*(fizz ? 0.90 : 0.66), x + rw, top);
  };
  bowl(); g.closePath();
  g.save(); g.clip();
  const line = fine ? top + dep*(fizz ? 0.22 : 0.42) : top - 1;
  /* THE COLOUR IS THE POINT and is drawn past the strength of the rest of the
     mark, because what colour a wine is is the first thing anybody reads about a
     bottle and it is carried by three or four pixels. */
  /* LIQUID, NOT PAINT. A flat fill is a coloured shape; wine in a bowl is lighter
     where the surface meets the air and deepest at the base, and it carries a
     small bright point where the light lands. Two stops and a dot do it. */
  const A1 = Math.min(1, a * 1.3);
  const lq = g.createLinearGradient(x, line, x, bot);
  lq.addColorStop(0,    `hsla(${wine[0]},${wine[1]-6}%,${Math.min(88, wine[2]+16)}%,${A1})`);
  lq.addColorStop(0.35, `hsla(${wine[0]},${wine[1]}%,${wine[2]}%,${A1})`);
  lq.addColorStop(1,    `hsla(${wine[0]+4},${wine[1]+4}%,${Math.max(14, wine[2]-14)}%,${A1})`);
  g.fillStyle = lq;
  g.fillRect(x - rw - 1, line, rw*2 + 2, bot - line + 1);
  if (R >= 5) {
    const hl = g.createRadialGradient(x - rw*0.42, line + (bot-line)*0.30, 0,
                                      x - rw*0.42, line + (bot-line)*0.30, R*0.30);
    hl.addColorStop(0, `hsla(${wine[0]},${wine[1]-10}%,96%,${A1*0.55})`);
    hl.addColorStop(1, `hsla(${wine[0]},${wine[1]}%,96%,0)`);
    g.fillStyle = hl;
    g.fillRect(x - rw - 1, line, rw*2 + 2, bot - line + 1);
  }
  if (fine) {
    g.fillStyle = INK(a * (DARK ? 0.14 : 0.07));
    g.fillRect(x - rw - 1, top - 1, rw*2 + 2, line - top + 1);
    /* one highlight down the left of the bowl, which is what makes it read as
       glass rather than as a filled shape */
    g.fillStyle = INK(a * (DARK ? 0.44 : 0.18));
    g.fillRect(x - rw*0.86, top + dep*0.14, Math.max(1, R*0.07), dep*0.60);
    if (fizz) {                                  // the bubbles, once they can be seen
      g.fillStyle = INK(a * (DARK ? 0.70 : 0.30));
      for (const [bx, by, br] of [[-0.22, 0.68, 0.055], [0.20, 0.52, 0.045],
                                  [-0.05, 0.36, 0.05], [0.24, 0.80, 0.04]]) {
        g.beginPath();
        g.arc(x + rw*bx*2, top + dep*by, Math.max(0.6, R*br), 0, 6.2832);
        g.fill();
      }
    }
  }
  g.restore();
  if (fine) {
    g.strokeStyle = INK(a * (DARK ? 0.55 : 0.34));
    g.lineWidth = Math.max(0.8, R*0.05);
    bowl(); g.stroke();
  }
  /* stem and foot, in the colour of the ground the glass stands on */
  g.strokeStyle = near(hex2hsl(WACC[i]), a);
  g.lineWidth = Math.max(1, R*0.085);
  g.beginPath(); g.moveTo(x, bot - 0.5); g.lineTo(x, y + R*0.72); g.stroke();
  g.beginPath();
  if (fine) g.ellipse(x, y + R*0.74, R*0.34, Math.max(0.7, R*0.085), 0, 0, 6.2832);
  else { g.moveTo(x - R*0.30, y + R*0.72); g.lineTo(x + R*0.30, y + R*0.72); }
  g.stroke();
}

/* ---- the paint ---------------------------------------------------------- */
const drawn = [];

function draw() {
  const F = frame();
  eyeAt(F);
  g.clearRect(0, 0, W, H);
  /* the chrome claims its space first, so nothing written afterwards -- a
     measure's name along its line, a wine's name beside its glass -- is put
     where a panel already is */
  drawn.length = 0;
  drawn.push([W/2, H - 26, W, 78], [W - 118, H - 118, 240, 240], [W - 26, 26, 60, 60]);
  ground(F);

  g.strokeStyle = INK(0.16); g.lineWidth = 1;
  g.beginPath(); g.arc(W/2, H/2, 34, 0, 6.284); g.stroke();
  g.beginPath();
  g.moveTo(W/2 - 6, H/2); g.lineTo(W/2 + 6, H/2);
  g.moveTo(W/2, H/2 - 6); g.lineTo(W/2, H/2 + 6);
  g.strokeStyle = INK(0.3); g.stroke();

  /* Every wine is in the shop, all of them, all the time. Nothing is gated on
     what you happen to be aiming at, because a thing that blinks out when you
     turn your head is not a thing in a place. What changes as you turn is only
     how plainly you can make it out. */
  const shown = [];
  for (const m of WMARK) {
    m.node = null; m.seen = false;
    const q = place(here(m.pos), F);        // from the eye, so it parallaxes
    if (!q) continue;
    m.seen = true;
    /* A canvas with no area has nothing off-centre. Drawn before it has been
       measured -- a tab that never opened -- this divided nought by nought and
       every wine was painted at an alpha of NaN, which the engine rejects: one
       bad colour and the whole frame stops. */
    const span = Math.min(W, H) * 0.62;
    const off = span > 0 ? Math.hypot(q.x - W/2, q.y - H/2) / span : 0;
    /* Attention falls off toward the edge of the eye, but not off a cliff. At
       the full field almost everything IS off-centre, and a square law took the
       whole shop down with it -- zoom out and the wines stopped being wines. */
    const attend = 1 / (1 + off*off*0.55);
    /* A wine that commits to nothing is a SMALLER thing, not merely a nearer
       one. The uncommitted ones sit near the middle and so near you, and plain
       1/distance would make the blandest wine in the shop the biggest object in
       the view. Its own size carries how far from middling it is, and distance
       then does what distance does.

       The two very nearly cancel -- which is right, since how far a wine is from
       middling is not a function of where the reader happens to be standing --
       so anything ADDED to the numerator flattens them into one size. A constant
       of 0.30 did exactly that: 424 glasses in view came out at a median 11.1
       pixels with a quartile spread of 1.4, and the shop read as wallpaper.

       Removing it barely helped, and the arithmetic says why: distance from the
       EYE is the radius less a neck, so R goes as lean/(0.4 + 8.4 lean), which is
       flat above about a fifth of the way out. So a glass simply holds its size,
       as it should -- how far a wine is from middling is not a function of where
       the reader is standing -- and the whole of that reading is carried by how
       plainly it is drawn instead. */
    let a = Math.max(DARK ? 0.82 : 0.82, Math.min(1, 0.52 + 1.5 * m.lean) * q.edge * attend);
    if (held && !held.has(m)) a *= 0.34;
    /* HOW BIG A THING IS, BOUNDED AT BOTH ENDS.
       Apparent size goes as one over distance, and the distance here is measured
       from the EYE, which rides a neck INTO the field -- so a wine you have walked
       up to sits at a fraction of a unit and blows up to fill the view while
       everything else stays a speck. Nothing about the shop can be reconstructed
       from that. The near end is clamped so nothing can explode, and the drawn
       size is held between five and thirty pixels, which is the range over which
       a glass reads as a glass. Inside that range size still falls off with
       distance and the reading survives; outside it there was no reading, only
       one enormous object and a field of dust. */
    const dEye = Math.max(1.6, q.dist);
    let R = Math.max(5, Math.min(30,
      (74 * m.lean / dEye) * Math.pow(WIDE/FOV, 0.5))) * (0.72 + 0.28 * q.edge);
    const asked = !onlyThese || onlyThese.has(m.i);
    if (!asked) { a = Math.max(0.13, a * 0.22); R *= 0.6; }
    shown.push({ m, q, a, R, asked });
  }
  shown.sort((x, y) => y.q.dist - x.q.dist);

  /* NOTHING STANDS ON TOP OF ANYTHING ELSE. Two wines a hair apart in the shop
     are a hundred pixels apart on the screen at nothing, and leaned in they land
     on each other -- a bottle inside a glass reads as one strange object rather
     than as two wines. So a mark that would cover one already placed steps to
     the right by half its own width until it is clear.

     It is a small lie about where a thing is and it is stated: the step is half a
     width, never more than four of them, and the mark keeps its own size and
     depth. Cheap enough to do every frame because the placed marks go into a
     grid of the cell size, so each one is compared against its neighbours and
     not against the five hundred others in view. */
  /* Only where a mark is big enough for the stacking to be confusing. Zoomed
     right out there are five hundred glasses in a view and they genuinely do
     crowd; pushing them apart there would scatter the shop to hide a density
     that is true. Eleven pixels is where a glass is large enough that one sitting
     inside another reads as a single strange object rather than as a crowd. */
  const CELL = 40, grid = new Map(), BIG = 11;
  const key = (cx, cy) => ((cx * 46341) ^ cy);
  for (const it of shown) {
    if (it.R < BIG) continue;
    const x0 = it.q.x;
    for (let step = 0; step < 15; step++) {
      const cx = Math.floor(it.q.x / CELL), cy = Math.floor(it.q.y / CELL);
      let clash = false;
      for (let dx = -1; dx <= 1 && !clash; dx++)
        for (let dy = -1; dy <= 1 && !clash; dy++) {
          const b = grid.get(key(cx + dx, cy + dy));
          if (!b) continue;
          for (const o of b) {
            const w = (it.R + o.R) * 0.62, h = (it.R + o.R) * 1.05;
            if (Math.abs(it.q.x - o.q.x) < w && Math.abs(it.q.y - o.q.y) < h) { clash = true; break; }
          }
        }
      if (!clash) break;
      /* right, then left, then further right: a cluster spreads both ways rather
         than growing one train off to one side */
      const n = step + 1;
      it.q.x = x0 + (n % 2 ? 1 : -1) * Math.ceil(n / 2) * it.R * 0.55;
    }
    const gx = Math.floor(it.q.x / CELL), gy = Math.floor(it.q.y / CELL), k = key(gx, gy);
    const b = grid.get(k); if (b) b.push(it); else grid.set(k, [it]);
  }
  for (const { m, q, a, R, asked } of shown) {
    /* THERE IS NO SMALL FORM ANY MORE. Below three pixels a wine used to become
       a plain triangle, and zoomed out that was nearly the whole shop: the colour
       survived and everything else -- the vessel, the flute, the tick -- was
       gone. The floor on R is above the size the triangle existed for, so a wine
       is always a glass. */
    glass(q.x, q.y, R, m.i, a, MINE[m.i] && asked);
    m.node = [q.x, q.y, R, a];
  }

  /* The SKY is projected straight -- a pole is at infinity and no amount of
     walking shifts it. An AROMA is in the field, projected from the eye like the
     glasses, because it is a thing the wines have and it must drift with them. */
  const seen = [];
  for (const p of POLES) { p.hit = null; const q = place(p.dir, F); if (q) seen.push({ it: p, p: q, sky: true }); }
  for (const m of TMARK) {
    m.node = null; m.seen = false;
    const q = place(here(m.pos), F);
    if (!q) continue;
    m.seen = true;
    seen.push({ it: m.t, p: q, sky: false, m });
  }
  seen.sort((a, b) => (a.sky !== b.sky) ? (a.sky ? -1 : 1)
                    : a.sky ? a.it.str - b.it.str : b.p.dist - a.p.dist);

  for (const { it, p, sky, m } of seen) {
    const said = !sky && state.has(it.w);
    /* Magnitude, not distance and not size. A pole holds a fixed size on the
       screen: it is infinitely far, so nothing you do resolves it into a disc,
       and scaling it with pixels-per-radian would make it swell as you squint.
       An aroma is a thing at a distance, so it recedes by its own sharpness over
       how far off it is. */
    const sz = sky ? 11 + 6 * it.str
                   : Math.max(11, Math.min(22, 82 * it.str / Math.max(1.6, p.dist))) + 4;
    let a = sky ? Math.max(DARK ? 0.74 : 0.80, Math.min(1, 0.48 + 0.52 * it.str) * p.edge)
                : Math.max(DARK ? 0.74 : 0.78, Math.min(1, 10 * it.str / p.dist) * p.edge);
    if (!sky && held && m && !held.has(m)) a *= 0.34;
    /* the rule applies to the words too, or the question ends up brighter than
       the answer: ask for truffle and every other word goes on shouting while
       the seventy-one wines it lit sit quietly behind them */
    if (!sky && onlyThese && !said) a *= 0.5;

    const label = sky ? it.w.toUpperCase() : it.w;
    g.font = `${said ? '600 ' : sky ? '500 ' : ''}${sz.toFixed(1)}px ui-sans-serif,system-ui,sans-serif`;
    const track = sky ? sz * 0.11 : 0;
    const w = Math.max(g.measureText(label).width + track * (label.length - 1), sz * 2.2);
    const face = sz * (sky ? 1.35 : 1.15);
    /* THE GLYPH ON TOP, THE NAME UNDER IT. The clearance is computed from how far
       each glyph actually reaches from its own centre, per kind -- a halo and
       three rising waves do not extend alike. */
    const reach = sky ? face * 1.1 : face * 0.95;
    const my = p.y - sz * 0.86 - reach;
    /* THE MARK STAYS PUT AND THE NAME SLIDES. A pole is a bearing, so its glow
       is drawn exactly where the bearing is, even hard against the edge of the
       view -- but a name centred there is half off the screen, and FULL-BODIED
       arriving as "DIED" is worse than a name that has moved a little. It slides
       rather than switching off, because a label that blinks out as you turn is
       worse than either. */
    const tx = Math.max(w / 2 + 4, Math.min(W - w / 2 - 4, p.x));
    drawn.push([tx, (p.y + my) / 2, w, sz + reach * 2.4]);

    if (sky) {
      /* A POLE IS A GLOW, not a point. The name marks an end of a measure, and
         an end is a region you head toward, never a spot you land on. How much
         of the measure survived the drop to three dimensions sets how CONCENTRATED
         the glow is, not how big: a measure the space kept whole has a tight
         bright heart, one it half lost is the same size and smeared. */
      const NR = face * 1.9, conc = 0.14 + 0.30 * it.str;
      const gd = g.createRadialGradient(p.x, my, 0, p.x, my, NR);
      gd.addColorStop(0, vivid(it.hsl, a * (DARK ? 0.52 : 0.38), DARK ? 8 : 6));
      gd.addColorStop(conc, vivid(it.hsl, a * (DARK ? 0.24 : 0.18), 0));
      gd.addColorStop(1, vivid(it.hsl, 0));
      g.fillStyle = gd;
      g.beginPath(); g.arc(p.x, my, NR, 0, 6.2832); g.fill();
      const hr = NR * 0.24;
      const gh = g.createRadialGradient(p.x, my, 0, p.x, my, hr);
      gh.addColorStop(0, vivid(it.hsl, a, DARK ? 18 : 2));
      gh.addColorStop(0.5, vivid(it.hsl, a * 0.5, DARK ? 8 : 0));
      gh.addColorStop(1, vivid(it.hsl, 0));
      g.fillStyle = gh;
      g.beginPath(); g.arc(p.x, my, hr, 0, 6.2832); g.fill();
    } else {
      /* AN AROMA IS RISING WAVES -- stood upright, because rising is what a smell
         does and lying flat is what a line does. Two tones: the middle wave
         carries the colour of the ground it stands in, the outer pair a pale tint
         of it. How far they waver is how weakly the word holds its bearing. */
      const R = face * 0.9, wig = 0.42 + 1.05 * (1 - it.str);
      g.lineCap = 'round'; g.lineWidth = Math.max(1.5, R * 0.16);
      for (let k = -1; k <= 1; k++) {
        const xx = p.x + k * R * 0.40;
        g.strokeStyle = k === 0 ? tone(it.hsl, a, 4)
                                : tone([it.hsl[0], Math.max(20, it.hsl[1] - 26), it.hsl[2]],
                                       a * 0.8, DARK ? 20 : -14);
        g.beginPath();
        g.moveTo(xx, my + R);
        g.bezierCurveTo(xx + R*0.34*wig, my + R*0.34, xx - R*0.34*wig, my - R*0.34, xx, my - R);
        g.stroke();
      }
    }

    if (said) {
      g.fillStyle = `rgba(${RISERGB},.15)`;
      g.beginPath();
      g.roundRect(tx - w/2 - 8, p.y - sz*0.78 - face, w + 16, sz*1.2 + face, 6);
      g.fill();
    }
    /* An AROMA NAME CARRIES ITS OWN GROUND. Four fifths of this shop is red, so
       four fifths of its vocabulary points the same way and lands in one corner
       of the sky -- tobacco, cedar and chocolate written across each other, and
       none of the three readable. The names are painted far-to-near like the
       marks they belong to, so a plate behind each one lets the nearest win and
       leaves the ones behind it partly covered. That is what being behind
       something looks like, and nothing has to blink out to achieve it. */
    if (!sky) {
      const bw = w + 10, bh = sz * 1.25;
      g.fillStyle = DARK ? `rgba(0,0,0,${0.74 * a})` : `rgba(233,233,238,${0.80 * a})`;
      g.beginPath();
      g.roundRect(tx - bw / 2, p.y - sz * 0.86, bw, bh, 4);
      g.fill();
    }
    g.fillStyle = sky ? vivid(it.hsl, a, 10) : tone(it.hsl, a, 2);
    if (sky) {
      let cx = tx - w/2 + (w - (g.measureText(label).width + track*(label.length-1))) / 2;
      g.textAlign = 'left';
      for (const ch of label) { g.fillText(ch, cx, p.y); cx += g.measureText(ch).width + track; }
    } else {
      g.textAlign = 'center';
      g.fillText(label, tx, p.y);
    }
    it.hit = [tx, p.y, w, sz + face];
  }

  /* Names arrive by themselves: leaning in spreads the glasses apart, so more of
     them have room for a name beside them. */
  /* Names arrive by leaning in, so the gate is on the field it OPENS at rather
     than on the widest one available -- against the full field, opening at 74
     degrees is already past the threshold and every name appeared at rest. */
  if (FOV < OPEN * 0.84) {
    const lit = shown.filter(s => s.asked && s.R >= 5).sort((a, b) => b.R - a.R).slice(0, 40);
    const fs = Math.max(9, Math.min(13, 10 * Math.pow(WIDE/FOV, 0.45)));
    g.font = `${fs.toFixed(1)}px ui-sans-serif,system-ui,sans-serif`;
    g.textAlign = 'left';
    for (const { m, q, R } of lit) {
      const nm = S.wines[m.i].name;
      const tw = g.measureText(nm).width;
      const bx = q.x + R*0.6 + 5, by = q.y - fs/2;
      if (drawn.some(b => bx < b[0] + b[2]/2 + 4 && bx + tw > b[0] - b[2]/2 - 4
                       && by < b[1] + b[3]/2 + 3 && by + fs > b[1] - b[3]/2 - 3)) continue;
      drawn.push([bx + tw/2, q.y, tw, fs]);
      g.fillStyle = INK(0.62);
      g.fillText(nm, bx, q.y + fs/3);
    }
  }
}

/* ---- what lies this way -------------------------------------------------- */
const ATTEND = 0.84;
const state = new Set();

/* TICKING A WORD LIGHTS ITS WINES AND QUIETS THE REST, which is the only handle
   on the crowd that is made of the reader's own question rather than of a number
   somebody chose. Four fifths of this shop is red and its whole vocabulary points
   the same way, so the red half of the sky is a wall; tick "cedar" and 173 wines
   stay lit out of 1,652. The rest do not go away -- a shop you cannot see past is
   still the shop -- they go quiet, and walking still carries you among them. */
let onlyThese = null, askedNothing = false;
function refilter() {
  let keep = null;
  for (const w of state) {
    const s = new Set(TERMS.find(t => t.w === w).in);
    keep = keep === null ? s : new Set([...keep].filter(i => s.has(i)));
  }
  /* AN EMPTY ANSWER MUST NOT BLACK OUT THE SHOP. Words are read together, and
     four of them together often name nothing at all; quieting every wine then
     leaves a field of specks with no way to tell what is there except to walk
     over and look. If nothing matches, the shop stays lit and the readout says
     so. */
  askedNothing = keep !== null && keep.size === 0;
  onlyThese = (keep && keep.size) ? keep : null;
  countRows();
}

/* AND THE LIST SAYS WHAT ADDING A WORD WOULD DO, before it is clicked: the count
   beside each word is how many are left if you add it to what is already ticked.
   A word that would leave none is greyed. Otherwise the only way to find out is
   to tick it and watch the shop go dark. */
function countRows() {
  for (const row of wordList.children) {
    const t = TERMS.find(x => x.w === row.dataset.w);
    const on = state.has(t.w);
    const n = (onlyThese && !on) ? t.in.reduce((k, i) => k + (onlyThese.has(i) ? 1 : 0), 0)
                                 : (askedNothing && !on ? 0 : t.n);
    row.querySelector('em').textContent = n;
    row.classList.toggle('none', n === 0 && !on);
  }
}

function bundle(F) {
  /* Something is always ahead. If nothing sits straight in front, the cone opens
     until it finds the nearest things and says how far round they are: a space
     has no dead ends, only sparser country. */
  const all = POLES.map(p => ({ p, c: dot(p.dir, F.f) }))
    .concat(TERMS.map(t => ({ t, c: dot(unit(t.pos), F.f) })))
    .sort((a, b) => b.c - a.c);
  let near = all.filter(o => o.c > ATTEND), wide = false;
  if (near.length < 2) { near = all.slice(0, 6); wide = true; }
  const off = wide && near.length
    ? Math.round(Math.acos(Math.max(-1, Math.min(1, near[0].c))) * 57.3) : 0;
  return { poles: near.filter(o => o.p).map(o => o.p).slice(0, 4),
           terms: near.filter(o => o.t).map(o => o.t).slice(0, 5), wide, off };
}

function readout() {
  const { poles, terms, wide, off } = bundle(frame());
  let odds = '';
  if (state.size) {
    let keep = null;
    for (const w of state) {
      const s = new Set(TERMS.find(t => t.w === w).in);
      keep = keep === null ? s : new Set([...keep].filter(i => s.has(i)));
    }
    const idx = [...keep];
    if (idx.length >= 6) {
      /* what the wines described this way actually are, against the shop -- the
         same five measures the rest of the page is written in, no others */
      const rows = A.map(a => {
        const got = idx.reduce((s, i) => s + S.wines[i][a], 0) / idx.length;
        const all = S.wines.reduce((s, w) => s + w[a], 0) / S.wines.length;
        return { a, got, all, gap: got - all };
      }).filter(r => Math.abs(r.gap) > 0.08)
        .sort((x, y) => Math.abs(y.gap) - Math.abs(x.gap)).slice(0, 3);
      odds = rows.length
        ? `<div class="odds">the ${idx.length} wines described this way are `
          + rows.map(r => `<b style="color:${S.colors[r.a]}">${S.ends[r.a][r.gap > 0 ? 1 : 0]}</b>`
              + ` (${r.got.toFixed(2)} against the shop's ${r.all.toFixed(2)})`).join(' &middot; ')
          + `</div>`
        : `<div class="odds">${idx.length} wines are described this way, and on every`
          + ` measure they sit where the shop sits</div>`;
    } else if (idx.length) {
      odds = `<div class="odds">only ${idx.length} wines are described this way &mdash; too few to say</div>`;
    } else {
      odds = `<div class="odds">no wine in the shop is described with all of those`
            + ` words &mdash; the shop is lit again; untick one</div>`;
    }
  }
  const one = it => `<span style="color:${vivid(it.hsl, 1, 6)}">${it.w}</span>`;
  showZoom();
  el('atlasFacing').innerHTML = (poles.length || terms.length)
    ? `<div class="lead">${wide ? `open shelf &mdash; nearest is ${off}&deg; round` : 'this way'}</div>`
      + `<div class="set">` + poles.map(one).join(' &nbsp;')
      + (terms.length ? ' &nbsp;&nbsp;' + terms.map(one).join(' &nbsp;') : '') + `</div>` + odds
    : `<div class="lead">open shelf</div><div class="set dim">keep turning</div>` + odds;
}

/* ---- the words ----------------------------------------------------------- */
const wordList = el('atlasWords');
for (const t of TERMS) {
  const row = document.createElement('div');
  row.className = 'aw'; row.setAttribute('aria-checked', 'off');
  row.dataset.w = t.w;
  /* the list wears the field's colours: a word here and the same word out there
     are one thing, so it is recognised rather than read */
  row.innerHTML = `<i></i><span>${t.w}</span><em>${t.n}</em>`;
  row.onclick = () => {
    if (state.has(t.w)) { state.delete(t.w); row.setAttribute('aria-checked', 'off'); }
    else { state.add(t.w); row.setAttribute('aria-checked', 'yes'); }
    paintRow(row, t);
    refilter();
    if (state.size) {
      const v = [0, 0, 0];
      for (const w of state) { const u = unit(TERMS.find(x => x.w === w).pos);
                               v[0] += u[0]; v[1] += u[1]; v[2] += u[2]; }
      faceTo(v);
    }
    nudge();
  };
  wordList.append(row);
}
function paintRow(row, t) {
  const col = tone(t.hsl, 1, 2);
  row.querySelector('i').style.borderColor = col;
  row.querySelector('i').style.background = state.has(t.w) ? col : '';
  row.querySelector('span').style.color = col;
}
const repaintRows = () => [...wordList.children].forEach(
  r => paintRow(r, TERMS.find(t => t.w === r.dataset.w)));

el('atlasClear').onclick = () => {
  state.clear();
  [...wordList.children].forEach(r => { r.setAttribute('aria-checked', 'off');
                                        r.querySelector('i').style.background = ''; });
  refilter();
  nudge();
};
countRows();

/* ---- pointing ------------------------------------------------------------ */
let down = false, lx = 0, ly = 0, moved = 0;
cv.addEventListener('pointerdown', e => {
  down = true; moved = 0; lx = e.clientX; ly = e.clientY;
  cv.classList.add('drag'); cv.setPointerCapture(e.pointerId);
  target = null; vYaw = vPitch = 0;
});
cv.addEventListener('pointermove', e => {
  if (!down) return;
  const dx = e.clientX - lx, dy = e.clientY - ly;
  moved += Math.abs(dx) + Math.abs(dy);
  vYaw = -dx * rate(); vPitch = dy * rate();
  yaw += vYaw; pitch = Math.max(-PIT, Math.min(PIT, pitch + vPitch));
  lx = e.clientX; ly = e.clientY;
  nudge();
});
cv.addEventListener('pointermove', e => {
  if (down) return;
  const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
  hoverAt(mx, my);
});
cv.addEventListener('pointerleave', () => { el('atlasName').style.display = 'none'; });

/* A glass is hoverable over the whole glass. Its node is its own centre and its
   reach is the size it was actually drawn at, so the bowl, the stem and the foot
   all answer -- a fixed radius would catch the stem and miss everything above it. */
function hoverAt(mx, my) {
  let best = null, bd = Infinity;
  for (const m of WMARK) {
    if (!m.node) continue;
    const rr = Math.max(9, m.node[2] * 1.15);
    const d = (m.node[0] - mx)**2 + (m.node[1] - my)**2;
    if (d < rr*rr && d < bd) { bd = d; best = m; }
  }
  const box = el('atlasName');
  if (!best) { box.style.display = 'none'; return null; }
  const w = S.wines[best.i];
  box.style.display = 'block';
  box.style.left = Math.min(mx + 14, W - 250) + 'px';
  box.style.top = Math.max(my - 8, 8) + 'px';
  const kind = [{ red: 'Red', white: 'White', rose: 'Rosé' }[WCOL[best.i]],
                FIZZ[best.i] ? 'sparkling' : null,
                w.vintage ? String(Math.round(w.vintage)) : null].filter(Boolean);
  box.innerHTML = `<b>${w.name}</b>`
    + `<div class="kind"><i style="background:hsl(${pour(best.i).slice(0,3).map((v,k)=>k?v+'%':v).join(',')})"></i>`
    + `${kind.join(' &middot; ')}</div>`
    + `<div class="sub">${[w.variety, w.region].filter(Boolean).join(' &middot; ')}</div>`
    + (MINE[best.i]
        ? `<div class="yours">bought in order ${ORDERS[best.i].length > 1
             ? ORDERS[best.i].slice(0, -1).join(', ') + ' and ' + ORDERS[best.i].slice(-1)
             : (ORDERS[best.i][0] || '?')}</div>`
        : '')
    + `<div class="mbars">` + A.map(a => {
        const v = w[a];
        return `<div class="mtrk"><i style="width:${Math.max(3, v*100)}%;background:${S.colors[a]}"></i></div>`
             + `<span class="mnm">${S.labels[a]}</span>`
             + `<span class="mend">${S.ends[a][v >= 0.5 ? 1 : 0]}</span>`;
      }).join('') + `</div>`;
  return best;
}

cv.addEventListener('pointerup', e => {
  down = false; cv.classList.remove('drag');
  if (moved > 5) return;
  vYaw = vPitch = 0;
  const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
  for (const it of POLES.concat(TERMS)) {
    if (!it.hit) continue;
    const [x, y, w, s] = it.hit;
    if (Math.abs(mx - x) < w/2 + 8 && Math.abs(my - y) < s) {
      faceTo(it.dir || it.pos); beginApproach(); return;
    }
  }
});

function lean(factor, towardX, towardY) {
  const before = fovWant;
  fovWant = Math.max(WIDE * 0.075, Math.min(WIDE, fovWant * factor));
  if (towardX !== undefined && fovWant < before) {
    const ppr = W / before;
    const th = (towardX - W/2) / ppr, ph = (H/2 - towardY) / ppr;
    const F = frame(), ct = Math.cos(th), st = Math.sin(th), cp = Math.cos(ph), sp = Math.sin(ph);
    faceTo([F.f[0]*ct*cp + F.r[0]*st + F.u[0]*sp,
            F.f[1]*ct*cp + F.r[1]*st + F.u[1]*sp,
            F.f[2]*ct*cp + F.r[2]*st + F.u[2]*sp]);
  }
  el('atlasWide').style.display = fovWant < OPEN * 0.99 ? '' : 'none';
}
cv.addEventListener('dblclick', e => {
  const r = cv.getBoundingClientRect();
  lean(e.shiftKey ? 1/0.62 : 0.62, e.clientX - r.left, e.clientY - r.top);
});
el('atlasWide').onclick = () => lean(OPEN / fovWant);

/* ---- how close you are looking, as a thing you can grab -------------------
   The slider IS the field of view and nothing else. Walking is a separate act
   and does not move it, which is right: walking is not zooming. Everything that
   does change the field -- a pinch past the rim, a double-click, step back --
   moves the handle, because the handle is read back out of FOV every paint.
   Logarithmic, so a step of the handle is the same proportion of the view
   wherever it is taken, which is how zoom is felt. */
const FOVMIN = WIDE * 0.075;
const LSPAN = Math.log(WIDE / FOVMIN);
const fovBar = el('atlasFov');
let fovGrab = false;
const zOf = f => Math.round(1000 * Math.log(WIDE / f) / LSPAN);
function showZoom() { if (!fovGrab) fovBar.value = String(zOf(FOV)); }
fovBar.addEventListener('pointerdown', () => { fovGrab = true; });
addEventListener('pointerup', () => { fovGrab = false; });
fovBar.addEventListener('input', () => {
  fovWant = FOV = WIDE * Math.exp(-(+fovBar.value / 1000) * LSPAN);
  el('atlasWide').style.display = fovWant < OPEN * 0.99 ? '' : 'none';
  nudge();
});

/* Two fingers LOOK AROUND -- the same act as dragging, at the same sense and
   scale, because scrolling is how a trackpad turns a view. A pinch MOVES YOU
   through the shop: in a space with depth, going in is what zooming is, and it
   is what makes the sky hold still while the glasses stream past. Both arrive as
   wheel events; a trackpad pinch is a wheel with ctrlKey set. */
cv.addEventListener('wheel', e => {
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) {
    /* One gesture, and it must undo itself: pinching in walks you forward until
       the rim and only then narrows the view; pinching out widens first and only
       then walks back. Last-in-first-out, so the two directions retrace the same
       path -- and so that zooming out always does something. */
    const out = e.deltaY > 0;
    const at = standWant || STAND;
    if (out) { if (fovWant < OPEN * 0.995) lean(1.055); else glide(-0.11); }
    else { if (len(at) >= ROAM - 1e-6) lean(0.948); else glide(0.11); }
  } else if (e.shiftKey) {
    lean(e.deltaY > 0 ? 1.045 : 0.957);
  } else {
    /* The two axes do not share a sign here, because a trackpad's horizontal and
       vertical deltas do not share one once "natural" scrolling is in play. Do
       not tidy these into one sign; that is what made it wrong. */
    target = null; vYaw = vPitch = 0;
    yaw -= e.deltaX * rate();
    pitch = Math.max(-PIT, Math.min(PIT, pitch + e.deltaY * rate()));
  }
  /* one frame of the glide happens here and now, so the gesture always shows
     something even where the animation clock is stopped */
  step();
  nudge();
}, { passive: false });

addEventListener('keydown', e => {
  if (!live || /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) return;
  if (e.key === 'f' || e.key === 'F') { fill(); e.preventDefault(); return; }
  if (e.key === 'h' || e.key === 'H' || e.key === '?') { help(); e.preventDefault(); return; }
  if (e.key === 'w' || e.key === 'ArrowUp') walk(0.3);
  else if (e.key === 's' || e.key === 'ArrowDown') walk(-0.3);
  else if (e.key === 'g' || e.key === 'G') toggleGlobe();
  else return;
  e.preventDefault();
});

/* ---- the globe ------------------------------------------------------------
   The sphere you stand inside, seen from outside, painted solid: every patch
   takes the colour of the pole it faces most nearly, so the surface IS the
   arrangement rather than a diagram of it. Your heading is always the centre of
   the disc, which makes dragging the globe the same act as turning your head. */
const GS = 224, GR = 102, GC = 112;
/* a light up and to the left, so the ball has a terminator and a limb */
const NORM = v => { const n = Math.hypot(...v); return v.map(x => x/n); };
const LIGHT = NORM([-0.42, 0.52, 0.74]);      // the key
const FILL  = NORM([0.55, -0.40, 0.73]);      // a second, weaker, from below right
let showMini = true;
function hsl2rgb(h, s, l) {
  h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
  const c = (1 - Math.abs(2*l - 1)) * s, x = c * (1 - Math.abs((h/60) % 2 - 1)), m = l - c/2;
  let r, g2, b;
  if (h < 60) [r, g2, b] = [c, x, 0]; else if (h < 120) [r, g2, b] = [x, c, 0];
  else if (h < 180) [r, g2, b] = [0, c, x]; else if (h < 240) [r, g2, b] = [0, x, c];
  else if (h < 300) [r, g2, b] = [x, 0, c]; else [r, g2, b] = [c, 0, x];
  return [(r+m)*255, (g2+m)*255, (b+m)*255];
}
/* A WIREFRAME, NOT A PAINTED BALL.
   Painted solid, the globe was a mood: ten muted hexes averaged into a wash, and
   nothing on it could be pointed at. A wireframe says the two things a globe is
   for. It is a SPHERE -- the meridians crowd at the silhouette and the parallels
   bow, which no flat disc does -- and it has a FRONT AND A BACK, so a pole behind
   you can be shown as being behind you rather than left off. Colour is carried by
   the ten circles alone; the cage stays neutral, and the names come on hover so
   they are not in the way of the thing they name. */
let gHover = null;

function drawMini() {
  if (!showMini || !live) return;
  const F = frame(), fwd = unit(F.f), gr = unit(F.r), gu = unit(F.u);
  const at = p => ({ x: GC + dot(p, gr)*GR, y: GC - dot(p, gu)*GR, w: dot(p, fwd) });
  const ink = a => DARK ? `rgba(255,255,255,${a})` : `rgba(24,24,28,${a})`;
  mg.clearRect(0, 0, GS, GS);

  /* the ball itself: a faint disc so the cage reads as a surface and not as wire
     floating in nothing */
  const bg = mg.createRadialGradient(GC - GR*0.34, GC - GR*0.38, GR*0.05, GC, GC, GR);
  bg.addColorStop(0,   DARK ? 'rgba(255,255,255,.10)'  : 'rgba(20,20,28,.07)');
  bg.addColorStop(0.62,DARK ? 'rgba(255,255,255,.035)' : 'rgba(20,20,28,.03)');
  bg.addColorStop(1,   DARK ? 'rgba(255,255,255,.005)' : 'rgba(20,20,28,.012)');
  mg.fillStyle = bg;
  mg.beginPath(); mg.arc(GC, GC, GR, 0, 6.2832); mg.fill();
  /* a hint of a limb, so the cage is stretched over something */
  const lb = mg.createRadialGradient(GC, GC, GR*0.72, GC, GC, GR);
  lb.addColorStop(0, 'rgba(0,0,0,0)');
  lb.addColorStop(1, DARK ? 'rgba(0,0,0,.55)' : 'rgba(20,20,28,.16)');
  mg.fillStyle = lb;
  mg.beginPath(); mg.arc(GC, GC, GR, 0, 6.2832); mg.fill();

  /* meridians and parallels, drawn all the way round: the half facing you is
     plain, the half behind you is faint, and that difference IS the sphere */
  const curve = (pts, strong) => {
    for (let k = 0; k + 1 < pts.length; k++) {
      const a = pts[k], b = pts[k+1], front = (a.w + b.w) > 0;
      mg.strokeStyle = ink(front ? (DARK ? (strong ? 0.66 : 0.42) : (strong ? 0.52 : 0.34))
                                 : (DARK ? (strong ? 0.20 : 0.12) : (strong ? 0.17 : 0.10)));
      mg.lineWidth = front ? (strong ? 1.5 : 1) : (strong ? 1.1 : 0.85);
      mg.beginPath(); mg.moveTo(a.x, a.y); mg.lineTo(b.x, b.y); mg.stroke();
    }
  };
  /* HALF THE SPHERE HAD NO MERIDIANS ON IT. A meridian drawn from pole to pole
     covers one longitude only, and these ran from 0 to 7/8 of a half-turn -- so
     they filled one half of the ball and left the other bare, which is what made
     them look like something meaningful pointing one way. They are not: this is a
     plain cage, and its axis is the one the world already has. The poles it
     converges on are OLD overhead and YOUNG underfoot, and its equator is the
     horizon. Twelve now, right the way round. */
  for (let m = 0; m < 12; m++) {                   // meridians, every 30 degrees
    const lon = m * Math.PI / 6, pts = [];
    for (let t = 0; t <= 72; t++) {
      const la = -Math.PI/2 + t * Math.PI / 72;
      pts.push(at([Math.cos(la)*Math.cos(lon), Math.sin(la), Math.cos(la)*Math.sin(lon)]));
    }
    curve(pts);
  }
  for (const la of [-1.0472, -0.5236, 0, 0.5236, 1.0472]) {   // parallels, every 30
    const pts = [];
    for (let t = 0; t <= 96; t++) {
      const lo = t * 6.2832 / 96;
      pts.push(at([Math.cos(la)*Math.cos(lo), Math.sin(la), Math.cos(la)*Math.sin(lo)]));
    }
    curve(pts, la === 0);                    // the equator IS the horizon
  }
  mg.strokeStyle = ink(DARK ? 0.5 : 0.4); mg.lineWidth = 1.2;
  mg.beginPath(); mg.arc(GC, GC, GR, 0, 6.2832); mg.stroke();

  /* THE TEN CIRCLES, which are where the colour lives. Facing you: filled, with a
     ring. Behind you: hollow, so you can see it is round the back without having
     to turn to find out. */
  const marks = POLES.map(p => ({ p, q: at(p.dir) }));
  marks.sort((a, b) => a.q.w - b.q.w);            // the far ones first
  for (const { p, q } of marks) {
    const front = q.w > 0, r = front ? 6.4 : 5.4;
    p.gHit = [q.x, q.y];
    p.gFront = front;
    /* EACH ONE A LITTLE SPHERE. A flat disc on a wireframe ball is a hole in it;
       shaded, it is a thing sitting on the surface. The ones round the back are
       the same spheres at two fifths, which is what you see of something through
       a globe rather than in front of it. */
    const A = front ? 1 : 0.4;
    const gd = mg.createRadialGradient(q.x - r*0.36, q.y - r*0.42, r*0.05, q.x, q.y, r);
    gd.addColorStop(0,    vivid(p.hsl, A, 24));
    gd.addColorStop(0.5,  vivid(p.hsl, A, 4));
    gd.addColorStop(1,    vivid(p.hsl, A, -20));
    mg.fillStyle = gd;
    mg.beginPath(); mg.arc(q.x, q.y, r, 0, 6.2832); mg.fill();
    mg.strokeStyle = vivid(p.hsl, A * 0.9, -26); mg.lineWidth = 1;
    mg.beginPath(); mg.arc(q.x, q.y, r, 0, 6.2832); mg.stroke();
    mg.fillStyle = `rgba(255,255,255,${A * 0.55})`;
    mg.beginPath(); mg.arc(q.x - r*0.34, q.y - r*0.40, r*0.20, 0, 6.2832); mg.fill();
  }

  /* The wines under the crosshair were drawn on here too, and they are not any
     more: the ball is the frame, and putting the subject on the frame made two
     drawings of one thing. The horizon stays -- the equator of this cage is the
     world's, the same line the ring of ticks draws out in the view. */

  /* WHAT YOU CAN SEE IS A WINDOW CUT IN THE BALL, not a circle floating in the
     middle of it. The set of bearings inside your field is a cap of the sphere,
     and its edge is a circle lying ON the surface -- so the ground outside it is
     veiled, which is the true statement (you are not looking there), and the edge
     itself carries a soft band of light either side of a crisp line, the way the
     rim of a lens does. Dots said nothing and sat nowhere. */
  const capR = GR * Math.sin(FOV/2);
  mg.beginPath();
  mg.arc(GC, GC, GR, 0, 6.2832);
  mg.arc(GC, GC, capR, 0, 6.2832, true);            // the window, left clear
  mg.fillStyle = DARK ? 'rgba(0,0,0,.44)' : 'rgba(22,22,30,.13)';
  mg.fill('evenodd');
  const lens = mg.createRadialGradient(GC, GC, capR*0.82, GC, GC, capR*1.20);
  lens.addColorStop(0,    ink(0));
  lens.addColorStop(0.5,  ink(DARK ? 0.16 : 0.12));
  lens.addColorStop(1,    ink(0));
  mg.fillStyle = lens;
  mg.beginPath(); mg.arc(GC, GC, capR*1.20, 0, 6.2832); mg.fill();
  mg.strokeStyle = ink(DARK ? 0.62 : 0.5); mg.lineWidth = 1.1;
  mg.beginPath(); mg.arc(GC, GC, capR, 0, 6.2832); mg.stroke();

  /* ONE NAME, AND ONLY WHERE YOU ARE POINTING. Ten labels nailed to a
     postage-stamp ball covered the thing they were labelling. */
  if (gHover) {
    const p = gHover, q = at(p.dir);
    const say = p.w + (q.w > 0 ? '' : '  ·  behind you');
    mg.font = `600 13.5px system-ui,-apple-system,"Segoe UI",sans-serif`;
    mg.textAlign = 'left'; mg.textBaseline = 'middle';
    /* No frame round it. A coloured border on a label is a second thing to read
       and it was the brightest edge on the ball; the colour belongs to the
       circle, so the label carries one dot of it and nothing else. Plain plate,
       plain white, and big enough not to be a struggle. */
    const dotw = 15, tw = mg.measureText(say).width, bw = tw + dotw + 18, bh = 23;
    const x = Math.max(4, Math.min(GS - bw - 4, q.x - bw/2));
    const y = Math.max(bh/2 + 3, Math.min(GS - bh/2 - 3, q.y - 17));
    mg.fillStyle = DARK ? 'rgba(0,0,0,.94)' : 'rgba(255,255,255,.97)';
    mg.beginPath(); mg.roundRect(x, y - bh/2, bw, bh, 5); mg.fill();
    mg.fillStyle = vivid(p.hsl, 1, 6);
    mg.beginPath(); mg.arc(x + 12, y, 4.4, 0, 6.2832); mg.fill();
    mg.fillStyle = DARK ? '#fff' : '#111';
    mg.fillText(say, x + dotw + 8, y + 0.5);
    mg.textAlign = 'center'; mg.textBaseline = 'alphabetic';
  }
}

/* DOUBLE-CLICK THE GLOBE TO GO THERE. The globe paints each pixel by turning
   disc coordinates into a direction, so the same arithmetic run backwards turns
   a click into the direction it was painted from. It is the only view that shows
   what is behind you, and this is what makes that reachable. */
mini.addEventListener('pointermove', e => {
  if (gDown) return;
  const r = mini.getBoundingClientRect(), sc = GS / r.width;
  const mx = (e.clientX - r.left) * sc, my = (e.clientY - r.top) * sc;
  let best = null, bd = 13 * 13;
  for (const p of POLES) {
    if (!p.gHit) continue;
    const d = (p.gHit[0] - mx) ** 2 + (p.gHit[1] - my) ** 2;
    if (d < bd) { bd = d; best = p; }
  }
  if (best !== gHover) { gHover = best; drawMini(); }
});
mini.addEventListener('pointerleave', () => { if (gHover) { gHover = null; drawMini(); } });

mini.addEventListener('dblclick', e => {
  const r = mini.getBoundingClientRect(), s = GS / r.width;
  const u = ((e.clientX - r.left)*s - GC) / GR, v = (GC - (e.clientY - r.top)*s) / GR;
  const rr = u*u + v*v;
  if (rr > 1) return;
  const w = Math.sqrt(1 - rr), F = frame(), fwd = unit(F.f), gr = unit(F.r), gu = unit(F.u);
  faceTo([gr[0]*u + gu[0]*v + fwd[0]*w, gr[1]*u + gu[1]*v + fwd[1]*w,
          gr[2]*u + gu[2]*v + fwd[2]*w]);
  e.stopPropagation(); e.preventDefault();
  nudge();
});
let gDown = false, glx = 0, gly = 0, gMoved = 0;
mini.addEventListener('pointerdown', e => {
  gDown = true; gMoved = 0; glx = e.clientX; gly = e.clientY;
  mini.classList.add('drag'); mini.setPointerCapture(e.pointerId);
  target = null; vYaw = vPitch = 0; e.stopPropagation();
});
mini.addEventListener('pointermove', e => {
  if (!gDown) return;
  const dx = e.clientX - glx, dy = e.clientY - gly;
  gMoved += Math.abs(dx) + Math.abs(dy);
  vYaw = -dx * 0.0032; vPitch = dy * 0.0032;
  yaw += vYaw; pitch = Math.max(-PIT, Math.min(PIT, pitch + vPitch));
  glx = e.clientX; gly = e.clientY;
  nudge(); e.stopPropagation();
});
mini.addEventListener('pointerup', e => {
  gDown = false; mini.classList.remove('drag'); e.stopPropagation();
  if (gMoved > 5) return;
  const r = mini.getBoundingClientRect();
  const mx = (e.clientX - r.left)*GS/r.width, my = (e.clientY - r.top)*GS/r.height;
  let best = null, bd = 200;
  for (const p of POLES) {
    if (!p.gHit) continue;
    const d = (p.gHit[0] - mx)**2 + (p.gHit[1] - my)**2;
    if (d < bd) { bd = d; best = p; }
  }
  if (best) faceTo(best.dir);
});

const gwin = el('atlasGlobe'), gbar = el('atlasGbar');
let wDown = false, wx = 0, wy = 0;
gbar.addEventListener('pointerdown', e => {
  /* The close button lives inside the drag handle, and setPointerCapture
     retargets the pointerup to the bar -- so down and up land on different
     elements and no click is ever synthesised on the button. Declining to drag
     is not enough on its own: the pane behind captures the pointer too, so the
     event has to be stopped here as well. */
  if (e.target.closest('#atlasGx')) { e.stopPropagation(); return; }
  wDown = true; wx = e.clientX; wy = e.clientY;
  const r = gwin.getBoundingClientRect(), p = gwin.parentElement.getBoundingClientRect();
  gwin.style.left = (r.left - p.left) + 'px'; gwin.style.top = (r.top - p.top) + 'px';
  gwin.style.right = 'auto'; gwin.style.bottom = 'auto';
  gbar.classList.add('drag'); gbar.setPointerCapture(e.pointerId);
  e.stopPropagation();
});
gbar.addEventListener('pointermove', e => {
  if (!wDown) return;
  gwin.style.left = (parseFloat(gwin.style.left) + e.clientX - wx) + 'px';
  gwin.style.top = (parseFloat(gwin.style.top) + e.clientY - wy) + 'px';
  wx = e.clientX; wy = e.clientY; e.stopPropagation();
});
gbar.addEventListener('pointerup', e => { wDown = false; gbar.classList.remove('drag'); e.stopPropagation(); });
function toggleGlobe(on) {
  showMini = on === undefined ? !showMini : on;
  gwin.style.display = showMini ? '' : 'none';
  el('atlasFacing').classList.toggle('wide', !showMini);
  if (showMini) drawMini();
}
el('atlasGx').onclick = e => { e.stopPropagation(); toggleGlobe(false); };

/* ---- filling the screen ---------------------------------------------------
   Not the browser's own full screen: this page is served both from a domain and
   from inside a cross-origin frame, and a frame without allowfullscreen simply
   refuses. A fixed overlay is the same result and it never refuses. The canvas
   is watched for its size already, so it measures and repaints itself on the way
   in and on the way out. */
const view = el('atlasCanvas').parentElement;
const side = document.querySelector('.atlas-side');
const sideHome = side.parentElement;
/* THE SOMMELIER COMES WITH IT, ALL THE WAY. It is the same one wine, the same
   five measures and the same shop whichever tab you are on, so it moves in
   beside the space rather than being left behind in the Find tab -- and it
   follows the space onto the full screen too, where it can drive every control
   in view. It has three homes and is MOVED between them, never copied: two of
   it would be two conversations. */
const chat = document.querySelector('.chat');
const chatHome = chat.parentElement;
const chatAt = where => {
  const home = where === 'find' ? chatHome : where === 'screen' ? view : sideHome;
  /* the parent, not an ancestor: the full screen is a child of the grid, so
     "already there" asked deeply is true of the one place it must leave */
  if (chat.parentElement !== home) home.appendChild(chat);
};
function chatHere(on) { chatAt(on ? 'atlas' : 'find'); }
function fill(on) {
  const want = on === undefined ? !view.classList.contains('big') : on;
  /* both panels travel with the view: on the full screen each becomes a drawer
     inside it, on the side it holds on the page, and both go back to their own
     columns on the way out */
  if (want) view.appendChild(side); else sideHome.insertBefore(side, sideHome.firstChild);
  /* and the rail each one leaves behind travels with it, because the way back
     from a folded panel is the edge it folded into, wherever that edge is.
     Each goes home beside its own panel, so the reading order stays: words,
     the shop, the sommelier. */
  if (want) { view.appendChild(el('atlasWordsTab')); view.appendChild(el('atlasChatTab')); }
  else { sideHome.insertBefore(el('atlasWordsTab'), side);
         sideHome.insertBefore(el('atlasChatTab'), view); }
  chatAt(want ? 'screen' : live ? 'atlas' : 'find');
  view.classList.toggle('big', want);
  view.classList.toggle('words', want && !atlasGrid.classList.contains('nowords'));
  view.classList.toggle('nowords', atlasGrid.classList.contains('nowords'));
  view.classList.toggle('nochat', atlasGrid.classList.contains('nochat'));
  document.body.style.overflow = want ? 'hidden' : '';
  el('atlasBig').setAttribute('aria-label',
    want ? 'Return the shop to the page' : 'Fill the screen with the shop');
  refit();
}
el('atlasBig').onclick = e => { e.stopPropagation(); fill(); };
/* Either side folds away, and each is folded the same way wherever it stands.
   In the page they are columns of the grid, closed by the chevron in their own
   head and opened again by the rail left behind. On the full screen they are
   drawers over the view, and both toggles stand side by side in the one bar:
   peers, so one affordance, twice. */
const atlasGrid = document.querySelector('.atlas');
const FOLDER = { nowords: 'atlasList', nochat: 'atlasSomm' };
function fold(which, hide) {
  atlasGrid.classList.toggle(which, hide);
  view.classList.toggle(which, hide);
  if (which === 'nowords') view.classList.toggle('words', !hide);
  el(FOLDER[which]).setAttribute('aria-pressed', hide ? 'false' : 'true');
  refit();
}
const toggle = which => e => { e.stopPropagation();
  fold(which, !atlasGrid.classList.contains(which)); };
el('atlasList').onclick = toggle('nowords');
el('atlasSomm').onclick = toggle('nochat');
el('atlasWordsShut').onclick = e => { e.stopPropagation(); fold('nowords', true); };
el('atlasWordsTab').onclick = e => { e.stopPropagation(); fold('nowords', false); };
el('atlasChatShut').onclick = e => { e.stopPropagation(); fold('nochat', true); };
el('atlasChatTab').onclick = e => { e.stopPropagation(); fold('nochat', false); };
el('atlasList').setAttribute('aria-pressed', 'true');
el('atlasSomm').setAttribute('aria-pressed', 'true');

/* WHAT YOU CAN DO HERE, said as what and not as how. It is a space and a space
   does not announce itself; the one thing a reader needs is the list of acts
   available, each with the gesture that performs it underneath. */
const helpBox = el('atlasHelp'), helpBtn = el('atlasAsk');
function help(on) {
  const want = on === undefined ? helpBox.hidden : on;
  helpBox.hidden = !want;
  helpBtn.setAttribute('aria-expanded', want ? 'true' : 'false');
}
help(false);
helpBtn.onclick = e => { e.stopPropagation(); help(); };
cv.addEventListener('pointerdown', () => help(false));
addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!helpBox.hidden) { help(false); e.preventDefault(); return; }
  if (view.classList.contains('big')) { fill(false); e.preventDefault(); }
});

/* ---- size, theme, and the loop ------------------------------------------- */
function size() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  W = cv.clientWidth; H = cv.clientHeight;
  if (!W || !H) return false;
  cv.width = W*dpr; cv.height = H*dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
  /* THE GLOBE HAD NO SUCH THING and was drawn at one pixel per pixel, then
     stretched over two on any retina screen: every line and every letter on it
     was soft. Same treatment as the view. */
  if (mini.width !== GS*dpr) {
    mini.width = GS*dpr; mini.height = GS*dpr;
    mg.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  return true;
}
function theme() {
  readTheme();
  const cs = getComputedStyle(document.documentElement);
  MARKRGB = (cs.getPropertyValue('--mark-rgb') || '164,140,255').trim();
  RISERGB = (cs.getPropertyValue('--rise-rgb') || '226,163,90').trim();
  repaintRows();
}
/* THE SHOP TAKES THE REST OF THE WINDOW. Its height was a clamp, so on a tall
   screen the card stopped short and the glass below it was spent on nothing.
   What is above the shop -- the title, the lede, the tabs -- is measured rather
   than guessed at, because the lede rewraps with the width and no constant
   survives that. Measured in document space, so the answer is the same whether
   or not the reader has scrolled. */
const FLOOR = 430;
function fillTall() {
  if (!live || view.classList.contains('big')) return;
  const card = atlasGrid.closest('.card');
  if (!card) return;
  const box = atlasGrid.getBoundingClientRect();
  const below = card.getBoundingClientRect().bottom - box.bottom + 30;   // card's own edge, then the page's
  const want = Math.round(Math.max(FLOOR, innerHeight - (box.top + scrollY) - below));
  const now = parseInt(atlasGrid.style.minHeight, 10) || 0;
  if (Math.abs(want - now) > 1) atlasGrid.style.minHeight = want + 'px';  // else the observer loops
}
function refit() {
  fillTall();
  if (!size()) return;
  theme(); draw(); readout(); drawMini();
}
new ResizeObserver(() => { if (live) refit(); }).observe(cv);
addEventListener('resize', () => { if (live) refit(); });
matchMedia('(prefers-color-scheme:dark)').addEventListener('change', () => { if (live) refit(); });

/* One step of the glide, kept apart from what schedules it. A browser stops
   animation frames in a tab that is not on screen, so a check written against
   the frame clock does not fail there -- it hangs, which is worse. Anything that
   wants to advance the view by hand asks for a step. */
function step() {
  let moving = false;
  if (easeStand()) moving = true;
  if (Math.abs(fovWant - FOV) > 0.0004) { FOV += (fovWant - FOV)*0.12; moving = true; }
  else if (FOV !== fovWant) { FOV = fovWant; moving = true; }
  if (target) {
    let dy = target[0] - yaw;
    while (dy > Math.PI) dy -= 2*Math.PI;
    while (dy < -Math.PI) dy += 2*Math.PI;
    const dp = target[1] - pitch;
    if (Math.abs(dy) < 0.0015 && Math.abs(dp) < 0.0015) target = null;
    else { yaw += dy*0.12; pitch += dp*0.12; moving = true; }
  } else if (Math.abs(vYaw) > 0.00004 || Math.abs(vPitch) > 0.00004) {
    yaw += vYaw; pitch = Math.max(-PIT, Math.min(PIT, pitch + vPitch));
    vYaw *= 0.95; vPitch *= 0.95; moving = true;
  }
  if (approaching > 0) { stepApproach(); moving = true; }
  if (tourQ && !target) { if (tourStep()) moving = true; }
  /* POINTING AT A NEAR BOTTLE TAKES MORE THAN ONE TURN. Where a thing lies is
     measured from the EYE, and the eye rides a neck -- so turning toward it MOVES
     it. Told once, the head landed sixty degrees off a bottle two and a half
     units away. The bearing is taken again every frame until it stops changing,
     which is what a head does when it looks at something close. */
  if (pointWant !== null) {
    const d = unit(here(WPOS[pointWant]));
    const off = Math.acos(Math.max(-1, Math.min(1, dot(unit(frame().f), d))));
    if (off > 0.004 && ++pointTries < 400) { faceTo(d); moving = true; }
    else {
      const m = WMARK[pointWant];
      if (m && m.node) hoverAt(m.node[0], m.node[1]);
      pointWant = null; pointTries = 0;
    }
  }
  if (moving) { draw(); readout(); drawMini(); }
  return moving;
}
(function loop() { requestAnimationFrame(loop); if (live) step(); })();

/* You start facing your own shelf: the middle of the bottles on the account, so
   the first thing in view is where this reader's buying actually sits. */
(function start() {
  const v = [0, 0, 0];
  let n = 0;
  for (let i = 0; i < N; i++) if (MINE[i]) { const u = unit(WPOS[i]);
                                             v[0] += u[0]; v[1] += u[1]; v[2] += u[2]; n++; }
  if (n) { const d = unit(v); yaw = Math.atan2(d[2], d[0]); pitch = Math.asin(d[1]); }
})();

/* ---- what an agent can do here -------------------------------------------
   Parity: everything the reader can do in this space, the sommelier can do too.
   It turns the head, walks, changes the field, ticks and unticks words, points
   at a bottle, folds the panels and fills the screen. It cannot mark a wine
   right or wrong -- that is his, everywhere on this page. */
function named(what) {
  const s0 = String(what).toLowerCase().trim();
  const pole = POLES.find(p => p.w.toLowerCase() === s0);
  if (pole) return pole.dir;
  const term = TERMS.find(t => t.w.toLowerCase() === s0);
  if (term) return unit(term.pos);
  const i = S.wines.findIndex(w => w.name.toLowerCase() === s0);
  if (i >= 0) return unit(here(WPOS[i]));
  return null;
}
let pointWant = null, pointTries = 0;
function setWord(w, on) {
  const row = [...wordList.children].find(r => r.dataset.w === String(w).toLowerCase());
  if (!row) return;
  if (state.has(row.dataset.w) !== !!on) row.click();
}
function act(a) {
  if (!a || typeof a !== 'object') return;
  if (a.words !== undefined) fold('nowords', !a.words);
  if (a.sommelier !== undefined) fold('nochat', !a.sommelier);
  if (a.screen !== undefined) fill(!!a.screen);
  if (a.clear) el('atlasClear').click();
  if (Array.isArray(a.tick)) a.tick.forEach(w => setWord(w, true));
  if (Array.isArray(a.untick)) a.untick.forEach(w => setWord(w, false));
  if (a.face) { const d = named(a.face); if (d) faceTo(d); }
  if (Array.isArray(a.faceTo) && a.faceTo.length === 3) faceTo(a.faceTo);
  if (typeof a.zoom === 'number') {
    fovWant = FOV = WIDE * Math.exp(-Math.max(0, Math.min(1, a.zoom)) * LSPAN);
    el('atlasWide').style.display = fovWant < OPEN * 0.99 ? '' : 'none';
    showZoom();
  }
  if (typeof a.walk === 'number') glide(a.walk);
  if (a.globe !== undefined) toggleGlobe(!!a.globe);
  if (a.help !== undefined) help(!!a.help);
  if (a.approach) beginApproach();     // and see what holds frame on the way
  if (a.point) {
    const i = S.wines.findIndex(w => w.name.toLowerCase() === String(a.point).toLowerCase());
    if (i >= 0) { pointWant = i; pointTries = 0; }
  }
  nudge();
}

/* ---- the tour ------------------------------------------------------------
   Ten orders, oldest to newest, each one a place in this space: the middle of
   the bottles it actually held. Standing at each in turn and being told what
   moved between it and the last is the same statement the How-your-buying-changed
   chart makes, made from inside instead of from above. */
let tourQ = null, tourWait = 0;
const orderMid = o => {
  const idx = (o.ids || []).map(id => S.wines.findIndex(w => w.id === id)).filter(k => k >= 0);
  if (!idx.length) return null;
  const v = [0, 0, 0];
  for (const k of idx) { const u = unit(WPOS[k]); v[0] += u[0]; v[1] += u[1]; v[2] += u[2]; }
  return unit(v);
};
function tour() {
  const os = (S.orders || []).filter(o => o.ids && o.ids.length);
  if (!os.length) return;
  /* PLAIN TEXT. The chat escapes what it is given, as it must -- so tags came out
     as tags. Emphasis is carried by the words. */
  const q = [];
  q.push({ say: `Ten orders, oldest to newest. I will stand you at each one in turn:`
             + ` where you are looking is the middle of the bottles it held.`,
           zoom: 0.30, wait: 26 });
  os.forEach((o, k) => {
    const d = orderMid(o);
    if (!d) return;
    let say = `Order ${o.n} — ${o.ids.length} `
            + (o.ids.length === 1 ? 'bottle' : 'bottles') + '. ';
    if (k === 0) {
      say += A.map(a => `${S.labels[a].toLowerCase()} ${o[a].toFixed(2)}`).join(', ') + '.';
    } else {
      const prev = os[k - 1];
      const moved = A.map(a => ({ a, d: o[a] - prev[a] }))
        .sort((x, y) => Math.abs(y.d) - Math.abs(x.d))[0];
      say += Math.abs(moved.d) < 0.04
        ? 'much where the last one was.'
        : `${S.labels[moved.a].toLowerCase()} moved toward `
          + `${S.ends[moved.a][moved.d > 0 ? 1 : 0]}`
          + ` (${prev[moved.a].toFixed(2)} to ${o[moved.a].toFixed(2)}).`;
    }
    q.push({ say, faceTo: d, zoom: 0.34, wait: 30 });
  });
  const first = os[0], last = os[os.length - 1];
  const shift = A.map(a => ({ a, d: last[a] - first[a] }))
    .sort((x, y) => Math.abs(y.d) - Math.abs(x.d))[0];
  q.push({ say: `Across the ten, what moved most is ${S.labels[shift.a].toLowerCase()}:`
             + ` ${first[shift.a].toFixed(2)} to ${last[shift.a].toFixed(2)}, toward`
             + ` ${S.ends[shift.a][shift.d > 0 ? 1 : 0]}.`
             + ` Everything with a tick beside it is a bottle you bought.`,
           zoom: 0.18, wait: 0 });
  tourQ = q; tourWait = 0;
  el('t-atlas').click();
}
function tourStep() {
  if (!tourQ) return false;
  if (tourWait > 0) { tourWait--; return true; }
  const s0 = tourQ.shift();
  if (!s0) { tourQ = null; return false; }
  if (s0.say) addMsg('assistant', s0.say);
  act({ faceTo: s0.faceTo, zoom: s0.zoom });
  tourWait = s0.wait || 24;
  return true;
}

el('atlasTour').onclick = () => tour();

/* WHAT HE SEES IN HERE, IN WORDS.
   The sommelier can turn him, walk him and point at a bottle; without this it
   did all of that blind. It is told what he reads off the screen: where he is
   standing, how wide he is looking, what he faces, and which bottles are
   actually in the frame -- nearest first, because that is the order they read
   in. The page's own observation carries this, so it is refreshed after every
   move the sommelier makes. */
function seen() {
  if (!live) return 'IN THE ATLAS\nThe Atlas is closed. Any move you make there opens it first.';
  /* WHERE HE IS BEING TAKEN, NOT WHERE HE STILL HAPPENS TO POINT.
     Turning, walking and changing the field are all eased over frames, so a
     reading taken the instant a move is asked for is a reading of the move
     before it -- told to turn him to heavily oaked, this said he was facing
     strawberry and herbal, which was true for another two hundred milliseconds
     and false by the time anyone could say it. The glide is for his eyes; the
     destination is what is true of the sentence being written about it. */
  let aim = target;
  if (pointWant !== null && pointWant !== undefined) {   // told to point, not yet aimed
    const d = unit(here(WPOS[pointWant]));
    aim = [Math.atan2(d[2], d[0]), Math.asin(Math.max(-1, Math.min(1, d[1])))];
  }
  const yy = aim ? aim[0] : yaw, pp = aim ? aim[1] : pitch;
  const cy = Math.cos(yy), sy = Math.sin(yy), cp = Math.cos(pp), sp = Math.sin(pp);
  const F = { f: [cp*cy, sp, cp*sy], r: [-sy, 0, cy], u: [-sp*cy, cp, -sp*sy] };
  const st = standWant || STAND, fov = fovWant || FOV;
  const eye = [st[0] + F.f[0]*NECK, st[1] + F.f[1]*NECK, st[2] + F.f[2]*NECK];
  const b = bundle(F), got = [];
  for (const m of MARKS) {
    if (m.kind !== 'wine') continue;
    const q = place([m.pos[0]-eye[0], m.pos[1]-eye[1], m.pos[2]-eye[2]], F, fov);
    if (q) got.push({ n: S.wines[m.i].name, d: q.dist, mine: MINE[m.i],
                      lit: !onlyThese || onlyThese.has(m.i) });
  }
  got.sort((x, y) => x.d - y.d);
  const lit = got.filter(g => g.lit), CAP = 14;
  const facing = b.poles.map(p => p.w).concat(b.terms.map(t => t.w)).join('; ');
  const settling = aim || standWant || Math.abs(fov - FOV) > 1e-4;
  return `IN THE ATLAS
He stands ${len(st).toFixed(1)} of ${ROAM.toFixed(1)} in from the middle of the shop, looking ${Math.round(fov * 57.3)} degrees wide (zoom ${(zOf(fov) / 1000).toFixed(2)} of 1).
${settling ? 'He is being carried to face' : 'He faces'}: ${facing || 'open space'}${b.wide ? ` -- nothing close; the nearest is ${b.off} degrees round` : ''}.
Bottles in his frame, nearest first: ${lit.slice(0, CAP).map(x => x.n + (x.mine ? ' (his)' : '')).join('; ') || 'none'}${lit.length > CAP ? ` -- and ${lit.length - CAP} further off` : ''}.
Words lit: ${[...state].join(', ') || 'none, so the whole shop is shown'}.${held ? `\nHeld from the last approach: ${[...held].filter(m => m.kind === 'wine').map(m => S.wines[m.i].name).join('; ')}.` : ''}`;
}

function show(on) {
  live = on;
  el('atlasOffer').hidden = !on;          // offered where it means something
  if (!on) fill(false);            // which sends both panels back where they live
  else { chatHere(true); refit(); }
}

return { D, POLES, TERMS, MARKS, WMARK, TMARK, MINE, state, show, refit, draw, readout, step,
         drawMini, walk, faceTo, lean, beginApproach, hoverAt, toggleGlobe, place, frame,
         here, unit, dot, len, pour, accentAt, bundle, glass, size, theme, fill, refilter,
         OPEN, get onlyThese() { return onlyThese; },
         get yaw() { return yaw; }, set yaw(v) { yaw = v; target = null; },
         get pitch() { return pitch; }, set pitch(v) { pitch = v; target = null; },
         get FOV() { return FOV; }, set FOV(v) { FOV = fovWant = v; },
         glide, easeStand, showZoom, zOf, FOVMIN, help, countRows, act, tour, named, seen,
         get touring() { return !!tourQ; },
         get askedNothing() { return askedNothing; },
         get STAND() { return STAND; }, set STAND(v) { STAND = v; standWant = null; },
         get standWant() { return standWant; },
         get EYE() { return EYE; },
         get held() { return held; }, set held(v) { held = v; },
         get live() { return live; },
         get W() { return W; }, get H() { return H; },
         set W(v) { W = v; }, set H(v) { H = v; },
         get DARK() { return DARK; },
         NECK, REACH, ROAM, WIDE };
})();
