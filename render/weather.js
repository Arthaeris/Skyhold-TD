/* Skyhold TD — render/weather.js
   Weather and atmosphere over each corridor island, one per element: embers rising over Fire, snow drifting over
   Ice, fireflies and pollen over Nature, slanting rain over Storm (with lightning flickers driven by the renderer),
   golden motes and light shafts over Light, violet wisps creeping over Darkness, steam puffs from vents over Mech,
   flickering glitch pixels over Abnormal.

   Built for phones and for readability:
   - every island is ONE Points draw call whose motion is computed entirely in the vertex shader (no per-frame CPU
     work, no buffer uploads); the counts scale with the graphics quality and the whole system can be switched off
   - particles are small, mostly translucent, and weighted toward the rims of the island so the build grid and the
     creeps on it stay easy to read; nothing here is picked or touches game state. */
import * as THREE from "three";
import { rng, col } from "./kit.js";
import { TIME } from "./world.js";

// shared camera scale (set by the renderer the same way as the spark particles)
export const WEATHER_U = { uScale: { value: 40 }, uPersp: { value: 0 } };

// per element: how the particles move and look
//   mode: rise | fall | wander | glitch | puff      size: world units      a: opacity     rimBias: share kept off the grid
const KIND = {
  fire:     { mode: "rise",   n: 1.0, H: 16, speed: 2.2, sway: 0.9, size: 0.55, a: 0.95, add: true,  cols: ["#ffb15c", "#ff7a2a", "#ffd27a", "#ff5a1a"], rimBias: 0.35, shape: "soft" },
  ice:      { mode: "fall",   n: 1.3, H: 18, speed: 1.6, sway: 1.2, size: 0.42, a: 0.85, add: false, cols: ["#ffffff", "#e2f1ff", "#c9e4ff"], rimBias: 0.2, shape: "flake" },
  nature:   { mode: "wander", n: 1.25, H: 5,  speed: 0.6, sway: 2.0, size: 0.5, a: 1.0,  add: true,  cols: ["#d9ff7a", "#b8ff5a", "#fff2a0"], rimBias: 0.45, shape: "soft", blink: true },
  storm:    { mode: "fall",   n: 1.5, H: 22, speed: 16,  sway: 0.0, size: 0.5, a: 0.42, add: false, cols: ["#c8d4ff", "#e6ecff", "#b7c4f2"], rimBias: 0.15, shape: "streak", slant: 0.35 },
  light:    { mode: "rise",   n: 0.9, H: 14, speed: 0.8, sway: 1.4, size: 0.45, a: 0.95,  add: false,  cols: ["#fffdf2", "#fff4c8", "#ffffff"], rimBias: 0.35, shape: "soft", blink: true },
  darkness: { mode: "wander", n: 0.9, H: 3,  speed: 0.35, sway: 2.6, size: 0.6, a: 0.6, add: true, cols: ["#8b6cff", "#b096ff", "#6a4ad0"], rimBias: 0.6, shape: "wisp" },
  mech:     { mode: "puff",   n: 0.6, H: 9,  speed: 1.3, sway: 0.6, size: 1.2,  a: 0.28, add: false, cols: ["#e8ecf2", "#cdd3dc", "#ffffff"], rimBias: 1.0, shape: "puff" },
  abnormal: { mode: "glitch", n: 0.8, H: 10, speed: 2.5, sway: 1.6, size: 0.36, a: 0.95, add: true,  cols: ["#ff5fa2", "#5dffb0", "#7fe8ff", "#ffffff"], rimBias: 0.35, shape: "square" },
};
export const WEATHER_KINDS = Object.keys(KIND);

