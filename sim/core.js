/* =============================================================================
 * Circle Tower Wars — sim/core.js
 * THE PURE DETERMINISTIC SIMULATION CORE (Decisions D6/D7/D9/D10, §2/§3/§6/§7/§8).
 *
 * HARD ARCHITECTURE BOUNDARY (§2/§7): this file contains NO
 *   document, no canvas, no requestAnimationFrame, no Math.random,
 *   no Date.now / performance.now, no audio.
 * It holds the COMPLETE state of ALL players' fields and advances it with a
 * single function:  step(state, commands, SIM_DT)  ->  mutates state in place.
 *
 * Inputs over the wire are COMMANDS only (§6.1) — intent, never results.
 * Validation (enough gold? tile free?) happens here, identically on every
 * client. All state-changing maths run in fixed-point (sim/fx.js); all random
 * draws come from the seeded SIM stream (sim/rng.js). Iteration is always over
 * arrays in stable order (§3 rule 4) so the state hash matches across engines.
 *
 * The shell (render/ui/net/app) reads `state` to draw and produces commands;
 * it must never mutate `state` directly.
 *
 * SKYHOLD PORT NOTE: this file is Circle-TD's sim/core.js, unchanged in every
 * rule and number. The only additions are lines marked "[Skyhold] render-only":
 * extra entries pushed onto `state.events` (beam/chain/melee "zap" paths, "kill",
 * and the enemy id on "synergy") so the 3D renderer can draw hits that leave no
 * other trace in the state. Events are transient, never hashed, never read back
 * by the sim — gameplay and determinism are identical to Circle.
 * tools/parity-test.mjs checks this against a Circle-TD checkout.
 *
 * [Skyhold expanded] The "expanded" ruleset (cfg.ruleset === "expanded") adds
 * Skyhold's own rules on top of Circle's:
 *   - the bestiary traits (content/mobs.js) and expanded waves
 *   - send tiers with stock, recharge and unlock times
 *   - life steal in versus, and match modifiers (cfg.mods)
 *   - Warcraft-3-style builders: a tower waits for its corridor's builder,
 *     then takes time to rise, and upgrades take time too
 *   - challenge encounters, and per-player match stats
 * All of it is gated on `state.x`, which is null under the default "classic"
 * ruleset, so Classic stays byte-for-byte Circle (the parity test runs Classic).
 * The expanded code lives in the EXPANDED section at the end of this file and
 * in small `if (state.x)` hooks marked [X] in Circle's functions.
 * ===========================================================================*/

import * as fx from "./fx.js";
import * as rng from "./rng.js";
import * as pf from "./pathfind.js";
import { generateWave, generateWaveExpanded, generateChallengeWave, enemyScale, totalWaves, waveAffix } from "./waves.js";

const F = fx.fromFloat;
const HALF = fx.HALF;                  // 0.5 in fixed
export const SIM_HZ = 30;

// Grid cell codes (see pathfind.js): 0 free, 1 obstacle, 2 tower.
const CELL_FREE = 0, CELL_OBSTACLE = 1, CELL_TOWER = 2;

// ---------------------------------------------------------------------------
// STATE CONSTRUCTION
// ---------------------------------------------------------------------------
/**
 * cfg: {
 *   seed, mode ("single"|"loop"|"endless"), gameMode ("solo"|"coop"|"competitive"),
 *   economy ("shared"|"elemental"), statusMode ("standard"|"advanced"),
 *   players: [ { corridorCount, elements:[elementId,...] } ]
 * }
 */
export function createState(bal, cfg) {
  const seed = (cfg.seed >>> 0) || 1;
  const state = {
    bal,                                  // balancing data (not hashed)
    tick: 0,
    seedSim: rng.makeStream(seed),        // hashed (drives all state randomness)
    seedBase: seed,
    mode: cfg.mode || "loop",
    gameMode: cfg.gameMode || "solo",
    economy: cfg.economy || "shared",
    statusMode: cfg.statusMode || "standard",
    elementOrder: bal.elementOrder.slice(),
    grid: { cols: bal.grid.cols, rows: bal.grid.rows },
    players: [],
    enemies: [],
    projectiles: [],
    nextId: 1,
    coopLives: 0,
    netSpeed: 1,                          // synced sim-speed multiplier (host-controlled in MP)
    finished: false,
    events: [],                           // transient, shell-facing, cleared each step
  };
  // [X] expanded ruleset
  state.ruleset = cfg.ruleset === "expanded" ? "expanded" : "classic";
  state.x = state.ruleset === "expanded" ? xMods(cfg.mods || {}) : null;
  state.challenge = null;
  if (state.x) {
    state.zones = []; state.xSpawn = [];
    if (cfg.challenge && bal.challenges && bal.challenges[cfg.challenge.id]) state.challenge = { id: cfg.challenge.id, hard: !!cfg.challenge.hard, def: bal.challenges[cfg.challenge.id] };
  }

  const G = state.grid;
  const portalC = Math.floor(bal.portalCols[0]);

  (cfg.players || [{ corridorCount: 1, elements: ["fire"] }]).forEach((pc, pi) => {
    const player = {
      id: pi,
      lives: bal.startLives,
      maxLives: bal.startLives,
      gold: bal.startGold,
      essence: {},
      income: 0,                          // §8.1 passive income (competitive)
      incomeTick: 0,
      sentCount: 0,                        // total enemies sent (for rising cost §8.3)
      wave: 0,
      totalWaves: totalWaves(cfg.mode, pc.corridorCount),
      phase: "build",                      // build | wave | prep | endboss | victory | defeat
      alive: true,
      waveActive: false,
      spawnQueue: [],
      corridorCount: pc.corridorCount,
      elements: pc.elements.slice(),
      corridors: [],
      endBossId: 0,
      stats: { kills: 0, bossesKilled: 0, score: 0 },
      sendLevels: {},                      // per-type send level (competitive/versus)
    };
    for (const e of bal.elementOrder) player.essence[e] = bal.startEssence;
    for (const t in bal.sends) player.sendLevels[t] = 1;
    if (state.x) xInitPlayer(state, player, pc);

    const buildField = !((cfg.gameMode === "coop") && pi > 0); // co-op: one shared field on player 0
    for (let i = 0; buildField && i < pc.corridorCount; i++) {
      const grid = pf.makeGrid(G.cols, G.rows);
      const corr = {
        index: i,
        element: pc.elements[i % pc.elements.length],
        grid,
        dist: new Int32Array(G.cols * G.rows),
        entrance: { c: portalC, r: G.rows - 1 },
        exit: { c: portalC, r: 0 },
        towers: [],
        spawnedTotal: 0,
      };
      seedObstacles(state, corr, pi, i);
      pf.computeFlow(corr, G.cols, G.rows);
      if (state.x) xInitCorridor(state, corr);
      player.corridors.push(corr);
    }
    state.players.push(player);
  });

  state.coopLives = bal.startLives * (state.gameMode === "coop" ? state.players.length : 1);
  if (state.x) state.coopLives = state.players[0].lives * (state.gameMode === "coop" ? state.players.length : 1);
  return state;
}

