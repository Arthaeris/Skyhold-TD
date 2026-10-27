/* Skyhold TD — render/bossmodels.js
   The bosses, sculpted in true voxels (render/voxkit.js): the Sealed One, the Warlord and the four
   challenge bosses. Same model format as render/enemies.js (parts, pivots, per-part animation), so the
   instanced renderer, thumbnails and the bestiary pick them up unchanged. Coordinates: 1 unit ≈ 1 tile,
   the model faces +z, y = 0 is its feet (or the bottom of its hover). */
import { Vox, vnoise } from "./voxkit.js";

// a part function for the model format: sculpt into a Vox, mesh into the Part
const part = (u, bounds, sculpt) => (P) => { const v = new Vox(u, ...bounds); sculpt(v); v.emit(P); };
const R = (w, u) => Math.round(w / u);
const lerp = (a, b, t) => a + (b - a) * t;

// =====================================================================================================
// THE SEALED ONE — a towering void titan, still wearing the shackles and chains of the seal it broke.
// Obsidian plates split by magenta fire, a cracked seal-sigil in its chest, horned helm, crystal crown;
// no legs: its lower body is a skirt of plates trailing into void-light. Fragments of the seal orbit it.
// =====================================================================================================
const SU = 0.06;
function sealedBody(v) {
  const OB = v.pal("#23112a", 0, 0.08), OB2 = v.pal("#2e1736", 0, 0.08), PL = v.pal("#432352", 0, 0.06), PLH = v.pal("#5a3170", 0, 0.05);
  const IRON = v.pal("#373b4d", 0, 0.06), STEEL = v.pal("#7f8ea8", 0, 0.05), STEELH = v.pal("#b0bcd2", 0, 0.04), BONE = v.pal("#d9ccb4", 0, 0.05);
  const G1 = v.pal("#ff2e7e", 2.0, 0.08), G2 = v.pal("#ff6ab0", 2.4, 0.06), GW = v.pal("#ffe0f0", 3.0, 0.02), VOID = v.pal("#c03aff", 1.7, 0.1);
  const u = SU, W = (x) => R(x, u);
  // -- skirt: plates fanning down into a void glow; ragged hem
  v.fill((x, y, z) => {
    const t = y / W(1.45); // 0 bottom .. 1 waist
    const rx = lerp(W(0.32), W(0.86), Math.pow(t, 0.7)), rz = rx * 0.68;
    const d = (x * x) / (rx * rx) + (z * z) / (rz * rz);
    if (d > 1) return null;
    const ang = Math.atan2(z, x), slat = Math.floor((ang + Math.PI) / (Math.PI / 9));
    const hem = vnoise(x * 0.35, 1, z * 0.35) * W(0.5);
    if (y < hem && d > 0.4) return null;                          // tattered hem
    if (d > 0.82 && (slat % 2 === 0) && y < W(1.25)) return d > 0.93 ? G1 : OB; // glowing seams between plates
    return slat % 2 ? (y > W(1.15) ? PLH : PL) : OB2;
  }, -W(0.9), W(0.9), 0, W(1.45), -W(0.62), W(0.62));
  v.ell(0, W(0.1), 0, W(0.3), W(0.18), W(0.24), VOID);                       // the void it trails into
  // -- belt: an iron ring with the seal-stone buckle
  v.fill((x, y, z) => ((x * x) / (W(0.9) ** 2) + (z * z) / (W(0.62) ** 2) <= 1 ? (Math.abs(x) % 6 === 0 ? STEELH : IRON) : null), -W(0.92), W(0.92), W(1.38), W(1.56), -W(0.64), W(0.64));
  v.box(-W(0.16), W(1.36), W(0.56), W(0.16), W(1.6), W(0.66), STEEL); v.box(-W(0.08), W(1.42), W(0.65), W(0.08), W(1.54), W(0.68), G2);
  // -- torso: a broad, V-tapering chest of plates, cracked with fire
  v.fill((x, y, z) => {
    const t = (y - W(1.5)) / W(1.55);
    const rx = lerp(W(0.72), W(1.0), Math.min(1, t * 1.4)), rz = lerp(W(0.48), W(0.6), t);
    const dx = x / rx, dz = z / rz, d = dx * dx * dx * dx + dz * dz;                     // squarish section
    if (d > 1) return null;
    const crack = Math.abs(vnoise(x * 0.18, y * 0.18, z * 0.18) - 0.5) < 0.035 && d > 0.75;
    if (crack) return G1;
    const plate = (Math.floor(y / 5) + Math.floor((x + 40) / 7)) % 2;
    return y > W(2.85) ? PLH : plate ? PL : OB2;
  }, -W(1.02), W(1.02), W(1.5), W(3.05), -W(0.62), W(0.62));
  // abdominal bands
  for (let k = 0; k < 3; k++) v.box(-W(0.55), W(1.62) + k * 4, W(0.44), W(0.55), W(1.62) + k * 4 + 1, W(0.5), IRON);
  // the broken seal: a glowing ring with runic spokes, a white heart, a crack through it
  const sc = [0, W(2.38)], sr = W(0.4);
  v.fill((x, y, z) => {
    const dx = x - sc[0], dy = y - sc[1], d = Math.hypot(dx, dy);
    if (d > sr) return null;
    if (d > sr - 1.5) return STEELH;
    if (d > sr - 3) return G1;
    if (d < 2.5) return GW;
    const a = Math.atan2(dy, dx);
    if (Math.abs(Math.sin(a * 3)) < 0.18) return G2;                                     // six spokes
    if (Math.abs(dx - dy * 0.4) < 0.8 && d > 3) return GW;                              // the crack
    return OB;
  }, -sr, sr, sc[1] - sr, sc[1] + sr, W(0.52), W(0.62));
  // -- pauldrons: stacked plates with bone spikes and burning tips
  for (const s of [-1, 1]) {
    v.ell(s * W(0.98), W(2.95), 0, W(0.46), W(0.32), W(0.5), PL);
    v.ell(s * W(1.02), W(2.88), 0, W(0.48), W(0.18), W(0.52), PLH);
    v.fill((x, y, z) => (Math.abs(x - s * W(1.0)) < W(0.5) && y === W(2.76) && Math.abs(z) < W(0.52) ? STEEL : null), -W(1.6), W(1.6), W(2.7), W(2.8), -W(0.6), W(0.6));
    for (const [dz, h, lean] of [[-0.2, 0.42, 0.42], [0.18, 0.34, 0.5]]) {
      const base = [s * W(1.05), W(3.1), W(dz)], tip = [s * W(1.05 + lean), W(3.1 + h), W(dz) - W(0.08)];
      v.cap(base, tip, W(0.09), BONE, 0.6);
      v.set(tip[0], tip[1] + 1, tip[2], G2); v.set(tip[0], tip[1], tip[2], G1);
    }
  }
  // -- collar shackle with broken chain hanging at the front
  v.fill((x, y, z) => { const d = Math.hypot(x / 1.0, z / 0.85); return d <= W(0.42) && d >= W(0.3) ? (y % 2 ? STEEL : STEELH) : null; }, -W(0.45), W(0.45), W(3.0), W(3.18), -W(0.4), W(0.4));
  for (const s of [-1, 1]) for (let k = 0; k < 4; k++) {
    const cy = W(2.98) - k * 4, cx = s * (W(0.24) + k), cz = W(0.44);
    if (k % 2) v.box(cx - 1, cy - 2, cz - 1, cx + 1, cy + 1, cz + 1, STEEL), v.box(cx, cy - 1, cz - 1, cx, cy, cz + 1, 0);
    else v.box(cx - 1, cy - 2, cz, cx + 1, cy + 1, cz, STEELH);
  }
  // -- head: a horned helm with a burning visor
  v.fill((x, y, z) => {
    const cy = W(3.46), dx = x / W(0.4), dy = (y - cy) / W(0.4), dz = (z - W(0.04)) / W(0.38);
    if (dx * dx + dy * dy * 0.7 + dz * dz > 1) return null;
    if (z > W(0.3) && y >= W(3.42) && y <= W(3.5) && Math.abs(x) <= W(0.3)) return Math.abs(x) <= W(0.06) ? IRON : (Math.abs(x) > W(0.09) && Math.abs(x) < W(0.25) ? GW : G2); // visor eyes
    if (z > W(0.26) && y < W(3.3)) return (x + y) % 3 === 0 ? BONE : OB;                                      // fanged jaw
    if (Math.abs(x) <= 1 && y > W(3.5)) return STEEL;                                                         // helm crest
    return y > W(3.62) ? PLH : PL;
  }, -W(0.42), W(0.42), W(3.06), W(3.88), -W(0.36), W(0.44));
  for (let i = -2; i <= 2; i++) v.cap([i * 3, W(3.24), W(0.4)], [i * 3, W(3.12), W(0.43)], 0.6, BONE);
  // great horns sweeping back and up
  for (const s of [-1, 1]) {
    const pts = []; for (let k = 0; k <= 10; k++) { const t = k / 10; pts.push([s * (W(0.36) + W(0.62) * Math.sin(t * 1.7)), W(3.6) + W(0.8) * t * t - W(0.12) * Math.sin(t * 3), -W(0.05) - W(0.45) * t]); }
    v.path(pts, W(0.11), 0.7, (x, y, z) => ((y + z) % 4 === 0 ? BONE : v.pal("#bfae92", 0, 0.05)));
    const tip = pts[pts.length - 1]; v.set(tip[0], tip[1] + 1, tip[2], G2);
  }
  // crystal crown, floating just behind the head
  for (let i = 0; i < 5; i++) {
    const a = (i - 2) * 0.42, bx = Math.sin(a) * W(0.28), bz = -Math.cos(a) * W(0.2) - W(0.05);
    const h = i === 2 ? 0.75 : 0.5 - Math.abs(i - 2) * 0.06;
    v.cap([bx, W(3.92), bz], [bx * 1.4, W(3.92 + h), bz - W(0.05)], W(0.08), (x, y) => (y > W(3.92 + h * 0.6) ? G2 : G1), 0.5);
  }
  // a chain draped across the back, links alternating
  for (let k = 0; k < 14; k++) { const t = k / 13, x = Math.round(lerp(-W(0.95), W(0.95), t)), y = Math.round(W(2.85) - Math.sin(t * Math.PI) * W(0.9)), z = -W(0.6); if (k % 2) v.box(x - 1, y - 1, z, x + 1, y + 1, z, STEEL); else v.box(x - 1, y, z - 1, x + 1, y, z + 1, STEELH); }
}
function sealedArm(s) {
  return (v) => {
    const u = SU, W = (x) => R(x, u);
    const OB = v.pal("#2e1838", 0, 0.08), PL = v.pal("#4c2a5e", 0, 0.06), PLH = v.pal("#68397f", 0, 0.05), IRON = v.pal("#3e4256", 0, 0.06);
    const STEEL = v.pal("#7f8ea8", 0, 0.05), STEELH = v.pal("#b0bcd2", 0, 0.04), BONE = v.pal("#d9ccb4", 0, 0.05), G1 = v.pal("#ff2e7e", 2.0, 0.08), G2 = v.pal("#ff6ab0", 2.4, 0.06);
    v.cap([0, 0, 0], [s * 1, -W(0.8), W(0.04)], W(0.28), PL, W(0.25));                   // upper arm
    v.ell(0, -W(0.82), W(0.03), W(0.24), W(0.2), W(0.24), OB);                              // elbow
    v.cap([s * 1, -W(0.85), W(0.04)], [s * 2, -W(1.42), W(0.08)], W(0.31), (x, y, z) => {  // gauntlet: banded plates
      if (Math.abs(x - s * 2) <= 0.6 && z > W(0.2) && y % 5 !== 0) return G1;               // a burning seam down the front
      return (y % 5 === 0) ? IRON : (y % 5 === 1 ? PLH : PL);
    }, W(0.33));
    v.cap([s * 1, -W(0.82), -W(0.18)], [s * 3, -W(0.95), -W(0.5)], 1.6, BONE, 0.5);         // elbow spike
    v.ell(0, -W(0.1), 0, W(0.3), W(0.22), W(0.3), PLH);                                      // shoulder joint
    // the shackle: a thick steel cuff with a broken chain swinging off it
    v.fill((x, y, z) => { const d = Math.hypot(x - s * 2, z - W(0.08)); return d <= W(0.38) && d >= W(0.26) ? (y % 2 ? STEEL : STEELH) : null; }, -W(0.5) + s * 2, W(0.5) + s * 2, -W(1.32), -W(1.18), -W(0.35), W(0.5));
    for (let k = 0; k < 7; k++) {
      const cx = s * (W(0.3) + Math.round(k * 0.6)), cy = -W(1.3) - k * 3, cz = W(0.12) + Math.round(k * 0.5);
      if (k % 2) { v.box(cx - 1, cy - 2, cz - 1, cx + 1, cy + 1, cz + 1, STEEL); v.box(cx, cy - 1, cz - 1, cx, cy, cz + 1, 0); }
      else v.box(cx, cy - 2, cz - 1, cx, cy + 1, cz + 1, STEELH);
    }
    // fist with bone knuckle spikes
    v.box(s * 2 - W(0.26), -W(1.86), -W(0.18), s * 2 + W(0.26), -W(1.46), W(0.32), OB);
    v.box(s * 2 - W(0.26), -W(1.66), W(0.28), s * 2 + W(0.26), -W(1.6), W(0.34), IRON);
    for (let i = -1; i <= 1; i++) v.cap([s * 2 + i * W(0.15), -W(1.6), W(0.3)], [s * 2 + i * W(0.17), -W(1.56), W(0.48)], 1, BONE, 0.5);
    v.set(s * 2, -W(1.62), W(0.35), G1);
  };
}
function sealFragments(v) {
  const u = SU, W = (x) => R(x, u);
  const ST = v.pal("#4a4458", 0, 0.08), ST2 = v.pal("#5d5770", 0, 0.08), STEEL = v.pal("#7f8ea8", 0, 0.05), G1 = v.pal("#ff2e7e", 2.2, 0.06), G2 = v.pal("#ff9acb", 2.6, 0.04);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2, cx = Math.round(Math.cos(a) * W(1.95)), cz = Math.round(Math.sin(a) * W(1.95)), cy = (i % 2 ? 2 : -2);
    if (i % 2 === 0) {
      // a broken tablet of the seal, carved with a glowing rune
      const tx = -Math.sin(a), tz = Math.cos(a);
      v.fill((x, y, z) => {
        const lx = (x - cx) * tx + (z - cz) * tz, lz = (x - cx) * Math.cos(a) + (z - cz) * Math.sin(a), ly = y - cy;
        if (Math.abs(lx) > 3.5 || Math.abs(ly) > 4.5 || Math.abs(lz) > 1) return null;
        if (ly > 3 && lx > ly - 4) return null;                                           // broken corner
        if (Math.abs(lz) > 0.5 && ((Math.abs(lx) < 0.6 && Math.abs(ly) < 3) || (Math.abs(ly - 1) < 0.6 && Math.abs(lx) < 2.5))) return G1;
        return (lx + ly) % 3 ? ST : ST2;
      }, cx - 6, cx + 6, cy - 6, cy + 6, cz - 6, cz + 6);
    } else {
      // a burning chain link
      for (let k = -1; k <= 1; k++) v.box(cx - 1, cy + k * 3 - 1, cz - 1, cx + 1, cy + k * 3 + 1, cz + 1, k ? STEEL : G2);
    }
  }
}
const SEALED_ONE = {
  height: 4.4, size: 2.6, hover: 0.5,
  parts: {
    body: part(SU, [-36, 36, -2, 86, -20, 20], sealedBody),
    armL: part(SU, [-40, 14, -42, 6, -14, 18], sealedArm(-1)),
    armR: part(SU, [-14, 40, -42, 6, -14, 18], sealedArm(1)),
    ring: part(SU, [-40, 40, -8, 8, -40, 40], sealFragments),
  },
  pivots: { armL: [-1.28, 2.88, 0], armR: [1.28, 2.88, 0], ring: [0, 1.5, 0] },
  anim: { armL: "swingB", armR: "swingA", ring: "orbit" },
};

