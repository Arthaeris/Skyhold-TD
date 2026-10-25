// Skyhold TD — sim parity test against Circle-TD.
//
// Runs Skyhold's sim/core.js and Circle-TD's sim/core.js side by side on the
// same seeds and the same scripted commands, and compares hashState() after
// every tick. Skyhold only adds render-only events, so the hashes must match.
//
//   node tools/parity-test.mjs ../Circle-TD        (path to a Circle-TD checkout)
//   node tools/parity-test.mjs                     (Skyhold-only smoke test)
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const sky = resolve(here, "..");
const circleDir = process.argv[2] ? resolve(process.argv[2]) : null;

function loadDB(dbFile, extFile) {
  const ctx = { console };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(readFileSync(dbFile, "utf8"), ctx);
  vm.runInContext(readFileSync(extFile, "utf8"), ctx);
  return ctx.DB;
}
async function loadSim(root, dbFile, extFile) {
  const imp = (p) => import(pathToFileURL(resolve(root, p)).href);
  const core = await imp("sim/core.js"), bal = await imp("sim/balance.js"), hash = await imp("sim/hash.js"), fx = await imp("sim/fx.js");
  const DB = loadDB(dbFile, extFile);
  return { core, hash, fx, DB, bal: bal.buildBalance(DB) };
}

const S = await loadSim(sky, resolve(sky, "circle/database.js"), resolve(sky, "circle/database-ext.js"));
const C = circleDir ? await loadSim(circleDir, resolve(circleDir, "database.js"), resolve(circleDir, "database-ext.js")) : null;

// A scripted session: build a little maze, upgrade, start waves, call early, send.
function script(tick, st) {
  const cmds = [];
  const p = 0;
  const towers = ["storm_1", "light_0", "mech_1", "fire_0", "ice_3", "nature_4", "fire_1", "ice_2", "nature_3", "fire_3"];
  if (tick < 60 && tick % 6 === 1) {
    const k = (tick - 1) / 6;
    for (let ci = 0; ci < st.players[0].corridors.length; ci++)
      cmds.push({ type: "BuildTower", player: p, corridorId: ci, gx: 9 + (k % 3) * 6, gy: 14 + Math.floor(k / 3) * 10, towerType: towers[(k + ci) % towers.length], masteryLevel: 5 });
  }
  if (tick === 70) cmds.push({ type: "StartWave", player: p });
  if (tick > 70 && tick % 400 === 0) cmds.push({ type: "StartWave", player: p });
  if (tick % 97 === 0) {
    const corr = st.players[0].corridors[0];
    if (corr.towers.length) cmds.push({ type: "UpgradeTower", player: p, corridorId: 0, towerId: corr.towers[tick % corr.towers.length].id });
  }
  if (tick % 211 === 0) {
    const corr = st.players[0].corridors[0];
    if (corr.towers.length) cmds.push({ type: "SetTargetMode", player: p, corridorId: 0, towerId: corr.towers[0].id, mode: ["first", "last", "strong", "weak"][(tick / 211) % 4 | 0] });
  }
  if (st.gameMode === "versus" && tick % 150 === 0) cmds.push({ type: "SendEnemy", player: 1, target: 0, enemyType: ["grunt", "runner", "swarm"][(tick / 150) % 3 | 0] });
  return cmds;
}

const scenarios = [
  { seed: 1234, mode: "loop", gameMode: "solo", economy: "shared", statusMode: "standard", players: [{ corridorCount: 4, elements: ["fire", "ice", "nature", "storm"] }] },
  { seed: 99, mode: "single", gameMode: "solo", economy: "elemental", statusMode: "advanced", players: [{ corridorCount: 1, elements: ["storm"] }] },
  { seed: 4242, mode: "endless", gameMode: "versus", economy: "shared", statusMode: "standard", players: [{ corridorCount: 1, elements: ["fire"] }, { corridorCount: 1, elements: ["ice"] }, { corridorCount: 1, elements: ["nature"] }] },
];
const TICKS = 6000;
let fails = 0;
for (const cfg of scenarios) {
  const a = S.core.createState(S.bal, structuredClone(cfg));
  const b = C ? C.core.createState(C.bal, structuredClone(cfg)) : null;
  const dt = S.fx.fromFloat(1 / 30);
  let zaps = 0, kills = 0, first = -1;
  for (let t = 1; t <= TICKS; t++) {
    S.core.step(a, script(t, a).map((c) => ({ ...c })), dt);
    for (const ev of a.events) { if (ev.kind === "zap") zaps++; if (ev.kind === "kill") kills++; }
    if (b) {
      C.core.step(b, script(t, b).map((c) => ({ ...c })), dt);
      if (S.hash.hashState(a) !== C.hash.hashState(b)) { first = t; break; }
    }
  }
  const p = a.players[0];
  const tag = `${cfg.gameMode}/${cfg.mode}/${cfg.players[0].corridorCount}c seed ${cfg.seed}`;
  if (first >= 0) { fails++; console.log(`FAIL ${tag}: hash diverged at tick ${first}`); }
  else console.log(`${C ? "OK  " : "RAN "} ${tag}: wave ${p.wave}, lives ${p.lives}, kills ${p.stats.kills}, towers ${p.corridors.reduce((n, c) => n + c.towers.length, 0)}, zap events ${zaps}, kill events ${kills}${C ? " — hashes identical for " + TICKS + " ticks" : ""}`);
}
if (!C) console.log("(pass a Circle-TD checkout path to compare hashes tick by tick)");
process.exit(fails ? 1 : 0);
