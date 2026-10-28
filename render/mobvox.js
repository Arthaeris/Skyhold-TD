/* Skyhold TD — render/mobvox.js
   The regular enemies as voxel sculpts. Every enemy is still a short SPEC (render/mobmodels.js MOB_SPECS)
   on one of the body plans — biped, golem, quad, insect, flyer, floater, blob, serpent, tank — with its
   accessories (horns, hoods, crowns, shells, banners, gears…), weapons and shields. This file turns a spec
   into rounded voxel forms: superellipsoid torsos and heads, capsule limbs with hands, paws and boots,
   jointed insect legs, membrane wings, tattered wraith hems, coiled serpent tails, treads with wheels.
   The output keeps the model format (parts, pivots, anim, height, size, hover), so the instanced enemy
   renderer, the thumbnails and the bestiary use it unchanged. Voxel size scales with the creature. */
import * as THREE from "three";
import { Vox, vnoise } from "./voxkit.js";
import { TAU, shade, mix } from "./kit.js";

// ---------------------------------------------------------------------------
// W: a Vox addressed in model units (so plans can be written like the old box-built ones)
// ---------------------------------------------------------------------------
class W {
  constructor(u, x0, x1, y0, y1, z0, z1) { this.u = u; this.v = new Vox(u, Math.floor(x0 / u), Math.ceil(x1 / u), Math.floor(y0 / u), Math.ceil(y1 / u), Math.floor(z0 / u), Math.ceil(z1 / u)); this.cache = new Map(); }
  c(hex, e = 0, j = 0.06) { return this.v.pal(hex, e, j); }
  g(hex, e = 1.8) { return this.v.pal(hex, e, 0.03); }
  _p(p) { if (typeof p !== "function") return p; const u = this.u; return (i, j, k) => p(i * u, j * u, k * u); }
  // rounded box (superellipsoid, n = 2 sphere-ish … 8 nearly a box) centred at (x,y,z) with full size w,h,d
  rbox(x, y, z, w, h, d, p, n = 4) {
    const u = this.u, P = this._p(p), a = w / 2, b = h / 2, c = d / 2;
    this.v.fill((i, j, k) => { const X = Math.abs(i * u - x) / a, Y = Math.abs(j * u - y) / b, Z = Math.abs(k * u - z) / c; return X ** n + Y ** n + Z ** n <= 1 ? (typeof P === "function" ? P(i, j, k) : P) : null; }, (x - a) / u - 1, (x + a) / u + 1, (y - b) / u - 1, (y + b) / u + 1, (z - c) / u - 1, (z + c) / u + 1);
  }
  box(x, y, z, w, h, d, p) { const u = this.u; this.v.box(Math.round((x - w / 2) / u + 0.5), Math.round((y - h / 2) / u + 0.5), Math.round((z - d / 2) / u + 0.5), Math.round((x + w / 2) / u - 0.5), Math.round((y + h / 2) / u - 0.5), Math.round((z + d / 2) / u - 0.5), this._p(p)); }
  ell(x, y, z, rx, ry, rz, p) { const u = this.u; this.v.ell(x / u, y / u, z / u, Math.max(0.6, rx / u), Math.max(0.6, ry / u), Math.max(0.6, rz / u), this._p(p)); }
  cap(a, b, r0, p, r1 = r0) { const u = this.u; this.v.cap(a.map((q) => q / u), b.map((q) => q / u), Math.max(0.55, r0 / u), this._p(p), Math.max(0.55, r1 / u)); }
  path(pts, r0, r1, p) { const u = this.u; this.v.path(pts.map((q) => q.map((c) => c / u)), Math.max(0.55, r0 / u), Math.max(0.55, r1 / u), this._p(p)); }
  set(x, y, z, p) { const u = this.u; this.v.set(Math.round(x / u), Math.round(y / u), Math.round(z / u), p); }
  fill(fn, x0, x1, y0, y1, z0, z1) { const u = this.u; this.v.fill((i, j, k) => fn(i * u, j * u, k * u), x0 / u - 1, x1 / u + 1, y0 / u - 1, y1 / u + 1, z0 / u - 1, z1 / u + 1); }
  carve(fn) { const u = this.u; this.v.carve((i, j, k) => fn(i * u, j * u, k * u)); }
  emit(P) { this.v.emit(P, 0, 0, 0, 6); }
}
const make = (s, x, y0, y1, z) => new W(Math.max(0.016, 0.042 * s), -x * s, x * s, y0 * s, y1 * s, -z * s, z * s);
const hsh = (x, y, z) => { let h = (Math.round(x * 97) * 374761393 + Math.round(y * 97) * 668265263 + Math.round(z * 97) * 1442695041) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// glowing eyes on a front face at height y, depth z
function eyes(w, o, x, y, z, s, gap = 0.1) {
  const E = w.g(o.eye || "#ffd23d", 2.2), r = Math.max(w.u * 0.7, 0.045 * s);
  for (const sx of [-1, 1]) w.ell(x + sx * gap * s, y, z, r, r * 0.8, w.u * 0.8, E);
}

// ---------------------------------------------------------------------------
// ACCESSORIES (w, o, a) with anchor a = { x, y, z, s } in model units
// ---------------------------------------------------------------------------
const EX = {
  horns(w, o, a) { const C = w.c(o.horn || "#2a1a14"), C2 = w.c(shade(o.horn || "#2a1a14", 1.4)), s = a.s; for (const sx of [-1, 1]) w.path([[a.x + sx * 0.13 * s, a.y, a.z], [a.x + sx * 0.24 * s, a.y + 0.18 * s, a.z - 0.04 * s], [a.x + sx * 0.3 * s, a.y + 0.34 * s, a.z - 0.1 * s]], 0.06 * s, 0.02 * s, (x, y) => (y > a.y + 0.25 * s ? C2 : C)); },
  curlHorns(w, o, a) { const C = w.c(o.horn || "#c9a24a"), s = a.s; for (const sx of [-1, 1]) w.path([[a.x + sx * 0.14 * s, a.y, a.z], [a.x + sx * 0.3 * s, a.y + 0.06 * s, a.z - 0.1 * s], [a.x + sx * 0.36 * s, a.y - 0.12 * s, a.z - 0.02 * s], [a.x + sx * 0.28 * s, a.y - 0.2 * s, a.z + 0.1 * s]], 0.07 * s, 0.03 * s, (x, y, z) => ((Math.round((x + y) / (0.05 * s)) & 1) ? C : w.c(shade(o.horn || "#c9a24a", 0.8)))); },
  antlers(w, o, a) { const G = w.g(o.horn || "#7fffd0", 1.5), s = a.s; for (const sx of [-1, 1]) { w.path([[a.x + sx * 0.12 * s, a.y, a.z], [a.x + sx * 0.25 * s, a.y + 0.28 * s, a.z - 0.04 * s], [a.x + sx * 0.4 * s, a.y + 0.5 * s, a.z - 0.06 * s]], 0.035 * s, 0.02 * s, G); w.cap([a.x + sx * 0.22 * s, a.y + 0.22 * s, a.z], [a.x + sx * 0.12 * s, a.y + 0.44 * s, a.z + 0.06 * s], 0.025 * s, G); w.cap([a.x + sx * 0.33 * s, a.y + 0.4 * s, a.z], [a.x + sx * 0.46 * s, a.y + 0.48 * s, a.z + 0.06 * s], 0.025 * s, G); } },
  crown(w, o, a) { const C = w.c(o.crownC || "#ffd23d"), CH = w.c(shade(o.crownC || "#ffd23d", 1.25)), GEM = w.g(o.gem || "#ff3b6b", 2), s = a.s; w.fill((x, y, z) => { const d = Math.hypot(x - a.x, z - a.z), ang = Math.atan2(z - a.z, x - a.x), pt = 1 - Math.abs(((ang / TAU) * 5 % 1 + 1) % 1 - 0.5) * 2; return d <= 0.19 * s && d >= 0.13 * s && y >= a.y && y <= a.y + (0.06 + pt * 0.12) * s ? (y > a.y + 0.08 * s ? CH : C) : null; }, a.x - 0.2 * s, a.x + 0.2 * s, a.y, a.y + 0.2 * s, a.z - 0.2 * s, a.z + 0.2 * s); w.set(a.x, a.y + 0.04 * s, a.z + 0.19 * s, GEM); },
  hood(w, o, a) { const C = w.c(o.hoodC || shade(o.c1, 0.8)), D = w.c(shade(o.hoodC || shade(o.c1, 0.8), 0.6)), s = a.s; w.ell(a.x, a.y - 0.08 * s, a.z - 0.04 * s, 0.27 * s, 0.3 * s, 0.27 * s, C); w.cap([a.x, a.y + 0.12 * s, a.z - 0.1 * s], [a.x, a.y + 0.28 * s, a.z - 0.24 * s], 0.1 * s, C, 0.03 * s); w.ell(a.x, a.y - 0.14 * s, a.z + 0.2 * s, 0.18 * s, 0.2 * s, 0.12 * s, 0); w.ell(a.x, a.y - 0.14 * s, a.z + 0.13 * s, 0.17 * s, 0.19 * s, 0.06 * s, D); for (const sx of [-1, 1]) w.ell(a.x + sx * 0.07 * s, a.y - 0.12 * s, a.z + 0.17 * s, 0.035 * s, 0.03 * s, w.u, w.g(o.eye || "#ffd23d", 2.2)); },
  halo(w, o, a) { const G = w.g(o.haloC || "#ffe066", 1.9), s = a.s; w.fill((x, y, z) => { const d = Math.hypot(x - a.x, z - a.z); return d >= 0.22 * s && d <= 0.29 * s && Math.abs(y - a.y - 0.3 * s) <= w.u * 0.6 ? G : null; }, a.x - 0.3 * s, a.x + 0.3 * s, a.y + 0.28 * s, a.y + 0.32 * s, a.z - 0.3 * s, a.z + 0.3 * s); },
  tusks(w, o, a) { const C = w.c("#f0e8d0"), s = a.s; for (const sx of [-1, 1]) w.path([[a.x + sx * 0.12 * s, a.y - 0.12 * s, a.z + 0.18 * s], [a.x + sx * 0.15 * s, a.y - 0.2 * s, a.z + 0.26 * s], [a.x + sx * 0.13 * s, a.y - 0.08 * s, a.z + 0.32 * s]], 0.035 * s, 0.015 * s, C); },
  antennae(w, o, a) { const C = w.c(shade(o.c1, 0.8)), G = w.g(o.horn || o.gl || "#fff2a8", 2), s = a.s; for (const sx of [-1, 1]) { w.path([[a.x + sx * 0.08 * s, a.y - 0.02 * s, a.z + 0.05 * s], [a.x + sx * 0.14 * s, a.y + 0.16 * s, a.z + 0.1 * s], [a.x + sx * 0.22 * s, a.y + 0.26 * s, a.z + 0.04 * s]], 0.02 * s, 0.015 * s, C); w.ell(a.x + sx * 0.22 * s, a.y + 0.27 * s, a.z + 0.04 * s, 0.04 * s, 0.04 * s, 0.04 * s, G); } },
  mask(w, o, a) { const C = w.c(o.maskC || "#e8dcc0"), s = a.s; w.rbox(a.x, a.y - 0.02 * s, a.z + 0.21 * s, 0.34 * s, 0.3 * s, 0.06 * s, C, 3); for (const sx of [-1, 1]) w.ell(a.x + sx * 0.08 * s, a.y + 0.02 * s, a.z + 0.24 * s, 0.04 * s, 0.03 * s, w.u, w.g(o.eye || "#ff3b6b", 2.2)); w.box(a.x, a.y - 0.1 * s, a.z + 0.24 * s, 0.16 * s, w.u, w.u, w.c("#3a2a20")); },
  hat(w, o, a) { const B = w.c("#1a1418"), R = w.c("#a3262a"), s = a.s; w.fill((x, y, z) => { const d = Math.hypot(x - a.x, z - a.z); return (y <= a.y + 0.05 * s && d <= 0.27 * s) || (y > a.y && y <= a.y + 0.36 * s && d <= 0.15 * s) ? (y > a.y + 0.08 * s && y < a.y + 0.14 * s && d > 0.12 * s ? R : B) : null; }, a.x - 0.28 * s, a.x + 0.28 * s, a.y, a.y + 0.36 * s, a.z - 0.28 * s, a.z + 0.28 * s); },
  turban(w, o, a) { const C = w.c(o.c3 || "#e8dcc0"), s = a.s; w.ell(a.x, a.y + 0.06 * s, a.z, 0.24 * s, 0.14 * s, 0.24 * s, (x, y, z) => ((Math.round((y - x * 0.5) / (0.04 * s)) & 1) ? C : w.c(shade(o.c3 || "#e8dcc0", 0.85)))); w.ell(a.x, a.y + 0.08 * s, a.z + 0.22 * s, 0.05 * s, 0.05 * s, 0.03 * s, w.g(o.gl || "#7fe8ff", 2)); },
  helm(w, o, a) { const C = w.c(o.helmC || "#8a8f99"), CH = w.c(shade(o.helmC || "#8a8f99", 1.25)), CD = w.c(shade(o.helmC || "#8a8f99", 0.7)), s = a.s; w.fill((x, y, z) => { const dx = x - a.x, dy = y - (a.y - 0.08 * s), dz = z - a.z, e = (dx / 0.26 / s) ** 2 + (Math.max(0, dy) / 0.3 / s) ** 2 + (dz / 0.26 / s) ** 2; if (e > 1 || dy < -0.02 * s) return null; if (dz > 0.15 * s && dy < 0.16 * s && Math.abs(dx) < 0.15 * s && dy > 0.02 * s) return Math.abs(dy - 0.1 * s) < w.u ? CD : null; return dy < 0.02 * s ? CD : e < 0.75 ? CH : C; }, a.x - 0.27 * s, a.x + 0.27 * s, a.y - 0.12 * s, a.y + 0.25 * s, a.z - 0.27 * s, a.z + 0.27 * s); w.cap([a.x, a.y + 0.2 * s, a.z + 0.1 * s], [a.x, a.y + 0.27 * s, a.z - 0.2 * s], 0.035 * s, CD); },
  cap(w, o, a) { const C = w.c(o.capC || "#8a3a3a"), CH = w.c(shade(o.capC || "#8a3a3a", 1.2)), s = a.s; w.fill((x, y, z) => { const d = Math.hypot(x - a.x, z - a.z), hh = 0.3 * s * Math.sqrt(Math.max(0, 1 - (d / (0.42 * s)) ** 2)); return y >= a.y && y <= a.y + hh ? (y > a.y + hh - w.u * 1.2 && hsh(x, 1, z) < 0.18 ? w.c("#f4ead4") : y > a.y + hh * 0.6 ? CH : C) : null; }, a.x - 0.42 * s, a.x + 0.42 * s, a.y, a.y + 0.3 * s, a.z - 0.42 * s, a.z + 0.42 * s); for (let i = 0; i < 5; i++) { const an = i * 1.3; w.set(a.x + Math.cos(an) * 0.3 * s, a.y + 0.02 * s, a.z + Math.sin(an) * 0.3 * s, w.g(o.gl || "#ffe0a0", 1.6)); } },
  leaves(w, o, a) { const L1 = w.c("#4f8f3a"), L2 = w.c("#3c7a30"), L3 = w.c("#7fcf5a"), s = a.s; for (const [x, y, z, r] of [[0, 0.06, 0, 0.26], [-0.14, 0.2, 0.05, 0.18], [0.14, 0.24, -0.06, 0.2], [0, 0.38, 0, 0.15]]) w.ell(a.x + x * s, a.y + y * s, a.z + z * s, r * s, r * 0.7 * s, r * s, (xx, yy, zz) => (yy > a.y + (y + r * 0.3) * s ? L3 : hsh(xx, yy, zz) < 0.5 ? L1 : L2)); },
  hair(w, o, a) { const C = w.c(o.hairC || "#4f8f3a"), C2 = w.c(shade(o.hairC || "#4f8f3a", 1.2)), s = a.s; w.ell(a.x, a.y + 0.06 * s, a.z - 0.02 * s, 0.25 * s, 0.13 * s, 0.25 * s, C2); w.fill((x, y, z) => (z < a.z - 0.06 * s && z > a.z - 0.26 * s && Math.abs(x - a.x) < 0.22 * s && y < a.y + 0.06 * s && y > a.y - 0.45 * s + Math.abs(x - a.x) * 0.6 ? ((Math.round((x - a.x) / (0.05 * s)) & 1) ? C : C2) : null), a.x - 0.23 * s, a.x + 0.23 * s, a.y - 0.45 * s, a.y + 0.06 * s, a.z - 0.27 * s, a.z - 0.05 * s); },
  tentacles(w, o, a) { const C = w.c(o.c3 || "#a87aa8"), s = a.s; for (let i = 0; i < 4; i++) { const x = a.x + (i - 1.5) * 0.08 * s; w.path([[x, a.y - 0.12 * s, a.z + 0.18 * s], [x + (i - 1.5) * 0.03 * s, a.y - 0.3 * s, a.z + 0.24 * s], [x, a.y - 0.42 * s, a.z + 0.2 * s]], 0.04 * s, 0.015 * s, C); } },
  eyesMany(w, o, a) { const E = w.g(o.eye || "#5dffb0", 2.2), s = a.s; for (let i = 0; i < 7; i++) { const an = (i / 7) * TAU; w.ell(a.x + Math.cos(an) * 0.16 * s, a.y - 0.1 * s + Math.sin(an) * 0.12 * s, a.z + 0.22 * s, 0.035 * s, 0.035 * s, w.u, E); } },
  maw(w, o, a) { const s = a.s; w.box(a.x, a.y - 0.1 * s, a.z + 0.38 * s, 0.5 * s, 0.12 * s, w.u * 1.5, w.c("#1a0a12")); for (let i = 0; i < 6; i++) { w.set(a.x - 0.2 * s + i * 0.08 * s, a.y - 0.05 * s, a.z + 0.4 * s, w.c("#f0e8d0")); w.set(a.x - 0.16 * s + i * 0.08 * s, a.y - 0.15 * s, a.z + 0.4 * s, w.c("#f0e8d0")); } },
  // torso extras
  banner(w, o, a) { const s = a.s, P = w.c("#5a4030"), F = w.c(o.flag || "#c94a4a"), F2 = w.c(shade(o.flag || "#c94a4a", 0.75)); w.cap([a.x + 0.1 * s, a.y - 0.2 * s, a.z - 0.3 * s], [a.x + 0.1 * s, a.y + 1.2 * s, a.z - 0.3 * s], 0.03 * s, P); w.fill((x, y, z) => (Math.abs(x - a.x - 0.1 * s) <= w.u && z < a.z - 0.32 * s && z > a.z - 0.85 * s && y < a.y + 1.15 * s && y > a.y + 0.65 * s - Math.abs(z - a.z + 0.58 * s) * 0.3 ? (Math.abs(y - a.y - 0.92 * s) < 0.05 * s ? w.c("#ffd23d") : z < a.z - 0.6 * s ? F2 : F) : null), a.x, a.x + 0.2 * s, a.y + 0.6 * s, a.y + 1.2 * s, a.z - 0.9 * s, a.z - 0.3 * s); w.ell(a.x + 0.1 * s, a.y + 1.26 * s, a.z - 0.3 * s, 0.06 * s, 0.06 * s, 0.06 * s, w.g("#ffd23d", 2)); },
  drum(w, o, a) { const s = a.s, B = w.c("#c9a24a"), T = w.c("#f0e0c0"), R = w.c("#8a2a1a"); w.fill((x, y, z) => { const d = Math.hypot(x - a.x, z - a.z - 0.4 * s); return d <= 0.25 * s && Math.abs(y - a.y + 0.1 * s) <= 0.18 * s ? (y > a.y + 0.06 * s ? T : Math.abs(y - a.y + 0.1 * s) > 0.14 * s ? R : ((Math.round(Math.atan2(z - a.z, x - a.x) * 5) & 1) ? B : R)) : null; }, a.x - 0.26 * s, a.x + 0.26 * s, a.y - 0.3 * s, a.y + 0.1 * s, a.z + 0.13 * s, a.z + 0.67 * s); },
  cape(w, o, a) { const s = a.s, C = w.c(o.capeC || "#a3262a"), D = w.c(shade(o.capeC || "#a3262a", 0.7)); w.fill((x, y, z) => { const t = (a.y + 0.15 * s - y) / (0.9 * s), half = 0.3 * s + t * 0.12 * s; return t >= 0 && t <= 1 && Math.abs(x - a.x) <= half && Math.abs(z - (a.z - 0.26 * s - t * 0.12 * s)) <= w.u * 0.7 + 0.01 ? ((Math.round((x - a.x) / (0.06 * s)) & 1) ? C : D) : null; }, a.x - 0.45 * s, a.x + 0.45 * s, a.y - 0.8 * s, a.y + 0.15 * s, a.z - 0.45 * s, a.z - 0.2 * s); },
  backpack(w, o, a) { const s = a.s, C = w.c(o.packC || "#c9a24a"), T = w.c("#ffe08a"); w.rbox(a.x, a.y + 0.05 * s, a.z - 0.36 * s, 0.48 * s, 0.5 * s, 0.32 * s, (x, y) => (y > a.y + 0.22 * s ? T : C), 4); w.ell(a.x, a.y + 0.34 * s, a.z - 0.36 * s, 0.1 * s, 0.06 * s, 0.1 * s, w.g("#ffd23d", 2)); },
  chimney(w, o, a) { const s = a.s; w.fill((x, y, z) => (Math.hypot(x - a.x, z - a.z + 0.2 * s) <= 0.1 * s && y >= a.y && y <= a.y + 0.6 * s ? (((y - a.y) / (0.12 * s) | 0) & 1 ? w.c("#3a3a40") : w.c("#5a5a62")) : null), a.x - 0.1 * s, a.x + 0.1 * s, a.y, a.y + 0.6 * s, a.z - 0.3 * s, a.z - 0.1 * s); w.ell(a.x, a.y + 0.62 * s, a.z - 0.2 * s, 0.07 * s, 0.03 * s, 0.07 * s, w.g("#ffb15c", 2)); },
  spikes(w, o, a) { const s = a.s, C = w.c(o.spikeC || shade(o.c2 || o.c1, 0.8)); for (let i = 0; i < 4; i++) w.cap([a.x, a.y, a.z - 0.3 * s + i * 0.2 * s], [a.x, a.y + 0.25 * s, a.z - 0.38 * s + i * 0.2 * s], 0.06 * s, C, 0.01 * s); },
  glowSpines(w, o, a) { const s = a.s, G = w.g(o.gl || "#7fe8ff", 1.8); for (let i = 0; i < 4; i++) w.cap([a.x, a.y, a.z - 0.3 * s + i * 0.2 * s], [a.x, a.y + 0.28 * s, a.z - 0.38 * s + i * 0.2 * s], 0.05 * s, G, 0.01 * s); },
  plates(w, o, a) { const s = a.s, C = w.c(o.plateC || "#8a8f99"), H = w.c("#b8bcc8"); for (let i = 0; i < 3; i++) w.rbox(a.x, a.y + 0.04 * s, a.z - 0.3 * s + i * 0.3 * s, 0.62 * s, 0.1 * s, 0.24 * s, (x, y) => (y > a.y + 0.06 * s ? H : C), 3); },
  shell(w, o, a) { const s = a.s, c = o.shellC || "#6a6a72", C = w.c(c), H = w.c(shade(c, 1.2)), D = w.c(shade(c, 0.7)); w.fill((x, y, z) => { const dx = (x - a.x) / (0.52 * s), dz = (z - a.z) / (0.58 * s), dy = (y - a.y + 0.05 * s) / (0.5 * s); if (dx * dx + dy * dy + dz * dz > 1 || y < a.y - 0.05 * s) return null; const hx = Math.round((x - a.x) / (0.16 * s) + (Math.round((z - a.z) / (0.14 * s)) & 1) * 0.5), hz = Math.round((z - a.z) / (0.14 * s)); const edge = Math.abs((x - a.x) / (0.16 * s) + (Math.round((z - a.z) / (0.14 * s)) & 1) * 0.5 - hx) > 0.38 || Math.abs((z - a.z) / (0.14 * s) - hz) > 0.4; return y < a.y ? D : edge ? D : (hx + hz) & 1 ? C : H; }, a.x - 0.53 * s, a.x + 0.53 * s, a.y - 0.05 * s, a.y + 0.45 * s, a.z - 0.6 * s, a.z + 0.6 * s); },
  mossTop(w, o, a) { const s = a.s; for (let i = 0; i < 5; i++) w.ell(a.x + (i - 2) * 0.12 * s, a.y + 0.04 * s, a.z + ((i * 7) % 3 - 1) * 0.1 * s, 0.16 * s, 0.08 * s, 0.16 * s, i % 2 ? w.c("#4f8f3a") : w.c("#6aa83e")); w.set(a.x + 0.1 * s, a.y + 0.12 * s, a.z, w.c("#ff9ac0")); },
  boulders(w, o, a) { const s = a.s; for (let i = 0; i < 3; i++) w.ell(a.x + (i - 1) * 0.3 * s, a.y + 0.1 * s, a.z - 0.05 * s, 0.16 * s, 0.14 * s, 0.15 * s, (x, y) => (i === 1 && y > a.y + 0.18 * s ? w.c("#4f8f3a") : w.c(i ? "#6a6a62" : "#5a5a52"))); },
  gears(w, o, a) { const s = a.s, B = w.c("#c9a24a"), D = w.c("#8a6a2a"); w.fill((x, y, z) => { const d = Math.hypot(x - a.x, y - a.y), an = Math.atan2(y - a.y, x - a.x), tooth = ((an / TAU) * 8 % 1 + 1) % 1 < 0.5; return Math.abs(z - a.z - 0.27 * s) <= w.u && d <= (tooth ? 0.24 : 0.19) * s && d >= 0.06 * s ? (d > 0.15 * s ? B : D) : null; }, a.x - 0.25 * s, a.x + 0.25 * s, a.y - 0.25 * s, a.y + 0.25 * s, a.z + 0.24 * s, a.z + 0.3 * s); w.ell(a.x, a.y, a.z + 0.29 * s, 0.05 * s, 0.05 * s, w.u, w.g(o.gl || "#ffb15c", 2)); },
  runes(w, o, a) { const s = a.s, G = w.g(o.gl || "#7fb4ff", 1.8); for (let i = 0; i < 3; i++) w.box(a.x, a.y - 0.15 * s + i * 0.14 * s, a.z + 0.22 * s, (0.3 - (i & 1) * 0.1) * s, w.u, w.u, G); },
  core(w, o, a) { const s = a.s; w.ell(a.x, a.y, a.z + 0.2 * s, 0.13 * s, 0.13 * s, 0.07 * s, w.g(o.gl || "#ffffff", 1.9)); w.ell(a.x, a.y, a.z + 0.24 * s, 0.06 * s, 0.06 * s, 0.04 * s, w.g("#ffffff", 2.4)); },
  cracks(w, o, a) { const s = a.s, G = w.g(o.gl || "#ff6a2a", 1.9); for (let i = 0; i < 4; i++) { const x0 = a.x + (i - 1.5) * 0.14 * s; w.path([[x0, a.y + 0.2 * s, a.z + 0.22 * s], [x0 + 0.05 * s, a.y, a.z + 0.24 * s], [x0 - 0.04 * s, a.y - 0.2 * s, a.z + 0.22 * s]], w.u * 0.6, w.u * 0.6, G); } },
  stitches(w, o, a) { const s = a.s, G = w.g(o.gl || "#9cff7a", 1.6); for (let i = 0; i < 4; i++) w.box(a.x, a.y - 0.2 * s + i * 0.14 * s, a.z + 0.28 * s, 0.3 * s, w.u, w.u, G); },
  sack(w, o, a) { const s = a.s; w.ell(a.x, a.y + 0.1 * s, a.z - 0.36 * s, 0.26 * s, 0.26 * s, 0.24 * s, (x, y) => (y > a.y + 0.28 * s ? w.c("#8a6a3a") : w.c("#b08a4a"))); for (let i = 0; i < 4; i++) w.ell(a.x + (i - 1.5) * 0.08 * s, a.y + 0.38 * s, a.z - 0.36 * s, 0.05 * s, 0.05 * s, 0.05 * s, w.g("#ffd23d", 2.2)); },
  candle(w, o, a) { const s = a.s; w.box(a.x, a.y + 0.1 * s, a.z + 0.3 * s, 0.08 * s, 0.2 * s, 0.08 * s, w.c("#f0e8d0")); w.ell(a.x, a.y + 0.25 * s, a.z + 0.3 * s, 0.03 * s, 0.06 * s, 0.03 * s, w.g("#ffb15c", 2.4)); },
  sunDisc(w, o, a) { const s = a.s; w.fill((x, y, z) => { const d = Math.hypot(x - a.x, y - a.y - 0.1 * s); return Math.abs(z - a.z + 0.28 * s) <= w.u && d <= 0.3 * s ? (d < 0.18 * s ? w.g("#fff3c0", 2) : w.g("#ffd23d", 1.7)) : null; }, a.x - 0.3 * s, a.x + 0.3 * s, a.y - 0.2 * s, a.y + 0.4 * s, a.z - 0.3 * s, a.z - 0.26 * s); },
  stinger(w, o, a) { const s = a.s; w.path([[a.x, a.y, a.z - 0.35 * s], [a.x, a.y + 0.12 * s, a.z - 0.55 * s], [a.x, a.y + 0.28 * s, a.z - 0.62 * s]], 0.07 * s, 0.02 * s, w.c(o.c2 || o.c1)); w.ell(a.x, a.y + 0.3 * s, a.z - 0.64 * s, 0.03 * s, 0.05 * s, 0.03 * s, w.g(o.gl || "#ff4d4d", 2)); },
  spots(w, o, a) { const s = a.s, G = w.g(o.gl || "#c6ff5a", 1.6); for (let i = 0; i < 6; i++) w.ell(a.x + Math.cos(i * 1.7) * 0.18 * s, a.y + 0.01 * s, a.z + Math.sin(i * 1.7) * 0.2 * s, 0.05 * s, w.u, 0.05 * s, G); },
  stripes(w, o, a) { const s = a.s, C = w.c(o.stripeC || "#2a2010"); for (let i = 0; i < 3; i++) w.fill((x, y, z) => (Math.abs(z - (a.z - 0.2 * s + i * 0.18 * s)) < 0.035 * s && y > a.y - 0.25 * s && y < a.y + 0.04 * s && Math.abs(x - a.x) < 0.3 * s ? C : null), a.x - 0.3 * s, a.x + 0.3 * s, a.y - 0.25 * s, a.y + 0.04 * s, a.z - 0.25 * s, a.z + 0.2 * s); },
  saw(w, o, a) { const s = a.s, B = w.c("#d8dce4"), D = w.c("#a8acb4"); w.fill((x, y, z) => { const d = Math.hypot(x - a.x, y - a.y), an = Math.atan2(y - a.y, x - a.x), f = ((an / TAU) * 12 % 1 + 1) % 1; return Math.abs(z - a.z - 0.5 * s) <= w.u && d <= (0.24 + f * 0.08) * s ? (d > 0.22 * s ? B : d < 0.05 * s ? w.c("#4a4a52") : D) : null; }, a.x - 0.33 * s, a.x + 0.33 * s, a.y - 0.33 * s, a.y + 0.33 * s, a.z + 0.47 * s, a.z + 0.53 * s); },
  ribs(w, o, a) { const s = a.s, B = w.c("#f0e8d0"); for (let i = 0; i < 4; i++) w.path([[a.x - 0.32 * s, a.y - 0.05 * s, a.z - 0.25 * s + i * 0.16 * s], [a.x, a.y + 0.08 * s, a.z - 0.25 * s + i * 0.16 * s], [a.x + 0.32 * s, a.y - 0.05 * s, a.z - 0.25 * s + i * 0.16 * s]], 0.025 * s, 0.025 * s, B); },
  veins(w, o, a) { const s = a.s, G = w.g(o.gl || "#ff5fa2", 1.7); for (let i = 0; i < 5; i++) { const an = i * 1.3; w.path([[a.x + Math.cos(an) * 0.3 * s, a.y + 0.25 * s, a.z + Math.sin(an) * 0.3 * s], [a.x + Math.cos(an + 0.3) * 0.33 * s, a.y, a.z + Math.sin(an + 0.3) * 0.33 * s], [a.x + Math.cos(an) * 0.3 * s, a.y - 0.25 * s, a.z + Math.sin(an) * 0.3 * s]], w.u * 0.6, w.u * 0.6, G); } },
  wards(w, o, a) { const s = a.s, G = w.g(o.gl || "#e2c8ff", 1.8); for (let i = 0; i < 12; i++) { const an = (i / 12) * TAU; w.ell(a.x + Math.cos(an) * 0.6 * s, a.y, a.z + Math.sin(an) * 0.6 * s, 0.04 * s, 0.025 * s, 0.04 * s, G); } },
  scarf(w, o, a) { const s = a.s, C = w.c("#ffd23d"), D = w.c("#d9a020"); w.fill((x, y, z) => (Math.hypot((x - a.x) / 1.1, z - a.z) <= 0.24 * s && Math.hypot((x - a.x) / 1.1, z - a.z) >= 0.15 * s && Math.abs(y - a.y) <= 0.05 * s ? C : null), a.x - 0.3 * s, a.x + 0.3 * s, a.y - 0.06 * s, a.y + 0.06 * s, a.z - 0.3 * s, a.z + 0.3 * s); w.path([[a.x + 0.15 * s, a.y, a.z - 0.2 * s], [a.x + 0.2 * s, a.y - 0.1 * s, a.z - 0.45 * s], [a.x + 0.25 * s, a.y - 0.05 * s, a.z - 0.65 * s]], 0.05 * s, 0.04 * s, D); },
};
const runEx = (list, w, o, a) => { for (const k of list || []) if (EX[k]) EX[k](w, o, a); };

// weapons in the right hand (a = hand position)
const WEAPON = {
  club(w, o, a) { const s = a.s; w.cap([a.x, a.y, a.z], [a.x, a.y + 0.1 * s, a.z + 0.5 * s], 0.05 * s, w.c("#6a4a2e"), 0.07 * s); w.ell(a.x, a.y + 0.14 * s, a.z + 0.6 * s, 0.13 * s, 0.12 * s, 0.16 * s, (x, y, z) => (hsh(x, y, z) < 0.25 ? w.c("#c8c0b0") : w.c("#5a4030"))); },
  staff(w, o, a) { const s = a.s; w.cap([a.x, a.y - 0.6 * s, a.z + 0.1 * s], [a.x, a.y + 0.5 * s, a.z + 0.1 * s], 0.035 * s, w.c("#5a4030")); w.path([[a.x, a.y + 0.48 * s, a.z + 0.1 * s], [a.x + 0.08 * s, a.y + 0.58 * s, a.z + 0.1 * s], [a.x, a.y + 0.68 * s, a.z + 0.1 * s]], 0.03 * s, 0.02 * s, w.c("#5a4030")); w.ell(a.x, a.y + 0.58 * s, a.z + 0.1 * s, 0.08 * s, 0.08 * s, 0.08 * s, w.g(o.gl || "#9cff7a", 2.1)); },
  skullStaff(w, o, a) { const s = a.s; w.cap([a.x, a.y - 0.6 * s, a.z + 0.1 * s], [a.x, a.y + 0.45 * s, a.z + 0.1 * s], 0.035 * s, w.c("#3a3030")); w.ell(a.x, a.y + 0.55 * s, a.z + 0.1 * s, 0.11 * s, 0.1 * s, 0.11 * s, w.c("#efe6d4")); for (const sx of [-1, 1]) w.set(a.x + sx * 0.045 * s, a.y + 0.56 * s, a.z + 0.2 * s, w.g(o.gl || "#9cff7a", 2.4)); },
  sword(w, o, a) { const s = a.s; w.cap([a.x, a.y, a.z], [a.x, a.y - 0.04 * s, a.z + 0.08 * s], 0.03 * s, w.c("#5a4030")); w.box(a.x, a.y - 0.05 * s, a.z + 0.1 * s, 0.24 * s, 0.05 * s, 0.05 * s, w.c("#c9a24a")); w.fill((x, y, z) => { const t = (z - a.z - 0.12 * s) / (0.7 * s); return t >= 0 && t <= 1 && Math.abs(x - a.x) <= w.u * 0.75 && Math.abs(y - a.y + 0.06 * s - t * 0.12 * s) <= Math.max(w.u * 0.8, 0.075 * s * (1 - t * 0.6)) ? (Math.abs(y - a.y + 0.06 * s - t * 0.12 * s) < w.u * 0.5 ? w.c("#ffffff") : w.c("#c8ccd8")) : null; }, a.x - 0.03 * s, a.x + 0.03 * s, a.y - 0.15 * s, a.y + 0.15 * s, a.z + 0.1 * s, a.z + 0.85 * s); },
  hammer(w, o, a) { const s = a.s; w.cap([a.x, a.y - 0.05 * s, a.z - 0.05 * s], [a.x, a.y + 0.1 * s, a.z + 0.6 * s], 0.035 * s, w.c("#6a4a2e")); w.rbox(a.x, a.y + 0.12 * s, a.z + 0.68 * s, 0.32 * s, 0.24 * s, 0.22 * s, (x, y) => (y > a.y + 0.2 * s ? w.c("#fff0a0") : w.c(o.hamC || "#d9b84a")), 6); },
  axe(w, o, a) { const s = a.s; w.cap([a.x, a.y + 0.05 * s, a.z - 0.05 * s], [a.x, a.y - 0.05 * s, a.z + 0.8 * s], 0.04 * s, w.c("#5a4030")); w.fill((x, y, z) => { const dz = z - a.z - 0.7 * s, dy = y - a.y + 0.04 * s; return Math.abs(x - a.x) <= w.u * 0.7 && Math.hypot(dz, dy) <= 0.22 * s && dy > -0.02 * s - dz * 0.4 ? (Math.hypot(dz, dy) > 0.17 * s ? w.c("#ffffff") : w.c("#c8c8d8")) : null; }, a.x - 0.04 * s, a.x + 0.04 * s, a.y - 0.3 * s, a.y + 0.25 * s, a.z + 0.4 * s, a.z + 1 * s); },
  bow(w, o, a) { const s = a.s; w.path([[a.x, a.y + 0.4 * s, a.z + 0.15 * s], [a.x + 0.05 * s, a.y, a.z + 0.3 * s], [a.x, a.y - 0.4 * s, a.z + 0.15 * s]], 0.03 * s, 0.03 * s, w.c("#7a5a2e")); w.cap([a.x, a.y + 0.4 * s, a.z + 0.15 * s], [a.x, a.y - 0.4 * s, a.z + 0.15 * s], w.u * 0.5, w.g("#e8f8d0", 1.3)); },
  trident(w, o, a) { const s = a.s, G = w.c("#c9a24a"), GH = w.c("#ffd23d"); w.cap([a.x, a.y - 0.6 * s, a.z + 0.15 * s], [a.x, a.y + 0.6 * s, a.z + 0.15 * s], 0.03 * s, G); w.box(a.x, a.y + 0.58 * s, a.z + 0.15 * s, 0.24 * s, 0.04 * s, 0.04 * s, GH); for (const dx of [-0.1, 0, 0.1]) w.cap([a.x + dx * s, a.y + 0.6 * s, a.z + 0.15 * s], [a.x + dx * s, a.y + 0.8 * s, a.z + 0.15 * s], 0.025 * s, GH, 0.008 * s); },
  claws(w, o, a) { const s = a.s; for (const dx of [-0.06, 0, 0.06]) w.path([[a.x + dx * s, a.y, a.z + 0.04 * s], [a.x + dx * s, a.y - 0.04 * s, a.z + 0.16 * s], [a.x + dx * s, a.y - 0.1 * s, a.z + 0.22 * s]], 0.022 * s, 0.008 * s, w.c("#e8e0d0")); },
  hook(w, o, a) { const s = a.s, C = w.c("#8a8f99"); w.cap([a.x, a.y, a.z + 0.05 * s], [a.x, a.y - 0.4 * s, a.z + 0.05 * s], 0.03 * s, C); w.path([[a.x, a.y - 0.4 * s, a.z + 0.05 * s], [a.x, a.y - 0.5 * s, a.z + 0.15 * s], [a.x, a.y - 0.42 * s, a.z + 0.25 * s]], 0.03 * s, 0.015 * s, C); },
  boulder(w, o, a) { const s = a.s; w.ell(a.x, a.y - 0.05 * s, a.z + 0.25 * s, 0.22 * s, 0.2 * s, 0.22 * s, (x, y, z) => (y > a.y + 0.08 * s ? w.c("#8a8a80") : hsh(x, y, z) < 0.3 ? w.c("#5a5a52") : w.c("#6a6a62"))); },
  sawArm(w, o, a) { EX.saw(w, o, { x: a.x, y: a.y - 0.15 * a.s, z: a.z - 0.35 * a.s, s: a.s * 0.9 }); },
  log(w, o, a) { const s = a.s; w.cap([a.x, a.y + 0.1 * s, a.z - 0.1 * s], [a.x, a.y - 0.35 * s, a.z + 0.75 * s], 0.1 * s, (x, y, z) => ((Math.round((z - a.z) / (0.08 * s)) & 1) ? w.c("#6a4a2e") : w.c("#5a3a22"))); w.ell(a.x + 0.05 * s, a.y - 0.1 * s, a.z + 0.3 * s, 0.06 * s, 0.04 * s, 0.06 * s, w.c("#4f8f3a")); },
  sack(w, o, a) { EX.sack(w, o, { x: a.x, y: a.y - 0.4 * a.s, z: a.z + 0.4 * a.s, s: a.s * 0.8 }); },
};
const SHIELD = {
  round(w, o, a) { const s = a.s, C = w.c(o.shieldC || "#8a5a3a"), R = w.c("#c9a24a"); w.fill((x, y, z) => { const d = Math.hypot(y - a.y + 0.25 * s, z - a.z - 0.1 * s); return Math.abs(x - a.x + 0.08 * s) <= w.u * 0.8 && d <= 0.27 * s ? (d > 0.22 * s ? R : d < 0.06 * s ? R : (Math.round((z - a.z) / (0.07 * s)) & 1) ? C : w.c(shade(o.shieldC || "#8a5a3a", 0.8))) : null; }, a.x - 0.12 * s, a.x - 0.04 * s, a.y - 0.55 * s, a.y + 0.05 * s, a.z - 0.2 * s, a.z + 0.4 * s); },
  tower(w, o, a) { const s = a.s, C = w.c(o.shieldC || "#c9a24a"), H = w.c("#ffe08a"); w.box(a.x - 0.06 * s, a.y - 0.3 * s, a.z + 0.28 * s, 0.08 * s, 0.95 * s, 0.6 * s, (x, y, z) => (Math.abs(z - a.z - 0.28 * s) > 0.26 * s || Math.abs(y - a.y + 0.3 * s) > 0.44 * s ? H : C)); w.box(a.x - 0.11 * s, a.y - 0.25 * s, a.z + 0.28 * s, w.u, 0.24 * s, 0.24 * s, w.g(o.gl || "#7fe8ff", 1.8)); },
  rune(w, o, a) { const s = a.s; w.box(a.x - 0.06 * s, a.y - 0.25 * s, a.z + 0.1 * s, 0.06 * s, 0.6 * s, 0.5 * s, w.c("#3a4250")); w.box(a.x - 0.1 * s, a.y - 0.25 * s, a.z + 0.1 * s, w.u, 0.3 * s, 0.06 * s, w.g(o.gl || "#7fb4ff", 1.9)); w.box(a.x - 0.1 * s, a.y - 0.2 * s, a.z + 0.1 * s, w.u, 0.06 * s, 0.24 * s, w.g(o.gl || "#7fb4ff", 1.9)); },
};

// shading helpers: a lit colour with a lighter top and a darker underside
const tone = (w, c, base, y0, y1) => { const T = w.c(shade(c, 1.15)), B = w.c(c), D = w.c(shade(c, 0.82)); return (x, y) => (y > base + (y1 - y0) * 0.3 ? T : y < base - (y1 - y0) * 0.3 ? D : B); };

// ---------------------------------------------------------------------------
// BODY PLANS
// ---------------------------------------------------------------------------
function biped(o) {
  const s = o.s || 1, Wd = (o.w || 1), Lg = (o.leg || 1), golem = !!o._golem;
  const hip = 0.5 * s * Lg, tw = 0.6 * s * Wd, th = 0.6 * s * (o.th || 1), td = 0.42 * s * (o.d || 1);
  const hs = 0.42 * s * (o.head || 1), hunch = o.hunch ? 0.12 * s : 0;
  const headY = hip + th + hs * 0.45 - (o.hunch ? 0.08 * s : 0);
  const c1 = o.c1, c2 = o.c2 || shade(o.c1, 0.75), c3 = o.c3 || shade(o.c1, 1.2);
  const armX = tw / 2 + 0.1 * s, armY = hip + th * 0.9, armL = 0.55 * s * (o.arm || 1);
  const ext = Math.max(1.2, tw / s + 0.8, (o.bodyX || []).includes("banner") ? 1.2 : 0);
  const rough = (w, x, y, z) => (golem ? (vnoise(x / (0.12 * s), y / (0.12 * s), z / (0.12 * s)) > 0.62 ? 1 : 0) : 0);
  const parts = {
    body(P) {
      const w = make(s, ext, -0.1, (headY + hs) / s + 0.9, 1.3), C1 = w.c(c1), C2 = w.c(c2), C3 = w.c(c3), CD = w.c(shade(c1, 0.8));
      // torso: a rounded block, slightly broader at the shoulders, leaning forward when hunched
      w.fill((x, y, z) => {
        const t = (y - hip) / th; if (t < -0.05 || t > 1.05) return null;
        const zc = hunch * t, half = tw / 2 * (0.86 + 0.18 * t), dd = td / 2 * (0.95 + 0.1 * Math.sin(t * Math.PI));
        const e = (Math.abs(x) / half) ** 4 + (Math.abs(z - zc) / dd) ** 4 + (Math.abs(t - 0.5) / 0.55) ** 6;
        if (e > 1) return null;
        if (golem) return rough(w, x, y, z) ? CD : t > 0.75 ? C3 : C1;
        return t > 0.82 ? C3 : z - zc > dd * 0.55 && Math.abs(x) < half * 0.4 && t < 0.75 ? w.c(shade(c1, 1.08)) : C1;
      }, -tw, tw, hip - 0.05 * s, hip + th * 1.06, -td - hunch, td + hunch);
      w.fill((x, y, z) => ((Math.abs(x) / (tw * 0.47)) ** 4 + (Math.abs(z) / (td * 0.53)) ** 4 <= 1 && y >= hip && y <= hip + 0.11 * s ? (Math.abs(x) < 0.04 * s && z > 0 ? w.c("#c9a24a") : C2) : null), -tw, tw, hip, hip + 0.12 * s, -td, td);
      if (o.robe) { const R = w.c(o.robeC || c2), RD = w.c(shade(o.robeC || c2, 0.7)); w.fill((x, y, z) => { const t = 1 - y / hip, r = tw * (0.5 + t * 0.2); return y >= 0 && y <= hip && (x * x) / (r * r) + (z * z) / ((r * 0.8) ** 2) <= 1 ? (y < 0.07 * s ? RD : (Math.round(Math.atan2(z, x) * 4) & 1) ? R : w.c(shade(o.robeC || c2, 0.9))) : null; }, -tw, tw, 0, hip, -tw, tw); }
      if (!o.noHead) {
        const HC = o.headC || c1, Hm = w.c(HC), Ht = w.c(shade(HC, 1.15)), Hd = w.c(shade(HC, 0.8)), hz = hunch + 0.02 * s;
        w.rbox(0, headY, hz, hs, hs, hs * 0.95, (x, y, z) => (golem && rough(w, x, y, z) ? Hd : y > headY + hs * 0.3 ? Ht : Hm), golem ? 5 : 3.2);
        w.box(0, headY + hs * 0.18, hz + hs * 0.46, hs * 0.8, Math.max(w.u, hs * 0.08), w.u * 1.2, Hd);       // brow
        eyes(w, o, 0, headY + 0.03 * s, hz + hs * 0.48, s * (o.head || 1));
        if (!(o.headX || []).some((k) => k === "mask" || k === "maw")) w.box(0, headY - hs * 0.24, hz + hs * 0.47, hs * 0.36, w.u, w.u, w.c(shade(HC, 0.55)));
      }
      runEx(o.headX, w, o, { x: 0, y: headY + hs * 0.5, z: hunch, s: s * (o.head || 1) });
      runEx(o.bodyX, w, o, { x: 0, y: hip + th * 0.6, z: 0, s });
      if (o.devilTail) { const T = w.c(c2); w.path([[0, hip + 0.08 * s, -td * 0.4], [0, hip - 0.1 * s, -td * 0.5 - 0.25 * s], [0, hip + 0.05 * s, -td * 0.5 - 0.5 * s]], 0.05 * s, 0.03 * s, T); w.fill((x, y, z) => (Math.abs(x) <= w.u * 0.6 + 0.01 && Math.abs(y - hip - 0.12 * s) + Math.abs(z + td * 0.5 + 0.55 * s) * 1.3 <= 0.1 * s ? w.c(shade(c2, 0.6)) : null), -0.05 * s, 0.05 * s, hip, hip + 0.25 * s, -td - 0.7 * s, -td * 0.3 - 0.3 * s); }
      if (o.belt === false) {}
      w.emit(P);
    },
  };
  const arm = (right) => (P) => {
    const w = make(s, 0.7, -(armL / s) - 0.8, 0.95, 1.1), A = w.c(o.armC || c1), A2 = w.c(c2), A3 = w.c(c3);
    const r = 0.09 * s * Wd * (golem ? 1.3 : 1);
    w.ell(0, 0, 0, r * 1.25, r * 1.2, r * 1.2, A3);
    w.cap([0, 0, 0], [0, -armL * 0.5, 0.02 * s], r, A, r * 0.9);
    w.cap([0, -armL * 0.5, 0.02 * s], [0, -armL + 0.06 * s, 0.05 * s], r * 0.9, A, r * 0.85);
    w.ell(0, -armL, 0.04 * s, r * 1.15, r * 1.05, r * 1.15, (x, y, z) => (golem && hsh(x, y, z) < 0.3 ? A3 : A2));
    if (!right && o.shield && SHIELD[o.shield]) SHIELD[o.shield](w, o, { x: -0.1 * s, y: -armL * 0.6, z: 0, s });
    if (right && o.weapon && WEAPON[o.weapon]) WEAPON[o.weapon](w, o, { x: 0, y: -armL, z: 0, s });
    w.emit(P);
  };
  parts.armL = arm(false); parts.armR = arm(true);
  if (!o.robe && !o.float) {
    parts.legL = (P) => {
      const w = make(s, 0.4, -hip / s - 0.1, 0.1, 0.4), L = w.c(c2), Bt = w.c(shade(c2, 0.62)), Bh = w.c(shade(c2, 0.8)), r = 0.095 * s * Wd * (golem ? 1.3 : 1);
      w.cap([0, 0, 0], [0, -hip * 0.5, 0.02 * s], r, L, r * 0.92);
      w.cap([0, -hip * 0.5, 0.02 * s], [0, -hip + 0.1 * s, 0], r * 0.92, L, r * 0.85);
      w.rbox(0, -hip + 0.05 * s, 0.04 * s, 0.24 * s * Wd, 0.1 * s, 0.32 * s, (x, y) => (y > -hip + 0.08 * s ? Bh : Bt), 3);
      w.emit(P);
    };
    parts.legR = parts.legL;
  }
  const pivots = { armL: [-armX, armY, 0], armR: [armX, armY, 0], legL: [-tw * 0.28, hip, 0], legR: [tw * 0.28, hip, 0] };
  const anim = { armL: "swingB", armR: "swingA", legL: "legA", legR: "legB" };
  if (o.wings && o.dragonfly) {
    const wing = (side) => (P) => { const w = make(s, 1.0, -0.4, 0.4, 0.7), G = w.g(o.wingC || "#fff8d0", 1.25), V = w.g(shade(o.wingC || "#fff8d0", 0.8), 1.3);
      for (const [zc, len, wd, dy] of [[0.08, 0.62, 0.15, 0], [-0.2, 0.5, 0.12, -0.05]]) w.fill((x, y, z) => { const X = x * side; return X > 0 && Math.abs(y - dy * s) <= w.u * 0.5 && ((X - len * s / 2) / (len * s / 2)) ** 2 + ((z - zc * s) / (wd * s)) ** 2 <= 1 ? (Math.abs(z - zc * s) < w.u * 0.7 || Math.abs(X - len * s * 0.5) < w.u * 0.5 ? V : G) : null; }, -0.7 * s, 0.7 * s, -0.1 * s, 0.05 * s, -0.4 * s, 0.3 * s);
      w.emit(P); };
    parts.wingL = wing(-1); parts.wingR = wing(1);
    pivots.wingL = [-tw * 0.2, hip + th * 0.75, -td * 0.5]; pivots.wingR = [tw * 0.2, hip + th * 0.75, -td * 0.5]; anim.wingL = "buzzL"; anim.wingR = "buzzR";
  } else if (o.wings) addWings(parts, pivots, anim, o, s, [tw * 0.3, hip + th * 0.8, -td * 0.5], c2, false);
  if (o.orbit) { parts.ring = orbitRing(o, s); pivots.ring = [0, hip + th * 0.5, 0]; anim.ring = "orbit"; }
  return { height: headY + hs * 0.6 + (o.extraH || 0), size: Math.max(tw, td) * 1.6, hover: o.hover || 0, parts, pivots, anim };
}

// bat/dragon membrane wings: a bony leading edge and fingers with skin stretched between them
function addWings(parts, pivots, anim, o, s, piv, c2, flyerSized) {
  const ws = (o.wingS || 1) * s * (flyerSized ? 1 : 0.75), wc = o.wingC || shade(c2, 0.8);
  const wing = (side) => (P) => {
    const w = make(s, 1.6 * (o.wingS || 1) + 0.4, -0.7, 1.2, 0.9), M = w.c(wc), MD = w.c(shade(wc, 0.78)), BN = w.c(shade(wc, 0.6)), G = o.wingGlow ? w.g(o.wingGlow, 1.6) : null;
    const tip = [side * 1.25 * ws, 0.25 * ws, -0.1 * ws], elbow = [side * 0.55 * ws, 0.32 * ws, 0.08 * ws];
    w.path([[0, 0, 0], elbow, tip], 0.045 * s, 0.025 * s, BN);
    const fingers = [[side * 1.05 * ws, -0.35 * ws, -0.25 * ws], [side * 0.75 * ws, -0.45 * ws, -0.2 * ws], [side * 0.35 * ws, -0.35 * ws, -0.12 * ws]];
    for (const f of fingers) w.cap(elbow, f, 0.025 * s, BN, 0.012 * s);
    // skin: fill the fan between the edge and the fingers (thin, scalloped trailing edge)
    w.fill((x, y, z) => {
      const X = x * side; if (X < 0.02 * s || X > 1.25 * ws) return null;
      const top = X < 0.55 * ws ? (X / (0.55 * ws)) * 0.32 * ws : 0.32 * ws - ((X - 0.55 * ws) / (0.7 * ws)) * 0.07 * ws;
      const bot = -0.42 * ws * Math.sin(Math.min(1, X / (1.2 * ws)) * Math.PI * 0.9) + Math.abs(Math.sin(X / (0.35 * ws) * Math.PI)) * 0.08 * ws;
      const zc = -0.1 * ws * (X / ws);
      if (y > top || y < bot || Math.abs(z - zc) > w.u * 0.6) return null;
      return G && y > top - 0.05 * s ? G : (Math.round(X / (0.12 * s)) & 1) ? M : MD;
    }, -1.4 * ws, 1.4 * ws, -0.5 * ws, 0.4 * ws, -0.4 * ws, 0.3 * ws);
    w.emit(P);
  };
  parts.wingL = wing(-1); parts.wingR = wing(1);
  pivots.wingL = [-piv[0], piv[1], piv[2]]; pivots.wingR = [piv[0], piv[1], piv[2]];
  anim.wingL = o.buzz ? "buzzL" : "flapL"; anim.wingR = o.buzz ? "buzzR" : "flapR";
}

function orbitRing(o, s) {
  return (P) => {
    const R = (o.orbitR || 0.7) * s, n = o.orbitN || 8, w = make(s, (o.orbitR || 0.7) + 0.3, -0.35, 0.35, (o.orbitR || 0.7) + 0.3);
    const G = w.g(o.gl || "#ffffff", 1.9), G2 = w.g("#ffffff", 2.2), D = w.c(o.c2 || "#444"), DH = w.c(shade(o.c2 || "#444", 1.3));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, x = Math.cos(a) * R, y = Math.sin(a * 2) * 0.1 * s, z = Math.sin(a) * R, r = 0.07 * s;
      w.fill((xx, yy, zz) => { const d = Math.abs(xx - x) + Math.abs(zz - z) + Math.abs(yy - y) * 0.6; return d <= r * 1.3 ? (o.orbitGlow === false ? (yy > y ? DH : D) : d < r * 0.5 ? G2 : G) : null; }, x - r * 2, x + r * 2, y - r * 2.5, y + r * 2.5, z - r * 2, z + r * 2);
    }
    w.emit(P);
  };
}

