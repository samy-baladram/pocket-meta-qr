"""Language preview for Pocket Meta QR (Nov 23, 2026): patch the live page (site/index.html) into the /preview/ page.
python3 preview/i18n_patch.py <in.html> <out.html>      (site.yml runs it on every build; a failed check = no preview)
1. Card images: every card image path gets the prefix IMGP ("" = English, else "i18n/<lang>/"); a card with no
   localized file falls back to the English file.
2. Names (de, es, ja, pt): deck, card, set and pack names from i18n/names.<lang>.json (pipeline/i18n_names.mjs), switched in
   the data as it loads (normQ, events.json, packs.json, cards.json). English names stay in nameEn / nEn.
3. Language menu (Nov 23, Phase 1 design B): a globe pill left of the dark-mode button (#langBtn) opens a raised panel
   (#langPop) with every game language in its own script. LIVE_L (English; 日本語 and Español with a Beta tag) can be chosen; the others
   show "Coming soon" / 準備中 and do nothing. A choice is saved (localStorage pmq-lang) and opens that language's page
   (/preview/ja/: i18n/build.mjs, PMQ_LANG set by the build). No redirect by browser language."""
import re, sys
src, dst = sys.argv[1], sys.argv[2]
MENU_ONLY = "--menu-only" in sys.argv[3:]   # Phase 1 (Nov 23): the English live page gets only the language menu
s = open(src, encoding="utf8").read()
assert "IMGP" not in s and "langBtn" not in s, "already patched"
def one(old, new):
    global s
    assert s.count(old) == 1, old[:60]
    s = s.replace(old, new, 1)
css = ".theme-btn svg { width: 16px; height: 16px; display: block; stroke-width: 2; }\n"
one(css, css + """/* Nov 23 (i18n, Phase 1 design B): language menu = a globe pill left of the theme button + a raised panel */
/* Nov 23 layout pass: languages with longer words (the build sets <html lang> on a language page; English unchanged) */
html:not([lang="en"]) body { -webkit-hyphens: auto; hyphens: auto; }
html:not([lang="en"]) .sgc span, html:not([lang="en"]) .pkr-n b, html:not([lang="en"]) .swpl { overflow-wrap: anywhere; }
html:not([lang="en"]) .hsec { white-space: normal; text-overflow: clip; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; line-height: 1.2; }
html:not([lang="en"]) .pk-lh { align-items: center; gap: 8px; } html:not([lang="en"]) .pk-lh > :first-child { min-width: 0; }
html:not([lang="en"]) .pk-lh .t1s-seg { flex: none; } html:not([lang="en"]) .pk-lh .t1s-seg button { white-space: nowrap; padding: 0 10px; }
html:not([lang="en"]) .evsub, html:not([lang="en"]) .evsub > span { flex-wrap: wrap; row-gap: 1px; }
html:not([lang="en"]) .pkr-n small { white-space: normal; overflow-wrap: anywhere; }
html:not([lang="en"]) :root .swt .swpl, html:not([lang="en"]) .swpl { white-space: normal; text-align: center; }
html:not([lang="en"]) .t1s-h > :first-child { flex: none; white-space: nowrap; }
html:not([lang="en"]) .t1s-lab > div { inset: 0 10px; gap: 0 4px; font-size: 12px; flex-wrap: wrap; align-content: center; line-height: 1.2; } /* the name keeps its line; the rest moves under it */
/* Nov 23: sections a language does not translate yet (EN_ONLY in the page script) get a short note at the top */
[data-en-only]::before { content: attr(data-en-only); display: block; margin: 0 0 12px; padding: 9px 12px; border-radius: 12px;
  font-size: 13px; line-height: 1.35; color: var(--muted); background: var(--surface, #fff); box-shadow: inset 0 0 0 1px var(--line-strong, #c9d6e2); }
.lang-btn { right: 40px; width: auto; gap: 5px; padding: 0 10px 0 9px; border-radius: 16px; display: flex; align-items: center;
  font: 700 12px/1 inherit; letter-spacing: 0.02em; }
.lang-btn svg.chev { width: 12px; height: 12px; }
.lang-pop { position: absolute; z-index: 59; /* above the title row (.hrow, z 20, later in the page) and the tab band */ top: 32px; right: 0; width: 264px; padding: 10px; border-radius: 18px;
  background: var(--surface); box-shadow: var(--raised), var(--bevel); }
.lang-pop[hidden] { display: none; }
.lang-pop h2 { margin: 2px 0 8px; font-size: 12px; font-weight: 700; color: var(--muted); text-align: center; }
.lang-pop ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.lang-pop button { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 38px;
  padding: 0 14px; border: 0; border-radius: 19px; font: 600 14px/1.2 inherit; color: var(--ink); background: var(--surface);
  box-shadow: var(--raised), var(--bevel); cursor: pointer; text-align: left; }
.lang-pop button[aria-checked="true"] { background: var(--ink); color: var(--surface); box-shadow: none; }
.lang-pop button[aria-disabled="true"] { cursor: default; color: var(--muted); box-shadow: none; background: transparent; opacity: 0.75; }
.lang-tag { flex: none; font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 9px; letter-spacing: 0.03em; }
.lang-tag.beta { background: #ffe08a; color: #6b4a00; }
.lang-tag.soon { background: transparent; color: var(--muted); box-shadow: inset 0 0 0 1px var(--line-strong, #c9d6e2); }
""")
btn = '<button class="theme-btn" id="themeBtn" type="button" aria-label="Switch to dark mode"></button>'
GLOBE = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
         '<circle cx="12" cy="12" r="9"/><path d="M3.6 9h16.8M3.6 15h16.8M11.5 3a17 17 0 0 0 0 18M12.5 3a17 17 0 0 1 0 18"/></svg>')
