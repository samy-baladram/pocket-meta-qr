#!/bin/bash
# The /preview/ pages (Nov 23, 2026). site.yml runs it after page.mjs; a failure here is only a warning there.
#   bash preview/build.sh <public dir>
# 1. preview/i18n_patch.py: the live page (site/index.html) + card images, names and the language picker
# 2. i18n/extract.mjs: the English texts of that page -> <public>/i18n/en.json (the catalog to translate)
# 3. i18n/build.mjs per text language (de, ja): the texts of i18n/<lang>.json put in; report -> <public>/i18n/report.<lang>.json
# 4. pipeline/page.mjs per page (as the live page, no routes) + preview/head.html (+ the page language) first in <head>
# Out: <public>/preview/, <public>/preview/de/, <public>/preview/ja/, <public>/i18n/ (names, images, catalog, reports)
set -euo pipefail
PUB=${1:-public}
T=$(mktemp -d)
mkdir -p "$PUB/preview" "$PUB/i18n"
python preview/i18n_patch.py site/index.html "$T/src.html"
node i18n/extract.mjs "$T/src.html" "$PUB/i18n/en.json"
head_for() { # <lang> [root] -> the head insert for that page (root: the English page's folder, default /preview/)
  local h; h=$(tr '\n' ' ' < preview/head.html)
  if [ "$1" != en ]; then h="<script>var PMQ_LANG = \"$1\", PMQ_ROOT = \"${2:-/preview/}\";</script>$h"; fi
  printf '%s' "$h"
}
page() { # <lang> <source html> <out dir> [root]
  rm -rf "$T/p" && mkdir -p "$T/p" "$3"
  # --prev: keep the previous build's app.<hash> files of this page (a page cached for 10 min still finds its code)
  node pipeline/page.mjs "$2" "$T/p/index.html" --no-routes --prev "cache/app-$(printf '%s' "${3#"$PUB"/}" | tr / -)" > /dev/null
  cp "$T/p"/app.* "$PUB/"   # <base href="/">: the page loads them from the site root
  # + the head insert; <html lang>, canonical and og:url of the page's own address (out dir under $PUB)
  HEAD="$(head_for "$1" "${4:-}")" L="$1" U="https://pocketmetaqr.com/${3#"$PUB"/}/" node -e '
const f = require("fs"), e = process.env; let h = f.readFileSync(process.argv[1], "utf8").replace("<head>", "<head>" + e.HEAD);
if (e.L !== "en") h = h.replace(/<html lang="en"/, `<html lang="${e.L}"`)
  .replace(/(<link rel="canonical" href=")https:\/\/pocketmetaqr\.com\/(")/, `$1${e.U}$2`)
  .replace(/(<meta property="og:url" content=")https:\/\/pocketmetaqr\.com\/(")/, `$1${e.U}$2`);
f.writeFileSync(process.argv[2], h);' "$T/p/index.html" "$3/index.html"
}
page en "$T/src.html" "$PUB/preview"
SUM=""
for L in de ja; do
  line=$(node i18n/build.mjs "$T/src.html" "$L" "$T/$L.html" --report "$PUB/i18n/report.$L.json")
  echo "$line"; SUM="$SUM- $line"$'\n'
  page "$L" "$T/$L.html" "$PUB/preview/$L"
  # Phase 1 (Nov 23): the live Japanese page /ja/ (one page, sections as tabs; noindex for now). I18N_LIVE (site.yml)
  # lists the live languages; empty = none.
  if [[ " ${I18N_LIVE:-} " == *" $L "* ]]; then page "$L" "$T/$L.html" "$PUB/$L" "/"; echo "live: /$L/"; SUM="$SUM- live: /$L/"$'\n'; fi
done
# names.<lang>.json + preview/i18n/names.fix.json on top (a fix wins)
node -e '
const f = require("fs"), fix = JSON.parse(f.readFileSync("preview/i18n/names.fix.json", "utf8"));
for (const p of f.readdirSync("preview/i18n").filter((x) => /^names\.[a-z]{2}\.json$/.test(x))) {
  const d = JSON.parse(f.readFileSync("preview/i18n/" + p, "utf8")), x = fix[d.lang] || {};
  Object.assign(d.n, x.n || {}); Object.assign(d.s, x.s || {}); f.writeFileSync(process.argv[1] + "/" + p, JSON.stringify(d)); }' "$PUB/i18n"
if [ -d site/i18n ]; then cp -r site/i18n/. "$PUB/i18n/"; fi
# Names check (Nov 23): card names of the site with no name in names.<lang>.json (they show in English)
NAMES=$(PUB="$PUB" node -e '
const f = require("fs"), c = JSON.parse(f.readFileSync(process.argv[1], "utf8")).c, all = [...new Set(c.map((x) => x[2]).filter(Boolean))];
for (const l of process.argv.slice(2)) { const n = JSON.parse(f.readFileSync(`${process.env.PUB}/i18n/names.${l}.json`, "utf8")).n, m = all.filter((x) => !n[x]);
  console.log(`- names ${l}: ${all.length - m.length} of ${all.length} card names${m.length ? `; no name (English shown): ${m.slice(0, 20).join(", ")}` : ""}`); }' "$PUB/cards.json" de ja 2>/dev/null || true)
echo "$NAMES"; SUM="$SUM$NAMES"$'\n'
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then printf '### Preview texts\n%s\nMissing texts: /i18n/report.<lang>.json on the site.\n' "$SUM" >> "$GITHUB_STEP_SUMMARY"; fi
rm -rf "$T"
