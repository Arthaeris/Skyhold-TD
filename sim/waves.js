/* =============================================================================
 * Circle Tower Wars — sim/waves.js
 * DETERMINISTIC WAVE GENERATION + enemy scaling, in fixed-point.
 * Pure function of (wave, corridorCount) — identical on every client. Mirrors
 * the original database.js generateWave/enemyScale tuning but emits fixed-point
 * scale factors so spawning stays bit-exact.
 * ===========================================================================*/

import { fromFloat, fromInt, mul } from "./fx.js";

// Returns spawn groups: { type, count, gap(fx sec), delay(fx sec) }
export function generateWave(wave, corridorCount, bossEvery) {
  const isBoss = wave % bossEvery === 0;
  const entries = [];
  if (isBoss) {
    entries.push({ type: "boss", count: 1, gap: 0, delay: 0 });
    const escorts = 4 + Math.floor(wave / 10) * 2;
    entries.push({ type: "brute", count: escorts, gap: fromFloat(1.1), delay: fromFloat(2) });
    entries.push({ type: "runner", count: escorts * 2, gap: fromFloat(0.5), delay: fromFloat(1) });
    return entries;
  }
  const base = 6 + Math.floor(wave * 0.7);
  entries.push({ type: "grunt", count: Math.round(base * 0.6), gap: fromFloat(0.75), delay: 0 });
  entries.push({ type: "runner", count: Math.round(3 + wave * 0.3), gap: fromFloat(0.45), delay: fromFloat(0.6) });
  if (wave >= 4) entries.push({ type: "swarm", count: Math.round(6 + wave * 0.6), gap: fromFloat(0.22), delay: fromFloat(1.4) });
  if (wave >= 6) entries.push({ type: "brute", count: 1 + Math.floor(wave / 6), gap: fromFloat(1.3), delay: fromFloat(2.2) });
  if (wave >= 12) entries.push({ type: "tank", count: Math.floor(wave / 12), gap: fromFloat(1.8), delay: fromFloat(3) });
  return entries;
}

// Fixed-point scale multipliers (all baked from authored formula).
export function enemyScale(wave) {
  const hp = 1 + (wave - 1) * 0.16 + Math.pow(wave / 12, 2) * 0.5;
  const speed = 1 + Math.min(0.5, (wave - 1) * 0.012);
  const reward = 1 + (wave - 1) * 0.03;
  return { hp: fromFloat(hp), speed: fromFloat(speed), reward: fromFloat(reward) };
}

export function totalWaves(mode, corridorCount) {
  if (mode === "endless") return 0x7fffffff;
  if (mode === "single") return 10;
  return corridorCount * 10;
}

// ---------------------------------------------------------------------------
// WAVE AFFIXES — seeded per-run modifiers for variety.
// Pure integer hash of (seedBase, wave): identical on every client, no draw
// from the sim RNG stream (so existing replays/lockstep ticks are unaffected).
// Stat multipliers are authored floats; the core converts via fromFloat once
// at spawn (deterministic).
// ---------------------------------------------------------------------------
export const AFFIXES = {
  swift:    { id: "swift",    name: "Swift",    icon: "💨", desc: "+30% speed",            speedMult: 1.3 },
  armored:  { id: "armored",  name: "Armored",  icon: "🛡️", desc: "+5 armor",              armorAdd: 5 },
  vigorous: { id: "vigorous", name: "Vigorous", icon: "🩸", desc: "+35% health",           hpMult: 1.35 },
  horde:    { id: "horde",    name: "Horde",    icon: "👥", desc: "+40% count, −25% health", countMult: 1.4, hpMult: 0.75 },
};
const AFFIX_ORDER = ["swift", "armored", "vigorous", "horde"];

