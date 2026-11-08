// Shared helpers for the Limitless Pocket snapshot.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

export const CARDS = require("pokemon-tcg-pocket-database/dist/cards.json");

// Limitless set code -> community DB set code
export const dbSet = (s) => s.replace(/^P-([A-Z])$/, "PROMO-$1");

export function findCard(set, num) {
  return CARDS.find((c) => c.set === dbSet(set) && c.number === Number(num)) || null;
}
export const isPokemon = (c) => !!c && c.image.startsWith("cPK");

// Parse "## deckId" blocks with "count|name|set|num" lines.
export function parseLists(path) {
  const out = {};
  let cur = null;
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("## ")) { cur = line.slice(3).trim(); out[cur] = []; continue; }
    const [c, name, set, num] = line.split("|");
    out[cur].push({ count: Number(c), name, set, num: Number(num) });
  }
  return out;
}

// Decode Limitless deck-builder "i=" param: "3" header, then per card:
// count(1) setLen(1) numLen(1) set num ; "P0A" means "P-A".
export function parseBuilderParam(i) {
  let s = i.replace(/^3/, ""), cards = [];
  while (s.length) {
    const count = +s[0], sl = +s[1], nl = +s[2];
    const set = s.slice(3, 3 + sl).replace(/^P0/, "P-");
    const num = +s.slice(3 + sl, 3 + sl + nl);
    cards.push({ count, set, num });
    s = s.slice(3 + sl + nl);
  }
  return cards;
}

// Main attackers: match deck name left-to-right against Pokémon names in list.
export function attackers(deckName, list) {
  const poke = list.filter((x) => isPokemon(findCard(x.set, x.num)));
  const names = [...new Set(poke.map((x) => x.name))].sort((a, b) => b.length - a.length);
  const found = [];
  let rest = deckName.trim();
  while (rest) {
    const n = names.find((nm) => rest === nm || rest.startsWith(nm + " "));
    if (!n) break;
    found.push(poke.find((x) => x.name === n));
    rest = rest.slice(n.length).trim();
  }
  return found; // [first, second?]
}
