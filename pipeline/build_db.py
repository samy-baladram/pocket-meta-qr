"""Build data/meta.db (SQLite) from data/raw/ and data/decklists/ (spec: docs/DATA.md, section 4).

  python pipeline/build_db.py [--data DIR] [--ref YYYY-MM-DD] [--top N]

The database is rebuilt from zero each time: the raw files are the source of truth, so a parser or
definition fix needs only a new build. The file is not committed (.gitignore).

Base tables : sets, tournaments, entries, entry_decks, matches, decklists, decklist_cards
Computed    : archetype_stats (window, archetype, ...), matchups (window, deck, opp, ...)
Windows     : "set" (tournaments of the current set), "7d" and "3d" (last N days up to --ref, current set only)
"""
import argparse, glob, json, os, sqlite3, sys
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

SCHEMA = """
CREATE TABLE sets (code TEXT PRIMARY KEY, name TEXT, release TEXT, cards INTEGER, current INTEGER);
CREATE TABLE tournaments (
  id TEXT PRIMARY KEY, name TEXT, organizer TEXT, date TEXT, day TEXT, set_code TEXT,
  multi_deck INTEGER, players INTEGER, swiss_rounds INTEGER, top_cut INTEGER, record_diffs INTEGER);
CREATE TABLE entries (
  tid TEXT, pid TEXT, name TEXT, country TEXT, place INTEGER, points INTEGER,
  w INTEGER, l INTEGER, t INTEGER, drop_ INTEGER, has_list INTEGER, n_decks INTEGER, made_top INTEGER,
  PRIMARY KEY (tid, pid));
CREATE TABLE entry_decks (tid TEXT, pid TEXT, idx INTEGER, archetype TEXT, PRIMARY KEY (tid, pid, idx));
CREATE TABLE matches (
  tid TEXT, round INTEGER, kind TEXT, mid TEXT, slot TEXT, a TEXT, b TEXT, winner TEXT,
  ga INTEGER, gb INTEGER, special TEXT, PRIMARY KEY (tid, mid));
CREATE TABLE decklists (
  tid TEXT, pid TEXT, idx INTEGER, code TEXT, cards INTEGER,
  energy TEXT,  -- comma list as shown by Limitless ("lightning,darkness"); NULL = the page showed no energy
  PRIMARY KEY (tid, pid, idx));
CREATE TABLE decklist_cards (tid TEXT, pid TEXT, idx INTEGER, count INTEGER, set_code TEXT, num INTEGER);
CREATE TABLE archetype_stats (
  window TEXT, archetype TEXT, players INTEGER, share REAL, tournaments INTEGER, top_cut INTEGER,
  w INTEGER, l INTEGER, t INTEGER, win_rate REAL, mirrors INTEGER, PRIMARY KEY (window, archetype));
CREATE TABLE matchups (
  window TEXT, deck TEXT, opp TEXT, w INTEGER, l INTEGER, t INTEGER, win_rate REAL,
  PRIMARY KEY (window, deck, opp));
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
CREATE INDEX entry_decks_arch ON entry_decks (archetype);
CREATE INDEX matches_a ON matches (tid, a);
CREATE INDEX matches_b ON matches (tid, b);
"""


def parse_builder(code):
    """Limitless deck-builder "i=" code -> [(count, set, num)]. Same rule as common.mjs parseBuilderParam():
    "3" header, then per card count(1) setLen(1) numLen(1) set num; "P0A" means "P-A"."""
    s, out = code[1:] if code.startswith("3") else code, []
    while s:
        c, sl, nl = int(s[0]), int(s[1]), int(s[2])
        st = s[3:3 + sl]
        st = "P-" + st[2:] if st.startswith("P0") else st
        out.append((c, st, int(s[3 + sl:3 + sl + nl])))
        s = s[3 + sl + nl:]
    return out


def win_rate(w, l, t):
    n = w + l + t
    return round((w + 0.5 * t) / n * 100, 2) if n else None


def record_check(raw):
    """Number of players whose standings record differs from the record counted from the pairings
    (a bye counts as a win; missed round and double loss count as a loss, as on Limitless)."""
    res = {e["pid"]: [0, 0, 0] for e in raw["entries"]}
    for r in raw["rounds"]:
        for m in r["matches"]:
            sp = m["special"]
            if sp == "bye":
                if m["a"] in res: res[m["a"]][0] += 1
                continue
            if sp in ("missed", "double_loss", "single"):
                for p in (m["a"], m["b"]):
                    if p in res: res[p][1] += 1
                continue
            for p, o in ((m["a"], m["b"]), (m["b"], m["a"])):
                if p not in res: continue
                if m["winner"] == "tie": res[p][2] += 1
                elif m["winner"] == p: res[p][0] += 1
                elif m["winner"] == o: res[p][1] += 1
    return sum(1 for e in raw["entries"] if e["w"] is not None and [e["w"], e["l"], e["t"]] != res[e["pid"]])


