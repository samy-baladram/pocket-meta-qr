// Text localization of the page (Nov 23, 2026): find the visible texts of the page and put translations back in.
// Used by i18n/extract.mjs (catalog) and i18n/build.mjs (localized page). No runtime part: a built page is plain HTML/JS.
//
// Container = a place in the page source that holds text: an HTML block (innerHTML of an element with only text and
// inline children), an HTML attribute (aria-label, title, alt, placeholder), a JS string literal or a JS template
// literal. A container is a list of tokens: text, TAG (an HTML tag) and EXPR (a template's ${...}).
// Run = the unit of translation: a piece of a container between "split" tags (layout tags: div, span, button, ...),
// with its inline tags (b, i, a, ...) as {t0}, {t1} and its expressions as {0}, {1} (numbered inside the run).
// In a translation, {0!} = the expression still runs but shows nothing (an English plural "s" in Japanese).
// A run's id = the first 10 hex of SHA-1 of its text. A translation keeps every {n} and {tn} once (order may change).
import { createHash } from "node:crypto";
import { parseFragment } from "parse5";
import * as acorn from "acorn";
import { ancestor } from "acorn-walk";

export const runId = (t) => createHash("sha1").update(t).digest("hex").slice(0, 10);
const HASTEXT = /[A-Za-z]{2,}/;
const INLINE_EL = new Set(["a", "b", "i", "em", "strong", "span", "small", "br", "code", "kbd", "sup", "sub", "abbr", "u", "s", "mark", "wbr", "img", "svg", "path", "circle", "rect", "g", "line", "polyline", "polygon", "use", "time"]);
const KEEP_TAG = /^<\/?(a|b|i|em|strong|u|code|kbd|br|sup|sub|abbr|mark|wbr)\b/i; // inside a run
const TAG = /<\/?[a-zA-Z][^<>]*>/g;
const ATTRS = ["aria-label", "title", "alt", "placeholder"];

// ---- tokens and runs
const MK = 0xe000; // expression i = the private-use character U+E000 + i (a tag can hold expressions: <a href="${x}">)
function tokenize(parts) { // parts: [{s: text} | {e: index}] -> tokens
  const flat = parts.map((p) => ("e" in p ? String.fromCharCode(MK + p.e) : p.s)).join(""), toks = [];
  const text = (str) => { let a = 0; for (let j = 0; j < str.length; j++) { const c = str.charCodeAt(j);
    if (c >= MK && c < MK + 4096) { if (j > a) toks.push({ k: "T", s: str.slice(a, j) }); toks.push({ k: "E", i: c - MK }); a = j + 1; } }
    if (a < str.length) toks.push({ k: "T", s: str.slice(a) }); };
  let last = 0; TAG.lastIndex = 0;
  for (let m; (m = TAG.exec(flat)); last = TAG.lastIndex) {
    if (m.index > last) text(flat.slice(last, m.index));
    toks.push({ k: "G", s: m[0], keep: KEEP_TAG.test(m[0]) });
  }
  if (last < flat.length) text(flat.slice(last));
  return toks;
}
// a tag's source with its expressions: [{s} | {e}] pieces
const tagParts = (s) => { const out = []; let a = 0; for (let j = 0; j < s.length; j++) { const c = s.charCodeAt(j);
  if (c >= MK && c < MK + 4096) { if (j > a) out.push({ s: s.slice(a, j) }); out.push({ e: c - MK }); a = j + 1; } }
  if (a < s.length) out.push({ s: s.slice(a) }); return out; };