export function waveAffix(seedBase, wave, bossEvery) {
  if (wave < 5 || wave % bossEvery === 0) return null;   // never on early or boss waves
  let h = ((seedBase | 0) ^ Math.imul(wave | 0, 2654435761)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
  h ^= h >>> 13;
  if (h % 3 !== 0) return null;                          // ~1 in 3 eligible waves
  return AFFIXES[AFFIX_ORDER[(h >>> 4) % AFFIX_ORDER.length]];
}

// ---------------------------------------------------------------------------
// [Skyhold expanded] WAVES WITH THE BESTIARY
// Circle's wave stays the backbone (its counts trimmed to 60%), and one or two
// "featured" mobs from the roster join it, taking about 45% of the wave's HP
// budget. Bosses bring an elite from wave 20. Treasure goblins turn up now and
// then. Like waveAffix, this is a pure integer hash of (seed, wave): no sim RNG
// draws, so it is identical on every client and the UI can preview it.
// opts: { roster, filter(r) -> bool }
// ---------------------------------------------------------------------------
function hmix(a, b) {
  let h = ((a | 0) ^ Math.imul(b | 0, 2654435761)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 3266489917) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
const CLASSIC_HP = { grunt: 60, runner: 34, swarm: 20, brute: 200, tank: 420, boss: 2400 };
export function generateWaveExpanded(seedBase, wave, corridorCount, bossEvery, opts) {
  const base = generateWave(wave, corridorCount, bossEvery);
  const roster = (opts && opts.roster) || [];
  const ok = (r) => !opts || !opts.filter || opts.filter(r);
  const isBoss = wave % bossEvery === 0;
  let budget = 0;
  for (const g of base) budget += g.count * (CLASSIC_HP[g.type] || 60);
  const out = base.map((g) => (g.type === "boss" ? g : { ...g, count: Math.max(1, Math.round(g.count * 0.6)) }));
  const pool = roster.filter((r) => r.minWave <= wave && !r.elite && !r.treasure && ok(r));
  if (pool.length) {
    const nFeat = wave >= 8 ? 2 : 1;
    const picked = [];
    for (let k = 0; k < nFeat * 4 && picked.length < nFeat; k++) {
      // bias toward mobs that unlocked recently, so new faces show up
      const h = hmix(seedBase + k * 7919, wave * 31 + k);
      const weighted = [];
      for (const r of pool) { const w = wave - r.minWave < 8 ? 3 : 1; for (let i = 0; i < w; i++) weighted.push(r); }
      const r = weighted[h % weighted.length];
      if (!picked.includes(r)) picked.push(r);
    }
    const share = (budget * 0.45) / picked.length;
    picked.forEach((r, i) => {
      const units = Math.max(1, Math.min(12, Math.round(share / (r.hp * r.pack))));
      out.push({ type: r.id, count: units * r.pack, gap: fromFloat(r.pack > 1 ? 0.25 : 0.9), delay: fromFloat(1.6 + i * 1.4) });
    });
  }
  if (isBoss && wave >= 20) {
    const elites = roster.filter((r) => r.elite && !r.treasure && r.minWave <= wave && ok(r));
    if (elites.length) out.push({ type: elites[hmix(seedBase, wave * 17) % elites.length].id, count: 1, gap: 0, delay: fromFloat(4) });
  }
  if (!isBoss && wave >= 5 && hmix(seedBase ^ 0x5eed, wave) % 9 === 0) {
    const tg = roster.find((r) => r.treasure);
    if (tg) out.push({ type: tg.id, count: 1, gap: 0, delay: fromFloat(3) });
  }
  return out;
}

// challenge waves: the challenge's own pool, rising in size over 10 waves
export function generateChallengeWave(seedBase, wave, challenge, roster) {
  const pool = roster.filter((r) => challenge.pool.includes(r.id));
  const out = [];
  const budget = 500 + wave * 260;
  const n = Math.min(pool.length, 1 + Math.floor(wave / 3));
  for (let k = 0; k < n; k++) {
    const r = pool[(hmix(seedBase + k, wave) + k) % pool.length];
    const units = Math.max(1, Math.min(14, Math.round(budget / n / (r.hp * r.pack))));
    out.push({ type: r.id, count: units * r.pack, gap: fromFloat(r.pack > 1 ? 0.22 : 0.8), delay: fromFloat(k * 1.5) });
  }
  out.push({ type: "grunt", count: 4 + wave, gap: fromFloat(0.6), delay: 0 });
  return out;
}

export default { generateWave, generateWaveExpanded, generateChallengeWave, enemyScale, totalWaves, waveAffix, AFFIXES };

// ---------------------------------------------------------------------------
// [Skyhold rules] WAVES — Circle's backbone (trimmed), one or two featured
// creeps from the bestiary, a Warlord every 5th wave and on the last wave,
// counts that grow with the corridor count, and creeps spaced out enough to
// read on a phone. Pure integer hash of (seed, wave) like everything above, so
// the UI can preview it exactly.
// opts: { roster, filter(r), final (bool), tune: { countPerCorridor, minGap, bossEvery, bossHpMinor } }
// ---------------------------------------------------------------------------
export function generateWaveX(seedBase, wave, corridorCount, opts) {
  const T = opts.tune, roster = opts.roster || [];
  const ok = (r) => !opts.filter || opts.filter(r);
  const isBoss = wave % T.bossEvery === 0 || !!opts.final;
  const cm = 1 + T.countPerCorridor * Math.max(0, corridorCount - 1);
  const gapOf = (g, pack) => fromFloat(Math.max(g, pack ? T.minGap * 0.6 : T.minGap));
  const out = [];
  let budget = 0;
  if (isBoss) {
    const major = wave % 10 === 0 || !!opts.final;
    out.push({ type: "boss", count: 1, gap: 0, delay: 0, hpMult: fromFloat(major ? T.bossHpMajor : T.bossHpMinor) });
    // escorts: grunts and sprites early, golems from wave 10
    const esc = Math.max(1, Math.round((1 + wave / 5) * cm));
    const heavy = wave >= 10 ? "brute" : "grunt";
    out.push({ type: heavy, count: esc, gap: gapOf(1.1), delay: fromFloat(2.5) });
    out.push({ type: "runner", count: esc * 2, gap: gapOf(0.5), delay: fromFloat(1.2) });
    budget = esc * (CLASSIC_HP[heavy] || 60) + esc * 2 * 34;
  } else {
    const base = 6 + Math.floor(wave * 0.7);
    const add = (type, n, g, d) => { const c = Math.max(1, Math.round(n * T.waveCount * cm)); out.push({ type, count: c, gap: gapOf(g, type === "swarm"), delay: fromFloat(d) }); budget += c * (CLASSIC_HP[type] || 60); };
    add("grunt", base * 0.6, 0.75, 0);
    add("runner", 3 + wave * 0.3, 0.5, 0.8);
    if (wave >= 4) add("swarm", 6 + wave * 0.6, 0.3, 2.0);
    if (wave >= 6) add("brute", 1 + Math.floor(wave / 6), 1.3, 3.0);
    if (wave >= 12) add("tank", Math.floor(wave / 12), 1.8, 4.0);
  }
  const share = isBoss ? 0.3 : wave < 4 ? 0 : wave < 7 ? 0.3 : 0.45;
  const pool = roster.filter((r) => r.minWave <= wave && !r.elite && !r.treasure && ok(r));
  if (pool.length && share > 0) {
    const nFeat = wave >= 8 ? 2 : 1;
    const picked = [];
    for (let k = 0; k < nFeat * 4 && picked.length < nFeat; k++) {
      const h = hmix(seedBase + k * 7919, wave * 31 + k);
      const weighted = [];
      for (const r of pool) { const w = wave - r.minWave < 8 ? 3 : 1; for (let i = 0; i < w; i++) weighted.push(r); }
      const r = weighted[h % weighted.length];
      if (!picked.includes(r)) picked.push(r);
    }
    const part = (budget * share) / picked.length;
    const cap = Math.round((5 + wave * 0.5) * cm); // creeps per featured group, packs included
    picked.forEach((r, i) => {
      let units = Math.max(1, Math.round(part / (r.hp * r.pack)));
      units = Math.max(1, Math.min(units, Math.floor(cap / r.pack) || 1));
      out.push({ type: r.id, count: units * r.pack, gap: gapOf(r.pack > 1 ? 0.3 : 0.9, r.pack > 1), delay: fromFloat(2.2 + i * 1.8) });
    });
  }
  if (isBoss && wave >= 20) {
    const elites = roster.filter((r) => r.elite && !r.treasure && r.minWave <= wave && ok(r));
    if (elites.length) out.push({ type: elites[hmix(seedBase, wave * 17) % elites.length].id, count: 1, gap: 0, delay: fromFloat(5) });
  }
  if (!isBoss && wave >= 5 && hmix(seedBase ^ 0x5eed, wave) % 7 === 0) {
    const tg = roster.find((r) => r.treasure);
    if (tg) out.push({ type: tg.id, count: 1, gap: 0, delay: fromFloat(3) });
  }
  return out;
}

// [Skyhold rules] challenge waves: the challenge's own pool, a fair start and a steady climb.
// tune: { minGap }
// how much a creep asks of a fresh maze: invisible > flying > the rest, then by its usual first wave
function trick(r) { return (r.stealth ? 20 : 0) + (r.fly ? 10 : 0) + r.minWave; }
export function generateChallengeWaveX(seedBase, wave, challenge, roster, tune) {
  // the pool is introduced gently: the easiest two first, one more every other wave,
  // and fast creeps cost more of the budget (a pack of hounds at wave 2 is a wall, not a wave)
  const pool = roster.filter((r) => challenge.pool.includes(r.id))
    .slice().sort((a, b) => (trick(a) - trick(b)) || (a.hp * a.speed - b.hp * b.speed) || (a.id < b.id ? -1 : 1));
  const out = [];
  const C = challenge.waves || {};
  const budget = (C.base || 320) + wave * (C.per || 190);
  const avail = Math.min(pool.length, 2 + Math.floor((wave - 1) / 2));
  const n = Math.min(avail, 1 + Math.floor(wave / 3));
  const cap = Math.round((C.cap0 || 5) + wave * (C.capPer || 1.1));
  for (let k = 0; k < n; k++) {
    // the newest arrival leads the wave it is introduced in, the rest are drawn from what is known
    const r = k === 0 && wave >= 3 && wave % 2 === 1 ? pool[avail - 1] : pool[(hmix(seedBase + k, wave) + k) % avail];
    const cost = r.hp * (r.speed > 1 ? r.speed * r.speed : 1);
    let units = Math.max(1, Math.round(budget / n / (cost * r.pack)));
    units = Math.max(1, Math.min(units, Math.floor(cap / r.pack) || 1));
    out.push({ type: r.id, count: units * r.pack, gap: fromFloat(Math.max(r.pack > 1 ? 0.35 : 0.9, tune.minGap * (r.pack > 1 ? 0.7 : 1.1))), delay: fromFloat(k * 3.0) });
  }
  out.push({ type: "grunt", count: 2 + Math.floor(wave / 2), gap: fromFloat(Math.max(0.6, tune.minGap)), delay: 0 });
  return out;
}