const VERT = /* glsl */`
  uniform float uTime, uScale, uPersp, uH, uSpeed, uSway, uSize, uSlant, uOn;
  attribute vec4 seed;            // x,y,z: base position (local); w: phase 0..1
  attribute vec3 color;
  varying vec3 vC; varying float vA; varying float vS;
  float h1(float n) { return fract(sin(n * 127.1) * 43758.5453); }
  void main() {
    vec3 p = seed.xyz; float ph = seed.w * 97.0; float a = 1.0; float sz = uSize;
    #if defined(M_RISE)
      float u = fract(uTime * uSpeed / uH + seed.w);
      p.y += u * uH; p.x += sin(uTime * 0.9 + ph) * uSway * u; p.z += cos(uTime * 0.7 + ph * 1.3) * uSway * 0.6 * u;
      a = smoothstep(0.0, 0.12, u) * (1.0 - smoothstep(0.55, 1.0, u)); sz *= 1.0 - u * 0.5;
    #elif defined(M_FALL)
      float u = fract(uTime * uSpeed / uH + seed.w);
      p.y += (1.0 - u) * uH; p.x += sin(uTime * 0.8 + ph) * uSway + uSlant * (1.0 - u) * uH; p.z += cos(uTime * 0.6 + ph) * uSway * 0.5;
      a = smoothstep(0.0, 0.1, u) * (1.0 - smoothstep(0.85, 1.0, u));
    #elif defined(M_WANDER)
      p += vec3(sin(uTime * uSpeed * 1.3 + ph), 0.5 + 0.5 * sin(uTime * uSpeed * 0.9 + ph * 2.0), cos(uTime * uSpeed * 1.1 + ph * 1.7)) * vec3(uSway, uH * 0.4, uSway);
    #elif defined(M_PUFF)
      float u = fract(uTime * uSpeed / uH + seed.w);
      p.y += u * uH; p.x += sin(ph) * u * 1.6; p.z += cos(ph) * u * 1.6;
      a = smoothstep(0.0, 0.15, u) * (1.0 - u); sz *= 0.4 + u * 1.3;
    #elif defined(M_GLITCH)
      float k = floor(uTime * uSpeed + seed.w * 13.0);
      p += (vec3(h1(k + ph), h1(k * 1.7 + ph), h1(k * 2.3 + ph)) - vec3(0.5, 0.0, 0.5)) * vec3(uSway * 2.0, uH, uSway * 2.0);
      a = step(0.45, h1(k * 3.1 + ph));
    #endif
    #ifdef BLINK
      a *= 0.25 + 0.75 * pow(max(0.0, sin(uTime * 2.2 + ph * 3.0)), 4.0);
    #endif
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float px = sz * uScale / mix(1.0, max(1.0, -mv.z), uPersp);
    gl_PointSize = clamp(px, 1.5, 72.0);
    vA = a * uOn * smoothstep(1.0, 2.5, px);       // too small to read: fade instead of flickering single pixels
    vC = color; vS = px;
  }`;
const FRAG = /* glsl */`
  uniform float uA; varying vec3 vC; varying float vA; varying float vS;
  void main() {
    vec2 q = gl_PointCoord - 0.5; float d = length(q); float m;
    #if defined(S_SOFT)
      m = smoothstep(0.5, 0.12, d) + smoothstep(0.2, 0.0, d) * 0.6;   // a bright core in a soft halo
    #elif defined(S_FLAKE)
      m = smoothstep(0.5, 0.3, d) * 0.85 + smoothstep(0.25, 0.0, d) * 0.3;
    #elif defined(S_STREAK)
      float x = q.x - q.y * 0.35;                  // a short slanted streak inside the sprite
      m = smoothstep(0.09, 0.0, abs(x)) * smoothstep(0.5, 0.2, abs(q.y));
    #elif defined(S_WISP)
      m = smoothstep(0.5, 0.05, d) * 0.9;
    #elif defined(S_PUFF)
      m = smoothstep(0.5, 0.1, d);
    #else
      m = step(max(abs(q.x), abs(q.y)), 0.36);      // hard-edged glitch pixel
    #endif
    float a = m * vA * uA;
    if (a < 0.01) discard;
    #ifdef ADD
      gl_FragColor = vec4(vC * a * 1.6, a);
    #else
      gl_FragColor = vec4(vC, a);
    #endif
  }`;

