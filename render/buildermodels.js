/* Skyhold TD — render/buildermodels.js
   Every builder look as a voxel sculpt. A look = a CREATURE (one per element, plus the three general
   skins, which are characters of their own) + an OUTFIT from how it was earned:
     Sealbreaker (beat the Sealed One): broken shackles, glowing seal cracks, obsidian crown, shard wings
     Ratcatcher / Skywarden / Tinker / Eclipsed (the four challenges): hat & rat & lantern, goggles &
     scarf & feather wings, brass helm & gear pack & wrench, a dark/pale split with an eclipse halo.
   Output is the usual model { height, size, hover, parts: {body, armL, armR, wingL?, wingR?}, pivots, anim },
   so the field renderer, the wardrobe turntable and the card portraits use it unchanged.
   Units: one voxel = 0.03 model units (the builder is ~30 voxels tall; the field draws it 3.3× larger). */
import * as THREE from "three";
import { Vox, vnoise } from "./voxkit.js";
import { TAU } from "./kit.js";

const U = 0.03;
const SH = 16, AX = 8;             // shoulder height and arm pivot x (voxels)
const h3 = (x, y, z) => { let h = (x * 374761393 + y * 668265263 + z * 1442695041) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const lum = (c) => c.r * 0.3 + c.g * 0.55 + c.b * 0.15;

// palette helper: P(v)("#hex", glow?) -> palette index (cached per Vox by the kit)
const pp = (v) => (hex, e = 0, j = 0.05) => v.pal(hex, e, j);

// ---------------------------------------------------------------------------
// CREATURES — body(v, p) sculpts torso/head/back and returns anchors; arm(v, p, right) the arms;
// tool(v, p) the right-hand tool (drawn in the arm's space: hand at y = -11, forward = +z)
// ---------------------------------------------------------------------------
const disc = (v, p, col) => v.fill((x, y, z) => { const d = Math.hypot(x, z); return d <= 6.5 && d > 4.5 ? p(col, 1.6) : null; }, -7, 7, 0, 0, -7, 7);
const eyes = (v, p, y, z, col, e = 2.2, dx = 2, w = 0) => { for (const s of [-1, 1]) for (let i = 0; i <= w; i++) v.set(s * dx + (s * i), y, z, p(col, e)); };
const limb = (v, col, len = 10, r = 2, hand = null) => { v.cap([0, 0, 0], [0, -len, 0.5], r, col, r * 0.9); if (hand) v.ell(0, -len - 1, 0.6, r + 0.4, r + 0.2, r + 0.4, hand); };
const shaft = (v, col, from = [0, -11, 1], to = [0, -14, 14], r = 0.8) => v.cap(from, to, r, col, r);

const CREATURES = {
  fire: {
    name: "Ember Smith", hover: 0.9,
    body(v, p) {
      const SK = p("#a3482a"), SKD = p("#7a3220"), DK = p("#5a2418"), LE = p("#632b1b"), LE2 = p("#8c3b20"), BR = p("#c18a4c"), BRH = p("#f0c477"), IR = p("#3a3436"), HORN = p("#2a1a14"), HORN2 = p("#5a4030");
      disc(v, p, "#ff6a2a");
      for (const s of [-1, 1]) v.ell(s * 2.8, 4, 0.5, 2, 3, 2.4, DK);
      v.ell(0, 11, 0, 6.2, 6, 4.8, (x, y, z) => (y < 9 ? SKD : SK));
      v.fill((x, y, z) => (z >= 3 && Math.abs(x) <= 4.5 && y >= 6 && y <= 14 ? (y === 8 ? BR : y > 12 ? LE2 : LE) : null), -5, 5, 6, 14, 3, 6);   // apron
      v.ell(0, 11.5, 5, 1.6, 1.8, 0.8, p("#ffb447", 1.6)); v.set(0, 12, 5.6, p("#fff0b0", 2.2));                       // the furnace-heart
      for (const s of [-1, 1]) { v.ell(s * 6, 15, 0, 2.8, 2.2, 3, DK); v.fill((x, y, z) => (y === 16 ? BRH : null), s * 6 - 3, s * 6 + 3, 16, 16, -3, 3); }
      v.ell(0, 22, 0.5, 5, 5, 4.6, SK);
      v.box(-2, 19, 4, 2, 21, 6, SK); v.box(-2, 21, 5, 2, 21, 6, SKD); v.set(-1, 20, 6, DK); v.set(1, 20, 6, DK);
      eyes(v, p, 23, 5, "#ffd23d", 2.2);
      for (const s of [-1, 1]) v.path([[s * 3.5, 26, -0.5], [s * 6, 29, -2.5], [s * 6.8, 27.5, -5], [s * 5.5, 26, -6]], 1.4, 0.6, (x, y, z) => (z < -4 ? HORN2 : HORN));
      v.box(-4, 8, -8, 4, 16, -5, (x, y, z) => (z === -8 && Math.abs(x) <= 2 && y > 9 && y < 14 ? p("#ff8a32", 1.4) : y === 12 ? BR : IR));                 // furnace pack
      for (const s of [-1, 1]) { v.box(s * 2, 17, -7, s * 2, 20, -6, IR); v.set(s * 2, 21, -6.5, p("#ff6a2a", 1.8)); }
      v.path([[0, 7, -4], [0, 5, -7], [0, 3, -9]], 1.4, 0.7, SK); v.set(0, 3, -10, p("#ffb447", 2)); v.set(0, 4, -10, p("#ff6a2a", 1.8));
      return { top: 30, headY: 22, front: 6, back: -8 };
    },
    arm(v, p) { limb(v, p("#a3482a"), 10, 2, p("#5a2418")); },
    tool(v, p) {
      shaft(v, p("#6a4a2e"));
      v.box(-2.5, -17, 13, 2.5, -12, 17, (x, y, z) => (z === 15 ? p("#c18a4c") : p("#4b4c50")));
      v.box(-1, -15, 18, 1, -14, 18, p("#ff8a32", 1.8));
    },
  },
  ice: {
    name: "Frost Carver", hover: 0.9,
    body(v, p) {
      const PK = p("#e8f2fa"), PKD = p("#b8cde0"), FUR = p("#ffffff", 0, 0.03), SC = p("#4a86bf"), SCD = p("#33669a"), FACE = p("#f4dcc8"), RO = p("#8a6a4a");
      disc(v, p, "#7fe8ff");
      for (const s of [-1, 1]) v.ell(s * 3, 3.5, 0.5, 2.3, 2.6, 2.8, SC);
      v.ell(0, 11, 0, 6.8, 7, 5.6, (x, y, z) => ((x + y) % 5 === 0 && z > 3 ? PKD : y < 6 ? PKD : PK));
      v.fill((x, y, z) => { const d = Math.hypot(x, z); return d <= 6.4 ? (y === 17 ? SCD : SC) : null; }, -7, 7, 16, 17, -7, 7);   // scarf
      v.box(3, 9, 5, 4, 16, 6, SC); v.box(3, 9, 6, 4, 9, 6, FUR);
      v.ell(0, 22.5, 0, 6.2, 5.8, 5.8, PK);
      v.ell(0, 21.8, 4.6, 3.8, 3.4, 2.6, 0); v.ell(0, 21.8, 3.6, 3.6, 3.2, 2, FACE);                                      // face in the hood
      v.fill((x, y, z) => { const e = (x / 4.6) ** 2 + ((y - 21.8) / 4.2) ** 2; return e <= 1 && e > 0.55 && z >= 4 && z <= 5 ? FUR : null; }, -5, 5, 17, 27, 4, 5);
      eyes(v, p, 22, 5, "#2a4a8a", 0, 1.4); v.set(0, 21, 5, p("#f0a0a0"));
      v.ell(0, 29, -0.5, 1.8, 1.6, 1.8, FUR);
      v.fill((x, y, z) => (Math.abs(x) <= 3.5 && y >= 8 && y <= 15 && z <= -6 && z >= -10 ? (y === 11 || y === 12 ? RO : [p("#c4eafb"), p("#8bcdef"), p("#a6dcf5")][(x + y + z + 30) % 3]) : null), -4, 4, 8, 15, -10, -6);  // ice block
      return { top: 30, headY: 22, front: 6, back: -10 };
    },
    arm(v, p) { limb(v, p("#e8f2fa"), 10, 2.3, p("#4a86bf")); },
    tool(v, p) {
      shaft(v, (x, y, z) => ((z | 0) % 3 === 0 ? p("#4a86bf") : p("#8a6a4a")));
      v.path([[0, -18, 13], [0, -14, 14.5], [0, -10, 13]], 1.1, 0.6, p("#b8c4d0"));
      v.set(0, -19, 12.5, p("#bff4ff", 2)); v.set(0, -9, 12.5, p("#8a96a8"));
    },
  },
  nature: {
    name: "Sprout Gardener", hover: 0.9,
    body(v, p) {
      const BK = p("#7a5a3a"), BKD = p("#4a3424"), MO = p("#5f8a3a"), LF = p("#4f9a45"), LF2 = p("#78c25e"), PET = p("#ff8ab0"), YE = p("#ffe27a"), SA = p("#c9a46a"), SAD = p("#a8844a");
      disc(v, p, "#9cff7a");
      for (const s of [-1, 1]) v.path([[s * 2, 6, 0], [s * 4, 3, 1.5], [s * 6, 2, 2.5]], 1.4, 0.8, BKD);
      v.fill((x, y, z) => { const r = 5.3 - (y > 14 ? (y - 14) * 0.3 : 0), d = Math.hypot(x, z * 1.15); return d <= r ? ((Math.round(Math.atan2(z, x) * 3) & 1) ? BK : BKD) : null; }, -6, 6, 4, 17, -6, 6);
      for (const s of [-1, 1]) v.ell(s * 5, 15.5, 0, 2.6, 1.6, 2.8, MO);
      v.ell(0, 22, 0.3, 5, 4.8, 4.6, BK);
      eyes(v, p, 22.5, 5, "#9cff7a", 2.2);
      v.box(-1, 20, 5, 1, 20, 5, BKD);
      for (const [x, y, z, r] of [[0, 27, 0, 3], [-3, 26, 1, 2.4], [3, 26, -1, 2.4], [0, 26.5, -3, 2.4], [-1.5, 28.5, 2, 2]]) v.ell(x, y, z, r * 1.2, r * 0.7, r, (xx, yy, zz) => (h3(xx, yy, zz) < 0.3 ? LF2 : LF));
      for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; v.set(2 + Math.cos(a) * 1.6, 30, 1 + Math.sin(a) * 1.6, PET); }
      v.set(2, 30, 1, YE); v.set(2, 29, 1, LF);
      v.box(-6, 17, 0, -6, 18, 0, p("#efe2c8")); v.ell(-6, 19.5, 0, 2, 1, 2, (x, y, z) => (h3(x, y, z) < 0.25 ? p("#f4ead4") : p("#d9483a")));   // a toadstool on the shoulder
      v.ell(0, 11, -6.5, 3.6, 4, 2.4, (x, y, z) => (y === 12 ? SAD : SA)); v.path([[0, 14, -6.5], [0.5, 17, -7], [1.5, 18.5, -7]], 0.6, 0.6, LF); v.ell(2, 19, -7, 1.2, 0.6, 1, LF2);
      return { top: 30, headY: 22, front: 6, back: -9 };
    },
    arm(v, p) { v.path([[0, 0, 0], [0, -5, 0.5], [0, -10, 0.6]], 1.8, 1.4, p("#7a5a3a")); v.ell(0, -11, 0.6, 2, 1.8, 2, p("#5f8a3a")); },
    tool(v, p) {
      shaft(v, p("#8a6a3a"), [0, -9, -2], [0, -14, 12]);
      v.box(-1.5, -10, -3, 1.5, -10, -3, p("#5a4228"));
      v.fill((x, y, z) => (Math.abs(x) <= 2.5 - Math.max(0, z - 15) * 0.8 && z >= 12 && z <= 17 && Math.abs(y + 14.5) < 0.6 ? p("#a8b0b8") : null), -3, 3, -15, -14, 12, 17);
    },
  },
  storm: {
    name: "Spark Rigger", hover: 0.9,
    body(v, p) {
      const SU = p("#5d6c92"), SUD = p("#3a4466"), CU = p("#c98a4a"), CUH = p("#eab070"), SK = p("#e8c8b0"), CL = p("#8a90a8"), CL2 = p("#a8aec4"), ST = p("#8a92b0");
      disc(v, p, "#c9a6ff");
      for (const s of [-1, 1]) v.box(s * 3 - 1.5, 2, -1.5, s * 3 + 1.5, 6, 2, (x, y) => (y === 2 ? SUD : SU));
      v.ell(0, 11, 0, 6, 6, 4.6, (x, y, z) => (Math.abs(x) <= 3 && z > 3 && y > 9 && y < 15 ? SUD : SU));
      for (const s of [-1, 1]) v.box(s * 2.5, 9, 3, s * 2.5, 16, 5, CU);                                                    // overall straps
      v.box(-1, 11, 5, 1, 13, 5, p("#ffe066", 1.6));
      v.ell(0, 21.5, 0.4, 4.8, 4.8, 4.4, SK);
      v.fill((x, y, z) => (y === 22.5 && z > 3 ? CU : null), -5, 5, 22, 23, 3, 6);
      for (const s of [-1, 1]) { v.ell(s * 2, 22.5, 4.6, 1.5, 1.4, 0.8, CUH); v.set(s * 2, 22.5, 5.4, p("#ffe066", 2)); }
      for (const [x, y, z, r] of [[0, 26.5, 0, 3.6], [-3, 25.5, -1, 2.6], [3, 25.5, -1, 2.6], [0, 26, -3, 2.8]]) v.ell(x, y, z, r * 1.2, r * 0.8, r, (xx, yy) => (yy > y ? CL2 : CL));
      v.path([[1, 29, 0], [-0.5, 31, 0.5], [1, 32.5, 0]], 0.5, 0.5, p("#ecd1ff", 2));
      v.box(-3, 7, -8, 3, 15, -5, SUD);
      for (let i = 0; i < 4; i++) v.fill((x, y, z) => { const d = Math.hypot(x, z + 6.5); return y === 8 + i * 2 && d <= 2.6 && d > 1.2 ? CU : null; }, -3, 3, 8 + i * 2, 8 + i * 2, -9, -4);
      v.box(0, 15, -6.5, 0, 20, -6.5, ST); v.set(0, 21, -6.5, p("#ecd1ff", 2.2));
      return { top: 29, headY: 21.5, front: 6, back: -8 };
    },
    arm(v, p) { limb(v, p("#5d6c92"), 10, 2, p("#3a4466")); },
    tool(v, p) {
      shaft(v, p("#8a92b0"), [0, -11, 1], [0, -13, 12], 1);
      v.fill((x, y, z) => { const d = Math.hypot(y + 13.5, z - 15); return Math.abs(x) <= 1 && d <= 3.2 && d >= 1.4 && !(z > 15 && Math.abs(y + 13.5) < 1.3) ? p("#a8b0c8") : null; }, -1, 1, -17, -10, 12, 19);
      v.set(0, -13.5, 17, p("#ecd1ff", 2.2)); v.set(0, -12.5, 18, p("#c77dff", 1.8));
    },
  },
  light: {
    name: "Sun Mason", hover: 0.95,
    body(v, p) {
      const RO = p("#f2e8c6"), ROD = p("#d8cba4"), GO = p("#d9b84a"), GOH = p("#f4da7c"), SK = p("#e8c8a0"), BRK = p("#e2c25a"), BRKD = p("#b8962e");
      disc(v, p, "#ffe066");
      v.fill((x, y, z) => { const r = 7 - y * 0.12, d = Math.hypot(x, z * 1.1); return d <= r ? (y <= 3 ? GO : (Math.round(Math.atan2(z, x) * 4) & 1) && d > r - 1 ? ROD : RO) : null; }, -7, 7, 1, 17, -7, 7);
      v.fill((x, y, z) => (Math.abs(x) <= 1 && z > 3 && y > 3 && y < 16 ? GOH : null), -1, 1, 3, 16, 3, 7);                // a gold stole
      v.ell(0, 13, 5.2, 2, 2, 0.8, p("#ffe066", 1.7)); v.set(0, 13, 6, p("#ffffff", 2));                                  // sun medallion
      v.ell(0, 21.5, 0.3, 4.6, 4.8, 4.4, SK);
      v.fill((x, y, z) => { const d = Math.hypot(x, z); return d <= 5.3 && y >= 24 && y <= 27 - d * 0.25 && !(z > 3 && y < 25.5) ? (y === 24 ? GO : RO) : null; }, -6, 6, 24, 28, -6, 6);   // a mason's cap
      eyes(v, p, 22, 4.6, "#3a2a1a", 0, 1.6); v.set(0, 20.5, 4.6, p("#d9a888"));
      v.fill((x, y, z) => { const d = Math.hypot(x, z); return y === 31 && d >= 4 && d <= 5 ? p("#ffe066", 1.9) : null; }, -6, 6, 31, 31, -6, 6);   // the halo
      v.box(-3.5, 7, -9, 3.5, 7, -6, GO); for (let i = 0; i < 3; i++) v.box(-3 + (i & 1), 8 + i * 2, -9, 3 - (i & 1), 9 + i * 2, -6, (x, y, z) => ((x + 9) % 3 === 0 ? BRKD : BRK));
      return { top: 31, headY: 21.5, front: 6, back: -9 };
    },
    arm(v, p) { limb(v, p("#f2e8c6"), 10, 2.2, p("#e8c8a0")); v.fill((x, y) => (y === -8 ? p("#d9b84a") : null), -3, 3, -8, -8, -3, 3); },
    tool(v, p) {
      shaft(v, p("#8a6a3a"), [0, -11, 1], [0, -12.5, 8], 0.9);
      v.fill((x, y, z) => (Math.abs(y + 13) < 0.6 && Math.abs(x) <= 3.5 - Math.abs(z - 12) * 0.9 && z >= 8 ? p("#f4da7c") : null), -4, 4, -14, -12, 8, 16);
      v.set(0, -12, 12, p("#fff3c0", 1.8));
    },
  },
  darkness: {
    name: "Shade Weaver", hover: 1.05,
    body(v, p) {
      const CK = p("#3a2a4a"), CKD = p("#221830"), CKH = p("#4c3a62"), VO = p("#07050c", 0, 0.02), RU = p("#c77dff", 1.6);
      v.fill((x, y, z) => {
        const r = 6.8 - y * 0.08, d = Math.hypot(x, z * 1.1);
        if (d > r || (y < 4 && vnoise(x * 0.6, 3, z * 0.6) > 0.45 + y * 0.12)) return null;
        if (y === 5 && d > r - 1 && Math.round(Math.atan2(z, x) * 5) % 2 === 0) return RU;
        return d > r - 1 && (Math.round(Math.atan2(z, x) * 3) + y) % 6 === 0 ? CKD : CK;
      }, -7, 7, 0, 17, -7, 7);
      v.ell(0, 22, 0, 5.4, 5.6, 5.2, CKH);
      v.cap([0, 25, -2], [0, 30, -6], 3, CK, 0.8);
      v.ell(0, 21.5, 4, 3.6, 3.8, 2.6, 0); v.ell(0, 21.5, 2.8, 3.6, 3.8, 1.8, VO);
      eyes(v, p, 22, 3.6, "#c77dff", 2.4, 1.6);
      v.path([[0, 15, -5.5], [0, 18, -8], [0, 16, -10]], 0.6, 0.6, p("#4a4458"));
      v.box(-1.5, 11, -11.5, 1.5, 15, -8.5, (x, y, z) => (Math.abs(x) < 1 && y > 11 && y < 15 && Math.abs(z + 10) < 1 ? p("#b98cff", 2) : p("#2a2436")));
      return { top: 30, headY: 22, front: 5, back: -11 };
    },
    arm(v, p) { v.cap([0, 0, 0], [0, -9, 1], 2.4, p("#3a2a4a"), 2); v.ell(0, -10.5, 1.2, 1.4, 1.4, 1.4, p("#cbb9ff", 1.4)); },
    tool(v, p) {
      shaft(v, p("#2a2030"), [0, -11, 1], [0, -13, 11], 0.8);
      v.path([[0, -13, 11], [0, -10, 14], [0, -12, 17], [0, -16, 17]], 0.9, 0.4, p("#a98aff", 1.7));
    },
  },
  mech: {
    name: "Cog Unit", hover: 0.9,
    body(v, p) {
      const ST = p("#9aa0a8"), STH = p("#c2c8d0"), STD = p("#5a6068"), GUN = p("#2a2e32"), HZ = p("#e0a020"), AM = p("#ffb15c", 1.6), CY = p("#7fe8ff", 1.8);
      disc(v, p, "#ffb15c");
      for (const s of [-1, 1]) { v.box(s * 3, 4, 0, s * 3, 7, 0, STD); v.box(s * 3 - 1.5, 1, -2, s * 3 + 1.5, 3, 2.5, (x, y, z) => (y === 1 ? GUN : STD)); }
      v.box(-6, 7, -4, 6, 16, 4, (x, y, z) => { const ax = Math.abs(x), az = Math.abs(z); if (ax === 6 && az === 4) return null; if (y === 7) return (x + z) & 1 ? HZ : GUN; if (z === 4 && ax <= 3 && y >= 10 && y <= 14) return y === 12 ? (x & 1 ? AM : CY) : GUN; return y === 16 ? STH : (ax === 6 || az === 4) && (y + x) % 4 === 0 ? STD : ST; });
      v.box(-1, 17, -1, 1, 17, 1, GUN);
      v.box(-4.5, 18, -4, 4.5, 26, 4, (x, y, z) => { const ax = Math.abs(x), az = Math.abs(z); if (ax === 4.5 && az === 4) return null; if (z === 4 && y >= 20 && y <= 24 && ax <= 3.5) return y === 22 && (ax === 2 || ax === 1.5) ? CY : GUN; return y === 26 ? STH : ST; });
      for (const s of [-1, 1]) v.set(s * 2, 22, 4, CY);
      v.box(3, 27, 0, 3, 31, 0, STD); v.set(3, 32, 0, AM);
      v.box(-3.5, 8, -7, 3.5, 15, -5, (x, y) => (y % 3 === 0 ? HZ : GUN)); v.set(0, 13, -7, AM);
      return { top: 32, headY: 22, front: 5, back: -7 };
    },
    arm(v, p) { v.box(-1.2, -9, -1.2, 1.2, 0, 1.2, (x, y) => (y % 3 === 0 ? p("#5a6068") : p("#9aa0a8"))); v.box(-2, -12, -1, 2, -10, 2, p("#2a2e32")); },
    tool(v, p) {
      shaft(v, p("#9aa0a8"), [0, -11, 1], [0, -13, 13], 1.1);
      v.fill((x, y, z) => { const d = Math.hypot(y + 13.5, z - 15.5); return Math.abs(x) <= 1 && d <= 3 && !(z > 15.5 && Math.abs(y + 13.5) < 1) ? p("#c2c8d0") : null; }, -1, 1, -17, -10, 12, 19);
    },
  },
  abnormal: {
    name: "Glitchling", hover: 1.1,
    body(v, p) {
      const SK = p("#8a3a78"), SKD = p("#5a2450"), SKH = p("#a85090"), PK = p("#ff5fa2", 1.6), MN = p("#5dffb0", 1.7), WH = p("#f2e8f6"), BL = p("#07050c");
      for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + 0.3; v.path([[Math.cos(a) * 3, 6, Math.sin(a) * 3], [Math.cos(a) * 5, 2, Math.sin(a) * 5], [Math.cos(a + 0.6) * 6, -1, Math.sin(a + 0.6) * 6]], 1.4, 0.6, (x, y) => (y < 0 ? PK : SKD)); }
      v.ell(0, 15, 0, 7, 9.5, 6, (x, y, z) => { const n = vnoise(x * 0.35, y * 0.35, z * 0.35); return n > 0.7 ? PK : n < 0.25 ? SKH : y < 9 ? SKD : SK; });
      v.ell(0, 17, 5, 3.6, 3.6, 1.6, WH); v.ell(0, 17, 6, 2, 2, 0.8, MN); v.set(0, 17, 6.6, BL); v.set(0, 18, 6.6, BL);
      v.box(-1, 25, -1, 2, 28, 2, MN); v.box(1, 26, -2, 4, 28, 0, (x, y, z) => ((x + y + z) & 1 ? PK : p("#ffc2dd", 1.9)));
      return { top: 28, headY: 17, front: 6, back: -6 };
    },
    arm(v, p) { v.path([[0, 0, 0], [0, -5, 1], [0, -9, 0], [0, -11, 1]], 1.5, 0.8, p("#8a3a78")); },
    tool(v, p) {
      shaft(v, p("#5a2450"), [0, -11, 1], [0, -13, 11], 0.7);
      v.fill((x, y, z) => { const t = Math.abs(z - 13.5) / 2.5, r = 1.6 * (1 - t); return Math.abs(x) + Math.abs(y + 13.5) <= r + 0.3 && t <= 1 ? p(t > 0.6 ? "#c4ffe4" : "#5dffb0", 1.7) : null; }, -2, 2, -16, -11, 11, 16);
    },
  },

  // ----- the three general skins: characters of their own
  veteran: {
    name: "Veteran", hover: 0.9,
    body(v, p) {
      const CO = p("#6a5a44"), COD = p("#4a3e30"), PA = p("#8a7a5a"), SK = p("#e0b896"), BE = p("#c8c8c8", 0, 0.06), BED = p("#9a9a9a"), HE = p("#8a8f99"), HED = p("#5f646e"), BO = p("#3a2a20"), GO = p("#e0b040"), RE = p("#c94a4a");
      disc(v, p, "#ffd23d");
      for (const s of [-1, 1]) v.box(s * 3 - 1.5, 1, -1.5, s * 3 + 1.5, 5, 2.5, (x, y) => (y < 3 ? BO : COD));
      v.ell(0, 11, 0, 6.6, 6.2, 5, (x, y, z) => ((x === 3 || x === 4) && y > 8 && y < 12 && z > 3 ? PA : y === 8 ? BO : CO));
      v.set(-3, 13, 5, GO); v.set(-2, 13, 5, RE); v.set(-3, 12, 5, RE); v.set(-2, 12, 5, GO);                          // medals
      v.ell(0, 21, 0.5, 4.8, 4.8, 4.4, SK);
      v.ell(0, 17.5, 3, 4.4, 3.6, 2.6, (x, y) => (y < 17 ? BED : BE));                                                // the beard
      v.box(-3, 20, 4, 3, 20, 4, BE);
      v.set(1.8, 22, 4.6, p("#2a1a14")); v.box(-3, 22, 4, -1, 23, 5, p("#1a1414")); v.path([[-4.5, 23.5, 0], [-2, 23, 4.8], [2.5, 24, 4.5], [4.5, 24, 0]], 0.4, 0.4, p("#1a1414"));   // the eyepatch
      v.fill((x, y, z) => { const d = Math.hypot(x, z - 0.3); return d <= 5.4 && y >= 24 && y <= 28 - d * 0.35 ? (y === 24 ? HED : h3(x, y, z) < 0.12 ? HED : HE) : null; }, -6, 6, 24, 29, -6, 6);
      v.box(-1, 25, 5, 1, 26, 5, p("#ffe066", 2)); v.box(-1.5, 24, 5, 1.5, 24, 5, HED);
      v.box(-4.5, 7, -10, 4.5, 16, -5, (x, y, z) => (y === 11 ? BO : (x + y) % 7 === 0 ? COD : p("#7a6a4a")));
      v.cyl(0, 17.5, -7.5, 2.2, 0, p("#a8423a"), "x"); v.box(-5, 16, -9, 5, 19, -6, null);
      v.fill((x, y, z) => (Math.hypot(y - 18, z + 7.5) <= 2.2 && Math.abs(x) <= 5 ? (Math.abs(x) === 3 ? BO : p("#a8423a")) : null), -5, 5, 16, 20, -10, -5);
      return { top: 29, headY: 21, front: 6, back: -10 };
    },
    arm(v, p) { limb(v, p("#6a5a44"), 10, 2.2, p("#e0b896")); },
    tool(v, p) {
      shaft(v, p("#6a4a2e"), [0, -11, 1], [0, -13, 13], 0.8);
      v.path([[0, -19, 11], [0, -15, 14], [0, -13, 15], [0, -11, 14], [0, -8, 10]], 0.9, 0.5, p("#8a8f99"));
    },
  },
  gilded: {
    name: "Gilded", hover: 0.95,
    body(v, p) {
      const GO = p("#d9b84a", 0, 0.04), GOH = p("#f4da7c", 0, 0.03), GOD = p("#a8862e"), JN = p("#3a2a14"), CA = p("#6a2a8a"), CAD = p("#4a1a68"), RU = p("#ff2e5e", 1.8), GEM = p("#5dc8ff", 1.6);
      disc(v, p, "#fff2a8");
      for (const s of [-1, 1]) { v.box(s * 3 - 1.5, 1, -1.5, s * 3 + 1.5, 3, 2.5, GOD); v.box(s * 3 - 1, 4, -1, s * 3 + 1, 6, 1, JN); }
      v.ell(0, 11.5, 0, 6.2, 5.6, 4.6, (x, y, z) => (y === 9 || y === 13 ? GOD : z > 3 && Math.abs(x) < 2 ? GOH : GO));
      v.ell(0, 11.5, 4.6, 1.6, 1.6, 0.8, RU);
      v.box(-1, 17, -1, 1, 17, 1, JN);
      v.ell(0, 21.5, 0.3, 4.6, 4.8, 4.4, GO);
      v.box(-3, 22, 4, 3, 22, 4, p("#1a1008")); v.set(-2, 22, 4.6, p("#ffffff", 2.2)); v.set(2, 22, 4.6, p("#ffffff", 2.2));
      v.fill((x, y, z) => { const d = Math.hypot(x, z); return d <= 4.8 && d >= 3.6 && (y === 26 || (y <= 29 && Math.round(Math.atan2(z, x) / (TAU / 8)) % 2 === 0)) ? GOH : null; }, -5, 5, 26, 29, -5, 5);
      v.set(0, 27, 4.4, GEM); v.set(-3.6, 27, 2, RU); v.set(3.6, 27, 2, RU);
      v.fill((x, y, z) => (Math.abs(x) <= 5 - (16 - y) * 0.15 && y >= 3 && y <= 16 && z <= -4 && z >= -5 - (16 - y) * 0.15 ? (y === 16 ? GO : (x + 40) % 4 === 0 ? CAD : CA) : null), -7, 7, 3, 16, -8, -4);
      return { top: 29, headY: 21.5, front: 5, back: -7 };
    },
    arm(v, p) { limb(v, p("#d9b84a"), 10, 2, p("#f4da7c")); v.fill((x, y) => (y === -5 ? p("#a8862e") : null), -3, 3, -5, -5, -3, 3); },
    tool(v, p) {
      shaft(v, p("#a8862e"), [0, -11, 1], [0, -13, 13], 0.8);
      v.box(-2.5, -16.5, 12.5, 2.5, -12, 16.5, (x, y, z) => (Math.abs(x) <= 1 && z === 16.5 ? p("#ff2e5e", 1.8) : y === -12 ? p("#f4da7c") : p("#d9b84a")));
    },
  },
  champion: {
    name: "Champion", hover: 0.95,
    body(v, p) {
      const AR = p("#a3262a"), ARH = p("#c84040"), ARD = p("#6e1a1e"), GO = p("#d9b84a"), GOH = p("#f4da7c"), BA = p("#c8262a"), BAD = p("#8a1a1e"), PL = p("#ff4a4a"), LA = p("#6aa04a");
      disc(v, p, "#ffd23d");
      for (const s of [-1, 1]) v.box(s * 3 - 1.5, 1, -1.5, s * 3 + 1.5, 6, 2.5, (x, y) => (y === 1 ? GO : AR));
      v.ell(0, 11.5, 0, 6.4, 5.8, 4.8, (x, y, z) => (y === 8 ? GO : z > 3.5 && Math.abs(x) < 1 ? GOH : y > 13 ? ARH : AR));
      for (const s of [-1, 1]) { v.ell(s * 6, 15.5, 0, 3, 2, 3, AR); v.fill((x, y) => (y === 16 ? GO : null), s * 6 - 3, s * 6 + 3, 16, 16, -3, 3); }
      v.ell(0, 21.5, 0.3, 4.8, 5, 4.6, (x, y, z) => (y === 21.5 ? GO : ARH));
      v.box(-3, 22, 4, 3, 22, 5, p("#1a0a0a")); v.box(0, 19, 4, 0, 22, 5, p("#1a0a0a")); v.set(-2, 22, 5, p("#ffe066", 2)); v.set(2, 22, 5, p("#ffe066", 2));
      v.fill((x, y, z) => { const d = Math.hypot(x, z); return y === 26 && d >= 4 && d <= 5 ? (h3(x, y, z) < 0.5 ? LA : p("#8acf5a")) : null; }, -6, 6, 26, 26, -6, 6);   // the laurel
      v.path([[0, 26, -1], [0, 29, -2], [0, 31, -4], [0, 30, -7]], 1.4, 0.7, PL);
      v.fill((x, y, z) => (Math.abs(x) <= 5.5 - (16 - y) * 0.05 && y >= 0 && y <= 16 && Math.abs(z + 5.5 + (16 - y) * 0.12) < 0.8 ? (Math.abs(x) <= 2 && Math.abs(y - 9) <= 2 && Math.abs(x) + Math.abs(y - 9) <= 2.5 ? GOH : y === 0 || y === 16 ? GO : (y & 3) === 0 ? BAD : BA) : null), -6, 6, 0, 16, -9, -4);   // banner cape with a star
      return { top: 31, headY: 21.5, front: 5, back: -8 };
    },
    arm(v, p) { limb(v, p("#a3262a"), 10, 2.1, p("#d9b84a")); },
    tool(v, p) {
      shaft(v, p("#d9b84a"), [0, -11, 1], [0, -13, 13], 0.9);
      v.ell(0, -14, 15.5, 3, 3, 2.6, (x, y, z) => (h3(x, y, z) < 0.3 ? p("#f4da7c") : p("#d9b84a")));
      v.set(0, -14, 18.5, p("#ffe066", 2.2)); v.set(0, -11, 15.5, p("#ffe066", 2)); v.set(0, -17, 15.5, p("#ffe066", 2));
    },
  },
};

