/* Skyhold TD — render/renderer.js
   The 3D shell renderer (takes the place of Circle's render/draw.js). It READS the deterministic sim state
   and draws it; it never mutates the state. Fixed-point positions become floats only here.

   One continuous world: the ring of corridor islands is always there. The camera flies between the world
   overview (Circle's world map) and a tilted, portrait-friendly view of one corridor (Circle's field
   view), and drifts around the ring behind the menus. */
import * as THREE from "three";
import * as fx from "../sim/fx.js";
import * as pf from "../sim/pathfind.js";
import { createWorld, ringLayout, corridorToWorld, worldToCorridor, COLS, ROWS } from "./world.js";
import { createTowerModel, towerStage } from "./towers.js";
import { createEnemyRenderer, enemyScale, setEnemyVisScale } from "./enemies.js";
import { createSparks, createBits, createStreaks, createRings, createProjectiles, createBars, createRoute, createPreviews } from "./effects.js";
import { createPost, QUALITY } from "./post.js";
import { WORLD } from "./theme.js";
import { clamp, lerp, easeInOut, TAU, Part } from "./kit.js";
import { builderModel, mobColor } from "./mobmodels.js";

const TILE = (v) => fx.toFloat(v);
const EL_FIELD = 55 * Math.PI / 180, EL_WORLD = 62 * Math.PI / 180, EL_MENU = 38 * Math.PI / 180;
const EL_CLOSE = 36 * Math.PI / 180, FOV_CLOSE = 34; // the "Close" corridor view: a lower perspective camera (Riftfall-style)
const PREFS_KEY = "skyhold_prefs_v1";

