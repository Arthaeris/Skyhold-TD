// Skyhold TD — balance harness.
// Plays whole runs headlessly with the NPC brain (app/npc.js) as the player and reports win rates,
// how far runs get, how long they take and what leaks. Used to tune content/rules.js.
//
//   node tools/balance-sim.mjs solo   [seeds] [level]   every element × Single / Loop 4 / Loop 8 × difficulty
//   node tools/balance-sim.mjs vs     [seeds]           4-seat Vs at every NPC level, plus a send-spammer test
//   node tools/balance-sim.mjs ch     [seeds] [level]   every challenge × element, Normal and Hard
//   node tools/balance-sim.mjs one '<json cfg>' [level] one run, wave by wave
// TUNE='{"towerDamage":1.1}' overrides content/rules.js TUNE for a quick experiment.
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
if (process.env.TUNE) Object.assign(DB.RULES.TUNE, JSON.parse(process.env.TUNE));
const core = await imp("sim/core.js"), balM = await imp("sim/balance.js"), fx = await imp("sim/fx.js");
const { createNpc, NPC_LEVELS } = await imp("app/npc.js");
export const bal = balM.buildBalance(DB);
const dt = fx.fromFloat(1 / 30);
function prng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const ELS = ["fire", "ice", "nature", "storm", "light", "darkness", "mech", "abnormal"];

// one solo run: the NPC brain builds, the harness calls waves (2.5 s after a clear) and the End Boss
const MASTERY = process.env.MASTERY != null ? +process.env.MASTERY : 5;
export function runSolo(cfg, level, o = {}) {
  if (o.mastery == null) o.mastery = () => MASTERY;
  const st = core.createState(bal, structuredClone(cfg));
  const npc = createNpc({ id: 0, level, DB, rng: prng(cfg.seed * 7 + 3), sends: false, startAt: 0, mastery: o.mastery });
  const pl = st.players[0];
  let clock = 0, wait = 0, won = false, endTried = false;
  const waves = []; let cur = null;
  const maxTicks = o.maxTicks || 30 * 60 * 120;
  while (st.tick < maxTicks && !st.finished) {
    const out = [];
    clock += 1 / 30;
    npc.tick(st, clock, (c) => out.push(c));
    if (pl.phase === "build") { wait++; if (wait > 30 * (pl.wave === 0 ? 18 : 2.5)) { out.push({ type: "StartWave", player: 0 }); wait = 0; } }
    else if (pl.phase === "prep") { wait++; if (wait > 30 * 8) { if (o.skipEnd) break; endTried = true; out.push({ type: "StartWave", player: 0 }); wait = 0; } }
    else wait = 0;
    core.step(st, out, dt);
    if (o.onTick) o.onTick(st, pl, out);
    for (const ev of st.events) {
      if (ev.kind === "wave" && ev.player === 0) cur = { w: ev.wave, t0: st.tick, l0: pl.lives, boss: ev.boss };
      if (ev.kind === "waveClear" && ev.player === 0 && cur) { cur.s = (st.tick - cur.t0) / 30; cur.lost = cur.l0 - pl.lives; const tw = pl.corridors.flatMap((c) => c.towers); cur.towers = tw.length; cur.lvl = tw.reduce((a, t) => a + t.level, 0) / Math.max(1, tw.length); cur.gold = pl.gold; waves.push(cur); cur = null; }
      if (ev.kind === "wavesCleared") won = true;
    }
  }
  const leaks = {};
  for (const l of pl.log.leaks) leaks[l.type] = (leaks[l.type] || 0) + 1;
  const syn = pl.log.syn || 0;
  return { st, pl, won: won || (st.challenge && pl.phase === "victory"), endWin: pl.phase === "victory", endTried, wave: pl.wave, lives: pl.lives, min: st.tick / 1800, waves, leaks, syn };
}

function soloCfg(seed, mode, n, els, diff, extra = {}) {
  return { seed, mode, gameMode: "solo", economy: "shared", statusMode: "standard", ruleset: "expanded", mods: { difficulty: diff, ...(extra.mods || {}) }, players: [{ corridorCount: n, elements: els }], ...extra.cfg };
}
function pct(a, b) { return b ? Math.round((100 * a) / b) + "%" : "-"; }

