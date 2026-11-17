/* Shopper side (index.html): discover, map, Main Street Loop, wallet, alerts. */
import { api, MODE, consumerId, ApiError } from './api.js';
import { CATEGORIES, DEMO_CENTER } from './engine.js';
import {
  esc, toast, openSheet, closeSheet, qrSvg, loadLeaflet, registerServiceWorker, getBrowserLocation, guard,
  milesLabel, timeLeft, fmtDate, ago, avatar, catEmoji, icon, installButtonHtml, settingsButtonHtml, bindChrome,
} from './ui.js';
import { initNav, navigate } from './nav.js';

const CID = consumerId();
const S = {
  tab: 'discover', deals: [], tips: [], passes: [], alerts: [], notify: false, health: null,
  cat: '', q: '', radius: '0', pos: loadPos(), loading: true, map: null, seen: +(safe('lh:alerts-seen') || 0),
};
function safe(k, v) {
  try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { /* storage blocked */ }
  return null;
}
function loadPos() {
  try { return JSON.parse(localStorage.getItem('lh:pos') || 'null'); } catch { return null; }
}
const root = document.getElementById('app');

// ---------------------------------------------------------------- data

async function loadDeals() {
  const q = S.pos ? { lat: S.pos.lat, lng: S.pos.lng } : {};
  const r = await api.get('/api/deals', q);
  S.deals = r.deals;
  S.tips = r.tips;
}
async function loadPasses() {
  S.passes = (await api.get('/api/passes', { consumerId: CID })).passes;
}
async function loadAlerts() {
  const r = await api.get('/api/alerts', { consumerId: CID });
  S.alerts = r.alerts;
  S.notify = r.notify;
}
const unseen = () => S.alerts.filter((a) => a.at > S.seen).length;

// ---------------------------------------------------------------- shell

const NAV = [['discover', 'home', 'Discover'], ['map', 'map', 'Map'], ['loop', 'loop', 'Loop'], ['wallet', 'wallet', 'Wallet'], ['alerts', 'bell', 'Alerts']];
function shell() {
  root.className = 'app-shell';
  root.innerHTML = `
    ${MODE === 'demo' ? '<div class="banner">Demo mode: sample shops, and everything you do stays in this browser.</div>' : ''}
    <header class="topbar"><div class="topbar-in">
      <a class="brand" href="index.html"><img src="icon.svg" alt="">LocalHints</a>
      <span class="grow"></span>
      ${installButtonHtml()}
      <button class="btn btn-sm" id="locBtn" aria-label="Change location">${icon('pin', 16)} ${esc(S.pos ? S.pos.label : 'Set location')}</button>
      ${settingsButtonHtml()}
      <a class="btn btn-sm only-desktop" href="business.html">For business</a>
    </div></header>
    <div class="scroller${S.tab === 'map' ? ' fit' : ''}" id="scroller"><main class="page" id="view"></main></div>
    <nav class="nav" aria-label="Main"><div class="nav-in">
      ${NAV.map(([id, ico, label]) => `<button data-tab="${id}" ${S.tab === id ? 'aria-current="page"' : ''}><span class="ico">${icon(ico, 24)}</span>${label}${id === 'alerts' && unseen() ? `<span class="dot">${unseen()}</span>` : ''}</button>`).join('')}
    </div></nav>`;
  root.querySelector('#locBtn').onclick = locationSheet;
  bindChrome(root, 'LocalHints');
  root.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => go(b.dataset.tab)));
  render();
}
/** Tap on a nav button: remembered in history so the Back button returns to the previous screen. */
function go(tab) {
  if (tab === S.tab) { document.getElementById('scroller').scrollTop = 0; return; }
  navigate({ tab });
}
function show(tab) {
  S.tab = tab || 'discover';
  if (S.tab === 'alerts') {
    S.seen = Date.now();
    safe('lh:alerts-seen', String(S.seen));
  }
  shell();
  if (S.tab === 'wallet') loadPasses().then(() => S.tab === 'wallet' && render());
  if (S.tab === 'alerts') loadAlerts().then(() => S.tab === 'alerts' && render());
}
function render() {
  const v = document.getElementById('view');
  if (S.loading) return (v.innerHTML = '<div class="spinner">Loading deals…</div>');
  destroyMap();
  ({ discover: renderDiscover, map: renderMap, loop: renderLoop, wallet: renderWallet, alerts: renderAlerts })[S.tab](v);
}