// ---------------------------------------------------------------------------
// OUTFITS (from how a look was earned). body(v, p, A) / arm(v, p, right) / paint(v, p) / wings / tool
// ---------------------------------------------------------------------------
const OUTFITS = {
  seal: {
    body(v, p, A) {
      const OB = p("#1a1418"), OBH = p("#3a2a40"), PK = p("#ff2e7e", 2), PKL = p("#ff9acb", 2.2);
      v.fill((x, y, z) => { const d = Math.hypot(x, z); return y === A.top + 1 && d <= 4.2 && d >= 3 ? OB : y > A.top + 1 && y <= A.top + 4 && d <= 4.2 && d >= 3 && Math.round(Math.atan2(z, x) / (TAU / 6)) % 2 === 0 ? (y === A.top + 4 ? OBH : OB) : null; }, -5, 5, A.top + 1, A.top + 4, -5, 5);
      v.set(0, A.top + 2, 4, PK); v.set(0, A.top + 3, 4, PKL);
      for (const s of [-1, 1]) v.path([[s * 3.5, A.top + 1, -1], [s * 6, A.top + 3, -2], [s * 6.5, A.top + 6, -2]], 1, 0.5, OB);
    },
    paint(v, p) {   // glowing seal cracks running over the body
      const PK = p("#ff2e7e", 1.8);
      v.paint((x, y, z, c) => (Math.abs(vnoise(x * 0.13 + 3, y * 0.11, z * 0.13) - 0.5) < 0.016 && !v.pals[c].e && isSurface(v, x, y, z) ? PK : 0));
    },
    arm(v, p) {   // broken shackles with dangling chain
      const IR = p("#4a4458"), IRH = p("#7a7490");
      v.fill((x, y, z) => { const d = Math.hypot(x, z - 0.5); return d <= 3 && d >= 1.8 && y >= -9 && y <= -7 ? (y === -8 ? IRH : IR) : null; }, -4, 4, -9, -7, -3, 4);
      for (let i = 0; i < 3; i++) v.fill((x, y, z) => { const d = Math.hypot(y + 11 + i * 2.4, z + 2.5); return Math.abs(x) <= 0.5 + (i & 1) && Math.abs(d - 1) < 0.7 ? IRH : null; }, -2, 2, -15 - i * 2.4, -8 - i * 2.4, -5, 0);
    },
    wings: (side) => (v, p) => {   // floating seal shards
      const S = [p("#ff2e7e", 1.7), p("#ff6ab0", 1.9), p("#2a1430")];
      for (let i = 0; i < 4; i++) { const x = side * (4 + i * 3.2), y = 3 + i * 1.8 - (i > 2 ? 3 : 0), L = 4 - i * 0.6; v.fill((xx, yy, zz) => (Math.abs(xx - x) + Math.abs(zz) * 1.5 <= L * (1 - Math.abs(yy - y) / (L * 1.6)) ? (Math.abs(yy - y) < 1 ? S[1] : i === 3 ? S[2] : S[0]) : null), x - 4, x + 4, y - 7, y + 7, -3, 3); }
    },
  },
  burrow: {   // Ratcatcher
    body(v, p, A) {
      const HA = p("#4a3626"), HAD = p("#2e2018"), BAND = p("#a3262a"), RA = p("#7a6a5a"), RAD = p("#5a4a3e"), PI = p("#e8909a"), LA = p("#ffd27a", 1.9), IR = p("#3a3436");
      const y0 = A.top - 2;
      v.fill((x, y, z) => { const d = Math.hypot(x, z - 0.3); if (y === y0) return d <= 8 ? (d > 7.2 ? HAD : HA) : null; return d <= 4.4 - (y - y0 - 1) * 0.15 ? (y === y0 + 1 ? BAND : HA) : null; }, -9, 9, y0, y0 + 5, -9, 9);
      // the rat on the left shoulder
      v.ell(-6.5, 18.5, -0.5, 2, 1.6, 2.6, RA); v.ell(-6.5, 19, 2.5, 1.3, 1.2, 1.4, RA); v.set(-6.5, 18.8, 4, PI);
      for (const s of [-1, 1]) v.set(-6.5 + s * 1.1, 20.4, 2.2, PI);
      v.set(-7.3, 19.4, 3.4, p("#ff4d4d", 2)); v.set(-5.7, 19.4, 3.4, p("#ff4d4d", 2));
      v.path([[-6.5, 18, -3], [-8, 16, -5], [-9, 13, -4]], 0.5, 0.4, PI);
      // the lantern on the belt
      v.box(4.5, 6, 3.5, 6.5, 9, 5.5, (x, y, z) => (y === 6 || y === 9 ? IR : (x === 5.5 || z === 4.5) && y > 6 && y < 9 ? LA : IR));
      v.set(5.5, 10, 4.5, IR);
    },
  },
  mire: {   // Skywarden
    body(v, p, A) {
      const BR = p("#a8763a"), LE = p("#7ae0ff", 1.7), SC = p("#e8f4ff"), SC2 = p("#b8d4ec");
      v.fill((x, y, z) => (Math.abs(y - (A.headY + 0.5)) <= 0.6 && z > 0 && Math.hypot(x, z) >= 4.3 && Math.hypot(x, z) <= 5.6 ? BR : null), -6, 6, A.headY - 1, A.headY + 2, 0, 7);
      for (const s of [-1, 1]) { v.ell(s * 2, A.headY + 0.5, A.front - 0.2, 1.7, 1.6, 0.9, BR); v.set(s * 2, A.headY + 0.5, A.front + 0.6, LE); v.set(s * 2 + (s > 0 ? -0.6 : 0.6), A.headY + 1, A.front + 0.6, p("#e6faff", 2)); }
      v.fill((x, y, z) => { const d = Math.hypot(x, z); return d <= 6.2 && d >= 4.4 && y >= 16 && y <= 17 ? SC : null; }, -7, 7, 16, 17, -7, 7);
      v.path([[2, 16.5, -4.5], [4, 14, -9], [3, 10, -12], [5, 7, -14]], 1.2, 0.6, (x, y) => ((y | 0) % 3 === 0 ? SC2 : SC));
    },
    wings: (side) => featherWing(side, ["#ffffff", "#e0ecf8", "#b8d4ec", "#9fe0ff"]),
  },
  foundry: {   // Tinker
    body(v, p, A) {
      const BR = p("#b08a3a"), BRH = p("#e0c070"), BRD = p("#6a5020"), LE = p("#7fe8ff", 1.6), LA = p("#ffe066", 2.1), GU = p("#3a3436");
      v.fill((x, y, z) => { const d = Math.hypot(x, z - 0.3); return d <= 5.6 && y >= A.top - 4 && y <= A.top + 1 - d * 0.3 ? (y === A.top - 4 ? BRD : h3(x, y, z) < 0.1 ? BRH : BR) : null; }, -6, 6, A.top - 4, A.top + 2, -6, 6);
      for (const s of [-1, 1]) { v.ell(s * 2.2, A.top - 1, 4.6, 1.6, 1.5, 0.9, BRD); v.set(s * 2.2, A.top - 1, 5.4, LE); }
      v.box(-1, A.top + 1, 1, 1, A.top + 2, 3, GU); v.set(0, A.top + 1.5, 4, LA);
      // the gear pack
      const gear = (cx, cy, r, n) => v.fill((x, y, z) => { const d = Math.hypot(x - cx, y - cy), a = Math.atan2(y - cy, x - cx), tooth = ((a / TAU) * n % 1 + 1) % 1 < 0.5; return d <= r + (tooth ? 1 : 0) && d >= 1 && z >= A.back - 2 && z <= A.back - 1 ? (d < r - 1.2 ? BRD : BR) : null; }, cx - r - 2, cx + r + 2, cy - r - 2, cy + r + 2, A.back - 2, A.back - 1);
      gear(-2, 13, 3.4, 10); gear(3, 9, 2.4, 8); gear(2.5, 16, 1.8, 6);
      v.path([[4, 8, A.back], [5, 6, -3], [4, 6, 3]], 0.6, 0.6, BRD);
    },
    tool(v, p) {
      shaft(v, p("#b08a3a"), [0, -11, 1], [0, -13, 13], 1);
      v.fill((x, y, z) => { const d = Math.hypot(y + 13.5, z - 15.5); return Math.abs(x) <= 1 && d <= 3.2 && !(z > 15.5 && Math.abs(y + 13.5) < 1.2) ? (d > 2.4 ? p("#e0c070") : p("#b08a3a")) : null; }, -1, 1, -17, -10, 12, 19);
    },
  },
  eclipse: {
    body(v, p, A) {
      v.fill((x, y, z) => { const d = Math.hypot(x, y - A.headY - 1); return z === A.back - 1 && d <= 7.2 ? (d < 5.6 ? p("#07050c", 0, 0.02) : d < 6.3 ? p("#ecd1ff", 1.6) : p("#c77dff", 1.3)) : null; }, -8, 8, A.headY - 7, A.headY + 9, A.back - 1, A.back - 1);
    },
    paint(v, p) {   // the dark half and the pale half
      const D = [p("#140f20"), p("#2a2236"), p("#463a5e")], L = [p("#c8b890"), p("#e8dcb4"), p("#fff8e6")];
      v.paint((x, y, z, c) => { const pl = v.pals[c]; if (pl.e) return 0; const l = lum(pl.c), k = l < 0.12 ? 0 : l < 0.4 ? 1 : 2; return x < 0 ? D[k] : L[k]; });
    },
    armPaint: (right) => (v, p) => { const D = [p("#140f20"), p("#2a2236"), p("#463a5e")], L = [p("#c8b890"), p("#e8dcb4"), p("#fff8e6")]; v.paint((x, y, z, c) => { const pl = v.pals[c]; if (pl.e) return 0; const l = lum(pl.c), k = l < 0.12 ? 0 : l < 0.4 ? 1 : 2; return right ? L[k] : D[k]; }); },
  },
};
function isSurface(v, x, y, z) { return !v.get(x + 1, y, z) || !v.get(x - 1, y, z) || !v.get(x, y + 1, z) || !v.get(x, y - 1, z) || !v.get(x, y, z + 1) || !v.get(x, y, z - 1); }

