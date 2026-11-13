'use client';

import { useState } from 'react';
import { useStore } from '@/lib/store';
import { applePassJson, googleOfferObject, WALLET_GEOFENCE_METERS } from '@/lib/wallet';
import type { Business, Deal, Pass } from '@/types/localhints';

interface WalletPayloadPreviewProps {
  deal: Deal;
  business: Business;
  pass: Pass | null;
  now: number;
}

type Target = 'apple' | 'google';

/**
 * "Add to Apple Wallet / Google Wallet" buttons. Until the signing server exists they open a preview of the
 * exact payload that will be sent to each wallet (see lib/wallet.ts and docs/WALLET_RADIUS_PUSH.md).
 */
export function WalletPayloadPreview({ deal, business, pass, now }: WalletPayloadPreviewProps) {
  const { notify } = useStore();
  const [target, setTarget] = useState<Target | null>(null);

  const origin = typeof window === 'undefined' ? undefined : window.location.origin;
  const json = (() => {
    if (!pass || !target) return '';
    const ctx = { deal, business, pass, now, origin };
    return JSON.stringify(target === 'apple' ? applePassJson(ctx) : googleOfferObject(ctx), null, 2);
  })();

  const toggle = (t: Target) => setTarget((cur) => (cur === t ? null : t));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      notify('Payload copied', 'info');
    } catch {
      notify('Could not copy. Select the text and copy it manually.', 'error');
    }
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => toggle('apple')}
          aria-pressed={target === 'apple'}
          className={`rounded-xl py-3 text-xs font-bold ${
            target === 'apple' ? 'bg-neutral-700 text-white' : 'bg-black text-white'
          }`}
        >
           Add to Apple Wallet
        </button>
        <button
          type="button"
          onClick={() => toggle('google')}
          aria-pressed={target === 'google'}
          className={`rounded-xl py-3 text-xs font-bold ring-1 ring-neutral-300 ${
            target === 'google' ? 'bg-neutral-100 text-neutral-900' : 'bg-white text-neutral-800'
          }`}
        >
          Add to Google Wallet
        </button>
      </div>

      {target && (
        <div className="rounded-2xl bg-neutral-900 p-3 text-neutral-100">
          <p className="text-xs font-semibold text-white">
            {target === 'apple' ? 'Apple Wallet: pass.json' : 'Google Wallet: Offer object'} (preview)
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-neutral-400">
            Wallet integration is the next build step. This is the exact payload the server will sign and serve.
            It already includes the business location so the pass surfaces on the lock screen within about{' '}
            {WALLET_GEOFENCE_METERS} m of the shop.
          </p>
          {pass ? (
            <>
              <pre className="mt-2 max-h-64 overflow-auto rounded-xl bg-black/40 p-3 text-[11px] leading-snug">{json}</pre>
              <button
                type="button"
                onClick={copy}
                className="mt-2 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white"
              >
                Copy JSON
              </button>
            </>
          ) : (
            <p className="mt-2 rounded-xl bg-black/40 p-3 text-xs text-neutral-300">
              Add the pass to your wallet first to see its payload.
            </p>
          )}
        </div>
      )}
      <p className="text-center text-[11px] text-neutral-400">
        Demo: the QR pattern is decorative, not scannable.
      </p>
    </div>
  );
}
