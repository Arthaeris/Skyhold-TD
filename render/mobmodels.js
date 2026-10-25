/* Skyhold TD — render/mobmodels.js
   Voxel models for the expanded bestiary (content/mobs.js) and the Warcraft-3-style builders.

   Each creature is a short SPEC on one of eight body plans:
     biped    upright walker (legs, arms, head)
     quad     four-legged beast
     insect   six-legged crawler
     flyer    winged, flaps, hovers high
     floater  wisp, wraith or elemental with no legs, with orbiting shards
     blob     slime, sac or horror that wobbles
     serpent  coiled tail with an upright torso
     tank     construct on treads
   …plus extras (horns, crowns, weapons, banners, shells, wings…). The output has the same format as
   render/enemies.js MODELS (parts drawn with Part, pivots and an anim per part), so the instanced
   enemy renderer and the thumbnail rig use them unchanged.
   These are first-pass placeholders: replace any one by editing its spec. */
import { TAU, shade, mix } from "./kit.js";

// ---------------------------------------------------------------------------
// extras: small builders that decorate a part. (P, o, a) — o = spec, a = anchor {x,y,z,s}
// ---------------------------------------------------------------------------
const EX = {
  horns(P, o, a) { const c = o.horn || "#2a1a14"; for (const sx of [-1, 1]) { P.b(0.1 * a.s, 0.28 * a.s, 0.1 * a.s, c, a.x + sx * 0.16 * a.s, a.y + 0.14 * a.s, a.z, { rotZ: -sx * 0.4 }); P.b(0.08 * a.s, 0.18 * a.s, 0.08 * a.s, shade(c, 1.2), a.x + sx * 0.24 * a.s, a.y + 0.3 * a.s, a.z - 0.04, { rotZ: -sx * 0.9 }); } },
  curlHorns(P, o, a) { const c = o.horn || "#c9a24a"; for (const sx of [-1, 1]) { P.b(0.14 * a.s, 0.14 * a.s, 0.3 * a.s, c, a.x + sx * 0.24 * a.s, a.y + 0.05 * a.s, a.z - 0.05 * a.s); P.b(0.14 * a.s, 0.24 * a.s, 0.12 * a.s, shade(c, 0.9), a.x + sx * 0.3 * a.s, a.y - 0.08 * a.s, a.z + 0.1 * a.s); } },
  antlers(P, o, a) { const c = o.horn || "#7fffd0"; for (const sx of [-1, 1]) { P.g(0.06 * a.s, 0.4 * a.s, 0.06 * a.s, c, a.x + sx * 0.14 * a.s, a.y + 0.25 * a.s, a.z, 1.6, { rotZ: -sx * 0.5 }); P.g(0.05 * a.s, 0.24 * a.s, 0.05 * a.s, c, a.x + sx * 0.3 * a.s, a.y + 0.42 * a.s, a.z + 0.05, 1.6, { rotZ: -sx * 1.1 }); P.g(0.05 * a.s, 0.2 * a.s, 0.05 * a.s, c, a.x + sx * 0.2 * a.s, a.y + 0.5 * a.s, a.z - 0.06, 1.6, { rotZ: sx * 0.3 }); } },
  crown(P, o, a) { const c = o.crownC || "#ffd23d"; P.b(0.36 * a.s, 0.08 * a.s, 0.36 * a.s, c, a.x, a.y + 0.04 * a.s, a.z, { top: "#fff0a0" }); for (let i = 0; i < 4; i++) P.b(0.07 * a.s, 0.14 * a.s, 0.07 * a.s, c, a.x + (i % 2 ? 1 : -1) * 0.13 * a.s, a.y + 0.14 * a.s, a.z + (i < 2 ? 1 : -1) * 0.13 * a.s); P.g(0.08 * a.s, 0.08 * a.s, 0.08 * a.s, o.gem || "#ff3b6b", a.x, a.y + 0.1 * a.s, a.z + 0.18 * a.s, 2.4); },
  hood(P, o, a) { const c = o.hoodC || shade(o.c1, 0.8); P.b(0.5 * a.s, 0.5 * a.s, 0.5 * a.s, c, a.x, a.y + 0.02 * a.s, a.z - 0.03 * a.s); P.b(0.3 * a.s, 0.2 * a.s, 0.2 * a.s, c, a.x, a.y + 0.28 * a.s, a.z - 0.16 * a.s, { rotX: -0.4 }); },
  halo(P, o, a) { const c = o.haloC || "#ffe066"; for (let i = 0; i < 10; i++) { const an = (i / 10) * TAU; P.g(0.08 * a.s, 0.04 * a.s, 0.08 * a.s, c, a.x + Math.cos(an) * 0.26 * a.s, a.y + 0.32 * a.s, a.z + Math.sin(an) * 0.26 * a.s, 2.2); } },
  tusks(P, o, a) { for (const sx of [-1, 1]) P.b(0.06 * a.s, 0.16 * a.s, 0.06 * a.s, "#f0e8d0", a.x + sx * 0.12 * a.s, a.y - 0.12 * a.s, a.z + 0.22 * a.s, { rotX: -0.4 }); },
  mask(P, o, a) { P.b(0.36 * a.s, 0.3 * a.s, 0.06 * a.s, o.maskC || "#e8dcc0", a.x, a.y, a.z + 0.22 * a.s, { top: "#fff8e0" }); P.g(0.08 * a.s, 0.05 * a.s, 0.02 * a.s, o.eye || "#ff3b6b", a.x - 0.08 * a.s, a.y + 0.03 * a.s, a.z + 0.26 * a.s, 2.4); P.g(0.08 * a.s, 0.05 * a.s, 0.02 * a.s, o.eye || "#ff3b6b", a.x + 0.08 * a.s, a.y + 0.03 * a.s, a.z + 0.26 * a.s, 2.4); },
  hat(P, o, a) { P.b(0.5 * a.s, 0.05 * a.s, 0.5 * a.s, "#1a1418", a.x, a.y + 0.06 * a.s, a.z); P.b(0.3 * a.s, 0.32 * a.s, 0.3 * a.s, "#1a1418", a.x, a.y + 0.24 * a.s, a.z); P.b(0.31 * a.s, 0.06 * a.s, 0.31 * a.s, "#a3262a", a.x, a.y + 0.12 * a.s, a.z); },
  turban(P, o, a) { P.b(0.44 * a.s, 0.22 * a.s, 0.44 * a.s, o.c3 || "#e8dcc0", a.x, a.y + 0.08 * a.s, a.z); P.g(0.1 * a.s, 0.1 * a.s, 0.06 * a.s, o.gl || "#7fe8ff", a.x, a.y + 0.1 * a.s, a.z + 0.22 * a.s, 2.4); },
  helm(P, o, a) { const c = o.helmC || "#8a8f99"; P.b(0.46 * a.s, 0.3 * a.s, 0.46 * a.s, c, a.x, a.y + 0.06 * a.s, a.z, { top: shade(c, 1.2) }); P.b(0.06 * a.s, 0.24 * a.s, 0.4 * a.s, shade(c, 0.8), a.x, a.y + 0.26 * a.s, a.z); },
  cap(P, o, a) { const c = o.capC || "#8a3a3a"; P.b(0.8 * a.s, 0.22 * a.s, 0.8 * a.s, c, a.x, a.y + 0.08 * a.s, a.z, { top: shade(c, 1.15) }); P.b(0.56 * a.s, 0.16 * a.s, 0.56 * a.s, c, a.x, a.y + 0.26 * a.s, a.z); for (let i = 0; i < 5; i++) { const an = i * 1.3; P.g(0.1 * a.s, 0.04 * a.s, 0.1 * a.s, o.gl || "#ffe0a0", a.x + Math.cos(an) * 0.26 * a.s, a.y + 0.2 * a.s, a.z + Math.sin(an) * 0.26 * a.s, 1.5); } },
  leaves(P, o, a) { for (let i = 0; i < 4; i++) P.b((0.5 - i * 0.08) * a.s, 0.28 * a.s, (0.5 - i * 0.08) * a.s, i % 2 ? "#4f8f3a" : "#3c7a30", a.x + (i % 2 ? 0.1 : -0.1) * a.s, a.y + i * 0.2 * a.s, a.z, { top: "#7fcf5a" }); },
  hair(P, o, a) { const c = o.hairC || "#4f8f3a"; P.b(0.46 * a.s, 0.2 * a.s, 0.46 * a.s, c, a.x, a.y + 0.14 * a.s, a.z - 0.02); P.b(0.4 * a.s, 0.5 * a.s, 0.12 * a.s, c, a.x, a.y - 0.14 * a.s, a.z - 0.2 * a.s); },
  tentacles(P, o, a) { for (let i = 0; i < 4; i++) P.b(0.06 * a.s, 0.3 * a.s, 0.06 * a.s, o.c3 || "#a87aa8", a.x + (i - 1.5) * 0.08 * a.s, a.y - 0.24 * a.s, a.z + 0.2 * a.s, { rotX: 0.3 }); },
  eyesMany(P, o, a) { for (let i = 0; i < 7; i++) { const an = i * 0.9; P.g(0.08 * a.s, 0.08 * a.s, 0.05 * a.s, o.eye || "#5dffb0", a.x + Math.cos(an) * 0.3 * a.s, a.y + Math.sin(an * 1.7) * 0.2 * a.s, a.z + 0.36 * a.s, 2.4); } },
  maw(P, o, a) { P.b(0.5 * a.s, 0.12 * a.s, 0.06 * a.s, "#1a0a12", a.x, a.y - 0.1 * a.s, a.z + 0.38 * a.s); for (let i = 0; i < 5; i++) P.b(0.05 * a.s, 0.08 * a.s, 0.04 * a.s, "#f0e8d0", a.x - 0.2 * a.s + i * 0.1 * a.s, a.y - 0.05 * a.s, a.z + 0.41 * a.s); },
  // torso extras
  banner(P, o, a) { P.b(0.06 * a.s, 1.4 * a.s, 0.06 * a.s, "#5a4030", a.x + 0.1 * a.s, a.y + 0.5 * a.s, a.z - 0.3 * a.s); P.b(0.04 * a.s, 0.5 * a.s, 0.5 * a.s, o.flag || "#c94a4a", a.x + 0.1 * a.s, a.y + 0.95 * a.s, a.z - 0.56 * a.s, { top: shade(o.flag || "#c94a4a", 1.2) }); P.g(0.12 * a.s, 0.12 * a.s, 0.12 * a.s, "#ffd23d", a.x + 0.1 * a.s, a.y + 1.24 * a.s, a.z - 0.3 * a.s, 2.2); },
  drum(P, o, a) { P.b(0.5 * a.s, 0.36 * a.s, 0.5 * a.s, "#c9a24a", a.x, a.y - 0.1 * a.s, a.z + 0.4 * a.s, { top: "#f0e0c0" }); P.b(0.52 * a.s, 0.06 * a.s, 0.52 * a.s, "#8a2a1a", a.x, a.y - 0.24 * a.s, a.z + 0.4 * a.s); },
  cape(P, o, a) { P.b(0.62 * a.s, 0.8 * a.s, 0.06 * a.s, o.capeC || "#a3262a", a.x, a.y - 0.25 * a.s, a.z - 0.26 * a.s, { rotX: 0.15 }); },
  backpack(P, o, a) { P.b(0.5 * a.s, 0.5 * a.s, 0.34 * a.s, o.packC || "#c9a24a", a.x, a.y + 0.05 * a.s, a.z - 0.36 * a.s, { top: "#ffe08a" }); P.g(0.2 * a.s, 0.12 * a.s, 0.12 * a.s, "#ffd23d", a.x, a.y + 0.34 * a.s, a.z - 0.36 * a.s, 2.4); },
  chimney(P, o, a) { P.b(0.2 * a.s, 0.6 * a.s, 0.2 * a.s, "#3a3a40", a.x, a.y + 0.3 * a.s, a.z - 0.2 * a.s); P.g(0.16 * a.s, 0.08 * a.s, 0.16 * a.s, "#ffb15c", a.x, a.y + 0.62 * a.s, a.z - 0.2 * a.s, 2.2); },
  spikes(P, o, a) { for (let i = 0; i < 4; i++) P.b(0.1 * a.s, 0.24 * a.s, 0.1 * a.s, o.spikeC || shade(o.c2, 0.8), a.x, a.y + 0.1 * a.s, a.z - 0.3 * a.s + i * 0.2 * a.s, { rotX: -0.3 }); },
  glowSpines(P, o, a) { for (let i = 0; i < 4; i++) P.g(0.08 * a.s, 0.24 * a.s, 0.08 * a.s, o.gl, a.x, a.y + 0.12 * a.s, a.z - 0.3 * a.s + i * 0.2 * a.s, 2.1, { rotX: -0.3 }); },
  plates(P, o, a) { for (let i = 0; i < 3; i++) P.b(0.62 * a.s, 0.1 * a.s, 0.24 * a.s, o.plateC || "#8a8f99", a.x, a.y + 0.04 * a.s, a.z - 0.3 * a.s + i * 0.3 * a.s, { top: "#b8bcc8" }); },
  shell(P, o, a) { const c = o.shellC || "#6a6a72"; P.b(0.95 * a.s, 0.4 * a.s, 1.05 * a.s, c, a.x, a.y + 0.1 * a.s, a.z, { top: shade(c, 1.15) }); P.b(0.7 * a.s, 0.22 * a.s, 0.8 * a.s, shade(c, 1.1), a.x, a.y + 0.38 * a.s, a.z, { top: shade(c, 1.25) }); for (let i = 0; i < 4; i++) P.b(0.18 * a.s, 0.06 * a.s, 0.18 * a.s, shade(c, 0.75), a.x + (i % 2 ? 0.2 : -0.2) * a.s, a.y + 0.5 * a.s, a.z + (i < 2 ? 0.2 : -0.2) * a.s); },
  mossTop(P, o, a) { for (let i = 0; i < 4; i++) P.b(0.3 * a.s, 0.1 * a.s, 0.3 * a.s, i % 2 ? "#5a9a3a" : "#4a8a32", a.x + (i % 2 ? 0.15 : -0.15) * a.s, a.y + 0.05 * a.s, a.z + (i < 2 ? 0.12 : -0.12) * a.s, { top: "#7fcf5a" }); P.g(0.08 * a.s, 0.08 * a.s, 0.08 * a.s, "#ff9ac0", a.x + 0.1 * a.s, a.y + 0.14 * a.s, a.z, 1.6); },
  boulders(P, o, a) { for (let i = 0; i < 3; i++) P.b((0.3 + i * 0.06) * a.s, 0.28 * a.s, 0.3 * a.s, "#6a6a62", a.x + (i - 1) * 0.3 * a.s, a.y + 0.1 * a.s, a.z - 0.05 * a.s, { rotY: i, top: i === 1 ? "#4f8f3a" : undefined }); },
  gears(P, o, a) { for (let i = 0; i < 8; i++) { const an = (i / 8) * TAU; P.b(0.1 * a.s, 0.1 * a.s, 0.06 * a.s, "#c9a24a", a.x + Math.cos(an) * 0.22 * a.s, a.y + Math.sin(an) * 0.22 * a.s, a.z + 0.28 * a.s); } P.g(0.14 * a.s, 0.14 * a.s, 0.06 * a.s, o.gl || "#ffb15c", a.x, a.y, a.z + 0.3 * a.s, 2.2); },
  runes(P, o, a) { for (let i = 0; i < 3; i++) P.g(0.3 * a.s, 0.04 * a.s, 0.02 * a.s, o.gl, a.x, a.y - 0.15 * a.s + i * 0.14 * a.s, a.z + 0.22 * a.s, 2.0); },
  core(P, o, a) { P.g(0.26 * a.s, 0.26 * a.s, 0.1 * a.s, o.gl, a.x, a.y, a.z + 0.24 * a.s, 2.2); P.g(0.12 * a.s, 0.12 * a.s, 0.12 * a.s, "#ffffff", a.x, a.y, a.z + 0.28 * a.s, 2.6); },
  cracks(P, o, a) { for (let i = 0; i < 4; i++) P.g(0.04 * a.s, 0.4 * a.s, 0.03 * a.s, o.gl, a.x + (i - 1.5) * 0.14 * a.s, a.y, a.z + 0.23 * a.s, 2.2, { rotZ: (i - 1.5) * 0.4 }); },
  stitches(P, o, a) { for (let i = 0; i < 4; i++) P.g(0.3 * a.s, 0.03 * a.s, 0.02 * a.s, o.gl || "#9cff7a", a.x, a.y - 0.2 * a.s + i * 0.14 * a.s, a.z + 0.3 * a.s, 1.8, { rotZ: (i % 2 ? 0.3 : -0.3) }); },
  sack(P, o, a) { P.b(0.5 * a.s, 0.5 * a.s, 0.5 * a.s, "#b08a4a", a.x, a.y + 0.1 * a.s, a.z - 0.36 * a.s, { top: "#c9a24a" }); for (let i = 0; i < 4; i++) P.g(0.1 * a.s, 0.1 * a.s, 0.1 * a.s, "#ffd23d", a.x + (i - 1.5) * 0.1 * a.s, a.y + 0.38 * a.s, a.z - 0.36 * a.s, 2.4); },
  candle(P, o, a) { P.b(0.08 * a.s, 0.2 * a.s, 0.08 * a.s, "#f0e8d0", a.x, a.y + 0.1 * a.s, a.z + 0.3 * a.s); P.g(0.06 * a.s, 0.1 * a.s, 0.06 * a.s, "#ffb15c", a.x, a.y + 0.26 * a.s, a.z + 0.3 * a.s, 2.6); },
  sunDisc(P, o, a) { P.g(0.5 * a.s, 0.5 * a.s, 0.05 * a.s, "#ffd23d", a.x, a.y + 0.3 * a.s, a.z - 0.26 * a.s, 1.9); P.g(0.3 * a.s, 0.3 * a.s, 0.06 * a.s, "#fff6c2", a.x, a.y + 0.3 * a.s, a.z - 0.25 * a.s, 2.4); },
  stinger(P, o, a) { P.b(0.12 * a.s, 0.12 * a.s, 0.4 * a.s, o.c2, a.x, a.y + 0.1 * a.s, a.z - 0.5 * a.s, { rotX: 0.6 }); P.g(0.06 * a.s, 0.06 * a.s, 0.2 * a.s, o.gl || "#ff4d4d", a.x, a.y + 0.24 * a.s, a.z - 0.68 * a.s, 2.2, { rotX: 0.6 }); },
  spots(P, o, a) { for (let i = 0; i < 5; i++) P.g(0.1 * a.s, 0.03 * a.s, 0.1 * a.s, o.gl, a.x + Math.cos(i * 1.7) * 0.18 * a.s, a.y + 0.02 * a.s, a.z + Math.sin(i * 1.7) * 0.2 * a.s, 1.8); },
  stripes(P, o, a) { for (let i = 0; i < 3; i++) P.b(0.56 * a.s, 0.32 * a.s, 0.06 * a.s, o.stripeC || "#2a2010", a.x, a.y, a.z - 0.2 * a.s + i * 0.18 * a.s); },
  saw(P, o, a) { for (let i = 0; i < 10; i++) { const an = (i / 10) * TAU; P.b(0.08 * a.s, 0.14 * a.s, 0.04 * a.s, "#d8dce4", a.x + Math.cos(an) * 0.3 * a.s, a.y + Math.sin(an) * 0.3 * a.s, a.z + 0.5 * a.s, { rotZ: an }); } P.b(0.5 * a.s, 0.5 * a.s, 0.04 * a.s, "#a8acb4", a.x, a.y, a.z + 0.5 * a.s); },
  ribs(P, o, a) { for (let i = 0; i < 4; i++) P.b(0.7 * a.s, 0.05 * a.s, 0.05 * a.s, "#f0e8d0", a.x, a.y + 0.05 * a.s, a.z - 0.25 * a.s + i * 0.16 * a.s); },
  veins(P, o, a) { for (let i = 0; i < 5; i++) P.g(0.04 * a.s, 0.5 * a.s, 0.03 * a.s, o.gl, a.x + Math.cos(i * 1.3) * 0.3 * a.s, a.y, a.z + Math.sin(i * 1.3) * 0.3 * a.s, 1.7, { rotZ: (i - 2) * 0.3 }); },
  wards(P, o, a) { for (let i = 0; i < 12; i++) { const an = (i / 12) * TAU; P.g(0.08 * a.s, 0.04 * a.s, 0.08 * a.s, o.gl, a.x + Math.cos(an) * 0.6 * a.s, a.y, a.z + Math.sin(an) * 0.6 * a.s, 1.9); } },
  scarf(P, o, a) { P.b(0.5 * a.s, 0.1 * a.s, 0.4 * a.s, "#ffd23d", a.x, a.y, a.z); P.b(0.1 * a.s, 0.08 * a.s, 0.5 * a.s, "#ffd23d", a.x + 0.15 * a.s, a.y - 0.02, a.z - 0.4 * a.s, { rotX: 0.3 }); },
};
// weapons held in the right hand (drawn into armR at its tip)
const WEAPON = {
  club(P, o, a) { P.b(0.12 * a.s, 0.6 * a.s, 0.12 * a.s, "#6a4a2e", a.x, a.y - 0.2 * a.s, a.z + 0.2 * a.s, { rotX: 1.2 }); P.b(0.24 * a.s, 0.3 * a.s, 0.24 * a.s, "#5a4030", a.x, a.y - 0.25 * a.s, a.z + 0.5 * a.s, { rotX: 1.2 }); },
  staff(P, o, a) { P.b(0.07 * a.s, 1.1 * a.s, 0.07 * a.s, "#5a4030", a.x, a.y - 0.1 * a.s, a.z + 0.1 * a.s); P.g(0.18 * a.s, 0.18 * a.s, 0.18 * a.s, o.gl || "#9cff7a", a.x, a.y + 0.5 * a.s, a.z + 0.1 * a.s, 2.4); },
  skullStaff(P, o, a) { P.b(0.07 * a.s, 1.1 * a.s, 0.07 * a.s, "#3a3030", a.x, a.y - 0.1 * a.s, a.z + 0.1 * a.s); P.b(0.2 * a.s, 0.18 * a.s, 0.2 * a.s, "#efe6d4", a.x, a.y + 0.5 * a.s, a.z + 0.1 * a.s); P.g(0.05 * a.s, 0.05 * a.s, 0.02 * a.s, o.gl || "#9cff7a", a.x - 0.05 * a.s, a.y + 0.52 * a.s, a.z + 0.21 * a.s, 2.6); P.g(0.05 * a.s, 0.05 * a.s, 0.02 * a.s, o.gl || "#9cff7a", a.x + 0.05 * a.s, a.y + 0.52 * a.s, a.z + 0.21 * a.s, 2.6); },
  sword(P, o, a) { P.b(0.08 * a.s, 0.7 * a.s, 0.03 * a.s, "#d8dce4", a.x, a.y - 0.35 * a.s, a.z + 0.35 * a.s, { rotX: 1.3, top: "#ffffff" }); P.b(0.22 * a.s, 0.05 * a.s, 0.05 * a.s, "#c9a24a", a.x, a.y - 0.05 * a.s, a.z + 0.06 * a.s); },
  hammer(P, o, a) { P.b(0.07 * a.s, 0.7 * a.s, 0.07 * a.s, "#6a4a2e", a.x, a.y - 0.25 * a.s, a.z + 0.25 * a.s, { rotX: 1.2 }); P.b(0.3 * a.s, 0.2 * a.s, 0.2 * a.s, o.hamC || "#d9b84a", a.x, a.y - 0.38 * a.s, a.z + 0.55 * a.s, { rotX: 1.2, top: "#fff0a0" }); },
  axe(P, o, a) { P.b(0.08 * a.s, 0.9 * a.s, 0.08 * a.s, "#5a4030", a.x, a.y - 0.3 * a.s, a.z + 0.3 * a.s, { rotX: 1.2 }); P.b(0.06 * a.s, 0.4 * a.s, 0.36 * a.s, "#c8c8d8", a.x, a.y - 0.48 * a.s, a.z + 0.68 * a.s, { rotX: 1.2, top: "#eeeef8" }); },
  bow(P, o, a) { P.b(0.05 * a.s, 0.8 * a.s, 0.05 * a.s, "#7a5a2e", a.x, a.y - 0.2 * a.s, a.z + 0.2 * a.s, { rotZ: 0.2 }); P.g(0.02 * a.s, 0.76 * a.s, 0.02 * a.s, "#e8f8d0", a.x + 0.06 * a.s, a.y - 0.2 * a.s, a.z + 0.2 * a.s, 1.3); },
  trident(P, o, a) { P.b(0.06 * a.s, 1.2 * a.s, 0.06 * a.s, "#c9a24a", a.x, a.y, a.z + 0.15 * a.s); for (const dx of [-0.1, 0, 0.1]) P.b(0.04 * a.s, 0.22 * a.s, 0.04 * a.s, "#ffd23d", a.x + dx * a.s, a.y + 0.66 * a.s, a.z + 0.15 * a.s); },
  claws(P, o, a) { for (const dx of [-0.06, 0, 0.06]) P.b(0.03 * a.s, 0.03 * a.s, 0.2 * a.s, "#e8e0d0", a.x + dx * a.s, a.y - 0.05 * a.s, a.z + 0.14 * a.s); },
  hook(P, o, a) { P.b(0.06 * a.s, 0.5 * a.s, 0.06 * a.s, "#8a8f99", a.x, a.y - 0.25 * a.s, a.z + 0.1 * a.s); P.b(0.06 * a.s, 0.06 * a.s, 0.22 * a.s, "#8a8f99", a.x, a.y - 0.5 * a.s, a.z + 0.2 * a.s); },
  boulder(P, o, a) { P.b(0.42 * a.s, 0.4 * a.s, 0.42 * a.s, "#6a6a62", a.x, a.y - 0.05 * a.s, a.z + 0.25 * a.s, { rotY: 0.5, top: "#8a8a80" }); },
  sawArm(P, o, a) { EX.saw(P, o, { x: a.x, y: a.y - 0.15 * a.s, z: a.z - 0.25 * a.s, s: a.s * 0.9 }); },
  log(P, o, a) { P.b(0.2 * a.s, 0.9 * a.s, 0.2 * a.s, "#6a4a2e", a.x, a.y - 0.3 * a.s, a.z + 0.3 * a.s, { rotX: 1.1, top: "#8a6a3e" }); },
  sack(P, o, a) { P.b(0.36 * a.s, 0.36 * a.s, 0.36 * a.s, "#b08a4a", a.x, a.y - 0.2 * a.s, a.z + 0.05 * a.s); P.g(0.1 * a.s, 0.1 * a.s, 0.1 * a.s, "#ffd23d", a.x, a.y, a.z + 0.05 * a.s, 2.4); },
};
const SHIELD = {
  round(P, o, a) { P.b(0.06 * a.s, 0.5 * a.s, 0.5 * a.s, o.shieldC || "#8a5a3a", a.x - 0.06 * a.s, a.y - 0.25 * a.s, a.z + 0.1 * a.s, { top: shade(o.shieldC || "#8a5a3a", 1.2) }); P.b(0.08 * a.s, 0.14 * a.s, 0.14 * a.s, "#c9a24a", a.x - 0.1 * a.s, a.y - 0.25 * a.s, a.z + 0.1 * a.s); },
  tower(P, o, a) { P.b(0.08 * a.s, 0.95 * a.s, 0.6 * a.s, o.shieldC || "#c9a24a", a.x - 0.04 * a.s, a.y - 0.3 * a.s, a.z + 0.28 * a.s, { top: "#ffe08a" }); P.g(0.1 * a.s, 0.24 * a.s, 0.24 * a.s, o.gl || "#7fe8ff", a.x - 0.09 * a.s, a.y - 0.25 * a.s, a.z + 0.28 * a.s, 2.0); },
  rune(P, o, a) { P.b(0.06 * a.s, 0.6 * a.s, 0.5 * a.s, "#3a4250", a.x - 0.06 * a.s, a.y - 0.25 * a.s, a.z + 0.1 * a.s); P.g(0.08 * a.s, 0.3 * a.s, 0.08 * a.s, o.gl || "#7fb4ff", a.x - 0.1 * a.s, a.y - 0.25 * a.s, a.z + 0.1 * a.s, 2.2); },
};
function runEx(list, P, o, a) { for (const k of list || []) if (EX[k]) EX[k](P, o, a); }

