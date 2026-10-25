/* Skyhold TD — net/rtdb.js
   A small adapter over Firebase Realtime Database, so the rest of the net code never touches the SDK
   directly. Two backends share the API:
     - "firebase": the real thing (anonymous auth + RTDB), loaded on demand from gstatic.
     - "mock": a local stand-in server running in a SharedWorker (net/mock-worker.js). Every tab of
       the same browser connects to it, so two tabs can play an online match with no internet. It
       enforces the same two lockstep rules as database.rules.json (write-once inputs, monotonic acks).
       Use it with ?mocknet in the URL.

   API: await connect() -> { uid, backend }
        get(path), set(path, v), update(path, obj), remove(path), push(path, v) -> key
        claim(path, fn) — a transaction; resolves { committed, value }
        on(path, cb) / onChild(path, cb) / onChildRemoved(path, cb) -> unsubscribe
        onDisconnect(path, obj), onConnected(cb)
        TS (a server-timestamp placeholder), serverNow()
   Paths are slash-separated strings. */

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyC4LjhS7wa0m5riGdSa80pG13Kuc62JvFM",
  authDomain: "skyhold-td.firebaseapp.com",
  databaseURL: "https://skyhold-td-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "skyhold-td",
  storageBucket: "skyhold-td.firebasestorage.app",
  messagingSenderId: "177231990189",
  appId: "1:177231990189:web:f6d0048743ce41e9ad2524",
};
const SDK = "https://www.gstatic.com/firebasejs/13.1.0/";

let impl = null;
export function backendName() {
  try { if (new URLSearchParams(location.search).has("mocknet")) return "mock"; } catch (e) { /* fine */ }
  return "firebase";
}

export async function connect() {
  if (impl) return impl.info;
  impl = backendName() === "mock" ? await mockBackend() : await firebaseBackend();
  return impl.info;
}
const need = () => { if (!impl) throw new Error("not connected"); return impl; };
export const get = (p) => need().get(p);
export const set = (p, v) => need().set(p, v);
export const update = (p, o) => need().update(p, o);
export const remove = (p) => need().remove(p);
export const push = (p, v) => need().push(p, v);
export const claim = (p, fn) => need().claim(p, fn);
export const on = (p, cb) => need().on(p, cb);
export const onChild = (p, cb) => need().onChild(p, cb);
export const onChildRemoved = (p, cb) => need().onChildRemoved(p, cb);
export const onDisconnect = (p, o) => need().onDisconnect(p, o);
export const cancelDisconnect = (p) => need().cancelDisconnect(p);
export const onConnected = (cb) => need().onConnected(cb);
export const serverNow = () => (impl ? impl.serverNow() : Date.now());
export const TS = { ".sv": "timestamp" };

// ---------------------------------------------------------------------------
// Firebase
// ---------------------------------------------------------------------------
async function firebaseBackend() {
  const [appM, authM, dbM] = await Promise.all([import(SDK + "firebase-app.js"), import(SDK + "firebase-auth.js"), import(SDK + "firebase-database.js")]);
  const app = appM.initializeApp(FIREBASE_CONFIG);
  const auth = authM.getAuth(app);
  const cred = auth.currentUser ? { user: auth.currentUser } : await new Promise((res, rej) => {
    const off = authM.onAuthStateChanged(auth, (u) => { if (u) { off(); res({ user: u }); } });
    authM.signInAnonymously(auth).catch((e) => { off(); rej(e); });
  });
  const db = dbM.getDatabase(app);
  const R = (p) => dbM.ref(db, p);
  let offset = 0;
  dbM.onValue(R(".info/serverTimeOffset"), (s) => { offset = s.val() || 0; });
  const conv = (v) => (v && v[".sv"] === "timestamp" ? dbM.serverTimestamp() : v);
  const deep = (o) => { if (o && typeof o === "object" && !Array.isArray(o)) { if (o[".sv"]) return conv(o); const r = {}; for (const k in o) r[k] = deep(o[k]); return r; } return o; };
  return {
    info: { uid: cred.user.uid, backend: "firebase" },
    async get(p) { return (await dbM.get(R(p))).val(); },
    set(p, v) { return dbM.set(R(p), deep(v)); },
    update(p, o) { return dbM.update(R(p), deep(o)); },
    remove(p) { return dbM.remove(R(p)); },
    async push(p, v) { const r = dbM.push(R(p)); await dbM.set(r, deep(v)); return r.key; },
    async claim(p, fn) { const r = await dbM.runTransaction(R(p), fn); return { committed: r.committed, value: r.snapshot.val() }; },
    on(p, cb) { return dbM.onValue(R(p), (s) => cb(s.val())); },
    onChild(p, cb) { return dbM.onChildAdded(R(p), (s) => cb(s.key, s.val())); },
    onChildRemoved(p, cb) { return dbM.onChildRemoved(R(p), (s) => cb(s.key)); },
    onDisconnect(p, o) { return dbM.onDisconnect(R(p)).update(deep(o)); },
    cancelDisconnect(p) { return dbM.onDisconnect(R(p)).cancel(); },
    onConnected(cb) { return dbM.onValue(R(".info/connected"), (s) => cb(!!s.val())); },
    serverNow() { return Date.now() + offset; },
  };
}