// ---------------------------------------------------------------- discover

function filtered() {
  const q = S.q.trim().toLowerCase();
  return S.deals.filter((d) => {
    if (S.cat && d.biz.category !== S.cat) return false;
    if (q && !(d.title + ' ' + d.biz.name + ' ' + d.description).toLowerCase().includes(q)) return false;
    if (S.pos && +S.radius > 0 && d.distance > +S.radius) return false;
    return true;
  });
}
function dealCard(d) {
  return `<button class="deal" data-deal="${esc(d.id)}">
    ${avatar(d.biz)}
    <div class="grow">
      <span class="tag" style="background:${esc(d.color)}">${esc(d.label)}</span>
      <h3>${esc(d.title)}</h3>
      <div class="muted small">${catEmoji(d.biz.category)} ${esc(d.biz.name)}${d.distance != null ? ' · ' + milesLabel(d.distance) : ''} · ${esc(timeLeft(d.endsAt))}</div>
      ${d.loop ? `<span class="loop-tag">🔁 Then ${esc(d.loop.rewardText)} at ${esc(d.loop.partner.name)}</span>` : ''}
      ${d.stamps > 1 ? `<span class="loop-tag">🎟️ ${d.stamps}-stamp card</span>` : ''}
      ${d.soldOut ? '<span class="badge b-bad">All spots taken</span>' : ''}
    </div></button>`;
}
function filterBar() {
  return `<div class="stack">
    <input class="input" id="q" type="search" placeholder="Search deals and shops" value="${esc(S.q)}" aria-label="Search">
    <div class="chips" role="group" aria-label="Category">
      <button class="chip" aria-pressed="${!S.cat}" data-cat="">All</button>
      ${CATEGORIES.map((c) => `<button class="chip" aria-pressed="${S.cat === c.id}" data-cat="${c.id}">${c.emoji} ${esc(c.label)}</button>`).join('')}
    </div>
    ${S.pos ? `<label class="row small muted">Show deals within
      <select class="input" id="radius" style="width:auto;min-height:36px;padding:4px 10px">
        ${[['0', 'any distance'], ['1', '1 mile'], ['3', '3 miles'], ['10', '10 miles'], ['25', '25 miles']].map(([v, l]) => `<option value="${v}" ${S.radius === v ? 'selected' : ''}>${l}</option>`).join('')}
      </select></label>` : ''}
  </div>`;
}
function bindFilters(v) {
  const q = v.querySelector('#q');
  if (q) q.oninput = () => { S.q = q.value; refreshList(); };
  v.querySelectorAll('[data-cat]').forEach((b) => (b.onclick = () => { S.cat = b.dataset.cat; v.querySelectorAll('[data-cat]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); refreshList(); }));
  const r = v.querySelector('#radius');
  if (r) r.onchange = () => { S.radius = r.value; refreshList(); };
}
function listHtml() {
  const list = filtered();
  if (!list.length) return `<div class="empty"><div class="big">🔎</div><p>No deals match right now.</p>${S.cat || S.q || +S.radius ? '<button class="btn mt" id="clear">Clear filters</button>' : ''}</div>`;
  return list.map(dealCard).join('');
}
function bindList(v) {
  v.querySelectorAll('[data-deal]').forEach((b) => (b.onclick = () => showDeal(b.dataset.deal)));
  const c = v.querySelector('#clear');
  if (c) c.onclick = () => { S.cat = ''; S.q = ''; S.radius = '0'; renderDiscover(document.getElementById('view')); };
}
function refreshList() {
  const el = document.getElementById('list');
  if (!el) return;
  el.innerHTML = listHtml();
  bindList(el);
  if (S.map) drawPins();
}
function renderDiscover(v) {
  v.innerHTML = `<div class="hero"><h1>Deals near you</h1><p class="muted">Save a deal to your phone wallet and show it at the counter.</p></div>
    <div class="discover with-map mt">
      <div class="stack">${filterBar()}<div id="list" class="stack">${listHtml()}</div>
        ${S.tips.length ? `<h3 class="section-title">Spotted by neighbors</h3>${S.tips.map((t) => `<div class="card flat small"><b>${esc(t.name)}</b>${t.address ? ' · ' + esc(t.address) : ''}<div class="muted">${esc(t.note)}</div><div class="tiny muted mt">Spotted by <b>${esc(t.spotter)}</b> · ${esc(ago(t.spottedAt))}</div></div>`).join('')}` : ''}
        <button class="btn btn-block" id="tipBtn">💡 Spot a deal we missed</button>
      </div>
      <div class="only-desktop"><div id="map"></div></div>
    </div>`;
  bindFilters(v);
  bindList(v);
  v.querySelector('#tipBtn').onclick = tipSheet;
  if (window.matchMedia('(min-width: 900px)').matches) initMap();
}

// ---------------------------------------------------------------- map

function destroyMap() {
  if (S.map) { S.map.remove(); S.map = null; S.layer = null; }
}
function renderMap(v) {
  v.innerHTML = `<div class="row between"><h1>Deal map</h1><span class="small muted">Tap a pin for details</span></div><div class="mt">${filterBar()}</div><div id="map" class="mt"></div>`;
  bindFilters(v);
  initMap();
}
async function initMap() {
  const el = document.getElementById('map');
  if (!el) return;
  let L;
  try { L = await loadLeaflet(); } catch {
    el.innerHTML = '<div class="map-fallback">The map needs an internet connection to load. The list view still works.</div>';
    return;
  }
  if (!document.getElementById('map') || S.map) return;
  const center = S.pos || (S.deals[0] ? { lat: S.deals[0].biz.lat, lng: S.deals[0].biz.lng } : DEMO_CENTER);
  S.map = L.map(el, { zoomControl: true }).setView([center.lat, center.lng], 14);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19, attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
  }).addTo(S.map);
  S.layer = L.layerGroup().addTo(S.map);
  drawPins(true);
}
function drawPins(fit) {
  const L = window.L;
  if (!S.map || !L) return;
  S.layer.clearLayers();
  const pts = [];
  const byBiz = new Map();
  for (const d of filtered()) (byBiz.get(d.biz.id) || byBiz.set(d.biz.id, []).get(d.biz.id)).push(d);
  for (const [, ds] of byBiz) {
    const b = ds[0].biz;
    const icon = L.divIcon({
      className: '', iconSize: [44, 44], iconAnchor: [22, 44],
      html: `<div style="width:44px;height:44px;border-radius:50% 50% 50% 4px;transform:rotate(-45deg);background:${esc(ds[0].color)};box-shadow:0 2px 8px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;border:2px solid #fff"><span style="transform:rotate(45deg);font-size:20px">${esc(b.emoji)}</span></div>`,
    });
    const m = L.marker([b.lat, b.lng], { icon }).addTo(S.layer);
    const popup = (where) => `<b>${esc(b.name)}</b>${where ? ' · ' + esc(where) : ''}<br>${ds.map((d) => `<a href="#" data-popdeal="${esc(d.id)}">${esc(d.label)}: ${esc(d.title)}</a>`).join('<br>')}`;
    m.bindPopup(popup(b.locations && b.locations.length ? 'Main location' : ''));
    pts.push([b.lat, b.lng]);
    for (const loc of b.locations || []) {
      L.marker([loc.lat, loc.lng], { icon }).addTo(S.layer).bindPopup(popup(loc.name));
      pts.push([loc.lat, loc.lng]);
    }
  }
  if (S.pos) {
    L.circleMarker([S.pos.lat, S.pos.lng], { radius: 8, color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }).addTo(S.layer).bindTooltip('You are here');
    pts.push([S.pos.lat, S.pos.lng]);
  }
  if (fit && pts.length) S.map.fitBounds(pts, { padding: [40, 40], maxZoom: 16 });
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-popdeal]');
  if (a) { e.preventDefault(); showDeal(a.dataset.popdeal); }
});

