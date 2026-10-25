/* =============================================================================
 * Skyhold TD — app/main.js
 * THE SHELL ORCHESTRATOR, ported from Circle-TD's app/main.js. Same responsibilities and the same flow:
 * boot, wire input to COMMANDS, run the fixed-timestep loop, drive the solo sim, autosave after every
 * wave, Continue, Save/Import/Export, the end screen and mastery, and the offline Vs-NPC bots (they only
 * ever emit commands). It is the ONLY place local actions turn into commands; it never mutates sim state.
 *
 * Skyhold differences: the 3D renderer (one world, camera fly-ins), touch/mouse gestures for an
 * orthographic camera, synthesized SFX, and multiplayer (Co-op / Compete) parked for later — the sim
 * still supports both, only the network lobby is not wired yet.
 * ===========================================================================*/
import * as fx from "../sim/fx.js";
import { createState, step, SIM_HZ, findBuildSpot } from "../sim/core.js";
import { AFFIXES, generateWaveExpanded, generateChallengeWave } from "../sim/waves.js";
import { extendDB, MOB_BY_ID, CHALLENGES, BUILDER_SKINS, mobTier } from "../content/mobs.js";
import { buildBalance } from "../sim/balance.js";
import { hashContent, hashState } from "../sim/hash.js";
import * as C from "../net/commands.js";
import { createLoop } from "./loop.js";
import { createRenderer } from "../render/renderer.js";
import { towerThumb, enemyThumb, warmThumbs } from "../render/thumbs.js";
import { createUI } from "../ui/shell.js";
import { icon, sigil, setIconDB } from "../ui/icons.js";
import { createSound } from "../audio/sound.js";

const $ = (id) => document.getElementById(id);
const DB = window.DB;
const SaveSystem = window.SaveSystem;
const RUN_KEY = "skyhold_run_v2";
setIconDB(DB);
extendDB(DB); // the expanded bestiary, send tiers, challenges and builder skins (content/mobs.js)

const bal = buildBalance(DB);
DB.contentHash = hashContent(DB);
const SIM_DT = fx.fromFloat(1 / SIM_HZ);
// ?unlock — a testing switch: treat every element as fully mastered (does not touch your saved progress)
const UNLOCK_ALL = new URLSearchParams(location.search).has("unlock");

// ---- shell state (NOT the sim state) ---------------------------------------
const game = {
  state: null, me: 0,
  screen: "loading", view: "world", activeCorridor: 0,
  speed: 1, clock: 0,
  mode: "loop", gameMode: "solo",
  selectedTowerId: null, selectedEnemyId: null, buildTile: null, buildMenuOpen: false, buildSpot: null, buildPreview: null,
  driver: null, paused: false,
  autoWave: false, autoT: null,
  spectate: false, replay: null, recLog: null, runCfg: null, anonymous: false, skin: "element",
};
// ---- Skyhold progress beyond Circle's mastery: matches played, challenges, builder skins -----------
const XMETA_KEY = "skyhold_xmeta_v1";
let xmeta = { played: 0, wins: 0, challenges: {}, skin: "element" };
try { Object.assign(xmeta, JSON.parse(localStorage.getItem(XMETA_KEY)) || {}); } catch (e) { /* fine */ }
function saveXMeta() { try { localStorage.setItem(XMETA_KEY, JSON.stringify(xmeta)); } catch (e) { /* fine */ } }
function skinUnlocked(sk) {
  const u = sk.unlock; if (!u) return true;
  if (UNLOCK_ALL) return true;
  if (u.played) return xmeta.played >= u.played;
  if (u.wins) return xmeta.wins >= u.wins;
  if (u.challenge) return !!(xmeta.challenges[u.challenge] && xmeta.challenges[u.challenge].normal);
  if (u.allHard) return CHALLENGES.every((c) => xmeta.challenges[c.id] && xmeta.challenges[c.id].hard);
  return false;
}
function challengesOpen() { return UNLOCK_ALL || (meta.totalWins || 0) > 0 || xmeta.wins > 0; }
let meta = SaveSystem ? SaveSystem.loadMeta() : { mastery: {} };
let renderer, ui, loop;
const sound = createSound();

function masteryLevel(el) { return UNLOCK_ALL ? 5 : ((meta.mastery && meta.mastery[el]) || 0); }
function masteryMap() { if (!UNLOCK_ALL) return meta.mastery || {}; const m = {}; for (const e of DB.ELEMENT_ORDER) m[e] = 5; return m; }
function isVersus() { return game.gameMode === "versus"; }
function fieldId() { return game.gameMode === "coop" ? 0 : (isVersus() ? game.activeCorridor : game.me); }
function fieldPlayer() { return game.state.players[fieldId()]; }
function myPlayer() { return game.state.players[game.me]; }
function seatName(i) { return i === game.me ? "You" : (game.anonymous ? "Rival " + i : "NPC " + i); }
function localSimMode() { return game.gameMode === "solo" || game.gameMode === "versus"; }

// the view object the renderer + ui read (player resolves live) — same shape as Circle's
const view = {
  get state() { return game.state; }, get me() { return game.me; },
  get versus() { return game.gameMode === "versus"; },
  get player() { return game.state.players[game.me]; },
  get fieldId() { return fieldId(); },
  get field() { return game.state.players[fieldId()]; },
  get screen() { return game.screen; }, get view() { return game.view; },
  get activeCorridor() { return game.activeCorridor; },
  get time() { return game.clock; }, get speed() { return game.speed; },
  get selectedTowerId() { return game.selectedTowerId; }, set selectedTowerId(x) { game.selectedTowerId = x; },
  get selectedEnemyId() { return game.selectedEnemyId; }, set selectedEnemyId(x) { game.selectedEnemyId = x; },
  get buildTile() { return game.buildTile; }, set buildTile(x) { game.buildTile = x; },
  get buildMenuOpen() { return game.buildMenuOpen; }, set buildMenuOpen(x) { game.buildMenuOpen = x; },
  get buildSpot() { return game.buildSpot; }, set buildSpot(x) { game.buildSpot = x; },
  get buildPreview() { return game.buildPreview; }, set buildPreview(x) { game.buildPreview = x; },
  get builderSkin() { return game.skin || "element"; },
  get spectate() { return game.spectate; },
  get anonymous() { return game.anonymous; },
};

// ---- command emitters (solo applies on the next tick) -------------------------
function emit(c) {
  if (!game.driver || game.spectate) return;
  if (c.player == null) c.player = game.me;
  if (c.masteryLevel == null && (c.type === "BuildTower" || c.type === "MutateTower")) {
    const corr = fieldPlayer().corridors[c.corridorId];
    c.masteryLevel = corr ? masteryLevel(corr.element) : 5;
  }
  game.driver.queue(c);
}
const cmd = {
  build: (corridorId, gx, gy, towerType) => emit(C.buildTower(game.me, corridorId, gx, gy, towerType, masteryLevel(fieldPlayer().corridors[corridorId].element))),
  sell: (corridorId, towerId) => emit(C.sellTower(game.me, corridorId, towerId)),
  upgrade: (corridorId, towerId) => emit(C.upgradeTower(game.me, corridorId, towerId)),
  mutate: (corridorId, towerId, mutId) => emit(C.mutateTower(game.me, corridorId, towerId, mutId, masteryLevel(fieldPlayer().corridors[corridorId].element))),
  startWave: () => emit(C.startWave(game.me)),
  send: (target, enemyType) => emit(C.sendEnemy(game.me, target, enemyType)),
  setTarget: (corridorId, towerId, mode) => emit(C.setTargetMode(game.me, corridorId, towerId, mode)),
  upgradeSend: (enemyType) => emit(C.upgradeSend(game.me, enemyType)),
  sendAuto: (enemyType) => {
    if (isVersus()) { emit(C.sendEnemy(game.me, 0, enemyType)); return; }
    const n = game.state.players.length;
    for (let i = 1; i < n; i++) { const idx = (game.me + i) % n; if (game.state.players[idx].alive) { emit(C.sendEnemy(game.me, idx, enemyType)); return; } }
  },
};

// ---------------------------------------------------------------------------
// DRIVER — solo (local). The lockstep/multiplayer driver comes with multiplayer.
// ---------------------------------------------------------------------------
function makeSoloDriver(state) {
  let pending = [];
  return {
    queue(c) { pending.push(c); },
    tick() {
      const cmds = pending; pending = [];
      const ordered = C.orderCommands(cmds);
      if (ordered.length && game.recLog && game.recLog.length < 60000) game.recLog.push({ t: state.tick + 1, c: C.serialize(ordered) });
      step(state, ordered, SIM_DT);
      afterTick(state);
    },
  };
}
// replays re-run the sim from its seed and the recorded commands
function makeReplayDriver(state, log) {
  let idx = 0;
  return {
    queue() { /* spectators never emit */ },
    tick() {
      const t = state.tick + 1;
      let cmds = [];
      while (idx < log.length && log[idx].t < t) idx++;
      while (idx < log.length && log[idx].t === t) { cmds = cmds.concat(C.deserialize(log[idx].c)); idx++; }
      step(state, cmds, SIM_DT);
      afterTick(state);
      if (game.replay && state.tick === game.replay.ticks) {
        game.paused = true;
        const ok = game.replay.hash == null || hashState(state) === game.replay.hash;
        ui.toast(ok ? "Replay finished — verified identical to the original match" : "Replay finished — it drifted from the original (made with another version?)", ok ? "gold" : "warn");
        refreshReplayBar();
      }
    },
  };
}
function afterTick(state) {
  renderer.snapshotPositions(state);
  if (state.events && state.events.length) {
    renderer.onEvents(state.events);
    for (const ev of state.events) handleEvent(ev);
  }
}

