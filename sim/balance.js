/* =============================================================================
 * Circle Tower Wars — sim/balance.js
 * Converts the authored, human-readable DB (database.js) into a FIXED-POINT
 * balancing table the sim-core consumes (§3: the core reads balancing only as
 * data, never hardcoded). This conversion runs ONCE at load on every client
 * from the identical authored numbers, so the resulting fixed values are
 * identical everywhere — determinism is preserved.
 *
 * The sim-core never imports database.js directly; the shell builds `bal` with
 * buildBalance(DB) and hands it to the core. This keeps the core engine-free
 * and unit-testable with a fixture in Node.
 * ===========================================================================*/

import { fromFloat, fromInt } from "./fx.js";

const F = fromFloat;

export function buildBalance(DB) {
  const C = DB.CONFIG;
  const bal = {
    grid: { cols: C.grid.cols, rows: C.grid.rows },
    portalCols: C.portalCols.slice(),
    towerSize: C.towerSize,
    startLives: C.startLives,
    startGold: C.startGold,
    startEssence: C.startEssence,
    enemyBaseSpeed: F(C.enemyBaseSpeed),     // tiles/sec, fixed
    sellRefund: F(C.sellRefund),
    maxLevel: C.maxLevel,
    maxExpert: C.maxExpert,
    expertThresholds: C.expertThresholds.slice(),
    expertDamageBonus: C.expertDamageBonus.map(F),
    bossEvery: C.bossEvery,
    obstacleDensity: F(C.obstacleDensity),
    loopLifeLoss: C.loopLifeLoss,
    // Early-call bonus (integers; tolerate older DBs lacking it).
    earlyCall: {
      base: (C.earlyCallBonus && C.earlyCallBonus.base) != null ? C.earlyCallBonus.base : 20,
      perWave: (C.earlyCallBonus && C.earlyCallBonus.perWave) != null ? C.earlyCallBonus.perWave : 6,
    },

    scaling: {
      damagePerLevel: F(DB.SCALING.damagePerLevel),
      fireRatePerLevel: F(DB.SCALING.fireRatePerLevel),
      rangePerLevel: F(DB.SCALING.rangePerLevel),
      upgradeCostBase: F(DB.SCALING.upgradeCostBase),
      costGrowth: F(DB.SCALING.costGrowth),
    },

    elementOrder: DB.ELEMENT_ORDER.slice(),
    elements: {},
    statuses: {},
    synergies: {},
    towers: {},
    enemies: {},
    // Competitive send-economy (§8); tolerate older DBs lacking it.
    competitive: normalizeCompetitive(DB.COMPETITIVE),
    // Sendable-mob catalog (flat per-level costs; competitive + versus).
    sends: normalizeSends(DB),
  };

  for (const id of DB.ELEMENT_ORDER) {
    const e = DB.ELEMENTS[id];
    bal.elements[id] = { id, currency: e.currency, starter: !!e.starter };
  }

  for (const k in DB.STATUSES) {
    const s = DB.STATUSES[k];
    bal.statuses[k] = {
      id: s.id, kind: s.kind, element: s.element || null,
      value: F(s.value || 0), duration: F(s.duration || 0),
      adaptive: !!s.adaptive,
    };
  }

  for (const k in DB.SYNERGIES) {
    const s = DB.SYNERGIES[k];
    bal.synergies[k] = {
      name: s.name,
      burst: s.burst != null ? F(s.burst) : 0,
      dotMult: s.dotMult != null ? F(s.dotMult) : 0,
      curseBoost: s.curseBoost != null ? F(s.curseBoost) : 0,
      execute: s.execute != null ? F(s.execute) : 0,
      spread: !!s.spread,
      anchor: !!s.anchor,
    };
  }

  for (const t of DB.TOWERS) {
    bal.towers[t.id] = convertTower(t);
  }
  // [Skyhold rules] the same towers with Skyhold's damage numbers (content/rules.js TOWER_X)
  if (DB.RULES) { bal.towersX = {}; for (const t of DB.TOWERS) bal.towersX[t.id] = convertTower(DB.RULES.towerX(t)); }
  function convertTower(t) {
    return {
      id: t.id, element: t.element, archetype: t.archetype,
      slot: t.slot != null ? t.slot : 0,
      cost: t.cost,
      damage: F(t.damage || 0),
      range: F(t.range || 0),
      fireRate: F(t.fireRate || 0),
      splashRadius: F(t.splashRadius || 0),
      chainCount: t.chainCount || 0,
      chainRange: F(t.chainRange || 0),
      pierce: t.pierce || 0,
      projectileSpeed: F(t.projectileSpeed || 12),
      status: t.status || null,
      statusChance: F(t.statusChance || 0),
      statusDuration: F(t.statusDuration || 0),
      auraStat: t.auraStat || null,
      auraValue: F(t.auraValue || 0),
      mutations: (t.mutations || []).map(m => ({ id: m.id, mods: convertMods(m.mods) })),
    };
  }

  for (const k in DB.ENEMIES) {
    const e = DB.ENEMIES[k];
    bal.enemies[k] = {
      id: e.id, hp: F(e.hp), speed: F(e.speed), armor: F(e.armor || 0),
      reward: e.reward, radius: F(e.radius), boss: !!e.boss, end: !!e.end,
    };
    // [Skyhold expanded] bestiary data (content/mobs.js); ignored by the Classic ruleset
    if (e.skyhold) {
      const x = e.skyhold;
      bal.enemies[k].x = {
        family: x.family, armorClass: x.armorClass, pack: x.pack | 0, tier: x.tier | 0, minWave: x.minWave | 0,
        element: x.element, mech: !!x.mech, minion: !!x.minion, elite: !!x.elite, noSend: !!x.noSend,
        t: convertTraits(x.traits || {}),
      };
    }
  }
  // [Skyhold expanded] the roster the expanded wave generator draws from (stable DB order)
  bal.roster = [];
  for (const k in DB.ENEMIES) {
    const x = bal.enemies[k].x;
    if (!x || x.minion || x.family === "challenge") continue;
    bal.roster.push({ id: k, minWave: x.minWave, hp: DB.ENEMIES[k].hp, speed: DB.ENEMIES[k].speed || 1, pack: x.pack || 1, elite: x.elite, treasure: !!x.t.treasure,
      fly: !!x.t.fly, stealth: !!(x.t.invisible || x.t.cloakCycle || x.t.cloakAura), disrupt: isDisruptorTraits(x.t) });
  }
  if (DB.SENDS_EXPANDED) bal.sendsX = normalizeSendCatalog(DB, DB.SENDS_EXPANDED);
  if (DB.SEND_TIERS) {
    bal.sendTiers = {};
    for (const t in DB.SEND_TIERS) { const T = DB.SEND_TIERS[t]; bal.sendTiers[t] = { unlockTicks: T.unlockAt * 30, stock: T.stock, rechargeTicks: T.recharge * 30 }; }
  }
  if (DB.CHALLENGES) bal.challenges = Object.fromEntries(DB.CHALLENGES.map((c) => [c.id, c]));
  if (DB.RULES) bal.rx = buildSkyholdRules(DB, bal);

  return bal;
}

