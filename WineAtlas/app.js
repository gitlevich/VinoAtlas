<script>
const S=__DATA__, A=S.axes, C=S.calibration, OWNED=new Set(C.owned);
const el=id=>document.getElementById(id);
let point={...C.centroid}, hideOwned=true, hideVoted=false, picked=[], hold={};
let votes=JSON.parse(localStorage.getItem('cc_votes')||'{}');

/* ---------- tabs ---------- */
const TABS=['find','palate','move','pop','how','atlas'];
TABS.forEach(t=>el('t-'+t).onclick=()=>{
  TABS.forEach(x=>{el('t-'+x).setAttribute('aria-selected',x===t); el('s-'+x).hidden=x!==t;});
  /* a hidden canvas has no size, so the atlas is told when it is on screen: it
     measures itself and paints on the way in, and stops painting on the way out */
  ATLAS.show(t==='atlas');
});

/* ---------- find ---------- */
/* channels, not hexes: a measure's colour must be usable as a translucent tint
   without colour-mix, which mixes toward black in some engines */
const hexRGB=h=>{const n=parseInt(h.slice(1),16);return [(n>>16)&255,(n>>8)&255,n&255].join(',');};
const ENDC={weight:['#d98f97','#c4485e'],grip:['#c9b183','#b0702f'],oak:['#b8ab94','#c98a3e'],
  fruit:['#9ebf3b','#c9538f'],maturity:['#87a733','#96502a']};
const TH_UP='<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M1 21h4V9H1v12zM23 10c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.58 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"/></svg>';
const TH_DN='<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M15 3H6c-.83 0-1.54.5-1.84 1.22l-3.02 7.05c-.09.23-.14.47-.14.73v2c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 23l6.59-6.59c.36-.36.58-.86.58-1.41V5c0-1.1-.9-2-2-2zm4 0v12h4V3h-4z"/></svg>';
el('axes').innerHTML=A.map(a=>`<div class="ax">
  <div class="axtop"><span class="axname" style="color:${S.colors[a]}">${S.labels[a]}</span><span class="axval" id="v-${a}"></span></div>
  <div class="band-track" id="bt-${a}" style="--c:${S.colors[a]};--c-rgb:${hexRGB(S.colors[a])}" aria-label="${S.labels[a]}">
    <div class="band-bg bg-${a}"></div>
    <div class="band" id="b-${a}"><div class="bh left"></div><div class="bh right"></div></div>
    <div class="bmark" id="bm-${a}"></div>
  </div>
  <div class="ends"><span style="color:${ENDC[a][0]}">${S.ends[a][0]}</span><span style="color:${ENDC[a][1]}">${S.ends[a][1]}</span></div></div>`).join('');

let band=Object.fromEntries(A.map(a=>[a,[0,1]]));
function drawAxis(a){
  const [lo,hi]=band[a], b=el('b-'+a);
  b.style.left=(lo*100)+'%'; b.style.width=((hi-lo)*100)+'%';
  b.classList.toggle('open',lo<=0.001&&hi>=0.999);
  el('bm-'+a).style.left=(point[a]*100)+'%';
  el('v-'+a).textContent=point[a].toFixed(2)+((lo>0.001||hi<0.999)?' in '+lo.toFixed(2)+'–'+hi.toFixed(2):'');
  drawRadar();
}
function syncHold(){for(const a of A){const [lo,hi]=band[a];
  if(lo>0.001||hi<0.999) hold[a]=[lo,hi]; else delete hold[a];}}

/* the sigil as a spider graph: the shaded region is what the bands allow, the
   dashed shape the point, an overlaid wine its own shape -- outside the region
   is where it misses you */
let radarW=null, pinned=null;
function measuredTaste(){
  const own=S.wines.filter(w=>OWNED.has(w.id));
  return Object.fromEntries(A.map(a=>{
    const v=own.map(w=>w[a]).sort((x,y)=>x-y);
    return [a,[v[Math.floor(v.length*0.15)], v[Math.min(v.length-1,Math.floor(v.length*0.85))]]];
  }));
}
const TASTE=measuredTaste();

/* His buying is not one taste but four, and an average across them describes a
   wine he never bought. So each kind keeps its own wines, and every wine is
   drawn as itself -- nothing here is a mean. */
const KINDS=S.modes.map((m,i)=>({name:m.name,i,wines:[]}));
S.wines.filter(w=>OWNED.has(w.id)).forEach(w=>{
  let best=0,bd=Infinity;
  S.modes.forEach((m,i)=>{let d=0;for(const a of A){const t=w[a]-m.point[a];d+=t*t;}
    if(d<bd){bd=d;best=i;}});
  KINDS[best].wines.push(w);
});
/* his taste in a type IS the span his bottles of that type occupy on a measure --
   the whole span, untrimmed: a percentile cut is a statistic he never asked for */
function kindSpread(k){return Object.fromEntries(A.map(a=>{
  const v=k.wines.map(w=>w[a]); return [a,[Math.min(...v),Math.max(...v)]];}));}
function kpct(ws,a,p){const v=ws.map(w=>w[a]).sort((x,y)=>x-y);
  return v[Math.min(v.length-1,Math.floor(v.length*p))];}
function kindMiddle(k){return Object.fromEntries(A.map(a=>[a,kpct(k.wines,a,0.5)]));}
function mrpt(i,v,cx,cy,r){const ang=-Math.PI/2+i*2*Math.PI/5;
  return [(cx+Math.cos(ang)*v*r).toFixed(1),(cy+Math.sin(ang)*v*r).toFixed(1)];}
function miniRadar(k){
  const cx=52,cy=50,r=34;
  const rim=`<polygon points="${A.map((a,i)=>mrpt(i,1,cx,cy,r).join(',')).join(' ')}" fill="none" stroke="var(--grid)" stroke-width="0.8"/>`;
  const each=k.wines.map(w=>`<polygon points="${A.map((a,i)=>mrpt(i,w[a],cx,cy,r).join(',')).join(' ')}" fill="none" stroke="var(--mark)" stroke-opacity="0.22" stroke-width="0.7"/>`).join('');
  return `<svg viewBox="0 0 104 100" aria-hidden="true">${rim}${each}</svg>`;
}
function drawKinds(){
  el('modeBtns').innerHTML=KINDS.map(k=>
    `<button class="btn kindcard" data-m="${k.i}" title="Every one of these ${k.wines.length} wines drawn on its own. Pressing this asks for wines inside this kind's range.">
      ${miniRadar(k)}<span class="kn">${k.name.split(' — ')[0]}</span><span class="kc">${k.wines.length}</span>
    </button>`).join('');
  document.querySelectorAll('#modeBtns .btn').forEach(btn=>btn.onclick=()=>pickKind(+btn.dataset.m));
}
let chosenKind=null;
function pickKind(i){
  const k=KINDS[i];
  chosenKind=i; picked=[]; drawPicked();
  setBands(kindSpread(k));                       // its own wines' span, no mean
  document.querySelectorAll('#modeBtns .btn').forEach((b,n)=>b.classList.toggle('on',n===i));
  nameTaste();
}
function nameTaste(){
  const h=el('tasteHead'); if(!h) return;
  if(chosenKind===null){h.textContent='Your taste — adjusted by hand';return;}
  const k=KINDS[chosenKind];
  h.innerHTML=`Your taste in ${k.name.split(' — ')[0].toLowerCase()}
    <span style="text-transform:none;letter-spacing:0;font-weight:400;color:var(--ink-3)">
    · the span of your ${k.wines.length} bottles</span>`;
}
function rpt(i,v){const ang=-Math.PI/2+i*2*Math.PI/5;
  return [(125+Math.cos(ang)*v*92).toFixed(1),(112+Math.sin(ang)*v*92).toFixed(1)];}
function rpts(vals){return A.map((a,i)=>rpt(i,vals[i]).join(','));}
function drawRadar(){
  /* colors live in CSS classes, never in svg attributes: the artifact viewer
     drops attribute-level var() and the web renders glaring */
  // scaffolding, not information: the rim holds the drawing, the inner rings are
  // a faint ruler behind it
  const rings=[0.25,0.5,0.75].map(t=>
    `<polygon class="rgi" points="${rpts(A.map(()=>t)).join(' ')}" stroke-width="0.4"/>`).join('')+
    `<polygon class="rg" points="${rpts(A.map(()=>1)).join(' ')}" stroke-width="0.9"/>`;
  const spokes=A.map((a,i)=>`<polyline class="rg" points="125,112 ${rpt(i,1).join(',')}" stroke-width="0.6"/>`).join('');
  const labels=A.map((a,i)=>{
    const ang=-Math.PI/2+i*2*Math.PI/5, c=Math.cos(ang);
    const anchor=c>0.3?'start':c<-0.3?'end':'middle';
    const [x,y]=rpt(i,anchor==='middle'?1.14:1.06);
    // the corner states its own number, so the drawing can be checked at a glance
    return `<text x="${x}" y="${y}" text-anchor="${anchor}" dominant-baseline="middle" font-size="10.5" font-weight="600" fill="${S.colors[a]}">${S.short[a]} <tspan fill-opacity="0.62" font-weight="500">${point[a].toFixed(2)}</tspan></text>`;}).join('');
  // figure and ground: the world is neutral; YOUR PROFILE -- the dashed shape,
  // the wine you are asking for -- is filled. Inside it is you.
  const outside=`<polygon class="rout" points="${rpts(A.map(()=>1)).join(' ')}"/>`;
  const path=v=>'M'+rpts(v).join(' L')+' Z';
  const pt=`<path class="rpt" d="${path(A.map(a=>band[a][1]))} ${path(A.map(a=>band[a][0]))}"
    fill-rule="evenodd" stroke-width="1.4" stroke-dasharray="3 2.5"/>`;
  // two shapes only. Where they overlap, the two translucent fills blend on their
  // own -- that IS the meeting of the colours; a third painted region would be
  // both louder and false (the true overlap has corners between the axes).
  const wine=radarW?`<polygon class="rw" points="${rpts(A.map(a=>radarW[a])).join(' ')}" stroke-width="1.7"/>`+
    A.map((a,i)=>`<circle class="rwd" cx="${rpt(i,radarW[a])[0]}" cy="${rpt(i,radarW[a])[1]}" r="2.6"/>`).join(''):'';
  el('radar').innerHTML=`<svg viewBox="0 0 250 228" role="img" aria-label="your taste">${outside}${rings}${spokes}${pt}${wine}${labels}</svg>`;
}
function radarWine(w){
  radarW=w; drawRadar();
  if(!w){el('radarName').textContent='';return;}
  // the list ranks by nearness, never by pass or fail -- so the caption reports
  // difference, in the same words the list uses, and never a verdict
  const more=A.filter(a=>w[a]>point[a]+0.08).map(a=>S.short[a]);
  const less=A.filter(a=>w[a]<point[a]-0.08).map(a=>S.short[a]);
  const bits=[];
  if(more.length) bits.push('more '+more.join(', '));
  if(less.length) bits.push('less '+less.join(', '));
  el('radarName').textContent=w.name.slice(0,40)+
    (bits.length?' — '+bits.join('; ')+' than you asked':' — just what you asked for');
}
/* the range IS the taste; the centre is its middle, derived, never separate */
function recentre(a){point[a]=(band[a][0]+band[a][1])/2;}
/* NAMING A VALUE SLIDES THE RANGE, and a range that fills the scale has nowhere
   to slide -- so typing "cherry", pointing at a wine, or the sommelier answering
   with a value all landed silently on any measure you had left wide open. The
   width now comes from HIS OWN BOTTLES in the type that is open: the same span
   the reset button uses, so nothing is invented and no width is chosen by us.
   A measure you have already narrowed keeps the width you gave it. */
