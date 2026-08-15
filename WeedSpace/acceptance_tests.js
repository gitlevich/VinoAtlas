/* Weed space acceptance tests. Run in the loaded page (browser console, or the
   harness's javascript tool). Every test name states the criterion it holds.

   These cover what only a running page can answer: that the arrangement holds
   together as you move through it, that a mark and its label say the same
   thing, and that nothing appears or disappears. The claims the data makes
   about itself are held in test_pipeline.py and test_page.py.

   Moves the view and restores it. */
(async () => {
  const R = [];
  const T = async (name, fn) => {
    try { await fn(); R.push('pass  ' + name); }
    catch (e) { R.push('FAIL  ' + name + '  -- ' + String(e.message || e)); }
  };
  const ok = (c, m) => { if (!c) throw new Error(m || 'assert'); };
  /* Two different waits, and confusing them is how a dead gesture shipped.

     frame() draws for you. Use it after setting state directly (yaw = ...), when
     what is under test is the geometry a draw produces. Drawing synchronously
     also keeps the suite fast in a hidden tab, where rAF is throttled to about
     once a second.

     settle() does NOT draw. Use it after a real gesture, so the page has to put
     the pixels up by itself. Every test that fires an event must use this one --
     frame() would paper over exactly the bug where a handler changes the state
     and nothing ever reaches the screen. */
  const frame = async () => { draw(); readout(); };
  const settle = () => new Promise(r => {
    let n = 0;
    const tick = () => (++n < 3 ? requestAnimationFrame(tick) : r());
    requestAnimationFrame(tick);
    setTimeout(r, 400);                      // a hidden tab must not hang the suite
  });
  /* count the page's own draws, so a test can insist one happened */
  let DRAWS = 0;
  const realDraw = draw;
  draw = function (...a) { DRAWS++; return realDraw.apply(this, a); };
  const home = { yaw, pitch, fov: fovWant };
  const look = async (y, p) => { yaw = y; pitch = p || 0; vYaw = vPitch = 0; await frame(); };
  const hueGap = (a, b) => Math.abs((a - b + 180) % 360 - 180);
  const drawn = () => ITEMS.filter(i => i.hit).length + ST.filter(t => t.node).length;
  /* `target` is where you are being turned to, held as [yaw, pitch] rather than
     as a direction -- so it is compared by turning the direction into angles the
     same way the page does. */
  const aimsAt = (t, dir, what) => {
    const n = Math.hypot(...dir) || 1;
    const yawWant = Math.atan2(dir[2] / n, dir[0] / n);
    const pitchWant = Math.asin(Math.max(-1, Math.min(1, dir[1] / n)));
    const d = Math.atan2(Math.sin(t[0] - yawWant), Math.cos(t[0] - yawWant));
    ok(Math.abs(d) < 0.01 && Math.abs(t[1] - pitchWant) < 0.01,
       'you were turned to [' + t.map(v => v.toFixed(3)) + '] not to ' + what);
  };

  // -- the frame you look through --------------------------------------------

  await T('the field of view is a human one and leaning in narrows it', async () => {
    ok(Math.abs(WIDE - 120 * Math.PI / 180) < 1e-9, 'not 120 degrees');
    const wide = fovWant;
    lean(0.6); await frame();
    ok(fovWant < wide, 'leaning in did not narrow the view');
    lean(1 / 0.6); await frame();
  });

  const wheel = o => view.dispatchEvent(new WheelEvent('wheel',
    Object.assign({ deltaX: 0, deltaY: 0, bubbles: true, cancelable: true }, o)));

  await T('two fingers look around, and the page actually redraws', async () => {
    /* THE ONE THAT WAS MISSING. A handler can change the state perfectly and
       leave the screen untouched, and every geometry test will still pass
       because the harness drew for itself. This one refuses to draw and
       insists the page does it. */
    STAND = [0, 0, 0]; yaw = 1.2; pitch = 0; await frame();
    const y0 = yaw, p0 = pitch, d0 = DRAWS;

    wheel({ deltaX: 60 }); await settle();
    ok(yaw !== y0, 'two fingers sideways did not turn the view');
    ok(DRAWS > d0, 'the view turned but the page never redrew it');

    const d1 = DRAWS;
    wheel({ deltaY: 60 }); await settle();
    ok(pitch !== p0, 'two fingers up and down did not tilt the view');
    ok(DRAWS > d1, 'the view tilted but the page never redrew it');
  });

  await T('the two fingers turn the way the trackpad says they should', () => {
    /* Which way is correct cannot be derived, only reported: sideways was right
       and up-down was inverted, judged on the trackpad. Both senses are pinned
       here so neither can flip back in a tidy-up -- and note they do NOT share a
       sign, because the trackpad's own deltas do not either. */
    STAND = [0, 0, 0]; yaw = 0; pitch = 0; target = null; draw();
    wheel({ deltaX: 60 });
    ok(yaw < 0, 'sideways reversed: deltaX 60 moved yaw to ' + yaw.toFixed(3));
    yaw = 0; pitch = 0; target = null;
    wheel({ deltaY: 60 });
    ok(pitch > 0, 'up-down reversed: deltaY 60 moved pitch to ' + pitch.toFixed(3));
    yaw = 0; pitch = 0; target = null; draw();
  });

  await T('a pinch moves you through the field, and two fingers never do', async () => {
    /* fovWant must be reset, not inherited. Pinching out widens a narrowed view
       BEFORE it walks you back, so a test that starts with the view already
       narrowed measures the wrong half of the gesture. */
    STAND = [0, 0, 0]; yaw = 1.2; FOV = fovWant = WIDE; await frame();

    wheel({ deltaX: 40, deltaY: 40 }); await settle();
    ok(len(STAND) < 1e-9, 'two fingers moved you as well as turning you');

    const y0 = yaw, d0 = DRAWS;                 // after the turn, before the pinch
    wheel({ deltaY: -120, ctrlKey: true }); await settle();
    ok(len(STAND) > 0, 'a pinch did not move you');
    ok(Math.abs(yaw - y0) < 1e-9, 'a pinch turned you as well as moving you');
    ok(DRAWS > d0, 'you moved but the page never redrew it');

    const far = len(STAND);
    wheel({ deltaY: 120, ctrlKey: true }); await settle();
    ok(len(STAND) < far, 'pinching the other way did not bring you back');

    STAND = [0, 0, 0]; await frame();
  });

  await T('zooming out always does something', async () => {
    /* The bug: pinch only ever walked, so a view narrowed by a double-click
       could not be widened by the gesture that ought to widen it. In and out
       are now last-in-first-out, so out always has something to undo. */
    STAND = [0, 0, 0]; FOV = fovWant = WIDE; await frame();
    lean(0.62); FOV = fovWant; await frame();
    ok(fovWant < WIDE * 0.7, 'the double-click did not narrow the view');
    for (let i = 0; i < 4; i++) { wheel({ deltaY: 120, ctrlKey: true }); FOV = fovWant; }
    await frame();
    ok(fovWant > WIDE * 0.8, 'pinching out did not widen a narrowed view');

    STAND = [0, 0, 0]; FOV = fovWant = WIDE; await frame();
    for (let i = 0; i < 24; i++) { wheel({ deltaY: -120, ctrlKey: true }); FOV = fovWant; }
    const inTo = [len(STAND), fovWant];
    ok(inTo[0] > 2.5 && inTo[1] < WIDE * 0.8, 'pinching in neither walked nor narrowed');
    for (let i = 0; i < 24; i++) { wheel({ deltaY: 120, ctrlKey: true }); FOV = fovWant; }
    await frame();
    ok(fovWant > WIDE * 0.99 && len(STAND) < 0.3,
       'in and out do not retrace: ended at ' + len(STAND).toFixed(2)
       + ' / ' + (fovWant / WIDE).toFixed(2));
    STAND = [0, 0, 0]; FOV = fovWant = WIDE; await frame();
  });

  await T('walking redraws, and the middle button is gone', async () => {
    STAND = [0, 0, 0]; await frame();
    let d = DRAWS;                              // count from BEFORE the act
    walk(1.5); await settle();
    ok(len(STAND) > 0, 'walking did not move you');
    ok(DRAWS > d, 'walking left the screen as it was');
    ok(!document.getElementById('bHome'), 'the middle button is back');
  });

  await T('the view can be turned all the way round without meeting a wall', async () => {
    for (let a = 0; a < 6.2832; a += 0.35) {
      await look(a, 0);
      ok(Number.isFinite(yaw), 'yaw went bad at ' + a.toFixed(2));
    }
    await look(home.yaw, home.pitch);
  });

  await T('a sphere never refuses to move', async () => {
    /* it does not matter that one side is thin -- the empty direction must
       still be reachable */
    const empty = FEELS.map(f => Math.atan2(f.pos[2], f.pos[0]));
    const away = empty[0] + Math.PI;
    await look(away, 0);
    ok(Math.abs(yaw - away) < 1e-9, 'the view would not go there');
    await look(home.yaw, home.pitch);
  });

  // -- the sky is fixed, the field is not -------------------------------------

  await T('a star does not swell when you narrow the view', async () => {
    /* it is infinitely far: nothing you do resolves it into a disc. Scaling by
       pixels-per-radian put letters two hundred tall on things meant to read as
       unreachable. */
    const size = () => Object.fromEntries(FEELS.filter(i => i.hit).map(i => [i.w, i.hit[3]]));
    /* Face the most populated quarter and narrow only as far as still leaves
       several feelings up. There are thirteen in the whole sky, so at 0.14 you
       see one or two and the comparison proves nothing either way. */
    STAND = [0, 0, 0]; yaw = 3 * Math.PI / 8; pitch = 0; FOV = fovWant = WIDE; await frame();
    const wide = size();
    FOV = fovWant = WIDE * 0.35; await frame();
    const tight = size();
    FOV = fovWant = WIDE; await frame();
    const both = Object.keys(wide).filter(k => tight[k]);
    ok(both.length > 3, 'only ' + both.length + ' stars were up to check');
    both.forEach(k => ok(Math.abs(tight[k] - wide[k]) < 1e-6,
      k + ' grew ' + (tight[k] / wide[k]).toFixed(1) + 'x when the view narrowed'));
    ok(Math.max(...Object.values(wide)) < 60, 'a star label is larger than a star should be');
  });

  await T('a bright star is brighter, not bigger', async () => {
    const bright = FEELS.reduce((a, b) => (a.str > b.str ? a : b));
    const faint = FEELS.reduce((a, b) => (a.str < b.str ? a : b));
    ok(bright.str > faint.str);
    /* The thirteen feelings span a narrow band of magnitude, 0.707 to 1.0, so
       the test is not an absolute ratio but which channel carries it: brightness
       must open a wider gap than size does. */
    const szOf = i => 10.5 + 6.5 * i.str;
    const aOf = i => Math.max(0.34, Math.min(1, 0.14 + 0.86 * i.str));
    const bySize = szOf(bright) / szOf(faint), byLight = aOf(bright) / aOf(faint);
    ok(byLight > bySize * 1.1, 'magnitude is going into size (' + bySize.toFixed(2)
       + 'x) rather than brightness (' + byLight.toFixed(2) + 'x)');
    ok(bySize < 1.3, 'a bright star is being drawn bigger, not just brighter');
  });

  await T('walking does not move a single star', async () => {
    const sky = () => Object.fromEntries(FEELS.filter(i => i.hit).map(i => [i.w, i.hit[0]]));
    STAND = [0, 0, 0]; await frame();
    const a = sky();
    for (const step of [0.6, 1.2, -2.0, 3.0]) { walk(step); await frame(); }
    const b = sky();
    let worst = 0, at = '';
    for (const w in a) if (b[w] && Math.abs(b[w] - a[w]) > worst) { worst = Math.abs(b[w] - a[w]); at = w; }
    ok(Object.keys(a).length > 8, 'no stars were up to check');
    ok(worst < 1e-9, at + ' moved ' + worst.toFixed(3) + 'px when the eye walked');
    STAND = [0, 0, 0]; await frame();
  });

  await T('a smell drifts with the weeds, because it is theirs', async () => {
    /* It is the WEEDS that smell, not the states. A feeling is a bearing you can
       want and so it hangs in the sky; a smell is something the weeds have, so
       it stands among them and moves as they move. */
    STAND = [0, 0, 0]; yaw = 1.2; pitch = 0; await frame();
    const grab = k => Object.fromEntries(ITEMS.filter(i => i.kind === k && i.hit).map(i => [i.w, i.hit[0]]));
    const weeds = () => Object.fromEntries(ST.filter(t => t.node).map(t => [t.n, t.node[0]]));
    const s0 = grab('smell'), f0 = grab('feel'), w0 = weeds();
    walk(1.0); await frame();
    const s1 = grab('smell'), f1 = grab('feel'), w1 = weeds();
    const move = (a, b) => { const o = []; for (const k in a) if (b[k]) o.push(Math.abs(b[k] - a[k])); return o; };
    const avg = x => x.reduce((s, v) => s + v, 0) / x.length;
    const sm = move(s0, s1), fe = move(f0, f1), wd = move(w0, w1);
    ok(sm.length > 4, 'too few smells up to check: ' + sm.length);
    ok(Math.max(...fe) < 1e-9, 'a feeling moved when you walked -- it is not sky any more');
    ok(avg(sm) > 10, 'the smells did not drift at all: ' + avg(sm).toFixed(1) + 'px');
    ok(FEELS.every(f => f.dist === undefined), 'a feeling was given a distance');
    ok(SMELLS.every(s => s.dist > 0), 'a smell has no place in the field');
    STAND = [0, 0, 0]; await frame();
  });

  await T('turning your head slides near weeds past far ones', async () => {
    /* THE CLAIM THIS SPACE IS FOR. Stand still, turn only. A camera pivoting on
       its own optical centre gives nothing here -- every point sweeps by the
       same angle whatever its distance, which is why a panorama stitches. A head
       is not that camera: the eye rides forward of the neck, so turning is also a
       small translation, and near things really do slide past far ones. */
    STAND = [0, 0, 0]; pitch = 0;
    const snap = () => Object.fromEntries(ST.filter(t => t.node).map(t => [t.n, [t.node[0], t.dist]]));
    const sky = () => Object.fromEntries(FEELS.filter(i => i.hit).map(i => [i.w, i.hit[0]]));
    yaw = 1.20; await frame(); const a = snap(), s0 = sky();
    yaw = 1.24; await frame(); const b = snap(), s1 = sky();

    const m = [];
    for (const n in a) if (b[n]) m.push({ d: a[n][1], px: b[n][0] - a[n][0] });
    m.sort((p, q) => p.d - q.d);
    const third = Math.floor(m.length / 3);
    const avg = xs => xs.reduce((s, x) => s + x.px, 0) / xs.length;
    const near = Math.abs(avg(m.slice(0, third))), far = Math.abs(avg(m.slice(-third)));
    const star = Math.abs(avg(Object.keys(s0).filter(k => s1[k]).map(k => ({ px: s1[k] - s0[k] }))));

    ok(m.length > 60, 'too few weeds tracked through the turn: ' + m.length);
    ok(near > far * 1.2, 'turning your head moved the near third ' + near.toFixed(1)
       + 'px and the far third ' + far.toFixed(1) + 'px -- that is a pinhole, not a head');
    ok(far > star, 'the field did not move against the sky at all');
    yaw = 1.2; await frame();
  });

  await T('a near weed sweeps faster than a far one', async () => {
    /* the instrument: how much a weed slides against the fixed sky is how near
       it is, and it is the only depth cue turning your head can never give */
    const snap = () => Object.fromEntries(ST.filter(t => t.node).map(t => [t.n, [t.node[0], t.dist]]));
    STAND = [0, 0, 0]; await frame();
    const a = snap();
    walk(1.2); await frame();
    const b = snap();
    const m = [];
    for (const n in a) if (b[n]) m.push({ d: a[n][1], px: Math.abs(b[n][0] - a[n][0]) });
    m.sort((p, q) => p.d - q.d);
    const third = Math.floor(m.length / 3);
    const avg = xs => xs.reduce((s, x) => s + x.px, 0) / xs.length;
    const near = avg(m.slice(0, third)), far = avg(m.slice(-third));
    STAND = [0, 0, 0]; await frame();
    ok(m.length > 60, 'too few weeds tracked through the step: ' + m.length);
    ok(near > far * 1.3, 'near weeds sweep ' + near.toFixed(1)
       + 'px, far ones ' + far.toFixed(1) + 'px -- that is not parallax');
  });

  await T('the field surrounds you wherever you can get to', async () => {
    /* the reason there is a rim at all: walk far enough and the field is no
       longer around you, it is a clump in front of you, which is the
       third-person view this space exists to refuse */
    STAND = [0, 0, 0];
    for (let i = 0; i < 60; i++) walk(0.5);           // press on at the rim
    await frame();
    ok(len(EYE) <= 5.0 + 1e-6, 'your eye left the field, reaching ' + len(EYE).toFixed(2));
    const y0 = yaw;
    let worst = 1e9, at = 0;
    for (let k = 0; k < 12; k++) {                    // look every thirty degrees
      yaw = y0 + k * Math.PI / 6; await frame();
      const n = ST.filter(t => t.node).length;
      if (n < worst) { worst = n; at = k * 30; }
    }
    yaw = y0; STAND = [0, 0, 0]; await frame();
    /* Lowered from 55. The rim moved out to buy a walk worth taking, and the
       cost was stated rather than hidden: out there the sparsest direction holds
       a few weeds instead of twenty. What must still be true is that it is never
       EMPTY -- you can reach somewhere sparse, never somewhere outside. */
    ok(worst >= 8, 'at the rim, looking ' + at + ' degrees round, only '
       + worst + ' weeds are there -- the field has ended rather than closed');
  });

  await T('walking back to the middle puts everything where it was', async () => {
    const snap = () => JSON.stringify(ST.filter(t => t.node).map(t => t.node[0].toFixed(3)));
    STAND = [0, 0, 0]; await frame();
    const a = snap();
    walk(2.0); await frame();
    ok(snap() !== a, 'walking changed nothing');
    STAND = [0, 0, 0]; await frame();
    ok(snap() === a, 'the middle is not where you left it');
  });

  // -- the approach ----------------------------------------------------------

  await T('what stays in frame through an approach is what lies that way', async () => {
    /* THE RECOGNITION TEST, run first person. A thing attracts attention,
       attention moves toward it, and what holds frame through the movement is
       what was really there. Checked against what the statistics already say:
       approaching focused should keep the citrus family, approaching relaxed
       should keep the earthy one. If walking and computing disagree, one of
       them is wrong. */
    const go = word => {
      STAND = [0, 0, 0]; FOV = fovWant = WIDE; held = null;
      const it = ITEMS.find(i => i.w === word);
      faceTo(it.pos); yaw = target[0]; pitch = target[1]; target = null; draw();
      beginApproach();
      let guard = 60;
      while (approaching > 0 && guard-- > 0) { stepApproach(); draw(); }
      return new Set([...held].filter(m => m.kind === 'smell').map(m => m.w));
    };
    const f = go('focused'), r = go('relaxed');
    STAND = [0, 0, 0]; held = null; await frame();

    ok(f.size && r.size, 'nothing held either approach');
    ok(f.has('citrus'), 'citrus did not hold on the way to focused');
    ok(r.has('earthy'), 'earthy did not hold on the way to relaxed');
    ok(!f.has('earthy'), 'earthy held on the way to focused -- it lies the other way');
    ok(!r.has('citrus'), 'citrus held on the way to relaxed -- it lies the other way');
    ok(f.size < SMELLS.length / 2 && r.size < SMELLS.length / 2,
       'the approach kept nearly everything, so it is not discriminating');
  });

  await T('an approach walks the whole way it is allowed', async () => {
    STAND = [0, 0, 0]; held = null;
    beginApproach();
    let guard = 60;
    while (approaching > 0 && guard-- > 0) { stepApproach(); draw(); }
    ok(len(STAND) > 2.5, 'the walk stopped at ' + len(STAND).toFixed(2) + ' -- too short to test anything');
    ok(len(STAND) <= 5.0 - 2.2 + 1e-6, 'the approach walked past the rim');
    STAND = [0, 0, 0]; held = null; await frame();
  });

  await T('the sky cannot fail an approach, which is why it is the reference', async () => {
    STAND = [0, 0, 0]; held = null;
    beginApproach();
    let guard = 60;
    while (approaching > 0 && guard-- > 0) { stepApproach(); draw(); }
    ok(held, 'no approach was recorded');
    ok([...held].every(m => m.kind !== 'feel'), 'a feeling was entered into the test');
    STAND = [0, 0, 0]; held = null; await frame();
  });

  // -- nothing pops ----------------------------------------------------------

  await T('nothing appears or disappears as you turn', async () => {
    let prev = null, worst = 0;
    for (let a = 0; a < 6.2832; a += 0.06) {
      await look(a, 0);
      const now = drawn();
      if (prev !== null) worst = Math.max(worst, Math.abs(now - prev));
      prev = now;
    }
    await look(home.yaw, home.pitch);
    ok(worst <= 24, 'a small turn changed the count by ' + worst);
  });

  await T('a weed reads against the black without outshining the sky', async () => {
    /* Measured as luminance actually put on screen -- the colour times the alpha
       it is drawn at -- because a hue equalised at full strength still vanishes
       once alpha halves it. The weeds once sat at a median 0.21 against the
       words' 0.38, with the darkest at 0.179, under even the dimmest word.

       Two bounds, and they pull opposite ways: every weed must clear the faintest
       star, and the middle of the field must stay below the middle of the sky,
       because the sky is the frame you read the field against. */
    const lum = (h, s, l) => {
      h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
      const c = (1 - Math.abs(2*l - 1)) * s, x = c * (1 - Math.abs((h/60) % 2 - 1)), m = l - c/2;
      const [r, g, b] = [[c,x,0],[x,c,0],[0,c,x],[0,x,c],[x,0,c],[c,0,x]][Math.floor(h/60) % 6];
      return 0.2126*(r+m) + 0.7152*(g+m) + 0.0722*(b+m);
    };
    const mid = xs => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    STAND = [0, 0, 0];
    let worstWeed = 1, worstWhere = '';
    const weedMids = [], wordMids = [];
    for (let a = 0; a < 6.2832; a += 0.7) {          // sample the whole sky
      yaw = a; pitch = 0; await frame();
      const ws = [], ds = [];
      for (const t of ST) {
        if (!t.node) continue;
        /* the alpha the page actually drew it at, carried on the node -- not
           recomputed here, which would only prove the formula equals itself.
           A weed is green now, at a lightness set by how much it commits, so
           there is no per-weed hue to read. */
        const val = t.node[3] * lum(112, 66, 46 + 20 * t.lean);
        ws.push(val);
        if (val < worstWeed) { worstWeed = val; worstWhere = t.n; }
      }
      for (const i of FEELS) if (i.hit)
        ds.push(Math.max(0.34, Math.min(1, 0.14 + 0.86 * i.str)) * lum(i.hue, i.sat, i.lit));
      if (ws.length) weedMids.push(mid(ws));
      if (ds.length) wordMids.push(mid(ds));
    }
    await look(home.yaw, home.pitch);
    ok(worstWeed > 0.24, 'the darkest weed sits at ' + worstWeed.toFixed(3)
       + ' (' + worstWhere + ') -- under the faintest star');
    ok(mid(weedMids) < mid(wordMids), 'the field is outshining the sky it is read against');
  });

  await T('no mark ever fades into the ground', async () => {
    /* marks dim with distance and with how far off-centre they are, but they
       never reach alpha 0 -- that is disappearing, not receding */
    for (let a = 0; a < 6.2832; a += 0.4) {
      await look(a, 0);
      for (const t of ST) if (t.node) ok(t.node[2] === undefined || t.node[2] > 0.05, t.n + ' faded out');
    }
    await look(home.yaw, home.pitch);
  });

  await T('every word keeps its label; only weeds go nameless', async () => {
    for (let a = 0; a < 6.2832; a += 0.5) {
      await look(a, 0);
      const front = ITEMS.filter(i => i.hit);
      ok(front.every(i => i.w), 'a word lost its name');
    }
    await look(home.yaw, home.pitch);
  });

  // -- labels hold still -----------------------------------------------------

  await T('a label is nailed to its point and does not jump', async () => {
    /* Displacement is not the test any more. A feeling is sky and barely moves;
       a smell is in the field and legitimately sweeps, because the neck gives it
       parallax. What must never happen is a JUMP -- the collision-nudging that
       made labels snap sideways as the view crept. So each label is measured
       against its OWN typical step, and a spike is the failure. */
    FOV = fovWant = WIDE;
    const where = () => Object.fromEntries(ITEMS.filter(i => i.hit).map(i => [i.w, i.hit.slice(0, 2)]));
    await look(home.yaw, 0);
    let prev = where();
    const steps = {};
    for (let s = 1; s <= 14; s++) {
      await look(home.yaw + s * 0.01, 0);
      const now = where();
      for (const w in now) if (prev[w]) {
        (steps[w] = steps[w] || []).push(Math.hypot(now[w][0] - prev[w][0], now[w][1] - prev[w][1]));
      }
      prev = now;
    }
    await look(home.yaw, home.pitch);
    let worst = 0, at = '';
    for (const w in steps) {
      const d = steps[w];
      if (d.length < 6) continue;
      const med = [...d].sort((x, y) => x - y)[Math.floor(d.length / 2)];
      const spike = Math.max(...d) / Math.max(med, 0.25);
      if (spike > worst) { worst = spike; at = w; }
    }
    ok(at, 'no label was tracked through the turn');
    ok(worst < 4, 'label "' + at + '" jumped ' + worst.toFixed(1)
       + 'x its own usual step -- that is nudging, not moving');
  });

  // -- a mark and its label say the same thing -------------------------------

  await T('the hover names the longest spokes', () => {
    /* Order within the leading group is settled by where the weed stands, not by
       value, so strict descending is NOT the rule -- but the group must still be
       the right set, and everything after it must be genuinely lesser. */
    for (const t of ST.slice(0, 60)) {
      const html = does(t);
      const named = [...html.matchAll(/class="nm[^"]*">([^<]+)</g)].map(m => m[1]);
      const want = EFFECT_ORDER.map((w, i) => [w, t.r[i]]).sort((a, b) => b[1] - a[1]);
      const cut = want[2][1];
      ok(named.length === want.filter(x => x[1] >= cut).length, t.n + ': wrong number of bars');
      ok(named.length >= 3, t.n + ': fewer than three');
      const vals = named.map(n => t.r[EFFECT_ORDER.indexOf(n)]);
      ok(Math.min(...vals) >= cut, t.n + ': named an effect below the cut');

      const best = want[0][1];
      const led = vals.filter(v => v >= best - 1).length;
      ok(vals.slice(0, led).every(v => v >= best - 1), t.n + ': the leading group is not the level ones');
      ok(vals.slice(led).every(v => v < best - 1), t.n + ': a lesser effect got into the group');
      ok(vals.slice(led).every((v, i) => i === 0 || v <= vals[led + i - 1]),
         t.n + ': the tail is out of order');
    }
  });

  await T('a bar is as long as the effect is strong, and no shorter than visible', () => {
    for (const t of ST.slice(0, 60)) {
      const html = does(t);
      const w = [...html.matchAll(/width:([\d.]+)%/g)].map(m => +m[1]);
      const named = [...html.matchAll(/class="nm[^"]*">([^<]+)</g)].map(m => m[1]);
      named.forEach((n, i) => {
        const v = t.r[EFFECT_ORDER.indexOf(n)];
        ok(Math.abs(w[i] - Math.max(4, 100 * v / 9)) < 0.01, t.n + '/' + n + ': bar is the wrong length');
      });
      ok(w.every(x => x >= 4), t.n + ': a bar too short to see');
    }
  });

  await T('a bar carries its own effect’s colour, not the weed’s', () => {
    const by = Object.fromEntries(FEELS.map(f => [f.w, f]));
    for (const t of ST.slice(0, 60)) {
      const html = does(t);
      const named = [...html.matchAll(/class="nm[^"]*">([^<]+)</g)].map(m => m[1]);
      const hues = [...html.matchAll(/hsl\(([\d.]+),/g)].map(m => +m[1]);
      named.forEach((n, i) => ok(Math.abs(hues[i] - by[n].hue) < 0.05, n + ': wrong colour'));
    }
  });

  await T('the top bar is the star the weed sits under, wherever the data allows', () => {
    /* A bar is round(9 x percentile), so a one-step lead can be a thousandth of
       a percentile. 47% of weeds have no single longest bar and 85% lead by a
       step or less, so a plain sorted list invents a winner. Everything within a
       step of the best is one level group, ordered inside by which feeling the
       weed actually stands nearest -- and the top bar is then the nearest star
       77% of the time, against 36% for a hard argmax. */
    let hit = 0, led = [];
    for (const t of ST) {
      const named = [...does(t).matchAll(/class="nm[^"]*">([^<]+)</g)].map(m => m[1]);
      const d = unit(t.pos);
      const near = FEELS.map(f => [dot(d, unit(f.pos)), f.w]).sort((a, b) => b[0] - a[0])[0][1];
      if (named[0] === near) hit++;
      const best = Math.max(...t.r);
      led.push(EFFECT_ORDER.filter((w, i) => t.r[i] >= best - 1).length);
    }
    const rate = hit / ST.length;
    ok(rate > 0.70, 'the top bar is the nearest star only ' + (rate * 100).toFixed(0) + '% of the time');
    ok(Math.max(...led) > 6, 'the leading groups have collapsed to single winners');
  });

  await T('what follows the leading group is drawn quieter', () => {
    /* the group is level; what comes after it genuinely is not, and must not
       read as though it were */
    const shownOf = t => {
      const e = EFFECT_ORDER.map((w, i) => [w, t.r[i]]).sort((a, b) => b[1] - a[1]);
      return e.filter(x => x[1] >= e[2][1]);
    };
    const withTail = ST.filter(t => {
      const s = shownOf(t);
      return s.some(x => x[1] < s[0][1] - 1);
    });
    ok(withTail.length > 150, 'only ' + withTail.length + ' weeds have a tail at all');
    const many = withTail[0];
    const html = does(many);
    ok(html.includes('trk less'), 'the tail is not drawn quieter');
    ok(html.includes('nm less'), 'the tail is not labelled quieter');
    const first = html.indexOf('less');
    ok(html.slice(0, first).includes('class="trk"'), 'the leading group is being dimmed too');
  });

  await T('the hover never settles a tie by list order', () => {
    let ties = 0;
    for (const t of ST) {
      const s = [...t.r].sort((a, b) => b - a);
      const named = [...does(t).matchAll(/class="nm[^"]*">([^<]+)</g)].map(m => m[1]);
      ok(named.length === t.r.filter(v => v >= s[2]).length, t.n + ': a tie was trimmed');
      if (named.length > 3) ties++;
    }
    ok(ties === 317, 'the number of weeds with a tie at the third changed: ' + ties);
  });

  await T('no weed is described by a single word', () => {
    ok(!document.body.innerHTML.includes('mostly '), 'the argmax label is back');
    ok(ST.every(t => t.e === undefined), 'the argmax is being carried again');
  });

  // -- the globe and the world agree -----------------------------------------

  await T('nothing in the page can be selected by accident', () => {
    /* dragging the view is the main gesture; a drag that catches the legend or
       the globe behind it turns half the screen blue */
    const sel = el => getComputedStyle(el).webkitUserSelect || getComputedStyle(el).userSelect;
    const must = [document.body, document.getElementById('globe'),
                  document.getElementById('names'), document.getElementById('view'),
                  document.querySelector('.lede'), document.querySelector('#list .s'),
                  document.querySelector('h1'), document.getElementById('bClear')];
    must.forEach(e => { ok(e, 'a checked element is missing'); ok(sel(e) === 'none', (e.id || e.className || e.tagName) + ' is selectable'); });

    /* and prove it with a real selection attempt across the whole document */
    const r = document.createRange();
    r.selectNodeContents(document.body);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    const got = String(s).trim();
    s.removeAllRanges();
    ok(got === '', 'selecting the document still yielded ' + got.length + ' characters');
  });

  await T('G toggles the globe, and the hover stays readable over it', async () => {
    const g = document.getElementById('globe');
    const before = g.style.display;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g' }));
    await frame();
    ok(g.style.display !== before, 'G did not toggle the globe');
    const names = document.getElementById('names');
    ok(+getComputedStyle(names).zIndex > +getComputedStyle(g).zIndex, 'the globe covers the hover');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g' }));
    await frame();
  });

  await T('the globe paints a feeling where the world puts it', async () => {
    /* one arrangement, two views of it: a colour on the globe has to be the
       colour of the feeling that lies in that direction */
    for (const f of FEELS) {
      const near = FEELS.filter(o => o !== f)
        .filter(o => {
          const d = (a, b) => a.pos.reduce((s, x, i) => s + x * b.pos[i], 0)
            / (Math.hypot(...a.pos) * Math.hypot(...b.pos));
          return d(f, o) > 0.97;
        });
      near.forEach(o => ok(hueGap(f.hue, o.hue) < 25, f.w + ' and ' + o.w + ' sit together but clash'));
    }
  });

  // -- what the page says about itself ---------------------------------------

  await T('the readout compares a claim against its base rate', () => {
    for (const e of EFFECT_ORDER) ok(D.chance[e] > 0, e + ' has no base rate');
  });

  await T('a smell in the list wears the colour it has in the sky', async () => {
    /* so it is recognised rather than read, and so the list also shows which
       smells lie together and which lie apart */
    const rows = [...document.querySelectorAll('#list .s')];
    ok(rows.length === SMELLS.length, 'the list is not the vocabulary');
    const probe = document.createElement('span');
    document.body.appendChild(probe);
    const asRGB = css => { probe.style.color = css; return getComputedStyle(probe).color; };
    let dimmest = 1;
    for (const r of rows) {
      const w = r.textContent.trim();
      const it = SMELLS.find(s => s.w === w);
      ok(it, w + ' is in the list but not in the sky');
      const got = getComputedStyle(r.querySelector('span')).color;
      ok(got === asRGB(`hsl(${it.hue},${it.sat}%,${it.lit}%)`), w + ' is the wrong colour');
      ok(getComputedStyle(r.querySelector('i')).borderTopColor === got, w + ': chip and name disagree');
      const m = got.match(/[\d.]+/g).map(Number);
      dimmest = Math.min(dimmest, (0.2126*m[0] + 0.7152*m[1] + 0.0722*m[2]) / 255);
    }
    probe.remove();
    ok(dimmest > 0.55, 'the dimmest name in the list is at ' + dimmest.toFixed(2)
       + ' -- too dark to read against the panel');
  });

  await T('picking a smell fills its chip and clearing empties it', async () => {
    document.getElementById('bClear').click(); await frame();
    const row = [...document.querySelectorAll('#list .s')]
      .find(r => r.textContent.trim() === 'citrus');
    const chip = row.querySelector('i');
    ok(!chip.style.background, 'the chip started filled');
    row.click(); await frame();
    ok(chip.style.background, 'picking did not fill the chip');
    ok(getComputedStyle(chip).backgroundColor
       === getComputedStyle(row.querySelector('span')).color, 'filled with the wrong colour');
    document.getElementById('bClear').click(); await frame();
    ok(!chip.style.background, 'clear left the chip filled');
  });

  await T('picking a smell turns you to face it', async () => {
    document.getElementById('bClear').click();
    const row = [...document.querySelectorAll('#list .s')]
      .find(r => r.textContent.trim() === 'citrus');
    ok(row, 'citrus is not in the list');
    row.click(); await frame();
    ok(state.has('citrus'), 'the pick was not recorded');
    ok(row.getAttribute('aria-checked') === 'yes', 'the row does not read as picked');
    ok(target !== null, 'nothing was aimed at');
    aimsAt(target, SMELLS.find(s => s.w === 'citrus').pos, 'citrus');
    row.click(); await frame();
    ok(!state.has('citrus'), 'the pick would not clear');
  });

  await T('two smells turn you to the middle of both', async () => {
    document.getElementById('bClear').click();
    const rows = [...document.querySelectorAll('#list .s')];
    const a = rows.find(r => r.textContent.trim() === 'citrus');
    const b = rows.find(r => r.textContent.trim() === 'earthy');
    a.click(); b.click(); await frame();
    ok(state.size === 2, 'both picks did not stick');
    const dir = ['citrus', 'earthy'].map(w => SMELLS.find(s => s.w === w).pos);
    const want = [0, 1, 2].map(k => dir.reduce((s, p) => s + p[k] / Math.hypot(...p), 0));
    aimsAt(target, want, 'the middle of citrus and earthy');
    a.click(); b.click(); await frame();
    ok(state.size === 0, 'the picks would not clear');
  });

  await T('clearing puts every pick back', async () => {
    [...document.querySelectorAll('#list .s')].slice(0, 3).forEach(r => r.click());
    await frame();
    ok(state.size === 3);
    document.getElementById('bClear').click(); await frame();
    ok(state.size === 0, 'clear left something behind');
    ok([...document.querySelectorAll('#list .s')]
      .every(r => r.getAttribute('aria-checked') === 'off'), 'a row still reads as picked');
  });

  yaw = home.yaw; pitch = home.pitch; fovWant = home.fov; vYaw = vPitch = 0;
  await frame();

  const bad = R.filter(r => r.startsWith('FAIL'));
  console.log(R.join('\n'));
  console.log(`\n${R.length - bad.length}/${R.length} pass`);
  return R.join('\n') + `\n\n${R.length - bad.length}/${R.length} pass`;
})();