// ---------------------------------------------------------------------------
// BODY PLANS
// ---------------------------------------------------------------------------
function eyes(P, o, x, y, z, s, gap = 0.1) {
  P.g(0.08 * s, 0.07 * s, 0.04 * s, o.eye || "#ffd23d", x - gap * s, y, z, 2.6);
  P.g(0.08 * s, 0.07 * s, 0.04 * s, o.eye || "#ffd23d", x + gap * s, y, z, 2.6);
}

function biped(o) {
  const s = o.s || 1, W = (o.w || 1), Lg = (o.leg || 1);
  const hip = 0.5 * s * Lg, tw = 0.6 * s * W, th = 0.6 * s * (o.th || 1), td = 0.42 * s * (o.d || 1);
  const hs = 0.42 * s * (o.head || 1), hunch = o.hunch ? 0.12 * s : 0;
  const headY = hip + th + hs * 0.45 - (o.hunch ? 0.08 * s : 0);
  const c1 = o.c1, c2 = o.c2 || shade(o.c1, 0.75), c3 = o.c3 || shade(o.c1, 1.2);
  const armX = tw / 2 + 0.1 * s, armY = hip + th * 0.9, armL = 0.55 * s * (o.arm || 1);
  const parts = {
    body(P) {
      P.b(tw, th, td, c1, 0, hip + th / 2, hunch * 0.5, { top: c3 });
      P.b(tw * 0.92, 0.12 * s, td * 1.02, c2, 0, hip + 0.06 * s, 0);
      if (o.robe) P.b(tw * 1.05, hip * 0.95, td * 1.1, o.robeC || c2, 0, hip * 0.5, 0, { top: c2 });
      if (!o.noHead) {
        P.b(hs, hs, hs * 0.95, o.headC || c1, 0, headY, hunch + 0.02 * s, { top: shade(o.headC || c1, 1.15) });
        eyes(P, o, 0, headY + 0.03 * s, hunch + hs * 0.5, s * (o.head || 1));
      }
      runEx(o.headX, P, o, { x: 0, y: headY + hs * 0.5, z: hunch, s: s * (o.head || 1) });
      runEx(o.bodyX, P, o, { x: 0, y: hip + th * 0.6, z: 0, s });
    },
    armL(P) {
      P.b(0.18 * s * W, armL, 0.2 * s, o.armC || c1, 0, -armL / 2, 0, { top: c3 });
      P.b(0.2 * s * W, 0.18 * s, 0.22 * s, c2, 0, -armL, 0.02 * s);
      if (o.shield && SHIELD[o.shield]) SHIELD[o.shield](P, o, { x: -0.1 * s, y: -armL * 0.6, z: 0, s });
    },
    armR(P) {
      P.b(0.18 * s * W, armL, 0.2 * s, o.armC || c1, 0, -armL / 2, 0, { top: c3 });
      P.b(0.2 * s * W, 0.18 * s, 0.22 * s, c2, 0, -armL, 0.02 * s);
      if (o.weapon && WEAPON[o.weapon]) WEAPON[o.weapon](P, o, { x: 0, y: -armL, z: 0, s });
    },
  };
  if (!o.robe && !o.float) {
    parts.legL = (P) => { P.b(0.2 * s * W, hip, 0.22 * s, c2, 0, -hip / 2, 0); P.b(0.24 * s * W, 0.1 * s, 0.3 * s, shade(c2, 0.7), 0, -hip + 0.05 * s, 0.04 * s); };
    parts.legR = parts.legL;
  }
  const pivots = { armL: [-armX, armY, 0], armR: [armX, armY, 0], legL: [-tw * 0.28, hip, 0], legR: [tw * 0.28, hip, 0] };
  const anim = { armL: "swingB", armR: "swingA", legL: "legA", legR: "legB" };
  if (o.wings) {
    const wc = o.wingC || shade(c2, 0.8), ws = o.wingS || 1;
    parts.wingL = (P) => { P.b(0.55 * s * ws, 0.4 * s * ws, 0.05 * s, wc, -0.28 * s * ws, 0.1 * s, 0); P.b(0.35 * s * ws, 0.24 * s * ws, 0.05 * s, shade(wc, 1.2), -0.6 * s * ws, 0.22 * s, 0); };
    parts.wingR = (P) => { P.b(0.55 * s * ws, 0.4 * s * ws, 0.05 * s, wc, 0.28 * s * ws, 0.1 * s, 0); P.b(0.35 * s * ws, 0.24 * s * ws, 0.05 * s, shade(wc, 1.2), 0.6 * s * ws, 0.22 * s, 0); };
    pivots.wingL = [-tw * 0.3, hip + th * 0.8, -td * 0.5]; pivots.wingR = [tw * 0.3, hip + th * 0.8, -td * 0.5];
    anim.wingL = o.buzz ? "buzzL" : "flapL"; anim.wingR = o.buzz ? "buzzR" : "flapR";
  }
  if (o.orbit) { parts.ring = orbitRing(o, s); pivots.ring = [0, hip + th * 0.5, 0]; anim.ring = "orbit"; }
  return { height: headY + hs * 0.6 + (o.extraH || 0), size: Math.max(tw, td) * 1.6, hover: o.hover || 0, parts, pivots, anim };
}

