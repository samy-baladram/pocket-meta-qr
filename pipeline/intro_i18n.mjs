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
  ko: (m, d) => `${m}월 ${d}일`, zh: (m, d) => `${m}月${d}日`,
};
// a window of days: one day, days in one month (17–23 nov), or two months (30 oct – 5 nov)
function span(lang, a, b) {
  const [ma, da] = md(a), [mb, db] = md(b), f = DAY[lang];
  if (a.slice(0, 10) === b.slice(0, 10)) return f(ma, da);
  if (ma === mb) return lang === "ja" ? `${ma}月${da}日〜${db}日` : lang === "ko" ? `${ma}월 ${da}일~${db}일` : lang === "zh" ? `${ma}月${da}日～${db}日` : lang === "es" ? `${da}–${db} ${MON.es[ma - 1]}`
    : lang === "pt" ? `${da}–${db} de ${MON.pt[ma - 1]}` : lang === "fr" ? `${da === 1 ? "1er" : da}–${db} ${MON.fr[ma - 1]}` : lang === "it" ? `${da}–${db} ${MON.it[ma - 1]}` : `${da}.–${db}. ${MON.de[ma - 1]}`;
  return lang === "ja" ? `${f(ma, da)}〜${f(mb, db)}` : lang === "ko" ? `${f(ma, da)}~${f(mb, db)}` : lang === "zh" ? `${f(ma, da)}～${f(mb, db)}` : `${f(ma, da)} – ${f(mb, db)}`;
}
const pct = (lang, v) => { const s = (+v).toFixed(1); return lang === "ja" || lang === "ko" || lang === "zh" ? s + "%" : (lang === "pt" || lang === "it") ? s.replace(".", ",") + "%"
  : s.replace(".", ",") + " %"; };
