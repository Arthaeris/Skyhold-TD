/* Skyhold TD — render/shotfx.js
   What every tower actually fires, and what it looks like when it lands. Per tower (falling back to the
   element) there is:
     - a projectile: a small voxel model (fireball, icicle, thorn, cannon shell, missile, glitch cube…),
       how it flies (straight, or lobbed in an arc), whether it points along its flight or tumbles, and
       a trail (embers, frost motes, spores, smoke, sparks…);
     - an impact: a recipe of sparks, voxel debris, rings and streaks (a fireball bursts into flame and
       embers, an icicle shatters into shards, a missile blows up with smoke, a void orb implodes…);
     - for beam and chain towers, how the zap is drawn (a flickering flame beam, a gold light beam,
       forked lightning, a rainbow prism chain, a glitch path…), plus a small muzzle flash.
   Projectile models are instanced (two meshes per kind), so a busy wave stays cheap. Cosmetic only. */
import * as THREE from "three";
import { Vox } from "./voxkit.js";
import { Part, MAT, TAU } from "./kit.js";

const PU = 0.04;          // projectile voxel size (world units; a tile is 1)
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _e = new THREE.Euler();
const ZAX = new THREE.Vector3(0, 0, 1);
const rnd = Math.random;

// ---------------------------------------------------------------------------
// PROJECTILE MODELS (forward = +z), built once
// ---------------------------------------------------------------------------
const pp = (v) => (hex, e = 0, j = 0.04) => v.pal(hex, e, j);
const orb = (v, r, cols) => v.ell(0, 0, 0, r, r, r, (x, y, z) => { const d = Math.hypot(x, y, z) / r; return cols[Math.min(cols.length - 1, Math.floor(d * cols.length))]; });
const MODELS = {
  ember(v, p) { v.fill((x, y, z) => { const t = (z + 6) / 10, r = 1.8 * (1 - Math.abs(t - 0.6) / 0.6); return t >= 0 && t <= 1 && Math.hypot(x, y) <= r ? p(t > 0.7 ? "#fff0b0" : t > 0.4 ? "#ffb447" : "#ff6a2a", 1.8) : null; }, -2, 2, -2, 2, -6, 4); },
  fireball(v, p) { orb(v, 4.2, [p("#fff6dc", 2.2), p("#ffd65a", 2), p("#ff9a2e", 1.8), p("#ff6a1e", 1.6)]); for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; v.cap([Math.cos(a) * 2.5, Math.sin(a) * 2.5, -2], [Math.cos(a) * 1.5, Math.sin(a) * 1.5, -7], 1.4, p("#ff6a1e", 1.5), 0.4); } },
  magma(v, p) { v.ell(0, 0, 0, 4.4, 4, 4.4, (x, y, z) => { const n = Math.abs(Math.sin(x * 1.3) + Math.cos(y * 1.1 + z)); return n < 0.35 ? p("#ffa030", 1.9) : n < 0.6 ? p("#ff5a14", 1.6) : p("#3a2420"); }); },
  feather(v, p) { v.fill((x, y, z) => { const t = (z + 7) / 13, w = 4.5 * Math.sin(t * Math.PI) * (1 - t * 0.4); return t >= 0 && t <= 1 && Math.abs(x) <= w && Math.abs(y) <= 0.6 + (Math.abs(x) < 1 ? 0.6 : 0) ? p(Math.abs(x) > w - 1.2 ? "#fff1b0" : t > 0.7 ? "#ffd75a" : "#ff6a2a", Math.abs(x) > w - 1.2 ? 2 : 1.6) : null; }, -5, 5, -2, 2, -7, 6); },
  frostShard(v, p) { v.fill((x, y, z) => { const t = (z + 5) / 11, r = 2.2 * (t < 0.3 ? t / 0.3 : 1 - (t - 0.3) / 0.7); return t >= 0 && t <= 1 && Math.abs(x) + Math.abs(y) <= r + 0.3 ? p(x >= 0 ? (y >= 0 ? "#dff4ff" : "#a6dcf5") : "#6fb6e2", x > 0 && y > 0 ? 0 : 0) : null; }, -3, 3, -3, 3, -5, 6); v.set(0, 0, 6, p("#e6faff", 2)); v.set(0, 0, 0, p("#9eeaff", 1.6)); },
  icicle(v, p) { v.fill((x, y, z) => { const t = (z + 9) / 18, r = 2 * (1 - t); return t >= 0 && t <= 1 && Math.hypot(x, y) <= r + 0.3 ? p(t > 0.8 ? "#e6faff" : Math.hypot(x, y) < r - 0.9 ? "#9eeaff" : "#bff0ff", t > 0.8 ? 2 : 1.3) : null; }, -2, 2, -2, 2, -9, 9); },
  iceBoulder(v, p) { v.fill((x, y, z) => { const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z); return ax <= 4 && ay <= 4 && az <= 4 && ax + ay + az <= 9 ? p(x + y > 2 ? "#dff4ff" : x + y > -2 ? "#8bcdef" : "#4c9bd3") : null; }); v.set(0, 0, 4, p("#bff4ff", 1.8)); },
  frostOrb(v, p) { orb(v, 3.6, [p("#ffffff", 2.2), p("#bff4ff", 1.9), p("#6fe2ff", 1.6)]); v.fill((x, y, z) => { const d = Math.hypot(x, z); return Math.abs(y) < 0.6 && d > 4.6 && d < 5.8 ? p("#dff4ff", 1.6) : null; }, -6, 6, -1, 1, -6, 6); },
  thorn(v, p) { v.fill((x, y, z) => { const t = (z + 8) / 16, r = 1.6 * (1 - t); return t >= 0 && t <= 1 && Math.hypot(x, y) <= r + 0.3 ? p(t > 0.75 ? "#efe2b0" : "#6a4a2e") : null; }, -2, 2, -2, 2, -8, 8); for (const s of [-1, 1]) v.ell(s * 2, 0.5, -6, 1.8, 0.6, 1.2, p("#78c25e")); },
  sporePod(v, p) { v.ell(0, 0, 0, 3.6, 3.4, 4, (x, y, z) => (Math.abs(Math.sin(x * 2.1 + y * 1.7 + z)) < 0.25 ? p("#c6ff5a", 1.8) : y > 1 ? p("#d08848") : p("#b8743a"))); v.set(0, 3.5, 0, p("#9cff7a", 1.8)); },
  seed(v, p) { v.ell(0, 0, 0, 2.2, 2.2, 3.4, (x, y, z) => (z > 1.5 ? p("#d6ffc4", 2) : p("#73d35f", 1.6))); v.cap([0, 0, -3], [0, 1, -6], 0.6, p("#4f9a45")); },
  venom(v, p) { v.fill((x, y, z) => { const t = (z + 4) / 9, r = 2.8 * Math.sin(Math.min(1, t * 1.2) * Math.PI * 0.9 + 0.2); return t >= 0 && t <= 1 && Math.hypot(x, y) <= r ? p(Math.hypot(x, y) < r - 1.2 ? "#d6ffc4" : "#9cff7a", 1.7) : null; }, -3, 3, -3, 3, -4, 5); },
  spark(v, p) { orb(v, 2.2, [p("#ffffff", 2.4), p("#ecd1ff", 2)]); for (let i = 0; i < 7; i++) { const a = i * 2.4, b = i * 1.3; v.cap([0, 0, 0], [Math.cos(a) * Math.cos(b) * 5, Math.sin(b) * 5, Math.sin(a) * Math.cos(b) * 5], 0.5, p(i % 2 ? "#c77dff" : "#ecd1ff", 1.9)); } },
  windBlade(v, p) { v.fill((x, y, z) => { const d = Math.hypot(x, z), a = Math.atan2(z, x); return Math.abs(y) <= 0.5 && d >= 3.5 && d <= 5.5 - (a < 0 ? 0 : a * 0.3) && a > -0.2 ? p(d > 4.6 ? "#ffffff" : "#d9c2ff", 1.4) : null; }, -6, 6, -1, 1, -6, 6); },
  sunDisc(v, p) { v.fill((x, y, z) => { const d = Math.hypot(x, y); return Math.abs(z) <= 0.6 && d <= 4.2 ? p(d < 2 ? "#ffffff" : d < 3.2 ? "#ffe066" : "#ffc93a", 1.9) : null; }, -5, 5, -5, 5, -1, 1); for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; v.cap([Math.cos(a) * 4, Math.sin(a) * 4, 0], [Math.cos(a) * 6.5, Math.sin(a) * 6.5, 0], 0.7, p("#ffd23d", 1.7), 0.3); } },
  shadowOrb(v, p) { orb(v, 3.4, [p("#07050c"), p("#07050c"), p("#221a30"), p("#a98aff", 1.6)]); v.set(0, 0, 3.5, p("#cbb9ff", 2)); },
  skull(v, p) { v.ell(0, 0.5, 0, 3, 3, 3, p("#cbb9ff", 1.4)); v.box(-2, -3, 0, 2, -1, 2, p("#a98aff", 1.3)); for (const s of [-1, 1]) v.ell(s * 1.2, 0.5, 2.6, 0.9, 0.9, 0.6, p("#1a0f2a")); for (let i = 0; i < 4; i++) v.cap([(i - 1.5) * 1.2, 0, -2], [(i - 1.5) * 1.6, -1, -7], 0.8, p("#8b6cff", 1.5), 0.3); },
  voidSphere(v, p) { orb(v, 4, [p("#07050c"), p("#07050c"), p("#140f20")]); v.fill((x, y, z) => { const d = Math.hypot(x, z); return Math.abs(y) < 0.6 && d > 5 && d < 7 ? p(d < 6 ? "#cbb9ff" : "#8b6cff", 1.7) : null; }, -7, 7, -1, 1, -7, 7); },
  scythe(v, p) { v.fill((x, y, z) => { const d = Math.hypot(x, z), a = Math.atan2(z, x); return Math.abs(y) <= 0.5 && d >= 4 && d <= 6.5 - Math.max(0, a) * 1.2 && a > -0.5 && a < 2.4 ? p(d > 5.6 ? "#f0e8ff" : "#a98aff", d > 5.6 ? 2 : 1.6) : null; }, -7, 7, -1, 1, -7, 7); },
  eclipse(v, p) { v.fill((x, y, z) => { const d = Math.hypot(x, y); return Math.abs(z) <= 0.6 && d <= 5.4 ? (d < 3.4 ? p("#07050c") : p(d < 4.3 ? "#f0e8ff" : "#a98aff", 1.9)) : null; }, -6, 6, -6, 6, -1, 1); },
  bullet(v, p) { v.fill((x, y, z) => { const r = z > 3 ? 1.2 * (1 - (z - 3) / 3) + 0.3 : 1.2; return Math.hypot(x, y) <= r && z >= -4 && z <= 6 ? p(z > 3 ? "#e0b050" : "#c49a3a") : null; }, -2, 2, -2, 2, -4, 6); v.cap([0, 0, -4], [0, 0, -12], 0.8, p("#ffe066", 1.8), 0.3); },
  railSlug(v, p) { v.fill((x, y, z) => (Math.abs(x) <= 1 && Math.abs(y) <= 1 && Math.abs(z) <= 7 ? p(Math.abs(z) > 5 ? "#ffffff" : "#7fe8ff", 2) : null)); for (const zz of [-4, 0, 4]) v.fill((x, y) => (Math.max(Math.abs(x), Math.abs(y)) === 2 ? p("#c8f6ff", 1.8) : null), -2, 2, -2, 2, zz, zz); },
  missile(v, p) {
    v.fill((x, y, z) => { const r = z > 5 ? 1.8 * (1 - (z - 5) / 4) + 0.3 : 1.8; return Math.hypot(x, y) <= r && z >= -7 && z <= 9 ? p(z > 5 ? "#c8423a" : z === 2 ? "#e0a020" : "#d8dce4") : null; }, -2, 2, -2, 2, -7, 9);
    for (const [x, y] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) v.box(x * 1, y * 1, -7, x * 3.5, y * 3.5, -4, p("#7a8188"));
    v.cap([0, 0, -8], [0, 0, -12], 1.4, p("#ffb84a", 2), 0.4);
  },
  glitchCube(v, p) { v.box(-2, -2, -2, 2, 2, 2, (x, y, z) => ((x + y + z) & 1 ? p("#ff5fa2", 1.7) : p("#ffc2dd", 1.9))); v.box(2, -1, -3, 4, 1, -1, p("#5dffb0", 1.8)); v.box(-4, 1, 1, -3, 3, 3, p("#5dffb0", 1.8)); },
  warpRing(v, p) { v.fill((x, y, z) => { const d = Math.hypot(x, y); return Math.abs(z) <= 0.6 && d >= 2.6 && d <= 4.2 ? p(Math.round(Math.atan2(y, x) * 2) & 1 ? "#ff5fa2" : "#ffc2dd", 1.8) : d < 2.6 && Math.abs(z) < 0.3 ? p("#5dffb0", 1.3) : null; }, -5, 5, -5, 5, -1, 1); },
  chaosShard(v, p) { const C = [p("#5dffb0", 1.7), p("#c77dff", 1.7), p("#ff5fa2", 1.7), p("#ffe066", 1.7)]; for (let i = 0; i < 6; i++) { const a = i * 1.9, b = i * 1.1; v.cap([0, 0, 0], [Math.cos(a) * 4, Math.sin(b) * 4, Math.sin(a) * 4], 1, C[i % 4], 0.3); } orb(v, 1.8, [p("#ffffff", 2.2)]); },
  realityEye(v, p) { orb(v, 3.4, [p("#f2e8f6"), p("#f2e8f6"), p("#dccfe2")]); v.ell(0, 0, 3, 2, 2, 1, p("#ff5fa2", 1.8)); v.set(0, 0, 3.8, p("#07050c")); v.fill((x, y, z) => { const d = Math.hypot(x, z); return Math.abs(y) < 0.6 && d > 4.4 && d < 5.4 ? p("#5dffb0", 1.6) : null; }, -6, 6, -1, 1, -6, 6); },
  boltDart(v, p) { v.fill((x, y, z) => (Math.abs(x) + Math.abs(y) <= 1.5 * (1 - Math.abs(z) / 6) + 0.3 && Math.abs(z) <= 6 ? p(z > 2 ? "#ffffff" : "#ecd1ff", 2) : null), -2, 2, -2, 2, -6, 6); },
};

