/* Skyhold TD — render/enemies.js
   Circle's seven enemies as chunky dark-fantasy voxel creatures (Circle ships no enemy art, so these are
   new — first-pass models, easy to replace: each is a short list of parts below).

   Drawing: every part of every enemy type is ONE InstancedMesh, so a screen full of mites costs the same
   few draw calls as a single imp. Each frame the renderer calls begin(), add() per visible enemy, end().
   Per-instance colour carries the hit flash and status tints (frozen = icy, burning = ember...). */
import * as THREE from "three";
import { Part, TAU, col } from "./kit.js";

// ---------------------------------------------------------------------------
// MODELS — parts drawn at 1 unit ≈ 1 tile, facing +z. anim: what the part does while walking.
// ---------------------------------------------------------------------------
const MODELS = {
  grunt: { // Imp: horned red-brown devil with little bat wings
    height: 1.25, size: 0.95,
    parts: {
      body(P) {
        P.b(0.6, 0.55, 0.45, "#a33a26", 0, 0.62, 0, { top: "#b84a30" });
        P.b(0.56, 0.5, 0.5, "#b0442c", 0, 1.08, 0.04, { top: "#c4553a" });
        P.b(0.42, 0.12, 0.08, "#2a0f0a", 0, 0.95, 0.3);
        P.g(0.12, 0.1, 0.05, "#ffd23d", -0.13, 1.14, 0.3, 2.6); P.g(0.12, 0.1, 0.05, "#ffd23d", 0.13, 1.14, 0.3, 2.6);
        for (const s of [-1, 1]) { P.b(0.12, 0.3, 0.12, "#2a1a14", s * 0.2, 1.42, -0.02, { rotZ: -s * 0.35 }); P.b(0.1, 0.16, 0.1, "#3a2a1e", s * 0.27, 1.6, -0.06, { rotZ: -s * 0.8 }); }
        P.b(0.1, 0.1, 0.45, "#8a2e1e", 0, 0.5, -0.38, { rotX: 0.5 });
        P.b(0.18, 0.18, 0.12, "#5a1a10", 0, 0.36, -0.58);
        for (const s of [-1, 1]) P.b(0.16, 0.4, 0.16, "#a33a26", s * 0.36, 0.72, 0.05, { rotZ: s * 0.2 });
      },
      legL(P) { P.b(0.2, 0.36, 0.22, "#7a2a1c", 0, -0.18, 0); P.b(0.24, 0.1, 0.3, "#2a1a14", 0, -0.37, 0.04); },
      legR(P) { P.b(0.2, 0.36, 0.22, "#7a2a1c", 0, -0.18, 0); P.b(0.24, 0.1, 0.3, "#2a1a14", 0, -0.37, 0.04); },
      wingL(P) { P.b(0.5, 0.36, 0.05, "#4a1a14", -0.25, 0.08, 0); P.b(0.3, 0.2, 0.05, "#6a2418", -0.52, 0.18, 0); },
      wingR(P) { P.b(0.5, 0.36, 0.05, "#4a1a14", 0.25, 0.08, 0); P.b(0.3, 0.2, 0.05, "#6a2418", 0.52, 0.18, 0); },
    },
    pivots: { legL: [-0.16, 0.38, 0], legR: [0.16, 0.38, 0], wingL: [-0.2, 0.95, -0.25], wingR: [0.2, 0.95, -0.25] },
    anim: { legL: "legA", legR: "legB", wingL: "flapL", wingR: "flapR" },
  },
  runner: { // Sprite: a quick golden fae with dragonfly wings
    height: 1.2, size: 0.75, hover: 0.35,
    parts: {
      body(P) {
        P.b(0.34, 0.5, 0.3, "#e0c14a", 0, 0.55, 0, { top: "#f0d46a" });
        P.g(0.2, 0.26, 0.2, "#fff2a8", 0, 0.55, 0.06, 1.9);
        P.b(0.4, 0.38, 0.38, "#f0d46a", 0, 0.98, 0.02, { top: "#ffe58a" });
        P.g(0.08, 0.1, 0.04, "#2a1a6a", -0.09, 1.0, 0.21, 1); P.g(0.08, 0.1, 0.04, "#2a1a6a", 0.09, 1.0, 0.21, 1);
        for (const s of [-1, 1]) P.b(0.08, 0.28, 0.1, "#e0c14a", s * 0.22, 1.2, -0.02, { rotZ: -s * 0.6 });
        P.b(0.18, 0.4, 0.18, "#c9a83a", 0, 0.18, -0.05, { rotX: 0.4 });
        P.g(0.14, 0.14, 0.14, "#fff2a8", 0, -0.04, -0.16, 2.2);
      },
      wingL(P) { P.g(0.6, 0.06, 0.26, "#fff8d0", -0.32, 0, 0.06, 1.25); P.g(0.48, 0.06, 0.2, "#fff8d0", -0.28, -0.04, -0.2, 1.2); },
      wingR(P) { P.g(0.6, 0.06, 0.26, "#fff8d0", 0.32, 0, 0.06, 1.25); P.g(0.48, 0.06, 0.2, "#fff8d0", 0.28, -0.04, -0.2, 1.2); },
    },
    pivots: { wingL: [-0.12, 0.75, -0.12], wingR: [0.12, 0.75, -0.12] },
    anim: { wingL: "buzzL", wingR: "buzzR" },
  },
  swarm: { // Mite: a green-shelled beetle scuttling on six legs
    height: 0.6, size: 0.6,
    parts: {
      body(P) {
        P.b(0.62, 0.32, 0.72, "#4f7a24", 0, 0.32, -0.04, { top: "#6a9a34" });
        P.b(0.04, 0.33, 0.7, "#2a4a12", 0, 0.33, -0.04);
        P.b(0.36, 0.24, 0.26, "#2e3a14", 0, 0.28, 0.4);
        P.g(0.08, 0.06, 0.04, "#c6ff5a", -0.09, 0.32, 0.54, 2.4); P.g(0.08, 0.06, 0.04, "#c6ff5a", 0.09, 0.32, 0.54, 2.4);
        for (const s of [-1, 1]) P.b(0.05, 0.05, 0.24, "#1e2a0a", s * 0.12, 0.3, 0.62, { rotY: s * 0.4 });
      },
      legA(P) { for (const [x, z] of [[-0.34, 0.2], [0.34, -0.05], [-0.34, -0.3]]) P.b(0.22, 0.06, 0.06, "#1e2a0a", x, 0, z, { rotZ: x > 0 ? -0.6 : 0.6 }); },
      legB(P) { for (const [x, z] of [[0.34, 0.2], [-0.34, -0.05], [0.34, -0.3]]) P.b(0.22, 0.06, 0.06, "#1e2a0a", x, 0, z, { rotZ: x > 0 ? -0.6 : 0.6 }); },
    },
    pivots: { legA: [0, 0.16, 0], legB: [0, 0.16, 0] },
    anim: { legA: "skitA", legB: "skitB" },
  },
  brute: { // Golem: mossy stone body around a glowing rune core
    height: 1.7, size: 1.25,
    parts: {
      body(P) {
        P.b(0.95, 0.75, 0.65, "#7a8aa0", 0, 0.98, 0, { top: "#8a9ab0" });
        P.b(0.8, 0.3, 0.55, "#6a7890", 0, 0.5, 0);
        P.b(0.5, 0.42, 0.46, "#8a9ab0", 0, 1.56, 0.06, { top: "#9aaac0" });
        P.g(0.3, 0.3, 0.08, "#5bd6ff", 0, 1.0, 0.34, 2.2);
        P.g(0.1, 0.06, 0.04, "#bff0ff", -0.1, 1.6, 0.3, 2.6); P.g(0.1, 0.06, 0.04, "#bff0ff", 0.1, 1.6, 0.3, 2.6);
        P.b(0.6, 0.12, 0.4, "#5f8a3a", 0.1, 1.4, -0.05, { top: "#7aaa4a" });
        P.b(0.3, 0.1, 0.3, "#5f8a3a", -0.3, 0.75, 0.3);
      },
      legL(P) { P.b(0.34, 0.5, 0.36, "#6a7890", 0, -0.25, 0); },
      legR(P) { P.b(0.34, 0.5, 0.36, "#6a7890", 0, -0.25, 0); },
      armL(P) { P.b(0.32, 0.36, 0.36, "#7a8aa0", 0, -0.1, 0); P.b(0.36, 0.5, 0.4, "#6a7890", 0, -0.5, 0.04); },
      armR(P) { P.b(0.32, 0.36, 0.36, "#7a8aa0", 0, -0.1, 0); P.b(0.36, 0.5, 0.4, "#6a7890", 0, -0.5, 0.04); },
    },
    pivots: { legL: [-0.24, 0.5, 0], legR: [0.24, 0.5, 0], armL: [-0.62, 1.25, 0], armR: [0.62, 1.25, 0] },
    anim: { legL: "legA", legR: "legB", armL: "swingB", armR: "swingA" },
  },
  tank: { // Behemoth: a plated four-legged beast with a battering-ram head
    height: 1.6, size: 1.5,
    parts: {
      body(P) {
        P.b(1.1, 0.75, 1.5, "#5a6b86", 0, 0.95, -0.05, { top: "#6a7b96" });
        for (let i = 0; i < 4; i++) P.b(1.2, 0.18, 0.32, "#3e4a60", 0, 1.38, -0.6 + i * 0.38, { top: "#8a9ab0" });
        P.b(0.7, 0.6, 0.55, "#4e5d76", 0, 0.92, 0.9, { top: "#5e6d86" });
        P.b(0.75, 0.2, 0.2, "#c9c2a8", 0, 1.0, 1.2);
        for (const s of [-1, 1]) P.b(0.14, 0.14, 0.5, "#d8d0b8", s * 0.36, 1.12, 1.32, { rotY: s * 0.35, rotX: -0.3 });
        P.g(0.1, 0.08, 0.04, "#ff4d4d", -0.18, 1.02, 1.18, 2.4); P.g(0.1, 0.08, 0.04, "#ff4d4d", 0.18, 1.02, 1.18, 2.4);
        P.b(0.2, 0.2, 0.4, "#3e4a60", 0, 0.95, -0.95, { rotX: -0.5 });
      },
      legsA(P) { for (const [x, z] of [[-0.42, 0.5], [0.42, -0.5]]) P.b(0.32, 0.6, 0.34, "#3e4a60", x, -0.3, z); },
      legsB(P) { for (const [x, z] of [[0.42, 0.5], [-0.42, -0.5]]) P.b(0.32, 0.6, 0.34, "#3e4a60", x, -0.3, z); },
    },
    pivots: { legsA: [0, 0.62, 0], legsB: [0, 0.62, 0] },
    anim: { legsA: "legA", legsB: "legB" },
  },
  boss: { // Warlord: a crimson armoured demon with a crown of horns and a great cleaver
    height: 2.6, size: 1.8,
    parts: {
      body(P) {
        P.b(1.1, 0.95, 0.7, "#8a2a50", 0, 1.45, 0, { top: "#a03a62" });
        P.b(1.2, 0.3, 0.75, "#3a1a2a", 0, 0.92, 0);
        P.b(0.4, 0.5, 0.1, "#c9a24a", 0, 0.7, 0.36);
        for (const s of [-1, 1]) P.b(0.5, 0.36, 0.6, "#3a1a2a", s * 0.7, 1.9, 0, { top: "#5a2a3e" });
        P.b(0.62, 0.6, 0.6, "#b03b6b", 0, 2.2, 0.05, { top: "#c44a7a" });
        P.g(0.14, 0.1, 0.05, "#ffd23d", -0.15, 2.25, 0.36, 2.8); P.g(0.14, 0.1, 0.05, "#ffd23d", 0.15, 2.25, 0.36, 2.8);
        P.b(0.4, 0.12, 0.06, "#1a0a12", 0, 2.05, 0.36);
        for (const s of [-1, 1]) { P.b(0.16, 0.5, 0.16, "#1a0a12", s * 0.3, 2.65, 0, { rotZ: -s * 0.4 }); P.b(0.12, 0.36, 0.12, "#2a1520", s * 0.48, 2.95, -0.05, { rotZ: -s * 0.9 }); }
        P.b(0.12, 0.4, 0.12, "#c9a24a", 0, 2.7, 0.15);
        P.g(0.6, 0.06, 0.06, "#ff2e7e", 0, 1.5, 0.37, 2.2);
      },
      legL(P) { P.b(0.42, 0.75, 0.46, "#3a1a2a", 0, -0.38, 0); P.b(0.48, 0.16, 0.6, "#1a0a12", 0, -0.78, 0.06); },
      legR(P) { P.b(0.42, 0.75, 0.46, "#3a1a2a", 0, -0.38, 0); P.b(0.48, 0.16, 0.6, "#1a0a12", 0, -0.78, 0.06); },
      armL(P) { P.b(0.36, 0.8, 0.38, "#8a2a50", 0, -0.4, 0); P.b(0.4, 0.3, 0.42, "#3a1a2a", 0, -0.85, 0); },
      armR(P) {
        P.b(0.36, 0.8, 0.38, "#8a2a50", 0, -0.4, 0); P.b(0.4, 0.3, 0.42, "#3a1a2a", 0, -0.85, 0);
        P.b(0.1, 1.0, 0.1, "#3a2a20", 0, -0.9, 0.35, { rotX: 1.2 });
        P.b(0.12, 0.8, 0.5, "#c8c8d8", 0, -0.75, 0.95, { rotX: 1.2, top: "#eeeef8" });
        P.g(0.04, 0.7, 0.06, "#ff2e7e", 0.07, -0.75, 0.95, 2, { rotX: 1.2 });
      },
    },
    pivots: { legL: [-0.32, 0.85, 0], legR: [0.32, 0.85, 0], armL: [-0.75, 1.8, 0], armR: [0.75, 1.8, 0] },
    anim: { legL: "legA", legR: "legB", armL: "swingB", armR: "swingA" },
  },
  endboss: { // The Sealed One: a towering colossus still dragging the chains that held it
    height: 4.2, size: 2.5, hover: 0.5,
    parts: {
      body(P) {
        P.b(1.7, 1.6, 1.1, "#2a1530", 0, 2.0, 0, { top: "#3e2046" });
        P.b(1.3, 0.9, 0.9, "#3e2046", 0, 1.0, 0);
        P.b(0.9, 1.0, 0.5, "#1e0f24", 0, 0.3, 0);
        for (const s of [-1, 1]) P.b(0.8, 0.6, 1.0, "#1e0f24", s * 1.1, 2.75, 0, { top: "#3e2046" });
        P.g(0.7, 0.7, 0.12, "#ff2e7e", 0, 2.1, 0.56, 2.2, { rotZ: 0.78 });
        P.g(0.36, 0.36, 0.14, "#ffffff", 0, 2.1, 0.58, 2.8, { rotZ: 0.78 });
        P.b(0.9, 0.9, 0.9, "#2a1530", 0, 3.3, 0.05, { top: "#3e2046" });
        P.g(0.6, 0.12, 0.05, "#ff5fa2", 0, 3.35, 0.51, 2.8);
        for (let i = 0; i < 5; i++) P.b(0.16, 0.6 + (i % 2) * 0.3, 0.16, "#ff2e7e", -0.4 + i * 0.2, 3.95, -0.05, { rotZ: (i - 2) * 0.25 });
        // the broken seal: chain links hanging from its shoulders
        for (const s of [-1, 1]) for (let k = 0; k < 4; k++) P.b(0.22, 0.28, 0.1, "#7f8ea8", s * 1.2, 2.3 - k * 0.32, 0.45, { rotY: k % 2 ? 1.57 : 0 });
      },
      armL(P) { P.b(0.6, 1.2, 0.6, "#2a1530", 0, -0.6, 0); P.b(0.75, 0.6, 0.75, "#1e0f24", 0, -1.4, 0.05); P.g(0.2, 0.2, 0.2, "#ff2e7e", 0, -1.4, 0.4, 2.4); },
      armR(P) { P.b(0.6, 1.2, 0.6, "#2a1530", 0, -0.6, 0); P.b(0.75, 0.6, 0.75, "#1e0f24", 0, -1.4, 0.05); P.g(0.2, 0.2, 0.2, "#ff2e7e", 0, -1.4, 0.4, 2.4); },
      ring(P) { for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU; P.b(0.3, 0.3, 0.16, "#7f8ea8", Math.cos(a) * 1.7, 0, Math.sin(a) * 1.7, { rotY: -a + (i % 2) * 1.57 }); } },
    },
    pivots: { armL: [-1.2, 2.6, 0], armR: [1.2, 2.6, 0], ring: [0, 1.0, 0] },
    anim: { armL: "swingB", armR: "swingA", ring: "orbit" },
  },
};

