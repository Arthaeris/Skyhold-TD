import * as THREE from "three";
import { CONFIG } from "./data.js";

const materialCache = new Map();
const geometryCache = new Map();

export function material(color, roughness = 0.88) {
  const key = color + ":" + roughness;
  if (!materialCache.has(key)) {
    materialCache.set(key, new THREE.MeshLambertMaterial({ color, roughness }));
  }
  return materialCache.get(key);
}

export function boxGeometry(x = 1, y = 1, z = 1) {
  const key = [x, y, z].join(":");
  if (!geometryCache.has(key)) geometryCache.set(key, new THREE.BoxGeometry(x, y, z));
  return geometryCache.get(key);
}

export function voxel(color, position, scale = [1, 1, 1]) {
  const mesh = new THREE.Mesh(boxGeometry(...scale), material(color));
  mesh.position.set(position.x, position.y, position.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function makeTowerVisual(type) {
  const group = new THREE.Group();
  const palette = CONFIG.palette;
  const accent = type === "cannon" ? palette.cannon : palette.bolt;
  group.add(voxel(palette.stone, { x: 0, y: 0.22, z: 0 }, [0.82, 0.42, 0.82]));
  group.add(voxel(palette.stoneLight, { x: 0, y: 0.49, z: 0 }, [0.58, 0.2, 0.58]));
  if (type === "cannon") {
    group.add(voxel(palette.dirtDark, { x: 0, y: 0.83, z: 0 }, [0.46, 0.48, 0.46]));
    const barrel = voxel(accent, { x: 0.19, y: 0.92, z: 0.08 }, [0.62, 0.19, 0.2]);
    barrel.rotation.y = Math.PI / 4;
    group.add(barrel);
  } else {
    group.add(voxel(palette.stone, { x: 0, y: 0.77, z: 0 }, [0.36, 0.42, 0.36]));
    group.add(voxel(accent, { x: 0, y: 1.06, z: 0 }, [0.23, 0.28, 0.23]));
    group.add(voxel(0xc9f4ff, { x: 0, y: 1.27, z: 0 }, [0.12, 0.12, 0.12]));
  }
  group.traverse((object) => { if (object.isMesh) object.userData.shadowCaster = true; });
  return group;
}

export function makeEnemyVisual() {
  const group = new THREE.Group();
  group.add(voxel(CONFIG.palette.enemy, { x: 0, y: 0.28, z: 0 }, [0.48, 0.48, 0.48]));
  group.add(voxel(0xffd7a5, { x: 0.1, y: 0.38, z: 0.245 }, [0.1, 0.1, 0.035]));
  group.add(voxel(0xffd7a5, { x: -0.1, y: 0.38, z: 0.245 }, [0.1, 0.1, 0.035]));
  return group;
}

export function makeProjectileVisual(color) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.16, 0.16),
    new THREE.MeshBasicMaterial({ color })
  );
  mesh.castShadow = false;
  return mesh;
}
