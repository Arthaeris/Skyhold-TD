// Skyhold TD — expanded-ruleset soak test.
// Runs versus and solo matches with the full bestiary: every mob is sent, waves
// run deep, builders work. Checks for crashes, NaN/overflow, determinism (two
// identical runs must hash the same every tick) and that every trait fired.
//   node tools/expanded-soak.mjs [ticks]
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const imp = (p) => import(pathToFileURL(resolve(root, p)).href);
const ctx = { console }; ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(readFileSync(resolve(root, "circle/database.js"), "utf8"), ctx);
vm.runInContext(readFileSync(resolve(root, "circle/database-ext.js"), "utf8"), ctx);
const DB = ctx.DB;
const mobs = await imp("content/mobs.js");
mobs.extendDB(DB);
const core = await imp("sim/core.js"), balM = await imp("sim/balance.js"), hash = await imp("sim/hash.js"), fx = await imp("sim/fx.js");
const bal = balM.buildBalance(DB);
const TICKS = +(process.argv[2] || 24000);
const dt = fx.fromFloat(1 / 30);
const sendTypes = Object.keys(DB.SENDS_EXPANDED);
const towersOf = (el) => DB.TOWERS.filter((t) => t.element === el);

function script(tick, st, cfg) {
  const cmds = [];
  const G = st.grid;
  const plan = DB.makeMazePlan(G.cols, G.rows, DB.CONFIG.towerSize);
  st.players.forEach((pl, pi) => {
    if (!pl.alive) return;
    const corr = pl.corridors[0];
    if (!corr) return;
    if (tick % 23 === pi * 3 + 1 && corr.towers.length < 22) {
      const s = plan[(corr.towers.length + tick) % plan.length];
      const opts = towersOf(corr.element);
      cmds.push({ type: "BuildTower", player: pi, corridorId: 0, gx: s.c + 1, gy: s.r + 1, towerType: opts[(tick / 23 | 0) % opts.length].id, masteryLevel: 5 });
    }
    if (tick % 61 === pi && corr.towers.length) cmds.push({ type: "UpgradeTower", player: pi, corridorId: 0, towerId: corr.towers[tick % corr.towers.length].id });
    if (tick % 1777 === pi * 5 && corr.towers.length > 3) cmds.push({ type: "SellTower", player: pi, corridorId: 0, towerId: corr.towers[0].id });
    if (cfg.gameMode === "versus" && tick % 37 === pi * 2) cmds.push({ type: "SendEnemy", player: pi, target: 0, enemyType: sendTypes[((tick / 37) | 0 + pi * 11) % sendTypes.length] });
    if (cfg.gameMode === "versus" && tick % 997 === pi) cmds.push({ type: "UpgradeSend", player: pi, enemyType: sendTypes[(tick + pi) % sendTypes.length] });
  });
  if (tick === 40 || (tick > 40 && tick % 330 === 0)) cmds.push({ type: "StartWave", player: 0 });
  return cmds;
}

const scenarios = [
  { name: "versus x5", seed: 777, mode: "endless", gameMode: "versus", economy: "shared", statusMode: "standard", ruleset: "expanded", mods: {},
    players: ["fire", "ice", "nature", "light", "mech"].map((e, i) => ({ corridorCount: 1, elements: [e], incomeMult: [1, 0.75, 1, 1.25, 1.5][i], goldBonus: 400 })) },
  { name: "solo loop x4", seed: 31337, mode: "endless", gameMode: "solo", economy: "shared", statusMode: "advanced", ruleset: "expanded", mods: { goldMult: 3 },
    players: [{ corridorCount: 4, elements: ["storm", "darkness", "abnormal", "fire"] }] },
  { name: "challenge mire hard", seed: 5, mode: "loop", gameMode: "solo", economy: "shared", statusMode: "standard", ruleset: "expanded", mods: { goldMult: 4 }, challenge: { id: "mire", hard: true },
    players: [{ corridorCount: 1, elements: ["storm"] }] },
];

let fail = 0;
const seenTypes = new Set(), events = {};
for (const cfg of scenarios) {
  const runs = [0, 1].map(() => core.createState(bal, structuredClone(cfg)));
  let firstDiff = -1, maxEnemies = 0;
  try {
    for (let t = 1; t <= TICKS; t++) {
      for (const st of runs) {
        // keep the players alive and funded so the soak goes deep
        for (const p of st.players) { if (p.alive) { p.lives = Math.max(p.lives, 5); p.gold = Math.max(p.gold, 3000); } }
        core.step(st, script(t, st, cfg).map((c) => ({ ...c })), dt);
      }
      const a = runs[0];
      for (const ev of a.events) events[ev.kind + (ev.style ? ":" + ev.style : "")] = (events[ev.kind + (ev.style ? ":" + ev.style : "")] || 0) + 1;
      for (const e of a.enemies) {
        seenTypes.add(e.type);
        if (!Number.isFinite(e.hp) || !Number.isFinite(e.fx) || e.maxHp <= 0) throw new Error("bad enemy " + e.type + " hp=" + e.hp + " max=" + e.maxHp);
      }
      maxEnemies = Math.max(maxEnemies, a.enemies.length);
      if (firstDiff < 0 && hash.hashState(runs[0]) !== hash.hashState(runs[1])) firstDiff = t;
      if (a.finished) break;
    }
  } catch (e) { console.log("CRASH", cfg.name, e.stack); fail++; continue; }
  const a = runs[0];
  console.log(`${cfg.name.padEnd(22)} tick ${a.tick}  wave ${a.players[0].wave}  peak enemies ${maxEnemies}  ${firstDiff < 0 ? "deterministic" : "DESYNC at " + firstDiff}  leaks ${a.players.reduce((n, p) => n + (p.log ? p.log.leaks.length : 0), 0)}  stolen ${a.players.reduce((n, p) => n + (p.log ? p.log.livesStolen : 0), 0)}`);
  if (firstDiff >= 0) fail++;
}
const all = [...DB.MOBS_EXPANDED];
const missing = all.filter((id) => !seenTypes.has(id));
console.log("mob types seen:", all.length - missing.length, "/", all.length, missing.length ? "missing: " + missing.join(", ") : "");
console.log("events:", Object.entries(events).sort().map(([k, v]) => k + "=" + v).join(" "));
if (fail) { console.log("FAIL"); process.exit(1); } else console.log("OK");
