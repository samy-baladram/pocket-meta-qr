// R27 (Nov 22, 2026): the link preview images of the section pages, static/og-events.png and static/og-packs.png
// (1200 x 630, the style of static/og.png). Run by hand from the repo root after a local build (it uses site/z/ and
// site/p/ images): `node pipeline/og_sections.mjs`. Needs Playwright with Chromium (not in package.json: the site
// build does not run it). Make them again when the pictured cards / packs are old (new set).
// Arguments: --events <cardId,cardId,cardId> --packs <packImg,packImg,packImg> (defaults below).
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = await import("playwright")); }

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1].split(",") : d; };
const EVENTS = arg("--events", ["c1-056", "b4-103", "c1-084"]);        // winning decks' cards (events.json win.art)
const PACKS = arg("--packs", ["c1-megamewtwox", "c1-pikachu", "b4-booster"]);
const b64 = (f) => `data:image/${f.endsWith(".svg") ? "svg+xml" : "webp"};base64,` + readFileSync(f).toString("base64");
const font = "data:font/woff2;base64," + readFileSync("static/figtree.woff2").toString("base64");

const page = (headline, chips, imgs, kind) => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: F; src: url(${font}) format("woff2"); font-weight: 300 900; }
* { box-sizing: border-box; margin: 0; }
body { width: 1200px; height: 630px; overflow: hidden; font-family: F, sans-serif; background: #eef3f8; position: relative; }
.sky { position: absolute; inset: 0 0 auto 0; height: 330px; background: linear-gradient(90deg, #12c8f4, #2a8df0 55%, #4558e6); }
.band { position: absolute; left: -40px; right: -40px; top: 150px; height: 170px; background: linear-gradient(#f9fbfd, #e8eef5);
  transform: rotate(-5deg); transform-origin: left top; box-shadow: 0 10px 24px rgba(30, 60, 110, .12); }
.band::after { content: ""; position: absolute; left: 0; right: 0; bottom: -5px; height: 5px;
  background: linear-gradient(90deg, #ff8a65, #ffd166, #7bdc8c, #4fd1e0, #6ea8ff, #b67cf0); }
.title { position: absolute; left: 100px; top: 200px; transform: rotate(-5deg); transform-origin: left top; display: flex;
  align-items: center; gap: 26px; font-weight: 800; font-style: italic; font-size: 86px; color: #5b6880; letter-spacing: -1px; }
.title img { width: 64px; height: 64px; }
.sec { position: absolute; left: 104px; top: 92px; transform: rotate(-5deg); transform-origin: left top; color: #fff;
  font-weight: 800; font-size: 30px; letter-spacing: 1.5px; text-transform: uppercase; text-shadow: 0 2px 8px rgba(0,40,120,.25); }
h1 { position: absolute; left: 96px; top: 372px; width: 640px; font-size: 44px; line-height: 1.17; font-weight: 800; color: #3b4352; }
h1 b { color: #2167d8; font-weight: 800; }
.url { position: absolute; left: 96px; bottom: 54px; font-size: 32px; font-weight: 800; color: #2167d8; }
.chips { position: absolute; right: 80px; bottom: 46px; display: flex; gap: 12px; }
.chips span { background: #fff; border-radius: 99px; padding: 10px 20px; font-size: 22px; font-weight: 700; color: #3b4352;
  box-shadow: 0 2px 8px rgba(30, 60, 110, .10); }
.art { position: absolute; right: 70px; top: 300px; width: 360px; height: 230px; }
.art img { position: absolute; border-radius: ${kind === "card" ? 9 : 6}px; box-shadow: 0 10px 26px rgba(20, 40, 80, .28); }
</style></head><body>
<div class="sky"></div><div class="band"></div>
<div class="sec">${kind === "card" ? "Latest events" : "Booster packs"}</div>
<div class="title"><img src="${b64("static/icon.svg")}">Pocket Meta QR</div>
<h1>${headline}</h1>
<div class="art">${imgs}</div>
<div class="url">pocketmetaqr.com</div>
<div class="chips">${chips.map((c) => `<span>${c}</span>`).join("")}</div>
</body></html>`;

// 3 images fanned out (middle one on top). Cards 5:7, packs about 1:1.93.
const fan = (files, w, h) => files.map((f, i) => {
  const rot = [-10, 0, 10][i], x = [0, 105, 210][i], y = [26, 0, 26][i];
  return `<img src="${b64(f)}" style="width:${w}px;height:${h}px;left:${x}px;top:${y - 70}px;transform:rotate(${rot}deg);z-index:${i === 1 ? 2 : 1}">`;
}).join("");

const jobs = [
  ["static/og-events.png", page("The latest tournaments and their <b>top 8 lists</b>, with QR codes",
    ["Every event", "Top 8", "Free"], fan(EVENTS.map((c) => `site/z/${c}.webp`), 150, 210), "card")],
  ["static/og-packs.png", page("Which <b>booster packs</b> give this week's meta cards",
    ["Pack per card", "Meta cards", "Free"], fan(PACKS.map((p) => `site/p/${p}.webp`), 118, 228), "pack")],
];
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
for (const [out, html] of jobs) {
  await p.setContent(html);
  await p.evaluate(() => document.fonts.ready);
  writeFileSync(out, await p.screenshot({ type: "png" }));
  console.log("wrote", out);
}
await b.close();
