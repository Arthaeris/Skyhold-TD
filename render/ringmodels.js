/* Skyhold TD — render/ringmodels.js
   Voxel sculpts for the ring's structures: the corridor portals (the sunken spawn ring and the exit
   arch), the gate islands between corridors, the central vortex (standing stones, rubble, chain links
   and the padlock) and the stepping-stone bridges. Like render/propmodels.js, each sculpt is built once
   per (kind, variant, colour) into a template and stamped into the caller's batches through their
   current transform. The swirl discs and the vortex's animation stay in render/world.js. */
import * as THREE from "three";
import { Vox, vnoise } from "./voxkit.js";
import { Part, rng, TAU } from "./kit.js";
import { WORLD } from "./theme.js";
import { crystal, h3 } from "./towermodels.js";

const cache = new Map();
function template(key, build) {
  let t = cache.get(key);
  if (!t) { const P = new Part(1); build(P); t = { lit: P.lit, glow: P.glow }; cache.set(key, t); }
  return t;
}
const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _nm = new THREE.Matrix3();
function stampInto(B, src) {
  const m = B.m; _nm.getNormalMatrix(m);
  const base = B.pos.length / 3;
  for (let i = 0; i < src.pos.length; i += 3) {
    _v.set(src.pos[i], src.pos[i + 1], src.pos[i + 2]).applyMatrix4(m); B.pos.push(_v.x, _v.y, _v.z);
    _n.set(src.nor[i], src.nor[i + 1], src.nor[i + 2]).applyMatrix3(_nm).normalize(); B.nor.push(_n.x, _n.y, _n.z);
  }
  for (let i = 0; i < src.col.length; i++) B.col.push(src.col[i]);
  for (let i = 0; i < src.idx.length; i++) B.idx.push(src.idx[i] + base);
}
// stamp template t into lit batch b (and glow batch g) at (x, y, z), yaw a, scale s
export function stamp(b, g, t, x, y, z, a = 0, s = 1, rx = 0, rz = 0) {
  b.push(x, y, z, a, rx, rz, s); stampInto(b, t.lit); b.pop();
  if (g) { g.push(x, y, z, a, rx, rz, s); stampInto(g, t.glow); g.pop(); } else if (t.glow.pos.length) { b.push(x, y, z, a, rx, rz, s); stampInto(b, t.glow); b.pop(); }
}

// the shared world stone, plus an accent colour (an element's light) as lit tones and glows
function stonePal(v, accent = "#b45cff") {
  const c = new THREE.Color(accent), hx = (k) => "#" + c.clone().multiplyScalar(k).getHexString(), wh = (k) => "#" + c.clone().lerp(new THREE.Color("#ffffff"), k).getHexString();
  return {
    S0: v.pal(WORLD.stone[0], 0, 0.07), S1: v.pal(WORLD.stone[1], 0, 0.07), S2: v.pal(WORLD.stone[2], 0, 0.07), TOP: v.pal(WORLD.stoneTop, 0, 0.05), TOP2: v.pal("#7b7596", 0, 0.05),
    MOR: v.pal("#2c2838", 0, 0.05), DEEP: v.pal("#2a2636", 0, 0.08), STEEL: v.pal("#8a96b4", 0, 0.04), STEELH: v.pal("#c2cde4", 0, 0.03), STEELD: v.pal("#5a6480", 0, 0.05),
    A1: v.pal(wh(0.35), 0, 0.03), A2: v.pal(accent, 0, 0.04), A3: v.pal(hx(0.75), 0, 0.04), A4: v.pal(hx(0.5), 0, 0.05), AR: v.pal(wh(0.55), 0, 0.03),
    G1: v.pal(accent, 1.55, 0.04), G2: v.pal(wh(0.5), 1.85, 0.03),
  };
}
const accTones = (C) => [C.A1, C.A2, C.A3, C.A4, C.AR, C.G2];
// cut-stone shading for a block face: mortar seams every few voxels
const block = (C, a, b, y, bl = 5, rh = 3) => { const row = Math.floor(y / rh); return ((y % rh) + rh) % rh === rh - 1 || ((((a + (row & 1) * 2) % bl) + bl) % bl) === 0 ? C.MOR : h3(a, y, b) < 0.25 ? C.S2 : h3(a, b, y) < 0.5 ? C.S0 : C.S1; };

