/* Cellar Compass acceptance tests. Run in the loaded page (browser console or
   the harness's javascript tool). Touches live state; restores what it can and
   reports the rest. Every test name states the acceptance criterion. */
(async () => {
  const R = [];
  const T = async (name, fn) => {
    try { await fn(); R.push('pass  ' + name); }
    catch (e) { R.push('FAIL  ' + name + '  -- ' + String(e.message || e)); }
  };
  const ok = (c, m) => { if (!c) throw new Error(m || 'assert'); };
  const eq = (a, b, m) => {
    if (JSON.stringify(a) !== JSON.stringify(b))
      throw new Error((m || '') + ' got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b));
  };
  const near = (a, b, m) => { if (Math.abs(a - b) > 1e-9) throw new Error((m||'') + ' got ' + a + ' want ' + b); };

  /* -- reading the page's colours as the eye gets them --------------------
     A colour reaches the reader composited: its own alpha over whatever
     backgrounds lie behind it, all the way down to the body. These read that
     stack the way a browser paints it, so a contrast figure here is the
     figure on screen, not the one the stylesheet hoped for. */
  const chan = c => {
    const m = String(c).trim().match(/^#([0-9a-f]{6})$/i);
    if (m) return { r: parseInt(m[1].slice(0,2),16), g: parseInt(m[1].slice(2,4),16), b: parseInt(m[1].slice(4,6),16), a: 1 };
    const n = String(c).match(/rgba?\(([^)]+)\)/);
    if (!n) return null;
    const v = n[1].split(/[\s,\/]+/).filter(Boolean).map(Number);
    return { r: v[0], g: v[1], b: v[2], a: v.length > 3 ? v[3] : 1 };
  };
  const rgb = c => { const x = chan(c); return x ? x.r + ',' + x.g + ',' + x.b : String(c); };
  const token = n => rgb(getComputedStyle(document.documentElement).getPropertyValue(n).trim());
  const lay = (fg, bg) => ({ r: fg.r*fg.a + bg.r*(1-fg.a), g: fg.g*fg.a + bg.g*(1-fg.a), b: fg.b*fg.a + bg.b*(1-fg.a), a: 1 });
  const relLum = ({ r, g, b }) => {
    const f = v => { v /= 255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); };
    return 0.2126*f(r) + 0.7152*f(g) + 0.0722*f(b);
  };
  const contrast = (a, b) => {
    const [x, y] = [relLum(a), relLum(b)];
    return (Math.max(x,y) + 0.05) / (Math.min(x,y) + 0.05);
  };
  const groundUnder = node => {
    const stack = [];
    for (let n = node; n; n = n.parentElement) {
      const c = chan(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) { stack.push(c); if (c.a === 1) break; }
    }
    let base = chan(getComputedStyle(document.body).backgroundColor) || { r:255, g:255, b:255, a:1 };
    for (let i = stack.length - 1; i >= 0; i--) base = lay(stack[i], base);
    return base;
  };
  /* every word the page shows, with the contrast it is read at */
  const readings = () => {
    const out = [];
    document.querySelectorAll('*').forEach(node => {
      const words = [...node.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim())
        .map(n => n.textContent.trim()).join(' ');
      if (!words) return;
      const st = getComputedStyle(node);
      if (st.display === 'none' || st.visibility === 'hidden') return;
      const box = node.getBoundingClientRect();
      if (!box.width || !box.height) return;
      const drawn = node.ownerSVGElement || node.tagName === 'text' || node.tagName === 'tspan';
      const face = chan(drawn ? st.fill : st.color);
      if (!face) return;
      const veil = parseFloat(st.opacity || 1) * (drawn ? parseFloat(st.fillOpacity || 1) : 1);
      const ground = groundUnder(node);
      out.push({ words: words.slice(0, 40), size: parseFloat(st.fontSize),
                 ratio: contrast(lay({ ...face, a: face.a * veil }, ground), ground) });
    });
    return out;
  };
  /* the root's own restyle does not reach every subtree before the next read,
     so a theme swap is given a frame to land before anything is measured */
  const wearTheme = async name => {
    name ? document.documentElement.setAttribute('data-theme', name)
         : document.documentElement.removeAttribute('data-theme');
    await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
  };
  const ask = el('ask');
  const type = t => { ask.focus(); ask.value = t; ask.setSelectionRange(t.length, t.length); ask.dispatchEvent(new Event('input')); };
  const snap = { v: localStorage.getItem('cc_votes'), a: localStorage.getItem('cc_agent'), c: localStorage.getItem('cc_chat'), s: localStorage.getItem('cc_spend') };
  const realConfirm = window.confirm; window.confirm = () => true;

  // -- boot --
  await T('all five tabs and both panels exist', () => {
    ['t-find','t-palate','t-move','t-pop','t-how'].forEach(id => ok(el(id), id));
    ok(el('out').children.length > 0, 'wine list rendered');
    ok(el('axes').children.length === 5, 'five measures');
  });

  // -- spell parsing --
  await T('prose and/or/not stay prose', () => {
    const sp = parseSpell('Look at my profile and tell me.');
    ok(sp.hasPlain); ok(!sp.toks.some(t => t.c === 'tk-op'), 'no operator token');
  });
  await T('operator binds beside an invariant or measured word', () => {
    const sp = parseSpell('!oak ..0.3 and cherry');
    ok(sp.toks.some(t => t.c === 'tk-op'), 'op bound');
    eq(sp.holds.oak, [0, 0.3]); ok(sp.gloss.length === 1); ok(!sp.hasPlain);
  });
  await T('descending range is refused with a diagnostic', () => {
    const sp = parseSpell('!grip 0.7..0.2');
    ok(!sp.holds.grip); ok(sp.diags.length > 0);
  });
  await T('bare invariant asks for its range', () => {
    const sp = parseSpell('!oak');
    ok(sp.diags.some(d => d.includes('range'))); ok(sp.toks.some(t => t.c.includes('tk-err')));
  });
  await T('numbers above 1 read as a share of 100', () => {
    near(parseSpell('!oak ..30').holds.oak[1], 0.3);
  });
  await T('a full range is no invariant', () => {
    ok(!parseSpell('!oak 0..1').holds.oak);
  });
  await T('quotes keep a phrase literal', () => {
    const sp = parseSpell('"black and white"');
    ok(sp.toks[0].c === 'tk-quote'); ok(sp.hasPlain);
  });
  await T('#quality alone is not plain words; with more/less it is', () => {
    ok(!parseSpell('#fruit').hasPlain);
    ok(parseSpell('more #fruit').hasPlain);
  });
  await T('measured words carry their grounding', () => {
    const sp = parseSpell('unoaked tannic');
    near(sp.ground.oak, 0.05); near(sp.ground.grip, 0.85); ok(!sp.hasPlain);
  });

  // -- @ autocomplete --
  await T('@ opens the wine menu and picking records the reference', () => {
    type('like @ech');
    ok(!el('mention').hidden, 'menu open');
    ok(mlist.length > 0 && /echezeaux/i.test(mlist[0].name), 'echezeaux found');
    pickMention(0);
    ok(ask.value.includes('@' + mlist[0].name) || Object.keys(refs).length > 0, 'ref recorded');
    ok(Object.keys(refs).length > 0);
  });

  // -- local execution --
  await T('a spell of invariants runs locally: chat grows, band filters', () => {
    const before = chat.length;
    type('!oak ..0.3'); el('askGo').click();
    ok(chat.length === before + 2, 'user+assistant added');
    eq(hold.oak, [0, 0.3]);
    ok(parseInt(el('count').textContent) < 1424, 'pool filtered');
    ok(chat[chat.length - 1].text.includes('oak'), 'reply names the measure');
  });
  await T('a measured word moves its measure to its grounded value', () => {
    setBands({});
    type('cherry'); el('askGo').click();
    near(point.fruit, 0.8);
  });
  await T('a pointed wine sets the point to its coordinates', () => {
    el('resetTaste').click();
    const name = Object.keys(refs)[0] || (() => { type('like @ech'); pickMention(0); return Object.keys(refs)[0]; })();
    const w = S.wines.find(x => x.id === refs[name]);
    type('@' + name); el('askGo').click();
    A.forEach(a => near(point[a], Math.min(Math.max(w[a], band[a][0]), band[a][1]), a));
  });

  // -- the wish under the point (band push must be reversible) --
  await T('a band pushing the point is undone by releasing the band', () => {
    el('resetTaste').click();
    const stood = point.oak;
    setPoint({ ...point });                     // wish = current point
    setBands({ oak: [Math.min(0.9, stood + 0.3), 1] });   // band starts past the point
    ok(point.oak >= stood + 0.3 - 1e-9, 'point pushed into band');
    setBands({});                               // release
    near(point.oak, stood, 'point returned');
  });

  // -- your taste, written out --
  await T('the measured sigil writes only informative invariants', () => {
    el('mySigil').click();
    ok(/^!/.test(ask.value), 'spell written');
    ok(!ask.value.includes('0.00..1.00'), 'no empty invariant');
    type(ask.value); el('askGo').click();
    ok(Object.keys(hold).length > 0, 'bands set');
  });

  // -- radar --
  await T('the radar draws, and a hovered wine overlays with a verdict', () => {
    ok(el('radar').querySelector('svg'), 'svg present');
    const row = el('out').querySelector('.row');
    row.dispatchEvent(new MouseEvent('mouseenter'));
    ok(el('radar').querySelectorAll('circle').length === 5, 'five wine dots');
    ok(/than you asked|just what you asked for/.test(el('radarName').textContent), 'difference in plain words');
    row.dispatchEvent(new MouseEvent('mouseleave'));
    ok(el('radarName').textContent === '', 'overlay cleared');
  });

  // -- chat plumbing (no network) --
  await T('the chart fills its column', () => {
    const svg = el('radar').querySelector('svg').getBoundingClientRect();
    const card = el('radar').closest('.card').getBoundingClientRect();
    ok(svg.width > (card.width - 40) * 0.95, 'no cap shrinks it: ' + Math.round(svg.width) + ' of ' + Math.round(card.width));
  });
  await T('your profile is the one filled shape, there from the first glance', () => {
    setBands({});
    const svg = el('radar').innerHTML;
    ok(svg.indexOf('class="rout"') < svg.indexOf('class="rpt"'), 'neutral ground painted under your shape');
    const css = document.getElementById('cc-css').textContent;
    ok(/\.rpt\{fill:var\(--me\)/.test(css), 'your shape is the filled one -- inside it is you');
    ok(!/rsig/.test(svg), 'one shape only: no second region competing for "you"');
    ok(/the wine you are looking for/.test(document.querySelector('.rleg').textContent), 'the legend says what it is');
  });
  await T('the caption reports difference, never a verdict the ranking does not use', () => {
    const w = S.wines.find(x => A.some(a => x[a] > point[a] + 0.08));
    radarWine(w);
    const cap = el('radarName').textContent;
    ok(/than you asked|just what you asked for/.test(cap), 'stated as difference: ' + cap);
    ok(!/fits|outside|inside/.test(cap), 'no pass-or-fail language the list never applies');
    radarWine(null);
  });
  await T('replies parse whether JSON, fenced, wrapped in prose, or prose alone', () => {
    eq(parseReply('{"say":"x"}').say, 'x');
    eq(parseReply('```json\n{"say":"y"}\n```').say, 'y');
    eq(parseReply('Your usual leans light. {"say":"z"} hope that helps').say, 'z');
    eq(parseReply('Your usual leans light.').say, 'Your usual leans light.');
  });
  await T('history coalesces same-role runs and never opens with the assistant', () => {
    const keep = chat.slice(); chat.length = 0;
    chat.push({ role: 'assistant', text: 'a' }, { role: 'user', text: 'u1' }, { role: 'user', text: 'u2' });
    const m = chatMessages();
    ok(m[0].role === 'user', 'starts with user'); eq(m[0].content, 'u1\nu2', 'coalesced');
    chat.length = 0; keep.forEach(x => chat.push(x));
  });
  await T('notices never reach the model', () => {
    chat.push({ role: 'notice', text: 'a tool notice that must stay out' });
    ok(!chatMessages().some(m => m.content.includes('a tool notice that must stay out')), 'notice excluded');
    chat.pop();
  });
  await T('plain words without a key open setup instead of calling out', () => {
    delete agent.key; el('setup').hidden = true;
    type('something for lamb'); el('askGo').click();
    ok(!el('setup').hidden, 'setup opened');
    eq(ask.value, 'something for lamb', 'composer keeps the message');
    ok(chat[chat.length - 1].role === 'notice', 'a notice, not an answer');
  });
  await T('a notice looks like a notice', () => {
    const last = el('msgs').lastElementChild;
    ok(last.classList.contains('mn'), 'mn class');
    ok(!last.querySelector('.mcopy'), 'no copy control');
  });
  await T('a notice can be dismissed', () => {
    const before = chat.length, last = el('msgs').lastElementChild;
    ok(chat[before - 1].role === 'notice', 'a notice stands last');
    last.querySelector('.mx').click();
    ok(chat.length === before - 1 && !chat.some(m => m.role === 'notice'), 'entry gone');
    ok(!el('msgs').querySelector('.mn'), 'bubble gone');
    type('');
  });

  await T('errors saved before notices existed now read as notices', () => {
    const keep = chat.slice();
    localStorage.setItem('cc_chat', JSON.stringify([
      { role: 'user', text: 'hi' },
      { role: 'assistant', text: 'did not work (JSON Parse error) -- check the key and the connection' }]));
    const loaded = JSON.parse(localStorage.getItem('cc_chat'));
    const RE = /^(did not work \(|that did not go through \(|plain words need a key)/i;
    loaded.forEach(m => { if (m.role === 'assistant' && RE.test(m.text)) m.role = 'notice'; });
    eq(loaded[1].role, 'notice', 'legacy error migrates');
    localStorage.setItem('cc_chat', JSON.stringify(keep));
  });

  // -- setup --
  await T('gear shows its open state; changing company forgets the model', () => {
    const g = el('setupBtn'); el('setup').hidden = true; g.classList.remove('on');
    g.click(); ok(g.classList.contains('on') && !el('setup').hidden, 'open state');
    agent.model = 'm'; el('vendor').value = 'openai'; el('vendor').dispatchEvent(new Event('change'));
    ok(agent.vendor === 'openai' && !agent.model, 'model forgotten');
    g.click(); ok(!g.classList.contains('on'), 'closed state');
  });
  await T('hidden rows actually disappear despite flex display', () => {
    el('modelRow').hidden = true;
    ok(getComputedStyle(el('modelRow')).display === 'none');
  });

  // -- where the page is --
  await T('the page says nothing about itself, and withholds only what a preview cannot do', () => {
    ok(!el('copyBadge') && !el('dlApp'), 'no badge and no download: the page that works needs neither');
    ok(document.documentElement.dataset.build === BUILD && /^[0-9a-f]{8}$/.test(BUILD),
      'a loaded page can still be asked which build it is holding');
    // only a preview is barred from reaching Anthropic or OpenAI, so only it loses the key and the asking
    ok(el('setupBtn').hidden === VIEWER, 'the gear is withheld only from a preview');
    ok(el('askOn').hidden === VIEWER && el('askOff').hidden === !VIEWER,
      'the sommelier is switched off only in a preview');
  });
  await T('the transcript carries a grip', () => {
    ok(el('msgs').nextElementSibling.classList.contains('grip'), 'the transcript has a grip');
    ok(!chat.length || getComputedStyle(el('msgs').nextElementSibling).display !== 'none',
      'the grip shows only with the transcript');
  });
  await T('reset belongs to each panel, and no reset reaches into another', () => {
    ok(!el('resetApp'), 'no single reset stands for all three');
    ['resetMarks','resetChat','resetTaste'].forEach(id =>
      ok(el(id) && el(id).closest('.card'), id + ' sits inside the panel it resets'));
    ok(el('resetMarks').closest('.card').contains(el('out')), 'marks reset beside the wine list');
    ok(el('resetChat').closest('.card').contains(el('msgs')), 'chat reset beside the conversation');
    ok(el('resetTaste').closest('.card').contains(el('axes')), 'taste reset beside the ranges');
  });
  await T('resetting the chat keeps the marks, and resetting the marks keeps the chat', () => {
    const w = el('out').querySelector('.row').dataset.w;
    votes[w] = 'yes'; chat = [{ role: 'user', text: 'kept' }]; drawChat();
    el('resetChat').click();
    eq(chat.length, 0, 'the conversation is discarded');
    eq(votes[w], 'yes', 'and the mark it never owned is untouched');
    chat = [{ role: 'user', text: 'kept' }]; drawChat();
    el('resetMarks').click();                       // confirm is stubbed true for this run
    eq(Object.keys(votes).length, 0, 'the marks are erased');
    eq(chat.length, 1, 'and the conversation it never owned is untouched');
    chat = []; drawChat();
  });
  await T('resetting taste returns the ranges to the span of his own bottles', () => {
    setBands({ oak: [0.9, 1] });
    el('resetTaste').click();
    const want = kindSpread(KINDS[chosenKind]);
    A.forEach(a => { near(band[a][0], want[a][0], a + ' low'); near(band[a][1], want[a][1], a + ' high'); });
    eq(picked, [], 'and forgets any wine you were pointing at');
  });

  // -- pin --
  await T('clicking a wine pins its profile; escape releases it', () => {
    const row = el('out').querySelector('.row');
    row.click();
    ok(row.classList.contains('sel'), 'row highlighted');
    row.dispatchEvent(new MouseEvent('mouseleave'));
    ok(el('radarName').textContent !== '', 'profile stays after the pointer leaves');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    ok(!row.classList.contains('sel') && el('radarName').textContent === '', 'escape releases');
  });

  // -- cost meter --
  await T('prices match by longest prefix; unknown models degrade to tokens', () => {
    eq(price('claude-sonnet-5-20260203'), [3, 15]);
    eq(price('gpt-4o-mini-2024'), [0.15, 0.6], 'mini beats gpt-4o');
    ok(price('mystery-model') === null);
  });
  await T('the meter accumulates dollars and tokens', () => {
    const keep = { ...spend };
    Object.assign(spend, { usd: 0, tin: 0, tout: 0, unpriced: false });
    addSpend({ model: 'claude-sonnet-5', tin: 1000, tout: 100 });
    near(spend.usd, (1000 * 3 + 100 * 15) / 1e6);
    ok(el('spend').textContent.includes('in') && el('spend').textContent.includes('$'), 'meter shown');
    Object.assign(spend, keep); localStorage.setItem('cc_spend', JSON.stringify(spend)); drawSpend();
  });
  await T('every message offers copy', () => {
    type('!oak ..0.4'); el('askGo').click();
    const n = chat.filter(m => m.role !== 'notice').length;
    ok(el('msgs').querySelectorAll('.mcopy').length === n, 'one copy control per non-notice message');
  });

  // -- parity and rendering --
  await T('@ names render as references even in restored history', () => {
    const keep = { ...refs }; for (const k in refs) delete refs[k];
    const sp = parseSpell('like @' + S.wines[0].name + ' but younger');
    ok(sp.toks.some(t => t.c === 'tk-ref' && !t.c.includes('err')), 'catalog resolved');
    ok(sp.wines.length === 1, 'wine carried');
    Object.assign(refs, keep);
  });
  await T('chat bubbles carry no trailing blank line', () => {
    type('!oak ..0.5'); el('askGo').click();
    const part = el('msgs').lastElementChild.innerHTML.split('<button')[0];
    ok(!/\s$/.test(part), 'no whitespace before the copy control');
  });
  await T('act drives the surface: tabs, kinds, filters, pin', () => {
    applyAct({ tab: 'palate' }); ok(!el('s-palate').hidden, 'tab switched');
    applyAct({ tab: 'find' }); ok(!el('s-find').hidden);
    applyAct({ kind: 1 });
    A.forEach(a => eq(band[a], kindSpread(KINDS[1])[a], 'kind sets its own spread on ' + a));
    applyAct({ hideOwned: false }); ok(!el('ho').checked);
    applyAct({ hideOwned: true }); ok(el('ho').checked);
    applyAct({ pin: S.wines[0].name });
    ok(el('radarName').textContent.length > 0, 'pin shows profile');
    applyAct({ pin: null }); ok(el('radarName').textContent === '', 'pin released');
  });

  await T('what the agent moves wears a ring', () => {
    const axOak = el('bt-oak').closest('.ax');
    axOak.classList.remove('touched');
    flash(axOak);
    ok(axOak.classList.contains('touched'), 'ring applied');
  });
  await T('act.show brings a named part into view and rings it', () => {
    ['sigil','measures','shape','list','ask','kinds','filters','marks'].forEach(p => {
      ok(PART()[p], 'part exists: ' + p);
    });
    applyAct({ show: 'kinds' });
    ok(el('modeBtns').classList.contains('touched'), 'kinds ringed');
    applyAct({ show: 'nonexistent-part' }); // must not throw
  });

  await T('the agent is shown what the user sees', () => {
    const o = observeApp();
    ['Open section', 'The point stands at', 'Bands held', 'Wines considered',
     'Closest wines', 'Held on his radar', 'marked so far'].forEach(k =>
      ok(o.includes(k), 'observation reports: ' + k));
    ok(/Closest wines on his screen[^:]*: \S/.test(o), 'names real wines');
  });
  await T('every user action has an agent verb, except marks and Reset', () => {
    // naming wines he likes -- the chip path
    applyAct({ like: [S.wines[3].name] });
    ok(picked.length === 1, 'like sets the picked wine');
    A.forEach(a => near(point[a], Math.min(Math.max(S.wines[3][a], band[a][0]), band[a][1]), a));
    // writing his taste out -- the button path
    applyAct({ writeTaste: true });
    ok(/^!/.test(ask.value), 'writeTaste fills the composer');
    ask.value = ''; ask.dispatchEvent(new Event('input'));
    // every verb the agent has, and the two exclusions that must not appear
    const verbs = [...new Set(applyAct.toString().match(/act\.(\w+)/g).map(v => v.slice(4)))].sort();
    eq(verbs, ['heading','hideOwned','hideVoted','kind','like','pin','show','tab','writeTaste'],
      'the agent has exactly the user-facing verbs');
    ok(!verbs.includes('mark') && !verbs.includes('vote'), 'marks stay his');
    ['resetMarks','resetChat','resetTaste'].forEach(id =>
      ok(!applyAct.toString().includes(id), id + ' stays his'));
  });

  await T('each measure wears its own colour wherever it is named', () => {
    const named = [...document.querySelectorAll('.axname')].filter(n => n.style.color);
    ok(named.length >= 5, 'measures are tinted');
    // the colour is the page's, held per ground, so the name asks for it by measure
    [...document.querySelectorAll('#axes .axname')].forEach((n, i) => {
      eq(n.style.color, 'var(--ax-' + A[i] + ')', 'measure ' + A[i]);
      eq(rgb(getComputedStyle(n).color), token('--ax-' + A[i]), A[i] + ' resolves to its ground\'s colour');
    });
    const distinct = new Set(A.map(a => token('--ax-' + a)));
    eq(distinct.size, 5, 'five measures, five colours');
    ok(document.querySelector('#out .why span[style*="color"]'), 'the explanation tints its measure');
  });
  await T('the dashed shape is named for what it is', () => {
    const leg = document.querySelector('.rleg').textContent;
    ok(leg.includes('the wine you are looking for'), 'named plainly');
    ok(!/\bthe point\b/.test(document.body.innerText), 'no bare "the point" left in the interface');
  });

  await T('both chat boxes can be dragged taller, and the size is remembered', () => {
    eq(getComputedStyle(el('msgs')).resize, 'vertical', 'transcript resizes');
    eq(getComputedStyle(ask).resize, 'vertical', 'composer resizes');
    ask.style.height = '150px';
    ok(document.querySelector('.spellbox').getBoundingClientRect().height > 140, 'box grows with composer');
    ok(Math.abs(el('hl').getBoundingClientRect().height - ask.getBoundingClientRect().height) < 2,
      'the coloured overlay keeps pace');
    ask.style.height = '';
  });
  await T('the cost never steals width from the writing', () => {
    const keep = { ...spend };
    Object.assign(spend, { usd: 0.42, tin: 112800, tout: 19, unpriced: false }); drawSpend();
    const field = ask.getBoundingClientRect().width;
    const box = document.querySelector('.spellbox').getBoundingClientRect().width;
    ok(field > box * 0.9, 'the field keeps the box: ' + Math.round(field) + ' of ' + Math.round(box));
    const acts = document.querySelector('.askactions').getBoundingClientRect();
    ok(acts.bottom <= document.querySelector('.spellbox').getBoundingClientRect().bottom + 1, 'actions sit inside');
    Object.assign(spend, keep); drawSpend();
  });
  await T('send is an icon, not a word', () => {
    const b = el('askGo');
    ok(b.querySelector('svg'), 'icon present');
    eq(b.textContent.trim(), '', 'no text label');
    ok(b.getAttribute('aria-label') === 'Send' && /Send/.test(b.title), 'named for anyone who needs it');
  });

  await T('the shared-page notice reads as one paragraph', () => {
    const cs = getComputedStyle(el('askOff'));
    eq(cs.whiteSpace, 'normal', 'source line breaks are not preserved');
    ok(el('askOff').classList.contains('mn'), 'it wears the notice look');
  });
  await T('everything the app hides actually disappears', () => {
    const ids = ['askOn','askOff','setup','modelRow','mention','dlApp','setupBtn','keyClear',
                 's-find','s-palate','s-move','s-pop','s-how'];
    const broken = [];
    ids.forEach(id => {
      const n = el(id); if (!n) return;
      const was = n.hidden; n.hidden = true;
      if (getComputedStyle(n).display !== 'none') broken.push(id);
      n.hidden = was;
    });
    eq(broken, [], 'a display rule must never defeat the hidden attribute');
  });

  await T('translucent tints never depend on colour-mixing', () => {
    const css = document.getElementById('cc-css').textContent;
    ok(!css.includes('color-mix'), 'no colour-mix left: it mixes toward black in some engines');
    const band = document.querySelector('.band'), bg = getComputedStyle(band).backgroundColor;
    const [r, g, b] = bg.match(/[\d.]+/g).map(Number);
    ok(r + g + b > 120, 'the band tint is a light veil, not a dark one: ' + bg);
  });

  await T('no invented middlemen: who receives the words is named', () => {
    const text = document.body.innerText;
    ok(!/answering company|the company picked|company set up top right/i.test(text),
      'no undefined "company" stands in for a named business');
    el('askOff').hidden = false;
    const n = el('askOff').textContent;
    ok(/sommelier/.test(n), 'says what the feature IS before anything else');
    ok(!/\bAsk\b/.test(n), 'no invented panel name in the notice');
    eq(document.querySelector('.chathead h2').textContent, 'Sommelier', 'the panel is named for what it is');
    ok(/disabled/.test(n), 'says its state plainly');
    ok(el('askOff').querySelectorAll('li').length === 3, 'three numbered steps to enable');
    ok(/gear/.test(n) && /key/.test(n), 'the steps are complete: page, gear, key');
    const where = el('askOff').querySelector('li a');
    ok(where && /^https:\/\//.test(where.getAttribute('href')),
      'the first step goes somewhere real, not to a control this page does not have');
    ok(n.includes(where.textContent), 'and the reader can read where, not just click it');
    ok(/Anthropic/.test(n) && /OpenAI/.test(n), 'names who the words go to');
    el('askOff').hidden = true;
  });

  await T('each kind is drawn from its own wines, never a mean', () => {
    eq(KINDS.length, 4, 'four kinds');
    eq(KINDS.reduce((n, k) => n + k.wines.length, 0), S.wines.filter(w => OWNED.has(w.id)).length,
      'every owned wine belongs to exactly one kind');
    const card = document.querySelector('#modeBtns .kindcard');
    const outlines = card.querySelectorAll('polygon').length - 1; // less the rim
    eq(outlines, KINDS[0].wines.length, 'one outline per bottle, not one shape for the kind');
  });
  await T('pressing a kind asks within that kind, not around an average', () => {
    const k = KINDS[2];
    document.querySelectorAll('#modeBtns .btn')[2].click();
    A.forEach(a => eq(band[a], kindSpread(k)[a], 'the range is that type\'s own span on ' + a));
    A.forEach(a => near(point[a], (band[a][0] + band[a][1]) / 2, 'centre is the middle of that span on ' + a));
    const grand = C.centroid;
    ok(A.some(a => Math.abs(point[a] - grand[a]) > 0.05), 'and it is not the average of all four');
  });

  await T('the scaffolding stays behind the drawing', () => {
    const inner = [...el('radar').querySelectorAll('.rgi')];
    eq(inner.length, 3, 'three inner rings');
    inner.forEach(r => ok(parseFloat(r.getAttribute('stroke-width')) <= 0.5, 'hairline rings'));
    const rim = el('radar').querySelector('.rg');
    ok(parseFloat(rim.getAttribute('stroke-width')) > parseFloat(inner[0].getAttribute('stroke-width')),
      'the rim is the strongest of the scaffolding');
    const shape = el('radar').querySelector('.rpt');
    ok(parseFloat(shape.getAttribute('stroke-width')) > parseFloat(rim.getAttribute('stroke-width')),
      'and your shape is stronger than all of it');
  });

  await T('every corner states its own number, and the drawing matches it', () => {
    const d = el('radar').querySelector('.rpt').getAttribute('d');
    const outer = d.slice(1, d.indexOf('Z')).split('L').map(p => p.trim().split(',').map(Number));
    const labels = [...el('radar').querySelectorAll('text')];
    A.forEach((a, i) => {
      const drawn = Math.hypot(outer[i][0] - 125, outer[i][1] - 112) / 92;
      ok(Math.abs(drawn - band[a][1]) < 0.005, a + ' outer edge drawn at the top of its range');
      ok(labels[i].textContent.includes(point[a].toFixed(2)), a + ' corner prints its middle');
    });
  });

  await T('the chart paints only what is true: two shapes, no invented third', () => {
    radarWine(S.wines[0]);
    const shapes = [...el('radar').querySelectorAll('polygon,path')].map(p => p.getAttribute('class'));
    ok(!shapes.includes('rfit'), 'no fabricated overlap region');
    eq(shapes.filter(c => c === 'rpt' || c === 'rw').length, 2, 'your range and the wine, and nothing else');
    ok(!document.getElementById('cc-css').textContent.includes('--fit'), 'its colour is gone from the palette');
    radarWine(null);
  });

  await T('inside your taste is a colour, outside is not', () => {
    const css = document.getElementById('cc-css').textContent;
    const inside = getComputedStyle(el('radar').querySelector('.rpt'));
    const outside = getComputedStyle(el('radar').querySelector('.rout'));
    ok(inside.fill !== outside.fill, 'inside and outside are different colours');
    ok(/#radar \.rpt\{fill:var\(--me\)/.test(css), 'inside carries your colour');
    ok(/#radar \.rout\{fill:var\(--ink-3\)/.test(css), 'outside is neutral');
    radarWine(S.wines[0]);
    ok(/#radar \.rw\{fill:var\(--rise\)/.test(css), 'a wine lays over it, to try on');
    radarWine(null);
    // and a limit still wears its own measure's hue, never a global one
    A.forEach(a => eq(rgb(getComputedStyle(el('bt-' + a)).getPropertyValue('--c').trim()), rgb(token('--ax-' + a)),
      a + ' track carries its own hue'));
  });

  await T('reset returns every control but keeps the key and its setup', () => {
    agent.key = 'kept-key'; agent.vendor = 'anthropic';
    const biggest = KINDS.slice().sort((a, b) => b.wines.length - a.wines.length)[0];
    pickKind(biggest.i);                        // the precondition: the largest type is the one open
    el('resetChat').click(); el('resetTaste').click();
    ok(agent.key === 'kept-key', 'key survives reset');
    ok(chat.length === 0, 'chat cleared');
    const span = kindSpread(biggest);
    A.forEach(a => eq(band[a], span[a], 'opens on the largest type\'s own span, not an average'));
    A.forEach(a => eq(band[a], [0, 1], a));
    ok(ask.value === '', 'composer empty');
  });

  // -- reading --
  /* The page writes at 10-14px throughout. WCAG's 4.5:1 is written for text
     half again that size, so the colours are held to 5.5:1 and the rendered
     page is only ever allowed to fall to 4.5:1 where a tint lies over a card. */
  await T('every colour that carries a word clears the reading floor on its own ground', async () => {
    const was = document.documentElement.getAttribute('data-theme');
    try {
      for (const ground of ['light', 'dark']) {
        await wearTheme(ground);
        const worst = ['--ink', '--ink-2', '--ink-3'].concat(A.map(a => '--ax-' + a)).map(name => {
          const face = chan(getComputedStyle(document.documentElement).getPropertyValue(name).trim());
          // the darkest ground a word can land on: --ground in light, --raise in dark
          const deepest = ['--ground', '--panel', '--raise'].map(g =>
            chan(getComputedStyle(document.documentElement).getPropertyValue(g).trim()))
            .sort((x, y) => contrast(face, x) - contrast(face, y))[0];
          return { name, ratio: contrast(face, deepest) };
        }).sort((x, y) => x.ratio - y.ratio)[0];
        ok(worst.ratio >= 5.5, ground + ': ' + worst.name + ' reads at ' + worst.ratio.toFixed(2) + ':1');
      }
    } finally { await wearTheme(was); }
  });
  await T('nothing on any tab is rendered below 4.5:1', async () => {
    const was = document.documentElement.getAttribute('data-theme');
    const open = ['find','palate','move','pop','how'].find(t => !el('s-' + t).hidden);
    try {
      for (const ground of ['light', 'dark']) {
        await wearTheme(ground);
        for (const tab of ['find', 'palate', 'move', 'pop', 'how']) {
          el('t-' + tab).click();
          await new Promise(requestAnimationFrame);
          const dim = readings().filter(r => r.ratio < 4.5).sort((x, y) => x.ratio - y.ratio);
          ok(dim.length === 0, ground + '/' + tab + ': ' + dim.length + ' too dim, worst "' +
            (dim[0] || {}).words + '" at ' + ((dim[0] || {}).ratio || 0).toFixed(2) + ':1');
        }
      }
    } finally { el('t-' + open).click(); await wearTheme(was); }
  });
  await T('a card and its edge stay apart, and the chart grid stays visible', async () => {
    const was = document.documentElement.getAttribute('data-theme');
    try {
      for (const ground of ['light', 'dark']) {
        await wearTheme(ground);
        const panel = chan(getComputedStyle(document.documentElement).getPropertyValue('--panel').trim());
        for (const line of ['--rule', '--grid', '--track']) {
          const c = contrast(chan(getComputedStyle(document.documentElement).getPropertyValue(line).trim()), panel);
          ok(c >= 1.4, ground + ': ' + line + ' sits at ' + c.toFixed(2) + ':1 against the card');
        }
      }
    } finally { await wearTheme(was); }
  });
  await T('a filled accent is written on in something the accent can be read under', async () => {
    const was = document.documentElement.getAttribute('data-theme');
    try {
      for (const ground of ['light', 'dark']) {
        await wearTheme(ground);
        const on = chan(getComputedStyle(document.documentElement).getPropertyValue('--on-accent').trim());
        for (const fill of ['--mark', '--good', '--bad']) {
          const c = contrast(on, chan(getComputedStyle(document.documentElement).getPropertyValue(fill).trim()));
          ok(c >= 4.5, ground + ': text on ' + fill + ' reads at ' + c.toFixed(2) + ':1');
        }
      }
    } finally { await wearTheme(was); }
  });

  // -- vocabulary --
  await T('research words stay out of the reader\'s page', () => {
    const text = document.body.innerText.toLowerCase();
    for (const word of ['sigil', 'invariant'])
      ok(!text.includes(word), word + ' is our word, not the reader\'s');
  });
  await T('banned words absent from everything the user can read', () => {
    const text = document.body.innerText.toLowerCase();
    for (const bad of ['dark fruit', 'heaviness', 'readiness', 'percentile', 'shipment'])
      ok(!text.includes(bad), bad);
  });

  // restore
  window.confirm = realConfirm;
  for (const [k, v] of [['cc_votes', snap.v], ['cc_agent', snap.a], ['cc_chat', snap.c], ['cc_spend', snap.s]])
    v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v);
  const fails = R.filter(r => r.startsWith('FAIL')).length;
  return R.join('\n') + `\n\n${R.length - fails}/${R.length} passed` + (fails ? ` -- ${fails} FAILED` : '');
})()
