/* Skyhold TD — render/propmodels.js
   Voxel sculpts for the field obstacles (two per element, Circle's obstacle families) and the props
   scattered over each island's land (three or four per element). Each sculpt is built once per
   (kind, variant) into a template and then stamped into the island's prop/glow batches with the
   batch's current transform, so a field full of rocks costs one build per variant, not per rock.
   Same voxel kit and palettes as the towers (render/towermodels.js). */
import * as THREE from "three";
import { Vox, vnoise } from "./voxkit.js";
import { Part, rng, TAU } from "./kit.js";
import {
  firePal, icePal, naturePal, stormPal, lightPal, darkPal, mechPal, abPal, crystal, iceTones, leafTones, darkTones,
  column, mortar, h3, bipyr, stormCrystalPal, stormTones, rotY, hazard,
} from "./towermodels.js";

const U = 0.08;
const VARIANTS = 3;
const cache = new Map();
// build (once) and return a template: { lit: {pos,nor,col,idx}, glow: {...} }
function template(key, variant, sculpt) {
  const k = key + "|" + variant + "|" + RES;
  let t = cache.get(k);
  if (!t) {
    const P = new Part(1);
    sculpt(P, variant, rng(1000 + variant * 77 + key.length * 13));
    t = { lit: P.lit, glow: P.glow };
    cache.set(k, t);
  }
  return t;
}
// copy a template into a batch, through the batch's current transform
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
// place a sculpt at (x, y, z) with a quarter-turn yaw; variant and yaw come from the island's rng
function place(b, g, x, y, z, r, key, sculpt, s = 1) {
  const variant = Math.floor(r() * VARIANTS), yaw = Math.floor(r() * 4) * (Math.PI / 2);
  const t = template(key, variant, sculpt);
  b.push(x, y, z, yaw, 0, 0, s); g.push(x, y, z, yaw, 0, 0, s);
  stampInto(b, t.lit); stampInto(g, t.glow);
  b.pop(); g.pop();
}
// a Vox whose voxel (0,0,0) sits on the ground at the origin
const vox = (x0, x1, y0, y1, z0, z1) => new Vox(U, x0, x1, y0, y1, z0, z1);
// RES: how much coarser than the towers a prop is meshed (set per placement kind)
let RES = 1;
const out = (P, v) => { const w = v.resample(RES); w.emit(P, 0, w.u / 2, 0, 4); };
// a noisy rock lump
const lump = (v, cx, cy, cz, rx, ry, rz, p, seed = 0, rough = 0.45) => v.fill((x, y, z) => {
  const e = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2 + (vnoise(x * 0.35 + seed, y * 0.35, z * 0.35) - 0.5) * rough * 2;
  return e <= 1 && y >= 0 ? (typeof p === "function" ? p(x, y, z) : p) : null;
}, cx - rx - 2, cx + rx + 2, Math.max(0, cy - ry - 2), cy + ry + 2, cz - rz - 2, cz + rz + 2);