// [Skyhold rules] damage types, armour classes, synergies, run length and tuning, baked to fixed point
function buildSkyholdRules(DB, bal) {
  const R = DB.RULES, T = R.TUNE;
  const rx = {
    armorK: F(R.ARMOR_K),
    enemySpeed: F(T.enemySpeed), speedFloor: F(T.speedFloor), waveSpeedGrowth: F(T.waveSpeedGrowth), waveSpeedMax: F(T.waveSpeedMax),
    towerDamage: F(T.towerDamage),
    scaling: { damagePerLevel: F(T.scaling.damagePerLevel), fireRatePerLevel: F(T.scaling.fireRatePerLevel), rangePerLevel: F(T.scaling.rangePerLevel), upgradeCostBase: F(T.scaling.upgradeCostBase), costGrowth: F(T.scaling.costGrowth) },
    hpPerCorridor: T.hpPerCorridor, hpStretchFrom: T.hpStretchFrom || 0, hpByCorridors: T.hpByCorridors || {}, loopLeave: !!T.loopLeave, loopSpeed: F(T.loopSpeed || 0), loopCreepHp: Object.fromEntries(Object.entries(T.loopCreepHp || {}).map(([k, v]) => [k, F(v)])), countPerCorridor: T.countPerCorridor, waveHp: T.waveHp, waveGold: T.waveGold,
    waveClearBonus: T.waveClearBonus.slice(), bossLifeLoss: T.bossLifeLoss, endLifeLoss: T.endLifeLoss,
    bossHpMinor: T.bossHpMinor, endBoss: { hpMult: T.endBoss.hpMult, armor: F(T.endBoss.armor), perCorridor: T.endBoss.perCorridor },
    chBoss: Object.fromEntries(Object.entries(T.challengeBoss || {}).map(([k, v]) => [k, F(v)])),
    builderDetect: F(T.builderDetect), revealLinger: F(T.revealLinger || 0), startGold: T.startGold, startPerCorridor: T.startPerCorridor, minGap: F(T.minGap),
    bossEvery: R.BOSS_EVERY_X, synergyCd: F(R.SYNERGY_COOLDOWN),
    difficulty: {}, towerType: {}, armorTable: {}, synergies: {}, send: R.SEND_RULES, waves: Object.assign({}, R.WAVES_BY_CORRIDORS), vs: Object.assign({}, T.vs),
    waveTune: { countPerCorridor: T.countPerCorridor, minGap: T.minGap, bossEvery: R.BOSS_EVERY_X, bossHpMinor: T.bossHpMinor, bossHpMajor: T.bossHpMajor, waveCount: T.waveCount },
  };
  for (const k in R.SOLO_DIFFICULTY) { const d = R.SOLO_DIFFICULTY[k]; rx.difficulty[k] = { hp: F(d.hp), speed: F(d.speed), endHp: F(d.endHp) }; }
  const TYPES = ["physical", "blast", "magic", "chaos"];
  for (const cls in R.ARMOR_TABLE) { rx.armorTable[cls] = {}; for (const t of TYPES) rx.armorTable[cls][t] = F(R.ARMOR_TABLE[cls][t]); }
  for (const t of DB.TOWERS) {
    rx.towerType[t.id] = R.towerDamageType(t);
    // mutations that change the archetype change the damage type with it
    for (const m of t.mutations || []) if (m.mods && m.mods.archetype) rx.towerType[t.id + ":" + m.id] = R.towerDamageType(t, m.mods.archetype);
  }
  for (const k in bal.enemies) {
    const e = bal.enemies[k];
    e.cls = (e.x && e.x.armorClass) || R.CLASSIC_ARMOR_CLASS[k] || "medium";
    if (e.boss && e.x && e.x.family === "challenge" && e.end) e.cls = "boss";
  }
  for (const s of R.SYNERGIES_X) {
    const f = s.fx, o = { id: s.id, name: s.name, a: s.a, b: s.b };
    if (f.burst) o.burst = F(f.burst);
    if (f.blast) { o.blast = F(f.blast); o.r = F(f.r || 2); }
    if (f.chain) { o.chain = f.chain | 0; o.mult = F(f.mult || 1); }
    if (f.stun) o.stun = F(f.stun);
    if (f.slow) { o.slow = F(f.slow); o.dur = F(f.dur || 3); }
    if (f.expose) { o.expose = F(f.expose); o.dur = F(f.dur || 5); }
    if (f.shred) { o.shred = F(f.shred); o.dur = F(f.dur || 5); }
    if (f.dot) { o.dot = F(f.dot); o.dur = F(f.dur || 4); }
    if (f.spread) o.spread = f.spread | 0;
    if (f.execute) o.execute = F(f.execute);
    if (f.gold) o.gold = F(f.gold);
    rx.synergies[s.a + "|" + s.b] = o; rx.synergies[s.b + "|" + s.a] = o;
  }
  return rx;
}