// =====================================================================================================
// THE WARLORD — a crimson-armoured demon general: horned crown, layered pauldrons, a tattered war-cape,
// a skull buckle, a spiked buckler and a great cleaver with a burning edge.
// =====================================================================================================
const WU = 0.05;
function warlordBody(v) {
  const u = WU, W = (x) => R(x, u);
  const CR = v.pal("#8a2a50", 0, 0.06), CRH = v.pal("#a83a64", 0, 0.05), CRD = v.pal("#5e1a36", 0, 0.06), DK = v.pal("#2a1220", 0, 0.06);
  const GOLD = v.pal("#c9a24a", 0, 0.05), GOLDH = v.pal("#ecc870", 0, 0.04), SKIN = v.pal("#b03b6b", 0, 0.05), BONE = v.pal("#e2d6be", 0, 0.05);
  const CAPE = v.pal("#3e1426", 0, 0.08), CAPEH = v.pal("#5a1e36", 0, 0.08), EYE = v.pal("#ffd23d", 2.6, 0.02), RUNE = v.pal("#ff2e7e", 2.0, 0.05), HORN = v.pal("#1e1016", 0, 0.06), HORNH = v.pal("#3a2230", 0, 0.06);
  // tasset skirt of plates over the hips
  v.fill((x, y, z) => {
    const t = (y - W(0.72)) / W(0.36), rx = lerp(W(0.62), W(0.52), t), rz = lerp(W(0.44), W(0.38), t);
    if ((x * x) / (rx * rx) + (z * z) / (rz * rz) > 1) return null;
    const plate = Math.floor((Math.atan2(z, x) + Math.PI) / (Math.PI / 6));
    if (y === W(0.72)) return GOLD;
    return plate % 2 ? CR : CRD;
  }, -W(0.64), W(0.64), W(0.72), W(1.08), -W(0.46), W(0.46));
  // torso: plated chest over a darker gambeson, gold trims
  v.fill((x, y, z) => {
    const t = (y - W(1.05)) / W(1.0), rx = lerp(W(0.46), W(0.6), t), rz = lerp(W(0.34), W(0.4), t);
    const dx = x / rx, dz = z / rz; if (dx ** 4 + dz * dz > 1) return null;
    if (z > rz * 0.55 && y > W(1.5) && y < W(1.98)) return (Math.abs(x) === 0 || y === W(1.98) - 1) ? GOLD : (y % 4 === 0 ? CRD : CRH); // breastplate
    if (z > rz * 0.55 && y <= W(1.5)) return (y % 3 === 0) ? DK : CR;                     // ab plates
    return y > W(1.9) ? CRH : CR;
  }, -W(0.62), W(0.62), W(1.05), W(2.05), -W(0.42), W(0.42));
  // belt + skull buckle
  v.box(-W(0.5), W(1.04), -W(0.38), W(0.5), W(1.12), W(0.38), DK);
  v.ell(0, W(1.1), W(0.38), W(0.1), W(0.11), W(0.05), BONE);
  v.set(-1, W(1.12), W(0.43), RUNE); v.set(1, W(1.12), W(0.43), RUNE); v.box(-1, W(1.05), W(0.42), 1, W(1.05), W(0.43), DK);
  // war-cape from the shoulders, flaring and ragged
  v.fill((x, y, z) => {
    const t = (W(2.0) - y) / W(1.5); if (t < 0 || t > 1) return null;
    const half = lerp(W(0.5), W(0.72), t), zz = -W(0.4) - Math.round(t * W(0.22) + Math.sin(x * 0.4) * 1.2);
    if (Math.abs(x) > half || z !== zz) return null;
    if (t > 0.85 && vnoise(x * 0.5, y * 0.5, 0) > 0.55) return null;                     // ragged hem
    if (t > 0.88) return GOLD;
    return Math.floor(x / 3) % 2 ? CAPE : CAPEH;
  }, -W(0.75), W(0.75), W(0.45), W(2.02), -W(0.7), -W(0.38));
  // pauldrons: three tiers with spikes
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k++) v.ell(s * W(0.66 + k * 0.03), W(2.0) - k * 3, 0, W(0.3 - k * 0.02), W(0.12), W(0.36 - k * 0.02), k === 0 ? CRH : k === 1 ? GOLD : CR);
    for (const dz of [-0.16, 0.12]) v.cap([s * W(0.72), W(2.08), W(dz)], [s * W(1.0), W(2.45), W(dz) - 1], W(0.06), HORN, 0.5);
  }
  // gorget
  v.cyl(0, W(2.02), 0, W(0.24), W(2.1), GOLD);
  // head: demon face under a dark helm
  v.ell(0, W(2.32), W(0.04), W(0.26), W(0.27), W(0.27), SKIN);
  v.fill((x, y, z) => (y > W(2.36) && (x * x) / W(0.29) ** 2 + ((y - W(2.36)) ** 2) / W(0.24) ** 2 + ((z - W(0.02)) ** 2) / W(0.3) ** 2 <= 1 ? (y === W(2.37) ? GOLD : DK) : null), -W(0.3), W(0.3), W(2.36), W(2.62), -W(0.3), W(0.33));
  v.box(-W(0.16), W(2.28), W(0.25), -W(0.06), W(2.31), W(0.3), EYE); v.box(W(0.06), W(2.28), W(0.25), W(0.16), W(2.31), W(0.3), EYE);
  v.box(-W(0.13), W(2.14), W(0.26), W(0.13), W(2.18), W(0.3), DK);                       // grimace
  for (const s of [-1, 1]) v.cap([s * W(0.09), W(2.17), W(0.3)], [s * W(0.1), W(2.09), W(0.33)], 0.7, BONE);   // fangs
  // crown of horns: two great ones and three gold points
  for (const s of [-1, 1]) {
    const pts = []; for (let k = 0; k <= 8; k++) { const t = k / 8; pts.push([s * (W(0.24) + W(0.38) * Math.sin(t * 1.6)), W(2.42) + W(0.55) * t, -W(0.04) - W(0.12) * t + W(0.18) * t * t]); }
    v.path(pts, W(0.075), 0.6, (x, y) => (y % 3 === 0 ? HORNH : HORN));
  }
  for (const [x, h] of [[-0.1, 0.18], [0, 0.26], [0.1, 0.18]]) v.cap([W(x), W(2.58), W(0.16)], [W(x), W(2.58 + h), W(0.16)], 1.2, GOLDH, 0.5);
  v.set(0, W(2.66), W(0.19), RUNE);
}
function warlordLeg(v) {
  const u = WU, W = (x) => R(x, u);
  const CR = v.pal("#8a2a50", 0, 0.06), CRD = v.pal("#5e1a36", 0, 0.06), DK = v.pal("#2a1220", 0, 0.06), GOLD = v.pal("#c9a24a", 0, 0.05), HORN = v.pal("#1e1016", 0, 0.06);
  v.cap([0, 0, 0], [0, -W(0.42), W(0.02)], W(0.2), CRD, W(0.18));                       // thigh
  v.ell(0, -W(0.45), W(0.1), W(0.15), W(0.13), W(0.13), GOLD);                            // knee cop
  v.cap([0, -W(0.46), W(0.12)], [0, -W(0.46), W(0.32)], 1.5, HORN, 0.4);                 // knee spike
  v.cap([0, -W(0.48), 0], [0, -W(0.78), W(0.02)], W(0.18), (x, y) => (y % 4 === 0 ? GOLD : CR), W(0.16)); // greave
  v.box(-W(0.16), -W(0.9), -W(0.12), W(0.16), -W(0.8), W(0.3), DK);                      // sabaton
  v.box(-W(0.14), -W(0.9), W(0.3), W(0.14), -W(0.84), W(0.36), HORN);
}
function warlordArm(s) {
  return (v) => {
    const u = WU, W = (x) => R(x, u);
    const CR = v.pal("#8a2a50", 0, 0.06), CRH = v.pal("#a83a64", 0, 0.05), DK = v.pal("#2a1220", 0, 0.06), GOLD = v.pal("#c9a24a", 0, 0.05), GOLDH = v.pal("#ecc870", 0, 0.04);
    const STEEL = v.pal("#c8c8d8", 0, 0.04), STEELD = v.pal("#7a7a8c", 0, 0.05), WOOD = v.pal("#3a2a20", 0, 0.08), RUNE = v.pal("#ff2e7e", 2.2, 0.05), HORN = v.pal("#1e1016", 0, 0.06);
    v.cap([0, 0, 0], [0, -W(0.42), W(0.02)], W(0.17), CR, W(0.15));
    v.ell(0, -W(0.45), 0, W(0.14), W(0.12), W(0.14), GOLD);
    v.cap([0, -W(0.47), W(0.02)], [0, -W(0.8), W(0.06)], W(0.18), (x, y) => (y % 4 === 0 ? GOLD : CRH), W(0.2)); // vambrace
    v.box(-W(0.14), -W(0.98), -W(0.06), W(0.14), -W(0.8), W(0.2), DK);                       // gauntlet
    if (s < 0) {
      // spiked buckler on the left forearm
      v.fill((x, y, z) => { const d = Math.hypot(y + W(0.62), z - W(0.08)); if (d > W(0.36) || Math.abs(x + W(0.21)) > 1) return null; return d > W(0.31) ? GOLDH : d < W(0.07) ? RUNE : (Math.floor(d / 2) % 2 ? DK : CR); }, -W(0.26), -W(0.16), -W(1.0), -W(0.24), -W(0.3), W(0.46));
      v.cap([-W(0.23), -W(0.62), W(0.08)], [-W(0.42), -W(0.62), W(0.08)], 1.2, HORN, 0.4);
    } else {
      // the great cleaver, held forward: haft, guard, a broad blade with a burning edge
      v.cap([0, -W(0.9), -W(0.2)], [0, -W(0.86), W(0.44)], 1.3, WOOD);
      v.box(-1, -W(1.0), W(0.44), 1, -W(0.72), W(0.5), GOLDH);
      v.fill((x, y, z) => {
        if (Math.abs(x) > 1) return null;
        const t = (z - W(0.5)) / W(0.95); if (t < 0 || t > 1) return null;
        const top = -W(0.7) + Math.round(t * 2), bot = -W(1.3) - Math.round(Math.sin(t * Math.PI * 0.8) * 4);
        if (y > top || y < bot) return null;
        if (z > W(1.42) && y > top - 3 - (z - W(1.42))) return null;                        // clipped tip
        if (y <= bot + 1) return RUNE;                                                     // burning edge
        if (y === top || (y === top - 1 && z % 5 === 0)) return STEELD;                     // notched spine
        if (Math.abs(x) === 0 && (y + z) % 7 === 0 && y < top - 3) return RUNE;           // etched runes
        return STEEL;
      }, -2, 2, -W(1.5), -W(0.66), W(0.5), W(1.5));
    }
  };
}
const WARLORD = {
  height: 2.75, size: 1.8,
  parts: {
    body: part(WU, [-22, 22, 8, 64, -16, 12], warlordBody),
    legL: part(WU, [-6, 6, -20, 2, -6, 10], warlordLeg),
    legR: part(WU, [-6, 6, -20, 2, -6, 10], warlordLeg),
    armL: part(WU, [-10, 6, -22, 3, -8, 11], warlordArm(-1)),
    armR: part(WU, [-6, 6, -32, 3, -6, 32], warlordArm(1)),
  },
  pivots: { legL: [-0.3, 0.92, 0], legR: [0.3, 0.92, 0], armL: [-0.8, 1.92, 0], armR: [0.8, 1.92, 0] },
  anim: { legL: "legA", legR: "legB", armL: "swingB", armR: "swingA" },
};

