# LocalHints

Mobile-first web app for hyper-local deals delivered as Apple/Google Wallet passes. This is a working
prototype to build on: shoppers browse a list or map of nearby deals, businesses sign up and publish deals,
and an admin approves them. See `CLAUDE.md` for architecture and rules, and `docs/WALLET_RADIUS_PUSH.md` for how
radius drops and wallet passes will work, and `docs/STEP_BY_STEP.md` for a beginner-friendly setup guide.

## Run

```bash
npm install
npm run dev          # http://localhost:3000
npm run typecheck
npm run build
```

## Pages

| URL | Who | What |
|---|---|---|
| `/` | Shoppers | Deals near you, list and map views, wallet, profile |
| `/business` | Business owners | Create account or sign in, dashboard, deal builder, drops, analytics |
| `/admin` | You | Server-side sign-in, approvals, moderation, plans, pilot |

## Logins (demo)

- **Admin:** username `Admin`, password `Admin`. Change before sharing publicly (see below).
- **Business demo account:** `owner@brewandbean.demo` / `demo1234` (owns three sample businesses).
  You can also create your own account at `/business`.

## Deploy to Vercel

1. Push this folder to a GitHub repository and import it in Vercel (no build settings needed).
2. Add environment variables (Project Settings → Environment Variables):
   `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `SESSION_SECRET` (see `.env.example`).
3. Open the Vercel URL on your phone. HTTPS is required for secure business sign-in (Web Crypto).

## Important prototype limits

- Shopper, business and deal data is stored in each browser's `localStorage`. A business that signs up on one
  device will not appear to an admin on another device. Use one browser to test the whole loop, or move the
  store to Supabase (`lib/store.tsx` is the only file to change).
- Admin sign-in is genuinely server-side (signed HttpOnly cookie). Business accounts are browser-only
  prototypes with hashed passwords.
- Map tiles load from CARTO/OpenStreetMap over the internet.
