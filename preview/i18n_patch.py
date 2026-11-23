"""Language preview for Pocket Meta QR (Nov 23, 2026): patch the live page (site/index.html) into the /preview/ page.
python3 preview/i18n_patch.py <in.html> <out.html>      (site.yml runs it on every build; a failed check = no preview)
1. Card images: every card image path gets the prefix IMGP ("" = English, else "i18n/<lang>/"); a card with no
   localized file falls back to the English file.
2. Names (de, ja): deck, card, set and pack names from i18n/names.<lang>.json (pipeline/i18n_names.mjs), switched in
   the data as it loads (normQ, events.json, packs.json, cards.json). English names stay in nameEn / nEn.
3. A language picker next to the dark-mode button (#langSel, localStorage pmq-lang; default = the browser language
   when the game has it). German and Japanese have their own text pages (/preview/de/, /preview/ja/: i18n/build.mjs,
   PMQ_LANG set by site.yml); a change opens the right page (other languages: card images on the English page)."""
import re, sys
src, dst = sys.argv[1], sys.argv[2]
s = open(src, encoding="utf8").read()
assert "IMGP" not in s, "already patched"
s, n = re.subn(r'(["\'`])(c|z)/\$\{', r'\1${IMGP}\2/${', s)
print("paths prefixed:", n)
def one(old, new):
    global s
    assert s.count(old) == 1, old[:60]
    s = s.replace(old, new, 1)
css = ".theme-btn svg { width: 16px; height: 16px; display: block; stroke-width: 2; }\n"
one(css, css + "/* Nov 23 (i18n test): card language picker, the theme button's style, left of it */\n"
  ".lang-btn { right: 40px; width: auto; min-width: 32px; padding: 0 9px; border-radius: 16px; appearance: none; -webkit-appearance: none;\n"
  "  font-weight: 700; font-size: 11px; line-height: 32px; font-family: inherit; letter-spacing: 0.04em; text-align: center; text-align-last: center; }\n")