// ---------------------------------------------------------------- Main Street Loop

function renderLoop(v) {
  const loops = S.deals.filter((d) => d.loop);
  v.innerHTML = `<h1>Main Street Loop</h1><p class="muted mt">Neighbors who team up. Redeem at one shop and unlock a reward at the next.</p>
    <div class="stack mt-lg">${loops.length ? loops.map((d) => `
      <div class="card stack">
        <div class="row"><div class="grow"><div class="small muted">Step 1: ${esc(d.biz.name)}</div><h3>${esc(d.label)}: ${esc(d.title)}</h3></div>${avatar(d.biz, 44)}</div>
        <div class="center" style="font-size:22px">⬇️</div>
        <div class="row"><div class="grow"><div class="small muted">Step 2: ${esc(d.loop.partner.name)}</div><h3>${esc(d.loop.rewardText)}</h3></div>${avatar(d.loop.partner, 44)}</div>
        <button class="btn btn-primary btn-block" data-deal="${esc(d.id)}">Start the loop</button>
      </div>`).join('') : '<div class="empty"><div class="big">🔁</div><p>No loops yet. Neighbor shops will team up here soon.</p></div>'}</div>`;
  v.querySelectorAll('[data-deal]').forEach((b) => (b.onclick = () => showDeal(b.dataset.deal)));
}

