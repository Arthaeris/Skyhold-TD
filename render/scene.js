import * as THREE from "three";
import { CONFIG } from "../data.js";

export function createScene(container) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(CONFIG.palette.sky);
  scene.fog = new THREE.Fog(CONFIG.palette.sky, 24, 58);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(16, 17, 20);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  container.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xe8f6ff, 0x6a7c6b, 2.0));
  const sun = new THREE.DirectionalLight(0xfff2d9, 3.0);
  sun.position.set(-8, 18, 11);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -18;
  sun.shadow.camera.right = 18;
  sun.shadow.camera.top = 18;
  sun.shadow.camera.bottom = -18;
  sun.shadow.bias = -0.0003;
  scene.add(sun);
  sun.target.position.set(0, 0, 0);
  scene.add(sun.target);

  const resize = () => {
    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  };
  resize();
  window.addEventListener("resize", resize);
  return { scene, camera, renderer, dispose: () => window.removeEventListener("resize", resize) };
}