// Deterministic obstacle seeding using the SIM rng (so it is identical across
// clients and reproducible from the seed alone).
function seedObstacles(state, corr, playerIdx, corrIdx) {
  const G = state.grid;
  // dedicated sub-stream derived from base seed + indices (still deterministic)
  const local = rng.makeStream((state.seedBase * 97 + playerIdx * 911 + corrIdx * 31 + 7) >>> 0);
  const dens = state.bal.obstacleDensity; // fixed [0,ONE]
  for (let r = 2; r < G.rows - 2; r++) {
    for (let c = 0; c < G.cols; c++) {
      if (rng.nextFixed(local) < dens) {
        if (c === 6 && (r < 3 || r > G.rows - 4)) continue; // keep a seam
        corr.grid[r * G.cols + c] = CELL_OBSTACLE;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// THE STEP — advances the whole simulation by one fixed tick.
// commands: array already ordered deterministically (by player, then sequence).
// SIM_DT: fixed-point seconds (e.g. fx.fromFloat(1/30)).
// ---------------------------------------------------------------------------
export function step(state, commands, SIM_DT) {
  state.events.length = 0;
  state.tick++;

  // 1) Apply player commands (validated in-core, identical on all clients).
  if (commands && commands.length) {
    for (let i = 0; i < commands.length; i++) applyCommand(state, commands[i]);
  }

  // 2) Spawn queued enemies whose time has come.
  updateSpawns(state);

  // [X] builders, auras, visibility, tower debuffs
  if (state.x) xPreStep(state, SIM_DT);

  // 3) Towers acquire targets and fire (per player, per corridor, stable order).
  for (let pi = 0; pi < state.players.length; pi++) {
    const pl = state.players[pi];
    if (!pl.alive) continue;
    for (let ci = 0; ci < pl.corridors.length; ci++) updateTowers(state, pl, pl.corridors[ci], SIM_DT);
  }

  // 4) Projectiles travel and impact.
  updateProjectiles(state, SIM_DT);

  // 5) Enemies: statuses, movement, transitions, loops, lives.
  updateEnemies(state, SIM_DT);

  // 6) Passive income (competitive §8.1) + catch-up (§8.3).
  updateIncome(state);

  // [X] zones, minion spawns, send stock, deferred removals
  if (state.x) xPostStep(state, SIM_DT);

  // 7) Wave completion / phase transitions.
  for (let pi = 0; pi < state.players.length; pi++) checkWaveState(state, state.players[pi]);

  return state;
}

// ---------------------------------------------------------------------------
// COMMANDS (§6.1)
// ---------------------------------------------------------------------------
function applyCommand(state, cmd) {
  const pl = state.players[cmd.player];
  if (!pl || !pl.alive) return;
  switch (cmd.type) {
    case "BuildTower":   cmdBuild(state, pl, cmd); break;
    case "SellTower":    cmdSell(state, pl, cmd); break;
    case "UpgradeTower": cmdUpgrade(state, pl, cmd); break;
    case "MutateTower":  cmdMutate(state, pl, cmd); break;
    case "StartWave":    cmdStartWave(state, pl, cmd); break;
    case "SendEnemy":    cmdSendEnemy(state, pl, cmd); break;
    case "SetTargetMode": cmdSetTargetMode(state, pl, cmd); break;
    case "UpgradeSend":  cmdUpgradeSend(state, pl, cmd); break;
    case "SetSpeed":     if (cmd.player === 0) { const sp = cmd.speed | 0; state.netSpeed = sp < 1 ? 1 : (sp > 3 ? 3 : sp); } break;
    case "Ack":          break; // heartbeat, no state change
  }
}

function fieldOwner(state, pl) { return state.gameMode === "coop" ? state.players[0] : pl; }
function essenceOf(pl, element) { return pl.essence[element] | 0; }
function canAfford(state, pl, amount, element) {
  return state.economy === "shared" ? pl.gold >= amount : essenceOf(pl, element) >= amount;
}
function spend(state, pl, amount, element) {
  if (state.economy === "shared") pl.gold -= amount; else pl.essence[element] -= amount;
  if (pl.log) pl.log.goldSpent += amount; // [X]
}
function grant(state, pl, amount, element) {
  if (state.economy === "shared") pl.gold += amount; else pl.essence[element] += amount;
  if (pl.log) pl.log.goldEarned += amount; // [X]
}

function upgradeCost(state, def, level) {
  // round(cost * upgradeCostBase * costGrowth^(level-1)) — done in fixed, then to int
  const base = fx.mul(fx.fromInt(def.cost), state.bal.scaling.upgradeCostBase);
  let growth = fx.ONE;
  for (let l = 1; l < level; l++) growth = fx.mul(growth, state.bal.scaling.costGrowth);
  return fx.round(fx.mul(base, growth));
}
function totalInvested(state, tw) {
  let c = tw.def.cost;
  for (let l = 1; l < tw.level; l++) c += upgradeCost(state, tw.def, l);
  return c;
}

function cmdBuild(state, pl, cmd) {
  const corr = fieldOwner(state, pl).corridors[cmd.corridorId];
  if (!corr) return;
  const def = state.bal.towers[cmd.towerType];
  if (!def) return;
  if (def.slot >= unlockedTowerSlots(cmd.masteryLevel || 5)) return;
  if (state.challenge && state.challenge.hard && state.challenge.def.hard.maxSlots && def.slot >= state.challenge.def.hard.maxSlots) { state.events.push({ kind: "reject", player: pl.id, reason: "rule" }); return; } // [X]
  if (!canAfford(state, pl, def.cost, def.element)) { state.events.push({ kind: "reject", player: pl.id, reason: "funds" }); return; }
  const spot = findValidSpot(state, corr, cmd.gx, cmd.gy);
  if (!spot) { state.events.push({ kind: "reject", player: pl.id, reason: "noRoom" }); return; }
  const tw = placeTower(state, corr, def, spot.c, spot.r, pl.id);
  spend(state, pl, def.cost, def.element);
  if (state.x) xOnBuild(state, corr, tw, pl); // [X] the builder has to come and raise it
}

function cmdSell(state, pl, cmd) {
  const corr = fieldOwner(state, pl).corridors[cmd.corridorId]; if (!corr) return;
  const ti = corr.towers.findIndex(t => t.id === cmd.towerId); if (ti < 0) return;
  const tw = corr.towers[ti];
  if (state.challenge && state.challenge.hard && state.challenge.def.hard.noSell) { state.events.push({ kind: "reject", player: pl.id, reason: "rule" }); return; } // [X]
  const S = state.bal.towerSize, G = state.grid;
  for (let rr = tw.r; rr < tw.r + S; rr++) for (let cc = tw.c; cc < tw.c + S; cc++) corr.grid[rr * G.cols + cc] = CELL_FREE;
  corr.towers.splice(ti, 1);
  if (state.x && tw.bState) { grant(state, pl, tw.def.cost, tw.def.element); xCancelBuild(corr, tw); } // [X] cancelling a construction refunds it in full
  else grant(state, pl, fx.round(fx.mul(fx.fromInt(totalInvested(state, tw)), state.bal.sellRefund)), tw.def.element);
  pf.computeFlow(corr, G.cols, G.rows);
}

function cmdUpgrade(state, pl, cmd) {
  const corr = fieldOwner(state, pl).corridors[cmd.corridorId]; if (!corr) return;
  const tw = corr.towers.find(t => t.id === cmd.towerId); if (!tw) return;
  if (tw.level >= state.bal.maxLevel) return;
  if (state.x && (tw.bState || tw.upT > 0)) { state.events.push({ kind: "reject", player: pl.id, reason: "busy" }); return; } // [X]
  const cost = upgradeCost(state, tw.def, tw.level);
  if (!canAfford(state, pl, cost, tw.def.element)) { state.events.push({ kind: "reject", player: pl.id, reason: "funds" }); return; }
  spend(state, pl, cost, tw.def.element);
  tw.level++;
  if (state.x && state.x.builders) { tw.upT = F(0.8) + fx.mul(F(0.08), fx.fromInt(tw.level)); state.events.push({ kind: "upgrading", player: pl.id, corridor: corr.index, tower: tw.id }); } // [X] upgrades take time
}

function cmdMutate(state, pl, cmd) {
  const corr = fieldOwner(state, pl).corridors[cmd.corridorId]; if (!corr) return;
  const tw = corr.towers.find(t => t.id === cmd.towerId); if (!tw) return;
  if (tw.level < state.bal.maxLevel) { state.events.push({ kind: "reject", player: pl.id, reason: "needMax" }); return; }
  const slots = mutationSlotsAvailable(cmd.masteryLevel || 5);
  if (tw.mutations.length >= slots) { state.events.push({ kind: "reject", player: pl.id, reason: "noSlots" }); return; }
  if (tw.mutations.includes(cmd.mutId)) return;
  if (!tw.def.mutations.find(m => m.id === cmd.mutId)) return;
  tw.mutations.push(cmd.mutId);
}

// Per-tower targeting priority (display-independent, deterministic).
const TARGET_MODES = ["first", "last", "strong", "weak"];
function cmdSetTargetMode(state, pl, cmd) {
  const corr = fieldOwner(state, pl).corridors[cmd.corridorId]; if (!corr) return;
  const tw = corr.towers.find(t => t.id === cmd.towerId); if (!tw) return;
  if (!TARGET_MODES.includes(cmd.mode)) return;
  tw.targetMode = cmd.mode;
}

function cmdStartWave(state, pl, cmd) {
  if (state.x && state.x.autoWave) return; // [X] the timer calls waves
  // Versus: waves are synchronized — the human seat (player 0) starts the wave
  // for EVERY living corridor at once, so all seats face equal PvE pressure.
  if (state.gameMode === "versus") {
    if (pl.id !== 0) return;
    for (const p of state.players) if (p.alive) queueWaveFor(state, p);
    return;
  }
  queueWaveFor(state, fieldOwner(state, pl)); // co-op: the single shared field
}

function queueWaveFor(state, fp) {
  if (fp.phase === "prep") { summonEndBoss(state, fp); return; }
  if (fp.phase === "victory" || fp.phase === "defeat" || fp.phase === "endboss") return;
  if (state.mode !== "endless" && fp.wave >= fp.totalWaves) return;
  // Early-call bonus: calling the next wave while the previous one is still
  // being fought pays out immediately (risk/reward for skilled play).
  if (fp.phase === "wave") {
    const ec = state.bal.earlyCall;
    const eb = ec.base + (fp.wave + 1) * ec.perWave;
    if (state.gameMode === "coop") { for (const p of state.players) grantAll(state, p, eb); }
    else grantAll(state, fp, eb);
    state.events.push({ kind: "earlyBonus", player: fp.id, bonus: eb });
  }
  fp.wave++;
  const affix = waveAffix(state.seedBase, fp.wave, state.bal.bossEvery);
  const entries = state.x ? xWaveEntries(state, fp) : generateWave(fp.wave, fp.corridorCount, state.bal.bossEvery);
  let originRot = 0;
  for (const group of entries) {
    const count = (affix && affix.countMult) ? Math.max(1, Math.round(group.count * affix.countMult)) : group.count;
    for (let k = 0; k < count; k++) {
      const origin = group.type === "boss"
        ? rng.nextInt(state.seedSim, fp.corridorCount)
        : (originRot++ % fp.corridorCount);
      const atTick = state.tick + fx.toInt(fx.mul(group.delay + fx.mul(fx.fromInt(k), group.gap), fx.fromInt(SIM_HZ)));
      fp.spawnQueue.push({ type: group.type, origin, atTick, sent: false, wave: fp.wave });
      fp.corridors[origin].spawnedTotal++;
    }
  }
  fp.waveActive = true;
  fp.phase = "wave";
  state.events.push({ kind: "wave", player: fp.id, wave: fp.wave, boss: (fp.wave % state.bal.bossEvery === 0), affix: affix ? affix.id : null });
}

// Next living player after `id` in ring order (versus send/leak direction).
function nextAliveAfter(state, id) {
  for (let i = 1; i < state.players.length; i++) {
    const p = state.players[(id + i) % state.players.length];
    if (p.alive) return p;
  }
  return null;
}

// Competitive/versus: spend gold to spawn extra enemies on a target.
// FLAT cost per type+level; upgrading the type (cmdUpgradeSend) raises both
// cost and strength. Sending builds passive income proportional to gold spent.
function cmdSendEnemy(state, pl, cmd) {
  if (state.gameMode !== "competitive" && state.gameMode !== "versus") return;
  // versus: sends always go to the NEXT living corridor in ring order
  const target = state.gameMode === "versus" ? nextAliveAfter(state, pl.id) : state.players[cmd.target];
  if (!target || !target.alive || target === pl) return;
  const comp = state.bal.competitive;
  const type = cmd.enemyType || "grunt";
  const send = (state.x ? state.bal.sendsX : state.bal.sends)[type]; if (!send) return;
  const lvl = (pl.sendLevels && pl.sendLevels[type]) || 1;
  const cost = send.cost[lvl - 1];
  if (state.x && !xSendAllowed(state, pl, type, send)) return; // [X] rules, tier unlocks and stock
  if (!canAfford(state, pl, cost, pl.elements[0])) { state.events.push({ kind: "reject", player: pl.id, reason: "funds" }); return; }
  // cap on concurrent sent enemies per target (§8.3)
  let activeSent = 0;
  for (const e of state.enemies) if (e.owner === target.id && e.sent) activeSent++;
  if (activeSent >= comp.maxActiveSentPerTarget) return;

  spend(state, pl, cost, pl.elements[0]);
  pl.sentCount += send.count;
  pl.income += Math.max(1, Math.round(cost * comp.incomeRate)); // §8.1 income scales with gold sent
  const origin = state.gameMode === "versus" ? 0 : rng.nextInt(state.seedSim, target.corridorCount);
  for (let k = 0; k < send.count; k++)
    target.spawnQueue.push({ type, origin, atTick: state.tick + k * 8, sent: true, sendLevel: lvl, wave: target.wave, sentBy: pl.id });
  if (state.x) xOnSend(state, pl, type, send); // [X] stock + stats
  state.events.push({ kind: "sent", from: pl.id, to: target.id, type, level: lvl, count: send.count });
}

function cmdUpgradeSend(state, pl, cmd) {
  if (state.gameMode !== "competitive" && state.gameMode !== "versus") return;
  const send = (state.x ? state.bal.sendsX : state.bal.sends)[cmd.enemyType]; if (!send) return;
  const lvl = (pl.sendLevels && pl.sendLevels[cmd.enemyType]) || 1;
  if (lvl >= send.maxLevel) return;
  const cost = send.upgradeCost[lvl - 1];
  if (!canAfford(state, pl, cost, pl.elements[0])) { state.events.push({ kind: "reject", player: pl.id, reason: "funds" }); return; }
  spend(state, pl, cost, pl.elements[0]);
  pl.sendLevels[cmd.enemyType] = lvl + 1;
  state.events.push({ kind: "sendLevel", player: pl.id, type: cmd.enemyType, level: lvl + 1 });
}

function unlockedTowerSlots(masteryLevel) {
  if (masteryLevel >= 4) return 5;
  if (masteryLevel >= 2) return 4;
  if (masteryLevel >= 1) return 3;
  return 2;
}
function mutationSlotsAvailable(masteryLevel) {
  if (masteryLevel >= 5) return 2;
  if (masteryLevel >= 3) return 1;
  return 0;
}

// Read-only query used by the shell to preview where a tower would actually be
// placed (mirrors cmdBuild). Self-reverting; safe to call between sim ticks.
export function findBuildSpot(state, player, corridorId, gx, gy) {
  const pl = state.players[player]; if (!pl) return null;
  const corr = pl.corridors[corridorId]; if (!corr) return null;
  return findValidSpot(state, corr, gx, gy);
}

// ---------------------------------------------------------------------------
// TOWER PLACEMENT
// ---------------------------------------------------------------------------
function validTowerArea(state, corr, c, r) {
  const G = state.grid, S = state.bal.towerSize;
  if (c < 0 || r < 0 || c + S > G.cols || r + S > G.rows) return false;
  for (let rr = r; rr < r + S; rr++) for (let cc = c; cc < c + S; cc++) {
    if (corr.grid[rr * G.cols + cc] !== CELL_FREE) return false;
    if (rr <= 1 && Math.abs(cc - corr.exit.c) <= 1) return false;
    if (rr >= G.rows - 2 && Math.abs(cc - corr.entrance.c) <= 1) return false;
  }
  // temporarily block, test reachability, revert
  for (let rr = r; rr < r + S; rr++) for (let cc = c; cc < c + S; cc++) corr.grid[rr * G.cols + cc] = CELL_TOWER;
  pf.computeFlow(corr, G.cols, G.rows);
  const ok = pf.reachable(corr, G.cols) && pathClear(state, corr);
  for (let rr = r; rr < r + S; rr++) for (let cc = c; cc < c + S; cc++) corr.grid[rr * G.cols + cc] = CELL_FREE;
  pf.computeFlow(corr, G.cols, G.rows);
  return ok;
}
function pathClear(state, corr) {
  const G = state.grid;
  for (const e of state.enemies) {
    if (e.corr !== corr || e.fly) continue; // [X] flyers ignore the maze
    const c = fx.clamp(fx.floorInt(e.fx), 0, G.cols - 1), r = fx.clamp(fx.floorInt(e.fy), 0, G.rows - 1);
    if (corr.dist[r * G.cols + c] >= pf.INF) return false;
  }
  return true;
}
function findValidSpot(state, corr, gx, gy) {
  const tl = (c, r) => validTowerArea(state, corr, c, r) ? { c, r } : null;
  let best = tl(gx - 1, gy - 1);
  if (best) return best;
  for (let rad = 1; rad <= 2; rad++)
    for (let dr = -rad; dr <= rad; dr++) for (let dc = -rad; dc <= rad; dc++) {
      const s = tl(gx - 1 + dc, gy - 1 + dr);
      if (s) return s;
    }
  return null;
}
function placeTower(state, corr, def, c, r, owner) {
  const S = state.bal.towerSize, G = state.grid;
  const tw = {
    id: state.nextId++, def, c, r, owner: owner || 0,
    cx: fx.fromInt(c) + fx.fromInt(S) / 2,  // fixed-point centre (tiles)
    cy: fx.fromInt(r) + fx.fromInt(S) / 2,
    level: 1, expert: 0, kills: 0, mutations: [], cd: 0,
    ampBuff: fx.ONE, hasteBuff: fx.ONE, beamT: 0,
  };
  for (let rr = r; rr < r + S; rr++) for (let cc = c; cc < c + S; cc++) corr.grid[rr * G.cols + cc] = CELL_TOWER;
  corr.towers.push(tw);
  pf.computeFlow(corr, G.cols, G.rows);
  return tw;
}

// ---------------------------------------------------------------------------
// SPAWNING
// ---------------------------------------------------------------------------
function updateSpawns(state) {
  for (const pl of state.players) {
    if (!pl.spawnQueue.length) continue;
    const remaining = [];
    for (const s of pl.spawnQueue) {
      // spawn with the wave the enemy was queued FOR (matters when waves
      // overlap via early calls), falling back to the field's current wave
      if (state.tick >= s.atTick) spawnEnemy(state, pl, s.type, s.origin, s.wave || pl.wave, !!s.sent, s.sendLevel || 1, s.sentBy);
      else remaining.push(s);
    }
    pl.spawnQueue = remaining;
  }
}

function spawnEnemy(state, pl, type, origin, wave, sent, sendLevel, sentBy) {
  const def = state.bal.enemies[type]; if (!def) return;
  if (state.x) return xSpawnEnemy(state, pl, def, type, origin, wave, sent, sendLevel, sentBy); // [X]
  const sc = enemyScale(Math.max(1, wave));
  const corr = pl.corridors[origin];
  let maxHp = fx.mul(def.hp, sc.hp);
  let armor = def.armor, baseSpeed = def.speed;
  let reward = Math.round(def.reward * (sc.reward / fx.ONE));
  // wave affix (never on bosses or sent enemies; pure function of seed+wave)
  const affix = (!def.boss && !sent) ? waveAffix(state.seedBase, wave, state.bal.bossEvery) : null;
  if (affix) {
    if (affix.hpMult) maxHp = fx.mul(maxHp, F(affix.hpMult));
    if (affix.armorAdd) armor += fx.fromInt(affix.armorAdd);
    if (affix.speedMult) baseSpeed = fx.mul(baseSpeed, F(affix.speedMult));
  }
  // send level scaling (flat-cost economy: strength comes from the level)
  const send = sent && state.bal.sends[type];
  if (send && sendLevel > 1) {
    const li = Math.min(sendLevel, send.maxLevel) - 1;
    maxHp = fx.mul(maxHp, send.hpMult[li]);
    reward = Math.round(reward * (send.rewardMult[li] / fx.ONE));
  }
  const e = {
    id: state.nextId++, type, def,
    owner: pl.id, originIndex: origin, corridorIndex: origin, corr,
    fx: fx.fromInt(corr.entrance.c) + HALF,
    fy: fx.fromInt(corr.entrance.r) + HALF,
    maxHp, hp: maxHp,
    armor, baseSpeed,
    reward,
    sendLevel: sent ? (sendLevel || 1) : 0,
    statuses: {}, statusKeys: [], buffs: 0,
    loopCount: 0, transitions: 0,
    alive: true, boss: def.boss, end: def.end,
    resist: {}, sent: !!sent,
    speedBuff: fx.ONE,
    affix: affix ? affix.id : null,
  };
  state.enemies.push(e);
}

// ---------------------------------------------------------------------------
// ENEMY UPDATE
// ---------------------------------------------------------------------------
function updateEnemies(state, dt) {
  const G = state.grid;
  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const e = state.enemies[i];
    if (!e.alive) continue;
    const pl = state.players[e.owner];
    const corr = e.corr;

    // statuses
    let moveMult = fx.ONE, dmgTakenMult = fx.ONE, stunned = false, dotDps = 0, shred = 0;
    for (let k = e.statusKeys.length - 1; k >= 0; k--) {
      const key = e.statusKeys[k];
      const st = e.statuses[key];
      st.remaining -= dt;
      if (st.remaining <= 0) { delete e.statuses[key]; e.statusKeys.splice(k, 1); continue; }
      const d = st.def;
      switch (d.kind) {
        case "dot": dotDps += fx.mul(st.value, st.dotMult || fx.ONE); break;
        case "slow": moveMult = fx.mul(moveMult, d.value); break;
        case "stun": stunned = true; break;
        case "amp": dmgTakenMult = fx.mul(dmgTakenMult, d.value); break;
        case "shred": shred += d.value; break;
        case "custom": stunned = handleCustom(state, e, st, dt, stunned); break;
      }
    }
    e.dmgTakenMult = dmgTakenMult;
    e.shred = shred;

    if (dotDps > 0) damageEnemy(state, e, fx.mul(dotDps, dt), null, true);
    if (!e.alive) { removeEnemy(state, e, i); continue; }

    // [X] traits: regen, pulses, abilities; may hold the creep still (shell)
    if (e.tr) {
      e.dmgTakenMult = fx.mul(e.dmgTakenMult, e.auraDmg || fx.ONE);
      if (xEnemyTick(state, e, dt)) stunned = true;
      if (!e.alive) { if (state.enemies[i] === e) removeEnemy(state, e, i); continue; }
    }

    if (!stunned) {
      // speed (tiles/sec, fixed) = baseSpeed * enemyBaseSpeed * moveMult * speedBuff
      let speed = fx.mul(e.baseSpeed, state.bal.enemyBaseSpeed);
      speed = fx.mul(speed, moveMult);
      speed = fx.mul(speed, e.speedBuff);
      if (e.tr) { speed = fx.mul(speed, xSpeedMult(state, e)); if (e.fly) moveFly(state, e, corr, fx.mul(speed, dt)); else moveAlongFlow(state, e, corr, fx.mul(speed, dt)); xAfterMove(state, e, corr); }
      else moveAlongFlow(state, e, corr, fx.mul(speed, dt));
    }
    if (!e.alive) continue;

    // reached exit?
    const tc = fx.clamp(fx.floorInt(e.fx), 0, G.cols - 1), tr = fx.clamp(fx.floorInt(e.fy), 0, G.rows - 1);
    if (tr <= corr.exit.r && Math.abs(tc - corr.exit.c) <= 1) transferEnemy(state, e);
  }
}

function moveAlongFlow(state, e, corr, stepFx) {
  const G = state.grid;
  let guard = 0;
  while (stepFx > 0 && guard++ < 8) {
    const c = fx.clamp(fx.floorInt(e.fx), 0, G.cols - 1), r = fx.clamp(fx.floorInt(e.fy), 0, G.rows - 1);
    const k = pf.bestNeighbor(corr, G.cols, G.rows, c, r);
    let tx, ty;
    if (k != null) { tx = fx.fromInt(c + pf.NB[k][0]) + HALF; ty = fx.fromInt(r + pf.NB[k][1]) + HALF; }
    else { tx = fx.fromInt(corr.exit.c) + HALF; ty = fx.fromInt(corr.exit.r) + HALF; }
    const dx = tx - e.fx, dy = ty - e.fy;
    let d = fx.len(dx, dy);
    if (d <= 0) d = 1;
    if (d <= stepFx) { e.fx = tx; e.fy = ty; stepFx -= d; }
    else {
      e.fx += fx.div(fx.mul(dx, stepFx), d);
      e.fy += fx.div(fx.mul(dy, stepFx), d);
      stepFx = 0;
    }
  }
}

function transferEnemy(state, e) {
  if (state.gameMode === "versus") { transferEnemyVersus(state, e); return; }
  const pl = state.players[e.owner];
  const from = e.corridorIndex;
  const next = (from + 1) % pl.corridorCount;
  e.transitions++;
  e.corridorIndex = next;
  e.corr = pl.corridors[next];
  e.fx = fx.fromInt(e.corr.entrance.c) + HALF;
  e.fy = fx.fromInt(e.corr.entrance.r) + HALF;
  if (e.tr) xEnterCorridor(e); // [X]

  const cur = e.statuses["cursed"];
  if (cur) { damageEnemy(state, e, fx.mul(cur.value, cur.curseBoost || fx.ONE), null, true); if (!e.alive) return; }

  if (e.transitions % pl.corridorCount === 0) onLoopComplete(state, pl, e);
  if (state.statusMode === "advanced" && e.transitions % pl.corridorCount === 0) e.statusLocked = false;
}

// Versus (Line-Tower-Wars-around-a-circle): each corridor belongs to a seat.
// A leak costs the corridor's owner a life, then the mob adapts and marches on
// to the NEXT living corridor. Dead corridors are skipped entirely.
function transferEnemyVersus(state, e) {
  const owner = state.players[e.owner];
  if (state.x) xRecordLeak(state, owner, e, true); // [X] leak report + life steal
  loseLife(state, owner, state.bal.loopLifeLoss);
  state.events.push({ kind: "leak", player: e.owner, type: e.type });
  const next = nextAliveAfter(state, e.owner);
  if (!next || state.finished) { // nobody left to travel to — remove the mob
    e.alive = false;
    const idx = state.enemies.indexOf(e);
    if (idx >= 0) state.enemies.splice(idx, 1);
    return;
  }
  e.owner = next.id;
  e.originIndex = 0;
  e.corridorIndex = 0;
  e.corr = next.corridors[0];
  e.fx = fx.fromInt(e.corr.entrance.c) + HALF;
  e.fy = fx.fromInt(e.corr.entrance.r) + HALF;
  if (e.tr) xEnterCorridor(e); // [X]
  e.transitions++;
  e.loopCount++;                       // corridors survived — shown as ↻n
  applyAdaptation(state, e);           // travelers grow stronger each leak

  const cur = e.statuses["cursed"];
  if (cur) damageEnemy(state, e, fx.mul(cur.value, cur.curseBoost || fx.ONE), null, true);
}

function onLoopComplete(state, pl, e) {
  e.loopCount++;
  if (state.x) xRecordLeak(state, pl, e, false); // [X]
  loseLife(state, pl, state.bal.loopLifeLoss);
  if (pl.lives <= 0) return;
  applyAdaptation(state, e);
  if (state.statusMode === "advanced") e.statusLocked = true;
}

function applyAdaptation(state, e) {
  const opts = ["speed", "health", "armor", "resist", "momentum", "hardened"];
  const pick = rng.pick(state.seedSim, opts);
  e.adapt = e.adapt || {}; e.adapt[pick] = (e.adapt[pick] || 0) + 1; // record for UI
  switch (pick) {
    case "speed": e.speedBuff = fx.mul(e.speedBuff, F(1.15)); break;
    case "health":
      if (state.x) { e.maxHp = xMulHp(e.maxHp, F(1.25)); e.hp = fx.min(e.maxHp, e.hp + fx.mul(e.maxHp, F(0.25))); break; } // [X] no 16.16 overflow
      e.maxHp = fx.mul(e.maxHp, F(1.25)); e.hp = fx.min(e.maxHp, e.hp + fx.mul(e.maxHp, F(0.25))); break;
    case "armor": e.armor += fx.fromInt(4); break;
    case "resist": {
      const el = state.players[e.owner].elements[e.originIndex];
      e.resist[el] = (e.resist[el] || 0) + F(0.2);
      break;
    }
    case "momentum": applyStatusRaw(state, e, "momentum"); break;
    case "hardened": applyStatusRaw(state, e, "hardened"); break;
  }
  if (e.loopCount >= 3) applyStatusRaw(state, e, "veteran");
  e.buffs++;
}

function handleCustom(state, e, st, dt, stunned) {
  const id = st.def.id;
  if (id === "shocked") {
    st.arcT = (st.arcT || 0) - dt;
    if (st.arcT <= 0) { st.arcT = F(0.6); arcToNeighbors(state, e, st.def.value); }
  } else if (id === "molten") {
    st.t = (st.t || 0) - dt;
    if (st.t <= 0) { st.t = F(0.4); aoeAround(state, e, F(1.2), fx.mul(st.def.value, F(0.4))); }
  } else if (id === "blinded") {
    st.cycle = (st.cycle || 0) + dt;
    // stop ~ first third of a 1.5s cycle
    if ((st.cycle % F(1.5)) < F(0.5)) stunned = true;
  } else if (id === "lifted" || id === "momentum") {
    // movement multiplier handled as slow-like in value (kept simple/deterministic)
  } else if (id === "entropy") {
    st.t = (st.t || 0) - dt;
    if (st.t <= 0) { st.t = F(2); applyStatusRaw(state, e, rng.pick(state.seedSim, ["burning", "poisoned", "chilled", "shocked", "weakened"])); }
  }
  return stunned;
}

function arcToNeighbors(state, e, dmg) {
  let hit = 0;
  const R2 = fx.mul(F(2.2), F(2.2));
  for (const o of state.enemies) {
    if (o === e || !o.alive || o.owner !== e.owner || o.corr !== e.corr) continue;
    if (fx.dist2(e.fx, e.fy, o.fx, o.fy) < R2) { damageEnemy(state, o, dmg, null, true, "aura"); if (++hit >= 2) break; }
  }
}
function aoeAround(state, e, radius, dmg) {
  const R2 = fx.mul(radius, radius);
  for (const o of state.enemies) {
    if (o === e || !o.alive || o.owner !== e.owner || o.corr !== e.corr) continue;
    if (fx.dist2(e.fx, e.fy, o.fx, o.fy) < R2) damageEnemy(state, o, dmg, null, true, "aura");
  }
}

function removeEnemy(state, e, idxHint) {
  e.alive = false;
  const i = (idxHint != null && state.enemies[idxHint] === e) ? idxHint : state.enemies.indexOf(e);
  if (i >= 0) state.enemies.splice(i, 1);
}

function loseLife(state, pl, n) {
  if (state.gameMode === "coop") {
    state.coopLives -= n;
    if (state.coopLives <= 0) { state.coopLives = 0; defeat(state, state.players[0]); }
  } else {
    pl.lives -= n;
    if (pl.log) pl.log.livesLost += n; // [X]
    if (pl.lives <= 0) { pl.lives = 0; defeat(state, pl); }
  }
  state.events.push({ kind: "life", player: pl.id });
}

// ---------------------------------------------------------------------------
// DAMAGE / DEATH
// ---------------------------------------------------------------------------
function damageEnemy(state, e, raw, tower, isDot, kind) {
  if (!e.alive) return;
  if (e.tr) { xDamageEnemy(state, e, raw, tower, isDot, kind); return; } // [X] trait-aware path
  let dmg = raw;
  const armor = fx.max(0, e.armor - (e.shred || 0));
  if (!isDot) dmg = fx.max(fx.mul(dmg, F(0.15)), dmg - armor);
  dmg = fx.mul(dmg, e.dmgTakenMult || fx.ONE);
  if (tower) {
    const r = e.resist[tower.def.element] || 0;
    if (r) dmg = fx.mul(dmg, fx.ONE - r);
  }
  e.hp -= dmg;
  if (e.hp <= 0) killEnemy(state, e, tower);
}

function killEnemy(state, e, tower) {
  if (!e.alive) return;
  if (e.tr && xTryRevive(state, e)) return; // [X] undying creeps rise once
  e.alive = false;
  const fieldPl = state.players[e.owner];
  const creditPl = tower ? state.players[tower.owner] : fieldPl; // per-tower economy (co-op)
  creditPl.stats.kills++;

  // reward — defender keeps it; sent enemies pay a FIXED higher bounty (§8.2).
  let r = e.reward;
  const tag = e.statuses["tagged"];
  if (tag) r = Math.round(r * (tag.def.value / fx.ONE));
  if (e.sent) r = fx.round(fx.mul(fx.fromInt(r), state.bal.competitive.sentBountyMult));
  if (state.challenge && state.challenge.hard && state.challenge.def.hard.noKillGold) r = 0; // [X]
  grantReward(state, creditPl, e, r);
  if (e.tr || state.x) xOnKill(state, e, creditPl); // [X] death effects + stats

  if (tower) { tower.kills++; checkExpert(state, tower); }
  creditPl.stats.score += e.boss ? 5000 : 25;
  state.events.push({ kind: "kill", player: e.owner, enemy: e.id, type: e.type, boss: !!e.boss, reward: r }); // [Skyhold] render-only

  if (e.statuses["volatile"]) aoeAround(state, e, F(2.0), e.statuses["volatile"].def.value);

  if (e.end) { removeEnemy(state, e); victory(state, fieldPl); return; }
  if (e.boss) creditPl.stats.bossesKilled++;
  removeEnemy(state, e);
}

function grantReward(state, pl, e, amount) {
  if (state.economy === "shared") pl.gold += amount;
  else { const el = pl.elements[e.originIndex]; pl.essence[el] = (pl.essence[el] || 0) + amount; }
  if (pl.log) pl.log.goldEarned += amount; // [X]
}
function grantAll(state, pl, amount) {
  if (state.economy === "shared") pl.gold += amount;
  else for (const el of pl.elements) pl.essence[el] += Math.round(amount / pl.corridorCount);
  if (pl.log) pl.log.goldEarned += amount; // [X]
}

function checkExpert(state, tw) {
  if (tw.expert >= state.bal.maxExpert) return;
  const need = state.bal.expertThresholds[tw.expert];
  if (tw.kills >= need) tw.expert++;
}

// ---------------------------------------------------------------------------
// STATUS + SYNERGY
// ---------------------------------------------------------------------------
function applyStatus(state, e, statusId, durationOverride, tower) {
  const def = state.bal.statuses[statusId]; if (!def) return;
  if (e.tr && xStatusBlocked(e, statusId, def)) return; // [X] immunities
  const dur = fx.mul(durationOverride || def.duration, e.boss ? F(0.3) : fx.ONE);
  const incomingElement = def.element;

  for (let i = 0; i < e.statusKeys.length; i++) {
    const k = e.statusKeys[i];
    const ex = state.bal.statuses[k];
    if (!ex || ex.adaptive || ex.element === incomingElement || !incomingElement) continue;
    const syn = state.bal.synergies[k + "|" + incomingElement];
    if (syn) fireSynergy(state, e, syn, tower);
  }

  if (state.statusMode === "standard") {
    for (let i = e.statusKeys.length - 1; i >= 0; i--) {
      const k = e.statusKeys[i];
      if (!state.bal.statuses[k].adaptive) { delete e.statuses[k]; e.statusKeys.splice(i, 1); }
    }
  } else if (e.statusLocked) return;

  addStatus(e, def, statusId, dur);
}
function applyStatusRaw(state, e, statusId, durationOverride) {
  const def = state.bal.statuses[statusId]; if (!def) return;
  if (e.tr && !def.adaptive && xStatusBlocked(e, statusId, def)) return; // [X]
  addStatus(e, def, statusId, durationOverride || def.duration);
}
function addStatus(e, def, statusId, dur) {
  const existing = e.statuses[statusId];
  if (!existing) e.statusKeys.push(statusId);
  e.statuses[statusId] = {
    def, remaining: dur, value: def.value,
    dotMult: existing ? existing.dotMult : fx.ONE,
    curseBoost: existing ? existing.curseBoost : fx.ONE,
  };
}
function fireSynergy(state, e, syn, tower) {
  state.events.push({ kind: "synergy", player: e.owner, id: syn.id, name: syn.name, corridor: e.corridorIndex, enemy: e.id });
  if (syn.burst) damageEnemy(state, e, syn.burst, tower, true);
  if (syn.dotMult && e.statuses["poisoned"]) e.statuses["poisoned"].dotMult = syn.dotMult;
  if (syn.curseBoost && e.statuses["cursed"]) e.statuses["cursed"].curseBoost = syn.curseBoost;
  if (syn.execute && !e.boss && fx.div(e.hp, e.maxHp) < syn.execute) damageEnemy(state, e, e.hp + 1, tower);
  if (syn.spread) {
    let n = 0;
    const R2 = fx.mul(F(2), F(2));
    for (const o of state.enemies) {
      if (o === e || !o.alive || o.owner !== e.owner || o.corr !== e.corr) continue;
      if (fx.dist2(e.fx, e.fy, o.fx, o.fy) < R2) {
        for (const k of e.statusKeys) if (!state.bal.statuses[k].adaptive) applyStatusRaw(state, o, k);
        if (++n >= 3) break;
      }
    }
  }
  if (syn.anchor && tower) tower.anchorTargetId = e.id;
}

// ---------------------------------------------------------------------------
// TOWERS — stats + combat
// ---------------------------------------------------------------------------
function towerStats(state, tw) {
  const d = tw.def, lvl = tw.level, S = state.bal.scaling;
  let damage = d.damage, fireRate = d.fireRate, range = d.range;
  // compounding per-level via repeated fixed mul (deterministic)
  for (let l = 1; l < lvl; l++) {
    damage = fx.mul(damage, fx.ONE + S.damagePerLevel);
    fireRate = fx.mul(fireRate, fx.ONE + S.fireRatePerLevel);
  }
  range += fx.mul(S.rangePerLevel, fx.fromInt(lvl - 1));
  let splash = d.splashRadius, chainCount = d.chainCount, chainRange = d.chainRange, pierce = d.pierce, archetype = d.archetype;

  for (const mid of tw.mutations) {
    const m = d.mutations.find(o => o.id === mid); if (!m) continue;
    const mods = m.mods;
    if (mods.damageMult) damage = fx.mul(damage, mods.damageMult);
    if (mods.fireRateMult) fireRate = fx.mul(fireRate, mods.fireRateMult);
    if (mods.rangeMult) range = fx.mul(range, mods.rangeMult);
    if (mods.splashRadius != null) splash = mods.splashRadius;
    if (mods.chainCount != null) chainCount = mods.chainCount;
    if (mods.chainRange) chainRange = mods.chainRange;
    if (mods.pierce != null) pierce = mods.pierce;
    if (mods.archetype) archetype = mods.archetype;
  }
  damage = fx.mul(damage, fx.ONE + state.bal.expertDamageBonus[tw.expert]);
  damage = fx.mul(damage, tw.ampBuff || fx.ONE);
  fireRate = fx.mul(fireRate, tw.hasteBuff || fx.ONE);
  return { damage, fireRate, range, splash, chainCount, chainRange, pierce, archetype, mods: collectMods(d, tw) };
}
function collectMods(d, tw) {
  const m = {};
  for (const mid of tw.mutations) { const o = d.mutations.find(x => x.id === mid); if (o) Object.assign(m, o.mods); }
  return m;
}

function updateTowers(state, pl, corr, dt) {
  for (const tw of corr.towers) { tw.ampBuff = fx.ONE; tw.hasteBuff = fx.ONE; }
  if (state.x) for (const tw of corr.towers) { tw.ampBuff = fx.mul(tw.xDmg || fx.ONE, tw.curseMult || fx.ONE); tw.hasteBuff = fx.mul(tw.xRate || fx.ONE, tw.jamMult || fx.ONE); } // [X] creep debuffs
  // auras
  for (const tw of corr.towers) {
    if (state.x && (tw.bState || tw.stunT > 0)) continue; // [X]
    const st = towerStats(state, tw);
    if (st.archetype === "support") applyAura(state, corr, tw, st);
  }
  for (const tw of corr.towers) {
    if (state.x && (tw.bState || tw.upT > 0 || tw.stunT > 0)) continue; // [X] building, upgrading or stunned
    const st = towerStats(state, tw);
    if (st.archetype === "support") { supportTick(state, pl, corr, tw, st, dt); continue; }
    tw.cd -= dt;
    if (tw.cd <= 0) {
      if (fireTower(state, pl, corr, tw, st)) {
        const fr = fx.max(F(0.05), st.fireRate);
        tw.cd = fx.div(fx.ONE, fr);
      }
    }
  }
}

function inRange(tw, x, y, range) { return fx.dist2(tw.cx, tw.cy, x, y) <= fx.mul(range, range); }

function applyAura(state, corr, tw, st) {
  const stat = st.mods.auraStat || tw.def.auraStat;
  const val = st.mods.auraValue || tw.def.auraValue;
  if (stat === "amp_tower") {
    for (const o of corr.towers) if (o !== tw && inRange(tw, o.cx, o.cy, st.range)) o.ampBuff = fx.mul(o.ampBuff, val);
  } else if (stat === "haste_tower") {
    for (const o of corr.towers) if (o !== tw && inRange(tw, o.cx, o.cy, st.range)) o.hasteBuff = fx.mul(o.hasteBuff, val);
  }
}

function supportTick(state, pl, corr, tw, st, dt) {
  const stat = st.mods.auraStat || tw.def.auraStat;
  tw.beamT = (tw.beamT || 0) - dt;
  const pulse = tw.beamT <= 0;
  if (pulse) tw.beamT = F(0.5);
  if (stat === "slow" || tw.def.element === "ice") {
    for (const e of state.enemies) if (e.alive && e.owner === pl.id && e.corr === corr && inRange(tw, e.fx, e.fy, st.range)) {
      applyStatus(state, e, tw.def.status, st.mods.statusDuration || tw.def.statusDuration, tw);
      if (pulse && st.damage > 0) damageEnemy(state, e, st.damage, tw, true, "aura");
    }
  } else if (stat === "poison") {
    for (const e of state.enemies) if (e.alive && e.owner === pl.id && e.corr === corr && inRange(tw, e.fx, e.fy, st.range)) {
      applyStatus(state, e, "poisoned", tw.def.statusDuration, tw);
      if (pulse) damageEnemy(state, e, (st.mods.auraValue || tw.def.auraValue), tw, true, "aura");
    }
  } else if (stat === "magnet") {
    for (const e of state.enemies) if (e.alive && e.owner === pl.id && e.corr === corr && inRange(tw, e.fx, e.fy, st.range)) applyStatus(state, e, "magnetized", tw.def.statusDuration, tw);
  }
}

function acquireTarget(state, pl, corr, tw, range, arche) {
  if (state.x) return xAcquireTarget(state, pl, corr, tw, range, arche); // [X] air, stealth, confusion
  let best = null, bestScore = Infinity;
  const G = state.grid;
  const mode = tw.targetMode || "first";
  for (const e of state.enemies) {
    if (!e.alive || e.owner !== pl.id || e.corr !== corr) continue;
    if (!inRange(tw, e.fx, e.fy, range)) continue;
    // per-tower priority (all inputs integers -> deterministic):
    //   first  = closest to the exit (flow-field distance, lower is further along)
    //   last   = furthest from the exit
    //   strong = highest current HP, weak = lowest current HP
    let score;
    if (mode === "strong") score = -e.hp;
    else if (mode === "weak") score = e.hp;
    else {
      score = corr.dist[fx.floorInt(e.fy) * G.cols + fx.floorInt(e.fx)] || 0;
      if (mode === "last") score = -score;
    }
    if (e.statuses["magnetized"]) score -= 1e9;
    if (tw.anchorTargetId === e.id) score -= 5e9;
    // stable tie-break by id
    if (score < bestScore || (score === bestScore && best && e.id < best.id)) { bestScore = score; best = e; }
  }
  return best;
}

function fireTower(state, pl, corr, tw, st) {
  let arche = st.archetype, element = tw.def.element, statusId = tw.def.status;
  if (arche === "random") {
    arche = rng.pick(state.seedSim, ["single", "splash", "chain"]);
    const opts = ["burning", "chilled", "poisoned", "shocked", "weakened", "shredded"];
    statusId = (st.mods.luckyBoost && rng.chance(state.seedSim, HALF)) ? "volatile" : rng.pick(state.seedSim, opts);
  }
  const target = acquireTarget(state, pl, corr, tw, st.range, arche);
  if (!target && arche !== "melee") return false;

  if (arche === "melee") {
    let hit = false;
    const ids = []; // [Skyhold] render-only: who the blades touched
    for (const e of state.enemies) if (e.alive && e.owner === pl.id && e.corr === corr && inRange(tw, e.fx, e.fy, st.range)) {
      if (e.fly) continue; // [X] blades can't reach flyers (never true in Classic)
      ids.push(e.id);
      damageEnemy(state, e, st.damage, tw, false, "melee"); maybeStatus(state, e, tw, st, statusId); hit = true;
    }
    if (hit) state.events.push({ kind: "zap", style: "melee", player: pl.id, corridor: corr.index, tower: tw.id, element, targets: ids });
    return hit;
  }
  if (arche === "beam" || arche === "chain") {
    const ids = [target.id]; // [Skyhold] render-only: the beam/arc path
    damageEnemy(state, target, st.damage, tw, false, arche); maybeStatus(state, target, tw, st, statusId);
    if (st.chainCount > 0) chainFrom(state, pl, corr, tw, target, st, statusId, ids);
    state.events.push({ kind: "zap", style: arche, player: pl.id, corridor: corr.index, tower: tw.id, element, targets: ids });
    return true;
  }
  // single / splash -> projectile
  state.projectiles.push({
    id: state.nextId++, owner: pl.id, corr,
    x: tw.cx, y: tw.cy, targetId: target.id,
    tx: target.fx, ty: target.fy,
    speed: tw.def.projectileSpeed, twId: tw.id, twRef: tw,
    st, arche, statusId, element,
  });
  return true;
}

function maybeStatus(state, e, tw, st, statusId) {
  const chance = st.mods.statusChance || tw.def.statusChance || 0;
  if (statusId && rng.chance(state.seedSim, chance)) applyStatus(state, e, statusId, st.mods.statusDuration || tw.def.statusDuration, tw);
  if (st.mods.addStatus) applyStatus(state, e, st.mods.addStatus, null, tw);
  if (st.mods.executeBoost && !e.boss && fx.div(e.hp, e.maxHp) < F(0.18)) damageEnemy(state, e, e.hp + 1, tw);
}

function chainFrom(state, pl, corr, tw, from, st, statusId, outIds) {
  let count = st.chainCount, prev = from;
  const hit = new Set([from.id]);
  let dmg = fx.mul(st.damage, F(0.85));
  const cr = st.chainRange || fx.fromInt(3);
  const cr2 = fx.mul(cr, cr);
  while (count-- > 0) {
    let best = null, bd = cr2;
    for (const e of state.enemies) {
      if (!e.alive || e.owner !== pl.id || e.corr !== corr || hit.has(e.id)) continue;
      const d = fx.dist2(prev.fx, prev.fy, e.fx, e.fy);
      if (d <= bd || (d === bd && best && e.id < best.id)) { bd = d; best = e; }
    }
    if (!best) break;
    if (outIds) outIds.push(best.id); // [Skyhold] render-only
    damageEnemy(state, best, dmg, tw, false, "chainb"); maybeStatus(state, best, tw, st, statusId);
    hit.add(best.id); prev = best; dmg = fx.mul(dmg, F(0.85));
  }
}

function findEnemyById(state, id) {
  for (const e of state.enemies) if (e.id === id) return e;
  return null;
}

function updateProjectiles(state, dt) {
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const p = state.projectiles[i];
    const tgt = p.targetId ? findEnemyById(state, p.targetId) : null;
    if (tgt && tgt.alive) { p.tx = tgt.fx; p.ty = tgt.fy; }
    const dx = p.tx - p.x, dy = p.ty - p.y;
    let d = fx.len(dx, dy); if (d <= 0) d = 1;
    const step = fx.mul(p.speed, dt);
    if (d <= step + F(0.05)) { impact(state, p); state.projectiles.splice(i, 1); }
    else { p.x += fx.div(fx.mul(dx, step), d); p.y += fx.div(fx.mul(dy, step), d); }
  }
}

function impact(state, p) {
  const corr = p.corr, tw = p.twRef;
  if (p.arche === "splash" && p.st.splash > 0) {
    const R2 = fx.mul(p.st.splash, p.st.splash);
    for (const e of state.enemies) {
      if (!e.alive || e.owner !== p.owner || e.corr !== corr || e.fly) continue; // [X] splash stays on the ground
      if (fx.dist2(p.x, p.y, e.fx, e.fy) <= R2) { damageEnemy(state, e, p.st.damage, tw, false, "splash"); maybeStatus(state, e, tw, p.st, p.statusId); }
    }
  } else {
    const tgt = p.targetId ? findEnemyById(state, p.targetId) : null;
    let hits = (p.st.pierce || 0) + 1;
    if (tgt && tgt.alive) { damageEnemy(state, tgt, p.st.damage, tw, false, "single"); maybeStatus(state, tgt, tw, p.st, p.statusId); hits--; }
    if (hits > 0 && p.st.pierce > 0) {
      const R2 = fx.mul(F(1.2), F(1.2));
      for (const e of state.enemies) {
        if (hits <= 0) break;
        if (!e.alive || e === tgt || e.owner !== p.owner || e.corr !== corr) continue;
        if (fx.dist2(p.x, p.y, e.fx, e.fy) <= R2) { damageEnemy(state, e, fx.mul(p.st.damage, F(0.8)), tw, false, "single"); maybeStatus(state, e, tw, p.st, p.statusId); hits--; }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// INCOME (competitive §8.1 + catch-up §8.3)
// ---------------------------------------------------------------------------
function updateIncome(state) {
  if (state.gameMode !== "competitive" && state.gameMode !== "versus") return;
  const comp = state.bal.competitive;
  // find life leader for catch-up
  let maxLives = 0;
  for (const pl of state.players) if (pl.alive && pl.lives > maxLives) maxLives = pl.lives;
  for (const pl of state.players) {
    if (!pl.alive) continue;
    pl.incomeTick++;
    const interval = state.x && state.x.turbo ? (comp.incomeIntervalTicks >> 1) : comp.incomeIntervalTicks; // [X]
    if (pl.incomeTick >= interval) {
      pl.incomeTick = 0;
      let payout = pl.income;
      const behind = maxLives - pl.lives;
      if (behind > 0) payout += behind * comp.catchupPerLifeBehind; // §8.3 catch-up
      if (state.x && pl.incomeMult !== fx.ONE) payout = fx.round(fx.mul(fx.fromInt(payout), pl.incomeMult)); // [X] NPC difficulty
      if (payout > 0) grantAll(state, pl, payout);
    }
  }
}

// ---------------------------------------------------------------------------
// WAVE STATE / WIN-LOSS
// ---------------------------------------------------------------------------
function enemiesOf(state, pl) { let n = 0; for (const e of state.enemies) if (e.owner === pl.id) n++; return n; }

function checkWaveState(state, pl) {
  if (!pl.alive) return; // a defeated seat must never flip back to "build"
  if (!pl.waveActive) return;
  if (pl.spawnQueue.length === 0 && enemiesOf(state, pl) === 0) {
    pl.waveActive = false;
    if (pl.phase === "endboss") return;
    pl.phase = "build";
    const bonus = 40 + pl.wave * 12;
    if (state.gameMode === "coop") { for (const p of state.players) grantAll(state, p, bonus); }
    else grantAll(state, pl, bonus);
    pl.stats.score += pl.wave * 100;
    state.events.push({ kind: "waveClear", player: pl.id, wave: pl.wave, bonus, autosave: true });
    if (state.mode !== "endless" && pl.wave >= pl.totalWaves) {
      pl.phase = "prep";
      state.events.push({ kind: "prep", player: pl.id });
    }
  }
}

function summonEndBoss(state, pl) {
  if (pl.phase !== "prep") return;
  const origin = rng.nextInt(state.seedSim, pl.corridorCount);
  spawnEnemy(state, pl, state.challenge ? state.challenge.def.boss : "endboss", origin, pl.wave, false); // [X] challenge boss
  pl.endBossId = state.enemies[state.enemies.length - 1].id;
  pl.phase = "endboss";
  pl.waveActive = true;
  state.events.push({ kind: "endboss", player: pl.id });
}

function victory(state, pl) {
  if (pl.phase === "victory") return;
  pl.phase = "victory"; pl.waveActive = false;
  state.events.push({ kind: "victory", player: pl.id });
  maybeFinish(state);
}
function defeat(state, pl) {
  if (pl.phase === "defeat") return;
  pl.phase = "defeat"; pl.waveActive = false; pl.alive = false;
  state.events.push({ kind: "defeat", player: pl.id });
  // competitive/versus: last standing wins
  if (state.gameMode === "competitive" || state.gameMode === "versus") {
    const alive = state.players.filter(p => p.alive);
    if (alive.length === 1) { alive[0].phase = "victory"; state.events.push({ kind: "victory", player: alive[0].id }); }
  }
  maybeFinish(state);
}
function maybeFinish(state) {
  if (state.gameMode === "coop") {
    const f = state.players[0].phase;
    if (f === "victory" || f === "defeat") state.finished = true;
    return;
  }
  if (state.gameMode === "versus") {
    // the match ends when the human seat is decided or one seat remains
    const me = state.players[0];
    const alive = state.players.filter(p => p.alive);
    if (state.x) { if (alive.length <= 1) state.finished = true; return; } // [X] a fallen player can keep spectating
    if (me.phase === "victory" || me.phase === "defeat" || alive.length <= 1) state.finished = true;
    return;
  }
  const anyOngoing = state.players.some(p => p.phase !== "victory" && p.phase !== "defeat");
  if (!anyOngoing) state.finished = true;
}


// =============================================================================
// [Skyhold] EXPANDED RULESET — bestiary traits, builders, send stock, life
// steal, modifiers, challenges and match stats. Only reachable when state.x is
// set (cfg.ruleset === "expanded"). Same rules as the rest of the core: fixed-
// point maths, seeded sim RNG, stable array order.
// =============================================================================
const NO_T = Object.freeze({});
const MAXHP = fx.fromInt(32000);          // 16.16 tops out near 32767: cap HP below it
const BUILDER_SPEED = F(9);               // tiles per second
const sq = (r) => fx.mul(r, r);

function xMods(m) {
  return {
    lifeSteal: m.lifeSteal !== false, sendStock: m.sendStock !== false, builders: m.builders !== false,
    noFlyers: !!m.noFlyers, noDisruptors: !!m.noDisruptors, noStealth: !!m.noStealth, turbo: !!m.turbo,
    goldMult: F(m.goldMult || 1), livesMult: F(m.livesMult || 1),
    // online Vs: waves start on a shared timer (seconds), nobody calls them
    autoWave: m.autoWave ? (m.autoWave * SIM_HZ) | 0 : 0, firstWave: ((m.firstWave || 30) * SIM_HZ) | 0,
  };
}
function xInitPlayer(state, pl, pc) {
  const m = state.x;
  pl.gold = fx.round(fx.mul(fx.fromInt(state.bal.startGold), m.goldMult)) + (pc.goldBonus | 0);
  for (const e of state.bal.elementOrder) pl.essence[e] = fx.round(fx.mul(fx.fromInt(state.bal.startEssence), m.goldMult)) + (pc.goldBonus | 0);
  pl.lives = pl.maxLives = Math.max(1, fx.round(fx.mul(fx.fromInt(state.bal.startLives), m.livesMult)));
  pl.incomeMult = F(pc.incomeMult || 1);
  pl.sendStock = {};
  pl.log = { leaks: [], kills: {}, sent: {}, goldEarned: 0, goldSpent: 0, livesStolen: 0, livesLost: 0, stolenBy: {} };
  for (const t in state.bal.sendsX || {}) pl.sendLevels[t] = 1;
  if (state.challenge) {
    pl.totalWaves = 10;
    const h = state.challenge.hard && state.challenge.def.hard;
    if (h && h.startGoldMult) { pl.gold = fx.round(fx.mul(fx.fromInt(pl.gold), F(h.startGoldMult))); for (const e in pl.essence) pl.essence[e] = fx.round(fx.mul(fx.fromInt(pl.essence[e]), F(h.startGoldMult))); }
  }
}
function xInitCorridor(state, corr) {
  corr.builder = { x: F(1.5), y: fx.fromInt(state.grid.rows >> 1), queue: [], cur: 0, moving: 0 };
  corr.obsRev = 0;
}

// ---- builders ----------------------------------------------------------------
function buildTime(cost) { return fx.min(F(5), F(1.2) + fx.div(fx.fromInt(cost), fx.fromInt(80))); }
function xOnBuild(state, corr, tw, pl) {
  tw.dmgDone = 0;
  if (!state.x.builders || !corr.builder) return;
  tw.bState = 1; tw.bT = buildTime(tw.def.cost); tw.bMax = tw.bT;
  corr.builder.queue.push(tw.id);
  state.events.push({ kind: "construct", player: pl.id, corridor: corr.index, tower: tw.id });
}
function xCancelBuild(corr, tw) {
  const b = corr.builder; if (!b) return;
  const i = b.queue.indexOf(tw.id); if (i >= 0) b.queue.splice(i, 1);
  if (b.cur === tw.id) b.cur = 0;
}
function xBuilder(state, pl, corr, dt) {
  const b = corr.builder; if (!b) return;
  if (!b.cur && b.queue.length) b.cur = b.queue.shift();
  let tw = null;
  if (b.cur) { tw = corr.towers.find((t) => t.id === b.cur) || null; if (!tw || !tw.bState) { b.cur = 0; tw = null; } }
  const tx = tw ? tw.cx : F(1.5), ty = tw ? tw.cy : fx.fromInt(state.grid.rows >> 1);
  const dx = tx - b.x, dy = ty - b.y;
  let d = fx.len(dx, dy);
  const stepFx = fx.mul(tw ? BUILDER_SPEED : (BUILDER_SPEED >> 1), dt);
  if (d > stepFx) { if (d <= 0) d = 1; b.x += fx.div(fx.mul(dx, stepFx), d); b.y += fx.div(fx.mul(dy, stepFx), d); b.moving = 1; return; }
  b.x = tx; b.y = ty; b.moving = 0;
  if (!tw) return;
  if (tw.bState === 1) { tw.bState = 2; state.events.push({ kind: "buildStart", player: pl.id, corridor: corr.index, tower: tw.id }); }
  tw.bT -= dt;
  if (tw.bT <= 0) { tw.bT = 0; tw.bState = 0; tw.cd = 0; b.cur = 0; state.events.push({ kind: "built", player: pl.id, corridor: corr.index, tower: tw.id }); }
}

// ---- per-tick passes ------------------------------------------------------------
function xDetects(state, tw) { return tw.def.element === "light" || tw.level >= 7 || towerStats(state, tw).archetype === "support"; }
function xHeal(e, amt) { if (amt > 0 && e.alive) e.hp = fx.min(e.maxHp, e.hp + amt); }
function xPreStep(state, dt) {
  for (const pl of state.players) for (const corr of pl.corridors) {
    xBuilder(state, pl, corr, dt);
    for (const tw of corr.towers) {
      tw.xDmg = fx.ONE; tw.xRate = fx.ONE; tw.confused = false;
      if (tw.upT > 0) { tw.upT -= dt; if (tw.upT <= 0) { tw.upT = 0; state.events.push({ kind: "upgraded", player: pl.id, corridor: corr.index, tower: tw.id }); } }
      if (tw.stunT > 0) { tw.stunT -= dt; if (tw.stunT < 0) tw.stunT = 0; }
      if (tw.jamT > 0) { tw.jamT -= dt; if (tw.jamT <= 0) { tw.jamT = 0; tw.jamMult = fx.ONE; } }
      if (tw.curseT > 0) { tw.curseT -= dt; if (tw.curseT <= 0) { tw.curseT = 0; tw.curseMult = fx.ONE; } }
    }
  }
  const E = state.enemies;
  for (const e of E) { e.auraArmor = 0; e.auraSpeed = fx.ONE; e.auraDmg = fx.ONE; e.cloaked = false; }
  for (const e of E) {
    if (!e.alive || !e.tr) continue;
    const t = e.tr;
    if (t.armorAura || t.speedAura || t.flyerSpeedAura || t.warAura || t.cloakAura || t.regenAura) {
      for (const o of E) {
        if (o === e || !o.alive || o.corr !== e.corr || o.owner !== e.owner) continue;
        const d2 = fx.dist2(e.fx, e.fy, o.fx, o.fy);
        if (t.armorAura && d2 <= sq(t.armorAura.r)) o.auraArmor += t.armorAura.add;
        if (t.speedAura && d2 <= sq(t.speedAura.r)) o.auraSpeed = fx.max(o.auraSpeed, t.speedAura.mult);
        if (t.flyerSpeedAura && o.fly && d2 <= sq(t.flyerSpeedAura.r)) o.auraSpeed = fx.max(o.auraSpeed, t.flyerSpeedAura.mult);
        if (t.warAura && d2 <= sq(t.warAura.r)) { o.auraArmor += t.warAura.armor; o.auraDmg = fx.min(o.auraDmg, t.warAura.dmg); }
        if (t.cloakAura && d2 <= sq(t.cloakAura)) o.cloaked = true;
        if (t.regenAura && d2 <= sq(t.regenAura.r)) xHeal(o, fx.mul(fx.mul(o.maxHp, t.regenAura.pct), dt));
      }
    }
    if (t.corrodeAura || t.chillAura || t.confuseAura) {
      for (const tw of e.corr.towers) {
        if (t.corrodeAura && inRange(tw, e.fx, e.fy, t.corrodeAura.r)) tw.xDmg = fx.min(tw.xDmg, t.corrodeAura.mult);
        if (t.chillAura && inRange(tw, e.fx, e.fy, t.chillAura.r)) tw.xRate = fx.min(tw.xRate, t.chillAura.mult);
        if (t.confuseAura && inRange(tw, e.fx, e.fy, t.confuseAura)) tw.confused = true;
      }
    }
  }
  // stealth: hidden unless a detecting tower (light, level 7+, or support) has it in range
  for (const e of E) {
    e.hidden = false;
    if (!e.alive || !e.tr) continue;
    const t = e.tr;
    let inv = !!t.invisible || e.cloaked;
    if (t.cloakCycle) { const per = t.cloakCycle.every; if (per > 0 && (e.cloakT % per) >= per - t.cloakCycle.dur) inv = true; }
    if (!inv) continue;
    e.hidden = true;
    for (const tw of e.corr.towers) {
      if (tw.bState || !xDetects(state, tw)) continue;
      if (inRange(tw, e.fx, e.fy, towerStats(state, tw).range)) { e.hidden = false; break; }
    }
  }
}
function xPostStep(state, dt) {
  for (let i = state.zones.length - 1; i >= 0; i--) {
    const z = state.zones[i];
    z.t -= dt;
    for (const e of state.enemies) if (e.alive && e.corr === z.corr && e.owner === z.owner && fx.dist2(e.fx, e.fy, z.x, z.y) <= sq(z.r)) xHeal(e, fx.mul(fx.mul(e.maxHp, z.heal), dt));
    if (z.t <= 0) state.zones.splice(i, 1);
  }
  if (state.x.autoWave && state.gameMode === "versus") {
    if (state.nextWaveTick == null) state.nextWaveTick = state.x.firstWave;
    if (state.tick >= state.nextWaveTick) {
      state.nextWaveTick = state.tick + state.x.autoWave;
      for (const p of state.players) if (p.alive) queueWaveFor(state, p);
    }
  }
  if (state.xSpawn.length) { const q = state.xSpawn; state.xSpawn = []; for (const m of q) xSpawnMinions(state, m); }
  if (state.xDirty) { state.enemies = state.enemies.filter((e) => e.alive); state.xDirty = false; }
  if (state.x.sendStock) for (const pl of state.players) for (const k in pl.sendStock) {
    const s = pl.sendStock[k];
    if (s.n >= s.max) continue;
    if (--s.t <= 0) { s.n++; s.t = s.re; }
  }
}

// ---- waves & sends -----------------------------------------------------------
function xWaveEntries(state, fp) {
  if (state.challenge) return generateChallengeWave(state.seedBase, fp.wave, state.challenge.def, state.bal.roster);
  const m = state.x;
  const filter = (r) => !(m.noFlyers && r.fly) && !(m.noDisruptors && r.disrupt) && !(m.noStealth && r.stealth);
  return generateWaveExpanded(state.seedBase, fp.wave, fp.corridorCount, state.bal.bossEvery, { roster: state.bal.roster, filter });
}
function xDisruptT(t) { return !!(t.jamPass || t.corrodeAura || t.chillAura || t.chillFly || t.confuseAura || t.boulder || t.rootTower || t.curseTower || t.deathTowerSlow || t.deathStun || t.shredObstacle); }
function xForbidden(state, type) {
  const d = state.bal.enemies[type]; const x = d && d.x; if (!x) return false;
  const t = x.t, m = state.x;
  return x.noSend || (m.noFlyers && !!t.fly) || (m.noDisruptors && xDisruptT(t)) || (m.noStealth && !!(t.invisible || t.cloakCycle || t.cloakAura));
}
function xStock(pl, type, T) {
  return pl.sendStock[type] || (pl.sendStock[type] = { n: T.stock, max: T.stock, t: T.rechargeTicks, re: T.rechargeTicks });
}
function xSendAllowed(state, pl, type, send) {
  if (xForbidden(state, type)) { state.events.push({ kind: "reject", player: pl.id, reason: "rule" }); return false; }
  if (!state.x.sendStock || !state.bal.sendTiers) return true;
  const T = state.bal.sendTiers[send.tier]; if (!T) return true;
  if (state.tick < T.unlockTicks) { state.events.push({ kind: "reject", player: pl.id, reason: "locked" }); return false; }
  if (xStock(pl, type, T).n <= 0) { state.events.push({ kind: "reject", player: pl.id, reason: "stock" }); return false; }
  return true;
}
function xOnSend(state, pl, type, send) {
  if (state.x.sendStock && state.bal.sendTiers && state.bal.sendTiers[send.tier]) xStock(pl, type, state.bal.sendTiers[send.tier]).n--;
  pl.log.sent[type] = (pl.log.sent[type] || 0) + send.count;
}

// ---- spawning -----------------------------------------------------------------
function xMulHp(a, b) { return Math.min(MAXHP, Math.trunc((a * b) / fx.ONE)); }
function xSpawnEnemy(state, pl, def, type, origin, wave, sent, sendLevel, sentBy) {
  const X = def.x, t = (X && X.t) || NO_T;
  const corr = pl.corridors[origin]; if (!corr) return null;
  const chBoss = !!(X && X.family === "challenge" && def.end);
  const sc = enemyScale(Math.max(1, wave));
  let maxHp = chBoss ? def.hp : xMulHp(def.hp, sc.hp);
  let armor = def.armor, baseSpeed = def.speed;
  let reward = Math.round(def.reward * (sc.reward / fx.ONE));
  const affix = (!def.boss && !sent && !(X && X.minion)) ? waveAffix(state.seedBase, wave, state.bal.bossEvery) : null;
  if (affix) {
    if (affix.hpMult) maxHp = xMulHp(maxHp, F(affix.hpMult));
    if (affix.armorAdd) armor += fx.fromInt(affix.armorAdd);
    if (affix.speedMult) baseSpeed = fx.mul(baseSpeed, F(affix.speedMult));
  }
  const send = sent && state.bal.sendsX[type];
  if (send && sendLevel > 1) {
    const li = Math.min(sendLevel, send.maxLevel) - 1;
    maxHp = xMulHp(maxHp, send.hpMult[li]);
    reward = Math.round(reward * (send.rewardMult[li] / fx.ONE));
  }
  if (chBoss && state.challenge && state.challenge.hard) maxHp = xMulHp(maxHp, F(state.challenge.def.hard.bossHpMult || 1));
  const e = {
    id: state.nextId++, type, def,
    owner: pl.id, originIndex: origin, corridorIndex: origin, corr,
    fx: fx.fromInt(corr.entrance.c) + HALF,
    fy: fx.fromInt(corr.entrance.r) + HALF,
    maxHp, hp: maxHp, armor, baseSpeed, reward,
    sendLevel: sent ? (sendLevel || 1) : 0,
    statuses: {}, statusKeys: [], buffs: 0,
    loopCount: 0, transitions: 0,
    alive: true, boss: def.boss, end: def.end,
    resist: {}, sent: !!sent, speedBuff: fx.ONE,
    affix: affix ? affix.id : null,
    // expanded state
    tr: t, x: X || null, fly: !!t.fly, wave, sentBy: sent && sentBy != null ? sentBy : null,
    shieldHp: t.shield ? fx.mul(maxHp, t.shield.pct) : 0, shieldDelay: 0,
    tm: {}, fl: {}, once: {}, inCorrT: 0, cloakT: 0,
    invulnT: 0, shellT: 0, stoneT: 0, hitArmorT: 0, charge: 0, enrageT: 0, enrageMult: fx.ONE, dupCd: 0, dupN: 0, thrIdx: 0, divIdx: 0,
    auraArmor: 0, auraSpeed: fx.ONE, auraDmg: fx.ONE, hidden: false, cloaked: false, adaptEl: null,
    baseResist: t.resist || null,
  };
  if (t.resist) for (const k in t.resist) e.resist[k] = t.resist[k];
  if (t.midSpawn) {
    const p = xMidSpawnPos(state, corr);
    if (p) { e.fx = fx.fromInt(p.c) + HALF; e.fy = fx.fromInt(p.r) + HALF; state.events.push({ kind: "meteor", player: pl.id, corridor: corr.index, enemy: e.id }); }
  }
  state.enemies.push(e);
  if (t.escort) xQueueMinions(state, e, t.escort.into, t.escort.n);
  return e;
}
function xMidSpawnPos(state, corr) {
  const G = state.grid;
  for (let k = 0; k < 24; k++) {
    const r = 14 + rng.nextInt(state.seedSim, G.rows - 28), c = 2 + rng.nextInt(state.seedSim, G.cols - 4);
    const i = r * G.cols + c;
    if (corr.grid[i] === CELL_FREE && corr.dist[i] < pf.INF) return { c, r };
  }
  return null;
}
function xQueueMinions(state, e, into, n, extra) {
  state.xSpawn.push({ type: into, n, owner: e.owner, corr: e.corr, ci: e.corridorIndex, oi: e.originIndex, tr: e.transitions, lc: e.loopCount,
    x: e.fx, y: e.fy, wave: e.wave || 1, sentBy: e.sentBy, sent: e.sent, extra: extra || null });
}
const MINION_OFF = [[0, 0], [F(0.35), 0], [-F(0.35), 0], [0, F(0.35)], [0, -F(0.35)], [F(0.3), F(0.3)], [-F(0.3), -F(0.3)], [F(0.3), -F(0.3)], [-F(0.3), F(0.3)]];
function xSpawnMinions(state, m) {
  const pl = state.players[m.owner]; if (!pl || !pl.alive) return;
  const def = state.bal.enemies[m.type]; if (!def || !pl.corridors[m.oi]) return;
  const G = state.grid;
  for (let k = 0; k < m.n; k++) {
    const e = xSpawnEnemy(state, pl, def, m.type, m.oi, m.wave, m.sent, 1, m.sentBy);
    if (!e) continue;
    e.corr = m.corr; e.corridorIndex = m.ci; e.originIndex = m.oi; e.transitions = m.tr; e.loopCount = m.lc;
    const off = MINION_OFF[k % MINION_OFF.length];
    let x = m.x + off[0], y = m.y + off[1];
    const c = fx.floorInt(x), r = fx.floorInt(y);
    if (e.fly ? false : (c < 0 || r < 0 || c >= G.cols || r >= G.rows || m.corr.grid[r * G.cols + c] !== CELL_FREE)) { x = m.x; y = m.y; }
    e.fx = x; e.fy = y;
    if (m.extra && m.extra.hp) { e.maxHp = m.extra.maxHp; e.hp = m.extra.hp; e.dupN = m.extra.dupN; e.reward = m.extra.reward; }
    state.events.push({ kind: "minion", player: m.owner, enemy: e.id, type: m.type });
  }
}

// ---- enemy behaviour ------------------------------------------------------------
function pulseT(e, key, every, dt) {
  const T = e.tm;
  T[key] = (T[key] == null ? every : T[key]) - dt;
  if (T[key] <= 0) { T[key] += every; return true; }
  return false;
}
function nearestTower(corr, e, r) {
  let best = null, bd = sq(r);
  for (const tw of corr.towers) { const d = fx.dist2(tw.cx, tw.cy, e.fx, e.fy); if (d < bd) { bd = d; best = tw; } }
  return best;
}
function xJump(state, e, tiles, style) {
  if (e.fly) moveFly(state, e, e.corr, tiles); else moveAlongFlow(state, e, e.corr, tiles);
  state.events.push({ kind: "jump", style, player: e.owner, enemy: e.id });
}
function xEnemyTick(state, e, dt) {
  const t = e.tr, E = state.enemies;
  e.inCorrT += dt; e.cloakT += dt;
  if (e.invulnT > 0) e.invulnT -= dt;
  if (e.stoneT > 0) e.stoneT -= dt;
  if (e.hitArmorT > 0) e.hitArmorT -= dt;
  if (e.enrageT > 0) e.enrageT -= dt;
  if (e.dupCd > 0) e.dupCd -= dt;
  if (e.tm.raise > 0) e.tm.raise -= dt;
  if (t === NO_T) return false;
  if (t.shield) {
    if (e.shieldDelay > 0) e.shieldDelay -= dt;
    else { const mx = fx.mul(e.maxHp, t.shield.pct); if (e.shieldHp < mx) e.shieldHp = fx.min(mx, e.shieldHp + fx.mul(fx.mul(mx, t.shield.regen), dt)); }
  }
  if (t.regen) xHeal(e, fx.mul(fx.mul(e.maxHp, t.regen), dt));
  if (t.healAura && pulseT(e, "heal", t.healAura.every, dt)) {
    for (const o of E) if (o.alive && o.corr === e.corr && o.owner === e.owner && fx.dist2(e.fx, e.fy, o.fx, o.fy) <= sq(t.healAura.r)) xHeal(o, fx.mul(o.maxHp, t.healAura.pct));
    state.events.push({ kind: "pulse", style: "heal", player: e.owner, enemy: e.id });
  }
  if (t.healWounded && pulseT(e, "mend", t.healWounded.every, dt)) {
    let best = null, br = fx.ONE;
    for (const o of E) {
      if (!o.alive || o.corr !== e.corr || o.owner !== e.owner || fx.dist2(e.fx, e.fy, o.fx, o.fy) > sq(t.healWounded.r)) continue;
      const ratio = fx.div(o.hp, o.maxHp);
      if (ratio < br) { br = ratio; best = o; }
    }
    if (best) { xHeal(best, fx.mul(best.maxHp, t.healWounded.pct)); state.events.push({ kind: "pulse", style: "mend", player: e.owner, enemy: best.id }); }
  }
  if (t.repairAura && pulseT(e, "repair", t.repairAura.every, dt)) {
    for (const o of E) if (o.alive && o.x && o.x.mech && o.corr === e.corr && o.owner === e.owner && fx.dist2(e.fx, e.fy, o.fx, o.fy) <= sq(t.repairAura.r)) xHeal(o, fx.mul(o.maxHp, t.repairAura.pct));
    state.events.push({ kind: "pulse", style: "repair", player: e.owner, enemy: e.id });
  }
  if (t.barrier && pulseT(e, "barrier", t.barrier.every, dt)) {
    for (const o of E) if (o.alive && o.corr === e.corr && o.owner === e.owner && fx.dist2(e.fx, e.fy, o.fx, o.fy) <= sq(t.barrier.r)) o.shieldHp = fx.min(o.maxHp >> 1, o.shieldHp + fx.mul(o.maxHp, t.barrier.pct));
    state.events.push({ kind: "pulse", style: "barrier", player: e.owner, enemy: e.id });
  }
  if (t.spawner && pulseT(e, "spawn", t.spawner.every, dt)) xQueueMinions(state, e, t.spawner.into, t.spawner.n);
  if (t.boulder && pulseT(e, "boulder", t.boulder.every, dt)) {
    const tw = nearestTower(e.corr, e, t.boulder.r);
    if (tw) { tw.stunT = fx.max(tw.stunT || 0, t.boulder.stun); state.events.push({ kind: "boulder", player: e.owner, corridor: e.corr.index, enemy: e.id, tower: tw.id }); }
  }
  if (t.curseTower && pulseT(e, "curse", t.curseTower.every, dt)) {
    const tw = nearestTower(e.corr, e, t.curseTower.r);
    if (tw) { tw.curseT = fx.max(tw.curseT || 0, t.curseTower.dur); tw.curseMult = fx.min(tw.curseMult || fx.ONE, t.curseTower.mult); state.events.push({ kind: "curse", player: e.owner, corridor: e.corr.index, enemy: e.id, tower: tw.id }); }
  }
  if (e.shellT > 0) { e.shellT -= dt; return true; }
  if (t.blink && pulseT(e, "blink", t.blink.every, dt)) xJump(state, e, t.blink.tiles, "blink");
  if (t.dash && pulseT(e, "dash", t.dash.every, dt)) xJump(state, e, t.dash.tiles, "dash");
  if (t.voidJump && pulseT(e, "void", t.voidJump.every, dt)) {
    const lo = fx.toInt(t.voidJump.min), hi = fx.toInt(t.voidJump.max);
    xJump(state, e, fx.fromInt(lo + rng.nextInt(state.seedSim, hi - lo + 1)), "void");
  }
  if (t.devour) {
    for (const o of E) {
      if (o === e || !o.alive || o.corr !== e.corr || o.owner !== e.owner || o.boss || o.def.radius > t.devour.maxRadius || (o.tr && o.tr.devour)) continue;
      if (fx.dist2(e.fx, e.fy, o.fx, o.fy) > sq(t.devour.r)) continue;
      o.alive = false; state.xDirty = true;
      const gain = o.maxHp >> 1;
      e.maxHp = fx.min(MAXHP, e.maxHp + gain); e.hp = fx.min(e.maxHp, e.hp + gain);
      state.events.push({ kind: "devour", player: e.owner, enemy: e.id, victim: o.id });
    }
  }
  return false;
}
function xSpeedMult(state, e) {
  const t = e.tr;
  let m = e.auraSpeed || fx.ONE;
  if (t.sprintBelow && e.hp < fx.mul(e.maxHp, t.sprintBelow.at)) m = fx.mul(m, t.sprintBelow.mult);
  if (t.chargeOnHit) m = fx.mul(m, fx.ONE + e.charge);
  if (t.fasterBurning && e.statuses.burning) m = fx.mul(m, t.fasterBurning);
  if (e.enrageT > 0) m = fx.mul(m, e.enrageMult);
  if (e.stoneT > 0) m = fx.mul(m, HALF);
  return m;
}
function moveFly(state, e, corr, stepFx) {
  const tx = fx.fromInt(corr.exit.c) + HALF, ty = fx.fromInt(corr.exit.r) + HALF;
  const dx = tx - e.fx, dy = ty - e.fy;
  let d = fx.len(dx, dy); if (d <= 0) d = 1;
  if (d <= stepFx) { e.fx = tx; e.fy = ty; }
  else { e.fx += fx.div(fx.mul(dx, stepFx), d); e.fy += fx.div(fx.mul(dy, stepFx), d); }
}
function xAfterMove(state, e, corr) {
  const t = e.tr; if (t === NO_T) return;
  if (t.jamPass || t.chillFly) {
    const J = t.jamPass || t.chillFly;
    for (const tw of corr.towers) if (inRange(tw, e.fx, e.fy, J.r)) { tw.jamT = fx.max(tw.jamT || 0, J.dur); tw.jamMult = fx.min(tw.jamMult || fx.ONE, J.mult); }
  }
  if (t.rootTower && !e.fl.root) {
    const tw = nearestTower(corr, e, t.rootTower.r);
    if (tw) { e.fl.root = 1; tw.stunT = fx.max(tw.stunT || 0, t.rootTower.dur); state.events.push({ kind: "root", player: e.owner, corridor: corr.index, enemy: e.id, tower: tw.id }); }
  }
  if (t.shredObstacle && !e.fl.shred) {
    const G = state.grid, c = fx.floorInt(e.fx), r = fx.floorInt(e.fy);
    for (let k = 0; k < pf.NB.length; k++) {
      const cc = c + pf.NB[k][0], rr = r + pf.NB[k][1];
      if (cc < 0 || rr < 0 || cc >= G.cols || rr >= G.rows) continue;
      if (corr.grid[rr * G.cols + cc] !== CELL_OBSTACLE) continue;
      corr.grid[rr * G.cols + cc] = CELL_FREE;
      pf.computeFlow(corr, G.cols, G.rows);
      corr.obsRev = (corr.obsRev || 0) + 1;
      e.fl.shred = 1;
      state.events.push({ kind: "shred", player: e.owner, corridor: corr.index, c: cc, r: rr, enemy: e.id });
      break;
    }
  }
  if (t.phaseWall && !e.fl.phase && !e.fly) xTryPhase(state, e, corr);
}
// step through one tower wall, if the far side is a real shortcut
function xTryPhase(state, e, corr) {
  const G = state.grid;
  const c = fx.clamp(fx.floorInt(e.fx), 0, G.cols - 1), r = fx.clamp(fx.floorInt(e.fy), 0, G.rows - 1);
  const here = corr.dist[r * G.cols + c];
  const DIRS = [[0, -1], [1, 0], [-1, 0], [0, 1]];
  for (const [dc, dr] of DIRS) {
    if (corr.grid[(r + dr) * G.cols + (c + dc)] !== CELL_TOWER || r + dr < 0 || r + dr >= G.rows || c + dc < 0 || c + dc >= G.cols) continue;
    for (let k = 2; k <= 4; k++) {
      const cc = c + dc * k, rr = r + dr * k;
      if (cc < 0 || rr < 0 || cc >= G.cols || rr >= G.rows) break;
      const g = corr.grid[rr * G.cols + cc];
      if (g === CELL_TOWER) continue;
      if (g === CELL_FREE && corr.dist[rr * G.cols + cc] < here - 40) {
        e.fx = fx.fromInt(cc) + HALF; e.fy = fx.fromInt(rr) + HALF; e.fl.phase = 1;
        state.events.push({ kind: "jump", style: "phase", player: e.owner, enemy: e.id });
        return;
      }
      break;
    }
  }
}
function xEnterCorridor(e) { e.inCorrT = 0; e.fl = {}; }

function xStatusBlocked(e, id, def) {
  const t = e.tr;
  if (t === NO_T) return false;
  if (t.statusImmune) return true;
  if (t.immune && t.immune.includes(id)) return true;
  if (def.kind === "slow" && (t.slowImmune || (t.slowImmuneFor && e.inCorrT < t.slowImmuneFor))) return true;
  return false;
}

// ---- damage, death, leaks ---------------------------------------------------------
function xDamageEnemy(state, e, raw, tower, isDot, kind) {
  const t = e.tr;
  if (e.invulnT > 0 || e.shellT > 0) return;
  if (!kind) kind = isDot ? "dot" : "single";
  if (!isDot && t.evasion && kind !== "aura" && rng.chance(state.seedSim, t.evasion)) { state.events.push({ kind: "dodge", player: e.owner, enemy: e.id }); return; }
  if (kind === "chainb" && t.chainImmune) return;
  let dmg = raw;
  let armor = e.armor + (e.auraArmor || 0);
  if (e.stoneT > 0 && t.stoneForm) armor += t.stoneForm.armor;
  if (e.hitArmorT > 0 && t.armorWhenHit) armor = fx.mul(armor, t.armorWhenHit.mult);
  armor = fx.max(0, armor - (e.shred || 0));
  if (!isDot) dmg = fx.max(fx.mul(dmg, F(0.15)), dmg - armor);
  dmg = fx.mul(dmg, e.dmgTakenMult || fx.ONE);
  const phys = kind === "single" || kind === "splash" || kind === "melee";
  if (kind === "splash" && t.splashResist) dmg = fx.mul(dmg, t.splashResist);
  if (phys && t.physResist) dmg = fx.mul(dmg, t.physResist);
  if (!phys && t.magicResist) dmg = fx.mul(dmg, t.magicResist);
  if ((kind === "beam" || kind === "chain" || kind === "chainb") && t.beamResist) dmg = fx.mul(dmg, t.beamResist);
  if (tower) {
    const el = tower.def.element;
    const r = e.resist[el] || 0;
    if (r) dmg = fx.mul(dmg, fx.ONE - r);
    if (t.adaptiveResist) {
      if (e.adaptEl && e.adaptEl !== el) e.resist[e.adaptEl] = (e.baseResist && e.baseResist[e.adaptEl]) || 0;
      e.resist[el] = fx.max((e.baseResist && e.baseResist[el]) || 0, t.adaptiveResist);
      e.adaptEl = el;
    }
  }
  if (dmg <= 0) return;
  if (t.shield) e.shieldDelay = t.shield.delay;
  if (e.shieldHp > 0) { const a = fx.min(e.shieldHp, dmg); e.shieldHp -= a; dmg -= a; if (dmg <= 0) return; }
  e.hp -= dmg;
  if (tower) tower.dmgDone = (tower.dmgDone || 0) + dmg;
  if (!isDot) {
    if (t.armorWhenHit) e.hitArmorT = t.armorWhenHit.dur;
    if (t.chargeOnHit) e.charge = fx.min(t.chargeOnHit.max, e.charge + t.chargeOnHit.per);
  }
  if (e.hp <= 0) { killEnemy(state, e, tower); return; }
  if (t === NO_T) return;
  const frac = fx.div(e.hp, e.maxHp);
  if (t.stoneForm && !e.once.stone && frac < t.stoneForm.at) { e.once.stone = 1; e.stoneT = t.stoneForm.dur; state.events.push({ kind: "form", style: "stone", player: e.owner, enemy: e.id }); }
  if (t.shell && e.thrIdx < t.shell.at.length && frac < t.shell.at[e.thrIdx]) {
    while (e.thrIdx < t.shell.at.length && frac < t.shell.at[e.thrIdx]) e.thrIdx++;
    e.shellT = t.shell.dur; state.events.push({ kind: "form", style: "shell", player: e.owner, enemy: e.id });
  }
  if (t.divineShield && e.divIdx < t.divineShield.at.length && frac < t.divineShield.at[e.divIdx]) {
    while (e.divIdx < t.divineShield.at.length && frac < t.divineShield.at[e.divIdx]) e.divIdx++;
    e.invulnT = t.divineShield.dur; state.events.push({ kind: "form", style: "divine", player: e.owner, enemy: e.id });
  }
  if (t.escape && !e.once.escape && frac < t.escape.at) { e.once.escape = 1; xJump(state, e, t.escape.tiles, "escape"); }
  if (t.duplicate && !isDot && e.dupCd <= 0 && e.dupN < t.duplicate.max && dmg > fx.mul(e.maxHp, t.duplicate.at)) {
    e.dupCd = t.duplicate.cd; e.dupN++;
    e.hp = fx.max(fx.ONE, e.hp >> 1);
    xQueueMinions(state, e, e.type, 1, { hp: e.hp, maxHp: e.maxHp, dupN: t.duplicate.max, reward: e.reward >> 1 });
    state.events.push({ kind: "form", style: "glitch", player: e.owner, enemy: e.id });
  }
}
function xTryRevive(state, e) {
  const t = e.tr;
  if (!t.revive || e.once.revive) return false;
  e.once.revive = 1;
  e.hp = fx.max(fx.ONE, fx.mul(e.maxHp, t.revive.hp));
  for (let k = e.statusKeys.length - 1; k >= 0; k--) { const key = e.statusKeys[k]; if (!state.bal.statuses[key].adaptive) { delete e.statuses[key]; e.statusKeys.splice(k, 1); } }
  e.invulnT = F(1);
  state.events.push({ kind: "form", style: "revive", player: e.owner, enemy: e.id });
  return true;
}
function xOnKill(state, e, creditPl) {
  if (creditPl.log) creditPl.log.kills[e.type] = (creditPl.log.kills[e.type] || 0) + 1;
  const t = e.tr || NO_T;
  const E = state.enemies;
  if (t !== NO_T) {
    if (t.split) xQueueMinions(state, e, t.split.into, t.split.n);
    if (t.deathShield) for (const o of E) if (o !== e && o.alive && o.corr === e.corr && o.owner === e.owner && fx.dist2(e.fx, e.fy, o.fx, o.fy) <= sq(t.deathShield.r)) o.shieldHp = fx.min(o.maxHp >> 1, o.shieldHp + fx.mul(o.maxHp, t.deathShield.pct));
    if (t.deathZone) { state.zones.push({ id: state.nextId++, corr: e.corr, owner: e.owner, x: e.fx, y: e.fy, r: t.deathZone.r, heal: t.deathZone.heal, t: t.deathZone.dur, dur: t.deathZone.dur }); }
    if (t.deathTowerSlow || t.deathStun) for (const tw of e.corr.towers) {
      if (t.deathTowerSlow && inRange(tw, e.fx, e.fy, t.deathTowerSlow.r)) { tw.jamT = fx.max(tw.jamT || 0, t.deathTowerSlow.dur); tw.jamMult = fx.min(tw.jamMult || fx.ONE, t.deathTowerSlow.mult); }
      if (t.deathStun && inRange(tw, e.fx, e.fy, t.deathStun.r)) tw.stunT = fx.max(tw.stunT || 0, t.deathStun.dur);
    }
    if (t.enrageOnDeath) for (const o of E) if (o !== e && o.alive && o.corr === e.corr && o.owner === e.owner && fx.dist2(e.fx, e.fy, o.fx, o.fy) <= sq(t.enrageOnDeath.r)) { o.enrageT = F(6); o.enrageMult = t.enrageOnDeath.mult; }
  }
  // nearby necromancers raise the dead; ghouls feast
  for (const o of E) {
    if (o === e || !o.alive || !o.tr || o.tr === NO_T || o.corr !== e.corr || o.owner !== e.owner) continue;
    const ot = o.tr;
    if (!ot.raiseDead && !ot.feast) continue;
    const d2 = fx.dist2(e.fx, e.fy, o.fx, o.fy);
    if (ot.raiseDead && d2 <= sq(ot.raiseDead.r) && !(o.tm.raise > 0) && e.type !== ot.raiseDead.into) { o.tm.raise = ot.raiseDead.cd; xQueueMinions(state, e, ot.raiseDead.into, 1); }
    if (ot.feast && d2 <= sq(ot.feast.r)) xHeal(o, fx.mul(o.maxHp, ot.feast.pct));
  }
}
function xRecordLeak(state, pl, e, versus) {
  if (pl.log && pl.log.leaks.length < 300) pl.log.leaks.push({ t: state.tick, type: e.type, hp: Math.max(0, fx.toInt(fx.mul(fx.div(e.hp, e.maxHp), fx.fromInt(100)))), from: e.sentBy, corridor: e.corridorIndex, wave: e.wave || pl.wave });
  if (!versus || !state.x.lifeSteal || e.sentBy == null || e.sentBy === pl.id) return;
  const s = state.players[e.sentBy];
  if (!s || !s.alive) return;
  const n = state.bal.loopLifeLoss;
  s.lives = Math.min(s.maxLives + 20, s.lives + n);
  s.log.livesStolen += n;
  pl.log.stolenBy[e.sentBy] = (pl.log.stolenBy[e.sentBy] || 0) + n;
  state.events.push({ kind: "steal", from: pl.id, to: s.id, n, type: e.type });
}

// ---- targeting: air, stealth and confusion ------------------------------------------
function xAcquireTarget(state, pl, corr, tw, range, arche) {
  const air = arche !== "splash" && arche !== "melee";
  let best = null, bestScore = Infinity;
  const G = state.grid;
  const mode = tw.targetMode || "first";
  const cands = tw.confused ? [] : null;
  for (const e of state.enemies) {
    if (!e.alive || e.owner !== pl.id || e.corr !== corr) continue;
    if (e.hidden || (e.fly && !air)) continue;
    if (!inRange(tw, e.fx, e.fy, range)) continue;
    if (cands) { cands.push(e); continue; }
    let score;
    if (mode === "strong") score = -e.hp;
    else if (mode === "weak") score = e.hp;
    else {
      score = corr.dist[fx.clamp(fx.floorInt(e.fy), 0, G.rows - 1) * G.cols + fx.clamp(fx.floorInt(e.fx), 0, G.cols - 1)] || 0;
      if (score >= pf.INF) score = 0;
      if (mode === "last") score = -score;
    }
    if (e.statuses["magnetized"]) score -= 1e9;
    if (tw.anchorTargetId === e.id) score -= 5e9;
    if (score < bestScore || (score === bestScore && best && e.id < best.id)) { bestScore = score; best = e; }
  }
  if (cands) return cands.length ? cands[rng.nextInt(state.seedSim, cands.length)] : null;
  return best;
}

export default { createState, step, SIM_HZ };
