// QR check before deploy: render every QR in site/data.json and site/v/*.json to pixels, decode it with jsQR
// (like a phone camera), parse the deck code, and compare it with the cards and energy shown next to it.
// alt versions (R5): their QR must give the list's cards - out + in, with the list's energy.
// Event lists (R8) in site/t/: their QR must give their own cards and energy. more.json decks (R9): as data.json.
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

// The list of an alt version: the shown list's cards - out + in, with the shown list's energy.
function altList(list, a) {
  const m = new Map(list.cards.map((c) => [c.id, { ...c }]));
  for (const c of a.out) m.get(c.id).c -= c.c;
  for (const c of a.in) m.set(c.id, { ...c, c: (m.get(c.id)?.c || 0) + c.c });
  return { cards: [...m.values()].filter((c) => c.c > 0), energy: list.energy, qr: a.qr };
}

const lists = [];
const add = (where, list) => {
  lists.push({ where, list });
  (list.alt || []).forEach((a, k) => lists.push({ where: `${where} alt ${k + 1}`, list: altList(list, a), alt: true }));
};
const data = JSON.parse(readFileSync(`${site}/data.json`, "utf8"));
for (const d of data.decks) add(`${d.id} (best)`, d);
// R9: the "Show more decks" file (more.json) has the same deck format.
if (existsSync(`${site}/more.json`))
  for (const d of JSON.parse(readFileSync(`${site}/more.json`, "utf8")).decks) add(`${d.id} (best, more)`, d);
if (existsSync(`${site}/v`)) for (const f of readdirSync(`${site}/v`)) {
  const v = JSON.parse(readFileSync(`${site}/v/${f}`, "utf8"));
  v.vars.forEach((x, i) => add(`${v.id} (list ${i + 2})`, x));
}

// Event lists (R8): site/t/<tid>.json, 1 list per public decklist of the event.
if (existsSync(`${site}/t`)) for (const f of readdirSync(`${site}/t`)) {
  const t = JSON.parse(readFileSync(`${site}/t/${f}`, "utf8"));
  t.lists.forEach((x) => lists.push({ where: `event ${t.tid} place ${x.pl}`, list: x, ev: true }));
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
const nAlt = lists.filter((x) => x.alt).length, nEv = lists.filter((x) => x.ev).length;
console.log(`QR check: ${ok} of ${lists.length} QR codes (${lists.length - nAlt - nEv} lists + ${nAlt} alt versions + ${nEv} event lists) decoded and ` +
  `equal to the deck; ${none} without QR; ${bad.length} failed`);
bad.forEach((b) => console.log("  FAIL", b));
process.exit(bad.length ? 1 : 0);
