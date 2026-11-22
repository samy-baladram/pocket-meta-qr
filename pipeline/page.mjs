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
//
// R28 (Nov 22, 2026): search result titles and descriptions. All 4 copies (also index.html): <title> + og:title = topic
// + month first, brand last (the page's RTITLES: "Pokémon TCG Pocket Meta Decks (Nov 2026) with QR Codes | Pocket
// Meta QR", ...); description + og:description = a short text from the data (up to DESC_MAX characters, cut at a list
// item; the fixed text only without data); the section subtitle <h2 class="hsec"> per copy (the page's RHEAD);
// JSON-LD: a WebSite (name, alternateName, url) on index.html and a BreadcrumbList on each section copy.
//
// R29 (Nov 22, 2026): an /about/ copy (About & FAQ), only when the page has the static FAQ section
// <section class="abv" id="abv" ... hidden>: the routes tag becomes content="1 about" in every copy (the page turns its
// /about/ view on only then), about/index.html shows the section (no `hidden` in that copy), gets its own title,
// description, subtitle, BreadcrumbList + FAQPage JSON-LD (from the section's h4 / p pairs), and is in the sitemap.
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
  { dir: "about", about: true,   // R29: only when the page has the static FAQ section (#abv)
    title: "About & FAQ: How to Import Pokémon TCG Pocket Decks by QR | Pocket Meta QR",
    desc: "How to import a Pokémon TCG Pocket deck from a QR code, where the data comes from (Limitless tournaments, " +
      "the last 7 days) and how the decks and lists are ranked.", img: "og.png" },
];
const SEOI = '<p class="seoi" id="seoi"></p>';
// R28: titles (topic + month first) and subtitles, the same strings as the page's RTITLES / RHEAD.
const MONTH = new Date().toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
const TITLES = { "": `Pokémon TCG Pocket Meta Decks (${MONTH}) with QR Codes | Pocket Meta QR`,
  events: `Pokémon TCG Pocket Tournament Results (${MONTH}) | Pocket Meta QR`,
  packs: `Which Pokémon TCG Pocket Pack to Open (${MONTH}) | Pocket Meta QR`,
  limited: (lb) => `${lb.name} Decks with QR Codes | Pocket Meta QR` };
const HSEC = { events: "Latest Pokémon TCG Pocket tournaments", packs: "Booster packs for this week’s meta",
  limited: "Limited Battle decks", about: "About and FAQ" };
const CRUMB = { events: "Latest events", packs: "Booster packs", limited: "Limited Battle", about: "About & FAQ" };
// R29: the FAQ of the page's #abv section as FAQPage JSON-LD (h4 = question, the next p = answer, as plain text).
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", eacute: "é", rarr: "→", larr: "←",
  rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", ndash: "–", mdash: "—", hellip: "…", middot: "·", times: "×" };
const text = (h) => h.replace(/<[^>]+>/g, "").replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => e[0] === "#" ?
  String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()] ?? m)
  .replace(/\s+/g, " ").trim();
