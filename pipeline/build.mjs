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

  let qr = null;
  const nrs = [];
  for (const c of list) {
    const nr = getCardDeckBuilderNr(findCard(c.set, c.num));
    if (nr == null) { problems.push(`${id}: no game id for ${c.set}-${c.num}`); nrs.length = 0; break; }
    for (let k = 0; k < c.count; k++) nrs.push(nr);
  }
  if (nrs.length === 20 && energy.length) {
    const code = createDeckCode(nrs, energy);
    const back = parseDeckCode(code);
    if (JSON.stringify([...back.deckBuilderNrs].sort()) !== JSON.stringify([...nrs].sort())) problems.push(`${id}: QR decode mismatch`);
    else qr = (await deckCodeToSVG(code, { margin: 0, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } }))
      .replace(/<path fill="#ffffff"[^>]*\/>/, "");
  } else if (!energy.length) problems.push(`${id}: no energy`);
  return { energy, ...(guessed ? { eg: guessed } : {}), qr, art: at.map((a) => pdId(a.set, a.num)), cards: list.map((c) => ({ id: pdId(c.set, c.num), n: c.name, c: c.count })) };
}

const decks = [], problems = [], images = new Set();
let waiting = 0;
rmSync("site/v", { recursive: true, force: true });
mkdirSync("site/v", { recursive: true });

for (const [rank, d] of input.decks.entries()) {
  const { id, count, share, w, l, t, win } = d;
  const name = deckName(id);
  // Rows come best finish first. Each list joins the first kept list it is near to;
  // a new list is kept only while there is room. "used" = finishes with that list (or a near copy).
  const chosen = [];
  let of = 0;
  for (const row of d.rows) {
    const cands = row.lists.map((x) => ({ l: toList(x.cards), energy: x.energy }))
      .filter((x) => x.l.reduce((a, c) => a + c.count, 0) === 20);
    if (!cands.length) { problems.push(`${id}: no valid list for ${row.key}`); continue; }
    // Several lists on 1 page: take the list whose Pokémon best match the deck name.
    const pick = cands.map((x) => ({ ...x, score: attackers(name, x.l).length })).sort((a, b) => b.score - a.score)[0];
    if (pick.score === 0) { problems.push(`${id}: no list on ${row.key} matches the deck name "${name}"`); continue; }
    of++;
    const m = counts(pick.l), near = chosen.find((c) => swaps(c.m, m) <= NEAR);
    if (near) { near.used++; continue; }
    if (chosen.length < MAX_VARIATIONS) chosen.push({ list: pick.l, energy: pick.energy, m, row, used: 1 });
  }
  if (!chosen.length) { waiting++; problems.push(`${id}: no lists yet`); continue; }

  const vote = energyVote(name, d.votes);
  const vars = [];
  for (const c of chosen) {
    const v = await variation(name, c.list, problems, id, c.energy, vote);
    v.ev = c.row.ev; v.pl = c.row.pl; v.sc = c.row.sc; v.dt = c.row.dt;
    v.nu = c.used; // finishes in the top rows that used this list (or one card away from it)
    v.of = of;     // finishes in the top rows with a readable list
    vars.push(v);
  }
  vars.forEach((v) => v.cards.forEach((c) => images.add(c.id)));
  if (vars.length > 1) writeFileSync(`site/v/${id}.json`, JSON.stringify({ id, vars: vars.slice(1).map(({ art, ...v }) => v) }));
  const { art, ...best } = vars[0];
  decks.push({ id, rank: rank + 1, name, count, share, w, l, t, win, art, nv: vars.length, ...best });
}

// Time span and size of the data window (all tournaments of the window, not only the shown lists).
const data = { updatedAt: new Date().toISOString(), set: input.set, setName: input.setName || "", format: input.format,
  window: input.window, span: input.span, summary: input.summary, decks };
writeFileSync("site/data.json", JSON.stringify(data));
writeFileSync("images.json", JSON.stringify({
  cards: [...images].map((id) => ({ id, url: PD.get(id)?.image })),
  art: [...new Set(decks.flatMap((d) => d.art))],
}));
const nvars = decks.reduce((a, d) => a + d.nv, 0);
if (waiting) console.log(`${waiting} decks have no decklist yet (later scrape runs fetch them)`);
{
  const all = decks.flatMap((d) => [d, ...(existsSync(`site/v/${d.id}.json`) ? JSON.parse(readFileSync(`site/v/${d.id}.json`, "utf8")).vars : [])]);
  const k = (e) => all.filter((v) => (v.eg || 0) === e).length;
  console.log(`energy of ${all.length} lists: ${k(0)} shown by Limitless, ${k(2)} from other lists of the deck, ${k(1)} from attack costs`);
}
console.log(`decks: ${decks.length}, lists: ${nvars}, unique cards: ${images.size}`);
console.log("problems:", problems.join("; ") || "none");
for (const d of decks) console.log(d.rank, d.name, `(${d.nv} lists)`, "->", d.energy.join("+"));
