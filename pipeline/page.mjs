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
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { minify as minifyJS } from "terser";
import { minify as minifyCSS } from "csso";

const args = process.argv.slice(2), MINIFY = !args.includes("--no-minify"), ROUTES = !args.includes("--no-routes");
const SITE = "https://pocketmetaqr.com";
const ROUTE_TAG = '<meta name="pmq-routes" content="1"><base href="/">';
const SECTIONS = [
  { dir: "events", title: "Latest events – Pocket Meta QR",
    desc: "Latest Pokémon TCG Pocket tournament results: top 8 lists with QR codes." },
  { dir: "packs", title: "Booster packs for the meta – Pocket Meta QR",
    desc: "Which Pokémon TCG Pocket booster packs give the cards of this week's meta decks." },
  { dir: "limited", title: "Limited Battle decks – Pocket Meta QR",
    desc: "Hand-picked decks with QR codes for the current Limited Battle event." },
];
const esc = (t) => t.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

// R26: the copy of the page for 1 section folder. Changes only the head part (before </head>).
function sectionPage(html, { dir, title, desc }) {
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
  writeFileSync(out, full);
  if (ROUTES_ON) for (const sec of SECTIONS) {   // R26: events/, packs/, limited/ next to index.html
    const f = join(dirname(out), sec.dir, "index.html");
    mkdirSync(dirname(f), { recursive: true });
    writeFileSync(f, sectionPage(full, sec));
  }
  if (ROUTES_ON && existsSync("static/sitemap.xml")) {   // R26: the section addresses in the sitemap
    const urls = SECTIONS.map((x) => `  <url><loc>${SITE}/${x.dir}/</loc><changefreq>daily</changefreq></url>\n`).join("");
    writeFileSync(join(dirname(out), "sitemap.xml"),
      readFileSync("static/sitemap.xml", "utf8").replace("</urlset>", urls + "</urlset>"));
  }
  console.log(ROUTES_ON ? `page: routes on; section pages ${SECTIONS.map((x) => x.dir + "/").join(", ")}` :
    `page: routes off (${ROUTES ? "the page has no routing code yet" : "--no-routes"})`);
  const n = (tags.match(/<(?:title|meta|link|script)\b/gi) || []).length;
  console.log(`page: ${n} head tags moved into <head>`);
}
console.log(`page: ${src} -> ${out}${MINIFY ? ` (minified: ${(body.length / 1024).toFixed(0)} KB -> ` +
  `${(readFileSync(out).length / 1024).toFixed(0)} KB)` : ""}`);
