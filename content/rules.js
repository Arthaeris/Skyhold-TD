/* =============================================================================
 * Skyhold TD — content/rules.js
 * THE SKYHOLD RULES as data: damage types and armour, element synergies, solo
 * difficulty, run length, End Boss and the knobs the balance pass tuned.
 *
 * Read by sim/balance.js (which bakes the numbers to fixed point), by the UI
 * (tags, codex, setup) and by the NPC brain. The sim never imports this file
 * directly, so it stays engine-free like the rest of the core.
 *
 * Only the Skyhold ruleset reads these. Circle's Classic ruleset (kept for old
 * replays and the parity test) never does.
 * ===========================================================================*/

// ---------------------------------------------------------------------------
// DAMAGE TYPES × ARMOUR CLASSES
// Armour is a percentage: damage × 25 / (25 + armour). 10 armour ≈ −29%,
// 20 armour ≈ −44%. Every hit keeps doing real damage, so cheap fast towers
// stay useful against bosses. On top, each tower deals one damage type and
// each creep has one armour class; the class decides a multiplier.
// ---------------------------------------------------------------------------
export const ARMOR_K = 25;

export const DAMAGE_TYPES = {
  physical: { id: "physical", name: "Physical", icon: "🗡", color: "#e8d2a6", desc: "Arrows, bolts, bullets and blades." },
  blast: { id: "blast", name: "Blast", icon: "💥", color: "#ffb15c", desc: "Explosions and area damage." },
  magic: { id: "magic", name: "Magic", icon: "✦", color: "#b9a2ff", desc: "Beams, lightning, auras and damage over time." },
  chaos: { id: "chaos", name: "Chaos", icon: "🌀", color: "#ff7ab8", desc: "Ignores armour classes." },
};
export const ARCHE_DAMAGE = { single: "physical", melee: "physical", splash: "blast", beam: "magic", chain: "magic", support: "magic", random: "chaos" };
// towers whose flavour isn't their archetype's default
export const TOWER_DAMAGE_OVERRIDE = { darkness_0: "magic", darkness_1: "magic", darkness_3: "magic" };

// multiplier a damage type deals to an armour class
export const ARMOR_TABLE = {
  unarmored: { physical: 1.1, blast: 1.1, magic: 1.0, chaos: 1 },
  light: { physical: 1.25, blast: 0.9, magic: 1.0, chaos: 1 },
  medium: { physical: 1.0, blast: 1.25, magic: 0.9, chaos: 1 },
  heavy: { physical: 0.85, blast: 1.0, magic: 1.25, chaos: 1 },
  fortified: { physical: 0.7, blast: 1.35, magic: 0.9, chaos: 1 },
  ethereal: { physical: 0.5, blast: 0.75, magic: 1.5, chaos: 1 },
  boss: { physical: 1.0, blast: 0.9, magic: 1.0, chaos: 1 },
};
// Circle's five creeps (and its bosses) get classes too
export const CLASSIC_ARMOR_CLASS = { grunt: "medium", runner: "light", swarm: "light", brute: "heavy", tank: "fortified", boss: "heavy", endboss: "boss" };

export function towerDamageType(def, archetype) {
  return TOWER_DAMAGE_OVERRIDE[def.id] || ARCHE_DAMAGE[archetype || def.archetype] || "physical";
}
// short, readable effect of an armour class ("+25% Physical · −10% Blast")
export function armorClassText(cls) {
  const row = ARMOR_TABLE[cls]; if (!row) return "";
  const parts = [];
  for (const t of ["physical", "blast", "magic"]) {
    const m = row[t]; if (Math.abs(m - 1) < 0.01) continue;
    parts.push((m > 1 ? "+" : "−") + Math.round(Math.abs(m - 1) * 100) + "% " + DAMAGE_TYPES[t].name);
  }
  return parts.length ? "Takes " + parts.join(" · ") : "No weakness or resistance";
}
export function armorReductionPct(armor) { return Math.round((1 - ARMOR_K / (ARMOR_K + Math.max(0, armor))) * 100); }

