// Safety check for the extractor: every text -> "⟦text⟧" (placeholders kept), so a test page shows what is translated.
// node i18n/pseudo.mjs <page.html> <out.html>
// Then open the page: page errors = a code string was taken as text (add a rule or a skip in config.json); English
// outside ⟦⟧ = a text the extractor misses (names from the data stay English: they come from the name files).
import { readFileSync, writeFileSync } from "node:fs";
import { translatePage } from "./lib.mjs";
// --long (Nov 23, layout pass): every word of 4+ letters grows by 60% (like German / Spanish / French words), so a test
// page shows where long words break the layout. Placeholders ({0}, {t0}) and tags stay as they are.
const args = process.argv.slice(2), LONG = args.includes("--long"), [src, out] = args.filter((a) => !a.startsWith("--"));
const grow = (t) => /^\s*[a-z][a-z0-9-]*\s*$/.test(t) ? t : t.split(/(\{[^}]*\}|&[a-z#0-9]+;)/).map((p, i) => (i % 2 ? p : p.replace(/[A-Za-zÀ-ÿ]{4,}/g,
  (w) => w + "ungsvereinbarung".slice(0, Math.ceil(w.length * 0.6))))).join("");
const cfg = JSON.parse(readFileSync(new URL("./config.json", import.meta.url)));
const { html, changed } = translatePage(readFileSync(src, "utf8"), cfg, (en) => (LONG ? grow(en) : "⟦" + en + "⟧"));
writeFileSync(out, html);
console.log(`pseudo: ${changed} places`);
