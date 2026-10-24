import * as THREE from "three";

export function createScene(container) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x11152d);
  scene.fog = new THREE.Fog(0x11152d, 76, 150);
  const camera = new THREE.OrthographicCamera(-20,20,40,-40,0.1,220);
  camera.position.set(24,60,42);
  camera.lookAt(0,0,0);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.35));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.domElement.style.touchAction = "none";
  renderer.domElement.setAttribute("aria-label","Voxel corridor grid");
  container.appendChild(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xdde9ff,0x51465f,2.25));
  const sun = new THREE.DirectionalLight(0xffe5bf,2.7);
  sun.position.set(-22,42,20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024,1024);
  sun.shadow.camera.left = -24;
  sun.shadow.camera.right = 24;
  sun.shadow.camera.top = 40;
  sun.shadow.camera.bottom = -40;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  sun.target.position.set(0,0,0);
  scene.add(sun.target);
  const resize = () => {
    const w = Math.max(container.clientWidth,1), h = Math.max(container.clientHeight,1);
    const aspect = w / h;
    const viewHeight = window.innerWidth < 700 ? 78 : 70;
    camera.top = viewHeight/2;
    camera.bottom = -viewHeight/2;
    camera.left = -viewHeight*aspect/2;
    camera.right = viewHeight*aspect/2;
    camera.updateProjectionMatrix();
    renderer.setSize(w,h,false);
  };
  resize();
  window.addEventListener("resize",resize);
  return {scene,camera,renderer,dispose:()=>window.removeEventListener("resize",resize)};
}