const cmd = process.argv[1].endsWith("balance-sim.mjs") ? (process.argv[2] || "solo") : null;
const seeds = +(process.argv[3] || 4);
const level = process.argv[4] || "normal";

if (cmd && cmd === "one") {
  const cfg = JSON.parse(process.argv[3]);
  const r = runSolo(cfg, process.argv[4] || "normal");
  console.log(`${r.won ? "WON" : "lost"} wave ${r.wave}/${r.pl.totalWaves} lives ${r.lives} endboss ${r.endTried ? (r.endWin ? "beaten" : "lost") : "-"} ${r.min.toFixed(1)} min, reactions ${r.syn}`);
  for (const w of r.waves) console.log(`  w${w.w}${w.boss ? "B" : ""} ${w.s.toFixed(0)}s lost ${w.lost}  towers ${w.towers} avgLv ${w.lvl.toFixed(1)} gold ${w.gold}`);
  console.log("  leak log:", r.pl.log.leaks.map((l) => "w" + l.wave + ":" + l.type + "(" + l.hp + "%)").join(" "));
  console.log("  leaks:", Object.entries(r.leaks).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => k + "×" + v).join(", "));
}

if (cmd && cmd === "solo") {
  const modes = (process.env.MODES || "single:1,loop:4,loop:8").split(",").map((x) => x.split(":"));
  const diffs = (process.env.DIFFS || "chill,normal,hard,brutal").split(",");
  for (const [mode, nS] of modes) {
    const n = +nS;
    for (const diff of diffs) {
      let wins = 0, ends = 0, endTries = 0, runs = 0, mins = 0, waveSum = 0, syn = 0; const per = {};
      const secs = [];
      for (const el of ELS) {
        let w = 0;
        for (let s = 1; s <= seeds; s++) {
          // a partner element for reactions: the next element in the wheel
          const partner = ELS[(ELS.indexOf(el) + 1 + (s % 3)) % 8];
          const els = n === 1 ? [el, partner] : Array.from({ length: n }, (_, i) => ELS[(ELS.indexOf(el) + i * (s % 2 ? 1 : 3)) % 8]);
          const r = runSolo(soloCfg(s * 101 + n, mode, n, els, diff), level);
          runs++; if (r.won) { wins++; w++; } if (r.endTried) { endTries++; if (r.endWin) ends++; }
          mins += r.min; waveSum += r.wave; syn += r.syn;
          for (const x of r.waves) secs.push(x.s);
        }
        per[el] = w + "/" + seeds;
      }
      secs.sort((a, b) => a - b);
      console.log(`${mode}${n} ${diff.padEnd(6)} win ${pct(wins, runs).padStart(4)}  End Boss ${pct(ends, endTries).padStart(4)}  avg wave ${(waveSum / runs).toFixed(1)}  ${(mins / runs).toFixed(1)} min/run  median wave ${secs.length ? secs[secs.length >> 1].toFixed(0) : "-"}s  reactions/run ${(syn / runs).toFixed(0)}  | ${Object.entries(per).map(([k, v]) => k.slice(0, 4) + " " + v).join("  ")}`);
    }
  }
}

if (cmd && cmd === "vs") {
  const levels = ["easy", "normal", "hard", "insane"];
  for (const lv of levels) {
    let len = 0, firstOut = [], winsBy = {};
    for (let s = 1; s <= seeds; s++) {
      const r = runVs(s, [lv, lv, lv, lv]);
      len += r.min; firstOut.push(r.first.toFixed(1)); winsBy[r.winner] = (winsBy[r.winner] || 0) + 1;
    }
    console.log(`Vs 4× ${lv.padEnd(6)} avg ${(len / seeds).toFixed(1)} min, first seat out at ${firstOut.join("/")} min, winners ${JSON.stringify(winsBy)}`);
  }
  // a stronger NPC against three weaker ones, then the send-spam test
  for (const [a, b] of [["insane", "normal"], ["hard", "easy"], ["normal", "easy"]]) {
    let w = 0; let len = 0;
    for (let s = 1; s <= seeds; s++) { const r = runVs(s, [a, b, b, b]); if (r.winner === 0) w++; len += r.min; }
    console.log(`Vs ${a} vs 3× ${b}: ${a} won ${w}/${seeds}, avg ${(len / seeds).toFixed(1)} min`);
  }
  let surv = 0, len = 0;
  for (let s = 1; s <= seeds; s++) { const r = runVs(s, ["normal", "normal", "normal", "normal"], { spammer: 3 }); if (r.st.players[0].alive || r.deathOf[0] > r.deathOf[3]) surv++; len += r.min; }
  console.log(`Spam test: a seat that dumps all its gold into sends vs a Normal defender: defender outlived the spammer ${surv}/${seeds}`);
}

