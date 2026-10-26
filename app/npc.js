/* =============================================================================
 * Skyhold TD — app/npc.js
 * THE NPC BRAIN. Plays a corridor (or a whole solo run) by emitting the same
 * COMMANDS a person would. It reads the state, never changes it.
 *
 * What it does, every time it gets to act:
 *   - reads the next two waves (exactly, via previewWaveX) and its own maze:
 *     flyers vs anti-air, stealth vs detection, armour classes vs damage types
 *   - builds the serpentine maze from the entrance down, picking the tower with
 *     the best value for those threats, mixing both of its elements so they
 *     set up reactions for each other
 *   - upgrades when an upgrade beats a new tower, mutates at level 10, sends
 *     its builder to inspire the hardest hitter
 *   - in Vs: keeps a safety reserve, scouts the next corridor and sends what it
 *     is weakest against, timed while that player is busy with a wave
 * Difficulty changes how fast it acts, how often it makes the best choice,
 * its income and how hard it pushes sends.
 *
 * Used by the offline Vs NPCs, by online seats an NPC holds, and by the balance
 * harness (tools/balance-sim.mjs) as the stand-in player.
 * ===========================================================================*/
import * as fx from "../sim/fx.js";
import { previewWaveX, sendLoad, upgradeCost, towerStats } from "../sim/core.js";

export const NPC_LEVELS = {
  easy: { id: "easy", label: "Easy", act: [1.8, 2.6], skill: 0.45, sendShare: 0.18, maxTier: 2, incomeMult: 0.8, goldBonus: 0, reserve: 1.4, mistakes: 0.25, desc: "Slow and forgetful. Builds a loose maze and rarely sends." },
  normal: { id: "normal", label: "Normal", act: [1.0, 1.5], skill: 0.72, sendShare: 0.28, maxTier: 3, incomeMult: 1.0, goldBonus: 0, reserve: 1.0, mistakes: 0.1, desc: "A fair rival: solid mazes, sensible sends up to tier III." },
  hard: { id: "hard", label: "Hard", act: [0.6, 0.9], skill: 0.88, sendShare: 0.34, maxTier: 4, incomeMult: 1.15, goldBonus: 80, reserve: 0.9, mistakes: 0.03, desc: "Counters your defence: scouts your maze and sends what it's weak to." },
  insane: { id: "insane", label: "Insane", act: [0.4, 0.6], skill: 0.97, sendShare: 0.4, maxTier: 4, incomeMult: 1.3, goldBonus: 160, reserve: 0.8, mistakes: 0, desc: "Near-perfect play with an income edge. Bring synergies." },
};

const canHitAir = (a) => a !== "splash" && a !== "melee" && a !== "support";

/**
 * opts: { id, level, rng () => [0,1), DB, sends (bool), solo (bool: plays every corridor, never sends) }
 */
