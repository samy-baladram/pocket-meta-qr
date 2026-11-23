# /preview/ (language test page, Nov 23, 2026)

`https://pocketmetaqr.com/preview/` = the live page + languages. Not linked, `noindex`, not in the sitemap. The live
page (`site/index.html`, owned by the artifact) is not changed.

- `i18n_patch.py`: site.yml runs it on every build: `site/index.html` -> the preview page, so the preview always
  follows the live page. If the live page changes so that a patch point is gone, the patch stops with an error and the
  build only gives a warning (no /preview/ that run). What it adds:
  1. Card images: every card image path gets the prefix `IMGP` (`""` = English, else `i18n/<lang>/`); a card with no
     localized file falls back to the English file.
  2. Names (de, ja): deck, card, set and pack names from `i18n/names.<lang>.json`, switched in the data as it loads.
  3. A language picker next to the dark-mode button (`#langSel`, localStorage `pmq-lang`; default = the browser
     language when the game has it). A change reloads the page.
- `head.html`: added first in `<head>`: `<base href="/">` (data and images from the site root), `noindex`, and a
  small script that keeps the page's `#...` addresses on `/preview/`.
- `i18n/names.<lang>.json`: made by `pipeline/i18n_names.mjs` from the TCGdex card database fork
  `wsgtcyx/cards-database` (names from the game's own text). Make them again at a set release.
- Card images: `pipeline/images_i18n.py sync` in site.yml (public "TCGPocket" Google Drive, secret `GDRIVE_API_KEY`).

Next: the site's own texts (tabs, buttons, sheets, About) in German and Japanese, then dates and numbers.
To go live later: the same changes in the artifact page (UI chat), then the normal UI sync.