const synergyToastAt = {};
function handleEvent(ev) {
  const mine = ev.player === game.me || ev.from === game.me;
  if (ev.kind === "zap") { if (ev.player === fieldId()) sound.play("zap"); return; }
  if (ev.kind === "kill") { if (ev.player === fieldId() || isVersus()) sound.play(ev.boss ? "bossKill" : "kill"); return; }
  if (!mine && game.gameMode !== "coop") {
    if (ev.kind === "sent" && ev.to === game.me) ui.toast("⚠ Enemies incoming" + (isVersus() && ev.from != null ? " from " + seatName(ev.from) : "") + "!", "warn");
    if (isVersus() && ev.kind === "defeat") { ui.toast("☠ " + seatName(ev.player) + " has fallen!"); ui.updateEnemyOverview(); }
    return;
  }
  if (ev.kind === "sent" && ev.from === game.me) { ui.toast("⚔ Sent " + (ev.count > 1 ? ev.count + "× " : "") + ev.type + " (Lv" + (ev.level || 1) + ")"); ui.updateTopBar(); return; }
  if (ev.kind === "sendLevel") { ui.toast("⬆ " + ev.type + " sends upgraded to Lv" + ev.level); ui.updateTopBar(); return; }
  if (ev.kind === "leak" && isVersus()) { flash(); sound.play("life"); ui.updateTopBar(); return; }
  if (ev.kind === "steal") {
    if (ev.to === game.me) { ui.toast("❤ +" + ev.n + " — stole a life from " + seatName(ev.from), "gold"); sound.play("steal"); }
    else if (ev.from === game.me) ui.toast("💔 " + seatName(ev.to) + " stole a life from you", "warn");
    ui.updateTopBar(); return;
  }
  switch (ev.kind) {
    case "wave": {
      game.autoT = null;
      const affix = ev.affix && AFFIXES[ev.affix];
      ui.updateTopBar(); ui.updateWavePanel();
      ui.toast(ev.boss ? ("⚠ Wave " + ev.wave + " — BOSS WAVE") : ("Wave " + ev.wave + (affix ? ` — ${affix.icon} ${affix.name} (${affix.desc})` : " incoming")), ev.boss ? "boss" : "");
      sound.play(ev.boss ? "boss" : "wave");
      break;
    }
    case "earlyBonus": ui.toast("⚡ Early call! +" + ev.bonus, "gold"); ui.updateTopBar(); break;
    case "synergy": {
      const now = Date.now();
      const key = ev.id || ev.name;
      if (!synergyToastAt[key] || now - synergyToastAt[key] > 4000) { synergyToastAt[key] = now; ui.toast("⚗ " + ev.name + "!", "syn"); sound.play("synergy"); }
      break;
    }
    case "reject": { const M = { funds: (game.state.economy === "shared" ? "Not enough gold." : "Not enough essence."), noRoom: "No room — towers need 3×3 space and can’t fully block the path.", needMax: "Reach max level to mutate.", noSlots: "No mutation slots — raise Mastery.", locked: "That send tier hasn't unlocked yet.", stock: "Out of stock — it's recharging.", rule: "Not allowed by this match's rules.", busy: "That tower is still being built or upgraded." }; ui.toast(M[ev.reason] || "Cannot do that here.", "warn"); sound.play("reject"); break; }
    case "waveClear":
      ui.toast(`Wave ${ev.wave} cleared! +${ev.bonus}`, "gold");
      sound.play("clear");
      if (ev.autosave) autosave();
      if (game.autoWave && myPlayer().phase === "build") game.autoT = 5;
      ui.updateTopBar(); ui.updateWavePanel(); ui.updateEnemyOverview(); break;
    case "prep": ui.toast("Final wave cleared! Summon the End Boss from the Vortex.", "boss"); ui.updateWavePanel(); break;
    case "endboss": ui.toast("THE SEALED ONE awakens!", "boss"); sound.play("boss"); ui.updateWavePanel(); break;
    case "life": ui.updateTopBar(); flash(); sound.play("life"); break;
    case "victory": endScreen(true); break;
    case "defeat": endScreen(false); break;
    case "built": break;
  }
}

// ---------------------------------------------------------------------------
// SCREENS
// ---------------------------------------------------------------------------
function showScreen(s) {
  game.screen = s;
  ["loading", "menu", "setup", "game"].forEach((x) => { const el = $("screen-" + x); if (el) el.classList.toggle("active", x === s); });
  if (s !== "game") { game.spectate = false; game.replay = null; document.body.dataset.spectate = ""; }
  document.body.dataset.screen = s;
  sound.playMusic(s !== "loading");
  if (s === "menu") { renderer.previewRing(DB.ELEMENT_ORDER.slice(), "menu"); renderer.setMode("menu"); }
  applyDock();
}

// collapsible dock + floating wave button (Circle)
const DOCK_KEY = "skyhold_dock_v1";
let dockCollapsed = false;
function loadDockPref() { try { dockCollapsed = localStorage.getItem(DOCK_KEY) === "1"; } catch (e) { /* fine */ } }
function applyDock() {
  const d = $("quick-wave-controls"); if (d) d.classList.toggle("collapsed", dockCollapsed);
  const h = $("dock-handle"); if (h) h.innerHTML = dockCollapsed ? "▴" : "▾";
  const f = $("wave-fab"); if (f) f.style.display = (dockCollapsed && game.screen === "game") ? "" : "none";
}
function refreshWaveFab() {
  const f = $("wave-fab"); if (!f || f.style.display === "none" || !game.state) return;
  const pl = myPlayer();
  let txt;
  if (game.autoT != null) txt = "⟳" + Math.max(1, Math.ceil(game.autoT));
  else if (pl.phase === "prep") txt = "☠";
  else if (pl.phase === "endboss") txt = "…";
  else txt = "▶" + (game.state.mode === "endless" ? (pl.wave + 1) : Math.min(pl.wave + 1, pl.totalWaves));
  if (f.textContent !== txt) f.textContent = txt;
  f.classList.toggle("disabled", pl.phase === "endboss");
}
function refreshMenu() {
  const c = $("btn-continue"); if (c) c.classList.toggle("disabled", !hasRun());
  const ch = $("btn-challenges"); if (ch) { ch.classList.toggle("locked", !challengesOpen()); }
  const rp = $("btn-replays"); if (rp) rp.querySelector("i") && (rp.querySelector("i").textContent = String(loadReplays().length));
  const sub = $("menu-progress");
  if (sub) {
    const avail = DB.availableElements(masteryMap());
    sub.innerHTML = DB.ELEMENT_ORDER.map((e) => `<span class="mp-el ${avail.includes(e) ? "" : "off"}" title="${DB.ELEMENTS[e].name} · Mastery ${masteryLevel(e)}">${sigil(e, "sm")}<i>${masteryLevel(e)}</i></span>`).join("");
  }
}

// ---------------------------------------------------------------------------
// SETUP -> START RUN
// ---------------------------------------------------------------------------
const setup = { mode: "loop", corridors: 4, economy: "shared", status: "standard", gameMode: "solo", pacing: "manual", elements: [],
  ruleset: "expanded", difficulty: "normal",
  mods: { lifeSteal: true, sendStock: true, builders: true, noFlyers: false, noDisruptors: false, noStealth: false, turbo: false, randomLanes: false, anonymous: false, doppel: false, goldMult: 1, livesMult: 1 } };
const DIFFICULTY = {
  easy: { incomeMult: 0.75, goldBonus: 0, act: [2.2, 3.0], towers: 14, up: 0.25, maxTier: 2, aggro: 0.3, counter: false, label: "Easy" },
  normal: { incomeMult: 1.0, goldBonus: 0, act: [1.4, 2.0], towers: 20, up: 0.45, maxTier: 3, aggro: 0.55, counter: false, label: "Normal" },
  hard: { incomeMult: 1.25, goldBonus: 100, act: [1.0, 1.4], towers: 24, up: 0.6, maxTier: 4, aggro: 0.75, counter: true, label: "Hard" },
  insane: { incomeMult: 1.5, goldBonus: 250, act: [0.7, 1.0], towers: 26, up: 0.7, maxTier: 4, aggro: 0.9, counter: true, label: "Insane" },
};
function openSetup() {
  const avail = DB.availableElements(masteryMap());
  setup.elements = []; for (let i = 0; i < 8; i++) setup.elements.push(avail[i % avail.length]);
  if (setup.gameMode !== "solo" && setup.gameMode !== "versus") setup.gameMode = "solo";
  setup._lastTouched = "gamemode";
  showScreen("setup");
  renderer.setMode("setup");
  ui.renderSetup(setup, avail); updateGameModeButtons();
}
// the setup preview is the real world: rebuild the ring as the options change
function setupPreview(s, sel) {
  const vs = s.gameMode === "versus";
  const n = vs ? s.corridors : (s.mode === "single" ? 1 : s.corridors);
  let els;
  if (vs) { const mine = s.elements[0]; const rest = DB.ELEMENT_ORDER.filter((e) => e !== mine); els = [mine]; for (let i = 1; i < n; i++) els.push(rest[(i - 1) % rest.length]); }
  else els = s.elements.slice(0, n);
  renderer.previewRing(els, "setup:" + els.join(","));
  setupSel = sel;
}
let setupSel = 0;