function orbitRing(o, s) {
  return (P) => { const n = o.orbitN || 8, R = (o.orbitR || 0.7) * s; for (let i = 0; i < n; i++) { const a = (i / n) * TAU; if (o.orbitGlow !== false) P.g(0.12 * s, 0.12 * s, 0.12 * s, o.gl || "#ffffff", Math.cos(a) * R, Math.sin(a * 2) * 0.1 * s, Math.sin(a) * R, 2.0, { rotY: a }); else P.b(0.16 * s, 0.14 * s, 0.16 * s, o.c2 || "#444", Math.cos(a) * R, Math.sin(a * 2) * 0.1 * s, Math.sin(a) * R, { rotY: a }); } };
}

function quad(o) {
  const s = o.s || 1, L = 0.95 * s * (o.len || 1), bh = 0.42 * s * (o.th || 1), bw = 0.5 * s * (o.w || 1), lh = 0.38 * s * (o.leg || 1);
  const c1 = o.c1, c2 = o.c2 || shade(o.c1, 0.75), c3 = o.c3 || shade(o.c1, 1.2);
  const hs = 0.38 * s * (o.head || 1), hy = lh + bh * (o.headUp || 0.75), hz = L / 2 + hs * 0.35;
  const parts = {
    body(P) {
      P.b(bw, bh, L, c1, 0, lh + bh / 2, 0, { top: c3 });
      P.b(bw * 0.9, bh * 0.3, L * 0.9, o.belly || c2, 0, lh + bh * 0.12, 0);
      P.b(hs * (o.snout ? 0.9 : 1), hs, hs * 1.1, o.headC || c1, 0, hy, hz, { top: c3 });
      if (o.snout) P.b(hs * 0.55, hs * 0.45, hs * 0.6, c2, 0, hy - hs * 0.18, hz + hs * 0.7);
      eyes(P, o, 0, hy + 0.06 * s, hz + hs * 0.56, s * (o.head || 1), 0.12);
      if (o.tail !== false) { P.b(0.1 * s, 0.1 * s, 0.4 * s * (o.tailL || 1), c2, 0, lh + bh * 0.7, -L / 2 - 0.18 * s * (o.tailL || 1), { rotX: o.tailUp ? -0.6 : 0.3 }); if (o.tailTip) P.g(0.12 * s, 0.12 * s, 0.12 * s, o.gl, 0, lh + bh * (o.tailUp ? 1.1 : 0.55), -L / 2 - 0.36 * s * (o.tailL || 1), 2.2); }
      runEx(o.headX, P, o, { x: 0, y: hy + hs * 0.5, z: hz, s: s * (o.head || 1) });
      runEx(o.bodyX, P, o, { x: 0, y: lh + bh, z: 0, s });
    },
    legsA(P) { for (const [x, z] of [[-bw * 0.38, L * 0.36], [bw * 0.38, -L * 0.36]]) P.b(0.18 * s * (o.w || 1), lh, 0.2 * s, o.legC || c2, x, -lh / 2, z); },
    legsB(P) { for (const [x, z] of [[bw * 0.38, L * 0.36], [-bw * 0.38, -L * 0.36]]) P.b(0.18 * s * (o.w || 1), lh, 0.2 * s, o.legC || c2, x, -lh / 2, z); },
  };
  const pivots = { legsA: [0, lh, 0], legsB: [0, lh, 0] };
  const anim = { legsA: "legA", legsB: "legB" };
  if (o.orbit) { parts.ring = orbitRing(o, s); pivots.ring = [0, lh + bh, 0]; anim.ring = "orbit"; }
  return { height: hy + hs * 0.6 + (o.extraH || 0), size: Math.max(bw, L), hover: o.hover || 0, parts, pivots, anim };
}