const rank = (lang, i) => (lang === "ja" ? `${i}位` : lang === "ko" ? `${i}위` : lang === "zh" ? `第${i}名` : lang === "es" ? `${i}.º` : lang === "pt" ? `${i}º` : lang === "fr" ? (i === 1 ? "1er" : `${i}e`) : lang === "it" ? `${i}º` : `${i}.`);

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
    : lang === "zh" ? `${rank(lang, i + 1)} ${deck(lang, N, d.name)}（使用率${pct(lang, d.share)}）`
    : `${rank(lang, i + 1)} ${deck(lang, N, d.name)} ${pct(lang, d.share)}`);
  if (lang === "ja") return `今週のポケポケ最強デッキ（${n}大会・${w}）：${top.join("、")}。すべてのレシピにQRコードがあり、ゲームに読み込めます。`;
  if (lang === "ko") return `이번 주 포켓몬 카드 게임 Pocket 메타 덱(대회 ${n}개, ${w}): ${top.join(", ")}. ` +
    "모든 레시피에 게임에서 읽을 수 있는 QR 코드가 있습니다.";
  if (lang === "zh") return `本週Pokémon TCG Pocket環境牌組（${n}場比賽，${w}）：${top.join("、")}。每份卡表都附有可在遊戲中讀取的QR碼。`;
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
    limited: "Baralhos selecionados com códigos QR para o evento atual de Batalhas Limitadas.",
    about: "Como importar um baralho de Pokémon TCG Pocket por código QR, de onde vêm os dados (torneios da Limitless, últimos 7 dias) e como os baralhos e as listas são classificados." },
  de: { events: "Ergebnisse der neuesten Pokémon TCG Pocket-Turniere: Top-8-Listen mit QR-Codes.",
    packs: "Welche Pokémon TCG Pocket-Packs die Karten der Meta-Decks dieser Woche enthalten.",
    limited: "Ausgewählte Decks mit QR-Codes für die aktuellen Limitierten Kämpfe.",
    about: "So importierst du ein Pokémon TCG Pocket-Deck per QR-Code, woher die Daten kommen (Limitless-Turniere, letzte 7 Tage) und wie Decks und Listen sortiert werden." },
  fr: { events: "Résultats des derniers tournois de Pokémon TCG Pocket : listes du top 8 avec codes QR.",
    packs: "Quels boosters de Pokémon TCG Pocket donnent les cartes des decks de la méta de la semaine.",
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
  zh: { events: "Pokémon TCG Pocket最新比賽結果：八強卡表，附QR碼。",
    packs: "本週環境牌組的卡牌出自哪些Pokémon TCG Pocket擴充包。",
    limited: "為進行中的限定對戰挑選的牌組，附QR碼。",
    about: "如何用QR碼匯入Pokémon TCG Pocket牌組、資料來源（Limitless比賽，最近7天），以及牌組和卡表的排序方式。" },
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
  const cjk = lang === "ja" || lang === "zh";   // full-width punctuation (、。（）)
  const cards = (e.cards || []).map(([n, c]) => (cjk ? `${cn(n)}×${c}` : lang === "ko" ? `${cn(n)} ${c}장` : `${c} ${cn(n)}`));
  const sd = e.seen ? DAY[lang](...md(e.seen)) : "", r = e.rank, g = e.games, J = cards.join(cjk ? "、" : ", ");
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
    fr: { main: `${nm} est n° ${r} de la méta de Pokémon TCG Pocket : ${p} des joueurs${w ? `, ${w} de victoires` : ""}.`,
      more: `${nm} est un deck secondaire de Pokémon TCG Pocket cette semaine : ${p} des joueurs${w ? `, ${w} de victoires` : ""}.`,
      qr: " Liste avec code QR.", offD: `Absent de la méta de Pokémon TCG Pocket cette semaine (vu pour la dernière fois le ${sd}) : ${p} d'utilisation. Sa liste : `,
      in: `${nm} : n° ${r} des decks de Pokémon TCG Pocket cette semaine${dates ? ` (${dates})` : ""}, ${p} des joueurs${w ? `, ${w} de victoires sur ${g} parties` : ""}. La liste de ${nm} la plus jouée : ${J}. Ouvrez la liste et touchez son code QR pour l'importer dans le jeu.`,
      off: `Absent de la méta cette semaine. Vu pour la dernière fois le ${sd} : n° ${r} des decks de Pokémon TCG Pocket, ${p} des joueurs${w ? `, ${w} de victoires` : ""}. Sa liste : ${J}.` },
    ko: { main: `${nm}: 이번 주 포켓몬 카드 게임 Pocket 메타 ${r}위, 사용률 ${p}${w ? `, 승률 ${w}` : ""}.`,
      more: `${nm}: 이번 주 포켓몬 카드 게임 Pocket 소규모 덱, 사용률 ${p}${w ? `, 승률 ${w}` : ""}.`,
      qr: " QR 코드가 있는 레시피.", offD: `${nm}: 이번 주 메타에 없습니다(마지막 등장: ${sd}). 사용률 ${p}. 레시피: `,
      in: `${nm}: 이번 주 포켓몬 카드 게임 Pocket 덱 중 ${r}위${dates ? `(${dates})` : ""}, 사용률 ${p}${w ? `, ${g}전 승률 ${w}` : ""}. 가장 많이 쓰인 ${nm} 레시피: ${J}. 레시피를 열고 QR 코드를 탭하면 게임으로 읽어 올 수 있습니다.`,
      off: `이번 주 메타에 없습니다. 마지막 등장: ${sd}. 당시 포켓몬 카드 게임 Pocket 덱 중 ${r}위, 사용률 ${p}${w ? `, 승률 ${w}` : ""}. 레시피: ${J}.` },
    zh: { main: `${nm}：本週Pokémon TCG Pocket環境第${r}名，使用率${p}${w ? `，勝率${w}` : ""}。`,
      more: `${nm}：本週Pokémon TCG Pocket的小眾牌組，使用率${p}${w ? `，勝率${w}` : ""}。`,
      qr: "附QR碼的卡表。", offD: `${nm}：本週不在環境中（最後出現：${sd}）。使用率${p}。卡表：`,
      in: `${nm}：本週Pokémon TCG Pocket牌組第${r}名${dates ? `（${dates}）` : ""}，使用率${p}${w ? `，${g}場勝率${w}` : ""}。最常用的${nm}卡表：${J}。打開卡表並點選QR碼，即可匯入遊戲。`,
      off: `本週不在環境中。最後出現：${sd}。當時為Pokémon TCG Pocket牌組第${r}名，使用率${p}${w ? `，勝率${w}` : ""}。卡表：${J}。` },
    it: { main: `${nm} è al ${r}º posto nel meta del GCC Pokémon Pocket: ${p} dei giocatori${w ? `, ${w} di vittorie` : ""}.`,
      more: `${nm} è un mazzo minore del GCC Pokémon Pocket questa settimana: ${p} dei giocatori${w ? `, ${w} di vittorie` : ""}.`,
      qr: " Lista con codice QR.", offD: `Non è nel meta del GCC Pokémon Pocket di questa settimana (visto l'ultima volta il ${sd}): ${p} di utilizzo. La sua lista: `,
      in: `${nm}: ${r}º tra i mazzi del GCC Pokémon Pocket di questa settimana${dates ? ` (${dates})` : ""}, ${p} dei giocatori${w ? `, ${w} di vittorie in ${g} partite` : ""}. La lista di ${nm} più giocata: ${J}. Apri la lista e tocca il suo codice QR per importarla nel gioco.`,
      off: `Non è nel meta di questa settimana. Visto l'ultima volta il ${sd}: ${r}º tra i mazzi del GCC Pokémon Pocket, ${p} dei giocatori${w ? `, ${w} di vittorie` : ""}. La sua lista: ${J}.` },
  }[lang];
  if (!T) return null;
  const head = e.more ? T.more : T.main;
  const fitL = (h, items) => {   // as page.mjs fit(), with the language's list separator and full stop
    const sep = cjk ? "、" : ", ", end = cjk ? "。" : ".";
    const mk = (k) => h + items.slice(0, k).join(sep) + (k < items.length ? "…" : end);
    let n = items.length; while (n > 1 && mk(n).length > 160) n--; return mk(n); };
  const desc = on ? ((head + T.qr).length <= 160 ? head + T.qr : head) : fitL(T.offD, cards);
  return { name: nm, desc, intro: on ? T.in : T.off };
}
export const spanText = (lang, a, b) => (DAY[lang] ? span(lang, a, b) : null);