function quad(o) {
  const s = o.s || 1, L = 0.95 * s * (o.len || 1), bh = 0.42 * s * (o.th || 1), bw = 0.5 * s * (o.w || 1), lh = 0.38 * s * (o.leg || 1);
  const c1 = o.c1, c2 = o.c2 || shade(o.c1, 0.75), c3 = o.c3 || shade(o.c1, 1.2);
  const hs = 0.38 * s * (o.head || 1), hy = lh + bh * (o.headUp || 0.75), hz = L / 2 + hs * 0.35;
  const parts = {
    body(P) {
      const w = make(s, Math.max(0.9, bw / s + 0.5), -0.1, (hy + hs) / s + 0.8, L / s / 2 + 1.1 + (o.tailL || 1) * 0.5);
      const C1 = w.c(c1), C3 = w.c(c3), BE = w.c(o.belly || c2), CD = w.c(shade(c1, 0.82));
      // a deep-chested body tapering to the hips, belly underneath, a ridge along the back
      w.fill((x, y, z) => {
        const t = (z + L / 2) / L, chest = 0.85 + 0.25 * t, half = bw / 2 * chest, hh = bh / 2 * (0.9 + 0.2 * t), yc = lh + bh / 2;
        const e = (Math.abs(x) / half) ** 2.6 + (Math.abs(y - yc) / hh) ** 2.6 + (Math.abs(z) / (L / 2)) ** 3;
        if (e > 1) return null;
        return y < yc - hh * 0.45 ? BE : y > yc + hh * 0.7 && Math.abs(x) < half * 0.3 ? C3 : (Math.round(z / (0.1 * s)) & 1) && y > yc ? C1 : CD;
      }, -bw, bw, lh - 0.05 * s, lh + bh * 1.2, -L / 2 - 0.05 * s, L / 2 + 0.05 * s);
      // neck and head
      const HC = o.headC || c1, H = w.c(HC), Ht = w.c(shade(HC, 1.15)), Hd = w.c(shade(HC, 0.75));
      w.cap([0, lh + bh * 0.7, L / 2 - 0.12 * s], [0, hy, hz - hs * 0.2], hs * 0.38, H, hs * 0.33);
      w.rbox(0, hy, hz, hs * (o.snout ? 0.9 : 1), hs, hs * 1.1, (x, y) => (y > hy + hs * 0.25 ? Ht : H), 3);
      if (o.snout) { w.rbox(0, hy - hs * 0.18, hz + hs * 0.72, hs * 0.58, hs * 0.48, hs * 0.62, (x, y) => (y < hy - hs * 0.3 ? Hd : H), 3); w.ell(0, hy - hs * 0.05, hz + hs * 1.02, hs * 0.12, hs * 0.08, w.u, w.c("#2a1a14")); }
      for (const sx of [-1, 1]) w.cap([sx * hs * 0.3, hy + hs * 0.4, hz - hs * 0.15], [sx * hs * 0.42, hy + hs * 0.72, hz - hs * 0.3], hs * 0.12, Hd, hs * 0.04);
      eyes(w, o, 0, hy + 0.06 * s, hz + hs * 0.56, s * (o.head || 1), 0.12);
      if (o.tail !== false) {
        const tl = 0.4 * s * (o.tailL || 1), up = o.tailUp ? 1 : -0.4, T = w.c(c2);
        const pts = [[0, lh + bh * 0.7, -L / 2], [0, lh + bh * 0.7 + up * tl * 0.3, -L / 2 - tl * 0.5], [0, lh + bh * 0.7 + up * tl * 0.75, -L / 2 - tl * 0.9]];
        w.path(pts, 0.06 * s, 0.03 * s, T);
        if (o.tailTip) w.ell(pts[2][0], pts[2][1], pts[2][2], 0.07 * s, 0.07 * s, 0.07 * s, w.g(o.gl, 2));
      }
      runEx(o.headX, w, o, { x: 0, y: hy + hs * 0.5, z: hz, s: s * (o.head || 1) });
      runEx(o.bodyX, w, o, { x: 0, y: lh + bh, z: 0, s });
      w.emit(P);
    },
  };
  const legs = (pairs) => (P) => {
    const w = make(s, Math.max(0.6, bw / s + 0.2), -lh / s - 0.1, 0.15, L / s / 2 + 0.3), LC = w.c(o.legC || c2), PW = w.c(shade(o.legC || c2, 0.65)), r = 0.085 * s * (o.w || 1);
    for (const [x, z] of pairs) { w.cap([x, 0.02 * s, z], [x, -lh * 0.55, z - 0.03 * s], r * 1.2, LC, r); w.cap([x, -lh * 0.55, z - 0.03 * s], [x, -lh + 0.05 * s, z + 0.02 * s], r, LC, r * 0.85); w.rbox(x, -lh + 0.04 * s, z + 0.05 * s, r * 2.6, 0.08 * s, r * 3.2, PW, 3); }
    w.emit(P);
  };
  parts.legsA = legs([[-bw * 0.38, L * 0.36], [bw * 0.38, -L * 0.36]]);
  parts.legsB = legs([[bw * 0.38, L * 0.36], [-bw * 0.38, -L * 0.36]]);
  const pivots = { legsA: [0, lh, 0], legsB: [0, lh, 0] }, anim = { legsA: "legA", legsB: "legB" };
  if (o.orbit) { parts.ring = orbitRing(o, s); pivots.ring = [0, lh + bh, 0]; anim.ring = "orbit"; }
  return { height: hy + hs * 0.6 + (o.extraH || 0), size: Math.max(bw, L), hover: o.hover || 0, parts, pivots, anim };
}