btn = '<button class="theme-btn" id="themeBtn" type="button" aria-label="Switch to dark mode"></button>'
opts = "".join(f'<option value="{v}">{v.upper()}</option>' for v in ["en","de","es","fr","it","ja","ko","pt","zh"])
one(btn, btn + f'\n    <select class="theme-btn lang-btn" id="langSel" aria-label="Language" title="Language (card images and names)">{opts}</select>')
top = '  const $ = (id) => document.getElementById(id);\n'
one(top, top + r'''  // Nov 23 (i18n test): card image language. IMGP = the path prefix of every card image ("" = English).
  // Saved choice, else the browser language, else English. var: set before any code that builds an image path.
  var LANGS_I = ["de", "es", "fr", "it", "ja", "ko", "pt", "zh"];
  // A text page (/preview/de/, /preview/ja/: the build sets PMQ_LANG) has its language; else the saved choice, else the
  // browser language. On the English page a German / Japanese choice opens that page (text languages: TXT_L).
  var TXT_L = ["de", "ja"], PG_L = (typeof PMQ_LANG === "string" && PMQ_LANG) || "en";
  var IMGL = (() => { if (PG_L !== "en") return PG_L; let l = null; try { l = localStorage.getItem("pmq-lang"); } catch (err) {}
    if (l === "en" || LANGS_I.includes(l)) return l;
    const b = String(navigator.language || "").toLowerCase().slice(0, 2); return LANGS_I.includes(b) ? b : "en"; })();
  var langPath = (l) => "/preview/" + (TXT_L.includes(l) ? l + "/" : "");
  if (PG_L === "en" && TXT_L.includes(IMGL) && /^\/preview\/?$/.test(location.pathname)) location.replace(langPath(IMGL) + location.hash);
  var IMGP = IMGL === "en" ? "" : `i18n/${IMGL}/`;
  // Names (de, ja): i18n/names.<lang>.json = {n: {English card name: name}, s: {set code: set name}}. Other languages:
  // card images only, English names.
  var LANG_N = ["de", "ja"].includes(IMGL) ? IMGL : "en", L10N = null;
  var L10NP = LANG_N === "en" ? Promise.resolve(null) : fetch(`i18n/names.${LANG_N}.json`).then((r) => (r.ok ? r.json() : null)).then((j) => (L10N = j)).catch(() => null);
  try { document.documentElement.lang = IMGL; } catch (err) {}
  var trCard = (en) => (L10N && en && L10N.n[en]) || en;
  var trDeck = (en) => { // a deck name = card names: "Mega Charizard Y ex Entei ex" -> each name (longest first); else English
    if (!L10N || !en) return en; const w = en.split(" "), out = []; let i = 0;
    while (i < w.length) { let k = Math.min(w.length, i + 6), hit = null;
      for (; k > i; k--) { const x = L10N.n[w.slice(i, k).join(" ")]; if (x) { hit = x; break; } }
      if (!hit) return en; out.push(hit); i = k; }
    return out.join(LANG_N === "ja" ? "・" : " "); };
  var trPack = (en) => { if (!L10N || !en) return en; const a = L10N.n[en]; if (a) return a; // a pack = a Pokémon: "Mega Blaziken" = the card name without ex
    const b = L10N.n[en + " ex"]; return b ? b.replace(/[-\s]?ex$/, "") : en; };
  var trSet = (code, en) => { if (!L10N) return en; // set codes: "b4a" in the site data, "B4a" in the file
    if (!L10N.sl) { L10N.sl = {}; for (const [k, v] of Object.entries(L10N.s || {})) L10N.sl[k.toLowerCase()] = v; }
    return L10N.sl[String(code || "").toLowerCase()] || en; };
  // the place in the data ("3rd of 110") in the page language
  var trPl = (s) => { const m = /^(\d+)(?:st|nd|rd|th) of (\d+)$/.exec(s); if (!m || !PG_L) return s;
    return PG_L === "ja" ? `${m[1]}位／${m[2]}名` : PG_L === "de" ? `${m[1]}. von ${m[2]}` : s; };
  var l10nDeep = (o) => { if (!L10N || !o || typeof o !== "object") return o;
    if (Array.isArray(o)) { o.forEach(l10nDeep); return o; }
    if (typeof o.name === "string" && Array.isArray(o.art)) { if (!("nameEn" in o)) o.nameEn = o.name; o.name = trDeck(o.nameEn); }
    if (typeof o.n === "string" && typeof o.id === "string" && /^[a-z0-9]+-\d+$/.test(o.id)) { if (!("nEn" in o)) o.nEn = o.n; o.n = trCard(o.nEn); }
    if (typeof o.pl === "string") o.pl = trPl(o.pl);
    if (typeof o.setName === "string" && typeof o.set === "string") { if (!("setNameEn" in o)) o.setNameEn = o.setName; o.setName = trSet(o.set, o.setNameEn); }
    for (const v of Object.values(o)) if (v && typeof v === "object") l10nDeep(v);
    return o; };
''')
rawc = '  const RAWC = "https://raw.githubusercontent.com/PocketDecks/'
one(rawc, r'''  // Nov 23 (i18n test): a card with no localized file (i18n/<lang>/c|z/<id>.webp) falls back to the English file.
  // window capture: runs before the other image error handlers (document capture, and the z/ -> c/ one).
  const I18N_RE = /(^|\/)i18n\/[a-z]{2}\/([cz]\/[a-z0-9]+-\d+\.webp)/;
  // Nov 23: booster packs on a localized page: the game's art without the set logo (i18n/p/, one image for all
  // languages); a pack with no such file (C1, promos) falls back to the English image (p/).
  const PKP = () => (IMGP ? "i18n/" : ""), PK_RE = /(^|\/)i18n\/(p\/[a-z0-9-]+\.webp)/;
  addEventListener("error", (e) => { const im = e.target; if (!(im instanceof HTMLImageElement)) return;
    const src = im.getAttribute("src") || ""; if (!PK_RE.test(src)) return;
    e.stopImmediatePropagation(); im.src = src.replace(PK_RE, "$1$2"); }, true);
  addEventListener("error", (e) => { const im = e.target; if (!(im instanceof HTMLImageElement)) return;
    const src = im.getAttribute("src") || ""; if (!I18N_RE.test(src)) return;
    e.stopImmediatePropagation(); im.src = src.replace(I18N_RE, "$1$2"); }, true);
  function setImgLang(l) { // Nov 23: the language changes names too, so the page loads again (re-points images first)
    IMGL = l; IMGP = l === "en" ? "" : `i18n/${l}/`; try { localStorage.setItem("pmq-lang", l); } catch (err) {}
    const fix = (v) => v.replace(/(^|\/)(?:i18n\/[a-z]{2}\/)?([cz]\/[a-z0-9]+-\d+\.webp)/, `$1${IMGP}$2`);
    document.querySelectorAll("img").forEach((im) => { for (const a of ["src", "data-src"]) { const v = im.getAttribute(a);
      if (v && !v.startsWith("http") && /(^|\/)(i18n\/[a-z]{2}\/)?[cz]\/[a-z0-9]+-\d+\.webp/.test(v)) im.setAttribute(a, fix(v)); } });
    try { track("card-lang-" + l); } catch (err) {}
    setTimeout(() => { const to = langPath(l); if (location.pathname !== to) location.href = to + location.hash; else location.reload(); }, 150); }
''' + rawc)
th = '  $("themeBtn").addEventListener("click", () => {'
one(th, '  { const ls = $("langSel"); ls.value = IMGL; ls.addEventListener("change", () => setImgLang(ls.value)); }\n' + th)

