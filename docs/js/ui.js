/* Small shared helpers for all three pages: escaping, dates, sheets, toasts, QR codes, map loader. */
import { CATEGORIES } from './engine.js';
import { logoSrc } from './api.js';
import { icon } from './icons.js';
import { setSheetHook, skipNextPop } from './nav.js';

export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const catLabel = (id) => (CATEGORIES.find((c) => c.id === id) || { label: id }).label;
export const catEmoji = (id) => (CATEGORIES.find((c) => c.id === id) || { emoji: '📍' }).emoji;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function fmtDate(ms) {
  if (!ms) return '—';
  const d = new Date(ms);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}
export function fmtDateTime(ms) {
  if (!ms) return '—';
  const d = new Date(ms);
  let h = d.getHours();
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${fmtDate(ms)}, ${h}:${String(d.getMinutes()).padStart(2, '0')} ${ap}`;
}
export function ago(ms, now = Date.now()) {
  if (!ms) return 'never';
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  return d < 31 ? `${d} day${d === 1 ? '' : 's'} ago` : fmtDate(ms);
}
export function timeLeft(ms, now = Date.now()) {
  const s = ms - now;
  if (s <= 0) return 'Ended';
  const h = Math.floor(s / 36e5);
  if (h < 1) return 'Ends in under an hour';
  if (h < 48) return `Ends in ${h} hr`;
  return `Ends in ${Math.floor(h / 24)} days`;
}
export const pct = (x) => `${Math.round(x * 100)}%`;
export const money = (n) => '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
export const dateInput = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
/** Local midnight (or now, if today) for a yyyy-mm-dd string. */
export const fromDateInput = (s, endOfDay) => {
  if (!s) return undefined;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, endOfDay ? 23 : 0, endOfDay ? 59 : 0, 0).getTime();
};

export function milesLabel(mi) {
  if (mi == null) return '';
  if (mi < 0.1) return 'Right here';
  return mi < 10 ? `${mi.toFixed(1)} mi` : `${Math.round(mi)} mi`;
}

// ---------------------------------------------------------------- toast + sheet

let toastTimer;
export function toast(msg, kind = 'ok', pageLevel = false) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.setAttribute('role', 'status');
    document.body.appendChild(t);
  }
  t.className = 'toast' + (kind === 'bad' ? ' bad' : '') + (pageLevel ? ' page' : '');
  t.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 3800);
}

// Pop-up sheets add ONE history entry, so the Back button closes the sheet before it leaves the screen.
let sheetEntry = false;
let pendingBack = null;
function removeSheetDom() {
  const s = document.getElementById('sheet-scrim');
  if (s) { s.remove(); document.body.style.overflow = ''; }
  return s;
}
export function openSheet(html, { wide = false, onClose } = {}) {
  removeSheetDom();
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  scrim.id = 'sheet-scrim';
  scrim.innerHTML = `<div class="sheet${wide ? ' wide' : ''}" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
  scrim.addEventListener('click', (e) => {
    if (e.target === scrim || e.target.closest('[data-close]')) closeSheet();
  });
  scrim._onClose = onClose;
  if (pendingBack) { clearTimeout(pendingBack); pendingBack = null; } // swapping one sheet for another: keep the entry
  else if (!sheetEntry) {
    try { history.pushState({ ...(history.state && history.state.lh ? history.state : { lh: 1 }), sheet: 1 }, ''); } catch { /* ignore */ }
    sheetEntry = true;
  }
  document.body.appendChild(scrim);
  document.body.style.overflow = 'hidden';
  return scrim.querySelector('.sheet');
}
export function closeSheet(silent) {
  const s = removeSheetDom();
  if (!s) return;
  if (!silent && s._onClose) s._onClose();
  if (sheetEntry && !pendingBack) {
    // wait one tick: if a new sheet opens right away it reuses the history entry
    pendingBack = setTimeout(() => {
      pendingBack = null;
      if (sheetEntry) { sheetEntry = false; skipNextPop(); history.back(); }
    }, 0);
  }
}
setSheetHook(() => {
  const s = removeSheetDom();
  if (pendingBack) { clearTimeout(pendingBack); pendingBack = null; }
  const had = !!s || sheetEntry;
  sheetEntry = false;
  if (s && s._onClose) s._onClose();
  return had;
}, () => {
  // a new screen is about to be shown: reuse the sheet's history entry
  removeSheetDom();
  if (pendingBack) { clearTimeout(pendingBack); pendingBack = null; }
  const had = sheetEntry;
  sheetEntry = false;
  return had;
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeSheet();
});

export function confirmSheet(title, body, okLabel, danger) {
  return new Promise((resolve) => {
    const el = openSheet(`<h2>${esc(title)}</h2><p class="muted mt">${esc(body)}</p>
      <div class="row mt-lg"><button class="btn grow" data-no>Cancel</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'} grow" data-yes>${esc(okLabel)}</button></div>`, {
      onClose: () => resolve(false),
    });
    el.querySelector('[data-no]').onclick = () => { closeSheet(true); resolve(false); };
    el.querySelector('[data-yes]').onclick = () => { closeSheet(true); resolve(true); };
  });
}

