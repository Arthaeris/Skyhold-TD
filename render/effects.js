/* Skyhold TD — render/effects.js
   Everything short-lived or overlaid: sparks (soft additive points), voxel debris, projectiles, beam and
   chain-lightning streaks, impact/pulse rings, enemy HP bars and origin rings, the route chevrons, and the
   build / range previews. All pooled and instanced so a busy wave stays at a handful of draw calls.
   Purely cosmetic: nothing here reads back into the simulation. */
import * as THREE from "three";
import { dotTexture, TAU, col } from "./kit.js";

const V = new THREE.Vector3(), V2 = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), M = new THREE.Matrix4(), C = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0), ZAX = new THREE.Vector3(0, 0, 1);

// ---------------------------------------------------------------------------
// SPARKS — soft glowing points (Riftfall's particle system, sized for an orthographic camera)
// ---------------------------------------------------------------------------
export function createSparks(scene, max = 900) {
  const pos = new Float32Array(max * 3), colr = new Float32Array(max * 3), size = new Float32Array(max), alpha = new Float32Array(max);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(colr, 3));
  g.setAttribute("size", new THREE.BufferAttribute(size, 1));
  g.setAttribute("alpha", new THREE.BufferAttribute(alpha, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTex: { value: dotTexture() }, uScale: { value: 20 }, uPersp: { value: 0 } },
    vertexShader: "attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA; uniform float uScale; uniform float uPersp; void main() { vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * uScale / mix(1.0, max(0.5, -mv.z), uPersp); gl_Position = projectionMatrix * mv; }",
    fragmentShader: "uniform sampler2D uTex; varying vec3 vC; varying float vA; void main() { float a = texture2D(uTex, gl_PointCoord).a * vA; if (a < 0.01) discard; gl_FragColor = vec4(vC * a, a); }",
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 10;
  scene.add(pts);
  const P = [];
  for (let i = 0; i < max; i++) P.push({ t: 1, max: 0 });
  let head = 0;
  return {
    mat,
    spawn(o) {
      const p = P[head]; head = (head + 1) % max;
      p.x = o.x; p.y = o.y; p.z = o.z;
      p.vx = o.vx || 0; p.vy = o.vy || 0; p.vz = o.vz || 0;
      p.drag = o.drag == null ? 2 : o.drag; p.grav = o.grav || 0; p.size = o.size || 0.3; p.glow = o.glow || 2; p.flicker = o.flicker || 0;
      p.t = 0; p.max = o.life || 0.6;
      p.c = (p.c || new THREE.Color()).set(o.color || "#ffffff");
      return p;
    },
    burst(x, y, z, color, n = 10, speed = 4, life = 0.5, size = 0.35, grav = 4) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU, up = Math.random();
        this.spawn({ x, y, z, vx: Math.cos(a) * speed * (0.4 + Math.random() * 0.6), vy: up * speed, vz: Math.sin(a) * speed * (0.4 + Math.random() * 0.6), color, life: life * (0.6 + Math.random() * 0.6), size: size * (0.6 + Math.random() * 0.7), grav, drag: 2.5 });
      }
    },
    update(dt) {
      for (let i = 0; i < max; i++) {
        const p = P[i];
        if (p.t < p.max) {
          p.t += dt;
          const k = Math.exp(-p.drag * dt);
          p.vx *= k; p.vz *= k; p.vy = p.vy * k - p.grav * dt;
          p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          const f = p.t / p.max;
          const a = (f < 0.15 ? f / 0.15 : 1 - (f - 0.15) / 0.85) * (p.flicker ? 0.6 + 0.4 * Math.sin(p.t * 30 + i) : 1);
          pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
          colr[i * 3] = p.c.r * p.glow; colr[i * 3 + 1] = p.c.g * p.glow; colr[i * 3 + 2] = p.c.b * p.glow;
          size[i] = p.size * (1 - f * 0.5);
          alpha[i] = Math.max(0, a);
        } else alpha[i] = 0;
      }
      g.attributes.position.needsUpdate = true;
      g.attributes.color.needsUpdate = true;
      g.attributes.size.needsUpdate = true;
      g.attributes.alpha.needsUpdate = true;
    },
  };
}

