# Pocket Meta QR — data spec

Status: draft 1 (Nov 8, 2026). Based on the probe of Nov 8, 2026 (branch `probe-results`).

We build our own tournament database from Limitless Play pages. We compute share, players, win rate
and matchups ourselves. We do not use the numbers on the Limitless deck table (`/decks?game=pocket`).

## 1. Sources

Base URL: `https://play.limitlesstcg.com`. All pages are plain HTML (no JavaScript needed).

| Page | Path | Data we read |
|---|---|---|
| Set list | `https://pocket.limitlesstcg.com/cards` (other host) | 4 text lines per set: name, code, release date (`29 Oct 26`), card count. Same method as `update_sets_index()` in `tcg-deck-analyzer` |
| Tournament list | `/tournaments/completed?game=POCKET&format=STANDARD&platform=all&type=all&show=N` | `table.completed-tournaments` rows: `data-date` (ISO UTC), `data-name`, `data-organizer`, `data-format`, `data-players`, `data-winner`; tournament ID from the `/tournament/<tid>/standings` link |
| Details | `/tournament/<tid>/details` | date `[data-time]` (epoch ms); format text `Standard format` or `Standard format (multi-deck)`; full page text (rules check) |
| Standings | `/tournament/<tid>/standings` | `table.striped` rows: `data-placing` (missing for dropped players), player ID (`/player/<pid>` link), name, points, record `W - L - T`, `drop`, archetype links `/metagame/<archetype>` (1, or 2+ in multi-deck events), decklist link |
| Pairings, Swiss | `/tournament/<tid>/pairings?round=N` | `tr[data-match]`: `data-match`, `data-winner` (player ID; `0` = tie; `-1` = no winner), both player IDs, game scores; special rows `bye`, `missed round` |
| Pairings, top cut | the last round link (name "Top Cut", "Time to Win", ...) | `div.bracket-match`: `data-match`, `data-slot` (`T32-1` ... `T2-1`), `.live-bracket-player[data-id]`, class `winner`, game score per player |
| Decklist | `/tournament/<tid>/player/<pid>/decklist` | 1 `div.pocket-dl` per deck (multi-deck pages have several), each with the `my.limitlesstcg.com/builder/?i=<code>` link (20 cards, no energy; format in `common.mjs` `parseBuilderParam()`) and, only in some events, `div.decklist-pocket-energy` (img `alt` = energy type). No energy block = energy unknown |

The round links come from the pairings page itself. The last link is the top cut when the page has
`div.bracket-match` and no `tr[data-match]`.

## 2. Scope

- Game Pokémon TCG Pocket, format Standard (`format=STANDARD` in the list URL).
- Skip a tournament (decision Nov 8, 2026: these are not Standard events, keep the rule as it is) when its details text has "special rules", "suspended card(s)" (same rule as
  `tcg-deck-analyzer`), or when it has fewer than 8 players.
- Keep multi-deck tournaments, with the flag `multi_deck: true` (see 4.4).
- Decklists (decision Nov 9, 2026): the best places of each tournament, **top 25 % of the players, at least 8,
  at most 32** (12-33 players: 8; 100: 25; 128 or more: 32). Before Nov 9 it was a fixed top 16; those lists
  stay, and the extra places were fetched once. The other entries keep their archetype(s) and results, but no cards.
  Compared on the 34 C1 events: +46 % requests for about 2x the decks with 20 usable finishes (a fixed top 32
  needs +93 % for a little more).
- Current set: the newest set (not a promo set) with a release date of today or earlier. Each run reads
  the set list, so a new set starts a new window automatically. Each tournament gets the set that was
  current on its day.
- Backfill: from the release of the current set (C1 Dual Fusion, 2026-10-29). About 40 tournaments.
  `--since YYYY-MM-DD` overrides the start date.

## 3. Storage