// tints applied by status (first non-adaptive status wins); hit flash goes over the top
const STATUS_TINT = {
  burning: "#ffb07a", molten: "#ffb07a", volatile: "#ffd07a",
  chilled: "#a8dcff", frozen: "#d8f6ff", brittle: "#c8e8ff",
  poisoned: "#a8f090", rooted: "#b8c890", sprouting: "#c0f0a0",
  shocked: "#e0c0ff", conductive: "#e0c8ff", lifted: "#ece0ff",
  illuminated: "#fff2b0", purified: "#ffffff", blinded: "#fff8d0",
  cursed: "#c0a8ff", weakened: "#c8b8ff", marked: "#e0d0ff",
  magnetized: "#d0dcea", tagged: "#e0e8f0", shredded: "#d8e0e8",
  corrupted: "#ffb0d8", fracture: "#ffc0e0", entropy: "#ffd0e8",
};
export const enemyModels = MODELS;

// ---------------------------------------------------------------------------
// part animation: returns a local rotation for the part at walk phase w (radians) and time t
// ---------------------------------------------------------------------------
const E = new THREE.Euler();
function animRot(kind, w, t, out) {
  switch (kind) {
    case "legA": E.set(Math.sin(w) * 0.6, 0, 0); break;
    case "legB": E.set(-Math.sin(w) * 0.6, 0, 0); break;
    case "swingA": E.set(Math.sin(w) * 0.45, 0, 0.1); break;
    case "swingB": E.set(-Math.sin(w) * 0.45, 0, -0.1); break;
    case "flapL": E.set(0, -0.3, Math.sin(t * 14) * 0.5 - 0.2); break;
    case "flapR": E.set(0, 0.3, -Math.sin(t * 14) * 0.5 + 0.2); break;
    case "buzzL": E.set(0, 0, Math.sin(t * 40) * 0.5); break;
    case "buzzR": E.set(0, 0, -Math.sin(t * 40) * 0.5); break;
    case "skitA": E.set(0, Math.sin(w * 1.5) * 0.4, 0); break;
    case "skitB": E.set(0, -Math.sin(w * 1.5) * 0.4, 0); break;
    case "orbit": E.set(0.25, t * 0.8, 0.1); break;
    default: E.set(0, 0, 0);
  }
  return out.setFromEuler(E);
}

