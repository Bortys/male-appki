// § 05 Stół montażowy · strony PDF i zdjęcia jako kafle: kolejność, obrót, usuwanie, łączenie, dzielenie.
// Podgląd rysuje pdf.js, plik wynikowy składa pdf-lib (strony kopiowane bez ponownego kodowania).
import { el, pole, lista, strefa, postep, pobierz, zip, odmiana, naZwyklyObraz, plotnoZ, bezRozszerzenia, opisBledu } from '../wspolne.js';
import { otworzPdf, rysujStrone, wezPdfLib } from '../pdf.js';

const A4 = [595.28, 841.89];

/**
 * Składa PDF z listy stron. strony: [{zrodlo, nr, obrot}], zrodla: Map id → {typ, bajty | obraz}.
 * Strony z jednego pliku kopiowane są jednym wywołaniem, żeby wspólne czcionki i obrazy nie dublowały się.
 */
export async function zlozPdf(strony, zrodla, { zdjecia = 'a4' } = {}) {
  const { PDFDocument, degrees } = await wezPdfLib();
  const wynik = await PDFDocument.create();
  const skopiowane = new Map();
  const wgZrodla = new Map();
  for (const s of strony) {
    if (zrodla.get(s.zrodlo).typ !== 'pdf') continue;
    if (!wgZrodla.has(s.zrodlo)) wgZrodla.set(s.zrodlo, new Set());
    wgZrodla.get(s.zrodlo).add(s.nr);
  }
  for (const [id, numery] of wgZrodla) {
    let dokument;
    try {
      dokument = await PDFDocument.load(zrodla.get(id).bajty, { updateMetadata: false });
    } catch (e) {
      throw new Error(`Nie da się skopiować stron z „${zrodla.get(id).nazwa}”` + (/encrypt/i.test(String(e?.message)) ? ': plik jest zabezpieczony hasłem.' : '.'));
    }
    const lista = [...numery];
    const kopie = await wynik.copyPages(dokument, lista);
    lista.forEach((nr, i) => skopiowane.set(`${id}:${nr}`, kopie[i]));
  }
  for (const s of strony) {
    const z = zrodla.get(s.zrodlo);
    let strona;
    if (z.typ === 'pdf') {
      strona = wynik.addPage(skopiowane.get(`${s.zrodlo}:${s.nr}`));
      if (s.obrot) strona.setRotation(degrees((strona.getRotation().angle + s.obrot) % 360));
    } else {
      const bajty = new Uint8Array(await z.obraz.arrayBuffer());
      const obraz = z.obraz.type === 'image/png' ? await wynik.embedPng(bajty) : await wynik.embedJpg(bajty);
      const w = obraz.width, h = obraz.height;
      if (zdjecia === 'a4') {
        const [SW, SH] = h >= w ? A4 : [A4[1], A4[0]];
        const margines = 28;
        const skala = Math.min((SW - 2 * margines) / w, (SH - 2 * margines) / h);
        strona = wynik.addPage([SW, SH]);
        strona.drawImage(obraz, { x: (SW - w * skala) / 2, y: (SH - h * skala) / 2, width: w * skala, height: h * skala });
      } else {
        const skala = A4[1] / Math.max(w, h);       // dłuższy bok jak w A4, proporcje zdjęcia
        strona = wynik.addPage([w * skala, h * skala]);
        strona.drawImage(obraz, { x: 0, y: 0, width: w * skala, height: h * skala });
      }
      if (s.obrot) strona.setRotation(degrees(s.obrot));
    }
  }
  return wynik.save();
}