// ---------------------------------------------------------------- deal + pass sheets

function dealBody(d) {
  const maps = `https://www.google.com/maps/dir/?api=1&destination=${d.biz.lat},${d.biz.lng}`;
  return `<div class="row">${avatar(d.biz)}<div class="grow"><h2>${esc(d.biz.name)}</h2><div class="muted small">${esc(d.biz.address)}</div></div></div>
    <div class="card flat mt-lg" style="border-color:${esc(d.color)}">
      <span class="tag" style="display:inline-block;background:${esc(d.color)};color:#fff;font-weight:800;padding:3px 10px;border-radius:8px">${esc(d.label)}</span>
      <h2 class="mt">${esc(d.title)}</h2>
      ${d.description ? `<p class="muted mt">${esc(d.description)}</p>` : ''}
      ${d.itemText ? `<p class="mt"><b>${esc(d.itemText)}</b></p>` : ''}
      <ul class="small muted" style="padding-left:18px;margin:12px 0 0">
        <li>${esc(timeLeft(d.endsAt))} (until ${esc(fmtDate(d.endsAt))})</li>
        ${d.minSpend ? `<li>Minimum spend $${esc(d.minSpend)}</li>` : ''}
        ${d.stamps > 1 ? `<li>Punch card: collect ${d.stamps} stamps</li>` : ''}
        ${d.upgrade ? `<li>Share with ${d.upgrade.friendsNeeded} friend${d.upgrade.friendsNeeded > 1 ? 's' : ''} to upgrade to ${d.type === 'percent' ? d.upgrade.upgradedValue + '%' : '$' + d.upgrade.upgradedValue} off</li>` : ''}
        ${d.spotsLeft != null ? `<li>${d.spotsLeft} spots left</li>` : ''}
      </ul>
    </div>
    ${d.loop ? `<div class="loop-tag mt">🔁 Redeem this, then get ${esc(d.loop.rewardText)} at ${esc(d.loop.partner.name)}</div>` : ''}`;
}
async function showDeal(id, note) {
  const d = S.deals.find((x) => x.id === id);
  if (!d) return toast('That deal is no longer available.', 'bad');
  api.post('/api/view', { dealId: id }).catch(() => {});
  const mine = S.passes.find((p) => p.deal && p.deal.id === id);
  const el = openSheet(`${note ? `<div class="okmsg mb">${esc(note)}</div>` : ''}${dealBody(d)}
    <a class="btn btn-block mt" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${d.biz.lat},${d.biz.lng}">🧭 Directions</a>
    <button class="btn btn-primary btn-block mt" id="claim" ${d.soldOut && !mine ? 'disabled' : ''}>${mine ? 'View my pass' : d.soldOut ? 'All spots taken' : '👛 Add to wallet'}</button>`);
  el.querySelector('#claim').onclick = (e) => guard(e.currentTarget, async () => {
    if (mine) return showPass(mine.id);
    const ref = safe('lh:ref:' + id) || '';
    const r = await api.post('/api/claim', { dealId: id, consumerId: CID, ref });
    await loadPasses();
    toast(r.already ? 'You already have this pass.' : 'Saved to your wallet!');
    showPass(r.pass.id);
  });
}