// ---------------------------------------------------------------------------
// RENDERER
// ---------------------------------------------------------------------------
const litMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });

export function createEnemyRenderer(scene) {
  const root = new THREE.Group();
  scene.add(root);
  const types = {};
  for (const [id, M] of Object.entries(MODELS)) {
    const parts = [];
    for (const [name, fn] of Object.entries(M.parts)) {
      const P = new Part(id.length * 7 + name.length);
      fn(P);
      const piv = (M.pivots && M.pivots[name]) || [0, 0, 0];
      const entry = { name, piv: new THREE.Vector3(...piv), anim: (M.anim && M.anim[name]) || null, meshes: [] };
      if (!P.lit.empty) entry.meshes.push({ geo: P.lit.geometry(), lit: true });
      if (!P.glow.empty) entry.meshes.push({ geo: P.glow.geometry(), lit: false });
      parts.push(entry);
    }
    types[id] = { M, parts, cap: 0, count: 0 };
  }
  function alloc(T, cap) {
    for (const p of T.parts) for (const m of p.meshes) {
      if (m.inst) { root.remove(m.inst); m.inst.dispose(); }
      const inst = new THREE.InstancedMesh(m.geo, m.lit ? litMat : glowMat, cap);
      inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      inst.frustumCulled = false;
      inst.castShadow = m.lit;
      if (m.lit) { inst.setColorAt(0, new THREE.Color(1, 1, 1)); inst.instanceColor.setUsage(THREE.DynamicDrawUsage); }
      inst.count = 0;
      root.add(inst);
      m.inst = inst;
    }
    T.cap = cap;
  }
  for (const T of Object.values(types)) alloc(T, 16);

  // ice blocks around frozen enemies
  const iceGeo = new THREE.BoxGeometry(1, 1, 1);
  const iceMat = new THREE.MeshLambertMaterial({ color: "#bfefff", transparent: true, opacity: 0.45, emissive: new THREE.Color("#3a8aff"), emissiveIntensity: 0.4, depthWrite: false });
  let iceCap = 32;
  let ice = new THREE.InstancedMesh(iceGeo, iceMat, iceCap); ice.frustumCulled = false; ice.count = 0; root.add(ice);

  const Mbase = new THREE.Matrix4(), Mpart = new THREE.Matrix4(), Mtmp = new THREE.Matrix4();
  const Q = new THREE.Quaternion(), Qp = new THREE.Quaternion(), S = new THREE.Vector3(), V = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const C = new THREE.Color(), white = new THREE.Color(2.2, 2.2, 2.2);
  let nIce = 0;

  return {
    root, types, MODELS,
    begin() { for (const T of Object.values(types)) T.count = 0; nIce = 0; },
    // pos: world feet position; yaw: facing; w: walk phase; t: time; s: scale; tint: status id or null; flash 0..1; frozen bool
    add(type, pos, yaw, w, t, s, status, flash, frozen) {
      const T = types[type] || types.grunt;
      if (T.count >= T.cap) {
        const old = T.count;
        alloc(T, T.cap * 2);
        T.count = 0; // the frame's earlier instances of this type are lost for one frame — acceptable
        void old;
      }
      const i = T.count++;
      const hover = (T.M.hover || 0) + (T.M.hover ? Math.sin(t * 4 + w) * 0.08 : 0);
      const bob = Math.abs(Math.sin(w)) * 0.06;
      Mbase.compose(V.set(pos.x, pos.y + (hover + bob) * s, pos.z), Q.setFromAxisAngle(up, yaw), S.set(s, s, s));
      if (status && STATUS_TINT[status]) C.set(STATUS_TINT[status]); else C.setRGB(1, 1, 1);
      if (flash > 0) C.lerp(white, flash);
      const frozenStill = frozen ? 0 : 1;
      for (const p of T.parts) {
        if (p.anim) {
          animRot(p.anim, w * frozenStill, t * frozenStill + (frozen ? 0 : 0), Qp);
          Mpart.makeTranslation(p.piv.x, p.piv.y, p.piv.z).multiply(Mtmp.makeRotationFromQuaternion(Qp));
          Mpart.premultiply(Mbase);
        } else if (p.piv.lengthSq() > 0) Mpart.makeTranslation(p.piv.x, p.piv.y, p.piv.z).premultiply(Mbase);
        else Mpart.copy(Mbase);
        for (const m of p.meshes) {
          m.inst.setMatrixAt(i, Mpart);
          if (m.lit) m.inst.setColorAt(i, C);
        }
      }
      if (frozen) {
        if (nIce >= iceCap) { root.remove(ice); iceCap *= 2; ice = new THREE.InstancedMesh(iceGeo, iceMat, iceCap); ice.frustumCulled = false; root.add(ice); }
        const h = T.M.height * s, wd = T.M.size * s;
        Mpart.compose(V.set(pos.x, pos.y + h * 0.5, pos.z), Q, S.set(wd * 1.1, h * 1.05, wd * 1.1));
        ice.setMatrixAt(nIce++, Mpart);
      }
    },
    end() {
      for (const T of Object.values(types)) for (const p of T.parts) for (const m of p.meshes) {
        m.inst.count = T.count;
        m.inst.instanceMatrix.needsUpdate = true;
        if (m.lit && m.inst.instanceColor) m.inst.instanceColor.needsUpdate = true;
      }
      ice.count = nIce; ice.instanceMatrix.needsUpdate = true;
    },
    heightOf(type) { return (MODELS[type] || MODELS.grunt).height; },
  };
}

// a plain (non-instanced) model for menus, the codex and the gallery
export function buildEnemyPreview(DB, id) {
  const M = MODELS[id] || MODELS.grunt;
  const g = new THREE.Group();
  for (const [name, fn] of Object.entries(M.parts)) {
    const P = new Part(id.length * 7 + name.length);
    fn(P);
    const part = P.build(true);
    const piv = (M.pivots && M.pivots[name]) || [0, 0, 0];
    part.position.set(...piv);
    g.add(part);
  }
  if (M.hover) g.position.y = M.hover;
  return g;
}

// model scale per type: the models are already sized relative to each other to match Circle's enemy
// radii (Circle draws an enemy 4.4 × radius tiles across: imp ≈ 1.4, behemoth ≈ 2.2, warlord ≈ 3.1)
const SCALE = { grunt: 0.9, runner: 0.85, swarm: 0.8, brute: 0.9, tank: 0.95, boss: 1.0, endboss: 1.0 };
export function enemyScale(DB, type) { return SCALE[type] || 0.9; }