// ---------------------------------------------------------------------------
// CORRIDOR PORTALS (local to the island; the swirl discs are added by world.js)
// ---------------------------------------------------------------------------
// the spawn ring: a sunken basin rimmed with carved stones and glowing runes, two low obelisks beside it
export function portalEntrance(b, g, zc, accent) {
  const t = template("ent|" + accent, (P) => {
    const U = 0.08, v = new Vox(U, -48, 48, 0, 26, -36, 36), C = stonePal(v, accent);
    v.fill((x, y, z) => {
      const d = Math.hypot(x, z) * U, a = Math.atan2(z, x), seg = Math.floor(((a / TAU) * 16 + 16.5)) % 16, edge = Math.abs(((a / TAU) * 16 + 16.5) % 1 - 0.5) > 0.44;
      if (d < 2.08 || d > 2.9) return null;
      const top = 3 + (seg % 3 === 0 ? 2 : 0);
      if (y > top) return null;
      if (edge) return y < top ? C.MOR : null;
      if (y === top) return seg % 4 === 0 && d > 2.35 && d < 2.6 ? C.G1 : C.TOP;
      return d > 2.8 ? block(C, Math.round(a * 30), seg, y, 99, 2) : C.S1;
    }, -37, 37, 0, 6, -37, 37);
    for (const sx of [-1, 1]) {
      const cx = Math.round((sx * 3.4) / U);
      v.fill((x, y, z) => { const ax = Math.abs(x - cx), az = Math.abs(z), half = y < 3 ? 6 : 5 - Math.floor((y - 3) / 6); if (ax > half || az > half) return null; return y === 17 ? C.TOP2 : ax === half || az === half ? block(C, ax === half ? z : x, sx, y) : C.S1; }, cx - 6, cx + 6, 0, 17, -6, 6);
      crystal(v, cx, 18, 0, 2.6, 8, accTones(C));
    }
    v.emit(P, 0, U / 2, 0, 4);
  });
  stamp(b, g, t, 0, 0, zc);
}

// the exit arch: a stone ring framing the swirl, a keystone, rune studs, on a stepped base between two pillars
export function portalExit(b, g, zc, accent) {
  const t = template("ext|" + accent, (P) => {
    const U = 0.08, v = new Vox(U, -52, 52, 0, 72, -14, 14), C = stonePal(v, accent);
    // stepped base
    v.fill((x, y, z) => { const ax = Math.abs(x) * U, az = Math.abs(z) * U; if (ax > 3.3 || az > 1.0) return null; return y === 2 ? (ax > 3.1 || az > 0.85 ? C.TOP2 : C.TOP) : block(C, x, z, y, 6, 3); }, -42, 42, 0, 2, -13, 13);
    // the ring: 24 dressed voussoirs around the disc
    v.fill((x, y, z) => {
      const dx = x * U, dy = y * U - 2.35, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      if (d < 2.32 || d > 3.15 || Math.abs(z) * U > 0.42 || y < 2) return null;
      const f = ((a / TAU) * 24 + 24) % 1, seg = Math.floor((a / TAU) * 24 + 24) % 24;
      if (f < 0.07) return C.MOR;
      if (seg === 6 && d > 2.45) return d > 3.0 ? C.TOP2 : C.S2;                       // the keystone (top)
      if (seg % 3 === 0 && d > 2.62 && d < 2.85 && Math.abs(z) * U > 0.36) return C.G1;  // rune studs on both faces
      return d > 3.02 ? C.TOP : seg & 1 ? C.S0 : C.S1;
    }, -42, 42, 2, 72, -6, 6);
    v.box(-3, 69, -6, 3, 70, 6, C.TOP2);                                       // keystone cap
    for (const sx of [-1, 1]) {
      const cx = Math.round((sx * 3.7) / U);
      v.fill((x, y, z) => { const ax = Math.abs(x - cx), az = Math.abs(z); if (ax > 5 || az > 5) return null; return y === 27 ? C.TOP2 : ax === 5 || az === 5 ? block(C, ax === 5 ? z : x, sx + 3, y) : C.S1; }, cx - 5, cx + 5, 0, 27, -5, 5);
      crystal(v, cx, 28, 0, 2.4, 9, accTones(C));
    }
    v.emit(P, 0, U / 2, 0, 4);
  });
  stamp(b, g, t, 0, 0, zc);
}

