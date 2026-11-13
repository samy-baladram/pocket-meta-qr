// Build the "Pocket Meta QR" data files.
// Input : build/input.json (written by pipeline/export.py from data/meta.db):
//         {set, setName, format, summary, span, decks: [{id, count, share, w, l, t, win,
//          rows: [{key, ev, pl, sc, dt, lists: [{cards: [[count, SET, num], ...], energy: [..] | null}]}]}]}
//         rows = best finishes first. energy = as shown by Limitless (null = not shown -> guessed from attack costs).
// Output: site/data.json  (deck table + best list per deck, with energy and QR)
//         site/v/<deckId>.json  (other distinct lists of that deck; loaded by the page only on demand)
//         images.json  (card ids that need a thumbnail + art ids for deck icons)
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { createDeckCode, parseDeckCode, getCardDeckBuilderNr } from "ptcgp-deckcode";
import { findCard, attackers } from "./common.mjs";
const require = createRequire(import.meta.url);
const QRCode = require("qrcode"); // the QR library that ptcgp-deckcode uses (deckCodeToSVG = QRCode.toString)

const MAX_VARIATIONS = 10;  // lists kept per deck (the page shows them as a carousel with 1 dot per list)
const NEAR = 1;             // lists that differ by this many cards or fewer count as the same list
const PD = new Map(require("pokemon-tcg-pocket-cards/data/v5/cards.min.json").map((c) => [c.id, c]));
// R16b (Nov 13, 2026): tid + pid of a finish (row.key = "<tid>/<pid>") for the page's link to the Limitless decklist.
const src = (row) => {
  const [tid, pid] = String(row?.key || "").split("/");
  return /^[0-9a-f]{24}$/.test(tid) && pid ? { tid, pid } : {};
};
const pdId = (set, num) => `${set.toLowerCase().replace(/^p-/, "p")}-${String(num).padStart(3, "0")}`;
const LETTER = { G: "grass", R: "fire", W: "water", L: "lightning", P: "psychic", F: "fighting", D: "darkness", M: "metal" };

function colored(card) {
  const pd = PD.get(pdId(card.set, card.num));
  if (!pd || !pd.attacks) return [];
  const s = Object.values(pd.attacks).map((a) => a.cost || "").join("");
  return [...new Set(s.replace(/[^GRWLPFDM]/g, "").split("").filter(Boolean))];
}
const toList = (raw) => raw.map(([count, set, num]) => ({ count, set, num, name: PD.get(pdId(set, num))?.name ?? "?" }));
// Cards to swap to turn one 20-card list into the other (0 = the same list).
const counts = (list) => list.reduce((m, c) => m.set(pdId(c.set, c.num), (m.get(pdId(c.set, c.num)) || 0) + c.count), new Map());
function swaps(a, b) {
  let d = 0;
  for (const k of new Set([...a.keys(), ...b.keys()])) d += Math.abs((a.get(k) || 0) - (b.get(k) || 0));
  return d / 2;
}

const input = JSON.parse(readFileSync(process.argv[2] || "build/input.json", "utf8"));

