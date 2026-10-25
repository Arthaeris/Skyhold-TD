/* Skyhold TD — render/kit.js
   The voxel kit shared by every model: deterministic noise, colour helpers, and Batch — thousands of
   coloured boxes merged into one mesh (adapted from Riftfall's art.js). Static scenery, towers and
   enemies are all assembled from Batches, so a phone draws a whole island in a handful of draw calls.
   Glowing pieces go into a separate "glow" batch whose colours run above 1.0 so the bloom picks them up. */
import * as THREE from "three";

const V3 = THREE.Vector3;
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// ---------------------------------------------------------------------------
// Deterministic randomness (cosmetic only — never touches the sim)
// ---------------------------------------------------------------------------
export function rng(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hash2(x, z) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function noise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
export function fbm(x, z) { return noise(x, z) * 0.6 + noise(x * 2.1 + 7, z * 2.1 - 3) * 0.3 + noise(x * 4.3 - 11, z * 4.3 + 5) * 0.1; }
export const pick = (arr, r) => arr[Math.floor(r() * arr.length) % arr.length];

// ---------------------------------------------------------------------------
// Colours. Hex values are sRGB; THREE.Color converts them to linear for vertex colours.
// ---------------------------------------------------------------------------
const colCache = new Map();
export function col(hex) {
  let c = colCache.get(hex);
  if (!c) { c = new THREE.Color(hex); colCache.set(hex, c); }
  return c;
}
export function shade(hex, k) { return "#" + new THREE.Color(hex).multiplyScalar(k).getHexString(); }
export function mix(a, b, t) { return "#" + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString(); }

// ---------------------------------------------------------------------------
// Batch: boxes merged into ONE indexed mesh, coloured per vertex with a little AO and jitter.
// ---------------------------------------------------------------------------
const FACES = [
  [[1, 0, 0], [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]]],
  [[-1, 0, 0], [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]]],
  [[0, 1, 0], [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]]],
  [[0, -1, 0], [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]]],
  [[0, 0, 1], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]],
  [[0, 0, -1], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]]],
];
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new V3(), _p = new V3();
export class Batch {
  constructor(seed = 1) {
    this.pos = []; this.nor = []; this.col = []; this.idx = [];
    this.stack = [new THREE.Matrix4()];
    this.r = rng(seed);
    this._v = new V3(); this._n = new V3(); this._m = new THREE.Matrix4(); this._nm = new THREE.Matrix3();
  }
  get m() { return this.stack[this.stack.length - 1]; }
  push(x = 0, y = 0, z = 0, rotY = 0, rotX = 0, rotZ = 0, s = 1) {
    const m = new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rotX, rotY, rotZ, "YXZ")), _s.set(s, s, s));
    this.stack.push(this.m.clone().multiply(m));
    return this;
  }
  pop() { if (this.stack.length > 1) this.stack.pop(); return this; }
  // a box centred at (x, y, z). opts: top (top-face colour), ao (bottom darkening), jitter, rotY/rotX/rotZ, glow (colour multiplier), skip (face mask)
  box(w, h, d, color, x = 0, y = 0, z = 0, opts = {}) {
    const m = this._m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(opts.rotX || 0, opts.rotY || 0, opts.rotZ || 0, "YXZ")), _s.set(w / 2, h / 2, d / 2));
    m.premultiply(this.m);
    this._nm.getNormalMatrix(m);
    const jit = opts.jitter === undefined ? 0.07 : opts.jitter;
    const k = (1 - jit / 2 + this.r() * jit) * (opts.glow || 1);
    const base = col(color), top = opts.top ? col(opts.top) : base;
    const ao = opts.ao === undefined ? 0.72 : opts.ao;
    const skip = opts.skip || 0;
    for (let f = 0; f < 6; f++) {
      if (skip & (1 << f)) continue;
      const [n, cs] = FACES[f];
      const c = f === 2 ? top : base;
      const first = this.pos.length / 3;
      this._n.set(n[0], n[1], n[2]).applyMatrix3(this._nm).normalize();
      for (const p of cs) {
        this._v.set(p[0], p[1], p[2]).applyMatrix4(m);
        this.pos.push(this._v.x, this._v.y, this._v.z);
        this.nor.push(this._n.x, this._n.y, this._n.z);
        const a = (f === 3 ? ao : p[1] < 0 && f !== 2 ? ao : 1) * k;
        this.col.push(c.r * a, c.g * a, c.b * a);
      }
      this.idx.push(first, first + 1, first + 2, first, first + 2, first + 3);
    }
    return this;
  }
  // a flat quad from four corners (terrain tops, decals)
  quad(a, b, c, d, n, color, k = 1) {
    const first = this.pos.length / 3;
    const cc = typeof color === "string" ? col(color) : color;
    for (const p of [a, b, c, d]) {
      this._v.set(p[0], p[1], p[2]).applyMatrix4(this.m);
      this.pos.push(this._v.x, this._v.y, this._v.z);
      this.nor.push(n[0], n[1], n[2]);
      this.col.push(cc.r * k, cc.g * k, cc.b * k);
    }
    this.idx.push(first, first + 1, first + 2, first, first + 2, first + 3);
  }
  // a rounded "voxel cylinder": n squares rotated around Y (2 = octagon, 3 = dodecagon); r = apothem
  disc(r, h, color, x = 0, y = 0, z = 0, opts = {}) {
    const n = opts.sides || 2;
    for (let i = 0; i < n; i++) this.box(r * 2, h, r * 2, color, x, y, z, { ...opts, rotY: (opts.rotY || 0) + (i * Math.PI) / (2 * n) });
    return this;
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
  mesh(material, shadows = true) {
    const m = new THREE.Mesh(this.geometry(), material || MAT.lit);
    m.castShadow = shadows; m.receiveShadow = shadows;
    return m;
  }
  get empty() { return this.pos.length === 0; }
}

