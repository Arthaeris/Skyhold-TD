import { CONFIG, TOWERS } from "../data.js";
import { pointAtDistance, pathLength, isNearPath } from "./pathfind.js";
import { selectTarget } from "./targeting.js";
import { spendGold, rewardKill } from "./economy.js";
import { startWave, spawnEnemy } from "./waves.js";

export function createGameState() {
  return {
    gold: CONFIG.economy.startingGold,
    lives: CONFIG.player.startingLives,
    wave: 0, waveActive: false, gameOver: false,
    spawnRemaining: 0, spawnTimer: 0,
    enemies: [], towers: [], projectiles: [],
    nextId: 1, elapsed: 0, message: "Choose a tower and place it on the island."
  };
}

export function placeTower(state, type, x, z) {
  const spec = TOWERS[type];
  if (!spec || state.gameOver) return { ok: false, reason: "That tower isn't available." };
  const gx = Math.round(x), gz = Math.round(z);
  if (gx < CONFIG.grid.minX + 1 || gx > CONFIG.grid.maxX - 1 || gz < CONFIG.grid.minZ + 1 || gz > CONFIG.grid.maxZ - 1) {
    return { ok: false, reason: "Build within the grassy island." };
  }
  if (isNearPath(gx, gz)) return { ok: false, reason: "Keep the path clear for the creeps." };
  if (state.towers.some((tower) => Math.hypot(tower.x - gx, tower.z - gz) < 0.9)) {
    return { ok: false, reason: "There's already a tower there." };
  }
  if (!spendGold(state, spec.cost)) return { ok: false, reason: "Not enough gold for that tower." };
  state.towers.push({ id: state.nextId++, type, x: gx, z: gz, cooldown: 0 });
  return { ok: true, reason: spec.name + " placed." };
}

export function launchWave(state) {
  return startWave(state);
}

export function updateGame(state, dt) {
  if (state.gameOver) return;
  dt = Math.min(Math.max(dt, 0), 0.05);
  state.elapsed += dt;

  if (state.waveActive && state.spawnRemaining > 0) {
    state.spawnTimer -= dt;
    while (state.spawnTimer <= 0 && state.spawnRemaining > 0) {
      spawnEnemy(state);
      state.spawnRemaining -= 1;
      state.spawnTimer += CONFIG.wave.spawnInterval;
    }
  }

  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) continue;
    enemy.progress += enemy.speed * dt;
    const position = pointAtDistance(enemy.progress);
    enemy.x = position.x;
    enemy.z = position.z;
    if (enemy.progress >= pathLength()) {
      enemy.hp = 0;
      state.lives -= 1;
    }
  }

  for (const tower of state.towers) {
    tower.cooldown -= dt;
    if (tower.cooldown > 0) continue;
    const spec = TOWERS[tower.type];
    const target = selectTarget(tower, state.enemies, spec.range);
    if (!target) continue;
    state.projectiles.push({
      id: state.nextId++, towerId: tower.id, targetId: target.id,
      x: tower.x, z: tower.z, y: tower.type === "cannon" ? 1.02 : 1.25,
      damage: spec.damage, speed: spec.projectileSpeed, color: spec.color
    });
    tower.cooldown = spec.cooldown;
  }

  const remainingProjectiles = [];
  for (const projectile of state.projectiles) {
    const target = state.enemies.find((enemy) => enemy.id === projectile.targetId && enemy.hp > 0);
    if (!target) continue;
    const dx = target.x - projectile.x, dz = target.z - projectile.z;
    const distance = Math.hypot(dx, dz);
    const step = projectile.speed * dt;
    if (distance <= step + 0.18) {
      target.hp -= projectile.damage;
      if (target.hp <= 0) rewardKill(state, CONFIG.economy.killReward);
    } else {
      projectile.x += dx / distance * step;
      projectile.z += dz / distance * step;
      remainingProjectiles.push(projectile);
    }
  }
  state.projectiles = remainingProjectiles;
  state.enemies = state.enemies.filter((enemy) => enemy.hp > 0);

  if (state.lives <= 0) {
    state.lives = 0;
    state.gameOver = true;
    state.waveActive = false;
    state.message = "Your Skyhold has fallen. Refresh to try again.";
  } else if (state.waveActive && state.spawnRemaining === 0 && state.enemies.length === 0) {
    state.waveActive = false;
    state.gold += 20 + state.wave * 3;
    state.message = "Wave cleared! Bonus gold collected.";
  }
}
