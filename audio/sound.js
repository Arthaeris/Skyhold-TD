/* Skyhold TD — audio/sound.js
   Music is Circle's own track (assets/audio/music.mp3 — Circle's music_menu.mp3 and music_game.mp3 are the
   same file). Sound effects are synthesized with WebAudio like Riftfall's, so they cost no downloads.
   Everything is throttled: a wave of forty towers must never turn into noise. */
const KEY = "skyhold_audio_v1";

export function createSound() {
  const pref = { muted: false, music: 0.4, sfx: 0.7, musicOn: true, sfxOn: true };
  try { Object.assign(pref, JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) { /* fine */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(pref)); } catch (e) { /* fine */ } };
  let music = null, unlocked = false, wantMusic = false;
  let ctx = null, master = null, sfxBus = null, noiseBuf = null;
  const last = {};

  function initCtx() {
    if (ctx) { if (ctx.state === "suspended") ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createDynamicsCompressor();
    master.threshold.value = -16; master.ratio.value = 5;
    master.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    apply();
  }
  function apply() {
    const musicOff = pref.muted || !pref.musicOn;
    if (music) {
      music.muted = musicOff; music.volume = Math.max(0, Math.min(1, pref.music));
      // switched off means stopped, not just silent
      if (musicOff) { if (!music.paused) music.pause(); } else if (wantMusic && music.paused && unlocked) music.play().catch(() => {});
    }
    if (sfxBus) sfxBus.gain.value = pref.muted || !pref.sfxOn ? 0 : pref.sfx * 0.6;
  }
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    initCtx();
    try { music = new Audio("assets/audio/music.mp3"); music.loop = true; } catch (e) { music = null; }
    apply();
    if (wantMusic && music && !pref.muted && pref.musicOn) music.play().catch(() => {});
  }
  function playMusic(on) { wantMusic = on; if (!music) return; if (on && !pref.muted && pref.musicOn) music.play().catch(() => {}); else music.pause(); }

  // ---- synth helpers ---------------------------------------------------------
  function throttle(key, ms) { const t = performance.now(); if (last[key] && t - last[key] < ms) return false; last[key] = t; return true; }
  function tone(type, f0, f1, dur, vol, delay = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, freq, q = 1, type = "bandpass", delay = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(sfxBus); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }

  const SFX = {
    click() { if (throttle("click", 40)) tone("triangle", 880, 660, 0.06, 0.12); },
    build() { noise(0.12, 0.35, 300, 1, "lowpass"); tone("square", 180, 90, 0.12, 0.12); tone("triangle", 660, 0, 0.18, 0.1, 0.08); tone("triangle", 990, 0, 0.2, 0.08, 0.14); },
    upgrade() { [523, 659, 784, 1046].forEach((f, i) => tone("triangle", f, 0, 0.16, 0.1, i * 0.05)); },
    sell() { tone("square", 1318, 0, 0.08, 0.07); tone("square", 1760, 0, 0.12, 0.07, 0.06); noise(0.08, 0.15, 3000, 2); },
    reject() { if (throttle("rej", 150)) { tone("sawtooth", 180, 120, 0.18, 0.08); } },
    shoot(el) {
      if (!throttle("shoot", 55)) return;
      const f = { fire: 220, ice: 1200, nature: 520, storm: 900, light: 1400, darkness: 160, mech: 400, abnormal: 700 }[el] || 600;
      if (el === "mech") noise(0.05, 0.12, 1800, 3); else tone(el === "fire" || el === "darkness" ? "sawtooth" : "triangle", f, f * 0.6, 0.08, 0.05);
    },
    zap() { if (throttle("zap", 90)) { noise(0.09, 0.12, 4200, 6); tone("square", 1600, 400, 0.07, 0.03); } },
    boom() { if (throttle("boom", 80)) { noise(0.25, 0.25, 220, 0.8, "lowpass"); tone("sine", 120, 45, 0.25, 0.14); } },
    kill() { if (throttle("kill", 45)) tone("triangle", 520 + Math.random() * 200, 180, 0.1, 0.06); },
    bossKill() { noise(0.6, 0.35, 160, 0.7, "lowpass"); [392, 523, 659, 784].forEach((f, i) => tone("triangle", f, 0, 0.35, 0.12, i * 0.09)); },
    life() { if (throttle("life", 250)) { tone("sawtooth", 140, 70, 0.35, 0.16); tone("square", 220, 110, 0.25, 0.06, 0.05); } },
    wave() { tone("sawtooth", 196, 196, 0.5, 0.08); tone("sawtooth", 294, 294, 0.5, 0.06, 0.18); tone("triangle", 392, 0, 0.6, 0.08, 0.36); },
    boss() { tone("sawtooth", 73, 55, 1.2, 0.18); noise(1.0, 0.18, 120, 0.6, "lowpass"); tone("square", 110, 82, 0.9, 0.06, 0.3); },
    clear() { [659, 784, 988, 1318].forEach((f, i) => tone("triangle", f, 0, 0.22, 0.09, i * 0.07)); },
    synergy() { if (throttle("syn", 300)) { tone("sine", 1046, 0, 0.3, 0.09); tone("sine", 1568, 0, 0.35, 0.07, 0.06); } },
    whoosh() { noise(0.45, 0.12, 900, 0.7); },
    hammer() { if (throttle("hammer", 120)) { tone("square", 1400 + Math.random() * 300, 600, 0.05, 0.05); noise(0.05, 0.08, 2600, 4); } },
    steal() { [784, 988, 1175].forEach((f, i) => tone("triangle", f, 0, 0.14, 0.08, i * 0.05)); },
    blink() { if (throttle("blink", 160)) tone("sine", 1800, 600, 0.12, 0.05); },
    victory() { [523, 659, 784, 1046, 1318].forEach((f, i) => tone("triangle", f, 0, 0.5, 0.11, i * 0.12)); },
    defeat() { [392, 330, 262, 196].forEach((f, i) => tone("sawtooth", f, f * 0.95, 0.45, 0.08, i * 0.18)); },
  };

  return {
    unlock, playMusic, apply,
    play(name, arg) { if (!ctx || pref.muted || !pref.sfxOn) return; const f = SFX[name]; if (f) try { f(arg); } catch (e) { /* audio is best-effort */ } },
    get pref() { return pref; },
    setMuted(m) { pref.muted = !!m; save(); apply(); },
    setMusicOn(on) { pref.musicOn = !!on; if (on) pref.muted = false; save(); apply(); },
    setSfxOn(on) { pref.sfxOn = !!on; if (on) pref.muted = false; save(); apply(); },
    setMusic(v) { pref.music = v; if (v > 0) pref.muted = false; save(); apply(); },
    setSfx(v) { pref.sfx = v; if (v > 0) pref.muted = false; save(); apply(); },
  };
}
