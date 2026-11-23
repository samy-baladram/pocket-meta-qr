// node i18n/build.mjs <page.html> <lang> <out.html> [--report <file.json>]
// Entries: {id: [English, text]} or {id: [English, text, {"<code before the text>": text}]} (one English text with two
// meanings, e.g. "Share" = the share button and the meta share: the override wins where its code is found).
// The page with the texts of i18n/<lang>.json ({id: [English, text]}). A text with no translation stays English; a
// translation that loses or adds a {n} / {tn} is not used (reported). Prints the coverage.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { translatePage, catalog, runId } from "./lib.mjs";
const args = process.argv.slice(2), [src, lang, out] = args, ri = args.indexOf("--report");
const cfg = JSON.parse(readFileSync(new URL("./config.json", import.meta.url)));
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
tr.cjk = ["ja", "zh", "ko"].includes(lang);
tr.bad = (en, t) => bad.push({ id: runId(en), en, t });
const { html, changed } = translatePage(page, cfg, tr);
writeFileSync(out, html);
const cat = catalog(page0, cfg), missing = cat.filter((u) => !(T[u.id] && T[u.id][1]));
const unused = Object.keys(T).filter((id) => !cat.some((u) => u.id === id));
console.log(`i18n ${lang}: ${cat.length - missing.length} of ${cat.length} texts translated, ${changed} places changed, ` +
  `${missing.length} missing, ${bad.length} not used (placeholders), ${unused.length} old (English changed)` +
  (nCode || codeMiss.length ? `, ${nCode} code changes${codeMiss.length ? `, ${codeMiss.length} code changes not found` : ""}` : ""));
if (codeMiss.length) console.error(`i18n ${lang}: code changes not found: ${codeMiss.join(" | ")}`);
if (ri > 0) writeFileSync(args[ri + 1], JSON.stringify({ lang, missing, bad, unused, codeMiss }, null, 1));
