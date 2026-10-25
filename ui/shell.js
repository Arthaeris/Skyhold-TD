/* Skyhold TD — ui/shell.js
   UI LAYER — a port of Circle-TD's ui/shell.js: the same panels, radial build/tower rings, HUD, wave
   preview, send panel, setup, mastery and synergy codex, with the same behaviour and wording. Skyhold's
   changes are presentational: elemental sigils instead of emoji in the chrome, voxel thumbnails of the
   towers/enemies, and a setup preview that is the live 3D world instead of a 2D polygon.

   It never mutates sim state; user intent becomes COMMANDS through opts.cmd (exactly as in Circle). */
import * as fx from "../sim/fx.js";
import { generateWave, waveAffix, AFFIXES } from "../sim/waves.js";
import { icon, sigil } from "./icons.js";

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
    ["build-menu", "tower-panel", "enemy-panel", "send-panel"].forEach((id) => { const e = $(id); if (e) e.classList.remove("show"); });
    closeRing();
    const v = getView(); v.selectedTowerId = null; v.selectedEnemyId = null; v.buildTile = null; v.buildMenuOpen = false; v.buildPreview = null;
    _sendSig = null;
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
    const W = stage.clientWidth, H = stage.clientHeight, R = items.length > 6 ? 86 : 80;
    const cx = Math.max(R + 40, Math.min(W - R - 40, sx));
    const cy = Math.max(R + 86, Math.min(H - R - 44, sy));
    const hub = document.createElement("div"); hub.className = "rad-hub"; hub.style.left = cx + "px"; hub.style.top = cy + "px"; m.appendChild(hub);
    const label = document.createElement("div");
    label.className = "rad-label";
    label.style.left = cx + "px"; label.style.top = (cy - R - 40) + "px";
    label.innerHTML = o.title || "";
    m.appendChild(label);
    _ring = { items: {}, focus: null, label, defTitle: o.title || "" };
    const n = items.length;
    items.forEach((it, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
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
        if (it.isDisabled && it.isDisabled()) { sfx("reject"); return; }
        if (it.confirm && (!_ring || _ring.focus !== it.key)) { sfx("click"); focus(); return; }
        it.exec();
        if (_ring) render();
      };
      _ring.items[it.key] = { el: b, render };
      m.appendChild(b);
    });
    m.classList.add("show");
  }
  function refreshRing() { if (!_ring) return; for (const k in _ring.items) _ring.items[k].render(); }

  const curOf = (v, el) => v.state.economy === "shared" ? v.player.gold : v.player.essence[el];
  const curIcon = (v, el) => v.state.economy === "shared" ? icon("coins", "gold") : sigil(el, "sm");

  // Build ring: one bubble per unlocked tower of the corridor's element
  function openBuildRing(corr, tile, sx, sy) {
    closeAllPanels();
    const v = getView(); v.buildTile = tile; v.buildMenuOpen = true;
    const el = DB.ELEMENTS[corr.element];
    const slots = DB.unlockedTowerSlots(masteryLevel(corr.element));
    const list = DB.TOWERS.filter((t) => t.element === corr.element && t.slot < slots);
    const items = list.map((t) => ({
      key: t.id, color: el.color, confirm: true,
      html: `<img class="ri-thumb" src="${thumb(t.id)}" alt=""><span class="ri-cost">${t.cost}</span>`,
      focusHtml: () => {
        const dps = t.archetype === "support" ? "" : ` · ${Math.round(t.damage * t.fireRate)} DPS`;
        const st = t.status ? ` · ${DB.STATUSES[t.status].icon} ${DB.STATUSES[t.status].name}` : "";
        return `<b>${t.name}</b> — ${t.cost}${dps}${st}<br><span class="rl-dim">${t.archetype} · tap again to build</span>`;
      },
      onFocus: () => { v.buildPreview = { range: t.range }; },
      exec: () => { cmd.build(corr.index, tile.c, tile.r, t.id); closeAllPanels(); },
      isDisabled: () => curOf(v, corr.element) < t.cost,
    }));
    const locked = DB.TOWERS.filter((t) => t.element === corr.element && t.slot >= slots).length;
    items.push({ key: "x", cls: "rad-cancel", confirm: false, html: icon("close"), exec: closeAllPanels });
    showRing(sx, sy, items, { title: `${sigil(corr.element, "sm")} Build — ${curIcon(v, corr.element)} ${Math.floor(curOf(v, corr.element))}${locked ? `<br><span class="rl-dim">${icon("lock", "xs")} ${locked} more with ${el.name} Mastery</span>` : ""}` });
    if (opts.onPanels) opts.onPanels();
  }

  // Tower ring: upgrade / target cycle / details / sell
  function openTowerRing(corr, tw, sx, sy) {
    closeAllPanels();
    const v = getView(); v.selectedTowerId = tw.id;
    const el = DB.ELEMENTS[tw.def.element], def = DB.TOWER_BY_ID[tw.def.id];
    const gold = () => curOf(v, def.element);
    const upCost = () => Math.round(def.cost * DB.SCALING.upgradeCostBase * Math.pow(DB.SCALING.costGrowth, tw.level - 1));
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
      { key: "info", confirm: false, html: `${icon("info")}<span class="ri-cost">info</span>`, exec: () => openTowerPanel(corr, tw) },
      { key: "sell", cls: "rad-sell", confirm: true,
        html: `${icon("coins")}<span class="ri-cost">+${sellRefund(def, tw.level)}</span>`,
        focusHtml: () => `<b>Sell for +${sellRefund(def, tw.level)}</b><br><span class="rl-dim">tap again to confirm</span>`,
        exec: () => { cmd.sell(corr.index, tw.id); closeAllPanels(); } },
      { key: "x", cls: "rad-cancel", confirm: false, html: icon("close"), exec: closeAllPanels },
    ];
    showRing(sx, sy, items, { title: `${sigil(def.element, "sm")} ${def.name} · Lv${tw.level}${maxed() ? " · mutations in ⓘ" : ""}` });
    if (opts.onPanels) opts.onPanels();
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
      html = `<div class="ov-head">Corridors · sends travel →</div>`;
      v.state.players.forEach((p, i) => {
        const el = DB.ELEMENTS[p.elements[0]];
        let inside = 0; for (const e of v.state.enemies) if (e.owner === i) inside++;
        const name = i === v.me ? "You" : "NPC " + i;
        html += `<div class="ov-row ${p.alive ? "" : "dead"}" data-ci="${i}">
          <span class="ov-el" style="color:${el.color}">${sigil(p.elements[0], "xs")} ${name}</span>
          <span class="ov-num">${p.alive ? "❤" + p.lives + " · " + inside : "☠ out"}</span>
          <div class="ov-bar"><div style="width:${Math.min(100, (p.lives / p.maxLives) * 100)}%;background:${p.alive ? el.color : "#555"}"></div></div></div>`;
      });
    } else {
      const fld = v.field;
      html = `<div class="ov-head">Survivors by Origin</div>`;
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
    if (pl.phase === "prep") label = `${icon("skull")} Summon Boss`;
    if (pl.phase === "endboss") label = "Boss Active";
    const b = $("quick-start-wave");
    if (b) { if (b._h !== label) { b.innerHTML = label; b._h = label; } b.classList.toggle("disabled", pl.phase === "endboss"); b.classList.toggle("boss", pl.phase === "prep"); }
    const sb = $("quick-speed-cycle"); if (sb) sb.innerHTML = `${icon("speed")}<span>×${v.speed}</span>`;
    updateWavePreview();
  }

  // ---- next-wave preview (display-only; mirrors deterministic generateWave) --
  function updateWavePreview() {
    const wp = $("wave-preview"); if (!wp) return;
    const v = getView(), pl = v.field;
    let html = "";
    if (pl.phase === "build" && (v.state.mode === "endless" || pl.wave < pl.totalWaves)) {
      const next = pl.wave + 1;
      const isBoss = next % DB.CONFIG.bossEvery === 0;
      const agg = {};
      for (const g of generateWave(next, pl.corridorCount, DB.CONFIG.bossEvery)) agg[g.type] = (agg[g.type] || 0) + g.count;
      const affix = waveAffix(v.state.seedBase, next, DB.CONFIG.bossEvery);
      const parts = Object.keys(agg).map((t) => {
        const d = DB.ENEMIES[t] || { name: t };
        const n = (affix && affix.countMult) ? Math.max(1, Math.round(agg[t] * affix.countMult)) : agg[t];
        return `<span class="wprev-item${d.boss ? " boss" : ""}"><img src="${ethumb(t)}" alt="">${n}× ${d.name}</span>`;
      });
      html = `<span class="wprev-label${isBoss ? " boss" : ""}">${isBoss ? "⚠ Boss Wave " + next : "Next"}</span> ${parts.join("")}`;
      if (affix) html += ` <span class="wprev-affix" title="${affix.desc}">${affix.icon} ${affix.name}</span>`;
    } else if (pl.phase === "prep") {
      html = `<span class="wprev-label boss">⚠ Final</span> <span class="wprev-item boss"><img src="${ethumb("endboss")}" alt="">1× ${(DB.ENEMIES.endboss && DB.ENEMIES.endboss.name) || "End Boss"}</span>`;
    }
    if (wp._h !== html) { wp.innerHTML = html; wp._h = html; }
    wp.classList.toggle("show", !!html);
  }

  // ---- tower panel ---------------------------------------------------------
  function openTowerPanel(corr, tw) {
    closeAllPanels();
    const v = getView(); v.selectedTowerId = tw.id;
    const el = DB.ELEMENTS[tw.def.element], def = DB.TOWER_BY_ID[tw.def.id];
    const maxed = tw.level >= DB.CONFIG.maxLevel;
    const cost = Math.round(def.cost * DB.SCALING.upgradeCostBase * Math.pow(DB.SCALING.costGrowth, tw.level - 1));
    const slots = DB.mutationSlotsAvailable(masteryLevel(tw.def.element));
    const expNeed = tw.expert < 5 ? DB.CONFIG.expertThresholds[tw.expert] : tw.kills;
    const expPct = tw.expert < 5 ? Math.min(1, tw.kills / expNeed) : 1;
    const cur = towerView(def, tw.level, tw.expert);
    const nxt = maxed ? null : towerView(def, tw.level + 1, tw.expert);
    const refund = sellRefund(def, tw.level);
    let html = `<button class="panel-close" id="tp-close">${icon("close")}</button>
      <div class="tp-head" style="--ec:${el.color}"><img class="tp-thumb" src="${thumb(def.id, Math.min(3, tw.level >= 10 ? 3 : tw.level >= 7 ? 2 : tw.level >= 4 ? 1 : 0))}" alt=""><div><div class="tp-name">${def.name}</div><div class="tp-sub">${sigil(def.element, "xs")} ${el.name} · ${def.archetype}</div><div class="tp-desc">${def.desc || ""}</div></div></div>
      <div class="tp-levels"><span class="badge">Lv ${tw.level}/10</span><span class="badge gold">${icon("star", "xs")} Expert ${tw.expert}/5</span></div>
      <div class="exp-bar"><div style="width:${expPct * 100}%"></div></div>
      <div class="exp-label">${tw.expert < 5 ? tw.kills + " / " + expNeed + " kills" : "MAX EXPERTISE"} · ${tw.kills} total kills</div>
      <div class="tp-stats">
        ${statRow("Damage", cur.dmg.toFixed(0), nxt && nxt.dmg.toFixed(0))}
        ${statRow("Range", cur.range.toFixed(1), nxt && nxt.range.toFixed(1))}
        ${statRow("Atk Speed", cur.rate.toFixed(2), nxt && nxt.rate.toFixed(2))}
        ${def.archetype !== "support" ? statRow("DPS", Math.round(cur.dmg * cur.rate), nxt && Math.round(nxt.dmg * nxt.rate)) : ""}
        ${def.status ? `<div class="tp-eff">${DB.STATUSES[def.status].icon} Applies ${DB.STATUSES[def.status].name}</div>` : ""}
      </div>
      <div class="tp-target"><span class="tt-lbl">Target</span>${["first", "last", "strong", "weak"].map((m) =>
        `<button class="tm-btn ${(tw.targetMode || "first") === m ? "sel" : ""}" data-tm="${m}">${m[0].toUpperCase() + m.slice(1)}</button>`).join("")}</div>
      ${towerSynergyHtml(def)}
      <div class="tp-actions">
        <button id="tp-upgrade" class="${maxed ? "disabled" : ""}">${maxed ? "MAX LEVEL" : icon("up", "xs") + " Upgrade · " + cost}</button>
        <button id="tp-sell" class="sell">${icon("coins", "xs")} Sell · +${refund}</button>
      </div>`;
    if (maxed) {
      html += `<div class="tp-mut-head">Mutations ${slots ? `(${tw.mutations.length}/${slots} slots)` : "(locked — raise Mastery)"}</div><div class="tp-muts">`;
      def.mutations.forEach((m) => { const have = tw.mutations.includes(m.id); html += `<button class="mut-card ${have ? "have" : ""}" data-mut="${m.id}"><div class="mut-name">${m.name}</div><div class="mut-desc">${m.desc}</div></button>`; });
      html += `</div>`;
    } else html += `<div class="tp-mut-head dim">Mutations unlock at max level</div>`;
    const p = $("tower-panel"); p.innerHTML = html; p.classList.add("show");
    $("tp-close").onclick = closeAllPanels;
    $("tp-upgrade").onclick = () => { if (!maxed) cmd.upgrade(corr.index, tw.id); };
    $("tp-sell").onclick = () => { cmd.sell(corr.index, tw.id); closeAllPanels(); };
    p.querySelectorAll("[data-mut]").forEach((b) => b.onclick = () => cmd.mutate(corr.index, tw.id, b.dataset.mut));
    p.querySelectorAll("[data-tm]").forEach((b) => b.onclick = () => cmd.setTarget(corr.index, tw.id, b.dataset.tm));
    _twSig = tw.level + "/" + tw.expert + "/" + tw.kills + "/" + tw.mutations.length + "/" + (tw.targetMode || "first");
    if (opts.onPanels) opts.onPanels();
  }
  function towerSynergyHtml(def) {
    const { setsUp, triggers } = synergiesForTower(def);
    if (!setsUp.length && !triggers.length) return "";
    let h = `<div class="tp-syn"><div class="tp-syn-head">${icon("flask", "xs")} Synergies</div>`;
    for (const s of setsUp) h += `<div class="tp-syn-row">${s.status.icon}+${sigil(s.el.id, "xs")} <b style="color:${s.syn.color}">${s.syn.name}</b> — hit ${s.status.name} enemies with ${s.el.name}: ${synergyEffectText(s.syn)}</div>`;
    for (const s of triggers) h += `<div class="tp-syn-row">${s.status.icon}+${sigil(s.el.id, "xs")} <b style="color:${s.syn.color}">${s.syn.name}</b> — this tower triggers it on ${s.status.name} enemies: ${synergyEffectText(s.syn)}</div>`;
    return h + `</div>`;
  }
  function statRow(label, val, next) { return `<div class="stat-row"><span>${label}</span><span>${val}${(next != null && String(next) !== String(val)) ? ` <em>→ ${next}</em>` : ""}</span></div>`; }
  function sellRefund(def, level) {
    const S = DB.SCALING;
    let invested = def.cost;
    for (let l = 1; l < level; l++) invested += Math.round(def.cost * S.upgradeCostBase * Math.pow(S.costGrowth, l - 1));
    return Math.round(invested * DB.CONFIG.sellRefund);
  }
  function towerView(def, level, expert) {
    const S = DB.SCALING, C = DB.CONFIG;
    const dmg = def.damage * Math.pow(1 + S.damagePerLevel, level - 1) * (1 + (C.expertDamageBonus[expert] || 0));
    const rate = def.fireRate * Math.pow(1 + S.fireRatePerLevel, level - 1);
    const range = def.range + S.rangePerLevel * (level - 1);
    return { dmg, rate, range };
  }

  // ---- enemy panel ---------------------------------------------------------
  const ADAPT_INFO = {
    speed: { icon: "💨", name: "Swift" }, health: { icon: "🩸", name: "Vital" }, armor: { icon: "🛡️", name: "Armored" },
    resist: { icon: "🔰", name: "Resistant" }, momentum: { icon: "🌀", name: "Momentum" }, hardened: { icon: "🪨", name: "Hardened" },
  };
  function openEnemyPanel(e) {
    closeAllPanels();
    const v = getView(); v.selectedEnemyId = e.id;
    const oid = v.versus ? v.state.players[e.owner].elements[0] : v.field.elements[e.originIndex];
    const oel = DB.ELEMENTS[oid];
    const stk = (e.statusKeys || []).map((k) => DB.STATUSES[k]).filter(Boolean);
    const affix = e.affix && AFFIXES[e.affix];
    const adapts = Object.keys(e.adapt || {}).map((k) => {
      const a = ADAPT_INFO[k] || { icon: "↻", name: k }; const n = e.adapt[k];
      return `<span class="stag" style="--sc:#ffd23d">${a.icon} ${a.name}${n > 1 ? " ×" + n : ""}</span>`;
    });
    const name = (DB.ENEMIES[e.type] || {}).name || e.type;
    const p = $("enemy-panel");
    p.innerHTML = `<button class="panel-close" id="ep-close">${icon("close")}</button>
      <div class="ep-top"><img class="ep-thumb" src="${ethumb(e.type)}" alt=""><div>
      <div class="ep-head">${e.boss ? "☠ " : ""}${name}${e.end ? " (END BOSS)" : ""}${e.sent ? " · SENT" : ""}${affix ? ` · ${affix.icon} ${affix.name.toUpperCase()}` : ""}</div>
      <div class="exp-bar big"><div style="width:${Math.min(1, Math.max(0, e.hp) / e.maxHp) * 100}%;background:#ff4d6d"></div></div>
      <div class="exp-label">${Math.max(0, toI(e.hp))} / ${toI(e.maxHp)} HP</div></div></div>
      <div class="tp-stats">${statRow("Origin", sigil(oid, "xs") + " " + oel.name)}${statRow("Loops", e.loopCount)}${statRow("Armor", toI(e.armor))}${statRow("Reward", e.reward)}</div>
      <div class="ep-status">${stk.length ? stk.map((s) => `<span class="stag" style="--sc:${s.color}">${s.icon} ${s.name}</span>`).join("") : "<span class='dim'>No status</span>"}</div>
      ${adapts.length ? `<div class="ep-adapt-head">↻ Loop adaptations</div><div class="ep-status">${adapts.join("")}</div>` : ""}`;
    p.classList.add("show");
    $("ep-close").onclick = closeAllPanels;
    if (opts.onPanels) opts.onPanels();
  }

  // ---- send panel (competitive + versus): flat costs, 5 upgrade levels ------
  function toggleSendPanel() {
    const p = $("send-panel"); if (!p) return;
    if (p.classList.contains("show")) { closeAllPanels(); return; }
    closeAllPanels();
    p.classList.add("show");
    renderSendPanel(true);
    if (opts.onPanels) opts.onPanels();
  }
  function sendPanelSig(pl) {
    let sig = "";
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
    let html = `<button class="panel-close" id="sp-close">${icon("close")}</button>
      <div class="panel-head">${icon("swords")} Send Mobs <span class="cur">${icon("coins", "gold xs")} Income +${pl.income || 0}/5s</span></div>
      <p class="sp-note">${v.versus ? "Sends march into the NEXT corridor. Leaked mobs cost a life and travel on." : "Sends spawn on your opponent's field."} Flat cost per level — upgrade a type to make it stronger (and pricier).</p>
      <div class="sp-rows">`;
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
    p.innerHTML = html;
    $("sp-close").onclick = closeAllPanels;
    p.querySelectorAll("[data-send]").forEach((b) => b.onclick = () => cmd.sendAuto(b.dataset.send));
    p.querySelectorAll("[data-up]").forEach((b) => b.onclick = () => cmd.upgradeSend(b.dataset.up));
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
      if (!tp || !tp.classList.contains("show")) return;
      const sig = found.level + "/" + found.expert + "/" + found.kills + "/" + found.mutations.length + "/" + (found.targetMode || "first");
      if (sig !== _twSig) openTowerPanel(fcorr, found);
    } else if (v.selectedEnemyId) {
      const e = v.state.enemies.find((e) => e.id === v.selectedEnemyId);
      if (e && e.alive) openEnemyPanel(e); else closeAllPanels();
    }
    renderSendPanel(false);
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

  // ---- setup screen (Circle's wording) ---------------------------------------
  const SETUP_DESCS = {
    mode: {
      single: "One corridor, 10 waves. A short, focused run.",
      loop: "Corridors form a ring — enemies that survive a corridor move on to the next and loop back around until destroyed. 10 waves per corridor.",
      endless: "No final wave. Survive and climb as long as you can.",
    },
    gamemode: {
      solo: "Play alone on your own battlefield.",
      versus: "Offline battle royale: you own ONE corridor in a ring of 3–8. NPC rivals hold the rest. Leaked mobs cost a life and march into the next corridor. Send mobs to bury your neighbor. Last one standing wins.",
      coop: "Defend one shared battlefield and life pool together. Multiplayer is coming to Skyhold soon.",
      competitive: "Separate battlefields — spend resources to send extra enemies at your rival. Multiplayer is coming to Skyhold soon.",
    },
    econ: {
      shared: "One gold pool pays for every tower, across all corridors.",
      elemental: "Each element earns and spends its own essence — kills pay out in the corridor's element.",
    },
    status: {
      standard: "Enemies carry one status effect at a time — a new one replaces the old.",
      advanced: "Status effects from different towers stack and combine; enemies lock their statuses after each full loop.",
    },
    pacing: {
      manual: "Take your time between waves. You can still toggle ⟳ Auto in-game, and calling a wave early while enemies remain pays a gold bonus.",
      auto: "The next wave starts automatically 5 seconds after the last one is cleared. The final End Boss always waits for you.",
    },
  };
  function updateSetupDescs(setup) {
    const h = $("setup-hint"); if (!h) return;
    const t = setup._lastTouched || "gamemode";
    let txt = "";
    if (t === "mode") txt = SETUP_DESCS.mode[setup.mode];
    else if (t === "gamemode") txt = SETUP_DESCS.gamemode[setup.gameMode];
    else if (t === "econ") txt = SETUP_DESCS.econ[setup.economy];
    else if (t === "status") txt = SETUP_DESCS.status[setup.status];
    else if (t === "pacing") txt = SETUP_DESCS.pacing[setup.pacing];
    else if (t.indexOf("element:") === 0) {
      const i = +t.split(":")[1];
      const el = DB.ELEMENTS[setup.elements[i]];
      if (el) txt = `Corridor ${i + 1} — ${el.name}. Tap another island in the world above to pick its element.`;
    } else if (t === "corridors") {
      txt = setup.gameMode === "versus"
        ? `You + ${setup.corridors - 1} NPC rival${setup.corridors > 2 ? "s" : ""} in a ring — last one standing wins.`
        : `${setup.corridors} corridors (${DB.SHAPE_NAMES[setup.corridors] || ""}) — ${setup.mode === "endless" ? "endless waves" : (setup.corridors * 10) + " waves"}.`;
    }
    h.textContent = txt || "";
  }
  let _pvSel = null;
  function selectSetupNode(i, setup, avail) {
    const vs = setup.gameMode === "versus";
    if (vs && i > 0) { setup._lastTouched = "gamemode"; updateSetupDescs(setup); toast("NPC rivals roll their elements when the match starts"); return; }
    _pvSel = i; setup._lastTouched = "element:" + i;
    renderSetup(setup, avail);
  }
  function renderSetup(setup, availElements) {
    const vs = setup.gameMode === "versus";
    if (vs && setup.corridors < 3) setup.corridors = 4;
    updateSetupDescs(setup);
    document.querySelectorAll("[data-pacing]").forEach((b) => b.classList.toggle("sel", b.dataset.pacing === setup.pacing));
    document.querySelectorAll("[data-mode]").forEach((b) => { b.classList.toggle("sel", !vs && b.dataset.mode === setup.mode); b.classList.toggle("disabled", vs); });
    if (setup.mode === "single" && !vs) setup.corridors = 1;
    const singleLocked = setup.mode === "single" && !vs;
    const optsN = DB.CORRIDOR_OPTIONS.filter((n) => (vs ? n >= 3 : n > 1));
    const cnt = $("corr-count"); if (cnt) cnt.textContent = singleLocked ? 1 : setup.corridors;
    const ci = optsN.indexOf(setup.corridors);
    const bm = $("corr-minus"), bp = $("corr-plus");
    if (bm) bm.classList.toggle("disabled", singleLocked || ci <= 0);
    if (bp) bp.classList.toggle("disabled", singleLocked || ci >= optsN.length - 1);
    const shape = $("shape-name"); if (shape) shape.textContent = singleLocked ? "Single Lane" : (vs ? ("You + " + (setup.corridors - 1) + " NPCs") : (DB.SHAPE_NAMES[setup.corridors] || ""));
    const pvh = $("pv-hint"); if (pvh) pvh.textContent = vs ? "Tap your island to pick its element — NPCs roll theirs" : "Tap an island in the world to change its element";
    document.querySelectorAll("[data-econ]").forEach((b) => { b.classList.toggle("sel", vs ? b.dataset.econ === "shared" : b.dataset.econ === setup.economy); b.classList.toggle("disabled", vs); });
    document.querySelectorAll("[data-status]").forEach((b) => b.classList.toggle("sel", b.dataset.status === setup.status));
    // element picker: pills for the corridor node selected in the 3D preview
    const picker = $("element-picker");
    const n = vs ? 1 : (setup.mode === "single" ? 1 : setup.corridors);
    for (let i = 0; i < n; i++) if (!availElements.includes(setup.elements[i])) setup.elements[i] = availElements[i % availElements.length];
    if (picker) {
      if (_pvSel != null && _pvSel >= n) _pvSel = null;
      if (_pvSel == null) _pvSel = 0;
      picker.innerHTML = "";
      const head = document.createElement("div"); head.className = "ep-head2";
      head.innerHTML = (vs ? "Your element" : "Corridor " + (_pvSel + 1) + " of " + n) + (n > 1 ? `<span class="pv-nav"><button class="seg" id="pv-prev">${icon("left")}</button><button class="seg" id="pv-next">${icon("right")}</button></span>` : "");
      picker.appendChild(head);
      const rowEl = document.createElement("div"); rowEl.className = "assign-opts";
      DB.ELEMENT_ORDER.forEach((eid) => {
        const el = DB.ELEMENTS[eid], ok = availElements.includes(eid);
        const b = document.createElement("button"); b.className = "elbtn" + (ok ? "" : " locked"); b.style.setProperty("--ec", el.color);
        b.innerHTML = `${ok ? sigil(eid, "sm") : icon("lock", "sm")}<span>${el.name}</span>`;
        b.classList.toggle("sel", setup.elements[_pvSel] === eid);
        b.onclick = () => { if (!ok) { toast(unlockHint(eid)); return; } setup.elements[_pvSel] = eid; setup._lastTouched = "element:" + _pvSel; renderSetup(setup, availElements); };
        rowEl.appendChild(b);
      });
      picker.appendChild(rowEl);
      const pp = $("pv-prev"), pn = $("pv-next");
      if (pp) pp.onclick = () => selectSetupNode((_pvSel - 1 + n) % n, setup, availElements);
      if (pn) pn.onclick = () => selectSetupNode((_pvSel + 1) % n, setup, availElements);
    }
    if (opts.onSetupPreview) opts.onSetupPreview(setup, _pvSel);
  }

  // ---- mastery screen + synergy codex ------------------------------------------
  function openMastery() {
    const m = $("mastery-screen"); if (!m) return;
    const meta = getMeta();
    const avail = DB.availableElements(meta.mastery || {});
    let html = `<div class="modal wide"><button class="panel-close" id="ms-close">${icon("close")}</button><h2>Elemental Mastery</h2><div class="mastery-grid">`;
    DB.ELEMENT_ORDER.forEach((eid) => {
      const el = DB.ELEMENTS[eid];
      const lvl = (meta.mastery && meta.mastery[eid]) || 0;
      const wins = (meta.elementWins && meta.elementWins[eid]) || 0;
      const locked = !avail.includes(eid);
      const nextReq = lvl >= 5 ? "MAX" : lvl === 4 ? "Reach Wave 100" : `Win ${DB.MASTERY.winsRequired[lvl + 1]} runs`;
      const slots = DB.unlockedTowerSlots(lvl);
      const towers = DB.TOWERS.filter((t) => t.element === eid);
      html += `<div class="mastery-card ${locked ? "locked" : ""}" style="--ec:${el.color}">
        <div class="mc-head">${sigil(eid)} <span>${el.name}</span> ${locked ? icon("lock", "xs") : ""}</div>
        <div class="mc-towers">${towers.map((t) => `<img src="${thumb(t.id)}" class="${t.slot < slots && !locked ? "" : "off"}" title="${t.name}" alt="">`).join("")}</div>
        <div class="mc-lvl">Mastery ${lvl}/5</div>
        <div class="mc-pips">${[1, 2, 3, 4, 5].map((i) => `<span class="${i <= lvl ? "on" : ""}"></span>`).join("")}</div>
        <div class="mc-req">${locked ? unlockHint(eid) : nextReq}</div>
        <div class="mc-wins">Wins with element: ${wins}</div></div>`;
    });
    html += `</div>`;
    html += `<h2 class="codex-head">${icon("flask")} Synergy Codex</h2>
      <p class="dim codex-note">Hit an enemy carrying a status with a tower of the listed element to trigger the combo.</p>
      <div class="codex-list">`;
    for (const key in DB.SYNERGIES) {
      const [st, el] = key.split("|");
      const s = DB.STATUSES[st], E = DB.ELEMENTS[el], syn = DB.SYNERGIES[key];
      if (!s || !E) continue;
      html += `<div class="codex-row">
        <span class="cx-combo">${s.icon} ${s.name} <span class="dim">+</span> ${sigil(el, "xs")} ${E.name}</span>
        <span class="cx-name" style="color:${syn.color}">${syn.name}</span>
        <span class="cx-eff">${synergyEffectText(syn)}</span></div>`;
    }
    html += `</div></div>`;
    m.innerHTML = html; m.classList.add("show");
    $("ms-close").onclick = () => m.classList.remove("show");
  }
  function unlockHint(eid) {
    if (eid === "light" || eid === "darkness") return "Unlock: all starters at Mastery 1";
    if (eid === "mech" || eid === "abnormal") return "Unlock: any element at Mastery 5";
    return "";
  }

  return { toast, setText, closeAllPanels, closeRing, updateTopBar, updateEnemyOverview, updateWavePanel, updateWavePreview, updateBossBar, toggleSendPanel, openBuildRing, openTowerRing, openTowerPanel, openEnemyPanel, renderSetup, updateSetupDescs, selectSetupNode, openMastery, refreshPanels, get ringOpen() { return !!_ring; } };
}

export default { createUI };