function runVs(seed, levels, o = {}) {
  const players = levels.map((lv, i) => ({ corridorCount: 1, elements: [ELS[(seed * 3 + i * 2) % 8], ELS[(seed * 3 + i * 2 + 1) % 8]], incomeMult: i ? NPCL(lv).incomeMult : 1, goldBonus: i ? NPCL(lv).goldBonus : 0 }));
  const cfg = { seed, mode: "endless", gameMode: "versus", economy: "shared", statusMode: "standard", ruleset: "expanded", mods: { autoWave: 32, firstWave: 25 }, players };
  const st = core.createState(bal, structuredClone(cfg));
  const npcs = levels.map((lv, i) => createNpc({ id: i, level: lv, DB, rng: prng(seed * 31 + i), sends: true }));
  let clock = 0; const deathOf = {};
  const spam = o.spammer != null ? o.spammer : -1;
  const sends = DB.SENDS_EXPANDED;
  const maxT = o.maxTicks || +(process.env.VSMAX || 0) * 1800 || 30 * 60 * 40;
  while (st.tick < maxT && !st.finished) {
    const out = [];
    clock += 1 / 30;
    npcs.forEach((n, i) => { if (i === spam) return; n.tick(st, clock, (c) => out.push(c)); });
    if (spam >= 0 && st.players[spam].alive && st.tick % 10 === 0) {
      // the spammer: builds nothing past 4 towers, sends everything it can afford
      const p = st.players[spam];
      if (p.corridors[0].towers.length < 4 && st.tick % 30 === 0) npcs[spam].tick(st, clock, (c) => out.push(c));
      const types = Object.keys(sends).filter((t) => sends[t].tier <= 4);
      const t = types[(st.tick / 10) % types.length | 0];
      out.push({ type: "SendEnemy", player: spam, target: 0, enemyType: t });
    }
    core.step(st, out, dt);
    if (o.onTick) o.onTick(st, pl, out);
    for (const ev of st.events) if (ev.kind === "defeat") deathOf[ev.player] = st.tick / 1800;
  }
  const alive = st.players.map((p, i) => (p.alive ? i : -1)).filter((i) => i >= 0);
  const outs = Object.values(deathOf);
  return { st, min: st.tick / 1800, winner: alive.length === 1 ? alive[0] : "none", first: outs.length ? Math.min(...outs) : st.tick / 1800, deathOf: Object.assign({ 0: 99, 3: 99 }, deathOf) };
}
function NPCL(lv) { return NPC_LEVELS[lv]; }

if (cmd && cmd === "ch") {
  for (const ch of DB.CHALLENGES.filter((c) => !process.env.CH || process.env.CH.split(",").includes(c.id))) {
    for (const hard of (process.env.HARD === "0" ? [false] : [false, true])) {
      const per = {}; let wins = 0, runs = 0, wsum = 0;
      for (const el of ELS) {
        let w = 0;
        for (let s = 1; s <= seeds; s++) {
          const partner = process.env.SOLOEL ? null : ELS[(ELS.indexOf(el) + 1 + (s % 4)) % 8];
          const r = runSolo({ seed: s * 7 + 1, mode: "loop", gameMode: "solo", economy: "shared", statusMode: "standard", ruleset: "expanded", mods: {}, challenge: { id: ch.id, hard }, players: [{ corridorCount: 1, elements: partner ? [el, partner] : [el] }] }, level);
          runs++; if (r.won) { w++; wins++; } wsum += r.wave || 0;
        }
        per[el] = w;
      }
      const winners = Object.values(per).filter((v) => v > 0).length;
      console.log(`${ch.id.padEnd(8)} ${hard ? "HARD  " : "normal"} win ${pct(wins, runs).padStart(4)}, avg wave ${(wsum / runs).toFixed(1)}, elements won: ${winners}/8 | ${Object.entries(per).map(([k, v]) => k.slice(0, 4) + " " + v + "/" + seeds).join("  ")}`);
    }
  }
}