// ---------------------------------------------------------------------------
// which creature and outfit a skin id means
// ---------------------------------------------------------------------------
const LEGACY = { skin_ratcatcher: "ch_burrow_fire", skin_skywarden: "ch_mire_fire", skin_tinker: "ch_foundry_fire", skin_eclipse: "ch_eclipse_fire" };
function resolve(id) {
  id = LEGACY[id] || id;
  if (CREATURES[id]) return { creature: id, outfit: null };
  if (id === "skin_veteran") return { creature: "veteran", outfit: null };
  if (id === "skin_gilded") return { creature: "gilded", outfit: null };
  if (id === "skin_champion") return { creature: "champion", outfit: "champWings" };
  let m = /^seal_(\w+)$/.exec(id); if (m && CREATURES[m[1]]) return { creature: m[1], outfit: "seal" };
  m = /^ch_(\w+?)_(\w+)$/.exec(id); if (m && OUTFITS[m[1]] && CREATURES[m[2]]) return { creature: m[2], outfit: m[1] };
  return { creature: "fire", outfit: null };
}
const CHAMP_WINGS = (side) => featherWing(side, ["#f4da7c", "#d9b84a", "#b8962e", "#ffe066"]);
// a filled wing panel: a rising leading edge, rows of feathers, scalloped tips that glow a little
function featherWing(side, cols) {
  return (v, p) => {
    const F = [p(cols[0], 0, 0.03), p(cols[1]), p(cols[2]), p(cols[3], 1.3)];
    v.fill((x, y, z) => {
      const ax = x * side; if (ax < 1 || ax > 15) return null;
      const top = 2 + ax * 0.55 - Math.max(0, ax - 11) * 0.9, len = 3 + ax * 0.45, bot = top - len - ((ax % 3) < 1.5 ? 1.2 : 0);
      if (y > top || y < bot || z < -1 - (ax > 8 ? 1 : 0) || z > 0) return null;
      const d = top - y;
      return d < 1 ? F[2] : y < bot + 1.2 ? F[3] : Math.floor(d / 2.2) & 1 ? F[1] : F[0];
    }, -16, 16, -10, 14, -3, 0);
  };
}