function insect(o) {
  const s = o.s || 1, L = 0.75 * s * (o.len || 1), bw = 0.6 * s * (o.w || 1), bh = 0.3 * s * (o.th || 1), lift = 0.16 * s;
  const c1 = o.c1, c2 = o.c2 || shade(o.c1, 0.7), c3 = o.c3 || shade(o.c1, 1.2);
  const nl = o.legs || 3;
  const legZ = (i) => L * 0.3 - (i * L * 0.6) / Math.max(1, nl - 1);
  const parts = {
    body(P) {
      const w = make(s, 0.9 * (o.w || 1) + 0.3, -0.1, 1.2, L / s / 2 + 0.9), C1 = w.c(c1), C2 = w.c(c2), C3 = w.c(c3), CD = w.c(shade(c1, 0.75));
      // abdomen (banded), thorax and head
      w.ell(0, lift + bh * 0.55, -L * 0.22, bw * 0.55, bh * 0.75, L * 0.42, (x, y, z) => ((Math.round(z / (0.07 * s)) & 1) ? C1 : y > lift + bh * 0.8 ? C3 : CD));
      w.ell(0, lift + bh * 0.5, L * 0.22, bw * 0.4, bh * 0.6, L * 0.2, C2);
      w.ell(0, lift + bh * 0.45, L / 2 + 0.06 * s, bw * 0.3, bh * 0.5, 0.15 * s, (x, y) => (y > lift + bh * 0.6 ? C3 : C1));
      eyes(w, o, 0, lift + bh * 0.55, L / 2 + 0.19 * s, s, 0.08);
      if (o.mandibles !== false) for (const sx of [-1, 1]) w.path([[sx * 0.07 * s, lift + bh * 0.25, L / 2 + 0.16 * s], [sx * 0.11 * s, lift + bh * 0.2, L / 2 + 0.3 * s], [sx * 0.04 * s, lift + bh * 0.2, L / 2 + 0.38 * s]], 0.03 * s, 0.012 * s, w.c(shade(c2, 0.6)));
      for (const sx of [-1, 1]) w.path([[sx * 0.05 * s, lift + bh * 0.8, L / 2 + 0.12 * s], [sx * 0.15 * s, lift + bh * 1.6, L / 2 + 0.25 * s], [sx * 0.24 * s, lift + bh * 1.9, L / 2 + 0.2 * s]], 0.012 * s, 0.01 * s, w.c(shade(c2, 0.6)));
      runEx(o.bodyX, w, o, { x: 0, y: lift + bh, z: 0, s });
      w.emit(P);
    },
  };
  const legSet = (flip) => (P) => {
    const w = make(s, 0.95 * (o.w || 1) + 0.3, -0.35, 0.5, L / s / 2 + 0.3), LC = w.c(o.legC || c2), r = 0.03 * s;
    for (let i = 0; i < nl; i++) { const sd = (i % 2 ? 1 : -1) * flip, z = legZ(i); for (const side of [sd]) { w.path([[side * bw * 0.25, 0.04 * s, z], [side * bw * 0.65, 0.2 * s, z + 0.02 * s], [side * bw * 0.95, -0.16 * s, z + 0.06 * s]], r * 1.2, r * 0.7, LC); } }
    w.emit(P);
  };
  parts.legA = legSet(1); parts.legB = legSet(-1);
  const pivots = { legA: [0, lift, 0], legB: [0, lift, 0] }, anim = { legA: "skitA", legB: "skitB" };
  if (o.wings) {
    const wing = (side) => (P) => { const w = make(s, 0.8, -0.2, 0.2, 0.5), G = w.g(o.wingC || "#fff8d0", 1.1), V = w.g(shade(o.wingC || "#fff8d0", 0.8), 1.2); w.fill((x, y, z) => { const X = x * side; return X > 0 && Math.abs(y) <= w.u * 0.5 && ((X - 0.28 * s) / (0.3 * s)) ** 2 + ((z + 0.05 * s) / (0.14 * s)) ** 2 <= 1 ? (Math.abs(z + 0.05 * s - (X - 0.28 * s) * 0.2) < w.u ? V : G) : null; }, -0.6 * s, 0.6 * s, -0.05 * s, 0.05 * s, -0.3 * s, 0.2 * s); w.emit(P); };
    parts.wingL = wing(-1); parts.wingR = wing(1);
    pivots.wingL = [-bw * 0.2, lift + bh, -L * 0.1]; pivots.wingR = [bw * 0.2, lift + bh, -L * 0.1];
    anim.wingL = "buzzL"; anim.wingR = "buzzR";
  }
  return { height: lift + bh + (o.extraH || 0.2 * s), size: Math.max(bw * 1.4, L), hover: o.hover || 0, parts, pivots, anim };
}

