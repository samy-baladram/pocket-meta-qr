// node i18n/build.mjs <page.html> <lang> <out.html> [--report <file.json>]
// Entries: {id: [English, text]} or {id: [English, text, {"<code before the text>": text}]} (one English text with two
// meanings, e.g. "Share" = the share button and the meta share: the override wins where its code is found).
// The page with the texts of i18n/<lang>.json ({id: [English, text]}). A text with no translation stays English; a
// translation that loses or adds a {n} / {tn} is not used (reported). Prints the coverage.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { translatePage, catalog, runId } from "./lib.mjs";
const args = process.argv.slice(2), [src, lang, out] = args, ri = args.indexOf("--report");
const cfg = JSON.parse(readFileSync(new URL("./config.json", import.meta.url)));
// enOnly: {lang: [element ids]}: static HTML sections that stay English on that language's page (What's new = nwl)
cfg.skipIds = (cfg.enOnly || {})[lang] || [];
const f = new URL(`./${lang}.json`, import.meta.url), T = existsSync(f) ? JSON.parse(readFileSync(f)) : {};
const page0 = readFileSync(src, "utf8"), bad = [];
// i18n/<lang>.code.json: code changes for that language (word order, ordinals), applied before the texts
const cf = new URL(`./${lang}.code.json`, import.meta.url), codeMiss = [];
let page = page0, nCode = 0;
if (existsSync(cf)) for (const p of JSON.parse(readFileSync(cf)).patches) {
  const n = page.split(p.find).length - 1;
  if (!n) { codeMiss.push(p.note || p.find); continue; }
  page = p.all ? page.split(p.find).join(p.replace) : page.replace(p.find, () => p.replace); nCode += p.all ? n : 1;
}
// an entry: [English, text] or [English, text, {"<code just before the text>": text for that place}]
const tr = (en, ctx = "") => { const x = T[runId(en)]; if (!x) return null;
  if (x[2]) for (const [k, v] of Object.entries(x[2])) if (ctx.includes(k)) return v;
  return x[1] || null; };
tr.cjk = ["ja", "zh"].includes(lang); // Nov 24: not ko (Korean puts spaces between words)
tr.bad = (en, t) => bad.push({ id: runId(en), en, t });
const { html, changed } = translatePage(page, cfg, tr);
writeFileSync(out, html);
const cat = catalog(page0, cfg), missing = cat.filter((u) => !(T[u.id] && T[u.id][1]));
const unused = Object.keys(T).filter((id) => !cat.some((u) => u.id === id));
console.log(`i18n ${lang}: ${cat.length - missing.length} of ${cat.length} texts translated, ${changed} places changed, ` +
  `${missing.length} missing, ${bad.length} not used (placeholders), ${unused.length} old (English changed)` +
  (nCode || codeMiss.length ? `, ${nCode} code changes${codeMiss.length ? `, ${codeMiss.length} code changes not found` : ""}` : ""));
if (codeMiss.length) console.error(`i18n ${lang}: code changes not found: ${codeMiss.join(" | ")}`);
// groups (i18n/groups.json, made by i18n/groups.py): which part of the site each text belongs to
const gf = new URL("./groups.json", import.meta.url), G = existsSync(gf) ? JSON.parse(readFileSync(gf)).ids : {};
const grp = (id) => G[id] || "new";
const byGroup = (ids) => Object.entries(ids.reduce((a, id) => ((a[grp(id)] = (a[grp(id)] || 0) + 1), a), {}))
  .map(([g, n]) => `${g} ${n}`).join(", ");
if (bad.length) console.error(`i18n ${lang}: not used (placeholders) by group: ${byGroup(bad.map((b) => b.id))}`);
if (unused.length) console.error(`i18n ${lang}: old (English changed) by group: ${byGroup(unused)}`);
const ungrouped = Object.keys(T).filter((id) => !G[id] && cat.some((u) => u.id === id));
if (ungrouped.length) console.error(`i18n ${lang}: ${ungrouped.length} texts have no group yet: run python3 i18n/groups.py <page>`);
for (const u of missing) u.group = grp(u.id);
for (const b of bad) b.group = grp(b.id);
if (ri > 0) writeFileSync(args[ri + 1], JSON.stringify({ lang, missing, bad, unused: unused.map((id) => ({ id, group: grp(id) })), codeMiss }, null, 1));
