/* Skyhold TD — render/towers.js
   All 40 of Circle's towers as voxel models (Circle has 2D art for the 15 fire/ice/nature towers; those
   designs are followed closely, the other 25 extend the same language: a stepped elemental plinth on the
   3×3 footprint, a strong central silhouette, a glowing core).

   Every model grows with the tower: stage 0 = Lv 1–3, 1 = Lv 4–6, 2 = Lv 7–9, 3 = Lv 10 (crowned).
   Mutations add orbiting shards (Circle marks them with a pink dot). Models are built once per
   (tower, stage, mutations) and cloned — clones share geometry and materials.

   Builder contract: draw into parts {base, aim, spin, float} (Part = lit + glow batch), return
   { ay, sy, fy, spinIn, spinRate, bob, muzzle:[x,y,z] (in aim space if there is an aim, else root) }.
   The aim part's +z faces the target. */
import * as THREE from "three";
import { Part, rng, shade, mix, TAU } from "./kit.js";

const STAGE_OF = (level) => (level >= 10 ? 3 : level >= 7 ? 2 : level >= 4 ? 1 : 0);
export const towerStage = STAGE_OF;

// ---------------------------------------------------------------------------
// shared primitives
// ---------------------------------------------------------------------------
function crystal(p, x, y, z, h, c, k = 1.8, w = 0.4, tilt = 0) {
  p.g(w, h * 0.6, w, c, x, y + h * 0.3, z, k, { rotY: 0.78, rotZ: tilt });
  p.g(w * 0.62, h * 0.4, w * 0.62, c, x + Math.sin(tilt) * -h * 0.3, y + h * 0.75, z, k * 1.1, { rotY: 0.78, rotZ: tilt });
}
function flame(p, x, y, z, s = 1, hot = "#ff9a1a", core = "#ff4a0a") {
  p.g(0.7 * s, 0.6 * s, 0.7 * s, core, x, y + 0.3 * s, z, 2.0, { rotY: 0.78 });
  p.g(0.5 * s, 0.55 * s, 0.5 * s, hot, x, y + 0.8 * s, z, 2.3, { rotY: 0.2 });
  p.g(0.28 * s, 0.4 * s, 0.28 * s, "#ffd25a", x, y + 1.2 * s, z, 2.6, { rotY: 0.9 });
}
function hring(p, r, y, c, n = 12, s = 0.4, glow = 0, h = null) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    if (glow) p.g(s * 1.4, h || s, s, c, Math.cos(a) * r, y, Math.sin(a) * r, glow, { rotY: -a });
    else p.b(s * 1.4, h || s, s, c, Math.cos(a) * r, y, Math.sin(a) * r, { rotY: -a });
  }
}
function vring(p, r, yc, z, c, n = 14, s = 0.35, glow = 0) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    if (glow) p.g(s, s, s, c, Math.cos(a) * r, yc + Math.sin(a) * r, z, glow, { rotZ: a });
    else p.b(s * 1.3, s, s, c, Math.cos(a) * r, yc + Math.sin(a) * r, z, { rotZ: a });
  }
}
function octo(p, r, h, c, x, y, z, top) { p.b(r * 2, h, r * 2, c, x, y, z, { top }); p.b(r * 2, h, r * 2, c, x, y, z, { top, rotY: Math.PI / 4 }); }

// ---------------------------------------------------------------------------
// PLINTHS — one per element; grows with the stage
// ---------------------------------------------------------------------------
const PLINTH = {
  fire(p, st, E) {
    p.b(2.9, 0.35, 2.9, "#3a2a26", 0, 0.17, 0, { top: "#5a463e" });
    for (let i = -1; i <= 1; i++) { p.g(2.86, 0.04, 0.06, "#ff6a2a", 0, 0.36, i * 0.95, 1.8); p.g(0.06, 0.04, 2.86, "#ff6a2a", i * 0.95, 0.36, 0, 1.8); }
    if (st >= 1) p.b(2.1, 0.3, 2.1, "#46322c", 0, 0.5, 0, { top: "#644c42" });
    const ch = st >= 2 ? 0.9 : 0.45;
    for (const [x, z] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) {
      p.b(0.42, ch, 0.42, "#2c201c", x, 0.35 + ch / 2, z, { top: "#4a3630" });
      p.g(0.24, 0.3, 0.24, st >= 2 ? "#ffb15c" : "#ff6a2a", x, 0.5 + ch, z, 2.6);
    }
    return st >= 1 ? 0.65 : 0.35;
  },
  ice(p, st) {
    p.b(2.9, 0.35, 2.9, "#a9c9e0", 0, 0.17, 0, { top: "#e8f4fb" });
    for (const s of [-1, 1]) for (let i = 0; i < 5; i++) { p.g(0.16, 0.3, 0.16, "#bff0ff", -1.2 + i * 0.6, 0.0, s * 1.42, 1.15); p.g(0.16, 0.3, 0.16, "#bff0ff", s * 1.42, 0.0, -1.2 + i * 0.6, 1.15); }
    if (st >= 1) p.b(2.1, 0.3, 2.1, "#c3dcee", 0, 0.5, 0, { top: "#f2fbff" });
    for (const [x, z] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) crystal(p, x, 0.35, z, st >= 2 ? 1.1 : 0.6, "#7fd8ff", 1.2, 0.3);
    return st >= 1 ? 0.65 : 0.35;
  },
  nature(p, st) {
    octo(p, 1.4, 0.35, "#7a7a6a", 0, 0.17, 0, "#8f8f7c");
    p.b(2.6, 0.06, 2.6, "#5f8a3a", 0, 0.36, 0, { top: "#6f9a44", rotY: 0.3 });
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; p.b(1.2, 0.16, 0.16, "#5a4228", Math.cos(a) * 1.3, 0.1, Math.sin(a) * 1.3, { rotY: -a + 0.6 }); }
    if (st >= 1) octo(p, 1.0, 0.3, "#8a8a76", 0, 0.5, 0, "#9a9a86");
    for (const [x, z] of [[-1.15, -1.15], [1.15, -1.15], [-1.15, 1.15], [1.15, 1.15]]) {
      p.b(0.3, 0.3, 0.3, "#6a6a5a", x, 0.5, z);
      crystal(p, x, 0.6, z, st >= 2 ? 0.8 : 0.45, "#9cff7a", 1.4, 0.24);
    }
    if (st >= 1) { p.b(0.14, 0.2, 0.14, "#efe2c8", 0.9, 0.45, -0.4); p.b(0.36, 0.12, 0.36, "#d9483a", 0.9, 0.6, -0.4); }
    return st >= 1 ? 0.65 : 0.38;
  },
  storm(p, st) {
    p.b(2.9, 0.35, 2.9, "#3a4060", 0, 0.17, 0, { top: "#4c5478" });
    p.g(2.92, 0.05, 0.08, "#b98cff", 0, 0.3, 1.42, 1.6); p.g(2.92, 0.05, 0.08, "#b98cff", 0, 0.3, -1.42, 1.6);
    if (st >= 1) p.b(2.0, 0.3, 2.0, "#454c70", 0, 0.5, 0, { top: "#5a628a" });
    const rh = st >= 2 ? 1.6 : 0.9;
    for (const [x, z] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) {
      p.b(0.14, rh, 0.14, "#8a92b0", x, 0.35 + rh / 2, z);
      p.g(0.22, 0.22, 0.22, "#ecd1ff", x, 0.45 + rh, z, 2.8);
    }
    return st >= 1 ? 0.65 : 0.35;
  },
  light(p, st) {
    p.b(2.9, 0.35, 2.9, "#e8dcb8", 0, 0.17, 0, { top: "#fff6dc" });
    p.b(2.95, 0.08, 2.95, "#d9b84a", 0, 0.3, 0);
    p.b(2.8, 0.06, 2.8, "#fff6dc", 0, 0.36, 0);
    if (st >= 1) p.b(2.0, 0.3, 2.0, "#f2e8c6", 0, 0.5, 0, { top: "#fffaea" });
    const ph = st >= 2 ? 1.3 : 0.7;
    for (const [x, z] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) {
      p.b(0.34, ph, 0.34, "#f2e8c6", x, 0.35 + ph / 2, z, { top: "#fff4d0" });
      p.b(0.44, 0.12, 0.44, "#d9b84a", x, 0.4 + ph, z);
      p.g(0.2, 0.2, 0.2, "#ffe066", x, 0.6 + ph, z, 2.6, { rotY: 0.78 });
    }
    return st >= 1 ? 0.65 : 0.37;
  },
  darkness(p, st) {
    p.b(2.9, 0.35, 2.9, "#1e1830", 0, 0.17, 0, { top: "#2c2442" });
    for (const [x, z] of [[0, 1.0], [0, -1.0], [1.0, 0], [-1.0, 0]]) p.g(0.3, 0.04, 0.3, "#a98aff", x, 0.36, z, 2, { rotY: 0.78 });
    if (st >= 1) p.b(2.0, 0.3, 2.0, "#251d3c", 0, 0.5, 0, { top: "#352a55" });
    const sh = st >= 2 ? 1.5 : 0.8;
    for (const [x, z] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) {
      p.b(0.38, sh, 0.38, "#140f20", x, 0.35 + sh / 2, z, { rotY: 0.78 });
      p.b(0.2, 0.4, 0.2, "#1c1530", x, 0.55 + sh, z, { rotY: 0.78 });
      if (st >= 2) p.g(0.14, 0.14, 0.14, "#a98aff", x, 0.35 + sh * 0.6, z + (z > 0 ? 0.2 : -0.2), 2.4);
    }
    return st >= 1 ? 0.65 : 0.35;
  },
  mech(p, st) {
    p.b(2.9, 0.35, 2.9, "#4a5056", 0, 0.17, 0, { top: "#6e757c" });
    for (let i = 0; i < 6; i++) p.b(0.48, 0.06, 0.12, i % 2 ? "#1a1a1a" : "#e0a020", -1.2 + i * 0.48, 0.36, 1.38);
    for (const [x, z] of [[-1.25, -1.25], [1.25, -1.25], [-1.25, 1.25], [1.25, 1.25]]) p.b(0.16, 0.08, 0.16, "#2a2e32", x, 0.38, z);
    if (st >= 1) p.b(2.0, 0.3, 2.0, "#555b61", 0, 0.5, 0, { top: "#7a8188" });
    if (st >= 2) for (const [x, z] of [[-1.2, 1.2], [1.2, -1.2]]) { p.b(0.3, 0.9, 0.3, "#3a3f44", x, 0.8, z); p.g(0.22, 0.14, 0.22, "#7fe8ff", x, 1.3, z, 2.6); }
    return st >= 1 ? 0.65 : 0.35;
  },
  abnormal(p, st) {
    p.b(2.9, 0.35, 2.9, "#3b2842", 0, 0.17, 0, { top: "#55395f" });
    p.g(2.0, 0.04, 0.1, "#ff5fa2", 0.2, 0.36, 0.3, 1.8, { rotY: 0.5 }); p.g(1.2, 0.04, 0.08, "#5dffb0", -0.4, 0.36, -0.6, 1.6, { rotY: -0.9 });
    if (st >= 1) p.b(2.0, 0.3, 2.0, "#45304d", 0.12, 0.5, -0.08, { top: "#64466e", rotY: 0.12 });
    const cs = st >= 2 ? 0.42 : 0.28;
    for (const [x, z, y] of [[-1.2, -1.2, 1.0], [1.25, -1.1, 0.7], [-1.1, 1.25, 0.6], [1.2, 1.2, 1.2]]) p.g(cs, cs, cs, (x * z > 0) ? "#ff5fa2" : "#5dffb0", x, y + (st >= 2 ? 0.4 : 0), z, 1.8, { rotX: x, rotZ: z });
    return st >= 1 ? 0.65 : 0.35;
  },
};

