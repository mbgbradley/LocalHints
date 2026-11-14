# Cloudflare Worker reference

The Worker (`worker/index.js`) is a thin wrapper around `docs/js/engine.js`. It stores everything in one
Cloudflare KV namespace bound as `LH_KV`.

## Settings (Worker → Settings → Variables and Secrets)

| Name | What it does | Needed? |
|---|---|---|
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | Admin login. Until both are set the login is Admin / Admin and the admin page shows a red warning. | Yes, before sharing |
| `SESSION_SECRET` | Long random text used to sign login tokens. If missing, a random one is generated and kept in KV. | Recommended |
| `ALLOWED_ORIGIN` | Your site, for example `https://yourname.github.io` (no trailing slash, no path). Only this site can call the API from a browser. Default: any site. | Recommended |
| `GOOGLE_MAPS_API_KEY` | Turns on Google address verification (Geocoding API). Restrict the key to the Geocoding API. | For address check |
| `GOOGLE_WALLET_ISSUER_ID`, `GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_WALLET_PRIVATE_KEY` | Turns on "Save to Google Wallet". The private key is the PEM from the service account JSON (keep the `\n` characters). | For Google Wallet |
| `APPLE_PASS_TYPE_ID`, `APPLE_TEAM_ID`, `APPLE_WEB_SERVICE_URL` | Used in the Apple pass data. Signing the `.pkpass` is not built in yet. | Later |
| `ALLOW_SELF_UPGRADE` | `true` lets businesses switch themselves to Pro. For testing only. Otherwise an upgrade becomes a request the admin sees. | No |

## API summary

Public: `GET /api/health`, `GET /api/deals`, `POST /api/claim`, `GET /api/passes`, `GET /api/wallet/{apple|google}/:passId`,
`POST /api/subscribe`, `GET /api/alerts`, `POST /api/tips`, `POST /api/address/verify`, `GET /api/logo/:businessId`.

Business (Bearer token): `POST /api/business/signup | login | profile | logo | tier | close | deals | redeem | drop | push | loops`,
`GET /api/business/me | partners | analytics`, `POST /api/business/deals/:id/{edit|publish|status|delete}`.

Admin (Bearer token): `POST /api/admin/login`, `GET /api/admin/{me|stats|businesses|businesses/:id|events|pilot|tips}`,
`POST /api/admin/businesses/:id/action`, `POST /api/admin/{seed|reset}`.

## Limits to know about

- **One KV document holds all data.** Fine for a pilot (hundreds of businesses). Two requests at the same
  moment can overwrite each other. Before real scale, move to D1 (SQL) or a Durable Object. Only the store in
  `worker/index.js` and the way `engine.js` loads and saves state need to change.
- **Passwords** use PBKDF2 with 100,000 rounds (the most Workers allow). On the free Workers plan, sign-in can
  occasionally hit the CPU limit (error 1102). The $5 Workers Paid plan removes that.
- **Rate limits** are stored in the same state, per IP address.
- Real push notifications to phones (web push, SMS) are not built. Drops appear in the shopper's Alerts tab.
