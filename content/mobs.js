/* =============================================================================
 * Skyhold TD — content/mobs.js
 * THE EXPANDED BESTIARY: the 72 mobs picked for Skyhold, plus their minions
 * and the four challenge bosses.
 * Used only by the "Expanded" ruleset. The "Classic" ruleset (Circle-exact)
 * never spawns them. Every mob can appear in regular waves, and every mob
 * except the minions, Treasure Goblin and challenge bosses can be sent in
 * versus.
 *
 * Numbers are authored floats; the sim converts them with fx.fromFloat on use
 * (deterministic). Balance is a first pass, to be tuned later.
 *
 * armorClass is recorded for the planned armour/damage-type pass. Today it only
 * matters through the explicit traits below:
 *   - ethereal mobs carry physResist
 *   - fortified mobs have high armour
 *
 * TRAIT KEYS (all optional):
 *   fly                         ignores the maze, flies portal to portal; only towers that can hit air hit it
 *   invisible                   only targetable when revealed by a detecting tower
 *   cloakCycle {every,dur}      turns invisible for dur seconds every `every` seconds
 *   cloakAura r                 makes creeps within r tiles invisible
 *   evasion p                   chance to dodge direct hits
 *   splashResist m              damage multiplier taken from splash hits
 *   physResist m                damage multiplier from projectile / melee hits
 *   magicResist m               damage multiplier from beam / chain / aura / damage over time
 *   beamResist m                damage multiplier from beam and chain hits
 *   chainImmune                 takes no damage from chain bounces
 *   statusImmune                no status effects
 *   immune [ids]                immune to these statuses
 *   slowImmune                  ignores slows
 *   slowImmuneFor s             ignores slows for the first s seconds in each corridor
 *   resist {el:m}               base elemental resistance (negative = weakness)
 *   shield {pct,delay,regen}    absorbs damage first and recharges when untouched
 *   stoneForm {at,armor,dur}    once, below `at` HP: +armor for dur seconds
 *   shell {at:[..],dur}         immune and still for dur seconds at each threshold
 *   armorWhenHit {mult,dur}     armour multiplied for dur seconds after a hit
 *   divineShield {at:[..],dur}  invulnerable for dur seconds at each HP threshold
 *   regen p                     heals p × max HP per second
 *   revive {hp}                 once, rises again with hp × max HP
 *   adaptiveResist m            resistance m to the element that hit it last
 *   sprintBelow {at,mult}       faster below `at` HP
 *   chargeOnHit {per,max}       +per speed per hit, up to +max
 *   fasterBurning m             speed multiplier while burning
 *   dash {every,tiles}          leaps `tiles` along the path every `every` seconds
 *   blink {every,tiles}         teleports `tiles` along the path every `every` seconds
 *   voidJump {every,min,max}    teleports a random min..max tiles along the path
 *   escape {at,tiles}           once, below `at` HP: warps forward
 *   phaseWall                   once per corridor, steps through a tower wall
 *   midSpawn                    enters mid-corridor instead of at the portal
 *   healAura {every,r,pct}      heals creeps in range
 *   healWounded {every,r,pct}   heals the most wounded creep in range
 *   repairAura {every,r,pct}    heals mech creeps in range
 *   regenAura {r,pct}           regen per second shared with neighbours
 *   barrier {every,r,pct}       gives nearby creeps a shield
 *   armorAura {r,add}           +armour to creeps in range
 *   speedAura {r,mult}          speed multiplier to creeps in range
 *   flyerSpeedAura {r,mult}     speed multiplier to flyers in range
 *   warAura {r,armor,dmg}       +armour and damage-taken multiplier
 *   split {into,n}              on death splits into n × `into`
 *   deathShield {r,pct}         on death shields nearby creeps
 *   deathZone {r,heal,dur}      on death leaves a healing zone
 *   deathTowerSlow {r,mult,dur} on death slows nearby towers' fire rate
 *   deathStun {r,dur}           on death stuns nearby towers
 *   raiseDead {r,cd,into}       raises a minion where creeps die nearby
 *   spawner {every,into,n}      spawns minions while walking
 *   escort {into,n}             spawns with an escort
 *   enrageOnDeath {r,mult}      on death, nearby creeps speed up
 *   feast {r,pct}               heals when nearby creeps die
 *   devour {r,maxRadius}        eats small creeps it touches
 *   duplicate {at,cd,max}       splits a copy off when hit for more than `at` × max HP
 *   jamPass {r,mult,dur}        towers it passes lose fire rate
 *   corrodeAura {r,mult}        towers in range deal less damage
 *   chillAura {r,mult}          towers in range fire slower
 *   chillFly {r,mult,dur}       towers it flies over fire slower
 *   confuseAura r               towers in range pick random targets
 *   boulder {every,r,stun}      stuns the nearest tower in range
 *   rootTower {r,dur}           once per corridor, roots a tower it passes
 *   curseTower {every,r,mult,dur}  curses a tower's damage
 *   shredObstacle               once per corridor, removes an obstacle it passes
 *   treasure                    bonus gold creature (waves only)
 * ===========================================================================*/

// Mob fields:
//   id, name, family, armorClass, hp, speed, armor, pack, tier (send tier 1–4),
//   minWave, traits, desc; element is optional (themed creatures)
const M = (id, name, family, armorClass, hp, speed, armor, pack, tier, minWave, traits, desc, extra = {}) =>
  ({ id, name, family, armorClass, hp, speed, armor, pack, tier, minWave, traits: traits || {}, desc, ...extra });

