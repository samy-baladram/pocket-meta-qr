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
head_for() { # <lang> [root] [home] [index] -> the head insert for that page (root: the English page's folder, default
  # /preview/; home: the page's own folder when it has section addresses, Phase 2; index: 1 = no noindex tag, Step 5)
  local h; h=$(tr '\n' ' ' < preview/head.html)
  if [ "${4:-}" = 1 ]; then h=${h/'<meta name="robots" content="noindex, nofollow">'/}; fi
  if [ "$1" != en ]; then h="<script>var PMQ_LANG = \"$1\", PMQ_ROOT = \"${2:-/preview/}\"${3:+, PMQ_HOME = \"$3\"};</script>$h"; fi
  printf '%s' "$h"
}
page() { # <lang> <source html> <out dir> [root]
  rm -rf "$T/p" && mkdir -p "$T/p" "$3"
  local rel="${3#"$PUB"/}" home="" mode=--no-routes idx="" alt=()
  # Phase 2 Steps 3 + 5 (Nov 24): a live page (root "/") gets hreflang (page.mjs --alt); a live language in I18N_INDEX
  # (site.yml) also loses the noindex tag. /preview/ pages: neither.
  if [ "${4:-}" = / ]; then alt=(--alt "${I18N_INDEX:-}" --alt-routes "${I18N_ROUTES:-}" --alt-decks "${I18N_DECKS:-}" --alt-packs "${I18N_PACKS:-}")
    if [[ " ${I18N_INDEX:-} " == *" $1 "* ]]; then idx=1; fi; fi
  # Phase 2 Step 1 (Nov 24): a language in I18N_ROUTES (site.yml) gets its section pages too (events/, packs/,
  # limited/, about/ next to its index.html: page.mjs --lang-routes)
  if [ "$1" != en ] && [[ " ${I18N_ROUTES:-} " == *" $1 "* ]]; then home="/$rel/"; mode="--lang-routes --root $rel/"
    # Phase 2 Step 4 (Nov 24): a live language page in I18N_DECKS also gets decks/<id>/ (the English deck record, read
    # only; not the /preview/ copies)
    if [ "${4:-}" = / ] && [[ " ${I18N_DECKS:-} " == *" $1 "* ]]; then mode="$mode --lang-decks --seen data/decks_seen.json"; fi
    # Step 4b: and packs/<id>/ (I18N_PACKS)
    if [ "${4:-}" = / ] && [[ " ${I18N_PACKS:-} " == *" $1 "* ]]; then mode="$mode --lang-packs"; fi; fi
  # --prev: keep the previous build's app.<hash> files of this page (a page cached for 10 min still finds its code)
  # shellcheck disable=SC2086
  node pipeline/page.mjs "$2" "$T/p/index.html" $mode "${alt[@]}" --lang "$1" --data site --prev "cache/app-$(printf '%s' "$rel" | tr / -)" > /dev/null
  cp "$T/p"/app.* "$PUB/"   # <base href="/">: the page loads them from the site root
  # + the head insert; <html lang>, canonical and og:url of the page's own address (out dir under $PUB; the section
  # pages have theirs from page.mjs); with section addresses, the section links (<a href="/events/">) in the folder
  (cd "$T/p" && find . -name index.html) | while read -r f; do
    mkdir -p "$(dirname "$3/$f")"
    HEAD="$(head_for "$1" "${4:-}" "$home" "$idx")" L="$1" U="https://pocketmetaqr.com/$rel/" HOME_="$home" MODE="$mode" node -e '
const f = require("fs"), e = process.env; let h = f.readFileSync(process.argv[1], "utf8").replace("<head>", "<head>" + e.HEAD);
if (e.L !== "en") h = h.replace(/<html lang="en"/, `<html lang="${e.L === "pt" ? "pt-BR" : e.L}"`)
  .replace(/(<link rel="canonical" href=")https:\/\/pocketmetaqr\.com\/(")/, `$1${e.U}$2`)
  .replace(/(<meta property="og:url" content=")https:\/\/pocketmetaqr\.com\/(")/, `$1${e.U}$2`);
if (e.HOME_) h = h.replace(/(<a\b[^>]*?\shref=")\/((?:events|packs|limited|about)\/)?(")/g, `$1${e.HOME_}$2$3`)
  .replace(/(<a\b[^>]*?\shref=")\/(decks\/[a-z0-9-]+\/")/g, (m, a, b) => (/decks/.test(e.MODE) ? a + e.HOME_ + b : m));
f.writeFileSync(process.argv[2], h);' "$T/p/$f" "$3/$f"
  done
}
page en "$T/src.html" "$PUB/preview"
SUM=""
for L in de es ja pt fr it ko; do
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
  console.log(`- names ${l}: ${all.length - m.length} of ${all.length} card names${m.length ? `; no name (English shown): ${m.slice(0, 20).join(", ")}` : ""}`); }' "$PUB/cards.json" de es ja pt fr it ko 2>/dev/null || true)
echo "$NAMES"; SUM="$SUM$NAMES"$'\n'
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then printf '### Preview texts\n%s\nMissing texts: /i18n/report.<lang>.json on the site.\n' "$SUM" >> "$GITHUB_STEP_SUMMARY"; fi
rm -rf "$T"
