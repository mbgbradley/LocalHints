/* One icon set for the whole site: 24px outline icons drawn in a single color (currentColor), so they all look uniform. */
const P = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 9.5V20h14V9.5"/><path d="M10 20v-6h4v6"/>',
  map: '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14"/><path d="M15 6v14"/>',
  loop: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 013-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 01-3 3H3"/>',
  wallet: '<path d="M3 7a2 2 0 012-2h12v3"/><path d="M3 7v11a2 2 0 002 2h14a1 1 0 001-1V9a1 1 0 00-1-1H5a2 2 0 01-2-1z"/><circle cx="16.5" cy="14" r="1.2"/>',
  bell: '<path d="M6 9a6 6 0 0112 0c0 6.5 3 8 3 8H3s3-1.5 3-8"/><path d="M10.3 21a2 2 0 003.4 0"/>',
  settings: '<path d="M4 6h9"/><path d="M17 6h3"/><path d="M4 12h3"/><path d="M11 12h9"/><path d="M4 18h11"/><path d="M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  install: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8"/><path d="M8 12h8"/>',
  pin: '<path d="M12 21s7-6.2 7-11.5A7 7 0 005 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
};
export function icon(name, size = 22) {
  return `<svg class="ico-svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${P[name] || ''}</svg>`;
}