const STATUS = {
  active: ['Ready to use', 'b-good'], scheduled: ['Starts soon', 'b-warn'], paused: ['Paused by the shop', 'b-warn'],
  complete: ['Used', ''], expired: ['Expired', ''], ended: ['Offer ended', 'b-bad'], suspended: ['Unavailable', 'b-bad'],
};
async function showPass(id) {
  await loadPasses();
  const p = S.passes.find((x) => x.id === id);
  if (!p) return;
  const live = p.status === 'active';
  const color = p.deal ? p.deal.color : '#0d9488';
  const title = p.deal ? p.deal.title : 'Loop reward';
  const stamps = p.stampsNeeded > 1
    ? `<div class="stamps">${Array.from({ length: p.stampsNeeded }, (_, i) => `<div class="stamp ${i < p.stamps ? 'on' : ''}">${i < p.stamps ? '✓' : ''}</div>`).join('')}</div>` : '';
  const share = p.kind === 'deal' && p.deal && p.deal.upgrade
    ? `<div class="card flat mt"><b>${p.upgraded ? '🎉 Upgraded!' : 'Share to upgrade'}</b>
        <p class="small muted mt">${p.upgraded ? `Your pass is now ${esc(p.label)}.` : `${p.friendSaves} of ${p.deal.upgrade.friendsNeeded} friends saved this. When they do, your pass upgrades automatically.`}</p>
        ${p.upgraded ? '' : '<button class="btn btn-block mt" id="share">📤 Share with friends</button>'}</div>` : '';
  const el = openSheet(`
    <div class="pass ${live ? '' : 'dim'}" style="--passcolor:${esc(color)}">
      <div class="row between"><div class="lh-mark" style="color:#fff;opacity:.85"><img src="icon.svg" alt="">LocalHints</div><span class="badge ${STATUS[p.status][1]}">${STATUS[p.status][0]}</span></div>
      <div class="small mt" style="opacity:.9">${esc(p.biz.name)}</div>
      <div class="big">${esc(p.label)}</div>
      <div style="opacity:.9">${esc(title)}</div>
      ${p.loop ? `<div class="small mt" style="opacity:.9">Earned at ${esc(p.loop.from ? p.loop.from.name : 'a neighbor')}. Valid until ${esc(fmtDate(p.expiresAt))}.</div>` : `<div class="small mt" style="opacity:.9">${esc(timeLeft(p.expiresAt))}</div>`}
      ${stamps}
      <div class="qr" id="qr"></div>
      <div class="code">${esc(p.code)}</div>
      <div class="center small mt" style="opacity:.85">Show this at the counter</div>
    </div>
    ${share}
    <div class="walletbtns">
      <button class="wbtn" data-wallet="apple">🍎 Apple Wallet</button>
      <button class="wbtn" data-wallet="google">🟢 Google Wallet</button>
    </div>
    <p class="hint center">${esc(p.biz.address)}</p>`);
  qrSvg('LH-' + p.code).then((svg) => { const q = el.querySelector('#qr'); if (q) q.innerHTML = svg; });
  el.querySelectorAll('[data-wallet]').forEach((b) => (b.onclick = () => guard(b, () => walletSheet(p, b.dataset.wallet))));
  const sh = el.querySelector('#share');
  if (sh) sh.onclick = () => sharePass(p);
}
async function sharePass(p) {
  const url = `${location.origin}${location.pathname.replace(/[^/]*$/, '')}index.html?deal=${encodeURIComponent(p.deal.id)}&ref=${encodeURIComponent(p.referralCode)}`;
  const text = `Save this deal at ${p.biz.name}: ${p.deal.title}`;
  try {
    if (navigator.share) return await navigator.share({ title: 'LocalHints deal', text, url });
    await navigator.clipboard.writeText(`${text} ${url}`);
    toast('Link copied. Send it to a friend!');
  } catch { /* share cancelled */ }
}
async function walletSheet(p, platform) {
  const r = await api.get(`/api/wallet/${platform}/${p.id}`, { consumerId: CID });
  if (r.saveUrl) { window.open(r.saveUrl, '_blank', 'noopener'); return; }
  const name = platform === 'apple' ? 'Apple Wallet' : 'Google Wallet';
  openSheet(`<h2>${name}</h2>
    <p class="muted mt">${platform === 'apple'
      ? 'Apple Wallet passes must be digitally signed by the LocalHints team, so this button is not live yet.'
      : 'Google Wallet is not connected on this server yet, so this button is not live yet.'} This is the pass data the button will use. It already includes the shop's location so your phone can show the pass when you are nearby.</p>
    <pre class="small" style="overflow:auto;background:var(--bg);padding:12px;border-radius:12px;max-height:40vh">${esc(JSON.stringify(r.payload, null, 2))}</pre>
    <button class="btn btn-block mt" data-close>Close</button>`, { wide: true });
}