function startRun(cfg, seed, replay) {
  game.gameMode = cfg.gameMode || "solo";
  game.mode = cfg.mode;
  const ruleset = cfg.ruleset || "expanded";
  const mods = ruleset === "expanded" ? Object.assign({}, setup.mods, cfg.mods || {}) : {};
  const diff = DIFFICULTY[cfg.difficulty || "normal"] || DIFFICULTY.normal;
  let players, mode = cfg.mode, economy = cfg.economy;
  if (replay) {
    // a replay re-creates the exact recorded match
    game.state = null;
  } else if (game.gameMode === "versus") {
    const seats = Math.max(3, Math.min(8, cfg.corridors || 4));
    let mine = cfg.elements[0] || "fire";
    const pool = DB.ELEMENT_ORDER.filter((e) => e !== mine);
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    if (mods.randomLanes) { const all = DB.ELEMENT_ORDER.slice(); mine = all[Math.floor(Math.random() * all.length)]; }
    players = [{ corridorCount: 1, elements: [mine] }];
    for (let i = 0; i < seats - 1; i++) {
      const el = mods.doppel ? mine : (mods.randomLanes ? DB.ELEMENT_ORDER[Math.floor(Math.random() * 8)] : pool[i % pool.length]);
      players.push({ corridorCount: 1, elements: [el], incomeMult: ruleset === "expanded" ? diff.incomeMult : 1, goldBonus: ruleset === "expanded" ? diff.goldBonus : 0 });
    }
    mode = "endless"; economy = "shared"; game.mode = "endless";
  } else {
    const corridorCount = cfg.challenge ? 1 : (cfg.mode === "single" ? 1 : cfg.corridors);
    players = [{ corridorCount, elements: cfg.elements.slice(0, corridorCount) }];
    if (cfg.challenge) mode = "loop";
  }
  const stateCfg = replay ? replay.cfg : { seed: seed != null ? seed : ((Math.random() * 1e9) | 0), mode, gameMode: game.gameMode, economy, statusMode: cfg.status, players, ruleset, mods, challenge: cfg.challenge || null };
  game.state = createState(bal, structuredClone(stateCfg));
  game.runCfg = { ...cfg, ruleset, mods, stateCfg };
  game.recLog = replay ? null : [];
  game.replay = replay ? { ...replay } : null;
  game.spectate = !!replay;
  game.anonymous = !!(mods.anonymous && game.gameMode === "versus");
  game.skin = xmeta.skin || "element";
  game.difficulty = cfg.difficulty || "normal";
  document.body.dataset.spectate = replay ? "replay" : "";
  game.me = 0; game.speed = 1; game.clock = 0; game.paused = false;
  game.view = "world"; game.activeCorridor = 0;
  game.selectedTowerId = game.selectedEnemyId = game.buildTile = null; game.buildPreview = null;
  game.autoWave = cfg.pacing === "auto"; game.autoT = null; refreshAutoBtn();
  game.driver = replay ? makeReplayDriver(game.state, replay.log) : makeSoloDriver(game.state);
  if (!replay) setupBots(); else bots = [];
  setupSendButton();
  showScreen("game");
  ui.closeAllPanels();
  renderer.render(view, 1);       // builds the ring for this run
  setView("world", false);
  ui.updateTopBar(); ui.updateEnemyOverview(); ui.updateWavePanel();
  if (replay) ui.toast("Watching replay — " + (replay.title || ""));
  else if (game.state.challenge) ui.toast("Challenge: " + game.state.challenge.def.name + (game.state.challenge.hard ? " (Hard)" : ""), "boss");
  else ui.toast("Build your defenses, then start the wave.");
  sound.play("whoosh");
  warmThumbs(DB, DB.TOWERS.map((t) => t.id));
  refreshReplayBar();
  if (!replay) { xmeta.played = (xmeta.played || 0) + 1; saveXMeta(); }
  return stateCfg.seed;
}

// ---------------------------------------------------------------------------
// AUTOSAVE + CONTINUE (Circle's format; Skyhold's own key)
// ---------------------------------------------------------------------------
function serializeRun() {
  const s = game.state, pl = s.players[game.me];
  return {
    v: 2, seed: s.seedBase, mode: s.mode, gameMode: "solo", economy: s.economy, statusMode: s.statusMode, ruleset: s.ruleset, mods: game.runCfg && game.runCfg.mods,
    corridorCount: pl.corridorCount, elements: pl.elements.slice(),
    pacing: game.autoWave ? "auto" : "manual",
    gold: pl.gold, essence: Object.assign({}, pl.essence), lives: pl.lives, wave: pl.wave, phase: pl.phase,
    stats: Object.assign({}, pl.stats),
    corridors: pl.corridors.map((c) => ({ towers: c.towers.map((t) => ({ defId: t.def.id, c: t.c, r: t.r, level: t.level, expert: t.expert, kills: t.kills, mutations: t.mutations.slice(), targetMode: t.targetMode || "first" })), spawnedTotal: c.spawnedTotal })),
  };
}
function autosave() { if (game.gameMode !== "solo") return; try { localStorage.setItem(RUN_KEY, JSON.stringify(serializeRun())); } catch (e) { /* fine */ } }
function hasRun() { try { return !!localStorage.getItem(RUN_KEY); } catch (e) { return false; } }
function continueRun() {
  let raw = null; try { raw = localStorage.getItem(RUN_KEY); } catch (e) { /* fine */ }
  if (!raw) return;
  let d; try { d = JSON.parse(raw); } catch (e) { return; }
  restoreRun(d);
}
function restoreRun(d) {
  startRun({ mode: d.mode, corridors: d.corridorCount, economy: d.economy, status: d.statusMode, gameMode: "solo", pacing: d.pacing || "manual", elements: d.elements, ruleset: d.ruleset || "classic", mods: d.mods || {} }, d.seed);
  const pl = game.state.players[0];
  pl.lives = d.lives; pl.wave = d.wave; pl.phase = d.phase === "wave" || d.phase === "endboss" ? "build" : d.phase;
  pl.stats = Object.assign(pl.stats, d.stats || {});
  // Circle's approach: flood funds, replay Build commands (the sim validates placement), then restore
  pl.gold = 1e9; for (const k in pl.essence) pl.essence[k] = 1e9;
  d.corridors.forEach((cd, ci) => { cd.towers.forEach((t) => { emit(C.buildTower(0, ci, t.c + 1, t.r + 1, t.defId, 5)); }); });
  game.driver.tick();
  game.recLog = null; // a restored run can't be replayed from its seed
  for (const corr of pl.corridors) { for (const t of corr.towers) { t.bState = 0; t.bT = 0; } if (corr.builder) { corr.builder.queue.length = 0; corr.builder.cur = 0; } }
  pl.gold = d.gold; pl.essence = Object.assign(pl.essence, d.essence);
  d.corridors.forEach((cd, ci) => { const corr = pl.corridors[ci]; cd.towers.forEach((tDef, i) => { const tw = corr.towers[i]; if (!tw) return; tw.level = tDef.level; tw.expert = tDef.expert; tw.kills = tDef.kills; tw.mutations = tDef.mutations.slice(); tw.targetMode = tDef.targetMode || "first"; }); });
  ui.updateTopBar(); ui.updateEnemyOverview(); ui.updateWavePanel();
  ui.toast("Run loaded");
}

// ---------------------------------------------------------------------------
// VIEW NAV
// ---------------------------------------------------------------------------
function setView(v, instant) {
  game.view = v; ui.closeAllPanels();
  const nav = $("field-nav"); if (nav) nav.classList.toggle("show", v === "field");
  const ov = $("enemy-overview"); if (ov) ov.classList.toggle("show", v === "world");
  document.body.dataset.view = v;
  if (v === "field") { updateCorridorName(); renderer.enterField(game.activeCorridor, instant); }
  else renderer.setMode("world", instant);
  sound.play("whoosh");
}
function corridorNavCount() { return isVersus() ? game.state.players.length : fieldPlayer().corridorCount; }
function enterCorridor(i) {
  game.activeCorridor = i;
  if (game.view === "field") { ui.closeAllPanels(); updateCorridorName(); renderer.enterField(i); sound.play("whoosh"); }
  else setView("field");
  ui.updateTopBar();
}
function updateCorridorName() {
  const nm = $("corridor-name"); if (!nm) return;
  if (isVersus()) {
    const p = game.state.players[game.activeCorridor]; if (!p) return;
    const el = DB.ELEMENTS[p.elements[0]];
    nm.innerHTML = `${sigil(p.elements[0], "sm")} ${seatName(game.activeCorridor)}${p.alive ? "" : " ☠"} — ${el.name}`;
    return;
  }
  const corr = fieldPlayer().corridors[game.activeCorridor]; if (!corr) return;
  const el = DB.ELEMENTS[corr.element]; nm.innerHTML = `${sigil(corr.element, "sm")} ${el.name} Corridor`;
}
function flash() { const o = $("screen-flash"); if (!o) return; o.classList.add("flash"); setTimeout(() => o.classList.remove("flash"), 200); }

// ---------------------------------------------------------------------------
// INPUT — taps (Circle's onCanvasClick), drag-pan, pinch / wheel zoom
// ---------------------------------------------------------------------------
function towerAt(corr, c, r) { const S = DB.CONFIG.towerSize; for (const t of corr.towers) if (c >= t.c && c < t.c + S && r >= t.r && r < t.r + S) return t; return null; }
function onTap(px, py) {
  if (game.screen === "setup") {
    const h = renderer.pick(px, py, view);
    if (h && (h.kind === "gate")) ui.selectSetupNode(h.index, setup, DB.availableElements(masteryMap()));
    return;
  }
  if (game.screen !== "game" || !game.state || renderer.flying) return;
  const pl = fieldPlayer();
  if (game.view === "world") {
    const h = renderer.pick(px, py, view);
    if (!h) return;
    if (h.kind === "vortex") {
      const fp = isVersus() ? myPlayer() : pl;
      if (fp.phase === "prep") { cmd.startWave(); return; }
      ui.toast("The Vortex awaits — clear every wave to summon the End Boss.");
      return;
    }
    if (h.kind === "gate") { enterCorridor(h.index); return; }
    return;
  }
  const h = renderer.pick(px, py, view);
  if (!h) { ui.closeAllPanels(); return; }
  const corr = pl.corridors[isVersus() ? 0 : game.activeCorridor];
  const ownField = !isVersus() || game.activeCorridor === game.me;
  if (h.enemyId != null) { const e = game.state.enemies.find((x) => x.id === h.enemyId); if (e) { ui.openEnemyPanel(e); sound.play("click"); return; } }
  const c = h.c, r = h.r, G = game.state.grid;
  if (c < 0 || r < 0 || c >= G.cols || r >= G.rows) { ui.closeAllPanels(); return; }
  if (!ownField) { ui.closeAllPanels(); return; }
  const cell = corr.grid[r * G.cols + c];
  if (cell === 2) { const tw = towerAt(corr, c, r); if (tw) { ui.openTowerRing(corr, tw, px, py); sound.play("click"); return; } }
  if (cell === 0) {
    game.buildSpot = findBuildSpot(game.state, fieldId(), corr.index, c, r);
    if (game.buildSpot) { ui.openBuildRing(corr, { c, r }, px, py); sound.play("click"); return; }
    ui.toast("No room — towers need 3×3 space and can’t fully block the path.", "warn"); sound.play("reject");
  }
  ui.closeAllPanels();
}
function bindPointer() {
  const cv = $("world-canvas");
  const pts = new Map();
  let drag = null, pinch = null, moved = false;
  cv.addEventListener("pointerdown", (e) => {
    sound.unlock();
    cv.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) { drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY }; moved = false; }
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) }; drag = null; moved = true; }
  });
  cv.addEventListener("pointermove", (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pts.size >= 2) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.d > 0) renderer.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinch.d);
      pinch.d = d;
      ui.closeRing();
      return;
    }
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 9) { moved = true; if (game.view === "field") ui.closeRing(); }
    if (moved && game.screen === "game" && game.view === "field") renderer.panBy(dx, dy);
    drag.x = e.clientX; drag.y = e.clientY;
  });
  const end = (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (pts.size === 0) { if (drag && !moved) onTap(e.clientX, e.clientY); drag = null; }
  };
  cv.addEventListener("pointerup", end);
  cv.addEventListener("pointercancel", (e) => { pts.delete(e.pointerId); drag = null; pinch = null; });
  cv.addEventListener("wheel", (e) => {
    if (game.screen !== "game" || game.view !== "field") return;
    e.preventDefault();
    ui.closeRing();
    if (e.shiftKey) renderer.panBy(-e.deltaY * 0.5, 0);
    else if (e.ctrlKey || Math.abs(e.deltaY) < 40) renderer.zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.01));
    else renderer.zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 0.89);
  }, { passive: false });
  cv.addEventListener("contextmenu", (e) => e.preventDefault());
  // hover preview on desktop: the 3×3 footprint follows the mouse while nothing is open
  cv.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse" || pts.size || game.screen !== "game" || game.view !== "field" || ui.ringOpen || !game.state) return;
    const h = renderer.pick(e.clientX, e.clientY, view);
    const corr = fieldPlayer().corridors[isVersus() ? 0 : game.activeCorridor];
    const own = !isVersus() || game.activeCorridor === game.me;
    if (!h || !own || h.c < 0 || h.r < 0 || h.c >= game.state.grid.cols || h.r >= game.state.grid.rows || corr.grid[h.r * game.state.grid.cols + h.c] !== 0) { if (!game.selectedTowerId) { game.buildMenuOpen = false; game.buildSpot = null; } return; }
    game.buildSpot = findBuildSpot(game.state, fieldId(), corr.index, h.c, h.r);
    game.buildMenuOpen = !!game.buildSpot; game.buildPreview = null;
  });
}

