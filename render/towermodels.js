/* Skyhold TD — render/towermodels.js
   Voxel sculpts for the Fire and Ice towers (and their two element plinths), built with the voxel kit
   (render/voxkit.js) at one cube size, with baked corner AO and emissive voxels for the bloom.
   They plug into render/towers.js under the same contract as the box-built heads:
     PLINTH(p, st) draws into the base Part and returns the plinth top h;
     HEAD(P, h, st) draws into {base, aim, spin, float} and returns the pivots + muzzle.
   Stages (0 = Lv 1–3 … 3 = Lv 10) add structure; towers.js also scales the head a little per stage. */
import { Vox, vnoise } from "./voxkit.js";
import { rng, TAU } from "./kit.js";

const U = 0.08;                       // one voxel, in world units (a 3×3 tower footprint ≈ 36 voxels)
const h3 = (x, y, z) => { let h = (x * 374761393 + y * 668265263 + z * 1442695041) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const vx = (x0, x1, y0, y1, z0, z1) => new Vox(U, x0, x1, y0, y1, z0, z1);
const MERGE = 4;
const onTop = (P, h, v) => v.emit(P, 0, h + U / 2, 0, MERGE);       // voxel y = 0 sits on height h
const centred = (P, v) => v.emit(P, 0, 0, 0, MERGE);                // voxel (0,0,0) is the part's pivot
// brick courses: rows `rh` voxels tall, bricks `bl` long, every other row offset
const mortar = (along, y, rh = 3, bl = 6) => { const row = Math.floor(y / rh); return ((y % rh) + rh) % rh === rh - 1 || ((((along + (row & 1) * (bl >> 1)) % bl) + bl) % bl) === 0; };

// ---------------------------------------------------------------------------
// palettes
// ---------------------------------------------------------------------------
function firePal(v) {
  return {
    BAS: v.pal("#3a2e2b", 0, 0.08), BAS2: v.pal("#4b3934", 0, 0.08), ST: v.pal("#6e5244", 0, 0.08), STH: v.pal("#8f6c58", 0, 0.07),
    MOR: v.pal("#2a201e", 0, 0.05), IRON: v.pal("#36302e", 0, 0.05), IRONH: v.pal("#564b47", 0, 0.05), ASH: v.pal("#4a4040", 0, 0.1), ASH2: v.pal("#5d5150", 0, 0.1),
    BR: v.pal("#b07a45", 0, 0.05), BRH: v.pal("#e2b274", 0, 0.04), BRD: v.pal("#7a5030", 0, 0.05), RIV: v.pal("#f0c27a", 0, 0.02), COAL: v.pal("#2a1a16", 0, 0.2), CRUST: v.pal("#3a2420", 0, 0.12), CRUST2: v.pal("#4e2e24", 0, 0.12),
    EMB: v.pal("#ff6a1e", 1.6, 0.1), EMB2: v.pal("#ff9a2e", 1.6, 0.1), HOT: v.pal("#ffcf6a", 1.8, 0.06), LAVA: v.pal("#ff5a14", 1.5, 0.12), LAVA2: v.pal("#ffa030", 1.8, 0.08), WHITE: v.pal("#fff1c0", 2.1, 0.03),
  };
}
function icePal(v) {
  return {
    GR: v.pal("#56677c", 0, 0.08), GR2: v.pal("#6c7f95", 0, 0.08), GRH: v.pal("#8a9db2", 0, 0.06), MOR: v.pal("#3a475a", 0, 0.05),
    SNOW: v.pal("#e4eef6", 0, 0.03), SNOW2: v.pal("#c6d8e6", 0, 0.04), ICE1: v.pal("#c4eafb", 0, 0.03), ICE2: v.pal("#8bcdef", 0, 0.04), ICE2B: v.pal("#6fbbe6", 0, 0.04),
    ICE3: v.pal("#4c9bd3", 0, 0.05), ICE4: v.pal("#2f68a6", 0, 0.06), STEEL: v.pal("#7a8a9e", 0, 0.04), STEELH: v.pal("#c2d0de", 0, 0.03), STEELD: v.pal("#3e4a5a", 0, 0.05),
    CY: v.pal("#4fd2ff", 1.35, 0.06), CY2: v.pal("#9eeaff", 1.6, 0.04), WG: v.pal("#e6faff", 1.8, 0.02),
  };
}
const FLAME_COLS = ["#fff6dc", "#ffeaa8", "#ffd65a", "#ffb02e", "#ff7a1e", "#ff9a26", "#ff6a1a", "#e83c14", "#b8240e"];

// ---------------------------------------------------------------------------
// shared sculpting helpers
// ---------------------------------------------------------------------------
// a twisting voxel flame: seven tongues around a white-hot heart (k scales it; 1 ≈ 2.7 units tall)
function flame(v, y0, k, seed, cols = FLAME_COLS, ember = 1, ox = 0, oz = 0) {
  const R = rng(seed), T = [];
  const P = cols.map((c, i) => v.pal(c, i < 2 ? 2.0 : i < 5 ? 1.55 : 1.2, 0.04));
  for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU + 0.3, ring = i === 0 ? 0 : (3.6 + R() * 1.6) * k; T.push({ x: i ? Math.cos(a) * ring : 0, z: i ? Math.sin(a) * ring : 0, h: (i ? 15 + R() * 13 : 34) * k, r: Math.max(1.1, (i ? 2.6 + R() * 1.2 : 5.6) * k), ph: R() * 6 }); }
  const W = Math.ceil(12 * k) + 2, H = Math.ceil(34 * k) + 1, nk = 1 / Math.max(0.45, k);
  v.fill((x, y, z) => {
    const yy = y - y0; let best = 0, tip = 0;
    for (const t of T) {
      const tt = yy / t.h; if (tt < 0 || tt > 1) continue;
      const cx = ox + t.x * (1 - tt * 0.75) + Math.sin(tt * 4 + t.ph) * 1.8 * k * tt, cz = oz + t.z * (1 - tt * 0.75) + Math.cos(tt * 3.4 + t.ph) * 1.4 * k * tt;
      const r = t.r * Math.pow(1 - tt, 0.9) * (0.75 + 0.5 * Math.sin(tt * 3 + 0.4));
      const d = Math.hypot(x - cx, z - cz) + (vnoise(x * 0.3 * nk + 5, y * 0.22 * nk, z * 0.3 * nk) - 0.5) * 3.6 * k;
      const val = 1 - d / Math.max(0.7, r);
      if (val > best) { best = val; tip = tt; }
    }
    if (best <= 0) return null;
    if (best < 0.3 && vnoise(x * 0.7 * nk, y * 0.45 * nk, z * 0.7 * nk) > 0.66 - tip * 0.13) return null;   // ragged edge
    if (best > 0.6 && tip < 0.7) return P[tip < 0.4 ? 0 : 1];
    if (best > 0.35) return P[tip < 0.35 ? 2 : tip < 0.65 ? 3 : 4];
    return P[tip < 0.3 ? 5 : tip < 0.6 ? 6 : tip < 0.82 ? 7 : 8];
  }, ox - W, ox + W, y0, y0 + H, oz - W, oz + W);
  // rising embers
  const E1 = v.pal(cols === FLAME_COLS ? "#ffb23a" : cols[3], 1.6, 0.05), E2 = v.pal(cols === FLAME_COLS ? "#ffe08a" : cols[2], 1.7, 0.03);
  for (let i = 0; i < Math.round(30 * k * ember); i++) {
    const y = y0 + Math.round((10 + R() * 30) * k), a = R() * TAU, d = (3 + R() * 8) * k + (y - y0) * 0.12;
    v.set(ox + Math.cos(a) * d, y, oz + Math.sin(a) * d, R() < 0.5 ? E1 : E2);
  }
}

// a faceted crystal with a diamond cross-section; tones = [lit face, side, side, shade, ridge, tip glow]
function crystal(v, cx, cy, cz, r, H, tones, o = {}) {
  const lx = (o.lean && o.lean[0]) || 0, lz = (o.lean && o.lean[1]) || 0, sh = o.shoulder == null ? 0.66 : o.shoulder;
  for (let y = 0; y <= H; y++) {
    const t = y / H, rr = t < sh ? r * (1 - t * 0.12) : r * (1 - sh * 0.12) * (1 - (t - sh) / (1 - sh));
    const ox = cx + lx * y, oz = cz + lz * y, W = Math.ceil(rr) + 1;
    for (let x = Math.floor(ox - W); x <= Math.ceil(ox + W); x++) for (let z = Math.floor(oz - W); z <= Math.ceil(oz + W); z++) {
      const dx = x - ox, dz = z - oz;
      if (Math.abs(dx) + Math.abs(dz) > rr + 0.35) continue;
      let p;
      if (t > 0.9 || (t > sh && rr < 0.8)) p = tones[5];
      else if (o.vein && Math.abs(dx) < 0.5 && dz > 0 && h3(x, cy + y, z) > 0.18) p = tones[5];
      else if (Math.abs(Math.abs(dx) - Math.abs(dz)) > rr - 0.9 && rr > 1.5) p = tones[4];    // the four ridges
      else p = dx >= 0 ? (dz >= 0 ? tones[0] : tones[2]) : (dz >= 0 ? tones[1] : tones[3]);
      v.set(x, cy + y, z, p);
    }
  }
}
const iceTones = (C, tip) => [C.ICE1, C.ICE2, C.ICE2B, C.ICE3, C.ICE1, tip || C.CY2];

// fill a part through a rotated local frame: f(X, Yb, Zb) is evaluated with the barrel axis pitched up by `pitch`
function pitched(v, pitch, f, bounds) {
  const s = Math.sin(pitch), c = Math.cos(pitch);
  v.fill((x, y, z) => f(x, y * c - z * s, y * s + z * c), ...bounds);
}
const along = (L, pitch) => [0, L * Math.sin(pitch) * U, L * Math.cos(pitch) * U];

// ---------------------------------------------------------------------------
// PLINTHS
// ---------------------------------------------------------------------------
export const VOX_PLINTH = {
  fire(p, st) {
    const v = vx(-18, 18, 0, 22, -18, 18), C = firePal(v);
    const top = st >= 1 ? 7 : 3;
    const seam = (x, z) => Math.abs(vnoise(x * 0.2, 3.1, z * 0.2) - 0.5) < 0.035;
    const course = (half, y0, y1, isTop) => v.fill((x, y, z) => {
      const ax = Math.abs(x), az = Math.abs(z), m = Math.max(ax, az);
      if (m > half || (ax === half && az === half && y === y1)) return null;
      if (m === half) {
        if (y === y1) return C.BR;
        const al = ax === half ? z : x;
        if (vnoise(al * 0.35, y * 0.6, (x > 0) + (z > 0) * 2 + 9) > 0.8) return C.LAVA;
        return mortar(al, y - y0, 2, 6) ? C.MOR : h3(x, y, z) < 0.2 ? C.BAS : C.BAS2;
      }
      if (y < y1) return C.BAS;
      if (!isTop) return m >= half - 1 ? C.STH : C.ST;
      if (seam(x, z) && m < half - 2) return C.LAVA;
      return m === half - 1 ? C.STH : vnoise(x * 0.5, 7, z * 0.5) > 0.62 ? C.ASH2 : C.ASH;
    }, -half, half, y0, y1, -half, half);
    course(17, 0, 3, st < 1);
    if (st >= 1) course(13, 4, 7, true);
    // corner braziers on bronze-banded pillars
    const ch = st >= 2 ? 9 : 5;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const px = sx * 15, pz = sz * 15;
      v.box(px - 1, 4, pz - 1, px + 1, 3 + ch, pz + 1, (x, y) => ((y - 4) % 4 === 3 ? C.BR : C.BAS2));
      v.box(px - 2, 4 + ch, pz - 2, px + 2, 4 + ch, pz + 2, C.BRH);
      v.box(px - 1, 5 + ch, pz - 1, px + 1, 5 + ch, pz + 1, C.COAL);
      v.box(px, 5 + ch, pz, px, 5 + ch + (st >= 2 ? 1 : 0), pz, st >= 2 ? C.HOT : C.EMB);
      for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) if (h3(px + dx, ch, pz + dz) < 0.6) v.set(px + dx, 5 + ch, pz + dz, C.EMB);
      if (st >= 3) v.box(px, 7 + ch, pz, px, 7 + ch, pz, C.WHITE);
    }
    v.emit(p, 0, U / 2, 0, MERGE);
    return (top + 1) * U;
  },
  ice(p, st) {
    const v = vx(-19, 19, 0, 24, -19, 19), C = icePal(v);
    const top = st >= 1 ? 7 : 3;
    const course = (half, y0, y1, isTop) => {
      v.fill((x, y, z) => {
        const ax = Math.abs(x), az = Math.abs(z), m = Math.max(ax, az);
        if (m > half) return null;
        if (m === half && y < y1) {
          const al = ax === half ? z : x;
          // a small glowing rune in the middle of each face
          if (y0 === 0 && Math.abs(al) <= 2 && ((y === 1 && al % 2 === 0) || (y === 2 && Math.abs(al) === 1))) return C.CY;
          return mortar(al, y - y0, 2, 7) ? C.MOR : h3(x, y, z) < 0.25 ? C.GR : C.GR2;
        }
        if (y < y1) return C.GR;
        if (!isTop) return m >= half - 1 ? C.SNOW2 : C.GRH;
        if (m === half) return C.SNOW;
        const n = vnoise(x * 0.22, 1, z * 0.22);
        return n > 0.64 ? C.ICE2 : n > 0.6 ? C.ICE1 : vnoise(x * 0.6, 4, z * 0.6) > 0.55 ? C.SNOW2 : C.SNOW;
      }, -half, half, y0, y1, -half, half);
      // icicles hanging from the course's top edge
      for (let a = -half; a <= half; a++) for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const r = h3(a, y1, sx * 3 + sz * 7); if (r > 0.22) continue;
        const x = sx ? sx * (half + 1) : a, z = sz ? sz * (half + 1) : a, L = r < 0.07 ? 2 : 1;
        for (let k = 0; k <= L; k++) v.set(x, y1 - k, z, k === L ? C.ICE1 : C.ICE2);
      }
    };
    course(17, 0, 3, st < 1);
    if (st >= 1) course(13, 4, 7, true);
    const H = st >= 2 ? 14 : 9;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      crystal(v, sx * 15, 4, sz * 15, 2.4, H, iceTones(C), { lean: [sx * 0.07, sz * 0.07] });
      crystal(v, sx * 15 - sx * 3, 4, sz * 15, 1.2, Math.round(H * 0.5), iceTones(C), { lean: [sx * 0.1, 0] });
    }
    v.emit(p, 0, U / 2, 0, MERGE);
    return (top + 1) * U;
  },
};

