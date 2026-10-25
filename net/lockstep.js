/* Skyhold TD — net/lockstep.js
   Deterministic lockstep over Firebase Realtime Database.

   Every client runs the whole simulation. Time is cut into TURNS of 3 sim ticks (100 ms). A player's
   commands are scheduled DELAY turns ahead (200 ms), so they reach everyone before they are due; that
   short, constant input delay is the price of never stuttering on a normal connection.

   Per seat the database holds:
     net/$s/u          the last turn that seat has fully sent ("ack"), a zero-padded string
     net/$s/c/$turn    the commands for that turn, if any (serialized; write-once)
     net/$s/h/$turn    a state hash every HASH_EVERY turns, to detect desyncs
   One atomic update writes c and u together. The rules (database.rules.json, mirrored by the mock
   server) only accept c/$t while $t > u and only let u grow, so once a client has seen u >= t it
   knows it has every command for turn t, forever. Turn t runs when every living seat's u >= t;
   until then the game waits (the "waiting for…" overlay).

   A seat is written by its own player, or, when it's an NPC seat or its player has been gone for
   30 s and the seat is flagged bot, by the "driver" client (the lowest-numbered connected human),
   which runs the NPC AI for it. A player who comes back catches up by re-simulating from the seed
   with every recorded command, then takes the seat back. */
import * as rt from "./rtdb.js";
import * as C from "./commands.js";

export const TURN = 3, DELAY = 2, HASH_EVERY = 150;
const pad = (t) => String(t).padStart(8, "0");

export function createLockstep(o) {
  const { session, n } = o;
  const P = session.path;
  const up = new Array(n).fill(-1);       // acked turn per seat
  const cmds = Array.from({ length: n }, () => new Map()); // seat -> turn -> [cmd]
  const hashes = Array.from({ length: n }, () => new Map());
  const out = Array.from({ length: n }, () => ({ pending: [], sent: -1, inflight: false }));
  const drive = new Set([o.me]);
  const unsubs = [];
  let loaded = 0, desync = null;
  for (let s = 0; s < n; s++) {
    unsubs.push(rt.on(P("net/" + s + "/u"), (v) => { if (v != null) { up[s] = Math.max(up[s], +v); if (out[s].sent < up[s] && !out[s].inflight) out[s].sent = up[s]; } loaded |= 1 << s; }));
    unsubs.push(rt.onChild(P("net/" + s + "/c"), (k, v) => { try { cmds[s].set(+k, C.deserialize(JSON.parse(v))); } catch (e) { cmds[s].set(+k, []); } }));
    unsubs.push(rt.onChild(P("net/" + s + "/h"), (k, v) => { hashes[s].set(+k, v); checkHash(+k); }));
  }
  function checkHash(t) {
    if (desync) return;
    let ref = null;
    for (let s = 0; s < n; s++) { const h = hashes[s].get(t); if (h == null) continue; if (ref == null) ref = h; else if (h !== ref) { desync = { turn: t }; o.onDesync && o.onDesync(t); return; } }
  }

  // queue a local command (for my seat or a seat I drive)
  function queue(c) {
    const s = c.player;
    if (s == null || !drive.has(s)) return;
    if (out[s].pending.length < 60) out[s].pending.push(c);
  }
  // send acks (and any commands) up to execTurn + DELAY for every seat I drive
  function pump(execTurn, aheadFloor = 0) {
    const target = Math.max(execTurn + DELAY, aheadFloor);
    for (const s of drive) {
      const q = out[s];
      if (q.inflight) continue;
      const from = Math.max(q.sent, up[s]) + 1;
      if (from > target) continue;
      const upd = { u: pad(target) };
      let batch = [];
      if (q.pending.length) { batch = q.pending.splice(0, 40); upd["c/" + pad(from)] = JSON.stringify(C.serialize(batch.map((c) => ({ ...c, player: s })))); }
      q.inflight = true;
      rt.update(P("net/" + s), upd).then(() => { q.sent = Math.max(q.sent, target); q.inflight = false; }, () => {
        // someone else wrote this seat first (a takeover, or we're the late duplicate): retry later
        q.inflight = false; q.sent = up[s];
        if (s === o.me) q.pending.unshift(...batch); // my own commands are never lost
        if (o.onReject) o.onReject(s);
      });
    }
  }
  function ready(turn, required) { for (const s of required) if (up[s] < turn) return false; return true; }
  function waitingFor(turn, required) { return required.filter((s) => up[s] < turn); }
  function commandsFor(turn) {
    const list = [];
    for (let s = 0; s < n; s++) { const c = cmds[s].get(turn); if (c) for (const x of c) list.push({ ...x, player: s }); }
    return list;
  }
  function reportHash(turn, h) { if (turn % HASH_EVERY === 0) rt.set(P("net/" + o.me + "/h/" + pad(turn)), h).catch(() => {}); hashes[o.me].set(turn, h); checkHash(turn); }
  return {
    queue, pump, ready, waitingFor, commandsFor, reportHash,
    setDrive(s, on) { if (on) { if (!drive.has(s)) { drive.add(s); out[s].sent = up[s]; out[s].pending.length = 0; } } else drive.delete(s); },
    drives: (s) => drive.has(s),
    get up() { return up; }, get loadedMask() { return loaded; }, get desync() { return desync; },
    maxUp() { return Math.max(...up); }, minUp(seats) { let m = Infinity; for (const s of seats) m = Math.min(m, up[s]); return m; },
    stop() { unsubs.forEach((u) => u()); },
  };
}