export const MOBS = [
  // ---- swarms ----
  M("gnasher_rats", "Gnasher Rats", "swarm", "light", 16, 1.35, 1, 6, 1, 2, {}, "Cheap, fast-breeding flood."),
  M("ember_wisps", "Ember Wisps", "swarm", "unarmored", 14, 1.5, 0, 5, 1, 3, { evasion: 0.15, resist: { fire: 0.3 } }, "Flickering embers that dodge 15% of hits."),
  M("bone_crawlers", "Bone Crawlers", "swarm", "medium", 34, 0.9, 3, 4, 2, 5, { splashResist: 0.5 }, "Bony crawlers that shrug off half of all splash."),
  M("spore_mites", "Spore Mites", "swarm", "unarmored", 10, 1.2, 0, 8, 2, 6, { deathTowerSlow: { r: 1.6, mult: 0.7, dur: 2 } }, "Tiny mites. Their death puffs slow nearby towers."),
  // ---- runners ----
  M("shadow_hound", "Shadow Hound", "runner", "light", 50, 2.0, 1, 1, 1, 3, { sprintBelow: { at: 0.5, mult: 1.6 } }, "Very fast. Sprints once wounded."),
  M("wind_courier", "Wind Courier", "runner", "unarmored", 30, 2.4, 0, 1, 1, 4, { slowImmuneFor: 4 }, "The fastest thing alive. Shrugs off slows at first."),
  M("cinder_lizard", "Cinder Lizard", "runner", "medium", 70, 1.7, 2, 1, 2, 7, { dash: { every: 4, tiles: 3 }, resist: { fire: 0.4 } }, "Dashes 3 tiles forward every few seconds."),
  M("phantom_stag", "Phantom Stag", "runner", "ethereal", 60, 1.9, 0, 1, 2, 9, { physResist: 0.5 }, "A spectral stag. Physical hits pass half through it."),
  // ---- brutes ----
  M("stone_ogre", "Stone Ogre", "brute", "heavy", 320, 0.65, 8, 1, 2, 8, {}, "Lots of HP, lots of armour, nothing fancy."),
  M("ironhide_boar", "Ironhide Boar", "brute", "heavy", 240, 0.85, 6, 1, 2, 10, { chargeOnHit: { per: 0.03, max: 0.7 } }, "Charges faster every time it is hit."),
  M("siege_troll", "Siege Troll", "brute", "medium", 280, 0.7, 4, 1, 3, 12, { regen: 0.02 }, "Regenerates 2% of its HP every second."),
  M("granite_tortoise", "Granite Tortoise", "brute", "fortified", 520, 0.45, 14, 1, 3, 15, { shell: { at: [0.75, 0.5, 0.25], dur: 2 } }, "Retreats into its shell, immune, as it gets hurt."),
  // ---- flyers ----
  M("gargoyle", "Gargoyle", "flyer", "medium", 140, 1.0, 4, 1, 2, 8, { fly: true, stoneForm: { at: 0.4, armor: 16, dur: 3 } }, "Flyer. Turns to stone for 3s when badly hurt."),
  M("storm_harpy", "Storm Harpy", "flyer", "light", 70, 1.7, 1, 1, 1, 6, { fly: true }, "Fast, fragile flyer."),
  M("bat_swarm", "Bat Swarm", "flyer", "unarmored", 22, 1.4, 0, 5, 1, 7, { fly: true }, "A cloud of five bats."),
  M("wyvern", "Wyvern", "flyer", "heavy", 600, 0.7, 8, 1, 3, 16, { fly: true }, "Slow, heavily armoured flyer."),
  // ---- stealth ----
  M("shade_stalker", "Shade Stalker", "stealth", "light", 90, 1.2, 1, 1, 2, 10, { invisible: true }, "Permanently invisible. Needs a detecting tower."),
  M("veil_wraith", "Veil Wraith", "stealth", "ethereal", 110, 1.1, 0, 1, 3, 14, { invisible: true, cloakAura: 1.6, physResist: 0.5 }, "Invisible, and cloaks the creeps next to it."),
  // ---- tower disruptors ----
  M("siege_ram", "Siege Ram", "disruptor", "heavy", 300, 0.8, 8, 1, 3, 12, { jamPass: { r: 2.6, mult: 0.6, dur: 4 } }, "Every tower it passes loses fire rate for a while."),
  M("rust_beetle", "Rust Beetle", "disruptor", "medium", 160, 0.9, 5, 1, 2, 10, { corrodeAura: { r: 3, mult: 0.7 } }, "Corrodes towers in range: their damage drops while it lives."),
  M("wrecker_golem", "Wrecker Golem", "disruptor", "fortified", 420, 0.6, 12, 1, 3, 15, { boulder: { every: 5, r: 5, stun: 3 } }, "Hurls boulders that stun a tower for 3s."),
  // ---- support ----
  M("troll_shaman", "Troll Shaman", "support", "medium", 120, 0.95, 2, 1, 2, 8, { healAura: { every: 3, r: 2.5, pct: 0.08 } }, "Heals nearby creeps every few seconds."),
  M("banner_bearer", "Banner Bearer", "support", "heavy", 200, 0.85, 6, 1, 2, 9, { armorAura: { r: 2.5, add: 4 } }, "Armour aura for nearby creeps."),
  M("war_drummer", "War Drummer", "support", "medium", 130, 0.9, 2, 1, 2, 9, { speedAura: { r: 2.5, mult: 1.2 } }, "Speed aura for nearby creeps."),
  M("moss_golem", "Moss Golem", "support", "medium", 260, 0.7, 3, 1, 3, 13, { regen: 0.03, regenAura: { r: 2, pct: 0.01 } }, "Regenerates fast and shares its regen with neighbours."),
  // ---- death effects ----
  M("gel_slime", "Gel Slime", "death", "medium", 120, 0.85, 2, 1, 2, 7, { split: { into: "slime_m", n: 2 } }, "Splits into two slimes, which split once more."),
  M("hatchling_sac", "Hatchling Sac", "death", "heavy", 200, 0.6, 6, 1, 2, 10, { split: { into: "hatchling", n: 4 } }, "Bursts into four fast hatchlings."),
  M("martyr_acolyte", "Martyr Acolyte", "death", "unarmored", 80, 1.0, 0, 1, 1, 6, { deathShield: { r: 2.5, pct: 0.2 } }, "On death, shields the creeps around it."),
  // ---- resistant ----
  M("rune_knight", "Rune Knight", "resistant", "heavy", 260, 0.8, 8, 1, 3, 12, { magicResist: 0.5 }, "Halves beam, chain, aura and damage-over-time."),
  M("spellward_golem", "Spellward Golem", "resistant", "fortified", 340, 0.7, 10, 1, 3, 14, { statusImmune: true }, "Immune to every status effect."),
  M("aegis_bearer", "Aegis Bearer", "resistant", "medium", 160, 0.9, 3, 1, 2, 10, { shield: { pct: 0.5, delay: 3, regen: 0.12 } }, "A shield absorbs damage first and recharges when it isn't hit."),
  M("adaptive_husk", "Adaptive Husk", "resistant", "medium", 200, 0.9, 3, 1, 3, 13, { adaptiveResist: 0.5 }, "Resists whichever element hit it last."),
  // ---- summoners ----
  M("necromancer", "Necromancer", "summoner", "light", 120, 0.9, 1, 1, 3, 12, { raiseDead: { r: 3, cd: 1.5, into: "skeleton" } }, "Raises skeletons from creeps that die near it."),
  M("brood_mother", "Brood Mother", "summoner", "heavy", 300, 0.65, 5, 1, 3, 14, { spawner: { every: 3, into: "spiderling", n: 2 } }, "Lays spiderlings every few seconds."),
  M("hive_queen", "Hive Queen", "summoner", "heavy", 380, 0.6, 6, 1, 3, 16, { escort: { into: "hive_drone", n: 4 }, enrageOnDeath: { r: 6, mult: 1.6 } }, "Escorted by drones that go berserk if she dies."),
  // ---- tricksters ----
  M("blink_imp", "Blink Imp", "trickster", "light", 70, 1.1, 1, 1, 1, 5, { blink: { every: 3.5, tiles: 4 } }, "Teleports 4 tiles ahead every few seconds."),
  M("phase_walker", "Phase Walker", "trickster", "ethereal", 120, 1.0, 0, 1, 2, 11, { phaseWall: true, physResist: 0.5 }, "Steps through one tower wall per corridor."),
  M("escape_artist", "Escape Artist", "trickster", "light", 110, 1.2, 1, 1, 2, 9, { escape: { at: 0.3, tiles: 6 } }, "At 30% HP it opens a portal and warps 6 tiles ahead."),
  // ---- fire ----
  M("magma_elemental", "Magma Elemental", "fire", "heavy", 320, 0.65, 6, 1, 3, 12, { immune: ["burning", "molten"], split: { into: "cinderling", n: 2 }, resist: { fire: 0.5 } }, "Immune to burning. Splits into two cinderlings.", { element: "fire" }),
  M("hellhound_pair", "Hellhound Pair", "fire", "light", 80, 1.9, 1, 2, 2, 8, { fasterBurning: 1.5, resist: { fire: 0.4 } }, "A pair of hounds that run faster while burning.", { element: "fire" }),
  M("infernal", "Infernal", "fire", "fortified", 480, 0.55, 12, 1, 3, 15, { midSpawn: true, resist: { fire: 0.5 } }, "Crashes down mid-route instead of entering at the portal.", { element: "fire" }),
  M("ash_revenant", "Ash Revenant", "fire", "medium", 160, 0.9, 3, 1, 2, 10, { revive: { hp: 0.3 }, resist: { fire: 0.3 } }, "Rises once from its ashes.", { element: "fire" }),
  // ---- ice & water ----
  M("frost_wyrm", "Frost Wyrm", "ice", "heavy", 520, 0.7, 6, 1, 4, 20, { fly: true, slowImmune: true, chillFly: { r: 2.2, mult: 0.75, dur: 3 }, resist: { ice: 0.5 } }, "Slow-immune flyer that chills the towers it passes over.", { element: "ice" }),
  M("snow_yeti", "Snow Yeti", "ice", "heavy", 360, 0.7, 6, 1, 3, 14, { chillAura: { r: 3, mult: 0.7 }, resist: { ice: 0.4 } }, "Chilling aura: nearby towers fire slower.", { element: "ice" }),
  M("tide_naga", "Tide Naga", "ice", "medium", 160, 0.95, 3, 1, 2, 11, { barrier: { every: 5, r: 2.5, pct: 0.15 }, resist: { ice: 0.3 } }, "Wraps nearby creeps in a water barrier.", { element: "ice" }),
  M("shell_turtle", "Shell Turtle", "ice", "fortified", 400, 0.5, 10, 1, 3, 13, { armorWhenHit: { mult: 2, dur: 1 } }, "Its armour doubles while it's being hit.", { element: "ice" }),
  // ---- nature ----
  M("treant", "Treant", "nature", "fortified", 480, 0.5, 8, 1, 3, 14, { regen: 0.025, resist: { nature: 0.5, fire: -0.5 } }, "Strong regeneration, but weak to fire.", { element: "nature" }),
  M("vine_strangler", "Vine Strangler", "nature", "medium", 170, 0.85, 3, 1, 2, 10, { rootTower: { r: 2.6, dur: 4 } }, "Roots a tower it passes for 4s.", { element: "nature" }),
  M("spore_shambler", "Spore Shambler", "nature", "medium", 180, 0.8, 3, 1, 2, 11, { immune: ["poisoned"], deathZone: { r: 2, heal: 0.05, dur: 4 } }, "Poison-immune. Its spores heal creeps after it dies.", { element: "nature" }),
  M("dryad_huntress", "Dryad Huntress", "nature", "light", 80, 1.8, 1, 1, 2, 8, { evasion: 0.25 }, "Fast and evasive: dodges 25% of attacks.", { element: "nature" }),
  // ---- storm ----
  M("thunder_lizard", "Thunder Lizard", "storm", "medium", 150, 1.1, 3, 1, 2, 10, { chainImmune: true, immune: ["shocked"], blink: { every: 5, tiles: 3 }, resist: { storm: 0.5 } }, "Chain-lightning immune. Once charged, it blinks forward.", { element: "storm" }),
  M("tempest_elemental", "Tempest Elemental", "storm", "light", 100, 1.4, 1, 1, 2, 11, { fly: true, flyerSpeedAura: { r: 3, mult: 1.3 }, resist: { storm: 0.4 } }, "Flyer that speeds up nearby flyers.", { element: "storm" }),
  M("cloud_djinn", "Cloud Djinn", "storm", "ethereal", 150, 1.1, 0, 1, 3, 15, { fly: true, physResist: 0.5, cloakCycle: { every: 6, dur: 2 } }, "Ethereal flyer that vanishes into clouds every 6s.", { element: "storm" }),
  // ---- light ----
  M("radiant_paladin", "Radiant Paladin", "light", "heavy", 300, 0.8, 8, 1, 3, 13, { divineShield: { at: [0.5], dur: 3 }, resist: { light: 0.4 } }, "Divine shield: invulnerable for 3s at half health.", { element: "light" }),
  M("sun_priest", "Sun Priest", "light", "light", 100, 0.95, 1, 1, 2, 9, { healWounded: { every: 2.5, r: 3, pct: 0.15 } }, "Heals the most wounded creep nearby.", { element: "light" }),
  M("prism_golem", "Prism Golem", "light", "fortified", 380, 0.65, 10, 1, 3, 14, { beamResist: 0.5, resist: { light: 0.5 } }, "Halves damage from beam and lightning towers.", { element: "light" }),
  // ---- darkness & undead ----
  M("ghoul", "Ghoul", "darkness", "light", 90, 1.6, 1, 1, 1, 6, { feast: { r: 2.5, pct: 0.2 } }, "Heals by feeding on creeps that die near it.", { element: "darkness" }),
  M("banshee", "Banshee", "darkness", "ethereal", 130, 1.0, 0, 1, 3, 13, { physResist: 0.5, curseTower: { every: 6, r: 4, mult: 0.6, dur: 5 } }, "Curses a tower in range, cutting its damage.", { element: "darkness" }),
  M("death_revenant", "Death Revenant", "darkness", "heavy", 260, 0.75, 7, 1, 3, 15, { revive: { hp: 1.0 } }, "Reanimates once at full health.", { element: "darkness" }),
  M("abomination", "Abomination", "darkness", "heavy", 700, 0.55, 6, 1, 4, 18, { cloakAura: 2.2 }, "Huge. Its plague cloud hides the creeps around it.", { element: "darkness" }),
  // ---- mech ----
  M("clockwork_spiders", "Clockwork Spiders", "mech", "medium", 45, 1.4, 4, 4, 2, 8, { immune: ["poisoned", "cursed"] }, "A pack of four. Immune to poison and curses.", { element: "mech", mech: true }),
  M("goblin_shredder", "Goblin Shredder", "mech", "heavy", 260, 0.8, 6, 1, 3, 12, { shredObstacle: true }, "Saws through the maze: removes one obstacle per corridor.", { element: "mech", mech: true }),
  M("steam_tank", "Steam Tank", "mech", "fortified", 560, 0.45, 14, 1, 4, 18, { cloakAura: 2.0 }, "Very slow. Vents steam that hides nearby creeps.", { element: "mech", mech: true }),
  M("repair_drone", "Repair Drone", "mech", "light", 70, 1.2, 1, 1, 2, 10, { fly: true, repairAura: { every: 2, r: 3, pct: 0.06 } }, "Flyer that repairs mech creeps.", { element: "mech", mech: true }),
  // ---- abnormal ----
  M("void_walker", "Void Walker", "abnormal", "ethereal", 140, 1.0, 0, 1, 2, 11, { physResist: 0.5, voidJump: { every: 4, min: 3, max: 7 } }, "Teleports between random points ahead.", { element: "abnormal" }),
  M("mind_flayer", "Mind Flayer", "abnormal", "medium", 170, 0.85, 3, 1, 3, 14, { confuseAura: 3 }, "Confuses towers in range: they fire at random targets.", { element: "abnormal" }),
  M("glitch_wraith", "Glitch Wraith", "abnormal", "ethereal", 160, 1.0, 0, 1, 3, 13, { physResist: 0.5, duplicate: { at: 0.15, cd: 2, max: 2 } }, "Splits a copy off itself when hit hard.", { element: "abnormal" }),
  M("rift_horror", "Rift Horror", "abnormal", "heavy", 420, 0.6, 6, 1, 4, 17, { devour: { r: 0.9, maxRadius: 0.3 } }, "Devours small creeps it touches and grows stronger.", { element: "abnormal" }),
  // ---- elites ----
  M("ogre_warchief", "Ogre Warchief", "elite", "heavy", 1400, 0.6, 12, 1, 4, 20, { warAura: { r: 3, armor: 3, dmg: 0.8 } }, "Elite. Armour and damage-reduction aura.", { elite: true }),
  M("dragonspawn", "Dragonspawn", "elite", "heavy", 1100, 0.75, 8, 1, 4, 20, { fly: true, boulder: { every: 6, r: 4, stun: 2 }, resist: { fire: 0.5 } }, "Elite flyer. Its fire breath stuns a tower.", { elite: true, element: "fire" }),
  M("mountain_giant", "Mountain Giant", "elite", "fortified", 1800, 0.5, 16, 1, 4, 22, { boulder: { every: 5, r: 6, stun: 3 } }, "Elite. Hurls boulders at towers.", { elite: true }),
  M("treasure_goblin", "Treasure Goblin", "elite", "unarmored", 160, 2.2, 0, 1, 0, 5, { treasure: true }, "Very fast. Kill it for a big gold drop.", { reward: 120, noSend: true }),
];

