export const CONFIG = Object.freeze({
  title: "Skyhold TD",
  grid: { minX: -8, maxX: 8, minZ: -7, maxZ: 7, tileSize: 1 },
  economy: { startingGold: 180, towerReward: 0, killReward: 8 },
  player: { startingLives: 20 },
  wave: { baseEnemies: 6, enemiesPerWave: 2, spawnInterval: 0.9, baseHealth: 34, healthPerWave: 12, baseSpeed: 1.05, speedPerWave: 0.025 },
  palette: {
    sky: 0x9bc8e6, grass: 0x7cbd78, grassLight: 0x9bd18a,
    dirt: 0x91684e, dirtDark: 0x604b4c, path: 0xd5b98c,
    pathEdge: 0xb99a71, stone: 0x6f8796, stoneLight: 0x9fb4bd,
    bolt: 0x79d8ff, cannon: 0xffc16d, enemy: 0xef7186, cloud: 0xf0f6ff
  }
});

export const TOWERS = Object.freeze({
  bolt: {
    id: "bolt", name: "Arc Tower", cost: 60, range: 4.3,
    cooldown: 0.62, damage: 16, projectileSpeed: 8.5,
    color: CONFIG.palette.bolt
  },
  cannon: {
    id: "cannon", name: "Stone Cannon", cost: 90, range: 3.45,
    cooldown: 1.35, damage: 38, projectileSpeed: 6.2,
    color: CONFIG.palette.cannon
  }
});

export const PATH_POINTS = Object.freeze([
  { x: -7, z: -5 }, { x: 5, z: -5 }, { x: 5, z: -2 },
  { x: -5, z: -2 }, { x: -5, z: 1 }, { x: 3, z: 1 },
  { x: 3, z: 4 }, { x: -1, z: 4 }
]);