const ABV_RE = /<section class="abv" id="abv"[^>]*>[\s\S]*?<\/section>/;
function faq(html) {
  const sec = (html.match(ABV_RE) || [""])[0], qa = [];
  for (const m of sec.matchAll(/<h4>([\s\S]*?)<\/h4>\s*<p>([\s\S]*?)<\/p>/g))
    qa.push({ "@type": "Question", name: text(m[1]), acceptedAnswer: { "@type": "Answer", text: text(m[2]) } });
  return qa.length ? { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: qa } : null;
}
const DESC_MAX = 160;
// Join list items into "head items... tail" while it fits DESC_MAX (at least 1 item); "…" when items were left out.
const fit = (head, items, tail) => {
  let n = items.length;
  const make = (k) => head + items.slice(0, k).join(", ") + (k < items.length ? "…" : ".") + (tail ? " " + tail : "");
  while (n > 1 && make(n).length > DESC_MAX) n--;
  return make(n);
};

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
    P = readJSON(join(dataDir, "packs.json")), t = {}, d = {};
  if (D?.decks?.length) {
    const top = D.decks.slice(0, 3).map((d, i) => `#${i + 1} ${d.name} ${d.share.toFixed(1)}%`).join(", ");
    t[""] = `This week's top Pokémon TCG Pocket decks from ${D.summary.tournaments} tournaments ` +
      `(${span(D.span[0], D.span[1])}): ${top}. Every list has a QR code to copy it in the game.`;
    d[""] = fit(`${span(D.span[0], D.span[1])} meta from ${D.summary.tournaments} tournaments: `,
      D.decks.slice(0, 5).map((x, i) => `#${i + 1} ${x.name} (${Math.round(x.share)}%)`), "A QR code for every list.");
  }
  if (E?.events?.length) {   // the 3 newest events with 32+ players (else the 3 newest)
    const ev = E.events.filter((x) => x.players >= 32 && x.win), list = (ev.length ? ev : E.events.filter((x) => x.win));
    const s = list.slice(0, 3).map((x) => `${plain(x.name)} (${x.players} players) won by ${x.win.name}`);
    if (s.length) t.events = `The latest Pokémon TCG Pocket tournaments: ${s.join("; ")}. Top 8 decklists with QR codes.`;
    if (s.length) d.events = fit("Latest tournaments: ", list.slice(0, 5).map((x) => `${plain(x.name)} won by ${x.win.name}`),
      "Top 8 lists with QR codes.");
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
    const best5 = [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5);
    if (best5.length) d.packs = fit("Which booster pack to open now: ",
      best5.map(([k, c], i) => `${nm(k)} (${c}${i ? "" : " meta cards"})`), "");
  }
  const lb = limitedEvent(page);
  if (lb && Date.parse(lb.to) > Date.now())
    t.limited = d.limited = `Hand-picked decks for ${lb.name} (${span(lb.from, lb.to)}), with QR codes.`;
  return { t, d, lb };
}
const fillIntro = (html, text) => (text ? html.replace(SEOI, `<p class="seoi" id="seoi">${esc(text)}</p>`) : html);
const esc = (t) => t.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

