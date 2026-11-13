'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { dealsThisMonth, limitsFor, useStore } from '@/lib/store';
import {
  DEFAULT_BRAND_COLOR,
  FREE_DEAL_DURATION_DAYS,
  type Business,
  type DealKind,
  type ExpirationMode,
  type PerCustomerLimit,
  type PunchVisits,
  type RedemptionMethod,
} from '@/types/localhints';
import {
  BRAND_PRESETS,
  DAY_LABELS,
  dateInputValue,
  dealLabel,
  formatHour,
  isHexColor,
  KIND_LABELS,
  suggestCode,
} from '@/components/ui/format';
import { WalletPassPreview } from './WalletPassPreview';

interface ProCouponBuilderProps {
  business: Business;
  onUpgrade: () => void;
}

const KINDS: DealKind[] = ['percent', 'amount', 'bogo', 'freebie', 'bundle'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const inputCls =
  'w-full rounded-xl border border-neutral-300 bg-white px-3 py-3 outline-none focus:border-hint-500 focus:ring-2 focus:ring-hint-200 disabled:bg-neutral-100 disabled:text-neutral-400';

function num(s: string): number | null {
  const n = Number(s);
  return s.trim() !== '' && Number.isFinite(n) && n > 0 ? n : null;
}

export function ProCouponBuilder({ business, onUpgrade }: ProCouponBuilderProps) {
  const { state, now, createDeal } = useStore();
  const limits = limitsFor(business, now);
  const pro = limits.proBuilder;

  // 1. Offer structure
  const [title, setTitle] = useState('20% off your first visit');
  const [description, setDescription] = useState('Show this pass at the counter to save.');
  const [kind, setKind] = useState<DealKind>('percent');
  const [value, setValue] = useState(20);
  const [buyQty, setBuyQty] = useState(1);
  const [getQty, setGetQty] = useState(1);
  const [minSpend, setMinSpend] = useState('');
  const [punchVisits, setPunchVisits] = useState<PunchVisits>(1);
  const [terms, setTerms] = useState('One per customer. Not combinable with other offers.');
  // 2. Viral & loop
  const [shareOn, setShareOn] = useState(false);
  const [friendsNeeded, setFriendsNeeded] = useState<1 | 2 | 3>(2);
  const [upgradedValue, setUpgradedValue] = useState(30);
  const [partnerId, setPartnerId] = useState('');
  // 3. Time & scarcity
  const [mode, setMode] = useState<ExpirationMode>('fixed');
  const [expiresOn, setExpiresOn] = useState(() => dateInputValue(Date.now(), 7));
  const [rollingHours, setRollingHours] = useState(48);
  const [days, setDays] = useState<number[]>([1, 2, 3, 4]);
  const [startHour, setStartHour] = useState(15);
  const [endHour, setEndHour] = useState(18);
  const [claimLimit, setClaimLimit] = useState('');
  // 4. Branding
  const [brandColor, setBrandColor] = useState(DEFAULT_BRAND_COLOR);
  // 5. Redemption & POS
  const [method, setMethod] = useState<RedemptionMethod>('qr');
  const [customCode, setCustomCode] = useState('');
  const [limit, setLimit] = useState<PerCustomerLimit>('once');

  const [error, setError] = useState<string | null>(null);
  const [published, setPublished] = useState<string | null>(null);

  const usedThisMonth = dealsThisMonth(state, business.id, now);
  const quota = limits.dealsPerMonth;
  const quotaReached = quota !== null && usedThisMonth >= quota;
  const approved = business.status === 'approved';

  const effectiveValue = kind === 'bogo' || kind === 'freebie' ? 0 : value;
  const autoCode = useMemo(
    () => suggestCode(business.name, kind, effectiveValue || (kind === 'bogo' ? 1 : 0)),
    [business.name, kind, effectiveValue],
  );
  const code = pro && customCode.trim() ? customCode.trim().toUpperCase() : autoCode;
  const shareable = kind === 'percent' || kind === 'amount';
  const shareActive = pro && shareOn && shareable;
  const brand = pro && isHexColor(brandColor) ? brandColor : DEFAULT_BRAND_COLOR;
  const effPunch: PunchVisits = pro ? punchVisits : 1;
  const effMethod: RedemptionMethod = pro ? method : 'qr';
  const effMode: ExpirationMode = pro ? mode : 'fixed';

  const partners = state.businesses.filter(
    (b) => b.id !== business.id && b.status === 'approved' && b.category !== business.category,
  );

  const limitOptions: PerCustomerLimit[] = effPunch === 1 ? ['once', 'weekly', 'unlimited'] : ['weekly', 'unlimited'];
  const effLimit: PerCustomerLimit = limitOptions.includes(limit) ? limit : limitOptions[0];

  const expiryText =
    effMode === 'rolling'
      ? `Expires ${rollingHours}h after saving`
      : effMode === 'recurring'
        ? `${days.map((d) => DAY_LABELS[d]).join(', ')} · ${formatHour(startHour)} to ${formatHour(endHour)}`
        : pro
          ? `Ends ${expiresOn}`
          : `${FREE_DEAL_DURATION_DAYS} days after publish`;

  const previewLabel = dealLabel({ kind, value: effectiveValue, buyQty, getQty });
  const hint = shareActive
    ? `Share with ${friendsNeeded} ${friendsNeeded === 1 ? 'friend' : 'friends'} to upgrade to ${dealLabel(
        { kind, value: effectiveValue, buyQty, getQty },
        upgradedValue,
      )}`
    : null;

  const toggleDay = (d: number) =>
    setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));

  const handlePublish = () => {
    setPublished(null);
    const res = createDeal({
      businessId: business.id,
      title,
      description,
      kind,
      value: effectiveValue,
      buyQty,
      getQty,
      terms,
      code,
      minSpend: num(minSpend),
      punchVisits: effPunch,
      perCustomerLimit: effLimit,
      shareUpgrade: shareActive ? { friendsNeeded, upgradedValue } : null,
      partnerBusinessId: partnerId || null,
      expirationMode: effMode,
      expiresOn,
      rollingHours,
      recurring: effMode === 'recurring' ? { days, startHour, endHour } : null,
      claimLimit: num(claimLimit),
      brandColor: brand,
      redemptionMethod: effMethod,
    });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError(null);
    setPublished(res.data.title);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-neutral-900">Create a deal</h2>
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              quotaReached ? 'bg-rose-100 text-rose-700' : 'bg-neutral-100 text-neutral-600'
            }`}
          >
            {quota === null ? `${usedThisMonth} deals this month · unlimited` : `${usedThisMonth} of ${quota} deals this month`}
          </span>
        </div>

        {!pro && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-hint-50 p-4 text-sm text-hint-900">
            <p>
              Free Starter covers percent-off and dollar-off deals. Pro unlocks the full builder: BOGO, stamp
              cards, share-to-upgrade, schedules, branding and more.
            </p>
            <button
              type="button"
              onClick={onUpgrade}
              className="rounded-xl bg-hint-600 px-4 py-2 text-sm font-bold text-white"
            >
              Upgrade to Pro
            </button>
          </div>
        )}

        {!approved && (
          <p className="rounded-2xl bg-amber-50 p-4 text-sm font-medium text-amber-800">
            Your business is {business.status}. Deals can be published once an admin approves it.
          </p>
        )}

        {/* 1. Offer structure */}
        <Group n={1} title="Offer structure">
          <Field label="Offer title">
            <input value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Description">
            <textarea
              value={description}
              rows={2}
              onChange={(e) => setDescription(e.target.value)}
              className={`${inputCls} resize-none`}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Discount type">
              <select value={kind} onChange={(e) => setKind(e.target.value as DealKind)} className={inputCls}>
                {KINDS.map((k) => {
                  const locked = !pro && k !== 'percent' && k !== 'amount';
                  return (
                    <option key={k} value={k} disabled={locked}>
                      {KIND_LABELS[k]}
                      {locked ? ' (Pro)' : ''}
                    </option>
                  );
                })}
              </select>
            </Field>

            {(kind === 'percent' || kind === 'amount' || kind === 'bundle') && (
              <Field label={kind === 'percent' ? 'Percent off' : kind === 'amount' ? 'Dollars off' : 'Bundle price ($)'}>
                <input
                  type="number"
                  min={1}
                  max={kind === 'percent' ? 90 : kind === 'amount' ? 500 : 1000}
                  value={value}
                  onChange={(e) => setValue(Number(e.target.value))}
                  className={inputCls}
                />
              </Field>
            )}

            {kind === 'bogo' && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Buy">
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={buyQty}
                    onChange={(e) => setBuyQty(Number(e.target.value))}
                    className={inputCls}
                  />
                </Field>
                <Field label="Get free">
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={getQty}
                    onChange={(e) => setGetQty(Number(e.target.value))}
                    className={inputCls}
                  />
                </Field>
              </div>
            )}

            {kind === 'freebie' && (
              <p className="self-end rounded-xl bg-neutral-50 px-3 py-3 text-xs text-neutral-600">
                Name the free item in the offer title, e.g. &ldquo;Free garlic knots with any entree&rdquo;.
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Minimum spend ($)" locked={!pro} onUpgrade={onUpgrade}>
              <input
                type="number"
                min={1}
                disabled={!pro}
                value={pro ? minSpend : ''}
                placeholder="None"
                onChange={(e) => setMinSpend(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Visits" locked={!pro} onUpgrade={onUpgrade}>
              <select
                disabled={!pro}
                value={effPunch}
                onChange={(e) => setPunchVisits(Number(e.target.value) as PunchVisits)}
                className={inputCls}
              >
                <option value={1}>Single-use coupon</option>
                <option value={3}>3-visit stamp card</option>
                <option value={5}>5-visit stamp card</option>
                <option value={10}>10-visit stamp card</option>
              </select>
            </Field>
          </div>

          <Field label="Terms">
            <input value={terms} onChange={(e) => setTerms(e.target.value)} className={inputCls} />
          </Field>
        </Group>

        {/* 2. Viral & loop boosters */}
        <Group n={2} title="Viral & loop boosters" locked={!pro} onUpgrade={onUpgrade}>
          <fieldset disabled={!pro} className="space-y-4">
            <label className="flex items-start gap-3 rounded-xl bg-neutral-50 p-3">
              <input
                type="checkbox"
                checked={shareOn}
                onChange={(e) => setShareOn(e.target.checked)}
                className="mt-1 h-5 w-5 accent-hint-600"
              />
              <span>
                <span className="block font-semibold text-neutral-900">Share-to-upgrade</span>
                <span className="block text-xs text-neutral-600">
                  When friends save the deal through a customer&apos;s link, that customer&apos;s pass upgrades itself
                  in their wallet.
                </span>
              </span>
            </label>

            {shareOn && !shareable && (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                Share-to-upgrade works with percent-off or dollar-off deals. Switch the discount type to use it.
              </p>
            )}

            {shareOn && shareable && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Friend saves needed">
                  <select
                    value={friendsNeeded}
                    onChange={(e) => setFriendsNeeded(Number(e.target.value) as 1 | 2 | 3)}
                    className={inputCls}
                  >
                    <option value={1}>1 friend</option>
                    <option value={2}>2 friends</option>
                    <option value={3}>3 friends</option>
                  </select>
                </Field>
                <Field label={kind === 'percent' ? 'Upgraded percent off' : 'Upgraded dollars off'}>
                  <input
                    type="number"
                    min={value + 1}
                    value={upgradedValue}
                    onChange={(e) => setUpgradedValue(Number(e.target.value))}
                    className={inputCls}
                  />
                </Field>
              </div>
            )}

            <Field label="Main Street Loop partner">
              <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)} className={inputCls}>
                <option value="">None</option>
                {partners.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.emoji} {b.name}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-neutral-500">
                After a customer redeems, their pass suggests this neighbor&apos;s deal. Only non-competing
                categories are listed.
              </span>
            </Field>
          </fieldset>
        </Group>

        {/* 3. Time & scarcity */}
        <Group n={3} title="Time & scarcity rules" locked={!pro} onUpgrade={onUpgrade}>
          <fieldset disabled={!pro} className="space-y-4">
            <Field label="Expiration mode">
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ['fixed', 'Fixed date'],
                    ['rolling', 'Rolling timer'],
                    ['recurring', 'Weekly schedule'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setMode(id)}
                    className={`rounded-full px-3 py-2 text-sm font-semibold ${
                      effMode === id ? 'bg-hint-600 text-white' : 'bg-neutral-100 text-neutral-700'
                    } disabled:opacity-60`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Field>

            {!pro && (
              <p className="text-xs text-neutral-500">Free deals run for {FREE_DEAL_DURATION_DAYS} days.</p>
            )}

            {effMode === 'fixed' && pro && (
              <Field label="Ends on">
                <input
                  type="date"
                  min={dateInputValue(now, 0)}
                  max={dateInputValue(now, 90)}
                  value={expiresOn}
                  onChange={(e) => setExpiresOn(e.target.value)}
                  className={inputCls}
                />
              </Field>
            )}

            {effMode === 'rolling' && (
              <Field label="Each pass expires after (hours)">
                <input
                  type="number"
                  min={1}
                  max={720}
                  value={rollingHours}
                  onChange={(e) => setRollingHours(Number(e.target.value))}
                  className={inputCls}
                />
                <span className="mt-1 block text-xs text-neutral-500">
                  e.g. 48 = &ldquo;expires 48 hours after saving&rdquo;.
                </span>
              </Field>
            )}

            {effMode === 'recurring' && (
              <div className="space-y-3">
                <Field label="Open on">
                  <div className="flex flex-wrap gap-1.5">
                    {DAY_LABELS.map((d, i) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => toggleDay(i)}
                        className={`h-10 w-12 rounded-xl text-sm font-bold ${
                          days.includes(i) ? 'bg-hint-600 text-white' : 'bg-neutral-100 text-neutral-700'
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="From">
                    <select
                      value={startHour}
                      onChange={(e) => setStartHour(Number(e.target.value))}
                      className={inputCls}
                    >
                      {HOURS.map((h) => (
                        <option key={h} value={h}>
                          {formatHour(h)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Until">
                    <select
                      value={endHour}
                      onChange={(e) => setEndHour(Number(e.target.value))}
                      className={inputCls}
                    >
                      {HOURS.map((h) => (
                        <option key={h} value={h}>
                          {formatHour(h)}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <p className="text-xs text-neutral-500">
                  Slow-hours recycling: the offer turns itself on and off every week. Passes outside the window
                  show &ldquo;Opens soon&rdquo;.
                </p>
              </div>
            )}

            <Field label="Quantity cap (first N people to save)">
              <input
                type="number"
                min={1}
                value={pro ? claimLimit : ''}
                placeholder="Unlimited"
                onChange={(e) => setClaimLimit(e.target.value)}
                className={inputCls}
              />
            </Field>
          </fieldset>
        </Group>

        {/* 4. Visual branding */}
        <Group n={4} title="Visual branding (wallet ready)" locked={!pro} onUpgrade={onUpgrade}>
          <fieldset disabled={!pro} className="space-y-4">
            <Field label="Full-bleed brand color">
              <div className="flex flex-wrap items-center gap-2">
                {BRAND_PRESETS.map((p) => (
                  <button
                    key={p.hex}
                    type="button"
                    aria-label={p.label}
                    onClick={() => setBrandColor(p.hex)}
                    style={{ backgroundColor: p.hex }}
                    className={`h-9 w-9 rounded-full ${
                      brand.toLowerCase() === p.hex ? 'ring-2 ring-neutral-900 ring-offset-2' : ''
                    } disabled:opacity-40`}
                  />
                ))}
                <input
                  type="color"
                  aria-label="Pick any color"
                  value={isHexColor(brandColor) ? brandColor : DEFAULT_BRAND_COLOR}
                  onChange={(e) => setBrandColor(e.target.value)}
                  className="h-9 w-12 rounded-lg border border-neutral-300 bg-white p-0.5"
                />
                <input
                  value={brandColor}
                  onChange={(e) => setBrandColor(e.target.value)}
                  maxLength={7}
                  className={`${inputCls} !w-28 font-mono`}
                  aria-label="Hex color"
                />
              </div>
            </Field>
            <p className="rounded-xl bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
              Logo: your business icon {business.emoji}. Hero photo upload arrives when file storage is added.
            </p>
          </fieldset>
        </Group>

        {/* 5. Redemption & POS */}
        <Group n={5} title="Redemption & POS" locked={!pro} onUpgrade={onUpgrade}>
          <fieldset disabled={!pro} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Redemption method">
                <select
                  value={effMethod}
                  onChange={(e) => setMethod(e.target.value as RedemptionMethod)}
                  className={inputCls}
                >
                  <option value="qr">Dynamic QR code</option>
                  <option value="code">POS promo code</option>
                  <option value="tap">Cashier tap-to-redeem</option>
                </select>
              </Field>
              <Field label="Per-customer limit">
                <select
                  value={effLimit}
                  onChange={(e) => setLimit(e.target.value as PerCustomerLimit)}
                  className={inputCls}
                >
                  {limitOptions.map((o) => (
                    <option key={o} value={o}>
                      {o === 'once' ? '1 per customer' : o === 'weekly' ? '1 per week' : 'Unlimited while active'}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Promo code (3 to 15 characters)">
              <input
                value={pro ? customCode : autoCode}
                maxLength={15}
                placeholder={autoCode}
                onChange={(e) => setCustomCode(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
                className={`${inputCls} font-mono uppercase`}
              />
            </Field>
          </fieldset>
        </Group>

        {error && (
          <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
            {error}
          </p>
        )}
        {published && (
          <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
            Published &ldquo;{published}&rdquo;. It is live in the consumer feed now.
          </p>
        )}

        <button
          type="button"
          onClick={handlePublish}
          disabled={quotaReached || !approved}
          className="w-full rounded-2xl bg-hint-600 py-4 text-base font-bold text-white shadow-lg shadow-hint-600/30 disabled:bg-neutral-300 disabled:shadow-none"
        >
          {quotaReached ? 'Monthly deal limit reached' : 'Publish deal'}
        </button>
        {quotaReached && (
          <p className="text-center text-sm text-neutral-600">
            Free Starter includes {quota} deals a month.{' '}
            <button type="button" onClick={onUpgrade} className="font-bold text-hint-700 underline">
              Upgrade for unlimited
            </button>
            .
          </p>
        )}
      </div>

      <div className="lg:sticky lg:top-20 lg:self-start">
        <p className="mb-3 text-center text-xs font-bold uppercase tracking-widest text-neutral-500">
          Live wallet pass preview
        </p>
        <WalletPassPreview
          businessName={business.name}
          emoji={business.emoji}
          label={previewLabel}
          title={title}
          terms={[minSpend && pro ? `Valid on orders of $${minSpend}+.` : '', terms].filter(Boolean).join(' ')}
          brandColor={brand}
          code={code}
          method={effMethod}
          expiryText={expiryText}
          stamps={effPunch > 1 ? { done: 0, total: effPunch } : null}
          hint={hint}
        />
      </div>
    </div>
  );
}

function Group({
  n,
  title,
  locked,
  onUpgrade,
  children,
}: {
  n: number;
  title: string;
  locked?: boolean;
  onUpgrade?: () => void;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-neutral-200">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-base font-bold text-neutral-900">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-hint-100 text-xs font-black text-hint-700">
            {n}
          </span>
          {title}
        </h3>
        {locked && (
          <button
            type="button"
            onClick={onUpgrade}
            className="rounded-full bg-hint-100 px-2.5 py-1 text-[11px] font-bold text-hint-700"
          >
            🔒 Pro
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
  locked,
  onUpgrade,
}: {
  label: string;
  children: ReactNode;
  locked?: boolean;
  onUpgrade?: () => void;
}) {
  // A div (not a label) so the Pro badge button never hijacks clicks meant for the input.
  return (
    <div className="block">
      <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {label}
        {locked && (
          <button
            type="button"
            onClick={onUpgrade}
            className="rounded-full bg-hint-100 px-2 py-0.5 text-[10px] font-bold text-hint-700"
          >
            🔒 Pro
          </button>
        )}
      </span>
      <div className="mt-1">{children}</div>
    </div>
  );
}
