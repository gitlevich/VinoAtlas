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
  const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
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

  await T('the hover names the longest spokes, in order', () => {
    for (const t of ST.slice(0, 60)) {
      const html = does(t);
      const named = [...html.matchAll(/class=nm>([^<]+)</g)].map(m => m[1]);
      const want = EFFECT_ORDER.map((w, i) => [w, t.r[i]]).sort((a, b) => b[1] - a[1]);
      const cut = want[2][1];
      ok(named.length === want.filter(x => x[1] >= cut).length, t.n + ': wrong number of bars');
      ok(named.length >= 3, t.n + ': fewer than three');
      const vals = named.map(n => t.r[EFFECT_ORDER.indexOf(n)]);
      ok(vals.every((v, i) => i === 0 || v <= vals[i - 1]), t.n + ': bars out of order');
      ok(Math.min(...vals) >= cut, t.n + ': named an effect below the cut');
    }
  });

  await T('a bar is as long as the effect is strong, and no shorter than visible', () => {
    for (const t of ST.slice(0, 60)) {
      const html = does(t);
      const w = [...html.matchAll(/width:([\d.]+)%/g)].map(m => +m[1]);
      const named = [...html.matchAll(/class=nm>([^<]+)</g)].map(m => m[1]);
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
      const named = [...html.matchAll(/class=nm>([^<]+)</g)].map(m => m[1]);
      const hues = [...html.matchAll(/hsl\(([\d.]+),/g)].map(m => +m[1]);
      named.forEach((n, i) => ok(Math.abs(hues[i] - by[n].hue) < 0.05, n + ': wrong colour'));
    }
  });

  await T('the hover never settles a tie by list order', () => {
    let ties = 0;
    for (const t of ST) {
      const s = [...t.r].sort((a, b) => b - a);
      const named = [...does(t).matchAll(/class=nm>([^<]+)</g)].map(m => m[1]);
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