// ---------------------------------------------------------------------------
// HEADS
// ---------------------------------------------------------------------------
export const VOX_HEADS = {
  // ===== FIRE ==============================================================
  fire_0(P, h, st) { // Flame Tower: a brick furnace with an iron-barred fire door under a bronze brazier
    const v = vx(-14, 14, 0, 34, -14, 14), C = firePal(v);
    // footing
    v.fill((x, y, z) => { const m = Math.max(Math.abs(x), Math.abs(z)); return m <= 9 ? (m === 9 ? (mortar(Math.abs(x) === 9 ? z : x, y, 2, 5) ? C.MOR : C.STH) : C.ST) : null; }, -9, 9, 0, 1, -9, 9);
    const H0 = 2, H1 = 14, half = 7;
    for (let y = H0; y <= H1; y++) for (let x = -half; x <= half; x++) for (let z = -half; z <= half; z++) {
      const ax = Math.abs(x), az = Math.abs(z);
      if (ax + az > half * 2 - 3) continue;
      if (z >= half - 1 && ax <= 3 && y >= H0 + 2 && y <= H0 + 8 - (ax === 3 ? 1 : 0)) { // the fire door
        if (z === half && ax % 2 === 1) v.set(x, y, z + 1, C.IRON);
        continue;
      }
      const row = y - H0, al = az === half ? x : z;
      let p = (row % 3 === 2 || (al + (row % 2) * 2 + 20) % 4 === 0) ? C.MOR : h3(x, y, z) < 0.18 ? C.STH : C.ST;
      if (y === H0 || y === H1) p = C.BRD;
      if (st >= 1 && ax + az >= half * 2 - 4 && (y === H0 + 4 || y === H0 + 8)) p = C.BR;   // bronze bands on the chamfers
      v.set(x, y, z, p);
    }
    for (let y = H0 + 2; y <= H0 + 7; y++) for (let x = -3; x <= 3; x++) v.set(x, y, half - 2, y <= H0 + 3 ? C.HOT : y <= H0 + 5 ? C.EMB2 : C.EMB);
    v.box(-1, H0 + 9, half + 1, 1, H0 + 9, half + 1, C.BR); v.set(0, H0 + 9, half + 1, C.BRH);
    for (const s of [-1, 1]) for (let y = H0 + 4; y <= H0 + 7; y++) for (const z of [-2, 2]) v.set(s * half, y, z, C.EMB);
    // bronze collar flaring into the brazier bowl
    const B0 = H1 + 1;
    for (let y = B0; y <= B0 + 5; y++) {
      const t = (y - B0) / 5, r = 7.5 + t * t * 4.6, inner = r - 1.6;
      v.fill((x, yy, z) => {
        const d = Math.hypot(x, z); if (d > r || (y > B0 && d < inner)) return null;
        const band = y === B0 || y === B0 + 5;
        if (!band && y === B0 + 3 && Math.round(Math.atan2(z, x) / (Math.PI / 8)) % 2 === 0) return C.BRH;
        return band ? C.BRH : y === B0 + 2 ? C.BRD : C.BR;
      }, -13, 13, y, y, -13, 13);
    }
    for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; v.set(Math.cos(a) * 10.6, B0 + 4, Math.sin(a) * 10.6, C.RIV); }
    v.fill((x, y, z) => {
      const d = Math.hypot(x, z); if (d > 10.2) return null;
      const top = B0 + 3 + Math.round(vnoise(x * 0.3, 2, z * 0.3) * 2.5 + (1 - d / 10) * 1.2);
      if (y > top) return null;
      if (y < top) return C.COAL;
      return vnoise(x * 0.5, 9, z * 0.5) > 0.52 ? (h3(x, y, z) < 0.4 ? C.HOT : C.EMB2) : C.COAL;
    }, -11, 11, B0 + 1, B0 + 6, -11, 11);
    // forged arms from the footing to the bowl rim
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      for (let y = H0; y <= B0 + 3; y++) {
        const t = (y - H0) / (B0 + 3 - H0), r = 9.2 + Math.sin(t * Math.PI) * 1.4 - t;
        v.set(sx * r * 0.7071, y, sz * r * 0.7071, y % 5 === 0 ? C.BRH : C.IRON);
      }
      v.set(sx * 8.5, B0 + 6, sz * 8.5, C.BRH); v.set(sx * 8.5, B0 + 7, sz * 8.5, C.HOT);
    }
    if (st >= 2) for (const s of [-1, 1]) { // side braziers on masonry arms
      v.box(s * 8, H0 + 3, -1, s * 11, H0 + 4, 1, C.BAS2); v.box(s * 10, H0 + 5, -1, s * 10, H0 + 6, 1, C.ST);
      v.box(s * 9, H0 + 7, -2, s * 12, H0 + 7, 2, C.BR); v.box(s * 10, H0 + 8, -1, s * 11, H0 + 8, 1, C.EMB2); v.set(s * 10, H0 + 9, 0, C.HOT); v.set(s * 11, H0 + 9, 0, C.EMB);
    }
    if (st >= 3) for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { // crown prongs on the rim
      v.path([[sx * 8, B0 + 5, sz * 8], [sx * 9, B0 + 9, sz * 9], [sx * 8.4, B0 + 12, sz * 8.4]], 1.1, 0.6, (x, y) => (y > B0 + 10 ? C.RIV : C.BR));
      v.set(sx * 8.4, B0 + 13, sz * 8.4, C.WHITE);
    }
    onTop(P.base, h, v);
    const f = vx(-14, 14, 0, 40, -14, 14);
    flame(f, 0, 0.5 + st * 0.07, 11);
    centred(P.float, f);
    return { fy: h + (B0 + 4) * U, bob: 0.035, muzzle: [0, h + 2.45 + st * 0.1, 0] };
  },

  fire_1(P, h, st) { // Fireball Tower: a bronze-banded siege cannon on a turntable, furnace glowing in the bore
    const b = vx(-11, 11, 0, 6, -11, 11), C = firePal(b);
    b.fill((x, y, z) => {
      const d = Math.hypot(x, z);
      if (y <= 2) return d <= 10 ? (d > 9 ? (mortar(Math.round(Math.atan2(z, x) * 10), y, 3, 3) ? C.MOR : C.BAS2) : C.BAS) : null;
      if (y === 3) return d <= 10.4 ? (d > 9.6 && Math.round(Math.atan2(z, x) / (TAU / 24)) % 2 === 0 ? C.RIV : C.BR) : null;
      return d <= 8 ? (y === 5 && d > 7 ? C.IRONH : C.IRON) : null;
    });
    onTop(P.base, h, b);
    const v = vx(-12, 12, -10, 18, -10, 32), A = firePal(v);
    const pitch = 0.38, steps = st >= 1 ? 6 : 5;
    // yoke and trunnions (level, they hold the pitched gun)
    for (const s of [-1, 1]) {
      v.box(s * 8, -9, -3, s * 9, -1, 3, (x, y) => (y === -9 ? A.BR : A.IRON));
      v.cyl(s * 7, 0, 0, 2.6, s * 10, A.BR, "x"); v.cyl(s * 7, 0, 0, 1.4, s * 11, A.BRH, "x");
    }
    pitched(v, pitch, (X, Y, Z) => {
      const ax = Math.abs(X);
      // the breech: a chamfered block with a bronze-framed hatch at the back
      if (Z >= -7 && Z <= 5 && ax <= 6.5 && Y >= -4.5 && Y <= 5.5 && ax + Math.abs(Y - 0.5) <= 10) {
        if (Z < -6.5 && ax <= 2.2 && Math.abs(Y - 0.5) <= 2.2) return A.EMB2;
        if (Z < -6.5 && ax <= 3.4 && Math.abs(Y - 0.5) <= 3.4) return A.BR;
        if (Math.abs(Z - 2) < 0.5 || Math.abs(Z + 4) < 0.5) return A.BR;
        if (ax > 5.5 && Math.abs(Y - 0.5) < 3 && Z > -5 && Z < 1) return Math.abs(Y - 0.5) < 2 && Z > -4 && Z < 0 ? A.BRH : A.BRD;   // side plates
        return Y > 4.5 ? A.IRONH : A.IRON;
      }
      if (Z < 4 || Z > 28) return null;
      const r = Math.hypot(X, Y), R = Z > 25 ? 4.6 : 4.8 - (Z - 4) * 0.055;
      const band = Z <= 25 && ((Z - 4) % steps) < 1;
      if (r > R + (band ? 1 : 0)) return null;
      if (r < 2.3 && Z > 20) return Z < 21 ? A.HOT : 0;                       // the bore with the furnace at its end
      if (Z > 25) return r > R - 1 ? (Z > 27 ? A.BRH : A.BR) : A.IRON;
      if (band) return A.BR;
      if (Y > R - 1 && ax < 0.6) return A.BRH;                               // a top rib
      if (Y > R - 1.2 && ax < 2 && Z > 7 && Z < 13 && Math.round(Z) % 2 === 0) return A.EMB;  // heat vents
      return r > R - 1 && h3(Math.round(X), Math.round(Y), Math.round(Z)) < 0.15 ? A.IRONH : A.IRON;
    }, [-12, 12, -10, 18, -10, 32]);
    if (st >= 1) pitched(v, pitch, (X, Y, Z) => { // exhaust stacks on the breech
      for (const s of [-1, 1]) if (Math.abs(X - s * 3.5) <= 1 && Math.abs(Z + 2) <= 1 && Y > 5 && Y <= 8.5) return Y > 7.6 ? A.EMB : A.BRD;
      return null;
    }, [-12, 12, -10, 18, -10, 32]);
    if (st >= 2) pitched(v, pitch, (X, Y, Z) => { // fuel canisters with a glowing window
      for (const s of [-1, 1]) { const d = Math.hypot(X - s * 6.6, Y + 0.5); if (d <= 2.1 && Z >= 7 && Z <= 15) return Z === 7 || Z === 15 ? A.BR : (d > 1.5 && Math.abs(Y + 0.5) < 0.6 && Z > 9 && Z < 13 ? A.EMB2 : A.BRD); }
      return null;
    }, [-12, 12, -10, 18, -10, 32]);
    if (st >= 3) pitched(v, pitch, (X, Y, Z) => { // swept fins and a charge orb on the breech
      for (const s of [-1, 1]) { const ax = X * s; if (ax > 6 && ax < 8 && Y > 0 && Y < 6 - (Z - 14) * 0.5 && Z > 12 && Z < 22) return ax > 7 ? A.BRH : A.IRON; }
      const d = Math.hypot(X, Y - 7.5, Z + 1); return d <= 1.8 ? A.WHITE : d <= 2.6 && Y < 7 ? A.BR : null;
    }, [-12, 12, -10, 18, -10, 32]);
    centred(P.aim, v);
    return { ay: h + 0.8, muzzle: along(28, pitch) };
  },

  fire_2(P, h, st) { // Magma Tower: a basalt crucible brimming with crusted magma, vent chimneys at its corners
    const v = vx(-14, 14, 0, 24, -14, 14), C = firePal(v);
    const half = 11, rim = 8, chH = st >= 2 ? 15 : 12;
    v.fill((x, y, z) => {
      const ax = Math.abs(x), az = Math.abs(z);
      if (ax > half || az > half || ax + az > half * 2 - 4) return null;
      const shell = ax >= half - 1 || az >= half - 1 || ax + az >= half * 2 - 6;
      if (y === rim) return shell ? (ax + az >= half * 2 - 5 || ax === half || az === half ? C.STH : C.ST) : null;
      if (y > rim) return null;
      if (!shell) {
        if (y < rim - 1) return C.BAS;
        const n = vnoise(x * 0.28, 5, z * 0.28), d = Math.hypot(x, z);
        if (n > 0.6) return n > 0.68 ? C.CRUST : C.CRUST2;                    // cooled crust plates
        return d < 3 ? C.WHITE : d < 6 || n < 0.4 ? C.LAVA2 : C.LAVA;
      }
      if (y === rim - 2 || (st >= 1 && y === 2)) return C.BR;
      const al = ax >= az ? z : x;
      return mortar(al, y, 3, 5) ? C.MOR : h3(x, y, z) < 0.25 ? C.BAS : C.BAS2;
    });
    // a spout on the front pouring a lava fall down onto the plinth
    v.box(-2, rim - 1, half - 1, 2, rim, half + 1, (x, y, z) => (Math.abs(x) === 2 || y === rim - 1 ? C.BAS2 : C.LAVA2));
    v.box(-1, 0, half + 1, 1, rim - 1, half + 1, (x, y) => (Math.abs(x) === 1 && h3(x, y, 1) < 0.4 ? C.LAVA : C.LAVA2));
    v.box(-2, 0, half + 2, 2, 0, half + 3, (x, y, z) => (h3(x, y, z) < 0.5 ? C.LAVA : C.CRUST));
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const cx = sx * 10, cz = sz * 10;
      v.box(cx - 2, 0, cz - 2, cx + 2, chH, cz + 2, (x, y, z) => {
        if (Math.abs(x - cx) < 2 && Math.abs(z - cz) < 2 && y > chH - 2) return y === chH ? C.LAVA2 : C.COAL;
        return y === chH || y === chH - 4 ? C.BR : mortar(Math.abs(x - cx) === 2 ? z : x, y, 3, 4) ? C.MOR : C.BAS2;
      });
      const fv = 0.16 + st * 0.02;
      flame(v, chH + 1, fv, 31 + sx * 3 + sz, FLAME_COLS, 0.4, cx, cz);
    }
    if (st >= 3) for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + 0.39; v.cap([Math.cos(a) * 9, rim, Math.sin(a) * 9], [Math.cos(a) * 10.5, rim + 4, Math.sin(a) * 10.5], 1.0, C.BAS2, 0.4); v.set(Math.cos(a) * 10.5, rim + 5, Math.sin(a) * 10.5, C.EMB2); }
    onTop(P.base, h, v);
    // the floating magma heart: crusted plates with glowing cracks, flames licking off its top
    const f = vx(-10, 10, -10, 26, -10, 10), F = firePal(f), r = 4.5 + st * 0.5;
    f.ell(0, 0, 0, r, r * 0.92, r, (x, y, z) => {
      const n = vnoise(x * 0.45 + 3, y * 0.45, z * 0.45);
      const d = Math.abs(n - 0.5);
      return d < 0.05 ? F.HOT : d < 0.1 ? F.LAVA2 : d < 0.14 ? F.LAVA : n > 0.66 ? F.CRUST2 : F.CRUST;
    });
    for (let i = 0; i < 4; i++) { const a = i * 1.7; f.set(Math.cos(a) * 2, -r - 1 - (i % 2), Math.sin(a) * 2, F.LAVA2); }
    flame(f, Math.round(r * 0.6), 0.26 + st * 0.03, 19);
    centred(P.float, f);
    return { fy: h + 1.7, bob: 0.04, muzzle: [0, h + 2.2, 0] };
  },

  fire_3(P, h, st) { // Inferno Tower: four lava-veined basalt pillars caging a twisting column of fire
    const H = Math.round((2.6 + st * 0.35) / U);
    const v = vx(-13, 13, 0, H + 8, -13, 13), C = firePal(v);
    v.fill((x, y, z) => { const m = Math.max(Math.abs(x), Math.abs(z)); if (m > 11) return null; if (m === 11 || y === 2) return mortar(Math.abs(x) === 11 ? z : x, y, 3, 5) ? C.MOR : C.BAS2; return m > 4 ? C.BAS : C.COAL; }, -11, 11, 0, 2, -11, 11);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      v.box(sx * 5, 3, sz * 5, sx * 9, H - 1, sz * 9, (x, y, z) => {
        const ox = Math.abs(x) === 9, oz = Math.abs(z) === 9;
        if (ox && oz) return y % 6 === 0 ? C.BR : C.BAS;                      // the outer corner edge
        if ((ox && Math.abs(z) === 7) || (oz && Math.abs(x) === 7)) return vnoise(x * 0.4, y * 0.25, z * 0.4) > 0.38 ? C.LAVA : C.BAS2;  // lava veins
        return mortar(ox ? z : x, y, 3, 4) ? C.MOR : h3(x, y, z) < 0.2 ? C.STH : C.ST;
      });
    }
    // bronze binding rings tying the pillars together, and iron grilles between the pillars' feet
    for (const y of [Math.round(H / 3), Math.round((2 * H) / 3)]) v.fill((x, yy, z) => { const m = Math.max(Math.abs(x), Math.abs(z)); return m >= 8 && m <= 10 ? (yy === y ? C.BRH : yy === y - 2 ? C.BRD : C.BR) : null; }, -10, 10, y - 2, y, -10, 10);
    v.fill((x, y, z) => { const ax = Math.abs(x), az = Math.abs(z), m = Math.max(ax, az), al = ax === m ? az : ax; if (m !== 8 || al > 4) return null; return y === 3 || y === 9 ? C.BR : al % 2 === 0 ? C.IRON : null; }, -8, 8, 3, 9, -8, 8);
    // crown platform with a hot bowl and corner horns
    v.fill((x, y, z) => {
      const m = Math.max(Math.abs(x), Math.abs(z)), d = Math.hypot(x, z);
      if (m > 11 || (Math.abs(x) === 11 && Math.abs(z) === 11)) return null;
      if (d < 4.5) return y === H ? C.HOT : C.COAL;
      return y === H + 1 ? (m >= 10 ? C.BRH : null) : y === H ? (m >= 10 ? C.BR : C.STH) : C.BAS2;
    }, -11, 11, H - 1, H + 1, -11, 11);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      v.path([[sx * 9.5, H + 1, sz * 9.5], [sx * 10.5, H + 4, sz * 10.5], [sx * 9.6, H + 7, sz * 9.6]], 1.2, 0.5, (x, y) => (y > H + 5 ? C.BRH : C.BAS));
      if (st >= 2) v.set(sx * 9.6, H + 8, sz * 9.6, C.HOT);
    }
    // the fire column: two tongues spiralling up inside the cage
    v.fill((x, y, z) => {
      const t = (y - 3) / (H - 4); if (t < 0 || t > 1) return null;
      let best = 0;
      for (const ph of [0, Math.PI]) {
        const a = y * 0.32 + ph, cx = Math.cos(a) * 1.6, cz = Math.sin(a) * 1.6;
        const d = Math.hypot(x - cx, z - cz) + (vnoise(x * 0.5, y * 0.3, z * 0.5) - 0.5) * 2.6;
        best = Math.max(best, 1 - d / 3.4);
      }
      if (best <= 0) return null;
      const n = vnoise(x * 0.6 + 9, y * 0.18, z * 0.6);
      if (best < 0.25 && n > 0.58) return null;
      return best > 0.6 ? (n > 0.5 ? C.WHITE : C.HOT) : best > 0.32 ? (n > 0.45 ? C.LAVA2 : C.EMB2) : n > 0.5 ? C.EMB : C.LAVA;
    }, -5, 5, 3, H - 1, -5, 5);
    onTop(P.base, h, v);
    const f = vx(-14, 14, 0, 40, -14, 14);
    flame(f, 0, 0.55 + st * 0.06, 23);
    centred(P.float, f);
    return { fy: h + H * U + 0.1, bob: 0.08, muzzle: [0, h + H * U + 1.2, 0] };
  },

  fire_4(P, h, st) { // Phoenix Spire: a firebird with spread wings over a burning nest
    const v = vx(-12, 12, 0, 28, -12, 12), C = firePal(v);
    v.fill((x, y, z) => { const m = Math.max(Math.abs(x), Math.abs(z)); const half = y <= 2 ? 10 : 8; if (m > half) return null; if (m === half) return y === 2 || y === 5 ? C.BR : mortar(Math.abs(x) === half ? z : x, y, 3, 5) ? C.MOR : C.BAS2; return C.BAS; }, -10, 10, 0, 5, -10, 10);
    v.cyl(0, 6, 0, 5.6, 17, (x, y, z) => (y === 10 || y === 15 ? C.BR : (y + Math.round(Math.atan2(z, x) * 3)) % 3 === 0 && Math.hypot(x, z) > 5 ? C.MOR : C.ST));
    v.cyl(0, 18, 0, 7.5, 19, (x, y, z) => (Math.hypot(x, z) > 6.8 ? C.BRH : C.BR));
    // the nest: twigs woven round a bed of embers
    const R = rng(77), TW = [v.pal("#4a3020", 0, 0.1), v.pal("#6a4428", 0, 0.1), v.pal("#2e1d14", 0, 0.1)];
    for (let i = 0; i < 26; i++) {
      const a = R() * TAU, r = 5.5 + R() * 2.2, y = 20 + R() * 3.2, L = 3 + R() * 3, b = a + Math.PI / 2 + (R() - 0.5) * 0.9;
      v.cap([Math.cos(a) * r - Math.cos(b) * L, y - R(), Math.sin(a) * r - Math.sin(b) * L], [Math.cos(a) * r + Math.cos(b) * L, y + R(), Math.sin(a) * r + Math.sin(b) * L], 0.7, TW[i % 3]);
    }
    v.cyl(0, 20, 0, 4.5, 21, (x, y, z) => (h3(x, y, z) < 0.45 ? C.HOT : C.EMB));
    flame(v, 21, 0.18 + st * 0.03, 41, FLAME_COLS, 0.5);
    onTop(P.base, h, v);
    // the phoenix
    const f = vx(-20, 20, -16, 18, -12, 10), F = firePal(f);
    const RED = f.pal("#b8301a", 0, 0.06), RED2 = f.pal("#d84a1e", 0, 0.06), OR = f.pal("#f07a26", 0, 0.05), BREAST = f.pal("#ff9a3a", 0, 0.05);
    const GOLD = f.pal("#ffcf5a", 0, 0.03), TIP = f.pal("#ffd75a", 1.7, 0.04), TIP2 = f.pal("#fff1b0", 2.0, 0.02), MID = f.pal("#ff8a2a", 1.3, 0.05);
    const feather = (d, len) => { const t = d / len; return t < 0.42 ? RED : t < 0.62 ? RED2 : t < 0.8 ? OR : t < 0.92 ? MID : TIP; };
    f.ell(0, 0, 0, 3.6, 4.8, 3.8, (x, y, z) => (z > 1.4 && y < 2.5 ? BREAST : y > 2.5 ? RED2 : RED));
    f.ell(0, 6, 2.2, 2.6, 2.5, 2.7, RED2);
    f.cap([0, 6.1, 4.4], [0, 5, 7.4], 1.2, GOLD, 0.35);
    for (const s of [-1, 1]) f.set(s * 1.8, 6.7, 3.8, TIP2);
    const crest = 2 + Math.min(st, 2);
    for (let i = 0; i < crest; i++) { const o = (i - (crest - 1) / 2) * 1.4; f.path([[o * 0.5, 8, 1.6], [o, 10.5, 0.2], [o * 1.4, 12.5, -1.8]], 0.8, 0.45, (x, y) => (y > 11.5 ? TIP : y > 10 ? MID : RED2)); }
    const span = 1 + st * 0.06;
    for (const s of [-1, 1]) {
      // the wing's leading edge (shoulder, elbow, wrist, tip), raised; feathers hang from it, longest at the tip
      const bone = [[s * 2.8, 2.5, 0], [s * 7, 5.5, -1], [s * 11.5 * span, 8, -2], [s * 16.5 * span, 9.5, -3]];
      f.path(bone, 1.3, 0.7, RED2);
      const at = (t) => { const k = Math.min(2.999, t * 3), i = Math.floor(k), u = k - i; return bone[i].map((c, j) => c + (bone[i + 1][j] - c) * u); };
      for (let i = 0; i <= 12; i++) {
        const t = 0.08 + (i / 12) * 0.92, A = at(t), len = (4.5 + t * t * 8) * span;
        const d = [s * (0.25 + t * 0.55), -1, -0.3], L = Math.hypot(...d);
        const B = A.map((c, j) => c + (d[j] / L) * len);
        f.cap(A, B, 1.0, (x, y, z) => { const q = Math.hypot(x - A[0], y - A[1], z - A[2]) / len; return q < 0.5 ? (i % 2 ? RED : RED2) : q < 0.78 ? OR : q < 0.92 || t < 0.55 ? MID : TIP; }, 0.55);
        if (i % 2 === 0) f.cap(A, A.map((c, j) => c + (d[j] / L) * len * 0.45 + (j === 2 ? 0.8 : 0)), 0.9, RED2, 0.6);   // coverts
      }
    }
    for (let i = 0; i < 5; i++) {
      const o = (i - 2) * 1.8, L = 12 + (2 - Math.abs(i - 2)) * 2;
      const pts = [[0, -3, -2], [o * 0.6, -7, -4.5], [o, -11, -6], [o * 1.3, -3 - L, -6.5 + Math.abs(o) * 0.4]];
      f.path(pts, 1.1, 0.5, (x, y) => feather(-y - 3, L));
    }
    for (const s of [-1, 1]) f.cap([s * 1.2, -3.5, 0.5], [s * 1.4, -5.5, 1.5], 0.6, GOLD);
    if (st >= 2) for (let i = 0; i < 10; i++) { const a = i * 2.4, d = 6 + (i % 3) * 3; f.set(Math.cos(a) * d * 0.9, -6 - (i % 4) * 2, Math.sin(a) * d * 0.4 - 3, i % 2 ? TIP : TIP2); }
    centred(P.float, f);
    return { fy: h + 2.7 + st * 0.12, bob: 0.18, muzzle: [0, h + 3.0, 0] };
  },

  // ===== ICE ===============================================================
  ice_0(P, h, st) { // Frost Tower: a tall vein-lit crystal spire rising from stepped granite and ice
    const H = 26 + st * 4, v = vx(-13, 13, 0, H + 12, -13, 13), C = icePal(v);
    v.fill((x, y, z) => { const m = Math.max(Math.abs(x), Math.abs(z)); if (m > 8) return null; if (y === 4) return m === 8 ? C.SNOW2 : C.SNOW; if (m === 8) return mortar(Math.abs(x) === 8 ? z : x, y, 2, 5) ? C.MOR : C.GR2; return C.GR; }, -8, 8, 0, 4, -8, 8);
    v.fill((x, y, z) => { const ax = Math.abs(x), az = Math.abs(z); if (ax > 6 || az > 6 || ax + az > 10) return null; return y === 8 ? C.ICE1 : (ax === 6 || az === 6 || ax + az === 10) ? (y === 6 ? C.ICE2 : C.ICE3) : C.ICE4; }, -6, 6, 5, 8, -6, 6);
    if (st >= 3) v.cyl(0, 15, 0, 5.4, 16, (x, y) => (y === 16 ? C.STEELH : C.STEEL));
    crystal(v, 0, 6, 0, 4.4, H, iceTones(C), { vein: true, shoulder: 0.7 });
    const n = 3 + Math.min(st, 2);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + 0.5, d = 4;
      crystal(v, Math.cos(a) * d, 7, Math.sin(a) * d, 1.9, 10 + (i % 2) * 3 + st, iceTones(C), { lean: [Math.cos(a) * 0.2, Math.sin(a) * 0.2] });
    }
    if (st >= 2) for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; crystal(v, Math.cos(a) * 8.5, 5, Math.sin(a) * 8.5, 1, 4, iceTones(C), { lean: [Math.cos(a) * 0.25, Math.sin(a) * 0.25] }); }
    onTop(P.base, h, v);
    return { muzzle: [0, h + (H + 6) * U, 0] };
  },

  ice_1(P, h, st) { // Icicle Tower: a crystal-limbed frost ballista loaded with a long glowing icicle
    const b = vx(-10, 10, 0, 8, -10, 10), C = icePal(b);
    b.fill((x, y, z) => {
      const d = Math.hypot(x, z);
      if (y <= 4) return d <= 8.5 ? (d > 7.5 ? (y === 4 ? C.SNOW : mortar(Math.round(Math.atan2(z, x) * 8), y, 2, 3) ? C.MOR : C.GR2) : y === 4 ? C.SNOW2 : C.GR) : null;
      return d <= 6.5 ? (y === 5 ? C.STEELH : C.STEEL) : null;
    });
    onTop(P.base, h, b);
    const v = vx(-18, 18, -9, 8, -12, 26), A = icePal(v);
    const WOOD = v.pal("#46566a", 0, 0.08), WOODH = v.pal("#5d6f86", 0, 0.07);
    // carriage and yoke
    v.box(-5, -8, -6, 5, -2, 4, (x, y, z) => (y === -2 ? A.SNOW : Math.abs(x) === 5 && Math.abs(z) < 3 && y > -7 && y < -3 ? A.CY : (y + z) % 4 === 0 ? A.STEELD : A.GR2));
    if (st >= 1) for (const s of [-1, 1]) { v.cyl(s * 6, -4, -1, 2.2, s * 8, A.STEEL, "x"); v.cyl(s * 6, -4, -1, 1, s * 9, A.STEELH, "x"); }
    // the stock with frosted fittings
    v.box(-2, -1, -9, 2, 1, 16, (x, y, z) => (z % 6 === 0 ? A.STEELH : y === 1 ? WOODH : WOOD));
    v.box(-3, -2, 12, 3, 2, 15, A.STEEL);
    // crystal limbs and the bowstring
    for (const s of [-1, 1]) {
      const pts = [[s * 2.5, 0.5, 13], [s * 7, 1, 13.5], [s * 11.5, 1.5, 11.5], [s * 15, 2, 7.5], [s * 16.5, 2.5, 4.5]];
      v.path(pts, 1.6, 0.7, (x, y, z) => (Math.abs(x) > 15.5 ? A.CY2 : (y + Math.abs(x)) % 3 === 0 ? A.ICE1 : z > 11 ? A.ICE2 : A.ICE3));
      v.path([[s * 16.5, 2.5, 4.5], [s * 8, 1.5, -1.5], [0, 1, -4]], 0.45, 0.45, A.SNOW2);
    }
    // the loaded icicle
    const L0 = -4, L1 = 25 + (st >= 2 ? 1 : 0);
    v.fill((x, y, z) => {
      const t = (z - L0) / (L1 - L0); if (t < 0 || t > 1) return null;
      const r = 1.9 * (t < 0.15 ? 1 : 1 - (t - 0.15) / 0.85), d = Math.hypot(x, y - 3);
      if (d > r + 0.3) return null;
      return t > 0.85 ? A.WG : d < r - 0.8 || Math.abs(x) + Math.abs(y - 3) < 1 ? A.CY2 : A.CY;
    }, -3, 3, 0, 6, L0, L1);
    for (const s of [-1, 1]) v.box(s * 1, 3 + s * 2, L0, s * 2, 3 + s * 2, L0 + 2, A.ICE2), v.box(s * 2, 3, L0, s * 3, 3, L0 + 2, A.ICE2);
    if (st >= 2) for (const s of [-1, 1]) crystal(v, s * 4, 1, 4, 1.3, 6, iceTones(A), { lean: [s * 0.2, 0.15] });
    if (st >= 3) v.box(-1, -1, -11, 1, 3, -10, (x, y) => (y === 3 ? A.WG : A.STEELH));
    centred(P.aim, v);
    return { ay: h + 0.75, muzzle: [0, 3 * U, L1 * U] };
  },

  ice_2(P, h, st) { // Glacier Tower: a heavy ice-block cannon driving a spiralled crystal drill
    const b = vx(-11, 11, 0, 9, -11, 11), C = icePal(b);
    b.fill((x, y, z) => {
      const ax = Math.abs(x), az = Math.abs(z); if (ax > 10 || az > 10 || ax + az > 14) return null;
      const edge = ax === 10 || az === 10 || ax + az === 14;
      if (y === 8) return edge ? C.SNOW2 : C.SNOW;
      if (y === 3 || y === 6) return edge ? C.STEEL : C.GR;
      return edge ? (mortar(ax === 10 ? z : x, y, 3, 5) ? C.MOR : h3(x, y, z) < 0.3 ? C.ICE3 : C.GR2) : C.GR;
    });
    onTop(P.base, h, b);
    const v = vx(-12, 12, -8, 16, -11, 33), A = icePal(v), pitch = 0.22;
    // housing of ice blocks bound in steel
    v.fill((x, y, z) => {
      const ax = Math.abs(x); if (ax > 9 || y < -5 || y > 6 || z < -9 || z > 6 || ax + Math.abs(y) > 13) return null;
      if (ax === 9 || y === 6 || z === -9) {
        if (z === -8 || z === 4 || z === -2) return A.STEEL;
        if (y === 6 && ax < 2) return A.STEELH;
        const [a, b] = ax === 9 ? [z, y] : y === 6 ? [x, z] : [x, y], row = Math.floor((b + 12) / 4), sh = (row & 1) * 3;
        if ((b + 12) % 4 === 3 || (((a + sh) % 6) + 6) % 6 === 0) return A.ICE3;
        return h3(Math.floor((a + sh + 60) / 6), row, ax === 9 ? 1 : y === 6 ? 2 : 3) < 0.5 ? A.ICE2 : A.ICE1;
      }
      return A.ICE4;
    });
    v.box(-3, -2, -10, 3, 2, -10, (x, y) => (Math.abs(x) < 2 && Math.abs(y) < 1 ? A.CY2 : A.STEELD));
    pitched(v, pitch, (X, Y, Z) => {
      if (Z < 5 || Z > 32) return null;
      const r = Math.hypot(X, Y);
      if (Z <= 14) { const R = Z < 7 || Z > 12 ? 6 : 5.3; return r <= R ? (Z === 6 || Z === 13 ? A.STEELH : r > R - 0.9 && (Math.round(Math.atan2(Y, X) / (TAU / 8)) & 1) ? A.STEELD : A.STEEL) : null; }
      const t = (Z - 14) / 18, R = 5.4 * (1 - t);
      if (r > R + 0.4) return null;
      if (t > 0.86) return A.WG;
      const sp = (((Math.atan2(Y, X) / TAU) * 3 + Z * 0.13) % 1 + 1) % 1;       // three spiral flutes
      return sp < 0.18 ? A.CY : sp < 0.55 ? A.ICE1 : A.ICE3;
    }, [-12, 12, -8, 16, -11, 33]);
    for (const s of [-1, 1]) crystal(v, s * 6.5, 6, -5, 1.8, 6 + st * 2, iceTones(A), { lean: [s * 0.18, -0.12] });
    if (st >= 2) crystal(v, 0, 6, -6, 2.2, 8 + st, iceTones(A), { lean: [0, -0.2], vein: true });
    if (st >= 1) for (const s of [-1, 1]) v.box(s * 10, -4, -6, s * 10, 3, 2, (x, y, z) => (y === -4 || y === 3 || z === -6 || z === 2 ? A.STEELD : (y === -2 || y === 1) && (z === -4 || z === 0) ? A.STEELH : A.STEEL));
    centred(P.aim, v);
    return { ay: h + 1.0, muzzle: along(32, pitch) };
  },

  ice_3(P, h, st) { // Blizzard Tower: a rune-carved frost obelisk under a whirling ring of snow
    const H = Math.round((2.8 + st * 0.3) / U), v = vx(-11, 11, 0, H + 12, -11, 11), C = icePal(v);
    v.fill((x, y, z) => { const m = Math.max(Math.abs(x), Math.abs(z)); if (m > 9) return null; if (y === 3) return m >= 8 ? C.SNOW2 : C.SNOW; if (m === 9) return mortar(Math.abs(x) === 9 ? z : x, y, 2, 5) ? C.MOR : C.GR2; return C.GR; }, -9, 9, 0, 3, -9, 9);
    const RUNE = [[0, 0], [0, 1], [0, 2], [-1, 2], [1, 0], [0, 4], [-1, 5], [1, 5], [0, 6], [0, 8], [1, 9], [-1, 9], [0, 10]];
    v.fill((x, y, z) => {
      const t = (y - 4) / (H - 4), half = Math.round(6 - t * 2), ax = Math.abs(x), az = Math.abs(z), m = Math.max(ax, az);
      const ledge = (y - 4) % 10 === 9;
      if (m > half + (ledge ? 1 : 0)) return null;
      if (ledge) return m >= half ? C.SNOW : C.GR;
      if (m < half) return C.GR;
      if (ax === half && az === half) return C.GRH;
      const al = ax === half ? z * Math.sign(x) : x * -Math.sign(z), ry = (y - 6) % 22;
      if (y > 5 && y < H - 2 && RUNE.some(([a, b]) => a === al && b === ry)) return C.CY;
      return (y + al) % 7 === 0 ? C.GRH : C.GR2;
    }, -7, 7, 4, H, -7, 7);
    crystal(v, 0, H + 1, 0, 4, 10, iceTones(C), { shoulder: 0.25 });
    onTop(P.base, h, v);
    // the snow ring (spins): clumps of snow with a few glowing flakes
    const s = vx(-25, 25, -12, 14, -25, 25), S = icePal(s), R = rng(5);
    const ring = (r, y, n, size) => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU, x = Math.cos(a) * r, z = Math.sin(a) * r;
        s.ell(x, y + Math.sin(a * 3) * 1.2, z, size * 1.4, size, size * 1.4, (xx, yy, zz) => (yy > y + size * 0.3 ? S.SNOW : S.SNOW2));
        const a2 = a + TAU / n / 2; if (i % 2) s.set(Math.cos(a2) * (r + (R() - 0.5) * 3), y + (R() - 0.5) * 4, Math.sin(a2) * (r + (R() - 0.5) * 3), S.WG);
      }
    };
    ring(18, 0, 14, 1.4); ring(13, 11, 10, 1.2);
    if (st >= 2) ring(22, -9, 16, 1.1);
    centred(P.spin, s);
    return { sy: h + 1.4, spinRate: 1.6, muzzle: [0, h + H * U, 0] };
  },

  ice_4(P, h, st) { // Absolute Zero: a cracked frozen orb held aloft by four crystal claws, shards orbiting it
    const v = vx(-12, 12, 0, 34, -12, 12), C = icePal(v), H = 22 + st * 2;
    v.fill((x, y, z) => { const m = Math.max(Math.abs(x), Math.abs(z)); if (m > 9) return null; if (y === 4) return m >= 8 ? C.SNOW2 : Math.hypot(x, z) < 4 ? C.CY : C.SNOW; if (m === 9) return mortar(Math.abs(x) === 9 ? z : x, y, 2, 5) ? C.MOR : C.GR2; return C.GR; }, -9, 9, 0, 4, -9, 9);
    v.cyl(0, 5, 0, 3, 5, C.ICE2);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      // a claw: crystal pillar arcing inward, its tip curling toward the orb
      crystal(v, sx * 7.5, 5, sz * 7.5, 2.3, Math.round(H * 0.65), iceTones(C), { lean: [sx * 0.08, sz * 0.08], vein: st >= 3 });
      const y0 = 5 + Math.round(H * 0.55);
      v.path([[sx * 8.5, y0, sz * 8.5], [sx * 8.4, y0 + 5, sz * 8.4], [sx * 6.5, y0 + 9, sz * 6.5], [sx * 4.5, y0 + 10, sz * 4.5]], 1.6, 0.6, (x, y) => ((x + y) % 3 === 0 ? C.ICE1 : C.ICE2));
      v.set(sx * 4.5, y0 + 10, sz * 4.5, C.CY);
    }
    onTop(P.base, h, v);
    const f = vx(-9, 9, -9, 9, -9, 9), F = icePal(f), r = 5.6 + st * 0.4;
    f.ell(0, 0, 0, r, r, r, (x, y, z) => {
      const L = Math.hypot(x, y, z) || 1, n = vnoise(x / L * 2.2 + 4, y / L * 2.2, z / L * 2.2);
      if (Math.abs(n - 0.5) < 0.05) return F.CY2;                                   // glowing cracks
      const fct = h3(Math.round(x / L * 2), Math.round(y / L * 2), Math.round(z / L * 2));   // facets
      return fct < 0.3 ? F.ICE1 : fct < 0.6 ? F.ICE2 : fct < 0.85 ? F.ICE2B : F.ICE3;
    });
    centred(P.float, f);
    const s = vx(-22, 22, -20, 20, -22, 22), S = icePal(s);
    const shard = (x, y, z) => { s.set(x, y, z, S.ICE2); s.set(x, y + 1, z, S.ICE1); s.set(x, y - 1, z, S.ICE3); s.set(x, y + 2, z, S.CY); s.set(x + 1, y, z, S.ICE2B); };
    for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; shard(Math.cos(a) * 18, 0, Math.sin(a) * 18); }
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; shard(Math.cos(a) * 15, Math.sin(a) * 15, 0); }
    if (st >= 2) for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU + 0.26; shard(0, Math.sin(a) * 16, Math.cos(a) * 16); }
    centred(P.spin, s);
    return { fy: h + 2.0, sy: h + 2.0, spinRate: 1.1, bob: 0.12, muzzle: [0, h + 2.0, 0] };
  },
};

