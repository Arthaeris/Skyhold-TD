import * as THREE from "three";
import { CONFIG, TOWERS } from "./data.js";
import { createGameState, placeTower, launchWave, updateGame } from "./sim/core.js";
import { createScene } from "./render/scene.js";
import { createTerrain } from "./render/terrain.js";
import { createEntityRenderer } from "./render/models.js";
import { createPlacementMarker } from "./render/effects.js";
import { createUI } from "./ui.js";

const container = document.querySelector("#game-view");
const { scene, camera, renderer } = createScene(container);
createTerrain(scene);

const state = createGameState();
const entityRenderer = createEntityRenderer(scene);
const marker = createPlacementMarker(scene);
const ui = createUI({
  onSelectTower: (type) => { selectedTower = type; },
  onStartWave: () => {
    if (launchWave(state)) ui.showToast("Wave " + state.wave + " incoming!");
  }
});

let selectedTower = "bolt";
let pointerDown = null;
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(17, 15),
  new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = 0.012;
ground.name = "placement-ground";
scene.add(ground);

function worldPosition(event) {
  const bounds = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
  pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObject(ground, false)[0];
  if (!hit) return null;
  return { x: Math.round(hit.point.x), z: Math.round(hit.point.z) };
}

renderer.domElement.addEventListener("pointermove", (event) => {
  const point = worldPosition(event);
  if (!point || point.x < CONFIG.grid.minX || point.x > CONFIG.grid.maxX || point.z < CONFIG.grid.minZ || point.z > CONFIG.grid.maxZ) {
    marker.hide();
    return;
  }
  const nearPath = (awaitlessNearPath(point.x, point.z));
  const occupied = state.towers.some((tower) => tower.x === point.x && tower.z === point.z);
  marker.show(point.x, point.z, !nearPath && !occupied && state.gold >= TOWERS[selectedTower].cost);
});
renderer.domElement.addEventListener("pointerleave", () => marker.hide());
renderer.domElement.addEventListener("pointerdown", (event) => { pointerDown = { x: event.clientX, y: event.clientY }; });
renderer.domElement.addEventListener("pointerup", (event) => {
  if (!pointerDown || Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 8) {
    pointerDown = null;
    return;
  }
  pointerDown = null;
  const point = worldPosition(event);
  if (!point) return;
  const result = placeTower(state, selectedTower, point.x, point.z);
  ui.showToast(result.reason);
  if (result.ok) ui.render(state);
});

function awaitlessNearPath(x, z) {
  // Match the simulation's path exclusion without exposing renderer objects to game logic.
  const points = [
    [-7,-5],[5,-5],[5,-2],[-5,-2],[-5,1],[3,1],[3,4],[-1,4]
  ];
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, az] = points[i], [bx, bz] = points[i + 1];
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    if (Math.hypot(x - (ax + dx * t), z - (az + dz * t)) < 0.72) return true;
  }
  return false;
}

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  updateGame(state, dt);
  entityRenderer.sync(state);
  ui.render(state);
  renderer.render(scene, camera);
}
animate();

console.info("Skyhold TD prototype initialized.", { towers: Object.keys(TOWERS), lives: CONFIG.player.startingLives });