function insect(o) {
  const s = o.s || 1, L = 0.75 * s * (o.len || 1), bw = 0.6 * s * (o.w || 1), bh = 0.3 * s * (o.th || 1), lift = 0.16 * s;
  const c1 = o.c1, c2 = o.c2 || shade(o.c1, 0.7), c3 = o.c3 || shade(o.c1, 1.2);
  const legs = o.legs || 3;
  const leg = (side, i) => [side * bw * 0.6, 0, L * 0.35 - (i * L * 0.7) / Math.max(1, legs - 1)];
  const parts = {
    body(P) {
      P.b(bw, bh, L, c1, 0, lift + bh / 2, -0.04 * s, { top: c3 });
      P.b(bw * 0.6, bh * 0.8, 0.26 * s, c2, 0, lift + bh * 0.4, L / 2 + 0.08 * s);
      eyes(P, o, 0, lift + bh * 0.5, L / 2 + 0.22 * s, s, 0.09);
      if (o.mandibles !== false) for (const sx of [-1, 1]) P.b(0.05 * s, 0.05 * s, 0.22 * s, shade(c2, 0.7), sx * 0.12 * s, lift + bh * 0.3, L / 2 + 0.3 * s, { rotY: sx * 0.4 });
      runEx(o.bodyX, P, o, { x: 0, y: lift + bh, z: 0, s });
    },
    legA(P) { for (let i = 0; i < legs; i++) { const [x, , z] = leg(i % 2 ? 1 : -1, i); P.b(0.26 * s, 0.06 * s, 0.06 * s, o.legC || c2, x, 0, z, { rotZ: x > 0 ? -0.6 : 0.6 }); } },
    legB(P) { for (let i = 0; i < legs; i++) { const [x, , z] = leg(i % 2 ? -1 : 1, i); P.b(0.26 * s, 0.06 * s, 0.06 * s, o.legC || c2, x, 0, z, { rotZ: x > 0 ? -0.6 : 0.6 }); } },
  };
  const pivots = { legA: [0, lift, 0], legB: [0, lift, 0] };
  const anim = { legA: "skitA", legB: "skitB" };
  if (o.wings) {
    parts.wingL = (P) => P.g(0.5 * s, 0.04 * s, 0.24 * s, o.wingC || "#fff8d0", -0.26 * s, 0, 0, 1.2);
    parts.wingR = (P) => P.g(0.5 * s, 0.04 * s, 0.24 * s, o.wingC || "#fff8d0", 0.26 * s, 0, 0, 1.2);
    pivots.wingL = [-bw * 0.2, lift + bh, -L * 0.1]; pivots.wingR = [bw * 0.2, lift + bh, -L * 0.1];
    anim.wingL = "buzzL"; anim.wingR = "buzzR";
  }
  return { height: lift + bh + (o.extraH || 0.2 * s), size: Math.max(bw * 1.4, L), hover: o.hover || 0, parts, pivots, anim };
}