// ---------------------------------------------------------------------------
// END SCREEN
// ---------------------------------------------------------------------------
function endScreen(win) {
  if (game.replay) return; // replays just play out
  const pl = game.state.players[game.me];
  let unlockMsgs = [];
  if (SaveSystem && !game.state.challenge) {
    const proxy = { mode: game.mode, elements: pl.elements, wave: pl.wave, totalWaves: pl.totalWaves, score: pl.stats.score };
    try { if (win) unlockMsgs = SaveSystem.recordVictory(meta, proxy) || []; else SaveSystem.recordDefeat(meta, proxy); SaveSystem.saveMeta(meta); } catch (e) { /* fine */ }
  }
  // Skyhold progress: wins, challenges, builder skins
  const skinsBefore = BUILDER_SKINS.filter(skinUnlocked).map((k) => k.id);
  if (win) xmeta.wins = (xmeta.wins || 0) + 1;
  const ch = game.state.challenge;
  if (win && ch) { const c = xmeta.challenges[ch.id] || (xmeta.challenges[ch.id] = {}); c.normal = true; if (ch.hard) c.hard = true; }
  saveXMeta();
  for (const k of BUILDER_SKINS) if (skinUnlocked(k) && !skinsBefore.includes(k.id)) unlockMsgs.push("Builder skin unlocked: " + k.name);
  try { localStorage.removeItem(RUN_KEY); } catch (e) { /* fine */ }
  storeReplay(win ? "Victory" : "Defeat");
  sound.play(win ? "victory" : "defeat");
  const sc = $("end-screen"); if (!sc) return;
  sc.querySelector("#end-title").textContent = win ? (ch ? "CHALLENGE COMPLETE" : "VICTORY") : "DEFEAT";
  sc.querySelector("#end-title").className = win ? "win" : "lose";
  const eb = sc.querySelector("#end-endless"); if (eb) eb.style.display = (win && game.mode !== "endless" && !ch) ? "" : "none";
  const spb = $("end-spectate"); if (spb) spb.style.display = (!win && isVersus() && game.state.x && !game.state.finished) ? "" : "none";
  let html = `<div class="end-stat"><span>${icon("wave", "xs")} Waves</span><b>${pl.wave}</b></div><div class="end-stat"><span>${icon("skull", "xs")} Kills</span><b>${pl.stats.kills}</b></div><div class="end-stat"><span>${icon("trophy", "xs")} Bosses</span><b>${pl.stats.bossesKilled}</b></div><div class="end-stat"><span>${icon("star", "xs")} Score</span><b>${pl.stats.score}</b></div>`;
  if (win && !ch) {
    const seen = new Set();
    for (const eid of pl.elements) {
      if (seen.has(eid)) continue; seen.add(eid);
      const el = DB.ELEMENTS[eid]; if (!el) continue;
      const lvl = (meta.mastery && meta.mastery[eid]) || 0;
      const wins = (meta.elementWins && meta.elementWins[eid]) || 0;
      let prog;
      if (lvl >= 5) prog = "Mastery MAX";
      else if (lvl === 4) prog = "Reach Wave 100 → Mastery 5";
      else prog = wins + "/" + DB.MASTERY.winsRequired[lvl + 1] + " wins → Mastery " + (lvl + 1);
      html += `<div class="end-stat"><span>${sigil(eid, "xs")} ${el.name} +1 win</span><b>${prog}</b></div>`;
    }
  }
  if (unlockMsgs.length) html += `<div class="end-unlocks">${unlockMsgs.map((m) => `<span class="unlock">🎉 ${m}</span>`).join("")}</div>`;
  if (game.state.x) html += `<div class="end-stats-wrap">${statsHTML(game.state)}</div>`;
  const body = sc.querySelector("#end-body");
  body.innerHTML = html;
  bindStatsTabs(body);
  sc.classList.add("show");
  refreshMenu();
}

// ---- match stats: summary, leak report, towers, sends ---------------------------------
function fmtT(ticks) { const s = Math.floor(ticks / SIM_HZ); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }
function mobName(t) { return (DB.ENEMIES[t] && DB.ENEMIES[t].name) || t; }
function statsHTML(st) {
  const me = st.players[game.me], L = me.log;
  if (!L) return "";
  const tabs = [["sum", "Summary"], ["leaks", "Leaks"], ["towers", "Towers"], ["sends", "Sends"]];
  let h = `<div class="st-tabs">${tabs.map(([k, n], i) => `<button class="seg ${i ? "" : "sel"}" data-st="${k}">${n}</button>`).join("")}</div>`;
  // summary
  const killTop = Object.entries(L.kills).sort((a, b) => b[1] - a[1]).slice(0, 6);
  h += `<div class="st-pane show" data-pane="sum"><div class="st-grid">
    <div><span>Gold earned</span><b>${L.goldEarned}</b></div><div><span>Gold spent</span><b>${L.goldSpent}</b></div>
    <div><span>Lives lost</span><b>${L.livesLost}</b></div><div><span>Lives stolen</span><b>${L.livesStolen}</b></div>
    <div><span>Leaks</span><b>${L.leaks.length}</b></div><div><span>Match time</span><b>${fmtT(st.tick)}</b></div></div>
    <div class="st-sub">Most killed</div><div class="st-list">${killTop.map(([t, n]) => `<span class="st-chip"><img src="${enemyThumb(DB, t)}" alt="">${mobName(t)} ×${n}</span>`).join("") || "<span class='dim'>—</span>"}</div>`;
  if (isVersus()) {
    h += `<div class="st-sub">Seats</div><table class="st-table"><tr><th>Seat</th><th>Lives</th><th>Stolen</th><th>Kills</th><th>Sent</th></tr>`;
    st.players.forEach((p, i) => { const sent = p.log ? Object.values(p.log.sent).reduce((a, b) => a + b, 0) : 0; h += `<tr class="${p.alive ? "" : "dead"}"><td>${game.anonymous && i !== game.me ? "" : sigil(p.elements[0], "xs")} ${seatName(i)}</td><td>${p.alive ? p.lives : "☠"}</td><td>${p.log ? p.log.livesStolen : 0}</td><td>${p.stats.kills}</td><td>${sent}</td></tr>`; });
    h += `</table>`;
  }
  h += `</div>`;
  // leaks
  const agg = {};
  for (const l of L.leaks) { const a = agg[l.type] || (agg[l.type] = { n: 0, hp: 0 }); a.n++; a.hp += l.hp; }
  const aggTop = Object.entries(agg).sort((a, b) => b[1].n - a[1].n).slice(0, 8);
  h += `<div class="st-pane" data-pane="leaks">${L.leaks.length ? `<div class="st-sub">What got through</div><div class="st-list">${aggTop.map(([t, a]) => `<span class="st-chip"><img src="${enemyThumb(DB, t)}" alt="">${mobName(t)} ×${a.n} <em>avg ${Math.round(a.hp / a.n)}% HP</em></span>`).join("")}</div>
    <div class="st-sub">Every leak</div><table class="st-table"><tr><th>Time</th><th>Mob</th><th>HP left</th><th>Wave</th>${isVersus() ? "<th>Sent by</th>" : "<th>Corridor</th>"}</tr>${L.leaks.slice(-80).reverse().map((l) => `<tr><td>${fmtT(l.t)}</td><td>${mobName(l.type)}</td><td>${l.hp}%</td><td>${l.wave}</td><td>${isVersus() ? (l.from != null ? seatName(l.from) : "wave") : (l.corridor + 1)}</td></tr>`).join("")}</table>` : "<p class='dim'>Nothing leaked. Flawless.</p>"}</div>`;
  // towers
  const towers = [];
  for (const corr of me.corridors) for (const tw of corr.towers) towers.push(tw);
  towers.sort((a, b) => (b.dmgDone || 0) - (a.dmgDone || 0));
  const totalDmg = towers.reduce((a, t) => a + (t.dmgDone || 0), 0) || 1;
  h += `<div class="st-pane" data-pane="towers">${towers.length ? `<table class="st-table"><tr><th>Tower</th><th>Lv</th><th>Kills</th><th>Damage</th></tr>${towers.slice(0, 30).map((t) => `<tr><td>${sigil(t.def.element, "xs")} ${(DB.TOWER_BY_ID[t.def.id] || {}).name || t.def.id}</td><td>${t.level}</td><td>${t.kills}</td><td>${Math.round((t.dmgDone || 0) / 65536)} <em>${Math.round(((t.dmgDone || 0) / totalDmg) * 100)}%</em></td></tr>`).join("")}</table>` : "<p class='dim'>No towers standing.</p>"}</div>`;
  // sends
  const sent = Object.entries(L.sent).sort((a, b) => b[1] - a[1]);
  h += `<div class="st-pane" data-pane="sends">${sent.length ? `<div class="st-list">${sent.map(([t, n]) => `<span class="st-chip"><img src="${enemyThumb(DB, t)}" alt="">${mobName(t)} ×${n}</span>`).join("")}</div>` : "<p class='dim'>No sends this match.</p>"}${Object.keys(L.stolenBy).length ? `<div class="st-sub">Lives stolen from you</div><div class="st-list">${Object.entries(L.stolenBy).map(([k, n]) => `<span class="st-chip">${seatName(+k)} −${n}</span>`).join("")}</div>` : ""}</div>`;
  return h;
}
function bindStatsTabs(root) {
  root.querySelectorAll("[data-st]").forEach((b) => b.onclick = () => {
    root.querySelectorAll("[data-st]").forEach((x) => x.classList.toggle("sel", x === b));
    root.querySelectorAll("[data-pane]").forEach((p) => p.classList.toggle("show", p.dataset.pane === b.dataset.st));
  });
}
function openStats() {
  const m = $("stats-modal"); if (!m || !game.state) return;
  m.innerHTML = `<div class="modal wide glass"><button class="panel-close" id="stm-close">${icon("close")}</button><h2>Match Stats</h2>${game.state.x ? statsHTML(game.state) : "<p class='dim'>Detailed stats are tracked under the Expanded rules.</p>"}</div>`;
  bindStatsTabs(m);
  m.classList.add("show");
  $("stm-close").onclick = () => m.classList.remove("show");
}

