/* Skyhold TD — ui/icons.js
   Inline SVG icons for the HUD and panels (PixelPups-style line icons), plus a sigil for each of Circle's
   eight elements, tinted with the element colour. Statuses keep Circle's emoji. */
const P = {
  heart: '<path d="M12 20.5s-7.5-4.6-7.5-10.1A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.8c0 5.5-7.5 10.1-7.5 10.1z" fill="currentColor" stroke="none"/>',
  wave: '<path d="M3 15c2.2 0 2.2-3 4.5-3s2.3 3 4.5 3 2.3-3 4.5-3 2.3 3 4.5 3"/><path d="M3 9c2.2 0 2.2-3 4.5-3S9.8 9 12 9s2.3-3 4.5-3S18.8 9 21 9" opacity=".55"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>',
  home: '<path d="M4 11.5 12 5l8 6.5"/><path d="M6.5 10v9h11v-9"/><path d="M10 19v-5h4v5"/>',
  left: '<path d="M14.5 6 8.5 12l6 6"/>',
  right: '<path d="M9.5 6l6 6-6 6"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>',
  auto: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.8 4.8v4.4h-4.4"/>',
  speed: '<path d="M5 6.5l6 5.5-6 5.5zM12.5 6.5l6 5.5-6 5.5z" fill="currentColor"/>',
  swords: '<path d="M5 19l9.5-9.5M14.5 5H19v4.5L9.5 19M4 15l5 5M3.5 20.5l2-2"/><path d="M19 19 14 14M20.5 20.5l-2-2M15 20l5-5"/>',
  up: '<path d="M12 19V6M6 11.5 12 5.5l6 6"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.2"/>',
  coins: '<ellipse cx="12" cy="7.5" rx="6.5" ry="2.8"/><path d="M5.5 7.5v4c0 1.5 2.9 2.8 6.5 2.8s6.5-1.3 6.5-2.8v-4M5.5 11.5v4c0 1.5 2.9 2.8 6.5 2.8s6.5-1.3 6.5-2.8v-4"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  star: '<path d="M12 4.5l2.3 4.7 5.2.8-3.8 3.6.9 5.2-4.6-2.4-4.6 2.4.9-5.2L4.5 10l5.2-.8z" fill="currentColor" stroke="none"/>',
  lock: '<rect x="6" y="10.5" width="12" height="9" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  skull: '<path d="M12 4a7 7 0 0 0-7 7c0 2.4 1.2 4 3 5v3h8v-3c1.8-1 3-2.6 3-5a7 7 0 0 0-7-7z"/><circle cx="9.3" cy="11.5" r="1.4" fill="currentColor"/><circle cx="14.7" cy="11.5" r="1.4" fill="currentColor"/>',
  trophy: '<path d="M8 4.5h8v5a4 4 0 0 1-8 0zM8 6.5H5a3 3 0 0 0 3 4M16 6.5h3a3 3 0 0 1-3 4M12 13.5V17M8.5 19.5h7"/>',
  save: '<path d="M5 4.5h11l3 3v12H5z"/><path d="M8 4.5v5h7v-5M8 19.5v-5h8v5"/>',
  book: '<path d="M5 5.5a2 2 0 0 1 2-2h12v15H7a2 2 0 0 0-2 2z"/><path d="M5 20.5a2 2 0 0 1 2-2h12"/>',
  users: '<circle cx="9" cy="9" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><circle cx="16.5" cy="8" r="2.6"/><path d="M15 13.6A4.6 4.6 0 0 1 21 18"/>',
  user: '<circle cx="12" cy="8.5" r="3.6"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  bot: '<rect x="5" y="8" width="14" height="10" rx="2.5"/><path d="M12 4.5V8M9 12.5v1M15 12.5v1M3 12v3M21 12v3"/>',
  coop: '<path d="M4 12.5l3.5-3.5 3 3 3.5-3.5 4 4M7.5 9 4 12.5M16.5 9l3.5 3.5"/><path d="M8 15.5l2.5 2.5 2.5-2.5"/>',
  flag: '<path d="M6 20V4.5M6 5h11l-2.5 4L17 13H6"/>',
  music: '<path d="M9 17.5V6l10-2v11.5"/><circle cx="6.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="15.5" r="2.5"/>',
  sound: '<path d="M4.5 9.5h3l4.5-4v13l-4.5-4h-3z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  mute: '<path d="M4.5 9.5h3l4.5-4v13l-4.5-4h-3z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
  pin: '<path d="M12 21s-6.5-5.8-6.5-11a6.5 6.5 0 0 1 13 0c0 5.2-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  hammer: '<path d="M13.5 5.5 17 2l4 4-3.5 3.5z"/><path d="M15.2 7.3 4.5 18a1.4 1.4 0 0 0 2 2L17.2 9.3"/>',
  move: '<path d="M12 3v18M3 12h18"/><path d="M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>',
  music_off: '<path d="M9 17.5V6l10-2v11.5"/><circle cx="6.5" cy="17.5" r="2.5"/><path d="M3 3l18 18"/>',
  grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
  shirt: '<path d="M8 3.5 4 6l1.5 4H8v10.5h8V10h2.5L20 6l-4-2.5a4 4 0 0 1-8 0z"/>',
  grad: '<path d="M2.5 9 12 4.5 21.5 9 12 13.5z"/><path d="M6.5 11v4.5c3 2.5 8 2.5 11 0V11M21.5 9v5"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.6 2.6 14.4 0 17M12 3.5c-2.6 2.6-2.6 14.4 0 17"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  sparkle: '<path d="M12 3.5l1.8 6.7 6.7 1.8-6.7 1.8L12 20.5l-1.8-6.7L3.5 12l6.7-1.8z" fill="currentColor" stroke="none"/>',
  flask: '<path d="M9.5 3.5h5M10.5 3.5v6L5 18.5a1.5 1.5 0 0 0 1.3 2h11.4a1.5 1.5 0 0 0 1.3-2L13.5 9.5v-6"/><path d="M7.5 14.5h9"/>',
  layers: '<path d="M12 4 3.5 8.5 12 13l8.5-4.5z"/><path d="M3.5 12.5 12 17l8.5-4.5M3.5 16.5 12 21l8.5-4.5" opacity=".6"/>',
  shield: '<path d="M12 3.5l7 2.5v5.5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/>',
  bolt: '<path d="M13 3 6 13.5h5L10 21l8-11h-5z" fill="currentColor" stroke="none"/>',
};