CHEV = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>'
one(btn, btn + f'\n    <button class="theme-btn lang-btn" id="langBtn" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="langPop">{GLOBE}<span id="langCur">EN</span>{CHEV}</button>'
    '\n    <div class="lang-pop" id="langPop" hidden><h2 id="langTtl">Language</h2><ul id="langList" role="radiogroup" aria-labelledby="langTtl"></ul></div>')
th = '  $("themeBtn").addEventListener("click", () => {'
MENU_JS = r"""  { const LN = [["en", "English", "EN"], ["ja", "日本語", "日本語"], ["de", "Deutsch", "DE"], ["es", "Español", "ES"], ["fr", "Français", "FR"],
      ["it", "Italiano", "IT"], ["pt", "Português (Brasil)", "PT"], ["ko", "한국어", "KO"], ["zh", "繁體中文", "ZH"]];
    const JA = PG_L === "ja", btn = $("langBtn"), pop = $("langPop"), list = $("langList"), cur = LN.find((x) => x[0] === PG_L) || LN[0];
    const ES = PG_L === "es", PT = PG_L === "pt"; $("langCur").textContent = cur[2]; $("langTtl").textContent = JA ? "言語" : ES || PT ? "Idioma" : "Language";
    btn.setAttribute("aria-label", (JA ? "言語：" : ES || PT ? "Idioma: " : "Language: ") + cur[1]);
    list.innerHTML = LN.map(([c, n]) => { const live = LIVE_L.includes(c), on = c === PG_L;
      const tag = c === "ja" || c === "es" ? `<span class="lang-tag beta">${JA ? "ベータ" : "Beta"}</span>` : live ? "" : `<span class="lang-tag soon">${JA ? "準備中" : ES ? "Próximamente" : PT ? "Em breve" : "Coming soon"}</span>`;
      return `<li><button type="button" role="radio" lang="${c}" data-l="${c}" aria-checked="${on}"${live || on ? "" : ' aria-disabled="true"'}>${n}${tag}</button></li>`; }).join("");
    const close = (f) => { pop.hidden = true; btn.setAttribute("aria-expanded", "false"); if (f) btn.focus(); };
    btn.addEventListener("click", (e) => { e.stopPropagation(); const o = pop.hidden; pop.hidden = !o; btn.setAttribute("aria-expanded", String(o));
      if (o) (list.querySelector('[aria-checked="true"]') || list.querySelector("button")).focus(); });
    list.addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b || b.getAttribute("aria-disabled") === "true") return;
      const l = b.dataset.l; close(); if (l !== PG_L) setImgLang(l); });
    document.addEventListener("click", (e) => { if (!pop.hidden && !pop.contains(e.target)) close(); });
    pop.addEventListener("keydown", (e) => { const bs = [...list.querySelectorAll("button")], i = bs.indexOf(document.activeElement);
      if (e.key === "Escape") close(true); else if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault();
        bs[(i + (e.key === "ArrowDown" ? 1 : bs.length - 1)) % bs.length].focus(); } }); }
"""

