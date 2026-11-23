"""Localized card images for Pocket Meta QR.

Source images: the public "TCGPocket" Google Drive (one folder per set, then one folder per language):
  TCGPocket/<SET folder>/<lang>/PK_10_010830_00.png  (Pokemon)  or  TR_10_000080_00.png  (Trainer)
The file name is the game's asset name. The flibustier database (cards.json, field "image") gives the
asset name for each print, for example B1 #1 -> "cPK_10_010830_00_KAILIOS_C.webp" -> key "PK_10_010830_00".

Output (same sizes as images.py):
  site/i18n/<lang>/c/<id>.webp : thumbnail, 150 px wide
  site/i18n/<lang>/z/<id>.webp : zoom image, 367 px wide
A card with no file for a language gets no file: the page must then show the English image.

Use:
  1. Get the source files, one of these ways:
     a) Download the set folders from Drive ("Download all"), unzip them under drive/ (any depth is OK):
          drive/B1 - Mega Rising/ja_JP/PK_10_010830_00.png
     b) python3 images_i18n.py fetch --key <Google API key> --sets "B1,B1a" --langs ja,ko
        (Drive API v3, public folder, read only. Files go to drive/<set folder>/<lang>/.)
  2. python3 images_i18n.py build [--langs ja,ko,...] [--ids images.json]
     --ids: only the card ids in images.json (written by build.mjs). Default: every card in the database.
  CI (site.yml): python3 images_i18n.py sync --key $KEY --ids images.json [--max-seconds 360]
     = fetch + build in one step, only for the files that are not made yet, PNGs not kept. Stops after
     --max-seconds; the next run goes on. The Drive file list is kept in cache/i18n-drive.json (made again
     after 7 days, or when a needed card is not in it, at most once a day).
"""
import argparse, io, json, os, re, sys, time, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

ROOT_FOLDER = "1_2YURmd7dYnCX3VuDLQobLNSJbAeavpt"  # TCGPocket (Drive)
FLIB_URL = "https://raw.githubusercontent.com/flibustier/pokemon-tcg-pocket-database/main/dist/cards.json"
FLIB = "cache/flib-cards.json"
SRC = "drive"
OUT = "site/i18n"
# Drive folder name -> site language code (English is not here: the site has English images already)
LANGS = {"de_DE": "de", "es_ES": "es", "fr_FR": "fr", "it_IT": "it", "ja_JP": "ja",
         "ko_KR": "ko", "pt_BR": "pt", "zh_TW": "zh"}
SIZES = {"c": 150, "z": 367}
KEY = re.compile(r"^c?((?:PK|TR)_\d+_\d{6}_\d+)")


def site_id(set_code, number):
    """flibustier set + number -> site card id (a1-001, pa-023, b4b-379)."""
    s = set_code.lower()
    s = {"promo-a": "pa", "promo-b": "pb", "promo-c": "pc"}.get(s, s)
    return f"{s}-{int(number):03d}"


def load_db(refresh=False):
    """Card id -> asset key, from the flibustier database (cached in cache/)."""
    if refresh or not os.path.exists(FLIB):
        os.makedirs(os.path.dirname(FLIB), exist_ok=True)
        with urllib.request.urlopen(FLIB_URL, timeout=60) as r, open(FLIB, "wb") as f:
            f.write(r.read())
    out = {}
    for c in json.load(open(FLIB, encoding="utf8")):
        m = KEY.match(c.get("image") or "")
        if m:
            out[site_id(c["set"], c["number"])] = m.group(1)
    return out


def index_sources(langs):
    """(drive lang, asset key) -> png path, for all files under drive/."""
    idx = {}
    for dirpath, _, files in os.walk(SRC):
        lang = os.path.basename(dirpath)
        if lang not in langs:
            continue
        for fn in files:
            m = KEY.match(fn)
            if m and fn.lower().endswith(".png"):
                idx.setdefault((lang, m.group(1)), os.path.join(dirpath, fn))
    return idx


