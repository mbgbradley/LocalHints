'use client';

import { useMemo } from 'react';
import type { RedemptionMethod } from '@/types/localhints';
import { readableText } from '@/components/ui/format';

const GRID = 25;

/** Deterministic pseudo-random matrix seeded from `value`, with QR-style finder squares. */
function buildMatrix(value: string): boolean[][] {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let seed = h >>> 0 || 1;
  const rand = (): number => {
    seed ^= seed << 13;
    seed >>>= 0;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    seed >>>= 0;
    return seed / 4294967296;
  };

  const m: boolean[][] = Array.from({ length: GRID }, () =>
    Array.from({ length: GRID }, () => rand() > 0.5),
  );

  const finder = (ox: number, oy: number) => {
    for (let y = -1; y <= 7; y++) {
      for (let x = -1; x <= 7; x++) {
        const xx = ox + x;
        const yy = oy + y;
        if (xx < 0 || yy < 0 || xx >= GRID || yy >= GRID) continue;
        const inRing = x >= 0 && x <= 6 && y >= 0 && y <= 6;
        const border = x === 0 || x === 6 || y === 0 || y === 6;
        const core = x >= 2 && x <= 4 && y >= 2 && y <= 4;
        m[yy][xx] = inRing && (border || core);
      }
    }
  };
  finder(0, 0);
  finder(GRID - 7, 0);
  finder(0, GRID - 7);
  return m;
}

/** Decorative QR-style code. Demo only: it is NOT scannable. Swap for a real QR lib later. */
export function QrPattern({ value, size = 160 }: { value: string; size?: number }) {
  const cells = useMemo(() => buildMatrix(value), [value]);
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${GRID} ${GRID}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={`Pass code ${value}`}
    >
      <rect width={GRID} height={GRID} fill="#ffffff" />
      {cells.flatMap((row, y) =>
        row.map((on, x) =>
          on ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="#0f172a" /> : null,
        ),
      )}
    </svg>
  );
}

export type PassVisualState =
  | 'preview'
  | 'active'
  | 'complete'
  | 'expired'
  | 'voided'
  | 'paused'
  | 'scheduled';

const STATE_STAMP: Partial<Record<PassVisualState, { text: string; tone: string }>> = {
  complete: { text: 'Redeemed ✓', tone: 'border-emerald-400 text-emerald-600' },
  expired: { text: 'Expired', tone: 'border-neutral-400 text-neutral-500' },
  voided: { text: 'Offer ended by merchant', tone: 'border-rose-400 text-rose-600' },
  paused: { text: 'Paused by merchant', tone: 'border-amber-400 text-amber-600' },
};

interface WalletPassPreviewProps {
  businessName: string;
  emoji: string;
  /** Headline, e.g. "20% OFF". */
  label: string;
  title: string;
  terms?: string;
  /** Hex color that tints the whole card. */
  brandColor: string;
  /** Promo code (shown big when the method is "code"). */
  code: string;
  /** What the QR encodes. Changes when the pass upgrades, so the QR "redraws". */
  qrValue?: string;
  method?: RedemptionMethod;
  expiryText: string;
  state?: PassVisualState;
  /** Punch card progress. Null for single-use passes. */
  stamps?: { done: number; total: number } | null;
  upgraded?: boolean;
  /** One-line note under the headline, e.g. "Share with 2 friends to upgrade to 25% OFF". */
  hint?: string | null;
  /** Shown when the pass is outside a recurring window. */
  scheduleNote?: string | null;
}