def load_raw(db, data):
    files = sorted(glob.glob(os.path.join(data, "raw", "*", "*", "*.json")))
    for f in files:
        raw = json.load(open(f, encoding="utf8"))
        tid = raw["id"]
        top_players = {p for r in raw["rounds"] if r["kind"] == "top" for m in r["matches"] for p in (m["a"], m["b"]) if p}
        diffs = record_check(raw)
        db.execute("INSERT INTO tournaments VALUES (?,?,?,?,?,?,?,?,?,?,?)", (
            tid, raw["name"], raw["organizer"], raw["date"], raw["date"][:10], raw.get("set"),
            int(raw["multi_deck"]), raw["players"],
            sum(r["kind"] == "swiss" for r in raw["rounds"]), int(any(r["kind"] == "top" for r in raw["rounds"])), diffs))
        for e in raw["entries"]:
            db.execute("INSERT INTO entries VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", (
                tid, e["pid"], e["name"], e["country"], e["place"], e["points"], e["w"], e["l"], e["t"],
                int(e["drop"]), int(e["has_list"]), len(e["decks"]), int(e["pid"] in top_players)))
            for i, a in enumerate(e["decks"]):
                db.execute("INSERT INTO entry_decks VALUES (?,?,?,?)", (tid, e["pid"], i, a))
        for r in raw["rounds"]:
            for m in r["matches"]:
                db.execute("INSERT OR IGNORE INTO matches VALUES (?,?,?,?,?,?,?,?,?,?,?)", (
                    tid, r["n"], r["kind"], m["id"], m.get("slot"), m["a"], m["b"], m["winner"],
                    m["ga"], m["gb"], m["special"]))
    for f in sorted(glob.glob(os.path.join(data, "decklists", "*.json"))):
        tid = os.path.basename(f)[:-5]
        for pid, decks in json.load(open(f, encoding="utf8")).items():
            for i, d in enumerate(decks):
                # Current format {"i": code, "e": [..] or null}; old format: the code string only (no energy).
                code, energy = (d["i"], d.get("e")) if isinstance(d, dict) else (d, None)
                try:
                    cards = parse_builder(code)
                except (ValueError, IndexError):
                    print(f"  warning: bad builder code {tid}/{pid}: {code[:40]}")
                    continue
                db.execute("INSERT INTO decklists VALUES (?,?,?,?,?,?)", (tid, pid, i, code, sum(c[0] for c in cards),
                                                                    ",".join(energy) if energy else None))
                db.executemany("INSERT INTO decklist_cards VALUES (?,?,?,?,?,?)",
                               [(tid, pid, i, c, s, n) for c, s, n in cards])
    return len(files)


def compute(db, window, tids):
    """archetype_stats + matchups for 1 window (a set of tournament ids). Definitions: docs/DATA.md 4.2-4.4."""
    if not tids:
        return 0
    q = ",".join("?" * len(tids))
    tids = list(tids)
    # 4.2 Share and players: every deck of an entry counts 1 (multi-deck entries count for each deck).
    players, events, top = defaultdict(int), defaultdict(set), defaultdict(int)
    for tid, arch, made_top in db.execute(
            f"SELECT d.tid, d.archetype, e.made_top FROM entry_decks d JOIN entries e USING (tid, pid) WHERE d.tid IN ({q})", tids):
        players[arch] += 1
        events[arch].add(tid)
        top[arch] += made_top
    total = sum(players.values())
    # 4.3 Win rate and matchups: single-deck tournaments only, real matches only (no bye/missed/double loss).
    deck = {}
    for tid, pid, arch in db.execute(
            f"""SELECT d.tid, d.pid, d.archetype FROM entry_decks d JOIN tournaments t ON t.id = d.tid
                WHERE t.multi_deck = 0 AND d.tid IN ({q})""", tids):
        deck[(tid, pid)] = arch
    rec = defaultdict(lambda: [0, 0, 0])                  # archetype -> W L T (mirrors excluded)
    mu = defaultdict(lambda: [0, 0, 0])                   # (deck, opp) -> W L T (mirrors included)
    mirrors = defaultdict(int)
    for tid, a, b, winner in db.execute(
            f"""SELECT m.tid, m.a, m.b, m.winner FROM matches m JOIN tournaments t ON t.id = m.tid
                WHERE t.multi_deck = 0 AND m.special IS NULL AND m.b IS NOT NULL AND m.winner IS NOT NULL
                AND m.tid IN ({q})""", tids):
        da, dbk = deck.get((tid, a)), deck.get((tid, b))
        for p, dp, do, o in ((a, da, dbk, b), (b, dbk, da, a)):
            if not dp:
                continue
            k = 0 if winner == p else (1 if winner == o else 2)
            if dp == do:
                if p == a: mirrors[dp] += 1
            else:
                rec[dp][k] += 1                           # opponent deck may be unknown: still a real match
            if do:
                mu[(dp, do)][k] += 1
    rows = []
    for arch, n in players.items():
        w, l, t = rec[arch]
        rows.append((window, arch, n, round(n / total * 100, 3), len(events[arch]), top[arch], w, l, t,
                     win_rate(w, l, t), mirrors[arch]))
    db.executemany("INSERT INTO archetype_stats VALUES (?,?,?,?,?,?,?,?,?,?,?)", rows)
    db.executemany("INSERT INTO matchups VALUES (?,?,?,?,?,?,?)",
                   [(window, d, o, w, l, t, win_rate(w, l, t)) for (d, o), (w, l, t) in mu.items()])
    return len(rows)


