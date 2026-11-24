// Nov 24, 2026: the intro text (<p class="seoi">) of a language page, in that language. page.mjs --lang <xx> uses it
// for the root text; English pages keep page.mjs's own text. One sentence per language, filled from data.json: the
// window (dates), the number of tournaments and the 3 most played decks with their share. Deck names come from
// preview/i18n/names.<lang>.json (+ names.fix.json), as on the page; a name with no match stays English.
// Formats as agreed with the owner (i18n/README.md): ja 11月17日〜23日, 1位 …（使用率10.7%）; es 17–23 nov, 1.º 10,7 %;
// pt 17–23 de nov., 1º 10,7%; de 17.–23. Nov., 1. 10,7 %; fr 17–23 nov., 1er / 2e 10,7 %; it 17–23 nov, 1º 10,7%; ko 11월 17일~23일, 1위 … (10.7%).
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
  ko: (m, d) => `${m}월 ${d}일`,
};
// a window of days: one day, days in one month (17–23 nov), or two months (30 oct – 5 nov)
function span(lang, a, b) {
  const [ma, da] = md(a), [mb, db] = md(b), f = DAY[lang];
  if (a.slice(0, 10) === b.slice(0, 10)) return f(ma, da);
  if (ma === mb) return lang === "ja" ? `${ma}月${da}日〜${db}日` : lang === "ko" ? `${ma}월 ${da}일~${db}일` : lang === "es" ? `${da}–${db} ${MON.es[ma - 1]}`
    : lang === "pt" ? `${da}–${db} de ${MON.pt[ma - 1]}` : lang === "fr" ? `${da === 1 ? "1er" : da}–${db} ${MON.fr[ma - 1]}` : lang === "it" ? `${da}–${db} ${MON.it[ma - 1]}` : `${da}.–${db}. ${MON.de[ma - 1]}`;
  return lang === "ja" ? `${f(ma, da)}〜${f(mb, db)}` : lang === "ko" ? `${f(ma, da)}~${f(mb, db)}` : `${f(ma, da)} – ${f(mb, db)}`;
}
const pct = (lang, v) => { const s = (+v).toFixed(1); return lang === "ja" || lang === "ko" ? s + "%" : (lang === "pt" || lang === "it") ? s.replace(".", ",") + "%"
  : s.replace(".", ",") + " %"; };
const rank = (lang, i) => (lang === "ja" ? `${i}位` : lang === "ko" ? `${i}위` : lang === "es" ? `${i}.º` : lang === "pt" ? `${i}º` : lang === "fr" ? (i === 1 ? "1er" : `${i}e`) : lang === "it" ? `${i}º` : `${i}.`);

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
    : lang === "ko" ? `${rank(lang, i + 1)} ${deck(lang, N, d.name)} (${pct(lang, d.share)})`
    : `${rank(lang, i + 1)} ${deck(lang, N, d.name)} ${pct(lang, d.share)}`);
  if (lang === "ja") return `今週のポケポケ最強デッキ（${n}大会・${w}）：${top.join("、")}。すべてのレシピにQRコードがあり、ゲームに読み込めます。`;
  if (lang === "ko") return `이번 주 포켓몬 카드 게임 Pocket 메타 덱(대회 ${n}개, ${w}): ${top.join(", ")}. ` +
    "모든 레시피에 게임에서 읽을 수 있는 QR 코드가 있습니다.";
  if (lang === "es") return `Las mejores barajas de JCC Pokémon Pocket de esta semana, de ${n} torneos (${w}): ${top.join(", ")}. ` +
    "Cada lista tiene un código QR para copiarla en el juego.";
  if (lang === "pt") return `Os melhores baralhos de Pokémon TCG Pocket desta semana, de ${n} torneios (${w}): ${top.join(", ")}. ` +
    "Cada lista tem um código QR para copiar no jogo.";
  if (lang === "it") return `I migliori mazzi del GCC Pokémon Pocket di questa settimana, da ${n} tornei (${w}): ${top.join(", ")}. ` +
    "Ogni lista ha un codice QR per copiarla nel gioco.";
  if (lang === "fr") return `Les meilleurs decks de Pokémon TCG Pocket cette semaine, sur ${n} tournois (${w}) : ${top.join(", ")}. ` +
    "Chaque liste a un code QR pour la copier dans le jeu.";
  return `Die besten Pokémon TCG Pocket-Decks dieser Woche aus ${n} Turnieren (${w}): ${top.join(", ")}. ` +
    "Jede Liste hat einen QR-Code, um sie ins Spiel zu übernehmen.";
}