// ---------------------------------------------------------------- external libraries (loaded only when needed)

const loaded = {};
export function loadScript(url) {
  if (!loaded[url]) {
    loaded[url] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = url;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Could not load ' + url));
      document.head.appendChild(s);
    });
  }
  return loaded[url];
}
export function loadStyle(url) {
  if (loaded[url]) return;
  loaded[url] = true;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = url;
  document.head.appendChild(l);
}

/** Returns an <svg> string for a QR code, or a plain-text fallback if the QR library cannot load (offline). */
export async function qrSvg(text) {
  try {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js');
    const qr = window.qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    return `<svg viewBox="-2 -2 ${n + 4} ${n + 4}" shape-rendering="crispEdges" role="img" aria-label="QR code"><path d="${d}" fill="#000"/></svg>`;
  } catch {
    return `<div style="text-align:center;font-size:13px;color:#333">QR code needs an internet connection.<br>Show the code below instead.</div>`;
  }
}

export async function loadLeaflet() {
  loadStyle('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');
  await loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js');
  return window.L;
}

export function registerServiceWorker() {
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

export function getBrowserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Your browser cannot share its location.'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => reject(new Error('We could not get your location. Check that location access is allowed for this site.')),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  });
}

/** Wrap a button action: disables the button while it runs and shows errors as a toast. */
export async function guard(btn, fn) {
  if (btn) btn.disabled = true;
  try {
    return await fn();
  } catch (e) {
    toast(e.message || 'Something went wrong.', 'bad');
  } finally {
    if (btn) btn.disabled = false;
  }
}

/** Business logo (Pro, uploaded) or the LocalHints logo (everyone else). */
export function avatar(biz, size) {
  const src = logoSrc(biz);
  const style = size ? ` style="width:${size}px;height:${size}px"` : '';
  return `<div class="avatar"${style}><img src="${esc(src || 'icon.svg')}" alt="${src ? esc(biz.name) + ' logo' : 'LocalHints'}"></div>`;
}

// ---------------------------------------------------------------- light / dark mode

export const getTheme = () => { try { return localStorage.getItem('lh:theme') || 'auto'; } catch { return 'auto'; } };
export function applyTheme(mode) {
  try { mode === 'light' || mode === 'dark' ? localStorage.setItem('lh:theme', mode) : localStorage.removeItem('lh:theme'); } catch { /* storage blocked */ }
  const el = document.documentElement;
  if (mode === 'light' || mode === 'dark') el.setAttribute('data-theme', mode); else el.removeAttribute('data-theme');
  const dark = mode === 'dark' || (mode !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute('content', dark ? '#0e1110' : '#0d9488');
  document.dispatchEvent(new CustomEvent('lh:theme'));
}
applyTheme(getTheme());

// ---------------------------------------------------------------- add to home screen

let deferredInstall = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; });
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

/** Small icon button for the top bar. Hidden when the page is already installed. */
export const installButtonHtml = () => (isStandalone() ? '' : `<button class="iconbtn" id="installBtn" aria-label="Add this page to your home screen" title="Add to home screen">${icon('install')}</button>`);
export const settingsButtonHtml = () => `<button class="iconbtn" id="settingsBtn" aria-label="Settings" title="Settings">${icon('settings')}</button>`;

export async function installFlow(pageName) {
  if (deferredInstall) {
    try { deferredInstall.prompt(); await deferredInstall.userChoice; } catch { /* dismissed */ }
    deferredInstall = null;
    return;
  }
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/.test(ua);
  let steps;
  if (ios) steps = ['Tap the <b>Share</b> button (the square with an arrow) at the bottom or top of Safari.', 'Scroll down and tap <b>Add to Home Screen</b>.', 'Tap <b>Add</b>. The icon appears on your home screen.'];
  else if (android) steps = ['Tap the <b>⋮ menu</b> at the top right of Chrome.', 'Tap <b>Add to Home screen</b> (or <b>Install app</b>).', 'Tap <b>Add</b>. The icon appears on your home screen.'];
  else if (/Safari/.test(ua) && !/Chrome|Chromium|Edg/.test(ua)) steps = ['In the menu bar choose <b>File → Add to Dock</b>.', 'Click <b>Add</b>.'];
  else steps = ['Look for the <b>install icon</b> at the right end of the address bar and click it.', 'Or open the browser menu and choose <b>Install</b> or <b>Save and share → Install page as app</b>.', 'This creates a desktop shortcut that opens straight to this page.'];
  openSheet(`<h2>Add ${esc(pageName)} to your home screen</h2>
    <p class="muted mt">Get a one-tap icon that opens this page, just like an app.</p>
    <ol class="steps mt-lg">${steps.map((x) => `<li>${x}</li>`).join('')}</ol>
    <button class="btn btn-block mt-lg" data-close>Got it</button>`);
}