// =====================================================================================================
// THE RAT KING — a huge mangy rat in a royal cape with ermine trim, a dented crown, tusked incisors,
// burning red eyes and a long scaly tail. Moves on all fours.
// =====================================================================================================
const RU = 0.045;
function ratBody(v) {
  const u = RU, W = (x) => R(x, u);
  const F1 = v.pal("#7a6650", 0, 0.09), F2 = v.pal("#62503f", 0, 0.09), F3 = v.pal("#94806a", 0, 0.08), BELLY = v.pal("#b4a48c", 0, 0.06);
  const PINK = v.pal("#e8909a", 0, 0.06), PINKD = v.pal("#c27480", 0, 0.06), TOOTH = v.pal("#f4e8c6", 0, 0.03), EYE = v.pal("#ff3b4e", 2.4, 0.02), EYEW = v.pal("#ffe0e4", 2.8, 0);
  const CAPE = v.pal("#5a1a4a", 0, 0.06), CAPEH = v.pal("#742a62", 0, 0.06), ERM = v.pal("#ece6da", 0, 0.03), ERMS = v.pal("#1a1418", 0, 0.02);
  const GOLD = v.pal("#e0b040", 0, 0.05), GOLDD = v.pal("#a87a28", 0, 0.05), GEM = v.pal("#ff2e5e", 2.0, 0.02), GEM2 = v.pal("#5dc8ff", 1.8, 0.02), WHISK = v.pal("#d8d0c4", 0, 0.02), NOSE = v.pal("#ff8a9a", 0, 0.03);
  const fur = (x, y, z) => { const n = vnoise(x * 0.22, y * 0.22, z * 0.22); return n > 0.66 ? F3 : n < 0.32 ? F2 : F1; };
  // body: round haunches and a hump behind the shoulders (kept as a shape test for the cape below)
  const inBody = (x, y, z, k = 1) => {
    const a = (x / (W(0.6) * k)) ** 2 + ((y - W(0.92)) / (W(0.52) * k)) ** 2 + ((z + W(0.32)) / (W(0.74) * k)) ** 2;
    const b = (x / (W(0.5) * k)) ** 2 + ((y - W(1.1)) / (W(0.46) * k)) ** 2 + ((z - W(0.25)) / (W(0.52) * k)) ** 2;
    return a <= 1 || b <= 1;
  };
  v.fill((x, y, z) => (inBody(x, y, z) ? (y < W(0.72) ? BELLY : fur(x, y, z)) : null), -W(0.62), W(0.62), W(0.38), W(1.6), -W(1.08), W(0.8));
  // the cape: a shell draped over the back, ermine-trimmed, ragged at the bottom edge
  v.fill((x, y, z) => {
    if (inBody(x, y, z) || !inBody(x, y, z, 1.1)) return null;
    if (z > W(0.55) || y < W(0.95) - (z < -W(0.6) ? W(0.15) : 0)) return null;
    const edge = y < W(1.04) || z > W(0.47);
    if (y < W(1.0) && vnoise(x * 0.5, 3, z * 0.5) > 0.6) return null;
    if (edge) return (x * 7 + z * 3) % 11 === 0 ? ERMS : ERM;
    return Math.floor(x / 3) % 2 ? CAPE : CAPEH;
  }, -W(0.7), W(0.7), W(0.85), W(1.7), -W(1.15), W(0.6));
  // head: big, with a long snout, a pink nose, buck teeth and tusks
  v.ell(0, W(1.14), W(0.95), W(0.38), W(0.34), W(0.42), fur);
  v.cap([0, W(1.08), W(1.1)], [0, W(0.98), W(1.6)], W(0.2), fur, W(0.1));
  v.ell(0, W(1.0), W(1.64), W(0.07), W(0.06), W(0.05), NOSE);
  v.box(-1, W(0.84), W(1.48), 1, W(0.94), W(1.52), TOOTH);
  for (const s of [-1, 1]) v.cap([s * W(0.13), W(0.92), W(1.36)], [s * W(0.21), W(0.78), W(1.5)], 1, TOOTH, 0.5);
  for (const s of [-1, 1]) {
    v.ell(s * W(0.17), W(1.25), W(1.22), 2.2, 2, 1.6, EYE); v.set(s * W(0.17), W(1.27), W(1.26), EYEW);
    // round ears standing up behind the eyes
    v.fill((x, y, z) => { const d = Math.hypot(x - s * W(0.3), y - W(1.52)); return d <= W(0.17) && Math.abs(z - W(0.86)) <= 1 ? (d < W(0.12) && z > W(0.86) ? PINK : PINKD) : null; }, s * W(0.3) - 5, s * W(0.3) + 5, W(1.3), W(1.75), W(0.82), W(0.9));
    // three thin whiskers a side
    for (const dy of [-2, 0, 2]) v.cap([s * W(0.1), W(1.02), W(1.5)], [s * W(0.38), W(1.02) + dy, W(1.42)], 0.4, WHISK);
  }
  // crown, between the ears, slightly askew, with gems
  v.fill((x, y, z) => {
    const cx = 0, cz = W(0.92), by = W(1.44) + Math.round(x * 0.15);
    const d = Math.hypot(x - cx, z - cz); if (d > W(0.2) || d < W(0.14)) return null;
    const h = y - by; if (h < 0) return null;
    const a = Math.atan2(z - cz, x - cx), spike = Math.abs(Math.sin(a * 3.5)) > 0.62;
    if (h > (spike ? W(0.2) : W(0.08))) return null;
    return h === 0 ? GOLDD : GOLD;
  }, -W(0.25), W(0.25), W(1.38), W(1.75), W(0.68), W(1.15));
  v.set(0, W(1.5), W(1.12), GEM); v.set(W(0.2), W(1.52), W(0.92), GEM2); v.set(-W(0.2), W(1.47), W(0.92), GEM2);
  // a gold clasp at the throat
  v.ell(0, W(1.0), W(1.12), 1.6, 1.6, 1, GOLD); v.set(0, W(1.0), W(1.15), GEM);
  // long scaly tail, curling away behind
  const pts = []; for (let k = 0; k <= 14; k++) { const t = k / 14; pts.push([W(0.45) * Math.sin(t * 2.4), W(0.75) - W(0.6) * t + W(0.1) * Math.sin(t * 5), -W(1.0) - W(1.35) * t]); }
  v.path(pts, W(0.1), 1.0, (x, y, z) => ((z % 3 === 0) ? PINKD : PINK));
}
function ratLegs(pairs) {
  return (v) => {
    const u = RU, W = (x) => R(x, u);
    const F1 = v.pal("#7a6650", 0, 0.09), F2 = v.pal("#62503f", 0, 0.09), PINK = v.pal("#e8909a", 0, 0.06), CLAW = v.pal("#f2e6c8", 0, 0.04);
    for (const [sx, sz, front] of pairs) {
      const x = sx * W(0.38), z = sz;
      v.cap([x, 0, z], [x, -W(0.32), z + (front ? 2 : -2)], W(front ? 0.14 : 0.19), (xx, yy) => (yy % 3 ? F1 : F2), W(0.11));
      v.cap([x, -W(0.32), z + (front ? 2 : -2)], [x, -W(0.56), z + (front ? 3 : 0)], W(0.09), F2, W(0.07));
      v.box(x - 2, -W(0.62), z - 1 + (front ? 3 : 0), x + 2, -W(0.58), z + 3 + (front ? 3 : 0), PINK);
      for (const dx of [-2, 0, 2]) v.set(x + dx, -W(0.62), z + 4 + (front ? 3 : 0), CLAW);
    }
  };
}
const RAT_KING = {
  height: 1.85, size: 2.2,
  parts: {
    body: part(RU, [-20, 20, 0, 40, -60, 40], ratBody),
    legsA: part(RU, [-14, 14, -16, 4, -24, 30], ratLegs([[-1, R(0.62, RU), true], [1, -R(0.68, RU), false]])),
    legsB: part(RU, [-14, 14, -16, 4, -24, 30], ratLegs([[1, R(0.62, RU), true], [-1, -R(0.68, RU), false]])),
  },
  pivots: { legsA: [0, 0.62, 0], legsB: [0, 0.62, 0] },
  anim: { legsA: "legA", legsB: "legB" },
};