def build(args):
    want = [l for l in LANGS if not args.langs or LANGS[l] in args.langs.split(",")]
    db = load_db(args.refresh)
    ids = sorted(db)
    if args.ids:
        spec = json.load(open(args.ids, encoding="utf8"))
        ids = [c["id"] for c in spec["cards"]]
    idx = index_sources(set(want))
    if not idx:
        sys.exit(f"no source files under {SRC}/ for {', '.join(want)}: see the notes at the top of this file")
    made = skipped = 0
    missing, nokey = {}, [i for i in ids if i not in db]
    for lang in want:
        code = LANGS[lang]
        for d in SIZES:
            os.makedirs(f"{OUT}/{code}/{d}", exist_ok=True)
        for cid in ids:
            key = db.get(cid)
            src = key and idx.get((lang, key))
            if not src:
                if key:
                    missing.setdefault(code, []).append(cid)
                continue
            outs = {d: f"{OUT}/{code}/{d}/{cid}.webp" for d in SIZES}
            if not args.force and all(os.path.exists(p) for p in outs.values()):
                skipped += 1
                continue
            im = Image.open(src).convert("RGBA")
            for d, w in SIZES.items():
                im.resize((w, round(im.height * w / im.width)), Image.LANCZOS).save(
                    outs[d], "WEBP", quality=80 if d == "c" else 85, method=6)
            made += 1
    report = {"made": made, "skipped": skipped, "no_asset_name": nokey,
              "missing": {k: len(v) for k, v in missing.items()}, "missing_ids": missing}
    json.dump(report, open(f"{OUT}/report.json", "w"), indent=1)
    print(f"made {made}, skipped {skipped} (already there), no asset name {len(nokey)}")
    for code, v in missing.items():
        print(f"  {code}: {len(v)} cards have no source file (English is used), e.g. {', '.join(v[:5])}")


def drive_list(folder, key):
    items, token = [], None
    while True:
        q = {"q": f"'{folder}' in parents and trashed = false", "key": key, "pageSize": 1000,
             "fields": "nextPageToken, files(id, name, mimeType, size)"}
        if token:
            q["pageToken"] = token
        with urllib.request.urlopen("https://www.googleapis.com/drive/v3/files?" + urllib.parse.urlencode(q), timeout=60) as r:
            j = json.load(r)
        items += j.get("files", [])
        token = j.get("nextPageToken")
        if not token:
            return items


def fetch(args):
    """Download the language folders of the chosen sets from the public Drive folder (Drive API v3)."""
    sets = [s.strip().lower() for s in args.sets.split(",")]
    want = [l for l in LANGS if not args.langs or LANGS[l] in args.langs.split(",")]
    folders = [f for f in drive_list(ROOT_FOLDER, args.key) if f["mimeType"].endswith("folder")]
    n = 0
    for sf in folders:
        code = re.split(r"[\s-]", sf["name"].strip(), 1)[0].lower()  # "B1 - Mega Rising" -> "b1"
        if code not in sets:
            continue
        for lf in drive_list(sf["id"], args.key):
            if lf["name"] not in want or not lf["mimeType"].endswith("folder"):
                continue
            dst = os.path.join(SRC, sf["name"], lf["name"])
            os.makedirs(dst, exist_ok=True)
            for f in drive_list(lf["id"], args.key):
                p = os.path.join(dst, f["name"])
                if not KEY.match(f["name"]) or os.path.exists(p):
                    continue
                url = f"https://www.googleapis.com/drive/v3/files/{f['id']}?alt=media&key={args.key}"
                with urllib.request.urlopen(url, timeout=120) as r, open(p, "wb") as o:
                    o.write(r.read())
                n += 1
        print(f"{sf['name']}: done")
    print(f"downloaded {n} files")


LIST = "cache/i18n-drive.json"


