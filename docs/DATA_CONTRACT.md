# Pocket Meta QR — data contract (what the page reads)

Version: 20 (Nov 13, 2026). Written by the GitHub pipeline (`pipeline/build.mjs`) in the repo
`samy-baladram/pocket-meta-qr`. The page (`index.html`) loads these files by relative paths.
The pipeline never edits `index.html`: the UI is made in the Claude artifact, then copied to the repo.

Changes from version 1 (the artifact data of Nov 3, 2026):
- New: `summary` (top level) and `eg` (per list). The page can ignore them.
- Changed definitions: `share` adds up to 100 %; `win` excludes mirror matches and multi-deck events.
  Thus our numbers differ a little from the Limitless deck table (see "Definitions").
- `rank` can skip numbers in `decks`: a deck without a list in the window is not in `decks`. Since v12 it is in
  `nolist` (same file), so `decks` + `nolist` of `data.json` and `more.json` together have no gap.
- Version 20 (request R17 of the UI chat): each list group is represented by its **most-played version** (was: its
  best-placed finish), so list 1 is the list that the most top players used ("Popular now"). New fields **`nx`**
  (finishes with exactly this list) and **`rec`** (`[w, l, t]` of those finishes) per list, and **`rec`** per `alt`.
- Version 19 (request R16 of the UI chat): permanent share links. New file **`cards.json`** (card id <-> in-game deck
  number); new fields **`tid`** + **`pid`** (the Limitless decklist of the finish) on every list, `alt` entry and
  `t/` list (`pid` only); the `c/` and `z/` images of every card in every stored decklist stay on the site.
- Version 18 (user decision, Nov 13): **simpler new set day.** The 7-day window holds the tournaments of the last
  7 days of **all sets**; on a new set day the old set's events leave it day by day. `set`/`setName`/`setRelease`
  = the newest set that Limitless lists (it changes when Limitless lists the new set, usually on the release day or
  up to about 1 day later). `next` is **not written**; `rk0`/`nw` are written as always (no gap at a set change).
- Version 17 (request R15 of the UI chat): new set day. `data.json` gets **`setRelease`** (release day of `set`) and,
  while a new set has fewer than 3 tournaments on the site, **`next`** (the old set is still shown). `rk0`/`nw` are
  left out on all decks when the build 24 h earlier showed another set (see "New set").
- Version 16 (request R14 of the UI chat): per deck (`decks` and `nolist`, in `data.json` and `more.json`)
  **`rk0`** = the rank 24 h before the build (0 = not in the list then) and **`nw: 1`** = new in the list (first time
  in the list less than 72 h ago). About 10 bytes per deck.
- Version 15 (request R13 of the UI chat): event times for the "Live" status panel: **`ts`** (start) and **`at`**
  (reached the site) per event in `events.json`; **`latest`** (the event that reached the site last) in `data.json`;
  **`changedAt`** (last added tournament of the window) in `data.json` and `events.json`.
- Version 14 (request R12 of the UI chat): the QR is **`q`** (packed bits, about 290 characters) in place of the SVG
  **`qr`** (about 2,800 characters), in every list, `alt` entry, `more.json` and `t/` list (see "Packed QR").
  `qr` is no longer written; the page still reads it (old field). The deploy copy of the page is minified.
- Version 13 (request R11 of the UI chat): new **top player** definition: a player with a **winning record**
  (W > L; ties count neither way) at a single-deck event in the window (was: top 25 % of the players, 8 to 32).
  `nu`, `of`, the list groups, `alt` and `search.json` use it. New list field **`bc`**: a deck with no top player gets
  its best-placed finish as its only list, `"bc": 1` ("below the cut"; `nu` = `of` = 0, no `alt`). `nolist` keeps
  only decks with no single-deck list at all. `events.json` / `t/` do not change.
