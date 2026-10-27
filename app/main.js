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
import { createState, step, SIM_HZ, findBuildSpot, canBuildAt, previewWaveX, isBossWaveX, hpReal, upgradeCost, totalInvested, sendLoad } from "../sim/core.js";
import { AFFIXES } from "../sim/waves.js";
import { extendDB, MOB_BY_ID, CHALLENGES, mobTier } from "../content/mobs.js";
import { BUILDER_SKINS, skinUnlocked as skinOk, LEGACY_SKINS, skinSwatch } from "../content/skins.js";
import * as RULES from "../content/rules.js";
import { createNpc, NPC_LEVELS } from "./npc.js";
import { createTutorial } from "../ui/tutorial.js";
import { buildBalance } from "../sim/balance.js";
import { hashContent, hashState } from "../sim/hash.js";
import * as C from "../net/commands.js";
import { createLoop } from "./loop.js";
import { createRenderer } from "../render/renderer.js";
import { towerThumb, enemyThumb, warmThumbs } from "../render/thumbs.js";
import { createBuilderViewer, builderThumb } from "../render/builderview.js";
import { createUI } from "../ui/shell.js";
import { icon, sigil, setIconDB } from "../ui/icons.js";
import { createSound } from "../audio/sound.js";
import * as rt from "../net/rtdb.js";
import { createSession, setActiveRoom } from "../net/session.js";
import { createLockstep, TURN, DELAY, HASH_EVERY } from "../net/lockstep.js";
import { createOnlineUI } from "../ui/online.js";

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
let xmeta = { played: 0, wins: 0, challenges: {}, endboss: {}, skin: "element", tutorial: false };
try { Object.assign(xmeta, JSON.parse(localStorage.getItem(XMETA_KEY)) || {}); } catch (e) { /* fine */ }
// older saves: a challenge beaten before skins were per element counts as beaten with Fire
for (const id in xmeta.challenges) { const c = xmeta.challenges[id]; if (c && c.normal && !c.els) c.els = { fire: { normal: true, hard: !!c.hard } }; }
if (LEGACY_SKINS[xmeta.skin]) xmeta.skin = LEGACY_SKINS[xmeta.skin];
xmeta.endboss = xmeta.endboss || {};
function saveXMeta() { try { localStorage.setItem(XMETA_KEY, JSON.stringify(xmeta)); } catch (e) { /* fine */ } }
function skinUnlocked(sk) { return skinOk(sk, xmeta, UNLOCK_ALL); }
function challengesOpen() { return UNLOCK_ALL || (meta.totalWins || 0) > 0 || xmeta.wins > 0; }
let meta = SaveSystem ? SaveSystem.loadMeta() : { mastery: {} };
let renderer, ui, loop, tutorial = null;
const sound = createSound();

function masteryLevel(el) { return UNLOCK_ALL ? 5 : ((meta.mastery && meta.mastery[el]) || 0); }
function masteryMap() { if (!UNLOCK_ALL) return meta.mastery || {}; const m = {}; for (const e of DB.ELEMENT_ORDER) m[e] = 5; return m; }
function isVersus() { return game.gameMode === "versus"; }
function fieldId() { return game.gameMode === "coop" ? 0 : (isVersus() ? game.activeCorridor : game.me); }
function fieldPlayer() { return game.state.players[fieldId()]; }
function myPlayer() { return game.state.players[game.me]; }
function seatName(i) {
  if (i === game.me) return "You";
  if (game.anonymous) return "Rival " + i;
  if (game.online && game.online.names[i]) { const nm = game.online.names[i]; return nm + (game.online.kinds[i] === "npc" && !/^NPC/.test(nm) ? " (NPC)" : ""); }
  return "NPC " + i;
}
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
  get time() { return game.state ? game.state.tick / SIM_HZ : game.clock; }, get speed() { return game.speed; },
  get selectedTowerId() { return game.selectedTowerId; }, set selectedTowerId(x) { game.selectedTowerId = x; },
  get selectedEnemyId() { return game.selectedEnemyId; }, set selectedEnemyId(x) { game.selectedEnemyId = x; },
  get buildTile() { return game.buildTile; }, set buildTile(x) { game.buildTile = x; },
  get buildMenuOpen() { return game.buildMenuOpen; }, set buildMenuOpen(x) { game.buildMenuOpen = x; },
  get buildSpot() { return game.buildSpot; }, set buildSpot(x) { game.buildSpot = x; },
  get buildPreview() { return game.buildPreview; }, set buildPreview(x) { game.buildPreview = x; },
  get builderSkin() { return game.skin || "element"; },
  get spectate() { return game.spectate; },
  get anonymous() { return game.anonymous; },
  get online() { return !!game.online; },
  seatName: (i) => seatName(i),
};

// ---- command emitters (solo applies on the next tick) -------------------------
function emit(c) {
  if (!game.driver || game.spectate) return;
  if (game.online && game.online.catchingUp) { ui.toast("Still catching up…", "warn"); return; }
  if (c.player == null) c.player = game.me;
  if (c.masteryLevel == null && c.type === "BuildTower") { const d = DB.TOWER_BY_ID[c.towerType]; c.masteryLevel = d ? masteryLevel(d.element) : 5; }
  if (c.masteryLevel == null && c.type === "MutateTower") {
    const corr = fieldPlayer().corridors[c.corridorId]; const tw = corr && corr.towers.find((t) => t.id === c.towerId);
    c.masteryLevel = tw ? masteryLevel(tw.def.element) : 5;
  }
  game.driver.queue(c);
}
const cmd = {
  build: (corridorId, gx, gy, towerType) => emit(C.buildTower(game.me, corridorId, gx, gy, towerType, masteryLevel(DB.TOWER_BY_ID[towerType].element))),
  sell: (corridorId, towerId) => emit(C.sellTower(game.me, corridorId, towerId)),
  upgrade: (corridorId, towerId) => emit(C.upgradeTower(game.me, corridorId, towerId)),
  mutate: (corridorId, towerId, mutId) => { const tw = fieldPlayer().corridors[corridorId].towers.find((t) => t.id === towerId); emit(C.mutateTower(game.me, corridorId, towerId, mutId, masteryLevel(tw ? tw.def.element : fieldPlayer().corridors[corridorId].element))); },
  startWave: () => emit(C.startWave(game.me)),
  send: (target, enemyType) => emit(C.sendEnemy(game.me, target, enemyType)),
  setTarget: (corridorId, towerId, mode) => emit(C.setTargetMode(game.me, corridorId, towerId, mode)),
  upgradeSend: (enemyType) => emit(C.upgradeSend(game.me, enemyType)),
  inspire: (corridorId, towerId) => emit(C.builderInspire(game.me, corridorId, towerId)),
  moveBuilder: (corridorId, gx, gy) => { emit(C.builderMove(game.me, corridorId, gx, gy)); ui.toast("Builder on its way — its lantern lights up stealth nearby."); sound.play("click"); if (tutorial) tutorial.notify("builderMove"); },
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

const seenReactions = new Set();
function handleEvent(ev) {
  const mine = ev.player === game.me || ev.from === game.me;
  if (ev.kind === "zap") { if (ev.player === fieldId()) sound.play("zap"); return; }
  if (ev.kind === "kill") { if (ev.player === fieldId() || isVersus()) sound.play(ev.boss ? "bossKill" : "kill"); return; }
  if (!mine && game.gameMode !== "coop") {
    if (ev.kind === "sent" && ev.to === game.me) ui.toast("⚠ Enemies incoming" + (isVersus() && ev.from != null ? " from " + seatName(ev.from) : "") + "!", "warn");
    if (isVersus() && ev.kind === "defeat") { ui.toast("☠ " + seatName(ev.player) + " has fallen!"); ui.updateEnemyOverview(); }
    return;
  }
  if (ev.kind === "sent" && ev.from === game.me) { ui.toast("⚔ Sent " + (ev.count > 1 ? ev.count + "× " : "") + mobName(ev.type) + (ev.level > 1 ? " (Lv" + ev.level + ")" : "")); ui.updateTopBar(); return; }
  if (ev.kind === "sendLevel") { ui.toast("⬆ " + mobName(ev.type) + " sends upgraded to Lv" + ev.level); ui.updateTopBar(); return; }
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
      ui.toast(ev.boss ? ("⚠ Wave " + ev.wave + " — Boss wave") : ("Wave " + ev.wave + (affix ? ` — ${affix.icon} ${affix.name}` : "")), ev.boss ? "boss" : "");
      sound.play(ev.boss ? "boss" : "wave");
      if (tutorial) tutorial.notify("wave", ev);
      break;
    }
    case "earlyBonus": ui.toast("⚡ Early call! +" + ev.bonus, "gold"); ui.updateTopBar(); break;
    case "synergy": {
      // the renderer pops the reaction's name where it happens; the first time each run, say what it is
      if (!seenReactions.has(ev.id)) {
        seenReactions.add(ev.id);
        const s = RULES.SYNERGIES_X.find((x) => x.id === ev.id);
        if (s) ui.toast(`${s.icon} <b>${s.name}</b> — ${sigil(s.a, "xs")}+${sigil(s.b, "xs")} ${s.text}`, "syn");
        sound.play("synergy");
      }
      if (tutorial) tutorial.notify("synergy", ev);
      break;
    }
    case "reject": { const M = { funds: (game.state.economy === "shared" ? "Not enough gold." : "Not enough essence."), noRoom: "No room — towers need 3×3 space and can’t fully block the path.", needMax: "Reach max level to mutate.", noSlots: "No mutation slots — raise Mastery.", locked: "That send tier hasn't unlocked yet.", stock: "Out of stock — it's recharging.", rule: "Not allowed by this match's rules.", busy: "That tower is still being built or upgraded.", element: "That element isn't part of this run.", full: "Their corridor is already full of your sends — wait a moment." }; ui.toast(M[ev.reason] || "Cannot do that here.", "warn"); sound.play("reject"); break; }
    case "waveClear":
      ui.toast(`Wave ${ev.wave} cleared! +${ev.bonus}`, "gold");
      sound.play("clear");
      if (ev.autosave) autosave();
      if (game.autoWave && myPlayer().phase === "build") game.autoT = 5;
      ui.updateTopBar(); ui.updateWavePanel(); ui.updateEnemyOverview();
      if (tutorial) tutorial.notify("waveClear", ev);
      break;
    case "wavesCleared": wavesWon(); break;
    case "prep": ui.updateWavePanel(); if (ev.player === game.me && game.state.challenge && !game.replay) showSummonCard(); break;
    case "endboss": {
      ui.toast(game.state.challenge ? "The boss walks out of the Vortex!" : "THE SEALED ONE awakens!", "boss"); sound.play("boss"); ui.updateWavePanel();
      // follow it out of the portal into the corridor it chose
      const ci = ev.corridor;
      if (ev.player === game.me && ci != null && !isVersus()) setTimeout(() => { if (game.state && game.view === "world") enterCorridor(ci); }, 900);
      break;
    }
    case "life": case "breach": ui.updateTopBar(); flash(); sound.play("life"); break;
    case "escape": ui.toast("💰 The " + mobName(ev.type) + " got away with its loot"); break;
    case "victory": endScreen(true, { endboss: !game.state.challenge }); break;
    case "defeat": endScreen(game.wonWaves, { bossEscaped: game.wonWaves }); break;
    case "built": if (tutorial) tutorial.notify("built", ev); break;
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
  const rp = $("btn-replays"); if (rp) { const n = loadReplays().length, pill = rp.querySelector(".pill"); if (pill) { pill.textContent = String(n); pill.style.display = n ? "" : "none"; } }
  const sub = $("menu-progress");
  if (sub) {
    const avail = DB.availableElements(masteryMap());
    sub.innerHTML = DB.ELEMENT_ORDER.map((e) => `<span class="mp-el ${avail.includes(e) ? "" : "off"}" title="${DB.ELEMENTS[e].name} · Mastery ${masteryLevel(e)}">${sigil(e, "sm")}<i>${masteryLevel(e)}</i></span>`).join("");
  }
}

