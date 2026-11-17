/*
 * api.js: the one place pages talk to the backend.
 *
 *   LH_CONFIG.API_BASE = ""                       -> DEMO mode: the engine runs in this browser (localStorage).
 *   LH_CONFIG.API_BASE = "https://x.workers.dev"  -> LIVE mode: requests go to your Cloudflare Worker.
 *
 * Pages call api.get / api.post and never care which mode is on.
 */
import { handle } from './engine.js';
import { buildSeed } from './seed.js';

const cfg = window.LH_CONFIG || {};
const base = (cfg.API_BASE || '').replace(/\/+$/, '');
export const MODE = base ? 'live' : 'demo';

const STATE_KEY = 'lh:state:v1';
const blobKey = (k) => 'lh:blob:' + k;

const localStore = {
  async load() {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  async save(s) {
    localStorage.setItem(STATE_KEY, JSON.stringify(s));
  },
  async getBlob(k) {
    return localStorage.getItem(blobKey(k));
  },
  async putBlob(k, v) {
    if (v) localStorage.setItem(blobKey(k), v);
    else localStorage.removeItem(blobKey(k));
  },
};

async function local(method, path, query, body, token) {
  const r = await handle(
    { store: localStore, env: {}, demo: true, seed: buildSeed, autoSeed: true, fetch: null, origin: location.origin, siteBase: location.origin + location.pathname.replace(/[^/]*$/, '') },
    { method, path, query, body, headers: token ? { authorization: 'Bearer ' + token } : {}, ip: 'browser' },
  );
  return r;
}

async function remote(method, path, query, body, token) {
  const qs = Object.keys(query || {}).filter((k) => query[k] !== '' && query[k] != null).map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(query[k])).join('&');
  const res = await fetch(base + path + (qs ? '?' + qs : ''), {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch { /* empty body */ }
  return { status: res.status, body: data };
}

async function request(method, path, { query, body, token } = {}) {
  let r;
  try {
    r = MODE === 'live' ? await remote(method, path, query, body, token) : await local(method, path, query, body, token);
  } catch (e) {
    throw new ApiError('We could not reach the server. Check your connection and try again.', 0, {});
  }
  if (r.status >= 400) throw new ApiError((r.body && r.body.error) || 'Something went wrong.', r.status, r.body || {});
  return r.body;
}

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export const api = {
  get: (path, query, token) => request('GET', path, { query, token }),
  post: (path, body, token) => request('POST', path, { body: body || {}, token }),
};

/** Where to load a business logo from (or null). Demo logos live in localStorage. */
export function logoSrc(biz) {
  if (!biz || !biz.hasLogo) return null;
  if (MODE === 'live') return `${base}/api/logo/${biz.id}?v=${biz.logoV}`;
  return localStorage.getItem(blobKey('logo:' + biz.id));
}

/** Anonymous shopper id kept on this device. */
export function consumerId() {
  try {
    let id = localStorage.getItem('lh:consumer');
    if (!id) {
      id = 'c-' + crypto.randomUUID();
      localStorage.setItem('lh:consumer', id);
    }
    return id;
  } catch {
    return 'c-session';
  }
}
