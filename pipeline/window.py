"""Adaptive data window (request R25, Nov 15, 2026; user decisions Nov 15). Used by build_db.py, export.py, scrape.py.

For a build day D (UTC):
1. FLOOR = the release day of the newest set with release <= D that has at least 1 finished single-deck tournament on
   or after its release (user, Nov 15: on a new set day the old set's window stays until the first new-set event is on
   the site, so the deck table is never empty). The window never starts before FLOOR.
2. Try WINDOW_STEPS days (D and the days before it, not before FLOOR); take the first length whose window has at least
   MIN_PLAYERS players (players of single-deck tournaments). None: the last step.
   Stable day (pipeline chat, Nov 15): the players of a length are counted on the same length of COMPLETE days, ending
   the day before D (D itself is still filling up). So the length is fixed for the whole day and changes only at
   midnight UTC; without this, the window would widen every night (D starts empty) and shrink again in the day.
3. Hysteresis: a step shorter than the day before's step needs MIN_PLAYERS * SHORTER_FACTOR players.
   The day before's step is computed by the same rule (a chain from FLOOR), so no stored state is needed.
"""
from datetime import date, timedelta

WINDOW_STEPS = [7, 10, 14]
MIN_PLAYERS = 1500        # R25: user decision Nov 15 (calibration: median 19 decks with 30+ players at 1,500)
SHORTER_FACTOR = 1.2      # R25 hysteresis: 1,800 players to get shorter
BIGE_SHARE = 25           # R25: report the biggest event when it has more than this % of the window's players


def _d(x):
    return x if isinstance(x, date) else date.fromisoformat(x[:10])


def floor_for(day, tourns, releases):
    """tourns: [(tid, day, players, multi)]; releases: [release day, ...] of the sets (any order)."""
    day = _d(day)
    for rel in sorted({_d(r) for r in releases if r}, reverse=True):
        if rel > day:
            continue
        if any(not m and rel <= _d(t) <= day for _, t, _, m in tourns):
            return rel
    return None


def _players(tourns, lo, hi):
    return sum(p or 0 for _, t, p, m in tourns if not m and lo <= _d(t) <= hi)


def window_for(day, tourns, releases):
    """The window of build day `day` -> dict(start, end, wd, step, wr, players, floor). Dates as ISO strings."""
    end = _d(day)
    floor = floor_for(end, tourns, releases)
    floor = floor or end - timedelta(days=WINDOW_STEPS[-1] - 1)
    prev, x, step = None, floor, None
    while x <= end:   # chain from FLOOR: each day's step depends on the step of the day before
        step = WINDOW_STEPS[-1]
        for s in WINDOW_STEPS:
            lo = max(floor, x - timedelta(days=s))
            need = MIN_PLAYERS if prev is None or s >= prev else MIN_PLAYERS * SHORTER_FACTOR
            if _players(tourns, lo, x - timedelta(days=1)) >= need:   # the s complete days before x
                step = s
                break
        prev, x = step, x + timedelta(days=1)
    start = max(floor, end - timedelta(days=step - 1))
    wd = (end - start).days + 1
    return {"start": start.isoformat(), "end": end.isoformat(), "wd": wd, "step": step,
            "wr": "early" if wd < 7 else ("late" if wd > 7 else None),
            "players": _players(tourns, start, end), "floor": floor.isoformat()}


def window_info(day, tourns, releases):
    """window_for(day) + wch (the start did not move by 0 or 1 day against the day before) + bige."""
    w = window_for(day, tourns, releases)
    y = window_for(_d(day) - timedelta(days=1), tourns, releases)
    if (_d(w["start"]) - _d(y["start"])).days not in (0, 1):
        w["wch"] = 1
    big = max(((p or 0, tid) for tid, t, p, m in tourns if not m and w["start"] <= t[:10] <= w["end"]), default=None)
    if big and w["players"] and big[0] / w["players"] * 100 > BIGE_SHARE:
        w["bige"] = [big[1], round(big[0] / w["players"] * 100, 1)]
    return w