- Version 12 (request R10 of the UI chat): new field **`nolist`** in `data.json` and `more.json`: the decks of
  that file's share range that have no list in the window, with rank, numbers, name, art and energy, for a disabled
  row in their rank place (see "nolist"). About 0.5 KB in `data.json`, 2 KB in `more.json` on Nov 11.
- Version 11 (request R9 of the UI chat): new file **`more.json`** (the decks with 0.2 % <= share < 0.5 % that
  have at least 1 list, same deck format, for a "Show more decks" button) and new field **`more`** in `data.json`
  (the number of decks in `more.json`). Their other lists are in `v/` as usual; `search.json` includes them.
  About 54 KB (10 KB compressed) on Nov 11 (13 decks).
- Version 10 (request R8 of the UI chat): new files **`events.json`** (the single-deck events of the window, for a
  "Latest Events" tab) and **`t/<tid>.json`** (the public lists of 1 event, in place order, with QR). See below.
  About 18 KB (4 KB compressed) for `events.json`; up to about 110 KB (18 KB compressed) per `t/` file.
- Version 9 (request R6 of the UI chat): new file **`search.json`**, a card index for the search suggestions
  (see below). About 26 KB (about 4 KB compressed).
- Version 8 (request R5 of the UI chat): each `alt` entry has its own **`qr`** (the shown list - `out` + `in`, with
  the list's energy) and the **`sc`**, **`ev`**, **`dt`** of the best finish with that change (like `pl`).
  Size: about 2.7 KB per QR; list 1's `alt` QRs add about 96 KB to `data.json` (about 12 KB when compressed).
- Version 7 (requests R1 + R2 of the UI chat; R4 skipped): the shown lists are the **10 groups with the most top
  players** (then the better best place), not the first 10 groups by place. Lists are written in that order
  (`nu` high first). New optional field **`alt`** per list: the 1-card changes inside the group (see "list").
  Cards are compared by card id: Limitless always uses 1 standard print per card (checked Nov 9), so the page can
  keep comparing by card name.
- Version 6: card thumbnails `c/` are **240 px** wide (were 150; same paths, sharper). New: `z/<cardId>.webp`
  (367 px, for the zoom view), `packs.json` + `p/<image>.webp` (booster pack of each card). The page uses all three
  in the card popup (since artifact version 223).
- Version 5: `eg` has 2 values: `2` = energy from the deck's other lists (most common energy shown by Limitless),
  `1` = from the attack costs. Absent = shown by Limitless for this list. The page can treat both as "not from
  this list's event".
- Version 4: **window = last 7 days** (new field `window`: `"7d"`). `count`, `share`, `w`/`l`/`t`, `win`, the deck
  selection and the lists all use the last 7 days. `of` = **all** the deck's finishes with a readable list in
  the window (not only the best ones).
- Version 3: up to **10 lists** per deck (`nv` 1..10) from the deck's **20 best finishes** (`of` max 20);
  finishes are ranked by place relative to the event size (5th of 547 before 2nd of 153).

## UI words (Nov 9, 2026; top player rule changed Nov 11, v13)

"Finish" in this contract is NOT the Limitless meaning ("top finishes" on a Limitless deck page = all shown placings,
whole set, all events). Our finish = one player's place with a **winning record (W > L)** at a single-deck event in
the last 7 days, with a public decklist (until v12: a top-25 % place). The page calls it a **top player**:
- pill: "Used by `nu` of `of` top players" (was "Played in N of M finishes")
- ⓘ text (UI chat to update): "A top player won more matches than they lost at a single-deck event in the last
  7 days." (until v12: "placed in the top 25% ... at least 8 and at most 32 players per event").
- "Below the cut" (`bc: 1`): the deck's best-placed player when the deck has no top player; not a top player.
- footer: "up to 10 lists per deck, from the decklists of top players"
Use the same word in new docs and UI notes.

## Files

| Path | Content | Loaded |
|---|---|---|
| `data.json` | deck table + the best list of each deck | at page load |
| `v/<deckId>.json` | the other lists of 1 deck (only when the deck has more than 1 list) | on demand |
| `c/<cardId>.webp` | card image, 240 px wide (also used for the deck icons via `art`, and for the `alt` cards) | per card |
| `z/<cardId>.webp` | **new in v6.** card image for the zoom view, 367 px wide (the full PocketDecks source, about 29 KB) | on tap |
| `packs.json` | **new in v6.** set and booster pack of every card on the site (see below) | on demand |
| `p/<image>.webp` | **new in v6.** booster pack image, 200 px wide (about 23 KB); promo cards without a pack image use the promo set logo | on demand |
| `search.json` | **new in v9.** card index for the search: every card on the page, the decks that play it, copies and top players (see below) | when the search box opens |
| `more.json` | **new in v11.** the decks with 0.2 % <= share < 0.5 % and at least 1 list (see below) | when "Show more decks" is tapped, or a search result points to one of its decks |
| `events.json` | **new in v10.** the single-deck events of the window, newest first, with winner and top 8 (see below) | when the events tab opens |
| `t/<tid>.json` | **new in v10.** the public lists of 1 event, in place order, with QR (see below) | when an event opens |
| `cards.json` | **new in v19.** card id <-> in-game deck number, for share links (see below). About 100 KB (32 KB gzip) | when a link is shared or opened |
| `e/<energy>.webp` | energy icon, 48 px (`grass`, `fire`, `water`, `lightning`, `psychic`, `fighting`, `darkness`, `metal`) | per energy |

`cardId` = lower-case set + 3-digit number, for example `b1a-014`, `c1-127`, `pa-007` (promo A).

## data.json

```json
{
  "updatedAt": "2026-11-08T14:31:44.532Z",
  "set": "C1",
  "setName": "Dual Fusion",
  "format": "standard",
  "window": "7d",
  "span": ["2026-11-02", "2026-11-08"],
  "summary": { "tournaments": 34, "players": 4478, "matches": 12228 },
  "decks": [ <deck>, ... ]
}
```

| Field | Type | Meaning |
|---|---|---|
| `updatedAt` | ISO time | build time |
| `set`, `setName` | string | the current set: the newest set that Limitless lists (v18: the window can also hold events of the set before it, in the first 7 days of a set) |
| `setRelease` | date | **new in v17.** release day of `set` (`YYYY-MM-DD`) |
| `next` | — | **v17 only, not written since v18** (the page can keep reading it; it is always absent) |
| `window` | string | **new in v4.** `"7d"` = last 7 days up to the build day (other values: `"set"`, `"3d"`) |
| `format` | string | always `standard` |
| `span` | [date, date] | first and last tournament day in the window (`YYYY-MM-DD`) |
| `summary` | object | **new.** tournaments, players (entries) and played matches in the window |
| `decks` | array | most players first, max 40, share >= 0.5 % |
| `more` | int | **new in v11.** number of decks in `more.json`; `0` = no button |
| `latest` | object or absent | **new in v15.** the single-deck event of the window that reached the site last (largest `at`, then latest `ts`): `{tid, name, players, ts, at, dt}`, same values as in `events.json` (open it there by `tid`). Absent when the window has no single-deck event |
| `changedAt` | ISO time or absent | **new in v15.** the last time a tournament of the window (also multi-deck) reached the site = the largest `at` of the window's tournaments. `updatedAt` is the build time ("checked"); `changedAt` <= `updatedAt` |
| `nolist` | array | **new in v12.** decks with share >= 0.5 % (max-40 rule as `decks`) and no list in the window, by rank (see "nolist"); `[]` = none |

### deck

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Limitless archetype slug, e.g. `mega-charizard-y-ex-b1a-entei-ex-a4a` |
| `rank` | int | position by players (1 = most); can skip numbers (the missing ranks are in `nolist`) |
| `rk0` | int | **new in v16.** the deck's rank 24 h before this build (`updatedAt` − 24 h), same rules (see "Rank 24 h ago"); `0` = not in the list then (under 0.2 % share or no entries). Always written (v17 left it out across a set change; v18 does not) |
| `nw` | 1 or absent | **new in v16.** new in the list: its first time in the list (0.2 % share or more) since the set release was less than 72 h before this build, and more than 72 h after the release. The page shows NEW and ignores `rk0` then |
| `name` | string | display name, e.g. `Mega Charizard Y ex Entei ex` (same as Limitless) |
| `count` | int | players with this deck in the window |
| `share` | number | % of all decks in the window (2 decimals) |
| `w`, `l`, `t` | int | match wins, losses, ties (no mirrors, no byes, no multi-deck events) |
| `win` | number or null | win rate % = (w + 0.5·t) / (w + l + t); null when no matches |
| `art` | [cardId] | the 1 or 2 named Pokémon (deck icon) |
| `nv` | int | number of distinct lists (1..10); `v/<id>.json` exists when > 1 |
| + list fields | | the most used list of the deck (list 1, see "list") |

### list (list 1 in `data.json`, lists 2..`nv` in `v/<id>.json`)

A list is the representative of a **group** (v20, request R17): the group's **most-played version**.
1. All top-player finishes of the deck are counted by exact version (the 20 cards by card id): `n` finishes, their
   combined record, their best place (place / players).
2. Versions are read by `n` (high first), then win rate ((W + 0.5·T) / (W + L + T), as in the deck table), then best
   place; a version joins the first group whose representative is 1 card swap or less away, else it starts a group
   and represents it. So no `alt` has more finishes than its list's `nx`.
3. Groups are sorted by `nu` (high first), then the group's win rate, then its best place; the page shows the first 10.
The list's `ev`, `pl`, `sc`, `dt`, energy, QR, `tid`, `pid` come from the representative version's best finish.
(Until v19: the representative was the group's best-placed finish, so list 1 could be a version that few used.)

| Field | Type | Meaning |
|---|---|---|
| `cards` | [{id, n, c}] | card id, card name, count (20 cards in total) |
| `energy` | [string] | energy types, 1 to 3 |
| `eg` | 2, 1 or absent | absent = energy shown by Limitless for this list; 2 = the event did not show it, so the most common energy of the deck's other Limitless lists; 1 = no list of the deck shows it, so guessed from the attack costs |
| `q` | string or null | **new in v14.** in-game deck code as a packed QR (see "Packed QR"); null when no code was possible |
| `qr` | SVG string | **old (v1-v13), not written since v14**; still read by the page. Same QR as `q`, as SVG (black modules, no background) |
| `ev` | string | tournament name (of the representative) |
| `pl` | string | place, e.g. `1st of 273` |
| `sc` | string | record W-L-T, e.g. `11-1-2` |
| `dt` | date | tournament day `YYYY-MM-DD` |
| `tid`, `pid` | string | **new in v19.** Limitless tournament id (24 hex characters) and player id of the finish that gives `ev`/`pl`/`sc`/`dt`. Link: `https://play.limitlesstcg.com/tournament/<tid>/player/<pid>/decklist`. Also on `bc` lists. Absent only for a list without a decklist page (none today) |
| `nu` | int | finishes in the group: exact copies + 1-card changes. UI: "top players" (see "UI words"). `0` on a `bc` list |
| `of` | int | all the deck's finishes with a readable list in the window (also those of groups that are not shown). UI: "top players". `0` on a `bc` list |
| `bc` | 1 or absent | **new in v13.** "below the cut": the deck has no top player (W > L) in the window, so this is its best-placed finish (smallest place / players) with any record. Then it is the deck's only list (`nv` 1), `nu` = `of` = 0, no `alt`; `pl`, `sc`, `ev`, `dt`, energy and QR as for any list. The deck is not in `search.json` |
| `nx` | int | **new in v20.** finishes with exactly this list (the exact copies). Always `nu` = `nx` + the sum of `alt[].u`. Absent on `bc` lists |
| `rec` | [w, l, t] | **new in v20.** the combined record of the `nx` finishes (match wins, losses, ties). Absent on `bc` lists |
| `alt` | array or absent | **new in v7.** the distinct 1-card changes inside the group (see below). Absent when the group has only exact copies |

`alt` entry:

```json
"alt": [
  { "in":  [{ "id": "b4-154", "n": "Soothing Shore", "c": 1 }],
    "out": [{ "id": "pa-006", "n": "Red Card",       "c": 1 }],
    "u": 2, "pl": "15th of 203",
    "q": "41:/n9H...", "sc": "7-4-0", "ev": "The Breakfast Club Daily-FA +", "dt": "2026-11-03" }
]
```

| Field | Meaning |
|---|---|
| `in` | cards that the change has and the shown list does not ({id, n, c}; with the 1-card rule: 1 card) |
| `out` | cards of the shown list that the change does not have |
| `u` | finishes ("top players") with exactly this change |
| `pl` | the best place among them (same format as `pl`) |
| `q` | (v14; `qr` SVG in v8-v13) packed QR of this version: the shown list's `cards` - `out` + `in`, with the shown list's `energy` (same SVG options and decode check as a list's `qr`); null when no code was possible |
| `sc` | **new in v8.** record W-L-T of the best finish with this change |
| `rec` | **new in v20.** `[w, l, t]`, the combined record of the `u` finishes with this change (`nx` is not written: it equals `u`) |
| `ev` | **new in v8.** tournament name of that finish |
| `dt` | **new in v8.** tournament day of that finish (`YYYY-MM-DD`) |
| `tid`, `pid` | **new in v19.** the Limitless decklist of that finish (same as on a list) |

Sorted by `u` (high first), then best place. Always: `nu` = exact copies + the sum of all `u`.
Every `in`/`out` card id has a `c/` image. The version's energy is always the list's energy; when an added Pokémon
needs another type, the build log says so (none on Nov 9). The QR check decodes every `alt` QR before deploy. Example UI text: "Also played: −1 Red Card +1 Soothing Shore
(2 top players, best 15th of 203)".

### New set day (v18, user decision Nov 13; replaces the v17 rule)

- The window = the tournaments of the last 7 days, of **all sets**. On a new set day nothing special happens: the old
  set's events stay in the window and leave it day by day, the new set's events come in.
- `set`, `setName`, `setRelease` = the newest set that Limitless lists. Limitless adds a new set on its release day
  or up to about 1 day later (B4b Sep 30: listed the same day; B4a Aug 27: the next morning), so the name can change
  some hours after the release.
- `rk0`/`nw` as always. NEW: the first-time search starts 7 days before the current set's release, so decks that
  carry over from the old set are not NEW; a deck that first enters the list after that is NEW for 72 h.
- No `next`. Note for the page: in the first 7 days of a set, `summary.tournaments` counts the events of both sets.
- Card data: a new set's cards need the newer card packages (`pokemon-tcg-pocket-database` for the game ids of the
  QR codes, `pokemon-tcg-pocket-cards` for names and images). Until they are updated in the repo, lists with new cards
  have no QR (the build logs "no game id").

### Rank 24 h ago and NEW (new in v16)

Computed from the times the tournaments reached the site (`fetched_at` of the raw file, the `at` of `events.json`;
the raw files are written once, so no stored history is needed). "The list at time T" = what a build at T would have
shown: the current set's tournaments with `at` <= T and a day in the 7 days that end on T's date (UTC); share as for
`share` (every deck of an entry counts, multi-deck too); decks with 0.2 % share or more; rank by players, then id.
- `rk0` = the deck's rank in the list at `updatedAt` − 24 h (0 when not in it).
- `nw` = the first T since 7 days before the current set's release (checked at every tournament `at` and every
  midnight UTC, the only times the list can change) at which the deck is in the list, is less than 72 h ago.
- Note: the site's history starts with the first fetch on Nov 8, 2026 (all tournaments before it have `at` = Nov 8),
  so a "first time" is never before Nov 8 for set C1.
- Checked Nov 12: `rk0` of all 57 decks equals the ranks of a build from the repo data of 24 h earlier.

### Packed QR (new in v14)

`q` = `"<n>:<base64>"`:
- `n` = modules per side (no quiet zone; the page draws the quiet zone);
- the n × n grid, **row-major, MSB first**: module k (row `k / n`, column `k % n`) is bit `128 >> (k & 7)` of byte
  `k >> 3`; 1 = dark; the last byte is padded with 0 bits; standard base64 with `=` padding.
- Error correction M, from the `qrcode` package (the same grid as the SVG `qr` before v14; checked on 510 QR codes).
- Decode (JS): `const [n, b] = q.split(":"), bin = atob(b); dark(k) = bin.charCodeAt(k >> 3) & (128 >> (k & 7))`.
- The QR check before deploy draws every `q` with a quiet zone, reads it with jsQR and compares the deck code with
  the list's cards and energy.

### nolist (new in v12)

```json
"nolist": [ { "rank": 18, "id": "mega-greninja-ex-c1-suicune-ex-a4a", "name": "Mega Greninja ex Suicune ex",
              "count": 21, "share": 0.76, "win": 52.3, "art": ["c1-042", "a4a-020"], "energy": ["water"] } ]
```

| Field | Meaning |
|---|---|
| `rank`, `id`, `name`, `count`, `share`, `win` | same as a deck (`win` can be null) |
| `rk0`, `nw` | **new in v16.** same as a deck |
| `art` | the 1-2 named Pokémon, same rule as a deck's `art`; every id has a `c/` (and `z/`) image |
| `energy` | from the newest decklist of the deck in the current set (any event, also multi-deck; energy rule as for lists); else the deck's energy vote or the attack costs of the named Pokémon. Can be `[]` (only colorless costs) |

Sorted by rank. A deck is in `nolist` when none of its finishes in the window has a public single-deck list (since
v13 the pipeline fetches a "below the cut" list for such decks, so `nolist` keeps only decks that are only in
multi-deck events, or whose list is not fetched yet). No `w`/`l`/`t`, no lists,
no QR. Without a decklist in the set, `art` comes from the slug (named Pokémon + set code; checked Nov 11: the same
art as the lists for 53 of 53 decks).

### v/&lt;deckId&gt;.json

```json
{ "id": "<deckId>", "vars": [ <list>, ... ] }
```

The lists 2..`nv` of the deck, in order (`nu` high first). Same fields as "list" (no `art`).

## more.json (new in v11)

```json
{ "updatedAt": "2026-11-11T14:00:00Z", "window": "7d", "min": 0.2, "decks": [ <deck>, ... ], "nolist": [ ... ] }
```

| Field | Meaning |
|---|---|
| `updatedAt`, `window` | same as `data.json` (same build) |
| `min` | the lowest share % in this file (`0.2`) |
| `decks` | same `<deck>` format as `data.json` (list 1 fields, `alt`, QR), for the decks with `min` <= share < 0.5 %, most players first. **Only decks with at least 1 list** (a deck without a public list is left out). Also a deck with 0.5 % or more that is over the 40-deck limit of `data.json` would go here (none so far) |

- `nolist` (**new in v12**): the decks with `min` <= share < 0.5 % and no list in the window, same format as in
  `data.json`.
- `rank` continues the global order by players: the ranks are after the last rank of `data.json` (`decks` and
  `nolist`). `decks` + `nolist` of both files = ranks 1..N with no gap (N = all decks with 0.2 % share or more).
- Lists 2..`nv` are in `v/<deckId>.json`, same rules (10 groups, `alt`, QR check before deploy).
- `search.json` includes the cards and decks of `more.json`; `events.json` `decks` uses their list 1 as for
  `data.json` decks.

## events.json (new in v10)

```json
{ "updatedAt": "2026-11-10T13:05:00Z", "window": "7d", "changedAt": "2026-11-10T12:01:04Z",
  "events": [
    { "tid": "6912...", "name": "xPabsy Cup #13 - $20", "dt": "2026-11-09", "ts": "2026-11-09T17:00:00Z",
      "at": "2026-11-09T21:51:38Z", "players": 215,
      "url": "https://play.limitlesstcg.com/tournament/6912.../standings", "nl": 32,
      "win": { "deck": "greninja-ex-b1-mega-greninja-ex-c1", "name": "Greninja ex Mega Greninja ex",
               "art": ["b1-073", "c1-042"], "energy": ["water"], "sc": "12-1-1" },
      "top": [["greninja-ex-b1-mega-greninja-ex-c1", 1], ["...", 2]] } ],
  "decks": { "greninja-ex-b1-mega-greninja-ex-c1": { "name": "Greninja ex Mega Greninja ex",
             "art": ["b1-073", "c1-042"], "energy": ["water"] } } }
```

| Field | Meaning |
|---|---|
| `changedAt` | **new in v15.** same as in `data.json` |
| `events` | every **single-deck** Standard event of the window (multi-deck events are left out: no single list per player), newest first (start time) |
| `tid` | Limitless tournament id; the event's lists are in `t/<tid>.json` |
| `name`, `dt`, `players`, `url` | event name, day `YYYY-MM-DD`, entries, Limitless standings link |
| `ts` | **new in v15.** start time, ISO UTC (`"2026-11-11T22:00:00Z"`; Limitless start time) |
| `at` | **new in v15.** when the event reached the site, ISO UTC: the time the scraper stored the finished tournament (raw `fetched_at`; the raw file is written once, so `at` does not change later). Usually 1-5 h after `ts` (the event must end, then the next hourly run finds it) |
| `nl` | number of lists in `t/<tid>.json` (the public decklists: top 25 % of the players, 8 to 32; events fetched before Nov 9: 16). Not changed by the v13 top-player rule |
| `win` | the 1st place: `deck` id, display `name` (same naming as `data.json`), `art` (1-2 card ids, from the winner's list when it is public), `energy` (the winner's list when public, else the deck's), `sc` record. null only when the 1st place has no deck |
| `top` | the decks of places 1 to 8 as `[deckId, place]`, place order (with or without a public list) |
| `decks` | `{deckId: {name, art, energy}}` for every deck id in `win`, `top` and `t/`. For decks in `data.json` or `more.json`: their list 1. Other decks: a recent list of the current set (energy rule as for lists) |

## t/&lt;tid&gt;.json (new in v10)

```json
{ "tid": "6912...", "lists": [
  { "pl": 1, "place": "1st of 215", "deck": "greninja-ex-b1-mega-greninja-ex-c1", "sc": "12-1-1", "p": "IamCOMPLEX",
    "energy": ["water"], "cards": [{ "id": "b1-073", "n": "Greninja ex", "c": 2 }], "q": "37:/q8..." } ] }
```

| Field | Meaning |
|---|---|
| `lists` | 1 entry per public decklist of the event, place order (1st first) |
| `pl` | place number |
| `place` | place text, same format as a list's `pl` in `data.json` (`1st of 215`) |
| `deck` | archetype id (name, art, energy in `events.json` `decks`) |
| `sc` | record W-L-T |
| `p` | the player's name as Limitless shows it (public) |
| `pid` | **new in v19.** the Limitless player id (the decklist link uses the file's `tid`) |
| `energy`, `eg`, `cards`, `q` | same rules as a list in `data.json` (energy shown on the page, else `eg: 2` the deck's most common Limitless energy, else `eg: 1` attack costs; QR decoded before deploy). Every card id has a `c/` image and is in `packs.json` |

## cards.json (new in v19)

```json
{ "v": 1, "c": [[1018, "a1-001", "Bulbasaur"], [1018, "a1-227"], [1019, "a1-002", "Ivysaur"]] }
```

| Field | Meaning |
|---|---|
| `c` | one row per card print that has an in-game deck number: `[nr, cardId, name?]`, sorted by `nr`, then `cardId` |
| `nr` | the game's deck builder number (`getCardDeckBuilderNr`, the same as in the QR codes). Several prints (alt arts, reprints) share 1 `nr` |
| `name` | only on the **display print** of each `nr`: the print that the site's lists use (it has a `c/` image), else the lowest rarity (◊ first), then the oldest release |

Rebuilt on every build from the card packages. Checked before deploy: for every list, `alt` version and event list,
the deck code made from `cards.json` (card ids -> `nr` in the list's card order, the list's energy) is the same text
as the code inside its QR.

## Images (v19)

`c/` and `z/` keep the images of **every card in every stored decklist** (all events since the set's backfill, also
lists not shown), not only today's cards. So an old share link still shows its cards. Nov 13: 438 cards, `c/` 8 MB,
`z/` 15 MB. Every display print in `cards.json` that a stored list uses has an image.

## search.json (new in v9)

```json
{ "cards": [
  { "id": "c1-098", "n": "Dratini", "u": 11,
    "decks": [["giratina-ex-c1-dragonair-b4", 2, 9], ["dragonair-mega-rayquaza-ex-b4", 2, 2]] } ] }
```

| Field | Meaning |
|---|---|
| `cards` | 1 entry per card id that is in a shown list or an `alt` version (`in` card) of any deck in `data.json` or (v11) `more.json` (v13: not the `bc` decks). Sorted by `u`, high first |
| `id`, `n` | card id and card name (every `id` has a `c/` image) |
| `u` | sum of the top players over all decks (the third value of each `decks` entry) |
| `decks` | `[deckId, usual copies, top players]`, sorted by top players, high first. Top players = the deck's finishes in the window whose list has the card (all groups, also those not shown: the same population as `of`). Usual copies = the copies in the deck's most used shown list that has the card; else the most common count among those finishes. Only decks with at least 1 such finish |

Note: when a deck has more than 10 groups, a card can be in a group that is not shown. Then `decks` lists that deck,
but no shown list or `alt` of it has the card. On Nov 9 this happens 0 times (no deck has more than 10 groups).

## packs.json (new in v6)

```json
{
  "sets":  { "c1": { "name": "Dual Fusion", "release": "2026-10-29" } },
  "packs": { "c1-pikachu": { "set": "c1", "name": "Pikachu", "img": "c1-pikachu" },
             "pa-shop":    { "set": "pa", "name": "Shop", "img": "promo-a" } },
  "cards": { "c1-127": ["c1-pikachu"], "a1-110": ["a1-charizard", "a1-mewtwo", "a1-pikachu"] }
}
```

| Field | Meaning |
|---|---|
| `sets[code]` | set name and release date; `code` = the card id prefix (`c1-127` -> `c1`) |
| `packs[packId]` | the pack's set, display name (single-pack sets: the set name, e.g. `Fantastical Parade`), and `img` = file name in `p/` (`p/<img>.webp`) or null |
| `cards[cardId]` | the pack(s) the card comes from. More than 1 = a "shared" card that is in every pack of its set |

Only cards that are on the site are listed (including the `alt` cards). Source: PocketDecks `data/v5/expansions.json`
and the card `pack` field.

## Definitions (from docs/DATA.md in the repo)

- Window: the last 7 days of tournaments of the current set (Standard; not events with "special rules" or "suspended cards";
  8 players or more).
- Lists come from single-deck events only. Best finish = smallest place / players (then place, then newer).
  Top player (v13) = a winning record (W > L) at a single-deck event; the pipeline fetches all their decklists.
  A deck without a top player gets 1 "below the cut" list (`bc`).
- Lists that differ by 1 card or less count as the same list (`nu`); the shown lists are the groups with the most
  top players.
- Multi-deck events count for `count` and `share`, not for `w`/`l`/`t`/`win` or the shown lists.