function convertMods(mods) {
  const out = {};
  for (const k in mods) {
    const v = mods[k];
    if (typeof v === "number") {
      // ints stay ints for count-like mods; fractions go fixed
      out[k] = (k === "chainCount" || k === "pierce") ? (v | 0) : fromFloat(v);
    } else {
      out[k] = v; // strings (e.g. archetype, addStatus, auraStat)
    }
  }
  return out;
}

function normalizeCompetitive(C) {
  C = C || {};
  return {
    incomeRate: C.incomeRate != null ? C.incomeRate : 0.06,                        // §8.1 income per gold sent
    incomeIntervalTicks: C.incomeIntervalTicks != null ? C.incomeIntervalTicks : 150, // 5s @30hz
    sentBountyMult: fromFloat(C.sentBountyMult != null ? C.sentBountyMult : 1.6),  // §8.2 FIXED higher bounty (not rising)
    maxActiveSentPerTarget: C.maxActiveSentPerTarget != null ? C.maxActiveSentPerTarget : 40, // §8.3 cap
    catchupPerLifeBehind: C.catchupPerLifeBehind != null ? C.catchupPerLifeBehind : 1, // §8.3 catch-up income
  };
}

// [Skyhold expanded] traits: every number becomes fixed-point except counts
const INT_KEYS = new Set(["n", "max"]);
function convertTraits(t) {
  const conv = (k, v) => {
    if (typeof v === "number") return INT_KEYS.has(k) ? (v | 0) : fromFloat(v);
    if (Array.isArray(v)) return v.map((x) => (typeof x === "number" ? fromFloat(x) : x));
    if (v && typeof v === "object") { const o = {}; for (const kk in v) o[kk] = conv(kk, v[kk]); return o; }
    return v;
  };
  const out = {};
  for (const k in t) out[k] = typeof t[k] === "boolean" ? t[k] : conv(k, t[k]);
  return out;
}
function isDisruptorTraits(t) { return !!(t.jamPass || t.corrodeAura || t.chillAura || t.chillFly || t.confuseAura || t.boulder || t.rootTower || t.curseTower || t.deathTowerSlow || t.deathStun || t.shredObstacle); }
function normalizeSendCatalog(DB, S) {
  const MAX = DB.SEND_MAX_LEVEL || 5;
  const out = {};
  for (const type in S) {
    const s = S[type];
    const cost = [], upgradeCost = [], hpMult = [], rewardMult = [];
    for (let l = 1; l <= MAX; l++) {
      cost.push(Math.round(s.baseCost * Math.pow(s.costGrowth, l - 1)));
      hpMult.push(fromFloat(Math.pow(s.hpGrowth, l - 1)));
      rewardMult.push(fromFloat(1 + 0.5 * (l - 1)));
      if (l < MAX) upgradeCost.push(Math.round(s.baseCost * 4 * l));
    }
    out[type] = { count: s.count || 1, cost, upgradeCost, hpMult, rewardMult, maxLevel: MAX, tier: s.tier || 1 };
  }
  return out;
}

// Bake the authored send catalog into per-level integer/fixed tables.
// cost[l] / upgradeCost[l] are ints; hpMult[l] / rewardMult[l] are fixed.
function normalizeSends(DB) {
  const S = DB.SENDS || {};
  const MAX = DB.SEND_MAX_LEVEL || 5;
  const out = {};
  for (const type in S) {
    const cost = [], upgradeCost = [], hpMult = [], rewardMult = [];
    for (let l = 1; l <= MAX; l++) {
      cost.push(DB.sendCost(type, l));
      hpMult.push(fromFloat(DB.sendHpMult(type, l)));
      rewardMult.push(fromFloat(1 + 0.5 * (l - 1)));   // defender bounty grows with level
      if (l < MAX) upgradeCost.push(DB.sendUpgradeCost(type, l));
    }
    out[type] = { count: S[type].count || 1, cost, upgradeCost, hpMult, rewardMult, maxLevel: MAX };
  }
  return out;
}

export default { buildBalance };
