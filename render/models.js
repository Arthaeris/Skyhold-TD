import * as THREE from "three";
import { makeTowerVisual, makeEnemyVisual, makeProjectileVisual } from "../art.js";
import { fx } from "../sim/circle-adapter.js";

function removeMissing(scene,map,live) {
  for (const [id,obj] of map) if (!live.has(id)) {scene.remove(obj);map.delete(id);}
}
export function createEntityRenderer(scene, cols, rows) {
  const towers=new Map(), enemies=new Map(), projectiles=new Map();
  const originX=cols/2, originZ=rows/2;

  function sync(state, field) {
    for (const tower of field.towers) {
      let visual=towers.get(tower.id);
      if (!visual) {
        visual=makeTowerVisual(tower);
        visual.userData.towerId=tower.id;
        visual.traverse(o=>{o.userData.towerId=tower.id;});
        scene.add(visual); towers.set(tower.id,visual);
      }
      visual.position.set(fx.toFloat(tower.cx)-originX,0,fx.toFloat(tower.cy)-originZ);
      visual.scale.setScalar(tower.level>1?1+Math.min(0.18,(tower.level-1)*0.02):1);
      visual.userData.tower=tower;
    }
    removeMissing(scene,towers,new Set(field.towers.map(t=>t.id)));

    for (const enemy of state.enemies) {
      if (!enemy.alive) continue;
      let visual=enemies.get(enemy.id);
      if (!visual) {
        visual=makeEnemyVisual(enemy);
        visual.userData.enemyId=enemy.id;
        const bg=new THREE.Mesh(new THREE.BoxGeometry(0.72,0.09,0.08),new THREE.MeshBasicMaterial({color:0x2a1726}));
        bg.position.set(0,1.34,0.02); visual.add(bg);
        const hp=new THREE.Mesh(new THREE.BoxGeometry(0.68,0.06,0.09),new THREE.MeshBasicMaterial({color:0x7ce5a1}));
        hp.position.set(0,1.35,0.07); hp.name="health";
        visual.add(hp);
        scene.add(visual); enemies.set(enemy.id,visual);
      }
      const x=fx.toFloat(enemy.fx)-originX, z=fx.toFloat(enemy.fy)-originZ;
      visual.position.set(x,0.02+Math.abs(Math.sin(state.tick/9+enemy.id))*0.045,z);
      visual.rotation.y=Math.sin(state.tick/35+enemy.id)*0.12;
      const health=visual.getObjectByName("health");
      if (health) {
        const ratio=Math.max(0,Math.min(1,fx.toFloat(enemy.hp)/Math.max(1,fx.toFloat(enemy.maxHp))));
        health.scale.x=Math.max(0.001,ratio);
        health.position.x=-(0.68*(1-ratio))/2;
      }
      visual.userData.enemy=enemy;
    }
    removeMissing(scene,enemies,new Set(state.enemies.filter(e=>e.alive).map(e=>e.id)));

    for (const p of state.projectiles) {
      let visual=projectiles.get(p.id);
      if (!visual) {
        const element=p.element || p.twRef?.def?.element || "fire";
        const hex=globalThis.DB.ELEMENTS[element]?.glow || "#ffd27a";
        visual=makeProjectileVisual(new THREE.Color(hex).getHex());
        scene.add(visual);projectiles.set(p.id,visual);
      }
      visual.position.set(fx.toFloat(p.x)-originX,1.5,fx.toFloat(p.y)-originZ);
    }
    removeMissing(scene,projectiles,new Set(state.projectiles.map(p=>p.id)));
  }
  return {sync,towers,enemies,projectiles};
}