function ownSpan(a){
  const k=chosenKind===null
    ? KINDS.slice().sort((x,y)=>y.wines.length-x.wines.length)[0]
    : KINDS[chosenKind];
  if(!k||!k.wines.length) return 0.3;
  const [lo,hi]=kindSpread(k)[a];
  return Math.min(0.999,Math.max(0.06,hi-lo));
}
function setPoint(p){A.forEach(a=>{           // slide the range so its middle lands on p
  const w=(band[a][1]-band[a][0])>=0.999?ownSpan(a):band[a][1]-band[a][0];
  let lo=Math.min(Math.max(p[a]-w/2,0),1-w), hi=lo+w;
  band[a]=[lo,hi]; recentre(a); drawAxis(a);});syncHold();render();}
function setBands(h){A.forEach(a=>{band[a]=h&&h[a]?[Math.max(0,h[a][0]),Math.min(1,h[a][1])]:[0,1];
  recentre(a); drawAxis(a);});syncHold();render();}

/* two-headed slider, ported from the SigilAtlas band widget: drag a head to
   narrow, drag the middle to slide, double-click to release, click to place
   the point */
A.forEach(a=>{
  const track=el('bt-'+a), bandEl=el('b-'+a);
  const hL=bandEl.querySelector('.left'), hR=bandEl.querySelector('.right');
  let mode=null,sX=0,sL=0,sLo=0,sHi=0,tw=0,moved=false,lastDown=-1e9,lastDownX=0;
  function begin(e,m){e.preventDefault();e.stopPropagation();mode=m;moved=false;
    const r=track.getBoundingClientRect();
    sX=e.clientX;sL=r.left;tw=r.width;[sLo,sHi]=band[a];
    if(m==='body')bandEl.classList.add('dragging');
    try{track.setPointerCapture(e.pointerId);}catch(_){}
    track.onpointermove=move;track.onpointerup=up;track.onpointercancel=up;}
  function move(e){if(mode===null)return;
    if(Math.abs(e.clientX-sX)>2)moved=true;
    const dv=(e.clientX-sX)/tw;
    let [lo,hi]=band[a];
    if(mode==='left') lo=Math.min(Math.max(0,sLo+dv),hi-0.02);
    else if(mode==='right') hi=Math.max(Math.min(1,sHi+dv),lo+0.02);
    else {const w=sHi-sLo, mid=(e.clientX-sL)/tw;   // body drag and track click both slide it
      lo=Math.min(Math.max(mid-w/2,0),1-w); hi=lo+w;}
    band[a]=[lo,hi]; recentre(a); drawAxis(a);}
  function up(e){if(mode===null)return;
    const wasPoint=mode==='point';
    bandEl.classList.remove('dragging');
    track.onpointermove=track.onpointerup=track.onpointercancel=null;
    const m=mode; mode=null;
    if(!moved&&(wasPoint||m==='body')){
      const w=band[a][1]-band[a][0], mid=(e.clientX-sL)/tw;
      const lo=Math.min(Math.max(mid-w/2,0),1-w);
      band[a]=[lo,lo+w]; recentre(a); drawAxis(a);}
    picked=[];drawPicked();syncHold();
    chosenKind=null; document.querySelectorAll('#modeBtns .btn').forEach(b=>b.classList.remove('on'));
    nameTaste(); render();}
  hL.addEventListener('pointerdown',e=>begin(e,'left'));
  hR.addEventListener('pointerdown',e=>begin(e,'right'));
  bandEl.addEventListener('pointerdown',e=>{
    if(e.target===hL||e.target===hR)return;
    const dbl=e.timeStamp-lastDown<=350&&Math.abs(e.clientX-lastDownX)<=6;
    if(dbl){lastDown=-1e9;e.preventDefault();e.stopPropagation();
      band[a]=[0,1];recentre(a);drawAxis(a);syncHold();render();return;}
    lastDown=e.timeStamp;lastDownX=e.clientX;
    begin(e,'body');});
  track.addEventListener('pointerdown',e=>{
    if(e.target!==track&&e.target!==track.querySelector('.band-bg'))return;
    begin(e,'point');});
  track.addEventListener('dblclick',e=>{e.preventDefault();
    band[a]=[0,1];recentre(a);drawAxis(a);syncHold();render();});
});
drawKinds();
el('toNext').onclick=()=>{ // extend the trajectory of the recent orders
  const o=S.orders.filter(x=>x.weight!==undefined), a=o[o.length-4], b=o[o.length-1];
  picked=[];drawPicked();
  setPoint(Object.fromEntries(A.map(k=>[k,Math.max(0,Math.min(1,b[k]+(b[k]-a[k])))])));
};
el('ho').onchange=e=>{hideOwned=e.target.checked;render();};
el('hv').onchange=e=>{hideVoted=e.target.checked;render();};

function bars(w){
  const tip='This wine, bar by bar:\n'+A.map(a=>`${S.labels[a]}  ${w[a].toFixed(2)}  (${S.ends[a][w[a]<0.5?0:1]})`).join('\n');
  return `<div class="bars" title="${tip}">${A.map(a=>
    `<div class="bar" style="height:${4+Math.round(w[a]*22)}px;background:${S.colors[a]}"></div>`).join('')}</div>`;}
function why(w){
  const s=A.map(a=>[a,Math.abs(w[a]-point[a])]).sort((x,y)=>x[1]-y[1]);
  const near=s[0][0], far=s[s.length-1];
  const dir=S.compare[far[0]][w[far[0]]>point[far[0]]?1:0];
  const tint=(a,t)=>`<span style="color:${S.colors[a]}">${t}</span>`;
  const word=dir.replace(/\s+than$/,'');
  return `same ${tint(near,S.labels[near].toLowerCase())}, slightly ${tint(far[0],word)} than you asked`;
}
function render(){
  let pool=S.wines;
  if(hideOwned) pool=pool.filter(w=>!OWNED.has(w.id));
  if(hideVoted) pool=pool.filter(w=>!votes[w.id]);
  for(const a in hold){const [lo,hi]=hold[a]; pool=pool.filter(w=>w[a]>=lo&&w[a]<=hi);}
  const list=pool.map(w=>{let d=0;for(const a of A){const x=(w[a]-point[a])*C.weights[a]*A.length;d+=x*x;}
    return {w,d:Math.sqrt(d)};}).sort((x,y)=>x.d-y.d).slice(0,14);
  el('count').innerHTML=`${pool.length} wines considered &nbsp;·&nbsp; bars: `+
    A.map(a=>`<span style="color:${S.colors[a]};font-weight:600">${S.short[a]}</span>`).join(' ');
  el('out').innerHTML=list.map(({w})=>`<div class="row" data-w="${w.id}">
      <div><div class="nm">${w.name}</div>
        <div class="meta">${[w.variety,w.region].filter(Boolean).join(' · ')||'&nbsp;'}</div>
        <div class="why">${OWNED.has(w.id)?'you have bought this · ':''}${why(w)}</div></div>
      ${bars(w)}
      <div class="vote">
        <button class="yes ${votes[w.id]==='yes'?'on':''}" data-id="${w.id}" data-v="yes" title="more like this" aria-label="more like this">${TH_UP}</button>
        <button class="no ${votes[w.id]==='no'?'on':''}" data-id="${w.id}" data-v="no" title="fewer like this" aria-label="fewer like this">${TH_DN}</button>
      </div></div>`).join('');
  el('out').querySelectorAll('.row').forEach(r=>{
    if(r.dataset.w===pinned) r.classList.add('sel');
    r.onmouseenter=()=>radarWine(S.wines.find(x=>x.id===r.dataset.w));
    r.onmouseleave=()=>radarWine(pinned?S.wines.find(x=>x.id===pinned):null);
    r.onclick=e=>{
      if(e.target.closest('.vote')) return;
      pinned=pinned===r.dataset.w?null:r.dataset.w;
      el('out').querySelectorAll('.row').forEach(x=>x.classList.toggle('sel',x.dataset.w===pinned));
      radarWine(pinned?S.wines.find(x=>x.id===pinned):S.wines.find(x=>x.id===r.dataset.w));
    };
  });
  el('out').querySelectorAll('.vote button').forEach(b=>b.onclick=()=>{
    const id=b.dataset.id;
    votes[id]=votes[id]===b.dataset.v?undefined:b.dataset.v;
    if(!votes[id]) delete votes[id];
    localStorage.setItem('cc_votes',JSON.stringify(votes)); render();
  });
  const n=Object.keys(votes).length;
  el('votecount').textContent=n?`${n} marked so far`:'nothing marked yet';
}
function drawPicked(){
  el('picked').innerHTML=picked.map(id=>{const w=S.wines.find(x=>x.id===id);
    return `<span class="chip on" data-id="${id}">${w.name.slice(0,32)} ✕</span>`;}).join('');
  el('picked').querySelectorAll('.chip').forEach(c=>c.onclick=()=>{
    picked=picked.filter(i=>i!==c.dataset.id);drawPicked();centroid();});
}
function centroid(){ if(!picked.length) return;
  const ws=picked.map(id=>S.wines.find(x=>x.id===id));
  setPoint(Object.fromEntries(A.map(a=>[a,ws.reduce((s,w)=>s+w[a],0)/ws.length])));}
el('q').oninput=e=>{const q=e.target.value.trim().toLowerCase();
  if(q.length<2){el('matches').innerHTML='';return;}
  el('matches').innerHTML=S.wines.filter(w=>w.name.toLowerCase().includes(q)).slice(0,6)
    .map(w=>`<span class="chip" data-id="${w.id}">${w.name.slice(0,36)}</span>`).join('');
  el('matches').querySelectorAll('.chip').forEach(c=>c.onclick=()=>{
    if(!picked.includes(c.dataset.id))picked.push(c.dataset.id);
    el('q').value='';el('matches').innerHTML='';drawPicked();centroid();});};
/* ---------- ask: SigilML (@ reference, # affordance, ! invariant) ---------- */
/* stamped by the build with a hash of these bytes, so any copy can be asked
   which build it is -- the answer to "is this page stale?" */
const BUILD='__BUILD__';
/* not shown: the page that works says nothing about itself. Kept where a loaded
   page can still be asked which build it is holding. */
document.documentElement.dataset.build=BUILD;
/* The preview inside the artifact viewer is a frame that may not reach Anthropic
   or OpenAI, so the sommelier cannot run there. Everywhere else it can. */
const VIEWER=/claude(usercontent)?\.(ai|com)$/.test(location.hostname);
if(VIEWER){el('askOn').hidden=true;el('askOff').hidden=false;}
let agent=JSON.parse(localStorage.getItem('cc_agent')||'{}');
let refs={}, msel=0, mlist=[];
const askEl=el('ask'), menEl=el('mention'), hlEl=el('hl');

const AXNAME={body:'weight',weight:'weight',b:'weight',grip:'grip',g:'grip',oak:'oak',o:'oak',
  fruit:'fruit',f:'fruit',age:'maturity',a:'maturity'};
const AXWORDS=['body','grip','oak','fruit','age'];
const OPS=new Set(['and','or','not','vs']);
/* loose words the lens has grounded: term -> [axis, measured position]. The
   user's word may be coarser than the expert's -- it still lands where the
   corpus grounds it. */