// ===========================================================================
// NATURE and STORM
// ===========================================================================
function naturePal(v) {
  return {
    ST: v.pal("#7a7a6a", 0, 0.08), ST2: v.pal("#8f8f7c", 0, 0.08), STD: v.pal("#5e5e52", 0, 0.08), MOR: v.pal("#4a4a40", 0, 0.05),
    MOSS: v.pal("#5f8a3a", 0, 0.1), MOSS2: v.pal("#71a044", 0, 0.1), MOSSD: v.pal("#46702c", 0, 0.1),
    LEAF: v.pal("#4f9a45", 0, 0.1), LEAF2: v.pal("#5fae50", 0, 0.1), LEAF3: v.pal("#78c25e", 0, 0.08), LEAFD: v.pal("#3a7834", 0, 0.1),
    BARK: v.pal("#5a4228", 0, 0.09), BARK2: v.pal("#6e5133", 0, 0.09), BARKD: v.pal("#3e2c1c", 0, 0.08), THORN: v.pal("#d2c290", 0, 0.05),
    CREAM: v.pal("#e8dcc0", 0, 0.05), CREAM2: v.pal("#f4ead4", 0, 0.04), CAP: v.pal("#b8743a", 0, 0.07), CAP2: v.pal("#d08848", 0, 0.06), CAP3: v.pal("#e2a464", 0, 0.05),
    PINK: v.pal("#c94a6a", 0, 0.06), PINK2: v.pal("#e46a86", 0, 0.05), RED: v.pal("#d9483a", 0, 0.05), FLOW: v.pal("#ffd2e6", 0, 0.03), YEL: v.pal("#ffe27a", 0, 0.03),
    G1: v.pal("#73d35f", 1.4, 0.06), G2: v.pal("#9cff7a", 1.6, 0.05), G3: v.pal("#d6ffc4", 1.9, 0.03),
  };
}
const leafTones = (C) => [C.LEAF3, C.LEAF2, C.LEAF, C.LEAFD, C.LEAF3, C.G2];
function stormPal(v) {
  return {
    SL: v.pal("#3a4060", 0, 0.07), SL2: v.pal("#4a5274", 0, 0.07), SLH: v.pal("#626b92", 0, 0.06), SLD: v.pal("#2a2f48", 0, 0.06), MOR: v.pal("#22263a", 0, 0.05),
    STEEL: v.pal("#8a92b0", 0, 0.05), STEELH: v.pal("#c0c7dc", 0, 0.04), STEELD: v.pal("#5a6282", 0, 0.05),
    CU: v.pal("#c98a4a", 0, 0.05), CUH: v.pal("#eab070", 0, 0.04), CUD: v.pal("#8a5a30", 0, 0.05), CER: v.pal("#e8e4f2", 0, 0.03),
    CL: v.pal("#5a6080", 0, 0.06), CL2: v.pal("#727a9c", 0, 0.06), CL3: v.pal("#8d94b4", 0, 0.05), CLD: v.pal("#41466a", 0, 0.06),
    V1: v.pal("#b98cff", 1.45, 0.06), V2: v.pal("#c77dff", 1.6, 0.05), V3: v.pal("#ecd1ff", 1.9, 0.03), VW: v.pal("#f6ecff", 2.1, 0.02),
  };
}
const stormTones = (C) => [v_(C, "a"), v_(C, "b"), v_(C, "c"), v_(C, "d"), v_(C, "e"), C.V3];
function v_(C, k) { return C["CR" + k]; }
function stormCrystalPal(v, C) { Object.assign(C, { CRa: v.pal("#c9a2ff", 0, 0.03), CRb: v.pal("#9a6cf0", 0, 0.04), CRc: v.pal("#8458e0", 0, 0.04), CRd: v.pal("#5a3cb0", 0, 0.05), CRe: v.pal("#dcc4ff", 0, 0.03) }); return C; }
// a zig-zag lightning bolt from a to b (glowing)
function bolt(v, a, b, seed, segs, jag, p1, p2) {
  const R = rng(seed), pts = [a];
  for (let i = 1; i < segs; i++) { const t = i / segs; pts.push([a[0] + (b[0] - a[0]) * t + (R() - 0.5) * jag * 2, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t + (R() - 0.5) * jag * 2]); }
  pts.push(b);
  v.path(pts, 0.75, 0.5, (x, y, z) => (h3(x, y, z) < 0.5 ? p1 : p2));
}
// a double diamond (bipyramid) crystal centred at c
function bipyr(v, c, r, H, tones) {
  v.fill((x, y, z) => {
    const dy = y - c[1], t = Math.abs(dy) / H, rr = r * (1 - t);
    const dx = x - c[0], dz = z - c[2];
    if (t > 1 || Math.abs(dx) + Math.abs(dz) > rr + 0.35) return null;
    if (t > 0.85) return tones[5];
    if (Math.abs(Math.abs(dx) - Math.abs(dz)) > rr - 0.9 && rr > 1.5) return tones[4];
    return dx >= 0 ? (dz >= 0 ? tones[0] : tones[2]) : (dz >= 0 ? tones[1] : tones[3]);
  }, c[0] - r - 1, c[0] + r + 1, c[1] - H, c[1] + H, c[2] - r - 1, c[2] + r + 1);
}

