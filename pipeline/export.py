"""Export the page-build input from data/meta.db -> build/input.json (read by pipeline/build.mjs).

  python pipeline/export.py [--data DIR] [--out FILE] [--window 7d] [--rows 0]

Window: last 7 days by default (decision Nov 9, 2026: the meta changes fast); only tournaments of the current
        set, so in the first 7 days of a set the window starts at the set release.
Decks : archetypes with share >= MIN_SHARE in the window (max MAX_DECKS), most players first.
Rows  : per deck, all its finishes in the window (--rows 0) or the best N, in single-deck tournaments that have a
        decklist:
        best place relative to the event size first (place / players: 3rd of 547 before 1st of 12),
        then the better place, then the newer event.
        Multi-deck tournaments are not used for the shown lists (same rule as the win rate, docs/DATA.md 4.4).
"""
import argparse, json, os, sqlite3
from datetime import datetime, timezone

MIN_SHARE = 0.5   # % of all decks in the window
MAX_DECKS = 40
MAX_ROWS = 0      # finishes read per deck; 0 = all (build.mjs keeps up to 10 distinct lists from them)


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

    decks = []
    for arch, players, share, w, l, t, win in db.execute(
            "SELECT archetype, players, share, w, l, t, win_rate FROM archetype_stats "
            "WHERE window = ? AND share >= ? ORDER BY players DESC, archetype LIMIT ?", (a.window, MIN_SHARE, MAX_DECKS)):
        rows = []
        for tid, pid, place, ew, el, et, ev, size, day in db.execute(f"""
                SELECT e.tid, e.pid, e.place, e.w, e.l, e.t, t.name, t.players, t.day
                FROM entry_decks d JOIN entries e USING (tid, pid) JOIN tournaments t ON t.id = e.tid
                WHERE d.archetype = ? AND t.multi_deck = 0 AND e.place IS NOT NULL AND d.tid IN ({q})
                  AND EXISTS (SELECT 1 FROM decklists x WHERE x.tid = e.tid AND x.pid = e.pid)
                ORDER BY CAST(e.place AS REAL) / t.players, e.place, t.date DESC LIMIT ?""", [arch, *tids, a.rows or -1]):
            lists = []
            for idx, energy in db.execute("SELECT idx, energy FROM decklists WHERE tid = ? AND pid = ? ORDER BY idx", (tid, pid)):
                cards = [list(r) for r in db.execute(
                    "SELECT count, set_code, num FROM decklist_cards WHERE tid = ? AND pid = ? AND idx = ?", (tid, pid, idx))]
                lists.append({"cards": cards, "energy": energy.split(",") if energy else None})
            rows.append({"key": f"{tid}/{pid}", "ev": ev, "pl": f"{ordinal(place)} of {size}",
                         "sc": f"{ew}-{el}-{et}", "dt": day, "lists": lists})
        decks.append({"id": arch, "count": players, "share": round(share, 2), "w": w, "l": l, "t": t,
                      "win": round(win, 2) if win is not None else None, "rows": rows})

    out = {
        "builtAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "set": cur, "setName": set_name, "format": "standard", "window": a.window,
        "summary": {"tournaments": summary[0], "players": summary[1] or 0, "matches": matches},
        "span": [summary[2], summary[3]] if summary[2] else None,
        "decks": decks,
    }
    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    with open(a.out, "w", encoding="utf8") as fh:
        json.dump(out, fh, ensure_ascii=False)
    no_rows = [d["id"] for d in decks if not d["rows"]]
    print(f"{a.out}: {len(decks)} decks, {sum(len(d['rows']) for d in decks)} rows with a decklist; "
          f"{summary[0]} tournaments, {summary[1]} players, {matches} matches ({out['span']})")
    if no_rows:
        print(f"decks without a decklist yet: {len(no_rows)}: {', '.join(no_rows)}")


if __name__ == "__main__":
    main()