// ---------------------------------------------------------------------------
// HEADS — 40 unique silhouettes. (P, h = top of the plinth, st = stage, E = element colours)
// ---------------------------------------------------------------------------
const HEADS = {
  // ===== FIRE ==============================================================
  fire_0(P, h, st) { // Flame Tower: masterwork basalt-and-bronze ember forge
    const B = P.base, F = P.float;
    const basalt = "#302725", stone = "#493831", stoneHi = "#665044";
    const iron = "#211e1d", bronze = "#89613e", gold = "#b58a53";
    const ember = st >= 2 ? "#d9682c" : "#bd4b24";
    const corners = [[-0.58, -0.58], [0.58, -0.58], [-0.58, 0.58], [0.58, 0.58]];

    // Foundation: stepped, cut-stone courses with dark joints and a restrained bronze reveal.
    B.b(1.92, 0.20, 1.92, "#1e1917", 0, h + 0.10, 0, { top: "#41312a", jitter: 0.02 });
    B.b(1.78, 0.13, 1.78, basalt, 0, h + 0.265, 0, { top: "#584238", jitter: 0.035 });
    B.b(1.56, 0.10, 1.56, "#211a17", 0, h + 0.38, 0, { top: "#392923", jitter: 0.02 });
    B.b(1.44, 0.10, 1.44, stone, 0, h + 0.48, 0, { top: stoneHi, jitter: 0.035 });
    // Individually dressed corner stones and inset bronze corner keys.
    for (const [x, z] of corners) {
      B.b(0.36, 0.18, 0.36, "#211a17", x * 1.34, h + 0.43, z * 1.34, { top: "#725542", jitter: 0.02 });
      B.b(0.27, 0.08, 0.27, bronze, x * 1.34, h + 0.54, z * 1.34, { top: "#c09258", jitter: 0.01 });
      B.b(0.07, 0.035, 0.07, "#d4aa70", x * 1.34, h + 0.59, z * 1.34, { jitter: 0 });
    }
    // Four low feet carry the furnace visually above its plinth.
    for (const [x, z] of corners) {
      B.b(0.31, 0.24, 0.31, basalt, x, h + 0.65, z, { top: "#705442", jitter: 0.03 });
      B.b(0.35, 0.055, 0.35, iron, x, h + 0.55, z, { top: bronze, jitter: 0.01 });
    }

    // Main furnace housing: large readable masonry masses with carved, recessed side panels.
    B.b(1.32, 0.82, 1.32, basalt, 0, h + 1.02, 0, { top: "#725542", jitter: 0.035 });
    B.b(1.18, 0.66, 1.18, stone, 0, h + 1.05, 0, { top: stoneHi, jitter: 0.035 });
    B.b(0.98, 0.53, 0.98, iron, 0, h + 1.08, 0, { top: "#302523", jitter: 0.01 });

    // Front-facing inset service panel, layered like a fitted iron door rather than a glowing screen.
    B.b(0.73, 0.42, 0.065, "#211a18", 0, h + 1.03, 0.69, { top: "#49372d", jitter: 0.01 });
    B.b(0.59, 0.29, 0.035, "#302522", 0, h + 1.04, 0.745, { top: "#3b2b23", jitter: 0.01 });
    B.b(0.39, 0.045, 0.035, bronze, 0, h + 1.15, 0.775, { jitter: 0.01 });
    B.b(0.045, 0.19, 0.035, gold, -0.22, h + 1.04, 0.775, { jitter: 0.01 });
    B.b(0.045, 0.19, 0.035, gold, 0.22, h + 1.04, 0.775, { jitter: 0.01 });
    B.b(0.075, 0.075, 0.035, "#d5a66a", 0, h + 1.04, 0.80, { jitter: 0 });
    B.g(0.045, 0.045, 0.02, "#e7a44b", 0, h + 1.04, 0.82, 0.85);

    // Side armor plates and narrow heat slots; subtle enough to read as metal inset into stone.
    for (const s of [-1, 1]) {
      B.b(0.055, 0.46, 0.52, iron, s * 0.665, h + 1.03, 0, { jitter: 0.01 });
      B.b(0.035, 0.32, 0.34, "#6a4934", s * 0.697, h + 1.03, 0, { jitter: 0.01 });
      for (let i = 0; i < 3; i++) {
        B.b(0.025, 0.045, 0.21, ember, s * 0.72, h + 0.92 + i * 0.105, 0, { jitter: 0 });
      }
      B.b(0.09, 0.11, 0.09, gold, s * 0.63, h + 1.29, 0.32, { jitter: 0.01 });
      B.b(0.09, 0.11, 0.09, gold, s * 0.63, h + 0.77, 0.32, { jitter: 0.01 });
    }

    // Heavy forged binding rings and segmented corner clamps.
    B.b(1.48, 0.095, 1.48, iron, 0, h + 0.69, 0, { jitter: 0.01 });
    B.b(1.43, 0.04, 1.43, bronze, 0, h + 0.75, 0, { jitter: 0.01 });
    B.b(1.38, 0.07, 1.38, iron, 0, h + 1.36, 0, { jitter: 0.01 });
    B.b(1.43, 0.045, 1.43, gold, 0, h + 1.40, 0, { jitter: 0.01 });
    for (const [x, z] of corners) {
      B.b(0.16, 0.40, 0.13, iron, x * 1.12, h + 1.04, z * 1.12, { top: bronze, jitter: 0.01 });
      B.b(0.075, 0.075, 0.045, gold, x * 1.16, h + 1.05, z * 1.16, { jitter: 0 });
      B.b(0.075, 0.075, 0.045, gold, x * 1.16, h + 1.22, z * 1.16, { jitter: 0 });
    }

    // The open brazier is a real framed cavity. Layered rim blocks have bevel-like steps and visible joints.
    B.b(1.56, 0.13, 0.25, basalt, 0, h + 1.54, -0.66, { top: "#725542", jitter: 0.02 });
    B.b(1.56, 0.13, 0.25, basalt, 0, h + 1.54, 0.66, { top: "#725542", jitter: 0.02 });
    B.b(0.25, 0.13, 1.08, basalt, -0.66, h + 1.54, 0, { top: "#725542", jitter: 0.02 });
    B.b(0.25, 0.13, 1.08, basalt, 0.66, h + 1.54, 0, { top: "#725542", jitter: 0.02 });
    B.b(1.43, 0.07, 0.12, stoneHi, 0, h + 1.63, -0.66, { jitter: 0.015 });
    B.b(1.43, 0.07, 0.12, stoneHi, 0, h + 1.63, 0.66, { jitter: 0.015 });
    B.b(0.12, 0.07, 1.19, stoneHi, -0.66, h + 1.63, 0, { jitter: 0.015 });
    B.b(0.12, 0.07, 1.19, stoneHi, 0.66, h + 1.63, 0, { jitter: 0.015 });
    B.b(0.94, 0.035, 0.94, "#171211", 0, h + 1.49, 0, { top: "#251915", jitter: 0.01 });
    B.g(0.58, 0.025, 0.58, "#8f321c", 0, h + 1.52, 0, 0.95);
    B.g(0.31, 0.02, 0.31, "#d65b25", 0, h + 1.54, 0, 1.05);

    // Forged braces run from the bowl to the body; pins and seams break up the broad surfaces.
    for (const s of [-1, 1]) {
      B.b(0.10, 0.31, 0.10, bronze, s * 0.72, h + 1.34, 0.47, { rotZ: -s * 0.13, jitter: 0.01 });
      B.b(0.10, 0.31, 0.10, bronze, 0.47, h + 1.34, s * 0.72, { rotX: s * 0.13, jitter: 0.01 });
      B.b(0.065, 0.065, 0.035, gold, s * 0.71, h + 1.36, 0.53, { jitter: 0 });
      B.b(0.065, 0.065, 0.035, gold, 0.53, h + 1.36, s * 0.71, { jitter: 0 });
    }
    // Small chisel-cut vent marks on the visible faces: dark grooves with one warm reflection.
    for (const s of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        B.b(0.045, 0.12, 0.025, "#201917", s * (0.32 + i * 0.1), h + 0.96, 0.684, { jitter: 0 });
      }
      B.b(0.27, 0.035, 0.025, "#7a4f34", s * 0.43, h + 1.24, 0.69, { jitter: 0.01 });
    }

    // Stage 2: a larger outer frame, individually keyed corner blocks and side fire bowls.
    if (st >= 1) {
      B.b(1.88, 0.09, 0.11, iron, 0, h + 1.72, -0.84, { top: "#644a38", jitter: 0.01 });
      B.b(1.88, 0.09, 0.11, iron, 0, h + 1.72, 0.84, { top: "#644a38", jitter: 0.01 });
      B.b(0.11, 0.09, 1.58, iron, -0.84, h + 1.72, 0, { top: "#644a38", jitter: 0.01 });
      B.b(0.11, 0.09, 1.58, iron, 0.84, h + 1.72, 0, { top: "#644a38", jitter: 0.01 });
      for (const [x, z] of corners) {
        B.b(0.22, 0.20, 0.22, stone, x * 1.28, h + 1.70, z * 1.28, { top: stoneHi, jitter: 0.02 });
        B.b(0.10, 0.045, 0.10, gold, x * 1.28, h + 1.82, z * 1.28, { jitter: 0 });
      }
      // Four narrow vent chimneys with deep recesses and copper lips.
      for (const [x, z] of [[-0.76, 0], [0.76, 0], [0, -0.76], [0, 0.76]]) {
        B.b(0.22, 0.18, 0.22, basalt, x, h + 1.72, z, { top: "#77563f", jitter: 0.02 });
        B.b(0.12, 0.06, 0.12, iron, x, h + 1.82, z, { jitter: 0.01 });
        B.g(0.055, 0.045, 0.055, "#d86a2c", x, h + 1.84, z, 0.95);
      }
    }
    if (st >= 2) {
      // Side braziers are supported by masonry arms and use a quieter, hotter center.
      for (const s of [-1, 1]) {
        B.b(0.52, 0.15, 0.42, basalt, s * 1.02, h + 0.72, 0, { top: "#604637", jitter: 0.02 });
        B.b(0.18, 0.30, 0.18, stone, s * 1.02, h + 0.94, 0, { top: stoneHi, jitter: 0.02 });
        B.b(0.38, 0.10, 0.38, iron, s * 1.02, h + 1.13, 0, { top: "#7b593e", jitter: 0.01 });
        B.b(0.27, 0.045, 0.27, "#211613", s * 1.02, h + 1.19, 0, { jitter: 0.01 });
        B.g(0.14, 0.22, 0.14, "#d85b27", s * 1.02, h + 1.34, 0, 0.95, { rotZ: -s * 0.15 });
        B.g(0.085, 0.18, 0.085, "#f4a847", s * 1.02, h + 1.48, 0, 1.05, { rotZ: -s * 0.2 });
        // Bronze collar rings and paired rivets make the supports feel assembled.
        B.b(0.22, 0.045, 0.22, bronze, s * 1.02, h + 0.84, 0, { jitter: 0.01 });
        B.b(0.055, 0.055, 0.035, gold, s * 0.91, h + 0.94, 0.1, { jitter: 0 });
        B.b(0.055, 0.055, 0.035, gold, s * 1.13, h + 0.94, 0.1, { jitter: 0 });
      }
      // Rear stabilizing fins keep the upper structure visually grounded.
      for (const s of [-1, 1]) {
        B.b(0.10, 0.38, 0.10, iron, 0, h + 1.39, s * 0.73, { rotX: s * 0.18, jitter: 0.01 });
        B.b(0.045, 0.24, 0.045, "#bd5428", 0, h + 1.4, s * 0.79, { jitter: 0.01 });
      }
    }
    if (st >= 3) {
      // Masterwork crown: four stepped basalt prongs, bronze inlays and a restrained ember circuit.
      for (const [x, z] of corners) {
        B.b(0.23, 0.33, 0.23, basalt, x * 1.28, h + 1.94, z * 1.28, { top: "#79573e", jitter: 0.015 });
        B.b(0.16, 0.10, 0.16, bronze, x * 1.28, h + 2.15, z * 1.28, { top: "#c09660", jitter: 0.01 });
        B.b(0.09, 0.17, 0.09, gold, x * 1.28, h + 2.28, z * 1.28, { top: "#e0b87b", jitter: 0.005 });
        B.b(0.045, 0.20, 0.045, iron, x * 1.28, h + 2.34, z * 1.28, { rotZ: x * 0.12, jitter: 0.005 });
      }
      B.b(1.40, 0.07, 0.09, bronze, 0, h + 1.91, 0.64, { jitter: 0.01 });
      B.b(1.40, 0.07, 0.09, bronze, 0, h + 1.91, -0.64, { jitter: 0.01 });
      B.b(0.09, 0.07, 1.20, bronze, 0.64, h + 1.91, 0, { jitter: 0.01 });
      B.b(0.09, 0.07, 1.20, bronze, -0.64, h + 1.91, 0, { jitter: 0.01 });
      for (const [x, z] of [[-0.64, -0.64], [0.64, -0.64], [-0.64, 0.64], [0.64, 0.64]]) {
        B.g(0.075, 0.04, 0.075, "#e18a39", x, h + 1.96, z, 0.9);
      }
      // Small forged crest at the rear gives the top stage a unique profile without a huge halo.
      B.b(0.14, 0.42, 0.14, basalt, 0, h + 2.12, -0.82, { top: "#78563d", jitter: 0.01 });
      B.b(0.09, 0.22, 0.09, gold, 0, h + 2.39, -0.82, { jitter: 0.005 });
    }

    // Flame is deliberately built mostly from shaded solid facets; restrained glow accents preserve shape under bloom.
    const fs = 0.9 + st * 0.09;
    F.b(0.52 * fs, 0.72 * fs, 0.42 * fs, "#a9361f", 0.015, 0.25 * fs, 0, { rotY: 0.32, rotZ: -0.12, jitter: 0.01 });
    F.b(0.40 * fs, 0.78 * fs, 0.34 * fs, "#d84c22", -0.025, 0.57 * fs, 0.01, { rotY: 0.12, rotZ: 0.17, jitter: 0.01 });
    F.b(0.30 * fs, 0.68 * fs, 0.25 * fs, "#f4772c", 0.045, 0.91 * fs, 0.025, { rotY: 0.58, rotZ: -0.2, jitter: 0.01 });
    F.b(0.20 * fs, 0.46 * fs, 0.18 * fs, "#ffb64b", 0.01, 1.16 * fs, 0.04, { rotY: 0.24, rotZ: 0.13, jitter: 0.005 });
    F.b(0.11 * fs, 0.26 * fs, 0.10 * fs, "#ffe29a", -0.018, 1.32 * fs, 0.055, { rotY: 0.68, rotZ: -0.15, jitter: 0.005 });
    F.g(0.13 * fs, 0.32 * fs, 0.11 * fs, "#e56a2a", -0.05, 0.66 * fs, 0.06, 0.8, { rotY: 0.4, rotZ: 0.2 });
    F.g(0.075 * fs, 0.20 * fs, 0.07 * fs, "#ffc35a", 0.015, 1.12 * fs, 0.08, 0.9, { rotY: 0.3, rotZ: -0.12 });

    return { fy: h + 1.68, bob: 0.035, muzzle: [0, h + 2.45 + st * 0.1, 0] };
  },
  fire_1(P, h, st) { // Fireball Tower: a swivel cannon, fireball glowing at its mouth
    const B = P.base, A = P.aim;
    octo(B, 0.7, 0.6, "#3a2a26", 0, h + 0.3, 0, "#55403a");
    A.b(1.3, 0.5, 1.0, "#2c201c", 0, 0, 0, { top: "#4a3630" });
    A.push(0, 0.35, 0.2, 0, -0.45);
    A.b(0.62, 0.62, 1.9, "#3d2b26", 0, 0, 0.6, { top: "#5a443a" });
    A.b(0.78, 0.78, 0.3, "#c9a24a", 0, 0, 0.0); A.b(0.78, 0.78, 0.3, "#c9a24a", 0, 0, 1.5);
    A.g(0.5, 0.5, 0.5, "#ffb15c", 0, 0, 1.75, 3);
    A.g(0.7, 0.7, 0.4, "#ff6a2a", 0, 0, 1.95, 2.2);
    A.pop();
    if (st >= 2) { A.b(0.3, 0.3, 0.9, "#2c201c", 0.75, 0.15, -0.1); A.g(0.2, 0.2, 0.2, "#ff6a2a", 0.75, 0.15, -0.6, 2.4); }
    return { ay: h + 0.8, muzzle: [0, 1.2, 2.0] };
  },
  fire_2(P, h, st) { // Magma Tower: a squat forge with a magma pool and flame vents
    const B = P.base;
    B.b(2.0, 0.7, 2.0, "#3a2a26", 0, h + 0.35, 0, { top: "#4a3630" });
    B.g(1.4, 0.06, 1.4, "#ff5a1a", 0, h + 0.72, 0, 2);
    B.g(0.9, 0.08, 0.9, "#ffb15c", 0, h + 0.74, 0, 2.6);
    B.b(1.0, 1.0, 1.0, "#2c201c", 0, h + 1.2, 0, { top: "#46322c" });
    for (const [x, z] of [[-0.85, -0.85], [0.85, -0.85], [-0.85, 0.85], [0.85, 0.85]]) { B.b(0.4, 0.5, 0.4, "#46322c", x, h + 0.95, z); flame(B, x, h + 1.2, z, 0.38); }
    flame(P.float, 0, 0, 0, 0.8 + st * 0.12);
    return { fy: h + 1.7, bob: 0.04, muzzle: [0, h + 2.2, 0] };
  },
  fire_3(P, h, st) { // Inferno Tower: a tall spire around a column of flame
    const B = P.base;
    const H = 2.6 + st * 0.35;
    for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) { B.b(0.42, H, 0.42, "#2c201c", x, h + H / 2, z, { top: "#4a3630" }); B.g(0.06, H * 0.8, 0.06, "#ff6a2a", x * 0.7, h + H / 2, z * 1.32, 1.6); }
    B.b(1.6, 0.25, 1.6, "#3a2a26", 0, h + 0.4, 0);
    B.b(1.7, 0.25, 1.7, "#3a2a26", 0, h + H, 0, { top: "#5a463e" });
    for (let i = 0; i < 4; i++) B.g(0.55 - i * 0.05, 0.6, 0.55 - i * 0.05, i % 2 ? "#ffb15c" : "#ff6a2a", 0, h + 0.8 + i * 0.6, 0, 2.3 + i * 0.2, { rotY: i * 0.4 });
    flame(P.float, 0, 0, 0, 1.2 + st * 0.12);
    return { fy: h + H + 0.1, bob: 0.08, muzzle: [0, h + H + 1.2, 0] };
  },
  fire_4(P, h, st) { // Phoenix Spire: a firebird with spread wings over a burning nest
    const B = P.base, F = P.float;
    B.b(1.6, 0.7, 1.6, "#2c201c", 0, h + 0.35, 0, { top: "#46322c" });
    B.b(1.1, 0.9, 1.1, "#3a2a26", 0, h + 1.15, 0);
    B.b(1.6, 0.25, 1.6, "#2c201c", 0, h + 1.7, 0);
    flame(B, 0, h + 1.8, 0, 0.6);
    F.g(0.6, 0.9, 0.6, "#ff6a2a", 0, 0, 0, 2.4);
    F.g(0.42, 0.42, 0.5, "#ffb15c", 0, 0.6, 0.15, 2.8);
    F.g(0.16, 0.12, 0.3, "#ffe066", 0, 0.55, 0.45, 3);
    for (const s of [-1, 1]) {
      F.g(1.2, 0.18, 0.6, "#ff6a2a", s * 0.85, 0.25, 0, 2.2, { rotZ: s * 0.45 });
      F.g(1.1, 0.16, 0.5, "#ffb15c", s * 1.65, 0.75, -0.05, 2.6, { rotZ: s * 0.7 });
      F.g(0.7, 0.14, 0.4, "#fff1c2", s * 2.15, 1.25, -0.1, 3, { rotZ: s * 0.95 });
    }
    F.g(0.3, 0.7, 0.2, "#ff6a2a", 0, -0.55, -0.3, 2.2, { rotX: 0.5 });
    if (st >= 2) for (let i = 0; i < 3; i++) F.g(0.14, 0.4, 0.14, "#ffe066", (i - 1) * 0.18, 1.0, 0.05, 3, { rotZ: (i - 1) * 0.4 });
    return { fy: h + 2.7 + st * 0.12, bob: 0.18, muzzle: [0, h + 3.0, 0] };
  },

  // ===== ICE ===============================================================
  ice_0(P, h, st) { // Frost Tower: a tall crystal spire on stepped ice
    const B = P.base;
    B.b(1.4, 0.7, 1.4, "#c3dcee", 0, h + 0.35, 0, { top: "#eef8ff" });
    B.b(1.0, 0.6, 1.0, "#a9c9e0", 0, h + 1.0, 0, { top: "#e8f4fb" });
    crystal(B, 0, h + 1.2, 0, 2.4 + st * 0.35, "#7fd8ff", 1.25, 0.6);
    for (const [x, z] of [[-0.45, 0.3], [0.45, -0.3], [0.3, 0.45]]) crystal(B, x, h + 1.25, z, 1.0, "#bff0ff", 1.3, 0.3, x);
    return { muzzle: [0, h + 3.4, 0] };
  },
  ice_1(P, h, st) { // Icicle Tower: a frost ballista loaded with a long icicle
    const B = P.base, A = P.aim;
    B.b(1.0, 0.6, 1.0, "#a9c9e0", 0, h + 0.3, 0, { top: "#e8f4fb" });
    A.b(1.4, 0.35, 1.2, "#8ab6d4", 0, 0, 0, { top: "#cfe6f5" });
    A.b(2.4, 0.2, 0.3, "#6f93b4", 0, 0.25, 0.4);
    for (const s of [-1, 1]) A.b(0.25, 0.5, 0.25, "#5a7a9a", s * 1.15, 0.35, 0.4);
    A.g(0.32, 0.32, 2.4, "#bff0ff", 0, 0.45, 0.6, 1.4);
    A.g(0.2, 0.2, 0.5, "#ffffff", 0, 0.45, 1.95, 1.8);
    if (st >= 2) for (const s of [-1, 1]) A.g(0.18, 0.18, 1.2, "#7fd8ff", s * 0.45, 0.35, 0.3, 1.3);
    return { ay: h + 0.75, muzzle: [0, 0.45, 2.1] };
  },
  ice_2(P, h, st) { // Glacier Tower: a heavy frost cannon with a crystal drill
    const B = P.base, A = P.aim;
    octo(B, 0.8, 0.7, "#a9c9e0", 0, h + 0.35, 0, "#e8f4fb");
    A.b(1.6, 0.8, 1.4, "#8ab6d4", 0, 0, 0, { top: "#cfe6f5" });
    A.push(0, 0.2, 0.5, 0, -0.25);
    A.b(0.9, 0.9, 1.4, "#6f93b4", 0, 0, 0.5);
    for (let i = 0; i < 3; i++) A.g(0.8 - i * 0.22, 0.8 - i * 0.22, 0.4, i % 2 ? "#bff0ff" : "#7fd8ff", 0, 0, 1.3 + i * 0.35, 1.3, { rotZ: 0.78 });
    A.pop();
    for (const s of [-1, 1]) crystal(A, s * 0.75, 0.4, -0.4, 0.8 + st * 0.15, "#bff0ff", 1.2, 0.26);
    return { ay: h + 1.0, muzzle: [0, 0.6, 2.4] };
  },
  ice_3(P, h, st) { // Blizzard Tower: an ice obelisk wrapped in a whirling snow ring
    const B = P.base, S = P.spin;
    const H = 2.8 + st * 0.3;
    B.b(1.0, H, 1.0, "#c3dcee", 0, h + H / 2, 0, { top: "#eef8ff" });
    B.b(1.3, 0.3, 1.3, "#a9c9e0", 0, h + 0.15, 0);
    B.g(0.4, H * 0.7, 0.4, "#7fd8ff", 0, h + H * 0.5, 0.42, 1.3);
    crystal(B, 0, h + H, 0, 1.0, "#bff0ff", 1.3, 0.5);
    hring(S, 1.5, 0, "#ffffff", 14, 0.28, 1.25, 0.2);
    hring(S, 1.1, 0.9, "#dff6ff", 10, 0.24, 1.25, 0.18);
    if (st >= 2) hring(S, 1.8, -0.7, "#bff0ff", 16, 0.2, 1.3, 0.15);
    return { sy: h + 1.4, spinRate: 1.6, muzzle: [0, h + H, 0] };
  },
  ice_4(P, h, st) { // Absolute Zero: a frozen orb in a crystal cradle inside a swirling aura
    const B = P.base, F = P.float, S = P.spin;
    for (const [x, z] of [[-0.75, -0.75], [0.75, -0.75], [-0.75, 0.75], [0.75, 0.75]]) crystal(B, x, h, z, 2.0 + st * 0.2, "#7fd8ff", 1.2, 0.36, -x * 0.25);
    B.b(1.4, 0.4, 1.4, "#a9c9e0", 0, h + 0.2, 0, { top: "#eef8ff" });
    F.g(1.1, 1.1, 1.1, "#5bd6ff", 0, 0, 0, 1.6, { rotY: 0.78, rotX: 0.6 });
    F.g(0.7, 0.7, 0.7, "#e8fbff", 0, 0, 0, 2.6, { rotY: 0.2, rotX: 0.2 });
    hring(S, 1.4, 0, "#dff6ff", 16, 0.22, 1.3, 0.18);
    vring(S, 1.25, 0, 0, "#bff0ff", 12, 0.2, 1.3);
    return { fy: h + 2.0, sy: h + 2.0, spinRate: 1.1, bob: 0.12, muzzle: [0, h + 2.0, 0] };
  },

  // ===== NATURE ============================================================
  nature_0(P, h, st) { // Thorn Tower: a cone of woven thorns with leaf crystals
    const B = P.base;
    for (let i = 0; i < 6; i++) { const w = 1.5 - i * 0.22; B.b(w, 0.5, w, i % 2 ? "#4a6a2a" : "#5a4228", 0, h + 0.25 + i * 0.45, 0, { rotY: i * 0.5, top: "#6a8a3a" }); }
    for (let i = 0; i < 10; i++) { const a = i * 2.4, y = h + 0.4 + (i / 10) * 2.2, r = 0.9 - (i / 10) * 0.6; B.b(0.12, 0.12, 0.55, "#c9b98a", Math.cos(a) * r, y, Math.sin(a) * r, { rotY: -a, rotX: 0.4 }); }
    crystal(B, 0, h + 2.8, 0, 1.0 + st * 0.2, "#9cff7a", 1.5, 0.35);
    if (st >= 2) for (const s of [-1, 1]) crystal(B, s * 0.6, h + 1.4, 0, 0.6, "#73d35f", 1.4, 0.22, s * 0.6);
    return { muzzle: [0, h + 3.3, 0] };
  },
  nature_1(P, h, st) { // Spore Tower: a giant mushroom on a vine stem
    const B = P.base, F = P.float;
    B.b(0.7, 1.8, 0.7, "#e8dcc0", 0, h + 0.9, 0, { top: "#f2e8d0" });
    for (let i = 0; i < 4; i++) B.b(0.16, 1.6, 0.16, "#4a7a2c", Math.cos(i * 1.6) * 0.42, h + 0.8, Math.sin(i * 1.6) * 0.42, { rotZ: (i - 1.5) * 0.15 });
    const cap = 2.2 + st * 0.25;
    B.b(cap, 0.55, cap, "#b8743a", 0, h + 2.0, 0, { top: "#d08848" });
    B.b(cap * 0.7, 0.45, cap * 0.7, "#c88044", 0, h + 2.45, 0, { top: "#e0a060" });
    for (let i = 0; i < 6; i++) B.b(0.24, 0.1, 0.24, "#f2e0c0", Math.cos(i) * cap * 0.32, h + 2.69, Math.sin(i * 1.7) * cap * 0.3);
    for (let i = 0; i < 5; i++) P.float.g(0.18, 0.18, 0.18, "#c6f5b5", Math.cos(i * 1.3) * 0.9, i * 0.25, Math.sin(i * 1.3) * 0.9, 1.6);
    return { fy: h + 3.0, bob: 0.2, muzzle: [0, h + 2.8, 0] };
  },
  nature_2(P, h, st) { // Bramble Tower: a woven vine arch around a glowing green heart
    const B = P.base, F = P.float;
    for (let i = 0; i <= 8; i++) { const a = Math.PI * (i / 8); B.b(0.4, 0.4, 0.5, i % 2 ? "#5a4228" : "#4a6a2a", Math.cos(a) * 1.0, h + 0.3 + Math.sin(a) * 2.0, 0, { rotZ: a, top: "#6a8a3a" }); }
    for (const s of [-1, 1]) { B.b(0.5, 0.6, 0.6, "#5a4228", s * 1.0, h + 0.3, 0); for (let k = 0; k < 3; k++) B.b(0.1, 0.1, 0.45, "#c9b98a", s * (1.0 + 0.2), h + 0.6 + k * 0.5, 0.1, { rotY: s * 0.8 }); }
    F.g(0.6, 0.9, 0.6, "#73d35f", 0, 0, 0, 1.8, { rotY: 0.78 });
    F.g(0.36, 0.5, 0.36, "#c6f5b5", 0, 0, 0.1, 2.4, { rotY: 0.3 });
    if (st >= 2) B.b(0.9, 0.5, 0.6, "#62ad55", 0, h + 2.4, 0, { top: "#86c052" });
    return { fy: h + 1.2, bob: 0.1, muzzle: [0, h + 1.2, 0.3] };
  },
  nature_3(P, h, st) { // Venom Tower: a carnivorous plant, jaws open, dripping venom
    const B = P.base, A = P.aim;
    B.b(0.9, 1.2, 0.9, "#4a6a2a", 0, h + 0.6, 0, { top: "#5a7a32" });
    for (let i = 0; i < 4; i++) B.b(1.2, 0.18, 0.5, "#5f9a3a", Math.cos(i * 1.57) * 0.6, h + 0.2, Math.sin(i * 1.57) * 0.6, { rotY: -i * 1.57, rotZ: 0.3 });
    A.b(1.3, 0.7, 1.3, "#3f6a2a", 0, 0, 0, { top: "#4f7a32" });
    A.b(1.4, 0.4, 1.0, "#5f9a3a", 0, 0.65, 0.35, { rotX: -0.5 });
    A.b(1.4, 0.4, 1.0, "#5f9a3a", 0, -0.15, 0.45, { rotX: 0.2 });
    for (let i = 0; i < 4; i++) { A.b(0.1, 0.25, 0.1, "#f2e8d0", -0.5 + i * 0.33, 0.35, 0.8); A.b(0.1, 0.25, 0.1, "#f2e8d0", -0.5 + i * 0.33, 0.05, 0.85); }
    A.g(0.7, 0.3, 0.5, "#9cff7a", 0, 0.2, 0.45, 2.2);
    A.g(0.12, 0.5, 0.12, "#73d35f", 0.2, -0.2, 0.9, 2);
    if (st >= 2) for (const s of [-1, 1]) A.b(0.8, 0.12, 0.5, "#86c052", s * 0.9, 0.0, -0.2, { rotZ: s * 0.4 });
    return { ay: h + 1.6, muzzle: [0, 0.2, 0.9] };
  },
  nature_4(P, h, st) { // World Tree: an ancient tree holding a glowing seed in its trunk
    const B = P.base, F = P.float;
    const H = 2.2 + st * 0.3;
    B.b(1.1, H, 1.1, "#6b4a2e", 0, h + H / 2, 0, { top: "#7a5a3a" });
    for (let i = 0; i < 4; i++) B.b(0.35, 0.5, 1.2, "#5a4228", Math.cos(i * 1.57 + 0.78) * 0.7, h + 0.25, Math.sin(i * 1.57 + 0.78) * 0.7, { rotY: -i * 1.57 - 0.78 });
    const L = (w, hh, d, x, y, z, c) => B.b(w, hh, d, c, x, h + y, z, { ao: 0.8 });
    L(2.3, 0.9, 2.3, 0, H + 0.35, 0, "#4f9a45"); L(1.7, 0.8, 1.7, 0.15, H + 1.1, -0.1, "#5aa64c"); L(1.0, 0.6, 1.0, -0.1, H + 1.7, 0.1, "#62ad55");
    L(0.9, 0.7, 0.9, 1.0, H + 0.1, 0.4, "#468c3e"); L(0.8, 0.6, 0.8, -0.95, H + 0.3, -0.5, "#468c3e");
    B.g(0.6, 0.6, 0.15, "#9cff7a", 0, h + H * 0.5, 0.56, 2.6);
    for (let i = 0; i < 6; i++) F.g(0.16, 0.16, 0.16, "#c6f5b5", Math.cos(i) * 1.8, Math.sin(i * 2) * 0.5, Math.sin(i) * 1.8, 2);
    return { fy: h + H + 1.0, bob: 0.25, muzzle: [0, h + H * 0.5, 0.6] };
  },

  // ===== STORM =============================================================
  storm_0(P, h, st) { // Spark Tower: a lightning rod with a crackling ball
    const B = P.base;
    B.b(1.0, 0.8, 1.0, "#3a4060", 0, h + 0.4, 0, { top: "#4c5478" });
    B.b(0.3, 2.0 + st * 0.3, 0.3, "#8a92b0", 0, h + 1.6 + st * 0.15, 0);
    for (let i = 0; i < 3; i++) B.b(0.7 - i * 0.15, 0.1, 0.7 - i * 0.15, "#b0b8d4", 0, h + 1.2 + i * 0.5, 0);
    P.float.g(0.6, 0.6, 0.6, "#c77dff", 0, 0, 0, 2.2, { rotY: 0.78, rotX: 0.6 });
    P.float.g(0.38, 0.38, 0.38, "#ffffff", 0, 0, 0, 3);
    return { fy: h + 3.0 + st * 0.3, bob: 0.05, muzzle: [0, h + 3.0 + st * 0.3, 0] };
  },
  storm_1(P, h, st) { // Tesla Tower: a coil of copper rings crowned with a charge orb
    const B = P.base;
    B.b(1.4, 0.5, 1.4, "#3a4060", 0, h + 0.25, 0, { top: "#4c5478" });
    const n = 5 + st;
    for (let i = 0; i < n; i++) { B.b(0.5, 0.36, 0.5, "#5a628a", 0, h + 0.7 + i * 0.4, 0); octo(B, 0.55 - i * 0.03, 0.1, "#c98a4a", 0, h + 0.65 + i * 0.4, 0, "#e0a060"); }
    const top = h + 0.7 + n * 0.4;
    octo(B, 0.85, 0.2, "#8a92b0", 0, top, 0, "#b0b8d4");
    P.float.g(0.8, 0.8, 0.8, "#c77dff", 0, 0, 0, 2.2, { rotY: 0.78, rotX: 0.6 });
    P.float.g(0.5, 0.5, 0.5, "#f4e6ff", 0, 0, 0, 3);
    return { fy: top + 0.7, bob: 0.06, muzzle: [0, top + 0.7, 0] };
  },
  storm_2(P, h, st) { // Cyclone Tower: a funnel of wind rings spinning over a vent
    const B = P.base, S = P.spin;
    octo(B, 0.8, 0.5, "#3a4060", 0, h + 0.25, 0, "#4c5478");
    B.g(0.9, 0.06, 0.9, "#ecd1ff", 0, h + 0.52, 0, 1.8);
    for (let i = 0; i < 6 + st; i++) {
      const r = 0.35 + i * 0.22, y = i * 0.42;
      const n = 6 + i * 2;
      for (let k = 0; k < n; k++) { const a = (k / n) * TAU + i * 0.5; S.g(0.22, 0.16, 0.12, i % 2 ? "#d9c2ff" : "#ffffff", Math.cos(a) * r, y, Math.sin(a) * r, 1.15, { rotY: -a }); }
    }
    return { sy: h + 0.7, spinRate: 3.5, muzzle: [0, h + 2.2, 0] };
  },
  storm_3(P, h, st) { // Thunder Tower: a stone tower capped by a storm cloud and a bolt crystal
    const B = P.base, F = P.float;
    B.b(1.4, 2.0, 1.4, "#343a5a", 0, h + 1.0, 0, { top: "#4c5478" });
    B.b(1.7, 0.3, 1.7, "#454c70", 0, h + 2.1, 0);
    for (const s of [-1, 1]) B.g(0.08, 1.5, 0.08, "#c77dff", s * 0.72, h + 1.0, 0.3, 2.2);
    F.b(2.0, 0.6, 1.4, "#5a6080", 0, 0.3, 0, { ao: 0.8 }); F.b(1.3, 0.5, 1.2, "#6a7090", 0.3, 0.75, 0.1, { ao: 0.85 }); F.b(1.0, 0.5, 1.0, "#4a5070", -0.6, 0.55, -0.1);
    F.g(0.3, 1.0, 0.3, "#ecd1ff", 0.1, -0.6, 0.2, 3, { rotZ: 0.4 });
    F.g(0.3, 0.7, 0.3, "#c77dff", -0.15, -1.2, 0.2, 2.6, { rotZ: -0.5 });
    if (st >= 2) F.b(0.9, 0.4, 0.9, "#5a6080", 1.1, 0.4, -0.3);
    return { fy: h + 3.2 + st * 0.15, bob: 0.1, muzzle: [0, h + 2.4, 0] };
  },
  storm_4(P, h, st) { // Storm Nexus: a great floating crystal circled by rods and rings
    const B = P.base, F = P.float, S = P.spin;
    B.b(1.6, 0.6, 1.6, "#3a4060", 0, h + 0.3, 0, { top: "#4c5478" });
    for (const [x, z] of [[-0.9, 0], [0.9, 0], [0, 0.9], [0, -0.9]]) { B.b(0.25, 1.6, 0.25, "#8a92b0", x, h + 1.1, z); B.g(0.18, 0.18, 0.18, "#ecd1ff", x, h + 2.0, z, 3); }
    F.g(0.9, 1.6, 0.9, "#c77dff", 0, 0, 0, 1.8, { rotY: 0.78 });
    F.g(0.6, 1.0, 0.6, "#f4e6ff", 0, 0.1, 0, 2.6, { rotY: 0.3 });
    hring(S, 1.5, 0, "#ecd1ff", 16, 0.2, 1.8, 0.15);
    vring(S, 1.35, 0, 0, "#b98cff", 14, 0.2, 1.8);
    if (st >= 2) hring(S, 1.9, 0.6, "#c77dff", 18, 0.18, 1.8, 0.12);
    return { fy: h + 2.8, sy: h + 2.8, spinRate: 1.4, bob: 0.15, muzzle: [0, h + 2.8, 0] };
  },

  // ===== LIGHT =============================================================
  light_0(P, h, st) { // Beam Tower: a gold-framed lens on a marble column
    const B = P.base, A = P.aim;
    B.b(0.8, 1.4, 0.8, "#f2e8c6", 0, h + 0.7, 0, { top: "#fff4d0" });
    B.b(1.1, 0.2, 1.1, "#d9b84a", 0, h + 1.45, 0);
    A.b(0.4, 0.8, 0.4, "#d9b84a", 0, 0.1, 0);
    vring(A, 0.62, 0.7, 0.1, "#d9b84a", 12, 0.24);
    A.g(0.9, 0.9, 0.12, "#fff6c2", 0, 0.7, 0.12, 2.2);
    A.g(0.4, 0.4, 0.14, "#ffffff", 0, 0.7, 0.2, 3);
    if (st >= 2) for (const s of [-1, 1]) A.b(0.12, 0.5, 0.12, "#d9b84a", s * 0.8, 0.7, 0.1);
    return { ay: h + 1.6, muzzle: [0, 0.7, 0.3] };
  },
  light_1(P, h, st) { // Prism Tower: a floating prism refracting light
    const B = P.base, F = P.float;
    B.b(1.2, 0.5, 1.2, "#f2e8c6", 0, h + 0.25, 0, { top: "#fff4d0" });
    for (const [x, z] of [[-0.5, -0.5], [0.5, 0.5], [-0.5, 0.5], [0.5, -0.5]]) B.b(0.18, 1.2, 0.18, "#d9b84a", x, h + 1.0, z);
    F.g(1.0, 1.0, 1.0, "#fff6c2", 0, 0, 0, 1.9, { rotX: 0.62, rotZ: 0.78 });
    F.g(0.5, 0.5, 0.5, "#ffffff", 0, 0, 0, 3, { rotY: 0.78 });
    for (const [c, a] of [["#ff7a7a", 0], ["#7affb0", 2.1], ["#7ab4ff", 4.2]]) F.g(0.14, 0.14, 0.7, c, Math.cos(a) * 0.8, -0.3, Math.sin(a) * 0.8, 2.4, { rotY: -a });
    return { fy: h + 2.3 + st * 0.15, bob: 0.15, spinIn: "float", sy: 0, spinRate: 0.8, muzzle: [0, h + 2.3, 0] };
  },
  light_2(P, h, st) { // Sanctuary: a small columned shrine with a radiant altar (supports nearby towers)
    const B = P.base;
    B.b(2.0, 0.3, 2.0, "#efe6cc", 0, h + 0.15, 0, { top: "#fffaea" });
    for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) { B.b(0.3, 1.6, 0.3, "#f2e8c6", x, h + 1.1, z, { top: "#fff4d0" }); B.b(0.42, 0.12, 0.42, "#d9b84a", x, h + 1.95, z); }
    B.b(2.2, 0.25, 2.2, "#efe6cc", 0, h + 2.1, 0, { top: "#fffaea" });
    B.b(1.5, 0.35, 1.5, "#d9b84a", 0, h + 2.4, 0);
    B.b(0.8, 0.3, 0.8, "#efe6cc", 0, h + 2.7, 0);
    B.b(0.7, 0.5, 0.7, "#e8dcb4", 0, h + 0.55, 0);
    P.float.g(0.5, 0.5, 0.5, "#ffe066", 0, 0, 0, 2.6, { rotY: 0.78, rotX: 0.6 });
    if (st >= 2) P.float.g(0.3, 0.3, 0.3, "#ffffff", 0, 0.4, 0, 3);
    return { fy: h + 1.2, bob: 0.08, spinIn: "float", sy: 0, spinRate: 1, muzzle: [0, h + 1.2, 0] };
  },
  light_3(P, h, st) { // Radiance Tower: a sun disc with rays on a marble pillar
    const B = P.base, S = P.spin;
    B.b(0.9, 2.0, 0.9, "#f2e8c6", 0, h + 1.0, 0, { top: "#fff4d0" });
    B.b(1.2, 0.2, 1.2, "#d9b84a", 0, h + 2.05, 0);
    S.g(1.1, 1.1, 0.3, "#ffe066", 0, 0, 0, 2.2, { rotZ: 0.78 });
    S.g(0.7, 0.7, 0.34, "#fff6c2", 0, 0, 0, 3);
    for (let i = 0; i < 8 + st * 2; i++) { const a = (i / (8 + st * 2)) * TAU; S.g(0.18, 0.7, 0.14, "#ffd23d", Math.cos(a) * 1.05, Math.sin(a) * 1.05, 0, 2, { rotZ: a - Math.PI / 2 }); }
    return { sy: h + 3.0, spinRate: 0.6, spinAxis: "z", muzzle: [0, h + 3.0, 0] };
  },
  light_4(P, h, st) { // Solar Spire: a tall golden obelisk carrying a sun
    const B = P.base, F = P.float;
    const H = 3.2 + st * 0.35;
    for (let i = 0; i < 4; i++) B.b(1.1 - i * 0.18, H / 4, 1.1 - i * 0.18, i % 2 ? "#f2e8c6" : "#e8dcb4", 0, h + (i + 0.5) * (H / 4), 0, { top: "#fff4d0" });
    for (let i = 0; i < 4; i++) B.b(1.15 - i * 0.18, 0.1, 1.15 - i * 0.18, "#d9b84a", 0, h + (i + 1) * (H / 4), 0);
    F.g(1.0, 1.0, 1.0, "#ffd23d", 0, 0, 0, 2.2, { rotY: 0.78, rotX: 0.6 });
    F.g(0.6, 0.6, 0.6, "#ffffff", 0, 0, 0, 3.2);
    hring(P.spin, 1.0, 0, "#ffe066", 12, 0.2, 2.4, 0.12);
    return { fy: H + h + 0.9, sy: H + h + 0.9, spinRate: 1.2, bob: 0.1, muzzle: [0, H + h + 0.9, 0] };
  },

  // ===== DARKNESS ==========================================================
  darkness_0(P, h, st) { // Shadow Tower: a black obelisk with a watching violet eye
    const B = P.base, A = P.aim;
    B.b(1.0, 1.6, 1.0, "#140f20", 0, h + 0.8, 0, { top: "#2a2142" });
    A.b(1.1, 1.1, 1.1, "#1e1830", 0, 0, 0, { top: "#2c2442" });
    A.b(0.6, 0.6, 0.6, "#140f20", 0, 0.75, 0, { rotY: 0.78 });
    A.g(0.6, 0.4, 0.1, "#a98aff", 0, 0, 0.56, 2.2);
    A.g(0.2, 0.3, 0.12, "#ffffff", 0, 0, 0.6, 3);
    if (st >= 2) for (const s of [-1, 1]) A.b(0.2, 0.8, 0.2, "#140f20", s * 0.65, 0.5, 0, { rotZ: -s * 0.4 });
    return { ay: h + 2.15, muzzle: [0, 0, 0.7] };
  },
  darkness_1(P, h, st) { // Curse Tower: a horned skull totem burning with violet fire
    const B = P.base;
    B.b(0.8, 1.6, 0.8, "#2a2030", 0, h + 0.8, 0, { top: "#3a2e44" });
    B.b(1.1, 0.9, 1.0, "#e6dcc8", 0, h + 2.0, 0, { top: "#f2ead8" });
    B.b(0.8, 0.4, 0.9, "#d4c8b0", 0, h + 1.45, 0.05);
    B.g(0.24, 0.22, 0.05, "#a98aff", -0.24, h + 2.05, 0.5, 2.6); B.g(0.24, 0.22, 0.05, "#a98aff", 0.24, h + 2.05, 0.5, 2.6);
    for (const s of [-1, 1]) { B.b(0.24, 0.24, 0.7, "#cfc2a8", s * 0.7, h + 2.4, -0.1, { rotY: s * 0.9 }); B.b(0.2, 0.6, 0.2, "#bfb298", s * 0.95, h + 2.75, -0.3, { rotZ: -s * 0.3 }); }
    flame(P.float, 0, 0, 0, 0.6 + st * 0.1, "#cbb9ff", "#8b6cff");
    return { fy: h + 2.5, bob: 0.06, muzzle: [0, h + 2.1, 0.5] };
  },
  darkness_2(P, h, st) { // Void Tower: a floating black sphere ringed by violet matter
    const B = P.base, F = P.float, S = P.spin;
    for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) B.b(0.3, 1.0, 0.3, "#140f20", x, h + 0.5, z, { rotY: 0.78 });
    F.b(1.3, 1.3, 1.3, "#07050c", 0, 0, 0, { rotY: 0.78, rotX: 0.6 });
    F.b(1.0, 1.0, 1.0, "#0e0a18", 0, 0, 0, { rotX: 0.3 });
    hring(S, 1.3, 0, "#8b6cff", 18, 0.24, 1.9, 0.08);
    hring(S, 1.0, 0, "#cbb9ff", 12, 0.18, 2.4, 0.06);
    return { fy: h + 1.9, sy: h + 1.9, spinRate: 2, bob: 0.15, muzzle: [0, h + 1.9, 0] };
  },
  darkness_3(P, h, st) { // Reaper Tower: a hooded reaper raising a scythe
    const B = P.base, A = P.aim;
    A.b(1.1, 1.6, 0.9, "#1e1830", 0, 0.8, 0, { top: "#2c2442" });
    A.b(1.3, 0.4, 1.1, "#140f20", 0, 0.1, 0);
    A.b(0.8, 0.8, 0.8, "#1e1830", 0, 1.9, 0, { top: "#2c2442" });
    A.b(0.6, 0.55, 0.12, "#05030a", 0, 1.85, 0.4);
    A.g(0.12, 0.1, 0.05, "#a98aff", -0.13, 1.9, 0.47, 3); A.g(0.12, 0.1, 0.05, "#a98aff", 0.13, 1.9, 0.47, 3);
    A.b(0.12, 2.6, 0.12, "#4a3a2a", 0.7, 1.4, 0.3, { rotX: 0.2 });
    A.b(1.3, 0.14, 0.2, "#c8c8d8", 0.25, 2.6, 0.55, { rotZ: 0.25, top: "#eeeef8" });
    A.b(0.7, 0.14, 0.2, "#c8c8d8", -0.45, 2.35, 0.55, { rotZ: 0.8 });
    if (st >= 2) A.g(1.2, 0.06, 0.06, "#a98aff", 0.25, 2.52, 0.66, 2.2, { rotZ: 0.25 });
    return { ay: h, muzzle: [0, 1.9, 0.6] };
  },
  darkness_4(P, h, st) { // Eclipse Spire: a dark spire holding an eclipsed sun with a violet corona
    const B = P.base, S = P.spin;
    const H = 3.0 + st * 0.3;
    for (let i = 0; i < 5; i++) B.b(1.1 - i * 0.16, H / 5, 1.1 - i * 0.16, i % 2 ? "#1e1830" : "#140f20", 0, h + (i + 0.5) * (H / 5), 0, { rotY: i * 0.2 });
    for (const s of [-1, 1]) B.b(0.25, 1.4, 0.25, "#140f20", s * 0.75, h + H - 0.3, 0, { rotZ: -s * 0.5 });
    S.b(1.4, 1.4, 0.3, "#05030a", 0, 0, 0, { rotZ: 0.78 });
    S.b(1.4, 1.4, 0.3, "#05030a", 0, 0, 0);
    for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU; S.g(0.2, 0.5, 0.12, i % 2 ? "#cbb9ff" : "#8b6cff", Math.cos(a) * 1.0, Math.sin(a) * 1.0, -0.05, 2.4, { rotZ: a - Math.PI / 2 }); }
    return { sy: h + H + 1.0, spinRate: 0.4, spinAxis: "z", muzzle: [0, h + H + 1.0, 0] };
  },

  // ===== MECH ==============================================================
  mech_0(P, h, st) { // Gun Turret: twin barrels on a riveted swivel
    const B = P.base, A = P.aim;
    octo(B, 0.7, 0.6, "#4a5056", 0, h + 0.3, 0, "#6e757c");
    A.b(1.4, 0.7, 1.3, "#5a6066", 0, 0, 0, { top: "#7a8188" });
    A.b(1.2, 0.2, 1.0, "#e0a020", 0, -0.3, -0.05);
    const n = st >= 2 ? 3 : 2;
    for (let i = 0; i < n; i++) { const x = (i - (n - 1) / 2) * 0.36; A.b(0.2, 0.2, 1.5, "#2a2e32", x, 0.05, 1.0); A.b(0.28, 0.28, 0.25, "#3a3f44", x, 0.05, 1.7); }
    A.g(0.3, 0.12, 0.05, "#7fe8ff", 0, 0.25, 0.66, 2.4);
    return { ay: h + 0.95, muzzle: [0, 0.05, 1.9] };
  },
  mech_1(P, h, st) { // Saw Blade: spinning circular saws on a hub (melee)
    const B = P.base, S = P.spin;
    B.b(1.0, 0.9, 1.0, "#4a5056", 0, h + 0.45, 0, { top: "#6e757c" });
    B.g(0.3, 0.3, 0.3, "#ffb84a", 0, h + 1.0, 0, 2.4);
    const blade = (y, r) => { for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; S.b(0.5, 0.08, 0.3, i % 2 ? "#c8ccd4" : "#9aa0aa", Math.cos(a) * r, y, Math.sin(a) * r, { rotY: -a + 0.5, top: "#eef0f4" }); } S.b(r * 1.5, 0.1, r * 1.5, "#7a8188", 0, y, 0); };
    blade(0, 1.15); if (st >= 1) blade(0.45, 0.9);
    S.b(0.4, 0.8, 0.4, "#3a3f44", 0, 0.2, 0);
    return { sy: h + 0.9, spinRate: 9, muzzle: [0, h + 0.9, 0] };
  },
  mech_2(P, h, st) { // Railgun: twin rails with glowing coils
    const B = P.base, A = P.aim;
    B.b(1.2, 0.8, 1.2, "#4a5056", 0, h + 0.4, 0, { top: "#6e757c" });
    A.b(1.0, 0.6, 1.4, "#5a6066", 0, 0, -0.2, { top: "#7a8188" });
    for (const s of [-1, 1]) A.b(0.16, 0.36, 3.0, "#3a3f44", s * 0.3, 0.1, 1.0);
    for (let i = 0; i < 4 + st; i++) A.g(0.5, 0.08, 0.12, "#7fe8ff", 0, 0.3, 0.1 + i * 0.5, 2.4);
    A.b(0.5, 0.5, 0.6, "#2a2e32", 0, 0.1, -0.9);
    return { ay: h + 1.1, muzzle: [0, 0.1, 2.5] };
  },
  mech_3(P, h, st) { // Magnet Tower: a great horseshoe magnet pulling the field
    const B = P.base, S = P.spin;
    B.b(1.0, 1.0, 1.0, "#4a5056", 0, h + 0.5, 0, { top: "#6e757c" });
    S.b(0.5, 1.4, 0.5, "#c8423a", -0.75, 0.7, 0); S.b(0.5, 1.4, 0.5, "#c8423a", 0.75, 0.7, 0);
    S.b(2.0, 0.5, 0.5, "#c8423a", 0, 0, 0);
    S.b(0.55, 0.35, 0.55, "#d8dce4", -0.75, 1.55, 0, { top: "#ffffff" }); S.b(0.55, 0.35, 0.55, "#d8dce4", 0.75, 1.55, 0, { top: "#ffffff" });
    S.g(1.0, 0.08, 0.08, "#7fe8ff", 0, 1.6, 0, 2.2);
    if (st >= 2) S.g(0.08, 0.08, 1.0, "#7fe8ff", 0, 1.6, 0, 2.2);
    return { sy: h + 1.15, spinRate: 0.7, muzzle: [0, h + 2.5, 0] };
  },
  mech_4(P, h, st) { // War Factory: a factory block with a smokestack and missile pods
    const B = P.base, A = P.aim;
    B.b(2.0, 1.2, 1.6, "#5a6066", 0, h + 0.6, -0.1, { top: "#7a8188" });
    B.b(0.5, 1.6, 0.5, "#3a3f44", -0.6, h + 1.8, -0.5);
    B.g(0.4, 0.15, 0.4, "#ffb84a", -0.6, h + 2.65, -0.5, 1.8);
    B.b(1.9, 0.12, 0.2, "#e0a020", 0, h + 0.9, 0.72);
    A.b(1.0, 0.5, 1.0, "#4a5056", 0, 0, 0, { top: "#6e757c" });
    for (const s of [-1, 1]) { A.b(0.5, 0.5, 1.0, "#3a3f44", s * 0.55, 0.3, 0.2); for (let k = 0; k < 2; k++) A.g(0.14, 0.14, 0.1, "#ff6a3d", s * 0.55 + (k - 0.5) * 0.2, 0.3, 0.72, 2.4); }
    if (st >= 2) A.b(0.3, 0.3, 0.6, "#2a2e32", 0, 0.65, 0.2);
    return { ay: h + 1.45, muzzle: [0, 0.3, 0.8] };
  },

  // ===== ABNORMAL ==========================================================
  abnormal_0(P, h, st) { // Glitch Tower: stacked cubes that never quite line up
    const B = P.base, F = P.float;
    const offs = [[0, 0], [0.25, -0.15], [-0.2, 0.2], [0.15, 0.25], [-0.25, -0.1]];
    for (let i = 0; i < 3 + st; i++) { const [x, z] = offs[i % 5]; B.b(1.1 - i * 0.12, 0.5, 1.1 - i * 0.12, i % 2 ? "#45304d" : "#3b2842", x, h + 0.25 + i * 0.5, z, { rotY: i * 0.3, top: "#64466e" }); }
    F.g(0.5, 0.5, 0.5, "#ff5fa2", 0.2, 0, 0, 2.2, { rotY: 0.4 });
    F.g(0.36, 0.36, 0.36, "#5dffb0", -0.25, 0.3, 0.1, 2.2, { rotX: 0.6 });
    F.g(0.6, 0.06, 0.6, "#ffc2dd", 0, -0.35, 0, 2);
    return { fy: h + 2.1 + st * 0.5, bob: 0.2, muzzle: [0, h + 2.1 + st * 0.5, 0] };
  },
  abnormal_1(P, h, st) { // Warp Tower: a standing ring around a fold in space
    const B = P.base, S = P.spin;
    B.b(1.4, 0.5, 0.8, "#3b2842", 0, h + 0.25, 0, { top: "#55395f" });
    for (const s of [-1, 1]) B.b(0.35, 1.2, 0.5, "#45304d", s * 0.9, h + 0.9, 0);
    vring(S, 1.15, 0, 0, "#7a5a84", 18, 0.36);
    for (let i = 0; i < 6; i++) S.g(0.22, 0.22, 0.22, i % 2 ? "#ff5fa2" : "#5dffb0", Math.cos(i) * 1.15, Math.sin(i) * 1.15, 0.05, 2.2);
    S.g(1.4, 1.4, 0.08, "#ff5fa2", 0, 0, 0, 1.3, { rotZ: 0.78 });
    S.g(0.8, 0.8, 0.1, "#ffc2dd", 0, 0, 0, 2.2, { rotZ: 0.3 });
    return { sy: h + 1.9, spinRate: 1.2, spinAxis: "z", muzzle: [0, h + 1.9, 0] };
  },
  abnormal_2(P, h, st) { // Chaos Tower: mismatched blocks orbiting an unstable core
    const B = P.base, F = P.float, S = P.spin;
    B.b(1.0, 1.0, 1.0, "#3b2842", 0, h + 0.5, 0, { rotY: 0.4, top: "#55395f" });
    F.g(0.7, 0.7, 0.7, "#ff5fa2", 0, 0, 0, 2.2, { rotX: 0.7, rotZ: 0.4 });
    F.g(0.4, 0.4, 0.4, "#ffffff", 0, 0, 0, 3);
    const r = rng(71);
    for (let i = 0; i < 9 + st * 2; i++) { const a = r() * TAU, d = 0.9 + r() * 0.6; const c = ["#5dffb0", "#c77dff", "#ff5fa2", "#45304d", "#64466e"][i % 5]; if (i % 5 > 2) S.b(0.3, 0.3, 0.3, c, Math.cos(a) * d, (r() - 0.5) * 1.2, Math.sin(a) * d, { rotX: r() * 3, rotZ: r() * 3 }); else S.g(0.24, 0.24, 0.24, c, Math.cos(a) * d, (r() - 0.5) * 1.2, Math.sin(a) * d, 2, { rotX: r() * 3 }); }
    return { fy: h + 1.9, sy: h + 1.9, spinRate: 2.6, bob: 0.12, muzzle: [0, h + 1.9, 0] };
  },
  abnormal_3(P, h, st) { // Paradox Tower: an impossible frame around a corrupted core
    const B = P.base, S = P.spin;
    B.b(0.8, 0.8, 0.8, "#3b2842", 0, h + 0.4, 0, { top: "#55395f" });
    const L = 1.8;
    S.b(L, 0.3, 0.3, "#7a5a84", 0, -L / 2, -L / 2); S.b(0.3, L, 0.3, "#64466e", L / 2, 0, -L / 2); S.b(0.3, 0.3, L, "#8a6a94", L / 2, L / 2, 0);
    S.b(L, 0.3, 0.3, "#7a5a84", 0, L / 2, L / 2); S.b(0.3, L, 0.3, "#64466e", -L / 2, 0, L / 2); S.b(0.3, 0.3, L, "#8a6a94", -L / 2, -L / 2, 0);
    S.g(0.6, 0.6, 0.6, "#ff5fa2", 0, 0, 0, 2.4, { rotX: 0.6, rotY: 0.78 });
    S.g(0.3, 0.3, 0.3, "#5dffb0", 0, 0, 0, 3);
    return { sy: h + 2.1, spinRate: 0.9, spinAxis: "xyz", muzzle: [0, h + 2.1, 0] };
  },
  abnormal_4(P, h, st) { // Reality Engine: a lopsided machine around a floating eye
    const B = P.base, F = P.float, S = P.spin;
    B.b(1.8, 1.0, 1.2, "#3b2842", 0.2, h + 0.5, -0.2, { rotY: 0.2, top: "#55395f" });
    B.b(0.6, 1.8, 0.6, "#45304d", -0.8, h + 0.9, 0.5, { rotZ: 0.15 });
    B.g(0.3, 0.3, 0.3, "#5dffb0", -0.8, h + 1.95, 0.5, 2.4);
    B.b(0.5, 0.5, 1.4, "#45304d", 0.9, h + 1.2, 0.3, { rotX: 0.3 });
    F.b(1.0, 1.0, 1.0, "#f2e8f6", 0, 0, 0, { rotY: 0.78 });
    F.g(0.6, 0.6, 0.12, "#ff5fa2", 0, 0, 0.55, 2.6, { rotY: 0 });
    F.g(0.25, 0.25, 0.14, "#05030a", 0, 0, 0.6, 1);
    vring(S, 1.4, 0, 0, "#c77dff", 16, 0.2, 1.8);
    hring(S, 1.6, 0, "#5dffb0", 16, 0.16, 1.8, 0.12);
    return { fy: h + 2.6 + st * 0.15, sy: h + 2.6 + st * 0.15, spinRate: 1.1, bob: 0.14, muzzle: [0, h + 2.6, 0] };
  },
};

