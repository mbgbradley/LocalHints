'use client';

import { useMemo, useState, type ReactNode } from 'react';
import {
  dropsThisMonth,
  estimateDropReach,
  isDealLive,
  limitsFor,
  passHolders,
  useStore,
} from '@/lib/store';
import { formatMiles, haversineMiles } from '@/lib/geo';
import { dealLabel, relativeTime } from '@/components/ui/format';
import {
  DROP_MAX_MILES,
  DROP_MIN_MILES,
  PUSH_MAX_CHARS,
  PUSH_MIN_CHARS,
  type Business,
} from '@/types/localhints';
import { WALLET_GEOFENCE_METERS } from '@/lib/wallet';

interface CampaignAndBlastsProps {
  business: Business;
  onUpgrade: () => void;
}

type Mode = 'drop' | 'push';

const textareaCls =
  'mt-1 w-full resize-none rounded-xl border border-neutral-300 bg-white px-3.5 py-3 outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-200';

/** Pass Push (existing holders) and Neighborhood Drop (opted-in shoppers within a radius). */
export function CampaignAndBlasts({ business, onUpgrade }: CampaignAndBlastsProps) {
  const [mode, setMode] = useState<Mode>('drop');

  return (
    <div className="space-y-5">
      <div className="flex rounded-full bg-neutral-200/70 p-1 sm:max-w-md" role="tablist" aria-label="Message type">
        {(
          [
            ['drop', 'Neighborhood Drop'],
            ['push', 'Pass Push'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            onClick={() => setMode(id)}
            className={`flex-1 rounded-full py-2 text-sm font-semibold ${
              mode === id ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'drop' ? (
        <NeighborhoodDrop business={business} onUpgrade={onUpgrade} />
      ) : (
        <PassPush business={business} onUpgrade={onUpgrade} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-3xl bg-white p-5 ring-1 ring-neutral-200 ${className}`}>{children}</div>;
}

function LockedNotice({ title, body, onUpgrade }: { title: string; body: string; onUpgrade: () => void }) {
  return (
    <div className="mt-4 rounded-2xl bg-neutral-100 p-5 text-center">
      <p className="font-semibold text-neutral-900">{title}</p>
      <p className="mt-1 text-sm text-neutral-600">{body}</p>
      <button
        type="button"
        onClick={onUpgrade}
        className="mt-4 rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white"
      >
        Upgrade to Pro
      </button>
    </div>
  );
}

function PhonePreview({ label, business, message }: { label: string; business: Business; message: string }) {
  return (
    <div className="lg:sticky lg:top-24 lg:self-start">
      <p className="mb-3 text-center text-xs font-semibold uppercase tracking-widest text-neutral-500">{label}</p>
      <div className="mx-auto w-full max-w-[300px] rounded-[2rem] bg-gradient-to-b from-neutral-800 to-neutral-950 p-4 pb-10 shadow-xl">
        <p className="mt-2 text-center text-4xl font-light text-white/90">9:41</p>
        <div className="mt-6 rounded-2xl bg-white/90 p-3 shadow">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-neutral-500">
            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-neutral-900 text-[10px] text-white">
              L
            </span>
            LOCALHINTS · now
          </div>
          <p className="mt-1 text-sm font-bold text-neutral-900">
            {business.emoji} {business.name}
          </p>
          <p className="text-sm text-neutral-700">{message.trim() || 'Your message appears here.'}</p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------

function NeighborhoodDrop({ business, onUpgrade }: CampaignAndBlastsProps) {
  const { state, now, sendDrop } = useStore();
  const limits = limitsFor(business, now);
  const locked = limits.dropsPerMonth === 0;

  const liveDeals = useMemo(
    () => state.deals.filter((d) => d.businessId === business.id && isDealLive(d, state, now)),
    [state, now, business.id],
  );

  const [dealId, setDealId] = useState('');
  const [radius, setRadius] = useState(1);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const selected = liveDeals.find((d) => d.id === dealId) ?? liveDeals[0];
  const used = dropsThisMonth(state, business.id, now);
  const remaining = Math.max(0, limits.dropsPerMonth - used);
  const reach = estimateDropReach(radius);
  const shopperMiles = haversineMiles(state.consumer, business);
  const shopperInside = state.consumer.notifyNearby && shopperMiles <= radius;
  const history = state.drops
    .filter((d) => d.businessId === business.id)
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt));
  const tooShort = message.trim().length < PUSH_MIN_CHARS;

  const send = () => {
    if (!selected) return;
    setResult(null);
    const res = sendDrop(business.id, selected.id, message, radius);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError(null);
    setResult(
      res.data.deliveredToDemoShopper
        ? 'Sent. Switch to the shopper view (home page) and open Wallet to see the alert arrive.'
        : 'Sent. The demo shopper is outside this radius or opted out, so they did not receive it.',
    );
    setMessage('');
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-5">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-neutral-900">Neighborhood Drop</h2>
            {!locked && (
              <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-600">
                {remaining} of {limits.dropsPerMonth} left this month
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-neutral-600">
            Reach opted-in shoppers within a radius of your shop. They tap once to add your deal to their Apple or
            Google Wallet.
          </p>

          {locked ? (
            <LockedNotice
              title="Neighborhood Drops are a Pro feature"
              body="Pro includes 4 radius drops a month. Free Starter businesses still appear on the map and in the feed."
              onUpgrade={onUpgrade}
            />
          ) : liveDeals.length === 0 ? (
            <p className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm font-medium text-amber-800">
              You need a live deal first. Create or publish one, then come back.
            </p>
          ) : (
            <div className="mt-5 space-y-5">
              <label className="block">
                <span className="text-sm font-medium text-neutral-800">Deal to promote</span>
                <select
                  value={selected?.id ?? ''}
                  onChange={(e) => setDealId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-3 outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-200"
                >
                  {liveDeals.map((d) => (
                    <option key={d.id} value={d.id}>
                      {dealLabel(d)} · {d.title}
                    </option>
                  ))}
                </select>
              </label>

              <div>
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-medium text-neutral-800">Radius</span>
                  <span className="text-sm font-bold text-neutral-900">{radius} mi</span>
                </div>
                <input
                  type="range"
                  min={DROP_MIN_MILES}
                  max={DROP_MAX_MILES}
                  step={0.5}
                  value={radius}
                  onChange={(e) => setRadius(Number(e.target.value))}
                  className="mt-2 w-full accent-neutral-900"
                  aria-label="Drop radius in miles"
                />
                <RadiusDiagram radius={radius} />
                <p className="mt-2 text-sm text-neutral-700">
                  About <b>{reach.toLocaleString()}</b> opted-in shoppers{' '}
                  <span className="text-neutral-500">(simulated density of 45 per square mile)</span>
                </p>
                <p className="mt-1 text-xs text-neutral-500">
                  Demo shopper Alex is {formatMiles(shopperMiles)} away:{' '}
                  {shopperInside ? 'inside this radius, will receive it.' : 'outside this radius or opted out.'}
                </p>
              </div>

              <label className="block">
                <span className="text-sm font-medium text-neutral-800">Message</span>
                <textarea
                  value={message}
                  maxLength={PUSH_MAX_CHARS}
                  rows={3}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Rainy day special: BOGO lattes until 10am!"
                  className={textareaCls}
                />
                <span className="mt-1 block text-right text-xs text-neutral-500">
                  {message.length}/{PUSH_MAX_CHARS}
                </span>
              </label>

              {error && (
                <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-3 text-sm font-medium text-rose-700">
                  {error}
                </p>
              )}
              {result && (
                <p role="status" className="rounded-xl bg-emerald-50 px-3.5 py-3 text-sm font-medium text-emerald-700">
                  {result}
                </p>
              )}

              <button
                type="button"
                onClick={send}
                disabled={remaining === 0 || tooShort || business.status !== 'approved'}
                className="w-full rounded-full bg-neutral-900 py-4 text-base font-semibold text-white disabled:bg-neutral-300"
              >
                {remaining === 0 ? 'Monthly limit reached' : `Send to about ${reach.toLocaleString()} shoppers`}
              </button>
            </div>
          )}
        </Card>

        <HowItWorks />

        <Card>
          <h3 className="text-base font-bold text-neutral-900">Sent drops</h3>
          {history.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-500">Nothing sent yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-neutral-100">
              {history.map((d) => (
                <li key={d.id} className="py-3">
                  <p className="text-sm font-medium text-neutral-800">{d.message}</p>
                  <p className="mt-1 text-xs text-neutral-500">
                    {relativeTime(d.sentAt, now)} · {d.radiusMiles} mi · about {d.reach.toLocaleString()} reached
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <PhonePreview label="What shoppers see" business={business} message={message} />
    </div>
  );
}

function RadiusDiagram({ radius }: { radius: number }) {
  // The outer ring is the 5 mile maximum; the filled ring is the chosen radius.
  const r = (radius / DROP_MAX_MILES) * 70;
  return (
    <svg viewBox="0 0 160 160" className="mx-auto mt-3 h-40 w-40" role="img" aria-label={`${radius} mile radius`}>
      <circle cx="80" cy="80" r="70" fill="none" stroke="#e5e5e5" strokeDasharray="3 4" />
      <circle cx="80" cy="80" r={r} fill="#171717" fillOpacity="0.07" stroke="#171717" strokeWidth="1.5" />
      <circle cx="80" cy="80" r="5" fill="#171717" />
      <text x="80" y="102" textAnchor="middle" fontSize="9" fill="#525252">
        your shop
      </text>
    </svg>
  );
}

function HowItWorks() {
  const steps: Array<[string, string]> = [
    [
      'You choose a deal and a radius',
      'From 0.5 to 5 miles around your shop. LocalHints counts opted-in shoppers inside it (a PostGIS distance query in production).',
    ],
    [
      'Nearby shoppers get an alert',
      'Shoppers who turned on “Nearby deal alerts” and are within your radius get a web push, text or email with your message.',
    ],
    [
      'One tap adds it to their wallet',
      'The alert opens your pass. They tap Add to Apple Wallet or Google Wallet, and the pass lands in their phone.',
    ],
    [
      'The wallet keeps working for you',
      `Your pass carries your shop's location, so it pops up on their lock screen when they are within about ${WALLET_GEOFENCE_METERS} m. You can still update, upgrade, pause or end it remotely, and send Pass Push messages.`,
    ],
  ];
  return (
    <Card>
      <h3 className="text-base font-bold text-neutral-900">How radius drops reach wallets</h3>
      <ol className="mt-3 space-y-3">
        {steps.map(([title, body], i) => (
          <li key={title} className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-xs font-bold text-white">
              {i + 1}
            </span>
            <span>
              <span className="block text-sm font-semibold text-neutral-900">{title}</span>
              <span className="block text-sm text-neutral-600">{body}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-4 rounded-2xl bg-neutral-100 p-3 text-xs leading-relaxed text-neutral-600">
        Why a tap is needed: Apple and Google do not let a business insert a pass into someone&apos;s wallet
        without that person saving it. The drop gets the shopper to that one tap. After that, the wallet can
        surface and update the pass on its own.
      </p>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------------------

function PassPush({ business, onUpgrade }: CampaignAndBlastsProps) {
  const { state, now, sendPassPush } = useStore();
  const locked = !limitsFor(business, now).passPush;

  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  const holders = passHolders(state, business.id, now).length;
  const history = state.pushes
    .filter((b) => b.businessId === business.id)
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt));
  const tooShort = message.trim().length < PUSH_MIN_CHARS;

  const send = () => {
    const res = sendPassPush(business.id, message);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError(null);
    setMessage('');
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-5">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-neutral-900">Pass Push</h2>
            <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-600">
              {holders} {holders === 1 ? 'phone holds' : 'phones hold'} your passes
            </span>
          </div>
          <p className="mt-1 text-sm text-neutral-600">
            Update the lock screen of everyone who already saved your pass, like &ldquo;Rainy Tuesday: show this
            pass for a free soda tonight!&rdquo; It runs through Apple and Google Wallet pass updates, so there is
            no SMS cost.
          </p>

          {locked ? (
            <LockedNotice
              title="Pass Push is a Pro feature"
              body="Unlimited updates to everyone who saved your pass, free to deliver."
              onUpgrade={onUpgrade}
            />
          ) : (
            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-neutral-800">Message</span>
                <textarea
                  value={message}
                  maxLength={PUSH_MAX_CHARS}
                  rows={3}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Rainy Tuesday special: show this pass for a free soda tonight!"
                  className={textareaCls}
                />
                <span className="mt-1 block text-right text-xs text-neutral-500">
                  {message.length}/{PUSH_MAX_CHARS}
                </span>
              </label>

              {error && (
                <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-3 text-sm font-medium text-rose-700">
                  {error}
                </p>
              )}

              <button
                type="button"
                onClick={send}
                disabled={tooShort || business.status !== 'approved'}
                className="w-full rounded-full bg-neutral-900 py-4 text-base font-semibold text-white disabled:bg-neutral-300"
              >
                Push to {holders} {holders === 1 ? 'phone' : 'phones'}
              </button>
            </div>
          )}
        </Card>

        <Card>
          <h3 className="text-base font-bold text-neutral-900">Sent pushes</h3>
          {history.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-500">Nothing sent yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-neutral-100">
              {history.map((b) => (
                <li key={b.id} className="py-3">
                  <p className="text-sm font-medium text-neutral-800">{b.message}</p>
                  <p className="mt-1 text-xs text-neutral-500">
                    {relativeTime(b.sentAt, now)} · delivered to {b.recipients}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <PhonePreview label="Lock screen preview" business={business} message={message} />
    </div>
  );
}