MINI_JS = r"""  // Phase 1 (Nov 23): language menu on the English site (preview/i18n_patch.py --menu-only). The English page stays
  // English; a saved choice of a live language (pmq-lang, set in the menu) opens that page from the home address.
  var TXT_L = ["ja", "es"], LIVE_L = ["en", "ja", "es"], PG_L = "en", langPath = (l) => "/" + (l === "en" ? "" : l + "/");
  (() => { let l = null; try { l = localStorage.getItem("pmq-lang"); } catch (err) {}
    if (l && l !== "en" && LIVE_L.includes(l) && /^\/(index\.html)?$/.test(location.pathname)) location.replace(langPath(l) + location.hash); })();
  function setImgLang(l) { try { localStorage.setItem("pmq-lang", l); } catch (err) {} try { track("lang-" + l); } catch (err) {}
    // the same view on the one-page /ja/: /events/ -> #events, /limited/ -> #limited, /decks/<id>/ -> #<id>, /packs/ -> Packs tab
    const m = location.pathname.match(/^\/(events|limited|packs|decks)\/(?:([a-z0-9-]+)\/)?/); let h = location.hash;
    if (m) { if (m[1] === "decks") h = m[2] ? "#" + m[2] : ""; else if (m[1] === "packs") { h = ""; try { localStorage.setItem("pmq-tab", "packs"); } catch (err) {} } else h = "#" + m[1]; }
    location.href = langPath(l) + h; }
"""
top = '  const $ = (id) => document.getElementById(id);\n'
if MENU_ONLY:
    one(top, top + MINI_JS)
    one(th, MENU_JS + th)
    open(dst, "w", encoding="utf8").write(s)
    print("menu only:", dst)
    sys.exit(0)
one(th, MENU_JS + th)
if not MENU_ONLY:
    s, n = re.subn(r'(["\'`])(c|z)/\$\{', r'\1${IMGP}\2/${', s)
    print("paths prefixed:", n)
