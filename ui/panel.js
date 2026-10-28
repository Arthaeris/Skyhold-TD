/* Skyhold TD — ui/panel.js
   The one anatomy every panel shares (styles: "PANELS v2" in style.css):
     pvPanel({ cls, head: { ico, ac, title, sub, closeId }, tabs, body, foot })
   head: a coloured icon badge, the title with a one-line subtitle, and a close button that never scrolls away
   tabs: optional segmented control under the head (fixed)
   body: the only part that scrolls
   foot: the panel's actions, fixed at the bottom so they never sit on top of content */
import { icon } from "./icons.js";

export function pvHead(h) {
  return `<header class="pv-head">${h.ico ? `<div class="pv-ico"${h.ac ? ` style="--ac:${h.ac}"` : ""}>${h.ico}</div>` : ""}<div class="pv-titles"><h2${h.titleId ? ` id="${h.titleId}"` : ""}${h.titleCls ? ` class="${h.titleCls}"` : ""}>${h.title}</h2>${h.sub ? `<p class="pv-sub"${h.subId ? ` id="${h.subId}"` : ""}>${h.sub}</p>` : ""}</div>${h.closeId ? `<button class="panel-close" id="${h.closeId}" aria-label="Close">${icon("close")}</button>` : ""}</header>`;
}
export function pvPanel(o) {
  return `<div class="modal glass pv${o.cls ? " " + o.cls : ""}">${pvHead(o.head)}${o.tabs || ""}<div class="pv-body"${o.bodyId ? ` id="${o.bodyId}"` : ""}>${o.body || ""}</div>${o.foot ? `<footer class="pv-foot${o.footCls ? " " + o.footCls : ""}">${o.foot}</footer>` : ""}</div>`;
}
export const pvSec = (title, inner, right = "", cls = "") => `<section class="pv-sec${cls ? " " + cls : ""}">${title ? `<div class="pv-sec-h"><span>${title}</span>${right ? `<b>${right}</b>` : ""}</div>` : ""}${inner}</section>`;
export const pvTiles = (tiles, n) => `<div class="pv-tiles" style="--n:${n || tiles.length}">${tiles.map((t) => `<div class="pv-tile${t.hi ? " hi" : ""}"${t.ac ? ` style="--ac:${t.ac}"` : ""}><span>${t.ico || ""}${t.label}</span><b>${t.value}</b></div>`).join("")}</div>`;
export const pvMeter = (frac, ac) => `<div class="pv-meter"${ac ? ` style="--ac:${ac}"` : ""}><i style="width:${Math.max(0, Math.min(100, frac * 100)).toFixed(1)}%"></i></div>`;
export const pvPips = (n, max, ac) => `<span class="pv-pips"${ac ? ` style="--ac:${ac}"` : ""}>${Array.from({ length: max }, (_, i) => `<i class="${i < n ? "on" : ""}"></i>`).join("")}</span>`;
// segmented tabs: [[key, label]], the selected key; panes are elements with data-pane="key"
export const pvTabs = (tabs, sel, attr = "data-tab") => `<nav class="pv-tabs">${tabs.map(([k, n]) => `<button ${attr}="${k}" class="${k === sel ? "sel" : ""}">${n}</button>`).join("")}</nav>`;
export function bindPvTabs(root, attr = "data-tab", onChange) {
  root.querySelectorAll(`[${attr}]`).forEach((b) => b.onclick = () => {
    const k = b.getAttribute(attr);
    root.querySelectorAll(`[${attr}]`).forEach((x) => x.classList.toggle("sel", x === b));
    root.querySelectorAll("[data-pane]").forEach((p) => { p.hidden = p.dataset.pane !== k; });
    const body = root.querySelector(".pv-body"); if (body) body.scrollTop = 0;
    if (onChange) onChange(k);
  });
}
