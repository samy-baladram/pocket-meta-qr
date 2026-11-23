# Site texts in other languages (Nov 23, 2026)

The page is English (`site/index.html`, made in the artifact). This folder makes a German and a Japanese copy of it at
build time. Nothing changes in the live page, and a built page has no translation code: the texts are in it.

## Files
- `lib.mjs`: finds the texts and puts translations back. A **text** is a piece between layout tags, from HTML (blocks
  and `aria-label`, `title`, `alt`, `placeholder`) or from JS strings and templates. In a text, `{0}` `{1}` = a `${...}`
  of the code and `{t0}` `{t1}` = an inline tag (`<b>`, `<a>`). Id = SHA-1 of the English text (10 hex).
- `config.json`: `skipVars` (consts that are data, e.g. `LB`), `skipScripts` (libraries), `skipText`, `forceText`.
- `en.json`: the catalog (made by `extract.mjs`; the build also puts it on the site: `/i18n/en.json`).
- `de.json`, `ja.json`: `{id: [English, translation]}`; optional 3rd part `{"<code just before the text>": translation}`
  for one English text with two meanings ("Share": the button vs the meta share).
- `build.mjs`: page + language -> translated page and a report (`/i18n/report.<lang>.json` on the site: missing, bad,
  old). `pseudo.mjs`: the safety check (every text as ⟦text⟧).

## Rules for a translation
- Keep every `{n}` once and every `{tn}` (order may change). `{n!}` = the code still runs but shows nothing (an English
  plural `s` in Japanese). A translation that breaks this is not used (the report lists it) and the English stays.
- No translation = the English stays exactly as it is. Leave code-like entries (class names, keys) untranslated.
- Japanese: the spaces next to a translation that starts / ends with Japanese are dropped.
- Words of the game: as in the game (Energie / エネルギー, Booster-Pack / パック, Erweiterung / 拡張パック); card,
  deck, set and pack names come from `preview/i18n/names.<lang>.json`, not from here.

## When the live page changes
Every build extracts the texts again. New or changed English texts have new ids, so they show as missing in
`/i18n/report.<lang>.json` (and in the run summary); the page shows them in English until they are translated. To
update: take the missing texts from the report, translate them, add them to `de.json` / `ja.json`, push.

## Local check
```bash
python preview/i18n_patch.py site/index.html /tmp/src.html
node i18n/pseudo.mjs /tmp/src.html /tmp/xx.html          # then open it (see pseudo.mjs)
bash preview/build.sh /tmp/pub                           # all preview pages, like the build
```