const GROUND={'green apple':['fruit',0],lemon:['fruit',0],lime:['fruit',0],citrus:['fruit',0],
  grapefruit:['fruit',0],gooseberry:['fruit',0],
  apple:['fruit',.2],pear:['fruit',.2],quince:['fruit',.2],floral:['fruit',.2],honeysuckle:['fruit',.2],
  peach:['fruit',.4],apricot:['fruit',.4],melon:['fruit',.4],pineapple:['fruit',.4],mango:['fruit',.4],
  tropical:['fruit',.4],lychee:['fruit',.4],
  strawberry:['fruit',.6],raspberry:['fruit',.6],cranberry:['fruit',.6],redcurrant:['fruit',.6],
  'red cherry':['fruit',.6],rose:['fruit',.6],
  berry:['fruit',.7],berries:['fruit',.7],
  cherry:['fruit',.8],plum:['fruit',.8],blueberry:['fruit',.8],violet:['fruit',.8],'black cherry':['fruit',.8],
  blackberry:['fruit',1],blackcurrant:['fruit',1],cassis:['fruit',1],prune:['fruit',1],fig:['fruit',1],
  tar:['fruit',1],leather:['fruit',1],
  oaky:['oak',.8],oaked:['oak',.8],unoaked:['oak',.05],vanilla:['oak',.7],toasty:['oak',.8],buttery:['oak',.7],
  tannic:['grip',.85]};
const GKEYS=Object.keys(GROUND).sort((a,b)=>b.length-a.length);
const WSORT=[...S.wines].sort((a,b)=>b.name.length-a.name.length);