Object.assign(VOX_PLINTH, {
  nature(p, st) {
    const v = vx(-19, 19, 0, 22, -19, 19), C = naturePal(v);
    const top = st >= 1 ? 7 : 3;
    const course = (half, y0, y1, isTop) => v.fill((x, y, z) => {
      const ax = Math.abs(x), az = Math.abs(z), oct = half * 1.42;
      if (ax > half || az > half || ax + az > oct) return null;
      const edge = ax === half || az === half || ax + az > oct - 1;
      const mossy = vnoise(x * 0.3, y * 0.5, z * 0.3) > 0.55 - (y - y0) * 0.06;
      if (edge && y < y1) return mossy && y >= y1 - 2 ? C.MOSSD : mortar(ax >= az ? z : x, y - y0, 2, 5) ? C.MOR : h3(x, y, z) < 0.3 ? C.STD : C.ST;
      if (y < y1) return C.STD;
      if (!isTop) return edge ? C.MOSS : C.ST2;
      if (edge) return mossy ? C.MOSS2 : C.ST2;
      // flagstones in a bed of moss
      const fx = Math.floor((x + 40) / 4), fz = Math.floor((z + 40 + (fx & 1) * 2) / 4);
      if ((x + 40) % 4 === 0 || (z + 40 + (fx & 1) * 2) % 4 === 0) return vnoise(x * 0.4, 2, z * 0.4) > 0.4 ? C.MOSS : C.MOSSD;
      return h3(fx, 1, fz) < 0.3 ? C.MOSS2 : h3(fx, 2, fz) < 0.5 ? C.ST : C.ST2;
    }, -half, half, y0, y1, -half, half);
    course(17, 0, 3, st < 1);
    if (st >= 1) course(13, 4, 7, true);
    // roots crawling over the edge
    const R = rng(3);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.4, r0 = st >= 1 ? 12 : 9;
      v.path([[Math.cos(a) * r0, top + 1, Math.sin(a) * r0], [Math.cos(a + 0.15) * 15, top + 0.5, Math.sin(a + 0.15) * 15], [Math.cos(a + 0.2) * 18.5, 2, Math.sin(a + 0.2) * 18.5], [Math.cos(a + 0.22) * 19, 0, Math.sin(a + 0.22) * 19]], 1.1, 0.7, i % 2 ? C.BARK : C.BARK2);
    }
    // a few flowers and toadstools
    for (let i = 0; i < 8; i++) {
      const a = R() * TAU, d = (st >= 1 ? 14.5 : 12) + R() * 2, x = Math.round(Math.cos(a) * d), z = Math.round(Math.sin(a) * d), y = (st >= 1 && d < 14 ? 8 : 4);
      if (i % 3 === 0) { v.set(x, y, z, C.CREAM); v.set(x, y + 1, z, C.RED); v.set(x + 1, y + 1, z, C.RED); }
      else { v.set(x, y, z, C.LEAF); v.set(x, y + 1, z, i % 2 ? C.FLOW : C.YEL); }
    }
    // corner stones sprouting leaf crystals
    const H = st >= 2 ? 10 : 6;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const cx = sx * 12, cz = sz * 12;
      v.box(cx - 1, top + 1, cz - 1, cx + 1, top + 2, cz + 1, (x, y) => (y === top + 2 ? C.MOSS : C.ST2));
      crystal(v, cx, top + 3, cz, 1.4, H, leafTones(C), { lean: [sx * 0.08, sz * 0.08] });
    }
    v.emit(p, 0, U / 2, 0, MERGE);
    return (top + 1) * U;
  },
  storm(p, st) {
    const v = vx(-18, 18, 0, 30, -18, 18), C = stormPal(v);
    const top = st >= 1 ? 7 : 3;
    const course = (half, y0, y1, isTop) => v.fill((x, y, z) => {
      const ax = Math.abs(x), az = Math.abs(z), m = Math.max(ax, az);
      if (m > half || (ax === half && az === half && y === y1)) return null;
      if (m === half) { if (y === y1) return C.STEEL; const al = ax === half ? z : x; return Math.abs(al) <= 1 && y === y0 + 1 ? C.V1 : mortar(al, y - y0, 2, 7) ? C.MOR : C.SL2; }
      if (y < y1) return C.SL;
      if (!isTop) return m >= half - 1 ? C.SLH : C.SL2;
      // glowing conduits running from the edges to the centre
      if ((ax <= 0.5 || az <= 0.5) && m < half - 2) return m % 4 === 0 ? C.STEELD : C.V1;
      if (ax === az && m < half - 2 && m > 3) return C.SLD;
      return m >= half - 1 ? C.SLH : (Math.floor(x / 3) + Math.floor(z / 3)) & 1 ? C.SL2 : C.SL;
    }, -half, half, y0, y1, -half, half);
    course(17, 0, 3, st < 1);
    if (st >= 1) course(13, 4, 7, true);
    const rh = st >= 2 ? 18 : 10;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const cx = sx * 15, cz = sz * 15;
      v.box(cx - 1, 4, cz - 1, cx + 1, 5, cz + 1, C.SLH);
      v.box(cx, 6, cz, cx, 5 + rh, cz, C.STEEL);
      for (let y = 8; y < 5 + rh - 1; y += 3) v.box(cx - 1, y, cz - 1, cx + 1, y, cz + 1, (x, yy, z) => (x === cx && z === cz ? C.STEEL : C.CU));
      v.set(cx, 6 + rh, cz, C.V3);
    }
    v.emit(p, 0, U / 2, 0, MERGE);
    return (top + 1) * U;
  },
});

