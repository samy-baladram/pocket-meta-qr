// QR check before deploy: render every QR in site/data.json and site/v/*.json to pixels, decode it with jsQR
// (like a phone camera), parse the deck code, and compare it with the cards and energy shown next to it.
// Exit code 1 when any QR fails, so the site workflow does not deploy.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { Resvg } from "@resvg/resvg-js";
import jsQR from "jsqr";
import { parseDeckCode, getCardDeckBuilderNr } from "ptcgp-deckcode";
import { findCard } from "./common.mjs";
const require = createRequire(import.meta.url);

const site = process.argv[2] || "site";
const QUIET = 4; // quiet zone in modules (the page draws the QR on white; the SVG itself has no margin)

function decode(svg) {
  // Add the quiet zone with a larger viewBox, render on white at about 8 px per module.
  const vb = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
  if (!vb) throw new Error("no viewBox");
  const n = +vb[1];
  const framed = svg.replace(vb[0], `viewBox="${-QUIET} ${-QUIET} ${n + 2 * QUIET} ${n + 2 * QUIET}"`);
  const png = new Resvg(framed, { background: "#ffffff", fitTo: { mode: "width", value: (n + 2 * QUIET) * 8 } }).render();
  const r = jsQR(new Uint8ClampedArray(png.pixels), png.width, png.height);
  if (!r) throw new Error("jsQR could not read the QR");
  return r.data;
}

function expected(list) {
  const nrs = [];
  for (const c of list.cards) {
    const [set, num] = c.id.split("-");
    // card id set -> Limitless set: "b1a" -> "B1a", "c1" -> "C1", promo "pa" -> "P-A"
    const s = /^p[a-z]$/.test(set) ? `P-${set[1].toUpperCase()}` : set[0].toUpperCase() + set.slice(1);
    const nr = getCardDeckBuilderNr(findCard(s, +num));
    for (let k = 0; k < c.c; k++) nrs.push(nr);
  }
  return nrs.sort((a, b) => a - b);
}

const lists = [];
const data = JSON.parse(readFileSync(`${site}/data.json`, "utf8"));
for (const d of data.decks) lists.push({ where: `${d.id} (best)`, list: d });
if (existsSync(`${site}/v`)) for (const f of readdirSync(`${site}/v`)) {
  const v = JSON.parse(readFileSync(`${site}/v/${f}`, "utf8"));
  v.vars.forEach((x, i) => lists.push({ where: `${v.id} (list ${i + 2})`, list: x }));
}

let ok = 0, none = 0;
const bad = [];
for (const { where, list } of lists) {
  if (!list.qr) { none++; continue; }
  try {
    const code = decode(list.qr);
    const p = parseDeckCode(code);
    const got = [...p.deckBuilderNrs].sort((a, b) => a - b);
    if (JSON.stringify(got) !== JSON.stringify(expected(list))) throw new Error("cards differ");
    const energy = p.energy ?? p.energyTypes ?? null;
    if (Array.isArray(energy) && JSON.stringify([...energy].sort()) !== JSON.stringify([...list.energy].sort()))
      throw new Error(`energy differs: QR ${energy.join("+")} vs ${list.energy.join("+")}`);
    ok++;
  } catch (e) {
    bad.push(`${where}: ${e.message}`);
  }
}
console.log(`QR check: ${ok} of ${lists.length} lists decoded and equal to the shown deck; ${none} without QR; ${bad.length} failed`);
bad.forEach((b) => console.log("  FAIL", b));
process.exit(bad.length ? 1 : 0);