// =====================================================================================================
// THE MIREWYRM — a swamp dragon, its back overgrown with moss and glowing mire-blossoms, vines and
// luminous slime trailing from its belly, ragged membrane wings veined with green light.
// =====================================================================================================
const MU = 0.06;
function wyrmBody(v) {
  const u = MU, W = (x) => R(x, u);
  const SC = v.pal("#4e7a48", 0, 0.08), SC2 = v.pal("#3c6640", 0, 0.08), BEL = v.pal("#9aa864", 0, 0.06), BELD = v.pal("#7a8a4c", 0, 0.06);
  const MOSS = v.pal("#4a8a32", 0, 0.1), MOSS2 = v.pal("#6aa83e", 0, 0.1), BLOOM = v.pal("#ff9ac0", 2.0, 0.04), HORN = v.pal("#a8a070", 0, 0.05), HORND = v.pal("#7a7450", 0, 0.05);
  const EYE = v.pal("#c6ff5a", 2.6, 0.02), SLIME = v.pal("#9cff5a", 1.9, 0.08), VINE = v.pal("#2e5a2a", 0, 0.08), TOOTH = v.pal("#e8e0c8", 0, 0.04), MOUTH = v.pal("#3a1a14", 0, 0.05);
  const scale = (x, y, z) => (y < -2 ? ((z % 3 === 0) ? BELD : BEL) : ((x + z) % 4 === 0 ? SC2 : SC));
  // torso
  v.ell(0, 0, 0, W(0.46), W(0.4), W(0.9), scale);
  // neck rising to the head
  const neck = []; for (let k = 0; k <= 8; k++) { const t = k / 8; neck.push([0, W(0.1) + W(0.42) * Math.sin(t * 1.4), W(0.7) + W(0.62) * t]); }
  v.path(neck, W(0.27), W(0.18), scale);
  // head: long jaw, brow ridges, horns sweeping back
  const hz = W(1.42), hy = W(0.52);
  v.ell(0, hy, hz, W(0.22), W(0.18), W(0.3), scale);
  v.cap([0, hy - 1, hz + 2], [0, hy - 3, hz + W(0.42)], W(0.14), scale, W(0.09));       // upper snout
  v.cap([0, hy - 5, hz + 1], [0, hy - 6, hz + W(0.38)], W(0.1), BELD, W(0.07));          // jaw
  v.box(-W(0.08), hy - 5, hz + 2, W(0.08), hy - 4, hz + W(0.36), MOUTH);
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) v.set(s * 2, hy - 4 + (i % 2), hz + 4 + i * 2, TOOTH);
  for (const s of [-1, 1]) {
    v.ell(s * W(0.13), hy + 1, hz + 3, 1.3, 1, 1.2, EYE);
    const horn = []; for (let k = 0; k <= 8; k++) { const t = k / 8; horn.push([s * (W(0.12) + W(0.22) * t), hy + 2 + W(0.28) * Math.sin(t * 1.5), hz - 2 - W(0.55) * t]); }
    v.path(horn, W(0.07), 0.6, (x, y) => (y % 2 ? HORN : HORND));
  }
  // spine of moss with glowing mire-blossoms, from the head down the tail
  v.paint((x, y, z, c) => (y > W(0.22) && z < W(0.8) && z > -W(0.9) && vnoise(x * 0.4, y * 0.4, z * 0.4) > 0.35 ? (vnoise(x * 0.9, y, z * 0.9) > 0.55 ? MOSS2 : MOSS) : null));
  for (let i = 0; i < 9; i++) { const z = W(0.6) - i * W(0.17), x = ((i * 7) % 5) - 2; v.set(x, W(0.42) + (i % 2), z, BLOOM); }
  // tail: long, sinuous, with bony spines
  const tail = []; for (let k = 0; k <= 16; k++) { const t = k / 16; tail.push([W(0.35) * Math.sin(t * 3.0), -W(0.05) - W(0.32) * t * t, -W(0.8) - W(1.7) * t]); }
  v.path(tail, W(0.28), W(0.04), scale);
  for (let k = 2; k < 15; k += 2) { const p = tail[k]; v.cap(p, [p[0], p[1] + W(0.2) * (1 - k / 16) + 2, p[2] - 2], 1.2, HORN, 0.4); }
  // tucked claws
  for (const [s, z] of [[-1, W(0.45)], [1, W(0.45)], [-1, -W(0.45)], [1, -W(0.45)]]) { v.cap([s * W(0.3), -W(0.25), z], [s * W(0.34), -W(0.5), z + 3], W(0.08), SC2, W(0.06)); v.set(s * W(0.34), -W(0.54), z + 5, TOOTH); }
  // hanging vines and dripping luminous slime under the belly
  for (let i = 0; i < 11; i++) {
    const x = ((i * 5) % 13) - 6, z = W(0.7) - i * W(0.15), len = 3 + ((i * 7) % 6);
    for (let k = 0; k < len; k++) v.set(x + (k > 3 ? (i % 2 ? 1 : -1) : 0), -W(0.38) - k, z, k === len - 1 && i % 3 === 0 ? SLIME : VINE);
  }
  for (let i = 0; i < 6; i++) v.set(((i * 4) % 9) - 4, -W(0.42) - 2, W(0.3) - i * 5, SLIME);
}
function wyrmWing(s) {
  return (v) => {
    const u = MU, W = (x) => R(x, u);
    const BONE = v.pal("#3c6640", 0, 0.06), BONEH = v.pal("#c8c090", 0, 0.05), MEM = v.pal("#3e6a3a", 0, 0.08), MEM2 = v.pal("#4c7a44", 0, 0.08), VEIN = v.pal("#9cff5a", 1.7, 0.06);
    // arm: shoulder -> elbow -> wrist, then four long fingers
    const elbow = [s * W(0.85), W(0.42), -W(0.05)], wrist = [s * W(1.55), W(0.62), -W(0.2)];
    v.cap([0, 0, 0], elbow, W(0.09), BONE, W(0.07)); v.cap(elbow, wrist, W(0.07), BONE, W(0.05));
    v.cap(wrist, [s * W(1.66), W(0.8), -W(0.12)], 1.2, BONEH, 0.5);                     // thumb claw
    const tips = [[s * W(2.25), W(0.25), -W(0.45)], [s * W(2.05), -W(0.05), -W(0.85)], [s * W(1.6), -W(0.25), -W(1.15)], [s * W(0.95), -W(0.2), -W(1.05)]];
    for (const t of tips) v.cap(wrist, t, W(0.045), BONE, 0.6);
    // membrane: a thin sheet between the arm, the fingers and the body, torn in places
    const poly = [[0, 0, 0], elbow, wrist, ...tips, [0, -W(0.1), -W(0.75)]];
    const inside = (px, pz) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, , zi] = poly[i], [xj, , zj] = poly[j]; if (((zi > pz) !== (zj > pz)) && (px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi)) c = !c; } return c; };
    v.fill((x, y, z) => {
      if (!inside(x, z)) return null;
      const ax = Math.abs(x) / W(2.2), sag = Math.round(W(0.45) * ax - W(0.35) * (-z / W(1.2)) * (1 - ax * 0.5));
      if (y !== sag) return null;
      if (vnoise(x * 0.3, 0, z * 0.3) > 0.8) return null;                                // tears
      // veins: lines from the wrist to each fingertip
      for (const t of tips) { const dx = t[0] - wrist[0], dz = t[2] - wrist[2], L = Math.hypot(dx, dz); const d = Math.abs((x - wrist[0]) * dz - (z - wrist[2]) * dx) / L; if (d < 0.7 && (x - wrist[0]) * dx + (z - wrist[2]) * dz > 0) return VEIN; }
      return (Math.floor(x / 4) + Math.floor(z / 4)) % 2 ? MEM : MEM2;
    }, Math.min(0, s * W(2.4)), Math.max(0, s * W(2.4)), -W(0.6), W(0.9), -W(1.3), W(0.2));
  };
}
const MIREWYRM = {
  height: 1.4, size: 2.6, hover: 3.5, fly: true,
  parts: {
    body: part(MU, [-14, 14, -16, 18, -62, 34], wyrmBody),
    wingL: part(MU, [-42, 2, -12, 16, -24, 6], wyrmWing(-1)),
    wingR: part(MU, [-2, 42, -12, 16, -24, 6], wyrmWing(1)),
  },
  pivots: { wingL: [-0.36, 0.26, 0.15], wingR: [0.36, 0.26, 0.15] },
  anim: { wingL: "flapL", wingR: "flapR" },
};

