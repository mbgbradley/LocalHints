# How businesses push deals to wallets within a radius

This document explains how LocalHints will let a business reach people near its shop and get a deal into their
Apple Wallet or Google Wallet, what the prototype already does, and what is left to build.

## The key constraint (read this first)

**Apple and Google do not let a business insert a pass into someone's wallet.** A pass only exists in a wallet
after the person taps "Add". After that, the business can update the pass and the wallet can surface it by
location. So "push a deal to wallets within a radius" is really two things working together:

1. **Reach**: get a nearby person to see the offer and tap Add (the *Neighborhood Drop*).
2. **Wallet**: once saved, the pass can show itself near the shop and be updated remotely (geofence + *Pass Push*).

Anything that claims to drop passes into strangers' wallets silently is either impossible or against platform
rules. The two-step flow below is the compliant version, and it is one tap for the shopper.

## The flow

```
Business picks deal + radius (0.5 to 5 mi)
        │
        ▼
Server finds opted-in shoppers within the radius          (PostGIS ST_DWithin)
        │
        ▼
Alert to each shopper: web push / SMS / email             "Brew & Bean is nearby: BOGO lattes until 10am"
        │  tap
        ▼
Pass page  /p/<deal>?src=drop   →  [Add to Apple Wallet]  [Save to Google Wallet]
        │  tap Add
        ▼
Pass is in the wallet, carrying the shop's coordinates
        │
        ├── Lock screen shows it when the shopper is near the shop   (relevant locations / geofence)
        └── Business can update it any time                          (Pass Push, upgrades, pause, end)
```

### 1. Who counts as "within a radius"?

Shoppers opt in to **Nearby deal alerts** (Profile → toggle). When they do, the app stores a coarse location
for them: their chosen "home area" or last known location, rounded to roughly a city block, never a live
track. The business radius is measured from the **business's** coordinates to that stored point.

```sql
-- Production query (PostGIS). radius_m = miles * 1609.34
SELECT s.id
FROM shoppers s
WHERE s.notify_nearby = true
  AND ST_DWithin(s.area::geography, ST_MakePoint(:biz_lng, :biz_lat)::geography, :radius_m);
```

Prototype: `sendDrop()` in `lib/store.tsx` checks the demo shopper with `haversineMiles`, and
`estimateDropReach()` simulates the audience (45 opted-in shoppers per square mile).

### 2. Delivering the alert

| Channel | Cost | Notes |
|---|---|---|
| Web push (PWA) | free | Needs the shopper to have installed the app to the Home Screen on iOS 16.4+. Uses VAPID keys. |
| Email | near-free | Slower to be seen. |
| SMS | per message | Needs explicit SMS consent (TCPA in the US). Use for high-value drops only. |

Every channel links to the same pass page. Shopper-side controls: global opt-out, quiet hours, per-business mute.
Business-side limits: Pro includes **4 drops per calendar month** (`TIER_LIMITS.pro.dropsPerMonth`), so shoppers
are not spammed and SMS cost stays bounded.

### 3. Adding the pass to the wallet

The pass page offers two buttons.

**Apple Wallet.** The server returns a signed `.pkpass` file (`Content-Type: application/vnd.apple.pkpass`).
Build the `pass.json` with `applePassJson()` in `lib/wallet.ts`, sign it with your Pass Type ID certificate and
Apple's WWDR certificate, and zip it with the logo/icon images. Needs an Apple Developer account.

**Google Wallet.** The server creates (once) an **Offer class**, then inserts an **Offer object** per pass
(`googleOfferObject()`), and gives the shopper a "Save to Google Wallet" link made from a signed JWT. Needs a
Google Wallet issuer account and a service account.

### 4. After the shopper saves: surfacing on the lock screen

Both wallets support location relevance:

- **Apple:** `locations` (up to 10 coordinates, each with `relevantText`) and `maxDistance` in `pass.json`.
  When the phone is near one of them, the pass can appear on the lock screen. iOS decides when and how often.
- **Google:** a `locations` array on the Offer object. Google surfaces the pass near those points.

`lib/wallet.ts` already writes the business location into both payloads (`WALLET_GEOFENCE_METERS` = 300 m). You do
not need to track the shopper: the phone's own wallet does the matching on-device. That is also the privacy
advantage of this design.

### 5. Updating passes remotely (Pass Push, upgrades, pause, end)

- **Apple:** the pass has a `webServiceURL` and `authenticationToken`. When the shopper adds it, their phone
  registers with your server. To change a pass, update it in your database and send Apple's push service (APNs)
  a silent notification to each registered device. The phone then calls your server for the latest pass. Fields
  marked with `changeMessage` show a lock-screen notification when their value changes.
  Endpoints you must implement: register device, unregister device, list serials updated since a time, fetch the
  latest pass, and log.
- **Google:** patch the Offer object (change `state`, text, barcode) and use the object's message API to show a
  message. Google rate-limits notifications per pass.

This single mechanism powers everything the prototype already simulates: share-to-upgrade (`saveViaReferral`),
pause/resume (`setDealStatus`), end now (`endDeal`), stamp progress (`redeemByCode`), and Pass Push
(`sendPassPush`).

## Compliance checklist

- Explicit, revocable opt-in for nearby alerts; show exactly what is collected.
- Store coarse location only; delete it when a shopper opts out or deletes their account.
- Frequency caps, quiet hours (for example 9pm to 8am local), and a clear unsubscribe in every alert.
- SMS: collect consent and honor STOP. Follow TCPA/CTIA rules in the US.
- Privacy policy covering CCPA/GDPR rights where applicable.
- Apple and Google both review wallet usage. Keep passes honest and tied to a real offer.

## Prototype → production map

| Prototype (today) | Production replacement |
|---|---|
| `sendDrop()` + `estimateDropReach()` in `lib/store.tsx` | `POST /api/drops` that runs the PostGIS query and enqueues alerts |
| `consumer.notifyNearby` + stored lat/lng | `shoppers` table with `notify_nearby`, coarse `area geography` |
| Wallet updates list on the Wallet tab | Web push / SMS / email via a queue (for example Supabase Edge Functions + a provider) |
| Wallet payload preview (`WalletPayloadPreview.tsx`) | `GET /api/wallet/apple/<passId>` returning a signed `.pkpass`, and a Google "Save" JWT link |
| `saveViaReferral`, `endDeal`, `setDealStatus`, `sendPassPush` | Update the DB row, then APNs push (Apple) and object patch (Google) |
| `passStatus()` derived state | The same function on the server decides `voided` / `state` in each payload |
| Browser `localStorage` | Supabase (PostgreSQL + PostGIS) behind the same `useStore()` API |

## Suggested build order

1. Supabase: tables, auth, move the store actions behind API routes (keep `useStore()` signatures).
2. Apple Developer account + Pass Type ID; implement `.pkpass` signing and the Apple web service.
3. Google Wallet issuer + Offer class; implement the Save-to-Wallet JWT.
4. Shopper opt-in with coarse location; the PostGIS drop query; web push.
5. Wire pass updates (APNs + Google patch) to the existing actions.
6. Optional: SMS channel for Pro drops, with consent and billing.

> Wallet schemas gain fields over time. Check `lib/wallet.ts` against the current PassKit and Google Wallet
> documentation when you implement signing.