Object.assign(VOX_HEADS, {
  // ===== NATURE ============================================================
  nature_0(P, h, st) { // Thorn Tower: a braided cone of thorny vines crowned with a leaf crystal
    const H = 30, v = vx(-13, 13, 0, H + 20, -13, 13), C = naturePal(v);
    v.fill((x, y, z) => {
      const t = y / H, r = 9.5 - t * 6.5, d = Math.hypot(x, z);
      if (d > r || d < r - 2.6) return null;
      const s = (((Math.atan2(z, x) / TAU) * 4 + y * 0.09) % 1 + 1) % 1, s2 = (((Math.atan2(z, x) / TAU) * -4 + y * 0.09) % 1 + 1) % 1;
      if (s < 0.28) return h3(x, y, z) < 0.3 ? C.BARK2 : C.BARK;
      if (s2 < 0.28) return C.MOSSD;
      return vnoise(x * 0.4, y * 0.4, z * 0.4) > 0.5 ? C.LEAF : C.MOSS;
    }, -10, 10, 0, H, -10, 10);
    const R = rng(9), n = 16 + st * 4;
    for (let i = 0; i < n; i++) {
      const y = 2 + R() * (H - 4), a = R() * TAU, r = 9.5 - (y / H) * 6.5, L = 3 + R() * 2;
      const o = [Math.cos(a) * r, y, Math.sin(a) * r]; v.cap(o, [o[0] + Math.cos(a) * L, y + L * 0.6, o[2] + Math.sin(a) * L], 0.8, C.THORN, 0.3);
    }
    for (let i = 0; i < 10; i++) { const y = 3 + R() * (H - 6), a = R() * TAU, r = 9.8 - (y / H) * 6.5; v.ell(Math.cos(a) * (r + 0.6), y, Math.sin(a) * (r + 0.6), 1.6, 0.8, 1.6, C.LEAF3); }
    crystal(v, 0, H - 2, 0, 3.4 + st * 0.3, 13 + st * 2, leafTones(C), { vein: true });
    if (st >= 2) for (const s of [-1, 1]) crystal(v, s * 6, 14, 0, 1.8, 8, leafTones(C), { lean: [s * 0.35, 0] });
    if (st >= 3) for (const s of [-1, 1]) crystal(v, 0, 10, s * 7, 1.6, 7, leafTones(C), { lean: [0, s * 0.4] });
    onTop(P.base, h, v);
    return { muzzle: [0, h + (H + 12) * U, 0] };
  },

  nature_1(P, h, st) { // Spore Tower: a giant spotted mushroom on a vine-wrapped stem, glowing spores drifting off it
    const v = vx(-17, 17, 0, 36, -17, 17), C = naturePal(v), SH = 22, R0 = 12 + st;
    v.cyl(0, 0, 0, 4.2, 2, (x, y, z) => (Math.hypot(x, z) > 3.4 ? C.CREAM : C.CREAM2));
    v.fill((x, y, z) => { const r = 3.4 - y * 0.03 + (y > SH - 5 ? (y - SH + 5) * 0.35 : 0), d = Math.hypot(x, z); if (d > r) return null; const k = Math.round(Math.atan2(z, x) / (TAU / 12)); return (k & 1) && d > r - 0.8 ? C.CREAM : C.CREAM2; }, -6, 6, 3, SH, -6, 6);
    // a ragged ring (annulus) part-way up and vines spiralling the stem
    v.fill((x, y, z) => { const d = Math.hypot(x, z); return d > 3 && d < 5.4 - (y - 13) * 0.6 && h3(x, 1, z) > 0.15 ? C.CREAM : null; }, -6, 6, 13, 14, -6, 6);
    for (const ph of [0, Math.PI]) { const pts = []; for (let y = 1; y <= SH - 2; y += 2) pts.push([Math.cos(y * 0.35 + ph) * 3.8, y, Math.sin(y * 0.35 + ph) * 3.8]); v.path(pts, 0.8, 0.7, C.MOSSD); }
    // the cap, with gills underneath
    v.fill((x, y, z) => {
      const d = Math.hypot(x, z), yy = y - SH, hh = 9 * Math.sqrt(Math.max(0, 1 - (d / R0) ** 2));
      if (d > R0 || yy > hh || yy < 0) return null;
      if (yy < 1.5) return d > R0 - 1.5 ? C.CAP : (Math.round(Math.atan2(z, x) / (TAU / 40)) & 1 ? C.CREAM : C.CREAM2);
      const sp = vnoise(x * 0.35, y * 0.35, z * 0.35);
      if (sp > 0.68 && yy > hh - 1.5) return C.CREAM2;
      return yy > hh - 1.5 && d < R0 * 0.55 ? C.CAP3 : yy > hh - 1.5 ? C.CAP2 : C.CAP;
    }, -R0, R0, SH, SH + 10, -R0, R0);
    // glowing toadstools round the foot
    for (let i = 0; i < 5 + st; i++) { const a = i * 1.3 + 0.4, d = 7 + (i % 3) * 1.5, x = Math.cos(a) * d, z = Math.sin(a) * d; v.box(x, 0, z, x, 1 + (i % 2), z, C.CREAM); v.ell(x, 2 + (i % 2), z, 1.6, 0.9, 1.6, i % 2 ? C.G1 : C.G2); }
    onTop(P.base, h, v);
    const f = vx(-14, 14, -2, 12, -14, 14), F = naturePal(f), R = rng(21);
    for (let i = 0; i < 9 + st * 2; i++) { const a = (i / (9 + st * 2)) * TAU + R() * 0.5, d = 6 + R() * 7, y = R() * 9; f.ell(Math.cos(a) * d, y, Math.sin(a) * d, 0.9, 0.9, 0.9, R() < 0.5 ? F.G2 : F.G3); }
    centred(P.float, f);
    return { fy: h + 3.0, bob: 0.2, muzzle: [0, h + 2.8, 0] };
  },

  nature_2(P, h, st) { // Bramble Tower: two braided vines arching round a glowing seed-heart
    const v = vx(-16, 16, 0, 34, -10, 10), C = naturePal(v), AH = 24;
    v.box(-13, 0, -4, -8, 3, 4, (x, y, z) => (y === 3 ? C.MOSS : C.ST)); v.box(8, 0, -4, 13, 3, 4, (x, y, z) => (y === 3 ? C.MOSS : C.ST));
    for (const [ph, pal] of [[0, C.BARK], [Math.PI, C.BARK2], [Math.PI / 2, C.MOSSD]]) {
      const pts = [];
      for (let i = 0; i <= 40; i++) {
        const a = Math.PI * (i / 40), cx = Math.cos(a) * 10.5, cy = 2 + Math.sin(a) * AH, tw = i * 0.75 + ph, rr = ph === Math.PI / 2 ? 1.2 : 1.8;
        pts.push([cx + Math.cos(tw) * rr * Math.sin(a), cy + Math.cos(tw) * rr * Math.cos(a) * 0.3, Math.sin(tw) * rr]);
      }
      v.path(pts, ph === Math.PI / 2 ? 0.8 : 1.5, ph === Math.PI / 2 ? 0.8 : 1.3, pal);
    }
    const R = rng(12);
    for (let i = 0; i < 18; i++) {
      const a = Math.PI * R(), cx = Math.cos(a) * 10.5, cy = 2 + Math.sin(a) * AH, o = R() * TAU;
      if (i % 2) v.cap([cx, cy, 0], [cx + Math.cos(o) * 4, cy + Math.sin(o) * 2 + 1, Math.sin(o) * 3.5], 0.7, C.THORN, 0.3);
      else v.ell(cx + Math.cos(o) * 2.2, cy + 1, Math.sin(o) * 2.2, 1.8, 0.8, 1.4, i % 4 ? C.LEAF2 : C.LEAF3);
    }
    if (st >= 1) for (let i = 0; i < 6; i++) { const a = 0.4 + i * 0.47, x = Math.cos(a) * 10.5, y = 2 + Math.sin(a) * AH; v.set(x, y + 2.5, 2, C.FLOW); v.set(x, y + 2.5, 3, C.YEL); }
    if (st >= 2) v.ell(0, AH + 3, 0, 8, 3.5, 6, (x, y, z) => (vnoise(x * 0.4, y * 0.4, z * 0.4) > 0.55 ? C.LEAF3 : y > AH + 4 ? C.LEAF2 : C.LEAF));
    onTop(P.base, h, v);
    // the heart: a green crystal seed in a little leaf cradle
    const f = vx(-6, 6, -7, 7, -6, 6), F = naturePal(f);
    bipyr(f, [0, 0, 0], 3.2 + st * 0.3, 5.5 + st * 0.4, [F.G2, F.G1, F.G1, F.LEAF2, F.G3, F.G3]);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.78; f.cap([0, -4, 0], [Math.cos(a) * 4, -2, Math.sin(a) * 4], 0.9, F.LEAF, 0.5); }
    centred(P.float, f);
    return { fy: h + 1.2, bob: 0.1, muzzle: [0, h + 1.2, 0.3] };
  },

  nature_3(P, h, st) { // Venom Tower: a carnivorous plant on a curling stalk, jaws open over a pool of venom
    const v = vx(-17, 17, 0, 22, -17, 17), C = naturePal(v);
    // splayed leaves on the plinth
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.3, L = 12 + (i % 2) * 3;
      v.fill((x, y, z) => {
        const u = x * Math.cos(a) + z * Math.sin(a), w = -x * Math.sin(a) + z * Math.cos(a);
        if (u < 2 || u > L) return null;
        const half = Math.sin(((u - 2) / (L - 2)) * Math.PI) * 3.2, lift = Math.round(((u - 2) / L) ** 2 * 3);
        if (Math.abs(w) > half || y !== lift + (Math.abs(w) < 0.6 ? 1 : 0)) return null;
        return Math.abs(w) < 0.6 ? C.LEAF3 : Math.abs(w) > half - 1 ? C.LEAFD : i % 2 ? C.LEAF : C.LEAF2;
      }, -L, L, 0, 5, -L, L);
    }
    // the stalk
    v.path([[0, 0, 0], [0.5, 6, -1], [-0.5, 12, 0.5], [0, 19, 0]], 3.2, 2.2, (x, y, z) => ((y + Math.round(Math.atan2(z, x) * 2)) % 5 === 0 ? C.MOSSD : C.MOSS));
    v.cyl(0, 0, 0, 4.5, 1, C.MOSSD);
    onTop(P.base, h, v);
    // the head (aims): two jaw shells, red inside, cream teeth along the rims, venom pooled in the lower jaw
    const a = vx(-12, 12, -11, 13, -10, 17), A = naturePal(a);
    const jaw = (open, upper) => pitched(a, open, (X, Y, Z) => {
      const e = (X / 8.5) ** 2 + (Y / 5) ** 2 + ((Z - 4) / 9.5) ** 2, ei = (X / 6.6) ** 2 + (Y / 3.2) ** 2 + ((Z - 4) / 7.6) ** 2;
      if ((upper ? Y < 0 : Y > 0) || e > 1) return null;
      if (ei < 1) return 0;
      if (ei < 1.25 || Math.abs(Y) < 0.6) return upper ? A.PINK : A.PINK2;                     // the red lining and lips
      return Math.abs(X) < 1 && upper ? A.LEAF3 : e > 0.8 && Math.round(Z) % 5 === 0 ? A.LEAFD : upper ? A.LEAF2 : A.LEAF;
    }, [-12, 12, -11, 13, -10, 17]);
    jaw(-0.5, true); jaw(0.18, false);
    // teeth along each jaw's rim, pointing across the gape (frame -> voxel: y = Y cos + Z sin, z = Z cos - Y sin)
    for (const [open, sgn] of [[-0.5, 1], [0.18, -1]]) {
      const sn = Math.sin(open), cs = Math.cos(open), toV = (X, Y, Z) => [X, Y * cs + Z * sn, Z * cs - Y * sn];
      for (let i = 0; i <= 10; i++) {
        const t = (i / 10) * Math.PI, X = -Math.cos(t) * 7.4, Z = 4 + Math.sin(t) * 8.4;
        if (Z < 6) continue;
        a.cap(toV(X, 0, Z), toV(X * 0.92, -sgn * 2.4, Z - 0.3), 0.75, A.CREAM2, 0.3);
      }
    }
    a.ell(0, -1.8, 6, 4.8, 1.4, 6, (x, y, z) => (y > -1.2 ? A.G2 : A.G1));
    a.cap([2, -4, 12], [2, -9, 12.5], 0.8, A.G1, 0.5); a.set(2, -10, 12.5, A.G3);
    if (st >= 2) for (const s of [-1, 1]) a.fill((x, y, z) => { const u = x * s; return u > 6 && u < 13 && Math.abs(y + 1 - (u - 6) * 0.3) < 0.6 && Math.abs(z) < 3.5 - (u - 6) * 0.4 ? A.LEAF2 : null; }, -14, 14, -3, 3, -4, 4);
    centred(P.aim, a);
    return { ay: h + 1.6, muzzle: [0, 0.2, 0.9] };
  },

  nature_4(P, h, st) { // World Tree: an ancient tree with a glowing seed set in its trunk
    const H = Math.round((2.2 + st * 0.3) / U), v = vx(-18, 18, 0, H + 26, -18, 18), C = naturePal(v);
    // the trunk, ridged bark flaring into roots
    v.fill((x, y, z) => {
      const d = Math.hypot(x, z), a = Math.atan2(z, x), r = 5 + Math.max(0, 4 - y) * 1.2 + Math.sin(a * 5 + y * 0.15) * 0.6;
      if (d > r) return null;
      if (z > 3 && Math.abs(x) <= 2 && Math.abs(y - H * 0.45) <= 2.5) return z > 4 ? 0 : C.G2;   // the seed niche
      return (Math.round(a * 5 / TAU * 2 + y * 0.12) & 1) ? C.BARK : h3(x, y, z) < 0.2 ? C.BARKD : C.BARK2;
    }, -10, 10, 0, H + 2, -10, 10);
    v.set(0, H * 0.45, 4, C.G3); v.set(0, H * 0.45 + 1, 4, C.G3);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.2; v.path([[Math.cos(a) * 4, 4, Math.sin(a) * 4], [Math.cos(a) * 9, 1.5, Math.sin(a) * 9], [Math.cos(a + 0.1) * 14, 0, Math.sin(a + 0.1) * 14]], 2.0, 0.8, i % 2 ? C.BARK : C.BARK2); }
    // branches
    const BR = [[-1, 0.3], [1, -0.2], [0.2, 1], [-0.3, -1]];
    for (const [bx, bz] of BR) v.path([[0, H - 6, 0], [bx * 5, H - 1, bz * 5], [bx * 9, H + 3, bz * 9]], 1.8, 1.0, C.BARK2);
    // canopy: overlapping leaf clumps
    const R = rng(4), clumps = [[0, H + 8, 0, 11, 6, 11], ...BR.map(([bx, bz]) => [bx * 9, H + 4, bz * 9, 6.5, 4.5, 6.5]), [0, H + 14, 0, 7, 4.5, 7]];
    for (const [cx, cy, cz, rx, ry, rz] of clumps) v.fill((x, y, z) => {
      const e = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2 + (vnoise(x * 0.35, y * 0.35, z * 0.35) - 0.5) * 0.9;
      if (e > 1) return null;
      const n = vnoise(x * 0.25 + 7, y * 0.25, z * 0.25);
      return y > cy + ry * 0.35 ? (n > 0.55 ? C.LEAF3 : C.LEAF2) : y < cy - ry * 0.3 ? C.LEAFD : n > 0.5 ? C.LEAF2 : C.LEAF;
    }, cx - rx - 1, cx + rx + 1, cy - ry - 1, cy + ry + 1, cz - rz - 1, cz + rz + 1);
    if (st >= 2) for (let i = 0; i < 14; i++) { const a = R() * TAU, d = 6 + R() * 6; v.set(Math.cos(a) * d, H + 6 + R() * 8, Math.sin(a) * d + 0, i % 2 ? C.FLOW : C.G2); }
    onTop(P.base, h, v);
    const f = vx(-22, 22, -6, 6, -22, 22), F = naturePal(f);
    for (let i = 0; i < 8 + st * 2; i++) { const a = (i / (8 + st * 2)) * TAU, d = 17 + (i % 3) * 2; f.set(Math.cos(a) * d, Math.sin(i * 2) * 4, Math.sin(a) * d, i % 2 ? F.G2 : F.G3); }
    centred(P.float, f);
    return { fy: h + H * U + 1.0, bob: 0.25, muzzle: [0, h + H * 0.45 * U, 0.6] };
  },

  // ===== STORM =============================================================
  storm_0(P, h, st) { // Spark Tower: a slate pedestal with an insulated lightning rod and a crackling ball
    const top = Math.round((3.0 + st * 0.3) / U), v = vx(-10, 10, 0, top, -10, 10), C = stormPal(v);
    v.fill((x, y, z) => { const m = Math.max(Math.abs(x), Math.abs(z)), half = y < 2 ? 7 : 6; if (m > half) return null; if (y === 2 || y === 9) return C.CU; if (m === half) return mortar(Math.abs(x) === half ? z : x, y, 3, 4) ? C.MOR : C.SL2; return C.SL; }, -7, 7, 0, 9, -7, 7);
    for (const [x, z] of [[0, 6], [0, -6], [6, 0], [-6, 0]]) v.box(x - (x ? 0 : 1), 4, z - (z ? 0 : 1), x + (x ? 0 : 1), 6, z + (z ? 0 : 1), C.V1);
    v.cyl(0, 10, 0, 1.6, top - 4, C.STEEL);
    for (let i = 0; i < 3 + Math.min(st, 2); i++) { const y = 13 + i * 5, r = 4.2 - i * 0.6; v.cyl(0, y, 0, r, y, C.CER); v.cyl(0, y + 1, 0, r - 0.8, y + 1, C.CER); v.cyl(0, y - 1, 0, r - 1.2, y - 1, C.STEELH); }
    v.cyl(0, top - 3, 0, 2.6, top - 3, C.CU);
    onTop(P.base, h, v);
    const f = vx(-8, 8, -8, 8, -8, 8), F = stormPal(f), r = 3.4 + st * 0.3;
    f.ell(0, 0, 0, r, r, r, (x, y, z) => (Math.hypot(x, y, z) < r - 1.2 ? F.VW : h3(x, y, z) < 0.3 ? F.V3 : F.V2));
    for (let i = 0; i < 5; i++) { const a = i * 1.26, e = i * 0.7; bolt(f, [Math.cos(a) * r, Math.sin(e) * 2, Math.sin(a) * r], [Math.cos(a) * 7.5, Math.sin(e) * 4, Math.sin(a) * 7.5], 50 + i, 3, 1, F.V3, F.V1); }
    centred(P.float, f);
    return { fy: h + 3.0 + st * 0.3, bob: 0.05, muzzle: [0, h + 3.0 + st * 0.3, 0] };
  },

  storm_1(P, h, st) { // Tesla Tower: a stack of copper coils round a slate core, a charge orb above
    const n = 5 + st, top = 9 + n * 5, v = vx(-12, 12, 0, top + 3, -12, 12), C = stormPal(v);
    v.fill((x, y, z) => { const ax = Math.abs(x), az = Math.abs(z); if (ax > 9 || az > 9 || ax + az > 14) return null; if (y === 5) return C.STEEL; return (ax === 9 || az === 9 || ax + az === 14) ? (mortar(ax === 9 ? z : x, y, 3, 4) ? C.MOR : C.SL2) : C.SL; }, -9, 9, 0, 5, -9, 9);
    v.cyl(0, 6, 0, 3.2, top, (x, y, z) => ((y + Math.round(Math.atan2(z, x) * 2)) % 4 === 0 ? C.SLD : C.SL2));
    for (let i = 0; i < n; i++) {
      const y = 8 + i * 5, r = 7 - i * 0.25;
      v.fill((x, yy, z) => { const d = Math.hypot(x, z); return d <= r && d > 3 ? (yy === y ? (d > r - 1 ? C.CUH : C.CU) : d > r - 1.5 ? C.CUD : null) : null; }, -8, 8, y, y + 1, -8, 8);
    }
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; v.box(Math.cos(a) * 3.5, 6, Math.sin(a) * 3.5, Math.cos(a) * 3.5, top - 1, Math.sin(a) * 3.5, C.V1); }
    // the toroid
    v.fill((x, y, z) => { const d = Math.hypot(x, z), q = Math.hypot(d - 7, y - top - 1); return q <= 2 ? (y > top + 1 ? C.STEELH : C.STEEL) : null; }, -10, 10, top - 1, top + 3, -10, 10);
    onTop(P.base, h, v);
    const f = vx(-9, 9, -9, 9, -9, 9), F = stormPal(f), r = 4 + st * 0.3;
    f.ell(0, 0, 0, r, r, r, (x, y, z) => (Math.hypot(x, y, z) < r - 1.3 ? F.VW : h3(x, y, z) < 0.35 ? F.V3 : F.V2));
    for (let i = 0; i < 4; i++) { const a = i * 1.57 + 0.5; bolt(f, [Math.cos(a) * r, 0, Math.sin(a) * r], [Math.cos(a) * 8.5, -4 - i, Math.sin(a) * 8.5], 70 + i, 3, 1.2, F.V3, F.V2); }
    centred(P.float, f);
    return { fy: h + (top + 5) * U + 0.3, bob: 0.06, muzzle: [0, h + (top + 5) * U + 0.3, 0] };
  },

  storm_2(P, h, st) { // Cyclone Tower: a vented drum under a spinning funnel of wind ribbons and debris
    const v = vx(-11, 11, 0, 8, -11, 11), C = stormPal(v);
    v.fill((x, y, z) => {
      const d = Math.hypot(x, z); if (d > 10) return null;
      if (y === 7) return d > 9 ? C.STEELH : d > 6.5 ? C.STEEL : ((Math.abs(x) + 40) % 2 === 0 ? C.STEELD : C.V2);
      if (y > 7) return null;
      return d > 9 ? (y === 1 || y === 5 ? C.STEEL : (Math.round(Math.atan2(z, x) * 5) + y) % 4 === 0 ? C.MOR : C.SL2) : C.SL;
    });
    onTop(P.base, h, v);
    const s = vx(-26, 26, -2, 44, -26, 26), S = stormPal(s), WH = s.pal("#f2eeff", 0.95, 0.03), LV = s.pal("#d9c2ff", 1.1, 0.04), R = rng(8);
    for (let i = 0; i < 6 + st; i++) {
      const r = 4.4 + i * 2.75, y = i * 5.2;
      for (let k = 0; k < 3; k++) {
        const a0 = (k / 3) * TAU + i * 0.7, span = 1.2 + R() * 0.4, pts = [];
        for (let j = 0; j <= 8; j++) { const a = a0 + (j / 8) * span; pts.push([Math.cos(a) * r, y + (j / 8) * 2, Math.sin(a) * r]); }
        s.path(pts, 0.7, 0.55, i % 2 ? LV : WH);
      }
      if (i > 1) for (let k = 0; k < 2; k++) { const a = R() * TAU; s.box(Math.cos(a) * r, y + 1, Math.sin(a) * r, Math.cos(a) * r + 1, y + 2, Math.sin(a) * r, k ? S.SL2 : S.SLH); }
    }
    centred(P.spin, s);
    return { sy: h + 0.7, spinRate: 3.5, muzzle: [0, h + 2.2, 0] };
  },

  storm_3(P, h, st) { // Thunder Tower: a battlemented slate keep under its own thundercloud
    const v = vx(-12, 12, 0, 30, -12, 12), C = stormPal(v), T = 24;
    v.fill((x, y, z) => {
      const ax = Math.abs(x), az = Math.abs(z), m = Math.max(ax, az), half = y < 3 ? 10 : y > T - 3 ? 10 : 8;
      if (m > half) return null;
      if (y > T) return m === half && ((ax === half ? z : x) + 20) % 4 < 2 ? C.SLH : null;     // battlements
      if (m < half && y < T) return C.SL;
      if (y === T) return m === half ? C.SLH : C.SL2;
      const al = ax === half ? z * Math.sign(x) : -x * Math.sign(z);
      // a zig-zag lightning rune running up each face
      if (half === 8 && y > 4 && y < T - 4 && Math.abs(al - (Math.floor((y - 4) / 4) % 2 ? 1 : -1) * ((y - 4) % 4 - 1.5)) < 0.7) return C.V2;
      return mortar(al, y, 3, 5) ? C.MOR : h3(x, y, z) < 0.2 ? C.SLD : C.SL2;
    }, -10, 10, 0, T + 2, -10, 10);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) v.box(sx * 9, 3, sz * 9, sx * 9, T - 3, sz * 9, (x, y) => (y % 5 === 0 ? C.CU : C.SLH));
    onTop(P.base, h, v);
    const f = vx(-16, 16, -18, 10, -12, 12), F = stormPal(f);
    const blobs = [[0, 2, 0, 9, 4.5, 7], [-7, 1, 1, 6, 4, 5], [7, 1.5, -1, 6.5, 4, 5.5], [2, 5.5, 0, 6, 4, 5], [-3, 4.5, -2, 5, 3.5, 4]];
    if (st >= 2) blobs.push([11, 3, 2, 4.5, 3, 4], [-11, 3, -1, 4, 3, 4]);
    for (const [cx, cy, cz, rx, ry, rz] of blobs) f.fill((x, y, z) => {
      const e = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2 + (vnoise(x * 0.4, y * 0.4, z * 0.4) - 0.5) * 0.7;
      if (e > 1) return null;
      if (y < cy - ry * 0.55) return vnoise(x * 0.3, 5, z * 0.3) > 0.62 ? F.V1 : F.CLD;
      return y > cy + ry * 0.3 ? F.CL3 : y > cy - ry * 0.1 ? F.CL2 : F.CL;
    }, cx - rx - 1, cx + rx + 1, cy - ry - 1, cy + ry + 1, cz - rz - 1, cz + rz + 1);
    bolt(f, [1, -2, 1], [-2, -16, 2], 91, 5, 2, F.VW, F.V3);
    if (st >= 1) bolt(f, [-6, -2, -1], [-9, -11, 0], 92, 3, 1.5, F.V3, F.V2);
    if (st >= 3) bolt(f, [7, -2, 0], [10, -12, 1], 93, 3, 1.5, F.V3, F.V2);
    centred(P.float, f);
    return { fy: h + 3.2 + st * 0.15, bob: 0.1, muzzle: [0, h + 2.4, 0] };
  },

  storm_4(P, h, st) { // Storm Nexus: a great double-pointed crystal hung between four coil pylons, rings spinning round it
    const v = vx(-14, 14, 0, 28, -14, 14), C = stormCrystalPal(v, stormPal(v));
    v.fill((x, y, z) => { const ax = Math.abs(x), az = Math.abs(z); if (ax > 10 || az > 10 || ax + az > 15) return null; if (y === 4) return Math.hypot(x, z) < 4 ? C.V2 : ax + az > 13 ? C.STEELH : C.SL2; return (ax === 10 || az === 10 || ax + az === 15) ? (mortar(ax === 10 ? z : x, y, 2, 5) ? C.MOR : C.SL2) : C.SL; }, -10, 10, 0, 4, -10, 10);
    for (const [x, z] of [[-11, 0], [11, 0], [0, 11], [0, -11]]) {
      v.box(x - 1, 0, z - 1, x + 1, 2, z + 1, C.SLH);
      v.box(x, 3, z, x, 22, z, C.STEEL);
      for (let y = 6; y <= 18; y += 3) v.box(x - 1, y, z - 1, x + 1, y + 1, z + 1, (xx, yy, zz) => (xx === x && zz === z ? C.STEEL : yy === y ? C.CU : C.CUD));
      v.box(x, 23, z, x, 24, z, C.V3); v.set(x, 25, z, C.VW);
    }
    onTop(P.base, h, v);
    const f = vx(-8, 8, -16, 16, -8, 8), F = stormCrystalPal(f, stormPal(f));
    bipyr(f, [0, 0, 0], 5.5 + st * 0.4, 13 + st, stormTones(F));
    f.cyl(0, 0, 0, 1.5, 0, F.VW);
    centred(P.float, f);
    const s = vx(-26, 26, -26, 26, -26, 26), S = stormPal(s);
    const ring = (r, tilt, n, axisV) => { for (let i = 0; i < n; i++) { const a = (i / n) * TAU, x = Math.cos(a) * r, w = Math.sin(a) * r; const [px, py, pz] = axisV ? [x, w, 0] : [x, tilt, w]; s.set(px, py, pz, i % 6 === 0 ? S.V3 : i % 2 ? S.STEEL : S.STEELD); } };
    ring(19, 0, 48, false); ring(17, 0, 42, true);
    if (st >= 2) ring(24, 7, 56, false);
    centred(P.spin, s);
    return { fy: h + 2.8, sy: h + 2.8, spinRate: 1.4, bob: 0.15, muzzle: [0, h + 2.8, 0] };
  },
});

// ===========================================================================
// LIGHT and DARKNESS
// ===========================================================================
function lightPal(v) {
  return {
    MAR: v.pal("#efe4c2", 0, 0.05), MAR2: v.pal("#fbf1d6", 0, 0.04), MARD: v.pal("#d6c8a0", 0, 0.05), VEIN: v.pal("#c2b087", 0, 0.05), MOR: v.pal("#b8a77e", 0, 0.04),
    GOLD: v.pal("#d9b84a", 0, 0.05), GOLDH: v.pal("#f4da7c", 0, 0.04), GOLDD: v.pal("#a8862e", 0, 0.05), SKY: v.pal("#7aa8e8", 0, 0.05),
    SUN: v.pal("#ffe066", 1.55, 0.05), SUN2: v.pal("#ffc93a", 1.45, 0.05), HALO: v.pal("#fff3c0", 1.8, 0.03), WG: v.pal("#ffffff", 2.0, 0.02),
    PR: v.pal("#ff7a7a", 1.6, 0.03), PG: v.pal("#7affb0", 1.6, 0.03), PB: v.pal("#7ab4ff", 1.6, 0.03),
    GL1: v.pal("#fff8e4", 0, 0.03), GL2: v.pal("#f2e6c4", 0, 0.03), GL3: v.pal("#e2d2a6", 0, 0.03), GL4: v.pal("#cdbb8a", 0, 0.04),
  };
}
const lightTones = (C) => [C.GL1, C.GL2, C.GL3, C.GL4, C.MAR2, C.HALO];
function darkPal(v) {
  return {
    OB: v.pal("#17121f", 0, 0.08), OB2: v.pal("#221a30", 0, 0.08), OB3: v.pal("#30264a", 0, 0.07), OBH: v.pal("#463a66", 0, 0.06), VOID: v.pal("#08060c", 0, 0.04), MOR: v.pal("#0e0a14", 0, 0.04),
    BONE: v.pal("#e6dcc8", 0, 0.05), BONE2: v.pal("#cfc2a8", 0, 0.05), BONED: v.pal("#a2967e", 0, 0.05), IRON: v.pal("#4a4458", 0, 0.05), IRONH: v.pal("#7a7490", 0, 0.04),
    WOOD: v.pal("#3e2e2a", 0, 0.08), CLOTH: v.pal("#3a2e52", 0, 0.08), CLOTH2: v.pal("#4c3e6a", 0, 0.08), STEEL: v.pal("#c8c8d8", 0, 0.03), STEELD: v.pal("#8a8a9c", 0, 0.04),
    VI: v.pal("#8b6cff", 1.45, 0.06), VI2: v.pal("#a98aff", 1.65, 0.05), VL: v.pal("#cbb9ff", 1.85, 0.03), VW: v.pal("#f0e8ff", 2.05, 0.02),
  };
}
const darkTones = (C) => [C.OBH, C.OB3, C.OB2, C.OB, C.OBH, C.VI2];
const VIOLET_FLAME = ["#ffffff", "#f0e8ff", "#cbb9ff", "#b49cff", "#9a7cff", "#a98aff", "#8b6cff", "#6a4ad8", "#4a2a9a"];
// a fluted marble column with a gold base ring and capital
function column(v, C, cx, cz, y0, y1, r) {
  v.cyl(cx, y0, cz, r, y1, (x, y, z) => { const a = Math.atan2(z - cz, x - cx), d = Math.hypot(x - cx, z - cz); return d > r - 0.8 && (Math.round(a / (TAU / 12)) & 1) ? C.MARD : C.MAR; });
  v.cyl(cx, y0, cz, r + 1, y0, C.GOLD); v.cyl(cx, y1, cz, r + 1, y1, C.GOLDH); v.cyl(cx, y1 + 1, cz, r + 1.6, y1 + 1, C.MAR2);
}

