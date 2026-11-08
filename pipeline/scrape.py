"""Fetch completed Pokémon TCG Pocket tournaments from Limitless Play into data/ (spec: docs/DATA.md).

  python pipeline/scrape.py run [--since YYYY-MM-DD] [--max-requests N] [--data DIR]

Each run first reads the set list (pocket.limitlesstcg.com/cards). The current set = the newest set with a
release date of today or earlier. --since defaults to its release date. data/sets.json keeps the list.
Per new tournament: details, standings, every pairings round (Swiss + top cut) -> data/raw/YYYY/MM/<tid>.json.
Then decklists of the top entries -> data/decklists/<tid>.json ({pid: [{"i": builder code, "e": energy or null}]},
kept forever; lists stored in the old format without energy are fetched again).
The run stops at --max-requests; the next run continues. It exits with code 1 when a page does not parse.
"""
import argparse, glob, json, os, re, sys, time
from datetime import datetime, timezone

import requests
from bs4 import BeautifulSoup

BASE = "https://play.limitlesstcg.com"
SETS_URL = "https://pocket.limitlesstcg.com/cards"
UA = "pocket-meta-qr/0.1 (+https://github.com/samy-baladram/pocket-meta-qr)"
DELAY = 2.0                # seconds between requests
RETRY_WAIT = (10, 30)      # backoff on HTTP 429 / 5xx
LIST_SIZE = 150            # rows read from the completed-tournaments list
MIN_PLAYERS = 8
DECKLIST_TOP = 16          # decklists fetched per tournament (best places first)
SKIP_PHRASES = ("special rules", "special rule", "suspended cards", "suspended card")
RAW_VERSION = 1


class ParseError(Exception):
    pass


class Budget(Exception):
    pass


# ---------------------------------------------------------------- fetch

class Fetcher:
    def __init__(self, max_requests):
        self.max = max_requests
        self.count = 0
        self.last = 0.0
        self.s = requests.Session()
        self.s.headers["User-Agent"] = UA

    def get(self, path):
        """path: a path on BASE, or a full https URL (the set list is on another Limitless host)."""
        if self.count >= self.max:
            raise Budget()
        url = path if path.startswith("https://") else BASE + path
        for attempt in range(len(RETRY_WAIT) + 1):
            wait = self.last + DELAY - time.monotonic()
            if wait > 0:
                time.sleep(wait)
            self.count += 1
            self.last = time.monotonic()
            r = self.s.get(url, timeout=30)
            if r.status_code == 200:
                return r.text
            if r.status_code in (429, 500, 502, 503, 504) and attempt < len(RETRY_WAIT):
                print(f"  HTTP {r.status_code} on {path}; retry in {RETRY_WAIT[attempt]} s")
                time.sleep(RETRY_WAIT[attempt])
                continue
            raise RuntimeError(f"HTTP {r.status_code} on {path}")


# ---------------------------------------------------------------- parsers (pure: html -> data)

def soup(html):
    return BeautifulSoup(html, "html.parser")


def pid_of(href):
    m = re.search(r"/player/([^/?#]+)", href or "")
    return m.group(1) if m else None


def text(el):
    return el.get_text(" ", strip=True) if el else ""


SET_CODE = re.compile(r"^[A-Z]\d+[a-z]?$|^P-[A-Z]$")


def parse_sets(html):
    """Set list page -> [{code, name, release, cards}] in page order (newest first).
    Same method as update_sets_index() in tcg-deck-analyzer: the page text has 4 lines per set:
    name, code, release date ("29 Oct 26"), card count."""
    # "\n" between elements: works also when the HTML has no line breaks between the cells.
    lines = [ln.strip() for ln in soup(html).get_text("\n").split("\n") if ln.strip()]
    out, seen = [], set()
    for i in range(len(lines) - 3):
        name, code, date_s, count_s = lines[i:i + 4]
        if not (SET_CODE.match(code) and count_s.isdigit()) or code in seen:
            continue
        try:
            release = datetime.strptime(date_s, "%d %b %y").strftime("%Y-%m-%d")
        except ValueError:
            release = None
        seen.add(code)
        out.append({"code": code, "name": name, "release": release, "cards": int(count_s)})
    if not any(s["release"] for s in out):
        raise ParseError("sets: no set with a release date")
    return out


