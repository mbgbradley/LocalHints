# How businesses push deals to wallets within a radius

This explains how LocalHints lets a business reach people near its shop and get a deal into their Apple Wallet
or Google Wallet, what is already built, and what is left.

## The key constraint (read this first)

**Apple and Google do not let a business insert a pass into someone's wallet.** A pass only exists in a wallet
after the person taps "Add". After that, the business can update the pass and the phone can surface it by
location. So "push a deal to wallets within a radius" is two things working together:

1. **Reach**: get a nearby person to see the offer and tap Add (the *Neighborhood Drop*).
2. **Wallet**: once saved, the pass shows itself near the shop and can be updated remotely (geofence + *Pass Push*).

Anything claiming to drop passes into strangers' wallets silently is impossible or against platform rules. The
two-step flow below is the compliant version, and it is one tap for the shopper.

## The flow

```
Business picks a live deal + radius (0.5 to 5 mi)          Business page → Reach → Neighborhood Drop
        │
        ▼
Worker finds opted-in shoppers within the radius           engine.js routeDrop (haversine distance)
        │
        ▼
Alert appears for each shopper                             Alerts tab today; web push / SMS / email next
        │  tap
        ▼
Deal sheet → "Add to wallet" → [Apple Wallet] [Google Wallet]
        │  tap Add
        ▼
Pass is in the wallet, carrying the shop's coordinates
        │
        ├── Lock screen shows it when the shopper is near the shop   (Apple "locations" / Google "locations")
        └── Business can update it any time                          (Pass Push, pause, end, upgrades, stamps)
```

## What is built today

| Piece | Where | Status |
|---|---|---|
| Shopper opt-in with approximate location (rounded to about 1 km, never exact) | Shopper site → Alerts → "Nearby deal alerts" → `POST /api/subscribe` | Built |
| Drop to shoppers inside a radius, 4 per month on Pro, message 10 to 100 characters | `routeDrop` in `docs/js/engine.js` | Built (delivers to the in-app Alerts tab) |
| Pass Push to everyone holding a pass | `routePush` | Built (in-app) |
| Apple pass data (`pass.json`) with `locations`, `maxDistance` 300 m, barcode, `voided` | `walletPayloads` | Built, **unsigned** |
| Google Wallet Offer class and object, signed "Save to Google Wallet" link | `walletPayloads` | Built. Works once the three `GOOGLE_WALLET_*` settings are on the Worker |
| Signed `.pkpass` for Apple Wallet | | **Not built** (needs Apple Developer account and a signing step) |
| Real push to phones (web push, SMS, email) | | **Not built** |
| Apple pass update service (register device, send updates through APNs) | | **Not built** |

Distance is measured from the business's coordinates (verified through Google when the address check is on) to
each opted-in shopper's rounded location.

## Delivering the alert (next step)

| Channel | Cost | Notes |
|---|---|---|
| Web push (PWA) | free | Shopper must have added the site to the Home Screen on iOS 16.4+. Needs VAPID keys and a service worker push handler. |
| Email | near-free | Slower to be seen. |
| SMS | per message | Needs explicit SMS consent (TCPA in the US). Use for high-value drops only. |

Shopper controls: global opt-out, quiet hours, per-business mute. Business limit: **4 drops per month** on Pro
(`LIMITS.pro.dropsPerMonth` in `engine.js`).

## Adding the pass to the wallet

**Google Wallet.** `GET /api/wallet/google/:passId` returns a `saveUrl` (a signed JWT that creates the class and
the object when the shopper taps Save). Setup: Google Wallet issuer account, a service account with its key, then
set `GOOGLE_WALLET_ISSUER_ID`, `GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_WALLET_PRIVATE_KEY` on the Worker.

**Apple Wallet.** `GET /api/wallet/apple/:passId` returns the `pass.json` today. To make a real `.pkpass`: join
the Apple Developer Program, create a Pass Type ID and certificate, build the zip (pass.json, icon images,
manifest) and sign the manifest with PKCS#7 using your certificate and Apple's WWDR certificate. Cloudflare
Workers have no ready-made signer, so the simplest route is a tiny signing service (for example a Node function)
that the Worker calls.

## Surfacing on the lock screen

- **Apple:** `locations` (up to 10, each with `relevantText`) and `maxDistance` in `pass.json`.
- **Google:** a `locations` array on the Offer object.

Both are already in the payloads, using the shop's location and a 300 m radius. The phone does the matching
on-device, so LocalHints never tracks the shopper. That is the privacy advantage of this design.

## Updating passes remotely

- **Apple:** the pass has a `webServiceURL` and `authenticationToken`. When a shopper adds it, their phone
  registers with your server. To change a pass, update your data and send an APNs push to each registered device;
  the phone then fetches the latest pass. Fields with `changeMessage` show a lock-screen message when they change.
  Endpoints to build: register device, unregister device, list updated serials, fetch latest pass, log.
- **Google:** patch the Offer object (state, text, barcode) and use the message API for notifications.

The engine already decides what each pass should say (`passStatus`, share-to-upgrade, stamps, pause, end), so
the work left is sending those changes to Apple and Google.

## Compliance checklist

- Explicit, revocable opt-in for nearby alerts; show exactly what is collected.
- Store coarse location only; delete it when a shopper opts out (the engine already clears it).
- Frequency caps, quiet hours (for example 9pm to 8am local), and a clear unsubscribe in every alert.
- SMS: collect consent and honor STOP. Follow TCPA/CTIA rules in the US.
- Privacy policy covering CCPA/GDPR rights where applicable.
- Apple and Google both review wallet usage. Keep passes honest and tied to a real offer.

## Suggested build order

1. Set `GOOGLE_WALLET_*` on the Worker and test "Save to Google Wallet" on an Android phone.
2. Add web push for drops and pass pushes.
3. Apple Developer account, Pass Type ID, `.pkpass` signing, Apple web service.
4. Wire pass updates (APNs + Google patch) to the engine actions (pause, end, upgrade, stamp).
5. Optional: SMS channel for Pro drops, with consent and billing.
6. Move data from KV to D1 and use a geospatial query once you have thousands of shoppers.

> Wallet schemas gain fields over time. Check the payloads in `walletPayloads` against the current PassKit and
> Google Wallet documentation when you implement signing.
