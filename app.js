import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const INK = () => document.documentElement.dataset.theme==='dark'
  ? {wiki:0x9fd8b2, inbox:0x7fc79a, check:0xd9566a, claim:0x6fae88, external:0x8a9a90, edge:0x7fc79a}
  : {wiki:0x1f5a3c, inbox:0x2e6b4a, check:0x9B1B2E, claim:0x3d7d58, external:0x6b7f72, edge:0x2e6b4a};
let COL = INK();
const qid = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const base = p => String(p).split('/').pop();
const fmtSize = b => b > 1048576 ? (b/1048576).toFixed(1)+' MB' : b > 1024 ? (b/1024).toFixed(1)+' KB' : b+' B';
const ct = (iso, opts) => new Date(iso).toLocaleString('en-US', Object.assign({timeZone:'America/Chicago', hour:'numeric', minute:'2-digit'}, opts||{}));
try { localStorage.removeItem('sb-still'); } catch(e){}

const metricsEl = qid('metrics');
const projectsEl = qid('projects');
const chipsEl = qid('count-chips');
const noteEl = qid('confidence-note');
const stampEl = qid('gen-stamp');
const hintEl = qid('projects-hint');
const alertsEl = qid('alerts');

let metrics, DATA;
const GROK_URL = 'https://grok.com/';

function confBadge(c){
  const key = String(c||'low').toLowerCase();
  const label = key === 'data-gap' ? 'Data Gap' : key === 'high' ? 'High' : key === 'low' ? 'Low' : key;
  return '<span class="badge '+esc(key)+'">'+esc(label)+'</span>';
}

function alertHref(a){
  const q = 'Second Brain alert: '+a.tag+(a.detail?' — '+a.detail:'')+'. Please investigate this issue and tell me how to fix it.';
  return 'https://grok.com/?q='+encodeURIComponent(q);
}
function renderAlerts(list){
  if (!list || !list.length){ alertsEl.classList.remove('has'); alertsEl.innerHTML=''; return; }
  alertsEl.classList.add('has');
  const item = (a,i,dup) => '<a class="alert-tag '+(i % 3 === 1 ? 'signal' : '')+'" href="'+esc(alertHref(a))+'" target="_blank" rel="noopener"'+(dup?' aria-hidden="true" tabindex="-1"':'')+' title="Open in Grok Bot: '+esc(a.detail||a.tag)+'"><b>'+esc(a.tag)+'</b>'+(a.detail?'<i>'+esc(a.detail)+'</i>':'')+'<em>Fix In Grok Bot ↗</em></a>';
  const run = list.map((a,i)=>item(a,i,false)).join('');
  alertsEl.innerHTML = '<div class="ticker">'+run+list.map((a,i)=>item(a,i,true)).join('')+'</div>';
}