// ---------------------------------------------------------------------------
// ASSEMBLY + CACHE
// ---------------------------------------------------------------------------
const cache = new Map();
function assemble(def, stage, mutCount, E) {
  const P = { base: new Part(11), aim: new Part(12), spin: new Part(13), float: new Part(14) };
  const h = (PLINTH[def.element] || PLINTH.fire)(P.base, stage, E);
  const head = HEADS[def.id] || HEADS.fire_0;
  const scale = 1 + stage * 0.07;
  // the head grows with the stage, scaled about the top of the plinth (the plinth itself grows by steps)
  for (const k of ["aim", "spin", "float"]) P[k].push(0, 0, 0, 0, 0, 0, scale);
  P.base.push(0, h, 0, 0, 0, 0, scale); P.base.push(0, -h, 0);
  const o = head(P, h, stage) || {};
  P.base.pop(); P.base.pop();
  const up = (y) => h + ((y || 0) - h) * scale;   // a pivot height in the scaled head
  const root = new THREE.Group();
  root.add(P.base.build(true));
  const aim = P.aim.build(true); aim.name = "aim"; aim.position.y = up(o.ay); root.add(aim);
  const flt = P.float.build(false); flt.name = "float"; flt.position.y = up(o.fy); root.add(flt);
  const spin = P.spin.build(false); spin.name = "spin";
  if (o.spinIn === "float") { spin.position.y = 0; flt.add(spin); } else { spin.position.y = up(o.sy); root.add(spin); }
  // stage 3 (Lv 10): a crown halo of the element's light
  if (stage >= 3) {
    const crown = new Part(31);
    hring(crown, 1.65, 0, E.glow, 10, 0.14, 1.6, 0.08);
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.4; crown.g(0.22, 0.4, 0.22, E.color, Math.cos(a) * 1.65, 0.25, Math.sin(a) * 1.65, 2.6, { rotY: 0.78 }); }
    const cg = crown.build(false); cg.name = "crown"; cg.position.y = h + 0.15; root.add(cg);
  }
  // mutations: orbiting pink shards (Circle marks a mutated tower with a pink pip)
  if (mutCount > 0) {
    const mp = new Part(41);
    for (let i = 0; i < mutCount; i++) { const a = i * Math.PI; mp.g(0.3, 0.5, 0.3, "#ff5fa2", Math.cos(a) * 1.45, 0, Math.sin(a) * 1.45, 2.6, { rotY: 0.78, rotZ: 0.3 }); mp.g(0.16, 0.16, 0.16, "#ffffff", Math.cos(a) * 1.45, 0.4, Math.sin(a) * 1.45, 3); }
    const mg = mp.build(false); mg.name = "mut"; mg.position.y = h + 1.1; root.add(mg);
  }
  const muzzle = new THREE.Object3D(); muzzle.name = "muzzle";
  const m = o.muzzle || [0, h + 1.5, 0];
  const hasAim = aim.children.length > 0;
  if (hasAim) { muzzle.position.set(m[0] * scale, m[1] * scale, m[2] * scale); aim.add(muzzle); }
  else { muzzle.position.set(m[0] * scale, up(m[1]), m[2] * scale); root.add(muzzle); }
  root.userData = { spinRate: o.spinRate || 0, spinAxis: o.spinAxis || "y", bob: o.bob || 0, hasAim, fy: up(o.fy), plinth: h };
  root.traverse((n) => { if (n.isMesh) n.userData.sharedGeo = true; });
  return root;
}

export function towerTemplate(DB, defId, stage, mutCount = 0) {
  const key = defId + "|" + stage + "|" + mutCount;
  let t = cache.get(key);
  if (!t) {
    const def = DB.TOWER_BY_ID[defId];
    t = assemble(def, stage, mutCount, DB.ELEMENTS[def.element]);
    cache.set(key, t);
  }
  return t;
}

// a live tower model (clone of the cached template) with handles for the renderer's animation
export function createTowerModel(DB, defId, stage, mutCount) {
  const tpl = towerTemplate(DB, defId, stage, mutCount);
  const root = tpl.clone(true);
  root.userData = Object.assign({}, tpl.userData);
  return {
    root,
    aim: root.getObjectByName("aim"),
    spin: root.getObjectByName("spin"),
    float: root.getObjectByName("float"),
    crown: root.getObjectByName("crown"),
    mut: root.getObjectByName("mut"),
    muzzle: root.getObjectByName("muzzle"),
    ud: root.userData,
  };
}

export const HEAD_IDS = Object.keys(HEADS);