Object.assign(VOX_PLINTH, {
  light(p, st) {
    const v = vx(-18, 18, 0, 24, -18, 18), C = lightPal(v);
    const top = st >= 1 ? 7 : 3;
    const course = (half, y0, y1, isTop) => v.fill((x, y, z) => {
      const ax = Math.abs(x), az = Math.abs(z), m = Math.max(ax, az);
      if (m > half) return null;
      if (m === half) { if (y === y1) return C.GOLD; const al = ax === half ? z : x; return mortar(al, y - y0, 2, 7) ? C.MOR : vnoise(al * 0.3, y * 0.5, x + z) > 0.62 ? C.VEIN : C.MAR; }
      if (y < y1) return C.MARD;
      if (!isTop) return m >= half - 1 ? C.MAR2 : C.MAR;
      // polished tiles with a gold sunburst inlaid from the centre
      const a = Math.atan2(z, x), d = Math.hypot(x, z);
      if (d > 3 && d < half - 2 && Math.abs(((a / (TAU / 8)) % 1 + 1) % 1 - 0.5) > 0.5 - 0.25 / Math.max(1, d * 0.25)) return C.GOLD;
      if (Math.abs(d - (half - 4)) < 0.5) return C.GOLDD;
      return ((x + 40) % 4 === 0 || (z + 40) % 4 === 0) ? C.MARD : (Math.floor((x + 40) / 4) + Math.floor((z + 40) / 4)) & 1 ? C.MAR2 : C.MAR;
    }, -half, half, y0, y1, -half, half);
    course(17, 0, 3, st < 1);
    if (st >= 1) course(13, 4, 7, true);
    const ch = st >= 2 ? 12 : 7;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      column(v, C, sx * 15, sz * 15, 4, 4 + ch, 1.3);
      v.set(sx * 15, 6 + ch, sz * 15, C.SUN); if (st >= 3) v.set(sx * 15, 7 + ch, sz * 15, C.WG);
    }
    v.emit(p, 0, U / 2, 0, MERGE);
    return (top + 1) * U;
  },
  darkness(p, st) {
    const v = vx(-19, 19, 0, 26, -19, 19), C = darkPal(v);
    const top = st >= 1 ? 7 : 3;
    const crack = (x, z) => Math.abs(vnoise(x * 0.18, 8.3, z * 0.18) - 0.5) < 0.03;
    const course = (half, y0, y1, isTop) => v.fill((x, y, z) => {
      const ax = Math.abs(x), az = Math.abs(z), m = Math.max(ax, az);
      if (m > half - (y === y1 && h3(x, y, z) < 0.25 ? 1 : 0)) return null;           // chipped, uneven edge
      if (m >= half - 1 && y < y1) return h3(x, y, z) < 0.3 ? C.OB3 : (y - y0) % 2 === 1 && h3(x, 0, z) < 0.15 ? C.OBH : C.OB2;
      if (y < y1) return C.OB;
      if (isTop && crack(x, z) && m < half - 2) return C.VI;
      if (isTop && Math.abs(Math.hypot(x, z) - 6.5) < 0.5) return C.VI;                  // a summoning circle
      return m >= half - 1 ? C.OBH : vnoise(x * 0.4, 1, z * 0.4) > 0.58 ? C.OB3 : C.OB2;
    }, -half, half, y0, y1, -half, half);
    course(17, 0, 3, st < 1);
    if (st >= 1) course(13, 4, 7, true);
    const H = st >= 2 ? 15 : 9;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      crystal(v, sx * 15, 4, sz * 15, 2.3, H, darkTones(C), { lean: [sx * 0.12, sz * 0.12] });
      crystal(v, sx * 15 - sx * 3, 4, sz * 15 + sz, 1.3, Math.round(H * 0.55), darkTones(C), { lean: [-sx * 0.1, sz * 0.15] });
      if (st >= 2) v.set(sx * 15 + sx, 4 + Math.round(H * 0.5), sz * 15 + sz * 2, C.VL);
    }
    v.emit(p, 0, U / 2, 0, MERGE);
    return (top + 1) * U;
  },
});

Object.assign(VOX_HEADS, {
  // ===== LIGHT =============================================================
  light_0(P, h, st) { // Beam Tower: a gold-ringed lens on a fluted marble column
    const v = vx(-8, 8, 0, 20, -8, 8), C = lightPal(v);
    v.box(-6, 0, -6, 6, 1, 6, (x, y) => (y === 1 ? C.MAR2 : C.MARD));
    column(v, C, 0, 0, 2, 15, 3.6);
    v.cyl(0, 17, 0, 6, 18, (x, y, z) => (Math.hypot(x, z) > 5 ? C.GOLDH : C.GOLD));
    onTop(P.base, h, v);
    const a = vx(-12, 12, -3, 18, -6, 6), A = lightPal(a), cy = 9;
    // a gold fork carrying the lens
    a.cyl(0, -2, 0, 2.5, 0, A.GOLD);
    for (const s of [-1, 1]) a.path([[s * 2, 0, 0], [s * 8, 2, 0], [s * 8.5, cy, 0]], 1.2, 1.0, A.GOLD);
    for (const s of [-1, 1]) a.cyl(s * 7, cy, 0, 1.4, s * 10, A.GOLDH, "x");
    // the lens: a gold ring with a glowing glass disc, a white heart
    a.fill((x, y, z) => {
      const d = Math.hypot(x, y - cy);
      if (z >= -2 && z <= 1 && d <= 7.5 && d > 6) return z === 1 && Math.round(Math.atan2(y - cy, x) / (TAU / 16)) % 2 === 0 ? A.GOLDH : A.GOLD;
      if (z === 0 && d <= 6) return d < 1.6 ? A.WG : d < 3.4 ? A.HALO : d < 5 ? A.GL2 : A.GL3;
      if (z === -1 && d <= 6) return A.GOLDD;
      return null;
    }, -8, 8, cy - 8, cy + 8, -2, 1);
    if (st >= 1) for (let i = 0; i < 8; i++) { const t = (i / 8) * TAU; a.set(Math.cos(t) * 8.5, cy + Math.sin(t) * 8.5, -1, A.GOLDH); }
    if (st >= 2) for (const s of [-1, 1]) a.path([[s * 8, cy + 6, -1], [s * 11, cy + 10, -2], [s * 10, cy + 14, -3]], 1.0, 0.5, A.GOLD);
    if (st >= 3) a.set(0, cy + 10, 0, A.WG), a.box(0, cy + 8, 0, 0, cy + 9, 0, A.GOLDH);
    centred(P.aim, a);
    return { ay: h + 1.6, muzzle: [0, 0.7, 0.3] };
  },

  light_1(P, h, st) { // Prism Tower: a floating crystal prism scattering coloured light over gold-capped posts
    const v = vx(-10, 10, 0, 18, -10, 10), C = lightPal(v);
    v.fill((x, y, z) => { const m = Math.max(Math.abs(x), Math.abs(z)); const half = 7 - y; if (m > half) return null; return y === 4 - 0 || m === half ? (y % 2 ? C.MAR2 : C.MAR) : C.MARD; }, -7, 7, 0, 4, -7, 7);
    v.cyl(0, 5, 0, 2, 5, C.GOLD); v.set(0, 6, 0, C.HALO);
    for (const [x, z] of [[-6, -6], [6, 6], [-6, 6], [6, -6]]) { v.box(x, 0, z, x, 12, z, (xx, y) => (y % 4 === 0 ? C.GOLDH : C.GOLD)); v.box(x - 1, 13, z - 1, x + 1, 13, z + 1, C.GOLD); v.set(x, 14, z, [C.PR, C.PG, C.PB, C.SUN][(x > 0) + (z > 0) * 2]); }
    onTop(P.base, h, v);
    const f = vx(-11, 11, -12, 10, -11, 11), F = lightPal(f), r = 5 + st * 0.4;
    bipyr(f, [0, 0, 0], r, r * 1.5, [f.pal("#fff2d0", 0, 0.03), f.pal("#ffc8d6", 0, 0.03), f.pal("#c4e4ff", 0, 0.03), f.pal("#c8ffdc", 0, 0.03), F.MAR2, F.HALO]);
    f.cyl(0, 0, 0, 1.2, 0, F.WG);
    for (const [c, a] of [[F.PR, 0], [F.PG, TAU / 3], [F.PB, (2 * TAU) / 3]]) f.cap([Math.cos(a) * r * 0.7, -r * 0.6, Math.sin(a) * r * 0.7], [Math.cos(a) * 10, -r * 1.3, Math.sin(a) * 10], 0.8, c, 0.5);
    centred(P.float, f);
    return { fy: h + 2.3 + st * 0.15, bob: 0.15, spinIn: "float", sy: 0, spinRate: 0.8, muzzle: [0, h + 2.3, 0] };
  },

  light_2(P, h, st) { // Sanctuary: a columned shrine with a stepped gold roof, a radiant orb over its altar
    const v = vx(-14, 14, 0, 36, -14, 14), C = lightPal(v);
    v.fill((x, y, z) => { const m = Math.max(Math.abs(x), Math.abs(z)); return m <= 12 ? (y === 1 ? (m === 12 ? C.GOLD : ((x + z) & 1 ? C.MAR2 : C.MAR)) : C.MARD) : null; }, -12, 12, 0, 1, -12, 12);
    for (const [x, z] of [[-9, -9], [9, -9], [-9, 9], [9, 9]]) column(v, C, x, z, 2, 21, 1.8);
    v.fill((x, y, z) => { const m = Math.max(Math.abs(x), Math.abs(z)); return m <= 12 ? (y === 24 ? C.GOLD : m === 12 && y === 23 && (x + z) % 3 === 0 ? C.GOLDH : C.MAR) : null; }, -12, 12, 23, 24, -12, 12);
    v.fill((x, y, z) => { const m = Math.max(Math.abs(x), Math.abs(z)), half = 10 - (y - 25) * 2; return m <= half ? (m === half ? C.GOLDH : C.GOLD) : null; }, -10, 10, 25, 28, -10, 10);
    v.box(-2, 29, -2, 2, 30, 2, C.MAR2); v.box(0, 31, 0, 0, 33, 0, C.GOLDH); v.set(0, 34, 0, C.SUN);
    // the altar
    v.box(-3, 2, -3, 3, 5, 3, (x, y, z) => (y === 5 ? C.GOLD : Math.abs(x) === 3 || Math.abs(z) === 3 ? C.MAR : C.MARD));
    v.box(-2, 6, -2, 2, 6, 2, C.MAR2);
    if (st >= 2) for (const [x, z] of [[0, -12], [0, 12], [-12, 0], [12, 0]]) v.box(x - (x ? 0 : 1), 22, z - (z ? 0 : 1), x + (x ? 0 : 1), 22, z + (z ? 0 : 1), C.SUN);
    onTop(P.base, h, v);
    const f = vx(-5, 5, -5, 5, -5, 5), F = lightPal(f), r = 3 + st * 0.3;
    f.ell(0, 0, 0, r, r, r, (x, y, z) => (Math.hypot(x, y, z) < r - 1.2 ? F.WG : F.SUN));
    centred(P.float, f);
    return { fy: h + 1.2, bob: 0.08, spinIn: "float", sy: 0, spinRate: 1, muzzle: [0, h + 1.2, 0] };
  },

  light_3(P, h, st) { // Radiance Tower: a turning sun disc of gold rays on a marble pillar
    const v = vx(-8, 8, 0, 28, -8, 8), C = lightPal(v);
    v.box(-6, 0, -6, 6, 1, 6, (x, y) => (y === 1 ? C.GOLD : C.MARD));
    column(v, C, 0, 0, 2, 23, 3.4);
    v.cyl(0, 25, 0, 4, 25, C.GOLD); v.cyl(0, 26, 0, 2.5, 26, C.GOLDH);
    onTop(P.base, h, v);
    const s = vx(-16, 16, -16, 16, -2, 2), S = lightPal(s), n = 8 + st * 2;
    s.fill((x, y, z) => {
      const d = Math.hypot(x, y), a = Math.atan2(y, x);
      if (d <= 6.5 && Math.abs(z) <= 1) return d < 2.5 ? S.WG : d < 5 ? (z === 0 ? S.HALO : S.SUN) : S.GOLDH;
      if (z !== 0 || d < 6.5) return null;
      const k = ((a / TAU) * n % 1 + 1) % 1, long = Math.round((a / TAU) * n - k) & 1, L = long ? 14 : 10.5;
      const w = (1 - (d - 6.5) / (L - 6.5)) * 0.42;
      return Math.abs(k - 0.5) < w && d <= L ? (d > L - 2 ? S.SUN : S.SUN2) : null;
    }, -15, 15, -15, 15, -1, 1);
    if (st >= 2) s.fill((x, y, z) => { const d = Math.hypot(x, y); return z === -1 && d > 6.5 && d < 8 ? S.GOLD : null; }, -9, 9, -9, 9, -1, -1);
    centred(P.spin, s);
    return { sy: h + 3.0, spinRate: 0.6, spinAxis: "z", muzzle: [0, h + 3.0, 0] };
  },

  light_4(P, h, st) { // Solar Spire: a stepped marble obelisk inlaid with suns, carrying a sun in a ring of gold blades
    const H = Math.round((3.2 + st * 0.35) / U), v = vx(-9, 9, 0, H + 8, -9, 9), C = lightPal(v);
    v.fill((x, y, z) => {
      const tier = Math.min(3, Math.floor((y / H) * 4)), half = 7 - tier * 1.5, ax = Math.abs(x), az = Math.abs(z), m = Math.max(ax, az);
      if (m > half) return null;
      const yt = y - Math.round((tier * H) / 4), band = yt === 0 || y === H - 1;
      if (band) return m >= half - 0.5 ? C.GOLD : C.MAR;
      if (m >= half - 0.5) {
        const al = ax >= az ? z : x, cy = Math.round(H / 8);
        if (Math.hypot(al, yt - cy) < 1.6 && tier < 3) return C.SUN;                 // inlaid sun glyphs
        if (Math.hypot(al, yt - cy) < 2.6 && tier < 3) return C.GOLDH;
        return ax === az ? C.MARD : C.MAR;
      }
      return C.MARD;
    }, -7, 7, 0, H - 1, -7, 7);
    for (let y = H; y < H + 6; y++) { const half = Math.round(3 - (y - H) * 0.6); v.box(-half, y, -half, half, y, half, y === H + 5 ? C.SUN : C.GOLD); }
    onTop(P.base, h, v);
    const f = vx(-7, 7, -7, 7, -7, 7), F = lightPal(f), r = 4.5 + st * 0.3;
    f.ell(0, 0, 0, r, r, r, (x, y, z) => { const d = Math.hypot(x, y, z); return d < r - 1.4 ? F.WG : vnoise(x * 0.6, y * 0.6, z * 0.6) > 0.55 ? F.SUN2 : F.SUN; });
    centred(P.float, f);
    const s = vx(-15, 15, -3, 3, -15, 15), S = lightPal(s), nb = 12;
    for (let i = 0; i < nb; i++) { const a = (i / nb) * TAU; s.cap([Math.cos(a) * 9.5, 0, Math.sin(a) * 9.5], [Math.cos(a + 0.25) * 12.5, i % 2 ? 1 : -1, Math.sin(a + 0.25) * 12.5], 1.0, i % 3 === 0 ? S.GOLDH : S.GOLD, 0.5); }
    centred(P.spin, s);
    return { fy: H * U + h + 0.9, sy: H * U + h + 0.9, spinRate: 1.2, bob: 0.1, muzzle: [0, H * U + h + 0.9, 0] };
  },

  // ===== DARKNESS ==========================================================
  darkness_0(P, h, st) { // Shadow Tower: a cracked obsidian obelisk with a great watching eye
    const v = vx(-8, 8, 0, 24, -8, 8), C = darkPal(v);
    v.fill((x, y, z) => {
      const half = 6 - Math.floor(y / 8), ax = Math.abs(x), az = Math.abs(z), m = Math.max(ax, az);
      if (m > half || (ax === half && az === half)) return null;
      if (m === half && vnoise(x * 0.35 + z * 0.35, y * 0.3, 2) > 0.7) return C.VI;
      return m === half ? (y % 8 === 7 ? C.OBH : h3(x, y, z) < 0.3 ? C.OB3 : C.OB2) : C.OB;
    }, -6, 6, 0, 21, -6, 6);
    onTop(P.base, h, v);
    const a = vx(-12, 12, -9, 14, -9, 10), A = darkPal(a);
    a.fill((x, y, z) => { const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z); if (ax > 7 || ay > 7 || az > 7 || ax + ay > 11 || ax + az > 11 || ay + az > 11) return null; return h3(x, y, z) < 0.25 ? A.OB3 : A.OB2; });
    // the eye: lids, a violet iris, a white slit pupil
    a.fill((x, y, z) => {
      const e = (x / 5.5) ** 2 + (y / 3.2) ** 2; if (e > 1) return null;
      if (z === 7) return 0;
      if (z !== 6) return null;
      const d = Math.hypot(x, y);
      return Math.abs(x) < 0.6 && Math.abs(y) < 2.4 ? A.VW : d < 2.8 ? A.VI2 : d < 3.6 ? A.VI : A.BONE;
    }, -6, 6, -4, 4, 6, 7);
    a.fill((x, y, z) => { const e = (x / 6.6) ** 2 + (y / 4.2) ** 2; return e <= 1 && e > 0.72 && z === 7 ? A.OBH : null; }, -7, 7, -5, 5, 7, 7);
    for (let i = 0; i < 4; i++) { const t = (i / 3 - 0.5) * 1.4; a.cap([Math.sin(t) * 5, 6, -1], [Math.sin(t) * 8, 12 - Math.abs(t) * 2, -3], 1.3, A.OB3, 0.4); }
    if (st >= 2) for (const s of [-1, 1]) a.path([[s * 6, 2, 0], [s * 10, 6, -1], [s * 11, 11, -3]], 1.4, 0.5, A.OBH);
    if (st >= 3) a.set(0, 10, -1, A.VL);
    centred(P.aim, a);
    return { ay: h + 2.15, muzzle: [0, 0, 0.7] };
  },

  darkness_1(P, h, st) { // Curse Tower: a horned skull on a chained totem, burning with violet fire
    const v = vx(-14, 14, 0, 34, -10, 12), C = darkPal(v);
    v.fill((x, y, z) => { const m = Math.max(Math.abs(x), Math.abs(z)), half = y < 3 ? 6 : 4; if (m > half) return null; return y === 2 || y === 10 || y === 16 ? C.IRON : m === half ? ((y + x + z) % 5 === 0 ? C.OB3 : C.WOOD) : C.OB; }, -6, 6, 0, 18, -6, 6);
    for (const s of [-1, 1]) v.path([[s * 4.5, 16, 4.5], [s * 7, 10, 3], [s * 5, 5, 5], [s * 4.5, 2, 4.5]], 0.7, 0.7, (x, y) => (y % 2 ? C.IRON : C.IRONH));
    // the skull
    const sy = 23;
    v.ell(0, sy, 0, 6.5, 6, 6.5, (x, y, z) => (y > sy + 3 ? C.BONE : z > 3 ? C.BONE : C.BONE2));
    v.box(-4, sy - 7, -2, 4, sy - 4, 5, (x, y, z) => (y === sy - 5 && z > 3 && (x & 1) ? C.BONED : C.BONE2));           // jaw
    for (const s of [-1, 1]) { v.ell(s * 2.6, sy, 5.6, 1.7, 1.6, 1.6, 0); v.set(s * 2.6, sy, 4.6, C.VI2); v.set(s * 2.6, sy, 5, C.VL); }
    v.box(-0.5, sy - 3, 6, 0.5, sy - 2, 6, 0);
    for (let x = -3; x <= 3; x++) v.box(x, sy - 4, 5, x, sy - 4, 5, x & 1 ? C.BONE : C.BONED);
    for (const s of [-1, 1]) v.path([[s * 5, sy + 3, -1], [s * 9, sy + 4, -3], [s * 11.5, sy + 1, -2.5], [s * 11, sy - 3, 0], [s * 9, sy - 4, 2]], 1.9, 0.6, (x, y, z) => ((Math.round(Math.hypot(x, y - sy)) & 1) ? C.BONED : C.BONE2));
    if (st >= 2) for (const s of [-1, 1]) v.set(s * 9, sy - 5, 2, C.VI2);
    onTop(P.base, h, v);
    const f = vx(-13, 13, 0, 32, -13, 13);
    flame(f, 0, 0.42 + st * 0.07, 61, VIOLET_FLAME);
    centred(P.float, f);
    return { fy: h + (sy + 5) * U, bob: 0.06, muzzle: [0, h + 2.1, 0.5] };
  },

  darkness_2(P, h, st) { // Void Tower: a black sphere over obsidian shards, an accretion ring of violet matter
    const v = vx(-12, 12, 0, 20, -12, 12), C = darkPal(v);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) crystal(v, sx * 8, 0, sz * 8, 2.2, 13 + st, darkTones(C), { lean: [-sx * 0.2, -sz * 0.2] });
    v.cyl(0, 0, 0, 4, 1, C.OB2); v.set(0, 2, 0, C.VI);
    onTop(P.base, h, v);
    const f = vx(-8, 8, -8, 8, -8, 8), F = darkPal(f), r = 6 + st * 0.3;
    f.ell(0, 0, 0, r, r, r, (x, y, z) => (vnoise(x * 0.5, y * 0.5, z * 0.5) > 0.7 ? F.OB2 : F.VOID));
    centred(P.float, f);
    const s = vx(-20, 20, -2, 2, -20, 20), S = darkPal(s), R = rng(13);
    s.fill((x, y, z) => {
      const d = Math.hypot(x, z); if (d < 9 || d > 18 || y !== 0) return null;
      const a = Math.atan2(z, x), band = vnoise(d * 0.5, a * 3, 1);
      if (band < 0.35) return null;
      return d < 11 ? S.VL : d < 14 ? (band > 0.6 ? S.VI2 : S.VI) : band > 0.55 ? S.VI : null;
    }, -19, 19, 0, 0, -19, 19);
    for (let i = 0; i < 14; i++) { const a = R() * TAU, d = 9 + R() * 9; s.set(Math.cos(a) * d, (R() < 0.5 ? 1 : -1), Math.sin(a) * d, R() < 0.5 ? S.VW : S.OB3); }
    centred(P.spin, s);
    return { fy: h + 1.9, sy: h + 1.9, spinRate: 2, bob: 0.15, muzzle: [0, h + 1.9, 0] };
  },

  darkness_3(P, h, st) { // Reaper Tower: a hooded reaper in tattered robes raising a scythe
    const a = vx(-14, 16, 0, 40, -10, 14), A = darkPal(a);
    // the robe: a flared cone, tattered at the hem
    a.fill((x, y, z) => {
      const t = y / 26, r = 8 - t * 4.5, d = Math.hypot(x, z * 1.15);
      if (d > r) return null;
      if (y < 3 && vnoise(x * 0.6, 3, z * 0.6) > 0.5 + y * 0.12) return null;
      if (y === 4 || y === 5) return d > r - 1 ? (st >= 1 ? A.VI : A.CLOTH2) : A.CLOTH;
      return (Math.round(Math.atan2(z, x) * 3) + y) % 7 === 0 ? A.CLOTH2 : A.CLOTH;
    }, -9, 9, 0, 26, -9, 9);
    // the hood with a black face and two glowing eyes
    a.ell(0, 29, 0, 5, 5.5, 5, (x, y, z) => (y > 32 ? A.CLOTH2 : A.CLOTH));
    a.cap([0, 30, -3], [0, 31, -6], 2.8, A.CLOTH, 1.6);
    a.ell(0, 28.5, 4, 3, 3.5, 2.5, 0);
    a.ell(0, 28.5, 2.5, 3, 3.5, 1.6, A.VOID);
    for (const s of [-1, 1]) a.set(s * 1.3, 29, 3.2, A.VL);
    // arms reaching to the scythe
    for (const s of [-1, 1]) a.path([[s * 4.5, 22, 1], [7, 18 + s * 3, 4], [9, 19 + s * 4, 5]], 1.8, 1.4, A.CLOTH);
    for (const s of [-1, 1]) a.ell(9, 19 + s * 4, 5, 1.4, 1.4, 1.4, A.BONE2);
    // the scythe
    a.path([[8.5, 2, 3.5], [9, 19, 5], [9.5, 37, 6.5]], 0.9, 0.9, A.WOOD);
    a.box(9, 36, 6, 10, 38, 7, A.IRON);
    a.path([[9.5, 37, 6.5], [6, 38.5, 9], [0, 37.5, 11], [-5, 35, 11.5], [-8, 31, 10.5]], 1.3, 0.5, (x, y, z) => (z > 10.4 || y > 38 ? A.STEEL : A.STEELD));
    if (st >= 2) a.path([[6, 37.5, 9.6], [0, 36.5, 11.8], [-5, 34, 12.2]], 0.5, 0.5, A.VI2);
    if (st >= 3) a.ell(0, 14, 7.5, 1.5, 1.5, 0.8, A.VI2);
    centred(P.aim, a);
    return { ay: h, muzzle: [0, 1.9 * 1.2, 0.6] };
  },

  darkness_4(P, h, st) { // Eclipse Spire: a horned obsidian spire holding an eclipsed sun in a violet corona
    const H = Math.round((3.0 + st * 0.3) / U), v = vx(-12, 12, 0, H + 14, -12, 12), C = darkPal(v);
    v.fill((x, y, z) => {
      const tier = Math.min(4, Math.floor((y / H) * 5)), half = 7 - tier * 1.2, rot = tier * 0.2;
      const xr = x * Math.cos(rot) - z * Math.sin(rot), zr = x * Math.sin(rot) + z * Math.cos(rot);
      const m = Math.max(Math.abs(xr), Math.abs(zr));
      if (m > half) return null;
      if (m > half - 1) return (y - Math.round((tier * H) / 5)) === 0 ? C.OBH : vnoise(xr * 0.4, y * 0.3, zr * 0.4) > 0.8 ? C.VI : C.OB2;
      return C.OB;
    }, -8, 8, 0, H - 1, -8, 8);
    for (const s of [-1, 1]) v.path([[s * 2, H - 3, 0], [s * 7, H + 1, 0], [s * 9, H + 7, 0], [s * 7.5, H + 12, 0]], 1.8, 0.5, (x, y) => (y > H + 9 ? C.OBH : C.OB3));
    onTop(P.base, h, v);
    const s = vx(-17, 17, -17, 17, -2, 2), S = darkPal(s), R = rng(31);
    s.fill((x, y, z) => {
      const d = Math.hypot(x, y), a = Math.atan2(y, x);
      if (d <= 8 && Math.abs(z) <= 1) return d > 7 ? S.OB3 : S.VOID;
      if (z !== 0 || d <= 8) return null;
      const L = 9 + vnoise(a * 2.2 + 5, 1, 1) * 5 + (st >= 2 ? 1 : 0), k = vnoise(Math.cos(a) * 3, Math.sin(a) * 3, 7);
      if (d > 10 && k < 0.42) return null;
      if (d > L) return null;
      return d < 9 ? S.VL : vnoise(x * 0.5, y * 0.5, 3) > 0.5 ? S.VI2 : S.VI;
    }, -16, 16, -16, 16, -1, 1);
    centred(P.spin, s);
    return { sy: h + H * U + 1.0, spinRate: 0.4, spinAxis: "z", muzzle: [0, h + H * U + 1.0, 0] };
  },
});

