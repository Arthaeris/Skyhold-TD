/* Skyhold TD — render/theme.js
   Per-element palettes for the voxel world, translated from Circle-TD's corridor, gate, obstacle and tower
   art (assets/corridors/*.PNG, assets/world/gates/*.PNG …). Gameplay colours (element.color / glow / dark)
   still come from the Circle database; these are the terrain/material shades around them. */

export const THEMES = {
  fire: {
    ground: ["#9a5232", "#8e4a2d", "#a65b37", "#86452a"], seam: "#3a1a10",
    rim: ["#3d2a26", "#33231f", "#47302a"], rimTop: "#56362c",
    soil: "#5a3226", rock: "#3f2620", deep: "#2a1915",
    accent: "#ff6a3d", glow: "#ffb15c", hot: "#ff7a2a",
    sea: "#ff6a3d",
  },
  ice: {
    ground: ["#cfe5f3", "#c3dcee", "#d9edf8", "#b9d3e8"], seam: "#7ea3c2",
    rim: ["#9cc4de", "#8ab6d4", "#b2d6ec"], rimTop: "#e8f6ff",
    soil: "#a9c9e0", rock: "#6f93b4", deep: "#456a8e",
    accent: "#5bd6ff", glow: "#bff0ff", hot: "#7fe3ff",
    sea: "#5bd6ff",
  },
  nature: {
    ground: ["#78b24a", "#6ca442", "#83bc52", "#679d3d"], seam: "#355a22",
    rim: ["#4e7a36", "#3f6a2c", "#5b8a40"], rimTop: "#8ccf5a",
    soil: "#6b4a2e", rock: "#5a4a3a", deep: "#3c3128",
    accent: "#73d35f", glow: "#c6f5b5", hot: "#9cff7a",
    sea: "#73d35f",
  },
  storm: {
    ground: ["#5d6c92", "#55638a", "#67779c", "#4e5c82"], seam: "#262d4c",
    rim: ["#3d4466", "#343a5a", "#474f74"], rimTop: "#6e7aa6",
    soil: "#3e4566", rock: "#2f3452", deep: "#20243c",
    accent: "#c77dff", glow: "#ecd1ff", hot: "#b98cff",
    sea: "#9d7dff",
  },
  light: {
    ground: ["#d6cf86", "#cdc57a", "#dfd893", "#c4bc70"], seam: "#8a7f3c",
    rim: ["#e8dcb4", "#d9cba0", "#f2e8c6"], rimTop: "#fff4d0",
    soil: "#b49a5a", rock: "#8e7a4a", deep: "#6a5a36",
    accent: "#ffe066", glow: "#fff6c2", hot: "#ffd23d",
    sea: "#ffe066",
  },
  darkness: {
    ground: ["#3f355f", "#372e56", "#463c69", "#30284d"], seam: "#15102a",
    rim: ["#251d3c", "#1e1733", "#2c2347"], rimTop: "#4a3d75",
    soil: "#2a2142", rock: "#1f1833", deep: "#140f24",
    accent: "#8b6cff", glow: "#cbb9ff", hot: "#a98aff",
    sea: "#8b6cff",
  },
  mech: {
    ground: ["#71767b", "#686d72", "#7b8085", "#5f6469"], seam: "#2c3034",
    rim: ["#3e4448", "#353a3e", "#484e53"], rimTop: "#8a9096",
    soil: "#4a4f54", rock: "#3a3e42", deep: "#26292c",
    accent: "#9fb3c8", glow: "#7fe8ff", hot: "#ffb84a",
    sea: "#7fe8ff",
  },
  abnormal: {
    ground: ["#5b4262", "#523b59", "#654a6c", "#4a3450"], seam: "#22142a",
    rim: ["#3b2842", "#321f38", "#45304d"], rimTop: "#7a5a84",
    soil: "#3e2a44", rock: "#2e1f34", deep: "#1d1322",
    accent: "#ff5fa2", glow: "#ffc2dd", hot: "#5dffb0",
    sea: "#ff5fa2",
  },
};

// the cosmic backdrop (Circle's world/background.PNG and menu_background.PNG)
export const WORLD = {
  bg: "#070a22",
  seaDeep: "#02041a",
  sea: "#0a1d58",
  seaGlow: "#2f6fe0",
  current: "#3a9cff",
  cloud: "#a9b9ee",
  cloudShade: "#7d8fd6",
  stone: ["#4a4458", "#3e3a4c", "#57526a"],
  stoneTop: "#6b6584",
  hemiSky: "#a9b8ff",
  hemiGround: "#2a1d4a",
  key: "#ffe8cf",
  rim: "#7fa8ff",
  portal: "#b45cff",
  portalCore: "#2a0a4a",
  vortexIdle: ["#0b1a4a", "#2f7bff", "#bfe6ff"],
  vortexActive: ["#3a0a0a", "#ff5a1a", "#ffd27a"],
  chain: "#7f8ea8",
};