def drive_index(key, refresh=False):
    """{drive lang: {asset key: file id}} for every set folder (kept in cache/ for 7 days)."""
    if not refresh and os.path.exists(LIST):
        j = json.load(open(LIST, encoding="utf8"))
        if time.time() - j.get("at", 0) < 7 * 86400:
            return j, False
    idx = {l: {} for l in LANGS}
    for sf in drive_list(ROOT_FOLDER, key):
        if not sf["mimeType"].endswith("folder"):
            continue
        for lf in drive_list(sf["id"], key):
            if lf["name"] in idx and lf["mimeType"].endswith("folder"):
                for f in drive_list(lf["id"], key):
                    m = KEY.match(f["name"])
                    if m and f["name"].lower().endswith(".png"):
                        idx[lf["name"]].setdefault(m.group(1), f["id"])
    j = {"at": time.time(), "files": idx}
    os.makedirs(os.path.dirname(LIST), exist_ok=True)
    json.dump(j, open(LIST, "w", encoding="utf8"))
    return j, True


def save_webp(data, code, cid):
    im = Image.open(io.BytesIO(data)).convert("RGBA")
    for d, w in SIZES.items():
        os.makedirs(f"{OUT}/{code}/{d}", exist_ok=True)
        im.resize((w, round(im.height * w / im.width)), Image.LANCZOS).save(
            f"{OUT}/{code}/{d}/{cid}.webp", "WEBP", quality=80 if d == "c" else 85, method=6)


def sync(args):
    t0 = time.time()
    db = load_db(args.refresh)
    ids = [c["id"] for c in json.load(open(args.ids, encoding="utf8"))["cards"]] if args.ids else sorted(db)
    order = args.langs.split(",") if args.langs else list(LANGS.values())   # --langs order = the order they are made
    want = sorted((l for l in LANGS if LANGS[l] in order), key=lambda l: order.index(LANGS[l]))
    todo = [(l, cid) for l in want for cid in ids
            if cid in db and not all(os.path.exists(f"{OUT}/{LANGS[l]}/{d}/{cid}.webp") for d in SIZES)]
    if not todo:
        print("i18n: all localized images are there"); return
    j, fresh = drive_index(args.key)
    print(f"i18n: {len(todo)} files to make; Drive list {'made' if fresh else 'from cache'} ({time.time() - t0:.0f} s)")
    miss = [t for t in todo if db[t[1]] not in j["files"].get(t[0], {})]
    if miss and not fresh and time.time() - j["at"] > 86400:   # a new set: list the Drive folder again
        j, fresh = drive_index(args.key, refresh=True)
        print(f"i18n: Drive list made again for a new set ({time.time() - t0:.0f} s)")
    files = j["files"]
    jobs = {}   # one download per (lang, asset key); reprints share it
    for l, cid in todo:
        fid = files.get(l, {}).get(db[cid])
        if fid:
            jobs.setdefault((l, db[cid]), (fid, []))[1].append(cid)
    nofile = len(todo) - sum(len(v[1]) for v in jobs.values())
    done = failed = 0

    def one(item):
        (l, k), (fid, cids) = item
        if time.time() - t0 > args.max_seconds:
            return None
        url = f"https://www.googleapis.com/drive/v3/files/{fid}?alt=media&key={args.key}"
        for attempt in range(3):
            try:
                with urllib.request.urlopen(url, timeout=60) as r:
                    data = r.read()
                for cid in cids:
                    save_webp(data, LANGS[l], cid)
                return True
            except Exception as e:
                err = e
                if hasattr(e, "read"):   # HTTPError: Google's reason (e.g. rateLimitExceeded, downloadQuotaExceeded)
                    try: err = f"{e} {json.loads(e.read())['error']['errors'][0].get('reason', '')}"
                    except Exception: pass
                time.sleep(5 * (attempt + 1) if "403" in str(err) or "429" in str(err) else 2 * (attempt + 1))
        print(f"i18n: {l} {k}: {err}"); return False

    with ThreadPoolExecutor(args.threads) as ex:
        for r in ex.map(one, list(jobs.items())):
            if r is True: done += 1
            elif r is False: failed += 1
    left = len(jobs) - done - failed
    print(f"i18n: {done} files made, {failed} failed, {left} left for the next run, "
          f"{nofile} cards have no Drive file (English is used); {time.time() - t0:.0f} s")
    if failed:
        print("::warning title=i18n images::%d downloads failed (see log)" % failed)