// ---------------------------------------------------------------------------
// SETUP -> START RUN
// ---------------------------------------------------------------------------
// mode: "single" (Quick) | "loop" (Standard) | "endless"; gameMode: "solo" | "versus"
const SETUP_KEY = "skyhold_setup_v2";
const setup = { mode: "single", corridors: 4, economy: "shared", gameMode: "solo", pacing: "manual", elements: [], partner: null,
  difficulty: "normal", npc: "normal", seats: 4,
  mods: { lifeSteal: true, sendStock: true, builders: true, noFlyers: false, noDisruptors: false, noStealth: false, turbo: false, randomLanes: false, anonymous: false, doppel: false, goldMult: 1, livesMult: 1 } };
try { const sv = JSON.parse(localStorage.getItem(SETUP_KEY)); if (sv) { for (const k of ["mode", "corridors", "economy", "gameMode", "pacing", "difficulty", "npc", "seats", "partner"]) if (sv[k] != null) setup[k] = sv[k]; if (sv.elements) setup.elements = sv.elements; if (sv.mods) Object.assign(setup.mods, sv.mods); } } catch (e) { /* fine */ }
if (setup.gameMode !== "solo" && setup.gameMode !== "versus") setup.gameMode = "solo";
function saveSetup() { try { localStorage.setItem(SETUP_KEY, JSON.stringify(setup)); } catch (e) { /* fine */ } }
// kept for the online lobby and saved settings: the old NPC difficulty table, now the NPC brain's levels
const DIFFICULTY = NPC_LEVELS;
function openSetup() {
  const avail = DB.availableElements(masteryMap());
  const els = setup.elements.filter((e) => avail.includes(e));
  for (let i = 0; els.length < 8; i++) els.push(avail[i % avail.length]);
  setup.elements = els.slice(0, 8);
  if (!avail.includes(setup.partner) || setup.partner === setup.elements[0]) setup.partner = avail.find((e) => e !== setup.elements[0]) || setup.elements[0];
  setup._lastTouched = "gamemode";
  showScreen("setup");
  renderer.setMode("setup");
  ui.renderSetup(setup, avail); updateGameModeButtons();
}
// the setup preview is the real world: rebuild the ring as the options change
function setupPreview(s, sel) {
  const vs = s.gameMode === "versus";
  const n = vs ? s.seats : (s.mode === "single" ? 1 : s.corridors);
  let els;
  if (vs) { const mine = s.elements[0]; const rest = DB.ELEMENT_ORDER.filter((e) => e !== mine); els = [mine]; for (let i = 1; i < n; i++) els.push(rest[(i - 1) % rest.length]); }
  else els = s.elements.slice(0, n);
  renderer.previewRing(els, "setup:" + els.join(","));
  setupSel = sel;
  saveSetup();
}
let setupSel = 0;
// the elements a run is played with, from the setup (one element per corridor; Quick and Vs add a partner)
function runElements(cfg) {
  if (cfg.gameMode === "versus" || cfg.mode === "single" || cfg.challenge) {
    const a = cfg.elements[0], b = cfg.partner && cfg.partner !== a ? cfg.partner : null;
    return b ? [a, b] : [a];
  }
  return cfg.elements.slice(0, cfg.corridors);
}

function startRun(cfg, seed, replay, online) {
  game.gameMode = cfg.gameMode || "solo";
  game.mode = cfg.mode;
  const ruleset = cfg.ruleset || "expanded";
  const mods = ruleset === "expanded" ? Object.assign({}, setup.mods, cfg.mods || {}) : {};
  const npcLevel = cfg.npc || cfg.difficulty || "normal";
  const L = NPC_LEVELS[npcLevel] || NPC_LEVELS.normal;
  let players, mode = cfg.mode, economy = cfg.economy;
  if (replay || online) {
    // a replay (or an online match) brings its own exact config
    game.state = null;
  } else if (game.gameMode === "versus") {
    const seats = Math.max(3, Math.min(8, cfg.seats || cfg.corridors || 4));
    let [mine, partner] = runElements(cfg);
    const pool = DB.ELEMENT_ORDER.filter((e) => e !== mine);
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const rand = () => DB.ELEMENT_ORDER[Math.floor(Math.random() * 8)];
    if (mods.randomLanes) { mine = rand(); partner = rand(); }
    players = [{ corridorCount: 1, elements: partner && partner !== mine ? [mine, partner] : [mine] }];
    for (let i = 0; i < seats - 1; i++) {
      const el = mods.doppel ? mine : (mods.randomLanes ? rand() : pool[i % pool.length]);
      let pe = mods.doppel ? partner : DB.ELEMENT_ORDER[(DB.ELEMENT_ORDER.indexOf(el) + 1 + Math.floor(Math.random() * 6)) % 8];
      if (pe === el) pe = null;
      players.push({ corridorCount: 1, elements: pe ? [el, pe] : [el], incomeMult: L.incomeMult, goldBonus: L.goldBonus });
    }
    mode = "endless"; economy = "shared"; game.mode = "endless";
    mods.autoWave = 32; mods.firstWave = 25; // waves arrive on a shared timer, for everyone, until one seat is left
  } else {
    const corridorCount = cfg.challenge ? 1 : (cfg.mode === "single" ? 1 : cfg.corridors);
    players = [{ corridorCount, elements: runElements({ ...cfg, corridors: corridorCount }) }];
    if (cfg.challenge) mode = "loop";
    mods.difficulty = cfg.challenge ? "normal" : (cfg.difficulty || "normal");
  }
  const stateCfg = online ? online.stateCfg : replay ? replay.cfg : { seed: seed != null ? seed : ((Math.random() * 1e9) | 0), mode, gameMode: game.gameMode, economy, statusMode: "standard", players, ruleset, mods, challenge: cfg.challenge || null };
  game.state = createState(bal, structuredClone(stateCfg));
  game.runCfg = { ...cfg, ruleset, mods, stateCfg };
  game.recLog = replay ? null : [];
  game.replay = replay ? { ...replay } : null;
  game.spectate = !!replay;
  game.anonymous = !!(mods.anonymous && game.gameMode === "versus");
  game.skin = xmeta.skin || "element";
  game.difficulty = npcLevel;
  game.wonWaves = false; game.endChoice = false;
  seenReactions.clear();
  document.body.dataset.spectate = replay ? "replay" : "";
  game.me = online ? online.me : 0; game.speed = 1; game.clock = 0; game.paused = false;
  game.summoning = false; hideSummonCard();
  // the voxel bosses take a moment to build: do it now, in idle slices, not when they first walk in
  try { renderer.warmTowers(["fire", "ice", "nature", "storm", "light", "darkness", "mech", "abnormal"].flatMap((e) => [0, 1, 2, 3, 4].map((i) => e + "_" + i))); } catch (e) { /* fine */ }
  try { renderer.warmEnemies(["boss", ...(cfg.challenge ? [(CHALLENGES.find((c) => c.id === cfg.challenge.id) || {}).boss] : ["endboss"])].filter(Boolean)); } catch (e) { /* fine */ }
  if (!online && game.online) stopOnline();
  game.view = "world"; game.activeCorridor = 0;
  game.selectedTowerId = game.selectedEnemyId = game.buildTile = null; game.buildPreview = null;
  game.autoWave = cfg.pacing === "auto"; game.autoT = null; refreshAutoBtn();
  game.driver = online ? makeOnlineDriver(game.state, online) : replay ? makeReplayDriver(game.state, replay.log) : makeSoloDriver(game.state);
  if (!replay && !online) setupBots(); else bots = [];
  document.body.dataset.online = online ? "1" : "";
  document.body.dataset.vs = game.gameMode === "versus" ? "1" : "";
  setupSendButton();
  showScreen("game");
  ui.closeAllPanels();
  renderer.render(view, 1);       // builds the ring for this run
  setView("world", false);
  ui.updateTopBar(); ui.updateEnemyOverview(); ui.updateWavePanel();
  if (online) ui.toast(online.rejoin ? "Rejoining — catching up with the match…" : "Online match! The first wave starts in 30 seconds.", "gold");
  else if (replay) ui.toast("Watching replay — " + (replay.title || ""));
  else if (game.state.challenge) ui.toast("Challenge: " + game.state.challenge.def.name + (game.state.challenge.hard ? " (Hard)" : ""), "boss");
  else if (game.gameMode === "versus") ui.toast("Waves arrive every 32 seconds — the first in 25. Build fast!");
  else if (!cfg.tutorial) ui.toast("Build your defenses, then start the wave.");
  sound.play("whoosh");
  warmThumbs(DB, DB.TOWERS.map((t) => t.id));
  refreshReplayBar();
  if (!replay && !(online && online.rejoin) && !cfg.tutorial) { xmeta.played = (xmeta.played || 0) + 1; saveXMeta(); }
  return stateCfg.seed;
}