// minions: spawned by other mobs only
export const MINIONS = [
  M("slime_m", "Gel Slimelet", "death", "medium", 55, 0.95, 1, 1, 0, 0, { split: { into: "slime_s", n: 2 } }, "Splits once more.", { minion: true }),
  M("slime_s", "Gel Droplet", "death", "medium", 24, 1.05, 0, 1, 0, 0, {}, "The last of the slime.", { minion: true }),
  M("hatchling", "Hatchling", "death", "light", 26, 1.8, 0, 1, 0, 0, {}, "Fast and hungry.", { minion: true }),
  M("skeleton", "Risen Skeleton", "summoner", "medium", 40, 1.0, 2, 1, 0, 0, {}, "Raised by a Necromancer.", { minion: true }),
  M("spiderling", "Spiderling", "summoner", "light", 18, 1.6, 0, 1, 0, 0, {}, "Laid by a Brood Mother.", { minion: true }),
  M("hive_drone", "Hive Drone", "summoner", "light", 40, 1.2, 1, 1, 0, 0, {}, "Guards the Hive Queen.", { minion: true }),
  M("cinderling", "Cinderling", "fire", "light", 40, 1.4, 0, 1, 0, 0, { immune: ["burning", "molten"], resist: { fire: 0.5 } }, "A fragment of magma.", { minion: true, element: "fire" }),
  M("rat_prince", "Rat Prince", "challenge", "medium", 1500, 0.7, 4, 1, 0, 0, { spawner: { every: 3, into: "gnasher_rats", n: 2 } }, "Heir to the burrow.", { minion: true, boss: true }),
];