def build(data, ref, top):
    path = os.path.join(data, "meta.db")
    tmp = path + ".tmp"
    if os.path.exists(tmp):
        os.remove(tmp)
    db = sqlite3.connect(tmp)
    db.executescript(SCHEMA)
    sets = json.load(open(os.path.join(data, "sets.json"), encoding="utf8")) if os.path.exists(os.path.join(data, "sets.json")) else {"sets": [], "current": None}
    cur = sets.get("current")
    db.executemany("INSERT INTO sets VALUES (?,?,?,?,?)",
                   [(s["code"], s["name"], s["release"], s["cards"], int(s["code"] == cur)) for s in sets["sets"]])
    n = load_raw(db, data)
    cur_tids = {r[0]: r[1] for r in db.execute("SELECT id, day FROM tournaments WHERE set_code = ?", (cur,))}
    windows = {"set": set(cur_tids)}
    for days in (7, 3):
        start = (date.fromisoformat(ref) - timedelta(days=days - 1)).isoformat()
        windows[f"{days}d"] = {t for t, d in cur_tids.items() if start <= d <= ref}
    for w, tids in windows.items():
        compute(db, w, tids)
    built = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    db.executemany("INSERT INTO meta VALUES (?,?)", [("built_at", built), ("ref", ref), ("current_set", cur or "")] +
                   [(f"tournaments_{w}", str(len(t))) for w, t in windows.items()])
    db.commit()
    report(db, cur, windows, top)
    db.close()
    os.replace(tmp, path)
    print(f"wrote {path} ({os.path.getsize(path) // 1024} KB) from {n} tournament files")


def report(db, cur, windows, top):
    one = lambda sql, *a: db.execute(sql, a).fetchone()
    t = one("SELECT COUNT(*), SUM(players), SUM(multi_deck), SUM(record_diffs > 0), MIN(day), MAX(day) FROM tournaments WHERE set_code = ?", cur)
    print(f"set {cur}: {t[0]} tournaments ({t[2] or 0} multi-deck), {t[1] or 0} players, {t[4]} .. {t[5]}")
    print(f"window sizes: " + ", ".join(f"{w} {len(v)}" for w, v in windows.items()))
    bad = db.execute("SELECT id, record_diffs, players FROM tournaments WHERE record_diffs > 0 ORDER BY record_diffs DESC LIMIT 5").fetchall()
    print(f"record check: {t[3] or 0} tournaments with differences" + (f", worst: {bad}" if bad else ""))
    dl = one("SELECT COUNT(*), SUM(cards = 20), SUM(energy IS NOT NULL) FROM decklists")
    print(f"decklists: {dl[0]} lists, {dl[1] or 0} with 20 cards, {dl[2] or 0} with energy")
    s = one("SELECT ROUND(SUM(share), 2) FROM archetype_stats WHERE window = 'set'")
    print(f"share sum (set window): {s[0]} %")
    print(f"\ntop {top} archetypes, set window:")
    print(f"{'#':>2} {'archetype':44} {'players':>7} {'share':>6} {'events':>6} {'top':>4} {'W-L-T':>11} {'win %':>6} {'mirror':>6}")
    for i, r in enumerate(db.execute(
            "SELECT archetype, players, share, tournaments, top_cut, w, l, t, win_rate, mirrors FROM archetype_stats "
            "WHERE window = 'set' ORDER BY players DESC LIMIT ?", (top,)), 1):
        wr = f"{r[8]:.1f}" if r[8] is not None else "-"
        print(f"{i:>2} {r[0][:44]:44} {r[1]:>7} {r[2]:>5.2f}% {r[3]:>6} {r[4]:>4} {f'{r[5]}-{r[6]}-{r[7]}':>11} {wr:>6} {r[9]:>6}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="data")
    ap.add_argument("--ref", default=datetime.now(timezone.utc).strftime("%Y-%m-%d"), help="last day of the 7d/3d windows")
    ap.add_argument("--top", type=int, default=15, help="rows in the printed report")
    a = ap.parse_args()
    build(a.data, a.ref, a.top)


if __name__ == "__main__":
    sys.exit(main())