// ---------------------------------------------------------------------------
// ONLINE (Firebase Realtime Database, lockstep) — see net/lockstep.js
// ---------------------------------------------------------------------------
let session = null, onlineUI = null;
function ensureSession() {
  if (session) return session;
  session = createSession({ version: DB.contentHash, defaultElement: DB.availableElements(masteryMap())[0], defaultMods: { builders: true, lifeSteal: true, sendStock: true } });
  onlineUI = createOnlineUI({
    DB, session, toast: (m, k) => ui.toast(m, k), sfx: (n) => sound.play(n), backend: rt.backendName(),
    availableElements: () => DB.availableElements(masteryMap()),
    onHostStart: () => {
      const avail = DB.ELEMENT_ORDER;
      const mods = { builders: true, lifeSteal: true, sendStock: true, ...((session.room.cfg && session.room.cfg.mods) || {}) };
      session.start((Math.random() * 1e9) | 0, mods, avail).catch((e) => ui.toast("Couldn't start: " + e.message, "warn"));
    },
    onStart: () => {
      if (game.online && game.online.code === session.code) return;
      if (session.seat < 0) return;
      beginOnline(rt.serverNow() - (session.room.start.at || 0) > 8000); // joining a match already under way = rejoin
    },
    onEmote: (s, text) => renderer.emote && renderer.emote(s, text),
  });
  return session;
}
async function openOnline(prefill) {
  ensureSession();
  try { await session.connect(); } catch (e) { onlineUI.showError("Couldn't reach the online service: " + (e.message || e)); return; }
  onlineUI.open(prefill);
}
function beginOnline(rejoin) {
  const st = session.room.start; if (!st) return;
  // every seat plays its element plus a partner (picked in the lobby, or the element three steps round the wheel)
  const partnerOf = (p) => p.partner && p.partner !== p.el ? p.partner : DB.ELEMENT_ORDER[(DB.ELEMENT_ORDER.indexOf(p.el) + 3) % 8];
  const players = st.players.map((p) => { const D = DIFFICULTY[p.diff] || DIFFICULTY.normal; return { corridorCount: 1, elements: [p.el, partnerOf(p)], incomeMult: p.kind === "npc" ? D.incomeMult : 1, goldBonus: p.kind === "npc" ? D.goldBonus : 0 }; });
  const mods = { ...st.mods, autoWave: 35, firstWave: 30 };
  const stateCfg = { seed: st.seed, mode: "endless", gameMode: "versus", economy: "shared", statusMode: "standard", players, ruleset: "expanded", mods };
  onlineUI.close();
  game.online = { hlog: new URLSearchParams(location.search).has("nettest") ? {} : null, code: session.code, me: session.seat, n: players.length, names: st.players.map((p) => p.name), kinds: st.players.map((p) => p.kind), rejoin, catchingUp: rejoin, waitSince: 0, lastElect: 0, hashWarned: false };
  startRun({ gameMode: "versus", mode: "endless", economy: "shared", status: "standard", pacing: "manual", elements: [players[session.seat].elements[0]], partner: players[session.seat].elements[1], ruleset: "expanded", mods, difficulty: "normal", corridors: players.length, seats: players.length }, st.seed, null, { stateCfg, me: session.seat, rejoin });
  if (!rejoin) session.armPresence(session.seat);
  setView("world", true);
  enterCorridor(session.seat);
}
function stopOnline() {
  const o = game.online; if (!o) return;
  if (o.net) o.net.stop();
  game.online = null;
  document.body.dataset.online = "";
  const w = $("net-wait"); if (w) w.classList.remove("show");
}
function onlineRequired(state) { const r = []; state.players.forEach((p, i) => { if (p.alive) r.push(i); }); return r; }
function makeOnlineDriver(state, cfg) {
  const o = game.online;
  const net = createLockstep({
    session, n: o.n, me: cfg.me,
    onDesync: (t) => { if (!o.hashWarned) { o.hashWarned = true; ui.toast("⚠ Out of sync with the other players (turn " + t + "). The match may play differently on each screen.", "warn"); console.warn("[skyhold] desync at turn", t); } },
    onReject: (s) => { if (s === cfg.me && session.room.seats[cfg.me] && session.room.seats[cfg.me].bot) rt.update(session.path("seats/" + cfg.me), { bot: false, online: true }).catch(() => {}); },
  });
  o.net = net; o.execTurn = -1; o.stalled = false;
  if (cfg.rejoin) net.setDrive(cfg.me, false);
  const tick = () => {
    const T = state.tick + 1;
    let cmds = [];
    if ((T - 1) % TURN === 0) {
      const k = (T - 1) / TURN;
      const req = onlineRequired(state);
      if (!net.ready(k, req)) { if (!o.stalled) { o.stalled = true; o.waitSince = performance.now(); } return false; }
      cmds = net.commandsFor(k);
    }
    o.stalled = false;
    const ordered = C.orderCommands(cmds);
    if (ordered.length && game.recLog && game.recLog.length < 60000) game.recLog.push({ t: T, c: C.serialize(ordered) });
    step(state, ordered, SIM_DT);
    afterTick(state);
    if (T % TURN === 0) {
      o.execTurn = T / TURN - 1;
      if (o.execTurn % HASH_EVERY === 0 && !o.catchingUp) net.reportHash(o.execTurn, hashState(state));
      if (o.hlog && o.execTurn % 10 === 0) { o.hlog[o.execTurn] = hashState(state); } // ?nettest: per-second hashes for the two-tab test
    }
    if (state.finished && !o.ended) { o.ended = true; session.markEnded(); setActiveRoom(null); }
    return true;
  };
  return {
    queue(c) { if (c.type === "SetSpeed" || c.type === "StartWave") return; net.queue(c); },
    tick,
  };
}
// per frame: send acks, catch up, run the driver election and NPCs, show who we're waiting for
function onlineFrame(dt) {
  const o = game.online; if (!o || !o.net || !game.state) return;
  const st = game.state, net = o.net, seats = session.room.seats || {};
  const req = onlineRequired(st);
  // catch up when behind (a rejoin, or a slow device): run extra ticks within a time budget
  const others = req.filter((s) => s !== o.me);
  const target = others.length ? net.minUp(others) : net.maxUp();
  if (o.execTurn < target - DELAY - 2) {
    const t0 = performance.now(), budget = o.catchingUp ? 28 : 8;
    while (performance.now() - t0 < budget && o.execTurn < target - DELAY) { if (game.driver.tick() === false) break; }
  }
  if (o.catchingUp && o.execTurn >= target - DELAY - 2) {
    o.catchingUp = false;
    session.armPresence(o.me).then(() => rt.update(session.path("seats/" + o.me), { bot: false })).catch(() => {});
    ui.toast("Back in the match — your corridor is yours again.", "gold");
  }
  // whose seats do I write? mine (unless an NPC is still holding it), and the bot seats if I'm the driver
  const now = performance.now();
  if (now - o.lastElect > 500) {
    o.lastElect = now;
    let driver = -1;
    for (let i = 0; i < o.n; i++) { const s = seats[i]; if (s && s.kind === "human" && s.online === true) { driver = i; break; } }
    const iDrive = driver === o.me && !o.catchingUp;
    const mine = seats[o.me];
    net.setDrive(o.me, !o.catchingUp && !(mine && mine.bot));
    for (let i = 0; i < o.n; i++) {
      if (i === o.me) continue;
      const s = seats[i] || {};
      const botSeat = s.kind === "npc" || s.bot === true;
      net.setDrive(i, iDrive && botSeat);
      // take over a seat whose player has been gone for 30 s
      if (iDrive && s.kind === "human" && !s.bot && s.online === false && s.offAt && rt.serverNow() - s.offAt > 30500 && st.players[i] && st.players[i].alive) {
        rt.update(session.path("seats/" + i), { bot: true }).then(() => onlineUI.pushChat({ sys: true, n: "⚙", m: (s.name || "A player") + " is away — an NPC plays their corridor until they return." })).catch(() => {});
      }
    }
    // NPC brains for the seats I drive
    const want = [];
    for (let i = 0; i < o.n; i++) if (i !== o.me && net.drives(i)) want.push(i);
    bots = bots.filter((b) => want.includes(b.id));
    for (const i of want) if (!bots.find((b) => b.id === i)) bots.push(createNpc({ id: i, level: (seats[i] && seats[i].diff) || "normal", DB, sends: true, startAt: game.clock + 0.8 }));
  }
  // acks are paced by the wall clock (not the frame rate), a little ahead of what we've run
  if (!o.t0) o.t0 = now - Math.max(0, o.execTurn) * TURN * 1000 / SIM_HZ;
  const wallTurn = Math.floor((now - o.t0) / (TURN * 1000 / SIM_HZ));
  if (wallTurn < o.execTurn - 4) o.t0 = now - o.execTurn * TURN * 1000 / SIM_HZ; // don't let a stall bank up time
  const ahead = Math.min(wallTurn + DELAY, o.execTurn + DELAY + 8);
  net.pump(o.execTurn, document.hidden ? net.maxUp() + 12 : ahead);
  // the waiting banner
  const w = $("net-wait");
  if (w) {
    const waiting = o.stalled && now - o.waitSince > 700 ? net.waitingFor(o.execTurn + 1, req).filter((s) => s !== o.me) : [];
    if (waiting.length) {
      const parts = waiting.map((i) => { const s = seats[i] || {}; const name = s.name || seatName(i); if (s.online === false && s.offAt && !s.bot) { const left = Math.max(0, Math.ceil(30 - (rt.serverNow() - s.offAt) / 1000)); return `${name} <i>(disconnected — NPC takes over in ${left}s)</i>`; } return name; });
      const html = `⏳ Waiting for ${parts.join(", ")}…`;
      if (w._h !== html) { w.innerHTML = html; w._h = html; }
      w.classList.add("show");
    } else w.classList.remove("show");
  }
  // shared wave timer on the dock
  const b = $("quick-start-wave");
  if (b && st.nextWaveTick != null) {
    const secs = Math.max(0, Math.ceil((st.nextWaveTick - st.tick) / SIM_HZ));
    const html = `${icon("wave", "xs")} Wave ${myPlayer().wave + 1} in ${secs}s`;
    if (b._h !== html) { b.innerHTML = html; b._h = html; }
    b.classList.add("disabled");
  } else if (b && st.tick < 900) { const secs = Math.ceil((900 - st.tick) / SIM_HZ); const html = `${icon("wave", "xs")} First wave in ${secs}s`; if (b._h !== html) { b.innerHTML = html; b._h = html; } b.classList.add("disabled"); }
}
function leaveOnline() {
  if (!game.online) return;
  storeReplay("Left");
  stopOnline();
  if (session) session.leave();
  game.driver = null;
  showScreen("menu"); refreshMenu();
}