// challenge bosses (the final enemy of a challenge; `end` = victory on death)
export const CHALLENGE_BOSSES = [
  M("rat_king", "The Rat King", "challenge", "medium", 9000, 0.5, 6, 1, 0, 0, { spawner: { every: 2, into: "gnasher_rats", n: 3 }, split: { into: "rat_prince", n: 3 } }, "Crowned in filth. Breeds as it walks, and its heirs rise when it falls.", { boss: true, end: true }),
  M("mirewyrm", "The Mirewyrm", "challenge", "heavy", 14000, 0.55, 8, 1, 0, 0, { fly: true, regen: 0.004, chillFly: { r: 3, mult: 0.65, dur: 4 }, spawner: { every: 4, into: "bat_swarm", n: 2 } }, "A swamp dragon. It chills every tower it passes over.", { boss: true, end: true }),
  M("clockwork_colossus", "The Clockwork Colossus", "challenge", "fortified", 22000, 0.4, 18, 1, 0, 0, { boulder: { every: 4, r: 7, stun: 2.5 }, spawner: { every: 3, into: "clockwork_spiders", n: 2 }, immune: ["poisoned", "cursed"] }, "A walking foundry. It stuns towers and deploys spiders.", { boss: true, end: true, mech: true }),
  M("eclipse_herald", "The Eclipse Herald", "challenge", "ethereal", 16000, 0.5, 4, 1, 0, 0, { physResist: 0.6, cloakCycle: { every: 5, dur: 2.5 }, divineShield: { at: [0.5, 0.25], dur: 3 }, healAura: { every: 4, r: 3, pct: 0.05 } }, "Half light, half shadow. It fades from sight and shields itself.", { boss: true, end: true }),
];