export const MAT = {
  lit: new THREE.MeshLambertMaterial({ vertexColors: true }),
  glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
  glowAdd: new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
  glass: new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false }),
};

// ---------------------------------------------------------------------------
// Part: a lit batch + a glow batch that move together (a tower's turret, an enemy's leg...)
// ---------------------------------------------------------------------------
export class Part {
  constructor(seed = 1) { this.lit = new Batch(seed); this.glow = new Batch(seed + 7); }
  // b(): lit box; g(): glowing box (k = brightness; >1.4 blooms)
  b(w, h, d, color, x, y, z, opts) { this.lit.box(w, h, d, color, x, y, z, opts); return this; }
  g(w, h, d, color, x, y, z, k = 2, opts = {}) { this.glow.box(w, h, d, color, x, y, z, { ao: 1, jitter: 0, ...opts, glow: 0.55 + k * 0.45 }); return this; }
  push(...a) { this.lit.push(...a); this.glow.push(...a); return this; }
  pop() { this.lit.pop(); this.glow.pop(); return this; }
  // freeze into a Group of up to two meshes (geometries are cached by the caller and shared between clones)
  build(shadows = true) {
    const grp = new THREE.Group();
    if (!this.lit.empty) grp.add(this.lit.mesh(MAT.lit, shadows));
    if (!this.glow.empty) { const m = this.glow.mesh(MAT.glow, false); m.receiveShadow = false; grp.add(m); }
    return grp;
  }
}

// a soft round shadow blob for things that don't cast real shadows
const blobGeo = new THREE.CircleGeometry(0.5, 20);
const blobMat = new THREE.MeshBasicMaterial({ color: 0x07041a, transparent: true, opacity: 0.35, depthWrite: false });
export function blob(sx, sz) {
  const m = new THREE.Mesh(blobGeo, blobMat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.04;
  m.scale.set(sx, sz, 1);
  m.renderOrder = 1;
  return m;
}

// soft radial dot texture (particles, glows)
let _dot = null;
export function dotTexture() {
  if (_dot) return _dot;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const x = c.getContext("2d");
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.8)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  _dot = new THREE.CanvasTexture(c);
  return _dot;
}

// dispose every geometry under an object (materials are shared and kept)
export function disposeTree(o) {
  o.traverse((n) => { if (n.geometry && !n.userData.sharedGeo) n.geometry.dispose(); });
}
