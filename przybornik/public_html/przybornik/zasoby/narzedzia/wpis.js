// § 12 Podgląd wpisu · gdzie LinkedIn utnie wpis na „…więcej” i ile znaków policzy X.
// Wszystko liczy przeglądarka, tekst nie idzie na serwer. Szkic zostaje w tej przeglądarce (localStorage).
import { el, pole, zetony, odmiana } from '../wspolne.js';

/* --- Liczenie (bez DOM, testy w tests/js) ----------------------------------------- */

const SEGMENTER = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('pl', { granularity: 'grapheme' }) : null;

/** Tekst podzielony na znaki tak, jak widzi je człowiek: emoji z odcieniem skóry albo flaga to jeden znak. */
export function grafemy(tekst) {
  return SEGMENTER ? Array.from(SEGMENTER.segment(tekst), (s) => s.segment) : Array.from(tekst);
}

// Zasady X (biblioteka twitter-text, konfiguracja v3): znak z tych zakresów waży 1, każdy inny 2,
// emoji (także złożone z kilku znaków) 2, link 23 niezależnie od długości. Tekst najpierw idzie do NFC.
// Polskie litery, „cudzysłowy” i półpauza ważą 1; wielokropek „…”, strzałki i punktory „•” ważą 2.
const ZAKRESY_X = [[0, 4351], [8192, 8205], [8208, 8223], [8242, 8247]];
export const X_LIMIT = 280;
export const X_LINK = 23;
const EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u;
const ZNAKI_TEKSTOWE = /^[©®]$/u;          // © i ® bez wariantu emoji liczą się jak zwykłe znaki
const LINK = /https?:\/\/[^\s]+|(?<![\p{L}\p{N}@._-])(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:pl|com|org|net|eu|io|ai|dev|app|co|info|me|tv|edu|gov|uk|de|fm|ly|gg|xyz|news|blog)(?![\p{L}\p{N}-])(?:\/[^\s]*)?/giu;
const KONIEC_LINKU = /[.,;:!?)\]}»"”'’…]+$/u;

/** Zakresy [początek, koniec) linków w tekście, tak jak rozpozna je X (także adresy bez https://). */
export function linki(tekst) {
  const wynik = [];
  for (const m of tekst.matchAll(LINK)) {
    const adres = m[0].replace(KONIEC_LINKU, '');
    if (adres.includes('.')) wynik.push([m.index, m.index + adres.length]);
  }
  return wynik;
}

function wagaX(g) {
  if (EMOJI.test(g) && !ZNAKI_TEKSTOWE.test(g)) return 2;
  let w = 0;
  for (const z of g) {
    const k = z.codePointAt(0);
    w += ZAKRESY_X.some(([a, b]) => k >= a && k <= b) ? 1 : 2;
  }
  return w;
}

/**
 * Długość wpisu liczona jak w X. `ciecia[n]` to indeks w `tekst` (po NFC), od którego wpis wychodzi
 * poza `progi[n]`, albo null, gdy się mieści.
 */
export function liczX(tekst, progi = [X_LIMIT]) {
  const t = tekst.normalize('NFC');
  const zakresy = linki(t);
  const ciecia = progi.map(() => null);
  let waga = 0, i = 0, l = 0;
  const sprawdz = (od) => progi.forEach((p, n) => { if (ciecia[n] === null && waga > p) ciecia[n] = od; });
  for (const g of grafemy(t)) {
    while (l < zakresy.length && zakresy[l][1] <= i) l++;
    const link = zakresy[l];
    if (link && i >= link[0]) {
      if (i === link[0]) { waga += X_LINK; sprawdz(i); }
    } else {
      waga += wagaX(g);
      sprawdz(i);
    }
    i += g.length;
  }
  return { tekst: t, waga, ciecia, linki: zakresy.length };
}