export function createRenderer(opts) {
  const { canvas, DB, labelLayer } = opts;
  const getInsets = opts.getInsets || (() => ({ top: 0, bottom: 0 }));
  const sfx = opts.onSfx || (() => {});

  // ---- three.js core -------------------------------------------------------
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(WORLD.bg);
  const ocam = new THREE.OrthographicCamera(-10, 10, 10, -10, 1, 1600);
  const pcam = new THREE.PerspectiveCamera(FOV_CLOSE, 1, 1, 3000);
  const portraitCam = new THREE.PerspectiveCamera(30, 1, 0.3, 200);
  let camera = ocam;
  const hemi = new THREE.HemisphereLight(WORLD.hemiSky, WORLD.hemiGround, 1.55);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(WORLD.key, 2.4);
  sun.castShadow = true;
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  const rim = new THREE.DirectionalLight(WORLD.rim, 0.55);
  rim.position.set(60, 30, -80);
  scene.add(rim);

  const world = createWorld(scene, DB);
  const enemies = createEnemyRenderer(scene);
  const sparks = createSparks(scene), bits = createBits(scene), streaks = createStreaks(scene), rings = createRings(scene);
  const projs = createProjectiles(scene), bars = createBars(scene), route = createRoute(scene), previews = createPreviews(scene);
  const post = createPost(renderer);

  // ---- quality (Riftfall's tiers + automatic step-down) ------------------
  let prefs = { quality: "auto", autoLevel: 2 };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(PREFS_KEY)) || {}); } catch (e) { /* fine */ }
  const look = { level: 2, slow: 0, watch: 0 };
  function qualityLevel() { return prefs.quality === "high" ? 2 : prefs.quality === "medium" ? 1 : prefs.quality === "low" ? 0 : (prefs.autoLevel != null ? prefs.autoLevel : 2); }
  function savePrefs() { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) { /* fine */ } }
  function applyQuality() {
    look.level = qualityLevel();
    const Q = QUALITY[look.level];
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, Q.pr));
    sun.castShadow = Q.shadow > 0;
    if (Q.shadow && sun.shadow.mapSize.x !== Q.shadow) { sun.shadow.mapSize.set(Q.shadow, Q.shadow); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
    resize();
  }
  function watchFrames(dt) {
    if (prefs.quality !== "auto" || document.hidden) { look.slow = 0; return; }
    look.watch += dt;
    if (look.watch < 6) return;
    if (dt > 1 / 28) look.slow += dt; else look.slow = Math.max(0, look.slow - dt * 0.5);
    if (look.slow > 3 && look.level > 0) { prefs.autoLevel = look.level - 1; savePrefs(); look.slow = 0; look.watch = 0; applyQuality(); }
  }

  // ---- sizing --------------------------------------------------------------
  let W = 1, H = 1;
  function resize() {
    const wrap = canvas.parentElement;
    W = Math.max(1, wrap.clientWidth); H = Math.max(1, wrap.clientHeight);
    renderer.setSize(W, H, false);
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    setEnemyVisScale(Math.min(W, H) < 560 ? 1.4 : 1.2); // phones: creeps a size up
  }

  // ---- ring (the built world) ---------------------------------------------
  let ringKey = "", L = ringLayout(4);
  function buildRing(spec, key) {
    if (key && key === ringKey) return;
    ringKey = key || Math.random().toString(36);
    clearEntities();
    world.build(spec);
    L = world.layout;
    makeLabels();
  }

  // ---- camera rig ------------------------------------------------------------
  // a camera "shot": target point, horizontal look direction (az), elevation, pixels per world unit
  const cam = { tx: 0, ty: 0, tz: 0, az: 0, el: EL_WORLD, ppu: 4, fov: 0 };
  let closeView = false; try { closeView = localStorage.getItem("skyhold_closeview_v1") === "1"; } catch (e) { /* fine */ }
  let follow = null, nudge = null, frameDt = 1 / 60;
  let fly = null;            // { from, to, t, dur }
  let mode = "menu";         // menu | setup | world | field
  let fieldIdx = 0;
  const pan = { x: 0, z: 0, zoom: 1 };
  const azOf = (d) => Math.atan2(d.x, -d.z);   // az 0 = looking toward -z (Circle's "up")

  // `stable` ignores sheets/panels: the zoom never changes because a card opened, only the centring does
  function contentRect(stable) {
    const ins0 = getInsets();
    const ins = stable ? { ...ins0, bottom: ins0.baseBottom != null ? ins0.baseBottom : ins0.bottom, right: ins0.baseRight != null ? ins0.baseRight : ins0.right } : ins0;
    const l = ins.left || 0, r = ins.right || 0;
    return { top: ins.top || 0, bottom: ins.bottom || 0, left: l, right: r, h: Math.max(80, H - (ins.top || 0) - (ins.bottom || 0)), w: Math.max(120, W - l - r) };
  }
  function shotWorld() {
    const b = L.bounds, cr = contentRect();
    const ringW = b.x1 - b.x0, ringD = b.z1 - b.z0;
    const ppu = Math.min((cr.w - 16) / ringW, cr.h / (ringD * Math.sin(EL_WORLD) + 10)) * 0.84;
    return { tx: (b.x0 + b.x1) / 2, ty: 0, tz: (b.z0 + b.z1) / 2 + 2, az: 0, el: EL_WORLD, ppu };
  }
  function shotMenu(t) {
    const b = L.bounds;
    const R = Math.max(b.x1 - b.x0, b.z1 - b.z0) / 2;
    // fit the slowly turning ring into the space the title and the menu card leave free
    const cr = contentRect();
    const ppu = Math.min(cr.w / (R * 2.0), cr.h / (R * 2.0 * Math.sin(EL_MENU) + 8)) * 0.98;
    return { tx: 0, ty: 0, tz: 0, az: t * 0.05, el: EL_MENU, ppu };
  }
  function shotSetup() {
    const s = shotWorld();
    return s;
  }
  function fieldPPU() {
    // portrait phones fit the corridor's width (like Circle, scrolling along its length);
    // landscape screens fit the whole corridor
    // the whole build grid always fits at zoom 1 (portrait: just the grid; landscape: with the portal plazas)
    const cr = contentRect(true);
    const portrait = cr.w / cr.h < 0.85;
    const byW = (cr.w - 10) / (COLS + 0.8);
    const byH = (cr.h - 6) / ((portrait ? ROWS + 1.2 : ROWS + 6) * Math.sin(EL_FIELD) + 2.5);
    return Math.min(byW, byH) * pan.zoom * (closeView ? 1.2 : 1);
  }
  function clampPan() {
    pan.zoom = clamp(pan.zoom, 1, 4);
    const ppu = fieldPPU(), cr = contentRect(true);
    const halfX = (cr.w / 2) / ppu, halfZ = (cr.h / 2) / ppu / Math.sin(closeView ? EL_CLOSE : EL_FIELD) * (closeView ? 0.6 : 1);
    const mx = Math.max(0, (COLS + 2) / 2 - halfX), mz = Math.max(0, (ROWS + 8) / 2 - halfZ);
    pan.x = clamp(pan.x, -mx, mx); pan.z = clamp(pan.z, -mz, mz);
  }
  function shotField(i) {
    // following a selected enemy: glide the view onto it (any manual pan ends the follow)
    if (follow != null) {
      const r = erec.get(follow);
      if (!r || !r.alive || !r.e || !r.e.alive) { follow = null; if (opts.onFollowEnd) opts.onFollowEnd(); }
      else if (r.ri >= 0 && r.ri !== i) { if (opts.onFollowCorridor) opts.onFollowCorridor(r.ri); }
      else if (r.u != null) {
        const k = Math.min(1, frameDt * 6);
        pan.x += ((r.u - COLS / 2) - pan.x) * k;
        pan.z += ((r.v - ROWS / 2) - pan.z) * k;
      }
    } else if (nudge) {
      // a one-off glide that keeps a selected tower clear of the card covering the bottom of the screen
      const k = Math.min(1, frameDt * 7);
      pan.x += (nudge.x - pan.x) * k; pan.z += (nudge.z - pan.z) * k;
      if (Math.abs(nudge.x - pan.x) + Math.abs(nudge.z - pan.z) < 0.05) nudge = null;
    }
    clampPan();
    const c = L.corridors[i] || L.corridors[0];
    const p = corridorToWorld(L, i, COLS / 2 + pan.x, ROWS / 2 + pan.z, 0, new THREE.Vector3());
    // the camera looks back up the corridor, so creeps enter at the top and walk towards you
    return { tx: p.x, ty: 0, tz: p.z, az: azOf({ x: -c.t.x, z: -c.t.z }), el: closeView ? EL_CLOSE : EL_FIELD, ppu: fieldPPU(), fov: closeView ? FOV_CLOSE : 0 };
  }
  function goal() {
    if (mode === "field") return shotField(fieldIdx);
    if (mode === "menu") return shotMenu(clock);
    if (mode === "setup") return shotSetup();
    return shotWorld();
  }
  function startFly(dur = 0.9) {
    fly = { from: { ...cam }, t: 0, dur };
  }
  function setMode(m, instant) {
    if (m === mode && !instant) return;
    mode = m;
    if (instant) { Object.assign(cam, goal()); fly = null; } else startFly(m === "menu" ? 1.4 : 0.85);
  }
  function enterField(i, instant, keepZoom) {
    const changing = mode !== "field" || i !== fieldIdx;
    fieldIdx = i; pan.x = 0; pan.z = 0; nudge = null; if (!keepZoom) pan.zoom = 1;
    mode = "field";
    if (instant) { Object.assign(cam, goal()); fly = null; } else if (changing) startFly(0.85);
  }
  function updateCamera(dt) {
    const g = goal();
    if (fly) {
      fly.t += dt;
      const k = easeInOut(clamp(fly.t / fly.dur, 0, 1));
      let da = g.az - fly.from.az; da = Math.atan2(Math.sin(da), Math.cos(da));
      // pull back a little mid-flight so the hop between islands reads as one world
      const arc = Math.sin(k * Math.PI) * 0.35;
      cam.tx = lerp(fly.from.tx, g.tx, k); cam.ty = lerp(fly.from.ty, g.ty, k); cam.tz = lerp(fly.from.tz, g.tz, k);
      cam.az = fly.from.az + da * k;
      cam.el = lerp(fly.from.el, g.el, k) + arc * 0.25;
      cam.ppu = Math.exp(lerp(Math.log(fly.from.ppu), Math.log(g.ppu), k)) * (1 - arc * 0.5);
      cam.fov = lerp(fly.from.fov || 0, g.fov || 0, k);
      if (fly.t >= fly.dur) fly = null;
    } else Object.assign(cam, g);
    applyCamera();
  }
  const camDir = new THREE.Vector3();
  function applyCamera() {
    const cr = contentRect();
    const persp = cam.fov >= 1;
    camera = persp ? pcam : ocam;
    const hw = (W / 2) / cam.ppu, hh = (H / 2) / cam.ppu;
    const tanH = Math.tan((cam.fov * Math.PI) / 360);
    const D = persp ? hh / tanH : 600;
    const dx = Math.sin(cam.az), dz = -Math.cos(cam.az);
    camera.position.set(cam.tx - dx * Math.cos(cam.el) * D, cam.ty + Math.sin(cam.el) * D, cam.tz - dz * Math.cos(cam.el) * D);
    camera.up.set(0, 1, 0);
    camera.lookAt(cam.tx, cam.ty, cam.tz);
    if (persp) {
      pcam.fov = cam.fov; pcam.aspect = W / H; pcam.near = Math.max(0.5, D * 0.04); pcam.far = D + 1800;
      // centre the target between the HUD bars (and beside side sheets), like the orthographic offset
      pcam.setViewOffset(W, H, (cr.right - cr.left) / 2, -(cr.top - cr.bottom) / 2, W, H);
    } else {
      const off = ((cr.top - cr.bottom) / 2) / cam.ppu;   // centre the target in the space between the HUD bars
      const offX = ((cr.right - cr.left) / 2) / cam.ppu;  // ...and beside side sheets on wide screens
      ocam.left = -hw + offX; ocam.right = hw + offX; ocam.top = hh + off; ocam.bottom = -hh + off;
      ocam.near = 1; ocam.far = 1600;
    }
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    camera.getWorldDirection(camDir);
    // the key light and its shadow box follow what we look at
    const half = clamp(Math.max(hw, hh) * 1.15, 24, 170);
    sun.position.set(cam.tx - 70, 150, cam.tz + 55);
    sun.target.position.set(cam.tx, 0, cam.tz);
    const sc = sun.shadow.camera;
    if (sc.right !== half) { sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.near = 10; sc.far = 400; sc.updateProjectionMatrix(); }
    sparks.mat.uniforms.uScale.value = (persp ? (H / 2) / tanH : cam.ppu) * renderer.getPixelRatio();
    sparks.mat.uniforms.uPersp.value = persp ? 1 : 0;
  }

  // ---- input helpers -------------------------------------------------------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  function groundAt(px, py, y = 0) {
    ndc.set((px / W) * 2 - 1, -(py / H) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    plane.constant = -y;
    return ray.ray.intersectPlane(plane, hit) ? hit.clone() : null;
  }
  function toScreen(v, out = { x: 0, y: 0 }) {
    const p = v.clone().project(camera);
    out.x = (p.x + 1) / 2 * W; out.y = (1 - p.y) / 2 * H;
    return out;
  }
  // what is under a screen point? world view: gates / vortex / islands; field view: enemy or cell
  function pick(px, py, view) {
    if (mode !== "field") {
      // gates and the vortex are picked in screen space (generous targets, like Circle's 34px)
      const sp = { x: 0, y: 0 };
      if (L.vortex) { toScreen(new THREE.Vector3(L.vortex.x, 0, L.vortex.z), sp); const r = Math.max(40, L.vortex.r * cam.ppu); if ((px - sp.x) ** 2 + (py - sp.y) ** 2 < r * r) return { kind: "vortex" }; }
      let best = null, bd = Math.max(34, 7 * cam.ppu) ** 2;
      L.gates.forEach((g, i) => { toScreen(new THREE.Vector3(g.x, 2, g.z), sp); const d = (px - sp.x) ** 2 + (py - sp.y) ** 2; if (d < bd) { bd = d; best = { kind: "gate", index: i }; } });
      if (best) return best;
      const p = groundAt(px, py);
      if (p) for (let i = 0; i < L.corridors.length; i++) { const uv = worldToCorridor(L, i, p.x, p.z); if (uv.u > -3 && uv.u < COLS + 3 && uv.v > -5 && uv.v < ROWS + 5) return { kind: "gate", index: i }; }
      return null;
    }
    const p = groundAt(px, py);
    if (!p) return null;
    const uv = worldToCorridor(L, fieldIdx, p.x, p.z);
    const sp = { x: 0, y: 0 };
    // the builder (hovering above the field) is a generous screen-space target
    const br = brec.get(fieldIdx);
    let onBuilder = false;
    if (br && br.group.visible) { toScreen(br.group.position, sp); onBuilder = (px - sp.x) ** 2 + (py - sp.y) ** 2 < Math.max(30, 1.3 * cam.ppu) ** 2; }
    // enemies: compare on screen against their interpolated positions (they stand above the floor)
    let near = null, nd = Math.max(18, 0.8 * cam.ppu) ** 2;
    for (const [id, r] of erec) {
      if (r.ri !== fieldIdx || !r.alive) continue;
      toScreen(r.world.clone().setY(r.world.y + r.h * 0.45), sp);
      const d = (px - sp.x) ** 2 + (py - sp.y) ** 2;
      if (d < nd) { nd = d; near = id; }
    }
    return { kind: "cell", corridor: fieldIdx, u: uv.u, v: uv.v, c: Math.floor(uv.u), r: Math.floor(uv.v), enemyId: near, builder: onBuilder };
  }
  function panBy(dxPx, dyPx) {
    if (mode !== "field") return;
    if (follow != null) { follow = null; if (opts.onFollowEnd) opts.onFollowEnd(); }
    nudge = null;
    // the view is turned around (looking back up the corridor), so screen right = -u and screen down = +v
    pan.x += dxPx / cam.ppu;
    pan.z += dyPx / cam.ppu / Math.sin(closeView ? EL_CLOSE : EL_FIELD) * (closeView ? 1.6 : 1);
    clampPan();
  }
  function zoomAt(px, py, factor) {
    if (mode !== "field") return;
    const before = groundAt(px, py);
    pan.zoom = clamp(pan.zoom * factor, 1, 4);
    clampPan();
    Object.assign(cam, shotField(fieldIdx)); applyCamera();
    const after = groundAt(px, py);
    if (before && after) {
      const c = L.corridors[fieldIdx];
      const dx = before.x - after.x, dz = before.z - after.z;
      pan.x += dx * c.right.x + dz * c.right.z;
      pan.z += -(dx * c.t.x + dz * c.t.z);
      clampPan();
    }
  }

  // ---- entity records ------------------------------------------------------
  const trec = new Map();   // tower id -> { model, ri, stage, muts, def, aimYaw, recoil, target, pulseT }
  const erec = new Map();   // enemy id -> { pu,pv,cu,cv, pri, ri, hp, flash, yaw, walk, world, alive, type }
  const prec = new Map();   // projectile id -> { pu,pv,cu,cv, ri, element, arche, splash, seen }
  const brec = new Map();   // ring slot -> builder { group, armR, ... }
  function clearEntities() {
    for (const r of trec.values()) r.model.root.parent && r.model.root.parent.remove(r.model.root);
    for (const b of brec.values()) { b.group.parent && b.group.parent.remove(b.group); b.ring && b.ring.parent && b.ring.parent.remove(b.ring); }
    trec.clear(); erec.clear(); prec.clear(); brec.clear();
    route.clear(); routeSig = "";
  }

  // which ring slot a corridor/enemy belongs to for the current view
  let V = null;
  const ringOfCorr = (corr, ownerId) => (V.versus ? ownerId : corr.index);
  function ringOfEnemy(e) {
    if (V.versus) return e.owner;
    return e.owner === V.fieldId ? e.corridorIndex : -1;
  }

  // called after every sim tick: shift positions for interpolation, catch births and deaths
  function snapshotPositions(state) {
    for (const r of erec.values()) r.seen = false;
    for (const e of state.enemies) {
      let r = erec.get(e.id);
      const u = TILE(e.fx), v = TILE(e.fy), ri = V ? ringOfEnemy(e) : e.corridorIndex;
      if (!r) {
        r = { pu: u, pv: v, cu: u, cv: v, pri: ri, ri, hp: e.hp, flash: 0, yaw: 0, walk: Math.random() * 6, world: new THREE.Vector3(), alive: true, type: e.type, h: 1, born: true, e };
        erec.set(e.id, r);
        if (ri >= 0 && L.corridors[ri]) { const p = corridorToWorld(L, ri, u, v, 0.4); sparks.burst(p.x, p.y, p.z, WORLD.portal, 6, 3, 0.5, 0.4, 1); }
      } else {
        r.pu = r.cu; r.pv = r.cv; r.pri = r.ri;
        r.cu = u; r.cv = v; r.ri = ri;
        if (e.hp < r.hp - 1) r.flash = 1;
        r.hp = e.hp;
        if (r.pri !== r.ri && r.pri >= 0 && r.ri >= 0) transferFx(r);
      }
      r.e = e; r.seen = true; r.alive = e.alive;
    }
    for (const [id, r] of erec) if (!r.seen) { if (!r.killed) deathFx(r, false); erec.delete(id); }
    for (const r of prec.values()) r.seen = false;
    for (const p of state.projectiles) {
      const ri = V ? (V.versus ? p.owner : (p.owner === V.fieldId ? p.corr.index : -1)) : p.corr.index;
      let r = prec.get(p.id);
      const u = TILE(p.x), v = TILE(p.y);
      if (!r) {
        r = { pu: u, pv: v, cu: u, cv: v, ri, element: p.element, arche: p.arche, splash: p.st ? TILE(p.st.splash) : 0, seen: true, tu: TILE(p.tx), tv: TILE(p.ty) };
        prec.set(p.id, r);
        const tr = trec.get(p.twId);
        if (tr) { tr.recoil = 1; tr.target = p.targetId; }
        if (ri === fieldIdx || mode !== "field") sfx("shoot", p.element);
      } else { r.pu = r.cu; r.pv = r.cv; r.cu = u; r.cv = v; r.tu = TILE(p.tx); r.tv = TILE(p.ty); }
      r.seen = true;
    }
    for (const [id, r] of prec) if (!r.seen) { impactFx(r); prec.delete(id); }
    // builders (expanded ruleset): remember last and current spots for interpolation
    if (V && state.x) ringCorridors(V).forEach((corr, ri) => {
      const b = corr.builder; if (!b) return;
      let r = brec.get(ri);
      const u = TILE(b.x), v = TILE(b.y);
      if (!r || r.element !== corr.element || r.skin !== (V.builderSkin || "element")) { if (r) { r.group.parent && r.group.parent.remove(r.group); r.ring.parent && r.ring.parent.remove(r.ring); } r = makeBuilder(corr.element, V.builderSkin || "element"); r.pu = r.cu = u; r.pv = r.cv = v; brec.set(ri, r); }
      else { r.pu = r.cu; r.pv = r.cv; r.cu = u; r.cv = v; }
      r.corr = corr; r.b = b;
    });
  }
  function makeBuilder(element, skin) {
    const M = builderModel(skin && skin !== "element" ? skin : element);
    const group = new THREE.Group();
    let armR = null, armL = null, wings = [];
    for (const [name, fn] of Object.entries(M.parts)) {
      const P = new Part(11 + name.length); fn(P);
      const part = P.build(true);
      const piv = (M.pivots && M.pivots[name]) || [0, 0, 0];
      const holder = new THREE.Group(); holder.position.set(...piv); holder.add(part);
      group.add(holder);
      if (name === "armR") armR = holder; else if (name === "armL") armL = holder; else if (name.startsWith("wing")) wings.push({ holder, side: name === "wingL" ? 1 : -1 });
    }
    group.scale.setScalar(3.3);
    scene.add(group);
    // a glowing marker on the ground under the builder, so it reads at any zoom
    const gc = (DB.ELEMENTS[element] && DB.ELEMENTS[element].glow) || "#ffffff";
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 1.15, 28), new THREE.MeshBasicMaterial({ color: new THREE.Color(gc).multiplyScalar(1.6), transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending }));
    ring.rotation.x = -Math.PI / 2; ring.renderOrder = 4;
    group.userData.ring = ring;
    scene.add(ring);
    return { group, ring, armR, armL, wings, element, skin, yaw: 0, sparkT: 0, M };
  }

  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
  function elColor(el) { return (DB.ELEMENTS[el] || DB.ELEMENTS.fire).color; }
  function transferFx(r) {
    // out through the exit portal, along the bridge, in through the next entrance
    const a = corridorToWorld(L, r.pri, COLS / 2, -2, 1.2, tmpA), b = corridorToWorld(L, r.ri, COLS / 2, ROWS + 2.4, 0.5, tmpB);
    sparks.burst(a.x, a.y, a.z, WORLD.portal, 8, 3, 0.5, 0.45, 0);
    sparks.burst(b.x, b.y, b.z, WORLD.portal, 8, 3, 0.5, 0.45, 0);
  }
  function deathFx(r, killed) {
    if (r.ri < 0 || !L.corridors[r.ri]) return;
    const p = r.world, s = enemyScale(DB, r.type);
    const big = r.type === "boss" || r.type === "endboss" || !!(DB.ENEMIES[r.type] && DB.ENEMIES[r.type].boss);
    bits.burst(p.x, p.y + 0.4 * s, p.z, mobColor(r.type) || (DB.ENEMIES[r.type] || {}).color || "#a33a26", big ? 26 : 8, big ? 7 : 4, big ? 0.32 : 0.18, 0.02);
    sparks.burst(p.x, p.y + 0.5 * s, p.z, killed ? "#ffe9a8" : "#ff9a9a", big ? 30 : 8, big ? 7 : 4, 0.5, big ? 0.9 : 0.4, 3);
    if (big) rings.add(p.clone().setY(0.1), "#ff5fa2", 0.5, 6, 0.9, 2);
  }
  function impactFx(r) {
    if (r.ri < 0 || !L.corridors[r.ri]) return;
    const p = corridorToWorld(L, r.ri, r.cu, r.cv, 0.6, tmpA);
    const c = elColor(r.element);
    if (r.arche === "splash" && r.splash > 0) {
      rings.add(p.clone().setY(0.08), c, 0.2, r.splash, 0.45, 1.6);
      if (r.ri === fieldIdx) sfx("boom");
      sparks.burst(p.x, p.y, p.z, c, 10, 5, 0.45, 0.5, 4);
    } else sparks.burst(p.x, p.y, p.z, c, 4, 3, 0.3, 0.35, 2);
  }

  // cosmetic reactions to sim events (the UI handles toasts)
  function onEvents(events) {
    for (const ev of events) {
      if (ev.kind === "zap") zapFx(ev);
      else if (ev.kind === "kill") { const r = erec.get(ev.enemy); if (r) { r.killed = true; deathFx(r, true); } }
      else if (ev.kind === "synergy") {
        const r = erec.get(ev.enemy);
        if (r && r.ri >= 0) {
          const syn = (DB.RULES && DB.RULES.SYNERGIES_X.find((x) => x.id === ev.id)) || (DB.SYNERGIES && Object.values(DB.SYNERGIES).find((x) => x.name === ev.name)) || {};
          const col = syn.color || "#ffffff";
          rings.add(r.world.clone().setY(0.1), col, 0.3, 2.4, 0.5, 2.2); sparks.burst(r.world.x, r.world.y + 0.6, r.world.z, col, 10, 4, 0.4, 0.4, 2);
          if (r.ri === (V && V.activeCorridor) || !V) popText(r.world, (syn.icon ? syn.icon + " " : "") + ev.name, col);
        }
      }
      else if (ev.kind === "bounty") { const r = erec.get(ev.enemy); if (r && r.ri >= 0) popText(r.world, "+" + ev.gold + " ✦", "#ffd23d", true); }
      else if (ev.kind === "life") lifeFlash = 1;
      else abilityFx(ev);
    }
  }
  const towerWorld = (id, out) => { const tr = trec.get(id); if (!tr) return null; tr.model.root.getWorldPosition(out); return out; };
  function abilityFx(ev) {
    const r = ev.enemy != null ? erec.get(ev.enemy) : null;
    const at = r && r.ri >= 0 && L.corridors[r.ri] ? corridorToWorld(L, r.ri, r.cu, r.cv, 0.02, new THREE.Vector3()) : null;
    switch (ev.kind) {
      case "jump": if (at) { const c = ev.style === "dash" ? "#ffb15c" : ev.style === "escape" ? "#7fe8ff" : ev.style === "phase" ? "#9fe8ff" : "#c77dff"; sparks.burst(at.x, at.y + 0.6, at.z, c, 12, 5, 0.45, 0.4, 3); rings.add(at.clone().setY(0.1), c, 0.3, 1.6, 0.4, 2); } break;
      case "meteor": if (at) { rings.add(at.clone().setY(0.1), "#ff6a2a", 0.5, 4, 0.7, 2.4); sparks.burst(at.x, at.y + 1, at.z, "#ffb15c", 30, 8, 0.6, 0.7, 3); bits.burst(at.x, 0.5, at.z, "#3a2026", 14, 5, 0.3, 0.02); sfx("boom"); } break;
      case "boulder": case "curse": case "root": {
        const tp = towerWorld(ev.tower, tmpB);
        if (tp && at) { const from = at.clone(); from.y += 1.2; const to = tp.clone(); to.y += 1.5; const c = ev.kind === "boulder" ? "#c8b89a" : ev.kind === "curse" ? "#b58cff" : "#7fcf5a"; streaks.bolt(from, to, c, 0.16, 0.3, 3); }
        if (tp) { bits.burst(tp.x, 2, tp.z, ev.kind === "boulder" ? "#7a7a6a" : ev.kind === "root" ? "#4f8f3a" : "#5a3a7a", 10, 4, 0.22, 0.02); rings.add(tp.clone().setY(0.1), ev.kind === "root" ? "#7fcf5a" : ev.kind === "curse" ? "#b58cff" : "#ffe066", 0.4, 2.2, 0.5, 2); if (ev.kind === "boulder") sfx("boom"); }
        break;
      }
      case "shred": if (at) { bits.burst(at.x, 0.6, at.z, "#6a6a62", 16, 5, 0.28, 0.02); sparks.burst(at.x, 0.8, at.z, "#ffe9a8", 14, 5, 0.4, 0.4, 4); } break;
      case "form": if (at) { const c = ev.style === "divine" ? "#ffe066" : ev.style === "revive" ? "#9cff7a" : ev.style === "glitch" ? "#ff5fa2" : "#c8d0e0"; rings.add(at.clone().setY(0.1), c, 0.4, 2.4, 0.6, 2.2); sparks.burst(at.x, at.y + 0.8, at.z, c, 14, 5, 0.45, 0.5, 2); } break;
      case "pulse": if (at) { const c = ev.style === "barrier" ? "#7fe8ff" : ev.style === "repair" ? "#ffb15c" : "#9cff7a"; rings.add(at.clone().setY(0.1), c, 0.4, ev.style === "mend" ? 1.2 : 2.6, 0.6, 1.6); } break;
      case "dodge": if (at) sparks.burst(at.x, at.y + 0.7, at.z, "#ffffff", 4, 3, 0.25, 0.3, 4); break;
      case "devour": if (at) { sparks.burst(at.x, at.y + 0.6, at.z, "#5dffb0", 16, 5, 0.4, 0.5, 2); rings.add(at.clone().setY(0.1), "#5dffb0", 0.3, 2, 0.4, 2); } break;
      case "minion": if (at) sparks.burst(at.x, at.y + 0.3, at.z, "#c77dff", 5, 3, 0.3, 0.3, 2); break;
      case "steal": lifeFlash = Math.max(lifeFlash, 0.4); break;
    }
  }
  function zapFx(ev) {
    const tr = trec.get(ev.tower);
    if (!tr) return;
    tr.recoil = 1;
    const c = elColor(ev.element);
    tr.model.muzzle.getWorldPosition(tmpA);
    const from = tmpA.clone();
    if (ev.style === "melee") {
      tr.model.root.getWorldPosition(tmpB);
      rings.add(tmpB.clone().setY(0.15), c, 0.6, 2.2, 0.25, 1.4);
      for (const id of ev.targets) { const r = erec.get(id); if (r) sparks.burst(r.world.x, r.world.y + 0.5, r.world.z, "#d8dce4", 3, 3, 0.25, 0.25, 4); }
      return;
    }
    let prev = from;
    ev.targets.forEach((id, i) => {
      const r = erec.get(id); if (!r) return;
      let to;
      if (r.ri === tr.ri) to = r.world.clone();
      else if (r.pri === tr.ri && L.corridors[r.pri]) to = corridorToWorld(L, r.pri, r.pu, r.pv, 0.02, new THREE.Vector3()); // hit on its way out
      else return;
      to.y += r.h * 0.55;
      if (ev.style === "beam" && i === 0) streaks.add(prev, to, c, 0.16, 0.09, 2.4);
      else streaks.bolt(prev, to, c, 0.12, 0.16, 4);
      if (i === 0) tr.target = id;
      sparks.burst(to.x, to.y, to.z, c, 2, 2, 0.25, 0.3, 0);
      prev = to;
    });
  }

  // ---- per-frame sync --------------------------------------------------------
  let routeSig = "", lifeFlash = 0, clock = 0, last = performance.now();
  const statusT = new Map();

  function ringCorridors(view) {
    const st = view.state;
    if (view.versus) return st.players.map((p) => p.corridors[0]);
    return view.field.corridors;
  }
  function syncRing(view) {
    const corrs = ringCorridors(view);
    const key = "game:" + view.state.seedBase + ":" + (view.versus ? "v" : view.fieldId) + ":" + corrs.map((c) => c.element + (c.obsRev ? "~" + c.obsRev : "")).join(",");
    if (key !== ringKey) buildRing(corrs.map((c, i) => ({ element: c.element, grid: c.grid, seed: (view.state.seedBase % 997) + i * 13 + 1 })), key);
  }

  function towerRange(tw) {
    const S = DB.SCALING; const d = DB.TOWER_BY_ID[tw.def.id];
    let r = d.range + S.rangePerLevel * (tw.level - 1);
    for (const mid of tw.mutations) { const m = d.mutations.find((x) => x.id === mid); if (m && m.mods.rangeMult) r *= m.mods.rangeMult; }
    return r;
  }
  function isSupport(tw) {
    const d = DB.TOWER_BY_ID[tw.def.id];
    let a = d.archetype;
    for (const mid of tw.mutations) { const m = d.mutations.find((x) => x.id === mid); if (m && m.mods.archetype) a = m.mods.archetype; }
    return a === "support";
  }

  function syncTowers(view, dt) {
    const corrs = ringCorridors(view);
    const seen = new Set();
    corrs.forEach((corr, ri) => {
      const isl = world.ring && world.ring.islands[ri];
      if (!isl) return;
      for (const tw of corr.towers) {
        seen.add(tw.id);
        const stage = towerStage(tw.level), muts = tw.mutations.length;
        let r = trec.get(tw.id);
        if (r && (r.stage !== stage || r.muts !== muts)) {
          // level-up / mutation: swap the model, with a little burst
          isl.remove(r.model.root);
          const m = createTowerModel(DB, tw.def.id, stage, muts);
          m.root.position.copy(r.model.root.position);
          isl.add(m.root);
          if (r.model.aim && m.aim) m.aim.rotation.y = r.model.aim.rotation.y;
          r.model = m; r.stage = stage; r.muts = muts;
          m.root.getWorldPosition(tmpA);
          rings.add(tmpA.clone().setY(0.15), DB.ELEMENTS[tw.def.element].glow, 0.5, 3, 0.6, 2);
          sparks.burst(tmpA.x, 1.5, tmpA.z, DB.ELEMENTS[tw.def.element].glow, 16, 5, 0.6, 0.45, 3);
        }
        if (!r) {
          const m = createTowerModel(DB, tw.def.id, stage, muts);
          const S = DB.CONFIG.towerSize;
          m.root.position.set(tw.c + S / 2 - COLS / 2, 0, tw.r + S / 2 - ROWS / 2);
          isl.add(m.root);
          r = { model: m, ri, stage, muts, def: tw.def, recoil: 0, target: null, pulseT: Math.random(), rise: view.state.tick > 2 ? 0 : 1 };
          trec.set(tw.id, r);
          if (tw.bState) { r.rise = 1; m.root.scale.set(1, 0.08, 1); }
          else if (r.rise === 0) {
            sfx("build");
            m.root.getWorldPosition(tmpA);
            bits.burst(tmpA.x, 0.3, tmpA.z, "#8a8270", 10, 3, 0.2, 0.02);
            rings.add(tmpA.clone().setY(0.12), DB.ELEMENTS[tw.def.element].color, 0.4, 2.2, 0.5, 1.6);
          }
        }
        if (r.level != null && tw.level > r.level) sfx("upgrade");
        r.level = tw.level;
        r.tw = tw;
      }
    });
    for (const [id, r] of trec) if (!seen.has(id)) {
      sfx("sell");
      r.model.root.getWorldPosition(tmpA);
      bits.burst(tmpA.x, 0.6, tmpA.z, "#c9a24a", 14, 4, 0.22, 0.02);
      sparks.burst(tmpA.x, 1, tmpA.z, "#ffd23d", 10, 4, 0.5, 0.4, 3);
      r.model.root.parent && r.model.root.parent.remove(r.model.root);
      trec.delete(id);
    }
    // animate
    for (const r of trec.values()) {
      const m = r.model, ud = m.ud;
      const tw = r.tw;
      if (tw && tw.bState) {
        // waiting for the builder: a flat blueprint; under construction: rising from the scaffold
        const prog = tw.bState === 2 && tw.bMax ? 1 - tw.bT / tw.bMax : 0;
        m.root.scale.set(1, 0.08 + 0.92 * easeInOut(prog), 1);
        r.rise = 1; r.wasBuilding = true;
        r.pulseT += dt;
        if (r.pulseT > (tw.bState === 2 ? 0.12 : 0.6)) {
          r.pulseT = 0; m.root.getWorldPosition(tmpA);
          if (tw.bState === 2) { sparks.burst(tmpA.x + (Math.random() - 0.5) * 1.6, 0.4 + prog * 2.2, tmpA.z + (Math.random() - 0.5) * 1.6, "#ffd27a", 3, 3, 0.25, 0.3, 4); bits.burst(tmpA.x, 0.3, tmpA.z, "#a8946a", 1, 2, 0.12, 0.02); }
          else rings.add(tmpA.clone().setY(0.08), DB.ELEMENTS[tw.def.element].glow, 0.6, 1.6, 0.6, 1.1);
        }
        continue;
      }
      if (r.wasBuilding) {
        r.wasBuilding = false; m.root.scale.set(1, 1, 1);
        m.root.getWorldPosition(tmpA);
        rings.add(tmpA.clone().setY(0.12), DB.ELEMENTS[tw.def.element].color, 0.4, 2.6, 0.6, 2);
        sparks.burst(tmpA.x, 1.4, tmpA.z, DB.ELEMENTS[tw.def.element].glow, 14, 5, 0.5, 0.4, 3);
        sfx("build");
      }
      if (tw && tw.upT > 0) {
        // an upgrade re-raises the tower from its footing, as slowly as the upgrade takes
        const prog = tw.upMax ? clamp(1 - tw.upT / tw.upMax, 0, 1) : 1;
        m.root.scale.set(1, 0.15 + 0.85 * easeInOut(prog), 1);
        r.upgrading = true; r.rise = 1;
        r.upT = (r.upT || 0) + dt;
        if (r.upT > 0.1) { r.upT = 0; m.root.getWorldPosition(tmpA); sparks.spawn({ x: tmpA.x + (Math.random() - 0.5) * 1.4, y: 0.3 + prog * 2, z: tmpA.z + (Math.random() - 0.5) * 1.4, vy: 2.4, color: DB.ELEMENTS[tw.def.element].glow, life: 0.7, size: 0.3, drag: 0.5, glow: 2 }); }
      } else if (r.upgrading) {
        r.upgrading = false; m.root.scale.set(1, 1, 1);
        m.root.getWorldPosition(tmpA);
        rings.add(tmpA.clone().setY(0.12), DB.ELEMENTS[tw.def.element].glow, 0.4, 2.6, 0.6, 2);
        sparks.burst(tmpA.x, 1.6, tmpA.z, DB.ELEMENTS[tw.def.element].glow, 12, 5, 0.5, 0.4, 3);
      }
      if (tw && (tw.stunT > 0 || tw.jamT > 0 || tw.curseT > 0 || tw.confused || (tw.xDmg && tw.xDmg < fx.ONE) || (tw.xRate && tw.xRate < fx.ONE))) {
        r.dbT = (r.dbT || 0) + dt;
        if (r.dbT > 0.18) {
          r.dbT = 0; m.root.getWorldPosition(tmpA);
          const a = clock * 5 + r.pulseT * 9;
          const c = tw.stunT > 0 ? "#ffe066" : tw.confused ? "#ff7ad0" : tw.curseT > 0 ? "#b58cff" : (tw.xDmg && tw.xDmg < fx.ONE) ? "#9cff5a" : "#9fd8ff";
          sparks.spawn({ x: tmpA.x + Math.cos(a) * 0.9, y: 3.0 + Math.sin(a * 2) * 0.15, z: tmpA.z + Math.sin(a) * 0.9, vy: tw.stunT > 0 ? 0 : -0.3, color: c, life: 0.5, size: 0.34, drag: 1, glow: 2 });
        }
      }
      if (r.rise < 1) { r.rise = Math.min(1, r.rise + dt * 3); const k = easeInOut(r.rise); m.root.scale.set(1, 0.2 + 0.8 * k, 1); }
      if (m.spin && ud.spinRate) { if (ud.spinAxis === "z") m.spin.rotation.z += ud.spinRate * dt; else if (ud.spinAxis === "xyz") { m.spin.rotation.x += ud.spinRate * dt * 0.7; m.spin.rotation.y += ud.spinRate * dt; } else m.spin.rotation.y += ud.spinRate * dt; }
      if (m.float && ud.bob) m.float.position.y = ud.fy + Math.sin(clock * 2 + r.pulseT * 6) * ud.bob;
      if (m.crown) m.crown.rotation.y += dt * 0.6;
      if (m.mut) m.mut.rotation.y -= dt * 1.4;
      if (m.aim && ud.hasAim) {
        let want = null;
        const te = r.target != null ? erec.get(r.target) : null;
        if (te && te.ri === r.ri) {
          const tw = r.tw, S = DB.CONFIG.towerSize;
          want = Math.atan2((te.u ?? te.cu) - (tw.c + S / 2), (te.v ?? te.cv) - (tw.r + S / 2));
        }
        if (want == null) want = m.aim.rotation.y + Math.sin(clock * 0.4 + r.pulseT * 9) * dt * 0.3;
        let d = want - m.aim.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
        m.aim.rotation.y += d * Math.min(1, dt * 10);
        m.aim.position.z = 0;
        if (r.recoil > 0) { const k = r.recoil; m.aim.position.x = -Math.sin(m.aim.rotation.y) * k * 0.12; m.aim.position.z = -Math.cos(m.aim.rotation.y) * k * 0.12; }
        else m.aim.position.x = 0;
      }
      r.recoil = Math.max(0, r.recoil - dt * 8);
      // support towers pulse their aura
      if (r.tw && isSupport(r.tw)) {
        r.pulseT += dt;
        if (r.pulseT > 1.2) { r.pulseT = 0; m.root.getWorldPosition(tmpA); rings.add(tmpA.clone().setY(0.1), DB.ELEMENTS[r.tw.def.element].color, 0.6, towerRange(r.tw), 1.0, 0.9); }
      }
    }
  }

  function syncEnemies(view, alpha, dt) {
    enemies.begin();
    bars.begin(camera);
    for (const [id, r] of erec) {
      const e = r.e;
      if (r.ri < 0 || !L.corridors[r.ri] || !e.alive) continue;
      const a = r.pri === r.ri ? alpha : 1;
      const u = r.pu + (r.cu - r.pu) * a, v = r.pv + (r.cv - r.pv) * a;
      r.u = u; r.v = v;
      const p = corridorToWorld(L, r.ri, u, v, 0.02, tmpA);
      const moved = Math.hypot(p.x - r.world.x, p.z - r.world.z);
      if (moved > 0.0005 && moved < 3) { const want = Math.atan2(p.x - r.world.x, p.z - r.world.z); let d = want - r.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); r.yaw += d * Math.min(1, dt * 12); r.walk += moved * 4.5; }
      r.world.copy(p);
      const s = enemyScale(DB, e.type);
      r.h = enemies.heightOf(e.type) * s;
      const sk = e.statusKeys || [];
      let stat = null;
      for (const k of sk) { const d = DB.STATUSES[k]; if (d && !d.adaptive) { stat = k; break; } }
      const frozen = !!(e.statuses && (e.statuses.frozen || e.statuses.rooted));
      r.flash = Math.max(0, r.flash - dt * 9);
      let ex = null;
      if (e.tr) {
        const shield = e.invulnT > 0 ? 1 : (e.shieldHp > 0 ? Math.min(1, e.shieldHp / Math.max(1, e.maxHp * 0.4)) : 0);
        ex = { ghost: !!e.hidden, shield, shieldColor: e.invulnT > 0 ? "#ffe066" : "#7fe8ff", fly: !!e.fly };
        if (e.stoneT > 0 || e.shellT > 0) stat = "brittle";
      }
      enemies.add(e.type, p, r.yaw, r.walk, clock + id, s, stat, r.flash * 0.8, frozen && !!e.statuses.frozen, ex);
      // status motes
      if (stat) {
        const k = (statusT.get(id) || 0) + dt;
        if (k > 0.22) { statusT.set(id, 0); const d = DB.STATUSES[stat]; sparks.spawn({ x: p.x + (Math.random() - 0.5) * 0.6, y: p.y + r.h * (0.3 + Math.random() * 0.6), z: p.z + (Math.random() - 0.5) * 0.6, vy: stat === "burning" || stat === "molten" ? 1.6 : 0.6, color: d.color, life: 0.6, size: 0.32, drag: 1, glow: 1.6 }); }
        else statusT.set(id, k);
      }
      // HP bar, origin ring, markers
      if (e.hidden && Math.random() < dt * 4) sparks.spawn({ x: p.x + (Math.random() - 0.5) * 0.7, y: p.y + r.h * Math.random(), z: p.z + (Math.random() - 0.5) * 0.7, vy: 0.4, color: "#9fd8ff", life: 0.5, size: 0.22, drag: 1, glow: 1.3 });
      const top = tmpB.set(p.x, p.y + r.h + 0.35, p.z);
      const frac = clamp(e.hp / e.maxHp, 0, 1);
      bars.bar(top, frac, e.boss ? 2.0 : 1.15, frac > 0.5 ? "#5fe07a" : frac > 0.25 ? "#ffd23d" : "#ff4d6d");
      if (e.loopCount > 0) bars.pips(top, e.loopCount, "#ffd23d");
      const fieldEls = view.versus ? null : view.field.elements;
      const oel = view.versus ? view.state.players[e.owner].elements[0] : fieldEls[e.originIndex];
      const rad = Math.max(0.42, TILE(e.def.radius) * 1.7);
      bars.ring(tmpB.set(p.x, 0.05, p.z), rad, elColor(oel));
      if (e.sent) bars.ring(tmpB.set(p.x, 0.06, p.z), rad + 0.14, "#ff5fa2");
      if (e.boss) bars.ring(tmpB.set(p.x, 0.07, p.z), rad + 0.28, "#ffffff");
      if (id === view.selectedEnemyId) bars.ring(tmpB.set(p.x, 0.08, p.z), rad + 0.42 + Math.sin(clock * 6) * 0.05, "#ffe066");
    }
    // construction and upgrade progress over the towers of the corridor being watched
    if (mode === "field") for (const r of trec.values()) {
      const tw = r.tw; if (!tw || r.ri !== fieldIdx) continue;
      let frac = -1, col = "#ffd27a";
      if (tw.bState) frac = tw.bState === 2 && tw.bMax ? 1 - tw.bT / tw.bMax : 0;
      else if (tw.upT > 0 && tw.upMax) { frac = 1 - tw.upT / tw.upMax; col = DB.ELEMENTS[tw.def.element].glow; }
      if (frac < 0) continue;
      r.model.root.getWorldPosition(tmpB); tmpB.y = 3.8;
      bars.bar(tmpB, clamp(frac, 0, 1), 2.6, col, 0.5);
    }
    enemies.end();
    bars.end();
  }

  function syncBuilders(view, alpha, dt) {
    for (const [ri, r] of brec) {
      const b = r.b;
      if (!b || !L.corridors[ri]) { r.group.visible = false; r.ring.visible = false; continue; }
      r.group.visible = true; r.ring.visible = true;
      const u = r.pu + (r.cu - r.pu) * alpha, v = r.pv + (r.cv - r.pv) * alpha;
      const working = !b.moving && !!b.cur;
      const p = corridorToWorld(L, ri, u, v, 2.4 + Math.sin(clock * 3 + ri) * 0.22 + (working ? 1.2 : 0), tmpA);
      const moved = Math.hypot(p.x - r.group.position.x, p.z - r.group.position.z);
      if (moved > 0.002 && moved < 4) { const want = Math.atan2(p.x - r.group.position.x, p.z - r.group.position.z); let d = want - r.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); r.yaw += d * Math.min(1, dt * 8); }
      r.group.position.copy(p);
      r.group.rotation.y = r.yaw;
      r.ring.position.set(p.x, 0.07, p.z);
      r.ring.scale.setScalar(1 + Math.sin(clock * 4 + ri) * 0.08 + (working ? 0.25 : 0));
      if (r.armR) r.armR.rotation.x = working ? -0.6 + Math.sin(clock * 11) * 0.9 : Math.sin(clock * 3) * 0.25;
      if (r.armL) r.armL.rotation.x = Math.sin(clock * 3 + 1) * 0.2;
      for (const w of r.wings) w.holder.rotation.z = Math.sin(clock * 40) * 0.5 * w.side;
      if (working) {
        r.sparkT += dt;
        if (r.sparkT > 0.15) { r.sparkT = 0; sparks.burst(p.x, 0.8, p.z, "#ffe9a8", 4, 3, 0.3, 0.3, 4); streaks.bolt(new THREE.Vector3(p.x, p.y + 0.4, p.z), new THREE.Vector3(p.x + (Math.random() - 0.5), 0.4, p.z + (Math.random() - 0.5)), DB.ELEMENTS[r.element] ? DB.ELEMENTS[r.element].glow : "#ffffff", 0.06, 0.12, 2); if (ri === fieldIdx && mode === "field" && Math.random() < 0.35) sfx("hammer"); }
      } else if (b.moving && Math.random() < dt * 8) sparks.spawn({ x: p.x, y: p.y - 0.4, z: p.z, vy: -0.4, color: DB.ELEMENTS[r.element] ? DB.ELEMENTS[r.element].glow : "#ffffff", life: 0.5, size: 0.25, drag: 1, glow: 1.6 });
    }
  }

  function syncProjectiles(alpha) {
    projs.begin();
    for (const [id, r] of prec) {
      if (r.ri < 0 || !L.corridors[r.ri]) continue;
      const u = r.pu + (r.cu - r.pu) * alpha, v = r.pv + (r.cv - r.pv) * alpha;
      const rem = Math.hypot(r.tu - u, r.tv - v);
      const p = corridorToWorld(L, r.ri, u, v, 0.7 + Math.min(1.8, rem * 0.4), tmpA);
      const c = elColor(r.element);
      const sz = r.arche === "splash" ? 0.42 : 0.26;
      projs.add(p, c, sz, clock * 8 + id);
      if (Math.random() < 0.5) sparks.spawn({ x: p.x, y: p.y, z: p.z, color: c, life: 0.3, size: sz * 1.4, drag: 4, glow: 1.4 });
    }
    projs.end();
  }

  // ---- "can't build here": hatched cells no 3×3 tower can cover -------------------------------
  // Worked out on a private copy of the grid (never the sim's), in slices across frames.
  const nb = (() => {
    const tex = new THREE.DataTexture(new Uint8Array(COLS * ROWS * 4), COLS, ROWS, THREE.RGBAFormat);
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.needsUpdate = true;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(12), 3));
    const M = 0.36;
    geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array([-M, -M, COLS + M, -M, COLS + M, ROWS + M, -M, ROWS + M]), 2));
    geo.setIndex([0, 2, 1, 0, 3, 2]);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { map: { value: tex }, dims: { value: new THREE.Vector2(COLS, ROWS) }, uOp: { value: 0 }, uFrame: { value: new THREE.Color("#ffffff") }, uTime: { value: 0 }, uPart: { value: 0 } },
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      // vUv is in cells (-M..COLS+M); a glowing frame just outside the grid, hatching on blocked cells
      fragmentShader: `varying vec2 vUv; uniform sampler2D map; uniform vec2 dims; uniform float uOp; uniform vec3 uFrame; uniform float uTime; uniform float uPart;
        void main(){
          if (uOp <= 0.0) discard;
          vec2 g = vUv;
          bool outside = g.x < 0.0 || g.y < 0.0 || g.x > dims.x || g.y > dims.y;
          if (outside != (uPart > 0.5)) discard;
          if (outside) {
            float o = max(max(-g.x, g.x - dims.x), max(-g.y, g.y - dims.y));
            float a = (1.0 - smoothstep(0.08, 0.3, o)) * (0.75 + 0.25 * sin(uTime * 3.0));
            gl_FragColor = vec4(uFrame * 1.6, uOp * a); return;
          }
          float m = texture2D(map, g / dims).r; if (m < 0.5) discard;
          vec2 f = fract(g);
          float stripe = step(0.5, fract((g.x + g.y) * 1.25));
          float edge = 1.0 - step(0.06, min(min(f.x, f.y), min(1.0 - f.x, 1.0 - f.y)));
          vec3 col = mix(vec3(0.03, 0.02, 0.08), vec3(0.92, 0.9, 1.0), stripe * 0.4);
          gl_FragColor = vec4(col, uOp * (0.5 + stripe * 0.05 + edge * 0.12));
        }`,
    });
    const mesh = new THREE.Mesh(geo, mat); mesh.renderOrder = 2; mesh.frustumCulled = false; mesh.visible = false;
    // the frame draws over the curb stones around the grid (no depth test)
    const fmat = mat.clone(); fmat.uniforms.map.value = tex; fmat.uniforms.uPart.value = 1; fmat.depthTest = false;
    const frame = new THREE.Mesh(geo, fmat); frame.renderOrder = 3; frame.frustumCulled = false; frame.visible = false;
    scene.add(mesh); scene.add(frame);
    return { tex, geo, mesh, frame, mat, fmat, key: "", fi: -1, job: null, ready: false };
  })();
  function placeNoBuild(fi) {
    const pos = nb.geo.attributes.position, v = new THREE.Vector3();
    const M = 0.36;
    [[-M, -M], [COLS + M, -M], [COLS + M, ROWS + M], [-M, ROWS + M]].forEach(([u, w], k) => { corridorToWorld(L, fi, u, w, 0.045, v); pos.setXYZ(k, v.x, v.y, v.z); });
    pos.needsUpdate = true; nb.fi = ringKey + "|" + fi;
  }
  function* noBuildJob(corr, G, S) {
    const cols = G.cols, rows = G.rows;
    const tmp = { grid: corr.grid.slice(), exit: corr.exit, entrance: corr.entrance, dist: null };
    const grid = tmp.grid;
    pf.computeFlow(tmp, cols, rows);
    // the current route (+ its neighbours): only towers touching it could cut the path
    const hot = new Uint8Array(cols * rows);
    let c = corr.entrance.c, r = corr.entrance.r;
    for (let g = 0; g < cols * rows; g++) {
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const x = c + dc, y = r + dr; if (x >= 0 && y >= 0 && x < cols && y < rows) hot[y * cols + x] = 1; }
      const k = pf.bestNeighbor(tmp, cols, rows, c, r); if (k == null) break;
      c += pf.NB[k][0]; r += pf.NB[k][1];
    }
    const cover = new Uint8Array(cols * rows);
    let n = 0;
    for (let ar = 0; ar + S <= rows; ar++) for (let ac = 0; ac + S <= cols; ac++) {
      let ok = true, isHot = false;
      for (let rr = ar; rr < ar + S && ok; rr++) for (let cc = ac; cc < ac + S; cc++) {
        if (grid[rr * cols + cc] !== 0) { ok = false; break; }
        if (rr <= 1 && Math.abs(cc - corr.exit.c) <= 1) { ok = false; break; }
        if (rr >= rows - 2 && Math.abs(cc - corr.entrance.c) <= 1) { ok = false; break; }
        if (hot[rr * cols + cc]) isHot = true;
      }
      if (ok && isHot) {
        for (let rr = ar; rr < ar + S; rr++) for (let cc = ac; cc < ac + S; cc++) grid[rr * cols + cc] = 2;
        pf.computeFlow(tmp, cols, rows);
        ok = pf.reachable(tmp, cols);
        for (let rr = ar; rr < ar + S; rr++) for (let cc = ac; cc < ac + S; cc++) grid[rr * cols + cc] = 0;
        if (++n % 40 === 0) yield;
      }
      if (ok) for (let rr = ar; rr < ar + S; rr++) for (let cc = ac; cc < ac + S; cc++) cover[rr * cols + cc] = 1;
    }
    const d = nb.tex.image.data;
    for (let i = 0; i < cols * rows; i++) d[i * 4] = grid[i] === 0 && !cover[i] ? 255 : 0;
    nb.tex.needsUpdate = true; nb.ready = true;
  }
  function syncNoBuild(view, dt) {
    const own = view.versus ? fieldIdx === view.me : true;
    const corr = ringCorridors(view)[fieldIdx];
    // only while you are placing a tower (build ring open / desktop hover footprint): otherwise a clean field
    const on = mode === "field" && !fly && own && corr && !view.spectate && !!(view.buildMenuOpen && view.buildSpot);
    for (const m of [nb.mat, nb.fmat]) { m.uniforms.uTime.value = clock; if (corr && DB.ELEMENTS[corr.element]) m.uniforms.uFrame.value.set(DB.ELEMENTS[corr.element].glow || DB.ELEMENTS[corr.element].color); }
    const u = nb.mat.uniforms.uOp;
    u.value = clamp(u.value + (on && nb.ready ? dt * 6 : -dt * 5), 0, 1);
    nb.fmat.uniforms.uOp.value = u.value;
    nb.mesh.visible = nb.frame.visible = u.value > 0;
    if (!corr || mode !== "field") return;
    const G = view.state.grid;
    let h = fieldIdx * 7919;
    for (let i = 0; i < corr.grid.length; i++) if (corr.grid[i]) h = (h * 31 + i * (corr.grid[i] + 1)) | 0;
    const key = ringKey + "|" + fieldIdx + ":" + h;
    if (key !== nb.key) { nb.key = key; nb.job = noBuildJob(corr, G, DB.CONFIG.towerSize); if (nb.fi !== ringKey + "|" + fieldIdx) { placeNoBuild(fieldIdx); u.value = 0; nb.ready = false; } }
    if (nb.job) { const t0 = performance.now(); while (performance.now() - t0 < 6) { if (nb.job.next().done) { nb.job = null; break; } } }
  }

  // the green 3×3 footprint, range circles, and the route chevrons
  function syncOverlays(view) {
    syncNoBuild(view, frameDt);
    if (mode !== "field" || !view.state) { previews.hideFoot(); previews.hideRange(); route.clear(); routeSig = ""; return; }
    const isl = world.ring && world.ring.islands[fieldIdx];
    const c = L.corridors[fieldIdx];
    const yaw = c ? c.theta : 0;
    if (view.buildMenuOpen && view.buildSpot) {
      const S = DB.CONFIG.towerSize, sp = view.buildSpot;
      const p = corridorToWorld(L, fieldIdx, sp.c + S / 2, sp.r + S / 2, 0.06, tmpA);
      previews.showFoot(p, yaw, !sp.bad);
      if (view.buildPreview && view.buildPreview.range) previews.showRange(tmpB.copy(p).setY(0.02), view.buildPreview.range, "#9dffc0");
      else previews.hideRange();
    } else previews.hideFoot();
    if (view.selectedTowerId) {
      const r = trec.get(view.selectedTowerId);
      if (r && r.tw) { r.model.root.getWorldPosition(tmpA); previews.showRange(tmpA.setY(0.02), towerRange(r.tw), "#ffffff"); }
    } else if (!(view.buildMenuOpen && view.buildSpot && view.buildPreview)) previews.hideRange();
    // route: entrance -> exit following the flow field (recomputed only when the grid changes)
    const corrs = ringCorridors(view);
    const corr = corrs[fieldIdx];
    if (!corr || !isl) return;
    const sig = fieldIdx + ":" + corr.towers.length + ":" + corr.towers.reduce((a, t) => a + t.id, 0);
    if (sig !== routeSig) {
      routeSig = sig;
      const pts = [];
      const G = view.state.grid;
      let cc = corr.entrance.c, rr = corr.entrance.r, guard = 0;
      const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
      const blocked = (x, y) => x < 0 || y < 0 || x >= G.cols || y >= G.rows || corr.grid[y * G.cols + x] !== 0;
      while (guard++ < 400) {
        let best = null, bd = corr.dist[rr * G.cols + cc];
        for (let k = 0; k < 8; k++) {
          const nc = cc + NB[k][0], nr = rr + NB[k][1];
          if (blocked(nc, nr)) continue;
          if (NB[k][0] && NB[k][1] && blocked(cc + NB[k][0], rr) && blocked(cc, rr + NB[k][1])) continue;
          const d = corr.dist[nr * G.cols + nc];
          if (d < bd) { bd = d; best = k; }
        }
        if (best == null) break;
        const nc = cc + NB[best][0], nr = rr + NB[best][1];
        const a = corridorToWorld(L, fieldIdx, cc + 0.5, rr + 0.5, 0.03, tmpA), b = corridorToWorld(L, fieldIdx, nc + 0.5, nr + 0.5, 0.03, tmpB);
        if (pts.length % 1 === 0) pts.push({ x: (a.x + b.x) / 2, y: 0.03, z: (a.z + b.z) / 2, yaw: Math.atan2(b.x - a.x, b.z - a.z) + Math.PI });
        cc = nc; rr = nr;
        if (rr <= corr.exit.r) break;
      }
      route.set(pts.filter((_, i) => i % 2 === 0), DB.ELEMENTS[corr.element].glow);
    }
  }

  // ---- world-map labels (Circle prints enemy counts under each gate) ---------
  let labels = [];
  const emotes = [];
  function emote(seat, text) {
    if (!labelLayer) return;
    const d = document.createElement("div"); d.className = "emote-bubble"; d.textContent = text;
    labelLayer.appendChild(d);
    emotes.push({ seat, el: d, t: 3 });
  }
  function makeLabels() {
    if (!labelLayer) return;
    labelLayer.innerHTML = "";
    labels = L.gates.map(() => { const d = document.createElement("div"); d.className = "gate-label"; labelLayer.appendChild(d); return d; });
    const v = document.createElement("div"); v.className = "vortex-label"; labelLayer.appendChild(v); labels.vortex = v;
  }
  const sp = { x: 0, y: 0 };
  function syncLabels(view) {
    if (!labelLayer) return;
    const show = (mode === "world" && !fly) && view && view.state;
    labelLayer.classList.toggle("show", !!show);
    if (!show) return;
    const st = view.state;
    L.gates.forEach((g, i) => {
      const d = labels[i]; if (!d) return;
      toScreen(new THREE.Vector3(g.x, -6, g.z), sp);
      d.style.transform = `translate(${sp.x.toFixed(1)}px, ${sp.y.toFixed(1)}px) translate(-50%, 0)`;
      let html;
      if (view.versus) {
        const seat = st.players[i]; if (!seat) return;
        let inside = 0; for (const e of st.enemies) if (e.owner === i) inside++;
        html = `<b class="${i === view.me ? "me" : ""}">${seat.alive ? (i === view.me ? "YOU" : (view.seatName ? view.seatName(i) : "NPC " + i).toUpperCase()) : "☠"}</b><span>${seat.alive ? "❤" + seat.lives + " · " + inside : "eliminated"}</span>`;
        d.classList.toggle("dead", !seat.alive);
      } else {
        let inside = 0, origin = 0;
        for (const e of st.enemies) { if (e.owner !== view.fieldId) continue; if (e.corridorIndex === i) inside++; if (e.originIndex === i) origin++; }
        const corr = view.field.corridors[i];
        html = `<b>${inside}</b><span>${origin}/${corr ? corr.spawnedTotal : 0}</span>`;
      }
      if (d._h !== html) { d.innerHTML = html; d._h = html; }
    });
    // emote bubbles over a seat's gate
    for (let k = emotes.length - 1; k >= 0; k--) {
      const em = emotes[k];
      em.t -= 1 / 60;
      if (em.t <= 0 || !L.gates[em.seat]) { em.el.remove(); emotes.splice(k, 1); continue; }
      toScreen(new THREE.Vector3(L.gates[em.seat].x, 6, L.gates[em.seat].z), sp);
      em.el.style.transform = `translate(${sp.x.toFixed(1)}px, ${(sp.y - 40 - (3 - em.t) * 6).toFixed(1)}px) translate(-50%, -100%)`;
      em.el.style.opacity = Math.min(1, em.t * 2).toFixed(2);
    }
    const vd = labels.vortex;
    if (vd) {
      toScreen(new THREE.Vector3(L.vortex.x, 0, L.vortex.z), sp);
      vd.style.transform = `translate(${sp.x.toFixed(1)}px, ${sp.y.toFixed(1)}px) translate(-50%, -50%)`;
      const fld = view.versus ? st.players[view.me] : view.field;
      // the vortex stays visible: only a small chip on its rim while the End Boss can be summoned
      const prep = fld.phase === "prep";
      const html = prep ? `☠ Summon` : "";
      if (vd._h !== html) { vd.innerHTML = html; vd._h = html; }
      vd.classList.toggle("summon", prep);
      vd.style.display = prep ? "" : "none";
      toScreen(new THREE.Vector3(L.vortex.x, 0, L.vortex.z + L.vortex.r * 0.9), sp);
      vd.style.transform = `translate(${sp.x.toFixed(1)}px, ${sp.y.toFixed(1)}px) translate(-50%, 0)`;
    }
  }

  // ---- main draw -----------------------------------------------------------
  // ---- live portrait: a little camera that watches the selected enemy, drawn straight into a hole in
  // the UI (the element is transparent; we render into its rectangle on the main canvas)
  let portrait = null; // { el, id }
  const pTmp = new THREE.Vector3(), pClear = new THREE.Color("#0b0c26");
  function drawPortrait() {
    if (!portrait || !portrait.el || !portrait.el.isConnected) return;
    const r = erec.get(portrait.id);
    if (!r || !r.alive || r.ri < 0 || !L.corridors[r.ri]) return;
    const rect = portrait.el.getBoundingClientRect(), cv = canvas.getBoundingClientRect();
    const x = rect.left - cv.left, y = rect.top - cv.top, w = rect.width, h = rect.height;
    if (w < 8 || h < 8 || x + w < 0 || y + h < 0 || x > W || y > H) return;
    const s = enemyScale(DB, r.type), hgt = Math.max(0.8, r.h);
    const look = pTmp.copy(r.world); look.y += hgt * 0.5;
    const dist = 2.2 + hgt * 1.9;
    // from the front-left, a little above, so you see its face
    const a = r.yaw + 0.55;
    portraitCam.position.set(look.x + Math.sin(a) * dist, look.y + dist * 0.42, look.z + Math.cos(a) * dist);
    portraitCam.lookAt(look);
    portraitCam.aspect = w / h; portraitCam.updateProjectionMatrix();
    void s;
    const prevClear = renderer.getClearColor(new THREE.Color()), prevAlpha = renderer.getClearAlpha();
    renderer.setRenderTarget(null);
    renderer.setScissorTest(true);
    renderer.setViewport(x, H - y - h, w, h); renderer.setScissor(x, H - y - h, w, h);
    renderer.setClearColor(pClear, 1); renderer.clear(true, true, false);
    const bg = scene.background; scene.background = null;
    renderer.render(scene, portraitCam);
    scene.background = bg;
    renderer.setScissorTest(false); renderer.setViewport(0, 0, W, H);
    renderer.setClearColor(prevClear, prevAlpha);
  }
  // ---- floating reaction labels: the name of an element reaction pops up where it happened ------
  const pops = [];
  let popLayer = null;
  function popText(world, text, color, small) {
    if (mode !== "field") return;
    if (!popLayer) { popLayer = document.createElement("div"); popLayer.id = "world-pops"; (labelLayer && labelLayer.parentElement || document.body).appendChild(popLayer); }
    // the same reaction close by within a moment shows once
    for (const p of pops) if (p.text === text && p.t < 0.35 && p.w.distanceTo(world) < 3) return;
    if (pops.length >= 7) { const o = pops.shift(); o.el.remove(); }
    const el = document.createElement("div");
    el.className = "pop" + (small ? " small" : "");
    el.textContent = text; el.style.color = color;
    popLayer.appendChild(el);
    pops.push({ el, w: world.clone(), t: 0, text });
  }
  function syncPops(dt) {
    const sp = { x: 0, y: 0 };
    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i]; p.t += dt;
      if (p.t > 1.4 || mode !== "field") { p.el.remove(); pops.splice(i, 1); continue; }
      toScreen(tmpC.set(p.w.x, p.w.y + 1.6 + p.t * 1.2, p.w.z), sp);
      p.el.style.transform = `translate(${Math.round(sp.x)}px, ${Math.round(sp.y)}px) translate(-50%, -100%) scale(${p.t < 0.12 ? 0.7 + p.t * 2.5 : 1})`;
      p.el.style.opacity = String(p.t > 1.0 ? Math.max(0, (1.4 - p.t) / 0.4) : 1);
    }
  }
  const tmpC = new THREE.Vector3();

  function render(view, alpha = 1) {
    const now = performance.now();
    const rawDt = Math.min(0.25, (now - last) / 1000); last = now;
    const dt = Math.min(0.05, rawDt);
    clock += dt; frameDt = dt;
    watchFrames(dt);
    V = view && view.state ? view : null;
    if (V) {
      syncRing(V);
      syncTowers(V, dt);
    }
    updateCamera(rawDt); // camera flights run on wall-clock time so slow devices still arrive
    const active = V ? ((V.versus ? V.state.players[V.me] : V.field).phase === "prep") : false;
    world.update(dt, clock, active);
    if (V) { syncEnemies(V, alpha, dt); syncProjectiles(alpha); syncOverlays(V); syncBuilders(V, alpha, dt); }
    else { for (const b of brec.values()) { b.group.visible = false; b.ring.visible = false; } enemies.begin(); enemies.end(); bars.begin(camera); bars.end(); projs.begin(); projs.end(); previews.hideFoot(); previews.hideRange(); route.clear(); }
    route.update(clock, mode === "field" && V && V.field && (V.field.phase === "build" || (V.buildMenuOpen)) ? 1 : 0.45);
    sparks.update(dt); bits.update(dt); streaks.update(dt); rings.update(dt);
    syncLabels(V);
    syncPops(dt);
    lifeFlash = Math.max(0, lifeFlash - dt * 2.5);
    post.final.uniforms.flash.value = lifeFlash * 0.22;
    post.render(scene, camera, QUALITY[look.level]);
    drawPortrait();
  }

  // a demo ring for the title screen / setup preview
  function previewRing(elements, key) {
    buildRing(elements.map((el, i) => ({ element: el, grid: null, seed: i + 1 })), "pv:" + (key || elements.join(",")));
  }

  applyQuality();
  window.addEventListener("resize", () => resize());

  return {
    render, resize, snapshotPositions, onEvents, previewRing, pick, panBy, zoomAt, setMode, enterField, emote,
    setFollow(id) { follow = id; if (id != null) nudge = null; },
    // the seal breaking: a shockwave and a fountain of sparks out of the Vortex
    flashVortex() {
      const v = L.vortex; if (!v) return;
      const c = new THREE.Vector3(v.x, 0.4, v.z);
      for (let k = 0; k < 3; k++) setTimeout(() => rings.add(c.clone(), "#ff2e7e", v.r * 0.3, v.r * (1.4 + k * 0.5), 0.9, 3), k * 220);
      sparks.burst(v.x, 3, v.z, "#ff7ad0", 40, 9, 0.9, 0.6, 4);
      sparks.burst(v.x, 2, v.z, "#ffe066", 24, 7, 0.7, 0.5, 3);
      lifeFlash = Math.max(lifeFlash, 0.6);
    },
    // screen position of a corridor cell of the field being viewed
    cellScreen(u, v, y = 1) { return toScreen(corridorToWorld(L, fieldIdx, u, v, y, new THREE.Vector3())); },
    // glide (never zoom) so that cell (u,v) sits inside the visible band [topPx, bottomPx]
    ensureVisible(u, v, topPx, bottomPx) {
      if (mode !== "field" || follow != null) return;
      const a = toScreen(corridorToWorld(L, fieldIdx, u, v, 1, new THREE.Vector3()));
      if (a.y > topPx + 40 && a.y < bottomPx - 70) return;
      const b = toScreen(corridorToWorld(L, fieldIdx, u, v + 1, 1, new THREE.Vector3()));
      const pxPerV = b.y - a.y; if (Math.abs(pxPerV) < 0.5) return;
      const want = (topPx + bottomPx) / 2;
      const save = pan.z;
      pan.z += (a.y - want) / pxPerV; clampPan();
      nudge = { x: pan.x, z: pan.z }; pan.z = save;
    },
    get following() { return follow; },
    setPortrait(el, id) { portrait = el ? { el, id } : null; },
    setCloseView(on) { closeView = !!on; try { localStorage.setItem("skyhold_closeview_v1", closeView ? "1" : "0"); } catch (e) { /* fine */ } if (mode === "field") startFly(0.6); },
    get closeView() { return closeView; },
    builderWorld(ri) { const b = brec.get(ri); return b ? b.group.position.clone() : null; },
    probe(px, py) { ndc.set((px / W) * 2 - 1, -(py / H) * 2 + 1); ray.setFromCamera(ndc, camera); const h = ray.intersectObjects(scene.children, true).filter((x) => x.object.visible && x.object.type === "Mesh")[0]; return h ? { p: h.point.toArray().map((v) => +v.toFixed(2)), name: h.object.name, uv: worldToCorridor(L, fieldIdx, h.point.x, h.point.z) } : null; },
    debug: () => ({ builders: [...brec.values()].map((b) => ({ vis: b.group.visible, pos: b.group.position.toArray().map((x) => +x.toFixed(1)), parent: !!b.group.parent, kids: b.group.children.length })) }),
    groundAt, toScreen,
    get mode() { return mode; }, get fieldIndex() { return fieldIdx; }, get flying() { return !!fly; },
    get ringCount() { return L.corridors.length; },
    get quality() { return prefs.quality; },
    setQuality(q) { prefs.quality = q; if (q === "auto") prefs.autoLevel = 2; savePrefs(); applyQuality(); },
    get qualityLabel() { return QUALITY[look.level].label; },
    dispose() { renderer.dispose(); },
    renderer, scene, camera,
  };
}
