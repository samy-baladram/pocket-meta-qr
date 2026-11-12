"""Export the page-build input from data/meta.db -> build/input.json (read by pipeline/build.mjs).

  python pipeline/export.py [--data DIR] [--out FILE] [--window 7d] [--rows 0]

Window: last 7 days by default (decision Nov 9, 2026: the meta changes fast); only tournaments of the current
        set, so in the first 7 days of a set the window starts at the set release.
Decks : archetypes with share >= MIN_SHARE in the window (max MAX_DECKS), most players first (data.json), then
        (R9, Nov 11, 2026) the archetypes with MORE_SHARE <= share < MIN_SHARE, flag "more" (more.json, loaded on tap).
Rows  : per deck, all its top-player finishes in the window (--rows 0) or the best N: single-deck tournaments, a
        decklist, and a winning record (W > L; decision Nov 11, 2026, request R11):
        best place relative to the event size first (place / players: 3rd of 547 before 1st of 12),
        then the better place, then the newer event.
        Multi-deck tournaments are not used for the shown lists (same rule as the win rate, docs/DATA.md 4.4).
        A deck with no top-player finish gets 1 "below the cut" row (flag "bc"): its best-placed single-deck finish with
        a decklist (any record). A deck with neither is a "nolist" row (R10).
Events: the lists of each event's top 25 % (8..32 places), or the count the event got before (index "dl": a fixed
        16 before Nov 9, 2026), as before R11 (the Latest Events tab does not change).
"""
import argparse, json, os, sqlite3
from datetime import datetime, timezone

MIN_SHARE = 0.5   # % of all decks in the window (data.json)
MORE_SHARE = 0.2  # % for the "Show more decks" file (more.json, R9)
MAX_DECKS = 40
MAX_ROWS = 0      # finishes read per deck; 0 = all (build.mjs keeps up to 10 distinct lists from them)
EVENT_SHARE, EVENT_MIN, EVENT_MAX = 0.25, 8, 32   # lists per event in the Latest Events tab (t/<tid>.json)


