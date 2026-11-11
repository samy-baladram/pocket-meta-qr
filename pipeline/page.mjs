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
import { readFileSync, writeFileSync } from "node:fs";
import { minify as minifyJS } from "terser";
import { minify as minifyCSS } from "csso";

const args = process.argv.slice(2), MINIFY = !args.includes("--no-minify");
const [src = "site/index.html", out = "public/index.html"] = args.filter((a) => !a.startsWith("--"));
const body = readFileSync(src, "utf8");

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
  writeFileSync(out, head + rest + "\n</body></html>\n");
  const n = (tags.match(/<(?:title|meta|link|script)\b/gi) || []).length;
  console.log(`page: ${n} head tags moved into <head>`);
}
console.log(`page: ${src} -> ${out}${MINIFY ? ` (minified: ${(body.length / 1024).toFixed(0)} KB -> ` +
  `${(readFileSync(out).length / 1024).toFixed(0)} KB)` : ""}`);