// ---- replays --------------------------------------------------------------------------
const REPLAY_KEY = "skyhold_replays_v1";
function loadReplays() { try { return JSON.parse(localStorage.getItem(REPLAY_KEY)) || []; } catch (e) { return []; } }
function saveReplays(list) {
  for (let n = list.length; n >= 0; n--) {
    try { localStorage.setItem(REPLAY_KEY, JSON.stringify(list.slice(0, n))); return true; } catch (e) { /* storage full: keep fewer */ }
  }
  return false;
}
function replayTitle(st) {
  const pl = st.players[0];
  if (st.challenge) return st.challenge.def.name + (st.challenge.hard ? " (Hard)" : "");
  if (st.gameMode === "versus") return "Vs " + (st.players.length - 1) + " NPCs · " + DB.ELEMENTS[pl.elements[0]].name;
  return (st.mode === "single" ? "Single" : st.mode === "endless" ? "Endless" : "Loop") + " · " + pl.elements.map((e) => DB.ELEMENTS[e].name).join(", ");
}
function storeReplay(result) {
  if (!game.state || !game.recLog || !game.runCfg || game.replay || game.state.tick < 300 || game._storedReplay === game.state) return;
  game._storedReplay = game.state;
  const st = game.state;
  const rec = { id: Date.now().toString(36), date: new Date().toISOString(), title: replayTitle(st), result, ticks: st.tick, wave: st.players[0].wave,
    cfg: game.runCfg.stateCfg, log: game.recLog, version: DB.contentHash, gameMode: st.gameMode, hash: hashState(st) };
  const list = loadReplays(); list.unshift(rec);
  saveReplays(list.slice(0, 6));
}
function openReplays() {
  const m = $("replays-modal"); if (!m) return;
  const list = loadReplays();
  m.innerHTML = `<div class="modal wide glass"><button class="panel-close" id="rp-close">${icon("close")}</button><h2>Replays</h2>
    <p class="dim">Your last six matches are kept on this device. A replay re-runs the match from its seed and every command, so it plays back exactly.</p>
    <div class="rp-list">${list.length ? list.map((r, i) => `<div class="rp-row"><div class="rp-info"><b>${r.title}</b><span class="dim">${new Date(r.date).toLocaleString()} · ${fmtT(r.ticks)} · wave ${r.wave} · ${r.result}</span>${r.version !== DB.contentHash ? `<span class="warn">made with another game version — may play back differently</span>` : ""}</div>
      <button class="btn small primary" data-watch="${i}">Watch</button><button class="btn small" data-exp="${i}">Export</button><button class="btn small ghost" data-del="${i}">✕</button></div>`).join("") : "<p class='dim'>No replays yet — finish a match.</p>"}</div>
    <div class="sm-actions"><button class="btn" id="rp-import">⬆ Import replay file</button></div><input type="file" id="rp-file" accept=".json,application/json" hidden></div>`;
  m.classList.add("show");
  $("rp-close").onclick = () => m.classList.remove("show");
  m.querySelectorAll("[data-watch]").forEach((b) => b.onclick = () => { m.classList.remove("show"); watchReplay(list[+b.dataset.watch]); });
  m.querySelectorAll("[data-exp]").forEach((b) => b.onclick = () => { const r = list[+b.dataset.exp]; if (SaveSystem) SaveSystem.downloadText(JSON.stringify({ skyholdReplay: 1, ...r }), "skyhold-replay-" + r.id + ".json"); });
  m.querySelectorAll("[data-del]").forEach((b) => b.onclick = () => { list.splice(+b.dataset.del, 1); saveReplays(list); openReplays(); refreshMenu(); });
  $("rp-import").onclick = () => $("rp-file").click();
  $("rp-file").onchange = (e) => {
    const f = e.target.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => { try { const r = JSON.parse(rd.result); if (!r.skyholdReplay || !r.cfg || !r.log) throw new Error("not a Skyhold replay"); delete r.skyholdReplay; const l = loadReplays(); l.unshift(r); saveReplays(l.slice(0, 6)); openReplays(); refreshMenu(); ui.toast("Replay imported"); } catch (err) { ui.toast("Import failed: " + err.message, "warn"); } };
    rd.readAsText(f);
  };
}
function watchReplay(r) {
  const c = r.cfg;
  startRun({ gameMode: c.gameMode, mode: c.mode, economy: c.economy, status: c.statusMode, corridors: c.players[0].corridorCount, elements: c.players[0].elements, ruleset: c.ruleset, mods: c.mods, challenge: c.challenge, pacing: "manual" }, c.seed, r);
  game.speed = 2;
}
function refreshReplayBar() {
  const b = $("replay-bar"); if (!b) return;
  const on = !!(game.spectate && game.state);
  b.classList.toggle("show", on);
  if (!on) return;
  const st = game.state, tot = game.replay ? game.replay.ticks : 0;
  const html = `<button class="btn small" id="rb-play">${game.paused ? "▶" : "⏸"}</button><button class="btn small" id="rb-speed">×${game.speed}</button>
    <span class="rb-time">${game.replay ? "▶" : "👁"} ${fmtT(st.tick)}${tot ? " / " + fmtT(tot) : ""}</span>
    ${game.replay ? `<button class="btn small" id="rb-skip">+30s</button>` : ""}<button class="btn small" id="rb-stats">Stats</button><button class="btn small ghost" id="rb-exit">Exit</button>`;
  if (b._h !== html) {
    b.innerHTML = html; b._h = html;
    $("rb-play").onclick = () => { if (game.replay && st.tick >= game.replay.ticks) return; game.paused = !game.paused; refreshReplayBar(); };
    $("rb-speed").onclick = () => { const S = [1, 2, 4, 8]; game.speed = S[(S.indexOf(game.speed) + 1) % S.length]; refreshReplayBar(); };
    const sk = $("rb-skip"); if (sk) sk.onclick = () => { const end = Math.min(game.replay.ticks, game.state.tick + 900); while (game.state.tick < end) game.driver.tick(); refreshReplayBar(); };
    $("rb-stats").onclick = openStats;
    $("rb-exit").onclick = () => { game.driver = null; showScreen("menu"); refreshMenu(); refreshReplayBar(); };
  }
}

// ---- challenges -----------------------------------------------------------------------
function openChallenges() {
  const m = $("challenges-modal"); if (!m) return;
  if (!challengesOpen()) { ui.toast("Win any match to open the Challenges."); return; }
  const avail = DB.availableElements(masteryMap());
  if (!avail.includes(game.chEl)) game.chEl = avail[0];
  const skinName = (id) => (BUILDER_SKINS.find((k) => k.id === id) || {}).name || id;
  m.innerHTML = `<div class="modal wide glass"><button class="panel-close" id="ch-close">${icon("close")}</button><h2>Challenges</h2>
    <p class="dim">Ten waves, then a boss. Hard mode adds a restriction. Beat one to unlock a builder skin.</p>
    <div class="assign-opts ch-els">${avail.map((e) => `<button class="elbtn ${e === game.chEl ? "sel" : ""}" style="--ec:${DB.ELEMENTS[e].color}" data-chel="${e}">${sigil(e, "sm")}<span>${DB.ELEMENTS[e].name}</span></button>`).join("")}</div>
    <div class="ch-list">${CHALLENGES.map((c) => { const done = xmeta.challenges[c.id] || {}; return `<div class="ch-card"><img src="${enemyThumb(DB, c.boss)}" alt=""><div class="ch-info"><b>${c.name}</b><span>${c.desc}</span><span class="dim">Boss: ${mobName(c.boss)} · Reward: ${skinName(c.reward)} builder</span><span class="dim">Hard: ${c.hard.label}</span></div>
      <div class="ch-btns"><button class="btn small primary" data-ch="${c.id}">${done.normal ? "✓ " : ""}Normal</button><button class="btn small danger" data-chh="${c.id}">${done.hard ? "✓ " : ""}Hard</button></div></div>`; }).join("")}</div></div>`;
  m.classList.add("show");
  $("ch-close").onclick = () => m.classList.remove("show");
  m.querySelectorAll("[data-chel]").forEach((b) => b.onclick = () => { game.chEl = b.dataset.chel; openChallenges(); });
  const go = (id, hard) => { m.classList.remove("show"); startRun({ gameMode: "solo", mode: "loop", corridors: 1, economy: "shared", status: "standard", pacing: "manual", elements: [game.chEl], ruleset: "expanded", mods: {}, challenge: { id, hard } }); };
  m.querySelectorAll("[data-ch]").forEach((b) => b.onclick = () => go(b.dataset.ch, false));
  m.querySelectorAll("[data-chh]").forEach((b) => b.onclick = () => go(b.dataset.chh, true));
}