// ---------------------------------------------------------------------------
// sculpts (P, variant, r). Footprint of an obstacle: about ±6 voxels (one tile).
// ---------------------------------------------------------------------------
const S = {
  // ----- fire
  lavaRock(P, k, r) {
    const v = vox(-8, 8, 0, 14, -8, 8), C = firePal(v), sd = k * 5.3;
    lump(v, 0, 3, 0, 6.2, 5 + k, 5.6, (x, y, z) => { const n = vnoise(x * 0.3 + sd, y * 0.3, z * 0.3); return Math.abs(n - 0.5) < 0.045 ? (y > 5 ? C.LAVA2 : C.LAVA) : y > 6 && n > 0.6 ? C.ASH : n > 0.55 ? C.BAS2 : C.BAS; }, sd);
    lump(v, 2, 7 + k, -1, 3.2, 2.6, 3, (x, y, z) => (vnoise(x * 0.4, y * 0.4 + sd, z * 0.4) > 0.6 ? C.ASH2 : C.BAS2), sd + 3);
    for (let i = 0; i < 3; i++) v.set(Math.round((r() - 0.5) * 8), 0, Math.round((r() - 0.5) * 8), C.EMB);
    out(P, v);
  },
  obsidianPillar(P, k, r) {
    const v = vox(-7, 7, 0, 34, -7, 7), C = firePal(v), GL = v.pal("#141018", 0, 0.05), GLH = v.pal("#2e2440", 0, 0.05), GLV = v.pal("#4a3a66", 0, 0.04);
    v.fill((x, y, z) => { const d = Math.max(Math.abs(x), Math.abs(z)); return d <= 6 ? (y === 1 && d >= 5 ? C.LAVA : d === 6 ? C.BAS2 : C.BAS) : null; }, -6, 6, 0, 1, -6, 6);
    const H = 24 + k * 3;
    v.fill((x, y, z) => {
      const t = (y - 2) / H, rr = 3.6 * (1 - t * 0.45) - (t > 0.82 ? (t - 0.82) * 14 : 0), [xr, zr] = rotY(x, z, 0.35 + t * 0.4);
      if (rr <= 0.3 || Math.abs(xr) + Math.abs(zr) * 0.6 > rr * 1.25 || Math.abs(zr) > rr) return null;
      return Math.abs(xr) < 0.6 ? GLV : xr > 0 ? GLH : GL;
    }, -6, 6, 2, H + 2, -6, 6);
    v.box(-1, 2, -1, 1, 3, 1, C.LAVA2);
    out(P, v);
  },
  basaltSpire(P, k, r) { S.obsidianPillar(P, k, r); },
  brazier(P, k, r) {
    const v = vox(-8, 8, 0, 26, -8, 8), C = firePal(v);
    v.box(-6, 0, -6, 6, 2, 6, (x, y, z) => (Math.max(Math.abs(x), Math.abs(z)) === 6 ? (mortar(Math.abs(x) === 6 ? z : x, y, 2, 4) ? C.MOR : C.BAS2) : C.BAS));
    v.cyl(0, 3, 0, 2.5, 8, (x, y) => (y === 8 ? C.BRH : C.ST));
    v.fill((x, y, z) => { const d = Math.hypot(x, z), r0 = 3 + (y - 9) * 1.2; return d <= r0 && (d > r0 - 1.3 || y === 9) ? (y === 12 ? C.BRH : C.BR) : null; }, -8, 8, 9, 12, -8, 8);
    v.cyl(0, 11, 0, 5, 11, (x, y, z) => (h3(x, y, z) < 0.5 ? C.HOT : C.EMB));
    for (let i = 0; i < 8; i++) { const a = r() * TAU, d = r() * 3; v.box(Math.cos(a) * d, 12, Math.sin(a) * d, Math.cos(a) * d, 12 + Math.round(r() * (5 + k * 2)), Math.sin(a) * d, i % 2 ? C.EMB2 : C.LAVA2); }
    v.set(0, 18 + k, 0, C.HOT);
    out(P, v);
  },
  lavaPool(P, k, r) {
    const v = vox(-9, 9, 0, 3, -8, 8), C = firePal(v);
    v.fill((x, y, z) => { const e = (x / 8.5) ** 2 + (z / 7) ** 2 + (vnoise(x * 0.3 + k, 1, z * 0.3) - 0.5) * 0.5; if (e > 1) return null; if (e > 0.7) return y <= 1 ? (y === 1 ? C.BAS2 : C.BAS) : null; return y === 0 ? (vnoise(x * 0.4, 3, z * 0.4) > 0.62 ? C.CRUST : h3(x, y, z) < 0.3 ? C.LAVA2 : C.LAVA) : null; });
    out(P, v);
  },
  // ----- ice
  iceShard(P, k, r) {
    const v = vox(-8, 8, 0, 30, -8, 8), C = icePal(v);
    v.fill((x, y, z) => { const e = (x / 6) ** 2 + (z / 6) ** 2 + (vnoise(x * 0.4 + k, 0, z * 0.4) - 0.5) * 0.6; return e <= 1 ? (y === 1 ? C.SNOW : C.GR2) : null; }, -7, 7, 0, 1, -7, 7);
    crystal(v, 0, 2, 0, 3.2, 20 + k * 3, iceTones(C), { lean: [0.04, 0.02], vein: true });
    crystal(v, 3.5, 2, 1.5, 1.6, 11 + k, iceTones(C), { lean: [0.22, 0.08] });
    crystal(v, -3.5, 2, -1, 1.5, 9 + k, iceTones(C), { lean: [-0.25, -0.05] });
    out(P, v);
  },
  frozenBoulder(P, k, r) {
    const v = vox(-8, 8, 0, 16, -8, 8), C = icePal(v);
    lump(v, 0, 4, 0, 6.2, 5.5 + k * 0.5, 5.8, (x, y, z) => { const n = vnoise(x * 0.35 + k, y * 0.35, z * 0.35); return y > 6.5 + n * 2 ? (n > 0.55 ? C.SNOW2 : C.SNOW) : y > 5 + n * 2 ? C.ICE2 : n > 0.55 ? C.GR2 : C.GR; }, k * 4);
    for (let i = 0; i < 5; i++) { const a = r() * TAU, x = Math.cos(a) * 5.6, z = Math.sin(a) * 5.4, y = 4 + Math.round(r() * 2); v.box(x, y - 2, z, x, y, z, C.ICE1); }
    v.set(Math.round(r() * 4 - 2), 11, Math.round(r() * 4 - 2), C.CY);
    out(P, v);
  },
  snowPine(P, k, r) {
    const v = vox(-11, 11, 0, 44, -11, 11), C = icePal(v), BARK = v.pal("#5a4a3a", 0, 0.08), PINE = v.pal("#3e6a62", 0, 0.08), PINE2 = v.pal("#4e7e74", 0, 0.08);
    const H = 34 + k * 4;
    v.cyl(0, 0, 0, 1.4, 8, BARK);
    for (let y = 6; y <= H; y++) {
      const t = (y - 6) / (H - 6), tier = (y - 6) % 7, rr = (1 - t) * 9.5 * (0.6 + 0.4 * (1 - tier / 7)) + 0.5;
      v.fill((x, yy, z) => { const d = Math.hypot(x, z) + (vnoise(x * 0.5, y * 0.4, z * 0.5) - 0.5) * 1.6; if (d > rr) return null; return tier <= 1 && d > rr - 2.2 ? C.SNOW : tier === 2 && d > rr - 1 ? C.SNOW2 : h3(x, y, z) < 0.35 ? PINE2 : PINE; }, -11, 11, y, y, -11, 11);
    }
    v.box(0, H + 1, 0, 0, H + 2, 0, C.SNOW);
    out(P, v);
  },
  snowDrift(P, k, r) {
    const v = vox(-11, 11, 0, 6, -8, 8), C = icePal(v);
    lump(v, 0, 0, 0, 10, 4 + k, 7, (x, y, z) => (y > 2 ? C.SNOW : vnoise(x * 0.4, y, z * 0.4) > 0.6 ? C.ICE1 : C.SNOW2), k * 7, 0.3);
    out(P, v);
  },
  // ----- nature
  sapling(P, k, r) {
    const v = vox(-9, 9, 0, 34, -9, 9), C = naturePal(v);
    lump(v, 0, 1, 0, 6.5, 2.6, 6, (x, y) => (y >= 2 ? C.MOSS : C.ST), k, 0.35);
    v.path([[0, 2, 0], [0.8, 10, 0.3], [-0.4, 18, -0.2]], 1.5, 1.0, C.BARK2);
    v.path([[0.5, 12, 0], [4, 16, 1]], 0.8, 0.6, C.BARK);
    const cl = [[0, 21 + k, 0, 6.5, 4.5, 6.5], [3.5, 17, 1.5, 3.5, 3, 3.5], [-2, 25 + k, -1, 4, 3.2, 4]];
    for (const [cx, cy, cz, rx, ry, rz] of cl) v.fill((x, y, z) => {
      const e = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2 + (vnoise(x * 0.45, y * 0.45, z * 0.45) - 0.5) * 0.8;
      if (e > 1) return null;
      return y > cy + ry * 0.3 ? C.LEAF3 : y < cy - ry * 0.3 ? C.LEAFD : vnoise(x * 0.3 + 3, y * 0.3, z * 0.3) > 0.5 ? C.LEAF2 : C.LEAF;
    }, cx - rx - 1, cx + rx + 1, cy - ry - 1, cy + ry + 1, cz - rz - 1, cz + rz + 1);
    if (k === 2) { v.set(4, 20, 4, C.FLOW); v.set(-4, 23, 3, C.YEL); }
    out(P, v);
  },
  rootCluster(P, k, r) {
    const v = vox(-9, 9, 0, 10, -9, 9), C = naturePal(v);
    v.fill((x, y, z) => ((x / 6) ** 2 + (z / 6) ** 2 <= 1 && y === 0 ? (vnoise(x * 0.4, 1, z * 0.4) > 0.5 ? C.MOSS : C.MOSSD) : null), -7, 7, 0, 0, -7, 7);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + r() * 0.6, L = 5.5 + r() * 2, hgt = 3 + r() * 4;
      v.path([[Math.cos(a) * L, 0, Math.sin(a) * L], [Math.cos(a) * L * 0.5, hgt, Math.sin(a) * L * 0.5], [-Math.cos(a + 0.6) * L * 0.4, hgt * 0.7, -Math.sin(a + 0.6) * L * 0.4], [-Math.cos(a + 0.8) * L * 0.9, 0, -Math.sin(a + 0.8) * L * 0.9]], 1.3, 0.9, i % 2 ? C.BARK : C.BARK2);
    }
    v.ell(2, 4, -2, 2.4, 1.6, 2.4, C.MOSS2);
    v.box(-3, 1, 3, -3, 2, 3, C.CREAM); v.ell(-3, 3, 3, 1.4, 0.8, 1.4, C.RED);
    if (k) { v.box(4, 1, 2, 4, 1, 2, C.CREAM); v.ell(4, 2, 2, 1, 0.6, 1, C.G1); }
    out(P, v);
  },
  bigTree(P, k, r) {
    const v = vox(-14, 14, 0, 52, -14, 14), C = naturePal(v), H = 24 + k * 5;
    v.fill((x, y, z) => { const d = Math.hypot(x, z), rr = 2.4 + Math.max(0, 3 - y) * 0.8; return d <= rr ? ((Math.round(Math.atan2(z, x) * 3) + (y >> 2)) & 1 ? C.BARK : C.BARK2) : null; }, -6, 6, 0, H, -6, 6);
    for (const [bx, bz] of [[1, 0.3], [-0.6, 0.9], [-0.4, -1]]) v.path([[0, H - 6, 0], [bx * 5, H - 1, bz * 5]], 1.3, 0.8, C.BARK2);
    const cl = [[0, H + 6, 0, 11, 7, 11], [5, H + 2, 3, 6, 4.5, 6], [-5, H + 3, -3, 6, 4.5, 6], [1, H + 11, -1, 7, 4.5, 7]];
    for (const [cx, cy, cz, rx, ry, rz] of cl) v.fill((x, y, z) => {
      const e = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2 + (vnoise(x * 0.35, y * 0.35, z * 0.35) - 0.5) * 0.8;
      if (e > 1) return null;
      return y > cy + ry * 0.3 ? C.LEAF3 : y < cy - ry * 0.3 ? C.LEAFD : vnoise(x * 0.25 + 7, y * 0.25, z * 0.25) > 0.5 ? C.LEAF2 : C.LEAF;
    }, cx - rx - 1, cx + rx + 1, cy - ry - 1, cy + ry + 1, cz - rz - 1, cz + rz + 1);
    out(P, v);
  },
  flowerBush(P, k, r) {
    const v = vox(-8, 8, 0, 12, -8, 8), C = naturePal(v), FL = [C.FLOW, C.YEL, C.PINK2][k];
    lump(v, 0, 3, 0, 6.5, 5, 6.5, (x, y, z) => (y > 5 && h3(x, y, z) < 0.1 ? FL : y > 5 ? C.LEAF2 : C.LEAF), k * 3, 0.5);
    out(P, v);
  },
  toadstools(P, k, r) {
    const v = vox(-7, 7, 0, 12, -7, 7), C = naturePal(v);
    for (let i = 0; i < 2 + k; i++) { const x = Math.round((r() - 0.5) * 8), z = Math.round((r() - 0.5) * 8), hgt = 3 + Math.round(r() * 5); v.cyl(x, 0, z, 0.8, hgt, C.CREAM); v.fill((xx, y, zz) => { const d = Math.hypot(xx - x, zz - z); return d <= 3 - (y - hgt - 1) * 1.2 ? (h3(xx, y, zz) < 0.15 ? C.CREAM2 : C.RED) : null; }, x - 3, x + 3, hgt + 1, hgt + 2, z - 3, z + 3); }
    out(P, v);
  },
  // ----- storm
  chargedCrystal(P, k, r) {
    const v = vox(-8, 8, 0, 26, -8, 8), C = stormCrystalPal(v, stormPal(v));
    v.fill((x, y, z) => { const e = (x / 6.2) ** 2 + (z / 6.2) ** 2 + (vnoise(x * 0.4 + k, 0, z * 0.4) - 0.5) * 0.5; return e <= 1 ? (y === 1 ? C.SL2 : C.SL) : null; }, -7, 7, 0, 1, -7, 7);
    crystal(v, 0, 2, 0, 3.4, 16 + k * 3, stormTones(C), { vein: true });
    crystal(v, 3.5, 2, 1, 2.2, 10 + k, stormTones(C), { lean: [0.25, 0.05] });
    crystal(v, -3.5, 2, -2, 2.0, 9 + k, stormTones(C), { lean: [-0.25, -0.1] });
    out(P, v);
  },
  stormSpire(P, k, r) {
    const v = vox(-7, 7, 0, 36, -7, 7), C = stormPal(v);
    lump(v, 0, 2, 0, 5, 3, 5, (x, y, z) => (h3(x, y, z) < 0.3 ? C.SL2 : C.SL), k, 0.35);
    for (let i = 0; i < 3; i++) { const half = 3.5 - i, y0 = 4 + i * 7; v.fill((x, y, z) => { const [xr, zr] = rotY(x, z, i * 0.5); return Math.max(Math.abs(xr), Math.abs(zr)) <= half ? (y === y0 + 6 ? C.SLH : C.SL2) : null; }, -5, 5, y0, y0 + 6, -5, 5); }
    v.box(2, 4, 2, 2, 30 + k, 2, C.CU); v.set(2, 31 + k, 2, C.V3); v.box(2, 32 + k, 2, 2, 33 + k, 2, C.VW);
    for (let y = 8; y < 28; y += 4) v.set(3, y, 2, C.V1);
    out(P, v);
  },
  lightningRod(P, k, r) {
    const v = vox(-5, 5, 0, 36, -5, 5), C = stormPal(v);
    v.box(-3, 0, -3, 3, 1, 3, (x, y) => (y === 1 ? C.SLH : C.SL2));
    v.box(0, 2, 0, 0, 29 + k * 2, 0, C.STEEL);
    for (let y = 6; y < 26; y += 5) v.box(-1, y, -1, 1, y, 1, (x, yy, z) => (x || z ? C.CER : C.STEEL));
    v.set(0, 30 + k * 2, 0, C.V3); v.set(0, 31 + k * 2, 0, C.VW);
    out(P, v);
  },
  slateBoulder(P, k, r) {
    const v = vox(-8, 8, 0, 12, -8, 8), C = stormPal(v);
    lump(v, 0, 3, 0, 6.5, 4.5 + k, 5.5, (x, y, z) => ((y + Math.round(x * 0.3)) % 3 === 0 ? C.SLD : vnoise(x * 0.3, y * 0.3, z * 0.3) > 0.55 ? C.SL2 : C.SL), k * 5);
    if (k === 1) v.set(0, 9, 2, C.V1);
    out(P, v);
  },
  // ----- light
  sunPillar(P, k, r) {
    const v = vox(-7, 7, 0, 38, -7, 7), C = lightPal(v), H = 26 + k * 2;
    v.box(-5, 0, -5, 5, 2, 5, (x, y) => (y === 2 ? C.MAR2 : Math.max(Math.abs(x)) === 5 ? C.MARD : C.MAR));
    column(v, C, 0, 0, 3, H, 2.6);
    v.box(-3, H + 2, -3, 3, H + 2, 3, C.GOLD);
    v.ell(0, H + 5, 0, 2.2, 2.2, 2.2, (x, y, z) => (Math.hypot(x, y - H - 5, z) < 1.2 ? C.WG : C.SUN));
    out(P, v);
  },
  radiantCrystal(P, k, r) {
    const v = vox(-8, 8, 0, 26, -8, 8), C = lightPal(v), T = [v.pal("#ffe27a", 0, 0.03), v.pal("#f2c844", 0, 0.03), v.pal("#e0b030", 0, 0.03), v.pal("#c89620", 0, 0.04), v.pal("#fff0b0", 0, 0.03), C.SUN];
    v.fill((x, y, z) => { const e = (x / 6) ** 2 + (z / 6) ** 2; return e <= 1 ? (y === 1 ? C.MAR2 : C.MARD) : null; }, -6, 6, 0, 1, -6, 6);
    crystal(v, 0, 2, 0, 2.6, 15 + k * 3, T, { vein: true, lean: [0.06, 0] });
    crystal(v, -3.5, 2, 2, 1.6, 9 + k, T, { lean: [-0.3, 0.1] });
    crystal(v, 3, 2, -2.5, 1.3, 7, T, { lean: [0.2, -0.2] });
    out(P, v);
  },
  goldHedge(P, k, r) {
    const v = vox(-8, 8, 0, 10, -8, 8), C = lightPal(v), H1 = v.pal("#c9c06a", 0, 0.07), H2 = v.pal("#e6dc8a", 0, 0.06);
    v.box(-7, 0, -7, 7, 1, 7, (x, y) => (y === 1 ? C.GOLD : C.MAR));
    lump(v, 0, 3, 0, 6, 5, 6, (x, y, z) => (y > 6 ? H2 : H1), k * 3, 0.25);
    if (k) v.set(0, 9, 0, C.HALO);
    out(P, v);
  },
  // ----- darkness
  voidStone(P, k, r) {
    const v = vox(-8, 8, 0, 18, -8, 8), C = darkPal(v);
    lump(v, 0, 5, 0, 6, 6.5 + k, 5.5, (x, y, z) => (vnoise(x * 0.35 + k, y * 0.35, z * 0.35) > 0.6 ? C.OB3 : C.OB2), k * 6, 0.5);
    // a carved rune eye on the front
    v.fill((x, y, z) => { const e = (x / 2.6) ** 2 + ((y - 6) / 1.6) ** 2; if (e > 1 || z < 3) return null; const zz = Math.round(Math.sqrt(Math.max(0, 1 - (x / 6) ** 2 - ((y - 5) / 7) ** 2)) * 5.5); return z === zz ? (e < 0.3 ? C.VW : C.VI2) : null; }, -3, 3, 4, 8, 3, 6);
    out(P, v);
  },
  bonePile(P, k, r) {
    const v = vox(-8, 8, 0, 10, -8, 8), C = darkPal(v);
    for (let i = 0; i < 9; i++) { const a = r() * TAU, y = Math.round(r() * 3), L = 4 + r() * 3, x0 = (r() - 0.5) * 6, z0 = (r() - 0.5) * 6; v.cap([x0 - Math.cos(a) * L, y, z0 - Math.sin(a) * L], [x0 + Math.cos(a) * L, y + 1, z0 + Math.sin(a) * L], 0.7, i % 2 ? C.BONE : C.BONE2); v.set(x0 + Math.cos(a) * L, y + 1, z0 + Math.sin(a) * L, C.BONE); }
    v.ell(1, 5, 0, 2.8, 2.6, 2.8, C.BONE);
    v.box(0, 3, 2, 2, 3, 3, C.BONE2);
    for (const s of [-1, 1]) { v.set(1 + s, 5, 3, C.VOID); v.set(1 + s, 5, 2, k ? C.VI2 : C.VOID); }
    out(P, v);
  },
  obsidianSpike(P, k, r) {
    const v = vox(-7, 7, 0, 40, -7, 7), C = darkPal(v);
    crystal(v, 0, 0, 0, 3.6, 28 + k * 5, darkTones(C), { lean: [0.05 * (k - 1), 0.04], shoulder: 0.5 });
    crystal(v, 3, 0, 2, 1.8, 10 + k * 2, darkTones(C), { lean: [0.2, 0.1] });
    out(P, v);
  },
  violetCrystal(P, k, r) {
    const v = vox(-7, 7, 0, 26, -7, 7), C = darkPal(v), T = [v.pal("#b49cff", 0, 0.03), v.pal("#8b6cff", 0, 0.04), v.pal("#7458e0", 0, 0.04), v.pal("#4a3a9a", 0, 0.05), v.pal("#d0c0ff", 0, 0.03), C.VL];
    lump(v, 0, 0, 0, 5, 2, 5, C.OB2, k, 0.4);
    crystal(v, 0, 1, 0, 2.4, 15 + k * 3, T, { vein: true, lean: [0.08, 0.04] });
    crystal(v, -3, 1, 1.5, 1.4, 8, T, { lean: [-0.25, 0.1] });
    out(P, v);
  },
  deadTree(P, k, r) {
    const v = vox(-12, 12, 0, 40, -12, 12), C = darkPal(v), W = v.pal("#2a2030", 0, 0.08), W2 = v.pal("#3a2e42", 0, 0.07);
    v.path([[0, 0, 0], [0.8, 12, 0.5], [-0.6, 24, 0], [0.4, 30 + k * 2, -0.5]], 1.9, 0.8, (x, y) => (y & 2 ? W : W2));
    for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + k, y0 = 12 + i * 3.5; v.path([[0, y0, 0], [Math.cos(a) * 5, y0 + 4, Math.sin(a) * 5], [Math.cos(a + 0.4) * 9, y0 + 5 + (i & 1) * 3, Math.sin(a + 0.4) * 9]], 0.9, 0.5, W); }
    if (k === 2) v.set(5, 20, 0, C.VI2);
    out(P, v);
  },
  // ----- mech
  generator(P, k, r) {
    const v = vox(-8, 8, 0, 22, -8, 8), C = mechPal(v);
    v.box(-6, 0, -5, 6, 10, 5, (x, y, z) => { const ax = Math.abs(x), az = Math.abs(z); if (y === 10) return C.PLH; if (y === 2) return hazard(C, x, z); if (az === 5 && ax < 4 && y > 3 && y < 8) return (x & 1) ? C.GUN : C.PLD; return ax === 6 || az === 5 ? (y % 5 === 0 ? C.PLD : C.PL2) : C.PLD; });
    v.cyl(-3, 11, -1, 1.5, 16, C.GUNH); v.set(-3, 17, -1, C.AMB);
    v.ell(2.5, 14, 0, 2.6, 2.6, 2.6, (x, y, z) => (Math.hypot(x - 2.5, y - 14, z) < 1.4 ? C.CY2 : C.CY));
    for (const s of [-1, 1]) v.box(2.5 + s * 3, 11, 0, 2.5 + s * 3, 17, 0, C.CHR);
    v.box(-6, 6, 5, 6, 6, 5, k ? C.AMB : C.CY);
    v.path([[6, 4, 2], [8, 2, 4], [7, 0, 7]], 0.7, 0.7, C.BLK);
    out(P, v);
  },
  scrapPile(P, k, r) {
    const v = vox(-8, 8, 0, 14, -8, 8), C = mechPal(v), cols = [C.PL, C.PL2, C.RUST, C.PLD, C.PLH, C.GUNH];
    for (let i = 0; i < 9; i++) { const w = 2 + Math.round(r() * 4), hh = 1 + Math.round(r() * 2), d = 2 + Math.round(r() * 3), x = Math.round((r() - 0.5) * 8), z = Math.round((r() - 0.5) * 8), y = Math.round(r() * 5 * (1 - Math.hypot(x, z) / 8)); v.box(x - w / 2, y, z - d / 2, x + w / 2, y + hh, z + d / 2, cols[i % 6]); }
    v.cyl(1, 2, -2, 1.2, 6, C.GUN, "z");
    v.fill((x, y, z) => { const d = Math.hypot(x + 3, y - 5); return z === 3 && d <= 3 && (d > 1.5 || Math.round(Math.atan2(y - 5, x + 3) * 3) % 2 === 0) ? C.HAZ : null; }, -7, 1, 1, 9, 3, 3);
    if (k) v.set(2, 7, 0, C.AMB);
    out(P, v);
  },
  pipeRun(P, k, r) {
    const v = vox(-6, 6, 0, 10, -14, 14), C = mechPal(v);
    v.cyl(0, 4, -13, 3, 13, (x, y, z) => ((z + 40) % 9 === 0 ? C.RUST : y > 5 ? C.PLH : C.PL2), "z");
    for (const z of [-9, 0, 9]) v.box(-3, 0, z - 1, 3, 4, z + 1, (x, y) => (y === 4 ? C.GUNH : C.PLD));
    v.cyl(0, 4, 13, 3.6, 14, C.RUST, "z");
    out(P, v);
  },
  crate(P, k, r) {
    const v = vox(-7, 7, 0, 14, -7, 7), C = mechPal(v), WD = v.pal("#7a5a3a", 0, 0.08), WD2 = v.pal("#8a6a46", 0, 0.07);
    v.box(-6, 0, -6, 6, 12, 6, (x, y, z) => { const ax = Math.abs(x), az = Math.abs(z); if ((ax === 6 && az === 6) || y === 0 || y === 12) return C.PLD; if ((ax === 6 && Math.abs(Math.abs(z) - Math.abs(y - 6)) < 0.6) || (az === 6 && Math.abs(Math.abs(x) - Math.abs(y - 6)) < 0.6)) return WD; return (y & 1) ? WD2 : WD; });
    if (k) v.box(-4, 13, -4, 2, 15, 2, (x, y) => (y === 15 ? C.PLH : C.PL2));
    out(P, v);
  },
  lampPost(P, k, r) {
    const v = vox(-6, 6, 0, 34, -6, 6), C = mechPal(v);
    v.box(-2, 0, -2, 2, 1, 2, C.PLD); v.box(0, 2, 0, 0, 28, 0, C.GUNH);
    v.box(0, 28, 0, 4, 28, 0, C.GUNH); v.box(3, 26, -1, 5, 27, 1, C.PL2); v.box(3, 25, -1, 5, 25, 1, k === 1 ? C.AMB : C.CY);
    out(P, v);
  },
  // ----- abnormal
  riftFragment(P, k, r) {
    const v = vox(-8, 8, 0, 30, -8, 8), C = abPal(v);
    v.fill((x, y, z) => { const e = (x / 6) ** 2 + (z / 6) ** 2 + (vnoise(x * 0.4 + k, 0, z * 0.4) - 0.5) * 0.6; return e <= 1 ? (y === 1 ? (h3(x, 1, z) < 0.12 ? C.PK : C.PH) : C.P1) : null; }, -7, 7, 0, 1, -7, 7);
    const sh = [[0, 12, 0, C.PK, 3.2], [4.5, 20, 1, C.MN, 2.4], [-4, 19, -2, C.PKs, 2.2], [1, 26 + k, -1, C.VI, 1.8]];
    for (const [x, y, z, c, s] of sh) bipyr(v, [x, y, z], s, s * 2.2, [c, c, C.PH, C.P2, c, C.WG]);
    out(P, v);
  },
  glitchBlock(P, k, r) {
    const v = vox(-8, 8, 0, 22, -8, 8), C = abPal(v);
    v.box(-5, 0, -5, 5, 10, 5, (x, y, z) => { const row = h3(y, k, 3); if (row < 0.12) return row < 0.06 ? C.PK : C.MNs; return Math.max(Math.abs(x), Math.abs(z)) === 5 ? (y === 10 ? C.PX : C.P2) : C.PD; });
    v.box(-4 + k, 11, -3, 2 + k, 15, 3, (x, y) => (y === 15 ? C.PX : h3(y, 9, k) < 0.25 ? C.PKs : C.P1));
    v.box(-3, 17, -1, 0, 19, 2, C.MN);
    out(P, v);
  },
  leaningPillar(P, k, r) {
    const v = vox(-10, 10, 0, 36, -8, 8), C = abPal(v);
    v.path([[0, 0, 0], [2 + k, 14, 0], [5 + k, 28, 1]], 2.6, 2.0, (x, y, z) => (h3(y, 1, 1) < 0.15 ? C.PK : (y + 40) % 7 === 0 ? C.PX : C.P2));
    v.box(-3, 0, -3, 3, 1, 3, C.PH);
    out(P, v);
  },
  floatCube(P, k, r) {
    const v = vox(-6, 6, 0, 28, -6, 6), C = abPal(v), c = [C.PK, C.MN, C.VI][k];
    v.box(-4, 0, -4, 4, 2, 4, (x, y) => (y === 2 ? C.PX : C.P1));
    const y0 = 14 + k * 3; v.box(-2, y0, -2, 2, y0 + 4, 2, (x, y, z) => (Math.abs(x) + Math.abs(z) + Math.abs(y - y0 - 2) < 2.5 ? C.WG : c));
    out(P, v);
  },
};

