/* Skyhold TD — render/world.js
   The one continuous voxel world: Circle's world map made physical.

   Circle draws its world as a polygon: one gate per corridor at the polygon's vertices, arrows along the
   edges, the vortex in the middle. Skyhold builds exactly that in 3D — every corridor is a floating island
   lying ALONG a polygon edge, travelling from gate k (its entrance) to gate k+1 (its exit), so the loop that
   enemies walk in the sim is the ring you see. Gates are small islands at the vertices, joined to the
   corridors by floating bridges; the vortex floats in the middle above a cosmic sea.

   Coordinates: 1 world unit = 1 grid tile. Corridor-local space: x = u - cols/2, z = v - rows/2 (u = column,
   v = row, both in tiles; row 0 = exit, last row = entrance), y = 0 is the build surface. */
import * as THREE from "three";
import { Batch, Part, MAT, rng, noise, fbm, col, shade, mix, clamp, lerp, TAU, pick } from "./kit.js";
import { THEMES, WORLD } from "./theme.js";

export const COLS = 31, ROWS = 61;
const SIDE = 3.2, END = 6;             // rim width beside / beyond the build grid
const HALF_W = COLS / 2 + SIDE, HALF_L = ROWS / 2 + END;

// ---------------------------------------------------------------------------
// RING LAYOUT — where each corridor island and gate sits (pure maths)
// ---------------------------------------------------------------------------
export function ringLayout(n) {
  const corridors = [], gates = [];
  if (n <= 1) {
    corridors.push({ x: 0, z: 0, theta: 0, t: { x: 0, z: -1 }, right: { x: 1, z: 0 } });
    gates.push({ x: 0, z: HALF_L + 7.5 });
    return { n: 1, Rm: 0, corridors, gates, vortex: { x: 0, z: -HALF_L - 15, r: 7 }, bounds: { x0: -46, x1: 46, z0: -HALF_L - 26, z1: HALF_L + 16 } };
  }
  const half = Math.PI / n;
  const tanH = Math.tan(half);
  // far enough out that neighbouring islands never overlap (inner corner stays on its side of the
  // bisector) and the corner between two islands leaves room for the gate island
  const Rm = Math.max(HALF_W + (HALF_L + 9) / tanH, 34);
  for (let i = 0; i < n; i++) {
    const phi = -Math.PI / 2 + (TAU * i) / n + half;           // edge midpoint angle (y-down / z-down map)
    const x = Math.cos(phi) * Rm, z = Math.sin(phi) * Rm;
    const t = { x: -Math.sin(phi), z: Math.cos(phi) };         // travel direction: gate i -> gate i+1
    const right = { x: -t.z, z: t.x };
    const theta = Math.atan2(-right.z, right.x);
    corridors.push({ x, z, theta, t, right });
  }
  for (let k = 0; k < n; k++) {
    const prev = corridors[(k - 1 + n) % n], cur = corridors[k];
    const ex = { x: prev.x + prev.t.x * HALF_L, z: prev.z + prev.t.z * HALF_L };
    const en = { x: cur.x - cur.t.x * HALF_L, z: cur.z - cur.t.z * HALF_L };
    const a = -Math.PI / 2 + (TAU * k) / n;
    const mx = (ex.x + en.x) / 2, mz = (ex.z + en.z) / 2;
    gates.push({ x: mx + Math.cos(a) * 4, z: mz + Math.sin(a) * 4 });
  }
  const vr = clamp((Rm - HALF_W) * 0.42, 9, 26);
  let R = 0;
  for (const g of gates) R = Math.max(R, Math.hypot(g.x, g.z) + 9);
  for (const c of corridors) R = Math.max(R, Math.hypot(c.x, c.z) + Math.hypot(HALF_W, HALF_L) * 0.7);
  return { n, Rm, corridors, gates, vortex: { x: 0, z: 0, r: vr }, bounds: { x0: -R, x1: R, z0: -R, z1: R } };
}

// corridor-local (u, v in tiles) -> world
export function corridorToWorld(L, i, u, v, y = 0, out = new THREE.Vector3()) {
  const c = L.corridors[i];
  const lx = u - COLS / 2, lz = v - ROWS / 2;
  return out.set(c.x + c.right.x * lx - c.t.x * lz, y, c.z + c.right.z * lx - c.t.z * lz);
}
// world -> corridor-local (u, v)
export function worldToCorridor(L, i, x, z) {
  const c = L.corridors[i];
  const dx = x - c.x, dz = z - c.z;
  const lx = dx * c.right.x + dz * c.right.z;
  const lz = -(dx * c.t.x + dz * c.t.z);
  return { u: lx + COLS / 2, v: lz + ROWS / 2 };
}

// ---------------------------------------------------------------------------
// SHADERS
// ---------------------------------------------------------------------------
export const TIME = { value: 0 };

const SWIRL_FRAG = /* glsl */`
  varying vec2 vUv;
  uniform float uTime, uSpin, uArms, uTwist, uCore, uBright, uMix;
  uniform vec3 uA, uB, uC, uA2, uB2, uC2;
  float h21(vec2 p){ p = fract(p*vec2(233.34,851.73)); p += dot(p,p+23.45); return fract(p.x*p.y); }
  void main(){
    vec2 p = vUv*2.0-1.0;
    float r = length(p); if (r > 1.0) discard;
    float a = atan(p.y, p.x);
    float lr = log(r + 0.03);
    float s  = sin(a*uArms + lr*uTwist - uTime*uSpin);
    float s2 = sin(a*uArms*2.0 + lr*uTwist*1.35 - uTime*uSpin*1.6 + 1.7);
    float arm = smoothstep(0.1, 1.0, s)*0.75 + smoothstep(0.55, 1.0, s2)*0.45;
    float core = smoothstep(uCore, uCore + 0.3, r);
    vec3 A = mix(uA, uA2, uMix), B = mix(uB, uB2, uMix), C = mix(uC, uC2, uMix);
    vec3 c = mix(A, B, clamp(arm*core*1.2, 0.0, 1.0));
    c += C * pow(clamp(arm, 0.0, 1.0), 3.0) * core * smoothstep(0.1, 0.8, r) * uBright;
    // drifting sparkles caught in the spiral
    vec2 sp = vec2(a*6.0 + lr*uTwist*0.5 - uTime*uSpin*0.5, lr*9.0);
    float st = step(0.985, h21(floor(sp*vec2(3.0, 2.0))));
    c += C * st * core * 1.5;
    c += C * smoothstep(0.80, 0.97, r) * smoothstep(1.0, 0.95, r) * uBright * 0.8;
    float alpha = smoothstep(1.0, 0.9, r);
    gl_FragColor = vec4(c, alpha);
  }`;
const UV_VERT = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }";

export function swirlMaterial(o) {
  const c3 = (h) => col(h).clone();
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: TIME, uSpin: { value: o.spin || 1.2 }, uArms: { value: o.arms || 3 }, uTwist: { value: o.twist || 3.2 },
      uCore: { value: o.core == null ? 0.12 : o.core }, uBright: { value: o.bright || 2.2 }, uMix: { value: 0 },
      uA: { value: c3(o.a) }, uB: { value: c3(o.b) }, uC: { value: c3(o.c) },
      uA2: { value: c3(o.a2 || o.a) }, uB2: { value: c3(o.b2 || o.b) }, uC2: { value: c3(o.c2 || o.c) },
    },
    vertexShader: UV_VERT, fragmentShader: SWIRL_FRAG,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
}
const swirlCache = new Map();
function elementSwirl(DB, el) {
  if (swirlCache.has(el)) return swirlCache.get(el);
  const E = DB.ELEMENTS[el], T = THEMES[el];
  const m = swirlMaterial({ a: shade(E.dark, 0.7), b: E.color, c: T.glow, spin: 1.6, arms: 3, twist: 3.0, core: 0.08, bright: 2.0 });
  swirlCache.set(el, m);
  return m;
}
let portalMat = null;
function portalSwirl() {
  if (!portalMat) portalMat = swirlMaterial({ a: "#12031f", b: "#7a2fd0", c: "#e2a8ff", spin: -2.2, arms: 2, twist: 4.5, core: 0.22, bright: 2.4 });
  return portalMat;
}