// ---------------------------------------------------------------------------
// STYLES per tower: projectile kind, flight, trail, impact (and zap look for beams/chains)
// trail: [colour, chance per frame, size, life, upward drift]
// ---------------------------------------------------------------------------
const STYLE = {
  fire_0: { kind: "ember", size: 1, trail: ["#ff8a32", 0.9, 0.3, 0.35, 1.5], hit: "emberHit" },
  fire_1: { kind: "fireball", size: 1, lob: 1.2, trail: ["#ff9a2e", 1, 0.55, 0.45, 2], trail2: ["#5a4a48", 0.4, 0.6, 0.8, 1], hit: "fireBlast" },
  fire_2: { kind: "magma", size: 1, lob: 2.2, spin: 4, trail: ["#ff5a14", 0.8, 0.45, 0.6, -2], hit: "magmaSplash" },
  fire_3: { beam: "flame" },
  fire_4: { kind: "feather", size: 1.2, trail: ["#ffd75a", 1, 0.45, 0.5, 1.2], hit: "phoenixBurst" },
  ice_0: { kind: "frostShard", size: 1, trail: ["#bff4ff", 0.7, 0.25, 0.4, 0], hit: "frostHit" },
  ice_1: { kind: "icicle", size: 1.1, trail: ["#e6faff", 0.6, 0.25, 0.3, 0], hit: "icicleShatter" },
  ice_2: { kind: "iceBoulder", size: 1.1, lob: 1.6, spin: 3, trail: ["#dff4ff", 0.7, 0.4, 0.6, -0.5], hit: "glacierSmash" },
  ice_3: { kind: "frostShard", size: 0.8, trail: ["#ffffff", 0.6, 0.25, 0.4, 0], hit: "frostHit" },
  ice_4: { kind: "frostOrb", size: 1.1, lob: 1.4, spin: 1.5, trail: ["#bff4ff", 1, 0.5, 0.6, 0.3], hit: "absoluteZero" },
  nature_0: { kind: "thorn", size: 1, trail: ["#9cff7a", 0.25, 0.2, 0.3, 0], hit: "thornHit" },
  nature_1: { kind: "sporePod", size: 1, lob: 2, spin: 2, trail: ["#c6ff5a", 0.8, 0.35, 0.8, 0.6], hit: "sporeCloud" },
  nature_2: { kind: "seed", size: 1, trail: ["#9cff7a", 0.8, 0.3, 0.4, 0.3], hit: "brambleHit" },
  nature_3: { kind: "venom", size: 1, lob: 0.9, trail: ["#9cff7a", 0.8, 0.3, 0.5, -2.5], hit: "venomSplash" },
  nature_4: { kind: "seed", size: 1.2, trail: ["#c6f5b5", 0.8, 0.35, 0.5, 0.5], hit: "brambleHit" },
  storm_0: { kind: "spark", size: 1, spin: 9, trail: ["#ecd1ff", 1, 0.25, 0.25, 0], hit: "sparkHit" },
  storm_1: { chain: "lightning" },
  storm_2: { kind: "windBlade", size: 1.2, spin: 14, flat: true, trail: ["#ffffff", 0.7, 0.35, 0.4, 0.3], hit: "cycloneHit" },
  storm_3: { chain: "thunder" },
  storm_4: { chain: "nexus" },
  light_0: { beam: "light" },
  light_1: { chain: "prism" },
  light_2: { kind: "boltDart", size: 1, trail: ["#fff3c0", 0.7, 0.3, 0.3, 0], hit: "radiantHit" },
  light_3: { kind: "sunDisc", size: 1, spin: 6, face: true, trail: ["#ffe066", 1, 0.4, 0.4, 0.4], hit: "radianceBurst" },
  light_4: { beam: "solar" },
  darkness_0: { kind: "shadowOrb", size: 1, trail: ["#8b6cff", 0.8, 0.35, 0.5, 0], hit: "shadowHit" },
  darkness_1: { kind: "skull", size: 1, trail: ["#a98aff", 1, 0.35, 0.5, 0.8], hit: "curseHit" },
  darkness_2: { kind: "voidSphere", size: 1.1, lob: 1, spin: 1, trail: ["#8b6cff", 0.8, 0.4, 0.6, 0], hit: "voidImplode" },
  darkness_3: { kind: "scythe", size: 1.1, spin: 12, flat: true, trail: ["#cbb9ff", 0.6, 0.3, 0.3, 0], hit: "reaperSlash" },
  darkness_4: { kind: "eclipse", size: 1.2, spin: 2, face: true, trail: ["#a98aff", 1, 0.45, 0.5, 0], hit: "eclipseBurst" },
  mech_0: { kind: "bullet", size: 1, trail: ["#ffe066", 0.35, 0.18, 0.15, 0], hit: "bulletHit", muzzle: "#ffe066" },
  mech_1: { melee: "saw" },
  mech_2: { kind: "railSlug", size: 1.1, trail: ["#7fe8ff", 1, 0.3, 0.45, 0], hit: "railHit", muzzle: "#c8f6ff" },
  mech_3: { kind: "boltDart", size: 0.9, trail: ["#7fe8ff", 0.6, 0.25, 0.3, 0], hit: "bulletHit" },
  mech_4: { kind: "missile", size: 1.1, lob: 2.4, trail: ["#ffb84a", 1, 0.4, 0.3, 0], trail2: ["#9a9aa2", 0.9, 0.55, 0.9, 1.2], hit: "missileBlast" },
  abnormal_0: { kind: "glitchCube", size: 1, spin: 7, trail: ["#ff5fa2", 0.6, 0.3, 0.3, 0], trail2: ["#5dffb0", 0.5, 0.3, 0.3, 0], hit: "glitchHit" },
  abnormal_1: { kind: "warpRing", size: 1.1, spin: 5, face: true, trail: ["#ffc2dd", 0.8, 0.35, 0.4, 0], hit: "warpSplash" },
  abnormal_2: { kind: "chaosShard", size: 1, spin: 8, trail: ["#c77dff", 0.5, 0.3, 0.4, 0], trail2: ["#5dffb0", 0.5, 0.3, 0.4, 0], hit: "chaosBurst" },
  abnormal_3: { chain: "paradox" },
  abnormal_4: { kind: "realityEye", size: 1.1, spin: 1, trail: ["#ff5fa2", 0.7, 0.35, 0.4, 0], trail2: ["#5dffb0", 0.5, 0.3, 0.4, 0], hit: "realityHit" },
};
// element fallbacks (mutated archetypes, unknown towers)
const EL_FALLBACK = { fire: "fire_0", ice: "ice_0", nature: "nature_0", storm: "storm_0", light: "light_2", darkness: "darkness_0", mech: "mech_0", abnormal: "abnormal_0" };
const SPLASH_FALLBACK = { fire: "fire_1", ice: "ice_2", nature: "nature_1", storm: "storm_2", light: "light_3", darkness: "darkness_2", mech: "mech_4", abnormal: "abnormal_1" };
export function shotStyle(defId, element, arche) {
  const s = STYLE[defId];
  if (s && s.kind && (arche !== "splash" || s.lob || /Blast|Splash|Burst|Smash|Cloud|Implode|Zero/.test(s.hit))) return s;
  return STYLE[(arche === "splash" ? SPLASH_FALLBACK : EL_FALLBACK)[element] || "fire_0"];
}