function flyer(o) {
  const s = o.s || 1, L = 0.8 * s * (o.len || 1), bw = 0.42 * s * (o.w || 1), bh = 0.36 * s * (o.th || 1);
  const c1 = o.c1, c2 = o.c2 || shade(o.c1, 0.75), c3 = o.c3 || shade(o.c1, 1.2);
  const hs = 0.32 * s * (o.head || 1);
  const parts = {
    body(P) {
      const w = make(s, 0.8, -0.6, 0.9, L / s / 2 + 1.2 + (o.tailL || 1) * 0.6), C1 = w.c(c1), C3 = w.c(c3), BE = w.c(o.belly || c2), CD = w.c(shade(c1, 0.8));
      w.ell(0, 0, 0, bw / 2, bh / 2, L / 2, (x, y, z) => (y < -bh * 0.15 ? BE : y > bh * 0.3 ? C3 : (Math.round(z / (0.08 * s)) & 1) ? C1 : CD));
      w.cap([0, bh * 0.1, L / 2 - 0.05 * s], [0, bh * 0.3, L / 2 + hs * 0.2], hs * 0.35, C1, hs * 0.32);
      const HC = o.headC || c1, H = w.c(HC), Ht = w.c(shade(HC, 1.15));
      w.rbox(0, bh * 0.3, L / 2 + hs * 0.45, hs, hs * 0.85, hs * 1.25, (x, y) => (y > bh * 0.3 + hs * 0.2 ? Ht : H), 3);
      w.rbox(0, bh * 0.2, L / 2 + hs * 1.05, hs * 0.6, hs * 0.4, hs * 0.5, w.c(shade(HC, 0.85)), 3);
      eyes(w, o, 0, bh * 0.4, L / 2 + hs * 0.95, s * (o.head || 1), 0.09);
      if (o.tail !== false) { const tl = 0.5 * s * (o.tailL || 1); w.path([[0, 0, -L / 2 + 0.05 * s], [0, 0.04 * s, -L / 2 - tl * 0.5], [0, -0.02 * s, -L / 2 - tl]], 0.07 * s, 0.035 * s, w.c(c2)); w.fill((x, y, z) => (Math.abs(y + 0.02 * s) <= w.u * 0.6 && z < -L / 2 - tl * 0.85 && z > -L / 2 - tl * 1.2 && Math.abs(x) < (z + L / 2 + tl * 1.25) * -0.0 + 0.12 * s ? C3 : null), -0.15 * s, 0.15 * s, -0.05 * s, 0.02 * s, -L / 2 - tl * 1.25, -L / 2 - tl * 0.8); }
      for (const sx of [-1, 1]) { w.cap([sx * bw * 0.3, -bh * 0.4, L * 0.1], [sx * bw * 0.3, -bh * 0.75, L * 0.05], 0.035 * s, w.c(c2)); for (const dz of [-0.03, 0.03]) w.cap([sx * bw * 0.3, -bh * 0.75, L * 0.05], [sx * bw * 0.32, -bh * 0.82, L * 0.05 + dz * s + 0.04 * s], 0.015 * s, w.c("#e8e0d0")); }
      runEx(o.headX, w, o, { x: 0, y: bh * 0.3 + hs * 0.45, z: L / 2 + hs * 0.4, s: s * (o.head || 1) });
      runEx(o.bodyX, w, o, { x: 0, y: bh * 0.5, z: 0, s });
      w.emit(P);
    },
  };
  const pivots = {}, anim = {};
  addWings(parts, pivots, anim, o, s, [bw * 0.4, bh * 0.3, 0.05 * s], c2, true);
  if (o.orbit) { parts.ring = orbitRing(o, s); pivots.ring = [0, 0, 0]; anim.ring = "orbit"; }
  return { height: bh * 0.8 + hs, size: Math.max(bw, L), hover: o.hover || 1.6 * Math.max(0.8, s), fly: true, parts, pivots, anim };
}

