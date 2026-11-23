# /preview/ (test page, Nov 23, 2026)

`https://pocketmetaqr.com/preview/` = the live page + card images in the game's languages. Not linked, `noindex`, not in
the sitemap. The live page (`site/index.html`, owned by the artifact) is not changed.

- `index.html`: `site/index.html` (artifact version 1795400030-a3cb) with the card-language patch: every card image path
  gets the prefix `IMGP` (`""` = English, else `i18n/<lang>/`); a card language picker next to the dark-mode button
  (`#langSel`, saved in localStorage `pmq-lang`, default = the browser language when the game has it); a card with no
  localized file falls back to the English file (window capture error handler).
- `head.html`: added first in `<head>` by site.yml: `<base href="/">` (data and images from the site root), `noindex`,
  and a small script that keeps the page's `#...` addresses on `/preview/`.
- Images: `pipeline/images_i18n.py sync` in site.yml makes `i18n/<lang>/c|z/<id>.webp` from the public "TCGPocket"
  Google Drive (needs the repo secret `GDRIVE_API_KEY`; without it the preview shows English cards).

To make the change live later: the same patch goes into the artifact page (UI chat), then the normal UI sync.