// ---------------------------------------------------------------------------
// BACKDROP — cosmic sea, cloud banks, distant islets (built once)
// ---------------------------------------------------------------------------
function buildSea() {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: TIME, uDeep: { value: col(WORLD.seaDeep).clone() }, uSea: { value: col(WORLD.sea).clone() },
      uGlow: { value: col(WORLD.seaGlow).clone() }, uCur: { value: col(WORLD.current).clone() }, uR: { value: 80 },
      uWarm: { value: 0 },
    },
    vertexShader: "varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }",
    fragmentShader: /* glsl */`
      uniform float uTime, uR, uWarm; uniform vec3 uDeep, uSea, uGlow, uCur; varying vec3 vW;
      float h21(vec2 p){ p = fract(p*vec2(233.34,851.73)); p += dot(p,p+23.45); return fract(p.x*p.y); }
      float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
      float fbm(vec2 p){ float a = 0.0, w = 0.55; for (int i = 0; i < 4; i++){ a += n2(p)*w; p = p*2.03 + vec2(13.1, 7.7); w *= 0.5; } return a; }
      void main(){
        vec2 p = vW.xz;
        float r = length(p);
        // the whole sea slowly turns around the vortex, faster near it
        float ang = uTime*0.015 + 26.0/(r*0.05 + 1.0)*0.12;
        float cs = cos(ang), sn = sin(ang);
        vec2 q = vec2(cs*p.x - sn*p.y, sn*p.x + cs*p.y);
        vec2 w = q*0.012 + vec2(fbm(q*0.01 + uTime*0.01), fbm(q*0.01 - 3.1)) * 1.4;
        float f = fbm(w*2.0);
        float ridge = 1.0 - abs(fbm(w*3.1 + 5.0)*2.0 - 1.0);
        vec3 c = mix(uDeep, uSea, smoothstep(0.25, 0.85, f));
        c += uCur * pow(ridge, 9.0) * 0.42;
        c *= 0.85;
        float near = exp(-r/(uR*0.9));
        c += uGlow * near * 0.35;
        c = mix(c, c*vec3(1.4,0.7,0.5), uWarm*near);
        // twinkling star-glints on the water
        vec2 sp = floor(p*0.35);
        float st = step(0.996, h21(sp)) * (0.5 + 0.5*sin(uTime*2.0 + h21(sp+3.0)*20.0));
        c += vec3(0.8,0.9,1.0) * st * 1.4;
        c = mix(c, uDeep*0.6, smoothstep(uR*2.6, uR*5.0, r));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000, 1, 1), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = -42;
  m.renderOrder = -5;
  m.frustumCulled = false;
  return m;
}

function cloudPuffGeometry(seed) {
  const r = rng(seed), b = new Batch(seed);
  const n = 5 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    const w = 3 + r() * 5, h = 1.2 + r() * 1.8, d = 2.5 + r() * 4;
    b.box(w, h, d, i % 3 ? WORLD.cloud : shade(WORLD.cloud, 0.92), (r() - 0.5) * 9, h / 2 + r() * 1.5, (r() - 0.5) * 6, { ao: 0.62, top: "#eef3ff" });
  }
  return b.geometry();
}

function buildClouds(count = 42) {
  const geos = [cloudPuffGeometry(11), cloudPuffGeometry(23), cloudPuffGeometry(37)];
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.5, depthWrite: false });
  const groups = geos.map((g) => { const m = new THREE.InstancedMesh(g, mat, Math.ceil(count / 3)); m.frustumCulled = false; return m; });
  const r = rng(91);
  const items = [];
  for (let i = 0; i < count; i++) {
    const a = r() * TAU, d = 30 + Math.pow(r(), 0.7) * 260;
    items.push({ g: i % 3, k: Math.floor(i / 3), x: Math.cos(a) * d, z: Math.sin(a) * d, y: -22 - r() * 16, s: 0.7 + r() * 1.3, rot: r() * TAU, v: 0.4 + r() * 0.8 });
  }
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), E = new THREE.Euler();
  const root = new THREE.Group();
  groups.forEach((g) => root.add(g));
  return {
    root,
    update(t) {
      for (const it of items) {
        const x = ((it.x + t * it.v + 400) % 800) - 400;
        M.compose(P.set(x, it.y, it.z), Q.setFromEuler(E.set(0, it.rot, 0)), S.set(it.s, it.s * 0.8, it.s));
        groups[it.g].setMatrixAt(it.k, M);
      }
      groups.forEach((g) => { g.instanceMatrix.needsUpdate = true; });
    },
  };
}

// little floating islets with a tree, crystal or ruin — depth and life around the ring
function buildIslets(DB, avoidR) {
  const b = new Batch(5), g = new Batch(6);
  const r = rng(777);
  const els = DB.ELEMENT_ORDER;
  for (let i = 0; i < 46; i++) {
    const a = r() * TAU, d = avoidR * (1.05 + r() * 1.6) + 10;
    const x = Math.cos(a) * d, z = Math.sin(a) * d, y = -6 - r() * 26;
    const el = els[i % els.length], T = THEMES[el];
    const s = 0.6 + r() * 1.4;
    b.push(x, y, z, r() * TAU, 0, 0, s);
    const w = 3 + Math.floor(r() * 4);
    for (let k = 0; k < 4; k++) b.box(w - k * 0.8, 1, w - k * 0.8 - r() * 0.5, k === 0 ? T.soil : k < 2 ? T.rock : T.deep, (r() - 0.5) * 0.4, -k * 0.95 - 0.5, (r() - 0.5) * 0.4);
    b.box(w + 0.2, 0.4, w + 0.2, T.ground[0], 0, 0.1, 0, { top: T.ground[2] });
    const kind = Math.floor(r() * 3);
    if (kind === 0 && (el === "nature" || el === "light")) { b.box(0.4, 1.6, 0.4, "#6a4a30", 0, 1.1, 0); b.box(1.8, 1.4, 1.8, T.accent, 0, 2.4, 0); }
    else if (kind <= 1) { g.push(x, y, z, r() * TAU, 0, 0, s); g.box(0.5, 1.6, 0.5, T.accent, 0, 1.1, 0, { glow: 1.8, ao: 1, jitter: 0, rotZ: 0.2 }); g.box(0.4, 1.1, 0.4, T.glow, 0.5, 0.85, 0.2, { glow: 1.6, ao: 1, jitter: 0, rotZ: -0.3 }); g.pop(); }
    else { b.box(0.6, 1.4, 0.6, WORLD.stone[0], -0.8, 0.9, 0); b.box(0.6, 0.9, 0.6, WORLD.stone[1], 0.8, 0.65, 0.3); }
    b.pop();
  }
  const grp = new THREE.Group();
  const m = b.mesh(MAT.lit, false); m.receiveShadow = false; grp.add(m);
  grp.add(g.mesh(MAT.glow, false));
  return grp;
}

// ---------------------------------------------------------------------------
// THE VORTEX — idle: a blue spiral bound by chains and a lock (Circle's "Wave" state);
// prep (end boss ready): it turns to fire and the chains burst outward ("Summon")
// ---------------------------------------------------------------------------
function buildVortex(radius) {
  const root = new THREE.Group();
  const mat = swirlMaterial({ a: WORLD.vortexIdle[0], b: WORLD.vortexIdle[1], c: WORLD.vortexIdle[2], a2: WORLD.vortexActive[0], b2: WORLD.vortexActive[1], c2: WORLD.vortexActive[2], spin: 0.9, arms: 4, twist: 3.6, core: 0.05, bright: 2.6 });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 72), mat);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = -3;
  disc.renderOrder = 2;
  root.add(disc);
  // a ring of standing stones around the rim
  const b = new Batch(3), gl = new Batch(4);
  const r = rng(12);
  const N = Math.round(radius * 2.4);
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU, R = radius + 1.2 + r() * 0.8;
    const h = 1 + r() * 1.6;
    b.box(1.6 + r(), h, 1.2 + r() * 0.6, pick(WORLD.stone, r), Math.cos(a) * R, -3 + h / 2 - 0.6, Math.sin(a) * R, { rotY: -a, top: WORLD.stoneTop });
    if (i % 4 === 0) gl.box(0.35, 0.5, 0.35, WORLD.vortexIdle[2], Math.cos(a) * R, -3 + h + 0.1, Math.sin(a) * R, { glow: 2.2, ao: 1, jitter: 0, rotY: -a });
  }
  for (let i = 0; i < N * 1.5; i++) {
    const a = r() * TAU, R = radius + 3 + r() * 4;
    b.box(1.4 + r() * 2, 1.5 + r() * 3, 1.4 + r() * 2, pick(WORLD.stone, r), Math.cos(a) * R, -4.5 - r() * 3, Math.sin(a) * R, { rotY: r() * TAU, top: WORLD.stoneTop });
  }
  const rim = b.mesh(MAT.lit, true); root.add(rim);
  const rimGlow = gl.mesh(MAT.glow, false); root.add(rimGlow);

  // orbiting rubble
  const rub = new THREE.Group();
  const rb = new Batch(9);
  for (let i = 0; i < 22; i++) {
    const a = r() * TAU, R = radius * (0.55 + r() * 0.5);
    rb.box(0.5 + r() * 0.9, 0.5 + r() * 0.7, 0.5 + r() * 0.9, pick(WORLD.stone, r), Math.cos(a) * R, -1.5 + r() * 3, Math.sin(a) * R, { rotY: r() * 3, rotX: r() * 3 });
  }
  rub.add(rb.mesh(MAT.lit, false));
  root.add(rub);

  // chains: four arms meeting at a padlock above the centre
  const chains = new THREE.Group();
  const arms = [];
  const linkGeo = (() => { const k = new Batch(2); k.box(0.9, 0.32, 0.5, WORLD.chain, 0, 0, 0, { top: "#b9c6dc" }); k.box(0.5, 0.32, 0.9, shade(WORLD.chain, 0.85), 0.75, 0, 0, { top: "#a9b6cc" }); return k.geometry(); })();
  const linkMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: new THREE.Color("#1a3a8a"), emissiveIntensity: 0.6 });
  for (let k = 0; k < 4; k++) {
    const arm = new THREE.Group();
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    const L = radius * 0.95;
    const links = Math.round(L / 1.5);
    for (let i = 1; i <= links; i++) {
      const m = new THREE.Mesh(linkGeo, linkMat);
      const d = (i / links) * L;
      m.position.set(Math.cos(a) * d, 1.2 - Math.sin((i / links) * Math.PI) * 0.4 + (1 - i / links) * 0.6, Math.sin(a) * d);
      m.rotation.y = -a;
      m.rotation.x = i % 2 ? Math.PI / 2 : 0;
      m.castShadow = true;
      arm.add(m);
    }
    arm.userData.dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    chains.add(arm); arms.push(arm);
  }
  const lock = new Part(4);
  lock.b(2.2, 2.2, 0.9, "#4d5a78", 0, 0, 0, { top: "#7b8bb0" }).b(1.4, 0.35, 0.5, "#6b7a9c", 0, 1.35, 0).b(0.35, 0.9, 0.5, "#6b7a9c", -0.6, 1.0, 0).b(0.35, 0.9, 0.5, "#6b7a9c", 0.6, 1.0, 0);
  lock.g(0.5, 0.8, 0.2, "#7fd0ff", 0, -0.15, 0.5, 2.4);
  const lockG = lock.build(true);
  lockG.position.set(0, 2.4, 0);
  chains.add(lockG);
  root.add(chains);

  const light = new THREE.PointLight(0x5aa0ff, 0, radius * 4, 1.6);
  light.position.set(0, 4, 0);
  root.add(light);
  let act = 0;
  return {
    root, disc, mat,
    update(dt, t, active) {
      act += ((active ? 1 : 0) - act) * Math.min(1, dt * 2.2);
      mat.uniforms.uMix.value = act;
      mat.uniforms.uSpin.value = 0.9 + act * 2.4;
      rub.rotation.y += dt * (0.12 + act * 0.6);
      rub.position.y = Math.sin(t * 0.7) * 0.3;
      // chains strain and fly apart as the seal breaks
      for (const arm of arms) { arm.position.copy(arm.userData.dir).multiplyScalar(act * radius * 0.6); arm.position.y = act * 2.5; }
      lockG.position.y = 2.4 + Math.sin(t * 1.4) * 0.15 + act * 6;
      lockG.rotation.y = t * 0.3 + act * 4;
      lockG.visible = act < 0.95;
      linkMat.emissive.setRGB(0.1 + act * 1.2, 0.23 + act * 0.2, 0.55 - act * 0.5);
      light.color.setRGB(0.35 + act * 0.65, 0.62 - act * 0.25, 1.0 - act * 0.8);
      light.intensity = 30 + act * 50 + Math.sin(t * 3) * 6;
    },
  };
}

// ---------------------------------------------------------------------------
// PROPS — obstacles (gameplay blockers, Circle's obstacle families) and rim decoration
// Every builder draws into a Part-like pair (b = lit, g = glow) around (x, 0, z).
// ---------------------------------------------------------------------------
const G = (g, w, h, d, c, x, y, z, k = 2, o = {}) => g.box(w, h, d, c, x, y, z, { ao: 1, jitter: 0, glow: k, ...o });

const OBSTACLES = {
  fire: [
    (b, g, x, z, r) => { // Lava Rock: a lumpy basalt mound split by glowing cracks
      b.box(1.0, 0.55, 0.9, "#2e211e", x, 0.27, z, { rotY: r() * 3, top: "#3c2b26" });
      b.box(0.7, 0.45, 0.7, "#3a2722", x + 0.15, 0.7, z - 0.1, { rotY: r() * 3 });
      G(g, 0.12, 0.6, 0.95, "#ff6a2a", x - 0.05, 0.3, z, 2.4, { rotY: 0.6 });
      G(g, 0.85, 0.1, 0.12, "#ffb15c", x, 0.56, z + 0.1, 2.2);
    },
    (b, g, x, z, r) => { // Obsidian Pillar
      b.box(1.0, 0.25, 1.0, "#2b1d1a", x, 0.12, z);
      b.box(0.55, 1.9, 0.55, "#141018", x, 1.15, z, { rotY: 0.4, top: "#2a2236" });
      b.box(0.3, 0.7, 0.3, "#1c1622", x, 2.35, z, { rotY: 0.9 });
      G(g, 0.9, 0.08, 0.9, "#ff5a1a", x, 0.27, z, 2.0);
    },
  ],
  ice: [
    (b, g, x, z, r) => { // Ice Shard
      b.box(0.9, 0.2, 0.9, "#cfe9f8", x, 0.1, z);
      G(g, 0.45, 1.8, 0.45, "#7fd8ff", x, 1.0, z, 1.25, { rotY: 0.7, rotZ: 0.08 });
      G(g, 0.3, 1.1, 0.3, "#bff0ff", x + 0.3, 0.65, z + 0.15, 1.3, { rotY: 0.2, rotZ: -0.35 });
      G(g, 0.28, 0.9, 0.28, "#9fe4ff", x - 0.3, 0.55, z - 0.1, 1.3, { rotY: 1.1, rotZ: 0.4 });
    },
    (b, g, x, z, r) => { // Frozen Boulder
      b.box(1.0, 0.75, 0.95, "#a9d4ee", x, 0.37, z, { top: "#e6f6ff", rotY: r() });
      b.box(0.7, 0.4, 0.7, "#c4e4f6", x - 0.1, 0.9, z + 0.05, { top: "#f2fbff" });
      G(g, 0.3, 0.3, 0.3, "#bff0ff", x + 0.3, 0.6, z + 0.35, 1.3);
    },
  ],
  nature: [
    (b, g, x, z, r) => { // Ancient Tree (young): a sapling on a mossy stone
      b.box(1.0, 0.3, 0.9, "#7a7a6a", x, 0.15, z, { top: "#5f8a3a" });
      b.box(0.22, 1.2, 0.22, "#6b4a2e", x, 0.9, z, { rotZ: 0.12 });
      b.box(0.9, 0.55, 0.9, "#5fbf3a", x + 0.05, 1.6, z, { top: "#8be05a" });
      b.box(0.55, 0.4, 0.55, "#7ad24a", x - 0.1, 2.0, z + 0.05, { top: "#a6ef6a" });
    },
    (b, g, x, z, r) => { // Root Cluster
      for (let i = 0; i < 5; i++) b.box(1.1, 0.18, 0.18, i % 2 ? "#5a4228" : "#6e5232", x, 0.12 + (i % 3) * 0.08, z + (i - 2) * 0.17, { rotY: (r() - 0.5) * 1.6, rotZ: (r() - 0.5) * 0.3 });
      b.box(0.5, 0.35, 0.5, "#4a6a2a", x + 0.2, 0.25, z - 0.2, { top: "#6aa03a" });
    },
  ],
  storm: [
    (b, g, x, z, r) => { // Charged Crystal
      b.box(1.0, 0.2, 1.0, "#3a3f5e", x, 0.1, z);
      G(g, 0.4, 1.2, 0.4, "#b48cff", x, 0.7, z, 1.6, { rotY: 0.5 });
      G(g, 0.3, 0.8, 0.3, "#d9b8ff", x + 0.32, 0.45, z + 0.1, 1.6, { rotZ: -0.5 });
      G(g, 0.3, 0.7, 0.3, "#9d6cff", x - 0.3, 0.4, z - 0.15, 1.6, { rotZ: 0.55 });
    },
    (b, g, x, z, r) => { // Storm Spire
      b.box(0.8, 0.5, 0.8, "#2e3352", x, 0.25, z);
      b.box(0.45, 1.2, 0.45, "#272b46", x, 1.1, z, { rotY: 0.3 });
      b.box(0.25, 0.9, 0.25, "#3a3f62", x, 2.1, z, { rotY: 0.8 });
      G(g, 0.1, 2.2, 0.1, "#e2c8ff", x + 0.18, 1.3, z, 2.6, { rotZ: 0.15 });
    },
  ],
  light: [
    (b, g, x, z, r) => { // Sun Pillar
      b.box(0.95, 0.3, 0.95, "#e8dcb4", x, 0.15, z);
      b.box(0.55, 1.8, 0.55, "#f2e8c6", x, 1.2, z, { top: "#fff4d0" });
      b.box(0.8, 0.25, 0.8, "#d9b84a", x, 2.2, z);
      G(g, 0.4, 0.4, 0.4, "#ffe066", x, 2.55, z, 2.6, { rotY: 0.78 });
    },
    (b, g, x, z, r) => { // Radiant Crystal
      b.box(0.9, 0.2, 0.9, "#d9cba0", x, 0.1, z);
      G(g, 0.45, 1.3, 0.45, "#ffd23d", x, 0.8, z, 1.7, { rotY: 0.6, rotZ: 0.1 });
      G(g, 0.3, 0.8, 0.3, "#fff6c2", x - 0.28, 0.5, z + 0.18, 1.7, { rotZ: 0.45 });
    },
  ],
  darkness: [
    (b, g, x, z, r) => { // Void Stone
      b.box(1.0, 0.8, 0.95, "#1a1428", x, 0.4, z, { top: "#2a2142", rotY: r() });
      b.box(0.6, 0.5, 0.6, "#221a34", x + 0.1, 1.0, z - 0.1);
      G(g, 0.35, 0.35, 0.12, "#a98aff", x, 0.55, z + 0.48, 2.5);
    },
    (b, g, x, z, r) => { // Bone Pile
      for (let i = 0; i < 6; i++) b.box(0.9, 0.14, 0.14, i % 2 ? "#e6dcc8" : "#d4c8b0", x + (r() - 0.5) * 0.3, 0.1 + i * 0.07, z + (r() - 0.5) * 0.5, { rotY: r() * 3 });
      b.box(0.36, 0.32, 0.36, "#efe6d4", x + 0.15, 0.55, z, { top: "#f6efe2" });
      b.box(0.08, 0.08, 0.02, "#120c20", x + 0.08, 0.58, z + 0.19); b.box(0.08, 0.08, 0.02, "#120c20", x + 0.22, 0.58, z + 0.19);
    },
  ],
  mech: [
    (b, g, x, z, r) => { // Generator
      b.box(1.0, 0.9, 0.9, "#4a5056", x, 0.45, z, { top: "#6e757c" });
      b.box(0.3, 0.6, 0.3, "#3a3f44", x - 0.25, 1.2, z);
      G(g, 0.42, 0.42, 0.42, "#7fe8ff", x + 0.18, 1.12, z, 2.2, { rotY: 0.78 });
      G(g, 0.6, 0.08, 0.02, "#ffb84a", x, 0.6, z + 0.46, 2.0);
    },
    (b, g, x, z, r) => { // Scrap Pile
      for (let i = 0; i < 6; i++) b.box(0.3 + r() * 0.5, 0.15 + r() * 0.25, 0.3 + r() * 0.4, pick(["#5a6066", "#6e757c", "#8a5a3a", "#4a4f54"], r), x + (r() - 0.5) * 0.6, 0.1 + i * 0.1, z + (r() - 0.5) * 0.6, { rotY: r() * 3, rotZ: (r() - 0.5) * 0.5 });
    },
  ],
  abnormal: [
    (b, g, x, z, r) => { // Rift Fragment: shards hanging in the air
      b.box(0.9, 0.15, 0.9, "#2e1f34", x, 0.07, z);
      G(g, 0.35, 0.8, 0.35, "#ff5fa2", x, 1.0, z, 1.8, { rotZ: 0.6, rotY: 0.3 });
      G(g, 0.25, 0.5, 0.25, "#5dffb0", x + 0.35, 1.6, z + 0.1, 1.8, { rotX: 0.8 });
      G(g, 0.22, 0.4, 0.22, "#ffc2dd", x - 0.3, 1.5, z - 0.2, 1.8, { rotZ: -0.9 });
    },
    (b, g, x, z, r) => { // Glitch Block
      b.box(0.85, 0.85, 0.85, "#3b2842", x, 0.42, z, { top: "#5a3d64" });
      G(g, 0.86, 0.12, 0.86, "#ff5fa2", x + 0.12, 0.6, z, 1.8);
      G(g, 0.5, 0.5, 0.5, "#5dffb0", x - 0.2, 1.05, z + 0.15, 1.5);
    },
  ],
};

// decoration on the island rim (never on the build grid)
const RIM = {
  fire: (b, g, x, y, z, r) => {
    const k = r();
    if (k < 0.4) { b.box(0.5, 1.4 + r() * 1.4, 0.5, "#16101a", x, y + 0.9, z, { rotY: r() * 3, rotZ: (r() - 0.5) * 0.3 }); }
    else if (k < 0.65) { b.box(0.9, 0.5, 0.9, "#4a3a34", x, y + 0.25, z); b.box(1.1, 0.25, 1.1, "#5a463e", x, y + 0.6, z); G(g, 0.5, 0.6, 0.5, "#ffb15c", x, y + 1.0, z, 2.6); G(g, 0.3, 0.5, 0.3, "#ff6a2a", x, y + 1.35, z, 2.8); }
    else { b.box(1.0, 0.2, 0.9, "#241816", x, y + 0.05, z); G(g, 0.6, 0.06, 0.4, "#ff5a1a", x, y + 0.16, z, 1.25, { rotY: r() * 3 }); }
  },
  ice: (b, g, x, y, z, r) => {
    const k = r();
    if (k < 0.5) { G(g, 0.5, 1.4 + r() * 1.6, 0.5, "#8fdcff", x, y + 0.9, z, 1.15, { rotY: r() * 3, rotZ: (r() - 0.5) * 0.4 }); G(g, 0.35, 0.9, 0.35, "#d4f4ff", x + 0.4, y + 0.5, z, 1.2, { rotZ: -0.5 }); }
    else if (k < 0.75) { b.box(0.3, 1.2, 0.3, "#5a4a3a", x, y + 0.6, z); b.box(1.2, 0.8, 1.2, "#e8f6ff", x, y + 1.3, z); b.box(0.8, 0.7, 0.8, "#f4fbff", x, y + 1.9, z); }
    else b.box(1.4, 0.4, 1.0, "#f2fbff", x, y + 0.2, z, { top: "#ffffff" });
  },
  nature: (b, g, x, y, z, r) => {
    const k = r();
    if (k < 0.45) { const h = 1.4 + r() * 1.5; b.box(0.35, h, 0.35, "#6b4a2e", x, y + h / 2, z); const lc = pick(["#4f9a45", "#5aa64c", "#62ad55", "#3f8a3a"], r); b.box(1.8, 1.2, 1.8, lc, x, y + h + 0.4, z, { ao: 0.8 }); b.box(1.2, 0.8, 1.2, shade(lc, 1.12), x + 0.1, y + h + 1.2, z, { ao: 0.85 }); }
    else if (k < 0.75) { b.box(1.0, 0.6, 1.0, pick(["#4f8a3a", "#5aa040"], r), x, y + 0.3, z, { top: "#7cc457" }); if (r() < 0.5) G(g, 0.15, 0.15, 0.15, pick(["#ff7aa8", "#ffe066", "#9fd8ff"], r), x + 0.3, y + 0.66, z + 0.2, 1.6); }
    else { b.box(0.15, 0.4, 0.15, "#efe2c8", x, y + 0.2, z); b.box(0.5, 0.2, 0.5, "#d9483a", x, y + 0.45, z, { top: "#ff6a5a" }); }
  },
  storm: (b, g, x, y, z, r) => {
    const k = r();
    if (k < 0.45) { G(g, 0.45, 1.2 + r() * 1.4, 0.45, "#a47cff", x, y + 0.8, z, 1.5, { rotY: r() * 3, rotZ: (r() - 0.5) * 0.5 }); G(g, 0.3, 0.8, 0.3, "#e2c8ff", x - 0.35, y + 0.45, z, 1.6, { rotZ: 0.6 }); }
    else if (k < 0.7) { b.box(0.18, 2.4, 0.18, "#8a92b0", x, y + 1.2, z); b.box(0.5, 0.15, 0.5, "#5a6080", x, y + 0.08, z); G(g, 0.22, 0.22, 0.22, "#ecd1ff", x, y + 2.5, z, 3); }
    else b.box(1.0 + r() * 0.6, 0.7 + r() * 0.8, 0.9, pick(["#2f3452", "#3a4066"], r), x, y + 0.4, z, { rotY: r() * 3 });
  },
  light: (b, g, x, y, z, r) => {
    const k = r();
    if (k < 0.4) { const h = 1.6 + r() * 1.6; b.box(0.55, h, 0.55, "#f2e8c6", x, y + h / 2, z, { top: "#fff4d0" }); b.box(0.75, 0.2, 0.75, "#d9b84a", x, y + h + 0.1, z); if (r() < 0.6) G(g, 0.3, 0.3, 0.3, "#ffe066", x, y + h + 0.4, z, 2.6, { rotY: 0.78 }); }
    else if (k < 0.7) { b.box(1.0, 0.5, 1.0, "#c9c06a", x, y + 0.25, z, { top: "#e6dc8a" }); G(g, 0.14, 0.14, 0.14, "#fff6c2", x + 0.3, y + 0.56, z, 2); }
    else { G(g, 0.4, 1.1, 0.4, "#ffd23d", x, y + 0.6, z, 1.6, { rotZ: 0.2, rotY: r() * 3 }); }
  },
  darkness: (b, g, x, y, z, r) => {
    const k = r();
    if (k < 0.45) { const h = 1.6 + r() * 2.2; b.box(0.55, h, 0.55, "#140f20", x, y + h / 2, z, { rotY: r() * 3, top: "#2a2142" }); b.box(0.3, 0.8, 0.3, "#1c1530", x, y + h + 0.3, z, { rotY: 0.7 }); }
    else if (k < 0.7) { G(g, 0.4, 1.1 + r(), 0.4, "#8b6cff", x, y + 0.7, z, 1.6, { rotY: r() * 3, rotZ: 0.25 }); }
    else { b.box(0.2, 1.5, 0.2, "#2a2030", x, y + 0.75, z, { rotZ: 0.15 }); b.box(0.9, 0.12, 0.12, "#2a2030", x + 0.3, y + 1.3, z, { rotZ: 0.5 }); }
  },
  mech: (b, g, x, y, z, r) => {
    const k = r();
    if (k < 0.35) { b.box(0.6, 0.6, 2.2, "#5a6066", x, y + 0.5, z, { top: "#7a8188" }); b.box(0.75, 0.75, 0.2, "#8a5a3a", x, y + 0.5, z + 0.6); }
    else if (k < 0.6) { b.box(1.0, 1.0, 1.0, "#6a5236", x, y + 0.5, z, { top: "#8a6a46" }); b.box(1.02, 0.1, 1.02, "#4a3a28", x, y + 0.5, z); }
    else if (k < 0.8) { b.box(0.16, 2.2, 0.16, "#3a3f44", x, y + 1.1, z); b.box(0.5, 0.2, 0.3, "#4a5056", x + 0.2, y + 2.2, z); G(g, 0.24, 0.16, 0.24, "#7fe8ff", x + 0.35, y + 2.08, z, 2.6); }
    else { b.box(0.9, 0.5, 0.9, "#4a5056", x, y + 0.25, z); G(g, 0.6, 0.06, 0.6, "#ffb84a", x, y + 0.52, z, 2); }
  },
  abnormal: (b, g, x, y, z, r) => {
    const k = r();
    if (k < 0.45) { G(g, 0.5, 0.5, 0.5, pick(["#ff5fa2", "#5dffb0", "#c77dff"], r), x, y + 1.2 + r() * 1.5, z, 1.7, { rotX: r() * 3, rotZ: r() * 3 }); b.box(0.6, 0.3, 0.6, "#3b2842", x, y + 0.15, z); }
    else if (k < 0.75) { b.box(0.5, 1.6 + r() * 1.4, 0.5, "#3b2842", x, y + 1.0, z, { rotZ: (r() - 0.5) * 0.8, rotY: r() * 3, top: "#5a3d64" }); G(g, 0.12, 0.8, 0.12, "#ff5fa2", x + 0.22, y + 0.9, z, 2); }
    else { b.box(1.0, 0.4, 0.8, "#45304d", x, y + 0.2, z, { rotY: 0.3 }); b.box(0.6, 0.4, 0.6, "#45304d", x + 0.4, y + 0.6, z + 0.2, { rotY: -0.4 }); }
  },
};

// what hangs under each island
const HANG = {
  fire: (b, g, x, y, z, r) => { const h = 1 + r() * 3; G(g, 0.25, h, 0.25, "#ff6a2a", x, y - h / 2, z, 2.2); G(g, 0.35, 0.35, 0.35, "#ffb15c", x, y - h - 0.2, z, 2.6); },
  ice: (b, g, x, y, z, r) => { const h = 1.5 + r() * 3; for (let i = 0; i < 4; i++) G(g, 0.55 - i * 0.12, h / 4, 0.55 - i * 0.12, i % 2 ? "#bff0ff" : "#8fdcff", x, y - (i + 0.5) * (h / 4), z, 1.15); },
  nature: (b, g, x, y, z, r) => { const h = 2 + r() * 4; b.box(0.18, h, 0.18, r() < 0.5 ? "#5a4228" : "#4a7a2c", x, y - h / 2, z, { rotZ: (r() - 0.5) * 0.3 }); if (r() < 0.4) b.box(0.5, 0.4, 0.5, "#62ad55", x, y - h, z); },
  storm: (b, g, x, y, z, r) => { const h = 1.2 + r() * 2.5; G(g, 0.35, h, 0.35, "#a47cff", x, y - h / 2, z, 1.6, { rotY: r() * 3 }); },
  light: (b, g, x, y, z, r) => { const h = 1 + r() * 2; G(g, 0.3, h, 0.3, "#ffe066", x, y - h / 2, z, 1.9, { rotY: 0.78 }); },
  darkness: (b, g, x, y, z, r) => { const h = 1.5 + r() * 3; b.box(0.4, h, 0.4, "#140f20", x, y - h / 2, z); if (r() < 0.5) G(g, 0.2, 0.2, 0.2, "#a98aff", x, y - h - 0.1, z, 2.4); },
  mech: (b, g, x, y, z, r) => { const h = 1 + r() * 3; b.box(0.3, h, 0.3, "#3a3f44", x, y - h / 2, z); G(g, 0.3, 0.2, 0.3, r() < 0.5 ? "#7fe8ff" : "#ffb84a", x, y - h, z, 2.4); },
  abnormal: (b, g, x, y, z, r) => { G(g, 0.4, 0.4, 0.4, pick(["#ff5fa2", "#5dffb0"], r), x + (r() - 0.5), y - 1 - r() * 3, z + (r() - 0.5), 1.7, { rotX: r() * 3, rotY: r() * 3 }); },
};

// ---------------------------------------------------------------------------
// CORRIDOR ISLAND
// grid: Uint8Array (0 free, 1 obstacle, 2 tower) or null for a preview island (decorative obstacles only)
// ---------------------------------------------------------------------------
export function buildCorridorIsland(DB, element, grid, seed = 1) {
  const T = THEMES[element] || THEMES.fire;
  const r = rng(seed * 131 + 7);
  const floor = new Batch(seed), terr = new Batch(seed + 1), props = new Batch(seed + 2), glow = new Batch(seed + 3);
  const ox = -COLS / 2, oz = -ROWS / 2;

  // the build grid: one inset quad per tile over a dark seam slab (grid lines read without extra geometry)
  terr.box(COLS + 0.2, 0.5, ROWS + 0.2, mix(T.ground[3], T.seam, 0.55), 0, -0.29, 0, { jitter: 0, ao: 1 });
  const gc = T.ground.map((h) => col(h));
  const tmp = new THREE.Color();
  for (let rr = 0; rr < ROWS; rr++) for (let c = 0; c < COLS; c++) {
    const n = fbm(c * 0.13 + seed * 3.1, rr * 0.13 - seed);
    const i = clamp(Math.floor(n * 4.2 - 0.6), 0, 3);
    tmp.copy(gc[i]).lerp(gc[(i + 1) % 4], noise(c * 0.5 + 9, rr * 0.5) * 0.5);
    const k = ((c + rr) & 1 ? 0.975 : 1.02) * (0.96 + noise(c * 1.7, rr * 1.7) * 0.08);
    const x0 = ox + c + 0.035, x1 = ox + c + 0.965, z0 = oz + rr + 0.035, z1 = oz + rr + 0.965;
    floor.quad([x0, 0, z1], [x1, 0, z1], [x1, 0, z0], [x0, 0, z0], [0, 1, 0], tmp, k);
  }
  // flat ground detail: cracks, frost, moss — tiny and level with the floor so nothing reads as a blocker
  for (let i = 0; i < 140; i++) {
    const c = Math.floor(r() * COLS), rr = 2 + Math.floor(r() * (ROWS - 4));
    if (grid && grid[rr * COLS + c] !== 0) continue;
    const x = ox + c + 0.2 + r() * 0.6, z = oz + rr + 0.2 + r() * 0.6;
    if (element === "fire" && r() < 0.6) glow.box(0.5 + r() * 0.5, 0.02, 0.07, "#ff5a1a", x, 0.012, z, { glow: 1.4, ao: 1, jitter: 0, rotY: r() * 3 });
    else if (element === "nature") terr.box(0.12, 0.14, 0.12, pick(["#5f9a3a", "#8ccf5a", "#ffe066", "#ff9ac0"], r), x, 0.07, z);
    else if (element === "ice") glow.box(0.08, 0.02, 0.08, "#ffffff", x, 0.012, z, { glow: 1.6, ao: 1, jitter: 0 });
    else if (element === "storm" && r() < 0.4) glow.box(0.6, 0.02, 0.05, "#c9a6ff", x, 0.012, z, { glow: 1.6, ao: 1, jitter: 0, rotY: r() * 3 });
    else if (element === "mech") terr.box(0.9, 0.02, 0.05, "#3a3e42", x, 0.012, z, { rotY: (r() < 0.5 ? 0 : Math.PI / 2) });
    else terr.box(0.18, 0.05, 0.14, shade(T.ground[3], 0.8), x, 0.025, z, { rotY: r() * 3 });
  }

  // the rim: uneven raised stone around the grid, a paved plaza at each end for the portals
  const X0 = -HALF_W, X1 = HALF_W, Z0 = -HALF_L, Z1 = HALF_L;
  for (let z = Z0; z < Z1; z += 1) for (let x = X0; x < X1; x += 1) {
    const cx = x + 0.5, cz = z + 0.5;
    const inGrid = cx > ox && cx < -ox && cz > oz && cz < -oz;
    if (inGrid) continue;
    const plaza = Math.abs(cx) < 7.5 && (cz < oz || cz > -oz);
    const edge = Math.min(cx - X0, X1 - cx, cz - Z0, Z1 - cz);
    const ragged = noise(cx * 0.35 + seed, cz * 0.35) ;
    if (edge < 1 && ragged < 0.45) continue;                 // a ragged outline
    if (plaza) {
      const ring = Math.max(Math.abs(cx) - 5.5, Math.abs(cz - (cz < 0 ? oz - 3 : -oz + 3)) - 2.2);
      terr.box(0.96, 0.4, 0.96, pick(T.rim, r), cx, -0.2 + (ring > 0 ? 0.12 : 0), cz, { top: shade(T.rimTop, 0.85 + r() * 0.2) });
      continue;
    }
    const dist = Math.min(Math.abs(Math.abs(cx) - COLS / 2), Math.abs(Math.abs(cz) - ROWS / 2));
    const h = 0.25 + Math.max(0, dist) * 0.12 + fbm(cx * 0.4, cz * 0.4 + seed) * 0.8;
    terr.box(1.0, h + 0.4, 1.0, pick(T.rim, r), cx, (h - 0.4) / 2, cz, { top: shade(T.rimTop, 0.82 + r() * 0.25) });
    if (dist > 0.8 && r() < 0.17 && edge > 0.8) RIM[element](props, glow, cx, h, cz, r);
  }

  // the underside: an inverted mountain in coarse strata, deepest under the middle
  const step = 3;
  for (let z = Z0; z < Z1; z += step) for (let x = X0; x < X1; x += step) {
    const cx = x + step / 2, cz = z + step / 2;
    const e = Math.min(cx - X0, X1 - cx, cz - Z0, Z1 - cz) / Math.min(HALF_W, HALF_L);
    const depth = 1.4 + Math.pow(clamp(e, 0, 1), 0.75) * 15 * (0.7 + fbm(cx * 0.12 + seed, cz * 0.12) * 0.6);
    const w = step + 0.05, inset = e < 0.06 ? 0.6 : 0;
    const b1 = Math.min(depth, 1.6), b2 = Math.min(depth, depth * 0.62 + 1);
    terr.box(w - inset, b1, w - inset, T.soil, cx, -0.4 - b1 / 2, cz, { skip: 4 });
    if (depth > b1) terr.box(w - inset - 0.2, b2 - b1, w - inset - 0.2, T.rock, cx, -0.4 - b1 - (b2 - b1) / 2, cz, { skip: 4 });
    if (depth > b2) terr.box(w - inset - 0.5, depth - b2, w - inset - 0.5, T.deep, cx, -0.4 - b2 - (depth - b2) / 2, cz, { skip: 4 });
    if (e < 0.12 && r() < 0.45) HANG[element](props, glow, cx + (r() - 0.5) * 2, -0.4 - b1, cz + (r() - 0.5) * 2, r);
  }

  // obstacles (grid cells == 1): Circle's two obstacle variants per element, chosen by (r + c) % 2
  const OB = OBSTACLES[element] || OBSTACLES.fire;
  const ob = (fn, x, z, rr) => { props.push(x, 0, z, 0, 0, 0, 1.2); glow.push(x, 0, z, 0, 0, 0, 1.2); fn(props, glow, 0, 0, rr); props.pop(); glow.pop(); };
  if (grid) {
    for (let rr = 0; rr < ROWS; rr++) for (let c = 0; c < COLS; c++) if (grid[rr * COLS + c] === 1) ob(OB[(rr + c) % 2], ox + c + 0.5, oz + rr + 0.5, r);
  } else {
    const pr = rng(seed + 99);
    for (let i = 0; i < 44; i++) { const c = Math.floor(pr() * COLS), rr = 3 + Math.floor(pr() * (ROWS - 6)); if (Math.abs(c - 15) < 2) continue; ob(OB[(rr + c) % 2], ox + c + 0.5, oz + rr + 0.5, pr); }
  }

  // portals: a sunken swirl at the entrance (enemies rise out of it), an arch at the exit
  const group = new THREE.Group();
  const portalStone = (zc, arch) => {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      props.box(0.8, 0.45, 0.6, pick(WORLD.stone, r), Math.cos(a) * 2.3, 0.1, zc + Math.sin(a) * 2.3, { rotY: -a, top: WORLD.stoneTop });
    }
    for (const sx of [-1, 1]) {
      props.box(0.9, arch ? 4.4 : 1.4, 0.9, WORLD.stone[2], sx * 3.4, (arch ? 4.4 : 1.4) / 2, zc, { top: WORLD.stoneTop });
      glow.box(0.5, 0.6, 0.5, T.accent, sx * 3.4, (arch ? 4.4 : 1.4) + 0.35, zc, { glow: 2.4, ao: 1, jitter: 0, rotY: 0.78 });
    }
  };
  const entZ = -oz + 2.4, extZ = oz - 2.4;
  portalStone(entZ, false);
  // exit arch
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI * (i / 10);
    props.box(0.85, 0.85, 0.7, pick(WORLD.stone, r), Math.cos(a) * 2.6, 0.2 + Math.sin(a) * 2.9 + 0.5, extZ, { rotZ: a, top: WORLD.stoneTop });
  }
  props.box(6.6, 0.4, 2, WORLD.stone[1], 0, 0, extZ, { top: WORLD.stoneTop });
  for (const sx of [-1, 1]) { props.box(0.9, 2.2, 0.9, WORLD.stone[2], sx * 3.6, 1.1, extZ); glow.box(0.45, 0.55, 0.45, T.accent, sx * 3.6, 2.5, extZ, { glow: 2.4, ao: 1, jitter: 0, rotY: 0.78 }); }

  const floorMesh = floor.mesh(MAT.lit, false); floorMesh.receiveShadow = true;
  const terrMesh = terr.mesh(MAT.lit, false); terrMesh.receiveShadow = true;
  const propMesh = props.mesh(MAT.lit, true);
  const glowMesh = glow.mesh(MAT.glow, false);
  group.add(floorMesh, terrMesh, propMesh, glowMesh);

  const inDisc = new THREE.Mesh(new THREE.CircleGeometry(2.05, 40), portalSwirl());
  inDisc.rotation.x = -Math.PI / 2; inDisc.position.set(0, 0.05, entZ); inDisc.renderOrder = 3;
  const outDisc = new THREE.Mesh(new THREE.CircleGeometry(2.3, 40), portalSwirl());
  outDisc.position.set(0, 2.35, extZ - 0.05); outDisc.renderOrder = 3;
  group.add(inDisc, outDisc);
  group.userData = { element, entZ, extZ };
  return group;
}

// ---------------------------------------------------------------------------
// GATE ISLAND (Circle's world/gates/*.PNG): a floating platform with an elemental swirl arch
// ---------------------------------------------------------------------------
export function buildGate(DB, element, seed = 1) {
  const T = THEMES[element] || THEMES.fire, E = DB.ELEMENTS[element];
  const r = rng(seed * 17 + 3);
  const b = new Batch(seed), g = new Batch(seed + 1);
  // platform: two stepped tiers of stone
  for (let z = -4.5; z < 4.5; z += 1) for (let x = -4.5; x < 4.5; x += 1) {
    const cx = x + 0.5, cz = z + 0.5, e = Math.max(Math.abs(cx), Math.abs(cz));
    if (e > 4.2 && r() < 0.35) continue;
    const h = e < 2.6 ? 0.6 : 0.3;
    b.box(1.0, h + 0.5, 1.0, pick(WORLD.stone, r), cx, (h - 0.5) / 2, cz, { top: e < 2.6 ? shade(T.rimTop, 0.9 + r() * 0.15) : WORLD.stoneTop });
  }
  // underside cone
  for (let k = 0; k < 7; k++) {
    const w = 9 - k * 1.2;
    b.box(w, 1.2, w, k < 2 ? T.soil : k < 4 ? T.rock : T.deep, (r() - 0.5) * 0.4, -0.9 - k * 1.15, (r() - 0.5) * 0.4, { skip: 4 });
  }
  for (let i = 0; i < 6; i++) HANG[element](b, g, (r() - 0.5) * 6, -1.2, (r() - 0.5) * 6, r);
  // the arch: a ring of blocks standing on the back half, swirl inside
  const R = 2.9, yc = 3.6;
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * TAU;
    b.box(0.95, 0.95, 0.9, i % 2 ? WORLD.stone[0] : WORLD.stone[2], Math.cos(a) * R, yc + Math.sin(a) * R, -0.8, { rotZ: a, top: WORLD.stoneTop });
    if (i % 3 === 0) g.box(0.3, 0.3, 0.3, T.glow, Math.cos(a) * (R + 0.5), yc + Math.sin(a) * (R + 0.5), -0.8, { glow: 2.2, ao: 1, jitter: 0, rotZ: a });
  }
  b.box(2.2, 0.7, 1.4, WORLD.stone[1], 0, 0.85, -0.8);
  // corner pillars topped with the element's light
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const px = sx * 3.3, pz = sz * 3.1, ph = sz < 0 ? 3.4 : 1.8;
    b.box(0.9, ph, 0.9, WORLD.stone[2], px, ph / 2 + 0.3, pz, { top: WORLD.stoneTop });
    b.box(1.2, 0.3, 1.2, WORLD.stone[0], px, ph + 0.4, pz);
    g.box(0.55, 0.9, 0.55, E.color, px, ph + 1.0, pz, { glow: 2.2, ao: 1, jitter: 0, rotY: 0.78 });
    g.box(0.3, 0.5, 0.3, T.glow, px, ph + 1.6, pz, { glow: 2.6, ao: 1, jitter: 0, rotY: 0.2 });
  }
  const group = new THREE.Group();
  group.add(b.mesh(MAT.lit, true), g.mesh(MAT.glow, false));
  const disc = new THREE.Mesh(new THREE.CircleGeometry(2.45, 48), elementSwirl(DB, element));
  disc.position.set(0, yc, -0.75); disc.renderOrder = 3;
  group.add(disc);
  group.userData = { element };
  return group;
}

// ---------------------------------------------------------------------------
// BRIDGES — floating stepping stones with an energy stream and a silver arrow (Circle's world arrows)
// ---------------------------------------------------------------------------
function buildBridge(points, color, seed) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p.x, p.y || 0, p.z)));
  const len = curve.getLength();
  const b = new Batch(seed), g = new Batch(seed + 1);
  const r = rng(seed);
  const n = Math.max(3, Math.floor(len / 1.7));
  const P = new THREE.Vector3(), Tn = new THREE.Vector3();
  for (let i = 0; i <= n; i++) {
    curve.getPointAt(i / n, P); curve.getTangentAt(i / n, Tn);
    const a = Math.atan2(Tn.x, Tn.z);
    b.box(1.5 + r() * 0.4, 0.45, 1.2, pick(WORLD.stone, r), P.x, P.y - 0.35 + Math.sin(i * 1.3) * 0.1, P.z, { rotY: a + (r() - 0.5) * 0.3, top: WORLD.stoneTop });
    if (r() < 0.5) b.box(0.8, 0.8, 0.8, WORLD.stone[1], P.x + (r() - 0.5) * 1.2, P.y - 1.0, P.z + (r() - 0.5) * 1.2, { rotY: r() * 3 });
  }
  const m = Math.max(6, Math.floor(len / 0.6));
  for (let i = 0; i < m; i++) {
    curve.getPointAt(i / m, P); curve.getTangentAt(i / m, Tn);
    g.box(0.16, 0.08, 0.7, color, P.x, P.y - 0.62, P.z, { glow: 1.6, ao: 1, jitter: 0, rotY: Math.atan2(Tn.x, Tn.z) });
  }
  // silver arrowhead floating over the middle, pointing the way the loop runs
  curve.getPointAt(0.5, P); curve.getTangentAt(0.5, Tn);
  b.push(P.x, P.y + 1.5, P.z, Math.atan2(Tn.x, Tn.z));
  b.box(0.3, 0.3, 1.6, "#c9d2e6", 0, 0, -0.3, { top: "#eef3ff" });
  b.box(0.3, 0.3, 1.1, "#aab4cc", -0.4, 0, 0.25, { rotY: -0.7 });
  b.box(0.3, 0.3, 1.1, "#aab4cc", 0.4, 0, 0.25, { rotY: 0.7 });
  b.pop();
  const grp = new THREE.Group();
  grp.add(b.mesh(MAT.lit, true), g.mesh(MAT.glow, false));
  grp.userData.curve = curve;
  return grp;
}

// ---------------------------------------------------------------------------
// THE WORLD
// ---------------------------------------------------------------------------
export function createWorld(scene, DB) {
  const root = new THREE.Group();
  scene.add(root);
  const sea = buildSea();
  scene.add(sea);
  const clouds = buildClouds();
  scene.add(clouds.root);
  let islets = null;
  let ring = null;           // current built ring
  const islandCache = new Map(); // preview islands (no grid), keyed by element|seed

  function clear() {
    if (!ring) return;
    for (const o of ring.objects) {
      root.remove(o);
      if (!o.userData.cached) o.traverse((n) => { if (n.geometry) n.geometry.dispose(); });
    }
    ring = null;
  }

  // spec: [{ element, grid|null, seed }], one per ring slot (corridor)
  function build(spec, opts = {}) {
    clear();
    const n = spec.length;
    const L = ringLayout(n);
    const objects = [], islands = [], gates = [], bridges = [];
    spec.forEach((s, i) => {
      let isl;
      if (!s.grid) {
        const key = s.element + "|" + (s.seed || 1);
        isl = islandCache.get(key);
        if (!isl) { isl = buildCorridorIsland(DB, s.element, null, s.seed || 1); isl.userData.cached = true; islandCache.set(key, isl); }
      } else isl = buildCorridorIsland(DB, s.element, s.grid, s.seed || i + 1);
      const c = L.corridors[i];
      isl.position.set(c.x, 0, c.z);
      isl.rotation.set(0, c.theta, 0);
      root.add(isl); objects.push(isl); islands.push(isl);
    });
    spec.forEach((s, k) => {
      const gp = L.gates[k];
      const gate = buildGate(DB, s.element, k + 1);
      gate.position.set(gp.x, -0.6, gp.z);
      gate.scale.setScalar(1.45);
      root.add(gate); objects.push(gate); gates.push(gate);
    });
    // bridges: exit of corridor k-1 -> gate k -> entrance of corridor k
    const V = new THREE.Vector3();
    for (let k = 0; k < n; k++) {
      const prev = (k - 1 + n) % n;
      const gp = L.gates[k];
      const E = DB.ELEMENTS[spec[k].element];
      const exitPt = corridorToWorld(L, prev, COLS / 2, -END + 0.6, 0, V).clone();
      const entPt = corridorToWorld(L, k, COLS / 2, ROWS + END - 0.6, 0, V).clone();
      let pts1, pts2;
      if (n === 1) {
        pts1 = [exitPt, { x: -18, z: -HALF_L - 6 }, { x: -HALF_W - 9, z: -10 }, { x: -HALF_W - 9, z: 18 }, { x: -9, z: gp.z - 1 }, { x: gp.x - 4.5, z: gp.z }];
        pts2 = [{ x: gp.x, z: gp.z - 4.5 }, entPt];
      } else {
        const toG = new THREE.Vector3(gp.x - exitPt.x, 0, gp.z - exitPt.z);
        pts1 = [exitPt, { x: exitPt.x + toG.x * 0.5, z: exitPt.z + toG.z * 0.5 }, { x: gp.x - toG.x * 0.12, z: gp.z - toG.z * 0.12 }];
        const fromG = new THREE.Vector3(entPt.x - gp.x, 0, entPt.z - gp.z);
        pts2 = [{ x: gp.x + fromG.x * 0.12, z: gp.z + fromG.z * 0.12 }, { x: gp.x + fromG.x * 0.55, z: gp.z + fromG.z * 0.55 }, entPt];
      }
      const lift = (arr) => arr.map((p) => ({ x: p.x, z: p.z, y: -0.2 }));
      const b1 = buildBridge(lift(pts1), DB.ELEMENTS[spec[prev].element].glow, 300 + k);
      const b2 = buildBridge(lift(pts2), E.glow, 400 + k);
      root.add(b1, b2); objects.push(b1, b2); bridges.push(b1, b2);
    }
    const vortex = buildVortex(L.vortex.r);
    vortex.root.position.set(L.vortex.x, 0, L.vortex.z);
    root.add(vortex.root); objects.push(vortex.root);
    const R = Math.max(L.bounds.x1 - L.bounds.x0, L.bounds.z1 - L.bounds.z0) / 2;
    sea.material.uniforms.uR.value = R;
    if (!islets || islets.userData.R !== Math.round(R / 20)) {
      if (islets) { scene.remove(islets); islets.traverse((o) => o.geometry && o.geometry.dispose()); }
      islets = buildIslets(DB, R); islets.userData.R = Math.round(R / 20); scene.add(islets);
    }
    ring = { n, L, objects, islands, gates, bridges, vortex, elements: spec.map((s) => s.element) };
    return ring;
  }

  return {
    root, sea, clouds,
    get ring() { return ring; },
    get layout() { return ring && ring.L; },
    build, clear,
    update(dt, t, vortexActive) {
      TIME.value = t;
      clouds.update(t);
      if (ring) {
        ring.vortex.update(dt, t, vortexActive);
        sea.material.uniforms.uWarm.value += ((vortexActive ? 1 : 0) - sea.material.uniforms.uWarm.value) * Math.min(1, dt * 2);
      }
    },
  };
}
