import * as fx from "./circle-fx.js";
import { buildBalance } from "./circle-balance.js";
import { createState, step, SIM_HZ } from "./circle-core.js";

if (!globalThis.DB) throw new Error("Circle content database did not load.");

export const balance = buildBalance(globalThis.DB);
export const SIM_DT = fx.fromFloat(1 / SIM_HZ);
export { fx, step, SIM_HZ };

export function createPortState(options = {}) {
  return createState(balance, {
    seed: options.seed || 20260424,
    mode: options.mode || "loop",
    gameMode: "solo",
    economy: options.economy || "shared",
    statusMode: "standard",
    players: [{
      corridorCount: options.corridorCount || 1,
      elements: options.elements || ["fire"]
    }]
  });
}

export function issue(state, type, payload = {}) {
  const command = { type, player: 0, ...payload };
  step(state, [command], SIM_DT);
  return command;
}

export function cellToWorld(c, r, cols, rows) {
  return { x: c - (cols - 1) / 2, z: r - (rows - 1) / 2 };
}

export function worldToCell(x, z, cols, rows) {
  return {
    c: Math.max(0, Math.min(cols - 1, Math.round(x + (cols - 1) / 2))),
    r: Math.max(0, Math.min(rows - 1, Math.round(z + (rows - 1) / 2)))
  };
}

export function getCurrentField(state, playerIndex = 0, corridorIndex = 0) {
  return state.players[playerIndex]?.corridors[corridorIndex] || null;
}
