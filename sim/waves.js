import { CONFIG } from "../data.js";

export function startWave(state) {
  if (state.waveActive || state.gameOver) return false;
  state.wave += 1;
  state.waveActive = true;
  state.spawnRemaining = CONFIG.wave.baseEnemies + (state.wave - 1) * CONFIG.wave.enemiesPerWave;
  state.spawnTimer = 0;
  return true;
}

export function spawnEnemy(state) {
  const wave = state.wave;
  const start = { x: -7, z: -5 };
  state.enemies.push({
    id: state.nextId++, x: start.x, z: start.z, progress: 0,
    hp: CONFIG.wave.baseHealth + (wave - 1) * CONFIG.wave.healthPerWave,
    maxHp: CONFIG.wave.baseHealth + (wave - 1) * CONFIG.wave.healthPerWave,
    speed: CONFIG.wave.baseSpeed + (wave - 1) * CONFIG.wave.speedPerWave
  });
}
