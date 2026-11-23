// Layout check (Nov 23): open the main views of a page (served by a local server) and list text that sticks out of the
// screen, is cut by its box, or wraps a one-line pill into 2 lines.
//   SITE=http://localhost:8767/ node tools/layout_check.mjs preview/de/ 360 [baseline.json]
// SAVE=base.json on the English page, then pass base.json for a language page: only the problems English does not have.
// Long-word test page: node i18n/pseudo.mjs <patched page> <out> --long (every word 60% longer).
import { chromium } from "playwright"; // npm i -g playwright (not a site dependency)
const [path, W = "360", BASE] = process.argv.slice(2), B = (process.env.SITE || "http://localhost:8767/") + path;
const b = await chromium.launch({ });
const p = await b.newPage({ viewport: { width: +W, height: 800 }, deviceScaleFactor: 1 }); const errs = []; p.on("pageerror", (e) => errs.push(e.message + " @ " + (e.stack || "").split("\n")[1]));
const found = new Map();
async function scan(view) {
  await p.waitForTimeout(700);
  const r = await p.evaluate(() => {
    const out = [], vw = innerWidth, cs = (e) => getComputedStyle(e);
    const scroller = (e) => { for (let a = e.parentElement; a; a = a.parentElement) { const o = cs(a).overflowX; if (o === "auto" || o === "scroll") return true; } return false; };
    const name = (e) => e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + (typeof e.className === "string" && e.className ? "." + e.className.trim().split(/\s+/).slice(0, 2).join(".") : "");
    for (const e of document.querySelectorAll("body *")) {
      if (!e.offsetParent && cs(e).position !== "fixed") continue;
      const rc = e.getBoundingClientRect(); if (rc.width < 2 || rc.height < 2) continue;
      const s = cs(e), txt = (e.innerText || "").trim().replace(/\s+/g, " ").slice(0, 50);
      if (!txt || e.closest("[hidden],svg")) continue;
      if ((rc.right > vw + 1 || rc.left < -1) && !scroller(e) && s.position !== "fixed") out.push(["off-screen", name(e), txt, Math.round(rc.right - vw)]);
      const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (own) { // text cut by an ancestor that hides overflow
        for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) { const o = cs(a); if (/hidden|clip/.test(o.overflowX + o.overflow)) {
          const ar = a.getBoundingClientRect(); if (rc.right > ar.right + 1 || rc.left < ar.left - 1) out.push(["cut by box", name(e) + " in " + name(a), txt, Math.round(Math.max(rc.right - ar.right, ar.left - rc.left))]); break; } } }
      if (own && /^(BUTTON|A|LABEL|SPAN|B|SMALL)$/.test(e.tagName) && s.whiteSpace !== "normal" ? false : own && (e.tagName === "BUTTON" || e.getAttribute("role") === "tab" || parseFloat(s.borderRadius) >= 10)) {
        const r = document.createRange(); r.selectNodeContents(e); const tops = new Set([...r.getClientRects()].filter((q) => q.width > 1).map((q) => Math.round(q.top / 4)));
        if (tops.size > 1 && rc.height < 70) out.push(["2 lines", name(e), txt, tops.size]); }
      if (own && e.scrollWidth > e.clientWidth + 1 && !scroller(e)) out.push([s.textOverflow === "ellipsis" ? "cut (…)" : (s.overflow.includes("hidden") || s.overflow.includes("clip") ? "cut" : "sticks out"), name(e), txt, e.scrollWidth - e.clientWidth]);
    }
    return out;
  });
  for (const [k, n, t, px] of r) { const key = k + " " + n; if (!found.has(key)) found.set(key, { k, n, t, px, view }); }
}
const step = async (view, fn) => { const n0 = errs.length; try { await fn(); await scan(view); if (errs.length > n0) console.log("errors in", view, errs[n0].slice(0, 120)); } catch (e) { console.log("step failed:", view, e.message.split("\n")[0]); } };
await p.goto(B, { waitUntil: "networkidle" });
await step("meta", async () => {});
await step("deck open", async () => { await p.click("main .arow >> nth=0"); await p.waitForTimeout(900); });
await step("deck stats", async () => { const s = await p.$(".dpill"); if (s) await s.click(); });
await p.keyboard.press("Escape");
await step("filter", async () => { await p.goto(B, { waitUntil: "networkidle" }); await p.click("#filtBtn"); });
await step("events", async () => { await p.goto(B + "#events", { waitUntil: "networkidle" }); });
await step("event open", async () => { const e = await p.$$("#evl button.arow, #evl .evrow, #evl [data-tid]"); if (e[0]) await e[0].click(); await p.waitForTimeout(1200); });
await step("packs", async () => { await p.goto(B, { waitUntil: "networkidle" }); await p.click("[role=tab] >> nth=2"); });
await step("pack open", async () => { const e = await p.$$("button.pkr:not([disabled])"); if (e[0]) await e[0].click(); await p.waitForTimeout(800); });
await step("limited", async () => { await p.goto(B + "#limited", { waitUntil: "networkidle" }); });
await step("about", async () => { await p.goto(B, { waitUntil: "networkidle" }); const f = await p.$$("footer button, .foot button"); if (f[0]) await f[0].click(); });
await step("whats new", async () => { await p.goto(B, { waitUntil: "networkidle" }); const f = await p.$$("footer button, .foot button"); if (f[1]) await f[1].click(); });
let rows = [...found.values()].sort((a, b) => a.k.localeCompare(b.k));
import { existsSync, readFileSync, writeFileSync } from "node:fs";
const keyOf = (r) => r.k + " " + r.n.replace(/ in .*/, "");
if (BASE && existsSync(BASE)) { const base = new Set(JSON.parse(readFileSync(BASE, "utf8"))); rows = rows.filter((r) => !base.has(keyOf(r))); }
if (process.env.SAVE) writeFileSync(process.env.SAVE, JSON.stringify(rows.map(keyOf)));
for (const r of rows) console.log(`${r.k.padEnd(11)} ${r.n.padEnd(34)} ${String(r.px).padStart(4)}px  [${r.view}] ${r.t}`);
console.log(`${rows.length} problems, page errors: ${errs.length}`, [...new Set(errs)].slice(0,3).join(" | ").slice(0,400)); await b.close();