def current_set(sets, today):
    """Newest set released on or before today (YYYY-MM-DD). Promo sets (P-A, ...) do not count."""
    released = [s for s in sets if s["release"] and s["release"] <= today and not s["code"].startswith("P-")]
    if not released:
        raise ParseError("sets: no released set")
    return max(released, key=lambda s: s["release"])


def parse_list(html):
    """Completed-tournaments list -> [{id, date, name, organizer, players}] (newest first)."""
    tb = soup(html).find("table", class_="completed-tournaments")
    if not tb:
        raise ParseError("list: no table.completed-tournaments")
    out = []
    for tr in tb.find_all("tr"):
        if not tr.get("data-date"):
            continue
        a = tr.find("a", href=re.compile(r"^/tournament/[^/]+/"))
        if not a:
            continue
        out.append({
            "id": a["href"].split("/")[2],
            "date": tr["data-date"],
            "name": tr.get("data-name", "").strip(),
            "organizer": tr.get("data-organizer", "").strip(),
            "players": int(tr.get("data-players") or 0),
        })
    if not out:
        raise ParseError("list: 0 rows")
    return out


def parse_details(html):
    """Details page -> {date, multi_deck, skip}. skip = reason string or None."""
    s = soup(html)
    t = s.find(attrs={"data-time": True})
    date = None
    if t and t["data-time"].isdigit():
        date = datetime.fromtimestamp(int(t["data-time"]) / 1000, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    body = re.sub(r"\s+", " ", s.get_text(" ")).lower()
    skip = next((p for p in SKIP_PHRASES if p in body), None)
    return {"date": date, "multi_deck": "(multi-deck)" in body, "skip": skip}


RECORD = re.compile(r"(\d+)\s*-\s*(\d+)(?:\s*-\s*(\d+))?")


def parse_standings(html):
    """Standings table -> list of entries (spec 3.1). Columns are found by header name."""
    tb = soup(html).find("table", class_="striped")
    if not tb:
        raise ParseError("standings: no table.striped")
    rows = tb.find_all("tr")
    head = [text(c).lower() for c in rows[0].find_all(["th", "td"])]
    col = {name: head.index(name) for name in ("name", "points", "record", "deck", "list") if name in head}
    if not {"name", "record", "deck"} <= col.keys():
        raise ParseError(f"standings: unexpected header {head}")
    entries = []
    for tr in rows[1:]:
        tds = tr.find_all("td")
        if len(tds) < len(head):
            continue
        name_a = tds[col["name"]].find("a", href=True)
        pid = pid_of(name_a["href"]) if name_a else None
        if not pid:
            continue
        rec = text(tds[col["record"]])
        m = RECORD.search(rec)
        decks = []
        for a in tds[col["deck"]].find_all("a", href=True):
            dm = re.search(r"/metagame/([^/?#]+)", a["href"])
            if dm:
                decks.append(dm.group(1))
        has_list = bool("list" in col and tds[col["list"]].find("a", href=re.compile(r"/decklist")))
        pts = text(tds[col["points"]]) if "points" in col else ""
        entries.append({
            "pid": pid,
            "name": tr.get("data-name") or text(tds[col["name"]]),
            "country": tr.get("data-country"),
            "place": int(tr["data-placing"]) if (tr.get("data-placing") or "").isdigit() else None,
            "points": int(pts) if pts.isdigit() else None,
            "w": int(m.group(1)) if m else None,
            "l": int(m.group(2)) if m else None,
            "t": int(m.group(3) or 0) if m else None,
            "drop": "drop" in rec.lower(),
            "decks": decks,
            "has_list": has_list,
        })
    if not entries:
        raise ParseError("standings: 0 rows")
    return entries


def parse_round_links(html):
    """Any pairings page -> [(n, label)] for every round link, in order."""
    out, seen = [], set()
    for a in soup(html).find_all("a", href=re.compile(r"/pairings\?round=\d+")):
        n = int(re.search(r"round=(\d+)", a["href"]).group(1))
        if n not in seen:
            seen.add(n)
            out.append((n, text(a)))
    return sorted(out)


def _games(td):
    t = text(td)
    return int(t) if t.isdigit() else None


def parse_swiss(html):
    """Swiss round table -> matches. Returns None when the page has no Swiss table (top-cut page)."""
    tb = soup(html).find("table", attrs={"data-round": True})
    if not tb:
        return None
    out = []
    for tr in tb.find_all("tr", attrs={"data-match": True}):
        tds = tr.find_all("td")
        players = [td for td in tds if "player" in (td.get("class") or [])]
        games = [td for td in tds if "games" in (td.get("class") or [])]
        pids = []
        for td in players:
            a = td.find("a", href=True)
            pids.append(pid_of(a["href"]) if a else None)
        # Rows with 1 player ("bye", "missed round") have only the first player cell; the rest is text.
        tail = text(tds[-1]).lower() if tds else ""
        a_pid = pids[0] if pids else None
        b_pid = pids[1] if len(pids) > 1 else None
        if not a_pid:  # some special rows put the player in the 2nd cell without the "player" class
            for td in tds:
                lk = td.find("a", href=re.compile(r"/player/"))
                if lk:
                    a_pid = pid_of(lk["href"]); break
        w = tr.get("data-winner")
        special = None
        if b_pid is None:
            special = "bye" if tail == "bye" else ("missed" if "missed" in tail else "single")
        elif w == "-1":
            special = "double_loss"
        winner = {"0": "tie", "-1": None, None: None}.get(w, w)
        out.append({
            "id": tr["data-match"], "a": a_pid, "b": b_pid, "winner": winner,
            "ga": _games(games[0]) if len(games) > 0 else None,
            "gb": _games(games[1]) if len(games) > 1 else None,
            "special": special, "done": tr.get("data-completed") == "1",
        })
    return out


def parse_bracket(html):
    """Top-cut bracket page -> matches (with slot). Empty slots (no players yet) are skipped."""
    out = []
    for m in soup(html).select("div.bracket-match[data-match]"):
        ps = m.select(".live-bracket-player[data-id]")
        if not ps:
            continue
        pids, scores, winner = [], [], None
        for p in ps:
            pids.append(p["data-id"])
            num = re.search(r"(\d+)\s*$", text(p))
            scores.append(int(num.group(1)) if num else None)
            if "winner" in (p.get("class") or []):
                winner = p["data-id"]
        bye = len(pids) == 1 and "bye" in text(m).lower()
        out.append({
            "id": m["data-match"], "slot": m.get("data-slot"),
            "a": pids[0], "b": pids[1] if len(pids) > 1 else None,
            "winner": winner or (pids[0] if bye else None),
            "ga": scores[0], "gb": scores[1] if len(scores) > 1 else None,
            "special": "bye" if bye else None, "done": winner is not None or bye,
        })
    return out


BUILDER = re.compile(r"builder/\?i=")


def _code(a):
    return re.search(r"[?&]i=([^&#]+)", a["href"]).group(1)


def parse_decklist(html):
    """Decklist page -> [{"i": builder code, "e": energy list or None}], 1 per deck.
    Each deck is a div.pocket-dl with its builder link and, only in some events, a
    div.decklist-pocket-energy block (img alt = "Lightning", ...). "e": None = the page shows no energy."""
    s = soup(html)
    out, seen = [], set()
    for block in s.select("div.pocket-dl"):
        a = block.find("a", href=BUILDER)
        if not a or _code(a) in seen:
            continue
        en = block.select_one(".decklist-pocket-energy")
        energy = [img.get("alt", "").strip().lower() for img in en.find_all("img")] if en else None
        seen.add(_code(a))
        out.append({"i": _code(a), "e": energy})
    for a in s.find_all("a", href=BUILDER):  # fallback: builder links outside a div.pocket-dl
        if _code(a) not in seen:
            seen.add(_code(a))
            out.append({"i": _code(a), "e": None})
    return out


def is_current(lists_value):
    """True when a stored decklist value has the current format (objects with energy), not old code strings."""
    return isinstance(lists_value, list) and all(isinstance(x, dict) for x in lists_value)


def queue_old_format(data, index):
    """Add stored decklists in the old format (code strings, no energy) to the fetch queue again."""
    n = 0
    for dpath in sorted(glob.glob(os.path.join(data, "decklists", "*.json"))):
        tid = os.path.basename(dpath)[:-5]
        old = [pid for pid, v in load(dpath, {}).items() if not is_current(v)]
        if old:
            q = index["decklists"].setdefault(tid, [])
            q[:0] = [p for p in old if p not in q]
            n += len(old)
    return n


# ---------------------------------------------------------------- tournament assembly

def fetch_tournament(f, item, set_code):
    """Fetch and parse 1 tournament. Returns (raw dict, None) or (None, skip reason)."""
    tid = item["id"]
    det = parse_details(f.get(f"/tournament/{tid}/details"))
    if det["skip"]:
        return None, f"rules: {det['skip']}"
    entries = parse_standings(f.get(f"/tournament/{tid}/standings"))
    first = f.get(f"/tournament/{tid}/pairings?round=1")
    links = parse_round_links(first) or [(1, "1")]
    rounds = []
    for n, label in links:
        html = first if n == 1 else f.get(f"/tournament/{tid}/pairings?round={n}")
        swiss = parse_swiss(html)
        if swiss is not None:
            kind, matches = "swiss", swiss
        else:
            kind, matches = "top", parse_bracket(html)
        if not matches:
            raise ParseError(f"{tid}: 0 matches in round {n} ({label})")
        rounds.append({"n": n, "kind": kind, "name": label, "matches": matches})
    multi = det["multi_deck"] or any(len(e["decks"]) > 1 for e in entries)
    raw = {
        "v": RAW_VERSION, "id": tid, "name": item["name"], "organizer": item["organizer"],
        "date": det["date"] or item["date"], "format": "STANDARD", "set": set_code, "multi_deck": multi,
        "players": len(entries), "fetched_at": now(), "entries": entries, "rounds": rounds,
    }
    return raw, None


def check(raw):
    """Standings record vs pairings, per player. Returns a short list of differences (warnings only)."""
    res = {e["pid"]: [0, 0, 0] for e in raw["entries"]}
    for r in raw["rounds"]:
        for m in r["matches"]:
            if m["special"] or not m["b"]:
                if m["special"] == "bye" and m["a"] in res:
                    res[m["a"]][0] += 1  # Limitless counts a bye as a win in the record
                elif m["special"] in ("missed", "double_loss", "single"):
                    for p in (m["a"], m["b"]):
                        if p in res:
                            res[p][1] += 1
                continue
            for p, o in ((m["a"], m["b"]), (m["b"], m["a"])):
                if p not in res:
                    continue
                if m["winner"] == "tie":
                    res[p][2] += 1
                elif m["winner"] == p:
                    res[p][0] += 1
                elif m["winner"] == o:
                    res[p][1] += 1
    diff = [f"{e['pid']} {e['w']}-{e['l']}-{e['t']} vs {'-'.join(map(str, res[e['pid']]))}"
            for e in raw["entries"] if e["w"] is not None and [e["w"], e["l"], e["t"]] != res[e["pid"]]]
    return diff


# ---------------------------------------------------------------- run

def now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load(path, default):
    if os.path.exists(path):
        with open(path, encoding="utf8") as fh:
            return json.load(fh)
    return default


def save(path, obj, indent=None):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf8") as fh:
        json.dump(obj, fh, ensure_ascii=False, indent=indent, separators=None if indent else (",", ":"))
        fh.write("\n")
    os.replace(tmp, path)


def run(args):
    data = args.data
    ipath = os.path.join(data, "index.json")
    index = load(ipath, {"done": {}, "skipped": {}, "decklists": {}})
    f = Fetcher(args.max_requests)
    stats = {"new": 0, "skipped": 0, "decklists": 0, "decks": 0, "with_energy": 0, "warnings": 0}
    try:
        sets = parse_sets(f.get(SETS_URL))
        cur = current_set(sets, now()[:10])
        save(os.path.join(data, "sets.json"), {"updated": now(), "current": cur["code"], "sets": sets}, indent=1)
        since = args.since or cur["release"]
        print(f"current set: {cur['code']} {cur['name']} (released {cur['release']}); since {since}")
        items = parse_list(f.get(f"/tournaments/completed?game=POCKET&format=STANDARD&platform=all&type=all&show={LIST_SIZE}"))
        todo = [it for it in reversed(items)  # oldest first, so a capped run leaves the newest for later
                if it["id"] not in index["done"] and it["id"] not in index["skipped"]
                and it["date"][:10] >= since]
        print(f"list: {len(items)} tournaments, {len(todo)} new since {since}")
        if items and items[-1]["date"][:10] > since:
            print(f"  warning: the list starts at {items[-1]['date'][:10]}, after {since}; raise LIST_SIZE to reach older events")
        for it in todo:
            if it["players"] < MIN_PLAYERS:
                index["skipped"][it["id"]] = f"players: {it['players']}"
                stats["skipped"] += 1
                continue
            # Set = the newest set released on or before the event day (events of an older window keep their set).
            ev_set = current_set(sets, it["date"][:10])["code"]
            raw, reason = fetch_tournament(f, it, ev_set)
            if reason:
                index["skipped"][it["id"]] = reason
                stats["skipped"] += 1
                print(f"  skip {it['id']} ({reason}): {it['name']}")
                continue
            diff = check(raw)
            if diff:
                stats["warnings"] += 1
                print(f"  warning {it['id']}: {len(diff)} records differ from pairings, e.g. {diff[:3]}")
            path = os.path.join(data, "raw", raw["date"][:4], raw["date"][5:7], f"{raw['id']}.json")
            save(path, raw)
            ranked = sorted((e for e in raw["entries"] if e["has_list"] and e["place"] is not None),
                            key=lambda e: e["place"])[:DECKLIST_TOP]
            index["done"][raw["id"]] = {"date": raw["date"], "path": os.path.relpath(path, data)}
            index["decklists"][raw["id"]] = [e["pid"] for e in ranked]  # still to fetch
            save(ipath, index, indent=1)
            stats["new"] += 1
            print(f"  ok {raw['id']} {raw['date'][:10]} {raw['players']}p {len(raw['rounds'])} rounds"
                  f"{' multi-deck' if raw['multi_deck'] else ''}: {raw['name']}")
        # Decklists: oldest tournaments first, best places first. Old-format lists (no energy) are fetched again.
        n_old = queue_old_format(data, index)
        if n_old:
            print(f"{n_old} stored decklists have the old format (no energy); fetching them again")
        for tid in sorted(index["decklists"], key=lambda t: index["done"].get(t, {}).get("date", "")):
            dpath = os.path.join(data, "decklists", f"{tid}.json")
            lists = load(dpath, {})
            for pid in list(index["decklists"][tid]):
                if not is_current(lists.get(pid)):
                    decks = parse_decklist(f.get(f"/tournament/{tid}/player/{pid}/decklist"))
                    if not decks:
                        print(f"  warning: no builder code for {tid}/{pid}")
                    lists[pid] = decks
                    stats["decklists"] += 1
                    stats["with_energy"] += sum(1 for d in decks if d["e"])
                    stats["decks"] += len(decks)
                    save(dpath, lists, indent=0)
                index["decklists"][tid].remove(pid)
            del index["decklists"][tid]
            save(ipath, index, indent=1)
    except Budget:
        print(f"request cap reached ({args.max_requests}); the next run continues")
    finally:
        save(ipath, index, indent=1)
        left = sum(len(v) for v in index["decklists"].values())
        print(f"requests: {f.count}, new tournaments: {stats['new']}, skipped: {stats['skipped']}, "
              f"decklists: {stats['decklists']} pages / {stats['decks']} decks, {stats['with_energy']} with energy "
              f"(waiting: {left}), record warnings: {stats['warnings']}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["run"])
    ap.add_argument("--since", default=None, help="first tournament date (YYYY-MM-DD); default: release of the current set")
    ap.add_argument("--max-requests", type=int, default=400)
    ap.add_argument("--data", default="data")
    args = ap.parse_args()
    try:
        run(args)
    except ParseError as e:
        print(f"PARSE ERROR: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