function flyer(o) {
  const s = o.s || 1, L = 0.8 * s * (o.len || 1), bw = 0.42 * s * (o.w || 1), bh = 0.36 * s * (o.th || 1);
  const c1 = o.c1, c2 = o.c2 || shade(o.c1, 0.75), c3 = o.c3 || shade(o.c1, 1.2), wc = o.wingC || shade(c1, 0.7);
  const ws = (o.wingS || 1) * s, hs = 0.32 * s * (o.head || 1);
  const parts = {
    body(P) {
      P.b(bw, bh, L, c1, 0, 0, 0, { top: c3 });
      P.b(bw * 0.8, bh * 0.4, L * 0.8, o.belly || c2, 0, -bh * 0.35, 0);
      P.b(hs, hs * 0.9, hs * 1.2, o.headC || c1, 0, bh * 0.3, L / 2 + hs * 0.4, { top: c3 });
      eyes(P, o, 0, bh * 0.4, L / 2 + hs * 1.0, s * (o.head || 1), 0.09);
      if (o.tail !== false) { P.b(0.12 * s, 0.1 * s, 0.5 * s * (o.tailL || 1), c2, 0, 0, -L / 2 - 0.25 * s * (o.tailL || 1)); P.b(0.24 * s, 0.05 * s, 0.16 * s, c3, 0, 0, -L / 2 - 0.5 * s * (o.tailL || 1)); }
      for (const sx of [-1, 1]) P.b(0.08 * s, 0.22 * s, 0.08 * s, c2, sx * bw * 0.3, -bh * 0.6, L * 0.1);
      runEx(o.headX, P, o, { x: 0, y: bh * 0.3 + hs * 0.45, z: L / 2 + hs * 0.4, s: s * (o.head || 1) });
      runEx(o.bodyX, P, o, { x: 0, y: bh * 0.5, z: 0, s });
    },
    wingL(P) { P.b(0.7 * ws, 0.05 * s, 0.5 * ws, wc, -0.35 * ws, 0, 0, { top: shade(wc, 1.2) }); P.b(0.45 * ws, 0.05 * s, 0.34 * ws, shade(wc, 1.15), -0.85 * ws, 0.02, -0.06 * ws); if (o.wingGlow) P.g(0.6 * ws, 0.02 * s, 0.06 * s, o.wingGlow, -0.5 * ws, 0.03 * s, 0.22 * ws, 1.8); },
    wingR(P) { P.b(0.7 * ws, 0.05 * s, 0.5 * ws, wc, 0.35 * ws, 0, 0, { top: shade(wc, 1.2) }); P.b(0.45 * ws, 0.05 * s, 0.34 * ws, shade(wc, 1.15), 0.85 * ws, 0.02, -0.06 * ws); if (o.wingGlow) P.g(0.6 * ws, 0.02 * s, 0.06 * s, o.wingGlow, 0.5 * ws, 0.03 * s, 0.22 * ws, 1.8); },
  };
  const pivots = { wingL: [-bw * 0.4, bh * 0.3, 0.05 * s], wingR: [bw * 0.4, bh * 0.3, 0.05 * s] };
  const anim = { wingL: o.buzz ? "buzzL" : "flapL", wingR: o.buzz ? "buzzR" : "flapR" };
  if (o.orbit) { parts.ring = orbitRing(o, s); pivots.ring = [0, 0, 0]; anim.ring = "orbit"; }
  return { height: bh * 0.8 + hs, size: Math.max(bw, L), hover: o.hover || 1.6 * Math.max(0.8, s), fly: true, parts, pivots, anim };
}

function floater(o) {
  const s = o.s || 1, c1 = o.c1, c2 = o.c2 || shade(c1, 0.75), c3 = o.c3 || shade(c1, 1.25);
  const bw = 0.5 * s * (o.w || 1), bh = 0.7 * s * (o.th || 1), hs = 0.38 * s * (o.head || 1);
  const glowBody = !!o.glowBody;
  const parts = {
    body(P) {
      const B = glowBody ? (w, h, d, c, x, y, z, op) => P.g(w, h, d, c, x, y, z, o.k || 1.6, op) : (w, h, d, c, x, y, z, op) => P.b(w, h, d, c, x, y, z, op);
      B(bw, bh, bw * 0.8, c1, 0, bh / 2 + 0.2 * s, 0, { top: c3 });
      B(bw * 0.7, 0.3 * s, bw * 0.6, c2, 0, 0.1 * s, -0.04 * s);
      B(bw * 0.4, 0.22 * s, bw * 0.4, shade(c2, 0.8), 0, -0.12 * s, -0.1 * s);
      if (!o.noHead) { B(hs, hs, hs, o.headC || c1, 0, bh + 0.2 * s + hs * 0.5, 0.02 * s, { top: c3 }); eyes(P, o, 0, bh + 0.24 * s + hs * 0.5, hs * 0.52, s * (o.head || 1)); }
      if (o.arms) for (const sx of [-1, 1]) B(0.14 * s, 0.5 * s, 0.14 * s, c2, sx * (bw / 2 + 0.08 * s), bh * 0.6 + 0.2 * s, 0.05 * s, { rotZ: sx * 0.3 });
      runEx(o.headX, P, o, { x: 0, y: bh + 0.2 * s + hs, z: 0.02 * s, s: s * (o.head || 1) });
      runEx(o.bodyX, P, o, { x: 0, y: bh * 0.6 + 0.2 * s, z: 0, s });
    },
  };
  const pivots = {}, anim = {};
  if (o.orbit !== false) { parts.ring = orbitRing(o, s); pivots.ring = [0, bh * 0.6, 0]; anim.ring = "orbit"; }
  return { height: bh + hs + 0.3 * s, size: bw * 1.6, hover: o.hover != null ? o.hover : 0.5 * s, fly: !!o.flyer, parts, pivots, anim };
}

function blob(o) {
  const s = o.s || 1, c1 = o.c1, c2 = o.c2 || shade(c1, 0.75), c3 = o.c3 || shade(c1, 1.25);
  const parts = {
    jelly(P) {
      const B = o.glowBody ? (w, h, d, c, x, y, z, op) => P.g(w, h, d, c, x, y, z, o.k || 1.4, op) : (w, h, d, c, x, y, z, op) => P.b(w, h, d, c, x, y, z, op);
      B(0.9 * s, 0.45 * s, 0.9 * s, c1, 0, 0.22 * s, 0, { top: c3 });
      B(0.7 * s, 0.3 * s, 0.7 * s, c1, 0, 0.55 * s, 0, { top: c3 });
      B(0.42 * s, 0.18 * s, 0.42 * s, c3, 0, 0.78 * s, 0);
      if (o.core) P.g(0.3 * s, 0.3 * s, 0.3 * s, o.gl, 0, 0.4 * s, 0, 2.0);
      eyes(P, o, 0, 0.55 * s, 0.36 * s, s, 0.14);
      runEx(o.bodyX, P, o, { x: 0, y: 0.5 * s, z: 0, s });
    },
  };
  return { height: 0.9 * s, size: 0.9 * s, hover: 0, parts, pivots: { jelly: [0, 0, 0] }, anim: { jelly: "wobble" } };
}

function serpent(o) {
  const s = o.s || 1, c1 = o.c1, c2 = o.c2 || shade(c1, 0.75), c3 = o.c3 || shade(c1, 1.2);
  const parts = {
    tail(P) { for (let i = 0; i < 5; i++) { const a = i * 1.1; P.b((0.4 - i * 0.05) * s, 0.24 * s, (0.4 - i * 0.05) * s, i % 2 ? c1 : c2, Math.cos(a) * 0.3 * s, 0.12 * s, -0.1 * s - Math.sin(a) * 0.3 * s - i * 0.08 * s, { top: c3 }); } },
    body(P) {
      P.b(0.46 * s, 0.7 * s, 0.36 * s, c1, 0, 0.6 * s, 0.1 * s, { top: c3 });
      P.b(0.34 * s, 0.5 * s, 0.06 * s, o.belly || c3, 0, 0.6 * s, 0.29 * s);
      P.b(0.36 * s, 0.34 * s, 0.36 * s, c1, 0, 1.12 * s, 0.14 * s, { top: c3 });
      eyes(P, o, 0, 1.14 * s, 0.33 * s, s, 0.09);
      runEx(o.headX, P, o, { x: 0, y: 1.3 * s, z: 0.14 * s, s });
    },
    armL(P) { P.b(0.14 * s, 0.45 * s, 0.14 * s, c1, 0, -0.22 * s, 0); },
    armR(P) { P.b(0.14 * s, 0.45 * s, 0.14 * s, c1, 0, -0.22 * s, 0); if (o.weapon && WEAPON[o.weapon]) WEAPON[o.weapon](P, o, { x: 0, y: -0.45 * s, z: 0, s }); },
  };
  return { height: 1.4 * s, size: 0.8 * s, hover: 0, parts, pivots: { tail: [0, 0, 0], armL: [-0.3 * s, 0.9 * s, 0.1 * s], armR: [0.3 * s, 0.9 * s, 0.1 * s] }, anim: { tail: "wobble", armL: "swingB", armR: "swingA" } };
}