one("  const normQ = (o) => { if (Array.isArray(o)) o.forEach(normQ); else if (o && typeof o === \"object\") { if (o.q && !o.qr) o.qr = o.q; Object.values(o).forEach(normQ); } return o; };",
    "  const normQ1 = (o) => { if (Array.isArray(o)) o.forEach(normQ1); else if (o && typeof o === \"object\") { if (o.q && !o.qr) o.qr = o.q; Object.values(o).forEach(normQ1); } return o; };\n"
    "  const normQ = (o) => l10nDeep(normQ1(o)); // i18n preview: names in the chosen language")
one("    .then((j) => {\n      data = normQ(j);", "    .then((j) => L10NP.then(() => j)) // i18n preview: names first\n    .then((j) => {\n      data = normQ(j);")
one(".then((j) => { SJ = j; if (!$(\"filt\").hidden) renderSug(); })",
    ".then((j) => L10NP.then(() => { SJ = l10nDeep(j); if (!$(\"filt\").hidden) renderSug(); }))")  # search.json: card names
one("noex: (d) => !(d.cards || []).some((c) => isEx(c.n)),", "noex: (d) => !(d.cards || []).some((c) => isEx(c.nEn || c.n)),")  # the English name has \" ex\"
one('({ id, name, energy, art, qr: q, nv: 1, lb: 1, k, rank: k + 1, deckName: name,', '({ id, nameEn: name, get name() { return trDeck(this.nameEn); }, set name(v) { this.nameEn = v; }, get deckName() { return trDeck(this.nameEn); }, set deckName(v) { this.nameEn = v; }, energy, art, qr: q, nv: 1, lb: 1, k, rank: k + 1,')  # Limited Battle deck names: in the page language when shown (names load later)
one('cards: cards.map(([cid, n, c]) => ({ id: cid, n, c })), note: LB.notes[id] || null', 'cards: cards.map(([cid, n, c]) => ({ id: cid, nEn: n, get n() { return trCard(this.nEn); }, set n(v) { this.nEn = v; }, c })), note: LB.notes[id] || null')  # Limited Battle card names in the page language
one('<img data-src="p/${esc(x.img)}.webp', '<img data-src="${PKP()}p/${esc(x.img)}.webp')  # pack art without logo (i18n/p/) on a localized page
one('<img src="p/${esc(x.img)}.webp', '<img src="${PKP()}p/${esc(x.img)}.webp')  # pack art without logo (i18n/p/) on a localized page
one('src="p/${p.img}.webp"', 'src="${PKP()}p/${p.img}.webp"')  # pack art without logo (i18n/p/) on a localized page
one('return { ...v, id: `${v.deck}-${e.tid}-${v.pl}`, name: dk.name || v.deck, art: dk.art || [], rank: v.pl, nv: 1, pl: v.place,', 'return { ...v, id: `${v.deck}-${e.tid}-${v.pl}`, name: dk.name || v.deck, art: dk.art || [], rank: v.pl, nv: 1, pl: v.place && trPl(v.place),')  # event lists: the place pill in the page language
one(".then((j) => (EV = j))", ".then((j) => L10NP.then(() => (EV = l10nDeep(j))))")
one("for (const [nr, id, n] of j.c) { byId.set(id, nr); if (n) byNr.set(nr, { id, n });", "for (const [nr, id, n] of j.c) { byId.set(id, nr); if (n) byNr.set(nr, { id, n: trCard(n) });")
one(".then((r) => (r.ok ? r.json() : null)).then((j) => (PK = j))",
    ".then((r) => (r.ok ? r.json() : null)).then((j) => L10NP.then(() => { if (j && L10N) { const sn = {}; for (const [k, x] of Object.entries(j.sets || {})) { sn[k] = x.name; x.name = trSet(k, x.name); } for (const x of Object.values(j.packs || {})) x.name = x.name === sn[x.set] ? j.sets[x.set].name : trPack(x.name); } return (PK = j); }))")
open(dst, "w", encoding="utf8").write(s)
