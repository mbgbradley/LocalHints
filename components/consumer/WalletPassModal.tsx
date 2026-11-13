'use client';

import { useEffect, useState } from 'react';
import { isDealExpired, isDealLive, useStore } from '@/lib/store';
import { Sheet } from '@/components/ui/Sheet';
import { dealLabel, timeLeft } from '@/components/ui/format';
import { WalletPassPreview, type PassVisualState } from '@/components/business/WalletPassPreview';

interface WalletPassModalProps {
  dealId: string | null;
  onClose: () => void;
}

export function WalletPassModal({ dealId, onClose }: WalletPassModalProps) {
  const { state, now, claimDeal, redeemPass, trackView, notify } = useStore();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Count one view each time a deal is opened.
  useEffect(() => {
    setConfirming(false);
    setError(null);
    if (dealId) trackView(dealId);
  }, [dealId, trackView]);

  const deal = dealId ? state.deals.find((d) => d.id === dealId) : undefined;
  const biz = deal ? state.businesses.find((b) => b.id === deal.businessId) : undefined;

  if (!dealId || !deal || !biz) {
    return <Sheet open={false} onClose={onClose}>{null}</Sheet>;
  }

  const pass = state.passes.find((p) => p.dealId === deal.id && p.consumerId === state.consumer.id);
  const live = isDealLive(deal, state, now);
  const expired = isDealExpired(deal, now);

  let visual: PassVisualState = 'preview';
  if (pass) {
    if (pass.redeemedAt) visual = 'redeemed';
    else if (expired) visual = 'expired';
    else visual = 'active';
  }

  const handleClaim = () => {
    const res = claimDeal(deal.id);
    if (!res.ok) setError(res.error);
    else setError(null);
  };

  const handleRedeem = () => {
    if (!pass) return;
    const res = redeemPass(pass.id);
    if (!res.ok) setError(res.error);
    else {
      setError(null);
      setConfirming(false);
    }
  };

  return (
    <Sheet open onClose={onClose} title={biz.name}>
      <div className="space-y-4">
        <WalletPassPreview
          businessName={biz.name}
          emoji={biz.emoji}
          label={dealLabel(deal)}
          title={deal.title}
          terms={deal.terms}
          theme={deal.theme}
          code={pass ? pass.code : deal.code}
          expiryText={timeLeft(deal.expiresAt, now)}
          state={visual}
        />

        {deal.description && <p className="text-sm leading-relaxed text-slate-600">{deal.description}</p>}

        <p className="text-xs text-slate-500">📍 {biz.address}</p>

        {error && (
          <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
            {error}
          </p>
        )}

        {!pass && (
          <button
            type="button"
            disabled={!live}
            onClick={handleClaim}
            className="w-full rounded-2xl bg-hint-600 py-4 text-base font-bold text-white shadow-lg shadow-hint-600/30 active:scale-[0.99] disabled:bg-slate-300 disabled:shadow-none"
          >
            {live ? 'Add pass to wallet' : 'Not available right now'}
          </button>
        )}

        {pass && visual === 'active' && !confirming && (
          <div className="space-y-2">
            <p className="text-center text-xs text-slate-500">
              Show this screen at the counter. The cashier taps Redeem.
            </p>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="w-full rounded-2xl bg-slate-900 py-4 text-base font-bold text-white active:scale-[0.99]"
            >
              Cashier: redeem pass
            </button>
          </div>
        )}

        {pass && visual === 'active' && confirming && (
          <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-900">
              Redeem now? This marks the pass as used and cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="flex-1 rounded-xl bg-white py-3 text-sm font-bold text-slate-700 ring-1 ring-slate-200"
              >
                Not yet
              </button>
              <button
                type="button"
                onClick={handleRedeem}
                className="flex-1 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white"
              >
                Confirm redeem
              </button>
            </div>
          </div>
        )}

        {pass && visual === 'redeemed' && (
          <p className="rounded-2xl bg-emerald-50 py-3 text-center text-sm font-semibold text-emerald-700">
            Redeemed. Thanks for shopping local!
          </p>
        )}

        {pass && visual === 'expired' && (
          <p className="rounded-2xl bg-slate-100 py-3 text-center text-sm font-semibold text-slate-600">
            This pass has expired.
          </p>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => notify('Prototype: .pkpass files need a signing server', 'info')}
            className="rounded-xl bg-black py-3 text-xs font-bold text-white"
          >
            Add to Apple Wallet
          </button>
          <button
            type="button"
            onClick={() => notify('Prototype: Google Wallet needs the Passes API', 'info')}
            className="rounded-xl bg-white py-3 text-xs font-bold text-slate-800 ring-1 ring-slate-300"
          >
            Add to Google Wallet
          </button>
        </div>
        <p className="text-center text-[11px] text-slate-400">
          Demo code: the pattern above is decorative, not a scannable QR.
        </p>
      </div>
    </Sheet>
  );
}
