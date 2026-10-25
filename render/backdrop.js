/* Skyhold TD — render/backdrop.js
   The world the ring floats in, after Circle's world/background art: a deep, glowing sea far below the
   islands, ringed by elemental landmasses (a volcano with lava falls, a jungle ruin with waterfalls, ice spires,
   rune shrines and portals), floating islets with hanging undersides, sea stacks with foam rings, a whirlpool
   under the vortex, mist and cloud banks, and drifting motes.

   Everything here is decoration: nothing is picked and nothing reads game state except the end-boss tint.
   Built once per ring layout (cached by layout size); all static geometry is batched into a few meshes. */
import * as THREE from "three";
import { Batch, MAT, rng, noise, fbm, col, shade, mix, clamp, smooth, TAU, dotTexture } from "./kit.js";
import { THEMES } from "./theme.js";
import { TIME } from "./world.js";

export const SEA_Y = -110;           // the sea lies far below the floating ring
const SKY = "#040a24";
const FOG = "#0a1540";

// per-element landmass palettes and character
const LAND = {
  fire:     { rock: ["#2a2024", "#35282b", "#433234"], top: ["#3b2f2e", "#463735", "#3f3230"], sand: "#2a201f", peak: 54, kind: "volcano", flora: "ember", falls: "lava" },
  ice:      { rock: ["#46668e", "#567aa2", "#6a90b8"], top: ["#e4f2ff", "#d4e8fb", "#c6def5"], sand: "#a9c9e0", peak: 48, spiky: true, flora: "pine", falls: "ice", crystals: 10 },
  nature:   { rock: ["#463c33", "#54473a", "#635340"], top: ["#3f7f34", "#4a8f3a", "#58a043"], sand: "#c9b48a", peak: 40, beach: true, flora: "jungle", falls: "water", nfalls: 3, portal: true },
  storm:    { rock: ["#363f62", "#46517a", "#5a6694"], top: ["#6c78a8", "#7884b4", "#65709e"], sand: "#3a4160", peak: 52, spiky: true, snow: "#b5c1e2", snowAt: 0.72, flora: "rods", crystals: 6 },
  light:    { rock: ["#a3927a", "#b9a88a", "#cdbd9b"], top: ["#efe2b6", "#e6d6a4", "#f3e8c4"], sand: "#f0e3c0", peak: 36, beach: true, flora: "gold", falls: "water", nfalls: 1 },
  darkness: { rock: ["#2c2340", "#3a2f52", "#4a3d66"], top: ["#544270", "#5e4a7c", "#4c3c66"], sand: "#2a2238", peak: 46, spiky: true, flora: "shadow", crystals: 14, portal: true },
  mech:     { rock: ["#3a322c", "#483e36", "#584a3e"], top: ["#6b5b47", "#78664e", "#625342"], sand: "#4a4036", peak: 38, flora: "mech" },
  abnormal: { rock: ["#2c2140", "#3a2850", "#4a3162"], top: ["#9c4387", "#b2539b", "#8a3a78"], sand: "#3d2a4f", peak: 44, spiky: true, flora: "weird", crystals: 10, portal: true },
};
// where each element's landmass sits around the ring (degrees; 0 = +x/right, 90 = +z/bottom of the screen)
const PLACE = { fire: 222, storm: 268, nature: 316, darkness: 2, abnormal: 48, mech: 92, light: 136, ice: 180 };

// ---------------------------------------------------------------------------
// shared animated materials
// ---------------------------------------------------------------------------
const GLSL_NOISE = /* glsl */`
  float h21(vec2 p){ p = fract(p*vec2(233.34,851.73)); p += dot(p,p+23.45); return fract(p.x*p.y); }
  float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
  float fbm(vec2 p){ float a = 0.0, w = 0.55; for (int i = 0; i < 4; i++){ a += n2(p)*w; p = p*2.03 + vec2(13.1, 7.7); w *= 0.5; } return a; }`;
const VUV = "varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }";

const fallCache = new Map();
// a falling curtain (water, lava, frozen ice); fade = fades out into the air at the bottom (islet falls)
function fallMat(kind, fade) {
  const k = kind + (fade ? "|f" : "");
  if (fallCache.has(k)) return fallCache.get(k);
  const P = { water: ["#2f8fff", "#dff6ff", 1.15, 1.6], lava: ["#ff4a10", "#ffd27a", 2.2, 0.8], ice: ["#7fc8ff", "#f0fbff", 1.0, 0.08] }[kind];
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: TIME, uA: { value: col(P[0]).clone() }, uB: { value: col(P[1]).clone() }, uK: { value: P[2] }, uS: { value: P[3] } },
    vertexShader: VUV, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    fragmentShader: GLSL_NOISE + /* glsl */`
      uniform float uTime, uK, uS; uniform vec3 uA, uB; varying vec2 vUv; varying vec3 vW;
      void main(){
        float n = n2(vec2(vUv.x*9.0 + vW.x*0.3, vW.y*0.35 + uTime*uS*3.0))*0.6 + n2(vec2(vUv.x*23.0 + vW.z*0.5, vW.y*0.8 + uTime*uS*5.0))*0.4;
        vec3 c = mix(uA, uB, smoothstep(0.35, 0.85, n)) * uK;
        float a = (0.6 + 0.4*n) * smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
        ${fade ? "a *= smoothstep(0.0, 0.7, vUv.y);" : "c = mix(c, uB*uK*1.2, smoothstep(0.08, 0.0, vUv.y)); a = max(a, smoothstep(0.08, 0.0, vUv.y));"}
        gl_FragColor = vec4(c, a);
      }`,
  });
  fallCache.set(k, m);
  return m;
}
function fallMesh(kind, w, h, d, fade) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), fallMat(kind, fade));
  m.renderOrder = 3;
  return m;
}

