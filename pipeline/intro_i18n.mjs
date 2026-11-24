// Nov 24, 2026: the intro text (<p class="seoi">) of a language page, in that language. page.mjs --lang <xx> uses it
// for the root text; English pages keep page.mjs's own text. One sentence per language, filled from data.json: the
// window (dates), the number of tournaments and the 3 most played decks with their share. Deck names come from
// preview/i18n/names.<lang>.json (+ names.fix.json), as on the page; a name with no match stays English.
// Formats as agreed with the owner (i18n/README.md): ja 11月17日〜23日, 1位 …（使用率10.7%）; es 17–23 nov, 1.º 10,7 %;
// pt 17–23 de nov., 1º 10,7%; de 17.–23. Nov., 1. 10,7 %; fr 17–23 nov., 1er / 2e 10,7 %; it 17–23 nov, 1º 10,7%.
import { readFileSync, existsSync } from "node:fs";

const MON = {
  es: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"],
  pt: ["jan.", "fev.", "mar.", "abr.", "mai.", "jun.", "jul.", "ago.", "set.", "out.", "nov.", "dez."],
  de: ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sept.", "Okt.", "Nov.", "Dez."],
  fr: ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."],
  it: ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"],
};
const md = (iso) => [+iso.slice(5, 7), +iso.slice(8, 10)];
const DAY = {
  ja: (m, d) => `${m}月${d}日`, es: (m, d) => `${d} ${MON.es[m - 1]}`, pt: (m, d) => `${d} de ${MON.pt[m - 1]}`,
  de: (m, d) => `${d}. ${MON.de[m - 1]}`, fr: (m, d) => `${d === 1 ? "1er" : d} ${MON.fr[m - 1]}`, it: (m, d) => `${d} ${MON.it[m - 1]}`,
};
// a window of days: one day, days in one month (17–23 nov), or two months (30 oct – 5 nov)
function span(lang, a, b) {
  const [ma, da] = md(a), [mb, db] = md(b), f = DAY[lang];
  if (a.slice(0, 10) === b.slice(0, 10)) return f(ma, da);
  if (ma === mb) return lang === "ja" ? `${ma}月${da}日〜${db}日` : lang === "es" ? `${da}–${db} ${MON.es[ma - 1]}`
    : lang === "pt" ? `${da}–${db} de ${MON.pt[ma - 1]}` : lang === "fr" ? `${da === 1 ? "1er" : da}–${db} ${MON.fr[ma - 1]}` : lang === "it" ? `${da}–${db} ${MON.it[ma - 1]}` : `${da}.–${db}. ${MON.de[ma - 1]}`;
  return lang === "ja" ? `${f(ma, da)}〜${f(mb, db)}` : `${f(ma, da)} – ${f(mb, db)}`;
}
const pct = (lang, v) => { const s = (+v).toFixed(1); return lang === "ja" ? s + "%" : (lang === "pt" || lang === "it") ? s.replace(".", ",") + "%"
  : s.replace(".", ",") + " %"; };
const rank = (lang, i) => (lang === "ja" ? `${i}位` : lang === "es" ? `${i}.º` : lang === "pt" ? `${i}º` : lang === "fr" ? (i === 1 ? "1er" : `${i}e`) : lang === "it" ? `${i}º` : `${i}.`);

function names(lang, dir) {
  const f = `${dir}/names.${lang}.json`;
  if (!existsSync(f)) return null;
  const n = { ...JSON.parse(readFileSync(f, "utf8")).n };
  const fx = existsSync(`${dir}/names.fix.json`) ? JSON.parse(readFileSync(`${dir}/names.fix.json`, "utf8"))[lang] : null;
  return Object.assign(n, (fx && fx.n) || {});
}
// a deck name = card names (longest match first, as trDeck on the page); else the English name
function deck(lang, N, en) {
  if (!N) return en;
  const w = en.split(" "), out = []; let i = 0;
  while (i < w.length) { let k = Math.min(w.length, i + 6), hit = null;
    for (; k > i; k--) { const x = N[w.slice(i, k).join(" ")]; if (x) { hit = x; break; } }
    if (!hit) return en; out.push(hit); i = k; }
  return out.join(lang === "ja" ? "・" : " ");
}

// data.json -> the intro sentence for lang, or "" (unknown language / no data)
export function introText(lang, D, namesDir = "preview/i18n") {
  if (!DAY[lang] || !D?.decks?.length || !D.span || !D.summary) return "";
  const N = names(lang, namesDir), n = D.summary.tournaments, w = span(lang, D.span[0], D.span[1]);
  const top = D.decks.slice(0, 3).map((d, i) => lang === "ja" ? `${rank(lang, i + 1)} ${deck(lang, N, d.name)}（使用率${pct(lang, d.share)}）`
    : `${rank(lang, i + 1)} ${deck(lang, N, d.name)} ${pct(lang, d.share)}`);
  if (lang === "ja") return `今週のポケポケ最強デッキ（${n}大会・${w}）：${top.join("、")}。すべてのレシピにQRコードがあり、ゲームに読み込めます。`;
  if (lang === "es") return `Las mejores barajas de JCC Pokémon Pocket de esta semana, de ${n} torneos (${w}): ${top.join(", ")}. ` +
    "Cada lista tiene un código QR para copiarla en el juego.";
  if (lang === "pt") return `Os melhores baralhos de Pokémon TCG Pocket desta semana, de ${n} torneios (${w}): ${top.join(", ")}. ` +
    "Cada lista tem um código QR para copiar no jogo.";
  if (lang === "it") return `I migliori mazzi di Pokémon TCG Pocket di questa settimana, da ${n} tornei (${w}): ${top.join(", ")}. ` +
    "Ogni lista ha un codice QR per copiarla nel gioco.";
  if (lang === "fr") return `Les meilleurs decks de Pokémon TCG Pocket cette semaine, sur ${n} tournois (${w}) : ${top.join(", ")}. ` +
    "Chaque liste a un code QR pour la copier dans le jeu.";
  return `Die besten Pokémon TCG Pocket-Decks dieser Woche aus ${n} Turnieren (${w}): ${top.join(", ")}. ` +
    "Jede Liste hat einen QR-Code, um sie ins Spiel zu übernehmen.";
}
