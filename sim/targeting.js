export function selectTarget(tower, enemies, maxRange) {
  let best = null;
  let bestProgress = -Infinity;
  for (const enemy of enemies) {
    if (enemy.hp <= 0) continue;
    const distance = Math.hypot(enemy.x - tower.x, enemy.z - tower.z);
    if (distance <= maxRange && enemy.progress > bestProgress) {
      best = enemy;
      bestProgress = enemy.progress;
    }
  }
  return best;
}