def ordinal(n):
    suf = "th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suf}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="data")
    ap.add_argument("--out", default="build/input.json")
    ap.add_argument("--window", default="7d", choices=["set", "7d", "3d"])
    ap.add_argument("--rows", type=int, default=MAX_ROWS, help="finishes per deck; 0 = all")
    a = ap.parse_args()

    db = sqlite3.connect(os.path.join(a.data, "meta.db"))
    meta = dict(db.execute("SELECT key, value FROM meta"))
    cur = meta["current_set"]
    set_name = (db.execute("SELECT name FROM sets WHERE code = ?", (cur,)).fetchone() or [""])[0]
    # Tournaments of the window: the same rule as build_db.py (set = current set; 7d/3d = last days up to ref).
    if a.window == "set":
        tids = [r[0] for r in db.execute("SELECT id FROM tournaments WHERE set_code = ?", (cur,))]
    else:
        days = int(a.window[:-1])
        tids = [r[0] for r in db.execute(
            "SELECT id FROM tournaments WHERE set_code = ? AND day > date(?, ?)", (cur, meta["ref"], f"-{days} days"))]
    q = ",".join("?" * len(tids))
    summary = db.execute(f"SELECT COUNT(*), SUM(players), MIN(day), MAX(day) FROM tournaments WHERE id IN ({q})", tids).fetchone()
    matches = db.execute(f"SELECT COUNT(*) FROM matches WHERE special IS NULL AND b IS NOT NULL AND tid IN ({q})", tids).fetchone()[0]

    def lists_of(tid, pid):
        out = []
        for idx, energy in db.execute("SELECT idx, energy FROM decklists WHERE tid = ? AND pid = ? ORDER BY idx", (tid, pid)):
            cards = [list(r) for r in db.execute(
                "SELECT count, set_code, num FROM decklist_cards WHERE tid = ? AND pid = ? AND idx = ?", (tid, pid, idx))]
            out.append({"cards": cards, "energy": energy.split(",") if energy else None})
        return out

    # Energy votes: every decklist page of this archetype in the current set where Limitless shows the energy
    # (multi-deck pages too: all their lists go in, build.mjs takes the list that matches the deck name).
    # Used when a shown list's own event does not show the energy (docs/DATA.md 4.5).
    def energy_votes(arch):
        return [lists_of(tid, pid) for tid, pid in db.execute("""
            SELECT DISTINCT d.tid, d.pid FROM entry_decks d JOIN tournaments t ON t.id = d.tid
            WHERE d.archetype = ? AND t.set_code = ?
              AND EXISTS (SELECT 1 FROM decklists x WHERE x.tid = d.tid AND x.pid = d.pid AND x.energy IS NOT NULL)""",
            (arch, cur))]

    decks = []
    for k, (arch, players, share, w, l, t, win) in enumerate(db.execute(
            "SELECT archetype, players, share, w, l, t, win_rate FROM archetype_stats "
            "WHERE window = ? AND share >= ? ORDER BY players DESC, archetype", (a.window, MORE_SHARE)).fetchall()):
        more = share < MIN_SHARE or k >= MAX_DECKS
        def finishes(top_only, limit):
            return [{"key": f"{tid}/{pid}", "ev": ev, "pl": f"{ordinal(place)} of {size}",
                     "sc": f"{ew}-{el}-{et}", "dt": day, "lists": lists_of(tid, pid)}
                    for tid, pid, place, ew, el, et, ev, size, day in db.execute(f"""
                SELECT e.tid, e.pid, e.place, e.w, e.l, e.t, t.name, t.players, t.day
                FROM entry_decks d JOIN entries e USING (tid, pid) JOIN tournaments t ON t.id = e.tid
                WHERE d.archetype = ? AND t.multi_deck = 0 AND e.place IS NOT NULL AND d.tid IN ({q})
                  AND (? = 0 OR e.w > e.l)
                  AND EXISTS (SELECT 1 FROM decklists x WHERE x.tid = e.tid AND x.pid = e.pid)
                ORDER BY CAST(e.place AS REAL) / t.players, e.place, t.date DESC LIMIT ?""",
                        [arch, *tids, int(top_only), limit])]
        rows = finishes(True, a.rows or -1)
        bc = not rows
        if bc:
            # R11b: no top player -> the best-placed single-deck finish with a decklist ("below the cut").
            rows = finishes(False, 1)
        deck = {"id": arch, "count": players, "share": round(share, 2), "w": w, "l": l, "t": t,
                "win": round(win, 2) if win is not None else None, "rows": rows, "votes": energy_votes(arch), "more": more,
                "bc": bc and bool(rows)}
        if not rows:
            # R10 (Nov 11, 2026): no list in the window -> the deck is a "nolist" row. For its art and energy: the newest
            # decklist page of the deck in the current set (any event, also multi-deck); build.mjs falls back to the slug.
            row = db.execute("""SELECT d.tid, d.pid FROM entry_decks d JOIN tournaments t ON t.id = d.tid
                                WHERE d.archetype = ? AND t.set_code = ?
                                  AND EXISTS (SELECT 1 FROM decklists x WHERE x.tid = d.tid AND x.pid = d.pid)
                                ORDER BY t.date DESC LIMIT 1""", (arch, cur)).fetchone()
            deck["sample"] = lists_of(*row) if row else []
        decks.append(deck)

    # R8 (Nov 10, 2026): events of the window for the "Latest Events" tab. Single-deck events only, newest first.
    # Per event: the top 8 decks by place (all entries with a place, with or without a public list) and every entry
    # with a public decklist, in place order. build.mjs makes the energy, art and QR (same rules as the deck lists).
    events, used = [], set()
    dl = {t: i.get("dl", 0) for t, i in json.load(open(os.path.join(a.data, "index.json"))).get("done", {}).items()}
    for tid, name, date, day, players, fetched in db.execute(
            f"SELECT id, name, date, day, players, fetched_at FROM tournaments WHERE multi_deck = 0 AND id IN ({q}) "
            "ORDER BY date DESC, id", tids).fetchall():
        rows = db.execute("""SELECT e.pid, e.name, e.place, e.w, e.l, e.t,
                                    (SELECT archetype FROM entry_decks d WHERE d.tid = e.tid AND d.pid = e.pid AND d.idx = 0)
                             FROM entries e WHERE e.tid = ? AND e.place IS NOT NULL ORDER BY e.place""", (tid,)).fetchall()
        top = [[arch, place] for pid, pn, place, w, l, t, arch in rows if place <= 8 and arch]
        first = next(({"deck": arch, "sc": f"{w}-{l}-{t}"} for pid, pn, place, w, l, t, arch in rows if place == 1), None)
        entries = []
        cut = max(EVENT_MIN, min(EVENT_MAX, round(players * EVENT_SHARE)), dl.get(tid, 0))
        for pid, pn, place, w, l, t, arch in rows:
            if place > cut:
                continue
            lists = lists_of(tid, pid)
            if lists:
                entries.append({"pid": pid, "pl": place, "place": f"{ordinal(place)} of {players}", "deck": arch,
                                "sc": f"{w}-{l}-{t}", "p": pn, "lists": lists})
        used.update(x[0] for x in top)
        used.update(e["deck"] for e in entries if e["deck"])
        if first and first["deck"]:
            used.add(first["deck"])
        # R13 (Nov 12, 2026): ts = start time, at = when the event reached the site (raw fetched_at; written once).
        events.append({"tid": tid, "name": name, "dt": day, "date": date, "ts": date, "at": fetched, "players": players,
                       "url": f"https://play.limitlesstcg.com/tournament/{tid}/standings",
                       "win": first, "top": top, "entries": entries})
    # Decks of the events that are not in the deck table: 1 recent list of the current set (for name, art, energy)
    # and the energy votes. Decks in the table use their list 1.
    shown = {d["id"] for d in decks}
    samples = {}
    for arch in sorted(used - shown):
        row = db.execute("""SELECT d.tid, d.pid FROM entry_decks d JOIN tournaments t ON t.id = d.tid
                            WHERE d.archetype = ? AND t.set_code = ? AND t.multi_deck = 0
                              AND EXISTS (SELECT 1 FROM decklists x WHERE x.tid = d.tid AND x.pid = d.pid)
                            ORDER BY t.date DESC LIMIT 1""", (arch, cur)).fetchone()
        samples[arch] = {"lists": lists_of(*row) if row else [], "votes": energy_votes(arch)}

    out = {
        "builtAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "set": cur, "setName": set_name, "format": "standard", "window": a.window,
        "summary": {"tournaments": summary[0], "players": summary[1] or 0, "matches": matches},
        "span": [summary[2], summary[3]] if summary[2] else None,
        "decks": decks,
        # R13c: the last time a tournament of the window (multi-deck too) was added = the largest fetched_at.
        "changedAt": db.execute(f"SELECT MAX(fetched_at) FROM tournaments WHERE id IN ({q})", tids).fetchone()[0],
        "events": events,
        "samples": samples,
    }
    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    with open(a.out, "w", encoding="utf8") as fh:
        json.dump(out, fh, ensure_ascii=False)
    no_rows = [d["id"] for d in decks if not d["rows"]]
    print(f"{a.out}: {sum(not d['more'] for d in decks)} decks + {sum(d['more'] for d in decks)} more decks "
          f"({sum(d['bc'] for d in decks)} with a below-the-cut row), {sum(len(d['rows']) for d in decks)} rows with a decklist; "
          f"{summary[0]} tournaments, {summary[1]} players, {matches} matches ({out['span']})")
    if no_rows:
        print(f"decks without a decklist yet: {len(no_rows)}: {', '.join(no_rows)}")


if __name__ == "__main__":
    main()