/** The visual wallet pass. Used by the coupon builder (live preview) and the consumer wallet modal. */
export function WalletPassPreview({
  businessName,
  emoji,
  label,
  title,
  terms,
  brandColor,
  code,
  qrValue,
  method = 'qr',
  expiryText,
  state = 'preview',
  stamps = null,
  upgraded = false,
  hint = null,
  scheduleNote = null,
}: WalletPassPreviewProps) {
  const fg = readableText(brandColor);
  const dead = state === 'complete' || state === 'expired' || state === 'voided' || state === 'paused';
  const stamp = STATE_STAMP[state];
  const showScheduled = state === 'scheduled';

  return (
    <div className="relative mx-auto w-full max-w-[340px]">
      <div
        className={`relative overflow-hidden rounded-3xl p-5 shadow-xl ${
          dead ? 'opacity-60 saturate-50' : ''
        }`}
        style={{ backgroundColor: brandColor, color: fg }}
      >
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/15 via-transparent to-black/25" />

        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/25 text-2xl">
              {emoji}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold leading-tight">{businessName || 'Your business'}</p>
              <p className="text-[10px] font-semibold uppercase tracking-widest opacity-70">
                LocalHints pass
              </p>
            </div>
            {upgraded && (
              <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-600">
                Upgraded
              </span>
            )}
          </div>

          <p className="mt-5 text-4xl font-black leading-none tracking-tight">{label}</p>
          <p className="mt-2 text-base font-semibold leading-snug">{title || 'Your offer title'}</p>
          {hint ? <p className="mt-2 rounded-lg bg-black/20 px-2 py-1 text-xs font-semibold">{hint}</p> : null}
          {terms ? <p className="mt-2 text-xs leading-snug opacity-75">{terms}</p> : null}

          {stamps && (
            <div className="mt-4" aria-label={`${stamps.done} of ${stamps.total} stamps`}>
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: stamps.total }, (_, i) => (
                  <span
                    key={i}
                    className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-black ${
                      i < stamps.done ? 'border-transparent bg-white text-neutral-900' : 'border-current opacity-50'
                    }`}
                  >
                    {i < stamps.done ? '✓' : i + 1}
                  </span>
                ))}
              </div>
              <p className="mt-1 text-xs font-semibold opacity-85">
                {stamps.done} of {stamps.total} stamps
              </p>
            </div>
          )}

          <div className="relative -mx-5 my-5">
            <div className="border-t-2 border-dashed border-current opacity-40" />
            <span className="absolute -left-3 -top-3 h-6 w-6 rounded-full bg-neutral-100" />
            <span className="absolute -right-3 -top-3 h-6 w-6 rounded-full bg-neutral-100" />
          </div>

          <div className="flex items-end justify-between gap-3">
            {method === 'qr' && (
              <div className={`rounded-2xl bg-white p-2 ${state === 'voided' ? 'opacity-30' : ''}`}>
                <QrPattern value={qrValue || code || 'PREVIEW'} size={112} />
              </div>
            )}
            {method === 'code' && (
              <div className="rounded-2xl bg-white px-3 py-4 text-center text-neutral-900">
                <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">POS promo code</p>
                <p className="mt-1 break-all font-mono text-2xl font-black">{code || 'CODE'}</p>
              </div>
            )}
            {method === 'tap' && (
              <div className="rounded-2xl border-2 border-dashed border-current px-3 py-4 text-center opacity-90">
                <p className="text-2xl">👆</p>
                <p className="text-[11px] font-bold uppercase tracking-wider">Cashier tap</p>
              </div>
            )}
            <div className="min-w-0 flex-1 text-right">
              <p className="text-[10px] font-semibold uppercase tracking-widest opacity-70">Pass</p>
              <p className="break-all font-mono text-sm font-bold">{qrValue ? qrValue.split(':')[0] : code}</p>
              <p className="mt-2 text-xs font-semibold opacity-85">{expiryText}</p>
            </div>
          </div>
        </div>
      </div>

      {stamp && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-4">
          <span
            className={`-rotate-12 rounded-xl border-4 bg-white/95 px-4 py-1 text-center text-xl font-black uppercase tracking-wider ${stamp.tone}`}
          >
            {stamp.text}
          </span>
        </div>
      )}
      {showScheduled && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-4">
          <span className="-rotate-6 rounded-xl border-4 border-indigo-400 bg-white/95 px-4 py-1 text-center text-lg font-black uppercase tracking-wider text-indigo-600">
            {scheduleNote || 'Not active right now'}
          </span>
        </div>
      )}
    </div>
  );
}