// ===========================================================================
// MECH and ABNORMAL
// ===========================================================================
function mechPal(v) {
  return {
    PL: v.pal("#4e555c", 0, 0.05), PL2: v.pal("#5d656c", 0, 0.05), PLH: v.pal("#7a838b", 0, 0.04), PLD: v.pal("#373c42", 0, 0.05), GUN: v.pal("#25292d", 0, 0.05), GUNH: v.pal("#3c4248", 0, 0.05),
    HAZ: v.pal("#e0a020", 0, 0.04), BLK: v.pal("#1c1c1e", 0, 0.03), RUST: v.pal("#8a5a3a", 0, 0.08), RED: v.pal("#c8423a", 0, 0.05), REDH: v.pal("#e05a4a", 0, 0.04), REDD: v.pal("#922e28", 0, 0.05),
    CHR: v.pal("#d8dce4", 0, 0.03), BL: v.pal("#c8ccd4", 0, 0.03), BLD: v.pal("#9aa0aa", 0, 0.04), WHITE: v.pal("#eeeef0", 0, 0.03), SMOKE: v.pal("#8a8a90", 0, 0.08), SMOKE2: v.pal("#a8a8ae", 0, 0.07),
    CY: v.pal("#7fe8ff", 1.5, 0.04), CY2: v.pal("#c8f6ff", 1.8, 0.03), AMB: v.pal("#ffb84a", 1.55, 0.05), FIRE: v.pal("#ff6a3d", 1.6, 0.04),
  };
}
function abPal(v) {
  return {
    P1: v.pal("#3b2842", 0, 0.07), P2: v.pal("#4a3354", 0, 0.07), PH: v.pal("#64466e", 0, 0.06), PL: v.pal("#7a5a84", 0, 0.06), PX: v.pal("#8e6e98", 0, 0.05), PD: v.pal("#2a1c30", 0, 0.06),
    PALE: v.pal("#f2e8f6", 0, 0.03), PALE2: v.pal("#dccfe2", 0, 0.03), BLK: v.pal("#07050c", 0, 0.02),
    PK: v.pal("#ff5fa2", 1.55, 0.05), PKL: v.pal("#ffc2dd", 1.85, 0.03), MN: v.pal("#5dffb0", 1.55, 0.05), MNL: v.pal("#c4ffe4", 1.85, 0.03), VI: v.pal("#c77dff", 1.55, 0.05), WG: v.pal("#ffffff", 2.0, 0.02),
    PKs: v.pal("#e0508c", 0, 0.04), MNs: v.pal("#46c48a", 0, 0.04),
  };
}
const rotY = (x, z, a) => [x * Math.cos(a) - z * Math.sin(a), x * Math.sin(a) + z * Math.cos(a)];
// diagonal hazard stripes
const hazard = (C, a, b) => ((((a + b) % 6) + 6) % 6 < 3 ? C.HAZ : C.BLK);

Object.assign(VOX_PLINTH, {
  mech(p, st) {
    const v = vx(-18, 18, 0, 26, -18, 18), C = mechPal(v);
    const top = st >= 1 ? 7 : 3;
    const course = (half, y0, y1, isTop) => v.fill((x, y, z) => {
      const ax = Math.abs(x), az = Math.abs(z), m = Math.max(ax, az);
      if (m > half) return null;
      if (m === half) {
        const al = ax === half ? z : x;
        if (y === y1) return C.PLH;
        if (y === y1 - 1 && isTop) return hazard(C, al, y);
        if (Math.abs(al) % 8 === 0) return C.PLD;                                     // panel seams
        return Math.abs(al) < 3 && y === y0 + 1 && y0 === 0 ? (Math.abs(al) & 1 ? C.GUN : C.PLD) : C.PL2;   // a vent grille
      }
      if (y < y1) return C.PLD;
      if (!isTop) return m >= half - 1 ? C.PLH : C.PL2;
      if (m >= half - 1) return C.PLH;
      if (ax % 9 === 0 || az % 9 === 0) return C.PLD;                               // deck plate seams
      return ((x + z) & 1) && ((x - z + 40) % 4 === 0) ? C.PLH : C.PL;              // diamond tread
    }, -half, half, y0, y1, -half, half);
    course(17, 0, 3, st < 1);
    if (st >= 1) course(13, 4, 7, true);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      v.box(sx * 15 - 1, 4, sz * 15 - 1, sx * 15 + 1, 4, sz * 15 + 1, C.GUNH); v.set(sx * 15, 5, sz * 15, C.CHR);
      if (st >= 2) { v.box(sx * 15, 6, sz * 15, sx * 15, 15, sz * 15, C.PLD); v.box(sx * 15, 10, sz * 15, sx * 15 + sx, 10, sz * 15, C.PLH); v.set(sx * 15, 16, sz * 15, C.CY); }
    }
    v.emit(p, 0, U / 2, 0, MERGE);
    return (top + 1) * U;
  },
  abnormal(p, st) {
    const v = vx(-19, 19, 0, 26, -19, 19), C = abPal(v);
    const top = st >= 1 ? 7 : 3;
    const course = (half, y0, y1, isTop, skew) => v.fill((x, y, z) => {
      const [xr, zr] = rotY(x - skew, z + skew * 0.5, skew * 0.04), ax = Math.abs(xr), az = Math.abs(zr), m = Math.max(ax, az);
      if (m > half + 0.4) return null;
      const row = h3(y, 7, 3);
      if (m > half - 0.6) { if (row < 0.18) return row < 0.09 ? C.PKs : C.MNs; return (Math.round(ax > az ? zr : xr) + 40) % 7 === 0 ? C.PD : h3(x, y, z) < 0.3 ? C.P2 : C.P1; }
      if (y < y1) return C.PD;
      if (!isTop) return C.PH;
      const band = h3(Math.round(zr / 2), 1, 9);                                   // glitch scan bands across the top
      if (band < 0.1 && Math.abs(xr) < half - 2) return h3(Math.round(xr / 3), 2, Math.round(zr / 2)) < 0.5 ? C.PK : C.MN;
      return (Math.floor((xr + 40) / 3) + Math.floor((zr + 40) / 3)) & 1 ? C.PH : C.P2;
    }, -half - 3, half + 3, y0, y1, -half - 3, half + 3);
    course(17, 0, 3, st < 1, 0);
    if (st >= 1) course(12, 4, 7, true, 1.5);
    const R = rng(17);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const cx = sx * 15, cz = sz * 15, y = top + 3 + Math.round(R() * 4) + (st >= 2 ? 4 : 0), c = (sx * sz > 0) ? C.PK : C.MN;
      v.box(cx - 1, y, cz - 1, cx, y + 1, cz, c);
      v.box(cx - 1, top + 1, cz - 1, cx + 1, top + 1, cz + 1, C.PH);
    }
    v.emit(p, 0, U / 2, 0, MERGE);
    return (top + 1) * U;
  },
});