// ---------------------------------------------------------------- wallet + alerts

function renderWallet(v) {
  const active = S.passes.filter((p) => ['active', 'scheduled', 'paused'].includes(p.status));
  const done = S.passes.filter((p) => !active.includes(p));
  const row = (p) => `<button class="deal" data-pass="${esc(p.id)}">${avatar(p.biz)}<div class="grow">
      <span class="tag" style="background:${esc(p.deal ? p.deal.color : '#0d9488')}">${esc(p.label)}</span>
      <h3>${esc(p.deal ? p.deal.title : 'Loop reward')}</h3>
      <div class="muted small">${esc(p.biz.name)} · <span class="badge ${STATUS[p.status][1]}">${STATUS[p.status][0]}</span>${p.stampsNeeded > 1 ? ` · ${p.stamps}/${p.stampsNeeded} stamps` : ''}</div></div></button>`;
  v.innerHTML = `<h1>My wallet</h1>
    <div class="stack mt-lg">
      ${S.passes.length ? '' : '<div class="empty"><div class="big">👛</div><p>Passes you save will show up here.</p><button class="btn btn-primary mt" id="find">Find deals</button></div>'}
      ${active.length ? `<h3 class="section-title">Ready to use</h3>${active.map(row).join('')}` : ''}
      ${done.length ? `<h3 class="section-title">History</h3>${done.map(row).join('')}` : ''}
    </div>`;
  v.querySelectorAll('[data-pass]').forEach((b) => (b.onclick = () => showPass(b.dataset.pass)));
  const f = v.querySelector('#find');
  if (f) f.onclick = () => go('discover');
}
function renderAlerts(v) {
  const icons = { drop: '📍', push: '📣', loop: '🔁', upgrade: '🎉', redeem: '✅' };
  v.innerHTML = `<h1>Alerts</h1>
    <div class="card mt-lg stack">
      <div class="row between"><div><h3>Nearby deal alerts</h3><p class="small muted">Hear about deals from shops near you.</p></div>
        <label class="check"><input type="checkbox" id="notify" ${S.notify ? 'checked' : ''}> ${S.notify ? 'On' : 'Off'}</label></div>
      <p class="hint">We only keep your approximate area (about 1 km), never your exact position, and you can turn this off any time.</p>
    </div>
    <div class="stack mt-lg">${S.alerts.length ? S.alerts.map((a) => `<div class="card flat"><div class="row"><span style="font-size:22px">${icons[a.kind] || '🔔'}</span><div class="grow"><b>${esc(a.title)}</b><div class="small">${esc(a.body)}</div><div class="tiny muted mt">${esc(ago(a.at))}</div></div>${a.dealId && S.deals.some((d) => d.id === a.dealId) ? `<button class="btn btn-sm" data-deal="${esc(a.dealId)}">View</button>` : ''}</div></div>`).join('') : '<div class="empty"><div class="big">🔔</div><p>No alerts yet.</p></div>'}</div>`;
  v.querySelectorAll('[data-deal]').forEach((b) => (b.onclick = () => showDeal(b.dataset.deal)));
  v.querySelector('#notify').onchange = (e) => guard(e.target, async () => {
    const on = e.target.checked;
    let pos = S.pos;
    if (on && !pos) pos = await askLocation();
    await api.post('/api/subscribe', { consumerId: CID, notify: on, lat: pos && pos.lat, lng: pos && pos.lng });
    S.notify = on;
    toast(on ? 'Nearby alerts are on.' : 'Nearby alerts are off.');
    render();
  }).then(() => { if (S.tab === 'alerts') render(); });
}

// ---------------------------------------------------------------- location + tips

