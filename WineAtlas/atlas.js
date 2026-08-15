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
  if (WCOL[i] === 'white')                     // pale straw to deep amber
    return [54 - 16 * m, 52 + 30 * m, (DARK ? 80 : 60) - 14 * m];
  if (WCOL[i] === 'rose')                      // salmon to onion skin
    return [348 + 18 * m, 70 - 10 * m, (DARK ? 76 : 56) - 8 * m];
  return [332 + 36 * m, 66 + 8 * (1 - m),      // purple through ruby to brick
          (DARK ? 54 : 35) + 11 * (1 - body) + 6 * m];
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
function place(P, F) {
  const fwd = dot(P, F.f), rgt = dot(P, F.r), up = dot(P, F.u);
  const th = Math.atan2(rgt, fwd);
  if (Math.abs(th) > FOV / 2 + 0.05) return null;
  const ph = Math.atan2(up, Math.hypot(rgt, fwd));
  const ppr = W / FOV;
  const y = H/2 - ph * ppr;
  if (y < -60 || y > H + 60) return null;
  /* Attention falls off toward the edge of vision, as it does in a head -- and it
     stops falling at the edge. The slack in the cull above is a fixed 0.05
     radians, which is a sliver of a wide field and a third of a narrow one, so at
     nine degrees this ran past 1 and returned NEGATIVE: marks drawn at a negative
     radius, inside out. Clamped at both ends. */
  const off = Math.min(1, Math.abs(th) / (FOV / 2));
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
function glass(x, y, R, i, a, mine) {
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
  g.fillStyle = `hsla(${wine[0]},${wine[1]}%,${wine[2]}%,${Math.min(1, a * 1.3)})`;
  g.fillRect(x - rw - 1, line, rw*2 + 2, bot - line + 1);
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
  /* YOU HAVE BOUGHT THIS: a tick beside the glass. It was a soft purple halo
     first, which at six pixels is a smudge and not a mark, and then a ring --
     which reads, being an edge, but says nothing: a circle round a thing is only
     "this one", and the page already knows which one you are pointing at. A tick
     is the mark for having it. */
  if (mine) {
    /* with a floor, so it stays a tick when the glass shrinks rather than
       shrinking with it into a nick */
    const u = Math.max(2.9, R*0.66);
    const tx = x + rw + Math.max(1.6, R*0.30), ty = top + dep*0.30;
    g.strokeStyle = `rgba(${MARKRGB},1)`;
    g.lineWidth = Math.max(1.7, R * 0.22);
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(tx - u*0.85, ty);
    g.lineTo(tx - u*0.2, ty + u*0.72);
    g.lineTo(tx + u*0.9, ty - u*0.8);
    g.stroke();
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
  drawn.push([W/2, H - 26, W, 78], [W - 118, H - 118, 240, 240], [W - 112, 66, 236, 150]);
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
    const off = Math.hypot(q.x - W/2, q.y - H/2) / (Math.min(W, H) * 0.62);
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
    /* the floor is on the drawn size, so the fade toward the edge of the eye
       cannot take a glass below it */
    let R = Math.max(3.2, (54 * m.lean / q.dist) * Math.pow(WIDE/FOV, 0.5) * q.edge);
    const asked = !onlyThese || onlyThese.has(m.i);
    if (!asked) { a = Math.max(0.13, a * 0.22); R *= 0.6; }
    shown.push({ m, q, a, R, asked });
  }
  shown.sort((x, y) => y.q.dist - x.q.dist);
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
                   : Math.max(9.5, Math.min(19, 74 * it.str / p.dist)) + 4;
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
let onlyThese = null;
function refilter() {
  if (!state.size) { onlyThese = null; return; }
  let keep = null;
  for (const w of state) {
    const s = new Set(TERMS.find(t => t.w === w).in);
    keep = keep === null ? s : new Set([...keep].filter(i => s.has(i)));
  }
  onlyThese = keep;
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
      odds = `<div class="odds">no wine in the shop is described with all of those words</div>`;
    }
  }
  const one = it => `<span style="color:${vivid(it.hsl, 1, 6)}">${it.w}</span>`;
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
    + (MINE[best.i] ? `<div class="yours">you have bought this</div>` : '')
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
const LIGHT = (v => { const n = Math.hypot(...v); return v.map(x => x/n); })([-0.42, 0.52, 0.74]);
let showMini = true;
const gimg = mg.createImageData(GS, GS);
function hsl2rgb(h, s, l) {
  h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
  const c = (1 - Math.abs(2*l - 1)) * s, x = c * (1 - Math.abs((h/60) % 2 - 1)), m = l - c/2;
  let r, g2, b;
  if (h < 60) [r, g2, b] = [c, x, 0]; else if (h < 120) [r, g2, b] = [x, c, 0];
  else if (h < 180) [r, g2, b] = [0, c, x]; else if (h < 240) [r, g2, b] = [0, x, c];
  else if (h < 300) [r, g2, b] = [x, 0, c]; else [r, g2, b] = [c, 0, x];
  return [(r+m)*255, (g2+m)*255, (b+m)*255];
}
function drawMini() {
  if (!showMini || !live) return;
  const F = frame(), fwd = unit(F.f), gr = unit(F.r), gu = unit(F.u);
  /* taken at full strength: on a ball the size of a postage stamp a muted hex
     is no colour at all, and ten of them averaged is beige */
  const rgb = POLES.map(p => hsl2rgb(p.hsl[0], Math.min(96, p.hsl[1] + 28),
                                     Math.max(46, Math.min(64, p.hsl[2] + 2))));
  const px = gimg.data;
  for (let j = 0; j < GS; j++) {
    const v = (GC - j) / GR;
    for (let i = 0; i < GS; i++) {
      const u = (i - GC) / GR, k = (j*GS + i)*4, rr = u*u + v*v;
      if (rr > 1) { px[k+3] = 0; continue; }
      const w = Math.sqrt(1 - rr);
      const d0 = gr[0]*u + gu[0]*v + fwd[0]*w;
      const d1 = gr[1]*u + gu[1]*v + fwd[1]*w;
      const d2 = gr[2]*u + gu[2]*v + fwd[2]*w;
      let bs = -2;
      const t = [];
      for (let q = 0; q < POLES.length; q++) {
        const e = POLES[q].dir, sd = d0*e[0] + d1*e[1] + d2*e[2];
        t.push(sd); if (sd > bs) bs = sd;
      }
      let r = 0, g2 = 0, b2 = 0, tot = 0;
      for (let q = 0; q < POLES.length; q++) {
        /* REGIONS, NOT AN AVERAGE. Four of the ten poles lie within fourteen
           degrees of each other, so a soft blend returns their mean and the whole
           face goes beige. */
        const wq = Math.exp((t[q] - bs) * 45);
        if (wq < 0.004) continue;
        r += rgb[q][0]*wq; g2 += rgb[q][1]*wq; b2 += rgb[q][2]*wq; tot += wq;
      }
      const edge = Math.cos(FOV / 2);
      const vis = w >= edge ? 1 : Math.max(0, 1 - (edge - w) / 0.10);
      r /= tot; g2 /= tot; b2 /= tot;
      /* A BALL, LIT. It was shaded by depth alone -- brightest dead centre,
         falling evenly to the rim -- which is what a disc looks like, not a
         sphere. A light off to one side gives it a terminator and a limb, and
         those are what say sphere without anything being written down. */
      const lam = Math.max(0, u*LIGHT[0] + v*LIGHT[1] + w*LIGHT[2]);
      const lit = 0.14 + 0.96 * Math.pow(lam, 0.8);
      const limb = 0.52 + 0.48 * w;
      const seen = 0.55 + 0.45 * vis;          // outside your field, quieter
      const spec = 110 * Math.pow(lam, 44);    // one small highlight, not a blowout
      if (DARK) {
        const f = lit * limb * seen * 0.95;
        px[k] = r*f + spec; px[k+1] = g2*f + spec; px[k+2] = b2*f + spec;
      } else {
        const wash = (1 - lit*limb) * 0.5 + (1 - vis) * 0.22;
        px[k] = r + (250-r)*wash; px[k+1] = g2 + (250-g2)*wash; px[k+2] = b2 + (250-b2)*wash;
      }
      px[k+3] = 255;
    }
  }
  mg.clearRect(0, 0, GS, GS);
  mg.putImageData(gimg, 0, 0);

  mg.textAlign = 'center'; mg.textBaseline = 'middle';
  const FS = 11;
  mg.font = `600 ${FS}px system-ui,-apple-system,"Segoe UI",sans-serif`;
  const cand = [];
  for (const p of POLES) {
    p.gHit = null;
    const c = dot(p.dir, fwd);
    if (c <= 0.04) continue;                   // genuinely round the back
    cand.push({ p, c, ax: GC + dot(p.dir, gr)*GR, ay: GC - dot(p.dir, gu)*GR });
  }
  cand.sort((a, b) => b.c - a.c);
  /* Four of these poles lie within forty degrees of one another, so nailing each
     name to its own patch put half of them on top of each other. A name that
     would land on one already placed is pushed outward along its own radius
     until it is clear, and a leader runs back to where it belongs -- a label that
     has moved a little is worth more than a label you cannot read. */
  const put = [];
  for (const q of cand) {
    const tw = mg.measureText(q.p.w).width, bw = tw + 11, bh = FS + 6;
    const ux = q.ax - GC, uy = q.ay - GC, un = Math.hypot(ux, uy) || 1;
    let x = q.ax, y = q.ay, k = 0;
    const clash = () => put.some(b => Math.abs(x - b[0]) < (bw + b[2])/2 + 2
                                   && Math.abs(y - b[1]) < (bh + b[3])/2 + 2);
    while (clash() && k < 26) { k++; x = q.ax + ux/un * k * 5; y = q.ay + uy/un * k * 5; }
    x = Math.max(bw/2 + 2, Math.min(GS - bw/2 - 2, x));
    y = Math.max(bh/2 + 2, Math.min(GS - bh/2 - 2, y));
    put.push([x, y, bw, bh]);
    const a = Math.min(1, Math.max(0.35, (q.c - 0.04) / 0.16));
    if (k) {
      mg.strokeStyle = vivid(q.p.hsl, a * 0.5);
      mg.lineWidth = 1;
      mg.beginPath(); mg.moveTo(q.ax, q.ay); mg.lineTo(x, y); mg.stroke();
      mg.beginPath(); mg.arc(q.ax, q.ay, 1.8, 0, 6.2832);
      mg.fillStyle = vivid(q.p.hsl, a * 0.8); mg.fill();
    }
    mg.fillStyle = DARK ? `rgba(6,6,6,${a*0.82})` : `rgba(255,255,255,${a*0.86})`;
    mg.beginPath(); mg.roundRect(x - bw/2, y - bh/2, bw, bh, 5); mg.fill();
    mg.strokeStyle = vivid(q.p.hsl, a*0.9);
    mg.lineWidth = 1.1;
    mg.beginPath(); mg.roundRect(x - bw/2, y - bh/2, bw, bh, 5); mg.stroke();
    mg.fillStyle = DARK ? `rgba(255,255,255,${a})` : `rgba(20,20,24,${a})`;
    mg.fillText(q.p.w, x, y + 0.5);
    q.p.gHit = [x, y];
  }
  mg.textBaseline = 'alphabetic';
  mg.beginPath();
  mg.arc(GC, GC, GR * Math.sin(FOV/2), 0, 6.2832);
  mg.strokeStyle = DARK ? 'rgba(255,255,255,.55)' : 'rgba(20,20,24,.45)';
  mg.lineWidth = 1.3; mg.stroke();
}

/* DOUBLE-CLICK THE GLOBE TO GO THERE. The globe paints each pixel by turning
   disc coordinates into a direction, so the same arithmetic run backwards turns
   a click into the direction it was painted from. It is the only view that shows
   what is behind you, and this is what makes that reachable. */
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
function fill(on) {
  const want = on === undefined ? !view.classList.contains('big') : on;
  view.classList.toggle('big', want);
  document.body.style.overflow = want ? 'hidden' : '';
  el('atlasBig').setAttribute('aria-label',
    want ? 'Return the shop to the page' : 'Fill the screen with the shop');
  refit();
}
el('atlasBig').onclick = e => { e.stopPropagation(); fill(); };
addEventListener('keydown', e => {
  if (e.key === 'Escape' && view.classList.contains('big')) { fill(false); e.preventDefault(); }
});

/* ---- size, theme, and the loop ------------------------------------------- */
function size() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  W = cv.clientWidth; H = cv.clientHeight;
  if (!W || !H) return false;
  cv.width = W*dpr; cv.height = H*dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return true;
}
function theme() {
  readTheme();
  const cs = getComputedStyle(document.documentElement);
  MARKRGB = (cs.getPropertyValue('--mark-rgb') || '164,140,255').trim();
  RISERGB = (cs.getPropertyValue('--rise-rgb') || '226,163,90').trim();
  repaintRows();
}
function refit() {
  if (!size()) return;
  theme(); draw(); readout(); drawMini();
}
new ResizeObserver(() => { if (live) refit(); }).observe(cv);
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

function show(on) {
  live = on;
  if (!on) fill(false);
  else refit();
}

return { D, POLES, TERMS, MARKS, WMARK, TMARK, MINE, state, show, refit, draw, readout, step,
         drawMini, walk, faceTo, lean, beginApproach, hoverAt, toggleGlobe, place, frame,
         here, unit, dot, len, pour, accentAt, bundle, glass, size, theme, fill, refilter,
         OPEN, get onlyThese() { return onlyThese; },
         get yaw() { return yaw; }, set yaw(v) { yaw = v; target = null; },
         get pitch() { return pitch; }, set pitch(v) { pitch = v; target = null; },
         get FOV() { return FOV; }, set FOV(v) { FOV = fovWant = v; },
         glide, easeStand,
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
