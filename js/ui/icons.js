/* 議事録クエスト — 線画アイコン(24×24、currentColor)。絵文字の代わりに使い、見た目をそろえる。 */
(function (root) {
  'use strict';
  const GQ = (root.GQ = root.GQ || {});
  const P = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h5v-6h4v6h5V9.5"/>',
    book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/>',
    open: '<path d="M2.5 5h6a3.5 3.5 0 0 1 3.5 3.5V21a2.5 2.5 0 0 0-2.5-2.5h-7z"/><path d="M21.5 5h-6A3.5 3.5 0 0 0 12 8.5V21a2.5 2.5 0 0 1 2.5-2.5h7z"/>',
    sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 1 1 3.4 2.4c-.7.3-1 .8-1 1.5v.6"/><path d="M12 16.8v.2"/>',
    play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="1.5"/>',
    replay: '<path d="M4 12a8 8 0 1 0 2.3-5.7"/><path d="M4 4v4.5h4.5"/>',
    check: '<path d="M5 12.5 10 17.5 19.5 7"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    tri: '<path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5M12 17.2v.2"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    left: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    right: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    save: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7M8 21v-7h8v7"/>',
    flame: '<path d="M12 3c.8 3.2 5.5 5.2 5.5 10.2a5.5 5.5 0 0 1-11 0c0-2.3 1-3.8 2.3-4.9-.1 2 .9 3.2 2.1 3.2 0-3.2-.9-5.3 1.1-8.5z"/>',
    cc: '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M7 11h3M13 11h4M7 14.5h6M15.5 14.5H17"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.2a6.5 6.5 0 0 1 3.5 5.8"/>',
    pen: '<path d="M4 20l4.2-1L19 8.2 15.8 5 5 15.8z"/><path d="M13.8 7l3.2 3.2"/>',
    file: '<path d="M6 2.5h8.5L19 7v14.5H6z"/><path d="M14 2.5V7.5h5M9 12h7M9 15.5h7M9 19h4"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" stroke-width="2.6"/>',
    star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z"/>',
    trophy: '<path d="M8 4h8v5.5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3.2 4M16 6h3a3 3 0 0 1-3.2 4M12 13.5V17M8.5 21h7M10 17h4v4h-4z"/>',
    shield: '<path d="M12 3l7.5 3v5.5c0 4.5-3.2 8-7.5 9.5-4.3-1.5-7.5-5-7.5-9.5V6z"/><path d="M9 12l2.2 2.2L15.5 10"/>',
    headphones: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3.5" y="14" width="4" height="6.5" rx="1.5"/><rect x="16.5" y="14" width="4" height="6.5" rx="1.5"/>',
    bolt: '<path d="M13 2.5 5 13.5h6l-1 8 8-11h-6z"/>',
    trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
    layers: '<path d="M12 3 2.5 8 12 13l9.5-5z"/><path d="M2.5 13 12 18l9.5-5"/>',
    seal: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="7" y="7" width="10" height="10" rx="1"/>',
    video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10.5 21 7.5v9l-5-3"/>',
    candle: '<path d="M9 10h6v11H9z"/><path d="M12 10V7.5"/><path d="M12 2.8c1.3 1.6 1.8 2.6 0 4.2-1.8-1.6-1.3-2.6 0-4.2z"/>',
    message: '<path d="M4 5h16v11H9l-5 4z"/>',
    sound: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11"/>',
    door: '<path d="M6 21V4h10v17M4 21h16"/><path d="M13 12.5h.01" stroke-width="2.6"/>',
  };
  function icon(name, cls) {
    return `<svg class="i${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
  }
  // シリーズの紋章(表紙に使う)
  const EMBLEM = {
    work: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="10" y="18" width="44" height="32" rx="3"/><path d="M24 18v-5h16v5M10 30h44M28 30v5h8v-5"/></svg>',
    maou: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M14 52V26l6-6 6 6v6h12v-6l6-6 6 6v26z"/><path d="M14 52h36M28 52V42a4 4 0 0 1 8 0v10M20 20v-8M44 20v-8M20 12l4 2-4 2M44 12l4 2-4 2"/></svg>',
  };
  GQ.Icon = { icon, EMBLEM };
})(typeof globalThis !== 'undefined' ? globalThis : this);