export function createNpc(opts) {
  const DB = opts.DB, R = DB.RULES, L = NPC_LEVELS[opts.level] || NPC_LEVELS.normal;
  const rnd = opts.rng || Math.random;
  const me = { id: opts.id, level: L, nextAt: opts.startAt != null ? opts.startAt : 1.2 + opts.id * 0.35, plans: {}, lastBuild: null, sendT: 0, lastWave: -1, inspired: {} };
  const SC = R.TUNE.scaling;

  // ---- helpers -------------------------------------------------------------
  function arche(def, tw) {
    let a = def.archetype;
    if (tw) for (const mid of tw.mutations) { const m = def.mutations.find((x) => x.id === mid); if (m && m.mods.archetype) a = m.mods.archetype; }
    return a;
  }
  function dpsAt(def0, level) {
    const def = R.towerX(def0);
    const dmg = def.damage * Math.pow(1 + SC.damagePerLevel, level - 1) * R.TUNE.towerDamage;
    const rate = def.fireRate * Math.pow(1 + SC.fireRatePerLevel, level - 1);
    return { dmg, rate, range: def.range + SC.rangePerLevel * (level - 1) };
  }
  const AREA = (def0, a) => { const def = R.towerX(def0); return a === "splash" ? 1 + (def.splashRadius || 1.5) * 1.2 : a === "chain" ? 1 + Math.min(4, def.chainCount || 0) * 0.5 : a === "melee" ? 1.6 : a === "random" ? 1.35 : def.pierce ? 1 + def.pierce * 0.25 : 1; };
  // what the next waves look like: HP share per armour class, flyers, stealth, typical armour
  function threat(st, fp) {
    const out = { cls: {}, air: 0, stealth: 0, armor: 0, total: 0, boss: false, count: 0 };
    for (let w = fp.wave + 1; w <= fp.wave + 2; w++) {
      if (st.mode !== "endless" && w > fp.totalWaves) break;
      const groups = previewWaveX(st, fp, w) || [];
      for (const g of groups) {
        const d = st.bal.enemies[g.type]; if (!d) continue;
        const hp = (d.hp / 65536) * g.count * (g.type === "boss" ? 1.5 : 1);
        const t = (d.x && d.x.t) || {};
        out.total += hp; out.count += g.count;
        out.cls[d.cls || "medium"] = (out.cls[d.cls || "medium"] || 0) + hp;
        if (t.fly) out.air += hp;
        if (t.invisible || t.cloakCycle || t.cloakAura) out.stealth += hp;
        out.armor += (d.armor / 65536) * hp;
        if (d.boss) out.boss = true;
      }
    }
    out.density = Math.max(0.35, Math.min(1.4, out.count / 2 / 14)); // creeps per wave → how much area damage is worth
    if (out.total > 0) { out.armor /= out.total; for (const k in out.cls) out.cls[k] /= out.total; out.air /= out.total; out.stealth /= out.total; }
    return out;
  }
  function classFactor(type, th) {
    let f = 0, s = 0;
    for (const k in th.cls) { const row = R.ARMOR_TABLE[k] || R.ARMOR_TABLE.medium; f += row[type] * th.cls[k]; s += th.cls[k]; }
    return s ? f / s : 1;
  }
  function valueOf(def, level, th, a) {
    if (a === "support") return 0;
    const v = dpsAt(def, level);
    const armorF = R.ARMOR_K / (R.ARMOR_K + th.armor);
    const type = R.towerDamageType(def, a);
    // coverage grows with range: a creep spends about 2 × range tiles inside it
    const area = 1 + (AREA(def, a) - 1) * (th.density || 1);
    return v.dmg * v.rate * area * armorF * classFactor(type, th) * Math.pow(v.range / 4, 1.2);
  }
  function corridorStock(st, corr) {
    let air = 0, all = 0, det = 0, supports = {};
    for (const tw of corr.towers) {
      const def = DB.TOWER_BY_ID[tw.def.id]; const a = arche(def, tw);
      const v = a === "support" ? 0 : dpsAt(def, tw.level); const d = a === "support" ? 0 : v.dmg * v.rate * AREA(def, a);
      all += d; if (canHitAir(a)) air += d;
      if (def.element === "light" || tw.level >= 7 || a === "support") det++;
      if (a === "support") supports[def.id] = (supports[def.id] || 0) + 1;
    }
    return { air, all, det, supports, n: corr.towers.length };
  }
  const money = (st, pl, el) => (st.economy === "shared" ? pl.gold : (pl.essence[el] | 0));
  function mastery(el) { return opts.mastery ? opts.mastery(el) : 5; }
  const slots = (m) => (m >= 4 ? 5 : m >= 2 ? 4 : m >= 1 ? 3 : 2);
  const mutSlots = (m) => (m >= 5 ? 2 : m >= 3 ? 1 : 0);

  // ---- one decision ------------------------------------------------------------
  function act(st, q) {
    const pl = st.players[me.id]; if (!pl || !pl.alive) return;
    const vs = st.gameMode === "versus";
    const G = st.grid;
    const wave = Math.max(1, pl.wave);
    const th = threat(st, pl);
    const els = pl.buildable || pl.elements;
    // a safety reserve in Vs, so a burst of sends can be answered
    const reserve = vs ? Math.round((20 + wave * 7) * L.reserve) : 0;
    // judge each corridor, weakest first (solo plays them all)
    const corrs = pl.corridors.map((c, i) => ({ c, i, s: corridorStock(st, c) }));
    corrs.sort((a, b) => a.s.all - b.s.all);
    if (me.lastBuild) { const lb = me.lastBuild; if (lb.corr.towers.length <= lb.count) lb.P.fails[lb.idx] = (lb.P.fails[lb.idx] || 0) + 1; me.lastBuild = null; }
    for (const { c: corr, i: ci, s } of corrs) {
      const P = me.plans[ci] || (me.plans[ci] = { plan: DB.makeMazePlan(G.cols, G.rows, DB.CONFIG.towerSize), fails: {} });
      const pending = corr.builder ? corr.builder.queue.length + (corr.builder.cur ? 1 : 0) : 0;
      // candidate towers
      const opts2 = DB.TOWERS.filter((t) => els.includes(t.element) && t.slot < slots(mastery(t.element)));
      // flyers can turn up any wave from the 6th: keep a third of the firepower able to hit air, more when they're coming
      const needAir = s.n >= 2 && ((th.air > 0.02 && s.air < s.all * Math.max(0.35, th.air * 1.6)) || (wave >= 3 && s.air < s.all * 0.33));
      const needDet = (th.stealth > 0 || wave >= 9) && s.det === 0 && s.n >= 3;
      // no detector yet and invisible creeps coming: park the builder's lantern in the thick of the maze
      if (th.stealth > 0 && s.det === 0 && corr.builder && corr.towers.length >= 2 && (me.lantern || (me.lantern = {}))[ci] !== pl.wave) {
        // the tower that sits closest to the creeps' route, early in the maze (most towers downstream)
        const route = pathCells(st, corr);
        let top = null, tv = Infinity;
        for (const tw of corr.towers) {
          const cx = tw.c + 1, cy = tw.r + 1; let d = Infinity, at = 0;
          for (let k = 0; k < route.length; k++) { const p = route[k], dd = (p.c - cx) ** 2 + (p.r - cy) ** 2; if (dd < d) { d = dd; at = k; } }
          const v = Math.sqrt(d) + at / Math.max(1, route.length) * 3;
          if (v < tv) { tv = v; top = tw; }
        }
        me.lantern[ci] = pl.wave;
        if (top && corr.builder.insp !== top.id) { me.inspired[ci] = true; q({ type: "BuilderInspire", player: me.id, corridorId: ci, towerId: top.id }); return; }
      }
      let best = null, bestV = -1, any = -1;
      for (const t of opts2) {
        const a = t.archetype;
        let v = a === "support" ? supportValue(t, s, th, wave) : valueOf(t, 1, th, a) / t.cost;
        if (needAir) v *= canHitAir(a) ? 1.8 : 0.35;
        if (needDet && (t.element === "light" || a === "support")) v *= 2.5;
        // keep the run's elements mixed so their statuses react
        if (els.length > 1) { const mine = corr.towers.filter((x) => x.def.element === t.element).length; v *= mine <= s.n / els.length ? 1.15 : 0.92; }
        if (v > any) any = v;
        if (money(st, pl, t.element) - reserve < t.cost) continue; // can't afford it yet
        if (v > bestV) { bestV = v; best = t; }
      }
      // the next maze spot (from the entrance down)
      let idx = -1;
      for (let i = 0; i < P.plan.length; i++) { if ((P.fails[i] || 0) >= 2) continue; const sp = P.plan[i]; if (corr.grid[(sp.r + 1) * G.cols + sp.c + 1] !== 0) continue; idx = i; break; }
      // upgrade candidate: best DPS gain per gold
      let up = null, upV = 0;
      for (const tw of corr.towers) {
        if (tw.bState || tw.upT > 0 || tw.level >= 10) continue;
        const def = DB.TOWER_BY_ID[tw.def.id], a = arche(def, tw);
        const cost = upgradeCost(st, tw.def, tw.level);
        if (money(st, pl, def.element) - reserve < cost) continue;
        let gain = a === "support" ? 0.25 * valueOf(def, 1, th, "single") : valueOf(def, tw.level + 1, th, a) - valueOf(def, tw.level, th, a);
        if (needAir && !canHitAir(a)) gain *= 0.4;
        if (needDet && tw.level === 6) gain *= 2; // level 7 sees stealth
        const v = (gain / cost) * 1.05;
        if (v > upV) { upV = v; up = tw; }
      }
      const room = idx >= 0 && pending < 3;
      // a new tower is worth more while the maze is short (it also lengthens the path)
      const mazeBonus = s.n < 8 ? 1.8 : s.n < 16 ? 1.3 : 1;
      const newV = room && best ? bestV * mazeBonus : 0;
      let choice = rnd() < L.mistakes ? (rnd() < 0.5 ? "build" : "up") : (newV >= upV ? "build" : "up");
      // nothing affordable worth it yet: save for the next tower instead of a weak upgrade
      if (choice === "up" && room && upV < any * mazeBonus * 0.6) choice = "save";
      if (choice === "build" && room && best) {
        let t = best;
        if (rnd() > L.skill) { const aff = opts2.filter((x) => money(st, pl, x.element) - reserve >= x.cost && x.archetype !== "support"); if (aff.length) t = aff[Math.floor(rnd() * aff.length)]; }
        const sp = P.plan[idx];
        me.lastBuild = { P, idx, corr, count: corr.towers.length };
        q({ type: "BuildTower", player: me.id, corridorId: ci, gx: sp.c + 1, gy: sp.r + 1, towerType: t.id, masteryLevel: mastery(t.element) });
        return;
      }
      if (choice === "save") continue;
      if (up) { q({ type: "UpgradeTower", player: me.id, corridorId: ci, towerId: up.id }); return; }
      // mutations at level 10
      for (const tw of corr.towers) {
        const def = DB.TOWER_BY_ID[tw.def.id];
        if (tw.level >= 10 && tw.mutations.length < mutSlots(mastery(def.element))) {
          const m = def.mutations.find((x) => !tw.mutations.includes(x.id));
          if (m) { q({ type: "MutateTower", player: me.id, corridorId: ci, towerId: tw.id, mutId: m.id, masteryLevel: mastery(def.element) }); return; }
        }
      }
      // the builder inspires the hardest hitter while it has nothing to build
      if (corr.builder && !corr.builder.insp && corr.towers.length >= 4 && !me.inspired[ci]) {
        let top = null, tv = 0;
        for (const tw of corr.towers) { const def = DB.TOWER_BY_ID[tw.def.id]; const v = valueOf(def, tw.level, th, arche(def, tw)); if (v > tv) { tv = v; top = tw; } }
        if (top) { me.inspired[ci] = true; q({ type: "BuilderInspire", player: me.id, corridorId: ci, towerId: top.id }); return; }
      }
    }
    if (vs && opts.sends !== false) trySend(st, pl, reserve);
  }
  // the creeps' route: walk the distance field down from the entrance
  function pathCells(st, corr) {
    const G = st.grid, out = [];
    if (!corr.dist || !corr.entrance) return out;
    let c = corr.entrance.c, r = corr.entrance.r;
    for (let n = 0; n < G.cols * G.rows && out.length < 2000; n++) {
      out.push({ c, r });
      const here = corr.dist[r * G.cols + c];
      if (!(here > 0)) break;
      let bc = -1, br = -1, bd = here;
      for (const [dc, dr] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const nc = c + dc, nr = r + dr; if (nc < 0 || nr < 0 || nc >= G.cols || nr >= G.rows) continue;
        const d = corr.dist[nr * G.cols + nc]; if (d < bd) { bd = d; bc = nc; br = nr; }
      }
      if (bc < 0) break;
      c = bc; r = br;
    }
    return out;
  }
  function supportValue(t, s, th, wave) {
    if (s.n < 6 || (s.supports[t.id] || 0) >= 1 + Math.floor(s.n / 14)) return 0;
    // an aura is worth about as much as a few towers around it
    const base = t.auraStat === "amp_tower" || t.auraStat === "haste_tower" ? s.all * 0.12 : t.auraStat === "slow" ? s.all * 0.1 : t.auraStat === "poison" ? 8 * (1 + wave * 0.1) : s.all * 0.06;
    return base / t.cost * (th.stealth > 0 && s.det === 0 ? 2 : 1);
  }

  // ---- sends ---------------------------------------------------------------------
  function trySend(st, pl, reserve) {
    const X = !!st.x, cat = DB.SENDS_EXPANDED, costOf = DB.sendCostX, upOf = DB.sendUpgradeCostX;
    // defence first: only send once the maze is keeping up, and never while bleeding lives
    const towers = pl.corridors[0].towers.length;
    if (!X || pl.wave < 3 || towers < 5 + pl.wave * 0.9 || pl.lives < pl.maxLives * 0.6) return;
    let target = null; for (let i = 1; i < st.players.length; i++) { const p = st.players[(me.id + i) % st.players.length]; if (p.alive) { target = p; break; } }
    if (!target) return;
    if (sendLoad(st, target.id) > 0.85) return; // their corridor is already full
    const surplus = pl.gold - reserve - 40;
    if (surplus <= 0) return;
    // spend a share of the surplus; a bit more while the target is mid-wave
    // a big bank does nothing for you: late in a match, pour it into sends (and send levels)
    const rich = surplus > 1500 + pl.wave * 60;
    const budget = surplus * (rich ? Math.max(0.6, L.sendShare) : L.sendShare) * (target.waveActive ? 1.5 : 1);
    if (rich && rnd() < 0.5) {
      const ups = Object.keys(cat).filter((t) => (pl.sendLevels[t] || 1) < DB.SEND_MAX_LEVEL && cat[t].tier <= L.maxTier && upOf(t, pl.sendLevels[t] || 1) < surplus * 0.5);
      if (ups.length) { const t = me.fav && ups.includes(me.fav) ? me.fav : ups[Math.floor(rnd() * ups.length)]; q2({ type: "UpgradeSend", player: me.id, enemyType: t }); return; }
    }
    const tiers = st.bal.sendTiers;
    const ts = corridorStock(st, target.corridors[0]);
    const usable = Object.keys(cat).filter((t) => {
      const s = cat[t]; if (s.tier > L.maxTier) return false;
      const d = st.bal.enemies[t]; const tt = (d && d.x && d.x.t) || {};
      const m = st.x;
      if ((m.noFlyers && tt.fly) || (m.noStealth && (tt.invisible || tt.cloakCycle || tt.cloakAura))) return false;
      if (m.sendStock && tiers && tiers[s.tier]) { if (st.tick < tiers[s.tier].unlockTicks) return false; const sk = pl.sendStock[t]; if (sk && sk.n <= 0) return false; }
      return true;
    });
    if (!usable.length) return;
    // occasionally level up the type it likes best
    if (rnd() < 0.12 && me.fav) {
      const lvl = pl.sendLevels[me.fav] || 1;
      if (lvl < DB.SEND_MAX_LEVEL && surplus > upOf(me.fav, lvl) * 2.2) { q2({ type: "UpgradeSend", player: me.id, enemyType: me.fav }); return; }
    }
    let pick = null, pv = 0;
    for (const t of usable) {
      const lvl = pl.sendLevels[t] || 1, c = costOf(t, lvl);
      if (c > budget) continue;
      const d = st.bal.enemies[t]; const tt = (d && d.x && d.x.t) || {};
      let v = (d.hp / 65536) * (cat[t].count || 1) * Math.pow(DB.RULES.TUNE.scaling.damagePerLevel + 1.6, lvl - 1) / c;
      if (L.skill > 0.8 && ts.n) {
        if (tt.fly && ts.air < ts.all * 0.4) v *= 2.2;
        if ((tt.invisible || tt.cloakAura) && ts.det === 0) v *= 2.5;
        if ((cat[t].count || 1) >= 4) v *= 1.2;
      }
      v *= 0.8 + rnd() * 0.4;
      if (v > pv) { pv = v; pick = t; }
    }
    if (pick) { me.fav = pick; q2({ type: "SendEnemy", player: me.id, target: 0, enemyType: pick }); }
  }
  let q2 = () => {};

  me.tick = (st, clock, queue) => {
    if (clock < me.nextAt) return;
    me.nextAt = clock + L.act[0] + rnd() * (L.act[1] - L.act[0]);
    q2 = queue;
    act(st, queue);
  };
  return me;
}

export default { createNpc, NPC_LEVELS };
