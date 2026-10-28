/* Skyhold TD — render/deathfx.js
   How creeps arrive, die and get away.

   DEATHS break the creature into its own voxels: debris cubes are sampled from the creature's model (its actual
   colours, roughly where they sat on its body) and handed a recipe that fits what it is:
     shatter  (default)   cubes burst out, bounce and settle, then shrink away
     slime                low wet splat across the ground and a spreading puddle ring
     bug                  a small green-goo pop
     undead               the body crumbles straight down into a little bone pile; a pale soul wisp rises
     mech                 a hot flash, metal plates and gears thrown high, a puff of smoke
     spirit               no corpse: it unravels upward into motes of its own glow
     fire                 the body flares into embers that float up and go out
     ice                  it shatters into bright shards that skitter and glint
     stone                a few heavy chunks topple out with a dust ring
     glitch               pixels blink, jump and vanish
     radiant              it burns away in golden light with a pillar of sparks
     flyer                anything that flies drops out of the air before it breaks on the ground
   BOSSES get a staged death: a flash, three stuttering bursts, shockwaves and a long rain of their pieces.
   SPAWNS rise out of the entrance portal (scale-in with a swirl at the feet); LEAKS are sucked into the exit
   portal (the creature spins and shrinks into it), and a lost life flares the exit portal red.

   Phone budget: one instanced mesh of plain cubes (pool of 1100, oldest recycled), physics on the CPU for
   the live cubes only, and the existing spark / ring pools for glow. Debris never lasts more than ~2s. */
import * as THREE from "three";
import { MOB_SPECS } from "./mobmodels.js";

const CAP = 1100;
const BOSSES = new Set(["boss", "endboss", "rat_king", "mirewyrm", "clockwork_colossus", "eclipse_herald"]);

// which recipe a creature uses: from its body plan, its name and how it moves
const STYLE_CACHE = new Map();
export function deathStyle(type, DB, model) {
  if (STYLE_CACHE.has(type)) return STYLE_CACHE.get(type);
  const o = MOB_SPECS[type] || {}, id = type;
  const has = (...k) => k.some((w) => id.includes(w));
  let st = "shatter";
  if (type === "grunt") st = "fire";
  else if (type === "runner") st = "spirit";
  else if (type === "swarm") st = "bug";
  else if (type === "brute" || type === "tank") st = "stone";
  else if (o.plan === "blob" || has("slime", "sac")) st = "slime";
  else if (has("glitch", "rift", "void", "mind_flayer", "phase", "blink")) st = "glitch";
  else if (has("radiant", "sun_", "prism", "martyr", "aegis")) st = "radiant";
  else if (has("magma", "cinder", "ember", "infernal", "hellhound", "ash_", "lava")) st = "fire";
  else if (has("frost", "snow", "ice", "yeti", "glacier")) st = "ice";
  else if (has("skeleton", "ghoul", "revenant", "bone", "necromancer", "abomination", "death")) st = "undead";
  else if (o.plan === "tank" || has("clockwork", "shredder", "repair", "steam", "drone", "wrecker", "rust", "siege")) st = "mech";
  else if (o.plan === "floater" || has("wraith", "wisp", "banshee", "phantom", "shade", "djinn", "tempest", "spirit")) st = "spirit";
  else if (o.plan === "golem" || has("golem", "ogre", "giant", "tortoise", "turtle", "troll")) st = "stone";
  else if (o.plan === "insect" || has("spider", "beetle", "mite", "hive", "brood", "crawler")) st = "bug";
  const fly = !!(model && model.fly);
  const res = { st, fly, boss: BOSSES.has(type) || !!(DB && DB.ENEMIES[type] && DB.ENEMIES[type].boss) };
  STYLE_CACHE.set(type, res);
  return res;
}