function tank(o) {
  const s = o.s || 1, c1 = o.c1, c2 = o.c2 || shade(c1, 0.7), c3 = o.c3 || shade(c1, 1.2);
  const parts = {
    body(P) {
      P.b(1.0 * s, 0.55 * s, 1.3 * s, c1, 0, 0.62 * s, 0, { top: c3 });
      P.b(0.7 * s, 0.4 * s, 0.7 * s, c2, 0, 1.08 * s, -0.05 * s, { top: c1 });
      P.g(0.3 * s, 0.1 * s, 0.04 * s, o.eye || "#ffb15c", 0, 1.1 * s, 0.31 * s, 2.4);
      runEx(o.bodyX, P, o, { x: 0, y: 1.2 * s, z: 0, s });
    },
    treadA(P) { for (const sx of [-1, 1]) { P.b(0.26 * s, 0.4 * s, 1.4 * s, "#2a2a30", sx * 0.6 * s, 0, 0); for (let i = 0; i < 4; i++) P.b(0.27 * s, 0.08 * s, 0.1 * s, "#5a5a60", sx * 0.6 * s, 0.2 * s, -0.5 * s + i * 0.34 * s); } },
  };
  return { height: 1.4 * s, size: 1.4 * s, hover: 0, parts, pivots: { treadA: [0, 0.22 * s, 0] }, anim: {} };
}

const PLAN = { biped, quad, insect, flyer, floater, blob, serpent, tank, golem: (o) => biped({ w: 1.5, th: 1.1, d: 1.25, head: 0.75, arm: 1.3, leg: 0.9, ...o }) };