// ---------------------------------------------------------------------------
// Mock (SharedWorker) — same semantics, no network
// ---------------------------------------------------------------------------
async function mockBackend() {
  const url = new URL("./mock-worker.js", import.meta.url);
  const w = new SharedWorker(url, { name: "skyhold-mocknet" });
  const port = w.port;
  let seq = 0;
  const pending = new Map(), subs = new Map();
  port.onmessage = (ev) => {
    const m = ev.data;
    if (m.re != null && pending.has(m.re)) { const p = pending.get(m.re); pending.delete(m.re); if (m.error) p.rej(new Error(m.error)); else p.res(m.value); return; }
    if (m.sub != null) { const s = subs.get(m.sub); if (s) s(m); }
  };
  port.start();
  const call = (op, args) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); port.postMessage({ id, op, ...args }); });
  // each tab is its own anonymous user (sessionStorage), surviving reloads like Firebase's persisted auth
  let uid = null;
  try { uid = sessionStorage.getItem("skyhold_mock_uid"); } catch (e) { /* fine */ }
  if (!uid) { uid = "u" + Math.random().toString(36).slice(2, 10); try { sessionStorage.setItem("skyhold_mock_uid", uid); } catch (e) { /* fine */ } }
  await call("hello", { uid });
  setInterval(() => port.postMessage({ op: "ping", uid, id: 0 }), 2000); // liveness for onDisconnect
  const sub = (kind, path, cb) => { const id = ++seq; subs.set(id, cb); port.postMessage({ id, op: "sub", kind, path, uid }); return () => { subs.delete(id); port.postMessage({ op: "unsub", sid: id }); }; };
  addEventListener("pagehide", () => port.postMessage({ op: "bye", uid }));
  return {
    info: { uid, backend: "mock" },
    get: (path) => call("get", { path }),
    set: (path, value) => call("set", { path, value, uid }),
    update: (path, value) => call("update", { path, value, uid }),
    remove: (path) => call("set", { path, value: null, uid }),
    push: (path, value) => call("push", { path, value, uid }),
    async claim(path, fn) {
      for (let i = 0; i < 8; i++) {
        const cur = await call("get", { path });
        const next = fn(cur);
        if (next === undefined) return { committed: false, value: cur };
        const ok = await call("cas", { path, expect: cur, value: next, uid });
        if (ok) return { committed: true, value: next };
      }
      return { committed: false, value: await call("get", { path }) };
    },
    on: (path, cb) => sub("value", path, (m) => cb(m.value)),
    onChild: (path, cb) => sub("child", path, (m) => cb(m.key, m.value)),
    onChildRemoved: (path, cb) => sub("childRemoved", path, (m) => cb(m.key)),
    onDisconnect: (path, value) => call("onDisconnect", { path, value, uid }),
    cancelDisconnect: (path) => call("cancelDisconnect", { path, uid }),
    onConnected(cb) { setTimeout(() => cb(true), 0); return () => {}; },
    serverNow: () => Date.now(),
  };
}
