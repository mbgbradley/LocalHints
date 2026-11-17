# LocalHints

Hyper-local deals that shoppers save to their Apple or Google Wallet. Plain HTML, CSS and JavaScript, with the
business logic in one file that runs either in the browser (demo mode) or in a Cloudflare Worker (live mode).

| Page | File | Who |
|---|---|---|
| Shoppers | `docs/index.html` | Discover list + map, Main Street Loop feed, wallet passes, nearby alerts, PWA |
| Business | `docs/business.html` | Sign up (with Google address check), Free/Pro plans, deals, Neighborhood Drops, Loop-In, insights, logo |
| Team | `docs/staff.html` | Clerks join from an invite and redeem passes |
| Admin | `docs/admin.html` | Count tiles, search businesses with inline details, live deals, dates log, pilot, spotted deals |

## Folders

```
docs/        The website. GitHub Pages serves this folder.
  js/engine.js   ALL business rules and the API. Runs in the browser (demo) and in the Worker (live).
  js/config.js   The one setting: API_BASE ("" = demo mode, or your Worker URL = live mode)
worker/      Cloudflare Worker (index.js) + a paste-in single-file copy (worker-single-file.js)
guides/      STEP_BY_STEP.md (beginner setup), CLOUDFLARE_WORKER.md (reference), WALLET_RADIUS_PUSH.md
tests/       engine.test.mjs (Node) and browser_e2e.py (Chrome)
CLAUDE.md    Project notes for Claude
```

## Try it now (demo mode)

1. Put the repo on GitHub, then Settings → Pages → Deploy from branch `main`, folder `/docs`.
2. Open the Pages URL. Everything works with sample data, stored in your browser.
3. Logins in demo mode: Admin / Admin at `admin.html`; businesses at `business.html` (password `demo1234`,
   for example `owner@brewandbean.demo`).

To go live, follow `guides/STEP_BY_STEP.md`.