// ---------------------------------------------------------------------------
// THE SPECS
// ---------------------------------------------------------------------------
export const MOB_SPECS = {
  // swarms
  gnasher_rats: { plan: "quad", s: 0.55, c1: "#7a6a5a", c2: "#4a3e34", eye: "#ff4d4d", snout: true, tailL: 1.4, headX: ["tusks"] },
  ember_wisps: { plan: "floater", s: 0.45, c1: "#ffb15c", c2: "#ff6a2a", c3: "#fff2a8", glowBody: true, k: 2.2, eye: "#2a0f0a", gl: "#ffb15c", orbitR: 0.5, orbitN: 5, hover: 0.5 },
  bone_crawlers: { plan: "insect", s: 0.65, c1: "#e6dcc8", c2: "#a89c84", eye: "#7fe8ff", bodyX: ["ribs"] },
  spore_mites: { plan: "insect", s: 0.42, c1: "#8a5aa8", c2: "#5a3a6a", eye: "#c6ff5a", gl: "#c6ff5a", bodyX: ["spots"] },
  // runners
  shadow_hound: { plan: "quad", s: 0.8, len: 1.2, w: 0.85, leg: 1.2, c1: "#2a2436", c2: "#15101f", eye: "#ff3b6b", snout: true, gl: "#ff3b6b", bodyX: ["glowSpines"], tailTip: true },
  wind_courier: { plan: "biped", s: 0.7, w: 0.8, c1: "#cfe8ff", c2: "#8fb4e0", eye: "#2a4a8a", wings: true, buzz: true, wingC: "#ffffff", headX: ["scarf"], hover: 0.2 },
  cinder_lizard: { plan: "quad", s: 0.75, len: 1.3, leg: 0.6, th: 0.7, c1: "#a3482a", c2: "#5a2418", eye: "#ffd23d", gl: "#ffb15c", snout: true, tailL: 1.6, bodyX: ["glowSpines"] },
  phantom_stag: { plan: "quad", s: 0.9, leg: 1.6, len: 1.0, c1: "#3a8a7a", c2: "#1e5a50", c3: "#7fd8c0", eye: "#7fffd0", horn: "#7fffd0", headX: ["antlers"], snout: true, gl: "#7fffd0", orbit: true, orbitN: 6, orbitR: 0.6 },
  // brutes
  stone_ogre: { plan: "biped", s: 1.25, w: 1.35, th: 1.1, c1: "#7a8a6a", c2: "#4a5a3a", eye: "#ffd23d", weapon: "club", headX: ["tusks"], bodyX: [] },
  ironhide_boar: { plan: "quad", s: 1.15, c1: "#5a4a40", c2: "#3a2e26", eye: "#ff4d4d", snout: true, headX: ["tusks"], bodyX: ["plates", "spikes"], plateC: "#8a8f99" },
  siege_troll: { plan: "biped", s: 1.3, w: 1.0, arm: 1.5, hunch: true, c1: "#5f8a5a", c2: "#3a5a3a", eye: "#ffd23d", weapon: "log", headX: ["tusks"] },
  granite_tortoise: { plan: "quad", s: 1.25, leg: 0.6, c1: "#5a6a5a", c2: "#3e4a3e", eye: "#ffd23d", bodyX: ["shell"], shellC: "#6a6a72", tail: false },
  // flyers
  gargoyle: { plan: "flyer", s: 0.95, c1: "#6e6e7a", c2: "#4a4a56", eye: "#ff3b6b", headX: ["horns"], horn: "#3a3a44", wingC: "#5a5a66" },
  storm_harpy: { plan: "flyer", s: 0.8, c1: "#5d6c92", c2: "#3e4a6a", eye: "#ffe066", wingC: "#7a88b0", wingGlow: "#c9a6ff", headX: ["hair"], hairC: "#c9a6ff" },
  bat_swarm: { plan: "flyer", s: 0.5, c1: "#2e2438", c2: "#1e1628", eye: "#ff6a6a", wingC: "#3a2a48", tail: false, hover: 1.4 },
  wyvern: { plan: "flyer", s: 1.5, len: 1.3, c1: "#4a5a3a", c2: "#2e3a24", belly: "#a8a070", eye: "#ffb15c", headX: ["horns"], horn: "#d8d0b8", wingC: "#3e4e32", tailL: 1.5 },
  // stealth
  shade_stalker: { plan: "biped", s: 0.95, w: 0.8, c1: "#1a1628", c2: "#0e0a18", eye: "#c77dff", headX: ["hood"], hoodC: "#241e36", weapon: "sword" },
  veil_wraith: { plan: "floater", s: 1.0, c1: "#2a3a4a", c2: "#1a2430", c3: "#4a6070", eye: "#9fe8ff", gl: "#9fe8ff", arms: true, headX: ["hood"], hoodC: "#223040", orbitN: 6 },
  // disruptors
  siege_ram: { plan: "quad", s: 1.25, c1: "#d8d0c0", c2: "#8a8070", eye: "#2a1a14", headX: ["curlHorns"], horn: "#c9a24a", bodyX: ["plates"], plateC: "#7a6a5a", snout: true },
  rust_beetle: { plan: "insect", s: 1.05, c1: "#8a4a2a", c2: "#5a2e1a", c3: "#c97a3a", eye: "#9cff5a", gl: "#9cff5a", bodyX: ["spots"] },
  wrecker_golem: { plan: "golem", s: 1.3, c1: "#6a5a4a", c2: "#4a3e32", eye: "#ffb15c", gl: "#ffb15c", weapon: "boulder", bodyX: ["cracks"] },
  // support
  troll_shaman: { plan: "biped", s: 1.0, hunch: true, c1: "#5f8a6a", c2: "#3a5a44", eye: "#ffd23d", weapon: "staff", gl: "#9cff7a", headX: ["mask"], maskC: "#e8dcc0" },
  banner_bearer: { plan: "biped", s: 1.1, w: 1.1, c1: "#8a8f99", c2: "#5a5f69", eye: "#ffd23d", headX: ["helm"], bodyX: ["banner"], flag: "#c94a4a", shield: "round" },
  war_drummer: { plan: "biped", s: 1.05, w: 1.15, c1: "#8a5a3a", c2: "#5a3a24", eye: "#ffd23d", headX: ["horns"], bodyX: ["drum"] },
  moss_golem: { plan: "golem", s: 1.15, c1: "#6a7a6a", c2: "#4a5a4a", eye: "#9cff7a", gl: "#9cff7a", headX: ["mossTop"], bodyX: ["core"] },
  // death
  gel_slime: { plan: "blob", s: 1.0, c1: "#7fd45f", c2: "#4a9a3a", c3: "#b8ff9a", eye: "#1a3a10", core: true, gl: "#c6ff5a" },
  slime_m: { plan: "blob", s: 0.72, c1: "#7fd45f", c2: "#4a9a3a", c3: "#b8ff9a", eye: "#1a3a10", core: true, gl: "#c6ff5a" },
  slime_s: { plan: "blob", s: 0.48, c1: "#7fd45f", c2: "#4a9a3a", c3: "#b8ff9a", eye: "#1a3a10" },
  hatchling_sac: { plan: "blob", s: 1.1, c1: "#c9a8a0", c2: "#8a6a64", c3: "#e8d0c8", eye: "#ff7aa8", gl: "#ff7aa8", bodyX: ["veins"], core: true },
  hatchling: { plan: "insect", s: 0.45, c1: "#d98aa0", c2: "#9a5a6a", eye: "#ffe066" },
  martyr_acolyte: { plan: "biped", s: 0.85, c1: "#d8c8b0", c2: "#a89880", eye: "#3a2a1a", robe: true, robeC: "#c8b898", headX: ["hood", "halo"], hoodC: "#c0b090", bodyX: ["candle"] },
  // resistant
  rune_knight: { plan: "biped", s: 1.15, w: 1.1, c1: "#3a4250", c2: "#262c36", eye: "#7fb4ff", gl: "#7fb4ff", headX: ["helm"], helmC: "#4a5262", bodyX: ["runes"], shield: "rune", weapon: "sword" },
  spellward_golem: { plan: "golem", s: 1.2, c1: "#8a7aa8", c2: "#5a4a78", eye: "#e2c8ff", gl: "#e2c8ff", bodyX: ["runes"], orbit: true, orbitN: 10, orbitR: 0.9 },
  aegis_bearer: { plan: "biped", s: 1.05, w: 1.1, c1: "#9a8a6a", c2: "#6a5a44", eye: "#ffd23d", headX: ["helm"], helmC: "#c9a24a", shield: "tower", gl: "#7fe8ff" },
  adaptive_husk: { plan: "biped", s: 1.05, hunch: true, c1: "#6a5a7a", c2: "#463a54", eye: "#ffffff", gl: "#ffffff", bodyX: ["core", "spikes"], weapon: "claws" },
  // summoners
  necromancer: { plan: "biped", s: 1.0, c1: "#2a2236", c2: "#18121f", eye: "#9cff7a", robe: true, robeC: "#1e1828", headX: ["hood"], weapon: "skullStaff", gl: "#9cff7a" },
  skeleton: { plan: "biped", s: 0.85, w: 0.7, c1: "#e6dcc8", c2: "#b8ac94", eye: "#7fe8ff", bodyX: ["ribs"], weapon: "sword" },
  brood_mother: { plan: "insect", s: 1.35, legs: 4, c1: "#3a2a2a", c2: "#221818", eye: "#ff4d4d", gl: "#ff4d4d", bodyX: ["spots", "stinger"] },
  spiderling: { plan: "insect", s: 0.42, legs: 4, c1: "#4a3a3a", c2: "#2a2020", eye: "#ff4d4d" },
  hive_queen: { plan: "insect", s: 1.4, wings: true, c1: "#c9a23a", c2: "#6a5020", eye: "#2a1a0a", bodyX: ["stripes", "stinger"], gl: "#ffd23d" },
  hive_drone: { plan: "insect", s: 0.55, wings: true, c1: "#d9b84a", c2: "#5a4818", eye: "#1a1008", bodyX: ["stripes"] },
  // tricksters
  blink_imp: { plan: "biped", s: 0.75, c1: "#7a3aa8", c2: "#4a2068", eye: "#ffe066", headX: ["horns"], horn: "#c77dff", orbit: true, orbitN: 4, orbitR: 0.4, gl: "#c77dff" },
  phase_walker: { plan: "biped", s: 1.0, w: 0.9, c1: "#4a6a8a", c2: "#2e4460", eye: "#7fe8ff", gl: "#7fe8ff", bodyX: ["runes"], headX: ["hood"], hoodC: "#3a5470" },
  escape_artist: { plan: "biped", s: 0.9, w: 0.85, c1: "#3a2a4a", c2: "#221830", eye: "#ffe066", headX: ["hat"], bodyX: ["cape"], capeC: "#a3262a" },
  // fire
  magma_elemental: { plan: "golem", s: 1.2, c1: "#3a2620", c2: "#24160f", eye: "#ffd23d", gl: "#ff6a2a", bodyX: ["cracks", "core"], orbit: true, orbitN: 6, orbitR: 0.8 },
  cinderling: { plan: "blob", s: 0.45, c1: "#ff6a2a", c2: "#a3302a", c3: "#ffd27a", glowBody: true, k: 1.9, eye: "#2a0f0a" },
  hellhound_pair: { plan: "quad", s: 0.85, len: 1.15, c1: "#3a1a14", c2: "#24100c", eye: "#ffd23d", gl: "#ff6a2a", snout: true, bodyX: ["glowSpines"], tailTip: true, tailUp: true },
  infernal: { plan: "golem", s: 1.35, c1: "#2a2028", c2: "#18121a", eye: "#9cff5a", gl: "#ff4a10", bodyX: ["cracks", "core"], headX: ["horns"], horn: "#18121a" },
  ash_revenant: { plan: "biped", s: 1.0, w: 0.85, c1: "#5a5050", c2: "#3a3434", eye: "#ff6a2a", gl: "#ff6a2a", bodyX: ["ribs", "cracks"], weapon: "sword" },
  // ice & water
  frost_wyrm: { plan: "flyer", s: 1.55, len: 1.3, c1: "#cfe5f3", c2: "#8ab0cc", belly: "#a8c8e0", eye: "#5bd6ff", wingC: "#9fc8e8", wingGlow: "#7fe8ff", headX: ["horns"], horn: "#e8f6ff", tailL: 1.6 },
  snow_yeti: { plan: "biped", s: 1.3, w: 1.3, th: 1.1, c1: "#e6eef6", c2: "#b8c8d8", headC: "#5a6a7a", eye: "#5bd6ff", arm: 1.3, headX: ["horns"], horn: "#c8d8e8" },
  tide_naga: { plan: "serpent", s: 1.0, c1: "#2a7a8a", c2: "#1a5a66", belly: "#a8e0d0", eye: "#ffe066", weapon: "trident", headX: ["hair"], hairC: "#1e6a5a" },
  shell_turtle: { plan: "quad", s: 1.2, leg: 0.55, c1: "#6a8a7a", c2: "#4a6a5a", eye: "#ffe066", bodyX: ["shell"], shellC: "#4a7a8a", tail: false },
  // nature
  treant: { plan: "golem", s: 1.35, c1: "#5a4030", c2: "#3e2c20", eye: "#9cff7a", headX: ["leaves"], weapon: "log" },
  vine_strangler: { plan: "biped", s: 1.0, w: 0.9, c1: "#3a6a2a", c2: "#24461a", headC: "#d94a7a", eye: "#ffe066", arm: 1.6, weapon: "claws" },
  spore_shambler: { plan: "biped", s: 1.05, w: 1.0, c1: "#e8d8c0", c2: "#b8a890", eye: "#3a2a1a", headX: ["cap"], capC: "#8a3a3a", gl: "#ffe0a0", noHead: false },
  dryad_huntress: { plan: "biped", s: 0.95, w: 0.8, c1: "#7ab84a", c2: "#4a7a2a", eye: "#ffe066", headX: ["hair"], hairC: "#3c7a30", weapon: "bow" },
  // storm
  thunder_lizard: { plan: "quad", s: 0.95, len: 1.25, leg: 0.8, c1: "#3a4a7a", c2: "#242e52", eye: "#ffe066", gl: "#c9a6ff", snout: true, bodyX: ["glowSpines"], tailL: 1.4, tailTip: true },
  tempest_elemental: { plan: "floater", s: 0.9, flyer: true, hover: 1.6, c1: "#a8b8d8", c2: "#7a88b0", c3: "#e0e8ff", eye: "#ffe066", gl: "#e2c8ff", orbitN: 10, orbitR: 0.7, noHead: true },
  cloud_djinn: { plan: "floater", s: 1.0, flyer: true, hover: 1.5, c1: "#8a9ac8", c2: "#5a6a98", eye: "#7fe8ff", gl: "#7fe8ff", arms: true, headX: ["turban"], c3: "#e8dcc0" },
  // light
  radiant_paladin: { plan: "biped", s: 1.15, w: 1.15, c1: "#efe6d2", c2: "#c0b090", eye: "#ffd23d", headX: ["helm", "halo"], helmC: "#d9b84a", weapon: "hammer", shield: "round", shieldC: "#d9b84a" },
  sun_priest: { plan: "biped", s: 0.95, c1: "#f2e8c6", c2: "#c8b890", eye: "#3a2a1a", robe: true, robeC: "#e8dcb0", headX: ["hood"], hoodC: "#e0d4a8", bodyX: ["sunDisc"], weapon: "staff", gl: "#ffe066" },
  prism_golem: { plan: "golem", s: 1.2, c1: "#bfe8ff", c2: "#7fb8d8", c3: "#eaf8ff", eye: "#ffffff", gl: "#bff0ff", bodyX: ["core"], orbit: true, orbitN: 6, orbitR: 0.8 },
  // darkness & undead
  ghoul: { plan: "biped", s: 0.9, hunch: true, c1: "#6a7a6a", c2: "#465446", eye: "#ffe066", weapon: "claws", arm: 1.3 },
  banshee: { plan: "floater", s: 0.95, c1: "#9ab8c8", c2: "#6a8898", eye: "#ffffff", gl: "#cfeeff", arms: true, headX: ["hair"], hairC: "#e0f0f8", orbitN: 5, glowBody: false },
  death_revenant: { plan: "biped", s: 1.15, w: 1.1, c1: "#3a3a44", c2: "#24242c", eye: "#7fe8ff", headX: ["helm"], helmC: "#2a2a32", weapon: "sword", bodyX: ["ribs"] },
  abomination: { plan: "biped", s: 1.5, w: 1.5, th: 1.2, d: 1.3, c1: "#8a9a7a", c2: "#5a6a4a", eye: "#ffe066", gl: "#9cff7a", bodyX: ["stitches"], weapon: "hook", head: 0.7 },
  // mech
  clockwork_spiders: { plan: "insect", s: 0.6, legs: 4, c1: "#c9a24a", c2: "#5a4a2a", eye: "#ff4d4d", bodyX: ["gears"], gl: "#ff4d4d" },
  goblin_shredder: { plan: "biped", s: 1.2, w: 1.2, c1: "#7a6a5a", c2: "#4a3e32", eye: "#ffb15c", headX: ["helm"], helmC: "#6a6a72", weapon: "sawArm", bodyX: ["chimney"] },
  steam_tank: { plan: "tank", s: 1.2, c1: "#5a5a60", c2: "#3a3a40", eye: "#ffb15c", bodyX: ["chimney"] },
  repair_drone: { plan: "floater", s: 0.6, flyer: true, hover: 1.5, c1: "#9aa0a8", c2: "#6a7078", eye: "#7fe8ff", gl: "#7fe8ff", orbitGlow: false, orbitN: 4, orbitR: 0.55, noHead: false },
  // abnormal
  void_walker: { plan: "floater", s: 1.0, c1: "#2a1a3a", c2: "#180e24", eye: "#c77dff", gl: "#c77dff", arms: true, bodyX: ["core"] },
  mind_flayer: { plan: "biped", s: 1.05, w: 0.9, c1: "#7a5a8a", c2: "#4a3458", eye: "#ffffff", robe: true, robeC: "#3a2648", headX: ["tentacles"], c3: "#a87aa8" },
  glitch_wraith: { plan: "floater", s: 0.95, c1: "#ff5fa2", c2: "#5dffb0", c3: "#ffffff", glowBody: true, k: 1.5, eye: "#1a0a14", gl: "#5dffb0", orbitN: 6 },
  rift_horror: { plan: "blob", s: 1.5, c1: "#3a2a4a", c2: "#241830", c3: "#5a4270", eye: "#5dffb0", gl: "#5dffb0", bodyX: ["eyesMany", "maw"] },
  // elites
  ogre_warchief: { plan: "biped", s: 1.75, w: 1.35, th: 1.1, c1: "#7a6a4a", c2: "#4a3e28", eye: "#ff4d4d", headX: ["helm", "horns"], helmC: "#5a5f69", horn: "#d8d0b8", weapon: "axe", bodyX: ["cape", "plates"], capeC: "#6a1a1a" },
  dragonspawn: { plan: "flyer", s: 1.8, len: 1.2, c1: "#a3262a", c2: "#6a1a1a", belly: "#d9a050", eye: "#ffe066", headX: ["horns", "crown"], horn: "#c9a24a", wingC: "#7a1e22", wingGlow: "#ffb15c", tailL: 1.4 },
  mountain_giant: { plan: "golem", s: 1.9, c1: "#7a7a6a", c2: "#545448", eye: "#7fe8ff", gl: "#7fe8ff", headX: ["mossTop"], bodyX: ["boulders"], weapon: "boulder" },
  treasure_goblin: { plan: "biped", s: 0.75, w: 0.9, c1: "#6aa04a", c2: "#4a7a32", eye: "#ffe066", bodyX: ["sack"], weapon: "sack" },
  // challenge
  rat_prince: { plan: "quad", s: 1.0, c1: "#7a6a5a", c2: "#4a3e34", eye: "#ff4d4d", snout: true, tailL: 1.4, headX: ["crown"], crownC: "#c9c2a8", bodyX: ["cape"], capeC: "#5a2a6a" },
  rat_king: { plan: "quad", s: 1.7, c1: "#6a5a4a", c2: "#3e3428", eye: "#ff3b6b", snout: true, tailL: 1.6, headX: ["crown", "tusks"], bodyX: ["cape", "spikes"], capeC: "#6a1a4a" },
  mirewyrm: { plan: "flyer", s: 2.2, len: 1.4, c1: "#3a5a3a", c2: "#24382a", belly: "#7a8a50", eye: "#c6ff5a", wingC: "#2e4a2e", wingGlow: "#9cff5a", headX: ["horns"], horn: "#a8a070", bodyX: ["mossTop"], tailL: 1.8 },
  clockwork_colossus: { plan: "golem", s: 2.2, c1: "#b08a3a", c2: "#6a5020", c3: "#e0c070", eye: "#ff4d4d", gl: "#ffb15c", bodyX: ["gears", "chimney"], headX: ["helm"], helmC: "#8a6a2a", weapon: "hammer", hamC: "#6a6a72" },
  eclipse_herald: { plan: "floater", s: 1.9, c1: "#f2e8c6", c2: "#1a1428", c3: "#ffffff", eye: "#c77dff", gl: "#ffd23d", arms: true, headX: ["halo"], haloC: "#c77dff", orbitN: 12, orbitR: 1.0 },
};