// ---------------------------------------------------------------------------
// AUTOSAVE + CONTINUE (Circle's format; Skyhold's own key)
// ---------------------------------------------------------------------------
function serializeRun() {
  const s = game.state, pl = s.players[game.me];
  return {
    v: 3, seed: s.seedBase, mode: s.mode, gameMode: "solo", economy: s.economy, statusMode: s.statusMode, ruleset: s.ruleset, mods: game.runCfg && game.runCfg.mods,
    difficulty: s.x ? s.x.difficulty : "normal", challenge: s.challenge ? { id: s.challenge.id, hard: s.challenge.hard } : null, wonWaves: !!game.wonWaves,
    corridorCount: pl.corridorCount, elements: pl.elements.slice(),
    pacing: game.autoWave ? "auto" : "manual",
    gold: pl.gold, essence: Object.assign({}, pl.essence), lives: pl.lives, wave: pl.wave, phase: pl.phase,
    stats: Object.assign({}, pl.stats),
    corridors: pl.corridors.map((c) => ({ towers: c.towers.map((t) => ({ defId: t.def.id, c: t.c, r: t.r, level: t.level, expert: t.expert, kills: t.kills, mutations: t.mutations.slice(), targetMode: t.targetMode || "first" })), spawnedTotal: c.spawnedTotal })),
  };
}
function autosave() { if (game.gameMode !== "solo" || game.runCfg && game.runCfg.tutorial) return; try { localStorage.setItem(RUN_KEY, JSON.stringify(serializeRun())); } catch (e) { /* fine */ } }
function hasRun() { try { return !!localStorage.getItem(RUN_KEY); } catch (e) { return false; } }
function continueRun() {
  let raw = null; try { raw = localStorage.getItem(RUN_KEY); } catch (e) { /* fine */ }
  if (!raw) return;
  let d; try { d = JSON.parse(raw); } catch (e) { return; }
  restoreRun(d);
  if (game.state && myPlayer().phase === "prep") showSummonCard();
}
function restoreRun(d) {
  // the run's own elements (a Quick run's partner included), its difficulty and challenge come back exactly
  const els = d.elements || [];
  startRun({ mode: d.mode, corridors: d.corridorCount, economy: d.economy, status: d.statusMode, gameMode: "solo", pacing: d.pacing || "manual", elements: d.corridorCount > 1 ? els : [els[0]], partner: d.corridorCount > 1 ? null : els[1], ruleset: d.ruleset || "classic", mods: d.mods || {}, difficulty: d.difficulty || "normal", challenge: d.challenge || null }, d.seed);
  game.wonWaves = !!d.wonWaves;
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
  const ov = $("enemy-overview"); if (ov) { ov.classList.toggle("show", v === "world"); if (v === "world" && !ov._touched) ov.classList.toggle("collapsed", window.innerWidth < 600); }
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
function refreshCamBtn() { const l = $("camview-lbl"); if (l) l.textContent = renderer.closeView ? "Close" : "Top"; const b = $("btn-camview"); if (b) b.classList.toggle("on", renderer.closeView); }
function followInto(ri) {
  if (game.view !== "field" || ri === game.activeCorridor || ri < 0 || ri >= corridorNavCount()) return;
  game.activeCorridor = ri; ui.closeRing(); updateCorridorName(); renderer.enterField(ri, false, true); ui.updateTopBar();
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
      if (fp.phase === "prep") { summonViaPortal(); return; }
      ui.toast(fp.phase === "endboss" ? "The seal is broken — find it in the corridors!" : "The Vortex is sealed — hold every wave first.");
      return;
    }
    if (h.kind === "gate") { enterCorridor(h.index); return; }
    return;
  }
  const h = renderer.pick(px, py, view);
  const corr = pl.corridors[isVersus() ? 0 : game.activeCorridor];
  const ownField = !isVersus() || game.activeCorridor === game.me;
  if (ui.picking === "move") {   // "tap where the builder should go"
    const G = game.state.grid;
    if (h && h.kind === "cell" && ownField && h.c >= 0 && h.r >= 0 && h.c < G.cols && h.r < G.rows) ui.pickSpot(h.c, h.r); else { ui.endPick(); ui.toast("Move cancelled"); }
    return;
  }
  if (ui.picking) {   // "tap a tower" (Inspire)
    const tw = h && h.kind === "cell" && ownField && h.c >= 0 && h.r >= 0 && h.c < game.state.grid.cols && h.r < game.state.grid.rows ? towerAt(corr, h.c, h.r) : null;
    ui.pickTower(tw); if (!tw) ui.toast("Inspire cancelled"); return;
  }
  if (!h) { ui.closeAllPanels(); return; }
  if (h.enemyId != null) { const e = game.state.enemies.find((x) => x.id === h.enemyId); if (e) { ui.openEnemyPanel(e); sound.play("click"); return; } }
  const c = h.c, r = h.r, G = game.state.grid;
  const onTower = c >= 0 && r >= 0 && c < G.cols && r < G.rows && corr.grid[r * G.cols + c] === 2;
  if (h.builder && !onTower && ownField && corr.builder) { ui.openBuilderPanel(corr); sound.play("click"); return; }
  if (c < 0 || r < 0 || c >= G.cols || r >= G.rows) { ui.closeAllPanels(); return; }
  if (!ownField) { ui.closeAllPanels(); return; }
  const cell = corr.grid[r * G.cols + c];
  if (cell === 2) { const tw = towerAt(corr, c, r); if (tw) { ui.openTowerRing(corr, tw, px, py); keepClear(tw.c + DB.CONFIG.towerSize / 2, tw.r + DB.CONFIG.towerSize / 2); sound.play("click"); return; } }
  // an empty spot: the build ring (towers + "move the builder here"). A tap that misses a free 3×3 snaps to
  // the nearest one; if nothing fits, the ring still opens (red square) so the builder can be sent there.
  if (cell !== 2) {
    const snap = cell === 0 ? findBuildSpot(game.state, fieldId(), corr.index, c, r) : null;
    const tc = snap ? snap.c + 1 : c, tr = snap ? snap.r + 1 : r;
    if (!snap && !corr.builder) { ui.toast("No room — towers need 3×3 space and can’t fully block the path.", "warn"); sound.play("reject"); ui.closeAllPanels(); return; }
    game.buildSpot = snap || { c: c - 1, r: r - 1, bad: true };
    const sp = snap ? renderer.cellScreen(tc + 0.5, tr + 0.5, 0.2) : { x: px, y: py };
    ui.openBuildRing(corr, { c: tc, r: tr }, sp.x, sp.y, { canBuild: !!snap });
    game.buildMenuOpen = true;
    sound.play(snap ? "click" : "reject");
    if (tutorial) tutorial.notify("ring");
    return;
  }
  ui.closeAllPanels();
}
function reopenBuildRing() {
  const t = ui.buildTile; if (!t || ui.ringKind !== "build") return;
  const corr = fieldPlayer().corridors[isVersus() ? 0 : game.activeCorridor];
  const ok = !(game.buildSpot && game.buildSpot.bad);
  const sp = renderer.cellScreen(t.c + 0.5, t.r + 0.5, 0.2);
  const keep = game.buildSpot;
  ui.openBuildRing(corr, { c: t.c, r: t.r }, sp.x, sp.y, { canBuild: ok });
  game.buildSpot = keep; game.buildMenuOpen = true;
}
// dragging the build square: follow the finger cell by cell, re-checking whether a tower fits
function dragBuildSpot(px, py) {
  const h = renderer.pick(px, py, view); if (!h || h.kind !== "cell") return;
  const G = game.state.grid;
  const c = Math.max(1, Math.min(G.cols - 2, h.c)), r = Math.max(1, Math.min(G.rows - 2, h.r));
  const t = ui.buildTile; if (!t || (t.c === c && t.r === r)) return;
  const corr = fieldPlayer().corridors[isVersus() ? 0 : game.activeCorridor];
  const ok = corr.grid[r * G.cols + c] !== 2 && canBuildAt(game.state, fieldId(), corr.index, c, r);
  game.buildSpot = ok ? { c: c - 1, r: r - 1 } : { c: c - 1, r: r - 1, bad: true };
  ui.moveBuildSpot(c, r, ok);
  game.buildMenuOpen = true;
}
// a selected tower glides clear of the card (never zooms); the ring follows it on screen
function keepClear(u, v) {
  requestAnimationFrame(() => {
    const tp = $("tower-panel"); if (!tp || !tp.classList.contains("show")) return;
    const r = tp.getBoundingClientRect(), ins = insets();
    if (r.left > window.innerWidth * 0.45) return; // side panel: nothing covered
    renderer.ensureVisible(u, v, ins.top + 90, r.top - 10);
  });
}
function trackUI() {
  if (game.screen !== "game" || game.view !== "field" || !ui) return;
  const a = ui.ringAnchor;
  if (a) {
    const sp = renderer.cellScreen(a.u, a.v, 1);
    const tp = $("tower-panel"); const r = tp && tp.classList.contains("show") ? tp.getBoundingClientRect() : null;
    ui.trackRing(sp.x, sp.y, r && r.left < window.innerWidth * 0.45 ? r.top : null);
  }
}
function bindPointer() {
  const cv = $("world-canvas");
  const pts = new Map();
  let drag = null, pinch = null, moved = false;
  cv.addEventListener("pointerdown", (e) => {
    sound.unlock();
    cv.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) {
      drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY }; moved = false;
      // pressing on the build square (or right next to it) grabs it instead of panning the field
      const t = ui.ringKind === "build" && game.view === "field" ? ui.buildTile : null;
      if (t) { const h = renderer.pick(e.clientX, e.clientY, view); if (h && h.kind === "cell" && Math.abs(h.c - t.c) <= 2 && Math.abs(h.r - t.r) <= 2) drag.square = true; }
    }
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
    if (drag.square) {
      if (!moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) moved = true;
      if (moved) dragBuildSpot(e.clientX, e.clientY);
      drag.x = e.clientX; drag.y = e.clientY;
      return;
    }
    if (!moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 9) { moved = true; if (game.view === "field") ui.closeRing(); }
    if (moved && game.screen === "game" && game.view === "field") renderer.panBy(dx, dy);
    drag.x = e.clientX; drag.y = e.clientY;
  });
  const end = (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (pts.size === 0) {
      if (drag && !moved) onTap(e.clientX, e.clientY);
      else if (drag && drag.square) reopenBuildRing(); // re-fan the bubbles around where the square landed
      drag = null;
    }
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
// The run is WON the moment the last wave is cleared (Mastery counts it right then). The Sealed One is an
// optional bonus round on top: beat it for a Sealbreaker skin per element in the run.
function runElementsOf(pl) { const out = []; for (const e of (pl.buildable || pl.elements)) if (!out.includes(e)) out.push(e); return out; }
let lastUnlocks = [];
function recordRunWin() {
  const pl = game.state.players[game.me];
  const skinsBefore = BUILDER_SKINS.filter(skinUnlocked).map((k) => k.id);
  let msgs = [];
  if (SaveSystem) {
    const proxy = { mode: game.mode, elements: runElementsOf(pl), wave: pl.wave, totalWaves: pl.totalWaves, score: pl.stats.score };
    try { msgs = SaveSystem.recordVictory(meta, proxy) || []; SaveSystem.saveMeta(meta); } catch (e) { /* fine */ }
  }
  xmeta.wins = (xmeta.wins || 0) + 1; saveXMeta();
  for (const k of BUILDER_SKINS) if (skinUnlocked(k) && !skinsBefore.includes(k.id)) msgs.push("Builder skin unlocked: " + k.name);
  try { localStorage.removeItem(RUN_KEY); } catch (e) { /* fine */ }
  return msgs;
}
function wavesWon() {
  if (game.wonWaves || game.replay) return;
  game.wonWaves = true;
  lastUnlocks = recordRunWin();
  refreshMenu();
  sound.play("victory");
  if (tutorial) tutorial.notify("wavesCleared");
  showSummonCard();
}
// After the last wave: the win is banked, and the Vortex holds the Sealed One. No modal — the world view
// flies in, the Vortex glows with a Summon chip, and a small card offers the bonus round or a clean finish.
function showSummonCard() {
  const pl = myPlayer();
  const c = $("summon-card"); if (!c) return;
  const ch = game.state.challenge;
  const els = runElementsOf(pl);
  const fresh = ch ? [] : els.map((e) => BUILDER_SKINS.find((k) => k.id === "seal_" + e)).filter((k) => k && !skinUnlocked(k));
  const diff = RULES.SOLO_DIFFICULTY[game.state.x ? game.state.x.difficulty : "normal"];
  c.innerHTML = ch
    ? `<div class="sc-head"><b>☠ The boss waits in the Vortex</b></div>
       <p>Ten waves held. Tap the <b>Vortex</b> to call the boss out and finish the challenge.</p>
       <div class="sc-acts"><button class="btn primary" id="sc-summon">${icon("skull", "xs")} Summon at the Vortex</button></div>`
    : `<div class="sc-head"><b class="win">🏆 Victory — every wave held${diff && diff.id !== "normal" ? " on " + diff.name : ""}</b></div>
       ${lastUnlocks.length ? `<div class="sc-unlocks">${lastUnlocks.slice(0, 4).map((u) => `<span class="unlock">${u}</span>`).join("")}</div>` : ""}
       <p>Something stirs in the <b>Vortex</b>. Tap it to summon <b>the Sealed One</b> — ${fresh.length ? `beat it to unlock ${fresh.map((k) => `<em>${k.name}</em>`).join(", ")}` : "beat it again for glory"}. If it gets away, your win stands.</p>
       <div class="sc-acts"><button class="btn primary" id="sc-summon">${icon("skull", "xs")} Summon at the Vortex</button><button class="btn ghost" id="sc-finish">Finish run</button></div>`;
  c.classList.add("show");
  $("sc-summon").onclick = () => summonViaPortal();
  const fin = $("sc-finish"); if (fin) fin.onclick = () => { hideSummonCard(); endScreen(true, { skipped: true }); };
  if (game.view !== "world") setView("world");
  ui.updateWavePanel();
}
function hideSummonCard() { const c = $("summon-card"); if (c) c.classList.remove("show"); }
// summoning happens at the portal: the camera shows the Vortex, the seal breaks, then it walks out
function summonViaPortal() {
  const fp = myPlayer();
  if (!game.state || fp.phase !== "prep" || game.summoning) return;
  hideSummonCard();
  game.summoning = true;
  if (game.view !== "world") setView("world");
  sound.play("boss");
  renderer.flashVortex && renderer.flashVortex();
  setTimeout(() => { game.summoning = false; if (game.state && myPlayer().phase === "prep") { game.endChoice = true; cmd.startWave(); } }, 1300);
}
function endScreen(win, o = {}) {
  if (game.replay) return; // replays just play out
  if (game._endShown === game.state) return;
  game._endShown = game.state;
  const bm = $("bonus-modal"); if (bm) bm.classList.remove("show");
  hideSummonCard();
  const pl = game.state.players[game.me];
  const ch = game.state.challenge;
  let unlockMsgs = o.endboss || o.bossEscaped || o.skipped ? lastUnlocks.slice() : [];
  const skinsBefore = BUILDER_SKINS.filter(skinUnlocked).map((k) => k.id);
  if (ch) {
    if (win) {
      const c = xmeta.challenges[ch.id] || (xmeta.challenges[ch.id] = {});
      c.normal = true; if (ch.hard) c.hard = true;
      c.els = c.els || {};
      for (const e of runElementsOf(pl)) { const ce = c.els[e] || (c.els[e] = {}); ce.normal = true; if (ch.hard) ce.hard = true; }
      xmeta.wins = (xmeta.wins || 0) + 1;
      try { localStorage.removeItem(RUN_KEY); } catch (e) { /* fine */ }
    }
  } else if (o.endboss && win) {
    for (const e of runElementsOf(pl)) xmeta.endboss[e] = true;
  } else if (!win && SaveSystem && !game.wonWaves) {
    // a loss still records how far each element got (Endless waves count toward Mastery 5)
    const proxy = { mode: game.mode, elements: runElementsOf(pl), wave: pl.wave, totalWaves: pl.totalWaves, score: pl.stats.score };
    try { SaveSystem.recordDefeat(meta, proxy); SaveSystem.saveMeta(meta); } catch (e) { /* fine */ }
    try { localStorage.removeItem(RUN_KEY); } catch (e) { /* fine */ }
  }
  saveXMeta();
  for (const k of BUILDER_SKINS) if (skinUnlocked(k) && !skinsBefore.includes(k.id)) unlockMsgs.push("Builder skin unlocked: " + k.name);
  storeReplay(win ? "Victory" : "Defeat");
  sound.play(win ? "victory" : "defeat");
  const sc = $("end-screen"); if (!sc) return;
  const title = !win ? "DEFEAT" : ch ? "CHALLENGE COMPLETE" : o.endboss ? "SEAL BROKEN" : "VICTORY";
  sc.querySelector("#end-title").textContent = title;
  sc.querySelector("#end-title").className = win ? "win" : "lose";
  const eb = sc.querySelector("#end-endless"); if (eb) eb.style.display = (win && game.mode !== "endless" && !ch && !isVersus()) ? "" : "none";
  const spb = $("end-spectate"); if (spb) spb.style.display = (!win && isVersus() && game.state.x && !game.state.finished) ? "" : "none";
  const eag = $("end-again"); if (eag) eag.textContent = game.online ? "Back to Online" : "Play Again";
  let html = "";
  if (o.bossEscaped) html += `<p class="end-note">The Sealed One got away this time — your victory stands.</p>`;
  else if (o.endboss) html += `<p class="end-note gold">You broke the seal. The Sealed One is no more.</p>`;
  html += `<div class="end-tiles"><div><span>${icon("wave", "xs")} Waves</span><b>${pl.wave}</b></div><div><span>${icon("skull", "xs")} Kills</span><b>${pl.stats.kills}</b></div><div><span>${icon("trophy", "xs")} Bosses</span><b>${pl.stats.bossesKilled}</b></div><div><span>${icon("star", "xs")} Score</span><b>${pl.stats.score}</b></div></div>`;
  if (!win && game.state.x) html += defeatReasonsHTML(game.state, pl);
  if (win && !ch) {
    let rows = "";
    for (const eid of runElementsOf(pl)) {
      const el = DB.ELEMENTS[eid]; if (!el) continue;
      const lvl = (meta.mastery && meta.mastery[eid]) || 0;
      const wins = (meta.elementWins && meta.elementWins[eid]) || 0;
      let prog;
      if (lvl >= 5) prog = "Mastery MAX";
      else if (lvl === 4) prog = "Endless wave " + RULES_M5_WAVE + " → M5";
      else prog = wins + "/" + DB.MASTERY.winsRequired[lvl + 1] + " wins → M" + (lvl + 1);
      rows += `<span class="end-m" style="--ec:${el.color}">${sigil(eid, "xs")} ${el.name} <em>${prog}</em></span>`;
    }
    if (rows) html += `<div class="end-mastery">${rows}</div>`;
  }
  if (unlockMsgs.length) html += `<details class="end-unl" open><summary>🎉 ${unlockMsgs.length} new unlock${unlockMsgs.length > 1 ? "s" : ""}</summary><div class="end-unlocks">${unlockMsgs.map((m) => `<span class="unlock">${m}</span>`).join("")}</div></details>`;
  if (game.state.x) html += `<div class="end-stats-wrap">${statsHTML(game.state)}</div>`;
  const body = sc.querySelector("#end-body");
  body.innerHTML = html;
  bindStatsTabs(body);
  sc.classList.add("show");
  if (tutorial) tutorial.notify("end", { win });
  refreshMenu();
}
const RULES_M5_WAVE = 50;

// ---- why you lost: read the leak report and name the one or two things to try ------------------
function defeatReasonsHTML(st, pl) {
  const L = pl.log; if (!L || !L.leaks.length) return "";
  const tally = { fly: 0, stealth: 0, boss: 0, armored: 0, ethereal: 0, swarm: 0, sent: 0, fast: 0, total: L.leaks.length };
  const types = {};
  for (const l of L.leaks) {
    const d = st.bal.enemies[l.type] || {}, t = (d.x && d.x.t) || {}, cls = d.cls;
    types[l.type] = (types[l.type] || 0) + 1;
    if (t.fly) tally.fly++;
    if (t.invisible || t.cloakCycle || t.cloakAura) tally.stealth++;
    if (d.boss) tally.boss++;
    if (cls === "heavy" || cls === "fortified") tally.armored++;
    if (cls === "ethereal") tally.ethereal++;
    if ((d.x && d.x.pack >= 4) || l.type === "swarm") tally.swarm++;
    if (l.from != null) tally.sent++;
    if (d.speed >= F17) tally.fast++;
  }
  // what the player had
  let air = 0, det = 0, n = 0; const typeN = { physical: 0, blast: 0, magic: 0, chaos: 0 };
  for (const c of pl.corridors) for (const tw of c.towers) {
    n++; const a = tw.def.archetype;
    if (a !== "splash" && a !== "melee" && a !== "support") air++;
    if (tw.def.element === "light" || tw.level >= 7 || a === "support") det++;
    typeN[RULES.towerDamageType(DB.TOWER_BY_ID[tw.def.id], a)]++;
  }
  const tips = [];
  const share = (k) => tally[k] / tally.total;
  if (share("fly") >= 0.25 && air < n * 0.5) tips.push(["🪽", "Flyers got through", "Splash and blade towers can't hit them. Mix in single-target, beam or chain towers along the middle of the corridor, where flyers cross."]);
  if (share("stealth") >= 0.2 && det === 0) tips.push(["👁", "Invisible creeps walked past", "Only Light towers, support towers, any tower at level 7+ and your builder's lantern can see them. Park the builder near the entrance by Inspiring a tower there."]);
  if (share("boss") >= 0.25) tips.push(["☠", "The bosses outlasted you", "Bosses have heavy armour: Magic (beams, chains) and upgrades that raise damage per hit do best. Slows and stuns buy time."]);
  if (share("armored") >= 0.3 && typeN.magic + typeN.blast < n * 0.35) tips.push(["🛡", "Armoured creeps shrugged off your towers", "Heavy armour takes +25% from Magic; Fortified takes +35% from Blast. Your towers were mostly Physical."]);
  if (share("ethereal") >= 0.2 && typeN.physical > n * 0.5) tips.push(["👻", "Ethereal creeps slipped through", "Physical hits deal half damage to spirits — Magic deals +50%."]);
  if (share("swarm") >= 0.3 && typeN.blast < n * 0.25) tips.push(["🐀", "Swarms overwhelmed single targets", "Packs melt under Blast towers and chain lightning."]);
  if (share("sent") >= 0.4) tips.push(["⚔", "Your neighbour's sends broke you", "Keep some gold in reserve after each wave, and send back: every send raises your income."]);
  if (!tips.length) {
    const top = Object.entries(types).sort((a, b) => b[1] - a[1])[0];
    tips.push(["🧭", `${mobName(top[0])} leaked most (${top[1]}×)`, "Lengthen the maze so creeps pass more towers, and mix your two elements: their reactions do big damage."]);
  }
  return `<div class="end-why"><div class="st-sub">Why it slipped away</div>${tips.slice(0, 2).map(([i, t, d]) => `<div class="why-row"><span class="why-i">${i}</span><div><b>${t}</b><span>${d}</span></div></div>`).join("")}</div>`;
}
const F17 = 1.7 * 65536;

// ---- match stats: summary, leak report, towers, sends ---------------------------------
function fmtT(ticks) { const s = Math.floor(ticks / SIM_HZ); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }
function mobName(t) { return (DB.ENEMIES[t] && DB.ENEMIES[t].name) || t; }
function corrName(p, i) { const c = p.corridors[i]; const el = c && DB.ELEMENTS[c.element]; return el ? sigil(c.element, "xs") + " " + el.name : "#" + (i + 1); }
function statsHTML(st) {
  const me = st.players[game.me], L = me.log;
  if (!L) return "";
  const tabs = [["sum", "Summary"], ["leaks", "Leaks"], ["towers", "Towers"]].concat(isVersus() ? [["sends", "Sends"]] : []);
  let h = `<div class="st-tabs">${tabs.map(([k, n], i) => `<button class="seg ${i ? "" : "sel"}" data-st="${k}">${n}</button>`).join("")}</div>`;
  // summary
  const killTop = Object.entries(L.kills).sort((a, b) => b[1] - a[1]).slice(0, 6);
  h += `<div class="st-pane show" data-pane="sum"><div class="st-grid">
    <div><span>Gold earned</span><b>${L.goldEarned}</b></div><div><span>Gold spent</span><b>${L.goldSpent}</b></div>
    <div><span>Lives lost</span><b>${L.livesLost}</b></div>${isVersus() ? `<div><span>Lives stolen</span><b>${L.livesStolen}</b></div>` : `<div><span>Reactions</span><b>${L.syn || 0}</b></div>`}
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
    <div class="st-sub">Every leak</div><table class="st-table"><tr><th>Time</th><th>Mob</th><th>HP left</th><th>Wave</th>${isVersus() ? "<th>Sent by</th>" : "<th>Corridor</th>"}</tr>${L.leaks.slice(-80).reverse().map((l) => `<tr><td>${fmtT(l.t)}</td><td>${mobName(l.type)}</td><td>${l.hp}%</td><td>${l.wave}</td><td>${isVersus() ? (l.from != null ? seatName(l.from) : "wave") : corrName(me, l.corridor)}</td></tr>`).join("")}</table>` : "<p class='dim'>Nothing leaked. Flawless.</p>"}</div>`;
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
  if (!challengesOpen()) { ui.toast("Win any run to open the Challenges."); return; }
  const avail = DB.availableElements(masteryMap());
  if (!avail.includes(game.chEl)) game.chEl = avail[0];
  if (game.chPartner === game.chEl || (game.chPartner && !avail.includes(game.chPartner))) game.chPartner = null;
  const pills = (sel, attr, allowNone) => (allowNone ? `<button class="elbtn ${!sel ? "sel" : ""}" data-${attr}="">—<span>None</span></button>` : "") + avail.map((e) => `<button class="elbtn ${e === sel ? "sel" : ""}" style="--ec:${DB.ELEMENTS[e].color}" data-${attr}="${e}">${sigil(e, "sm")}<span>${DB.ELEMENTS[e].name}</span></button>`).join("");
  const els = [game.chEl, game.chPartner].filter(Boolean);
  m.innerHTML = `<div class="modal wide glass"><button class="panel-close" id="ch-close">${icon("close")}</button><h2>Challenges</h2>
    <p class="dim">Ten waves from one themed pool, then its boss. Every challenge can be won more than one way — read the hint and pick elements that answer it. Each element you beat it with earns that challenge's builder look in your element.</p>
    <div class="ch-pick"><span class="ch-lbl">Element</span><div class="assign-opts ch-els">${pills(game.chEl, "chel")}</div>
    <span class="ch-lbl">Partner <i class="dim">(optional — unlocks reactions)</i></span><div class="assign-opts ch-els">${pills(game.chPartner, "chp", true)}</div></div>
    <div class="ch-list">${CHALLENGES.map((c) => {
      const done = xmeta.challenges[c.id] || {}; const L = c.look || {};
      const earned = els.map((e) => { const k = BUILDER_SKINS.find((x) => x.id === "ch_" + c.id + "_" + e); return k ? `<span class="ch-skin ${skinUnlocked(k) ? "have" : ""}">${skinUnlocked(k) ? "✓" : "🔒"} ${k.name}</span>` : ""; }).join("");
      return `<div class="ch-card"><img src="${enemyThumb(DB, c.boss)}" alt=""><div class="ch-info"><b>${c.name}</b><span>${c.desc}</span><span class="ch-hint">💡 ${c.hint || ""}</span><span class="dim">Hard: ${c.hard.label}</span><div class="ch-skins">${earned}</div></div>
      <div class="ch-btns"><button class="btn small primary" data-ch="${c.id}">${done.normal ? "✓ " : ""}Normal</button><button class="btn small danger" data-chh="${c.id}">${done.hard ? "✓ " : ""}Hard</button></div></div>`; }).join("")}</div></div>`;
  m.classList.add("show");
  $("ch-close").onclick = () => m.classList.remove("show");
  m.querySelectorAll("[data-chel]").forEach((b) => b.onclick = () => { game.chEl = b.dataset.chel; openChallenges(); });
  m.querySelectorAll("[data-chp]").forEach((b) => b.onclick = () => { game.chPartner = b.dataset.chp || null; openChallenges(); });
  const go = (id, hard) => { m.classList.remove("show"); startRun({ gameMode: "solo", mode: "loop", corridors: 1, economy: "shared", status: "standard", pacing: "manual", elements: [game.chEl], partner: game.chPartner, ruleset: "expanded", mods: {}, challenge: { id, hard } }); };
  m.querySelectorAll("[data-ch]").forEach((b) => b.onclick = () => go(b.dataset.ch, false));
  m.querySelectorAll("[data-chh]").forEach((b) => b.onclick = () => go(b.dataset.chh, true));
}

// wave preview for the dock (mirrors the sim's wave generator, so it's exact)
function previewWave(state, fp, wave) { return previewWaveX(state, fp, wave); }

// ---------------------------------------------------------------------------
// TUTORIAL — a short guided Quick run (Fire + Ice, Chill). Replay it from the menu or the pause menu.
// ---------------------------------------------------------------------------
function cellRect(c0, r0, c1, r1) {
  if (!renderer || game.view !== "field") return null;
  const pts = [renderer.cellScreen(c0, r0, 0.2), renderer.cellScreen(c1, r0, 0.2), renderer.cellScreen(c0, r1, 0.2), renderer.cellScreen(c1, r1, 0.2)];
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const left = Math.min(...xs), top = Math.min(...ys);
  return { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
}
// the open ring's bubbles and caption (plus the build square), as one spotlight rectangle
function ringRect() {
  // laid-out boxes (offset*), not on-screen rects: bubbles are still scaling in during their first frames
  const menu = $("radial-menu"); if (!menu || !menu.classList.contains("show")) return null;
  const els = [...menu.querySelectorAll(".rad-item, .rad-label, .rad-hub")];
  if (!els.length) return null;
  const o = menu.getBoundingClientRect();
  const lab = menu.querySelector(".rad-label");
  let l = 1e9, t = 1e9, r = -1e9, b = -1e9;
  for (const e of els) {
    let x = e.offsetLeft, y = e.offsetTop, w = e.offsetWidth, h = e.offsetHeight;
    if (e === lab) { x -= w / 2; if (!lab.classList.contains("below")) y -= h; } // the caption is centred / hung above its point
    l = Math.min(l, o.left + x); t = Math.min(t, o.top + y); r = Math.max(r, o.left + x + w); b = Math.max(b, o.top + y + h);
  }
  return r > l ? { left: l, top: t, width: r - l, height: b - t } : null;
}
function startTutorial() {
  if (tutorial && tutorial.active) tutorial.end();
  ["mastery-screen", "wardrobe-modal", "challenges-modal", "end-screen", "bonus-modal"].forEach((id) => { const m = $(id); if (m) m.classList.remove("show"); });
  startRun({ gameMode: "solo", mode: "single", corridors: 1, economy: "shared", pacing: "manual", elements: ["fire"], partner: "ice", difficulty: "chill", ruleset: "expanded", mods: { builders: true }, tutorial: true }, 4242);
  const G = game.state.grid;
  const plan = DB.makeMazePlan(G.cols, G.rows, DB.CONFIG.towerSize);
  const spot = plan[0];
  const pl = () => game.state.players[0];
  const corr = () => pl().corridors[0];
  const q = (sel) => () => document.querySelector(sel);
  const steps = [
    { title: "Welcome to Skyhold", text: "Creeps march through your floating corridor. Build towers to stop them before they get through.<br><br>This tour takes about three minutes — you'll play a real (and relaxed) run. You can replay it any time from the menu.", pause: true },
    { title: "Lives", text: "Every creep that makes it through costs a life — a boss costs two. Lose them all and the run is over.", target: q("#topbar .lives"), pause: true },
    { title: "Gold", text: "Gold buys towers and upgrades. Kills, cleared waves and some reactions pay more.", target: q("#currency-display"), pause: true },
    { title: "Waves", text: "Hold all <b>10 waves</b> and the run is won. Every 5th wave brings a Warlord boss.", target: q("#wave-display"), pause: true },
    { title: "Your corridor", text: "Creeps come out of the portal at the <b>top</b> and walk to the portal at the <b>bottom</b>. They can't walk through towers — so your towers build the path. A longer path means more shots.", enter: () => { if (game.view !== "field") enterCorridor(0); }, target: () => cellRect(0, 0, G.cols, G.rows), pad: 2, pause: true },
    { title: "Build a tower",
      text: () => ui.ringOpen
        ? "Each bubble is a tower — 🔥 Fire and ❄ Ice, your two elements. Tap one to see what it does, then tap it <b>again</b> to build."
        : "Tap the glowing spot near the entrance.",
      target: () => ui.ringOpen ? ringRect(spot) : cellRect(spot.c, spot.r, spot.c + 3, spot.r + 3), pad: 10, allow: true,
      done: () => corr().towers.length > 0 },
    { title: "Your builder", text: "Your builder flies over and raises the tower — a bar above it shows the progress, and it can't fire until it's finished.", target: () => { const b = corr().builder; if (!b) return null; const p = renderer.cellScreen(b.x / 65536, b.y / 65536, 1.5); return { left: p.x - 34, top: p.y - 44, width: 68, height: 68 }; }, pause: false, next: "Next" },
    { title: "Make a wall",
      text: () => ui.ringOpen
        ? "Pick a tower — try the other element this time. Missed the spot by a row? <b>Drag the square</b> and the bubbles follow."
        : `Build <b>two more towers</b> next to the first one (${Math.max(0, 3 - corr().towers.length)} to go). Mix Fire and Ice — you'll see why in a moment.`,
      target: () => ui.ringOpen ? ringRect() : cellRect(0, Math.max(0, spot.r - 6), G.cols, Math.min(G.rows, spot.r + 9)), pad: 8, allow: true,
      done: () => corr().towers.length >= 3 },
    { title: "Spots and your builder", text: "Tapping an empty spot always opens this ring. Besides towers, the 📍 <b>Builder</b> bubble sends your builder there — its lantern reveals invisible creeps nearby. Tap the builder itself for more.", pause: true, enter: () => ui.closeAllPanels() },
    { title: "The next wave", text: "This line shows what comes next. 🪽 flies over your maze, 👁 is invisible. If your towers can't deal with them, a red warning appears right here.", target: q("#wave-preview"), pause: true },
    { title: "Start the wave", text: "Ready? Tap <b>Start Wave</b>.", target: q("#quick-start-wave"), allow: true, on: "wave" },
    { title: "Speed", text: "Speed the game up to ×2, ×3 or ×5 here — or slow it back down when it gets busy.", target: q("#quick-speed-cycle"), pause: true },
    { title: "Reactions", text: "Every pair of elements reacts. A creep <b>Burning</b> from Fire that gets hit by an Ice tower (or <b>Chilled</b> and hit by Fire) sets off 🌡 <b>Thermal Shock</b> — a big burst of damage. Names pop up where reactions happen.<br><br>All 28 pairs are in <b>⚗ Reactions</b> in the pause menu.", pause: true },
    { title: "Tower cards", text: "Tap one of your towers.", target: () => ui.ringOpen ? ringRect() : cellRect(0, Math.max(0, spot.r - 6), G.cols, Math.min(G.rows, spot.r + 9)), pad: 6, allow: true, done: () => !!game.selectedTowerId, enter: () => ui.closeAllPanels() },
    { title: "Upgrades and tags", text: "⬆ upgrades it — the tower re-raises itself, a little slower each level. The card shows its <b>damage type</b>, whether it <b>hits flyers</b> and whether it <b>sees stealth</b> — and which reactions it can set off.", target: () => { const p = $("tower-panel"); return p && p.classList.contains("show") ? p : null; }, pause: true,
      enter: () => { const tw = corr().towers.find((t) => t.id === game.selectedTowerId) || corr().towers[0]; if (tw && !($("tower-panel") || {}).classList?.contains("show")) ui.openTowerPanel(corr(), tw); } },
    { title: "Armour", text: "Creeps wear armour classes. 🗡 <b>Physical</b> shreds Light runners, 💥 <b>Blast</b> cracks Medium packs and Fortified walls, ✦ <b>Magic</b> melts Heavy and Ethereal foes. Tap any creep to see its class.", pause: true, enter: () => ui.closeAllPanels() },
    { title: "Wave guide", text: "ⓘ lists the next three waves and every creep's traits.", target: q("#btn-wave-info"), pause: true },
    { title: "You're ready", text: "Clear all 10 waves to win. Then the <b>Vortex</b> in the middle of the world starts to glow: tap it to summon the <b>Sealed One</b>, an optional bonus fight that unlocks a new builder look.<br><br>Have fun!", next: "Let's play", pause: true },
  ];
  tutorial = createTutorial({
    layer: $("tutorial-layer"), steps,
    setPaused: (p) => { game.paused = p; },
    onEnd: (skipped) => { xmeta.tutorial = true; saveXMeta(); tutorial = null; if (skipped) ui.toast("Tour skipped — replay it from the menu any time."); },
  });
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
  if (game.screen === "menu") {
    // the world sits in the gap between the title and the menu card (beside the card on wide screens)
    const tag = document.querySelector("#screen-menu .tag"), card = document.querySelector("#screen-menu .menu-card");
    const tr = tag && tag.offsetParent !== null ? tag.getBoundingClientRect() : null, cr = card && card.offsetParent !== null ? card.getBoundingClientRect() : null;
    if (cr && cr.left > vw * 0.5) { const br = document.querySelector("#screen-menu .brand"); const bb = br ? br.getBoundingClientRect() : null; return { top: 0, bottom: 0, right: vw - cr.left + 10, left: bb && bb.right < vw * 0.4 ? bb.right + 10 : 0 }; }
    return { top: tr ? tr.bottom + 4 : 0, bottom: cr ? vh - cr.top + 4 : 0 };
  }
  if (game.screen !== "game") return { top: 0, bottom: 0 };
  let top = 0, bottom = 0;
  const tb = r("topbar"); if (tb) top = tb.bottom + 4;
  if (game.view === "field") { const nav = r("field-nav"); if (nav) top = Math.max(top, nav.bottom + 4); }
  // the dock grows and shrinks (next-wave preview, timers): keep the tallest height seen at this window
  // size, so a wave ending or starting never nudges the camera's framing
  const dock = r("quick-wave-controls");
  if (dock) {
    const key = window.innerWidth + "x" + vh;
    if (insets._key !== key) { insets._key = key; insets._dock = 0; }
    insets._dock = Math.max(insets._dock || 0, vh - dock.top + 4);
    bottom = insets._dock;
  }
  // cards (tower / enemy / builder / sends) overlay the battlefield: they never move or zoom the camera
  const right = 0;
  return { top, bottom, right, baseBottom: bottom, baseRight: right };
}

