'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store';
import { Sheet } from '@/components/ui/Sheet';
import { DEFAULT_CENTER, getBrowserLocation } from '@/lib/geo';
import { CATEGORIES, POINTS, type Category } from '@/types/localhints';

interface ConsumerProfileDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function ConsumerProfileDrawer({ open, onClose }: ConsumerProfileDrawerProps) {
  const { state, updateConsumer, notify } = useStore();
  const { consumer, passes } = state;
  const [name, setName] = useState(consumer.name);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (open) setName(consumer.name);
  }, [open, consumer.name]);

  const myPasses = passes.filter((p) => p.consumerId === consumer.id);
  const redeemedCount = myPasses.filter((p) => p.redeemedAt).length;

  const saveName = () => {
    const trimmed = name.trim();
    if (trimmed.length > 0 && trimmed !== consumer.name) updateConsumer({ name: trimmed });
  };

  const toggleCategory = (id: Category) => {
    const has = consumer.categories.includes(id);
    updateConsumer({
      categories: has ? consumer.categories.filter((c) => c !== id) : [...consumer.categories, id],
    });
  };

  const useMyLocation = async () => {
    setLocating(true);
    try {
      const pos = await getBrowserLocation();
      updateConsumer({ lat: pos.lat, lng: pos.lng, locationLabel: 'Your current location' });
      notify('Location updated. Demo shops may be out of range.', 'info');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not get your location.', 'error');
    } finally {
      setLocating(false);
    }
  };

  const useDemoDistrict = () => {
    updateConsumer({
      lat: DEFAULT_CENTER.lat,
      lng: DEFAULT_CENTER.lng,
      locationLabel: 'Maple Square (demo district)',
    });
    notify('Back in the demo district', 'info');
  };

  return (
    <Sheet open={open} onClose={onClose} title="Your profile">
      <div className="space-y-5">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-hint-50 p-3">
            <p className="text-2xl font-black text-hint-700">{consumer.points}</p>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-hint-600">Points</p>
          </div>
          <div className="rounded-2xl bg-neutral-100 p-3">
            <p className="text-2xl font-black text-neutral-800">{myPasses.length}</p>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Passes</p>
          </div>
          <div className="rounded-2xl bg-emerald-50 p-3">
            <p className="text-2xl font-black text-emerald-700">{redeemedCount}</p>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600">Redeemed</p>
          </div>
        </div>

        <p className="rounded-xl bg-neutral-50 px-3 py-2 text-xs leading-relaxed text-neutral-600">
          Earn <b>{POINTS.claim}</b> points for adding a pass, <b>{POINTS.redeem}</b> for redeeming it and{' '}
          <b>{POINTS.spotApproved}</b> for each community deal you spot that gets approved.
        </p>

        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-3 text-base outline-none focus:border-hint-500 focus:ring-2 focus:ring-hint-200"
          />
        </label>

        <div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Search radius
            </span>
            <span className="text-sm font-bold text-hint-700">{consumer.radiusMiles} mi</span>
          </div>
          <input
            type="range"
            min={0.5}
            max={10}
            step={0.5}
            value={consumer.radiusMiles}
            onChange={(e) => updateConsumer({ radiusMiles: Number(e.target.value) })}
            className="mt-2 w-full accent-hint-600"
            aria-label="Search radius in miles"
          />
        </div>

        <label className="flex items-start justify-between gap-4 rounded-2xl bg-neutral-50 p-4">
          <span>
            <span className="block text-sm font-semibold text-neutral-900">Nearby deal alerts</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-neutral-500">
              Let businesses within your radius send you a deal. You choose whether to add it to your wallet.
            </span>
          </span>
          <input
            type="checkbox"
            checked={consumer.notifyNearby}
            onChange={(e) => updateConsumer({ notifyNearby: e.target.checked })}
            className="mt-1 h-6 w-11 shrink-0 cursor-pointer accent-hint-600"
            aria-label="Nearby deal alerts"
          />
        </label>

        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Favorite categories
          </span>
          <div className="mt-2 flex flex-wrap gap-2">
            {CATEGORIES.map((c) => {
              const on = consumer.categories.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleCategory(c.id)}
                  className={`rounded-full px-3 py-2 text-sm font-semibold ${
                    on ? 'bg-hint-600 text-white' : 'bg-neutral-100 text-neutral-700 active:bg-neutral-200'
                  }`}
                >
                  {c.emoji} {c.label}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-neutral-500">Favorites are shown first in your feed.</p>
        </div>

        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Location</span>
          <p className="mt-1 text-sm text-neutral-700">📍 {consumer.locationLabel}</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={useMyLocation}
              disabled={locating}
              className="rounded-xl bg-neutral-900 py-3 text-sm font-bold text-white disabled:opacity-60"
            >
              {locating ? 'Locating…' : 'Use my location'}
            </button>
            <button
              type="button"
              onClick={useDemoDistrict}
              className="rounded-xl bg-white py-3 text-sm font-bold text-neutral-800 ring-1 ring-neutral-300"
            >
              Demo district
            </button>
          </div>
        </div>
      </div>
    </Sheet>
  );
}