/** Opens the Settings sheet (light / dark mode, add to home screen). */
export function settingsSheet(pageName) {
  const cur = getTheme();
  const el = openSheet(`<h2>Settings</h2>
    <h3 class="section-title">Appearance</h3>
    <div class="seg" role="radiogroup" aria-label="Light or dark mode">
      ${[['light', 'Light'], ['dark', 'Dark'], ['auto', 'Automatic']].map(([v, l]) => `<button role="radio" aria-checked="${cur === v}" aria-selected="${cur === v}" data-theme-set="${v}">${l}</button>`).join('')}
    </div>
    <p class="hint">Automatic follows your phone or computer setting.</p>
    ${isStandalone() ? '' : `<h3 class="section-title">Home screen</h3><button class="btn btn-block" id="setInstall">${icon('install', 20)} Add ${esc(pageName)} to home screen</button>`}
    <button class="btn btn-block mt-lg" data-close>Done</button>`);
  el.querySelectorAll('[data-theme-set]').forEach((b) => (b.onclick = () => {
    applyTheme(b.dataset.themeSet);
    el.querySelectorAll('[data-theme-set]').forEach((x) => { const on = x === b; x.setAttribute('aria-checked', String(on)); x.setAttribute('aria-selected', String(on)); });
  }));
  const i = el.querySelector('#setInstall');
  if (i) i.onclick = () => installFlow(pageName);
}

/** Wire the install and settings buttons that installButtonHtml() / settingsButtonHtml() put in a page. */
export function bindChrome(scope, pageName) {
  const i = scope.querySelector('#installBtn');
  if (i) i.onclick = () => installFlow(pageName);
  const g = scope.querySelector('#settingsBtn');
  if (g) g.onclick = () => settingsSheet(pageName);
}

export { icon };

// ---------------------------------------------------------------- emoji picker (a small set, plus "type or paste any emoji")

const EMOJI_SETS = [
  ['Food & drink', '🍕🍔🌮🌯🥪🍜🍝🍣🍱🥗🍗🥩🍟🌭🥞🧇🍳🥐🥖🧀🍰🧁🍩🍪🍫🍦🍨🍧🍿☕🍵🧋🥤🍺🍷🍸🍹🥂'],
  ['Shops & services', '🛍️👗👠👜🧢👓💍🎁📚🛒💐🌸🪴🐶🐱🐾🧸🎨🖼️🔧🛠️🔨🧰🚗🛞⛽🧼🧺👔✂️💈💅💆💇'],
  ['Health & fitness', '💪🏋️🧘🏃🚴⚽🏀🎾🏊🥊🩺💊🦷👁️🧠❤️🌿🥦🍎'],
  ['Fun & places', '🎬🎭🎤🎧🎮🎳🎯🎪🎡🎢🏖️⛺🏨🛏️🏠🏪🏛️⛪🎓💻📱📷🎵🎶'],
  ['Symbols', '⭐🌟✨🔥💎🏆🎉🎈💡🔔📍🏷️💯✅💚💙💜🧡💛'],
];
export const emojiFieldHtml = (value = '', label = 'Icon') => `<div class="field"><span class="lbl">${esc(label)} (one emoji, shown on the map)</span>
  <div class="row"><input class="input" name="emoji" value="${esc(value)}" maxlength="16" style="width:90px;font-size:24px;text-align:center" aria-label="Icon emoji" autocomplete="off"><button type="button" class="btn btn-sm" data-emoji-pick>Choose an emoji</button></div>
  <div class="hint">Any emoji works. You can also type or paste one: use the emoji key on your phone keyboard, <b>Win + .</b> on Windows, or <b>Ctrl + Cmd + Space</b> on a Mac.</div></div>`;
export function bindEmoji(scope) {
  const input = scope.querySelector('[name=emoji]');
  const btn = scope.querySelector('[data-emoji-pick]');
  if (!input || !btn) return;
  btn.onclick = () => {
    // shown inline (not as another sheet) so the form you are filling in stays open
    let panel = scope.querySelector('.emojipanel');
    if (panel) return panel.remove();
    panel = document.createElement('div');
    panel.className = 'card flat emojipanel mt';
    panel.style.maxHeight = '240px';
    panel.style.overflowY = 'auto';
    panel.innerHTML = EMOJI_SETS.map(([t, set]) => `<div class="small muted mt">${esc(t)}</div><div class="emojigrid">${Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(set)).map((x) => `<button type="button" data-e="${esc(x.segment)}" aria-label="${esc(x.segment)}">${esc(x.segment)}</button>`).join('')}</div>`).join('');
    btn.closest('.field').appendChild(panel);
    panel.onclick = (e) => { const b = e.target.closest('[data-e]'); if (b) { input.value = b.dataset.e; panel.remove(); } };
  };
}
