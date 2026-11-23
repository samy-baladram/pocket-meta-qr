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
- `<lang>.code.json` (now `ja.code.json`): **code changes** for one language, where a text change is not enough:
  ordinals (`3rd` -> `3位`), word order (`<event>で優勝`), dates (`ja-JP`, `11/14`, `11月9日〜14日`), the Limited
  Battle name. `{"patches": [{"note", "find", "replace", "all"?}]}`; `find` = exact code of the page, applied before the
  texts. A `find` that is not in the page is not used: the build prints it and the report lists it (`codeMiss`). The
  Limited Battle name patch must change when `LB` changes.
- `build.mjs`: page + language -> translated page and a report (`/i18n/report.<lang>.json` on the site: missing, bad,
  old). `pseudo.mjs`: the safety check (every text as ⟦text⟧).

## Rules for a translation
- Keep every `{n}` once and every `{tn}` (order may change). `{n!}` = the code still runs but shows nothing (an English
  plural `s` in Japanese). A translation that breaks this is not used (the report lists it) and the English stays.
- No translation = the English stays exactly as it is. Leave code-like entries (class names, keys) untranslated.
- Japanese words: as GameWith / Game8 use them: 最強デッキ (headings, tab, titles: the search term of Game8 /
  GameWith / Altema), 環境 for "the meta" in sentences (環境カード, 現在の環境), デッキレシピ / レシピ (a deck list), 使用率, 勝率,
  優勝 / N位 / ベスト8, 参加 N名, 限定バトル, マイデッキ → 新規作成 → コードを読み取る → 保存した画像から読み取る.
- Japanese style (as GameWith / Game8): sentences in help, FAQ and messages in です/ます; labels, chips and pills end
  on a noun (実績なし, 大きな変動なし), no 。; short notes and the Limited Battle deck notes in the plain form
  (〜に強い。〜が低め。), like the bullets of those sites.
- Japanese: the spaces next to a translation that starts / ends with Japanese are dropped.
- Words of the game: as in the game (Energie / エネルギー, Booster-Pack / パック, Erweiterung / 拡張パック); card,
  deck, set and pack names come from `preview/i18n/names.<lang>.json`, not from here.

## Limited Battle: English only (Nov 23, 2026)
- The content of each Limited Battle stays English in every language: the deck notes and their labels ("Why it's good",
  "Tip" …), the event name (`LB.name`) and the card pool ("Only cards from …", "Dual Fusion, Promo-C Vol. 1 …").
  They change with each event, so do not add text entries or code patches for them.
- The parts that do not change with an event stay translated: the banner, "Limited-time event", the days left, the
  filter and the deck panel, and the page's fixed sentences ("Hand-picked decks, not tournament data …").
- `ja.code.json` / `de.code.json` add one line on the page: "デッキのメモは英語のみです。" / "Die Deck-Notizen gibt es nur
  auf Englisch." (find: `<p class="lbnote"><b class="lbup">`).

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
