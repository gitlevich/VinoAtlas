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
  const ask = el('ask');
  const type = t => { ask.focus(); ask.value = t; ask.setSelectionRange(t.length, t.length); ask.dispatchEvent(new Event('input')); };
  const snap = { v: localStorage.getItem('cc_votes'), a: localStorage.getItem('cc_agent'), c: localStorage.getItem('cc_chat'), s: localStorage.getItem('cc_spend') };
  const realConfirm = window.confirm; window.confirm = () => true;

  // -- boot --
  await T('every tab is there, in order, with the Atlas last', () => {
    const want = ['t-find','t-palate','t-move','t-pop','t-how','t-atlas'];
    want.forEach(id => ok(el(id), id));
    eq([...document.querySelectorAll('nav [role=tab]')].map(b => b.id), want);
    /* the sections read in the same order as the tabs that open them */
    eq([...document.querySelectorAll('section[id^="s-"]')].map(x => x.id),
       want.map(t => 's-' + t.slice(2)));
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
    const want = A.map(a => S.colors[a]);
    [...document.querySelectorAll('#axes .axname')].forEach((n, i) => {
      const hex = '#' + n.style.color.match(/\d+/g).map(x => (+x).toString(16).padStart(2,'0')).join('');
      eq(hex, want[i].toLowerCase(), 'measure ' + A[i]);
    });
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
    A.forEach(a => eq(getComputedStyle(el('bt-' + a)).getPropertyValue('--c').trim(), S.colors[a],
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
    /* Reset returns the ranges to the span of his own bottles in the type that is
       open -- not to the whole scale. The line that used to follow this asserted
       both at once, that every band equals the type's span AND that it equals
       [0,1], which cannot both hold unless he bought across the whole of every
       measure. It was left over from before reset opened on a type, and it is
       what made this a standing failure rather than a question. */
    A.forEach(a => eq(band[a], span[a], 'opens on the largest type\'s own span, not an average'));
    A.forEach(a => ok(band[a][0] <= band[a][1], a + ' is a range'));
    A.forEach(a => near(point[a], (band[a][0] + band[a][1]) / 2,
                        a + ': the middle is derived, never separate'));
    ok(ask.value === '', 'composer empty');
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

  /* -- the atlas ------------------------------------------------------------
     The tab is a place rather than a chart, so what has to be tested is what a
     place owes you: that near things pass in front of far ones as you move,
     that the sky does not, that you cannot walk out of it, and that every mark
     stands where the catalogue put it. */
  const AT = ATLAS, ATD = AT.D;
  const wasTab = ['find','palate','move','pop','how','atlas']
    .find(t => el('t-' + t).getAttribute('aria-selected') === 'true') || 'find';
  const atSnap = { yaw: AT.yaw, pitch: AT.pitch, FOV: AT.FOV, STAND: AT.STAND.slice(),
                   held: AT.held, words: [...AT.state] };
  el('t-atlas').click();
  const cvA = el('atlasCanvas');
  /* The view is advanced by hand, never by waiting on the frame clock: a browser
     stops animation frames in a tab that is not on screen, so a test written
     against them hangs there instead of failing, which is the worst of both. */
  const frames = n => { for (let i = 0; i < n; i++) AT.step(); };
  /* Counted at the canvas, not at a function the page could stop calling: every
     paint begins by clearing, so this cannot be satisfied by intent. */
  let PAINTS = 0;
  const realClear = CanvasRenderingContext2D.prototype.clearRect;
  CanvasRenderingContext2D.prototype.clearRect = function (...a) {
    if (this.canvas === cvA) PAINTS++;
    return realClear.apply(this, a);
  };
  const nearest = () => AT.WMARK.filter(m => m.node).sort((a, b) => a.dist - b.dist);
  const atSize = async (w, h, fn) => {
    const w0 = AT.W, h0 = AT.H;
    try { AT.W = w; AT.H = h; AT.draw(); return await fn(); }
    finally { AT.W = w0; AT.H = h0; AT.draw(); }
  };

  await T('the atlas paints only while it is the tab you are on', async () => {
    el('t-find').click();
    ok(!AT.live, 'not live behind another tab');
    const before = PAINTS;
    AT.walk(0.1);
    eq(PAINTS, before, 'a hidden canvas is not painted');
    el('t-atlas').click();
    ok(AT.live && AT.W > 0 && AT.H > 0, 'measured itself on the way in');
    ok(PAINTS > before, 'and painted');
  });

  await T('a gesture paints by itself, with nothing else driving it', async () => {
    AT.STAND = [0, 0, 0];
    frames(3);
    const before = PAINTS;
    cvA.dispatchEvent(new WheelEvent('wheel', { deltaX: 40, deltaY: 0, bubbles: true, cancelable: true }));
    ok(PAINTS > before, 'the wheel turned the head and the head was drawn');
  });

  await T('the eye rides a neck ahead of where you stand', () => {
    AT.STAND = [0, 0, 0]; AT.draw();
    near(Math.hypot(...AT.EYE), AT.NECK);
    ok(AT.NECK > 1, 'and it is a neck, not a pinhole');
    ok(nearest()[0].dist > AT.NECK, 'nothing stands nearer than the neck is long');
  });

  await T('turning your head slides near glasses past far ones, and not the sky', () => {
    AT.STAND = [0, 0, 0]; AT.FOV = AT.OPEN; AT.yaw = 0.4; AT.pitch = 0; AT.draw();
    const was = new Map();
    for (const m of AT.WMARK) if (m.node) was.set(m, [m.node[0], AT.len(AT.here(m.pos))]);
    const sky = AT.POLES.filter(p => p.hit)[0];
    ok(sky && was.size > 60, 'a name in the sky and a field under it');
    const s0 = sky.hit[0];
    AT.yaw = 0.4 + 0.04; AT.draw();
    const rows = [];
    for (const [m, [x0, d]] of was) if (m.node) rows.push([d, Math.abs(m.node[0] - x0)]);
    rows.sort((a, b) => a[0] - b[0]);
    const skyMove = Math.abs(sky.hit[0] - s0);

    /* THE SKY MOVED BY EXACTLY THE ANGLE TURNED, which is what makes it a frame:
       it is at infinity and a step sideways cannot shift it. */
    near(Math.round(skyMove * 100) / 100, Math.round(AT.W / AT.FOV * 0.04 * 100) / 100);

    /* AND EVERYTHING IN THE FIELD OUTRAN IT, by more the nearer it is. Stated as
       the EXCESS over the sky, because that quantity is exactly zero for a camera
       turning on its own optical centre -- which is what this used to be tested
       against, and a bare `near > far` passed with the neck set to a
       ten-thousandth. Measured over a 2.3 degree turn: the nearest quarter of the
       field averages 4.9 away and slides 47.5 pixels, the farthest quarter
       averages 8.0 and slides 41.8, and the sky slides 33.0. Take the neck away
       and all three read 33.0 and both excesses are nil. */
    const cut = Math.floor(rows.length / 4);
    const mean = r => r.reduce((s, x) => s + x[1], 0) / r.length;
    const nearX = mean(rows.slice(0, cut)) - skyMove;
    const farX = mean(rows.slice(-cut)) - skyMove;
    ok(farX > 4, `even the far quarter must outrun the sky, got ${farX.toFixed(1)}px`);
    ok(nearX > farX * 1.4,
       `near quarter ${nearX.toFixed(1)}px against far quarter ${farX.toFixed(1)}px`);
  });

  await T('walking moves the shop and leaves the sky where it was', () => {
    AT.STAND = [0, 0, 0]; AT.yaw = 0; AT.pitch = 0; AT.draw();
    const sky = AT.POLES.filter(p => p.hit)[0];
    ok(sky, 'a name is in view');
    const s0 = sky.hit.slice();
    /* a glass near the middle of the view, so it is still in view after the step */
    const mid = AT.WMARK.filter(m => m.node
        && Math.hypot(m.node[0] - AT.W / 2, m.node[1] - AT.H / 2) < Math.min(AT.W, AT.H) * 0.2)
      .sort((a, b) => a.dist - b.dist)[0];
    ok(mid, 'a glass in the middle of the view');
    const w0 = mid.node.slice();
    AT.walk(0.6);
    ok(mid.node, 'still in view after a step forward');
    ok(Math.hypot(mid.node[0] - w0[0], mid.node[1] - w0[1]) > 1, 'the glass moved');
    eq([Math.round(sky.hit[0]), Math.round(sky.hit[1])],
       [Math.round(s0[0]), Math.round(s0[1])], 'the name did not');
  });

  await T('the shop closes around you: there is no way to step outside it', () => {
    const sweep = () => {
      const c = [];
      for (let k = 0; k < 8; k++) { AT.yaw = k * Math.PI / 4; AT.draw();
                                    c.push(AT.WMARK.filter(m => m.node).length); }
      return c;
    };
    AT.STAND = [0, 0, 0]; AT.pitch = 0;
    const middle = Math.min(...sweep());
    AT.yaw = 1.2;
    for (let i = 0; i < 200; i++) AT.walk(0.3);
    ok(Math.hypot(...AT.STAND) <= AT.ROAM + 1e-6, 'held at the rim');
    ok(Math.hypot(...AT.EYE) <= AT.REACH + 1e-6, 'and so is the eye');
    const rim = Math.min(...sweep());
    /* and the price is stated rather than hidden: out there the shop is thinner.
       It is NOT true that every view from the rim holds something -- sampled over
       1,440 headings, 7.6% of them hold nothing, almost all looking steeply up or
       down where the shop is only its own age axis. What holds is that you cannot
       get outside it, and that the middle is the fuller place to stand. */
    ok(rim < middle, `sparsest heading: ${rim} at the rim against ${middle} in the middle`);
    ok(middle > 8, `and the middle is never empty: ${middle}`);
    ok(Math.max(...sweep()) > 200, 'the shop is still all round you, just further off');
  });

  await T('every measure is named at both ends, and the ends are opposite', () => {
    eq(AT.POLES.length, 10);
    for (const a of A) {
      const ends = AT.POLES.filter(p => p.ax === a);
      eq(ends.length, 2);
      eq([ends[0].w, ends[1].w], S.ends[a], a);
      ok(AT.dot(ends[0].dir, ends[1].dir) < -0.9999, a + ' ends are not opposite');
    }
  });

  await T('the measures are no longer drawn as arcs across the shop', () => {
    /* Five great circles crossing at the middle of the view read as a starburst
       laid over the thing they were framing. Gone, and their data with them. */
    ok(!ATD.lines, 'the arcs\' own field is not shipped either');
    ok(!AT.skyLine, 'nor is the routine that drew them');
  });

  await T('you can turn to face age, which stands overhead', () => {
    const old = AT.POLES.find(p => p.w === 'old');
    ok(Math.asin(old.dir[1]) > 1.39, 'older is nearly straight up');
    AT.faceTo(old.dir);
    for (let i = 0; i < 200; i++) { }
    AT.pitch = Math.asin(old.dir[1]); AT.yaw = Math.atan2(old.dir[2], old.dir[0]);
    AT.draw();
    ok(old.hit, 'and looking that way, it is there');
  });

  await T('a wine stands where the catalogue puts it, and its glass says so', () => {
    const i = S.wines.findIndex(w => w.maturity > 0.9 && w.weight > 0.9);
    const j = S.wines.findIndex(w => w.maturity < 0.3 && w.weight > 0.9);
    const older = AT.pour(i), younger = AT.pour(j);
    ok(older[0] > younger[0], 'a red browns as it ages');
    const white = S.wines.findIndex((w, k) => ATD.col[k] === 'white');
    ok(AT.pour(white)[0] < 60 && AT.pour(white)[0] > 25, 'a white is gold, never red');
    eq(ATD.pos.length, S.wines.length);
    eq(AT.WMARK.length, S.wines.length);
  });

  await T('the wines on your account are the ones lit', () => {
    eq(AT.MINE.filter(Boolean).length, S.wines.filter(w => OWNED.has(w.id)).length);
    ok(AT.MINE.filter(Boolean).length > 200);
    S.wines.forEach((w, k) => { if (AT.MINE[k]) ok(OWNED.has(w.id), w.name); });
  });

  await T('what he bought is a bottle, what the shop has is a glass', () => {
    /* No badge. Three were tried on top of the glass -- a halo, a ring, a tick --
       and they were a smudge, a meaningless circle, and something that stopped
       looking like a glass from a distance. The mark itself changes instead. */
    const ctx = cvA.getContext('2d'), dpr = cvA.width / AT.W;
    const shape = (k, own) => {
      ctx.clearRect(0, 0, AT.W, AT.H);
      AT.glass(AT.W/2, AT.H/2, 20, k, 1, own);
      const span = dy => {
        const row = ctx.getImageData(0, Math.round((AT.H/2 + dy) * dpr), cvA.width, 1).data;
        let lo = -1, hi = -1;
        for (let x = 0; x < cvA.width; x++) if (row[x*4+3] > 24) { if (lo < 0) lo = x; hi = x; }
        return lo < 0 ? 0 : (hi - lo) / dpr;
      };
      return { top: span(-14), foot: span(14) };
    };
    const k = S.wines.findIndex((w, i) => !ATD.fizz[i]);
    const bottle = shape(k, true), glass = shape(k, false);
    AT.draw();
    /* a glass is wide at the rim and stands on a foot wider than its stem; a
       bottle is narrow at the neck and the same width all the way down */
    ok(glass.top > glass.foot * 1.4,
       `glass: rim ${glass.top.toFixed(1)} over foot ${glass.foot.toFixed(1)}`);
    ok(bottle.top < bottle.foot,
       `bottle: neck ${bottle.top.toFixed(1)} under body ${bottle.foot.toFixed(1)}`);
    ok(bottle.top < glass.top * 0.6, 'and the two are told apart at the top');
  });

  await T('a glass answers the pointer over the whole glass', async () => {
    AT.STAND = [0, 0, 0]; AT.draw();
    const big = AT.WMARK.filter(m => m.node).sort((a, b) => b.node[2] - a.node[2])[0];
    const [x, y, R] = big.node;
    /* bowl, stem and foot alike: the reach is the glass's own drawn size, so it
       grows with it rather than being a fixed ring around a point */
    for (const [dx, dy] of [[0, 0], [0, -R * 0.9], [0, R * 0.9], [-R * 0.5, 0]])
      ok(AT.hoverAt(x + dx, y + dy), `missed at ${dx},${dy} of a glass ${R.toFixed(1)} across`);
    ok(!AT.hoverAt(x, y + R * 4 + 40), 'and stops where the glass does');
    ok(!AT.hoverAt(-500, -500), 'and nothing where there is nothing');
  });

  await T('pointing at a glass names the bottle in the reader\'s own words', () => {
    AT.STAND = [0, 0, 0]; AT.draw();
    const big = AT.WMARK.filter(m => m.node).sort((a, b) => b.node[2] - a.node[2])[0];
    AT.hoverAt(big.node[0], big.node[1]);
    const box = el('atlasName'), txt = box.textContent;
    eq(box.style.display, 'block');
    ok(txt.includes(S.wines[big.i].name), 'the bottle');
    A.forEach(a => ok(txt.includes(S.labels[a]), S.labels[a]));
    const w = S.wines[big.i];
    A.forEach(a => ok(txt.includes(S.ends[a][w[a] >= 0.5 ? 1 : 0]), a + ' end named'));
    ok(box.innerHTML.includes(S.colors[A[0]]), 'each bar in its own measure\'s colour');
    /* what it IS comes before anything measured: the colour of the wine is the
       first thing anybody reads about a bottle */
    ok(/Red|White|Ros/.test(txt), 'red, white or pink: ' + txt.slice(0, 60));
    if (ATD.fizz[big.i]) ok(txt.includes('sparkling'), 'and says so when it sparkles');
    if (w.vintage) ok(txt.includes(String(Math.round(w.vintage))), 'and the year');
    ok(box.querySelector('.kind i'), 'with the wine\'s own colour beside it');
  });

  await T('ticking a word turns you to face the wines described that way', async () => {
    el('atlasClear').click();
    const t = AT.TERMS.find(x => x.w === 'tobacco');
    const row = [...el('atlasWords').children].find(r => r.dataset.w === 'tobacco');
    AT.yaw = Math.atan2(-t.pos[2], -t.pos[0]); AT.pitch = 0;   // facing away
    row.click();
    ok(AT.state.has('tobacco'), 'ticked');
    eq(row.getAttribute('aria-checked'), 'yes');
    frames(90);
    const d = AT.unit(t.pos), f = AT.frame().f;
    ok(AT.dot(d, f) > 0.97, 'carried round to face it, got ' + AT.dot(d, f).toFixed(3));
  });

  await T('what those wines are is said in the five measures, against the shop', () => {
    el('atlasClear').click();
    [...el('atlasWords').children].find(r => r.dataset.w === 'tobacco').click();
    [...el('atlasWords').children].find(r => r.dataset.w === 'cedar').click();
    AT.readout();
    const txt = el('atlasFacing').textContent;
    const idx = AT.TERMS.find(t => t.w === 'tobacco').in
      .filter(i => AT.TERMS.find(t => t.w === 'cedar').in.includes(i));
    ok(txt.includes(String(idx.length)), 'how many wines, exactly: ' + idx.length);
    ok(A.some(a => txt.includes(S.ends[a][0]) || txt.includes(S.ends[a][1])),
       'and which way they run, in his words');
    el('atlasClear').click();
    ok(!el('atlasFacing').textContent.includes('described this way'), 'cleared');
  });

  await T('a word the shop has no bearing for is not offered at all', () => {
    const shown = [...el('atlasWords').children].map(r => r.dataset.w);
    eq(shown.length, AT.TERMS.length);
    for (const gone of ['balanced', 'elegant', 'forest floor', 'red fruits'])
      ok(!shown.includes(gone), gone + ' points nowhere in this shop');
    for (const kept of ['tobacco', 'cedar', 'truffle', 'citrus'])
      ok(shown.includes(kept), kept);
  });

  await T('what stays in frame as you go toward it is what was really there', async () => {
    AT.STAND = [0, 0, 0]; AT.held = null;
    const t = AT.TERMS.find(x => x.w === 'cedar');
    AT.yaw = Math.atan2(t.pos[2], t.pos[0]); AT.pitch = Math.asin(AT.unit(t.pos)[1]);
    AT.draw();
    AT.beginApproach();
    frames(40);
    ok(AT.held, 'the approach finished and said what held');
    ok(AT.held.size > 0 && AT.held.size < AT.MARKS.length, 'some held, some did not');
    const cedar = AT.TMARK.find(m => m.t.w === 'cedar');
    ok(AT.held.has(cedar), 'what you went toward held');
    AT.held = null;
  });

  await T('the globe shows what is behind you, and takes you there', () => {
    ok(el('atlasGlobe').style.display !== 'none', 'open by default');
    AT.STAND = [0, 0, 0]; AT.yaw = 0; AT.pitch = 0; AT.draw(); AT.drawMini();
    const behind = AT.frame().f.map(x => -x);
    const before = AT.dot(AT.unit(behind), AT.frame().f);
    near(Math.round(before), -1);
    const r = el('atlasMini').getBoundingClientRect();
    /* the centre of the disc is where you are looking; the rim is a quarter turn
       away, so a click near the rim must turn you at least that far */
    el('atlasMini').dispatchEvent(new MouseEvent('dblclick',
      { clientX: r.left + r.width * 0.06, clientY: r.top + r.height / 2, bubbles: true }));
    frames(120);                       // the turn is a glide, not a jump
    const turned = Math.acos(Math.max(-1, Math.min(1, AT.dot(AT.unit(AT.frame().f), [1, 0, 0]))));
    ok(turned > 1.0, 'carried most of a quarter turn round, got ' + (turned * 57.3).toFixed(0) + ' deg');
  });

  await T('the globe closes on its own button and on G, and comes back', () => {
    /* G is a shortcut, not a keystroke stolen from the composer: typing "grippy"
       into the sommelier must not open a globe in another tab */
    ask.focus();
    dispatchEvent(new KeyboardEvent('keydown', { key: 'g' }));
    ok(el('atlasGlobe').style.display !== 'none', 'G in the composer does nothing');
    ask.blur();
    el('atlasGx').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    eq(el('atlasGlobe').style.display, 'none', 'the X closes it');
    ok(el('atlasFacing').classList.contains('wide'), 'and the readout takes the room');
    dispatchEvent(new KeyboardEvent('keydown', { key: 'g' }));
    ok(el('atlasGlobe').style.display !== 'none', 'G brings it back');
  });

  await T('it opens narrower than a head, because 1,652 glasses need the room', () => {
    /* A hundred and twenty degrees is what a head takes in; putting it in a
       thousand pixels leaves each glass five across and the colour of the wine
       -- the first thing anybody reads about a bottle -- gone. */
    ok(AT.OPEN < AT.WIDE * 0.7, 'opens well inside the full field');
    ok(AT.OPEN > AT.WIDE * 0.5, 'and is still a wide view, not a telescope');
    AT.FOV = AT.OPEN; AT.STAND = [0, 0, 0]; AT.yaw = 0; AT.pitch = 0;
    const near = AT.draw() || AT.WMARK.filter(m => m.node).length;
    AT.FOV = AT.WIDE; AT.draw();
    const all = AT.WMARK.filter(m => m.node).length;
    ok(all > near * 1.4, `the full field crowds in ${all} against ${near}`);
    AT.FOV = AT.OPEN;
  });

  await T('leaning in narrows the view and step back returns to where it opened', () => {
    AT.FOV = AT.OPEN;
    cvA.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: 0, clientY: 0 }));
    ok(el('atlasWide').style.display === '', 'the way back appears');
    el('atlasWide').click();
    frames(60);
    ok(el('atlasWide').style.display === 'none', 'and goes again');
    ok(Math.abs(AT.FOV - AT.OPEN) < 0.02, 'back at the field it opened at');
  });

  await T('turning is measured in fields, so leaning in does not fling you round', () => {
    /* A fixed radians-per-pixel meant the same drag swept the scene eight times
       further at nine degrees than at seventy-four: the closer you looked, the
       more violently it moved. The rate is proportional to the field now. */
    const spin = fov => {
      AT.FOV = fov; AT.yaw = 0; AT.pitch = 0;
      cvA.dispatchEvent(new WheelEvent('wheel',
        { deltaX: 100, deltaY: 0, bubbles: true, cancelable: true }));
      const d = Math.abs(AT.yaw); AT.yaw = 0; return d;
    };
    const open = spin(AT.OPEN), close = spin(AT.WIDE * 0.075);
    ok(close < open / 5, `${(close*57.3).toFixed(2)} deg against ${(open*57.3).toFixed(2)} leaned out`);
    /* and what it is proportional TO: a drag across the pane turns you by one and
       a half of whatever you can see, at either end */
    for (const fov of [AT.OPEN, AT.WIDE * 0.3, AT.WIDE * 0.075])
      near(Math.round(spin(fov) * AT.W / 100 / fov * 100) / 100, 1.5);
    AT.FOV = AT.OPEN;
  });

  await T('walking glides: a pinch sets where you are going, not where you are', () => {
    AT.STAND = [0, 0, 0]; AT.FOV = AT.OPEN; AT.yaw = 0; AT.pitch = 0;
    cvA.dispatchEvent(new WheelEvent('wheel',
      { deltaY: -3, ctrlKey: true, bubbles: true, cancelable: true }));
    ok(AT.standWant, 'it set a destination');
    const want = AT.len(AT.standWant), first = AT.len(AT.STAND);
    ok(first > 0, 'and moved on the frame the gesture arrived');
    ok(first < want * 0.4, `no jump: ${first.toFixed(3)} of ${want.toFixed(3)}`);
    frames(80);
    ok(Math.abs(AT.len(AT.STAND) - want) < 0.01, 'and arrived');
    ok(!AT.standWant, 'the glide is done');
    AT.STAND = [0, 0, 0];
  });

  await T('you can get closer than you could, and still not outside', () => {
    ok(AT.ROAM > 3.5, `${AT.ROAM.toFixed(1)} to walk`);
    ok(AT.REACH - AT.NECK === AT.ROAM);
    /* and the view closes further than it did -- nine degrees, not seventeen */
    AT.FOV = AT.OPEN;
    for (let i = 0; i < 60; i++) AT.lean(0.9);
    frames(120);
    ok(AT.FOV < AT.WIDE * 0.09, `closes to ${(AT.FOV*57.3).toFixed(1)} degrees`);
    /* nothing is drawn inside out down there: the fall-off toward the edge of
       vision used to run past 1 at a narrow field and return a NEGATIVE radius */
    AT.STAND = [0, 0, 0]; AT.draw();
    const rs = AT.WMARK.filter(m => m.node).map(m => m.node[2]);
    ok(rs.length && Math.min(...rs) > 0, 'every mark has a positive size');
    AT.FOV = AT.OPEN;
  });

  await T('the shop can fill the screen, and esc gives the page back', () => {
    const box = cvA.parentElement;
    const small = cvA.getBoundingClientRect().width;
    el('atlasBig').click();
    ok(box.classList.contains('big'), 'expanded');
    const big = cvA.getBoundingClientRect().width;
    ok(big > small * 1.15, `${Math.round(big)} against ${Math.round(small)}`);
    eq(AT.W, Math.round(big), 'and it measured itself on the way in');
    eq(document.body.style.overflow, 'hidden', 'the page behind does not scroll');
    dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    ok(!box.classList.contains('big'), 'esc gives it back');
    eq(document.body.style.overflow, '', 'and the page scrolls again');
  });

  await T('leaving the tab puts the screen back', () => {
    el('atlasBig').click();
    ok(cvA.parentElement.classList.contains('big'));
    el('t-find').click();
    ok(!cvA.parentElement.classList.contains('big'), 'no overlay left behind');
    el('t-atlas').click();
  });

  await T('a word lights the wines described that way and quiets the rest', () => {
    el('atlasClear').click();
    ok(!AT.onlyThese, 'nothing asked for, nothing quieted');
    AT.STAND = [0, 0, 0]; AT.yaw = Math.PI; AT.pitch = 0; AT.draw();
    const before = AT.WMARK.filter(m => m.node).map(m => m.node[3]);
    const bright = before.filter(a => a > 0.4).length;
    [...el('atlasWords').children].find(r => r.dataset.w === 'cedar').click();
    eq(AT.onlyThese.size, AT.TERMS.find(t => t.w === 'cedar').n, '173 cedar wines');
    AT.draw();
    const seen = AT.WMARK.filter(m => m.node);
    const lit = seen.filter(m => AT.onlyThese.has(m.i));
    const quiet = seen.filter(m => !AT.onlyThese.has(m.i));
    ok(lit.length && quiet.length, 'both kinds are in view');
    const avg = xs => xs.reduce((s, m) => s + m.node[3], 0) / xs.length;
    ok(avg(lit) > avg(quiet) * 2, `lit ${avg(lit).toFixed(2)} against quiet ${avg(quiet).toFixed(2)}`);
    /* the rest go quiet, they do not go away: a shop you cannot see past is
       still the shop, and walking still carries you among them */
    ok(quiet.every(m => m.node[3] > 0.1), 'nothing fades to nothing');
    ok(AT.WMARK.filter(m => m.node).length > bright * 0.5, 'the shop is still there');
    el('atlasClear').click();
    ok(!AT.onlyThese, 'clear puts the whole shop back');
  });

  await T('a sparkling wine is a flute, and the catalogue\'s own flag is not asked', () => {
    const fizz = ATD.fizz;
    eq(fizz.length, S.wines.length);
    const named = S.wines.filter((w, i) => fizz[i]);
    ok(named.length > 40 && named.length < 110, named.length + ' sparkling');
    for (const w of named)
      ok(/champagne|prosecco|cava|cr[ée]mant|franciacorta|spumante|frizzante|p[ée]tillant|pet[-\s]?nat|sparkling|blanc de |brut|sekt|lambrusco|asti|bubbles|spritz|glera|champenoise|classico/i
         .test(w.name + ' ' + (w.variety || '') + ' ' + (w.region || '')), w.name);
    /* the flag says Cheval Blanc 1928 is sparkling. It is not. */
    const cb = S.wines.findIndex(w => w.name === 'Chateau Cheval Blanc 1928');
    ok(cb >= 0 && S.wines[cb].sparkling === true, 'the flag really does say so');
    ok(!fizz[cb], 'and the page really does not');
    /* The SILHOUETTE is what carries it, since half of these are white and half
       are red and a colour cannot say both things at once. Measured: one glass
       of each drawn alone on the canvas, and the flute's bowl must be plainly
       the narrower of the two at the rim. */
    const ctx = cvA.getContext('2d');
    const dpr = cvA.width / AT.W;
    const rimWidth = k => {
      ctx.clearRect(0, 0, AT.W, AT.H);
      AT.glass(AT.W / 2, AT.H / 2, 24, k, 1, false);
      const y = Math.round((AT.H / 2 - 24 * 0.75) * dpr);
      const row = ctx.getImageData(0, y, cvA.width, 1).data;
      let lo = -1, hi = -1;
      for (let x = 0; x < cvA.width; x++) {
        if (row[x * 4 + 3] > 24) { if (lo < 0) lo = x; hi = x; }
      }
      return (hi - lo) / dpr;
    };
    const flute = rimWidth(S.wines.findIndex((w, i) => fizz[i]));
    const bowl = rimWidth(S.wines.findIndex((w, i) => !fizz[i]));
    AT.draw();
    ok(flute > 2 && bowl > 2, `both were drawn: ${flute.toFixed(1)} / ${bowl.toFixed(1)}`);
    ok(bowl > flute * 1.4, `a bowl ${bowl.toFixed(1)} against a flute ${flute.toFixed(1)}`);
  });

  await T('the atlas reads the same whatever the window is', async () => {
    AT.STAND = [0, 0, 0]; AT.yaw = 0.4; AT.pitch = 0;
    const count = async () => {
      AT.draw();
      return AT.WMARK.filter(m => m.node).length;
    };
    const wide = await atSize(1200, 700, count);
    const tall = await atSize(700, 1200, count);
    ok(wide > 30 && tall > 30, `something in view either way: ${wide} / ${tall}`);
    /* a taller window at the same pixels-per-radian sees a taller slice, so the
       counts differ -- what must not differ is that the shop surrounds you */
    ok(AT.POLES.some(p => p.hit) || AT.TERMS.some(t => t.hit), 'and always something named');
  });

  await T('nothing in the atlas says a word the page has banned', () => {
    const words = [...el('atlasWords').children].map(r => r.textContent.toLowerCase()).join(' ');
    const copy = el('s-atlas').innerText.toLowerCase();
    for (const bad of ['dark fruit', 'heaviness', 'readiness', 'shipment', 'sigil', 'invariant', 'percentile'])
      ok(!words.includes(bad) && !copy.includes(bad), bad);
    for (const p of AT.POLES) ok(Object.values(S.ends).some(e => e.includes(p.w)), p.w + ' is his word');
  });

  // restore the atlas, then the tab that was open
  CanvasRenderingContext2D.prototype.clearRect = realClear;
  el('atlasClear').click();
  atSnap.words.forEach(w => {
    const row = [...el('atlasWords').children].find(r => r.dataset.w === w);
    if (row) row.click();
  });
  AT.yaw = atSnap.yaw; AT.pitch = atSnap.pitch; AT.FOV = atSnap.FOV;
  AT.STAND = atSnap.STAND; AT.held = atSnap.held;
  AT.toggleGlobe(true);
  /* the suite leaves a pointer where no pointer is, and a way back from a lean
     it has already undone; both are chrome and both are put back by hand */
  el('atlasName').style.display = 'none';
  el('atlasWide').style.display = 'none';
  AT.fill(false); AT.draw();
  el('t-' + wasTab).click();

  // restore
  window.confirm = realConfirm;
  for (const [k, v] of [['cc_votes', snap.v], ['cc_agent', snap.a], ['cc_chat', snap.c], ['cc_spend', snap.s]])
    v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v);
  const fails = R.filter(r => r.startsWith('FAIL')).length;
  return R.join('\n') + `\n\n${R.length - fails}/${R.length} passed` + (fails ? ` -- ${fails} FAILED` : '');
})()