// Deck name from the Limitless archetype slug, e.g. "mega-charizard-y-ex-b1a-entei-ex-a4a" -> "Mega Charizard Y ex Entei ex".
// Set-code words (b1a, a4a, c1, ...) are dropped; the other words are matched, longest first, against card names
// (so "mr-mime" -> "Mr. Mime"). Words with no card name are title-cased ("ex" stays lower case).
const slug = (s) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/['’]/g, "")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const NAME_BY_SLUG = new Map();
for (const c of PD.values()) if (c.type === "Pokémon" && !NAME_BY_SLUG.has(slug(c.name))) NAME_BY_SLUG.set(slug(c.name), c.name);
function deckName(id) {
  // Promo set codes are 2 words ("p-b"); other set codes are 1 word ("b1a", "c1").
  const words = id.replace(/(^|-)p-[a-z](?=-|$)/g, "$1").split("-").filter((w) => w && !/^[a-z]{1,2}\d+[a-z]?$/.test(w));
  const out = [];
  for (let i = 0; i < words.length;) {
    let j = words.length;
    for (; j > i; j--) if (NAME_BY_SLUG.has(words.slice(i, j).join("-"))) break;
    if (j > i) { out.push(NAME_BY_SLUG.get(words.slice(i, j).join("-"))); i = j; }
    else { out.push(words[i] === "ex" ? "ex" : words[i][0].toUpperCase() + words[i].slice(1)); i++; }
  }
  return out.join(" ");
}

const validEnergy = (e) => (e || []).filter((x) => Object.values(LETTER).includes(x)).slice(0, 3);

// Most common energy (as shown by Limitless) among the deck's decklist pages in the set. Multi-deck pages:
// the list whose Pokémon match the deck name. Returns null when no page of this deck shows the energy.
function energyVote(name, votes) {
  const n = new Map();
  for (const page of votes || []) {
    const pick = page.map((x) => ({ e: validEnergy(x.energy), s: attackers(name, toList(x.cards)).length }))
      .filter((x) => x.e.length && x.s > 0).sort((a, b) => b.s - a.s)[0];
    if (pick) { const k = [...pick.e].sort().join(","); n.set(k, (n.get(k) || 0) + 1); }
  }
  const best = [...n.entries()].sort((a, b) => b[1] - a[1])[0];
  return best ? best[0].split(",") : null;
}

// Energy of 1 list (docs/DATA.md 4.5), checked on 593 lists with known energy: 99.2 % correct.
//   1. as shown on its own Limitless decklist page            -> no eg
//   2. else the most common energy of the deck's other pages  -> eg: 2
//   3. else from the attack costs of the first named Pokémon  -> eg: 1
async function variation(name, list, problems, id, scraped, vote) {
  const at = attackers(name, list);
  let energy, guessed = 0;
  if (scraped?.length) {
    energy = validEnergy(scraped);
    if (energy.length !== scraped.length) problems.push(`${id}: unknown energy ${scraped.join("+")}`);
  }
  if (!energy?.length && vote?.length) { energy = vote; guessed = 2; }
  if (!energy?.length) {
    // Guess: colored costs of the first named attacker; the second only when the first has no colored cost.
    // (Adding the second named "ex" was wrong for support Pokémon, e.g. Indeedee ex in Dedenne ex Indeedee ex.)
    guessed = 1;
    let letters = at[0] ? colored(at[0]) : [];
    if (at[1] && !letters.length) letters = colored(at[1]);
    // Fallback: the named Pokémon need only colorless energy -> use the colored costs of the other Pokémon in the list.
    if (!letters.length) letters = [...new Set(list.flatMap((c) => colored(c)))];
    energy = letters.slice(0, 3).map((l) => LETTER[l]);
  }

  const q = makeQR(list, energy, problems, id);
  return { energy, ...(guessed ? { eg: guessed } : {}), q, art: at.map((a) => pdId(a.set, a.num)), cards: list.map((c) => ({ id: pdId(c.set, c.num), n: c.name, c: c.count })) };
}

// In-game deck code of a 20-card list + energy, as a packed QR (R12, Nov 12, 2026), or null.
// Packed = "<n>:<base64>": the n x n module grid (no quiet zone), row-major, MSB first (bit k = byte k >> 3,
// mask 128 >> (k & 7)), 1 = dark, last byte padded with 0. Same grid as the SVG used before (QRCode, error
// correction M; checked on 30 codes). About 290 characters instead of about 2,800 for the SVG.
// The code is decoded again and must give the same cards. Used for the lists, alt versions and event lists.
function packQR(code) {
  const m = QRCode.create(code, { errorCorrectionLevel: "M" }).modules;
  const n = m.size, by = Buffer.alloc((n * n + 7) >> 3);
  for (let k = 0; k < n * n; k++) if (m.data[k]) by[k >> 3] |= 128 >> (k & 7);
  return `${n}:${by.toString("base64")}`;
}
function makeQR(list, energy, problems, id) {
  const nrs = [];
  for (const c of list) {
    const nr = getCardDeckBuilderNr(findCard(c.set, c.num));
    if (nr == null) { problems.push(`${id}: no game id for ${c.set}-${c.num}`); return null; }
    for (let k = 0; k < c.count; k++) nrs.push(nr);
  }
  if (!energy.length) { problems.push(`${id}: no energy`); return null; }
  if (nrs.length !== 20) return null;
  const code = createDeckCode(nrs, energy);
  const back = parseDeckCode(code);
  if (JSON.stringify([...back.deckBuilderNrs].sort()) !== JSON.stringify([...nrs].sort())) {
    problems.push(`${id}: QR decode mismatch`);
    return null;
  }
  return packQR(code);
}

// R2 (Nov 9, 2026): the distinct 1-card changes inside a group, compared with its representative (the shown list).
//   in  = cards the change has and the shown list does not; out = cards of the shown list that the change does not have.
//   u   = finishes with that change; pl = the best place among them (members come best place first).
// Sorted by u (high first), then best place. Exact copies are not listed, so nu = exact copies + sum of u.
// R17 helpers: a record "W-L-T" as [w, l, t], the sum of 2 records, and the win rate (deck-table rule).
const rec3 = (sc) => String(sc).split("-").map(Number);
const addRec = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const winRate = ([w, l, t]) => (w + l + t ? (w + 0.5 * t) / (w + l + t) : 0);
function changes(g) {
  const by = new Map();
  g.members.forEach((x, order) => {
    const ins = [], outs = [];
    for (const k of new Set([...g.m.keys(), ...x.m.keys()])) {
      const diff = (x.m.get(k) || 0) - (g.m.get(k) || 0);
      const card = { id: k, n: PD.get(k)?.name ?? "?", c: Math.abs(diff) };
      if (diff > 0) ins.push(card); else if (diff < 0) outs.push(card);
    }
    if (!ins.length && !outs.length) return; // exact copy
    const key = JSON.stringify([ins.map((c) => [c.id, c.c]).sort(), outs.map((c) => [c.id, c.c]).sort()]);
    const e = by.get(key);
    if (e) { e.u++; e.rec = addRec(e.rec, x.rec); }
    else by.set(key, { in: ins, out: outs, u: 1, pl: x.row.pl, order, row: x.row, rec: [...x.rec] });
  });
  // R17: rec = [w, l, t] of the u finishes (R17b).
  return [...by.values()].sort((a, b) => b.u - a.u || a.order - b.order).map(({ order, ...a }) => a);
}

// R5 (Nov 9, 2026): a QR code for each alt version. Its list is exact: the shown list - out + in (1-card rule).
// Energy = the shown list's energy; when an added Pokémon needs another type, only the build log says so.
// sc, ev, dt = record, tournament and day of the best finish with that change (like pl).
const altLog = { qr: 0, none: 0, energy: [] };
async function altVersion(a, v, name, problems, id) {
  const m = new Map(v.cards.map((c) => [c.id, c.c]));
  for (const c of a.out) m.set(c.id, (m.get(c.id) || 0) - c.c);
  for (const c of a.in) m.set(c.id, (m.get(c.id) || 0) + c.c);
  const list = [...m].filter(([, n]) => n > 0).map(([k, n]) => {
    const [set, num] = k.split("-");
    const s = /^p[a-z]$/.test(set) ? `P-${set[1].toUpperCase()}` : set[0].toUpperCase() + set.slice(1);
    return { count: n, set: s, num: +num, name: PD.get(k)?.name ?? "?" };
  });
  if ([...m.values()].some((n) => n < 0) || list.reduce((t, c) => t + c.count, 0) !== 20) {
    problems.push(`${id}: alt version is not a 20-card list (${a.in.map((c) => c.n)} for ${a.out.map((c) => c.n)})`);
    a.q = null;
  } else {
    for (const c of a.in) {
      const need = colored({ set: list.find((x) => pdId(x.set, x.num) === c.id).set, num: +c.id.split("-")[1] })
        .map((l) => LETTER[l]).filter((e) => !v.energy.includes(e));
      if (need.length) altLog.energy.push(`${name}: +${c.n} needs ${need.join("+")}, list energy ${v.energy.join("+")}`);
    }
    a.q = makeQR(list, v.energy, problems, `${id} (alt)`);
  }
  altLog[a.q ? "qr" : "none"]++;
  a.sc = a.row.sc; a.ev = a.row.ev; a.dt = a.row.dt;
  Object.assign(a, src(a.row));   // R16b: tid + pid of that best finish
  delete a.row;
  return a;
}

// Guard (R4 skipped): Limitless uses 1 print per card. Report when a deck's lists have 2 ids with the same function
// (same name and text), because then lists that differ only by print would be counted as different lists.
const fnKey = (c) => JSON.stringify([c.name, c.type, c.subtype, c.health, c.ability, c.card_text,
  Object.values(c.attacks || {}).map((a) => [a.name, a.cost, a.damage, a.effect])]);
function printGuard(id, lists, problems) {
  const seen = new Map();
  for (const l of lists) for (const c of l) {
    const k = pdId(c.set, c.num), pd = PD.get(k);
    if (!pd) continue;
    const f = fnKey(pd);
    if (seen.has(f) && seen.get(f) !== k) { problems.push(`${id}: 2 prints of the same card (${seen.get(f)}, ${k})`); return; }
    seen.set(f, k);
  }
}

// R10 (Nov 11, 2026): a deck without a list in the window is a "nolist" row (rank place kept on the page).
// Its art and energy: the newest decklist page of the deck in the current set ("sample", any event), the list that
// matches the deck name (energy rule as for lists); else from the slug (named Pokémon + set code, lowest number =
// standard print) and the deck's energy vote or the attack costs of the named Pokémon (can be [] when they need
// only colorless energy).
const pickPage = (name, lists) => (lists || []).map((x) => ({ l: toList(x.cards), energy: x.energy }))
  .filter((x) => x.l.reduce((a, c) => a + c.count, 0) === 20)
  .map((x) => ({ ...x, score: attackers(name, x.l).length })).filter((x) => x.score > 0)
  .sort((a, b) => b.score - a.score)[0] || null;
const SET_WORD = /^([a-z]{1,2}\d+[a-z]?|p-[a-z])$/;
const limitlessSet = (code) => /^p[a-z]$/.test(code) ? `P-${code[1].toUpperCase()}` : code[0].toUpperCase() + code.slice(1);
function slugCards(id) {
  const words = id.replace(/(^|-)p-([a-z])(?=-|$)/g, "$1p@$2").split("-").map((w) => w.replace("@", "-"));
  const out = [];
  for (let i = 0; i < words.length;) {
    if (SET_WORD.test(words[i])) { i++; continue; }
    let j = words.length;
    for (; j > i; j--) if (NAME_BY_SLUG.has(words.slice(i, j).join("-"))) break;
    if (j === i) { i++; continue; }
    const n = NAME_BY_SLUG.get(words.slice(i, j).join("-"));
    // The set code after the name; else the next set code in the slug (1 code for 2 names: "pikachu-ex-pawmot-c1").
    const code = words.slice(j).find((w) => SET_WORD.test(w))?.replace("-", "") ?? null;
    const prints = [...PD.values()].filter((c) => c.name === n && c.type === "Pokémon" && (!code || c.set_code === code))
      .sort((a, b) => (code ? 0 : b.release_date.localeCompare(a.release_date)) || a.id.localeCompare(b.id));
    if (prints[0]) {
      const [set, num] = prints[0].id.split("-");
      out.push({ count: 1, set: limitlessSet(set), num: +num, name: n });
    }
    i = j;
  }
  return out;
}
async function noListInfo(d, name) {
  const page = pickPage(name, d.sample);
  if (page) {
    const v = await variation(name, page.l, [], d.id, page.energy, energyVote(name, d.votes));
    return { art: v.art, energy: v.energy, from: "list" };
  }
  const at = slugCards(d.id);
  let letters = at[0] ? colored(at[0]) : [];
  if (at[1] && !letters.length) letters = colored(at[1]);
  const vote = energyVote(name, d.votes);
  return { art: at.map((a) => pdId(a.set, a.num)), energy: vote || letters.slice(0, 3).map((l) => LETTER[l]), from: "slug" };
}
const nolist = [];

const decks = [], problems = [], images = new Set(), dropped = [], searchDecks = [];
let waiting = 0;
// R9 (Nov 11, 2026): decks with 0.2 % <= share < 0.5 % (input flag "more") go to site/more.json, loaded on tap.
// Only decks with at least 1 list get there (a deck without a list is skipped above, as in data.json). They share
// the global rank order, the v/ files, images, the search index and the event deck info with the data.json decks.
const moreIds = new Set();
rmSync("site/v", { recursive: true, force: true });
mkdirSync("site/v", { recursive: true });

for (const [rank, d] of input.decks.entries()) {
  const { id, count, share, w, l, t, win } = d;
  const name = deckName(id);
  // R17 (Nov 13, 2026): the most-played version represents each group (was R1: the best-placed finish).
  // Step 1: read ALL finishes (rows come best place first) and count the exact versions (the 20 cards by card id):
  //   n = finishes with that version, rec = their combined W-L-T, best = the index of its best-placed finish.
  // Step 2: versions by n (high first), then win rate (deck-table rule), then best place; a version joins the first
  //   group whose representative is NEAR card swaps or less away, else it starts a group and represents it.
  // Step 3 (below): groups by nu, then the group's win rate, then best place; keep MAX_VARIATIONS.
  const members = [];
  let of = 0;
  for (const [idx, row] of d.rows.entries()) {
    const cands = row.lists.map((x) => ({ l: toList(x.cards), energy: x.energy }))
      .filter((x) => x.l.reduce((a, c) => a + c.count, 0) === 20);
    if (!cands.length) { problems.push(`${id}: no valid list for ${row.key}`); continue; }
    // Several lists on 1 page: take the list whose Pokémon best match the deck name.
    const pick = cands.map((x) => ({ ...x, score: attackers(name, x.l).length })).sort((a, b) => b.score - a.score)[0];
    if (pick.score === 0) { problems.push(`${id}: no list on ${row.key} matches the deck name "${name}"`); continue; }
    of++;
    members.push({ m: counts(pick.l), list: pick.l, energy: pick.energy, row, idx, rec: rec3(row.sc) });
  }
  const versions = new Map();
  for (const x of members) {
    const key = [...x.m].sort(([a], [b]) => a.localeCompare(b)).join(";");
    const v = versions.get(key);
    if (v) { v.members.push(x); v.rec = addRec(v.rec, x.rec); }
    else versions.set(key, { m: x.m, best: x, members: [x], rec: [...x.rec] });
  }
  const order = [...versions.values()].sort((a, b) => b.members.length - a.members.length ||
    winRate(b.rec) - winRate(a.rec) || a.best.idx - b.best.idx);
  const groups = [];
  for (const v of order) {
    const g = groups.find((c) => swaps(c.m, v.m) <= NEAR);
    if (g) { g.members.push(...v.members); g.rec = addRec(g.rec, v.rec); g.bestIdx = Math.min(g.bestIdx, v.best.idx); }
    else groups.push({ list: v.best.list, energy: v.best.energy, m: v.m, row: v.best.row, rep: v,
      members: [...v.members], rec: [...v.rec], bestIdx: v.best.idx });
  }
  groups.forEach((g) => g.members.sort((a, b) => a.idx - b.idx));   // best place first (alt pl/sc = best finish)
  if (!groups.length) {
    waiting++;
    const x = await noListInfo(d, name);
    if (!x.art.length) problems.push(`${id}: nolist row without art`);
    x.art.forEach((a) => images.add(a));
    nolist.push({ rank: rank + 1, ...(d.rk0 != null ? { rk0: d.rk0 } : {}), ...(d.nw ? { nw: 1 } : {}), id, name, count, share, win, art: x.art,
      energy: x.energy, more: !!d.more, from: x.from });
    continue;
  }
  printGuard(id, groups.flatMap((g) => g.members.map((x) => x.list)), problems);
  // Step 3: most top players first; then the group's win rate; then its best place.
  const chosen = groups.map((g, i) => ({ ...g, used: g.members.length, i }))
    .sort((a, b) => b.used - a.used || winRate(b.rec) - winRate(a.rec) || a.bestIdx - b.bestIdx)
    .slice(0, MAX_VARIATIONS);
  if (groups.length > MAX_VARIATIONS) dropped.push(`${id}: ${groups.length} groups, kept ${MAX_VARIATIONS} ` +
    `(smallest kept: ${chosen.at(-1).used} top players; largest dropped: ${Math.max(...groups.map((g) => g.members.length)
      .filter((_, i) => !chosen.some((c) => c.i === i)))})`);

  const vote = energyVote(name, d.votes);
  const vars = [];
  for (const c of chosen) {
    const v = await variation(name, c.list, problems, id, c.energy, vote);
    v.ev = c.row.ev; v.pl = c.row.pl; v.sc = c.row.sc; v.dt = c.row.dt;
    Object.assign(v, src(c.row));   // R16b: tid + pid of the representative finish (Limitless decklist link)
    if (d.bc) {
      // R11b (Nov 11, 2026): "below the cut": the deck has no top player (W > L) in the window, so its only list is
      // its best-placed finish. Not a top player: nu = of = 0, no alt.
      v.bc = 1; v.nu = 0; v.of = 0;
      vars.push(v);
      continue;
    }
    v.nu = c.used; // finishes ("top players") in the group: exact copies + 1-card changes
    v.of = of;     // all finishes with a readable list (also those of groups that are not kept)
    v.nx = c.rep.members.length;   // R17b: finishes with exactly this list
    v.rec = c.rep.rec;             // R17b: their combined [w, l, t]
    const alt = changes(c);
    if (alt.length) v.alt = await Promise.all(alt.map((a) => altVersion(a, v, name, problems, id)));
    vars.push(v);
  }
  vars.forEach((v) => {
    v.cards.forEach((c) => images.add(c.id));
    (v.alt || []).forEach((a) => [...a.in, ...a.out].forEach((c) => images.add(c.id)));
  });
  if (vars.length > 1) writeFileSync(`site/v/${id}.json`, JSON.stringify({ id, vars: vars.slice(1).map(({ art, ...v }) => v) }));
  // For the search index (R6): every finish of the deck (all groups) and the shown lists + alt versions.
  // R11: top players only, so a "below the cut" deck is not in search.json.
  if (!d.bc) searchDecks.push({ id, finishes: groups.flatMap((g) => g.members.map((x) => x.m)),
    shown: vars.map((v) => new Map(v.cards.map((c) => [c.id, c.c]))),
    altIn: vars.flatMap((v) => (v.alt || []).flatMap((a) => a.in.map((c) => c.id))) });
  const { art, ...best } = vars[0];
  // R14: rk0 = rank 24 h before this build (0 = not in the list then); nw = first time in the list in the last 72 h.
  decks.push({ id, rank: rank + 1, ...(d.rk0 != null ? { rk0: d.rk0 } : {}), ...(d.nw ? { nw: 1 } : {}), name, count, share, w, l, t, win, art,
    nv: vars.length, ...best });
  if (d.more) moreIds.add(id);
}

// Time span and size of the data window (all tournaments of the window, not only the shown lists).
const data = { updatedAt: new Date().toISOString(), set: input.set, setName: input.setName || "", format: input.format,
  window: input.window, span: input.span, summary: input.summary,
  decks: decks.filter((d) => !moreIds.has(d.id)), more: moreIds.size,
  nolist: nolist.filter((x) => !x.more).map(({ more, from, ...x }) => x),
  ...(input.changedAt ? { changedAt: input.changedAt } : {}),
  // R15a: release day of the current set (the newest set Limitless lists).
  ...(input.setRelease ? { setRelease: input.setRelease } : {}) };
// R13b (Nov 12, 2026): the single-deck event of the window that reached the site last (largest at, then latest ts).
{
  const ev = [...(input.events || [])].filter((e) => e.at)
    .sort((a, b) => b.at.localeCompare(a.at) || b.ts.localeCompare(a.ts))[0];
  if (ev) data.latest = { tid: ev.tid, name: ev.name, players: ev.players, ts: ev.ts, at: ev.at, dt: ev.dt };
}
writeFileSync("site/data.json", JSON.stringify(data));
writeFileSync("site/more.json", JSON.stringify({ updatedAt: data.updatedAt, window: input.window, min: 0.2,
  decks: decks.filter((d) => moreIds.has(d.id)),
  nolist: nolist.filter((x) => x.more).map(({ more, from, ...x }) => x) }));

// R6 (Nov 9, 2026): card index for the page's search -> site/search.json (loaded when the search box opens).
// Cards = every card id in a shown list or an alt version ("in" card) of any deck on the page.
// Per card and deck: [deckId, usual copies, top players]. Top players = the deck's finishes in the window whose
// list has the card (all groups, also those not shown: the same population as "of"). Usual copies = the copies in
// the deck's most used shown list that has the card, else the most common count among those finishes.
// Only decks with at least 1 such finish are listed.
{
  const ids = new Set(searchDecks.flatMap((d) => [...d.shown.flatMap((m) => [...m.keys()]), ...d.altIn]));
  const cards = [];
  for (const cid of ids) {
    const per = [];
    for (const d of searchDecks) {
      const counts = d.finishes.map((m) => m.get(cid) || 0).filter((n) => n > 0);
      if (!counts.length) continue;
      let copies = d.shown.find((m) => m.has(cid))?.get(cid);
      if (copies == null) {
        const freq = new Map();
        counts.forEach((n) => freq.set(n, (freq.get(n) || 0) + 1));
        copies = [...freq].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
      }
      per.push([d.id, copies, counts.length]);
    }
    per.sort((a, b) => b[2] - a[2] || a[0].localeCompare(b[0]));
    cards.push({ id: cid, n: PD.get(cid)?.name ?? "?", u: per.reduce((t, x) => t + x[2], 0), decks: per });
  }
  cards.sort((a, b) => b.u - a.u || a.id.localeCompare(b.id));
  writeFileSync("site/search.json", JSON.stringify({ cards }));
  const noImg = cards.filter((c) => !images.has(c.id)).map((c) => c.id);
  if (noImg.length) problems.push(`search: cards without an image: ${noImg.join(", ")}`);
  console.log(`search.json: ${cards.length} cards, ${cards.reduce((t, c) => t + c.decks.length, 0)} card-deck pairs`);
}
// R8 (Nov 10, 2026): "Latest Events" tab -> site/events.json (event list) + site/t/<tid>.json (lists of 1 event).
// Single-deck events of the window, newest first. Each public list: same cards / energy / eg / QR rules as the deck
// lists (energy shown on its page, else the deck's vote, else attack costs). Every card id goes into the image set.
const eventLog = { events: 0, lists: 0, qr: 0, none: 0 };
{
  rmSync("site/t", { recursive: true, force: true });
  mkdirSync("site/t", { recursive: true });
  const shown = new Map(decks.map((d) => [d.id, d]));
  const nolistOf = new Map(nolist.map((x) => [x.id, x]));
  const votesOf = new Map([...input.decks.map((d) => [d.id, d.votes]),
    ...Object.entries(input.samples || {}).map(([k, v]) => [k, v.votes])]);
  // Pick the list of a decklist page that matches the deck name (pages of single-deck events have 1 list).
  const pickList = (name, lists) => lists.map((x) => ({ l: toList(x.cards), energy: x.energy }))
    .filter((x) => x.l.reduce((a, c) => a + c.count, 0) === 20)
    .map((x) => ({ ...x, score: attackers(name, x.l).length })).sort((a, b) => b.score - a.score)[0] || null;
  const info = new Map(); // deckId -> { name, art, energy }
  async function deckInfo(arch) {
    if (info.has(arch)) return info.get(arch);
    const name = deckName(arch);
    let r = { name, art: [], energy: [] };
    if (shown.has(arch)) r = { name, art: shown.get(arch).art, energy: shown.get(arch).energy };
    else if (nolistOf.has(arch)) r = { name, art: nolistOf.get(arch).art, energy: nolistOf.get(arch).energy };
    else {
      const pick = pickList(name, input.samples?.[arch]?.lists || []);
      if (pick) {
        const v = await variation(name, pick.l, [], arch, pick.energy, energyVote(name, votesOf.get(arch)));
        r = { name, art: v.art, energy: v.energy };
      } else problems.push(`events: no list for deck ${arch}`);
    }
    r.art.forEach((a) => images.add(a));
    info.set(arch, r);
    return r;
  }
  const out = [];
  for (const ev of input.events || []) {
    const lists = [];
    for (const e of ev.entries) {
      const name = e.deck ? deckName(e.deck) : "";
      const pick = pickList(name, e.lists);
      if (!pick) { problems.push(`events: no valid list for ${ev.tid}/${e.pid}`); continue; }
      const v = await variation(name, pick.l, problems, `${ev.tid}/${e.pid}`, pick.energy,
        e.deck ? energyVote(name, votesOf.get(e.deck)) : null);
      if (e.deck) await deckInfo(e.deck);
      v.cards.forEach((c) => images.add(c.id));
      lists.push({ pl: e.pl, place: e.place, deck: e.deck, sc: e.sc, p: e.p, pid: e.pid, energy: v.energy,
        ...(v.eg ? { eg: v.eg } : {}), cards: v.cards, q: v.q });
      eventLog[v.q ? "qr" : "none"]++;
    }
    writeFileSync(`site/t/${ev.tid}.json`, JSON.stringify({ tid: ev.tid, lists }));
    for (const [arch] of ev.top) await deckInfo(arch);
    let win = null;
    if (ev.win?.deck) {
      const w1 = lists.find((x) => x.pl === 1);
      const d = await deckInfo(ev.win.deck);
      win = { deck: ev.win.deck, name: d.name, art: w1 && w1.deck === ev.win.deck ? attackersArt(d.name, w1.cards) || d.art : d.art,
        energy: w1 ? w1.energy : d.energy, sc: ev.win.sc };
    }
    out.push({ tid: ev.tid, name: ev.name, dt: ev.dt, ts: ev.ts, at: ev.at, players: ev.players, url: ev.url, nl: lists.length, win, top: ev.top });
    eventLog.events++; eventLog.lists += lists.length;
  }
  const deckMap = Object.fromEntries([...info].sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync("site/events.json", JSON.stringify({ updatedAt: new Date().toISOString(), window: input.window,
    ...(input.changedAt ? { changedAt: input.changedAt } : {}), events: out, decks: deckMap }));
}
// Art (1-2 card ids of the named Pokémon) of an event list, from its cards ({id, n, c}).
function attackersArt(name, cards) {
  const list = cards.map((c) => {
    const [set, num] = c.id.split("-");
    const s = /^p[a-z]$/.test(set) ? `P-${set[1].toUpperCase()}` : set[0].toUpperCase() + set.slice(1);
    return { count: c.c, set: s, num: +num, name: c.n };
  });
  const at = attackers(name, list).map((a) => pdId(a.set, a.num));
  return at.length ? at : null;
}

// Booster packs of the cards on the site (PocketDecks expansions.json) -> site/packs.json + images.json "packs".
// A card from "Shared(<set>)" is in every pack of its set. Single-pack sets: the card's pack is the set name.
// Promo "packs" without an image (shop, missions, ...) use the promo set logo (promo-a, promo-b) when it exists.
const PACK_IMG = "https://raw.githubusercontent.com/PocketDecks/pokemon-tcg-pocket-cards/refs/heads/main/images/webp/packs";
const PROMO_LOGO = { pa: "promo-a", pb: "promo-b" };
const EXP = new Map(require("pokemon-tcg-pocket-cards/data/v5/expansions.min.json").map((e) => [e.id, e]));
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
const packsOut = { sets: {}, packs: {}, cards: {} }, packImg = new Map();
for (const id of [...images].sort()) {
  const c = PD.get(id), e = c && EXP.get(c.set_code);
  if (!e) { problems.push(`packs: no set data for ${id}`); continue; }
  const P = e.packs || [];
  let ids;
  if (/^Shared\(/.test(c.pack)) ids = P.map((p) => p.id);
  else {
    const hit = P.find((p) => norm(p.name) === norm(c.pack));
    ids = hit ? [hit.id] : P.length === 1 ? [P[0].id] : [`${e.id}-${norm(c.pack)}`];
  }
  packsOut.cards[id] = ids;
  packsOut.sets[e.id] ??= { name: e.name, release: e.release_date };
  for (const pid of ids) {
    if (packsOut.packs[pid]) continue;
    const p = P.find((x) => x.id === pid);
    // Image: the data link; else the file named like the pack id (promo volumes); else the promo set logo.
    const url = p?.image || (/^p[a-z]-promov\d+$/.test(pid) && pid !== "pa-promov14" ? `${PACK_IMG}/${pid}.webp` : null);
    const file = url ? pid : PROMO_LOGO[e.id] || null;
    if (file) packImg.set(file, url || `${PACK_IMG}/${file}.webp`);
    const name = p?.name === "Booster" || !p ? (P.length === 1 && p ? e.name : c.pack) : p.name;
    packsOut.packs[pid] = { set: e.id, name, img: file };
  }
}
writeFileSync("site/packs.json", JSON.stringify(packsOut));
// R16c (Nov 13, 2026): keep the images of every card in every stored decklist (input.allCards), not only today's
// cards, so old share links still show their cards. Rebuilt from the data, so a lost image cache only costs time.
const keepImg = new Set(images);
for (const [set, num] of input.allCards || []) { const id = pdId(set, num); if (PD.has(id)) keepImg.add(id); }

// R16a (Nov 13, 2026): site/cards.json = card id <-> in-game deck number, for the page's share links.
// One row per print with a number; the "display print" of each number carries the name: the print the site's
// lists use (it has a c/ image), else the lowest rarity, then the oldest release.
{
  const RANK = { "◊": 1, "◊◊": 2, "◊◊◊": 3, "◊◊◊◊": 4 }, rows = [], base = new Map();
  for (const c of PD.values()) {
    const [s, n] = c.id.split("-");
    const set = /^p[a-z]$/.test(s) ? `P-${s[1].toUpperCase()}` : s[0].toUpperCase() + s.slice(1);
    const nr = getCardDeckBuilderNr(findCard(set, +n));
    if (nr == null) continue;
    rows.push([nr, c.id, c.name]);
    const rk = [keepImg.has(c.id) ? 0 : 1, RANK[c.rarity] ?? 9, c.release_date || "9999", c.id];
    const b = base.get(nr);
    if (!b || rk.join("|") < b.rk.join("|")) base.set(nr, { id: c.id, rk });
  }
  rows.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]));
  writeFileSync("site/cards.json", JSON.stringify({ v: 1,
    c: rows.map(([nr, id, n]) => (base.get(nr).id === id ? [nr, id, n] : [nr, id])) }));
  console.log(`cards.json: ${rows.length} prints, ${base.size} game numbers, ` +
    `${[...base.values()].filter((b) => keepImg.has(b.id)).length} display prints with an image; images kept: ${keepImg.size}`);
}
writeFileSync("images.json", JSON.stringify({
  cards: [...keepImg].map((id) => ({ id, url: PD.get(id)?.image })),
  art: [...new Set(decks.flatMap((d) => d.art))],
  packs: [...packImg].map(([id, url]) => ({ id, url })),
}));
const nvars = decks.reduce((a, d) => a + d.nv, 0);
{ // R14 summary: rank changes against 24 h ago
  const all = [...decks, ...nolist], up = all.filter((d) => d.rk0 && d.rk0 > d.rank).length;
  const down = all.filter((d) => d.rk0 && d.rk0 < d.rank).length, same = all.filter((d) => d.rk0 === d.rank).length;
  console.log(`rank 24 h ago (rk0, ${input.rk0At}): ${up} up, ${down} down, ${same} same, ` +
    `${all.filter((d) => !d.rk0).length} not in the list then; new (nw): ` +
    (all.filter((d) => d.nw).map((d) => `${d.rank} ${d.name}`).join("; ") || "none"));
}
if (waiting) console.log(`${waiting} decks have no list in the window (nolist rows, R10): ` +
  nolist.map((x) => `${x.rank} ${x.name} [${x.art.join(",")}] ${x.energy.join("+")} (${x.from})`).join("; "));