```text
data/raw/YYYY/MM/<tid>.json     # 1 file per tournament. Written once, when the tournament is complete.
                                # Source of truth. Never edited by hand.
data/decklists/<tid>.json       # {pid: [{"i": code, "e": ["lightning"] | null}, ...]} 1 object per deck.
                                # Cached forever. Old format (code strings, no energy) is fetched again.
data/index.json                 # tids done, tids skipped (with reason), decklists still to fetch
data/sets.json                  # set list from the last run + the current set code
data/meta.db                    # SQLite, BUILT from raw/ + decklists/ in each run. Not edited.
site/*.json                     # small files for the page, built from meta.db
```

A parser fix needs only a rebuild of `meta.db`, not a new fetch. Raw HTML is not stored.

### 3.1 Raw tournament file

```json
{
  "v": 1,
  "id": "6aeebbdae99f3235a75e2b7f",
  "name": "The Dark League Tournament | CARD PRIZES",
  "organizer": "The Dark League",
  "date": "2026-11-07T18:00:00Z",
  "format": "STANDARD",
  "set": "C1",
  "multi_deck": false,
  "players": 128,
  "fetched_at": "2026-11-08T13:38:52Z",
  "entries": [
    { "pid": "de_leon", "name": "De_Leon", "country": "PH", "place": 1, "points": 31,
      "w": 10, "l": 2, "t": 1, "drop": false,
      "decks": ["magnezone-b1a-miraidon-ex-b3a"], "has_list": true }
  ],
  "rounds": [
    { "n": 1, "kind": "swiss", "matches": [
      { "id": "6aefd8dbc931f53978d95f8c", "a": "sindarma", "b": "squallrush",
        "winner": "sindarma", "ga": 1, "gb": 0, "special": null } ] },
    { "n": 9, "kind": "top", "name": "Top Cut", "matches": [
      { "id": "...", "slot": "T32-1", "a": "luksa", "b": null, "winner": "luksa", "special": "bye" } ] }
  ]
}
```

- `winner`: a player ID, `"tie"`, or `null` (no winner: both lost, both missed, ...).
- `special`: `null`, `"bye"`, `"missed"` (missed round), or `"double_loss"`.
- `place`: `null` for players without `data-placing` (dropped players).

## 4. Definitions

### 4.1 Archetype
The `/metagame/<archetype>` slug from the standings, for example `magnezone-b1a-miraidon-ex-b3a`.
The display name comes from the deck table / archetype page (later).

### 4.2 Share and players
- `players(A)` = entries that have archetype A, in the window.
- `share(A)` = `players(A) / entries with an archetype`, in the window.
- In multi-deck events, an entry with decks [A, B] counts 1 for A and 1 for B. The total for the share
  is then the sum of decks, so the shares still add up to 100 %.

### 4.3 Win rate and matchups
- Unit: matches (Swiss and top cut).
- `win rate(A) = (W + 0.5·T) / (W + L + T) · 100`.
- Byes, missed rounds, double losses: not counted.
- Mirror matches (A vs A): not counted in the win rate of A. They are shown in the matchup table only.
- Matchup `A vs B` = matches where one player had A and the other had B.
- Records come from the pairings, not from the standings record text. The standings record is kept
  as a check (the two must agree, except for byes and missed rounds).

### 4.4 Multi-deck tournaments (decision Nov 8, 2026: option A)
The pairings do not say which deck a player used in a match. Thus:
- Used for: share, player counts, decklists.
- Not used for: win rate, matchups.
- Detection: details text "(multi-deck)", or more than 1 archetype link in a standings row, or more
  than 1 builder code on a decklist page.

### 4.5 Energy
- From the decklist page when the event shows it (`e`). Not every event shows it (about 60 % of decks).
- Else (decision Nov 9, 2026) the most common energy shown by Limitless on the other decklist pages of the same
  archetype in the current set (multi-deck pages: the list that matches the deck name).
