'use client';

import { useEffect, useState } from 'react';
import {
  isDealLive,
  isPassUpgraded,
  passExpiresAt,
  passStatus,
  saveCapReached,
  useStore,
} from '@/lib/store';
import { Sheet } from '@/components/ui/Sheet';
import {
  dealLabel,
  nextOpenText,
  scheduleText,
  timeLeft,
  timeLeftMs,
} from '@/components/ui/format';
import { WalletPassPreview, type PassVisualState } from '@/components/business/WalletPassPreview';
import { WalletPayloadPreview } from './WalletPayloadPreview';

interface WalletPassModalProps {
  dealId: string | null;
  onClose: () => void;
  /** Lets the Main Street Loop card jump to a neighboring business's offer. */
  onOpenDeal?: (dealId: string) => void;
}

export function WalletPassModal({ dealId, onClose, onOpenDeal }: WalletPassModalProps) {
  const { state, now, claimDeal, redeemPass, saveViaReferral, trackView, notify } = useStore();
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
    return (
      <Sheet open={false} onClose={onClose}>
        {null}
      </Sheet>
    );
  }

  const pass = state.passes.find((p) => p.dealId === deal.id && p.consumerId === state.consumer.id);
  const live = isDealLive(deal, state, now);
  const capReached = saveCapReached(state, biz, now);
  const status = pass ? passStatus(deal, pass, now) : null;
  const upgraded = pass ? isPassUpgraded(deal, pass) : false;
  const upgrade = deal.shareUpgrade;

  const visual: PassVisualState = status ?? 'preview';
  const label = dealLabel(deal, upgraded && upgrade ? upgrade.upgradedValue : undefined);

  let hint: string | null = null;
  if (upgrade && !upgraded) {
    const left = pass ? upgrade.friendsNeeded - pass.friendSaves : upgrade.friendsNeeded;
    hint = pass
      ? `Share with ${left} more ${left === 1 ? 'friend' : 'friends'} to upgrade to ${dealLabel(deal, upgrade.upgradedValue)}`
      : `Save it, then share with ${left} ${left === 1 ? 'friend' : 'friends'} to upgrade to ${dealLabel(deal, upgrade.upgradedValue)}`;
  } else if (upgrade && upgraded) {
    hint = 'Friends saved it. Your offer was upgraded!';
  }

  let expiryText: string;
  if (pass && deal.expirationMode === 'rolling') {
    expiryText = timeLeftMs(passExpiresAt(deal, pass) - now);
  } else if (deal.recurring) {
    expiryText = scheduleText(deal.recurring);
  } else {
    expiryText = timeLeft(deal.expiresAt, now);
  }

  const partner = deal.partnerBusinessId
    ? state.businesses.find((b) => b.id === deal.partnerBusinessId)
    : undefined;
  const partnerDeal = partner
    ? state.deals.find((d) => d.businessId === partner.id && isDealLive(d, state, now))
    : undefined;
  const showLoop = !!pass && (pass.stamps > 0 || !!pass.redeemedAt) && !!partner && !!partnerDeal;

  const handleClaim = () => {
    const res = claimDeal(deal.id);
    setError(res.ok ? null : res.error);
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

  const handleCopy = async () => {
    if (!pass) return;
    try {
      await navigator.clipboard.writeText(`https://localhints.com/p/${pass.referralCode}`);
      notify('Link copied. Text it to a friend!', 'info');
    } catch {
      notify('Could not copy. Select the link and copy it manually.', 'error');
    }
  };

  const handleFriend = () => {
    if (!pass) return;
    const res = saveViaReferral(pass.referralCode);
    setError(res.ok ? null : res.error);
  };

  const canUse = status === 'active';
  const shareable = !!pass && (status === 'active' || status === 'scheduled' || status === 'paused');
  const cardLabel = deal.punchVisits > 1 ? 'Add stamp' : 'Cashier: redeem pass';

  return (
    <Sheet open onClose={onClose} title={biz.name}>
      <div className="space-y-4">
        <WalletPassPreview
          businessName={biz.name}
          emoji={biz.emoji}
          label={label}
          title={deal.title}
          terms={[deal.minSpend ? `Valid on orders of $${deal.minSpend}+.` : '', deal.terms]
            .filter(Boolean)
            .join(' ')}
          brandColor={deal.brandColor}
          code={deal.code}
          qrValue={pass ? `${pass.code}${upgraded ? ':UP' : ''}` : undefined}
          method={deal.redemptionMethod}
          expiryText={expiryText}
          state={visual}
          stamps={deal.punchVisits > 1 ? { done: pass ? pass.stamps : 0, total: deal.punchVisits } : null}
          upgraded={upgraded}
          hint={hint}
          scheduleNote={deal.recurring ? (nextOpenText(deal.recurring, now) ?? 'Not active right now') : null}
        />

        {deal.description && <p className="text-sm leading-relaxed text-neutral-600">{deal.description}</p>}
        <p className="text-xs text-neutral-500">📍 {biz.address}</p>

        {error && (
          <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
            {error}
          </p>
        )}

        {!pass && (
          <>
            <button
              type="button"
              disabled={!live || capReached}
              onClick={handleClaim}
              className="w-full rounded-2xl bg-hint-600 py-4 text-base font-bold text-white shadow-lg shadow-hint-600/30 active:scale-[0.99] disabled:bg-neutral-300 disabled:shadow-none"
            >
              {!live
                ? 'Not available right now'
                : capReached
                  ? 'Save limit reached this month'
                  : 'Add pass to wallet'}
            </button>
            {capReached && live && (
              <p className="text-center text-xs text-neutral-500">
                This business is at its monthly save limit. Check back next month.
              </p>
            )}
          </>
        )}

        {pass && canUse && deal.redemptionMethod === 'tap' && !confirming && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="w-full rounded-2xl bg-neutral-900 py-4 text-base font-bold text-white active:scale-[0.99]"
          >
            {cardLabel}
          </button>
        )}

        {pass && canUse && deal.redemptionMethod === 'tap' && confirming && (
          <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-900">
              {deal.punchVisits > 1 ? 'Add a stamp now?' : 'Redeem now? This cannot be undone.'}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="flex-1 rounded-xl bg-white py-3 text-sm font-bold text-neutral-700 ring-1 ring-neutral-200"
              >
                Not yet
              </button>
              <button
                type="button"
                onClick={handleRedeem}
                className="flex-1 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white"
              >
                Confirm
              </button>
            </div>
          </div>
        )}

        {pass && canUse && deal.redemptionMethod !== 'tap' && (
          <p className="rounded-xl bg-neutral-50 px-3 py-3 text-center text-xs text-neutral-600">
            {deal.redemptionMethod === 'qr'
              ? 'The cashier scans this QR code.'
              : 'Read the promo code to the cashier.'}{' '}
            <span className="text-neutral-400">
              Demo: a business enters{' '}
              <b className="font-mono text-neutral-700">{pass.code}</b> under Redeem a pass
            </span>
          </p>
        )}

        {status === 'complete' && (
          <p className="rounded-2xl bg-emerald-50 py-3 text-center text-sm font-semibold text-emerald-700">
            {deal.punchVisits > 1 ? 'Card complete! Enjoy your reward.' : 'Redeemed. Thanks for shopping local!'}
          </p>
        )}
        {status === 'voided' && (
          <p className="rounded-2xl bg-rose-50 py-3 text-center text-sm font-semibold text-rose-700">
            Offer ended by merchant. This pass moved to Expired Passes.
          </p>
        )}
        {status === 'paused' && (
          <p className="rounded-2xl bg-amber-50 py-3 text-center text-sm font-semibold text-amber-700">
            The merchant paused this offer. It will wake up again if they resume it.
          </p>
        )}
        {status === 'scheduled' && (
          <p className="rounded-2xl bg-indigo-50 py-3 text-center text-sm font-semibold text-indigo-700">
            {deal.recurring ? `Valid ${scheduleText(deal.recurring)}.` : 'Not active right now.'}
          </p>
        )}
        {status === 'expired' && (
          <p className="rounded-2xl bg-neutral-100 py-3 text-center text-sm font-semibold text-neutral-600">
            This pass has expired.
          </p>
        )}

        {shareable && pass && (
          <div className="space-y-2 rounded-2xl bg-hint-50 p-4">
            <p className="text-sm font-bold text-hint-900">
              {upgrade ? 'Share to upgrade' : 'Share with a friend'}
            </p>
            <p className="text-xs text-hint-800">
              {upgrade
                ? `When ${upgrade.friendsNeeded} ${upgrade.friendsNeeded === 1 ? 'friend saves' : 'friends save'} the deal, this pass redraws itself as ${dealLabel(deal, upgrade.upgradedValue)}.`
                : 'Friends can save their own pass from your link.'}{' '}
              ({pass.friendSaves} saved so far)
            </p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-white px-3 py-2 text-xs text-neutral-700">
                localhints.com/p/{pass.referralCode}
              </code>
              <button
                type="button"
                onClick={handleCopy}
                className="shrink-0 rounded-lg bg-hint-600 px-3 py-2 text-xs font-bold text-white"
              >
                Copy
              </button>
            </div>
            <button
              type="button"
              onClick={handleFriend}
              className="w-full rounded-lg bg-white py-2 text-xs font-bold text-hint-700 ring-1 ring-hint-200"
            >
              Demo: pretend a friend just saved it
            </button>
          </div>
        )}

        {showLoop && partner && partnerDeal && (
          <button
            type="button"
            onClick={() => onOpenDeal?.(partnerDeal.id)}
            className="flex w-full items-center gap-3 rounded-2xl bg-amber-50 p-4 text-left ring-1 ring-amber-200"
          >
            <span className="text-3xl">{partner.emoji}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-amber-700">
                Main Street Loop · next stop
              </span>
              <span className="block truncate font-bold text-neutral-900">{partner.name}</span>
              <span className="block truncate text-xs text-neutral-600">
                {dealLabel(partnerDeal)} · {partnerDeal.title}
              </span>
            </span>
            <span className="text-lg">›</span>
          </button>
        )}

        <WalletPayloadPreview deal={deal} business={biz} pass={pass ?? null} now={now} />
      </div>
    </Sheet>
  );
}
