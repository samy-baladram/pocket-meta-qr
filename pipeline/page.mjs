// Make the deploy copy of the page: site/index.html (the artifact page body, copied by the sync-pocket-meta-ui skill)
// -> public/index.html wrapped in the same document skeleton that the Claude artifact adds when it publishes.
// The source site/index.html is never changed (the UI is owned by the artifact).
//
// R7b (Nov 10, 2026): the page starts with its head tags (<title>, <meta>, <link>, <script type="application/ld+json">).
// They are moved into <head>, after the charset and viewport tags, in their order, so that link-preview crawlers and
// search engines find them there. The run of head tags ends at the first other tag (the page's first <style>).
//
// R12b (Nov 12, 2026): the deploy copy is minified: inline <style> blocks with csso, inline <script> blocks (not
// application/ld+json) with terser (compress + mangle of local names; top-level names are kept), and HTML comments
// after the head tags are dropped. The head tags (with the "<!-- ui: artifact version ... -->" line) stay as they
// are. --no-minify writes the page as before. site/index.html is never changed.
//
// R26 (Nov 22, 2026): one address per section. The page (History API) shows a section by its path when it finds
// <meta name="pmq-routes" content="1">. So index.html gets that tag, and SECTIONS writes a copy of the page per section
// folder (events/, packs/, limited/ next to index.html) with, first in <head>, the tag + <base href="/"> (data, images,
// font, sw.js and manifest load from the site root), and its own title, description, og:title/description/url,
// twitter:title/description (when present) and canonical. --no-routes writes index.html as before (no tag, no folders).
// index.html gets the tag + <base href="/"> too (pipeline chat, Nov 22): the page at "/" moves to /events/ etc. with the
// History API, and without <base> the images it adds after the move load from /events/e/... (404 in the test).
// Only when the page source has the routing code (the text "pmq-routes"): an older page gets neither the tag nor the
// folders, so the folders never show the deck table under a section title. With the folders, the sitemap
// (static/sitemap.xml + the 3 section addresses) is written next to index.html; site.yml copies static/ without
// overwriting it (cp --update=none).
//
// R27 (Nov 22, 2026): make the section pages findable. (1) sitemap.xml: the 4 addresses with <lastmod> = the build day;
// /limited/ only while a Limited Battle is on (static/limited.json, else the page's `const LB`; unknown: listed).
// (2) Each copy's intro text in the page's empty slot <p class="seoi" id="seoi"></p> (inside "Loading decks...": shown
// while the page loads, then replaced by the list), plain text from this build's data (data.json, events.json,
// packs.json next to the page source). (3) og:image / twitter:image per section (static/og-<section>.png when it
// exists; else og.png stays).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { minify as minifyJS } from "terser";
import { minify as minifyCSS } from "csso";

const args = process.argv.slice(2), MINIFY = !args.includes("--no-minify"), ROUTES = !args.includes("--no-routes");
const SITE = "https://pocketmetaqr.com";
const ROUTE_TAG = '<meta name="pmq-routes" content="1"><base href="/">';
const SECTIONS = [
  { dir: "events", title: "Latest events – Pocket Meta QR",
    desc: "Latest Pokémon TCG Pocket tournament results: top 8 lists with QR codes.", img: "og-events.png" },
  { dir: "packs", title: "Booster packs for the meta – Pocket Meta QR",
    desc: "Which Pokémon TCG Pocket booster packs give the cards of this week's meta decks.", img: "og-packs.png" },
  { dir: "limited", title: "Limited Battle decks – Pocket Meta QR",
    desc: "Hand-picked decks with QR codes for the current Limited Battle event.", img: "og-limited.png" },
];
const SEOI = '<p class="seoi" id="seoi"></p>';

// R27: the intro texts ("" = no text) and the Limited Battle (null = unknown) from this build's data.
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (iso) => { const [, m, d] = iso.slice(0, 10).split("-"); return `${MON[+m - 1]} ${+d}`; };
const span = (a, b) => (a.slice(0, 10) === b.slice(0, 10) ? day(a) :
  a.slice(0, 7) === b.slice(0, 7) ? `${day(a)} – ${+b.slice(8, 10)}` : `${day(a)} – ${day(b)}`);
// Event names without emoji and decoration symbols (link previews and search snippets): "✧❀🌸 Festival 🌸❀✧" -> "Festival"
const plain = (t) => t.replace(/[\p{Extended_Pictographic}\p{So}\u2700-\u27BF\uFE0F\u200D\uFF5C\uFE31]/gu, " ")
  .replace(/\s*[|︱]\s*/g, " | ").replace(/\s+/g, " ").replace(/^[\s|:.,-]+|[\s|:.,-]+$/g, "");