if (cmd && cmd === "curve") {
  // per-wave difficulty curve: share of runs alive, lives lost, wave length
  const [mode, nS] = (process.env.MODE || "single:1").split(":"); const n = +nS;
  const diff = process.env.DIFF || "normal";
  const agg = {}; let runs = 0, ends = 0, endT = 0;
  for (const el of ELS) for (let s = 1; s <= seeds; s++) {
    const partner = ELS[(ELS.indexOf(el) + 1 + (s % 3)) % 8];
    const els = n === 1 ? [el, partner] : Array.from({ length: n }, (_, i) => ELS[(ELS.indexOf(el) + i * (s % 2 ? 1 : 3)) % 8]);
    const r = runSolo(soloCfg(s * 101 + n, mode, n, els, diff), level);
    runs++; if (r.endTried) { endT++; if (r.endWin) ends++; }
    for (const w of r.waves) { const a = agg[w.w] || (agg[w.w] = { n: 0, s: 0, lost: 0, boss: w.boss }); a.n++; a.s += w.s; a.lost += w.lost; }
  }
  for (const k of Object.keys(agg).map(Number).sort((a, b) => a - b)) { const a = agg[k]; console.log(`w${k}${a.boss ? "B" : " "} cleared by ${pct(a.n, runs).padStart(4)}  avg ${(a.s / a.n).toFixed(0).padStart(4)}s  lives lost ${(a.lost / a.n).toFixed(1)}`); }
  console.log(`End Boss beaten ${ends}/${endT}`);
}

if (cmd && cmd === "leaks") {
  // what costs lives, by wave: aggregated over every element
  const [mode, nS] = (process.env.MODE || "single:1").split(":"); const n = +nS;
  const diff = process.env.DIFF || "normal";
  const byWave = {};
  for (const el of ELS) for (let s = 1; s <= seeds; s++) {
    const partner = ELS[(ELS.indexOf(el) + 1 + (s % 3)) % 8];
    const els = n === 1 ? [el, partner] : Array.from({ length: n }, (_, i) => ELS[(ELS.indexOf(el) + i * (s % 2 ? 1 : 3)) % 8]);
    const r = runSolo(soloCfg(s * 101 + n, mode, n, els, diff), level);
    for (const l of r.pl.log.leaks) { const w = byWave[l.wave] || (byWave[l.wave] = {}); w[l.type] = (w[l.type] || 0) + 1; }
  }
  for (const w of Object.keys(byWave).map(Number).sort((a, b) => a - b)) console.log("w" + w, Object.entries(byWave[w]).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => k + "×" + v).join(", "));
}

if (cmd && cmd === "vsone") {
  const lv = process.argv[4] || "normal";
  const r = runVs(seeds, [lv, lv, lv, lv]);
  console.log("winner", r.winner, "min", r.min.toFixed(1), "deaths", JSON.stringify(r.deathOf));
  r.st.players.forEach((p, i) => {
    const L = p.log; const by = {}; for (const l of L.leaks) { const k = (l.from != null ? "sent:" : "wave:") + l.type; by[k] = (by[k] || 0) + 1; }
    if (process.env.TOWERS) console.log("   towers:", p.corridors[0].towers.map((t) => t.def.id + "L" + t.level).join(" "));
    console.log(`seat ${i} ${p.elements.join("+")} alive=${p.alive} lives ${p.lives} wave ${p.wave} towers ${p.corridors[0].towers.length} gold ${p.gold} income ${p.income} sent ${Object.values(L.sent).reduce((a, b) => a + b, 0)} | leaks ${L.leaks.length}: ${Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => k + "×" + v).join(", ")}`);
  });
}
