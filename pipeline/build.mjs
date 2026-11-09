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
import { deckCodeToSVG } from "ptcgp-deckcode/qr";
import { findCard, attackers } from "./common.mjs";
const require = createRequire(import.meta.url);

const MAX_VARIATIONS = 10;  // lists kept per deck (the page shows them as a carousel with 1 dot per list)
const NEAR = 1;             // lists that differ by this many cards or fewer count as the same list
const PD = new Map(require("pokemon-tcg-pocket-cards/data/v5/cards.min.json").map((c) => [c.id, c]));
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

  const qr = await makeQR(list, energy, problems, id);
  return { energy, ...(guessed ? { eg: guessed } : {}), qr, art: at.map((a) => pdId(a.set, a.num)), cards: list.map((c) => ({ id: pdId(c.set, c.num), n: c.name, c: c.count })) };
}

// In-game deck code of a 20-card list + energy, as an SVG QR (black modules, no background), or null.
// The code is decoded again and must give the same cards. Used for the lists and the alt versions (R5).
async function makeQR(list, energy, problems, id) {
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
  return (await deckCodeToSVG(code, { margin: 0, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } }))
    .replace(/<path fill="#ffffff"[^>]*\/>/, "");
}

// R2 (Nov 9, 2026): the distinct 1-card changes inside a group, compared with its representative (the shown list).
//   in  = cards the change has and the shown list does not; out = cards of the shown list that the change does not have.
//   u   = finishes with that change; pl = the best place among them (members come best place first).
// Sorted by u (high first), then best place. Exact copies are not listed, so nu = exact copies + sum of u.
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
    if (e) e.u++;
    else by.set(key, { in: ins, out: outs, u: 1, pl: x.row.pl, order, row: x.row });
  });
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
    a.qr = null;
  } else {
    for (const c of a.in) {
      const need = colored({ set: list.find((x) => pdId(x.set, x.num) === c.id).set, num: +c.id.split("-")[1] })
        .map((l) => LETTER[l]).filter((e) => !v.energy.includes(e));
      if (need.length) altLog.energy.push(`${name}: +${c.n} needs ${need.join("+")}, list energy ${v.energy.join("+")}`);
    }
    a.qr = await makeQR(list, v.energy, problems, `${id} (alt)`);
  }
  altLog[a.qr ? "qr" : "none"]++;
  a.sc = a.row.sc; a.ev = a.row.ev; a.dt = a.row.dt;
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

const decks = [], problems = [], images = new Set(), dropped = [], searchDecks = [];
let waiting = 0;
rmSync("site/v", { recursive: true, force: true });
mkdirSync("site/v", { recursive: true });

for (const [rank, d] of input.decks.entries()) {
  const { id, count, share, w, l, t, win } = d;
  const name = deckName(id);
  // R1 (Nov 9, 2026). Step 1: group ALL finishes. Rows come best finish first; a list joins the first group whose
  // representative (the group's best-placed finish) is NEAR card swaps or less away, else it starts a new group.
  // Step 2 (below): keep the MAX_VARIATIONS groups with the most finishes ("top players"), then by best place.
  const groups = [];
  let of = 0;
  for (const row of d.rows) {
    const cands = row.lists.map((x) => ({ l: toList(x.cards), energy: x.energy }))
      .filter((x) => x.l.reduce((a, c) => a + c.count, 0) === 20);
    if (!cands.length) { problems.push(`${id}: no valid list for ${row.key}`); continue; }
    // Several lists on 1 page: take the list whose Pokémon best match the deck name.
    const pick = cands.map((x) => ({ ...x, score: attackers(name, x.l).length })).sort((a, b) => b.score - a.score)[0];
    if (pick.score === 0) { problems.push(`${id}: no list on ${row.key} matches the deck name "${name}"`); continue; }
    of++;
    const m = counts(pick.l), member = { m, list: pick.l, row };
    const g = groups.find((c) => swaps(c.m, m) <= NEAR);
    if (g) g.members.push(member);
    else groups.push({ list: pick.l, energy: pick.energy, m, row, members: [member] });
  }
  if (!groups.length) { waiting++; problems.push(`${id}: no lists yet`); continue; }
  printGuard(id, groups.flatMap((g) => g.members.map((x) => x.list)), problems);
  // Step 2: most top players first; on a tie the group with the better best place (= the earlier group).
  const chosen = groups.map((g, i) => ({ ...g, used: g.members.length, i }))
    .sort((a, b) => b.used - a.used || a.i - b.i).slice(0, MAX_VARIATIONS);
  if (groups.length > MAX_VARIATIONS) dropped.push(`${id}: ${groups.length} groups, kept ${MAX_VARIATIONS} ` +
    `(smallest kept: ${chosen.at(-1).used} top players; largest dropped: ${Math.max(...groups.map((g) => g.members.length)
      .filter((_, i) => !chosen.some((c) => c.i === i)))})`);

  const vote = energyVote(name, d.votes);
  const vars = [];
  for (const c of chosen) {
    const v = await variation(name, c.list, problems, id, c.energy, vote);
    v.ev = c.row.ev; v.pl = c.row.pl; v.sc = c.row.sc; v.dt = c.row.dt;
    v.nu = c.used; // finishes ("top players") in the group: exact copies + 1-card changes
    v.of = of;     // all finishes with a readable list (also those of groups that are not kept)
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
  searchDecks.push({ id, finishes: groups.flatMap((g) => g.members.map((x) => x.m)),
    shown: vars.map((v) => new Map(v.cards.map((c) => [c.id, c.c]))),
    altIn: vars.flatMap((v) => (v.alt || []).flatMap((a) => a.in.map((c) => c.id))) });
  const { art, ...best } = vars[0];
  decks.push({ id, rank: rank + 1, name, count, share, w, l, t, win, art, nv: vars.length, ...best });
}

// Time span and size of the data window (all tournaments of the window, not only the shown lists).
const data = { updatedAt: new Date().toISOString(), set: input.set, setName: input.setName || "", format: input.format,
  window: input.window, span: input.span, summary: input.summary, decks };
writeFileSync("site/data.json", JSON.stringify(data));

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
writeFileSync("images.json", JSON.stringify({
  cards: [...images].map((id) => ({ id, url: PD.get(id)?.image })),
  art: [...new Set(decks.flatMap((d) => d.art))],
  packs: [...packImg].map(([id, url]) => ({ id, url })),
}));
const nvars = decks.reduce((a, d) => a + d.nv, 0);
if (waiting) console.log(`${waiting} decks have no decklist yet (later scrape runs fetch them)`);
{
  const all = decks.flatMap((d) => [d, ...(existsSync(`site/v/${d.id}.json`) ? JSON.parse(readFileSync(`site/v/${d.id}.json`, "utf8")).vars : [])]);
  const k = (e) => all.filter((v) => (v.eg || 0) === e).length;
  console.log(`energy of ${all.length} lists: ${k(0)} shown by Limitless, ${k(2)} from other lists of the deck, ${k(1)} from attack costs`);
}
console.log(`decks: ${decks.length}, lists: ${nvars}, unique cards: ${images.size}`);
console.log(`alt versions: ${altLog.qr} with QR, ${altLog.none} without QR` +
  (altLog.energy.length ? `; energy notes:\n  ${altLog.energy.join("\n  ")}` : "; energy notes: none"));
if (dropped.length) console.log("decks with more groups than kept:\n  " + dropped.join("\n  "));
console.log("problems:", problems.join("; ") || "none");
for (const d of decks) console.log(d.rank, d.name, `(${d.nv} lists)`, "->", d.energy.join("+"));
