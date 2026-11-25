#!/usr/bin/env python3
"""Sort every translatable text (and every code change) into a group, for maintenance.

    python3 i18n/groups.py <page.html>        # the preview page (after preview/i18n_patch.py)

- Texts: writes i18n/groups.json = {"groups": {group: description}, "ids": {text id: group}}.
  All languages share the same text ids, so one file covers all 8 catalogs.
- Code changes: adds "group" to each change in i18n/<lang>.code.json that has none.
- A group that is already set is kept, so a hand fix in groups.json (or in a code change) stays.
  Only new texts / changes get a group from the rules below. An entry stays in the file while a catalog has it.

How a group is chosen (first match wins):
  1. the page section or function the text is in (ANCHOR below), with fixes for tips, messages and shared words;
  2. "other" when nothing matches (fix it by hand in groups.json).
"""
import bisect, json, re, subprocess, sys, tempfile, os
from pathlib import Path

HERE = Path(__file__).resolve().parent
LANGS = ["de", "es", "fr", "it", "ja", "ko", "pt", "zh"]

GROUPS = {
    "faq":      "About & FAQ page",
    "tooltips": "ⓘ popovers and info sheets (long explaining texts)",
    "shell":    "header, tabs, footer, language and theme menu, live status, Add to Home Screen, share and QR save",
    "search":   "search box, filter sheet, suggestions",
    "decks":    "Meta decks: Top 10, deck rows, deck sheet (stats, matchups, trend, cards), lists and swaps, badges",
    "events":   "Latest events: list, event sheet, winners, results",
    "packs":    "Packs to Open and the card sheet / card pages",
    "limited":  "Limited Battle banner, page and rules (seasonal: check at each new event)",
    "messages": "loading, empty and error messages",
    "shared":   "words several areas use: periods (this week, last N days), months, 'N ago', counters",
    "seo":      "page titles and descriptions (search results, link previews)",
    "whatsnew": "What's new entries",
    "grammar":  "code changes only: numbers, dates, plurals, ordinals, word order",
    "other":    "not sorted yet: set a group by hand",
}

# page section id / function name -> group (the nearest one before the text in the page)
ANCHOR = {
    "abv": "faq", "nwl": "whatsnew", "nwv": "whatsnew", "footer": "shell",
    # shell
    "tabs": "shell", "renderLive": "shell", "langPop": "shell", "k": "shell", "pbd": "shell", "checkNew": "shell",
    "shareRow": "shell", "shQR": "shell", "saveQR": "shell", "qsHTML": "shell", "shareLink": "shell",
    "QR: PNG on the page (long": "shell", "renderShChip": "shell", "openShared": "shell", "shHead": "shell",
    "shCardBlob": "shell", "The shared": "shell", "renderSince": "shell", "newPill": "shell", "iPop": "shell",
    "winChip": "shell", "setTab": "shell",
    # search
    "setupFilter": "search", "applyFilter": "search", "renderSug": "search", "filt": "search", "fsug": "search",
    "fen": "search", "fdk": "search", "fevk": "search", "filtMode": "search", "renderEvSug": "search",
    "pkSug": "search", "pkFiltUI": "search", "renderLbSug": "search",
    # decks
    "loadExtra": "decks", "lineSvg": "decks", "renderT10": "decks", "setPodFlat": "decks", "openResult": "decks",
    "rbTip": "decks", "rbHTML": "decks", "toggleAlts": "decks", "slideBody": "decks", "dkV2": "decks",
    "openCard": "decks", "shCards": "decks", "makeCard": "decks", "openQRSheet": "decks", "swapPanel": "decks",
    "podiumHTML": "decks", "t10": "decks", "t10Car": "decks", "t10Show": "decks", "lsh": "decks",
    "deckGo": "decks", "renderSetNote": "decks", "wireCarousel": "decks",
    # events
    "evV2": "events", "evsh": "events", "evSheet": "events", "renderEvents": "events", "evOpenId": "events",
    "evDeck": "events", "evl": "events", "openAt": "events",
    # packs and cards
    "renderPacks": "packs", "pkBuild": "packs", "packBox": "packs", "pkApply": "packs", "pkPick": "packs",
    "pkList": "packs", "cardDlg": "packs", "cdh": "packs", "cdhShow": "packs", "cardGo": "packs", "pkCar": "packs",
    "setMV": "packs", "pkv": "packs", "cPop": "packs",
    # Limited Battle
    "renderLB": "limited", "lbTab": "limited", "lbApply": "limited", "lbl": "limited", "evWide": "limited",
    # search results and link previews
    "rtHead": "seo", "PGV": "seo", "-": "seo",
}
AREAS = {"decks", "events", "packs", "limited", "other"}
MESSAGE = re.compile(r"couldn.t|could not|not available|try again|is broken|no events|no decks match|no lists stored|"
                     r"no public lists|isn.t in any|no (deck|card|event)s? (or \w+ )?found|^nothing|not ready", re.I)