// ---------------------------------------------------------------------------
// CHALLENGES — post-victory encounters (Line Tower Wars' Book of Summoning):
// 10 waves, then the boss. Hard mode adds a restriction. Winning unlocks a
// builder skin.
// ---------------------------------------------------------------------------
export const CHALLENGES = [
  { id: "burrow", name: "The Rat King's Burrow", boss: "rat_king", desc: "Ten waves of vermin, then the King himself.", pool: ["gnasher_rats", "spore_mites", "bone_crawlers", "shadow_hound", "ghoul", "hatchling_sac"],
    hard: { label: "Half starting gold, boss +60% HP", startGoldMult: 0.5, bossHpMult: 1.6 }, reward: "skin_ratcatcher" },
  { id: "mire", name: "Wings over the Mire", boss: "mirewyrm", desc: "The sky darkens with wings. Bring anti-air.", pool: ["bat_swarm", "storm_harpy", "gargoyle", "wyvern", "tempest_elemental", "frost_wyrm"],
    hard: { label: "Only your first three tower types", maxSlots: 3, bossHpMult: 1.3 }, reward: "skin_skywarden" },
  { id: "foundry", name: "The Iron Foundry", boss: "clockwork_colossus", desc: "Gears, steam and a walking furnace.", pool: ["clockwork_spiders", "goblin_shredder", "steam_tank", "repair_drone", "rust_beetle", "wrecker_golem"],
    hard: { label: "No selling towers", noSell: true, bossHpMult: 1.3 }, reward: "skin_tinker" },
  { id: "eclipse", name: "The Eclipse", boss: "eclipse_herald", desc: "Things that hide, things that shine.", pool: ["shade_stalker", "veil_wraith", "radiant_paladin", "sun_priest", "banshee", "cloud_djinn"],
    hard: { label: "Kills give no gold", noKillGold: true, bossHpMult: 1.3 }, reward: "skin_eclipse" },
];

