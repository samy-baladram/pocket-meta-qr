// IndexNow (Nov 26, 2026): tell Bing, Yandex, Naver, Seznam and the other IndexNow engines which pages changed.
// Google does not use IndexNow.
//
//   node pipeline/indexnow.mjs <public dir> <state file> <out dir>
//
// Reads <public>/sitemap.xml. For each address it makes a fingerprint of the page's search text: <title>,
// <meta name="description">, h2.hsec and the intro (p#seoi), from <public>/<path>/index.html. The page's code, styles
// and file hashes are not in the fingerprint, so a build that changes no visible search text sends nothing.
// An address goes in the list when:
//   - it is new (not in the state file), or
//   - its fingerprint changed and it was last sent more than MIN_HOURS ago (the data changes every hour; once a day
//     per page is enough), or
//   - it left the sitemap (the page is gone or noindex: the engines then check it again). It is then dropped from the
//     state file.
// Writes <out>/part-<n>.json (IndexNow POST bodies, at most 10,000 addresses each) and the new state file. The deploy
// job sends them after the site is live (site.yml, job "indexnow"). No address = no part file.
// The first run (no state file, e.g. after a cache miss) sends every address once.
// Never stops the build: any error is a warning (site.yml: continue-on-error).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const [PUB, STATE, OUT] = process.argv.slice(2);
if (!PUB || !STATE || !OUT) { console.error("usage: indexnow.mjs <public> <state.json> <out dir>"); process.exit(2); }

const HOST = "pocketmetaqr.com";
const KEY = "6b7eebf821324cff90fce06b6b01a59a";   // static/<KEY>.txt (public by design)
const MIN_HOURS = 20;
const MAX_PER_POST = 10000;

const xml = fs.readFileSync(path.join(PUB, "sitemap.xml"), "utf8");
const urls = [...new Set([...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]))]
  .filter((u) => new URL(u).host === HOST);

const pick = (re, s) => { const m = s.match(re); return m ? m[1].replace(/\s+/g, " ").trim() : ""; };
function fingerprint(u) {
  let p = decodeURIComponent(new URL(u).pathname);
  if (p.endsWith("/")) p += "index.html";
  let html;
  try { html = fs.readFileSync(path.join(PUB, p), "utf8"); } catch { return "missing"; }
  const text = [
    pick(/<title>([\s\S]*?)<\/title>/i, html),
    pick(/<meta\s+name="description"\s+content="([^"]*)"/i, html),
    pick(/<h2[^>]*class="[^"]*\bhsec\b[^"]*"[^>]*>([\s\S]*?)<\/h2>/i, html),
    pick(/<p[^>]*id="seoi"[^>]*>([\s\S]*?)<\/p>/i, html),
  ].join("\n");
  return crypto.createHash("sha1").update(text).digest("hex").slice(0, 16);
}

let state = {};
try { state = JSON.parse(fs.readFileSync(STATE, "utf8")); } catch { /* first run */ }
const now = Date.now(), minMs = MIN_HOURS * 3600e3;
const send = [], next = {};
let nNew = 0, nChanged = 0, nWait = 0, nGone = 0;

for (const u of urls) {
  const h = fingerprint(u), old = state[u];
  if (!old) { send.push(u); next[u] = { h, t: now }; nNew++; }
  else if (old.h !== h && now - old.t > minMs) { send.push(u); next[u] = { h, t: now }; nChanged++; }
  else { next[u] = old; if (old.h !== h) nWait++; }
}
for (const u of Object.keys(state)) if (!(u in next)) { send.push(u); nGone++; }

fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (/^part-\d+\.json$/.test(f)) fs.rmSync(path.join(OUT, f));
for (let i = 0; i * MAX_PER_POST < send.length; i++) {
  const body = { host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`,
    urlList: send.slice(i * MAX_PER_POST, (i + 1) * MAX_PER_POST) };
  fs.writeFileSync(path.join(OUT, `part-${i + 1}.json`), JSON.stringify(body));
}
fs.mkdirSync(path.dirname(STATE), { recursive: true });
fs.writeFileSync(STATE, JSON.stringify(next));
console.log(`indexnow: sitemap ${urls.length}; send ${send.length} (new ${nNew}, changed ${nChanged}, gone ${nGone}); ` +
  `changed but sent < ${MIN_HOURS} h ago: ${nWait}`);
