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
//
// R30 §1 (Nov 22, 2026): shared code files. After minify, the page's <style> blocks (after the skeleton's own small
// head style, in document order, joined) go to app.<hash>.css, linked last in <head>; every inline <script> of
// SCRIPT_MIN bytes or more (the app, about 230 KB; not ld+json) goes to app.<hash>.js, as <script src> at the same place
// (no defer / async). <hash> = the first 10 hex characters of the SHA-256. All copies use the same files. --prev <dir>:
// the previous build's app.* files are copied from <dir> into the output too (an HTML page loaded just before a deploy
// can still ask for them), and <dir> then keeps this build's files for the next run.
//
// R30 §2-3 (Nov 22, 2026): a copy per deck, decks/<id>/index.html, for every deck with a list (data.json + more.json
// `decks`), only when the page has the deck code (the text "pmq-deck"; --decks forces it for tests): routes tag
// content="1 about decks", a <meta name="pmq-deck" content='{"id","name","seen","on"}'> tag, the deck's title,
// description, canonical, subtitle, intro text (the 20 cards, the best finish) and BreadcrumbList. --seen <file>
// (data/decks_seen.json, committed by site.yml): the record of every deck's last day in the data (with its numbers and
// list 1), so a deck that left the data keeps its page with on: 0 for KEEP_DAYS (in the sitemap), then NOINDEX_DAYS with
// noindex (not in the sitemap); after that the page and the record go. A record entry is rewritten only on a new day
// (or for a new deck), so the file changes at most about once a day.
//
// R31 (Nov 22, 2026): a copy per booster pack, packs/<pack id>/index.html, for every pack the page's Packs view lists
// (not pa- / pb- promo, its set has a release), only when the page has the pack-route code (its RPACK check, the text
// /\bpacks\b/; --packs forces it): routes tag word "packs", title, description, canonical, og-packs.png, subtitle,
// intro text and BreadcrumbList; every pack address in the sitemap. The numbers are the page's pkBuild (packBuild):
// stats.json cu + packs.json + cards.json names + the data.json and more.json decks.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
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
const KEEP_DAYS = 30, NOINDEX_DAYS = 90;   // R30 §3
const SCRIPT_MIN = 25 * 1024;   // R30 §1: inline scripts this big or bigger go to app.<hash>.js
const hash10 = (t) => createHash("sha256").update(t).digest("hex").slice(0, 10);
// R30 §1: move the page's styles and its big inline scripts to app.<hash>.css / .js in outDir. Returns the new html.
function shareCode(html, outDir) {
  const i = html.indexOf("</head>");
  let head = html.slice(0, i), rest = html.slice(i), css = [];
  rest = rest.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (m, c) => { css.push(c); return ""; });
  const js = [];
  rest = rest.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (m, attrs, code) => {
    if (/\bsrc=|application\/ld\+json/i.test(attrs) || code.length < SCRIPT_MIN) return m;
    js.push(code); return `\u0000JS${js.length - 1}\u0000`;
  });
  if (js.length > 1) throw new Error(`R30: ${js.length} big inline scripts (1 expected)`);
  const files = [];
  if (css.length) {
    const c = css.join("\n"), f = `app.${hash10(c)}.css`;
    writeFileSync(join(outDir, f), c); files.push(f);
    head += `<link rel="stylesheet" href="${f}">`;
  }
  if (js.length) {
    const f = `app.${hash10(js[0])}.js`;
    writeFileSync(join(outDir, f), js[0]); files.push(f);
    rest = rest.replace("\u0000JS0\u0000", `<script src="${f}"></script>`);
  }
  return { html: head + rest, files };
}
// R30 §2-3: the deck pages (R32: new description and intro). Returns [{ dir, on, days, lastmod }] for the sitemap.
const pct = (x) => (x == null ? null : (+x).toFixed(1));
const cardsText = (cards) => cards.map(([n, c]) => `${c} ${n}`);
// R32 (Nov 23, 2026): the page's newer title formulas (RDTITLE / RPTITLE / RCTITLE: "… Deck List (Nov 2026) – Pokémon
// TCG Pocket | Pocket Meta QR"); used when the page has them (NEWT, the text " Deck List ("), else the R30 / R31 titles.
const GAME = "– Pokémon TCG Pocket | Pocket Meta QR";
const wr = (w, l, t) => (w + l + t ? ((w + t / 2) / (w + l + t)) * 100 : null);
const sharePct = (x) => (x >= 10 ? Math.round(x) : (+x).toFixed(1));   // 12%, 5.4%, 0.8%
// R32: the shared texts of a deck from this build's data (stats.json mu / cu, cards.json names, the decks for names).
function deckFacts(d, st, deckName, cardName) {
  const mu = ((st && st.mu) || []).map(([o, w, l, t]) => ({ o, n: deckName(o), g: w + l + t, p: wr(w, l, t) }))
    .filter((x) => x.n && x.g >= 10);
  const best = [...mu].filter((x) => x.p > 50).sort((a, b) => b.p - a.p || b.g - a.g).slice(0, 2);
  const worst = [...mu].filter((x) => x.p < 50).sort((a, b) => a.p - b.p || b.g - a.g).slice(0, 2);
  const s = [];
  if (best.length) s.push(`Best matchups: ${best.map((x) => `${x.n} (${Math.round(x.p)}% in ${x.g} games)`).join(", ")}.`);
  if (worst.length) s.push(`Decks that beat it: ${worst.map((x, i) =>
    `${x.n} (${i ? "" : d.name + " wins "}${Math.round(x.p)}% in ${x.g} games)`).join(", ")}.`);
  const of = d.of || 0;
  if (st && st.cu && of >= 3 && !d.bc) {   // core (90%+ of the top players' lists) and flex (10%+, top 3)
    const rows = st.cu.map(([cid, n, avg]) => ({ n: cardName(cid) || cid, u: n, c: Math.max(1, Math.round(avg)) }));
    const core = rows.filter((x) => x.u / of >= 0.9), flex = rows.filter((x) => x.u / of < 0.9 && x.u / of >= 0.1)
      .sort((a, b) => b.u - a.u).slice(0, 3);
    if (core.length) s.push(`Core cards (in 90%+ of the ${of} top players' lists): ${core.map((x) => `${x.c} ${x.n}`).join(", ")}.`);
    if (flex.length) s.push(`Flex picks: ${flex.map((x) => `${x.n} (${Math.round((x.u / of) * 100)}%)`).join(", ")}.`);
  }
  return { best: best[0] || null, sentences: s };
}
const names = (dataDir) => {   // deck id -> name, card id -> the cards.json display print's name
  const D = readJSON(join(dataDir, "data.json")), M = readJSON(join(dataDir, "more.json")), CJ = readJSON(join(dataDir, "cards.json"));
  const dn = new Map([...(D?.decks || []), ...(D?.nolist || []), ...(M?.decks || []), ...(M?.nolist || [])].map((d) => [d.id, d.name]));
  const nrOf = new Map(), nameOf = new Map();
  for (const [nr, id, n] of CJ?.c || []) { nrOf.set(id, nr); if (n) nameOf.set(nr, n); }
  return { deckName: (id) => dn.get(id) || null, cardName: (cid) => nameOf.get(nrOf.get(cid)) ?? null };
};
// R30 §3 / R32 §3.9: entries not seen for more than NOINDEX_DAYS go; a page with on 0 is noindex after KEEP_DAYS.
const daysAgo = (today, iso) => Math.round((Date.parse(today) - Date.parse(iso)) / 864e5);
const tagJSON = (o) => JSON.stringify(o).replace(/&/g, "&amp;").replace(/'/g, "&#39;").replace(/</g, "&lt;");
const crumbs = (last, url) => ({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
  { "@type": "ListItem", position: 1, name: "Pocket Meta QR", item: `${SITE}/` },
  { "@type": "ListItem", position: 2, name: "Meta decks", item: `${SITE}/` },
  { "@type": "ListItem", position: 3, name: last, item: url }] });

