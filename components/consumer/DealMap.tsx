'use client';

import { useEffect, useRef } from 'react';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Icon } from '@/components/ui/Icon';

/** One pin per business. `label` is the headline of its best live deal. */
export interface MapPin {
  id: string;
  emoji: string;
  label: string;
  /** Extra live deals at this business beyond the labelled one. */
  extra: number;
  lat: number;
  lng: number;
}

interface DealMapProps {
  pins: MapPin[];
  center: { lat: number; lng: number };
  radiusMiles: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Asks the app to move the shopper to their real location. */
  onLocate: () => void;
  locating: boolean;
}

const METERS_PER_MILE = 1609.34;

function esc(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function pinHtml(pin: MapPin, selected: boolean): string {
  const tone = selected
    ? 'bg-neutral-900 text-white ring-neutral-900'
    : 'bg-white text-neutral-900 ring-black/10';
  const extra = pin.extra > 0 ? ` <span class="opacity-60">+${pin.extra}</span>` : '';
  return `<div class="-tranneutral-x-1/2 -tranneutral-y-full whitespace-nowrap">
    <div class="flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-bold shadow-lg ring-1 ${tone}">
      <span class="text-sm leading-none">${esc(pin.emoji)}</span><span>${esc(pin.label)}${extra}</span>
    </div>
    <div class="mx-auto -mt-1 h-2 w-2 rotate-45 ${selected ? 'bg-neutral-900' : 'bg-white'} shadow"></div>
  </div>`;
}

/** Interactive map of every live deal near the shopper. Loaded client-side only (see ConsumerFeed). */
export default function DealMap({
  pins,
  center,
  radiusMiles,
  selectedId,
  onSelect,
  onLocate,
  locating,
}: DealMapProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const fittedKey = useRef<string>('');
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // Create the map once.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const map = L.map(host, { zoomControl: false, attributionControl: true }).setView(
      [center.lat, center.lng],
      14,
    );
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    map.on('click', () => onSelectRef.current(null));
    mapRef.current = map;
    const t = setTimeout(() => map.invalidateSize(), 0);
    return () => {
      clearTimeout(t);
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      fittedKey.current = '';
    };
    // The map is created once; later prop changes are handled by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redraw pins, the shopper's dot and the radius ring whenever inputs change.
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    const ringMeters = radiusMiles * METERS_PER_MILE;
    L.circle([center.lat, center.lng], {
      radius: ringMeters,
      color: '#4f46e5',
      weight: 1,
      opacity: 0.5,
      fillColor: '#4f46e5',
      fillOpacity: 0.05,
      interactive: false,
    }).addTo(layer);
    L.circleMarker([center.lat, center.lng], {
      radius: 7,
      color: '#ffffff',
      weight: 3,
      fillColor: '#2563eb',
      fillOpacity: 1,
      interactive: false,
    }).addTo(layer);

    for (const pin of pins) {
      const selected = pin.id === selectedId;
      const marker = L.marker([pin.lat, pin.lng], {
        icon: L.divIcon({ className: 'lh-pin', html: pinHtml(pin, selected), iconSize: [0, 0] }),
        zIndexOffset: selected ? 1000 : 0,
        keyboard: true,
        title: pin.label,
      });
      // Markers do not bubble clicks to the map, so selecting a pin will not also clear the selection.
      marker.on('click', () => onSelectRef.current(pin.id));
      marker.addTo(layer);
    }

    // Fit the view when the set of pins or the shopper location changes, not on every selection.
    const key = `${center.lat.toFixed(3)},${center.lng.toFixed(3)}|${radiusMiles}|${pins.map((p) => p.id).join(',')}`;
    if (key !== fittedKey.current) {
      fittedKey.current = key;
      const points: L.LatLngTuple[] = [[center.lat, center.lng], ...pins.map((p) => [p.lat, p.lng] as L.LatLngTuple)];
      if (pins.length === 0) {
        map.fitBounds(L.circle([center.lat, center.lng], { radius: ringMeters }).getBounds(), { padding: [24, 24] });
      } else {
        map.fitBounds(L.latLngBounds(points), { padding: [56, 56], maxZoom: 16 });
      }
    }
  }, [pins, center.lat, center.lng, radiusMiles, selectedId]);

  const recenter = () => {
    const map = mapRef.current;
    if (!map) return;
    const points: L.LatLngTuple[] = [[center.lat, center.lng], ...pins.map((p) => [p.lat, p.lng] as L.LatLngTuple)];
    map.fitBounds(L.latLngBounds(points), { padding: [56, 56], maxZoom: 16 });
  };

  return (
    <div className="relative h-full w-full">
      <div ref={hostRef} className="h-full w-full" role="region" aria-label="Map of nearby deals" />
      <div className="absolute left-3 top-3 z-[500] flex flex-col gap-2">
        <button
          type="button"
          onClick={onLocate}
          disabled={locating}
          aria-label="Use my location"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-neutral-800 shadow-lg ring-1 ring-black/10 active:bg-neutral-100 disabled:opacity-60"
        >
          <Icon name="locate" className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={recenter}
          aria-label="Show all deals"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-neutral-800 shadow-lg ring-1 ring-black/10 active:bg-neutral-100"
        >
          <Icon name="map" className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