// Phase 2 Step 1 (Nov 24, 2026): the fixed description of a language section page (/<lang>/events/ ...), for
// <meta name="description">, og:description and the intro slot. "" = no text (page.mjs then uses the English one).
const SEC_DESC = {
  ja: { events: "ポケポケの最新の大会結果：上位8人のデッキレシピをQRコード付きで掲載。",
    packs: "今週の環境デッキのカードが出るポケポケのパックがわかります。",
    limited: "開催中の限定バトル向けに選んだデッキをQRコード付きで掲載。",
    about: "ポケポケのデッキをQRコードで読み込む方法、データの出典（Limitlessの大会、直近7日間）、デッキとレシピの順位の決め方。" },
  es: { events: "Resultados de los últimos torneos de JCC Pokémon Pocket: listas del top 8 con códigos QR.",
    packs: "Qué sobres de JCC Pokémon Pocket dan las cartas de las barajas del meta de esta semana.",
    limited: "Barajas seleccionadas con códigos QR para las Partidas Limitadas actuales.",
    about: "Cómo importar una baraja de JCC Pokémon Pocket con un código QR, de dónde vienen los datos (torneos de Limitless, últimos 7 días) y cómo se ordenan las barajas y las listas." },
  pt: { events: "Resultados dos últimos torneios de Pokémon TCG Pocket: listas do top 8 com códigos QR.",
    packs: "Quais pacotes de Pokémon TCG Pocket dão as cartas dos baralhos do meta desta semana.",
    limited: "Baralhos selecionados com códigos QR para a Batalha Limitada atual.",
    about: "Como importar um baralho de Pokémon TCG Pocket por código QR, de onde vêm os dados (torneios da Limitless, últimos 7 dias) e como os baralhos e as listas são classificados." },
  de: { events: "Ergebnisse der neuesten Pokémon TCG Pocket-Turniere: Top-8-Listen mit QR-Codes.",
    packs: "Welche Pokémon TCG Pocket-Packs die Karten der Meta-Decks dieser Woche enthalten.",
    limited: "Ausgewählte Decks mit QR-Codes für die aktuellen Limitierten Kämpfe.",
    about: "So importierst du ein Pokémon TCG Pocket-Deck per QR-Code, woher die Daten kommen (Limitless-Turniere, letzte 7 Tage) und wie Decks und Listen sortiert werden." },
  fr: { events: "Résultats des derniers tournois de Pokémon TCG Pocket : listes du top 8 avec codes QR.",
    packs: "Quels boosters de Pokémon TCG Pocket donnent les cartes des decks du méta de la semaine.",
    limited: "Decks sélectionnés avec codes QR pour les Combats restreints en cours.",
    about: "Comment importer un deck de Pokémon TCG Pocket avec un code QR, d'où viennent les données (tournois Limitless, 7 derniers jours) et comment les decks et les listes sont classés." },
  it: { events: "Risultati degli ultimi tornei del GCC Pokémon Pocket: liste della top 8 con codici QR.",
    packs: "Quali buste del GCC Pokémon Pocket danno le carte dei mazzi del meta di questa settimana.",
    limited: "Mazzi scelti con codici QR per le Lotte esclusive in corso.",
    about: "Come importare un mazzo del GCC Pokémon Pocket da un codice QR, da dove vengono i dati (tornei Limitless, ultimi 7 giorni) e come sono ordinati mazzi e liste." },
  ko: { events: "포켓몬 카드 게임 Pocket 최근 대회 결과: TOP 8 레시피를 QR 코드와 함께.",
    packs: "이번 주 메타 덱의 카드가 나오는 포켓몬 카드 게임 Pocket 팩.",
    limited: "진행 중인 한정 배틀을 위해 고른 덱을 QR 코드와 함께.",
    about: "포켓몬 카드 게임 Pocket 덱을 QR 코드로 읽어 오는 방법, 데이터 출처(Limitless 대회, 최근 7일간), 덱과 레시피의 순위를 정하는 방법." },
};
export const sectionDesc = (lang, dir) => SEC_DESC[lang]?.[dir] || "";