// Phase 2 Step 4b (Nov 24, 2026): the texts of a language pack page (/<lang>/packs/<id>/). x: page.mjs packBuild entry
// ({ set, setName, pack, cards: [{ n, decks: [{ d: { name } }], st }] }); names as the page: the set name from
// names.<lang>.json `s` (by set code), the pack's Pokémon as trPack (the card name, or the "ex" card name without "ex").
// Returns { name, desc, intro } or null (no texts for that language).
function setNames(lang, dir) {
  const f = `${dir}/names.${lang}.json`;
  if (!existsSync(f)) return {};
  const s = { ...(JSON.parse(readFileSync(f, "utf8")).s || {}) };
  const fx = existsSync(`${dir}/names.fix.json`) ? JSON.parse(readFileSync(`${dir}/names.fix.json`, "utf8"))[lang] : null;
  Object.assign(s, (fx && fx.s) || {});
  return Object.fromEntries(Object.entries(s).map(([k, v]) => [k.toLowerCase(), v]));
}
export function packText(lang, x, dates, namesDir = "preview/i18n") {
  const N = names(lang, namesDir), S = setNames(lang, namesDir), cn = (n) => (N && N[n]) || n;
  const trPack = (en) => { if (!N) return en; if (N[en]) return N[en]; const b = N[en + " ex"]; return b ? b.replace(/[-\s]?ex$/, "") : en; };
  const nm = (S[String(x.set || "").toLowerCase()] || x.setName) + (x.pack === x.setName ? "" : " " + trPack(x.pack));
  const meta = x.cards.filter((c) => c.st), small = x.cards.length - meta.length, k = meta.length, ja = lang === "ja" || lang === "zh";   // ja: full-width punctuation
  const P = (n, one, many) => (n === 1 ? one : many);
  const dk = (c) => c.decks.slice(0, 3).map((r) => deck(lang, N, r.d.name)).join(ja ? "、" : ", ") + (c.decks.length > 3 ? "…" : "");
  const T = {
    ja: { unit: (n) => `${n}デッキ`, d: `${nm}パック：今週のポケポケ環境デッキで使われるカード${k}枚：`,
      d0: `${nm}パック：今週のポケポケ環境デッキで使われるカードはありません（${dates}）。`,
      i: `今週（${dates}）のポケポケのデッキのうち、${nm}パックのカードを使うデッキ：`,
      i0: `${nm}パックのカードは、今週（${dates}）のポケポケ環境デッキでは使われていません。`,
      sm: (s) => (k ? `ほかに${s}枚のカードが少数派デッキだけで使われています。` : `${s}枚のカードは少数派デッキだけで使われています。`) },
    es: { unit: (n) => `${n} ${P(n, "baraja", "barajas")}`, d: `Sobre ${nm}: ${k} ${P(k, "carta que se juega", "cartas que se juegan")} en las barajas del meta de JCC Pokémon Pocket esta semana: `,
      d0: `Sobre ${nm}: ninguna de sus cartas se juega en las barajas del meta de JCC Pokémon Pocket esta semana (${dates}).`,
      i: `Qué barajas de JCC Pokémon Pocket de esta semana (${dates}) usan las cartas del sobre ${nm}: `,
      i0: `Ninguna carta del sobre ${nm} se juega en las barajas del meta de JCC Pokémon Pocket esta semana (${dates}).`,
      sm: (s) => `${s} ${k ? P(s, "carta más", "cartas más") : P(s, "carta", "cartas")} solo en barajas menores.` },
    pt: { unit: (n) => `${n} ${P(n, "baralho", "baralhos")}`, d: `Pacote ${nm}: ${k} ${P(k, "carta usada", "cartas usadas")} nos baralhos do meta de Pokémon TCG Pocket desta semana: `,
      d0: `Pacote ${nm}: nenhuma das suas cartas é usada nos baralhos do meta de Pokémon TCG Pocket desta semana (${dates}).`,
      i: `Quais baralhos de Pokémon TCG Pocket desta semana (${dates}) usam as cartas do pacote ${nm}: `,
      i0: `Nenhuma carta do pacote ${nm} é usada nos baralhos do meta de Pokémon TCG Pocket desta semana (${dates}).`,
      sm: (s) => `${k ? "Mais " : ""}${s} ${P(s, "carta", "cartas")} só em baralhos menores.` },
    de: { unit: (n) => `${n} ${P(n, "Deck", "Decks")}`, d: `Pack ${nm}: ${k} ${P(k, "Karte", "Karten")} aus den Meta-Decks von Pokémon TCG Pocket dieser Woche: `,
      d0: `Pack ${nm}: Keine seiner Karten wird diese Woche in den Meta-Decks von Pokémon TCG Pocket gespielt (${dates}).`,
      i: `Welche Pokémon TCG Pocket-Decks dieser Woche (${dates}) die Karten aus dem Pack ${nm} nutzen: `,
      i0: `Keine Karte aus dem Pack ${nm} wird in den Meta-Decks von Pokémon TCG Pocket dieser Woche gespielt (${dates}).`,
      sm: (s) => `${s} ${k ? P(s, "weitere Karte", "weitere Karten") : P(s, "Karte", "Karten")} nur in kleineren Decks.` },
    fr: { unit: (n) => `${n} ${P(n, "deck", "decks")}`, d: `Booster ${nm} : ${k} ${P(k, "carte jouée", "cartes jouées")} dans les decks de la méta de Pokémon TCG Pocket cette semaine : `,
      d0: `Booster ${nm} : aucune de ses cartes n'est jouée dans les decks de la méta de Pokémon TCG Pocket cette semaine (${dates}).`,
      i: `Quels decks de Pokémon TCG Pocket de cette semaine (${dates}) utilisent les cartes du booster ${nm} : `,
      i0: `Aucune carte du booster ${nm} n'est jouée dans les decks de la méta de Pokémon TCG Pocket cette semaine (${dates}).`,
      sm: (s) => `${s} ${k ? P(s, "autre carte", "autres cartes") : P(s, "carte", "cartes")} seulement dans des decks secondaires.` },
    ko: { unit: (n) => `덱 ${n}개`, d: `${nm} 팩: 이번 주 포켓몬 카드 게임 Pocket 메타 덱에서 쓰이는 카드 ${k}장: `,
      d0: `${nm} 팩: 이번 주 포켓몬 카드 게임 Pocket 메타 덱에서 쓰이는 카드가 없습니다(${dates}).`,
      i: `이번 주(${dates}) 포켓몬 카드 게임 Pocket 덱 중 ${nm} 팩의 카드를 쓰는 덱: `,
      i0: `${nm} 팩의 카드는 이번 주(${dates}) 포켓몬 카드 게임 Pocket 메타 덱에서 쓰이지 않습니다.`,
      sm: (s) => (k ? `그 밖에 카드 ${s}장은 소규모 덱에서만 쓰입니다.` : `카드 ${s}장은 소규모 덱에서만 쓰입니다.`) },
    zh: { unit: (n) => `${n}個牌組`, d: `${nm}擴充包：本週Pokémon TCG Pocket環境牌組使用的卡牌${k}張：`,
      d0: `${nm}擴充包：本週Pokémon TCG Pocket環境牌組沒有使用其中的卡牌（${dates}）。`,
      i: `本週（${dates}）的Pokémon TCG Pocket牌組中，使用${nm}擴充包卡牌的牌組：`,
      i0: `${nm}擴充包的卡牌，本週（${dates}）的Pokémon TCG Pocket環境牌組都沒有使用。`,
      sm: (s) => (k ? `另有${s}張卡只用在小眾牌組。` : `${s}張卡只用在小眾牌組。`) },
    it: { unit: (n) => `${n} ${P(n, "mazzo", "mazzi")}`, d: `Busta ${nm}: ${k} ${P(k, "carta giocata", "carte giocate")} nei mazzi del meta del GCC Pokémon Pocket di questa settimana: `,
      d0: `Busta ${nm}: nessuna delle sue carte è giocata nei mazzi del meta del GCC Pokémon Pocket di questa settimana (${dates}).`,
      i: `Quali mazzi del GCC Pokémon Pocket di questa settimana (${dates}) usano le carte della busta ${nm}: `,
      i0: `Nessuna carta della busta ${nm} è giocata nei mazzi del meta del GCC Pokémon Pocket di questa settimana (${dates}).`,
      sm: (s) => (k ? P(s, "Un'altra carta", `Altre ${s} carte`) : `${s} ${P(s, "carta", "carte")}`) + " solo in mazzi minori." },
  }[lang];
  if (!T) return null;
  const sep = ja ? "、" : ", ", end = ja ? "。" : ".", op = ja ? "（" : lang === "ko" ? "(" : " (", cp = ja ? "）" : ")", col = ja ? "：" : ": ";
  const fitL = (h, items) => { const mk = (n) => h + items.slice(0, n).join(sep) + (n < items.length ? "…" : end);
    let n = items.length; while (n > 1 && mk(n).length > 160) n--; return mk(n); };
  const desc = k ? fitL(T.d, meta.map((c, i) => `${cn(c.n)}${op}${i ? c.decks.length : T.unit(c.decks.length)}${cp}`)) : T.d0;
  const intro = (k ? T.i + meta.map((c) => `${cn(c.n)}${op}${T.unit(c.decks.length)}${col}${dk(c)}${cp}`).join(sep) + end : T.i0) +
    (small ? (ja ? "" : " ") + T.sm(small) : "");
  return { name: nm, desc, intro };
}