// ---------------------------------------------------------------------------
// TOWER TUNING — Circle's stats were balanced around flat armour, which ate
// small hits (beams lost 85% against a boss). With percentage armour, every
// tower's damage is re-set so its value per gold lands in one band: pure
// damage towers ≈ 0.31, towers that also slow/stun/amplify a little lower.
// Only `damage` changes; everything else is Circle's.
// ---------------------------------------------------------------------------
export const TOWER_X = {
  fire_0: { damage: 20 }, fire_2: { damage: 41 }, fire_4: { damage: 79 },
  ice_0: { damage: 16 }, ice_1: { damage: 15 }, ice_2: { damage: 38 }, ice_4: { damage: 82 },
  nature_0: { damage: 19 }, nature_1: { damage: 20 }, nature_2: { damage: 40 }, nature_3: { damage: 56 },
  storm_2: { damage: 29 },
  light_0: { damage: 2.9 }, light_3: { damage: 35 }, light_4: { damage: 11.2 },
  darkness_0: { damage: 22 }, darkness_2: { damage: 34 }, darkness_3: { damage: 62 }, darkness_4: { damage: 85 },
  darkness_1: { damage: 24, archetype: "chain", chainCount: 2, chainRange: 2.6 }, // the curse jumps on to two more
  mech_1: { damage: 17, range: 2.2 }, mech_4: { damage: 41 },
  abnormal_2: { damage: 35 }, abnormal_4: { damage: 80 },
};
/** A tower's authored stats under the Skyhold rules. */
export function towerX(def) { const o = TOWER_X[def.id]; return o ? Object.assign({}, def, o) : def; }

// ---------------------------------------------------------------------------
// ELEMENT SYNERGIES — one reaction per element pair, always A + B → C.
// A creep carrying a status of element A that is ATTACKED by a tower of
// element B (or the other way round) reacts: the A status is used up and the
// effect fires. Auras set statuses up; attacks trigger reactions. A creep can
// react at most once per second.
// "power" = the triggering tower's damage per second (with a wave-based floor).
// ---------------------------------------------------------------------------
export const SYNERGY_COOLDOWN = 1.0;
export const SYNERGIES_X = [
  { a: "fire", b: "ice", id: "thermal_shock", name: "Thermal Shock", icon: "🌡", color: "#ffd0a0", fx: { burst: 3.0 }, text: "Bonus damage: 3× the tower's power" },
  { a: "fire", b: "nature", id: "wildfire", name: "Wildfire", icon: "🔥", color: "#ff9d3d", fx: { spread: 4, burst: 1.0 }, text: "Spreads both statuses to 4 neighbours, plus 1× power" },
  { a: "fire", b: "storm", id: "firestorm", name: "Firestorm", icon: "🌪", color: "#ffb15c", fx: { blast: 1.6, r: 2.0 }, text: "Explodes: 1.6× power to everything nearby" },
  { a: "fire", b: "light", id: "solar_flare", name: "Solar Flare", icon: "☀", color: "#fff2a8", fx: { stun: 1.0, burst: 1.0 }, text: "Blinds it for 1s, plus 1× power" },
  { a: "fire", b: "darkness", id: "hellfire", name: "Hellfire", icon: "😈", color: "#ff5f5f", fx: { dot: 3.5, dur: 4 }, text: "Burns for 3.5× power over 4s" },
  { a: "fire", b: "mech", id: "meltdown", name: "Meltdown", icon: "🫠", color: "#ffb47a", fx: { shred: 0.6, dur: 6 }, text: "Melts 60% of its armour for 6s" },
  { a: "fire", b: "abnormal", id: "supernova", name: "Supernova", icon: "💥", color: "#ff8fc0", fx: { blast: 1.3, r: 2.6 }, text: "Big explosion: 1.3× power in a wide area" },
  { a: "ice", b: "nature", id: "frostbite", name: "Frostbite", icon: "🥶", color: "#bff0ff", fx: { slow: 0.45, dur: 4 }, text: "Slows it to 45% speed for 4s" },
  { a: "ice", b: "storm", id: "superconduct", name: "Superconduct", icon: "⚡", color: "#9fd8ff", fx: { chain: 4, mult: 1.3 }, text: "Arcs to 4 neighbours for 1.3× power each" },
  { a: "ice", b: "light", id: "crystallize", name: "Crystallize", icon: "💎", color: "#d8f4ff", fx: { stun: 1.5 }, text: "Encases it in crystal for 1.5s" },
  { a: "ice", b: "darkness", id: "shatter", name: "Shatter", icon: "🧊", color: "#a9c8ff", fx: { expose: 1.4, dur: 5 }, text: "It takes +40% damage for 5s" },
  { a: "ice", b: "mech", id: "cold_snap", name: "Cold Snap", icon: "❄", color: "#cfe8ff", fx: { burst: 2.5 }, text: "Bonus damage: 2.5× power" },
  { a: "ice", b: "abnormal", id: "stasis", name: "Stasis", icon: "⏳", color: "#e2c8ff", fx: { stun: 2.0 }, text: "Freezes it in time for 2s" },
  { a: "nature", b: "storm", id: "neurotoxin", name: "Neurotoxin", icon: "🧪", color: "#a6ff9b", fx: { dot: 4.0, dur: 4 }, text: "Toxin deals 4× power over 4s" },
  { a: "nature", b: "light", id: "golden_bloom", name: "Golden Bloom", icon: "🌼", color: "#ffe066", fx: { gold: 1, burst: 1.0 }, text: "Grows a bounty: bonus gold, plus 1× power" },
  { a: "nature", b: "darkness", id: "rot", name: "Rot", icon: "🦠", color: "#9fbf5f", fx: { expose: 1.3, dur: 6, spread: 2 }, text: "It and 2 neighbours take +30% damage for 6s" },
  { a: "nature", b: "mech", id: "corrosion", name: "Corrosion", icon: "🧫", color: "#c6d97a", fx: { shred: 0.5, dur: 6 }, text: "Eats 50% of its armour for 6s" },
  { a: "nature", b: "abnormal", id: "mutagen", name: "Mutagen", icon: "🧬", color: "#7dffb0", fx: { execute: 0.2 }, text: "Kills it outright below 20% HP" },
  { a: "storm", b: "light", id: "smite", name: "Smite", icon: "🌩", color: "#fff6c2", fx: { chain: 5, mult: 1.0 }, text: "Holy lightning hits 5 neighbours for 1× power" },
  { a: "storm", b: "darkness", id: "dark_conduit", name: "Dark Conduit", icon: "🌑", color: "#8b6cff", fx: { burst: 2.8 }, text: "Bonus damage: 2.8× power" },
  { a: "storm", b: "mech", id: "overload", name: "Overload", icon: "🔋", color: "#cdd9e5", fx: { blast: 2.0, r: 1.7 }, text: "Short-circuits: 2× power to everything close" },
  { a: "storm", b: "abnormal", id: "feedback", name: "Feedback", icon: "📡", color: "#ff9ad0", fx: { chain: 3, mult: 1.6 }, text: "Arcs to 3 neighbours for 1.6× power each" },
  { a: "light", b: "darkness", id: "eclipse", name: "Eclipse", icon: "🌗", color: "#c8b6ff", fx: { execute: 0.22 }, text: "Kills it outright below 22% HP" },
  { a: "light", b: "mech", id: "lock_on", name: "Lock-On", icon: "🎯", color: "#e6f0ff", fx: { expose: 1.35, dur: 5 }, text: "Marks it: +35% damage taken for 5s" },
  { a: "light", b: "abnormal", id: "prismatic_rift", name: "Prismatic Rift", icon: "🔮", color: "#ffc2dd", fx: { blast: 1.5, r: 2.2 }, text: "Tears space: 1.5× power to everything nearby" },
  { a: "darkness", b: "mech", id: "demolition", name: "Demolition", icon: "💣", color: "#b8bcc8", fx: { shred: 0.5, dur: 6, burst: 1.0 }, text: "Cracks 50% of its armour for 6s, plus 1× power" },
  { a: "darkness", b: "abnormal", id: "void_grasp", name: "Void Grasp", icon: "🕳", color: "#a892ff", fx: { slow: 0.4, dur: 3 }, text: "The void holds it: 40% speed for 3s" },
  { a: "mech", b: "abnormal", id: "jackpot", name: "Jackpot", icon: "🎰", color: "#ffd23d", fx: { gold: 1.5, burst: 1.0 }, text: "Pays a bounty: bonus gold, plus 1× power" },
];
export function synergyFor(a, b) {
  for (const s of SYNERGIES_X) if ((s.a === a && s.b === b) || (s.a === b && s.b === a)) return s;
  return null;
}

