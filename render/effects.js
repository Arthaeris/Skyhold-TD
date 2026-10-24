import * as THREE from "three";

// Lightweight visual feedback helpers; effects are intentionally separate from simulation.
export function createPlacementMarker(scene) {
  const geometry = new THREE.RingGeometry(0.36, 0.43, 4);
  const material = new THREE.MeshBasicMaterial({
    color: 0x85f0c5, transparent: true, opacity: 0.8,
    side: THREE.DoubleSide, depthWrite: false
  });
  const marker = new THREE.Mesh(geometry, material);
  marker.rotation.x = -Math.PI / 2;
  marker.position.y = 0.055;
  marker.visible = false;
  scene.add(marker);
  return {
    show(x, z, valid = true) {
      marker.position.x = x;
      marker.position.z = z;
      marker.material.color.setHex(valid ? 0x85f0c5 : 0xff7188);
      marker.visible = true;
    },
    hide() { marker.visible = false; }
  };
}
