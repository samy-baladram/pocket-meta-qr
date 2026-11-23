// Card and set names in other languages for the card-language preview (Nov 23, 2026).
// Wrong or missing names: preview/i18n/names.fix.json (preview/build.sh puts it on top of these files)
// Source: the TCGdex card database fork github.com/wsgtcyx/cards-database (names from the game's own text, all 9 languages;
// checked: German agrees with official TCGdex in 1,234 of 1,253 cards, the rest are fork fixes such as "-ex").
// Use: git clone --depth 1 --filter=blob:none --sparse https://github.com/wsgtcyx/cards-database <dir>
//      git -C <dir> sparse-checkout set "data/Pokémon TCG Pocket"
//      node pipeline/i18n_names.mjs <dir> de ja    -> preview/i18n/names.de.json, names.ja.json
// File: {"v":1,"lang","src","n":{<English card name>: <name>},"s":{<set code>: <set name>}}
// Pack names (a Pokémon name, e.g. "Mega Blaziken") are made in the page from the card name ("Mega Blaziken ex", minus "ex").
// Keyed by the English name (deck names and pack names on the site are English card names). Run again at a set release.
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
const [dir, ...langs] = process.argv.slice(2);
const root = `${dir}/data/Pokémon TCG Pocket`;
const obj = (t, key) => { const m = t.match(new RegExp(`\\n\\s*${key}:\\s*\\{([\\s\\S]*?)\\}`)); if (!m) return null; const o = {};
  for (const x of m[1].matchAll(/["']?([a-z-]+)["']?\s*:\s*"((?:[^"\\]|\\.)*)"/g)) o[x[1]] = JSON.parse(`"${x[2]}"`); return o; };
const cards = [], sets = [];
for (const e of readdirSync(root)) {
  const p = `${root}/${e}`;
  if (statSync(p).isDirectory()) { for (const f of readdirSync(p)) { const n = obj(readFileSync(`${p}/${f}`, "utf8"), "name"); if (n && n.en) cards.push(n); } }
  else if (e.endsWith(".ts")) { const t = readFileSync(p, "utf8"), id = (t.match(/\n\s*id:\s*"([^"]+)"/) || [])[1], n = obj(t, "name");
    if (id && n) sets.push([id, n]); }
}
mkdirSync("preview/i18n", { recursive: true });
const SRC = { pt: "pt-br" }; // the site's code -> the database key (Brazilian Portuguese)
for (const l of langs) {
  const k0 = SRC[l] || l, votes = {};   // English name -> {localized: count}; the most common one wins (alt arts share a name)
  for (const c of cards) if (c[k0]) { const v = (votes[c.en] ||= {}); v[c[k0]] = (v[c[k0]] || 0) + 1; }
  const n = {}; let multi = 0;
  for (const [en, v] of Object.entries(votes).sort()) { const k = Object.entries(v).sort((a, b) => b[1] - a[1]); n[en] = k[0][0]; if (k.length > 1) multi++; }
  const s = {}; for (const [id, nm] of sets.sort()) if (nm[k0]) s[id] = nm[k0];
  writeFileSync(`preview/i18n/names.${l}.json`, JSON.stringify({ v: 1, lang: l, src: "wsgtcyx/cards-database", n, s }));
  console.log(`${l}: ${Object.keys(n).length} names (${multi} with 2+ forms, the most common used), ${Object.keys(s).length} sets`);
}