// ---------------------------------------------------------------------------
// BITS — tumbling voxel debris (enemy deaths, tower builds and sales)
// ---------------------------------------------------------------------------
export function createBits(scene, max = 400) {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, max);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false; mesh.castShadow = false; mesh.count = max;
  mesh.setColorAt(0, new THREE.Color(1, 1, 1));
  scene.add(mesh);
  const P = []; for (let i = 0; i < max; i++) P.push({ t: 1, max: 0 });
  let head = 0;
  const E = new THREE.Euler();
  const hide = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < max; i++) mesh.setMatrixAt(i, hide);
  return {
    burst(x, y, z, color, n = 8, speed = 4, size = 0.18, floorY = -0.05) {
      for (let k = 0; k < n; k++) {
        const p = P[head]; const i = head; head = (head + 1) % max;
        const a = Math.random() * TAU;
        Object.assign(p, { x, y, z, vx: Math.cos(a) * speed * Math.random(), vy: 2 + Math.random() * speed, vz: Math.sin(a) * speed * Math.random(), rx: Math.random() * 6, ry: Math.random() * 6, s: size * (0.5 + Math.random()), t: 0, max: 0.9 + Math.random() * 0.6, floor: floorY });
        mesh.setColorAt(i, C.set(color).multiplyScalar(0.8 + Math.random() * 0.4));
      }
      mesh.instanceColor.needsUpdate = true;
    },
    update(dt) {
      for (let i = 0; i < max; i++) {
        const p = P[i];
        if (p.t >= p.max) continue;
        p.t += dt;
        p.vy -= 18 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.y < p.floor) { p.y = p.floor; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
        p.rx += dt * 8; p.ry += dt * 6;
        const f = p.t >= p.max ? 0 : Math.min(1, (p.max - p.t) * 3);
        M.compose(V.set(p.x, p.y, p.z), Q.setFromEuler(E.set(p.rx, p.ry, 0)), S.setScalar(p.s * f));
        mesh.setMatrixAt(i, M);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

// ---------------------------------------------------------------------------
// STREAKS — glowing segments for beams, chain lightning, projectile trails, transfer arcs
// ---------------------------------------------------------------------------
export function createStreaks(scene, max = 500) {
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, max);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false; mesh.renderOrder = 9;
  mesh.setColorAt(0, new THREE.Color(1, 1, 1)); mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);
  const P = []; for (let i = 0; i < max; i++) P.push({ t: 1, max: 0, a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Color() });
  let head = 0;
  return {
    add(a, b, color, width = 0.18, life = 0.14, glow = 2.2) {
      const p = P[head]; head = (head + 1) % max;
      p.a.copy(a); p.b.copy(b); p.c.set(color).multiplyScalar(glow); p.w = width; p.t = 0; p.max = life;
    },
    // a jagged lightning bolt from a to b
    bolt(a, b, color, width = 0.14, life = 0.16, segs = 4) {
      let prev = V2.copy(a).clone();
      for (let i = 1; i <= segs; i++) {
        const t = i / segs;
        const p = V.copy(a).lerp(b, t);
        if (i < segs) { p.x += (Math.random() - 0.5) * 0.7; p.y += (Math.random() - 0.3) * 0.5; p.z += (Math.random() - 0.5) * 0.7; }
        this.add(prev, p, color, width, life, 2.6);
        prev = p.clone();
      }
    },
    update(dt) {
      let n = 0;
      for (let i = 0; i < max; i++) {
        const p = P[i];
        if (p.t >= p.max) continue;
        p.t += dt;
        const f = Math.max(0, 1 - p.t / p.max);
        const len = p.a.distanceTo(p.b);
        if (len < 1e-4) continue;
        V.copy(p.a).add(p.b).multiplyScalar(0.5);
        V2.copy(p.b).sub(p.a).normalize();
        Q.setFromUnitVectors(ZAX, V2);
        M.compose(V, Q, S.set(p.w * (0.4 + f * 0.6), p.w * (0.4 + f * 0.6), len));
        mesh.setMatrixAt(n, M);
        mesh.setColorAt(n, C.copy(p.c).multiplyScalar(f));
        n++;
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
  };
}

// ---------------------------------------------------------------------------
// RINGS — expanding flat rings (splash impacts, support pulses, synergies, builds)
// ---------------------------------------------------------------------------
export function createRings(scene, max = 120) {
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.InstancedMesh(new THREE.RingGeometry(0.82, 1, 40).rotateX(-Math.PI / 2), mat, max);
  mesh.frustumCulled = false; mesh.renderOrder = 8;
  mesh.setColorAt(0, new THREE.Color(1, 1, 1));
  scene.add(mesh);
  const P = []; for (let i = 0; i < max; i++) P.push({ t: 1, max: 0, p: new THREE.Vector3(), c: new THREE.Color() });
  let head = 0;
  return {
    add(pos, color, r0, r1, life = 0.4, glow = 1.8) {
      const p = P[head]; head = (head + 1) % max;
      p.p.copy(pos); p.c.set(color).multiplyScalar(glow); p.r0 = r0; p.r1 = r1; p.t = 0; p.max = life;
    },
    update(dt) {
      let n = 0;
      for (let i = 0; i < max; i++) {
        const p = P[i];
        if (p.t >= p.max) continue;
        p.t += dt;
        const f = Math.min(1, p.t / p.max), e = 1 - Math.pow(1 - f, 3);
        const r = p.r0 + (p.r1 - p.r0) * e;
        M.compose(p.p, Q.identity(), S.set(r, 1, r));
        mesh.setMatrixAt(n, M);
        mesh.setColorAt(n, C.copy(p.c).multiplyScalar(1 - f));
        n++;
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
  };
}

// ---------------------------------------------------------------------------
// PROJECTILES — glowing voxel bolts coloured by element (one instanced mesh)
// ---------------------------------------------------------------------------
export function createProjectiles(scene, max = 300) {
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, max);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.setColorAt(0, new THREE.Color(1, 1, 1)); mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);
  let n = 0;
  const E = new THREE.Euler();
  return {
    begin() { n = 0; },
    add(pos, color, size, spin) {
      if (n >= max) return;
      M.compose(pos, Q.setFromEuler(E.set(spin, spin * 1.3, spin * 0.7)), S.setScalar(size));
      mesh.setMatrixAt(n, M);
      mesh.setColorAt(n, C.set(color).multiplyScalar(2.4));
      n++;
    },
    end() { mesh.count = n; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; },
  };
}

// ---------------------------------------------------------------------------
// BARS & MARKERS over enemies: HP bars (camera-facing), origin rings, boss/selection rings
// ---------------------------------------------------------------------------
export function createBars(scene, max = 400) {
  const geo = new THREE.PlaneGeometry(1, 1);
  const mk = (color, order, add) => {
    const m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false, transparent: true, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending }), max);
    m.frustumCulled = false; m.renderOrder = order; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.setColorAt(0, new THREE.Color(1, 1, 1));
    scene.add(m); return m;
  };
  const bg = mk(0xffffff, 20), fill = mk(0xffffff, 21), pip = mk(0xffffff, 22);
  const ringGeo = new THREE.RingGeometry(0.85, 1, 32).rotateX(-Math.PI / 2);
  const ring = new THREE.InstancedMesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }), max);
  ring.frustumCulled = false; ring.renderOrder = 4; ring.setColorAt(0, new THREE.Color(1, 1, 1)); scene.add(ring);
  let nb = 0, nf = 0, np = 0, nr = 0;
  const camQ = new THREE.Quaternion(), right = new THREE.Vector3(), upv = new THREE.Vector3();
  const cBg = new THREE.Color("#120a1e");
  return {
    begin(camera) { nb = nf = np = nr = 0; camQ.copy(camera.quaternion); right.set(1, 0, 0).applyQuaternion(camQ); upv.set(0, 1, 0).applyQuaternion(camQ); },
    bar(pos, frac, w, color, h = 0.2) {
      if (nb >= max) return;
      M.compose(pos, camQ, S.set(w + 0.08, h, 1)); bg.setMatrixAt(nb, M); bg.setColorAt(nb++, cBg);
      const fw = Math.max(0.001, w * frac);
      V.copy(pos).addScaledVector(right, -(w - fw) / 2);
      M.compose(V, camQ, S.set(fw, h * 0.6, 1)); fill.setMatrixAt(nf, M); fill.setColorAt(nf++, C.set(color));
    },
    pips(pos, n, color) { // small gold pips above the bar (loops survived)
      for (let i = 0; i < Math.min(n, 5); i++) {
        if (np >= max) return;
        V.copy(pos).addScaledVector(right, (i - (Math.min(n, 5) - 1) / 2) * 0.2).addScaledVector(upv, 0.2);
        M.compose(V, camQ, S.set(0.12, 0.12, 1)); pip.setMatrixAt(np, M); pip.setColorAt(np++, C.set(color));
      }
    },
    ring(pos, r, color) {
      if (nr >= max) return;
      M.compose(pos, Q.identity(), S.set(r, 1, r)); ring.setMatrixAt(nr, M); ring.setColorAt(nr++, C.set(color));
    },
    end() {
      for (const [m, n] of [[bg, nb], [fill, nf], [pip, np], [ring, nr]]) { m.count = n; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    },
  };
}