function portalMat(el) {
  const T = THEMES[el];
  return new THREE.ShaderMaterial({
    uniforms: { uTime: TIME, uA: { value: col(shade(T.accent, 0.25)).clone() }, uB: { value: col(T.accent).clone() }, uC: { value: col(T.glow).clone() } },
    vertexShader: VUV, side: THREE.DoubleSide,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform vec3 uA, uB, uC; varying vec2 vUv;
      void main(){
        vec2 p = vUv*2.0 - 1.0; float r = length(p);
        float a = atan(p.y, p.x);
        float s = sin(a*3.0 + r*9.0 - uTime*2.4);
        vec3 c = mix(uA, uB, smoothstep(-0.6, 1.0, s)) * 1.5;
        c = mix(c, uC*2.4, smoothstep(0.4, 0.0, r));
        c += uC * smoothstep(0.72, 1.0, r) * 1.4;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}

// ---------------------------------------------------------------------------
// decorations (trees, crystals, ruins …) shared by landmasses, islets and stacks
// ---------------------------------------------------------------------------
function crystal(g, x, y, z, s, color, r) {
  g.push(x, y, z, r() * TAU, 0, 0, s);
  g.box(0.8, 3.4, 0.8, color, 0, 1.5, 0, { glow: 2.0, ao: 1, jitter: 0, rotZ: (r() - 0.5) * 0.35 });
  g.box(0.55, 2.2, 0.55, color, 0.75, 0.9, 0.25, { glow: 1.7, ao: 1, jitter: 0, rotZ: -0.35 });
  g.box(0.5, 1.6, 0.5, color, -0.6, 0.7, -0.3, { glow: 1.6, ao: 1, jitter: 0, rotZ: 0.4, rotX: 0.2 });
  g.pop();
}
function palm(b, x, y, z, s, r) {
  b.push(x, y, z, r() * TAU, 0, 0, s);
  b.box(0.55, 1.8, 0.55, "#6b4a2e", 0, 0.9, 0, { rotZ: 0.12 });
  b.box(0.5, 1.6, 0.5, "#7a5636", 0.25, 2.5, 0, { rotZ: 0.2 });
  for (let k = 0; k < 5; k++) b.box(2.8, 0.3, 0.8, k % 2 ? "#2f7a3a" : "#3c9444", 0.3, 3.4, 0, { rotY: (k * TAU) / 5, rotZ: 0.18, jitter: 0.1 });
  b.pop();
}
function decorate(kind, lit, glow, x, y, z, s, r, T) {
  const rot = r() * TAU;
  switch (kind) {
    case "jungle": {
      const th = 2.4 + r() * 2.4;
      lit.push(x, y, z, rot, 0, 0, s);
      lit.box(0.9, th, 0.9, "#5b3d26", 0, th / 2, 0);
      const g1 = r() < 0.5 ? "#2f6e2c" : "#3a7d32";
      lit.box(3.8, 1.8, 3.8, g1, 0, th + 0.5, 0, { top: "#58a043" });
      lit.box(2.8, 1.5, 2.8, "#4a8f3a", 0.3, th + 1.9, -0.2, { top: "#6cb84e" });
      lit.box(1.6, 1.0, 1.6, "#58a043", -0.2, th + 3.0, 0.2, { top: "#7fcf5a" });
      lit.pop();
      break;
    }
    case "pine": {
      lit.push(x, y, z, rot, 0, 0, s);
      lit.box(0.6, 1.4, 0.6, "#4a3424", 0, 0.7, 0);
      lit.box(3.0, 1.3, 3.0, "#1f4a44", 0, 1.9, 0, { top: "#eaf5ff" });
      lit.box(2.2, 1.3, 2.2, "#235049", 0, 3.1, 0, { top: "#eaf5ff" });
      lit.box(1.3, 1.3, 1.3, "#28584f", 0, 4.3, 0, { top: "#f4faff" });
      lit.pop();
      break;
    }
    case "ember": {
      lit.push(x, y, z, rot, 0, 0, s);
      lit.box(1.0, 2 + r() * 3, 1.0, "#17111a", 0, 1.5, 0, { rotZ: (r() - 0.5) * 0.4 });
      lit.box(0.7, 1.5 + r() * 2, 0.7, "#21181f", 0.9, 1, 0.3, { rotZ: 0.3 });
      lit.pop();
      glow.push(x, y, z, rot, 0, 0, s);
      glow.box(1.6, 0.25, 0.35, T.hot, 0, 0.15, 0.8, { glow: 2.2, jitter: 0, ao: 1 });
      glow.pop();
      break;
    }
    case "rods": {
      const h = 6 + r() * 7;
      lit.push(x, y, z, rot, 0, 0, s);
      lit.box(1.2, h * 0.5, 1.2, "#1d2236", 0, h * 0.25, 0);
      lit.box(0.7, h * 0.5, 0.7, "#262d48", 0, h * 0.75, 0);
      lit.pop();
      glow.push(x, y, z, rot, 0, 0, s);
      glow.box(0.7, 0.9, 0.7, T.accent, 0, h + 0.5, 0, { glow: 2.4, jitter: 0, ao: 1 });
      glow.pop();
      break;
    }
    case "gold": {
      if (r() < 0.6) {
        const th = 2 + r() * 1.5;
        lit.push(x, y, z, rot, 0, 0, s);
        lit.box(0.7, th, 0.7, "#e8dcc0", 0, th / 2, 0);
        lit.box(3.0, 1.6, 3.0, "#f2c04a", 0, th + 0.4, 0, { top: "#ffe08a" });
        lit.box(1.8, 1.0, 1.8, "#ffd36a", 0.2, th + 1.6, 0, { top: "#fff0b0" });
        lit.pop();
      } else {
        lit.push(x, y, z, rot, 0, 0, s);
        lit.box(1.2, 5, 1.2, "#efe6d2", 0, 2.5, 0); lit.box(1.8, 0.6, 1.8, "#d9cba8", 0, 5.2, 0);
        lit.pop();
        glow.push(x, y, z, rot, 0, 0, s); glow.box(0.7, 0.7, 0.7, T.glow, 0, 5.9, 0, { glow: 2.2, jitter: 0, ao: 1 }); glow.pop();
      }
      break;
    }
    case "shadow": {
      lit.push(x, y, z, rot, 0, 0, s);
      lit.box(0.8, 3, 0.8, "#1c1526", 0, 1.5, 0, { rotZ: 0.15 });
      lit.box(0.5, 2.4, 0.5, "#241b30", 0.7, 3.2, 0, { rotZ: -0.6 });
      lit.box(0.45, 2, 0.45, "#241b30", -0.6, 3.4, 0.2, { rotZ: 0.7 });
      lit.pop();
      if (r() < 0.5) crystal(glow, x + 1.4, y, z, 0.6 * s, T.accent, r);
      break;
    }
    case "mech": {
      lit.push(x, y, z, rot, 0, 0, s);
      if (r() < 0.5) {
        lit.box(1.6, 5, 1.6, "#3a302a", 0, 2.5, 0); lit.box(2.0, 0.6, 2.0, "#7a5a32", 0, 5, 0);
        lit.box(4, 0.6, 0.6, "#8a6a3a", 1.6, 1.4, 0);
        lit.pop();
        glow.push(x, y, z, rot, 0, 0, s); glow.box(0.5, 0.6, 1.7, T.hot, 0.6, 3, 0, { glow: 2, jitter: 0, ao: 1 }); glow.pop();
      } else {
        lit.push(0, 2, 0, 0, Math.PI / 2, 0, 1);
        lit.disc(1.5, 0.6, "#8a6a3a", 0, 0, 0, { sides: 3 });
        for (let k = 0; k < 8; k++) lit.box(0.6, 0.6, 0.6, "#a07a40", Math.cos((k * TAU) / 8) * 1.8, 0, Math.sin((k * TAU) / 8) * 1.8);
        lit.pop(); lit.pop();
      }
      break;
    }
    case "weird": {
      lit.push(x, y, z, rot, 0, 0, s);
      const h = 1.5 + r() * 2;
      lit.box(0.6, h, 0.6, "#e8d8ff", 0, h / 2, 0);
      lit.pop();
      glow.push(x, y, z, rot, 0, 0, s);
      glow.box(2.4, 0.8, 2.4, r() < 0.5 ? T.accent : "#5dffb0", 0, h + 0.3, 0, { glow: 1.7, jitter: 0, ao: 1 });
      glow.pop();
      break;
    }
    case "crystal":
      crystal(glow, x, y, z, s, T.accent, r);
      break;
    case "palm":
      palm(lit, x, y, z, s, r);
      break;
    case "ruin": {
      lit.push(x, y, z, rot, 0, 0, s);
      lit.box(1.2, 3 + r() * 2, 1.2, "#5a5262", 0, 1.8, 0); lit.box(1.2, 1.6, 1.2, "#4d4656", 1.6, 0.8, 0.4, { rotY: 0.4 });
      lit.pop();
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// LANDMASSES — terraced voxel heightfields; local +x points away from the ring
// ---------------------------------------------------------------------------
// backdrop material: Lambert plus a little self-illumination by the vertex colour, so cliffs in shade keep
// their hue instead of going black at this distance
const LANDMAT = new THREE.MeshLambertMaterial({ vertexColors: true });
LANDMAT.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * 0.32;"); };
const S = 3;
function buildLandmass(el, a, b, seed) {
  const L = LAND[el], T = THEMES[el], r = rng(seed);
  const lit = new Batch(seed), glow = new Batch(seed + 1);
  const grp = new THREE.Group();
  const peak = L.peak;
  const cells = new Map(), key = (i, j) => i * 4096 + j;
  const I = Math.ceil(a / S) + 1, J = Math.ceil(b / S) + 1;
  const cone = L.kind === "volcano" ? { u: a * 0.1, v: (r() - 0.5) * b * 0.3, R: Math.min(a, b) * 1.05 } : null;
  for (let i = -I; i <= I; i++) for (let j = -J; j <= J; j++) {
    const u = i * S, v = j * S;
    const d = Math.hypot(u / a, v / b) + (fbm(u * 0.04 + seed * 0.37, v * 0.04) - 0.5) * 0.55;
    if (d >= 1) continue;
    const c = 1 - d;
    const ridge = 1 - Math.abs(fbm(u * 0.028 + seed, v * 0.028 - seed) * 2 - 1);
    const out = smooth(clamp((u + a * 0.9) / (a * 1.6), 0, 1));
    let h = peak * Math.pow(c, 0.55) * (0.3 + 0.7 * ridge) * (0.35 + 0.65 * out);
    let crater = false;
    if (cone) {
      const dc = Math.hypot(u - cone.u, v - cone.v) / cone.R;
      if (dc < 1) {
        let ch = peak * Math.pow(1 - dc, 1.2);
        if (dc < 0.15) { ch = peak * Math.pow(0.85, 1.2) - (0.15 - dc) * peak * 1.6; crater = true; }
        h = Math.max(h * 0.5, ch);
      } else h *= 0.5;
    }
    // terraces: flatten into shelves with short cliffs between (rim of the crater excepted)
    if (!crater) { const st = cone ? 6 : 9, t = h / st, f = t - Math.floor(t); h = (Math.floor(t) + smooth(clamp((f - 0.55) / 0.3, 0, 1))) * st; }
    if (L.beach && d > 0.82) h = Math.min(h, 2);
    h = h < 3 ? 2 : Math.round(h / 1.5) * 1.5;
    cells.set(key(i, j), { i, j, u, v, h, d, crater });
  }
  const H = (i, j) => { const c = cells.get(key(i, j)); return c ? c.h : -99; };
  const hot = T.hot;
  for (const c of cells.values()) {
    const n = [H(c.i + 1, c.j), H(c.i - 1, c.j), H(c.i, c.j + 1), H(c.i, c.j - 1)];
    const minN = Math.max(-4, Math.min(...n));
    const capY0 = c.h <= 2 ? -4 : c.h - 2;
    let y = Math.min(capY0, Math.max(-4, minN - 3));
    const sideSkip = (y1) => (n[0] >= y1 ? 1 : 0) | (n[1] >= y1 ? 2 : 0) | (n[2] >= y1 ? 16 : 0) | (n[3] >= y1 ? 32 : 0);
    const wob = noise(c.i * 0.12 + seed, c.j * 0.12);
    while (y < capY0) {
      const y1 = Math.min(capY0, (Math.floor(y / 6) + 1) * 6);
      const band = Math.floor(y / 6);
      const tt = clamp(y / peak + (wob - 0.5) * 0.25, 0, 1);
      let colr = y < 2 ? shade(L.rock[0], 0.75) : shade(tt < 0.5 ? mix(L.rock[0], L.rock[1], tt * 2) : mix(L.rock[1], L.rock[2], tt * 2 - 1), 1.15 + (band % 2) * 0.05);
      lit.box(S, y1 - y, S, colr, c.u, (y + y1) / 2, c.v, { skip: 4 | 8 | sideSkip(y1), jitter: 0.06, ao: y < 3 ? 0.6 : 1 });
      y = y1;
    }
    const patch = fbm(c.u * 0.05 + seed, c.v * 0.05);
    let top = c.h <= 2 ? L.sand : L.top[r() < 0.15 ? Math.floor(r() * 3) : patch < 0.45 ? 0 : patch < 0.6 ? 1 : 2];
    if (L.snow && c.h > peak * L.snowAt) top = L.snow;
    if (c.crater) top = "#1a1214";
    lit.box(S, c.h - capY0, S, shade(top, 0.88), c.u, (capY0 + c.h) / 2, c.v, { skip: 8 | sideSkip(c.h), jitter: 0.08, ao: 1, top: mix(top, "#ffffff", 0.06) });
    if (c.crater) glow.box(S, 0.5, S, hot, c.u, c.h + 0.3, c.v, { glow: 2.3, jitter: 0, ao: 1 });
  }

  // ---- surface detail: pebbles, tufts and boulders ----
  for (const c of cells.values()) {
    if (c.crater || c.h <= 2 || r() > 0.12) continue;
    const big = r() < 0.25, w = big ? 1.4 + r() * 1.2 : 0.6 + r() * 0.6;
    const colr = r() < 0.5 ? L.top[Math.floor(r() * 3)] : shade(L.rock[2], 1.2);
    lit.box(w, big ? w * 0.8 : 0.5, w * (0.7 + r() * 0.5), shade(colr, 0.9 + r() * 0.2), c.u + (r() - 0.5) * (S - w), c.h + (big ? w * 0.4 : 0.25), c.v + (r() - 0.5) * (S - w), { rotY: r() * TAU, skip: 8, jitter: 0.1 });
  }
  // ---- features ----
  const all = [...cells.values()];
  const flat = all.filter((c) => !c.crater && c.h >= 3 && [H(c.i + 1, c.j), H(c.i - 1, c.j), H(c.i, c.j + 1), H(c.i, c.j - 1)].every((h) => h === c.h));
  const shuffled = flat.sort(() => r() - 0.5);
  const used = new Set();
  const take = (f) => { const c = shuffled.find((c) => !used.has(key(c.i, c.j)) && f(c)); if (c) used.add(key(c.i, c.j)); return c; };

  // portal: a stone ring with a swirling element disc, on a terrace facing the ring
  if (L.portal || el === "fire" || el === "ice") {
    const c = take((c) => c.u < -a * 0.15 && c.h >= 6 && Math.abs(c.v) < b * 0.55) || take((c) => c.h >= 3);
    if (c) {
      const R = 5.5, pg = new THREE.Group();
      const pb = new Batch(seed + 9);
      pb.box(4, 1.2, 9, L.rock[2], 0, 0.6, 0, { top: L.top[0] });
      for (let k = 0; k < 18; k++) {
        const an = (k / 18) * TAU;
        pb.box(1.4, 1.9, 1.9, k % 3 ? L.rock[1] : L.rock[2], 0, 1.2 + R + Math.sin(an) * R, Math.cos(an) * R, { rotX: -an, jitter: 0.12 });
      }
      pg.add(pb.mesh(LANDMAT, false));
      const gb = new Batch(seed + 10);
      for (let k = 0; k < 6; k++) { const an = (k / 6) * TAU + 0.3; gb.box(0.5, 0.8, 0.8, T.glow, -0.8, 1.2 + R + Math.sin(an) * (R + 0.2), Math.cos(an) * (R + 0.2), { glow: 2.2, jitter: 0, ao: 1, rotX: -an }); }
      pg.add(gb.mesh(MAT.glow, false));
      const disc = new THREE.Mesh(new THREE.CircleGeometry(R - 0.9, 40), portalMat(el));
      disc.rotation.y = -Math.PI / 2; disc.position.set(0, 1.2 + R, 0);
      pg.add(disc);
      pg.position.set(c.u, c.h, c.v);
      grp.add(pg);
    }
  }
  // lava rivers: from the crater rim downhill to the sea, ending in a lava fall
  if (cone) {
    const rim = all.filter((c) => !c.crater && Math.hypot(c.u - cone.u, c.v - cone.v) / cone.R < 0.24).sort((p, q) => q.h - p.h);
    const starts = [rim[0], rim[Math.floor(rim.length / 3)], rim[Math.floor((rim.length * 2) / 3)]].filter(Boolean);
    for (const s0 of starts) {
      let c = s0;
      for (let step = 0; step < 50 && c; step++) {
        glow.box(S * 0.62, 0.35, S * 0.62, hot, c.u, c.h + 0.2, c.v, { glow: 2.1, jitter: 0, ao: 1 });
        const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([di, dj]) => ({ di, dj, c: cells.get(key(c.i + di, c.j + dj)) }));
        const edge = nb.find((x) => !x.c);
        if (edge) {
          const f = fallMesh("lava", 1.2, c.h + 4, S * 0.7, false);
          f.position.set(c.u + edge.di * S * 0.5, c.h / 2 - 2, c.v + edge.dj * S * 0.5);
          grp.add(f);
          glow.box(S * 1.8, 0.4, S * 1.8, hot, c.u + edge.di * S, 0.1, c.v + edge.dj * S, { glow: 1.8, jitter: 0, ao: 1 });
          break;
        }
        const lower = nb.filter((x) => x.c.h <= c.h).sort((p, q) => p.c.h - q.c.h + (r() - 0.5) * 2)[0];
        if (!lower) break;
        if (lower.c.h < c.h) glow.box(lower.di ? 0.5 : S * 0.6, c.h - lower.c.h, lower.dj ? 0.5 : S * 0.6, hot, c.u + lower.di * S * 0.5, (c.h + lower.c.h) / 2, c.v + lower.dj * S * 0.5, { glow: 2.0, jitter: 0, ao: 1 });
        c = lower.c;
      }
    }
  }
  // waterfalls (or frozen falls) off cliffs on the ring-facing side
  if (L.falls === "water" || L.falls === "ice") {
    const nf = L.nfalls || 1;
    const cand = all.filter((c) => c.u < 0 && c.h >= peak * 0.3).map((c) => {
      const nb = [[-1, 0], [0, 1], [0, -1], [1, 0]].map(([di, dj]) => ({ di, dj, h: H(c.i + di, c.j + dj) }));
      const drop = nb.sort((p, q) => p.h - q.h)[0];
      return { c, drop, dh: c.h - Math.max(0, drop.h) };
    }).filter((x) => x.dh >= 12).sort((p, q) => q.dh - p.dh);
    const placed = [];
    for (const x of cand) {
      if (placed.length >= nf) break;
      if (placed.some((p) => Math.hypot(p.c.u - x.c.u, p.c.v - x.c.v) < 14)) continue;
      placed.push(x);
      const bottom = Math.max(0, x.drop.h);
      const f = fallMesh(L.falls, x.drop.dj ? S * 1.2 : 1.4, x.dh + 0.6, x.drop.di ? S * 1.2 : 1.4, false);
      f.position.set(x.c.u + x.drop.di * S * 0.55, bottom + x.dh / 2, x.c.v + x.drop.dj * S * 0.55);
      grp.add(f);
      // a stream across the top and spray at the foot
      glow.box(S * 0.7, 0.3, S * 0.7, L.falls === "ice" ? "#cfeeff" : "#7fd0ff", x.c.u, x.c.h + 0.18, x.c.v, { glow: 1.25, jitter: 0, ao: 1 });
      for (let k = 0; k < 5; k++) glow.box(1 + r(), 0.8 + r(), 1 + r(), "#e6f6ff", x.c.u + x.drop.di * S * (1 + r()) + (r() - 0.5) * 3, bottom + 0.4 + r(), x.c.v + x.drop.dj * S * (1 + r()) + (r() - 0.5) * 3, { glow: 1.05, jitter: 0.1, ao: 1 });
    }
  }
  // jagged spires (storm, ice, darkness, abnormal): clusters of tapering columns
  if (L.spiky) {
    const nCl = 3 + Math.floor(r() * 2);
    for (let k = 0; k < nCl; k++) {
      const c0 = take((c) => c.h >= 6 && c.d < 0.75); if (!c0) break;
      const nSp = 3 + Math.floor(r() * 4);
      for (let q = 0; q < nSp; q++) {
        const sx = c0.u + (r() - 0.5) * 12, sz = c0.v + (r() - 0.5) * 12;
        const ht = (q === 0 ? 1 : 0.45 + r() * 0.5) * peak * (0.55 + r() * 0.35);
        let w = 4.5 + r() * 2.5, y = c0.h - 3, seg = 0;
        const lean = (r() - 0.5) * 0.08;
        while (y < c0.h + ht && w > 0.6) {
          const sh2 = 3 + r() * 3;
          const tt = (y - c0.h) / ht;
          const colr = L.snow && tt > 0.7 ? L.snow : shade(mix(L.rock[1], L.rock[2], tt), 1.15);
          lit.box(w, sh2, w * (0.85 + r() * 0.2), colr, sx + lean * (y - c0.h), y + sh2 / 2, sz, { rotY: seg * 0.15, jitter: 0.06, ao: 1, skip: 8, top: L.snow && tt > 0.5 ? L.snow : undefined });
          y += sh2; w *= 0.8; seg++;
        }
        if (r() < 0.6) glow.box(0.7, 2.2, 0.7, T.accent, sx + lean * (y - c0.h), y + 0.8, sz, { glow: 2.1, jitter: 0, ao: 1 });
      }
    }
  }
  // element landmark: jungle temple, rune shrine, sun temple, foundry, storm spire
  const lm = take((c) => c.h >= peak * 0.35 && c.u > -a * 0.4) || take(() => true);
  if (lm) {
    const x = lm.u, y = lm.h, z = lm.v;
    if (el === "nature") {
      for (let k = 0; k < 3; k++) lit.box(9 - k * 2.6, 2.4, 9 - k * 2.6, k ? "#5a5040" : "#4a4234", x, y + 1.2 + k * 2.4, z, { top: "#6a7a48" });
      lit.box(1.6, 3, 1.6, "#5a5040", x, y + 8.4, z);
      glow.box(2.2, 2.2, 0.4, T.hot, x - 2.4, y + 3.6, z, { glow: 2.2, jitter: 0, ao: 1, rotY: Math.PI / 2 });
    } else if (el === "darkness" || el === "abnormal") {
      lit.box(3, 11, 2, L.rock[0], x, y + 5.5, z); lit.box(4.4, 1.4, 3, L.rock[1], x, y + 11.4, z);
      glow.box(0.4, 2.4, 2.4, T.hot, x - 1.1, y + 7.5, z, { glow: 2.4, jitter: 0, ao: 1 });
    } else if (el === "light") {
      lit.box(10, 1.2, 10, "#e8dcc0", x, y + 0.6, z);
      for (let k = 0; k < 8; k++) { const an = (k / 8) * TAU; lit.box(1.1, 6, 1.1, "#f4ecd8", x + Math.cos(an) * 4, y + 4, z + Math.sin(an) * 4); }
      lit.box(10, 1, 10, "#d9cba8", x, y + 7.4, z);
      glow.box(2.4, 2.4, 2.4, T.glow, x, y + 9.4, z, { glow: 2.6, jitter: 0, ao: 1, rotY: 0.785, rotX: 0.6 });
    } else if (el === "mech") {
      lit.box(8, 6, 6, "#3a302a", x, y + 3, z); lit.box(2, 10, 2, "#4a3e34", x + 2, y + 7, z + 1.5); lit.box(2, 8, 2, "#4a3e34", x - 2, y + 6, z - 1.5);
      glow.box(0.4, 1.4, 4.6, T.hot, x - 4.1, y + 3.4, z, { glow: 2.2, jitter: 0, ao: 1 });
      glow.box(1.2, 0.6, 1.2, "#ffb15c", x + 2, y + 12.2, z + 1.5, { glow: 2.4, jitter: 0, ao: 1 });
    } else if (el === "storm") {
      lit.box(2.6, 18, 2.6, "#1d2236", x, y + 9, z); lit.box(1.4, 8, 1.4, "#262d48", x, y + 22, z);
      glow.box(1.4, 1.4, 1.4, T.accent, x, y + 26.6, z, { glow: 2.8, jitter: 0, ao: 1, rotY: 0.785, rotX: 0.6 });
    } else if (el === "ice") {
      crystal(glow, x, y, z, 4.2, T.accent, r);
    }
  }
  // flora and crystals
  const fl = L.flora;
  const nFlora = Math.floor(flat.length * (fl === "jungle" ? 0.55 : fl === "pine" ? 0.35 : 0.2));
  for (let k = 0; k < nFlora; k++) {
    const c = take(() => true); if (!c) break;
    const kind = c.h <= 2 ? (L.beach ? "palm" : fl) : fl;
    decorate(kind, lit, glow, c.u + (r() - 0.5) * 1.2, c.h, c.v + (r() - 0.5) * 1.2, 0.85 + r() * 0.5, r, T);
  }
  for (let k = 0; k < (L.crystals || 3); k++) {
    const c = take((c) => c.h >= 6); if (!c) break;
    crystal(glow, c.u, c.h, c.v, 1.2 + r() * 1.8, T.accent, r);
  }
  if (L.beach) for (let k = 0; k < 8; k++) { const c = take((c) => c.h <= 2); if (!c) break; palm(lit, c.u, c.h, c.v, 0.9 + r() * 0.4, r); }

  const m = lit.mesh(LANDMAT, false); grp.add(m);
  if (!glow.empty) grp.add(glow.mesh(MAT.glow, false));
  grp.userData.cells = all;
  return grp;
}

// ---------------------------------------------------------------------------
// FLOATING ISLETS — grassy (or icy, ashen…) tops with stepped rock undersides, roots and crystals hanging
// ---------------------------------------------------------------------------
const FLOAT_KIND = { fire: "ember", ice: "pine", nature: "jungle", storm: "rods", light: "gold", darkness: "shadow", mech: "ruin", abnormal: "weird" };
function buildFloater(el, s, seed) {
  const L = LAND[el], T = THEMES[el], r = rng(seed);
  const lit = new Batch(seed), glow = new Batch(seed + 1), grp = new THREE.Group();
  const Q = 2, cells = new Map(), key = (i, j) => i * 512 + j;
  const N = Math.ceil(s / Q) + 1;
  for (let i = -N; i <= N; i++) for (let j = -N; j <= N; j++) {
    const u = i * Q, v = j * Q;
    const d = Math.hypot(u, v) / s + (fbm(u * 0.12 + seed, v * 0.12) - 0.5) * 0.45;
    if (d >= 1) continue;
    const top = d < 0.35 ? 2 : d < 0.7 ? 1 : 0;
    const dep = Math.round((s * 1.5 * Math.pow(1 - d, 0.8) * (0.65 + 0.7 * fbm(u * 0.2, v * 0.2 + seed)) + 1.5) / 1.5) * 1.5;
    cells.set(key(i, j), { i, j, u, v, top, dep, d });
  }
  const get = (i, j) => cells.get(key(i, j));
  for (const c of cells.values()) {
    const nb = [get(c.i + 1, c.j), get(c.i - 1, c.j), get(c.i, c.j + 1), get(c.i, c.j - 1)];
    const hid = (y0, y1) => nb.map((n) => n && n.top >= y1 && -n.dep <= y0);
    const skip = (y0, y1) => { const h = hid(y0, y1); return (h[0] ? 1 : 0) | (h[1] ? 2 : 0) | (h[2] ? 16 : 0) | (h[3] ? 32 : 0); };
    // top cap
    const g = L.top[Math.floor(noise(c.i * 0.5 + seed, c.j * 0.5) * 3) % 3];
    lit.box(Q, 1, Q, g, c.u, c.top - 0.5, c.v, { skip: 8 | skip(c.top - 1, c.top), jitter: 0.12, top: mix(g, "#ffffff", 0.1), ao: 0.9 });
    // underside bands, darkening with depth
    let y = c.top - 1, k = 0;
    while (y > -c.dep) {
      const y0 = Math.max(-c.dep, y - 2);
      const colr = k === 0 ? L.rock[2] : k < 3 ? L.rock[1] : L.rock[0];
      lit.box(Q * (k > 3 ? 0.92 : 1), y - y0, Q * (k > 3 ? 0.92 : 1), shade(colr, 1 - Math.min(0.45, k * 0.06)), c.u, (y + y0) / 2, c.v, { skip: 4 | skip(y0, y), jitter: 0.08, ao: 0.95 });
      y = y0; k++;
    }
  }
  const list = [...cells.values()];
  // hanging roots / crystal tips
  const crystally = el === "ice" || el === "darkness" || el === "abnormal" || el === "storm";
  const deepest = list.slice().sort((p, q) => q.dep - p.dep);
  if (crystally) for (let k = 0; k < 3 && k < deepest.length; k++) { const c = deepest[k * 2] || deepest[0]; glow.box(0.9, 3 + r() * 3, 0.9, T.accent, c.u, -c.dep - 1.6, c.v, { glow: 2.0, jitter: 0, ao: 1, rotZ: (r() - 0.5) * 0.3 }); }
  const edge = list.filter((c) => c.d > 0.7);
  for (let k = 0; k < Math.min(10, edge.length) && !crystally; k++) {
    const c = edge[Math.floor(r() * edge.length)], len = 2 + r() * 5;
    lit.box(0.35, len, 0.35, el === "nature" || el === "light" ? "#3f6e2a" : "#4a3a2c", c.u, -c.dep * 0.3 - len / 2, c.v, { jitter: 0.2 });
  }
  // top decor
  const tops = list.filter((c) => c.d < 0.6).sort(() => r() - 0.5);
  const nDec = Math.max(1, Math.floor(tops.length * 0.18));
  for (let k = 0; k < nDec && k < tops.length; k++) decorate(k === 0 && r() < 0.4 ? "crystal" : FLOAT_KIND[el], lit, glow, tops[k].u, tops[k].top, tops[k].v, 0.8 + r() * 0.3, r, T);
  // a waterfall pouring off the edge into the air
  if ((el === "nature" || el === "light" || el === "ice" || el === "storm") && r() < 0.5 && edge.length) {
    const c = edge.sort((p, q) => q.d - p.d)[0];
    const dir = Math.atan2(c.v, c.u);
    const f = fallMesh("water", 1.4, 34, 1.4, true);
    f.position.set(c.u + Math.cos(dir) * 1.2, c.top - 17, c.v + Math.sin(dir) * 1.2);
    grp.add(f);
  } else if (el === "fire" && edge.length && r() < 0.6) {
    const c = edge[0];
    const f = fallMesh("lava", 1.0, 22, 1.0, true);
    f.position.set(c.u * 1.05, c.top - 11, c.v * 1.05);
    grp.add(f);
  }
  grp.add(lit.mesh(LANDMAT, false));
  if (!glow.empty) grp.add(glow.mesh(MAT.glow, false));
  return grp;
}

// sea stacks: rugged rock clusters standing in the water, mossy (or snowy, ashen…) on top
const MOSS = { fire: "#4a3a34", ice: "#e4f2ff", darkness: "#4b3b63", abnormal: "#a8478f", storm: "#56628f" };
function addStack(lit, glow, el, x, z, s, h, r) {
  const L = LAND[el], T = THEMES[el];
  const parts = [[0, 0, s, h], [s * 0.45 * (r() < 0.5 ? 1 : -1), s * 0.35 * (r() - 0.5), s * 0.6, h * (0.45 + r() * 0.3)]];
  if (r() < 0.5) parts.push([-s * 0.4, s * 0.45, s * 0.45, h * (0.3 + r() * 0.3)]);
  lit.push(x, 0, z, r() * TAU, 0, 0, 1);
  for (const [ox, oz, w0, hh] of parts) {
    let y = -4, k = 0;
    const H = Math.max(3, Math.round(hh / 2) * 2);
    while (y < H) {
      const y1 = Math.min(H, y + 3 + Math.floor(r() * 3)), last = y1 >= H;
      const w = w0 * (1 - (y / H) * 0.25) * (0.88 + r() * 0.2);
      const colr = y < 1 ? shade(L.rock[0], 0.7) : shade(L.rock[(k + 1) % 3], 1.2);
      lit.box(w, y1 - y, w * (0.8 + r() * 0.35), colr, ox + (r() - 0.5) * 0.5, (y + y1) / 2, oz + (r() - 0.5) * 0.5, { skip: 8 | (last ? 0 : 4), jitter: 0.08, ao: y < 1 ? 0.6 : 1 });
      y = y1; k++;
    }
    const moss = MOSS[el] || (r() < 0.5 ? "#4a8f3a" : "#58a043");
    lit.box(w0 * 0.95, 0.8, w0 * 0.85, moss, ox, H + 0.4, oz, { top: mix(moss, "#ffffff", 0.12), jitter: 0.1 });
  }
  lit.pop();
  const kind = r();
  if (kind < 0.5) decorate(LAND[el].beach || el === "fire" || r() < 0.4 ? "palm" : FLOAT_KIND[el], lit, glow, x, h + 0.8, z, 0.85, r, T);
  else if (kind < 0.8) crystal(glow, x, h + 0.8, z, 0.7 + r() * 0.6, T.accent, r);
}

// ---------------------------------------------------------------------------
// THE SEA — currents spiralling into the whirlpool, shallows, foam and ripples around every coast,
// soft shadows of everything floating above (from a baked mask texture)
// ---------------------------------------------------------------------------
const MASK_N = 512;
function buildSea() {
  const mask = new THREE.DataTexture(new Uint8Array(MASK_N * MASK_N * 4), MASK_N, MASK_N);
  mask.magFilter = THREE.LinearFilter; mask.minFilter = THREE.LinearFilter; mask.needsUpdate = true;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: TIME, uMask: { value: mask }, uMO: { value: new THREE.Vector2() }, uME: { value: 600 }, uMD: { value: 24 },
      uC: { value: new THREE.Vector2() }, uR: { value: 80 }, uVR: { value: 10 }, uWarm: { value: 0 },
      uDeep: { value: col("#03123e").clone() }, uSea: { value: col("#0c3d98").clone() }, uShal: { value: col("#2391e0").clone() },
      uCur: { value: col("#3fb2ff").clone() }, uFoam: { value: col("#d8f1ff").clone() }, uHaze: { value: col(FOG).clone() },
    },
    vertexShader: "varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }",
    fragmentShader: GLSL_NOISE + /* glsl */`
      uniform sampler2D uMask; uniform vec2 uMO, uC; uniform float uME, uMD, uTime, uR, uVR, uWarm;
      uniform vec3 uDeep, uSea, uShal, uCur, uFoam, uHaze; varying vec3 vW;
      void main(){
        vec2 p = vW.xz;
        vec2 muv = (p - uMO)/uME + 0.5;
        vec4 m = texture2D(uMask, muv);
        float inside = step(0.0, muv.x)*step(muv.x, 1.0)*step(0.0, muv.y)*step(muv.y, 1.0);
        float d = mix(uMD, m.r*uMD, inside);      // distance to the nearest coast (world units)
        float sh = m.g*inside;                    // shadow of things floating above
        vec2 q0 = p - uC; float rr = length(q0);
        // the sea turns slowly around the whirlpool, faster near it
        float ang = uTime*0.02 + 30.0/(rr*0.045 + 1.0)*0.16;
        float cs = cos(ang), sn = sin(ang);
        vec2 q = vec2(cs*q0.x - sn*q0.y, sn*q0.x + cs*q0.y);
        vec2 w = q*0.010 + vec2(fbm(q*0.008 + uTime*0.006), fbm(q*0.008 - 3.1))*1.6;
        float sw = fbm(w*2.2);
        vec3 c = mix(uDeep, uSea, smoothstep(0.15, 1.0, sw)*0.85);
        // glowing current veins
        float v1 = 1.0 - abs(fbm(w*3.0 + 5.0)*2.0 - 1.0);
        float v2 = 1.0 - abs(fbm(w*5.6 - 2.0 + uTime*0.01)*2.0 - 1.0);
        c += uCur * (pow(v1, 90.0)*1.0 + pow(v2, 140.0)*0.55) * (0.6 + 0.4*sin(uTime*0.7 + sw*12.0));
        // spiral arms of the whirlpool, braided by noise
        float th = atan(q0.y, q0.x);
        float arm = sin(th*3.0 + log(rr + 1.0)*5.5 - uTime*0.55);
        float brk = smoothstep(0.35, 0.75, fbm(vec2(th*2.0, rr*0.05 - uTime*0.08)));
        c += uCur * smoothstep(0.93, 1.0, arm) * brk * exp(-rr/(uR*0.9)) * 1.3;
        c += uShal * exp(-rr/(uVR*2.2)) * 0.9 + uCur * exp(-rr/(uVR*0.9)) * 0.8;
        // shallows, ripples and foam around coasts
        float shal = smoothstep(16.0, 0.0, d);
        c = mix(c, uShal*(0.75 + 0.35*fbm(p*0.08 + uTime*0.03)), shal*0.62);
        float caus = pow(1.0 - abs(fbm(p*0.16 + vec2(uTime*0.05, -uTime*0.04))*2.0 - 1.0), 10.0);
        c += uFoam * caus * shal * 0.25;
        float rip = pow(0.5 + 0.5*cos((d/3.6 - uTime*0.35)*6.2832), 10.0) * exp(-d*0.24) * step(1.2, d) * smoothstep(0.3, 0.7, n2(p*0.07 + uTime*0.02));
        c += uCur * rip * 0.3;
        float foam = smoothstep(2.6, 0.4, d + (n2(p*0.6 + uTime*0.4) - 0.5)*1.6) * step(0.05, d);
        c = mix(c, uFoam, foam*0.85);
        // glints
        vec2 sp = floor(p*0.9);
        c += uFoam * step(0.9985, h21(sp)) * (0.5 + 0.5*sin(uTime*2.5 + h21(sp + 3.0)*20.0)) * 0.9;
        c *= 1.0 - sh*0.5;
        c = mix(c, c*vec3(1.5,0.65,0.45) + vec3(0.12,0.02,0.0), uWarm*exp(-rr/(uR*0.9)));
        // haze into the distance
        c = mix(c, uHaze, smoothstep(uR*2.4, uR*5.0, rr));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000, 1, 1), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = SEA_Y;
  m.renderOrder = -5;
  m.frustumCulled = false;
  return m;
}

// coast distance (R) + floating-shadow (G) mask, baked on the CPU
function bakeMask(sea, O, E, land, shadows) {
  const N = MASK_N, tex = sea.material.uniforms.uMask.value, data = tex.image.data;
  const px = E / N, INF = 1e9;
  const dist = new Float32Array(N * N).fill(INF), shd = new Float32Array(N * N);
  const toI = (x) => Math.floor((x - (O.x - E / 2)) / px), toJ = (z) => Math.floor((z - (O.y - E / 2)) / px);
  const stampDisc = (arr, x, z, rad, val) => {
    const i0 = Math.max(0, toI(x - rad)), i1 = Math.min(N - 1, toI(x + rad)), j0 = Math.max(0, toJ(z - rad)), j1 = Math.min(N - 1, toJ(z + rad));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const wx = O.x - E / 2 + (i + 0.5) * px, wz = O.y - E / 2 + (j + 0.5) * px;
      if ((wx - x) ** 2 + (wz - z) ** 2 <= rad * rad) arr[j * N + i] = val === undefined ? 0 : Math.max(arr[j * N + i], val);
    }
  };
  for (const l of land) stampDisc(dist, l[0], l[1], l[2]);
  // two-pass chamfer distance transform (texels)
  const D1 = 1, D2 = 1.4142;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i; let v = dist[k];
    if (i > 0) v = Math.min(v, dist[k - 1] + D1);
    if (j > 0) { v = Math.min(v, dist[k - N] + D1); if (i > 0) v = Math.min(v, dist[k - N - 1] + D2); if (i < N - 1) v = Math.min(v, dist[k - N + 1] + D2); }
    dist[k] = v;
  }
  for (let j = N - 1; j >= 0; j--) for (let i = N - 1; i >= 0; i--) {
    const k = j * N + i; let v = dist[k];
    if (i < N - 1) v = Math.min(v, dist[k + 1] + D1);
    if (j < N - 1) { v = Math.min(v, dist[k + N] + D1); if (i < N - 1) v = Math.min(v, dist[k + N + 1] + D2); if (i > 0) v = Math.min(v, dist[k + N - 1] + D2); }
    dist[k] = v;
  }
  for (const s of shadows) {
    if (s.rect) {
      const { x, z, hw, hl, th } = s, cs = Math.cos(th), sn = Math.sin(th), rad = Math.hypot(hw, hl);
      const i0 = Math.max(0, toI(x - rad)), i1 = Math.min(N - 1, toI(x + rad)), j0 = Math.max(0, toJ(z - rad)), j1 = Math.min(N - 1, toJ(z + rad));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const dx = O.x - E / 2 + (i + 0.5) * px - x, dz = O.y - E / 2 + (j + 0.5) * px - z;
        const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
        if (Math.abs(lx) <= hw && Math.abs(lz) <= hl) shd[j * N + i] = Math.max(shd[j * N + i], s.k);
      }
    } else stampDisc(shd, s.x, s.z, s.r, s.k);
  }
  // soften the shadows: separable box blur, twice
  const tmp = new Float32Array(N * N), B = 9;
  for (let pass = 0; pass < 2; pass++) {
    for (let j = 0; j < N; j++) { let acc = 0; for (let i = -B; i <= B; i++) acc += shd[j * N + clamp(i, 0, N - 1)]; for (let i = 0; i < N; i++) { tmp[j * N + i] = acc / (2 * B + 1); acc += shd[j * N + Math.min(N - 1, i + B + 1)] - shd[j * N + Math.max(0, i - B)]; } }
    for (let i = 0; i < N; i++) { let acc = 0; for (let j = -B; j <= B; j++) acc += tmp[clamp(j, 0, N - 1) * N + i]; for (let j = 0; j < N; j++) { shd[j * N + i] = acc / (2 * B + 1); acc += tmp[Math.min(N - 1, j + B + 1) * N + i] - tmp[Math.max(0, j - B) * N + i]; } }
  }
  const MD = sea.material.uniforms.uMD.value;
  for (let k = 0; k < N * N; k++) {
    data[k * 4] = Math.min(255, Math.round((Math.min(MD, dist[k] * px) / MD) * 255));
    data[k * 4 + 1] = Math.min(255, Math.round(shd[k] * 255));
    data[k * 4 + 2] = 0; data[k * 4 + 3] = 255;
  }
  tex.needsUpdate = true;
  sea.material.uniforms.uMO.value.copy(O);
  sea.material.uniforms.uME.value = E;
}

// ---------------------------------------------------------------------------
// atmosphere: mist and cloud layers, the energy beam under the vortex, drifting motes
// ---------------------------------------------------------------------------
function mistLayer(y, color, opacity, inner, outer, scale, seed) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: TIME, uC: { value: new THREE.Vector2() }, uIn: { value: inner }, uOut: { value: outer }, uK: { value: opacity }, uS: { value: scale }, uSeed: { value: seed }, uCol: { value: col(color).clone() } },
    vertexShader: "varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }",
    fragmentShader: GLSL_NOISE + /* glsl */`
      uniform float uTime, uIn, uOut, uK, uS, uSeed; uniform vec2 uC; uniform vec3 uCol; varying vec3 vW;
      void main(){
        vec2 p = vW.xz;
        float n = fbm(p*uS + vec2(uTime*0.012, uSeed) + fbm(p*uS*0.5 - uTime*0.008)*1.2);
        float e = smoothstep(uIn, uOut, length(p - uC));
        float a = smoothstep(0.42, 0.78, n) * e * uK;
        vec3 c = uCol * (0.75 + 0.5*smoothstep(0.5, 0.9, n));
        gl_FragColor = vec4(c, a);
      }`,
    transparent: true, depthWrite: false,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000, 1, 1), mat);
  m.rotation.x = -Math.PI / 2; m.position.y = y; m.frustumCulled = false; m.renderOrder = 4;
  return m;
}
function beamMesh(h, r) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: TIME, uC: { value: col("#4fb4ff").clone() }, uWarm: { value: 0 } },
    vertexShader: VUV, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    fragmentShader: GLSL_NOISE + /* glsl */`
      uniform float uTime, uWarm; uniform vec3 uC; varying vec2 vUv;
      void main(){
        float n = n2(vec2(vUv.x*14.0, vUv.y*4.0 - uTime*0.9))*0.6 + n2(vec2(vUv.x*33.0, vUv.y*9.0 - uTime*1.6))*0.4;
        float a = (0.12 + 0.55*pow(n, 2.0)) * smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.75, vUv.y);
        vec3 c = mix(uC, vec3(1.0, 0.45, 0.2), uWarm);
        gl_FragColor = vec4(c*a*1.4, a);
      }`,
  });
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 1.6, h, 40, 1, true), mat);
  m.renderOrder = 5;
  return m;
}
function buildMotes(count, R, cx, cz, r) {
  const pos = new Float32Array(count * 3), colr = new Float32Array(count * 3), ph = new Float32Array(count);
  const tints = ["#5fc8ff", "#9fdcff", "#b98cff", "#7fffd0", "#ffd27a"].map((h) => col(h));
  for (let i = 0; i < count; i++) {
    const a = r() * TAU, d = R * (0.3 + r() * 2.4);
    pos[i * 3] = cx + Math.cos(a) * d; pos[i * 3 + 1] = SEA_Y + 6 + r() * 100; pos[i * 3 + 2] = cz + Math.sin(a) * d;
    const t = tints[Math.floor(r() * (r() < 0.7 ? 2 : tints.length))];
    colr[i * 3] = t.r; colr[i * 3 + 1] = t.g; colr[i * 3 + 2] = t.b; ph[i] = r() * 100;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(colr, 3));
  g.setAttribute("ph", new THREE.BufferAttribute(ph, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: TIME, uSize: { value: 4 * Math.min(2, (typeof devicePixelRatio !== "undefined" && devicePixelRatio) || 1) } },
    vertexShader: /* glsl */`
      uniform float uTime, uSize; attribute vec3 color; attribute float ph; varying vec3 vC; varying float vA;
      void main(){
        vec3 p = position + vec3(sin(uTime*0.21 + ph)*3.0, mod(uTime*1.2 + ph*7.0, 30.0) - 15.0, cos(uTime*0.17 + ph*1.3)*3.0);
        vA = (0.5 + 0.5*sin(uTime*1.7 + ph*3.0)) * smoothstep(15.0, 10.0, abs(mod(uTime*1.2 + ph*7.0, 30.0) - 15.0));
        vC = color;
        gl_PointSize = uSize * (0.6 + 0.6*fract(ph));
        gl_Position = projectionMatrix*viewMatrix*modelMatrix*vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vC; varying float vA;
      void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * vA; gl_FragColor = vec4(vC*a*1.8, a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const p = new THREE.Points(g, mat);
  p.frustumCulled = false; p.renderOrder = 6;
  return p;
}

// ---------------------------------------------------------------------------
// THE BACKDROP
// ---------------------------------------------------------------------------
function disposeTree(o) { o.traverse((n) => { if (n.geometry) n.geometry.dispose(); }); }

export function createBackdrop(scene, DB) {
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog("#0e2a6a", 700, 1250);
  const sea = buildSea();
  scene.add(sea);
  let built = null, key = "";
  const floaters = [];
  let mistLow = null, mistHigh = null, mistHigh2 = null, beam = null, motes = null;

  function build(L, dims) {
    const b = L.bounds;
    const R = Math.max(b.x1 - b.x0, b.z1 - b.z0) / 2;
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    const vx = L.vortex.x, vz = L.vortex.z;
    sea.material.uniforms.uC.value.set(vx, vz);
    sea.material.uniforms.uR.value = R;
    sea.material.uniforms.uVR.value = L.vortex.r;
    const k = [L.n, Math.round(R), Math.round(cx), Math.round(cz)].join("|");
    // the ring's own footprint: corridor islands, gates and the vortex (for shadows and clearances)
    const ringPts = [];
    for (const c of L.corridors) {
      const cs = Math.cos(c.theta), sn = Math.sin(c.theta);
      for (const [lx, lz] of [[-dims.hw, -dims.hl], [dims.hw, -dims.hl], [dims.hw, dims.hl], [-dims.hw, dims.hl]]) ringPts.push([c.x + lx * cs + lz * sn, c.z - lx * sn + lz * cs]);
    }
    for (const g of L.gates) ringPts.push([g.x, g.z]);
    const support = (ux, uz) => Math.max(...ringPts.map((p) => (p[0] - cx) * ux + (p[1] - cz) * uz));
    if (k !== key) {
      if (built) { scene.remove(built); disposeTree(built); }
      floaters.length = 0;
      key = k;
      const root = new THREE.Group();
      const r = rng(4242 + L.n);
      const land = [];           // coast discs for the mask: [x, z, r]
      const shadows = [];        // floating things: {x, z, r, k} or {rect...}
      // --- elemental landmasses ---
      const rad = clamp(R * 0.55, 38, 70);
      const masses = [];
      for (const el of DB.ELEMENT_ORDER) {
        if (!LAND[el]) continue;
        const an = (PLACE[el] * Math.PI) / 180, ux = Math.cos(an), uz = Math.sin(an);
        const a = rad * (0.62 + r() * 0.12), bb = rad * (0.95 + r() * 0.25);
        const dist = support(ux, uz) + a * 0.9 + 60 + Math.max(0, -uz) * 30;
        const x = cx + ux * dist, z = cz + uz * dist;
        const g = buildLandmass(el, a, bb, 100 + masses.length * 37);
        const th = Math.atan2(-uz, ux);
        g.position.set(x, SEA_Y, z); g.rotation.y = th;
        root.add(g);
        const cs = Math.cos(th), sn = Math.sin(th);
        for (const c of g.userData.cells) land.push([x + c.u * cs + c.v * sn, z - c.u * sn + c.v * cs, S * 0.78]);
        masses.push({ x, z, rx: a, ry: bb, th });
        delete g.userData.cells;
      }
      const inMass = (x, z, pad) => masses.some((m) => { const dx = x - m.x, dz = z - m.z, cs = Math.cos(m.th), sn = Math.sin(m.th); const lu = dx * cs - dz * sn, lv = dx * sn + dz * cs; return (lu / (m.rx + pad)) ** 2 + (lv / (m.ry + pad)) ** 2 < 1; });
      const ringDist = (x, z) => { const dx = x - cx, dz = z - cz, l = Math.hypot(dx, dz) || 1; return l - support(dx / l, dz / l); };
      // --- sea stacks ---
      const sl = new Batch(77), sg = new Batch(78);
      const els = DB.ELEMENT_ORDER;
      for (let i = 0, tries = 0; i < 70 && tries < 2000; tries++) {
        const a = r() * TAU, d = R * (0.15 + r() * 2.6);
        const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, s = 4.5 + r() * 6;
        if (inMass(x, z, s + 4) || land.length && false) continue;
        if (Math.hypot(x - vx, z - vz) < L.vortex.r * 3.2) continue;
        const rd = ringDist(x, z);
        if (rd > -14 && rd < 14) continue;
        if (rd < 0 && r() < 0.7) continue;
        const h = rd < 0 ? 3 + r() * 5 : 5 + r() * (rd > 40 ? 20 : 11);
        // nearest landmass decides the theme
        let el = els[i % els.length], best = 1e9;
        for (const e of els) { const an = (PLACE[e] * Math.PI) / 180, dd = (Math.cos(an) - Math.cos(a)) ** 2 + (Math.sin(an) - Math.sin(a)) ** 2; if (dd < best) { best = dd; el = e; } }
        addStack(sl, sg, el, x, z, s, h, r);
        land.push([x, z, s * 0.55]);
        i++;
      }
      const stacks = new THREE.Group();
      stacks.position.y = SEA_Y;
      stacks.add(sl.mesh(LANDMAT, false)); if (!sg.empty) stacks.add(sg.mesh(MAT.glow, false));
      root.add(stacks);
      // --- floating islets ---
      for (let i = 0, tries = 0; i < 22 && tries < 2000; tries++) {
        const a = r() * TAU, l = R * (0.9 + r() * 1.9);
        const x = cx + Math.cos(a) * l, z = cz + Math.sin(a) * l;
        const rd = ringDist(x, z);
        if (rd < 24) continue;
        const s = 5 + r() * (rd > 50 ? 11 : 6);
        if (floaters.some((f) => Math.hypot(f.x - x, f.z - z) < f.s + s + 10)) continue;
        const y = rd < 60 ? -16 - r() * 40 : -30 + r() * 38;
        if (inMass(x, z, 6) && y < -45) continue;
        let el = els[Math.floor(r() * els.length)], best = 1e9;
        for (const e of els) { const an = (PLACE[e] * Math.PI) / 180, dd = (Math.cos(an) - Math.cos(a)) ** 2 + (Math.sin(an) - Math.sin(a)) ** 2; if (dd < best) { best = dd; el = e; } }
        const rr = r(); if (rr < 0.35) el = "nature"; else if (rr < 0.45) el = "light"; else if (rr < 0.55) el = els[Math.floor(r() * els.length)];
        const g = buildFloater(el, s, 500 + i * 13);
        g.position.set(x, y, z); g.rotation.y = r() * TAU;
        root.add(g);
        floaters.push({ g, x, z, y, s, ph: r() * TAU, sp: 0.25 + r() * 0.25 });
        const hgt = y - SEA_Y;
        shadows.push({ x: x + hgt * 0.42, z: z - hgt * 0.33, r: s * 0.9, k: 0.55 });
        i++;
      }
      built = root;
      scene.add(root);
      // ring shadows (corridor islands, gates, vortex) far below on the water
      const off = (0 - SEA_Y);
      for (const c of L.corridors) shadows.push({ rect: true, x: c.x + off * 0.42, z: c.z - off * 0.33, hw: dims.hw, hl: dims.hl, th: c.theta, k: 0.4 });
      for (const g of L.gates) shadows.push({ x: g.x + off * 0.42, z: g.z - off * 0.33, r: 7, k: 0.35 });
      shadows.push({ x: vx + off * 0.42, z: vz - off * 0.33, r: L.vortex.r + 4, k: 0.5 });
      const E = R * 6.4 + 120;
      bakeMask(sea, new THREE.Vector2(cx, cz), E, land, shadows);
      // atmosphere
      for (const o of [mistLow, mistHigh, mistHigh2, beam, motes]) if (o) { scene.remove(o); o.geometry.dispose(); o.material.dispose(); }
      mistLow = mistLayer(SEA_Y + 16, "#3f5cb8", 0.22, R * 0.9, R * 2.0, 0.014, 3.1);
      mistHigh2 = mistLayer(-30, "#3a4290", 0.55, R * 2.3, R * 3.4, 0.008, 7.7);
      mistHigh = mistLayer(-27, "#aeb8e8", 0.7, R * 2.4, R * 3.6, 0.008, 7.9);
      for (const m of [mistLow, mistHigh, mistHigh2]) { m.material.uniforms.uC.value.set(cx, cz); scene.add(m); }
      beam = beamMesh(-4 - SEA_Y, L.vortex.r);
      beam.position.set(vx, (SEA_Y - 4) / 2, vz);
      scene.add(beam);
      motes = buildMotes(520, R, cx, cz, r);
      scene.add(motes);
    }
  }

  return {
    sea,
    build,
    update(dt, t, warm) {
      for (const f of floaters) { f.g.position.y = f.y + Math.sin(t * f.sp + f.ph) * 1.2; f.g.rotation.z = Math.sin(t * f.sp * 0.7 + f.ph) * 0.012; }
      const U = sea.material.uniforms;
      U.uWarm.value += ((warm ? 1 : 0) - U.uWarm.value) * Math.min(1, dt * 2);
      if (beam) beam.material.uniforms.uWarm.value = U.uWarm.value;
    },
  };
}