// ---------------------------------------------------------------------------
// GATE ISLANDS
// ---------------------------------------------------------------------------
export function gateIsland(b, g, accent, color, soil, rock, deep) {
  // the platform and arch (fine voxels)
  const top = template("gtop|" + accent + "|" + color, (P) => {
    const U = 0.1, v = new Vox(U, -46, 46, -6, 72, -46, 46), C = stonePal(v, accent), CC = stonePal(v, color);
    v.fill((x, y, z) => {
      const ex = Math.abs(x) * U, ez = Math.abs(z) * U, e = Math.max(ex, ez);
      if (e > 4.45 - (vnoise(x * 0.15, 1, z * 0.15) > 0.6 ? 0.3 : 0)) return null;
      const h = e < 2.6 ? 5 : 2;                                                      // two tiers
      if (y > h) return null;
      if (y === h) { if (e < 2.6) return (Math.floor((x + 99) / 6) + Math.floor((z + 99) / 6)) & 1 ? C.TOP : C.TOP2; return h3(x, 1, z) < 0.3 ? C.S2 : C.TOP; }
      return e > 4.3 || (e > 2.5 && e < 2.6) ? block(C, ex > ez ? z : x, 1, y, 6, 3) : C.S1;
    }, -46, 46, -6, 5, -46, 46);
    // the arch ring (standing on the back half), swirl disc sits inside it at y 3.6, z -0.8
    const R0 = 2.5, R1 = 3.35, cy = 3.6, zc = -8;
    v.fill((x, y, z) => {
      const dx = x * U, dy = y * U - cy, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      if (d < R0 || d > R1 || Math.abs(z - zc) > 4) return null;
      const f = ((a / TAU) * 22 + 22) % 1, seg = Math.floor((a / TAU) * 22 + 22) % 22;
      if (f < 0.06) return C.MOR;
      if (seg % 3 === 0 && d > R1 - 0.22 && f > 0.38 && f < 0.62) return C.G1;
      return d > R1 - 0.15 ? C.TOP : seg & 1 ? C.S0 : C.S2;
    }, -34, 34, 2, 70, zc - 4, zc + 4);
    v.box(-11, 6, zc - 7, 11, 12, zc + 7, (x, y, z) => (y === 12 ? C.TOP : block(C, x, z, y, 6, 3)));
    // corner pillars topped with the element's crystal
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const px = Math.round((sx * 3.3) / U), pz = Math.round((sz * 3.1) / U), ph = sz < 0 ? 34 : 18;
      v.fill((x, y, z) => { const ax = Math.abs(x - px), az = Math.abs(z - pz); if (ax > 4 || az > 4) return null; if (y >= ph) return ax <= 6 && az <= 6 ? C.TOP2 : null; return ax === 4 || az === 4 ? block(C, ax === 4 ? z : x, sx, y, 5, 4) : C.S1; }, px - 6, px + 6, 6, ph + 1, pz - 6, pz + 6);
      crystal(v, px, ph + 2, pz, 3, 10, accTones(CC));
    }
    v.emit(P, 0, U / 2, 0, 4);
  });
  // the underside: an inverted rock cone (coarse voxels, it's seen from afar)
  const under = template("gund|" + soil + "|" + rock + "|" + deep, (P) => {
    const U = 0.2, v = new Vox(U, -24, 24, -46, 0, -24, 24);
    const SO = v.pal(soil, 0, 0.08), RO = v.pal(rock, 0, 0.08), DE = v.pal(deep, 0, 0.08);
    v.fill((x, y, z) => {
      const depth = -y * U, rr = (4.6 - depth * 0.52) / U + (vnoise(x * 0.2, y * 0.15, z * 0.2) - 0.5) * 6;
      if (Math.hypot(x, z) > rr) return null;
      return depth < 2 ? SO : depth < 4.5 ? RO : DE;
    });
    v.emit(P, 0, -U / 2, 0, 4);
  });
  stamp(b, g, top, 0, 0, 0);
  stamp(b, null, under, 0, -0.45, 0);
}