function boundary(t,i){return i===0||/[\s(,"]/.test(t[i-1]);}

function parseSpell(text){
  const toks=[], holds={}, wines=[], diags=[], prose=[], gloss=[];
  const names=Object.keys(refs).sort((a,b)=>b.length-a.length);
  let i=0;
  while(i<text.length){
    const ch=text[i];
    if(/\s/.test(ch)){i++;continue;}
    if(ch==='"'){let j=text.indexOf('"',i+1); j=j<0?text.length:j+1;
      toks.push({s:i,e:j,c:'tk-quote'}); prose.push(text.slice(i,j)); i=j; continue;}
    if(ch==='@'&&boundary(text,i)){
      const n=names.find(n=>text.startsWith(n,i+1))
        ||(WSORT.find(x=>text.startsWith(x.name,i+1))||{}).name;
      if(n){toks.push({s:i,e:i+1+n.length,c:'tk-ref'});
        const w=S.wines.find(x=>x.id===refs[n])||S.wines.find(x=>x.name===n);
        if(w&&!wines.includes(w))wines.push(w);
        i+=1+n.length; continue;}
      const m=text.slice(i).match(/^@[^\s@!#"]*/);
      toks.push({s:i,e:i+m[0].length,c:'tk-ref tk-err'});
      if(m[0].length>1)diags.push('@ points at a wine picked from the list -- type @ and choose');
      i+=m[0].length; continue;}
    if(ch==='!'&&boundary(text,i)){
      const m=text.slice(i).match(/^!([a-z]+)/i);
      const ax=m&&AXNAME[m[1].toLowerCase()];
      if(ax){
        let e=i+m[0].length;
        const rest=text.slice(e).match(/^\s+((?:\d*\.?\d+)?\.\.(?:\d*\.?\d+)?)/);
        if(rest&&rest[1]!=='..'){
          let [lo,hi]=rest[1].split('..').map(x=>x===''?null:+x);
          if(lo!==null&&lo>1)lo/=100; if(hi!==null&&hi>1)hi/=100;
          lo=lo===null?0:lo; hi=hi===null?1:hi;
          if(lo>hi) diags.push('a range goes low to high, like 0.2..0.6');
          else if(lo>0||hi<1) holds[ax]=[Math.max(0,lo),Math.min(1,hi)];
          e+=rest[0].length;
          toks.push({s:i,e,c:'tk-inv'});
        }else{
          toks.push({s:i,e,c:'tk-inv tk-err'});
          diags.push('!'+m[1]+' needs its range, like !'+m[1]+' 0.2..0.6 (..0.3 and 0.7.. leave a side open)');
        }
        i=e; continue;}
      const mm=text.slice(i).match(/^![^\s@!#"]*/);
      toks.push({s:i,e:i+mm[0].length,c:'tk-inv tk-err'});
      diags.push('! holds one of: '+AXWORDS.map(x=>'!'+x).join(' '));
      i+=mm[0].length; continue;}
    if(ch==='#'&&boundary(text,i)){
      const kw=AXWORDS.find(x=>text.slice(i+1).toLowerCase().startsWith(x));
      if(kw){toks.push({s:i,e:i+1+kw.length,c:'tk-aff'}); prose.push('#'+kw); i+=1+kw.length; continue;}
      const mm=text.slice(i).match(/^#[^\s@!#"]*/);
      toks.push({s:i,e:i+mm[0].length,c:'tk-aff tk-err'});
      diags.push('# names a measured quality: '+AXWORDS.map(x=>'#'+x).join(' '));
      i+=mm[0].length; continue;}
    const low=text.slice(i).toLowerCase();
    const gk=GKEYS.find(k=>low.startsWith(k)&&!/[a-z]/i.test(text[i+k.length]||''));
    if(gk){
      toks.push({s:i,e:i+gk.length,c:'tk-gw',st:'color:'+S.colors[GROUND[gk][0]]});
      gloss.push([gk,GROUND[gk][0],GROUND[gk][1]]);
      i+=gk.length; continue;}
    const m=text.slice(i).match(/^[^\s@!#"]+/);
    if(!m){i++;continue;}
    const w=m[0];
    if(OPS.has(w.toLowerCase())) toks.push({s:i,e:i+w.length,c:'tk-op'});
    else {toks.push({s:i,e:i+w.length,c:''}); prose.push(w);}
    i+=w.length;
  }
  // operators bind pointed things; prose stays prose -- an and/or/not with no
  // @ ! # quoted or measured word beside it is an ordinary word
  const BIND=/tk-(ref|inv|aff|quote|gw)/;
  toks.forEach((tk,ix)=>{
    if(tk.c!=='tk-op') return;
    const prev=toks[ix-1], next=toks[ix+1];
    if((prev&&BIND.test(prev.c))||(next&&BIND.test(next.c))) return;
    tk.c=''; prose.push(text.slice(tk.s,tk.e));
  });
  const ground={};
  for(const [,ax,v] of gloss){(ground[ax]=ground[ax]||[]).push(v);}
  for(const ax in ground) ground[ax]=ground[ax].reduce((s,x)=>s+x,0)/ground[ax].length;
  const plain=prose.filter(x=>!x.startsWith('#')&&!x.startsWith('"'));
  return {toks,holds,wines,diags,gloss,ground,hasPlain:plain.length>0||prose.some(x=>x.startsWith('"'))};
}

function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;');}
function spellHTML(t){
  const sp=parseSpell(t);
  let h='', last=0;
  for(const tk of sp.toks){
    h+=esc(t.slice(last,tk.s));
    const piece=esc(t.slice(tk.s,tk.e));
    h+=tk.c?`<span class="${tk.c}"${tk.st?` style="${tk.st}"`:''}>${piece}</span>`:piece;
    last=tk.e;
  }
  return h+esc(t.slice(last));
}
let chat=JSON.parse(localStorage.getItem('cc_chat')||'[]');
/* messages saved before notices existed were stored as answers; the tool's own
   words must read as the tool's, however old the history */
const WAS_NOTICE=/^(did not work \(|that did not go through \(|plain words need a key)/i;
if(chat.some(m=>m.role==='assistant'&&WAS_NOTICE.test(m.text))){
  chat.forEach(m=>{if(m.role==='assistant'&&WAS_NOTICE.test(m.text)) m.role='notice';});
  localStorage.setItem('cc_chat',JSON.stringify(chat));
}
const ICO_COPY='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 9h10v12H9z"/><path d="M5 15V3h10"/></svg>';
const ICO_DONE='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
function drawChat(){
  el('msgs').innerHTML=chat.map((m,i)=>
    `<div class="${m.role==='user'?'mu':m.role==='notice'?'mn':'ma'}">${m.role==='user'?spellHTML(m.text):esc(m.text)}${m.role==='notice'?`<button class="mx" data-i="${i}" title="Dismiss" aria-label="Dismiss this notice">&times;</button>`:`<button class="mcopy" data-i="${i}" title="Copy this message" aria-label="Copy this message">${ICO_COPY}</button>`}</div>`).join('');
  el('msgs').querySelectorAll('.mcopy').forEach(b=>b.onclick=e=>{
    e.stopPropagation();
    navigator.clipboard.writeText(chat[+b.dataset.i].text).then(()=>{
      b.innerHTML=ICO_DONE; setTimeout(()=>{b.innerHTML=ICO_COPY;},900);
    });
  });
  el('msgs').querySelectorAll('.mx').forEach(b=>b.onclick=e=>{
    e.stopPropagation();
    chat.splice(+b.dataset.i,1);
    localStorage.setItem('cc_chat',JSON.stringify(chat));
    drawChat();
  });
  el('msgs').scrollTop=1e9;
}
function addMsg(role,text){chat.push({role,text});localStorage.setItem('cc_chat',JSON.stringify(chat));drawChat();}
function drawSpell(){
  const t=askEl.value, sp=parseSpell(t);
  hlEl.innerHTML=spellHTML(t)+'\n';
  el('diag').textContent=[...new Set(sp.diags)].join('  ·  ');
  el('gloss').textContent=sp.gloss.map(([k,ax,v])=>k+' → '+S.short[ax]+' '+v.toFixed(2)).join('   ·   ');
  return sp;
}
askEl.addEventListener('scroll',()=>{hlEl.scrollTop=askEl.scrollTop;});



/* -- autocomplete for @ (wines), ! (qualities), # (qualities) -- */
function mentionQuery(){
  const t=askEl.value.slice(0,askEl.selectionStart);
  const i=Math.max(t.lastIndexOf('@'),t.lastIndexOf('!'),t.lastIndexOf('#'));
  if(i<0||!boundary(t,i)) return null;
  const q=t.slice(i+1);
  if(q.includes('\n')||q.length>40) return null;
  return {at:i,marker:t[i],q};
}
function drawMention(){
  const m=mentionQuery();
  if(!m){menEl.hidden=true;return;}
  let rows;
  if(m.marker==='@'){
    const toks=m.q.toLowerCase().split(/\s+/).filter(Boolean);
    mlist=S.wines.filter(w=>toks.every(t=>(w.name+' '+w.variety+' '+w.region).toLowerCase().includes(t))).slice(0,8);
    rows=mlist.map(w=>[w.name,[w.variety,w.region].filter(Boolean).join(' · ')]);
  }else if(m.marker==='#'){
    mlist=AXWORDS.filter(x=>x.startsWith(m.q.toLowerCase()));
    rows=mlist.map(x=>['#'+x,S.short[AXNAME[x]]]);
  }else{
    mlist=AXWORDS.filter(x=>x.startsWith(m.q.toLowerCase()));
    rows=mlist.map(x=>['!'+x,S.short[AXNAME[x]]+' -- then a range like ..0.3']);
  }
  if(!mlist.length){menEl.hidden=true;return;}
  msel=Math.min(msel,mlist.length-1);
  menEl.innerHTML=rows.map((r,i)=>`<div class="m ${i===msel?'sel':''}" data-i="${i}">${r[0]}
    <div class="mm">${r[1]}</div></div>`).join('');
  menEl.hidden=false;
  menEl.querySelectorAll('.m').forEach(d=>d.onmousedown=e=>{e.preventDefault();pickMention(+d.dataset.i);});
}
function pickMention(i){
  const m=mentionQuery(), item=mlist[i];
  if(!m||item===undefined) return;
  let ins;
  if(m.marker==='@'){ins='@'+item.name+' '; refs[item.name]=item.id;}
  else ins=m.marker+item+' ';
  const after=askEl.value.slice(askEl.selectionStart);
  askEl.value=askEl.value.slice(0,m.at)+ins+after;
  const p=m.at+ins.length;
  askEl.setSelectionRange(p,p); askEl.focus();
  menEl.hidden=true; drawSpell();
}
askEl.oninput=()=>{msel=0;drawMention();drawSpell();};
askEl.onkeydown=e=>{
  if(menEl.hidden){
    if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}
    return;
  }
  if(e.key==='ArrowDown'){msel=Math.min(msel+1,mlist.length-1);drawMention();e.preventDefault();}
  else if(e.key==='ArrowUp'){msel=Math.max(msel-1,0);drawMention();e.preventDefault();}
  else if(e.key==='Enter'||e.key==='Tab'){pickMention(msel);e.preventDefault();}
  else if(e.key==='Escape'){menEl.hidden=true;}
};
askEl.onblur=()=>setTimeout(()=>menEl.hidden=true,150);

/* -- execution: invariants and picked wines run here; plain words go out -- */
function sigilSay(sp){
  const bits=[];
  if(sp.wines.length) bits.push('set to '+(sp.wines.length>1?'the middle of ':'')+sp.wines.map(w=>w.name).join(', '));
  for(const [k,ax,v] of (sp.gloss||[])) bits.push(k+' read as '+S.short[ax]+' '+v.toFixed(2));
  for(const a in sp.holds){const [lo,hi]=sp.holds[a];
    bits.push(S.short[a]+' held '+(lo<=0?'under '+hi.toFixed(2):hi>=1?'over '+lo.toFixed(2):lo.toFixed(2)+' to '+hi.toFixed(2)));}
  return bits.join('; ');
}
const BUILT_FRAMING=`You are a very good sommelier, and you live inside Cellar Compass, a tool built for one person: a wine expert who has bought 232 different wines over ten orders from Royal Wine Merchants, a shop whose list holds 1,652 wines. The tool read his buying history and the shop's written descriptions, and it places every wine on five measures -- the only qualities of wine that trained tasting panels have been shown to rank the same way. Sourness, bitterness, greenness, minerality and most aroma-wheel words failed that test and stand deliberately outside the tool's language; your expertise must speak through the five that passed. Nobody tasted these wines: each wine's numbers come from its written description, and its place in that five-measure space is what the tool knows of it. What you know of a wine beyond its place is your own sommelier's knowledge -- use it freely to interpret his wishes, but when it disagrees with a wine's measured numbers, the numbers win, because the numbers are what he is testing. He is here to test them: he says what he wants, the tool shows the closest wines it can find, and he marks its suggestions right or wrong. He knows wine deeply; so do you; the tool is the one on trial.

Your part is exact. You translate his words into moves of the tool's five measures: the point they stand at, and the bands that limit them. The shop's whole list stands in your view below -- every wine with its grape, its region and its measured numbers. You still act only through the measures: the tool surfaces the wines nearest the point, inside every band. But you move with the list in sight, so move knowingly -- and in "say" you may name what a move will surface. Change only the measures his words ask for; leave the rest where they stand. When he points at a wine, start from that wine's measured numbers, not from your own beliefs about it.

You are also his guide to this tool. He may ask what something is, where to look, or to be walked through it; when he does, take him there with "act" -- open the section, name the part -- and explain it in plain words, one thought at a time. Whatever you move wears a fading ring where it sits, so he can see what you just did; you may refer to that.

Grape, region and price are not measures the distance uses; you can read them in the list, so when he asks by them, steer the measures toward the wines that carry them and say what you are doing. If his words reach neither a measure nor the list, say so rather than guessing. Every answer you send is applied at once: he watches the point, the bands and the wine list move as you speak, and whatever you moved wears a fading ring where it sits. Before each of your answers you are shown WHAT HE SEES RIGHT NOW -- the open section, the point, the bands, how many wines survive, the closest ones by name, what is held on his radar, how many he has marked. Read it: it is the result of what you last did. Name what actually came up rather than guessing at it. Speak plainly and briefly, to an expert.`;
function framing(){return (agent.prompt&&agent.prompt.trim())||BUILT_FRAMING;}
/* what the page shows right now -- the agent reads this before every answer, so
   it sees the result of what it last did instead of acting blind */
function observeApp(){
  const hs=Object.entries(hold).map(([a,[lo,hi]])=>`${a} in [${lo.toFixed(2)}, ${hi.toFixed(2)}]`).join('; ');
  const open=TABS.find(t=>!el('s-'+t).hidden)||'find';
  const shown=[...el('out').querySelectorAll('.row')].slice(0,6)
    .map(r=>{const w=S.wines.find(x=>x.id===r.dataset.w); return w?w.name:'';}).filter(Boolean);
  const pin=pinned?(S.wines.find(x=>x.id===pinned)||{}).name:null;
  const marks=Object.keys(votes).length;
  /* his marks are the measurement: the sommelier may read every one of them by
     name -- it just may never cast one */
  const named=d=>Object.keys(votes).filter(id=>votes[id]===d)
    .map(id=>(S.wines.find(x=>x.id===id)||{}).name).filter(Boolean).join('; ');
  const right=named(1), wrong=named(-1);
  return `WHAT HE SEES RIGHT NOW
Open section: ${open}.
The point stands at: ${A.map(a=>`${a}=${point[a].toFixed(2)}`).join(' ')}.
Bands held (a wine outside any band is never shown): ${hs||'none'}.
Wines considered after the bands and filters: ${el('count').textContent.split('·')[0].replace(/\s*wines considered\s*/,'').trim()}.
Closest wines on his screen, nearest first: ${shown.join('; ')||'none'}.
Held on his radar: ${pin||'nothing'}.
Wines he has marked so far: ${marks}.${right?`\nHe marked right: ${right}.`:''}${wrong?`\nHe marked wrong: ${wrong}.`:''}
Hiding wines he already bought: ${hideOwned?'yes':'no'}. Hiding ones he already marked: ${hideVoted?'yes':'no'}.
${ATLAS.seen()}`;
}
/* WHAT THE SOMMELIER IS GIVEN. It had the shop as name, grape, region and five
   numbers -- and nothing else, which is why it could say what his earliest order
   was LIKE and not which bottle it was. It now sees what he sees: which wines are
   his, what year, what the Atlas words say about each, and what was actually in
   each of the ten orders. Built at send time, since the Atlas words come from
   the Atlas and it is assembled after this. */
const KINDNAME=k=>k.name.split(/[—-]/)[0].trim();
function catalogText(){
  const words=[], kind={};
  try{ for(const t of ATLAS.D.terms) for(const i of t.in) (words[i]=words[i]||[]).push(t.w); }catch(_){}
  KINDS.forEach(k=>k.wines.forEach(w=>{kind[w.id]=KINDNAME(k);}));
  return S.wines.map((w,i)=>
    `${w.name} | ${w.vintage?Math.round(w.vintage):'NV'} | `
    +`${[w.variety,w.region].filter(Boolean).join(', ')||'-'} | `
    +A.map(a=>w[a].toFixed(2)).join(' ')
    +(OWNED.has(w.id)?' | HIS, '+(kind[w.id]||'unsorted'):'')
    +(words[i]&&words[i].length?' | '+words[i].join(' '):'')).join('\n');
}
function ordersText(){
  const o=S.orders.filter(x=>x.ids&&x.ids.length);
  return o.map(x=>`Order ${x.n} (${x.ids.length}): `
    +x.ids.map(id=>{const w=S.wines.find(y=>y.id===id);return w?w.name:'#'+id;}).join('; ')
    +' -- '+A.map(a=>`${a}=${x[a].toFixed(2)}`).join(' ')).join('\n');
}
function lensSystem(sp){
  const axes=A.map(a=>`${a}: ${S.labels[a]}, 0 = ${S.ends[a][0]}, 1 = ${S.ends[a][1]}`).join('\n');
  const rw=sp.wines.map(w=>`"${w.name}" (${[w.variety,w.region].filter(Boolean).join(', ')}): `+
    A.map(a=>`${a}=${w[a].toFixed(2)}`).join(' ')+
    (w.nose?` | nose: ${String(w.nose).slice(0,200)}`:'')).join('\n');
  const hs=Object.entries(hold).map(([a,[lo,hi]])=>`${a} in [${lo.toFixed(2)}, ${hi.toFixed(2)}]`).join('; ');
  const gl=sp.gloss.map(([k,ax,v])=>`"${k}" -> ${ax}=${v.toFixed(2)}`).join('; ');
  const stat=`${framing()}

The five measures, each running 0 to 1:
${axes}
The shop's middle wine sits at: ${A.map(a=>`${a}=${C.catalog_median[a].toFixed(2)}`).join(' ')} -- judge how far a move reaches against this.
His buying splits into four kinds, measured from his orders:
${S.modes.map(m=>`${m.name} (${m.n} wines): `+A.map(a=>`${a}=${m.point[a].toFixed(2)}`).join(' ')).join('\n')}
${(()=>{const o=S.orders.filter(x=>x.weight!==undefined);if(o.length<4)return '';
  const m=g=>A.map(a=>g.reduce((t,x)=>t+x[a],0)/g.length);
  const f=m(o.slice(0,3)), l=m(o.slice(-3));
  return 'His buying has moved, earliest orders to latest: '+A.map((a,i)=>`${a} ${f[i].toFixed(2)} -> ${l[i].toFixed(2)}`).join(', ')+'.';})()}
The user may name a measure with #weight #grip #oak #fruit #age; "more #oak" means raise oak.

YOUR HANDS. The tools sent with this message are the page's own controls, and calling one is his hand on it: it happens at once, on his screen, and whatever you move wears a fading ring where it sits. Everything he can do you can do, except marking a wine right or wrong and Reset -- those are his, his marks are the measurement, and you must never cast one.
Never say a move instead of making it. If you are about to write that you are turning the Atlas, or setting a measure, or opening a section, call the tool in that same turn; a sentence about a move that was not called is a lie to him. Every call answers with what the page shows afterwards. Read that answer before you speak, and name the wines that actually came up rather than the ones you expected. When you are asked something you can only settle by looking, call "look" first and answer from what it says.
Then reply in plain sentences -- short, to an expert, never JSON. The only measure names allowed in speech are: body, tannin grip, oak, fruit character, age. The tools call age "maturity"; in speech it is always age. The interface calls the point "the wine you are asking for" -- use that phrase when you refer to it, never "the point".

His ten orders, oldest to newest, with what was actually in each:
${ordersText()}

The shop's list -- every wine the tool can surface, as:
name | vintage | grape, region | ${A.join(' ')} | HIS if it is on his account | the words the shop's notes use for it:
${catalogText()}`;
  const dyn=`${observeApp()}
${rw?`Wines the user pointed at with @ (measured coordinates -- trust these over anything you know about the wine):\n${rw}\n`:''}${gl?`The measured lexicon grounds the user's loose words: ${gl} -- trust these mappings.`:''}`.trim();
  return {stat,dyn};
}


function chatMessages(){
  const out=[];
  for(const m of chat.slice(-16)){
    if(m.role==='notice') continue; // the tool talking, not part of the conversation
    const role=m.role==='user'?'user':'assistant';
    if(out.length&&out[out.length-1].role===role) out[out.length-1].content+='\n'+m.text;
    else out.push({role,content:m.text});
  }
  while(out.length&&out[0].role==='assistant') out.shift();
  return out;
}
/* agent parity: everything the user can click, except his marks and Reset.
   Anything the agent moves wears a fading ring, so a change is never silent. */
function flash(node){
  if(!node) return;
  node.classList.remove('touched'); void node.offsetWidth; node.classList.add('touched');
  setTimeout(()=>node.classList.remove('touched'),1700);
}
const PART=()=>({sigil:el('axes').closest('.card'), measures:el('axes'), shape:el('radar'),
  list:el('out').closest('.card'), ask:document.querySelector('.chat'),
  kinds:el('modeBtns'), filters:el('ho').closest('.card'), marks:el('export')});
function showPart(name){
  const node=PART()[name]; if(!node) return;
  const still=matchMedia('(prefers-reduced-motion:reduce)').matches;
  node.scrollIntoView({behavior:still?'auto':'smooth',block:'center'});
  flash(node);
}
function applyAct(act){
  if(!act||typeof act!=='object') return;
  if(act.tab&&el('t-'+act.tab)){el('t-'+act.tab).click();flash(el('t-'+act.tab));}
  if(Number.isInteger(act.kind)&&S.modes[act.kind]){
    const b=document.querySelectorAll('#modeBtns .btn')[act.kind]; b.click(); flash(b);}
  if(act.heading){el('toNext').click();flash(el('toNext'));}
  if(typeof act.hideOwned==='boolean'){el('ho').checked=act.hideOwned;
    el('ho').dispatchEvent(new Event('change'));flash(el('ho').closest('label'));}
  if(typeof act.hideVoted==='boolean'){el('hv').checked=act.hideVoted;
    el('hv').dispatchEvent(new Event('change'));flash(el('hv').closest('label'));}
  if(Array.isArray(act.like)&&act.like.length){          // the same path as his chips
    picked=[];
    act.like.forEach(n=>{const w=S.wines.find(x=>x.name.toLowerCase()===String(n).toLowerCase());
      if(w&&!picked.includes(w.id)) picked.push(w.id);});
    drawPicked(); centroid(); flash(el('picked'));
  }
  if(act.writeTaste){el('mySigil').click(); flash(el('mySigil'));}
  if(act.show) showPart(act.show);
  /* the Atlas is a place, and everything the reader can do in it the sommelier
     can do too -- turn, walk, change the field, tick a word, point at a bottle,
     fold a panel, fill the screen. Marking a wine right or wrong stays his. */
  if(act.atlas){ if(el('s-atlas').hidden) el('t-atlas').click(); ATLAS.act(act.atlas); }
  if(act.tour){ if(el('s-atlas').hidden) el('t-atlas').click(); ATLAS.tour(); }
  if('pin' in act){
    const w=act.pin?S.wines.find(x=>x.name.toLowerCase()===String(act.pin).toLowerCase()):null;
    pinned=w?w.id:null;
    el('out').querySelectorAll('.row').forEach(x=>x.classList.toggle('sel',x.dataset.w===pinned));
    radarWine(w||null);
    if(w){const r=el('out').querySelector('.row.sel'); if(r){flash(r);
      r.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth',block:'nearest'});}}
  }
}
/* ---- the sommelier's hands ------------------------------------------------
   It used to answer with a blob of hand-written JSON that carried both its
   sentence and its move. Nothing checked the blob: a key in the wrong place
   was not an error, it was silence -- it said "turning the Atlas to that wine"
   and the Atlas did not turn, because "atlas" had been documented at the top
   level and was read one level down. Saying and doing were the same act, so
   there was nothing to disagree with.

   These are real tool calls instead. The shape is checked before it reaches us,
   the call is a separate thing from the sentence, and every call answers with
   what the page shows afterwards -- so the sentence is written after the move,
   about the move, from what the page then said. */
const SHOWPARTS=['sigil','measures','shape','list','ask','kinds','filters','marks'];
const axSchema=(d,lo,hi)=>({type:'number',minimum:lo===undefined?0:lo,maximum:hi===undefined?1:hi,description:d});
const TOOLBOX=[
{name:'move',
 description:'Move the wine he is asking for, and the bands that limit the search. The list then shows the shop wines nearest that wine, inside every band. Send only the measures his words move; the ones you leave out stay where they are.',
 schema:{type:'object',properties:{
   weight:axSchema(`${S.labels.weight}: 0 = ${S.ends.weight[0]}, 1 = ${S.ends.weight[1]}`),
   grip:axSchema(`${S.labels.grip}: 0 = ${S.ends.grip[0]}, 1 = ${S.ends.grip[1]}`),
   oak:axSchema(`${S.labels.oak}: 0 = ${S.ends.oak[0]}, 1 = ${S.ends.oak[1]}`),
   fruit:axSchema(`${S.labels.fruit}: 0 = ${S.ends.fruit[0]}, 1 = ${S.ends.fruit[1]}`),
   maturity:axSchema(`${S.labels.maturity}: 0 = ${S.ends.maturity[0]}, 1 = ${S.ends.maturity[1]}`),
   hold:{type:'object',description:'Hard requirements only, one per measure, as [low, high] on 0..1. A wine outside any band is never shown. [0, 1] releases a band.',
     properties:Object.fromEntries(A.map(a=>[a,{type:'array',items:{type:'number'},minItems:2,maxItems:2}]))}}}},
{name:'page',
 description:"Press the page's own controls. Every field is optional; send only what his words ask for.",
 schema:{type:'object',properties:{
   tab:{type:'string',enum:TABS,description:'Open a section. find = the finder; palate = his wines against the shelf; move = how his buying changed; pop = what happens to a drinker\'s first decade; how = what the words mean; atlas = the shop as a place he stands inside.'},
   kind:{type:'integer',minimum:0,maximum:3,description:'Press one of his four buying kinds: '+KINDS.map((k,i)=>`${i} = ${k.name} (${k.wines.length} of his wines)`).join('; ')},
   heading:{type:'boolean',description:'Set the wine he is asking for to where his buying is heading.'},
   hideOwned:{type:'boolean',description:'Hide wines he has already bought.'},
   hideVoted:{type:'boolean',description:'Hide wines he has already marked.'},
   pin:{type:'string',description:"Hold a named wine's shape on his radar, against his own. An empty string releases it."},
   show:{type:'string',enum:SHOWPARTS,description:'Bring one part of the page into view and ring it. sigil = the whole taste card; measures = the five band sliders; shape = the five-cornered drawing of his taste; list = the wines found; ask = this sommelier panel; kinds = his four buying kinds; filters = the two hiding switches; marks = the button that downloads his marks.'},
   like:{type:'array',items:{type:'string'},description:'Exact wine names. Sets the wine he is asking for to the middle of them, exactly as if he had named them himself.'},
   writeTaste:{type:'boolean',description:'Measure the bands his own buying stays inside and write them into his box, for him to correct and send.'}}}},
{name:'atlas',
 description:'Move him through the Atlas: the shop as a place he stands inside, where every wine is a glass at a bearing and his own are bottles. Opens that section first if it is closed. Every field is optional.',
 schema:{type:'object',properties:{
   face:{type:'string',description:'Turn him to face a pole, a word in the list, or a wine by name.'},
   faceTo:{type:'array',items:{type:'number'},minItems:3,maxItems:3,description:'Turn him to a bare bearing [x, y, z].'},
   zoom:axSchema('How close he is looking: 0 the whole field, 1 the closest.'),
   walk:{type:'number',minimum:-4,maximum:4,description:'Step him forward; a negative number steps him back.'},
   point:{type:'string',description:'Turn to a wine by name and open its card. Use this when he asks to be shown a particular bottle.'},
   tick:{type:'array',items:{type:'string'},description:'Light only the wines the shop describes with these words.'},
   untick:{type:'array',items:{type:'string'},description:'Put these words out.'},
   clear:{type:'boolean',description:'Put every word out, so the whole shop is shown.'},
   approach:{type:'boolean',description:'Carry him toward what he faces and hold what stayed in frame the whole way -- the wines that are really together rather than together from here.'},
   globe:{type:'boolean',description:'Show or hide the ball that says which way he is looking.'},
   help:{type:'boolean',description:'Open or close what-you-can-do-here.'},
   words:{type:'boolean',description:'Unfold or fold the word list on the left.'},
   sommelier:{type:'boolean',description:'Unfold or fold this panel.'},
   screen:{type:'boolean',description:'Fill the window with the shop, or give the page back.'}}}},
{name:'tour',
 description:'Walk him through his ten orders inside the Atlas, oldest to newest, standing him at each and saying what moved between it and the last. Offer this when he asks how his buying has changed, or how to read the Atlas.',
 schema:{type:'object',properties:{}}},
{name:'look',
 description:'Read the page back without touching it: the open section, where the wine he is asking for stands, the bands, the wines on his screen now, what he has marked, and where he stands in the Atlas. Every other tool answers with this too.',
 schema:{type:'object',properties:{}}}];
const clamp01=v=>Math.max(0,Math.min(1,v));
function runTool(name,input){
  const a=input&&typeof input==='object'?input:{};
  if(name==='move'){
    if(a.hold&&typeof a.hold==='object'){
      const h={...hold};
      for(const x of A){const b=a.hold[x];
        if(Array.isArray(b)&&b.length===2&&b.every(Number.isFinite)&&b[0]<b[1])
          h[x]=[clamp01(b[0]),clamp01(b[1])];}
      setBands(h);
    }
    if(A.some(x=>Number.isFinite(Number(a[x])))){
      const p={};
      A.forEach(x=>{const v=Number(a[x]); p[x]=Number.isFinite(v)?clamp01(v):point[x];});
      picked=[]; drawPicked(); setPoint(p);
    }
  }else if(name==='page'){
    const act={};
    for(const k of ['tab','kind','heading','hideOwned','hideVoted','show','like','writeTaste'])
      if(a[k]!==undefined) act[k]=a[k];
    if(a.pin!==undefined) act.pin=a.pin||null;
    applyAct(act);
  }else if(name==='atlas'){ applyAct({atlas:a}); }
  else if(name==='tour'){ applyAct({tour:true}); }
  else if(name!=='look') return 'There is no control by that name.';
  return observeApp();
}
/* the rings: whatever moved says so where it sits, whoever moved it */
function ringMoved(was){
  let moved=false;
  A.forEach(a=>{
    if(Math.abs(point[a]-was.p[a])>0.001
      ||band[a][0]!==was.b[a][0]||band[a][1]!==was.b[a][1]){
      moved=true; flash(el('bt-'+a).closest('.ax'));}
  });
  if(moved) flash(el('radar'));
}
const nowAt=()=>({p:{...point},b:Object.fromEntries(A.map(a=>[a,[...band[a]]]))});
/* A model given no tools, or a hand-written framing that asks for the old blob,
   still lands here. Both shapes are honoured -- nested under "act" and flat --
   because the flat one is what the old prompt actually asked for. */
function parseReply(raw){
  const a=raw.indexOf('{'), b=raw.lastIndexOf('}');
  if(a>=0&&b>a){try{return JSON.parse(raw.slice(a,b+1));}catch(_){}}
  return {say:raw.trim()}; // the model spoke prose; show it as the answer
}
function applyOld(j){
  if(j.hold){
    const h={...hold};
    for(const a of A){const b=j.hold[a];
      if(Array.isArray(b)&&b.length===2&&b.every(Number.isFinite)&&b[0]<b[1])
        h[a]=[clamp01(b[0]),clamp01(b[1])];}
    setBands(h);
  }
  if(j.point){
    const p={};
    A.forEach(a=>{const v=Number(j.point[a]); p[a]=Number.isFinite(v)?clamp01(v):point[a];});
    picked=[]; drawPicked(); setPoint(p);
  }
  const act={...(j.act&&typeof j.act==='object'?j.act:{})};
  if(j.atlas&&act.atlas===undefined) act.atlas=j.atlas;
  if(j.tour&&act.tour===undefined) act.tour=j.tour;
  applyAct(act);
}
async function callAgent(sys,msgs){
  if(agent.vendor==='openai'){
    const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+agent.key},
      body:JSON.stringify({model:agent.model||DEFAULT_MODEL.openai,
        tools:TOOLBOX.map(t=>({type:'function',function:{name:t.name,description:t.description,parameters:t.schema}})),
        messages:[{role:'system',content:sys.stat+'\n\n'+sys.dyn},...msgs]})});
    if(!r.ok) throw new Error('HTTP '+r.status);
    const d=await r.json(), m=d.choices&&d.choices[0]&&d.choices[0].message;
    if(!m) throw new Error('empty answer from the model');
    const calls=(m.tool_calls||[]).map(c=>{
      let input={}; try{input=JSON.parse(c.function.arguments||'{}');}catch(_){}
      return {id:c.id,name:c.function.name,input};});
    return {say:typeof m.content==='string'&&m.content?[m.content]:[],calls,turn:m,
      follow:rs=>rs.map(x=>({role:'tool',tool_call_id:x.id,content:x.out})),
      usage:{model:agent.model||DEFAULT_MODEL.openai,
        tin:d.usage?.prompt_tokens||0,tout:d.usage?.completion_tokens||0}};
  }
  const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',
    headers:{'Content-Type':'application/json','x-api-key':agent.key,
      'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
    body:JSON.stringify({model:agent.model||DEFAULT_MODEL.anthropic,max_tokens:1200,
      system:[{type:'text',text:sys.stat,cache_control:{type:'ephemeral'}},{type:'text',text:sys.dyn}],
      tools:TOOLBOX.map(t=>({name:t.name,description:t.description,input_schema:t.schema})),
      messages:msgs})});
  if(!r.ok) throw new Error('HTTP '+r.status);
  const d=await r.json();
  // content may open with a thinking block on newer models -- take text and calls
  const blocks=d.content||[];
  if(!blocks.length) throw new Error('empty answer from the model');
  return {say:blocks.filter(b=>b.type==='text').map(b=>b.text),
    calls:blocks.filter(b=>b.type==='tool_use').map(b=>({id:b.id,name:b.name,input:b.input})),
    turn:{role:'assistant',content:blocks},
    follow:rs=>[{role:'user',content:rs.map(x=>({type:'tool_result',tool_use_id:x.id,content:x.out}))}],
    usage:{model:agent.model||DEFAULT_MODEL.anthropic,
      tin:d.usage?.input_tokens||0,tout:d.usage?.output_tokens||0,
      cw:d.usage?.cache_creation_input_tokens||0,cr:d.usage?.cache_read_input_tokens||0}};
}
async function send(){
  const text=askEl.value.trim(); if(!text) return;
  const sp=parseSpell(text);
  if(sp.hasPlain&&!agent.key){ // do not consume the message: it stays in the box
    el('setup').hidden=false;
    el('setupBtn').classList.add('on'); el('setupBtn').setAttribute('aria-expanded','true');
    addMsg('notice','Plain words are sent to Anthropic or OpenAI, and no key is set yet. Open the gear, paste a key, then press Send again -- your message is still in the box.');
    return;}
  addMsg('user',text);
  askEl.value=''; drawSpell(); menEl.hidden=true;
  if(Object.keys(sp.holds).length) setBands({...hold,...sp.holds});
  if(!sp.hasPlain){
    const p=sp.wines.length
      ?Object.fromEntries(A.map(a=>[a,sp.wines.reduce((s,w)=>s+w[a],0)/sp.wines.length]))
      :{...point};
    for(const ax in sp.ground) p[ax]=sp.ground[ax];
    if(sp.wines.length||sp.gloss.length){picked=[]; drawPicked(); setPoint(p);}
    addMsg('assistant',sigilSay(sp)||'nothing to change');
    return;
  }
  el('askNote').textContent='…';
  /* IT MOVES, THEN SEES, THEN SPEAKS. The turn is a loop, not a single answer:
     it calls a control, the page answers with what it now shows, and only when
     it stops calling does it have the last word. So what it says is written
     after the move and from the result, and a move it merely described is not
     possible -- there is nothing to describe until the call has been made. */
  const ROUNDS=6;
  try{
    const sys=lensSystem(sp);
    let msgs=chatMessages(), spoke=false, round=0;
    for(;round<ROUNDS;round++){
      const res=await callAgent(sys,msgs);
      if(res.usage) addSpend(res.usage);
      for(const t of res.say){
        const j=res.calls.length?null:parseReply(String(t));
        if(j&&j.say!==undefined&&/^\s*\{/.test(t)){        // an old-shaped blob
          const was=nowAt(); applyOld(j); ringMoved(was);
          if(j.say){addMsg('assistant',String(j.say));spoke=true;}
        }else if(String(t).trim()){addMsg('assistant',String(t).trim());spoke=true;}
      }
      if(!res.calls.length) break;
      const out=[];
      for(const c of res.calls){
        const was=nowAt();
        let said; try{said=runTool(c.name,c.input);}
        catch(e){said='That control did not take: '+e.message;}
        ringMoved(was);
        out.push({id:c.id,out:said});
      }
      msgs=msgs.concat(res.turn,res.follow(out));
    }
    if(round>=ROUNDS) addMsg('notice','It kept working and was stopped after '+ROUNDS+' moves. Ask again, more narrowly.');
    if(!spoke) addMsg('assistant','Done.');
  }catch(err){
    addMsg('notice','That did not go through ('+err.message+'). Check the key behind the gear and the connection, then send again.');
  }
  el('askNote').textContent='';
}
el('askGo').onclick=send;
el('mySigil').onclick=()=>{
  askEl.value=A.map((a,ix)=>{
    const [lo,hi]=TASTE[a];
    if(lo<=0&&hi>=1) return ''; // an unconstrained quality is no requirement
    return '!'+AXWORDS[ix]+' '+lo.toFixed(2)+'..'+hi.toFixed(2);
  }).filter(Boolean).join(' ');
  drawSpell(); askEl.focus();
};
/* -- chat setup: who answers, key, model; persisted in this browser (cc_agent) -- */
const DEFAULT_MODEL={anthropic:'claude-sonnet-5',openai:'gpt-4o'};
/* per-1M-token USD prices, kept by hand; an unknown model shows tokens only */
const PRICE={'claude-opus-4-8':[5,25],'claude-opus-4':[15,75],'claude-sonnet-5':[3,15],
  'claude-sonnet-4':[3,15],'claude-haiku-4-5':[1,5],'claude-3-5-haiku':[0.8,4],
  'gpt-5-mini':[0.25,2],'gpt-5-nano':[0.05,0.4],'gpt-5':[1.25,10],'gpt-4o-mini':[0.15,0.6],
  'gpt-4o':[2.5,10],'gpt-4.1-mini':[0.4,1.6],'gpt-4.1':[2,8],'o3':[2,8],'o4-mini':[1.1,4.4]};
function price(id){let best=null;
  for(const k in PRICE) if(id.startsWith(k)&&(!best||k.length>best.length)) best=k;
  return best?PRICE[best]:null;}
let spend=JSON.parse(localStorage.getItem('cc_spend')||'{"usd":0,"tin":0,"tout":0,"unpriced":false}');
function drawSpend(){
  const t=x=>x>=1000?(x/1000).toFixed(1)+'k':String(x);
  el('spend').textContent=(spend.tin||spend.tout)
    ?(spend.unpriced?'':'$'+spend.usd.toFixed(spend.usd<0.1?4:2)+' · ')+t(spend.tin)+' in / '+t(spend.tout)+' out'
    :'';
}
function addSpend(u){
  spend.tin+=u.tin+(u.cw||0)+(u.cr||0); spend.tout+=u.tout;
  const p=price(u.model||'');
  if(p) spend.usd+=(u.tin*p[0]+(u.cw||0)*p[0]*1.25+(u.cr||0)*p[0]*0.1+u.tout*p[1])/1e6;
  else spend.unpriced=true;
  localStorage.setItem('cc_spend',JSON.stringify(spend)); drawSpend();
}
function saveAgent(){localStorage.setItem('cc_agent',JSON.stringify(agent));}
async function fetchModels(){
  if(agent.vendor==='openai'){
    const r=await fetch('https://api.openai.com/v1/models',{headers:{Authorization:'Bearer '+agent.key}});
    if(!r.ok) throw new Error('HTTP '+r.status);
    return (await r.json()).data.map(m=>m.id).filter(id=>/^(gpt|o\d)/.test(id)).sort();
  }
  const r=await fetch('https://api.anthropic.com/v1/models?limit=100',
    {headers:{'x-api-key':agent.key,'anthropic-version':'2023-06-01',
      'anthropic-dangerous-direct-browser-access':'true'}});
  if(!r.ok) throw new Error('HTTP '+r.status);
  return (await r.json()).data.map(m=>m.id);
}
function reflectSetup(){
  el('vendor').value=agent.vendor||'anthropic';
  el('key').value='';
  el('key').placeholder=agent.key?'Saved — paste to replace':'Paste your API key';
  el('keyClear').hidden=!agent.key;
  el('modelRow').hidden=!agent.key;
  el('setupStatus').textContent=agent.key?'A key is saved for '+(agent.vendor==='openai'?'OpenAI':'Anthropic')+'.':'No key saved yet.';
  if(document.activeElement!==el('prompt')) el('prompt').value=framing();
  if(agent.key) loadModels();
}
async function loadModels(){
  const sel=el('model'), chosen=agent.model||DEFAULT_MODEL[agent.vendor||'anthropic'];
  sel.innerHTML=`<option value="${chosen}">${chosen}</option>`;
  el('setupStatus').textContent='Asking for the list of models…';
  try{
    const ids=await fetchModels();
    if(!ids.includes(chosen)) ids.unshift(chosen);
    sel.innerHTML=ids.map(id=>`<option value="${id}" ${id===chosen?'selected':''}>${id}</option>`).join('');
    el('setupStatus').textContent='A key is saved for '+(agent.vendor==='openai'?'OpenAI':'Anthropic')+'.';
  }catch(err){
    el('setupStatus').textContent='Could not fetch models ('+err.message+') — the key may be wrong.';
  }
}
el('setupBtn').onclick=()=>{
  const open=el('setup').hidden;
  el('setup').hidden=!open;
  el('setupBtn').classList.toggle('on',open);
  el('setupBtn').setAttribute('aria-expanded',String(open));
};
el('vendor').onchange=()=>{
  agent.vendor=el('vendor').value; delete agent.model; saveAgent(); reflectSetup();};
let keyDebounce;
el('key').addEventListener('input',()=>{
  clearTimeout(keyDebounce);
  keyDebounce=setTimeout(()=>{
    const v=el('key').value.trim();
    if(!v) return;
    agent.vendor=el('vendor').value; agent.key=v; delete agent.model;
    saveAgent(); reflectSetup();
  },500);
});
el('keyClear').onclick=()=>{delete agent.key; delete agent.model; saveAgent(); reflectSetup();};
let promptDebounce;
function commitPrompt(){
  const v=el('prompt').value.trim();
  if(v===''||v===BUILT_FRAMING) delete agent.prompt; else agent.prompt=v;
  saveAgent();
}
el('prompt').addEventListener('input',()=>{clearTimeout(promptDebounce);promptDebounce=setTimeout(commitPrompt,400);});
el('prompt').addEventListener('blur',()=>{commitPrompt(); if(!agent.prompt) el('prompt').value=BUILT_FRAMING;});
el('model').onchange=()=>{agent.model=el('model').value; saveAgent();};
if(VIEWER) el('setupBtn').hidden=true; // a preview cannot reach them, so no key can be used
reflectSetup();
drawChat();
drawSpend();
/* a box dragged taller stays taller */
const SIZE=JSON.parse(localStorage.getItem('cc_size')||'{}');
if(SIZE.msgs) el('msgs').style.height=SIZE.msgs;
if(SIZE.ask) askEl.style.height=SIZE.ask;
const rememberSize=()=>{
  if(el('msgs').style.height) SIZE.msgs=el('msgs').style.height;
  if(askEl.style.height) SIZE.ask=askEl.style.height;
  localStorage.setItem('cc_size',JSON.stringify(SIZE));
};
new ResizeObserver(rememberSize).observe(el('msgs'));
new ResizeObserver(rememberSize).observe(askEl);

document.addEventListener('keydown',e=>{
  if(e.key!=='Escape'||!pinned) return;
  if(e.target instanceof Element&&e.target.closest('textarea,input')) return;
  pinned=null;
  el('out').querySelectorAll('.row.sel').forEach(x=>x.classList.remove('sel'));
  radarWine(null);
});
function openOnLargestKind(){
  const k=KINDS.slice().sort((a,b)=>b.wines.length-a.wines.length)[0];
  pickKind(k.i);
}
/* Three possessions, three resets: the marks you made, what was said, and the
   taste you are asking with. Each is undone where it lives, and undoing one
   never touches the other two. The key and its setup are not a possession of
   any panel -- nothing here erases them. */
el('resetMarks').onclick=()=>{
  const n=Object.keys(votes).length;
  if(!n) return; // nothing to lose, so nothing to ask
  if(!confirm(`Erase the ${n} mark${n>1?'s':''} you have made? They are saved in this browser only.`)) return;
  votes={}; localStorage.removeItem('cc_votes');
  hideVoted=false; el('hv').checked=false; // a filter over marks that no longer exist
  render();
};
el('resetChat').onclick=()=>{
  if(chat.length&&!confirm('Discard this conversation and start again? Your key and its setup stay.')) return;
  chat=[]; localStorage.removeItem('cc_chat'); drawChat();
  spend={usd:0,tin:0,tout:0,unpriced:false}; localStorage.removeItem('cc_spend'); drawSpend();
  refs={}; askEl.value=''; hlEl.innerHTML='';
  el('diag').textContent=''; el('gloss').textContent=''; el('askNote').textContent='';
};
el('resetTaste').onclick=()=>{
  // back to the span of his own bottles in this kind -- the taste his orders state
  picked=[]; pinned=null; radarWine(null);
  el('q').value=''; el('matches').innerHTML='';
  if(chosenKind===null) openOnLargestKind(); else pickKind(chosenKind);
};
el('export').onclick=()=>{
  const rows=[['item_id','name','variety','verdict',...A].join(',')];
  for(const id in votes){const w=S.wines.find(x=>x.id===id); if(!w)continue;
    rows.push([id,'"'+w.name.replace(/"/g,'')+'"','"'+w.variety+'"',votes[id],...A.map(a=>w[a])].join(','));}
  const b=new Blob([rows.join('\n')],{type:'text/csv'});
  const u=URL.createObjectURL(b), a=document.createElement('a');
  a.href=u;a.download='cellar-compass-judgements.csv';a.click();URL.revokeObjectURL(u);
};

/* ---------- palate ---------- */
el('palateStats').innerHTML=`
  <div class="stat"><div class="n">${C.n_owned}</div><div class="k">different wines bought</div></div>
  <div class="stat"><div class="n">${C.n_rebought}</div><div class="k">bought more than once</div></div>
  <div class="stat"><div class="n">${S.orders.length}</div><div class="k">separate orders on the account</div></div>
  <div class="stat"><div class="n">${S.wines.length}</div><div class="k">wines the shop lists</div></div>`;
el('palateBars').innerHTML=A.map(a=>{
  const D=S.dist[a], me=C.centroid[a], rb=C.rebuy_centroid[a];
  const share=D.pct_me<0.5?100-Math.round(D.pct_me*100):Math.round(D.pct_me*100);
  const phrase=S.compare[a][D.pct_me<0.5?0:1];
  const bw=100/D.hist.length;
  const bars=D.hist.map((h,i)=>{
    const mid=(i+0.5)/D.hist.length, mine=Math.abs(mid-me)<bw/200+0.03;
    return `<div style="position:absolute;bottom:0;left:${i*bw}%;width:${bw-0.6}%;
      height:${Math.max(3,Math.round(h/D.hmax*46))}px;border-radius:2px;
      background:${mine?'var(--mark)':'var(--ink-3)'};opacity:${mine?1:.35}"></div>`;}).join('');
  return `<div style="margin-bottom:26px">
    <div class="axtop" style="margin-bottom:2px">
      <span class="axname" style="color:${S.colors[a]}">${S.labels[a]}</span></div>
    <div style="font-size:13px;color:var(--ink-2);margin-bottom:9px">
      Your wines are <b style="color:var(--mark)">${phrase} ${share}%</b> of what the shop stocks.</div>
    <div style="position:relative;height:64px">
      ${bars}
      <div style="position:absolute;bottom:0;left:calc(${me*100}% - 1px);width:2px;height:58px;background:var(--mark)"></div>
      <div style="position:absolute;bottom:58px;left:${me*100}%;transform:translateX(-50%);
        font-size:11.5px;color:var(--mark);white-space:nowrap;font-weight:600">your wines</div>
    </div>
    <div class="ends" style="margin-top:3px"><span>${S.ends[a][0]}</span><span>${S.ends[a][1]}</span></div>
  </div>`;}).join('');

/* ---------- shared line chart ---------- */
function chart(series,labels,W=620,H=240,pad=34){
  const n=labels.length, x=i=>pad+i*(W-pad-96)/(n-1);
  const all=series.flatMap(s=>s.v), lo=Math.min(...all), hi=Math.max(...all), r=(hi-lo)||1;
  const y=v=>H-pad-((v-lo)/r)*(H-pad*2);
  return `<svg viewBox="0 0 ${W} ${H+26}" role="img" aria-label="line chart">
    ${labels.map((l,i)=>`<polyline points="${x(i)},${pad-8} ${x(i)},${H-pad}" fill="none" stroke="var(--grid)" stroke-width="1"/>
      <text x="${x(i)-10}" y="${H-pad+18}" font-size="11.5" fill="var(--ink-3)">${l}</text>`).join('')}
    ${series.map(s=>`<polyline points="${s.v.map((v,i)=>`${x(i)},${y(v)}`).join(' ')}" fill="none"
      stroke="${s.c}" stroke-width="2.4" stroke-linejoin="round"/>
      <circle cx="${x(n-1)}" cy="${y(s.v[n-1])}" r="3.4" fill="${s.c}"/>
      <text x="${x(n-1)+9}" y="${y(s.v[n-1])+4}" font-size="12" fill="var(--ink-2)">${s.n}</text>`).join('')}
  </svg>`;
}

/* ---------- how you moved ---------- */
const O=S.orders.filter(o=>o.weight!==undefined);
(function(){
  let run=0; const yr=O.map(o=>{run=Math.max(run,o.not_before||0);return run;});
  const MEAS=['oak','weight','fruit','grip','maturity'].map(k=>({k,n:S.short[k],c:S.colors[k]}));
  const W=640,H=272,pad=40,axisY=H-46,n=O.length;
  const x=i=>pad+i*(W-pad-130)/(n-1), y=v=>axisY-14-v*(axisY-14-(pad-6));
  let svg=`<svg id="mv" viewBox="0 0 ${W} ${H+30}" role="img" aria-label="Four measures of each order along one timeline">`;
  // THE TIMELINE: one horizontal line, orders as points on it, years beneath
  svg+=`<polyline points="${pad-10},${axisY} ${W-114},${axisY}" fill="none" stroke="var(--ink-2)" stroke-width="2.5" stroke-linecap="round"/>
        <polygon points="${W-104},${axisY} ${W-116},${axisY-6} ${W-116},${axisY+6}" fill="var(--ink-2)"/>
        <text x="${W-98}" y="${axisY+4}" font-size="12" font-weight="600" fill="var(--ink-2)">time</text>`;
  for(let i=0;i<n;i++){
    svg+=`<circle cx="${x(i)}" cy="${axisY}" r="3.5" fill="var(--ink-3)"/>
      <text x="${x(i)}" y="${axisY+18}" font-size="11.5" fill="var(--ink-2)" text-anchor="middle">${i+1}</text>`;
    if(i===0||yr[i]!==yr[i-1])
      svg+=`<text x="${x(i)}" y="${axisY+34}" font-size="11" fill="var(--ink-3)" text-anchor="middle">${yr[i]}+</text>`;
  }
  svg+=`<text x="${pad-12}" y="${y(1)+4}" font-size="11" fill="var(--ink-3)" text-anchor="end">high</text>
        <text x="${pad-12}" y="${y(0)+4}" font-size="11" fill="var(--ink-3)" text-anchor="end">low</text>
        <text x="${pad-10}" y="${pad-14}" font-size="10.5" fill="var(--ink-3)">high means: full weight · firm grip · heavy oak · dark-berry fruit · old</text>`;
  // series
  for(const m of MEAS)
    svg+=`<polyline points="${O.map((o,i)=>`${x(i)},${y(o[m.k])}`).join(' ')}" fill="none"
      stroke="${m.c}" stroke-width="1.4" stroke-linejoin="round" opacity="0.95"/>`;
  for(const m of MEAS)
    for(let i=0;i<n;i++)
      svg+=`<circle cx="${x(i)}" cy="${y(O[i][m.k])}" r="2.6" fill="${m.c}" pointer-events="none"/>`;
  // right-edge labels, spread
  const lab=MEAS.map(m=>({m,y:y(O[n-1][m.k])})).sort((a,b)=>a.y-b.y);
  for(let i=1;i<lab.length;i++) if(lab[i].y-lab[i-1].y<17) lab[i].y=lab[i-1].y+17;
  for(const l of lab)
    svg+=`<text x="${x(n-1)+12}" y="${l.y+4}" font-size="12.5" fill="${l.m.c}" font-weight="600">${l.m.n}</text>`;
  // the cursor: vertical line perpendicular to the timeline + intersection rings
  svg+=`<g id="cursor"><polyline id="mvline" points="${x(n-1)},${pad-6} ${x(n-1)},${axisY}"
      fill="none" stroke="var(--ink)" stroke-width="0.75" opacity="0.6"/>
    <circle id="mvdot" cx="${x(n-1)}" cy="${axisY}" r="6.5" fill="none" stroke="var(--ink)" stroke-width="1.5"/>
    ${MEAS.map(m=>`<circle id="ring-${m.k}" cx="${x(n-1)}" cy="${y(O[n-1][m.k])}" r="5.5"
      fill="none" stroke="${m.c}" stroke-width="1.3"/>`).join('')}</g>`;
  svg+='</svg>';
  el('moveChart').innerHTML=svg+'<div id="orderDetail"></div>';

  const mv=document.getElementById('mv');
  let locked=null;
  function showOrder(i){
    const gx=x(i);
    const ml=document.getElementById('mvline');
    ml.setAttribute('points',`${gx},${pad-6} ${gx},${axisY}`);
    ml.setAttribute('stroke-width', locked===i ? '1.4' : '0.75');
    ml.setAttribute('opacity', locked===i ? '0.9' : '0.6');
    document.getElementById('mvdot').setAttribute('fill', locked===i ? 'var(--ink)' : 'none');
    document.getElementById('mvdot').setAttribute('cx',gx);
    for(const m of MEAS){
      const r=document.getElementById('ring-'+m.k);
      r.setAttribute('cx',gx); r.setAttribute('cy',y(O[i][m.k]));
    }
    const o=O[i];
    const wines=(o.ids||[]).map(id=>S.wines.find(w=>w.id===id)).filter(Boolean)
      .sort((a,b)=>a.weight-b.weight);
    el('orderDetail').innerHTML=`
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin:12px 0 8px;flex-wrap:wrap;gap:6px">
        <b style="font-size:14px">Order ${i+1} of ${n} — ${wines.length} wines, no earlier than ${yr[i]}${locked===i?' · pinned':''}</b>
        <span style="font-size:12px">${MEAS.map(m=>`<b style="color:${m.c}">${m.n} ${o[m.k].toFixed(2)}</b>`).join(' · ')}</span></div>
      <div style="max-height:280px;overflow-y:auto">`+
      wines.map(w=>`<div class="row" style="grid-template-columns:1fr auto">
        <div><div class="nm">${w.name}</div>
          <div class="meta">${[w.variety,w.region].filter(Boolean).join(' · ')}</div></div>
        ${bars(w)}</div>`).join('')+`</div>`;
  }
  const nearest=e=>{
    const r=mv.getBoundingClientRect(), gx=(e.clientX-r.left)*W/r.width;
    let best=0,bd=1e9;
    for(let i=0;i<n;i++){const d=Math.abs(x(i)-gx); if(d<bd){bd=d;best=i;}}
    return best;
  };
  mv.style.cursor='pointer';
  mv.addEventListener('mousemove',e=>{ if(locked===null) showOrder(nearest(e)); });
  mv.addEventListener('mouseleave',()=>{ if(locked!==null) showOrder(locked); });
  mv.addEventListener('click',e=>{
    const i=nearest(e);
    locked = (locked===i) ? null : i;
    showOrder(i);
    el('pinHint').textContent = locked===null
      ? 'Point at an order to preview it · click to pin it'
      : `Order ${locked+1} pinned · click it again to unpin, or click another order`;
  });
  showOrder(n-1);

  const SHORT=['whites','big reds','lighter reds','featherweights'];
  el('moveTable').innerHTML=`
    <p class="note" style="margin:0 0 12px">No averages here. Each order is broken into the four kinds of
    wine from the Find wines tab, counted bottle by bottle.</p>
    <table><thead><tr><th>Order</th><th class="num">placed in or after</th><th class="num">wines</th>
    ${SHORT.map(h=>`<th class="num">${h}</th>`).join('')}
    </tr></thead><tbody>
    ${O.map((o,i)=>`<tr><td>${i+1}</td><td class="num">${yr[i]}</td><td class="num">${o.placed}</td>
    ${(o.mix||[]).map(c=>`<td class="num">${c||'·'}</td>`).join('')}</tr>`).join('')}
    <tr style="font-weight:600"><td>all ten</td><td class="num"></td><td class="num">${O.reduce((s,o)=>s+o.placed,0)}</td>
    ${[0,1,2,3].map(k=>`<td class="num">${O.reduce((s,o)=>s+(o.mix?o.mix[k]:0),0)}</td>`).join('')}</tr>
    </tbody></table>
    <p class="note" style="margin:12px 0 0">Kinds: ${S.modes.map((m,i)=>
      `<b>${SHORT[i]}</b> = ${m.name.split(' — ')[1]}`).join(' · ')}</p>`;
})();

/* ---------- everyone else ---------- */
(function(){
  const T=S.tenure;
  const ROWS=[
    {n:'Notes that say “lovely, delicious, smooth”', v:T.praise.map(x=>x*100), u:'%', c:'#d4537e', dir:'falls'},
    {n:'Notes that name a fault — corked, oxidised', v:T.fault.map(x=>x*100), u:'%', c:'#c2802f', dir:'rises', d:1},
    {n:'Age of the bottles they open', v:T.age, u:' yrs', c:'#8c6fe0', dir:'rises', d:1},
    {n:'Buying Pinot, Riesling, Nebbiolo', v:T.late.map(x=>x*100), u:'%', c:'#4dc08a', dir:'rises'},
    {n:'Buying Cabernet, Merlot, Zinfandel', v:T.entry.map(x=>x*100), u:'%', c:'#5b9bd5', dir:'falls'},
    {n:'The score they give a wine', v:T.score, u:'', c:'#8a8492', dir:'does not move', d:1},
  ];
  const LBL=['year 1','years 2–3','years 4–6','years 7–10','years 11+'];
  const W=620, rowH=64, pad=8, x=i=>150+i*(W-150-60)/(LBL.length-1);
  let html=`<div style="display:flex;margin:0 0 4px 0">
    <div style="width:150px"></div>
    ${LBL.map((l,i)=>`<div style="flex:1;text-align:center;font-size:11.5px;color:var(--ink-2)">${l}</div>`).join('')}
  </div>
  <div style="display:flex;align-items:center;margin-bottom:10px">
    <div style="width:150px"></div>
    <div style="flex:1;height:2px;background:var(--rule);position:relative">
      <div style="position:absolute;right:-2px;top:-4px;color:var(--ink-3);font-size:12px">→</div></div>
    <div style="margin-left:8px;font-size:11.5px;color:var(--ink-3)">time</div>
  </div>`;
  for(const r of ROWS){
    const lo=Math.min(...r.v), hi=Math.max(...r.v), rg=(hi-lo)||1;
    const y=v=>rowH-pad-((v-lo)/rg)*(rowH-2*pad);
    const fmt=v=>r.d?v.toFixed(1):Math.round(v);
    html+=`<div style="display:flex;align-items:center;border-top:1px solid var(--rule);padding:7px 0">
      <div style="width:150px;padding-right:10px">
        <div style="font-size:12.5px;font-weight:550;line-height:1.35">${r.n}</div>
        <div style="font-size:11px;color:${r.c};font-weight:600">${r.dir}</div>
      </div>
      <svg viewBox="0 0 ${W-150} ${rowH}" style="flex:1;display:block">
        <polyline points="${r.v.map((v,i)=>`${x(i)-150},${y(v)}`).join(' ')}"
          fill="none" stroke="${r.c}" stroke-width="2.2" stroke-linejoin="round"/>
        ${r.v.map((v,i)=>`<circle cx="${x(i)-150}" cy="${y(v)}" r="3.4" fill="${r.c}"/>
          <text x="${x(i)-150}" y="${y(v)<rowH/2 ? y(v)+16 : y(v)-8}" text-anchor="middle"
            font-size="11" fill="var(--ink-2)">${fmt(v)}${r.u}</text>`).join('')}
      </svg></div>`;
  }
  el('popChart').innerHTML=html;
})();
el('popStats').innerHTML=`
  <div class="stat"><div class="n">1,808</div><div class="k">people followed, each compared to their own first year</div></div>
  <div class="stat"><div class="n">1.04M</div><div class="k">tasting notes read</div></div>
  <div class="stat"><div class="n">117</div><div class="k">people in the 11+ band — read its bend loosely</div></div>`;

/* ---------- how it works ---------- */
const DEF={weight:'How heavy the wine feels in your mouth — thin and quick like water, or thick and coating like cream. Nothing to do with flavour. From the catalogue\'s Body field.',
  grip:'The drying, gripping feeling on your gums after a sip — what tannin does. Strong in young Barolo, nearly absent in Beaujolais. From the catalogue\'s Tannin field.',
  oak:'The taste barrels leave behind: vanilla, toast, coconut, sweet spice. None means you taste only the grape. From the catalogue\'s Oak influence field.',
  fruit:'Which fruit the wine reminds you of, on one scale: citrus & apple at the left end, through peach and red berries, to dark berries — blackberry, plum, black currant — at the right. Read from the catalogue\'s tasting descriptions.',
  maturity:'Age, counted against the wine\'s own lifespan — a Beaujolais is old at five years, a Barolo is still young. Young means recently bottled for its kind; old means late in its life, possibly past it. From the vintage and the catalogue\'s Aging potential field.'};
el('howAxes').innerHTML=A.map(a=>`<div style="margin-bottom:14px">
  <div class="axname" style="color:${S.colors[a]}">${S.labels[a]} <span class="axval">${S.ends[a][0]} → ${S.ends[a][1]}</span></div>
  <p class="note" style="margin-top:4px">${DEF[a]}</p></div>`).join('');

openOnLargestKind();

/* ---- inhabiting this page from outside ------------------------------------
   The sommelier that lives in the panel and a driver standing outside the page
   are the same kind of visitor: both want to know what is on the screen and to
   press what the reader can press. So they are given one surface, not two --
   the catalogue below is the catalogue sent to the model, the runner is the
   runner the model's calls go through, and the observation is the observation
   the model reads. A tool that works here works there, and a tool that rots
   here rots there, visibly.

   There is no sidecar to poll: this page is one file and is served as one file,
   so the transport is the page itself. A driver evaluates against this global.
     inhabit.guide()             what this is, and every tool with its schema
     inhabit.observe()           what the reader is looking at, in words
     inhabit.call(name, input)   press one, and read back what the page shows
     inhabit.ask(text)           put words to the sommelier and let it drive */
window.inhabit={
  protocol:'cellar-compass app-tools v1',
  get build(){return BUILD;},
  guide(){return{
    protocol:this.protocol, build:BUILD,
    what:'Cellar Compass: one buyer\'s ten orders against a shop of '+S.wines.length
      +' wines, placed on five measures. Six sections; the last, Atlas, is that shop as a place you stand inside.',
    how:'Call a tool by name with its input. Every call answers with the page\'s own observation, so the result and the new state are one thing. observe() is the same text without moving anything.',
    his:'Marking a wine right or wrong, and Reset, are the reader\'s alone and have no tool. His marks are the measurement.',
    tools:TOOLBOX.map(t=>({name:t.name,description:t.description,inputSchema:t.schema}))};},
  tools(){return TOOLBOX.map(t=>t.name);},
  observe(){return observeApp();},
  call(name,input){
    if(!TOOLBOX.some(t=>t.name===name))
      return 'There is no control by that name. Call inhabit.tools() for the list.';
    const was=nowAt(); const out=runTool(name,input||{}); ringMoved(was); return out;},
  ask(text){askEl.value=String(text||''); drawSpell(); return send();}
};

__ATLAS__
</script>