// R33 (Nov 23, 2026): a Breakout deck's best result, for its page: "won PMPT #52" / "took 3rd at PMPT #52". The event
// name is cut at its first " - " / " | " ("PMPT #52 - FEROCIOUS FUSION!!! | $100 USD" -> "PMPT #52").
const ordinal = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");
const shortEvent = (t) => plain(t).split(/\s+[-|–:]\s+/)[0].trim() || plain(t);
const brkVerb = (b) => (b.place === 1 ? `won ${b.ev}` : `took ${ordinal(b.place)} at ${b.ev}`);
function deckPages(full, dataDir, outDir, seenFile) {
  const D = readJSON(join(dataDir, "data.json")), M = readJSON(join(dataDir, "more.json")), ST = readJSON(join(dataDir, "stats.json"));
  const EVD = new Map(((readJSON(join(dataDir, "events.json")) || {}).events || []).map((x) => [x.tid, x.dt]));
  if (!D) return [];
  const today = new Date().toISOString().slice(0, 10), dates = span(D.span[0], D.span[1]), N = names(dataDir);
  const rec = (seenFile && readJSON(seenFile)) || {};
  const now = [...(D.decks || []).map((d) => ({ d, more: 0 })), ...((M && M.decks) || []).map((d) => ({ d, more: 1 }))];
  const facts = new Map(), live = new Map();
  for (const { d, more } of now) {
    const f = deckFacts(d, ST?.d?.[d.id], N.deckName, N.cardName);
    facts.set(d.id, f);
    live.set(d.id, { name: d.name, seen: today, rank: d.rank, share: d.share, win: d.win, count: d.count,
      games: (d.w || 0) + (d.l || 0) + (d.t || 0), more, dates, best: d.pl ? [d.pl, plain(d.ev || ""), d.dt] : null,
      cards: d.cards.map((c) => [c.n, c.c]), xs: f.sentences,
      ...(d.brk ? { brk: { ev: shortEvent(d.brk[0][3]), place: d.brk[0][1], players: d.brk[0][2], dt: EVD.get(d.brk[0][0]) || null } } : {}) });
    // the record (for the page after the deck leaves): rewritten on a new day or for a new deck, so the file changes
    // about once a day; the pages of decks in the data use this build's numbers (live)
    if (!(rec[d.id]?.seen === today && rec[d.id].xs)) rec[d.id] = live.get(d.id);
  }
  for (const id of Object.keys(rec)) if (daysAgo(today, rec[id].seen) > NOINDEX_DAYS) delete rec[id];
  if (seenFile) writeFileSync(seenFile, JSON.stringify(rec, null, 1) + "\n");
  const onIds = new Set(now.map((x) => x.d.id)), out = [];
  for (const [id, e0] of Object.entries(rec)) {
    const on = onIds.has(id) ? 1 : 0, days = daysAgo(today, e0.seen), f = facts.get(id), e = on ? live.get(id) : e0;
    const cards = cardsText(e.cards), win = pct(e.win), share = e.share < 0.1 ? (+e.share).toFixed(2) : pct(e.share);   // R33: 0.04
    const best = e.best ? ` Best finish: ${e.best[0]}${e.best[1] ? ` at ${e.best[1]}` : ""} (${day(e.best[2])}).` : "";
    const title = NEWT ? (on ? `${e.name} Deck List (${MONTH}) ${GAME}` : `${e.name} Deck List (last seen ${day(e.seen)}) ${GAME}`)
      : on ? `${e.name} Deck (${MONTH}): List & QR Code | Pocket Meta QR`
      : `${e.name} Deck: List & QR Code (last seen ${day(e.seen)}) | Pocket Meta QR`;
    let desc;
    if (on && e.brk) {   // R33: a Breakout deck: its result first
      const b = e.brk;
      desc = [`${e.name} ${brkVerb(b)} (${b.players} players) in Pokémon TCG Pocket. Full list with a QR code to import.`,
        `${e.name} ${brkVerb(b)} (${b.players} players) in Pokémon TCG Pocket. List + QR code.`].find((x) => x.length <= DESC_MAX) ||
        `${e.name} ${brkVerb(b)} (${b.players} players) in Pokémon TCG Pocket.`;
    } else if (on) {   // R32 §2: numbers first, then the best matchup, then the QR
      const head = `${e.name} is ${e.more ? "a smaller Pokémon TCG Pocket deck this week" : `#${e.rank} in the Pokémon TCG Pocket meta`}: ` +
        `${sharePct(e.share)}% of players${e.win != null ? `, ${Math.round(e.win)}% win rate` : ""}.`;
      // the order of what goes when it is too long: the QR sentence gets shorter, then goes, then the matchup goes
      const bv = f?.best ? ` Best vs ${f.best.n} (${Math.round(f.best.p)}%).` : "";
      desc = [head + bv + " Full list with a QR code to import.", head + bv + " List + QR code.", head + bv,
        head + " Full list with a QR code to import.", head].find((x) => x.length <= DESC_MAX) || head;
    } else desc = fit(`Not in this week's Pokémon TCG Pocket meta (last seen ${day(e.seen)}): ${share}% share` +
      `${win ? `, ${win}% win` : ""}, ${e.count} players. Its list: `, cards, "");
    const xs = (e.xs || []).join(" ");
    const lead = on && e.brk ? `${e.name} ${brkVerb(e.brk)} (${e.brk.players} players${e.brk.dt ? ", " + day(e.brk.dt) : ""}) – ` +
      `a rare deck this week (${e.share < 0.1 ? (+e.share).toFixed(2) : (+e.share).toFixed(1)}% of players). ` : "";
    const intro = on
      ? `${lead}${e.name}: #${e.rank} of this week's Pokémon TCG Pocket decks (${e.dates}), ${share}% of players` +
        `${win ? `, ${win}% win rate in ${e.games} games` : ""}. The most played ${e.name} list: ${cards.join(", ")}.` +
        `${xs ? " " + xs : ""}${best} Open the list and tap its QR code to import it in the game.`
      : `Not in this week's meta. Last seen ${day(e.seen)}: #${e.rank} of the Pokémon TCG Pocket decks (${e.dates}), ` +
        `${share}% of players${win ? `, ${win}% win rate in ${e.games} games` : ""}. Its list: ${cards.join(", ")}.` +
        `${xs ? " " + xs : ""}${best}`;
    const extra = `<meta name="pmq-deck" content='${tagJSON({ id, name: e.name, seen: e.seen, on })}'>` +
      (!on && days > KEEP_DAYS ? '<meta name="robots" content="noindex">' : "");
    const dir = `decks/${id}`, fl = join(outDir, dir, "index.html");
    mkdirSync(dirname(fl), { recursive: true });
    writeFileSync(fl, fillIntro(sectionPage(full, { dir, title, desc, img: "og.png", hsec: `${e.name} deck`,
      ld: crumbs(e.name, `${SITE}/decks/${id}/`), extra }), intro));
    out.push({ dir, on, days, title, desc, intro });
  }
  return out;
}