function boot() {
  const canvas = $("world-canvas");
  try {
    renderer = createRenderer({ canvas, DB, labelLayer: $("world-labels"), getInsets: insets, onSfx: (n, a) => sound.play(n, a),
      onFollowEnd: () => { if (ui) ui.refreshPanels(); },
      onFollowCorridor: (ri) => followInto(ri) });
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
    onEnemySelect: (id) => { renderer.setFollow(id); renderer.setPortrait(id != null ? $("enemy-portrait") : null, id); },
    isFollowing: (id) => renderer.following === id,
    toggleFollow: (id) => renderer.setFollow(renderer.following === id ? null : id),
    setSkin: (id) => { xmeta.skin = id; game.skin = id; saveXMeta(); },
    skinSwatch: (id, el) => skinSwatch(id, el),
    builderViewer: (canvas) => createBuilderViewer(canvas),
    builderThumb: (id, el) => builderThumb(id, el),
    previewElement: () => (game.state && myPlayer() ? myPlayer().elements[0] : setup.elements[0]) || "fire",
    npcLevels: NPC_LEVELS,
    isBossWave: (st, fp, w) => isBossWaveX(st, fp, w),
    hpReal: (st, v) => hpReal(st, v),
    upgradeCost: (def, level) => game.state ? upgradeCost(game.state, def, level) : 0,
    sellValue: (tw) => game.state ? Math.round(game.state.x && tw.bState ? tw.def.cost : totalInvested(game.state, tw) * DB.CONFIG.sellRefund) : 0,
    sendLoad: (st, id) => sendLoad(st, id),
  });
  tutorial = null;
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
      if (!xmeta.tutorial) { const tb = $("btn-tutorial"); if (tb) tb.classList.add("pulse"); setTimeout(() => ui.toast("New to Skyhold? Take the 3-minute tour: 🎓 How to Play"), 900); }
      const roomQ = new URLSearchParams(location.search).get("room");
      if (roomQ) setTimeout(() => openOnline(roomQ), 300);
      // portraits for the menus are drawn in the background, a few per frame
      setTimeout(() => { Object.keys(DB.ENEMIES).forEach((k) => enemyThumb(DB, k)); warmThumbs(DB, DB.TOWERS.map((t) => t.id)); }, 600);
    }
  };
  setTimeout(work, 30);

  loop = createLoop({
    onTick: () => { if (game.driver && game.screen === "game") game.driver.tick(); },
    onFrame: (dt, running) => {
      if (game.online && game.screen === "game") onlineFrame(dt);
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
    onRender: (alpha) => { renderer.render(game.screen === "game" ? view : null, alpha); trackUI(); },
    isRunning: () => {
      if (game.screen !== "game" || game.paused || !game.state) return false;
      return phaseRunning();
    },
    renderFps: +(new URLSearchParams(location.search).get("fps") || 60), // ?fps= (dev/testing)
  });
  loop.start();
  setInterval(() => { if (game.screen === "game" && game.state) { ui.updateTopBar(); ui.refreshPanels(); ui.updateEnemyOverview(); refreshAutoBtn(); refreshWaveFab(); refreshVsTimer(); if (game.spectate) refreshReplayBar(); } }, 250);
  window.__skyhold = { openOnline, getSession: () => session, leaveOnline, game, view, renderer, cmd, DB, startRun, setView, enterCorridor, onTap, ui, botTick, openStats, openReplays, openChallenges, endScreen, watchReplay, loadReplays };
  // dev/test helper: fast-forward n ticks (bots included)
  window.__skyhold.ff = (n) => { for (let i = 0; i < n && game.driver; i++) { game.clock += 1 / 30; botTick(); game.driver.tick(); if (game.state.finished) break; } return game.state.tick; };
}
// Vs NPCs: the waves come on a shared timer — the dock button shows the countdown
function refreshVsTimer() {
  if (!isVersus() || game.online || !game.state || !game.state.x) return;
  const st = game.state, b = $("quick-start-wave"); if (!b) return;
  const at = st.nextWaveTick != null ? st.nextWaveTick : st.x.firstWave;
  const secs = Math.max(0, Math.ceil((at - st.tick) / SIM_HZ));
  const html = `${icon("wave", "xs")} Wave ${myPlayer().wave + 1} in ${secs}s`;
  if (b._h !== html) { b.innerHTML = html; b._h = html; }
  b.classList.add("disabled");
}
function refreshAutoBtn() {
  const b = $("quick-auto-wave"); if (!b) return;
  b.classList.toggle("on", !!game.autoWave);
  b.innerHTML = icon("auto") + "<span>" + (game.autoWave ? (game.autoT != null ? Math.max(1, Math.ceil(game.autoT)) + "s" : "Auto ✓") : "Auto") + "</span>";
}
function phaseRunning() {
  if (!game.state) return false;
  if (game.online) return !game.state.finished; // online: the world never stops for one player
  if (game.spectate) return game.replay ? true : !game.state.finished;
  const pl = game.state.players[game.me]; return ["build", "wave", "prep", "endboss"].includes(pl.phase);
}