SHARED = re.compile(r"^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|of|Yesterday|Today|just now|Loading(…|&hellip;))$|"
                    r"\bago\b|^(this week|This week|in the last \{0\} days|Last \{0\} days|since the \{0\} release|"
                    r"Since the \{0\} release)$")
GRAMMAR = re.compile(r"^(numbers?|plural|dates?|ordinals?|time ago|month names|counters?|date range|dates and times|"
                     r"word order|energy names)\b", re.I)

MARK = re.compile(r'\bfunction\s+(\w+)\s*\(|<(?:section|div|dialog|header|nav|aside|main|template)[^>]*\bid="([\w-]+)"'
                  r"|(<footer)\b|^\s*//\s*----?\s*([^\n-]{3,40})", re.M)


def anchors(page):
    marks = []
    for m in MARK.finditer(page):
        g = next(x for x in m.groups() if x)
        marks.append((m.start(), "footer" if g == "<footer" else g.strip()))
    return [p for p, _ in marks], [n for _, n in marks]


def pick(pos, names, at, en):
    i = bisect.bisect_right(pos, at) - 1
    a = names[i] if i >= 0 else "-"
    g = ANCHOR.get(a, "other")
    if g in ("faq", "whatsnew", "seo"): return g
    plain = re.sub(r"\{t?\d+!?\}|&\w+;", "", en)
    if MESSAGE.search(en) and len(plain) < 90: return "messages"
    if SHARED.search(en.strip()) and len(plain) < 30: return "shared"
    if a not in ("checkNew", "footer") and len(plain) >= 60 and re.search(r"[.!?:]\s|[.!?]$", plain): return "tooltips"
    return g


NOTE = [(r"^time\b", "grammar"), (r"^label: (lists|cards swapped|card full|previous list|next list|deck stats)", "decks"),
        (r"^deck row", "decks"), (r"^Live:", "shell"), (r"^loading", "messages"), (r"^card filter", "search"), (r"^label:", "shell")]


def by_note(note):
    """A code change whose code is not found as one piece in the page: sort it by its note."""
    for rx, g in NOTE:
        if re.search(rx, note): return g
    return "other"


def main():
    page_path = sys.argv[1]
    page = Path(page_path).read_text(encoding="utf-8")
    with tempfile.TemporaryDirectory() as t:
        out = os.path.join(t, "en.json")
        subprocess.run(["node", str(HERE / "extract.mjs"), page_path, out], check=True, capture_output=True)
        cat = {x["id"]: x for x in json.loads(Path(out).read_text(encoding="utf-8"))}
    pos, names = anchors(page)
    used = set()
    for L in LANGS:
        used |= set(json.loads((HERE / f"{L}.json").read_text(encoding="utf-8")))
    gf = HERE / "groups.json"
    old = json.loads(gf.read_text(encoding="utf-8"))["ids"] if gf.exists() else {}
    ids, new = {}, 0
    for k in sorted(used):
        if k not in cat:  # English changed: keep the old group, so the build reports where the old text was
            if k in old: ids[k] = old[k]
            continue
        if k in old: ids[k] = old[k]; continue
        ids[k] = pick(pos, names, cat[k]["at"], cat[k]["en"]); new += 1
    gf.write_text(json.dumps({"_": "Group of each text id (all languages share the ids). Made by i18n/groups.py; "
                              "hand fixes are kept. See i18n/README.md, section Groups.",
                              "groups": GROUPS, "ids": ids}, ensure_ascii=False, indent=0) + "\n", encoding="utf-8")
    # code changes
    nc = 0
    for L in LANGS:
        f = HERE / f"{L}.code.json"; raw = f.read_text(encoding="utf-8"); c = json.loads(raw)
        for p in c["patches"]:
            if p.get("group"): continue
            if GRAMMAR.search(p.get("note", "")): p["group"] = "grammar"
            else:
                at = page.find(p["find"])
                p["group"] = pick(pos, names, at, p["find"]) if at >= 0 else "other"
                if p["group"] == "other": p["group"] = by_note(p.get("note", ""))
                if p["group"] in ("messages", "shared"): p["group"] = "grammar" if p["group"] == "shared" else p["group"]
            nc += 1
        f.write_text(json.dumps(c, ensure_ascii=False, indent=0 if raw.startswith('{\n"') else 1) + "\n", encoding="utf-8")
    from collections import Counter
    print(f"groups: {len(ids)} texts ({new} new), {nc} code changes sorted:",
          ", ".join(f"{g} {n}" for g, n in Counter(ids.values()).most_common()))


if __name__ == "__main__":
    main()
