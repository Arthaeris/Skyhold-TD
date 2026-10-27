/* Skyhold TD — render/statusfx.js
   How each status effect looks on an enemy: small voxel markers (a ticking bomb, a curse skull, a target
   reticle, dazed stars, roots round the feet, a halo, orbiting ice shards, charge pips, glitch cubes…)
   plus particles that fit the effect (licking flames, dripping lava, rising poison bubbles, crackling
   sparks, frost motes, sinking shadow wisps, falling metal shavings…). Up to three statuses show at once.
   Markers are instanced like the projectiles; everything here is cosmetic. */
import * as THREE from "three";
import { Vox } from "./voxkit.js";
import { Part, MAT, TAU } from "./kit.js";

const MU = 0.055;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _s = new THREE.Vector3(), _v = new THREE.Vector3(), _e = new THREE.Euler();
const rnd = Math.random;
const pp = (v) => (hex, e = 0, j = 0.04) => v.pal(hex, e, j);

// marker models (centred on their origin; "up" = +y)
const MARKERS = {
  flame(v, p) { for (const [x, z, h] of [[0, 0, 9], [-2, 1, 6], [2, -1, 6.5]]) v.fill((xx, y, zz) => { const t = y / h, r = 2.2 * (1 - t) + 0.3; return t >= 0 && t <= 1 && Math.hypot(xx - x, zz - z) <= r ? p(t > 0.65 ? "#ffe08a" : t > 0.3 ? "#ffb02e" : "#ff6a1a", 1.7) : null; }, x - 3, x + 3, 0, h, z - 3, z + 3); },
  bomb(v, p) { v.ell(0, 0, 0, 4, 4, 4, (x, y, z) => (y > 2 && x < 0 ? p("#5a5a66") : p("#24242c"))); v.box(-1, 4, -1, 1, 5, 1, p("#8a8a96")); v.path([[0, 5, 0], [1.5, 7, 0], [3, 8, 0]], 0.5, 0.5, p("#c9a46a")); v.set(3, 9, 0, p("#ffe066", 2.4)); },
  shard(v, p) { v.fill((x, y, z) => { const t = (y + 5) / 10, r = 2 * (1 - Math.abs(t - 0.4) / 0.6); return t >= 0 && t <= 1 && Math.abs(x) + Math.abs(z) <= r + 0.3 ? p(x >= 0 ? "#dff4ff" : "#8bcdef") : null; }, -3, 3, -5, 5, -3, 3); v.set(0, 0, 0, p("#bff4ff", 1.6)); },
  roots(v, p) { for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU; v.path([[Math.cos(a) * 9, 0, Math.sin(a) * 9], [Math.cos(a + 0.4) * 6, 4, Math.sin(a + 0.4) * 6], [Math.cos(a + 0.9) * 7, 8, Math.sin(a + 0.9) * 7], [Math.cos(a + 1.2) * 5, 11, Math.sin(a + 1.2) * 5]], 1.2, 0.6, i % 2 ? p("#4f7a36") : p("#5a4228")); v.ell(Math.cos(a + 0.6) * 7, 6, Math.sin(a + 0.6) * 7, 1.6, 0.8, 1.2, p("#78c25e")); } },
  sprout(v, p) { v.box(0, 0, 0, 0, 4, 0, p("#4f9a45")); for (const s of [-1, 1]) v.ell(s * 2.2, 5, 0, 2.2, 0.8, 1.4, p("#9be37f")); v.set(0, 5, 0, p("#ffe27a", 1.4)); },
  pip(v, p) { v.ell(0, 0, 0, 2, 2, 2, (x, y, z) => (Math.hypot(x, y, z) < 1 ? p("#ffffff", 2.2) : p("#c77dff", 1.8))); },
  wind(v, p) { for (let i = 0; i < 40; i++) { const t = i / 40, a = t * TAU * 2, r = 4 + t * 6; v.set(Math.cos(a) * r, t * 5, Math.sin(a) * r, p(i % 3 ? "#ffffff" : "#e0c2ff", 1.2)); } },
  halo(v, p) { v.fill((x, y, z) => { const d = Math.hypot(x, z); return d >= 5 && d <= 6.5 && Math.abs(y) < 0.6 ? p("#ffe066", 1.9) : null; }, -7, 7, -1, 1, -7, 7); },
  star(v, p) { v.fill((x, y, z) => (Math.abs(z) < 0.6 && (Math.abs(x) * 0.45 + Math.abs(y) <= 2.4 || Math.abs(y) * 0.45 + Math.abs(x) <= 2.4) ? p(Math.abs(x) + Math.abs(y) < 1.5 ? "#ffffff" : "#ffe066", 2) : null), -5, 5, -5, 5, -1, 1); },
  skull(v, p) { v.ell(0, 1, 0, 3.4, 3.2, 3.2, p("#cbb9ff", 1.5)); v.box(-2, -3, -1, 2, -1, 2, p("#a98aff", 1.4)); for (const s of [-1, 1]) v.ell(s * 1.3, 1, 2.8, 1, 1, 0.8, 0); v.box(-1.5, -2, 2, 1.5, -2, 2, 0); },
  chevron(v, p) { v.fill((x, y, z) => (Math.abs(z) < 0.6 && Math.abs(y - (3 - Math.abs(x) * 0.9)) < 1 && Math.abs(x) <= 4 ? p("#a892ff", 1.6) : null), -5, 5, -3, 4, -1, 1); },
  reticle(v, p) { v.fill((x, y, z) => { if (Math.abs(z) > 0.6) return null; const d = Math.hypot(x, y); if (d >= 5 && d <= 6) return p("#ff4d8a", 1.9); if ((Math.abs(x) < 0.6 && d > 3 && d < 8) || (Math.abs(y) < 0.6 && d > 3 && d < 8)) return p("#ffd0e0", 2); return d < 1 ? p("#ff4d8a", 2) : null; }, -8, 8, -8, 8, -1, 1); },
  magnet(v, p) { v.fill((x, y, z) => { if (Math.abs(z) > 1) return null; const d = Math.hypot(x, y - 1); const u = y <= 1 ? d >= 2 && d <= 4 : Math.abs(x) >= 2 && Math.abs(x) <= 4 && y <= 5; return u ? (y > 3.6 ? p("#e8eef4") : p("#d8423a")) : null; }, -5, 5, -4, 5, -1, 1); },
  tag(v, p) { v.box(-2, -1, -1, 2, 1, 1, p("#c2d2e2")); v.box(0, 2, 0, 0, 5, 0, p("#6a7078")); v.set(0, 6, 0, p("#ff3b3b", 2.4)); },
  glitch(v, p) { v.box(-2, -2, -2, 1, 1, 1, (x, y, z) => ((x + y + z) & 1 ? p("#ff5fa2", 1.8) : p("#ffc2dd", 2))); v.box(1, 0, -1, 3, 2, 1, p("#5dffb0", 1.8)); },
  mirror(v, p) { v.fill((x, y, z) => (Math.abs(z) < 0.6 && Math.abs(x) * 1.2 + Math.abs(y) * 0.6 <= 3 ? p(x + y > 0 ? "#ffffff" : "#ff8fc0", 1.6) : null), -4, 4, -6, 6, -1, 1); },
  entropy(v, p) { for (const tilt of [0.6, -0.6]) for (let i = 0; i < 40; i++) { const a = (i / 40) * TAU, x = Math.cos(a) * 6, y = Math.sin(a) * 6; v.set(x, y * Math.cos(tilt), y * Math.sin(tilt), p(i % 4 ? "#ffb3d4" : "#ffffff", 1.6)); } },
  badge(v, p) { v.fill((x, y, z) => (Math.abs(z) < 0.6 && Math.abs(x) <= 4 && (Math.abs(y - (2 - Math.abs(x) * 0.7)) < 0.9 || Math.abs(y - (-1 - Math.abs(x) * 0.7)) < 0.9) ? p("#ffcf8f", 1.5) : null), -5, 5, -5, 4, -1, 1); },
  plate(v, p) { v.box(-3, -3, -0.5, 3, 3, 0.5, (x, y) => (Math.abs(x) === 3 || Math.abs(y) === 3 ? p("#8a96a8") : p("#cdd9e5"))); },
  drip(v, p) { v.ell(0, 0, 0, 1.4, 2, 1.4, p("#ffa030", 1.8)); },
};

