/* Small shared helpers for all three pages: escaping, dates, sheets, toasts, QR codes, map loader. */
import { CATEGORIES } from './engine.js';
import { logoSrc } from './api.js';

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

export function openSheet(html, { wide = false, onClose } = {}) {
  closeSheet(true);
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  scrim.id = 'sheet-scrim';
  scrim.innerHTML = `<div class="sheet${wide ? ' wide' : ''}" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
  const close = () => closeSheet();
  scrim.addEventListener('click', (e) => {
    if (e.target === scrim || e.target.closest('[data-close]')) close();
  });
  scrim._onClose = onClose;
  document.body.appendChild(scrim);
  document.body.style.overflow = 'hidden';
  return scrim.querySelector('.sheet');
}
export function closeSheet(silent) {
  const s = document.getElementById('sheet-scrim');
  if (!s) return;
  s.remove();
  document.body.style.overflow = '';
  if (!silent && s._onClose) s._onClose();
}
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