function floater(o) {
  const s = o.s || 1, c1 = o.c1, c2 = o.c2 || shade(c1, 0.75), c3 = o.c3 || shade(c1, 1.25);
  const bw = 0.5 * s * (o.w || 1), bh = 0.7 * s * (o.th || 1), hs = 0.38 * s * (o.head || 1);
  const glowBody = !!o.glowBody, k = o.k || 1.6;
  const parts = {
    body(P) {
      const w = make(s, 1.0, -0.6, (bh + hs) / s + 1.0, 0.9);
      const M = (hex) => (glowBody ? w.g(hex, k) : w.c(hex));
      const C1 = M(c1), C2 = M(c2), C3 = M(c3), CD = M(shade(c2, 0.8));
      // a teardrop body that frays into wisps underneath
      w.fill((x, y, z) => {
        const t = (y - (-0.2 * s)) / (bh + 0.4 * s); if (t < 0 || t > 1) return null;
        const r = bw * 0.55 * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.85 + 0.25) + 0.02 * s;
        const d = Math.hypot(x, z * 1.15) + (t < 0.35 ? (vnoise(x / (0.08 * s), y / (0.1 * s), z / (0.08 * s)) - 0.5) * 0.12 * s : 0);
        if (d > r) return null;
        if (t < 0.3 && vnoise(Math.atan2(z, x) * 3, t * 4, 1) > 0.55 + t) return null;     // tattered hem
        return t > 0.8 ? C3 : t < 0.3 ? CD : (Math.round(Math.atan2(z, x) * 3 + t * 6) & 1) ? C1 : C2;
      }, -bw, bw, -0.25 * s, bh + 0.25 * s, -bw, bw);
      if (!o.noHead) { w.rbox(0, bh + 0.2 * s + hs * 0.5, 0.02 * s, hs, hs, hs, (x, y) => (y > bh + 0.2 * s + hs * 0.7 ? M(shade(o.headC || c1, 1.15)) : M(o.headC || c1)), 2.6); eyes(w, o, 0, bh + 0.24 * s + hs * 0.5, hs * 0.52, s * (o.head || 1)); }
      if (o.arms) for (const sx of [-1, 1]) { w.path([[sx * bw * 0.45, bh * 0.85, 0], [sx * (bw / 2 + 0.12 * s), bh * 0.55, 0.06 * s], [sx * (bw / 2 + 0.1 * s), bh * 0.25, 0.12 * s]], 0.07 * s, 0.05 * s, C2); for (const dz of [-0.04, 0, 0.04]) w.cap([sx * (bw / 2 + 0.1 * s), bh * 0.25, 0.12 * s], [sx * (bw / 2 + 0.11 * s), bh * 0.15, 0.16 * s + dz * s], 0.015 * s, C3); }
      runEx(o.headX, w, o, { x: 0, y: bh + 0.2 * s + hs, z: 0.02 * s, s: s * (o.head || 1) });
      runEx(o.bodyX, w, o, { x: 0, y: bh * 0.6 + 0.2 * s, z: 0, s });
      w.emit(P);
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
      const w = make(s, 0.75, -0.05, 1.3, 0.75);
      const M = (hex, e) => (o.glowBody ? w.g(hex, e || o.k || 1.4) : w.c(hex));
      const C1 = M(c1), C2 = M(c2), C3 = M(c3);
      w.fill((x, y, z) => {
        const t = y / (0.85 * s); if (t < 0 || t > 1) return null;
        const r = 0.47 * s * Math.sqrt(Math.max(0, 1 - Math.pow(t, 2.2))) * (1 + 0.03 * Math.sin(Math.atan2(z, x) * 5));
        const d = Math.hypot(x, z);
        if (d > r) return null;
        if (t > 0.6 && t < 0.78 && x < -0.08 * s && x > -0.3 * s && z > 0.1 * s && d > r - w.u * 1.2) return M(shade(c3, 1.35), 1.6);   // a wet highlight
        return t < 0.12 ? C2 : t > 0.75 ? C3 : C1;
      }, -0.5 * s, 0.5 * s, 0, 0.86 * s, -0.5 * s, 0.5 * s);
      if (o.core) { w.ell(0, 0.38 * s, 0, 0.14 * s, 0.14 * s, 0.14 * s, w.g(o.gl || "#ffffff", 2)); w.ell(0.05 * s, 0.38 * s, 0.38 * s, 0.1 * s, 0.1 * s, w.u, w.g(o.gl || "#ffffff", 1.6)); }
      eyes(w, o, 0, 0.55 * s, 0.38 * s, s, 0.14);
      w.box(0, 0.4 * s, 0.44 * s, 0.18 * s, w.u, w.u, w.c(shade(c1, 0.5)));
      for (let i = 0; i < 4; i++) { const a = i * 1.7 + 0.5; w.ell(Math.cos(a) * 0.42 * s, 0.03 * s, Math.sin(a) * 0.42 * s, 0.06 * s, 0.04 * s, 0.06 * s, C2); }
      runEx(o.bodyX, w, o, { x: 0, y: 0.5 * s, z: 0, s });
      w.emit(P);
    },
  };
  return { height: 0.9 * s, size: 0.9 * s, hover: 0, parts, pivots: { jelly: [0, 0, 0] }, anim: { jelly: "wobble" } };
}

