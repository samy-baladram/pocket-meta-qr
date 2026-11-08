"""Download card images (cached) and write small web files for the artifact.

site/c/<id>.webp     : card thumbnail, 150 px wide (shown at about 60 px)
site/e/<energy>.webp : energy icon, cut from the type icon (top right) of a basic card
Reads images.json written by build.mjs. (The page shows deck icons from c/, so no art crops are made.)
"""
import json, os, sys, urllib.request
from PIL import Image, ImageDraw  # ImageDraw: round masks for the energy icons

CACHE = "cache"
for d in (CACHE, "site/c", "site/e"):
    os.makedirs(d, exist_ok=True)
spec = json.load(open("images.json"))
# Files already published (state.json manifest) are skipped: a fresh run does not download them again.
PUBLISHED = set(json.load(open("state.json")).get("manifest", {})) if os.path.exists("state.json") else set()
def done(rel):
    return os.path.exists("site/" + rel) or rel in PUBLISHED
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
        w = 150
        im.resize((w, round(im.height * w / im.width)), Image.LANCZOS).save(out, "WEBP", quality=80, method=6)
    except Exception as e:
        failed.append(f"{cid}: {e}")

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

print("failed:", "; ".join(failed) or "none")
sys.exit(1 if failed else 0)
