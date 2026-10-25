/* Skyhold TD — ui/online.js
   The online lobby (nickname, create/join a room by code or link, seats, rules, ready, start) and the
   in-match social layer (chat feed + input, emotes, mute, the "waiting for…" banner).
   It only talks to net/session.js; the game is started by the onStart callback. */
import { icon, sigil } from "./icons.js";
import { savedName, saveName, cleanName, activeRoom, MAX_SEATS, MIN_SEATS } from "../net/session.js";

export const EMOTES = [["hi", "👋 Hi!"], ["gg", "🤝 GG"], ["nice", "👏 Nice!"], ["oops", "😅 Oops"], ["help", "🆘 Help!"], ["incoming", "⚔ Incoming!"], ["lol", "😂"], ["angry", "😤"]];
export const emoteText = (e) => (EMOTES.find((x) => x[0] === e) || [e, e])[1];
const DIFFS = ["easy", "normal", "hard", "insane"];
const ROOM_MODS = [["builders", "🔨 Builders"], ["lifeSteal", "❤ Life steal"], ["sendStock", "⏳ Send stock"], ["turbo", "⚡ Turbo income"], ["noFlyers", "🪽 No flyers"], ["noStealth", "👁 No stealth"], ["noDisruptors", "🪨 No disruptors"], ["anonymous", "🎭 Anonymous"], ["goldMult", "💰 Gold"], ["livesMult", "❤ Lives"]];
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function createOnlineUI(o) {
  const { DB, session, toast, sfx } = o;
  const $ = (id) => document.getElementById(id);
  const root = $("online-modal");
  let view = "home", busy = false, lastError = "";
  const muted = new Set();
  const chatLog = [];

  function open(prefillCode) {
    root.classList.add("show");
    if (session.code) { view = "room"; render(); return; }
    view = "home"; render(prefillCode);
  }
  function close() { root.classList.remove("show"); }

  // ---- home --------------------------------------------------------------------------------
  function renderHome(prefill) {
    const ar = activeRoom();
    root.innerHTML = `<div class="modal wide glass ol-modal"><button class="panel-close" id="ol-close">${icon("close")}</button>
      <h2>Play Online</h2>
      <p class="dim">Vs matches for 2–8 players: everyone owns a corridor, sends creeps around the ring and steals lives. Rooms are joined by code; the host can fill free seats with NPCs.${o.backend === "mock" ? " <b class='warn'>Local test server (?mocknet) — only tabs of this browser can join.</b>" : ""}</p>
      ${lastError ? `<div class="ol-error">⚠ ${esc(lastError)}</div>` : ""}
      <label class="ol-lbl">Your name</label>
      <input id="ol-name" class="ol-input" maxlength="16" placeholder="Nickname" value="${esc(savedName())}">
      ${ar ? `<button class="btn big primary" id="ol-rejoin">↻ Rejoin room ${esc(ar.code)}</button>` : ""}
      <div class="ol-split">
        <div class="ol-card"><b>Host a match</b><span class="dim">Create a room and share its code.</span><button class="btn primary" id="ol-create">Create room</button></div>
        <div class="ol-card"><b>Join a match</b><input id="ol-code" class="ol-input code" maxlength="6" placeholder="CODE" value="${esc(prefill || "")}"><button class="btn" id="ol-join">Join</button></div>
      </div>
      <p class="dim ol-note">Online play uses the Expanded rules at 1× speed. Waves start on a shared timer. If someone drops out, the game waits up to 30 seconds, then an NPC plays their corridor until they return.</p></div>`;
    $("ol-close").onclick = close;
    const name = () => { const n = cleanName($("ol-name").value); saveName(n); return n; };
    const run = async (fn) => {
      if (busy) return; busy = true; lastError = "";
      root.querySelectorAll(".ol-card .btn, #ol-rejoin").forEach((b) => b.classList.add("disabled"));
      try { await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error("The online service didn't answer within 20 seconds. Check the connection, then try again.")), 20000))]); } catch (e) { lastError = e.message || String(e); console.warn("[skyhold online]", e); view = "home"; render(); }
      busy = false;
      root.querySelectorAll(".ol-card .btn, #ol-rejoin").forEach((b) => b.classList.remove("disabled"));
    };
    $("ol-create").onclick = () => run(async () => { await session.create(name()); view = "room"; render(); });
    $("ol-join").onclick = () => run(async () => { await session.join($("ol-code").value, name()); view = "room"; render(); });
    const rj = $("ol-rejoin"); if (rj) rj.onclick = () => run(async () => { await session.join(ar.code, name()); view = "room"; render(); });
    $("ol-code").onkeydown = (e) => { if (e.key === "Enter") $("ol-join").click(); };
  }

  // ---- room --------------------------------------------------------------------------------
  function renderRoom() {
    const R = session.room, host = session.isHost, n = session.seatCount;
    if (!R.meta) {
      root.innerHTML = `<div class="modal glass"><p class="dim">Connecting to room ${esc(session.code || "")}…</p><button class="btn ghost" id="ol-cancel">Cancel</button></div>`;
      $("ol-cancel").onclick = async () => { await session.leave(); view = "home"; render(); };
      return;
    }
    if (R.meta.status === "closed") { toast("The host closed the room.", "warn"); session.leave(); view = "home"; render(); return; }
    const mods = (R.cfg && R.cfg.mods) || {};
    const avail = o.availableElements();
    const me = R.seats[session.seat] || {};
    let seats = "";
    for (let i = 0; i < n; i++) {
      const s = R.seats[i] || { kind: "open" };
      const el = s.el && DB.ELEMENTS[s.el];
      let body;
      if (s.kind === "human") body = `<span class="os-name">${esc(s.name)}${s.uid === session.uid ? " <i>(you)</i>" : ""}${R.meta.host === s.uid ? " 👑" : ""}</span><span class="os-state ${s.ready ? "ok" : ""}">${s.ready ? "Ready" : "Not ready"}${s.online === false ? " · offline" : ""}</span>`;
      else if (s.kind === "npc") body = `<span class="os-name">NPC</span><button class="seg small" data-diff="${i}" ${host ? "" : "disabled"}>${(s.diff || "normal").replace(/^./, (c) => c.toUpperCase())}</button>`;
      else if (s.kind === "closed") body = `<span class="os-name dim">Closed</span>`;
      else body = `<span class="os-name dim">Open — waiting for a player</span>`;
      const tools = host && s.uid !== session.uid ? `<button class="seg small" data-kind="${i}" title="Open / NPC / Closed">${s.kind === "npc" ? "🤖" : s.kind === "closed" ? "✕" : s.kind === "human" ? "👤" : "○"}</button>${s.kind === "human" ? `<button class="seg small" data-kick="${i}" title="Kick">⏏</button>` : ""}` : "";
      const elBtn = (s.kind === "npc" && host) ? `<button class="os-el" data-npcel="${i}" style="--ec:${el ? el.color : "#888"}">${el ? sigil(s.el, "sm") : "🎲"}</button>` : `<span class="os-el" style="--ec:${el ? el.color : "#555"}">${el ? sigil(s.el, "sm") : "·"}</span>`;
      seats += `<div class="os-row ${s.kind}">${elBtn}<div class="os-body">${body}</div><div class="os-tools">${tools}</div></div>`;
    }
    const cs = session.canStart();
    const link = location.origin + location.pathname + "?room=" + session.code + (o.backend === "mock" ? "&mocknet" : "");
    root.innerHTML = `<div class="modal wide glass ol-modal">
      <div class="ol-head"><h2>Room <span class="ol-code">${session.code}</span></h2><button class="btn small" id="ol-copy">🔗 Copy invite</button><button class="btn small ghost" id="ol-leave">Leave</button></div>
      <div class="ol-cols">
        <div class="ol-col">
          <div class="ol-sub">Seats ${host ? `<span class="opt-seg"><button class="seg small" id="ol-n-minus">−</button><b>${n}</b><button class="seg small" id="ol-n-plus">+</button></span>` : `<b>${n}</b>`}</div>
          <div class="os-list">${seats}</div>
          ${me.kind === "human" ? `<div class="ol-sub">Your element</div><div class="assign-opts">${DB.ELEMENT_ORDER.map((e) => { const ok = avail.includes(e); return `<button class="elbtn ${me.el === e ? "sel" : ""} ${ok ? "" : "locked"}" data-myel="${e}" style="--ec:${DB.ELEMENTS[e].color}">${ok ? sigil(e, "sm") : icon("lock", "sm")}<span>${DB.ELEMENTS[e].name}</span></button>`; }).join("")}</div>` : ""}
          <div class="ol-sub">Match rules ${host ? "" : "<span class='dim'>(set by the host)</span>"}</div>
          <div class="mod-chips">${ROOM_MODS.map(([k, label]) => { const v = mods[k]; const isMult = k === "goldMult" || k === "livesMult"; const on = isMult ? (v || 1) !== 1 : v !== false && (v || ["builders", "lifeSteal", "sendStock"].includes(k)); return `<button class="mod-chip ${on ? "on" : ""}" data-rmod="${k}" ${host ? "" : "disabled"}>${label}${isMult ? " ×" + (v || 1) : ""}</button>`; }).join("")}</div>
        </div>
        <div class="ol-col chat-col">
          <div class="ol-sub">Chat</div>
          <div class="ol-chat" id="ol-chat">${chatHTML()}</div>
          <div class="ol-chat-in"><input id="ol-say" class="ol-input" maxlength="140" placeholder="Say something…"><button class="btn small" id="ol-send">Send</button></div>
        </div>
      </div>
      <div class="ol-foot">
        ${me.kind === "human" && !host ? `<button class="btn big ${me.ready ? "" : "primary"}" id="ol-ready">${me.ready ? "✓ Ready — tap to cancel" : "I'm ready"}</button>` : ""}
        ${host ? `<button class="btn big primary ${cs.ok ? "" : "disabled"}" id="ol-start">${cs.ok ? "Start match" : esc(cs.why)}</button>` : `<p class="dim">The host starts the match when everyone is ready.</p>`}
      </div></div>`;
    $("ol-copy").onclick = async () => { try { await navigator.clipboard.writeText(link); toast("Invite link copied"); } catch (e) { toast("Code: " + session.code); } };
    $("ol-leave").onclick = async () => { await session.leave(); view = "home"; render(); };
    const rd = $("ol-ready"); if (rd) rd.onclick = () => session.setReady(!me.ready);
    const stb = $("ol-start"); if (stb) stb.onclick = () => { if (session.canStart().ok) o.onHostStart(); };
    const mi = $("ol-n-minus"), pl = $("ol-n-plus");
    if (mi) mi.onclick = () => session.setSeatCount(n - 1);
    if (pl) pl.onclick = () => session.setSeatCount(n + 1);
    root.querySelectorAll("[data-myel]").forEach((b) => b.onclick = () => { if (!avail.includes(b.dataset.myel)) { toast("Locked — raise your Mastery to play it."); return; } session.setElement(b.dataset.myel); });
    root.querySelectorAll("[data-kind]").forEach((b) => b.onclick = () => {
      const i = +b.dataset.kind, s = R.seats[i] || { kind: "open" };
      if (s.kind === "human") return;
      const next = s.kind === "open" ? { kind: "npc", diff: "normal", el: DB.ELEMENT_ORDER[(i * 3) % 8] } : s.kind === "npc" ? { kind: "closed" } : { kind: "open" };
      session.setSeat(i, next);
    });
    root.querySelectorAll("[data-diff]").forEach((b) => b.onclick = () => { const i = +b.dataset.diff, s = R.seats[i]; session.setSeat(i, { ...s, diff: DIFFS[(DIFFS.indexOf(s.diff || "normal") + 1) % DIFFS.length] }); });
    root.querySelectorAll("[data-npcel]").forEach((b) => b.onclick = () => { const i = +b.dataset.npcel, s = R.seats[i]; const k = DB.ELEMENT_ORDER.indexOf(s.el); session.setSeat(i, { ...s, el: DB.ELEMENT_ORDER[(k + 1) % 8] }); });
    root.querySelectorAll("[data-kick]").forEach((b) => b.onclick = () => session.kick(+b.dataset.kick));
    root.querySelectorAll("[data-rmod]").forEach((b) => b.onclick = () => {
      const k = b.dataset.rmod, m = { builders: true, lifeSteal: true, sendStock: true, ...mods };
      if (k === "goldMult" || k === "livesMult") { const S = [0.5, 1, 2]; m[k] = S[(S.indexOf(m[k] || 1) + 1) % S.length]; } else m[k] = !m[k];
      session.setMods(m);
    });
    const say = () => { const i = $("ol-say"); if (!i.value.trim()) return; session.say(i.value).then((ok) => { if (!ok) toast("Slow down a little.", "warn"); }); i.value = ""; };
    $("ol-send").onclick = say;
    $("ol-say").onkeydown = (e) => { if (e.key === "Enter") say(); };
    const ch = $("ol-chat"); if (ch) ch.scrollTop = ch.scrollHeight;
  }
  function render(prefill) { if (!root.classList.contains("show")) return; if (view === "home") renderHome(prefill); else renderRoom(); }

  // ---- chat ---------------------------------------------------------------------------------
  function chatHTML() {
    return chatLog.filter((m) => !muted.has(m.uid)).slice(-40).map((m) => `<div class="cl ${m.sys ? "sys" : ""}"><b data-mute="${m.uid || ""}" style="color:${m.color || "#cfd2ff"}">${esc(m.n)}</b> ${esc(m.m)}</div>`).join("") || `<p class="dim">No messages yet.</p>`;
  }
  function pushChat(m) {
    chatLog.push(m); if (chatLog.length > 200) chatLog.shift();
    if (muted.has(m.uid)) return;
    // lobby view
    const box = $("ol-chat");
    if (box && root.classList.contains("show")) { box.innerHTML = chatHTML(); box.scrollTop = box.scrollHeight; }
    // in-game feed
    const feed = $("chat-feed");
    if (feed) {
      const d = document.createElement("div");
      d.className = "cf-line" + (m.emote ? " emo" : "") + (m.sys ? " sys" : "");
      d.innerHTML = `<b data-mute="${m.uid || ""}" style="color:${m.color || "#cfd2ff"}">${esc(m.n)}</b> ${esc(m.m)}`;
      feed.appendChild(d);
      while (feed.children.length > 7) feed.removeChild(feed.firstChild);
      setTimeout(() => d.classList.add("old"), 12000);
    }
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("[data-mute]");
    if (!b || !b.dataset.mute || b.dataset.mute === session.uid) return;
    const u = b.dataset.mute;
    if (muted.has(u)) { muted.delete(u); toast("Unmuted " + b.textContent); } else { muted.add(u); toast("Muted " + b.textContent + " — tap their name again to unmute"); }
  });
  session.on("chat", (v) => { const s = session.room.seats[v.s]; pushChat({ uid: v.uid, n: v.n, m: v.m, color: s && s.el && DB.ELEMENTS[s.el] ? DB.ELEMENTS[s.el].glow : null }); if (v.uid !== session.uid) sfx && sfx("click"); });
  session.on("emote", (v) => {
    const s = session.room.seats[v.s];
    if (muted.has(v.uid)) return;
    pushChat({ uid: v.uid, n: (s && s.name) || "?", m: emoteText(v.e), emote: true, color: s && s.el && DB.ELEMENTS[s.el] ? DB.ELEMENTS[s.el].glow : null });
    o.onEmote && o.onEmote(v.s, emoteText(v.e));
  });
  session.on("room", () => { if (view === "room") render(); if (session.room.start && session.room.meta && session.room.meta.status === "playing") o.onStart(); });

  // in-game chat input & emote bar
  function toggleChatInput(force) {
    const row = $("chat-input-row"); if (!row) return;
    const want = force != null ? force : !row.classList.contains("show");
    row.classList.toggle("show", want);
    if (want) setTimeout(() => $("chat-input") && $("chat-input").focus(), 30);
  }
  function toggleEmotes(force) {
    const bar = $("emote-bar"); if (!bar) return;
    const want = force != null ? force : !bar.classList.contains("show");
    bar.classList.toggle("show", want);
  }
  function bindGame() {
    const bar = $("emote-bar");
    if (bar) { bar.innerHTML = EMOTES.map(([k, t]) => `<button class="emo-btn" data-emo="${k}">${t}</button>`).join(""); bar.querySelectorAll("[data-emo]").forEach((b) => b.onclick = () => { session.emote(b.dataset.emo); toggleEmotes(false); }); }
    const inp = $("chat-input");
    if (inp) inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === "Enter") { if (inp.value.trim()) session.say(inp.value).then((ok) => { if (!ok) toast("Slow down a little.", "warn"); }); inp.value = ""; toggleChatInput(false); } else if (e.key === "Escape") toggleChatInput(false); };
    const sb = $("chat-send"); if (sb) sb.onclick = () => inp && inp.onkeydown({ key: "Enter", stopPropagation() {} });
  }
  bindGame();

  function showError(msg) { lastError = msg; view = "home"; root.classList.add("show"); render(); }
  return { showError, open, close, render, pushChat, toggleChatInput, toggleEmotes, get isOpen() { return root.classList.contains("show"); } };
}
