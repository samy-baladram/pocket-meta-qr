// node i18n/extract.mjs <page.html> [i18n/en.json]
// Writes the English catalog: [{id, en, where}] (where = up to 3 places: kind + code before it). Run it on the page that
// is translated (the preview page after preview/i18n_patch.py). Translations: i18n/<lang>.json = {id: [English, text]}.
import { readFileSync, writeFileSync } from "node:fs";
import { catalog } from "./lib.mjs";
const [src, out = "i18n/en.json"] = process.argv.slice(2);
const cfg = JSON.parse(readFileSync(new URL("./config.json", import.meta.url)));
const list = catalog(readFileSync(src, "utf8"), cfg);
writeFileSync(out, JSON.stringify(list, null, 1) + "\n");
const words = list.reduce((a, u) => a + u.en.replace(/\{t?\d+\}/g, " ").split(/\s+/).filter((w) => /[A-Za-z]/.test(w)).length, 0);
console.log(`i18n: ${list.length} texts, ${words} words -> ${out}`);