// ---------------------------------------------------------------------------
// SOLO DIFFICULTY — enemy scaling only. Wins count for Mastery on every level.
// ---------------------------------------------------------------------------
export const SOLO_DIFFICULTY = {
  chill: { id: "chill", name: "Chill", hp: 0.62, speed: 0.92, endHp: 0.7, desc: "Relaxed: enemies are much tougher to lose to. Great for learning and unwinding." },
  normal: { id: "normal", name: "Normal", hp: 1.0, speed: 1.0, endHp: 1.0, desc: "The intended challenge. Plan your maze and mix your elements." },
  hard: { id: "hard", name: "Hard", hp: 1.32, speed: 1.05, endHp: 1.2, desc: "Tougher, faster creeps. Every leak hurts." },
  brutal: { id: "brutal", name: "Brutal", hp: 1.7, speed: 1.1, endHp: 1.4, desc: "For veterans: enemies hit like a wall. Synergies are mandatory." },
};

// ---------------------------------------------------------------------------
// RUN LENGTH — waves before the End Boss, per corridor count
// ---------------------------------------------------------------------------
export const WAVES_BY_CORRIDORS = { 1: 10, 3: 20, 4: 20, 5: 22, 6: 22, 7: 25, 8: 25 };
export function wavesFor(mode, corridors) {
  if (mode === "endless") return Infinity;
  if (mode === "single") return 10;
  return WAVES_BY_CORRIDORS[corridors] || 20;
}
// bosses every 5th wave, and the final wave is always one
export const BOSS_EVERY_X = 5;
// measured by the balance harness (seconds per wave at 1×, by corridor count)
export const SEC_PER_WAVE = { 1: 48, 3: 72, 4: 74, 5: 85, 6: 90, 7: 100, 8: 105 }; // wave + a human-paced build break, from the harness medians
export function estimateRunMinutes(mode, corridors) {
  const w = mode === "single" ? 10 : wavesFor(mode, corridors);
  if (!Number.isFinite(w)) return null;
  const s = (SEC_PER_WAVE[mode === "single" ? 1 : corridors] || 66) * w + 25; // + build time before wave 1
  return s / 60;
}

