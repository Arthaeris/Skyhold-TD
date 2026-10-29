/* Skyhold TD — ui/shell.js
   UI LAYER — a port of Circle-TD's ui/shell.js: the same panels, radial build/tower rings, HUD, wave
   preview, send panel, setup, mastery and synergy codex, with the same behaviour and wording. Skyhold's
   changes are presentational: elemental sigils instead of emoji in the chrome, voxel thumbnails of the
   towers/enemies, and a setup preview that is the live 3D world instead of a 2D polygon.

   It never mutates sim state; user intent becomes COMMANDS through opts.cmd (exactly as in Circle). */
import * as fx from "../sim/fx.js";
import { generateWave, waveAffix, AFFIXES } from "../sim/waves.js";
import { pvPanel, pvHead, pvSec, pvTiles, pvMeter, pvPips, pvTabs, bindPvTabs } from "./panel.js";
import { icon, sigil } from "./icons.js";
import { traitList, MOB_BY_ID, ARMOR_CLASSES, SEND_TIERS } from "../content/mobs.js";
import * as R from "../content/rules.js";

const $ = (id) => document.getElementById(id);
const toI = (v) => fx.toInt(v);

export function createUI(opts) {
  const DB = opts.DB;
  const getView = opts.getView;
  const cmd = opts.cmd;
  const masteryLevel = opts.masteryLevel || (() => 5);
  const getMeta = opts.getMeta || (() => ({ mastery: {}, elementWins: {} }));
  const thumb = opts.towerThumb || (() => "");
  const ethumb = opts.enemyThumb || (() => "");
  const sfx = opts.sfx || (() => {});
  let _twSig = null, _sendSig = null;

  // stacked toasts (Circle: max 3, 2.6s)
  const TOAST_MAX = 3, TOAST_MS = 2600;
  function toast(msg, kind) {
    const t = $("toast"); if (!t) return;
    while (t.children.length >= TOAST_MAX) t.removeChild(t.firstChild);
    const m = document.createElement("div"); m.className = "toast-msg" + (kind ? " " + kind : ""); m.innerHTML = msg;
    t.appendChild(m);
    requestAnimationFrame(() => m.classList.add("show"));
    setTimeout(() => { m.classList.remove("show"); setTimeout(() => m.remove(), 300); }, TOAST_MS);
  }
  function setText(id, t) { const e = $(id); if (e && e.textContent !== String(t)) e.textContent = t; }
  function setHTML(id, h) { const e = $(id); if (e && e._h !== h) { e.innerHTML = h; e._h = h; } }

  function closeAllPanels() {
    const wasEnemy = getView().selectedEnemyId != null;
    ["build-menu", "tower-panel", "enemy-panel", "builder-panel", "send-panel", "wave-panel"].forEach((id) => { const e = $(id); if (e) e.classList.remove("show", "full"); });
    closeRing();
    const v = getView(); v.selectedTowerId = null; v.selectedEnemyId = null; v.buildTile = null; v.buildMenuOpen = false; v.buildPreview = null;
    _sendSig = null; _twRef = null; _bdCorr = null; _wvSig = null;
    if (wasEnemy && opts.onEnemySelect) opts.onEnemySelect(null);
    positionPortrait();
    if (opts.onPanels) opts.onPanels();
  }

  // ---------------------------------------------------------------------------
  // RADIAL MENUS — Circle's build & tower rings. Mouse: hover previews, click executes.
  // Touch: first tap focuses/previews, second tap executes.
  // ---------------------------------------------------------------------------
  let _ring = null;
  function closeRing() { const m = $("radial-menu"); if (m) { m.classList.remove("show"); m.innerHTML = ""; } _ring = null; }
  function showRing(sx, sy, items, o) {
    const m = $("radial-menu"), stage = $("game-stage"); if (!m || !stage) return;
    m.innerHTML = "";
    const W = stage.clientWidth, H = stage.clientHeight;
    let R = items.length > 6 ? Math.min(124, 70 + items.length * 5) : 80;
    const n = items.length;
    // The ring stays centred on the spot you tapped, so the square never hides under a bubble. Near an
    // edge the bubbles fan out to the open side instead of the whole ring sliding away from the spot.
    const top = ringTop(), bottom = H - 44;
    let arc = "full";
    if (sy - R - 40 < top) arc = "down";
    else if (sy + R > bottom) arc = "up";
    else if (sx - R < 34) arc = "right";
    else if (sx + R > W - 34) arc = "left";
    const SPAN = { full: [-Math.PI / 2, 1.5 * Math.PI], down: [-0.1 * Math.PI, 1.1 * Math.PI], up: [0.9 * Math.PI, 2.1 * Math.PI], right: [-0.6 * Math.PI, 0.6 * Math.PI], left: [0.4 * Math.PI, 1.6 * Math.PI] }[arc];
    if (arc !== "full") R = Math.max(R, ((n - 1) * 66) / (SPAN[1] - SPAN[0]));
    const cx = arc === "right" || arc === "left" ? sx : Math.max(R * (arc === "full" ? 1 : 0.2) + 40, Math.min(W - R * (arc === "full" ? 1 : 0.2) - 40, sx));
    const cy = arc === "full" ? Math.max(R + top, Math.min(H - R - 44, sy)) : Math.max(top - 54, Math.min(bottom, sy));
    const angleOf = (i) => arc === "full" ? SPAN[0] + (i * 2 * Math.PI) / n : SPAN[0] + (n > 1 ? (i * (SPAN[1] - SPAN[0])) / (n - 1) : 0);
    const hub = document.createElement("div"); hub.className = "rad-hub"; hub.style.left = cx + "px"; hub.style.top = cy + "px"; m.appendChild(hub);
    const label = document.createElement("div");
    label.className = "rad-label";
    label.style.left = cx + "px";
    if (arc === "down") { label.style.top = (cy + R + 36) + "px"; label.classList.add("below"); }
    else label.style.top = (cy - R - 40) + "px";
    const titleOf = () => (typeof o.title === "function" ? o.title() : o.title) || "";
    label.innerHTML = titleOf();
    m.appendChild(label);
    _ring = { items: {}, focus: null, label, titleOf, get defTitle() { return titleOf(); }, cx, cy, R, arc, anchor: o.anchor || null };
    m.style.transform = "";
    items.forEach((it, i) => {
      const a = angleOf(i);
      const b = document.createElement("button");
      b.className = "rad-item" + (it.cls ? " " + it.cls : "");
      if (it.color) b.style.setProperty("--ec", it.color);
      b.style.left = (cx + Math.cos(a) * R) + "px";
      b.style.top = (cy + Math.sin(a) * R) + "px";
      b.style.setProperty("--d", (i * 25) + "ms");
      const render = () => { const h = typeof it.html === "function" ? it.html() : it.html; if (b._h !== h) { b.innerHTML = h; b._h = h; } if (it.isDisabled) b.classList.toggle("cant", !!it.isDisabled()); };
      render();
      const focus = () => {
        if (_ring.focus && _ring.items[_ring.focus]) _ring.items[_ring.focus].el.classList.remove("focus");
        _ring.focus = it.key; b.classList.add("focus");
        if (it.onFocus) it.onFocus();
        label.innerHTML = it.focusHtml ? (typeof it.focusHtml === "function" ? it.focusHtml() : it.focusHtml) : _ring.defTitle;
      };
      b.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") { if (it.onFocus) it.onFocus(); if (it.confirm) focus(); } });
      b.onclick = (ev) => {
        ev.stopPropagation();
        if (!_ring || !b.isConnected) return; // a ring that has just closed
        if (it.isDisabled && it.isDisabled()) { sfx("reject"); return; }
        if (it.confirm && (!_ring || _ring.focus !== it.key)) { sfx("click"); focus(); return; }
        it.exec();
        if (_ring) render();
      };
      _ring.items[it.key] = { el: b, render, focusHtml: it.focusHtml };
      m.appendChild(b);
    });
    m.classList.add("show");
  }
  // the ring's caption sits above it, so keep the ring low enough that the caption clears the top bars
  function ringTop() {
    const stage = $("game-stage"), probe = $("safe-probe");
    const st = stage ? stage.getBoundingClientRect().top : 0;
    const safeB = probe ? probe.getBoundingClientRect().top - st : 12;
    return Math.max(86, safeB + 70);
  }
  function refreshRing() {
    if (!_ring) return;
    for (const k in _ring.items) _ring.items[k].render();
    // the caption follows the tower (its level changes the moment an upgrade is paid for)
    const f = _ring.focus && _ring.items[_ring.focus];
    const h = f && f.focusHtml ? (typeof f.focusHtml === "function" ? f.focusHtml() : f.focusHtml) : _ring.titleOf();
    if (_ring.label._h !== h) { _ring.label.innerHTML = h; _ring.label._h = h; }
  }
  // keep the ring on its tower/tile while the camera glides (clamped above the open card)
  function trackRing(sx, sy, maxY) {
    if (!_ring) return;
    _ringSpot = { sx, sy };
    const stage = $("game-stage"); const W = stage.clientWidth, H = stage.clientHeight, R = _ring.R;
    let cx, cy;
    if (_ring.arc && _ring.arc !== "full") { cx = sx; cy = Math.max(ringTop() - 54, Math.min(H - 44, sy)); }
    else {
      cx = Math.max(R + 40, Math.min(W - R - 40, sx));
      cy = Math.max(R + ringTop(), Math.min(Math.min(H - R - 44, (maxY || H) - R - 30), sy));
    }
    $("radial-menu").style.transform = `translate(${Math.round(cx - _ring.cx)}px, ${Math.round(cy - _ring.cy)}px)`;
  }

  const curOf = (v, el) => v.state.economy === "shared" ? v.player.gold : v.player.essence[el];
  const curIcon = (v, el) => v.state.economy === "shared" ? icon("coins", "gold") : sigil(el, "sm");

  // tags every tower shows: what it hits, its damage type, whether it sees stealth
  function towerTags(def, arche, level) {
    const a = arche || def.archetype;
    const air = a !== "splash" && a !== "melee";
    const det = def.element === "light" || (level || 1) >= 7 || a === "support";
    const dt = R.DAMAGE_TYPES[R.towerDamageType(def, a)];
    return { air, det, dt };
  }
  // Build ring: one bubble per unlocked tower of every element in this run
  // Build ring: one bubble per unlocked tower of every element in this run, plus "move the builder here".
  // The chosen square stays live: drag it to shift the spot (the ring follows), tap elsewhere to start over.
  // With several elements in play the ring has two levels: first one bubble per element (its sigil, how many
  // towers you can build and the cheapest price), tap one to open that element's towers; a back bubble returns
  // to the elements. With a single element the towers show straight away.
  let _ringSpot = null;
  function openBuildRing(corr, tile, sx, sy, o = {}) {
    closeAllPanels();
    const v = getView(); v.buildTile = tile; v.buildMenuOpen = true;
    const spot = { canBuild: o.canBuild !== false };
    const els = (v.player && v.player.buildable) || [corr.element];
    const byEl = {}, locked = {};
    for (const e of els) {
      const slots = DB.unlockedTowerSlots(masteryLevel(e));
      byEl[e] = DB.TOWERS.filter((t) => t.element === e && t.slot < slots).map((t0) => R.towerX(t0));
      locked[e] = DB.TOWERS.filter((t) => t.element === e && t.slot >= slots).length;
    }
    const grouped = els.length > 1;
    const cur = () => v.state.economy === "shared" ? `${curIcon(v, corr.element)} ${Math.floor(curOf(v, corr.element))}` : els.map((e) => `${sigil(e, "xs")} ${Math.floor(curOf(v, e))}`).join(" ");
    const noRoom = () => `<span class="rl-main">No room to build here</span><span class="rl-dim">${icon("move", "xs")} Drag the square · ${icon("pin", "xs")} or send your builder</span>`;
    const tail = () => {
      const extra = [];
      if (corr.builder && cmd.moveBuilder) extra.push({ key: "mv", cls: "rad-builder", confirm: false,
        html: `${icon("pin")}<span class="ri-cost">Builder</span>`,
        exec: () => { cmd.moveBuilder(corr.index, tile.c, tile.r); closeAllPanels(); } });
      extra.push({ key: "x", cls: "rad-cancel", confirm: false, html: icon("close"), exec: closeAllPanels });
      return extra;
    };
    const towerItem = (t) => {
      const el = DB.ELEMENTS[t.element];
      return {
        key: t.id, color: el.color, confirm: true,
        html: `<img class="ri-thumb" src="${thumb(t.id)}" alt=""><span class="ri-cost">${t.cost}</span>`,
        focusHtml: () => {
          if (!spot.canBuild) return `<b>No room here</b><br><span class="rl-dim">Drag the square to a free spot</span>`;
          const tg = towerTags(t);
          const dps = t.archetype === "support" ? "aura" : `${Math.round(t.damage * t.fireRate * R.TUNE.towerDamage)} DPS`;
          const st = t.status ? ` · ${DB.STATUSES[t.status].icon} ${DB.STATUSES[t.status].name}` : "";
          return `<b>${t.name}</b> — ${t.cost} · ${dps}${st}<br><span class="rl-dim">${tg.dt.icon} ${tg.dt.name} · ${tg.air ? "🪽 hits air" : "ground only"}${tg.det ? " · 👁 sees stealth" : ""} · tap again to build</span>`;
        },
        onFocus: () => { v.buildPreview = { range: t.range }; },
        exec: () => { if (!spot.canBuild) { sfx("reject"); return; } cmd.build(corr.index, tile.c, tile.r, t.id); closeAllPanels(); },
        isDisabled: () => !spot.canBuild || curOf(v, t.element) < t.cost,
      };
    };
    const where = () => _ringSpot || { sx, sy };
    const show = (el) => {
      let items, title;
      if (!grouped || el) {
        const e = el || els[0];
        items = byEl[e].map(towerItem);
        if (grouped) items.push({ key: "back", cls: "rad-back", confirm: false, html: `${icon("back")}<span class="ri-cost">Elements</span>`, exec: () => { v.buildPreview = null; show(null); } });
        items.push(...tail());
        const lk = grouped ? locked[e] : els.reduce((a, x) => a + locked[x], 0);
        title = () => spot.canBuild
          ? `<span class="rl-main">${grouped ? `${sigil(e, "sm")} ${DB.ELEMENTS[e].name} · ` : "Build · "}${cur()}</span><span class="rl-dim">${icon("move", "xs")} Drag the square to shift it${lk ? ` · ${icon("lock", "xs")} ${lk} more with Mastery` : ""}</span>`
          : noRoom();
      } else {
        items = els.map((e) => {
          const E = DB.ELEMENTS[e], list = byEl[e];
          const cheapest = list.length ? Math.min(...list.map((t) => t.cost)) : 0;
          return {
            key: "el:" + e, cls: "rad-el", color: E.color, confirm: false,
            html: () => `<span class="re-sig">${sigil(e, "")}</span><span class="ri-cost">${cheapest}+</span><span class="ri-n">${list.length}</span>`,
            isDisabled: () => !list.length,
            exec: () => { v.buildPreview = null; show(e); },
          };
        });
        items.push(...tail());
        title = () => spot.canBuild ? `<span class="rl-main">Build · ${cur()}</span><span class="rl-dim">Pick an element · ${icon("move", "xs")} drag the square to shift it</span>` : noRoom();
      }
      const p = where();
      showRing(p.sx, p.sy, items, { anchor: { u: tile.c + 0.5, v: tile.r + 0.5 }, title });
      _ring.kind = "build"; _ring.tile = tile; _ring.corr = corr; _ring.spot = spot; _ring.group = el || null;
      if (opts.onPanels) opts.onPanels();
    };
    _ringSpot = null;
    show(null);
  }
  // drag the build square: same ring, new spot (the caller says whether a tower fits there)
  function moveBuildSpot(c, r, canBuild) {
    if (!_ring || _ring.kind !== "build") return;
    const v = getView();
    _ring.tile.c = c; _ring.tile.r = r; v.buildTile = _ring.tile;
    _ring.anchor = { u: c + 0.5, v: r + 0.5 };
    _ring.spot.canBuild = canBuild;
    refreshRing();
  }

  // Tower ring: upgrade / target cycle / details / sell
  function openTowerRing(corr, tw, sx, sy) {
    closeAllPanels();
    const v = getView(); v.selectedTowerId = tw.id;
    const el = DB.ELEMENTS[tw.def.element], def = DB.TOWER_BY_ID[tw.def.id];
    const gold = () => curOf(v, def.element);
    const upCost = () => opts.upgradeCost ? opts.upgradeCost(tw.def, tw.level) : Math.round(def.cost * DB.SCALING.upgradeCostBase * Math.pow(DB.SCALING.costGrowth, tw.level - 1));
    const maxed = () => tw.level >= DB.CONFIG.maxLevel;
    const TM = ["first", "last", "strong", "weak"];
    const items = [
      { key: "up", color: el.color, confirm: false,
        html: () => maxed() ? `${icon("star", "gold")}<span class="ri-cost">MAX</span>` : `${icon("up")}<span class="ri-cost">${upCost()}</span>`,
        isDisabled: () => maxed() || gold() < upCost(),
        exec: () => { if (!maxed()) cmd.upgrade(corr.index, tw.id); } },
      { key: "tgt", confirm: false,
        html: () => `${icon("target")}<span class="ri-cost">${tw.targetMode || "first"}</span>`,
        exec: () => { const m = TM[(TM.indexOf(tw.targetMode || "first") + 1) % TM.length]; cmd.setTarget(corr.index, tw.id, m); } },
      { key: "sell", cls: "rad-sell", confirm: true,
        html: () => `${icon("coins")}<span class="ri-cost">+${sellRefund(def, tw.level, tw)}</span>`,
        focusHtml: () => `<b>Sell for +${sellRefund(def, tw.level, tw)}</b><br><span class="rl-dim">tap again to confirm</span>`,
        exec: () => { cmd.sell(corr.index, tw.id); closeAllPanels(); } },
      { key: "x", cls: "rad-cancel", confirm: false, html: icon("close"), exec: closeAllPanels },
    ];
    const S = DB.CONFIG.towerSize;
    showRing(sx, sy, items, { anchor: { u: tw.c + S / 2, v: tw.r + S / 2 }, title: () => `${sigil(def.element, "sm")} ${def.name} · Lv${tw.level}${tw.upT > 0 ? " · upgrading…" : tw.bState ? " · building…" : ""}` });
    renderTowerCard(corr, tw, false);
  }

  // ---- synergy helpers (display-only views over DB.SYNERGIES) ---------------
  function synergyEffectText(syn) {
    const parts = [];
    if (syn.burst) parts.push(syn.burst + " burst dmg");
    if (syn.dotMult) parts.push("×" + syn.dotMult + " poison dmg");
    if (syn.curseBoost) parts.push("×" + syn.curseBoost + " curse dmg");
    if (syn.execute) parts.push("executes below " + Math.round(syn.execute * 100) + "% HP");
    if (syn.spread) parts.push("spreads statuses to nearby enemies");
    if (syn.anchor) parts.push("anchors the tower onto the target");
    return parts.join(", ");
  }
  function synergiesForTower(def) {
    const setsUp = [], triggers = [];
    if (def.status) for (const key in DB.SYNERGIES) {
      const [st, el] = key.split("|");
      if (st === def.status && el !== def.element) setsUp.push({ syn: DB.SYNERGIES[key], status: DB.STATUSES[st], el: DB.ELEMENTS[el] });
    }
    for (const key in DB.SYNERGIES) {
      const [st, el] = key.split("|");
      if (el === def.element && st !== def.status) triggers.push({ syn: DB.SYNERGIES[key], status: DB.STATUSES[st], el: DB.ELEMENTS[el] });
    }
    return { setsUp, triggers };
  }

  // ---- HUD -----------------------------------------------------------------
  function updateTopBar() {
    const v = getView(), pl = v.player;
    if (!pl) return;
    setText("lives", (v.state.gameMode === "coop" ? v.state.coopLives : pl.lives) + "/" + pl.maxLives);
    if (v.state.economy === "shared") setHTML("currency-display", icon("coins", "gold") + "<span>" + Math.floor(pl.gold) + "</span>");
    else { const cur = pl.elements[v.view === "field" ? Math.min(v.activeCorridor, pl.elements.length - 1) : 0]; setHTML("currency-display", sigil(cur, "sm") + "<span>" + Math.floor(pl.essence[cur]) + "</span>"); }
    const fld = v.field || pl;
    setText("wave-num", v.state.mode === "endless" ? fld.wave : (fld.wave + "/" + fld.totalWaves));
    const m = Math.floor(v.time / 60), s = Math.floor(v.time % 60);
    setText("match-time", (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s);
  }

  function updateEnemyOverview() {
    const ov = $("enemy-overview"); if (!ov) return;
    const v = getView();
    let html;
    if (v.versus) {
      html = `<div class="ov-head">Corridors · sends travel → <i class="ov-car">▾</i></div>`;
      v.state.players.forEach((p, i) => {
        const el = DB.ELEMENTS[p.elements[0]];
        let inside = 0; for (const e of v.state.enemies) if (e.owner === i) inside++;
        const name = v.seatName ? v.seatName(i) : (i === v.me ? "You" : (v.anonymous ? "Rival " : "NPC ") + i);
        const hide = v.anonymous && i !== v.me;
        html += `<div class="ov-row ${p.alive ? "" : "dead"}" data-ci="${i}">
          <span class="ov-el" style="color:${hide ? "#c8c8e0" : el.color}">${hide ? "🎭" : sigil(p.elements[0], "xs")} ${name}</span>
          <span class="ov-num">${p.alive ? "❤" + p.lives + " · " + inside : "☠ out"}</span>
          <div class="ov-bar"><div style="width:${Math.min(100, (p.lives / p.maxLives) * 100)}%;background:${p.alive ? el.color : "#555"}"></div></div></div>`;
      });
    } else {
      const fld = v.field;
      html = `<div class="ov-head">Survivors by Origin <i class="ov-car">▾</i></div>`;
      for (let i = 0; i < fld.corridorCount; i++) {
        const el = DB.ELEMENTS[fld.elements[i]];
        let alive = 0; for (const e of v.state.enemies) if (e.owner === v.fieldId && e.originIndex === i) alive++;
        const total = fld.corridors[i].spawnedTotal, pct = total ? alive / total : 0;
        html += `<div class="ov-row" data-ci="${i}"><span class="ov-el" style="color:${el.color}">${sigil(fld.elements[i], "xs")} ${el.name}</span><span class="ov-num">${alive}/${total}</span><div class="ov-bar"><div style="width:${pct * 100}%;background:${el.color}"></div></div></div>`;
      }
    }
    if (ov._h === html) return;
    ov._h = html; ov.innerHTML = html;
    ov.querySelectorAll(".ov-row").forEach((r) => r.onclick = (e) => { e.stopPropagation(); opts.enterCorridor(+r.dataset.ci); });
  }

  function updateWavePanel() {
    const v = getView(), pl = v.field;
    let label = `${icon("play")} Start Wave ${pl.wave + 1}`;
    if (v.state.mode !== "endless" && pl.wave >= pl.totalWaves && pl.phase !== "prep") label = "Clear Enemies";
    if (pl.phase === "prep") label = `${icon("skull")} Summon at the Vortex`;
    if (pl.phase === "endboss") label = "Boss Active";
    const b = $("quick-start-wave");
    if (v.online) { const sb0 = $("quick-speed-cycle"); if (sb0) sb0.style.display = "none"; updateWavePreview(); return; }
    if (v.versus) { const sb = $("quick-speed-cycle"); if (sb) sb.innerHTML = `${icon("speed")}<span>×${v.speed}</span>`; updateWavePreview(); return; } // the shared wave timer owns the button
    { const sb0 = $("quick-speed-cycle"); if (sb0) sb0.style.display = ""; }
    if (b) { if (b._h !== label) { b.innerHTML = label; b._h = label; } b.classList.toggle("disabled", pl.phase === "endboss"); b.classList.toggle("boss", pl.phase === "prep"); }
    const sb = $("quick-speed-cycle"); if (sb) sb.innerHTML = `${icon("speed")}<span>×${v.speed}</span>`;
    updateWavePreview();
  }

  // what your defence is missing against these creeps: flyers with no anti-air, stealth with no eyes
  function defenceWarnings(v, types) {
    if (!v.state.x) return [];
    let fly = false, stealth = false;
    for (const t of types) { const d = v.state.bal.enemies[t]; const tr = (d && d.x && d.x.t) || {}; if (tr.fly) fly = true; if (tr.invisible || tr.cloakCycle || tr.cloakAura) stealth = true; }
    if (!fly && !stealth) return [];
    const corrs = v.versus ? [v.player.corridors[0]] : v.field.corridors;
    let air = 0, det = 0, n = 0;
    for (const c of corrs) if (c) for (const tw of c.towers) {
      n++; let a = tw.def.archetype;
      for (const mid of tw.mutations) { const mm = tw.def.mutations.find((x) => x.id === mid); if (mm && mm.mods.archetype) a = mm.mods.archetype; }
      if (a !== "splash" && a !== "melee" && a !== "support") air++;
      if (tw.def.element === "light" || tw.level >= 7 || a === "support") det++;
    }
    const out = [];
    if (fly && air === 0) out.push({ text: "🪽 No anti-air!", tip: "Flyers ignore the maze. Splash and blade towers can't hit them — build single-target, beam or chain towers near the middle." });
    else if (fly && air < n * 0.35) out.push({ text: "🪽 Little anti-air", tip: "Only a few of your towers can hit flyers." });
    if (stealth && det === 0) out.push({ text: "👁 No detection!", tip: "Invisible creeps need a Light tower, a support tower or any tower at level 7+. Your builder's lantern sees a few tiles — Inspire a tower to park it there. Once seen, a creep stays marked for a moment." });
    return out;
  }
  // ---- next-wave preview (display-only; mirrors deterministic generateWave) --
  function updateWavePreview() {
    const wp = $("wave-preview"); if (!wp) return;
    const v = getView(), pl = v.field;
    let html = "";
    if (pl.phase === "build" && (v.state.mode === "endless" || pl.wave < pl.totalWaves) || (v.versus && pl.alive)) {
      const next = pl.wave + 1;
      const isBoss = opts.isBossWave ? opts.isBossWave(v.state, pl, next) : next % DB.CONFIG.bossEvery === 0;
      const agg = {};
      const groups = (v.state.x && opts.previewWave) ? opts.previewWave(v.state, pl, next) : generateWave(next, pl.corridorCount, DB.CONFIG.bossEvery);
      for (const g of groups) agg[g.type] = (agg[g.type] || 0) + g.count;
      const affix = waveAffix(v.state.seedBase, next, DB.CONFIG.bossEvery);
      const parts = Object.keys(agg).map((t) => {
        const d = DB.ENEMIES[t] || { name: t };
        const n = (affix && affix.countMult) ? Math.max(1, Math.round(agg[t] * affix.countMult)) : agg[t];
        const m = MOB_BY_ID[t], tr = m ? m.traits : {};
        const tag = tr.fly ? " 🪽" : (tr.invisible || tr.cloakCycle) ? " 👁" : "";
        return `<span class="wprev-item${d.boss || (m && m.elite) ? " boss" : ""}" title="${m ? m.desc : ""}"><img src="${ethumb(t)}" alt="">${n}× ${d.name}${tag}</span>`;
      });
      html = `<span class="wprev-label${isBoss ? " boss" : ""}">${isBoss ? "⚠ Boss Wave " + next : "Next"}</span> ${parts.join("")}`;
      if (affix) html += ` <span class="wprev-affix" title="${affix.desc}">${affix.icon} ${affix.name}</span>`;
      for (const w of defenceWarnings(v, Object.keys(agg))) html += ` <span class="wprev-warn" title="${w.tip}">${w.text}</span>`;
    } else if (pl.phase === "prep") {
      const bossT = v.state.challenge ? v.state.challenge.def.boss : "endboss";
      html = `<span class="wprev-label boss">⚠ Final</span> <span class="wprev-item boss"><img src="${ethumb(bossT)}" alt="">1× ${(DB.ENEMIES[bossT] && DB.ENEMIES[bossT].name) || "End Boss"}</span>`;
    }
    if (wp._h !== html) { wp.innerHTML = html; wp._h = html; }
    wp.classList.toggle("show", !!html);
  }

  // ---------------------------------------------------------------------------
  // CARDS — one sheet system for towers, enemies, the builder, sends and the wave guide.
  // Phones: a compact card above the dock that expands (grip / "More"). Wide screens: a side panel.
  // Cards never move or zoom the camera.
  // ---------------------------------------------------------------------------
  const SHEETS = ["tower-panel", "enemy-panel", "builder-panel", "send-panel", "wave-panel"];
  function bindSheets() {
    for (const id of SHEETS) {
      const p = $(id); if (!p || p._bound) continue; p._bound = true;
      p.addEventListener("click", (e) => {
        if (e.target.closest("[data-close]")) { e.stopPropagation(); closeAllPanels(); return; }
        if (e.target.closest("[data-more]")) { p.classList.toggle("full"); sfx("click"); positionPortrait(); return; }
        const g = e.target.closest("[data-grip]");
        if (g && !g._dragged) { p.classList.toggle("full"); positionPortrait(); }
      });
      let y0 = null;
      p.addEventListener("pointerdown", (e) => { const g = e.target.closest("[data-grip]"); if (g) { y0 = e.clientY; g._dragged = false; } });
      p.addEventListener("pointerup", (e) => {
        if (y0 == null) return; const dy = e.clientY - y0; y0 = null;
        const g = e.target.closest("[data-grip]") || p.querySelector("[data-grip]");
        if (Math.abs(dy) < 24) return;
        if (g) { g._dragged = true; setTimeout(() => { g._dragged = false; }, 0); }
        if (dy < 0) p.classList.add("full");
        else if (p.classList.contains("full")) p.classList.remove("full");
        else closeAllPanels();
        positionPortrait();
      });
    }
  }
  // live cards refresh several times a second: patch the DOM in place instead of rebuilding it, so a finger
  // that is mid-swipe on a list (or a button being pressed) is never interrupted by a refresh
  function morphChildren(a, b) {
    const bn = Array.from(b.childNodes);
    for (let i = 0; i < bn.length; i++) {
      const x = a.childNodes[i], y = bn[i];
      if (!x) { a.appendChild(y); continue; }
      if (x.nodeType !== y.nodeType || x.nodeName !== y.nodeName) { a.replaceChild(y, x); continue; }
      if (x.nodeType !== 1) { if (x.nodeValue !== y.nodeValue) x.nodeValue = y.nodeValue; continue; }
      for (const at of Array.from(x.attributes)) if (!y.hasAttribute(at.name)) x.removeAttribute(at.name);
      for (const at of Array.from(y.attributes)) if (x.getAttribute(at.name) !== at.value) x.setAttribute(at.name, at.value);
      morphChildren(x, y);
    }
    while (a.childNodes.length > bn.length) a.removeChild(a.lastChild);
  }
  function morph(el, html) {
    if (!el.firstChild) { el.innerHTML = html; return; }
    const t = document.createElement("div"); t.innerHTML = html;
    morphChildren(el, t);
  }
  function fillSheet(p, html) { morph(p, html); }
  function sheetHTML(head, peek, more) {
    return `<div class="sh-grip" data-grip><span></span></div><div class="sh-scroll">${head}${peek}${more ? `<div class="sh-more">${more}</div>` : ""}</div>${more ? `<button class="sh-toggle" data-more><span class="m1">More ▾</span><span class="m2">Less ▴</span></button>` : ""}`;
  }
  function sheetHead(o) {
    return `<div class="sh-head"${o.color ? ` style="--ec:${o.color}"` : ""}>${o.thumb || ""}<div class="sh-title"><div class="sh-name">${o.title}</div>${o.sub ? `<div class="sh-sub">${o.sub}</div>` : ""}</div>${o.right || ""}<button class="sh-x" data-close aria-label="Close">${icon("close")}</button></div>`;
  }
  function openSheet(id, full) {
    for (const s of SHEETS) if (s !== id) { const e = $(s); if (e) e.classList.remove("show"); }
    const p = $(id); p.classList.add("show");
    if (full != null) p.classList.toggle("full", !!full);
    return p;
  }
  const capW = (x) => String(x || "").replace(/^./, (c) => c.toUpperCase());
  const chip = (html, cls, attrs) => `<span class="chip${cls ? " " + cls : ""}"${attrs || ""}>${html}</span>`;

  // ---- tower card (opened together with the tower ring) -------------------------
  let _twRef = null;
  function towerCardHTML(corr, tw) {
    const v = getView();
    const el = DB.ELEMENTS[tw.def.element], def = DB.TOWER_BY_ID[tw.def.id];
    const maxed = tw.level >= DB.CONFIG.maxLevel;
    const slots = DB.mutationSlotsAvailable(masteryLevel(tw.def.element));
    const expNeed = tw.expert < 5 ? DB.CONFIG.expertThresholds[tw.expert] : tw.kills;
    const expPct = tw.expert < 5 ? Math.min(1, tw.kills / expNeed) : 1;
    const cur = towerView(def, tw.level, tw.expert);
    const nxt = maxed ? null : towerView(def, tw.level + 1, tw.expert);
    const stage = tw.level >= 10 ? 3 : tw.level >= 7 ? 2 : tw.level >= 4 ? 1 : 0;
    let arche = def.archetype;
    for (const mid of tw.mutations) { const m = def.mutations.find((x) => x.id === mid); if (m && m.mods.archetype) arche = m.mods.archetype; }
    const tg = towerTags(def, arche, tw.level);
    const air = tg.air, det = tg.det;
    const stars = [0, 1, 2, 3, 4].map((i) => `<i class="${i < tw.expert ? "on" : ""}">★</i>`).join("");
    const head = sheetHead({
      color: el.color,
      thumb: `<img class="sh-thumb" src="${thumb(def.id, stage)}" alt="">`,
      title: `${def.name} <span class="lv">Lv ${tw.level}${maxed ? " · MAX" : "/10"}</span>`,
      sub: `${sigil(def.element, "xs")} ${el.name} · ${capW(arche)} · targets ${tw.targetMode || "first"}`,
    });
    const delta = (a, b, f) => (b != null && f(b) !== f(a)) ? `<em>→${f(b)}</em>` : "";
    const r0 = (x) => Math.round(x), r1 = (x) => x.toFixed(1), r2 = (x) => x.toFixed(2);
    // the three numbers that matter, with what the next level brings
    const tiles = [];
    if (def.archetype !== "support") tiles.push(`<div class="tc-tile"><span>DPS</span><b>${r0(cur.dmg * cur.rate)}${delta(cur.dmg * cur.rate, nxt && nxt.dmg * nxt.rate, r0)}</b></div>`);
    else tiles.push(`<div class="tc-tile"><span>Aura</span><b>${def.status ? DB.STATUSES[def.status].icon : "✦"}</b></div>`);
    tiles.push(`<div class="tc-tile"><span>Range</span><b>${r1(cur.range)}${delta(cur.range, nxt && nxt.range, r1)}</b></div>`);
    tiles.push(`<div class="tc-tile"><span>Speed</span><b>${r2(cur.rate)}<small>/s</small>${delta(cur.rate, nxt && nxt.rate, r2)}</b></div>`);
    // what it hits, in one quiet line
    let tags = "";
    if (v.state.x && arche !== "support") tags += `<span class="tc-tag" style="--dc:${tg.dt.color}" title="${tg.dt.desc}">${tg.dt.icon} ${tg.dt.name}</span>`;
    if (def.status) tags += `<span class="tc-tag">${DB.STATUSES[def.status].icon} ${DB.STATUSES[def.status].name}</span>`;
    if (v.state.x) {
      tags += `<span class="tc-tag ${air ? "" : "no"}">🪽 ${air ? "Hits air" : "Ground only"}</span>`;
      tags += `<span class="tc-tag ${det ? "good" : "no"}" title="${det ? "Reveals invisible creeps in its range" : "Light towers, support towers and any tower at level 7+ detect stealth"}">👁 ${det ? "Sees stealth" : "Stealth at Lv 7"}</span>`;
    }
    // only when something needs attention
    const alerts = [];
    if (v.state.x) {
      if (tw.bState) alerts.push(`🔨 ${tw.bState === 1 ? "Waiting for the builder" : "Building " + Math.round((1 - tw.bT / (tw.bMax || 1)) * 100) + "%"}`);
      if (tw.upT > 0) alerts.push("⬆ Upgrading…");
      if (tw.stunT > 0) alerts.push("💫 Stunned");
      if (tw.jamT > 0 || (tw.xRate && tw.xRate < fx.ONE)) alerts.push("🐌 Slowed");
      if (tw.curseT > 0 || (tw.xDmg && tw.xDmg < fx.ONE)) alerts.push("🧪 Weakened");
      if (tw.confused) alerts.push("🌀 Confused");
    }
    const good = corr.builder && corr.builder.at === tw.id ? `<span class="tc-good">✨ Inspired · +10% attack speed</span>` : "";
    const mutHint = maxed && slots > tw.mutations.length ? `<button class="tc-mut" data-more>🧬 ${slots - tw.mutations.length} mutation${slots - tw.mutations.length > 1 ? "s" : ""} to choose ${icon("right", "xs")}</button>` : "";
    const peek = `<div class="tc-tiles">${tiles.join("")}</div><div class="tc-tags">${tags}</div>${alerts.length ? `<div class="tc-alert">${alerts.join(" · ")}</div>` : ""}${good}${mutHint}
      <div class="xp-row"><span class="stars" title="Expertise">${stars}</span><div class="exp-bar"><div style="width:${expPct * 100}%"></div></div><span class="xp-n">${tw.expert < 5 ? tw.kills + "/" + expNeed + " kills" : "MAX"}</span></div>`;
    let more = `${def.desc ? `<p class="sh-desc">${def.desc}</p>` : ""}
      <div class="tp-target"><span class="tt-lbl">Target</span>${["first", "last", "strong", "weak"].map((m) => `<button class="tm-btn ${(tw.targetMode || "first") === m ? "sel" : ""}" data-tm="${m}">${m[0].toUpperCase() + m.slice(1)}</button>`).join("")}</div>
      <div class="tp-stats">${statRow("Damage per hit", r0(cur.dmg), nxt && r0(nxt.dmg))}${statRow("Kills", tw.kills)}${tw.dmgDone ? statRow("Damage dealt", Math.round(tw.dmgDone / 65536)) : ""}${statRow("Sell refund", "+" + sellRefund(def, tw.level, tw))}</div>
      ${towerSynergyHtml(def, v)}`;
    if (maxed) {
      more += `<div class="tp-mut-head">Mutations ${slots ? `(${tw.mutations.length}/${slots})` : "(locked — raise Mastery)"}</div><div class="tp-muts">`;
      def.mutations.forEach((m) => { const have = tw.mutations.includes(m.id); more += `<button class="mut-card ${have ? "have" : ""}" data-mut="${m.id}"><div class="mut-name">${m.name}</div><div class="mut-desc">${m.desc}</div></button>`; });
      more += `</div>`;
    } else more += `<div class="tp-mut-head dim">Mutations unlock at level 10</div>`;
    return sheetHTML(head, peek, more);
  }
  function renderTowerCard(corr, tw, full) {
    const p = openSheet("tower-panel", full);
    fillSheet(p, towerCardHTML(corr, tw));
    p.querySelectorAll("[data-mut]").forEach((b) => b.onclick = () => cmd.mutate(corr.index, tw.id, b.dataset.mut));
    p.querySelectorAll("[data-tm]").forEach((b) => b.onclick = () => cmd.setTarget(corr.index, tw.id, b.dataset.tm));
    _twRef = { corr, tw }; _twSig = twSig(tw) + (corr.builder ? corr.builder.at : "");
    if (opts.onPanels) opts.onPanels();
  }
  function openTowerPanel(corr, tw) {
    const keepRing = _ring && getView().selectedTowerId === tw.id;
    if (!keepRing) { closeAllPanels(); getView().selectedTowerId = tw.id; }
    renderTowerCard(corr, tw, true);
  }

  // ---- enemy card (+ the live portrait bubble beside it) --------------------------
  let _epTip = null;
  function enemyCardHTML(e) {
    const v = getView();
    const oid = v.versus ? v.state.players[e.owner].elements[0] : v.field.elements[e.originIndex];
    const oel = DB.ELEMENTS[oid];
    const m = MOB_BY_ID[e.type];
    const stk = (e.statusKeys || []).map((k) => DB.STATUSES[k]).filter(Boolean);
    const affix = e.affix && AFFIXES[e.affix];
    const name = (DB.ENEMIES[e.type] || {}).name || e.type;
    const following = opts.isFollowing ? opts.isFollowing(e.id) : false;
    const tags = [];
    if (e.end) tags.push(`<span class="tag-b boss">END BOSS</span>`); else if (e.boss) tags.push(`<span class="tag-b boss">BOSS</span>`);
    if (e.sent) tags.push(`<span class="tag-b">SENT</span>`);
    if (affix) tags.push(`<span class="tag-b gold" data-tip="affix">${affix.icon} ${affix.name}</span>`);
    const sub = `${sigil(oid, "xs")} ${oel.name}${e.loopCount ? " · loop " + (e.loopCount + 1) : ""}${e.sentBy != null && v.versus ? " · from " + (v.seatName ? v.seatName(e.sentBy) : "NPC " + e.sentBy) : ""}`;
    const head = sheetHead({ title: `${name} ${tags.join("")}`, sub, color: oel.color,
      right: `<button class="sh-btn ${following ? "on" : ""}" data-follow>${following ? "📍 Following" : "📍 Follow"}</button>` });
    const hpR = (x) => Math.round(opts.hpReal ? opts.hpReal(v.state, x) : toI(x));
    const hp = Math.max(0, hpR(e.hp)), mhp = Math.max(1, hpR(e.maxHp));
    let bars = `<div class="hp-bar"><div style="width:${Math.min(100, (hp / mhp) * 100)}%"></div><span>${hp} / ${mhp}</span></div>`;
    if (e.shieldHp > 0) bars += `<div class="sh-bar"><div style="width:${Math.min(100, (e.shieldHp / Math.max(1, e.maxHp / 2)) * 100)}%"></div><span>🛡 ${hpR(e.shieldHp)}</span></div>`;
    const tips = {};
    let chips = "";
    for (const s of stk) chips += chip(`${s.icon} ${s.name}`, "st", ` style="--sc:${s.color}"`);
    if (e.hidden) { chips += chip("👁 Hidden", "warn", ` data-tip="hidden"`); tips.hidden = "Your towers can't see it — Light towers, support towers, any tower at level 7+ and your builder's lantern reveal stealth. Once seen, it stays marked for 2.5 s."; }
    else if (e.byBuilder) chips += chip("🏮 Spotted by your builder", "good");
    if (e.invulnT > 0) chips += chip("✨ Invulnerable", "warn");
    const cls = e.cls || (m && m.armorClass) || "medium";
    let tiles = "";
    { const ac = ARMOR_CLASSES[cls];
      const cut = v.state.x ? R.armorReductionPct(toI(e.armor) + toI(e.auraArmor || 0)) : 0;
      if (ac) { tips.ac = `<b>${ac.name} armour</b> — ${R.armorClassText(cls)}. Its armour value ${toI(e.armor)} cuts damage by ${cut}%.`; }
      tiles = `<div class="tc-tiles"><button class="tc-tile" data-tip="ac" style="text-align:left"><span>Armour</span><b style="color:${ac ? ac.color : "inherit"};font-size:14px">${ac ? ac.name : "—"}${cut ? `<small> −${cut}%</small>` : ""}</b></button>
        <div class="tc-tile"><span>Reward</span><b style="color:#ffe68a">+${e.reward}</b></div>
        <div class="tc-tile"><span>If it leaks</span><b style="color:#ff8fa0">♥ −${e.boss ? 2 : 1}</b></div></div>`; }
    if (m) {
      traitList(m.traits).forEach(([i, n, d], k) => { chips += chip(`${i} ${n}`, "", ` data-tip="t${k}"`); tips["t" + k] = `<b>${n}</b> — ${d}`; });
    }
    if (affix) tips.affix = `<b>${affix.name}</b> — ${affix.desc}`;
    const tip = _epTip && tips[_epTip] ? `<div class="tip-line">${tips[_epTip]}</div>` : "";
    const peek = `${bars}${tiles}<div class="chips">${chips || "<span class='chip no'>No special traits</span>"}</div>${tip}`;
    const adapts = Object.keys(e.adapt || {}).map((k) => { const a = ADAPT_INFO[k] || { icon: "↻", name: k }; const n = e.adapt[k]; return chip(`${a.icon} ${a.name}${n > 1 ? " ×" + n : ""}`, "gold"); });
    const more = `${m ? `<p class="sh-desc">${m.desc}</p>` : ""}<div class="tp-stats">${statRow("Armour", toI(e.armor) + (e.auraArmor ? " +" + toI(e.auraArmor) : "") + (v.state.x ? ` (−${R.armorReductionPct(toI(e.armor) + toI(e.auraArmor || 0))}% damage)` : ""))}${statRow("Reward", e.reward)}${statRow("Loops", e.loopCount)}</div>${adapts.length ? `<div class="tp-mut-head">↻ Loop adaptations</div><div class="chips">${adapts.join("")}</div>` : ""}`;
    return sheetHTML(head, peek, more);
  }
  function openEnemyPanel(e) {
    const v = getView();
    if (v.selectedEnemyId !== e.id) { closeAllPanels(); v.selectedEnemyId = e.id; _epTip = null; if (opts.onEnemySelect) opts.onEnemySelect(e.id); }
    const p = openSheet("enemy-panel");
    fillSheet(p, enemyCardHTML(e));
    p.querySelectorAll("[data-tip]").forEach((b) => b.onclick = (ev) => { ev.stopPropagation(); _epTip = _epTip === b.dataset.tip ? null : b.dataset.tip; openEnemyPanel(e); });
    const fb = p.querySelector("[data-follow]"); if (fb) fb.onclick = (ev) => { ev.stopPropagation(); if (opts.toggleFollow) opts.toggleFollow(e.id); openEnemyPanel(e); };
    positionPortrait();
    if (opts.onPanels) opts.onPanels();
  }
  function positionPortrait() {
    const pe = $("enemy-portrait"), p = $("enemy-panel"); if (!pe) return;
    const v = getView();
    if (!p || !p.classList.contains("show") || !v.selectedEnemyId) { pe.classList.remove("show"); return; }
    const r = p.getBoundingClientRect(), vw = window.innerWidth;
    const S = pe.offsetWidth || 92;
    if (r.left > vw * 0.45) { pe.style.left = (r.left + 8) + "px"; pe.style.top = (r.bottom + 12) + "px"; }
    else { pe.style.left = (r.left + 6) + "px"; pe.style.top = (r.top - S - 8) + "px"; }
    pe.classList.add("show");
  }

  // ---- builder card --------------------------------------------------------------
  let _bdSig = null, _bdCorr = null;
  function builderSig(corr) { const b = corr.builder; const tw = b.cur && corr.towers.find((t) => t.id === b.cur); return [b.cur, b.queue.join(","), b.insp, b.at, b.moving, tw ? Math.floor((tw.bT || 0) / 16384) : 0, Math.floor(getView().player.gold)].join("|"); }
  function builderCardHTML(corr) {
    const v = getView(), b = corr.builder, el = DB.ELEMENTS[corr.element];
    const tname = (t) => (DB.TOWER_BY_ID[t.def.id] || {}).name || t.def.id;
    const cur = b.cur ? corr.towers.find((t) => t.id === b.cur) : null;
    const insp = b.insp ? corr.towers.find((t) => t.id === b.insp) : null;
    let status;
    if (cur) status = cur.bState === 2 ? `🔨 Building <b>${tname(cur)}</b>` : `🚶 Walking to build <b>${tname(cur)}</b>`;
    else if (insp) status = b.at === insp.id ? `✨ Inspiring <b>${tname(insp)}</b> · +10% attack speed` : `🚶 Walking to inspire <b>${tname(insp)}</b>`;
    else status = "💤 Idle — waiting where the last job ended";
    const head = sheetHead({ color: el.color, thumb: `<div class="sh-ico" style="--ec:${el.color}">🔨</div>`, title: "Builder", sub: `${sigil(corr.element, "xs")} ${el.name} corridor` });
    const jobs = [cur, ...b.queue.map((id) => corr.towers.find((t) => t.id === id))].filter(Boolean);
    let peek = `<div class="bd-status">${status}</div>`;
    if (jobs.length) {
      peek += `<div class="bd-jobs">${jobs.map((t, i) => {
        const pct = t.bState === 2 ? Math.round((1 - t.bT / (t.bMax || 1)) * 100) : 0;
        return `<div class="bd-job"><img src="${thumb(t.def.id, 0)}" alt=""><div class="bd-jinfo"><b>${tname(t)}</b><div class="exp-bar"><div style="width:${pct}%"></div></div></div><span class="dim">${i === 0 && t.bState === 2 ? pct + "%" : "queued"}</span><button class="sh-btn" data-cancel="${t.id}">✕ +${t.def.cost}</button></div>`;
      }).join("")}</div>`;
    }
    const own = !v.versus || v.activeCorridor === v.me;
    let acts = "";
    if (own) {
      acts += insp ? `<button class="sh-act" data-stopinsp>✕ Stop inspiring</button>` : `<button class="sh-act" data-inspire>✨ Inspire a tower</button>`;
      acts += `<button class="sh-act" data-movebd>${icon("pin", "xs")} Move to…</button>`;
      if (v.versus) acts += `<button class="sh-act pink" data-sends>${icon("swords", "xs")} Sends</button>`;
    }
    if (acts) peek += `<div class="sh-acts">${acts}</div>`;
    peek += `<p class="sh-hint">${jobs.length ? "Cancelling a construction refunds it in full." : "Inspire: the builder stands beside a tower and speeds up its attacks by 10% while no construction is waiting."}</p>`;
    return sheetHTML(head, peek, "");
  }
  function openBuilderPanel(corr) {
    if (!corr || !corr.builder) return;
    if (_bdCorr !== corr || !$("builder-panel").classList.contains("show")) closeAllPanels();
    _bdCorr = corr;
    const p = openSheet("builder-panel", false);
    fillSheet(p, builderCardHTML(corr));
    _bdSig = builderSig(corr);
    p.querySelectorAll("[data-cancel]").forEach((bt) => bt.onclick = (ev) => { ev.stopPropagation(); cmd.sell(corr.index, +bt.dataset.cancel); });
    const ib = p.querySelector("[data-inspire]"); if (ib) ib.onclick = (ev) => { ev.stopPropagation(); startPick("inspire", corr); };
    const mb = p.querySelector("[data-movebd]"); if (mb) mb.onclick = (ev) => { ev.stopPropagation(); startPick("move", corr); };
    const sb = p.querySelector("[data-stopinsp]"); if (sb) sb.onclick = (ev) => { ev.stopPropagation(); cmd.inspire(corr.index, 0); };
    const se = p.querySelector("[data-sends]"); if (se) se.onclick = (ev) => { ev.stopPropagation(); toggleSendPanel(); };
    if (opts.onPanels) opts.onPanels();
  }
  // a "pick a tower" mode (Inspire): the next tower tap is the answer
  let _pick = null;
  function startPick(kind, corr) {
    closeAllPanels();
    _pick = { kind, corr };
    const h = $("pick-hint"); if (h) { h.innerHTML = `✨ Tap a tower to inspire <button class="sh-btn" id="pick-cancel">Cancel</button>`; h.classList.add("show"); $("pick-cancel").onclick = (e) => { e.stopPropagation(); endPick(); }; }
  }
  function endPick() { _pick = null; const h = $("pick-hint"); if (h) h.classList.remove("show"); }
  function pickTower(tw) {
    if (!_pick) return false;
    const p = _pick; endPick();
    if (tw && p.kind === "inspire") { cmd.inspire(p.corr.index, tw.id); toast("✨ The builder heads over to inspire it"); sfx("click"); }
    return true;
  }
  function pickSpot(c, r) {
    if (!_pick || _pick.kind !== "move") return false;
    const p = _pick; endPick();
    cmd.moveBuilder(p.corr.index, c, r);
    return true;
  }

  // ---- wave guide (ⓘ next to Start Wave) ---------------------------------------------
  let _wvTip = null;
  function waveGroups(v, pl, n) {
    const groups = (v.state.x && opts.previewWave) ? opts.previewWave(v.state, pl, n) : generateWave(n, pl.corridorCount, DB.CONFIG.bossEvery);
    const boss = opts.isBossWave ? opts.isBossWave(v.state, pl, n) : n % DB.CONFIG.bossEvery === 0;
    const affix = v.state.x && boss ? null : waveAffix(v.state.seedBase, n, DB.CONFIG.bossEvery);
    const agg = {};
    for (const g of groups) agg[g.type] = (agg[g.type] || 0) + g.count;
    for (const t in agg) if (affix && affix.countMult) agg[t] = Math.max(1, Math.round(agg[t] * affix.countMult));
    return { agg, affix, boss };
  }
  const mobIcons = (t) => { const m = MOB_BY_ID[t], tr = m ? m.traits : {}; return (tr.fly ? "🪽" : "") + (tr.invisible || tr.cloakCycle ? "👁" : ""); };
  function mobChip(t, n, key) {
    const d = DB.ENEMIES[t] || { name: t }, m = MOB_BY_ID[t];
    return `<button class="mob-chip${d.boss || (m && m.elite) ? " boss" : ""}${_wvTip === key ? " sel" : ""}" data-wtip="${key}"><img src="${ethumb(t)}" alt=""><b>${n}×</b> ${d.name} ${mobIcons(t)}</button>`;
  }
  function mobTip(t) {
    const d = DB.ENEMIES[t] || { name: t }, m = MOB_BY_ID[t];
    if (!m) { const cls = R.CLASSIC_ARMOR_CLASS[t]; const ac = cls && ARMOR_CLASSES[cls]; return `<b>${d.name}</b> — ♥ ${d.hp}${d.armor ? " · 🛡 " + d.armor : ""}${ac ? ` · <span style="color:${ac.color}">${ac.name}</span> <span class="dim">(${R.armorClassText(cls)})</span>` : ""}`; }
    const ac = ARMOR_CLASSES[m.armorClass];
    return `<b>${m.name}</b> — ♥ ${m.hp}${m.armor ? " · 🛡 " + m.armor : ""}${ac ? ` · <span style="color:${ac.color}">${ac.name}</span> <span class="dim">(${R.armorClassText(m.armorClass)})</span>` : ""}<br>${traitList(m.traits).map(([i, nm, ds]) => `${i} <b>${nm}</b>: ${ds}`).join("<br>")}${traitList(m.traits).length ? "<br>" : ""}<span class="dim">${m.desc}</span>`;
  }
  function waveCardHTML() {
    const v = getView(), pl = v.field;
    const total = v.state.mode === "endless" ? "∞" : pl.totalWaves;
    let alive = 0; const onField = {};
    for (const e of v.state.enemies) if (e.alive && e.owner === v.fieldId) { alive++; onField[e.type] = (onField[e.type] || 0) + 1; }
    const head = sheetHead({ title: "Wave guide", sub: `Wave ${pl.wave}/${total} · ${alive ? alive + " creeps on the field" : "field clear"}`, thumb: `<div class="sh-ico">${icon("wave")}</div>` });
    let body = "";
    const tipFor = {};
    if (alive) {
      body += `<div class="wv-sec"><div class="wv-h">On the field now</div><div class="chips">${Object.keys(onField).map((t) => { tipFor["f" + t] = t; return mobChip(t, onField[t], "f" + t); }).join("")}</div></div>`;
    }
    if (pl.phase === "prep" || (v.state.mode !== "endless" && pl.wave >= pl.totalWaves)) {
      const bossT = v.state.challenge ? v.state.challenge.def.boss : "endboss";
      tipFor.boss = bossT;
      body += `<div class="wv-sec boss"><div class="wv-h">⚠ Final — summon at the Vortex</div><div class="chips">${mobChip(bossT, 1, "boss")}</div></div>`;
    } else {
      const last = v.state.mode === "endless" ? pl.wave + 3 : Math.min(pl.totalWaves, pl.wave + 3);
      for (let n = pl.wave + 1; n <= last; n++) {
        const w = waveGroups(v, pl, n);
        const warns = defenceWarnings(v, Object.keys(w.agg));
        body += `<div class="wv-sec${w.boss ? " boss" : ""}"><div class="wv-h">${n === pl.wave + 1 ? "Next · " : ""}Wave ${n}${w.boss ? " · ⚠ Boss" : ""}${w.affix ? ` <span class="tag-b gold" title="${w.affix.desc}">${w.affix.icon} ${w.affix.name}</span>` : ""}</div>${w.affix ? `<div class="sh-hint">${w.affix.desc}</div>` : ""}${warns.map((x) => `<div class="wv-warn">${x.text} <span>${x.tip}</span></div>`).join("")}<div class="chips">${Object.keys(w.agg).map((t) => { tipFor[n + t] = t; return mobChip(t, w.agg[t], n + t); }).join("")}</div></div>`;
      }
    }
    const tip = _wvTip && tipFor[_wvTip] ? `<div class="tip-line">${mobTip(tipFor[_wvTip])}</div>` : "";
    return sheetHTML(head, body + tip + `<p class="sh-hint">Tap a creep for its traits. 🪽 flies · 👁 stealth</p>`, "");
  }
  let _wvSig = null;
  function renderWavePanel(force) {
    const p = $("wave-panel"); if (!p || !p.classList.contains("show")) return;
    const v = getView(), pl = v.field;
    let alive = 0; for (const e of v.state.enemies) if (e.alive && e.owner === v.fieldId) alive++;
    const sig = pl.wave + "|" + pl.phase + "|" + alive + "|" + _wvTip + "|" + v.fieldId;
    if (!force && sig === _wvSig) return;
    _wvSig = sig;
    fillSheet(p, waveCardHTML());
    p.querySelectorAll("[data-wtip]").forEach((b) => b.onclick = (ev) => { ev.stopPropagation(); _wvTip = _wvTip === b.dataset.wtip ? null : b.dataset.wtip; renderWavePanel(true); });
  }
  function toggleWavePanel() {
    const p = $("wave-panel"); if (!p) return;
    if (p.classList.contains("show")) { closeAllPanels(); return; }
    closeAllPanels(); _wvTip = null;
    openSheet("wave-panel", false);
    renderWavePanel(true);
    if (opts.onPanels) opts.onPanels();
  }

  function twSig(t) { return (t.bState ? Math.floor((t.bT || 0) / 32768) : 0) + "/" + t.level + "/" + t.expert + "/" + t.kills + "/" + t.mutations.length + "/" + (t.targetMode || "first") + "/" + (t.bState || 0) + (t.upT > 0 ? "u" : "") + (t.stunT > 0 ? "s" : "") + (t.jamT > 0 ? "j" : "") + (t.curseT > 0 ? "c" : "") + (t.confused ? "f" : ""); }
  function towerSynergyHtml(def, v) {
    if (!v || !v.state || !v.state.x) return "";
    const run = (v.player && v.player.buildable) || [];
    const rows = [];
    for (const e of DB.ELEMENT_ORDER) {
      if (e === def.element) continue;
      const syn = R.synergyFor(def.element, e); if (!syn) continue;
      rows.push({ syn, e, live: run.includes(e) });
    }
    rows.sort((a, b) => (b.live ? 1 : 0) - (a.live ? 1 : 0));
    let h = `<div class="tp-syn"><div class="tp-syn-head">${icon("flask", "xs")} Reactions <span class="dim">· its attacks set them off on creeps carrying another element's status</span></div>`;
    for (const r of rows.slice(0, rows.some((x) => x.live) ? 7 : 3)) h += `<div class="tp-syn-row${r.live ? " live" : ""}">${sigil(def.element, "xs")}+${sigil(r.e, "xs")} <b style="color:${r.syn.color}">${r.syn.icon} ${r.syn.name}</b> — ${r.syn.text}${r.live ? "" : ` <span class="dim">(not in this run)</span>`}</div>`;
    return h + `</div>`;
  }
  function towerBadges(tw, def) {
    let arche = def.archetype;
    for (const mid of tw.mutations) { const m = def.mutations.find((x) => x.id === mid); if (m && m.mods.archetype) arche = m.mods.archetype; }
    const air = arche !== "splash" && arche !== "melee";
    const det = def.element === "light" || tw.level >= 7 || arche === "support";
    let h = `<div class="tw-badges"><span class="${air ? "" : "no"}">🪽 ${arche === "support" ? "Aura reaches air" : "Hits air"}</span><span class="${det ? "" : "no"}">👁 ${det ? "Detects stealth" : "Detects at Lv 7"}</span>`;
    if (tw.bState) h += `<span class="warn">🔨 ${tw.bState === 1 ? "Waiting for the builder" : "Under construction"}</span>`;
    if (tw.upT > 0) h += `<span class="warn">⬆ Upgrading…</span>`;
    if (tw.stunT > 0) h += `<span class="warn">💫 Stunned</span>`;
    if (tw.jamT > 0 || (tw.xRate && tw.xRate < fx.ONE)) h += `<span class="warn">🐌 Slowed</span>`;
    if (tw.curseT > 0 || (tw.xDmg && tw.xDmg < fx.ONE)) h += `<span class="warn">🧪 Weakened</span>`;
    if (tw.confused) h += `<span class="warn">🌀 Confused</span>`;
    if (tw.dmgDone) h += `<span>⚔ ${Math.round(tw.dmgDone / 65536)} dmg</span>`;
    return h + `</div>`;
  }
  function statRow(label, val, next) { return `<div class="stat-row"><span>${label}</span><span>${val}${(next != null && String(next) !== String(val)) ? ` <em>→ ${next}</em>` : ""}</span></div>`; }
  function sellRefund(def, level, tw) {
    if (tw && opts.sellValue) return opts.sellValue(tw);
    const S = DB.SCALING;
    let invested = def.cost;
    for (let l = 1; l < level; l++) invested += Math.round(def.cost * S.upgradeCostBase * Math.pow(S.costGrowth, l - 1));
    return Math.round(invested * DB.CONFIG.sellRefund);
  }
  function towerView(def0, level, expert) {
    const v = getView(); const X = !!(v && v.state && v.state.x);
    const def = X ? R.towerX(def0) : def0;
    const S = X ? R.TUNE.scaling : DB.SCALING, C = DB.CONFIG;
    const dmg = def.damage * Math.pow(1 + S.damagePerLevel, level - 1) * (1 + (C.expertDamageBonus[expert] || 0)) * (X ? R.TUNE.towerDamage : 1);
    const rate = def.fireRate * Math.pow(1 + S.fireRatePerLevel, level - 1);
    const range = def.range + S.rangePerLevel * (level - 1);
    return { dmg, rate, range };
  }

  // ---- enemy panel ---------------------------------------------------------
  const ADAPT_INFO = {
    speed: { icon: "💨", name: "Swift" }, health: { icon: "🩸", name: "Vital" }, armor: { icon: "🛡️", name: "Armored" },
    resist: { icon: "🔰", name: "Resistant" }, momentum: { icon: "🌀", name: "Momentum" }, hardened: { icon: "🪨", name: "Hardened" },
  };
  function mobTraitsHtml(type, e) {
    const m = MOB_BY_ID[type]; if (!m) return "";
    const ac = ARMOR_CLASSES[m.armorClass];
    const tr = traitList(m.traits);
    let live = "";
    if (e) {
      if (e.hidden) live += `<span class="tr-tag" style="color:#9fd8ff">👁 Hidden from your towers</span>`;
      if (e.invulnT > 0) live += `<span class="tr-tag" style="color:#ffe066">✨ Invulnerable</span>`;
    }
    return `<div class="tr-list">${ac ? `<span class="ac-tag" style="color:${ac.color}">${ac.name}</span>` : ""}${live}${tr.map(([i, n, d]) => `<span class="tr-tag" title="${d}">${i} ${n}</span>`).join("")}</div><p class="dim ep-desc">${m.desc}</p>`;
  }

  // ---- bestiary -------------------------------------------------------------------
    // ---- Compendium: every tower and every creep, on a turntable ----------------------------
  // Tap an entry and it stands on the plinth above the list, alive (towers spin, bob, scan and kick as they
  // fire; creeps walk on the spot); drag to turn it. Towers can be seen at each of their four looks.
  const CP = { tab: "towers", tf: "all", cf: "all", tower: null, creep: null, stage: 0, view: null };
  const CP_FAMS = [["all", "All"], ["swarm", "Swarms"], ["runner", "Runners"], ["brute", "Brutes"], ["flyer", "Flyers"], ["stealth", "Stealth"], ["disruptor", "Disruptors"], ["support", "Support"], ["death", "Death"], ["resistant", "Resistant"], ["summoner", "Summoners"], ["trickster", "Tricksters"], ["el", "Elemental"], ["elite", "Elites"]];
  const CP_ELS = ["fire", "ice", "nature", "storm", "light", "darkness", "mech", "abnormal"];
  const CP_STAGES = [[0, "Lv 1"], [1, "Lv 4"], [2, "Lv 7"], [3, "Lv 10"]];
  function cpTowers() { return DB.TOWERS.filter((t) => CP.tf === "all" || t.element === CP.tf).slice().sort((a, b) => DB.ELEMENT_ORDER.indexOf(a.element) - DB.ELEMENT_ORDER.indexOf(b.element) || a.slot - b.slot); }
  function cpCreeps() { return (DB.MOBS_EXPANDED || []).map((id) => MOB_BY_ID[id]).filter((m) => m && (CP.cf === "all" || m.family === CP.cf || (CP.cf === "el" && CP_ELS.includes(m.family)))); }
  function cpTowerLocked(t) {
    const meta = getMeta(); const lvl = (meta.mastery && meta.mastery[t.element]) || 0;
    const avail = DB.availableElements(meta.mastery || {});
    return !avail.includes(t.element) || t.slot >= DB.unlockedTowerSlots(lvl);
  }
  function cpFilterHTML() {
    if (CP.tab === "towers") return `<button class="seg ${CP.tf === "all" ? "sel" : ""}" data-cpf="all">All</button>${CP_ELS.map((e) => `<button class="seg cx-el ${CP.tf === e ? "sel" : ""}" data-cpf="${e}" style="--ec:${DB.ELEMENTS[e].color}">${sigil(e, "xs")} ${DB.ELEMENTS[e].name}</button>`).join("")}`;
    return CP_FAMS.map(([k, n]) => `<button class="seg ${k === CP.cf ? "sel" : ""}" data-cpf="${k}">${n}</button>`).join("");
  }
  function cpTowerCard(t) {
    const el = DB.ELEMENTS[t.element], x = R.towerX(t), lock = cpTowerLocked(t);
    const dps = t.archetype === "support" ? "aura" : Math.round(x.damage * x.fireRate * R.TUNE.towerDamage) + " DPS";
    const tg = towerTags(t);
    return `<button class="bx-card cp-card${CP.tower === t.id ? " open sel" : ""}${lock ? " locked" : ""}" style="--ac:${el.color}" data-cpt="${t.id}">
      <div class="bx-pic"><img src="${thumb(t.id, 1)}" alt=""><span class="bx-acl">${sigil(t.element, "xs")} ${t.cost}</span>${lock ? `<i class="cp-lock">${icon("lock", "xs")}</i>` : ""}</div>
      <div class="bx-txt"><b>${t.name}</b><span class="bx-meta">${capW(t.archetype)} · ${dps}</span>
        <span class="bx-desc">${t.desc || ""}<br><span class="dim">${tg.dt.icon} ${tg.dt.name} · ${tg.air ? "🪽 hits air" : "ground only"}${tg.det ? " · 👁 sees stealth" : ""} · range ${x.range}${t.status ? ` · ${DB.STATUSES[t.status].icon} ${DB.STATUSES[t.status].name}` : ""}${lock ? `<br>${icon("lock", "xs")} ${DB.availableElements((getMeta().mastery) || {}).includes(t.element) ? "Unlocks with " + el.name + " Mastery" : unlockHint(t.element)}` : ""}</span></span></div></button>`;
  }
  function cpCreepCard(m) {
    const ac = ARMOR_CLASSES[m.armorClass], tr = traitList(m.traits);
    return `<button class="bx-card${CP.creep === m.id ? " open sel" : ""}" style="--ac:${ac.color}" data-cpc="${m.id}">
      <div class="bx-pic"><img src="${ethumb(m.id)}" alt=""><span class="bx-acl">${ac.name}</span></div>
      <div class="bx-txt"><b>${m.name}${m.pack > 1 ? ` <i>×${m.pack}</i>` : ""}</b>
        <span class="bx-meta">♥ ${m.hp} · from wave ${m.minWave}${m.tier ? " · " + SEND_TIERS[m.tier].name : ""}</span>
        ${tr.length ? `<span class="bx-tr">${tr.slice(0, 3).map(([i, n]) => `<i>${i} ${n}</i>`).join("")}${tr.length > 3 ? `<i>+${tr.length - 3}</i>` : ""}</span>` : ""}
        <span class="bx-desc">${m.desc}${tr.length ? `<br>${tr.map(([i, n, d]) => `${i} <b>${n}</b> — ${d}`).join("<br>")}` : ""}</span></div></button>`;
  }
  function cpInfo() {
    const box = $("cp-info"); if (!box) return;
    if (CP.tab === "towers") {
      const t = DB.TOWER_BY_ID[CP.tower]; if (!t) { box.innerHTML = ""; return; }
      const el = DB.ELEMENTS[t.element], cur = towerView(t, [1, 4, 7, 10][CP.stage], 0);
      box.innerHTML = `<div class="cp-name"><b>${t.name}</b><span>${sigil(t.element, "xs")} ${el.name} · ${capW(t.archetype)} · ${t.cost} gold</span></div>
        <div class="cp-stats">${t.archetype === "support" ? "" : `<span><i>DPS</i>${Math.round(cur.dmg * cur.rate)}</span>`}<span><i>Range</i>${cur.range.toFixed(1)}</span><span><i>Speed</i>${cur.rate.toFixed(2)}</span></div>
        <div class="cp-stages">${CP_STAGES.map(([k, n]) => `<button class="${CP.stage === k ? "sel" : ""}" data-cps="${k}">${n}</button>`).join("")}</div>`;
    } else {
      const m = MOB_BY_ID[CP.creep]; if (!m) { box.innerHTML = ""; return; }
      const ac = ARMOR_CLASSES[m.armorClass];
      box.innerHTML = `<div class="cp-name"><b>${m.name}${m.pack > 1 ? ` <i>×${m.pack}</i>` : ""}</b><span><span style="color:${ac.color}">${ac.name}</span> · ♥ ${m.hp}${m.armor ? " · 🛡 " + m.armor : ""} · from wave ${m.minWave}</span></div>`;
    }
    box.querySelectorAll("[data-cps]").forEach((b) => b.onclick = () => { CP.stage = +b.dataset.cps; sfx("click"); cpShow(); cpInfo(); });
  }
  function cpShow() {
    if (!CP.view) return;
    if (CP.tab === "towers") { const t = DB.TOWER_BY_ID[CP.tower]; if (t && CP.view.showTower) CP.view.showTower(DB, t.id, CP.stage, DB.ELEMENTS[t.element].glow); }
    else { const m = MOB_BY_ID[CP.creep]; if (m && CP.view.showEnemy) CP.view.showEnemy(m.id, ARMOR_CLASSES[m.armorClass].color); }
  }
  function cpList() {
    const list = $("cp-list"), filt = $("cp-filter"); if (!list) return;
    filt.innerHTML = cpFilterHTML();
    const items = CP.tab === "towers" ? cpTowers() : cpCreeps();
    if (CP.tab === "towers" && (!CP.tower || !items.find((t) => t.id === CP.tower))) CP.tower = items[0] && items[0].id;
    if (CP.tab === "creeps" && (!CP.creep || !items.find((m) => m.id === CP.creep))) CP.creep = items[0] && items[0].id;
    list.innerHTML = items.map(CP.tab === "towers" ? cpTowerCard : cpCreepCard).join("") || `<div class="pv-empty"><b>Nothing here</b></div>`;
    setText("cp-count", CP.tab === "towers" ? `${items.length} tower${items.length === 1 ? "" : "s"}` : `${items.length} creep${items.length === 1 ? "" : "s"}`);
    filt.querySelectorAll("[data-cpf]").forEach((b) => b.onclick = () => { if (CP.tab === "towers") CP.tf = b.dataset.cpf; else CP.cf = b.dataset.cpf; sfx("click"); cpList(); cpShow(); cpInfo(); });
    list.querySelectorAll("[data-cpt]").forEach((b) => b.onclick = () => { const was = CP.tower === b.dataset.cpt; CP.tower = b.dataset.cpt; sfx("click"); if (!was) { cpShow(); cpInfo(); } cpMark(b); });
    list.querySelectorAll("[data-cpc]").forEach((b) => b.onclick = () => { const was = CP.creep === b.dataset.cpc; CP.creep = b.dataset.cpc; sfx("click"); if (!was) { cpShow(); cpInfo(); } cpMark(b); });
  }
  function cpMark(b) {
    const list = $("cp-list");
    const open = b.classList.contains("open");
    list.querySelectorAll(".bx-card.sel, .bx-card.open").forEach((x) => x.classList.remove("sel", "open"));
    b.classList.add("sel"); if (!open) b.classList.add("open");
  }
  function cpStep(d) {
    const items = CP.tab === "towers" ? cpTowers().map((t) => t.id) : cpCreeps().map((m) => m.id);
    const cur = CP.tab === "towers" ? CP.tower : CP.creep;
    const i = (items.indexOf(cur) + d + items.length) % items.length;
    if (CP.tab === "towers") CP.tower = items[i]; else CP.creep = items[i];
    sfx("click"); cpShow(); cpInfo();
    const list = $("cp-list"), b = list && list.querySelector(`[data-${CP.tab === "towers" ? "cpt" : "cpc"}="${items[i]}"]`);
    if (b) { cpMark(b); b.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
  }
  function openBestiary(tab) {
    const mo = $("bestiary-modal"); if (!mo) return;
    if (tab) CP.tab = tab;
    mo.innerHTML = `<div class="modal wide glass pv cp-pv">${pvHead({ ico: icon("book"), ac: "#c77dff", title: "Compendium", sub: "Every tower and creep · tap one to see it up close", closeId: "bst-close" })}
      <div class="cp-stage wd-stage">
        <canvas id="cp-canvas" aria-label="3D preview — drag to turn"></canvas>
        <button class="wd-arrow l" id="cp-prev" aria-label="Previous">${icon("left")}</button>
        <button class="wd-arrow r" id="cp-next" aria-label="Next">${icon("right")}</button>
        <span class="wd-hint">↔ Drag to turn</span>
        <div class="cp-info" id="cp-info"></div>
      </div>
      ${pvTabs([["towers", "Towers"], ["creeps", "Creeps"]], CP.tab, "data-cptab")}
      <div class="bx-filter pv-scroll-x" id="cp-filter"></div>
      <div class="pv-body"><div class="cp-count" id="cp-count"></div><div class="bx-grid" id="cp-list"></div></div></div>`;
    mo.classList.add("show");
    const close = () => { mo.classList.remove("show"); if (CP.view) { CP.view.dispose(); CP.view = null; } };
    $("bst-close").onclick = close;
    mo.onclick = (e) => { if (e.target === mo) close(); };
    if (CP.view) { CP.view.dispose(); CP.view = null; }
    try { if (opts.builderViewer) CP.view = opts.builderViewer($("cp-canvas")); } catch (e) { console.warn("compendium preview", e); }
    $("cp-prev").onclick = () => cpStep(-1);
    $("cp-next").onclick = () => cpStep(1);
    mo.querySelectorAll("[data-cptab]").forEach((b) => b.onclick = () => {
      CP.tab = b.dataset.cptab; sfx("click");
      mo.querySelectorAll("[data-cptab]").forEach((x) => x.classList.toggle("sel", x === b));
      cpList(); cpShow(); cpInfo(); const body = mo.querySelector(".pv-body"); if (body) body.scrollTop = 0;
    });
    cpList(); cpShow(); cpInfo();
  }

  // ---- send panel (competitive + versus): flat costs, 5 upgrade levels ------
  function toggleSendPanel() {
    const p = $("send-panel"); if (!p) return;
    if (p.classList.contains("show")) { closeAllPanels(); return; }
    closeAllPanels();
    openSheet("send-panel", true);
    renderSendPanel(true);
    if (opts.onPanels) opts.onPanels();
  }
  let _sendTier = 1;
  function sendPanelSig(pl) {
    let sig = "";
    const st = getView().state;
    if (st.x) {
      for (const t in DB.SENDS_EXPANDED) { const lvl = (pl.sendLevels && pl.sendLevels[t]) || 1; const sk = pl.sendStock && pl.sendStock[t]; sig += t + lvl + (pl.gold >= DB.sendCostX(t, lvl) ? "y" : "n") + (sk ? sk.n + ":" + Math.floor(sk.t / 15) : "-"); }
      return sig + "|" + _sendTier + "|" + Math.floor(st.tick / 30) + "|" + (pl.income || 0) + "|" + (opts.sendLoad ? Math.round(opts.sendLoad(st, (getView().me + 1) % st.players.length) * 20) : 0);
    }
    for (const t in DB.SENDS) {
      const lvl = (pl.sendLevels && pl.sendLevels[t]) || 1;
      sig += t + lvl + (pl.gold >= DB.sendCost(t, lvl) ? "y" : "n") + (lvl < DB.SEND_MAX_LEVEL && pl.gold >= DB.sendUpgradeCost(t, lvl) ? "Y" : "N");
    }
    return sig + "|" + Math.floor((getView().player.income || 0));
  }
  function renderSendPanel(force) {
    const p = $("send-panel"); if (!p || !p.classList.contains("show")) return;
    const v = getView(), pl = v.player;
    const sig = sendPanelSig(pl);
    if (!force && sig === _sendSig) return;
    _sendSig = sig;
    if (v.state.x) { renderSendPanelX(p, v, pl); return; }
    let html = `<button class="panel-close" id="sp-close">${icon("close")}</button>
      <div class="panel-head">${icon("swords")} Send Mobs <span class="cur">${icon("coins", "gold xs")} Income +${pl.income || 0}/5s</span></div>
      <p class="sp-note">${v.versus ? "Sends march into the NEXT corridor. Leaked mobs cost a life and travel on." : "Sends spawn on your opponent's field."} Flat cost per level — upgrade a type to make it stronger (and pricier).</p>
      <div class="sp-rows scroll">`;
    for (const t in DB.SENDS) {
      const s = DB.SENDS[t], en = DB.ENEMIES[t] || { name: t };
      const lvl = (pl.sendLevels && pl.sendLevels[t]) || 1;
      const cost = DB.sendCost(t, lvl);
      const hp = Math.round(en.hp * DB.sendHpMult(t, lvl));
      const maxed = lvl >= DB.SEND_MAX_LEVEL;
      const upCost = maxed ? 0 : DB.sendUpgradeCost(t, lvl);
      html += `<div class="sp-row">
        <img class="sp-thumb" src="${ethumb(t)}" alt="">
        <div class="sp-info">
          <div class="sp-name">${en.name}${s.count > 1 ? ` <span class="sp-count">×${s.count}</span>` : ""}
            <span class="sp-pips">${[1, 2, 3, 4, 5].map((i) => `<b class="${i <= lvl ? "on" : ""}"></b>`).join("")}</span></div>
          <div class="sp-desc">${s.desc} · ♥ ${hp}${en.armor ? " · 🛡 " + en.armor : ""}${en.speed >= 1.5 ? " · 💨" : ""}</div>
        </div>
        <button class="sp-send ${pl.gold < cost ? "cant" : ""}" data-send="${t}">Send · ${cost}</button>
        <button class="sp-up ${maxed ? "maxed" : (pl.gold < upCost ? "cant" : "")}" data-up="${t}">${maxed ? "MAX" : "⬆ Lv" + (lvl + 1) + " · " + upCost}</button>
      </div>`;
    }
    html += `</div>`;
    morph(p, html);
    bindSendPanel(p);
  }
  // one delegated handler: rows are patched in place, so buttons keep working without re-binding
  function bindSendPanel(p) {
    if (p._sendBound) return; p._sendBound = true;
    p.addEventListener("click", (e) => {
      const b = e.target.closest("[data-send],[data-up],[data-tier],#sp-close"); if (!b || !p.contains(b)) return;
      if (b.id === "sp-close") closeAllPanels();
      else if (b.dataset.tier) { _sendTier = +b.dataset.tier; renderSendPanel(true); }
      else if (b.dataset.send) cmd.sendAuto(b.dataset.send);
      else if (b.dataset.up) cmd.upgradeSend(b.dataset.up);
    });
  }

  // how full your target's corridor is with your sends (a corridor holds only so much sent health)
  function sendTargetHTML(v) {
    if (!opts.sendLoad) return "";
    const st = v.state; let t = null;
    for (let i = 1; i < st.players.length; i++) { const p = st.players[(v.me + i) % st.players.length]; if (p.alive) { t = p; break; } }
    if (!t) return "";
    const load = Math.min(1, opts.sendLoad(st, t.id));
    const name = v.seatName ? v.seatName(t.id) : "NPC " + t.id;
    return `<div class="sp-load"><span>Target: <b>${name}</b></span><div class="sp-lbar"><div style="width:${Math.round(load * 100)}%;background:${load > 0.85 ? "#ff6a6a" : "#ff5fa2"}"></div></div><span class="dim">${load > 0.85 ? "full — wait" : Math.round(load * 100) + "% full"}</span></div>`;
  }
  function renderSendPanelX(p, v, pl) {
    const st = v.state, bal = opts.bal, mods = st.x;
    const tiers = bal.sendTiers || {};
    const now = st.tick;
    const fmt = (ticks) => { const s = Math.ceil(ticks / 30); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
    const allowed = (t) => {
      const x = bal.enemies[t] && bal.enemies[t].x; const tt = x ? x.t : {};
      if (mods.noFlyers && tt.fly) return false;
      if (mods.noStealth && (tt.invisible || tt.cloakCycle || tt.cloakAura)) return false;
      if (mods.noDisruptors && (tt.jamPass || tt.corrodeAura || tt.chillAura || tt.chillFly || tt.confuseAura || tt.boulder || tt.rootTower || tt.curseTower || tt.deathTowerSlow || tt.deathStun || tt.shredObstacle)) return false;
      return true;
    };
    let html = `<button class="panel-close" id="sp-close">${icon("close")}</button>
      <div class="panel-head">${icon("swords")} Send Mobs <span class="cur">${icon("coins", "gold xs")} Income +${pl.income || 0}/${mods.turbo ? "2.5" : "5"}s</span></div>
      <p class="sp-note">Sends march into the NEXT corridor.${mods.lifeSteal ? " Every life they take is yours." : ""} A send that gets through takes one life and is gone. Each send raises your income. Stronger tiers unlock over time${mods.sendStock ? " and recharge from a limited stock" : ""}.</p>
      ${sendTargetHTML(v)}
      <div class="sp-tiers">${[1, 2, 3, 4].map((k) => { const T = tiers[k]; const lock = mods.sendStock && T && now < T.unlockTicks; return `<button class="sp-tier ${k === _sendTier ? "sel" : ""} ${lock ? "locked" : ""}" data-tier="${k}">Tier ${SEND_TIERS[k].name}<small>${lock ? "🔒 " + fmt(T.unlockTicks - now) : (mods.sendStock ? "stock " + SEND_TIERS[k].stock : "open")}</small></button>`; }).join("")}</div>
      <div class="sp-rows scroll">`;
    const T = tiers[_sendTier];
    const tierLocked = mods.sendStock && T && now < T.unlockTicks;
    for (const t in DB.SENDS_EXPANDED) {
      const s = DB.SENDS_EXPANDED[t];
      if (s.tier !== _sendTier || !allowed(t)) continue;
      const en = DB.ENEMIES[t] || { name: t }, m = MOB_BY_ID[t];
      const lvl = (pl.sendLevels && pl.sendLevels[t]) || 1;
      const cost = DB.sendCostX(t, lvl);
      const hp = Math.round(en.hp * DB.sendHpMultX(t, lvl));
      const maxed = lvl >= DB.SEND_MAX_LEVEL;
      const upCost = maxed ? 0 : DB.sendUpgradeCostX(t, lvl);
      const sk = pl.sendStock && pl.sendStock[t];
      const stockMax = SEND_TIERS[_sendTier].stock, stockN = sk ? sk.n : stockMax;
      const rech = sk && sk.n < sk.max ? 1 - sk.t / sk.re : 0;
      const empty = mods.sendStock && stockN <= 0;
      const tr = m ? traitList(m.traits).slice(0, 3).map(([i, n]) => i + " " + n).join(" · ") : "";
      const ac = m ? ARMOR_CLASSES[m.armorClass] : null;
      html += `<div class="sp-row">
        <img class="sp-thumb" src="${ethumb(t)}" alt="">
        <div class="sp-info">
          <div class="sp-name">${en.name}${s.count > 1 ? ` <span class="sp-count">×${s.count}</span>` : ""}
            <span class="sp-pips">${[1, 2, 3, 4, 5].map((i) => `<b class="${i <= lvl ? "on" : ""}"></b>`).join("")}</span>
            ${mods.sendStock ? `<span class="sp-stock">${Array.from({ length: stockMax }, (_, i) => `<b class="${i < stockN ? "on" : ""}"></b>`).join("")}</span>` : ""}</div>
          <div class="sp-desc">♥ ${hp}${en.armor ? " · 🛡 " + en.armor : ""}${ac ? ` · <span style="color:${ac.color}">${ac.name}</span>` : ""}</div>
          ${tr ? `<div class="sp-traits">${tr}</div>` : ""}
          ${mods.sendStock && rech > 0 ? `<div class="sp-rech"><div style="width:${Math.round(rech * 100)}%"></div></div>` : ""}
        </div>
        <button class="sp-send ${pl.gold < cost || tierLocked || empty ? "cant" : ""}" data-send="${t}">${tierLocked ? "🔒" : empty ? "⏳" : "Send · " + cost}</button>
        <button class="sp-up ${maxed ? "maxed" : (pl.gold < upCost ? "cant" : "")}" data-up="${t}">${maxed ? "MAX" : "⬆ Lv" + (lvl + 1) + " · " + upCost}</button>
      </div>`;
    }
    html += `</div>`;
    // switching tiers shows a different list: start it at the top; otherwise patch in place
    if (p._tier !== _sendTier) { p._tier = _sendTier; morph(p, html); const s2 = p.querySelector(".sp-rows"); if (s2) s2.scrollTop = 0; }
    else morph(p, html);
    bindSendPanel(p);
  }

  // ---- live panel refresh ------------------------------------------------------
  function refreshPanels() {
    const v = getView(); if (!v.state) return;
    refreshRing();
    if (v.selectedTowerId) {
      let found = null, fcorr = null;
      const corrs = v.versus ? [v.state.players[v.me].corridors[0]] : v.field.corridors;
      for (const c of corrs) { const t = c.towers.find((t) => t.id === v.selectedTowerId); if (t) { found = t; fcorr = c; break; } }
      if (!found) { closeAllPanels(); _twSig = null; return; }
      const tp = $("tower-panel");
      if (tp && tp.classList.contains("show") && twSig(found) + (fcorr.builder ? fcorr.builder.at : "") !== _twSig) renderTowerCard(fcorr, found);
    } else if (v.selectedEnemyId) {
      const e = v.state.enemies.find((e) => e.id === v.selectedEnemyId);
      if (e && e.alive) openEnemyPanel(e); else closeAllPanels();
    } else if (_bdCorr && $("builder-panel").classList.contains("show")) {
      if (builderSig(_bdCorr) !== _bdSig) openBuilderPanel(_bdCorr);
    }
    renderSendPanel(false);
    renderWavePanel(false);
    updateBossBar();
  }

  // ---- boss HP bar ------------------------------------------------------------
  function updateBossBar() {
    const bb = $("boss-bar"); if (!bb) return;
    const v = getView();
    if (!v.state || v.screen !== "game") { bb.classList.remove("show"); return; }
    let boss = null;
    for (const e of v.state.enemies) {
      if (!e.alive || e.owner !== v.fieldId || !e.boss) continue;
      if (!boss || (e.end && !boss.end) || (e.end === boss.end && e.maxHp > boss.maxHp)) boss = e;
    }
    if (!boss) { bb.classList.remove("show"); return; }
    const name = (DB.ENEMIES[boss.type] || {}).name || boss.type;
    setText("boss-name", "☠ " + name + (boss.loopCount ? "  ↻" + boss.loopCount : ""));
    const f = $("boss-fill"); if (f) f.style.width = (Math.max(0, Math.min(1, (boss.hp / boss.maxHp))) * 100) + "%";
    bb.classList.toggle("end", !!boss.end);
    bb.classList.add("show");
  }

  // ---- setup screen --------------------------------------------------------------
  // Every choice explains itself right where it is made; the run estimate updates live.
  const MODE_DESC = {
    single: () => "One corridor, 10 waves — a bossy little sprint. Pick two elements: together they set off reactions.",
    loop: (n) => `${n} corridors in a ring, ${R.wavesFor("loop", n)} waves. A creep that escapes walks on into the next corridor; it costs a life only once it has come all the way round. Every corridor can build all of your elements.`,
    endless: (n) => `${n === 1 ? "One corridor" : n + " corridors"}, no last wave — climb as high as you can. Endless waves count toward Mastery 5.`,
  };
  const MOD_DESCS = {
    builders: "A builder per corridor walks to each new tower and raises it over a few seconds. Its lantern also reveals invisible creeps close by. Off: towers appear instantly.",
    lifeSteal: "Vs: every life your sends take from a rival is added to yours (up to 5 over your start).",
    sendStock: "Vs: tier II–IV sends unlock at 2:30, 6:00 and 11:00, and each send type recharges from a small stock.",
    turbo: "Vs: income pays out every 2.5 seconds instead of 5.",
    noFlyers: "No flying creeps in waves or sends.",
    noStealth: "No invisible or cloaking creeps.",
    noDisruptors: "No creeps that stun, slow, curse or confuse towers.",
    randomLanes: "Vs: everyone, including you, gets random elements.",
    doppel: "Vs: every NPC plays your elements.",
    anonymous: "Vs: rivals are hidden behind anonymous names.",
    goldMult: "Starting gold multiplier.",
    livesMult: "Starting lives multiplier.",
  };
  function updateSetupDescs(setup) {
    const h = $("setup-hint"); if (!h) return;
    const t = setup._lastTouched || "";
    h.textContent = t.indexOf("mod:") === 0 ? (MOD_DESCS[t.slice(4)] || "") : t === "econ" ? (setup.economy === "shared" ? "One gold pool pays for every tower." : "Each element earns and spends its own essence: kills pay out in the essence of the tower that made them.") : t === "pacing" ? (setup.pacing === "manual" ? "Take your time between waves. Calling a wave early while creeps remain pays a gold bonus." : "The next wave starts 5 seconds after the last one is cleared. The End Boss always waits for you.") : "";
  }
  let _pvSel = null;
  function selectSetupNode(i, setup, avail) {
    const vs = setup.gameMode === "versus";
    if (vs && i > 0) { toast("NPC rivals roll their elements when the match starts"); return; }
    _pvSel = i; setup._lastTouched = "element:" + i;
    renderSetup(setup, avail);
  }
  function reactionLine(a, b) {
    const s = R.synergyFor(a, b); if (!s) return "";
    return `<div class="rx-line" style="--sc:${s.color}">${sigil(a, "xs")}<i>+</i>${sigil(b, "xs")}<i>→</i><b>${s.icon} ${s.name}</b><span>${s.text}</span></div>`;
  }
  function elementPills(sel, avail, attr, exclude) {
    return DB.ELEMENT_ORDER.map((eid) => {
      const el = DB.ELEMENTS[eid], ok = avail.includes(eid), off = eid === exclude;
      return `<button class="elbtn${ok ? "" : " locked"}${off ? " off" : ""}${sel === eid ? " sel" : ""}" style="--ec:${el.color}" data-${attr}="${eid}">${ok ? sigil(eid, "sm") : icon("lock", "sm")}<span>${el.name}</span></button>`;
    }).join("");
  }
  // icon-only chips: eight to a row, the chosen one named in the row's label
  function elementChips(sel, avail, attr, exclude) {
    return DB.ELEMENT_ORDER.map((eid) => {
      const el = DB.ELEMENTS[eid], ok = avail.includes(eid), off = eid === exclude;
      return `<button class="elchip${ok ? "" : " locked"}${off ? " off" : ""}${sel === eid ? " sel" : ""}" style="--ec:${el.color}" data-${attr}="${eid}" aria-label="${el.name}${ok ? "" : " (locked)"}" title="${el.name}">${ok ? sigil(eid) : icon("lock")}</button>`;
    }).join("");
  }
  const elName = (e) => (DB.ELEMENTS[e] ? DB.ELEMENTS[e].name : "—");
  function renderSetup(setup, availElements) {
    const vs = setup.gameMode === "versus";
    const sheet = $("setup-sheet"); if (sheet) sheet.dataset.gm = vs ? "versus" : "solo";
    const scr = $("screen-setup"); if (scr) scr.dataset.gm = vs ? "versus" : "solo";
    const multi = !vs && setup.mode !== "single";
    if (multi && setup.corridors < 3) setup.corridors = 4;
    updateSetupDescs(setup);
    const runKey = vs ? "versus" : setup.mode;
    document.querySelectorAll("[data-run]").forEach((b) => b.classList.toggle("sel", b.dataset.run === runKey));
    document.querySelectorAll("[data-pacing]").forEach((b) => b.classList.toggle("sel", b.dataset.pacing === setup.pacing));
    document.querySelectorAll("[data-econ]").forEach((b) => b.classList.toggle("sel", b.dataset.econ === setup.economy));
    document.querySelectorAll("[data-sdiff]").forEach((b) => b.classList.toggle("sel", b.dataset.sdiff === setup.difficulty));
    document.querySelectorAll("[data-diff]").forEach((b) => b.classList.toggle("sel", b.dataset.diff === setup.npc));
    const rc = $("row-corridors"); if (rc) rc.style.display = multi ? "" : "none";
    const optsN = DB.CORRIDOR_OPTIONS.filter((n) => n > 1);
    setText("corr-count", setup.corridors);
    const ci = optsN.indexOf(setup.corridors);
    $("corr-minus").classList.toggle("disabled", ci <= 0); $("corr-plus").classList.toggle("disabled", ci >= optsN.length - 1);
    setText("seats-count", setup.seats - 1);
    setText("seats-note", setup.seats - 1 === 1 ? "rival" : "rivals");
    $("seats-minus").classList.toggle("disabled", setup.seats <= 3); $("seats-plus").classList.toggle("disabled", setup.seats >= 8);
    const pvh = $("pv-hint"); if (pvh) pvh.textContent = vs ? "Your island is the first — NPCs roll theirs" : multi ? "Tap an island in the world to pick it" : "Your corridor floats above the Vortex";
    // one line says what you're in for: length, time, and what the difficulty means
    const sum = $("su-summary");
    if (sum) {
      const dd = vs ? ((opts.npcLevels && opts.npcLevels[setup.npc]) || {}).desc || "" : (R.SOLO_DIFFICULTY[setup.difficulty] || {}).desc || "";
      let len;
      if (vs) len = `${setup.seats} seats · waves every 32 s · ~10–16 min`;
      else if (setup.mode === "endless") len = `${multi ? setup.corridors + " islands" : "1 island"} · no last wave`;
      else { const n = multi ? setup.corridors : 1; const m = R.estimateRunMinutes(setup.mode, n); len = `${R.wavesFor(setup.mode, n)} waves · ~${Math.round(m)} min (${Math.max(1, Math.round(m / 3))} at ×3)`; }
      const html = `<b>⏱ ${len}</b><span>${dd}</span>`;
      if (sum._h !== html) { sum.innerHTML = html; sum._h = html; sum.title = vs ? "" : MODE_DESC[setup.mode](multi ? setup.corridors : 1); }
    }
    let changed = 0;
    document.querySelectorAll("[data-mod]").forEach((b) => {
      const k = b.dataset.mod, vsOnly = b.classList.contains("vs");
      b.style.display = vsOnly && !vs ? "none" : "";
      if (k === "goldMult") b.textContent = "💰 Gold ×" + setup.mods.goldMult;
      else if (k === "livesMult") b.textContent = "❤ Lives ×" + setup.mods.livesMult;
      const on = k === "goldMult" || k === "livesMult" ? setup.mods[k] !== 1 : !!setup.mods[k];
      b.classList.toggle("on", on);
      if (!(vsOnly && !vs) && on !== (k === "builders" || k === "lifeSteal" || k === "sendStock")) changed++; // differs from the default
    });
    if (!vs && setup.economy !== "shared") changed++;
    if (!vs && setup.pacing !== "manual") changed++;
    const mc = $("more-count"); if (mc) { mc.textContent = changed; mc.style.display = changed ? "" : "none"; }
    const skp = $("skin-picker");
    if (skp && opts.getSkins) {
      const cur = opts.getSkins().find((k) => k.id === opts.getSkin()) || { name: "Elemental" };
      skp.innerHTML = `<button class="pv-row" id="skin-open" style="--ac:#7fd0ff"><div class="r-ico">${icon("hammer")}</div><div class="r-main"><b>${cur.name}</b><span>Your builders wear this look</span></div><div class="r-side">Change ${icon("right", "xs")}</div></button>`;
      $("skin-open").onclick = () => openWardrobe(() => renderSetup(setup, availElements));
    }
    // elements
    const picker = $("element-picker");
    const n = multi ? setup.corridors : 1;
    for (let i = 0; i < n; i++) if (!availElements.includes(setup.elements[i])) setup.elements[i] = availElements[i % availElements.length];
    if (picker) {
      let h = "";
      if (multi) {
        if (_pvSel == null || _pvSel >= n) _pvSel = 0;
        // islands as small numbered chips in their element's colour; the chosen one is edited below
        const isl = Array.from({ length: n }, (_, i) => { const e = setup.elements[i], el = DB.ELEMENTS[e]; return `<button class="islchip${i === _pvSel ? " sel" : ""}" style="--ec:${el ? el.color : "#888"}" data-isl="${i}" aria-label="Island ${i + 1}: ${elName(e)}">${sigil(e, "xs")}<b>${i + 1}</b></button>`; }).join("");
        h += `<div class="su-el"><span class="su-lbl">Islands</span><div class="isl-row">${isl}</div></div>`;
        h += `<div class="su-el"><span class="su-lbl">Island ${_pvSel + 1}<b style="color:${DB.ELEMENTS[setup.elements[_pvSel]].color}">${elName(setup.elements[_pvSel])}</b></span><div class="chip-row">${elementChips(setup.elements[_pvSel], availElements, "pel")}</div></div>`;
        const uniq = [...new Set(setup.elements.slice(0, n))];
        const lines = []; for (let i = 0; i < uniq.length; i++) for (let j = i + 1; j < uniq.length; j++) { const sy = R.synergyFor(uniq[i], uniq[j]); if (sy) lines.push(sy); }
        h += `<button class="rx-strip" id="rx-strip">${lines.length ? `${lines.slice(0, 4).map((sy) => `<span style="color:${sy.color}">${sy.icon} ${sy.name}</span>`).join("")}${lines.length > 4 ? `<span class="dim">+${lines.length - 4}</span>` : ""}` : `<span class="dim">Mix elements across islands to unlock reactions</span>`}<i>${icon("info", "xs")}</i></button>`;
      } else {
        const a = setup.elements[0];
        if (!availElements.includes(setup.partner) || setup.partner === a) setup.partner = availElements.find((e) => e !== a) || null;
        h += `<div class="su-el"><span class="su-lbl">Element #1<b style="color:${DB.ELEMENTS[a].color}">${elName(a)}</b></span><div class="chip-row">${elementChips(a, availElements, "pel")}</div></div>`;
        h += `<div class="su-el"><span class="su-lbl">Element #2<b style="color:${setup.partner ? DB.ELEMENTS[setup.partner].color : "inherit"}">${elName(setup.partner)}</b></span><div class="chip-row">${elementChips(setup.partner, availElements, "ppa", a)}</div></div>`;
        const sy = setup.partner ? R.synergyFor(a, setup.partner) : null;
        h += `<button class="rx-strip" id="rx-strip">${sy ? `${sigil(a, "xs")}<i>+</i>${sigil(setup.partner, "xs")}<i>→</i><span style="color:${sy.color}">${sy.icon} <b>${sy.name}</b></span><span class="rx-txt">${sy.text}</span>` : `<span class="dim">Pick Element #2 to unlock a reaction</span>`}</button>`;
      }
      if (picker._h !== h) {
        picker.innerHTML = h; picker._h = h;
        picker.querySelectorAll("[data-pel]").forEach((b) => b.onclick = () => { const e = b.dataset.pel; if (!availElements.includes(e)) { toast(unlockHint(e)); return; } setup.elements[multi ? _pvSel : 0] = e; if (!multi && setup.partner === e) setup.partner = availElements.find((x) => x !== e) || null; setup._lastTouched = "element"; sfx("click"); renderSetup(setup, availElements); });
        picker.querySelectorAll("[data-ppa]").forEach((b) => b.onclick = () => { const e = b.dataset.ppa; if (!availElements.includes(e)) { toast(unlockHint(e)); return; } if (e === setup.elements[0]) return; setup.partner = e; sfx("click"); renderSetup(setup, availElements); });
        picker.querySelectorAll("[data-isl]").forEach((b) => b.onclick = () => { sfx("click"); selectSetupNode(+b.dataset.isl, setup, availElements); });
        const rx = $("rx-strip"); if (rx) rx.onclick = () => openCodex();
      }
    }
    if (opts.onSetupPreview) opts.onSetupPreview(setup, _pvSel || 0);
  }

  // ---- wardrobe: builder skins, grouped -----------------------------------------------
  // The builder wardrobe: a turntable on top (drag or swipe to turn the builder, ‹ › to flip through the
  // looks), then every look as a card with its portrait. Tap a card to try it on the turntable — locked
  // ones too, so you can see what you're playing for — and Equip to wear it.
  let _wdView = null, _wdSel = null;
  function openWardrobe(after) {
    const m = $("wardrobe-modal"); if (!m || !opts.getSkins) return;
    const skins = opts.getSkins(), cur = opts.getSkin();
    const el = (opts.previewElement && opts.previewElement()) || "fire";
    if (!_wdSel || !skins.find((k) => k.id === _wdSel)) _wdSel = cur;
    const glowOf = (k) => { const c = opts.skinSwatch ? opts.skinSwatch(k.id, el) : null; return c ? c.gl : "#9f8cff"; };
    const portrait = (k) => {
      const url = opts.builderThumb ? opts.builderThumb(k.id, el) : "";
      if (url) return `<img class="wd-pic" src="${url}" alt="">`;
      const c = opts.skinSwatch ? opts.skinSwatch(k.id, el) : { c1: "#888", gl: "#fff" };
      return `<i class="sw" style="--c1:${c.c1};--gl:${c.gl}"></i>`;
    };
    const card = (k) => `<button class="wd-skin${k.id === cur ? " worn" : ""}${k.id === _wdSel ? " sel" : ""}${k.unlocked ? "" : " locked"}" data-skin="${k.id}" title="${k.desc}">${portrait(k)}<b>${k.unlocked ? "" : "🔒 "}${k.name}</b><span>${k.id === cur ? "Equipped" : k.unlocked ? "Unlocked" : k.desc}</span></button>`;
    const group = (title, list, note) => list.length ? `<div class="wd-group"><div class="wd-head">${title}<span class="dim">${list.filter((k) => k.unlocked).length}/${list.length}</span></div>${note ? `<p class="dim wd-note">${note}</p>` : ""}<div class="wd-grid">${list.map(card).join("")}</div></div>` : "";
    const nOwn = skins.filter((k) => k.unlocked).length;
    m.innerHTML = `<div class="modal wide glass pv wardrobe">${pvHead({ ico: icon("hammer"), ac: "#7fd0ff", title: "Builders", sub: `${nOwn}/${skins.length} looks unlocked · tap one to try it on`, closeId: "wd-close" })}
      <div class="wd-stage">
        <canvas id="wd-canvas" aria-label="Builder preview — drag to turn"></canvas>
        <button class="wd-arrow l" id="wd-prev" aria-label="Previous look">${icon("left")}</button>
        <button class="wd-arrow r" id="wd-next" aria-label="Next look">${icon("right")}</button>
        <span class="wd-hint">↔ Drag to turn</span>
        <div class="wd-info"><div><b id="wd-name"></b><span id="wd-desc"></span></div><button class="btn primary small" id="wd-equip">Equip</button></div>
      </div>
      <div class="pv-body wd-list">
      ${group("Classics", skins.filter((k) => k.family === "general"))}
      ${group("Sealbreakers", skins.filter((k) => k.family === "seal"), "Beat the Sealed One — the bonus fight after the last wave — with that element in your run.")}
      ${group("Challenge looks", skins.filter((k) => k.family === "challenge"), "Only from Challenges: beat one with an element to earn its look in that element.")}</div></div>`;
    m.classList.add("show");
    const close = () => { m.classList.remove("show"); if (_wdView) { _wdView.dispose(); _wdView = null; } };
    $("wd-close").onclick = close;
    m.onclick = (e) => { if (e.target === m) close(); };
    if (_wdView) { _wdView.dispose(); _wdView = null; }
    const cv = $("wd-canvas");
    try { if (opts.builderViewer && cv) _wdView = opts.builderViewer(cv); } catch (e) { console.warn("builder preview", e); }
    const select = (id, scroll) => {
      _wdSel = id;
      const k = skins.find((x) => x.id === id); if (!k) return;
      if (_wdView) _wdView.show(k.id, el, glowOf(k));
      setText("wd-name", k.name);
      const d = $("wd-desc"); if (d) d.textContent = k.id === opts.getSkin() ? "Equipped" : k.unlocked ? (k.id === "element" ? "Takes the colours of each corridor's element." : "Unlocked — ready to wear.") : "🔒 " + k.desc;
      const eq = $("wd-equip");
      if (eq) { const worn = k.id === opts.getSkin(); eq.textContent = worn ? "Equipped" : k.unlocked ? "Equip" : "Locked"; eq.classList.toggle("disabled", worn || !k.unlocked); }
      m.querySelectorAll("[data-skin]").forEach((b) => b.classList.toggle("sel", b.dataset.skin === id));
      if (scroll) { const b = m.querySelector(`[data-skin="${id}"]`); if (b) b.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
    };
    const step = (d) => { const i = skins.findIndex((k) => k.id === _wdSel); select(skins[(i + d + skins.length) % skins.length].id, true); sfx("click"); };
    $("wd-prev").onclick = () => step(-1);
    $("wd-next").onclick = () => step(1);
    $("wd-equip").onclick = () => {
      const k = skins.find((x) => x.id === _wdSel); if (!k) return;
      if (!k.unlocked) { toast("🔒 " + k.desc); sfx("reject"); return; }
      opts.setSkin(k.id); sfx("click");
      if (_wdView) { _wdView.dispose(); _wdView = null; }
      openWardrobe(after); if (after) after();
    };
    m.querySelectorAll("[data-skin]").forEach((b) => b.onclick = () => { select(b.dataset.skin, false); sfx("click"); });
    select(_wdSel, true);
  }


  // ---- mastery screen + reactions codex (one panel, two tabs) --------------------------
  let _cxFilter = "all";
  function openMastery(tab = "mastery") {
    const m = $("mastery-screen"); if (!m) return;
    const meta = getMeta();
    const avail = DB.availableElements(meta.mastery || {});
    let total = 0;
    let cards = "";
    DB.ELEMENT_ORDER.forEach((eid) => {
      const el = DB.ELEMENTS[eid];
      const lvl = (meta.mastery && meta.mastery[eid]) || 0; total += lvl;
      const wins = (meta.elementWins && meta.elementWins[eid]) || 0;
      const locked = !avail.includes(eid);
      const slots = DB.unlockedTowerSlots(lvl);
      const towers = DB.TOWERS.filter((t) => t.element === eid).sort((a, b) => a.slot - b.slot);
      let prog, frac = 0, next = "";
      if (locked) prog = unlockHint(eid).replace(/^Unlock: /, "Unlocks when ");
      else if (lvl >= 5) { prog = "Mastered"; frac = 1; }
      else if (lvl === 4) prog = "Reach Endless wave 50";
      else { const need = DB.MASTERY.winsRequired[lvl + 1]; frac = Math.min(1, wins / need); prog = `${Math.min(wins, need)}/${need} wins`; }
      if (!locked && lvl < 5) { const u = (DB.MASTERY.unlocks[lvl + 1] || []); next = u.length ? "Next: " + u.join(", ") : ""; }
      cards += `<div class="ms-card${locked ? " locked" : ""}" style="--ac:${el.color}">
        <div class="ms-top">${sigil(eid, "sm")}<b>${el.name}</b>${locked ? icon("lock", "xs") : pvPips(lvl, 5, el.color)}</div>
        <div class="ms-towers">${towers.map((t) => `<span class="${t.slot < slots && !locked ? "" : "off"}"><img src="${thumb(t.id)}" alt="" title="${t.name}"></span>`).join("")}</div>
        ${locked ? "" : pvMeter(frac, el.color)}
        <div class="ms-prog"><span>${prog}</span>${next ? `<i>${next}</i>` : ""}</div></div>`;
    });
    const tabs = pvTabs([["mastery", "Mastery"], ["codex", "Reactions"]], tab);
    m.innerHTML = pvPanel({ cls: "wide mastery-pv", head: { ico: icon("trophy"), ac: "#ffd23d", title: "Mastery", sub: `${total}/${DB.ELEMENT_ORDER.length * 5} levels · win runs with an element to raise it`, closeId: "ms-close" }, tabs,
      body: `<div data-pane="mastery"${tab === "mastery" ? "" : " hidden"}><p class="pv-lead">Every win with an element counts toward its Mastery. Each level unlocks another of its towers, then mutation slots.</p><div class="ms-grid">${cards}</div></div>
        <div data-pane="codex"${tab === "codex" ? "" : " hidden"}>${codexHTML()}</div>` });
    m.classList.add("show");
    bindPvTabs(m);
    bindCodex(m);
    $("ms-close").onclick = () => m.classList.remove("show");
    m.onclick = (e) => { if (e.target === m) m.classList.remove("show"); };
  }
  // ---- reactions codex: every element pair, one reaction each ---------------------------
  function codexHTML() {
    const v = getView(); const run = v && v.state && v.player ? (v.player.buildable || v.player.elements) : [];
    const rows = R.SYNERGIES_X.map((s) => ({ s, live: run.includes(s.a) && run.includes(s.b) }))
      .filter((r) => _cxFilter === "all" || r.s.a === _cxFilter || r.s.b === _cxFilter)
      .sort((a, b) => (b.live ? 1 : 0) - (a.live ? 1 : 0));
    const filt = `<div class="pv-scroll-x cx-filter"><button class="seg ${_cxFilter === "all" ? "sel" : ""}" data-cxf="all">All</button>${DB.ELEMENT_ORDER.map((e) => `<button class="seg cx-el ${_cxFilter === e ? "sel" : ""}" data-cxf="${e}" style="--ec:${DB.ELEMENTS[e].color}" aria-label="${DB.ELEMENTS[e].name}">${sigil(e, "xs")}</button>`).join("")}</div>`;
    let h = `<p class="pv-lead">Every pair of elements has one reaction. When a creep carrying one element's status (🔥 Burning, ❄ Chilled…) is <b>attacked</b> by a tower of the other element, the status is used up and the effect fires — at most once a second per creep. "Power" is the attacker's damage per second.</p>${filt}<div class="cx-list">`;
    for (const { s, live } of rows) {
      h += `<div class="cx-row${live ? " live" : ""}" style="--ac:${s.color}"><div class="cx-pair">${sigil(s.a, "sm")}<i>+</i>${sigil(s.b, "sm")}</div><div class="cx-main"><b>${s.icon} ${s.name}${live ? ` <span class="cx-live">In this run</span>` : ""}</b><span>${s.text}</span></div></div>`;
    }
    return h + `</div>`;
  }
  function bindCodex(root) {
    root.querySelectorAll("[data-cxf]").forEach((b) => b.onclick = () => {
      _cxFilter = b.dataset.cxf; sfx("click");
      const pane = root.querySelector('[data-pane="codex"]') || root.querySelector(".pv-body");
      if (pane) { pane.innerHTML = codexHTML(); bindCodex(root); }
    });
  }
  function openCodex() {
    const m = $("mastery-screen"); if (!m) return;
    const v = getView();
    if (v && v.screen === "game") {
      // in a run: just the reactions, with this run's pairs first
      m.innerHTML = pvPanel({ cls: "wide mastery-pv", head: { ico: icon("flask"), ac: "#9cff7a", title: "Reactions", sub: "Element pairs and what they do", closeId: "ms-close" }, body: `<div data-pane="codex">${codexHTML()}</div>` });
      m.classList.add("show");
      bindCodex(m);
      $("ms-close").onclick = () => m.classList.remove("show");
      m.onclick = (e) => { if (e.target === m) m.classList.remove("show"); };
      return;
    }
    openMastery("codex");
  }
  function unlockHint(eid) {
    if (eid === "light" || eid === "darkness") return "Unlock: all starters at Mastery 1";
    if (eid === "mech" || eid === "abnormal") return "Unlock: any element at Mastery 5";
    return "";
  }

  return { openBestiary, toast, setText, closeAllPanels, closeRing, updateTopBar, updateEnemyOverview, updateWavePanel, updateWavePreview, updateBossBar, toggleSendPanel, openBuildRing, openTowerRing, openTowerPanel, openEnemyPanel, openBuilderPanel, toggleWavePanel, trackRing, positionPortrait, pickTower, pickSpot, endPick, get picking() { return _pick ? _pick.kind : null; }, get ringAnchor() { return _ring ? _ring.anchor : null; }, bindSheets, renderSetup, updateSetupDescs, selectSetupNode, openMastery, openWardrobe, openCodex, refreshPanels, get ringOpen() { return !!_ring; }, get ringKind() { return _ring ? _ring.kind || null : null; }, get buildTile() { return _ring && _ring.tile ? _ring.tile : null; }, moveBuildSpot };
}

export default { createUI };