// R32 §3: a page per card name (search.json cards; prints of 1 name = 1 page). The page's rules: main print = the most
// top players (u), then more decks (cardMain); decks = the union over the prints (copies summed, top players the
// largest), by share; % of top players = summed u / the summed `of` of the data.json + more.json decks; the pack(s) of
// the main print (packs.json; set name + pack name when the set has 2+ packs; promo: no booster pack). Record
// (cards_seen.json, by card name) and the 30 / 90-day rule as for decks.
function cardPages(full, dataDir, outDir, seenFile) {
  const D = readJSON(join(dataDir, "data.json")), M = readJSON(join(dataDir, "more.json")),
    SE = readJSON(join(dataDir, "search.json")), P = readJSON(join(dataDir, "packs.json"));
  if (!D || !SE) return [];
  const today = new Date().toISOString().slice(0, 10), dates = span(D.span[0], D.span[1]);
  const decks = [...D.decks, ...((M && M.decks) || [])], dk = new Map(decks.map((d) => [d.id, d]));
  const allTop = decks.reduce((t, d) => t + (d.of || 0), 0);
  const byName = new Map();
  for (const c of SE.cards) (byName.get(c.n) || byName.set(c.n, []).get(c.n)).push(c);
  // the main print's packs: [long, short]: "Dual Fusion Mega Mewtwo X or Pikachu pack", "Dual Fusion pack"; null = promo
  const orJoin = (L) => (L.length > 1 ? L.slice(0, -1).join(", ") + " or " + L.at(-1) : L[0]);
  const packText = (id) => {
    const ps = ((P && P.cards[id]) || []).filter((k) => !/^p[ab]-/.test(k) && P.packs[k]);
    if (!ps.length) return null;
    const bySet = new Map();
    for (const k of ps) {
      const pk = P.packs[k], st = P.sets?.[pk.set], setName = st?.name || pk.set.toUpperCase();
      const solo = Object.values(P.packs).filter((x) => x.set === pk.set).length === 1 || pk.name === setName;
      (bySet.get(setName) || bySet.set(setName, []).get(setName)).push(solo ? null : pk.name);
    }
    const long = orJoin([...bySet].map(([sn, L]) => (L.some((x) => x) ? `${sn} ${orJoin(L.filter((x) => x))}` : sn))) + " pack";
    return [long, orJoin([...bySet.keys()]) + " pack"];
  };
  const rec = (seenFile && readJSON(seenFile)) || {}, live = new Map();
  for (const [n, prints] of byName) {
    const main = [...prints].sort((a, b) => (b.u || 0) - (a.u || 0) || b.decks.length - a.decks.length)[0];
    const per = new Map();
    for (const c of prints) for (const [id, copies, tp] of c.decks) {
      const e = per.get(id) || { c: 0, tp: 0 }; e.c += copies; e.tp = Math.max(e.tp, tp); per.set(id, e);
    }
    const L = [...per].filter(([id]) => dk.has(id)).map(([id, e]) => ({ name: dk.get(id).name, share: dk.get(id).share, ...e }))
      .sort((a, b) => b.share - a.share);
    const u = prints.reduce((t, c) => t + (c.u || 0), 0);
    live.set(n, { id: main.id, seen: today, dates, pct: allTop ? Math.round((u / allTop) * 100) : null, u,
      pack: packText(main.id), nd: L.length, L: L.map((x) => [x.name, x.c, x.tp]) });
    // the record (for the page after the card leaves the lists; up to 12 decks): on a new day, a new card or a new main
    // print, so the file changes about once a day; pages of cards in the lists use this build's numbers (live)
    if (!(rec[n]?.seen === today && rec[n].id === main.id)) rec[n] = { ...live.get(n), L: live.get(n).L.slice(0, 12) };
  }
  for (const n of Object.keys(rec)) if (daysAgo(today, rec[n].seen) > NOINDEX_DAYS) delete rec[n];
  if (seenFile) writeFileSync(seenFile, JSON.stringify(rec, null, 1) + "\n");
  const out = [], plural = (k, w, ws) => `${k} ${k === 1 ? w : ws || w + "s"}`;
  for (const [n, r0] of Object.entries(rec)) {
    const on = byName.has(n) ? 1 : 0, e0 = on ? live.get(n) : r0;
    const e = { ...e0, L: (e0.L || []).map(([name, c, tp]) => ({ name, c, tp })) };
    const days = daysAgo(today, r0.seen), id = e.id;
    const nd = e.nd ?? e.L.length, pk = Array.isArray(e.pack) ? e.pack : e.pack ? [e.pack, e.pack] : null;
    const pkt = pk ? `Get it from the ${pk[1]}.` : "Promo card (not in a booster pack).";
    const title = on ? `${n}: Which Meta Decks Use It (${MONTH}) ${GAME}` : `${n}: Which Meta Decks Use It (last seen ${day(e.seen)}) ${GAME}`;
    const desc = on
      ? fit(`${n} is in ${plural(nd, "Pokémon TCG Pocket meta deck")} this week, run by ${e.pct}% of top players. Top decks: `,
        e.L.map((x) => x.name), pkt)
      : fit(`Not in this week's Pokémon TCG Pocket meta decks (last seen ${day(e.seen)}). It was in ${plural(nd, "deck")}: `, e.L.map((x) => x.name), pkt);
    const used = e.L.map((x) => `${x.name} (${plural(x.c, "copy", "copies")}, ${plural(x.tp, "top player")})`).join(", ");
    const intro = on
      ? `${n} is played in ${nd} of this week's Pokémon TCG Pocket decks (${e.dates}) by ${e.pct}% of top players. ` +
        `Decks that use it: ${used}${nd > e.L.length ? ", …" : ""}. ${pk ? `Get it from the ${pk[0]}.` : pkt}`
      : `Not in this week's meta decks. Last seen ${day(e.seen)}: in ${plural(nd, "deck")} (${e.dates}), by ${e.pct}% of top ` +
        `players. Decks that used it: ${used}. ${pk ? `Get it from the ${pk[0]}.` : pkt}`;
    const extra = `<meta name="pmq-card" content='${tagJSON({ id, name: n, seen: e.seen, on })}'>` +
      (!on && days > KEEP_DAYS ? '<meta name="robots" content="noindex">' : "");
    const dir = `cards/${id}`, fl = join(outDir, dir, "index.html");
    mkdirSync(dirname(fl), { recursive: true });
    writeFileSync(fl, fillIntro(sectionPage(full, { dir, title, desc, img: "og.png", hsec: `${n}: decks that use it`,
      ld: crumbs(n, `${SITE}/cards/${id}/`), extra }), intro));
    out.push({ dir, on, days, title, desc, intro });
  }
  return out;
}
// R31: the page's pkBuild in Node (same rules; keep them the same). A deck plays a card when n / np >= 0.5 (np = the
// largest n in its cu); cards grouped by name (the cards.json display print's name); promo packs skipped; a "meta card"
// (st) = 1+ of its decks has share >= 1. Cards: meta first, then more decks, then the summed share; decks by share.
function packBuild(dataDir) {
  const D = readJSON(join(dataDir, "data.json")), Mo = readJSON(join(dataDir, "more.json")),
    ST = readJSON(join(dataDir, "stats.json")), PK = readJSON(join(dataDir, "packs.json")), CJ = readJSON(join(dataDir, "cards.json"));
  if (!D || !ST || !PK || !CJ) return null;
  const nrOf = new Map(), nameOf = new Map();
  for (const [nr, id, n] of CJ.c) { nrOf.set(id, nr); if (n) nameOf.set(nr, n); }
  const nm = (cid) => nameOf.get(nrOf.get(cid)) ?? null;
  const decks = [...D.decks, ...((Mo && Mo.decks) || [])], dk = new Map(decks.map((d) => [d.id, d])), by = {};
  for (const d of decks) {
    const s = ST.d && ST.d[d.id]; if (!s || !s.cu || !s.cu.length) continue;
    const np = Math.max(...s.cu.map((c) => c[1])); if (!np) continue;
    for (const [cid, n, avg] of s.cu) {
      if (n / np < 0.5) continue;
      const name = nm(cid) || cid;
      for (const p of PK.cards[cid] || []) {
        if (/^p[ab]-/.test(p) || !PK.packs[p]) continue;
        const P = by[p] || (by[p] = new Map());
        if (!P.has(name)) P.set(name, { n: name, ids: new Map(), decks: new Map() });
        const c = P.get(name);
        c.ids.set(cid, (c.ids.get(cid) || 0) + n);
        c.decks.set(d.id, Math.max(c.decks.get(d.id) || 0, Math.round(avg)));
      }
    }
  }
  return Object.keys(PK.packs).filter((p) => !/^p[ab]-/.test(p) && (PK.sets[PK.packs[p].set] || {}).release).map((p) => {
    const k = PK.packs[p], st = PK.sets[k.set];
    const cards = [...(by[p] || new Map()).values()].map((c) => {
      const ds = [...c.decks].map(([id, cp]) => ({ d: dk.get(id), c: cp })).sort((a, z) => z.d.share - a.d.share);
      return { n: c.n, decks: ds, st: ds.some((x) => x.d.share >= 1), sh: ds.reduce((t, x) => t + x.d.share, 0) };
    }).sort((a, z) => z.st - a.st || z.decks.length - a.decks.length || z.sh - a.sh);
    return { id: p, setName: st.name, pack: k.name, name: st.name + (k.name === st.name ? "" : " " + k.name), cards };
  });
}
// R31: the pack pages. Returns [{ dir, title, desc }] for the sitemap and the log.
function packPages(full, dataDir, outDir) {
  const L = packBuild(dataDir), D = readJSON(join(dataDir, "data.json"));
  if (!L) return [];
  const dates = span(D.span[0], D.span[1]), out = [];
  for (const x of L) {
    const meta = x.cards.filter((c) => c.st), small = x.cards.length - meta.length;
    const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
    const title = NEWT ? `${x.name} Pack: Meta Cards & Decks (${MONTH}) ${GAME}` : `${x.name} Pack (${MONTH}): Meta Cards & Decks | Pocket Meta QR`;
    const desc = meta.length
      ? fit(`${x.name} pack: ${plural(meta.length, "card")} played in this week's Pokémon TCG Pocket meta decks: `,
        meta.map((c, i) => `${c.n} (${c.decks.length}${i ? "" : c.decks.length === 1 ? " deck" : " decks"})`), "See which decks use them.")
      : `${x.name} pack: none of its cards are played by this week's Pokémon TCG Pocket meta decks (${dates}).`;
    const intro = (meta.length
      ? `Which Pokémon TCG Pocket decks of this week (${dates}) use the cards of the ${x.name} pack: ` +
        meta.map((c) => `${c.n} (${plural(c.decks.length, "deck")}: ${c.decks.slice(0, 3).map((r) => r.d.name).join(", ")}` +
          `${c.decks.length > 3 ? "…" : ""})`).join(", ") + "."
      : `None of the cards of the ${x.name} pack are played by this week's Pokémon TCG Pocket meta decks (${dates}).`) +
      (small ? ` ${small} ${meta.length ? "more " : ""}${small === 1 ? "card" : "cards"} only in smaller decks.` : "");
    const ld = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Pocket Meta QR", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: "Booster packs", item: `${SITE}/packs/` },
      { "@type": "ListItem", position: 3, name: `${x.name} pack`, item: `${SITE}/packs/${x.id}/` }] };
    const dir = `packs/${x.id}`, f = join(outDir, dir, "index.html");
    mkdirSync(dirname(f), { recursive: true });
    writeFileSync(f, fillIntro(sectionPage(full, { dir, title, desc, img: "og-packs.png", hsec: `${x.name} pack`, ld }), intro));
    out.push({ dir, title, desc, meta: meta.length, small });
  }
  return out;
}
function keepPrevious(prevDir, outDir, files) {   // R30 §1.4
  const old = [];
  if (existsSync(prevDir)) for (const f of readdirSync(prevDir))
    if (/^app\.[0-9a-f]{10}\.(css|js)$/.test(f) && !files.includes(f)) { copyFileSync(join(prevDir, f), join(outDir, f)); old.push(f); }
  rmSync(prevDir, { recursive: true, force: true }); mkdirSync(prevDir, { recursive: true });
  for (const f of files) copyFileSync(join(outDir, f), join(prevDir, f));
  return old;
}
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
const plain = (t) => t.replace(/[\p{Extended_Pictographic}\p{So}\u2700-\u27BF\uFE0F\u200D\uFF5C\uFE31\u3010\u3011\u300C-\u300F]/gu, " ")
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
function sectionPage(html, { dir, title, desc, img, hsec, ld, extra }) {
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
  if (extra) head += extra;   // R30: the deck tag, noindex
  if (ld) head += `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>`;
  let rest = html.slice(i);
  if (hsec) {   // R28: the section subtitle (the page sets the same text after a tab switch)
    const re = /(<(h[12]) class="hsec">)[\s\S]*?(<\/\2>)/;   // R32: h1 (was h2)
    if (re.test(rest)) rest = rest.replace(re, `$1${esc(hsec)}$3`); else console.log("page: no h1.hsec / h2.hsec in the page (R28)");
  }
  return head + rest;
}
const [src = "site/index.html", out = "public/index.html"] = args.filter((a, i) => !a.startsWith("--") && !["--prev", "--seen", "--cards-seen"].includes(args[i - 1]));
const body = readFileSync(src, "utf8");
const ROUTES_ON = ROUTES && body.includes("pmq-routes");   // R26: the page supports the section addresses
const ABOUT_ON = ROUTES_ON && ABV_RE.test(body);              // R29: the page has the static FAQ section
const DECKS_ON = ROUTES_ON && (body.includes("pmq-deck") || args.includes("--decks"));   // R30 §2: the page's deck code
const PACKS_ON = ROUTES_ON && (body.includes("/\\bpacks\\b/") || args.includes("--packs")); // R31: the page's RPACK check
const CARDS_ON = ROUTES_ON && (body.includes("/\\bcards\\b/") || args.includes("--cards")); // R32: the page's RCARD check
const NEWT = body.includes(" Deck List (") || args.includes("--newt");   // R32: the page's new title formulas
const RT = ROUTE_TAG.replace('content="1"',
  `content="${["1", ABOUT_ON && "about", DECKS_ON && "decks", PACKS_ON && "packs", CARDS_ON && "cards"].filter(Boolean).join(" ")}"`);
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
  const page0 = head.replace("<head>", ROUTES_ON ? `<head>${RT}` : "<head>") + rest + "\n</body></html>\n";
  const { html: full, files: shared } = shareCode(page0, dirname(out));   // R30 §1
  const pi = args.indexOf("--prev"), old = pi > 0 ? keepPrevious(args[pi + 1], dirname(out), shared) : [];
  console.log(`page: shared code ${shared.map((f) => `${f} (${(readFileSync(join(dirname(out), f)).length / 1024).toFixed(0)} KB)`).join(", ")}` +
    `; each copy ${(full.length / 1024).toFixed(0)} KB${pi > 0 ? `; previous build's files kept: ${old.join(", ") || "none"}` : ""}`);
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
  const si = args.indexOf("--seen"), seenFile = si > 0 ? args[si + 1] : null;
  const decks = DECKS_ON ? deckPages(full, dirname(src), dirname(out), seenFile) : [];
  if (DECKS_ON) {
    const on = decks.filter((x) => x.on), kept = decks.filter((x) => !x.on);
    console.log(`page: deck pages ${decks.length} (${on.length} in the data, ${kept.filter((x) => x.days <= KEEP_DAYS).length} kept,` +
      ` ${kept.filter((x) => x.days > KEEP_DAYS).length} noindex)${seenFile ? `; record ${seenFile}` : ""}`);
    if (on[0]) console.log(`page: e.g. ${on[0].dir}/ title "${on[0].title}"; description ${on[0].desc.length} chars: ${on[0].desc}`);
  } else console.log(`page: no deck pages (${ROUTES_ON ? "the page has no deck code yet" : "routes off"})`);
  const packs = PACKS_ON ? packPages(full, dirname(src), dirname(out)) : [];
  const ci = args.indexOf("--cards-seen"), cardsSeen = ci > 0 ? args[ci + 1] : null;
  const cards = CARDS_ON ? cardPages(full, dirname(src), dirname(out), cardsSeen) : [];
  if (CARDS_ON) {
    const on = cards.filter((x) => x.on), kept = cards.filter((x) => !x.on);
    console.log(`page: card pages ${cards.length} (${on.length} in the lists, ${kept.filter((x) => x.days <= KEEP_DAYS).length} kept,` +
      ` ${kept.filter((x) => x.days > KEEP_DAYS).length} noindex)${cardsSeen ? `; record ${cardsSeen}` : ""}`);
  } else console.log(`page: no card pages (${ROUTES_ON ? "the page has no card-route code yet" : "routes off"})`);
  console.log(`page: titles ${NEWT ? "R32 (… Deck List (Mon YYYY) – Pokémon TCG Pocket | Pocket Meta QR)" : "R30 / R31 (the page has the older formulas)"}`);
  if (PACKS_ON) {
    console.log(`page: pack pages ${packs.length} (${packs.filter((x) => x.meta).length} with meta cards)`);
    const ex = packs.find((x) => x.dir === "packs/c1-pikachu") || packs[0];
    if (ex) console.log(`page: e.g. ${ex.dir}/ title "${ex.title}"; description ${ex.desc.length} chars: ${ex.desc}`);
  } else console.log(`page: no pack pages (${ROUTES_ON ? "the page has no pack-route code yet" : "routes off"})`);
  if (ROUTES_ON) for (const [k, v] of Object.entries({ "/": { title: TITLES[""], desc: descs[""] || rootDesc }, ...heads }))
    console.log(`page: ${k.padEnd(8)} title "${v.title}"; description ${v.desc.length} chars${descs[k === "/" ? "" : k] ? "" : " (fixed text)"}`);
  if (ROUTES_ON) {   // R26 + R27: sitemap.xml with the section addresses and <lastmod>
    const today = new Date().toISOString().slice(0, 10);
    const lbOn = !lb || Date.parse(lb.to) > Date.now();
    const urls = [["", "hourly"], ...SECS.filter((x) => x.dir !== "limited" || lbOn)
      .map((x) => [x.dir + "/", x.about ? "monthly" : "daily"]),
      ...decks.filter((x) => x.on || x.days <= KEEP_DAYS).map((x) => [x.dir + "/", "daily"]),   // R30 §2.9 / §3
      ...packs.map((x) => [x.dir + "/", "daily"]),   // R31
      ...cards.filter((x) => x.on).map((x) => [x.dir + "/", "daily"])];   // R32: cards in this week's lists only
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