// R26: the copy of the page for 1 section folder. Changes only the head part (before </head>), and (R28) the
// section subtitle. R28: also used for index.html (dir "": url, image and route check unchanged).
function sectionPage(html, { dir, title, desc, img, hsec, ld }) {
  const i = html.indexOf("</head>");
  let head = html.slice(0, i);
  const url = `${SITE}/${dir ? dir + "/" : ""}`, set = (re, val, what) => {
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
  if (dir && !head.startsWith(`<!doctype html><html lang="en"><head>${RT}`)) throw new Error("R26: no route tag first in <head>");
  if (ld) head += `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>`;
  let rest = html.slice(i);
  if (hsec) {   // R28: the section subtitle (the page sets the same text after a tab switch)
    const re = /(<h2 class="hsec">)[\s\S]*?(<\/h2>)/;
    if (re.test(rest)) rest = rest.replace(re, `$1${esc(hsec)}$2`); else console.log("page: no h2.hsec in the page (R28)");
  }
  return head + rest;
}
const [src = "site/index.html", out = "public/index.html"] = args.filter((a) => !a.startsWith("--"));
const body = readFileSync(src, "utf8");
const ROUTES_ON = ROUTES && body.includes("pmq-routes");   // R26: the page supports the section addresses
const ABOUT_ON = ROUTES_ON && ABV_RE.test(body);              // R29: the page has the static FAQ section
const RT = ABOUT_ON ? ROUTE_TAG.replace('content="1"', 'content="1 about"') : ROUTE_TAG;
const SECS = SECTIONS.filter((x) => !x.about || ABOUT_ON);

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
  const full = head.replace("<head>", ROUTES_ON ? `<head>${RT}` : "<head>") + rest + "\n</body></html>\n";
  const { t: intro, d: descs, lb } = intros(dirname(src), body), hasSlot = full.includes(SEOI);
  const lbOnNow = lb && Date.parse(lb.to) > Date.now();
  const rootDesc = (full.match(/<meta name="description" content="([^"]*)">/i) || [])[1];
  const rootPage = ROUTES_ON ? sectionPage(full, { dir: "", title: TITLES[""], desc: descs[""] || rootDesc,
    ld: { "@context": "https://schema.org", "@type": "WebSite", name: "Pocket Meta QR", alternateName: "PocketMetaQR",
      url: `${SITE}/` } }) : full;
  writeFileSync(out, fillIntro(rootPage, intro[""]));
  const heads = {};
  if (ROUTES_ON) for (const sec of SECS) {   // R26: events/, packs/, limited/ next to index.html
    const f = join(dirname(out), sec.dir, "index.html");
    mkdirSync(dirname(f), { recursive: true });
    const title = sec.dir === "limited" ? (lbOnNow ? TITLES.limited(lb) : sec.title) : TITLES[sec.dir] || sec.title;
    const crumbs = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Pocket Meta QR", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: CRUMB[sec.dir], item: `${SITE}/${sec.dir}/` }] };
    const fq = sec.about ? faq(full) : null;
    const s2 = { ...sec, title, desc: descs[sec.dir] || sec.desc, hsec: HSEC[sec.dir], ld: fq ? [crumbs, fq] : crumbs };
    heads[sec.dir] = s2;
    let html = fillIntro(sectionPage(full, s2), intro[sec.dir]);
    if (sec.about) {   // R29: the FAQ section is visible in this copy
      const before = html;
      html = html.replace(/(<section class="abv" id="abv"[^>]*?)\s+hidden(?=[\s>])/, "$1");
      if (html === before) throw new Error("R29: no `hidden` on #abv to remove");
      console.log(`page: about/ FAQ visible; FAQPage JSON-LD ${fq ? fq.mainEntity.length + " questions" : "none"}`);
    }
    writeFileSync(f, html);
  }
  if (ROUTES_ON) for (const [k, v] of Object.entries({ "/": { title: TITLES[""], desc: descs[""] || rootDesc }, ...heads }))
    console.log(`page: ${k.padEnd(8)} title "${v.title}"; description ${v.desc.length} chars${descs[k === "/" ? "" : k] ? "" : " (fixed text)"}`);
  if (ROUTES_ON) {   // R26 + R27: sitemap.xml with the section addresses and <lastmod>
    const today = new Date().toISOString().slice(0, 10);
    const lbOn = !lb || Date.parse(lb.to) > Date.now();
    const urls = [["", "hourly"], ...SECS.filter((x) => x.dir !== "limited" || lbOn)
      .map((x) => [x.dir + "/", x.about ? "monthly" : "daily"])];
    writeFileSync(join(dirname(out), "sitemap.xml"), '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      urls.map(([u, f]) => `  <url><loc>${SITE}/${u}</loc><lastmod>${today}</lastmod><changefreq>${f}</changefreq></url>\n`).join("") +
      "</urlset>\n");
    console.log(`page: sitemap ${urls.length} addresses${lb ? `; Limited Battle "${lb.name}" until ${lb.to}` : ""}`);
  }
  console.log(hasSlot ? `page: intro texts ${["", ...SECS.filter((x) => !x.about).map((x) => x.dir)].map((k) => `${k || "/"} ${intro[k] ? intro[k].length + " chars" : "none"}`).join(", ")}`
    : "page: no intro slot in the page (R27)");
  console.log(ROUTES_ON ? `page: routes on${ABOUT_ON ? " (+ about)" : ""}; section pages ${SECS.map((x) => x.dir + "/").join(", ")}` :
    `page: routes off (${ROUTES ? "the page has no routing code yet" : "--no-routes"})`);
  const n = (tags.match(/<(?:title|meta|link|script)\b/gi) || []).length;
  console.log(`page: ${n} head tags moved into <head>`);
}
console.log(`page: ${src} -> ${out}${MINIFY ? ` (minified: ${(body.length / 1024).toFixed(0)} KB -> ` +
  `${(readFileSync(out).length / 1024).toFixed(0)} KB)` : ""}`);