// ---------------------------------------------------------------------------
// BUILDERS — a hovering little artisan per element (plus unlockable skins)
// ---------------------------------------------------------------------------
export const BUILDER_SPECS = {
  fire: { c1: "#a3482a", c2: "#5a2418", eye: "#ffd23d", gl: "#ff6a2a", headX: ["horns"], tool: "#ffb15c" },
  ice: { c1: "#bfe0f6", c2: "#7fa6cc", eye: "#2a4a8a", gl: "#7fe8ff", headX: ["hood"], hoodC: "#9fc8e8", tool: "#bff0ff" },
  nature: { c1: "#7a5a3a", c2: "#4a3424", eye: "#9cff7a", gl: "#9cff7a", headX: ["leaves"], tool: "#c6f5b5" },
  storm: { c1: "#5d6c92", c2: "#3a4466", eye: "#ffe066", gl: "#c9a6ff", headX: ["horns"], horn: "#c9a6ff", tool: "#e2c8ff" },
  light: { c1: "#f2e8c6", c2: "#c8b890", eye: "#3a2a1a", gl: "#ffe066", headX: ["halo"], tool: "#fff2a8" },
  darkness: { c1: "#3a2a4a", c2: "#221830", eye: "#c77dff", gl: "#c77dff", headX: ["hood"], hoodC: "#2a1e38", tool: "#c77dff" },
  mech: { c1: "#9aa0a8", c2: "#5a6068", eye: "#7fe8ff", gl: "#ffb15c", headX: ["helm"], helmC: "#c9a24a", tool: "#ffb15c" },
  abnormal: { c1: "#8a3a78", c2: "#5a2450", eye: "#5dffb0", gl: "#ff5fa2", headX: ["tentacles"], c3: "#ff9ad0", tool: "#5dffb0" },
  skin_veteran: { c1: "#6a7080", c2: "#3a4050", eye: "#ffd23d", gl: "#ffd23d", headX: ["helm"], helmC: "#8a8f99", tool: "#ffd23d" },
  skin_gilded: { c1: "#d9b84a", c2: "#8a6a2a", eye: "#ffffff", gl: "#fff2a8", headX: ["crown"], tool: "#fff2a8" },
  skin_ratcatcher: { c1: "#6a5a4a", c2: "#3e3428", eye: "#ff4d4d", gl: "#ffd23d", headX: ["hat"], tool: "#ffd23d" },
  skin_skywarden: { c1: "#cfe8ff", c2: "#8fb4e0", eye: "#2a4a8a", gl: "#7fe8ff", headX: ["horns"], horn: "#ffffff", tool: "#7fe8ff", wings: true },
  skin_tinker: { c1: "#b08a3a", c2: "#6a5020", eye: "#ff4d4d", gl: "#ffb15c", headX: ["helm"], helmC: "#6a6a72", tool: "#ffb15c" },
  skin_eclipse: { c1: "#1a1428", c2: "#f2e8c6", eye: "#c77dff", gl: "#c77dff", headX: ["halo"], haloC: "#c77dff", tool: "#ffd23d" },
  skin_champion: { c1: "#a3262a", c2: "#d9b84a", eye: "#ffe066", gl: "#ffd23d", headX: ["crown"], tool: "#ffd23d", wings: true },
};
export function builderModel(id) {
  const o = BUILDER_SPECS[id] || BUILDER_SPECS.fire;
  const s = 0.7, c1 = o.c1, c2 = o.c2;
  const parts = {
    body(P) {
      P.b(0.5 * s, 0.5 * s, 0.4 * s, c1, 0, 0.55 * s, 0, { top: shade(c1, 1.2) });
      P.b(0.52 * s, 0.1 * s, 0.42 * s, "#6a4a2e", 0, 0.34 * s, 0);
      P.b(0.08 * s, 0.08 * s, 0.08 * s, "#c9a24a", 0.12 * s, 0.34 * s, 0.22 * s);
      P.b(0.42 * s, 0.4 * s, 0.4 * s, c1, 0, 1.0 * s, 0.02 * s, { top: shade(c1, 1.15) });
      eyes(P, o, 0, 1.04 * s, 0.22 * s, s);
      runEx(o.headX, P, o, { x: 0, y: 1.2 * s, z: 0.02 * s, s });
      // a little hover-disc of light under it
      P.g(0.5 * s, 0.05 * s, 0.5 * s, o.gl, 0, 0.12 * s, 0, 1.6);
      P.b(0.3 * s, 0.2 * s, 0.26 * s, c2, 0, 0.24 * s, 0);
      // tool belt pack
      P.b(0.36 * s, 0.34 * s, 0.2 * s, c2, 0, 0.6 * s, -0.28 * s, { top: shade(c2, 1.2) });
    },
    armL(P) { P.b(0.14 * s, 0.4 * s, 0.14 * s, c1, 0, -0.2 * s, 0); },
    armR(P) {
      P.b(0.14 * s, 0.4 * s, 0.14 * s, c1, 0, -0.2 * s, 0);
      P.b(0.06 * s, 0.5 * s, 0.06 * s, "#6a4a2e", 0, -0.4 * s, 0.22 * s, { rotX: 1.2 });
      P.b(0.24 * s, 0.16 * s, 0.16 * s, "#8a8f99", 0, -0.5 * s, 0.44 * s, { rotX: 1.2, top: "#b8bcc8" });
      P.g(0.08 * s, 0.08 * s, 0.08 * s, o.tool, 0, -0.5 * s, 0.54 * s, 2.4);
    },
  };
  const pivots = { armL: [-0.33 * s, 0.75 * s, 0], armR: [0.33 * s, 0.75 * s, 0] };
  const anim = { armL: "swingB", armR: "hammer" };
  if (o.wings) {
    parts.wingL = (P) => P.g(0.5 * s, 0.04 * s, 0.22 * s, "#ffffff", -0.26 * s, 0, 0, 1.3);
    parts.wingR = (P) => P.g(0.5 * s, 0.04 * s, 0.22 * s, "#ffffff", 0.26 * s, 0, 0, 1.3);
    pivots.wingL = [-0.15 * s, 0.75 * s, -0.2 * s]; pivots.wingR = [0.15 * s, 0.75 * s, -0.2 * s];
    anim.wingL = "buzzL"; anim.wingR = "buzzR";
  }
  return { height: 1.3 * s, size: 0.6, hover: 0.9, parts, pivots, anim };
}

export const MOB_MODELS = {};
for (const id in MOB_SPECS) { const o = MOB_SPECS[id]; MOB_MODELS[id] = PLAN[o.plan](o); }
export function mobColor(id) { const o = MOB_SPECS[id]; return o ? o.c1 : null; }