// builder skins (cosmetic). "element" is the default, a builder in your corridor's element.
export const BUILDER_SKINS = [
  { id: "element", name: "Elemental", desc: "A builder in your corridor's element.", unlock: null },
  { id: "skin_veteran", name: "Veteran", desc: "Play 10 matches.", unlock: { played: 10 } },
  { id: "skin_gilded", name: "Gilded", desc: "Win 5 matches.", unlock: { wins: 5 } },
  { id: "skin_ratcatcher", name: "Ratcatcher", desc: "Beat The Rat King's Burrow.", unlock: { challenge: "burrow" } },
  { id: "skin_skywarden", name: "Skywarden", desc: "Beat Wings over the Mire.", unlock: { challenge: "mire" } },
  { id: "skin_tinker", name: "Tinker", desc: "Beat The Iron Foundry.", unlock: { challenge: "foundry" } },
  { id: "skin_eclipse", name: "Eclipsed", desc: "Beat The Eclipse.", unlock: { challenge: "eclipse" } },
  { id: "skin_champion", name: "Champion", desc: "Beat every challenge on Hard.", unlock: { allHard: true } },
];

// send tiers: unlock time (seconds into the match), stock and recharge
export const SEND_TIERS = {
  1: { name: "I", unlockAt: 0, stock: 6, recharge: 4 },
  2: { name: "II", unlockAt: 150, stock: 4, recharge: 8 },
  3: { name: "III", unlockAt: 360, stock: 2, recharge: 16 },
  4: { name: "IV", unlockAt: 660, stock: 1, recharge: 30 },
};
// Circle's five sends, slotted into tiers
export const CLASSIC_SEND_TIER = { grunt: 1, runner: 1, swarm: 1, brute: 2, tank: 3 };

export const ARMOR_CLASSES = {
  unarmored: { name: "Unarmored", color: "#c9c2b0" }, light: { name: "Light", color: "#9fd8ff" },
  medium: { name: "Medium", color: "#ffd27a" }, heavy: { name: "Heavy", color: "#ff9a6a" },
  fortified: { name: "Fortified", color: "#c0a0ff" }, ethereal: { name: "Ethereal", color: "#7fffd0" },
};

