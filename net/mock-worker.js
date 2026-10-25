/* Skyhold TD — net/mock-worker.js
   A tiny in-browser stand-in for Firebase Realtime Database, shared by every tab of one browser
   (SharedWorker). For local testing of online play with ?mocknet. It mimics:
     - value and child-added/removed listeners (child-added replays existing children on subscribe)
     - multi-path update(), push() with time-ordered keys, compare-and-set for transactions
     - { ".sv": "timestamp" }
     - onDisconnect updates, run when a tab says goodbye or stops answering pings
     - the two lockstep rules from database.rules.json: rooms/$r/net/$s/c/$t is write-once and only
       accepted while $t > u (the seat's ack), and u only ever grows. */
const root = {};
const ports = new Set();
const subs = new Map();           // key -> { port, id, kind, path, seen:Set } (ids are per tab, so the key includes the tab)
let portN = 0;
const disc = new Map();           // uid -> [{ path, value }]
const alive = new Map();          // uid -> { port, last }

const split = (p) => String(p || "").split("/").filter(Boolean);
function getAt(path) { let n = root; for (const k of split(path)) { if (n == null || typeof n !== "object") return null; n = n[k]; } return n === undefined ? null : n; }
function clone(v) { return v == null ? null : JSON.parse(JSON.stringify(v)); }
function resolveTS(v) {
  if (v && typeof v === "object") { if (v[".sv"] === "timestamp") return Date.now(); const o = Array.isArray(v) ? [] : {}; for (const k in v) o[k] = resolveTS(v[k]); return o; }
  return v;
}
function prune(o) { if (o && typeof o === "object") { for (const k of Object.keys(o)) { o[k] = prune(o[k]); if (o[k] == null || (typeof o[k] === "object" && !Array.isArray(o[k]) && !Object.keys(o[k]).length)) delete o[k]; } } return o; }
function setAt(path, value) {
  const ks = split(path);
  if (!ks.length) return;
  let n = root;
  for (let i = 0; i < ks.length - 1; i++) { if (n[ks[i]] == null || typeof n[ks[i]] !== "object") n[ks[i]] = {}; n = n[ks[i]]; }
  if (value == null) delete n[ks[ks.length - 1]]; else n[ks[ks.length - 1]] = value;
  prune(root);
}
// lockstep rules
function check(path, value) {
  const k = split(path);
  if (k[0] === "rooms" && k[2] === "net" && k.length >= 5) {
    const seat = "rooms/" + k[1] + "/net/" + k[3];
    const u = getAt(seat + "/u");
    if (k[4] === "c" && k[5] != null) { if (getAt(path) != null) return false; if (u != null && !(k[5] > u)) return false; }
    if (k[4] === "u" && k.length === 5) { if (u != null && !(value > u)) return false; }
  }
  return true;
}
function flatten(base, obj) { const out = []; for (const k in obj) out.push([base ? base + "/" + k : k, obj[k]]); return out; }

function write(pairs) {
  for (const [p, v] of pairs) if (!check(p, v)) return false;
  const before = clone(root);
  for (const [p, v] of pairs) setAt(p, clone(resolveTS(v)));
  notify(before);
  return true;
}
function notify(before) {
  for (const [sid, s] of subs) {
    if (s.kind === "value") {
      const a = JSON.stringify(walk(before, s.path)), b = JSON.stringify(getAt(s.path));
      if (a !== b) send(s.port, { sub: s.id, value: getAt(s.path) });
    } else {
      const now = getAt(s.path) || {};
      if (s.kind === "child") { for (const k of Object.keys(now).sort()) if (!s.seen.has(k)) { s.seen.add(k); send(s.port, { sub: s.id, key: k, value: now[k] }); } }
      else { for (const k of [...s.seen]) if (!(k in now)) { s.seen.delete(k); send(s.port, { sub: s.id, key: k }); } }
    }
  }
}
function walk(o, path) { let n = o; for (const k of split(path)) { if (n == null || typeof n !== "object") return null; n = n[k]; } return n === undefined ? null : n; }
function send(port, m) { try { port.postMessage(m); } catch (e) { /* closed */ } }
let pushN = 0;
function pushKey() { return Date.now().toString(36).padStart(9, "0") + (++pushN).toString(36).padStart(4, "0"); }
function goodbye(uid) {
  const list = disc.get(uid); disc.delete(uid); alive.delete(uid);
  if (list && list.length) write(list.flatMap((d) => flatten(d.path, d.value)));
}
setInterval(() => { const now = Date.now(); for (const [uid, a] of alive) if (now - a.last > 20000) goodbye(uid); }, 1000);

onconnect = (e) => {
  const port = e.ports[0];
  const pid = ++portN;
  ports.add(port);
  port.onmessage = (ev) => {
    const m = ev.data;
    const reply = (value, error) => send(port, { re: m.id, value, error });
    if (m.uid) alive.set(m.uid, { port, last: Date.now() });
    switch (m.op) {
      case "hello": reply(true); break;
      case "ping": reply(true); break;
      case "get": reply(clone(getAt(m.path))); break;
      case "set": write([[m.path, m.value]]) ? reply(true) : reply(null, "PERMISSION_DENIED"); break;
      case "update": write(flatten(m.path, m.value)) ? reply(true) : reply(null, "PERMISSION_DENIED"); break;
      case "push": { const k = pushKey(); write([[m.path + "/" + k, m.value]]) ? reply(k) : reply(null, "PERMISSION_DENIED"); break; }
      case "cas": { const cur = getAt(m.path); if (JSON.stringify(cur) !== JSON.stringify(m.expect)) { reply(false); break; } reply(write([[m.path, m.value]])); break; }
      case "onDisconnect": { const l = disc.get(m.uid) || []; l.push({ path: m.path, value: m.value }); disc.set(m.uid, l); reply(true); break; }
      case "cancelDisconnect": { const l = (disc.get(m.uid) || []).filter((d) => d.path !== m.path); disc.set(m.uid, l); reply(true); break; }
      case "sub": {
        const s = { port, id: m.id, kind: m.kind, path: m.path, seen: new Set() };
        subs.set(pid + ":" + m.id, s);
        if (m.kind === "value") send(port, { sub: m.id, value: clone(getAt(m.path)) });
        else if (m.kind === "child") { const now = getAt(m.path) || {}; for (const k of Object.keys(now).sort()) { s.seen.add(k); send(port, { sub: m.id, key: k, value: clone(now[k]) }); } }
        else { const now = getAt(m.path) || {}; for (const k of Object.keys(now)) s.seen.add(k); }
        break;
      }
      case "unsub": subs.delete(pid + ":" + m.sid); break;
      case "bye": goodbye(m.uid); for (const [sid, s] of subs) if (s.port === port) subs.delete(sid); break;
    }
  };
  port.start();
};