const readJSON = (f) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return null; } };
function limitedEvent(page) {
  const j = readJSON("static/limited.json");
  if (j && j.name && j.from && j.to) return { name: j.name, from: j.from, to: j.to, n: (j.decks || []).length };
  const m = page.match(/const LB = \{[^]*?name: "([^"]+)", from: "([^"]+)", to: "([^"]+)"/);
  return m ? { name: m[1], from: m[2], to: m[3], n: 0 } : null;
}
function intros(dataDir, page) {
  const D = readJSON(join(dataDir, "data.json")), E = readJSON(join(dataDir, "events.json")),
    P = readJSON(join(dataDir, "packs.json")), t = {};
  if (D?.decks?.length) {
    const top = D.decks.slice(0, 3).map((d, i) => `#${i + 1} ${d.name} ${d.share.toFixed(1)}%`).join(", ");
    t[""] = `This week's top Pokémon TCG Pocket decks from ${D.summary.tournaments} tournaments ` +
      `(${span(D.span[0], D.span[1])}): ${top}. Every list has a QR code to copy it in the game.`;
  }
  if (E?.events?.length) {   // the 3 newest events with 32+ players (else the 3 newest)
    const ev = E.events.filter((x) => x.players >= 32 && x.win), list = (ev.length ? ev : E.events.filter((x) => x.win));
    const s = list.slice(0, 3).map((x) => `${plain(x.name)} (${x.players} players) won by ${x.win.name}`);
    if (s.length) t.events = `The latest Pokémon TCG Pocket tournaments: ${s.join("; ")}. Top 8 decklists with QR codes.`;
  }
  if (D?.decks?.length && P?.cards) {   // packs that give the most cards of the shown decks' lists (not promo)
    const ids = new Set(D.decks.flatMap((d) => (d.cards || []).map((c) => c.id))), n = new Map();
    for (const id of ids) for (const k of P.cards[id] || []) if (!/^p/.test(P.packs[k]?.set || "p")) n.set(k, (n.get(k) || 0) + 1);
    const nm = (k) => {
      const pk = P.packs[k], one = Object.values(P.packs).filter((x) => x.set === pk.set).length === 1;
      return one ? pk.name : `${P.sets?.[pk.set]?.name || pk.set.toUpperCase()}: ${pk.name}`;
    };
    const best = [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3);
    if (best.length) t.packs = "Which Pokémon TCG Pocket booster packs give the cards of this week's meta decks: " +
      best.map(([k, c], i) => `${nm(k)} (${c}${i ? "" : " meta cards"})`).join(", ") + ".";
  }
  const lb = limitedEvent(page);
  if (lb && Date.parse(lb.to) > Date.now())
    t.limited = `Hand-picked decks for ${lb.name} (${span(lb.from, lb.to)}), with QR codes.`;
  return { t, lb };
}
const fillIntro = (html, text) => (text ? html.replace(SEOI, `<p class="seoi" id="seoi">${esc(text)}</p>`) : html);
const esc = (t) => t.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

// R26: the copy of the page for 1 section folder. Changes only the head part (before </head>).
function sectionPage(html, { dir, title, desc, img }) {
  const i = html.indexOf("</head>");
  let head = html.slice(0, i);
  const url = `${SITE}/${dir}/`, set = (re, val, what) => {
    if (!re.test(head)) { if (what) throw new Error(`R26: no ${what} in the page head`); return; }
    head = head.replace(re, val);
  };
  set(/<title\b[^>]*>[\s\S]*?<\/title>/i, `<title>${esc(title)}</title>`, "<title>");
  set(/<meta name="description" content="[^"]*">/i, `<meta name="description" content="${esc(desc)}">`, "description");
  set(/<link rel="canonical" href="[^"]*">/i, `<link rel="canonical" href="${url}">`);
  set(/<meta property="og:url" content="[^"]*">/i, `<meta property="og:url" content="${url}">`);
  set(/<meta property="og:title" content="[^"]*">/i, `<meta property="og:title" content="${esc(title)}">`);
  set(/<meta property="og:description" content="[^"]*">/i, `<meta property="og:description" content="${esc(desc)}">`);
  set(/<meta name="twitter:title" content="[^"]*">/i, `<meta name="twitter:title" content="${esc(title)}">`);
  set(/<meta name="twitter:description" content="[^"]*">/i, `<meta name="twitter:description" content="${esc(desc)}">`);
  if (img && existsSync(join("static", img))) {   // R27: the section's preview image
    set(/<meta property="og:image" content="[^"]*">/i, `<meta property="og:image" content="${SITE}/${img}">`);
    set(/<meta name="twitter:image" content="[^"]*">/i, `<meta name="twitter:image" content="${SITE}/${img}">`);
    set(/<meta property="og:image:alt" content="[^"]*">/i, `<meta property="og:image:alt" content="${esc(title)}">`);
  }
  if (!head.startsWith(`<!doctype html><html lang="en"><head>${ROUTE_TAG}`)) throw new Error("R26: no route tag first in <head>");
  return head + html.slice(i);
}
const [src = "site/index.html", out = "public/index.html"] = args.filter((a) => !a.startsWith("--"));
const body = readFileSync(src, "utf8");
const ROUTES_ON = ROUTES && body.includes("pmq-routes");   // R26: the page supports the section addresses