async function askLocation() {
  const p = await getBrowserLocation();
  setPos({ ...p, label: 'My location' });
  return S.pos;
}
function setPos(p) {
  S.pos = p;
  safe('lh:pos', JSON.stringify(p));
}
function locationSheet() {
  const el = openSheet(`<h2>Where are you?</h2><p class="muted mt">We use this to sort deals by distance and show the map around you. It stays on your device.</p>
    <button class="btn btn-primary btn-block mt-lg" id="gps">📍 Use my current location</button>
    ${MODE === 'demo' ? '<button class="btn btn-block mt" id="demo">Use the demo neighborhood</button>' : ''}
    ${S.pos ? '<button class="btn btn-block mt" id="clearLoc">Clear my location</button>' : ''}`);
  const done = async () => { closeSheet(true); S.loading = true; shell(); await loadDeals(); S.loading = false; shell(); };
  el.querySelector('#gps').onclick = (e) => guard(e.currentTarget, async () => { setPos({ ...(await getBrowserLocation()), label: 'My location' }); await done(); });
  const d = el.querySelector('#demo');
  if (d) d.onclick = async () => { setPos({ ...DEMO_CENTER, label: 'Demo area' }); await done(); };
  const c = el.querySelector('#clearLoc');
  if (c) c.onclick = async () => { S.pos = null; safe('lh:pos', ''); try { localStorage.removeItem('lh:pos'); } catch { /* ignore */ } await done(); };
}
function tipSheet() {
  const me = safe('lh:spotter') || '';
  const el = openSheet(`<h2>Spot a deal</h2><p class="muted mt">Tell us about a local deal. We check it before showing it to neighbors, and neighbors see your first name next to it.</p>
    <form class="stack mt-lg" id="f">
      <label class="field"><span class="lbl">Your first name</span><input class="input" name="spotterName" required maxlength="40" autocomplete="given-name" value="${esc(me)}"></label>
      <label class="field"><span class="lbl">Business name</span><input class="input" name="name" required maxlength="60"></label>
      <label class="field"><span class="lbl">Address (optional)</span><input class="input" name="address" maxlength="120"></label>
      <label class="field"><span class="lbl">What is the deal?</span><textarea class="input" name="note" required maxlength="200"></textarea></label>
      <label class="field"><span class="lbl">Email or phone (optional)</span><input class="input" name="contact" maxlength="120" autocomplete="email"></label>
      <label class="check"><input type="checkbox" name="consent" value="1"> It is OK to share my name and this contact with the business, so they can say thanks and claim their listing.</label>
      <p class="hint">Never shown to other shoppers. Leave it blank to stay anonymous apart from your first name.</p>
      <div id="tipErr"></div>
      <button class="btn btn-primary btn-block">Send tip</button></form>`);
  el.querySelector('#f').onsubmit = (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    guard(e.target.querySelector('button'), async () => {
      try {
        await api.post('/api/tips', { ...f, consent: !!f.consent, consumerId: CID });
        safe('lh:spotter', f.spotterName);
        closeSheet(true);
        toast('Thanks! We will review it.');
      } catch (ex) { el.querySelector('#tipErr').innerHTML = `<div class="err" role="alert">${esc(ex.message)}</div>`; }
    });
  };
}

// ---------------------------------------------------------------- boot

async function boot() {
  registerServiceWorker();
  const startTab = ['discover', 'map', 'loop', 'wallet', 'alerts'].includes(new URLSearchParams(location.search).get('tab')) ? new URLSearchParams(location.search).get('tab') : 'discover';
  S.tab = startTab;
  initNav({ tab: startTab }, (st) => show(st.tab));
  shell();
  try {
    S.health = await api.get('/api/health');
    await Promise.all([loadDeals(), loadPasses(), loadAlerts()]);
  } catch (e) {
    root.querySelector('#view').innerHTML = `<div class="empty"><div class="big">📡</div><p>${esc(e.message)}</p><button class="btn mt" onclick="location.reload()">Try again</button></div>`;
    return;
  }
  S.loading = false;
  shell();
  const params = new URLSearchParams(location.search);
  const dealId = params.get('deal'), ref = params.get('ref');
  if (dealId && ref) safe('lh:ref:' + dealId, ref);
  if (dealId) showDeal(dealId, ref ? 'A friend shared this deal with you.' : undefined);
  setInterval(() => { if (!document.hidden) loadAlerts().then(() => { if (S.tab !== 'alerts') document.querySelectorAll('.nav .dot').forEach((n) => n.remove()); const b = document.querySelector('[data-tab="alerts"]'); if (b && unseen() && !b.querySelector('.dot')) b.insertAdjacentHTML('beforeend', `<span class="dot">${unseen()}</span>`); }).catch(() => {}); }, 45000);
}
boot();