# Booster packs (Nov 23): the game's pack art without the set logo (Texture Dump/UI/Textures/System/Pack,
# PACK_ICON_<series><nn>_<k>0_00_000.png, 256x256 with the pack in the middle). One image for every language
# (no text on it): site/i18n/p/<site pack id>.webp. The k-th pack of a set = the order of the game's pack list.
PACK_FOLDER = "17pJdplAg7RG557RR6kjjKFuH-UIZ1w_n"
PACK_ICONS = {"AN001": ["a1-mewtwo", "a1-charizard", "a1-pikachu"], "AN002": ["a1a-mew"], "AN003": ["a2-dialga", "a2-palkia"],
              "AN004": ["a2a-arceus"], "AN005": ["a2b-booster"], "AN006": ["a3-solgaleo", "a3-lunala"], "AN007": ["a3a-booster"],
              "AN008": ["a3b-booster"], "AN009": ["a4-hooh", "a4-lugia"], "AN010": ["a4a-booster"], "AN011": ["a4b-booster"],
              "BN001": ["b1-megablaziken", "b1-megagyarados", "b1-megaaltaria"], "BN002": ["b1a-booster"], "BN003": ["b2-booster"],
              "BN004": ["b2a-booster"], "BN005": ["b2b-booster"], "BN006": ["b3-booster"], "BN007": ["b3a-booster"],
              "BN008": ["b3b-booster"], "BN009": ["b4-booster"], "BN010": ["b4a-booster"], "BN011": ["b4b-booster"]}


def packs(args):
    out = f"{OUT}/p"
    os.makedirs(out, exist_ok=True)
    made = 0
    for f in drive_list(PACK_FOLDER, args.key):
        m = re.fullmatch(r"PACK_ICON_([A-Z]{2}\d{3})_00(\d)0_00_000\.png", f["name"])
        ids = PACK_ICONS.get(m.group(1), []) if m else []
        k = int(m.group(2)) - 1 if m else -1
        if not (0 <= k < len(ids)):
            continue
        dst = f"{out}/{ids[k]}.webp"
        if os.path.exists(dst) and not args.force:
            continue
        url = f"https://www.googleapis.com/drive/v3/files/{f['id']}?alt=media&key={args.key}"
        with urllib.request.urlopen(url, timeout=60) as r:
            im = Image.open(io.BytesIO(r.read())).convert("RGBA")
        box = im.getchannel("A").point(lambda a: 255 if a > 24 else 0).getbbox()   # the pack (and its shadow edge)
        if box:
            im = im.crop(box)
        im.save(dst, "WEBP", quality=88, method=6)
        made += 1
        print(f"pack {ids[k]}: {f['name']} {im.width}x{im.height}")
    print(f"i18n packs: {made} made ({len(os.listdir(out))} in {out})")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build", help="make webp files from drive/")
    b.add_argument("--langs", help="site codes, for example ja,ko (default: all 8)")
    b.add_argument("--ids", help="images.json from build.mjs: only these card ids")
    b.add_argument("--force", action="store_true", help="make files again even if they exist")
    b.add_argument("--refresh", action="store_true", help="download the flibustier database again")
    f = sub.add_parser("fetch", help="download set folders from Drive (needs a Google API key)")
    f.add_argument("--key", required=True)
    f.add_argument("--sets", required=True, help='set codes, for example "B1,B1a,C1"')
    f.add_argument("--langs")
    y = sub.add_parser("sync", help="CI: download and make only the missing files (needs a Google API key)")
    y.add_argument("--key", required=True)
    y.add_argument("--ids", help="images.json from build.mjs")
    y.add_argument("--langs")
    y.add_argument("--max-seconds", type=int, default=360)
    y.add_argument("--threads", type=int, default=8)
    y.add_argument("--refresh", action="store_true")
    k = sub.add_parser("packs", help="booster pack art without the logo (not used since Nov 24: every page uses the English p/ images)")
    k.add_argument("--key", required=True)
    k.add_argument("--force", action="store_true")
    a = ap.parse_args()
    {"build": build, "fetch": fetch, "sync": sync, "packs": packs}[a.cmd](a)