Object.assign(VOX_HEADS, {
  // ===== MECH ==============================================================
  mech_0(P, h, st) { // Gun Turret: an armoured twin/triple-barrel turret on a bolted swivel ring
    const v = vx(-10, 10, 0, 8, -10, 10), C = mechPal(v);
    v.fill((x, y, z) => { const d = Math.hypot(x, z); if (d > 8.6) return null; if (y === 6) return d > 7.6 ? C.PLH : C.GUNH; if (y > 6) return null; return d > 7.6 ? (y === 1 ? hazard(C, Math.round(Math.atan2(z, x) * 8), 0) : Math.round(Math.atan2(z, x) / (TAU / 16)) % 2 === 0 && y === 4 ? C.CHR : C.PL2) : C.PLD; });
    onTop(P.base, h, v);
    const a = vx(-11, 11, -6, 7, -10, 26), A = mechPal(a);
    a.fill((x, y, z) => {
      const ax = Math.abs(x); if (ax > 8 || y < -4 || y > 4 || z < -9 || z > 6 || ax + Math.abs(y) > 11 || (z > 3 && y > 4 - (z - 3))) return null;
      if (y === -4) return hazard(A, x, z);
      if (z === 6 && Math.abs(y) < 1 && ax < 6) return 0;
      if (ax === 8 && Math.abs(z + 2) <= 3 && Math.abs(y) <= 2) return A.GUN;          // ammo hatches
      return (z + 40) % 5 === 0 || ax === 8 && (y + 40) % 4 === 0 ? A.PLD : y > 2 ? A.PLH : A.PL2;
    });
    a.box(-3, 2, 4, 3, 2, 5, A.CY); a.box(-2, 2, 6, 2, 2, 6, A.CY2);                   // the sight slit
    const n = st >= 2 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * 4.5;
      a.cyl(x, 0, 0, 1.6, 23, (xx, y, z) => (z % 4 === 0 ? A.GUNH : A.GUN), "z");
      a.cyl(x, 0, 6, 2.5, 11, A.PLD, "z");
      a.cyl(x, 0, 21, 2.4, 24, (xx, y, z) => (z === 22 && Math.abs(xx - x) > 1.5 ? 0 : A.GUNH), "z");
      a.cyl(x, 0, 23, 0.8, 24, 0, "z");
    }
    if (st >= 1) a.box(-9, -3, -6, -9, 2, 2, A.RUST), a.box(-10, -2, -5, -10, 1, 1, A.HAZ);
    if (st >= 3) a.box(-1, 5, -4, 1, 6, 0, A.PLH), a.set(0, 7, -2, A.CY);
    centred(P.aim, a);
    return { ay: h + 0.95, muzzle: [0, 0.05, 1.9] };
  },

  mech_1(P, h, st) { // Saw Blade: toothed circular saws whirling on a gearbox hub
    const v = vx(-8, 8, 0, 12, -8, 8), C = mechPal(v);
    v.fill((x, y, z) => { const m = Math.max(Math.abs(x), Math.abs(z)); if (m > 6) return null; if (y === 8) return m === 6 ? C.PLH : C.PL; if (m === 6) return y === 3 ? hazard(C, x + z, 0) : (Math.abs(x) === 6 && Math.abs(z) === 6 ? C.PLD : C.PL2); return C.PLD; }, -6, 6, 0, 8, -6, 6);
    for (const s of [-1, 1]) v.box(s * 6, 5, -1, s * 6, 6, 1, C.AMB);
    v.cyl(0, 9, 0, 2.5, 11, C.GUNH);
    onTop(P.base, h, v);
    const s = vx(-16, 16, -2, 8, -16, 16), S = mechPal(s);
    const blade = (y, r, n) => s.fill((x, yy, z) => {
      const d = Math.hypot(x, z), a = Math.atan2(z, x), f = (((a / TAU) * n) % 1 + 1) % 1;
      if (d > r - 1.5 + 2.5 * f) return null;
      if (d < 2.2) return S.CHR;
      if (d > 4.5 && d < r - 4 && Math.abs(((a / TAU) * 6 % 1 + 1) % 1 - 0.5) < 0.12 && Math.abs(d - (r * 0.55)) < 1.6) return 0;   // lightening holes
      return d > r - 2 ? S.BL : (Math.round(d) % 3 === 0 ? S.BLD : S.BL);
    }, -r - 1, r + 1, y, y, -r - 1, r + 1);
    blade(0, 14, 24);
    if (st >= 1) blade(5, 11, 20);
    s.cyl(0, -1, 0, 2.6, 6, S.GUNH); s.set(0, 7, 0, S.AMB);
    centred(P.spin, s);
    return { sy: h + 0.9, spinRate: 9, muzzle: [0, h + 0.9, 0] };
  },

  mech_2(P, h, st) { // Railgun: twin rails threaded with glowing coils, a capacitor bank at the breech
    const v = vx(-9, 9, 0, 10, -9, 9), C = mechPal(v);
    v.fill((x, y, z) => { const ax = Math.abs(x), az = Math.abs(z); if (ax > 7 || az > 7 || ax + az > 11) return null; if (y === 9) return C.PLH; return y === 2 ? hazard(C, x, z) : (ax === 7 || az === 7 || ax + az === 11) && (y & 1) ? C.PLD : C.PL2; }, -7, 7, 0, 9, -7, 7);
    onTop(P.base, h, v);
    const a = vx(-8, 8, -6, 7, -14, 33), A = mechPal(a);
    a.box(-6, -4, -12, 6, 4, 4, (x, y, z) => (y === 4 ? A.PLH : (z + 40) % 6 === 0 ? A.PLD : A.PL2));
    for (let i = 0; i < 4; i++) a.box(-5 + i * 3, -2, -13, -4 + i * 3, 2, -13, (x, y) => (y === 2 ? A.CY2 : A.CY));     // capacitor cells
    for (const s of [-1, 1]) a.box(s * 3, -2, 4, s * 4, 2, 32, (x, y, z) => (y === 2 ? A.CHR : z > 30 ? A.GUNH : A.GUN));
    a.box(-2, -1, 4, 2, 1, 30, 0);
    a.box(-1, -1, 5, 1, 1, 28, (x, y, z) => (x === 0 && y === 0 && z % 2 === 0 ? A.CY : null) || null);
    const nc = 4 + st;
    for (let i = 0; i < nc; i++) { const z = 7 + i * Math.floor(22 / nc); a.fill((x, y) => { const ax = Math.abs(x), ay = Math.abs(y); /* copper coil */ return (ax === 5 && ay <= 3) || (ay === 3 && ax <= 5) ? (y === 3 && ax <= 1 ? A.CY : A.RUST) : null; }, -5, 5, -3, 3, z, z); }
    if (st >= 2) for (const s of [-1, 1]) a.box(s * 7, -3, -10, s * 7, 2, 2, (x, y, z) => (y === -3 || y === 2 || z === -10 || z === 2 ? A.PLH : y === 0 && (z === -7 || z === -1) ? A.CY : A.PLD));
    centred(P.aim, a);
    return { ay: h + 1.1, muzzle: [0, 0.1, 2.5] };
  },

  mech_3(P, h, st) { // Magnet Tower: a great chrome-tipped horseshoe magnet turning over a cabled housing
    const v = vx(-8, 8, 0, 14, -8, 8), C = mechPal(v);
    v.fill((x, y, z) => { const m = Math.max(Math.abs(x), Math.abs(z)); if (m > 6) return null; if (y === 11) return m === 6 ? C.PLH : C.PL; if (m === 6) return y === 2 ? hazard(C, x + z, 0) : (y + 40) % 4 === 0 ? C.PLD : C.PL2; return C.PLD; }, -6, 6, 0, 11, -6, 6);
    for (const s of [-1, 1]) v.path([[s * 6.5, 9, 3], [s * 8, 5, 4], [s * 7.5, 0, 6]], 0.9, 0.9, C.BLK);
    v.cyl(0, 12, 0, 3, 13, C.CHR);
    onTop(P.base, h, v);
    const s = vx(-13, 13, -12, 22, -4, 4), S = mechPal(s), pts = [];
    for (let i = 0; i <= 16; i++) { const a = Math.PI + (i / 16) * Math.PI; pts.push([Math.cos(a) * 9, 4 + Math.sin(a) * 9, 0]); }
    s.path([[-9, 16, 0], [-9, 4, 0]], 2.8, 2.8, S.RED); s.path(pts, 2.8, 2.8, (x, y) => (y < -3 ? S.REDD : S.RED)); s.path([[9, 4, 0], [9, 16, 0]], 2.8, 2.8, S.RED);
    for (const sx of [-1, 1]) { s.box(sx * 9 - 3, 17, -3, sx * 9 + 3, 20, 3, (x, y) => (y === 20 ? S.WHITE : S.CHR)); s.box(sx * 9 - 3, 12, -3, sx * 9 + 3, 12, 3, S.REDH); }
    s.path([[-7, 20, 0], [-3, 21.5, 0], [0, 20, 0], [3, 21.5, 0], [7, 20, 0]], 0.6, 0.6, S.CY);
    if (st >= 2) s.path([[-7, 19, 0], [-2, 18, 1.5], [2, 18.5, -1.5], [7, 19, 0]], 0.6, 0.6, S.CY2);
    centred(P.spin, s);
    return { sy: h + 1.15, spinRate: 0.7, muzzle: [0, h + 2.5, 0] };
  },

  mech_4(P, h, st) { // War Factory: a lit-up factory hall with a smokestack and a roof-mounted missile launcher
    const v = vx(-14, 14, 0, 44, -12, 12), C = mechPal(v), RT = 14;
    v.fill((x, y, z) => {
      const ax = Math.abs(x); if (ax > 12 || z < -10 || z > 9) return null;
      const roofY = RT + ((x + 40) % 8 < 4 ? (x + 40) % 8 : 0);                    // sawtooth roof
      if (y > roofY) return null;
      if (y >= RT) return (x + 40) % 8 === 3 ? C.CY : C.PLH;
      const wall = ax === 12 || z === -10 || z === 9;
      if (!wall) return C.PLD;
      if (z === 9 && Math.abs(x) <= 4 && y < 9) return y % 2 ? C.GUNH : C.PLD;        // roller door
      if (y === 10) return hazard(C, x, y);
      if (y >= 5 && y <= 7 && ((ax === 12 ? z : x) + 40) % 5 < 2) return C.AMB;      // lit windows
      return ((ax === 12 ? z : x) + 40) % 5 === 4 ? C.PLD : C.PL2;
    }, -12, 12, 0, RT + 4, -10, 9);
    // the smokestack and its smoke
    v.cyl(-7, RT, -6, 2.6, 36, (x, y) => ((y >> 2) & 1 ? C.RED : C.WHITE));
    v.cyl(-7, 37, -6, 3.2, 37, C.GUNH); v.cyl(-7, 37, -6, 1.6, 37, C.AMB);
    for (let i = 0; i < 3; i++) v.ell(-7 + i * 1.5, 40 + i * 1.8, -6 - i, 2.2 + i * 0.4, 1.6, 2.2, i ? C.SMOKE2 : C.SMOKE);
    onTop(P.base, h, v);
    const a = vx(-10, 10, -4, 9, -8, 12), A = mechPal(a);
    a.cyl(0, -4, 0, 5, -3, A.PL2); a.cyl(0, -2, 0, 3, 0, A.GUNH);
    for (const s of [-1, 1]) {
      a.box(s * 7 - 3, 0, -6, s * 7 + 3, 6, 8, (x, y, z) => (z === 8 ? A.GUN : y === 6 ? A.PLH : (z + 40) % 5 === 0 ? A.PLD : A.PL2));
      for (const [dx, dy] of [[-1.5, 1.5], [1.5, 1.5], [-1.5, 4.5], [1.5, 4.5]]) { a.set(s * 7 + dx, dy, 9, A.FIRE); a.set(s * 7 + dx, dy, 8, A.WHITE); }
      a.box(s * 3, 0, -2, s * 4, 2, 2, A.GUNH);
    }
    if (st >= 2) { a.box(0, 0, -4, 0, 6, -4, A.PLD); a.fill((x, y, z) => { const d = Math.hypot(x, y - 8); return d < 3.6 && z === -5 + Math.round(d * d * 0.08) ? A.CHR : null; }, -4, 4, 4, 12, -5, -3); a.set(0, 8, -2, A.CY); }
    centred(P.aim, a);
    return { ay: h + 1.45, muzzle: [0, 0.3, 0.8] };
  },

  // ===== ABNORMAL ==========================================================
  abnormal_0(P, h, st) { // Glitch Tower: stacked cubes that never line up, scan lines tearing through them
    const n = 3 + st, v = vx(-12, 12, 0, n * 6 + 2, -12, 12), C = abPal(v);
    const offs = [[0, 0], [2, -1], [-2, 2], [1, 2], [-2, -1], [2, 1]];
    for (let i = 0; i < n; i++) {
      const [ox, oz] = offs[i % 6], half = 7 - i * 0.9, rot = i * 0.3;
      v.fill((x, y, z) => {
        const tear = h3(y, i, 5) < 0.2 ? (h3(y, i, 6) < 0.5 ? 2 : -2) : 0;           // displaced scan rows
        const [xr, zr] = rotY(x - ox - tear, z - oz, rot), m = Math.max(Math.abs(xr), Math.abs(zr));
        if (m > half) return null;
        if (tear) return h3(y, i, 7) < 0.5 ? C.PK : C.MN;
        if (m > half - 1) return y === i * 6 + 5 ? C.PX : (i & 1 ? C.P2 : C.P1);
        return C.PD;
      }, -12, 12, i * 6, i * 6 + 5, -12, 12);
    }
    onTop(P.base, h, v);
    const f = vx(-7, 7, -6, 6, -7, 7), F = abPal(f);
    f.box(0, -2, -2, 4, 2, 2, F.PK); f.box(1, -1, -1, 3, 1, 3, F.PKL);
    f.box(-5, 1, -1, -2, 4, 2, F.MN);
    f.box(-5, -4, -5, 5, -4, 5, (x, y, z) => ((x + z) & 1 ? F.PKL : null));
    centred(P.float, f);
    return { fy: h + 2.1 + st * 0.5, bob: 0.2, muzzle: [0, h + 2.1 + st * 0.5, 0] };
  },

  abnormal_1(P, h, st) { // Warp Tower: a standing ring of studded stone around a spiralling fold in space
    const v = vx(-14, 14, 0, 18, -6, 6), C = abPal(v);
    v.box(-9, 0, -5, 9, 5, 5, (x, y, z) => (y === 5 ? C.PH : Math.abs(x) === 9 || Math.abs(z) === 5 ? (y === 2 ? C.PK : C.P2) : C.PD));
    for (const s of [-1, 1]) v.box(s * 11 - 2, 0, -3, s * 11 + 2, 16, 3, (x, y, z) => (y % 5 === 4 ? C.PX : Math.abs(x - s * 11) === 2 ? C.P2 : C.P1));
    onTop(P.base, h, v);
    const s = vx(-17, 17, -17, 17, -3, 3), S = abPal(s);
    s.fill((x, y, z) => {
      const d = Math.hypot(x, y), a = Math.atan2(y, x);
      if (d > 12.5 && d <= 15.5 && Math.abs(z) <= 2) { const k = Math.round(a / (TAU / 12)); return Math.abs(a - k * TAU / 12) < 0.09 && d > 14.5 ? (k & 1 ? S.PK : S.MN) : d > 14.5 ? S.PL : S.P2; }
      if (z !== 0 || d > 12.5) return null;
      const sp = (((a / TAU) * 3 + d * 0.09) % 1 + 1) % 1;                          // three spiral arms
      return sp < 0.28 ? (d < 4 ? S.WG : d < 8 ? S.PKL : S.PK) : sp < 0.36 ? S.VI : null;
    }, -16, 16, -16, 16, -2, 2);
    centred(P.spin, s);
    return { sy: h + 1.9, spinRate: 1.2, spinAxis: "z", muzzle: [0, h + 1.9, 0] };
  },

  abnormal_2(P, h, st) { // Chaos Tower: an unstable spiked core inside a swarm of mismatched blocks
    const v = vx(-9, 9, 0, 14, -9, 9), C = abPal(v);
    v.fill((x, y, z) => { const [xr, zr] = rotY(x, z, 0.4 + y * 0.03), m = Math.max(Math.abs(xr), Math.abs(zr)); if (m > 6.5) return null; if (y === 12) return C.PX; return m > 5.5 ? (h3(y, 1, 1) < 0.15 ? C.MN : C.P2) : C.PD; }, -9, 9, 0, 12, -9, 9);
    onTop(P.base, h, v);
    const f = vx(-10, 10, -10, 10, -10, 10), F = abPal(f), R = rng(5);
    f.ell(0, 0, 0, 4.5, 4.5, 4.5, (x, y, z) => (Math.hypot(x, y, z) < 3 ? F.WG : h3(x, y, z) < 0.3 ? F.PKL : F.PK));
    for (let i = 0; i < 10 + st * 2; i++) { const u = R() * 2 - 1, a = R() * TAU, w = Math.sqrt(1 - u * u), L = 6.5 + R() * 2.5; f.cap([0, 0, 0], [Math.cos(a) * w * L, u * L, Math.sin(a) * w * L], 1.4, i % 3 ? F.PK : F.MN, 0.4); }
    centred(P.float, f);
    const s = vx(-20, 20, -10, 10, -20, 20), S = abPal(s), R2 = rng(71), cols = [S.MN, S.VI, S.PK, S.P2, S.PH, S.PALE];
    for (let i = 0; i < 12 + st * 3; i++) { const a = R2() * TAU, d = 11 + R2() * 7, y = (R2() - 0.5) * 12, k = 1 + Math.round(R2()); s.box(Math.cos(a) * d - k / 2, y - k / 2, Math.sin(a) * d - k / 2, Math.cos(a) * d + k / 2, y + k / 2, Math.sin(a) * d + k / 2, cols[i % 6]); }
    centred(P.spin, s);
    return { fy: h + 1.9, sy: h + 1.9, spinRate: 2.6, bob: 0.12, muzzle: [0, h + 1.9, 0] };
  },

  abnormal_3(P, h, st) { // Paradox Tower: an impossible cube frame tumbling round a corrupted core
    const v = vx(-8, 8, 0, 12, -8, 8), C = abPal(v);
    v.fill((x, y, z) => { const m = Math.max(Math.abs(x), Math.abs(z)), half = 6 - Math.floor(y / 4); if (m > half) return null; return y % 4 === 3 ? C.PX : m === half ? C.P2 : C.PD; }, -6, 6, 0, 11, -6, 6);
    onTop(P.base, h, v);
    const s = vx(-14, 14, -14, 14, -14, 14), S = abPal(s), L = 11;
    // the 12 edges of a cube, shaded so faces seem to swap depth; one joint is left broken
    const edges = [];
    for (const a of [-L, L]) for (const b of [-L, L]) edges.push([[-L, a, b], [L, a, b], 0], [[a, -L, b], [a, L, b], 1], [[a, b, -L], [a, b, L], 2]);
    edges.forEach(([p0, p1, ax], i) => {
      const col = [S.PL, S.PH, S.PX][ax];
      s.fill((x, y, z) => {
        const p = [x, y, z], t = (p[ax] - p0[ax]) / (p1[ax] - p0[ax]);
        if (t < 0 || t > 1) return null;
        for (let k = 0; k < 3; k++) if (k !== ax && Math.abs(p[k] - p0[k]) > 1.5) return null;
        if (i === 4 && t > 0.82) return null;
        return Math.abs(t - 0.5) < 0.06 ? (ax === 1 ? S.MN : S.PK) : col;
      }, Math.min(p0[0], p1[0]) - 2, Math.max(p0[0], p1[0]) + 2, Math.min(p0[1], p1[1]) - 2, Math.max(p0[1], p1[1]) + 2, Math.min(p0[2], p1[2]) - 2, Math.max(p0[2], p1[2]) + 2);
    });
    bipyr(s, [0, 0, 0], 4.5 + st * 0.3, 5.5 + st * 0.3, [S.PK, S.PKs, S.PKs, S.PK, S.PKL, S.PKL]);
    s.box(-1, -1, -1, 1, 1, 1, S.MNL);
    centred(P.spin, s);
    return { sy: h + 2.1, spinRate: 0.9, spinAxis: "xyz", muzzle: [0, h + 2.1, 0] };
  },

  abnormal_4(P, h, st) { // Reality Engine: a lopsided machine humming round a floating, watching eye
    const v = vx(-14, 14, 0, 26, -12, 12), C = abPal(v);
    v.fill((x, y, z) => { const [xr, zr] = rotY(x - 2, z + 2, 0.2); if (Math.abs(xr) > 10 || Math.abs(zr) > 7) return null; if (y === 11) return C.PX; if (Math.abs(xr) > 9 || Math.abs(zr) > 6) { if (vnoise(xr * 0.3, y * 0.4, zr * 0.3) > 0.72) return C.PK; return (y + 40) % 4 === 0 ? C.PH : C.P2; } return C.PD; }, -14, 14, 0, 11, -12, 12);
    v.path([[-10, 0, 6], [-10.5, 12, 6], [-11.5, 22, 6.5]], 3.2, 2.6, (x, y) => (y % 5 === 0 ? C.PX : C.P2));
    v.ell(-11.5, 24, 6.5, 2.4, 2.4, 2.4, C.MN);
    v.path([[9, 12, 0], [11, 16, 2], [11, 18, 7], [9, 17, 10]], 2.2, 1.6, (x, y, z) => (z > 8 ? C.PK : C.PH));
    if (st >= 2) for (let i = 0; i < 3; i++) v.cyl(-2 + i * 4, 12, -3, 1, 14 + i * 2, i === 1 ? C.MN : C.PL);
    onTop(P.base, h, v);
    const f = vx(-8, 8, -8, 8, -8, 9), F = abPal(f), r = 6;
    f.ell(0, 0, 0, r, r, r, (x, y, z) => {
      const d = Math.hypot(x, y);
      if (z > 2) { if (d < 1.6) return F.BLK; if (d < 3.6) return d < 2.6 ? F.PK : F.PKL; }
      return (Math.abs(vnoise(x * 0.5, y * 0.5, z * 0.5) - 0.5) < 0.04 && z > -2) ? F.PKs : z > 0 ? F.PALE : F.PALE2;
    });
    f.fill((x, y, z) => { const e = (x / 7) ** 2 + ((y - 1) / 6.8) ** 2 + (z / 7) ** 2; return e <= 1 && y > 3.5 && z < 3 ? C.P2 : null; }, -8, 8, 3, 8, -8, 3);
    centred(P.float, f);
    const s = vx(-20, 20, -20, 20, -20, 20), S = abPal(s);
    for (let i = 0; i < 40; i++) { const a = (i / 40) * TAU; s.set(Math.cos(a) * 17, Math.sin(a) * 17, 0, i % 5 === 0 ? S.VI : S.PL); s.set(Math.cos(a) * 19, 0, Math.sin(a) * 19, i % 4 === 0 ? S.MN : S.PH); }
    if (st >= 2) for (let i = 0; i < 32; i++) { const a = (i / 32) * TAU; s.set(0, Math.cos(a) * 15, Math.sin(a) * 15, i % 4 === 0 ? S.PK : S.PX); }
    centred(P.spin, s);
    return { fy: h + 2.6 + st * 0.15, sy: h + 2.6 + st * 0.15, spinRate: 1.1, bob: 0.14, muzzle: [0, h + 2.6, 0] };
  },
});

// shared with render/propmodels.js (obstacles and island props)
export { firePal, icePal, naturePal, stormPal, lightPal, darkPal, mechPal, abPal, crystal, iceTones, leafTones, darkTones, column, mortar, h3, bipyr, flame, FLAME_COLS, VIOLET_FLAME, stormCrystalPal, stormTones, rotY, hazard };

// ---------------------------------------------------------------------------
// TOWER ADD-ONS: the Lv 10 crown (a floating gilded circlet set with the element's gems) and the
// mutation shards (Circle marks a mutated tower in pink: faceted pink crystals with a white heart)
// ---------------------------------------------------------------------------
export function crownAddon(P, color, glow) {
  const U = 0.06;
  const v2 = new Vox(U, -30, 30, -2, 14, -30, 30);
  const GO = v2.pal("#d9b84a", 0, 0.04), GOH = v2.pal("#f4da7c", 0, 0.03), GOD = v2.pal("#a8862e", 0, 0.05), GEM = v2.pal(color, 1.7, 0.03), GEMH = v2.pal(glow, 2.1, 0.02);
  const R = 27.5;
  v2.fill((x, y, z) => {
    const d = Math.hypot(x, z), a = Math.atan2(z, x), seg = ((a / TAU) * 8 % 1 + 1) % 1;
    if (Math.abs(d - R) > 1.3) return null;
    if (y >= 0 && y <= 2) return y === 1 && Math.abs(seg - 0.5) < 0.04 ? GEM : y === 2 ? GOH : y === 0 ? GOD : GO;
    const point = 1 - Math.abs(seg - 0.5) * 2;                       // eight crown points between the gems
    if (y > 2 && y <= 2 + point * 8 && Math.abs(d - R) < 1.3 - (y - 2) * 0.1) return y > point * 8 ? GOH : GO;
    return null;
  }, -30, 30, 0, 11, -30, 30);
  for (let i = 0; i < 8; i++) { const a = ((i + 0.5) / 8) * TAU; v2.set(Math.cos(a) * R, 11, Math.sin(a) * R, GEMH); v2.set(Math.cos(a) * R, 10, Math.sin(a) * R, GEM); }
  v2.emit(P, 0, 0, 0, 4);
}
export function mutationAddon(P, count) {
  const U = 0.05, v = new Vox(U, -34, 34, -10, 12, -34, 34);
  const T = [v.pal("#ff9ac8", 1.3, 0.03), v.pal("#ff5fa2", 1.5, 0.03), v.pal("#e0508c", 0, 0.03), v.pal("#b8306c", 0, 0.04), v.pal("#ffc2dd", 1.6, 0.02), v.pal("#ffffff", 2.2, 0.01)];
  for (let i = 0; i < count; i++) {
    const a = i * Math.PI, cx = Math.cos(a) * 29, cz = Math.sin(a) * 29;
    bipyr(v, [cx, 0, cz], 3.4, 7.5, T);
    v.set(cx, 0, cz, T[5]);
    for (const [dx, dz, h] of [[4, 2, 3], [-3, -4, 2.5]]) bipyr(v, [cx + dx, -3, cz + dz], 1.4, h, T);
  }
  v.emit(P, 0, 0, 0, 4);
}