function bindUI() {
  const ovp = $("enemy-overview");
  if (ovp) ovp.addEventListener("click", (e) => { if (e.target.closest(".ov-head")) { ovp._touched = true; ovp.classList.toggle("collapsed"); } });
  bind("btn-new-run", openSetup);
  bind("btn-continue", () => { if (hasRun()) continueRun(); });
  bind("btn-mastery", () => ui.openMastery());
  bind("btn-menu-save", () => { const m = $("save-modal"); if (m) m.classList.add("show"); });
  bind("btn-multiplayer", () => openOnline());
  bind("btn-chat", () => onlineUI && onlineUI.toggleChatInput());
  bind("btn-emote", () => onlineUI && onlineUI.toggleEmotes());
  bind("btn-challenges", openChallenges);
  bind("btn-replays", openReplays);
  bind("pause-stats", () => { openStats(); });
  bind("end-spectate", () => { const sc = $("end-screen"); if (sc) sc.classList.remove("show"); game.spectate = !game.online; game.paused = false; document.body.dataset.spectate = "live"; refreshReplayBar(); ui.toast("Spectating — the match plays on without you."); });
  bind("end-replay", () => { const sc = $("end-screen"); if (sc) sc.classList.remove("show"); const r = loadReplays()[0]; if (r) watchReplay(r); else ui.toast("No replay saved for this match.", "warn"); });
  document.querySelectorAll("[data-diff]").forEach((b) => b.onclick = () => { setup.npc = b.dataset.diff; setup._lastTouched = "npc"; ui.renderSetup(setup, avail()); sound.play("click"); });
  document.querySelectorAll("[data-sdiff]").forEach((b) => b.onclick = () => { setup.difficulty = b.dataset.sdiff; setup._lastTouched = "difficulty"; ui.renderSetup(setup, avail()); sound.play("click"); });
  const stepSeats = (dir) => { setup.seats = Math.max(3, Math.min(8, setup.seats + dir)); ui.renderSetup(setup, avail()); sound.play("click"); };
  bind("seats-minus", () => stepSeats(-1));
  bind("seats-plus", () => stepSeats(1));
  document.querySelectorAll("[data-mod]").forEach((b) => b.onclick = () => {
    const k = b.dataset.mod;
    if (k === "goldMult" || k === "livesMult") { const S = [0.5, 1, 2]; setup.mods[k] = S[(S.indexOf(setup.mods[k]) + 1) % S.length]; }
    else setup.mods[k] = !setup.mods[k];
    setup._lastTouched = "mod:" + k; ui.renderSetup(setup, avail()); sound.play("click");
  });
  bind("btn-setup-back", () => { showScreen("menu"); refreshMenu(); });
  bind("btn-start-run", () => { saveSetup(); startRun({ mode: setup.mode, corridors: setup.corridors, seats: setup.seats, economy: setup.economy, gameMode: setup.gameMode, pacing: setup.pacing, elements: setup.elements, partner: setup.partner, ruleset: "expanded", mods: { ...setup.mods }, difficulty: setup.difficulty, npc: setup.npc }); });
  const avail = () => DB.availableElements(masteryMap());
  document.querySelectorAll("[data-mode]").forEach((b) => b.onclick = () => { setup.mode = b.dataset.mode; if (setup.corridors < 3) setup.corridors = 4; setup._lastTouched = "mode"; ui.renderSetup(setup, avail()); sound.play("click"); });
  document.querySelectorAll("[data-econ]").forEach((b) => b.onclick = () => { setup.economy = b.dataset.econ; setup._lastTouched = "econ"; ui.renderSetup(setup, avail()); sound.play("click"); });
  document.querySelectorAll("[data-pacing]").forEach((b) => b.onclick = () => { setup.pacing = b.dataset.pacing; setup._lastTouched = "pacing"; ui.renderSetup(setup, avail()); sound.play("click"); });
  const stepCorridors = (dir) => {
    if (setup.mode === "single" && setup.gameMode !== "versus") return;
    const optsN = DB.CORRIDOR_OPTIONS.filter((n) => n > 1);
    let i = optsN.indexOf(setup.corridors); if (i < 0) i = 0;
    i = Math.max(0, Math.min(optsN.length - 1, i + dir));
    setup.corridors = optsN[i];
    setup._lastTouched = "corridors";
    ui.renderSetup(setup, avail());
    sound.play("click");
  };
  bind("corr-minus", () => stepCorridors(-1));
  bind("corr-plus", () => stepCorridors(1));
  // run options (economy, pacing, creep modifiers, builder look) sit in their own sheet, one tap away
  const moreM = () => $("more-modal");
  bind("setup-more", () => { const m = moreM(); if (m) m.classList.add("show"); sound.play("click"); });
  bind("more-close", () => { const m = moreM(); if (m) m.classList.remove("show"); });
  bind("more-done", () => { const m = moreM(); if (m) m.classList.remove("show"); sound.play("click"); });
  // one tab row: Quick / Standard / Endless are solo run lengths, Vs NPCs is the other game mode
  document.querySelectorAll("[data-run]").forEach((b) => b.onclick = () => {
    const k = b.dataset.run;
    if (k === "versus") { setup.gameMode = "versus"; if (setup.corridors < 3) setup.corridors = 4; }
    else { setup.gameMode = "solo"; setup.mode = k; if (setup.corridors < 3) setup.corridors = 4; }
    setup._lastTouched = "mode";
    ui.renderSetup(setup, avail());
    sound.play("click");
  });
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
  // settings: from the menu's gear or the pause menu
  const setM = () => $("settings-modal");
  bind("btn-settings", () => { refreshAudio(); refreshQualityButtons(); setM().classList.add("show"); sound.play("click"); });
  bind("pause-settings", () => { refreshAudio(); refreshQualityButtons(); setM().classList.add("show"); sound.play("click"); });
  bind("settings-close", () => setM().classList.remove("show"));
  setM().addEventListener("click", (e) => { if (e.target === setM()) setM().classList.remove("show"); });
  bind("audio-music-on", () => { sound.setMusicOn(!(sound.pref.musicOn !== false) || sound.pref.muted); refreshAudio(); });
  bind("audio-sfx-on", () => { sound.setSfxOn(!(sound.pref.sfxOn !== false) || sound.pref.muted); refreshAudio(); sound.play("click"); });
  const mv = $("audio-music"), sv = $("audio-sfx");
  if (mv) mv.oninput = () => { sound.setMusic((+mv.value || 0) / 100); refreshAudio(); };
  if (sv) sv.oninput = () => { sound.setSfx((+sv.value || 0) / 100); refreshAudio(); sound.play("click"); };
  refreshAudio();
  bind("btn-world", () => setView("world"));
  bind("btn-prev-corridor", () => enterCorridor((game.activeCorridor - 1 + corridorNavCount()) % corridorNavCount()));
  bind("btn-next-corridor", () => enterCorridor((game.activeCorridor + 1) % corridorNavCount()));
  bind("quick-start-wave", () => { game.autoT = null; if (game.state && myPlayer().phase === "prep") { summonViaPortal(); return; } cmd.startWave(); });
  bind("wave-fab", () => { game.autoT = null; cmd.startWave(); });
  bind("btn-wave-info", () => ui.toggleWavePanel());
  { const wp = $("wave-preview"); if (wp) wp.addEventListener("click", () => ui.toggleWavePanel()); }
  bind("btn-camview", () => { renderer.setCloseView(!renderer.closeView); refreshCamBtn(); });
  refreshCamBtn();
  ui.bindSheets();
  { const dk = $("quick-wave-controls"); if (dk && window.ResizeObserver) new ResizeObserver(() => document.documentElement.style.setProperty("--dock-h", dk.offsetHeight + "px")).observe(dk); }
  bind("wave-display", () => { if (game.view === "field") setView("world"); else enterCorridor(game.activeCorridor); });
  bind("dock-handle", () => { dockCollapsed = !dockCollapsed; try { localStorage.setItem(DOCK_KEY, dockCollapsed ? "1" : "0"); } catch (e) { /* fine */ } applyDock(); });
  bind("quick-auto-wave", () => {
    game.autoWave = !game.autoWave;
    if (!game.autoWave) game.autoT = null;
    else if (game.state && myPlayer().phase === "build") game.autoT = 5;
    refreshAutoBtn();
    ui.toast(game.autoWave ? "Auto wave-start ON — waves begin 5s after a clear" : "Auto wave-start OFF");
  });
  bind("quick-speed-cycle", () => { if (game.online) return; const S = [1, 2, 3, 5]; game.speed = S[(S.indexOf(game.speed) + 1) % S.length]; ui.updateWavePanel(); sound.play("click"); });
  bind("btn-send-panel", () => ui.toggleSendPanel());
  bind("btn-settings-ingame", () => togglePause(true));
  bind("pause-resume", () => togglePause(false));
  bind("pause-restart", () => { togglePause(false); startRun(rematchCfg()); });
  bind("pause-save", () => { autosave(); ui.toast("Run saved to this device"); });
  bind("pause-exit", () => { togglePause(false); if (game.online) { leaveOnline(); return; } storeReplay("Abandoned"); game.driver = null; showScreen("menu"); refreshMenu(); });
  bind("end-again", () => { const sc = $("end-screen"); if (sc) sc.classList.remove("show"); if (game.online) { leaveOnline(); openOnline(); return; } startRun(rematchCfg()); });
  bind("end-menu", () => { const sc = $("end-screen"); if (sc) sc.classList.remove("show"); if (game.online) { leaveOnline(); return; } game.driver = null; showScreen("menu"); refreshMenu(); });
  bind("btn-bestiary", () => ui.openBestiary());
  bind("btn-wardrobe", () => ui.openWardrobe());
  bind("btn-tutorial", () => startTutorial());
  bind("pause-tutorial", () => { togglePause(false); if (game.online) { ui.toast("Finish the online match first.", "warn"); return; } startTutorial(); });
  bind("pause-codex", () => ui.openCodex());
  bind("end-endless", () => { const sc = $("end-screen"); if (sc) sc.classList.remove("show"); const pl = game.state.players[game.me]; if (pl.lives <= 0) { ui.toast("No lives left to go on with.", "warn"); return; } pl.phase = "build"; pl.alive = true; game.state.finished = false; game._endShown = null; game.state.mode = "endless"; game.mode = "endless"; ui.updateTopBar(); ui.updateWavePanel(); ui.toast("Endless Mode! How far can you go?"); });
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
    if (e.key === " ") { e.preventDefault(); if (game.state && myPlayer().phase === "prep") summonViaPortal(); else cmd.startWave(); }
    else if (e.key === "Escape") { const open = ["settings-modal", "more-modal"].map($).find((m) => m && m.classList.contains("show")); if (open) open.classList.remove("show"); else if (ui.ringOpen) ui.closeAllPanels(); else togglePause(); }
    else if (e.key.toLowerCase() === "w") setView("world");
    else if (e.key === "ArrowLeft" || e.key.toLowerCase() === "q") enterCorridor((game.activeCorridor - 1 + corridorNavCount()) % corridorNavCount());
    else if (e.key === "ArrowRight" || e.key.toLowerCase() === "e") enterCorridor((game.activeCorridor + 1) % corridorNavCount());
    else if (e.key === "Enter" && game.online) { e.preventDefault(); onlineUI.toggleChatInput(true); }
    else if ((e.key === "1" || e.key === "2" || e.key === "3" || e.key === "5") && !game.online) { game.speed = +e.key; ui.updateWavePanel(); }
  });
}
function bind(id, fn) { const e = $(id); if (e) e.onclick = (ev) => { sound.unlock(); fn(ev); }; }
function refreshQualityButtons() { document.querySelectorAll("[data-quality]").forEach((x) => x.classList.toggle("sel", x.dataset.quality === renderer.quality)); }
function refreshAudio() {
  const p = sound.pref;
  const tg = (id, on) => { const b = $(id); if (b) { b.classList.toggle("on", on); b.setAttribute("aria-checked", on ? "true" : "false"); } };
  tg("audio-music-on", !p.muted && p.musicOn !== false);
  tg("audio-sfx-on", !p.muted && p.sfxOn !== false);
  const mv = $("audio-music"); if (mv) mv.value = Math.round(p.music * 100);
  const sv = $("audio-sfx"); if (sv) sv.value = Math.round(p.sfx * 100);
}
function rematchCfg() {
  const pacing = game.autoWave ? "auto" : "manual";
  const rc = game.runCfg || {};
  const keep = { ruleset: game.state.ruleset === "classic" ? "classic" : "expanded", mods: rc.mods, difficulty: rc.difficulty, npc: rc.npc, challenge: rc.challenge, tutorial: rc.tutorial };
  const els = myPlayer().elements;
  if (isVersus()) return { mode: "endless", corridors: game.state.players.length, seats: game.state.players.length, economy: "shared", gameMode: "versus", pacing, elements: [els[0]], partner: els[1], ...keep };
  const multi = myPlayer().corridorCount > 1;
  return { mode: rc.mode || game.mode, corridors: myPlayer().corridorCount, economy: game.state.economy, gameMode: "solo", pacing, elements: multi ? els : [els[0]], partner: multi ? null : els[1], ...keep };
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
  game.paused = want && !game.online; // online: the pause menu doesn't stop the match
  const pr = $("pause-restart"); if (pr) pr.style.display = game.online ? "none" : "";
  const ph = $("pause-title"); if (ph) ph.textContent = game.online ? "Menu — the match keeps running" : "Paused";
  const px = $("pause-exit"); if (px) px.textContent = game.online ? "Leave Match" : "Exit to Menu";
  refreshQualityButtons();
}
function setupSendButton() { const b = $("btn-send-panel"); if (!b) return; b.style.display = (game.gameMode === "competitive" || game.gameMode === "versus") ? "" : "none"; }

// ---------------------------------------------------------------------------
// NPC BOTS (versus) — the NPC brain in app/npc.js; shell-side, they only ever emit COMMANDS
// ---------------------------------------------------------------------------
let bots = [];
function setupBots() {
  bots = [];
  if (!isVersus() || !game.state) return;
  for (let i = 1; i < game.state.players.length; i++) bots.push(createNpc({ id: i, level: game.difficulty, DB, sends: true, startAt: game.clock + 1 + i * 0.4 }));
}
function botTick() {
  if (!isVersus() || !game.state || game.state.finished || game.replay) return;
  for (const b of bots) b.tick(game.state, game.clock, (c) => game.driver.queue(c));
}

function preventBrowserGestures() {
  ["gesturestart", "gesturechange", "gestureend"].forEach((g) => document.addEventListener(g, (e) => e.preventDefault(), { passive: false }));
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();

export default { boot };