// human-readable trait list for the UI
export function traitList(t) {
  const out = [];
  const p = (x) => Math.round(x * 100) + "%";
  if (t.fly) out.push(["🪽", "Flying", "Ignores the maze. Only towers that can hit air hit it."]);
  if (t.invisible) out.push(["👁", "Invisible", "Needs a detecting tower to be targeted."]);
  if (t.cloakCycle) out.push(["👁", "Fading", `Invisible ${t.cloakCycle.dur}s every ${t.cloakCycle.every}s.`]);
  if (t.cloakAura) out.push(["🌫", "Cloak aura", `Hides creeps within ${t.cloakAura} tiles.`]);
  if (t.evasion) out.push(["💨", "Evasive", `Dodges ${p(t.evasion)} of direct hits.`]);
  if (t.splashResist) out.push(["🦴", "Splash-proof", `Takes ${p(t.splashResist)} splash damage.`]);
  if (t.physResist) out.push(["👻", "Ethereal", `Takes ${p(t.physResist)} from projectiles and blades.`]);
  if (t.magicResist) out.push(["🔰", "Rune-warded", `Takes ${p(t.magicResist)} from beams, chains, auras and damage over time.`]);
  if (t.beamResist) out.push(["🔷", "Prismatic", `Takes ${p(t.beamResist)} from beams and chains.`]);
  if (t.chainImmune) out.push(["⚡", "Grounded", "Immune to chain bounces."]);
  if (t.statusImmune) out.push(["✨", "Spellward", "Immune to all status effects."]);
  if (t.immune) out.push(["🛡", "Immune", "Immune to " + t.immune.join(", ") + "."]);
  if (t.slowImmune) out.push(["❄", "Unslowable", "Ignores slows."]);
  if (t.slowImmuneFor) out.push(["💨", "Head start", `Ignores slows for ${t.slowImmuneFor}s in each corridor.`]);
  if (t.resist) for (const k in t.resist) out.push([t.resist[k] < 0 ? "🔥" : "◈", (t.resist[k] < 0 ? "Weak to " : "Resists ") + k, (t.resist[k] < 0 ? "+" + p(-t.resist[k]) : p(t.resist[k])) + " " + k + " damage."]);
  if (t.shield) out.push(["🛡", "Shield", `A ${p(t.shield.pct)} HP shield that recharges.`]);
  if (t.stoneForm) out.push(["🗿", "Stone form", `Turns to stone at ${p(t.stoneForm.at)} HP.`]);
  if (t.shell) out.push(["🐢", "Shell", `Hides in its shell (immune) at ${t.shell.at.map(p).join(", ")} HP.`]);
  if (t.armorWhenHit) out.push(["🛡", "Hardening", "Armour doubles while being hit."]);
  if (t.divineShield) out.push(["✨", "Divine shield", `Invulnerable ${t.divineShield.dur}s at ${t.divineShield.at.map(p).join(", ")} HP.`]);
  if (t.regen) out.push(["💚", "Regeneration", `Heals ${p(t.regen)} HP per second.`]);
  if (t.revive) out.push(["💀", "Undying", `Rises once with ${p(t.revive.hp)} HP.`]);
  if (t.adaptiveResist) out.push(["◈", "Adaptive", `Resists ${p(t.adaptiveResist)} of the element that hit it last.`]);
  if (t.sprintBelow) out.push(["💨", "Sprinter", `Faster below ${p(t.sprintBelow.at)} HP.`]);
  if (t.chargeOnHit) out.push(["🐗", "Charger", "Speeds up with every hit."]);
  if (t.fasterBurning) out.push(["🔥", "Fire-fed", "Faster while burning."]);
  if (t.dash) out.push(["💨", "Dash", `Leaps ${t.dash.tiles} tiles every ${t.dash.every}s.`]);
  if (t.blink) out.push(["✦", "Blink", `Teleports ${t.blink.tiles} tiles every ${t.blink.every}s.`]);
  if (t.voidJump) out.push(["✦", "Void jump", `Jumps ${t.voidJump.min}–${t.voidJump.max} tiles every ${t.voidJump.every}s.`]);
  if (t.escape) out.push(["🌀", "Escape", `Warps ${t.escape.tiles} tiles ahead at ${p(t.escape.at)} HP.`]);
  if (t.phaseWall) out.push(["🚪", "Phasing", "Steps through one tower wall per corridor."]);
  if (t.midSpawn) out.push(["☄", "Meteor", "Lands mid-corridor."]);
  if (t.healAura) out.push(["💚", "Healer", `Heals nearby creeps ${p(t.healAura.pct)} every ${t.healAura.every}s.`]);
  if (t.healWounded) out.push(["💚", "Mender", `Heals the most wounded creep ${p(t.healWounded.pct)}.`]);
  if (t.repairAura) out.push(["🔧", "Repairer", "Heals mech creeps."]);
  if (t.regenAura) out.push(["💚", "Overgrowth", "Shares regeneration with neighbours."]);
  if (t.barrier) out.push(["💧", "Barrier", "Shields nearby creeps."]);
  if (t.armorAura) out.push(["🚩", "Banner", `+${t.armorAura.add} armour to nearby creeps.`]);
  if (t.speedAura) out.push(["🥁", "War drums", "Nearby creeps move faster."]);
  if (t.flyerSpeedAura) out.push(["🌪", "Tailwind", "Nearby flyers move faster."]);
  if (t.warAura) out.push(["⚔", "Warchief", "Nearby creeps gain armour and take less damage."]);
  if (t.split) out.push(["🧬", "Splits", `Splits into ${t.split.n} on death.`]);
  if (t.deathShield) out.push(["🛡", "Martyr", "Shields nearby creeps on death."]);
  if (t.deathZone) out.push(["🍄", "Spores", "Leaves healing spores on death."]);
  if (t.deathTowerSlow) out.push(["🍄", "Spore puff", "Slows nearby towers on death."]);
  if (t.deathStun) out.push(["⚡", "Discharge", "Stuns nearby towers on death."]);
  if (t.raiseDead) out.push(["💀", "Necromancy", "Raises skeletons from nearby deaths."]);
  if (t.spawner) out.push(["🥚", "Brood", `Spawns ${t.spawner.n} minions every ${t.spawner.every}s.`]);
  if (t.escort) out.push(["🐝", "Escort", `Arrives with ${t.escort.n} guards.`]);
  if (t.enrageOnDeath) out.push(["😡", "Rally", "Its death enrages nearby creeps."]);
  if (t.feast) out.push(["🍖", "Feast", "Heals when nearby creeps die."]);
  if (t.devour) out.push(["👄", "Devourer", "Eats small creeps and grows."]);
  if (t.duplicate) out.push(["🧬", "Glitch", "Duplicates when hit hard."]);
  if (t.jamPass) out.push(["🐏", "Battering", "Towers it passes fire slower."]);
  if (t.corrodeAura) out.push(["🧪", "Corrosion", "Towers in range deal less damage."]);
  if (t.chillAura) out.push(["❄", "Chill aura", "Towers in range fire slower."]);
  if (t.chillFly) out.push(["❄", "Frost wake", "Towers it flies over fire slower."]);
  if (t.confuseAura) out.push(["🌀", "Mind fog", "Towers in range fire at random targets."]);
  if (t.boulder) out.push(["🪨", "Boulders", `Stuns a tower for ${t.boulder.stun}s every ${t.boulder.every}s.`]);
  if (t.rootTower) out.push(["🌿", "Strangler", "Roots a tower it passes."]);
  if (t.curseTower) out.push(["👻", "Wail", "Curses a tower's damage."]);
  if (t.shredObstacle) out.push(["🪚", "Shredder", "Removes one obstacle per corridor."]);
  if (t.treasure) out.push(["💰", "Treasure", "Drops a fortune when killed."]);
  return out;
}