// ---------------------------------------------------------------------------
export function createShotFx(scene, fx) {
  const { sparks, bits, streaks, rings } = fx;
  // instanced meshes per projectile kind
  const kinds = new Map();
  function kindMeshes(k) {
    let K = kinds.get(k);
    if (K) return K;
    const v = new Vox(PU, -14, 14, -14, 14, -14, 14), P = new Part(1);
    MODELS[k](v, pp(v)); v.emit(P, 0, 0, 0, 1);
    K = { meshes: [], n: 0 };
    for (const [B, mat] of [[P.lit, MAT.lit], [P.glow, MAT.glow]]) {
      if (B.empty) continue;
      const inst = new THREE.InstancedMesh(B.geometry(), mat, 96);
      inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage); inst.frustumCulled = false; inst.count = 0; inst.renderOrder = 9;
      scene.add(inst); K.meshes.push(inst);
    }
    kinds.set(k, K);
    return K;
  }
  for (const k of Object.keys(MODELS)) kindMeshes(k);

  const trail = (t, p, mul = 1) => { if (t && rnd() < t[1] * mul) sparks.spawn({ x: p.x + (rnd() - 0.5) * 0.12, y: p.y + (rnd() - 0.5) * 0.12, z: p.z + (rnd() - 0.5) * 0.12, vy: t[4], color: t[0], life: t[3] * (0.7 + rnd() * 0.6), size: t[2] * (0.7 + rnd() * 0.6), drag: 3, glow: 1.6, grav: t[4] < 0 ? -t[4] * 2 : 0 }); };
  const radial = (p, color, n, speed, life, size, grav = 0, up = 0.5) => { for (let i = 0; i < n; i++) { const a = rnd() * TAU, s = speed * (0.5 + rnd() * 0.6); sparks.spawn({ x: p.x, y: p.y, z: p.z, vx: Math.cos(a) * s, vy: (rnd() * up + (up > 0 ? 0.2 : 0)) * speed, vz: Math.sin(a) * s, color, life: life * (0.6 + rnd() * 0.6), size: size * (0.6 + rnd() * 0.7), grav, drag: 2.5, glow: 1.8 }); } };
  const rise = (p, color, n, spread, speed, life, size) => { for (let i = 0; i < n; i++) sparks.spawn({ x: p.x + (rnd() - 0.5) * spread, y: p.y, z: p.z + (rnd() - 0.5) * spread, vx: (rnd() - 0.5) * 0.6, vy: speed * (0.5 + rnd()), vz: (rnd() - 0.5) * 0.6, color, life: life * (0.6 + rnd() * 0.7), size: size * (0.7 + rnd() * 0.6), drag: 1.2, glow: 1.7, flicker: 1 }); };
  const shards = (p, dir, color, n, len, w = 0.08, life = 0.2) => { for (let i = 0; i < n; i++) { const a = rnd() * TAU, e = (rnd() - 0.3) * 1.2; _v.set(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)).multiplyScalar(len * (0.5 + rnd() * 0.6)).add(p); streaks.add(p, _v.clone(), color, w, life, 2.2); } };
  const ground = (p) => p.clone().setY(0.08);

  // impact recipes (p = world point, d = flight direction, r = splash radius in tiles)
  const HIT = {
    emberHit(p) { radial(p, "#ff9a2e", 8, 3, 0.35, 0.35, 2); rise(p, "#ffb447", 3, 0.3, 1.5, 0.6, 0.25); },
    fireBlast(p, d, r) { rings.add(ground(p), "#ff6a1e", 0.2, r || 1.6, 0.45, 2); radial(p, "#ffd65a", 14, 5, 0.4, 0.6, 2); radial(p, "#ff6a1e", 10, 3, 0.6, 0.7, -1, 1); rise(p, "#ff9a2e", 6, 0.8, 2, 0.8, 0.3); rise(p, "#4a3c3c", 4, 0.6, 1.2, 1, 0.6); bits.burst(p.x, p.y, p.z, "#2a1a16", 5, 4, 0.12, 0.02); },
    magmaSplash(p, d, r) { rings.add(ground(p), "#ff5a14", 0.3, r || 1.6, 0.8, 1.8); rings.add(ground(p), "#ffa030", 0.1, (r || 1.6) * 0.6, 1.2, 1.4); bits.burst(p.x, p.y, p.z, "#ff7a2a", 8, 4, 0.16, 0.05); bits.burst(p.x, p.y, p.z, "#3a2420", 6, 3, 0.18, 0.05); radial(p, "#ffa030", 12, 3.5, 0.5, 0.45, 5); rise(p, "#ff5a14", 5, 1, 0.8, 1.2, 0.35); },
    phoenixBurst(p, d, r) { rings.add(ground(p), "#ffd75a", 0.3, r || 2, 0.5, 2.2); rings.add(ground(p), "#ff6a2a", 0.2, (r || 2) * 0.7, 0.7, 1.8); radial(p, "#fff1b0", 16, 6, 0.45, 0.5, 1); rise(p, "#ffd75a", 10, 1.2, 2.5, 0.9, 0.35); },
    frostHit(p) { radial(p, "#dff4ff", 8, 3, 0.35, 0.3, 3); bits.burst(p.x, p.y, p.z, "#bfe8fa", 4, 3, 0.09, 0.03); rings.add(ground(p), "#bff4ff", 0.1, 0.7, 0.35, 1.5); },
    icicleShatter(p, d) { shards(p, d, "#e6faff", 6, 0.6, 0.06, 0.18); bits.burst(p.x, p.y, p.z, "#cfeefa", 9, 4, 0.1, 0.03); radial(p, "#bff4ff", 6, 3, 0.3, 0.3, 3); },
    glacierSmash(p, d, r) { rings.add(ground(p), "#bff4ff", 0.3, r || 1.6, 0.6, 1.8); bits.burst(p.x, p.y, p.z, "#a6dcf5", 12, 5, 0.18, 0.03); bits.burst(p.x, p.y, p.z, "#e4eef6", 6, 3, 0.12, 0.03); for (let i = 0; i < 8; i++) sparks.spawn({ x: p.x + (rnd() - 0.5), y: 0.4, z: p.z + (rnd() - 0.5), vx: (rnd() - 0.5) * 2, vy: 0.4, vz: (rnd() - 0.5) * 2, color: "#ffffff", life: 1.1, size: 0.9, drag: 1.5, glow: 0.8 }); },
    absoluteZero(p, d, r) { rings.add(ground(p), "#ffffff", 0.2, r || 2, 0.5, 2.2); rings.add(ground(p), "#6fe2ff", 0.2, (r || 2) * 1.2, 0.9, 1.6); radial(p, "#dff4ff", 18, 5, 0.6, 0.45, 1); shards(p, d, "#bff4ff", 8, 0.9, 0.07, 0.3); },
    thornHit(p) { bits.burst(p.x, p.y, p.z, "#5a4228", 4, 3, 0.07, 0.02); bits.burst(p.x, p.y, p.z, "#78c25e", 4, 3, 0.09, 0.02); radial(p, "#9cff7a", 4, 2, 0.3, 0.25, 2); },
    sporeCloud(p, d, r) { rings.add(ground(p), "#c6ff5a", 0.2, r || 1.6, 0.6, 1.4); for (let i = 0; i < 16; i++) { const a = rnd() * TAU, s = 1 + rnd() * 1.6; sparks.spawn({ x: p.x, y: p.y, z: p.z, vx: Math.cos(a) * s, vy: 0.3 + rnd(), vz: Math.sin(a) * s, color: i % 3 ? "#9cff7a" : "#d6a8ff", life: 1.4 + rnd(), size: 0.6 + rnd() * 0.5, drag: 1.4, glow: 1, grav: -0.3 }); } bits.burst(p.x, p.y, p.z, "#b8743a", 5, 3, 0.12, 0.03); },
    brambleHit(p) { bits.burst(p.x, p.y, p.z, "#4f9a45", 6, 3, 0.1, 0.02); radial(p, "#d6ffc4", 6, 2.5, 0.35, 0.3, 1); rings.add(ground(p), "#73d35f", 0.1, 0.8, 0.4, 1.4); },
    venomSplash(p) { bits.burst(p.x, p.y, p.z, "#9cff7a", 7, 3, 0.08, 0.02); radial(p, "#c6ff5a", 8, 2.5, 0.5, 0.35, 6); rings.add(ground(p), "#73d35f", 0.1, 1, 0.9, 1.3); rise(p, "#9cff7a", 3, 0.5, 0.6, 1, 0.3); },
    sparkHit(p) { for (let i = 0; i < 4; i++) { const a = rnd() * TAU; _v.set(p.x + Math.cos(a) * 0.8, p.y + (rnd() - 0.3) * 0.6, p.z + Math.sin(a) * 0.8); streaks.bolt(p, _v.clone(), "#ecd1ff", 0.06, 0.12, 2); } radial(p, "#ffffff", 4, 3, 0.2, 0.3, 0); },
    cycloneHit(p, d, r) { const R = r || 1.4; for (let i = 0; i < 18; i++) { const a = (i / 18) * TAU; sparks.spawn({ x: p.x + Math.cos(a) * R * 0.5, y: 0.3 + rnd() * 1.2, z: p.z + Math.sin(a) * R * 0.5, vx: -Math.sin(a) * 4, vy: 1.2, vz: Math.cos(a) * 4, color: i % 2 ? "#ffffff" : "#d9c2ff", life: 0.6, size: 0.35, drag: 2, glow: 1.4 }); } rings.add(ground(p), "#ecd1ff", 0.2, R, 0.5, 1.4); bits.burst(p.x, 0.3, p.z, "#5a6080", 5, 4, 0.1, 0.02); },
    radiantHit(p) { radial(p, "#fff3c0", 8, 3, 0.3, 0.3, 0); rings.add(ground(p), "#ffe066", 0.1, 0.7, 0.3, 1.6); },
    radianceBurst(p, d, r) { const R = r || 1.6; rings.add(ground(p), "#ffe066", 0.2, R, 0.45, 2.2); for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; _v.set(p.x + Math.cos(a) * R, p.y * 0.4, p.z + Math.sin(a) * R); streaks.add(p, _v.clone(), "#ffd23d", 0.07, 0.22, 2.2); } radial(p, "#ffffff", 8, 3, 0.3, 0.35, 0); },
    shadowHit(p) { radial(p, "#8b6cff", 8, 2.5, 0.45, 0.4, 0); bits.burst(p.x, p.y, p.z, "#1a1428", 5, 3, 0.1, 0.02); rings.add(ground(p), "#a98aff", 0.5, 0.1, 0.35, 1.4); },
    curseHit(p) { rise(p, "#a98aff", 8, 0.5, 1.6, 0.7, 0.35); rings.add(ground(p), "#8b6cff", 0.1, 1, 0.5, 1.6); radial(p, "#cbb9ff", 5, 2, 0.3, 0.3, 0); },
    voidImplode(p, d, r) { const R = r || 1.6; rings.add(ground(p), "#8b6cff", R * 1.2, 0.1, 0.5, 2); for (let i = 0; i < 18; i++) { const a = rnd() * TAU, s = R * (0.8 + rnd() * 0.5); sparks.spawn({ x: p.x + Math.cos(a) * s, y: p.y + (rnd() - 0.5), z: p.z + Math.sin(a) * s, vx: -Math.cos(a) * s * 3, vy: 0, vz: -Math.sin(a) * s * 3, color: i % 3 ? "#a98aff" : "#f0e8ff", life: 0.35, size: 0.35, drag: 0.5, glow: 1.8 }); } bits.burst(p.x, p.y, p.z, "#07050c", 6, 2, 0.14, 0.02); },
    reaperSlash(p, d) { for (const s of [-1, 1]) { _v.set(p.x - 0.7, p.y + 0.5 * s, p.z - 0.5 * s); _v2.set(p.x + 0.7, p.y - 0.5 * s, p.z + 0.5 * s); streaks.add(_v.clone(), _v2.clone(), "#f0e8ff", 0.09, 0.22, 2.4); } radial(p, "#a98aff", 6, 2.5, 0.35, 0.3, 1); },
    eclipseBurst(p, d, r) { const R = r || 1.8; rings.add(ground(p), "#07050c", 0.2, R, 0.6, 0.0); rings.add(ground(p), "#a98aff", 0.2, R, 0.55, 2); rings.add(ground(p), "#f0e8ff", 0.1, R * 0.5, 0.4, 2); radial(p, "#cbb9ff", 14, 5, 0.5, 0.45, 0, 0.3); },
    bulletHit(p) { radial(p, "#ffe9a8", 5, 4, 0.18, 0.2, 6); bits.burst(p.x, p.y, p.z, "#8a8f99", 2, 3, 0.06, 0.02); },
    railHit(p, d) { _v.copy(d).multiplyScalar(1.6).add(p); streaks.add(p, _v.clone(), "#c8f6ff", 0.12, 0.25, 2.6); radial(p, "#7fe8ff", 10, 5, 0.3, 0.3, 4); rings.add(ground(p), "#7fe8ff", 0.1, 0.9, 0.3, 1.8); },
    missileBlast(p, d, r) { const R = r || 1.8; rings.add(ground(p), "#ffb84a", 0.3, R, 0.5, 2.2); radial(p, "#fff0b0", 14, 6, 0.3, 0.6, 3); radial(p, "#ff6a3d", 12, 4, 0.5, 0.7, 1, 1); for (let i = 0; i < 9; i++) sparks.spawn({ x: p.x + (rnd() - 0.5) * R, y: p.y + rnd() * 0.5, z: p.z + (rnd() - 0.5) * R, vx: (rnd() - 0.5), vy: 1 + rnd(), vz: (rnd() - 0.5), color: "#8a8a92", life: 1.4, size: 0.9 + rnd() * 0.5, drag: 1, glow: 0.45 }); bits.burst(p.x, p.y, p.z, "#5a6066", 8, 6, 0.12, 0.02); },
    glitchHit(p) { bits.burst(p.x, p.y, p.z, "#ff5fa2", 4, 3, 0.1, 0.02); bits.burst(p.x, p.y, p.z, "#5dffb0", 4, 3, 0.1, 0.02); for (let i = 0; i < 6; i++) sparks.spawn({ x: p.x + (rnd() - 0.5) * 0.8, y: p.y + (rnd() - 0.5) * 0.6, z: p.z + (rnd() - 0.5) * 0.8, color: i % 2 ? "#ff5fa2" : "#5dffb0", life: 0.3, size: 0.4, drag: 6, glow: 2, flicker: 1 }); },
    warpSplash(p, d, r) { const R = r || 1.6; rings.add(ground(p), "#ff5fa2", R, 0.1, 0.45, 2); rings.add(ground(p), "#5dffb0", 0.1, R * 0.8, 0.5, 1.6); radial(p, "#ffc2dd", 10, 3, 0.4, 0.35, 0); },
    chaosBurst(p, d, r) { const C = ["#5dffb0", "#c77dff", "#ff5fa2", "#ffe066"]; for (const c of C) { bits.burst(p.x, p.y, p.z, c, 3, 4, 0.1, 0.02); radial(p, c, 4, 4, 0.35, 0.35, 2); } rings.add(ground(p), C[(rnd() * 4) | 0], 0.2, r || 1.4, 0.4, 1.8); },
    realityHit(p, d, r) { rings.add(ground(p), "#ff5fa2", 0.2, r || 1.4, 0.45, 2); rings.add(ground(p), "#5dffb0", (r || 1.4) * 0.9, 0.1, 0.45, 1.6); radial(p, "#ffffff", 8, 3, 0.25, 0.4, 0); },
  };

  // beams and chains (from = muzzle, pts = target points in order)
  const lerpPts = (a, b, n, jag) => { const out = [a.clone()]; for (let i = 1; i < n; i++) { const q = a.clone().lerp(b, i / n); q.x += (rnd() - 0.5) * jag; q.y += (rnd() - 0.3) * jag * 0.7; q.z += (rnd() - 0.5) * jag; out.push(q); } out.push(b.clone()); return out; };
  const poly = (pts, color, w, life, glow = 2.4) => { for (let i = 1; i < pts.length; i++) streaks.add(pts[i - 1], pts[i], color, w, life, glow); };
  const ZAP = {
    flame(from, pts) { const to = pts[0]; streaks.add(from, to, "#ff6a1e", 0.34, 0.1, 2); streaks.add(from, to, "#ffd65a", 0.16, 0.1, 2.4); for (let i = 0; i < 3; i++) { const t = rnd(); _v.copy(from).lerp(to, t); sparks.spawn({ x: _v.x, y: _v.y, z: _v.z, vy: 1.5, color: rnd() < 0.5 ? "#ff9a2e" : "#ffd65a", life: 0.4, size: 0.35, drag: 2, glow: 1.6, flicker: 1 }); } radial(to, "#ff9a2e", 2, 2, 0.25, 0.3, -1); },
    light(from, pts) { const to = pts[0]; streaks.add(from, to, "#ffe066", 0.14, 0.09, 2.2); streaks.add(from, to, "#ffffff", 0.06, 0.09, 2.8); sparks.spawn({ x: to.x, y: to.y, z: to.z, color: "#fff3c0", life: 0.25, size: 0.6, drag: 4, glow: 1.6 }); },
    solar(from, pts) { const to = pts[0]; streaks.add(from, to, "#ffc93a", 0.42, 0.11, 1.8); streaks.add(from, to, "#fff3c0", 0.2, 0.11, 2.4); streaks.add(from, to, "#ffffff", 0.08, 0.11, 3); radial(to, "#ffe066", 3, 3, 0.3, 0.4, 0); if (rnd() < 0.3) rings.add(to.clone().setY(0.08), "#ffe066", 0.1, 0.8, 0.3, 1.6); },
    lightning(from, pts) { let prev = from; for (const t of pts) { poly(lerpPts(prev, t, 4, 0.7), "#c77dff", 0.13, 0.16, 2.4); poly(lerpPts(prev, t, 4, 0.5), "#ecd1ff", 0.05, 0.12, 2.8); radial(t, "#ecd1ff", 2, 2, 0.2, 0.3, 0); prev = t; } },
    thunder(from, pts) { let prev = from; pts.forEach((t, i) => { const path = lerpPts(prev, t, 6, 1.1); poly(path, "#ffffff", 0.16, 0.2, 2.8); poly(path, "#c77dff", 0.32, 0.2, 1.4); if (i === 0) { const m = path[3]; poly(lerpPts(m, m.clone().add(_v.set(rnd() - 0.5, -1, rnd() - 0.5)), 3, 0.5), "#ecd1ff", 0.06, 0.15, 2.4); } rings.add(t.clone().setY(0.08), "#c77dff", 0.1, 0.9, 0.3, 1.8); radial(t, "#ffffff", 3, 3, 0.2, 0.3, 0); prev = t; }); },
    nexus(from, pts) { let prev = from; pts.forEach((t, i) => { for (let k = 0; k < 2; k++) poly(lerpPts(prev, t, 5, 0.9), k ? "#ecd1ff" : "#b98cff", k ? 0.06 : 0.14, 0.18, 2.6); radial(t, i % 2 ? "#ecd1ff" : "#c77dff", 3, 2.5, 0.25, 0.35, 0); prev = t; }); },
    prism(from, pts) { const C = ["#ff7a7a", "#ffe066", "#7affb0", "#7ab4ff", "#c77dff"]; let prev = from; pts.forEach((t, i) => { const c = C[i % C.length]; streaks.add(prev, t, c, 0.14, 0.14, 2.4); streaks.add(prev, t, "#ffffff", 0.05, 0.12, 2.6); radial(t, c, 3, 2, 0.25, 0.3, 0); prev = t; }); },
    paradox(from, pts) { let prev = from; pts.forEach((t, i) => { const mid1 = prev.clone().setX(t.x), mid2 = mid1.clone().setZ(t.z); poly([prev, mid1, mid2, t], i % 2 ? "#5dffb0" : "#ff5fa2", 0.12, 0.18, 2.4); sparks.spawn({ x: t.x, y: t.y, z: t.z, color: i % 2 ? "#ff5fa2" : "#5dffb0", life: 0.25, size: 0.5, drag: 5, glow: 2, flicker: 1 }); prev = t; }); },
  };

  return {
    style: shotStyle,
    // draw one projectile; r carries per-projectile state (set up by the renderer)
    begin() { for (const K of kinds.values()) K.n = 0; },
    draw(r, pos, dir, t) {
      const st = r.style; if (!st || !st.kind) return;
      const K = kindMeshes(st.kind);
      if (K.n >= 96) return;
      if (st.face) { _q.setFromUnitVectors(ZAX, _v.set(dir.x, 0, dir.z).normalize()); }
      else if (st.flat) { _q.setFromAxisAngle(_v.set(0, 1, 0), t * (st.spin || 4)); }
      else { _q.setFromUnitVectors(ZAX, dir); if (st.spin) _q.multiply(_q2.setFromAxisAngle(ZAX, t * st.spin)); }
      if (st.face && st.spin) _q.multiply(_q2.setFromAxisAngle(ZAX, t * st.spin));
      _m.compose(pos, _q, _s.setScalar(st.size || 1));
      for (const m of K.meshes) m.setMatrixAt(K.n, _m);
      K.n++;
      trail(st.trail, pos); trail(st.trail2, pos);
    },
    end() { for (const K of kinds.values()) for (const m of K.meshes) { m.count = K.n; m.instanceMatrix.needsUpdate = true; } },
    impact(r, pos, dir) { const st = r.style; const f = st && HIT[st.hit]; if (f) f(pos, dir, r.splash || 0); else radial(pos, "#ffffff", 4, 3, 0.3, 0.35, 2); },
    zap(defId, element, style, from, pts) {
      const st = STYLE[defId] || {};
      const z = ZAP[st.beam || st.chain] || (style === "beam" ? ZAP[element === "fire" ? "flame" : element === "light" ? "light" : "light"] : style === "chain" ? ZAP[element === "light" ? "prism" : element === "abnormal" ? "paradox" : "lightning"] : null);
      if (z) { z(from, pts); return true; }
      return false;
    },
    muzzle(defId, pos) { const st = STYLE[defId]; if (st && st.muzzle) sparks.spawn({ x: pos.x, y: pos.y, z: pos.z, color: st.muzzle, life: 0.08, size: 0.7, drag: 0, glow: 2.2 }); },
  };
}
