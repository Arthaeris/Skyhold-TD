import { makeTowerVisual, makeEnemyVisual, makeProjectileVisual } from "../art.js";
import { CONFIG } from "../data.js";

export function createEntityRenderer(scene) {
  const towers = new Map();
  const enemies = new Map();
  const projectiles = new Map();

  function removeMissing(map, liveIds) {
    for (const [id, object] of map) {
      if (liveIds.has(id)) continue;
      scene.remove(object);
      map.delete(id);
    }
  }

  function sync(state) {
    for (const tower of state.towers) {
      if (!towers.has(tower.id)) {
        const visual = makeTowerVisual(tower.type);
        visual.position.set(tower.x, 0, tower.z);
        scene.add(visual);
        towers.set(tower.id, visual);
      }
    }
    removeMissing(towers, new Set(state.towers.map((tower) => tower.id)));

    for (const enemy of state.enemies) {
      let visual = enemies.get(enemy.id);
      if (!visual) {
        visual = makeEnemyVisual();
        scene.add(visual);
        enemies.set(enemy.id, visual);
      }
      visual.position.set(enemy.x, 0.08 + Math.abs(Math.sin(state.elapsed * 8 + enemy.id)) * 0.06, enemy.z);
      visual.rotation.y = Math.sin(state.elapsed * 2 + enemy.id) * 0.12;
    }
    removeMissing(enemies, new Set(state.enemies.map((enemy) => enemy.id)));

    for (const projectile of state.projectiles) {
      let visual = projectiles.get(projectile.id);
      if (!visual) {
        visual = makeProjectileVisual(projectile.color || CONFIG.palette.bolt);
        scene.add(visual);
        projectiles.set(projectile.id, visual);
      }
      visual.position.set(projectile.x, projectile.y, projectile.z);
    }
    removeMissing(projectiles, new Set(state.projectiles.map((projectile) => projectile.id)));
  }

  return { sync };
}
