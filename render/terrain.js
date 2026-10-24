import * as THREE from "three";
import { CONFIG, PATH_POINTS } from "../data.js";
import { material, voxel } from "../art.js";

function instancedBlocks(scene, color, blocks) {
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material(color), blocks.length);
  const dummy = new THREE.Object3D();
  blocks.forEach((block, i) => {
    dummy.position.set(block.x, block.y, block.z);
    dummy.scale.set(block.sx ?? 1, block.sy ?? 1, block.sz ?? 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function distanceToPath(x, z) {
  let best = Infinity;
  for (let i = 0; i < PATH_POINTS.length - 1; i++) {
    const a = PATH_POINTS[i], b = PATH_POINTS[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t)));
  }
  return best;
}

export function createTerrain(scene) {
  const grass = [], dirt = [], deepStone = [], path = [], pathTrim = [];
  for (let x = -8; x <= 8; x++) {
    for (let z = -7; z <= 7; z++) {
      const distance = distanceToPath(x, z);
      if (distance < 0.55) {
        path.push({ x, y: 0.025, z });
        pathTrim.push({ x, y: -0.025, z, sx: 1.08, sz: 1.08, sy: 0.08 });
      } else {
        grass.push({ x, y: 0, z });
        if (distance < 1.1) pathTrim.push({ x, y: -0.015, z, sx: 1.02, sz: 1.02, sy: 0.05 });
      }
    }
  }
  instancedBlocks(scene, CONFIG.palette.dirtDark, deepStone.map((b) => b));
  // Layered blocky underside gives the island a chunky, floating silhouette.
  const lower = [];
  for (let x = -7; x <= 7; x++) for (let z = -6; z <= 6; z++) {
    if (Math.abs(x) + Math.abs(z) < 5) continue;
    lower.push({ x, y: -0.62, z, sx: 1, sy: 0.42, sz: 1 });
  }
  instancedBlocks(scene, CONFIG.palette.dirt, lower);
  const underside = [];
  for (let x = -6; x <= 6; x++) for (let z = -5; z <= 5; z++) {
    if ((Math.abs(x) > 5 || Math.abs(z) > 4) && (x + z) % 2 !== 0) continue;
    underside.push({ x, y: -1.02, z, sx: 1, sy: 0.42, sz: 1 });
  }
  instancedBlocks(scene, CONFIG.palette.dirtDark, underside);
  instancedBlocks(scene, CONFIG.palette.grass, grass);
  instancedBlocks(scene, CONFIG.palette.pathEdge, pathTrim);
  instancedBlocks(scene, CONFIG.palette.path, path);

  const decoration = new THREE.Group();
  for (const [x, z, scale] of [[-7, 3, 1], [7, 5, 0.8], [-2, -6, 0.8], [7, -1, 0.65], [0, 6, 0.65]]) {
    const rock = voxel(CONFIG.palette.stone, { x, y: 0.28 * scale, z }, [0.7 * scale, 0.56 * scale, 0.62 * scale]);
    decoration.add(rock);
  }
  // Small grass tufts, kept as a few decorative meshes rather than per-frame objects.
  for (const [x, z] of [[-7, 1], [-7, 2], [7, 3], [0, -6], [1, -6], [-2, 6], [6, 5]]) {
    if (distanceToPath(x, z) < 1.3) continue;
    decoration.add(voxel(CONFIG.palette.grassLight, { x, y: 0.13, z }, [0.16, 0.26, 0.16]));
  }
  scene.add(decoration);

  const cloudMaterial = new THREE.MeshLambertMaterial({ color: CONFIG.palette.cloud, transparent: true, opacity: 0.75 });
  const cloudGeo = new THREE.BoxGeometry(2.2, 0.5, 1.2);
  for (const [x, y, z, scale] of [[-10, -0.8, -5, 1], [10, 1.5, 2, 1.2], [-4, -2.5, 8, 1.4], [5, -2, -9, 1]]) {
    const cloud = new THREE.Mesh(cloudGeo, cloudMaterial);
    cloud.position.set(x, y, z);
    cloud.scale.setScalar(scale);
    scene.add(cloud);
  }
}