// wave preview for the dock (mirrors the sim's wave generator, so it's exact)
function previewWave(state, fp, wave) {
  if (!state.x) return null;
  if (state.challenge) return generateChallengeWave(state.seedBase, wave, state.challenge.def, bal.roster);
  const m = state.x;
  return generateWaveExpanded(state.seedBase, wave, fp.corridorCount, DB.CONFIG.bossEvery, { roster: bal.roster, filter: (r) => !(m.noFlyers && r.fly) && !(m.noDisruptors && r.disrupt) && !(m.noStealth && r.stealth) });
}

// ---------------------------------------------------------------------------
// BOOT
// ---------------------------------------------------------------------------
function insets() {
  const vh = window.innerHeight;
  const r = (id) => { const e = $(id); return e && e.offsetParent !== null ? e.getBoundingClientRect() : null; };
  const vw = window.innerWidth;
  if (game.screen === "setup") {
    const head = r("setup-head"), sheet = r("setup-sheet");
    if (sheet && sheet.left > vw * 0.4) return { top: head ? head.bottom + 6 : 60, bottom: 0, right: vw - sheet.left + 8 };
    return { top: head ? head.bottom + 6 : 60, bottom: sheet ? vh - sheet.top + 6 : vh * 0.5 };
  }
  if (game.screen !== "game") return { top: 0, bottom: 0 };
  let top = 0, bottom = 0;
  const tb = r("topbar"); if (tb) top = tb.bottom + 4;
  if (game.view === "field") { const nav = r("field-nav"); if (nav) top = Math.max(top, nav.bottom + 4); }
  const dock = r("quick-wave-controls"); if (dock) bottom = vh - dock.top + 4;
  let right = 0;
  for (const id of ["tower-panel", "enemy-panel", "send-panel"]) {
    const p = $(id); if (!p || !p.classList.contains("show")) continue;
    const pr = p.getBoundingClientRect();
    if (pr.left > vw * 0.45) right = Math.max(right, vw - pr.left + 6);   // a side sheet (wide screens)
    else bottom = Math.max(bottom, vh - pr.top + 6);                      // a bottom sheet (phones)
  }
  return { top, bottom, right };
}

function boot() {
  const canvas = $("world-canvas");
  try {
    renderer = createRenderer({ canvas, DB, labelLayer: $("world-labels"), getInsets: insets, onSfx: (n, a) => sound.play(n, a) });
  } catch (err) {
    const box = $("startup-error");
    if (box) { box.hidden = false; box.textContent = "Skyhold needs WebGL 2 to draw its world. (" + (err && err.message) + ")"; }
    throw err;
  }
  ui = createUI({
    DB, getView: () => view, cmd, masteryLevel, enterCorridor, getMeta: () => ({ ...meta, mastery: masteryMap() }),
    towerThumb: (id, stage) => towerThumb(DB, id, stage == null ? 1 : stage), enemyThumb: (t) => enemyThumb(DB, t),
    sfx: (n) => sound.play(n),
    onSetupPreview: setupPreview,
    previewWave,
    bal,
    getSkins: () => BUILDER_SKINS.map((k) => ({ ...k, unlocked: skinUnlocked(k) })),
    getSkin: () => xmeta.skin || "element",
    setSkin: (id) => { xmeta.skin = id; game.skin = id; saveXMeta(); },
  });
  loadDockPref();
  document.addEventListener("pointerdown", () => sound.unlock(), { once: true });
  bindUI();
  bindPointer();
  renderer.resize();
  window.addEventListener("resize", () => renderer.resize());
  preventBrowserGestures();

  showScreen("loading");
  // build the menu world and the first portraits while the loading bar runs
  const fill = $("loading-fill");
  const steps = [() => renderer.previewRing(DB.ELEMENT_ORDER.slice(), "menu"), () => renderer.render(null, 1)];
  let i = 0;
  const work = () => {
    const t0 = performance.now();
    while (i < steps.length && performance.now() - t0 < 30) { try { steps[i](); } catch (e) { console.warn(e); } i++; }
    if (fill) fill.style.width = Math.round((i / steps.length) * 100) + "%";
    if (i < steps.length) setTimeout(work, 0);
    else {
      showScreen("menu"); refreshMenu(); renderer.setMode("menu", true);
      // portraits for the menus are drawn in the background, a few per frame
      setTimeout(() => { Object.keys(DB.ENEMIES).forEach((k) => enemyThumb(DB, k)); warmThumbs(DB, DB.TOWERS.map((t) => t.id)); }, 600);
    }
  };
  setTimeout(work, 30);

  loop = createLoop({
    onTick: () => { if (game.driver && game.screen === "game") game.driver.tick(); },
    onFrame: (dt, running) => {
      if (!running) return;
      game.clock += dt;
      if (game.autoT != null) {
        game.autoT -= dt;
        if (game.autoT <= 0) { game.autoT = null; if (game.autoWave && game.state && myPlayer().phase === "build") cmd.startWave(); }
      }
      botTick();
    },
    getSpeed: () => game.speed,
    maxTicksPerFrame: 10,
    onRender: (alpha) => renderer.render(game.screen === "game" ? view : null, alpha),
    isRunning: () => {
      if (game.screen !== "game" || game.paused || !game.state) return false;
      return phaseRunning();
    },
    renderFps: 60,
  });
  loop.start();
  setInterval(() => { if (game.screen === "game" && game.state) { ui.updateTopBar(); ui.refreshPanels(); ui.updateEnemyOverview(); refreshAutoBtn(); refreshWaveFab(); if (game.spectate) refreshReplayBar(); } }, 250);
  window.__skyhold = { game, view, renderer, cmd, DB, startRun, setView, enterCorridor, onTap, ui, botTick, openStats, openReplays, openChallenges, endScreen, watchReplay, loadReplays };
  // dev/test helper: fast-forward n ticks (bots included)
  window.__skyhold.ff = (n) => { for (let i = 0; i < n && game.driver; i++) { game.clock += 1 / 30; botTick(); game.driver.tick(); if (game.state.finished) break; } return game.state.tick; };
}
function refreshAutoBtn() {
  const b = $("quick-auto-wave"); if (!b) return;
  b.classList.toggle("on", !!game.autoWave);
  b.innerHTML = icon("auto") + "<span>" + (game.autoWave ? (game.autoT != null ? Math.max(1, Math.ceil(game.autoT)) + "s" : "Auto ✓") : "Auto") + "</span>";
}
function phaseRunning() {
  if (!game.state) return false;
  if (game.spectate) return game.replay ? true : !game.state.finished;
  const pl = game.state.players[game.me]; return ["build", "wave", "prep", "endboss"].includes(pl.phase);
}