one(top, top + r'''  // Nov 23 (i18n test): card image language. IMGP = the path prefix of every card image ("" = English).
  // Saved choice, else the browser language, else English. var: set before any code that builds an image path.
  var LANGS_I = ["de", "es", "fr", "it", "ja", "ko", "pt", "zh"];
  // Phase 1 (Nov 23): the page language = its text, names and card images. A text page (/preview/ja/ ...: the build
  // sets PMQ_LANG) has its language. The English page stays English (no redirect by browser language), but a saved
  // choice of a live language (pmq-lang, set in the menu) opens that page. LIVE_L: the languages the menu offers.
  var TXT_L = ["de", "es", "ja", "pt"], LIVE_L = ["en", "ja", "es"], PG_L = (typeof PMQ_LANG === "string" && PMQ_LANG) || "en";
  var IMGL = (() => { if (PG_L !== "en") return PG_L; let l = null; try { l = localStorage.getItem("pmq-lang"); } catch (err) {}
    return l && l !== "en" && LIVE_L.includes(l) && TXT_L.includes(l) ? l : "en"; })();
  // PMQ_ROOT (set by the build): the English page's folder, "/preview/" (test) or "/" (the live /ja/ page)
  var PMQ_R = (typeof PMQ_ROOT === "string" && PMQ_ROOT) || "/preview/", langPath = (l) => PMQ_R + (TXT_L.includes(l) ? l + "/" : "");
  if (PG_L === "en" && IMGL !== "en" && (location.pathname === PMQ_R || location.pathname === PMQ_R + "index.html")) location.replace(langPath(IMGL) + location.hash);
  var IMGP = IMGL === "en" ? "" : `i18n/${IMGL}/`;
  // Names (de, es, ja, pt): i18n/names.<lang>.json = {n: {English card name: name}, s: {set code: set name}}. Other languages:
  // card images only, English names.
  var LANG_N = TXT_L.includes(IMGL) ? IMGL : "en", L10N = null;
  var L10NP = LANG_N === "en" ? Promise.resolve(null) : fetch(`i18n/names.${LANG_N}.json`).then((r) => (r.ok ? r.json() : null)).then((j) => (L10N = j)).catch(() => null);
  try { document.documentElement.lang = IMGL === "pt" ? "pt-BR" : IMGL; } catch (err) {}
  // Nov 23: sections in English only on a language page (not translated yet): a note at the top of each.
  // new = What's new (#nwl), limited = Limited Battle (#lbl).
  var EN_ONLY = { de: ["new"], es: ["new", "limited"], pt: ["new", "limited"] }, EN_ONLY_T = { de: "Dieser Bereich ist vorerst nur auf Englisch verfügbar.",
    es: "Esta sección solo está disponible en inglés por ahora.", pt: "Por enquanto, esta seção só está disponível em inglês." };
  if (EN_ONLY[PG_L]) addEventListener("DOMContentLoaded", () => { for (const [k, id] of [["new", "nwl"], ["limited", "lbl"]]) {
    const el = document.getElementById(id); if (el && EN_ONLY[PG_L].includes(k)) { el.setAttribute("data-en-only", EN_ONLY_T[PG_L]); el.lang = "en"; } } });
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
    return PG_L === "ja" ? `${m[1]}位／${m[2]}名` : PG_L === "de" ? `${m[1]}. von ${m[2]}` : PG_L === "es" ? `${m[1]}.º de ${m[2]}` : PG_L === "pt" ? `${m[1]}º de ${m[2]}` : s; };
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
  // Nov 24: booster pack art and icons are the English images (p/) on every language page (the owner's choice: the
  // logo-free art was not sharp and had other dimensions).
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


one("  const normQ = (o) => { if (Array.isArray(o)) o.forEach(normQ); else if (o && typeof o === \"object\") { if (o.q && !o.qr) o.qr = o.q; Object.values(o).forEach(normQ); } return o; };",
    "  const normQ1 = (o) => { if (Array.isArray(o)) o.forEach(normQ1); else if (o && typeof o === \"object\") { if (o.q && !o.qr) o.qr = o.q; Object.values(o).forEach(normQ1); } return o; };\n"
    "  const normQ = (o) => l10nDeep(normQ1(o)); // i18n preview: names in the chosen language")
one("    .then((j) => {\n      data = normQ(j);", "    .then((j) => L10NP.then(() => j)) // i18n preview: names first\n    .then((j) => {\n      data = normQ(j);")
one(".then((j) => { SJ = j; if (!$(\"filt\").hidden) renderSug(); })",
    ".then((j) => L10NP.then(() => { SJ = l10nDeep(j); if (!$(\"filt\").hidden) renderSug(); }))")  # search.json: card names
one("noex: (d) => !(d.cards || []).some((c) => isEx(c.n)),", "noex: (d) => !(d.cards || []).some((c) => isEx(c.nEn || c.n)),")  # the English name has \" ex\"
one('({ id, name, energy, art, qr: q, nv: 1, lb: 1, k, rank: k + 1, deckName: name,', '({ id, nameEn: name, get name() { return trDeck(this.nameEn); }, set name(v) { this.nameEn = v; }, get deckName() { return trDeck(this.nameEn); }, set deckName(v) { this.nameEn = v; }, energy, art, qr: q, nv: 1, lb: 1, k, rank: k + 1,')  # Limited Battle deck names: in the page language when shown (names load later)
one('cards: cards.map(([cid, n, c]) => ({ id: cid, n, c })), note: LB.notes[id] || null', 'cards: cards.map(([cid, n, c]) => ({ id: cid, nEn: n, get n() { return trCard(this.nEn); }, set n(v) { this.nEn = v; }, c })), note: LB.notes[id] || null')  # Limited Battle card names in the page language
one('return { ...v, id: `${v.deck}-${e.tid}-${v.pl}`, name: dk.name || v.deck, art: dk.art || [], rank: v.pl, nv: 1, pl: v.place,', 'return { ...v, id: `${v.deck}-${e.tid}-${v.pl}`, name: dk.name || v.deck, art: dk.art || [], rank: v.pl, nv: 1, pl: v.place && trPl(v.place),')  # event lists: the place pill in the page language
one('const siteBase = () => /pocketmetaqr\\.com$/.test(location.hostname) ? "https://pocketmetaqr.com/" : location.origin + location.pathname;',
    'const siteBase = () => /pocketmetaqr\\.com$/.test(location.hostname) ? "https://pocketmetaqr.com" + (PG_L === "en" ? "/" : langPath(PG_L)) : location.origin + location.pathname;')  # Phase 1: share links of /ja/ open /ja/
one(".then((j) => (EV = j))", ".then((j) => L10NP.then(() => (EV = l10nDeep(j))))")
one("for (const [nr, id, n] of j.c) { byId.set(id, nr); if (n) byNr.set(nr, { id, n });", "for (const [nr, id, n] of j.c) { byId.set(id, nr); if (n) byNr.set(nr, { id, n: trCard(n) });")
one(".then((r) => (r.ok ? r.json() : null)).then((j) => (PK = j))",
    ".then((r) => (r.ok ? r.json() : null)).then((j) => L10NP.then(() => { if (j && L10N) { const sn = {}; for (const [k, x] of Object.entries(j.sets || {})) { sn[k] = x.name; x.name = trSet(k, x.name); } for (const x of Object.values(j.packs || {})) x.name = x.name === sn[x.set] ? j.sets[x.set].name : trPack(x.name); } return (PK = j); }))")
open(dst, "w", encoding="utf8").write(s)
