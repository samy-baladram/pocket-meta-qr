// QR check before deploy: render every QR (R12: packed "q", else the old SVG "qr") to pixels, decode it with jsQR
// (like a phone camera), parse the deck code, and compare it with the cards and energy shown next to it.
// alt versions (R5): their QR must give the list's cards - out + in, with the list's energy.
// Event lists (R8) in site/t/: their QR must give their own cards and energy. more.json decks (R9): as data.json.
// Exit code 1 when any QR fails, so the site workflow does not deploy.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { Resvg } from "@resvg/resvg-js";
import jsQR from "jsqr";
import { parseDeckCode, createDeckCode, getCardDeckBuilderNr } from "ptcgp-deckcode";
import { findCard } from "./common.mjs";
const require = createRequire(import.meta.url);

const site = process.argv[2] || "site";
const QUIET = 4; // quiet zone in modules (the page draws the QR on white; the SVG itself has no margin)

// Packed QR (R12): "<n>:<base64>", n x n grid row-major, MSB first, 1 = dark. Drawn with a quiet zone, 8 px per module.
function decodePacked(q) {
  const [n, b64] = [+q.slice(0, q.indexOf(":")), q.slice(q.indexOf(":") + 1)];
  const by = Buffer.from(b64, "base64");
  if (by.length !== (n * n + 7) >> 3) throw new Error("packed QR has the wrong length");
  const S = 8, W = (n + 2 * QUIET) * S, px = new Uint8ClampedArray(W * W * 4).fill(255);
  for (let k = 0; k < n * n; k++) {
    if (!(by[k >> 3] & (128 >> (k & 7)))) continue;
    const r = Math.floor(k / n) + QUIET, c = (k % n) + QUIET;
    for (let y = r * S; y < r * S + S; y++) for (let x = c * S; x < c * S + S; x++) {
      const i = (y * W + x) * 4; px[i] = px[i + 1] = px[i + 2] = 0;
    }
  }
  const res = jsQR(px, W, W);
  if (!res) throw new Error("jsQR could not read the packed QR");
  return res.data;
}

function decode(svg) {
  if (!svg.startsWith("<")) return decodePacked(svg);
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
  return { cards: [...m.values()].filter((c) => c.c > 0), energy: list.energy, q: a.q ?? a.qr };
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

// R16a (Nov 13, 2026): the page makes share links from cards.json. For every list the deck code made from cards.json
// (card id -> game number, in the list's card order, with the list's energy) must be the same text as the QR's code.
const NR = new Map();
if (existsSync(`${site}/cards.json`))
  for (const [nr, id] of JSON.parse(readFileSync(`${site}/cards.json`, "utf8")).c) NR.set(id, nr);
let cardsOk = 0;
const viaCards = (list) => {
  const nrs = [];
  for (const c of list.cards) {
    const nr = NR.get(c.id);
    if (nr == null) throw new Error(`cards.json has no number for ${c.id}`);
    for (let k = 0; k < c.c; k++) nrs.push(nr);
  }
  return createDeckCode(nrs, list.energy);
};

let ok = 0, none = 0;
const bad = [];
for (const { where, list } of lists) {
  const qr = list.q ?? list.qr;
  if (!qr) { none++; continue; }
  try {
    const code = decode(qr);
    const p = parseDeckCode(code);
    const got = [...p.deckBuilderNrs].sort((a, b) => a - b);
    if (JSON.stringify(got) !== JSON.stringify(expected(list))) throw new Error("cards differ");
    const energy = p.energy ?? p.energyTypes ?? null;
    if (Array.isArray(energy) && JSON.stringify([...energy].sort()) !== JSON.stringify([...list.energy].sort()))
      throw new Error(`energy differs: QR ${energy.join("+")} vs ${list.energy.join("+")}`);
    if (NR.size) {
      const mine = viaCards(list);
      if (mine !== code) throw new Error(`cards.json code differs: ${mine} vs QR ${code}`);
      cardsOk++;
    }
    ok++;
  } catch (e) {
    bad.push(`${where}: ${e.message}`);
  }
}
const nAlt = lists.filter((x) => x.alt).length, nEv = lists.filter((x) => x.ev).length;
console.log(`QR check: ${ok} of ${lists.length} QR codes (${lists.length - nAlt - nEv} lists + ${nAlt} alt versions + ${nEv} event lists) decoded and ` +
  `equal to the deck; ${none} without QR; ${bad.length} failed` +
  (NR.size ? `; cards.json code = QR code: ${cardsOk}` : "; no cards.json"));
bad.forEach((b) => console.log("  FAIL", b));
process.exit(bad.length ? 1 : 0);