function bindUI() {
  const ovp = $("enemy-overview");
  if (ovp) ovp.addEventListener("click", (e) => { if (e.target.closest(".ov-head")) ovp.classList.toggle("collapsed"); });
  bind("btn-new-run", openSetup);
  bind("btn-continue", () => { if (hasRun()) continueRun(); });
  bind("btn-mastery", () => ui.openMastery());
  bind("btn-menu-save", () => { const m = $("save-modal"); if (m) m.classList.add("show"); });
  bind("btn-multiplayer", () => ui.toast("Multiplayer (Co-op & Compete) is coming to Skyhold soon.", "warn"));
  bind("btn-challenges", openChallenges);
  bind("btn-replays", openReplays);
  bind("pause-stats", () => { openStats(); });
  bind("end-spectate", () => { const sc = $("end-screen"); if (sc) sc.classList.remove("show"); game.spectate = true; game.paused = false; document.body.dataset.spectate = "live"; refreshReplayBar(); ui.toast("Spectating — the match plays on without you."); });
  bind("end-replay", () => { const sc = $("end-screen"); if (sc) sc.classList.remove("show"); const r = loadReplays()[0]; if (r) watchReplay(r); else ui.toast("No replay saved for this match.", "warn"); });
  document.querySelectorAll("[data-ruleset]").forEach((b) => b.onclick = () => { setup.ruleset = b.dataset.ruleset; setup._lastTouched = "ruleset"; ui.renderSetup(setup, avail()); sound.play("click"); });
  document.querySelectorAll("[data-diff]").forEach((b) => b.onclick = () => { setup.difficulty = b.dataset.diff; setup._lastTouched = "difficulty"; ui.renderSetup(setup, avail()); sound.play("click"); });
  document.querySelectorAll("[data-mod]").forEach((b) => b.onclick = () => {
    const k = b.dataset.mod;
    if (k === "goldMult" || k === "livesMult") { const S = [0.5, 1, 2]; setup.mods[k] = S[(S.indexOf(setup.mods[k]) + 1) % S.length]; }
    else setup.mods[k] = !setup.mods[k];
    setup._lastTouched = "mod:" + k; ui.renderSetup(setup, avail()); sound.play("click");
  });
  const RULES_KEY = "skyhold_setuprules_v1";
  const applyRules = (open) => { const m = $("rules-body"); if (m) m.classList.toggle("open", open); const ch = $("rules-chev"); if (ch) ch.textContent = open ? "▴" : "▾"; };
  let rulesOpen = false; try { rulesOpen = localStorage.getItem(RULES_KEY) === "1"; } catch (e) { /* fine */ }
  applyRules(rulesOpen);
  bind("setup-rules", () => { rulesOpen = !rulesOpen; try { localStorage.setItem(RULES_KEY, rulesOpen ? "1" : "0"); } catch (e) { /* fine */ } applyRules(rulesOpen); });
  bind("btn-setup-back", () => { showScreen("menu"); refreshMenu(); });
  bind("btn-start-run", () => startRun({ mode: setup.mode, corridors: setup.corridors, economy: setup.economy, status: setup.status, gameMode: setup.gameMode, pacing: setup.pacing, elements: setup.elements, ruleset: setup.ruleset, mods: { ...setup.mods }, difficulty: setup.difficulty }));
  const avail = () => DB.availableElements(masteryMap());
  document.querySelectorAll("[data-mode]").forEach((b) => b.onclick = () => { setup.mode = b.dataset.mode; if (setup.mode === "single") setup.corridors = 1; else if (setup.corridors < 3) setup.corridors = 4; setup._lastTouched = "mode"; ui.renderSetup(setup, avail()); sound.play("click"); });
  document.querySelectorAll("[data-econ]").forEach((b) => b.onclick = () => { setup.economy = b.dataset.econ; setup._lastTouched = "econ"; ui.renderSetup(setup, avail()); sound.play("click"); });
  document.querySelectorAll("[data-status]").forEach((b) => b.onclick = () => { setup.status = b.dataset.status; setup._lastTouched = "status"; ui.renderSetup(setup, avail()); sound.play("click"); });
  document.querySelectorAll("[data-pacing]").forEach((b) => b.onclick = () => { setup.pacing = b.dataset.pacing; setup._lastTouched = "pacing"; ui.renderSetup(setup, avail()); sound.play("click"); });
  const stepCorridors = (dir) => {
    if (setup.mode === "single" && setup.gameMode !== "versus") return;
    const optsN = DB.CORRIDOR_OPTIONS.filter((n) => (setup.gameMode === "versus" ? n >= 3 : n > 1));
    let i = optsN.indexOf(setup.corridors); if (i < 0) i = 0;
    i = Math.max(0, Math.min(optsN.length - 1, i + dir));
    setup.corridors = optsN[i];
    setup._lastTouched = "corridors";
    ui.renderSetup(setup, avail());
    sound.play("click");
  };
  bind("corr-minus", () => stepCorridors(-1));
  bind("corr-plus", () => stepCorridors(1));
  const MORE_KEY = "skyhold_setupmore_v1";
  const applyMore = (open) => { const m = $("more-body"); if (m) m.classList.toggle("open", open); const ch = $("more-chev"); if (ch) ch.textContent = open ? "▴" : "▾"; };
  let moreOpen = false; try { moreOpen = localStorage.getItem(MORE_KEY) === "1"; } catch (e) { /* fine */ }
  applyMore(moreOpen);
  bind("setup-more", () => { moreOpen = !moreOpen; try { localStorage.setItem(MORE_KEY, moreOpen ? "1" : "0"); } catch (e) { /* fine */ } applyMore(moreOpen); });
  document.querySelectorAll("[data-gamemode]").forEach((b) => b.onclick = () => {
    const mp = b.dataset.gamemode === "coop" || b.dataset.gamemode === "competitive";
    if (mp) { ui.toast("Multiplayer is coming to Skyhold soon — Solo and Vs NPCs are ready now.", "warn"); return; }
    setup.gameMode = b.dataset.gamemode;
    if (setup.gameMode === "versus" && setup.corridors < 3) setup.corridors = 4;
    setup._lastTouched = "gamemode";
    ui.renderSetup(setup, avail());
    updateGameModeButtons();
    sound.play("click");
  });
  document.querySelectorAll("[data-fps]").forEach((b) => b.onclick = () => { if (loop) loop.setRenderFps(+b.dataset.fps); document.querySelectorAll("[data-fps]").forEach((x) => x.classList.toggle("sel", x === b)); ui.toast("Render rate: " + b.dataset.fps + " fps"); });
  document.querySelectorAll("[data-quality]").forEach((b) => b.onclick = () => { renderer.setQuality(b.dataset.quality); refreshQualityButtons(); ui.toast("Graphics: " + b.textContent + (b.dataset.quality === "auto" ? " (" + renderer.qualityLabel + ")" : "")); });
  refreshQualityButtons();
  // audio (pause menu)
  bind("audio-mute", () => { sound.setMuted(!sound.pref.muted); refreshAudio(); });
  const mv = $("audio-music"), sv = $("audio-sfx");
  if (mv) mv.oninput = () => { sound.setMusic((+mv.value || 0) / 100); refreshAudio(); };
  if (sv) sv.oninput = () => { sound.setSfx((+sv.value || 0) / 100); refreshAudio(); sound.play("click"); };
  refreshAudio();
  bind("btn-world", () => setView("world"));
  bind("btn-prev-corridor", () => enterCorridor((game.activeCorridor - 1 + corridorNavCount()) % corridorNavCount()));
  bind("btn-next-corridor", () => enterCorridor((game.activeCorridor + 1) % corridorNavCount()));
  bind("quick-start-wave", () => { game.autoT = null; cmd.startWave(); });
  bind("wave-fab", () => { game.autoT = null; cmd.startWave(); });
  bind("wave-display", () => { if (game.view === "field") setView("world"); else enterCorridor(game.activeCorridor); });
  bind("dock-handle", () => { dockCollapsed = !dockCollapsed; try { localStorage.setItem(DOCK_KEY, dockCollapsed ? "1" : "0"); } catch (e) { /* fine */ } applyDock(); });
  bind("quick-auto-wave", () => {
    game.autoWave = !game.autoWave;
    if (!game.autoWave) game.autoT = null;
    else if (game.state && myPlayer().phase === "build") game.autoT = 5;
    refreshAutoBtn();
    ui.toast(game.autoWave ? "Auto wave-start ON — waves begin 5s after a clear" : "Auto wave-start OFF");
  });
  bind("quick-speed-cycle", () => { game.speed = game.speed >= 3 ? 1 : game.speed + 1; ui.updateWavePanel(); sound.play("click"); });
  bind("btn-send-panel", () => ui.toggleSendPanel());
  bind("btn-settings-ingame", () => togglePause(true));
  bind("pause-resume", () => togglePause(false));
  bind("pause-restart", () => { togglePause(false); startRun(rematchCfg()); });
  bind("pause-save", () => { autosave(); ui.toast("Run saved to this device"); });
  bind("pause-exit", () => { togglePause(false); storeReplay("Abandoned"); game.driver = null; showScreen("menu"); refreshMenu(); });
  bind("end-again", () => { const sc = $("end-screen"); if (sc) sc.classList.remove("show"); startRun(rematchCfg()); });
  bind("end-menu", () => { const sc = $("end-screen"); if (sc) sc.classList.remove("show"); game.driver = null; showScreen("menu"); refreshMenu(); });
  bind("btn-bestiary", () => ui.openBestiary());
  bind("end-endless", () => { const sc = $("end-screen"); if (sc) sc.classList.remove("show"); game.state.players[game.me].phase = "build"; game.state.mode = "endless"; game.mode = "endless"; ui.updateTopBar(); ui.updateWavePanel(); ui.toast("Endless Mode!"); });
  // Save / Import / Export (Circle's flow)
  bind("sm-close", () => $("save-modal").classList.remove("show"));
  bind("sm-export-run", () => { const t = $("save-text"); if (!t || !SaveSystem) return; if (!game.state) { ui.toast("No run in progress"); return; } t.value = SaveSystem.exportRunText(serializeRun()); });
  bind("sm-export-meta", () => { const t = $("save-text"); if (t && SaveSystem) t.value = SaveSystem.exportMetaText(meta); });
  bind("sm-download", () => { if (!SaveSystem) return; const txt = ($("save-text").value) || (game.state ? SaveSystem.exportRunText(serializeRun()) : SaveSystem.exportMetaText(meta)); SaveSystem.downloadText(txt, "skyhold-td-save.json"); });
  bind("sm-upload", () => { const f = $("sm-file"); if (f) f.click(); });
  bind("sm-import", () => {
    const t = $("save-text"); if (!t || !SaveSystem) return;
    const res = SaveSystem.importText(t.value);
    if (!res.ok) { ui.toast("Import failed: " + res.error, "warn"); return; }
    if (res.kind === "run") { $("save-modal").classList.remove("show"); restoreRun(res.data); ui.toast("Run imported!"); }
    else { meta = res.data; SaveSystem.saveMeta(meta); $("save-modal").classList.remove("show"); ui.toast("Progress imported!"); refreshMenu(); }
  });
  bind("sm-reset", () => { if (confirm("Reset ALL progress? This cannot be undone.")) { if (SaveSystem) SaveSystem.resetAll(); meta = SaveSystem ? SaveSystem.loadMeta() : { mastery: {} }; ui.toast("Progress reset"); refreshMenu(); } });
  const smFile = $("sm-file");
  if (smFile) smFile.onchange = (e) => { const f = e.target.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { const t = $("save-text"); if (t) t.value = rd.result; ui.toast("File loaded — press Import"); }; rd.readAsText(f); };
  // keyboard (Circle's keys + corridor arrows)
  window.addEventListener("keydown", (e) => {
    if (game.screen !== "game" || e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    if (e.key === " ") { e.preventDefault(); cmd.startWave(); }
    else if (e.key === "Escape") { if (ui.ringOpen) ui.closeAllPanels(); else togglePause(); }
    else if (e.key.toLowerCase() === "w") setView("world");
    else if (e.key === "ArrowLeft" || e.key.toLowerCase() === "q") enterCorridor((game.activeCorridor - 1 + corridorNavCount()) % corridorNavCount());
    else if (e.key === "ArrowRight" || e.key.toLowerCase() === "e") enterCorridor((game.activeCorridor + 1) % corridorNavCount());
    else if (e.key === "1" || e.key === "2" || e.key === "3") { game.speed = +e.key; ui.updateWavePanel(); }
  });
}
function bind(id, fn) { const e = $(id); if (e) e.onclick = (ev) => { sound.unlock(); fn(ev); }; }
function refreshQualityButtons() { document.querySelectorAll("[data-quality]").forEach((x) => x.classList.toggle("sel", x.dataset.quality === renderer.quality)); }
function refreshAudio() {
  const b = $("audio-mute"); if (b) b.innerHTML = sound.pref.muted ? icon("mute") + " Off" : icon("sound") + " On";
  const mv = $("audio-music"); if (mv) mv.value = Math.round(sound.pref.music * 100);
  const sv = $("audio-sfx"); if (sv) sv.value = Math.round(sound.pref.sfx * 100);
}
function rematchCfg() {
  const pacing = game.autoWave ? "auto" : "manual";
  const rc = game.runCfg || {};
  const keep = { ruleset: game.state.ruleset, mods: rc.mods, difficulty: rc.difficulty, challenge: rc.challenge };
  if (isVersus()) return { mode: "endless", corridors: game.state.players.length, economy: "shared", status: game.state.statusMode, gameMode: "versus", pacing, elements: [myPlayer().elements[0]], ...keep };
  return { mode: game.mode === "endless" ? "loop" : game.mode, corridors: myPlayer().corridorCount, economy: game.state.economy, status: game.state.statusMode, gameMode: "solo", pacing, elements: myPlayer().elements, ...keep };
}
function updateGameModeButtons() {
  document.querySelectorAll("[data-gamemode]").forEach((b) => {
    const mp = b.dataset.gamemode === "coop" || b.dataset.gamemode === "competitive";
    b.classList.toggle("disabled", mp);
    b.classList.toggle("sel", b.dataset.gamemode === setup.gameMode);
  });
}
function togglePause(force) {
  const o = $("pause-overlay");
  const want = force != null ? force : !(o && o.classList.contains("show"));
  if (o) o.classList.toggle("show", want);
  game.paused = want;
  refreshQualityButtons();
}
function setupSendButton() { const b = $("btn-send-panel"); if (!b) return; b.style.display = (game.gameMode === "competitive" || game.gameMode === "versus") ? "" : "none"; }

// ---------------------------------------------------------------------------
// NPC BOTS (versus) — verbatim from Circle: shell-side, they only ever emit COMMANDS
// ---------------------------------------------------------------------------
let bots = [];
function setupBots() {
  bots = [];
  if (!isVersus() || !game.state) return;
  const D = DIFFICULTY[game.difficulty] || DIFFICULTY.normal;
  for (let i = 1; i < game.state.players.length; i++) bots.push({ id: i, D, nextAt: game.clock + 1.5 + i * 0.5 });
}
function botTick() {
  if (!isVersus() || !game.state || game.state.finished || game.replay) return;
  for (const b of bots) {
    if (game.clock < b.nextAt) continue;
    const D = b.D || DIFFICULTY.normal;
    b.nextAt = game.clock + D.act[0] + Math.random() * (D.act[1] - D.act[0]);
    botAct(b);
  }
}
// what the next corridor's defence is weak against (Hard/Insane pick sends that exploit it)
function scoutDefence(st, target) {
  const corr = target.corridors[0]; if (!corr) return null;
  let air = 0, splash = 0, detect = 0, n = 0;
  for (const tw of corr.towers) {
    const d = DB.TOWER_BY_ID[tw.def.id]; if (!d) continue;
    n++;
    const a = d.archetype;
    if (a !== "splash" && a !== "melee" && a !== "support") air++;
    if (a === "splash" || a === "melee") splash++;
    if (d.element === "light" || tw.level >= 7 || a === "support") detect++;
  }
  return { n, air, splash, detect };
}
function botAct(b) {
  const st = game.state, pl = st.players[b.id];
  if (!pl || !pl.alive) return;
  const D = b.D || DIFFICULTY.normal;
  const corr = pl.corridors[0];
  const q = (c) => game.driver.queue(c);
  const wave = Math.max(1, pl.wave);
  const reserve = 30 + wave * 6;
  const G = st.grid;
  const X = !!st.x;
  if (!b.plan) { b.plan = DB.makeMazePlan(G.cols, G.rows, DB.CONFIG.towerSize); b.fails = {}; }
  if (b.lastBuild != null) {
    if (corr.towers.length <= b.lastBuild.count) b.fails[b.lastBuild.idx] = (b.fails[b.lastBuild.idx] || 0) + 1;
    b.lastBuild = null;
  }
  // build the maze (with builders, don't queue up more than a couple of constructions)
  const pending = X && corr.builder ? corr.builder.queue.length + (corr.builder.cur ? 1 : 0) : 0;
  const want = Math.min(D.towers, 3 + Math.ceil(wave * 0.8));
  if (corr.towers.length < want && pending < 2) {
    let idx = -1;
    for (let i = 0; i < b.plan.length; i++) {
      if ((b.fails[i] || 0) >= 3) continue;
      const sp = b.plan[i];
      if (corr.grid[(sp.r + 1) * G.cols + (sp.c + 1)] === 2) continue;
      idx = i; break;
    }
    if (idx >= 0) {
      let options = DB.TOWERS.filter((t) => t.element === corr.element && t.cost <= pl.gold - 20).sort((a, z) => z.cost - a.cost);
      // smarter bots keep some anti-air and detection in the mix once flyers and stealth appear
      if (D.counter && X && options.length) {
        const mine = scoutDefence(st, pl);
        const needAir = mine && mine.n >= 4 && mine.air < mine.n * 0.5;
        if (needAir) { const aa = options.filter((t) => t.archetype !== "splash" && t.archetype !== "melee" && t.archetype !== "support"); if (aa.length) options = aa; }
      }
      if (options.length) {
        const t = Math.random() < 0.6 ? options[0] : options[Math.floor(Math.random() * options.length)];
        const sp = b.plan[idx];
        b.lastBuild = { idx, count: corr.towers.length };
        q(C.buildTower(b.id, 0, sp.c + 1, sp.r + 1, t.id, 5));
        return;
      }
    }
  }
  if (corr.towers.length && Math.random() < D.up) {
    let tw = null;
    for (const t of corr.towers) if (!t.bState && !(t.upT > 0) && (!tw || t.level < tw.level)) tw = t;
    if (tw && tw.level < DB.CONFIG.maxLevel) {
      const cost = Math.round(tw.def.cost * DB.SCALING.upgradeCostBase * Math.pow(DB.SCALING.costGrowth, tw.level - 1));
      if (pl.gold > cost + reserve) { q(C.upgradeTower(b.id, 0, tw.id)); return; }
    } else if (tw && tw.mutations.length < 2 && tw.def.mutations.length) {
      const m = tw.def.mutations[Math.floor(Math.random() * tw.def.mutations.length)];
      q(C.mutateTower(b.id, 0, tw.id, m.id, 5)); return;
    }
  }
  if (corr.towers.length < 3 || wave < 2 || Math.random() > D.aggro) return;
  // sends
  const catalog = X ? DB.SENDS_EXPANDED : DB.SENDS;
  const costOf = X ? DB.sendCostX : DB.sendCost, upOf = X ? DB.sendUpgradeCostX : DB.sendUpgradeCost;
  const tiers = st.bal.sendTiers;
  const usable = Object.keys(catalog).filter((t) => {
    if (!X) return true;
    const s = catalog[t];
    if (s.tier > D.maxTier) return false;
    const d = st.bal.enemies[t] && st.bal.enemies[t].x; const tt = d ? d.t : {};
    const m = st.x;
    if ((m.noFlyers && tt.fly) || (m.noStealth && (tt.invisible || tt.cloakCycle || tt.cloakAura))) return false;
    if (m.noDisruptors && MOB_BY_ID[t] && (tt.jamPass || tt.corrodeAura || tt.chillAura || tt.chillFly || tt.confuseAura || tt.boulder || tt.rootTower || tt.curseTower || tt.deathTowerSlow || tt.deathStun || tt.shredObstacle)) return false;
    if (m.sendStock && tiers && tiers[s.tier]) {
      if (st.tick < tiers[s.tier].unlockTicks) return false;
      const sk = pl.sendStock[t]; if (sk && sk.n <= 0) return false;
    }
    return true;
  });
  if (!usable.length) return;
  if (Math.random() < 0.2) {
    const t = usable[Math.floor(Math.random() * usable.length)];
    const lvl = (pl.sendLevels && pl.sendLevels[t]) || 1;
    if (lvl < DB.SEND_MAX_LEVEL && pl.gold > upOf(t, lvl) + reserve * 2) { q(C.upgradeSend(b.id, t)); return; }
  }
  const budget = pl.gold - reserve * 2;
  let pick = null;
  if (D.counter && X) {
    // exploit the neighbour's defence: flyers vs ground-only mazes, stealth vs no detection, swarms vs single-target
    let target = null; for (let i = 1; i < st.players.length; i++) { const p = st.players[(b.id + i) % st.players.length]; if (p.alive) { target = p; break; } }
    const sc = target && scoutDefence(st, target);
    const traitsOf = (t) => (st.bal.enemies[t] && st.bal.enemies[t].x && st.bal.enemies[t].x.t) || {};
    const fit = (t) => {
      const tt = traitsOf(t), c = costOf(t, (pl.sendLevels && pl.sendLevels[t]) || 1);
      if (c > budget) return -1;
      let v = c;
      if (sc && sc.n) {
        if (tt.fly && sc.air < sc.n * 0.4) v *= 2.2;
        if ((tt.invisible || tt.cloakAura) && sc.detect === 0) v *= 2.5;
        if ((catalog[t].count || 1) >= 4 && sc.splash < sc.n * 0.25) v *= 1.6;
        if (tt.splashResist && sc.splash > sc.n * 0.4) v *= 1.6;
      }
      return v;
    };
    let best = -1;
    for (const t of usable) { const v = fit(t); if (v > best) { best = v; pick = t; } }
  } else {
    let bestC = 0;
    for (const t of usable) { const c = costOf(t, (pl.sendLevels && pl.sendLevels[t]) || 1); if (c <= budget && c > bestC && Math.random() < 0.85) { bestC = c; pick = t; } }
  }
  if (pick) {
    const c = costOf(pick, (pl.sendLevels && pl.sendLevels[pick]) || 1);
    const n = Math.max(1, Math.min(3, Math.floor(budget / Math.max(1, c))));
    for (let i = 0; i < n; i++) q(C.sendEnemy(b.id, 0, pick));
  }
}

function preventBrowserGestures() {
  ["gesturestart", "gesturechange", "gestureend"].forEach((g) => document.addEventListener(g, (e) => e.preventDefault(), { passive: false }));
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();

export default { boot };