const cache = new Map();
export function voxelBuilderModel(id) {
  if (cache.has(id)) return cache.get(id);
  const { creature, outfit } = resolve(id);
  const CR = CREATURES[creature], OF = outfit && OUTFITS[outfit];
  const parts = {}, pivots = {}, anim = { armL: "swingB", armR: "hammer" };
  let A = null;
  parts.body = (P) => {
    const v = new Vox(U, -16, 16, -4, 44, -16, 16), p = pp(v);
    A = CR.body(v, p);
    if (OF && OF.body) OF.body(v, p, A);
    if (OF && OF.paint) OF.paint(v, p);
    v.emit(P, 0, 0, 0, 4);
  };
  for (const side of [-1, 1]) {
    const name = side < 0 ? "armL" : "armR", right = side > 0;
    parts[name] = (P) => {
      const v = new Vox(U, -6, 6, -22, 3, -6, 22), p = pp(v);
      CR.arm(v, p, right);
      if (right) (OF && OF.tool ? OF.tool : CR.tool)(v, p);
      if (OF && OF.arm) OF.arm(v, p, right);
      if (OF && OF.armPaint) OF.armPaint(right)(v, p);
      if (OF && OF.paint && outfit === "seal") OF.paint(v, p);
      v.emit(P, 0, 0, 0, 4);
    };
    pivots[name] = [side * AX * U, SH * U, 0];
  }
  const wingFn = outfit === "champWings" ? CHAMP_WINGS : OF && OF.wings;
  if (wingFn) {
    for (const side of [-1, 1]) {
      const name = side < 0 ? "wingL" : "wingR";
      parts[name] = (P) => { const v = new Vox(U, -22, 22, -10, 16, -8, 4), p = pp(v); wingFn(side)(v, p); v.emit(P, 0, 0, 0, 4); };
      pivots[name] = [side * 2 * U, 15 * U, -6 * U];
      anim[name] = side < 0 ? "buzzL" : "buzzR";
    }
  }
  const M = { height: 0.92, size: 0.6, hover: CR.hover, parts, pivots, anim, name: CR.name };
  cache.set(id, M);
  return M;
}
export const BUILDER_CREATURE_NAMES = Object.fromEntries(Object.entries(CREATURES).map(([k, c]) => [k, c.name]));