// ---------------------------------------------------------------------------
// ROUTE — glowing chevrons along the current path (entrance -> exit), a pulse running through them
// ---------------------------------------------------------------------------
export function createRoute(scene, max = 260) {
  const shape = new THREE.Shape();
  shape.moveTo(-0.32, -0.12); shape.lineTo(0, 0.2); shape.lineTo(0.32, -0.12); shape.lineTo(0.32, -0.28); shape.lineTo(0, 0.04); shape.lineTo(-0.32, -0.28); shape.closePath();
  const geo = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.frustumCulled = false; mesh.renderOrder = 3; mesh.count = 0;
  mesh.setColorAt(0, new THREE.Color(1, 1, 1));
  scene.add(mesh);
  let pts = [], color = new THREE.Color("#ffffff");
  return {
    mesh,
    // points: [{x,y,z, yaw}] in world space
    set(points, c) { pts = points.slice(0, max); color.set(c); mesh.count = pts.length; pts.forEach((p, i) => { M.compose(V.set(p.x, p.y, p.z), Q.setFromAxisAngle(UP, p.yaw), S.setScalar(0.9)); mesh.setMatrixAt(i, M); }); mesh.instanceMatrix.needsUpdate = true; },
    clear() { pts = []; mesh.count = 0; },
    update(t, strength) {
      if (!pts.length) return;
      for (let i = 0; i < pts.length; i++) {
        const w = 0.5 + 0.5 * Math.sin(t * 5 - i * 0.55);
        mesh.setColorAt(i, C.copy(color).multiplyScalar((0.18 + Math.pow(w, 6) * 0.9) * strength));
      }
      mesh.instanceColor.needsUpdate = true;
    },
  };
}