- Else from the attack costs of the first named Pokémon (the second only when the first needs no colored energy).
  The old rule also added the second named "ex"; that was wrong for support Pokémon (Dedenne ex Indeedee ex:
  lightning, not lightning + psychic).
- Checked on the 593 lists with known energy (Nov 9): vote 99.6 % correct where a vote exists; vote + attack-cost
  fallback 99.2 %; the old attack-cost rule alone 98.0 %.

### 4.6 Windows
- Set: tournaments with `set` = the current set code (for example `C1`), see section 2.
- Last 7 days (`7d`) and last 3 days (`3d`): the days up to the build day, current set only (in the first days
  of a set, the window starts at its release).
- **The page uses the 7-day window** (decision Nov 9, 2026: the meta changes fast; the Limitless deck table uses
  the whole set). Deck table, share, win rate and the shown lists all come from the last 7 days.
- A deck is shown when its share in the 7-day window is 0.5 % or more (max 40).
- Shown lists: up to 10 distinct lists from **all** the deck's finishes with a decklist in the window (in the 7-day
  window the median deck has about 8, the largest about 25), best relative place first.
- Lists (decision Nov 9, 2026, requests R1 + R2 of the UI chat): all finishes with a decklist are grouped first
  (best relative place first; a finish joins the first group whose representative, the group's best-placed
  finish, is 1 card swap or less away). The 10 groups with the most finishes are shown (tie: the better best
  place). Each shown list carries `alt`: its distinct 1-card changes, with count and best place.
- Each `alt` version also gets a QR code (decision Nov 9, request R5): the shown list - out + in, with the shown
  list's energy, and the record, event and day of its best finish. Checked before deploy like the lists' QRs.
- Card index for the search (decision Nov 9, request R6): `search.json` lists every card on the page with, per deck,
  the usual copies and the top players whose list has the card (all finishes in the window).
- Cards are compared by card id (set + number). Limitless decklists use 1 standard print per card (checked Nov 9:
  989 decklists, 361 card ids, no ☆/Crown print, no card with 2 prints of the same function); `build.mjs`
  reports a problem if a deck ever has 2 prints of the same card.

## 5. Fetch rules

- 1 request per 2 seconds or slower. One request at a time.
- `User-Agent: pocket-meta-qr/0.1 (+https://github.com/samy-baladram/pocket-meta-qr)`.
- Retry 2 times on HTTP 429 or 5xx, with backoff (10 s, 30 s). Then stop the run, keep what is done.
- A tournament is fetched only when it is complete (it is in the completed list) and not in
  `data/index.json`. Decklists are fetched once and kept forever.
- Cap per run: `MAX_REQUESTS` (default 400). The rest waits for the next run.
- The run fails when a parse finds 0 standings rows, or 0 matches in a round. This catches HTML
  changes before bad data goes live.

## 6. Requests per run (estimate)

About 3 new tournaments per day. Per tournament: details 1 + standings 1 + pairings about 8
(Swiss rounds + top cut) + about 23 decklists = about 33. About 100 requests per day, about 4 minutes.

Schedule (`.github/workflows/scrape.yml`): every 6 hours. A run with nothing new makes 2 requests (set
list + tournament list). The backfill (about 40 tournaments, about 1,100 requests) needs about 3 runs
at the cap of 400.

Size: a raw tournament file is about 100 KB (128 players, 9 rounds). About 3 per day = about 110 MB per
year in git. Acceptable for now; if needed, old raw files can move to a release asset or be gzipped.

## 7. Open questions

- **Multi-deck decks on the page:** do decklists from multi-deck events go into the displayed lists
  (the 5 lists per deck on the QR page)? To discuss later. Until then, the build keeps the flag on
  each list so that the page can filter them.
- Display names and icons of archetypes: from the deck table, the archetype page, or our own rule.
- Top-cut matches are often Bo3 (game scores like 2-1). Count matches only (as now), or also games.