// ---------------------------------------------------------------------------
// THE VORTEX: standing stones, sunken rubble, orbiting rubble, a chain link and the padlock
// ---------------------------------------------------------------------------
export function menhir(b, g, x, y, z, a, k, glowCol) {
  const t = template("men|" + k + "|" + glowCol, (P) => {
    const U = 0.1, v = new Vox(U, -12, 12, 0, 30, -8, 8), C = stonePal(v, glowCol), R = rng(31 + k);
    const w = 7 + (k % 3), d = 5 + (k % 2), H = 14 + (k * 5) % 13;
    v.fill((x, y, z) => {
      const t = y / H, ww = w * (1 - t * 0.25), dd = d * (1 - t * 0.2);
      if (Math.abs(x) > ww || Math.abs(z) > dd) return null;
      if (y > H - 3 && (Math.abs(x) + (y - H + 3) * 2 > ww + vnoise(x * 0.4, k, z * 0.4) * 4)) return null;   // a chipped crown
      if (Math.abs(z) > dd - 1 && Math.abs(x) < 1 && y > 4 && y < H - 4 && k % 2 === 0) return y % 3 === 0 ? C.G1 : C.MOR;   // a carved rune line
      return y >= H - 3 ? C.TOP : vnoise(x * 0.3, y * 0.3, z * 0.3 + k) > 0.6 ? C.S2 : y % 6 === 0 ? C.S1 : C.S0;
    }, -12, 12, 0, 30, -8, 8);
    if (k % 4 === 0) v.box(-1, H + 1, -1, 1, H + 2, 1, C.G1);
    v.emit(P, 0, U / 2, 0, 4);
  });
  stamp(b, g, t, x, y, z, a);
}
export function rubble(b, x, y, z, a, k, s = 1) {
  const t = template("rub|" + k, (P) => {
    const U = 0.12, v = new Vox(U, -12, 12, -12, 12, -12, 12), C = stonePal(v);
    v.fill((x, y, z) => { const e = (x / 9) ** 2 + (y / (6 + k)) ** 2 + (z / 8) ** 2 + (vnoise(x * 0.3 + k * 3, y * 0.3, z * 0.3) - 0.5) * 1.1; return e <= 1 ? (y > 3 + k ? C.TOP : vnoise(x * 0.4, y * 0.4, z * 0.4) > 0.55 ? C.S2 : C.S0) : null; });
    v.emit(P, 0, 0, 0, 4);
  });
  stamp(b, null, t, x, y, z, a, s, k * 0.7, k * 0.3);
}
// one chain link as a geometry (shared by every link mesh)
export function chainLinkGeometry() {
  const t = template("link", (P) => {
    const U = 0.05, v = new Vox(U, -21, 21, -3, 3, -11, 11), C = stonePal(v);
    v.fill((x, y, z) => {
      const L = 13, R = 7.5, px = Math.max(-L + R, Math.min(L - R, x)) , d = Math.hypot(x - px, z) - R;   // a stadium loop
      return Math.hypot(d, y) <= 2.6 ? (y > 1 ? C.STEELH : y < -1 ? C.STEELD : C.STEEL) : null;
    });
    v.emit(P, 0, 0, 0, 4);
  });
  const k = new Part(1); stampInto(k.lit, t.lit);
  return k.lit.geometry();
}
export function padlockPart(glowCol) {
  const P = new Part(4);
  const U = 0.06, v = new Vox(U, -20, 20, -20, 36, -9, 9), C = stonePal(v, glowCol), BR = v.pal("#5a6a8e", 0, 0.05), BRH = v.pal("#8a9ac0", 0, 0.04), BRD = v.pal("#3e4a68", 0, 0.05);
  // the body: a rounded block with a riveted rim and a glowing keyhole
  v.fill((x, y, z) => {
    const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
    if (ax > 18 || ay > 18 || az > 7 || ax + ay > 32) return null;
    if (az === 7 && Math.hypot(x, y - 4) < 3.2) return C.G2;
    if (az === 7 && ax < 1.5 && y < 4 && y > -7) return C.G1;
    if ((ax > 15 || ay > 15) && az === 7 && (x + y) % 6 === 0) return BRH;
    return ax > 16 || ay > 16 ? BRD : az === 7 ? BR : BRD;
  });
  // the shackle
  v.fill((x, y, z) => { const d = Math.hypot(x, y - 18); return y >= 16 && Math.abs(d - 11) < 2.6 && Math.abs(z) < 3 ? (y > 26 ? BRH : BR) : null; }, -14, 14, 16, 32, -3, 3);
  v.emit(P, 0, 0, 0, 4);
  return P;
}