console.log(`more.json: ${moreIds.size} decks (of ${input.decks.filter((d) => d.more).length} with 0.2-0.5 % share), ` +
  `${decks.filter((d) => moreIds.has(d.id)).reduce((a, d) => a + d.nv, 0)} lists`);
{
  const all = decks.flatMap((d) => [d, ...(existsSync(`site/v/${d.id}.json`) ? JSON.parse(readFileSync(`site/v/${d.id}.json`, "utf8")).vars : [])]);
  const k = (e) => all.filter((v) => (v.eg || 0) === e).length;
  console.log(`energy of ${all.length} lists: ${k(0)} shown by Limitless, ${k(2)} from other lists of the deck, ${k(1)} from attack costs`);
}
console.log(`decks: ${decks.length}, lists: ${nvars}, unique cards: ${images.size}; below the cut (bc): ` +
  (decks.filter((d) => d.bc).map((d) => `${d.rank} ${d.name} ${d.pl} ${d.sc}`).join("; ") || "none"));
console.log(`events: ${eventLog.events} events, ${eventLog.lists} lists (${eventLog.qr} with QR, ${eventLog.none} without)`);
console.log(`alt versions: ${altLog.qr} with QR, ${altLog.none} without QR` +
  (altLog.energy.length ? `; energy notes:\n  ${altLog.energy.join("\n  ")}` : "; energy notes: none"));
if (dropped.length) console.log("decks with more groups than kept:\n  " + dropped.join("\n  "));
console.log("problems:", problems.join("; ") || "none");
for (const d of decks) console.log(d.rank, d.name, `(${d.nv} lists)`, "->", d.energy.join("+"));
