"""List the public TCGPocket Drive folder (names only) and find files that match a pattern.
   GDRIVE_API_KEY=... python tools/drive_scan.py [regex] [start folder id] [max depth]
Writes drive_scan.txt (every folder path + the matching files) and prints a short summary."""
import os, re, sys, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "pipeline"))
from images_i18n import drive_list, ROOT_FOLDER

pat = re.compile(sys.argv[1] if len(sys.argv) > 1 else r"pack", re.I)
start = (sys.argv[2] if len(sys.argv) > 2 else "") or ROOT_FOLDER
depth = int(sys.argv[3]) if len(sys.argv) > 3 else 6
key = os.environ["GDRIVE_API_KEY"]
out, hits, nf = [], [], 0
def walk(fid, path, d):
    global nf
    items = drive_list(fid, key); nf += 1
    files = [x for x in items if not x["mimeType"].endswith("folder")]
    out.append(f"{path}/  ({len(files)} files)")
    for x in files:
        if pat.search(x["name"]): hits.append(f"{path}/{x['name']}  {x.get('size', '')}")
    if d < depth:
        for x in items:
            if x["mimeType"].endswith("folder"): walk(x["id"], f"{path}/{x['name']}", d + 1)
walk(start, "", 0)
open("drive_scan.txt", "w").write("\n".join(["# folders"] + out + ["", f"# files matching {pat.pattern}"] + hits) + "\n")
print(f"{nf} folders, {len(hits)} matching files")
for h in hits[:300]: print(h)