const ALL = () => [...MOBS, ...MINIONS, ...CHALLENGE_BOSSES];
export const MOB_BY_ID = Object.fromEntries(ALL().map((m) => [m.id, m]));
export function mobTier(id) { return MOB_BY_ID[id] ? MOB_BY_ID[id].tier : (CLASSIC_SEND_TIER[id] || 1); }
export function isFlyer(id) { const m = MOB_BY_ID[id]; return !!(m && m.traits.fly); }
export function isDisruptor(id) { const m = MOB_BY_ID[id]; if (!m) return false; const t = m.traits; return !!(t.jamPass || t.corrodeAura || t.chillAura || t.chillFly || t.confuseAura || t.boulder || t.rootTower || t.curseTower || t.deathTowerSlow || t.deathStun || t.shredObstacle); }
export function isStealthy(id) { const m = MOB_BY_ID[id]; if (!m) return false; const t = m.traits; return !!(t.invisible || t.cloakCycle || t.cloakAura); }

// send cost: power-based, rounded to 5, with a floor per tier
function sendBaseCost(m) {
  const t = m.traits;
  const traitCount = Object.keys(t).length;
  let c = m.hp * m.pack * 0.2 + m.armor * 2.2 + traitCount * 5 + (t.fly ? 10 : 0) + (t.invisible ? 15 : 0);
  const floor = { 1: 15, 2: 40, 3: 90, 4: 220 }[m.tier] || 15;
  c = Math.max(floor, c);
  return Math.round(c / 5) * 5;
}

// Merge the bestiary into the DB (idempotent). The classic data is untouched;
// only new keys are added.
export function extendDB(DB) {
  if (DB._skyholdMobs) return DB;
  DB._skyholdMobs = true;
  for (const m of ALL()) {
    if (DB.ENEMIES[m.id]) continue;
    const reward = m.reward != null ? m.reward : Math.max(1, Math.round(m.hp * 0.12 + m.armor * 0.4));
    DB.ENEMIES[m.id] = {
      id: m.id, name: m.name, hp: m.hp, speed: m.speed, armor: m.armor, reward,
      radius: m.pack >= 4 ? 0.2 : m.pack > 1 ? 0.26 : (m.boss ? 0.8 : m.elite ? 0.6 : m.armorClass === "fortified" || m.armorClass === "heavy" ? 0.42 : 0.32),
      color: "#a0a0a0", boss: !!m.boss, end: !!m.end,
      skyhold: { family: m.family, armorClass: m.armorClass, traits: m.traits, pack: m.pack, tier: m.tier, minWave: m.minWave, element: m.element || null, mech: !!m.mech, minion: !!m.minion, elite: !!m.elite, desc: m.desc, noSend: !!(m.noSend || m.minion || m.end) },
    };
  }
  // the expanded send catalog: Circle's five plus every sendable new mob
  DB.SENDS_EXPANDED = {};
  for (const k in DB.SENDS) DB.SENDS_EXPANDED[k] = { ...DB.SENDS[k], tier: CLASSIC_SEND_TIER[k] || 1 };
  for (const m of MOBS) {
    if (m.noSend || !m.tier) continue;
    DB.SENDS_EXPANDED[m.id] = { baseCost: sendBaseCost(m), count: m.pack, costGrowth: 1.6, hpGrowth: 1.8, tier: m.tier, desc: m.desc };
  }
  const SX = DB.SENDS_EXPANDED;
  DB.sendCostX = (type, lvl) => { const s = SX[type]; return s ? Math.round(s.baseCost * Math.pow(s.costGrowth, lvl - 1)) : 0; };
  DB.sendUpgradeCostX = (type, lvl) => { const s = SX[type]; return s ? Math.round(s.baseCost * 4 * lvl) : 0; };
  DB.sendHpMultX = (type, lvl) => { const s = SX[type]; return s ? Math.pow(s.hpGrowth, lvl - 1) : 1; };
  DB.SEND_TIERS = SEND_TIERS;
  DB.CHALLENGES = CHALLENGES;
  DB.BUILDER_SKINS = BUILDER_SKINS;
  DB.ARMOR_CLASSES = ARMOR_CLASSES;
  DB.MOBS_EXPANDED = MOBS.map((m) => m.id);
  return DB;
}

export default { MOBS, MINIONS, CHALLENGE_BOSSES, CHALLENGES, BUILDER_SKINS, SEND_TIERS, ARMOR_CLASSES, extendDB, traitList, MOB_BY_ID };
