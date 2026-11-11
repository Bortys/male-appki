// § 07 PDF z tekstem · zdjęcia kartek i skany jako PDF z warstwą tekstu (OCR po polsku).
// Tesseract (WebAssembly) rozpoznaje tekst i oddaje niewidzialną warstwę; stronę z obrazem
// składa pdf-lib, więc plik ma rozmiar zwykłego JPG-a.
import { el, pole, lista, wybor, strefa, postep, listaWynikow, rozmiar, odmiana, naBitmape, naBlob, nowePlotno, plotnoZ, bezRozszerzenia, LIB, opisBledu } from '../wspolne.js';
import { otworzPdf, rysujStrone, wezPdfLib } from '../pdf.js';

const MAKS_BOK = 2800;       // px; więcej nie poprawia rozpoznawania, a spowalnia
const A4_DLUGI = 841.89;

/** Skala szarości i rozciągnięcie kontrastu (między 2. a 98. percentylem jasności). Zmienia płótno w miejscu. */
export function trybDokumentu(plotno) {
  const k = plotno.getContext('2d', { willReadFrequently: true });
  const obraz = k.getImageData(0, 0, plotno.width, plotno.height);
  const d = obraz.data;
  const histogram = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) {
    const j = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
    d[i] = j;
    histogram[j]++;
  }
  const pikseli = d.length / 4;
  const percentyl = (ulamek) => { let suma = 0; for (let j = 0; j < 256; j++) { suma += histogram[j]; if (suma >= pikseli * ulamek) return j; } return 255; };
  // Biel to jasność papieru (większość pikseli), czerń to najciemniejszy tusz. Na kartce z małą
  // ilością tekstu ciemnych pikseli jest poniżej procenta, dlatego czerń ma górną granicę:
  // inaczej szum tła zamieniłby się w czarne plamki.
  const gora = percentyl(0.75);
  const dol = Math.min(percentyl(0.005), Math.round(gora * 0.45));
  // kartka ma być biała: wszystko powyżej 92% zakresu idzie w biel
  const zakres = Math.max(1, (gora - dol) * 0.92);
  const tablica = new Uint8ClampedArray(256);
  for (let j = 0; j < 256; j++) tablica[j] = ((j - dol) / zakres) * 255;
  for (let i = 0; i < d.length; i += 4) { const j = tablica[d[i]]; d[i] = j; d[i + 1] = j; d[i + 2] = j; }
  k.putImageData(obraz, 0, 0);
  return plotno;
}

let silnik = null;       // { jezyki, robotnik, naPostep }
async function wezSilnik(jezyki, naStan) {
  if (silnik && silnik.jezyki === jezyki) { silnik.naStan = naStan; return silnik.robotnik; }
  if (silnik) { await silnik.robotnik.terminate(); silnik = null; }
  const { default: Tesseract } = await import(`${LIB}tesseract/tesseract.esm.min.js`);
  const stan = { jezyki, naStan };
  stan.robotnik = await Tesseract.createWorker(jezyki.split('+'), 1, {
    workerPath: `${LIB}tesseract/worker.min.js`,
    corePath: `${LIB}tesseract/rdzen/`,
    langPath: `${LIB}tesseract/jezyki/`,
    workerBlobURL: false,
    gzip: true,
    logger: (m) => stan.naStan?.(m),
  });
  silnik = stan;
  return stan.robotnik;
}