function serpent(o) {
  const s = o.s || 1, c1 = o.c1, c2 = o.c2 || shade(c1, 0.75), c3 = o.c3 || shade(c1, 1.2);
  const parts = {
    tail(P) {
      const w = make(s, 0.8, -0.05, 0.4, 0.9), C1 = w.c(c1), C2 = w.c(c2), BE = w.c(o.belly || c3), pts = [];
      for (let i = 0; i <= 14; i++) { const t = i / 14, a = t * TAU * 1.15 + 0.5, r = 0.36 * s * (1 - t * 0.55); pts.push([Math.cos(a) * r, 0.12 * s * (1 - t * 0.5), -0.1 * s - Math.sin(a) * r]); }
      w.path(pts, 0.16 * s, 0.04 * s, (x, y, z) => (y < 0.07 * s ? BE : (Math.round((x + z) / (0.08 * s)) & 1) ? C1 : C2));
      w.emit(P);
    },
    body(P) {
      const w = make(s, 0.8, -0.05, 1.6, 0.8), C1 = w.c(c1), C3 = w.c(c3), BE = w.c(o.belly || c3), CD = w.c(shade(c1, 0.8));
      w.path([[0, 0.15 * s, 0], [0, 0.55 * s, 0.08 * s], [0, 0.95 * s, 0.12 * s]], 0.22 * s, 0.17 * s, (x, y, z) => (z > 0.14 * s && Math.abs(x) < 0.12 * s ? ((Math.round(y / (0.06 * s)) & 1) ? BE : w.c(shade(o.belly || c3, 0.85))) : (Math.round((y + x) / (0.07 * s)) & 1) ? C1 : CD));
      w.rbox(0, 1.12 * s, 0.14 * s, 0.36 * s, 0.32 * s, 0.4 * s, (x, y) => (y > 1.2 * s ? C3 : C1), 3);
      for (const sx of [-1, 1]) w.fill((x, y, z) => (Math.abs(x - sx * 0.19 * s) <= w.u * 0.6 && y > 1.0 * s && y < 1.32 * s - (0.1 * s - z) * 0.4 && z < 0.12 * s && z > -0.12 * s ? w.c(shade(c3, 1.1)) : null), sx * 0.19 * s - 0.03 * s, sx * 0.19 * s + 0.03 * s, 0.95 * s, 1.35 * s, -0.15 * s, 0.15 * s);
      eyes(w, o, 0, 1.14 * s, 0.34 * s, s, 0.09);
      runEx(o.headX, w, o, { x: 0, y: 1.3 * s, z: 0.14 * s, s });
      w.emit(P);
    },
  };
  const arm = (right) => (P) => { const w = make(s, 0.6, -1.1, 0.4, 1.1), A = w.c(c1); w.cap([0, 0, 0], [0, -0.42 * s, 0.04 * s], 0.07 * s, A, 0.06 * s); w.ell(0, -0.45 * s, 0.05 * s, 0.075 * s, 0.07 * s, 0.075 * s, w.c(c2)); if (right && o.weapon && WEAPON[o.weapon]) WEAPON[o.weapon](w, o, { x: 0, y: -0.45 * s, z: 0, s }); w.emit(P); };
  parts.armL = arm(false); parts.armR = arm(true);
  return { height: 1.4 * s, size: 0.8 * s, hover: 0, parts, pivots: { tail: [0, 0, 0], armL: [-0.3 * s, 0.9 * s, 0.1 * s], armR: [0.3 * s, 0.9 * s, 0.1 * s] }, anim: { tail: "wobble", armL: "swingB", armR: "swingA" } };
}

