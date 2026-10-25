/* Skyhold TD — render/renderer.js
   The 3D shell renderer (takes the place of Circle's render/draw.js). It READS the deterministic sim state
   and draws it; it never mutates the state. Fixed-point positions become floats only here.

   One continuous world: the ring of corridor islands is always there. The camera flies between the world
   overview (Circle's world map) and a tilted, portrait-friendly view of one corridor (Circle's field
   view), and drifts around the ring behind the menus. */
import * as THREE from "three";
import * as fx from "../sim/fx.js";
import { createWorld, ringLayout, corridorToWorld, worldToCorridor, COLS, ROWS } from "./world.js";
import { createTowerModel, towerStage } from "./towers.js";
import { createEnemyRenderer, enemyScale } from "./enemies.js";
import { createSparks, createBits, createStreaks, createRings, createProjectiles, createBars, createRoute, createPreviews } from "./effects.js";
import { createPost, QUALITY } from "./post.js";
import { WORLD } from "./theme.js";
import { clamp, lerp, easeInOut, TAU } from "./kit.js";

const TILE = (v) => fx.toFloat(v);
const EL_FIELD = 55 * Math.PI / 180, EL_WORLD = 62 * Math.PI / 180, EL_MENU = 38 * Math.PI / 180;
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
  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 1, 1600);
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
  const cam = { tx: 0, ty: 0, tz: 0, az: 0, el: EL_WORLD, ppu: 4 };
  let fly = null;            // { from, to, t, dur }
  let mode = "menu";         // menu | setup | world | field
  let fieldIdx = 0;
  const pan = { x: 0, z: 0, zoom: 1 };
  const azOf = (d) => Math.atan2(d.x, -d.z);   // az 0 = looking toward -z (Circle's "up")

  function contentRect() {
    const ins = getInsets();
    const l = ins.left || 0, r = ins.right || 0;
    return { top: ins.top || 0, bottom: ins.bottom || 0, left: l, right: r, h: Math.max(80, H - (ins.top || 0) - (ins.bottom || 0)), w: Math.max(120, W - l - r) };
  }
  function shotWorld() {
    const b = L.bounds, cr = contentRect();
    const ringW = b.x1 - b.x0, ringD = b.z1 - b.z0;
    const ppu = Math.min((cr.w - 16) / ringW, cr.h / (ringD * Math.sin(EL_WORLD) + 10)) * 1.02;
    return { tx: (b.x0 + b.x1) / 2, ty: 0, tz: (b.z0 + b.z1) / 2 + 2, az: 0, el: EL_WORLD, ppu };
  }
  function shotMenu(t) {
    const b = L.bounds;
    const R = Math.max(b.x1 - b.x0, b.z1 - b.z0) / 2;
    const cr = contentRect(); const ppu = Math.min(cr.w, H * 1.1) / (R * 1.55);
    return { tx: 0, ty: 0, tz: 0, az: t * 0.05, el: EL_MENU, ppu };
  }
  function shotSetup() {
    const s = shotWorld();
    return s;
  }
  function fieldPPU() {
    // portrait phones fit the corridor's width (like Circle, scrolling along its length);
    // landscape screens fit the whole corridor
    const cr = contentRect();
    const byW = (cr.w - 12) / (COLS + 1.5);
    const byH = cr.h / ((ROWS + 6) * Math.sin(EL_FIELD) + 3);
    return (cr.w / cr.h < 0.85 ? byW : Math.min(byW, byH)) * pan.zoom;
  }
  function clampPan() {
    pan.zoom = clamp(pan.zoom, 1, 4);
    const ppu = fieldPPU(), cr = contentRect();
    const halfX = (cr.w / 2) / ppu, halfZ = (cr.h / 2) / ppu / Math.sin(EL_FIELD);
    const mx = Math.max(0, (COLS + 2) / 2 - halfX), mz = Math.max(0, (ROWS + 8) / 2 - halfZ);
    pan.x = clamp(pan.x, -mx, mx); pan.z = clamp(pan.z, -mz, mz);
  }
  function shotField(i) {
    clampPan();
    const c = L.corridors[i] || L.corridors[0];
    const p = corridorToWorld(L, i, COLS / 2 + pan.x, ROWS / 2 + pan.z, 0, new THREE.Vector3());
    return { tx: p.x, ty: 0, tz: p.z, az: azOf(c.t), el: EL_FIELD, ppu: fieldPPU() };
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
  function enterField(i, instant) {
    const changing = mode !== "field" || i !== fieldIdx;
    fieldIdx = i; pan.x = 0; pan.z = 0; pan.zoom = 1;
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
      if (fly.t >= fly.dur) fly = null;
    } else Object.assign(cam, g);
    applyCamera();
  }
  const camDir = new THREE.Vector3();
  function applyCamera() {
    const cr = contentRect();
    const D = 600;
    const dx = Math.sin(cam.az), dz = -Math.cos(cam.az);
    camera.position.set(cam.tx - dx * Math.cos(cam.el) * D, cam.ty + Math.sin(cam.el) * D, cam.tz - dz * Math.cos(cam.el) * D);
    camera.up.set(0, 1, 0);
    camera.lookAt(cam.tx, cam.ty, cam.tz);
    const hw = (W / 2) / cam.ppu, hh = (H / 2) / cam.ppu;
    const off = ((cr.top - cr.bottom) / 2) / cam.ppu;   // centre the target in the space between the HUD bars
    const offX = ((cr.right - cr.left) / 2) / cam.ppu;  // ...and beside side sheets on wide screens
    camera.left = -hw + offX; camera.right = hw + offX; camera.top = hh + off; camera.bottom = -hh + off;
    camera.near = 1; camera.far = 1600;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    camera.getWorldDirection(camDir);
    // the key light and its shadow box follow what we look at
    const half = clamp(Math.max(hw, hh) * 1.15, 24, 170);
    sun.position.set(cam.tx - 70, 150, cam.tz + 55);
    sun.target.position.set(cam.tx, 0, cam.tz);
    const sc = sun.shadow.camera;
    if (sc.right !== half) { sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.near = 10; sc.far = 400; sc.updateProjectionMatrix(); }
    sparks.mat.uniforms.uScale.value = cam.ppu * renderer.getPixelRatio();
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
    // enemies: compare on screen against their interpolated positions (they stand above the floor)
    let near = null, nd = Math.max(18, 0.8 * cam.ppu) ** 2;
    const sp = { x: 0, y: 0 };
    for (const [id, r] of erec) {
      if (r.ri !== fieldIdx || !r.alive) continue;
      toScreen(r.world.clone().setY(r.world.y + r.h * 0.45), sp);
      const d = (px - sp.x) ** 2 + (py - sp.y) ** 2;
      if (d < nd) { nd = d; near = id; }
    }
    return { kind: "cell", corridor: fieldIdx, u: uv.u, v: uv.v, c: Math.floor(uv.u), r: Math.floor(uv.v), enemyId: near };
  }
  function panBy(dxPx, dyPx) {
    if (mode !== "field") return;
    pan.x -= dxPx / cam.ppu;
    pan.z -= dyPx / cam.ppu / Math.sin(EL_FIELD);
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
  function clearEntities() {
    for (const r of trec.values()) r.model.root.parent && r.model.root.parent.remove(r.model.root);
    trec.clear(); erec.clear(); prec.clear();
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
    const big = r.type === "boss" || r.type === "endboss";
    bits.burst(p.x, p.y + 0.4 * s, p.z, (DB.ENEMIES[r.type] || {}).color || "#a33a26", big ? 26 : 8, big ? 7 : 4, big ? 0.32 : 0.18, 0.02);
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
      else if (ev.kind === "synergy") { const r = erec.get(ev.enemy); if (r && r.ri >= 0) { rings.add(r.world.clone().setY(0.1), (DB.SYNERGIES && Object.values(DB.SYNERGIES).find((s) => s.name === ev.name) || {}).color || "#ffffff", 0.3, 2.4, 0.5, 2.2); sparks.burst(r.world.x, r.world.y + 0.6, r.world.z, "#ffffff", 8, 4, 0.4, 0.4, 2); } }
      else if (ev.kind === "life") lifeFlash = 1;
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
      const to = r.world.clone(); to.y += r.h * 0.55;
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
    const key = "game:" + view.state.seedBase + ":" + (view.versus ? "v" : view.fieldId) + ":" + corrs.map((c) => c.element).join(",");
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
          if (r.rise === 0) {
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
      enemies.add(e.type, p, r.yaw, r.walk, clock + id, s, stat, r.flash * 0.8, frozen && !!e.statuses.frozen);
      // status motes
      if (stat) {
        const k = (statusT.get(id) || 0) + dt;
        if (k > 0.22) { statusT.set(id, 0); const d = DB.STATUSES[stat]; sparks.spawn({ x: p.x + (Math.random() - 0.5) * 0.6, y: p.y + r.h * (0.3 + Math.random() * 0.6), z: p.z + (Math.random() - 0.5) * 0.6, vy: stat === "burning" || stat === "molten" ? 1.6 : 0.6, color: d.color, life: 0.6, size: 0.32, drag: 1, glow: 1.6 }); }
        else statusT.set(id, k);
      }
      // HP bar, origin ring, markers
      const top = tmpB.set(p.x, p.y + r.h + 0.35, p.z);
      const frac = clamp(e.hp / e.maxHp, 0, 1);
      bars.bar(top, frac, e.boss ? 1.6 : 0.9, frac > 0.5 ? "#5fe07a" : frac > 0.25 ? "#ffd23d" : "#ff4d6d");
      if (e.loopCount > 0) bars.pips(top, e.loopCount, "#ffd23d");
      const fieldEls = view.versus ? null : view.field.elements;
      const oel = view.versus ? view.state.players[e.owner].elements[0] : fieldEls[e.originIndex];
      const rad = Math.max(0.42, TILE(e.def.radius) * 1.7);
      bars.ring(tmpB.set(p.x, 0.05, p.z), rad, elColor(oel));
      if (e.sent) bars.ring(tmpB.set(p.x, 0.06, p.z), rad + 0.14, "#ff5fa2");
      if (e.boss) bars.ring(tmpB.set(p.x, 0.07, p.z), rad + 0.28, "#ffffff");
      if (id === view.selectedEnemyId) bars.ring(tmpB.set(p.x, 0.08, p.z), rad + 0.42 + Math.sin(clock * 6) * 0.05, "#ffe066");
    }
    enemies.end();
    bars.end();
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

  // the green 3×3 footprint, range circles, and the route chevrons
  function syncOverlays(view) {
    if (mode !== "field" || !view.state) { previews.hideFoot(); previews.hideRange(); route.clear(); routeSig = ""; return; }
    const isl = world.ring && world.ring.islands[fieldIdx];
    const c = L.corridors[fieldIdx];
    const yaw = c ? c.theta : 0;
    if (view.buildMenuOpen && view.buildSpot) {
      const S = DB.CONFIG.towerSize, sp = view.buildSpot;
      const p = corridorToWorld(L, fieldIdx, sp.c + S / 2, sp.r + S / 2, 0.06, tmpA);
      previews.showFoot(p, yaw, true);
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
        html = `<b class="${i === view.me ? "me" : ""}">${seat.alive ? (i === view.me ? "YOU" : "NPC " + i) : "☠"}</b><span>${seat.alive ? "❤" + seat.lives + " · " + inside : "eliminated"}</span>`;
        d.classList.toggle("dead", !seat.alive);
      } else {
        let inside = 0, origin = 0;
        for (const e of st.enemies) { if (e.owner !== view.fieldId) continue; if (e.corridorIndex === i) inside++; if (e.originIndex === i) origin++; }
        const corr = view.field.corridors[i];
        html = `<b>${inside}</b><span>${origin}/${corr ? corr.spawnedTotal : 0}</span>`;
      }
      if (d._h !== html) { d.innerHTML = html; d._h = html; }
    });
    const vd = labels.vortex;
    if (vd) {
      toScreen(new THREE.Vector3(L.vortex.x, 0, L.vortex.z), sp);
      vd.style.transform = `translate(${sp.x.toFixed(1)}px, ${sp.y.toFixed(1)}px) translate(-50%, -50%)`;
      const fld = view.versus ? st.players[view.me] : view.field;
      const html = fld.phase === "prep" ? `<b>SUMMON</b><span>End Boss</span>` : `<span>Wave</span><b>${st.mode === "endless" ? fld.wave : fld.wave + "/" + fld.totalWaves}</b>`;
      if (vd._h !== html) { vd.innerHTML = html; vd._h = html; }
      vd.classList.toggle("summon", fld.phase === "prep");
    }
  }

  // ---- main draw -----------------------------------------------------------
  function render(view, alpha = 1) {
    const now = performance.now();
    const rawDt = Math.min(0.25, (now - last) / 1000); last = now;
    const dt = Math.min(0.05, rawDt);
    clock += dt;
    watchFrames(dt);
    V = view && view.state ? view : null;
    if (V) {
      syncRing(V);
      syncTowers(V, dt);
    }
    updateCamera(rawDt); // camera flights run on wall-clock time so slow devices still arrive
    const active = V ? ((V.versus ? V.state.players[V.me] : V.field).phase === "prep") : false;
    world.update(dt, clock, active);
    if (V) { syncEnemies(V, alpha, dt); syncProjectiles(alpha); syncOverlays(V); }
    else { enemies.begin(); enemies.end(); bars.begin(camera); bars.end(); projs.begin(); projs.end(); previews.hideFoot(); previews.hideRange(); route.clear(); }
    route.update(clock, mode === "field" && V && V.field && (V.field.phase === "build" || (V.buildMenuOpen)) ? 1 : 0.45);
    sparks.update(dt); bits.update(dt); streaks.update(dt); rings.update(dt);
    syncLabels(V);
    lifeFlash = Math.max(0, lifeFlash - dt * 2.5);
    post.final.uniforms.flash.value = lifeFlash * 0.22;
    post.render(scene, camera, QUALITY[look.level]);
  }

  // a demo ring for the title screen / setup preview
  function previewRing(elements, key) {
    buildRing(elements.map((el, i) => ({ element: el, grid: null, seed: i + 1 })), "pv:" + (key || elements.join(",")));
  }

  applyQuality();
  window.addEventListener("resize", () => resize());

  return {
    render, resize, snapshotPositions, onEvents, previewRing, pick, panBy, zoomAt, setMode, enterField,
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