// ---------------------------------------------------------------------------
// OBSTACLES (b = lit batch, g = glow batch, around x, 0, z) and island props (on the ground at x, y, z)
// ---------------------------------------------------------------------------
const OB_RES = 1.5, RIM_RES = 1.6;
const ob = (key) => (b, g, x, z, r) => { RES = OB_RES; place(b, g, x, 0, z, r, key, S[key]); };
export const VOX_OBSTACLES = {
  fire: [ob("lavaRock"), ob("obsidianPillar")],
  ice: [ob("iceShard"), ob("frozenBoulder")],
  nature: [ob("sapling"), ob("rootCluster")],
  storm: [ob("chargedCrystal"), ob("stormSpire")],
  light: [ob("sunPillar"), ob("radiantCrystal")],
  darkness: [ob("voidStone"), ob("bonePile")],
  mech: [ob("generator"), ob("scrapPile")],
  abnormal: [ob("riftFragment"), ob("glitchBlock")],
};
// island props: weighted picks; the island props are drawn a little larger than the obstacles
const rim = (list) => (b, g, x, y, z, r) => { RES = RIM_RES; let k = r(), acc = 0; for (const [w, key, s] of list) { acc += w; if (k < acc) { place(b, g, x, y, z, r, key, S[key], s || 1.4); return; } } };
export const VOX_RIM = {
  fire: rim([[0.4, "obsidianPillar", 1.6], [0.25, "brazier"], [0.2, "lavaRock"], [0.15, "lavaPool"]]),
  ice: rim([[0.4, "iceShard", 1.6], [0.3, "snowPine", 1.0], [0.3, "snowDrift"]]),
  nature: rim([[0.45, "bigTree", 1.0], [0.3, "flowerBush", 1.2], [0.25, "toadstools"]]),
  storm: rim([[0.4, "chargedCrystal", 1.6], [0.25, "lightningRod"], [0.35, "slateBoulder"]]),
  light: rim([[0.4, "sunPillar"], [0.3, "goldHedge"], [0.3, "radiantCrystal", 1.5]]),
  darkness: rim([[0.4, "obsidianSpike"], [0.3, "violetCrystal", 1.5], [0.3, "deadTree", 1.1]]),
  mech: rim([[0.3, "pipeRun"], [0.25, "crate"], [0.25, "lampPost"], [0.2, "generator"]]),
  abnormal: rim([[0.4, "floatCube"], [0.3, "leaningPillar"], [0.3, "glitchBlock"]]),
};
export const PROP_KINDS = Object.keys(S);
