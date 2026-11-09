"""Download card and pack images (cached in cache/) and write the web files of the site.

site/c/<id>.webp     : card thumbnail, THUMB_W px wide (deck icons, card grid; shown at about 50-130 px)
site/z/<id>.webp     : card for the zoom view, the full PocketDecks source (367 px), copied without re-encoding
site/p/<pack>.webp   : booster pack image, PACK_W px wide (packs.json says which card comes from which pack)
site/e/<energy>.webp : energy icon, cut from the type icon (top right) of a basic card
Reads images.json written by build.mjs. Existing files are skipped; c/ and p/ are made again when their width
changes (the width is stored in site/c/.width and site/p/.width).
"""
import json, os, shutil, sys, urllib.request
from PIL import Image, ImageDraw  # ImageDraw: round masks for the energy icons

THUMB_W = 240   # was 150 until Nov 9, 2026 (soft on phone screens)
PACK_W = 200
CACHE = "cache"
for d in (CACHE, "site/c", "site/z", "site/p", "site/e"):
    os.makedirs(d, exist_ok=True)
spec = json.load(open("images.json"))


def width_changed(folder, w):
    """True (and the new width is stored) when the files in folder were made with another width."""
    mark = f"site/{folder}/.width"
    old = open(mark).read().strip() if os.path.exists(mark) else None
    if old == str(w):
        return False
    with open(mark, "w") as fh:
        fh.write(str(w))
    return True


REMAKE = {"c": width_changed("c", THUMB_W), "p": width_changed("p", PACK_W)}
def done(rel):
    return os.path.exists("site/" + rel) and not REMAKE.get(rel.split("/")[0])
urls = {c["id"]: c["url"] for c in spec["cards"]}
failed = []
RAW = "https://raw.githubusercontent.com/PocketDecks/pokemon-tcg-pocket-cards/refs/heads/main/images"

def raw(cid, url=None):
    path = f"{CACHE}/{cid}.webp"
    if not os.path.exists(path):
        url = url or urls.get(cid)
        if not url:
            raise RuntimeError("no url")
        with urllib.request.urlopen(url, timeout=30) as r, open(path, "wb") as f:
            f.write(r.read())
    return Image.open(path).convert("RGBA")

# Card thumbnails
for cid in urls:
    out = f"site/c/{cid}.webp"
    if done(f"c/{cid}.webp"):
        continue
    try:
        im = raw(cid)
        w = THUMB_W
        im.resize((w, round(im.height * w / im.width)), Image.LANCZOS).save(out, "WEBP", quality=80, method=6)
    except Exception as e:
        failed.append(f"{cid}: {e}")

# Zoom images: the source file as it is (already WebP, 367 px; re-encoding would only lose quality)
for cid in urls:
    if done(f"z/{cid}.webp"):
        continue
    try:
        raw(cid)
        shutil.copyfile(f"{CACHE}/{cid}.webp", f"site/z/{cid}.webp")
    except Exception as e:
        failed.append(f"zoom {cid}: {e}")

# Booster pack images
for pk in spec.get("packs", []):
    out = f"site/p/{pk['id']}.webp"
    if done(f"p/{pk['id']}.webp"):
        continue
    try:
        im = raw("pack-" + pk["id"], pk["url"])
        w = min(PACK_W, im.width)
        im.resize((w, round(im.height * w / im.width)), Image.LANCZOS).save(out, "WEBP", quality=82, method=6)
    except Exception as e:
        failed.append(f"pack {pk['id']}: {e}")

# Energy icons: type icon at the top right of a plain A1 basic card (367x512 source)
ENERGY_CARD = {"grass": "a1-001", "fire": "a1-033", "water": "a1-053", "lightning": "a1-094",
               "psychic": "a1-113", "fighting": "a1-137", "darkness": "a1-164", "metal": "a1-178"}
for energy, cid in ENERGY_CARD.items():
    out = f"site/e/{energy}.webp"
    if done(f"e/{energy}.webp"):
        continue
    try:
        s, n = cid.split("-")
        im = raw("png-" + cid, f"{RAW}/png/cards/{s}/{n}.png")
        W, H = im.size
        cx, cy, r = 334 * W / 367, 33 * H / 512, 13.2 * W / 367
        box = tuple(int(v) for v in (cx - r - 2, cy - r - 2, cx + r + 2, cy + r + 2))
        S = 8
        c = im.crop(box).resize(((box[2] - box[0]) * S, (box[3] - box[1]) * S), Image.LANCZOS)
        m = Image.new("L", c.size, 0)
        ccx, ccy = (cx - box[0]) * S, (cy - box[1]) * S
        ImageDraw.Draw(m).ellipse((ccx - r * S, ccy - r * S, ccx + r * S, ccy + r * S), fill=255)
        c.putalpha(m)
        c.resize((48, 48), Image.LANCZOS).save(out, "WEBP", quality=90, method=6)
    except Exception as e:
        failed.append(f"energy {energy}: {e}")

# Remove files of cards and packs that are no longer on the site (their sources stay in cache/).
keep = {"c": set(urls), "z": set(urls), "p": {pk["id"] for pk in spec.get("packs", [])}}
removed = 0
for folder, ids in keep.items():
    for f in os.listdir(f"site/{folder}"):
        if f.endswith(".webp") and f[:-5] not in ids:
            os.remove(f"site/{folder}/{f}")
            removed += 1
print(f"cards {len(urls)}, packs {len(keep['p'])}; old files removed: {removed}")
print("failed:", "; ".join(failed) or "none")
sys.exit(1 if failed else 0)
