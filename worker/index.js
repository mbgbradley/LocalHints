/*
 * LocalHints Cloudflare Worker.
 * A thin wrapper: it receives HTTP requests, hands them to the shared engine
 * (docs/js/engine.js, where ALL the rules live), and keeps data in Cloudflare KV.
 *
 * Secrets / variables (Cloudflare dashboard > your Worker > Settings > Variables and Secrets):
 *   ADMIN_USERNAME, ADMIN_PASSWORD   Admin login (default Admin / Admin until you set them)
 *   SESSION_SECRET                   long random text used to sign login tokens
 *   ALLOWED_ORIGIN                   your site, e.g. https://yourname.github.io (default: any site)
 *   GOOGLE_MAPS_API_KEY              turns on Google address verification (Geocoding API)
 *   GOOGLE_WALLET_ISSUER_ID, GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL, GOOGLE_WALLET_PRIVATE_KEY
 *                                    turns on "Save to Google Wallet"
 *   ALLOW_SELF_UPGRADE               "true" lets businesses switch to Pro themselves (testing only)
 *   SITE_URL                         your website address, e.g. https://yourname.github.io/localhints (used in reset and invite links)
 *   RESEND_API_KEY, EMAIL_FROM       turns on sending email (password reset, team invites) through Resend
 *   ADMIN_EMAIL                      where the admin "Forgot password" link is sent
 *   ANTHROPIC_API_KEY, AI_MODEL      optional: lets "What to try next" use Claude (AI_MODEL defaults to claude-haiku-5-5)
 */
import { handle } from '../docs/js/engine.js';
import { buildSeed } from '../docs/js/seed.js';

const STATE_KEY = 'state';

function kvStore(kv) {
  return {
    async load() {
      const raw = await kv.get(STATE_KEY);
      return raw ? JSON.parse(raw) : null;
    },
    async save(state) {
      await kv.put(STATE_KEY, JSON.stringify(state));
    },
    async getBlob(key) {
      return kv.get('blob:' + key);
    },
    async putBlob(key, value) {
      if (value) await kv.put('blob:' + key, value);
      else await kv.delete('blob:' + key);
    },
  };
}

function corsHeaders(request, env) {
  const allowed = env.ALLOWED_ORIGIN || '*';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(data, status, extra) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra } });
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return json({ ok: true, service: 'localhints-worker', hint: 'Use /api/health' }, 200, cors);
    if (!env.LH_KV) return json({ error: 'The LH_KV storage binding is missing. See guides/CLOUDFLARE_WORKER.md.' }, 500, cors);

    let body;
    if (request.method === 'POST') {
      try {
        const text = await request.text();
        if (text.length > 400000) return json({ error: 'Request too large.' }, 413, cors);
        body = text ? JSON.parse(text) : {};
      } catch {
        return json({ error: 'Invalid JSON.' }, 400, cors);
      }
    }
    const result = await handle(
      { store: kvStore(env.LH_KV), env, demo: false, seed: buildSeed, autoSeed: false, fetch: (u, o) => fetch(u, o), origin: env.ALLOWED_ORIGIN && env.ALLOWED_ORIGIN !== '*' ? env.ALLOWED_ORIGIN : '' },
      {
        method: request.method,
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
        body,
        headers: { authorization: request.headers.get('Authorization') || '' },
        ip: request.headers.get('CF-Connecting-IP') || 'unknown',
      },
    );

    if (result.body && result.body.raw) {
      const bytes = Uint8Array.from(atob(result.body.raw.base64), (ch) => ch.charCodeAt(0));
      return new Response(bytes, { status: result.status, headers: { 'content-type': result.body.raw.contentType, 'cache-control': 'public, max-age=86400', ...cors } });
    }
    return json(result.body, result.status, cors);
  },
};
