"""Which set the site shows at a time T (request R15, Nov 13, 2026). Used by build_db.py (now) and export.py (24 h ago,
and the "first time in the list" search of R14).

Rule:
- The newest set (not a promo set) with a release day on or before T's day, as in scrape.py current_set().
- While that set has fewer than MIN_EVENTS complete tournaments on the site at T (fetched_at <= T), and the set
  before it has at least 1 tournament on the site, the site keeps showing the set before it, with its last 7 days
  (the window ends on the day before the new release). `next` then names the new set.
- start = the time from which the set is shown: its release (00:00 UTC), or the time its MIN_EVENTS-th tournament
  reached the site when the old set was held back. NEW (R14 nw) is not given in the first 72 h after start.
"""
from datetime import date, timedelta

MIN_EVENTS = 3


def released(sets, day):
    """Non-promo sets released on or before day, oldest first."""
    return sorted((s for s in sets if s.get("release") and s["release"] <= day and not s["code"].startswith("P-")),
                  key=lambda s: s["release"])


def shown_set(sets, tours, T):
    """sets: [{code, name, release}], tours: [(set_code, fetched_at)], T: ISO UTC time.
    Returns {"set", "name", "release", "ref", "next", "start"} or None when no set is released."""
    day = T[:10]
    rel = released(sets, day)
    if not rel:
        return None
    new = rel[-1]
    times = sorted(f for s, f in tours if s == new["code"] and f and f <= T)
    old = rel[-2] if len(rel) > 1 else None
    old_on_site = old is not None and any(s == old["code"] and f and f <= T for s, f in tours)
    if len(times) < MIN_EVENTS and old_on_site:
        last_old_day = (date.fromisoformat(new["release"]) - timedelta(days=1)).isoformat()
        return {"set": old["code"], "name": old["name"], "release": old["release"], "ref": min(day, last_old_day),
                "next": {"set": new["code"], "setName": new["name"], "release": new["release"]},
                "start": set_start(sets, tours, old)}
    return {"set": new["code"], "name": new["name"], "release": new["release"], "ref": day, "next": None,
            "start": set_start(sets, tours, new)}


def set_start(sets, tours, s):
    """When set s became the shown set: its release, or later when the set before it was held back (R15b)."""
    start = f"{s['release']}T00:00:00Z"
    before = [x for x in released(sets, "9999-12-31") if x["release"] < s["release"]]
    if not before:
        return start
    old = before[-1]
    times = sorted(f for c, f in tours if c == s["code"] and f)
    if len(times) < MIN_EVENTS:
        return start
    nth = times[MIN_EVENTS - 1]
    if any(c == old["code"] and f and f <= nth for c, f in tours):   # the old set was on the site: it was held back
        return max(start, nth)
    return start