// Phase 2 Step 4c (Nov 25, 2026): the texts of a language card page (/<lang>/cards/<id>/). en = the English card name,
// e = the English page's entry ({ pct, nd, L: [{ name, c, tp }], seen }), on = in this week's lists, packs = the main
// print's booster packs ([{ set, setName, pack, solo }], promo packs left out; [] = a promo card).
export function cardText(lang, en, e, on, dates, packs, namesDir = "preview/i18n") {
  const N = names(lang, namesDir), S = setNames(lang, namesDir), ja = lang === "ja" || lang === "zh";   // ja: full-width punctuation
  if (!DAY[lang]) return null;
  const nm = (N && N[en]) || en, P = (n, one, many) => (n === 1 ? one : many);
  const trPack = (x) => { if (!N) return x; if (N[x]) return N[x]; const b = N[x + " ex"]; return b ? b.replace(/[-\s]?ex$/, "") : x; };
  const OR = { ja: "または", ko: " 또는 ", zh: "或", es: " o ", pt: " ou ", de: " oder ", fr: " ou ", it: " o " }[lang];
  const orJoin = (L) => (L.length > 1 ? L.slice(0, -1).join(ja ? "、" : ", ") + OR + L.at(-1) : L[0]);
  const bySet = new Map();
  for (const p of packs || []) { const sn = S[String(p.set).toLowerCase()] || p.setName;
    (bySet.get(sn) || bySet.set(sn, []).get(sn)).push(p.solo ? null : trPack(p.pack)); }
  const pkLong = bySet.size ? orJoin([...bySet].map(([sn, L]) => (L.some((x) => x) ? `${sn}${ja ? " " : " "}${orJoin(L.filter((x) => x))}` : sn))) : null;
  const pkShort = bySet.size ? orJoin([...bySet.keys()]) : null;
  const pc = (v) => (v == null ? "?" : ja || lang === "ko" || lang === "pt" || lang === "it" ? `${v}%` : `${v} %`);
  const p = pc(e.pct), nd = e.nd ?? (e.L || []).length, sd = e.seen ? DAY[lang](...md(e.seen)) : "";
  const L = (e.L || []).map((x) => ({ ...x, name: deck(lang, N, x.name) })), more = nd > L.length ? "…" : "";
  const T = {
    ja: { pk: (s) => `入手：${s}パック。`, promo: "プロモカード（パックからは出ません）。",
      use: (x) => `${x.name}（${x.c}枚、上位${x.tp}人）`,
      d: `${nm}：今週のポケポケ環境デッキ${nd}個で使われ、上位プレイヤーの${p}が採用。主なデッキ：`,
      i: `${nm}は今週（${dates}）のポケポケのデッキ${nd}個で使われ、上位プレイヤーの${p}が採用しています。使っているデッキ：`,
      od: `${nm}：今週の環境デッキでは使われていません（最終確認：${sd}）。使われていたデッキ${nd}個：`,
      oi: `今週の環境デッキでは使われていません。最終確認：${sd}。当時${nd}個のデッキで、上位プレイヤーの${p}が採用。使っていたデッキ：` },
    ko: { pk: (s) => `입수: ${s} 팩.`, promo: "프로모 카드(팩에 들어 있지 않음).",
      use: (x) => `${x.name}(${x.c}장, 상위 플레이어 ${x.tp}명)`,
      d: `${nm}: 이번 주 포켓몬 카드 게임 Pocket 메타 덱 ${nd}개에서 사용, 상위 플레이어의 ${p}가 채용. 주요 덱: `,
      i: `${nm}: 이번 주(${dates}) 포켓몬 카드 게임 Pocket 덱 ${nd}개에서 쓰이며, 상위 플레이어의 ${p}가 채용했습니다. 사용하는 덱: `,
      od: `${nm}: 이번 주 메타 덱에서 쓰이지 않습니다(마지막 등장: ${sd}). 사용하던 덱 ${nd}개: `,
      oi: `이번 주 메타 덱에서 쓰이지 않습니다. 마지막 등장: ${sd}. 당시 덱 ${nd}개에서 상위 플레이어의 ${p}가 채용. 사용하던 덱: ` },
    zh: { pk: (s) => `取得：${s}擴充包。`, promo: "宣傳卡（不在擴充包中）。",
      use: (x) => `${x.name}（${x.c}張，頂尖玩家${x.tp}人）`,
      d: `${nm}：本週有${nd}個Pokémon TCG Pocket環境牌組使用，頂尖玩家採用率${p}。主要牌組：`,
      i: `${nm}：本週（${dates}）有${nd}個Pokémon TCG Pocket牌組使用，頂尖玩家採用率${p}。使用的牌組：`,
      od: `${nm}：本週環境牌組未使用（最後出現：${sd}）。曾使用的牌組${nd}個：`,
      oi: `本週環境牌組未使用。最後出現：${sd}。當時有${nd}個牌組使用，頂尖玩家採用率${p}。曾使用的牌組：` },
    es: { pk: (s) => `Consíguela en el sobre ${s}.`, promo: "Carta promocional (no sale en sobres).",
      use: (x) => `${x.name} (${x.c} ${P(x.c, "copia", "copias")}, ${x.tp} ${P(x.tp, "jugador top", "jugadores top")})`,
      d: `${nm} está en ${nd} ${P(nd, "baraja", "barajas")} del meta de JCC Pokémon Pocket esta semana, usada por el ${p} de los jugadores top. Barajas principales: `,
      i: `${nm} se juega en ${nd} de las barajas de JCC Pokémon Pocket de esta semana (${dates}), usada por el ${p} de los jugadores top. Barajas que la usan: `,
      od: `No está en las barajas del meta de JCC Pokémon Pocket esta semana (vista por última vez el ${sd}). Estaba en ${nd} ${P(nd, "baraja", "barajas")}: `,
      oi: `No está en las barajas del meta de esta semana. Vista por última vez el ${sd}: en ${nd} ${P(nd, "baraja", "barajas")}, usada por el ${p} de los jugadores top. Barajas que la usaban: ` },
    pt: { pk: (s) => `Obtenha no pacote ${s}.`, promo: "Carta promocional (não vem em pacotes).",
      use: (x) => `${x.name} (${x.c} ${P(x.c, "cópia", "cópias")}, ${x.tp} ${P(x.tp, "jogador top", "jogadores top")})`,
      d: `${nm} está em ${nd} ${P(nd, "baralho", "baralhos")} do meta de Pokémon TCG Pocket nesta semana, usada por ${p} dos jogadores top. Principais baralhos: `,
      i: `${nm} é jogada em ${nd} dos baralhos de Pokémon TCG Pocket desta semana (${dates}), por ${p} dos jogadores top. Baralhos que a usam: `,
      od: `Não está nos baralhos do meta de Pokémon TCG Pocket desta semana (vista pela última vez em ${sd}). Estava em ${nd} ${P(nd, "baralho", "baralhos")}: `,
      oi: `Não está nos baralhos do meta desta semana. Vista pela última vez em ${sd}: em ${nd} ${P(nd, "baralho", "baralhos")}, por ${p} dos jogadores top. Baralhos que a usavam: ` },
    de: { pk: (s) => `Erhältlich im Pack ${s}.`, promo: "Promo-Karte (nicht in Boosterpacks).",
      use: (x) => `${x.name} (${x.c} ${P(x.c, "Kopie", "Kopien")}, ${x.tp} Top-Spieler)`,
      d: `${nm} ist diese Woche in ${nd} ${P(nd, "Meta-Deck", "Meta-Decks")} von Pokémon TCG Pocket, gespielt von ${p} der Top-Spieler. Top-Decks: `,
      i: `${nm} wird in ${nd} der Pokémon TCG Pocket-Decks dieser Woche (${dates}) gespielt, von ${p} der Top-Spieler. Decks, die sie nutzen: `,
      od: `Diese Woche in keinem Meta-Deck von Pokémon TCG Pocket (zuletzt gesehen: ${sd}). Sie war in ${nd} ${P(nd, "Deck", "Decks")}: `,
      oi: `Diese Woche in keinem Meta-Deck. Zuletzt gesehen: ${sd}, in ${nd} ${P(nd, "Deck", "Decks")}, von ${p} der Top-Spieler gespielt. Decks, die sie nutzten: ` },
    fr: { pk: (s) => `À obtenir dans le booster ${s}.`, promo: "Carte promo (pas dans les boosters).",
      use: (x) => `${x.name} (${x.c} ${P(x.c, "exemplaire", "exemplaires")}, ${x.tp} ${P(x.tp, "top joueur", "top joueurs")})`,
      d: `${nm} est dans ${nd} ${P(nd, "deck", "decks")} de la méta de Pokémon TCG Pocket cette semaine, jouée par ${p} des top joueurs. Decks principaux : `,
      i: `${nm} est jouée dans ${nd} des decks de Pokémon TCG Pocket de cette semaine (${dates}), par ${p} des top joueurs. Decks qui l'utilisent : `,
      od: `Absente des decks de la méta de Pokémon TCG Pocket cette semaine (vue pour la dernière fois le ${sd}). Elle était dans ${nd} ${P(nd, "deck", "decks")} : `,
      oi: `Absente des decks de la méta cette semaine. Vue pour la dernière fois le ${sd} : dans ${nd} ${P(nd, "deck", "decks")}, jouée par ${p} des top joueurs. Decks qui l'utilisaient : ` },
    it: { pk: (s) => `Si trova nella busta ${s}.`, promo: "Carta promo (non nelle buste).",
      use: (x) => `${x.name} (${x.c} ${P(x.c, "copia", "copie")}, ${x.tp} ${P(x.tp, "giocatore top", "giocatori top")})`,
      d: `${nm} è in ${nd} ${P(nd, "mazzo", "mazzi")} del meta del GCC Pokémon Pocket questa settimana, usata dal ${p} dei giocatori top. Mazzi principali: `,
      i: `${nm} è giocata in ${nd} dei mazzi del GCC Pokémon Pocket di questa settimana (${dates}), dal ${p} dei giocatori top. Mazzi che la usano: `,
      od: `Non è nei mazzi del meta del GCC Pokémon Pocket questa settimana (vista l'ultima volta il ${sd}). Era in ${nd} ${P(nd, "mazzo", "mazzi")}: `,
      oi: `Non è nei mazzi del meta di questa settimana. Vista l'ultima volta il ${sd}: in ${nd} ${P(nd, "mazzo", "mazzi")}, usata dal ${p} dei giocatori top. Mazzi che la usavano: ` },
  }[lang];
  if (!T) return null;
  const sep = ja ? "、" : ", ", end = ja ? "。" : ".", sp = ja ? "" : " ";
  const tail = pkShort ? T.pk(pkShort) : T.promo, tailL = pkLong ? T.pk(pkLong) : T.promo;
  const fitL = (h, items, t) => { const mk = (n) => h + items.slice(0, n).join(sep) + (n < items.length ? "…" : end) + sp + t;
    let n = items.length; while (n > 1 && mk(n).length > 160) n--; return mk(n); };
  const used = L.map(T.use).join(sep) + more;
  return { name: nm, desc: fitL(on ? T.d : T.od, L.map((x) => x.name), tail), intro: (on ? T.i : T.oi) + used + (more ? "" : end) + sp + tailL };
}