export function createDeathFx(scene, fx) {
  const { sparks, rings } = fx;
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshLambertMaterial({ color: "#ffffff" });
  const mesh = new THREE.InstancedMesh(geo, mat, CAP);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.setColorAt(0, new THREE.Color(1, 1, 1)); mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false; mesh.count = 0; mesh.renderOrder = 2;
  scene.add(mesh);

  // struct-of-arrays pool; live cubes are packed at the front [0, n)
  const F = (k) => new Float32Array(CAP * k);
  const P = F(3), Vv = F(3), R = F(3), W = F(3), C = F(3), S = F(1), T = F(1), MX = F(1), G = F(1), B = F(1), DR = F(1), FL = F(1);
  let n = 0, oldest = 0;
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), Vp = new THREE.Vector3(), Vs = new THREE.Vector3(), Cc = new THREE.Color();
  // FL flags: 1 = floats (no ground), 2 = glints (flicker brighter), 4 = settle flat (splat)
  function cube(x, y, z, vx, vy, vz, r, g, b, size, life, grav = 18, bounce = 0.3, drag = 0.6, flags = 0) {
    let i;
    if (n < CAP) i = n++;
    else { i = oldest; oldest = (oldest + 1) % CAP; }
    P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z;
    Vv[i * 3] = vx; Vv[i * 3 + 1] = vy; Vv[i * 3 + 2] = vz;
    R[i * 3] = Math.random() * 6; R[i * 3 + 1] = Math.random() * 6; R[i * 3 + 2] = Math.random() * 6;
    const sp = (flags & 4) ? 0 : 6 + Math.random() * 8;
    W[i * 3] = (Math.random() - 0.5) * sp; W[i * 3 + 1] = (Math.random() - 0.5) * sp; W[i * 3 + 2] = (Math.random() - 0.5) * sp;
    C[i * 3] = r; C[i * 3 + 1] = g; C[i * 3 + 2] = b;
    S[i] = size; T[i] = 0; MX[i] = life * (0.8 + Math.random() * 0.4); G[i] = grav; B[i] = bounce; DR[i] = drag; FL[i] = flags;
  }
  function kill(i) {
    const j = --n; if (i === j) return;
    for (const [A, k] of [[P, 3], [Vv, 3], [R, 3], [W, 3], [C, 3]]) for (let q = 0; q < k; q++) A[i * k + q] = A[j * k + q];
    for (const A of [S, T, MX, G, B, DR, FL]) A[i] = A[j];
  }

  // ---- helpers --------------------------------------------------------------
  const tmp = new THREE.Color();
  // world positions of the creature's sampled voxels, in its pose at death
  function pieces(info, count) {
    const smp = info.samples, out = [];
    if (!smp || !smp.length) return out;
    const ns = smp.length / 7, cs = Math.cos(info.yaw), sn = Math.sin(info.yaw), s = info.s;
    for (let k = 0; k < count; k++) {
      const j = Math.floor(Math.random() * ns) * 7;
      const lx = smp[j] * s, ly = smp[j + 1] * s, lz = smp[j + 2] * s;
      out.push({ x: info.pos.x + lx * cs + lz * sn, y: info.pos.y + ly + info.lift, z: info.pos.z - lx * sn + lz * cs, ox: lx * cs + lz * sn, oz: -lx * sn + lz * cs, ly, r: smp[j + 3], g: smp[j + 4], b: smp[j + 5], glow: smp[j + 6] });
    }
    return out;
  }
  const col3 = (hex) => tmp.set(hex);
  const hexOf = (p) => "#" + tmp.setRGB(Math.min(1, p.r), Math.min(1, p.g), Math.min(1, p.b)).getHexString();

  // ---- the recipes --------------------------------------------------------------
  const RECIPES = {
    shatter(info, k) {
      for (const p of pieces(info, Math.round(22 * k))) {
        const out = Math.hypot(p.ox, p.oz) || 0.3, sp = 1.6 + Math.random() * 2.4;
        cube(p.x, p.y, p.z, (p.ox / out) * sp + (Math.random() - 0.5), 2 + Math.random() * 3.5, (p.oz / out) * sp + (Math.random() - 0.5), p.r * (1 + p.glow), p.g * (1 + p.glow), p.b * (1 + p.glow), 0.216 * info.s * (0.8 + Math.random() * 0.6), 1.3);
      }
      sparks.burst(info.pos.x, info.pos.y + info.h * 0.5, info.pos.z, "#ffe9a8", Math.round(6 * k), 4, 0.35, 0.35, 3);
    },
    slime(info, k) {
      for (const p of pieces(info, Math.round(24 * k))) {
        const a = Math.random() * Math.PI * 2, sp = 1.5 + Math.random() * 3.5;
        cube(p.x, info.pos.y + 0.1 + Math.random() * 0.3, p.z, Math.cos(a) * sp, 1 + Math.random() * 1.8, Math.sin(a) * sp, p.r * 1.1, p.g * 1.1, p.b * 1.1, 0.234 * info.s * (0.7 + Math.random() * 0.7), 1.5, 16, 0.05, 2.5, 4);
      }
      const c = hexOf(pieces(info, 1)[0] || { r: 0.4, g: 0.9, b: 0.3 });
      rings.add(Vp.set(info.pos.x, 0.06, info.pos.z).clone(), c, 0.3 * info.s, 1.1 * info.s, 0.6, 0.9);
    },
    bug(info, k) {
      for (const p of pieces(info, Math.round(14 * k))) cube(p.x, p.y, p.z, (Math.random() - 0.5) * 4, 1.5 + Math.random() * 2.5, (Math.random() - 0.5) * 4, p.r, p.g, p.b, 0.162 * info.s * (0.8 + Math.random() * 0.5), 1.0);
      for (let i = 0; i < 6 * k; i++) cube(info.pos.x, info.pos.y + 0.15, info.pos.z, (Math.random() - 0.5) * 3, 1.2 + Math.random(), (Math.random() - 0.5) * 3, 0.55, 0.95, 0.25, 0.126 * info.s, 1.1, 16, 0.05, 2.5, 4);
    },
    undead(info, k) {
      // the body folds down where it stood: pieces drop with barely any spread and settle in a pile
      for (const p of pieces(info, Math.round(24 * k))) {
        const bone = Math.random() < 0.45;
        cube(p.x, p.y, p.z, p.ox * 0.6 + (Math.random() - 0.5) * 0.6, 0.4 + Math.random(), p.oz * 0.6 + (Math.random() - 0.5) * 0.6, bone ? 0.92 : p.r, bone ? 0.88 : p.g, bone ? 0.78 : p.b, 0.216 * info.s * (0.8 + Math.random() * 0.5), 1.8, 14, 0.1, 1.2);
      }
      // the soul leaves
      for (let i = 0; i < 8 * k; i++) sparks.spawn({ x: info.pos.x + (Math.random() - 0.5) * 0.4, y: info.pos.y + info.h * (0.4 + Math.random() * 0.5), z: info.pos.z + (Math.random() - 0.5) * 0.4, vx: (Math.random() - 0.5) * 0.6, vy: 1.8 + Math.random() * 1.5, vz: (Math.random() - 0.5) * 0.6, color: "#b9ffd9", life: 0.9 + Math.random() * 0.5, size: 0.3 * Math.sqrt(info.s), drag: 1.2, glow: 2.2 });
    },
    mech(info, k) {
      sparks.burst(info.pos.x, info.pos.y + info.h * 0.5, info.pos.z, "#ffb15c", Math.round(14 * k), 6, 0.4, 0.45, 6);
      sparks.burst(info.pos.x, info.pos.y + info.h * 0.5, info.pos.z, "#fff3c2", Math.round(6 * k), 3, 0.18, 0.9, 0);
      for (const p of pieces(info, Math.round(22 * k))) {
        const a = Math.random() * Math.PI * 2, sp = 2.5 + Math.random() * 3.5;
        cube(p.x, p.y, p.z, Math.cos(a) * sp, 4 + Math.random() * 5, Math.sin(a) * sp, p.r * (1 + p.glow), p.g * (1 + p.glow), p.b * (1 + p.glow), 0.216 * info.s * (0.7 + Math.random() * 0.8), 1.6, 20, 0.35, 0.4);
      }
      for (let i = 0; i < 5 * k; i++) cube(info.pos.x, info.pos.y + info.h * 0.5, info.pos.z, (Math.random() - 0.5) * 6, 5 + Math.random() * 4, (Math.random() - 0.5) * 6, 0.85, 0.66, 0.3, 0.18 * info.s, 1.6, 20, 0.35, 0.4);   // brass gear bits
      for (let i = 0; i < 6 * k; i++) sparks.spawn({ x: info.pos.x + (Math.random() - 0.5) * 0.6, y: info.pos.y + info.h * 0.6, z: info.pos.z + (Math.random() - 0.5) * 0.6, vx: (Math.random() - 0.5), vy: 1.2 + Math.random(), vz: (Math.random() - 0.5), color: "#8a8a96", life: 1.1, size: 0.7 * Math.sqrt(info.s), drag: 1.5, glow: 0.55 });   // smoke
      rings.add(Vp.set(info.pos.x, 0.08, info.pos.z).clone(), "#ffb15c", 0.3, 1.5 * info.s, 0.3, 1.2);
    },
    spirit(info, k) {
      for (const p of pieces(info, Math.round(22 * k))) {
        cube(p.x, p.y, p.z, p.ox * 0.8 + (Math.random() - 0.5) * 0.4, 0.8 + Math.random() * 1.6, p.oz * 0.8 + (Math.random() - 0.5) * 0.4, p.r * 1.6 + 0.2, p.g * 1.6 + 0.2, p.b * 1.6 + 0.2, 0.18 * info.s, 1.1, -1.2, 0, 1.2, 1 | 2);
      }
      const c = hexOf(pieces(info, 1)[0] || { r: 0.7, g: 0.8, b: 1 });
      for (let i = 0; i < 10 * k; i++) sparks.spawn({ x: info.pos.x + (Math.random() - 0.5) * 0.8 * info.s, y: info.pos.y + info.h * Math.random(), z: info.pos.z + (Math.random() - 0.5) * 0.8 * info.s, vx: (Math.random() - 0.5) * 0.8, vy: 1.5 + Math.random() * 2, vz: (Math.random() - 0.5) * 0.8, color: c, life: 0.9, size: 0.32, drag: 1, glow: 2.4 });
    },
    fire(info, k) {
      for (const p of pieces(info, Math.round(20 * k))) {
        const hot = Math.random() < 0.5;
        cube(p.x, p.y, p.z, p.ox * 1.4 + (Math.random() - 0.5) * 1.5, 1.5 + Math.random() * 2.5, p.oz * 1.4 + (Math.random() - 0.5) * 1.5, hot ? 2.2 : p.r * 1.3, hot ? 0.9 : p.g * 1.3, hot ? 0.25 : p.b * 1.3, 0.18 * info.s, 1.0, -2.5, 0, 1.6, 1 | 2);
      }
      sparks.burst(info.pos.x, info.pos.y + info.h * 0.4, info.pos.z, "#ff7a2a", Math.round(14 * k), 3.5, 0.7, 0.4, -2);
      sparks.burst(info.pos.x, info.pos.y + info.h * 0.4, info.pos.z, "#ffd27a", Math.round(5 * k), 2, 0.25, 0.9, 0);
    },
    ice(info, k) {
      for (const p of pieces(info, Math.round(24 * k))) {
        const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 3.5, pale = Math.random() < 0.6;
        cube(p.x, p.y, p.z, Math.cos(a) * sp, 2.5 + Math.random() * 3, Math.sin(a) * sp, pale ? 0.85 : p.r, pale ? 0.95 : p.g, pale ? 1.25 : p.b, 0.198 * info.s * (0.6 + Math.random() * 0.8), 1.3, 18, 0.55, 0.3, 2);
      }
      sparks.burst(info.pos.x, info.pos.y + info.h * 0.5, info.pos.z, "#e6f8ff", Math.round(10 * k), 4, 0.5, 0.3, 2);
    },
    stone(info, k) {
      for (const p of pieces(info, Math.round(12 * k))) {
        const out = Math.hypot(p.ox, p.oz) || 0.3;
        cube(p.x, p.y, p.z, (p.ox / out) * (0.8 + Math.random() * 1.6), 1 + Math.random() * 2, (p.oz / out) * (0.8 + Math.random() * 1.6), p.r * (1 + p.glow), p.g * (1 + p.glow), p.b * (1 + p.glow), 0.396 * info.s * (0.8 + Math.random() * 0.6), 1.7, 20, 0.2, 0.5);
      }
      rings.add(Vp.set(info.pos.x, 0.06, info.pos.z).clone(), "#a89a86", 0.4 * info.s, 1.6 * info.s, 0.45, 0.6);
      for (let i = 0; i < 8 * k; i++) sparks.spawn({ x: info.pos.x + (Math.random() - 0.5) * info.s, y: info.pos.y + 0.2, z: info.pos.z + (Math.random() - 0.5) * info.s, vx: (Math.random() - 0.5) * 3, vy: 0.4 + Math.random() * 0.6, vz: (Math.random() - 0.5) * 3, color: "#a89a86", life: 0.8, size: 0.6, drag: 2.2, glow: 0.6 });
    },
    glitch(info, k) {
      for (const p of pieces(info, Math.round(20 * k))) {
        const pick = Math.random();
        const c = pick < 0.3 ? [2, 0.4, 1.1] : pick < 0.55 ? [0.4, 2, 1.2] : [p.r * 1.5, p.g * 1.5, p.b * 1.5];
        cube(p.x + (Math.random() - 0.5) * 0.8, p.y + (Math.random() - 0.5) * 0.6, p.z + (Math.random() - 0.5) * 0.8, 0, 0, 0, c[0], c[1], c[2], 0.234 * info.s, 0.55 + Math.random() * 0.4, 0, 0, 0, 1 | 2 | 8);
      }
    },
    radiant(info, k) {
      for (const p of pieces(info, Math.round(20 * k))) cube(p.x, p.y, p.z, p.ox * 0.5, 1.2 + Math.random() * 1.5, p.oz * 0.5, 1.8, 1.55, 0.8, 0.18 * info.s, 1.0, -1.5, 0, 1.2, 1 | 2);
      for (let i = 0; i < 14 * k; i++) sparks.spawn({ x: info.pos.x + (Math.random() - 0.5) * 0.5, y: info.pos.y + Math.random() * 0.5, z: info.pos.z + (Math.random() - 0.5) * 0.5, vx: 0, vy: 4 + Math.random() * 4, vz: 0, color: "#fff3c0", life: 0.6, size: 0.35, drag: 0.8, glow: 2.6 });
      rings.add(Vp.set(info.pos.x, 0.08, info.pos.z).clone(), "#ffe066", 0.2, 1.1 * info.s, 0.35, 1.4);
    },
  };

  // ---- deaths ---------------------------------------------------------------------
  // info: { type, pos, yaw, s, h, lift, samples, style }
  const queue = [];       // staged boss bursts { t, fn }
  function death(info, killed) {
    const sty = info.style;
    if (!killed) {           // removed without a kill (merged, rewound, cleaned up): a soft poof only
      sparks.burst(info.pos.x, info.pos.y + info.h * 0.5, info.pos.z, "#c8d0ff", 6, 2.5, 0.4, 0.35, 0);
      return;
    }
    if (sty.boss) { bossDeath(info); return; }
    const k = Math.min(1.6, Math.max(0.6, info.s));
    // flyers drop out of the air first: their pieces start high and fall with a little extra pull
    if (sty.fly && info.lift > 0.3) {
      RECIPES[sty.st === "shatter" || sty.st === "stone" ? "shatter" : sty.st](info, k);
      rings.add(Vp.set(info.pos.x, 0.06, info.pos.z).clone(), "#c8d0ff", 0.2, 0.7 * info.s, 0.22, 0.4);
      return;
    }
    (RECIPES[sty.st] || RECIPES.shatter)(info, k);
  }
  function bossDeath(info) {
    const big = info.s * 1.4;
    const at = (t, fn) => queue.push({ t, fn });
    rings.add(Vp.set(info.pos.x, 0.1, info.pos.z).clone(), "#ffffff", 0.3, 2 * big, 0.3, 1.4);
    for (let k = 0; k < 3; k++) at(0.12 + k * 0.22, () => {
      const o = { ...info, pos: info.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * big, 0, (Math.random() - 0.5) * big)) };
      sparks.burst(o.pos.x, o.pos.y + info.h * (0.3 + Math.random() * 0.5), o.pos.z, k === 2 ? "#ffe066" : "#ff5fa2", 16, 6, 0.55, 0.5, 3);
      RECIPES[info.style.st === "slime" ? "slime" : "shatter"](o, 1.2);
      rings.add(Vp.set(info.pos.x, 0.1, info.pos.z).clone(), k === 2 ? "#ffe066" : "#ff5fa2", 0.5, (1.8 + k * 0.9) * big, 0.5, 1.3);
    });
    at(0.8, () => {
      // the final collapse: the whole body comes apart in a long rain of its own voxels
      for (const p of pieces(info, 90)) {
        const out = Math.hypot(p.ox, p.oz) || 0.3, sp = 1 + Math.random() * 4;
        cube(p.x, p.y, p.z, (p.ox / out) * sp, 3 + Math.random() * 6, (p.oz / out) * sp, p.r * (1 + p.glow), p.g * (1 + p.glow), p.b * (1 + p.glow), 0.216 * info.s * (0.8 + Math.random() * 0.8), 2.0, 16, 0.3, 0.4);
      }
      for (let i = 0; i < 30; i++) sparks.spawn({ x: info.pos.x + (Math.random() - 0.5) * 0.8, y: info.pos.y + Math.random(), z: info.pos.z + (Math.random() - 0.5) * 0.8, vx: (Math.random() - 0.5) * 0.6, vy: 6 + Math.random() * 6, vz: (Math.random() - 0.5) * 0.6, color: "#fff3c0", life: 0.9, size: 0.5, drag: 0.6, glow: 2.6 });
      rings.add(Vp.set(info.pos.x, 0.12, info.pos.z).clone(), "#fff3c0", 0.5, 4 * big, 0.8, 1.5);
    });
  }

  // ---- spawns and leaks: a short-lived "ghost" of the creature drawn by the enemy renderer ----
  const ghosts = [];   // { type, from, to, yaw, s, t, max }
  function spawnAt(pos, h, color) {
    rings.add(Vp.set(pos.x, 0.08, pos.z).clone(), color, 0.15, 1.3, 0.45, 2.2);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      sparks.spawn({ x: pos.x + Math.cos(a) * 0.6, y: pos.y + 0.1, z: pos.z + Math.sin(a) * 0.6, vx: -Math.sin(a) * 2.2, vy: 1.6 + Math.random() * 1.2, vz: Math.cos(a) * 2.2, color, life: 0.5, size: 0.3, drag: 2, glow: 2.2 });
    }
  }
  function leak(info, portal, color) {
    ghosts.push({ type: info.type, from: info.pos.clone(), to: portal.clone(), yaw: info.yaw, s: info.s, t: 0, max: 0.45 });
    rings.add(Vp.set(portal.x, 0.1, portal.z).clone(), color, 0.3, 1.8, 0.45, 2.4);
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2, r = 1.4;
      sparks.spawn({ x: portal.x + Math.cos(a) * r, y: portal.y + Math.random() * 1.5, z: portal.z + Math.sin(a) * r, vx: -Math.cos(a) * 3 - Math.sin(a) * 2, vy: 0.3, vz: -Math.sin(a) * 3 + Math.cos(a) * 2, color, life: 0.45, size: 0.3, drag: 1.5, glow: 2.4 });
    }
  }
  function lifeLost(portal) {
    rings.add(Vp.set(portal.x, 0.12, portal.z).clone(), "#ff4a6a", 0.4, 3.4, 0.55, 2.6);
    sparks.burst(portal.x, portal.y + 1, portal.z, "#ff4a6a", 18, 5, 0.5, 0.45, 2);
  }

  // ---- per frame ------------------------------------------------------------------
  function update(dt, drawGhost) {
    for (let i = queue.length - 1; i >= 0; i--) { queue[i].t -= dt; if (queue[i].t <= 0) { const f = queue[i].fn; queue.splice(i, 1); f(); } }
    for (let i = ghosts.length - 1; i >= 0; i--) {
      const g = ghosts[i]; g.t += dt;
      const f = Math.min(1, g.t / g.max), e = f * f;
      if (f >= 1) { ghosts.splice(i, 1); continue; }
      Vs.copy(g.from).lerp(g.to, e); Vs.y += Math.sin(f * Math.PI) * 0.6;
      drawGhost(g.type, Vs, g.yaw + e * 9, g.s * (1 - e * 0.9));
    }
    for (let i = n - 1; i >= 0; i--) {
      T[i] += dt;
      if (T[i] >= MX[i]) { kill(i); continue; }
      const fl = FL[i];
      if (!(fl & 8)) {
        const k = Math.exp(-DR[i] * dt);
        Vv[i * 3] *= k; Vv[i * 3 + 2] *= k; Vv[i * 3 + 1] = Vv[i * 3 + 1] * (G[i] < 0 ? k : 1) - G[i] * dt;
        P[i * 3] += Vv[i * 3] * dt; P[i * 3 + 1] += Vv[i * 3 + 1] * dt; P[i * 3 + 2] += Vv[i * 3 + 2] * dt;
        R[i * 3] += W[i * 3] * dt; R[i * 3 + 1] += W[i * 3 + 1] * dt; R[i * 3 + 2] += W[i * 3 + 2] * dt;
        const floor = 0.02 + S[i] * 0.5;
        if (!(fl & 1) && P[i * 3 + 1] < floor) {
          P[i * 3 + 1] = floor;
          if (Vv[i * 3 + 1] < -1.2 && B[i] > 0) Vv[i * 3 + 1] = -Vv[i * 3 + 1] * B[i]; else Vv[i * 3 + 1] = 0;
          Vv[i * 3] *= 0.55; Vv[i * 3 + 2] *= 0.55; W[i * 3] *= 0.5; W[i * 3 + 1] *= 0.5; W[i * 3 + 2] *= 0.5;
          if (fl & 4) { R[i * 3] = 0; R[i * 3 + 2] = 0; }   // splats lie flat
        }
      }
    }
    const t0 = performance.now() * 0.001;
    for (let i = 0; i < n; i++) {
      const f = T[i] / MX[i], fl = FL[i];
      let sc = S[i] * (f < 0.6 ? 1 : 1 - (f - 0.6) / 0.4);
      if (fl & 8) sc *= (Math.sin(t0 * 40 + i * 7.1) > -0.2 ? 1 : 0);          // glitch pixels blink
      if (fl & 4) Vs.set(sc * 1.6, sc * 0.35, sc * 1.6); else Vs.set(sc, sc, sc);
      E.set(R[i * 3], R[i * 3 + 1], R[i * 3 + 2]);
      M.compose(Vp.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]), Q.setFromEuler(E), Vs);
      mesh.setMatrixAt(i, M);
      const gl = (fl & 2) ? 1 + 0.5 * Math.sin(t0 * 25 + i) : 1;
      mesh.setColorAt(i, Cc.setRGB(C[i * 3] * gl, C[i * 3 + 1] * gl, C[i * 3 + 2] * gl));
    }
    mesh.count = n; mesh.visible = n > 0;
    mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    if (oldest >= n) oldest = 0;
  }
  return { death, spawnAt, leak, lifeLost, update, get live() { return n; } };
}