// ---------------------------------------------------------------------------
// TUNING KNOBS (the balance harness in tools/balance-sim.mjs sets these)
// ---------------------------------------------------------------------------
export const TUNE = {
  enemySpeed: 1.95,          // tiles/s for a speed-1 creep (Circle: 1.55)
  speedFloor: 0.45,          // creep speed = floor + (1 - floor) × its authored speed
  waveSpeedGrowth: 0.006,    // +0.6% creep speed per wave …
  waveSpeedMax: 0.25,        // … up to +25%
  towerDamage: 1.4,          // global tower damage multiplier
  scaling: { damagePerLevel: 0.2, fireRatePerLevel: 0.06, rangePerLevel: 0.3, upgradeCostBase: 0.6, costGrowth: 1.2 },
  hpPerCorridor: -0.02,      // creep HP per corridor beyond the first (big loops are hard enough to juggle)
  // A ring is one long path: a creep only costs a life once it has passed every corridor. So ordinary creeps
  // in a ring of n corridors carry this much more health (bosses already circle), and they hurry round a
  // little faster per extra corridor so a wave still fits in about a minute.
  loopCreepHp: { 3: 3.2, 4: 4.0, 5: 5.4, 6: 6.8, 7: 7.6, 8: 8.4 },
  loopSpeed: 0.18,
  countPerCorridor: 0.45,    // extra creeps per wave per corridor beyond the first
  hpStretchFrom: 20,         // runs longer than this spread the HP curve over their length
  waveHp: { lin: 0.15, quad: 0.25 }, // hp scale = 1 + (w-1)·lin + (w/12)²·quad
  waveGold: 1.0,             // kill-reward multiplier
  waveClearBonus: [40, 10],  // base, per wave
  bossLifeLoss: 2,           // lives a boss costs when it completes a loop
  endLifeLoss: 4,            // … and the End Boss
  bossHpMinor: 0.18,         // Warlord HP on the 5th waves (5, 15, 25…)
  bossHpMajor: 0.45,         // … and on every 10th / the final wave
  waveCount: 0.9,            // Circle's creep counts × this (before corridor scaling)
  endBoss: { hpMult: 1.8, armor: 14, perCorridor: 0.4 }, // × the final wave's full Warlord HP
  // challenge bosses: × a wave-10 Warlord's HP (they bring their own tricks, so less raw HP)
  challengeBoss: { rat_king: 0.8, mirewyrm: 0.55, clockwork_colossus: 0.6, eclipse_herald: 0.55 },
  builderDetect: 4.5,        // tiles the builder can see stealthed creeps from
  revealLinger: 2.5,         // seconds a seen stealth creep stays visible after leaving the detector's reach
  startGold: 650,
  startPerCorridor: 1.0,     // + this share of the starting gold (and wave-clear bonus) per extra corridor
  minGap: 0.45,              // seconds between two creeps of a group (staggering)
  vs: { waveHp: 0.8, rampAfter: 5, rampPerMin: 0.3 }, // Vs: softer waves, then wave HP and send room grow 30% a minute (compounding) after 5 min
};

// ---------------------------------------------------------------------------
// SEND ECONOMY (Vs) — the anti-steamroll rules
// ---------------------------------------------------------------------------
export const SEND_RULES = {
  // a corridor can hold this much SENT creep health at once; more sends wait in the stock
  capBaseHp: 700, capPerWaveHp: 260,
  // a sent creep that gets through costs one life and is gone (it doesn't travel on)
  leakRemoves: true,
  // the defender earns this share of a sent creep's cost when it dies there
  defenderBounty: 0.6,
};
