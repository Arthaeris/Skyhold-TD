/* =============================================================================
 * Skyhold TD — ui/tutorial.js
 * THE GUIDED TOUR. A spotlight engine (dim everything, ring the one thing being
 * talked about, only let that thing be pressed) and a small step runner.
 *
 * A step: {
 *   target: () => Element | DOMRect-like {left, top, width, height} | null   (null = a centred card)
 *   title, text,                    what the card says
 *   allow: true                     let taps through the spotlight (the player does the thing)
 *   done: () => bool                advance when this becomes true (polled), or
 *   on: "eventName"                 advance when notify(eventName) arrives
 *   next: "Next" | false            show a Next button (default: shown unless done/on is set)
 *   pause: true                     hold the game while the card is up
 *   enter / leave: () => void
 * }
 * The tour can be skipped at any point and replayed from the menu or the pause menu.
 * ===========================================================================*/

export function createTutorial(opts) {
  const layer = opts.layer;
  const steps = opts.steps;
  let i = -1, raf = 0, poll = 0, active = true;
  layer.innerHTML = `<div class="tu-block" data-b="t"></div><div class="tu-block" data-b="l"></div><div class="tu-block" data-b="r"></div><div class="tu-block" data-b="b"></div><div class="tu-cover"></div><div class="tu-ring"></div><div class="tu-card glass" role="dialog" aria-modal="true"><div class="tu-prog"></div><h3 class="tu-title"></h3><p class="tu-text"></p><div class="tu-acts"><button class="btn ghost small tu-skip">Skip tour</button><button class="btn primary small tu-next">Next</button></div></div>`;
  const B = {}; layer.querySelectorAll(".tu-block").forEach((d) => B[d.dataset.b] = d);
  const cover = layer.querySelector(".tu-cover"), ring = layer.querySelector(".tu-ring"), card = layer.querySelector(".tu-card");
  const elTitle = layer.querySelector(".tu-title"), elText = layer.querySelector(".tu-text"), elProg = layer.querySelector(".tu-prog");
  const bNext = layer.querySelector(".tu-next"), bSkip = layer.querySelector(".tu-skip");
  bNext.onclick = (e) => { e.stopPropagation(); advance(); };
  bSkip.onclick = (e) => { e.stopPropagation(); finish(true); };
  layer.classList.add("show");

  function rectOf(t) {
    if (!t) return null;
    if (t.getBoundingClientRect) { if (!t.isConnected || t.offsetParent === null && getComputedStyle(t).position !== "fixed") return null; const r = t.getBoundingClientRect(); return r.width || r.height ? r : null; }
    return t;
  }
  const val = (x) => (typeof x === "function" ? x() : x) || "";
  function place() {
    if (!active) return;
    const s = steps[i]; if (!s) return;
    // live copy: a step can change its words as the player acts (ring open / closed, etc.)
    if (typeof s.text === "function") { const t = val(s.text); if (elText._h !== t) { elText.innerHTML = t; elText._h = t; } }
    if (typeof s.title === "function") { const t = val(s.title); if (elTitle._h !== t) { elTitle.innerHTML = t; elTitle._h = t; } }
    const W = window.innerWidth, H = window.innerHeight;
    const r0 = rectOf(s.target ? s.target() : null);
    const pad = s.pad != null ? s.pad : 6;
    if (r0) {
      const r = { left: Math.max(0, r0.left - pad), top: Math.max(0, r0.top - pad), right: Math.min(W, r0.left + r0.width + pad), bottom: Math.min(H, r0.top + r0.height + pad) };
      B.t.style.cssText = `left:0;top:0;width:${W}px;height:${r.top}px`;
      B.b.style.cssText = `left:0;top:${r.bottom}px;width:${W}px;height:${Math.max(0, H - r.bottom)}px`;
      B.l.style.cssText = `left:0;top:${r.top}px;width:${r.left}px;height:${r.bottom - r.top}px`;
      B.r.style.cssText = `left:${r.right}px;top:${r.top}px;width:${Math.max(0, W - r.right)}px;height:${r.bottom - r.top}px`;
      ring.style.cssText = `display:block;left:${r.left}px;top:${r.top}px;width:${r.right - r.left}px;height:${r.bottom - r.top}px`;
      cover.style.cssText = s.allow ? "display:none" : `display:block;left:${r.left}px;top:${r.top}px;width:${r.right - r.left}px;height:${r.bottom - r.top}px`;
      // the card goes where there is more room: above or below the spotlight
      const ch = card.offsetHeight || 160, cw = Math.min(360, W - 24);
      const below = H - r.bottom, above = r.top;
      let top = below >= ch + 16 || below >= above ? r.bottom + 12 : r.top - ch - 12;
      top = Math.max(10, Math.min(H - ch - 10, top));
      const left = Math.max(12, Math.min(W - cw - 12, (r.left + r.right) / 2 - cw / 2));
      card.style.cssText = `left:${left}px;top:${top}px;width:${cw}px`;
    } else {
      for (const k in B) B[k].style.cssText = k === "t" ? `left:0;top:0;width:${W}px;height:${H}px` : "width:0;height:0";
      ring.style.cssText = "display:none"; cover.style.cssText = "display:none";
      const cw = Math.min(380, W - 24), ch = card.offsetHeight || 180;
      card.style.cssText = `left:${(W - cw) / 2}px;top:${Math.max(10, (H - ch) / 2)}px;width:${cw}px`;
    }
    raf = requestAnimationFrame(place);
  }
  function show(n) {
    const prev = steps[i]; if (prev && prev.leave) prev.leave();
    i = n;
    const s = steps[i]; if (!s) { finish(false); return; }
    if (s.enter) s.enter();
    if (s.skipIf && s.skipIf()) { show(i + 1); return; }
    elTitle.innerHTML = val(s.title); elTitle._h = elTitle.innerHTML;
    elText.innerHTML = val(s.text); elText._h = elText.innerHTML;
    elProg.innerHTML = steps.map((_, k) => `<i class="${k < i ? "done" : k === i ? "on" : ""}"></i>`).join("");
    const waits = !!(s.done || s.on);
    bNext.style.display = s.next === false || (waits && !s.next) ? "none" : "";
    bNext.textContent = typeof s.next === "string" ? s.next : (i === steps.length - 1 ? "Let's play" : "Next");
    card.classList.toggle("wait", waits);
    if (opts.setPaused) opts.setPaused(!!s.pause);
    card.classList.remove("pop"); void card.offsetWidth; card.classList.add("pop");
  }
  function advance() { if (active) show(i + 1); }
  function finish(skipped) {
    if (!active) return;
    active = false;
    cancelAnimationFrame(raf); clearInterval(poll);
    const s = steps[i]; if (s && s.leave) s.leave();
    layer.classList.remove("show"); layer.innerHTML = "";
    if (opts.setPaused) opts.setPaused(false);
    if (opts.onEnd) opts.onEnd(skipped);
  }
  poll = setInterval(() => { const s = steps[i]; if (active && s && s.done && s.done()) advance(); }, 150);
  show(0); place();
  return {
    notify(kind, ev) { const s = steps[i]; if (active && s && s.on === kind) advance(); if (opts.onEvent) opts.onEvent(kind, ev); },
    end: () => finish(true),
    get active() { return active; },
  };
}

export default { createTutorial };