// per-status behaviour: (fx, c) with c = { p: feet, h: height, s: scale, t: time, k: slot index }
const B = {
  burning(fx, c) { fx.put("flame", c.p.x, c.p.y + c.h * 0.95, c.p.z, c.t * 2, 0.9 + 0.25 * Math.sin(c.t * 23) * c.s, c.s); fx.every(0.05, () => fx.spark(c, "#ffb02e", 1.8, 0.45, 0.32, 0.5)); fx.every(0.12, () => fx.spark(c, "#ff6a1a", 1.2, 0.5, 0.35, 0.4)); },
  molten(fx, c) { fx.every(0.09, () => fx.spark(c, "#ffa030", -0.5, 0.6, 0.3, 0.6, 9)); fx.every(0.4, () => fx.puddle(c, "#ff5a14", 0.5)); fx.every(0.15, () => fx.spark(c, "#ff5a14", 0.4, 0.4, 0.3, 0.7)); },
  volatile(fx, c) { const beat = 1 + 0.18 * Math.max(0, Math.sin(c.t * 12)); fx.put("bomb", c.p.x, c.top + 0.25, c.p.z, Math.sin(c.t * 3) * 0.3, beat, 1); fx.every(0.08, () => fx.sparkAt(c.p.x + 0.16, c.top + 0.75, c.p.z, "#ffe066", 1.2, 0.2, 0.25)); },
  chilled(fx, c) { fx.every(0.08, () => fx.orbitMote(c, "#bff4ff", 0.6)); fx.every(0.3, () => fx.spark(c, "#ffffff", -0.2, 0.5, 0.25, 0.8)); },
  frozen(fx, c) { fx.every(0.25, () => fx.spark(c, "#ffffff", 0, 0.5, 0.3, 0.9)); },
  brittle(fx, c) { for (let i = 0; i < 3; i++) { const a = c.t * 1.5 + (i / 3) * TAU, r = 0.55 * c.s + 0.2; fx.put("shard", c.p.x + Math.cos(a) * r, c.p.y + c.h * (0.4 + 0.15 * Math.sin(c.t * 2 + i)), c.p.z + Math.sin(a) * r, a, 1, c.s); } },
  poisoned(fx, c) { fx.every(0.07, () => fx.spark(c, rnd() < 0.7 ? "#73d35f" : "#c6ff5a", 0.9, 0.5, 0.32, 0.9)); fx.every(0.5, () => fx.puddle(c, "#4f9e3f", 0.6)); },
  rooted(fx, c) { fx.put("roots", c.p.x, c.p.y, c.p.z, 0, 1, c.s); },
  sprouting(fx, c) { fx.put("sprout", c.p.x + 0.1, c.top - 0.05, c.p.z, c.t * 0.5, 1 + 0.08 * Math.sin(c.t * 4), c.s); fx.every(0.3, () => fx.spark(c, "#9be37f", 0.5, 0.4, 0.25, 0.7)); },
  shocked(fx, c) { fx.every(0.11, () => fx.bolt(c, "#ecd1ff")); fx.every(0.06, () => fx.spark(c, "#c77dff", 0, 0.5, 0.25, 0.2)); },
  conductive(fx, c) { for (let i = 0; i < 2; i++) { const a = c.t * 4 + i * Math.PI, r = 0.5 * c.s + 0.25; fx.put("pip", c.p.x + Math.cos(a) * r, c.p.y + c.h * 0.6 + Math.sin(a * 2) * 0.12, c.p.z + Math.sin(a) * r, 0, 1, c.s); } fx.every(0.35, () => fx.bolt(c, "#d9a6ff")); },
  lifted(fx, c) { fx.put("wind", c.p.x, c.p.y + 0.05, c.p.z, c.t * 9, 1, c.s); fx.every(0.08, () => fx.orbitMote(c, "#ffffff", 0.2)); },
  illuminated(fx, c) { fx.put("halo", c.p.x, c.top + 0.25, c.p.z, c.t, 1, c.s); fx.every(0.15, () => fx.spark(c, "#fff3c0", 0.3, 0.5, 0.25, 0.6)); },
  purified(fx, c) { fx.every(0.04, () => fx.spark(c, "#ffffff", 2.4, 0.4, 0.3, 0.45)); },
  blinded(fx, c) { for (let i = 0; i < 3; i++) { const a = c.t * 3 + (i / 3) * TAU; fx.put("star", c.p.x + Math.cos(a) * 0.35, c.top + 0.2 + Math.sin(c.t * 6 + i) * 0.04, c.p.z + Math.sin(a) * 0.35, c.t * 4 + i, 0.9, 1); } },
  cursed(fx, c) { fx.put("skull", c.p.x, c.top + 0.4 + Math.sin(c.t * 3) * 0.06, c.p.z, Math.sin(c.t * 1.5) * 0.5, 1, 1); fx.every(0.1, () => fx.spark(c, "#8b6cff", -0.8, 0.5, 0.35, 0.8)); },
  weakened(fx, c) { const y = ((c.t * 0.9) % 1); fx.put("chevron", c.p.x + 0.45 * c.s, c.p.y + c.h * (1 - y * 0.7), c.p.z, c.t, 0.8, 1); },
  marked(fx, c) { fx.putFlat("reticle", c.p.x, c.top + 0.45, c.p.z, c.t * 1.5, 1 + 0.1 * Math.sin(c.t * 8), 1); },
  magnetized(fx, c) { fx.put("magnet", c.p.x, c.top + 0.35, c.p.z, Math.sin(c.t * 2) * 0.4, 1, 1); fx.every(0.2, () => fx.orbitMote(c, "#9fb3c8", 0.3)); },
  tagged(fx, c) { fx.put("tag", c.p.x - 0.15 * c.s, c.top + 0.1, c.p.z, 0, 1, 1); if (Math.sin(c.t * 9) > 0.6) fx.every(0.05, () => fx.sparkAt(c.p.x - 0.15 * c.s, c.top + 0.3, c.p.z, "#ff3b3b", 0, 0.12, 0.4)); },
  shredded(fx, c) { fx.every(0.18, () => fx.bit(c, "#cdd9e5")); fx.every(0.12, () => fx.spark(c, "#ffe9a8", 0, 0.25, 0.2, 0.2, 6)); },
  corrupted(fx, c) { if (rnd() < 0.5) fx.put("glitch", c.p.x + (rnd() - 0.5) * 0.7 * c.s, c.p.y + c.h * rnd(), c.p.z + (rnd() - 0.5) * 0.7 * c.s, 0, 0.8 + rnd() * 0.5, c.s); fx.every(0.1, () => fx.spark(c, rnd() < 0.5 ? "#ff5fa2" : "#5dffb0", 0, 0.15, 0.3, 0.6)); },
  fracture(fx, c) { for (let i = 0; i < 3; i++) { const a = -c.t * 1.2 + (i / 3) * TAU, r = 0.6 * c.s + 0.2; fx.put("mirror", c.p.x + Math.cos(a) * r, c.p.y + c.h * 0.5, c.p.z + Math.sin(a) * r, -a + Math.PI / 2, 1, c.s); } },
  entropy(fx, c) { fx.put("entropy", c.p.x, c.p.y + c.h * 0.55, c.p.z, c.t * 2.5, 1, c.s); },
  momentum(fx, c) { fx.every(0.06, () => fx.spark(c, "#ffd23d", 0, 0.25, 0.25, 0.4)); },
  hardened(fx, c) { for (let i = 0; i < 2; i++) { const a = c.t * 0.8 + i * Math.PI, r = 0.5 * c.s + 0.25; fx.put("plate", c.p.x + Math.cos(a) * r, c.p.y + c.h * 0.5, c.p.z + Math.sin(a) * r, -a + Math.PI / 2, 1, c.s); } },
  veteran(fx, c) { fx.put("badge", c.p.x + 0.3 * c.s, c.top + 0.15, c.p.z, 0, 0.8, 1); },
};