const matCache = new Map();
function weatherMat(el) {
  if (matCache.has(el)) return matCache.get(el);
  const K = KIND[el];
  const defines = { ["M_" + K.mode.toUpperCase()]: "", ["S_" + K.shape.toUpperCase()]: "" };
  if (K.add) defines.ADD = "";
  if (K.blink) defines.BLINK = "";
  const m = new THREE.ShaderMaterial({
    defines,
    uniforms: { uTime: TIME, uScale: WEATHER_U.uScale, uPersp: WEATHER_U.uPersp, uH: { value: K.H }, uSpeed: { value: K.speed }, uSway: { value: K.sway }, uSize: { value: K.size }, uSlant: { value: K.slant || 0 }, uA: { value: K.a }, uOn: { value: 1 } },
    vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false, blending: K.add ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  matCache.set(el, m);
  return m;
}

// one island's particles. hw/hl: half extents of the island top (local x / z); grid: half width of the build grid
export function buildWeather(el, hw, hl, grid, count, seed) {
  const K = KIND[el]; if (!K) return null;
  const r = rng(seed), n = Math.max(8, Math.round(count * K.n));
  const seedA = new Float32Array(n * 4), colA = new Float32Array(n * 3);
  const cols = K.cols.map((c) => col(c));
  // mech steam rises from a few vents along the rims
  const vents = [];
  if (K.mode === "puff") for (let i = 0; i < 6; i++) vents.push([(i % 2 ? 1 : -1) * (grid - 0.4 + r() * 1.6), -hl * 0.8 + (i / 5) * hl * 1.6 + (r() - 0.5) * 3]);
  for (let i = 0; i < n; i++) {
    let x, z;
    if (vents.length) { const v = vents[i % vents.length]; x = v[0] + (r() - 0.5) * 0.8; z = v[1] + (r() - 0.5) * 0.8; }
    else if (r() < K.rimBias) {       // over the rims and just past the island's edge
      const s = r() < 0.5 ? -1 : 1; x = s * (grid + 0.6 + r() * (hw - grid + 3)); z = (r() * 2 - 1) * (hl + 2);
    } else { x = (r() * 2 - 1) * (hw + 2); z = (r() * 2 - 1) * (hl + 2); }
    const y = K.mode === "wander" ? 0.4 + r() * 0.8 : K.mode === "glitch" ? 1 + r() * 3 : K.mode === "fall" ? 0 : 0.2 + r() * 0.6;
    seedA.set([x, y, z, r()], i * 4);
    const c = cols[Math.floor(r() * cols.length)];
    colA.set([c.r, c.g, c.b], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute("seed", new THREE.BufferAttribute(seedA, 4));
  g.setAttribute("color", new THREE.BufferAttribute(colA, 3));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, K.H * 0.5, 0), Math.hypot(hw + 6, hl + 6, K.H));
  const pts = new THREE.Points(g, weatherMat(el));
  pts.renderOrder = 7;
  pts.userData.weather = el;
  const grp = new THREE.Group(); grp.add(pts);
  if (el === "light") grp.add(lightShafts(hw, grid, hl, r));
  return grp;
}

// soft additive god-rays slanting down onto the rims of a Light island (never across the build grid)
let SHAFT_MAT = null;   // created lazily: world.js (which owns TIME) imports this module
const shaftMat = () => SHAFT_MAT || (SHAFT_MAT = new THREE.ShaderMaterial({
  uniforms: { uTime: TIME, uOn: { value: 1 } },
  vertexShader: "varying vec2 vUv; varying float vPh; attribute float ph; void main(){ vUv = uv; vPh = ph; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
  fragmentShader: /* glsl */`
    uniform float uTime, uOn; varying vec2 vUv; varying float vPh;
    void main(){
      float a = smoothstep(0.0, 0.35, vUv.x) * smoothstep(1.0, 0.65, vUv.x) * smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.55, vUv.y);
      a *= 0.12 + 0.07 * sin(uTime * 0.6 + vPh * 6.0);
      gl_FragColor = vec4(vec3(1.0, 0.9, 0.6) * a * uOn, a * uOn);
    }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
}));
function lightShafts(hw, grid, hl, r) {
  const geos = [];
  for (let i = 0; i < 5; i++) {
    const s = i % 2 ? 1 : -1, w = 2 + r() * 2.5, h = 22;
    const g = new THREE.PlaneGeometry(w, h);
    g.translate(0, h / 2, 0);
    g.rotateZ(s * 0.32); g.rotateY(Math.PI / 2 + (r() - 0.5) * 0.4);
    g.translate(s * (grid + 1.2 + r() * (hw - grid)), 0, -hl + 6 + (i / 4) * (hl * 2 - 12));
    const ph = new Float32Array(g.attributes.position.count).fill(r());
    g.setAttribute("ph", new THREE.BufferAttribute(ph, 1));
    geos.push(g);
  }
  const merged = mergeGeos(geos);
  const m = new THREE.Mesh(merged, shaftMat());
  m.renderOrder = 6;
  return m;
}
function mergeGeos(geos) {
  let nv = 0, ni = 0;
  for (const g of geos) { nv += g.attributes.position.count; ni += g.index.count; }
  const pos = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), ph = new Float32Array(nv), idx = new Uint16Array(ni);
  let ov = 0, oi = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, ov * 3); uv.set(g.attributes.uv.array, ov * 2); ph.set(g.attributes.ph.array, ov);
    for (let k = 0; k < g.index.count; k++) idx[oi + k] = g.index.array[k] + ov;
    ov += g.attributes.position.count; oi += g.index.count;
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute("position", new THREE.BufferAttribute(pos, 3)); m.setAttribute("uv", new THREE.BufferAttribute(uv, 2)); m.setAttribute("ph", new THREE.BufferAttribute(ph, 1));
  m.setIndex(new THREE.BufferAttribute(idx, 1));
  return m;
}

// fade everything in or out together (settings toggle / quality)
export function setWeatherOpacity(k) {
  for (const m of matCache.values()) m.uniforms.uOn.value = k;
  if (SHAFT_MAT) SHAFT_MAT.uniforms.uOn.value = k;
}