// ---------------------------------------------------------------------------
// BRIDGES: stepping stones and the silver arrow
// ---------------------------------------------------------------------------
export function steppingStone(b, x, y, z, a, k) {
  const t = template("step|" + k, (P) => {
    const U = 0.1, v = new Vox(U, -10, 10, -12, 3, -8, 8), C = stonePal(v);
    v.fill((x, y, z) => {
      const e = (x / (8 + (k % 2))) ** 2 + (z / 6.5) ** 2 + (vnoise(x * 0.3 + k * 5, 0, z * 0.3) - 0.5) * 0.5;
      if (e > 1) return null;
      const bottom = -2 - Math.round((1 - e) * (6 + k * 2));                             // a little rock keel under each stone
      if (y < bottom || y > 2) return null;
      return y === 2 ? (e > 0.75 ? C.TOP : C.TOP2) : y > -1 ? C.S1 : vnoise(x * 0.4, y * 0.4, z * 0.4) > 0.55 ? C.S2 : C.DEEP;
    });
    v.emit(P, 0, 0, 0, 4);
  });
  stamp(b, null, t, x, y, z, a);
}
export function bridgeArrow(b, x, y, z, a) {
  const t = template("arrow", (P) => {
    const U = 0.07, v = new Vox(U, -14, 14, -3, 3, -16, 16), SL = v.pal("#c9d2e6", 0, 0.03), SLH = v.pal("#eef3ff", 0, 0.02), SLD = v.pal("#8e98b2", 0, 0.04);
    v.fill((x, y, z) => {
      const ax = Math.abs(x);
      const head = z > 3 && ax <= (16 - z) * 0.95;
      const shaft = ax <= 2 && z >= -15 && z <= 12;
      if (!head && !shaft) return null;
      if (Math.abs(y) > 2 - (ax > 6 ? 1 : 0)) return null;
      return y > 0 ? SLH : y < 0 ? SLD : SL;
    });
    v.emit(P, 0, 0, 0, 4);
  });
  stamp(b, null, t, x, y, z, a);
}
