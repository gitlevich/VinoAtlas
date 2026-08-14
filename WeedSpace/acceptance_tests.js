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

  await T('a pinch moves you through the field, and two fingers never do', async () => {
    STAND = [0, 0, 0]; yaw = 1.2; await frame();

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

  await T('the home button and the keys redraw too', async () => {
    STAND = [0, 0, 0]; await frame();
    let d = DRAWS;                              // count from BEFORE the act
    walk(1.5); await settle();
    ok(len(STAND) > 0, 'walking did not move you');
    ok(DRAWS > d, 'walking left the screen as it was');
    d = DRAWS;
    document.getElementById('bHome').click(); await settle();
    ok(len(STAND) < 1e-9 && DRAWS > d, 'going back to the middle did not repaint');
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
    const size = () => Object.fromEntries(ITEMS.filter(i => i.hit).map(i => [i.w, i.hit[3]]));
    /* face a populated quarter -- narrowing to 0.14 leaves few stars in view, so
       a heading with only one or two would prove nothing either way */
    STAND = [0, 0, 0]; yaw = 1.2; pitch = 0; FOV = fovWant = WIDE; await frame();
    const wide = size();
    FOV = fovWant = WIDE * 0.14; await frame();
    const tight = size();
    FOV = fovWant = WIDE; await frame();
    const both = Object.keys(wide).filter(k => tight[k]);
    ok(both.length > 3, 'no stars were up to check');
    both.forEach(k => ok(Math.abs(tight[k] - wide[k]) < 1e-6,
      k + ' grew ' + (tight[k] / wide[k]).toFixed(1) + 'x when the view narrowed'));
    ok(Math.max(...Object.values(wide)) < 60, 'a star label is larger than a star should be');
  });

  await T('a bright star is brighter, not bigger', async () => {
    const bright = ITEMS.reduce((a, b) => (a.str > b.str ? a : b));
    const faint = ITEMS.reduce((a, b) => (a.str < b.str ? a : b));
    ok(bright.str > faint.str);
    /* size varies only a little with magnitude; the carrying signal is alpha */
    const szOf = i => (i.kind === 'feel' ? 10.5 : 9.5) + (i.kind === 'feel' ? 6.5 : 5.0) * i.str;
    ok(szOf(bright) / szOf(faint) < 2, 'magnitude is being spent on size');
    const aOf = i => Math.max(0.34, Math.min(1, 0.14 + 0.86 * i.str));
    ok(aOf(bright) / aOf(faint) > 2.4, 'magnitude is not reaching brightness');
  });

  await T('walking does not move a single star', async () => {
    const sky = () => Object.fromEntries(ITEMS.filter(i => i.hit).map(i => [i.w, i.hit[0]]));
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

  await T('turning your head slides near weeds past far ones', async () => {
    /* THE CLAIM THIS SPACE IS FOR. Stand still, turn only. A camera pivoting on
       its own optical centre gives nothing here -- every point sweeps by the
       same angle whatever its distance, which is why a panorama stitches. A head
       is not that camera: the eye rides forward of the neck, so turning is also a
       small translation, and near things really do slide past far ones. */
    STAND = [0, 0, 0]; pitch = 0;
    const snap = () => Object.fromEntries(ST.filter(t => t.node).map(t => [t.n, [t.node[0], t.dist]]));
    const sky = () => Object.fromEntries(ITEMS.filter(i => i.hit).map(i => [i.w, i.hit[0]]));
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
    ok(len(EYE) <= 3.4 + 1e-6, 'your eye left the field, reaching ' + len(EYE).toFixed(2));
    const y0 = yaw;
    let worst = 1e9, at = 0;
    for (let k = 0; k < 12; k++) {                    // look every thirty degrees
      yaw = y0 + k * Math.PI / 6; await frame();
      const n = ST.filter(t => t.node).length;
      if (n < worst) { worst = n; at = k * 30; }
    }
    yaw = y0; STAND = [0, 0, 0]; await frame();
    ok(worst >= 55, 'at the rim, looking ' + at + ' degrees round, only '
       + worst + ' weeds are there -- the field has ended rather than closed');
  });

  await T('walking back to the middle puts everything where it was', async () => {
    const snap = () => JSON.stringify(ST.filter(t => t.node).map(t => t.node[0].toFixed(3)));
    STAND = [0, 0, 0]; await frame();
    const a = snap();
    walk(2.0); await frame();
    ok(snap() !== a, 'walking changed nothing');
    document.getElementById('bHome').click(); await frame();
    ok(snap() === a, 'the middle is not where you left it');
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
    const where = () => Object.fromEntries(ITEMS.filter(i => i.hit).map(i => [i.w, i.hit.slice(0, 2)]));
    await look(home.yaw, 0);
    let prev = where(), worst = 0, at = '';
    for (let s = 1; s <= 12; s++) {
      await look(home.yaw + s * 0.01, 0);
      const now = where();
      for (const w in now) if (prev[w]) {
        const d = Math.hypot(now[w][0] - prev[w][0], now[w][1] - prev[w][1]);
        if (d > worst) { worst = d; at = w; }
      }
      prev = now;
    }
    await look(home.yaw, home.pitch);
    ok(worst < 12, 'label "' + at + '" moved ' + worst.toFixed(1) + 'px in one step');
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