// Phase 2 Step 4 (Nov 24, 2026): the texts of a language deck page (/<lang>/decks/<id>/), from the same record as the
// English page (page.mjs deckPages). e: { name, rank, share, win, games, more, seen, cards: [[name, copies]] }, on: 1 =
// in this week's data. Names: names.<lang>.json (deck name as the page's trDeck; card names; else English).
// dates: the data window in the language (spanText) or null. Returns { name, desc, intro }.
export function deckText(lang, e, on, dates, namesDir = "preview/i18n") {
  if (!DAY[lang] && lang !== "ja") return null;
  const N = names(lang, namesDir), nm = deck(lang, N, e.name), cn = (n) => (N && N[n]) || n;
  const p = pct(lang, e.share < 0.1 ? +(+e.share).toFixed(2) : e.share), w = e.win != null ? pct(lang, e.win) : null;
  const cards = (e.cards || []).map(([n, c]) => (lang === "ja" ? `${cn(n)}×${c}` : `${c} ${cn(n)}`));
  const sd = e.seen ? DAY[lang](...md(e.seen)) : "", r = e.rank, g = e.games, J = cards.join(lang === "ja" ? "、" : ", ");
  const T = {
    ja: { main: `${nm}：今週のポケポケ環境で${r}位、使用率${p}${w ? `、勝率${w}` : ""}。`, more: `${nm}：今週のポケポケの少数派デッキ、使用率${p}${w ? `、勝率${w}` : ""}。`,
      qr: "QRコード付きのレシピ。", offD: `${nm}：今週の環境には入っていません（最終確認：${sd}）。使用率${p}。レシピ：`,
      in: `${nm}：今週のポケポケのデッキで${r}位${dates ? `（${dates}）` : ""}、使用率${p}${w ? `、${g}試合で勝率${w}` : ""}。最も使われている${nm}のレシピ：${J}。レシピを開いてQRコードをタップすると、ゲームに読み込めます。`,
      off: `今週の環境には入っていません。最終確認：${sd}。当時ポケポケのデッキで${r}位、使用率${p}${w ? `、勝率${w}` : ""}。レシピ：${J}。` },
    es: { main: `${nm} está en el puesto ${r} del meta de JCC Pokémon Pocket: ${p} de los jugadores${w ? `, ${w} de victorias` : ""}.`,
      more: `${nm} es una baraja menor de JCC Pokémon Pocket esta semana: ${p} de los jugadores${w ? `, ${w} de victorias` : ""}.`,
      qr: " Lista con código QR.", offD: `No está en el meta de JCC Pokémon Pocket de esta semana (visto por última vez el ${sd}): ${p} de uso. Su lista: `,
      in: `${nm}: puesto ${r} de las barajas de JCC Pokémon Pocket de esta semana${dates ? ` (${dates})` : ""}, ${p} de los jugadores${w ? `, ${w} de victorias en ${g} partidas` : ""}. La lista más jugada de ${nm}: ${J}. Abre la lista y toca su código QR para importarla en el juego.`,
      off: `No está en el meta de esta semana. Visto por última vez el ${sd}: puesto ${r} de las barajas de JCC Pokémon Pocket, ${p} de los jugadores${w ? `, ${w} de victorias` : ""}. Su lista: ${J}.` },
    pt: { main: `${nm} está na posição ${r} do meta de Pokémon TCG Pocket: ${p} dos jogadores${w ? `, ${w} de vitórias` : ""}.`,
      more: `${nm} é um baralho menor de Pokémon TCG Pocket nesta semana: ${p} dos jogadores${w ? `, ${w} de vitórias` : ""}.`,
      qr: " Lista com código QR.", offD: `Não está no meta de Pokémon TCG Pocket desta semana (visto pela última vez em ${sd}): ${p} de uso. Sua lista: `,
      in: `${nm}: posição ${r} entre os baralhos de Pokémon TCG Pocket desta semana${dates ? ` (${dates})` : ""}, ${p} dos jogadores${w ? `, ${w} de vitórias em ${g} partidas` : ""}. A lista mais jogada de ${nm}: ${J}. Abra a lista e toque no código QR para importá-la no jogo.`,
      off: `Não está no meta desta semana. Visto pela última vez em ${sd}: posição ${r} entre os baralhos de Pokémon TCG Pocket, ${p} dos jogadores${w ? `, ${w} de vitórias` : ""}. Sua lista: ${J}.` },
    de: { main: `${nm} ist auf Platz ${r} im Meta von Pokémon TCG Pocket: ${p} der Spieler${w ? `, ${w} Siegquote` : ""}.`,
      more: `${nm} ist diese Woche ein kleineres Deck in Pokémon TCG Pocket: ${p} der Spieler${w ? `, ${w} Siegquote` : ""}.`,
      qr: " Liste mit QR-Code.", offD: `Diese Woche nicht im Meta von Pokémon TCG Pocket (zuletzt gesehen: ${sd}): ${p} Anteil. Die Liste: `,
      in: `${nm}: Platz ${r} der Pokémon TCG Pocket-Decks dieser Woche${dates ? ` (${dates})` : ""}, ${p} der Spieler${w ? `, ${w} Siegquote in ${g} Spielen` : ""}. Die meistgespielte Liste von ${nm}: ${J}. Öffne die Liste und tippe auf den QR-Code, um sie ins Spiel zu übernehmen.`,
      off: `Diese Woche nicht im Meta. Zuletzt gesehen: ${sd}, Platz ${r} der Pokémon TCG Pocket-Decks, ${p} der Spieler${w ? `, ${w} Siegquote` : ""}. Die Liste: ${J}.` },
    fr: { main: `${nm} est n° ${r} du méta de Pokémon TCG Pocket : ${p} des joueurs${w ? `, ${w} de victoires` : ""}.`,
      more: `${nm} est un deck secondaire de Pokémon TCG Pocket cette semaine : ${p} des joueurs${w ? `, ${w} de victoires` : ""}.`,
      qr: " Liste avec code QR.", offD: `Absent du méta de Pokémon TCG Pocket cette semaine (vu pour la dernière fois le ${sd}) : ${p} d'utilisation. Sa liste : `,
      in: `${nm} : n° ${r} des decks de Pokémon TCG Pocket cette semaine${dates ? ` (${dates})` : ""}, ${p} des joueurs${w ? `, ${w} de victoires sur ${g} parties` : ""}. La liste de ${nm} la plus jouée : ${J}. Ouvrez la liste et touchez son code QR pour l'importer dans le jeu.`,
      off: `Absent du méta cette semaine. Vu pour la dernière fois le ${sd} : n° ${r} des decks de Pokémon TCG Pocket, ${p} des joueurs${w ? `, ${w} de victoires` : ""}. Sa liste : ${J}.` },
    it: { main: `${nm} è al ${r}º posto nel meta del GCC Pokémon Pocket: ${p} dei giocatori${w ? `, ${w} di vittorie` : ""}.`,
      more: `${nm} è un mazzo minore del GCC Pokémon Pocket questa settimana: ${p} dei giocatori${w ? `, ${w} di vittorie` : ""}.`,
      qr: " Lista con codice QR.", offD: `Non è nel meta del GCC Pokémon Pocket di questa settimana (visto l'ultima volta il ${sd}): ${p} di utilizzo. La sua lista: `,
      in: `${nm}: ${r}º tra i mazzi del GCC Pokémon Pocket di questa settimana${dates ? ` (${dates})` : ""}, ${p} dei giocatori${w ? `, ${w} di vittorie in ${g} partite` : ""}. La lista di ${nm} più giocata: ${J}. Apri la lista e tocca il suo codice QR per importarla nel gioco.`,
      off: `Non è nel meta di questa settimana. Visto l'ultima volta il ${sd}: ${r}º tra i mazzi del GCC Pokémon Pocket, ${p} dei giocatori${w ? `, ${w} di vittorie` : ""}. La sua lista: ${J}.` },
  }[lang];
  if (!T) return null;
  const head = e.more ? T.more : T.main;
  const fitL = (h, items) => {   // as page.mjs fit(), with the language's list separator and full stop
    const sep = lang === "ja" ? "、" : ", ", end = lang === "ja" ? "。" : ".";
    const mk = (k) => h + items.slice(0, k).join(sep) + (k < items.length ? "…" : end);
    let n = items.length; while (n > 1 && mk(n).length > 160) n--; return mk(n); };
  const desc = on ? ((head + T.qr).length <= 160 ? head + T.qr : head) : fitL(T.offD, cards);
  return { name: nm, desc, intro: on ? T.in : T.off };
}
export const spanText = (lang, a, b) => (DAY[lang] ? span(lang, a, b) : null);
