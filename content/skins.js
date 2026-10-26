/* =============================================================================
 * Skyhold TD — content/skins.js
 * BUILDER SKINS: what they look like (for render/mobmodels.js) and how they
 * unlock (for app/main.js). Three families:
 *   - General:     Veteran, Gilded, Champion (play, win, beat every challenge on Hard)
 *   - Sealbreaker: one per element — beat the End Boss with that element in the run
 *   - Challenge:   one per challenge × element — beat that challenge with that element
 * Element skins take the element's builder palette and add the family's look.
 * ===========================================================================*/

export const ELEMENT_IDS = ["fire", "ice", "nature", "storm", "light", "darkness", "mech", "abnormal"];
const NAMES = { fire: "Fire", ice: "Ice", nature: "Nature", storm: "Storm", light: "Light", darkness: "Darkness", mech: "Mech", abnormal: "Abnormal" };
// builder palettes per element (same as render/mobmodels.js BUILDER_SPECS)
const PAL = {
  fire: { c1: "#a3482a", c2: "#5a2418", gl: "#ff6a2a", eye: "#ffd23d" },
  ice: { c1: "#bfe0f6", c2: "#7fa6cc", gl: "#7fe8ff", eye: "#2a4a8a" },
  nature: { c1: "#7a5a3a", c2: "#4a3424", gl: "#9cff7a", eye: "#9cff7a" },
  storm: { c1: "#5d6c92", c2: "#3a4466", gl: "#c9a6ff", eye: "#ffe066" },
  light: { c1: "#f2e8c6", c2: "#c8b890", gl: "#ffe066", eye: "#3a2a1a" },
  darkness: { c1: "#3a2a4a", c2: "#221830", gl: "#c77dff", eye: "#c77dff" },
  mech: { c1: "#9aa0a8", c2: "#5a6068", gl: "#ffb15c", eye: "#7fe8ff" },
  abnormal: { c1: "#8a3a78", c2: "#5a2450", gl: "#ff5fa2", eye: "#5dffb0" },
};

// the challenge looks (accessories), keyed by challenge id
export const CHALLENGE_LOOKS = {
  burrow: { name: "Ratcatcher", headX: ["hat"], icon: "🐀" },
  mire: { name: "Skywarden", headX: ["horns"], horn: "#ffffff", wings: true, icon: "🪽" },
  foundry: { name: "Tinker", headX: ["helm"], helmC: "#6a6a72", icon: "⚙" },
  eclipse: { name: "Eclipsed", headX: ["halo"], icon: "🌗" },
};

export const BUILDER_SKINS = [
  { id: "element", name: "Elemental", family: "general", desc: "A builder in your corridor's element.", unlock: null },
  { id: "skin_veteran", name: "Veteran", family: "general", desc: "Play 10 matches.", unlock: { played: 10 } },
  { id: "skin_gilded", name: "Gilded", family: "general", desc: "Win 5 runs.", unlock: { wins: 5 } },
  { id: "skin_champion", name: "Champion", family: "general", desc: "Beat every challenge on Hard.", unlock: { allHard: true } },
];
export const SKIN_SPECS = {
  skin_veteran: { c1: "#6a7080", c2: "#3a4050", eye: "#ffd23d", gl: "#ffd23d", headX: ["helm"], helmC: "#8a8f99", tool: "#ffd23d" },
  skin_gilded: { c1: "#d9b84a", c2: "#8a6a2a", eye: "#ffffff", gl: "#fff2a8", headX: ["crown"], tool: "#fff2a8" },
  skin_champion: { c1: "#a3262a", c2: "#d9b84a", eye: "#ffe066", gl: "#ffd23d", headX: ["crown"], tool: "#ffd23d", wings: true },
};
// Sealbreaker: one per element, from the End Boss
for (const el of ELEMENT_IDS) {
  const id = "seal_" + el, p = PAL[el];
  BUILDER_SKINS.push({ id, name: "Sealbreaker · " + NAMES[el], family: "seal", element: el, desc: `Beat the Sealed One with ${NAMES[el]} in your run.`, unlock: { endboss: el } });
  SKIN_SPECS[id] = { c1: p.c1, c2: "#2a1e14", eye: "#ff2e7e", gl: "#ff2e7e", headX: ["crown", "horns"], crownC: p.gl, horn: "#1a1418", gem: "#ff2e7e", tool: p.gl, wings: true };
}
// Challenge looks × element: only from that challenge
export const CHALLENGE_IDS = Object.keys(CHALLENGE_LOOKS);
for (const ch of CHALLENGE_IDS) for (const el of ELEMENT_IDS) {
  const L = CHALLENGE_LOOKS[ch], p = PAL[el], id = "ch_" + ch + "_" + el;
  BUILDER_SKINS.push({ id, name: L.name + " · " + NAMES[el], family: "challenge", challenge: ch, element: el, desc: `Beat this challenge with ${NAMES[el]}.`, unlock: { challenge: ch, element: el } });
  SKIN_SPECS[id] = Object.assign({ c1: p.c1, c2: p.c2, eye: p.eye, gl: p.gl, tool: p.gl }, { headX: L.headX, horn: L.horn, helmC: L.helmC, haloC: p.gl, wings: L.wings });
}

/** progress: { played, wins, challenges: { id: { normal, hard, els: {el: {normal, hard}} } }, endboss: { el: true } } */
export function skinUnlocked(sk, prog, all) {
  const u = sk.unlock; if (!u || all) return true;
  if (u.played) return (prog.played || 0) >= u.played;
  if (u.wins) return (prog.wins || 0) >= u.wins;
  if (u.endboss) return !!(prog.endboss && prog.endboss[u.endboss]);
  if (u.challenge && u.element) { const c = prog.challenges && prog.challenges[u.challenge]; return !!(c && c.els && c.els[u.element]); }
  if (u.challenge) { const c = prog.challenges && prog.challenges[u.challenge]; return !!(c && c.normal); }
  if (u.allHard) return CHALLENGE_IDS.every((c) => prog.challenges && prog.challenges[c] && prog.challenges[c].hard);
  return false;
}
// old saves: the four old challenge skins carry over as that challenge's Fire look
export const LEGACY_SKINS = { skin_ratcatcher: "ch_burrow_fire", skin_skywarden: "ch_mire_fire", skin_tinker: "ch_foundry_fire", skin_eclipse: "ch_eclipse_fire" };
export function skinSwatch(id, element) {
  const s = SKIN_SPECS[id] || PAL[element] || PAL.fire;
  return { c1: s.c1, c2: s.c2, gl: s.gl };
}

export default { BUILDER_SKINS, SKIN_SPECS, CHALLENGE_LOOKS, skinUnlocked, LEGACY_SKINS, skinSwatch, ELEMENT_IDS };
