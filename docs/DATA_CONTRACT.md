# Pocket Meta QR — data contract (what the page reads)

Version: 7 (Nov 9, 2026). Written by the GitHub pipeline (`pipeline/build.mjs`) in the repo
`samy-baladram/pocket-meta-qr`. The page (`index.html`) loads these files by relative paths.
The pipeline never edits `index.html`: the UI is made in the Claude artifact, then copied to the repo.

Changes from version 1 (the artifact data of Nov 3, 2026):
- New: `summary` (top level) and `eg` (per list). The page can ignore them.
- Changed definitions: `share` adds up to 100 %; `win` excludes mirror matches and multi-deck events.
  Thus our numbers differ a little from the Limitless deck table (see "Definitions").
- `rank` can skip numbers: a deck without any decklist yet is not in `decks`.
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

## UI words (Nov 9, 2026)

"Finish" in this contract is NOT the Limitless meaning ("top finishes" on a Limitless deck page = all shown placings,
whole set, all events). Our finish = one player's top-25 % place at a single-deck event in the last 7 days, with a
public decklist. The page calls it a **top player**:
- pill: "Used by `nu` of `of` top players" (was "Played in N of M finishes")
- ⓘ text: "A top player placed in the top 25% of a single-deck event in the last 7 days (at least 8 and at most
  32 players per event), so their decklist is public."
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
| `set`, `setName` | string | current set (the window never goes back before its release) |
| `window` | string | **new in v4.** `"7d"` = last 7 days up to the build day (other values: `"set"`, `"3d"`) |
| `format` | string | always `standard` |
| `span` | [date, date] | first and last tournament day in the window (`YYYY-MM-DD`) |
| `summary` | object | **new.** tournaments, players (entries) and played matches in the window |
| `decks` | array | most players first, max 40, share >= 0.5 % |

### deck

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Limitless archetype slug, e.g. `mega-charizard-y-ex-b1a-entei-ex-a4a` |
| `rank` | int | position by players (1 = most); can skip numbers |
| `name` | string | display name, e.g. `Mega Charizard Y ex Entei ex` (same as Limitless) |
| `count` | int | players with this deck in the window |
| `share` | number | % of all decks in the window (2 decimals) |
| `w`, `l`, `t` | int | match wins, losses, ties (no mirrors, no byes, no multi-deck events) |
| `win` | number or null | win rate % = (w + 0.5·t) / (w + l + t); null when no matches |
| `art` | [cardId] | the 1 or 2 named Pokémon (deck icon) |
| `nv` | int | number of distinct lists (1..10); `v/<id>.json` exists when > 1 |
| + list fields | | the most used list of the deck (list 1, see "list") |

### list (list 1 in `data.json`, lists 2..`nv` in `v/<id>.json`)

A list is the representative of a **group**: the group's best-placed finish. All finishes of the deck are grouped
first (best place first; a finish joins the first group whose representative is 1 card swap or less away). The
page shows the 10 groups with the most top players (`nu`), then the better best place, in that order.

| Field | Type | Meaning |
|---|---|---|
| `cards` | [{id, n, c}] | card id, card name, count (20 cards in total) |
| `energy` | [string] | energy types, 1 to 3 |
| `eg` | 2, 1 or absent | absent = energy shown by Limitless for this list; 2 = the event did not show it, so the most common energy of the deck's other Limitless lists; 1 = no list of the deck shows it, so guessed from the attack costs |
| `qr` | SVG string or null | in-game deck code as QR (black modules, no background); null when no code was possible |
| `ev` | string | tournament name (of the representative) |
| `pl` | string | place, e.g. `1st of 273` |
| `sc` | string | record W-L-T, e.g. `11-1-2` |
| `dt` | date | tournament day `YYYY-MM-DD` |
| `nu` | int | finishes in the group: exact copies + 1-card changes. UI: "top players" (see "UI words") |
| `of` | int | all the deck's finishes with a readable list in the window (also those of groups that are not shown). UI: "top players" |
| `alt` | array or absent | **new in v7.** the distinct 1-card changes inside the group (see below). Absent when the group has only exact copies |

`alt` entry:

```json
"alt": [
  { "in":  [{ "id": "b4-154", "n": "Soothing Shore", "c": 1 }],
    "out": [{ "id": "pa-006", "n": "Red Card",       "c": 1 }],
    "u": 2, "pl": "15th of 203" }
]
```

| Field | Meaning |
|---|---|
| `in` | cards that the change has and the shown list does not ({id, n, c}; with the 1-card rule: 1 card) |
| `out` | cards of the shown list that the change does not have |
| `u` | finishes ("top players") with exactly this change |
| `pl` | the best place among them (same format as `pl`) |

Sorted by `u` (high first), then best place. Always: `nu` = exact copies + the sum of all `u`.
Every `in`/`out` card id has a `c/` image. Example UI text: "Also played: −1 Red Card +1 Soothing Shore
(2 top players, best 15th of 203)".

### v/&lt;deckId&gt;.json

```json
{ "id": "<deckId>", "vars": [ <list>, ... ] }
```

The lists 2..`nv` of the deck, in order (`nu` high first). Same fields as "list" (no `art`).

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
  Decklists exist for the top 25 % of each event (8 to 32 players).
- Lists that differ by 1 card or less count as the same list (`nu`); the shown lists are the groups with the most
  top players.
- Multi-deck events count for `count` and `share`, not for `w`/`l`/`t`/`win` or the shown lists.
