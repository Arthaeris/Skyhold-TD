/* Skyhold TD — net/session.js
   Rooms and lobby on Firebase Realtime Database (via net/rtdb.js), plus presence, chat and emotes.

   Layout (see database.rules.json):
     rooms/$code/meta     { host, status: lobby|playing|ended, created, version }   host writes
     rooms/$code/cfg      { n, mods }                                              host writes
     rooms/$code/seats/$i { kind: open|human|npc|closed, uid, name, el, ready, diff, online, offAt, bot }
     rooms/$code/members/$uid { seat, name }
     rooms/$code/start    { seed, at, mods, players: [{ kind, name, el, diff }] }  host, write-once
     rooms/$code/net/$i   { u, c/$turn, h/$turn }                                  lockstep (net/lockstep.js)
     rooms/$code/chat/$k  { uid, s, n, m, t }      rooms/$code/emo/$k { uid, s, e, t }
   A seat index is also the player's index in the sim. Open seats are dropped when the match starts. */
import * as rt from "./rtdb.js";

export const MAX_SEATS = 8, MIN_SEATS = 2;
const CODE_ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const NAME_KEY = "skyhold_nick_v1", ACTIVE_KEY = "skyhold_activeroom_v1";

export function savedName() { try { return localStorage.getItem(NAME_KEY) || ""; } catch (e) { return ""; } }
export function saveName(n) { try { localStorage.setItem(NAME_KEY, n); } catch (e) { /* fine */ } }
export function cleanName(n) { return String(n || "").replace(/[<>&"'`]/g, "").replace(/\s+/g, " ").trim().slice(0, 16) || "Player"; }
export function cleanText(t) { return String(t || "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 140); }
export function activeRoom() { try { return JSON.parse(localStorage.getItem(ACTIVE_KEY)) || null; } catch (e) { return null; } }
export function setActiveRoom(v) { try { if (v) localStorage.setItem(ACTIVE_KEY, JSON.stringify(v)); else localStorage.removeItem(ACTIVE_KEY); } catch (e) { /* fine */ } }

export function createSession(opts) {
  const version = opts.version;            // content hash: everyone in a room must match
  let uid = null, code = null, seat = -1, unsubs = [];
  const room = { meta: null, cfg: null, seats: {}, members: {}, start: null };
  const listeners = { room: [], chat: [], emote: [] };
  const fire = (k, ...a) => listeners[k].forEach((f) => { try { f(...a); } catch (e) { console.warn(e); } });
  const P = (x) => "rooms/" + code + (x ? "/" + x : "");

  async function connect() { const info = await rt.connect(); uid = info.uid; return info; }
  function stopListening() { unsubs.forEach((u) => u()); unsubs = []; }
  function listen() {
    stopListening();
    unsubs.push(rt.on(P("meta"), (v) => { room.meta = v; fire("room", "meta"); }));
    unsubs.push(rt.on(P("cfg"), (v) => { room.cfg = v; fire("room", "cfg"); }));
    unsubs.push(rt.on(P("seats"), (v) => { room.seats = v || {}; const mine = Object.keys(room.seats).find((k) => room.seats[k] && room.seats[k].uid === uid); seat = mine != null ? +mine : -1; fire("room", "seats"); }));
    unsubs.push(rt.on(P("members"), (v) => { room.members = v || {}; fire("room", "members"); }));
    unsubs.push(rt.on(P("start"), (v) => { room.start = v; fire("room", "start"); }));
    const t0 = rt.serverNow() - 60000;
    unsubs.push(rt.onChild(P("chat"), (k, v) => { if (v && v.t > t0) fire("chat", v); }));
    unsubs.push(rt.onChild(P("emo"), (k, v) => { if (v && v.t > rt.serverNow() - 8000) fire("emote", v); }));
  }
  function seatCount() { return (room.cfg && room.cfg.n) || 4; }
  const isHost = () => !!(room.meta && room.meta.host === uid);

  async function create(name) {
    await connect();
    for (let tries = 0; tries < 6; tries++) {
      let c = ""; for (let i = 0; i < 5; i++) c += CODE_ABC[Math.floor(Math.random() * CODE_ABC.length)];
      if (await rt.get("rooms/" + c + "/meta")) continue;
      code = c;
      const seats = { 0: { kind: "human", uid, name: cleanName(name), el: opts.defaultElement || "fire", ready: false, online: true } };
      for (let i = 1; i < 4; i++) seats[i] = { kind: "open" };
      await rt.set(P("meta"), { host: uid, status: "lobby", created: rt.TS, version });
      await rt.set(P("cfg"), { n: 4, mods: opts.defaultMods || {} });
      await rt.set(P("seats"), seats);
      await rt.set(P("members/" + uid), { seat: 0, name: cleanName(name) });
      seat = 0;
      await armPresence(0);
      listen();
      setActiveRoom({ code, uid });
      return code;
    }
    throw new Error("Couldn't find a free room code — try again.");
  }

  async function join(c, name) {
    await connect();
    c = String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const meta = await rt.get("rooms/" + c + "/meta");
    if (!meta) throw new Error("No room with code " + c + ".");
    if (meta.version !== version) throw new Error("That room runs a different game version. Both players need to reload the page.");
    code = c;
    // already in it (reload / rejoin)?
    const seats = (await rt.get(P("seats"))) || {};
    let mine = Object.keys(seats).find((k) => seats[k] && seats[k].uid === uid);
    if (mine == null) {
      if (meta.status !== "lobby") throw new Error("That match has already started.");
      for (const k of Object.keys(seats).sort((a, b) => a - b)) {
        if (!seats[k] || seats[k].kind !== "open") continue;
        const r = await rt.claim(P("seats/" + k), (cur) => (cur && cur.kind === "open" ? { kind: "human", uid, name: cleanName(name), el: opts.defaultElement || "fire", ready: false, online: true } : undefined));
        if (r.committed) { mine = k; break; }
      }
      if (mine == null) throw new Error("That room is full.");
      await rt.set(P("members/" + uid), { seat: +mine, name: cleanName(name) });
    }
    seat = +mine;
    if (meta.status === "lobby") await armPresence(seat); // in a running match, presence is armed once caught up
    listen();
    setActiveRoom({ code, uid });
    return { code, seat, status: meta.status };
  }

  async function armPresence(s) {
    const path = P("seats/" + s);
    await rt.onDisconnect(path, { online: false, offAt: rt.TS });
    await rt.update(path, { online: true });
  }

  async function leave() {
    if (!code) return;
    try {
      const st = room.meta && room.meta.status;
      if (st === "lobby") {
        if (isHost()) await rt.update(P("meta"), { status: "closed" });
        else if (seat >= 0) { await rt.set(P("seats/" + seat), { kind: "open" }); await rt.remove(P("members/" + uid)); }
      } else if (seat >= 0) await rt.update(P("seats/" + seat), { online: false, offAt: rt.TS });
      await rt.cancelDisconnect(P("seats/" + seat));
    } catch (e) { /* best effort */ }
    stopListening();
    setActiveRoom(null);
    code = null; seat = -1;
  }

  // ---- lobby edits ----------------------------------------------------------------------------
  const mySeat = (o) => (seat >= 0 ? rt.update(P("seats/" + seat), o) : Promise.resolve());
  function setReady(r) { return mySeat({ ready: !!r }); }
  function setElement(el) { return mySeat({ el, ready: false }); }
  async function setSeatCount(n) {
    if (!isHost()) return;
    n = Math.max(MIN_SEATS, Math.min(MAX_SEATS, n | 0));
    const cur = seatCount(), upd = {};
    for (let i = cur; i < n; i++) upd["seats/" + i] = { kind: "open" };
    for (let i = n; i < cur; i++) { const s = room.seats[i]; if (s && s.kind === "human" && s.uid !== uid) return; upd["seats/" + i] = null; }
    upd["cfg/n"] = n;
    await rt.update(P(), upd);
  }
  function setSeat(i, val) { if (!isHost()) return; return rt.set(P("seats/" + i), val); }
  function kick(i) { const s = room.seats[i]; if (!isHost() || !s || s.uid === uid) return; const upd = { ["seats/" + i]: { kind: "open" } }; if (s.uid) upd["members/" + s.uid] = null; return rt.update(P(), upd); }
  function setMods(mods) { if (isHost()) return rt.update(P("cfg"), { mods }); }

  function canStart() {
    const n = seatCount();
    let active = 0, humans = 0;
    for (let i = 0; i < n; i++) {
      const s = room.seats[i]; if (!s) continue;
      if (s.kind === "human") { humans++; active++; if (!s.ready && s.uid !== uid) return { ok: false, why: "Waiting for everyone to be ready" }; }
      else if (s.kind === "npc") active++;
    }
    if (active < MIN_SEATS) return { ok: false, why: "Need at least 2 seats (players or NPCs)" };
    return { ok: true };
  }
  // host: compact the seats (drop open/closed), freeze everyone's settings, and go
  async function start(seed, mods, elements) {
    if (!isHost()) return;
    const n = seatCount(), list = [];
    for (let i = 0; i < n; i++) { const s = room.seats[i]; if (s && (s.kind === "human" || s.kind === "npc")) list.push(s); }
    const now = rt.TS;
    const seats = {}, players = [], members = {}; // members are written one path each (the rules grant per uid)
    list.forEach((s, i) => {
      const el = s.kind === "npc" ? (s.el || elements[i % elements.length]) : s.el;
      seats[i] = s.kind === "human" ? { kind: "human", uid: s.uid, name: s.name, el, ready: true, online: s.uid === uid, offAt: now, bot: false } : { kind: "npc", name: s.name || ("NPC " + i), el, diff: s.diff || "normal", bot: true, online: false };
      players.push({ kind: s.kind, name: s.kind === "npc" ? (s.name || "NPC " + i) : s.name, el, diff: s.diff || "normal" });
      if (s.uid) members["members/" + s.uid] = { seat: i, name: s.name };
    });
    await rt.update(P(), { seats, ...members, start: { seed, at: now, mods, players }, "meta/status": "playing" });
  }
  function markEnded() { if (isHost()) return rt.update(P("meta"), { status: "ended" }); }

  // ---- chat & emotes --------------------------------------------------------------------------
  let lastChat = 0;
  async function say(text) {
    const m = cleanText(text);
    if (!m || !code) return false;
    const now = Date.now();
    if (now - lastChat < 1200) return false;
    lastChat = now;
    const me = room.seats[seat] || {};
    await rt.push(P("chat"), { uid, s: seat, n: me.name || "?", m, t: rt.TS });
    return true;
  }
  let lastEmo = 0;
  async function emote(e) {
    if (!code || Date.now() - lastEmo < 1500) return false;
    lastEmo = Date.now();
    await rt.push(P("emo"), { uid, s: seat, e, t: rt.TS });
    return true;
  }

  return {
    connect, create, join, leave, listen,
    setReady, setElement, setSeatCount, setSeat, kick, setMods, canStart, start, markEnded, armPresence,
    say, emote,
    on(k, f) { listeners[k].push(f); return () => { listeners[k] = listeners[k].filter((x) => x !== f); }; },
    get uid() { return uid; }, get code() { return code; }, get seat() { return seat; }, get room() { return room; },
    get isHost() { return isHost(); }, get seatCount() { return seatCount(); },
    path: P,
  };
}