// =====================================================================================================
// THE CLOCKWORK COLOSSUS — a walking foundry: a riveted brass boiler-chest with a furnace grate and a
// pressure gauge, open gears, twin smoking stacks, a single red lens, piston limbs, a steam hammer.
// =====================================================================================================
const CU = 0.06;
function colossusBody(v) {
  const u = CU, W = (x) => R(x, u);
  const BR = v.pal("#b08a3a", 0, 0.06), BRH = v.pal("#d8b060", 0, 0.05), BRD = v.pal("#7a5a22", 0, 0.06), IR = v.pal("#4a4a52", 0, 0.06), IRD = v.pal("#2e2e34", 0, 0.06);
  const RIV = v.pal("#f0d690", 0, 0.03), FIRE = v.pal("#ffb15c", 2.2, 0.06), FIRE2 = v.pal("#ff7a28", 1.8, 0.06), GLASS = v.pal("#e8f0e8", 0, 0.02), NEEDLE = v.pal("#c03030", 0, 0);
  const EYE = v.pal("#ff4d4d", 2.6, 0.02), EYEW = v.pal("#ffe0e0", 3, 0), SOOT = v.pal("#1e1c1e", 0, 0.08), STEAM = v.pal("#ffd8a0", 1.6, 0.05);
  // pelvis gearbox
  v.box(-W(0.62), W(0.82), -W(0.42), W(0.62), W(1.26), W(0.42), (x, y) => (y === W(0.82) || y === W(1.26) ? BRD : IR));
  for (const s of [-1, 1]) v.cyl(s * W(0.62), W(1.04), 0, W(0.16), s * W(0.7), BR, "x");
  // boiler chest: a vertical riveted drum
  v.fill((x, y, z) => {
    const r = W(0.86) - Math.round(Math.max(0, y - W(2.4)) * 0.4);
    const d = Math.hypot(x, z * 1.15); if (d > r) return null;
    const band = (y - W(1.2)) % 9 === 0;
    if (band) return IRD;
    if (d > r - 1 && (y - W(1.2)) % 9 === 2 && Math.round(Math.atan2(z, x) * 8) % 2 === 0) return RIV;   // rivet rows
    return (Math.floor(Math.atan2(z, x) * 3) % 2) ? BR : BRH;
  }, -W(0.9), W(0.9), W(1.2), W(2.7), -W(0.8), W(0.8));
  // furnace grate on the chest: bars over fire
  v.fill((x, y, z) => {
    if (Math.abs(x) > W(0.34) || y < W(1.5) || y > W(2.08) || z < W(0.66)) return null;
    if (z > W(0.72)) return (x % 3 === 0) ? IRD : null;
    return (y < W(1.66) ? FIRE : FIRE2);
  }, -W(0.36), W(0.36), W(1.5), W(2.1), W(0.6), W(0.78));
  v.box(-W(0.38), W(1.46), W(0.7), W(0.38), W(1.5), W(0.78), BRD); v.box(-W(0.38), W(2.08), W(0.7), W(0.38), W(2.12), W(0.78), BRD);
  // pressure gauge, top left
  v.fill((x, y, z) => { const d = Math.hypot(x + W(0.5), y - W(2.32)); if (d > W(0.15) || z < W(0.56) || z > W(0.62)) return null; return d > W(0.12) ? BRH : (Math.abs((x + W(0.5)) - (y - W(2.32))) < 0.7 && x + W(0.5) > 0 ? NEEDLE : GLASS); }, -W(0.7), -W(0.3), W(2.12), W(2.5), W(0.5), W(0.64));
  // open gears on the right flank
  for (const [cy, cz, r] of [[W(1.75), W(0.15), W(0.26)], [W(2.18), -W(0.2), W(0.18)]]) {
    v.fill((x, y, z) => { const d = Math.hypot(y - cy, z - cz), a = Math.atan2(y - cy, z - cz); const rr = r + (Math.sin(a * 10) > 0 ? 1.2 : 0); if (d > rr || d < r * 0.35 || x < W(0.84) || x > W(0.92)) return null; return d < r * 0.55 ? BRD : BRH; }, W(0.82), W(0.95), cy - r - 2, cy + r + 2, cz - r - 2, cz + r + 2);
  }
  // shoulders: riveted domes
  for (const s of [-1, 1]) { v.ell(s * W(0.92), W(2.42), 0, W(0.3), W(0.26), W(0.32), BR); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; v.set(s * W(0.92) + Math.round(Math.cos(a) * 4), W(2.6), Math.round(Math.sin(a) * 4), RIV); } }
  // twin stacks: sooty, banded, glowing mouths with a puff of hot steam
  for (const s of [-1, 1]) {
    v.cyl(s * W(0.42), W(2.45), -W(0.5), W(0.13), W(3.45), (x, y) => (y % 6 === 0 ? BRD : y > W(3.25) ? SOOT : IR));
    v.cyl(s * W(0.42), W(3.36), -W(0.5), W(0.17), W(3.45), BRD);
    v.cyl(s * W(0.42), W(3.45), -W(0.5), W(0.09), W(3.48), FIRE);
    v.ell(s * W(0.46), W(3.66), -W(0.55), 2.5, 2, 2.5, STEAM);
  }
  // head: a dome with a single red lens and a visor slit
  v.ell(0, W(2.78), W(0.04), W(0.32), W(0.3), W(0.32), (x, y) => (y > W(2.95) ? BRH : IR));
  v.box(-W(0.26), W(2.74), W(0.24), W(0.26), W(2.78), W(0.36), IRD);
  v.ell(0, W(2.86), W(0.33), 2.5, 2.5, 1.2, EYE); v.set(0, W(2.87), W(0.36), EYEW);
}
function colossusLeg(v) {
  const u = CU, W = (x) => R(x, u);
  const BR = v.pal("#b08a3a", 0, 0.06), BRH = v.pal("#d8b060", 0, 0.05), IR = v.pal("#4a4a52", 0, 0.06), IRD = v.pal("#2e2e34", 0, 0.06), ST = v.pal("#b8bcc6", 0, 0.03);
  v.cap([0, 0, 0], [0, -W(0.42), 0], W(0.2), IR, W(0.18));                                 // thigh
  v.ell(0, -W(0.46), W(0.04), W(0.17), W(0.15), W(0.17), BRH);                            // knee
  v.cap([0, -W(0.5), -W(0.05)], [0, -W(0.85), 0], W(0.17), (x, y) => (y % 5 === 0 ? BR : IR), W(0.2)); // shin
  v.cap([0, -W(0.1), W(0.17)], [0, -W(0.62), W(0.2)], 1, ST);                              // piston rod
  v.box(-W(0.24), -W(0.99), -W(0.2), W(0.24), -W(0.86), W(0.36), IRD);                    // foot
  for (const dx of [-W(0.15), 0, W(0.15)]) v.box(dx - 2, -W(0.99), W(0.36), dx + 2, -W(0.9), W(0.44), BR);
}
function colossusArm(s) {
  return (v) => {
    const u = CU, W = (x) => R(x, u);
    const BR = v.pal("#b08a3a", 0, 0.06), BRH = v.pal("#d8b060", 0, 0.05), BRD = v.pal("#7a5a22", 0, 0.06), IR = v.pal("#4a4a52", 0, 0.06), IRD = v.pal("#2e2e34", 0, 0.06), ST = v.pal("#b8bcc6", 0, 0.03), FIRE = v.pal("#ffb15c", 2.0, 0.06);
    v.cap([0, 0, 0], [s * 2, -W(0.55), 0], W(0.17), IR, W(0.15));
    v.ell(s * 2, -W(0.58), 0, W(0.15), W(0.14), W(0.15), BRH);
    v.cap([s * 2, -W(0.62), 0], [s * 2, -W(1.1), W(0.1)], W(0.2), (x, y) => (y % 5 === 0 ? BRD : BR), W(0.22));
    v.cap([s * 2 + s * W(0.18), -W(0.2), 0], [s * 2 + s * W(0.2), -W(0.95), W(0.08)], 1, ST);
    if (s < 0) {
      // a three-fingered claw
      for (const [dx, dz] of [[-W(0.12), W(0.12)], [W(0.12), W(0.12)], [0, -W(0.12)]]) v.cap([s * 2 + dx, -W(1.15), W(0.1) + dz], [s * 2 + dx * 1.4, -W(1.45), W(0.1) + dz * 1.6], W(0.05), IRD, W(0.03));
    } else {
      // the steam hammer: a banded iron head across the fist, glowing vents
      v.cap([s * 2, -W(1.12), W(0.08)], [s * 2, -W(1.3), W(0.08)], W(0.1), IRD);
      v.cyl(s * 2 - W(0.36), -W(1.45), W(0.08), W(0.24), s * 2 + W(0.36), (x) => (Math.abs(x - s * 2) % 6 === 0 ? BRH : IR), "x");
      for (const e of [-1, 1]) v.cyl(s * 2 + e * W(0.37), -W(1.45), W(0.08), W(0.18), s * 2 + e * W(0.4), BRD, "x");
      for (const dz of [-3, 0, 3]) v.set(s * 2, -W(1.45) + W(0.24), W(0.08) + dz, FIRE);
    }
  };
}
const CLOCKWORK = {
  height: 3.2, size: 3.0,
  parts: {
    body: part(CU, [-22, 22, 12, 64, -16, 16], colossusBody),
    legL: part(CU, [-6, 6, -18, 2, -6, 9], colossusLeg),
    legR: part(CU, [-6, 6, -18, 2, -6, 9], colossusLeg),
    armL: part(CU, [-12, 10, -28, 3, -6, 8], colossusArm(-1)),
    armR: part(CU, [-10, 12, -30, 3, -6, 8], colossusArm(1)),
  },
  pivots: { legL: [-0.5, 0.99, 0], legR: [0.5, 0.99, 0], armL: [-1.2, 2.32, 0], armR: [1.2, 2.32, 0] },
  anim: { legL: "legA", legR: "legB", armL: "swingB", armR: "swingA" },
};