export function createStatusFx(scene, fx) {
  const { sparks, bits, streaks, rings } = fx;
  const kinds = new Map();
  for (const k of Object.keys(MARKERS)) {
    const v = new Vox(MU, -12, 12, -12, 14, -12, 12), P = new Part(1);
    MARKERS[k](v, pp(v)); v.emit(P, 0, 0, 0, 1);
    const K = { meshes: [], n: 0, cap: 64 };
    for (const [Bt, mat] of [[P.lit, MAT.lit], [P.glow, MAT.glow]]) {
      if (Bt.empty) continue;
      const inst = new THREE.InstancedMesh(Bt.geometry(), mat, K.cap);
      inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage); inst.frustumCulled = false; inst.count = 0; inst.renderOrder = 6;
      scene.add(inst); K.meshes.push(inst);
    }
    kinds.set(k, K);
  }
  const timers = new Map();
  let cur = null, curKey = "", dt = 0.016;
  const api = {
    put(kind, x, y, z, yaw, pulse, s) {
      const K = kinds.get(kind); if (!K || K.n >= K.cap) return;
      _m.compose(_v.set(x, y, z), _q.setFromAxisAngle(_s.set(0, 1, 0), yaw), _s.setScalar((pulse || 1) * (s || 1)));
      for (const m of K.meshes) m.setMatrixAt(K.n, _m);
      K.n++;
    },
    putFlat(kind, x, y, z, spin, pulse, s) {   // a marker lying flat, facing up (reticles)
      const K = kinds.get(kind); if (!K || K.n >= K.cap) return;
      _q.setFromEuler(_e.set(-Math.PI / 2, 0, spin));
      _m.compose(_v.set(x, y, z), _q, _s.setScalar((pulse || 1) * (s || 1)));
      for (const m of K.meshes) m.setMatrixAt(K.n, _m);
      K.n++;
    },
    every(period, fn) { const key = curKey + "|" + period; const t = (timers.get(key) || rnd() * period) + dt; if (t >= period) { timers.set(key, t - period); fn(); } else timers.set(key, t); },
    spark(c, color, vy, life, size, spread, grav = 0) { sparks.spawn({ x: c.p.x + (rnd() - 0.5) * spread * c.s, y: c.p.y + c.h * (0.2 + rnd() * 0.75), z: c.p.z + (rnd() - 0.5) * spread * c.s, vy, color, life, size, drag: 1.2, glow: 1.6, grav }); },
    sparkAt(x, y, z, color, vy, life, size) { sparks.spawn({ x, y, z, vy, color, life, size, drag: 2, glow: 2 }); },
    orbitMote(c, color, vy) { const a = rnd() * TAU, r = 0.5 * c.s + 0.15; sparks.spawn({ x: c.p.x + Math.cos(a) * r, y: c.p.y + c.h * (0.1 + rnd() * 0.8), z: c.p.z + Math.sin(a) * r, vx: -Math.sin(a) * 1.2, vy, vz: Math.cos(a) * 1.2, color, life: 0.6, size: 0.22, drag: 0.8, glow: 1.5 }); },
    puddle(c, color, r) { rings.add(_v.set(c.p.x, c.p.y + 0.06, c.p.z).clone(), color, 0.1, r * c.s, 0.6, 1.3); },
    bolt(c, color) { const a = rnd() * TAU, b = a + 1 + rnd() * 2, r = 0.45 * c.s; const p1 = new THREE.Vector3(c.p.x + Math.cos(a) * r, c.p.y + c.h * rnd(), c.p.z + Math.sin(a) * r), p2 = new THREE.Vector3(c.p.x + Math.cos(b) * r, c.p.y + c.h * rnd(), c.p.z + Math.sin(b) * r); streaks.bolt(p1, p2, color, 0.05, 0.1, 3); },
    bit(c, color) { bits.burst(c.p.x, c.p.y + c.h * 0.6, c.p.z, color, 1, 2, 0.06, c.p.y + 0.02); },
  };
  return {
    begin(frameDt) { dt = frameDt; for (const K of kinds.values()) K.n = 0; },
    // statuses: array of status ids (already ordered); p: feet; h: model height; s: scale; id: enemy id
    add(statuses, p, h, s, t, id) {
      let shown = 0;
      for (const st of statuses) {
        const f = B[st]; if (!f) continue;
        curKey = id + ":" + st;
        cur = { p, h, s, t: t + (id % 17) * 0.3, top: p.y + h + 0.55, k: shown };
        f(api, cur);
        if (++shown >= 3) break;
      }
    },
    end() { for (const K of kinds.values()) for (const m of K.meshes) { m.count = K.n; m.instanceMatrix.needsUpdate = true; } },
    forget(id) { const pre = id + ":"; for (const k of timers.keys()) if (k.startsWith(pre)) timers.delete(k); },
  };
}

// a chunky voxel ice block (unit size, centred) for frozen enemies
export function iceChunkGeometry() {
  const v = new Vox(1 / 14, -8, 8, -8, 9, -8, 8), P = new Part(1), p = pp(v);
  v.fill((x, y, z) => { const ax = Math.abs(x), ay = Math.abs(y - 0.5), az = Math.abs(z); return ax <= 7 && ay <= 7.5 && az <= 7 && ax + az <= 11 && ax + ay <= 12.5 && az + ay <= 12.5 ? p(y > 5 ? "#ffffff" : x + z > 3 ? "#dff4ff" : "#a6dcf5") : null; });
  for (const [x, z, h] of [[5, 3, 4], [-4, 5, 3], [2, -6, 3.5], [-6, -2, 2.5]]) v.fill((xx, y, zz) => { const t = (y - 7) / h; return t >= 0 && t <= 1 && Math.abs(xx - x) + Math.abs(zz - z) <= 2 * (1 - t) + 0.3 ? p("#dff4ff") : null; }, x - 3, x + 3, 7, 7 + h, z - 3, z + 3);
  v.emit(P, 0, 0, 0, 2);
  return P.lit.geometry();
}
