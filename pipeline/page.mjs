// Make the deploy copy of the page: site/index.html (the artifact page body, copied by the sync-pocket-meta-ui skill)
// -> public/index.html wrapped in the same document skeleton that the Claude artifact adds when it publishes.
// The source site/index.html is never changed (the UI is owned by the artifact).
//
// R7b (Nov 10, 2026): the page starts with its head tags (<title>, <meta>, <link>, <script type="application/ld+json">).
// They are moved into <head>, after the charset and viewport tags, in their order, so that link-preview crawlers and
// search engines find them there. The run of head tags ends at the first other tag (the page's first <style>).
import { readFileSync, writeFileSync } from "node:fs";

const [src = "site/index.html", out = "public/index.html"] = process.argv.slice(2);
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

if (/^\s*(<!--[^>]*-->\s*)?<!doctype html>/i.test(body)) {
  writeFileSync(out, body); // already a full document
} else {
  const { head: tags, rest } = splitHead(body);
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
console.log(`page: ${src} -> ${out}`);
