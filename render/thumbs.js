/* Skyhold TD — render/thumbs.js
   Little portraits of the voxel models for the menus (build ring, tower sheet, mastery, codex), drawn by
   a tiny second renderer and cached as data URLs — PixelPups' thumbnail rig. */
import * as THREE from "three";
import { createTowerModel } from "./towers.js";
import { buildEnemyPreview } from "./enemies.js";

const SIZE = 128;
let R = null;
const cache = new Map();

function rig() {
  if (R) return R;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(SIZE, SIZE, false);
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.NeutralToneMapping;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight("#c9d4ff", "#3a2d5a", 2.2));
  const sun = new THREE.DirectionalLight("#fff0dc", 2.4);
  sun.position.set(-4, 9, 6);
  scene.add(sun);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  R = { renderer, scene, cam, canvas };
  return R;
}

function snap(obj, dir = new THREE.Vector3(1, 1.05, 1.5), pad = 1.12) {
  const { renderer, scene, cam } = rig();
  scene.add(obj);
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const c = box.getCenter(new THREE.Vector3());
  cam.position.copy(c).addScaledVector(dir.clone().normalize(), 40);
  cam.lookAt(c);
  cam.updateMatrixWorld(true);
  const inv = cam.matrixWorldInverse, v = new THREE.Vector3();
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < 8; i++) {
    v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).applyMatrix4(inv);
    x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
  }
  const half = (Math.max(x1 - x0, y1 - y0) / 2) * pad, mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  cam.left = mx - half; cam.right = mx + half; cam.top = my + half; cam.bottom = my - half;
  cam.updateProjectionMatrix();
  renderer.render(scene, cam);
  scene.remove(obj);
  return renderer.domElement.toDataURL("image/png");
}

export function towerThumb(DB, defId, stage = 1) {
  const key = "t|" + defId + "|" + stage;
  if (cache.has(key)) return cache.get(key);
  let url = "";
  try { const m = createTowerModel(DB, defId, stage, 0); url = snap(m.root); } catch (e) { console.warn("thumb", defId, e); }
  cache.set(key, url);
  return url;
}

export function enemyThumb(DB, type) {
  const key = "e|" + type;
  if (cache.has(key)) return cache.get(key);
  let url = "";
  try { const g = buildEnemyPreview(DB, type); g.rotation.y = 0.5; url = snap(g, new THREE.Vector3(0.6, 0.6, 1.5), 1.08); } catch (e) { console.warn("thumb", type, e); }
  cache.set(key, url);
  return url;
}

// warm the cache a few at a time so the first build ring opens instantly
export function warmThumbs(DB, ids) {
  let i = 0;
  const step = () => {
    const t0 = performance.now();
    while (i < ids.length && performance.now() - t0 < 12) towerThumb(DB, ids[i++]);
    if (i < ids.length) setTimeout(step, 30);
  };
  setTimeout(step, 50);
}
