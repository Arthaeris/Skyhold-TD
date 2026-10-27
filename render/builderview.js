/* Skyhold TD — render/builderview.js
   The builder wardrobe's turntable: a small second renderer that shows one builder on a glowing plinth.
   It idles (bob, hammer tap, wing buzz) and turns slowly; drag or swipe left/right to spin it yourself,
   with a little momentum. Also draws the small portraits on the wardrobe's skin cards. */
import * as THREE from "three";
import { Part, clamp } from "./kit.js";
import { builderModel } from "./mobmodels.js";

// a builder as a posable group (the same assembly the field renderer uses)
export function buildBuilderGroup(skinId, element) {
  const M = builderModel(skinId && skinId !== "element" ? skinId : element || "fire");
  const group = new THREE.Group();
  let armR = null, armL = null; const wings = [];
  for (const [name, fn] of Object.entries(M.parts)) {
    const P = new Part(11 + name.length); fn(P);
    const part = P.build(true);
    const piv = (M.pivots && M.pivots[name]) || [0, 0, 0];
    const holder = new THREE.Group(); holder.position.set(...piv); holder.add(part);
    group.add(holder);
    if (name === "armR") armR = holder; else if (name === "armL") armL = holder;
    else if (name.startsWith("wing")) wings.push({ holder, side: name === "wingL" ? 1 : -1 });
  }
  return { group, armR, armL, wings, height: M.height };
}

function lights(scene) {
  scene.add(new THREE.HemisphereLight("#c9d4ff", "#3a2d5a", 2.2));
  const sun = new THREE.DirectionalLight("#fff0dc", 2.6);
  sun.position.set(-3, 6, 5);
  scene.add(sun);
  const rim = new THREE.DirectionalLight("#9f8cff", 1.4);
  rim.position.set(3, 2, -4);
  scene.add(rim);
}

// ---- turntable --------------------------------------------------------------------------------
export function createBuilderViewer(canvas, opts = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.NeutralToneMapping;
  const scene = new THREE.Scene();
  lights(scene);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  cam.position.set(0, 1.3, 4.3);
  cam.lookAt(0, 0.72, 0);

  // plinth: a dark disc with a glowing rim in the skin's colour
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.7, 0.14, 40), new THREE.MeshLambertMaterial({ color: "#1c1838" }));
  plinth.position.y = 0.13;
  scene.add(plinth);
  const rimMat = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const rimRing = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.72, 48), rimMat);
  rimRing.rotation.x = -Math.PI / 2; rimRing.position.y = 0.205;
  scene.add(rimRing);

  const holder = new THREE.Group();
  scene.add(holder);
  let cur = null, yaw = -0.5, vel = 0, auto = true, raf = 0, last = 0, t = 0, alive = true;

  function show(skinId, element, glow) {
    if (cur) holder.remove(cur.group);
    cur = buildBuilderGroup(skinId, element);
    // fit: every look stands the same height on the plinth, whatever hat or wings it wears
    const box = new THREE.Box3().setFromObject(cur.group);
    const h = Math.max(0.2, box.max.y - box.min.y), k = 1.25 / h;
    cur.group.scale.setScalar(k);
    cur.base = 0.24 - box.min.y * k;
    cur.cx = -((box.min.x + box.max.x) / 2) * k; cur.cz = -((box.min.z + box.max.z) / 2) * k;
    cur.group.position.set(cur.cx, cur.base, cur.cz);
    holder.add(cur.group);
    rimMat.color.set(glow || "#9f8cff");
    auto = true;
  }

  function resize() {
    const w = canvas.clientWidth || 300, h = canvas.clientHeight || 200;
    renderer.setSize(w, h, false);
    cam.aspect = w / h; cam.updateProjectionMatrix();
  }

  function frame(now) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    if (!canvas.isConnected || canvas.offsetParent === null) return; // hidden: skip the draw
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016); last = now; t += dt;
    if (canvas.width !== Math.round((canvas.clientWidth || 1) * renderer.getPixelRatio())) resize();
    // spin: your drag, then momentum, then a slow idle turn
    if (!drag) { if (Math.abs(vel) > 0.02) { yaw += vel * dt; vel *= Math.pow(0.04, dt); } else if (auto) yaw += dt * 0.5; }
    holder.rotation.y = yaw;
    if (cur) {
      cur.group.position.y = cur.base + 0.04 + Math.sin(t * 2.2) * 0.04;
      if (cur.armR) cur.armR.rotation.x = -0.4 + Math.sin(t * 5) * 0.55;
      if (cur.armL) cur.armL.rotation.x = Math.sin(t * 2.2 + 1) * 0.2;
      for (const w of cur.wings) w.holder.rotation.z = Math.sin(t * 40) * 0.5 * w.side;
    }
    renderer.render(scene, cam);
  }

  // drag / swipe to turn it
  let drag = null;
  canvas.style.touchAction = "pan-y";
  canvas.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, t: performance.now() }; vel = 0; auto = false; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, now = performance.now();
    const d = (dx / Math.max(120, canvas.clientWidth)) * Math.PI * 1.6;
    yaw += d;
    vel = clamp(d / Math.max(0.008, (now - drag.t) / 1000), -14, 14);
    drag.x = e.clientX; drag.t = now;
  });
  const end = () => { drag = null; };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);

  resize();
  raf = requestAnimationFrame(frame);
  return {
    show,
    // spin a quarter turn (for the arrow buttons)
    nudge(dir) { vel = dir * 5; auto = false; },
    dispose() { alive = false; cancelAnimationFrame(raf); renderer.dispose(); },
  };
}

// ---- card portraits (cached, drawn by one tiny off-screen renderer) ---------------------------------
let thumbR = null;
const thumbs = new Map();
export function builderThumb(skinId, element) {
  const key = skinId + "|" + (skinId === "element" ? element : "");
  if (thumbs.has(key)) return thumbs.get(key);
  let url = "";
  try {
    if (!thumbR) {
      const c = document.createElement("canvas"); c.width = c.height = 96;
      const r = new THREE.WebGLRenderer({ canvas: c, alpha: true, antialias: true, preserveDrawingBuffer: true });
      r.setPixelRatio(1); r.setSize(96, 96, false); r.setClearColor(0x000000, 0); r.toneMapping = THREE.NeutralToneMapping;
      const scene = new THREE.Scene(); lights(scene);
      const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
      cam.position.set(1.2, 1.15, 3.6); cam.lookAt(0, 0.55, 0);
      thumbR = { r, scene, cam };
    }
    const b = buildBuilderGroup(skinId, element);
    b.group.rotation.y = 0.35;
    if (b.armR) b.armR.rotation.x = -0.5;
    thumbR.scene.add(b.group);
    thumbR.r.render(thumbR.scene, thumbR.cam);
    url = thumbR.r.domElement.toDataURL("image/png");
    thumbR.scene.remove(b.group);
  } catch (e) { console.warn("builder thumb", skinId, e); }
  thumbs.set(key, url);
  return url;
}