// =====================================================================================================
// THE ECLIPSE HERALD — half sun, half moon: a robe split down the middle in gold-white and night,
// a sun-and-moon mask, an eclipsed disc with a burning corona behind its head, light in one hand and
// shadow in the other, and a ring of sun and moon shards circling it.
// =====================================================================================================
const EU = 0.05;
function heraldBody(v) {
  const u = EU, W = (x) => R(x, u);
  const SUN = v.pal("#d4c294", 0, 0.05), SUNH = v.pal("#e6d8ae", 0, 0.04), GOLD = v.pal("#c89a34", 0, 0.05), NIGHT = v.pal("#1a1428", 0, 0.06), NIGHTH = v.pal("#2a2040", 0, 0.06), SILV = v.pal("#c8c8e0", 0, 0.04);
  const GL = v.pal("#ffc23d", 1.6, 0.04), GLW = v.pal("#ffe6a0", 1.9, 0.02), PU = v.pal("#b46cff", 1.6, 0.05), PUW = v.pal("#dcc0ff", 1.9, 0.02), DISC = v.pal("#0c0812", 0, 0.03);
  const half = (x, light, dark) => (x < 0 ? light : dark);
  // robe: a long tapering gown, split down the middle, with hem trims and falling folds
  v.fill((x, y, z) => {
    const t = y / W(1.55), r = lerp(W(0.08), W(0.55), Math.pow(t, 0.6)) * (1 + 0.06 * Math.sin(Math.atan2(z, x) * 7));
    if (Math.hypot(x, z * 1.2) > r) return null;
    if (Math.abs(x) < 0.6 && z > 0) return GOLD;                                             // the seam
    const fold = Math.sin(Math.atan2(z, x) * 7) > 0.5;
    if ((y % 10) === 0 && y > W(0.3)) return half(x, GOLD, PU);                              // trims
    return half(x, fold ? SUNH : SUN, fold ? NIGHTH : NIGHT);
  }, -W(0.6), W(0.6), 0, W(1.55), -W(0.5), W(0.5));
  // torso and shoulders
  v.ell(0, W(1.75), 0, W(0.42), W(0.32), W(0.3), (x) => half(x, SUN, NIGHT));
  v.box(-W(0.4), W(1.52), -W(0.3), W(0.4), W(1.56), W(0.3), (x) => half(x, GOLD, PU));
  // sleeves, open arms with a light in one hand and a shadow-flame in the other
  for (const s of [-1, 1]) {
    v.cap([s * W(0.36), W(1.86), 0], [s * W(0.85), W(1.45), W(0.2)], W(0.13), (x) => half(x, SUN, NIGHT), W(0.18));
    v.cap([s * W(0.85), W(1.45), W(0.2)], [s * W(1.0), W(1.32), W(0.26)], W(0.08), (x) => half(x, SUNH, NIGHTH));
    v.ell(s * W(1.08), W(1.4), W(0.3), 2.6, 2.6, 2.6, s < 0 ? GL : PU);
    v.ell(s * W(1.08), W(1.4), W(0.3), 1.2, 1.2, 1.2, s < 0 ? GLW : PUW);
  }
  // head: a mask, sun on the left, moon on the right, with a hood rim
  v.ell(0, W(2.18), 0, W(0.22), W(0.25), W(0.22), (x) => half(x, SUNH, NIGHTH));
  v.fill((x, y, z) => (z > W(0.15) && Math.hypot(x, y - W(2.18)) < W(0.2) ? (x < 0 ? GOLD : (Math.hypot(x - 2, y - W(2.2)) < W(0.13) && Math.hypot(x - 4, y - W(2.23)) > W(0.11) ? SILV : NIGHT)) : null), -W(0.22), W(0.22), W(1.96), W(2.42), W(0.12), W(0.26));
  v.box(-W(0.12), W(2.2), W(0.22), -W(0.06), W(2.23), W(0.26), GLW); v.box(W(0.06), W(2.2), W(0.22), W(0.12), W(2.23), W(0.26), PUW);
  // the eclipse behind the head: a black disc, a burning corona half gold, half violet, and rays
  const ec = [0, W(2.25), -W(0.3)], rD = W(0.5);
  v.fill((x, y, z) => {
    const d = Math.hypot(x - ec[0], y - ec[1]); if (Math.abs(z - ec[2]) > 0.6) return null;
    if (d <= rD) return DISC;
    if (d <= rD + 2) return x < 0 ? GL : PU;
    const a = Math.atan2(y - ec[1], x - ec[0]);
    if (d <= rD + 2 + 6 * Math.max(0, Math.cos(a * 8)) ** 6) return x < 0 ? GLW : PUW;       // rays
    return null;
  }, -W(0.95), W(0.95), W(1.3), W(3.2), ec[2] - 1, ec[2] + 1);
}
function heraldRing(v) {
  const u = EU, W = (x) => R(x, u);
  const GL = v.pal("#ffc23d", 1.6, 0.04), GLW = v.pal("#ffe6a0", 1.9, 0.02), PU = v.pal("#b46cff", 1.6, 0.05), PUW = v.pal("#dcc0ff", 1.9, 0.02);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, cx = Math.round(Math.cos(a) * W(1.05)), cz = Math.round(Math.sin(a) * W(1.05)), sun = i % 2 === 0;
    // a diamond-shaped shard, pointing up
    v.fill((x, y, z) => (Math.abs(x - cx) + Math.abs(y) * 0.5 + Math.abs(z - cz) <= 2.2 ? (Math.abs(y) < 1 ? (sun ? GLW : PUW) : (sun ? GL : PU)) : null), cx - 3, cx + 3, -5, 5, cz - 3, cz + 3);
  }
}
const ECLIPSE_HERALD = {
  height: 2.65, size: 1.6, hover: 0.95,
  parts: {
    body: part(EU, [-24, 24, -1, 66, -12, 12], heraldBody),
    ring: part(EU, [-26, 26, -6, 6, -26, 26], heraldRing),
  },
  pivots: { ring: [0, 0.8, 0] },
  anim: { ring: "orbit" },
};

export const BOSS_MODELS = {
  endboss: SEALED_ONE,
  boss: WARLORD,
  rat_king: RAT_KING,
  mirewyrm: MIREWYRM,
  clockwork_colossus: CLOCKWORK,
  eclipse_herald: ECLIPSE_HERALD,
};