function renderMetricsSidebar(m){
  noteEl.textContent = m.confidence_note || 'Sourced from shared files.';
  if (m.generated_at) stampEl.textContent = 'Built ' + m.generated_at + ' · America/Chicago';
  if (m.projects && m.projects.note) hintEl.textContent = m.projects.note;
  renderAlerts(m.alerts);

  (m.sidebar || []).forEach((block, idx) => {
    const wrap = document.createElement('article');
    wrap.className = 'metric' + (idx === 0 ? ' is-open' : '');
    wrap.setAttribute('role','listitem');
    const itemsHtml = (block.items || []).map(it => `
      <div class="item">
        <span class="dot ${block.confidence==='data-gap'?'signal': (it.meta==='gap'?'signal':'')}"></span>
        <div>
          <div class="item-title">${esc(it.title)}</div>
          <div class="item-detail">${esc(it.detail)}</div>
          ${it.meta ? `<div class="item-tag">${esc(it.meta)}</div>` : ''}
          ${it.url ? `<a class="item-link" href="${esc(it.url)}" target="_blank" rel="noopener noreferrer">Open Live Page</a>` : ''}
        </div>
      </div>`).join('');
    let bugHtml = '';
    if (block.complete || block.working) {
      bugHtml = `
        <div class="subhead">Complete</div>
        ${(block.complete||[]).map(it => `
          <div class="item"><span class="dot"></span><div>
            <div class="item-title">${esc(it.title)}</div>
            <div class="item-detail">${esc(it.detail)}</div>
          </div></div>`).join('')}
        <div class="subhead">Working Bug Fixes</div>
        ${(block.working||[]).map(it => `
          <div class="item"><span class="dot crimson"></span><div>
            <div class="item-title">${esc(it.title)}</div>
            <div class="item-detail">${esc(it.detail)}</div>
          </div></div>`).join('')}`;
    }
    wrap.innerHTML = `
      <button class="metric-btn" type="button" aria-expanded="${idx===0?'true':'false'}">
        <span class="metric-label">${esc(block.label)}</span>
        <span class="metric-meta">${confBadge(block.confidence)}<span class="chev" aria-hidden="true">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 4.2L6 7.8L9.5 4.2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
        </span></span>
        <span class="metric-summary">${esc(block.summary)}</span>
      </button>
      <div class="metric-body">
        ${bugHtml || itemsHtml}
        ${block.source ? `<div class="source">Source · ${esc(block.source)}</div>` : ''}
      </div>`;
    const btn = wrap.querySelector('.metric-btn');
    btn.addEventListener('click', () => {
      const open = wrap.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    metricsEl.appendChild(wrap);
  });

  (m.projects && m.projects.groups || []).forEach(group => {
    const g = document.createElement('div');
    g.className = 'group' + (group.label.indexOf('Bots')>-1 ? ' icon-tray' : '');
    const cards = (group.items||[]).map((p, idx) => {
      const usage = p.usage || {};
      const level = usage.level || (p.status==='rostered'?'none':p.status==='archived'?'archived':'high');
      const label = usage.label || p.status;
      const ring = Math.max(0, Math.min(1, usage.ring ?? usage.meter ?? 0));
      const icon = p.icon || '';
      const hasUrl = !!(p.url && /^https:\/\//i.test(p.url));
      const isBot = group.label.indexOf('Bots') > -1;
      const href = hasUrl ? p.url : (isBot ? GROK_URL : '');
      const cta = hasUrl ? 'Open Live Page' : (isBot ? 'Open In Grok Bot · Find ' + p.name : '');
      const C = 2*Math.PI*46, dash = (ring*C).toFixed(1);
      const ringSvg = `<svg class="uring ${esc(level)}" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46" class="track"/>${ring>0?`<circle cx="50" cy="50" r="46" class="fill" stroke-dasharray="${dash} ${C.toFixed(1)}" transform="rotate(-90 50 50)"/>`:''}</svg>`;
      const pid = 'pop-' + slugId(group.label) + '-' + idx;
      const ringNote = level==='high' ? 'Ring shows an activity signal on file, not a usage count.' : level==='archived' ? 'Archived. No active ring.' : 'Empty ring: no usage data captured yet.';
      const pop = `<div class="bpop" id="${pid}" role="dialog" aria-label="${esc(p.name)}" hidden>
          <div class="bpop-h">${p.rank?`<span class="rank">#${p.rank}</span>`:''}<b>${esc(p.name)}</b></div>
          <div class="bpop-s"><span class="usage-pill ${esc(level)}">${esc(p.status)}</span> <span class="usage-pill ${esc(level)}">${esc(label)}</span></div>
          <p>${esc(p.note||'')}</p><p class="rn">${esc(ringNote)}</p>
          ${href?`<a class="bpop-cta" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(cta)} →</a>`:'<span class="rn">No public page yet.</span>'}
        </div>`;
      return `<div class="pcard"><button type="button" class="pbtn" aria-expanded="false" aria-controls="${pid}">
        <span class="service-icon ringed">${ringSvg}${icon ? `<img src="${esc(icon)}" alt="" loading="lazy" width="80" height="80">` : ''}</span>
        <span class="meta"><span class="name">${esc(p.name)}</span><span class="ulab">${esc(label)}</span></span></button>${pop}</div>`;
    }).join('');
    g.innerHTML = `<h4>${esc(group.label)}</h4><div class="pgrid">${cards}</div>`;
    projectsEl.appendChild(g);
  });
}

function slugId(s){ return String(s).toLowerCase().replace(/[^a-z0-9]+/g,'-'); }
document.addEventListener('click', e => {
  const btn = e.target.closest('.pbtn');
  document.querySelectorAll('.bpop').forEach(p => { if (!btn || p.id !== btn.getAttribute('aria-controls')) { p.hidden = true; } });
  document.querySelectorAll('.pbtn').forEach(b => { if (b !== btn) b.setAttribute('aria-expanded','false'); });
  if (btn){ const p = qid(btn.getAttribute('aria-controls')); p.hidden = !p.hidden; btn.setAttribute('aria-expanded', p.hidden?'false':'true'); }
});
addEventListener('keydown', e => { if (e.key==='Escape') document.querySelectorAll('.bpop').forEach(p => p.hidden = true); });
function renderTray(m){
  const row = qid('tray-row'); const seen = new Set(); const out = [];
  (m.projects && m.projects.groups || []).forEach(g => (g.items||[]).forEach(p => {
    if (!p.icon || seen.has(p.name)) return; seen.add(p.name);
    const inner = '<img src="'+esc(p.icon)+'" alt="" loading="lazy" width="44" height="44"><span>'+esc(p.name.length>16?p.name.slice(0,15)+'…':p.name)+'</span>';
    out.push(p.url ? '<a href="'+esc(p.url)+'" target="_blank" rel="noopener noreferrer" title="'+esc(p.name)+'">'+inner+'</a>' : '<span class="ti" title="'+esc(p.name)+'">'+inner+'</span>');
  }));
  row.innerHTML = out.join('');
}
const tbtn = qid('theme-toggle');
function syncToggle(){ const d = document.documentElement.dataset.theme==='dark'; tbtn.textContent = d ? 'Day Mode' : 'Dark Mode'; tbtn.setAttribute('aria-pressed', d?'true':'false'); }
syncToggle();
tbtn.addEventListener('click', () => {
  const d = document.documentElement.dataset.theme==='dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = d; try{ localStorage.setItem('sb-theme', d); }catch(e){}
  syncToggle(); COL = INK(); if (DATA && webglOK) buildGraph(DATA);
});
function renderChips(d, m){
  const counts = (d && d.counts) || (m && m.brain_counts) || {};
  const chipPairs = [
    ['Pages', counts.pages],
    ['Claims', counts.sourced_claims],
    ['Checks', counts.check_reports],
    ['Inbox', counts.inbox_items]
  ].filter(([,v]) => v != null);
  chipsEl.innerHTML = chipPairs.map(([k,v]) =>
    `<span class="chip">${esc(k)} <b>${esc(v)}</b></span>`
  ).join('');
}

const stage = qid('brain-stage'), glWrap = qid('gl'), labelsEl = qid('labels');
let renderer, scene, camera, group, nodes = [], links = [], nodeById = {}, particles, edgeLines, labelEls = {};
let webglOK = true;
let controls = null, userIdle = 99, pinned = null, focusId = null, warm = 1;
let last = performance.now();

function showFallback(msg){
  qid('fallback').style.display = 'flex';
  if (msg) qid('fallback-label').textContent = msg;
  qid('brain-hint').style.display = 'none';
  qid('reticle').hidden = true;
}

{
  try {
    renderer = new THREE.WebGLRenderer({antialias:true, alpha:true, preserveDrawingBuffer:true});
  } catch(e){
    webglOK = false;
    showFallback('3D View Unavailable · WebGL Not Supported');
    console.warn('WebGL unavailable', e);
  }
}

if (webglOK){
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0xF5F1E8, 0);
  
  glWrap.appendChild(renderer.domElement);
  scene = new THREE.Scene();
  
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  camera = new THREE.PerspectiveCamera(45, 1, 1, 2000);
  camera.position.set(0, 24, 175);
  camera.lookAt(0,0,0);
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 1.15); key.position.set(80,120,140); scene.add(key);
  
  const fill = new THREE.PointLight(0x9B1B2E, 280, 380); fill.position.set(90,-20,40); scene.add(fill);
  group = new THREE.Group(); scene.add(group);
  controls = new OrbitControls(camera, renderer.domElement);
  Object.assign(controls, {enableDamping:true, dampingFactor:.08, enablePan:false, minDistance:170, maxDistance:420, rotateSpeed:.7});
  controls.touches = {ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE};
  controls.addEventListener('start', ()=>{ userIdle = 0; });
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(); let down = null;
  renderer.domElement.addEventListener('pointerdown', e=>{ down = {x:e.clientX, y:e.clientY, t:performance.now()}; });
  renderer.domElement.addEventListener('pointerup', e=>{
    if (!down) return; const moved = Math.hypot(e.clientX-down.x, e.clientY-down.y), dur = performance.now()-down.t; down = null;
    if (moved > 10 || dur > 600) return;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set((e.clientX-r.left)/r.width*2-1, -(e.clientY-r.top)/r.height*2+1);
    let best = null, bd = Infinity;
    nodes.forEach(n=>{ const p = project(n); if (p.z>=1) return; const dd = Math.hypot(p.x-(e.clientX-r.left), p.y-(e.clientY-r.top));
      const hit = Math.max(22, n.r*6); if (dd < hit && dd < bd){ bd = dd; best = n; } });
    if (!best){ ray.setFromCamera(ndc, camera); const h = ray.intersectObjects(nodes.map(n=>n.mesh)); if (h.length) best = nodes.find(n=>n.mesh===h[0].object); }
    if (best) openSheet(best); else closeSheet();
  });
  qid('reticle').hidden = false;
}

function openSheet(n){
  const kv = [['Type', n.type]];
  if (n.type==='claim'){ kv.push(['Page', n.page||'']); if (n.section) kv.push(['Section', n.section]); (n.sources||[]).slice(0,4).forEach(s=>kv.push(['Source', s])); }
  else if (n.type==='external'){ kv.push(['Cited By', (n.cited_by||[]).length]); }
  else { if (n.ext) kv.push(['Format', n.ext.toUpperCase()]); if (n.size!=null) kv.push(['Size', fmtSize(n.size)]);
    if (n.mtime) kv.push(['Modified', ct(n.mtime,{month:'short',day:'numeric'})+' CT']);
    if (n.type==='wiki'){ kv.push(['Claims', n.claim_count||0]); if (n.words) kv.push(['Words', n.words]); }
    if (n.type==='inbox') kv.push(['Filed', n.filed?'Yes':'No']); }
  qid('sh-t').textContent = n.type==='claim' ? 'Claim' : (n.name || base(n.id));
  qid('sh-b').innerHTML = `<div class="kv">${kv.map(([k,v])=>`<span>${esc(k)}</span><span>${esc(v)}</span>`).join('')}</div>`
    + (typeof n.text==='string' && n.text ? `<div class="sb">${esc(n.text.slice(0,480))}</div>` : '')
    + `<div class="sb" style="color:var(--mist);font-family:var(--font-mono);font-size:10px">${esc(n.id)}</div>`;
  qid('sheet').classList.add('open'); focusId = n.id; pinned = n.id;
  qid('hud').innerHTML = `<span class="st">${esc(n.type)}</span><div class="fn">${esc(n.name || base(n.id))}</div>`;
}

function closeSheet(){ qid('sheet').classList.remove('open'); pinned = null; focusId = null; }
qid('sh-x').addEventListener('click', closeSheet);
addEventListener('keydown', e=>{ if (e.key==='Escape') closeSheet(); });

function glowTex(){
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  const g = x.createRadialGradient(64,64,0,64,64,64); g.addColorStop(0,'rgba(255,255,255,.9)'); g.addColorStop(.25,'rgba(255,255,255,.25)'); g.addColorStop(1,'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0,0,128,128); return new THREE.CanvasTexture(c);
}
const GLOW = webglOK ? glowTex() : null;

function radiusFor(n){
  if (n.type==='claim') return 1.3;
  if (n.type==='external') return 2.2;
  if (n.type==='wiki') return 4 + Math.min(4, Math.sqrt(n.claim_count||0) * .8) + Math.log10(n.size+10)*.6;
  if (n.type==='check') return 6;
  return 3 + Math.log10(n.size+10) * 0.45;
}


function buildGraph(d){
  if (!webglOK) return;
  const prev = Object.fromEntries(nodes.map(n=>[n.id,n]));
  while (group.children.length) group.remove(group.children[0]);
  labelsEl.innerHTML = ''; labelEls = {};
  const raw = [
    ...d.nodes.map(n=>({...n, core:true})),
    ...(d.claims||[]).map(c=>({...c, core:false})),
    ...(d.externals||[]).map(e=>({...e, core:false})),
  ];
  nodes = raw.map((n,i)=>{
    const p = prev[n.id];
    const a = i*2.399, r = 30 + (i%7)*6;
    return Object.assign(n, {
      x: p? p.x : Math.cos(a)*r, y: p? p.y : (Math.random()-.5)*40, z: p? p.z : Math.sin(a)*r,
      vx:0, vy:0, vz:0, r: radiusFor(n)
    });
  });
  nodeById = Object.fromEntries(nodes.map(n=>[n.id,n]));
  links = [];
  (d.edges||[]).forEach(e=>links.push({s:e.source, t:e.target, kind:e.kind, len: e.kind==='toc'?48:e.kind==='cites'?58:52}));
  (d.claims||[]).forEach(c=>{ links.push({s:c.page, t:c.id, kind:'claim', len:18 + Math.random()*16});
    (c.sources||[]).forEach(s=>{ if (nodeById[s] && s!==c.page) links.push({s:c.id, t:s, kind:'claimsrc', len:80, weak:true}); }); });
  (d.externals||[]).forEach(e=>(e.cited_by||[]).forEach(f=>links.push({s:f, t:e.id, kind:'url', len:45})));
  links = links.filter(l=>nodeById[l.s] && nodeById[l.t]);

  const sph = new THREE.SphereGeometry(1, 18, 12);
  nodes.forEach(n=>{
    const color = COL[n.type] ?? 0x1A3D32;
    const mat = new THREE.MeshBasicMaterial({color, wireframe:true, transparent:true, opacity:.6});
    const m = new THREE.Mesh(sph, mat); m.scale.setScalar(n.r); group.add(m); n.mesh = m;
    if (n.core){
      const gspr = new THREE.Mesh(new THREE.RingGeometry(1.15,1.2,48), new THREE.MeshBasicMaterial({color, transparent:true, opacity:.5, side:THREE.DoubleSide, depthWrite:false})); gspr.scale.setScalar(n.r); group.add(gspr); n.glow = gspr;
      const el = document.createElement('div');
      el.className = 'nlabel ' + (n.type==='inbox'?'reader':n.type==='check'?'check':'');
      el.innerHTML = `${esc(n.name)}<small>${n.type==='wiki'?`Page · ${n.claim_count||0} Claims`:n.type==='inbox'?`Inbox · ${(n.ext||'').toUpperCase()}`:'Report'}</small>`;
      labelsEl.appendChild(el); labelEls[n.id] = el;
    }
  });
  const pos = new Float32Array(links.length*6), col = new Float32Array(links.length*6);
  const ce = new THREE.Color(COL.edge); const ec = {}; links.forEach((l,i)=>{ const c = [ce.r,ce.g,ce.b]; for (let k=0;k<2;k++){ col.set(c, i*6+k*3); } });
  const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.BufferAttribute(pos,3)); eg.setAttribute('color', new THREE.BufferAttribute(col,3));
  edgeLines = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({vertexColors:true, transparent:true, opacity:.58, depthWrite:false}));
  group.add(edgeLines);
  const flow = links.filter(l=>!l.weak);
  const per = l => l.kind==='claim' ? 1 : 3;
  const plist = []; flow.forEach(l=>{ for (let k=0;k<per(l);k++) plist.push({l, t:Math.random(), sp:.12+Math.random()*.18}); });
  const pp = new Float32Array(plist.length*3), pc = new Float32Array(plist.length*3);
  plist.forEach((p,i)=>pc.set([ce.r,ce.g,ce.b], i*3));
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pp,3)); pg.setAttribute('color', new THREE.BufferAttribute(pc,3));
  particles = new THREE.Points(pg, new THREE.PointsMaterial({size:1.1, vertexColors:true, transparent:true, opacity:.8, depthWrite:false, sizeAttenuation:true}));
  particles.userData.list = plist; group.add(particles);
  warm = 1;
}

function simulate(dt){
  const N = nodes.length; if (!N) return;
  const alpha = Math.max(.02, warm); warm *= .995;
  for (let i=0;i<N;i++){ const a = nodes[i];
    for (let j=i+1;j<N;j++){ const b = nodes[j];
      let dx=a.x-b.x, dy=a.y-b.y, dz=a.z-b.z; let d2 = dx*dx+dy*dy+dz*dz+.01;
      const s = (a.core&&b.core?1400:a.core||b.core?90:110) / d2 * alpha; const d = Math.sqrt(d2);
      dx/=d; dy/=d; dz/=d; a.vx+=dx*s; a.vy+=dy*s; a.vz+=dz*s; b.vx-=dx*s; b.vy-=dy*s; b.vz-=dz*s; } }
  links.forEach(l=>{ const a=nodeById[l.s], b=nodeById[l.t];
    let dx=b.x-a.x, dy=b.y-a.y, dz=b.z-a.z; const d=Math.sqrt(dx*dx+dy*dy+dz*dz)+.01;
    const k = (l.weak?.003:(nodeById[l.s].core&&nodeById[l.t].core)?.06:.03) * (d-l.len) * alpha; dx/=d; dy/=d; dz/=d;
    const wa = a.core && !b.core ? .15 : .5, wb = 1-wa;
    a.vx+=dx*k*wa; a.vy+=dy*k*wa; a.vz+=dz*k*wa; b.vx-=dx*k*wb; b.vy-=dy*k*wb; b.vz-=dz*k*wb; });
  let cx=0,cy=0,cz=0,cn=0; nodes.forEach(n=>{ if(n.core){cx+=n.x;cy+=n.y;cz+=n.z;cn++;} });
  if (cn){ cx/=cn; cy/=cn; cz/=cn; nodes.forEach(n=>{ n.x-=cx*.08; n.y-=cy*.08; n.z-=cz*.08; }); }
  nodes.forEach(n=>{ n.vx-=n.x*.002*alpha; n.vy-=n.y*.004*alpha; n.vz-=n.z*.002*alpha;
    n.vx*=.82; n.vy*=.82; n.vz*=.82; n.x+=n.vx; n.y+=n.vy; n.z+=n.vz;
    const R = Math.hypot(n.x,n.y,n.z), MAX = 85; if (R>MAX){ n.x*=MAX/R; n.y*=MAX/R; n.z*=MAX/R; } });
}

const tmp = new THREE.Vector3();
function project(n){
  tmp.set(n.x,n.y,n.z); group.localToWorld(tmp);
  const dist = tmp.distanceTo(camera.position);
  tmp.project(camera);
  const w = stage.clientWidth, h = stage.clientHeight;
  return {x:(tmp.x*.5+.5)*w, y:(-tmp.y*.5+.5)*h, z:tmp.z, dist};
}

function resize(){
  if (!webglOK) return;
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false); renderer.domElement.style.width = w+'px'; renderer.domElement.style.height = h+'px';
  camera.aspect = w/h;
  const fit = w/h < 1 ? 300/Math.max(.45, w/h) : 300;
  if (!resize.fit || Math.abs(resize.fit-fit) > 1){ camera.position.setLength(fit); resize.fit = fit; }
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
addEventListener('orientationchange', ()=>setTimeout(resize, 200));
if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);

function frame(now){
  const dt = Math.min(.05, (now - last)/1000); last = now;
  if (webglOK){
    userIdle += dt;
    if (controls){ if (userIdle > 2.2) group.rotation.y += dt * 0.05; controls.update(); }
    simulate(dt);
    nodes.forEach(n=>{ n.mesh.position.set(n.x,n.y,n.z); if (n.glow) n.glow.position.set(n.x,n.y,n.z); });
    const pa = edgeLines.geometry.attributes.position.array;
    links.forEach((l,i)=>{ const a=nodeById[l.s], b=nodeById[l.t]; pa.set([a.x,a.y,a.z,b.x,b.y,b.z], i*6); });
    edgeLines.geometry.attributes.position.needsUpdate = true;
    const pl = particles.userData.list, pp = particles.geometry.attributes.position.array;
    pl.forEach((p,i)=>{ p.t = (p.t + dt*p.sp) % 1; const a=nodeById[p.l.s], b=nodeById[p.l.t];
      pp[i*3]=a.x+(b.x-a.x)*p.t; pp[i*3+1]=a.y+(b.y-a.y)*p.t; pp[i*3+2]=a.z+(b.z-a.z)*p.t; });
    particles.geometry.attributes.position.needsUpdate = true;
    const cd = camera.position.length();
    nodes.forEach(n=>{
      const pr = project(n); const f = THREE.MathUtils.clamp(1.25 - (pr.dist - (cd-60))/170, .18, 1);
      n.mesh.material.opacity = Math.min(1,(n.type==="claim"?.6:.85)*(0.35+0.65*f));
      const focused = n.id===focusId;
      if (n.glow){ n.glow.quaternion.copy(camera.quaternion); n.glow.material.opacity = (focused ? .9 : .4) * f; n.glow.scale.setScalar(n.r*(focused?1.8:1.25)); }
      const el = labelEls[n.id];
      if (el){ el.style.left = pr.x+'px'; el.style.top = pr.y+'px'; const W=stage.clientWidth,Hh=stage.clientHeight; const ex=(pr.x-W/2)/(W*.29), ey=(pr.y-12-Hh/2)/(Hh*.32); const inOval = ex*ex+ey*ey <= 1; el.style.opacity = (pr.z<1 && inOval && (focused || f>.62)) ? 1 : 0; el.style.zIndex = focused ? 9 : Math.round(f*8); }
      if (focused){
        qid('reticle').style.transform = `translate(${pr.x}px,${pr.y}px)`;
        const hud = qid('hud'); const right = pr.x > stage.clientWidth - 300;
        hud.style.left = right ? (-(hud.offsetWidth+60))+'px' : '60px';
      }
    });
    if (!focusId) qid('reticle').style.transform = 'translate(-9999px,-9999px)';
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
}

async function boot(){
  try {
    const [mRes, dRes] = await Promise.all([
      fetch('metrics.json', {cache:'no-store'}),
      fetch('data.json', {cache:'no-store'})
    ]);
    if (!mRes.ok) throw new Error('metrics missing');
    metrics = await mRes.json();
    DATA = dRes.ok ? await dRes.json() : null;
  } catch (err) {
    noteEl.textContent = 'Could not load metrics.json. Data gap.';
    showFallback('Could Not Load data.json');
    return;
  }
  renderMetricsSidebar(metrics);
  renderChips(DATA, metrics);
  if (DATA && webglOK){
    resize();
    buildGraph(DATA);
    resize();
    requestAnimationFrame(frame);
  } else if (!DATA) {
    showFallback('Could Not Load data.json');
  }
  window.__ready = true;
}
boot();

// sidebar expand/collapse
(function(){
  const shell=document.querySelector('.shell'), st=document.getElementById('side-toggle');
  const setSide=(open)=>{shell.classList.toggle('side-collapsed',!open);st.textContent=open?'Hide Metrics ›':'‹ Show Metrics';st.setAttribute('aria-expanded',open?'true':'false');try{localStorage.setItem('sb-side',open?'1':'0')}catch(e){};window.dispatchEvent(new Event('resize'));};
  st.addEventListener('click',()=>setSide(shell.classList.contains('side-collapsed')));
  document.getElementById('side-close').addEventListener('click',()=>setSide(false));
  try{if(localStorage.getItem('sb-side')==='0')setSide(false)}catch(e){}
  const secs=()=>[...document.querySelectorAll('.projects'),...document.querySelectorAll('.side [aria-expanded]')].filter(e=>e.id!=='side-toggle');
  const all=(open)=>{document.querySelectorAll('.projects').forEach(p=>p.classList.toggle('folded',!open));document.querySelectorAll('.side .metric-btn[aria-expanded]').forEach(b=>{if((b.getAttribute('aria-expanded')==='true')!==open)b.click();});};
  document.getElementById('sec-open').addEventListener('click',()=>all(true));
  document.getElementById('sec-close').addEventListener('click',()=>all(false));
  document.querySelectorAll('.projects>h3').forEach(h=>{h.tabIndex=0;h.setAttribute('role','button');const t=()=>h.parentElement.classList.toggle('folded');h.addEventListener('click',t);h.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();t();}});});
})();

// adjustable brain size
(function(){
  const root=document.documentElement, sl=document.getElementById('brain-size'), grip=document.getElementById('bh-grip');
  const DEF=98;
  const apply=(v,save)=>{ v=Math.max(50,Math.min(160,Math.round(v))); sl.value=v; root.style.setProperty('--bh',v+'vh'); if(save){try{localStorage.setItem('sb-brain2',v)}catch(e){}} window.dispatchEvent(new Event('resize')); };
  let v=DEF; try{const s=+localStorage.getItem('sb-brain2'); if(s) v=s;}catch(e){}
  apply(v,false);
  sl.addEventListener('input',()=>apply(+sl.value,true));
  document.getElementById('brain-reset').addEventListener('click',()=>apply(DEF,true));
  let y0=0,v0=0,on=false;
  grip.addEventListener('pointerdown',e=>{on=true;y0=e.clientY;v0=+sl.value;grip.setPointerCapture(e.pointerId);e.preventDefault();e.stopPropagation();});
  grip.addEventListener('pointermove',e=>{ if(on) apply(v0+(e.clientY-y0)/innerHeight*100,false); });
  grip.addEventListener('pointerup',()=>{ if(on){on=false;apply(+sl.value,true);} });
  grip.addEventListener('keydown',e=>{ if(e.key==='ArrowUp'){apply(+sl.value-4,true);e.preventDefault();} if(e.key==='ArrowDown'){apply(+sl.value+4,true);e.preventDefault();} });
})();

// drag-resize metrics panel
(function(){
  const sp=document.getElementById('splitter'), shell=document.querySelector('.shell'), root=document.documentElement; if(!sp) return;
  const wide=()=>matchMedia('(min-width:981px)').matches;
  const clamp=w=>Math.max(300,Math.min(Math.round(innerWidth*.7),Math.round(w)));
  const set=(w,save)=>{ w=clamp(w); root.style.setProperty('--sw',w+'px'); sp.setAttribute('aria-valuenow',w); if(save){try{localStorage.setItem('sb-sw',w)}catch(e){}} dispatchEvent(new Event('resize')); };
  try{const s=+localStorage.getItem('sb-sw'); if(s) set(s,false);}catch(e){}
  let on=false;
  sp.addEventListener('pointerdown',e=>{ if(!wide()) return; on=true; sp.setPointerCapture(e.pointerId); sp.classList.add('dragging'); document.body.classList.add('sb-dragging'); e.preventDefault(); });
  sp.addEventListener('pointermove',e=>{ if(on) set(shell.getBoundingClientRect().right-e.clientX-6,false); });
  const end=()=>{ if(!on) return; on=false; sp.classList.remove('dragging'); document.body.classList.remove('sb-dragging'); set(document.getElementById('side').getBoundingClientRect().width,true); };
  sp.addEventListener('pointerup',end); sp.addEventListener('pointercancel',end);
  sp.addEventListener('dblclick',()=>{ root.style.removeProperty('--sw'); try{localStorage.removeItem('sb-sw')}catch(e){} dispatchEvent(new Event('resize')); });
  sp.addEventListener('keydown',e=>{ const w=document.getElementById('side').getBoundingClientRect().width; if(e.key==='ArrowLeft'){set(w+32,true);e.preventDefault();} if(e.key==='ArrowRight'){set(w-32,true);e.preventDefault();} });
  addEventListener('resize',()=>{ const v=parseFloat(root.style.getPropertyValue('--sw')); if(v && v>innerWidth*.7) root.style.setProperty('--sw',clamp(v)+'px'); });
})();

// individually resizable dock widgets (Vercel Surfaces, Top 25 Bots)
function initGroupResize(){
  const narrow=()=>!matchMedia('(min-width:601px)').matches;
  document.querySelectorAll('#projects>.group').forEach(g=>{
    if(g.querySelector('.wgrip')) return;
    const key='sb-gw-'+((g.querySelector('h4,.tray-h')||{}).textContent||'g').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-');
    const b=document.createElement('button'); b.type='button'; b.className='wgrip'; b.title='Drag To Resize · Double Click To Reset'; b.setAttribute('aria-label','Resize Widget');
    b.innerHTML='<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M16 6L6 16M16 11L11 16"/></svg>'; g.appendChild(b);
    const set=(w,save)=>{ const max=g.parentElement.clientWidth; w=Math.max(260,Math.min(max,Math.round(w))); g.style.flexBasis=w+'px'; g.classList.add('sized'); if(save){try{localStorage.setItem(key,w)}catch(e){}} };
    try{const s=+localStorage.getItem(key); if(s && !narrow()) set(s,false);}catch(e){}
    let on=false,x0=0,w0=0;
    b.addEventListener('pointerdown',e=>{ if(narrow()) return; on=true; x0=e.clientX; w0=g.getBoundingClientRect().width; b.setPointerCapture(e.pointerId); e.preventDefault(); e.stopPropagation(); });
    b.addEventListener('pointermove',e=>{ if(on) set(w0+(e.clientX-x0),false); });
    b.addEventListener('pointerup',()=>{ if(on){ on=false; set(g.getBoundingClientRect().width,true); } });
    b.addEventListener('dblclick',()=>{ g.style.flexBasis=''; g.classList.remove('sized'); try{localStorage.removeItem(key)}catch(e){} });
    b.addEventListener('keydown',e=>{ const w=g.getBoundingClientRect().width; if(e.key==='ArrowRight'){set(w+40,true);e.preventDefault();} if(e.key==='ArrowLeft'){set(w-40,true);e.preventDefault();} });
  });
}
(function waitGroups(n){ if(document.querySelector('#projects>.group')) initGroupResize(); else if(n<100) setTimeout(()=>waitGroups(n+1),100); })(0);

