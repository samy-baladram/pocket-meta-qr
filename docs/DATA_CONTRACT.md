# Pocket Meta QR — data contract (what the page reads)

Version: 2 (Nov 9, 2026). Written by the GitHub pipeline (`pipeline/build.mjs`) in the repo
`samy-baladram/pocket-meta-qr`. The page (`index.html`) loads these files by relative paths.
The pipeline never edits `index.html`: the UI is made in the Claude artifact, then copied to the repo.

Changes from version 1 (the artifact data of Nov 3, 2026):
- New: `summary` (top level) and `eg` (per list). The page can ignore them.
- Changed definitions: `share` adds up to 100 %; `win` excludes mirror matches and multi-deck events.
  Thus our numbers differ a little from the Limitless deck table (see "Definitions").
- `rank` can skip numbers: a deck without any decklist yet is not in `decks`.

## Files

| Path | Content | Loaded |
|---|---|---|
| `data.json` | deck table + the best list of each deck | at page load |
| `v/<deckId>.json` | the other lists of 1 deck (only when the deck has more than 1 list) | on demand |
| `c/<cardId>.webp` | card image, 150 px wide (also used for the deck icons via `art`) | per card |
| `e/<energy>.webp` | energy icon, 48 px (`grass`, `fire`, `water`, `lightning`, `psychic`, `fighting`, `darkness`, `metal`) | per energy |

`cardId` = lower-case set + 3-digit number, for example `b1a-014`, `c1-127`, `pa-007` (promo A).

## data.json

```json
{
  "updatedAt": "2026-11-08T14:31:44.532Z",
  "set": "C1",
  "setName": "Dual Fusion",
  "format": "standard",
  "span": ["2026-10-29", "2026-11-08"],
  "summary": { "tournaments": 34, "players": 4478, "matches": 12228 },
  "decks": [ <deck>, ... ]
}
```

| Field | Type | Meaning |
|---|---|---|
| `updatedAt` | ISO time | build time |
| `set`, `setName` | string | current set (window = all tournaments since its release) |
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
| `nv` | int | number of distinct lists (1..5); `v/<id>.json` exists when > 1 |
| + list fields | | the best list of the deck (see "list") |

### list (best list in `data.json`, other lists in `v/<id>.json`)

| Field | Type | Meaning |
|---|---|---|
| `cards` | [{id, n, c}] | card id, card name, count (20 cards in total) |
| `energy` | [string] | energy types, 1 to 3 |
| `eg` | 1 or absent | **new.** 1 = energy guessed from the attack costs (the event did not show it). Absent = energy as shown by Limitless |
| `qr` | SVG string or null | in-game deck code as QR (black modules, no background); null when no code was possible |
| `ev` | string | tournament name |
| `pl` | string | place, e.g. `1st of 273` |
| `sc` | string | record W-L-T, e.g. `11-1-2` |
| `dt` | date | tournament day `YYYY-MM-DD` |
| `nu` | int | finishes (of the best `of`) that used this list or a list 1 card away |
| `of` | int | the deck's best finishes with a readable list (max 10) |

### v/&lt;deckId&gt;.json

```json
{ "id": "<deckId>", "vars": [ <list>, ... ] }
```

The lists 2..`nv` of the deck, in order. Same fields as "list" (no `art`).

## Definitions (from docs/DATA.md in the repo)

- Window: tournaments of the current set (Standard; not events with "special rules" or "suspended cards";
  8 players or more).
- Lists come from single-deck events only, best places first (top 16 of each event have decklists).
- Lists that differ by 1 card or less count as the same list (`nu`).
- Multi-deck events count for `count` and `share`, not for `w`/`l`/`t`/`win` or the shown lists.