// ---------------------------------------------------------------------------
// PREVIEWS — the 3×3 build footprint, range circle, selection highlights
// ---------------------------------------------------------------------------
export function createPreviews(scene) {
  const group = new THREE.Group(); scene.add(group);
  const foot = new THREE.Mesh(new THREE.BoxGeometry(3, 0.12, 3), new THREE.MeshBasicMaterial({ color: "#5fff8a", transparent: true, opacity: 0.32, depthWrite: false }));
  const footEdge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(3.02, 0.14, 3.02)), new THREE.LineBasicMaterial({ color: "#b8ffd0", transparent: true, opacity: 0.95 }));
  foot.add(footEdge); foot.renderOrder = 6; foot.visible = false; group.add(foot);
  // range: a soft disc plus a dashed rim of little blocks
  const rangeGroup = new THREE.Group(); rangeGroup.visible = false; group.add(rangeGroup);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.07, depthWrite: false }));
  disc.renderOrder = 5; rangeGroup.add(disc);
  const dashes = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.75, depthWrite: false }), 72);
  dashes.renderOrder = 5; rangeGroup.add(dashes);
  let lastR = -1;
  function setRange(r) {
    if (Math.abs(r - lastR) < 1e-3) return;
    lastR = r;
    const n = Math.max(24, Math.min(72, Math.round(r * 9)));
    for (let i = 0; i < 72; i++) {
      if (i >= n) { dashes.setMatrixAt(i, M.makeScale(0, 0, 0)); continue; }
      const a = (i / n) * TAU;
      M.compose(V.set(Math.cos(a) * r, 0.06, Math.sin(a) * r), Q.setFromAxisAngle(UP, -a), S.set(0.08, 0.05, (TAU * r) / n * 0.55));
      dashes.setMatrixAt(i, M);
    }
    dashes.instanceMatrix.needsUpdate = true;
    disc.scale.setScalar(r);
  }
  return {
    foot, rangeGroup,
    showFoot(pos, yaw, ok) { foot.visible = true; foot.position.copy(pos); foot.rotation.y = yaw; foot.material.color.set(ok ? "#5fff8a" : "#ff5f6d"); footEdge.material.color.set(ok ? "#b8ffd0" : "#ffb8c0"); },
    hideFoot() { foot.visible = false; },
    showRange(pos, r, color) { rangeGroup.visible = true; rangeGroup.position.copy(pos); setRange(r); dashes.material.color.set(color || "#ffffff"); disc.material.color.set(color || "#ffffff"); },
    hideRange() { rangeGroup.visible = false; },
  };
}