function tank(o) {
  const s = o.s || 1, c1 = o.c1, c2 = o.c2 || shade(c1, 0.7), c3 = o.c3 || shade(c1, 1.2);
  const parts = {
    body(P) {
      const w = make(s, 0.75, -0.05, 2.0, 0.9), C1 = w.c(c1), C2 = w.c(c2), C3 = w.c(c3), RV = w.c(shade(c3, 1.2));
      w.rbox(0, 0.62 * s, 0, 1.0 * s, 0.55 * s, 1.3 * s, (x, y, z) => (y > 0.82 * s ? C3 : (Math.abs(z) % (0.26 * s)) < w.u && y > 0.5 * s ? RV : C1), 6);
      w.rbox(0, 1.08 * s, -0.05 * s, 0.7 * s, 0.4 * s, 0.7 * s, (x, y) => (y > 1.2 * s ? C1 : C2), 5);
      w.cap([0, 1.1 * s, 0.3 * s], [0, 1.12 * s, 0.75 * s], 0.07 * s, w.c("#3a3a40"));
      w.box(0, 1.1 * s, 0.31 * s, 0.3 * s, 0.1 * s, w.u, w.g(o.eye || "#ffb15c", 2.2));
      for (const sx of [-1, 1]) w.ell(sx * 0.3 * s, 0.7 * s, 0.66 * s, 0.06 * s, 0.05 * s, w.u, w.g("#ffe9a8", 2));
      runEx(o.bodyX, w, o, { x: 0, y: 1.2 * s, z: 0, s });
      w.emit(P);
    },
    treadA(P) {
      const w = make(s, 0.8, -0.35, 0.35, 0.85), T = w.c("#2a2a30"), TH = w.c("#4a4a52"), WH = w.c("#6a6a72");
      for (const sx of [-1, 1]) {
        w.rbox(sx * 0.6 * s, 0, 0, 0.26 * s, 0.42 * s, 1.42 * s, (x, y, z) => ((Math.round(z / (0.07 * s)) & 1) && Math.abs(y) > 0.15 * s ? TH : T), 5);
        for (let i = 0; i < 4; i++) w.fill((x, y, z) => { const d = Math.hypot(y, z - (-0.48 * s + i * 0.32 * s)); return Math.abs(x - sx * 0.74 * s) <= w.u && d <= 0.12 * s ? (d < 0.04 * s ? T : WH) : null; }, sx * 0.74 * s - 0.04 * s, sx * 0.74 * s + 0.04 * s, -0.15 * s, 0.15 * s, -0.65 * s, 0.6 * s);
      }
      w.emit(P);
    },
  };
  return { height: 1.4 * s, size: 1.4 * s, hover: 0, parts, pivots: { treadA: [0, 0.22 * s, 0] }, anim: {} };
}