// One head item at the start of the text: whitespace, then a comment, <title>..</title>, <meta>, <link>,
// or <script type="application/ld+json">..</script>.
const HEAD_ITEM = new RegExp(
  "^\\s*(?:<!--[\\s\\S]*?-->|<title\\b[^>]*>[\\s\\S]*?<\\/title>|<meta\\b[^>]*>|<link\\b[^>]*>|" +
  "<script\\b[^>]*type=[\"']application\\/ld\\+json[\"'][^>]*>[\\s\\S]*?<\\/script>)", "i");

function splitHead(html) {
  let rest = html, head = "";
  for (let m; (m = rest.match(HEAD_ITEM)); rest = rest.slice(m[0].length)) head += m[0];
  return { head: head.trim(), rest: rest.replace(/^\s+/, "") };
}

// Minify the page part after the head tags: <style> and <script> blocks, and drop HTML comments outside them.
async function minifyPage(html) {
  const parts = html.split(/(<style\b[^>]*>[\s\S]*?<\/style>|<script\b[^>]*>[\s\S]*?<\/script>)/i);
  const out = [];
  for (const part of parts) {
    let m;
    if ((m = part.match(/^(<style\b[^>]*>)([\s\S]*?)(<\/style>)$/i))) {
      out.push(m[1] + minifyCSS(m[2]).css + m[3]);
    } else if ((m = part.match(/^(<script\b([^>]*)>)([\s\S]*?)(<\/script>)$/i))) {
      if (/type=["']?application\/ld\+json/i.test(m[2])) out.push(m[1] + JSON.stringify(JSON.parse(m[3])) + m[4]);
      else if (/\bsrc=/i.test(m[2]) || !m[3].trim()) out.push(part);
      else {
        const r = await minifyJS(m[3], { compress: true, mangle: { toplevel: false }, format: { comments: false } });
        out.push(m[1] + r.code.replace(/<\/script/gi, "<\\/script") + m[4]);
      }
    } else out.push(part.replace(/<!--[\s\S]*?-->/g, ""));
  }
  return out.join("");
}

if (/^\s*(<!--[^>]*-->\s*)?<!doctype html>/i.test(body)) {
  writeFileSync(out, body); // already a full document
} else {
  const { head: tags, rest: page } = splitHead(body);
  const rest = MINIFY ? await minifyPage(page) : page;
  const head = '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n' + tags + "\n" +
    "<style>:root{color-scheme:light;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);" +
    "padding-bottom:env(safe-area-inset-bottom,0px)}html{scroll-padding-top:env(safe-area-inset-top,0px)}" +
    "body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#fff;color:#000}" +
    "img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}</style></head><body>\n";
  const full = head.replace("<head>", ROUTES_ON ? `<head>${ROUTE_TAG}` : "<head>") + rest + "\n</body></html>\n";
  const { t: intro, lb } = intros(dirname(src), body), hasSlot = full.includes(SEOI);
  writeFileSync(out, fillIntro(full, intro[""]));
  if (ROUTES_ON) for (const sec of SECTIONS) {   // R26: events/, packs/, limited/ next to index.html
    const f = join(dirname(out), sec.dir, "index.html");
    mkdirSync(dirname(f), { recursive: true });
    writeFileSync(f, fillIntro(sectionPage(full, sec), intro[sec.dir]));
  }
  if (ROUTES_ON) {   // R26 + R27: sitemap.xml with the section addresses and <lastmod>
    const today = new Date().toISOString().slice(0, 10);
    const lbOn = !lb || Date.parse(lb.to) > Date.now();
    const urls = [["", "hourly"], ...SECTIONS.filter((x) => x.dir !== "limited" || lbOn).map((x) => [x.dir + "/", "daily"])];
    writeFileSync(join(dirname(out), "sitemap.xml"), '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      urls.map(([u, f]) => `  <url><loc>${SITE}/${u}</loc><lastmod>${today}</lastmod><changefreq>${f}</changefreq></url>\n`).join("") +
      "</urlset>\n");
    console.log(`page: sitemap ${urls.length} addresses${lb ? `; Limited Battle "${lb.name}" until ${lb.to}` : ""}`);
  }
  console.log(hasSlot ? `page: intro texts ${["", ...SECTIONS.map((x) => x.dir)].map((k) => `${k || "/"} ${intro[k] ? intro[k].length + " chars" : "none"}`).join(", ")}`
    : "page: no intro slot in the page (R27)");
  console.log(ROUTES_ON ? `page: routes on; section pages ${SECTIONS.map((x) => x.dir + "/").join(", ")}` :
    `page: routes off (${ROUTES ? "the page has no routing code yet" : "--no-routes"})`);
  const n = (tags.match(/<(?:title|meta|link|script)\b/gi) || []).length;
  console.log(`page: ${n} head tags moved into <head>`);
}
console.log(`page: ${src} -> ${out}${MINIFY ? ` (minified: ${(body.length / 1024).toFixed(0)} KB -> ` +
  `${(readFileSync(out).length / 1024).toFixed(0)} KB)` : ""}`);
