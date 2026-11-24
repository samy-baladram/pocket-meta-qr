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
- `<lang>.code.json` (now `ja.code.json`, `es.code.json`, `pt.code.json`): **code changes** for one language, where a text change is not enough:
  ordinals (`3rd` -> `3位`), word order (`<event>で優勝`), dates (`ja-JP`, `11/14`, `11月9日〜14日`), the Limited
  Battle name. `{"patches": [{"note", "find", "replace", "all"?}]}`; `find` = exact code of the page, applied before the
  texts. A `find` that is not in the page is not used: the build prints it and the report lists it (`codeMiss`). The
  Limited Battle name patch must change when `LB` changes.
- `build.mjs`: page + language -> translated page and a report (`/i18n/report.<lang>.json` on the site: missing, bad,
  old). `pseudo.mjs`: the safety check (every text as ⟦text⟧).

## Sections in English only

A language can skip a section for now. `EN_ONLY` in `preview/i18n_patch.py` lists them per language
(`new` = What's new, `limited` = Limited Battle); the page shows a short note at the top of each (`EN_ONLY_T`).

- `es`: What's new is in English. Limited Battle: the fixed parts are translated, the deck notes stay English (like ja; Nov 24).
- `de`: What's new is in English.
- `pt`: What's new is in English. Limited Battle: the fixed parts are translated, the deck notes stay English (like ja).

`enOnly` in `config.json` (Nov 24): the ids of static HTML sections that `build.mjs` leaves in English per language
(`nwl` = the What's new list). Without it, What's new headlines that are also texts elsewhere ("Breakout decks", the
New / Improved tags) were translated and the section was half English, half translated. Text made by the page script
(Limited Battle) cannot be skipped this way.

Spanish (es, Nov 23): live as beta at `/es/` (noindex, like `/ja/`; `I18N_LIVE: "ja es"` in site.yml, `LIVE_L` in
`preview/i18n_patch.py`), with the Beta tag in the language menu. Terms: baraja, lista, jugadores top,
uso, % de victorias, torneo, sobre, expansión. Name fixes: `preview/i18n/names.fix.json` (es).

Spanish rules (agreed with the owner, Nov 23, 2026; the game has Spain Spanish only, so es-ES):
- Numbers: decimal comma and a no-break space before %: 12,0 % (code: `fx(v, d)`, `pn(v)` and `pct()` in
  `es.code.json`). Change only what is inside a `${…}`: the English text around it must stay the same, or its id
  changes and the text shows in English.
- Ranks: 1.º (1.º de 35, El puesto pasó de 5.º a 3.º); places in events 3.º de 110.
- Dates: 14 nov in text, 14/11 in small cells and charts; the year only when not this year; times 9:05 (24 h);
  relative: hace 5 min, hace 3 h, hoy, ayer.
- Plurals: the code adds "es" after "jugador" (patches "plural: …", kept last); translations use `jugador{n}`.
  Event wins: torneos ganados (victorias = match wins). Labels after a number: "de uso", "de victorias".
- "lista" = a deck list; the deck ranking = "ranking". Score = Balance. Buttons with a count: Ver todo (8).

Brazilian Portuguese (pt, Nov 23): live as beta at `/pt/` since Nov 24 (noindex, like `/ja/` and `/es/`; `I18N_LIVE`, `LIVE_L`). Made from the reviewed Spanish: the same
552 texts and the same 164 code changes (`pt.code.json`), in Portuguese. `<html lang="pt-BR">`; names from the
database key `pt-br` (`pipeline/i18n_names.mjs`, SRC). Terms (the game's own: Baralhos de Aluguel, Pacotes de Booster):
baralho, lista, jogadores top, uso, % de vitórias, torneio, pacote, coleção, cartas fixas / flexíveis, campanha (Score
and a record 10-2-0; "com saldo positivo" = a winning record), posição (rank), lugar (place in an event). Numbers: 12,0% (decimal comma, no space before %); ranks 1º, 3º de 110;
dates 14/11 in small cells; relative há 5 min, hoje, ontem. Plurals: jogador + "es" (the same code patches as es).
Checked with the owner (Nov 24): the game menu path (Meus baralhos → + → Escanear código → Escanear imagem salva),
energy names (Planta, Fogo, Água, Raios, Psíquico, Luta, Escuridão, Metal, Incolor, Dragão), A3b = Bosque dos Eevee
(names.fix.json; the database has the A3 name there).
Review (Nov 24): "Share" alone = the meta share (Uso; the share button has its own code patch); "this week" = nesta
semana (it follows a noun or a verb: "Resultados nesta semana", "top 32 vs. o meta nesta semana"); event stats "Acima /
Abaixo do esperado"; "Série A · as coleções anteriores"; "3º maior de 12 torneios"; numbers ▲1,9 and ±2,8 (fx);
relative times always "há …" (also the Limited Battle "Atualizado em …"). Pokémon names stay as in English (the game).

Intro text (Nov 24): `pipeline/intro_i18n.mjs` writes the language page's intro (`<p class="seoi">`, shown while the
page loads and read by search engines) in its language from data.json; `preview/build.sh` passes `--lang <xx> --data site`
to `page.mjs`. A new language needs one sentence there.

## Images
- Card images: per language (`site/i18n/<lang>/c|z/`, `images_i18n.py sync`), English file when one is missing.
- Booster pack art and icons (Nov 24): the English images (`p/`) on every language page. The logo-free art from the
  game files (`images_i18n.py packs`, `i18n/p/`) was not sharp and had other dimensions, so it is not made or used.

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

## Attributes the extractor does not find (Nov 23, 2026)
- `aria-label`, `title` and `alt` inside JS templates, and the `alt` of the What's new images, are not in the catalog.
  In Japanese they are code patches in `ja.code.json` (notes "label: …", "alt: …", "What's new image: …").
  A new What's new entry with an image needs one more patch for its `alt`. To find English that is left:
  build the page, then look for attributes with Latin words and no Japanese.

## Japanese dates, times and numbers (agreed with the owner, Nov 23, 2026)
- Dates in text and labels: 11月14日. Small cells and chart axes (result rows, Top players rows, trend axes): 11/14.
- The year only when it is not the current year: 2025年11月14日. This also goes for the What's new headings
  (`ja.code.json` sets them from `<time datetime>`) and the pack release dates.
- Times: 24-hour with no zero in front: 9:05, 11月14日 9:05; a weekday as (土): (土) 9:05.
- Ranges: 11月9日〜14日, 11月28日〜12月2日. Relative: 3時間前, 3時間前に追加.
- Ranks: N位 (never #N); "N of M": M中N (35デッキ中1位, 上位プレイヤー12人中8人).
- Counters: Nデッキ (not 個), Nパック, N枚 (cards), N名 (players), N回優勝 (event wins; N勝 = match wins).
- Number and label: the label first (使用率12.0% · 勝率52%). A button with a count: …をすべて表示（N）.
- The hourly look for new data = チェック (5分前にチェック, 次回のチェック); 更新 = the numbers changed (前回の更新);
  the Live chip = 最新 (not ライブ, which reads as a stream). 確認 only for "see / verify" (1枚ずつ確認できます).

## German (de, Nov 24, 2026): /preview/de/ only (not in the menu yet)
- Numbers: 12,0 % (DIN 5008: comma, a non-breaking space before %; `fx` / `pn` / `pct` in `de.code.json`; a text that
  follows a number has "{0} %"). Thousands: 1.789 (`de-DE`).
- Ranks: 1. (`n + "."`): "1. von 162", "Platz 3 im Meta", "wurde 7. bei …", "blieb auf Platz 3".
- Dates: 18.–23. Nov.; 14.11. in small cells; the year only when not this year; times 9:05.
- Relative times: "vor 5 Min.", "vor 3 Std.", "vor 2 Tagen", "heute", "gestern", "gerade eben".
- Plurals: the English code adds "s"; the "plural: …" patches (kept last) make it n / e / en for Karte(n), Änderung(en),
  Turnier(e) (Turnieren after "in"), Stunde(n). Spieler, Deck(s), Pack(s), Slot(s) need nothing.
- Terms: du (not Sie), Anteil (share), Siegquote (win rate; "Siege" = wins), Bilanz (Score and a record 10-2-0),
  Top-Spieler, Liste, Turnier, Erweiterung (set), Boosterpack, Kern / Flex, Änderung (swap), unter dem Cut, Breakout,
  energy types as in the German TCG (Pflanze, Feuer, Wasser, Elektro, Psycho, Kampf, Finsternis, Metall, Drache, Farblos).
  Card and Pokémon names are German (names.de.json: Glurak, Psiana).
- To check by the owner in the game: the QR import path (Meine Decks → + → Code scannen → Gespeichertes Bild scannen)
  and the German name of the Limited Battle event (now "Limitierter Kampf").

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

## Layout check (long words)
Languages with long words (German, Spanish, French ...) can break buttons, chips and titles. A language page gets extra
CSS in `preview/i18n_patch.py` (scoped to `html:not([lang="en"])`): hyphenation, titles on 2 lines, labels that wrap.
To test a new language or a UI change: `node i18n/pseudo.mjs <patched page> <out> --long` makes every word 60% longer;
`tools/layout_check.mjs` lists what sticks out or is cut, compared with the English page.