export const VOX_PLAN = { biped, quad, insect, flyer, floater, blob, serpent, tank, golem: (o) => biped({ w: 1.5, th: 1.1, d: 1.25, head: 0.75, arm: 1.3, leg: 0.9, ...o, _golem: true }) };

// the five classic Circle creeps (Imp, Sprite, Mite, Golem, Behemoth) — the ones every wave is made of
const CLASSIC = {
  grunt: { plan: "biped", s: 0.85, c1: "#b0442c", c2: "#7a2a1c", c3: "#c4553a", eye: "#ffd23d", headX: ["horns"], horn: "#2a1a14", wings: true, wingC: "#5a1e16", devilTail: true, weapon: "claws" },
  runner: { plan: "biped", s: 0.72, float: true, hover: 0.35, c1: "#e0c14a", c2: "#c9a83a", c3: "#ffe58a", eye: "#4a3ab0", headX: ["antennae"], horn: "#fff2a8", wings: true, dragonfly: true, wingC: "#fff8d0", bodyX: ["core"], gl: "#fff2a8" },
  swarm: { plan: "insect", s: 0.8, c1: "#4f7a24", c2: "#2e3a14", c3: "#6a9a34", eye: "#c6ff5a", legC: "#1e2a0a" },
  brute: { plan: "golem", s: 1.0, c1: "#7a8aa0", c2: "#6a7890", c3: "#8a9ab0", eye: "#bff0ff", gl: "#5bd6ff", headX: ["mossTop"], bodyX: ["core", "runes"] },
  tank: { plan: "quad", s: 1.35, c1: "#5a6b86", c2: "#3e4a60", c3: "#6a7b96", belly: "#4e5d76", eye: "#ff4d4d", snout: true, head: 1.15, headUp: 0.55, horn: "#d8d0b8", headX: ["tusks", "horns"], bodyX: ["plates"], plateC: "#3e4a60", tailL: 0.6 },
};
export const VOX_CLASSIC = {};
for (const id in CLASSIC) { const o = CLASSIC[id]; VOX_CLASSIC[id] = VOX_PLAN[o.plan](o); }
