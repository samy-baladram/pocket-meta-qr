// Safety check for the extractor: every text -> "⟦text⟧" (placeholders kept), so a test page shows what is translated.
// node i18n/pseudo.mjs <page.html> <out.html>
// Then open the page: page errors = a code string was taken as text (add a rule or a skip in config.json); English
// outside ⟦⟧ = a text the extractor misses (names from the data stay English: they come from the name files).
import { readFileSync, writeFileSync } from "node:fs";
import { translatePage } from "./lib.mjs";
const [src, out] = process.argv.slice(2);
const cfg = JSON.parse(readFileSync(new URL("./config.json", import.meta.url)));
const { html, changed } = translatePage(readFileSync(src, "utf8"), cfg, (en) => "⟦" + en + "⟧");
writeFileSync(out, html);
console.log(`pseudo: ${changed} places`);