// element sigils (filled shapes, coloured by the element)
const SIG = {
  fire: '<path d="M12 2.8c1 3.4 5.6 5.4 5.6 10.6A5.6 5.6 0 0 1 6.4 13.4c0-2.5 1.4-4 2.6-5.1.1 1.8 1 3 2.2 3.4-.4-3.1.1-6.1.8-8.9z"/><path d="M12 13.2c.6 1.6 2.4 2.2 2.4 4.1a2.4 2.4 0 0 1-4.8 0c0-1.2.8-1.9 1.4-2.4 0 .8.4 1.3 1 1.4-.2-1.1-.2-2.1 0-3.1z" fill="#fff" opacity=".55"/>',
  ice: '<path d="M11 2.5h2v19h-2zM2.8 7.1l1-1.7 16.4 9.5-1 1.7zM3.8 18.6l-1-1.7 16.4-9.5 1 1.7z"/><path d="M9.3 3.6 12 6.3l2.7-2.7 1.2 1.2L12 8.7 8.1 4.8zM9.3 20.4 12 17.7l2.7 2.7 1.2-1.2L12 15.3l-3.9 3.9z"/>',
  nature: '<path d="M19.5 3.8C10.6 3.4 5 8.7 5 14.6c0 1.6.4 3 1 4.1L4.3 20.5l1.2 1.1 1.7-1.7c1.1.7 2.4 1 3.8 1 6 0 9.3-6.6 8.5-17.1zM8.4 18.4c1.6-3.6 4.3-6.6 7.6-8.6-2.4 2.6-4.5 5.4-6 8.9z"/>',
  storm: '<path d="M13.5 2 5 13.5h5.5L9 22l9.5-12.5H13l1.5-7.5z"/>',
  light: '<circle cx="12" cy="12" r="4.4"/><path d="M11 1.8h2v3.6h-2zM11 18.6h2v3.6h-2zM1.8 11h3.6v2H1.8zM18.6 11h3.6v2h-3.6zM4.2 5.6l1.4-1.4 2.5 2.5-1.4 1.4zM15.9 17.3l1.4-1.4 2.5 2.5-1.4 1.4zM4.2 18.4l2.5-2.5 1.4 1.4-2.5 2.5zM15.9 6.7l2.5-2.5 1.4 1.4-2.5 2.5z"/>',
  darkness: '<path d="M15.6 3.3A8.8 8.8 0 1 0 20.7 15 7 7 0 0 1 15.6 3.3z"/><circle cx="18" cy="5.6" r="1" /><circle cx="20.6" cy="9.6" r=".7"/>',
  mech: '<path d="M10.4 2.5h3.2l.5 2.6 1.9.8 2.2-1.5 2.3 2.3-1.5 2.2.8 1.9 2.6.5v3.2l-2.6.5-.8 1.9 1.5 2.2-2.3 2.3-2.2-1.5-1.9.8-.5 2.6h-3.2l-.5-2.6-1.9-.8-2.2 1.5-2.3-2.3 1.5-2.2-.8-1.9-2.6-.5v-3.2l2.6-.5.8-1.9-1.5-2.2 2.3-2.3 2.2 1.5 1.9-.8zM12 8.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2z" fill-rule="evenodd"/>',
  abnormal: '<path d="M12 3.2a8.8 8.8 0 0 1 8.8 8.8h-2.2A6.6 6.6 0 0 0 12 5.4 4.4 4.4 0 0 0 7.6 9.8c0 2 1.6 3.6 3.6 3.6a2 2 0 0 0 2-2h2.2a4.2 4.2 0 0 1-4.2 4.2 5.8 5.8 0 0 1-5.8-5.8A6.6 6.6 0 0 1 12 3.2z"/><rect x="15.2" y="15.2" width="3.4" height="3.4" transform="rotate(20 16.9 16.9)"/><rect x="6" y="17" width="2.4" height="2.4" transform="rotate(-15 7.2 18.2)" opacity=".7"/>',
};

export function icon(name, cls = "") {
  const p = P[name] || P.sparkle;
  return `<svg class="i${cls ? " " + cls : ""}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
}

let DBref = null;
export function setIconDB(DB) { DBref = DB; }
export function sigil(el, cls = "") {
  const E = DBref && DBref.ELEMENTS[el];
  const c = E ? E.color : "#fff";
  // no CSS filter here: filtered SVGs inside a scrolling, backdrop-blurred sheet vanish on iOS after a scroll
  return `<svg class="sig${cls ? " " + cls : ""}" viewBox="0 0 24 24" fill="${c}" aria-label="${E ? E.name : el}">${SIG[el] || SIG.abnormal}</svg>`;
}