/** Znaki, słowa i akapity. Znak to grafem, więc emoji z odcieniem skóry liczy się raz. */
export function statystyki(tekst) {
  const t = tekst.trim();
  return {
    znaki: grafemy(t).length,
    slowa: (t.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length,
    akapity: t ? t.split(/\n\s*\n/).filter((a) => a.trim()).length : 0,
  };
}

/** Pierwsze zdanie: do kropki, wykrzyknika, pytajnika albo wielokropka przed odstępem, najdalej do końca linijki. */
export function pierwszeZdanie(tekst) {
  const t = tekst.trimStart();
  const m = /[.!?…]+(?=\s|$)|\n/u.exec(t);
  return t.slice(0, m ? m.index + (m[0] === '\n' ? 0 : m[0].length) : t.length);
}

/* --- Podgląd LinkedIn: mierzenie linijek w przeglądarce ------------------------------ */

// LinkedIn nie podaje, gdzie ucina wpis. Pokazuje kilka pierwszych linijek i dopisuje „…więcej”.
// Przyjmuję 3 linijki: w telefonie wychodzi zwykle ok. 140 znaków, na komputerze ok. 210,
// czyli tyle, ile podaje większość zestawień. Puste linijki też się liczą.
export const WARIANTY = [
  { id: 'telefon', nazwa: 'LinkedIn w telefonie', linijki: 3 },
  { id: 'komputer', nazwa: 'LinkedIn na komputerze', linijki: 3 },
];
const WIECEJ = '…więcej';
const KLUCZ = 'przybornik.wpis';

/** Ile grafemów mieści się w `linijki` linijkach razem z „…więcej”; null, gdy widać cały tekst. */
function ciecieLinkedIn(miernik, g, linijki) {
  const wysokosc = parseFloat(getComputedStyle(miernik.korzen).lineHeight) * linijki + 1;
  const miesci = (n, dopisek) => {
    miernik.tekst.textContent = g.slice(0, n).join('').trimEnd();
    miernik.dopisek.hidden = !dopisek;
    return miernik.korzen.offsetHeight <= wysokosc;
  };
  if (miesci(g.length, false)) return null;
  let lo = 0, hi = g.length;                    // lo się mieści, hi nie
  while (hi - lo > 1) {
    const s = (lo + hi) >> 1;
    if (miesci(s, true)) lo = s; else hi = s;
  }
  return lo;
}

let odswiezWidok = null;
export function widoczne() { odswiezWidok?.(); }

export async function start(korzen) {
  const pamiec = {
    czytaj() { try { return localStorage.getItem(KLUCZ) || ''; } catch { return ''; } },
    zapisz(t) { try { if (t) localStorage.setItem(KLUCZ, t); else localStorage.removeItem(KLUCZ); } catch { /* tryb prywatny */ } },
  };

  const pisz = el('textarea', { rows: 12, spellcheck: true, placeholder: 'Wklej wpis albo pisz tutaj.' });
  pisz.value = pamiec.czytaj();
  const licznik = el('p', { class: 'wpis-licznik' });
  const kopiuj = el('button', { type: 'button', class: 'przycisk przycisk-cichy przycisk-maly', text: 'Kopiuj tekst' });
  const wyczysc = el('button', { type: 'button', class: 'link', text: 'Wyczyść' });
  const pusto = el('p', { class: 'bs-small', text: 'Podgląd pojawi się, gdy wpiszesz tekst. Tekst nie wychodzi z przeglądarki, szkic zostaje w niej do wyczyszczenia.' });

  // Karty LinkedIn: widoczna i niewidoczny miernik o tej samej szerokości i czcionce.
  const miernikiKorzen = el('div', { class: 'wpis-miernik', 'aria-hidden': 'true' });
  const karty = WARIANTY.map((w) => {
    const dopisek = el('span', { text: WIECEJ, hidden: true });
    const tekstMiernika = el('span');
    const miernik = { korzen: el('div', { class: `wpis-tekst wpis-${w.id}` }, tekstMiernika, dopisek), tekst: tekstMiernika, dopisek };
    miernikiKorzen.append(miernik.korzen);
    const tekst = el('div', { class: `wpis-tekst wpis-${w.id}` });
    const opis = el('p', { class: 'podpis' });
    const karta = { ...w, miernik, tekst, opis, rozwiniety: false };
    karta.el = el('figure', { class: `wpis-podglad wpis-podglad-${w.id}` },
      el('figcaption', { class: 'etykieta', text: w.nazwa }),
      el('div', { class: 'wpis-przewijany' }, el('div', { class: 'wpis-karta' }, tekst)),
      opis);
    return karta;
  });

  const progX = zetony([[250, '250'], [280, '280 (limit X)']], 250);
  const xLiczba = el('p', { class: 'wpis-x-liczba' });
  const xPasek = el('div', { class: 'wpis-x-pasek' });
  const xTekst = el('div', { class: 'wpis-tekst wpis-x-tekst', hidden: true });
  const xOpis = el('p', { class: 'podpis' });
  const limity = el('tbody');

  const sekcjaPodgladu = el('div', { hidden: true },
    el('p', { class: 'bs-eyebrow wpis-sekcja', text: 'LinkedIn: co widać przed „…więcej”' }),
    el('div', { class: 'wpis-podglady' }, karty.map((k) => k.el)),
    el('p', { class: 'bs-eyebrow wpis-sekcja', text: 'X' }),
    pole('Próg', progX),
    xLiczba,
    el('div', { class: 'wpis-x-tor' }, xPasek),
    xTekst, xOpis,
    el('p', { class: 'bs-eyebrow wpis-sekcja', text: 'Limity długości' }),
    el('table', { class: 'tabela wpis-limity' },
      el('thead', {}, el('tr', {}, el('th', { text: 'Kanał' }), el('th', { text: 'Limit' }), el('th', { text: 'Ten wpis' }), el('th', { text: '' }))),
      limity),
    el('p', { class: 'bs-small', text: 'LinkedIn nie podaje, gdzie ucina wpis. Podgląd zakłada 3 linijki, czyli zwykle ok. 140 znaków w telefonie i ok. 210 na komputerze. Szerokość linijki zależy też od czcionki telefonu, więc po publikacji rzuć okiem na wpis.' }));

  function rysujKarte(k, g, ciecie) {
    if (ciecie === null || k.rozwiniety) {
      k.tekst.replaceChildren(g.join(''));
      if (ciecie !== null) k.tekst.append(' ', el('button', { type: 'button', class: 'wpis-wiecej', text: 'zwiń', onclick: () => { k.rozwiniety = false; odswiez(); } }));
    } else {
      k.tekst.replaceChildren(g.slice(0, ciecie).join('').trimEnd(),
        el('button', { type: 'button', class: 'wpis-wiecej', text: WIECEJ, onclick: () => { k.rozwiniety = true; odswiez(); } }));
    }
  }

  function odswiez() {
    const tekst = pisz.value.trim();
    const s = statystyki(tekst);
    licznik.textContent = tekst ? [odmiana(s.znaki, 'znak', 'znaki', 'znaków'), odmiana(s.slowa, 'słowo', 'słowa', 'słów'), odmiana(s.akapity, 'akapit', 'akapity', 'akapitów')].join(' · ') : '';
    sekcjaPodgladu.hidden = !tekst;
    pusto.hidden = !!tekst;
    kopiuj.disabled = !tekst;
    if (!tekst) return;

    // LinkedIn: mierzenie wymaga widocznej strony (ukryta sekcja ma zerową wysokość).
    const g = grafemy(tekst);
    if (miernikiKorzen.offsetParent !== null) {
      const zdanie = grafemy(pierwszeZdanie(tekst)).length;
      for (const k of karty) {
        const ciecie = ciecieLinkedIn(k.miernik, g, k.linijki);
        rysujKarte(k, g, ciecie);
        if (ciecie === null) k.opis.textContent = `Widać cały wpis, bez „…więcej”.`;
        else k.opis.textContent = `Przed „…więcej” widać ${ciecie} z ${g.length} znaków. `
          + (zdanie <= ciecie ? 'Pierwsze zdanie mieści się w całości.' : `Pierwsze zdanie (${zdanie} znaków) urywa się.`);
      }
    }

    // X: waga, pasek i podświetlenie tego, co wychodzi poza próg.
    const prog = Number(progX.wartosc);
    const x = liczX(tekst, [prog, X_LIMIT]);
    const [ponadProg, ponadX] = x.ciecia;
    xLiczba.replaceChildren(el('span', { class: 'bs-mono', text: String(x.waga) }), ` z ${prog}`,
      x.waga <= prog ? `, zostało ${prog - x.waga}` : `, za długi o ${x.waga - prog}`);
    xPasek.style.width = `${Math.min(1, x.waga / X_LIMIT) * 100}%`;
    xPasek.className = 'wpis-x-pasek' + (x.waga > X_LIMIT ? ' za-dlugi' : x.waga > prog ? ' blisko' : '');
    xTekst.hidden = ponadProg === null;
    if (ponadProg !== null) {
      const czesci = [x.tekst.slice(0, ponadProg)];
      if (ponadX !== null && ponadX > ponadProg) czesci.push(el('mark', { text: x.tekst.slice(ponadProg, ponadX) }), el('mark', { class: 'ponad-x', text: x.tekst.slice(ponadX) }));
      else czesci.push(el('mark', { class: ponadX !== null ? 'ponad-x' : '', text: x.tekst.slice(ponadProg) }));
      xTekst.replaceChildren(...czesci);
    }
    xOpis.textContent = 'X liczy po swojemu: polskie litery i „cudzysłowy” jako 1, emoji, wielokropek „…” i strzałki jako 2, każdy link jako 23'
      + (x.linki ? ` (w tym wpisie ${odmiana(x.linki, 'link', 'linki', 'linków')})` : '') + '.';

    limity.replaceChildren(...[
      ['LinkedIn', 3000, s.znaki],
      ['X', X_LIMIT, x.waga],
      ['Instagram', 2200, s.znaki],
    ].map(([kanal, limit, ile]) => el('tr', {},
      el('td', { text: kanal }),
      el('td', { class: 'bs-mono', text: limit.toLocaleString('pl-PL') }),
      el('td', { class: 'bs-mono', text: ile.toLocaleString('pl-PL') }),
      el('td', { class: ile > limit ? 'wpis-za-dlugi' : 'wpis-miesci', text: ile > limit ? `za długi o ${(ile - limit).toLocaleString('pl-PL')}` : 'mieści się' }))));
  }

  let klatka = 0, zapis = 0;
  pisz.addEventListener('input', () => {
    for (const k of karty) k.rozwiniety = false;
    cancelAnimationFrame(klatka);
    klatka = requestAnimationFrame(odswiez);
    clearTimeout(zapis);
    zapis = setTimeout(() => pamiec.zapisz(pisz.value), 400);
  });
  progX.addEventListener('zmiana', odswiez);
  kopiuj.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(pisz.value.trim()); } catch { pisz.select(); document.execCommand('copy'); }
    kopiuj.textContent = 'Skopiowane';
    setTimeout(() => { kopiuj.textContent = 'Kopiuj tekst'; }, 1500);
  });
  wyczysc.addEventListener('click', () => { pisz.value = ''; pamiec.zapisz(''); odswiez(); pisz.focus(); });

  korzen.append(
    el('div', { class: 'wpis-pole' }, pole('Tekst wpisu', pisz, { szerokie: true })),
    el('div', { class: 'akcje wpis-akcje' }, licznik, kopiuj, wyczysc),
    pusto, sekcjaPodgladu, miernikiKorzen);

  odswiezWidok = odswiez;
  if (document.fonts?.ready) await document.fonts.ready;
  odswiez();
}