export async function start(korzen) {
  const zrodla = new Map();
  let strony = [];           // {id, zrodlo, nr, obrot, zazn, li, ramka}
  let licznik = 0;
  let ciagniety = null;

  const kafle = el('ul', { class: 'kafle' });
  const stan = postep();
  const zdjecia = lista([['a4', 'na stronie A4, z marginesem'], ['zdjecie', 'strona w proporcjach zdjęcia']], 'a4');
  const nazwa = el('input', { type: 'text', value: 'dokument' });
  const podsumowanie = el('p', { class: 'podpis' });
  const robocze = el('div', { hidden: true });

  function odswiez() {
    kafle.replaceChildren(...strony.map((s) => s.li));
    strony.forEach((s, i) => {
      s.li.querySelector('.numer').textContent = String(i + 1);
      s.li.classList.toggle('zaznaczony', s.zazn);
      s.ramka.firstElementChild.style.transform = s.obrot ? `rotate(${s.obrot}deg)` : '';
    });
    const zazn = strony.filter((s) => s.zazn).length;
    podsumowanie.textContent = strony.length
      ? `Stron: ${strony.length}` + (zazn ? ` · zaznaczone: ${zazn}` : '') + '. Przeciągnij kafel, żeby zmienić kolejność. Kliknij miniaturę, żeby zaznaczyć stronę.'
      : '';
    robocze.hidden = strony.length === 0;
    for (const p of robocze.querySelectorAll('[data-wymaga-zaznaczenia]')) p.disabled = zazn === 0;
  }

  function przesun(s, o) {
    const i = strony.indexOf(s), j = i + o;
    if (j < 0 || j >= strony.length) return;
    strony.splice(i, 1);
    strony.splice(j, 0, s);
    odswiez();
  }

  function nowyKafel(s, opis) {
    s.ramka = el('div', { class: 'kafel-ramka', title: 'Kliknij, żeby zaznaczyć' }, el('canvas', { width: 10, height: 10 }));
    s.ramka.addEventListener('click', () => { s.zazn = !s.zazn; odswiez(); });
    s.li = el('li', { class: 'kafel uchwyt', draggable: true },
      s.ramka,
      el('div', { class: 'kafel-opis' }, el('span', { class: 'bs-mono numer' }), ' · ', opis),
      el('div', { class: 'kafel-akcje' },
        el('button', { type: 'button', title: 'W lewo', 'aria-label': 'Przesuń w lewo', text: '←', onclick: () => przesun(s, -1) }),
        el('button', { type: 'button', title: 'W prawo', 'aria-label': 'Przesuń w prawo', text: '→', onclick: () => przesun(s, 1) }),
        el('button', { type: 'button', title: 'Obróć o 90°', 'aria-label': 'Obróć', text: '↻', onclick: () => { s.obrot = (s.obrot + 90) % 360; odswiez(); } }),
        el('button', { type: 'button', title: 'Usuń stronę', 'aria-label': 'Usuń', text: '×', onclick: () => { strony = strony.filter((x) => x !== s); odswiez(); } })));
    s.li.addEventListener('dragstart', (z) => { ciagniety = s; s.li.classList.add('przeciagany'); z.dataTransfer.effectAllowed = 'move'; z.dataTransfer.setData('text/plain', String(s.id)); });
    s.li.addEventListener('dragend', () => { ciagniety = null; s.li.classList.remove('przeciagany'); for (const x of strony) x.li.classList.remove('cel'); });
    s.li.addEventListener('dragover', (z) => { if (ciagniety && ciagniety !== s) { z.preventDefault(); s.li.classList.add('cel'); } });
    s.li.addEventListener('dragleave', () => s.li.classList.remove('cel'));
    s.li.addEventListener('drop', (z) => {
      if (!ciagniety || ciagniety === s) return;
      z.preventDefault();
      z.stopPropagation();
      const r = s.li.getBoundingClientRect();
      const za = z.clientX > r.left + r.width / 2;
      const ruchomy = ciagniety;
      strony = strony.filter((x) => x !== ruchomy);
      strony.splice(strony.indexOf(s) + (za ? 1 : 0), 0, ruchomy);
      odswiez();
    });
    return s;
  }

  function wstawMiniature(s, plotno) {
    s.ramka.replaceChildren(plotno);
    plotno.style.transform = s.obrot ? `rotate(${s.obrot}deg)` : '';
  }

  async function dodaj(pliki) {
    let nr = 0;
    for (const plik of pliki) {
      nr++;
      stan.ustaw(`Wczytuję ${nr} z ${pliki.length}: ${plik.name}`, (nr - 1) / pliki.length);
      try {
        const id = ++licznik;
        const krotka = bezRozszerzenia(plik.name).slice(0, 22);
        const bajty = new Uint8Array(await plik.arrayBuffer());
        if (String.fromCharCode(...bajty.subarray(0, 5)) === '%PDF-') {
          const dokument = await otworzPdf(bajty);
          zrodla.set(id, { typ: 'pdf', nazwa: plik.name, bajty });
          const nowe = [];
          for (let i = 0; i < dokument.numPages; i++) nowe.push(nowyKafel({ id: `${id}:${i}`, zrodlo: id, nr: i, obrot: 0, zazn: false }, `${krotka}, s. ${i + 1}`));
          strony.push(...nowe);
          odswiez();
          for (const s of nowe) {
            stan.ustaw(`Rysuję miniatury: ${plik.name}, strona ${s.nr + 1} z ${dokument.numPages}`, s.nr / dokument.numPages);
            const strona = await dokument.getPage(s.nr + 1);
            wstawMiniature(s, await rysujStrone(strona, { szerokosc: 260 }));
            strona.cleanup();
          }
          dokument.destroy();
        } else {
          const obraz = await naZwyklyObraz(plik);
          const bitmapa = await createImageBitmap(obraz);
          zrodla.set(id, { typ: 'obraz', nazwa: plik.name, obraz });
          const s = nowyKafel({ id: `${id}:0`, zrodlo: id, nr: 0, obrot: 0, zazn: false }, krotka);
          const skala = 260 / Math.max(bitmapa.width, bitmapa.height);
          strony.push(s);
          odswiez();
          wstawMiniature(s, plotnoZ(bitmapa, bitmapa.width * skala, bitmapa.height * skala));
          bitmapa.close?.();
        }
      } catch (e) {
        stan.blad(`${plik.name}: ${opisBledu(e)}`);
        await new Promise((r) => setTimeout(r, 2500));
      }
    }
    stan.ukryj();
    odswiez();
  }

  async function zapisz(wybrane, sufiks = '') {
    if (!wybrane.length) return;
    stan.ustaw(`Składam PDF (${odmiana(wybrane.length, 'strona', 'strony', 'stron')})…`);
    try {
      const bajty = await zlozPdf(wybrane, zrodla, { zdjecia: zdjecia.value });
      pobierz(new Blob([bajty], { type: 'application/pdf' }), `${nazwa.value.trim() || 'dokument'}${sufiks}.pdf`);
      stan.ukryj();
    } catch (e) {
      stan.blad(opisBledu(e));
    }
  }

  async function osobno() {
    const baza = nazwa.value.trim() || 'dokument';
    try {
      const pliki = [];
      for (let i = 0; i < strony.length; i++) {
        stan.ustaw(`Zapisuję stronę ${i + 1} z ${strony.length}…`, i / strony.length);
        const bajty = await zlozPdf([strony[i]], zrodla, { zdjecia: zdjecia.value });
        pliki.push({ nazwa: `${baza}-${String(i + 1).padStart(2, '0')}.pdf`, blob: new Blob([bajty], { type: 'application/pdf' }) });
      }
      pobierz(await zip(pliki), `${baza}-strony.zip`);
      stan.ukryj();
    } catch (e) {
      stan.blad(opisBledu(e));
    }
  }

  robocze.append(
    podsumowanie,
    kafle,
    el('div', { class: 'opcje' }, pole('Nazwa pliku', nazwa), pole('Zdjęcia w PDF-ie', zdjecia)),
    el('div', { class: 'akcje' },
      el('button', { type: 'button', class: 'przycisk', text: 'Zapisz jako jeden PDF', onclick: () => zapisz(strony) }),
      el('button', { type: 'button', class: 'przycisk przycisk-cichy', text: 'Zapisz tylko zaznaczone', dataset: { wymagaZaznaczenia: '1' }, onclick: () => zapisz(strony.filter((s) => s.zazn), '-wybrane') }),
      el('button', { type: 'button', class: 'przycisk przycisk-cichy', text: 'Każda strona osobno (ZIP)', onclick: osobno })),
    el('div', { class: 'akcje' },
      el('button', { type: 'button', class: 'link', text: 'Zaznacz wszystkie', onclick: () => { strony.forEach((s) => { s.zazn = true; }); odswiez(); } }),
      el('button', { type: 'button', class: 'link', text: 'Odznacz', onclick: () => { strony.forEach((s) => { s.zazn = false; }); odswiez(); } }),
      el('button', { type: 'button', class: 'link', text: 'Usuń zaznaczone', dataset: { wymagaZaznaczenia: '1' }, onclick: () => { strony = strony.filter((s) => !s.zazn); odswiez(); } }),
      el('button', { type: 'button', class: 'link', text: 'Wyczyść stół', onclick: () => { strony = []; zrodla.clear(); odswiez(); } })));

  korzen.append(
    strefa({ tytul: 'Upuść pliki PDF i zdjęcia albo kliknij, żeby wybrać', opis: 'Kolejne pliki dokładają się na koniec stołu. Zdjęcia (JPG, PNG, HEIC) stają się stronami.', accept: 'application/pdf,.pdf,image/*,.heic,.heif', wiele: true, naPliki: dodaj }),
    stan.el, robocze);
}