export async function start(korzen) {
  const jezyki = lista([['pol', 'polski'], ['pol+eng', 'polski i angielski'], ['eng', 'angielski']], 'pol');
  const kontrast = wybor('Tryb dokumentu: skala szarości i mocniejszy kontrast', true, '(dla zdjęć kartek)');
  const stan = postep();
  const wyniki = listaWynikow({ nazwaZip: 'pdf-z-tekstem.zip' });

  /** Zamienia pliki na listę płócien: każde zdjęcie i każda strona PDF to jedna strona wyniku. */
  async function* strony(pliki) {
    for (const plik of pliki) {
      const bajty = new Uint8Array(await plik.arrayBuffer());
      if (String.fromCharCode(...bajty.subarray(0, 5)) === '%PDF-') {
        const dokument = await otworzPdf(bajty);
        for (let i = 1; i <= dokument.numPages; i++) {
          const strona = await dokument.getPage(i);
          const widok = strona.getViewport({ scale: 1 });
          const plotno = await rysujStrone(strona, { skala: MAKS_BOK / Math.max(widok.width, widok.height) });
          strona.cleanup();
          yield { plotno, opis: `${plik.name}, strona ${i} z ${dokument.numPages}` };
        }
        dokument.destroy();
      } else {
        const bitmapa = await naBitmape(plik, { bok: MAKS_BOK });
        const skala = Math.min(1, MAKS_BOK / Math.max(bitmapa.width, bitmapa.height));
        const plotno = plotnoZ(bitmapa, bitmapa.width * skala, bitmapa.height * skala);
        bitmapa.close?.();
        yield { plotno, opis: plik.name };
      }
    }
  }

  async function przerob(pliki) {
    const baza = bezRozszerzenia(pliki[0].name) + (pliki.length > 1 ? `-i-${pliki.length - 1}-kolejne` : '');
    let etap = '';
    try {
      stan.ustaw('Uruchamiam rozpoznawanie tekstu (pierwszy raz wczytuje się kilka megabajtów)…');
      const robotnik = await wezSilnik(jezyki.value, (m) => {
        if (m.status === 'recognizing text') stan.ustaw(`${etap}: rozpoznaję tekst`, m.progress);
      });
      const { PDFDocument } = await wezPdfLib();
      const wynik = await PDFDocument.create();
      const teksty = [];
      let nr = 0;
      for await (const { plotno, opis } of strony(pliki)) {
        nr++;
        etap = `Strona ${nr} (${opis})`;
        stan.ustaw(`${etap}: przygotowuję obraz`);
        if (kontrast.pole.checked) trybDokumentu(plotno);
        const jpg = await naBlob(plotno, 'image/jpeg', 0.8);
        // Zakładamy kartkę wielkości A4: rozdzielczość wynika z dłuższego boku obrazu
        await robotnik.setParameters({ user_defined_dpi: String(Math.max(120, Math.round(Math.max(plotno.width, plotno.height) / 11.7))) });
        const { data } = await robotnik.recognize(jpg, { pdfTitle: baza, pdfTextOnly: true }, { text: true, pdf: true });
        teksty.push(data.text.trim());

        const skala = A4_DLUGI / Math.max(plotno.width, plotno.height);
        const W = plotno.width * skala, H = plotno.height * skala;
        const strona = wynik.addPage([W, H]);
        strona.drawImage(await wynik.embedJpg(new Uint8Array(await jpg.arrayBuffer())), { x: 0, y: 0, width: W, height: H });
        if (data.pdf && data.pdf.length) {
          const [warstwa] = await wynik.embedPdf(new Uint8Array(data.pdf), [0]);
          strona.drawPage(warstwa, { x: 0, y: 0, width: W, height: H });
        }
      }
      if (!nr) throw new Error('Nie znalazłem żadnej strony.');
      wynik.setTitle(baza);
      wynik.setProducer('Przybornik (Tesseract, pdf-lib)');
      const pdf = new Blob([await wynik.save()], { type: 'application/pdf' });
      const tekst = teksty.join('\n\n* * *\n\n');
      const slow = tekst.split(/\s+/).filter(Boolean).length;
      wyniki.dodaj({ nazwa: `${baza}-z-tekstem.pdf`, opis: `${odmiana(nr, 'strona', 'strony', 'stron')} · ${rozmiar(pdf.size)} · rozpoznane słowa: ${slow}`, blob: pdf });
      wyniki.dodaj({ nazwa: `${baza}.txt`, opis: 'sam tekst, do wklejenia w notatki', blob: new Blob([tekst], { type: 'text/plain;charset=utf-8' }) });
      stan.ukryj();
    } catch (e) {
      console.error(e);
      stan.blad(opisBledu(e));
    }
  }

  korzen.append(
    el('div', { class: 'opcje' }, pole('Język tekstu', jezyki), pole('Obraz', kontrast)),
    strefa({ tytul: 'Upuść zdjęcia kartek albo skan w PDF-ie', opis: 'Wszystkie pliki z jednego upuszczenia trafiają do jednego PDF-a, w kolejności nazw. Jedna strona to kilka do kilkunastu sekund.', accept: 'image/*,.heic,.heif,application/pdf,.pdf', wiele: true, naPliki: (pliki) => przerob([...pliki].sort((a, b) => a.name.localeCompare(b.name, 'pl', { numeric: true }))) }),
    stan.el, wyniki.el,
    el('div', { class: 'uwaga' }, el('p', { text: 'Najlepiej działa na zdjęciach robionych z góry, przy równym świetle, z tekstem ustawionym poziomo. Zdjęcie leżące bokiem najpierw obróć na Stole montażowym.' })));
}