const tagExprs = (s) => tagParts(s).filter((p) => "e" in p).map((p) => p.e);
// Runs: maximal token ranges without a split tag; trimmed of leading / trailing tags, expressions and blank text.
function findRuns(toks) {
  const runs = []; let a = 0;
  const flush = (b) => { // [a, b)
    let s = a, e = b;
    const blank = (t) => t.k !== "T" || !t.s.trim();
    // an expression that touches a word ("card${n > 1 ? "s" : ""}") stays in the run: a translation can hide it ({0!})
    const touchEnd = (i) => toks[i].k === "E" && i > s && toks[i - 1].k === "T" && /\S$/.test(toks[i - 1].s);
    const touchStart = (i) => toks[i].k === "E" && i + 1 < e && toks[i + 1].k === "T" && /^\S/.test(toks[i + 1].s);
    while (s < e && blank(toks[s]) && !touchStart(s)) s++;
    while (e > s && blank(toks[e - 1]) && !touchEnd(e - 1)) e--;
    if (s >= e) return;
    // keep leading / trailing whitespace of the first / last text token outside the run
    const txt = toks.slice(s, e).filter((t) => t.k === "T").map((t) => t.s).join("");
    if (!HASTEXT.test(txt.replace(/&[a-z]+;|&#\d+;/g, " "))) return;
    if (/[\w-]+="|<\/?[a-zA-Z]|^[\w-]*"?\s*>/.test(txt)) return; // pieces of a tag built from several strings
    runs.push({ s, e });
  };
  for (let i = 0; i < toks.length; i++) if (toks[i].k === "G" && !toks[i].keep) { flush(i); a = i + 1; }
  flush(toks.length);
  return runs;
}
// Run text with local numbers; map back: {n} -> expression index, {tn} -> tag source.
function runText(toks, r) {
  const ex = [], tg = []; let out = "";
  for (let i = r.s; i < r.e; i++) { const t = toks[i];
    let s = t.k === "T" ? t.s : t.k === "E" ? `{${ex.push(t.i) - 1}}` : `{t${tg.push(t.s) - 1}}`;
    if (t.k === "T") { if (i === r.s) s = s.replace(/^\s+/, ""); if (i === r.e - 1) s = s.replace(/\s+$/, ""); }
    out += s; }
  const lead = toks[r.s].k === "T" ? toks[r.s].s.match(/^\s*/)[0] : "", trail = toks[r.e - 1].k === "T" ? toks[r.e - 1].s.match(/\s*$/)[0] : "";
  return { text: out.replace(/\s+/g, " "), ex, tg, lead, trail };
}
// The translated container: tokens with each translated run replaced. Returns null when nothing changed.
const CJK = /[\u3000-\u30ff\u3400-\u9fff\uff00-\uffef]/;
function applyRuns(toks, runs, tr, ctx = "") {
  let changed = false; const out = []; let i = 0;
  for (const r of runs) {
    const rt = runText(toks, r), t = tr(rt.text, ctx);
    for (; i < r.s; i++) out.push(toks[i]);
    if (t == null || t === rt.text) { for (; i < r.e; i++) out.push(toks[i]); continue; }
    if (tr.cjk) { if (CJK.test(t[0] || "")) rt.lead = ""; if (CJK.test(t[t.length - 1] || "")) rt.trail = ""; } // ja: no spaces next to the text
    const used = new Set(); let bad = false, last = 0; const rep = [{ k: "T", s: rt.lead }];
    const re = /\{(t?)(\d+)(!?)\}/g; // {n} expression, {tn} tag, {n!} expression kept but not shown
    for (let m; (m = re.exec(t)); last = re.lastIndex) {
      if (m.index > last) rep.push({ k: "T", s: t.slice(last, m.index) });
      const n = +m[2], key = m[1] + n;
      if (m[1] ? n >= rt.tg.length || m[3] : n >= rt.ex.length) { bad = true; break; }
      if (!m[1] && used.has(key)) { bad = true; break; } // an expression once (side effects); tags may repeat
      used.add(key); rep.push(m[1] ? { k: "G", s: rt.tg[n], keep: true } : { k: "E", i: rt.ex[n], hide: !!m[3] });
    }
    if (!bad && rt.ex.some((_, n) => !used.has(String(n)))) bad = true;           // every expression kept
    if (!bad && rt.tg.some((_, n) => !used.has("t" + n))) bad = true;             // every tag kept (a lost </b> breaks the page)
    if (!bad) { const inTags = rt.tg.flatMap(tagExprs), seen = new Set(); // a tag with expressions: at most once
      for (const m of t.matchAll(/\{t(\d+)\}/g)) for (const e of tagExprs(rt.tg[+m[1]])) { if (seen.has(e)) bad = true; seen.add(e); }
      if (inTags.some((e) => !seen.has(e))) bad = true; }
    if (bad) { for (; i < r.e; i++) out.push(toks[i]); tr.bad?.(rt.text, t); continue; }
    if (last < t.length) rep.push({ k: "T", s: t.slice(last) });
    rep.push({ k: "T", s: rt.trail });
    out.push(...rep); i = r.e; changed = true;
  }
  for (; i < toks.length; i++) out.push(toks[i]);
  return changed ? out : null;
}

// ---- containers in the page
// cfg: { skipVars: [names of top-level consts whose values are data], skipText: [texts never translated] }
let FORCE = new Set();
export function scan(page, cfg = {}) {
  FORCE = new Set(cfg.forceText || []);
  const C = []; // {kind, s, e, toks, runs, ctx, node?, q?}
  const skipVars = new Set(cfg.skipVars || []), skipText = new Set(cfg.skipText || []), skipIds = new Set(cfg.skipIds || []);
  const frag = parseFragment(page, { sourceCodeLocationInfo: true });
  const skipScript = (el) => { const L = el.sourceCodeLocation, head = page.slice(L.startTag.endOffset, L.startTag.endOffset + 300);
    return (cfg.skipScripts || []).some((x) => head.includes(x)); };
  const leaf = (el) => (el.childNodes || []).every((c) => c.nodeName === "#text" || c.nodeName === "#comment" || (INLINE_EL.has(c.nodeName) && leaf(c)));
  const add = (c) => { c.runs = findRuns(c.toks).filter((r) => !skipText.has(runText(c.toks, r).text)); if (c.runs.length) C.push(c); };
  (function walk(n) {
    for (const c of n.childNodes || []) {
      if (c.nodeName === "script") { if (!(c.attrs || []).some((a) => /ld\+json/.test(a.value)) && !skipScript(c)) js(c); continue; }
      if (c.nodeName === "style" || c.nodeName === "#comment" || c.nodeName === "#text") continue;
      if (skipIds.size && (c.attrs || []).some((a) => a.name === "id" && skipIds.has(a.value))) continue; // English-only section (cfg.skipIds)
      const L = c.sourceCodeLocation;
      for (const a of c.attrs || []) if (ATTRS.includes(a.name) && !a.value.includes("${")) {
        const l = L.attrs[a.name], raw = page.slice(l.startOffset, l.endOffset), q = raw.indexOf('"') >= 0 ? raw.indexOf('"') : raw.indexOf("'");
        if (q < 0) continue;
        add({ kind: "attr", s: l.startOffset + q + 1, e: l.endOffset - 1, toks: [{ k: "T", s: page.slice(l.startOffset + q + 1, l.endOffset - 1) }], ctx: `<${c.nodeName} ${a.name}>` }); }
      // a text block; an inline element counts too when its parent is not one (tab links next to a button)
      if (c.childNodes?.length && leaf(c) && L?.startTag && L.endTag) {
        const s = L.startTag.endOffset, e = L.endTag.startOffset;
        add({ kind: "html", s, e, toks: tokenize([{ s: page.slice(s, e) }]), ctx: `<${c.nodeName}>` }); continue; }
      walk(c);
    }
  })(frag);
  function js(el) {
    const L = el.sourceCodeLocation, base = L.startTag.endOffset, code = page.slice(base, L.endTag.startOffset);
    const ast = acorn.parse(code, { ecmaVersion: "latest", sourceType: "script" });
    const inSkip = (anc) => anc.some((n) => n.type === "VariableDeclarator" && n.id.type === "Identifier" && skipVars.has(n.id.name));
    ancestor(ast, {
      Literal(node, _, anc) {
        if (typeof node.value !== "string" || anc[anc.length - 2].type === "TemplateLiteral" || !isText(node.value, anc) || inSkip(anc)) return;
        add({ kind: "js", s: base + node.start, e: base + node.end, toks: tokenize([{ s: node.value }]), ctx: ctx(code, node.start) }); },
      TemplateLiteral(node, _, anc) {
        if (anc[anc.length - 2].type === "TaggedTemplateExpression" || inSkip(anc)) return;
        const parts = []; node.quasis.forEach((q, i) => { parts.push({ s: q.value.cooked }); if (i < node.expressions.length) parts.push({ e: i }); });
        const flat = parts.map((p) => ("e" in p ? `{${p.e}}` : p.s)).join("");
        if (!isText(flat, anc)) return;
        add({ kind: "tpl", s: base + node.start, e: base + node.end, toks: tokenize(parts), ctx: ctx(code, node.start),
          ex: node.expressions.map((x) => [base + x.start, base + x.end]) }); },
    });
  }
  C.sort((a, b) => a.s - b.s || b.e - a.e);
  return C;
}
const ctx = (code, i) => code.slice(Math.max(0, i - 60), i).replace(/\s+/g, " ").slice(-60);
const SKIP_CALLS = new Set(["querySelector", "querySelectorAll", "getElementById", "closest", "matches", "addEventListener", "removeEventListener",
  "getItem", "setItem", "removeItem", "getAttribute", "setAttribute", "removeAttribute", "hasAttribute", "toggleAttribute", "contains",
  "fetch", "postMessage", "dispatchEvent", "createElement", "createElementNS", "setProperty", "getPropertyValue", "track", "startsWith", "endsWith",
  "includes", "split", "indexOf", "replace", "replaceAll", "test", "exec", "match", "RegExp", "has", "delete", "matchMedia", "Intl", "join",
  "toLocaleDateString", "toLocaleTimeString", "toLocaleString", "DateTimeFormat", "NumberFormat", "Function", "eval", "importScripts", "register", "open"]);
const ASSIGN_CODE = new Set(["className", "id", "href", "src", "type", "rel", "cssText", "display", "hash", "search", "pathname", "transform", "transition",
  "cursor", "width", "height", "background", "color", "opacity", "srcset", "sizes", "loading", "decoding", "content", "name", "value", "role"]);
const CODE_KEYS = new Set(["rootMargin", "threshold", "behavior", "block", "inline", "easing", "fill", "direction", "timeZone", "weekday", "month",
  "day", "year", "hour", "minute", "style", "currency", "unit", "cache", "credentials", "mode", "method", "type", "kind", "id", "key", "cls", "class", "sel", "src",
  "href", "url", "path", "icon", "img", "art", "lang", "event", "path"]);
function isText(text, anc) {
  const me = anc[anc.length - 1], p = anc[anc.length - 2];
  const plain = text.replace(TAG, " ").replace(/\{\d+\}/g, " ").replace(/&[a-z]+;|&#\d+;/g, " ");
  if (!HASTEXT.test(plain)) return false;
  if (p.type === "Property" && p.key === me) return false;
  if (p.type === "BinaryExpression" && ["===", "!==", "==", "!=", "in", "instanceof"].includes(p.operator)) return false;
  if (p.type === "SwitchCase" || (p.type === "MemberExpression" && p.property === me)) return false;
  if (p.type === "CallExpression" || p.type === "NewExpression") { const c = p.callee; const nm = c.type === "MemberExpression" ? (c.property.name || c.property.value) : c.name;
    if (SKIP_CALLS.has(nm)) return false; }
  if (p.type === "AssignmentExpression" && p.left.type === "MemberExpression" && ASSIGN_CODE.has(p.left.property.name)) return false;
  const t = plain.trim();
  if (FORCE.has(t)) return true;                                                                          // config forceText
  if (t.split(/\s+/).every((w) => /^[-+]?\d[\d.]*(px|em|rem|%|vh|vw|vmax|vmin|s|ms|deg|fr|x|dpi)?$|^(auto|none|0)$/i.test(w))) return false; // CSS values
  if (p.type === "Property" && CODE_KEYS.has(p.key.name || p.key.value)) return false;                    // {rootMargin: "300px 0px"}
  if (/^(https?:|data:|mailto:|\/|\.\/|#)/.test(text.trim()) || /^[a-z][\w-]*\/[\w./-]*$/.test(t)) return false;  // addresses, paths
  if (/[;{}]/.test(t) && /[a-z-]+\s*:\s*[^;]+;?/.test(t) && !/[.!?]\s*$/.test(t)) return false;           // CSS text
  if (/^\(?(min|max)-(width|height)|^@media|^[\w-]+\([^)]*\)$/.test(t)) return false;                     // media queries, css functions
  const glued = (/^\s|\s$/.test(text) || /\{\d+\}\s|\s\{\d+\}/.test(text)) && !/^\s*$/.test(text)            // " smaller", "${n} cards": glued text
    && !/^(px|em|rem|vh|vw|vmin|vmax|ms|s|deg|fr|x|auto)$/i.test(t);
  if (!glued && !/\s/.test(t) && !/^[A-Z][a-z]/.test(t) && !/[<]/.test(text)) return false;               // one lower-case word: a key
  if (/^[\w$.#:\[\]=>~+*^|-]+$/.test(t) && /[.#\[:]/.test(t)) return false;                               // selectors
  return true;
}

// ---- catalog: unique runs
export function catalog(page, cfg) {
  const C = scan(page, cfg), map = new Map();
  for (const c of C) for (const r of c.runs) {
    const { text } = runText(c.toks, r), id = runId(text);
    const x = map.get(id) || (map.set(id, { id, en: text, where: [] }), map.get(id));
    if (x.where.length < 3) x.where.push(`${c.kind} ${c.ctx.slice(-40)}`);
  }
  return [...map.values()];
}

// ---- build: the page with translations; tr(en) -> translation or null
export function translatePage(page, cfg, tr) {
  const C = scan(page, cfg);
  // nested containers: a template's expressions can hold other containers; rewrite inside out
  const inside = (a, b) => b.s >= a.s && b.e <= a.e && b !== a;
  const top = C.filter((c) => !C.some((o) => inside(o, c)));
  const kids = (c) => C.filter((o) => inside(c, o) && !C.some((m) => m !== c && inside(c, m) && inside(m, o)));
  let nChanged = 0;
  function rewrite(s, e, list) { // page[s, e) with the containers in list (sorted) rewritten
    let out = "", at = s;
    for (const c of list) { out += page.slice(at, c.s) + emit(c); at = c.e; }
    return out + page.slice(at, e);
  }
  function emit(c) {
    const sub = kids(c);
    const exprSrc = (i) => { const [a, b] = c.ex[i]; return rewrite(a, b, sub.filter((k) => k.s >= a && k.e <= b)); };
    const toks = applyRuns(c.toks, c.runs, tr, c.ctx);
    if (!toks) { // text unchanged: keep the source, but its nested containers may change
      return sub.length ? rewrite(c.s, c.e, sub) : page.slice(c.s, c.e); }
    nChanged++;
    const txt = (t) => t.k === "T" || t.k === "G" ? t.s : "";
    const esc = (x) => x.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
    if (c.kind === "tpl") return "`" + toks.map((t) => (t.k === "E" ? (t.hide ? "${(" + exprSrc(t.i) + ', "")}' : "${" + exprSrc(t.i) + "}")
      : tagParts(txt(t)).map((p) => ("e" in p ? "${" + exprSrc(p.e) + "}" : esc(p.s))).join(""))).join("") + "`";
    if (c.kind === "js") return JSON.stringify(toks.map(txt).join("")).replace(/<\/script/gi, "<\\/script");
    if (c.kind === "attr") return toks.map(txt).join("").replace(/"/g, "&quot;");
    return toks.map(txt).join(""); // html
  }
  return { html: rewrite(0, page.length, top), changed: nChanged, containers: C.length };
}
