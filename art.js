import * as THREE from "three";

const materials = new Map();
const geometries = new Map();
const DB = () => globalThis.DB;

function mat(color, emissive = 0x000000) {
  const key = color + ":" + emissive;
  if (!materials.has(key)) materials.set(key, new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity: emissive ? 0.35 : 0 }));
  return materials.get(key);
}
function box(w=1,h=1,d=1) {
  const key = [w,h,d].join(":");
  if (!geometries.has(key)) geometries.set(key, new THREE.BoxGeometry(w,h,d));
  return geometries.get(key);
}
function block(group, color, x,y,z, scale=[1,1,1], emissive=0) {
  const mesh = new THREE.Mesh(box(...scale), mat(color, emissive));
  mesh.position.set(x,y,z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}
function rgb(hex) { return new THREE.Color(hex); }

export function makeTowerVisual(tower) {
  const group = new THREE.Group();
  const def = tower.def || tower;
  const element = DB().ELEMENTS[def.element] || DB().ELEMENTS.fire;
  const main = rgb(element.color).getHex();
  const glow = rgb(element.glow || element.color).getHex();
  const dark = rgb(element.dark || "#30394a").getHex();
  block(group, 0x455066, 0, 0.14, 0, [2.7,0.28,2.7]);
  block(group, 0x8b9bb1, 0, 0.32, 0, [2.35,0.12,2.35]);
  block(group, dark, 0, 0.58, 0, [1.65,0.42,1.65]);
  block(group, main, 0, 0.92, 0, [1.25,0.35,1.25], main);
  block(group, glow, 0, 1.18, 0, [0.62,0.3,0.62], glow);
  const arche = def.archetype || "projectile";
  if (arche === "splash" || arche === "siege") {
    block(group, dark, 0, 1.35, 0, [0.62,0.65,0.62]);
    const barrel = block(group, glow, 0.45, 1.52, 0, [1.15,0.28,0.34], glow);
    barrel.rotation.y = -Math.PI/6;
  } else if (arche === "chain" || arche === "beam" || arche === "random") {
    block(group, glow, 0, 1.58, 0, [0.24,0.8,0.24], glow);
    for (const [x,z] of [[-0.48,0],[0.48,0],[0,-0.48],[0,0.48]]) block(group, main, x,1.45,z,[0.22,0.38,0.22],main);
  } else if (arche === "support") {
    block(group, glow, 0, 1.58, 0, [0.86,0.16,0.86], glow);
    block(group, main, 0, 1.83, 0, [0.38,0.42,0.38], main);
  } else {
    block(group, glow, 0, 1.48, 0, [0.26,0.7,0.26], glow);
    block(group, main, 0, 1.9, 0, [0.48,0.24,0.48], main);
  }
  for (const [x,z] of [[-1.05,-1.05],[1.05,-1.05],[-1.05,1.05],[1.05,1.05]]) block(group, 0xc4cfdd,x,0.38,z,[0.18,0.22,0.18]);
  group.userData.elementColor = main;
  group.userData.level = tower.level || 1;
  return group;
}

export function makeEnemyVisual(enemy) {
  const group = new THREE.Group();
  const def = DB().ENEMIES[enemy.type] || DB().ENEMIES.grunt;
  const base = rgb(def.color || "#e66b7e").getHex();
  const dark = new THREE.Color(base).multiplyScalar(0.55).getHex();
  const eye = 0xfff2c5;
  const boss = !!def.boss;
  const s = boss ? 1.55 : enemy.type === "swarm" ? 0.68 : enemy.type === "runner" ? 0.82 : enemy.type === "tank" ? 1.28 : 1;
  block(group, dark,0,0.28*s,0,[0.72*s,0.56*s,0.62*s]);
  block(group, base,0,0.58*s,0,[0.62*s,0.52*s,0.58*s], boss ? base : 0);
  block(group, base,-0.3*s,0.34*s,0,[0.2*s,0.44*s,0.22*s]);
  block(group, base,0.3*s,0.34*s,0,[0.2*s,0.44*s,0.22*s]);
  block(group, eye,-0.14*s,0.64*s,0.3*s,[0.1*s,0.1*s,0.05*s],eye);
  block(group, eye,0.14*s,0.64*s,0.3*s,[0.1*s,0.1*s,0.05*s],eye);
  if (enemy.type === "brute" || enemy.type === "tank" || boss) {
    block(group, dark,-0.28*s,0.9*s,0,[0.22*s,0.26*s,0.22*s]);
    block(group, dark,0.28*s,0.9*s,0,[0.22*s,0.26*s,0.22*s]);
    block(group, 0xb7c5d7,0,0.87*s,-0.02*s,[0.46*s,0.18*s,0.48*s]);
  }
  if (boss) block(group, 0xff5fa2,0,1.15*s,0,[0.34*s,0.34*s,0.34*s],0xff5fa2);
  group.userData.baseScale = s;
  return group;
}

export function makeProjectileVisual(color) {
  const c = typeof color === "number" ? color : 0xffd27a;
  const mesh = new THREE.Mesh(box(0.22,0.22,0.22), new THREE.MeshBasicMaterial({ color:c }));
  mesh.castShadow = false;
  return mesh;
}
